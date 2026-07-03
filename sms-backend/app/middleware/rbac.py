"""
Role-based access control decorator.
Usage:  @require_permission("attendance.create")

Permission strings are stored in the DB (role_permissions table).
Superadmin manages them via the /api/v1/users/permissions endpoints.
Changing permissions requires no code deploy — DB update only.
"""
from functools import wraps
from flask import jsonify, g
from app.repositories.permission_repository import PermissionRepository

_perm_repo = PermissionRepository()

def require_permission(permission: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user_id = getattr(g, "user_id", None)
            if not user_id:
                return jsonify({"error": "Unauthorized"}), 401

            has_access = _perm_repo.user_has_permission(user_id, permission)
            if not has_access:
                return jsonify({"error": "Forbidden", "required": permission}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
