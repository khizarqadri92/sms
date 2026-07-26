"""
Payroll module.
Phase 1: Payroll Components setup (Earnings & Deductions).
Phase 2: Grades - reusable salary templates attached to components.
Phase 3 (next): Employee salary assignment + payroll processing.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur
from psycopg2.extras import Json

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def require_permission(perm: str):
    def dep(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
        cur = get_cur(db)
        cur.execute("""SELECT 1 FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id=ur.role_id
            JOIN permissions p ON p.id=rp.permission_id
            WHERE ur.user_id=%s AND p.code=%s LIMIT 1""", (user_id, perm))
        if not cur.fetchone():
            fail("You do not have permission to perform this action.", 403)
        return user_id
    return dep


# --- PAYROLL COMPONENTS (Earnings & Deductions setup) ---
class PayrollComponentIn(BaseModel):
    name: str
    component_type: str
    calculation_type: str = "fixed"
    is_permanent: bool = True
    is_taxable: bool = True
    is_statutory: bool = False
    is_basic: bool = False
    is_income_tax: bool = False


def _validate_component_fields(body):
    if body.component_type not in ("earning", "deduction"):
        fail("Component type must be 'earning' or 'deduction'.", 400)
    if body.calculation_type not in ("fixed", "percent_of_basic", "percent_of_gross", "per_day", "tax_slab"):
        fail("Invalid calculation type.", 400)
    if body.is_basic and body.component_type != "earning":
        fail("Only an Earning component can be marked as Basic Salary.", 400)
    if body.calculation_type == "tax_slab" and body.component_type != "deduction":
        fail("Tax Slab calculation can only be used for a Deduction component.", 400)


@router.get("/components")
def list_components(component_type: Optional[str] = None,
        user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_payroll_components(%s)", (component_type,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/components")
def create_component(body: PayrollComponentIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    _validate_component_fields(body)
    cur = get_cur(db)
    is_income_tax = body.calculation_type == "tax_slab"
    if body.is_basic:
        cur.execute("UPDATE payroll_components SET is_basic=false WHERE is_basic=true")
    if is_income_tax:
        cur.execute("UPDATE payroll_components SET is_income_tax=false, calculation_type='fixed' WHERE is_income_tax=true")
    cur.execute("SELECT * FROM sp_create_payroll_component(%s,%s,%s,%s,%s,%s)",
        (body.name, body.component_type, body.calculation_type, body.is_permanent, body.is_taxable, body.is_statutory))
    new_id = cur.fetchone()["id"]
    if body.is_basic:
        cur.execute("UPDATE payroll_components SET is_basic=true WHERE id=%s", (new_id,))
    cur.execute("UPDATE payroll_components SET is_income_tax=%s WHERE id=%s", (is_income_tax, new_id))
    db.commit()
    return ok(data={"id": new_id}, message="Component created.")


class PayrollComponentUpdateIn(PayrollComponentIn):
    is_active: bool = True


@router.put("/components/{comp_id}")
def update_component(comp_id: int, body: PayrollComponentUpdateIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    _validate_component_fields(body)
    cur = get_cur(db)
    is_income_tax = body.calculation_type == "tax_slab"
    if body.is_basic:
        cur.execute("UPDATE payroll_components SET is_basic=false WHERE is_basic=true AND id!=%s", (comp_id,))
    if is_income_tax:
        cur.execute("UPDATE payroll_components SET is_income_tax=false, calculation_type='fixed' WHERE is_income_tax=true AND id!=%s", (comp_id,))
    cur.execute("SELECT sp_update_payroll_component(%s,%s,%s,%s,%s,%s,%s,%s)",
        (comp_id, body.name, body.component_type, body.calculation_type,
         body.is_permanent, body.is_taxable, body.is_statutory, body.is_active))
    if body.is_basic:
        cur.execute("UPDATE payroll_components SET is_basic=true WHERE id=%s", (comp_id,))
    cur.execute("UPDATE payroll_components SET is_income_tax=%s WHERE id=%s", (is_income_tax, comp_id))
    db.commit()
    return ok(message="Component updated.")


@router.delete("/components/{comp_id}")
def deactivate_component(comp_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_payroll_component(%s)", (comp_id,))
    db.commit()
    return ok(message="Component deactivated.")


# --- PAYROLL SETTINGS (global) ---
@router.get("/settings")
def get_payroll_settings(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM payroll_settings WHERE id=1")
    return ok(data=dict(cur.fetchone()))


class PayrollSettingsIn(BaseModel):
    basic_salary_mode: str
    days_in_month_mode: str = "fixed_30"
    fixed_days_value: int = 30


@router.put("/settings")
def update_payroll_settings(body: PayrollSettingsIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    if body.basic_salary_mode not in ("grade_fixed", "individual"):
        fail("Invalid basic salary mode.", 400)
    if body.days_in_month_mode not in ("fixed_30", "actual"):
        fail("Invalid days-in-month mode.", 400)
    if body.fixed_days_value < 1 or body.fixed_days_value > 31:
        fail("Fixed days value must be between 1 and 31.", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_update_payroll_settings(%s,%s,%s)", (body.basic_salary_mode, body.days_in_month_mode, body.fixed_days_value))
    db.commit()
    return ok(message="Payroll settings updated.")


# --- GRADES (reusable salary templates) ---
class GradeIn(BaseModel):
    name: str
    description: Optional[str] = None


@router.get("/grades")
def list_grades(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_grades()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/grades")
def create_grade(body: GradeIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_grade(%s,%s)", (body.name, body.description))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Grade created.")


class GradeUpdateIn(GradeIn):
    is_active: bool = True


@router.put("/grades/{grade_id}")
def update_grade(grade_id: int, body: GradeUpdateIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_update_grade(%s,%s,%s,%s)", (grade_id, body.name, body.description, body.is_active))
    db.commit()
    return ok(message="Grade updated.")


# --- GRADE <-> COMPONENTS (attach components with values) ---
@router.get("/grades/{grade_id}/components")
def get_grade_components(grade_id: int, user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_grade_components(%s)", (grade_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


class GradeComponentIn(BaseModel):
    component_id: int
    value: float


@router.post("/grades/{grade_id}/components")
def upsert_grade_component(grade_id: int, body: GradeComponentIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT is_basic FROM payroll_components WHERE id=%s", (body.component_id,))
    comp = cur.fetchone()
    if comp and comp["is_basic"]:
        cur.execute("SELECT basic_salary_mode FROM payroll_settings WHERE id=1")
        mode = cur.fetchone()["basic_salary_mode"]
        if mode == "individual":
            fail("Basic Salary is set per-employee under the current payroll settings, not per-grade.", 400)
    cur.execute("SELECT sp_upsert_grade_component(%s,%s,%s)", (grade_id, body.component_id, body.value))
    db.commit()
    return ok(message="Component attached to grade.")


@router.delete("/grades/{grade_id}/components/{component_id}")
def remove_grade_component(grade_id: int, component_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_remove_grade_component(%s,%s)", (grade_id, component_id))
    db.commit()
    return ok(message="Component removed from grade.")


# --- STAFF PAYROLL PROFILE (salary type + type-specific amount, attached to a staff member) ---
class StaffPayrollProfileIn(BaseModel):
    salary_type: str
    lump_sum_amount: Optional[float] = None
    basic_salary: Optional[float] = None
    grade_id: Optional[int] = None
    hourly_rate: Optional[float] = None
    daily_wage_amount: Optional[float] = None


@router.get("/staff/{staff_id}/profile")
def get_staff_payroll_profile(staff_id: int, user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_payroll_profile(%s)", (staff_id,))
    return ok(data=dict(cur.fetchone()))


@router.put("/staff/{staff_id}/profile")
def update_staff_payroll_profile(staff_id: int, body: StaffPayrollProfileIn,
        user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    if body.salary_type not in ("lump_sum", "structured", "hourly", "daily_wage"):
        fail("Invalid salary type.", 400)
    if body.salary_type == "lump_sum" and body.lump_sum_amount is None:
        fail("Lump Sum Salary requires an amount.", 400)
    if body.salary_type == "hourly" and body.hourly_rate is None:
        fail("Hourly Salary requires a per-hour rate.", 400)
    if body.salary_type == "daily_wage" and body.daily_wage_amount is None:
        fail("Daily Wage requires a daily amount.", 400)
    if body.salary_type == "structured" and not body.grade_id:
        fail("Structured Salary requires a Grade to be selected.", 400)
    cur = get_cur(db)
    if body.salary_type == "structured":
        cur.execute("SELECT basic_salary_mode FROM payroll_settings WHERE id=1")
        mode = cur.fetchone()["basic_salary_mode"]
        if mode == "individual" and body.basic_salary is None:
            fail("Basic Salary is required for this employee under the current payroll settings.", 400)
    cur.execute("SELECT sp_upsert_staff_payroll_profile(%s,%s,%s,%s,%s,%s,%s)",
        (staff_id, body.salary_type, body.lump_sum_amount, body.basic_salary,
         body.grade_id, body.hourly_rate, body.daily_wage_amount))
    db.commit()
    return ok(message="Salary profile updated.")


# --- PAYROLL ADJUSTMENTS (one-time, month-specific entries for variable components) ---
def _get_days_in_month(db, month=None, year=None):
    cur = get_cur(db)
    cur.execute("SELECT days_in_month_mode, fixed_days_value FROM payroll_settings WHERE id=1")
    drow = cur.fetchone()
    if drow["days_in_month_mode"] == "actual" and month and year:
        import calendar
        return calendar.monthrange(year, month)[1]
    return drow["fixed_days_value"]


def _resolve_basis_salary(db, staff_id, month=None, year=None):
    """Returns a monthly-equivalent base figure for this employee, regardless of
    their salary type, or None if unavailable (e.g. field never filled in)."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_payroll_profile(%s)", (staff_id,))
    profile = cur.fetchone()
    if not profile:
        return None
    st = profile["salary_type"]
    if st == "lump_sum":
        return float(profile["lump_sum_amount"]) if profile["lump_sum_amount"] is not None else None
    if st == "daily_wage":
        if profile["daily_wage_amount"] is None:
            return None
        return float(profile["daily_wage_amount"]) * _get_days_in_month(db, month, year)
    if st == "hourly":
        if profile["hourly_rate"] is None:
            return None
        return float(profile["hourly_rate"]) * _get_days_in_month(db, month, year)
    if st == "structured":
        cur.execute("SELECT basic_salary_mode FROM payroll_settings WHERE id=1")
        mode = cur.fetchone()["basic_salary_mode"]
        if mode == "individual":
            return float(profile["basic_salary"]) if profile["basic_salary"] is not None else None
        if not profile["grade_id"]:
            return None
        cur.execute("""SELECT gc.value FROM payroll_grade_components gc
            JOIN payroll_components c ON c.id=gc.component_id
            WHERE gc.grade_id=%s AND c.is_basic=true""", (profile["grade_id"],))
        row = cur.fetchone()
        return float(row["value"]) if row else None
    return None


def _resolve_amount(db, staff_id, amount_type, raw_value, month=None, year=None):
    """Returns (amount, error_message). error_message is None on success.
    For 'days' mode, the divisor comes from the payroll_settings days_in_month_mode:
    either a fixed 30, or the actual number of calendar days in the adjustment's
    own target month/year (not the current real-world month)."""
    if amount_type == "fixed":
        return raw_value, None
    basis = _resolve_basis_salary(db, staff_id, month, year)
    if basis is None:
        return None, "No base salary figure available for this employee."
    if amount_type == "percent_of_basic":
        return round(basis * raw_value / 100.0, 2), None
    if amount_type == "days":
        days_in_month = _get_days_in_month(db, month, year)
        return round((basis / days_in_month) * raw_value, 2), None
    return None, "Invalid amount type."


class PayrollAdjustmentIn(BaseModel):
    staff_id: int
    component_id: int
    month: int
    year: int
    amount: float
    amount_type: str = "fixed"
    note: Optional[str] = None


@router.get("/adjustments")
def list_adjustments(staff_id: Optional[int] = None, month: Optional[int] = None, year: Optional[int] = None,
        user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_payroll_adjustments(%s,%s,%s)", (staff_id, month, year))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/adjustments")
def _check_period_not_locked(db, month, year):
    cur = get_cur(db)
    cur.execute("SELECT status FROM payroll_runs WHERE month=%s AND year=%s", (month, year))
    run = cur.fetchone()
    if run and run["status"] != "draft":
        fail("Adjustments for this period are locked - it has already been submitted to Finance.", 400)


def create_adjustment(body: PayrollAdjustmentIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    if body.month < 1 or body.month > 12:
        fail("Invalid month.", 400)
    _check_period_not_locked(db, body.month, body.year)
    cur = get_cur(db)
    cur.execute("SELECT is_permanent FROM payroll_components WHERE id=%s", (body.component_id,))
    comp = cur.fetchone()
    if not comp:
        fail("Component not found.", 404)
    if comp["is_permanent"]:
        fail("Only variable components (Part of Salary = No) can be used for one-time adjustments.", 400)
    if body.amount_type not in ("fixed", "percent_of_basic", "days"):
        fail("Invalid amount type.", 400)
    resolved_amount, err = _resolve_amount(db, body.staff_id, body.amount_type, body.amount, body.month, body.year)
    if err:
        fail(err, 400)
    cur.execute("SELECT * FROM sp_create_payroll_adjustment(%s,%s,%s,%s,%s,%s,%s)",
        (body.staff_id, body.component_id, body.month, body.year, resolved_amount, body.note, user_id))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Adjustment added.")


@router.delete("/adjustments/{adj_id}")
def delete_adjustment(adj_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_payroll_adjustment(%s)", (adj_id,))
    db.commit()
    return ok(message="Adjustment removed.")


@router.get("/staff-list")
def payroll_staff_list(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    """Lightweight staff list for payroll dropdowns - gated by payroll.view instead
    of hr.view, so finance_officer (and anyone else with payroll access but not
    full HR access) can still use Payroll Adjustments, Salary tab, etc."""
    cur = get_cur(db)
    cur.execute("""SELECT s.id, s.first_name, s.last_name, s.department_id, d.name AS department_name
        FROM staff s LEFT JOIN departments d ON d.id = s.department_id
        WHERE s.status = \'active\' ORDER BY s.first_name""")
    return ok(data=[dict(r) for r in cur.fetchall()])


# --- BULK PAYROLL ADJUSTMENTS (multiple employees / department(s) / whole school) ---
class BulkAdjustmentEntry(BaseModel):
    staff_id: int
    amount: float


class BulkAdjustmentIn(BaseModel):
    component_id: int
    month: int
    year: int
    note: Optional[str] = None
    amount_type: str = "fixed"
    entries: list[BulkAdjustmentEntry]


@router.post("/adjustments/bulk")
def create_bulk_adjustments(body: BulkAdjustmentIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    if body.month < 1 or body.month > 12:
        fail("Invalid month.", 400)
    if not body.entries:
        fail("No employees selected.", 400)
    _check_period_not_locked(db, body.month, body.year)
    cur = get_cur(db)
    cur.execute("SELECT is_permanent FROM payroll_components WHERE id=%s", (body.component_id,))
    comp = cur.fetchone()
    if not comp:
        fail("Component not found.", 404)
    if comp["is_permanent"]:
        fail("Only variable components (Part of Salary = No) can be used for one-time adjustments.", 400)
    if body.amount_type not in ("fixed", "percent_of_basic", "days"):
        fail("Invalid amount type.", 400)

    created = 0
    skipped = []
    for entry in body.entries:
        resolved_amount, err = _resolve_amount(db, entry.staff_id, body.amount_type, entry.amount, body.month, body.year)
        if err:
            cur.execute("SELECT first_name, last_name FROM staff WHERE id=%s", (entry.staff_id,))
            srow = cur.fetchone()
            name = (srow["first_name"] + " " + srow["last_name"]) if srow else ("staff #" + str(entry.staff_id))
            skipped.append(name)
            continue
        cur.execute("SELECT * FROM sp_create_payroll_adjustment(%s,%s,%s,%s,%s,%s,%s)",
            (entry.staff_id, body.component_id, body.month, body.year, resolved_amount, body.note, user_id))
        cur.fetchone()
        created += 1
    db.commit()
    msg = str(created) + " adjustment(s) created."
    if skipped:
        msg += " Skipped (no base salary available): " + ", ".join(skipped) + "."
    return ok(data={"created_count": created, "skipped": skipped}, message=msg)


@router.get("/departments-list")
def payroll_departments_list(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    """Lightweight full department list for payroll dropdowns - gated by payroll.view,
    and includes every department (not just ones with active staff)."""
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM departments ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/designations-list")
def payroll_designations_list(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT d.id, d.name, d.department_id, dept.name AS department_name
        FROM designations d LEFT JOIN departments dept ON dept.id = d.department_id
        WHERE d.is_active = true ORDER BY dept.name, d.name""")
    return ok(data=[dict(r) for r in cur.fetchall()])


# --- DESIGNATION <-> GRADE MAPPING ---
@router.get("/designation-grades")
def list_designation_grades(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_designation_grades()")
    return ok(data=[dict(r) for r in cur.fetchall()])


class DesignationGradeIn(BaseModel):
    designation_id: int
    grade_id: int


@router.post("/designation-grades")
def upsert_designation_grade(body: DesignationGradeIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_upsert_designation_grade(%s,%s)", (body.designation_id, body.grade_id))
    db.commit()
    return ok(message="Designation-Grade mapping saved.")


@router.delete("/designation-grades/{designation_id}")
def remove_designation_grade(designation_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_remove_designation_grade(%s)", (designation_id,))
    db.commit()
    return ok(message="Mapping removed.")


# --- GRADE <-> DEPARTMENT-SPECIFIC COMPONENT OVERRIDES ---
@router.get("/grades/{grade_id}/department-components/{department_id}")
def get_grade_department_components(grade_id: int, department_id: int,
        user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_grade_department_components(%s,%s)", (grade_id, department_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


class GradeDepartmentComponentIn(BaseModel):
    component_id: int
    value: float


@router.post("/grades/{grade_id}/department-components/{department_id}")
def upsert_grade_department_component(grade_id: int, department_id: int, body: GradeDepartmentComponentIn,
        user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_upsert_grade_department_component(%s,%s,%s,%s)", (grade_id, department_id, body.component_id, body.value))
    db.commit()
    return ok(message="Department-specific override saved.")


@router.delete("/grades/{grade_id}/department-components/{department_id}/{component_id}")
def remove_grade_department_component(grade_id: int, department_id: int, component_id: int,
        user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_remove_grade_department_component(%s,%s,%s)", (grade_id, department_id, component_id))
    db.commit()
    return ok(message="Override removed.")


# --- INCOME TAX SLABS (progressive annual brackets, monthly deduction derived from them) ---
class TaxSlabSetIn(BaseModel):
    name: str


@router.get("/tax-slab-sets")
def list_tax_slab_sets(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_tax_slab_sets()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/tax-slab-sets")
def create_tax_slab_set(body: TaxSlabSetIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_tax_slab_set(%s)", (body.name,))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Tax slab set created.")


@router.post("/tax-slab-sets/{set_id}/activate")
def activate_tax_slab_set(set_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_set_active_tax_slab_set(%s)", (set_id,))
    db.commit()
    return ok(message="Tax slab set activated.")


@router.delete("/tax-slab-sets/{set_id}")
def delete_tax_slab_set(set_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_tax_slab_set(%s)", (set_id,))
    db.commit()
    return ok(message="Tax slab set deleted.")


@router.get("/tax-slab-sets/{set_id}/slabs")
def get_tax_slabs(set_id: int, user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_tax_slabs(%s)", (set_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


class TaxSlabIn(BaseModel):
    id: Optional[int] = None
    min_income: float
    max_income: Optional[float] = None
    fixed_amount: float = 0
    rate_percent: float = 0
    sort_order: int = 0


@router.post("/tax-slab-sets/{set_id}/slabs")
def upsert_tax_slab(set_id: int, body: TaxSlabIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_upsert_tax_slab(%s,%s,%s,%s,%s,%s,%s)",
        (body.id, set_id, body.min_income, body.max_income, body.fixed_amount, body.rate_percent, body.sort_order))
    slab_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": slab_id}, message="Slab saved.")


@router.delete("/tax-slabs/{slab_id}")
def delete_tax_slab(slab_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_tax_slab(%s)", (slab_id,))
    db.commit()
    return ok(message="Slab removed.")


def _calculate_annual_tax(db, annual_income):
    """Progressive slab calculation using the currently active slab set.
    Returns (annual_tax, slab_set_name) or (None, None) if no active set exists."""
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM payroll_tax_slab_sets WHERE is_active = true LIMIT 1")
    active_set = cur.fetchone()
    if not active_set:
        return None, None
    cur.execute("SELECT * FROM sp_get_tax_slabs(%s)", (active_set["id"],))
    slabs = [dict(r) for r in cur.fetchall()]
    for slab in slabs:
        lo = float(slab["min_income"])
        hi = float(slab["max_income"]) if slab["max_income"] is not None else None
        if annual_income >= lo and (hi is None or annual_income <= hi):
            tax = float(slab["fixed_amount"]) + (annual_income - lo) * float(slab["rate_percent"]) / 100.0
            return round(tax, 2), active_set["name"]
    return 0.0, active_set["name"]


@router.get("/tax-slabs/calculate")
def calculate_tax_preview(monthly_income: float, user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    annual_income = monthly_income * 12
    annual_tax, slab_set_name = _calculate_annual_tax(db, annual_income)
    if annual_tax is None:
        fail("No active tax slab set configured.", 400)
    monthly_tax = round(annual_tax / 12.0, 2)
    return ok(data={
        "annual_income": annual_income, "annual_tax": annual_tax,
        "monthly_tax": monthly_tax, "slab_set_name": slab_set_name,
    })


# --- PAYROLL PROCESSING (monthly run -> payslips, attendance-integrated, workflow-approved, frozen once approved) ---
def _get_effective_grade_components(db, grade_id, department_id):
    """Merges department-specific overrides on top of grade defaults.
    Returns list of dicts: component_id, name, component_type, calculation_type, is_basic, value."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_grade_components(%s)", (grade_id,))
    defaults = {r["component_id"]: dict(r) for r in cur.fetchall()}
    if department_id:
        cur.execute("SELECT * FROM sp_get_grade_department_components(%s,%s)", (grade_id, department_id))
        for r in cur.fetchall():
            row = dict(r)
            defaults[row["component_id"]] = row
    return list(defaults.values())


def _get_month_attendance_stats(db, staff_id, from_date, to_date):
    """Returns (days_present, days_absent, days_half_day, days_on_leave, total_hours_worked)."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_attendance_daily_status(%s,%s,%s)", (staff_id, from_date, to_date))
    rows = [dict(r) for r in cur.fetchall()]
    present = sum(1 for r in rows if r["status"] == "present")
    absent = sum(1 for r in rows if r["status"] == "absent")
    half_day = sum(1 for r in rows if r["status"] == "half_day")
    on_leave = sum(1 for r in rows if r["status"] == "on_leave")

    cur.execute("""SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out_at, NOW()) - clock_in_at)) / 3600.0), 0) AS total_hours
        FROM staff_attendance_sessions WHERE staff_id=%s AND clock_in_at::date BETWEEN %s AND %s""",
        (staff_id, from_date, to_date))
    total_hours = float(cur.fetchone()["total_hours"])
    return present, absent, half_day, on_leave, total_hours


def _calculate_payslip_for_staff(db, staff_id, month, year, from_date, to_date):
    """Computes one employee's full payslip breakdown for the given period.
    from_date/to_date are the run's actual attendance window (may be a custom
    cycle like the 26th to the 25th, not necessarily the calendar month).
    Returns a dict ready to persist via sp_upsert_payslip, or None if no payroll
    profile exists for this employee (they're skipped from the run)."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_payroll_profile(%s)", (staff_id,))
    profile = cur.fetchone()
    if not profile or not profile["salary_type"]:
        return None

    days_in_month = _get_days_in_month(db, month, year)
    present, absent, half_day, on_leave, hours_worked = _get_month_attendance_stats(db, staff_id, from_date, to_date)

    earnings = []
    deductions = []
    salary_type = profile["salary_type"]

    if salary_type == "lump_sum":
        amount = float(profile["lump_sum_amount"] or 0)
        earnings.append({"name": "Lump Sum Salary", "amount": amount})

    elif salary_type == "hourly":
        rate = float(profile["hourly_rate"] or 0)
        amount = round(rate * hours_worked, 2)
        earnings.append({"name": "Hourly Pay (" + str(round(hours_worked, 2)) + " hrs)", "amount": amount})

    elif salary_type == "daily_wage":
        rate = float(profile["daily_wage_amount"] or 0)
        effective_days = present + 0.5 * half_day
        amount = round(rate * effective_days, 2)
        earnings.append({"name": "Daily Wage (" + str(effective_days) + " day(s))", "amount": amount})

    elif salary_type == "structured":
        cur.execute("SELECT basic_salary_mode FROM payroll_settings WHERE id=1")
        mode = cur.fetchone()["basic_salary_mode"]
        basic_amount = 0.0
        if mode == "individual":
            basic_amount = float(profile["basic_salary"] or 0)
        elif profile["grade_id"]:
            cur.execute("""SELECT gc.value FROM payroll_grade_components gc
                JOIN payroll_components c ON c.id=gc.component_id
                WHERE gc.grade_id=%s AND c.is_basic=true""", (profile["grade_id"],))
            row = cur.fetchone()
            basic_amount = float(row["value"]) if row else 0.0
        earnings.append({"name": "Basic Salary", "amount": round(basic_amount, 2)})

        if profile["grade_id"]:
            comps = _get_effective_grade_components(db, profile["grade_id"], None)
            cur.execute("SELECT department_id FROM staff WHERE id=%s", (staff_id,))
            srow = cur.fetchone()
            dept_id = srow["department_id"] if srow else None
            if dept_id:
                comps = _get_effective_grade_components(db, profile["grade_id"], dept_id)

            gross_so_far = basic_amount
            deferred_gross_pct = []
            for comp in comps:
                if comp["is_basic"] or comp["calculation_type"] == "tax_slab":
                    continue
                ct = comp["calculation_type"]
                val = float(comp["value"] or 0)
                if ct == "fixed" or ct == "per_day":
                    amount = val
                elif ct == "percent_of_basic":
                    amount = round(basic_amount * val / 100.0, 2)
                elif ct == "percent_of_gross":
                    deferred_gross_pct.append((comp, val))
                    continue
                else:
                    amount = 0.0
                target = earnings if comp["component_type"] == "earning" else deductions
                target.append({"name": comp["component_name"], "amount": amount})
                if comp["component_type"] == "earning":
                    gross_so_far += amount

            for comp, val in deferred_gross_pct:
                amount = round(gross_so_far * val / 100.0, 2)
                target = earnings if comp["component_type"] == "earning" else deductions
                target.append({"name": comp["component_name"], "amount": amount})

        if absent > 0 and basic_amount > 0:
            absence_amount = round((basic_amount / days_in_month) * absent, 2)
            deductions.append({"name": "Absence Deduction (Attendance)", "amount": absence_amount})

    gross_earnings = round(sum(e["amount"] for e in earnings), 2)

    cur.execute("SELECT * FROM sp_list_payroll_adjustments(%s,%s,%s)", (staff_id, month, year))
    for adj in cur.fetchall():
        target = earnings if adj["component_type"] == "earning" else deductions
        target.append({"name": adj["component_name"] + " (Adjustment)", "amount": float(adj["amount"])})
        if adj["component_type"] == "earning":
            gross_earnings += float(adj["amount"])

    annual_tax, _ = _calculate_annual_tax(db, gross_earnings * 12)
    if annual_tax is not None:
        monthly_tax = round(annual_tax / 12.0, 2)
        if monthly_tax > 0:
            deductions.append({"name": "Income Tax", "amount": monthly_tax})

    total_deductions = round(sum(d["amount"] for d in deductions), 2)
    net_pay = round(gross_earnings - total_deductions, 2)

    return {
        "salary_type": salary_type, "gross_earnings": gross_earnings, "total_deductions": total_deductions,
        "net_pay": net_pay, "earnings_breakdown": earnings, "deductions_breakdown": deductions,
        "days_present": present, "days_absent": absent, "days_half_day": half_day,
        "days_on_leave": on_leave, "hours_worked": round(hours_worked, 2),
    }


class PayrollRunIn(BaseModel):
    month: int
    year: int
    from_date: Optional[str] = None
    to_date: Optional[str] = None


@router.get("/runs")
def list_payroll_runs(user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_payroll_runs()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/runs")
def create_payroll_run(body: PayrollRunIn, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    if body.month < 1 or body.month > 12:
        fail("Invalid month.", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_payroll_run(%s,%s,%s,%s,%s)",
        (body.month, body.year, user_id, body.from_date or None, body.to_date or None))
    row = cur.fetchone()
    if row["error_msg"]:
        fail(row["error_msg"], 400)
    db.commit()
    return ok(data={"id": row["id"]}, message="Payroll run created.")


@router.post("/runs/{run_id}/hr-submit")
def hr_submit_payroll_run(run_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    """HR marks their configuration (incentives/arrears/adjustments) as done and
    hands the run off to Finance. Adjustments for this period become locked."""
    cur = get_cur(db)
    cur.execute("SELECT status FROM payroll_runs WHERE id=%s", (run_id,))
    run = cur.fetchone()
    if not run:
        fail("Payroll run not found.", 404)
    if run["status"] != "draft":
        fail("Only a draft run can be submitted to Finance.", 400)
    cur.execute("SELECT sp_update_payroll_run_status(%s,%s,%s)", (run_id, "hr_submitted", None))
    db.commit()
    return ok(message="Submitted to Finance. Adjustments for this period are now locked.")


@router.post("/runs/{run_id}/generate")
def generate_payroll_run(run_id: int, user_id: int = Depends(require_permission("payroll.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM payroll_runs WHERE id=%s", (run_id,))
    run = cur.fetchone()
    if not run:
        fail("Payroll run not found.", 404)
    if run["status"] != "hr_submitted":
        fail("HR must submit this period to Finance before it can be generated. Current status: " + run["status"] + ".", 400)

    cur.execute("SELECT sp_clear_payslips(%s)", (run_id,))
    cur.execute("SELECT id FROM staff WHERE status='active'")
    staff_ids = [r["id"] for r in cur.fetchall()]

    generated = 0
    skipped = 0
    for sid in staff_ids:
        result = _calculate_payslip_for_staff(db, sid, run["month"], run["year"], run["from_date"], run["to_date"])
        if result is None:
            skipped += 1
            continue
        cur.execute("SELECT * FROM sp_upsert_payslip(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (run_id, sid, result["salary_type"], result["gross_earnings"], result["total_deductions"], result["net_pay"],
             Json(result["earnings_breakdown"]), Json(result["deductions_breakdown"]),
             result["days_present"], result["days_absent"], result["days_half_day"], result["days_on_leave"], result["hours_worked"]))
        generated += 1
    db.commit()
    return ok(data={"generated": generated, "skipped": skipped},
        message=str(generated) + " payslip(s) generated" + (", " + str(skipped) + " skipped (no salary profile)." if skipped else "."))


@router.get("/runs/{run_id}/payslips")
def get_payslips(run_id: int, user_id: int = Depends(require_permission("payroll.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_payslips(%s)", (run_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/runs/{run_id}/hr-summary")
def hr_payroll_summary(run_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    """Lightweight configuration summary for HR to review before submitting to
    Finance: what's included/deducted (names only, no computed amounts) plus
    this month's adjustments (with amounts, since HR entered those directly)
    and attendance counts. No salary calculation happens here - that's Finance's job."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM payroll_runs WHERE id=%s", (run_id,))
    run = cur.fetchone()
    if not run:
        fail("Payroll run not found.", 404)

    from_date = run["from_date"]
    to_date = run["to_date"]

    cur.execute("SELECT id, first_name, last_name, department_id FROM staff WHERE status='active' ORDER BY first_name")
    staff_rows = cur.fetchall()

    summary = []
    for s in staff_rows:
        cur.execute("SELECT * FROM sp_get_staff_payroll_profile(%s)", (s["id"],))
        profile = cur.fetchone()
        if not profile or not profile["salary_type"]:
            continue

        earning_items = []
        deduction_items = []
        salary_type = profile["salary_type"]

        if salary_type == "lump_sum":
            earning_items.append("Lump Sum Salary")
        elif salary_type == "hourly":
            earning_items.append("Hourly Pay")
        elif salary_type == "daily_wage":
            earning_items.append("Daily Wage")
        elif salary_type == "structured":
            earning_items.append("Basic Salary")
            if profile["grade_id"]:
                comps = _get_effective_grade_components(db, profile["grade_id"], s["department_id"])
                for comp in comps:
                    if comp["is_basic"]:
                        continue
                    target = earning_items if comp["component_type"] == "earning" else deduction_items
                    target.append(comp["component_name"])
            deduction_items.append("Absence Deduction (if any, from Attendance)")

        deduction_items.append("Income Tax (per Tax Slabs)")

        cur.execute("SELECT * FROM sp_list_payroll_adjustments(%s,%s,%s)", (s["id"], run["month"], run["year"]))
        adjustments = [{"name": a["component_name"], "amount": float(a["amount"]), "type": a["component_type"]} for a in cur.fetchall()]

        present, absent, half_day, on_leave, hours_worked = _get_month_attendance_stats(db, s["id"], from_date, to_date)

        summary.append({
            "staff_id": s["id"], "staff_name": s["first_name"] + " " + s["last_name"], "salary_type": salary_type,
            "earning_items": earning_items, "deduction_items": deduction_items, "adjustments": adjustments,
            "days_present": present, "days_absent": absent, "days_half_day": half_day,
            "days_on_leave": on_leave, "hours_worked": round(hours_worked, 2),
        })
    return ok(data=summary)


@router.get("/runs/{run_id}/preview")
def preview_payroll_run(run_id: int, user_id: int = Depends(require_permission("payroll.edit")), db=Depends(get_db)):
    """Read-only, non-persisted preview of what each employee's payslip would look
    like right now, based on current salary profiles + adjustments + attendance.
    Lets HR review their configuration (incentives/arrears/deductions) before
    submitting the period to Finance. Available while the run is still a draft."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM payroll_runs WHERE id=%s", (run_id,))
    run = cur.fetchone()
    if not run:
        fail("Payroll run not found.", 404)
    cur.execute("SELECT id, first_name, last_name FROM staff WHERE status='active' ORDER BY first_name")
    staff_rows = cur.fetchall()

    preview = []
    for s in staff_rows:
        result = _calculate_payslip_for_staff(db, s["id"], run["month"], run["year"], run["from_date"], run["to_date"])
        if result is None:
            continue
        preview.append({
            "id": s["id"], "staff_id": s["id"], "staff_name": s["first_name"] + " " + s["last_name"],
            "salary_type": result["salary_type"], "gross_earnings": result["gross_earnings"],
            "total_deductions": result["total_deductions"], "net_pay": result["net_pay"],
            "earnings_breakdown": result["earnings_breakdown"], "deductions_breakdown": result["deductions_breakdown"],
            "days_present": result["days_present"], "days_absent": result["days_absent"],
            "days_half_day": result["days_half_day"], "days_on_leave": result["days_on_leave"],
            "hours_worked": result["hours_worked"],
        })
    return ok(data=preview)


@router.post("/runs/{run_id}/submit")
def submit_payroll_run(run_id: int, user_id: int = Depends(require_permission("payroll.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM payroll_runs WHERE id=%s", (run_id,))
    run = cur.fetchone()
    if not run:
        fail("Payroll run not found.", 404)
    if run["status"] != "hr_submitted":
        fail("Generate payslips (while status is with Finance) before submitting for approval.", 400)
    cur.execute("SELECT COUNT(*) AS c FROM payroll_payslips WHERE payroll_run_id=%s", (run_id,))
    if cur.fetchone()["c"] == 0:
        fail("Generate payslips before submitting for approval.", 400)

    cur.execute("SELECT sp_update_payroll_run_status(%s,%s,%s)", (run_id, "pending_approval", None))
    db.commit()

    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        wf.trigger(db, module="hr", entity_type="payroll_run", entity_id=run_id,
            initiated_by=user_id, submitter_id=user_id,
            context={"month": run["month"], "year": run["year"]})
        db.commit()
    except Exception as we:
        print(f"[payroll run workflow] {we}")

    return ok(message="Payroll run submitted for approval.")


class PayrollRunAdvanceIn(BaseModel):
    action: str
    note: Optional[str] = None


@router.post("/runs/{run_id}/advance")
def advance_payroll_run(run_id: int, body: PayrollRunAdvanceIn,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Advance the payroll-run approval workflow. Once fully approved, the run
    (and all its payslips) is permanently frozen - generate/regenerate is blocked."""
    if body.action not in ("approve", "reject"):
        fail("Action must be approve or reject.", 400)
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        result = wf.advance(db, "hr", "payroll_run", run_id,
            action=body.action, actioned_by=user_id, note=body.note or body.action)
        db.commit()
        if result:
            wf_status = result.get("status", "")
            if wf_status in ("completed", "approved"):
                cur = get_cur(db)
                cur.execute("SELECT sp_update_payroll_run_status(%s,%s,%s)", (run_id, "approved", user_id))
                db.commit()
            elif wf_status == "rejected":
                cur = get_cur(db)
                cur.execute("SELECT sp_clear_payslips(%s)", (run_id,))
                cur.execute("SELECT sp_update_payroll_run_status(%s,%s,%s)", (run_id, "draft", None))
                db.commit()
        return ok(message="Payroll run " + body.action + "d successfully.")
    except Exception as e:
        print(f"[payroll run advance] {e}")
        import traceback; traceback.print_exc()
        fail(str(e), 400)


@router.post("/runs/{run_id}/release")
def release_payroll_run(run_id: int, user_id: int = Depends(require_permission("payroll.manage")), db=Depends(get_db)):
    """Final Finance action after Finance Manager approval - releases the run
    for salary transfer. This is the true permanent-freeze point."""
    cur = get_cur(db)
    cur.execute("SELECT status FROM payroll_runs WHERE id=%s", (run_id,))
    run = cur.fetchone()
    if not run:
        fail("Payroll run not found.", 404)
    if run["status"] != "approved":
        fail("Only an approved run can be released.", 400)
    cur.execute("SELECT sp_update_payroll_run_status(%s,%s,%s)", (run_id, "released", user_id))
    db.commit()
    return ok(message="Payroll run released for salary transfer.")
