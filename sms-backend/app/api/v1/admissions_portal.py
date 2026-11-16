"""
Admission portal.

PUBLIC (no login)           /api/v1/admission-portal/public/...
    campuses with a published schedule, the schedule itself, and submitting an
    application WITH its documents. The parent account is created / linked from the
    primary guardian's phone; a new account's temporary password is returned ONCE.
PARENT (logged in)          /api/v1/admission-portal/my/...
    the parent's OWN applications only (parent_user_id = the caller): progress,
    parent-visible timeline, corrections, re-uploads, withdrawal, fee voucher and
    paying with a receipt (finance verifies it on Admission Fees).

Reuses the staff module's validation, workflow, documents and parent-account code.
"""
import json
import os
import time
import uuid
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur

router = APIRouter()


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _A():
    from app.api.v1 import admissions as A          # staff module: validation, workflow helpers, constants
    return A


def _W():
    from app.services import admission_workflow as W
    return W


# ---------------------------------------------------------------- simple abuse limits (per process)
_HITS = defaultdict(deque)


def _client_ip(request: Request):
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()


def _rate_limit(request: Request, key: str, limit: int, window_s: int, count=True):
    """Refuse when `limit` hits happened in the window; count=False only checks (record later with _rate_hit)."""
    q, now = _HITS[(key, _client_ip(request))], time.time()
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= limit:
        fail("Too many attempts from this connection. Please try again later.", 429)
    if count:
        q.append(now)


def _rate_hit(request: Request, key: str):
    _HITS[(key, _client_ip(request))].append(time.time())


def _published(cur, campus_id=None):
    cur.execute("""SELECT s.*, c.name AS campus_name, ay.name AS session_name, ay.start_date AS session_start
                   FROM admission_settings s JOIN campuses c ON c.id=s.campus_id JOIN academic_years ay ON ay.id=s.academic_year_id
                   WHERE s.is_published AND s.is_active AND c.is_active AND ay.closed_at IS NULL
                     AND (%s::int IS NULL OR s.campus_id=%s)
                   ORDER BY c.is_main DESC, c.name, ay.start_date""", (campus_id, campus_id))
    return [dict(r) for r in cur.fetchall()]


# =============================================================================
# PUBLIC
# =============================================================================
@router.get("/public/campuses")
def public_campuses(db=Depends(get_db)):
    """Campuses whose admission schedule is published (what the portal offers)."""
    cur = get_cur(db)
    from app.utils.school_info import get_school_info
    school = get_school_info(cur)
    seen, rows = set(), []
    for s in _published(cur):
        if s["campus_id"] in seen:
            continue
        seen.add(s["campus_id"])
        rows.append({"campus_id": s["campus_id"], "campus": s["campus_name"], "session": s["session_name"],
                     "academic_year_id": s["academic_year_id"]})
    return ok(data={"school": {"name": school["name"], "address": school["address"], "phone": school["phone"]}, "campuses": rows})


# display settings the public pages may use (formats only - nothing else from settings)
PUBLIC_REGIONAL_KEYS = ("date_format", "time_format", "decimal_places", "region", "currency_code", "currency_symbol",
                        "currency_position", "timezone", "first_day_of_week", "weekend_days")


@router.get("/public/logo")
def public_logo(db=Depends(get_db)):
    """The school logo for the public admission pages (nothing else from settings)."""
    from app.utils.school_info import get_school_info
    logo = get_school_info(get_cur(db)).get("logo_bytes")
    if not logo:
        fail("No logo.", 404)
    mime = "image/png" if logo[:4] == b"\x89PNG" else "image/jpeg" if logo[:2] == b"\xff\xd8" else \
           "image/svg+xml" if logo.lstrip()[:4] in (b"<svg", b"<?xm") else "image/webp" if logo[8:12] == b"WEBP" else "application/octet-stream"
    return Response(content=logo, media_type=mime, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/public/regional")
def public_regional(db=Depends(get_db)):
    """The processing date and the school's date / time / currency FORMAT settings, for pages used before login."""
    cur = get_cur(db)
    cur.execute("SELECT key, value FROM system_settings WHERE key = ANY(%s)", (list(PUBLIC_REGIONAL_KEYS),))
    settings = {r["key"]: r["value"] for r in cur.fetchall() if r["value"] not in (None, "")}
    return ok(data={"processing_date": str(_A().get_processing_date(db)), "settings": settings})


@router.get("/public/schedule")
def public_schedule(campus_id: int, db=Depends(get_db)):
    """The published schedule for a campus, with the classes open for applications."""
    A, W = _A(), _W()
    cur = get_cur(db)
    pubs = _published(cur, campus_id)
    if not pubs:
        fail("Admissions are not open at this campus.", 404)
    s = pubs[0]
    sch = A._schedule(cur, campus_id, s["academic_year_id"])
    today = A.get_processing_date(db)
    open_now = bool((not s["opens_on"] or today >= s["opens_on"]) and (not s["closes_on"] or today <= s["closes_on"]))
    # say exactly why it isn't open (by the PROCESSING date)
    cur.execute("SELECT value FROM system_settings WHERE key='date_format' LIMIT 1")
    _r = cur.fetchone(); _fmt = _r["value"] if _r and _r["value"] else "DD/MM/YYYY"
    F = lambda d: A._fmt_date(d, _fmt)
    closed_reason = None
    if s["opens_on"] and today < s["opens_on"]:
        closed_reason = f"Applications open on {F(s['opens_on'])} (today is {F(today)})."
    elif s["closes_on"] and today > s["closes_on"]:
        closed_reason = f"Applications closed on {F(s['closes_on'])} (today is {F(today)})."
    cur.execute("""SELECT cs.class_name, cs.capacity, cs.min_age_years, cs.max_age_years,
                          (SELECT COUNT(*) FROM admission_applications a WHERE a.campus_id=s.campus_id AND a.academic_year_id=s.academic_year_id
                             AND lower(a.class_name)=lower(cs.class_name) AND a.status = ANY(%s)) AS taken
                   FROM admission_class_settings cs JOIN admission_settings s ON s.id=cs.setting_id
                   WHERE cs.setting_id=%s AND cs.is_open ORDER BY cs.level NULLS LAST, cs.class_name""",
                (list(W.SEAT_HOLDING), s["id"]))
    classes = [{"class_name": r["class_name"],
                "seats_left": (r["capacity"] - r["taken"]) if r["capacity"] is not None else None,
                "min_age_years": float(r["min_age_years"]) if r["min_age_years"] is not None else None,
                "max_age_years": float(r["max_age_years"]) if r["max_age_years"] is not None else None} for r in cur.fetchall()]
    keep = ("session", "campus", "application_start", "application_end", "tests_start", "tests", "test_required", "interview_start",
            "interview_required", "classes_commence", "admission_fee")
    pub = {k: sch.get(k) for k in keep}
    pub["required_documents"] = sch["required_documents"]
    return ok(data={**pub, "campus_id": campus_id, "academic_year_id": s["academic_year_id"], "open_now": open_now,
                    "closed_reason": closed_reason, "today": str(today), "classes": classes})


async def _read_application_form(request: Request):
    """multipart: 'data' = JSON of the form, 'document_names' = JSON list, files 'doc_0', 'doc_1' ..."""
    form = await request.form()
    try:
        data = json.loads(form.get("data") or "{}")
        names = json.loads(form.get("document_names") or "[]")
    except ValueError:
        fail("The form couldn't be read. Please try again.", 400)
    files = []
    for i, name in enumerate(names):
        f = form.get(f"doc_{i}")
        if f is None or not getattr(f, "filename", None):
            continue
        files.append((str(name), f))
    return data, files


def _check_files(files):
    """Same rules as staff uploads: PDF / JPG / PNG, max 5 MB, contents must match the type."""
    A = _A()
    checked = []
    for name, f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in A.DOC_TYPES: fail(f"{name}: upload a PDF, JPG or PNG file.", 400)
        data = f.file.read(A.DOC_MAX_BYTES + 1)
        if len(data) > A.DOC_MAX_BYTES: fail(f"{name}: the file is larger than 5 MB.", 400)
        if not data: fail(f"{name}: the file is empty.", 400)
        sig = data[:8]
        if (ext == ".pdf" and not sig.startswith(b"%PDF")) or (ext == ".png" and not sig.startswith(b"\x89PNG")) \
                or (ext in (".jpg", ".jpeg") and not sig.startswith(b"\xff\xd8")):
            fail(f"{name}: the file's contents don't match its type.", 400)
        checked.append((name.strip()[:100], f.filename, ext, data))
    return checked


def _store_docs(cur, app_id, checked, user_id):
    A = _A()
    folder = os.path.join(A.ADM_UPLOAD_DIR, str(app_id))
    os.makedirs(folder, exist_ok=True)
    for name, original, ext, data in checked:
        fname = uuid.uuid4().hex + ext
        with open(os.path.join(folder, fname), "wb") as fh:
            fh.write(data)
        rel = f"{app_id}/{fname}"
        cur.execute("SELECT id, file_path FROM admission_documents WHERE application_id=%s AND lower(document_name)=lower(%s)", (app_id, name))
        old = cur.fetchone()
        if old:
            cur.execute("""UPDATE admission_documents SET file_path=%s, original_name=%s, mime_type=%s, file_size=%s, status='pending',
                           remarks=NULL, verified_by=NULL, verified_at=NULL, uploaded_by=%s, uploaded_at=fn_admission_now() WHERE id=%s""",
                        (rel, original, A.DOC_TYPES[ext], len(data), user_id, old["id"]))
            try: os.remove(os.path.join(A.ADM_UPLOAD_DIR, old["file_path"]))
            except OSError: pass
        else:
            cur.execute("""INSERT INTO admission_documents (application_id, document_name, file_path, original_name, mime_type, file_size, uploaded_by)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)""", (app_id, name, rel, original, A.DOC_TYPES[ext], len(data), user_id))


def _create_and_submit(cur, db, data, checked, parent_user_id):
    """Validate, number, store documents, link / create the parent, submit. Returns (app_id, application_no, account)."""
    import psycopg2
    A, W = _A(), _W()
    from app.utils.parent_accounts import ensure_parent_account
    today = A.get_processing_date(db)
    try:
        body = A.ApplicationIn(**data)
    except Exception:
        fail("Please fill in every required field.", 400)
    pubs = _published(cur, body.campus_id)
    if not pubs or pubs[0]["academic_year_id"] != body.academic_year_id:
        fail("Admissions are not open for that campus and session.", 400)
    v = A.validate_application(cur, body, today)
    # siblings: a logged-in parent's own children directly; otherwise only with a matching family CNIC
    sibs = A.resolve_siblings(cur, body.sibling_enrollment_nos, cnics=[v.get("father_cnic"), v.get("mother_cnic"), v.get("guardian_cnic")],
                              parent_user_id=parent_user_id)
    # every required document must come with the application
    required = W.required_documents(pubs[0], v)
    have = {n.lower() for n, *_ in checked}
    missing = [r for r in required if r.lower() not in have]
    if missing: fail("Please upload: " + ", ".join(missing) + ".", 400)
    account = None
    if parent_user_id is None:
        try:
            account = ensure_parent_account(cur, v, body.campus_id, [s_id for s_id, _ in sibs])
        except ValueError as e:
            fail(str(e), 400)
        parent_user_id = account["user_id"]
    no = A.next_application_no(cur, body.campus_id, body.academic_year_id, pubs[0]["application_no_format"], today)
    cols = list(v.keys())
    try:
        cur.execute(f"""INSERT INTO admission_applications (application_no, source, parent_user_id, {', '.join(cols)})
                        VALUES (%s, 'online', %s, {', '.join(['%s'] * len(cols))}) RETURNING id""",
                    [no, parent_user_id] + [v[k] for k in cols])
    except psycopg2.errors.UniqueViolation:
        db.rollback()
        fail("This child already has an application for this session at this campus. Sign in to see it.", 409)
    app_id = cur.fetchone()["id"]
    A.save_siblings(cur, app_id, sibs)
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s,'create',NULL,'draft','Submitted online',TRUE,%s)""", (app_id, parent_user_id))
    _store_docs(cur, app_id, checked, parent_user_id)
    try:
        W.perform(cur, app_id, "submit", W.actor(parent_user_id), today)
    except W.WorkflowError as e:
        db.rollback()
        fail(str(e), e.status_code)
    return app_id, no, account


@router.post("/public/apply")
async def public_apply(request: Request, db=Depends(get_db)):
    """A parent submits an application (with documents) without being logged in."""
    _rate_limit(request, "apply_try", 30, 3600)                    # room to fix mistakes
    _rate_limit(request, "apply_ok", 5, 3600, count=False)         # at most 5 successful applications an hour
    data, files = await _read_application_form(request)
    if data.pop("website", None):                                   # honeypot - real people never fill it
        fail("The form couldn't be submitted.", 400)
    checked = _check_files(files)
    cur = get_cur(db)
    app_id, no, account = _create_and_submit(cur, db, data, checked, None)
    db.commit()
    _rate_hit(request, "apply_ok")
    created = bool(account and account["created"])
    return ok(message="Your application has been submitted.",
              data={"application_no": no, "login": account["login"] if account else None,
                    "new_account": created, "temporary_password": account["temporary_password"] if created else None})


# =============================================================================
# PARENT (logged in) - their OWN applications only
# =============================================================================
STAGES = [("submitted", "Application submitted"), ("verification", "Verification"), ("documents", "Document verification"),
          ("test", "Admission test"), ("interview", "Interview"), ("decision", "Principal approval"),
          ("fee", "Fee payment"), ("completed", "Admission completed")]
STAGE_OF = {"submitted": 0, "initial_verification": 1, "correction_required": 1, "document_verification": 2, "documents_rejected": 2,
            "test_scheduled": 3, "test_completed": 3, "interview_scheduled": 4, "interview_completed": 4, "awaiting_approval": 5,
            "further_evaluation": 5, "on_hold": 5, "waiting_list": 5, "approved": 6, "fee_voucher_generated": 6,
            "payment_partially_paid": 6, "payment_verified": 6, "admission_completed": 7}
PARENT_ACTIONS_NEEDED = {"correction_required": "Please correct your application and send it back for review.",
                         "documents_rejected": "Please upload the documents marked below and send them back for review.",
                         "fee_voucher_generated": "Your admission is approved - please pay the admission fee.",
                         "payment_partially_paid": "Part of the admission fee is paid - please pay the balance."}


def _parent_only(user_id, db):
    cur = get_cur(db)
    cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name='parent'", (user_id,))
    if not cur.fetchone():
        fail("This page is for parents.", 403)
    return cur


def _own_app(cur, app_id, user_id, lock=False):
    cur.execute("SELECT * FROM admission_applications WHERE id=%s AND parent_user_id=%s" + (" FOR UPDATE" if lock else ""), (app_id, user_id))
    a = cur.fetchone()
    if not a:
        fail("Application not found.", 404)                       # same answer whether it exists or not
    return dict(a)


def _parent_view(cur, db, a):
    """What a parent may see: no internal notes, no staff assessments."""
    W = _W()
    cur.execute("SELECT name FROM academic_years WHERE id=%s", (a["academic_year_id"],)); session = cur.fetchone()["name"]
    cur.execute("SELECT name FROM campuses WHERE id=%s", (a["campus_id"],)); campus = cur.fetchone()["name"]
    cur.execute("""SELECT id, document_name, status, remarks, uploaded_at FROM admission_documents WHERE application_id=%s ORDER BY id""", (a["id"],))
    docs = [{**dict(r), "uploaded_at": str(r["uploaded_at"])} for r in cur.fetchall()]
    s = W._settings(cur, a)
    required = W.required_documents(s, a)
    have = {d["document_name"].lower() for d in docs}
    cur.execute("""SELECT t.scheduled_at, t.room, t.result, t.percentage, t.remarks, ts.instructions
                   FROM admission_tests t LEFT JOIN admission_test_sessions ts ON ts.id=t.session_id
                   WHERE t.application_id=%s ORDER BY t.id DESC LIMIT 1""", (a["id"],))
    t = cur.fetchone()
    test = None if not t else {"date": str(t["scheduled_at"]), "venue": t["room"], "instructions": t["instructions"],
                               "result": t["result"], "percentage": float(t["percentage"]) if t["percentage"] is not None else None,
                               "note": t["remarks"]}
    cur.execute("SELECT scheduled_at, location, recommendation, parent_note FROM admission_interviews WHERE application_id=%s ORDER BY id DESC LIMIT 1", (a["id"],))
    i = cur.fetchone()
    interview = None if not i else {"date": str(i["scheduled_at"]), "location": i["location"],
                                    "done": i["recommendation"] is not None, "note": i["parent_note"]}
    cur.execute("""SELECT action, to_status, remarks, acted_at FROM admission_status_history
                   WHERE application_id=%s AND NOT is_internal ORDER BY acted_at, id""", (a["id"],))
    A = _A()
    timeline = [{"title": A.EVENT_TITLES.get(h["action"]) or W.STATUS_LABELS.get(h["to_status"], h["to_status"]),
                 "note": h["remarks"], "at": str(h["acted_at"])} for h in cur.fetchall()]
    fee = None
    if a["fee_invoice_id"]:
        cur.execute("""SELECT fi.invoice_no, fi.net_amount, fi.status, fi.due_date,
                              COALESCE((SELECT SUM(amount_paid) FROM payments p WHERE p.invoice_id=fi.id AND p.review_status='verified'),0) AS paid,
                              (SELECT COUNT(*) FROM payments p WHERE p.invoice_id=fi.id AND p.review_status='pending') AS pending
                       FROM fee_invoices fi WHERE fi.id=%s""", (a["fee_invoice_id"],))
        f = cur.fetchone()
        cur.execute("""SELECT amount_paid, method, paid_at, review_status, rejected_reason FROM payments WHERE invoice_id=%s ORDER BY id""", (a["fee_invoice_id"],))
        pays = [{"amount": float(p["amount_paid"]), "method": p["method"], "date": str(p["paid_at"])[:10] if p["paid_at"] else None,
                 "status": p["review_status"], "reason": p["rejected_reason"]} for p in cur.fetchall()]
        fee = {"invoice_no": f["invoice_no"], "amount": float(f["net_amount"]), "paid": float(f["paid"]), "status": f["status"],
               "due_date": str(f["due_date"]) if f["due_date"] else None, "pending": f["pending"], "payments": pays,
               "allow_partial": bool(s.get("allow_partial_payment"))}
    stage = STAGE_OF.get(a["status"])
    return {"id": a["id"], "application_no": a["application_no"], "student": f"{a['student_first_name']} {a['student_last_name']}",
            "class_name": a["class_name"], "session": session, "campus": campus, "status": a["status"],
            "status_label": W.STATUS_LABELS.get(a["status"], a["status"]), "updated_at": str(a["updated_at"]),
            "stage": stage, "stages": [lbl for _, lbl in STAGES],
            "action_needed": PARENT_ACTIONS_NEEDED.get(a["status"]),
            "can_edit": a["status"] == "correction_required", "can_upload": a["status"] in ("correction_required", "documents_rejected", "submitted",
                                                                                              "initial_verification", "document_verification"),
            "can_resubmit": a["status"] in ("correction_required", "documents_rejected"),
            "can_withdraw": a["status"] not in W.TERMINAL, "can_pay": a["status"] in ("fee_voucher_generated", "payment_partially_paid"),
            "documents": docs, "missing_documents": [r for r in required if r.lower() not in have], "siblings": A.siblings_of(cur, a["id"]),
            "test": test, "interview": interview, "fee": fee, "timeline": timeline,
            "form": {**{k: a[k] for k in ("class_name", "student_first_name", "student_last_name", "gender", "b_form_no", "previous_school",
                                       "previous_class", "address", "father_name", "father_cnic", "father_occupation", "father_phone",
                                       "father_email", "mother_name", "mother_cnic", "mother_occupation", "mother_phone", "mother_email",
                                       "primary_guardian", "guardian_name", "guardian_cnic", "guardian_occupation", "guardian_phone",
                                       "guardian_email", "guardian_relationship", "guardian_relationship_other", "notify_contact",
                                       "has_disability", "disability_types", "disability_details", "transport_mode", "pickup_address",
                                       "religion", "sect", "nationality", "leaving_reason", "living_with")},
                    "sibling_enrollment_nos": [x["enrollment_no"] for x in A.siblings_of(cur, a["id"])],
                    "date_of_birth": str(a["date_of_birth"]), "campus_id": a["campus_id"], "academic_year_id": a["academic_year_id"]}}


@router.get("/my/applications")
def my_applications(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = _parent_only(user_id, db)
    cur.execute("SELECT * FROM admission_applications WHERE parent_user_id=%s AND status <> 'draft' ORDER BY created_at DESC", (user_id,))
    apps = [dict(r) for r in cur.fetchall()]
    return ok(data=[_parent_view(cur, db, a) for a in apps])


@router.get("/my/applications/{app_id}")
def my_application(app_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = _parent_only(user_id, db)
    return ok(data=_parent_view(cur, db, _own_app(cur, app_id, user_id)))


@router.post("/my/apply")
async def my_apply(request: Request, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """A logged-in parent applies for another child - linked to their own account."""
    cur = _parent_only(user_id, db)
    _rate_limit(request, "my_apply", 10, 3600)
    data, files = await _read_application_form(request)
    data.pop("website", None)
    checked = _check_files(files)
    app_id, no, _ = _create_and_submit(cur, db, data, checked, user_id)
    db.commit()
    return ok(message="Your application has been submitted.", data={"id": app_id, "application_no": no})


@router.post("/my/applications/{app_id}/documents")
async def my_upload(app_id: int, request: Request, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = _parent_only(user_id, db)
    a = _own_app(cur, app_id, user_id, lock=True)
    if a["status"] not in ("correction_required", "documents_rejected", "submitted", "initial_verification", "document_verification"):
        fail("Documents can't be changed at this stage.", 409)
    form = await request.form()
    name, f = (form.get("document_name") or "").strip(), form.get("file")
    if not name or f is None or not getattr(f, "filename", None):
        fail("Choose the document and a file.", 400)
    checked = _check_files([(name, f)])
    _store_docs(cur, app_id, checked, user_id)
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s,'document_upload',%s,%s,%s,FALSE,%s)""", (app_id, a["status"], a["status"], f"{name} uploaded", user_id))
    _A().notify_officers_upload(cur, app_id, f"{name} uploaded", f"the parent uploaded the {name}")
    db.commit()
    return ok(message=f"{name} uploaded.")


@router.put("/my/applications/{app_id}")
def my_edit(app_id: int, body: dict, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Corrections asked for by the school (only while 'Correction Required')."""
    A = _A()
    cur = _parent_only(user_id, db)
    a = _own_app(cur, app_id, user_id, lock=True)
    if a["status"] != "correction_required":
        fail("The application can only be changed when the school asks for a correction.", 409)
    try:
        b = A.ApplicationIn(**{**body, "campus_id": a["campus_id"], "academic_year_id": a["academic_year_id"]})
    except Exception:
        fail("Please fill in every required field.", 400)
    v = A.validate_application(cur, b, A.get_processing_date(db))
    v.pop("campus_id"); v.pop("academic_year_id")
    A.save_siblings(cur, app_id, A.resolve_siblings(cur, b.sibling_enrollment_nos, cnics=[v.get("father_cnic"), v.get("mother_cnic"), v.get("guardian_cnic")],
                                                     parent_user_id=user_id))
    cur.execute(f"UPDATE admission_applications SET {', '.join(k + '=%s' for k in v)}, updated_at=fn_admission_now() WHERE id=%s",
                list(v.values()) + [app_id])
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s,'edit',%s,%s,'Details corrected by the parent',FALSE,%s)""", (app_id, a["status"], a["status"], user_id))
    db.commit()
    return ok(message="Changes saved. Send the application back for review when you're done.")


class ParentActionIn(BaseModel):
    action: str                       # resubmit | withdraw
    remarks: Optional[str] = None


@router.post("/my/applications/{app_id}/action")
def my_action(app_id: int, body: ParentActionIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    W = _W()
    cur = _parent_only(user_id, db)
    a = _own_app(cur, app_id, user_id)
    if body.action == "resubmit":
        action = "resubmit" if a["status"] == "correction_required" else "resubmit_documents"
    elif body.action == "withdraw":
        action = "withdraw"
    else:
        fail("Unknown action.", 400)
    try:
        to = W.perform(cur, app_id, action, W.actor(user_id), _A().get_processing_date(db),
                       remarks=(body.remarks or ("Withdrawn by the parent" if action == "withdraw" else None)))
    except W.WorkflowError as e:
        db.rollback(); fail(str(e), e.status_code)
    if action != "withdraw":
        _A().notify_officers_upload(cur, app_id, "Sent back for review", "the parent made the changes and sent the application back for review")
    db.commit()
    return ok(message="Sent back to the school for review." if action != "withdraw" else "Application withdrawn.",
              data={"status": to})


@router.get("/my/applications/{app_id}/voucher")
def my_voucher(app_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    from app.utils.admission_voucher import build_voucher
    from app.utils.school_info import get_school_info
    cur = _parent_only(user_id, db)
    a = _own_app(cur, app_id, user_id)
    if not a["fee_invoice_id"]: fail("There is no fee voucher yet.", 404)
    cur.execute("SELECT * FROM fee_invoices WHERE id=%s", (a["fee_invoice_id"],)); inv = cur.fetchone()
    cur.execute("SELECT name FROM academic_years WHERE id=%s", (a["academic_year_id"],)); session = cur.fetchone()["name"]
    school = get_school_info(cur, a["campus_id"])
    pdf = build_voucher(school, {
        "invoice_no": inv["invoice_no"], "application_no": a["application_no"], "student": f"{a['student_first_name']} {a['student_last_name']}",
        "class_name": a["class_name"], "session": session, "amount": float(inv["net_amount"]),
        "due_date": inv["due_date"], "issued_at": inv["issued_at"], "status": inv["status"]})
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="admission_voucher_{inv["invoice_no"]}.pdf"'})


class ParentPaymentIn(BaseModel):
    amount: float
    method: str = "bank_transfer"
    reference: Optional[str] = None
    receipt_image: str                 # data URL of the receipt photo / scan


@router.post("/my/applications/{app_id}/pay")
def my_pay(app_id: int, body: ParentPaymentIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """The parent submits a payment WITH its receipt; finance verifies it (Admission Fees)."""
    cur = _parent_only(user_id, db)
    a = _own_app(cur, app_id, user_id, lock=True)
    if a["status"] not in ("fee_voucher_generated", "payment_partially_paid") or not a["fee_invoice_id"]:
        fail("There is no admission fee to pay right now.", 409)
    if body.method not in ("bank_transfer", "online", "cheque"): fail("Choose how you paid.", 400)
    if not (body.receipt_image or "").startswith("data:image/") or len(body.receipt_image) > 2_000_000:
        fail("Attach a photo of the payment receipt (an image up to 1.5 MB).", 400)
    cur.execute("SELECT * FROM fee_invoices WHERE id=%s", (a["fee_invoice_id"],)); inv = cur.fetchone()
    cur.execute("""SELECT COALESCE(SUM(amount_paid) FILTER (WHERE review_status IN ('verified','pending')),0) AS counted,
                          COUNT(*) FILTER (WHERE review_status='pending') AS pending FROM payments WHERE invoice_id=%s""", (inv["id"],))
    t = cur.fetchone()
    if t["pending"]: fail("A payment is already waiting for the school to verify it.", 409)
    remaining = round(float(inv["net_amount"]) - float(t["counted"]), 2)
    amount = round(float(body.amount or 0), 2)
    if amount <= 0: fail("Enter the amount you paid.", 400)
    if amount > remaining + 0.005: fail(f"The amount is more than the balance (Rs. {remaining:,.0f}).", 400)
    if amount < remaining - 0.005 and not _W()._settings(cur, a).get("allow_partial_payment"):
        fail(f"Please pay the full Rs. {remaining:,.0f}.", 400)
    cur.execute("""INSERT INTO payments (invoice_id, amount_paid, method, reference, received_by, receipt_image, is_verified, paid_at, review_status)
                   VALUES (%s,%s,%s,%s,%s,%s,FALSE,fn_admission_now(),'pending')""",
                (inv["id"], amount, body.method, (body.reference or "").strip() or None, user_id, body.receipt_image))
    from app.api.v1.finance import _refresh_invoice_status
    _refresh_invoice_status(cur, db, inv["id"])
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, acted_by)
                   VALUES (%s,'fee_payment_submitted',%s,%s,%s,FALSE,%s)""",
                (app_id, a["status"], a["status"], f"Payment of Rs. {amount:,.0f} submitted - waiting for the school to verify it", user_id))
    db.commit()
    return ok(message="Payment submitted. The school will verify your receipt.")



@router.get("/my/applications/{app_id}/pdf")
def my_application_pdf(app_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """The parent's own application form as a PDF (student photo at the top)."""
    cur = _parent_only(user_id, db)
    a = _own_app(cur, app_id, user_id)
    return Response(content=_A().application_pdf(cur, db, a), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="application_{a["application_no"]}.pdf"'})



# =============================================================================
# Admission banner popup - any logged-in user, while the schedule is published
# and applications haven't closed. "Don't show again" is remembered per banner version.
# =============================================================================
def _active_banners(cur, db, user_id):
    cur.execute("SELECT campus_id FROM users WHERE id=%s", (user_id,))
    u = cur.fetchone()
    ucampus = u["campus_id"] if u else None
    today = _A().get_processing_date(db)
    cur.execute("""SELECT s.id, s.banner_version, s.closes_on, s.campus_id, c.name AS campus, ay.name AS session
                   FROM admission_settings s JOIN campuses c ON c.id=s.campus_id JOIN academic_years ay ON ay.id=s.academic_year_id
                   WHERE s.banner_path IS NOT NULL AND s.is_published AND s.is_active AND ay.closed_at IS NULL
                     AND (s.closes_on IS NULL OR %s <= s.closes_on)
                     AND (%s::int IS NULL OR s.campus_id=%s)
                     AND NOT EXISTS (SELECT 1 FROM admission_banner_dismissals d
                                     WHERE d.user_id=%s AND d.setting_id=s.id AND d.banner_version=s.banner_version)
                   ORDER BY c.is_main DESC, c.name""", (today, ucampus, ucampus, user_id))
    return [dict(r) for r in cur.fetchall()]


@router.get("/banner")
def my_banner(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    rows = _active_banners(cur, db, user_id)
    return ok(data=[{"id": r["id"], "version": r["banner_version"], "campus": r["campus"], "session": r["session"],
                     "closes_on": str(r["closes_on"]) if r["closes_on"] else None, "campus_id": r["campus_id"]} for r in rows])


@router.get("/banner/{setting_id}/image")
def banner_image(setting_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT banner_path, banner_mime FROM admission_settings WHERE id=%s AND banner_path IS NOT NULL AND is_published", (setting_id,))
    s = cur.fetchone()
    if not s: fail("Not found.", 404)
    A = _A()
    path = os.path.realpath(os.path.join(A.BANNER_DIR, s["banner_path"]))
    if not path.startswith(os.path.realpath(A.BANNER_DIR)) or not os.path.exists(path): fail("Not found.", 404)
    return FileResponse(path, media_type=s["banner_mime"] or "image/jpeg", headers={"Cache-Control": "private, max-age=300"})


class BannerDismissIn(BaseModel):
    version: int


@router.post("/banner/{setting_id}/dismiss")
def dismiss_banner(setting_id: int, body: BannerDismissIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """'Don't show again' for this banner (a newly uploaded banner shows again)."""
    cur = get_cur(db)
    cur.execute("SELECT 1 FROM admission_settings WHERE id=%s", (setting_id,))
    if not cur.fetchone(): fail("Not found.", 404)
    cur.execute("""INSERT INTO admission_banner_dismissals (user_id, setting_id, banner_version) VALUES (%s,%s,%s)
                   ON CONFLICT (user_id, setting_id) DO UPDATE SET banner_version=EXCLUDED.banner_version, dismissed_at=fn_admission_now()""",
                (user_id, setting_id, body.version))
    db.commit()
    return ok(message="This announcement won't be shown again.")



@router.get("/announcement/{setting_id}")
def announcement(setting_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """The admission announcement page (from a notification / news): schedule, banner, fee, documents."""
    cur = get_cur(db)
    cur.execute("SELECT campus_id, academic_year_id, is_published, banner_path FROM admission_settings WHERE id=%s", (setting_id,))
    s = cur.fetchone()
    if not s or not s["is_published"]: fail("This admission announcement is no longer available.", 404)
    sched = public_schedule(campus_id=s["campus_id"], db=db)["data"] if _published(cur, s["campus_id"]) else None
    if not sched: fail("This admission announcement is no longer available.", 404)
    cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name='parent'", (user_id,))
    return ok(data={**sched, "setting_id": setting_id, "has_banner": bool(s["banner_path"]), "is_parent": bool(cur.fetchone())})



@router.get("/public/lookup/student")
def public_lookup_student(request: Request, enrollment_no: str, cnic: str, db=Depends(get_db)):
    """A sibling on the public form: shown only when the family's CNIC matches that student's record."""
    _rate_limit(request, "lookup", 30, 3600)
    A = _A()
    cur = get_cur(db)
    s = A.student_brief(cur, enrollment_no)
    d = A._cnic_digits(cnic)
    if not s or s["status"] != "active" or len(d) != 13 or not A._cnic_matches_student(cur, s["id"], [d]):
        fail("No match - check the registration number and the father's or mother's CNIC.", 404)   # same answer either way
    return ok(data={k: s[k] for k in ("enrollment_no", "name", "class_name", "campus")})


@router.get("/my/lookup/cnic")
def my_lookup_cnic(cnic: str, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """A logged-in parent: details from THEIR OWN earlier applications / children only."""
    cur = _parent_only(user_id, db)
    found = _A().cnic_lookup(cur, cnic, parent_user_id=user_id)
    return ok(data=found, message="Details found." if found else "No earlier record for this CNIC.")


@router.get("/my/lookup/student")
def my_lookup_student(enrollment_no: str, cnic: Optional[str] = None, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """A logged-in parent: their own child directly, otherwise only with a matching family CNIC."""
    A = _A()
    cur = _parent_only(user_id, db)
    s = A.student_brief(cur, enrollment_no)
    ok_ = s and s["status"] == "active" and (s["parent_id"] == user_id or (cnic and A._cnic_matches_student(cur, s["id"], [A._cnic_digits(cnic)])))
    if not ok_: fail("No match - check the registration number and the father's or mother's CNIC.", 404)
    return ok(data={k: s[k] for k in ("enrollment_no", "name", "class_name", "campus")})



@router.get("/public/lookup/cnic")
def public_lookup_cnic(request: Request, cnic: str, db=Depends(get_db)):
    """Public form: a parent's saved details for a CNIC (school's choice), limited to 40 look-ups an hour per connection."""
    _rate_limit(request, "cnic_lookup", 40, 3600)
    found = _A().cnic_lookup(get_cur(db), cnic)
    if not found:
        return ok(data=None, message="No earlier record.")
    return ok(data={k: found.get(k) for k in ("name", "phone", "occupation", "email", "found_as")}, message="Details found.")
