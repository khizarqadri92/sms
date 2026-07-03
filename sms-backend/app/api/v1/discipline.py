from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, get_jwt
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.utils.sp_helper import call_sp
import psycopg2.extras, os

bp = Blueprint("discipline", __name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "uploads", "discipline")

def get_db():
    from app.db.connection import get_db as _get_db
    return _get_db()

def get_cur(db=None):
    db = db or get_db()
    return db, db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


@bp.get("/")
@jwt_required_custom
@require_permission("discipline.view")
def list_cases():
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_discipline_cases()")
    rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        for k in ["incident_date","suspension_from","suspension_to","appeal_deadline","hearing_date","created_at"]:
            if row.get(k): row[k] = str(row[k])
    # Teacher: only show cases from their classes
    if role == "teacher":
        cur.execute("""
            SELECT ct.class_id FROM class_teachers ct
            JOIN teachers t ON t.id=ct.teacher_id
            WHERE t.user_id=%s
        """, (user_id,))
        class_ids = {r["class_id"] for r in cur.fetchall()}
        cur.execute("""
            SELECT id FROM students WHERE class_id=ANY(%s)
        """, (list(class_ids),))
        student_ids = {r["id"] for r in cur.fetchall()}
        rows = [r for r in rows if r["student_id"] in student_ids]
    # Parent: only show cases for their children
    elif role == "parent":
        cur.execute("SELECT id FROM students WHERE parent_id=%s", (user_id,))
        student_ids = {r["id"] for r in cur.fetchall()}
        rows = [r for r in rows if r["student_id"] in student_ids]
    return success(data=rows)


@bp.get("/<int:case_id>")
@jwt_required_custom
@require_permission("discipline.view")
def get_case(case_id):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_discipline_case_detail(%s)", (case_id,))
    row = cur.fetchone()
    if not row: return error("Case not found", 404)
    result = dict(row)
    for k in ["incident_date","suspension_from","suspension_to","appeal_deadline","hearing_date","created_at"]:
        if result.get(k): result[k] = str(result[k])
    cur.execute("""
        SELECT de.*, u.first_name||' '||u.last_name AS uploaded_by_name
        FROM discipline_evidence de JOIN users u ON u.id=de.uploaded_by
        WHERE de.case_id=%s ORDER BY de.uploaded_at
    """, (case_id,))
    result["evidence"] = [dict(r) for r in cur.fetchall()]
    cur.execute("""
        SELECT dh.*, u.first_name||' '||u.last_name AS created_by_name
        FROM discipline_hearings dh JOIN users u ON u.id=dh.created_by
        WHERE dh.case_id=%s ORDER BY dh.created_at
    """, (case_id,))
    result["hearings"] = [dict(r) for r in cur.fetchall()]
    cur.execute("""
        SELECT da.*, u.first_name||' '||u.last_name AS submitted_by_name
        FROM discipline_appeals da JOIN users u ON u.id=da.submitted_by
        WHERE da.case_id=%s ORDER BY da.submitted_at
    """, (case_id,))
    result["appeals"] = [dict(r) for r in cur.fetchall()]
    return success(data=result)


@bp.post("/report")
@jwt_required_custom
@require_permission("discipline.report")
def report_case():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    student_id     = body.get("student_id")
    violation_type = body.get("violation_type","")
    severity       = body.get("severity", 1)
    description    = body.get("description","").strip()
    incident_date  = body.get("incident_date")

    if not student_id or not description or not incident_date:
        return error("student_id, description and incident_date are required", 400)

    result, err = call_sp("sp_report_discipline_case",
        (student_id, user_id, violation_type, severity, description, incident_date))
    if err: return error(err, 400)

    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
                       JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "New Discipline Case Reported",
                "A teacher has reported a discipline case.", "warning")
    except Exception as e:
        print("[discipline notify]", e)

    return success(message="Case reported.", data={"id": result.get("id")})


@bp.post("/<int:case_id>/review")
@jwt_required_custom
@require_permission("discipline.review")
def review_case(case_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    action       = body.get("action","review")
    note         = body.get("note","")
    hearing_date = body.get("hearing_date")

    result, err = call_sp("sp_review_discipline_case",
        (case_id, user_id, action, note, hearing_date))
    if err: return error(err, 400)

    if action == "schedule":
        try:
            from app.utils.notify import send_notification
            db, cur = get_cur()
            cur.execute("SELECT dc.student_id FROM discipline_cases dc WHERE dc.id=%s", (case_id,))
            row = cur.fetchone()
            if row:
                cur.execute("SELECT s.parent_id, s.user_id FROM students s WHERE s.id=%s", (row["student_id"],))
                stu = cur.fetchone()
                if stu:
                    if stu["parent_id"]: send_notification(stu["parent_id"], "Hearing Scheduled", "A disciplinary hearing has been scheduled for your child.", "warning")
                    if stu["user_id"]: send_notification(stu["user_id"], "Hearing Scheduled", "A disciplinary hearing has been scheduled.", "warning")
        except Exception as e:
            print("[discipline notify]", e)

    return success(message="Case updated.")


@bp.post("/<int:case_id>/hearing")
@jwt_required_custom
@require_permission("discipline.hearing")
def conduct_hearing(case_id):
    user_id    = int(get_jwt_identity())
    body       = request.get_json() or {}
    attendees  = body.get("attendees","")
    notes      = body.get("notes","")
    outcome    = body.get("outcome","")

    result, err = call_sp("sp_conduct_hearing", (case_id, user_id, attendees, notes, outcome))
    if err: return error(err, 400)

    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("""SELECT p.id FROM users p JOIN user_roles ur ON ur.user_id=p.id
                       JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND p.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "Hearing Conducted", "Disciplinary hearing completed. Decision required.", "info")
    except Exception as e:
        print("[discipline notify]", e)

    return success(message="Hearing recorded.")


@bp.post("/<int:case_id>/decide")
@jwt_required_custom
@require_permission("discipline.decide")
def decide_case(case_id):
    user_id       = int(get_jwt_identity())
    body          = request.get_json() or {}
    action_type   = body.get("action_type","")
    note          = body.get("note","")
    susp_from     = body.get("suspension_from")
    susp_to       = body.get("suspension_to")

    if action_type not in ("warning","suspension","expulsion","dismissed"):
        return error("Invalid action_type", 400)

    result, err = call_sp("sp_decide_discipline_case",
        (case_id, user_id, action_type, note, susp_from, susp_to))
    if err: return error(err, 400)

    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT dc.student_id FROM discipline_cases dc WHERE dc.id=%s", (case_id,))
        row = cur.fetchone()
        if row:
            cur.execute("SELECT s.parent_id, s.user_id FROM students s WHERE s.id=%s", (row["student_id"],))
            stu = cur.fetchone()
            if stu:
                msg = "A decision has been made on the disciplinary case: " + action_type.upper()
                if stu["parent_id"]: send_notification(stu["parent_id"], "Disciplinary Decision", msg, "warning" if action_type in ("suspension","expulsion") else "info")
                if stu["user_id"]: send_notification(stu["user_id"], "Disciplinary Decision", msg, "warning")
    except Exception as e:
        print("[discipline notify]", e)

    return success(message="Decision recorded.")


@bp.post("/<int:case_id>/committee")
@jwt_required_custom
@require_permission("discipline.review")
def assign_committee(case_id):
    user_id    = int(get_jwt_identity())
    body       = request.get_json() or {}
    teacher_ids = body.get("teacher_ids", [])
    head_id     = body.get("head_id")
    if not teacher_ids or not head_id:
        return error("teacher_ids and head_id are required", 400)
    result, err = call_sp("sp_assign_hearing_committee", (case_id, teacher_ids, head_id))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        for tid in teacher_ids:
            cur.execute("SELECT t.user_id FROM teachers t WHERE t.id=%s", (tid,))
            row = cur.fetchone()
            if row:
                role_label = "Head of Hearing Committee" if tid==head_id else "Hearing Committee Member"
                send_notification(row["user_id"],
                    "Hearing Committee Assignment",
                    "You have been assigned as "+role_label+" for a discipline case.",
                    "warning")
    except Exception as e:
        print("[committee notify]", e)
    return success(message="Committee assigned.")


@bp.get("/<int:case_id>/committee")
@jwt_required_custom
@require_permission("discipline.view")
def get_committee(case_id):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_committee_remarks(%s)", (case_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("submitted_at"): r["submitted_at"] = str(r["submitted_at"])
    return success(data=rows)


@bp.post("/<int:case_id>/remarks")
@jwt_required_custom
@require_permission("discipline.committee")
def submit_remarks(case_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    remarks        = body.get("remarks","").strip()
    recommendation = body.get("recommendation","")
    if not remarks: return error("Remarks are required", 400)
    db, cur = get_cur()
    cur.execute("SELECT t.id FROM teachers t WHERE t.user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return error("Teacher not found", 404)
    result, err = call_sp("sp_submit_member_remarks", (case_id, t["id"], remarks, recommendation))
    if err: return error(err, 400)
    if result and result.get("all_submitted"):
        try:
            from app.utils.notify import send_notification
            cur.execute("""SELECT hc.teacher_id, t.user_id FROM hearing_committee hc
                          JOIN teachers t ON t.id=hc.teacher_id WHERE hc.case_id=%s AND hc.is_head=TRUE""", (case_id,))
            head = cur.fetchone()
            if head:
                send_notification(head["user_id"],
                    "All Remarks Submitted",
                    "All committee members have submitted their remarks. You can now submit the final hearing report.",
                    "info")
        except Exception as e:
            print("[remarks notify]", e)
    return success(message="Remarks submitted.")


@bp.post("/<int:case_id>/final-hearing")
@jwt_required_custom
@require_permission("discipline.committee")
def submit_final_hearing(case_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    attendees     = body.get("attendees","")
    final_remarks = body.get("final_remarks","").strip()
    outcome       = body.get("outcome","").strip()
    if not final_remarks or not outcome: return error("Final remarks and outcome are required", 400)
    db, cur = get_cur()
    cur.execute("SELECT t.id FROM teachers t WHERE t.user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return error("Teacher not found", 404)
    result, err = call_sp("sp_submit_final_hearing", (case_id, t["id"], attendees, final_remarks, outcome))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        cur.execute("""SELECT p.id FROM users p JOIN user_roles ur ON ur.user_id=p.id
                      JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND p.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "Hearing Report Submitted",
                "The hearing committee has submitted their final report. Your decision is required.", "info")
    except Exception as e:
        print("[final hearing notify]", e)
    return success(message="Final hearing report submitted.")


@bp.post("/<int:case_id>/evidence")
@jwt_required_custom
@require_permission("discipline.report")
def upload_evidence(case_id):
    user_id = int(get_jwt_identity())
    desc    = request.form.get("description","")
    if "file" not in request.files:
        return error("No file provided", 400)
    f   = request.files["file"]
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in [".pdf",".jpg",".jpeg",".png",".doc",".docx",".mp4",".mov"]:
        return error("Invalid file type", 400)
    fname = "evidence_" + str(case_id) + "_" + str(int(__import__("time").time())) + ext
    f.save(os.path.join(UPLOAD_DIR, fname))
    db, cur = get_cur()
    cur.execute("""INSERT INTO discipline_evidence(case_id,filename,url,description,uploaded_by)
                   VALUES(%s,%s,%s,%s,%s) RETURNING id""",
                (case_id, f.filename, fname, desc, user_id))
    db.commit()
    return success(message="Evidence uploaded.")


@bp.post("/<int:case_id>/appeal/respond")
@jwt_required_custom
@require_permission("discipline.decide")
def respond_appeal(case_id):
    user_id  = int(get_jwt_identity())
    body     = request.get_json() or {}
    outcome  = body.get("outcome","")
    response = body.get("response","").strip()
    if outcome not in ("upheld","overturned"):
        return error("outcome must be upheld or overturned", 400)
    if not response:
        return error("Response note is required", 400)
    result, err = call_sp("sp_respond_appeal", (case_id, user_id, outcome, response))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT dc.student_id FROM discipline_cases dc WHERE dc.id=%s", (case_id,))
        row = cur.fetchone()
        if row:
            cur.execute("SELECT s.parent_id, s.user_id FROM students s WHERE s.id=%s", (row["student_id"],))
            stu = cur.fetchone()
            if stu:
                msg = "Your appeal has been " + ("accepted - student reinstated." if outcome=="overturned" else "rejected - original decision stands.")
                if stu["parent_id"]: send_notification(stu["parent_id"], "Appeal Decision", msg, "success" if outcome=="overturned" else "warning")
                if stu["user_id"]: send_notification(stu["user_id"], "Appeal Decision", msg, "success" if outcome=="overturned" else "warning")
    except Exception as e:
        print("[appeal respond notify]", e)
    return success(message="Appeal response recorded.")


@bp.get("/<int:case_id>/evidence/<int:evidence_id>/download")
@jwt_required_custom
@require_permission("discipline.view")
def download_evidence(case_id, evidence_id):
    db, cur = get_cur()
    cur.execute("SELECT url, filename FROM discipline_evidence WHERE id=%s AND case_id=%s", (evidence_id, case_id))
    row = cur.fetchone()
    if not row: return error("Evidence not found", 404)
    from flask import send_from_directory
    return send_from_directory(UPLOAD_DIR, row["url"], download_name=row["filename"])


@bp.post("/<int:case_id>/appeal")
@jwt_required_custom
@require_permission("discipline.appeal")
def submit_appeal(case_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    note    = body.get("note","").strip()
    if not note: return error("Appeal note is required", 400)

    result, err = call_sp("sp_submit_appeal", (case_id, user_id, note))
    if err: return error(err, 400)

    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("""SELECT p.id FROM users p JOIN user_roles ur ON ur.user_id=p.id
                       JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND p.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "Disciplinary Appeal Submitted",
                "A parent has submitted an appeal for a disciplinary case.", "warning")
    except Exception as e:
        print("[discipline notify]", e)

    return success(message="Appeal submitted.")