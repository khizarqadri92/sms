from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db
import psycopg2.extras

bp = Blueprint("calendar", __name__)

def get_cur():
    db = get_db()
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

@bp.get("/")
@jwt_required_custom
@require_permission("calendar.view")
def list_events():
    month = request.args.get("month")
    year  = request.args.get("year")
    cur = get_cur()
    if month and year:
        cur.execute("""
            SELECT * FROM calendar_events
            WHERE EXTRACT(YEAR FROM event_date)=%s
              AND EXTRACT(MONTH FROM event_date)=%s
            ORDER BY event_date
        """, (year, month))
    else:
        from datetime import date
        cur.execute("""
            SELECT * FROM calendar_events
            WHERE EXTRACT(YEAR FROM event_date)=%s
            ORDER BY event_date
        """, (date.today().year,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["event_date"] = str(r["event_date"])
        r["end_date"]   = str(r["end_date"]) if r.get("end_date") else None
        r["created_at"] = str(r["created_at"])
    return success(data=rows)

@bp.post("/")
@jwt_required_custom
@require_permission("calendar.manage")
def create_event():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    if not body.get("title") or not body.get("event_date"):
        return error("title and event_date required.", 400)
    cur = get_cur(); db = get_db()
    end_date = body.get("end_date") or None
    cur.execute("""
        INSERT INTO calendar_events (title,description,event_date,end_date,event_type,is_holiday,created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (body["title"], body.get("description",""), body["event_date"],
          end_date, body.get("event_type","event"),
          body.get("is_holiday", False), user_id))
    new_id = cur.fetchone()["id"]
    db.commit()
    # Notify all users if holiday
    if body.get("is_holiday"):
        try:
            from app.utils.notify import send_bulk
            cur.execute("SELECT id FROM users WHERE is_active=TRUE")
            all_users = [r["id"] for r in cur.fetchall()]
            send_bulk(all_users,
                title="Holiday Announced",
                body=f"{body['title']} on {body['event_date']}.",
                ntype="info")
        except: pass
    return success(data={"id": new_id}, message="Event created.")

@bp.put("/<int:id>")
@jwt_required_custom
@require_permission("calendar.manage")
def update_event(id):
    body = request.get_json() or {}
    cur = get_cur(); db = get_db()
    end_date = body.get("end_date") or None
    cur.execute("""
        UPDATE calendar_events SET title=%s, description=%s, event_date=%s,
        end_date=%s, event_type=%s, is_holiday=%s WHERE id=%s
    """, (body.get("title"), body.get("description",""), body.get("event_date"),
          end_date, body.get("event_type","event"),
          body.get("is_holiday", False), id))
    db.commit()
    return success(message="Event updated.")

@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("calendar.manage")
def delete_event(id):
    cur = get_cur(); db = get_db()
    cur.execute("DELETE FROM calendar_events WHERE id=%s", (id,))
    db.commit()
    return success(message="Event deleted.")

@bp.get("/holidays")
@jwt_required_custom
def get_holidays():
    """Public endpoint - returns holiday dates for attendance blocking."""
    cur = get_cur()
    cur.execute("""
        SELECT event_date, end_date FROM calendar_events
        WHERE is_holiday=TRUE ORDER BY event_date
    """)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["event_date"] = str(r["event_date"])
        r["end_date"]   = str(r["end_date"]) if r.get("end_date") else None
    return success(data=rows)

# ── Event Types CRUD ──────────────────────────────────────────────
@bp.get("/event-types")
@jwt_required_custom
@require_permission("calendar.view")
def list_event_types():
    cur = get_cur()
    cur.execute("SELECT * FROM event_types WHERE is_active=TRUE ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])

@bp.post("/event-types")
@jwt_required_custom
@require_permission("calendar.manage")
def create_event_type():
    body = request.get_json() or {}
    if not body.get("name"): return error("name required.", 400)
    cur = get_cur(); db = get_db()
    cur.execute("INSERT INTO event_types (name,color,is_holiday) VALUES (%s,%s,%s) RETURNING id",
                (body["name"], body.get("color","#2563eb"), body.get("is_holiday",False)))
    new_id = cur.fetchone()["id"]
    db.commit()
    return success(data={"id": new_id}, message="Event type created.")

@bp.put("/event-types/<int:id>")
@jwt_required_custom
@require_permission("calendar.manage")
def update_event_type(id):
    body = request.get_json() or {}
    cur = get_cur(); db = get_db()
    cur.execute("UPDATE event_types SET name=%s, color=%s, is_holiday=%s WHERE id=%s",
                (body.get("name"), body.get("color","#2563eb"), body.get("is_holiday",False), id))
    db.commit()
    return success(message="Event type updated.")

@bp.delete("/event-types/<int:id>")
@jwt_required_custom
@require_permission("calendar.manage")
def delete_event_type(id):
    cur = get_cur(); db = get_db()
    cur.execute("UPDATE event_types SET is_active=FALSE WHERE id=%s", (id,))
    db.commit()
    return success(message="Event type deleted.")
