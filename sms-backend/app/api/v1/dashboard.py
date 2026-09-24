"""
Native FastAPI router for Dashboard - migrated from app/api/v1/dashboard.py.
Single endpoint, pure SQL, no SPs, no chr() stubs.
"""

from fastapi import APIRouter, Depends
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


@router.get("/stats")
def get_stats(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)

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
        WHERE DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', %s::date)
    """, (get_processing_date(db),))
    collected_month = cur.fetchone()["total"]

    # ── School-wide attendance today ──────────────────────────
    cur.execute("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'present') AS present
        FROM attendance WHERE date = %s
    """, (get_processing_date(db),))
    att = cur.fetchone()
    school_att_total   = att["total"]   or 0
    school_att_present = att["present"] or 0
    school_att_pct = round((school_att_present / school_att_total * 100), 1) if school_att_total > 0 else 0

    # ── Teacher-specific stats ────────────────────────────────
    teacher_classes = teacher_students = teacher_subjects = 0
    teacher_att_pct = teacher_att_present = teacher_att_total = 0

    cur.execute("SELECT id FROM teachers WHERE user_id = %s", (user_id,))
    teacher_row = cur.fetchone()

    if teacher_row:
        tid = teacher_row["id"]
        cur.execute("SELECT COUNT(*) AS cnt FROM class_teachers WHERE teacher_id = %s", (tid,))
        teacher_classes = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) AS cnt FROM teacher_subjects WHERE teacher_id = %s", (tid,))
        teacher_subjects = cur.fetchone()["cnt"]
        cur.execute("""
            SELECT COUNT(DISTINCT s.id) AS cnt FROM students s
            JOIN class_teachers ct ON ct.class_id = s.class_id
            WHERE ct.teacher_id = %s AND s.status = 'active'
        """, (tid,))
        teacher_students = cur.fetchone()["cnt"]
        cur.execute("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE a.status = 'present') AS present
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN class_teachers ct ON ct.class_id = s.class_id
            WHERE ct.teacher_id = %s AND a.date = %s
        """, (tid, get_processing_date(db)))
        t_att = cur.fetchone()
        teacher_att_total   = t_att["total"]   or 0
        teacher_att_present = t_att["present"] or 0
        teacher_att_pct = round((teacher_att_present / teacher_att_total * 100), 1) if teacher_att_total > 0 else 0

    # ── Parent-specific stats ─────────────────────────────────
    cur.execute("SELECT COUNT(*) AS cnt FROM students WHERE parent_id = %s AND status = 'active'", (user_id,))
    parent_children = cur.fetchone()["cnt"]

    # ── Student-specific stats ────────────────────────────────
    student_class = enrollment_no = student_status = academic_year = ""
    cur.execute("""
        SELECT s.enrollment_no, s.status, c.name AS class_name, c.section,
               (SELECT ay.name FROM academic_years ay WHERE ay.is_active = TRUE
                AND (ay.campus_id = s.campus_id OR ay.campus_id IS NULL)
                ORDER BY ay.campus_id NULLS LAST LIMIT 1) AS academic_year
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.user_id = %s
    """, (user_id,))
    stu_row = cur.fetchone()
    if stu_row:
        student_class  = stu_row["class_name"] + ((" (" + stu_row["section"] + ")") if stu_row["section"] else "")
        enrollment_no  = stu_row["enrollment_no"] or ""
        student_status = stu_row["status"] or "active"
        academic_year  = stu_row["academic_year"] or "2025-2026"

    # ── Library ───────────────────────────────────────────────
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

    return ok(data={
        "total_students":       total_students,
        "total_teachers":       total_teachers,
        "total_classes":        total_classes,
        "total_users":          total_users,
        "total_subjects":       total_subjects,
        "overdue_fees":         overdue_fees,
        "collected_month":      float(collected_month),
        "lib_total_books":      lib_total_books,
        "lib_issued_today":     lib_issued_today,
        "lib_overdue_count":    lib_overdue_count,
        "lib_available_copies": lib_available_copies,
        "attendance_pct":       school_att_pct,
        "attendance_present":   school_att_present,
        "attendance_total":     school_att_total,
        "teacher_classes":      teacher_classes,
        "teacher_students":     teacher_students,
        "teacher_subjects":     teacher_subjects,
        "teacher_att_pct":      teacher_att_pct,
        "teacher_att_present":  teacher_att_present,
        "teacher_att_total":    teacher_att_total,
        "parent_children":      parent_children,
        "student_class":        student_class,
        "enrollment_no":        enrollment_no,
        "student_status":       student_status,
        "academic_year":        academic_year,
    })
