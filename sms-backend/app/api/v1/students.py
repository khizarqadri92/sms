"""
Native FastAPI router for Students - migrated from app/api/v1/students.py.

Unlike Procurement/Library (which did raw SQL inline), this module delegates
to StudentService -> StudentRepository, and several routes call Flask's
get_db() directly too. All of that code calls Flask's get_db() (flask.g-based)
somewhere, so every route here wraps its body in `with flask_app.app_context():`
to satisfy that dependency - the existing business logic runs completely
unchanged, only the routing/auth/request-parsing layer is native FastAPI.

IMPORTANT: literal paths (e.g. /my-children, /meta/classes) MUST be declared
before parameterized paths (/{id}) - FastAPI/Starlette matches routes in
declaration order, so a /{id} route declared first would incorrectly try to
parse "my-children" as an integer id.
"""

from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission, require_any_permission
from app.fastapi_campus import get_current_campus_id
from app.fastapi_campus import enforce_same_campus
from app.fastapi_db import get_db as _campus_get_db, get_cur as _campus_get_cur


def _check_student_campus(db, student_id: int, caller_campus_id):
    cur = _campus_get_cur(db)
    cur.execute("SELECT campus_id FROM students WHERE id = %s", (student_id,))
    row = cur.fetchone()
    enforce_same_campus(row["campus_id"] if row else None, caller_campus_id)
from app.fastapi_db import get_db, get_cur

router = APIRouter()


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success", status_code=200):
    return {"status": "success", "message": message, "data": data}


def _flask_app():
    import main
    return main.flask_app


class StudentUpdateIn(BaseModel):
    first_name: Optional[Any] = None
    last_name: Optional[Any] = None
    date_of_birth: Optional[Any] = None
    gender: Optional[Any] = None
    blood_group: Optional[Any] = None
    address: Optional[Any] = None
    class_id: Optional[Any] = None
    parent_id: Optional[Any] = None
    status: Optional[Any] = None
    father_name: Optional[Any] = None
    mother_name: Optional[Any] = None
    father_cnic: Optional[Any] = None
    father_phone: Optional[Any] = None
    mother_phone: Optional[Any] = None

    def to_dict(self):
        return {k: v for k, v in self.dict().items() if v is not None}


class StudentEnrollIn(BaseModel):
    email: Optional[str] = None
    first_name: str
    last_name: str
    password: Optional[str] = None
    phone: Optional[Any] = None
    date_of_birth: Optional[Any] = None
    gender: Optional[Any] = None
    blood_group: Optional[Any] = None
    address: Optional[Any] = None
    class_id: Optional[Any] = None
    parent_id: Optional[Any] = None
    enrollment_no: Optional[Any] = None

    def to_dict(self):
        d = self.dict()
        if d.get("password") is None:
            d.pop("password")
        return d


class LinkParentIn(BaseModel):
    parent_id: Optional[Any] = None


# ── Literal-path routes (must come before /{id}) ──────────────

@router.get("/")
def list_students(
    class_id: Optional[str] = Query(None), status: Optional[str] = Query(None), search: Optional[str] = Query(None),
    page: int = Query(1), per_page: int = Query(20),
    user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details")),
    campus_id: Optional[int] = Depends(get_current_campus_id),
):
    filters = {k: v for k, v in {"class_id": class_id, "status": status, "search": search, "campus_id": campus_id}.items() if v}
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        result = StudentService().get_all(filters, page, per_page)
    return {
        "status": "success",
        "data": result["items"],
        "pagination": {"total": result["total"], "page": page, "per_page": per_page},
    }


@router.post("/")
def enroll_student(body: StudentEnrollIn, user_id: int = Depends(require_permission("students.student_enrolment")), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if campus_id is None:
        fail("No campus context - please select a campus before enrolling a student.", 400)
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            enroll_data = body.to_dict()
            enroll_data["campus_id"] = campus_id
            result = StudentService().enroll(enroll_data)
        except ValueError as e:
            fail(str(e), 400)

        try:
            from app.utils.notify import send_notification, render_templated_notification
            import main as _main
            _enroll_no = str(result.get("enrollment_no", ""))
            _sname = str(result.get("first_name", "")) + " " + str(result.get("last_name", ""))
            with _main.flask_app.app_context():
                if result.get("user_id"):
                    _t, _b = render_templated_notification("student_enrolled_student", {"enrollment_no": _enroll_no},
                        "Welcome to School!", "Your enrollment is confirmed. Enrollment No: " + _enroll_no + ".",
                        campus_id=campus_id)
                    send_notification(
                        result["user_id"], _t,
                        _b,
                        "success"
                    )
                if result.get("parent_id"):
                    _t, _b = render_templated_notification("student_enrolled_parent", {"student_name": _sname, "enrollment_no": _enroll_no},
                        "Child Enrolled", _sname + " has been enrolled. Enrollment No: " + _enroll_no + ".",
                        campus_id=campus_id)
                    send_notification(
                        result["parent_id"], _t,
                        _b,
                        "success"
                    )
        except Exception:
            pass

    return ok(data=result, message="Student enrolled successfully.")


@router.get("/me")
def my_profile(user_id: int = Depends(get_current_user_id)):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        student = StudentService().get_by_user_id(user_id)
    if not student:
        fail("Student profile not found.", 404)
    return ok(data=student)


@router.get("/my-children")
def my_children(user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        data = StudentService().get_by_parent(user_id)
    return ok(data=data)


@router.get("/meta/next-enrollment-no")
def next_enrollment_no(user_id: int = Depends(require_permission("students.student_enrolment"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT fn_preview_next_id('student') AS preview")
        preview = cur.fetchone()["preview"]
    return ok(data={"next_enrollment_no": preview})


@router.get("/meta/classes")
def get_classes(user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    with _flask_app().app_context():
        from app.db.connection import execute_query
        rows = execute_query("SELECT id, name, section FROM classes ORDER BY name")
        data = [dict(r) for r in rows]
    return ok(data=data)


@router.get("/meta/parents")
def get_parents(user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    with _flask_app().app_context():
        from app.db.connection import execute_query
        rows = execute_query("""
            SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email
            FROM users u
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id
            WHERE r.name = 'parent' AND u.is_active = TRUE
            ORDER BY u.first_name
        """)
        data = [dict(r) for r in rows]
    return ok(data=data)


@router.get("/parents/search")
def search_parents(q: Optional[str] = Query(""), user_id: int = Depends(require_permission("students.parent_account_link"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
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
        """, ["%" + q + "%"] * 5)
        data = [dict(r) for r in cur.fetchall()]
    return ok(data=data)


# ── Parameterized /{id} routes (must come after all literal paths above) ──

@router.get("/{id}")
def get_student(id: int, user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            data = StudentService().get_by_id(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(data=data)


@router.put("/{id}")
def update_student(id: int, body: StudentUpdateIn, user_id: int = Depends(require_permission("students.student_edit")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_student_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            result = StudentService().update(id, body.to_dict())
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Student updated successfully.")


@router.delete("/{id}")
def deactivate_student(id: int, user_id: int = Depends(require_permission("students.student_status_change")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_student_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            StudentService().deactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="Student deactivated.")


@router.post("/{id}/reactivate")
def reactivate_student(id: int, user_id: int = Depends(require_permission("students.student_status_change")), campus_id: Optional[int] = Depends(get_current_campus_id), _db=Depends(_campus_get_db)):
    _check_student_campus(_db, id, campus_id)
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            StudentService().reactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="Student reactivated.")


@router.get("/{id}/attendance")
def student_attendance(
    id: int, from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = Query(None),
    user_id: int = Depends(require_any_permission("attendance.attendance_correction_past_days", "attendance.attendance_delete", "attendance.attendance_marking", "attendance.attendance_reports", "attendance.attendance_settings", "attendance.attendance_view", "students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details")),
):
    if not from_ or not to:
        fail("from and to query params required", 400)
    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        data = AttendanceService().get_student_attendance(id, from_, to)
    return ok(data=data)


@router.get("/{id}/attendance/summary")
def attendance_summary(id: int, month: Optional[str] = Query(None), user_id: int = Depends(require_any_permission("attendance.attendance_correction_past_days", "attendance.attendance_delete", "attendance.attendance_marking", "attendance.attendance_reports", "attendance.attendance_settings", "attendance.attendance_view", "students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    from app.db.connection import get_db as _get_flask_db
    from app.utils.processing_date import get_processing_date
    month = month or get_processing_date(_get_flask_db()).strftime("%Y-%m-01")
    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        data = AttendanceService().get_monthly_summary(id, month)
    return ok(data=data)


@router.get("/{id}/grades")
def student_grades(id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Returns exam summary rows (from exam_results) plus per-subject detail
    (from exam_marks), tagged with exam_id so the frontend can expand a
    summary row into its subject rows without a second round-trip."""
    cur = get_cur(db)
    cur.execute("""
        SELECT er.exam_id, e.name AS exam_name, e.start_date,
               er.total_marks, er.marks_obtained, er.percentage,
               er.grade AS grade_letter, er.gpa, er.class_position, er.is_pass
        FROM exam_results er
        JOIN exams e ON e.id = er.exam_id
        WHERE er.student_id = %s AND e.status = 'published'
        ORDER BY e.start_date DESC
    """, (id,))
    exams = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT em.id, em.exam_id, s.name AS subject_name, em.marks_obtained AS marks,
               es.total_marks, em.is_absent,
               ROUND((em.marks_obtained / NULLIF(es.total_marks,0) * 100), 2) AS percentage,
               gs.grade AS grade_letter,
               CASE WHEN em.is_absent THEN 'absent'
                    WHEN em.marks_obtained >= es.passing_marks THEN 'pass'
                    ELSE 'fail' END AS result
        FROM exam_marks em
        JOIN exam_subjects es ON es.id = em.exam_subject_id
        JOIN exams e ON e.id = em.exam_id
        JOIN subjects s ON s.id = em.subject_id
        LEFT JOIN grading_scales gs ON gs.is_active = TRUE
            AND ROUND((em.marks_obtained / NULLIF(es.total_marks,0) * 100), 2) BETWEEN gs.min_pct AND gs.max_pct
        WHERE em.student_id = %s AND e.status = 'published'
        ORDER BY s.name
    """, (id,))
    subjects = [dict(r) for r in cur.fetchall()]

    return ok(data={"exams": exams, "subjects": subjects})


@router.get("/{id}/siblings")
def student_siblings(id: int, user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_student_siblings(%s::integer)", (id,))
        data = [dict(r) for r in cur.fetchall()]
    return ok(data=data)


@router.get("/{id}/fees")
def student_fees(id: int, user_id: int = Depends(require_any_permission("finance.account_unlock", "finance.discount_grant", "finance.discount_rules", "finance.discount_view", "finance.fee_payment_online", "finance.fee_reminders", "finance.fee_reports", "finance.fee_setup_edit", "finance.fee_setup_view", "finance.finance_dashboard", "finance.invoice_auto_generation_settings", "finance.invoice_cancellation", "finance.invoice_download", "finance.invoice_generation", "finance.invoice_view", "finance.locked_accounts_view", "finance.payment_collection", "finance.payment_verification", "finance.payment_view", "finance.refunds", "students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
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
        summary["total_billed"] = float(summary["total_billed"])
        summary["total_paid"] = float(summary["total_paid"])
        summary["total_due"] = float(summary["total_due"])
        summary["invoices"] = invoices
    return ok(data=summary)


@router.get("/{id}/fees/{invoice_id}/timeline")
def invoice_timeline(id: int, invoice_id: int, user_id: int = Depends(get_current_user_id)):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("SELECT user_id, parent_id FROM students WHERE id = %s", (id,))
        stu = cur.fetchone()
        if not stu:
            fail("Student not found.", 404)
        if user_id != stu["user_id"] and user_id != stu["parent_id"]:
            fail("You do not have permission to view this record.", 403)

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
            fail("Invoice not found.", 404)

        cur.execute("""
            SELECT id, amount_paid, method, reference, notes, paid_at, is_verified, verified_at
            FROM payments WHERE invoice_id = %s ORDER BY paid_at ASC
        """, (invoice_id,))
        payments = [dict(r) for r in cur.fetchall()]

        invoice = dict(invoice)
        invoice["payments"] = payments
    return ok(data=invoice)


@router.put("/{id}/link-parent")
def link_parent(id: int, body: LinkParentIn, user_id: int = Depends(require_permission("students.parent_account_link"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if body.parent_id:
            cur.execute("""
                SELECT u.id, u.first_name, u.last_name, u.email
                FROM users u
                JOIN user_roles ur ON ur.user_id = u.id
                JOIN roles r ON r.id = ur.role_id
                WHERE u.id = %s AND r.name = 'parent'
            """, (body.parent_id,))
            parent = cur.fetchone()
            if not parent:
                fail("User not found or does not have parent role.", 400)
            cur.execute("UPDATE students SET parent_id = %s WHERE id = %s", (body.parent_id, id))
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
        data = dict(cur.fetchone())
    return ok(data=data, message="Parent updated successfully.")



# =============================================================================
# Family & other details (same as the admission form) - used by Edit Info
# =============================================================================
from typing import List as _List


class StudentDetailsIn(BaseModel):
    b_form_no: Optional[str] = None
    religion: Optional[str] = None
    sect: Optional[str] = None
    nationality: Optional[str] = None
    previous_school: Optional[str] = None
    previous_class: Optional[str] = None
    father_name: Optional[str] = None
    father_cnic: Optional[str] = None
    father_occupation: Optional[str] = None
    father_phone: Optional[str] = None
    father_email: Optional[str] = None
    mother_name: Optional[str] = None
    mother_cnic: Optional[str] = None
    mother_occupation: Optional[str] = None
    mother_phone: Optional[str] = None
    mother_email: Optional[str] = None
    primary_guardian: Optional[str] = "father"
    guardian_name: Optional[str] = None
    guardian_cnic: Optional[str] = None
    guardian_occupation: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_relationship_other: Optional[str] = None
    living_with: Optional[str] = None
    has_disability: bool = False
    disability_types: _List[str] = []
    disability_details: Optional[str] = None
    transport_mode: Optional[str] = "self"
    pickup_address: Optional[str] = None


@router.get("/{id}/details")
def get_student_details(id: int, user_id: int = Depends(require_any_permission("students.family_contact_details", "students.family_details_edit", "students.family_details_view", "students.my_children", "students.my_studies", "students.parent_account_link", "students.special_needs_edit", "students.special_needs_view", "students.student_attendance_tab", "students.student_edit", "students.student_enrolment", "students.student_export", "students.student_fees_tab", "students.student_grades_tab", "students.student_import", "students.student_list_view", "students.student_status_change", "students.transport_details")), db=Depends(get_db),
                        campus_id: Optional[int] = Depends(get_current_campus_id)):
    from app.api.v1.admissions import STUDENT_DETAIL_FIELDS
    _check_student_campus(db, id, campus_id)
    cur = get_cur(db)
    cur.execute(f"SELECT {', '.join(STUDENT_DETAIL_FIELDS)} FROM students WHERE id=%s", (id,))
    r = cur.fetchone()
    if not r: fail("Student not found.", 404)
    d = dict(r)
    d["disability_types"] = list(d.get("disability_types") or [])
    return ok(data=d)


@router.put("/{id}/details")
def save_student_details(id: int, body: StudentDetailsIn, user_id: int = Depends(require_any_permission("students.family_details_edit", "students.special_needs_edit", "students.transport_details")), db=Depends(get_db),
                         campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Same rules as the admission form (CNIC 13 digits, mobile numbers, guardian, disability, transport)."""
    import re as _re
    from app.api.v1.admissions import (STUDENT_DETAIL_FIELDS, RELATIONSHIPS, DISABILITY_TYPES, normalize_phone, _cnic_ok,
                                       _cnic_digits, _email_ok)
    _check_student_campus(db, id, campus_id)
    v = {k: (x.strip() if isinstance(x, str) else x) for k, x in body.dict().items()}
    for k in list(v):
        if v[k] == "": v[k] = None
    for k in ("b_form_no", "father_cnic", "mother_cnic", "guardian_cnic"):
        if v.get(k):
            if not _cnic_ok(v[k]): fail(("The B-Form number" if k == "b_form_no" else "The " + k.split("_")[0] + "'s CNIC") + " should have 13 digits.", 400)
            v[k] = _cnic_digits(v[k])
    for who in ("father", "mother", "guardian"):
        if v.get(f"{who}_phone"):
            p_ = normalize_phone(v[f"{who}_phone"])
            if not p_: fail(f"The {who}'s phone should be a mobile number like 0300 1234567.", 400)
            v[f"{who}_phone"] = p_
        if v.get(f"{who}_email") and not _email_ok(v[f"{who}_email"]): fail(f"The {who}'s email address isn't valid.", 400)
    pg = v.get("primary_guardian") or "father"
    if pg not in ("father", "mother", "other"): fail("Choose the primary guardian.", 400)
    v["primary_guardian"] = pg
    if pg == "other":
        if not v.get("guardian_name") or not v.get("guardian_phone"): fail("Enter the guardian's name and mobile number.", 400)
        if v.get("guardian_relationship") not in RELATIONSHIPS: fail("Choose the guardian's relationship with the student.", 400)
        if v["guardian_relationship"] == "other" and not v.get("guardian_relationship_other"): fail("Describe the guardian's relationship.", 400)
    else:
        for k in ("guardian_name", "guardian_cnic", "guardian_occupation", "guardian_phone", "guardian_email", "guardian_relationship",
                  "guardian_relationship_other"):
            v[k] = None
    if v.get("living_with") not in (None, "father", "mother", "both", "guardian"): fail("Choose who the student lives with.", 400)
    if v.get("living_with") == "guardian" and pg != "other": fail("'Lives with the guardian' is for when the primary guardian is Other.", 400)
    types = [t for t in (v.get("disability_types") or []) if t]
    if v.get("has_disability"):
        if any(t not in DISABILITY_TYPES for t in types): fail("Choose the type of disability from the list.", 400)
        v["disability_types"] = sorted(set(types))
    else:
        v["has_disability"], v["disability_types"], v["disability_details"] = False, [], None
    if v.get("transport_mode") not in (None, "self", "school_van"): fail("Choose school van or self pick and drop.", 400)
    if v.get("transport_mode") == "school_van" and not v.get("pickup_address"): fail("Enter the pick-up address for the school van.", 400)
    if v.get("transport_mode") != "school_van": v["pickup_address"] = None
    cur = get_cur(db)
    cur.execute(f"UPDATE students SET {', '.join(k + '=%s' for k in STUDENT_DETAIL_FIELDS)} WHERE id=%s",
                [v.get(k) if k != "disability_types" else (v.get(k) or []) for k in STUDENT_DETAIL_FIELDS] + [id])
    db.commit()
    return ok(message="Family and other details saved.")
