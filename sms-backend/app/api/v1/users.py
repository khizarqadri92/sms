from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.services.user_service import UserService
from app.utils.response import success, error, paginated
from app.utils.pagination import get_page_args

bp   = Blueprint("users", __name__)
_svc = UserService()


@bp.get("/")
@jwt_required_custom
@require_permission("users.view")
def list_users():
    page, per_page = get_page_args()
    filters = {k: request.args.get(k) for k in ["search", "role", "is_active"] if request.args.get(k)}
    result  = _svc.get_all(filters, page, per_page)
    return paginated(result["items"], result["total"], page, per_page)


@bp.get("/<int:id>")
@jwt_required_custom
@require_permission("users.view")
def get_user(id):
    try:
        return success(data=_svc.get_by_id(id))
    except ValueError as e:
        return error(str(e), 404)


@bp.post("/")
@jwt_required_custom
@require_permission("users.create")
def create_user():
    try:
        result = _svc.create(request.get_json() or {})
        return success(data=result, message="User created successfully.", status=201)
    except ValueError as e:
        return error(str(e), 400)


@bp.put("/<int:id>")
@jwt_required_custom
@require_permission("users.edit")
def update_user(id):
    try:
        result = _svc.update(id, request.get_json() or {})
        return success(data=result)
    except ValueError as e:
        return error(str(e), 400)


@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("users.delete")
def delete_user(id):
    try:
        _svc.deactivate(id)
        return success(message="User deactivated.")
    except ValueError as e:
        return error(str(e), 404)


@bp.post("/<int:id>/assign-role")
@jwt_required_custom
@require_permission("users.manage_roles")
def assign_role(id):
    body = request.get_json() or {}
    try:
        result = _svc.assign_role(id, body.get("role_id"), body.get("action", "assign"))
        return success(data=result, message="Role updated.")
    except ValueError as e:
        return error(str(e), 400)


@bp.get("/roles/all")
@jwt_required_custom
@require_permission("roles.view")
def list_roles():
    return success(data=_svc.get_all_roles())


@bp.get("/roles/<int:role_id>/permissions")
@jwt_required_custom
@require_permission("permissions.manage")
def get_role_permissions(role_id):
    return success(data=_svc.get_role_permissions(role_id))


@bp.get("/permissions/all")
@jwt_required_custom
@require_permission("permissions.manage")
def list_permissions():
    return success(data=_svc.get_all_permissions())


@bp.post("/permissions/assign")
@jwt_required_custom
@require_permission("permissions.manage")
def assign_permission():
    body = request.get_json() or {}
    try:
        _svc.assign_permission(
            body.get("role_id"),
            body.get("permission_id"),
            body.get("action", "grant")
        )
        return success(message=f"Permission {body.get('action', 'grant')}ed.")
    except ValueError as e:
        return error(str(e), 400)

@bp.get("/profile/me")
@jwt_required_custom
def my_profile():
    from flask_jwt_extended import get_jwt_identity
    import psycopg2.extras
    from app.db.connection import get_db
    user_id = int(get_jwt_identity())
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
               u.is_active, u.is_verified, u.last_login_at, u.created_at,
               ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r       ON r.id = ur.role_id
        WHERE u.id = %s
        GROUP BY u.id
    """, (user_id,))
    row = cur.fetchone()
    if not row:
        return error("User not found.", 404)
    data = dict(row)
    data["roles"] = data["roles"] or []
    return success(data=data)


@bp.put("/profile/me")
@jwt_required_custom
def update_my_profile():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    allowed = {"first_name", "last_name", "phone"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return error("No valid fields to update.", 400)
    db  = get_db()
    cur = db.cursor()
    fields = ", ".join(k + " = %s" for k in updates)
    values = list(updates.values()) + [user_id]
    cur.execute("UPDATE users SET " + fields + " WHERE id = %s", values)
    db.commit()
    return success(message="Profile updated successfully.")


@bp.put("/profile/password")
@jwt_required_custom
def change_password():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    import bcrypt
    user_id      = int(get_jwt_identity())
    body         = request.get_json() or {}
    current_pass = body.get("current_password", "")
    new_pass     = body.get("new_password", "")

    if not current_pass or not new_pass:
        return error("current_password and new_password are required.", 400)
    if len(new_pass) < 6:
        return error("New password must be at least 6 characters.", 400)

    db  = get_db()
    cur = db.cursor()
    cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return error("User not found.", 404)

    if not bcrypt.checkpw(current_pass.encode(), row[0].encode()):
        return error("Current password is incorrect.", 400)

    new_hash = bcrypt.hashpw(new_pass.encode(), bcrypt.gensalt()).decode()
    cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user_id))
    db.commit()
    return success(message="Password changed successfully.")

@bp.get("/signature")
@jwt_required_custom
def get_my_signature():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    import psycopg2.extras
    user_id = int(get_jwt_identity())
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT signature, updated_at FROM user_signatures WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    return success(data=dict(row) if row else None)


@bp.put("/signature")
@jwt_required_custom
def save_my_signature():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    sig     = body.get("signature", "")
    if not sig:
        return error("signature is required.", 400)
    if len(sig) > 500000:
        return error("Signature too large.", 400)
    db  = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO user_signatures (user_id, signature, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET signature = %s, updated_at = NOW()
    """, (user_id, sig, sig))
    db.commit()
    return success(message="Signature saved.")


@bp.delete("/signature")
@jwt_required_custom
def delete_my_signature():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    user_id = int(get_jwt_identity())
    db  = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM user_signatures WHERE user_id = %s", (user_id,))
    db.commit()
    return success(message="Signature deleted.")