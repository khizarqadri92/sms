from flask import Blueprint, request
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras

bp = Blueprint("academics", __name__)


def get_cur():
    from app.db.connection import get_db
    return get_db().cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Academic Years ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
@bp.get("/my-classes")
@jwt_required_custom
def get_my_classes():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    import psycopg2.extras
    user_id = int(get_jwt_identity())
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT DISTINCT c.id, c.name, c.section, c.class_type, ct.is_primary
        FROM class_teachers ct
        JOIN classes c ON c.id=ct.class_id
        JOIN teachers t ON t.id=ct.teacher_id
        WHERE t.user_id=%s
        ORDER BY ct.is_primary DESC, c.name, c.section
    """, (user_id,))
    from app.utils.response import success
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/my-subjects")
@jwt_required_custom
def get_my_subjects():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    import psycopg2.extras
    user_id = int(get_jwt_identity())
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT DISTINCT s.id, s.name, s.code
        FROM teacher_subjects ts
        JOIN subjects s ON s.id=ts.subject_id
        JOIN teachers t ON t.id=ts.teacher_id
        WHERE t.user_id=%s
        ORDER BY s.name
    """, (user_id,))
    from app.utils.response import success
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/years")
@jwt_required_custom
@require_permission("academics.view")
def list_years():
    cur = get_cur()
    cur.execute("SELECT * FROM academic_years ORDER BY start_date DESC")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/years")
@jwt_required_custom
@require_permission("academics.manage")
def create_year():
    body = request.get_json() or {}
    if not body.get("name") or not body.get("start_date") or not body.get("end_date"):
        return error("name, start_date and end_date are required.", 400)
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        INSERT INTO academic_years (name, start_date, end_date, is_active)
        VALUES (%s, %s, %s, %s) RETURNING *
    """, (body["name"], body["start_date"], body["end_date"], body.get("is_active", False)))
    db.commit()
    return success(data=dict(cur.fetchone()), status=201)


@bp.put("/years/<int:id>/activate")
@jwt_required_custom
@require_permission("academics.manage")
def activate_year(id):
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor()
    cur.execute("UPDATE academic_years SET is_active = FALSE")
    cur.execute("UPDATE academic_years SET is_active = TRUE WHERE id = %s", (id,))
    db.commit()
    return success(message="Academic year activated.")


# ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Classes ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
@bp.get("/classes")
@jwt_required_custom
@require_permission("academics.view")
def list_classes():
    cur = get_cur()
    cur.execute("""
        SELECT c.*, ay.name AS year_name,
               COUNT(DISTINCT s.id) AS student_count,
               COUNT(DISTINCT ct.teacher_id) AS teacher_count,
               COUNT(DISTINCT cs2.subject_id) AS subject_count
        FROM classes c
        LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
        LEFT JOIN students s  ON s.class_id = c.id AND s.status = 'active'
        LEFT JOIN class_teachers ct ON ct.class_id = c.id
        LEFT JOIN class_subjects cs2 ON cs2.class_id = c.id
        GROUP BY c.id, ay.name
        ORDER BY c.name
    """)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/classes")
@jwt_required_custom
@require_permission("academics.manage")
def create_class():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        INSERT INTO classes (name, section, academic_year_id, capacity, room_number, class_type)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
    """, (
        body["name"],
        body.get("section") or None,
        body.get("academic_year_id") or None,
        body.get("capacity", 40),
        body.get("room_number") or None,
        body.get("class_type", "regular"),
    ))
    db.commit()
    return success(data=dict(cur.fetchone()), status=201)


@bp.put("/classes/<int:id>")
@jwt_required_custom
@require_permission("academics.manage")
def update_class(id):
    body = request.get_json() or {}
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        UPDATE classes SET name=%s, section=%s, capacity=%s, room_number=%s, class_type=%s
        WHERE id=%s RETURNING *
    """, (body.get("name"), body.get("section") or None,
          body.get("capacity", 40), body.get("room_number") or None,
          body.get("class_type", "regular"), id))
    db.commit()
    row = cur.fetchone()
    return success(data=dict(row)) if row else error("Class not found.", 404)







@bp.delete("/classes/<int:id>")
@jwt_required_custom
@require_permission("academics.manage")
def delete_class(id):
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM classes WHERE id = %s", (id,))
    db.commit()
    return success(message="Class deleted.")


# ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Subjects ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
@bp.get("/subjects")
@jwt_required_custom
@require_permission("academics.view")
def list_subjects():
    cur = get_cur()
    cur.execute("SELECT * FROM subjects ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/subjects")
@jwt_required_custom
@require_permission("academics.manage")
def create_subject():
    body = request.get_json() or {}
    if not body.get("name") or not body.get("code"):
        return error("name and code are required.", 400)
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        INSERT INTO subjects (name, code, description, credit_hours, is_active)
        VALUES (%s, %s, %s, %s, TRUE) RETURNING *
    """, (body["name"], body["code"], body.get("description"), body.get("credit_hours", 1)))
    db.commit()
    return success(data=dict(cur.fetchone()), status=201)


@bp.put("/subjects/<int:id>")
@jwt_required_custom
@require_permission("academics.manage")
def update_subject(id):
    body = request.get_json() or {}
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        UPDATE subjects SET name=%s, code=%s, description=%s,
               credit_hours=%s, is_active=%s
        WHERE id=%s RETURNING *
    """, (body.get("name"), body.get("code"), body.get("description"),
          body.get("credit_hours", 1), body.get("is_active", True), id))
    db.commit()
    row = cur.fetchone()
    return success(data=dict(row)) if row else error("Subject not found.", 404)


@bp.delete("/subjects/<int:id>")
@jwt_required_custom
@require_permission("academics.manage")
def delete_subject(id):
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor()
    cur.execute("UPDATE subjects SET is_active = FALSE WHERE id = %s", (id,))
    db.commit()
    return success(message="Subject deactivated.")


# ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Timetable ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
@bp.get("/timetable")
@jwt_required_custom
@require_permission("timetable.view")
def list_timetable():
    class_id = request.args.get("class_id")
    cur = get_cur()
    if class_id:
        cur.execute("""
            SELECT t.*, c.name AS class_name, s.name AS subject_name,
                   s.code AS subject_code,
                   te.first_name || ' ' || te.last_name AS teacher_name
            FROM timetable t
            JOIN classes  c  ON c.id  = t.class_id
            JOIN subjects s  ON s.id  = t.subject_id
            JOIN teachers te ON te.id = t.teacher_id
            WHERE t.class_id = %s
            ORDER BY t.day_of_week, t.start_time
        """, (class_id,))
    else:
        cur.execute("""
            SELECT t.*, c.name AS class_name, s.name AS subject_name,
                   s.code AS subject_code,
                   te.first_name || ' ' || te.last_name AS teacher_name
            FROM timetable t
            JOIN classes  c  ON c.id  = t.class_id
            JOIN subjects s  ON s.id  = t.subject_id
            JOIN teachers te ON te.id = t.teacher_id
            ORDER BY t.class_id, t.day_of_week, t.start_time
        """)
    rows = []
    for r in cur.fetchall():
        row = dict(r)
        for k in ["start_time", "end_time"]:
            if k in row and row[k] is not None and not isinstance(row[k], str):
                row[k] = str(row[k])
        rows.append(row)
    return success(data=rows)


@bp.post("/timetable")
@jwt_required_custom
@require_permission("academics.manage")
def create_timetable():
    body = request.get_json() or {}
    required = ["class_id","subject_id","teacher_id","day_of_week","start_time","end_time"]
    for f in required:
        if not body.get(f):
            return error(f"{f} is required.", 400)
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO timetable
                (class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_number)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *
        """, (body["class_id"], body["subject_id"], body["teacher_id"],
              body["day_of_week"], body["start_time"], body["end_time"],
              body.get("room_number") or None))
        db.commit()
        row = dict(cur.fetchone())
        # Convert time objects to strings for JSON serialization
        for k in ["start_time", "end_time"]:
            if k in row and row[k] is not None and not isinstance(row[k], str):
                row[k] = str(row[k])
        # Notify students and teachers about timetable update
        try:
            from app.utils.notify import send_to_class
            send_to_class(int(body["class_id"]),
                title="Timetable Updated",
                body="Your class timetable has been updated. Please check the latest schedule.",
                ntype="info",
                notify_students=True, notify_parents=False, notify_teachers=True)
        except Exception:
            pass
        return success(data=row, status=201)
    except Exception as e:
        db.rollback()
        return error(str(e), 400)


@bp.delete("/timetable/<int:id>")
@jwt_required_custom
@require_permission("academics.manage")
def delete_timetable(id):
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM timetable WHERE id = %s", (id,))
    db.commit()
    return success(message="Timetable entry deleted.")

@bp.get("/classes/<int:id>/teachers")
@jwt_required_custom
@require_permission("academics.view")
def class_teachers(id):
    cur = get_cur()
    cur.execute("""
        SELECT ct.teacher_id, ct.is_primary,
               t.first_name || ' ' || t.last_name AS teacher_name,
               t.employee_no, t.specialization,
               c.class_type,
               STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name) AS subject_names
        FROM class_teachers ct
        JOIN teachers t ON t.id = ct.teacher_id
        JOIN classes  c ON c.id = ct.class_id
        LEFT JOIN teacher_subjects ts ON ts.teacher_id = ct.teacher_id
        LEFT JOIN subjects s ON s.id = ts.subject_id
        WHERE ct.class_id = %s
        GROUP BY ct.teacher_id, ct.is_primary, t.first_name, t.last_name, t.employee_no, t.specialization, c.class_type
        ORDER BY ct.is_primary DESC
    """, (id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/classes/<int:id>/teachers")
@jwt_required_custom
@require_permission("academics.manage")
def assign_class_teacher(id):
    body = request.get_json() or {}
    teacher_id = body.get("teacher_id")
    is_primary = body.get("is_primary", False)
    action     = body.get("action", "assign")

    if action == "assign" and teacher_id:
        cur2 = get_cur()
        # Rule 1: Teacher can be incharge of only one class
        if is_primary:
            cur2.execute("""
                SELECT c.name FROM class_teachers ct
                JOIN classes c ON c.id = ct.class_id
                WHERE ct.teacher_id = %s AND ct.is_primary = TRUE AND ct.class_id != %s
            """, (teacher_id, id))
            existing = cur2.fetchone()
            if existing:
                return error(f"This teacher is already class incharge of {existing['name']}. A teacher can be incharge of only one class.", 400)

        # Rule 2: Montessori incharge cannot be assigned as subject teacher elsewhere
        cur2.execute("""
            SELECT c.name, c.class_type FROM class_teachers ct
            JOIN classes c ON c.id = ct.class_id
            WHERE ct.teacher_id = %s AND ct.is_primary = TRUE
        """, (teacher_id,))
        incharge_of = cur2.fetchone()
        if incharge_of and incharge_of["class_type"] == "montessori" and not is_primary:
            return error(f"This teacher is the Montessori incharge of {incharge_of['name']} and cannot be assigned as a subject teacher to other classes.", 400)

        # Rule 3: Cannot assign a Montessori class incharge from another class as regular teacher here
        cur2.execute("SELECT class_type FROM classes WHERE id = %s", (id,))
        this_class = cur2.fetchone()
        if this_class:
            # Montessori classes only allow one incharge teacher
            if this_class["class_type"] == "montessori" and not is_primary:
                return error("Montessori classes only allow one Class Incharge. Please assign as Incharge.", 400)
            # Regular classes cannot have Montessori incharge as subject teacher
            if this_class["class_type"] != "montessori" and not is_primary:
                cur2.execute("""
                    SELECT c.name FROM class_teachers ct
                    JOIN classes c ON c.id = ct.class_id
                    WHERE ct.teacher_id = %s AND ct.is_primary = TRUE AND c.class_type = 'montessori'
                """, (teacher_id,))
                mont_incharge = cur2.fetchone()
                if mont_incharge:
                    return error(f"This teacher is the Montessori incharge of {mont_incharge['name']} and cannot teach other classes.", 400)

    if not teacher_id:
        return error("teacher_id is required.", 400)

    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT class_type FROM classes WHERE id = %s", (id,))
    cls = cur.fetchone()
    if not cls:
        return error("Class not found.", 404)

    if action == "assign":
        if is_primary:
            cur.execute("UPDATE class_teachers SET is_primary = FALSE WHERE class_id = %s", (id,))
        cur.execute("""
            INSERT INTO class_teachers (class_id, teacher_id, is_primary)
            VALUES (%s, %s, %s)
            ON CONFLICT (class_id, teacher_id)
            DO UPDATE SET is_primary = EXCLUDED.is_primary
        """, (id, teacher_id, is_primary))
    else:
        cur.execute("DELETE FROM class_teachers WHERE class_id = %s AND teacher_id = %s", (id, teacher_id))

    db.commit()
    return success(message="Class teacher updated.")

# ── Class Subjects ────────────────────────────────────────────
@bp.get("/classes/<int:id>/subjects")
@jwt_required_custom
@require_permission("classes.view")
def get_class_subjects(id):
    cur = get_cur()
    cur.execute("""
        SELECT cs.id, cs.subject_id, s.name AS subject_name, s.code, s.credit_hours
        FROM class_subjects cs
        JOIN subjects s ON s.id = cs.subject_id
        WHERE cs.class_id = %s ORDER BY s.name
    """, (id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/classes/<int:id>/subjects")
@jwt_required_custom
@require_permission("classes.manage")
def assign_class_subject(id):
    body       = request.get_json() or {}
    subject_id = body.get("subject_id")
    if not subject_id:
        return error("subject_id is required.", 400)
    cur = get_cur()
    cur.execute("""
        INSERT INTO class_subjects (class_id, subject_id)
        VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING *
    """, (id, subject_id))
    cur.connection.commit()
    return success(message="Subject assigned to class.")


@bp.delete("/classes/<int:id>/subjects/<int:subject_id>")
@jwt_required_custom
@require_permission("classes.manage")
def remove_class_subject(id, subject_id):
    cur = get_cur()
    cur.execute("DELETE FROM class_subjects WHERE class_id=%s AND subject_id=%s", (id, subject_id))
    cur.connection.commit()
    return success(message="Subject removed from class.")

@bp.get("/timetable/ai-context")
@jwt_required_custom
@require_permission("timetable.manage")
def get_timetable_ai_context():
    """Return all data needed for AI timetable generation"""
    cur = get_cur()
    from app.db.connection import get_db
    import psycopg2.extras as _pex
    db2 = get_db()
    cur2 = db2.cursor(cursor_factory=_pex.RealDictCursor)

    # School timing settings
    cur2.execute("SELECT key, value FROM system_settings WHERE category IN ('school_timing','fee_settings')")
    settings = {r["key"]: r["value"] for r in cur2.fetchall()}

    # Classes with subjects and teachers
    cur2.execute("""
        SELECT c.id, c.name, c.section, c.class_type,
               json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code)) FILTER (WHERE s.id IS NOT NULL) AS subjects,
               json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.first_name||' '||t.last_name, 'is_primary', ct.is_primary)) FILTER (WHERE t.id IS NOT NULL) AS teachers
        FROM classes c
        LEFT JOIN class_subjects cs ON cs.class_id = c.id
        LEFT JOIN subjects s ON s.id = cs.subject_id
        LEFT JOIN class_teachers ct ON ct.class_id = c.id
        LEFT JOIN teachers t ON t.id = ct.teacher_id
        GROUP BY c.id, c.name, c.section, c.class_type
        ORDER BY c.name, c.section
    """)
    classes_raw = [dict(r) for r in cur2.fetchall()]

    # For each class subject, find which class teachers teach that subject
    for cls in classes_raw:
        teachers = cls.get("teachers") or []
        subjects = cls.get("subjects") or []
        teacher_ids = [t["id"] for t in teachers]
        mapped = []
        for subj in subjects:
            if cls["class_type"] == "montessori":
                incharge = next((t for t in teachers if t.get("is_primary")), teachers[0] if teachers else None)
                subj_teachers = [{"teacher_id": incharge["id"], "name": incharge["name"]}] if incharge else []
            else:
                cur2.execute("""
                    SELECT t.id AS teacher_id, t.first_name||' '||t.last_name AS name
                    FROM teacher_subjects ts
                    JOIN teachers t ON t.id = ts.teacher_id
                    WHERE ts.subject_id = %s AND t.id = ANY(%s)
                """, (subj["id"], teacher_ids))
                subj_teachers = [dict(r) for r in cur2.fetchall()]
            mapped.append({**subj, "teachers": subj_teachers})
        cls["subjects"] = mapped

    return success(data={"settings": settings, "classes": classes_raw})

@bp.post("/timetable/ai-generate")
@jwt_required_custom
@require_permission("timetable.manage")
def ai_generate_timetable():
    import requests as req_lib
    body = request.get_json() or {}
    prompt = body.get("prompt", "")
    if not prompt:
        return error("prompt is required.", 400)
    try:
        import os
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        resp = req_lib.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 8192,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=60
        )
        data = resp.json()
        text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                text += block.get("text", "")
        return success(data={"text": text})
    except Exception as e:
        return error(str(e), 500)