from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.services.student_service import StudentService
from app.utils.response import success, error, paginated
from app.utils.pagination import get_page_args

bp   = Blueprint("students", __name__)
_svc = StudentService()


@bp.get("/")
@jwt_required_custom
@require_permission("students.view")
def list_students():
    page, per_page = get_page_args()
    filters = {k: request.args.get(k) for k in
               ["class_id", "status", "search"] if request.args.get(k)}
    result = _svc.get_all(filters, page, per_page)
    return paginated(result["items"], result["total"], page, per_page)


@bp.get("/me")
@jwt_required_custom
def my_profile():
    user_id = int(get_jwt_identity())
    student = _svc.get_by_user_id(user_id)
    if not student:
        return error("Student profile not found.", 404)
    return success(data=student)


@bp.get("/<int:id>")
@jwt_required_custom
@require_permission("students.view")
def get_student(id):
    try:
        return success(data=_svc.get_by_id(id))
    except ValueError as e:
        return error(str(e), 404)


@bp.put("/<int:id>")
@jwt_required_custom
@require_permission("students.edit")
def update_student(id):
    try:
        result = _svc.update(id, request.get_json() or {})
        return success(data=result, message="Student updated successfully.")
    except ValueError as e:
        return error(str(e), 400)


@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("students.delete")
def deactivate_student(id):
    try:
        _svc.deactivate(id)
        return success(message="Student deactivated.")
    except ValueError as e:
        return error(str(e), 404)


@bp.post("/")
@jwt_required_custom
@require_permission("students.create")
def enroll_student():
    try:
        result = _svc.enroll(request.get_json() or {})
        # Notify student and parent
        try:
            from app.utils.notify import send_notification
            if result.get("user_id"):
                send_notification(result["user_id"],
                    "Welcome to School!",
                    f"Your enrollment is confirmed. Enrollment No: {result.get('enrollment_no','')}.",
                    "success")
            if result.get("parent_id"):
                send_notification(result["parent_id"],
                    "Child Enrolled",
                    f"{result.get('first_name','')} {result.get('last_name','')} has been enrolled. Enrollment No: {result.get('enrollment_no','')}.",
                    "success")
        except Exception:
            pass
        return success(data=result, message="Student enrolled successfully.", status=201)
    except ValueError as e:
        return error(str(e), 400)


@bp.get("/<int:id>/attendance")
@jwt_required_custom
@require_permission("attendance.view")
def student_attendance(id):
    from_date = request.args.get("from")
    to_date   = request.args.get("to")
    if not from_date or not to_date:
        return error("from and to query params required", 400)
    from app.services.attendance_service import AttendanceService
    return success(data=AttendanceService().get_student_attendance(id, from_date, to_date))


@bp.get("/<int:id>/attendance/summary")
@jwt_required_custom
@require_permission("attendance.view")
def attendance_summary(id):
    from datetime import date
    month = request.args.get("month", date.today().strftime("%Y-%m-01"))
    from app.services.attendance_service import AttendanceService
    return success(data=AttendanceService().get_monthly_summary(id, month))


@bp.get("/<int:id>/grades")
@jwt_required_custom
@require_permission("grades.view")
def student_grades(id):
    from app.repositories.grade_repository import GradeRepository
    return success(data=GradeRepository().find_by_student(id))


@bp.get("/<int:id>/siblings")
@jwt_required_custom
@require_permission("students.view")
def student_siblings(id):
    import psycopg2.extras
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM sp_get_student_siblings(%s::integer)", (id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/my-children")
@jwt_required_custom
@require_permission("students.view")
def my_children():
    parent_id = int(get_jwt_identity())
    return success(data=_svc.get_by_parent(parent_id))


@bp.get("/meta/classes")
@jwt_required_custom
@require_permission("students.view")
def get_classes():
    from app.db.connection import execute_query
    rows = execute_query("SELECT id, name, section FROM classes ORDER BY name")
    return success(data=[dict(r) for r in rows])


@bp.get("/meta/parents")
@jwt_required_custom
@require_permission("students.view")
def get_parents():
    from app.db.connection import execute_query
    rows = execute_query("""
        SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE r.name = 'parent' AND u.is_active = TRUE
        ORDER BY u.first_name
    """)
    return success(data=[dict(r) for r in rows])

@bp.get('/<int:id>/fees')
@jwt_required_custom
@require_permission('finance.view')
def student_fees(id):
    import psycopg2.extras
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    sql1 = ('SELECT fi.id, fi.amount, fi.net_amount, fi.discount, fi.fine, fi.status, fi.due_date, fi.issued_at, fi.notes, fi.month_year, COALESCE(fs.name, \'Monthly Fee\') AS structure_name, c.name AS class_name, c.section AS class_section, COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = fi.id), 0) AS paid_amount, (SELECT p2.id FROM payments p2 WHERE p2.invoice_id = fi.id AND p2.is_verified = TRUE ORDER BY p2.paid_at DESC LIMIT 1) AS verified_payment_id FROM fee_invoices fi LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id LEFT JOIN classes c ON c.id = fi.for_class_id WHERE fi.student_id = %s AND fi.status != \'cancelled\' ORDER BY fi.issued_at DESC')
    cur.execute(sql1, (id,))
    invoices = [dict(r) for r in cur.fetchall()]

    if invoices:
        invoice_ids = [inv["id"] for inv in invoices]
        cur.execute(
            "SELECT invoice_id, label, amount FROM fee_invoice_items "
            "WHERE invoice_id = ANY(%s::integer[]) AND item_type = 'discount'",
            (invoice_ids,)
        )
        discount_items_by_invoice = {}
        for row in cur.fetchall():
            discount_items_by_invoice.setdefault(row["invoice_id"], []).append(
                {"label": row["label"], "amount": float(row["amount"])}
            )
        for inv in invoices:
            inv["discount_items"] = discount_items_by_invoice.get(inv["id"], [])
    sql2 = (
        "SELECT COUNT(*) AS total_invoices,"
        " COALESCE(SUM(net_amount), 0) AS total_billed,"
        " COALESCE(SUM(CASE WHEN status = 'paid' THEN net_amount ELSE 0 END), 0) AS total_paid,"
        " COALESCE(SUM(CASE WHEN status IN ('unpaid','partial','overdue') THEN net_amount ELSE 0 END), 0) AS total_due,"
        " COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue_count,"
        " %s AS student_id FROM fee_invoices WHERE student_id = %s AND status != 'cancelled'"
    )
    cur.execute(sql2, (id, id))
    summary = dict(cur.fetchone())
    summary['total_billed'] = float(summary['total_billed'])
    summary['total_paid']   = float(summary['total_paid'])
    summary['total_due']    = float(summary['total_due'])
    summary['invoices']     = invoices
    return success(data=summary)


@bp.get('/<int:id>/fees/<int:invoice_id>/timeline')
@jwt_required_custom
def invoice_timeline(id, invoice_id):
    user_id = int(get_jwt_identity())
    import psycopg2.extras
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT user_id, parent_id FROM students WHERE id = %s", (id,))
    stu = cur.fetchone()
    if not stu:
        return error("Student not found.", 404)
    if user_id != stu["user_id"] and user_id != stu["parent_id"]:
        return error("You do not have permission to view this record.", 403)

    cur.execute("""
        SELECT fi.id, fi.invoice_no, fi.amount, fi.discount, fi.fine, fi.net_amount,
               fi.status, fi.due_date, fi.issued_at,
               c.name AS class_name, c.section AS class_section,
               COALESCE(fs.name, 'Monthly Fee') AS structure_name
        FROM fee_invoices fi
        LEFT JOIN classes c ON c.id = fi.for_class_id
        LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id
        WHERE fi.id = %s AND fi.student_id = %s
    """, (invoice_id, id))
    invoice = cur.fetchone()
    if not invoice:
        return error("Invoice not found.", 404)

    cur.execute("""
        SELECT id, amount_paid, method, reference, notes, paid_at, is_verified, verified_at
        FROM payments WHERE invoice_id = %s ORDER BY paid_at ASC
    """, (invoice_id,))
    payments = [dict(r) for r in cur.fetchall()]

    invoice = dict(invoice)
    invoice["payments"] = payments
    return success(data=invoice)


@bp.put("/<int:id>/link-parent")
@jwt_required_custom
@require_permission("students.edit")
def link_parent(id):
    import psycopg2.extras
    from app.db.connection import get_db
    body      = request.get_json() or {}
    parent_id = body.get("parent_id")
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if parent_id:
        cur.execute("""
            SELECT u.id, u.first_name, u.last_name, u.email
            FROM users u
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id
            WHERE u.id = %s AND r.name = 'parent'
        """, (parent_id,))
        parent = cur.fetchone()
        if not parent:
            return error("User not found or does not have parent role.", 400)
        cur.execute("UPDATE students SET parent_id = %s WHERE id = %s", (parent_id, id))
    else:
        cur.execute("UPDATE students SET parent_id = NULL WHERE id = %s", (id,))
    db.commit()
    cur.execute("""
        SELECT s.*, u.email,
               pu.first_name || ' ' || pu.last_name AS parent_name,
               pu.email AS parent_email, pu.phone AS parent_phone
        FROM students s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN users pu ON pu.id = s.parent_id
        WHERE s.id = %s
    """, (id,))
    return success(data=dict(cur.fetchone()), message="Parent updated successfully.")


@bp.get("/parents/search")
@jwt_required_custom
@require_permission("students.edit")
def search_parents():
    import psycopg2.extras
    from app.db.connection import get_db
    q   = request.args.get("q", "")
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
               COUNT(s.id) AS children_count
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        LEFT JOIN students s ON s.parent_id = u.id
        WHERE r.name = 'parent'
          AND (u.first_name ILIKE %s OR u.last_name ILIKE %s
               OR u.email ILIKE %s OR u.phone ILIKE %s
               OR (u.first_name || ' ' || u.last_name) ILIKE %s)
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.phone
        ORDER BY u.first_name
        LIMIT 20
    """, [f"%{q}%"] * 5)
    return success(data=[dict(r) for r in cur.fetchall()])