from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, get_jwt
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras
import os

bp = Blueprint("syllabus", __name__)

UPLOAD_DIR = os.path.join("uploads", "syllabus")


def get_db():
    from app.db.connection import get_db as _get_db
    return _get_db()


def get_cur(db=None):
    db = db or get_db()
    return db, db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ── List / Get Syllabus ───────────────────────────────────────────────────────

@bp.get("/")
@jwt_required_custom
@require_permission("syllabus.view")
def list_syllabus():
    claims     = get_jwt()
    user_id    = int(get_jwt_identity())
    perms      = claims.get("permissions", [])
    roles      = claims.get("roles", [])
    role       = roles[0] if roles else ""
    db, cur    = get_cur()

    class_id   = request.args.get("class_id")
    subject_id = request.args.get("subject_id")
    year_id    = request.args.get("academic_year_id")

    conditions = ["1=1"]
    params     = []

    if class_id:
        conditions.append("sy.class_id = %s")
        params.append(int(class_id))
    if subject_id:
        conditions.append("sy.subject_id = %s")
        params.append(int(subject_id))
    if year_id:
        conditions.append("sy.academic_year_id = %s")
        params.append(int(year_id))

    # Teacher: incharge class sees all subjects, non-incharge sees only their subjects
    if role == "teacher" and "syllabus.manage" not in perms:
        conditions.append("""
            (
                sy.class_id IN (
                    SELECT ct.class_id FROM class_teachers ct
                    JOIN teachers t ON t.id = ct.teacher_id
                    WHERE t.user_id = %s AND ct.is_primary = TRUE
                )
                OR (
                    sy.class_id IN (
                        SELECT ct.class_id FROM class_teachers ct
                        JOIN teachers t ON t.id = ct.teacher_id
                        WHERE t.user_id = %s AND ct.is_primary = FALSE
                    )
                    AND sy.subject_id IN (
                        SELECT ts.subject_id FROM teacher_subjects ts
                        JOIN teachers t ON t.id = ts.teacher_id
                        WHERE t.user_id = %s
                    )
                )
            )
        """)
        params += [user_id, user_id, user_id]

    # Student sees only their class
    if role == "student":
        conditions.append("""
            sy.class_id = (SELECT class_id FROM students WHERE user_id = %s)
        """)
        params.append(user_id)

    # Parent sees their child's class
    if role == "parent":
        child_id = request.args.get("student_id")
        if child_id:
            conditions.append("""
                sy.class_id = (SELECT class_id FROM students WHERE id = %s AND parent_id = %s)
            """)
            params += [int(child_id), user_id]
        else:
            conditions.append("""
                sy.class_id IN (SELECT class_id FROM students WHERE parent_id = %s)
            """)
            params.append(user_id)

    cur.execute("""
        SELECT sy.id, sy.title, sy.description,
               c.name AS class_name, c.section,
               s.name AS subject_name, s.code AS subject_code,
               ay.name AS academic_year,
               sy.academic_year_id, sy.class_id, sy.subject_id,
               sy.created_at,
               COUNT(DISTINCT st.id) AS total_topics,
               COUNT(DISTINCT sp.id) AS covered_topics,
               STRING_AGG(DISTINCT t.first_name || ' ' || t.last_name, ', ') AS teacher_names
        FROM syllabus sy
        JOIN classes c ON c.id = sy.class_id
        JOIN subjects s ON s.id = sy.subject_id
        JOIN academic_years ay ON ay.id = sy.academic_year_id
        LEFT JOIN syllabus_topics st ON st.syllabus_id = sy.id
        LEFT JOIN syllabus_progress sp ON sp.topic_id = st.id
        LEFT JOIN teacher_subjects ts ON ts.subject_id = sy.subject_id
        LEFT JOIN class_teachers ct ON ct.class_id = sy.class_id AND ct.teacher_id = ts.teacher_id
        LEFT JOIN teachers t ON t.id = ct.teacher_id
        WHERE """ + " AND ".join(conditions) + """
        GROUP BY sy.id, sy.title, sy.description,
                 c.name, c.section, s.name, s.code,
                 ay.name, sy.academic_year_id, sy.class_id, sy.subject_id, sy.created_at
        ORDER BY c.name, s.name
    """, params)
    return success(data=cur.fetchall())


@bp.get("/<int:sid>")
@jwt_required_custom
@require_permission("syllabus.view")
def get_syllabus(sid):
    db, cur = get_cur()
    cur.execute("""
        SELECT sy.*, c.name AS class_name, c.section,
               s.name AS subject_name, s.code AS subject_code,
               ay.name AS academic_year
        FROM syllabus sy
        JOIN classes c ON c.id = sy.class_id
        JOIN subjects s ON s.id = sy.subject_id
        JOIN academic_years ay ON ay.id = sy.academic_year_id
        WHERE sy.id = %s
    """, (sid,))
    row = cur.fetchone()
    if not row:
        return error("Syllabus not found", 404)
    result = dict(row)

    cur.execute("""
        SELECT st.id, st.title, st.description, st.sort_order, st.planned_week, st.planned_month, st.planned_date, st.month_group_title,
               sp.covered_at, sp.note, sp.covered_by,
               u.first_name || ' ' || u.last_name AS covered_by_name,
               ARRAY_AGG(
                   JSON_BUILD_OBJECT('id', sa.id, 'filename', sa.filename, 'url', sa.url)
               ) FILTER (WHERE sa.id IS NOT NULL) AS attachments
        FROM syllabus_topics st
        LEFT JOIN syllabus_progress sp ON sp.topic_id = st.id
        LEFT JOIN users u ON u.id = sp.covered_by
        LEFT JOIN syllabus_attachments sa ON sa.topic_id = st.id
        WHERE st.syllabus_id = %s
        GROUP BY st.id, st.title, st.description, st.sort_order, st.planned_week, st.planned_month, st.planned_date, st.month_group_title,
                 sp.covered_at, sp.note, sp.covered_by,
                 u.first_name, u.last_name
        ORDER BY st.sort_order, st.id
    """, (sid,))
    result["topics"] = cur.fetchall()
    return success(data=result)


# ── Create Syllabus ───────────────────────────────────────────────────────────

@bp.post("/")
@jwt_required_custom
@require_permission("syllabus.manage")
def create_syllabus():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}

    if not body.get("class_id"):    return error("class_id is required", 400)
    if not body.get("subject_id"):  return error("subject_id is required", 400)
    if not body.get("title"):       return error("title is required", 400)

    db, cur = get_cur()

    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    yr = cur.fetchone()
    if not yr:
        return error("No active academic year", 400)
    year_id = body.get("academic_year_id") or yr["id"]

    cur.execute("SELECT id FROM syllabus WHERE class_id=%s AND subject_id=%s AND academic_year_id=%s",
                (body["class_id"], body["subject_id"], year_id))
    if cur.fetchone():
        return error("Syllabus already exists for this class, subject and year", 400)

    cur.execute("""
        INSERT INTO syllabus(class_id, subject_id, academic_year_id, title, description, created_by)
        VALUES(%s,%s,%s,%s,%s,%s) RETURNING id
    """, (body["class_id"], body["subject_id"], year_id,
          body["title"], body.get("description",""), user_id))
    sy_id = cur.fetchone()["id"]

    topics = body.get("topics", [])
    for i, t in enumerate(topics):
        if t.get("title"):
            cur.execute("""
                INSERT INTO syllabus_topics(syllabus_id, title, description, sort_order)
                VALUES(%s,%s,%s,%s)
            """, (sy_id, t["title"], t.get("description",""), i))

    db.commit()
    return success(message="Syllabus created.", data={"id": sy_id})


# ── Update Syllabus ───────────────────────────────────────────────────────────

@bp.put("/<int:sid>")
@jwt_required_custom
@require_permission("syllabus.manage")
def update_syllabus(sid):
    body    = request.get_json() or {}
    db, cur = get_cur()

    cur.execute("SELECT id FROM syllabus WHERE id=%s", (sid,))
    if not cur.fetchone():
        return error("Syllabus not found", 404)

    cur.execute("""
        UPDATE syllabus SET title=%s, description=%s, updated_at=NOW()
        WHERE id=%s
    """, (body.get("title"), body.get("description"), sid))
    db.commit()
    return success(message="Syllabus updated.")


# ── Delete Syllabus ───────────────────────────────────────────────────────────

@bp.delete("/<int:sid>")
@jwt_required_custom
@require_permission("syllabus.manage")
def delete_syllabus(sid):
    db, cur = get_cur()
    cur.execute("SELECT id FROM syllabus WHERE id=%s", (sid,))
    if not cur.fetchone():
        return error("Syllabus not found", 404)
    cur.execute("DELETE FROM syllabus WHERE id=%s", (sid,))
    db.commit()
    return success(message="Syllabus deleted.")


# ── Topics ────────────────────────────────────────────────────────────────────

@bp.post("/<int:sid>/topics")
@jwt_required_custom
@require_permission("syllabus.manage")
def add_topic(sid):
    body    = request.get_json() or {}
    db, cur = get_cur()

    if not body.get("title"):
        return error("Topic title is required", 400)

    cur.execute("SELECT id FROM syllabus WHERE id=%s", (sid,))
    if not cur.fetchone():
        return error("Syllabus not found", 404)

    cur.execute("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM syllabus_topics WHERE syllabus_id=%s", (sid,))
    next_order = cur.fetchone()["next"]

    planned_week       = int(body["planned_week"])       if body.get("planned_week")       else None
    planned_month      = int(body["planned_month"])      if body.get("planned_month")      else None
    planned_date       = body.get("planned_date")        or None
    month_group_title  = body.get("month_group_title")   or None

    cur.execute("""
        INSERT INTO syllabus_topics(syllabus_id, title, description, sort_order, planned_week, planned_month, planned_date, month_group_title)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (sid, body["title"], body.get("description",""), next_order, planned_week, planned_month, planned_date, month_group_title))
    topic_id = cur.fetchone()["id"]
    db.commit()
    return success(message="Topic added.", data={"id": topic_id})


@bp.put("/<int:sid>/topics/<int:tid>")
@jwt_required_custom
@require_permission("syllabus.manage")
def update_topic(sid, tid):
    body    = request.get_json() or {}
    db, cur = get_cur()

    planned_week  = int(body["planned_week"])  if body.get("planned_week")  else None
    planned_month = int(body["planned_month"]) if body.get("planned_month") else None
    planned_date  = body.get("planned_date")   or None

    cur.execute("""
        UPDATE syllabus_topics
        SET title=%s, description=%s, planned_week=%s, planned_month=%s, planned_date=%s
        WHERE id=%s AND syllabus_id=%s
    """, (body.get("title"), body.get("description",""), planned_week, planned_month, planned_date, tid, sid))
    db.commit()
    return success(message="Topic updated.")


@bp.delete("/<int:sid>/topics/<int:tid>")
@jwt_required_custom
@require_permission("syllabus.manage")
def delete_topic(sid, tid):
    db, cur = get_cur()
    cur.execute("DELETE FROM syllabus_topics WHERE id=%s AND syllabus_id=%s", (tid, sid))
    db.commit()
    return success(message="Topic deleted.")


# ── Mark Topic ────────────────────────────────────────────────────────────────

@bp.post("/<int:sid>/topics/<int:tid>/mark")
@jwt_required_custom
@require_permission("syllabus.mark")
def mark_topic(sid, tid):
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    roles   = claims.get("roles", [])
    role    = roles[0] if roles else ""
    body    = request.get_json() or {}
    action  = body.get("action", "cover")
    db, cur = get_cur()

    cur.execute("SELECT id FROM syllabus_topics WHERE id=%s AND syllabus_id=%s", (tid, sid))
    if not cur.fetchone():
        return error("Topic not found", 404)

    # Teacher can only mark topics for subjects they teach
    if role == "teacher":
        cur.execute("""
            SELECT sy.subject_id FROM syllabus sy
            JOIN teachers t ON t.user_id = %s
            JOIN teacher_subjects ts ON ts.teacher_id = t.id AND ts.subject_id = sy.subject_id
            WHERE sy.id = %s
        """, (user_id, sid))
        if not cur.fetchone():
            return error("You are not assigned to teach this subject", 403)

    if action == "cover":
        cur.execute("""
            INSERT INTO syllabus_progress(topic_id, covered_by, covered_at, note)
            VALUES(%s,%s,%s,%s)
            ON CONFLICT(topic_id) DO UPDATE SET
                covered_by=%s, covered_at=%s, note=%s
        """, (tid, user_id, body.get("covered_at"), body.get("note",""),
              user_id, body.get("covered_at"), body.get("note","")))
    else:
        cur.execute("DELETE FROM syllabus_progress WHERE topic_id=%s", (tid,))

    db.commit()

    # Check if syllabus 100% complete — notify principal
    cur.execute("""
        SELECT COUNT(st.id) AS total,
               COUNT(sp.id) AS covered
        FROM syllabus_topics st
        LEFT JOIN syllabus_progress sp ON sp.topic_id = st.id
        WHERE st.syllabus_id = %s
    """, (sid,))
    counts = cur.fetchone()
    if counts and counts["total"] > 0 and counts["total"] == counts["covered"] and action == "cover":
        try:
            from app.utils.notify import send_notification
            cur.execute("""
                SELECT sy.title, c.name AS class_name, s.name AS subject_name
                FROM syllabus sy
                JOIN classes c ON c.id = sy.class_id
                JOIN subjects s ON s.id = sy.subject_id
                WHERE sy.id = %s
            """, (sid,))
            sy = cur.fetchone()
            cur.execute("""
                SELECT u.id FROM users u
                JOIN user_roles ur ON ur.user_id = u.id
                JOIN roles r ON r.id = ur.role_id
                WHERE r.name IN ('principal','admin') AND u.is_active = TRUE
            """)
            for row in cur.fetchall():
                send_notification(row["id"],
                    title="Syllabus Completed",
                    body=sy["subject_name"] + " syllabus for " + sy["class_name"] + " is 100% complete.",
                    ntype="info")
        except Exception as e:
            print("[syllabus notify]", e)

    return success(message="Topic " + ("covered" if action == "cover" else "uncovered") + ".")


# ── Upload Attachment ─────────────────────────────────────────────────────────

@bp.post("/<int:sid>/topics/<int:tid>/attach")
@jwt_required_custom
@require_permission("syllabus.manage")
def attach_file(sid, tid):
    db, cur = get_cur()
    cur.execute("SELECT id FROM syllabus_topics WHERE id=%s AND syllabus_id=%s", (tid, sid))
    if not cur.fetchone():
        return error("Topic not found", 404)

    if "file" not in request.files:
        return error("No file uploaded", 400)
    f = request.files["file"]
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in [".pdf",".doc",".docx",".ppt",".pptx",".jpg",".jpeg",".png"]:
        return error("Invalid file type", 400)

    fname = "syllabus_" + str(tid) + "_" + str(int(__import__("time").time())) + ext
    f.save(os.path.join(UPLOAD_DIR, fname))

    cur.execute("""
        INSERT INTO syllabus_attachments(topic_id, filename, url)
        VALUES(%s,%s,%s) RETURNING id
    """, (tid, f.filename, fname))
    att_id = cur.fetchone()["id"]
    db.commit()
    return success(message="File attached.", data={"id": att_id, "url": fname})


@bp.delete("/<int:sid>/topics/<int:tid>/attach/<int:aid>")
@jwt_required_custom
@require_permission("syllabus.manage")
def delete_attachment(sid, tid, aid):
    db, cur = get_cur()
    cur.execute("SELECT url FROM syllabus_attachments WHERE id=%s AND topic_id=%s", (aid, tid))
    row = cur.fetchone()
    if not row:
        return error("Attachment not found", 404)
    try:
        os.remove(os.path.join(UPLOAD_DIR, row["url"]))
    except Exception:
        pass
    cur.execute("DELETE FROM syllabus_attachments WHERE id=%s", (aid,))
    db.commit()
    return success(message="Attachment deleted.")


@bp.get("/<int:sid>/topics/<int:tid>/attach/<int:aid>")
@jwt_required_custom
@require_permission("syllabus.view")
def download_attachment(sid, tid, aid):
    db, cur = get_cur()
    cur.execute("SELECT url, filename FROM syllabus_attachments WHERE id=%s AND topic_id=%s", (aid, tid))
    row = cur.fetchone()
    if not row:
        return error("Attachment not found", 404)
    from flask import send_from_directory
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "syllabus")
    return send_from_directory(upload_dir, row["url"], download_name=row["filename"])