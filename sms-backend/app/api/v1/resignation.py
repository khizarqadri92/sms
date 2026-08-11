from typing import Optional, List
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from psycopg2.extras import Json
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_permissions import require_permission
from app.utils.processing_date import get_processing_date, get_processing_datetime
from app.api.v1.request_permissions import get_user_request_scope, user_has_permission

router = APIRouter()

def get_cur(db):
    return _get_cur(db)

def fail(message, status_code=400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})

def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _get_staff_id_for_user(db, user_id):
    cur = get_cur(db)
    cur.execute("SELECT id FROM staff WHERE user_id=%s", (user_id,))
    row = cur.fetchone()
    return row["id"] if row else None


def _check_workflow_step_authorized(db, resignation_id, user_id):
    cur = get_cur(db)
    cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name=\'superadmin\'", (user_id,))
    if cur.fetchone():
        return True
    cur.execute("SELECT id FROM workflow_instances WHERE module=\'hr\' AND entity_type=\'resignation\' AND entity_id=%s AND status=\'active\'", (resignation_id,))
    instance = cur.fetchone()
    if not instance:
        return True
    cur.execute("SELECT assigned_to_id, assigned_role FROM workflow_step_instances WHERE instance_id=%s AND status=\'pending\' ORDER BY step_order LIMIT 1", (instance["id"],))
    step = cur.fetchone()
    if not step:
        return True
    if step["assigned_to_id"] and step["assigned_to_id"] == user_id:
        return True
    if step["assigned_role"]:
        cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name=%s", (user_id, step["assigned_role"]))
        if cur.fetchone():
            return True
    return False


_VALID_STATUSES = ("submitted", "manager_approved", "accepted", "cleared", "settlement_reviewed", "settled", "completed", "rejected", "withdrawn")

_VALID_EXP_LETTER_STATUSES = ("pending_hod", "pending_hr", "approved", "rejected_by_hod", "rejected_by_hr")


def _advance_resignation_workflow(db, resignation_id, user_id, fallback_status=None, note=""):
    cur = get_cur(db)
    applied = False
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        cur.execute("SELECT id FROM workflow_instances WHERE module=\'hr\' AND entity_type=\'resignation\' AND entity_id=%s AND status=\'active\'", (resignation_id,))
        if cur.fetchone():
            result = wf.advance(db, "hr", "resignation", resignation_id, action="approve", actioned_by=user_id, note=note)
            returned_status = (result or {}).get("entity_status")
            if returned_status and returned_status not in _VALID_STATUSES:
                print("[resignation workflow] invalid status " + str(returned_status))
                returned_status = None
            if returned_status:
                cur.execute("SELECT sp_update_resignation_status(%s,%s,%s)", (resignation_id, returned_status, get_processing_datetime(db)))
                applied = True
    except Exception as e:
        print("[resignation workflow advance] " + str(e))
        db.rollback()
        cur = get_cur(db)
    if not applied and fallback_status:
        cur.execute("SELECT sp_update_resignation_status(%s,%s,%s)", (resignation_id, fallback_status, get_processing_datetime(db)))
    db.commit()


class ResignationSubmitIn(BaseModel):
    reason: Optional[str] = None
    requested_last_working_day: Optional[str] = None
    notice_waived: Optional[bool] = False
    date_change_reason: Optional[str] = None


@router.get("/notice-period-days")
def get_notice_period_days(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT notice_period_duration_days FROM hr_policy_settings LIMIT 1")
    row = cur.fetchone()
    notice_days = row["notice_period_duration_days"] if row else 30
    preview_date = (get_processing_date(db) + timedelta(days=notice_days)).isoformat()
    return ok(data={"notice_period_duration_days": notice_days, "preview_last_working_day": preview_date})


@router.post("/submit")
def submit_resignation(body: ResignationSubmitIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    if not staff_id:
        fail("No staff record linked to your account.", 400)
    cur = get_cur(db)
    cur.execute("SELECT notice_period_duration_days FROM hr_policy_settings LIMIT 1")
    policy = cur.fetchone()
    notice_days = policy["notice_period_duration_days"] if policy else 30
    processing_today = get_processing_date(db)
    system_calculated_date = (processing_today + timedelta(days=notice_days)).isoformat()
    cur.execute("SELECT * FROM sp_create_resignation_request(%s,%s,%s,%s,%s,%s,%s)",
        (staff_id, body.reason, system_calculated_date, body.requested_last_working_day, notice_days, body.date_change_reason, processing_today))
    row = cur.fetchone()
    if row["error_msg"]:
        fail(row["error_msg"], 400)
    db.commit()
    resignation_id = row["id"]
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        cur.execute("SELECT department_id FROM staff WHERE id=%s", (staff_id,))
        dept_row = cur.fetchone()
        wf.trigger(db, module="hr", entity_type="resignation", entity_id=resignation_id,
            initiated_by=user_id, submitter_id=user_id,
            context={"staff_id": staff_id, "department_id": dept_row["department_id"] if dept_row else None})
        db.commit()
    except Exception as e:
        print("[resignation trigger] " + str(e))
    return ok(data={"id": resignation_id}, message="Resignation submitted.")


@router.get("/my")
def list_my_resignations(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    if not staff_id:
        return ok(data=[])
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_my_resignations(%s)", (staff_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/{resignation_id}/withdraw")
def withdraw_resignation(resignation_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT * FROM resignation_requests WHERE id=%s", (resignation_id,))
    req = cur.fetchone()
    if not req:
        fail("Resignation request not found.", 404)
    if req["staff_id"] != staff_id:
        fail("Not authorized.", 403)
    if req["status"] in ("completed", "rejected", "withdrawn", "settled"):
        fail("This resignation can no longer be withdrawn.", 400)

    cur.execute("SELECT resignation_withdrawal_allowed, resignation_withdrawal_max_step FROM hr_policy_settings LIMIT 1")
    policy = cur.fetchone()
    if not policy or not policy["resignation_withdrawal_allowed"]:
        fail("Withdrawal of resignation is not permitted by school policy.", 400)

    max_step = policy["resignation_withdrawal_max_step"] or 3
    cur.execute("SELECT wi.id FROM workflow_instances wi WHERE wi.module=\'hr\' AND wi.entity_type=\'resignation\' AND wi.entity_id=%s AND wi.status=\'active\'", (resignation_id,))
    instance = cur.fetchone()
    if instance:
        cur.execute("SELECT MIN(step_order) as current_step FROM workflow_step_instances WHERE instance_id=%s AND status=\'pending\'", (instance["id"],))
        step_row = cur.fetchone()
        current_step = step_row["current_step"] if step_row and step_row["current_step"] else 999
        if current_step > max_step:
            fail("This resignation has passed the stage where withdrawal is allowed.", 400)

    cur.execute("SELECT sp_withdraw_resignation(%s,%s)", (resignation_id, get_processing_datetime(db)))

    cur.execute("SELECT id FROM workflow_instances WHERE module=\'hr\' AND entity_type=\'resignation\' AND entity_id=%s AND status=\'active\'", (resignation_id,))
    instance = cur.fetchone()
    if instance:
        cur.execute("UPDATE workflow_step_instances SET status=\'skipped\' WHERE instance_id=%s AND status=\'pending\'", (instance["id"],))
        cur.execute("UPDATE workflow_instances SET status=\'cancelled\' WHERE id=%s", (instance["id"],))
    cur.execute("UPDATE work_queue_items SET entity_status=\'withdrawn\' WHERE module=\'hr\' AND entity_type=\'resignation\' AND entity_id=%s", (resignation_id,))

    db.commit()
    return ok(message="Resignation withdrawn.")


class ExperienceLetterIn(BaseModel):
    notes: str


class ExperienceLetterAdvanceIn(BaseModel):
    action: str  # 'approve' | 'reject'
    note: Optional[str] = None


@router.get("/{resignation_id}/experience-letter")
def get_experience_letter(resignation_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_experience_letter(%s)", (resignation_id,))
    row = cur.fetchone()
    return ok(data=dict(row) if row else None)


@router.post("/{resignation_id}/experience-letter")
def submit_experience_letter_notes(resignation_id: int, body: ExperienceLetterIn,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Employee submits (or resubmits, after a rejection) their experience
    letter details. This triggers the configurable "resignation_experience_letter"
    workflow (set up in Workflow Builder) - typically department head review
    followed by HR final approval. A resubmission always restarts review from
    the first step, since the content has changed."""
    staff_id = _get_staff_id_for_user(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT rr.staff_id, rr.status, s.department_id FROM resignation_requests rr JOIN staff s ON s.id=rr.staff_id WHERE rr.id=%s", (resignation_id,))
    req = cur.fetchone()
    if not req:
        fail("Resignation request not found.", 404)
    if req["staff_id"] != staff_id:
        fail("Not authorized.", 403)
    if req["status"] in ("submitted", "manager_approved", "rejected", "withdrawn"):
        fail("Experience letter details can only be added once your resignation has been accepted.", 400)

    proc_dt = get_processing_datetime(db)
    cur.execute("SELECT * FROM sp_submit_experience_letter(%s,%s,%s)", (resignation_id, body.notes, proc_dt))
    db.commit()

    from app.utils.workflow_engine import WorkflowEngine
    wf = WorkflowEngine()
    instance = wf.trigger(db, "hr", "resignation_experience_letter", resignation_id,
        initiated_by=user_id, submitter_id=user_id, context={"department_id": req["department_id"]})
    db.commit()
    if not instance:
        fail("No workflow has been configured for experience letter reviews yet. Please ask an administrator to set one up in Workflow Builder.", 400)

    return ok(message="Experience letter details submitted for review.")


@router.post("/{resignation_id}/experience-letter/advance")
def advance_experience_letter(resignation_id: int, body: ExperienceLetterAdvanceIn,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if body.action not in ("approve", "reject"):
        fail("Action must be approve or reject.", 400)
    if body.action == "reject" and not (body.note or "").strip():
        fail("Please provide a comment explaining why changes are being requested.", 400)

    cur = get_cur(db)
    cur.execute("""
        SELECT wsi.step_order, wsi.assigned_to_id, wsi.assigned_role
        FROM workflow_instances wi
        JOIN workflow_step_instances wsi ON wsi.instance_id = wi.id AND wsi.status='pending'
        WHERE wi.module='hr' AND wi.entity_type='resignation_experience_letter' AND wi.entity_id=%s AND wi.status='active'
        ORDER BY wsi.step_order LIMIT 1
    """, (resignation_id,))
    step = cur.fetchone()
    if not step:
        fail("This experience letter is not currently awaiting review.", 400)

    cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name='superadmin'", (user_id,))
    is_superadmin = cur.fetchone() is not None
    authorized = is_superadmin or step["assigned_to_id"] == user_id
    if not authorized and step["assigned_role"]:
        cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name=%s", (user_id, step["assigned_role"]))
        authorized = cur.fetchone() is not None
    if not authorized:
        fail("This action is assigned to a different person or role.", 403)

    is_first_step = step["step_order"] == 1

    from app.utils.workflow_engine import WorkflowEngine
    wf = WorkflowEngine()
    result = wf.advance(db, "hr", "resignation_experience_letter", resignation_id, action=body.action, actioned_by=user_id, note=body.note or body.action)
    db.commit()
    cur = get_cur(db)

    proc_dt = get_processing_datetime(db)
    if result:
        returned_status = result.get("entity_status")
        if returned_status and returned_status not in _VALID_EXP_LETTER_STATUSES:
            returned_status = None
        if returned_status:
            cur.execute("SELECT sp_update_experience_letter_status(%s,%s,%s)", (resignation_id, returned_status, proc_dt))

    if is_first_step:
        cur.execute("SELECT sp_set_experience_letter_hod_review(%s,%s,%s,%s)", (resignation_id, body.note, user_id, proc_dt))
    else:
        cur.execute("SELECT sp_set_experience_letter_hr_review(%s,%s,%s,%s)", (resignation_id, body.note, user_id, proc_dt))
    db.commit()

    cur.execute("SELECT staff_id FROM resignation_requests WHERE id=%s", (resignation_id,))
    req = cur.fetchone()
    staff_user_id = None
    if req:
        cur.execute("SELECT user_id FROM staff WHERE id=%s", (req["staff_id"],))
        staff_row = cur.fetchone()
        staff_user_id = staff_row["user_id"] if staff_row else None

    if staff_user_id:
        try:
            from app.utils.notify import send_notification
            import main as _main
            with _main.flask_app.app_context():
                if body.action == "reject":
                    send_notification(staff_user_id, "Experience Letter Details Rejected",
                        ("Your department head" if is_first_step else "HR") + " requested changes: " + (body.note or ""),
                        "warning", "/my-resignation")
                elif result and result.get("status") == "completed":
                    send_notification(staff_user_id, "Experience Letter Details Approved",
                        "Your experience letter details have been approved by HR.", "success", "/my-resignation")
        except Exception as e:
            print(f"[experience letter notify] {e}")

    return ok(message="Experience letter reviewed.")
@router.get("/list")
def list_resignations(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    if user_has_permission(db, user_id, "hr.view"):
        cur.execute("SELECT * FROM sp_list_resignation_requests()")
    else:
        scope, dept_ids = get_user_request_scope(db, user_id, "resignation")
        if scope == "all":
            cur.execute("SELECT * FROM sp_list_resignation_requests()")
        elif scope == "departments" and dept_ids:
            cur.execute("SELECT * FROM sp_list_resignation_requests(%s)", (dept_ids,))
        else:
            fail("You don't have permission to view resignation requests.", 403)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/{resignation_id}")
def get_resignation(resignation_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_resignation_request(%s)", (resignation_id,))
    row = cur.fetchone()
    if not row:
        fail("Resignation request not found.", 404)
    detail = dict(row)

    staff_id = _get_staff_id_for_user(db, user_id)
    is_owner = staff_id == detail["staff_id"]
    if not is_owner and not user_has_permission(db, user_id, "hr.view"):
        scope, dept_ids = get_user_request_scope(db, user_id, "resignation")
        if scope == "all":
            pass
        elif scope == "departments" and dept_ids:
            cur.execute("SELECT department_id FROM staff WHERE id=%s", (detail["staff_id"],))
            srow = cur.fetchone()
            if not srow or srow["department_id"] not in dept_ids:
                fail("Not authorized.", 403)
        else:
            fail("Not authorized.", 403)
    cur.execute("SELECT * FROM sp_list_clearance_items(%s)", (resignation_id,))
    detail["clearance_items"] = [dict(r) for r in cur.fetchall()]
    for citem in detail["clearance_items"]:
        cur.execute("""
            SELECT m.message, m.sent_at, u.first_name, u.last_name
            FROM resignation_clearance_messages m
            LEFT JOIN users u ON u.id = m.sent_by
            WHERE m.clearance_item_id = %s ORDER BY m.sent_at
        """, (citem["id"],))
        citem["messages"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_settlement(%s)", (resignation_id,))
    settlement_row = cur.fetchone()
    detail["settlement"] = dict(settlement_row) if settlement_row else None

    cur.execute("SELECT id FROM workflow_instances WHERE module=\'hr\' AND entity_type=\'resignation\' AND entity_id=%s ORDER BY id DESC LIMIT 1", (resignation_id,))
    instance = cur.fetchone()
    if instance:
        cur.execute("""
            SELECT wsi.step_order, wsi.step_name, wsi.status, wsi.note, wsi.actioned_at,
                u.first_name AS actioned_by_first_name, u.last_name AS actioned_by_last_name
            FROM workflow_step_instances wsi
            LEFT JOIN users u ON u.id = wsi.actioned_by
            WHERE wsi.instance_id = %s
            ORDER BY wsi.step_order
        """, (instance["id"],))
        detail["workflow_steps"] = [dict(r) for r in cur.fetchall()]
    else:
        detail["workflow_steps"] = []

    return ok(data=detail)


class ResignationAdvanceIn(BaseModel):
    action: str
    note: Optional[str] = None
    final_last_working_day: Optional[str] = None
    cheque_collection_date: Optional[str] = None


@router.post("/{resignation_id}/advance")
def advance_resignation(resignation_id: int, body: ResignationAdvanceIn,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if body.action not in ("approve", "accept", "reject"):
        fail("Action must be approve, accept, or reject.", 400)
    normalized_action = "approve" if body.action == "accept" else body.action
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        result = wf.advance(db, "hr", "resignation", resignation_id, action=normalized_action, actioned_by=user_id, note=body.note or body.action)
        db.commit()
        cur = get_cur(db)
        if result:
            wf_status = result.get("status", "")
            if wf_status in ("advanced", "completed"):
                returned_status = result.get("entity_status")
                if returned_status and returned_status not in _VALID_STATUSES:
                    returned_status = None
                if returned_status:
                    cur.execute("SELECT sp_update_resignation_status(%s,%s,%s)", (resignation_id, returned_status, get_processing_datetime(db)))
                    if returned_status == "accepted":
                        cur.execute("SELECT system_calculated_last_working_day, requested_last_working_day FROM resignation_requests WHERE id=%s", (resignation_id,))
                        drow = cur.fetchone()
                        final_date = body.final_last_working_day or (drow["system_calculated_last_working_day"] if drow else None)
                        cur.execute("UPDATE resignation_requests SET final_last_working_day=%s, cheque_collection_date=%s WHERE id=%s",
                            (final_date, body.cheque_collection_date, resignation_id))
                        cur.execute("""
                            UPDATE staff SET resignation_accepted_date = %s
                            WHERE id = (SELECT staff_id FROM resignation_requests WHERE id=%s)
                        """, (get_processing_date(db), resignation_id))
                    db.commit()
            elif wf_status == "rejected":
                cur.execute("SELECT sp_update_resignation_status(%s,%s,%s)", (resignation_id, "rejected", get_processing_datetime(db)))
                db.commit()
        return ok(message="Resignation " + body.action + "d successfully.")
    except Exception as e:
        print("[resignation advance] " + str(e))
        fail(str(e), 400)


class ClearanceItemInit(BaseModel):
    department_id: int
    item_label: str = "No outstanding dues"


class ClearanceInitIn(BaseModel):
    items: List[ClearanceItemInit]


@router.post("/{resignation_id}/clearance/init")
def init_clearance(resignation_id: int, body: ClearanceInitIn,
        user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT COUNT(*) as c FROM resignation_clearance_items WHERE resignation_id=%s", (resignation_id,))
    if cur.fetchone()["c"] > 0:
        fail("Clearance checklist already initialized for this resignation.", 400)

    cur.execute("""SELECT s.first_name, s.last_name FROM resignation_requests r
        JOIN staff s ON s.id = r.staff_id WHERE r.id=%s""", (resignation_id,))
    emp = cur.fetchone()
    emp_name = (emp["first_name"] + " " + emp["last_name"]) if emp else "the employee"

    for entry in body.items:
        dept_id = entry.department_id
        cur.execute("SELECT head_user_id, name FROM departments WHERE id=%s", (dept_id,))
        dept = cur.fetchone()
        if not dept:
            continue
        head_id = dept["head_user_id"]
        cur.execute("SELECT sp_add_clearance_item(%s,%s,%s,%s)", (resignation_id, dept_id, head_id, entry.item_label))
        item_id = cur.fetchone()["sp_add_clearance_item"]

        if head_id:
            proc_dt = get_processing_datetime(db)
            cur.execute("""
                INSERT INTO work_queue_items (module, entity_type, entity_id, title, description,
                    action_required, priority, assigned_user_id, link, status, created_by, created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
            """, ("hr", "resignation_clearance", item_id,
                  "Clearance Required: " + dept["name"],
                  "Please clear " + emp_name + " for the " + dept["name"] + " department before their exit.",
                  "clear", "normal", head_id, "/hr/resignations?id=" + str(resignation_id), "pending", user_id, proc_dt, proc_dt))
            wq_id_row = cur.fetchone()
            if wq_id_row:
                cur.execute("SELECT sp_set_clearance_wq_item(%s,%s)", (item_id, wq_id_row["id"]))

    db.commit()
    return ok(message="Clearance checklist created and sent to department heads.")


class ClearItemIn(BaseModel):
    remarks: Optional[str] = None


@router.post("/clearance/{item_id}/clear")
def clear_item(item_id: int, body: ClearItemIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT assigned_to_id, wq_item_id FROM resignation_clearance_items WHERE id=%s", (item_id,))
    item = cur.fetchone()
    if not item:
        fail("Clearance item not found.", 404)
    if item["assigned_to_id"] and item["assigned_to_id"] != user_id:
        cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name=\'superadmin\'", (user_id,))
        if not cur.fetchone():
            fail("This clearance item is assigned to a different person.", 403)
    cur.execute("SELECT sp_clear_item(%s,%s,%s,%s)", (item_id, user_id, body.remarks, get_processing_datetime(db)))
    if item["wq_item_id"]:
        cur.execute("UPDATE work_queue_items SET status=\'completed\', entity_status=\'completed\', completed_by=%s, completed_at=%s WHERE id=%s", (user_id, get_processing_datetime(db), item["wq_item_id"]))
    db.commit()
    return ok(message="Item cleared.")


@router.get("/clearance/{item_id}/department-staff")
def get_department_staff_for_clearance(item_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT department_id FROM resignation_clearance_items WHERE id=%s", (item_id,))
    row = cur.fetchone()
    if not row or not row["department_id"]:
        return ok(data=[])
    cur.execute("""
        SELECT s.user_id, s.first_name, s.last_name FROM staff s
        WHERE s.department_id=%s AND s.status=\'active\' AND s.user_id IS NOT NULL
        ORDER BY s.first_name
    """, (row["department_id"],))
    return ok(data=[dict(r) for r in cur.fetchall()])


class ReassignClearanceIn(BaseModel):
    assigned_to_id: int


@router.post("/clearance/{item_id}/reassign")
def reassign_clearance(item_id: int, body: ReassignClearanceIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT assigned_to_id, wq_item_id, is_cleared FROM resignation_clearance_items WHERE id=%s", (item_id,))
    item = cur.fetchone()
    if not item:
        fail("Clearance item not found.", 404)
    if item["is_cleared"]:
        fail("This item is already cleared.", 400)
    if item["assigned_to_id"] != user_id:
        cur.execute("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name=\'superadmin\'", (user_id,))
        if not cur.fetchone():
            fail("Only the current assignee can reassign this item.", 403)
    cur.execute("SELECT sp_update_clearance_assignee(%s,%s)", (item_id, body.assigned_to_id))
    if item["wq_item_id"]:
        cur.execute("""UPDATE work_queue_items SET assigned_user_id=%s,
            previous_assignee_ids = array_append(previous_assignee_ids, %s) WHERE id=%s""",
            (body.assigned_to_id, user_id, item["wq_item_id"]))
    db.commit()
    return ok(message="Reassigned.")


class NotifyClearanceIn(BaseModel):
    message: str


@router.post("/clearance/{item_id}/notify")
def notify_clearance(item_id: int, body: NotifyClearanceIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT rci.department_name, s.user_id AS employee_user_id
        FROM resignation_clearance_items rci
        JOIN resignation_requests r ON r.id = rci.resignation_id
        JOIN staff s ON s.id = r.staff_id
        WHERE rci.id=%s
    """, (item_id,))
    row = cur.fetchone()
    if not row:
        fail("Clearance item not found.", 404)
    if not row["employee_user_id"]:
        fail("This employee has no linked user account to notify.", 400)

    cur.execute("INSERT INTO resignation_clearance_messages (clearance_item_id, message, sent_by, sent_at) VALUES (%s,%s,%s,%s)",
        (item_id, body.message, user_id, get_processing_datetime(db)))
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        with _main.flask_app.app_context():
            send_notification(row["employee_user_id"], row["department_name"] + " - Clearance", body.message, "warning", "/my-resignation")
    except Exception as e:
        print(f"[clearance notify] {e}")
    return ok(message="Message sent to employee.")


@router.post("/{resignation_id}/clearance/complete")
def complete_clearance(resignation_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_cleared) as done FROM resignation_clearance_items WHERE resignation_id=%s", (resignation_id,))
    row = cur.fetchone()
    if row["total"] == 0:
        fail("No clearance checklist has been created for this resignation yet.", 400)
    if row["done"] < row["total"]:
        fail("Not all clearance items have been cleared yet.", 400)
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    _advance_resignation_workflow(db, resignation_id, user_id, fallback_status="cleared", note="Clearance completed.")
    return ok(message="Clearance marked complete.")


@router.post("/{resignation_id}/clearance/skip")
def skip_clearance(resignation_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    """Lets HR bypass the department clearance checklist entirely for cases
    where no departmental sign-off is required, advancing straight to
    settlement without creating any clearance items."""
    cur = get_cur(db)
    cur.execute("SELECT status FROM resignation_requests WHERE id=%s", (resignation_id,))
    row = cur.fetchone()
    if not row:
        fail("Resignation request not found.", 404)
    if row["status"] != "accepted":
        fail("Clearance can only be skipped before any clearance checklist has been started.", 400)
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    _advance_resignation_workflow(db, resignation_id, user_id, fallback_status="cleared", note="Clearance skipped - no departmental sign-off required.")
    return ok(message="Clearance skipped.")


@router.post("/{resignation_id}/clearance/skip")
def skip_clearance(resignation_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    """Lets HR bypass the department clearance checklist entirely for cases
    where no departmental sign-off is required, advancing straight to
    settlement without creating any clearance items."""
    cur = get_cur(db)
    cur.execute("SELECT status FROM resignation_requests WHERE id=%s", (resignation_id,))
    row = cur.fetchone()
    if not row:
        fail("Resignation request not found.", 404)
    if row["status"] != "accepted":
        fail("Clearance can only be skipped before any clearance checklist has been started.", 400)
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    _advance_resignation_workflow(db, resignation_id, user_id, fallback_status="cleared", note="Clearance skipped - no departmental sign-off required.")
    return ok(message="Clearance skipped.")


class AdjustmentItemIn(BaseModel):
    name: str
    item_type: str  # 'earning' | 'deduction'
    calc_type: str  # 'fixed' | 'pct_basic' | 'pct_pending'
    value: float


class SettlementIn(BaseModel):
    pending_salary_amount: Optional[float] = 0
    leave_encashment_days: Optional[float] = 0
    leave_encashment_amount: Optional[float] = 0
    other_dues: Optional[float] = 0
    other_deductions: Optional[float] = 0
    adjustments_note: Optional[str] = None
    adjustments: Optional[List[AdjustmentItemIn]] = []


@router.post("/{resignation_id}/settlement/calculate")
def calculate_settlement(resignation_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    import json as _json
    cur = get_cur(db)
    cur.execute("SELECT * FROM resignation_requests WHERE id=%s", (resignation_id,))
    req = cur.fetchone()
    if not req:
        fail("Resignation request not found.", 404)

    last_day = req["final_last_working_day"] or req["system_calculated_last_working_day"]

    cur.execute("SELECT * FROM sp_get_staff_payroll_profile(%s)", (req["staff_id"],))
    profile = cur.fetchone()
    basic = 0
    if profile:
        basic = float(profile["basic_salary"] or 0) if profile["salary_type"] == "structured" else float(profile["lump_sum_amount"] or 0)
    per_day_rate = basic / 30 if basic else 0

    cur.execute("SELECT user_id, resignation_accepted_date FROM staff WHERE id=%s", (req["staff_id"],))
    staff_row = cur.fetchone()
    staff_user_id = staff_row["user_id"] if staff_row else None
    notice_start = (staff_row["resignation_accepted_date"] if staff_row else None) or req["resignation_date"]

    present_days = absent_days = leave_days_taken = excess_leave_days = 0
    pending_salary = 0
    gross_salary_amount = absence_deduction_amount = 0
    total_calendar_days = 0

    if last_day and notice_start:
        # All settlement-relevant stats (present/absent/leave counts, excess
        # leave, and pending salary) are scoped to the FINAL settlement
        # period only - from the day after the employee's last normal
        # payroll (1st of last_day's month) through their last working day.
        # Earlier months of the notice period were already paid in full
        # through the regular monthly payroll run, so they aren't re-counted
        # here for either display or pay purposes.
        from datetime import date as _sdate
        salary_period_start = max(notice_start, _sdate(last_day.year, last_day.month, 1))

        cur.execute("""
            SELECT status, COUNT(*) as c FROM staff_daily_attendance_status
            WHERE staff_id=%s AND status_date BETWEEN %s AND %s
            GROUP BY status
        """, (req["staff_id"], salary_period_start, last_day))
        att_counts = {r["status"]: r["c"] for r in cur.fetchall()}
        present_days = att_counts.get("present", 0)
        absent_days = att_counts.get("absent", 0)
        leave_days_taken = att_counts.get("on_leave", 0)
        weekly_off_days = att_counts.get("weekly_off", 0)

        if staff_user_id:
            cur.execute("""
                SELECT slr.leave_type_id, SUM(slr.total_days) as used
                FROM staff_leave_requests slr
                WHERE slr.user_id=%s AND slr.status='approved'
                  AND slr.from_date <= %s AND slr.to_date >= %s
                GROUP BY slr.leave_type_id
            """, (staff_user_id, last_day, salary_period_start))
            leave_usage = {r["leave_type_id"]: float(r["used"]) for r in cur.fetchall()}

            cur.execute("""
                SELECT leave_type_id, config FROM leave_validation_rules
                WHERE rule_type='employment_status_restriction' AND is_active=true
                  AND config->>'status' = 'notice_period'
            """)
            for r in cur.fetchall():
                cfg = r["config"]
                if isinstance(cfg, str):
                    cfg = _json.loads(cfg)
                allowed = cfg.get("max_days_allowed", 0)
                used = leave_usage.get(r["leave_type_id"], 0)
                if used > allowed:
                    excess_leave_days += (used - allowed)

        effective_absent = absent_days + excess_leave_days
        total_calendar_days = (last_day - salary_period_start).days + 1
        payable_days = max(0, total_calendar_days - weekly_off_days - effective_absent)
        pending_salary = round(per_day_rate * payable_days, 2) if per_day_rate else 0
        gross_salary_amount = round(per_day_rate * total_calendar_days, 2) if per_day_rate else 0
        absence_deduction_amount = round(per_day_rate * (weekly_off_days + effective_absent), 2) if per_day_rate else 0

    leave_encashment_days = 0
    if staff_user_id and notice_start:
        year = notice_start.year
        months_worked = min(12, max(0, notice_start.month))
        cur.execute("""
            SELECT lt.id, lt.max_days_per_year, COALESCE(slb.used_days,0) as used
            FROM leave_types lt
            LEFT JOIN staff_leave_balances slb ON slb.leave_type_id=lt.id AND slb.user_id=%s AND slb.year=%s
            WHERE lt.is_encashable=true
        """, (staff_user_id, year))
        for r in cur.fetchall():
            annual_max = r["max_days_per_year"] or 0
            pro_rated = round(annual_max * months_worked / 12)
            encash = max(0, pro_rated - float(r["used"]))
            leave_encashment_days += encash

    leave_encashment_amount = round(per_day_rate * leave_encashment_days, 2) if per_day_rate else 0

    # Recalculating (e.g. after fixing the underlying attendance data, or via
    # the "Recalculate" button) should refresh the attendance-derived figures
    # without discarding any manually-entered adjustments, dues, or deductions
    # HR may have already added - so we preserve them and fold them back into
    # final_amount here.
    cur.execute("SELECT other_dues, other_deductions, adjustments_note, adjustments FROM resignation_settlements WHERE resignation_id=%s", (resignation_id,))
    existing = cur.fetchone()
    other_dues = float(existing["other_dues"]) if existing and existing["other_dues"] else 0
    other_deductions = float(existing["other_deductions"]) if existing and existing["other_deductions"] else 0
    adjustments_note = existing["adjustments_note"] if existing else None
    existing_adjustments = existing["adjustments"] if existing and existing["adjustments"] else []
    net_adjustment = sum(
        (a.get("resolved_amount") or 0) if a.get("item_type") == "earning" else -(a.get("resolved_amount") or 0)
        for a in existing_adjustments
    )

    final_amount = round(pending_salary + leave_encashment_amount + other_dues - other_deductions + net_adjustment, 2)
    cur.execute("SELECT sp_upsert_settlement(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (resignation_id, pending_salary, leave_encashment_days, leave_encashment_amount, other_dues, other_deductions,
         adjustments_note, final_amount, "draft",
         present_days, absent_days, leave_days_taken, excess_leave_days, get_processing_datetime(db), Json(existing_adjustments),
         gross_salary_amount, absence_deduction_amount, total_calendar_days))
    db.commit()
    return ok(message="Settlement auto-calculated from attendance and leave records. HR can review and adjust before finalizing.")


@router.post("/{resignation_id}/settlement/review")
def review_settlement(resignation_id: int, body: SettlementIn,
        user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    cur = get_cur(db)

    # Resolve each adjustment line item to a concrete dollar amount, based on
    # its calc_type: a flat figure, or a percentage of the employee's basic
    # salary or of this settlement's pending salary amount.
    cur.execute("SELECT * FROM resignation_requests WHERE id=%s", (resignation_id,))
    req_row = cur.fetchone()
    basic_salary = 0.0
    if req_row:
        cur.execute("SELECT * FROM sp_get_staff_payroll_profile(%s)", (req_row["staff_id"],))
        profile = cur.fetchone()
        if profile:
            basic_salary = float(profile["basic_salary"] or 0) if profile["salary_type"] == "structured" else float(profile["lump_sum_amount"] or 0)

    resolved_adjustments = []
    net_adjustment = 0.0
    for item in (body.adjustments or []):
        if item.calc_type == "pct_basic":
            resolved_amount = round(basic_salary * item.value / 100.0, 2)
        elif item.calc_type == "pct_pending":
            resolved_amount = round((body.pending_salary_amount or 0) * item.value / 100.0, 2)
        else:
            resolved_amount = round(item.value, 2)
        resolved_adjustments.append({
            "name": item.name, "item_type": item.item_type, "calc_type": item.calc_type,
            "value": item.value, "resolved_amount": resolved_amount,
        })
        net_adjustment += resolved_amount if item.item_type == "earning" else -resolved_amount

    final_amount = (body.pending_salary_amount or 0) + (body.leave_encashment_amount or 0) + (body.other_dues or 0) - (body.other_deductions or 0) + net_adjustment

    # Preserve the attendance-derived stats that calculate_settlement()
    # already computed - this endpoint only updates dues/deductions/
    # adjustments, so the present/absent/leave counts must be carried
    # forward rather than reset to zero.
    cur.execute("SELECT present_days, absent_days, leave_days_taken, excess_leave_days, gross_salary_amount, absence_deduction_amount, total_calendar_days FROM resignation_settlements WHERE resignation_id=%s", (resignation_id,))
    existing_stats = cur.fetchone()
    present_days = existing_stats["present_days"] if existing_stats else 0
    absent_days = existing_stats["absent_days"] if existing_stats else 0
    leave_days_taken = existing_stats["leave_days_taken"] if existing_stats else 0
    excess_leave_days = existing_stats["excess_leave_days"] if existing_stats else 0
    gross_salary_amount = existing_stats["gross_salary_amount"] if existing_stats else 0
    absence_deduction_amount = existing_stats["absence_deduction_amount"] if existing_stats else 0
    total_calendar_days = existing_stats["total_calendar_days"] if existing_stats else 0

    cur.execute("SELECT sp_upsert_settlement(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (resignation_id, body.pending_salary_amount, body.leave_encashment_days, body.leave_encashment_amount,
         body.other_dues, body.other_deductions, body.adjustments_note, final_amount, "reviewed",
         present_days, absent_days, leave_days_taken, excess_leave_days, get_processing_datetime(db), Json(resolved_adjustments),
         gross_salary_amount, absence_deduction_amount, total_calendar_days))
    db.commit()
    _advance_resignation_workflow(db, resignation_id, user_id, fallback_status="settlement_reviewed", note="Settlement reviewed by HR.")
    return ok(message="Settlement reviewed.")


@router.post("/{resignation_id}/settlement/finance-calculate")
def finance_calculate_settlement(resignation_id: int, user_id: int = Depends(require_permission("payroll.manage")), db=Depends(get_db)):
    """Finance-side calculation step: pulls in the employee's accumulated
    Provident Fund balance (employee + employer contributions from the PF
    ledger) alongside the figures HR already prepared (pending salary, leave
    encashment, dues/deductions, adjustments), and produces the final payout
    total. This is a separate, explicit action from HR's review - finance
    only sees the full financial breakdown after clicking this."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM resignation_requests WHERE id=%s", (resignation_id,))
    req = cur.fetchone()
    if not req:
        fail("Resignation request not found.", 404)

    cur.execute("SELECT * FROM resignation_settlements WHERE resignation_id=%s", (resignation_id,))
    settlement = cur.fetchone()
    if not settlement:
        fail("No settlement has been reviewed for this resignation yet.", 400)

    cur.execute("""
        SELECT COALESCE(SUM(employee_amount + employer_amount), 0) AS bal
        FROM provident_fund_transactions WHERE staff_id=%s
    """, (req["staff_id"],))
    pf_balance = float(cur.fetchone()["bal"])

    adjustments = settlement["adjustments"] or []
    net_adjustment = sum(
        (a.get("resolved_amount") or 0) if a.get("item_type") == "earning" else -(a.get("resolved_amount") or 0)
        for a in adjustments
    )

    final_amount = round(
        float(settlement["pending_salary_amount"] or 0) + float(settlement["leave_encashment_amount"] or 0)
        + float(settlement["other_dues"] or 0) - float(settlement["other_deductions"] or 0)
        + net_adjustment + pf_balance, 2
    )

    cur.execute("SELECT sp_finance_calculate_settlement(%s,%s,%s,%s)",
        (resignation_id, pf_balance, final_amount, get_processing_datetime(db)))
    db.commit()
    return ok(message="Settlement calculated, including Provident Fund balance.")


class TaxableFlagsIn(BaseModel):
    pending_salary: bool = False
    leave_encashment: bool = False
    pf_balance: bool = False
    adjustments: Optional[List[bool]] = []


@router.post("/{resignation_id}/settlement/calculate-tax")
def calculate_settlement_tax(resignation_id: int, body: TaxableFlagsIn,
        user_id: int = Depends(require_permission("payroll.manage")), db=Depends(get_db)):
    """Finance marks which settlement components are taxable, then this
    recomputes income tax (via the active payroll tax slab set, applied
    directly to the taxable sum) and folds it back into final_amount.
    Recalculating with different flags simply redoes the whole computation
    from the underlying components, so it's safe to call repeatedly."""
    from app.api.v1.payroll import _calculate_annual_tax
    cur = get_cur(db)
    cur.execute("SELECT * FROM resignation_settlements WHERE resignation_id=%s", (resignation_id,))
    settlement = cur.fetchone()
    if not settlement:
        fail("No settlement found for this resignation.", 400)
    if not settlement["finance_calculated_at"]:
        fail("Calculate the settlement (including Provident Fund) before determining tax.", 400)

    taxable_amount = 0.0
    if body.pending_salary:
        taxable_amount += float(settlement["pending_salary_amount"] or 0)
    if body.leave_encashment:
        taxable_amount += float(settlement["leave_encashment_amount"] or 0)
    if body.pf_balance:
        taxable_amount += float(settlement["pf_balance_amount"] or 0)
    adjustments = settlement["adjustments"] or []
    adj_flags = body.adjustments or []
    for idx, adj in enumerate(adjustments):
        if idx < len(adj_flags) and adj_flags[idx]:
            amt = float(adj.get("resolved_amount") or 0)
            taxable_amount += amt if adj.get("item_type") == "earning" else -amt
    taxable_amount = max(0.0, taxable_amount)

    income_tax_amount = 0.0
    if taxable_amount > 0:
        tax, _slab_set_name = _calculate_annual_tax(db, taxable_amount)
        income_tax_amount = tax or 0.0

    net_adjustment = sum(
        (a.get("resolved_amount") or 0) if a.get("item_type") == "earning" else -(a.get("resolved_amount") or 0)
        for a in adjustments
    )
    final_amount = round(
        float(settlement["pending_salary_amount"] or 0) + float(settlement["leave_encashment_amount"] or 0)
        + float(settlement["pf_balance_amount"] or 0) + float(settlement["other_dues"] or 0)
        - float(settlement["other_deductions"] or 0) + net_adjustment - income_tax_amount, 2
    )

    taxable_flags_json = {
        "pending_salary": body.pending_salary, "leave_encashment": body.leave_encashment,
        "pf_balance": body.pf_balance, "adjustments": adj_flags,
    }

    cur.execute("SELECT sp_set_settlement_tax(%s,%s,%s,%s,%s)",
        (resignation_id, income_tax_amount, Json(taxable_flags_json), final_amount, get_processing_datetime(db)))
    db.commit()
    return ok(message="Income tax calculated.", data={"income_tax_amount": income_tax_amount, "taxable_amount": taxable_amount})


@router.post("/{resignation_id}/settlement/finalize")
def finalize_settlement(resignation_id: int, user_id: int = Depends(require_permission("payroll.manage")), db=Depends(get_db)):
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    cur = get_cur(db)
    cur.execute("UPDATE resignation_settlements SET status=\'finalized\', updated_at=%s WHERE resignation_id=%s", (get_processing_datetime(db), resignation_id))
    db.commit()
    _advance_resignation_workflow(db, resignation_id, user_id, fallback_status="settled", note="Settlement finalized by Finance.")
    return ok(message="Settlement finalized.")


@router.post("/{resignation_id}/complete")
def complete_resignation(resignation_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    if not _check_workflow_step_authorized(db, resignation_id, user_id):
        fail("This action is assigned to a different person or role.", 403)
    cur = get_cur(db)
    cur.execute("SELECT staff_id FROM resignation_requests WHERE id=%s", (resignation_id,))
    req = cur.fetchone()
    if not req:
        fail("Resignation request not found.", 404)
    cur.execute("UPDATE staff SET status=\'resigned\' WHERE id=%s", (req["staff_id"],))
    db.commit()
    _advance_resignation_workflow(db, resignation_id, user_id, fallback_status="completed", note="Exit finalized.")
    return ok(message="Employee exit finalized.")
