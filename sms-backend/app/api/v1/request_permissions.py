# Request Permissions module.
# Superadmin-facing UI for controlling which roles can view which request-type
# listing pages (Resignations, Discipline, Withdrawal, Leave Requests, etc.),
# with department-based scoping (All / Specific Departments / HOD of Own Department).
# This is additive to the existing broad module permissions (e.g. hr.view) -
# a user needs EITHER the broad permission OR a matching scope grant here.
from typing import Optional, List
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


REQUESTS_REGISTRY = [
    {"key": "resignation", "label": "Employee Resignations"},
    {"key": "discipline", "label": "Discipline Cases"},
    {"key": "withdrawal", "label": "Withdrawal Requests"},
    {"key": "leave_request", "label": "Leave Requests"},
]


def user_has_permission(db, user_id: int, code: str) -> bool:
    """Non-raising check for whether a user has a given permission code
    (via any of their roles), for use as a fallback before consulting the
    narrower request-permission scope."""
    cur = get_cur(db)
    cur.execute(
        "SELECT EXISTS("
        "  SELECT 1 FROM role_permissions rp"
        "  JOIN user_roles ur ON ur.role_id = rp.role_id"
        "  JOIN permissions p ON p.id = rp.permission_id"
        "  WHERE ur.user_id = %s AND p.code = %s"
        ") AS has_perm",
        (user_id, code)
    )
    row = cur.fetchone()
    return bool(row and row["has_perm"])


def get_user_request_scope(db, user_id: int, request_type: str):
    """Returns (effective_scope, department_ids) for this user/request_type.
    effective_scope is one of: 'all', 'departments', 'none'.
    When 'departments', department_ids lists which departments they may see
    (combining any 'specific' grants with 'hod'-resolved departments across
    all of the user's roles)."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_user_request_scope(%s, %s)", (user_id, request_type))
    row = cur.fetchone()
    if not row:
        return "none", []
    return row["effective_scope"], (row["department_ids"] or [])


@router.get("/my-request-scopes")
def get_my_request_scopes(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Returns the list of request_type keys the current user has any non-'none'
    scope for (via any of their roles) - used by the frontend to decide whether
    to allow access to a request-listing page even without the broad module
    permission (e.g. hr.view)."""
    accessible = []
    for req in REQUESTS_REGISTRY:
        scope, _ = get_user_request_scope(db, user_id, req["key"])
        if scope != "none":
            accessible.append(req["key"])
    return ok(data={"accessible_request_types": accessible})


@router.get("/request-permissions")
def get_request_permissions(user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM roles ORDER BY name")
    roles = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT id, name FROM departments WHERE is_active=true ORDER BY name")
    departments = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_request_permissions()")
    grants = [dict(r) for r in cur.fetchall()]
    return ok(data={"requests": REQUESTS_REGISTRY, "roles": roles, "departments": departments, "grants": grants})


class RequestPermissionIn(BaseModel):
    role_id: int
    request_type: str
    scope: str
    department_ids: Optional[List[int]] = None


@router.post("/request-permissions")
def upsert_request_permission(body: RequestPermissionIn,
        user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    valid_types = [r["key"] for r in REQUESTS_REGISTRY]
    if body.request_type not in valid_types:
        fail("Unknown request type.", 400)
    if body.scope not in ("none", "all", "specific", "hod"):
        fail("Invalid scope.", 400)
    cur = get_cur(db)
    dept_ids = body.department_ids or []
    cur.execute("SELECT sp_upsert_request_permission(%s,%s,%s,%s,%s)",
        (body.role_id, body.request_type, body.scope, dept_ids, user_id))
    db.commit()
    return ok(message="Updated.")
