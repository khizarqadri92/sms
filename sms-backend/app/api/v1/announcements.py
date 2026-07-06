from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.utils.sp_helper import call_sp, call_sp_write
from app.db.connection import get_db
import psycopg2.extras, os
from datetime import date

bp = Blueprint("announcements", __name__)

def get_cur():
    return get_db().cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def serialize(rows):
    result = []
    for r in rows:
        d = dict(r)
        for k,v in d.items():
            if hasattr(v,"isoformat"): d[k] = str(v)
        result.append(d)
    return result

# ── List announcements for current user ───────────────────────
@bp.get("/")
@jwt_required_custom
def list_announcements():
    user_id = int(get_jwt_identity())
    cur = get_cur()

    # Get user role and class
    cur.execute("""
        SELECT r.name FROM roles r
        JOIN user_roles ur ON ur.role_id=r.id
        WHERE ur.user_id=%s LIMIT 1
    """, (user_id,))
    role_row = cur.fetchone()
    role = role_row["name"] if role_row else "student"

    # Get class_id for student/parent
    class_id = None
    if role == "student":
        cur.execute("SELECT class_id FROM students WHERE user_id=%s", (user_id,))
        s = cur.fetchone()
        class_id = s["class_id"] if s else None
    elif role == "parent":
        cur.execute("SELECT class_id FROM students WHERE parent_id=%s AND status='active' LIMIT 1", (user_id,))
        s = cur.fetchone()
        class_id = s["class_id"] if s else None

    cur.execute("SELECT * FROM sp_get_announcements(%s,%s,%s,%s)",
                (user_id, role, class_id, 100))
    rows = serialize(cur.fetchall())
    return success(data=rows)

# ── Unread count ───────────────────────────────────────────────
@bp.get("/unread-count")
@jwt_required_custom
def unread_count():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("""
        SELECT r.name FROM roles r
        JOIN user_roles ur ON ur.role_id=r.id
        WHERE ur.user_id=%s LIMIT 1
    """, (user_id,))
    role_row = cur.fetchone()
    role = role_row["name"] if role_row else "student"

    class_id = None
    if role == "student":
        cur.execute("SELECT class_id FROM students WHERE user_id=%s", (user_id,))
        s = cur.fetchone()
        class_id = s["class_id"] if s else None
    elif role == "parent":
        cur.execute("SELECT class_id FROM students WHERE parent_id=%s AND status='active' LIMIT 1", (user_id,))
        s = cur.fetchone()
        class_id = s["class_id"] if s else None

    cur.execute("SELECT sp_unread_announcements_count(%s,%s,%s) AS cnt",
                (user_id, role, class_id))
    cnt = cur.fetchone()["cnt"]
    return success(data={"count": cnt})

# ── Create announcement ────────────────────────────────────────
@bp.post("/")
@jwt_required_custom
@require_permission("announcement.create")
def create_announcement():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    if not body.get("title") or not body.get("body"):
        return error("Title and body required.", 400)

    cur = get_cur(); db = get_db()
    cur.execute("SELECT * FROM sp_create_announcement(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", (
        body["title"], body["body"],
        body.get("priority","normal"),
        body.get("target_role","all"),
        body.get("target_class") or None,
        user_id,
        body.get("start_date", str(date.today())),
        body.get("end_date") or None,
        "manual", None, None,
        body.get("attachment") or None
    ))
    result = cur.fetchone()
    if result["error_msg"]:
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"id": result["id"]}, message="Announcement created.")

# ── Update announcement ────────────────────────────────────────
@bp.put("/<int:id>")
@jwt_required_custom
@require_permission("announcement.create")
def update_announcement(id):
    body = request.get_json() or {}
    cur = get_cur(); db = get_db()
    cur.execute("SELECT * FROM sp_update_announcement(%s,%s,%s,%s,%s,%s,%s,%s)", (
        id, body.get("title"), body.get("body"),
        body.get("priority","normal"),
        body.get("target_role","all"),
        body.get("target_class") or None,
        body.get("end_date") or None,
        body.get("is_active", True)
    ))
    result = cur.fetchone()
    if not result["success"]:
        return error(result["error_msg"], 404)
    db.commit()
    return success(message="Updated.")

# ── Delete announcement ────────────────────────────────────────
@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("announcement.manage")
def delete_announcement(id):
    cur = get_cur(); db = get_db()
    cur.execute("SELECT * FROM sp_delete_announcement(%s)", (id,))
    result = cur.fetchone()
    if not result["success"]:
        return error(result["error_msg"], 404)
    db.commit()
    return success(message="Deleted.")

# ── Mark as read ───────────────────────────────────────────────
@bp.post("/<int:id>/read")
@jwt_required_custom
def mark_read(id):
    user_id = int(get_jwt_identity())
    cur = get_cur(); db = get_db()
    cur.execute("SELECT * FROM sp_mark_announcement_read(%s,%s)", (id, user_id))
    db.commit()
    return success(message="Marked as read.")