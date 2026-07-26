"""
Reports module.
Read-only reporting endpoints for HR/management. Uses database views for
directory/filtering data and reuses the existing, already-validated attendance
stored procedures for the actual daily-status computation.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur
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
            fail("Permission denied.", 403)
        return user_id
    return dep


@router.get("/attendance/directory")
def attendance_report_directory(department_id: Optional[int] = None, search: Optional[str] = None,
        user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db)):
    """Employee directory for the report\'s employee list, filterable by
    department and a name/employee-code search term."""
    cur = get_cur(db)
    query = "SELECT * FROM v_staff_directory WHERE status=\'active\'"
    params = []
    if department_id:
        query += " AND department_id=%s"
        params.append(department_id)
    if search:
        query += " AND (first_name ILIKE %s OR last_name ILIKE %s OR employee_code ILIKE %s OR (first_name || \' \' || last_name) ILIKE %s)"
        like = f"%{search}%"
        params += [like, like, like, like]
    query += " ORDER BY first_name"
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/attendance/daily")
def attendance_report_daily(date: str, department_id: Optional[int] = None,
        user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db)):
    """All employees\' attendance status for a single date (Daily Report mode)."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_attendance_daily_status_bulk(%s,%s)", (date, department_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/attendance/monthly/{staff_id}")
def attendance_report_monthly(staff_id: int, month: int, year: int,
        user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db)):
    """One employee\'s full day-by-day attendance for a given month (Monthly Report mode)."""
    import calendar as _cal
    if month < 1 or month > 12:
        fail("Invalid month.", 400)
    from_date = f"{year:04d}-{month:02d}-01"
    to_date = f"{year:04d}-{month:02d}-{_cal.monthrange(year, month)[1]:02d}"
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_attendance_daily_status(%s,%s,%s)", (staff_id, from_date, to_date))
    return ok(data=[dict(r) for r in cur.fetchall()])
