from app.utils.workflow_engine import engine as wf_engine
"""
Native FastAPI router for Withdrawal - migrated from app/api/v1/withdrawal.py.
All 8 broken chr()-stub stored procedures have been dropped and rebuilt
cleanly before this migration. File upload uses FastAPI native UploadFile/Form
and FileResponse for document download.
"""

import os
import time
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "withdrawal")
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}
ALLOWED_PERMS = {"withdrawal.view_own", "withdrawal.view_all", "withdrawal.review", "withdrawal.clear", "withdrawal.approve"}



def _is_wf_assignee(db, req_id, user_id, roles):
    """Returns True if user is assigned to an active workflow step for this request."""
    try:
        _c = get_cur(db)
        _c.execute("""
            SELECT 1 FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='withdrawal' AND wi.entity_type='withdrawal_request'
              AND wi.entity_id=%s AND wi.status='active'
              AND (wsi.assigned_to_id=%s OR wsi.assigned_role=ANY(%s::varchar[]))
            LIMIT 1
        """, (req_id, user_id, list(roles) if roles else []))
        return _c.fetchone() is not None
    except Exception:
        return False

def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def has_perm(perms, allowed):
    return any(p in perms for p in allowed)


class ReviewIn(BaseModel):
    action: str
    note: Optional[str] = ""
    departments: Optional[List[str]] = ["finance", "library", "admin"]


class ActionIn(BaseModel):
    action: str
    note: Optional[str] = ""
    department: Optional[str] = None


class RequireActionIn(BaseModel):
    note: str
    department: Optional[str] = None


class ConductIn(BaseModel):
    behaviour: Optional[str] = "Good"
    discipline: Optional[str] = "Good"
    academic_performance: Optional[str] = "Good"
    attendance_regularity: Optional[str] = "Good"
    cocurricular: Optional[str] = "Limited"
    disciplinary_action: Optional[bool] = False
    disciplinary_details: Optional[str] = ""
    remarks: Optional[str] = ""
    recommended_readmission: Optional[bool] = False


def _notify(cur, sp_args, title, body_text, ntype="info"):
    try:
        from app.utils.notify import send_notification
        import main as _main
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                uid = row.get("user_id") or row.get("requested_by") or row.get("id")
                if uid:
                    send_notification(uid, title=title, body=body_text, ntype=ntype)
    except Exception as e:
        print("[withdrawal notify]", e)



def _has_active_wr_workflow(db, req_id):
    try:
        _c = db.cursor()
        _c.execute("SELECT id FROM workflow_instances WHERE module='withdrawal' AND entity_type='withdrawal_request' AND entity_id=%s AND status='active' LIMIT 1", (req_id,))
        return _c.fetchone() is not None
    except Exception:
        return False


def _wr_context(db, req_id):
    try:
        _c = db.cursor()
        _c.execute("""
            SELECT wr.student_id, wr.requested_by,
                   COALESCE((SELECT COUNT(*)>0 FROM fee_invoices fi WHERE fi.student_id=wr.student_id AND fi.status='unpaid'), false) AS has_dues,
                   false AS has_books
            FROM withdrawal_requests wr WHERE wr.id=%s
        """, (req_id,))
        row = _c.fetchone()
        if row:
            return {
                "entity_id": req_id,
                "student_id": row[0],
                "requested_by": row[1],
                "has_dues": str(row[2]).lower(),
                "has_books": str(row[3]).lower()
            }
    except Exception as _e:
        print("[wr_context error]", _e)
    return {"entity_id": req_id}


def _engine_advance_wr(db, req_id, action, user_id, note):
    try:
        _c = db.cursor()
        _c.execute(
            """SELECT ws.entity_status_on_approve, ws.entity_status_on_reject
               FROM workflow_step_instances wsi
               JOIN workflow_steps ws ON ws.id=wsi.step_id
               JOIN workflow_instances wi ON wi.id=wsi.instance_id
               WHERE wi.module='withdrawal' AND wi.entity_type='withdrawal_request'
                 AND wi.entity_id=%s AND wsi.status='pending'
               ORDER BY wsi.step_order LIMIT 1""",
            (req_id,)
        )
        ws = _c.fetchone()
        is_rej = action in ('reject','rejected')
        if is_rej:
            new_status = (ws[1] if ws and ws[1] else 'rejected')
        else:
            default_s = 'approved' if action == 'approve' else action
            new_status = (ws[0].lower() if ws and ws[0] else default_s)

        _adv = wf_engine.advance(
            db, module="withdrawal", entity_type="withdrawal_request",
            entity_id=req_id, action=action, actioned_by=user_id, note=note or ""
        )
        # Update withdrawal status
        if is_rej:
            _c.execute("UPDATE withdrawal_requests SET status=%s WHERE id=%s", (new_status, req_id))
        elif _adv and _adv.get("status") == "completed":
            _c.execute("UPDATE withdrawal_requests SET status='approved' WHERE id=%s", (req_id,))
            # Mark student as withdrawn
            _c.execute("""
                UPDATE students SET status='withdrawn'
                WHERE id=(SELECT student_id FROM withdrawal_requests WHERE id=%s)
            """, (req_id,))
            new_status = "approved"
        else:
            if new_status not in ("pending","reviewed","in_clearance","cleared","approved","rejected","cancelled"):
                new_status = "pending"
            _c.execute("UPDATE withdrawal_requests SET status=%s WHERE id=%s", (new_status, req_id))
        return True, new_status
    except Exception as _e:
        import traceback; traceback.print_exc()
        print("[engine_advance_wr error]", _e)
        return False, None

@router.get("/")
def list_withdrawals(
    user_id: int = Depends(get_current_user_id),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
):
    perms = claims.get("permissions", [])
    roles = claims.get("roles", [])
    if not has_perm(perms, ALLOWED_PERMS):
        # Allow if assigned to active workflow step for this request
        _wc = get_cur(db)
        _wc.execute("""
            SELECT 1 FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='withdrawal' AND wi.entity_type='withdrawal_request'
              AND wi.entity_id=%s
              AND (wsi.assigned_to_id=%s OR wsi.assigned_role=ANY(%s::varchar[]))
            LIMIT 1
        """, (req_id, user_id, roles))
        if not _wc.fetchone():
            fail("Permission denied", 403)

    view_all = any(p in perms for p in ("withdrawal.view_all", "withdrawal.review", "withdrawal.clear", "withdrawal.approve"))
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    cur = get_cur(db)

    if role == "teacher":
        cur.execute("SELECT * FROM sp_get_teacher_class_ids_by_user(%s)", (user_id,))
        teacher_classes = {r["class_id"]: r["is_primary"] for r in cur.fetchall()}
        if not teacher_classes:
            return ok(data=[])
        cur.execute("SELECT * FROM sp_get_withdrawals_for_classes(%s)", (list(teacher_classes.keys()),))
        rows = [dict(r) for r in cur.fetchall()]
        for row in rows:
            cur.execute("SELECT * FROM sp_get_withdrawal_clearances(%s)", (row["id"],))
            row["clearances"] = [dict(c) for c in cur.fetchall()]
            for k in ("requested_at", "effective_date"):
                if row.get(k): row[k] = str(row[k])
            row["is_incharge"] = bool(teacher_classes.get(row.get("class_id"), False))
        return ok(data=rows)

    cur.execute("SELECT * FROM sp_get_withdrawal_list(%s, %s)", (user_id, view_all))
    rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        cur.execute("SELECT * FROM sp_get_withdrawal_clearances(%s)", (row["id"],))
        row["clearances"] = [dict(c) for c in cur.fetchall()]
        for k in ("requested_at", "effective_date"):
            if row.get(k): row[k] = str(row[k])
    return ok(data=rows)


@router.get("/student/{student_id}/books")
def student_books(student_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_student_issued_books(%s)", (student_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("issued_at", "due_date", "returned_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


@router.get("/{req_id}")
def get_withdrawal(req_id: int, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    perms = claims.get("permissions", [])
    roles = claims.get("roles", [])
    if not has_perm(perms, ALLOWED_PERMS):
        # Allow if assigned to active workflow step for this request
        _wc = get_cur(db)
        _wc.execute("""
            SELECT 1 FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='withdrawal' AND wi.entity_type='withdrawal_request'
              AND wi.entity_id=%s
              AND (wsi.assigned_to_id=%s OR wsi.assigned_role=ANY(%s::varchar[]))
            LIMIT 1
        """, (req_id, user_id, roles))
        if not _wc.fetchone():
            fail("Permission denied", 403)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_detail(%s)", (req_id,))
    row = cur.fetchone()
    if not row:
        fail("Withdrawal request not found", 404)
    result = dict(row)
    for k in ("requested_at", "effective_date", "coordinator_at", "principal_at"):
        if result.get(k): result[k] = str(result[k])
    cur.execute("SELECT * FROM sp_get_withdrawal_clearances(%s)", (req_id,))
    result["clearances"] = [dict(c) for c in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_withdrawal_documents(%s)", (req_id,))
    result["documents"] = [dict(d) for d in cur.fetchall()]
    return ok(data=result)


@router.post("/apply")
def apply_withdrawal(
    student_id: Optional[Any] = Form(None), reason: Optional[str] = Form(""),
    effective_date: Optional[str] = Form(None), document: Optional[UploadFile] = File(None),
    user_id: int = Depends(require_permission("withdrawal.apply")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    if not student_id or not (reason or "").strip():
        fail("student_id and reason are required", 400)

    cur = get_cur(db)
    if role == "parent":
        cur.execute("SELECT id FROM students WHERE id=%s AND parent_id=%s", (student_id, user_id))
        if not cur.fetchone():
            fail("Student not found or not your child", 403)

    doc_url = None
    if document and document.filename:
        ext = os.path.splitext(document.filename)[1].lower()
        if ext not in ALLOWED_EXT:
            fail("Invalid file type", 400)
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        fname = "withdrawal_" + str(user_id) + "_" + str(int(time.time())) + ext
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
            f.write(document.file.read())
        doc_url = fname

    cur.execute("SELECT * FROM sp_apply_withdrawal(%s,%s,%s,%s,%s)", (student_id, user_id, reason, effective_date or None, doc_url))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("academic_coordinator",))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], title="New Withdrawal Request",
                    body="A parent has submitted a student withdrawal request.", ntype="info")
    except Exception as e:
        print("[withdrawal notify]", e)

    # Engine trigger
    try:
        req_id = result["id"]
        _ctx = _wr_context(db, req_id)
        db.rollback()  # Reset any failed transaction from _wr_context
        _wf = wf_engine.trigger(
            db, module="withdrawal", entity_type="withdrawal_request",
            entity_id=req_id, initiated_by=user_id,
            submitter_id=user_id, context=_ctx
        )
        if _wf: db.commit()
    except Exception as _we:
        import traceback; traceback.print_exc()
        print("[withdrawal WF trigger error]", _we)
    return ok(data={"id": result["id"]}, message="Withdrawal request submitted.")


@router.post("/{req_id}/review")
def review_withdrawal(req_id: int, body: ReviewIn, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    roles = claims.get("roles", [])
    if not _is_wf_assignee(db, req_id, user_id, roles):
        if body.action not in ("approve", "reject"):
            fail("action must be approve or reject", 400)
    cur = get_cur(db)
    # Engine-first
    if _has_active_wr_workflow(db, req_id):
        _ok, _st = _engine_advance_wr(db, req_id, body.action, user_id, body.note)
        if not _ok: fail("Workflow advance failed", 500)
        db.commit()
        return ok(message="Withdrawal reviewed.")
    cur.execute("SELECT * FROM sp_review_withdrawal(%s,%s,%s,%s,%s)", (req_id, user_id, body.action, body.note or "", body.departments))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    if body.action == "approve":
        try:
            from app.utils.notify import send_notification
            import main as _main
            dept_roles = {"finance": "finance_officer", "library": "librarian", "admin": "admin", "hr": "hr", "transport": "transport"}
            notify_rows = []
            for dept in (body.departments or []):
                role_name = dept_roles.get(dept)
                if role_name:
                    cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", (role_name,))
                    notify_rows.extend(cur.fetchall())
            with _main.flask_app.app_context():
                for row in notify_rows:
                    send_notification(row["user_id"], title="Withdrawal Clearance Required",
                        body="A student withdrawal requires your department clearance.", ntype="warning")
        except Exception as e:
            print("[withdrawal notify]", e)

    if body.action == "reject":
        try:
            from app.utils.notify import send_notification
            import main as _main
            cur.execute("SELECT * FROM sp_get_withdrawal_requester(%s)", (req_id,))
            row = cur.fetchone()
            if row:
                dept_label = department.replace("_", " ").title()
                note_preview = (body.note or "")[:120]
                with _main.flask_app.app_context():
                    send_notification(row["requested_by"], title="Withdrawal: " + dept_label + " Clearance Issue",
                        body="Your withdrawal request has an issue with " + dept_label + " clearance. Reason: " + note_preview + ". Please check your withdrawal status.", ntype="warning")
        except Exception as e:
            print("[withdrawal reject notify]", e)

    return ok(message="Withdrawal " + body.action + "d.")


@router.post("/{req_id}/clear")
def clear_withdrawal(req_id: int, body: ActionIn, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    if body.action not in ("reject",):
        cur2 = get_cur(db)
        cur2.execute("""
            SELECT COUNT(*) as cnt FROM work_queue_items
            WHERE entity_id=%s AND module='withdrawal' AND entity_status='action_required' AND status='pending'
        """, (req_id,))
        if cur2.fetchone()["cnt"] > 0:
            fail("Cannot proceed: waiting for parent to respond to action request.", 400)
    roles = claims.get("roles", [])
    if body.action not in ("clear", "reject", "approve"):
        fail("action must be clear or reject", 400)
    if not _is_wf_assignee(db, req_id, user_id, roles):
        fail("Permission denied", 403)
    # Engine-first
    if _has_active_wr_workflow(db, req_id):
        _ok, _st = _engine_advance_wr(db, req_id, body.action, user_id, body.note)
        if not _ok: fail("Workflow advance failed", 500)
        db.commit()
        return ok(message="Clearance recorded.")
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    dept_map = {"finance_officer": "finance", "librarian": "library", "admin": "admin", "hr": "hr", "superadmin": body.department or "admin"}
    department = dept_map.get(role, role)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_clear_withdrawal(%s,%s,%s,%s,%s)", (req_id, department, user_id, body.action, body.note or ""))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    if result and result.get("all_cleared"):
        try:
            from app.utils.notify import send_notification
            import main as _main
            cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("principal",))
            rows = cur.fetchall()
            with _main.flask_app.app_context():
                for row in rows:
                    send_notification(row["user_id"], title="Withdrawal Ready for Final Approval",
                        body="All departments have cleared the withdrawal. Your approval is required.", ntype="info")
        except Exception as e:
            print("[withdrawal notify]", e)

    return ok(message="Department clearance " + body.action + "ed.")


@router.post("/{req_id}/approve")
def approve_withdrawal(req_id: int, body: ActionIn, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    if body.action not in ("approve", "reject"):
        fail("action must be approve or reject", 400)
    cur = get_cur(db)
    # Engine-first
    if _has_active_wr_workflow(db, req_id):
        _ok, _st = _engine_advance_wr(db, req_id, body.action, user_id, body.note)
        if not _ok: fail("Workflow advance failed", 500)
        db.commit()
        return ok(message="Withdrawal " + body.action + "d.")
    cur.execute("SELECT * FROM sp_approve_withdrawal(%s,%s,%s,%s)", (req_id, user_id, body.action, body.note or ""))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_withdrawal_requester(%s)", (req_id,))
        row = cur.fetchone()
        if row:
            with _main.flask_app.app_context():
                send_notification(row["requested_by"], title="Withdrawal Request " + body.action.capitalize() + "d",
                    body="Your student withdrawal request has been " + body.action + "d by the principal.",
                    ntype="success" if body.action == "approve" else "warning")
    except Exception as e:
        print("[withdrawal notify]", e)

    return ok(message="Withdrawal request " + body.action + "d.")


@router.post("/{req_id}/require")


@router.get("/{req_id}/activity")
def get_withdrawal_activity(req_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT id, user_name, action, note, created_at, from_role
        FROM withdrawal_activity_log WHERE withdrawal_id=%s ORDER BY created_at ASC
    """, (req_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("created_at"): r["created_at"] = str(r["created_at"])
    return ok(data=rows)

@router.post("/{req_id}/parent-respond")
def parent_respond(req_id: int, body: RequireActionIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Parent responds to an action required request."""
    cur = get_cur(db)
    # Mark the action_required WQ items for this request as completed
    note_text = (body.note or "").strip()
    # Get parent name
    cur.execute("SELECT first_name||' '||last_name AS full_name FROM users WHERE id=%s", (user_id,))
    pu = cur.fetchone()
    parent_name = pu["full_name"] if pu else "Parent"
    # Find role of the latest require_action to link response
    cur.execute("SELECT from_role FROM withdrawal_activity_log WHERE withdrawal_id=%s AND action='require_action' ORDER BY created_at DESC LIMIT 1", (req_id,))
    rr = cur.fetchone()
    linked_role = rr["from_role"] if rr else None
    # Log parent response
    cur.execute("INSERT INTO withdrawal_activity_log (withdrawal_id, user_id, user_name, action, note, from_role) VALUES (%s,%s,%s,'parent_response',%s,%s)",
        (req_id, user_id, parent_name, note_text or "Response submitted.", linked_role))
    cur.execute("""
        UPDATE work_queue_items SET status='completed', completed_by=%s, completed_at=NOW(), updated_at=NOW()
        WHERE module='withdrawal' AND entity_id=%s AND action_required='submit' AND status='pending'
        RETURNING created_by
    """, (user_id, req_id))
    rows = cur.fetchall()
    db.commit()
    # Notify: the officer who created the action_required + current workflow step assignee
    try:
        from app.utils.notify import send_notification
        import main as _main
        notify_ids = set(row["created_by"] for row in rows if row["created_by"])
        # Also notify current workflow step assignee
        _nc = db.cursor()
        _nc.execute("""
            SELECT DISTINCT wsi.assigned_to_id FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='withdrawal' AND wi.entity_id=%s AND wsi.status='pending'
              AND wsi.assigned_to_id IS NOT NULL
        """, (req_id,))
        for r in _nc.fetchall(): notify_ids.add(r[0])
        with _main.flask_app.app_context():
            for nid in notify_ids:
                send_notification(nid, "Parent Responded",
                    "Parent has submitted the required information for withdrawal request.", "info")
    except Exception: pass
    return ok(message="Response submitted. Department officer notified.")




@router.post("/{req_id}/step-action-required")
def step_require_action(req_id: int, body: RequireActionIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Send a task to the parent/submitter without advancing the workflow engine."""
    cur = get_cur(db)
    cur.execute("SELECT requested_by, status FROM withdrawal_requests WHERE id=%s", (req_id,))
    wr = cur.fetchone()
    if not wr:
        fail("Withdrawal request not found", 404)
    # Create WQ item for parent with pending action
    cur.execute("""
        INSERT INTO work_queue_items
            (module, entity_type, entity_id, title, description, action_required,
             priority, assigned_user_id, link, metadata, entity_status, created_by, submitter_id)
        VALUES ('withdrawal','withdrawal_request',%s,'Action Required',
                %s,'submit','high',%s,'/withdrawal?id='||%s::text,'{}','action_required',%s,%s)
    """, (req_id, body.note or "Please provide the required information.",
          wr["requested_by"], req_id, user_id, wr["requested_by"]))
    # Log the action request with the requester's role
    cur.execute("SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s LIMIT 1", (user_id,))
    role_row = cur.fetchone()
    requester_role = role_row["name"] if role_row else "staff"
    cur.execute("SELECT first_name||' '||last_name AS full_name FROM users WHERE id=%s", (user_id,))
    req_user = cur.fetchone()
    cur.execute("""INSERT INTO withdrawal_activity_log (withdrawal_id,user_id,user_name,action,note,from_role)
        VALUES (%s,%s,%s,'require_action',%s,%s)""",
        (req_id, user_id, req_user["full_name"] if req_user else "Staff",
         body.note or "Action required.", requester_role))
    db.commit()
    # Notify parent
    try:
        from app.utils.notify import send_notification
        import main as _main
        with _main.flask_app.app_context():
            send_notification(wr["requested_by"], "Action Required",
                body.note or "Your withdrawal request requires action.", "warning")
    except Exception: pass
    return ok(message="Action request sent to parent.")

def require_action(req_id: int, body: RequireActionIn, user_id: int = Depends(require_permission("withdrawal.clear")), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    note = (body.note or "").strip()
    if not note:
        fail("Note is required", 400)
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    dept_map = {"finance_officer": "finance", "librarian": "library", "admin": "admin", "hr": "hr", "superadmin": body.department or "admin"}
    department = dept_map.get(role, role)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_withdrawal_require_action(%s,%s,%s,%s)", (req_id, department, user_id, note))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_withdrawal_requester(%s)", (req_id,))
        row = cur.fetchone()
        if row:
            with _main.flask_app.app_context():
                send_notification(row["requested_by"], title="Action Required for Withdrawal",
                    body="Your withdrawal request requires action: " + note[:100], ntype="warning")
    except Exception as e:
        print("[withdrawal notify]", e)

    return ok(message="Requirement submitted. Parent notified.")


@router.get("/{req_id}/conduct")
def get_conduct(req_id: int, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    perms = claims.get("permissions", [])
    allowed = {"withdrawal.view_all", "withdrawal.review", "withdrawal.approve", "attendance.view", "withdrawal.view_own", "withdrawal.clear"}
    if not has_perm(perms, allowed):
        fail("Permission denied", 403)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_conduct_form(%s)", (req_id,))
    row = cur.fetchone()
    if not row:
        return ok(data=None)
    result = dict(row)
    if result.get("submitted_at"): result["submitted_at"] = str(result["submitted_at"])
    return ok(data=result)


@router.post("/{req_id}/conduct")
def submit_conduct(req_id: int, body: ConductIn, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    if role not in ("teacher", "academic_coordinator", "superadmin", "admin"):
        fail("Only class teachers can submit conduct forms", 403)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_submit_conduct_form(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (req_id, user_id, body.behaviour, body.discipline, body.academic_performance,
         body.attendance_regularity, body.cocurricular, body.disciplinary_action,
         body.disciplinary_details, body.remarks, body.recommended_readmission))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("principal",))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], title="Conduct Form Submitted",
                    body="Class teacher has submitted the conduct form for a withdrawal request.", ntype="info")
    except Exception as e:
        print("[conduct notify]", e)

    # Advance workflow engine if conduct step is active
    try:
        from app.utils.workflow_engine import WorkflowEngine
        adv = WorkflowEngine().advance(db, "withdrawal", "withdrawal_request", req_id,
                      action="conduct", actioned_by=user_id,
                      note=body.remarks or "Conduct form submitted.")
        if adv and adv.get("status") == "completed":
            cur.execute("UPDATE withdrawal_requests SET status='approved' WHERE id=%s", (req_id,))
            cur.execute("""UPDATE students SET status='withdrawn'
                WHERE id=(SELECT student_id FROM withdrawal_requests WHERE id=%s)""", (req_id,))
            # Mark all pending WQ items for this request as completed
            cur.execute("""UPDATE work_queue_items SET status='completed', completed_by=%s, completed_at=NOW()
                WHERE module='withdrawal' AND entity_id=%s AND status='pending'""", (user_id, req_id))
        db.commit()
    except Exception as e:
        import traceback; traceback.print_exc()
        print("[conduct engine advance]", e)
    return ok(message="Conduct form submitted successfully.")


@router.post("/{req_id}/finalize")
def finalize_withdrawal(req_id: int, body: ActionIn, user_id: int = Depends(require_permission("withdrawal.review")), db=Depends(get_db)):
    if body.action not in ("approve", "reject"):
        fail("action must be approve or reject", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_finalize_withdrawal(%s,%s,%s,%s)", (req_id, user_id, body.action, body.note or ""))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_withdrawal_requester(%s)", (req_id,))
        row = cur.fetchone()
        if row:
            with _main.flask_app.app_context():
                send_notification(row["requested_by"], title="Withdrawal " + body.action.capitalize() + "d",
                    body="Your student withdrawal request has been finalized.",
                    ntype="success" if body.action == "approve" else "warning")
                if body.action == "approve":
                    cur.execute("SELECT * FROM sp_get_student_teachers_for_notify(%s)", (row["student_id"],))
                    for t in cur.fetchall():
                        send_notification(t["user_id"], title="Student Withdrawn",
                            body="A student in your class has been withdrawn from school.", ntype="info")
    except Exception as e:
        print("[withdrawal notify]", e)

    return ok(message="Withdrawal finalized.")


@router.get("/{req_id}/tc")
def get_tc(req_id: int, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    perms = claims.get("permissions", [])
    allowed = {"withdrawal.view_own", "withdrawal.view_all", "withdrawal.review", "withdrawal.approve"}
    if not has_perm(perms, allowed):
        fail("Permission denied", 403)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_tc(%s)", (req_id,))
    row = cur.fetchone()
    if not row:
        fail("TC data not found", 404)
    result = dict(row)
    for k in ("date_of_birth", "admission_date", "effective_date", "withdrawal_date"):
        if result.get(k): result[k] = str(result[k])
    return ok(data=result)


@router.get("/{req_id}/document/{doc_id}")


# ── Waiver endpoints ──────────────────────────────────────────────────────────

class WaiverRequestIn(BaseModel):
    invoice_id: Optional[Any] = None
    waiver_type: str
    waiver_amount: Optional[float] = None
    reason: Optional[str] = ""


class WaiverActionIn(BaseModel):
    action: str
    note: Optional[str] = ""
    approved_amount: Optional[float] = None


@router.get("/{req_id}/pending-invoices")
def get_pending_invoices(req_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_detail(%s)", (req_id,))
    wr = cur.fetchone()
    if not wr:
        fail("Withdrawal not found", 404)
    cur.execute("SELECT * FROM sp_get_student_pending_invoices(%s)", (wr["student_id"],))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("due_date"): r["due_date"] = str(r["due_date"])
    return ok(data=rows)


@router.post("/{req_id}/waiver-request")
def request_waiver(req_id: int, body: WaiverRequestIn, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    if body.waiver_type not in ("full", "partial"):
        fail("waiver_type must be full or partial", 400)
    if body.waiver_type == "partial" and not body.waiver_amount:
        fail("waiver_amount required for partial waiver", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_create_waiver_request(%s,%s,%s,%s,%s,%s) AS wid",
        (req_id, body.invoice_id or None, user_id, body.waiver_type, body.waiver_amount or None, body.reason or ""))
    waiver_id = cur.fetchone()["wid"]
    cur.execute("SELECT sp_set_clearance_waiver_requested(%s,%s)", (req_id, waiver_id))
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("finance_officer",))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], title="Fee Waiver Request from Parent",
                    body="A parent has submitted a fee waiver request for a withdrawal. Please review and forward to the authority if appropriate.", ntype="info")
    except Exception as e:
        print("[waiver notify]", e)
    return ok(data={"waiver_id": waiver_id}, message="Waiver request submitted. Finance team has been notified.")


@router.get("/{req_id}/waivers")
def get_waivers(req_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_waivers(%s)", (req_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("requested_at", "actioned_at"):
            if r.get(k): r[k] = str(r[k])
        if r.get("invoice_id"):
            cur.execute("SELECT * FROM sp_get_invoice_with_items(%s)", (r["invoice_id"],))
            items = cur.fetchall()
            if items:
                first = dict(items[0])
                r["invoice_total"] = first.get("invoice_total")
                r["invoice_net_amount"] = first.get("net_amount")
                r["invoice_status"] = first.get("invoice_status")
                r["invoice_due_date"] = str(first.get("due_date")) if first.get("due_date") else None
                r["invoice_month_year"] = first.get("month_year")
                r["invoice_items"] = [{"label": i["item_label"], "type": i["item_type"], "amount": i["item_amount"]} for i in items if i["item_label"]]
            else:
                r["invoice_items"] = []
        else:
            # No specific invoice linked - get all pending invoices for the student
            cur.execute("SELECT * FROM sp_get_withdrawal_detail(%s)", (req_id,))
            wr = cur.fetchone()
            if wr and wr.get("student_id"):
                cur.execute("SELECT * FROM sp_get_student_pending_invoices(%s)", (wr["student_id"],))
                pending = cur.fetchall()
                r["invoice_items"] = []
                r["invoice_total"] = sum(float(p["net_amount"] or 0) for p in pending)
                r["invoice_month_year"] = None
                for p in pending:
                    if p.get("due_date"): 
                        pass
                    r["invoice_items"].append({"label": "Invoice #" + str(p["id"]) + (" - " + str(p["month_year"]) if p.get("month_year") else ""), "type": "fee", "amount": p.get("net_amount")})
            else:
                r["invoice_items"] = []
    return ok(data=rows)


@router.post("/waivers/{waiver_id}/action")
def action_waiver(waiver_id: int, body: WaiverActionIn, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    if body.action not in ("approve", "reject"):
        fail("action must be approve or reject", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_waiver_request(%s)", (waiver_id,))
    waiver = cur.fetchone()
    if not waiver:
        fail("Waiver request not found", 404)
    if waiver["status"] not in ("pending", "forwarded"):
        fail("Waiver already actioned", 400)
    cur.execute("SELECT sp_get_waiver_authority_role() AS role")
    authority_role = cur.fetchone()["role"] or "principal"
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    perms = claims.get("permissions", [])
    if role != authority_role and "settings.manage" not in perms:
        fail("You are not authorized to action waiver requests", 403)
    if body.action == "approve":
        if body.approved_amount and float(body.approved_amount) > 0:
            # Principal approved a specific (partial) amount
            cur.execute("SELECT sp_approve_waiver_partial(%s,%s,%s,%s)",
                (waiver_id, user_id, body.note or "", body.approved_amount))
        else:
            # No specific amount - full waiver
            cur.execute("SELECT sp_approve_waiver_full(%s,%s,%s)", (waiver_id, user_id, body.note or ""))
    else:
        cur.execute("SELECT sp_reject_waiver(%s,%s,%s)", (waiver_id, user_id, body.note or ""))
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("finance_officer",))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], title="Fee Waiver " + body.action.capitalize() + "d",
                    body="The fee waiver request has been " + body.action + "d.", ntype="info")
    except Exception as e:
        print("[waiver notify]", e)
    return ok(message="Waiver " + body.action + "d.")




@router.post("/{req_id}/paid-notification")
def paid_notification(req_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Parent notifies finance that they have paid their dues."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_detail(%s)", (req_id,))
    wr = cur.fetchone()
    if not wr:
        fail("Withdrawal not found", 404)
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("finance_officer",))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], title="Fee Payment Notification",
                    body="Parent has notified that outstanding dues for student '" + (wr["student_name"] or "") + "' withdrawal have been paid. Please verify and clear.", ntype="info")
    except Exception as e:
        print("[paid notify]", e)
    return ok(message="Finance team notified.")



@router.post("/waivers/{waiver_id}/forward")
def forward_waiver(waiver_id: int, body: ActionIn, user_id: int = Depends(require_permission("withdrawal.clear")), db=Depends(get_db)):
    """Finance officer forwards a parent waiver request to the authority for approval."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_waiver_request(%s)", (waiver_id,))
    waiver = cur.fetchone()
    if not waiver:
        fail("Waiver request not found", 404)
    if waiver["status"] != "pending":
        fail("Waiver can only be forwarded when pending", 400)
    cur.execute("SELECT sp_forward_waiver(%s,%s,%s)", (waiver_id, user_id, body.note or ""))
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT sp_get_waiver_authority_role() AS role")
        authority_role = cur.fetchone()["role"] or "principal"
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", (authority_role,))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["user_id"], title="Fee Waiver Requires Your Approval",
                    body="Finance has reviewed a fee waiver request and forwarded it for your approval.", ntype="info")
    except Exception as e:
        print("[waiver forward notify]", e)
    return ok(message="Waiver forwarded to authority for approval.")



@router.post("/waivers/{waiver_id}/generate-invoice")
def generate_waiver_invoice(waiver_id: int, user_id: int = Depends(require_permission("withdrawal.clear")), db=Depends(get_db)):
    """Finance generates the replacement invoice after a partial waiver approval."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_waiver_request(%s)", (waiver_id,))
    waiver = cur.fetchone()
    if not waiver:
        fail("Waiver not found", 404)
    if waiver["status"] != "approved":
        fail("Waiver must be approved before generating invoice", 400)
    if waiver["waiver_type"] != "partial":
        fail("Only partial waivers require invoice generation", 400)
    if waiver["new_invoice_id"]:
        fail("Invoice already generated for this waiver", 400)
    cur.execute("SELECT sp_generate_waiver_invoice(%s,%s) AS inv_id", (waiver_id, user_id))
    result = cur.fetchone()
    new_inv_id = result["inv_id"] if result else None
    db.commit()
    return ok(data={"invoice_id": new_inv_id}, message="New invoice generated successfully.")

def download_document(req_id: int, doc_id: int, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    perms = claims.get("permissions", [])
    roles = claims.get("roles", [])
    if not has_perm(perms, ALLOWED_PERMS):
        # Allow if assigned to active workflow step for this request
        _wc = get_cur(db)
        _wc.execute("""
            SELECT 1 FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='withdrawal' AND wi.entity_type='withdrawal_request'
              AND wi.entity_id=%s
              AND (wsi.assigned_to_id=%s OR wsi.assigned_role=ANY(%s::varchar[]))
            LIMIT 1
        """, (req_id, user_id, roles))
        if not _wc.fetchone():
            fail("Permission denied", 403)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_documents(%s)", (req_id,))
    docs = [dict(r) for r in cur.fetchall()]
    doc = next((d for d in docs if d.get("id") == doc_id), None)
    if not doc:
        fail("Document not found", 404)
    fp = os.path.join(UPLOAD_DIR, doc["url"])
    if not os.path.exists(fp):
        fail("File not found on server", 404)
    return FileResponse(fp, filename=doc["filename"])
