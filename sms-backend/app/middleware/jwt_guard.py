"""
JWT verification middleware.
Decodes the token and loads user identity + roles into flask.g.
Swap auth provider here without touching any route or service.
"""
from functools import wraps
from flask import jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

def jwt_required_custom(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        g.user_id = get_jwt_identity()
        g.claims  = get_jwt()
        return fn(*args, **kwargs)
    return wrapper
