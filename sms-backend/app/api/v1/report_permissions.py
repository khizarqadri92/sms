# Report Permissions module.
# Superadmin-facing UI for managing which roles can view which reports,
# backed by the existing dedicated reports.* (and a few shared) permission codes.
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_permissions import require_permission

router = APIRouter()

def get_cur(db):
    return _get_cur(db)

def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})

def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}

REPORTS_REGISTRY = [
    {"key": "employee_attendance", "label": "Employee Attendance", "permission_code": "reports.employee_attendance"},
    {"key": "attendance_hub", "label": "Attendance Reports (By Teacher/Class/Student)", "permission_code": "reports.attendance_hub"},
    {"key": "employee_salaries", "label": "Employee Salaries", "permission_code": "reports.employee_salaries"},
    {"key": "expenditure_details", "label": "Expenditure Details", "permission_code": "reports.expenditure"},
    {"key": "fee_report", "label": "Fee Report", "permission_code": "reports.fee_report"},
    {"key": "locked_students", "label": "Locked Students", "permission_code": "reports.locked_students"},
]


@router.get("/report-permissions")
def get_report_permissions(user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM roles ORDER BY name")
    roles = [dict(r) for r in cur.fetchall()]

    codes = [r["permission_code"] for r in REPORTS_REGISTRY]
    cur.execute("SELECT r.id AS role_id, p.code AS permission_code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE p.code = ANY(%s)", (codes,))
    grants = [dict(r) for r in cur.fetchall()]

    return ok(data={"reports": REPORTS_REGISTRY, "roles": roles, "grants": grants})


class ReportPermissionToggleIn(BaseModel):
    role_id: int
    permission_code: str
    granted: bool


@router.post("/report-permissions/toggle")
def toggle_report_permission(body: ReportPermissionToggleIn,
        user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    valid_codes = [r["permission_code"] for r in REPORTS_REGISTRY]
    if body.permission_code not in valid_codes:
        fail("Unknown report permission code.", 400)

    cur = get_cur(db)
    cur.execute("SELECT id FROM permissions WHERE code=%s", (body.permission_code,))
    perm = cur.fetchone()
    if not perm:
        fail("Permission not found.", 404)

    if body.granted:
        cur.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (body.role_id, perm["id"]))
    else:
        cur.execute("DELETE FROM role_permissions WHERE role_id=%s AND permission_id=%s", (body.role_id, perm["id"]))
    db.commit()
    return ok(message="Updated.")
