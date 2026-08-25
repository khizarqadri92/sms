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
from app.fastapi_permissions import require_permission
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
    user_id: int = Depends(require_permission("students.view")),
):
    filters = {k: v for k, v in {"class_id": class_id, "status": status, "search": search}.items() if v}
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        result = StudentService().get_all(filters, page, per_page)
    return {
        "status": "success",
        "data": result["items"],
        "pagination": {"total": result["total"], "page": page, "per_page": per_page},
    }


@router.post("/")
def enroll_student(body: StudentEnrollIn, user_id: int = Depends(require_permission("students.create"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            result = StudentService().enroll(body.to_dict())
        except ValueError as e:
            fail(str(e), 400)

        try:
            from app.utils.notify import send_notification
            if result.get("user_id"):
                send_notification(
                    result["user_id"], "Welcome to School!",
                    "Your enrollment is confirmed. Enrollment No: " + str(result.get("enrollment_no", "")) + ".",
                    "success"
                )
            if result.get("parent_id"):
                send_notification(
                    result["parent_id"], "Child Enrolled",
                    str(result.get("first_name", "")) + " " + str(result.get("last_name", "")) + " has been enrolled. Enrollment No: " + str(result.get("enrollment_no", "")) + ".",
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
def my_children(user_id: int = Depends(require_permission("students.view"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        data = StudentService().get_by_parent(user_id)
    return ok(data=data)


@router.get("/meta/next-enrollment-no")
def next_enrollment_no(user_id: int = Depends(require_permission("students.create"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT fn_preview_next_id('student') AS preview")
        preview = cur.fetchone()["preview"]
    return ok(data={"next_enrollment_no": preview})


@router.get("/meta/classes")
def get_classes(user_id: int = Depends(require_permission("students.view"))):
    with _flask_app().app_context():
        from app.db.connection import execute_query
        rows = execute_query("SELECT id, name, section FROM classes ORDER BY name")
        data = [dict(r) for r in rows]
    return ok(data=data)


@router.get("/meta/parents")
def get_parents(user_id: int = Depends(require_permission("students.view"))):
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
def search_parents(q: Optional[str] = Query(""), user_id: int = Depends(require_permission("students.edit"))):
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
def get_student(id: int, user_id: int = Depends(require_permission("students.view"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            data = StudentService().get_by_id(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(data=data)


@router.put("/{id}")
def update_student(id: int, body: StudentUpdateIn, user_id: int = Depends(require_permission("students.edit"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            result = StudentService().update(id, body.to_dict())
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Student updated successfully.")


@router.delete("/{id}")
def deactivate_student(id: int, user_id: int = Depends(require_permission("students.delete"))):
    with _flask_app().app_context():
        from app.services.student_service import StudentService
        try:
            StudentService().deactivate(id)
        except ValueError as e:
            fail(str(e), 404)
    return ok(message="Student deactivated.")


@router.post("/{id}/reactivate")
def reactivate_student(id: int, user_id: int = Depends(require_permission("students.delete"))):
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
    user_id: int = Depends(require_permission("attendance.view")),
):
    if not from_ or not to:
        fail("from and to query params required", 400)
    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        data = AttendanceService().get_student_attendance(id, from_, to)
    return ok(data=data)


@router.get("/{id}/attendance/summary")
def attendance_summary(id: int, month: Optional[str] = Query(None), user_id: int = Depends(require_permission("attendance.view"))):
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
def student_siblings(id: int, user_id: int = Depends(require_permission("students.view"))):
    with _flask_app().app_context():
        import psycopg2.extras
        from app.db.connection import get_db
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_student_siblings(%s::integer)", (id,))
        data = [dict(r) for r in cur.fetchall()]
    return ok(data=data)


@router.get("/{id}/fees")
def student_fees(id: int, user_id: int = Depends(require_permission("finance.view"))):
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
def link_parent(id: int, body: LinkParentIn, user_id: int = Depends(require_permission("students.edit"))):
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
