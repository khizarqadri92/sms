# Provident Fund module.
# Lets HR/Finance look up an employee's PF contribution rate (employee %,
# employer %, resolved from a staff-level override or the grade default)
# and their full deduction/contribution transaction ledger with running
# balances. Also lets authorized users configure rates and post manual
# adjustments (e.g. annual interest credit, corrections).
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_permissions import require_permission
from app.api.v1.payroll import _get_effective_grade_components

router = APIRouter()


def _resolve_pf_rate(db, staff_id):
    """Resolves the effective PF employee/employer % for a staff member,
    consistent with how the actual payslip calculation resolves the
    Provident Fund deduction component (grade + department-override aware),
    rather than a separate, unused config table."""
    cur = get_cur(db)

    # An explicit staff-level override (set via /staff-config) always wins.
    cur.execute("SELECT employee_contribution_pct, employer_contribution_pct FROM provident_fund_config WHERE staff_id=%s", (staff_id,))
    override = cur.fetchone()
    if override:
        return float(override["employee_contribution_pct"]), float(override["employer_contribution_pct"]), "employee_override"

    cur.execute("SELECT grade_id, department_id FROM staff_payroll_profile spp JOIN staff s ON s.id=spp.staff_id WHERE spp.staff_id=%s", (staff_id,))
    row = cur.fetchone()
    employee_pct = 0.0
    if row and row["grade_id"]:
        comps = _get_effective_grade_components(db, row["grade_id"], row["department_id"])
        pf_comp = next((c for c in comps if "Provident Fund" in (c.get("component_name") or "")), None)
        if pf_comp:
            employee_pct = float(pf_comp["value"])

    cur.execute("SELECT pf_employer_contribution_mode, pf_employer_percentage FROM payroll_settings WHERE id=1")
    settings = cur.fetchone()
    mode = settings["pf_employer_contribution_mode"] if settings else "same_as_employee"
    if mode == "same_as_employee":
        employer_pct = employee_pct
    elif mode == "percentage":
        employer_pct = float(settings["pf_employer_percentage"])
    else:  # fixed - no meaningful percentage
        employer_pct = 0.0

    source = "grade_default" if employee_pct else "none"
    return employee_pct, employer_pct, source

def get_cur(db):
    return _get_cur(db)

def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})

def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


@router.get("/search")
def pf_search(q: Optional[str] = None, department_id: Optional[int] = None,
        user_id: int = Depends(require_permission("payroll.pf.view_all")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_pf_search(%s, %s)", (q, department_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/staff/{staff_id}/transactions")
def pf_staff_transactions(staff_id: int,
        user_id: int = Depends(require_permission("payroll.pf.view_all")), db=Depends(get_db)):
    cur = get_cur(db)
    emp_pct, empr_pct, source = _resolve_pf_rate(db, staff_id)
    rate = {"employee_contribution_pct": emp_pct, "employer_contribution_pct": empr_pct, "rate_source": source}
    cur.execute("SELECT * FROM sp_pf_get_transactions(%s)", (staff_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["transaction_date"] = str(r["transaction_date"])
    return ok(data={"rate": rate, "transactions": rows})


class PFGradeConfigIn(BaseModel):
    grade_id: int
    employee_contribution_pct: float
    employer_contribution_pct: float


@router.post("/grade-config")
def pf_upsert_grade_config(body: PFGradeConfigIn,
        user_id: int = Depends(require_permission("payroll.pf.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_pf_upsert_grade_config(%s,%s,%s)",
        (body.grade_id, body.employee_contribution_pct, body.employer_contribution_pct))
    db.commit()
    return ok(message="Grade PF rate updated.")


class PFStaffConfigIn(BaseModel):
    staff_id: int
    employee_contribution_pct: float
    employer_contribution_pct: float


@router.post("/staff-config")
def pf_upsert_staff_config(body: PFStaffConfigIn,
        user_id: int = Depends(require_permission("payroll.pf.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_pf_upsert_staff_config(%s,%s,%s)",
        (body.staff_id, body.employee_contribution_pct, body.employer_contribution_pct))
    db.commit()
    return ok(message="Employee PF rate override saved.")


class PFAdjustmentIn(BaseModel):
    staff_id: int
    date: str
    transaction_type: str
    employee_amount: Optional[float] = 0
    employer_amount: Optional[float] = 0
    remarks: Optional[str] = None


@router.post("/adjustment")
def pf_post_adjustment(body: PFAdjustmentIn,
        user_id: int = Depends(require_permission("payroll.pf.manage")), db=Depends(get_db)):
    if body.transaction_type not in ("employee_contribution", "employer_contribution", "interest", "adjustment"):
        fail("Invalid transaction type.", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_pf_post_adjustment(%s,%s,%s,%s,%s,%s,%s)",
        (body.staff_id, body.date, body.transaction_type, body.employee_amount, body.employer_amount,
         body.remarks, user_id))
    db.commit()
    return ok(message="PF transaction posted.")
