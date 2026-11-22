"""
Parent - Teacher messaging.  Mounted at /api/v1/messages

Who can talk to whom is worked out every time from the CURRENT teacher assignments
(class teacher, subject-teacher assignments, timetable):
  * a parent  <-> the class teacher and subject teachers of their child's current class
  * a teacher <-> parents of students in the classes they currently teach
Permissions (Roles & Permissions -> Communication -> Parent-Teacher Messages):
  communication.message_my_child_teachers    parents
  communication.message_my_students_parents  teachers
  communication.parent_messages_oversight    read every conversation (read-only)
  communication.messaging_settings           contact hours, reply target, attachments ...
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_campus import get_current_campus_id
from app.fastapi_permissions import require_permission
from app.utils.access import effective_permissions

router = APIRouter()
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "messages")

P_PARENT, P_TEACHER = "communication.message_my_child_teachers", "communication.message_my_students_parents"
P_OVERSIGHT, P_SETTINGS = "communication.parent_messages_oversight", "communication.messaging_settings"
TOPICS = {"academic", "behaviour", "attendance", "health", "fees", "other"}


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _now(db):
    """The school's 'now' (processing date + current time)."""
    try:
        from app.utils.processing_date import get_processing_datetime
        return get_processing_datetime(db)
    except Exception:
        return datetime.now()


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


# ------------------------------------------------------------------ settings
SETTING_FIELDS = ("enabled", "teachers_can_start", "contact_days", "contact_start", "contact_end", "allow_outside_hours",
                  "reply_target_hours", "edit_window_minutes", "max_attachment_mb", "allowed_file_types")


def _settings(cur, campus_id):
    cur.execute("""SELECT * FROM msg_settings WHERE campus_id = %s OR campus_id IS NULL
                   ORDER BY campus_id NULLS LAST LIMIT 1""", (campus_id,))
    s = dict(cur.fetchone() or {})
    s["contact_start"] = str(s.get("contact_start") or "08:00")[:5]
    s["contact_end"] = str(s.get("contact_end") or "16:00")[:5]
    s["contact_days"] = list(s.get("contact_days") or [1, 2, 3, 4, 5])
    return s


def _within_hours(s, now):
    hm = now.strftime("%H:%M")
    return now.isoweekday() in s["contact_days"] and s["contact_start"] <= hm < s["contact_end"]


# ------------------------------------------------------------------ who teaches whom
def _teacher_user_ids_of_student(cur, student_id):
    """{teacher_user_id: {"name", "roles": ["Class teacher", "Maths", ...]}} for the student's current class."""
    cur.execute("""SELECT t.user_id, u.first_name || ' ' || u.last_name AS name, l.kind, sub.name AS subject
                   FROM students s JOIN v_class_teacher_links l ON l.class_id = s.class_id
                   JOIN teachers t ON t.id = l.teacher_id JOIN users u ON u.id = t.user_id
                   LEFT JOIN subjects sub ON sub.id = l.subject_id
                   WHERE s.id = %s AND t.user_id IS NOT NULL AND COALESCE(u.is_active, TRUE)""", (student_id,))
    out = {}
    for r in cur.fetchall():
        e = out.setdefault(r["user_id"], {"name": r["name"], "roles": []})
        role = "Class teacher" if r["kind"] == "class" else (r["subject"] or "Subject teacher")
        if role not in e["roles"]: e["roles"].append(role)
    for e in out.values():
        e["roles"].sort(key=lambda x: (x != "Class teacher", x))
    return out


def _pair_allowed(cur, student_id, parent_uid, teacher_uid):
    cur.execute("SELECT parent_id, status FROM students WHERE id=%s", (student_id,))
    s = cur.fetchone()
    if not s or s["parent_id"] != parent_uid or (s["status"] or "active") == "withdrawn":
        return False
    return teacher_uid in _teacher_user_ids_of_student(cur, student_id)


# ------------------------------------------------------------------ notifications
_NOTIF_COLS = None


def _notify(cur, user_id, title, text, link):
    """In-app notification (never blocks sending)."""
    global _NOTIF_COLS
    try:
        cur.execute("SAVEPOINT msg_notify")
        if _NOTIF_COLS is None:
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='notifications'")
            _NOTIF_COLS = {r["column_name"] for r in cur.fetchall()}
        cols, vals = ["user_id", "title", "type"], [user_id, title, "info"]
        for c in ("body", "message"):
            if c in _NOTIF_COLS: cols.append(c); vals.append(text)
        if "link" in _NOTIF_COLS: cols.append("link"); vals.append(link)
        cur.execute(f"INSERT INTO notifications ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})", vals)
        cur.execute("RELEASE SAVEPOINT msg_notify")
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT msg_notify")
        print("[messages] notification not sent:", e)


# ------------------------------------------------------------------ access to one conversation
def _load_conv(cur, conv_id, user_id, perms):
    cur.execute("""SELECT c.*, s.first_name || ' ' || s.last_name AS student_name, s.class_id,
                          cl.name || COALESCE(' (' || cl.section || ')', '') AS class_label, cl.academic_year_id AS class_year,
                          pu.first_name || ' ' || pu.last_name AS parent_name, tu.first_name || ' ' || tu.last_name AS teacher_name
                   FROM msg_conversations c JOIN students s ON s.id = c.student_id LEFT JOIN classes cl ON cl.id = s.class_id
                   JOIN users pu ON pu.id = c.parent_user_id JOIN users tu ON tu.id = c.teacher_user_id WHERE c.id = %s""", (conv_id,))
    c = cur.fetchone()
    if not c:
        fail("Conversation not found.", 404)
    c = dict(c)
    cur.execute("SELECT user_id FROM msg_participants WHERE conversation_id=%s", (conv_id,))
    c["members"] = [r["user_id"] for r in cur.fetchall()]                    # staff added on escalation
    participant = user_id in (c["parent_user_id"], c["teacher_user_id"]) or user_id in c["members"]
    if not participant and P_OVERSIGHT not in perms:
        fail("Conversation not found.", 404)
    c["participant"] = participant
    c["past_session"] = c["academic_year_id"] is not None and c["class_year"] != c["academic_year_id"]
    c["read_only"] = (not participant) or c["status"] == "closed" or c["past_session"]
    c["i_am"] = ("parent" if user_id == c["parent_user_id"] else "teacher" if user_id == c["teacher_user_id"]
                 else "staff" if user_id in c["members"] else "oversight")
    return c


def _others(c, user_id):
    return [u for u in {c["parent_user_id"], c["teacher_user_id"], *c["members"]} if u != user_id]


def _event(cur, conv_id, user_id, text):
    """A step shown in the middle of the thread (escalated / resolved / closed / reopened)."""
    cur.execute("INSERT INTO msg_messages (conversation_id, sender_user_id, body, kind) VALUES (%s,%s,%s,'event') RETURNING id", (conv_id, user_id, text))
    mid = cur.fetchone()["id"]
    cur.execute("UPDATE msg_conversations SET last_message_at=now(), last_sender_id=%s, last_preview=%s WHERE id=%s", (user_id, text[:150], conv_id))
    cur.execute("""INSERT INTO msg_reads (conversation_id, user_id, last_read_id) VALUES (%s,%s,%s)
                   ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_id=EXCLUDED.last_read_id, last_read_at=now()""", (conv_id, user_id, mid))
    return mid


def _oversight_users(cur, campus_id):
    """Staff with the oversight permission on this campus; superadmins only when nobody else has it."""
    cur.execute("""SELECT u.id, EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='superadmin') AS sa
                   FROM users u WHERE COALESCE(u.is_active, TRUE) AND (u.campus_id = %s OR u.campus_id IS NULL OR %s IS NULL)
                     AND fn_user_has_permission(u.id, %s)""", (campus_id, campus_id, P_OVERSIGHT))
    rows = cur.fetchall()
    staff = [r["id"] for r in rows if not r["sa"]]
    return staff or [r["id"] for r in rows]


def _name(cur, user_id):
    cur.execute("SELECT first_name || ' ' || last_name AS n FROM users WHERE id=%s", (user_id,))
    r = cur.fetchone(); return r["n"] if r else "Someone"


# ================================================================== endpoints
@router.get("/config")
def config(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    s = _settings(cur, campus_id)
    return ok(data={"settings": s, "within_hours": _within_hours(s, _now(db)),
                    "as_parent": P_PARENT in perms, "as_teacher": P_TEACHER in perms,
                    "oversight": P_OVERSIGHT in perms, "can_configure": P_SETTINGS in perms, "topics": sorted(TOPICS)})


@router.get("/contacts")
def contacts(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """People this user may message: a parent's children with their teachers; a teacher's students with their parents."""
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    data = {"children": [], "students": []}
    if P_PARENT in perms:
        cur.execute("""SELECT s.id, s.first_name || ' ' || s.last_name AS name, cl.name || COALESCE(' (' || cl.section || ')', '') AS class_label
                       FROM students s LEFT JOIN classes cl ON cl.id = s.class_id
                       WHERE s.parent_id = %s AND COALESCE(s.status, 'active') <> 'withdrawn' ORDER BY s.first_name""", (user_id,))
        for ch in cur.fetchall():
            teachers = _teacher_user_ids_of_student(cur, ch["id"])
            data["children"].append({**dict(ch), "teachers": sorted(
                [{"user_id": k, **v} for k, v in teachers.items()], key=lambda t: (t["roles"][0] != "Class teacher", t["name"]))})
    if P_TEACHER in perms:
        s = _settings(cur, campus_id)
        cur.execute("""SELECT DISTINCT s.id AS student_id, s.first_name || ' ' || s.last_name AS student_name,
                              cl.name || COALESCE(' (' || cl.section || ')', '') AS class_label, s.parent_id AS parent_user_id,
                              pu.first_name || ' ' || pu.last_name AS parent_name
                       FROM teachers t JOIN v_class_teacher_links l ON l.teacher_id = t.id
                       JOIN students s ON s.class_id = l.class_id AND COALESCE(s.status, 'active') <> 'withdrawn' AND s.parent_id IS NOT NULL
                       JOIN classes cl ON cl.id = s.class_id JOIN users pu ON pu.id = s.parent_id
                       WHERE t.user_id = %s ORDER BY class_label, student_name""", (user_id,))
        data["students"] = [dict(r) for r in cur.fetchall()]
        data["teachers_can_start"] = bool(s.get("teachers_can_start", True))
    return ok(data=data)


@router.get("/conversations")
def list_conversations(view: str = Query("mine"), waiting: bool = Query(False), q: Optional[str] = Query(None), status: Optional[str] = Query(None),
                       user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    if view == "all" and P_OVERSIGHT not in perms:
        fail("You don't have permission to see all conversations.", 403)
    s = _settings(cur, campus_id)
    where, params = [], []
    if view == "all":
        if campus_id is not None: where.append("c.campus_id = %s"); params.append(campus_id)
    else:
        where.append("(c.parent_user_id = %s OR c.teacher_user_id = %s OR EXISTS (SELECT 1 FROM msg_participants mp WHERE mp.conversation_id = c.id AND mp.user_id = %s))")
        params += [user_id, user_id, user_id]
    if status in ("open", "escalated", "closed"):
        where.append("c.status = %s"); params.append(status)
    if q:
        where.append("(lower(s.first_name || ' ' || s.last_name) LIKE %s OR lower(pu.first_name || ' ' || pu.last_name) LIKE %s OR lower(tu.first_name || ' ' || tu.last_name) LIKE %s)")
        params += ["%" + q.lower().strip() + "%"] * 3
    cur.execute(f"""SELECT c.id, c.student_id, c.status, c.last_message_at, c.last_preview, c.last_sender_id, c.parent_user_id, c.teacher_user_id,
                           s.first_name || ' ' || s.last_name AS student_name, cl.name || COALESCE(' (' || cl.section || ')', '') AS class_label,
                           pu.first_name || ' ' || pu.last_name AS parent_name, tu.first_name || ' ' || tu.last_name AS teacher_name,
                           (SELECT COUNT(*) FROM msg_messages m WHERE m.conversation_id = c.id AND m.sender_user_id <> %s
                              AND m.id > COALESCE((SELECT r.last_read_id FROM msg_reads r WHERE r.conversation_id = c.id AND r.user_id = %s), 0)) AS unread
                    FROM msg_conversations c JOIN students s ON s.id = c.student_id LEFT JOIN classes cl ON cl.id = s.class_id
                    JOIN users pu ON pu.id = c.parent_user_id JOIN users tu ON tu.id = c.teacher_user_id
                    {"WHERE " + " AND ".join(where) if where else ""}
                    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC LIMIT 300""", [user_id, user_id] + params)
    now = _now(db); target = timedelta(hours=int(s.get("reply_target_hours") or 48))
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        # waiting for the teacher's reply longer than the target
        d["waiting"] = bool(d["last_sender_id"] == d["parent_user_id"] and d["last_message_at"]
                            and now.replace(tzinfo=None) - d["last_message_at"].replace(tzinfo=None) > target)
        if view != "all":
            d["i_am"] = "parent" if user_id == d["parent_user_id"] else "teacher" if user_id == d["teacher_user_id"] else "staff"
            d["with_name"] = {"parent": d["teacher_name"], "teacher": d["parent_name"]}.get(d["i_am"], f"{d['parent_name']} \u2194 {d['teacher_name']}")
        d["last_message_at"] = _iso(d["last_message_at"])
        if not waiting or d["waiting"]:
            rows.append(d)
    return ok(data=rows)


class StartIn(BaseModel):
    student_id: int
    with_user_id: int            # the teacher (for a parent) or the parent (for a teacher)


@router.post("/conversations")
def start_conversation(body: StartIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Open (or return the existing) conversation between a parent and a teacher about one child."""
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    cur.execute("SELECT s.campus_id, cl.academic_year_id FROM students s LEFT JOIN classes cl ON cl.id = s.class_id WHERE s.id=%s", (body.student_id,))
    st = cur.fetchone()
    if not st: fail("Student not found.", 404)
    s = _settings(cur, st["campus_id"])
    if not s.get("enabled", True): fail("Messaging is turned off for this campus.", 409)
    if P_PARENT in perms and _pair_allowed(cur, body.student_id, user_id, body.with_user_id):
        parent_uid, teacher_uid = user_id, body.with_user_id
    elif P_TEACHER in perms and _pair_allowed(cur, body.student_id, body.with_user_id, user_id):
        if not s.get("teachers_can_start", True):
            fail("Teachers can reply to parents, but starting a conversation is turned off.", 409)
        parent_uid, teacher_uid = body.with_user_id, user_id
    else:
        fail("You can only message your own child's current teachers, or the parents of students you teach.", 403)
    cur.execute("""INSERT INTO msg_conversations (campus_id, academic_year_id, student_id, parent_user_id, teacher_user_id, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (student_id, parent_user_id, teacher_user_id, academic_year_id) DO UPDATE SET status = msg_conversations.status
                   RETURNING id""", (st["campus_id"], st["academic_year_id"], body.student_id, parent_uid, teacher_uid, user_id))
    cid = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": cid})


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, conv_id, user_id, perms)
    cur.execute("""SELECT m.id, m.sender_user_id, m.body, m.topic, m.sent_outside_hours, m.created_at, m.edited_at, m.kind,
                          EXISTS (SELECT 1 FROM msg_reports rp WHERE rp.message_id = m.id AND rp.reported_by = %s) AS reported_by_me,
                          u.first_name || ' ' || u.last_name AS sender_name,
                          COALESCE((SELECT json_agg(json_build_object('id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes) ORDER BY a.id)
                                    FROM msg_attachments a WHERE a.message_id = m.id), '[]') AS attachments
                   FROM msg_messages m JOIN users u ON u.id = m.sender_user_id WHERE m.conversation_id = %s ORDER BY m.id""", (user_id, conv_id))
    msgs = [{**dict(r), "created_at": _iso(r["created_at"]), "edited_at": _iso(r["edited_at"])} for r in cur.fetchall()]
    other = c["teacher_user_id"] if user_id == c["parent_user_id"] else c["parent_user_id"]
    cur.execute("SELECT last_read_id FROM msg_reads WHERE conversation_id=%s AND user_id=%s", (conv_id, other))
    r = cur.fetchone(); other_read = r["last_read_id"] if r else 0
    if c["participant"] and msgs:                                    # opening it marks it read
        cur.execute("""INSERT INTO msg_reads (conversation_id, user_id, last_read_id, last_read_at) VALUES (%s,%s,%s, now())
                       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_id = GREATEST(msg_reads.last_read_id, EXCLUDED.last_read_id), last_read_at = now()""",
                    (conv_id, user_id, msgs[-1]["id"]))
        db.commit()
    s = _settings(cur, c["campus_id"])
    for m in msgs:
        m["mine"] = m["sender_user_id"] == user_id
        m["seen"] = m["mine"] and m["id"] <= other_read
    teachers = _teacher_user_ids_of_student(cur, c["student_id"])
    cur.execute("SELECT u.first_name || ' ' || u.last_name AS n FROM users u WHERE u.id = ANY(%s) ORDER BY 1", (c["members"] or [0],))
    c["member_names"] = [r["n"] for r in cur.fetchall()]
    c["can"] = {"escalate": c["i_am"] in ("parent", "teacher") and c["status"] == "open" and not c["past_session"],
                "resolve": c["status"] == "escalated" and (c["i_am"] == "staff" or P_OVERSIGHT in perms),
                "close": c["status"] != "closed" and not c["past_session"] and (c["i_am"] in ("teacher", "staff") or P_OVERSIGHT in perms),
                "reopen": c["status"] == "closed" and not c["past_session"] and c["i_am"] in ("parent", "teacher"),
                "report": c["participant"]}
    return ok(data={"conversation": {k: _iso(v) for k, v in c.items()},
                    "teacher_roles": (teachers.get(c["teacher_user_id"]) or {}).get("roles", []),
                    "messages": msgs, "settings": {k: s[k] for k in ("edit_window_minutes", "max_attachment_mb", "allowed_file_types",
                                                                       "allow_outside_hours", "contact_start", "contact_end", "contact_days")}})


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: int, body: str = Form(""), topic: Optional[str] = Form(None), files: List[UploadFile] = File(default=[]),
                       user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, conv_id, user_id, perms)
    if not c["participant"]: fail("Only the people in this conversation can write here.", 403)
    if c["past_session"]: fail("This conversation is from a past session and is kept as read-only history.", 409)
    if c["status"] == "closed": fail("This conversation is closed. Reopen it to write again.", 409)
    need = {"parent": P_PARENT, "teacher": P_TEACHER, "staff": P_OVERSIGHT}[c["i_am"]]
    if need not in perms: fail("You don't have permission to send messages.", 403)
    if not _pair_allowed(cur, c["student_id"], c["parent_user_id"], c["teacher_user_id"]):
        fail("This teacher no longer teaches this child, so the conversation is read-only.", 409)
    s = _settings(cur, c["campus_id"])
    if not s.get("enabled", True): fail("Messaging is turned off for this campus.", 409)
    text = (body or "").strip()
    files = [f for f in (files or []) if f and f.filename]
    if not text and not files: fail("Write a message or attach a file.")
    if len(text) > 4000: fail("Messages can be up to 4,000 characters.")
    if topic and topic not in TOPICS: topic = "other"
    now = _now(db); outside = not _within_hours(s, now)
    if outside and user_id == c["parent_user_id"] and not s.get("allow_outside_hours", True):
        fail(f"Messages can be sent between {s['contact_start']} and {s['contact_end']} on school days.", 409)
    allowed = {x.strip().lower() for x in (s.get("allowed_file_types") or "").split(",") if x.strip()}
    max_bytes = int(s.get("max_attachment_mb") or 5) * 1024 * 1024
    stored = []
    for f in files[:5]:
        ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
        if ext not in allowed: fail(f"Files of type .{ext or '?'} can't be attached. Allowed: {', '.join(sorted(allowed))}.")
        data = await f.read()
        if len(data) > max_bytes: fail(f"'{f.filename}' is larger than {s['max_attachment_mb']} MB.")
        stored.append((f.filename, uuid.uuid4().hex + "." + ext, f.content_type, data))
    cur.execute("""INSERT INTO msg_messages (conversation_id, sender_user_id, body, topic, sent_outside_hours)
                   VALUES (%s,%s,%s,%s,%s) RETURNING id""", (conv_id, user_id, text, topic, outside))
    mid = cur.fetchone()["id"]
    if stored:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        for name, sname, mime, data in stored:
            with open(os.path.join(UPLOAD_DIR, sname), "wb") as fh: fh.write(data)
            cur.execute("INSERT INTO msg_attachments (message_id, file_name, stored_name, mime_type, size_bytes) VALUES (%s,%s,%s,%s,%s)",
                        (mid, name, sname, mime, len(data)))
    preview = text[:150] if text else ("Attachment: " + stored[0][0])[:150]
    cur.execute("UPDATE msg_conversations SET last_message_at = now(), last_sender_id = %s, last_preview = %s WHERE id = %s", (user_id, preview, conv_id))
    cur.execute("""INSERT INTO msg_reads (conversation_id, user_id, last_read_id) VALUES (%s,%s,%s)
                   ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_id = EXCLUDED.last_read_id, last_read_at = now()""", (conv_id, user_id, mid))
    who = _name(cur, user_id)
    for to in _others(c, user_id):
        _notify(cur, to, f"New message from {who}", f"About {c['student_name']}: {preview[:100]}", f"/messages?c={conv_id}")
    db.commit()
    msg = "Sent."
    if outside and user_id == c["parent_user_id"]:
        msg = f"Sent. {c['teacher_name']} usually replies during school hours ({s['contact_start']}-{s['contact_end']})."
    return ok(data={"id": mid, "outside_hours": outside}, message=msg)


class EditIn(BaseModel):
    body: str


@router.put("/messages/{msg_id}")
def edit_message(msg_id: int, body: EditIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT m.*, c.campus_id FROM msg_messages m JOIN msg_conversations c ON c.id = m.conversation_id WHERE m.id=%s""", (msg_id,))
    m = cur.fetchone()
    if not m or m["sender_user_id"] != user_id: fail("Message not found.", 404)
    s = _settings(cur, m["campus_id"])
    cur.execute("SELECT now() - %s > make_interval(mins => %s) AS late", (m["created_at"], int(s.get("edit_window_minutes") or 5)))
    if cur.fetchone()["late"]: fail(f"Messages can only be edited within {s['edit_window_minutes']} minutes of sending.", 409)
    text = (body.body or "").strip()
    if not text: fail("The message can't be empty.")
    cur.execute("UPDATE msg_messages SET body=%s, edited_at=now() WHERE id=%s", (text, msg_id))
    db.commit()
    return ok(message="Message updated.")


@router.get("/attachments/{att_id}")
def download_attachment(att_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT a.*, m.conversation_id FROM msg_attachments a JOIN msg_messages m ON m.id = a.message_id WHERE a.id=%s", (att_id,))
    a = cur.fetchone()
    if not a: fail("File not found.", 404)
    _load_conv(cur, a["conversation_id"], user_id, set(effective_permissions(cur, user_id)))     # access check
    path = os.path.join(UPLOAD_DIR, a["stored_name"])
    if not os.path.exists(path): fail("File not found on the server.", 404)
    return FileResponse(path, filename=a["file_name"], media_type=a["mime_type"] or "application/octet-stream")


@router.get("/unread-count")
def unread_count(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT COUNT(*) AS n FROM msg_messages m JOIN msg_conversations c ON c.id = m.conversation_id
                   WHERE (c.parent_user_id = %s OR c.teacher_user_id = %s
                          OR EXISTS (SELECT 1 FROM msg_participants mp WHERE mp.conversation_id = c.id AND mp.user_id = %s))
                     AND m.sender_user_id <> %s
                     AND m.id > COALESCE((SELECT r.last_read_id FROM msg_reads r WHERE r.conversation_id = c.id AND r.user_id = %s), 0)""",
                (user_id, user_id, user_id, user_id, user_id))
    return ok(data={"count": cur.fetchone()["n"]})


# ------------------------------------------------------------------ settings
class SettingsIn(BaseModel):
    enabled: bool = True
    teachers_can_start: bool = True
    contact_days: List[int] = [1, 2, 3, 4, 5]
    contact_start: str = "08:00"
    contact_end: str = "16:00"
    allow_outside_hours: bool = True
    reply_target_hours: int = 48
    edit_window_minutes: int = 5
    max_attachment_mb: int = 5
    allowed_file_types: str = "jpg,jpeg,png,pdf,doc,docx"


@router.get("/settings")
def get_settings(user_id: int = Depends(require_permission(P_SETTINGS)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    return ok(data={**_settings(cur, campus_id), "scope": "campus" if campus_id is not None else "school-wide default"})


@router.put("/settings")
def save_settings(body: SettingsIn, user_id: int = Depends(require_permission(P_SETTINGS)), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    import re
    if not all(re.match(r"^\d{2}:\d{2}$", t) for t in (body.contact_start, body.contact_end)) or body.contact_start >= body.contact_end:
        fail("Contact hours: give a start and an end time (HH:MM), with the end after the start.")
    days = sorted({d for d in body.contact_days if 1 <= d <= 7})
    if not days: fail("Choose at least one contact day.")
    if not (1 <= body.reply_target_hours <= 720): fail("Reply target: between 1 and 720 hours.")
    if not (0 <= body.edit_window_minutes <= 1440): fail("Edit window: between 0 and 1440 minutes.")
    if not (1 <= body.max_attachment_mb <= 50): fail("Attachment size: between 1 and 50 MB.")
    types = ",".join(sorted({t.strip().lower().lstrip(".") for t in body.allowed_file_types.split(",") if t.strip()}))
    cur = get_cur(db)
    vals = (body.enabled, body.teachers_can_start, days, body.contact_start, body.contact_end, body.allow_outside_hours,
            body.reply_target_hours, body.edit_window_minutes, body.max_attachment_mb, types, user_id)
    if campus_id is None:
        cur.execute("""UPDATE msg_settings SET enabled=%s, teachers_can_start=%s, contact_days=%s, contact_start=%s, contact_end=%s,
                       allow_outside_hours=%s, reply_target_hours=%s, edit_window_minutes=%s, max_attachment_mb=%s, allowed_file_types=%s,
                       updated_by=%s, updated_at=now() WHERE campus_id IS NULL""", vals)
    else:
        cur.execute("""INSERT INTO msg_settings (enabled, teachers_can_start, contact_days, contact_start, contact_end, allow_outside_hours,
                       reply_target_hours, edit_window_minutes, max_attachment_mb, allowed_file_types, updated_by, campus_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (campus_id) DO UPDATE SET enabled=EXCLUDED.enabled, teachers_can_start=EXCLUDED.teachers_can_start,
                       contact_days=EXCLUDED.contact_days, contact_start=EXCLUDED.contact_start, contact_end=EXCLUDED.contact_end,
                       allow_outside_hours=EXCLUDED.allow_outside_hours, reply_target_hours=EXCLUDED.reply_target_hours,
                       edit_window_minutes=EXCLUDED.edit_window_minutes, max_attachment_mb=EXCLUDED.max_attachment_mb,
                       allowed_file_types=EXCLUDED.allowed_file_types, updated_by=EXCLUDED.updated_by, updated_at=now()""", vals + (campus_id,))
    db.commit()
    return ok(message="Messaging settings saved.")



# ================================================================== phase 2: escalation, close / reopen, reports
class ReasonIn(BaseModel):
    reason: Optional[str] = None


@router.post("/conversations/{conv_id}/escalate")
def escalate(conv_id: int, body: ReasonIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """The parent or the teacher asks the school (principal / coordinator) to step in."""
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, conv_id, user_id, perms)
    if c["i_am"] not in ("parent", "teacher"): fail("Only the parent or the teacher can escalate this conversation.", 403)
    if c["past_session"] or c["status"] != "open": fail("Only an open conversation can be escalated.", 409)
    reason = (body.reason or "").strip()
    if not reason: fail("Say briefly why you're escalating (it helps the school respond).")
    staff = [u for u in _oversight_users(cur, c["campus_id"]) if u not in (c["parent_user_id"], c["teacher_user_id"])]
    if not staff: fail("Nobody has the oversight permission on this campus yet - ask the administrator.", 409)
    for u in staff:
        cur.execute("INSERT INTO msg_participants (conversation_id, user_id, added_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (conv_id, u, user_id))
    cur.execute("UPDATE msg_conversations SET status='escalated', escalated_at=now(), escalated_by=%s, escalation_reason=%s WHERE id=%s", (user_id, reason, conv_id))
    who = _name(cur, user_id)
    _event(cur, conv_id, user_id, f"Escalated by {who}: {reason}")
    for u in staff:
        _notify(cur, u, f"Conversation escalated by {who}", f"About {c['student_name']}: {reason[:100]}", f"/messages?c={conv_id}")
    db.commit()
    return ok(message=f"Escalated - {len(staff)} member(s) of the school's leadership have been added to this conversation.")


@router.post("/conversations/{conv_id}/resolve")
def resolve(conv_id: int, body: ReasonIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, conv_id, user_id, perms)
    if c["status"] != "escalated": fail("This conversation isn't escalated.", 409)
    if c["i_am"] != "staff" and P_OVERSIGHT not in perms: fail("Only the school's leadership can resolve an escalation.", 403)
    cur.execute("UPDATE msg_conversations SET status='open' WHERE id=%s", (conv_id,))
    note = (body.reason or "").strip()
    who = _name(cur, user_id)
    _event(cur, conv_id, user_id, f"Escalation resolved by {who}" + (f": {note}" if note else ""))
    for u in _others(c, user_id):
        _notify(cur, u, f"Escalation resolved by {who}", f"About {c['student_name']}" + (f": {note[:100]}" if note else ""), f"/messages?c={conv_id}")
    cur.execute("DELETE FROM msg_participants WHERE conversation_id=%s", (conv_id,))      # leadership steps out; their messages stay
    db.commit()
    return ok(message="Escalation resolved.")


@router.post("/conversations/{conv_id}/close")
def close(conv_id: int, body: ReasonIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, conv_id, user_id, perms)
    if c["status"] == "closed": fail("Already closed.", 409)
    if c["past_session"]: fail("Past sessions' conversations are already read-only.", 409)
    if c["i_am"] not in ("teacher", "staff") and P_OVERSIGHT not in perms: fail("Only the teacher or the school's leadership can close a conversation.", 403)
    cur.execute("UPDATE msg_conversations SET status='closed', closed_at=now(), closed_by=%s WHERE id=%s", (user_id, conv_id))
    cur.execute("DELETE FROM msg_participants WHERE conversation_id=%s", (conv_id,))
    note = (body.reason or "").strip()
    who = _name(cur, user_id)
    _event(cur, conv_id, user_id, f"Closed by {who}" + (f": {note}" if note else ""))
    for u in _others(c, user_id):
        _notify(cur, u, f"Conversation closed by {who}", f"About {c['student_name']}", f"/messages?c={conv_id}")
    db.commit()
    return ok(message="Conversation closed.")


@router.post("/conversations/{conv_id}/reopen")
def reopen(conv_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, conv_id, user_id, perms)
    if c["status"] != "closed": fail("This conversation is already open.", 409)
    if c["past_session"]: fail("Past sessions' conversations stay read-only.", 409)
    if c["i_am"] not in ("parent", "teacher"): fail("Only the parent or the teacher can reopen this conversation.", 403)
    if not _pair_allowed(cur, c["student_id"], c["parent_user_id"], c["teacher_user_id"]):
        fail("This teacher no longer teaches this child, so the conversation stays closed.", 409)
    cur.execute("UPDATE msg_conversations SET status='open', closed_at=NULL, closed_by=NULL WHERE id=%s", (conv_id,))
    who = _name(cur, user_id)
    _event(cur, conv_id, user_id, f"Reopened by {who}")
    for u in _others(c, user_id):
        _notify(cur, u, f"Conversation reopened by {who}", f"About {c['student_name']}", f"/messages?c={conv_id}")
    db.commit()
    return ok(message="Conversation reopened.")


@router.post("/messages/{msg_id}/report")
def report_message(msg_id: int, body: ReasonIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Report an inappropriate message to the school's leadership."""
    cur = get_cur(db)
    cur.execute("SELECT conversation_id, sender_user_id, kind FROM msg_messages WHERE id=%s", (msg_id,))
    m = cur.fetchone()
    if not m: fail("Message not found.", 404)
    perms = set(effective_permissions(cur, user_id))
    c = _load_conv(cur, m["conversation_id"], user_id, perms)
    if not c["participant"]: fail("Only the people in this conversation can report a message.", 403)
    if m["sender_user_id"] == user_id or m["kind"] != "message": fail("You can only report someone else's message.", 409)
    reason = (body.reason or "").strip()
    if not reason: fail("Say briefly what is wrong with this message.")
    cur.execute("""INSERT INTO msg_reports (message_id, reported_by, reason) VALUES (%s,%s,%s)
                   ON CONFLICT (message_id, reported_by) DO NOTHING RETURNING id""", (msg_id, user_id, reason))
    if not cur.fetchone(): fail("You have already reported this message.", 409)
    who = _name(cur, user_id)
    for u in _oversight_users(cur, c["campus_id"]):
        if u != user_id:
            _notify(cur, u, f"Message reported by {who}", f"In the conversation about {c['student_name']}: {reason[:100]}", "/messages?tab=reports")
    db.commit()
    return ok(message="Reported. The school's leadership will review it.")


@router.get("/reports")
def list_reports(status: str = Query("open"), user_id: int = Depends(require_permission(P_OVERSIGHT)), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""SELECT rp.id, rp.reason, rp.status, rp.created_at, rp.review_note, rp.reviewed_at,
                          ru.first_name || ' ' || ru.last_name AS reported_by_name, vu.first_name || ' ' || vu.last_name AS reviewed_by_name,
                          m.id AS message_id, m.body, m.created_at AS sent_at, su.first_name || ' ' || su.last_name AS sender_name,
                          c.id AS conversation_id, s.first_name || ' ' || s.last_name AS student_name
                   FROM msg_reports rp JOIN msg_messages m ON m.id = rp.message_id JOIN msg_conversations c ON c.id = m.conversation_id
                   JOIN students s ON s.id = c.student_id JOIN users ru ON ru.id = rp.reported_by JOIN users su ON su.id = m.sender_user_id
                   LEFT JOIN users vu ON vu.id = rp.reviewed_by
                   WHERE (%s = 'all' OR rp.status = %s) AND (%s::int IS NULL OR c.campus_id = %s)
                   ORDER BY rp.created_at DESC LIMIT 200""", (status, status, campus_id, campus_id))
    return ok(data=[{k: _iso(v) for k, v in dict(r).items()} for r in cur.fetchall()])


@router.post("/reports/{report_id}/review")
def review_report(report_id: int, body: ReasonIn, user_id: int = Depends(require_permission(P_OVERSIGHT)), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""UPDATE msg_reports SET status='reviewed', reviewed_by=%s, reviewed_at=now(), review_note=%s
                   WHERE id=%s AND status='open' RETURNING id""", (user_id, (body.reason or "").strip() or None, report_id))
    if not cur.fetchone(): fail("Report not found (or already reviewed).", 404)
    db.commit()
    return ok(message="Marked as reviewed.")
