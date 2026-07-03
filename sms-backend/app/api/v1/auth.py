from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.auth_service import AuthService
from app.utils.response import success, error

bp = Blueprint("auth", __name__)
_svc = AuthService()


@bp.post("/login")
def login():
    body = request.get_json() or {}
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "")
    if not email or not password:
        return error("email and password are required.", 400)
    try:
        result = _svc.login(email, password)
        return success(data=result, message="Login successful.")
    except (ValueError, PermissionError) as e:
        return error(str(e), 401)


@bp.post("/logout")
@jwt_required(refresh=True)
def logout():
    raw = request.get_json() or {}
    refresh_token = raw.get("refresh_token", "")
    _svc.logout(refresh_token)
    return success(message="Logged out.")


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    from flask_jwt_extended import create_access_token
    user_id = get_jwt_identity()
    from app.repositories.user_repository import UserRepository
    rbac = UserRepository().get_user_roles_and_permissions(int(user_id))
    access_token = create_access_token(
        identity=user_id,
        additional_claims={
            "roles":       rbac["roles"],
            "permissions": rbac["permissions"]
        }
    )
    return success(data={"access_token": access_token})


@bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    try:
        result = _svc.get_me(user_id)
        return success(data=result)
    except ValueError as e:
        return error(str(e), 404)