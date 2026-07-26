"""
FastAPI dependency factory mirroring Flask's @require_permission(code) decorator.
Queries the same permissions/role_permissions/user_roles tables directly rather
than importing PermissionRepository, since that class calls Flask's get_db()
internally (flask.g-based) and would fail outside an active Flask app context.
"""

from fastapi import Depends, HTTPException
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur


def require_permission(code: str):
    """
    Usage: @router.get("/x") def handler(user_id: int = Depends(require_permission("procurement.view"))): ...
    Returns the authenticated user's id if they have the permission, otherwise
    raises 403 - matching Flask's require_permission behavior.
    """
    def checker(user_id: int = Depends(get_current_user_id), db=Depends(get_db)) -> int:
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
        if not row or not row["has_perm"]:
            raise HTTPException(status_code=403, detail={"msg": "Permission denied: " + code})
        return user_id
    return checker
