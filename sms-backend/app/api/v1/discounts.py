from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras

bp = Blueprint("discounts", __name__)


def get_db_cur():
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    return db, cur


# ── Discount Types ────────────────────────────────────────────
@bp.get("/types")
@jwt_required_custom
@require_permission("finance.view")
def list_types():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM discount_types ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/types")
@jwt_required_custom
@require_permission("finance.manage")
def create_type():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db_cur()
    try:
        cur.execute("""
            INSERT INTO discount_types (name, description, type, value)
            VALUES (%s, %s, %s, %s) RETURNING *
        """, (body["name"], body.get("description"), body.get("type","percentage"), body.get("value", 0)))
        db.commit()
        return success(data=dict(cur.fetchone()), status=201)
    except Exception as e:
        db.rollback()
        return error(str(e), 400)


@bp.put("/types/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def update_type(id):
    body = request.get_json() or {}
    db, cur = get_db_cur()
    cur.execute("""
        UPDATE discount_types
        SET name=%s, description=%s, type=%s, value=%s, is_active=%s
        WHERE id=%s RETURNING *
    """, (body.get("name"), body.get("description"), body.get("type","percentage"),
          body.get("value",0), body.get("is_active",True), id))
    db.commit()
    row = cur.fetchone()
    return success(data=dict(row)) if row else error("Not found.", 404)


@bp.delete("/types/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def deactivate_type(id):
    db, cur = get_db_cur()
    cur.execute("UPDATE discount_types SET is_active=FALSE WHERE id=%s", (id,))
    db.commit()
    return success(message="Discount type deactivated.")


# ── Student Discounts ─────────────────────────────────────────
@bp.get("/student/<int:student_id>")
@jwt_required_custom
@require_permission("finance.view")
def student_discounts(student_id):
    db, cur = get_db_cur()
    cur.execute("""
        SELECT sd.*, dt.name AS discount_name, dt.type AS discount_type,
               COALESCE(sd.override_value, dt.value) AS discount_value,
               u.first_name || ' ' || u.last_name AS assigned_by_name
        FROM student_discounts sd
        JOIN discount_types dt ON dt.id = sd.discount_type_id
        LEFT JOIN users u ON u.id = sd.assigned_by
        WHERE sd.student_id = %s
        ORDER BY sd.assigned_at DESC
    """, (student_id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/student/<int:student_id>")
@jwt_required_custom
@require_permission("finance.manage")
def assign_discount(student_id):
    body    = request.get_json() or {}
    user_id = int(get_jwt_identity())
    if not body.get("discount_type_id"):
        return error("discount_type_id is required.", 400)
    db, cur = get_db_cur()
    try:
        override_value = body.get("override_value")
        if override_value in ("", None):
            cur.execute("SELECT is_sibling FROM discount_types WHERE id = %s::integer", (body["discount_type_id"],))
            dt_row = cur.fetchone()
            if dt_row and dt_row["is_sibling"]:
                cur.execute("SELECT sp_get_sibling_rank(%s::integer) AS rank", (student_id,))
                rank = cur.fetchone()["rank"]
                cur.execute("SELECT percentage FROM sibling_discount_tiers WHERE child_no = %s::integer AND is_active = TRUE", (rank,))
                tier = cur.fetchone()
                override_value = tier["percentage"] if tier else None
            else:
                override_value = None
        cur.execute("""
            INSERT INTO student_discounts
                (student_id, discount_type_id, assigned_by, valid_from, valid_until, notes, override_value)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (student_id, discount_type_id)
            DO UPDATE SET is_active=TRUE, assigned_by=%s, valid_from=%s, valid_until=%s, notes=%s, override_value=%s
            RETURNING *
        """, (
            student_id, body["discount_type_id"], user_id,
            body.get("valid_from") or None, body.get("valid_until") or None,
            body.get("notes") or None, override_value,
            user_id, body.get("valid_from") or None,
            body.get("valid_until") or None, body.get("notes") or None, override_value,
        ))
        db.commit()
        return success(data=dict(cur.fetchone()), message="Discount assigned.", status=201)
    except Exception as e:
        db.rollback()
        return error(str(e), 400)


@bp.get("/student/<int:student_id>/sibling-rank")
@jwt_required_custom
@require_permission("finance.view")
def student_sibling_rank(student_id):
    db, cur = get_db_cur()
    cur.execute("SELECT sp_get_sibling_rank(%s::integer) AS rank", (student_id,))
    rank = cur.fetchone()["rank"]
    cur.execute("SELECT percentage FROM sibling_discount_tiers WHERE child_no = %s::integer AND is_active = TRUE", (rank,))
    tier = cur.fetchone()
    return success(data={
        "rank": rank,
        "percentage": float(tier["percentage"]) if tier else None,
    })


@bp.delete("/student/<int:student_id>/<int:discount_id>")
@jwt_required_custom
@require_permission("finance.manage")
def remove_discount(student_id, discount_id):
    db, cur = get_db_cur()
    cur.execute("""
        UPDATE student_discounts SET is_active=FALSE
        WHERE student_id=%s AND id=%s
    """, (student_id, discount_id))
    db.commit()
    return success(message="Discount removed.")


@bp.get("/student/<int:student_id>/summary")
@jwt_required_custom
@require_permission("finance.view")
def discount_summary(student_id):
    db, cur = get_db_cur()
    cur.execute("""
        SELECT sd.id, dt.name, dt.type, COALESCE(sd.override_value, dt.value) AS value,
               sd.valid_from, sd.valid_until, sd.notes, sd.is_active
        FROM student_discounts sd
        JOIN discount_types dt ON dt.id = sd.discount_type_id
        WHERE sd.student_id = %s AND sd.is_active = TRUE
          AND (sd.valid_until IS NULL OR sd.valid_until >= CURRENT_DATE)
          AND (sd.valid_from  IS NULL OR sd.valid_from  <= CURRENT_DATE)
    """, (student_id,))
    discounts = [dict(r) for r in cur.fetchall()]
    total_pct   = min(100, sum(d["value"] for d in discounts if d["type"] == "percentage"))
    total_fixed = sum(d["value"] for d in discounts if d["type"] == "fixed")
    return success(data={
        "discounts":    discounts,
        "total_percentage": float(total_pct),
        "total_fixed":      float(total_fixed),
    })

# ── Sibling Discount Tiers ────────────────────────────────────
@bp.get("/sibling-tiers")
@jwt_required_custom
@require_permission("finance.view")
def get_sibling_tiers():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM sibling_discount_tiers ORDER BY child_no")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.put("/sibling-tiers")
@jwt_required_custom
@require_permission("finance.manage")
def update_sibling_tiers():
    body  = request.get_json() or {}
    tiers = body.get("tiers", [])
    if not tiers:
        return error("tiers array is required.", 400)
    db, cur = get_db_cur()
    cur.execute("DELETE FROM sibling_discount_tiers")
    for tier in tiers:
        child_no   = tier.get("child_no")
        percentage = tier.get("percentage", 0)
        if child_no and int(child_no) >= 2:
            cur.execute("""
                INSERT INTO sibling_discount_tiers (child_no, percentage)
                VALUES (%s, %s)
                ON CONFLICT (child_no) DO UPDATE SET percentage = %s
            """, (child_no, percentage, percentage))
    db.commit()
    return success(message="Sibling discount tiers saved.")