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


@bp.post("/verify-password")
@jwt_required()
def verify_password():
    body = request.get_json() or {}
    password = body.get("password", "")
    if not password:
        return error("password is required.", 400)
    user_id = int(get_jwt_identity())
    from app.db.connection import get_db
    import psycopg2.extras, bcrypt
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM sp_get_user_password_hash(%s::integer)", (user_id,))
    row = cur.fetchone()
    password_matches = bool(row) and bcrypt.checkpw(password.encode(), row["password_hash"].encode())

    cur.execute("SELECT * FROM sp_record_password_attempt(%s::integer, %s::boolean)", (user_id, password_matches))
    result = cur.fetchone()
    db.commit()

    if result["is_locked"]:
        from flask import jsonify
        locked_until_iso = result["locked_until"].isoformat() if result["locked_until"] else None
        return jsonify({
            "status": "error",
            "message": "Account locked due to too many failed attempts. Please wait before trying again.",
            "data": {"locked_until": locked_until_iso}
        }), 403

    if not password_matches:
        return error("Incorrect password. " + str(result["attempts_remaining"]) + " attempt(s) remaining.", 400)

    return success(message="Verified.")


@bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    try:
        result = _svc.get_me(user_id)
        return success(data=result)
    except ValueError as e:
        return error(str(e), 404)