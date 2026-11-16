"""
Native FastAPI router for Auth - migrated from app/api/v1/auth.py.

login/logout/refresh/me bridge into the existing, untouched AuthService via
Flask's app_context() - this is deliberate: flask_jwt_extended's
create_access_token/create_refresh_token are deeply tied to Flask's app
config and internal state, so reusing them exactly (rather than
reimplementing token creation in native FastAPI) guarantees byte-identical
tokens to what has always worked, eliminating any risk of a subtle auth bug.

verify-password is self-contained (no token creation involved) and uses
native FastAPI DB access directly.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import (get_current_user_id, get_current_user_id_from_refresh, get_current_user_id_from_2fa_pending,
                              get_current_user_id_allow_pwd_change)
from app.fastapi_db import get_db, get_cur as _get_cur

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


class LoginIn(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str


class LogoutIn(BaseModel):
    refresh_token: Optional[str] = ""


class VerifyPasswordIn(BaseModel):
    password: str


class Verify2FALoginIn(BaseModel):
    code: str


class Confirm2FASetupIn(BaseModel):
    code: str


class Disable2FAIn(BaseModel):
    password: str


class FirstPasswordIn(BaseModel):
    new_password: str


@router.post("/login")
def login(body: LoginIn):
    identifier = (body.identifier or body.email or "").strip()
    if not identifier or not body.password:
        fail("identifier and password are required.", 400)

    with _flask_app().app_context():
        from app.services.auth_service import AuthService
        try:
            result = AuthService().login(identifier, body.password)
        except (ValueError, PermissionError) as e:
            fail(str(e), 401)
    return ok(data=result, message="Login successful.")


@router.post("/logout")
def logout(body: LogoutIn, user_id: int = Depends(get_current_user_id_from_refresh)):
    with _flask_app().app_context():
        from app.services.auth_service import AuthService
        AuthService().logout(body.refresh_token or "")
    return ok(message="Logged out.")


@router.post("/refresh")
def refresh(user_id: int = Depends(get_current_user_id_from_refresh)):
    with _flask_app().app_context():
        from flask_jwt_extended import create_access_token
        from app.repositories.user_repository import UserRepository
        rbac = UserRepository().get_user_roles_and_permissions(user_id)
        from app.services.auth_service import AuthService
        claims = {"roles": rbac["roles"], "permissions": rbac["permissions"]}
        if AuthService().must_change_password(user_id):
            claims["pwd_change"] = True                    # refreshing can't skip the required password change
        access_token = create_access_token(identity=str(user_id), additional_claims=claims)
    return ok(data={"access_token": access_token})


@router.post("/verify-password")
def verify_password(body: VerifyPasswordIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if not body.password:
        fail("password is required.", 400)

    import bcrypt
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_user_password_hash(%s::integer)", (user_id,))
    row = cur.fetchone()
    password_matches = bool(row) and bcrypt.checkpw(body.password.encode(), row["password_hash"].encode())

    cur.execute("SELECT * FROM sp_record_password_attempt(%s::integer, %s::boolean)", (user_id, password_matches))
    result = cur.fetchone()
    db.commit()

    if result["is_locked"]:
        locked_until_iso = result["locked_until"].isoformat() if result["locked_until"] else None
        raise HTTPException(
            status_code=403,
            detail={
                "status": "error",
                "message": "Account locked due to too many failed attempts. Please wait before trying again.",
                "data": {"locked_until": locked_until_iso},
            }
        )

    if not password_matches:
        fail("Incorrect password. " + str(result["attempts_remaining"]) + " attempt(s) remaining.", 400)

    return ok(message="Verified.")


@router.post("/2fa/verify-login")
def verify_2fa_login(body: Verify2FALoginIn, user_id: int = Depends(get_current_user_id_from_2fa_pending)):
    with _flask_app().app_context():
        from app.services.auth_service import AuthService
        try:
            result = AuthService().verify_2fa_login(user_id, body.code)
        except ValueError as e:
            fail(str(e), 401)
    return ok(data=result, message="Login successful.")


@router.get("/2fa/status")
def get_2fa_status(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_totp_status(%s)", (user_id,))
    row = cur.fetchone()
    return ok(data={"totp_enabled": bool(row and row["totp_enabled"])})


@router.post("/2fa/setup")
def setup_2fa(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    import pyotp, qrcode, io, base64
    cur = get_cur(db)
    cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    email = row["email"] if row else f"user{user_id}"

    secret = pyotp.random_base32()
    cur.execute("SELECT sp_set_totp_pending_secret(%s, %s)", (user_id, secret))
    db.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="School Management System")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return ok(data={"secret": secret, "qr_code": f"data:image/png;base64,{qr_b64}", "otpauth_uri": uri})


@router.post("/2fa/confirm-setup")
def confirm_2fa_setup(body: Confirm2FASetupIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    import pyotp
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_totp_status(%s)", (user_id,))
    row = cur.fetchone()
    if not row or not row["totp_pending_secret"]:
        fail("No pending 2FA setup found. Please start setup again.", 400)

    totp = pyotp.TOTP(row["totp_pending_secret"])
    if not totp.verify(str(body.code).strip(), valid_window=1):
        fail("Invalid or expired code. Please try again.", 400)

    cur.execute("SELECT sp_enable_totp(%s)", (user_id,))
    db.commit()
    return ok(message="Two-factor authentication enabled.")


@router.post("/2fa/disable")
def disable_2fa(body: Disable2FAIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    import bcrypt
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_user_password_hash(%s::integer)", (user_id,))
    row = cur.fetchone()
    if not row or not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        fail("Incorrect password.", 400)

    cur.execute("SELECT sp_disable_totp(%s)", (user_id,))
    db.commit()
    return ok(message="Two-factor authentication disabled.")


@router.post("/first-password")
def set_first_password(body: FirstPasswordIn, user_id: int = Depends(get_current_user_id_allow_pwd_change)):
    """Replace a temporary password (new parent / student account). Returns fresh tokens."""
    with _flask_app().app_context():
        from app.services.auth_service import AuthService
        try:
            result = AuthService().set_first_password(user_id, body.new_password or "")
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Password set. Welcome!")


@router.get("/me")
def me(user_id: int = Depends(get_current_user_id)):
    with _flask_app().app_context():
        from app.services.auth_service import AuthService
        try:
            result = AuthService().get_me(user_id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(data=result)
