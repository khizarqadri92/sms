"""
Native FastAPI router for Leaves - migrated from app/api/v1/leaves.py.
sp_apply_leave, sp_get_leave_requests, sp_get_leave_balance, sp_recommend_leave,
sp_action_leave, sp_mark_leave_attendance already existed and were verified
clean (no broken chr()-stub pattern), signatures confirmed against pg_proc.
File upload/download use FastAPI's native UploadFile/Form and FileResponse.
The "hr" role branch intentionally returns empty data, matching the original
placeholder pending a dedicated teacher-leave module. The certificate
download directory uses a computed relative path instead of the original's
hardcoded Windows absolute path, for portability - same folder either way.
"""

from app.utils.workflow_engine import engine as wf_engine
import os
import time
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_campus import get_current_campus_id

router = APIRouter()

CERT_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "leave_certificates")
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png"}


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class RecommendIn(BaseModel):
    note: Optional[str] = ""


class ActionIn(BaseModel):
    action: str
    note: Optional[str] = ""



def _wq_leave(db, action, leave_id, student_name, duration, user_id):
    from app.utils.work_queue import push_to_queue, complete_queue_item, cancel_queue_items
    if action == "apply":
        push_to_queue(db, module="leaves", entity_type="leave_application", entity_id=leave_id,
            title="Leave Request - " + student_name, description=str(duration) + " day(s) leave",
            action_required="recommend", priority="normal", assigned_role="teacher",
            link="/leaves", created_by=user_id)
    elif action == "recommend":
        complete_queue_item(db, "leaves", leave_id, "leave_application", "recommend", user_id)
        push_to_queue(db, module="leaves", entity_type="leave_application", entity_id=leave_id,
            title="Leave Approval - " + student_name, description=str(duration) + " day(s) leave",
            action_required="approve", priority="normal", assigned_role="principal",
            link="/leaves", created_by=user_id)
    elif action == "action":
        cancel_queue_items(db, "leaves", leave_id, "leave_application")

def _notify_teachers(cur, student_id, leave_request_id, notify_mode):
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_student_class_and_name(%s)", (student_id,))
        st = cur.fetchone()
        if not st:
            return
        all_teachers = notify_mode == "all_teachers"
        cur.execute("SELECT * FROM sp_get_teachers_for_notify(%s, %s)", (st["class_id"], all_teachers))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for t in rows:
                send_notification(
                    t["user_id"], title="Leave Request",
                    body=st["student_name"] + " has applied for leave (Request #" + str(leave_request_id) + ")",
                    ntype="leave"
                )
    except Exception as e:
        print("[leave notify]", e)


def _notify_student_parent(cur, student_id, status):
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_student_notify_info(%s)", (student_id,))
        st = cur.fetchone()
        if not st:
            return
        msg = "Your leave request has been " + status + "."
        with _main.flask_app.app_context():
            send_notification(st["student_user_id"], title="Leave " + status.capitalize(), body=msg, ntype="leave")
            if st["parent_id"]:
                send_notification(
                    st["parent_id"], title="Leave " + status.capitalize(),
                    body=st["student_name"] + "'s leave request has been " + status + ".", ntype="leave"
                )
    except Exception as e:
        print("[leave notify student]", e)


def _get_matching_rule(cur, leave_type_id, total_days):
    try:
        lt_id = int(leave_type_id)
        t_days = int(total_days)
    except (TypeError, ValueError):
        return None
    cur.execute("SELECT * FROM sp_get_matching_leave_rule(%s, %s)", (lt_id, t_days))
    return cur.fetchone()


@router.get("/my-children")
def get_my_children(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_children_for_leave(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])



def _has_active_workflow(db, leave_id):
    """Returns True if an active workflow instance exists for this leave."""
    try:
        _cur = db.cursor()
        _cur.execute(
            "SELECT id FROM workflow_instances WHERE module='leaves' AND entity_type='leave_application' AND entity_id=%s AND status='active' LIMIT 1",
            (leave_id,)
        )
        return _cur.fetchone() is not None
    except Exception:
        return False


def _engine_advance_leave(db, leave_id, action, user_id, note):
    """Advance the workflow for a leave and update leave status accordingly."""
    try:
        # Get entity_status from current pending step before advancing
        _sc = db.cursor()
        _sc.execute(
            """SELECT ws.entity_status_on_approve, ws.entity_status_on_reject
               FROM workflow_step_instances wsi
               JOIN workflow_steps ws ON ws.id=wsi.step_id
               JOIN workflow_instances wi ON wi.id=wsi.instance_id
               WHERE wi.module='leaves' AND wi.entity_type='leave_application'
                 AND wi.entity_id=%s AND wsi.status='pending'
               ORDER BY wsi.step_order LIMIT 1""",
            (leave_id,)
        )
        _ws = _sc.fetchone()
        is_rejection = action in ('reject', 'rejected')
        if is_rejection:
            _new_status = (_ws[1] if _ws and _ws[1] else 'rejected')
        else:
            _default_s = "approved" if action == "approve" else action
            _new_status = (_ws[0].lower() if _ws and _ws[0] else _default_s)

        # Update leave status
        _sc.execute("UPDATE leave_requests SET status=%s WHERE id=%s", (_new_status, leave_id))

        # Advance engine
        result = wf_engine.advance(
            db, module="leaves", entity_type="leave_application",
            entity_id=leave_id, action=action,
            actioned_by=user_id, note=note or ""
        )
        return True, _new_status
    except Exception as _e:
        print("[engine_advance_leave error]", _e)
        import traceback; traceback.print_exc()
        return False, None

@router.post("/apply")
def apply_leave(
    student_id: Optional[Any] = Form(None), leave_type_id: Optional[Any] = Form(None),
    from_date: Optional[str] = Form(None), to_date: Optional[str] = Form(None),
    reason: Optional[str] = Form(None), certificate: Optional[UploadFile] = File(None),
    user_id: int = Depends(require_permission("leave.apply")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else claims.get("role", "")
    cur = get_cur(db)

    if role == "student":
        cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
        row = cur.fetchone()
        if not row or not row["sid"]:
            fail("Student profile not found", 404)
        resolved_student_id = row["sid"]
    elif role == "parent":
        if not student_id:
            cur.execute("SELECT sp_get_active_child_id(%s) AS sid", (user_id,))
            row = cur.fetchone()
            if not row or not row["sid"]:
                fail("No active student linked to this parent", 404)
            resolved_student_id = row["sid"]
        else:
            cur.execute("SELECT sp_check_student_belongs_to_parent(%s, %s) AS belongs", (int(student_id), user_id))
            if not cur.fetchone()["belongs"]:
                fail("Student not linked to this parent", 403)
            resolved_student_id = int(student_id)
    else:
        fail("Only students or parents can apply for leave", 403)

    certificate_url = None
    if certificate and certificate.filename:
        ext = os.path.splitext(certificate.filename)[1].lower()
        if ext not in ALLOWED_EXT:
            fail("Certificate must be PDF, JPG, or PNG", 400)
        os.makedirs(CERT_UPLOAD_DIR, exist_ok=True)
        fname = "leave_" + str(resolved_student_id) + "_" + str(int(time.time())) + ext
        with open(os.path.join(CERT_UPLOAD_DIR, fname), "wb") as f:
            f.write(certificate.file.read())
        certificate_url = fname

    cur.execute(
        "SELECT * FROM sp_apply_leave(%s,%s,%s,%s,%s,%s,%s)",
        (resolved_student_id, leave_type_id, from_date, to_date, reason, certificate_url, user_id)
    )
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    leave_id = result["id"]
    db.commit()

    cur.execute("SELECT sp_get_leave_type_notify_mode(%s) AS notify_mode", (leave_id,))
    row = cur.fetchone()
    notify_mode = row["notify_mode"] if row and row["notify_mode"] else "incharge_only"
    _notify_teachers(cur, resolved_student_id, leave_id, notify_mode)

    try:
        if from_date and to_date:
            from datetime import date as _date
            fd = _date.fromisoformat(str(from_date))
            td = _date.fromisoformat(str(to_date))
            total_days = (td - fd).days + 1
            rule = _get_matching_rule(cur, leave_type_id, total_days)
            if rule and rule.get("recommender_role"):
                from app.utils.notify import send_notification
                import main as _main
                cur.execute("SELECT * FROM sp_get_leave_request_notify_info(%s)", (leave_id,))
                lr_info = cur.fetchone()
                student_name = lr_info["student_name"] if lr_info else "A student"
                cur.execute("SELECT * FROM sp_get_active_users_by_role(%s)", (rule["recommender_role"],))
                recommenders = cur.fetchall()
                with _main.flask_app.app_context():
                    for r in recommenders:
                        send_notification(
                            r["id"], title="Leave Needs Recommendation",
                            body="Leave request for " + student_name + " needs your recommendation.", ntype="leave"
                        )
    except Exception as e:
        print("[leave recommender notify]", e)

    db.rollback()  # clear any aborted state before WQ insert
    # WF Engine: trigger
    try:
        _lv_cur = db.cursor()
        _lv_cur.execute(
            "SELECT lr.student_id, lr.leave_type_id, (lr.to_date - lr.from_date + 1) AS duration FROM leave_requests lr WHERE lr.id=%s",
            (leave_id,)
        )
        _lv_row = _lv_cur.fetchone()
        _ctx = {"entity_id": leave_id}
        if _lv_row:
            _dur = _lv_row[2]
            if hasattr(_dur, 'days'): _dur = _dur.days
            else: _dur = int(_dur or 1)
            _ctx.update({"student_id": _lv_row[0], "leave_type_id": _lv_row[1], "duration": _dur})
        _wf_result = wf_engine.trigger(
            db, module="leaves", entity_type="leave_application",
            entity_id=leave_id, initiated_by=user_id,
            submitter_id=user_id, context=_ctx
        )
        if not _wf_result:
            _cur2 = db.cursor()
            _cur2.execute("""
                INSERT INTO work_queue_items
                    (module, entity_type, entity_id, title, description, action_required, priority, assigned_role, assigned_user_id, link, metadata, entity_status, created_by, submitter_id)
                SELECT 'leaves','leave_application',%s,'Leave Request','Leave submitted','recommend','normal','teacher',
                       t.user_id,'/leave-approval?id='||%s::text,'{}','submitted',%s,%s
                FROM leave_requests lr
                JOIN students s ON s.id=lr.student_id
                LEFT JOIN class_teachers ct ON ct.class_id=s.class_id AND ct.is_primary=TRUE
                LEFT JOIN teachers t ON t.id=ct.teacher_id
                WHERE lr.id=%s LIMIT 1
            """, (leave_id, leave_id, user_id, user_id, leave_id))
    except Exception as _wf_e:
        import traceback; traceback.print_exc()
        print('[leaves WF trigger error]', type(_wf_e).__name__, str(_wf_e))
    return ok(data={"id": leave_id}, message="Leave request submitted.")


@router.get("/")
def get_leaves(
    student_id: Optional[int] = Query(None), status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None), to_date: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
    campus_id: Optional[int] = Depends(get_current_campus_id),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else claims.get("role", "")
    permissions = claims.get("permissions", [])
    cur = get_cur(db)

    if role == "hr":
        return ok(data=[])

    if "leave.view_all" not in permissions and "leave.view_class" not in permissions:
        if role == "student":
            cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
            row = cur.fetchone()
            student_id = row["sid"] if row else None
        elif role == "parent":
            if not student_id:
                cur.execute("SELECT sp_get_active_child_id(%s) AS sid", (user_id,))
                row = cur.fetchone()
                student_id = row["sid"] if row else None

    if "leave.view_class" in permissions and "leave.view_all" not in permissions:
        if role == "academic_coordinator":
            cur.execute("SELECT * FROM sp_get_leave_requests(%s, %s, %s, %s, %s, %s)", (user_id, None, status, from_date, to_date, campus_id))
            rows = [dict(r) for r in cur.fetchall()]
        else:
            cur.execute("SELECT * FROM sp_get_teacher_incharge_class_student_ids(%s)", (user_id,))
            class_students = [r["id"] for r in cur.fetchall()]
            if not class_students:
                return ok(data=[])
            rows = []
            for sid in class_students:
                cur.execute("SELECT * FROM sp_get_leave_requests(%s, %s, %s, %s, %s, %s)", (user_id, sid, status, from_date, to_date, campus_id))
                rows.extend([dict(r) for r in cur.fetchall()])
        for row in rows:
            cur.execute("SELECT sp_get_leave_type_id_for_request(%s) AS lt_id", (row["id"],))
            lt_row = cur.fetchone()
            lt_id = lt_row["lt_id"] if lt_row else None
            rule = _get_matching_rule(cur, lt_id, row["total_days"]) if lt_id else None
            if rule:
                row["needs_recommendation"] = bool(rule.get("recommender_role"))
                row["approver_role"] = rule.get("approver_role", "")
                row["recommender_role"] = rule.get("recommender_role", "")
            else:
                row["needs_recommendation"] = False
                row["approver_role"] = ""
                row["recommender_role"] = ""
        return ok(data=rows)

    cur.execute("SELECT * FROM sp_get_leave_requests(%s, %s, %s, %s, %s, %s)", (user_id, student_id, status, from_date, to_date, campus_id))
    rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        cur.execute("SELECT sp_get_leave_type_id_for_request(%s) AS lt_id", (row["id"],))
        lt_row = cur.fetchone()
        lt_id = lt_row["lt_id"] if lt_row else None
        rule = _get_matching_rule(cur, lt_id, row["total_days"]) if lt_id else None
        if rule:
            row["needs_recommendation"] = bool(rule.get("recommender_role"))
            row["approver_role"] = rule.get("approver_role", "")
        else:
            row["needs_recommendation"] = False
            row["approver_role"] = ""
    return ok(data=rows)


@router.get("/my-balance")
def get_balance(
    student_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("leave.view_own")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else claims.get("role", "")
    cur = get_cur(db)

    if role == "student":
        cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
        row = cur.fetchone()
        student_id = row["sid"] if row else None
    elif role == "parent":
        if not student_id:
            cur.execute("SELECT sp_get_active_child_id(%s) AS sid", (user_id,))
            row = cur.fetchone()
            student_id = row["sid"] if row else None

    if not student_id:
        fail("Student not found", 404)

    cur.execute("SELECT sp_get_active_academic_year() AS yid")
    yr = cur.fetchone()
    if not yr or not yr["yid"]:
        fail("No active academic year", 400)

    cur.execute("SELECT * FROM sp_get_leave_balance(%s, %s)", (student_id, yr["yid"]))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/{leave_id}/recommend")
def recommend_leave(leave_id: int, body: RecommendIn, user_id: int = Depends(require_permission("leave.recommend")), db=Depends(get_db)):
    cur = get_cur(db)
    # Engine-first: if workflow instance active, bypass SP
    if _has_active_workflow(db, leave_id):
        _ok, _status = _engine_advance_leave(db, leave_id, "approve", user_id, body.note)
        if not _ok:
            fail("Workflow advance failed", 500)
        db.commit()
        return ok(message="Leave recommended.")
    # Legacy: use SP
    cur.execute("SELECT * FROM sp_recommend_leave(%s, %s, %s)", (leave_id, user_id, body.note or ""))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        cur.execute("SELECT * FROM sp_get_leave_request_basic(%s)", (leave_id,))
        lr_basic = cur.fetchone()
        if lr_basic:
            rule = _get_matching_rule(cur, lr_basic["leave_type_id"], lr_basic["total_days"])
            if rule and rule.get("approver_role"):
                from app.utils.notify import send_notification
                import main as _main
                cur.execute("SELECT * FROM sp_get_leave_request_notify_info(%s)", (leave_id,))
                lr = cur.fetchone()
                student_name = lr["student_name"] if lr else "A student"
                cur.execute("SELECT * FROM sp_get_active_users_by_role(%s)", (rule["approver_role"],))
                approvers = cur.fetchall()
                with _main.flask_app.app_context():
                    for row in approvers:
                        send_notification(
                            row["id"], title="Leave Recommended",
                            body="Leave request for " + student_name + " is awaiting your approval.", ntype="leave"
                        )
    except Exception as e:
        print("[recommend notify]", e)

    db.rollback()  # clear any aborted state
    # WF Engine: advance recommend
    try:
        wf_engine.advance(
            db, module="leaves", entity_type="leave_application",
            entity_id=leave_id, action="approve",
            actioned_by=user_id, note=getattr(body, "note", "") or ""
        )
    except Exception as _wf_e:
        import traceback; traceback.print_exc()
        print('[leaves WF recommend error]', type(_wf_e).__name__, str(_wf_e))
    return ok(message="Leave recommended.")


@router.post("/{leave_id}/action")
def action_leave(
    leave_id: int, body: ActionIn, user_id: int = Depends(get_current_user_id),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else claims.get("role", "")
    permissions = claims.get("permissions", [])
    action = body.action or ""

    if action not in ("approve", "reject", "verify", "recommend", "clear", "publish", "review"):
        fail("action must be a valid workflow action", 400)
    if action == "reject" and not body.note:
        fail("Rejection reason is required", 400)

    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_leave_request_basic(%s)", (leave_id,))
    lr = cur.fetchone()
    if not lr:
        fail("Leave request not found", 404)

    if "leave.approve" not in permissions:
        # Check if user is assigned to current workflow step
        _wf_cur = db.cursor()
        _wf_cur.execute("""
            SELECT wsi.id FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='leaves' AND wi.entity_type='leave_application'
              AND wi.entity_id=%s AND wsi.status='pending'
              AND (wsi.assigned_to_id=%s OR wsi.assigned_role=ANY(%s::varchar[]))
            LIMIT 1
        """, (leave_id, user_id, list(roles) if roles else []))
        _wf_step = _wf_cur.fetchone()
        if not _wf_step:
            rule = _get_matching_rule(cur, lr["leave_type_id"], lr["total_days"])
            if not rule or rule.get("approver_role") != role:
                fail("You do not have permission to approve this leave", 403)

    # Engine-first: if workflow instance active, bypass SP
    if _has_active_workflow(db, leave_id):
        _ok, _status = _engine_advance_leave(db, leave_id, action, user_id, body.note)
        if not _ok:
            fail("Workflow advance failed", 500)
        db.commit()
        return ok(message="Leave " + action + "d successfully.")
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    status = "approved" if action == "approve" else "rejected"
    _notify_student_parent(cur, lr["student_id"], status)

    if action == "approve":
        try:
            cur.execute("SELECT * FROM sp_get_leave_request_dates(%s)", (leave_id,))
            lr_dates = cur.fetchone()
            if lr_dates:
                cur.execute("SELECT sp_mark_leave_attendance(%s, %s, %s, %s)", (lr["student_id"], lr_dates["from_date"], lr_dates["to_date"], user_id))
                db.commit()
        except Exception as e:
            print("[leave attendance]", e)

    db.rollback()  # clear any aborted state
    # WF Engine: advance action
    try:
        wf_engine.advance(
            db, module="leaves", entity_type="leave_application",
            entity_id=leave_id, action=body.action,
            actioned_by=user_id, note=getattr(body, "note", "") or ""
        )
    except Exception as _wf_e:
        import traceback; traceback.print_exc()
        print('[leaves WF action error]', type(_wf_e).__name__, str(_wf_e))

