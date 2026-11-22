"""
Native FastAPI router for Exams - migrated from app/api/v1/exams.py.
11 chr()-stub SPs rebuilt cleanly. All send_notification calls wrapped
in Flask app context. notify_all_users and auto_announce use direct DB
inserts (no Flask context needed).
"""

import json
from collections import defaultdict
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_campus import get_settings_campus_id
from app.fastapi_campus import get_current_campus_id
from app.fastapi_campus import catalog_campus_id, catalog_campus_id_for_write
from app.fastapi_campus import enforce_same_campus
from app.fastapi_permissions import require_permission, require_any_permission
from app.utils.datesheet_rules import check_entry
from app.utils.datesheet_planner import Planner, _d as _plan_date
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime

router = APIRouter()


def verify_exam_campus(exam_id: int, campus_id: Optional[int] = Depends(get_current_campus_id), db=Depends(get_db)):
    """
    Lightweight dependency, added to every /{exam_id}/... route's signature,
    that blocks access to an exam_id belonging to a different campus - the
    same pattern used for discipline case_id routes. An exam is considered
    to belong to a campus if it has at least one class assigned there
    (matching the filter sp_get_exams uses for listing). Before any class
    is assigned yet, the exam's creator's own campus is used instead, so
    the brief window between creating an exam and assigning classes to it
    isn't an open gap.
    """
    cur = get_cur(db)
    cur.execute("""
        SELECT c.campus_id FROM exam_classes ec JOIN classes c ON c.id = ec.class_id
        WHERE ec.exam_id = %s
    """, (exam_id,))
    class_campus_ids = {r["campus_id"] for r in cur.fetchall()}
    if class_campus_ids:
        if campus_id is not None and campus_id not in class_campus_ids:
            enforce_same_campus(-1, campus_id)
    else:
        cur.execute("""
            SELECT u.campus_id FROM exams e JOIN users u ON u.id = e.created_by
            WHERE e.id = %s
        """, (exam_id,))
        row = cur.fetchone()
        creator_campus_id = row["campus_id"] if row else None
        enforce_same_campus(creator_campus_id, campus_id)


def _campus_class_ids(cur, exam_id: int, campus_id: Optional[int]):
    """
    The exam's class ids that the caller may see. An exam can hold classes
    from several campuses (e.g. one school-wide exam), and verify_exam_campus
    only confirms the caller's campus has at least one of them - so anything
    returning an exam's classes or papers must also be narrowed with this.
    Returns None for superadmin with no campus selected ("all campuses"),
    meaning no narrowing.
    """
    if campus_id is None:
        return None
    cur.execute("""
        SELECT ec.class_id FROM exam_classes ec JOIN classes c ON c.id = ec.class_id
        WHERE ec.exam_id = %s AND c.campus_id = %s
    """, (exam_id, campus_id))
    return {r["class_id"] for r in cur.fetchall()}


def _only_campus_rows(rows, allowed_class_ids):
    """Keeps only rows whose class_id is in allowed_class_ids (None = keep all)."""
    if allowed_class_ids is None:
        return rows
    return [r for r in rows if r.get("class_id") in allowed_class_ids]


def _enforce_class_campus(cur, class_id, campus_id: Optional[int]):
    """
    Write-side guard: 404s if class_id belongs to a different campus than
    the caller's, so a datesheet entry can't be created or changed for
    another campus's class even inside a shared exam.
    """
    if campus_id is None or class_id is None:
        return
    cur.execute("SELECT campus_id FROM classes WHERE id = %s", (class_id,))
    row = cur.fetchone()
    if not row:
        fail("Class not found.", 404)
    enforce_same_campus(row["campus_id"], campus_id)


def _raise_conflicts(result):
    """400 with every hard conflict listed, readable as one message too."""
    raise HTTPException(status_code=400, detail={
        "status": "error",
        "message": " ".join(e["message"] for e in result["errors"]),
        "errors": result["errors"],
        "warnings": result["warnings"],
    })


def _apply_shift(cur, body, exam_id):
    """If the entry is in a shift, its time and duration come from that shift."""
    if not body.shift_id:
        return
    cur.execute("SELECT start_time, duration_mins FROM exam_shifts WHERE id=%s AND exam_id=%s",
                (body.shift_id, exam_id))
    sh = cur.fetchone()
    if not sh:
        fail("Selected shift does not belong to this exam.", 400)
    body.start_time = str(sh["start_time"])[:5]
    body.duration_mins = sh["duration_mins"]


def _room_venue(cur, body):
    """A chosen room also fills the free-text venue, which other screens display."""
    if body.room_id and not (body.venue or "").strip():
        cur.execute("SELECT name FROM rooms WHERE id=%s", (body.room_id,))
        r = cur.fetchone()
        if r:
            body.venue = r["name"]


def _entry_dict(body):
    return {"class_id": body.class_id, "subject_id": body.subject_id,
            "exam_date": body.exam_date or None, "start_time": body.start_time or None,
            "duration_mins": body.duration_mins or 120, "room_id": body.room_id,
            "teacher_id": body.teacher_id}


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def fmt(row, keys):
    for k in keys:
        if row.get(k): row[k] = str(row[k])
    return row


DATE_KEYS = ["start_date", "end_date", "published_at", "approved_at", "created_at",
             "exam_date", "start_time", "submitted_at", "compiled_at",
             "datesheet_published_at", "datesheet_submitted_at", "datesheet_approved_at",
             "entered_at", "updated_at"]


# ─── Pydantic models ─────────────────────────────────────────────────────────

class ComponentIn(BaseModel):
    name: str
    code: Optional[str] = ""
    collection_method: Optional[str] = "per_subject"
    description: Optional[str] = ""
    is_active: Optional[bool] = True


class FormulaIn(BaseModel):
    formula: Optional[List[dict]] = []
    formula_mode: Optional[str] = "percentage"


class ExamTypeIn(BaseModel):
    name: str
    code: Optional[str] = None
    weight: Optional[float] = 0
    order_no: Optional[int] = 1
    is_active: Optional[bool] = True
    publish_mode: Optional[str] = "per_class"
    require_datesheet_approval: Optional[bool] = True
    include_in_final: Optional[bool] = True
    datesheet_submit_role: Optional[str] = "academic_coordinator"
    datesheet_approve_role: Optional[str] = "principal"
    datesheet_publish_role: Optional[str] = "academic_coordinator"


class GradingIn(BaseModel):
    grades: List[dict]


class ExamConfigIn(BaseModel):
    passing_pct: Optional[float] = 40
    max_fail_subjects: Optional[int] = 2
    allow_compartment: Optional[bool] = True
    compartment_min_pct: Optional[float] = 33
    position_formula: Optional[List[dict]] = []
    grading_mode: Optional[str] = "score"
    withhold_on_fee_due: Optional[bool] = False     # hold results of students with unpaid fee
    withhold_fee_months: Optional[int] = 1          # ... once this many months are unpaid and overdue


class ExamCreateIn(BaseModel):
    name: str
    exam_type_id: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    class_ids: Optional[List[int]] = []
    all_classes: Optional[bool] = False


class ExamUpdateIn(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class SubjectAddIn(BaseModel):
    class_id: int
    subject_id: int
    teacher_id: Optional[int] = None
    total_marks: Optional[float] = 100
    passing_marks: Optional[float] = 40
    exam_date: Optional[str] = None
    start_time: Optional[str] = None
    duration_mins: Optional[int] = 120
    venue: Optional[str] = ""
    room_id: Optional[int] = None
    shift_id: Optional[int] = None
    source: Optional[str] = None          # "manual" (default) or "auto"


class EntryCheckIn(SubjectAddIn):
    exclude_id: Optional[int] = None      # the entry being edited


class RoomIn(BaseModel):
    name: str
    capacity: int
    is_active: Optional[bool] = True


class ShiftIn(BaseModel):
    shift_no: int
    name: str
    start_time: str
    duration_mins: int


class ShiftsIn(BaseModel):
    mode: str                              # "single" or "multiple"
    shifts: Optional[List[ShiftIn]] = []
    class_shifts: Optional[dict] = {}      # {class_id: shift_no} default shift per class


class GenClassCfg(BaseModel):
    start_date: Optional[str] = None
    gap_days: Optional[int] = 0
    order: Optional[List[int]] = []


class GenerateIn(BaseModel):
    pattern: str = "daily"                 # daily | alternate | classwise (presets of class_config)
    class_ids: List[int]
    start_date: str
    end_date: str
    weekdays: Optional[List[int]] = [0, 1, 2, 3, 4]   # Mon=0 .. Sun=6
    start_time: Optional[str] = "09:00"    # single-shift exams
    duration_mins: Optional[int] = 120
    class_config: Optional[dict] = {}      # {class_id: GenClassCfg} - used by "classwise"
    replace: Optional[str] = "auto"        # auto = keep manual entries | all
    seed: Optional[int] = None


class GenEntry(BaseModel):
    key: str
    class_id: int
    subject_id: int
    exam_date: Optional[str] = None
    start_time: Optional[str] = None
    duration_mins: Optional[int] = 120
    shift_id: Optional[int] = None
    room_id: Optional[int] = None
    teacher_id: Optional[int] = None


class GenSetIn(BaseModel):
    class_ids: List[int]
    start_date: str
    end_date: str
    replace: Optional[str] = "auto"
    entries: List[GenEntry]
    confirm: Optional[bool] = False        # save: overwrite existing entries


class MarksEntryIn(BaseModel):
    class_id: int
    subject_id: int
    marks: Optional[List[dict]] = []


class SubmitMarksIn(BaseModel):
    class_id: int
    subject_id: int


class StatusUpdateIn(BaseModel):
    status: str


class ReminderIn(BaseModel):
    user_id: int
    message: Optional[str] = "Please submit your exam marks."
    title: Optional[str] = "Marks Entry Reminder"


class CompileIn(BaseModel):
    class_id: int


# ─── Helper functions ─────────────────────────────────────────────────────────

def notify_all_users(db, title, body_text, link, notif_type="exam"):
    try:
        cur = get_cur(db)
        cur.execute("SELECT id FROM users WHERE is_active=TRUE")
        users = [r["id"] for r in cur.fetchall()]
        for uid in users:
            cur.execute("INSERT INTO notifications(user_id,title,body,link,type) VALUES(%s,%s,%s,%s,%s)",
                        (uid, title, body_text, link, notif_type))
        db.commit()
    except Exception as e:
        print("[notify_all]", e)


def auto_announce(db, title, body_text, link, link_label="View", ann_type="exam"):
    try:
        cur = get_cur(db)
        cur.execute("""INSERT INTO announcements(title,body,link,link_label,ann_type,target_role,priority,source_type)
                       VALUES(%s,%s,%s,%s,%s,'all','normal','exam_auto')""",
                    (title, body_text, link, link_label, ann_type))
        db.commit()
    except Exception as e:
        print("[auto_announce]", e)


# ─── Components ───────────────────────────────────────────────────────────────

@router.get("/components")
def get_components(user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM result_components ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/components")
def create_component(body: ComponentIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute("INSERT INTO result_components(name,code,collection_method,description,created_by) VALUES(%s,%s,%s,%s,%s) RETURNING id",
                    (body.name, (body.code or "").upper(), body.collection_method or "per_subject", body.description or "", user_id))
        db.commit()
        return ok(data={"id": cur.fetchone()["id"]}, message="Component created.")
    except Exception as e:
        db.rollback(); fail("Code already exists or invalid data: " + str(e), 400)


@router.put("/components/{comp_id}")
def update_component(comp_id: int, body: ComponentIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE result_components SET name=%s,collection_method=%s,description=%s,is_active=%s WHERE id=%s",
                (body.name, body.collection_method or "per_subject", body.description or "", body.is_active if body.is_active is not None else True, comp_id))
    db.commit()
    return ok(message="Updated.")


# ─── Formula ─────────────────────────────────────────────────────────────────

def _settings_academic_year(cur, settings_campus_id):
    """
    The active academic year that exam settings (result formula, exam config)
    are stored against. settings_campus_id comes from get_settings_campus_id:
      * a campus id  -> that campus runs its own settings: use its own active
                        year (or a no-campus year); none -> clear error
      * None         -> shared settings: a no-campus year if one exists, else
                        the active year of a campus that does NOT run its own
                        settings (where the shared settings live, e.g. Main Campus)
    """
    if settings_campus_id is not None:
        cur.execute("""SELECT id FROM academic_years WHERE is_active=TRUE AND (campus_id=%s OR campus_id IS NULL)
                       ORDER BY campus_id NULLS LAST, id LIMIT 1""", (settings_campus_id,))
        ay = cur.fetchone()
        if not ay:
            cur.execute("SELECT name FROM campuses WHERE id=%s", (settings_campus_id,))
            cn = cur.fetchone()
            fail(f"{cn['name'] if cn else 'This campus'} uses its own settings but has no active academic year. "
                 "Create and activate one in Academic Years first.", 400)
        return ay
    cur.execute("""SELECT ay.id FROM academic_years ay LEFT JOIN campuses c ON c.id = ay.campus_id
                   WHERE ay.is_active = TRUE AND (ay.campus_id IS NULL OR COALESCE(c.uses_own_settings, FALSE) = FALSE)
                   ORDER BY ay.campus_id NULLS FIRST, ay.id LIMIT 1""")
    ay = cur.fetchone()
    if not ay:
        fail("No active academic year found. Create and activate one in Academic Years first.", 400)
    return ay


@router.get("/formula")
def get_formula(user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    ay = _settings_academic_year(cur, campus_id)
    cur.execute("SELECT * FROM result_formula WHERE academic_year_id=%s", (ay["id"],))
    row = cur.fetchone()
    if not row:
        cur.execute("INSERT INTO result_formula(academic_year_id) VALUES(%s) ON CONFLICT(academic_year_id) DO NOTHING", (ay["id"],))
        db.commit()
        cur.execute("SELECT * FROM result_formula WHERE academic_year_id=%s", (ay["id"],))
        row = cur.fetchone()
    result = dict(row)
    if result.get("updated_at"): result["updated_at"] = str(result["updated_at"])
    return ok(data=result)


@router.put("/formula")
def update_formula(body: FormulaIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    formula = body.formula or []
    total = sum(float(c.get("weight", 0)) for c in formula)
    formula_mode = body.formula_mode or "percentage"
    is_configured = abs(total - 100) < 0.5 if formula_mode == "percentage" else len(formula) > 0
    cur = get_cur(db)
    ay = _settings_academic_year(cur, campus_id)
    cur.execute("INSERT INTO result_formula(academic_year_id) VALUES(%s) ON CONFLICT(academic_year_id) DO NOTHING", (ay["id"],))
    cur.execute("UPDATE result_formula SET formula=%s,total_weight=%s,is_configured=%s,formula_mode=%s,updated_by=%s,updated_at=%s WHERE academic_year_id=%s",
                (json.dumps(formula), total, is_configured, formula_mode, user_id, get_processing_datetime(db), ay["id"]))
    db.commit()
    return ok(message="Formula saved.")


# ─── Exam Types ───────────────────────────────────────────────────────────────

@router.get("/types")
def get_exam_types(user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("exam_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM exam_types WHERE campus_id = %s OR campus_id IS NULL ORDER BY order_no", (campus_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/types")
def create_exam_type(body: ExamTypeIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("exam_types"))):
    cur = get_cur(db)
    cur.execute("INSERT INTO exam_types(name,code,weight,order_no,campus_id) VALUES(%s,%s,%s,%s,%s) RETURNING id",
                (body.name, body.code, body.weight or 0, body.order_no or 1, campus_id))
    db.commit()
    return ok(data={"id": cur.fetchone()["id"]}, message="Exam type created.")


@router.put("/types/{type_id}")
def update_exam_type(type_id: int, body: ExamTypeIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("exam_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM exam_types WHERE id=%s", (type_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("""UPDATE exam_types SET name=%s,weight=%s,order_no=%s,is_active=%s,
                   publish_mode=%s,require_datesheet_approval=%s,include_in_final=%s,
                   datesheet_submit_role=%s,datesheet_approve_role=%s,datesheet_publish_role=%s
                   WHERE id=%s""",
                (body.name, body.weight or 0, body.order_no or 1,
                 body.is_active if body.is_active is not None else True,
                 body.publish_mode or "per_class",
                 body.require_datesheet_approval if body.require_datesheet_approval is not None else True,
                 body.include_in_final if body.include_in_final is not None else True,
                 body.datesheet_submit_role or "academic_coordinator",
                 body.datesheet_approve_role or "principal",
                 body.datesheet_publish_role or "academic_coordinator", type_id))
    db.commit()
    return ok(message="Exam type updated.")


# ─── Grading Scale ────────────────────────────────────────────────────────────

@router.get("/grading")
def get_grading(user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM grading_scales WHERE is_active=TRUE ORDER BY order_no")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/grading")
def update_grading(body: GradingIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM grading_scales")
    for i, g in enumerate(body.grades):
        cur.execute("INSERT INTO grading_scales(grade,min_pct,max_pct,gpa,description,order_no) VALUES(%s,%s,%s,%s,%s,%s)",
                    (g.get("grade"), g.get("min_pct"), g.get("max_pct"), g.get("gpa", 0), g.get("description", ""), i + 1))
    db.commit()
    return ok(message="Grading scale updated.")


# ─── Exam Config ──────────────────────────────────────────────────────────────

@router.get("/exam-config")
def get_exam_config(user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    ay = _settings_academic_year(cur, campus_id)
    cur.execute("SELECT * FROM exam_config WHERE academic_year_id=%s", (ay["id"],))
    row = cur.fetchone()
    if not row:
        cur.execute("INSERT INTO exam_config(academic_year_id) VALUES(%s) ON CONFLICT(academic_year_id) DO NOTHING RETURNING *", (ay["id"],))
        db.commit()
        cur.execute("SELECT * FROM exam_config WHERE academic_year_id=%s", (ay["id"],))
        row = cur.fetchone()
    result = dict(row)
    if result.get("updated_at"): result["updated_at"] = str(result["updated_at"])
    return ok(data=result)


@router.put("/exam-config")
def update_exam_config(body: ExamConfigIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    ay = _settings_academic_year(cur, campus_id)
    cur.execute("INSERT INTO exam_config(academic_year_id) VALUES(%s) ON CONFLICT(academic_year_id) DO NOTHING", (ay["id"],))
    if body.passing_pct is not None and not (0 <= body.passing_pct <= 100): fail("Passing % must be between 0 and 100.", 400)
    if body.compartment_min_pct is not None and not (0 <= body.compartment_min_pct <= 100): fail("Compartment minimum % must be between 0 and 100.", 400)
    if body.max_fail_subjects is not None and body.max_fail_subjects < 0: fail("Max failed subjects can't be negative.", 400)
    if body.withhold_fee_months is not None and body.withhold_fee_months < 1: fail("Unpaid months must be at least 1.", 400)
    cur.execute("""UPDATE exam_config SET passing_pct=%s,max_fail_subjects=%s,allow_compartment=%s,
        compartment_min_pct=%s,position_formula=%s,grading_mode=%s,
        withhold_on_fee_due=%s,withhold_fee_months=%s,updated_at=%s,updated_by=%s
        WHERE academic_year_id=%s""",
        (body.passing_pct if body.passing_pct is not None else 40,
         body.max_fail_subjects if body.max_fail_subjects is not None else 2,
         body.allow_compartment if body.allow_compartment is not None else True,
         body.compartment_min_pct if body.compartment_min_pct is not None else 33,
         json.dumps(body.position_formula or []), body.grading_mode or "score",
         bool(body.withhold_on_fee_due), body.withhold_fee_months or 1,
         get_processing_datetime(db), user_id, ay["id"]))
    db.commit()
    return ok(message="Exam config updated.")


# ─── Exams CRUD ───────────────────────────────────────────────────────────────

# ─── Rooms (per campus, with seating capacity) ────────────────────────────────

@router.get("/rooms")
def list_rooms(include_inactive: bool = Query(False), user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")),
               db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""SELECT id, campus_id, name, capacity, is_active FROM rooms
                   WHERE (%s::int IS NULL OR campus_id=%s) AND (%s OR is_active)
                   ORDER BY lower(name)""", (campus_id, campus_id, include_inactive))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/rooms")
def create_room(body: RoomIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")),
                db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if campus_id is None: fail("Select a campus first.", 400)
    if not body.name.strip(): fail("Room name is required.", 400)
    if body.capacity < 1: fail("Capacity must be at least 1.", 400)
    cur = get_cur(db)
    cur.execute("SELECT 1 FROM rooms WHERE campus_id=%s AND lower(name)=lower(%s)", (campus_id, body.name.strip()))
    if cur.fetchone(): fail("A room with this name already exists.", 400)
    cur.execute("INSERT INTO rooms(campus_id,name,capacity,is_active) VALUES(%s,%s,%s,%s) RETURNING id",
                (campus_id, body.name.strip(), body.capacity, body.is_active is not False))
    rid = cur.fetchone()["id"]
    db.commit()
    return ok(message="Room added.", data={"id": rid})


@router.put("/rooms/{room_id}")
def update_room(room_id: int, body: RoomIn, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")),
                db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM rooms WHERE id=%s", (room_id,))
    row = cur.fetchone()
    if not row: fail("Room not found.", 404)
    enforce_same_campus(row["campus_id"], campus_id)
    if not body.name.strip(): fail("Room name is required.", 400)
    if body.capacity < 1: fail("Capacity must be at least 1.", 400)
    cur.execute("SELECT 1 FROM rooms WHERE COALESCE(campus_id,0)=COALESCE(%s,0) AND lower(name)=lower(%s) AND id<>%s",
                (row["campus_id"], body.name.strip(), room_id))
    if cur.fetchone(): fail("A room with this name already exists.", 400)
    cur.execute("UPDATE rooms SET name=%s, capacity=%s, is_active=%s, updated_at=now() WHERE id=%s",
                (body.name.strip(), body.capacity, body.is_active is not False, room_id))
    db.commit()
    return ok(message="Room updated.")


@router.delete("/rooms/{room_id}")
def deactivate_room(room_id: int, user_id: int = Depends(require_permission("exams_results.exam_setup_edit")),
                    db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Rooms are deactivated, not deleted, so past datesheets keep their room."""
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM rooms WHERE id=%s", (room_id,))
    row = cur.fetchone()
    if not row: fail("Room not found.", 404)
    enforce_same_campus(row["campus_id"], campus_id)
    cur.execute("UPDATE rooms SET is_active=FALSE, updated_at=now() WHERE id=%s", (room_id,))
    db.commit()
    return ok(message="Room deactivated.")


@router.get("/")
def list_exams(
    class_id: Optional[str] = Query(None),
    user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
    campus_id: Optional[int] = Depends(get_current_campus_id),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    cur = get_cur(db)
    effective_class_id = class_id

    if role == "teacher":
        cur.execute("""SELECT ct.class_id FROM class_teachers ct
                       JOIN teachers t ON t.id=ct.teacher_id
                       WHERE t.user_id=%s AND ct.is_primary=TRUE""", (user_id,))
        incharge = [r["class_id"] for r in cur.fetchall()]
        if class_id and int(class_id) in incharge:
            pass
        elif not class_id and incharge:
            effective_class_id = incharge[0]

    cur.execute("SELECT * FROM sp_get_exams(%s, NULL, %s)", (effective_class_id, campus_id))
    rows = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.get("/{exam_id}")
def get_exam(exam_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_detail(%s)", (exam_id,))
    row = cur.fetchone()
    if not row: fail("Exam not found", 404)
    result = fmt(dict(row), DATE_KEYS)
    cur.execute("""SELECT ec.class_id, c.name as class_name, c.section
                   FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s AND (%s::int IS NULL OR c.campus_id=%s)
                   ORDER BY c.name, c.section""", (exam_id, campus_id, campus_id))
    result["exam_classes"] = [dict(r) for r in cur.fetchall()]
    allowed = _campus_class_ids(cur, exam_id, campus_id)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    subjects = _only_campus_rows([fmt(dict(r), DATE_KEYS) for r in cur.fetchall()], allowed)
    result["subjects"] = subjects
    return ok(data=result)


@router.post("/")
def create_exam(body: ExamCreateIn, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE AND (campus_id = %s OR campus_id IS NULL) ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
    ay = cur.fetchone()
    if not ay: fail("No active academic year", 404)

    # An exam is created for one campus: "all classes" means all classes of
    # the caller's campus, and hand-picked classes must belong to it too.
    # Superadmin must pick a campus in the switcher first (campus_id None
    # would otherwise mean every campus's classes).
    if campus_id is None:
        fail("Select a campus first, then create the exam.", 400)
    class_ids = body.class_ids or []
    if body.all_classes:
        cur.execute("SELECT id FROM classes WHERE campus_id=%s ORDER BY name, section", (campus_id,))
        class_ids = [r["id"] for r in cur.fetchall()]
    elif class_ids:
        cur.execute("SELECT id FROM classes WHERE id = ANY(%s) AND campus_id=%s", (list(class_ids), campus_id))
        own = {r["id"] for r in cur.fetchall()}
        if len(own) != len(set(class_ids)):
            fail("Some selected classes belong to another campus.", 400)
    if not class_ids: fail("Select at least one class.", 400)

    cur.execute("""INSERT INTO exams(academic_year_id,exam_type_id,name,start_date,end_date,created_by,status)
                   VALUES(%s,%s,%s,%s,%s,%s,'draft') RETURNING id""",
                (ay["id"], body.exam_type_id, body.name, body.start_date or None, body.end_date or None, user_id))
    exam_id = cur.fetchone()["id"]

    for cid in class_ids:
        cur.execute("INSERT INTO exam_classes(exam_id,class_id) VALUES(%s,%s) ON CONFLICT DO NOTHING", (exam_id, cid))
    db.commit()

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE AND (u.campus_id=%s OR u.campus_id IS NULL)", (campus_id,))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            _t, _b = render_templated_notification("exam_created", {"exam_name": body.name, "class_count": len(class_ids)},
                "New Exam Created", f"Exam '{body.name}' created for {len(class_ids)} class(es). Build the datesheet.", campus_id=campus_id)
            for row in rows:
                send_notification(row["id"], _t, _b, "info")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message=f"Exam created for {len(class_ids)} class(es).", data={"id": exam_id})


@router.put("/{exam_id}")
def update_exam(exam_id: int, body: ExamUpdateIn, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    cur = get_cur(db)
    cur.execute("UPDATE exams SET name=%s,start_date=%s,end_date=%s WHERE id=%s",
                (body.name, body.start_date or None, body.end_date or None, exam_id))
    db.commit()
    return ok(message="Exam updated.")


@router.delete("/{exam_id}")
def delete_exam(exam_id: int, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    cur = get_cur(db)
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    row = cur.fetchone()
    if not row: fail("Exam not found", 404)
    if row["status"] not in ("draft", "scheduled"):
        fail("Only draft or scheduled exams can be deleted.", 400)
    cur.execute("DELETE FROM exams WHERE id=%s", (exam_id,))
    db.commit()
    return ok(message="Exam deleted.")


@router.put("/{exam_id}/status")
def update_status(exam_id: int, body: StatusUpdateIn, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Only "send for approval" (compiled -> reviewed) goes through here. Approve
    and publish have their own endpoints and permissions, so a status can't
    be set directly to skip the principal's approval.
    """
    cur = get_cur(db)
    if body.status != "reviewed":
        fail("Only sending results for approval is done here; approval and publishing have their own steps.", 400)
    state = _refresh_exam_compiled(cur, exam_id)
    if state["status"] != "compiled":
        fail("Results can be sent for approval only after every class with students is compiled.", 400)
    cur.execute("UPDATE exams SET status='reviewed' WHERE id=%s AND status='compiled'", (exam_id,))
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT name FROM exams WHERE id=%s", (exam_id,))
        ename = (cur.fetchone() or {}).get("name", "Exam")
        cur.execute("""SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
                       WHERE r.name='principal' AND u.is_active=TRUE AND (%s::int IS NULL OR u.campus_id=%s OR u.campus_id IS NULL)""",
                    (campus_id, campus_id))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["id"], "Results Awaiting Approval",
                                  f"{ename}: results are compiled and waiting for your approval.", "info", f"/exams/{exam_id}")
    except Exception as e:
        print("[exam notify]", e)
    return ok(message="Sent for principal approval.")


# ─── Subjects ─────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/subjects")
def get_exam_subjects_list(exam_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    allowed = _campus_class_ids(cur, exam_id, campus_id)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    rows = _only_campus_rows([fmt(dict(r), DATE_KEYS) for r in cur.fetchall()], allowed)
    return ok(data=rows)


@router.get("/{exam_id}/available-subjects")
def get_available_subjects(exam_id: int, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""
        SELECT DISTINCT s.id, s.name, s.code,
               STRING_AGG(DISTINCT c.name||(CASE WHEN c.section IS NOT NULL AND c.section!='' THEN ' ('||c.section||')' ELSE '' END), ', ') as class_names
        FROM exam_classes ec
        JOIN class_subjects cs ON cs.class_id=ec.class_id
        JOIN subjects s ON s.id=cs.subject_id
        JOIN classes c ON c.id=ec.class_id
        WHERE ec.exam_id=%s AND s.id NOT IN (SELECT subject_id FROM exam_subjects WHERE exam_id=%s)
          AND (%s::int IS NULL OR c.campus_id=%s)
        GROUP BY s.id, s.name, s.code ORDER BY s.name
    """, (exam_id, exam_id, campus_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/{exam_id}/subjects")
def add_subject(exam_id: int, body: SubjectAddIn, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _enforce_class_campus(cur, body.class_id, campus_id)
    _apply_shift(cur, body, exam_id)
    _room_venue(cur, body)
    # Add matches an existing entry by class + subject (that's how the current
    # Edit popup saves), so that entry is excluded from its own conflict checks.
    cur.execute("SELECT id, source FROM exam_subjects WHERE exam_id=%s AND class_id=%s AND subject_id=%s",
                (exam_id, body.class_id, body.subject_id))
    existing = cur.fetchone()
    check = check_entry(cur, exam_id, _entry_dict(body),
                        exclude_id=existing["id"] if existing else None, campus_id=campus_id)
    if check["errors"]:
        _raise_conflicts(check)
    cur.execute("SELECT * FROM sp_add_exam_subject(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (exam_id, body.class_id, body.subject_id, body.teacher_id or None,
                 body.total_marks or 100, body.passing_marks or 40,
                 body.exam_date or None, body.start_time or None,
                 body.duration_mins or 120, body.venue or ""))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    # keep an existing entry's source unless the caller sets one
    source = body.source if body.source in ("manual", "auto") else (existing["source"] if existing else "manual")
    cur.execute("UPDATE exam_subjects SET room_id=%s, shift_id=%s, source=%s WHERE id=%s",
                (body.room_id, body.shift_id, source, result["id"]))
    db.commit()
    return ok(message="Subject added.", data={"id": result["id"], "warnings": check["warnings"]})


@router.put("/{exam_id}/subjects/{entry_id}")
def update_entry(exam_id: int, entry_id: int, body: SubjectAddIn, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Edit one datesheet entry by id - unlike Add, this can change its class or
    subject as well as date, time, room, shift and invigilator.
    """
    cur = get_cur(db)
    cur.execute("SELECT class_id, subject_id, source FROM exam_subjects WHERE id=%s AND exam_id=%s", (entry_id, exam_id))
    cur_row = cur.fetchone()
    if not cur_row: fail("Datesheet entry not found.", 404)
    _enforce_class_campus(cur, cur_row["class_id"], campus_id)
    _enforce_class_campus(cur, body.class_id, campus_id)
    moving = (cur_row["class_id"] != body.class_id or cur_row["subject_id"] != body.subject_id)
    if moving:
        cur.execute("SELECT 1 FROM exam_marks WHERE exam_subject_id=%s LIMIT 1", (entry_id,))
        if cur.fetchone():
            fail("Marks are already entered for this paper, so its class or subject can't be changed.", 400)
        cur.execute("SELECT 1 FROM exam_classes WHERE exam_id=%s AND class_id=%s", (exam_id, body.class_id))
        if not cur.fetchone():
            fail("The selected class is not part of this exam.", 400)
    _apply_shift(cur, body, exam_id)
    _room_venue(cur, body)
    check = check_entry(cur, exam_id, _entry_dict(body), exclude_id=entry_id, campus_id=campus_id)
    if check["errors"]:
        _raise_conflicts(check)
    cur.execute("""UPDATE exam_subjects SET class_id=%s, subject_id=%s, teacher_id=%s,
                       total_marks=%s, passing_marks=%s, exam_date=%s, start_time=%s,
                       duration_mins=%s, venue=%s, room_id=%s, shift_id=%s
                   WHERE id=%s""",
                (body.class_id, body.subject_id, body.teacher_id or None,
                 body.total_marks or 100, body.passing_marks or 40,
                 body.exam_date or None, body.start_time or None,
                 body.duration_mins or 120, body.venue or "", body.room_id, body.shift_id, entry_id))
    db.commit()
    return ok(message="Entry updated.", data={"id": entry_id, "warnings": check["warnings"]})


@router.post("/{exam_id}/datesheet/check")
def check_datesheet_entry(exam_id: int, body: EntryCheckIn, user_id: int = Depends(require_permission("exams_results.datesheet_edit")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Live validation for the Add/Edit forms - saves nothing."""
    cur = get_cur(db)
    _enforce_class_campus(cur, body.class_id, campus_id)
    _apply_shift(cur, body, exam_id)
    exclude = body.exclude_id
    if not exclude:
        cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND class_id=%s AND subject_id=%s",
                    (exam_id, body.class_id, body.subject_id))
        ex = cur.fetchone()
        exclude = ex["id"] if ex else None
    return ok(data=check_entry(cur, exam_id, _entry_dict(body), exclude_id=exclude, campus_id=campus_id))


# ─── Auto-generate datesheet ──────────────────────────────────────────────────

def _gen_guard(cur, exam_id, campus_id):
    if campus_id is None:
        fail("Select a campus first.", 400)
    cur.execute("SELECT datesheet_status FROM exams WHERE id=%s", (exam_id,))
    row = cur.fetchone()
    if not row: fail("Exam not found.", 404)
    if (row["datesheet_status"] or "draft") in ("submitted", "approved", "published"):
        fail("This datesheet is " + row["datesheet_status"] + " and can't be regenerated.", 400)


def _gen_planner(cur, exam_id, campus_id, class_ids, start_date, end_date, replace):
    start, end = _plan_date(start_date), _plan_date(end_date)
    if not start or not end or end < start: fail("Choose a valid start and end date.", 400)
    if (end - start).days > 120: fail("The exam period can be at most 120 days.", 400)
    if replace not in ("auto", "all"): fail("Replace must be auto or all.", 400)
    pl = Planner(cur, exam_id, campus_id, class_ids, start, end, replace)
    unknown = [c for c in class_ids if c not in pl.classes]
    if unknown: fail("Some selected classes are not part of this exam on your campus.", 400)
    if not class_ids: fail("Select at least one class.", 400)
    return pl


@router.post("/{exam_id}/datesheet/generate")
def generate_datesheet(exam_id: int, body: GenerateIn, user_id: int = Depends(require_permission("exams_results.datesheet_edit")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Builds a complete datesheet in memory and returns it as a preview - saves nothing."""
    cur = get_cur(db)
    _gen_guard(cur, exam_id, campus_id)
    pl = _gen_planner(cur, exam_id, campus_id, body.class_ids, body.start_date, body.end_date, body.replace)
    weekdays = [w for w in (body.weekdays or []) if 0 <= w <= 6]
    if not weekdays: fail("Choose at least one exam day of the week.", 400)
    # the three patterns are presets of the per-class settings
    if body.pattern == "classwise":
        cfg = {int(k): (v if isinstance(v, dict) else {}) for k, v in (body.class_config or {}).items()}
    elif body.pattern in ("daily", "alternate"):
        gap = 1 if body.pattern == "alternate" else 0
        cfg = {cid: {"start_date": body.start_date, "gap_days": gap,
                     "order": ((body.class_config or {}).get(str(cid)) or (body.class_config or {}).get(cid) or {}).get("order") or []}
               for cid in body.class_ids}
    else:
        fail("Pattern must be daily, alternate or classwise.", 400)
    entries, problems, stats = pl.generate(cfg, set(weekdays), body.start_time or "09:00", body.duration_mins or 120, seed=body.seed)
    checks = pl.check_set(entries)
    return ok(data={
        "entries": [pl.describe(e) for e in entries],
        "checks": checks,
        "problems": problems,
        "stats": stats,
        "replacing": {"auto": sum(1 for f in pl.replaced_ids), "kept_manual": sum(1 for f in pl.fixed if f["exam_id"] == exam_id and f["class_id"] in pl.scope)},
        "rooms": list(pl.rooms.values()),
        "teachers": [{"id": tid, "name": n} for tid, n in pl.teacher_name.items()],
        "shifts": list(pl.shifts.values()),
        "class_subjects": {cid: [{"subject_id": s, "name": pl.subject_name[s]} for s in subs] for cid, subs in pl.class_subjects.items()},
    })


@router.post("/{exam_id}/datesheet/check-set")
def check_generated_set(exam_id: int, body: GenSetIn, user_id: int = Depends(require_permission("exams_results.datesheet_edit")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Re-checks a whole (edited) preview against itself and everything already saved."""
    cur = get_cur(db)
    if campus_id is None: fail("Select a campus first.", 400)
    pl = _gen_planner(cur, exam_id, campus_id, body.class_ids, body.start_date, body.end_date, body.replace)
    entries = [e.dict() for e in body.entries]
    return ok(data={"checks": pl.check_set(entries), "entries": [pl.describe(e) for e in entries]})


@router.post("/{exam_id}/datesheet/save-generated")
def save_generated(exam_id: int, body: GenSetIn, user_id: int = Depends(require_permission("exams_results.datesheet_edit")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Saves the preview as a Draft. Existing entries for the selected classes are
    only replaced after confirmation: replace=auto removes earlier generated
    entries and keeps manual ones, replace=all removes both.
    """
    cur = get_cur(db)
    _gen_guard(cur, exam_id, campus_id)
    pl = _gen_planner(cur, exam_id, campus_id, body.class_ids, body.start_date, body.end_date, body.replace)
    entries = [e.dict() for e in body.entries]
    if not entries: fail("There are no entries to save.", 400)
    checks = pl.check_set(entries)
    bad = {k: v["errors"] for k, v in checks.items() if v["errors"]}
    if bad:
        raise HTTPException(status_code=400, detail={"status": "error",
            "message": f"{len(bad)} entr{'y has' if len(bad) == 1 else 'ies have'} conflicts. Fix them before saving.",
            "checks": checks})
    kept_manual = sum(1 for f in pl.fixed if f["exam_id"] == exam_id and f["class_id"] in pl.scope)
    if pl.replaced_ids and not body.confirm:
        raise HTTPException(status_code=409, detail={"status": "confirm",
            "message": f"{len(pl.replaced_ids)} existing entr{'y' if len(pl.replaced_ids) == 1 else 'ies'} for these classes will be replaced"
                       + (f"; {kept_manual} manual entr{'y stays' if kept_manual == 1 else 'ies stay'}." if kept_manual else "."),
            "replace_count": len(pl.replaced_ids), "kept_manual": kept_manual})
    if pl.replaced_ids:
        cur.execute("SELECT COUNT(*) AS n FROM exam_marks WHERE exam_subject_id = ANY(%s)", (pl.replaced_ids,))
        if cur.fetchone()["n"]:
            fail("Some entries being replaced already have marks entered, so they can't be replaced.", 400)
        cur.execute("DELETE FROM exam_subjects WHERE id = ANY(%s)", (pl.replaced_ids,))
    for e in entries:
        r = pl.rooms.get(int(e["room_id"])) if e.get("room_id") else None
        cur.execute("""INSERT INTO exam_subjects(exam_id, class_id, subject_id, teacher_id, total_marks, passing_marks,
                                                 exam_date, start_time, duration_mins, venue, room_id, shift_id, source)
                       VALUES(%s,%s,%s,%s,100,40,%s,%s,%s,%s,%s,%s,'auto')""",
                    (exam_id, e["class_id"], e["subject_id"], e.get("teacher_id"), e.get("exam_date"),
                     e.get("start_time"), e.get("duration_mins") or 120, r["name"] if r else "",
                     e.get("room_id"), e.get("shift_id")))
    db.commit()
    return ok(message=f"{len(entries)} papers saved as a draft datesheet.", data={"saved": len(entries), "replaced": len(pl.replaced_ids)})


# ─── Shifts (per exam, per campus) ────────────────────────────────────────────

@router.get("/{exam_id}/shifts")
def get_shifts(exam_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""SELECT id, shift_no, name, start_time, duration_mins FROM exam_shifts
                   WHERE exam_id=%s AND COALESCE(campus_id,0)=COALESCE(%s,0) ORDER BY shift_no""",
                (exam_id, campus_id))
    shifts = [{**dict(r), "start_time": str(r["start_time"])[:5]} for r in cur.fetchall()]
    cur.execute("""SELECT ec.class_id, ec.shift_id FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s AND (%s::int IS NULL OR c.campus_id=%s)""", (exam_id, campus_id, campus_id))
    class_shifts = {r["class_id"]: r["shift_id"] for r in cur.fetchall()}
    return ok(data={"mode": "multiple" if len(shifts) > 1 else "single",
                    "shifts": shifts, "class_shifts": class_shifts})


@router.put("/{exam_id}/shifts")
def save_shifts(exam_id: int, body: ShiftsIn, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    single   -> remove this campus's shifts; entries keep their own times.
    multiple -> save the shifts, each class's default shift, and move every
                entry that is in a shift onto that shift's (possibly new) time.
    """
    cur = get_cur(db)
    campus_classes = _campus_class_ids(cur, exam_id, campus_id)   # None = all
    def in_scope(class_id):
        return campus_classes is None or int(class_id) in campus_classes

    if body.mode == "single":
        cur.execute("""UPDATE exam_subjects SET shift_id=NULL WHERE shift_id IN
                       (SELECT id FROM exam_shifts WHERE exam_id=%s AND COALESCE(campus_id,0)=COALESCE(%s,0))""",
                    (exam_id, campus_id))
        cur.execute("DELETE FROM exam_shifts WHERE exam_id=%s AND COALESCE(campus_id,0)=COALESCE(%s,0)", (exam_id, campus_id))
        db.commit()
        return ok(message="Exam set to a single shift.")

    if body.mode != "multiple": fail("Mode must be single or multiple.", 400)
    shifts = sorted(body.shifts or [], key=lambda s: s.shift_no)
    if len(shifts) < 2: fail("Multiple shifts needs at least 2 shifts.", 400)
    if len({s.shift_no for s in shifts}) != len(shifts): fail("Shift numbers must be unique.", 400)
    from app.utils.datesheet_rules import span, overlaps
    for s in shifts:
        if not s.name.strip(): fail("Every shift needs a name.", 400)
        if s.duration_mins < 1: fail(f"{s.name}: duration must be at least 1 minute.", 400)
        if span(s.start_time, s.duration_mins) is None: fail(f"{s.name}: start time is invalid.", 400)
    for i in range(len(shifts)):
        for j in range(i + 1, len(shifts)):
            if overlaps(span(shifts[i].start_time, shifts[i].duration_mins), span(shifts[j].start_time, shifts[j].duration_mins)):
                fail(f"{shifts[i].name} and {shifts[j].name} overlap.", 400)

    # upsert by shift_no, drop shifts no longer listed
    keep_ids, id_by_no = [], {}
    for s in shifts:
        cur.execute("""SELECT id FROM exam_shifts WHERE exam_id=%s AND COALESCE(campus_id,0)=COALESCE(%s,0) AND shift_no=%s""",
                    (exam_id, campus_id, s.shift_no))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE exam_shifts SET name=%s, start_time=%s, duration_mins=%s, updated_at=now() WHERE id=%s",
                        (s.name.strip(), s.start_time, s.duration_mins, row["id"]))
            sid = row["id"]
        else:
            cur.execute("""INSERT INTO exam_shifts(exam_id,campus_id,shift_no,name,start_time,duration_mins)
                           VALUES(%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (exam_id, campus_id, s.shift_no, s.name.strip(), s.start_time, s.duration_mins))
            sid = cur.fetchone()["id"]
        keep_ids.append(sid); id_by_no[s.shift_no] = sid
    cur.execute("""UPDATE exam_subjects SET shift_id=NULL WHERE shift_id IN
                   (SELECT id FROM exam_shifts WHERE exam_id=%s AND COALESCE(campus_id,0)=COALESCE(%s,0) AND NOT (id = ANY(%s)))""",
                (exam_id, campus_id, keep_ids))
    cur.execute("DELETE FROM exam_shifts WHERE exam_id=%s AND COALESCE(campus_id,0)=COALESCE(%s,0) AND NOT (id = ANY(%s))",
                (exam_id, campus_id, keep_ids))

    # each class's fixed default shift
    for cls, no in (body.class_shifts or {}).items():
        if not in_scope(cls): continue
        cur.execute("UPDATE exam_classes SET shift_id=%s WHERE exam_id=%s AND class_id=%s",
                    (id_by_no.get(int(no)) if no else None, exam_id, int(cls)))

    # keep entries in a shift on that shift's current time
    cur.execute("""UPDATE exam_subjects es SET start_time=sh.start_time, duration_mins=sh.duration_mins
                   FROM exam_shifts sh WHERE es.shift_id=sh.id AND sh.id = ANY(%s)""", (keep_ids,))
    db.commit()
    return ok(message="Shifts saved.", data={"shift_ids": id_by_no})


@router.delete("/{exam_id}/subjects/{subject_id}")
def delete_exam_subject(exam_id: int, subject_id: int, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT class_id FROM exam_subjects WHERE id=%s AND exam_id=%s", (subject_id, exam_id))
    _es = cur.fetchone()
    if _es:
        _enforce_class_campus(cur, _es["class_id"], campus_id)
    cur.execute("SELECT e.status FROM exams e WHERE e.id=%s", (exam_id,))
    row = cur.fetchone()
    if row and row["status"] not in ("draft", "scheduled"):
        fail("Cannot remove subjects after datesheet is published.", 400)
    cur.execute("DELETE FROM exam_subjects WHERE id=%s AND exam_id=%s", (subject_id, exam_id))
    db.commit()
    return ok(message="Subject removed.")


# ─── Datesheet ────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/datesheet")
def get_datesheet(exam_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_detail(%s)", (exam_id,))
    row = cur.fetchone()
    if not row: fail("Exam not found", 404)
    result = fmt(dict(row), DATE_KEYS)
    cur.execute("""SELECT ec.class_id, c.name as class_name, c.section
                   FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s AND (%s::int IS NULL OR c.campus_id=%s)
                   ORDER BY c.name, c.section""", (exam_id, campus_id, campus_id))
    result["exam_classes"] = [dict(r) for r in cur.fetchall()]
    allowed = _campus_class_ids(cur, exam_id, campus_id)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    result["subjects"] = _only_campus_rows([fmt(dict(r), DATE_KEYS) for r in cur.fetchall()], allowed)
    cur.execute("SELECT datesheet_published, datesheet_published_at FROM exams WHERE id=%s", (exam_id,))
    ds = cur.fetchone()
    result["datesheet_published"] = ds["datesheet_published"] if ds else False
    result["datesheet_published_at"] = str(ds["datesheet_published_at"]) if ds and ds["datesheet_published_at"] else None
    return ok(data=result)


@router.post("/{exam_id}/datesheet/submit")
def submit_datesheet(exam_id: int, user_id: int = Depends(require_permission("exams_results.datesheet_edit")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    if not cur.fetchall(): fail("Add subjects to datesheet before submitting.", 400)
    cur.execute("SELECT * FROM sp_submit_datesheet(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            _t, _b = render_templated_notification("datesheet_awaiting_approval", {"exam_name": exam["name"]},
                "Datesheet Awaiting Approval", f"Datesheet for '{exam['name']}' has been submitted for your approval.", campus_id=campus_id)
            for row in rows:
                send_notification(row["id"], _t, _b, "info")
    except Exception as e:
        print("[datesheet notify]", e)

    return ok(message="Datesheet submitted for principal approval.")


@router.post("/{exam_id}/datesheet/approve")
def approve_datesheet(exam_id: int, user_id: int = Depends(require_permission("exams_results.result_approval")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_approve_datesheet(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            _t, _b = render_templated_notification("datesheet_approved", {"exam_name": exam["name"]},
                "Datesheet Approved", f"Datesheet for '{exam['name']}' has been approved. You can now publish it.", campus_id=campus_id)
            for row in rows:
                send_notification(row["id"], _t, _b, "success")
    except Exception as e:
        print("[datesheet notify]", e)

    return ok(message="Datesheet approved.")


@router.post("/{exam_id}/datesheet/publish")
def publish_datesheet(exam_id: int, user_id: int = Depends(require_permission("exams_results.datesheet_edit")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    if not cur.fetchall(): fail("Add subjects to the datesheet before publishing.", 400)
    cur.execute("SELECT * FROM sp_publish_datesheet(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        cur.execute("SELECT name FROM exams WHERE id=%s", (exam_id,))
        ex = cur.fetchone()
        if ex:
            auto_announce(db, str(ex["name"]) + " - Exam Schedule Published",
                "The exam datesheet is now available. Check the schedule for your class.", "/datesheet-view", "View Schedule", "exam")
            notify_all_users(db, str(ex["name"]) + " - Exam Schedule Published",
                "The exam datesheet is now available.", "/datesheet-view", "exam")
    except Exception as e:
        print("[ds_announce]", e)

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("SELECT DISTINCT t.user_id FROM exam_subjects es JOIN teachers t ON t.id=es.teacher_id WHERE es.exam_id=%s", (exam_id,))
        teacher_rows = cur.fetchall()
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        exam_name = exam["name"] if exam else ""
        cur.execute("""SELECT DISTINCT s.user_id, s.parent_id FROM students s
                      JOIN exam_classes ec ON ec.class_id=s.class_id
                      WHERE ec.exam_id=%s AND s.status='active'""", (exam_id,))
        student_rows = cur.fetchall()
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND u.is_active=TRUE")
        principal_rows = cur.fetchall()
        with _main.flask_app.app_context():
            _tags = {"exam_name": exam_name}
            _t1, _b1 = render_templated_notification("datesheet_published_teacher", _tags, "Datesheet Published", f"Datesheet for '{exam_name}' has been published.", campus_id=campus_id)
            for row in teacher_rows:
                send_notification(row["user_id"], _t1, _b1, "info")
            _t2, _b2 = render_templated_notification("datesheet_published_student", _tags, "Datesheet Published", f"Exam datesheet for '{exam_name}' is now available.", campus_id=campus_id)
            _t3, _b3 = render_templated_notification("datesheet_published_parent", {}, "Datesheet Published", "Exam datesheet for your child has been published.", campus_id=campus_id)
            for row in student_rows:
                if row["user_id"]: send_notification(row["user_id"], _t2, _b2, "info")
                if row["parent_id"]: send_notification(row["parent_id"], _t3, _b3, "info")
            _t4, _b4 = render_templated_notification("datesheet_published_principal", _tags, "Datesheet Published", f"Datesheet for '{exam_name}' has been published.", campus_id=campus_id)
            for row in principal_rows:
                send_notification(row["id"], _t4, _b4, "info")
    except Exception as e:
        print("[datesheet notify]", e)

    return ok(message="Datesheet published successfully.")


# ─── Marks Entry ──────────────────────────────────────────────────────────────

@router.post("/{exam_id}/open")
def open_marks(exam_id: int, user_id: int = Depends(require_permission("exams_results.exam_management")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_open_marks_entry(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        # The teachers who enter marks are each paper's subject teachers
        # (exam_subjects.teacher_id is the invigilator, not the marker).
        cur.execute("""SELECT DISTINCT t.user_id FROM exam_subjects es
                       JOIN teacher_subjects ts ON ts.subject_id=es.subject_id
                       JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id AND ct.class_id=es.class_id
                       JOIN teachers t ON t.id=ts.teacher_id
                       WHERE es.exam_id=%s""", (exam_id,))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            _t, _b = render_templated_notification("marks_entry_open", {}, "Marks Entry Open",
                "Marks entry has been opened for your exam. Please enter marks.", campus_id=campus_id)
            for row in rows:
                send_notification(row["user_id"], _t, _b, "info")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message="Marks entry opened.")


@router.get("/{exam_id}/marks-entry")
def get_marks_entry(
    exam_id: int,
    class_id: Optional[int] = Query(None), subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("exams_results.marks_entry")), db=Depends(get_db),
):
    if not class_id or not subject_id: fail("class_id and subject_id required", 400)
    cur = get_cur(db)
    cur.execute("""
        SELECT es.*, s.name as subject_name, c.name as class_name, c.section,
               es.total_marks, es.passing_marks
        FROM exam_subjects es
        JOIN subjects s ON s.id=es.subject_id
        JOIN classes c ON c.id=es.class_id
        WHERE es.exam_id=%s AND es.class_id=%s AND es.subject_id=%s
    """, (exam_id, class_id, subject_id))
    es = cur.fetchone()
    if not es: fail("Subject not in datesheet", 404)
    cur.execute("""
        SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
               em.marks_obtained, em.is_absent, em.remarks, em.entered_at
        FROM students s
        LEFT JOIN exam_marks em ON em.student_id=s.id
            AND em.exam_id=%s AND em.class_id=%s AND em.subject_id=%s
        WHERE s.class_id=%s AND s.status='active'
        ORDER BY s.first_name, s.last_name
    """, (exam_id, class_id, subject_id, class_id))
    students = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    result = fmt(dict(es), DATE_KEYS)
    result["students"] = students
    return ok(data=result)


@router.post("/{exam_id}/marks-entry")
def save_marks(exam_id: int, body: MarksEntryIn, user_id: int = Depends(require_permission("exams_results.marks_entry")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    if not body.class_id or not body.subject_id: fail("class_id and subject_id required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_save_exam_marks(%s,%s,%s,%s,%s)",
                (exam_id, body.class_id, body.subject_id, json.dumps(body.marks or []), user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()
    return ok(message=f"Marks saved for {len(body.marks or [])} students.")


@router.post("/{exam_id}/submit-subject-marks")
def submit_subject_marks(exam_id: int, body: SubmitMarksIn, user_id: int = Depends(require_permission("exams_results.marks_entry")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if not body.class_id or not body.subject_id: fail("class_id and subject_id required", 400)
    cur = get_cur(db)
    cur.execute("UPDATE exam_subjects SET marks_submitted=TRUE, submitted_at=%s, submitted_by=%s WHERE exam_id=%s AND class_id=%s AND subject_id=%s",
                (get_processing_datetime(db), user_id, exam_id, body.class_id, body.subject_id))
    db.commit()

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("SELECT ct.teacher_id, t.user_id FROM class_teachers ct JOIN teachers t ON t.id=ct.teacher_id WHERE ct.class_id=%s AND ct.is_primary=TRUE", (body.class_id,))
        row = cur.fetchone()
        if row:
            cur.execute("SELECT s.name FROM subjects s WHERE s.id=%s", (body.subject_id,))
            subj = cur.fetchone()
            _sname = subj["name"] if subj else "Subject"
            with _main.flask_app.app_context():
                _t, _b = render_templated_notification("marks_submitted", {"subject_name": _sname},
                    "Marks Submitted", f"{_sname} marks submitted. Please compile when all subjects are done.", campus_id=campus_id)
                send_notification(row["user_id"], _t, _b, "info")
    except Exception as e:
        print("[marks notify]", e)

    return ok(message="Marks submitted successfully.")


@router.get("/{exam_id}/class-marks-summary")
def get_class_marks_summary(exam_id: int, class_id: Optional[int] = Query(None), user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if not class_id: fail("class_id required", 400)
    cur = get_cur(db)
    _enforce_class_campus(cur, class_id, campus_id)
    cur.execute("""
        SELECT es.id, es.subject_id, s.name as subject_name,
               es.total_marks, es.passing_marks, es.exam_date,
               es.marks_submitted, es.submitted_at, es.submitted_by,
               COUNT(DISTINCT em.student_id) FILTER (WHERE em.marks_obtained IS NOT NULL OR em.is_absent=TRUE) as marks_entered,
               (SELECT COUNT(*) FROM students sq WHERE sq.class_id=%s AND sq.status='active') as total_students,
               (SELECT u.first_name||' '||u.last_name FROM teacher_subjects ts
                JOIN teachers tt ON tt.id=ts.teacher_id
                JOIN users u ON u.id=tt.user_id
                JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id AND ct.class_id=%s
                WHERE ts.subject_id=es.subject_id LIMIT 1) as subject_teacher_name,
               (SELECT u.id FROM teacher_subjects ts
                JOIN teachers tt ON tt.id=ts.teacher_id
                JOIN users u ON u.id=tt.user_id
                JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id AND ct.class_id=%s
                WHERE ts.subject_id=es.subject_id LIMIT 1) as teacher_user_id
        FROM exam_subjects es
        JOIN subjects s ON s.id=es.subject_id
        LEFT JOIN exam_marks em ON em.exam_subject_id=es.id
        WHERE es.exam_id=%s AND es.class_id=%s
        GROUP BY es.id, s.name ORDER BY es.exam_date, s.name
    """, (class_id, class_id, class_id, exam_id, class_id))
    subjects = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    all_submitted = all(s["marks_submitted"] for s in subjects) if subjects else False

    cur.execute("""
        SELECT er.compiled_at,
               (SELECT u2.first_name||' '||u2.last_name FROM class_teachers ct2
                JOIN teachers t2 ON t2.id=ct2.teacher_id JOIN users u2 ON u2.id=t2.user_id
                WHERE ct2.class_id=%s AND ct2.is_primary=TRUE LIMIT 1) as incharge_name,
               (SELECT u2.id FROM class_teachers ct2 JOIN teachers t2 ON t2.id=ct2.teacher_id
                JOIN users u2 ON u2.id=t2.user_id WHERE ct2.class_id=%s AND ct2.is_primary=TRUE LIMIT 1) as incharge_user_id_raw
        FROM exam_results er WHERE er.exam_id=%s AND er.class_id=%s LIMIT 1
    """, (class_id, class_id, exam_id, class_id))
    compiled_row = cur.fetchone()
    compiled_info = fmt(dict(compiled_row), DATE_KEYS) if compiled_row else None

    cur.execute("""SELECT u.id as user_id, u.first_name||' '||u.last_name as name
        FROM class_teachers ct JOIN teachers t ON t.id=ct.teacher_id JOIN users u ON u.id=t.user_id
        WHERE ct.class_id=%s AND ct.is_primary=TRUE LIMIT 1""", (class_id,))
    incharge_row = cur.fetchone()
    incharge = dict(incharge_row) if incharge_row else None

    return ok(data={"subjects": subjects, "all_submitted": all_submitted, "compiled": compiled_info, "incharge": incharge})


# ─── Result rules (Exam Config + grading scale) ───────────────────────────────

def _exam_rules(cur, exam_id):
    """
    The Exam Config and active grading scale that apply to this exam: the
    config stored for the exam's own academic year (defaults if none).
    """
    cur.execute("SELECT academic_year_id FROM exams WHERE id=%s", (exam_id,))
    ex = cur.fetchone() or {}
    cfg = None
    if ex.get("academic_year_id"):
        cur.execute("SELECT * FROM exam_config WHERE academic_year_id=%s", (ex["academic_year_id"],))
        cfg = cur.fetchone()
    cfg = dict(cfg) if cfg else {}
    cur.execute("SELECT grade, min_pct, gpa FROM grading_scales WHERE is_active=TRUE ORDER BY min_pct DESC")
    scale = [dict(r) for r in cur.fetchall()]
    return {
        "passing_pct": float(cfg.get("passing_pct") if cfg.get("passing_pct") is not None else 40),
        "max_fail_subjects": int(cfg.get("max_fail_subjects") if cfg.get("max_fail_subjects") is not None else 2),
        "allow_compartment": cfg.get("allow_compartment") is not False,
        "compartment_min_pct": float(cfg.get("compartment_min_pct") if cfg.get("compartment_min_pct") is not None else 33),
        "scale": scale,
    }


def _withhold_rule(cur, exam_id):
    """(enabled, months) from the Exam Config of the exam's academic year."""
    cur.execute("""SELECT ec.withhold_on_fee_due, ec.withhold_fee_months FROM exams e
                   JOIN exam_config ec ON ec.academic_year_id=e.academic_year_id WHERE e.id=%s""", (exam_id,))
    r = cur.fetchone()
    if not r or not r["withhold_on_fee_due"]:
        return False, 0
    return True, max(int(r["withhold_fee_months"] or 1), 1)


def _fee_due_months(cur, db, student_ids):
    """
    {student_id: number of months with fee still unpaid AFTER its due date}
    (unpaid / partial / overdue invoices, one count per invoice month).
    """
    if not student_ids:
        return {}
    from app.utils.processing_date import get_processing_date
    today = get_processing_date(db)
    cur.execute("""SELECT student_id, COUNT(DISTINCT COALESCE(month_year, to_char(due_date, 'YYYY-MM'))) AS months
                   FROM fee_invoices
                   WHERE student_id = ANY(%s) AND status IN ('unpaid','partial','overdue') AND due_date < %s
                   GROUP BY student_id""", (list(student_ids), today))
    return {r["student_id"]: int(r["months"]) for r in cur.fetchall()}


def _withheld_students(cur, db, exam_id, student_ids):
    """{student_id: unpaid_months} for students whose result is held back for unpaid fee."""
    enabled, months = _withhold_rule(cur, exam_id)
    if not enabled:
        return {}
    due = _fee_due_months(cur, db, student_ids)
    return {sid: n for sid, n in due.items() if n >= months}


def _withheld_message(n):
    return (f"This result is withheld because fee for {n} month{'s' if n != 1 else ''} is unpaid. "
            "It will be available as soon as the dues are cleared - please contact the school accounts office.")


def _grade_for(rules, pct):
    for g in rules["scale"]:
        if pct >= float(g["min_pct"]):
            return g["grade"], float(g.get("gpa") or 0)
    return "F", 0.0


def _verdict(rules, pct, failed_subjects):
    """
    pass        - no failed subject and overall % >= passing %
    compartment - compartment allowed, 1..max_fail_subjects failed subjects,
                  and overall % >= compartment minimum %
    fail        - everything else
    """
    if failed_subjects == 0 and pct >= rules["passing_pct"]:
        return "pass"
    if (rules["allow_compartment"] and 0 < failed_subjects <= rules["max_fail_subjects"]
            and pct >= rules["compartment_min_pct"]):
        return "compartment"
    return "fail"


def _assign_positions(results, key="pct"):
    """Ranks by percentage; equal scores share a position (1, 2, 2, 4)."""
    results.sort(key=lambda r: r[key], reverse=True)
    prev, pos = None, 0
    for i, r in enumerate(results):
        if r[key] != prev:
            pos, prev = i + 1, r[key]
        r["position"] = pos


# ─── Year-end final result (Result Formula) ────────────────────────────────────

def _cols(cur, table):
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    return {r["column_name"] for r in cur.fetchall()}


def _formula_info(cur, exam_id):
    """
    The result formula for the exam's academic year, and whether this exam is
    the year's final exam - i.e. its exam type matches the formula's exam-type
    entry with the highest order. Entries match exam types by id OR by name,
    so campuses with their own exam-type rows ("First Term" at each campus)
    are counted too.
    """
    cur.execute("""SELECT e.id, e.academic_year_id, e.exam_type_id, et.name AS type_name
                   FROM exams e LEFT JOIN exam_types et ON et.id=e.exam_type_id WHERE e.id=%s""", (exam_id,))
    ex = cur.fetchone()
    if not ex: fail("Exam not found.", 404)
    ex = dict(ex)
    cur.execute("SELECT formula, formula_mode, is_configured FROM result_formula WHERE academic_year_id=%s", (ex["academic_year_id"],))
    fr = cur.fetchone()
    entries = []
    if fr and fr["is_configured"]:
        raw = fr["formula"]
        entries = json.loads(raw) if isinstance(raw, str) else (raw or [])
    cur.execute("SELECT id, name, order_no FROM exam_types")
    types = [dict(r) for r in cur.fetchall()]
    by_id = {t["id"]: t for t in types}
    for en in entries:
        if en.get("source") == "exam_type":
            ref = by_id.get(en.get("ref_id"))
            nm = (en.get("name") or (ref or {}).get("name") or "").strip().lower()
            en["_type_ids"] = [t["id"] for t in types if t["id"] == en.get("ref_id") or (nm and t["name"].strip().lower() == nm)]
            en["_order"] = (ref or {}).get("order_no") or 0
    type_entries = [en for en in entries if en.get("source") == "exam_type"]
    final_entry = max(type_entries, key=lambda en: en["_order"]) if type_entries else None
    is_final = bool(final_entry and ex["exam_type_id"] in final_entry["_type_ids"])
    return {"exam": ex, "entries": entries, "mode": (fr["formula_mode"] if fr else None) or "percentage",
            "configured": bool(entries), "is_final": is_final}


def _component_scores(cur, kind, class_id, students, ay_range, today, admitted=None):
    """
    Assignment / quiz score % per student for the class (None = nothing graded).
    Missing work past its due date counts as 0; submitted-but-ungraded is left out.
    Returns (held, {student_id: pct|None}).
    """
    if kind == "assignment":
        cols = _cols(cur, "assignments")
        q = "SELECT id, total_marks, due_date FROM assignments WHERE class_id=%s AND COALESCE(total_marks,0) > 0"
        sub_q = "SELECT assignment_id AS item_id, student_id, marks, NULL::int AS total FROM assignment_submissions WHERE assignment_id = ANY(%s)"
    else:
        cols = _cols(cur, "quizzes")
        q = "SELECT id, total_marks, due_date FROM quizzes WHERE class_id=%s AND COALESCE(total_marks,0) > 0"
        sub_q = "SELECT quiz_id AS item_id, student_id, marks, total_marks AS total FROM quiz_submissions WHERE quiz_id = ANY(%s)"
    args = [class_id]
    if "status" in cols:
        q += " AND lower(COALESCE(status,'')) NOT IN ('draft','deleted','cancelled','archived')"
    if ay_range and ay_range[0] and ay_range[1] and "due_date" in cols:
        q += " AND (due_date IS NULL OR due_date::date BETWEEN %s AND %s)"; args += [ay_range[0], ay_range[1]]
    cur.execute(q, args)
    items = {r["id"]: dict(r) for r in cur.fetchall()}
    if not items:
        return False, {}
    cur.execute(sub_q, (list(items),))
    subs = {(r["item_id"], r["student_id"]): dict(r) for r in cur.fetchall()}
    out = {}
    admitted = admitted or {}
    for sid in students:
        got = tot = 0.0
        for iid, it in items.items():
            sub = subs.get((iid, sid))
            due0 = it.get("due_date")
            due0 = due0.date() if hasattr(due0, "date") else due0
            if not sub and admitted.get(sid) and due0 and due0 < admitted[sid]:
                continue                       # set before the student joined - not counted
            item_total = float((sub or {}).get("total") or it["total_marks"] or 0)
            if sub and sub.get("marks") is not None:
                got += float(sub["marks"]); tot += item_total
            elif not sub:
                due = it.get("due_date")
                due = due.date() if hasattr(due, "date") else due
                if due is None or due < today:
                    tot += item_total          # missed and overdue -> 0
            # submitted but not graded yet -> left out
        out[sid] = round(got / tot * 100, 2) if tot > 0 else None
    return True, out


def _compute_final_results(cur, db, exam_id, class_id):
    """
    Year-end final result for one class, by the configured Result Formula.
    percentage mode: each component's score % x its weight; components not
                     held for the class are left out and the rest rescaled to 100%.
    marks mode:      each component scaled to its max marks (weight; 100 if 0) and added.
    Verdict uses Exam Config with the failed-subject count from this final exam.
    """
    info = _formula_info(cur, exam_id)
    if not info["configured"]:
        fail("The Result Formula is not configured for this academic year (Exam Settings > Result Formula).", 400)
    ex, mode = info["exam"], info["mode"]
    ay = ex["academic_year_id"]
    rules = _exam_rules(cur, exam_id)
    cur.execute("SELECT id FROM students WHERE class_id=%s AND status='active'", (class_id,))
    students = [r["id"] for r in cur.fetchall()]
    if not students:
        fail("This class has no active students.", 400)

    from app.utils.processing_date import get_processing_date
    today = get_processing_date(db)
    # Window for assignments / quizzes: from the academic year's start to the
    # LATEST of its end date, this final exam's end date and today. (Schools
    # often run a year past its configured end date; work done then must count.)
    ay_cols = _cols(cur, "academic_years")
    ay_range = None
    if {"start_date", "end_date"} <= ay_cols:
        cur.execute("SELECT start_date, end_date FROM academic_years WHERE id=%s", (ay,))
        r = cur.fetchone()
        if r and r["start_date"]:
            cur.execute("SELECT end_date FROM exams WHERE id=%s", (exam_id,))
            ex_end = (cur.fetchone() or {}).get("end_date")
            ends = [d for d in (r["end_date"], ex_end, today) if d]
            ay_range = (r["start_date"], max(ends))
    # admission dates: work and exams from before a student joined are left out for them
    admitted = {}
    if "admission_date" in _cols(cur, "students"):
        cur.execute("SELECT id, admission_date FROM students WHERE id = ANY(%s)", (students,))
        admitted = {r["id"]: r["admission_date"] for r in cur.fetchall() if r["admission_date"]}

    comp_rows = []            # [(entry, held, {sid: pct})]
    for en in info["entries"]:
        if en.get("source") == "exam_type":
            cur.execute("""SELECT er.exam_id, er.student_id, er.percentage, COALESCE(e.end_date, e.start_date) AS held_on
                           FROM exam_results er JOIN exams e ON e.id=er.exam_id
                           WHERE e.academic_year_id=%s AND e.exam_type_id = ANY(%s) AND er.class_id=%s""",
                        (ay, en["_type_ids"] or [0], class_id))
            res = cur.fetchall()
            held_on = {r["exam_id"]: r["held_on"] for r in res}
            held = sorted(held_on)
            got = {(r["exam_id"], r["student_id"]): float(r["percentage"] or 0) for r in res}
            scores = {}
            for sid in students:
                # an exam the student has a result in always counts; one held
                # before they were admitted (and missing) is left out for them
                mine = [e for e in held if (e, sid) in got or not (admitted.get(sid) and held_on[e] and held_on[e] < admitted[sid])]
                scores[sid] = round(sum(got.get((e, sid), 0.0) for e in mine) / len(mine), 2) if mine else None
            comp_rows.append((en, bool(held), scores, "no exam held" if not held else (f"average of {len(held)} exams" if len(held) > 1 else None)))
        else:
            code = str(en.get("code") or en.get("name") or "").upper()
            kind = "assignment" if code.startswith("ASSIGN") else ("quiz" if code.startswith("QUIZ") else None)
            if not kind:
                comp_rows.append((en, False, {}, "not collected automatically"))
                continue
            held, scores = _component_scores(cur, kind, class_id, students, ay_range, today, admitted)
            comp_rows.append((en, held, scores, None if held else ("no assignments" if kind == "assignment" else "no quizzes") + " held"))

    cur.execute("SELECT student_id, subjects_failed FROM exam_results WHERE exam_id=%s AND class_id=%s", (exam_id, class_id))
    failed_map = {r["student_id"]: int(r["subjects_failed"] or 0) for r in cur.fetchall()}

    results = []
    for sid in students:
        used = [(en, sc.get(sid)) for en, held, sc, _ in comp_rows if held and sc.get(sid) is not None]
        rows = []
        if mode == "marks":
            maxes = {id(en): float(en.get("weight") or 0) or 100.0 for en, _ in used}
            total_max = sum(maxes.values())
            final_pct = round(sum(p / 100 * maxes[id(en)] for en, p in used) / total_max * 100, 2) if total_max else 0.0
        else:
            wsum = sum(float(en.get("weight") or 0) for en, _ in used)
            final_pct = round(sum(float(en.get("weight") or 0) * p for en, p in used) / wsum, 2) if wsum else 0.0
        rescaled = mode != "marks" and used and abs(sum(float(en.get("weight") or 0) for en, _ in used) - 100) > 0.5
        for en, held, sc, note in comp_rows:
            p = sc.get(sid) if held else None
            w = float(en.get("weight") or 0)
            if p is None:
                contrib = None
                note = note or ("before admission" if admitted.get(sid) else "nothing graded yet")
            elif mode == "marks":
                mx = w or 100.0; contrib = round(p / 100 * mx, 2)
            else:
                wsum = sum(float(e2.get("weight") or 0) for e2, _ in used)
                contrib = round(w * p / wsum, 2) if wsum else None
            rows.append({"name": en.get("name"), "weight": w, "pct": p, "contribution": contrib,
                         "note": note if (p is None or note) else None})
        failed = failed_map.get(sid, 0)
        verdict = _verdict(rules, final_pct, failed)
        grade, gpa = _grade_for(rules, final_pct)
        results.append({"student_id": sid, "pct": final_pct, "grade": grade, "gpa": gpa, "failed": failed,
                        "is_pass": verdict == "pass", "is_compartment": verdict == "compartment",
                        "rows": rows, "rescaled": bool(rescaled)})

    _assign_positions(results)
    now = get_processing_datetime(db)
    for r in results:
        cert = f"FC-{ay:02d}-{r['student_id']:06d}" if r["is_pass"] else None
        cur.execute("""
            INSERT INTO final_results(academic_year_id, student_id, class_id, exam_id, formula_mode, breakdown,
                                      percentage, grade, gpa, class_position, subjects_failed, is_pass, is_compartment,
                                      certificate_no, computed_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (academic_year_id, student_id) DO UPDATE SET
                class_id=EXCLUDED.class_id, exam_id=EXCLUDED.exam_id, formula_mode=EXCLUDED.formula_mode,
                breakdown=EXCLUDED.breakdown, percentage=EXCLUDED.percentage, grade=EXCLUDED.grade, gpa=EXCLUDED.gpa,
                class_position=EXCLUDED.class_position, subjects_failed=EXCLUDED.subjects_failed,
                is_pass=EXCLUDED.is_pass, is_compartment=EXCLUDED.is_compartment,
                certificate_no=COALESCE(final_results.certificate_no, EXCLUDED.certificate_no),
                computed_at=EXCLUDED.computed_at
        """, (ay, r["student_id"], class_id, exam_id, mode, json.dumps({"rows": r["rows"], "rescaled": r["rescaled"]}),
              r["pct"], r["grade"], r["gpa"], r["position"], r["failed"], r["is_pass"], r["is_compartment"], cert, now))
    passed = sum(1 for r in results if r["is_pass"])
    return {"students": len(results), "passed": passed,
            "compartment": sum(1 for r in results if r["is_compartment"]),
            "failed": len(results) - passed - sum(1 for r in results if r["is_compartment"])}


def _refresh_exam_compiled(cur, exam_id):
    """
    Exam-wide: moves the exam to 'compiled' once every class that HAS active
    students (on every campus) is compiled. Returns per-campus progress for
    classes still pending. Safe to call any time - it only moves an exam
    forward from marks_open/submitted, never back from reviewed/approved/published.
    """
    cur.execute("""
        SELECT COALESCE(cp.name, 'No campus') AS campus, c.campus_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM exam_results er
                                              WHERE er.exam_id=ec.exam_id AND er.class_id=ec.class_id)) AS compiled
        FROM exam_classes ec JOIN classes c ON c.id=ec.class_id LEFT JOIN campuses cp ON cp.id=c.campus_id
        WHERE ec.exam_id=%s
          AND EXISTS (SELECT 1 FROM students st WHERE st.class_id=ec.class_id AND st.status='active')
        GROUP BY cp.name, c.campus_id ORDER BY cp.name""", (exam_id,))
    per_campus = [dict(r) for r in cur.fetchall()]
    all_done = bool(per_campus) and all(r["compiled"] == r["total"] for r in per_campus)
    promoted = False
    if all_done:
        cur.execute("UPDATE exams SET status='compiled' WHERE id=%s AND status IN ('marks_open','submitted') RETURNING id", (exam_id,))
        promoted = cur.fetchone() is not None
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    row = cur.fetchone()
    return {"status": row["status"] if row else None, "promoted": promoted,
            "pending": [r for r in per_campus if r["compiled"] < r["total"]]}


# ─── Compile & Approve & Publish ─────────────────────────────────────────────

@router.post("/{exam_id}/compile-results")
def compile_results(exam_id: int, body: CompileIn, user_id: int = Depends(require_permission("exams_results.result_compilation")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if not body.class_id: fail("class_id required", 400)
    class_id = body.class_id
    cur = get_cur(db)
    _enforce_class_campus(cur, class_id, campus_id)

    rules = _exam_rules(cur, exam_id)

    cur.execute("SELECT id FROM students WHERE class_id=%s AND status='active'", (class_id,))
    students = [r["id"] for r in cur.fetchall()]
    if not students:
        fail("This class has no active students, so there is nothing to compile.", 400)

    # every paper of this class, with its own total and passing marks
    cur.execute("""SELECT id, subject_id, total_marks, passing_marks FROM exam_subjects
                   WHERE exam_id=%s AND class_id=%s""", (exam_id, class_id))
    papers = [dict(r) for r in cur.fetchall()]
    if not papers:
        fail("This class has no papers in this exam.", 400)
    total_possible = sum(float(p["total_marks"] or 0) for p in papers)

    cur.execute("""SELECT em.student_id, em.exam_subject_id, em.marks_obtained, em.is_absent
                   FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id
                   WHERE em.exam_id=%s AND es.class_id=%s AND em.student_id = ANY(%s)""",
                (exam_id, class_id, students))
    marks = {(r["student_id"], r["exam_subject_id"]): r for r in cur.fetchall()}

    results = []
    for sid in students:
        obtained, failed = 0.0, 0
        for p in papers:
            m = marks.get((sid, p["id"]))
            got = 0.0 if (not m or m["is_absent"] or m["marks_obtained"] is None) else float(m["marks_obtained"])
            obtained += got
            if got < float(p["passing_marks"] or 0) or (m is not None and m["is_absent"]) or m is None:
                failed += 1
        pct = round(obtained / total_possible * 100, 2) if total_possible > 0 else 0.0
        verdict = _verdict(rules, pct, failed)
        grade, gpa = _grade_for(rules, pct)
        results.append({"student_id": sid, "obtained": obtained, "pct": pct, "grade": grade, "gpa": gpa,
                        "failed": failed, "is_pass": verdict == "pass", "is_compartment": verdict == "compartment"})

    _assign_positions(results)
    _compiled_at = get_processing_datetime(db)
    for r in results:
        cur.execute("""
            INSERT INTO exam_results(exam_id,student_id,class_id,total_marks,marks_obtained,percentage,grade,gpa,
                                     class_position,subjects_failed,is_pass,is_compartment,compiled_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT(exam_id,student_id) DO UPDATE SET
                class_id=EXCLUDED.class_id, total_marks=EXCLUDED.total_marks, marks_obtained=EXCLUDED.marks_obtained,
                percentage=EXCLUDED.percentage, grade=EXCLUDED.grade, gpa=EXCLUDED.gpa,
                class_position=EXCLUDED.class_position, subjects_failed=EXCLUDED.subjects_failed,
                is_pass=EXCLUDED.is_pass, is_compartment=EXCLUDED.is_compartment, compiled_at=EXCLUDED.compiled_at
        """, (exam_id, r["student_id"], class_id, total_possible, r["obtained"], r["pct"], r["grade"], r["gpa"],
              r["position"], r["failed"], r["is_pass"], r["is_compartment"], _compiled_at))

    # the exam is "compiled" once every class that HAS students is compiled, on every campus
    _refresh_exam_compiled(cur, exam_id)
    passed = sum(1 for r in results if r["is_pass"]); comp = sum(1 for r in results if r["is_compartment"])
    msg = f"Results compiled for {len(students)} students: {passed} passed, {comp} compartment, {len(students)-passed-comp} failed."
    finfo = _formula_info(cur, exam_id)
    if finfo["is_final"] and finfo["configured"]:
        fs = _compute_final_results(cur, db, exam_id, class_id)
        msg += f" Final (year) result: {fs['passed']} passed, {fs['compartment']} compartment, {fs['failed']} failed."
    db.commit()
    return ok(message=msg)


@router.get("/{exam_id}/compilation-status")
def get_compilation_status(exam_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""
        SELECT ec.class_id, c.name as class_name, c.section,
               EXISTS(SELECT 1 FROM exam_results er WHERE er.exam_id=%s AND er.class_id=ec.class_id) as is_compiled,
               COUNT(DISTINCT es.id) FILTER (WHERE es.marks_submitted=TRUE) as subjects_submitted,
               COUNT(DISTINCT es.id) as subjects_total,
               (SELECT u.first_name||' '||u.last_name FROM class_teachers ct
                JOIN teachers t ON t.id=ct.teacher_id JOIN users u ON u.id=t.user_id
                WHERE ct.class_id=ec.class_id AND ct.is_primary=TRUE LIMIT 1) as incharge_name,
               (SELECT COUNT(*) FROM students st WHERE st.class_id=ec.class_id AND st.status='active') as student_count
        FROM exam_classes ec
        JOIN classes c ON c.id=ec.class_id
        LEFT JOIN exam_subjects es ON es.exam_id=%s AND es.class_id=ec.class_id
        WHERE ec.exam_id=%s AND (%s::int IS NULL OR c.campus_id=%s)
        GROUP BY ec.class_id, c.name, c.section ORDER BY c.name, c.section
    """, (exam_id, exam_id, exam_id, campus_id, campus_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["not_required"] = int(r.get("student_count") or 0) == 0   # no students: nothing to enter or compile
    required = [r for r in rows if not r["not_required"]]
    total = len(required)
    compiled = sum(1 for r in required if r["is_compiled"])
    exam_state = _refresh_exam_compiled(cur, exam_id)
    if exam_state["promoted"]:
        db.commit()
    other = [{"campus": p["campus"], "compiled": p["compiled"], "total": p["total"]}
             for p in exam_state["pending"] if campus_id is None or p["campus_id"] != campus_id]
    return ok(data={"classes": rows, "total": total, "compiled": compiled,
                    "not_required": len(rows) - total,
                    "all_compiled": total > 0 and compiled == total,
                    "exam_status": exam_state["status"],
                    "other_campuses_pending": other})


@router.post("/{exam_id}/approve")
def approve_results(exam_id: int, user_id: int = Depends(require_permission("exams_results.result_approval")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    st = (cur.fetchone() or {}).get("status")
    if st != "reviewed":
        fail("Results can be approved only after they are sent for approval.", 400)
    cur.execute("SELECT * FROM sp_approve_exam_results(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            _t, _b = render_templated_notification("results_approved", {}, "Results Approved",
                "Principal has approved exam results. You can now publish.", campus_id=campus_id)
            for row in rows:
                send_notification(row["id"], _t, _b, "success")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message="Results approved.")


@router.post("/{exam_id}/publish")
def publish_results(exam_id: int, user_id: int = Depends(require_permission("exams_results.result_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    st = (cur.fetchone() or {}).get("status")
    if st != "approved":
        fail("Results can be published only after the principal approves them.", 400)
    cur.execute("SELECT * FROM sp_publish_exam_results(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        cur.execute("SELECT name FROM exams WHERE id=%s", (exam_id,))
        ex = cur.fetchone()
        if ex:
            auto_announce(db, str(ex["name"]) + " - Results Published",
                "Exam results are now available. Check your result.", "/exam-results", "View Results", "result")
            notify_all_users(db, str(ex["name"]) + " - Results Published",
                "Exam results are now available. Check your result.", "/exam-results", "result")
    except Exception as e:
        print("[res_announce]", e)

    try:
        from app.utils.notify import send_notification, render_templated_notification
        import main as _main
        cur.execute("""SELECT DISTINCT s.id AS student_id, s.user_id, s.parent_id FROM students s
                      JOIN exam_classes ec ON ec.class_id=s.class_id
                      WHERE ec.exam_id=%s AND s.status='active'""", (exam_id,))
        rows = cur.fetchall()
        _held = _withheld_students(cur, db, exam_id, [r["student_id"] for r in rows])
        with _main.flask_app.app_context():
            _t1, _b1 = render_templated_notification("results_published_student", {}, "Results Published", "Your exam results are now available.", campus_id=campus_id)
            _t2, _b2 = render_templated_notification("results_published_parent", {}, "Results Published", "Your child's exam results are now available.", campus_id=campus_id)
            for row in rows:
                if row["student_id"] in _held:
                    _m = _withheld_message(_held[row["student_id"]])
                    if row["user_id"]: send_notification(row["user_id"], "Result Withheld", _m, "warning", "/my-fees")
                    if row["parent_id"]: send_notification(row["parent_id"], "Result Withheld", _m, "warning", f"/my-fees?studentId={row['student_id']}")
                    continue
                if row["user_id"]: send_notification(row["user_id"], _t1, _b1, "success")
                if row["parent_id"]: send_notification(row["parent_id"], _t2, _b2, "success")
    except Exception as e:
        print("[exam notify]", e)

    try:
        cur.execute("""SELECT s.id FROM students s JOIN exam_classes ec ON ec.class_id=s.class_id
                       WHERE ec.exam_id=%s AND s.status='active'""", (exam_id,))
        _n_held = len(_withheld_students(cur, db, exam_id, [r["id"] for r in cur.fetchall()]))
    except Exception:
        _n_held = 0
    return ok(message="Results published." + (f" {_n_held} student(s) withheld for unpaid fee - their results open automatically once dues are cleared." if _n_held else ""))


# ─── Results ──────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/results")
def get_results(
    exam_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
    campus_id: Optional[int] = Depends(get_current_campus_id),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    cur = get_cur(db)
    if role in ("student", "parent"):
        cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
        e = cur.fetchone()
        if not e or e["status"] != "published": fail("Results not published yet", 403)
    cur.execute("SELECT * FROM sp_get_exam_results(%s)", (exam_id,))
    rows = [dict(r) for r in cur.fetchall()]
    if role in ("student", "parent") and rows:
        _held = _withheld_students(cur, db, exam_id, [r["student_id"] for r in rows])
        rows = [r for r in rows if r.get("student_id") not in _held]
    if role not in ("student", "parent") and campus_id is not None:
        allowed = _campus_class_ids(cur, exam_id, campus_id)
        if rows and "class_id" in rows[0]:
            rows = [r for r in rows if r.get("class_id") in allowed]
        else:
            cur.execute("SELECT id FROM students WHERE class_id = ANY(%s)", (list(allowed) or [0],))
            ids = {r["id"] for r in cur.fetchall()}
            rows = [r for r in rows if r.get("student_id") in ids]
    if role == "student":
        cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
        stu = cur.fetchone()
        if stu: rows = [r for r in rows if r["student_id"] == stu["id"]]
    elif role == "parent":
        cur.execute("SELECT id FROM students WHERE parent_id=%s", (user_id,))
        ids = {r["id"] for r in cur.fetchall()}
        rows = [r for r in rows if r["student_id"] in ids]
    return ok(data=rows)


@router.get("/{exam_id}/class-results/{class_id}")
def get_class_results(exam_id: int, class_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _enforce_class_campus(cur, class_id, campus_id)
    cur.execute("""
        SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
               er.total_marks, er.marks_obtained, er.percentage, er.grade, er.gpa, er.class_position, er.is_pass,
               er.is_compartment, er.subjects_failed
        FROM students s JOIN exam_results er ON er.student_id=s.id AND er.exam_id=%s
        WHERE s.class_id=%s AND s.status='active' ORDER BY er.class_position
    """, (exam_id, class_id))
    students = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT em.student_id, sub.name as subject_name, es.total_marks, es.passing_marks, em.marks_obtained, em.is_absent
        FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id
        JOIN subjects sub ON sub.id=es.subject_id
        WHERE em.exam_id=%s AND es.class_id=%s ORDER BY sub.name
    """, (exam_id, class_id))
    marks_rows = cur.fetchall()

    subj_marks = defaultdict(dict)
    subjects_set, seen = [], set()
    for r in marks_rows:
        subj_marks[r["student_id"]][r["subject_name"]] = {
            "marks": float(r["marks_obtained"]) if r["marks_obtained"] else 0,
            "total": float(r["total_marks"]), "absent": r["is_absent"]
        }
        if r["subject_name"] not in seen:
            subjects_set.append({"name": r["subject_name"], "total": float(r["total_marks"]),
                                 "passing": float(r["passing_marks"]) if r["passing_marks"] is not None else None})
            seen.add(r["subject_name"])

    for s in students:
        s["subject_marks"] = subj_marks.get(s["id"], {})
        for k in ["total_marks", "marks_obtained", "percentage", "gpa"]:
            if s.get(k): s[k] = float(s[k])

    _held = _withheld_students(cur, db, exam_id, [s["id"] for s in students])
    _enabled, _months = _withhold_rule(cur, exam_id)
    for s in students:
        s["fee_withheld"] = s["id"] in _held
        s["fee_due_months"] = _held.get(s["id"], 0)
    return ok(data={"students": students, "subjects": subjects_set,
                    "withhold_rule": {"enabled": _enabled, "months": _months}})


@router.get("/{exam_id}/student-results/{student_id}")
def get_student_results(exam_id: int, student_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), claims: dict = Depends(get_jwt_claims), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    cur = get_cur(db)
    _student_access(cur, claims, user_id, exam_id, student_id, db, check_withhold=False)
    _role = (claims or {}).get("roles", [""])[0] if (claims or {}).get("roles") else ""
    if _role in ("student", "parent"):
        _held = _withheld_students(cur, db, exam_id, [student_id])
        if _held:
            return ok(data={"withheld": True, "fee_due_months": _held[student_id],
                            "message": _withheld_message(_held[student_id])})
    cur.execute("""
        SELECT er.*, s.first_name, s.last_name, s.enrollment_no, c.name as class_name, c.section
        FROM exam_results er JOIN students s ON s.id=er.student_id
        JOIN classes c ON c.id=er.class_id
        WHERE er.exam_id=%s AND er.student_id=%s
    """, (exam_id, student_id))
    row = cur.fetchone()
    if not row: fail("Results not found", 404)
    result = fmt(dict(row), DATE_KEYS)
    for k in ["total_marks", "marks_obtained", "percentage", "gpa"]:
        if result.get(k): result[k] = float(result[k])
    cur.execute("""
        SELECT sub.name as subject_name, es.total_marks, em.marks_obtained, em.is_absent
        FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id
        JOIN subjects sub ON sub.id=es.subject_id
        WHERE em.exam_id=%s AND em.student_id=%s ORDER BY sub.name
    """, (exam_id, student_id))
    subjects = []
    for r in cur.fetchall():
        s = dict(r)
        if s.get("total_marks"): s["total_marks"] = float(s["total_marks"])
        if s.get("marks_obtained"): s["marks_obtained"] = float(s["marks_obtained"])
        subjects.append(s)
    result["subjects"] = subjects
    # year-end final result (only on the year's final exam) + certificate availability
    result["final"] = None
    info = _formula_info(cur, exam_id)
    if info["is_final"]:
        cur.execute("SELECT percentage, grade, class_position, is_pass, is_compartment FROM final_results WHERE academic_year_id=%s AND student_id=%s",
                    (info["exam"]["academic_year_id"], student_id))
        fr = cur.fetchone()
        if fr:
            result["final"] = {"percentage": float(fr["percentage"]), "grade": fr["grade"], "class_position": fr["class_position"],
                               "is_pass": fr["is_pass"], "is_compartment": fr["is_compartment"],
                               "certificate_available": bool(fr["is_pass"])}
    return ok(data=result)


def _student_access(cur, claims, user_id, exam_id, student_id, db=None, check_withhold=True):
    """Students may open only their own documents, parents only their children's,
    and only once the exam's results are published. Staff: unrestricted here
    (campus is enforced by verify_exam_campus)."""
    roles = claims.get("roles", []) if claims else []
    role = roles[0] if roles else ""
    if role not in ("student", "parent"):
        return
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    e = cur.fetchone()
    if not e or e["status"] != "published":
        fail("Results are not published yet.", 403)
    col = "user_id" if role == "student" else "parent_id"
    cur.execute(f"SELECT 1 FROM students WHERE id=%s AND {col}=%s", (student_id, user_id))
    if not cur.fetchone():
        fail("Results not found", 404)
    if check_withhold and db is not None:
        held = _withheld_students(cur, db, exam_id, [student_id])
        if held:
            fail(_withheld_message(held[student_id]), 403)


def _school_info(cur, campus_id=None):
    """School name, logo, address, phone as configured by the superadmin (campus overrides applied)."""
    from app.utils.school_info import get_school_info
    i = get_school_info(cur, campus_id)
    return {"name": i["name"], "address": i["address"], "phone": i["phone"], "logo_bytes": i["logo_bytes"]}


def _pdf_response(pdf_bytes, filename):
    import io
    from fastapi.responses import StreamingResponse
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _issued_on(db):
    from app.utils.processing_date import get_processing_date
    return get_processing_date(db).strftime("%d %b %Y")


@router.post("/{exam_id}/final-results/compute")
def compute_final_results(exam_id: int, body: CompileIn, user_id: int = Depends(require_permission("exams_results.result_compilation")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Recalculates the year-end final result for one class (also runs automatically when the final exam is compiled)."""
    cur = get_cur(db)
    _enforce_class_campus(cur, body.class_id, campus_id)
    if not _formula_info(cur, exam_id)["is_final"]:
        fail("The final (year) result is calculated from the year's last exam in the Result Formula, not this one.", 400)
    s = _compute_final_results(cur, db, exam_id, body.class_id)
    db.commit()
    return ok(message=f"Final result calculated for {s['students']} students: {s['passed']} passed, {s['compartment']} compartment, {s['failed']} failed.", data=s)


@router.get("/{exam_id}/final-results/{class_id}")
def get_final_results(exam_id: int, class_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _enforce_class_campus(cur, class_id, campus_id)
    info = _formula_info(cur, exam_id)
    cur.execute("""SELECT fr.*, s.first_name, s.last_name, s.enrollment_no FROM final_results fr
                   JOIN students s ON s.id=fr.student_id
                   WHERE fr.academic_year_id=%s AND fr.class_id=%s AND s.status='active'
                   ORDER BY fr.class_position, s.first_name""", (info["exam"]["academic_year_id"], class_id))
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        for k in ("percentage", "gpa"):
            if d.get(k) is not None: d[k] = float(d[k])
        if d.get("computed_at"): d["computed_at"] = str(d["computed_at"])
        rows.append(d)
    return ok(data={"is_final": info["is_final"], "configured": info["configured"], "mode": info["mode"], "results": rows})


@router.get("/{exam_id}/result-card/{student_id}")
def get_result_card_pdf(exam_id: int, student_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), claims: dict = Depends(get_jwt_claims), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    from app.utils.result_pdfs import build_result_card
    cur = get_cur(db)
    _student_access(cur, claims, user_id, exam_id, student_id, db)
    cur.execute("""SELECT er.*, s.first_name, s.last_name, s.enrollment_no, s.father_name, s.gender, s.campus_id AS student_campus_id, c.name AS class_name, c.section
                   FROM exam_results er JOIN students s ON s.id=er.student_id JOIN classes c ON c.id=er.class_id
                   WHERE er.exam_id=%s AND er.student_id=%s""", (exam_id, student_id))
    row = cur.fetchone()
    if not row: fail("Results not found", 404)
    r = dict(row)
    cur.execute("""SELECT e.name, ay.name AS academic_year, e.academic_year_id FROM exams e
                   LEFT JOIN academic_years ay ON ay.id = e.academic_year_id WHERE e.id=%s""", (exam_id,))
    ex = dict(cur.fetchone() or {})
    rules = _exam_rules(cur, exam_id)
    cur.execute("""SELECT sub.name, es.total_marks, es.passing_marks, em.marks_obtained, em.is_absent
                   FROM exam_subjects es JOIN subjects sub ON sub.id=es.subject_id
                   LEFT JOIN exam_marks em ON em.exam_subject_id=es.id AND em.student_id=%s
                   WHERE es.exam_id=%s AND es.class_id=%s ORDER BY sub.name""", (student_id, exam_id, r["class_id"]))
    subjects = []
    for s in cur.fetchall():
        obt = None if s["marks_obtained"] is None else float(s["marks_obtained"])
        tot = float(s["total_marks"] or 0)
        pct = (obt / tot * 100) if (obt is not None and tot and not s["is_absent"]) else 0
        subjects.append({"name": s["name"], "total": tot, "passing": float(s["passing_marks"] or 0),
                         "obtained": obt, "absent": bool(s["is_absent"]), "grade": _grade_for(rules, pct)[0]})
    cur.execute("SELECT COUNT(*) AS n FROM exam_results WHERE exam_id=%s AND class_id=%s", (exam_id, r["class_id"]))
    class_size = cur.fetchone()["n"]
    cur.execute("SELECT description FROM grading_scales WHERE is_active AND grade=%s LIMIT 1", (r["grade"],))
    gd = cur.fetchone()
    cur.execute("SELECT grading_mode FROM exam_config WHERE academic_year_id=%s", (ex.get("academic_year_id"),))
    gm = cur.fetchone()
    verdict = "pass" if r["is_pass"] else ("compartment" if r.get("is_compartment") else "fail")

    final = None
    info = _formula_info(cur, exam_id)
    if info["is_final"]:
        cur.execute("SELECT * FROM final_results WHERE academic_year_id=%s AND student_id=%s", (ex.get("academic_year_id"), student_id))
        fr = cur.fetchone()
        if fr:
            bd = fr["breakdown"] if isinstance(fr["breakdown"], dict) else json.loads(fr["breakdown"] or "{}")
            final = {"mode": fr["formula_mode"], "pct": float(fr["percentage"]), "grade": fr["grade"],
                     "gpa": float(fr["gpa"]) if fr["gpa"] is not None else None, "position": fr["class_position"],
                     "verdict": "pass" if fr["is_pass"] else ("compartment" if fr["is_compartment"] else "fail"),
                     "rows": bd.get("rows", [])}
    name = f"{r['first_name']} {r['last_name']}"
    pdf = build_result_card({
        "school": _school_info(cur, r.get("student_campus_id")),
        "exam": {"name": ex.get("name") or "Exam", "academic_year": ex.get("academic_year") or ""},
        "student": {"name": name, "father_name": r.get("father_name"), "gender": r.get("gender"),
                    "enrollment_no": r.get("enrollment_no"),
                    "class_label": r["class_name"] + (f" ({r['section']})" if r.get("section") else "")},
        "subjects": subjects,
        "summary": {"total": float(r["total_marks"] or 0), "obtained": float(r["marks_obtained"] or 0),
                    "pct": float(r["percentage"] or 0), "grade": r["grade"], "gpa": float(r["gpa"]) if r["gpa"] is not None else None,
                    "position": r["class_position"], "class_size": class_size, "verdict": verdict,
                    "subjects_failed": r.get("subjects_failed") or 0, "remark": (gd["description"] if gd else "")},
        "grading_mode": (gm["grading_mode"] if gm else None) or "score",
        "final": final,
        "issued_on": _issued_on(db),
    })
    return _pdf_response(pdf, f"ResultCard_{(ex.get('name') or 'Exam').replace(' ', '_')}_{r.get('enrollment_no') or student_id}.pdf")


@router.get("/{exam_id}/certificate/{student_id}")
def get_certificate_pdf(exam_id: int, student_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), claims: dict = Depends(get_jwt_claims), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    """Final Certificate of Passing - only for a student who PASSED the year-end final result."""
    from app.utils.result_pdfs import build_certificate
    cur = get_cur(db)
    _student_access(cur, claims, user_id, exam_id, student_id, db)
    info = _formula_info(cur, exam_id)
    ay_id = info["exam"]["academic_year_id"]
    cur.execute("""SELECT fr.*, s.first_name, s.last_name, s.enrollment_no, s.father_name, s.gender, s.campus_id AS student_campus_id,
                          c.name AS class_name, c.section, ay.name AS academic_year
                   FROM final_results fr JOIN students s ON s.id=fr.student_id
                   LEFT JOIN classes c ON c.id=fr.class_id LEFT JOIN academic_years ay ON ay.id=fr.academic_year_id
                   WHERE fr.academic_year_id=%s AND fr.student_id=%s""", (ay_id, student_id))
    fr = cur.fetchone()
    if not fr: fail("The final result has not been calculated for this student yet.", 404)
    if not fr["is_pass"]: fail("A passing certificate is issued only to students who passed the final result.", 400)
    pdf = build_certificate({
        "school": _school_info(cur, fr.get("student_campus_id")),
        "student": {"name": f"{fr['first_name']} {fr['last_name']}", "father_name": fr.get("father_name"),
                    "gender": fr.get("gender"), "enrollment_no": fr.get("enrollment_no"),
                    "class_label": (fr["class_name"] or "") + (f" ({fr['section']})" if fr.get("section") else "")},
        "academic_year": fr.get("academic_year") or "", "pct": float(fr["percentage"]), "grade": fr["grade"],
        "position": fr["class_position"], "certificate_no": fr["certificate_no"], "issued_on": _issued_on(db),
    })
    return _pdf_response(pdf, f"Certificate_{fr.get('enrollment_no') or student_id}.pdf")


@router.post("/{exam_id}/send-reminder")
def send_reminder(exam_id: int, body: ReminderIn, user_id: int = Depends(require_permission("exams_results.marks_reminders")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    if not body.user_id: fail("user_id required", 400)
    try:
        from app.utils.notify import send_notification
        import main as _main
        with _main.flask_app.app_context():
            send_notification(body.user_id, body.title, body.message, "warning")
    except Exception as e:
        print("[reminder]", e)
    return ok(message="Reminder sent.")


# ─── Legacy marks endpoints (kept for compatibility) ─────────────────────────

@router.get("/{exam_id}/subjects/{subject_id}/marks")
def get_marks(exam_id: int, subject_id: int, user_id: int = Depends(require_any_permission("exams_results.datesheet_edit", "exams_results.exam_management", "exams_results.exam_setup_edit", "exams_results.exam_setup_view", "exams_results.exam_view", "exams_results.marks_change_after_submission", "exams_results.marks_entry", "exams_results.marks_reminders", "exams_results.promotion_approval", "exams_results.promotion_preparation", "exams_results.promotion_view", "exams_results.result_approval", "exams_results.result_cards_certificates", "exams_results.result_compilation", "exams_results.result_publishing", "exams_results.result_view", "exams_results.results_before_publishing")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: fail("Exam subject not found", 404)
    cur.execute("SELECT * FROM sp_get_exam_marks(%s)", (es["id"],))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/{exam_id}/subjects/{subject_id}/marks")
def enter_marks(exam_id: int, subject_id: int, body: dict, user_id: int = Depends(require_permission("exams_results.marks_entry")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus)):
    marks = body.get("marks", []) if isinstance(body, dict) else []
    cur = get_cur(db)
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: fail("Exam subject not found", 404)
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: fail("Teacher not found", 404)
    cur.execute("SELECT * FROM sp_enter_marks(%s,%s,%s)", (es["id"], json.dumps(marks), t["id"]))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Marks saved.")


@router.post("/{exam_id}/subjects/{subject_id}/submit")
def submit_marks(exam_id: int, subject_id: int, user_id: int = Depends(require_permission("exams_results.marks_entry")), db=Depends(get_db), _exam_check: None = Depends(verify_exam_campus), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: fail("Exam subject not found", 404)
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: fail("Teacher not found", 404)
    cur.execute("SELECT * FROM sp_submit_subject_marks(%s,%s)", (es["id"], t["id"]))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    all_submitted = result and result.get("all_submitted")
    db.commit()

    if all_submitted:
        try:
            from app.utils.notify import send_notification
            import main as _main
            from app.utils.notify import render_templated_notification
            cur.execute("""SELECT ct.teacher_id, tt.user_id FROM exams e
                          JOIN exam_classes ec ON ec.exam_id=e.id
                          JOIN class_teachers ct ON ct.class_id=ec.class_id AND ct.is_primary=TRUE
                          JOIN teachers tt ON tt.id=ct.teacher_id WHERE e.id=%s""", (exam_id,))
            incharge = cur.fetchone()
            if incharge:
                with _main.flask_app.app_context():
                    _t, _b = render_templated_notification("all_marks_submitted", {}, "All Marks Submitted",
                        "All subject teachers have submitted marks. Please compile results.", campus_id=campus_id)
                    send_notification(incharge["user_id"], _t, _b, "info")
        except Exception as e:
            print("[exam notify]", e)

    return ok(message="Marks submitted.")
