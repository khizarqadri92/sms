"""
Native FastAPI router for Discounts - migrated from app/api/v1/discounts.py.
This module is mostly direct SQL with no chr()-stub SPs.
Only SP used: sp_get_sibling_rank (pre-existing, verified clean).
All direct SQL converted to inline queries here per the project policy
(no new SPs needed for simple CRUD operations on these tables).
"""

from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_campus import get_current_campus_id, enforce_same_campus
from app.fastapi_campus import catalog_campus_id, catalog_campus_id_for_write
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class DiscountTypeIn(BaseModel):
    name: str
    description: Optional[str] = None
    type: Optional[str] = "percentage"
    value: Optional[float] = 0
    is_active: Optional[bool] = True


class AssignDiscountIn(BaseModel):
    discount_type_id: int
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    notes: Optional[str] = None
    override_value: Optional[Any] = None


class SiblingTierIn(BaseModel):
    tiers: List[dict]


# ── Discount Types ────────────────────────────────────────────

@router.get("/types")
def list_types(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("discount_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM discount_types WHERE campus_id = %s OR campus_id IS NULL ORDER BY name", (campus_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/types")
def create_type(body: DiscountTypeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("discount_types"))):
    if not body.name:
        fail("name is required.", 400)
    cur = get_cur(db)
    try:
        cur.execute("""
            INSERT INTO discount_types (name, description, type, value, campus_id)
            VALUES (%s, %s, %s, %s, %s) RETURNING *
        """, (body.name, body.description, body.type or "percentage", body.value or 0, campus_id))
        db.commit()
        return ok(data=dict(cur.fetchone()))
    except Exception as e:
        db.rollback()
        fail(str(e), 400)


@router.put("/types/{type_id}")
def update_type(type_id: int, body: DiscountTypeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("discount_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM discount_types WHERE id=%s", (type_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("""
        UPDATE discount_types
        SET name=%s, description=%s, type=%s, value=%s, is_active=%s
        WHERE id=%s RETURNING *
    """, (body.name, body.description, body.type or "percentage",
          body.value or 0, body.is_active if body.is_active is not None else True, type_id))
    db.commit()
    row = cur.fetchone()
    if not row:
        fail("Not found.", 404)
    return ok(data=dict(row))


@router.delete("/types/{type_id}")
def deactivate_type(type_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("discount_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM discount_types WHERE id=%s", (type_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE discount_types SET is_active=FALSE WHERE id=%s", (type_id,))
    db.commit()
    return ok(message="Discount type deactivated.")


# ── Student Discounts ─────────────────────────────────────────

@router.get("/student/{student_id}")
def student_discounts(student_id: int, user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
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
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("valid_from", "valid_until", "assigned_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


@router.post("/student/{student_id}")
def assign_discount(student_id: int, body: AssignDiscountIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if not body.discount_type_id:
        fail("discount_type_id is required.", 400)
    cur = get_cur(db)
    try:
        override_value = body.override_value
        if override_value in ("", None):
            cur.execute("SELECT is_sibling FROM discount_types WHERE id=%s", (body.discount_type_id,))
            dt_row = cur.fetchone()
            if dt_row and dt_row["is_sibling"]:
                cur.execute("SELECT sp_get_sibling_rank(%s) AS rank", (student_id,))
                rank = cur.fetchone()["rank"]
                cur.execute("SELECT percentage FROM sibling_discount_tiers WHERE child_no=%s AND is_active=TRUE", (rank,))
                tier = cur.fetchone()
                override_value = tier["percentage"] if tier else None
            else:
                override_value = None

        cur.execute("""
            INSERT INTO student_discounts
                (student_id, discount_type_id, assigned_by, valid_from, valid_until, notes, override_value)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (student_id, discount_type_id)
            DO UPDATE SET is_active=TRUE, assigned_by=%s, valid_from=%s, valid_until=%s,
                          notes=%s, override_value=%s
            RETURNING *
        """, (
            student_id, body.discount_type_id, user_id,
            body.valid_from or None, body.valid_until or None,
            body.notes or None, override_value,
            user_id, body.valid_from or None, body.valid_until or None,
            body.notes or None, override_value,
        ))
        db.commit()
        return ok(data=dict(cur.fetchone()), message="Discount assigned.")
    except Exception as e:
        db.rollback()
        fail(str(e), 400)


@router.get("/student/{student_id}/sibling-rank")
def student_sibling_rank(student_id: int, user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_sibling_rank(%s) AS rank", (student_id,))
    rank = cur.fetchone()["rank"]
    cur.execute("SELECT percentage FROM sibling_discount_tiers WHERE child_no=%s AND is_active=TRUE", (rank,))
    tier = cur.fetchone()
    return ok(data={
        "rank": rank,
        "percentage": float(tier["percentage"]) if tier else None,
    })


@router.delete("/student/{student_id}/{discount_id}")
def remove_discount(student_id: int, discount_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE student_discounts SET is_active=FALSE WHERE student_id=%s AND id=%s", (student_id, discount_id))
    db.commit()
    return ok(message="Discount removed.")


@router.get("/student/{student_id}/summary")
def discount_summary(student_id: int, user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT sd.id, dt.name, dt.type, COALESCE(sd.override_value, dt.value) AS value,
               sd.valid_from, sd.valid_until, sd.notes, sd.is_active
        FROM student_discounts sd
        JOIN discount_types dt ON dt.id = sd.discount_type_id
        WHERE sd.student_id = %s AND sd.is_active = TRUE
          AND (sd.valid_until IS NULL OR sd.valid_until >= %s)
          AND (sd.valid_from  IS NULL OR sd.valid_from  <= %s)
    """, (student_id, get_processing_date(db), get_processing_date(db)))
    discounts = [dict(r) for r in cur.fetchall()]
    for d in discounts:
        for k in ("valid_from", "valid_until"):
            if d.get(k): d[k] = str(d[k])
    total_pct   = min(100, sum(d["value"] for d in discounts if d["type"] == "percentage"))
    total_fixed = sum(d["value"] for d in discounts if d["type"] == "fixed")
    return ok(data={
        "discounts": discounts,
        "total_percentage": float(total_pct),
        "total_fixed": float(total_fixed),
    })


# ── Sibling Discount Tiers ────────────────────────────────────

@router.get("/sibling-tiers")
def get_sibling_tiers(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sibling_discount_tiers ORDER BY child_no")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/sibling-tiers")
def update_sibling_tiers(body: SiblingTierIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if not body.tiers:
        fail("tiers array is required.", 400)
    cur = get_cur(db)
    cur.execute("DELETE FROM sibling_discount_tiers")
    for tier in body.tiers:
        child_no   = tier.get("child_no")
        percentage = tier.get("percentage", 0)
        if child_no and int(child_no) >= 2:
            cur.execute("""
                INSERT INTO sibling_discount_tiers (child_no, percentage)
                VALUES (%s, %s)
                ON CONFLICT (child_no) DO UPDATE SET percentage = %s
            """, (child_no, percentage, percentage))
    db.commit()
    return ok(message="Sibling discount tiers saved.")
