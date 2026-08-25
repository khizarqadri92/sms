"""
Native FastAPI router for Teachers - migrated from app/api/v1/teachers.py.
Same bridging pattern as students_fastapi.py: TeacherService/TeacherRepository
call Flask's get_db() internally, so every route wraps its body in
`with flask_app.app_context():`. Literal paths (/me, /meta/subjects) are
declared before parameterized paths (/{id}) to avoid the routing-order bug
found in the Students migration.
"""

from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission

router = APIRouter()


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _flask_app():
    import main
    return main.flask_app


class TeacherCreateIn(BaseModel):
    email: str
    first_name: str
    last_name: str
    password: Optional[str] = None
    phone: Optional[Any] = None
    date_of_birth: Optional[Any] = None
    gender: Optional[Any] = None
    qualification: Optional[Any] = None
    specialization: Optional[Any] = None
    join_date: Optional[Any] = None
    employee_no: Optional[Any] = None

    def to_dict(self):
        d = self.dict()
        if d.get("password") is None:
            d.pop("password")
        return d


class TeacherUpdateIn(BaseModel):
    first_name: Optional[Any] = None
    last_name: Optional[Any] = None
    qualification: Optional[Any] = None
    specialization: Optional[Any] = None
    status: Optional[Any] = None
    date_of_birth: Optional[Any] = None
    gender: Optional[Any] = None
    join_date: Optional[Any] = None

    def to_dict(self):
        return {k: v for k, v in self.dict().items() if v is not None}


class AssignSubjectIn(BaseModel):
    subject_id: Any
    action: Optional[str] = "assign"


# ── Literal-path routes (must come before /{id}) ──────────────

@router.get("/")
def list_teachers(
    search: Optional[str] = Query(None), status: Optional[str] = Query(None),
    page: int = Query(1), per_page: int = Query(20),
    user_id: int = Depends(require_permission("teachers.view")),
):
    filters = {k: v for k, v in {"search": search, "status": status}.items() if v}
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        result = TeacherService().get_all(filters, page, per_page)
    return {
        "status": "success",
        "data": result["items"],
        "pagination": {"total": result["total"], "page": page, "per_page": per_page},
    }


@router.post("/")
def create_teacher(body: TeacherCreateIn, user_id: int = Depends(require_permission("teachers.create"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        try:
            result = TeacherService().create(body.to_dict())
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Teacher created successfully.")


@router.get("/me")
def my_profile(user_id: int = Depends(get_current_user_id)):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        teacher = TeacherService().get_by_user_id(user_id)
    if not teacher:
        fail("Teacher profile not found.", 404)
    return ok(data=teacher)


@router.get("/me/classes")
def my_classes(user_id: int = Depends(get_current_user_id)):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        teacher = TeacherService().get_by_user_id(user_id)
    if not teacher:
        fail("Teacher profile not found.", 404)
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        data = TeacherService().get_classes(teacher["id"])
    return ok(data=data)

@router.get("/me/timetable")
def my_timetable(user_id: int = Depends(get_current_user_id)):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        teacher = TeacherService().get_by_user_id(user_id)
    if not teacher:
        fail("Teacher profile not found.", 404)
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        data = TeacherService().get_timetable(teacher["id"])
    return ok(data=data)


@router.get("/meta/subjects")
def get_all_subjects(user_id: int = Depends(require_permission("teachers.view"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        data = TeacherService().get_all_subjects()
    return ok(data=data)


# ── Parameterized /{id} routes (must come after all literal paths above) ──

@router.get("/{id}")
def get_teacher(id: int, user_id: int = Depends(require_permission("teachers.view"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        try:
            data = TeacherService().get_by_id(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(data=data)


@router.put("/{id}")
def update_teacher(id: int, body: TeacherUpdateIn, user_id: int = Depends(require_permission("teachers.edit"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        try:
            result = TeacherService().update(id, body.to_dict())
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Teacher updated successfully.")


@router.delete("/{id}")
def deactivate_teacher(id: int, user_id: int = Depends(require_permission("teachers.delete"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        try:
            TeacherService().deactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="Teacher deactivated.")


@router.post("/{id}/reactivate")
def reactivate_teacher(id: int, user_id: int = Depends(require_permission("teachers.delete"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        try:
            TeacherService().reactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="Teacher reactivated.")


@router.get("/{id}/subjects")
def teacher_subjects(id: int, user_id: int = Depends(require_permission("teachers.view"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        data = TeacherService().get_subjects(id)
    return ok(data=data)


@router.post("/{id}/subjects")
def assign_subject(id: int, body: AssignSubjectIn, user_id: int = Depends(require_permission("academics.manage"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        try:
            TeacherService().assign_subject(id, body.subject_id, body.action or "assign")
        except ValueError as e:
            fail(str(e), 400)
    return ok(message="Subject updated.")


@router.get("/{id}/timetable")
def teacher_timetable(id: int, user_id: int = Depends(require_permission("teachers.view"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        data = TeacherService().get_timetable(id)
    return ok(data=data)


@router.get("/{id}/classes")
def teacher_classes(id: int, user_id: int = Depends(require_permission("teachers.view"))):
    with _flask_app().app_context():
        from app.services.teacher_service import TeacherService
        data = TeacherService().get_classes(id)
    return ok(data=data)
