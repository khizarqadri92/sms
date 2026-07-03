from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.utils.response import success, error
import psycopg2.extras

bp = Blueprint("notifications", __name__)


def get_db_cur():
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    return db, cur


@bp.get("/")
@jwt_required_custom
def list_notifications():
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("""
        SELECT id, title, COALESCE(body, message) AS message, type, is_read, link, created_at
        FROM notifications
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT 20
    """, (user_id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/unread-count")
@jwt_required_custom
def unread_count():
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = %s AND is_read = FALSE", (user_id,))
    return success(data={"count": cur.fetchone()["cnt"]})


@bp.put("/<int:id>/read")
@jwt_required_custom
def mark_read(id):
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("UPDATE notifications SET is_read = TRUE WHERE id = %s AND user_id = %s", (id, user_id))
    db.commit()
    return success(message="Marked as read.")


@bp.put("/read-all")
@jwt_required_custom
def mark_all_read():
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = %s AND is_read = FALSE", (user_id,))
    db.commit()
    return success(message="All notifications marked as read.")


@bp.delete("/<int:id>")
@jwt_required_custom
def delete_notification(id):
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("DELETE FROM notifications WHERE id = %s AND user_id = %s", (id, user_id))
    db.commit()
    return success(message="Notification deleted.")


@bp.post("/send")
@jwt_required_custom
def send_notification():
    from app.middleware.rbac import require_permission
    body    = request.get_json() or {}
    user_id = body.get("user_id")
    title   = body.get("title")
    message = body.get("message", "")
    ntype   = body.get("type", "info")
    link    = body.get("link", "")
    if not user_id or not title:
        return error("user_id and title are required.", 400)
    db, cur = get_db_cur()
    cur.execute("""
        INSERT INTO notifications (user_id, title, body, type, link)
        VALUES (%s, %s, %s, %s, %s) RETURNING id
    """, (user_id, title, message, ntype, link))
    db.commit()
    return success(message="Notification sent.")