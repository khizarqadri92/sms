"""
Native FastAPI router for Leave Setup - migrated from app/api/v1/leave_setup.py.
Fully self-contained inline SQL in the original, now converted to
dedicated stored procedures. The _insert_rules validation logic (checking
each rule has an approver_role) stays in Python since it's business logic,
not a pure SQL concern.
"""

from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_campus import get_current_campus_id, enforce_same_campus
from app.fastapi_campus import catalog_campus_id, catalog_campus_id_for_write

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class RuleIn(BaseModel):
    day_from: Optional[Any] = 1
    day_to: Optional[Any] = None
    recommender_role: Optional[Any] = None
    approver_role: Optional[str] = None
    certificate_required: Optional[bool] = False
    certificate_label: Optional[str] = ""


class LeaveTypeCreateIn(BaseModel):
    name: str
    max_days_per_year: Optional[Any] = None
    notify_mode: Optional[str] = "incharge_only"
    is_active: Optional[bool] = True
    rules: List[RuleIn]


class LeaveTypeUpdateIn(BaseModel):
    name: Optional[str] = None
    max_days_per_year: Optional[Any] = None
    notify_mode: Optional[str] = None
    is_active: Optional[bool] = None
    rules: List[RuleIn]


def _insert_rules(cur, lt_id, rules):
    for i, rule in enumerate(rules):
        if not rule.approver_role:
            return "Rule " + str(i + 1) + " is missing an approver role"
        cur.execute(
            "SELECT sp_insert_leave_approval_rule(%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                lt_id,
                int(rule.day_from or 1),
                int(rule.day_to) if rule.day_to else None,
                rule.recommender_role or None,
                rule.approver_role,
                i,
                bool(rule.certificate_required or False),
                rule.certificate_label or "",
            )
        )
    return None


def _attach_rules(cur, types):
    for lt in types:
        cur.execute("SELECT * FROM sp_get_leave_approval_rules(%s)", (lt["id"],))
        lt["rules"] = [dict(r) for r in cur.fetchall()]
    return types


@router.get("/active-types")
def get_active_leave_types(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("student_leave_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_active_leave_types(%s)", (campus_id,))
    types = [dict(r) for r in cur.fetchall()]
    _attach_rules(cur, types)
    return ok(data=types)


@router.get("/types")
def get_leave_types(user_id: int = Depends(require_permission("leave_type.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("student_leave_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_leave_types(%s)", (campus_id,))
    types = [dict(r) for r in cur.fetchall()]
    _attach_rules(cur, types)
    return ok(data=types)


@router.post("/types")
def create_leave_type(body: LeaveTypeCreateIn, user_id: int = Depends(require_permission("leave_type.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("student_leave_types"))):
    name = (body.name or "").strip()
    if not name:
        fail("Leave type name is required", 400)
    if not body.rules:
        fail("At least one approval rule is required", 400)

    cur = get_cur(db)
    cur.execute("SELECT sp_check_leave_type_name_exists(%s) AS exists", (name,))
    if cur.fetchone()["exists"]:
        fail("Leave type with this name already exists", 400)

    cur.execute(
        "SELECT sp_create_leave_type(%s,%s,%s,%s,%s) AS id",
        (name, int(body.max_days_per_year) if body.max_days_per_year else None, body.notify_mode or "incharge_only", body.is_active if body.is_active is not None else True, campus_id)
    )
    lt_id = cur.fetchone()["id"]

    err = _insert_rules(cur, lt_id, body.rules)
    if err:
        db.rollback()
        fail(err, 400)

    db.commit()
    return ok(data={"id": lt_id}, message="Leave type created.")


@router.put("/types/{lt_id}")
def update_leave_type(lt_id: int, body: LeaveTypeUpdateIn, user_id: int = Depends(require_permission("leave_type.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("student_leave_types"))):
    if not body.rules:
        fail("At least one approval rule is required", 400)

    cur = get_cur(db)
    cur.execute("SELECT sp_check_leave_type_exists(%s) AS exists", (lt_id,))
    if not cur.fetchone()["exists"]:
        fail("Leave type not found", 404)
    cur.execute("SELECT campus_id FROM leave_types WHERE id=%s", (lt_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)

    cur.execute(
        "SELECT sp_update_leave_type(%s,%s,%s,%s,%s)",
        (lt_id, body.name, int(body.max_days_per_year) if body.max_days_per_year else None, body.notify_mode, body.is_active)
    )

    cur.execute("SELECT sp_delete_leave_approval_rules(%s)", (lt_id,))

    err = _insert_rules(cur, lt_id, body.rules)
    if err:
        db.rollback()
        fail(err, 400)

    db.commit()
    return ok(message="Leave type updated.")


@router.delete("/types/{lt_id}")
def delete_leave_type(lt_id: int, user_id: int = Depends(require_permission("leave_type.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("student_leave_types"))):
    cur = get_cur(db)
    cur.execute("SELECT sp_check_leave_type_exists(%s) AS exists", (lt_id,))
    if not cur.fetchone()["exists"]:
        fail("Leave type not found", 404)
    cur.execute("SELECT campus_id FROM leave_types WHERE id=%s", (lt_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)

    cur.execute("SELECT sp_check_leave_requests_exist(%s) AS exists", (lt_id,))
    if cur.fetchone()["exists"]:
        fail("Cannot delete leave requests exist for this type. Deactivate instead.", 400)

    cur.execute("SELECT sp_delete_leave_type(%s)", (lt_id,))
    db.commit()
    return ok(message="Leave type deleted.")
