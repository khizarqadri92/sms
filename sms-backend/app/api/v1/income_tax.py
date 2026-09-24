# Income Tax module.
# Lets HR/Finance look up an employee's income tax deductions, month by month,
# already computed as part of each payslip's tax-slab calculation. This is
# read-only - income tax has no employer-side counterpart to configure, unlike
# Provident Fund - the figures are derived directly from generated payslips.
from typing import Optional
from fastapi import APIRouter, Depends
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_permissions import require_permission
from app.fastapi_campus import get_current_campus_id, enforce_same_campus

router = APIRouter()

def get_cur(db):
    return _get_cur(db)

def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


@router.get("/search")
def income_tax_search(q: Optional[str] = None, department_id: Optional[int] = None,
        user_id: int = Depends(require_permission("payroll.income_tax.view_all")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_income_tax_search(%s, %s, %s)", (q, department_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/staff/{staff_id}/transactions")
def income_tax_staff_transactions(staff_id: int,
        user_id: int = Depends(require_permission("payroll.income_tax.view_all")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM staff WHERE id=%s", (staff_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("SELECT * FROM sp_income_tax_get_transactions(%s)", (staff_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["transaction_date"] = str(r["transaction_date"])
    return ok(data={"transactions": rows})
