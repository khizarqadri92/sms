"""
Admissions API.
Phase 2: admission settings (per campus + session, per class) and the
admission dashboard (KPIs, charts, filters). Campus-scoped like every module:
a campus user sees their campus; superadmin with no campus selected sees all
(and can filter by campus).
"""
import re
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission, require_any_permission
from app.fastapi_campus import get_current_campus_id, enforce_same_campus
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


# status groups used by the dashboard cards
GROUPS = {
    "new":                ["submitted"],
    "under_review":       ["initial_verification", "document_verification"],
    "pending_documents":  ["correction_required", "documents_rejected"],
    "test_scheduled":     ["test_scheduled"],
    "interview_scheduled":["interview_scheduled"],
    "awaiting_approval":  ["awaiting_approval", "further_evaluation"],
    "approved":           ["approved", "fee_voucher_generated", "payment_partially_paid", "payment_verified", "admission_completed"],
    "rejected":           ["rejected"],
    "waiting_list":       ["waiting_list"],
    "pending_fee":        ["fee_voucher_generated", "payment_partially_paid"],
    "completed":          ["admission_completed"],
}


def _campus_or_param(campus_id, campus_param):
    """A campus user is locked to their campus; superadmin (no campus) may pick one."""
    if campus_id is not None:
        if campus_param and int(campus_param) != campus_id:
            fail("Record not found.", 404)
        return campus_id
    return int(campus_param) if campus_param else None


def _active_year(cur, campus_id):
    cur.execute("""SELECT id FROM academic_years WHERE is_active AND (campus_id=%s OR campus_id IS NULL)
                   ORDER BY campus_id NULLS LAST LIMIT 1""", (campus_id,))
    r = cur.fetchone()
    return r["id"] if r else None


# =============================================================================
# Sessions available for admissions (current + upcoming, per campus)
# =============================================================================

@router.get("/years")
def admission_years(campus: Optional[int] = Query(None), user_id: int = Depends(require_any_permission("admissions.admission_dashboard_view", "admissions.application_list_view", "admissions.application_create", "admissions.admission_settings_view", "admissions.admission_test_view", "admissions.interview_schedule", "admissions.interview_panel_setup", "admissions.admission_fee_view", "admissions.admission_reports")),
                    db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    cur.execute("""SELECT id, name, start_date, end_date, is_active, closed_at, campus_id FROM academic_years
                   WHERE (%s::int IS NULL OR campus_id=%s OR campus_id IS NULL) AND closed_at IS NULL
                   ORDER BY start_date""", (cid, cid))
    rows = [{"id": r["id"], "name": r["name"], "start_date": str(r["start_date"]) if r["start_date"] else None,
             "end_date": str(r["end_date"]) if r["end_date"] else None, "active": r["is_active"]} for r in cur.fetchall()]
    cur.execute("SELECT id, name, code FROM campuses WHERE is_active AND (%s::int IS NULL OR id=%s) ORDER BY is_main DESC, name", (campus_id, campus_id))
    return ok(data={"years": rows, "campuses": [dict(r) for r in cur.fetchall()], "campus_id": cid,
                    "default_year": _active_year(cur, cid) if cid else None})


# =============================================================================
# Settings
# =============================================================================

def _class_levels(cur, campus_id):
    """Distinct class names on the campus (sections merged), in level order."""
    cur.execute("""SELECT name, MIN(level) AS level, SUM(COALESCE(capacity,0)) AS seats, COUNT(*) AS sections
                   FROM classes WHERE campus_id=%s GROUP BY name ORDER BY MIN(level) NULLS LAST, name""", (campus_id,))
    return [dict(r) for r in cur.fetchall()]


@router.get("/settings")
def get_settings(academic_year_id: Optional[int] = Query(None), campus: Optional[int] = Query(None),
                 user_id: int = Depends(require_permission("admissions.admission_settings_view")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    if not cid:
        fail("Choose a campus first.", 400)
    ay = academic_year_id or _active_year(cur, cid)
    if not ay:
        fail("This campus has no academic session yet.", 400)
    cur.execute("SELECT id, name, campus_id FROM academic_years WHERE id=%s", (ay,))
    year = cur.fetchone()
    if not year: fail("Academic year not found.", 404)
    if year["campus_id"] is not None: enforce_same_campus(year["campus_id"], cid)
    cur.execute("SELECT * FROM admission_settings WHERE campus_id=%s AND academic_year_id=%s", (cid, ay))
    s = cur.fetchone()
    settings = dict(s) if s else None
    if settings:
        settings["has_banner"] = bool(settings.pop("banner_path", None))
        settings.pop("banner_mime", None)
        for k in ("opens_on", "closes_on", "updated_at", "tests_start_on", "interview_start_on", "classes_commence_on", "published_at", "banner_updated_at"):
            if settings.get(k): settings[k] = str(settings[k])
        settings["admission_fee"] = float(settings["admission_fee"])
        cur.execute("SELECT * FROM admission_class_settings WHERE setting_id=%s", (settings["id"],))
        saved = {r["class_name"].lower(): dict(r) for r in cur.fetchall()}
    else:
        saved = {}
    # every class on the campus appears; saved values (or defaults) per class
    classes = []
    cur.execute("""SELECT class_name, COUNT(*) FILTER (WHERE status = ANY(%s)) AS taken FROM admission_applications
                   WHERE campus_id=%s AND academic_year_id=%s GROUP BY class_name""",
                (GROUPS["approved"], cid, ay))
    taken = {r["class_name"].lower(): r["taken"] for r in cur.fetchall()}
    for c in _class_levels(cur, cid):
        sv = saved.get(c["name"].lower(), {})
        classes.append({"class_name": c["name"], "level": c["level"], "sections": c["sections"], "total_seats": int(c["seats"] or 0),
                        "is_open": sv.get("is_open", True), "capacity": sv.get("capacity"),
                        "min_age_years": float(sv["min_age_years"]) if sv.get("min_age_years") is not None else None,
                        "max_age_years": float(sv["max_age_years"]) if sv.get("max_age_years") is not None else None,
                        "admitted": taken.get(c["name"].lower(), 0)})
    return ok(data={"campus_id": cid, "academic_year": dict(year), "settings": settings, "classes": classes,
                    "configured": settings is not None})


class ClassSettingIn(BaseModel):
    class_name: str
    is_open: bool = True
    capacity: Optional[int] = None
    min_age_years: Optional[float] = None
    max_age_years: Optional[float] = None


class SettingsIn(BaseModel):
    academic_year_id: int
    campus_id: Optional[int] = None
    opens_on: Optional[date] = None
    closes_on: Optional[date] = None
    tests_start_on: Optional[date] = None
    interview_start_on: Optional[date] = None
    classes_commence_on: Optional[date] = None
    test_required: bool = True
    interview_required: bool = True
    admission_fee: float = 0
    fee_due_days: int = 7
    allow_partial_payment: bool = False
    application_no_format: str = "ADM-{YYYY}-{SEQ5}"
    required_documents: List[str] = []
    notify_staff: bool = True
    is_active: bool = True
    classes: List[ClassSettingIn] = []


def _check_schedule_dates(opens, closes, interview, commence, test_dates=(), tests_start=None):
    """The season must make sense: tests and interviews inside the season, classes after applications close."""
    if commence and closes and commence < closes:
        fail("Classes can't commence before applications close.", 400)
    if tests_start and opens and tests_start < opens:
        fail("Admission tests can't start before applications open.", 400)
    if tests_start and commence and tests_start > commence:
        fail("Admission tests must start before classes commence.", 400)
    if interview and opens and interview < opens:
        fail("Interviews can't start before applications open.", 400)
    if interview and commence and interview > commence:
        fail("Interviews must start before classes commence.", 400)
    for cls, d in test_dates:
        if tests_start and d < tests_start: fail(f"The {cls} test can't be before admission tests start ({tests_start:%d %b %Y}).", 400)
        if opens and d < opens: fail(f"The {cls} test can't be before applications open ({opens:%d %b %Y}).", 400)
        if commence and d > commence: fail(f"The {cls} test must be before classes commence ({commence:%d %b %Y}).", 400)


NO_FORMAT_TOKENS = re.compile(r"\{(YYYY|YY|CAMPUS_ID|CAMPUS|SEQ\d)\}")


@router.put("/settings")
def save_settings(body: SettingsIn, user_id: int = Depends(require_permission("admissions.admission_settings_edit")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, body.campus_id)
    if not cid: fail("Choose a campus first.", 400)
    cur.execute("SELECT id, campus_id, closed_at FROM academic_years WHERE id=%s", (body.academic_year_id,))
    y = cur.fetchone()
    if not y: fail("Academic year not found.", 404)
    if y["campus_id"] is not None: enforce_same_campus(y["campus_id"], cid)
    if y["closed_at"]: fail("That session is closed.", 400)
    # ---- validation
    if body.opens_on and body.closes_on and body.closes_on < body.opens_on:
        fail("The closing date must be on or after the opening date.", 400)
    _check_schedule_dates(body.opens_on, body.closes_on, body.interview_start_on, body.classes_commence_on,
                          tests_start=body.tests_start_on if body.test_required else None)
    if body.admission_fee < 0: fail("The admission fee can't be negative.", 400)
    if not 0 <= body.fee_due_days <= 120: fail("Fee due days must be between 0 and 120.", 400)
    fmt = (body.application_no_format or "").strip()
    if not re.search(r"\{SEQ\d\}", fmt): fail("The application number format needs a sequence, e.g. {SEQ5}.", 400)
    wrong = re.search(r"[\(\[]\s*(YYYY|YY|CAMPUS_ID|CAMPUS|SEQ\d)\s*[\)\]]", fmt, re.I)
    if wrong:
        fail(f"Write tokens in curly braces: use {{{wrong.group(1).upper()}}} instead of {wrong.group(0)}.", 400)
    if len(fmt) > 60 or re.sub(NO_FORMAT_TOKENS, "", fmt).count("{"): fail("Unknown token in the application number format.", 400)
    docs = [d.strip() for d in body.required_documents if d and d.strip()]
    if len({d.lower() for d in docs}) != len(docs): fail("Each required document should be listed once.", 400)
    known = {c["name"].lower() for c in _class_levels(cur, cid)}
    for c in body.classes:
        if c.class_name.lower() not in known: fail(f"{c.class_name} is not a class on this campus.", 400)
        if c.capacity is not None and c.capacity < 0: fail(f"{c.class_name}: capacity can't be negative.", 400)
        for v in (c.min_age_years, c.max_age_years):
            if v is not None and not 0 <= v <= 25: fail(f"{c.class_name}: ages must be between 0 and 25.", 400)
        if c.min_age_years is not None and c.max_age_years is not None and c.max_age_years < c.min_age_years:
            fail(f"{c.class_name}: the maximum age must be at least the minimum age.", 400)
    # ---- save (upsert)
    import json
    cur.execute("""INSERT INTO admission_settings (campus_id, academic_year_id, opens_on, closes_on, tests_start_on, interview_start_on, classes_commence_on,
                       test_required, interview_required,
                       admission_fee, fee_due_days, allow_partial_payment, application_no_format, required_documents, notify_staff,
                       is_active, updated_by, updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,fn_admission_now())
                   ON CONFLICT (campus_id, academic_year_id) DO UPDATE SET
                       opens_on=EXCLUDED.opens_on, closes_on=EXCLUDED.closes_on, tests_start_on=EXCLUDED.tests_start_on,
                       interview_start_on=EXCLUDED.interview_start_on,
                       classes_commence_on=EXCLUDED.classes_commence_on, test_required=EXCLUDED.test_required,
                       interview_required=EXCLUDED.interview_required, admission_fee=EXCLUDED.admission_fee,
                       fee_due_days=EXCLUDED.fee_due_days, allow_partial_payment=EXCLUDED.allow_partial_payment,
                       application_no_format=EXCLUDED.application_no_format, required_documents=EXCLUDED.required_documents,
                       notify_staff=EXCLUDED.notify_staff, is_active=EXCLUDED.is_active, updated_by=EXCLUDED.updated_by, updated_at=fn_admission_now()
                   RETURNING id""",
                (cid, body.academic_year_id, body.opens_on, body.closes_on, body.tests_start_on if body.test_required else None,
                 body.interview_start_on, body.classes_commence_on,
                 body.test_required, body.interview_required,
                 body.admission_fee, body.fee_due_days, body.allow_partial_payment, fmt, json.dumps(docs), body.notify_staff,
                 body.is_active, user_id))
    sid = cur.fetchone()["id"]
    levels = {c["name"].lower(): c["level"] for c in _class_levels(cur, cid)}
    for c in body.classes:
        cur.execute("""INSERT INTO admission_class_settings (setting_id, class_name, level, is_open, capacity, min_age_years, max_age_years)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (setting_id, class_name) DO UPDATE SET level=EXCLUDED.level, is_open=EXCLUDED.is_open,
                           capacity=EXCLUDED.capacity, min_age_years=EXCLUDED.min_age_years, max_age_years=EXCLUDED.max_age_years""",
                    (sid, c.class_name, levels.get(c.class_name.lower()), c.is_open, c.capacity, c.min_age_years, c.max_age_years))
    db.commit()
    return ok(message="Admission settings saved.", data={"id": sid})


# =============================================================================
# Dashboard
# =============================================================================

@router.get("/staff")
def admission_staff_list(user_id: int = Depends(require_any_permission("admissions.application_assign", "admissions.application_list_view")), db=Depends(get_db),
                         campus_id: Optional[int] = Depends(get_current_campus_id)):
    """People who handle applications (for the 'staff member' filter)."""
    cur = get_cur(db)
    cur.execute("""SELECT DISTINCT u.id, u.first_name || ' ' || u.last_name AS name FROM users u
                   JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
                   WHERE r.name IN ('admission_staff','academic_coordinator','admin') AND COALESCE(u.is_active,TRUE)
                     AND (%s::int IS NULL OR u.campus_id=%s) ORDER BY 2""", (campus_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/examiners")
def examiners_list(campus: Optional[int] = Query(None), user_id: int = Depends(require_permission("admissions.admission_test_view")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Who can examine an admission test: every active teacher on the campus, then other academic staff."""
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    cur.execute("""SELECT u.id, u.first_name || ' ' || u.last_name AS name,
                          bool_or(r.name = 'teacher') AS is_teacher, string_agg(DISTINCT r.name, ',') AS roles
                   FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
                   WHERE r.name IN ('teacher','academic_coordinator','principal','admission_staff')
                     AND COALESCE(u.is_active, TRUE) AND (%s::int IS NULL OR u.campus_id=%s)
                   GROUP BY u.id ORDER BY bool_or(r.name = 'teacher') DESC, 2""", (cid, cid))
    rows = [dict(r) for r in cur.fetchall()]
    return ok(data={"teachers": [{"id": r["id"], "name": r["name"]} for r in rows if r["is_teacher"]],
                    "other": [{"id": r["id"], "name": r["name"], "role": r["roles"].replace("_", " ")} for r in rows if not r["is_teacher"]]})


def _months_back(today, n):
    y, m, out = today.year, today.month, []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}"); m -= 1
        if m == 0: y, m = y - 1, 12
    return out[::-1]


@router.get("/dashboard")
def dashboard(academic_year_id: Optional[int] = Query(None), campus: Optional[int] = Query(None),
              class_name: Optional[str] = Query(None), status: Optional[str] = Query(None),
              date_from: Optional[date] = Query(None), date_to: Optional[date] = Query(None),
              assigned_to: Optional[int] = Query(None),
              user_id: int = Depends(require_permission("admissions.admission_dashboard_view")), db=Depends(get_db),
              campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    today = get_processing_date(db)
    cid = _campus_or_param(campus_id, campus)
    ay = academic_year_id or (_active_year(cur, cid) if cid else None)
    def flt(p=""):
        """WHERE clause for the dashboard filters; p = table alias prefix like 'a.'."""
        w, a = [f"{p}status <> 'draft'"], []
        if cid:        w.append(f"{p}campus_id=%s");                a.append(cid)
        if ay:         w.append(f"{p}academic_year_id=%s");         a.append(ay)
        if class_name: w.append(f"lower({p}class_name)=lower(%s)"); a.append(class_name)
        if status:
            if status in GROUPS: w.append(f"{p}status = ANY(%s)"); a.append(GROUPS[status])
            else:                w.append(f"{p}status=%s");        a.append(status)
        if date_from:  w.append(f"COALESCE({p}submitted_at, {p}created_at)::date >= %s"); a.append(date_from)
        if date_to:    w.append(f"COALESCE({p}submitted_at, {p}created_at)::date <= %s"); a.append(date_to)
        if assigned_to: w.append(f"{p}assigned_to=%s"); a.append(assigned_to)
        return " AND ".join(w), a
    W, args = flt()
    WA, args_a = flt("a.")

    cur.execute(f"SELECT status, COUNT(*) AS n FROM admission_applications WHERE {W} GROUP BY status", args)
    by_status = {r["status"]: r["n"] for r in cur.fetchall()}
    total = sum(by_status.values())
    kpis = {"total": total, **{k: sum(by_status.get(s, 0) for s in v) for k, v in GROUPS.items()}}

    months = _months_back(today, 12)
    cur.execute(f"""SELECT to_char(COALESCE(submitted_at, created_at),'YYYY-MM') AS m, COUNT(*) AS n,
                           COUNT(*) FILTER (WHERE status='admission_completed') AS done
                    FROM admission_applications WHERE {W} GROUP BY 1""", args)
    mm = {r["m"]: r for r in cur.fetchall()}
    monthly = [{"month": m, "applications": (mm.get(m) or {}).get("n", 0), "completed": (mm.get(m) or {}).get("done", 0)} for m in months]

    cur.execute(f"""SELECT class_name, COUNT(*) AS n,
                           COUNT(*) FILTER (WHERE status = ANY(%s)) AS approved,
                           COUNT(*) FILTER (WHERE status='rejected') AS rejected
                    FROM admission_applications WHERE {W} GROUP BY class_name""", [GROUPS["approved"]] + args)
    cls_rows = {r["class_name"]: dict(r) for r in cur.fetchall()}
    order = [c["name"] for c in _class_levels(cur, cid)] if cid else sorted(cls_rows)
    by_class = [{"class": c, "applications": cls_rows[c]["n"], "approved": cls_rows[c]["approved"], "rejected": cls_rows[c]["rejected"],
                 "in_progress": cls_rows[c]["n"] - cls_rows[c]["approved"] - cls_rows[c]["rejected"]}
                for c in order if c in cls_rows] + [
                {"class": c, "applications": v["n"], "approved": v["approved"], "rejected": v["rejected"],
                 "in_progress": v["n"] - v["approved"] - v["rejected"]} for c, v in cls_rows.items() if c not in order]

    from app.services.admission_workflow import STATUS_LABELS
    status_dist = [{"status": STATUS_LABELS.get(s, s), "key": s, "count": n} for s, n in sorted(by_status.items(), key=lambda x: -x[1])]

    cur.execute(f"SELECT gender, COUNT(*) AS n FROM admission_applications WHERE {W} GROUP BY gender", args)
    gender = [{"gender": (r["gender"] or "unknown").title(), "count": r["n"]} for r in cur.fetchall()]

    cur.execute(f"""SELECT t.result, COUNT(*) AS n FROM admission_tests t
                    JOIN admission_applications a ON a.id=t.application_id
                    WHERE {WA} AND t.result IS NOT NULL GROUP BY t.result""", args_a)
    tests = {r["result"]: r["n"] for r in cur.fetchall()}
    cur.execute(f"""SELECT i.recommendation, COUNT(*) AS n FROM admission_interviews i
                    JOIN admission_applications a ON a.id=i.application_id
                    WHERE {WA} AND i.recommendation IS NOT NULL GROUP BY i.recommendation""", args_a)
    interviews = {r["recommendation"]: r["n"] for r in cur.fetchall()}

    decided = kpis["approved"] + kpis["rejected"]
    return ok(data={
        "today": str(today), "campus_id": cid, "academic_year_id": ay,
        "kpis": kpis,
        "conversion": {"rate": round(100.0 * kpis["completed"] / total, 1) if total else None,
                       "approval_rate": round(100.0 * kpis["approved"] / decided, 1) if decided else None},
        "monthly": monthly, "by_class": by_class, "status_distribution": status_dist, "gender": gender,
        "tests": {"pass": tests.get("pass", 0), "fail": tests.get("fail", 0), "absent": tests.get("absent", 0)},
        "interviews": {"recommended": interviews.get("recommended", 0), "not_recommended": interviews.get("not_recommended", 0),
                       "further_review": interviews.get("further_review", 0)},
    })


# =============================================================================
# Phase 3 - applications: shared validation, create / edit, list, detail,
# documents, workflow actions
# =============================================================================
import os
import uuid
from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse

ADM_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "admissions")
DOC_TYPES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
DOC_MAX_BYTES = 5 * 1024 * 1024
RELATIONSHIPS = ("grandfather", "grandmother", "paternal_uncle", "maternal_uncle", "paternal_aunt", "maternal_aunt",
                 "brother", "sister", "other")
EDITABLE = ("draft", "submitted", "initial_verification", "correction_required")   # staff may edit details while in these


def normalize_phone(raw):
    """Pakistani mobile -> 03XXXXXXXXX. Returns None if it isn't a valid mobile number."""
    if not raw:
        return None
    d = re.sub(r"\D", "", str(raw))
    if d.startswith("0092"): d = d[4:]
    elif d.startswith("92"): d = d[2:]
    if d.startswith("3") and len(d) == 10: d = "0" + d
    return d if re.fullmatch(r"03\d{9}", d) else None


def _cnic_digits(v):
    return re.sub(r"\D", "", v or "")


def _cnic_ok(v):
    """13 digits, whatever separators were typed or pasted (dashes, spaces, long dashes)."""
    return len(_cnic_digits(v)) == 13


def _email_ok(v):
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v or ""))


class ApplicationIn(BaseModel):
    campus_id: Optional[int] = None
    academic_year_id: int
    class_name: str
    student_first_name: str
    student_last_name: str
    date_of_birth: date
    gender: str
    b_form_no: Optional[str] = None
    previous_school: Optional[str] = None
    previous_class: Optional[str] = None
    address: Optional[str] = None
    father_name: Optional[str] = None
    father_cnic: Optional[str] = None
    father_occupation: Optional[str] = None
    father_phone: Optional[str] = None
    father_email: Optional[str] = None
    mother_name: Optional[str] = None
    mother_cnic: Optional[str] = None
    mother_occupation: Optional[str] = None
    mother_phone: Optional[str] = None
    mother_email: Optional[str] = None
    primary_guardian: str
    guardian_name: Optional[str] = None
    guardian_cnic: Optional[str] = None
    guardian_occupation: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_relationship_other: Optional[str] = None
    notify_contact: str = "primary"
    has_disability: bool = False
    disability_types: List[str] = []
    disability_details: Optional[str] = None
    transport_mode: str = "self"                   # self | school_van
    pickup_address: Optional[str] = None
    sibling_enrollment_nos: List[str] = []         # brothers / sisters already at the school
    religion: Optional[str] = None                 # Islam | Christianity | Hinduism | Sikhism | or the "other" text
    sect: Optional[str] = None
    nationality: Optional[str] = None
    leaving_reason: Optional[str] = None           # required when there is a previous school
    living_with: Optional[str] = None              # father | mother | both | guardian


DISABILITY_TYPES = ("physical", "visual", "hearing", "speech", "learning", "intellectual", "autism", "other")

# family & other details kept on the student record too (same as the admission form)
STUDENT_DETAIL_FIELDS = ("b_form_no", "religion", "sect", "nationality", "previous_school", "previous_class",
                         "father_name", "father_cnic", "father_occupation", "father_phone", "father_email",
                         "mother_name", "mother_cnic", "mother_occupation", "mother_phone", "mother_email",
                         "primary_guardian", "guardian_name", "guardian_cnic", "guardian_occupation", "guardian_phone", "guardian_email",
                         "guardian_relationship", "guardian_relationship_other", "living_with",
                         "has_disability", "disability_types", "disability_details", "transport_mode", "pickup_address")


def validate_application(cur, a: ApplicationIn, today):
    """
    The ONE set of form rules - used by staff entry now and the public portal later.
    Returns a dict of clean values ready to store; raises (fail) with the first problem.
    """
    v = {k: (x.strip() if isinstance(x, str) else x) for k, x in a.dict().items()}
    for k in list(v):
        if v[k] == "": v[k] = None
    if not v["student_first_name"] or not v["student_last_name"]: fail("Enter the student's first and last name.")
    if v["gender"] not in ("male", "female"): fail("Choose the student's gender.")
    if v["date_of_birth"] > today: fail("The date of birth can't be in the future.")
    if (today - v["date_of_birth"]).days > 25 * 366: fail("Please check the date of birth.")
    if v["b_form_no"]:
        if not _cnic_ok(v["b_form_no"]): fail("The B-Form / birth certificate number should have 13 digits.")
        v["b_form_no"] = _cnic_digits(v["b_form_no"])
    # parents
    for who in ("father", "mother"):
        if v[f"{who}_cnic"] and not _cnic_ok(v[f"{who}_cnic"]): fail(f"The {who}'s CNIC should have 13 digits.")
        if v[f"{who}_email"] and not _email_ok(v[f"{who}_email"]): fail(f"The {who}'s email address isn't valid.")
        if v[f"{who}_phone"]:
            p = normalize_phone(v[f"{who}_phone"])
            if not p: fail(f"The {who}'s phone should be a mobile number like 0300 1234567.")
            v[f"{who}_phone"] = p
        if v[f"{who}_cnic"]: v[f"{who}_cnic"] = _cnic_digits(v[f"{who}_cnic"])
    # primary guardian
    pg = v["primary_guardian"]
    if pg not in ("father", "mother", "other"): fail("Choose the primary guardian.")
    if pg in ("father", "mother"):
        if not v[f"{pg}_name"]: fail(f"Enter the {pg}'s name - the {pg} is the primary guardian.")
        if not v[f"{pg}_phone"]: fail(f"Enter the {pg}'s mobile number - it becomes the parent login.")
        for k in ("guardian_name", "guardian_cnic", "guardian_occupation", "guardian_phone", "guardian_email",
                  "guardian_relationship", "guardian_relationship_other"):
            v[k] = None
    else:
        if not v["guardian_name"]: fail("Enter the guardian's name.")
        p = normalize_phone(v["guardian_phone"])
        if not p: fail("Enter the guardian's mobile number like 0300 1234567 - it becomes the parent login.")
        v["guardian_phone"] = p
        if v["guardian_cnic"]:
            if not _cnic_ok(v["guardian_cnic"]): fail("The guardian's CNIC should have 13 digits.")
            v["guardian_cnic"] = _cnic_digits(v["guardian_cnic"])
        if v["guardian_email"] and not _email_ok(v["guardian_email"]): fail("The guardian's email address isn't valid.")
        if v["guardian_relationship"] not in RELATIONSHIPS: fail("Choose the guardian's relationship with the student.")
        if v["guardian_relationship"] == "other" and not v["guardian_relationship_other"]: fail("Describe the guardian's relationship.")
        if v["guardian_relationship"] != "other": v["guardian_relationship_other"] = None
    if not (v["father_name"] or v["mother_name"]): fail("Enter at least the father's or mother's name.")
    # notification contact
    nc = v["notify_contact"] or "primary"
    need = {"father": ["father_phone"], "mother": ["mother_phone"], "guardian": ["guardian_phone"],
            "both_parents": ["father_phone", "mother_phone"], "all": [], "primary": []}
    if nc not in need: fail("Choose where admission messages should go.")
    if nc == "guardian" and pg != "other": fail("'Other guardian' can only receive messages when the primary guardian is Other.")
    missing = [k.split("_")[0] for k in need[nc] if not v[k]]
    if missing: fail(f"Admission messages can't go to the {' and '.join(missing)} - no mobile number entered.")
    v["notify_contact"] = nc
    # religion / sect / nationality / residence
    if not v.get("religion"): fail("Choose the student's religion.")
    if len(v["religion"]) > 40: fail("Religion: please keep it short.")
    if v.get("sect") and len(v["sect"]) > 40: fail("Sect: please keep it short.")
    if not v.get("nationality"): fail("Enter the student's nationality.")
    if len(v["nationality"]) > 60: fail("Nationality: please keep it short.")
    if not v.get("address"): fail("Enter the residential address.")
    if v.get("previous_school") and not v.get("leaving_reason"):
        fail("Give the reason for leaving the previous school.")
    if not v.get("previous_school"): v["leaving_reason"] = None
    lw = v.get("living_with")
    if lw not in ("father", "mother", "both", "guardian"): fail("Choose who the student lives with.")
    if lw == "guardian" and v["primary_guardian"] != "other":
        fail("'Lives with the guardian' is for when the primary guardian is Other.")
    # disability / special needs
    v.pop("sibling_enrollment_nos", None)
    types = [t for t in (v.get("disability_types") or []) if t]
    if v.get("has_disability"):
        bad_t = [t for t in types if t not in DISABILITY_TYPES]
        if bad_t: fail("Choose the type of disability from the list.")
        if not types and not v.get("disability_details"): fail("Tell us about the child's disability or special need.")
        v["disability_types"] = sorted(set(types))
    else:
        v["has_disability"], v["disability_types"], v["disability_details"] = False, [], None
    # transport
    if v.get("transport_mode") not in ("self", "school_van"): fail("Choose school van or self pick and drop.")
    if v["transport_mode"] == "school_van":
        if not v.get("pickup_address"): fail("Enter the pick-up address or area for the school van.")
    else:
        v["pickup_address"] = None
    # class must exist on the campus and be open for the session
    cur.execute("SELECT 1 FROM classes WHERE campus_id=%s AND lower(name)=lower(%s) LIMIT 1", (v["campus_id"], v["class_name"]))
    if not cur.fetchone(): fail(f"{v['class_name']} is not a class on this campus.")
    cur.execute("""SELECT cs.is_open FROM admission_class_settings cs JOIN admission_settings s ON s.id=cs.setting_id
                   WHERE s.campus_id=%s AND s.academic_year_id=%s AND lower(cs.class_name)=lower(%s)""",
                (v["campus_id"], v["academic_year_id"], v["class_name"]))
    r = cur.fetchone()
    if r is not None and not r["is_open"]: fail(f"Admissions for {v['class_name']} are closed for this session.")
    return v


def primary_phone(v):
    return v["guardian_phone"] if v["primary_guardian"] == "other" else v[f"{v['primary_guardian']}_phone"]


def next_application_no(cur, campus_id, ay_id, fmt, today):
    """Number from the session's format; serialised per campus+session so two submissions never collide."""
    cur.execute("SELECT pg_advisory_xact_lock(hashtext('adm_no:' || %s || ':' || %s))", (campus_id, ay_id))
    cur.execute("SELECT code FROM campuses WHERE id=%s", (campus_id,))
    code = ((cur.fetchone() or {}).get("code") or f"C{campus_id}").upper()
    cur.execute("SELECT COUNT(*) AS n FROM admission_applications WHERE campus_id=%s AND academic_year_id=%s", (campus_id, ay_id))
    seq = cur.fetchone()["n"] + 1
    while True:
        no = fmt.replace("{YYYY}", str(today.year)).replace("{YY}", str(today.year)[2:]) \
                .replace("{CAMPUS_ID}", str(campus_id)).replace("{CAMPUS}", code)
        no = re.sub(r"\{SEQ(\d)\}", lambda m: str(seq).zfill(int(m.group(1))), no)
        cur.execute("SELECT 1 FROM admission_applications WHERE application_no=%s", (no,))
        if not cur.fetchone():
            return no
        seq += 1


def find_parent_account(cur, phone):
    """Existing parent login for a guardian phone (login_phone first, then a parent whose phone matches)."""
    if not phone:
        return None
    cur.execute("SELECT id FROM users WHERE login_phone=%s", (phone,))
    r = cur.fetchone()
    if r: return r["id"]
    cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles ro ON ro.id=ur.role_id
                   WHERE ro.name='parent' AND regexp_replace(COALESCE(u.phone,''), '\\D', '', 'g') IN (%s, %s)
                   ORDER BY u.id LIMIT 2""", (phone, "92" + phone[1:]))
    rows = cur.fetchall()
    return rows[0]["id"] if len(rows) == 1 else None      # ambiguous -> don't guess


def _wf():
    from app.services import admission_workflow as W
    return W


def _user_perms(cur, user_id):
    from app.utils.access import effective_permissions          # roles + acting roles + extra permissions, today
    return set(effective_permissions(cur, user_id))


CONTACT_FIELDS = ("father_cnic", "father_phone", "father_email", "mother_cnic", "mother_phone", "mother_email",
                  "guardian_cnic", "guardian_phone", "guardian_email", "b_form_no", "pickup_address", "address")
SPECIAL_FIELDS = ("has_disability", "disability_types", "disability_details")


def _mask(v):
    """35202-1234567-1 -> 35202-*******-1 ; 03001234567 -> 0300****567 ; a@b.pk -> a***@b.pk"""
    if not v: return v
    s = str(v)
    if "@" in s:
        u, d = s.split("@", 1); return (u[:1] + "***@" + d)
    digits = sum(ch.isdigit() for ch in s)
    if digits >= 7: keep_a, keep_b = (5, 1) if digits == 13 else (4, 3); return s[:keep_a] + "*" * max(len(s) - keep_a - keep_b, 3) + s[-keep_b:]
    return "***"


def protect_application(a, perms):
    """Sensitive fields follow the permissions: contact details, special needs (server-side, not just hidden on screen)."""
    if "admissions.application_contact_details" not in perms:
        for k in CONTACT_FIELDS:
            if a.get(k): a[k] = _mask(a[k])
        a["contact_masked"] = True
    if "admissions.application_special_needs" not in perms:
        a["has_disability"], a["disability_types"], a["disability_details"] = None, [], None
        a["special_needs_hidden"] = True
    return a


def _assignment(cur, user_id, app_id):
    """Is this user the examiner of the applicant's test, or on an interview panel for them?"""
    cur.execute("""SELECT EXISTS (SELECT 1 FROM admission_tests t LEFT JOIN admission_test_sessions ts ON ts.id=t.session_id
                                  WHERE t.application_id=%s AND (t.examiner_id=%s OR ts.examiner_id=%s)) AS examiner,
                          EXISTS (SELECT 1 FROM admission_interviews i WHERE i.application_id=%s AND %s = ANY(i.panel_user_ids)) AS panel""",
                (app_id, user_id, user_id, app_id, user_id))
    return dict(cur.fetchone())


def _claims_actor(user_id, db):
    """Workflow actor with the user's live permissions (same source as require_permission)."""
    from app.utils.access import effective_permissions          # roles + acting roles + extra permissions, today
    return _wf().actor(user_id, effective_permissions(get_cur(db), user_id))


# timeline headings for entries that don't change the status (status changes show the new status)
EVENT_TITLES = {"document_upload": "Document uploaded", "fee_payment_submitted": "Fee payment submitted", "parent_account": "Parent login", "documents_verified": "All documents verified", "document_review": "Document needs attention",
                "test_rescheduled": "Admission test rescheduled", "approval_chain": "Approval workflow started",
                "approval_step": "Approval step", "edit": "Details updated", "create": "Application created",
                "send_for_approval": "Sent for approval"}


def _timeline_entry(h, step_names):
    """Title + remarks for one timeline row. Rows written by the approval chain start with the step's name
    ('Principal approval: approved - note') -> 'Principal approval - Approved' with just the note as remarks."""
    title = EVENT_TITLES.get(h["action"])
    remarks = h.get("remarks")
    if h["action"] in ("approval_step", "approve", "reject") and remarks and ":" in remarks:
        step, rest = remarks.split(":", 1)
        if step.strip() in step_names:
            verdict = "Rejected" if h["action"] == "reject" else "Approved"
            rest = rest.strip()
            rest = re.sub(r"^approved(\s*-\s*)?", "", rest, flags=re.I)              # 'approved - note' -> 'note'
            rest = re.sub(r"\.\s*Next:\s*(.+)$", r" (next: \1)", rest).strip(" .")   # keep who's next, briefly
            return f"{step.strip()} - {verdict}", (rest or None)
    return title, remarks


def _get_app(cur, app_id, campus_id):
    cur.execute("SELECT * FROM admission_applications WHERE id=%s", (app_id,))
    a = cur.fetchone()
    if not a: fail("Application not found.", 404)
    enforce_same_campus(a["campus_id"], campus_id)
    return dict(a)


@router.get("/class-options")
def class_options(campus: Optional[int] = Query(None), academic_year_id: Optional[int] = Query(None),
                  user_id: int = Depends(require_any_permission("admissions.application_create", "admissions.application_edit", "admissions.application_list_view")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Classes that can be applied for (open ones), with seats left."""
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    if not cid: fail("Choose a campus first.", 400)
    data = get_settings(academic_year_id=academic_year_id, campus=cid, user_id=user_id, db=db, campus_id=campus_id)["data"]
    return ok(data={"academic_year": data["academic_year"], "configured": data["configured"],
                    "settings": data["settings"],
                    "classes": [{"class_name": c["class_name"], "seats_left": (c["capacity"] - c["admitted"]) if c["capacity"] is not None else None,
                                 "min_age_years": c["min_age_years"], "max_age_years": c["max_age_years"]}
                                for c in data["classes"] if c["is_open"]]})


@router.post("/applications")
def create_application(body: ApplicationIn, submit: bool = Query(False), user_id: int = Depends(require_permission("admissions.application_create")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Staff enters an application for a parent (saved as a draft, or submitted straight away)."""
    import psycopg2
    cur = get_cur(db)
    today = get_processing_date(db)
    body.campus_id = _campus_or_param(campus_id, body.campus_id)
    if not body.campus_id: fail("Choose a campus first.", 400)
    cur.execute("SELECT campus_id, closed_at FROM academic_years WHERE id=%s", (body.academic_year_id,))
    y = cur.fetchone()
    if not y or y["closed_at"]: fail("Choose an open session.", 400)
    v = validate_application(cur, body, today)
    sibs = resolve_siblings(cur, body.sibling_enrollment_nos)
    cur.execute("SELECT application_no_format FROM admission_settings WHERE campus_id=%s AND academic_year_id=%s",
                (body.campus_id, body.academic_year_id))
    s = cur.fetchone()
    if not s: fail("Admissions are not set up for this campus and session yet (Admission Settings).", 400)
    no = next_application_no(cur, body.campus_id, body.academic_year_id, s["application_no_format"], today)
    parent = find_parent_account(cur, primary_phone(v))
    cols = [k for k in v.keys()]
    try:
        cur.execute(f"""INSERT INTO admission_applications (application_no, source, created_by, parent_user_id, {', '.join(cols)})
                        VALUES (%s, 'staff', %s, %s, {', '.join(['%s'] * len(cols))}) RETURNING id""",
                    [no, user_id, parent] + [v[k] for k in cols])
    except psycopg2.errors.UniqueViolation:
        db.rollback()
        fail("This child already has an active application for this session and campus.", 409)
    app_id = cur.fetchone()["id"]
    save_siblings(cur, app_id, sibs)
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s, 'create', NULL, 'draft', %s, TRUE, %s)""",
                (app_id, "Entered by admission staff" + (" and linked to the existing parent account" if parent else ""), user_id))
    msg = "Application saved as a draft. Upload the documents, then submit it."
    if submit:
        W = _wf()
        try:
            W.perform(cur, app_id, "submit", _claims_actor(user_id, db), today)
            msg = "Application submitted."
        except W.WorkflowError as e:
            db.commit()
            return ok(data={"id": app_id, "application_no": no, "parent_linked": bool(parent)},
                      message=f"Saved as a draft - it can't be submitted yet: {e}")
    db.commit()
    return ok(data={"id": app_id, "application_no": no, "parent_linked": bool(parent)}, message=msg)


@router.put("/applications/{app_id}")
def update_application(app_id: int, body: ApplicationIn, user_id: int = Depends(require_permission("admissions.application_edit")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    import psycopg2
    cur = get_cur(db)
    a = _get_app(cur, app_id, campus_id)
    if a["status"] not in EDITABLE:
        fail("Details can't be changed at this stage.", 409)
    body.campus_id = a["campus_id"]                       # campus / session can't be moved by an edit
    body.academic_year_id = a["academic_year_id"]
    perms = _user_perms(cur, user_id)
    # without the contact / special-needs permissions the form only had masked values: keep what is stored
    if "admissions.application_contact_details" not in perms:
        for k in CONTACT_FIELDS:
            if hasattr(body, k): setattr(body, k, a.get(k))
    if "admissions.application_special_needs" not in perms:
        body.has_disability, body.disability_types, body.disability_details = bool(a.get("has_disability")), list(a.get("disability_types") or []), a.get("disability_details")
    v = validate_application(cur, body, get_processing_date(db))
    v.pop("campus_id"); v.pop("academic_year_id")
    save_siblings(cur, app_id, resolve_siblings(cur, body.sibling_enrollment_nos))
    sets = ", ".join(f"{k}=%s" for k in v) + ", updated_at=fn_admission_now()"
    if not a["parent_user_id"]:
        p = find_parent_account(cur, primary_phone({**a, **v}))
        if p: sets += f", parent_user_id={int(p)}"
    try:
        cur.execute(f"UPDATE admission_applications SET {sets} WHERE id=%s", list(v.values()) + [app_id])
    except psycopg2.errors.UniqueViolation:
        db.rollback()
        fail("This child already has another active application for this session and campus.", 409)
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s, 'edit', %s, %s, 'Details updated', TRUE, %s)""", (app_id, a["status"], a["status"], user_id))
    db.commit()
    return ok(message="Application updated.")


@router.get("/applications")
def list_applications(academic_year_id: Optional[int] = Query(None), campus: Optional[int] = Query(None),
                      class_name: Optional[str] = Query(None), status: Optional[str] = Query(None),
                      q: Optional[str] = Query(None), page: int = Query(1, ge=1), per_page: int = Query(20, ge=5, le=100),
                      user_id: int = Depends(require_permission("admissions.application_list_view")), db=Depends(get_db),
                      campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    w, args = ["TRUE"], []
    if cid: w.append("a.campus_id=%s"); args.append(cid)
    if academic_year_id: w.append("a.academic_year_id=%s"); args.append(academic_year_id)
    if class_name: w.append("lower(a.class_name)=lower(%s)"); args.append(class_name)
    if status:
        if status in GROUPS: w.append("a.status = ANY(%s)"); args.append(GROUPS[status])
        else: w.append("a.status=%s"); args.append(status)
    if q:
        like = "%" + q.strip().lower() + "%"
        digits = re.sub(r"\D", "", q)
        w.append("""(lower(a.application_no) LIKE %s OR lower(a.student_first_name || ' ' || a.student_last_name) LIKE %s
                     OR lower(COALESCE(a.father_name,'')) LIKE %s""" + (" OR a.father_phone LIKE %s OR a.mother_phone LIKE %s OR a.guardian_phone LIKE %s" if digits else "") + ")")
        args += [like, like, like] + (["%" + digits[-10:] + "%"] * 3 if digits else [])
    W_ = " AND ".join(w)
    cur.execute(f"SELECT COUNT(*) AS n FROM admission_applications a WHERE {W_}", args)
    total = cur.fetchone()["n"]
    cur.execute(f"""SELECT a.id, a.application_no, a.student_first_name || ' ' || a.student_last_name AS student, a.gender,
                           a.date_of_birth, a.class_name, a.status, a.source, a.submitted_at, a.updated_at,
                           COALESCE(a.father_name, a.mother_name, a.guardian_name) AS parent_name,
                           CASE a.primary_guardian WHEN 'father' THEN a.father_phone WHEN 'mother' THEN a.mother_phone ELSE a.guardian_phone END AS phone,
                           ay.name AS session, c.name AS campus, a.waiting_list_position,
                           (SELECT COUNT(*) FROM admission_documents d WHERE d.application_id=a.id AND d.status<>'verified') AS docs_open,
                           u.first_name || ' ' || u.last_name AS assigned_name
                    FROM admission_applications a JOIN academic_years ay ON ay.id=a.academic_year_id JOIN campuses c ON c.id=a.campus_id
                    LEFT JOIN users u ON u.id=a.assigned_to
                    WHERE {W_} ORDER BY a.updated_at DESC, a.id DESC LIMIT %s OFFSET %s""", args + [per_page, (page - 1) * per_page])
    W = _wf()
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["status_label"] = W.STATUS_LABELS.get(d["status"], d["status"])
        for k in ("date_of_birth", "submitted_at", "updated_at"):
            if d.get(k): d[k] = str(d[k])
        rows.append(d)
    if "admissions.application_contact_details" not in _user_perms(cur, user_id):
        for d in rows:
            if d.get("phone"): d["phone"] = _mask(d["phone"])
    return ok(data={"items": rows, "total": total, "page": page, "per_page": per_page,
                    "statuses": [{"key": k, "label": v} for k, v in W.STATUS_LABELS.items()]})


@router.get("/applications/{app_id}")
def get_application(app_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db),
                    campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    W = _wf()
    a = _get_app(cur, app_id, campus_id)
    if a["status"] == "awaiting_approval" and _settle_finished_approval(cur, db, app_id, user_id):
        a = _get_app(cur, app_id, campus_id)              # approved / rejected in the chain elsewhere - now applied
    staff = "admissions.application_list_view" in _user_perms(cur, user_id)
    mine = _assignment(cur, user_id, app_id)
    if not staff and not (mine["examiner"] or mine["panel"]):
        fail("You don't have access to this application.", 403)
    today = get_processing_date(db)
    cur.execute("""SELECT d.id, d.document_name, d.original_name, d.mime_type, d.file_size, d.status, d.remarks, d.uploaded_at, d.verified_at,
                          u.first_name || ' ' || u.last_name AS verified_by_name
                   FROM admission_documents d LEFT JOIN users u ON u.id=d.verified_by WHERE d.application_id=%s ORDER BY d.id""", (app_id,))
    docs = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM admission_tests WHERE application_id=%s ORDER BY id", (app_id,))
    tests = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT i.*, p.name AS panel_name,
                          (SELECT array_agg(u.first_name || ' ' || u.last_name ORDER BY u.first_name) FROM users u WHERE u.id = ANY(i.panel_user_ids)) AS panel_names
                   FROM admission_interviews i LEFT JOIN admission_interview_panels p ON p.id=i.panel_id
                   WHERE i.application_id=%s ORDER BY i.id""", (app_id,))
    interviews = [dict(r) for r in cur.fetchall()]
    for i_ in interviews: i_["panel_names"] = list(i_["panel_names"] or [])
    cur.execute("""SELECT h.*, u.first_name || ' ' || u.last_name AS acted_by_name FROM admission_status_history h
                   LEFT JOIN users u ON u.id=h.acted_by WHERE h.application_id=%s ORDER BY h.id""", (app_id,))   # recording order
    history = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT name FROM academic_years WHERE id=%s", (a["academic_year_id"],)); a["session"] = cur.fetchone()["name"]
    cur.execute("SELECT name FROM campuses WHERE id=%s", (a["campus_id"],)); a["campus"] = cur.fetchone()["name"]
    if a["parent_user_id"]:
        cur.execute("SELECT first_name || ' ' || last_name AS name, login_phone FROM users WHERE id=%s", (a["parent_user_id"],))
        a["parent_account"] = dict(cur.fetchone() or {})
    cur.execute("SELECT required_documents FROM admission_settings WHERE campus_id=%s AND academic_year_id=%s", (a["campus_id"], a["academic_year_id"]))
    st = cur.fetchone()
    required = W.required_documents(dict(st) if st else {}, a)
    have = {d["document_name"].lower() for d in docs}
    actions = W.available_actions(cur, a, _claims_actor(user_id, db), today)
    approval = None
    cur.execute("""SELECT wi.id, wi.status, wd.name FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id=wi.workflow_id
                   WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s ORDER BY wi.created_at DESC LIMIT 1""",
                (WF_MODULE, WF_ENTITY, app_id))
    inst = cur.fetchone()
    if inst:
        cur.execute("""SELECT wsi.step_order, wsi.step_name, wsi.step_type, wsi.status, wsi.assigned_role, wsi.assigned_to_id,
                              wsi.actioned_at, wsi.note, ws.action_label, ws.reject_label, ws.can_reject,
                              au.first_name || ' ' || au.last_name AS actioned_by_name, tu.first_name || ' ' || tu.last_name AS assignee_name
                       FROM workflow_step_instances wsi JOIN workflow_steps ws ON ws.id=wsi.step_id
                       LEFT JOIN users au ON au.id=wsi.actioned_by LEFT JOIN users tu ON tu.id=wsi.assigned_to_id
                       WHERE wsi.instance_id=%s ORDER BY wsi.step_order""", (inst["id"],))
        steps = [dict(r) for r in cur.fetchall()]
        for s_ in steps:
            if s_.get("actioned_at"): s_["actioned_at"] = s_["actioned_at"].isoformat()
        cur.execute("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=%s", (user_id,))
        my_roles = {r["name"] for r in cur.fetchall()}
        cur_step = next((s_ for s_ in steps if s_["status"] == "pending"), None)
        can_act = bool(inst["status"] == "active" and a["status"] == "awaiting_approval" and cur_step and
                       (cur_step["assigned_to_id"] == user_id or cur_step["assigned_role"] in my_roles))
        approval = {"workflow": inst["name"], "status": inst["status"], "steps": steps, "can_act": can_act,
                    "current": cur_step}
        if inst["status"] == "active":
            actions = [x for x in actions if x["action"] not in ("approve", "reject")]

    def clean(o):
        for k, x in list(o.items()):
            if hasattr(x, "isoformat"): o[k] = x.isoformat()
            elif x.__class__.__name__ == "Decimal": o[k] = float(x)
        return o
    a = clean(a)
    a["status_label"] = W.STATUS_LABELS.get(a["status"], a["status"])
    a["editable"] = a["status"] in EDITABLE
    if not staff:
        actions = []                                     # examiner / panel member: only their own assessment
    open_iv = next((i for i in interviews if not i.get("recommendation")), None)
    a["my_assignment"] = {**mine, "staff": staff,
                          "can_record_interview": bool(open_iv and a["status"] == "interview_scheduled"
                                                       and (user_id in (open_iv.get("panel_user_ids") or []) or "admissions.interview_result_recording" in _user_perms(cur, user_id)))}
    a["siblings"] = siblings_of(cur, app_id)
    _perms = _user_perms(cur, user_id)
    protect_application(a, _perms)
    if "admissions.application_internal_notes" not in _perms:
        history = [h for h in history if not h.get("is_internal")]
    cur.execute("""SELECT DISTINCT wsi.step_name FROM workflow_step_instances wsi JOIN workflow_instances wi ON wi.id=wsi.instance_id
                   WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s""", (WF_MODULE, WF_ENTITY, app_id))
    _step_names = {r["step_name"] for r in cur.fetchall() if r["step_name"]}
    return ok(data={"application": a, "documents": [clean(d) for d in docs], "missing_documents": [r for r in required if r.lower() not in have],
                    "tests": [clean(t) for t in tests], "interviews": [clean(i) for i in interviews],
                    "history": [{**clean(h), "action_label": h["action"].replace("_", " ").capitalize(),
                                 "to_label": W.STATUS_LABELS.get(h["to_status"], h["to_status"]),
                                 "title": _timeline_entry(h, _step_names)[0] or W.STATUS_LABELS.get(h["to_status"], h["to_status"]),
                                 "remarks": _timeline_entry(h, _step_names)[1]} for h in history],
                    "actions": actions, "approval": approval})


@router.post("/applications/{app_id}/documents")
def upload_document(app_id: int, document_name: str = Form(...), file: UploadFile = File(...),
                    user_id: int = Depends(require_permission("admissions.document_upload")), db=Depends(get_db),
                    campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Upload (or replace) one document. A replaced document goes back to 'pending' verification."""
    cur = get_cur(db)
    a = _get_app(cur, app_id, campus_id)
    if a["status"] in ("admission_completed", "rejected", "withdrawn"): fail("This application is closed.", 409)
    name = (document_name or "").strip()
    if not name or len(name) > 100: fail("Name the document.", 400)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in DOC_TYPES: fail("Upload a PDF, JPG or PNG file.", 400)
    data = file.file.read(DOC_MAX_BYTES + 1)
    if len(data) > DOC_MAX_BYTES: fail("The file is larger than 5 MB.", 400)
    if not data: fail("The file is empty.", 400)
    sig = data[:8]
    if (ext == ".pdf" and not sig.startswith(b"%PDF")) or (ext == ".png" and not sig.startswith(b"\x89PNG")) \
            or (ext in (".jpg", ".jpeg") and not sig.startswith(b"\xff\xd8")):
        fail("The file's contents don't match its type.", 400)
    folder = os.path.join(ADM_UPLOAD_DIR, str(app_id))
    os.makedirs(folder, exist_ok=True)
    fname = uuid.uuid4().hex + ext
    with open(os.path.join(folder, fname), "wb") as fh:
        fh.write(data)
    rel = f"{app_id}/{fname}"
    cur.execute("SELECT id, file_path FROM admission_documents WHERE application_id=%s AND lower(document_name)=lower(%s)", (app_id, name))
    old = cur.fetchone()
    if old:
        cur.execute("""UPDATE admission_documents SET file_path=%s, original_name=%s, mime_type=%s, file_size=%s, status='pending',
                       remarks=NULL, verified_by=NULL, verified_at=NULL, uploaded_by=%s, uploaded_at=fn_admission_now() WHERE id=%s""",
                    (rel, file.filename, DOC_TYPES[ext], len(data), user_id, old["id"]))
        try: os.remove(os.path.join(ADM_UPLOAD_DIR, old["file_path"]))
        except OSError: pass
    else:
        cur.execute("""INSERT INTO admission_documents (application_id, document_name, file_path, original_name, mime_type, file_size, uploaded_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)""", (app_id, name, rel, file.filename, DOC_TYPES[ext], len(data), user_id))
    db.commit()
    return ok(message=f"{name} uploaded.")


@router.get("/applications/{app_id}/documents/{doc_id}")
def download_document(app_id: int, doc_id: int, user_id: int = Depends(require_permission("admissions.application_list_view")), db=Depends(get_db),
                      campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _get_app(cur, app_id, campus_id)
    cur.execute("SELECT * FROM admission_documents WHERE id=%s AND application_id=%s", (doc_id, app_id))
    d = cur.fetchone()
    if not d: fail("Document not found.", 404)
    path = os.path.realpath(os.path.join(ADM_UPLOAD_DIR, d["file_path"]))
    if not path.startswith(os.path.realpath(ADM_UPLOAD_DIR)) or not os.path.exists(path):
        fail("File not found on the server.", 404)
    return FileResponse(path, media_type=d["mime_type"] or "application/octet-stream", filename=d["original_name"] or os.path.basename(path))


# ---------------------------------------------------------------- Workflow Builder approval chain
WF_MODULE, WF_ENTITY = "admissions", "admission_application"
LEAVES_DECISION = {"hold", "waitlist", "request_evaluation", "return_correction", "withdraw", "approve", "reject"}


def _engine():
    from app.utils.workflow_engine import WorkflowEngine
    return WorkflowEngine()


def _active_chain(cur, app_id):
    cur.execute("""SELECT wi.id, wd.name FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id=wi.workflow_id
                   WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s AND wi.status='active'""", (WF_MODULE, WF_ENTITY, app_id))
    r = cur.fetchone()
    return dict(r) if r else None


def _chain_context(cur, app):
    """Fields the Workflow Builder's assignment / step conditions can use (keys match workflow_condition_fields)."""
    cur.execute("SELECT result, percentage FROM admission_tests WHERE application_id=%s ORDER BY id DESC LIMIT 1", (app["id"],))
    t = cur.fetchone() or {}
    cur.execute("SELECT recommendation FROM admission_interviews WHERE application_id=%s ORDER BY id DESC LIMIT 1", (app["id"],))
    i = cur.fetchone() or {}
    cur.execute("SELECT start_date FROM academic_years WHERE id=%s", (app["academic_year_id"],))
    y = cur.fetchone() or {}
    if not y.get("start_date"):
        cur.execute("SELECT fn_admission_now()::date AS d"); y = {"start_date": cur.fetchone()["d"]}
    on = y["start_date"]                                # age on the session start date (else the processing date)
    dob = app["date_of_birth"]
    age = round((on - dob).days / 365.25, 1) if dob else None
    return {"entity_id": app["id"], "adm_class": app["class_name"], "adm_campus": app["campus_id"], "adm_gender": app["gender"],
            "adm_age": age, "adm_test_result": t.get("result") or "none",
            "adm_test_pct": float(t["percentage"]) if t.get("percentage") is not None else None,
            "adm_interview": i.get("recommendation") or "none", "adm_source": app["source"],
            "adm_has_previous_school": "true" if app.get("previous_school") else "false"}


def _start_chain(cur, db, app_id, user_id):
    """Start the assigned approval workflow. Returns its name, or None when none is assigned (principal decides directly)."""
    app = _wf().load(cur, app_id)
    inst = _engine().trigger(db, module=WF_MODULE, entity_type=WF_ENTITY, entity_id=app_id, initiated_by=user_id,
                             submitter_id=app.get("parent_user_id") or user_id, context=_chain_context(cur, app))
    if not inst:
        return None
    cur.execute("SELECT name FROM workflow_definitions WHERE id=%s", (inst["workflow_id"],))
    name = cur.fetchone()["name"]
    if inst["status"] == "completed":           # every step skipped by its conditions -> counts as approved
        return name + " (no steps applied)"
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s,'approval_chain',%s,%s,%s,TRUE,%s)""",
                (app_id, app["status"], app["status"], f"Approval workflow started: {name} - first step: {inst.get('current_step')}", user_id))
    return name


def _after_send_for_approval(cur, db, app_id, user_id):
    """
    Called whenever an application reaches the decision stage - by the 'Send for approval'
    button OR automatically after documents are verified - so the Workflow Builder chain
    always starts. Returns a note for the message.
    """
    W = _wf()
    name = _start_chain(cur, db, app_id, user_id)
    if not name:
        return ""                                            # no workflow assigned: principal decides directly
    if name.endswith("(no steps applied)"):
        W.perform(cur, app_id, "approve", W.actor(None, system=True), get_processing_date(db),
                  remarks=f"Approved: no approval step applied in '{name[:-19]}'")
        return f" No approval step applied in '{name[:-19]}', so it is approved." + _after_approved(cur, db, app_id, user_id)
    return f" Approval workflow: {name}."


class ActionIn(BaseModel):
    action: str
    remarks: Optional[str] = None
    internal: bool = False
    override: bool = False


@router.post("/applications/{app_id}/action")
def application_action(app_id: int, body: ActionIn, user_id: int = Depends(require_permission("admissions.application_list_view")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Every status change goes through the workflow service (permissions + conditions checked there)."""
    cur = get_cur(db)
    W = _wf()
    _get_app(cur, app_id, campus_id)
    if body.action in ("payment_partial", "payment_verified"):
        fail("Payments are confirmed by finance through fee verification.", 403)
    chain = _active_chain(cur, app_id)
    if chain and body.action in ("approve", "reject"):
        fail(f"This application is in the approval workflow '{chain['name']}' - approve or reject it from the Approval steps.", 409)
    try:
        to = W.perform(cur, app_id, body.action, _claims_actor(user_id, db), get_processing_date(db),
                       remarks=body.remarks, internal=body.internal, override=body.override)
    except W.WorkflowError as e:
        db.rollback()
        fail(str(e), e.status_code)
    note = ""
    if body.action == "send_for_approval":
        note = _after_send_for_approval(cur, db, app_id, user_id)
        to = W.load(cur, app_id)["status"]
    elif body.action == "approve":
        note = _after_approved(cur, db, app_id, user_id)
        to = W.load(cur, app_id)["status"]
    elif chain and body.action in LEAVES_DECISION:
        _engine().cancel(db, WF_MODULE, WF_ENTITY, app_id)      # leaves the decision stage; restarts on the next send
        note = " The running approval workflow was stopped."
    db.commit()
    return ok(message=f"Application moved to: {W.STATUS_LABELS[to]}.{note}", data={"status": to})


class ApprovalIn(BaseModel):
    decision: str                   # approve | reject
    note: Optional[str] = None


def _settle_finished_approval(cur, db, app_id, user_id):
    """
    The approval workflow can finish OUTSIDE this module (e.g. approved from the Work Queue's generic box), leaving
    the application 'awaiting_approval'. When its workflow is already completed / rejected, finish the admission
    step the normal way (approved -> admitted + voucher + notifications; rejected -> rejected).
    Returns a message when it settled something, else None. Never raises (a full class just stays waiting).
    """
    W = _wf()
    cur.execute("SELECT status FROM admission_applications WHERE id=%s", (app_id,))
    a = cur.fetchone()
    if not a or a["status"] != "awaiting_approval":
        return None
    cur.execute("""SELECT wi.status FROM workflow_instances wi WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s
                   ORDER BY wi.created_at DESC, wi.id DESC LIMIT 1""", (WF_MODULE, WF_ENTITY, app_id))
    inst = cur.fetchone()
    if not inst or inst["status"] not in ("completed", "rejected"):
        return None
    cur.execute("""SELECT wsi.step_name, wsi.note FROM workflow_step_instances wsi JOIN workflow_instances wi ON wi.id=wsi.instance_id
                   WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s AND wsi.status IN ('approved','rejected')
                   ORDER BY wsi.actioned_at DESC NULLS LAST, wsi.step_order DESC LIMIT 1""", (WF_MODULE, WF_ENTITY, app_id))
    last = cur.fetchone() or {}
    label = (last.get("step_name") or "Approval") + (f" - {last['note']}" if last.get("note") else "")
    system = W.actor(None, system=True)
    try:
        cur.execute("SAVEPOINT settle_approval")
        if inst["status"] == "rejected":
            W.perform(cur, app_id, "reject", system, get_processing_date(db), remarks=f"{label} (rejected in the approval chain)")
            msg = "Application rejected."
        else:
            W.perform(cur, app_id, "approve", system, get_processing_date(db), remarks=f"{label}: approved")
            msg = "Approved - the application is admitted." + _after_approved(cur, db, app_id, user_id)
        cur.execute("RELEASE SAVEPOINT settle_approval")
        db.commit()
        return msg
    except W.WorkflowError as e:
        cur.execute("ROLLBACK TO SAVEPOINT settle_approval")
        print(f"[admissions] approval finished but couldn't be applied to application {app_id}: {e}")
        return None


@router.post("/applications/{app_id}/approval")
def approval_step(app_id: int, body: ApprovalIn, user_id: int = Depends(require_permission("admissions.application_list_view")),
                  claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    The current approver acts on their step of the Workflow Builder chain.
    Last step approved -> application Approved (if a seat is free); any step rejected -> Rejected.
    """
    cur = get_cur(db)
    W = _wf()
    app = _get_app(cur, app_id, campus_id)
    if app["status"] != "awaiting_approval":
        fail("This application is not waiting for approval.", 409)
    if body.decision not in ("approve", "reject"):
        fail("Choose approve or reject.", 400)
    note = (body.note or "").strip()
    if body.decision == "reject" and not note:
        fail("Give a reason for the rejection.", 400)
    roles = (claims or {}).get("roles") or []
    # the CURRENT step is the lowest pending one (the engine creates every step as 'pending' up front),
    # and only its assignee may act - a later approver can't skip ahead
    cur.execute("""SELECT wsi.step_name, wsi.assigned_to_id, wsi.assigned_role, ws.can_reject FROM workflow_step_instances wsi
                   JOIN workflow_instances wi ON wi.id=wsi.instance_id JOIN workflow_steps ws ON ws.id=wsi.step_id
                   WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s AND wi.status='active' AND wsi.status='pending'
                   ORDER BY wsi.step_order LIMIT 1""", (WF_MODULE, WF_ENTITY, app_id))
    step = cur.fetchone()
    if not step:
        settled = _settle_finished_approval(cur, db, app_id, user_id)
        if settled:
            return ok(message=settled)
        fail("No approval step is waiting.", 409)
    if not (step["assigned_to_id"] == user_id or (step["assigned_role"] and step["assigned_role"] in roles)):
        fail(f"The current step ('{step['step_name']}') isn't assigned to you.", 403)
    if body.decision == "reject" and not step["can_reject"]:
        fail("This step can't reject - only approve.", 400)
    cur.execute("SELECT COALESCE(MAX(id), 0) AS m FROM admission_status_history WHERE application_id=%s", (app_id,))
    _history_before = cur.fetchone()["m"]
    res = _engine().advance(db, WF_MODULE, WF_ENTITY, app_id, body.decision, user_id, note) or {}
    if res.get("error"):
        db.rollback(); fail(res["error"], 400)
    system = W.actor(None, system=True)
    today = get_processing_date(db)
    try:
        if res.get("status") == "rejected":
            W.perform(cur, app_id, "reject", system, today, remarks=f"{step['step_name']}: {note}")
            msg = "Application rejected."
        elif res.get("status") == "completed":
            W.perform(cur, app_id, "approve", system, today, remarks=f"{step['step_name']}: approved" + (f" - {note}" if note else ""))
            msg = "Approved - the application is admitted." + _after_approved(cur, db, app_id, user_id)
        else:
            cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                           VALUES (%s,'approval_step','awaiting_approval','awaiting_approval',%s,TRUE,%s)""",
                        (app_id, f"{step['step_name']}: approved" + (f" - {note}" if note else "") + f". Next: {res.get('next_step')}", user_id))
            msg = f"Step approved. Next: {res.get('next_step')}."
    except W.WorkflowError as e:
        db.rollback()                       # e.g. class full - the step stays pending, nothing changes
        fail(str(e), e.status_code)
    # the decision was applied by the system on the approver's behalf: show the approver on the timeline
    cur.execute("""UPDATE admission_status_history SET acted_by=%s
                   WHERE application_id=%s AND id > %s AND acted_by IS NULL""", (user_id, app_id, _history_before))
    db.commit()
    return ok(message=msg)


class AssignIn(BaseModel):
    assigned_to: Optional[int] = None


@router.put("/applications/{app_id}/assign")
def assign_application(app_id: int, body: AssignIn, user_id: int = Depends(require_permission("admissions.application_assign")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _get_app(cur, app_id, campus_id)
    cur.execute("UPDATE admission_applications SET assigned_to=%s, updated_at=fn_admission_now() WHERE id=%s", (body.assigned_to, app_id))
    db.commit()
    return ok(message="Assigned.")



# =============================================================================
# Review tools: documents, admission test, interview
# (each step that changes the status goes through the workflow service)
# =============================================================================
from datetime import datetime

REVIEW_STAGES = ("submitted", "initial_verification", "document_verification", "documents_rejected", "correction_required")


def _start_review_if_submitted(cur, db, app, user_id):
    """Reviewing a document of a just-submitted application starts its review first (status + timeline stay right)."""
    if app["status"] == "submitted":
        _do(cur, db, app["id"], "start_review", user_id, remarks="Review started with document verification")
        app["status"] = "initial_verification"
    return app


def _all_docs_verified(cur, db, app_id):
    W = _wf()
    return not W.check(cur, W.load(cur, app_id), "documents_verified", get_processing_date(db))


def _docs_verified_entry(cur, app_id, status, user_id):
    """The single timeline entry written when the last document is verified."""
    cur.execute("SELECT document_name FROM admission_documents WHERE application_id=%s ORDER BY id", (app_id,))
    names = [r["document_name"] for r in cur.fetchall()]
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s, 'documents_verified', %s, %s, %s, FALSE, %s)""",
                (app_id, status, status, f"All documents verified ({len(names)}): " + ", ".join(names), user_id))


def _auto_advance(cur, db, app_id, user_id):
    """
    Once every required document is verified, move the application on by itself:
    initial verification -> document verification (if the age check passes), and on
    to the principal when the session needs neither a test nor an interview.
    Returns a short note of what happened (or why it stopped).
    """
    W = _wf()
    act = _claims_actor(user_id, db)
    today = get_processing_date(db)
    app = W.load(cur, app_id)
    if W.check(cur, app, "documents_verified", today):
        return ""                                            # not all verified yet
    note = "Moved on automatically after document verification"
    moved = []
    for action in ("resubmit_documents", "verify_information", "send_for_approval"):
        app = W.load(cur, app_id)
        spec = W.ACTIONS[action]
        if app["status"] not in spec["from"]:
            continue
        if action == "send_for_approval":
            s = W._settings(cur, app)
            if s.get("test_required") or s.get("interview_required"):
                break                                        # next step is scheduling the test / interview
        try:
            W.perform(cur, app_id, action, act, today, remarks=note, internal=False)
            moved.append(W.STATUS_LABELS[spec["to"]])
            if action == "send_for_approval":                  # start the Workflow Builder chain, same as the button
                chain_note = _after_send_for_approval(cur, db, app_id, user_id)
                return " Moved on to: " + moved[-1] + "." + chain_note
        except W.WorkflowError as e:
            if e.status_code == 403:                         # this user can't take that step - leave it for someone who can
                break
            return f" It stays at '{W.STATUS_LABELS[app['status']]}': {e}"
    joined = _join_test_session(cur, db, app_id, user_id)
    if moved or joined:
        return (" Moved on to: " + moved[-1] + "." if moved else "") + joined
    return ""


class DocReviewIn(BaseModel):
    status: str                    # verified | rejected | resubmission_required
    remarks: Optional[str] = None


@router.put("/applications/{app_id}/documents/{doc_id}/review")
def review_document(app_id: int, doc_id: int, body: DocReviewIn, user_id: int = Depends(require_permission("admissions.document_verification")),
                    db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    a = _get_app(cur, app_id, campus_id)
    if a["status"] not in REVIEW_STAGES:
        fail("Documents can be reviewed while the application is under verification.", 409)
    if body.status not in ("verified", "rejected", "resubmission_required"):
        fail("Choose verified, rejected or resubmission required.", 400)
    remarks = (body.remarks or "").strip() or None
    if body.status != "verified" and not remarks:
        fail("Tell the parent what is wrong with this document.", 400)
    a = _start_review_if_submitted(cur, db, a, user_id)
    was_all = _all_docs_verified(cur, db, app_id)
    cur.execute("""UPDATE admission_documents SET status=%s, remarks=%s, verified_by=%s, verified_at=fn_admission_now()
                   WHERE id=%s AND application_id=%s RETURNING document_name""", (body.status, remarks, user_id, doc_id, app_id))
    r = cur.fetchone()
    if not r: fail("Document not found.", 404)
    label = {"verified": "verified", "rejected": "rejected", "resubmission_required": "needs to be uploaded again"}[body.status]
    note = ""
    if body.status != "verified":
        # a problem with a document: its own entry, with the reason for the parent
        cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                       VALUES (%s, 'document_review', %s, %s, %s, FALSE, %s)""",
                    (app_id, a["status"], a["status"], f"{r['document_name']} {label}: {remarks}", user_id))
        _brief = _app_brief(cur, app_id)
        _ask = "upload it again" if body.status == "resubmission_required" else "upload a correct one"
        _safe_notify(cur, lambda: _notify(cur, [_brief["parent_user_id"]],
            f"Document needed - {r['document_name']} ({_brief['application_no']})",
            f"Please {_ask} for {_brief['student']}'s application: {r['document_name']}. Reason: {remarks}. "
            f"Open My Admissions to upload it.", PARENT_LINK, "warning", app_id))
    elif not was_all and _all_docs_verified(cur, db, app_id):
        # the last document verified: ONE entry for all of them
        _docs_verified_entry(cur, app_id, a["status"], user_id)
        note = _auto_advance(cur, db, app_id, user_id)
    db.commit()
    return ok(message=f"{r['document_name']} {label}.{note}")


@router.post("/applications/{app_id}/documents/verify-all")
def verify_all_documents(app_id: int, user_id: int = Depends(require_permission("admissions.document_verification")), db=Depends(get_db),
                         campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    a = _get_app(cur, app_id, campus_id)
    if a["status"] not in REVIEW_STAGES:
        fail("Documents can be reviewed while the application is under verification.", 409)
    a = _start_review_if_submitted(cur, db, a, user_id)
    cur.execute("""UPDATE admission_documents SET status='verified', remarks=NULL, verified_by=%s, verified_at=fn_admission_now()
                   WHERE application_id=%s AND status='pending' RETURNING document_name""", (user_id, app_id))
    names = [x["document_name"] for x in cur.fetchall()]
    note = ""
    if names and _all_docs_verified(cur, db, app_id):
        _docs_verified_entry(cur, app_id, a["status"], user_id)          # one entry for the whole set
        note = _auto_advance(cur, db, app_id, user_id)
    elif names:
        cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                       VALUES (%s, 'document_review', %s, %s, %s, TRUE, %s)""",
                    (app_id, a["status"], a["status"], "Verified: " + ", ".join(names) + " (others still need attention)", user_id))
    db.commit()
    return ok(message=(f"{len(names)} document(s) verified." if names else "No pending documents.") + note)


# ---------------------------------------------------------------- admission test
class TestSubjectIn(BaseModel):
    name: str
    max_marks: float
    passing_marks: float


class TestScheduleIn(BaseModel):
    scheduled_at: datetime
    room: Optional[str] = None
    examiner_id: Optional[int] = None
    subjects: List[TestSubjectIn]


def _do(cur, db, app_id, action, user_id, remarks=None, system=False):
    """system=True: the user's assignment (examiner / panel) was already checked by the endpoint."""
    W = _wf()
    try:
        act = W.actor(user_id, system=True) if system else _claims_actor(user_id, db)
        return W.perform(cur, app_id, action, act, get_processing_date(db), remarks=remarks)
    except W.WorkflowError as e:
        db.rollback()
        fail(str(e), e.status_code)


@router.post("/applications/{app_id}/test")
def schedule_test(app_id: int, body: TestScheduleIn, user_id: int = Depends(require_permission("admissions.admission_test_schedule")),
                  db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    import json
    cur = get_cur(db)
    _get_app(cur, app_id, campus_id)
    if not body.subjects: fail("Add at least one subject.", 400)
    subs = []
    for s in body.subjects:
        if not s.name.strip(): fail("Name every subject.", 400)
        if s.max_marks <= 0: fail(f"{s.name}: maximum marks must be more than 0.", 400)
        if not 0 <= s.passing_marks <= s.max_marks: fail(f"{s.name}: passing marks must be between 0 and the maximum.", 400)
        subs.append({"name": s.name.strip(), "max_marks": s.max_marks, "passing_marks": s.passing_marks, "obtained": None})
    if len({x["name"].lower() for x in subs}) != len(subs): fail("Each subject should be listed once.", 400)
    cur.execute("""INSERT INTO admission_tests (application_id, scheduled_at, room, examiner_id, subjects, total_max, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (app_id, body.scheduled_at, (body.room or "").strip() or None, body.examiner_id, json.dumps(subs),
                 sum(x["max_marks"] for x in subs), user_id))
    _do(cur, db, app_id, "schedule_test", user_id, remarks=f"Test on {body.scheduled_at:%d %b %Y %I:%M %p}" + (f", room {body.room}" if body.room else ""))
    db.commit()
    return ok(message="Admission test scheduled.")


class TestResultIn(BaseModel):
    absent: bool = False
    obtained: List[Optional[float]] = []     # same order as the scheduled subjects
    remarks: Optional[str] = None            # parent-visible
    internal_notes: Optional[str] = None


def _record_result(cur, db, app_id, test_id, absent, obtained, remarks, internal_notes, user_id, system=False):
    """Marks -> total, %, pass/fail (pass = every subject at or above its passing marks); moves the application on."""
    import json
    cur.execute("SELECT * FROM admission_tests WHERE id=%s AND application_id=%s", (test_id, app_id))
    t = cur.fetchone()
    if not t: fail("Test not found.", 404)
    if t["result"]: fail("Marks for this test are already recorded.", 409)
    subs = t["subjects"] if isinstance(t["subjects"], list) else json.loads(t["subjects"])
    if absent:
        result, tot, pct = "absent", 0, 0
    else:
        if len(obtained) != len(subs) or any(x is None for x in obtained): fail("Enter marks for every subject.", 400)
        for s_, o in zip(subs, obtained):
            if not 0 <= o <= s_["max_marks"]: fail(f"{s_['name']}: marks must be between 0 and {s_['max_marks']:g}.", 400)
            s_["obtained"] = o
        tot = sum(obtained)
        mx = sum(s_["max_marks"] for s_ in subs)
        pct = round(100.0 * tot / mx, 2) if mx else 0
        result = "pass" if all(s_["obtained"] >= s_["passing_marks"] for s_ in subs) else "fail"
    cur.execute("""UPDATE admission_tests SET subjects=%s, total_obtained=%s, percentage=%s, result=%s, remarks=%s, internal_notes=%s,
                   recorded_by=%s, recorded_at=fn_admission_now() WHERE id=%s""",
                (json.dumps(subs), tot, pct, result, (remarks or "").strip() or None, (internal_notes or "").strip() or None, user_id, test_id))
    _do(cur, db, app_id, "record_test", user_id,
        remarks="Absent from the admission test" if result == "absent" else f"Test result: {result.upper()} ({pct:g}%)", system=system)
    # no interview this session -> straight on to approval (and the Workflow Builder chain)
    W = _wf()
    app = W.load(cur, app_id)
    if not W._settings(cur, app).get("interview_required"):
        try:
            W.perform(cur, app_id, "send_for_approval", W.actor(user_id, system=True), get_processing_date(db),
                      remarks="Automatic: test result recorded, no interview this session")
            _after_send_for_approval(cur, db, app_id, user_id)
        except W.WorkflowError:
            pass
    return result, pct


@router.put("/applications/{app_id}/test/{test_id}/result")
def record_test_result(app_id: int, test_id: int, body: TestResultIn, user_id: int = Depends(require_permission("admissions.admission_test_marks_entry")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _get_app(cur, app_id, campus_id)
    result, pct = _record_result(cur, db, app_id, test_id, body.absent, body.obtained, body.remarks, body.internal_notes, user_id)
    db.commit()
    return ok(message=f"Test result recorded: {result} ({pct:g}%)." if result != "absent" else "Marked absent from the test.")


# ---------------------------------------------------------------- interview
class InterviewScheduleIn(BaseModel):
    scheduled_at: datetime
    location: Optional[str] = None          # blank = the panel's location
    panel_id: Optional[int] = None          # a coordinator-configured panel
    panel_user_ids: List[int] = []          # (only used when no panel is chosen)


@router.post("/applications/{app_id}/interview")
def schedule_interview(app_id: int, body: InterviewScheduleIn, user_id: int = Depends(require_permission("admissions.interview_schedule")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    app = _get_app(cur, app_id, campus_id)
    members, location, panel_name = body.panel_user_ids, (body.location or "").strip() or None, None
    if body.panel_id:
        cur.execute("""SELECT p.* FROM admission_interview_panels p JOIN admission_settings s ON s.id=p.setting_id
                       WHERE p.id=%s AND s.campus_id=%s AND s.academic_year_id=%s""", (body.panel_id, app["campus_id"], app["academic_year_id"]))
        panel = cur.fetchone()
        if not panel: fail("Choose a panel from this session.", 400)
        if not panel["is_active"]: fail(f"The panel '{panel['name']}' is no longer active.", 400)
        members, location, panel_name = list(panel["member_user_ids"]), location or panel["location"], panel["name"]
    elif _panels_exist(cur, app):
        fail("Choose an interview panel.", 400)
    if not members: fail("The interview needs at least one panel member.", 400)
    cur.execute("""INSERT INTO admission_interviews (application_id, scheduled_at, location, panel_user_ids, panel_id, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s)""", (app_id, body.scheduled_at, location, members, body.panel_id, user_id))
    _do(cur, db, app_id, "schedule_interview", user_id,
        remarks=f"Interview on {body.scheduled_at:%d %b %Y %I:%M %p}" + (f" at {location}" if location else "")
                + (f" ({panel_name})" if panel_name else ""))
    def tell():
        who = f"{app['student_first_name']} {app['student_last_name']}"
        _notify(cur, [app["parent_user_id"]], f"Interview scheduled - {app['application_no']}",
                f"{who}'s admission interview is on {_when(cur, body.scheduled_at)}" + (f" at {location}" if location else "")
                + ". Please arrive 10 minutes early with the child.", PARENT_LINK, "info", app_id)
        _notify(cur, members, f"Admission interview - {who}",
                f"You're on the interview panel{(' (' + panel_name + ')') if panel_name else ''} for {who} ({app['class_name']}) on "
                f"{_when(cur, body.scheduled_at)}" + (f" at {location}" if location else "") + ".", f"/admissions/applications/{app_id}", "info", app_id)
    _safe_notify(cur, tell)
    db.commit()
    return ok(message="Interview scheduled.")


class InterviewResultIn(BaseModel):
    recommendation: str                    # recommended | not_recommended | further_review
    assessment: Optional[str] = None       # staff only
    parent_note: Optional[str] = None      # parent-visible
    internal_remarks: Optional[str] = None # staff only


@router.put("/applications/{app_id}/interview/{iid}/result")
def record_interview_result(app_id: int, iid: int, body: InterviewResultIn, user_id: int = Depends(get_current_user_id),
                            db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _get_app(cur, app_id, campus_id)
    cur.execute("SELECT panel_user_ids FROM admission_interviews WHERE id=%s AND application_id=%s", (iid, app_id))
    iv = cur.fetchone()
    is_staff = "admissions.interview_result_recording" in _user_perms(cur, user_id)
    if not is_staff and not (iv and user_id in (iv["panel_user_ids"] or [])):
        fail("Only the interview panel can record this interview.", 403)
    if body.recommendation not in ("recommended", "not_recommended", "further_review"):
        fail("Choose a recommendation.", 400)
    cur.execute("SELECT recommendation FROM admission_interviews WHERE id=%s AND application_id=%s", (iid, app_id))
    i = cur.fetchone()
    if not i: fail("Interview not found.", 404)
    if i["recommendation"]: fail("This interview is already recorded.", 409)
    cur.execute("""UPDATE admission_interviews SET recommendation=%s, assessment=%s, parent_note=%s, internal_remarks=%s,
                   recorded_by=%s, recorded_at=fn_admission_now() WHERE id=%s""",
                (body.recommendation, (body.assessment or "").strip() or None, (body.parent_note or "").strip() or None,
                 (body.internal_remarks or "").strip() or None, user_id, iid))
    _do(cur, db, app_id, "record_interview", user_id, remarks="Interview: " + body.recommendation.replace("_", " "), system=not is_staff)
    db.commit()
    return ok(message="Interview recorded.")



# =============================================================================
# Published admission schedule + class-wise test sessions
# =============================================================================
import json as _json
from datetime import time as _time


def _setting_row(cur, campus_id, ay_id):
    cur.execute("SELECT * FROM admission_settings WHERE campus_id=%s AND academic_year_id=%s", (campus_id, ay_id))
    s = cur.fetchone()
    return dict(s) if s else None


def _session_for(cur, app):
    cur.execute("""SELECT ts.* FROM admission_test_sessions ts JOIN admission_settings s ON s.id=ts.setting_id
                   WHERE s.campus_id=%s AND s.academic_year_id=%s AND lower(ts.class_name)=lower(%s)""",
                (app["campus_id"], app["academic_year_id"], app["class_name"]))
    r = cur.fetchone()
    return dict(r) if r else None


def _join_test_session(cur, db, app_id, user_id):
    """
    An applicant whose documents are verified joins their class's combined test:
    a test row copied from the session, and the application moves to Test Scheduled.
    Returns a note ('' when nothing to do).
    """
    W = _wf()
    app = W.load(cur, app_id)
    if app["status"] not in ("document_verification", "further_evaluation"):
        return ""
    if not W._settings(cur, app).get("test_required"):
        return ""
    if W.check(cur, app, "documents_verified", get_processing_date(db)):
        return ""
    cur.execute("SELECT 1 FROM admission_tests WHERE application_id=%s AND result IS NULL", (app_id,))
    if cur.fetchone():
        return ""
    s = _session_for(cur, app)
    if not s:
        return f" Waiting for the {app['class_name']} admission test to be scheduled (Admission Tests)."
    subs = [{**x, "obtained": None} for x in (s["subjects"] if isinstance(s["subjects"], list) else _json.loads(s["subjects"]))]
    at = datetime.combine(s["test_date"], s["start_time"])
    cur.execute("SAVEPOINT join_test")                     # the test row and the status move succeed or fail together
    cur.execute("""INSERT INTO admission_tests (application_id, session_id, scheduled_at, room, examiner_id, subjects, total_max, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (app_id, s["id"], at, s["venue"], s["examiner_id"], _json.dumps(subs), sum(x["max_marks"] for x in subs), user_id))
    try:
        W.perform(cur, app_id, "schedule_test", W.actor(None, system=True), get_processing_date(db),
                  remarks=f"{app['class_name']} admission test on {at:%d %b %Y, %I:%M %p}" + (f" at {s['venue']}" if s["venue"] else ""))
    except W.WorkflowError as e:
        cur.execute("ROLLBACK TO SAVEPOINT join_test")
        return f" It couldn't join the test: {e}"
    cur.execute("RELEASE SAVEPOINT join_test")
    _safe_notify(cur, lambda: _notify(cur, [app["parent_user_id"]], f"Admission test scheduled - {app['application_no']}",
        f"{app['student_first_name']} {app['student_last_name']}'s {app['class_name']} admission test is on {_when(cur, at)}"
        + (f" at {s['venue']}" if s["venue"] else "") + "." + (f" {s['instructions']}" if s.get("instructions") else ""),
        PARENT_LINK, "info", app_id))
    return f" Added to the {app['class_name']} admission test on {at:%d %b %Y}."


class SessionIn(BaseModel):
    campus_id: Optional[int] = None
    academic_year_id: int
    class_name: str
    test_date: date
    start_time: _time = _time(9, 0)
    venue: Optional[str] = None
    examiner_id: Optional[int] = None
    subjects: List[TestSubjectIn]
    instructions: Optional[str] = None


def _validate_session(cur, body, s):
    if not body.subjects: fail("Add at least one subject.", 400)
    subs = []
    for x in body.subjects:
        if not x.name.strip(): fail("Name every subject.", 400)
        if x.max_marks <= 0: fail(f"{x.name}: maximum marks must be more than 0.", 400)
        if not 0 <= x.passing_marks <= x.max_marks: fail(f"{x.name}: passing marks must be between 0 and the maximum.", 400)
        subs.append({"name": x.name.strip(), "max_marks": x.max_marks, "passing_marks": x.passing_marks})
    if len({x["name"].lower() for x in subs}) != len(subs): fail("Each subject should be listed once.", 400)
    _check_schedule_dates(s.get("opens_on"), s.get("closes_on"), None, s.get("classes_commence_on"), [(body.class_name, body.test_date)],
                          tests_start=s.get("tests_start_on"))
    return subs


def _session_rows(cur, setting_id):
    cur.execute("""SELECT ts.*, u.first_name || ' ' || u.last_name AS examiner_name,
                          COUNT(t.id) AS candidates, COUNT(t.id) FILTER (WHERE t.result IS NOT NULL) AS marked,
                          COUNT(t.id) FILTER (WHERE t.result='pass') AS passed
                   FROM admission_test_sessions ts LEFT JOIN users u ON u.id=ts.examiner_id
                   LEFT JOIN admission_tests t ON t.session_id=ts.id
                   WHERE ts.setting_id=%s GROUP BY ts.id, u.id ORDER BY ts.test_date, ts.start_time, ts.class_name""", (setting_id,))
    out = []
    for r in cur.fetchall():
        d = dict(r)
        d["test_date"] = str(d["test_date"]); d["start_time"] = d["start_time"].strftime("%H:%M")
        for k in ("created_at", "updated_at"): d[k] = str(d[k])
        out.append(d)
    return out


@router.get("/test-sessions")
def list_sessions(academic_year_id: Optional[int] = Query(None), campus: Optional[int] = Query(None),
                  user_id: int = Depends(require_permission("admissions.admission_test_view")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    if not cid: fail("Choose a campus first.", 400)
    ay = academic_year_id or _active_year(cur, cid)
    s = _setting_row(cur, cid, ay)
    if not s:
        return ok(data={"configured": False, "sessions": [], "classes": []})
    cur.execute("SELECT class_name FROM admission_class_settings WHERE setting_id=%s AND is_open ORDER BY level NULLS LAST, class_name", (s["id"],))
    open_classes = [r["class_name"] for r in cur.fetchall()] or [x["name"] for x in _class_levels(cur, cid)]
    return ok(data={"configured": True, "test_required": s["test_required"], "sessions": _session_rows(cur, s["id"]),
                    "classes": open_classes, "setting": {"opens_on": str(s["opens_on"]) if s["opens_on"] else None,
                                                         "tests_start_on": str(s["tests_start_on"]) if s["tests_start_on"] else None,
                                                         "classes_commence_on": str(s["classes_commence_on"]) if s["classes_commence_on"] else None}})


@router.post("/test-sessions")
def create_session(body: SessionIn, user_id: int = Depends(require_permission("admissions.admission_test_schedule")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    import psycopg2
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, body.campus_id)
    s = _setting_row(cur, cid, body.academic_year_id)
    if not s: fail("Save the Admission Settings for this session first.", 400)
    if not s["test_required"]: fail("An admission test isn't required for this session (Admission Settings).", 400)
    if body.class_name.lower() not in {x["name"].lower() for x in _class_levels(cur, cid)}: fail(f"{body.class_name} is not a class on this campus.", 400)
    subs = _validate_session(cur, body, s)
    try:
        cur.execute("""INSERT INTO admission_test_sessions (setting_id, class_name, test_date, start_time, venue, examiner_id, subjects, instructions, created_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (s["id"], body.class_name, body.test_date, body.start_time, (body.venue or "").strip() or None, body.examiner_id,
                     _json.dumps(subs), (body.instructions or "").strip() or None, user_id))
    except psycopg2.errors.UniqueViolation:
        db.rollback(); fail(f"{body.class_name} already has a test session - edit it instead.", 409)
    sid = cur.fetchone()["id"]
    # everyone of this class already waiting (documents verified) joins now
    cur.execute("""SELECT id FROM admission_applications WHERE campus_id=%s AND academic_year_id=%s AND lower(class_name)=lower(%s)
                   AND status IN ('document_verification','further_evaluation')""", (cid, body.academic_year_id, body.class_name))
    joined = sum(1 for r in cur.fetchall() if _join_test_session(cur, db, r["id"], user_id).startswith(" Added"))
    if body.examiner_id:
        at0 = datetime.combine(body.test_date, body.start_time)
        _safe_notify(cur, lambda: _notify(cur, [body.examiner_id], f"You're the examiner - {body.class_name} admission test",
            f"{body.class_name} admission test on {_when(cur, at0)}" + (f" at {body.venue}" if body.venue else "")
            + f". {joined} candidate(s) so far; more join as their documents are verified.", f"/admissions/tests/{sid}", "info", sid))
    db.commit()
    return ok(data={"id": sid}, message=f"{body.class_name} test scheduled." + (f" {joined} waiting applicant(s) added." if joined else ""))


@router.put("/test-sessions/{session_id}")
def update_session(session_id: int, body: SessionIn, user_id: int = Depends(require_permission("admissions.admission_test_schedule")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""SELECT ts.*, s.campus_id, s.opens_on, s.closes_on, s.classes_commence_on, s.tests_start_on FROM admission_test_sessions ts
                   JOIN admission_settings s ON s.id=ts.setting_id WHERE ts.id=%s""", (session_id,))
    old = cur.fetchone()
    if not old: fail("Test session not found.", 404)
    enforce_same_campus(old["campus_id"], campus_id)
    body.class_name = old["class_name"]                                  # the class can't be changed
    subs = _validate_session(cur, body, dict(old))
    cur.execute("SELECT COUNT(*) AS n FROM admission_tests WHERE session_id=%s AND result IS NOT NULL", (session_id,))
    marked = cur.fetchone()["n"]
    if marked and _json.dumps(subs, sort_keys=True) != _json.dumps([{k: x[k] for k in ("name", "max_marks", "passing_marks")}
                                                                    for x in (old["subjects"] if isinstance(old["subjects"], list) else _json.loads(old["subjects"]))], sort_keys=True):
        fail("Marks are already entered for this test, so its subjects can't change.", 409)
    cur.execute("""UPDATE admission_test_sessions SET test_date=%s, start_time=%s, venue=%s, examiner_id=%s, subjects=%s, instructions=%s, updated_at=fn_admission_now()
                   WHERE id=%s""", (body.test_date, body.start_time, (body.venue or "").strip() or None, body.examiner_id, _json.dumps(subs),
                                    (body.instructions or "").strip() or None, session_id))
    at = datetime.combine(body.test_date, body.start_time)
    # candidates not yet marked follow the new date / venue / subjects
    cur.execute("""UPDATE admission_tests SET scheduled_at=%s, room=%s, examiner_id=%s,
                   subjects=(SELECT jsonb_agg(x || '{"obtained": null}') FROM jsonb_array_elements(%s::jsonb) x), total_max=%s
                   WHERE session_id=%s AND result IS NULL RETURNING application_id""",
                (at, (body.venue or "").strip() or None, body.examiner_id, _json.dumps(subs), sum(x["max_marks"] for x in subs), session_id))
    moved = [r["application_id"] for r in cur.fetchall()]
    changed = old["test_date"] != body.test_date or old["start_time"] != body.start_time or (old["venue"] or "") != (body.venue or "")
    if changed or (body.examiner_id and body.examiner_id != old["examiner_id"]):
        def tell():
            if moved and changed:
                cur.execute("SELECT parent_user_id, application_no, student_first_name || ' ' || student_last_name AS s FROM admission_applications WHERE id = ANY(%s)", (moved,))
                for r_ in cur.fetchall():
                    _notify(cur, [r_["parent_user_id"]], f"Admission test rescheduled - {r_['application_no']}",
                            f"{r_['s']}'s {old['class_name']} admission test is now on {_when(cur, at)}" + (f" at {body.venue}" if body.venue else "") + ".",
                            PARENT_LINK, "warning")
            _notify(cur, [body.examiner_id], f"{old['class_name']} admission test" + (" rescheduled" if changed else " - you're the examiner"),
                    f"{old['class_name']} admission test on {_when(cur, at)}" + (f" at {body.venue}" if body.venue else "") + f". {len(moved)} candidate(s) not yet marked.",
                    f"/admissions/tests/{session_id}", "info", session_id)
        _safe_notify(cur, tell)
    if moved and changed:
        for aid in moved:
            cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                           SELECT id, 'test_rescheduled', status, status, %s, FALSE, %s FROM admission_applications WHERE id=%s""",
                        (f"Admission test moved to {at:%d %b %Y, %I:%M %p}" + (f" at {body.venue}" if body.venue else ""), user_id, aid))
    db.commit()
    return ok(message=f"{old['class_name']} test updated." + (f" {len(moved)} applicant(s) moved to the new schedule." if moved else ""))


@router.delete("/test-sessions/{session_id}")
def delete_session(session_id: int, user_id: int = Depends(require_permission("admissions.admission_test_delete")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT ts.class_name, s.campus_id FROM admission_test_sessions ts JOIN admission_settings s ON s.id=ts.setting_id WHERE ts.id=%s", (session_id,))
    s = cur.fetchone()
    if not s: fail("Test session not found.", 404)
    enforce_same_campus(s["campus_id"], campus_id)
    cur.execute("SELECT COUNT(*) AS n FROM admission_tests WHERE session_id=%s", (session_id,))
    if cur.fetchone()["n"]: fail("Applicants are already in this test - change its date instead of deleting it.", 409)
    cur.execute("DELETE FROM admission_test_sessions WHERE id=%s", (session_id,))
    db.commit()
    return ok(message=f"{s['class_name']} test removed.")


@router.get("/test-sessions/{session_id}/candidates")
def session_candidates(session_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db),
                       campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    perms = _user_perms(cur, user_id)
    cur.execute("""SELECT ts.*, s.campus_id FROM admission_test_sessions ts JOIN admission_settings s ON s.id=ts.setting_id WHERE ts.id=%s""", (session_id,))
    ss = cur.fetchone()
    if not ss: fail("Test session not found.", 404)
    enforce_same_campus(ss["campus_id"], campus_id)
    is_examiner = ss["examiner_id"] == user_id
    if "admissions.admission_test_view" not in perms and not is_examiner:
        fail("Only the examiner of this test can open its marks sheet.", 403)
    cur.execute("""SELECT t.id AS test_id, t.result, t.percentage, t.subjects, t.remarks, a.id AS application_id, a.application_no,
                          a.student_first_name || ' ' || a.student_last_name AS student, a.gender, a.status
                   FROM admission_tests t JOIN admission_applications a ON a.id=t.application_id
                   WHERE t.session_id=%s AND a.status NOT IN ('withdrawn') ORDER BY a.student_first_name, a.student_last_name""", (session_id,))
    rows = []
    for r in cur.fetchall():
        d = dict(r); d["percentage"] = float(d["percentage"]) if d["percentage"] is not None else None
        rows.append(d)
    sess = dict(ss); sess["test_date"] = str(sess["test_date"]); sess["start_time"] = sess["start_time"].strftime("%H:%M")
    for k in ("created_at", "updated_at"): sess[k] = str(sess[k])
    return ok(data={"session": sess, "candidates": rows, "can_mark": "admissions.admission_test_marks_entry" in perms or is_examiner,
                    "is_examiner": is_examiner})


class MarkRow(BaseModel):
    application_id: int
    absent: bool = False
    obtained: List[Optional[float]] = []
    remarks: Optional[str] = None


class MarksIn(BaseModel):
    rows: List[MarkRow]


@router.put("/test-sessions/{session_id}/marks")
def save_session_marks(session_id: int, body: MarksIn, user_id: int = Depends(get_current_user_id),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Class-wise marks entry: all candidates in one go (all or nothing). Admission staff or the test's examiner."""
    cur = get_cur(db)
    cur.execute("SELECT ts.class_name, ts.examiner_id, s.campus_id FROM admission_test_sessions ts JOIN admission_settings s ON s.id=ts.setting_id WHERE ts.id=%s", (session_id,))
    ss = cur.fetchone()
    if not ss: fail("Test session not found.", 404)
    enforce_same_campus(ss["campus_id"], campus_id)
    staff = "admissions.admission_test_marks_entry" in _user_perms(cur, user_id)
    if not staff and ss["examiner_id"] != user_id:
        fail("Only the examiner of this test can enter its marks.", 403)
    done = {"pass": 0, "fail": 0, "absent": 0}
    for row in body.rows:
        if not row.absent and not any(x is not None for x in row.obtained):
            continue                                                     # left blank -> not marked yet
        cur.execute("SELECT id FROM admission_tests WHERE session_id=%s AND application_id=%s AND result IS NULL", (session_id, row.application_id))
        t = cur.fetchone()
        if not t:
            continue                                                     # already marked
        try:
            result, _ = _record_result(cur, db, row.application_id, t["id"], row.absent, row.obtained, row.remarks, None, user_id, system=not staff)
        except HTTPException as e:
            db.rollback()
            cur.execute("SELECT student_first_name || ' ' || student_last_name AS n FROM admission_applications WHERE id=%s", (row.application_id,))
            who = (cur.fetchone() or {}).get("n", "An applicant")
            fail(f"{who}: {e.detail['message']} Nothing was saved.", e.status_code)
        done[result] += 1
    db.commit()
    total = sum(done.values())
    return ok(data=done, message=(f"{total} result(s) saved: {done['pass']} passed, {done['fail']} failed, {done['absent']} absent."
                                  if total else "Nothing new to save."))


# ---------------------------------------------------------------- publish
@router.get("/schedule")
def get_schedule(academic_year_id: Optional[int] = Query(None), campus: Optional[int] = Query(None),
                 user_id: int = Depends(require_any_permission("admissions.admission_settings_view", "admissions.admission_test_view")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    """The season's admission schedule (what gets published)."""
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    if not cid: fail("Choose a campus first.", 400)
    ay = academic_year_id or _active_year(cur, cid)
    return ok(data=_schedule(cur, cid, ay))


def _schedule(cur, cid, ay):
    s = _setting_row(cur, cid, ay)
    if not s:
        return {"configured": False}
    cur.execute("SELECT name FROM academic_years WHERE id=%s", (ay,)); yname = cur.fetchone()["name"]
    cur.execute("SELECT name FROM campuses WHERE id=%s", (cid,)); cname = cur.fetchone()["name"]
    tests = [{"class_name": r["class_name"], "test_date": r["test_date"], "start_time": r["start_time"], "venue": r["venue"],
              "subjects": [x["name"] for x in r["subjects"]], "instructions": r["instructions"]} for r in _session_rows(cur, s["id"])]
    cur.execute("SELECT class_name FROM admission_class_settings WHERE setting_id=%s AND is_open ORDER BY level NULLS LAST", (s["id"],))
    open_classes = [r["class_name"] for r in cur.fetchall()]
    missing = []
    if not s["opens_on"]: missing.append("application start date")
    if not s["closes_on"]: missing.append("application end date")
    if s["interview_required"] and not s["interview_start_on"]: missing.append("interview start date")
    if not s["classes_commence_on"]: missing.append("commencement of classes")
    if s["test_required"] and not s["tests_start_on"]:
        missing.append("admission tests start date")
    f = lambda d: str(d) if d else None
    return {"configured": True, "session": yname, "campus": cname, "open_classes": open_classes,
            "application_start": f(s["opens_on"]), "application_end": f(s["closes_on"]),
            "tests_start": f(s["tests_start_on"]) if s["test_required"] else None,
            "tests": tests if s["test_required"] else [], "test_required": s["test_required"],
            "interview_start": f(s["interview_start_on"]) if s["interview_required"] else None, "interview_required": s["interview_required"],
            "classes_commence": f(s["classes_commence_on"]), "admission_fee": float(s["admission_fee"]),
            "required_documents": s["required_documents"], "published": s["is_published"], "published_at": f(s["published_at"]),
            "missing": missing}


class PublishIn(BaseModel):
    academic_year_id: int
    campus_id: Optional[int] = None
    publish: bool = True


@router.post("/schedule/publish")
def publish_schedule(body: PublishIn, user_id: int = Depends(require_permission("admissions.admission_schedule_publish")), db=Depends(get_db),
                     campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, body.campus_id)
    if not cid: fail("Choose a campus first.", 400)
    sch = _schedule(cur, cid, body.academic_year_id)
    if not sch["configured"]: fail("Save the Admission Settings first.", 400)
    if body.publish and sch["missing"]:
        fail("The schedule isn't complete yet. Missing: " + ", ".join(sch["missing"]) + ".", 400)
    cur.execute("SELECT id, published_at FROM admission_settings WHERE campus_id=%s AND academic_year_id=%s", (cid, body.academic_year_id))
    srow = cur.fetchone()
    first_time = body.publish and srow["published_at"] is None
    cur.execute("""UPDATE admission_settings SET is_published=%s, published_at=CASE WHEN %s THEN fn_admission_now() ELSE published_at END,
                   published_by=CASE WHEN %s THEN %s ELSE published_by END WHERE campus_id=%s AND academic_year_id=%s""",
                (body.publish, body.publish, body.publish, user_id, cid, body.academic_year_id))
    problems = []
    sent = _side_step(cur, "notifications", lambda: _announce_admissions(cur, srow["id"], cid, sch), problems) if first_time else 0
    _side_step(cur, "news post", lambda: _sync_news(cur, db, srow["id"], cid, sch, body.publish, user_id), problems)
    db.commit()
    note = (" Note: the " + " and ".join(problems) + " couldn't be created - see the server log.") if problems else ""
    if not body.publish:
        return ok(message="Admission schedule unpublished." + note)
    return ok(message=f"Admission schedule for {sch['session']} published." + (f" {sent or 0} people notified." if first_time and sent else "") + note,
              data={"notified": sent or 0, "problems": problems})


def _side_step(cur, name, fn, problems):
    """Run an extra step inside a savepoint: if it fails, only it is undone and the main action still succeeds."""
    import traceback
    cur.execute("SAVEPOINT side_step")
    try:
        result = fn()
        cur.execute("RELEASE SAVEPOINT side_step")
        return result
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT side_step")
        print(f"[admissions] {name} failed: {e}")
        traceback.print_exc()
        problems.append(name)
        return None


def _fmt_date(v, fmt):
    try:
        from app.utils.admission_form_pdf import fmt_date
        return fmt_date(v, fmt)
    except ImportError:
        return str(v)[:10] if v else "-"


def _sync_news(cur, db, setting_id, campus_id, sch, published, user_id):
    """
    The admission post in News & Announcements: created (through sp_create_announcement, like any post)
    on the first publication, kept in step on re-publish, hidden when unpublished. Linked to the
    admission announcement page and expiring after the last application date.
    """
    fmt_date = _fmt_date
    cur.execute("SELECT value FROM system_settings WHERE key='date_format' LIMIT 1")
    r = cur.fetchone(); dfmt = r["value"] if r and r["value"] else "DD/MM/YYYY"
    title = f"Admissions open - {sch['campus']} {sch['session']}"
    text = (f"Applications for session {sch['session']} are open from {fmt_date(sch['application_start'], dfmt)} "
            f"to {fmt_date(sch['application_end'], dfmt)}."
            + (f" Admission tests start from {fmt_date(sch['tests_start'], dfmt)}." if sch.get("tests_start") else "")
            + (f" Classes commence on {fmt_date(sch['classes_commence'], dfmt)}." if sch.get("classes_commence") else "")
            + f" Admission fee: Rs. {float(sch.get('admission_fee') or 0):,.0f}. Open for the full schedule and to apply.")
    link = f"/admission-news/{setting_id}"
    cur.execute("SELECT id FROM announcements WHERE source_type='admission' AND source_id=%s ORDER BY id DESC LIMIT 1", (setting_id,))
    existing = cur.fetchone()
    if existing:
        cur.execute("""UPDATE announcements SET title=%s, body=%s, end_date=%s, is_active=%s, link=%s, link_label='View admission details'
                       WHERE id=%s""", (title, text, sch["application_end"], bool(published), link, existing["id"]))
        return
    if not published:
        return
    # called exactly like the announcements module does (positions 10-11 left empty, as there);
    # the admission link / source / expiry are set on the new post right after
    cur.execute("""SELECT * FROM sp_create_announcement(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (title, text, "important", "all", None, user_id, str(get_processing_date(db)), str(sch["application_end"]),
                 "admission", None, None, None, [campus_id]))
    res = cur.fetchone()
    if res.get("error_msg"):
        print("[admissions news]", res["error_msg"])
        return
    # whatever the procedure stores for its own fields, the link / source are set explicitly here
    cur.execute("""UPDATE announcements SET link=%s, link_label='View admission details', source_type='admission', source_id=%s,
                   end_date=%s, target_campus_ids=%s, created_at=fn_admission_now() AT TIME ZONE 'UTC' WHERE id=%s""",
                (link, setting_id, sch["application_end"], [campus_id], res["id"]))


def _announce_admissions(cur, setting_id, campus_id, sch):
    """One in-app notification to every active user of the campus (and all-campus users), linking to the announcement page."""
    fmt_date = _fmt_date
    cur.execute("SELECT value FROM system_settings WHERE key='date_format' LIMIT 1")
    r = cur.fetchone(); dfmt = r["value"] if r and r["value"] else "DD/MM/YYYY"
    title = f"Admissions open - {sch['campus']} {sch['session']}"
    body = (f"Applications are open from {fmt_date(sch['application_start'], dfmt)} to {fmt_date(sch['application_end'], dfmt)}."
            + (f" Classes commence on {fmt_date(sch['classes_commence'], dfmt)}." if sch.get("classes_commence") else "")
            + " Tap to see the schedule and apply.")
    cur.execute("""INSERT INTO notifications (user_id, title, body, message, type, link, reference_id, reference_type, is_read, created_at)
                   SELECT u.id, %s, %s, %s, 'info', %s, %s, 'admission_announcement', FALSE, fn_admission_now()
                   FROM users u WHERE COALESCE(u.is_active, TRUE) AND (u.campus_id=%s OR u.campus_id IS NULL)""",
                (title, body, body, f"/admission-news/{setting_id}", setting_id, campus_id))
    return cur.rowcount



# =============================================================================
# Interview panels (configured by the academic coordinator - admission.panels)
# =============================================================================
def _panels_exist(cur, app):
    cur.execute("""SELECT 1 FROM admission_interview_panels p JOIN admission_settings s ON s.id=p.setting_id
                   WHERE s.campus_id=%s AND s.academic_year_id=%s AND p.is_active LIMIT 1""", (app["campus_id"], app["academic_year_id"]))
    return cur.fetchone() is not None


def _panel_rows(cur, setting_id):
    cur.execute("""SELECT p.*, (SELECT COUNT(*) FROM admission_interviews i WHERE i.panel_id=p.id) AS interviews
                   FROM admission_interview_panels p WHERE p.setting_id=%s ORDER BY p.is_active DESC, p.name""", (setting_id,))
    rows = [dict(r) for r in cur.fetchall()]
    ids = sorted({u for r in rows for u in r["member_user_ids"]})
    names = {}
    if ids:
        cur.execute("SELECT id, first_name || ' ' || last_name AS name FROM users WHERE id = ANY(%s)", (ids,))
        names = {r["id"]: r["name"] for r in cur.fetchall()}
    for r in rows:
        r["members"] = [{"id": u, "name": names.get(u, f"#{u}")} for u in r["member_user_ids"]]
        r["class_names"] = list(r["class_names"])
        for k in ("created_at", "updated_at"): r[k] = str(r[k])
    return rows


@router.get("/interview-panels")
def list_panels(academic_year_id: Optional[int] = Query(None), campus: Optional[int] = Query(None), class_name: Optional[str] = Query(None),
                user_id: int = Depends(require_any_permission("admissions.interview_panel_setup", "admissions.interview_schedule")), db=Depends(get_db),
                campus_id: Optional[int] = Depends(get_current_campus_id)):
    """All panels of the session; with class_name, also which one is the default for that class."""
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    if not cid: fail("Choose a campus first.", 400)
    ay = academic_year_id or _active_year(cur, cid)
    s = _setting_row(cur, cid, ay)
    if not s: return ok(data={"configured": False, "panels": []})
    rows = _panel_rows(cur, s["id"])
    default = None
    if class_name:
        act = [r for r in rows if r["is_active"]]
        default = next((r["id"] for r in act if class_name.lower() in [x.lower() for x in r["class_names"]]), None) \
            or next((r["id"] for r in act if not r["class_names"]), None)
    return ok(data={"configured": True, "interview_required": s["interview_required"], "panels": rows, "default_panel_id": default,
                    "classes": [x["name"] for x in _class_levels(cur, cid)]})


class PanelIn(BaseModel):
    campus_id: Optional[int] = None
    academic_year_id: int
    name: str
    member_user_ids: List[int]
    location: Optional[str] = None
    class_names: List[str] = []
    is_active: bool = True


def _validate_panel(cur, body, cid):
    name = (body.name or "").strip()
    if not name or len(name) > 80: fail("Name the panel.", 400)
    members = list(dict.fromkeys(body.member_user_ids))
    if not members: fail("Add at least one panel member.", 400)
    cur.execute("""SELECT u.id FROM users u WHERE u.id = ANY(%s) AND COALESCE(u.is_active, TRUE) AND (%s::int IS NULL OR u.campus_id=%s)""",
                (members, cid, cid))
    if len(cur.fetchall()) != len(members): fail("Panel members must be active staff of this campus.", 400)
    known = {x["name"].lower(): x["name"] for x in _class_levels(cur, cid)}
    classes = []
    for cl in body.class_names:
        if cl.lower() not in known: fail(f"{cl} is not a class on this campus.", 400)
        classes.append(known[cl.lower()])
    return name, members, classes


@router.post("/interview-panels")
def create_panel(body: PanelIn, user_id: int = Depends(require_permission("admissions.interview_panel_setup")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    import psycopg2
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, body.campus_id)
    s = _setting_row(cur, cid, body.academic_year_id)
    if not s: fail("Save the Admission Settings for this session first.", 400)
    name, members, classes = _validate_panel(cur, body, cid)
    try:
        cur.execute("""INSERT INTO admission_interview_panels (setting_id, name, member_user_ids, location, class_names, is_active, created_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (s["id"], name, members, (body.location or "").strip() or None, classes, body.is_active, user_id))
    except psycopg2.errors.UniqueViolation:
        db.rollback(); fail(f"A panel called '{name}' already exists.", 409)
    pid = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": pid}, message=f"Panel '{name}' created.")


@router.put("/interview-panels/{panel_id}")
def update_panel(panel_id: int, body: PanelIn, user_id: int = Depends(require_permission("admissions.interview_panel_setup")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    import psycopg2
    cur = get_cur(db)
    cur.execute("SELECT p.id, s.campus_id FROM admission_interview_panels p JOIN admission_settings s ON s.id=p.setting_id WHERE p.id=%s", (panel_id,))
    p = cur.fetchone()
    if not p: fail("Panel not found.", 404)
    enforce_same_campus(p["campus_id"], campus_id)
    name, members, classes = _validate_panel(cur, body, p["campus_id"])
    try:
        cur.execute("""UPDATE admission_interview_panels SET name=%s, member_user_ids=%s, location=%s, class_names=%s, is_active=%s,
                       updated_at=fn_admission_now() WHERE id=%s""",
                    (name, members, (body.location or "").strip() or None, classes, body.is_active, panel_id))
    except psycopg2.errors.UniqueViolation:
        db.rollback(); fail(f"A panel called '{name}' already exists.", 409)
    db.commit()
    return ok(message=f"Panel '{name}' saved. Interviews already scheduled keep their members.")


@router.delete("/interview-panels/{panel_id}")
def delete_panel(panel_id: int, user_id: int = Depends(require_permission("admissions.interview_panel_setup")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT p.name, s.campus_id FROM admission_interview_panels p JOIN admission_settings s ON s.id=p.setting_id WHERE p.id=%s", (panel_id,))
    p = cur.fetchone()
    if not p: fail("Panel not found.", 404)
    enforce_same_campus(p["campus_id"], campus_id)
    cur.execute("SELECT COUNT(*) AS n FROM admission_interviews WHERE panel_id=%s", (panel_id,))
    if cur.fetchone()["n"]: fail("This panel has interviews - deactivate it instead of deleting it.", 409)
    cur.execute("DELETE FROM admission_interview_panels WHERE id=%s", (panel_id,))
    db.commit()
    return ok(message=f"Panel '{p['name']}' deleted.")



# =============================================================================
# Phase 8 - admission fee: voucher on approval, payments, verification
# (the voucher is a normal fee invoice linked to the application; it is linked
#  to the student at registration and then shows in the student's fee history)
# =============================================================================
from datetime import timedelta


_NET_AMOUNT_CALCULATED = None


def _net_amount_is_calculated(cur):
    """True when fee_invoices.net_amount is a generated column (the database computes it)."""
    global _NET_AMOUNT_CALCULATED
    if _NET_AMOUNT_CALCULATED is None:
        cur.execute("""SELECT is_generated FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='fee_invoices' AND column_name='net_amount'""")
        r = cur.fetchone()
        _NET_AMOUNT_CALCULATED = bool(r and (r["is_generated"] or "").upper() == "ALWAYS")
    return _NET_AMOUNT_CALCULATED


def _after_approved(cur, db, app_id, user_id):
    """An application has just been approved: issue the admission fee voucher (or waive a zero fee)."""
    W = _wf()
    app = W.load(cur, app_id)
    if app["status"] != "approved" or app.get("fee_invoice_id"):
        return ""
    s = W._settings(cur, app)
    fee = float(s.get("admission_fee") or 0)
    system = W.actor(None, system=True)
    today = get_processing_date(db)
    if fee <= 0:
        W.perform(cur, app_id, "waive_fee", system, today, remarks="No admission fee this session")
        return " No admission fee this session - ready for registration."
    due = today + timedelta(days=int(s.get("fee_due_days") or 7))
    # net_amount is a calculated column (amount - discount + fine) in the school's database: never write it there
    cur.execute("""INSERT INTO fee_invoices (student_id, admission_application_id, amount, discount, fine, status, due_date,
                       issued_by, issued_at, invoice_no, month_year, notes, late_fee_type, late_fee_amount)
                   VALUES (NULL, %s, %s, 0, 0, 'unpaid', %s, %s, fn_admission_now(),
                           'INV-' || %s::text || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0'), %s, %s, 'none', 0)
                   RETURNING id, invoice_no""",
                (app_id, fee, due, user_id, today.year, f"{today:%Y-%m}", f"Admission fee - {app['application_no']}"))
    inv = cur.fetchone()
    if not _net_amount_is_calculated(cur):
        cur.execute("UPDATE fee_invoices SET net_amount=%s WHERE id=%s", (fee, inv["id"]))
    cur.execute("UPDATE admission_applications SET fee_invoice_id=%s WHERE id=%s", (inv["id"], app_id))
    W.perform(cur, app_id, "generate_voucher", system, today,
              remarks=f"Admission fee voucher {inv['invoice_no']}: Rs. {fee:,.0f}, due {due:%d %b %Y}")
    return f" Fee voucher {inv['invoice_no']} (Rs. {fee:,.0f}) issued."


def _fee_refresh(cur, db, invoice_id, user_id):
    """Invoice status by finance's own rule, then the application follows it."""
    from app.api.v1.finance import _refresh_invoice_status
    status = _refresh_invoice_status(cur, db, invoice_id)
    cur.execute("SELECT id, status FROM admission_applications WHERE fee_invoice_id=%s", (invoice_id,))
    a = cur.fetchone()
    if not a:
        return status
    W = _wf()
    system = W.actor(None, system=True)
    today = get_processing_date(db)
    if status == "paid" and a["status"] in ("fee_voucher_generated", "payment_partially_paid"):
        W.perform(cur, a["id"], "payment_verified", system, today, remarks="Admission fee paid and verified")
    elif status == "partial" and a["status"] == "fee_voucher_generated":
        W.perform(cur, a["id"], "payment_partial", system, today, remarks="Part of the admission fee paid")
    return status


def _fee_invoice(cur, invoice_id, campus_id):
    cur.execute("""SELECT fi.*, a.id AS application_id, a.campus_id, a.application_no, a.status AS application_status,
                          a.student_first_name || ' ' || a.student_last_name AS student, a.class_name, a.academic_year_id
                   FROM fee_invoices fi JOIN admission_applications a ON a.id=fi.admission_application_id WHERE fi.id=%s""", (invoice_id,))
    inv = cur.fetchone()
    if not inv: fail("Admission fee voucher not found.", 404)
    enforce_same_campus(inv["campus_id"], campus_id)
    return dict(inv)


@router.get("/fees")
def list_fees(status: Optional[str] = Query(None), q: Optional[str] = Query(None), academic_year_id: Optional[int] = Query(None),
              campus: Optional[int] = Query(None), user_id: int = Depends(require_permission("admissions.admission_fee_view")), db=Depends(get_db),
              campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Admission fee vouchers with what's paid, what's waiting for verification, and the status."""
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    w, args = ["fi.admission_application_id IS NOT NULL", "fi.status <> 'cancelled'"], []
    if cid: w.append("a.campus_id=%s"); args.append(cid)
    if academic_year_id: w.append("a.academic_year_id=%s"); args.append(academic_year_id)
    if status == "due": w.append("fi.status IN ('unpaid','overdue','partial')")
    elif status == "pending": w.append("EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id=fi.id AND p.review_status='pending')")
    elif status == "paid": w.append("fi.status='paid'")
    if q:
        like = "%" + q.strip().lower() + "%"
        w.append("(lower(fi.invoice_no) LIKE %s OR lower(a.application_no) LIKE %s OR lower(a.student_first_name || ' ' || a.student_last_name) LIKE %s)")
        args += [like, like, like]
    cur.execute(f"""SELECT fi.id, fi.invoice_no, fi.net_amount, fi.status, fi.due_date, fi.issued_at, a.id AS application_id, a.application_no,
                           a.student_first_name || ' ' || a.student_last_name AS student, a.class_name, a.status AS application_status,
                           COALESCE((SELECT SUM(amount_paid) FROM payments p WHERE p.invoice_id=fi.id AND p.review_status='verified'),0) AS paid,
                           (SELECT COUNT(*) FROM payments p WHERE p.invoice_id=fi.id AND p.review_status='pending') AS pending_payments
                    FROM fee_invoices fi JOIN admission_applications a ON a.id=fi.admission_application_id
                    WHERE {' AND '.join(w)} ORDER BY fi.issued_at DESC, fi.id DESC LIMIT 300""", args)
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["net_amount"] = float(d["net_amount"]); d["paid"] = float(d["paid"]); d["balance"] = round(d["net_amount"] - d["paid"], 2)
        for k in ("due_date", "issued_at"): d[k] = str(d[k]) if d[k] else None
        rows.append(d)
    return ok(data=rows)


@router.get("/fees/{invoice_id}")
def get_fee(invoice_id: int, user_id: int = Depends(require_permission("admissions.admission_fee_view")), db=Depends(get_db),
            campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    inv = _fee_invoice(cur, invoice_id, campus_id)
    cur.execute("""SELECT p.id, p.amount_paid, p.method, p.reference, p.notes, p.paid_at, p.review_status, p.rejected_reason,
                          (p.receipt_image IS NOT NULL) AS has_receipt, u.first_name || ' ' || u.last_name AS received_by_name
                   FROM payments p LEFT JOIN users u ON u.id=p.received_by WHERE p.invoice_id=%s ORDER BY p.id""", (invoice_id,))
    pays = [dict(r) for r in cur.fetchall()]
    for p_ in pays:
        p_["amount_paid"] = float(p_["amount_paid"]); p_["paid_at"] = str(p_["paid_at"]) if p_["paid_at"] else None
    for k in ("amount", "net_amount", "discount", "fine"): inv[k] = float(inv[k] or 0)
    for k in ("due_date", "issued_at", "paid_at"): inv[k] = str(inv[k]) if inv.get(k) else None
    s = _wf()._settings(cur, {"campus_id": inv["campus_id"], "academic_year_id": inv["academic_year_id"]})
    return ok(data={"invoice": {k: inv[k] for k in ("id", "invoice_no", "net_amount", "status", "due_date", "issued_at", "paid_at",
                                                    "application_id", "application_no", "student", "class_name", "application_status", "notes")},
                    "payments": pays, "allow_partial": bool(s.get("allow_partial_payment"))})


class CounterPaymentIn(BaseModel):
    amount: float
    method: str = "cash"
    reference: Optional[str] = None
    notes: Optional[str] = None


@router.post("/fees/{invoice_id}/payments")
def record_fee_payment(invoice_id: int, body: CounterPaymentIn, user_id: int = Depends(require_permission("admissions.admission_fee_collection")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Finance records a payment made at the counter - verified at once (finance is the one confirming it)."""
    cur = get_cur(db)
    inv = _fee_invoice(cur, invoice_id, campus_id)
    if inv["status"] in ("paid", "cancelled"): fail(f"This voucher is already {inv['status']}.", 400)
    if inv["application_status"] not in ("fee_voucher_generated", "payment_partially_paid"):
        fail("This application isn't waiting for its admission fee.", 409)
    if body.method not in ("cash", "bank_transfer", "cheque", "online"): fail("Choose the payment method.", 400)
    amount = round(float(body.amount or 0), 2)
    if amount <= 0: fail("Enter the amount received.", 400)
    cur.execute("""SELECT COALESCE(SUM(amount_paid) FILTER (WHERE review_status IN ('verified','pending')),0) AS counted
                   FROM payments WHERE invoice_id=%s""", (invoice_id,))
    remaining = round(float(inv["net_amount"]) - float(cur.fetchone()["counted"]), 2)
    if amount > remaining + 0.005: fail(f"The amount is more than the balance (Rs. {remaining:,.0f}).", 400)
    s = _wf()._settings(cur, {"campus_id": inv["campus_id"], "academic_year_id": inv["academic_year_id"]})
    if amount < remaining - 0.005 and not s.get("allow_partial_payment"):
        fail(f"Partial payment isn't allowed this session - the full Rs. {remaining:,.0f} is due.", 400)
    cur.execute("""INSERT INTO payments (invoice_id, amount_paid, method, reference, received_by, notes, is_verified, verified_by, verified_at,
                                         paid_at, review_status)
                   VALUES (%s,%s,%s,%s,%s,%s,TRUE,%s,fn_admission_now(),fn_admission_now(),'verified')""",
                (invoice_id, amount, body.method, (body.reference or "").strip() or None, user_id, (body.notes or "").strip() or None, user_id))
    status = _fee_refresh(cur, db, invoice_id, user_id)
    db.commit()
    return ok(message=f"Rs. {amount:,.0f} received." + (" The admission fee is fully paid - the application is ready for registration." if status == "paid" else ""))


class FeeReviewIn(BaseModel):
    decision: str            # verify | reject
    reason: Optional[str] = None


@router.put("/fees/payments/{payment_id}")
def review_fee_payment(payment_id: int, body: FeeReviewIn, user_id: int = Depends(require_permission("admissions.admission_fee_verification")),
                       db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Finance verifies or rejects a payment a parent submitted for the admission fee."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM payments WHERE id=%s", (payment_id,))
    p_ = cur.fetchone()
    if not p_: fail("Payment not found.", 404)
    _fee_invoice(cur, p_["invoice_id"], campus_id)
    if p_["review_status"] != "pending": fail(f"This payment is already {p_['review_status']}.", 400)
    if body.decision == "verify":
        cur.execute("""UPDATE payments SET is_verified=TRUE, review_status='verified', verified_by=%s, verified_at=fn_admission_now() WHERE id=%s""",
                    (user_id, payment_id))
        msg = "Payment verified."
    elif body.decision == "reject":
        reason = (body.reason or "").strip()
        if not reason: fail("Give a reason so the parent knows what to fix.", 400)
        cur.execute("""UPDATE payments SET is_verified=FALSE, review_status='rejected', rejected_reason=%s, rejected_by=%s, rejected_at=fn_admission_now()
                       WHERE id=%s""", (reason, user_id, payment_id))
        msg = "Payment rejected."
    else:
        fail("Choose verify or reject.", 400)
    status = _fee_refresh(cur, db, p_["invoice_id"], user_id)
    db.commit()
    return ok(message=msg + (" The admission fee is fully paid." if status == "paid" else ""))


@router.get("/fees/{invoice_id}/voucher")
def fee_voucher_pdf(invoice_id: int, user_id: int = Depends(require_permission("admissions.admission_fee_view")), db=Depends(get_db),
                    campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Printable admission fee voucher (school name, logo and bank details from School Info)."""
    from fastapi.responses import Response
    from app.utils.admission_voucher import build_voucher
    from app.utils.school_info import get_school_info
    cur = get_cur(db)
    inv = _fee_invoice(cur, invoice_id, campus_id)
    school = get_school_info(cur, inv["campus_id"])
    cur.execute("SELECT name FROM academic_years WHERE id=%s", (inv["academic_year_id"],))
    pdf = build_voucher(school, {"invoice_no": inv["invoice_no"], "application_no": inv["application_no"], "student": inv["student"],
                                 "class_name": inv["class_name"], "session": cur.fetchone()["name"], "amount": float(inv["net_amount"]),
                                 "due_date": inv["due_date"], "issued_at": inv["issued_at"], "status": inv["status"]})
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="admission_voucher_{inv["invoice_no"]}.pdf"'})



# =============================================================================
# Phase 9 - registration: a fee-paid applicant becomes a student
# (created through sp_create_student - same enrollment numbering and login as
#  the Students page - in ONE transaction)
# =============================================================================
import secrets
import string


def _temp_password(n=10):
    """Readable temporary password: no look-alike characters (0/O, 1/l/I)."""
    alphabet = "".join(ch for ch in string.ascii_letters + string.digits if ch not in "0O1lI")
    while True:
        p_ = "".join(secrets.choice(alphabet) for _ in range(n))
        if any(ch.isdigit() for ch in p_) and any(ch.isupper() for ch in p_) and any(ch.islower() for ch in p_):
            return p_


def _sections(cur, app):
    """Sections of the applied-for class in the application's session, with seats left."""
    cur.execute("""SELECT c.id, c.name, c.section, c.capacity,
                          (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.status='active') AS enrolled
                   FROM classes c WHERE c.campus_id=%s AND lower(c.name)=lower(%s)
                     AND (c.academic_year_id IS NULL OR c.academic_year_id=%s)
                   ORDER BY c.section NULLS FIRST, c.id""", (app["campus_id"], app["class_name"], app["academic_year_id"]))
    out = []
    for r in cur.fetchall():
        d = dict(r)
        d["label"] = d["name"] + (f" ({d['section']})" if d["section"] else "")
        d["seats_left"] = (d["capacity"] - d["enrolled"]) if d["capacity"] is not None else None
        out.append(d)
    return out


@router.get("/applications/{app_id}/sections")
def registration_sections(app_id: int, user_id: int = Depends(require_permission("admissions.student_registration")), db=Depends(get_db),
                          campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    app = _get_app(cur, app_id, campus_id)
    return ok(data=_sections(cur, app))


class RegisterIn(BaseModel):
    class_id: int
    email: Optional[str] = None          # optional student email; login works with the enrollment number


@router.post("/applications/{app_id}/register")
def register_student(app_id: int, body: RegisterIn, user_id: int = Depends(require_permission("admissions.student_registration")),
                     db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Creates the student (login + enrollment number via sp_create_student), copies the
    parents' details, links the parent account and the admission fee voucher, and
    completes the application - all or nothing. The temporary password is returned
    ONCE, here only.
    """
    import bcrypt
    import psycopg2
    W = _wf()
    cur = get_cur(db)
    app = _get_app(cur, app_id, campus_id)
    cur.execute("SELECT * FROM admission_applications WHERE id=%s FOR UPDATE", (app_id,))   # no double registration
    app = dict(cur.fetchone())
    if app["student_id"]: fail("This applicant is already registered as a student.", 409)
    if app["status"] != "payment_verified":
        fail("Registration needs the admission fee to be paid and verified first (or waived).", 409)
    email = (body.email or "").strip().lower() or None
    if email:
        if not _email_ok(email): fail("The student email address isn't valid.", 400)
        cur.execute("SELECT 1 FROM users WHERE lower(email)=%s", (email,))
        if cur.fetchone(): fail("That email address is already used by another account.", 409)
    cur.execute("SELECT * FROM classes WHERE id=%s FOR UPDATE", (body.class_id,))                # capacity re-checked under lock
    cls = cur.fetchone()
    if not cls or cls["campus_id"] != app["campus_id"] or cls["name"].lower() != app["class_name"].lower() \
            or (cls["academic_year_id"] is not None and cls["academic_year_id"] != app["academic_year_id"]):
        fail(f"Choose a section of {app['class_name']} for this session.", 400)
    cur.execute("SELECT COUNT(*) AS n FROM students WHERE class_id=%s AND status='active'", (body.class_id,))
    enrolled = cur.fetchone()["n"]
    label = cls["name"] + (f" ({cls['section']})" if cls["section"] else "")
    if cls["capacity"] is not None and enrolled >= cls["capacity"]:
        fail(f"{label} is full ({enrolled}/{cls['capacity']}). Choose another section.", 409)

    temp = _temp_password()
    try:
        cur.execute("SELECT * FROM sp_create_student(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (email, bcrypt.hashpw(temp.encode(), bcrypt.gensalt()).decode(), app["student_first_name"], app["student_last_name"],
                     None, app["date_of_birth"], app["gender"], None, app["address"], body.class_id, app["parent_user_id"], None, app["campus_id"]))
        st = dict(cur.fetchone())
        cur.execute(f"""UPDATE students SET {", ".join(k + "=%s" for k in STUDENT_DETAIL_FIELDS)} WHERE id=%s""",
                    [app.get(k) if k != "disability_types" else (app.get(k) or []) for k in STUDENT_DETAIL_FIELDS] + [st["id"]])
        cur.execute("""UPDATE users SET must_change_password=TRUE, temp_password_expires_at=fn_admission_now() + interval '14 days' WHERE id=%s""",
                    (st["user_id"],))
        if app["fee_invoice_id"]:                                     # the voucher joins the student's fee history
            cur.execute("UPDATE fee_invoices SET student_id=%s, for_class_id=%s WHERE id=%s", (st["id"], body.class_id, app["fee_invoice_id"]))
        cur.execute("UPDATE admission_applications SET student_id=%s WHERE id=%s", (st["id"], app_id))
        W.perform(cur, app_id, "register", _claims_actor(user_id, db), get_processing_date(db),
                  remarks=f"Registered as a student: enrollment no. {st['enrollment_no']}, {label}")
    except W.WorkflowError as e:
        db.rollback(); fail(str(e), e.status_code)
    except psycopg2.Error as e:
        db.rollback(); fail("The student couldn't be created: " + (e.diag.message_primary or "database error") + ". Nothing was saved.", 400)
    db.commit()
    if app["parent_user_id"]:
        try:
            from app.utils.notify import send_notification
            import main as _main
            with _main.flask_app.app_context():
                send_notification(app["parent_user_id"], "Admission completed",
                                  f"{app['student_first_name']} {app['student_last_name']} is now a student of {label} "
                                  f"(enrollment no. {st['enrollment_no']}).", "success", "/children")
        except Exception as e:
            print("[admissions notify]", e)
    return ok(message=f"{app['student_first_name']} {app['student_last_name']} is registered in {label}.",
              data={"student_id": st["id"], "enrollment_no": st["enrollment_no"], "class": label,
                    "login": st["enrollment_no"], "temporary_password": temp,
                    "parent_linked": bool(app["parent_user_id"])})



# =============================================================================
# Phase 4 - parent login account for an application (primary guardian's phone)
# =============================================================================
@router.post("/applications/{app_id}/parent-account")
def parent_account(app_id: int, user_id: int = Depends(require_permission("admissions.parent_login_creation")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Links the application to the parent account for the primary guardian's phone, creating
    the account when there is none. A new account's temporary password is returned ONCE.
    The same parent's other applications (siblings) and any registered child are linked too.
    """
    from app.utils.parent_accounts import ensure_parent_account, guardian_of, normalize_phone
    cur = get_cur(db)
    _get_app(cur, app_id, campus_id)
    cur.execute("SELECT * FROM admission_applications WHERE id=%s FOR UPDATE", (app_id,))
    app = dict(cur.fetchone())
    if app["parent_user_id"]:
        cur.execute("SELECT login_phone, phone FROM users WHERE id=%s", (app["parent_user_id"],))
        u = cur.fetchone()
        return ok(message="This application is already linked to a parent account.",
                  data={"created": False, "login": u["login_phone"] or u["phone"], "temporary_password": None})
    try:
        cur.execute("SELECT student_id FROM admission_siblings WHERE application_id=%s", (app_id,))
        acc = ensure_parent_account(cur, app, app["campus_id"], [r["student_id"] for r in cur.fetchall()])
    except ValueError as e:
        fail(str(e), 400)
    phone = normalize_phone(guardian_of(app)[1])
    # this application + the same guardian's other applications without a parent yet
    cur.execute("""UPDATE admission_applications SET parent_user_id=%s, updated_at=fn_admission_now()
                   WHERE parent_user_id IS NULL AND (id=%s OR
                         (CASE primary_guardian WHEN 'father' THEN father_phone WHEN 'mother' THEN mother_phone ELSE guardian_phone END)=%s)
                   RETURNING id, student_id""", (acc["user_id"], app_id, phone))
    linked = cur.fetchall()
    for r in linked:                                  # an already-registered child gets the parent too
        if r["student_id"]:
            cur.execute("UPDATE students SET parent_id=%s WHERE id=%s AND parent_id IS NULL", (acc["user_id"], r["student_id"]))
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s,'parent_account',%s,%s,%s,TRUE,%s)""",
                (app_id, app["status"], app["status"],
                 ("Parent login created" if acc["created"] else "Linked to the existing parent account") + f" ({acc['login']})", user_id))
    db.commit()
    others = len(linked) - 1
    return ok(message=("Parent login created." if acc["created"] else "Linked to the existing parent account - their password is unchanged.")
                      + (f" {others} other application(s) of this parent linked too." if others > 0 else ""),
              data={"created": acc["created"], "login": acc["login"], "temporary_password": acc["temporary_password"]})



@router.get("/fees/payments/{payment_id}/receipt")
def fee_payment_receipt(payment_id: int, user_id: int = Depends(require_permission("admissions.admission_fee_verification")), db=Depends(get_db),
                        campus_id: Optional[int] = Depends(get_current_campus_id)):
    """The receipt image a parent attached, so finance can check it before verifying."""
    cur = get_cur(db)
    cur.execute("SELECT invoice_id, receipt_image FROM payments WHERE id=%s", (payment_id,))
    p_ = cur.fetchone()
    if not p_: fail("Payment not found.", 404)
    _fee_invoice(cur, p_["invoice_id"], campus_id)
    if not p_["receipt_image"]: fail("No receipt was attached to this payment.", 404)
    return ok(data={"receipt_image": p_["receipt_image"]})



# =============================================================================
# Application form PDF (student photo at the top) - for staff and the parent
# =============================================================================
PHOTO_WORDS = ("photo", "picture", "photograph")


def application_pdf(cur, db, a, viewer_id=None):
    """The printable application form for one application (no internal notes). Returns PDF bytes."""
    from app.utils.admission_form_pdf import build_application_pdf, fmt_date
    from app.utils.school_info import get_school_info
    W = _wf()
    a = dict(a)
    cur.execute("SELECT value FROM system_settings WHERE key='date_format' LIMIT 1")
    r = cur.fetchone(); date_fmt = r["value"] if r and r["value"] else "DD/MM/YYYY"
    cur.execute("SELECT name FROM academic_years WHERE id=%s", (a["academic_year_id"],)); a["session"] = cur.fetchone()["name"]
    cur.execute("SELECT name FROM campuses WHERE id=%s", (a["campus_id"],)); a["campus"] = cur.fetchone()["name"]
    a["status_label"] = W.STATUS_LABELS.get(a["status"], a["status"])
    a["submitted"] = fmt_date(a["submitted_at"], date_fmt) if a.get("submitted_at") else "Not submitted yet"
    a["printed"] = fmt_date(get_processing_date(db), date_fmt)
    a["siblings"] = siblings_of(cur, a["id"])
    if viewer_id is not None:
        protect_application(a, _user_perms(cur, viewer_id))
    cur.execute("SELECT document_name, status, uploaded_at, file_path, mime_type FROM admission_documents WHERE application_id=%s ORDER BY id", (a["id"],))
    docs = [dict(x) for x in cur.fetchall()]
    photo = None                                   # the student's photograph: an image document named like "photo"
    for d_ in docs:
        if any(w in d_["document_name"].lower() for w in PHOTO_WORDS) and (d_["mime_type"] or "").startswith("image/"):
            path = os.path.realpath(os.path.join(ADM_UPLOAD_DIR, d_["file_path"]))
            if path.startswith(os.path.realpath(ADM_UPLOAD_DIR)) and os.path.exists(path):
                with open(path, "rb") as fh:
                    photo = fh.read()
                break
    cur.execute("SELECT scheduled_at, room FROM admission_tests WHERE application_id=%s ORDER BY id DESC LIMIT 1", (a["id"],)); test = cur.fetchone()
    cur.execute("SELECT scheduled_at, location FROM admission_interviews WHERE application_id=%s ORDER BY id DESC LIMIT 1", (a["id"],)); interview = cur.fetchone()
    return build_application_pdf(get_school_info(cur, a["campus_id"]), a, docs, dict(test) if test else None,
                                 dict(interview) if interview else None, photo, date_fmt)


@router.get("/applications/{app_id}/pdf")
def application_pdf_staff(app_id: int, user_id: int = Depends(require_permission("admissions.application_pdf")), db=Depends(get_db),
                          campus_id: Optional[int] = Depends(get_current_campus_id)):
    from fastapi.responses import Response
    cur = get_cur(db)
    a = _get_app(cur, app_id, campus_id)
    return Response(content=application_pdf(cur, db, a, viewer_id=user_id), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="application_{a["application_no"]}.pdf"'})



# =============================================================================
# Admission announcement banner (dashboard popup until the closing date)
# =============================================================================
BANNER_DIR = os.path.join(ADM_UPLOAD_DIR, "banners")
BANNER_MAX = 3 * 1024 * 1024


@router.post("/settings/banner")
def upload_banner(academic_year_id: int = Form(...), campus: Optional[int] = Form(None), file: UploadFile = File(...),
                  user_id: int = Depends(require_permission("admissions.admission_banner")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    s = _setting_row(cur, cid, academic_year_id) if cid else None
    if not s: fail("Save the Admission Settings for this session first.", 400)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png"): fail("Upload the banner as a JPG or PNG image.", 400)
    data = file.file.read(BANNER_MAX + 1)
    if len(data) > BANNER_MAX: fail("The banner is larger than 3 MB.", 400)
    if not (data.startswith(b"\xff\xd8") or data.startswith(b"\x89PNG")): fail("That file isn't a JPG or PNG image.", 400)
    is_png = data.startswith(b"\x89PNG")
    os.makedirs(BANNER_DIR, exist_ok=True)
    fname = f"banner_{s['id']}_{uuid.uuid4().hex}" + (".png" if is_png else ".jpg")
    with open(os.path.join(BANNER_DIR, fname), "wb") as fh:
        fh.write(data)
    if s.get("banner_path"):
        try: os.remove(os.path.join(BANNER_DIR, s["banner_path"]))
        except OSError: pass
    cur.execute("""UPDATE admission_settings SET banner_path=%s, banner_mime=%s, banner_version=banner_version+1, banner_updated_at=fn_admission_now()
                   WHERE id=%s""", (fname, "image/png" if is_png else "image/jpeg", s["id"]))
    db.commit()
    return ok(message="Banner uploaded. It shows on everyone's dashboard while the schedule is published, until applications close.")


@router.delete("/settings/banner")
def delete_banner(academic_year_id: int = Query(...), campus: Optional[int] = Query(None),
                  user_id: int = Depends(require_permission("admissions.admission_banner")), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    s = _setting_row(cur, cid, academic_year_id) if cid else None
    if not s or not s.get("banner_path"): fail("There is no banner to remove.", 404)
    try: os.remove(os.path.join(BANNER_DIR, s["banner_path"]))
    except OSError: pass
    cur.execute("UPDATE admission_settings SET banner_path=NULL, banner_mime=NULL, banner_updated_at=fn_admission_now() WHERE id=%s", (s["id"],))
    db.commit()
    return ok(message="Banner removed.")



@router.get("/settings/banner")
def preview_banner(academic_year_id: int = Query(...), campus: Optional[int] = Query(None),
                   user_id: int = Depends(require_permission("admissions.admission_settings_view")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Staff preview of the banner (also before the schedule is published)."""
    cur = get_cur(db)
    cid = _campus_or_param(campus_id, campus)
    s = _setting_row(cur, cid, academic_year_id) if cid else None
    if not s or not s.get("banner_path"): fail("No banner uploaded.", 404)
    path = os.path.realpath(os.path.join(BANNER_DIR, s["banner_path"]))
    if not path.startswith(os.path.realpath(BANNER_DIR)) or not os.path.exists(path): fail("No banner uploaded.", 404)
    return FileResponse(path, media_type=s["banner_mime"] or "image/jpeg")



# =============================================================================
# Notifications: applicant's parent + the staff involved (examiner, panel, assignee)
# Written in the same transaction as the step - if the step is undone, so is the message.
# =============================================================================
def _notify(cur, user_ids, title, body, link, ntype="info", ref_id=None):
    ids = sorted({u for u in user_ids if u})
    for uid in ids:
        cur.execute("""INSERT INTO notifications (user_id, title, body, message, type, link, reference_id, reference_type, is_read, created_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,'admission',FALSE,fn_admission_now())""", (uid, title, body, body, ntype, link, ref_id))
    return len(ids)


def _safe_notify(cur, fn):
    """Notifications never block the step itself."""
    cur.execute("SAVEPOINT adm_notify")
    try:
        fn()
        cur.execute("RELEASE SAVEPOINT adm_notify")
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT adm_notify")
        print("[admissions notify]", e)


def _when(cur, dt):
    """Date in the school's format + time."""
    cur.execute("SELECT value FROM system_settings WHERE key='date_format' LIMIT 1")
    r = cur.fetchone()
    d = _fmt_date(dt, r["value"] if r and r["value"] else "DD/MM/YYYY")
    return f"{d}, {dt:%I:%M %p}" if hasattr(dt, "hour") else d


def _app_brief(cur, app_id):
    cur.execute("""SELECT id, application_no, parent_user_id, assigned_to, class_name, waiting_list_position, fee_invoice_id,
                          student_first_name || ' ' || student_last_name AS student FROM admission_applications WHERE id=%s""", (app_id,))
    return cur.fetchone()


PARENT_LINK = "/my-admissions"
DECISIONS = {
    "approve":            ("Admission approved", "success", "{s}'s admission to {cls} has been approved."),
    "reject":             ("Admission not approved", "warning", "We're sorry - {s}'s application for {cls} was not approved."),
    "waitlist":           ("Placed on the waiting list", "info", "{s}'s application for {cls} is on the waiting list{pos}."),
    "hold":               ("Application on hold", "info", "{s}'s application for {cls} is on hold."),
    "request_evaluation": ("Further evaluation", "info", "{s}'s application for {cls} needs a further evaluation. We'll contact you with the details."),
    "return_correction":  ("Correction needed", "warning", "Please correct {s}'s application and send it back for review."),
    "request_correction": ("Correction needed", "warning", "Please correct {s}'s application and send it back for review."),
    "reject_documents":   ("Documents need attention", "warning", "Some of {s}'s documents need to be uploaded again."),
}


def _on_transition(cur, app_id, action, frm, to, remarks):
    def run():
        a = _app_brief(cur, app_id)
        if not a: return
        staff_link = f"/admissions/applications/{app_id}"
        if action in DECISIONS:
            title, ntype, text = DECISIONS[action]
            pos = f" (position {a['waiting_list_position']})" if a["waiting_list_position"] else ""
            body = text.format(s=a["student"], cls=a["class_name"], pos=pos)
            if action == "approve" and a["fee_invoice_id"] is None:
                body += " The admission fee voucher will follow."
            if remarks and action != "approve":
                body += f" Note from the school: {remarks}"
            _notify(cur, [a["parent_user_id"]], f"{title} - {a['application_no']}", body, PARENT_LINK, ntype, app_id)
            if action in ("approve", "reject", "waitlist", "hold", "request_evaluation"):
                _notify(cur, [a["assigned_to"]], f"Decision: {DECISIONS[action][0]} - {a['application_no']}",
                        f"{a['student']} ({a['class_name']}).", staff_link, "info", app_id)
        elif action == "generate_voucher":
            cur.execute("SELECT invoice_no, net_amount, due_date FROM fee_invoices WHERE id=%s", (a["fee_invoice_id"],)); f = cur.fetchone()
            if f:
                _notify(cur, [a["parent_user_id"]], f"Admission fee voucher - {a['application_no']}",
                        f"Please pay the admission fee of Rs. {float(f['net_amount']):,.0f} for {a['student']} by {_when(cur, f['due_date'])} "
                        f"(voucher {f['invoice_no']}).", PARENT_LINK, "info", app_id)
    _safe_notify(cur, run)


_wf().AFTER_TRANSITION.append(_on_transition)



# =============================================================================
# Siblings at the school + CNIC look-ups (with privacy rules)
# =============================================================================
def _cnic_matches_student(cur, student_id, cnics):
    """Does one of these CNICs belong to the student's father / mother / guardian on record?"""
    cnics = [x for x in (cnics or []) if x]
    if not cnics: return False
    cnics = [re.sub(r"\D", "", x) for x in cnics]
    cur.execute("""SELECT 1 FROM students s WHERE s.id=%s AND (
                       regexp_replace(COALESCE(s.father_cnic,''), '\\D', '', 'g') = ANY(%s)
                    OR regexp_replace(COALESCE(s.mother_cnic,''), '\\D', '', 'g') = ANY(%s)
                    OR regexp_replace(COALESCE(s.guardian_cnic,''), '\\D', '', 'g') = ANY(%s)
                    OR EXISTS (SELECT 1 FROM admission_applications a WHERE a.student_id=s.id
                               AND (a.father_cnic = ANY(%s) OR a.mother_cnic = ANY(%s) OR a.guardian_cnic = ANY(%s))))""",
                (student_id, cnics, cnics, cnics, cnics, cnics, cnics))
    return cur.fetchone() is not None


def student_brief(cur, enrollment_no):
    cur.execute("""SELECT s.id, s.enrollment_no, s.first_name || ' ' || s.last_name AS name, s.status, s.parent_id, s.father_name,
                          c.name || COALESCE(' (' || c.section || ')', '') AS class_name, cp.name AS campus
                   FROM students s LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN campuses cp ON cp.id=s.campus_id
                   WHERE lower(s.enrollment_no)=lower(%s)""", ((enrollment_no or "").strip(),))
    r = cur.fetchone()
    return dict(r) if r else None


def resolve_siblings(cur, nos, cnics=None, parent_user_id=None):
    """
    Registration numbers -> students. With cnics (public form) a sibling is accepted only when one of the
    family's CNICs matches that student's record; with parent_user_id (logged-in parent) their own
    children are accepted directly. Staff pass neither.
    """
    out, seen = [], set()
    for raw in nos or []:
        no = (raw or "").strip()
        if not no or no.lower() in seen: continue
        seen.add(no.lower())
        s = student_brief(cur, no)
        if not s or s["status"] != "active":
            fail(f"No current student has the registration number {no}.")
        if cnics is not None and not (parent_user_id and s["parent_id"] == parent_user_id) and not _cnic_matches_student(cur, s["id"], cnics):
            fail(f"Registration number {no}: the father's or mother's CNIC on this form doesn't match that student's record.")
        out.append((s["id"], s["enrollment_no"]))
    return out


def save_siblings(cur, app_id, sibs):
    cur.execute("DELETE FROM admission_siblings WHERE application_id=%s", (app_id,))
    for sid_, no in sibs:
        cur.execute("INSERT INTO admission_siblings (application_id, student_id, enrollment_no) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (app_id, sid_, no))


def siblings_of(cur, app_id):
    cur.execute("""SELECT sb.enrollment_no, s.first_name || ' ' || s.last_name AS name,
                          c.name || COALESCE(' (' || c.section || ')', '') AS class_name, cp.name AS campus
                   FROM admission_siblings sb JOIN students s ON s.id=sb.student_id
                   LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN campuses cp ON cp.id=s.campus_id
                   WHERE sb.application_id=%s ORDER BY sb.id""", (app_id,))
    return [dict(r) for r in cur.fetchall()]


def cnic_lookup(cur, cnic, parent_user_id=None):
    """
    Details last recorded for a CNIC (as father, mother or guardian): newest admission application first,
    then the students' own records. Dashes / spaces are ignored on both sides. parent_user_id limits it
    to that parent's own applications and children.
    """
    d = _cnic_digits(cnic)
    if len(d) != 13: return None
    for who in ("father", "mother", "guardian"):
        own = "AND a.parent_user_id=%s" if parent_user_id else ""
        cur.execute(f"""SELECT a.{who}_name AS name, a.{who}_phone AS phone, a.{who}_occupation AS occupation, a.{who}_email AS email
                        FROM admission_applications a
                        WHERE regexp_replace(COALESCE(a.{who}_cnic,''), '\\D', '', 'g')=%s {own} AND a.{who}_name IS NOT NULL
                        ORDER BY a.updated_at DESC LIMIT 1""", (d, parent_user_id) if parent_user_id else (d,))
        r = cur.fetchone()
        if r: return {**dict(r), "found_as": who}
    for who in ("father", "mother", "guardian"):
        own = "AND s.parent_id=%s" if parent_user_id else ""
        cur.execute(f"""SELECT s.{who}_name AS name, s.{who}_phone AS phone, s.{who}_occupation AS occupation, s.{who}_email AS email
                        FROM students s
                        WHERE regexp_replace(COALESCE(s.{who}_cnic,''), '\\D', '', 'g')=%s {own} AND s.{who}_name IS NOT NULL
                        ORDER BY s.id DESC LIMIT 1""", (d, parent_user_id) if parent_user_id else (d,))
        r = cur.fetchone()
        if r:
            out = dict(r)
            if out.get("phone"): out["phone"] = normalize_phone(out["phone"]) or out["phone"]
            return {**out, "found_as": who}
    return None


@router.get("/lookup/cnic")
def lookup_cnic(cnic: str = Query(...), user_id: int = Depends(require_any_permission("admissions.application_create", "admissions.application_edit")), db=Depends(get_db)):
    found = cnic_lookup(get_cur(db), cnic)
    return ok(data=found, message="Details found." if found else "No earlier record for this CNIC.")


@router.get("/lookup/student")
def lookup_student(enrollment_no: str = Query(...), user_id: int = Depends(require_any_permission("admissions.application_create", "admissions.application_edit")), db=Depends(get_db)):
    s = student_brief(get_cur(db), enrollment_no)
    if not s or s["status"] != "active": fail("No current student has that registration number.", 404)
    return ok(data={k: s[k] for k in ("enrollment_no", "name", "class_name", "campus", "father_name")})



def admission_officers(cur, app_id):
    """Who handles an application: the assigned staff member, else every active reviewer (admission.verify) on its campus."""
    cur.execute("SELECT assigned_to, campus_id FROM admission_applications WHERE id=%s", (app_id,))
    a = cur.fetchone()
    if not a: return []
    if a["assigned_to"]: return [a["assigned_to"]]
    cur.execute("""SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN role_permissions rp ON rp.role_id=ur.role_id
                   JOIN permissions p ON p.id=rp.permission_id
                   WHERE p.code='admission.verify' AND COALESCE(u.is_active, TRUE) AND u.campus_id=%s""", (a["campus_id"],))
    return [r["id"] for r in cur.fetchall()]


def notify_officers_upload(cur, app_id, title, detail):
    """The parent uploaded / sent back - tell whoever handles the application."""
    a = _app_brief(cur, app_id)
    if not a: return
    _safe_notify(cur, lambda: _notify(cur, admission_officers(cur, app_id), f"{title} - {a['application_no']}",
                                      f"{a['student']} ({a['class_name']}): {detail}. Please review.",
                                      f"/admissions/applications/{app_id}", "info", app_id))
