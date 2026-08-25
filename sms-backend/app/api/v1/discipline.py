"""
Native FastAPI router for Discipline - migrated from app/api/v1/discipline.py.
All 8 broken chr()-stub SPs rebuilt cleanly. 7 helper SPs added for inline queries.
sp_report_discipline_case, sp_assign_hearing_committee were already clean.
sp_submit_member_remarks, sp_submit_appeal were rebuilt during withdrawal migration.
"""

import os
import time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime

router = APIRouter()

try:
    from app.utils.workflow_engine import WorkflowEngine
    wf_engine = WorkflowEngine()
except Exception:
    wf_engine = None

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "discipline")
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".mp4", ".mov"}


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def fmt_dates(row, keys):
    for k in keys:
        if row.get(k): row[k] = str(row[k])
    return row


class ReportIn(BaseModel):
    student_id: int
    violation_type: Optional[str] = ""
    severity: Optional[int] = 1
    description: str
    incident_date: str


class ReviewIn(BaseModel):
    action: Optional[str] = "review"
    note: Optional[str] = ""
    hearing_date: Optional[str] = None


class HearingIn(BaseModel):
    attendees: Optional[str] = ""
    notes: Optional[str] = ""
    outcome: Optional[str] = ""


class DecideIn(BaseModel):
    action_type: str
    note: Optional[str] = ""
    suspension_from: Optional[str] = None
    suspension_to: Optional[str] = None


class NoteIn(BaseModel):
    note: Optional[str] = ""
    action: Optional[str] = "approve"

class CommitteeIn(BaseModel):
    teacher_ids: List[int]
    head_id: int
    hearing_date: Optional[str] = None
    witness_user_ids: Optional[List[int]] = []
    hearing_location: Optional[str] = ""


class RemarksIn(BaseModel):
    remarks: str
    recommendation: Optional[str] = ""


class FinalHearingIn(BaseModel):
    attendees: Optional[str] = ""
    final_remarks: str
    outcome: str


class AppealRespondIn(BaseModel):
    outcome: str
    response: str


class AppealIn(BaseModel):
    note: str


DATE_KEYS = ["incident_date", "suspension_from", "suspension_to", "appeal_deadline",
             "hearing_date", "created_at", "submitted_at", "conducted_at", "scheduled_at",
             "uploaded_at", "response_at"]


@router.get("/")
def list_cases(
    status: Optional[str] = None,
    user_id: int = Depends(require_permission("discipline.view")),
    claims: dict = Depends(get_jwt_claims), db=Depends(get_db),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_discipline_cases()")
    rows = [fmt_dates(dict(r), DATE_KEYS) for r in cur.fetchall()]

    if role == "teacher":
        cur.execute("SELECT * FROM sp_get_teacher_class_student_ids(%s)", (user_id,))
        student_ids = {r["student_id"] for r in cur.fetchall()}
        cur.execute("SELECT * FROM sp_get_teacher_committee_case_ids(%s)", (user_id,))
        committee_case_ids = {r["case_id"] for r in cur.fetchall()}
        rows = [r for r in rows if r["student_id"] in student_ids or r["id"] in committee_case_ids]
    elif role == "parent":
        cur.execute("SELECT * FROM sp_get_parent_children_ids(%s)", (user_id,))
        student_ids = {r["student_id"] for r in cur.fetchall()}
        rows = [r for r in rows if r["student_id"] in student_ids]

    if status:
        rows = [r for r in rows if r.get("status") == status]
    return ok(data=rows)


@router.get("/{case_id}")
def get_case(case_id: int, user_id: int = Depends(require_permission("discipline.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_discipline_case_detail(%s)", (case_id,))
    row = cur.fetchone()
    if not row:
        fail("Case not found", 404)
    result = fmt_dates(dict(row), DATE_KEYS)

    cur.execute("SELECT * FROM sp_get_discipline_evidence(%s)", (case_id,))
    result["evidence"] = [fmt_dates(dict(r), DATE_KEYS) for r in cur.fetchall()]

    cur.execute("SELECT * FROM sp_get_discipline_hearings(%s)", (case_id,))
    result["hearings"] = [fmt_dates(dict(r), DATE_KEYS) for r in cur.fetchall()]

    cur.execute("SELECT * FROM sp_get_discipline_appeals(%s)", (case_id,))
    result["appeals"] = [fmt_dates(dict(r), DATE_KEYS) for r in cur.fetchall()]

    return ok(data=result)


@router.post("/report")
def report_case(body: ReportIn, user_id: int = Depends(require_permission("discipline.report")), db=Depends(get_db)):
    if not body.description or not body.incident_date:
        fail("student_id, description and incident_date are required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_report_discipline_case(%s,%s,%s,%s,%s,%s)",
        (body.student_id, user_id, body.violation_type, body.severity, body.description, body.incident_date))
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
                send_notification(row["user_id"], "New Discipline Case Reported",
                    "A teacher has reported a discipline case.", "warning")
    except Exception as e:
        print("[discipline notify]", e)
    # Trigger workflow engine
    if wf_engine:
        try:
            case_id = result["id"]
            # Use teacher as submitter (correct name in WQ)
            wf_engine.trigger(db, module="discipline", entity_type="discipline_case",
                entity_id=case_id, initiated_by=user_id, submitter_id=user_id,
                context={"entity_id": case_id, "student_id": str(body.student_id or ""),
                         "severity": str(body.severity or 1)})
            db.commit()
            print("[discipline WF] triggered for case", case_id)
            # Create a view-only WQ notification for parent
            try:
                _pnt = get_cur(db)
                _pnt.execute("SELECT parent_id FROM students WHERE id=%s", (body.student_id,))
                _pr = _pnt.fetchone()
                if _pr and _pr["parent_id"]:
                    _pnt.execute("""INSERT INTO work_queue_items
                        (module,entity_type,entity_id,title,description,
                         assigned_user_id,submitter_id,status,entity_status,
                         action_required,link,created_by,assigned_role)
                        VALUES ('discipline','discipline_case',%s,
                        'Discipline Case Reported','A discipline case has been reported for your child.',
                        %s,%s,'pending','reported','view','/discipline',%s,'academic_coordinator')""",
                        (case_id, _pr["parent_id"], user_id, user_id))
                    db.commit()
            except Exception as pe:
                print("[parent notify WQ]", pe)
        except Exception as we:
            import traceback; traceback.print_exc()
            print("[discipline WF ERROR]", type(we).__name__, str(we))

    return ok(data={"id": result["id"]}, message="Case reported.")


@router.post("/{case_id}/review")
def review_case(case_id: int, body: ReviewIn, user_id: int = Depends(require_permission("discipline.review")), db=Depends(get_db)):
    cur = get_cur(db)
    # Engine-first
    if wf_engine:
        try:
            action = "reject" if body.action == "dismiss" else "approve"
            adv = wf_engine.advance(db, "discipline", "discipline_case", case_id,
                action=action, actioned_by=user_id, note=body.note or "")
            if adv:
                status_map = {"approve": "under_review", "reject": "dismissed"}
                new_status = status_map.get(action, "under_review")
                cur.execute("UPDATE discipline_cases SET status=%s, coordinator_id=%s WHERE id=%s",
                    (new_status, user_id, case_id))
                db.commit()
                return ok(message="Case updated.")
        except Exception as e:
            print("[discipline review engine]", e)
    cur.execute("SELECT * FROM sp_review_discipline_case(%s,%s,%s,%s,%s)",
        (case_id, user_id, body.action or "review", body.note or "", body.hearing_date or None))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    if body.action == "schedule":
        try:
            from app.utils.notify import send_notification
            import main as _main
            cur.execute("SELECT * FROM sp_get_discipline_case_detail(%s)", (case_id,))
            dc = cur.fetchone()
            if dc:
                with _main.flask_app.app_context():
                    cur.execute("SELECT * FROM sp_get_student_notify_info(%s)", (dc["student_id"],))
                    stu = cur.fetchone()
                    if stu:
                        if stu["parent_id"]:
                            send_notification(stu["parent_id"], "Hearing Scheduled",
                                "A disciplinary hearing has been scheduled for your child.", "warning")
                        send_notification(stu["student_user_id"], "Hearing Scheduled",
                            "A disciplinary hearing has been scheduled.", "warning")
        except Exception as e:
            print("[discipline notify]", e)

    return ok(message="Case updated.")


@router.post("/{case_id}/hearing")
def conduct_hearing(case_id: int, body: HearingIn, user_id: int = Depends(require_permission("discipline.hearing")), db=Depends(get_db)):
    cur = get_cur(db)
    # Engine-first
    if wf_engine:
        try:
            adv = wf_engine.advance(db, "discipline", "discipline_case", case_id,
                action="hearing", actioned_by=user_id, note=body.notes or "Hearing conducted.")
            if adv:
                cur.execute("UPDATE discipline_cases SET status='hearing_done', hearing_notes=%s WHERE id=%s",
                    (body.notes or "", case_id))
                db.commit()
                return ok(message="Hearing recorded.")
        except Exception as e:
            print("[discipline hearing engine]", e)
    cur.execute("SELECT * FROM sp_conduct_hearing(%s,%s,%s,%s,%s)",
        (case_id, user_id, body.attendees or "", body.notes or "", body.outcome or ""))
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
                send_notification(row["user_id"], "Hearing Conducted",
                    "Disciplinary hearing completed. Decision required.", "info")
    except Exception as e:
        print("[discipline notify]", e)

    return ok(message="Hearing recorded.")


@router.post("/{case_id}/decide")
def decide_case(case_id: int, body: DecideIn, user_id: int = Depends(require_permission("discipline.decide")), db=Depends(get_db)):
    if body.action_type not in ("warning", "suspension", "expulsion", "dismissed"):
        fail("Invalid action_type", 400)
    cur = get_cur(db)
    # Engine-first
    if wf_engine:
        try:
            action = "reject" if body.action_type == "dismissed" else "decide"
            adv = wf_engine.advance(db, "discipline", "discipline_case", case_id,
                action=action, actioned_by=user_id,
                note=f"{body.action_type}: {body.note or ''}")
            if adv:
                cur.execute("""UPDATE discipline_cases SET status=%s, action_type=%s,
                    action_note=%s, principal_id=%s, suspension_from=%s, suspension_to=%s
                    WHERE id=%s""",
                    (body.action_type, body.action_type, body.note or "",
                     user_id, body.suspension_from or None, body.suspension_to or None, case_id))
                # Update WQ entity_status to the actual decision
                cur.execute("""UPDATE work_queue_items SET entity_status=%s
                    WHERE module='discipline' AND entity_id=%s""",
                    (body.action_type, case_id))
                db.commit()
        except Exception as e:
            print("[discipline decide engine]", e)
    cur.execute("SELECT * FROM sp_decide_discipline_case(%s,%s,%s,%s,%s,%s)",
        (case_id, user_id, body.action_type, body.note or "",
         body.suspension_from or None, body.suspension_to or None))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_discipline_case_detail(%s)", (case_id,))
        dc = cur.fetchone()
        if dc:
            cur.execute("SELECT * FROM sp_get_student_notify_info(%s)", (dc["student_id"],))
            stu = cur.fetchone()
            if stu:
                msg = "A decision has been made on the disciplinary case: " + body.action_type.upper()
                ntype = "warning" if body.action_type in ("suspension", "expulsion") else "info"
                with _main.flask_app.app_context():
                    if stu["parent_id"]:
                        send_notification(stu["parent_id"], "Disciplinary Decision", msg, ntype)
                    send_notification(stu["student_user_id"], "Disciplinary Decision", msg, "warning")
    except Exception as e:
        print("[discipline notify]", e)

    # Always update WQ entity_status to actual decision
    try:
        print(f"[decide WQ] updating case_id={case_id} action_type={body.action_type}")
        _uc = get_cur(db)
        rows = _uc.execute("UPDATE work_queue_items SET entity_status=%s WHERE module='discipline' AND entity_id=%s RETURNING id",
            (body.action_type, case_id))
        print(f"[decide WQ] updated rows:", _uc.rowcount)
        db.commit()
    except Exception as _ue:
        print("[discipline WQ status update]", _ue)
    return ok(message="Decision recorded.")


@router.post("/{case_id}/committee")
def assign_committee(case_id: int, body: CommitteeIn, user_id: int = Depends(require_permission("discipline.review")), db=Depends(get_db)):
    if not body.teacher_ids or not body.head_id:
        fail("teacher_ids and head_id are required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_assign_hearing_committee(%s,%s,%s)",
        (case_id, body.teacher_ids, body.head_id))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        with _main.flask_app.app_context():
            for tid in body.teacher_ids:
                user_id_t = cur.execute("SELECT sp_get_teacher_user_id(%s) AS uid", (tid,)) or None
                row = cur.fetchone()
                if row and row.get("uid"):
                    role_label = "Head of Hearing Committee" if tid == body.head_id else "Hearing Committee Member"
                    send_notification(row["uid"], "Hearing Committee Assignment",
                        "You have been assigned as " + role_label + " for a discipline case.", "warning")
    except Exception as e:
        print("[committee notify]", e)

    # Create WQ items for each committee member to submit remarks
    try:
        _wqc = get_cur(db)
        print("[committee WQ] teacher_ids:", body.teacher_ids)
        for tid in body.teacher_ids:
            _wqc.execute("SELECT user_id FROM teachers WHERE id=%s", (tid,))
            tr = _wqc.fetchone()
            print(f"[committee WQ] tid={tid} tr={tr}")
            if tr and tr["user_id"]:
                member_uid = int(tr["user_id"])  # extract before cursor reuse
                is_head = (tid == body.head_id)
                wq_title = "Submit Hearing Remarks (Head)" if is_head else "Submit Hearing Remarks"
                _wqc.execute("""INSERT INTO work_queue_items
                    (module, entity_type, entity_id, title, description,
                     assigned_user_id, submitter_id, status, entity_status,
                     action_required, link, created_by)
                    VALUES ('discipline','discipline_case',%s,%s,
                    'Please submit your remarks for the discipline hearing.',
                    %s,%s,'pending','hearing_scheduled',
                    'submit_remarks','/discipline',%s)""",
                    (case_id, wq_title, member_uid, user_id, user_id))
                print(f"[committee WQ] inserted for user {member_uid}")
                _wqc.execute("SELECT id,assigned_user_id,submitter_id FROM work_queue_items ORDER BY id DESC LIMIT 1")
                chk = dict(_wqc.fetchone())
                print(f"[committee WQ] DB check: {chk}")
        db.commit()
    except Exception as wqe:
        print("[committee WQ items]", wqe)
    # Advance engine for assign_committee step
    if wf_engine:
        try:
            adv = wf_engine.advance(db, "discipline", "discipline_case", case_id,
                action="assign_committee", actioned_by=user_id,
                note=f"Committee assigned. Hearing scheduled.")
            if adv:
                cur.execute("UPDATE discipline_cases SET status='hearing_scheduled', hearing_location=%s WHERE id=%s", (body.hearing_location or "", case_id))
                db.commit()
        except Exception as e:
            print("[discipline assign_committee engine]", e)
    # Save hearing date and location first so notifications have correct info
    try:
        _hd_cur = get_cur(db)
        if body.hearing_date:
            from datetime import datetime
            hd_val = body.hearing_date.replace("T"," ")
            _hd_cur.execute("UPDATE discipline_cases SET hearing_date=%s WHERE id=%s", (hd_val, case_id))
        if body.hearing_location:
            _hd_cur.execute("UPDATE discipline_cases SET hearing_location=%s WHERE id=%s", (body.hearing_location, case_id))
        db.commit()
    except Exception as hde:
        print("[hearing date save]", hde)
    # Save hearing appearance list and notify
    try:
        cur2 = get_cur(db)
        # Get case info for notifications
        cur2.execute("""SELECT dc.student_id, dc.reported_by, dc.hearing_date, dc.hearing_location,
            s.parent_id, (u.first_name||' '||u.last_name) as reporter_name
            FROM discipline_cases dc
            JOIN students s ON s.id=dc.student_id
            JOIN users u ON u.id=dc.reported_by
            WHERE dc.id=%s""", (case_id,))
        case_info = cur2.fetchone()
        if case_info:
            hearing_dt = str(case_info["hearing_date"]) if case_info["hearing_date"] else "TBD"
            appear_users = []
            # Auto: parent of student
            if case_info["parent_id"]:
                cur2.execute("SELECT first_name||' '||last_name AS name FROM users WHERE id=%s", (case_info["parent_id"],))
                pr = cur2.fetchone()
                cur2.execute("INSERT INTO hearing_appearance (case_id,user_id,person_type,person_name) VALUES (%s,%s,'student_parent',%s)",
                    (case_id, case_info["parent_id"], pr["name"] if pr else "Parent"))
                appear_users.append((case_info["parent_id"], "parent"))
            # Auto: reporter
            if case_info["reported_by"]:
                cur2.execute("INSERT INTO hearing_appearance (case_id,user_id,person_type,person_name) VALUES (%s,%s,'reporter',%s)",
                    (case_id, case_info["reported_by"], case_info["reporter_name"]))
                appear_users.append((case_info["reported_by"], "reporter"))
            # Additional witnesses
            for wuid in (body.witness_user_ids or []):
                cur2.execute("SELECT first_name||' '||last_name AS name FROM users WHERE id=%s", (wuid,))
                wr = cur2.fetchone()
                cur2.execute("INSERT INTO hearing_appearance (case_id,user_id,person_type,person_name) VALUES (%s,%s,'witness',%s) ON CONFLICT DO NOTHING",
                    (case_id, wuid, wr["name"] if wr else "Witness"))
                appear_users.append((wuid, "witness"))
            db.commit()
            # Send notifications
            try:
                from app.utils.notify import send_notification
                import main as _main
                with _main.flask_app.app_context():
                    for (uid, role) in appear_users:
                        role_label = {"parent":"as the student's parent","reporter":"as the reporting teacher","witness":"as a witness"}.get(role,"")
                        hearing_formatted = ""
                        if case_info["hearing_date"]:
                            from datetime import datetime
                            try:
                                hd = case_info["hearing_date"]
                                hearing_formatted = hd.strftime("%A, %d %B %Y at %I:%M %p") if hasattr(hd,"strftime") else str(hd)
                            except: hearing_formatted = str(case_info["hearing_date"])
                        location_str = case_info.get("hearing_location") or "To be announced"
                        send_notification(uid, "Hearing Appearance Notice",
                            f"You are required to appear before the Discipline Hearing Committee {role_label}.\n\nHearing Details:\nDate & Time: {hearing_formatted}\nLocation: {location_str}\nPlease ensure your presence at the scheduled time.",
                            "warning")
            except Exception as ne:
                print("[appearance notify]", ne)
    except Exception as ae:
        print("[appearance save]", ae)
    return ok(message="Committee assigned.")


@router.get("/{case_id}/appearance-candidates")
def get_appearance_candidates(case_id: int, user_id: int = Depends(require_permission("discipline.view")), db=Depends(get_db)):
    """Returns all people who could appear before the committee for this case."""
    cur = get_cur(db)
    cur.execute("""
        SELECT dc.reported_by, dc.student_id,
            (ru.first_name||' '||ru.last_name) AS reporter_name,
            (s.first_name||' '||s.last_name) AS student_name,
            s.parent_id,
            (pu.first_name||' '||pu.last_name) AS parent_name,
            c.id AS class_id
        FROM discipline_cases dc
        JOIN users ru ON ru.id=dc.reported_by
        JOIN students s ON s.id=dc.student_id
        JOIN classes c ON c.id=s.class_id
        LEFT JOIN users pu ON pu.id=s.parent_id
        WHERE dc.id=%s
    """, (case_id,))
    row = cur.fetchone()
    if not row:
        fail("Case not found", 404)
    candidates = []
    # Reporter
    candidates.append({"type":"reporter","label":"Reporting Teacher",
        "user_id":row["reported_by"],"name":row["reporter_name"]})
    # Parent
    if row["parent_id"]:
        candidates.append({"type":"parent","label":"Student Parent",
            "user_id":row["parent_id"],"name":row["parent_name"] or "Parent"})
    # Class incharge/teacher - only add if different from reporter
    cur.execute("""
        SELECT u.id AS user_id, (u.first_name||' '||u.last_name) AS name
        FROM class_teachers ct
        JOIN teachers t ON t.id=ct.teacher_id
        JOIN users u ON u.id=t.user_id
        WHERE ct.class_id=%s AND ct.is_primary=true LIMIT 1
    """, (row["class_id"],))
    ci = cur.fetchone()
    if ci and ci["user_id"] != row["reported_by"]:
        candidates.append({"type":"class_incharge","label":"Class Incharge",
            "user_id":ci["user_id"],"name":ci["name"]})
    elif ci and ci["user_id"] == row["reported_by"]:
        # Reporter is the class incharge - update label
        candidates[0]["label"] = "Reporting Teacher / Class Incharge"
    # Student - get user account if exists
    cur.execute("SELECT user_id FROM students WHERE id=%s", (row["student_id"],))
    stu = cur.fetchone()
    stu_user_id = stu["user_id"] if stu and stu.get("user_id") else None
    candidates.append({"type":"student","label":"Student",
        "user_id":stu_user_id,"name":row["student_name"]})
    return ok(data=candidates)

@router.get("/{case_id}/committee")
def get_committee(case_id: int, user_id: int = Depends(require_permission("discipline.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_committee_remarks(%s)", (case_id,))
    rows = [fmt_dates(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.post("/{case_id}/remarks")
def submit_remarks(case_id: int, body: RemarksIn, user_id: int = Depends(require_permission("discipline.committee")), db=Depends(get_db)):
    if not body.remarks.strip():
        fail("Remarks are required", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher not found", 404)
    teacher_id = row["tid"]
    cur.execute("SELECT * FROM sp_submit_member_remarks(%s,%s,%s,%s)",
        (case_id, teacher_id, body.remarks, body.recommendation or ""))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    if result.get("all_submitted"):
        try:
            from app.utils.notify import send_notification
            import main as _main
            cur.execute("""SELECT hc.teacher_id, t.user_id FROM hearing_committee hc
                          JOIN teachers t ON t.id=hc.teacher_id
                          WHERE hc.case_id=%s AND hc.is_head=TRUE""", (case_id,))
            head = cur.fetchone()
            if head:
                with _main.flask_app.app_context():
                    send_notification(head["user_id"], "All Remarks Submitted",
                        "All committee members have submitted their remarks. You can now submit the final hearing report.", "info")
        except Exception as e:
            print("[remarks notify]", e)

    # Complete this member's WQ item
    try:
        _wqr = get_cur(db)
        _wqr.execute("""UPDATE work_queue_items SET status='completed',
            completed_by=%s, completed_at=%s
            WHERE module='discipline' AND entity_id=%s
            AND assigned_user_id=%s AND action_required='submit_remarks'""",
            (user_id, get_processing_datetime(db), case_id, user_id))
        db.commit()
    except Exception as wqre:
        print("[remarks WQ complete]", wqre)
    return ok(message="Remarks submitted.")


@router.post("/{case_id}/final-hearing")
def submit_final_hearing(case_id: int, body: FinalHearingIn, user_id: int = Depends(require_permission("discipline.committee")), db=Depends(get_db)):
    if not body.final_remarks or not body.outcome:
        fail("Final remarks and outcome are required", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher not found", 404)
    teacher_id = row["tid"]
    cur.execute("SELECT * FROM sp_submit_final_hearing(%s,%s,%s,%s,%s)",
        (case_id, teacher_id, body.attendees or "", body.final_remarks, body.outcome))
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
                send_notification(row["user_id"], "Hearing Report Submitted",
                    "The hearing committee has submitted their final report. Your decision is required.", "info")
    except Exception as e:
        print("[final hearing notify]", e)

    return ok(message="Final hearing report submitted.")


@router.post("/{case_id}/evidence")
def upload_evidence(
    case_id: int, description: Optional[str] = Form(""),
    file: UploadFile = File(...),
    user_id: int = Depends(require_permission("discipline.report")), db=Depends(get_db),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        fail("Invalid file type", 400)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    fname = "evidence_" + str(case_id) + "_" + str(int(time.time())) + ext
    with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
        f.write(file.file.read())
    cur = get_cur(db)
    cur.execute("""INSERT INTO discipline_evidence(case_id,filename,url,description,uploaded_by)
                   VALUES(%s,%s,%s,%s,%s) RETURNING id""",
                (case_id, file.filename, fname, description, user_id))
    db.commit()
    return ok(message="Evidence uploaded.")


@router.post("/{case_id}/appeal/forward")
def forward_appeal(case_id: int, body: NoteIn, user_id: int = Depends(require_permission("discipline.review")), db=Depends(get_db)):
    """Coordinator forwards appeal to principal for final decision."""
    if wf_engine:
        try:
            action = body.action if body.action in ("approve","reject") else "approve"
            msg = "Appeal forwarded to principal." if action=="approve" else "Appeal rejected by coordinator."
            adv = wf_engine.advance(db, "discipline", "discipline_appeal", case_id,
                action=action, actioned_by=user_id,
                note=body.note or msg)
            if adv:
                cur2=get_cur(db)
                if action=="reject":
                    cur2.execute("UPDATE discipline_cases SET status=(SELECT action_type FROM discipline_cases WHERE id=%s), appeal_outcome='rejected' WHERE id=%s AND status='appealed'", (case_id, case_id))
                    cur2.execute("""UPDATE discipline_appeals SET outcome='rejected', response=%s, response_by=%s, response_at=%s
                        WHERE case_id=%s""", (body.note or "Appeal rejected by coordinator.", user_id, get_processing_datetime(db), case_id))
                db.commit()
                return ok(message=msg)
        except Exception as e:
            print("[appeal forward]", e)
            fail("Failed to forward appeal.", 500)
    fail("Workflow engine not available.", 500)

@router.post("/{case_id}/appeal/respond")
def respond_appeal(case_id: int, body: AppealRespondIn, user_id: int = Depends(require_permission("discipline.decide")), db=Depends(get_db)):
    if body.outcome not in ("upheld", "overturned"):
        fail("outcome must be upheld or overturned", 400)
    if not body.response:
        fail("Response note is required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_respond_appeal(%s,%s,%s,%s)",
        (case_id, user_id, body.outcome, body.response))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT * FROM sp_get_discipline_case_detail(%s)", (case_id,))
        dc = cur.fetchone()
        if dc:
            cur.execute("SELECT * FROM sp_get_student_notify_info(%s)", (dc["student_id"],))
            stu = cur.fetchone()
            if stu:
                msg = "Your appeal has been " + ("accepted - student reinstated." if body.outcome == "overturned" else "rejected - original decision stands.")
                ntype = "success" if body.outcome == "overturned" else "warning"
                with _main.flask_app.app_context():
                    if stu["parent_id"]:
                        send_notification(stu["parent_id"], "Appeal Decision", msg, ntype)
                    send_notification(stu["student_user_id"], "Appeal Decision", msg, ntype)
    except Exception as e:
        print("[appeal notify]", e)

    # Advance appeal workflow
    if wf_engine:
        try:
            action = "approve" if body.outcome == "overturned" else "reject"  # overturned=appeal accepted, upheld=appeal rejected
            adv = wf_engine.advance(db, "discipline", "discipline_appeal", case_id,
                action=action, actioned_by=user_id, note=body.response or body.outcome)
            if adv:
                # Update WQ entity_status to outcome
                _uc = get_cur(db)
                _uc.execute("""UPDATE work_queue_items SET entity_status=%s
                    WHERE module='discipline' AND entity_id=%s""",
                    (body.outcome, case_id))
                db.commit()
        except Exception as we:
            print("[discipline appeal respond engine]", we)
    # Save appeal_outcome and complete parent WQ notification
    try:
        _ao = get_cur(db)
        outcome_val = "upheld" if body.outcome == "overturned" else "rejected"
        _ao.execute("UPDATE discipline_cases SET appeal_outcome=%s WHERE id=%s", (outcome_val, case_id))
        _ao.execute("""UPDATE work_queue_items SET status='completed', completed_at=%s, completed_by=%s, entity_status=%s
            WHERE module='discipline' AND entity_id=%s AND action_required='view'""",
            (get_processing_datetime(db), user_id, outcome_val, case_id))
        db.commit()
    except Exception as aoe:
        print("[appeal_outcome save]", aoe)
    return ok(message="Appeal response recorded.")


@router.get("/{case_id}/evidence/{evidence_id}/download")
def download_evidence(case_id: int, evidence_id: int, user_id: int = Depends(require_permission("discipline.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT url, filename FROM discipline_evidence WHERE id=%s AND case_id=%s", (evidence_id, case_id))
    row = cur.fetchone()
    if not row:
        fail("Evidence not found", 404)
    fp = os.path.join(UPLOAD_DIR, row["url"])
    if not os.path.exists(fp):
        fail("File not found on server", 404)
    return FileResponse(fp, filename=row["filename"])


@router.post("/{case_id}/appeal")
def submit_appeal(case_id: int, body: AppealIn, user_id: int = Depends(require_permission("discipline.appeal")), db=Depends(get_db)):
    if not body.note.strip():
        fail("Appeal note is required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_submit_appeal(%s,%s,%s)", (case_id, user_id, body.note))
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
                send_notification(row["user_id"], "Disciplinary Appeal Submitted",
                    "A parent has submitted an appeal for a disciplinary case.", "warning")
    except Exception as e:
        print("[discipline notify]", e)

    # Trigger appeal workflow
    if wf_engine:
        try:
            wf_engine.trigger(db, module="discipline", entity_type="discipline_appeal",
                entity_id=case_id, initiated_by=user_id, submitter_id=user_id,
                context={"entity_id": case_id, "appeal_note": body.note})
            db.commit()
            print(f"[discipline appeal WF] triggered for case {case_id}")
        except Exception as we:
            import traceback; traceback.print_exc()
            print("[discipline appeal WF ERROR]", we)
    return ok(message="Appeal submitted.")
