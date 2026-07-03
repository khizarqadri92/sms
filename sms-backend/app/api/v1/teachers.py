from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.services.teacher_service import TeacherService
from app.utils.response import success, error, paginated
from app.utils.pagination import get_page_args

bp   = Blueprint("teachers", __name__)
_svc = TeacherService()


@bp.get("/")
@jwt_required_custom
@require_permission("teachers.view")
def list_teachers():
    page, per_page = get_page_args()
    filters = {k: request.args.get(k) for k in ["search", "status"] if request.args.get(k)}
    result  = _svc.get_all(filters, page, per_page)
    return paginated(result["items"], result["total"], page, per_page)


@bp.get("/me")
@jwt_required_custom
def my_profile():
    user_id = int(get_jwt_identity())
    teacher = _svc.get_by_user_id(user_id)
    if not teacher:
        return error("Teacher profile not found.", 404)
    return success(data=teacher)


@bp.get("/meta/subjects")
@jwt_required_custom
@require_permission("teachers.view")
def get_all_subjects():
    return success(data=_svc.get_all_subjects())


@bp.get("/<int:id>")
@jwt_required_custom
@require_permission("teachers.view")
def get_teacher(id):
    try:
        return success(data=_svc.get_by_id(id))
    except ValueError as e:
        return error(str(e), 404)


@bp.post("/")
@jwt_required_custom
@require_permission("teachers.create")
def create_teacher():
    try:
        result = _svc.create(request.get_json() or {})
        return success(data=result, message="Teacher created successfully.", status=201)
    except ValueError as e:
        return error(str(e), 400)


@bp.put("/<int:id>")
@jwt_required_custom
@require_permission("teachers.edit")
def update_teacher(id):
    try:
        result = _svc.update(id, request.get_json() or {})
        return success(data=result, message="Teacher updated successfully.")
    except ValueError as e:
        return error(str(e), 400)


@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("teachers.delete")
def deactivate_teacher(id):
    try:
        _svc.deactivate(id)
        return success(message="Teacher deactivated.")
    except ValueError as e:
        return error(str(e), 404)


@bp.get("/<int:id>/subjects")
@jwt_required_custom
@require_permission("teachers.view")
def teacher_subjects(id):
    return success(data=_svc.get_subjects(id))


@bp.post("/<int:id>/subjects")
@jwt_required_custom
@require_permission("academics.manage")
def assign_subject(id):
    body = request.get_json() or {}
    try:
        _svc.assign_subject(id, body.get("subject_id"), body.get("action", "assign"))
        return success(message="Subject updated.")
    except ValueError as e:
        return error(str(e), 400)


@bp.get("/<int:id>/timetable")
@jwt_required_custom
@require_permission("teachers.view")
def teacher_timetable(id):
    return success(data=_svc.get_timetable(id))


@bp.get("/<int:id>/classes")
@jwt_required_custom
@require_permission("teachers.view")
def teacher_classes(id):
    return success(data=_svc.get_classes(id))