from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db
import psycopg2.extras

bp = Blueprint("diary", __name__)

def get_cur():
    db = get_db()
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# ── Get diary entries ─────────────────────────────────────────────
@bp.get("/")
@jwt_required_custom
@require_permission("diary.view")
def get_diary():
    user_id = int(get_jwt_identity())
    date     = request.args.get("date")
    class_id = request.args.get("class_id")
    cur = get_cur()

    # Check if published
    published = False
    if class_id and date:
        cur.execute("SELECT id FROM diary_publish WHERE class_id=%s AND date=%s", (class_id, date))
        published = bool(cur.fetchone())

    cur.execute("""
        SELECT dd.*, s.name AS subject_name, s.code AS subject_code,
               t.first_name||' '||t.last_name AS teacher_name,
               c.name AS class_name, c.section
        FROM daily_diary dd
        JOIN subjects s  ON s.id  = dd.subject_id
        JOIN teachers t  ON t.id  = dd.teacher_id
        JOIN classes  c  ON c.id  = dd.class_id
        WHERE (%s IS NULL OR dd.class_id = %s)
          AND (%s IS NULL OR dd.date = %s)
        ORDER BY s.name
    """, (class_id, class_id, date, date))
    entries = [dict(r) for r in cur.fetchall()]
    for e in entries:
        if e.get("date"): e["date"] = str(e["date"])
        if e.get("created_at"): e["created_at"] = str(e["created_at"])
        if e.get("updated_at"): e["updated_at"] = str(e["updated_at"])
    return success(data={"entries": entries, "published": published})

# ── Teacher: save diary entry ─────────────────────────────────────
@bp.post("/entry")
@jwt_required_custom
@require_permission("diary.create")
def save_entry():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    cur = get_cur()
    db  = get_db()

    # Get teacher_id from user_id
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t:
        return error("Teacher profile not found.", 403)
    teacher_id = t["id"]

    class_id   = body.get("class_id")
    subject_id = body.get("subject_id")
    date       = body.get("date")
    classwork  = body.get("classwork", "")
    homework   = body.get("homework", "")
    notes      = body.get("notes", "")

    if not all([class_id, subject_id, date]):
        return error("class_id, subject_id and date are required.", 400)

    # Block edit if diary already published
    cur.execute("SELECT id FROM diary_publish WHERE class_id=%s AND date=%s", (class_id, date))
    if cur.fetchone():
        return error("Diary has been published and cannot be edited.", 403)

    cur.execute("""
        INSERT INTO daily_diary (class_id, subject_id, teacher_id, date, classwork, homework, notes, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'submitted')
        ON CONFLICT (class_id, subject_id, date) DO UPDATE
          SET classwork=%s, homework=%s, notes=%s, status='submitted', updated_at=NOW()
        RETURNING *
    """, (class_id, subject_id, teacher_id, date, classwork, homework, notes,
          classwork, homework, notes))
    entry = dict(cur.fetchone())
    db.commit()
    if entry.get("date"): entry["date"] = str(entry["date"])
    return success(data=entry, message="Diary entry saved.")

# ── Incharge: publish diary ───────────────────────────────────────
@bp.post("/publish")
@jwt_required_custom
@require_permission("diary.publish")
def publish_diary():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    force   = body.get("force", False)
    cur = get_cur()
    db  = get_db()

    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    teacher_id = t["id"] if t else None

    class_id = body.get("class_id")
    date     = body.get("date")
    if not class_id or not date:
        return error("class_id and date required.", 400)

    if not force:
        # Check all subject teachers have submitted
        cur.execute("""
            SELECT DISTINCT tt.teacher_id, t2.first_name||' '||t2.last_name AS name,
                   s.name AS subject_name
            FROM timetable tt
            JOIN teachers t2 ON t2.id = tt.teacher_id
            JOIN subjects s  ON s.id  = tt.subject_id
            WHERE tt.class_id = %s
              AND NOT EXISTS (
                SELECT 1 FROM daily_diary dd
                WHERE dd.class_id = tt.class_id
                  AND dd.teacher_id = tt.teacher_id
                  AND dd.date = %s
                  AND dd.status = 'submitted'
              )
        """, (class_id, date))
        pending = [dict(r) for r in cur.fetchall()]
        if pending:
            return error("Some teachers have not submitted their diary yet.", 400,
                        details=pending)

    cur.execute("""
        INSERT INTO diary_publish (class_id, date, published_by)
        VALUES (%s, %s, %s)
        ON CONFLICT (class_id, date) DO UPDATE SET published_by=%s, published_at=NOW()
    """, (class_id, date, teacher_id, teacher_id))
    db.commit()
    # Notify students and parents
    from app.utils.notify import send_to_class
    cur2 = db.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor)
    cur2.execute("SELECT name, section FROM classes WHERE id=%s", (class_id,))
    cls = cur2.fetchone()
    cls_name = cls["name"]+((" ("+cls["section"]+")") if cls and cls["section"] else "") if cls else "your class"
    send_to_class(class_id,
        title="Daily Diary Published",
        body=f"The daily diary for {cls_name} has been published for {date}.",
        ntype="info",
        notify_students=True, notify_parents=True, notify_teachers=False)
    return success(message="Diary published successfully.")

# ── Get diary status: who submitted, who pending ───────────────────
@bp.get("/status")
@jwt_required_custom
@require_permission("diary.view")
def diary_status():
    class_id = request.args.get("class_id")
    date     = request.args.get("date")
    if not class_id or not date:
        return error("class_id and date required.", 400)
    cur = get_cur()
    cur.execute("""
        SELECT DISTINCT tt.teacher_id,
               t.first_name||' '||t.last_name AS teacher_name,
               t.user_id AS teacher_user_id,
               s.id AS subject_id, s.name AS subject_name,
               CASE WHEN dd.id IS NOT NULL THEN 'submitted' ELSE 'pending' END AS status
        FROM timetable tt
        JOIN teachers t ON t.id = tt.teacher_id
        JOIN subjects s ON s.id = tt.subject_id
        LEFT JOIN daily_diary dd ON dd.class_id=tt.class_id
            AND dd.teacher_id=tt.teacher_id AND dd.date=%s
            AND dd.status='submitted'
        WHERE tt.class_id = %s
        ORDER BY status, teacher_name
    """, (date, class_id))
    rows = [dict(r) for r in cur.fetchall()]
    submitted = [r for r in rows if r["status"] == "submitted"]
    pending   = [r for r in rows if r["status"] == "pending"]
    return success(data={"submitted": submitted, "pending": pending})

# ── Send reminder to teacher ───────────────────────────────────────
@bp.post("/remind")
@jwt_required_custom
@require_permission("diary.publish")
def send_reminder():
    body       = request.get_json() or {}
    teacher_id = body.get("teacher_id")
    class_id   = body.get("class_id")
    date       = body.get("date")
    if not teacher_id or not class_id:
        return error("teacher_id and class_id required.", 400)
    cur = get_cur()
    db  = get_db()
    # Get teacher user_id
    cur.execute("SELECT user_id, first_name FROM teachers WHERE id=%s", (teacher_id,))
    t = cur.fetchone()
    if not t:
        return error("Teacher not found.", 404)
    # Insert notification
    cur.execute("""
        INSERT INTO notifications (user_id, title, body, type)
        VALUES (%s, %s, %s, 'reminder')
    """, (t["user_id"],
          "Diary Reminder",
          f"Please submit your daily diary for {date}. Your diary entry is pending."))
    db.commit()
    return success(message=f"Reminder sent to {t['first_name']}.")

# ── Get classes where teacher teaches (any subject) ──────────────
@bp.get("/my-classes")
@jwt_required_custom
@require_permission("diary.create")
def my_classes():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("""
        SELECT DISTINCT c.id, c.name, c.section, c.class_type,
               ct.is_primary
        FROM class_teachers ct
        JOIN classes c ON c.id = ct.class_id
        JOIN teachers t ON t.id = ct.teacher_id
        WHERE t.user_id = %s
        ORDER BY ct.is_primary DESC, c.name
    """, (user_id,))
    return success(data=[dict(r) for r in cur.fetchall()])

# ── Get subjects teacher teaches in a specific class ──────────────
@bp.get("/my-subjects")
@jwt_required_custom
@require_permission("diary.create")
def my_subjects():
    user_id  = int(get_jwt_identity())
    class_id = request.args.get("class_id")
    cur = get_cur()
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t:
        return success(data=[])
    teacher_id = t["id"]

    # Check if montessori incharge - gets all subjects
    cur.execute("""
        SELECT ct.is_primary, c.class_type
        FROM class_teachers ct
        JOIN classes c ON c.id = ct.class_id
        WHERE ct.teacher_id=%s AND ct.class_id=%s
    """, (teacher_id, class_id))
    ct = cur.fetchone()

    if ct and ct["is_primary"] and ct["class_type"] == "montessori":
        # Incharge of montessori - all subjects
        cur.execute("""
            SELECT s.id, s.name AS subject_name, s.code
            FROM class_subjects cs
            JOIN subjects s ON s.id = cs.subject_id
            WHERE cs.class_id=%s
            ORDER BY s.name
        """, (class_id,))
    else:
        # Regular - only subjects assigned to this teacher in this class
        # Match via timetable or teacher_subjects
        cur.execute("""
            SELECT DISTINCT s.id, s.name AS subject_name, s.code
            FROM timetable tt
            JOIN subjects s ON s.id = tt.subject_id
            WHERE tt.teacher_id=%s AND tt.class_id=%s
            ORDER BY s.name
        """, (teacher_id, class_id))

    return success(data=[dict(r) for r in cur.fetchall()])

# ── Get diary for student (published only) ────────────────────────
@bp.get("/student")
@jwt_required_custom
@require_permission("diary.view")
def student_diary():
    user_id = int(get_jwt_identity())
    date    = request.args.get("date")
    cur = get_cur()

    # Get student class
    cur.execute("SELECT class_id FROM students WHERE user_id=%s", (user_id,))
    s = cur.fetchone()
    if not s:
        return error("Student not found.", 404)
    class_id = s["class_id"]

    # Check published
    cur.execute("SELECT id FROM diary_publish WHERE class_id=%s AND date=%s", (class_id, date or "CURRENT_DATE"))
    if not cur.fetchone():
        return success(data={"entries": [], "published": False})

    cur.execute("""
        SELECT dd.*, s2.name AS subject_name, s2.code AS subject_code,
               t.first_name||' '||t.last_name AS teacher_name
        FROM daily_diary dd
        JOIN subjects s2 ON s2.id = dd.subject_id
        JOIN teachers t  ON t.id  = dd.teacher_id
        WHERE dd.class_id=%s AND dd.date=%s
        ORDER BY s2.name
    """, (class_id, date or "CURRENT_DATE"))
    entries = [dict(r) for r in cur.fetchall()]
    for e in entries:
        if e.get("date"): e["date"] = str(e["date"])
    return success(data={"entries": entries, "published": True})

# ── Principal: all classes publish status ─────────────────────────
@bp.get("/all-status")
@jwt_required_custom
@require_permission("diary.view")
def all_classes_status():
    date = request.args.get("date")
    if not date:
        from datetime import datetime
        date = datetime.now().strftime("%Y-%m-%d")
    cur = get_cur()
    cur.execute("""
        SELECT c.id AS class_id, c.name, c.section,
               t.first_name||' '||t.last_name AS incharge_name,
               t.id AS incharge_teacher_id,
               t.user_id AS incharge_user_id,
               dp.published_at,
               CASE WHEN dp.id IS NOT NULL THEN TRUE ELSE FALSE END AS published
        FROM classes c
        LEFT JOIN class_teachers ct ON ct.class_id = c.id AND ct.is_primary = TRUE
        LEFT JOIN teachers t ON t.id = ct.teacher_id
        LEFT JOIN diary_publish dp ON dp.class_id = c.id AND dp.date = %s
        ORDER BY published, c.name, c.section
    """, (date,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("published_at"): r["published_at"] = str(r["published_at"])
    return success(data=rows)

# ── Principal: remind incharge to publish ─────────────────────────
@bp.post("/remind-publish")
@jwt_required_custom
@require_permission("diary.view")
def remind_publish():
    body     = request.get_json() or {}
    user_id  = body.get("incharge_user_id")
    class_name = body.get("class_name", "your class")
    date     = body.get("date")
    if not user_id:
        return error("incharge_user_id required.", 400)
    cur = get_cur()
    db  = get_db()
    cur.execute("""
        INSERT INTO notifications (user_id, title, body, type)
        VALUES (%s, %s, %s, 'reminder')
    """, (user_id,
          "Diary Publish Reminder",
          f"Please publish the daily diary for {class_name} for {date}. Students and parents are waiting."))
    db.commit()
    return success(message="Reminder sent to class incharge.")
