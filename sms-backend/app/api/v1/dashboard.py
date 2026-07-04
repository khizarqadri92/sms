from flask import Blueprint
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.utils.response import success
import psycopg2.extras

bp = Blueprint("dashboard", __name__)


@bp.get("/stats")
@jwt_required_custom
def get_stats():
    user_id = int(get_jwt_identity())

    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ── School-wide counts ────────────────────────────────────
    cur.execute("SELECT COUNT(*) AS cnt FROM students WHERE status = 'active'")
    total_students = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) AS cnt FROM teachers WHERE status = 'active'")
    total_teachers = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) AS cnt FROM classes")
    total_classes = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) AS cnt FROM users WHERE is_active = TRUE")
    total_users = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) AS cnt FROM subjects WHERE is_active = TRUE")
    total_subjects = cur.fetchone()["cnt"]

    # ── Finance ───────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) AS cnt FROM fee_invoices WHERE status = 'overdue'")
    overdue_fees = cur.fetchone()["cnt"]

    cur.execute("""
        SELECT COALESCE(SUM(amount_paid), 0) AS total
        FROM payments
        WHERE DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE)
    """)
    collected_month = cur.fetchone()["total"]

    # ── School-wide attendance today ──────────────────────────
    cur.execute("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'present') AS present
        FROM attendance
        WHERE date = CURRENT_DATE
    """)
    att            = cur.fetchone()
    school_att_total   = att["total"]   or 0
    school_att_present = att["present"] or 0
    school_att_pct = round((school_att_present / school_att_total * 100), 1) if school_att_total > 0 else 0

    # ── Teacher-specific stats ────────────────────────────────
    teacher_classes   = 0
    teacher_students  = 0
    teacher_subjects  = 0
    teacher_att_pct   = 0
    teacher_att_present = 0
    teacher_att_total   = 0

    cur.execute("SELECT id FROM teachers WHERE user_id = %s", (user_id,))
    teacher_row = cur.fetchone()

    if teacher_row:
        tid = teacher_row["id"]

        cur.execute("SELECT COUNT(*) AS cnt FROM class_teachers WHERE teacher_id = %s", (tid,))
        teacher_classes = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) AS cnt FROM teacher_subjects WHERE teacher_id = %s", (tid,))
        teacher_subjects = cur.fetchone()["cnt"]

        # Students in teacher's classes
        cur.execute("""
            SELECT COUNT(DISTINCT s.id) AS cnt
            FROM students s
            JOIN class_teachers ct ON ct.class_id = s.class_id
            WHERE ct.teacher_id = %s AND s.status = 'active'
        """, (tid,))
        teacher_students = cur.fetchone()["cnt"]

        # Attendance today only for students in teacher's classes
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE a.status = 'present') AS present
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN class_teachers ct ON ct.class_id = s.class_id
            WHERE ct.teacher_id = %s
              AND a.date = CURRENT_DATE
        """, (tid,))
        t_att = cur.fetchone()
        teacher_att_total   = t_att["total"]   or 0
        teacher_att_present = t_att["present"] or 0
        teacher_att_pct = round((teacher_att_present / teacher_att_total * 100), 1) if teacher_att_total > 0 else 0
    # Parent-specific stats
    parent_children = 0
    cur.execute("SELECT COUNT(*) AS cnt FROM students WHERE parent_id = %s AND status = 'active'", (user_id,))
    parent_children = cur.fetchone()["cnt"]

    # Student-specific stats
    student_class = ""
    enrollment_no = ""
    student_status = ""
    academic_year = ""
    cur.execute("""
        SELECT s.enrollment_no, s.status, c.name AS class_name, c.section,
               ay.name AS academic_year
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        LEFT JOIN academic_years ay ON ay.is_active = TRUE
        WHERE s.user_id = %s
    """, (user_id,))
    stu_row = cur.fetchone()
    if stu_row:
        student_class  = stu_row["class_name"] + ((" (" + stu_row["section"] + ")") if stu_row["section"] else "")
        enrollment_no  = stu_row["enrollment_no"] or ""
        student_status = stu_row["status"] or "active"
        academic_year  = stu_row["academic_year"] or "2025-2026"

    # Parent-specific stats
    # ── Library ───────────────────────────────────────────────────────────────
    lib_total_books = lib_issued_today = lib_overdue_count = lib_available_copies = 0
    try:
        cur.execute("SELECT * FROM vw_library_dashboard")
        lib_row = cur.fetchone()
        if lib_row:
            lib_total_books      = lib_row["total_books"]
            lib_issued_today     = lib_row["issued_today"]
            lib_overdue_count    = lib_row["overdue_count"]
            lib_available_copies = lib_row["available_copies"]
    except Exception:
        pass

    return success(data={
        # School-wide
        "total_students":      total_students,
        "total_teachers":      total_teachers,
        "total_classes":       total_classes,
        "total_users":         total_users,
        "total_subjects":      total_subjects,
        # Finance
        "overdue_fees":        overdue_fees,
        "collected_month":     float(collected_month),
        # Library
        "lib_total_books":      lib_total_books,
        "lib_issued_today":     lib_issued_today,
        "lib_overdue_count":    lib_overdue_count,
        "lib_available_copies": lib_available_copies,
        # School-wide attendance
        "attendance_pct":      school_att_pct,
        "attendance_present":  school_att_present,
        "attendance_total":    school_att_total,
        # Teacher-specific
        "teacher_classes":     teacher_classes,
        "teacher_students":    teacher_students,
        "teacher_subjects":    teacher_subjects,
        "teacher_att_pct":     teacher_att_pct,
        "teacher_att_present": teacher_att_present,
        "teacher_att_total":   teacher_att_total,
        # Parent-specific
        "parent_children":     parent_children,
        # Parent-specific
        "parent_children":     parent_children,
        # Student-specific
        "student_class":       student_class,
        "enrollment_no":       enrollment_no,
        "student_status":      student_status,
        "academic_year":       academic_year,
    })