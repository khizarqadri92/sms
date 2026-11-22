"""
Admission workflow - the ONLY place an application's status changes.

Every action declares: which statuses it may start from, the status it leads to,
who may perform it (a permission, the applicant's own parent, or the system),
and the conditions that must hold. API endpoints call perform(); they never set
a status themselves, so no stage can be skipped from the UI or a direct request.

Overrides: a user with admission.decide may skip a failed CONDITION (never the
permission or the from-status rule) by passing override=True with a reason;
it is recorded in the history as an override.
"""
from datetime import date

# ------------------------------------------------------------------ statuses
STATUS_LABELS = {
    "draft": "Draft", "submitted": "Application Submitted", "initial_verification": "Initial Verification",
    "correction_required": "Correction Required", "document_verification": "Document Verification",
    "documents_rejected": "Documents Rejected", "test_scheduled": "Test Scheduled", "test_completed": "Test Completed",
    "interview_scheduled": "Interview Scheduled", "interview_completed": "Interview Completed",
    "awaiting_approval": "Awaiting Principal Approval", "further_evaluation": "Further Evaluation Required",
    "approved": "Principal Approved", "rejected": "Principal Rejected", "on_hold": "On Hold",
    "waiting_list": "Waiting List", "fee_voucher_generated": "Fee Voucher Generated",
    "payment_partially_paid": "Payment Partially Paid", "payment_verified": "Payment Verified",
    "admission_completed": "Admission Completed", "withdrawn": "Withdrawn",
}
TERMINAL = {"admission_completed", "rejected", "withdrawn"}
# statuses that hold a seat in the class (count against capacity)
SEAT_HOLDING = {"approved", "fee_voucher_generated", "payment_partially_paid", "payment_verified", "admission_completed"}

APPLICANT = "applicant"     # the application's own parent account
SYSTEM = "system"           # internal hooks (e.g. payment verified by finance)

# ------------------------------------------------------------------ actions
# from: allowed starting statuses | to: resulting status | who: permission / APPLICANT / SYSTEM (a list = any of them)
# needs: condition names checked before the move | remarks: reason required
ACTIONS = {
    "submit":             {"from": ["draft"], "to": "submitted", "who": [APPLICANT, "admissions.application_create"], "needs": ["admission_open", "documents_uploaded"]},
    "start_review":       {"from": ["submitted"], "to": "initial_verification", "who": ["admissions.application_review"]},
    "verify_information": {"from": ["initial_verification"], "to": "document_verification", "who": ["admissions.application_review"], "needs": ["age_eligible"]},
    "request_correction": {"from": ["initial_verification", "document_verification", "documents_rejected"], "to": "correction_required",
                           "who": ["admissions.application_review"], "remarks": True},
    "resubmit":           {"from": ["correction_required"], "to": "initial_verification", "who": [APPLICANT, "admissions.application_edit"]},
    "reject_documents":   {"from": ["document_verification"], "to": "documents_rejected", "who": ["admissions.document_verification"],
                           "needs": ["some_document_rejected"], "remarks": True},
    "resubmit_documents": {"from": ["documents_rejected"], "to": "document_verification", "who": [APPLICANT, "admissions.application_edit", "admissions.document_upload"]},
    # SYSTEM = joining the class's combined test session automatically
    "schedule_test":      {"from": ["document_verification", "further_evaluation"], "to": "test_scheduled", "who": [SYSTEM, "admissions.admission_test_schedule"],
                           "needs": ["documents_verified", "test_enabled", "test_record_exists"]},
    # SYSTEM = marks entered by the test's assigned examiner (checked by the API)
    "record_test":        {"from": ["test_scheduled"], "to": "test_completed", "who": [SYSTEM, "admissions.admission_test_marks_entry"], "needs": ["test_result_recorded"]},
    "schedule_interview": {"from": ["document_verification", "test_completed", "further_evaluation"], "to": "interview_scheduled",
                           "who": ["admissions.interview_schedule"], "needs": ["documents_verified", "interview_enabled", "test_done_if_required",
                                                                  "interview_record_exists"]},
    # SYSTEM = recorded by a member of the interview panel (checked by the API)
    "record_interview":   {"from": ["interview_scheduled"], "to": "interview_completed", "who": [SYSTEM, "admissions.interview_result_recording"],
                           "needs": ["interview_result_recorded"]},
    "send_for_approval":  {"from": ["document_verification", "test_completed", "interview_completed", "further_evaluation"],
                           "to": "awaiting_approval", "who": [SYSTEM, "admissions.application_review", "admissions.admission_test_marks_entry", "admissions.interview_result_recording"],
                           "needs": ["documents_verified", "test_done_if_required", "interview_done_if_required"]},
    # principal
    # "system" = the Workflow Builder approval chain completing (its last step approved / any step rejected)
    "approve":            {"from": ["awaiting_approval", "on_hold", "waiting_list"], "to": "approved", "who": [SYSTEM, "admissions.admission_approval"],
                           "needs": ["seat_available"]},
    "reject":             {"from": ["initial_verification", "document_verification", "documents_rejected", "test_completed",
                                    "interview_completed", "awaiting_approval", "further_evaluation", "on_hold", "waiting_list"],
                           "to": "rejected", "who": [SYSTEM, "admissions.admission_approval"], "remarks": True},
    "request_evaluation": {"from": ["awaiting_approval"], "to": "further_evaluation", "who": ["admissions.admission_waiting_list_hold"], "remarks": True},
    "return_correction":  {"from": ["awaiting_approval"], "to": "correction_required", "who": ["admissions.admission_waiting_list_hold", "admissions.admission_approval"], "remarks": True},
    "hold":               {"from": ["awaiting_approval", "waiting_list"], "to": "on_hold", "who": ["admissions.admission_waiting_list_hold"], "remarks": True},
    "waitlist":           {"from": ["awaiting_approval", "on_hold"], "to": "waiting_list", "who": ["admissions.admission_waiting_list_hold"]},
    # fee
    "generate_voucher":   {"from": ["approved"], "to": "fee_voucher_generated", "who": [SYSTEM, "admissions.student_registration", "admissions.admission_approval"],
                           "needs": ["voucher_linked"]},
    "payment_partial":    {"from": ["fee_voucher_generated"], "to": "payment_partially_paid", "who": [SYSTEM]},
    "payment_verified":   {"from": ["fee_voucher_generated", "payment_partially_paid"], "to": "payment_verified", "who": [SYSTEM],
                           "needs": ["voucher_paid"]},
    # SYSTEM = no admission fee this session
    "waive_fee":          {"from": ["approved", "fee_voucher_generated", "payment_partially_paid"], "to": "payment_verified",
                           "who": [SYSTEM, "admissions.admission_fee_waiver"], "remarks": True},
    # registration
    "register":           {"from": ["payment_verified"], "to": "admission_completed", "who": ["admissions.student_registration"],
                           "needs": ["student_linked"]},
    # anyone involved can withdraw a live application
    "withdraw":           {"from": [s for s in STATUS_LABELS if s not in TERMINAL], "to": "withdrawn",
                           "who": [APPLICANT, "admissions.application_withdraw"], "remarks": True},
}


# Functions called after every successful transition: hook(cur, app_id, action, from_status, to_status, remarks).
# They must not raise (admissions.py wraps its notifier in a savepoint).
AFTER_TRANSITION = []


class WorkflowError(Exception):
    """A refused transition; .status_code mirrors the HTTP code the API should return."""
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


# ------------------------------------------------------------------ actor
def actor(user_id, permissions=(), roles=(), system=False):
    return {"user_id": user_id, "perms": set(permissions or ()), "roles": set(roles or ()), "system": system}


def _allowed(spec, act, app):
    for who in spec["who"]:
        if who == SYSTEM and act["system"]:
            return True
        if who == APPLICANT and app.get("parent_user_id") and act["user_id"] == app["parent_user_id"]:
            return True
        if who not in (SYSTEM, APPLICANT) and who in act["perms"]:
            return True
    return False


# ------------------------------------------------------------------ conditions
def _settings(cur, app):
    cur.execute("""SELECT * FROM admission_settings WHERE campus_id=%s AND academic_year_id=%s""",
                (app["campus_id"], app["academic_year_id"]))
    s = cur.fetchone()
    return dict(s) if s else {"test_required": True, "interview_required": True}


def _class_setting(cur, app):
    cur.execute("""SELECT cs.* FROM admission_class_settings cs JOIN admission_settings s ON s.id=cs.setting_id
                   WHERE s.campus_id=%s AND s.academic_year_id=%s AND lower(cs.class_name)=lower(%s)""",
                (app["campus_id"], app["academic_year_id"], app["class_name"]))
    r = cur.fetchone()
    return dict(r) if r else None


def required_documents(settings, app):
    """
    The documents this application must have. A document about the GUARDIAN is only
    needed when the primary guardian is 'Other' - when the father or mother is the
    guardian, their own CNIC already covers it.
    """
    req = settings.get("required_documents") or []
    if app.get("primary_guardian") != "other":
        req = [r for r in req if "guardian" not in r.lower()]
    return req


def _docs(cur, app_id):
    cur.execute("SELECT document_name, status FROM admission_documents WHERE application_id=%s", (app_id,))
    return [dict(r) for r in cur.fetchall()]


def _latest(cur, table, app_id):
    cur.execute(f"SELECT * FROM {table} WHERE application_id=%s ORDER BY id DESC LIMIT 1", (app_id,))
    r = cur.fetchone()
    return dict(r) if r else None


def _age_on(dob, on):
    """Age in years (with fraction) on a given date."""
    return (on - dob).days / 365.25


def check(cur, app, name, today):
    """Returns None if the condition holds, else a human-readable reason."""
    if name == "admission_open":
        s = _settings(cur, app)
        if not s.get("id"):
            return "Admissions are not set up for this campus and session."
        if not s.get("is_active", True):
            return "Admissions are closed for this session."
        if s.get("opens_on") and today < s["opens_on"]:
            return f"Admissions open on {s['opens_on']:%d %b %Y}."
        if s.get("closes_on") and today > s["closes_on"]:
            return f"Admissions closed on {s['closes_on']:%d %b %Y}."
        cs = _class_setting(cur, app)
        if cs is not None and not cs["is_open"]:
            return f"Admissions for {app['class_name']} are closed."
        return None
    if name == "documents_uploaded":
        s = _settings(cur, app)
        required = required_documents(s, app)
        have = {d["document_name"].strip().lower() for d in _docs(cur, app["id"])}
        missing = [r for r in required if r.strip().lower() not in have]
        return ("Please upload: " + ", ".join(missing) + ".") if missing else None
    if name == "age_eligible":
        cs = _class_setting(cur, app)
        if not cs or (cs["min_age_years"] is None and cs["max_age_years"] is None):
            return None
        cur.execute("SELECT start_date FROM academic_years WHERE id=%s", (app["academic_year_id"],))
        y = cur.fetchone()
        on = (y and y["start_date"]) or today
        age = round(_age_on(app["date_of_birth"], on), 1)
        if cs["min_age_years"] is not None and age < float(cs["min_age_years"]):
            return f"The child is {age} years old on {on:%d %b %Y}; {app['class_name']} needs at least {cs['min_age_years']}."
        if cs["max_age_years"] is not None and age > float(cs["max_age_years"]):
            return f"The child is {age} years old on {on:%d %b %Y}; {app['class_name']} allows at most {cs['max_age_years']}."
        return None
    if name == "documents_verified":
        docs = _docs(cur, app["id"])
        if not docs:
            return "No documents have been uploaded."
        have = {d["document_name"].strip().lower() for d in docs}
        missing = [r for r in required_documents(_settings(cur, app), app) if r.strip().lower() not in have]
        if missing:
            return "Still missing: " + ", ".join(missing) + "."
        pending = [d["document_name"] for d in docs if d["status"] != "verified"]
        return ("These documents are not verified yet: " + ", ".join(pending) + ".") if pending else None
    if name == "some_document_rejected":
        return None if any(d["status"] in ("rejected", "resubmission_required") for d in _docs(cur, app["id"])) \
            else "Mark which documents are rejected or need resubmission first."
    if name == "test_enabled":
        return None if _settings(cur, app).get("test_required") else "An admission test is not required for this session."
    if name == "interview_enabled":
        return None if _settings(cur, app).get("interview_required") else "An interview is not required for this session."
    if name == "test_record_exists":
        t = _latest(cur, "admission_tests", app["id"])
        return None if t and not t.get("result") else "Create the test schedule first."
    if name == "test_result_recorded":
        t = _latest(cur, "admission_tests", app["id"])
        return None if t and t.get("result") else "Enter the test marks first."
    if name == "test_done_if_required":
        if not _settings(cur, app).get("test_required"):
            return None
        t = _latest(cur, "admission_tests", app["id"])
        return None if t and t.get("result") else "The admission test must be completed first."
    if name == "interview_record_exists":
        i = _latest(cur, "admission_interviews", app["id"])
        return None if i and not i.get("recommendation") else "Create the interview schedule first."
    if name == "interview_result_recorded":
        i = _latest(cur, "admission_interviews", app["id"])
        return None if i and i.get("recommendation") else "Record the interview recommendation first."
    if name == "interview_done_if_required":
        if not _settings(cur, app).get("interview_required"):
            return None
        i = _latest(cur, "admission_interviews", app["id"])
        return None if i and i.get("recommendation") else "The interview must be completed first."
    if name == "seat_available":
        cs = _class_setting(cur, app)
        if not cs or cs["capacity"] is None:
            return None
        cur.execute("""SELECT COUNT(*) AS n FROM admission_applications
                       WHERE campus_id=%s AND academic_year_id=%s AND lower(class_name)=lower(%s) AND status = ANY(%s) AND id<>%s""",
                    (app["campus_id"], app["academic_year_id"], app["class_name"], list(SEAT_HOLDING), app["id"]))
        taken = cur.fetchone()["n"]
        return None if taken < cs["capacity"] else \
            f"{app['class_name']} is full ({taken}/{cs['capacity']} admission seats taken). Move to the waiting list instead."
    if name == "voucher_linked":
        return None if app.get("fee_invoice_id") else "Generate the admission fee voucher first."
    if name == "voucher_paid":
        if not app.get("fee_invoice_id"):
            return "No fee voucher is linked."
        cur.execute("SELECT status FROM fee_invoices WHERE id=%s", (app["fee_invoice_id"],))
        r = cur.fetchone()
        return None if r and r["status"] == "paid" else "The admission fee is not fully paid and verified yet."
    if name == "student_linked":
        return None if app.get("student_id") else "Create the student record first."
    raise ValueError("Unknown condition: " + name)


# ------------------------------------------------------------------ public API
def load(cur, app_id, lock=False):
    cur.execute("SELECT * FROM admission_applications WHERE id=%s" + (" FOR UPDATE" if lock else ""), (app_id,))
    r = cur.fetchone()
    if not r:
        raise WorkflowError("Application not found.", 404)
    return dict(r)


def available_actions(cur, app, act, today):
    """Actions this user could take now, with the reason any is blocked (for the UI)."""
    out = []
    for name, spec in ACTIONS.items():
        if app["status"] not in spec["from"] or not _allowed(spec, act, app):
            continue
        blocked = next((r for r in (check(cur, app, n, today) for n in spec.get("needs", [])) if r), None)
        out.append({"action": name, "to": spec["to"], "to_label": STATUS_LABELS[spec["to"]],
                    "needs_remarks": bool(spec.get("remarks")), "blocked": blocked})
    return out


def perform(cur, app_id, action, act, today, remarks=None, internal=False, override=False):
    """
    Validates and applies one transition, writing it to the history. Raises
    WorkflowError if anything is wrong. Caller commits.
    """
    spec = ACTIONS.get(action)
    if not spec:
        raise WorkflowError("Unknown action.", 400)
    app = load(cur, app_id, lock=True)                       # serialise concurrent actions on one application
    if app["status"] not in spec["from"]:
        raise WorkflowError(f"This can't be done while the application is '{STATUS_LABELS.get(app['status'], app['status'])}'.", 409)
    if not _allowed(spec, act, app):
        raise WorkflowError("You don't have permission to do this.", 403)
    remarks = (remarks or "").strip() or None
    if spec.get("remarks") and not remarks:
        raise WorkflowError("Please give a reason.", 400)
    failed = [r for r in (check(cur, app, n, today) for n in spec.get("needs", [])) if r]
    if failed:
        if not override:
            raise WorkflowError(failed[0], 400)
        if "admissions.admission_rule_override" not in act["perms"]:
            raise WorkflowError("Only someone with final admission authority can override: " + failed[0], 403)
        if not remarks:
            raise WorkflowError("An override needs a reason.", 400)
    to = spec["to"]
    sets = ["status=%s", "updated_at=fn_admission_now()"]
    vals = [to]
    if action == "submit":
        sets.append("submitted_at=COALESCE(submitted_at, fn_admission_now())")
    if action == "register":
        sets.append("completed_at=fn_admission_now()")
    if action == "waive_fee":
        sets.append("fee_waived=TRUE")
    if action == "waitlist":
        cur.execute("""SELECT COALESCE(MAX(waiting_list_position),0)+1 AS n FROM admission_applications
                       WHERE campus_id=%s AND academic_year_id=%s AND lower(class_name)=lower(%s) AND status='waiting_list'""",
                    (app["campus_id"], app["academic_year_id"], app["class_name"]))
        sets.append("waiting_list_position=%s"); vals.append(cur.fetchone()["n"])
    elif app["status"] == "waiting_list":
        sets.append("waiting_list_position=NULL")
    cur.execute(f"UPDATE admission_applications SET {', '.join(sets)} WHERE id=%s", vals + [app_id])
    cur.execute("""INSERT INTO admission_status_history (application_id, action, from_status, to_status, remarks, is_internal, is_override, acted_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (app_id, action, app["status"], to, remarks, bool(internal), bool(failed and override),
                 None if act["system"] else act["user_id"]))
    for hook in AFTER_TRANSITION:
        hook(cur, app_id, action, app["status"], to, None if internal else remarks)
    return to
