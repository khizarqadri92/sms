from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.services.attendance_service import AttendanceService
from app.utils.response import success, error

bp   = Blueprint("attendance", __name__)
_svc = AttendanceService()


@bp.post("/mark")
@jwt_required_custom
@require_permission("attendance.create")
def mark_attendance():
    marked_by = int(get_jwt_identity())
    body = request.get_json() or {}
    class_id = body.get("class_id")

    from app.db.connection import get_db
    import psycopg2.extras
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Check if date is a holiday
    att_date = body.get("date") or __import__("datetime").date.today().isoformat()
    cur.execute(
        "SELECT id, title FROM calendar_events WHERE is_holiday=TRUE AND %s::date BETWEEN event_date AND COALESCE(end_date, event_date)",
        (att_date,)
    )
    holiday = cur.fetchone()
    if holiday:
        return error(f"Cannot mark attendance on holiday: {holiday['title']}.", 400)

    # Check attendance marker config
    cur.execute("SELECT value FROM system_settings WHERE category='attendance_config' AND key='attendance_marker'")
    cfg = cur.fetchone()
    marker_config = cfg["value"] if cfg else "incharge_only"

    if marker_config == "incharge_only" and class_id:
        # Check if user is incharge of this class
        cur.execute("""
            SELECT 1 FROM class_teachers ct
            JOIN teachers t ON t.id = ct.teacher_id
            WHERE t.user_id = %s AND ct.class_id = %s AND ct.is_primary = TRUE
        """, (marked_by, class_id))
        if not cur.fetchone():
            # Check if admin/principal
            cur.execute("""
                SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id
                WHERE ur.user_id=%s AND r.name IN ('superadmin','admin','principal','academic_coordinator')
            """, (marked_by,))
            if not cur.fetchone():
                return error("Only class incharge can mark attendance as per school configuration.", 403)

    try:
        result = _svc.mark(body, marked_by)
        return success(data=result, message="Attendance recorded.")
    except ValueError as e:
        return error(str(e), 400)


@bp.get("/class/<int:class_id>")
@jwt_required_custom
@require_permission("attendance.view")
def class_attendance(class_id):
    date       = request.args.get("date")
    subject_id = request.args.get("subject_id")
    if not date:
        return error("date query param required (YYYY-MM-DD)", 400)
    return success(data=_svc.get_class_attendance(class_id, date, subject_id))


@bp.get("/student/<int:student_id>")
@jwt_required_custom
@require_permission("attendance.view")
def student_attendance(student_id):
    from_date  = request.args.get("from")
    to_date    = request.args.get("to")
    subject_id = request.args.get("subject_id")
    subject_id_int = int(subject_id) if subject_id else None
    if not from_date or not to_date:
        return error("from and to query params required (YYYY-MM-DD)", 400)
    return success(data=_svc.get_student_attendance(student_id, from_date, to_date, subject_id_int))


@bp.get("/student/<int:student_id>/summary")
@jwt_required_custom
@require_permission("attendance.view")
def attendance_summary(student_id):
    from datetime import date
    month = request.args.get("month", date.today().strftime("%Y-%m-01"))
    return success(data=_svc.get_monthly_summary(student_id, month))

# ── My attendance (student) ───────────────────────────────────────
@bp.get("/my")
@jwt_required_custom
@require_permission("attendance.view")
def my_attendance():
    user_id = int(get_jwt_identity())
    from_date = request.args.get("from")
    to_date   = request.args.get("to")
    from app.db.connection import get_db
    import psycopg2.extras
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
    s = cur.fetchone()
    if not s: return error("Student not found.", 404)
    if not from_date or not to_date:
        from datetime import date
        from_date = date.today().strftime("%Y-%m-01")
        to_date   = date.today().isoformat()
    subject_id = request.args.get("subject_id")
    subject_id_int = int(subject_id) if subject_id else None
    cur.execute("""
        SELECT a.date, a.status, a.remarks, a.subject_id,
               subj.name AS subject_name
        FROM attendance a
        LEFT JOIN subjects subj ON subj.id = a.subject_id
        WHERE a.student_id=%s AND a.date BETWEEN %s AND %s
          AND (%s::integer IS NULL OR a.subject_id=%s::integer)
        ORDER BY a.date DESC
    """, (s["id"], from_date, to_date, subject_id_int, subject_id_int))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows: r["date"] = str(r["date"])
    # Summary (filtered by subject if provided)
    cur.execute("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status='present')  AS present,
               COUNT(*) FILTER (WHERE status='absent')   AS absent,
               COUNT(*) FILTER (WHERE status='late')     AS late,
               COUNT(*) FILTER (WHERE status='excused')  AS excused,
               COUNT(*) FILTER (WHERE status='on_leave') AS on_leave
        FROM attendance
        WHERE student_id=%s AND date BETWEEN %s AND %s
          AND (%s::integer IS NULL OR subject_id=%s::integer)
    """, (s["id"], from_date, to_date, subject_id_int, subject_id_int))
    summary = dict(cur.fetchone())
    total = summary["total"] or 0
    summary["pct"] = round(summary["present"]/total*100,1) if total > 0 else 0
    return success(data={"records": rows, "summary": summary})

# ── All classes attendance summary (principal/admin) ─────────────
@bp.get("/teacher-report")
@jwt_required_custom
@require_permission("attendance.view")
def teacher_attendance_report():
    user_id   = int(get_jwt_identity())
    from_date = request.args.get("from")
    to_date   = request.args.get("to")
    class_id  = request.args.get("class_id")
    from datetime import date
    if not from_date: from_date = date.today().strftime("%Y-%m-01")
    if not to_date:   to_date   = date.today().isoformat()
    from app.db.connection import get_db
    import psycopg2.extras
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT c.id, c.name, c.section
        FROM class_teachers ct
        JOIN teachers t ON t.id=ct.teacher_id
        JOIN classes c ON c.id=ct.class_id
        WHERE t.user_id=%s AND ct.is_primary=TRUE
        ORDER BY c.name, c.section
    """, (user_id,))
    classes = [dict(r) for r in cur.fetchall()]
    if class_id:
        classes = [c for c in classes if str(c["id"])==str(class_id)]
    report = []
    for cls in classes:
        cur.execute("""
            SELECT s.id, s.first_name||' '||s.last_name AS student_name,
                   s.enrollment_no, s.status,
                   COUNT(*) FILTER (WHERE a.status='present') AS present,
                   COUNT(*) FILTER (WHERE a.status='absent')  AS absent,
                   COUNT(*) FILTER (WHERE a.status='late')    AS late,
                   COUNT(*) FILTER (WHERE a.status='excused') AS excused,
                   COUNT(*) FILTER (WHERE a.status='on_leave')AS on_leave,
                   COUNT(*) AS total,
                   ROUND(COUNT(*) FILTER (WHERE a.status='present')::NUMERIC/NULLIF(COUNT(*),0)*100,1) AS pct
            FROM students s
            LEFT JOIN attendance a ON a.student_id=s.id
                AND a.date BETWEEN %s AND %s
                AND a.class_id=%s
            WHERE s.class_id=%s
            GROUP BY s.id, s.first_name, s.last_name, s.enrollment_no, s.status
            ORDER BY s.first_name
        """, (from_date, to_date, cls["id"], cls["id"]))
        students = [dict(r) for r in cur.fetchall()]
        for s in students:
            s["pct"] = float(s["pct"] or 0)
        report.append({
            "class_id": cls["id"],
            "class_name": cls["name"],
            "section": cls["section"],
            "is_incharge": True,
            "students": students,
        })

    # Withdrawn students from this teacher's incharge class only
    cur.execute("""
        SELECT DISTINCT s.id, s.first_name||' '||s.last_name AS student_name,
               s.enrollment_no, s.status,
               c.id AS class_id, c.name AS class_name, c.section,
               wr.effective_date, wr.reason,
               wr.requested_at AS withdrawal_date
        FROM students s
        JOIN classes c ON c.id=s.class_id
        JOIN withdrawal_requests wr ON wr.student_id=s.id AND wr.status IN ('approved','withdrawn')
        WHERE s.status='withdrawn'
          AND c.id IN (
              SELECT ct.class_id FROM class_teachers ct
              JOIN teachers t ON t.id=ct.teacher_id
              WHERE t.user_id=%s AND ct.is_primary=TRUE
          )
        ORDER BY c.name, student_name
    """, (user_id,))
    withdrawn = [dict(r) for r in cur.fetchall()]
    for w in withdrawn:
        for k in ["effective_date","withdrawal_date"]:
            if w.get(k): w[k] = str(w[k])

    return success(data={"report": report, "withdrawn_students": withdrawn, "from": from_date, "to": to_date})


@bp.get("/report")
@jwt_required_custom
@require_permission("attendance.report")
def attendance_report():
    date = request.args.get("date")
    class_id = request.args.get("class_id")
    from app.db.connection import get_db
    import psycopg2.extras
    from datetime import date as dt
    if not date: date = dt.today().isoformat()
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    subject_id = request.args.get("subject_id")
    subject_id_int = int(subject_id) if subject_id else None
    breakdown = request.args.get("breakdown") == "true"

    if breakdown:
        # Subject-wise breakdown per class
        cur.execute("""
            SELECT c.id AS class_id, c.name, c.section,
                   subj.id AS subject_id, subj.name AS subject_name,
                   COUNT(DISTINCT s.id) AS total_students,
                   COUNT(a.id) FILTER (WHERE a.status='present') AS present,
                   COUNT(a.id) FILTER (WHERE a.status='absent')  AS absent,
                   COUNT(a.id) FILTER (WHERE a.status='late')    AS late,
                   CASE WHEN COUNT(DISTINCT s.id)>0
                     THEN ROUND(COUNT(a.id) FILTER (WHERE a.status='present')::numeric/COUNT(DISTINCT s.id)*100,1)
                     ELSE 0 END AS pct,
                   CASE WHEN COUNT(a.id)>0 THEN TRUE ELSE FALSE END AS marked
            FROM classes c
            LEFT JOIN students s ON s.class_id=c.id AND s.status='active'
            JOIN attendance a ON a.student_id=s.id AND a.date=%s
            JOIN subjects subj ON subj.id=a.subject_id
            WHERE (%s IS NULL OR c.id=%s)
              AND (%s::integer IS NULL OR a.subject_id=%s::integer)
            GROUP BY c.id, c.name, c.section, subj.id, subj.name
            ORDER BY c.name, c.section, subj.name
        """, (date, class_id, class_id, subject_id_int, subject_id_int))
        rows = [dict(r) for r in cur.fetchall()]
        return success(data=rows)

    cur.execute("""
        SELECT c.id AS class_id, c.name, c.section,
               COUNT(DISTINCT s.id) AS total_students,
               COUNT(a.id) FILTER (WHERE a.status='present') AS present,
               COUNT(a.id) FILTER (WHERE a.status='absent')  AS absent,
               COUNT(a.id) FILTER (WHERE a.status='late')    AS late,
               COUNT(a.id) FILTER (WHERE a.status='excused') AS excused,
               CASE WHEN COUNT(DISTINCT s.id)>0
                 THEN ROUND(COUNT(a.id) FILTER (WHERE a.status='present')::numeric/COUNT(DISTINCT s.id)*100,1)
                 ELSE 0 END AS pct,
               CASE WHEN COUNT(a.id)>0 THEN TRUE ELSE FALSE END AS marked
        FROM classes c
        LEFT JOIN students s ON s.class_id=c.id AND s.status='active'
        LEFT JOIN attendance a ON a.student_id=s.id AND a.date=%s
            AND (%s::integer IS NULL OR a.subject_id=%s::integer)
        WHERE (%s IS NULL OR c.id=%s)
        GROUP BY c.id, c.name, c.section
        ORDER BY c.name, c.section
    """, (date, subject_id_int, subject_id_int, class_id, class_id))
    rows = [dict(r) for r in cur.fetchall()]
    return success(data=rows)


# ── Get attendance config (accessible to all authenticated users) ─
@bp.get("/config")
@jwt_required_custom
def get_attendance_config():
    from app.db.connection import get_db
    import psycopg2.extras
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT key, value FROM system_settings WHERE category='attendance_config'")
    data = {r["key"]: r["value"] for r in cur.fetchall()}
    return success(data=data)


@bp.get("/admin-report")
@jwt_required_custom
def admin_attendance_report():
    from_date = request.args.get("from")
    to_date   = request.args.get("to")
    class_id  = request.args.get("class_id", type=int)
    from datetime import date
    if not from_date: from_date = date.today().strftime("%Y-%m-01")
    if not to_date:   to_date   = date.today().isoformat()
    from app.db.connection import get_db
    import psycopg2.extras
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get all classes or specific class
    query = "SELECT c.id, c.name, c.section, (SELECT u.first_name||' '||u.last_name FROM class_teachers ct JOIN teachers t ON t.id=ct.teacher_id JOIN users u ON u.id=t.user_id WHERE ct.class_id=c.id AND ct.is_primary=TRUE LIMIT 1) as incharge_name FROM classes c WHERE 1=1"
    params = []
    if class_id:
        query += " AND id=%s"
        params.append(class_id)
    query += " ORDER BY name, section"
    cur.execute(query, params)
    classes = cur.fetchall()

    report = []
    for cls in classes:
        cid = cls["id"]
        # Get students
        cur.execute("SELECT COUNT(*) as cnt FROM students WHERE class_id=%s AND status='active'", (cid,))
        total = cur.fetchone()["cnt"]

        # Get attendance for date range
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='present') as present,
                COUNT(*) FILTER (WHERE status='absent')  as absent,
                COUNT(*) FILTER (WHERE status='late')    as late,
                COUNT(*) FILTER (WHERE status IN ('on_leave','excused')) as on_leave,
                COUNT(DISTINCT date) as days_marked
            FROM attendance
            WHERE class_id=%s AND date BETWEEN %s AND %s
        """, (cid, from_date, to_date))
        stats = dict(cur.fetchone())

        marked_today = False
        cur.execute("SELECT COUNT(*) as cnt FROM attendance WHERE class_id=%s AND date=%s", (cid, to_date))
        marked_today = cur.fetchone()["cnt"] > 0

        total_days = stats["days_marked"] or 1
        present = stats["present"] or 0
        total_records = (stats["present"] or 0) + (stats["absent"] or 0) + (stats["late"] or 0) + (stats["on_leave"] or 0)
        pct = round(present / total_records * 100, 1) if total_records > 0 else 0

        report.append({
            "class_id": cid,
            "class_name": cls["name"],
            "section": cls["section"],
            "incharge_name": cls.get("incharge_name"),
            "days_marked": stats["days_marked"] or 0,
            "total_students": total,
            "present": stats["present"] or 0,
            "absent": stats["absent"] or 0,
            "late": stats["late"] or 0,
            "on_leave": stats["on_leave"] or 0,
            
            "attendance_pct": pct,
            "is_marked": marked_today,
        })

    return success(data={"report": report, "from": from_date, "to": to_date})


@bp.get("/student-report")
@jwt_required_custom
def student_attendance_report():
    from_date = request.args.get("from")
    to_date   = request.args.get("to")
    class_id  = request.args.get("class_id", type=int)
    search    = request.args.get("search","").strip()
    from datetime import date
    if not from_date: from_date = date.today().strftime("%Y-%m-01")
    if not to_date:   to_date   = date.today().isoformat()
    from app.db.connection import get_db
    import psycopg2.extras
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    where = ["s.status='active'"]
    params = []
    if class_id:
        where.append("s.class_id=%s")
        params.append(class_id)
    if search:
        where.append("(s.first_name||' '||s.last_name ILIKE %s OR s.enrollment_no ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    cur.execute(f"""
        SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
               c.name as class_name, c.section,
               COUNT(a.id) FILTER (WHERE a.status='present') as present,
               COUNT(a.id) FILTER (WHERE a.status='absent') as absent,
               COUNT(a.id) FILTER (WHERE a.status='late') as late,
               COUNT(a.id) FILTER (WHERE a.status='on_leave') as on_leave,
               COUNT(DISTINCT a.date) as total_days
        FROM students s
        LEFT JOIN classes c ON c.id=s.class_id
        LEFT JOIN attendance a ON a.student_id=s.id
            AND a.date BETWEEN %s AND %s
        WHERE {' AND '.join(where)}
        GROUP BY s.id, s.first_name, s.last_name, s.enrollment_no, c.name, c.section
        ORDER BY c.name, c.section, s.first_name
    """, [from_date, to_date] + params)

    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        total = (r['present']or 0)+(r['absent']or 0)+(r['late']or 0)
        r['pct'] = round((r['present']or 0)/total*100,1) if total>0 else 0

    return success(data=rows)
