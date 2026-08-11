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
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


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
def get_components(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM result_components ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/components")
def create_component(body: ComponentIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute("INSERT INTO result_components(name,code,collection_method,description,created_by) VALUES(%s,%s,%s,%s,%s) RETURNING id",
                    (body.name, (body.code or "").upper(), body.collection_method or "per_subject", body.description or "", user_id))
        db.commit()
        return ok(data={"id": cur.fetchone()["id"]}, message="Component created.")
    except Exception as e:
        db.rollback(); fail("Code already exists or invalid data: " + str(e), 400)


@router.put("/components/{comp_id}")
def update_component(comp_id: int, body: ComponentIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE result_components SET name=%s,collection_method=%s,description=%s,is_active=%s WHERE id=%s",
                (body.name, body.collection_method or "per_subject", body.description or "", body.is_active if body.is_active is not None else True, comp_id))
    db.commit()
    return ok(message="Updated.")


# ─── Formula ─────────────────────────────────────────────────────────────────

@router.get("/formula")
def get_formula(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: fail("No active academic year", 404)
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
def update_formula(body: FormulaIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    formula = body.formula or []
    total = sum(float(c.get("weight", 0)) for c in formula)
    formula_mode = body.formula_mode or "percentage"
    is_configured = abs(total - 100) < 0.5 if formula_mode == "percentage" else len(formula) > 0
    cur = get_cur(db)
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: fail("No active academic year", 404)
    cur.execute("UPDATE result_formula SET formula=%s,total_weight=%s,is_configured=%s,formula_mode=%s,updated_by=%s,updated_at=NOW() WHERE academic_year_id=%s",
                (json.dumps(formula), total, is_configured, formula_mode, user_id, ay["id"]))
    db.commit()
    return ok(message="Formula saved.")


# ─── Exam Types ───────────────────────────────────────────────────────────────

@router.get("/types")
def get_exam_types(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM exam_types ORDER BY order_no")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/types")
def create_exam_type(body: ExamTypeIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("INSERT INTO exam_types(name,code,weight,order_no) VALUES(%s,%s,%s,%s) RETURNING id",
                (body.name, body.code, body.weight or 0, body.order_no or 1))
    db.commit()
    return ok(data={"id": cur.fetchone()["id"]}, message="Exam type created.")


@router.put("/types/{type_id}")
def update_exam_type(type_id: int, body: ExamTypeIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    cur = get_cur(db)
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
def get_grading(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM grading_scales WHERE is_active=TRUE ORDER BY order_no")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/grading")
def update_grading(body: GradingIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM grading_scales")
    for i, g in enumerate(body.grades):
        cur.execute("INSERT INTO grading_scales(grade,min_pct,max_pct,gpa,description,order_no) VALUES(%s,%s,%s,%s,%s,%s)",
                    (g.get("grade"), g.get("min_pct"), g.get("max_pct"), g.get("gpa", 0), g.get("description", ""), i + 1))
    db.commit()
    return ok(message="Grading scale updated.")


# ─── Exam Config ──────────────────────────────────────────────────────────────

@router.get("/exam-config")
def get_exam_config(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: fail("No active academic year", 404)
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
def update_exam_config(body: ExamConfigIn, user_id: int = Depends(require_permission("exam.config")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: fail("No active academic year", 404)
    cur.execute("""UPDATE exam_config SET passing_pct=%s,max_fail_subjects=%s,allow_compartment=%s,
        compartment_min_pct=%s,position_formula=%s,grading_mode=%s,updated_at=NOW(),updated_by=%s
        WHERE academic_year_id=%s""",
        (body.passing_pct or 40, body.max_fail_subjects or 2,
         body.allow_compartment if body.allow_compartment is not None else True,
         body.compartment_min_pct or 33,
         json.dumps(body.position_formula or []), body.grading_mode or "score",
         user_id, ay["id"]))
    db.commit()
    return ok(message="Exam config updated.")


# ─── Exams CRUD ───────────────────────────────────────────────────────────────

@router.get("/")
def list_exams(
    class_id: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("exam.view")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
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

    cur.execute("SELECT * FROM sp_get_exams(%s, NULL)", (effective_class_id,))
    rows = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.get("/{exam_id}")
def get_exam(exam_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_detail(%s)", (exam_id,))
    row = cur.fetchone()
    if not row: fail("Exam not found", 404)
    result = fmt(dict(row), DATE_KEYS)
    cur.execute("""SELECT ec.class_id, c.name as class_name, c.section
                   FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s ORDER BY c.name, c.section""", (exam_id,))
    result["exam_classes"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    subjects = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    result["subjects"] = subjects
    return ok(data=result)


@router.post("/")
def create_exam(body: ExamCreateIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: fail("No active academic year", 404)

    class_ids = body.class_ids or []
    if body.all_classes:
        cur.execute("SELECT id FROM classes ORDER BY name, section")
        class_ids = [r["id"] for r in cur.fetchall()]
    if not class_ids: fail("Select at least one class.", 400)

    cur.execute("""INSERT INTO exams(academic_year_id,exam_type_id,name,start_date,end_date,created_by,status)
                   VALUES(%s,%s,%s,%s,%s,%s,'draft') RETURNING id""",
                (ay["id"], body.exam_type_id, body.name, body.start_date or None, body.end_date or None, user_id))
    exam_id = cur.fetchone()["id"]

    for cid in class_ids:
        cur.execute("INSERT INTO exam_classes(exam_id,class_id) VALUES(%s,%s) ON CONFLICT DO NOTHING", (exam_id, cid))
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["id"], "New Exam Created",
                    f"Exam '{body.name}' created for {len(class_ids)} class(es). Build the datesheet.", "info")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message=f"Exam created for {len(class_ids)} class(es).", data={"id": exam_id})


@router.put("/{exam_id}")
def update_exam(exam_id: int, body: ExamUpdateIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE exams SET name=%s,start_date=%s,end_date=%s WHERE id=%s",
                (body.name, body.start_date or None, body.end_date or None, exam_id))
    db.commit()
    return ok(message="Exam updated.")


@router.delete("/{exam_id}")
def delete_exam(exam_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
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
def update_status(exam_id: int, body: StatusUpdateIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE exams SET status=%s WHERE id=%s", (body.status, exam_id))
    db.commit()
    return ok(message="Status updated.")


# ─── Subjects ─────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/subjects")
def get_exam_subjects_list(exam_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    rows = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.get("/{exam_id}/available-subjects")
def get_available_subjects(exam_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT DISTINCT s.id, s.name, s.code,
               STRING_AGG(DISTINCT c.name||(CASE WHEN c.section IS NOT NULL AND c.section!='' THEN ' ('||c.section||')' ELSE '' END), ', ') as class_names
        FROM exam_classes ec
        JOIN class_subjects cs ON cs.class_id=ec.class_id
        JOIN subjects s ON s.id=cs.subject_id
        JOIN classes c ON c.id=ec.class_id
        WHERE ec.exam_id=%s AND s.id NOT IN (SELECT subject_id FROM exam_subjects WHERE exam_id=%s)
        GROUP BY s.id, s.name, s.code ORDER BY s.name
    """, (exam_id, exam_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/{exam_id}/subjects")
def add_subject(exam_id: int, body: SubjectAddIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_add_exam_subject(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (exam_id, body.class_id, body.subject_id, body.teacher_id or None,
                 body.total_marks or 100, body.passing_marks or 40,
                 body.exam_date or None, body.start_time or None,
                 body.duration_mins or 120, body.venue or ""))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Subject added.")


@router.delete("/{exam_id}/subjects/{subject_id}")
def delete_exam_subject(exam_id: int, subject_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT e.status FROM exams e WHERE e.id=%s", (exam_id,))
    row = cur.fetchone()
    if row and row["status"] not in ("draft", "scheduled"):
        fail("Cannot remove subjects after datesheet is published.", 400)
    cur.execute("DELETE FROM exam_subjects WHERE id=%s AND exam_id=%s", (subject_id, exam_id))
    db.commit()
    return ok(message="Subject removed.")


# ─── Datesheet ────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/datesheet")
def get_datesheet(exam_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_detail(%s)", (exam_id,))
    row = cur.fetchone()
    if not row: fail("Exam not found", 404)
    result = fmt(dict(row), DATE_KEYS)
    cur.execute("""SELECT ec.class_id, c.name as class_name, c.section
                   FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s ORDER BY c.name, c.section""", (exam_id,))
    result["exam_classes"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    result["subjects"] = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    cur.execute("SELECT datesheet_published, datesheet_published_at FROM exams WHERE id=%s", (exam_id,))
    ds = cur.fetchone()
    result["datesheet_published"] = ds["datesheet_published"] if ds else False
    result["datesheet_published_at"] = str(ds["datesheet_published_at"]) if ds and ds["datesheet_published_at"] else None
    return ok(data=result)


@router.post("/{exam_id}/datesheet/submit")
def submit_datesheet(exam_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    if not cur.fetchall(): fail("Add subjects to datesheet before submitting.", 400)
    cur.execute("SELECT * FROM sp_submit_datesheet(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["id"], "Datesheet Awaiting Approval",
                    f"Datesheet for '{exam['name']}' has been submitted for your approval.", "info")
    except Exception as e:
        print("[datesheet notify]", e)

    return ok(message="Datesheet submitted for principal approval.")


@router.post("/{exam_id}/datesheet/approve")
def approve_datesheet(exam_id: int, user_id: int = Depends(require_permission("exam.approve")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_approve_datesheet(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["id"], "Datesheet Approved",
                    f"Datesheet for '{exam['name']}' has been approved. You can now publish it.", "success")
    except Exception as e:
        print("[datesheet notify]", e)

    return ok(message="Datesheet approved.")


@router.post("/{exam_id}/datesheet/publish")
def publish_datesheet(exam_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
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
        from app.utils.notify import send_notification
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
            for row in teacher_rows:
                send_notification(row["user_id"], "Datesheet Published",
                    f"Datesheet for '{exam_name}' has been published.", "info")
            for row in student_rows:
                if row["user_id"]: send_notification(row["user_id"], "Datesheet Published", f"Exam datesheet for '{exam_name}' is now available.", "info")
                if row["parent_id"]: send_notification(row["parent_id"], "Datesheet Published", "Exam datesheet for your child has been published.", "info")
            for row in principal_rows:
                send_notification(row["id"], "Datesheet Published", f"Datesheet for '{exam_name}' has been published.", "info")
    except Exception as e:
        print("[datesheet notify]", e)

    return ok(message="Datesheet published successfully.")


# ─── Marks Entry ──────────────────────────────────────────────────────────────

@router.post("/{exam_id}/open")
def open_marks(exam_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_open_marks_entry(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT es.teacher_id, t.user_id FROM exam_subjects es JOIN teachers t ON t.id=es.teacher_id WHERE es.exam_id=%s", (exam_id,))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], "Marks Entry Open",
                    "Marks entry has been opened for your exam. Please enter marks.", "info")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message="Marks entry opened.")


@router.get("/{exam_id}/marks-entry")
def get_marks_entry(
    exam_id: int,
    class_id: Optional[int] = Query(None), subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("exam.marks")), db=Depends(get_db),
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
def save_marks(exam_id: int, body: MarksEntryIn, user_id: int = Depends(require_permission("exam.marks")), db=Depends(get_db)):
    if not body.class_id or not body.subject_id: fail("class_id and subject_id required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_save_exam_marks(%s,%s,%s,%s,%s)",
                (exam_id, body.class_id, body.subject_id, json.dumps(body.marks or []), user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()
    return ok(message=f"Marks saved for {len(body.marks or [])} students.")


@router.post("/{exam_id}/submit-subject-marks")
def submit_subject_marks(exam_id: int, body: SubmitMarksIn, user_id: int = Depends(require_permission("exam.marks")), db=Depends(get_db)):
    if not body.class_id or not body.subject_id: fail("class_id and subject_id required", 400)
    cur = get_cur(db)
    cur.execute("UPDATE exam_subjects SET marks_submitted=TRUE, submitted_at=NOW(), submitted_by=%s WHERE exam_id=%s AND class_id=%s AND subject_id=%s",
                (user_id, exam_id, body.class_id, body.subject_id))
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT ct.teacher_id, t.user_id FROM class_teachers ct JOIN teachers t ON t.id=ct.teacher_id WHERE ct.class_id=%s AND ct.is_primary=TRUE", (body.class_id,))
        row = cur.fetchone()
        if row:
            cur.execute("SELECT s.name FROM subjects s WHERE s.id=%s", (body.subject_id,))
            subj = cur.fetchone()
            with _main.flask_app.app_context():
                send_notification(row["user_id"], "Marks Submitted",
                    f"{subj['name'] if subj else 'Subject'} marks submitted. Please compile when all subjects are done.", "info")
    except Exception as e:
        print("[marks notify]", e)

    return ok(message="Marks submitted successfully.")


@router.get("/{exam_id}/class-marks-summary")
def get_class_marks_summary(exam_id: int, class_id: Optional[int] = Query(None), user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    if not class_id: fail("class_id required", 400)
    cur = get_cur(db)
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


# ─── Compile & Approve & Publish ─────────────────────────────────────────────

@router.post("/{exam_id}/compile-results")
def compile_results(exam_id: int, body: CompileIn, user_id: int = Depends(require_permission("exam.compile")), db=Depends(get_db)):
    if not body.class_id: fail("class_id required", 400)
    class_id = body.class_id
    cur = get_cur(db)

    cur.execute("SELECT * FROM grading_scales ORDER BY min_pct DESC")
    grades = [dict(r) for r in cur.fetchall()]

    def get_grade(pct):
        for g in grades:
            if pct >= float(g["min_pct"]): return g["grade"], float(g.get("gpa", 0))
        return "F", 0.0

    cur.execute("SELECT id FROM students WHERE class_id=%s AND status='active'", (class_id,))
    students = [r["id"] for r in cur.fetchall()]

    cur.execute("SELECT SUM(total_marks) as total FROM exam_subjects WHERE exam_id=%s AND class_id=%s", (exam_id, class_id))
    total_row = cur.fetchone()
    total_possible = float(total_row["total"] or 0)

    results = []
    for sid in students:
        cur.execute("""SELECT COALESCE(SUM(em.marks_obtained),0) as obtained
                       FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id
                       WHERE em.exam_id=%s AND es.class_id=%s AND em.student_id=%s AND em.is_absent=FALSE""",
                    (exam_id, class_id, sid))
        row = cur.fetchone()
        obtained = float(row["obtained"] or 0)
        pct = (obtained / total_possible * 100) if total_possible > 0 else 0
        grade, gpa = get_grade(pct)
        results.append({"student_id": sid, "obtained": obtained, "pct": pct, "grade": grade, "gpa": gpa})

    results.sort(key=lambda x: x["obtained"], reverse=True)
    for i, r in enumerate(results):
        cur.execute("""
            INSERT INTO exam_results(exam_id,student_id,class_id,total_marks,marks_obtained,percentage,grade,gpa,class_position,is_pass,compiled_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT(exam_id,student_id) DO UPDATE SET
                total_marks=%s,marks_obtained=%s,percentage=%s,grade=%s,gpa=%s,class_position=%s,is_pass=%s,compiled_at=NOW()
        """, (exam_id, r["student_id"], class_id, total_possible, r["obtained"], r["pct"], r["grade"], r["gpa"],
              i + 1, r["pct"] >= 40,
              total_possible, r["obtained"], r["pct"], r["grade"], r["gpa"], i + 1, r["pct"] >= 40))

    cur.execute("""SELECT COUNT(DISTINCT ec.class_id) as total, COUNT(DISTINCT er.class_id) as compiled
        FROM exam_classes ec LEFT JOIN exam_results er ON er.exam_id=%s AND er.class_id=ec.class_id
        WHERE ec.exam_id=%s""", (exam_id, exam_id))
    status_row = cur.fetchone()
    if status_row and status_row["compiled"] >= status_row["total"]:
        cur.execute("UPDATE exams SET status='compiled' WHERE id=%s", (exam_id,))
    db.commit()
    return ok(message=f"Results compiled for {len(students)} students.")


@router.get("/{exam_id}/compilation-status")
def get_compilation_status(exam_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
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
        WHERE ec.exam_id=%s
        GROUP BY ec.class_id, c.name, c.section ORDER BY c.name, c.section
    """, (exam_id, exam_id, exam_id))
    rows = [dict(r) for r in cur.fetchall()]
    total = len(rows)
    compiled = sum(1 for r in rows if r["is_compiled"])
    return ok(data={"classes": rows, "total": total, "compiled": compiled, "all_compiled": total > 0 and compiled == total})


@router.post("/{exam_id}/approve")
def approve_results(exam_id: int, user_id: int = Depends(require_permission("exam.approve")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_approve_exam_results(%s,%s)", (exam_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"): fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["id"], "Results Approved",
                    "Principal has approved exam results. You can now publish.", "success")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message="Results approved.")


@router.post("/{exam_id}/publish")
def publish_results(exam_id: int, user_id: int = Depends(require_permission("exam.publish")), db=Depends(get_db)):
    cur = get_cur(db)
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
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""SELECT DISTINCT s.user_id, s.parent_id FROM students s
                      JOIN exam_classes ec ON ec.class_id=s.class_id
                      WHERE ec.exam_id=%s AND s.status='active'""", (exam_id,))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                if row["user_id"]: send_notification(row["user_id"], "Results Published", "Your exam results are now available.", "success")
                if row["parent_id"]: send_notification(row["parent_id"], "Results Published", "Your child's exam results are now available.", "success")
    except Exception as e:
        print("[exam notify]", e)

    return ok(message="Results published.")


# ─── Results ──────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/results")
def get_results(
    exam_id: int, user_id: int = Depends(require_permission("exam.view")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
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
def get_class_results(exam_id: int, class_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
               er.total_marks, er.marks_obtained, er.percentage, er.grade, er.gpa, er.class_position, er.is_pass
        FROM students s JOIN exam_results er ON er.student_id=s.id AND er.exam_id=%s
        WHERE s.class_id=%s AND s.status='active' ORDER BY er.class_position
    """, (exam_id, class_id))
    students = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT em.student_id, sub.name as subject_name, es.total_marks, em.marks_obtained, em.is_absent
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
            subjects_set.append({"name": r["subject_name"], "total": float(r["total_marks"])})
            seen.add(r["subject_name"])

    for s in students:
        s["subject_marks"] = subj_marks.get(s["id"], {})
        for k in ["total_marks", "marks_obtained", "percentage", "gpa"]:
            if s.get(k): s[k] = float(s[k])

    return ok(data={"students": students, "subjects": subjects_set})


@router.get("/{exam_id}/student-results/{student_id}")
def get_student_results(exam_id: int, student_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
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
    return ok(data=result)


@router.get("/{exam_id}/result-card/{student_id}")
def get_result_card_pdf(exam_id: int, student_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    import base64, io
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, HRFlowable

    cur = get_cur(db)
    cur.execute("""
        SELECT er.*, s.first_name, s.last_name, s.enrollment_no, c.name as class_name, c.section
        FROM exam_results er JOIN students s ON s.id=er.student_id
        JOIN classes c ON c.id=er.class_id
        WHERE er.exam_id=%s AND er.student_id=%s
    """, (exam_id, student_id))
    row = cur.fetchone()
    if not row: fail("Results not found", 404)
    result = dict(row)

    cur.execute("""SELECT e.name, ay.name AS academic_year FROM exams e
        LEFT JOIN academic_years ay ON ay.id = e.academic_year_id WHERE e.id=%s""", (exam_id,))
    exam = cur.fetchone()
    exam_name = exam["name"] if exam else "Exam"
    academic_year = exam["academic_year"] if exam and exam["academic_year"] else ""

    cur.execute("""
        SELECT sub.name as subject_name, es.total_marks, em.marks_obtained, em.is_absent
        FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id
        JOIN subjects sub ON sub.id=es.subject_id
        WHERE em.exam_id=%s AND em.student_id=%s ORDER BY sub.name
    """, (exam_id, student_id))
    subjects = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT key, value FROM system_settings WHERE category=%s", ("school_info",))
    settings = {r["key"]: r["value"] for r in cur.fetchall()}
    school_name = settings.get("school_name", "School")
    school_address = settings.get("school_address", "")
    school_city = settings.get("school_city", "")
    school_phone = settings.get("school_phone", "")
    school_logo_data = settings.get("school_logo", "")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm, leftMargin=18*mm, rightMargin=18*mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("SchoolTitle", parent=styles["Title"], fontSize=18, spaceAfter=2, textColor=colors.HexColor("#0f4c35"))
    sub_style = ParagraphStyle("SchoolSub", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor("#475569"))
    exam_title_style = ParagraphStyle("ExamTitle", parent=styles["Heading2"], fontSize=13, alignment=TA_CENTER, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#0f172a"))

    story = []

    logo_flowable = None
    if school_logo_data and "base64," in school_logo_data:
        try:
            b64 = school_logo_data.split("base64,")[1]
            logo_bytes = base64.b64decode(b64)
            logo_flowable = RLImage(io.BytesIO(logo_bytes), width=20*mm, height=20*mm)
        except Exception:
            logo_flowable = None

    addr_line = ", ".join([p for p in [school_address, school_city] if p])
    school_info_para = [
        Paragraph(school_name, title_style),
        Paragraph(addr_line, sub_style),
    ]
    if school_phone:
        school_info_para.append(Paragraph("Phone: " + school_phone, sub_style))

    if logo_flowable:
        header_table = Table([[logo_flowable, school_info_para]], colWidths=[25*mm, 145*mm])
        header_table.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("ALIGN", (0,0), (0,0), "CENTER")]))
        story.append(header_table)
    else:
        story.extend(school_info_para)

    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#0f4c35")))
    story.append(Paragraph("STUDENT REPORT CARD", exam_title_style))
    story.append(Paragraph(exam_name + " &bull; Academic Year " + str(academic_year), sub_style))
    story.append(Spacer(1, 14))

    is_pass = result.get("is_pass")
    student_info = [
        ["Student Name:", result["first_name"] + " " + result["last_name"], "Enrollment No:", result.get("enrollment_no") or "-"],
        ["Class:", result["class_name"] + (" (" + result["section"] + ")" if result.get("section") else ""),
         "Position:", ("#" + str(result["class_position"])) if result.get("class_position") else "-"],
    ]
    info_table = Table(student_info, colWidths=[32*mm, 60*mm, 32*mm, 58*mm])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 16))

    table_data = [["Subject", "Total Marks", "Obtained", "Percentage", "Result"]]
    for s in subjects:
        total = float(s["total_marks"]) if s.get("total_marks") else 0
        if s.get("is_absent"):
            table_data.append([s["subject_name"], "%.0f" % total, "Absent", "-", "Absent"])
        else:
            obt = float(s["marks_obtained"]) if s.get("marks_obtained") is not None else 0
            pct = round(obt/total*100) if total else 0
            table_data.append([s["subject_name"], "%.0f" % total, "%.0f" % obt, str(pct)+"%", "Pass" if pct>=40 else "Fail"])

    subj_table = Table(table_data, colWidths=[55*mm, 30*mm, 30*mm, 30*mm, 37*mm], repeatRows=1)
    subj_style = [
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f4c35")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9.5),
        ("ALIGN", (1,0), (-1,-1), "CENTER"),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]
    for i, s in enumerate(subjects, start=1):
        if s.get("is_absent"):
            subj_style.append(("TEXTCOLOR", (2,i), (2,i), colors.HexColor("#dc2626")))
            subj_style.append(("TEXTCOLOR", (4,i), (4,i), colors.HexColor("#dc2626")))
        else:
            total = float(s["total_marks"]) if s.get("total_marks") else 0
            obt = float(s["marks_obtained"]) if s.get("marks_obtained") is not None else 0
            pct = round(obt/total*100) if total else 0
            col = colors.HexColor("#166534") if pct >= 40 else colors.HexColor("#dc2626")
            subj_style.append(("TEXTCOLOR", (4,i), (4,i), col))
    subj_table.setStyle(TableStyle(subj_style))
    story.append(subj_table)
    story.append(Spacer(1, 18))

    total_marks = float(result["total_marks"]) if result.get("total_marks") else 0
    marks_obtained = float(result["marks_obtained"]) if result.get("marks_obtained") else 0
    percentage = float(result["percentage"]) if result.get("percentage") else 0
    grade = result.get("grade") or "-"
    result_color = colors.HexColor("#166534") if is_pass else colors.HexColor("#dc2626")
    result_bg = colors.HexColor("#f0fdf4") if is_pass else colors.HexColor("#fef2f2")

    summary_data = [
        ["Total Marks", "Marks Obtained", "Percentage", "Grade", "Result"],
        ["%.0f" % total_marks, "%.0f" % marks_obtained, "%.1f%%" % percentage, grade, "PASS" if is_pass else "FAIL"],
    ]
    summary_table = Table(summary_data, colWidths=[36*mm, 36*mm, 36*mm, 36*mm, 38*mm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME", (0,1), (-1,1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("FONTSIZE", (0,1), (-1,1), 13),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("TEXTCOLOR", (4,1), (4,1), result_color),
        ("BACKGROUND", (4,1), (4,1), result_bg),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 40))

    def _get_signature_image(uid):
        if not uid: return None
        cur.execute("SELECT signature FROM user_signatures WHERE user_id=%s", (uid,))
        r = cur.fetchone()
        if not r or not r["signature"] or "base64," not in r["signature"]: return None
        try:
            sig_bytes = base64.b64decode(r["signature"].split("base64,")[1])
            return RLImage(io.BytesIO(sig_bytes), width=45*mm, height=18*mm)
        except Exception:
            return None

    cur.execute("""SELECT t.user_id FROM class_teachers ct JOIN teachers t ON t.id = ct.teacher_id
        WHERE ct.class_id=%s AND ct.is_primary=true LIMIT 1""", (result["class_id"],))
    ct_row = cur.fetchone()
    class_teacher_sig = _get_signature_image(ct_row["user_id"]) if ct_row else None

    cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
        JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' LIMIT 1""")
    principal_row = cur.fetchone()
    principal_sig = _get_signature_image(principal_row["id"]) if principal_row else None

    blank_sig = Paragraph("&nbsp;", styles["Normal"])
    sig_data = [
        [class_teacher_sig or blank_sig, "", principal_sig or blank_sig],
        ["_______________________", "", "_______________________"],
        ["Class Teacher", "", "Principal"],
    ]
    sig_table = Table(sig_data, colWidths=[65*mm, 30*mm, 65*mm], rowHeights=[16*mm, None, None])
    sig_table.setStyle(TableStyle([
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,0), "BOTTOM"),
        ("FONTSIZE", (0,1), (-1,-1), 9),
        ("TEXTCOLOR", (0,2), (-1,2), colors.HexColor("#64748b")),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING", (0,2), (-1,2), 3),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 10))
    story.append(Paragraph("Generated on " + datetime.now().strftime("%d %B %Y"),
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=7, alignment=TA_CENTER, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    buf.seek(0)

    safe_name = (result["first_name"] + "_" + result["last_name"] + "_" + exam_name).replace(" ", "_")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="ResultCard_' + safe_name + '.pdf"'})


@router.post("/{exam_id}/send-reminder")
def send_reminder(exam_id: int, body: ReminderIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db)):
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
def get_marks(exam_id: int, subject_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: fail("Exam subject not found", 404)
    cur.execute("SELECT * FROM sp_get_exam_marks(%s)", (es["id"],))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/{exam_id}/subjects/{subject_id}/marks")
def enter_marks(exam_id: int, subject_id: int, body: dict, user_id: int = Depends(require_permission("exam.marks")), db=Depends(get_db)):
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
def submit_marks(exam_id: int, subject_id: int, user_id: int = Depends(require_permission("exam.marks")), db=Depends(get_db)):
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
            cur.execute("""SELECT ct.teacher_id, tt.user_id FROM exams e
                          JOIN exam_classes ec ON ec.exam_id=e.id
                          JOIN class_teachers ct ON ct.class_id=ec.class_id AND ct.is_primary=TRUE
                          JOIN teachers tt ON tt.id=ct.teacher_id WHERE e.id=%s""", (exam_id,))
            incharge = cur.fetchone()
            if incharge:
                with _main.flask_app.app_context():
                    send_notification(incharge["user_id"], "All Marks Submitted",
                        "All subject teachers have submitted marks. Please compile results.", "info")
        except Exception as e:
            print("[exam notify]", e)

    return ok(message="Marks submitted.")
