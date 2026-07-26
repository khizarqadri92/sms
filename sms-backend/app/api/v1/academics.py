"""
Native FastAPI router for Academics - migrated from app/api/v1/academics.py.
AcademicService/AcademicRepository were unused stub placeholders in the
original Flask code - all real logic lived directly in the route handlers as
inline SQL, now converted to stored procedures.
"""

from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def clean(value):
    return value if value not in ("", None) else None


class AcademicYearIn(BaseModel):
    name: str
    start_date: Any
    end_date: Any
    is_active: Optional[bool] = False


class ClassIn(BaseModel):
    name: str
    section: Optional[Any] = None
    academic_year_id: Optional[Any] = None
    capacity: Optional[Any] = None
    room_number: Optional[Any] = None
    class_type: Optional[str] = "regular"


class SubjectIn(BaseModel):
    name: str
    code: Optional[Any] = None
    description: Optional[Any] = None
    credit_hours: Optional[Any] = None
    is_active: Optional[bool] = True


class TimetableIn(BaseModel):
    class_id: Any
    subject_id: Any
    teacher_id: Any
    day_of_week: Any
    start_time: str
    end_time: str
    room_number: Optional[Any] = None


class AssignTeacherIn(BaseModel):
    teacher_id: Any
    is_primary: Optional[bool] = False
    action: Optional[str] = "assign"


class AssignSubjectIn(BaseModel):
    subject_id: Any


# ── My Classes / Subjects ─────────────────────────

@router.get("/my-classes")
def my_classes(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_classes(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/my-subjects")
def my_subjects(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_subjects(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


# ── Academic Years ─────────────────────────

@router.get("/years")
def list_academic_years(user_id: int = Depends(require_permission("academics.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_academic_years()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/years")
def create_academic_year(body: AcademicYearIn, user_id: int = Depends(require_permission("academics.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_academic_year(%s, %s, %s, %s)", (body.name, body.start_date, body.end_date, body.is_active))
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Academic year created.")


@router.put("/years/{id}/activate")
def activate_academic_year(id: int, user_id: int = Depends(require_permission("academics.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_activate_academic_year(%s)", (id,))
    db.commit()
    return ok(message="Academic year activated.")


# ── Classes ─────────────────────────

@router.get("/classes")
def list_classes(user_id: int = Depends(require_permission("classes.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_classes()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/classes")
def create_class(body: ClassIn, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_class(%s,%s,%s,%s,%s,%s)",
        (body.name, clean(body.section), clean(body.academic_year_id), clean(body.capacity), clean(body.room_number), body.class_type or "regular")
    )
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Class created.")


@router.put("/classes/{id}")
def update_class(id: int, body: ClassIn, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_class(%s,%s,%s,%s,%s,%s)",
        (id, body.name, clean(body.section), clean(body.capacity), clean(body.room_number), body.class_type or "regular")
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Class not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Class updated.")


@router.delete("/classes/{id}")
def delete_class(id: int, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_class(%s)", (id,))
    db.commit()
    return ok(message="Class deleted.")


@router.get("/classes/{id}/teachers")
def get_class_teachers(id: int, user_id: int = Depends(require_permission("classes.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_class_teachers(%s)", (id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/classes/{id}/teachers")
def assign_class_teacher(id: int, body: AssignTeacherIn, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    if (body.action or "assign") == "remove":
        cur.execute("SELECT sp_unassign_class_teacher(%s, %s)", (id, body.teacher_id))
        db.commit()
        return ok(message="Teacher removed.")

    cur.execute("SELECT * FROM sp_assign_class_teacher(%s, %s, %s)", (id, body.teacher_id, body.is_primary or False))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Teacher assigned.")


@router.delete("/classes/{id}/teachers/{teacher_id}")
def unassign_class_teacher(id: int, teacher_id: int, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_unassign_class_teacher(%s, %s)", (id, teacher_id))
    db.commit()
    return ok(message="Teacher unassigned.")


@router.get("/classes/{id}/subjects")
def get_class_subjects(id: int, user_id: int = Depends(require_permission("classes.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_class_subjects(%s)", (id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/classes/{id}/subjects")
def assign_class_subject(id: int, body: AssignSubjectIn, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_assign_class_subject(%s, %s)", (id, body.subject_id))
    db.commit()
    return ok(message="Subject assigned.")


@router.delete("/classes/{id}/subjects/{subject_id}")
def remove_class_subject(id: int, subject_id: int, user_id: int = Depends(require_permission("classes.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_remove_class_subject(%s, %s)", (id, subject_id))
    db.commit()
    return ok(message="Subject removed.")


# ── Subjects ─────────────────────────

@router.get("/subjects")
def list_subjects(user_id: int = Depends(require_permission("subjects.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_subjects()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/subjects")
def create_subject(body: SubjectIn, user_id: int = Depends(require_permission("subjects.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_subject(%s,%s,%s,%s)", (body.name, clean(body.code), clean(body.description), clean(body.credit_hours)))
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Subject created.")


@router.put("/subjects/{id}")
def update_subject(id: int, body: SubjectIn, user_id: int = Depends(require_permission("subjects.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_subject(%s,%s,%s,%s,%s,%s)",
        (id, body.name, clean(body.code), clean(body.description), clean(body.credit_hours), body.is_active)
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Subject not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Subject updated.")


@router.delete("/subjects/{id}")
def deactivate_subject(id: int, user_id: int = Depends(require_permission("subjects.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_subject(%s)", (id,))
    db.commit()
    return ok(message="Subject deactivated.")


@router.post("/subjects/{id}/reactivate")
def reactivate_subject(id: int, user_id: int = Depends(require_permission("subjects.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_subject(%s)", (id,))
    db.commit()
    return ok(message="Subject reactivated.")


# ── Timetable ─────────────────────────

@router.get("/timetable")
def list_timetable(class_id: Optional[int] = Query(None), user_id: int = Depends(require_permission("timetable.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_timetable(%s)", (class_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/timetable")
def create_timetable_entry(body: TimetableIn, user_id: int = Depends(require_permission("timetable.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute(
            "SELECT * FROM sp_create_timetable_entry(%s,%s,%s,%s,%s,%s,%s)",
            (body.class_id, body.subject_id, body.teacher_id, body.day_of_week, body.start_time, body.end_time, clean(body.room_number))
        )
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        fail("Failed to create timetable entry: " + str(e), 400)
    return ok(data=dict(row), message="Timetable entry created.")


@router.delete("/timetable/{id}")
def delete_timetable_entry(id: int, user_id: int = Depends(require_permission("timetable.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_timetable_entry(%s)", (id,))
    db.commit()
    return ok(message="Timetable entry deleted.")


@router.get("/timetable/ai-context")
def timetable_ai_context(user_id: int = Depends(require_permission("timetable.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_school_timing_settings()")
    settings = {r["key"]: r["value"] for r in cur.fetchall()}

    cur.execute("SELECT * FROM sp_get_classes_with_subjects_teachers()")
    classes = [dict(r) for r in cur.fetchall()]

    for cls in classes:
        subjects = cls.get("subjects") or []
        teachers = cls.get("teachers") or []
        teacher_ids = [t["id"] for t in teachers]
        if cls.get("class_type") != "montessori" and teacher_ids:
            for subj in subjects:
                cur.execute("SELECT * FROM sp_get_subject_teachers_for_class(%s, %s)", (subj["id"], teacher_ids))
                subj["available_teachers"] = [dict(r) for r in cur.fetchall()]

    return ok(data={"settings": settings, "classes": classes})


@router.post("/timetable/ai-generate")
def timetable_ai_generate(body: dict, user_id: int = Depends(require_permission("timetable.manage"))):
    import os
    try:
        import anthropic
    except ImportError:
        fail("The anthropic package is not installed on the server.", 500)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        fail("AI timetable generation is not configured (missing ANTHROPIC_API_KEY).", 500)

    client = anthropic.Anthropic(api_key=api_key)
    prompt = body.get("prompt", "")
    if not prompt:
        fail("prompt is required.", 400)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in response.content if hasattr(block, "text"))
    except Exception as e:
        fail("AI generation failed: " + str(e), 500)

    return ok(data={"result": text})
