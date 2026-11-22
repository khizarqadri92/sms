"""
Native FastAPI router for Diary - migrated from app/api/v1/diary.py.
Fully self-contained inline SQL in the original, now converted to
dedicated stored procedures.
"""

from typing import Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_campus import get_current_campus_id, enforce_same_campus
from app.fastapi_permissions import require_permission, require_any_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

from app.utils.session_scope import keep_session   # current session / history

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


# ─── campus / ownership guards ────────────────────────────────────────────────

def _class_campus(cur, class_id):
    cur.execute("SELECT campus_id FROM classes WHERE id=%s", (class_id,))
    r = cur.fetchone()
    if not r:
        fail("Class not found.", 404)
    return r["campus_id"]


def _guard_class(cur, class_id, campus_id, claims=None, user_id=None):
    """
    Staff: the class must be on their campus (superadmin with no campus = all).
    Students / parents: only their own class / their children's classes.
    A 404 (not 403) so other campuses' classes aren't confirmed to exist.
    """
    enforce_same_campus(_class_campus(cur, class_id), campus_id)
    roles = (claims or {}).get("roles") or []
    role = roles[0] if roles else ""
    if role == "student":
        cur.execute("SELECT 1 FROM students WHERE user_id=%s AND class_id=%s", (user_id, class_id))
        if not cur.fetchone(): fail("Record not found.", 404)
    elif role == "parent":
        cur.execute("SELECT 1 FROM students WHERE parent_id=%s AND class_id=%s AND status <> 'withdrawn'", (user_id, class_id))
        if not cur.fetchone(): fail("Record not found.", 404)


def _campus_class_ids(cur, campus_id):
    """Class ids on the caller's campus; None = no restriction (superadmin, all campuses)."""
    if campus_id is None:
        return None
    cur.execute("SELECT id FROM classes WHERE campus_id=%s", (campus_id,))
    return {r["id"] for r in cur.fetchall()}


class SaveEntryIn(BaseModel):
    class_id: Any
    subject_id: Any
    date: str
    classwork: Optional[str] = ""
    homework: Optional[str] = ""
    notes: Optional[str] = ""


class PublishIn(BaseModel):
    class_id: Any
    date: str
    force: Optional[bool] = False


class RemindIn(BaseModel):
    teacher_id: Any
    class_id: Any
    date: Optional[str] = None


class RemindPublishIn(BaseModel):
    incharge_user_id: Any
    class_name: Optional[str] = "your class"
    date: Optional[str] = None


@router.get("/")
def get_diary(
    academic_year_id: Optional[int] = Query(None),
    date: Optional[str] = Query(None), class_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("academics.diary_view")), db=Depends(get_db),
    claims: dict = Depends(get_jwt_claims), campus_id: Optional[int] = Depends(get_current_campus_id),
):
    cur = get_cur(db)
    if class_id:
        _guard_class(cur, class_id, campus_id, claims, user_id)
    published = False
    if class_id and date:
        cur.execute("SELECT sp_check_diary_published(%s, %s) AS pub", (class_id, date))
        published = cur.fetchone()["pub"]

    cur.execute("SELECT * FROM sp_list_diary_entries(%s, %s)", (class_id, date))
    entries = [dict(r) for r in cur.fetchall()]
    entries = keep_session(cur, "daily_diary", entries, academic_year_id)   # this session (or a past one, as history)
    if not class_id:
        # no class given: only this campus's classes
        allowed = _campus_class_ids(cur, campus_id)
        if allowed is not None:
            entries = [e for e in entries if e.get("class_id") in allowed]
    for e in entries:
        for k in ("date", "created_at", "updated_at"):
            if e.get(k):
                e[k] = str(e[k])
    return ok(data={"entries": entries, "published": published})


@router.post("/entry")
def save_entry(body: SaveEntryIn, user_id: int = Depends(require_permission("academics.diary_writing")), db=Depends(get_db),
               campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    enforce_same_campus(_class_campus(cur, body.class_id), campus_id)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher profile not found.", 403)
    teacher_id = row["tid"]

    cur.execute("SELECT sp_check_diary_published(%s, %s) AS pub", (body.class_id, body.date))
    if cur.fetchone()["pub"]:
        fail("Diary has been published and cannot be edited.", 403)

    cur.execute(
        "SELECT * FROM sp_save_diary_entry(%s,%s,%s,%s,%s,%s,%s)",
        (body.class_id, body.subject_id, teacher_id, body.date, body.classwork or "", body.homework or "", body.notes or "")
    )
    entry = dict(cur.fetchone())
    db.commit()
    if entry.get("date"):
        entry["date"] = str(entry["date"])
    return ok(data=entry, message="Diary entry saved.")


@router.post("/publish")
def publish_diary(body: PublishIn, user_id: int = Depends(require_permission("academics.diary_publishing")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    enforce_same_campus(_class_campus(cur, body.class_id), campus_id)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    teacher_id = row["tid"] if row else None

    if not body.force:
        cur.execute("SELECT * FROM sp_get_pending_diary_teachers(%s, %s)", (body.class_id, body.date))
        pending = [dict(r) for r in cur.fetchall()]
        if pending:
            fail("Some teachers have not submitted their diary yet.", 400, details=pending)

    cur.execute("SELECT sp_publish_diary(%s, %s, %s)", (body.class_id, body.date, teacher_id))
    db.commit()

    try:
        from app.utils.notify import send_to_class, render_templated_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_class_name(%s)", (body.class_id,))
        cls = cur.fetchone()
        cls_name = (cls["name"] + ((" (" + cls["section"] + ")") if cls and cls["section"] else "")) if cls else "your class"
        cur.execute("SELECT campus_id FROM classes WHERE id=%s", (body.class_id,))
        _cls_campus_row = cur.fetchone()
        _cls_campus_id = _cls_campus_row["campus_id"] if _cls_campus_row else None
        with _main.flask_app.app_context():
            _t, _b = render_templated_notification("diary_published", {"class_name": cls_name, "date": body.date},
                "Daily Diary Published", "The daily diary for " + cls_name + " has been published for " + body.date + ".",
                campus_id=_cls_campus_id)
            send_to_class(
                body.class_id, title=_t, body=_b,
                ntype="info", notify_students=True, notify_parents=True, notify_teachers=False
            )
    except Exception:
        pass

    return ok(message="Diary published successfully.")


@router.get("/status")
def diary_status(
    class_id: Optional[int] = Query(None), date: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("academics.diary_view")), db=Depends(get_db),
    claims: dict = Depends(get_jwt_claims), campus_id: Optional[int] = Depends(get_current_campus_id),
):
    if not class_id or not date:
        fail("class_id and date required.", 400)
    cur = get_cur(db)
    _guard_class(cur, class_id, campus_id, claims, user_id)
    cur.execute("SELECT * FROM sp_get_diary_status(%s, %s)", (class_id, date))
    rows = [dict(r) for r in cur.fetchall()]
    submitted = [r for r in rows if r["status"] == "submitted"]
    pending = [r for r in rows if r["status"] == "pending"]
    return ok(data={"submitted": submitted, "pending": pending})


@router.post("/remind")
def send_reminder(body: RemindIn, user_id: int = Depends(require_permission("academics.diary_publishing")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    enforce_same_campus(_class_campus(cur, body.class_id), campus_id)
    cur.execute("SELECT campus_id FROM teachers WHERE id=%s", (body.teacher_id,))
    _t = cur.fetchone()
    if _t: enforce_same_campus(_t["campus_id"], campus_id)
    cur.execute("SELECT * FROM sp_get_teacher_for_reminder(%s)", (body.teacher_id,))
    t = cur.fetchone()
    if not t:
        fail("Teacher not found.", 404)
    cur.execute(
        "SELECT sp_insert_notification(%s, %s, %s, 'reminder')",
        (t["user_id"], "Diary Reminder", "Please submit your daily diary for " + str(body.date) + ". Your diary entry is pending.")
    )
    db.commit()
    return ok(message="Reminder sent to " + t["first_name"] + ".")


@router.get("/my-classes")
def my_classes(user_id: int = Depends(require_permission("academics.diary_writing")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_classes(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/my-subjects")
def my_subjects(class_id: Optional[int] = Query(None), user_id: int = Depends(require_permission("academics.diary_writing")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        return ok(data=[])
    teacher_id = row["tid"]

    cur.execute("SELECT * FROM sp_check_class_teacher_montessori(%s, %s)", (teacher_id, class_id))
    ct = cur.fetchone()

    if ct and ct["is_primary"] and ct["class_type"] == "montessori":
        cur.execute("SELECT * FROM sp_get_class_subjects(%s)", (class_id,))
        rows = [dict(r) for r in cur.fetchall()]
        data = [{"id": r["subject_id"], "subject_name": r["subject_name"], "code": r["code"]} for r in rows]
    else:
        cur.execute("SELECT * FROM sp_get_teacher_timetable_subjects(%s, %s)", (teacher_id, class_id))
        data = [dict(r) for r in cur.fetchall()]

    return ok(data=data)


@router.get("/student")
def student_diary(date: Optional[str] = Query(None), user_id: int = Depends(require_permission("academics.diary_view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_student_class(%s) AS cid", (user_id,))
    row = cur.fetchone()
    if not row or not row["cid"]:
        fail("Student not found.", 404)
    class_id = row["cid"]

    query_date = date or get_processing_date(db).strftime("%Y-%m-%d")
    cur.execute("SELECT sp_check_diary_published(%s, %s) AS pub", (class_id, query_date))
    if not cur.fetchone()["pub"]:
        return ok(data={"entries": [], "published": False})

    cur.execute("SELECT * FROM sp_get_student_diary(%s, %s)", (class_id, query_date))
    entries = [dict(r) for r in cur.fetchall()]
    for e in entries:
        if e.get("date"):
            e["date"] = str(e["date"])

    cur.execute("SELECT * FROM sp_get_class_name(%s)", (class_id,))
    cls = cur.fetchone()
    class_name = cls["name"] if cls else None
    section = cls["section"] if cls else None

    return ok(data={"entries": entries, "published": True, "class_name": class_name, "section": section})


@router.get("/all-status")
def all_classes_status(date: Optional[str] = Query(None), user_id: int = Depends(require_permission("academics.diary_view")), db=Depends(get_db),
                       campus_id: Optional[int] = Depends(get_current_campus_id)):
    query_date = date or get_processing_date(db).strftime("%Y-%m-%d")
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_classes_diary_status(%s)", (query_date,))
    rows = [dict(r) for r in cur.fetchall()]
    allowed = _campus_class_ids(cur, campus_id)          # only the caller's campus
    if allowed is not None:
        rows = [r for r in rows if (r.get("class_id") if r.get("class_id") is not None else r.get("id")) in allowed]
    for r in rows:
        if r.get("published_at"):
            r["published_at"] = str(r["published_at"])
    return ok(data=rows)


@router.post("/remind-publish")
def remind_publish(body: RemindPublishIn, user_id: int = Depends(require_permission("academics.diary_view")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM users WHERE id=%s", (body.incharge_user_id,))
    _u = cur.fetchone()
    if not _u: fail("Record not found.", 404)
    enforce_same_campus(_u["campus_id"], campus_id)
    cur.execute(
        "SELECT sp_insert_notification(%s, %s, %s, 'reminder')",
        (
            body.incharge_user_id, "Diary Publish Reminder",
            "Please publish the daily diary for " + (body.class_name or "your class") + " for " + str(body.date) + ". Students and parents are waiting."
        )
    )
    db.commit()
    return ok(message="Reminder sent to class incharge.")
