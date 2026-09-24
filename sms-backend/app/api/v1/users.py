"""
Native FastAPI router for Users - migrated from app/api/v1/users.py.
Bridges into UserService (which uses UserRepository/PermissionRepository,
both already fully backed by stored procedures) via Flask's app_context().
The inline-SQL routes (profile, password, signature) have been converted to
use dedicated stored procedures and native FastAPI DB access directly.

Route ordering note: only single-segment literal paths (/signature) risk
colliding with /{id} - multi-segment ones (/roles/all, /profile/me) are
structurally safe regardless of declaration order, since Starlette matches
on path structure, not just declaration order, for differing segment counts.
"""

from typing import Optional, Any
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_campus import get_current_campus_id
from app.fastapi_campus import enforce_same_campus
from app.fastapi_db import get_db as _campus_get_db, get_cur as _campus_get_cur


def _check_user_campus(db, target_user_id: int, caller_campus_id):
    cur = _campus_get_cur(db)
    cur.execute("SELECT campus_id FROM users WHERE id = %s", (target_user_id,))
    row = cur.fetchone()
    enforce_same_campus(row["campus_id"] if row else None, caller_campus_id)

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _flask_app():
    import main
    return main.flask_app


class UserCreateIn(BaseModel):
    email: str
    first_name: str
    last_name: str
    password: Optional[str] = None
    phone: Optional[Any] = None
    role_id: Optional[Any] = None

    def to_dict(self):
        d = self.dict()
        if d.get("password") is None:
            d.pop("password")
        return d


class UserUpdateIn(BaseModel):
    first_name: Optional[Any] = None
    last_name: Optional[Any] = None
    phone: Optional[Any] = None
    is_active: Optional[Any] = None

    def to_dict(self):
        return {k: v for k, v in self.dict().items() if v is not None}


class AssignRoleIn(BaseModel):
    role_id: Any
    action: Optional[str] = "assign"


class AssignPermissionIn(BaseModel):
    role_id: Any
    permission_id: Any
    action: Optional[str] = "grant"


class UpdateProfileIn(BaseModel):
    first_name: Optional[Any] = None
    last_name: Optional[Any] = None
    phone: Optional[Any] = None

    def to_dict(self):
        return {k: v for k, v in self.dict().items() if v is not None}


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class SignatureIn(BaseModel):
    signature: str


# ── Literal-path routes (must come before /{id}) ──────────────

@router.get("/")
def list_users(
    search: Optional[str] = None, role: Optional[str] = None, is_active: Optional[str] = None,
    page: int = 1, per_page: int = 20,
    user_id: int = Depends(require_permission("users.view")),
    campus_id: Optional[int] = Depends(get_current_campus_id),
):
    filters = {k: v for k, v in {"search": search, "role": role, "is_active": is_active, "campus_id": campus_id}.items() if v}
    with _flask_app().app_context():
        from app.services.user_service import UserService
        result = UserService().get_all(filters, page, per_page)
    return {
        "status": "success",
        "data": result["items"],
        "pagination": {"total": result["total"], "page": page, "per_page": per_page},
    }


@router.post("/")
def create_user(body: UserCreateIn, user_id: int = Depends(require_permission("users.create")), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if campus_id is None:
        fail("No campus context - please select a campus before creating a user.", 400)
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            create_data = body.to_dict()
            create_data["campus_id"] = campus_id
            result = UserService().create(create_data)
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="User created successfully.")


@router.get("/roles/all")
def list_roles(user_id: int = Depends(require_permission("roles.view"))):
    with _flask_app().app_context():
        from app.services.user_service import UserService
        data = UserService().get_all_roles()
    return ok(data=data)


@router.get("/roles/{role_id}/permissions")
def get_role_permissions(role_id: int, user_id: int = Depends(require_permission("permissions.manage"))):
    with _flask_app().app_context():
        from app.services.user_service import UserService
        data = UserService().get_role_permissions(role_id)
    return ok(data=data)


@router.get("/permissions/all")
def list_permissions(user_id: int = Depends(require_permission("permissions.manage"))):
    with _flask_app().app_context():
        from app.services.user_service import UserService
        data = UserService().get_all_permissions()
    return ok(data=data)


@router.post("/permissions/assign")
def assign_permission(body: AssignPermissionIn, user_id: int = Depends(require_permission("permissions.manage"))):
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            UserService().assign_permission(body.role_id, body.permission_id, body.action or "grant")
        except ValueError as e:
            fail(str(e), 400)
    return ok(message="Permission " + (body.action or "grant") + "ed.")


@router.get("/profile/me")
def my_profile(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_profile(%s)", (user_id,))
    row = cur.fetchone()
    if not row:
        fail("User not found.", 404)
    data = dict(row)
    data["roles"] = list(data["roles"]) if data["roles"] else []
    return ok(data=data)


@router.put("/profile/me")
def update_my_profile(body: UpdateProfileIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    updates = body.to_dict()
    if not updates:
        fail("No valid fields to update.", 400)
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_update_my_profile(%s, %s, %s, %s)",
        (user_id, updates.get("first_name"), updates.get("last_name"), updates.get("phone"))
    )
    db.commit()
    return ok(message="Profile updated successfully.")


@router.put("/profile/password")
def change_password(body: ChangePasswordIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if not body.current_password or not body.new_password:
        fail("current_password and new_password are required.", 400)
    if len(body.new_password) < 6:
        fail("New password must be at least 6 characters.", 400)

    import bcrypt
    cur = get_cur(db)
    cur.execute("SELECT sp_get_password_hash_for_user(%s) AS hash", (user_id,))
    row = cur.fetchone()
    if not row or not row["hash"]:
        fail("User not found.", 404)

    if not bcrypt.checkpw(body.current_password.encode(), row["hash"].encode()):
        fail("Current password is incorrect.", 400)

    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    cur.execute("SELECT sp_change_password(%s, %s)", (user_id, new_hash))
    db.commit()
    return ok(message="Password changed successfully.")


@router.get("/signature")
def get_my_signature(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_signature(%s)", (user_id,))
    row = cur.fetchone()
    return ok(data=dict(row) if row else None)


@router.put("/signature")
def save_my_signature(body: SignatureIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if not body.signature:
        fail("signature is required.", 400)
    if len(body.signature) > 500000:
        fail("Signature too large.", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_save_my_signature(%s, %s)", (user_id, body.signature))
    db.commit()
    return ok(message="Signature saved.")


@router.delete("/signature")
def delete_my_signature(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_my_signature(%s)", (user_id,))
    db.commit()
    return ok(message="Signature deleted.")


# ── Parameterized /{id} routes (must come after all literal paths above) ──



@router.get("/profile/theme")
def get_theme(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_user_theme(%s) AS theme", (user_id,))
    row = cur.fetchone()
    return ok(data={"theme": row["theme"] if row and row["theme"] else "indigo"})


@router.put("/profile/theme")
def update_theme(body: dict = Body({}), user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    theme = body.get("theme", "indigo")
    cur = get_cur(db)
    cur.execute("SELECT sp_update_user_theme(%s, %s)", (user_id, theme))
    db.commit()
    return ok(message="Theme saved.")

@router.get("/{id}")
def get_user(id: int, user_id: int = Depends(require_permission("users.view"))):
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            data = UserService().get_by_id(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(data=data)


@router.put("/{id}")
def update_user(id: int, body: UserUpdateIn, user_id: int = Depends(require_permission("users.edit")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_user_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            result = UserService().update(id, body.to_dict())
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result)


@router.delete("/{id}")
def delete_user(id: int, user_id: int = Depends(require_permission("users.delete")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_user_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            UserService().deactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="User deactivated.")


@router.post("/{id}/reactivate")
def reactivate_user(id: int, user_id: int = Depends(require_permission("users.delete")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_user_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            UserService().reactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="User reactivated.")


@router.post("/{id}/assign-role")
def assign_role(id: int, body: AssignRoleIn, user_id: int = Depends(require_permission("users.manage_roles")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_user_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.user_service import UserService
        try:
            result = UserService().assign_role(id, body.role_id, body.action or "assign")
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Role updated.")
