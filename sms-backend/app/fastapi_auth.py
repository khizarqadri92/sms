"""
FastAPI dependency for JWT authentication, interoperable with tokens issued by
the existing Flask app (flask_jwt_extended). Since JWTs are just signed blobs,
verifying them here with the identical secret/algorithm means tokens issued by
Flask's /auth/login endpoint work seamlessly on native FastAPI routes too -
no changes needed to login or token issuance.
"""

import os
from fastapi import Header, HTTPException
from jose import jwt, JWTError

# Must match config.py's JWT_SECRET_KEY exactly (same env var, same default)
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "sms-jwt-secret-2024")
JWT_ALGORITHM = "HS256"


def _decode_token(authorization: str):
    if not authorization:
        raise HTTPException(status_code=401, detail={"msg": "Missing Authorization Header"})

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=422,
            detail={"msg": "Bad Authorization header. Expected 'Authorization: Bearer <JWT>'"}
        )

    token = parts[1]
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail={"msg": "Invalid or expired token"})

    if payload.get("sub") is None:
        raise HTTPException(status_code=401, detail={"msg": "Token missing subject claim"})

    return payload


def get_current_user_id(authorization: str = Header(None)) -> int:
    """
    Extracts and verifies an ACCESS token, returning the user's id (matching
    Flask's int(get_jwt_identity()) pattern used throughout the existing routes).
    Mirrors flask_jwt_extended's @jwt_required() behavior: rejects refresh
    tokens here, matching Flask's default token-type enforcement.
    """
    payload = _decode_token(authorization)
    if payload.get("type") not in (None, "access"):
        raise HTTPException(status_code=422, detail={"msg": "Only access tokens are allowed"})
    return int(payload["sub"])


def get_jwt_claims(authorization: str = Header(None)) -> dict:
    """
    Returns the full decoded token payload (roles, permissions, etc.),
    matching Flask-JWT-Extended's get_jwt() used by a few routes that need
    role/permission info directly from the token rather than a fresh DB call.
    """
    return _decode_token(authorization)


def get_current_user_id_from_refresh(authorization: str = Header(None)) -> int:
    """
    Extracts and verifies a REFRESH token specifically, matching Flask's
    @jwt_required(refresh=True) behavior used on /logout and /refresh.
    """
    payload = _decode_token(authorization)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=422, detail={"msg": "Only refresh tokens are allowed"})
    return int(payload["sub"])
