from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, get_jwt
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.utils.sp_helper import call_sp
import psycopg2.extras, os

bp = Blueprint("withdrawal", __name__)

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads", "withdrawal"
)

def get_db():
    from app.db.connection import get_db as _get_db
    return _get_db()

def get_cur(db=None):
    db = db or get_db()
    return db, db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


@bp.get("/")
@jwt_required_custom
def list_withdrawals():
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    perms   = claims.get("permissions", [])
    allowed = {"withdrawal.view_own","withdrawal.view_all","withdrawal.review","withdrawal.clear","withdrawal.approve"}
    if not any(p in perms for p in allowed):
        return error("Permission denied", 403)

    view_all = "withdrawal.view_all" in perms or "withdrawal.review" in perms or "withdrawal.clear" in perms or "withdrawal.approve" in perms
    db, cur  = get_cur()
    role     = (claims.get("roles") or [""])[0]

    if role == "teacher":
        # Get all classes this teacher is assigned to
        cur.execute("""
            SELECT ct.class_id, ct.is_primary
            FROM class_teachers ct
            JOIN teachers t ON t.id=ct.teacher_id
            WHERE t.user_id=%s
        """, (user_id,))
        teacher_classes = {r["class_id"]: r["is_primary"] for r in cur.fetchall()}

        cur.execute("""
            SELECT wr.*, s.first_name||' '||s.last_name AS student_name,
                   s.enrollment_no, c.name AS class_name, c.section,
                   u.first_name||' '||u.last_name AS requested_by_name,
                   wr.coordinator_note, wr.principal_note
            FROM withdrawal_requests wr
            JOIN students s ON s.id=wr.student_id
            JOIN classes c ON c.id=s.class_id
            JOIN users u ON u.id=wr.requested_by
            WHERE s.class_id = ANY(%s)
            ORDER BY wr.requested_at DESC
        """, (list(teacher_classes.keys()),))
        rows = [dict(r) for r in cur.fetchall()]
        for row in rows:
            cur.execute("SELECT * FROM sp_get_withdrawal_clearances(%s)", (row["id"],))
            row["clearances"] = [dict(c) for c in cur.fetchall()]
            for k in ["requested_at","effective_date"]:
                if row.get(k): row[k] = str(row[k])
            row["is_incharge"] = teacher_classes.get(row["student_id"] and
                next((s["class_id"] for s in [{"class_id": row.get("student_id")}] ), None), False)
            # Fix: mark incharge based on class
            row["is_incharge"] = teacher_classes.get(
                next((r2["class_id"] for r2 in [{"class_id": c_id} for c_id in teacher_classes if True] if True), None)
                , False)
        # Rebuild with proper incharge flag
        for row in rows:
            cur.execute("SELECT class_id FROM students WHERE id=%s", (row["student_id"],))
            s = cur.fetchone()
            row["is_incharge"] = bool(teacher_classes.get(s["class_id"] if s else 0, False))
        return success(data=rows)

    cur.execute("SELECT * FROM sp_get_withdrawal_list(%s, %s)", (user_id, view_all))
    rows = [dict(r) for r in cur.fetchall()]

    for row in rows:
        cur.execute("SELECT * FROM sp_get_withdrawal_clearances(%s)", (row["id"],))
        row["clearances"] = [dict(c) for c in cur.fetchall()]
        for k in ["requested_at","effective_date"]:
            if row.get(k): row[k] = str(row[k])

    return success(data=rows)


@bp.get("/<int:req_id>")
@jwt_required_custom
def get_withdrawal(req_id):
    claims = get_jwt()
    perms  = claims.get("permissions", [])
    allowed = {"withdrawal.view_own","withdrawal.view_all","withdrawal.review","withdrawal.clear","withdrawal.approve"}
    if not any(p in perms for p in allowed):
        return error("Permission denied", 403)

    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_withdrawal_detail(%s)", (req_id,))
    row = cur.fetchone()
    if not row:
        return error("Withdrawal request not found", 404)

    result = dict(row)
    for k in ["requested_at","effective_date","coordinator_at","principal_at"]:
        if result.get(k): result[k] = str(result[k])

    cur.execute("SELECT * FROM sp_get_withdrawal_clearances(%s)", (req_id,))
    result["clearances"] = [dict(c) for c in cur.fetchall()]

    cur.execute("SELECT * FROM sp_get_withdrawal_documents(%s)", (req_id,))
    result["documents"] = [dict(d) for d in cur.fetchall()]

    return success(data=result)


@bp.post("/apply")
@jwt_required_custom
@require_permission("withdrawal.apply")
def apply_withdrawal():
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    db, cur = get_cur()

    student_id = request.form.get("student_id")
    reason     = request.form.get("reason","").strip()
    eff_date   = request.form.get("effective_date") or None

    if not student_id or not reason:
        return error("student_id and reason are required", 400)

    if role == "parent":
        cur.execute("SELECT s.id FROM students s WHERE s.id=%s AND s.parent_id=%s", (student_id, user_id))
        if not cur.fetchone():
            return error("Student not found or not your child", 403)

    doc_url = None
    if "document" in request.files:
        f = request.files["document"]
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in [".pdf",".jpg",".jpeg",".png",".doc",".docx"]:
            return error("Invalid file type", 400)
        fname = "withdrawal_" + str(user_id) + "_" + str(int(__import__("time").time())) + ext
        f.save(os.path.join(UPLOAD_DIR, fname))
        doc_url = fname

    result, err = call_sp("sp_apply_withdrawal", (student_id, user_id, reason, eff_date, doc_url))
    if err:
        return error(err, 400)

    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("academic_coordinator",))
        for row in cur.fetchall():
            send_notification(row["user_id"],
                title="New Withdrawal Request",
                body="A parent has submitted a student withdrawal request.",
                ntype="info")
    except Exception as e:
        print("[withdrawal notify]", e)

    return success(message="Withdrawal request submitted.", data={"id": result.get("id")})


@bp.post("/<int:req_id>/review")
@jwt_required_custom
@require_permission("withdrawal.review")
def review_withdrawal(req_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    action  = body.get("action","")
    note    = body.get("note","")
    depts   = body.get("departments", ["finance","library","admin"])

    if action not in ("approve","reject"):
        return error("action must be approve or reject", 400)

    result, err = call_sp("sp_review_withdrawal", (req_id, user_id, action, note, depts))
    if err:
        return error(err, 400)

    if action == "approve":
        try:
            from app.utils.notify import send_notification
            db, cur = get_cur()
            dept_roles = {"finance":"finance_officer","library":"librarian","admin":"admin","hr":"hr","transport":"transport"}
            for dept in depts:
                role_name = dept_roles.get(dept)
                if role_name:
                    cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", (role_name,))
                    for row in cur.fetchall():
                        send_notification(row["user_id"],
                            title="Withdrawal Clearance Required",
                            body="A student withdrawal requires your department clearance.",
                            ntype="warning")
        except Exception as e:
            print("[withdrawal notify]", e)

    return success(message="Withdrawal " + action + "d.")


@bp.post("/<int:req_id>/clear")
@jwt_required_custom
@require_permission("withdrawal.clear")
def clear_withdrawal(req_id):
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    body    = request.get_json() or {}
    action  = body.get("action","")
    note    = body.get("note","")

    if action not in ("clear","reject"):
        return error("action must be clear or reject", 400)

    dept_map = {
        "finance_officer": "finance",
        "librarian":       "library",
        "admin":           "admin",
        "hr":              "hr",
        "superadmin":      body.get("department","admin"),
    }
    department = dept_map.get(role, role)

    result, err = call_sp("sp_clear_withdrawal", (req_id, department, user_id, action, note))
    if err:
        return error(err, 400)

    if result and result.get("all_cleared"):
        try:
            from app.utils.notify import send_notification
            db, cur = get_cur()
            cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("principal",))
            for row in cur.fetchall():
                send_notification(row["user_id"],
                    title="Withdrawal Ready for Final Approval",
                    body="All departments have cleared the withdrawal. Your approval is required.",
                    ntype="info")
        except Exception as e:
            print("[withdrawal notify]", e)

    return success(message="Department clearance " + action + "ed.")


@bp.post("/<int:req_id>/approve")
@jwt_required_custom
@require_permission("withdrawal.approve")
def approve_withdrawal(req_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    action  = body.get("action","")
    note    = body.get("note","")

    if action not in ("approve","reject"):
        return error("action must be approve or reject", 400)

    result, err = call_sp("sp_approve_withdrawal", (req_id, user_id, action, note))
    if err:
        return error(err, 400)

    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT wr.requested_by FROM withdrawal_requests wr WHERE wr.id=%s", (req_id,))
        row = cur.fetchone()
        if row:
            send_notification(row["requested_by"],
                title="Withdrawal Request " + action.capitalize() + "d",
                body="Your student withdrawal request has been " + action + "d by the principal.",
                ntype="success" if action=="approve" else "warning")
    except Exception as e:
        print("[withdrawal notify]", e)

    return success(message="Withdrawal request " + action + "d.")


@bp.post("/<int:req_id>/require")
@jwt_required_custom
@require_permission("withdrawal.clear")
def require_action(req_id):
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    body    = request.get_json() or {}
    note    = body.get("note","").strip()

    if not note:
        return error("Note is required", 400)

    dept_map = {
        "finance_officer": "finance",
        "librarian":       "library",
        "admin":           "admin",
        "hr":              "hr",
        "superadmin":      body.get("department","admin"),
    }
    department = dept_map.get(role, role)

    result, err = call_sp("sp_withdrawal_require_action", (req_id, department, user_id, note))
    if err:
        return error(err, 400)

    # Notify parent
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT wr.requested_by FROM withdrawal_requests wr WHERE wr.id=%s", (req_id,))
        row = cur.fetchone()
        if row:
            send_notification(row["requested_by"],
                title="Action Required for Withdrawal",
                body="Your withdrawal request requires action: " + note[:100],
                ntype="warning")
    except Exception as e:
        print("[withdrawal notify]", e)

    return success(message="Requirement submitted. Parent notified.")


@bp.get("/<int:req_id>/conduct")
@jwt_required_custom
def get_conduct(req_id):
    claims = get_jwt()
    perms  = claims.get("permissions", [])
    allowed = {"withdrawal.view_all","withdrawal.review","withdrawal.approve","attendance.view","withdrawal.view_own"}
    if not any(p in perms for p in allowed):
        return error("Permission denied", 403)
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_conduct_form(%s)", (req_id,))
    row = cur.fetchone()
    if not row:
        return success(data=None)
    result = dict(row)
    if result.get("submitted_at"): result["submitted_at"] = str(result["submitted_at"])
    return success(data=result)


@bp.post("/<int:req_id>/conduct")
@jwt_required_custom
def submit_conduct(req_id):
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    if role not in ("teacher","academic_coordinator","superadmin","admin"):
        return error("Only class teachers can submit conduct forms", 403)
    body = request.get_json() or {}
    result, err = call_sp("sp_submit_conduct_form", (
        req_id, user_id,
        body.get("behaviour","Good"),
        body.get("discipline","Good"),
        body.get("academic_performance","Good"),
        body.get("attendance_regularity","Good"),
        body.get("cocurricular","Limited"),
        body.get("disciplinary_action", False),
        body.get("disciplinary_details",""),
        body.get("remarks",""),
        body.get("recommended_readmission", False),
    ))
    if err:
        return error(err, 400)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT * FROM sp_get_dept_role_users(%s)", ("principal",))
        for row in cur.fetchall():
            send_notification(row["user_id"],
                title="Conduct Form Submitted",
                body="Class teacher has submitted the conduct form for a withdrawal request.",
                ntype="info")
    except Exception as e:
        print("[conduct notify]", e)
    return success(message="Conduct form submitted successfully.")


@bp.post("/<int:req_id>/finalize")
@jwt_required_custom
@require_permission("withdrawal.review")
def finalize_withdrawal(req_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    action  = body.get("action","")
    note    = body.get("note","")

    if action not in ("approve","reject"):
        return error("action must be approve or reject", 400)

    result, err = call_sp("sp_finalize_withdrawal", (req_id, user_id, action, note))
    if err:
        return error(err, 400)

    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT wr.requested_by, wr.student_id FROM withdrawal_requests wr WHERE wr.id=%s", (req_id,))
        row = cur.fetchone()
        if row:
            send_notification(row["requested_by"],
                title="Withdrawal " + action.capitalize() + "d",
                body="Your student withdrawal request has been finalized.",
                ntype="success" if action=="approve" else "warning")
            if action == "approve":
                # Notify class incharge and subject teachers
                cur.execute("""
                    SELECT DISTINCT t.user_id FROM students s
                    JOIN class_teachers ct ON ct.class_id=s.class_id
                    JOIN teachers t ON t.id=ct.teacher_id
                    WHERE s.id=%s
                    UNION
                    SELECT DISTINCT t2.user_id FROM students s2
                    JOIN class_teachers ct2 ON ct2.class_id=s2.class_id
                    JOIN teacher_subjects ts ON ts.teacher_id=ct2.teacher_id
                    JOIN teachers t2 ON t2.id=ts.teacher_id
                    WHERE s2.id=%s
                """, (row["student_id"], row["student_id"]))
                for t in cur.fetchall():
                    send_notification(t["user_id"],
                        title="Student Withdrawn",
                        body="A student in your class has been withdrawn from school.",
                        ntype="info")
    except Exception as e:
        print("[withdrawal notify]", e)

    return success(message="Withdrawal finalized.")


@bp.get("/<int:req_id>/tc")
@jwt_required_custom
def get_tc(req_id):
    claims = get_jwt()
    perms  = claims.get("permissions", [])
    allowed = {"withdrawal.view_own","withdrawal.view_all","withdrawal.review","withdrawal.approve"}
    if not any(p in perms for p in allowed):
        return error("Permission denied", 403)

    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_withdrawal_tc(%s)", (req_id,))
    row = cur.fetchone()
    if not row:
        return error("TC data not found", 404)
    result = dict(row)
    for k in ["date_of_birth","admission_date","effective_date","withdrawal_date"]:
        if result.get(k): result[k] = str(result[k])
    return success(data=result)


@bp.get("/student/<int:student_id>/books")
@jwt_required_custom
def student_books(student_id):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_student_issued_books(%s)", (student_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ["issued_at","due_date","returned_at"]:
            if r.get(k): r[k] = str(r[k])
    return success(data=rows)


@bp.get("/<int:req_id>/document/<int:doc_id>")
@jwt_required_custom
def download_document(req_id, doc_id):
    claims = get_jwt()
    perms  = claims.get("permissions", [])
    allowed = {"withdrawal.view_own","withdrawal.view_all","withdrawal.review","withdrawal.clear","withdrawal.approve"}
    if not any(p in perms for p in allowed):
        return error("Permission denied", 403)

    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_withdrawal_documents(%s)", (req_id,))
    docs = [dict(r) for r in cur.fetchall()]
    doc  = next((d for d in docs if d.get("id")==doc_id), None)
    if not doc:
        return error("Document not found", 404)
    from flask import send_from_directory
    return send_from_directory(UPLOAD_DIR, doc["url"], download_name=doc["filename"])