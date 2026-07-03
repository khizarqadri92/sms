from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, get_jwt
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras
import os

bp = Blueprint("leaves", __name__)

CERT_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "leave_certificates")


def get_db():
    from app.db.connection import get_db as _get_db
    return _get_db()


def _notify_teachers(student_id, leave_request_id, notify_mode, db):
    try:
        from app.utils.notify import send_notification
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT s.class_id, u.first_name || ' ' || u.last_name AS student_name
            FROM students s JOIN users u ON u.id = s.user_id
            WHERE s.id = %s
        """, (student_id,))
        st = cur.fetchone()
        if not st:
            return
        if notify_mode == "all_teachers":
            cur.execute("""
                SELECT DISTINCT t.user_id FROM class_teachers ct
                JOIN teachers t ON t.id = ct.teacher_id
                WHERE ct.class_id = %s
            """, (st["class_id"],))
        else:
            cur.execute("""
                SELECT t.user_id FROM class_teachers ct
                JOIN teachers t ON t.id = ct.teacher_id
                WHERE ct.class_id = %s AND ct.is_primary = TRUE LIMIT 1
            """, (st["class_id"],))
        for t in cur.fetchall():
            send_notification(t["user_id"],
                title="Leave Request",
                body=st["student_name"] + " has applied for leave (Request #" + str(leave_request_id) + ")",
                ntype="leave")
    except Exception as e:
        print("[leave notify] " + str(e))


def _notify_student_parent(student_id, status, db):
    try:
        from app.utils.notify import send_notification
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT s.user_id AS student_user_id, s.parent_id,
                   u.first_name || ' ' || u.last_name AS student_name
            FROM students s JOIN users u ON u.id = s.user_id
            WHERE s.id = %s
        """, (student_id,))
        st = cur.fetchone()
        if not st:
            return
        msg = "Your leave request has been " + status + "."
        send_notification(st["student_user_id"], title="Leave " + status.capitalize(), body=msg, ntype="leave")
        if st["parent_id"]:
            send_notification(st["parent_id"],
                title="Leave " + status.capitalize(),
                body=st["student_name"] + "'s leave request has been " + status + ".",
                ntype="leave")
    except Exception as e:
        print("[leave notify student] " + str(e))



def _get_matching_rule(leave_type_id, total_days, db):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        lt_id = int(leave_type_id)
        t_days = int(total_days)
    except (TypeError, ValueError):
        return None
    cur.execute(
        """SELECT recommender_role, approver_role
           FROM leave_approval_rules
           WHERE leave_type_id = %s
             AND day_from <= %s
             AND (day_to IS NULL OR day_to >= %s)
           ORDER BY day_from DESC LIMIT 1""",
        (lt_id, t_days, t_days)
    )
    row = cur.fetchone()
    print("[rule match] leave_type_id:", lt_id, "total_days:", t_days, "rule:", dict(row) if row else None)
    return row

@bp.get("/my-children")
@jwt_required_custom
def get_my_children():
    user_id = int(get_jwt_identity())
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT s.id, s.enrollment_no,
               s.first_name || ' ' || s.last_name AS name,
               c.name AS class_name
        FROM students s
        JOIN classes c ON c.id = s.class_id
        WHERE s.parent_id = %s AND s.status = 'active'
        ORDER BY s.first_name
    """, (user_id,))
    return success(data=cur.fetchall())


@bp.post("/apply")
@jwt_required_custom
@require_permission("leave.apply")
def apply_leave():
    user_id = int(get_jwt_identity())
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    claims = get_jwt()
    roles  = claims.get("roles", [])
    role   = roles[0] if roles else claims.get("role", "")
    student_id = request.form.get("student_id") or (request.json or {}).get("student_id")

    if role == "student":
        cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return error("Student profile not found", 404)
        student_id = row["id"]
    elif role == "parent":
        if not student_id:
            cur.execute("SELECT id FROM students WHERE parent_id=%s AND status='active' LIMIT 1", (user_id,))
            row = cur.fetchone()
            if not row:
                return error("No active student linked to this parent", 404)
            student_id = row["id"]
        else:
            cur.execute("SELECT id FROM students WHERE id=%s AND parent_id=%s", (int(student_id), user_id))
            if not cur.fetchone():
                return error("Student not linked to this parent", 403)
            student_id = int(student_id)
    else:
        return error("Only students or parents can apply for leave", 403)

    certificate_url = None
    if "certificate" in request.files:
        f = request.files["certificate"]
        if f.filename:
            ext = os.path.splitext(f.filename)[1].lower()
            if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
                return error("Certificate must be PDF, JPG, or PNG", 400)
            fname = "leave_" + str(student_id) + "_" + str(int(__import__("time").time())) + ext
            f.save(os.path.join(CERT_UPLOAD_DIR, fname))
            certificate_url = fname

    body = request.form if request.content_type and "multipart" in request.content_type else (request.get_json() or {})

    from app.utils.sp_helper import call_sp
    result, err = call_sp("sp_apply_leave", (
        student_id,
        body.get("leave_type_id"),
        body.get("from_date"),
        body.get("to_date"),
        body.get("reason"),
        certificate_url,
        user_id,
    ))
    if err:
        return error(err, 400)
    leave_id = result.get("id")



    cur.execute("""
        SELECT lt.notify_mode FROM leave_types lt
        JOIN leave_requests lr ON lr.leave_type_id = lt.id
        WHERE lr.id = %s
    """, (leave_id,))
    cfg = cur.fetchone()
    notify_mode = cfg["notify_mode"] if cfg else "incharge_only"
    _notify_teachers(student_id, leave_id, notify_mode, db)

    return success(message="Leave request submitted.", data={"id": leave_id})


@bp.get("/")
@jwt_required_custom
def get_leaves():
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    _roles  = claims.get("roles", [])
    role    = _roles[0] if _roles else claims.get("role", "")
    db      = get_db()
    cur     = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    permissions = claims.get("permissions", [])
    student_id  = request.args.get("student_id")
    status      = request.args.get("status")
    from_date   = request.args.get("from_date")

    # HR: show only staff/teacher leaves
    if role == "hr":
        cur.execute("""
            SELECT lr.*, lt.name AS leave_type,
                   u.first_name || ' ' || u.last_name AS student_name,
                   'Staff' AS class_name,
                   u.email AS enrollment_no,
                   ab.first_name || ' ' || ab.last_name AS applied_by_name,
                   NULL::VARCHAR AS approver_name, NULL::VARCHAR AS approver_note,
                   NULL::VARCHAR AS recommender_name, NULL::VARCHAR AS recommender_note,
                   NULL::VARCHAR AS rejection_reason,
                   NULL::VARCHAR AS certificate_url,
                   NULL::TIMESTAMPTZ AS recommended_at, NULL::TIMESTAMPTZ AS approved_at
            FROM leave_requests lr
            JOIN leave_types lt ON lt.id = lr.leave_type_id
            JOIN students s ON s.id = lr.student_id
            JOIN users u ON u.id = s.user_id
            JOIN users ab ON ab.id = lr.applied_by
            WHERE 1=1
        """)
        rows = [dict(r) for r in cur.fetchall()]
        # HR sees teacher leave requests - for now return empty until teacher leave module built
        return success(data=[])
    to_date     = request.args.get("to_date")

    if "leave.view_all" not in permissions and "leave.view_class" not in permissions:
        if role == "student":
            cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
            row = cur.fetchone()
            student_id = row["id"] if row else None
        elif role == "parent":
            if not student_id:
                cur.execute("SELECT id FROM students WHERE parent_id=%s AND status='active' LIMIT 1", (user_id,))
                row = cur.fetchone()
                student_id = row["id"] if row else None

    # Teacher: only see leaves for their incharge class
    if "leave.view_class" in permissions and "leave.view_all" not in permissions:
        # Academic coordinator - see all leaves where they are the configured recommender or approver
        if role == "academic_coordinator":
            sp_cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            sp_cur.execute("SELECT * FROM sp_get_leave_requests(%s, %s, %s, %s, %s)",
                           (user_id, None, status, from_date, to_date))
            rows = [dict(r) for r in sp_cur.fetchall()]
        else:
            # Teacher: only incharge class students
            cur.execute("""
                SELECT s.id FROM students s
                JOIN class_teachers ct ON ct.class_id = s.class_id
                JOIN teachers t ON t.id = ct.teacher_id
                WHERE t.user_id = %s AND ct.is_primary = TRUE
            """, (user_id,))
            class_students = [r["id"] for r in cur.fetchall()]
            if not class_students:
                return success(data=[])
            rows = []
            sp_cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            for sid in class_students:
                sp_cur.execute("SELECT * FROM sp_get_leave_requests(%s, %s, %s, %s, %s)",
                            (user_id, sid, status, from_date, to_date))
                rows.extend([dict(r) for r in sp_cur.fetchall()])
        id_cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        for row in rows:
            id_cur.execute("SELECT leave_type_id FROM leave_requests WHERE id=%s", (row["id"],))
            lr_row = id_cur.fetchone()
            lt_id = lr_row["leave_type_id"] if lr_row else None
            rule = _get_matching_rule(lt_id, row["total_days"], db) if lt_id else None
            if rule:
                row["needs_recommendation"] = bool(rule.get("recommender_role"))
                row["approver_role"] = rule.get("approver_role", "")
                row["recommender_role"] = rule.get("recommender_role", "")
            else:
                row["needs_recommendation"] = False
                row["approver_role"] = ""
                row["recommender_role"] = ""
        return success(data=rows)

    sp_cur2 = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    sp_cur2.execute("SELECT * FROM sp_get_leave_requests(%s, %s, %s, %s, %s)", (user_id, student_id, status, from_date, to_date))
    rows = [dict(r) for r in sp_cur2.fetchall()]
    id_cur2 = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    for row in rows:
        id_cur2.execute("SELECT leave_type_id FROM leave_requests WHERE id=%s", (row["id"],))
        lr_row = id_cur2.fetchone()
        lt_id = lr_row["leave_type_id"] if lr_row else None
        rule = _get_matching_rule(lt_id, row["total_days"], db) if lt_id else None
        if rule:
            row["needs_recommendation"] = bool(rule.get("recommender_role"))
            row["approver_role"] = rule.get("approver_role", "")
        else:
            row["needs_recommendation"] = False
            row["approver_role"] = ""
    return success(data=rows)

@bp.get("/my-balance")
@jwt_required_custom
@require_permission("leave.view_own")
def get_balance():
    user_id    = int(get_jwt_identity())
    student_id = request.args.get("student_id")
    db         = get_db()
    cur        = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    claims     = get_jwt()
    _roles     = claims.get("roles", [])
    role       = _roles[0] if _roles else claims.get("role", "")

    if role == "student":
        cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        student_id = row["id"] if row else None
    elif role == "parent":
        if not student_id:
            cur.execute("SELECT id FROM students WHERE parent_id=%s AND status='active' LIMIT 1", (user_id,))
            row = cur.fetchone()
            student_id = row["id"] if row else None

    if not student_id:
        return error("Student not found", 404)

    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    yr = cur.fetchone()
    if not yr:
        return error("No active academic year", 400)

    cur.execute("SELECT * FROM sp_get_leave_balance(%s, %s)", (student_id, yr["id"]))
    return success(data=cur.fetchall())


@bp.post("/<int:leave_id>/recommend")
@jwt_required_custom
@require_permission("leave.recommend")
def recommend_leave(leave_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    db      = get_db()
    from app.utils.sp_helper import call_sp
    result, err = call_sp("sp_recommend_leave", (leave_id, user_id, body.get("note", "")))
    if err:
        return error(err, 400)
    try:
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT lr.student_id, lr.leave_type_id,
                   u.first_name || ' ' || u.last_name AS student_name
            FROM leave_requests lr
            JOIN students s ON s.id = lr.student_id
            JOIN users u ON u.id = s.user_id
            WHERE lr.id = %s
        """, (leave_id,))
        lr = cur.fetchone()
        if lr:
            cur.execute("""
                SELECT DISTINCT u.id FROM users u
                JOIN user_roles ur ON ur.user_id = u.id
                JOIN roles r ON r.id = ur.role_id
                JOIN leave_approval_rules lac ON lac.leave_type_id = %s
                WHERE r.name = lac.approver_role AND u.is_active = TRUE LIMIT 5
            """, (lr["leave_type_id"],))
            from app.utils.notify import send_notification
            for row in cur.fetchall():
                send_notification(row["id"],
                    title="Leave Recommended",
                    body="Leave request for " + lr["student_name"] + " is awaiting your approval.",
                    ntype="leave")
    except Exception as e:
        print("[recommend notify] " + str(e))
    return success(message="Leave recommended.")


@bp.post("/<int:leave_id>/action")
@jwt_required_custom
def action_leave(leave_id):
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    perms   = claims.get("permissions", [])
    _roles  = claims.get("roles", [])
    role    = _roles[0] if _roles else claims.get("role", "")
    body    = request.get_json() or {}
    action  = body.get("action", "")
    db      = get_db()

    if action not in ("approve", "reject"):
        return error("action must be approve or reject", 400)
    if action == "reject" and not body.get("note"):
        return error("Rejection reason is required", 400)

    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT lr.student_id, lr.leave_type_id, lr.total_days, lr.status
        FROM leave_requests lr WHERE lr.id = %s
    """, (leave_id,))
    lr = cur.fetchone()
    if not lr:
        return error("Leave request not found", 404)

    # Check permission: either has leave.approve OR their role matches the approver_role for this leave
    if "leave.approve" not in perms:
        rule = _get_matching_rule(lr["leave_type_id"], lr["total_days"], db)
        if not rule or rule.get("approver_role") != role:
            return error("You do not have permission to approve this leave", 403)

    from app.utils.sp_helper import call_sp
    result, err = call_sp("sp_action_leave", (leave_id, action, user_id, body.get("note", "")))
    print("[action_leave] result:", result, "err:", err)
    if err:
        return error(err, 400)

    status = "approved" if action == "approve" else "rejected"
    _notify_student_parent(lr["student_id"], status, db)

    # Auto-mark attendance as on_leave when approved
    if action == "approve":
        try:
            att_cur = db.cursor()
            att_cur.execute(
                "SELECT from_date, to_date FROM leave_requests WHERE id=%s",
                (leave_id,)
            )
            lr_dates = att_cur.fetchone()
            if lr_dates:
                att_cur.execute(
                    "SELECT sp_mark_leave_attendance(%s, %s, %s, %s)",
                    (lr["student_id"], lr_dates[0], lr_dates[1], user_id)
                )
                db.commit()
        except Exception as e:
            print("[leave attendance] " + str(e))

    return success(message="Leave " + status + ".")


@bp.get("/<int:leave_id>/certificate")
@jwt_required_custom
def download_certificate(leave_id):
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT certificate_url FROM leave_requests WHERE id=%s", (leave_id,))
    row = cur.fetchone()
    if not row or not row["certificate_url"]:
        return error("No certificate found", 404)
    cert_dir = r"J:\sms-project\sms-backend\uploads\leave_certificates"
    print("[cert] dir:", cert_dir, "file:", row["certificate_url"])
    from flask import send_from_directory
    return send_from_directory(cert_dir, row["certificate_url"])