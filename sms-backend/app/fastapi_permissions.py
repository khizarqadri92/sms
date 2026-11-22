"""
FastAPI dependency factory mirroring Flask's @require_permission(code) decorator.
Queries the same permissions/role_permissions/user_roles tables directly rather
than importing PermissionRepository, since that class calls Flask's get_db()
internally (flask.g-based) and would fail outside an active Flask app context.
"""

from fastapi import Depends, HTTPException, Request
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur


def _record_refusal(db, user_id, code, request):
    """Note who was refused what (Roles & Permissions -> Refusals). Never blocks the answer."""
    try:
        cur = get_cur(db)
        cur.execute("INSERT INTO permission_refusals (user_id, code, method, path) VALUES (%s,%s,%s,%s)",
                    (user_id, code[:300], request.method if request else None, (request.url.path if request else "")[:300]))
        db.commit()
    except Exception:
        try: db.rollback()
        except Exception: pass


def require_permission(code: str):
    """
    Usage: @router.get("/x") def handler(user_id: int = Depends(require_permission("procurement.view"))): ...
    Returns the authenticated user's id if they have the permission, otherwise
    raises 403 - matching Flask's require_permission behavior.
    """
    def checker(request: Request, user_id: int = Depends(get_current_user_id), db=Depends(get_db)) -> int:
        cur = get_cur(db)
        # roles + acting roles + extra permissions valid on the processing date (see migration_permissions_v2.sql)
        cur.execute("SELECT fn_user_has_permission(%s, %s) AS has_perm", (user_id, code))
        row = cur.fetchone()
        if not row or not row["has_perm"]:
            _record_refusal(db, user_id, code, request)
            raise HTTPException(status_code=403, detail={"msg": "Permission denied: " + code})
        return user_id
    return checker



def require_any_permission(*codes: str):
    """Allowed when the user has at least ONE of these permissions (e.g. a page shared by several tasks)."""
    def checker(request: Request, user_id: int = Depends(get_current_user_id), db=Depends(get_db)) -> int:
        cur = get_cur(db)
        cur.execute("SELECT EXISTS (SELECT 1 FROM fn_user_effective_permissions(%s) e WHERE e.code = ANY(%s)) AS ok", (user_id, list(codes)))
        row = cur.fetchone()
        if not row or not row["ok"]:
            _record_refusal(db, user_id, " or ".join(codes), request)
            raise HTTPException(status_code=403, detail={"msg": "Permission denied: " + " or ".join(codes)})
        return user_id
    return checker
