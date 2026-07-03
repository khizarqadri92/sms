"""
Route handler — thin layer only.
Validate input → call service → return response.
No business logic here.
"""
from flask import Blueprint, request
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error

bp = Blueprint("communication", __name__)


@bp.get("/")
@jwt_required_custom
@require_permission("communication.view")
def list_all():
    # TODO: call service
    return success(data=[], message="communication list")


@bp.get("/<int:id>")
@jwt_required_custom
@require_permission("communication.view")
def get_one(id):
    # TODO: call service
    return success(data={}, message="communication detail")


@bp.post("/")
@jwt_required_custom
@require_permission("communication.create")
def create():
    body = request.get_json()
    # TODO: validate with schema, call service
    return success(data={}, message="communication created", status=201)


@bp.put("/<int:id>")
@jwt_required_custom
@require_permission("communication.edit")
def update(id):
    body = request.get_json()
    # TODO: validate, call service
    return success(data={}, message="communication updated")


@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("communication.delete")
def delete(id):
    # TODO: call service
    return success(message="communication deleted")
