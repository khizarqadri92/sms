from flask import Blueprint, request
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras

bp = Blueprint("leave_setup", __name__)


def get_db():
    from app.db.connection import get_db as _get_db
    return _get_db()


def _insert_rules(cur, lt_id, rules):
    for i, rule in enumerate(rules):
        if not rule.get("approver_role"):
            return f"Rule {i+1} is missing an approver role"
        cur.execute("""
            INSERT INTO leave_approval_rules
                (leave_type_id, day_from, day_to, recommender_role,
                 approver_role, sort_order, certificate_required, certificate_label)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            lt_id,
            int(rule.get("day_from") or 1),
            int(rule["day_to"]) if rule.get("day_to") else None,
            rule.get("recommender_role") or None,
            rule["approver_role"],
            i,
            bool(rule.get("certificate_required", False)),
            rule.get("certificate_label", "") or "",
        ))
    return None


@bp.get("/active-types")
@jwt_required_custom
def get_active_leave_types():
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM leave_types WHERE is_active=TRUE ORDER BY name")
    types = cur.fetchall()
    for lt in types:
        cur.execute("""
            SELECT id, day_from, day_to, recommender_role, approver_role,
                   sort_order, certificate_required, certificate_label
            FROM leave_approval_rules
            WHERE leave_type_id = %s ORDER BY sort_order, day_from
        """, (lt["id"],))
        lt["rules"] = cur.fetchall()
    return success(data=types)


@bp.get("/types")
@jwt_required_custom
@require_permission("leave_type.view")
def get_leave_types():
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM leave_types ORDER BY name")
    types = cur.fetchall()
    for lt in types:
        cur.execute("""
            SELECT id, day_from, day_to, recommender_role, approver_role,
                   sort_order, certificate_required, certificate_label
            FROM leave_approval_rules
            WHERE leave_type_id = %s ORDER BY sort_order, day_from
        """, (lt["id"],))
        lt["rules"] = cur.fetchall()
    return success(data=types)


@bp.post("/types")
@jwt_required_custom
@require_permission("leave_type.manage")
def create_leave_type():
    body  = request.get_json() or {}
    name  = body.get("name", "").strip()
    rules = body.get("rules", [])

    if not name:
        return error("Leave type name is required", 400)
    if not rules:
        return error("At least one approval rule is required", 400)

    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM leave_types WHERE LOWER(name)=LOWER(%s)", (name,))
    if cur.fetchone():
        return error("Leave type with this name already exists", 400)

    cur.execute("""
        INSERT INTO leave_types(name, max_days_per_year, notify_mode, is_active)
        VALUES(%s,%s,%s,%s) RETURNING id
    """, (
        name,
        int(body["max_days_per_year"]) if body.get("max_days_per_year") else None,
        body.get("notify_mode", "incharge_only"),
        body.get("is_active", True),
    ))
    lt_id = cur.fetchone()["id"]

    err = _insert_rules(cur, lt_id, rules)
    if err:
        db.rollback()
        return error(err, 400)

    db.commit()
    return success(message="Leave type created.", data={"id": lt_id})


@bp.put("/types/<int:lt_id>")
@jwt_required_custom
@require_permission("leave_type.manage")
def update_leave_type(lt_id):
    body  = request.get_json() or {}
    rules = body.get("rules", [])

    if not rules:
        return error("At least one approval rule is required", 400)

    db  = get_db()
    cur = db.cursor()

    cur.execute("SELECT id FROM leave_types WHERE id=%s", (lt_id,))
    if not cur.fetchone():
        return error("Leave type not found", 404)

    cur.execute("""
        UPDATE leave_types SET
            name              = COALESCE(%s, name),
            max_days_per_year = %s,
            notify_mode       = COALESCE(%s, notify_mode),
            is_active         = COALESCE(%s, is_active)
        WHERE id = %s
    """, (
        body.get("name"),
        int(body["max_days_per_year"]) if body.get("max_days_per_year") else None,
        body.get("notify_mode"),
        body.get("is_active"),
        lt_id,
    ))

    cur.execute("DELETE FROM leave_approval_rules WHERE leave_type_id=%s", (lt_id,))

    err = _insert_rules(cur, lt_id, rules)
    if err:
        db.rollback()
        return error(err, 400)

    db.commit()
    return success(message="Leave type updated.")


@bp.delete("/types/<int:lt_id>")
@jwt_required_custom
@require_permission("leave_type.manage")
def delete_leave_type(lt_id):
    db  = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM leave_types WHERE id=%s", (lt_id,))
    if not cur.fetchone():
        return error("Leave type not found", 404)
    cur.execute("SELECT id FROM leave_requests WHERE leave_type_id=%s LIMIT 1", (lt_id,))
    if cur.fetchone():
        return error("Cannot delete leave requests exist for this type. Deactivate instead.", 400)
    cur.execute("DELETE FROM leave_types WHERE id=%s", (lt_id,))
    db.commit()
    return success(message="Leave type deleted.")
