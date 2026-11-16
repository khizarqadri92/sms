"""
Role dashboards - pre-aggregated data for the charts on each user's dashboard.
Every endpoint returns small summaries (not raw rows), scoped to the caller's
campus (superadmin with no campus selected = all campuses), and uses the
processing date as "today".

Stage 1: principal, academic coordinator.
"""
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_campus import get_current_campus_id
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

router = APIRouter()

PRESENT = ("present", "late")


def get_cur(db):
    return _get_cur(db)


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _role(claims):
    roles = (claims or {}).get("roles") or []
    return roles[0] if roles else ""


def _allow(claims, *roles):
    if _role(claims) not in roles + ("superadmin", "admin"):
        fail("This dashboard isn't available for your role.", 403)


def _f(v, d=1):
    return round(float(v), d) if v is not None else None


def _label(name, section):
    return f"{name} ({section})" if section else str(name)


# ---------------------------------------------------------------- shared pieces

def active_year(cur, campus_id):
    cur.execute("""SELECT id, name FROM academic_years WHERE is_active AND (%s::int IS NULL OR campus_id=%s OR campus_id IS NULL)
                   ORDER BY campus_id NULLS LAST LIMIT 1""", (campus_id, campus_id))
    r = cur.fetchone()
    return dict(r) if r else None


def campus_classes(cur, campus_id):
    cur.execute("""SELECT id, name, section, level FROM classes WHERE (%s::int IS NULL OR campus_id=%s)
                   ORDER BY level NULLS LAST, name, section""", (campus_id, campus_id))
    return [dict(r) for r in cur.fetchall()]


def student_attendance_daily(cur, class_ids, start, end):
    """[{date, pct}] - a student counts present on a day if any row that day is present/late."""
    if not class_ids:
        return []
    cur.execute("""
        WITH per_student AS (
            SELECT date, student_id, BOOL_OR(lower(status) IN ('present','late')) AS here
            FROM attendance WHERE class_id = ANY(%s) AND date BETWEEN %s AND %s
            GROUP BY date, student_id)
        SELECT date, ROUND(100.0 * COUNT(*) FILTER (WHERE here) / COUNT(*), 1) AS pct, COUNT(*) AS marked
        FROM per_student GROUP BY date ORDER BY date""", (class_ids, start, end))
    return [{"date": str(r["date"]), "pct": _f(r["pct"]), "marked": r["marked"]} for r in cur.fetchall()]


def class_attendance(cur, classes, start, end):
    ids = [c["id"] for c in classes]
    if not ids:
        return []
    cur.execute("""
        WITH per_student AS (
            SELECT class_id, date, student_id, BOOL_OR(lower(status) IN ('present','late')) AS here
            FROM attendance WHERE class_id = ANY(%s) AND date BETWEEN %s AND %s
            GROUP BY class_id, date, student_id)
        SELECT class_id, ROUND(100.0 * COUNT(*) FILTER (WHERE here) / COUNT(*), 1) AS pct
        FROM per_student GROUP BY class_id""", (ids, start, end))
    got = {r["class_id"]: _f(r["pct"]) for r in cur.fetchall()}
    return [{"class": _label(c["name"], c["section"]), "class_id": c["id"], "pct": got[c["id"]]}
            for c in classes if c["id"] in got]


def year_exams(cur, ay_id, class_ids, compiled_only=True):
    """This year's exams that include the campus's classes, oldest first."""
    if not ay_id or not class_ids:
        return []
    cur.execute("""SELECT DISTINCT e.id, e.name, e.status, e.start_date, e.created_at
                   FROM exams e JOIN exam_classes ec ON ec.exam_id=e.id
                   WHERE e.academic_year_id=%s AND ec.class_id = ANY(%s)
                     AND (%s = FALSE OR EXISTS (SELECT 1 FROM exam_results er WHERE er.exam_id=e.id))
                   ORDER BY e.start_date NULLS LAST, e.created_at""", (ay_id, class_ids, compiled_only))
    return [dict(r) for r in cur.fetchall()]


def exam_class_stats(cur, exam_id, class_ids):
    cur.execute("""SELECT class_id, COUNT(*) AS n, ROUND(AVG(percentage), 1) AS avg,
                          COUNT(*) FILTER (WHERE is_pass) AS pass,
                          COUNT(*) FILTER (WHERE is_compartment) AS compartment,
                          COUNT(*) FILTER (WHERE NOT is_pass AND NOT COALESCE(is_compartment, FALSE)) AS fail
                   FROM exam_results WHERE exam_id=%s AND class_id = ANY(%s) GROUP BY class_id""", (exam_id, class_ids))
    return {r["class_id"]: dict(r) for r in cur.fetchall()}


# ---------------------------------------------------------------- principal

@router.get("/principal")
def principal_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                        db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _allow(claims, "principal")
    cur = get_cur(db)
    today = get_processing_date(db)
    start30 = today - timedelta(days=29)
    ay = active_year(cur, campus_id)
    classes = campus_classes(cur, campus_id)
    class_ids = [c["id"] for c in classes]
    by_id = {c["id"]: c for c in classes}

    # ---- headline tiles
    cur.execute("SELECT COUNT(*) AS n FROM students WHERE status='active' AND class_id = ANY(%s)", (class_ids or [0],))
    students = cur.fetchone()["n"]
    cur.execute("SELECT id, user_id FROM staff WHERE status='active' AND (%s::int IS NULL OR campus_id=%s)", (campus_id, campus_id))
    staff_rows = cur.fetchall()
    staff_ids = [r["id"] for r in staff_rows]
    today_students = student_attendance_daily(cur, class_ids, today, today)
    cur.execute("""SELECT COUNT(DISTINCT staff_id) AS n FROM staff_attendance_sessions
                   WHERE staff_id = ANY(%s) AND clock_in_at::date = %s""", (staff_ids or [0], today))
    staff_in = cur.fetchone()["n"]

    # ---- attendance
    trend = student_attendance_daily(cur, class_ids, start30, today)
    by_class = class_attendance(cur, classes, start30, today)

    # ---- latest compiled exam: pass/compartment/fail per class, vs previous exam
    exams = year_exams(cur, ay["id"] if ay else None, class_ids)
    results = None
    if exams:
        latest = exams[-1]
        prev = exams[-2] if len(exams) > 1 else None
        cur_stats = exam_class_stats(cur, latest["id"], class_ids)
        prev_stats = exam_class_stats(cur, prev["id"], class_ids) if prev else {}
        cur.execute("""SELECT grade, COUNT(*) AS n FROM exam_results
                       WHERE exam_id=%s AND class_id = ANY(%s) AND grade IS NOT NULL GROUP BY grade""", (latest["id"], class_ids))
        grades = {r["grade"]: r["n"] for r in cur.fetchall()}
        cur.execute("SELECT grade FROM grading_scales WHERE is_active ORDER BY min_pct DESC")
        order = [r["grade"] for r in cur.fetchall()]
        results = {
            "exam": latest["name"], "exam_id": latest["id"], "previous_exam": prev["name"] if prev else None,
            "by_class": [{"class": _label(by_id[cid]["name"], by_id[cid]["section"]), "class_id": cid,
                          "pass": s["pass"], "compartment": s["compartment"], "fail": s["fail"],
                          "avg": _f(s["avg"]), "prev_avg": _f(prev_stats.get(cid, {}).get("avg"))}
                         for cid, s in sorted(cur_stats.items(), key=lambda kv: (by_id[kv[0]]["level"] or 0, by_id[kv[0]]["name"], by_id[kv[0]]["section"] or ""))],
            "grades": [{"grade": g, "students": grades.get(g, 0)} for g in order],
        }

    # ---- pending approvals
    pending = {}
    cur.execute("""SELECT COUNT(DISTINCT e.id) AS n FROM exams e JOIN exam_classes ec ON ec.exam_id=e.id
                   WHERE e.status='reviewed' AND ec.class_id = ANY(%s)""", (class_ids or [0],))
    pending["results"] = cur.fetchone()["n"]
    try:
        cur.execute("SELECT COUNT(*) AS n FROM promotion_batches WHERE status='submitted' AND (%s::int IS NULL OR campus_id=%s)", (campus_id, campus_id))
        pending["promotions"] = cur.fetchone()["n"]
    except Exception:
        db.rollback(); pending["promotions"] = 0
    cur.execute("""SELECT COUNT(*) AS n FROM leave_requests lr JOIN students s ON s.id=lr.student_id
                   WHERE lr.status IN ('pending','recommended') AND s.class_id = ANY(%s)""", (class_ids or [0],))
    pending["student_leaves"] = cur.fetchone()["n"]
    cur.execute("""SELECT COUNT(*) AS n FROM staff_leave_requests WHERE status='pending'
                   AND user_id = ANY(%s)""", ([r["user_id"] for r in staff_rows if r["user_id"]] or [0],))
    pending["staff_leaves"] = cur.fetchone()["n"]
    cur.execute("""SELECT COUNT(*) AS n FROM withdrawal_requests w JOIN students s ON s.id=w.student_id
                   WHERE w.status NOT IN ('approved','rejected','withdrawn','completed','cancelled')
                     AND s.campus_id IS NOT DISTINCT FROM COALESCE(%s, s.campus_id)""", (campus_id,))
    pending["withdrawals"] = cur.fetchone()["n"]

    return ok(data={
        "today": str(today), "academic_year": ay["name"] if ay else None,
        "tiles": {"students": students, "staff": len(staff_ids),
                  "student_attendance_today": today_students[0]["pct"] if today_students else None,
                  "student_marked_today": today_students[0]["marked"] if today_students else 0,
                  "staff_present_today": staff_in,
                  "staff_attendance_today": _f(100.0 * staff_in / len(staff_ids)) if staff_ids else None},
        "attendance_trend": trend, "class_attendance": by_class,
        "results": results, "pending": pending,
    })


# ---------------------------------------------------------------- academic coordinator

@router.get("/coordinator")
def coordinator_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                          db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _allow(claims, "academic_coordinator", "principal")
    cur = get_cur(db)
    today = get_processing_date(db)
    ay = active_year(cur, campus_id)
    classes = campus_classes(cur, campus_id)
    class_ids = [c["id"] for c in classes]
    by_id = {c["id"]: c for c in classes}
    order_key = lambda cid: (by_id[cid]["level"] or 0, by_id[cid]["name"], by_id[cid]["section"] or "")

    # ---- marks entry progress for the exam currently open for marks
    marks = None
    cur.execute("""SELECT DISTINCT e.id, e.name FROM exams e JOIN exam_classes ec ON ec.exam_id=e.id
                   WHERE e.status='marks_open' AND ec.class_id = ANY(%s)
                   ORDER BY e.id DESC LIMIT 1""", (class_ids or [0],))
    ex = cur.fetchone()
    if ex:
        cur.execute("""SELECT es.class_id, COUNT(*) AS papers, COUNT(*) FILTER (WHERE es.marks_submitted) AS submitted
                       FROM exam_subjects es
                       WHERE es.exam_id=%s AND es.class_id = ANY(%s)
                         AND EXISTS (SELECT 1 FROM students s WHERE s.class_id=es.class_id AND s.status='active')
                       GROUP BY es.class_id""", (ex["id"], class_ids))
        rows = {r["class_id"]: r for r in cur.fetchall()}
        marks = {"exam": ex["name"], "exam_id": ex["id"],
                 "by_class": [{"class": _label(by_id[c]["name"], by_id[c]["section"]), "papers": r["papers"],
                               "submitted": r["submitted"], "pct": _f(100.0 * r["submitted"] / r["papers"]) if r["papers"] else 0}
                              for c, r in sorted(rows.items(), key=lambda kv: order_key(kv[0]))]}

    # ---- this year's compiled exams
    exams = year_exams(cur, ay["id"] if ay else None, class_ids)
    subject_perf = trend = None
    if exams:
        latest = exams[-1]
        cur.execute("""SELECT sub.name AS subject,
                              ROUND(AVG(100.0 * em.marks_obtained / NULLIF(es.total_marks, 0)), 1) AS avg,
                              COUNT(*) AS entries
                       FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id
                       JOIN subjects sub ON sub.id=es.subject_id
                       WHERE em.exam_id=%s AND es.class_id = ANY(%s) AND NOT COALESCE(em.is_absent, FALSE)
                         AND em.marks_obtained IS NOT NULL
                       GROUP BY sub.name ORDER BY avg""", (latest["id"], class_ids))
        subject_perf = {"exam": latest["name"], "exam_id": latest["id"], "subjects": [{"subject": r["subject"], "avg": _f(r["avg"])} for r in cur.fetchall()]}
        # class averages across the year's exams (one line per class)
        points = []
        for e in exams:
            stats = exam_class_stats(cur, e["id"], class_ids)
            row = {"exam": e["name"]}
            for cid, s in stats.items():
                row[_label(by_id[cid]["name"], by_id[cid]["section"])] = _f(s["avg"])
            points.append(row)
        series = sorted({k for p in points for k in p if k != "exam"},
                        key=lambda lbl: next((order_key(c["id"]) for c in classes if _label(c["name"], c["section"]) == lbl), (0, lbl, "")))
        trend = {"points": points, "series": series}

    # ---- assignments & quizzes (due so far this year): submitted vs expected per class
    work = []
    for c in classes:
        cur.execute("SELECT COUNT(*) AS n FROM students WHERE class_id=%s AND status='active'", (c["id"],))
        n = cur.fetchone()["n"]
        if not n:
            continue
        cur.execute("SELECT COUNT(*) AS n FROM assignments WHERE class_id=%s AND due_date <= %s", (c["id"], today))
        a_items = cur.fetchone()["n"]
        cur.execute("""SELECT COUNT(*) AS n FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
                       JOIN students st ON st.id=s.student_id
                       WHERE a.class_id=%s AND a.due_date <= %s AND st.class_id=%s AND st.status='active'""", (c["id"], today, c["id"]))
        a_done = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM quizzes WHERE class_id=%s AND due_date::date <= %s", (c["id"], today))
        q_items = cur.fetchone()["n"]
        cur.execute("""SELECT COUNT(*) AS n FROM quiz_submissions s JOIN quizzes q ON q.id=s.quiz_id
                       JOIN students st ON st.id=s.student_id
                       WHERE q.class_id=%s AND q.due_date::date <= %s AND st.class_id=%s AND st.status='active'""", (c["id"], today, c["id"]))
        q_done = cur.fetchone()["n"]
        a = {"items": a_items, "done": a_done}; q = {"items": q_items, "done": q_done}
        a_exp, q_exp = (a["items"] or 0) * n, (q["items"] or 0) * n
        if a_exp or q_exp:
            work.append({"class": _label(c["name"], c["section"]),
                         "assignments_done": a["done"] or 0, "assignments_missed": max(a_exp - (a["done"] or 0), 0),
                         "quizzes_done": q["done"] or 0, "quizzes_missed": max(q_exp - (q["done"] or 0), 0)})

    # ---- at-risk students: below passing in the latest exam, a big drop, or poor attendance
    at_risk = []
    passing = 40.0
    if ay:
        cur.execute("SELECT passing_pct FROM exam_config WHERE academic_year_id=%s", (ay["id"],))
        r = cur.fetchone()
        if r and r["passing_pct"] is not None:
            passing = float(r["passing_pct"])
    if exams:
        latest, prev = exams[-1], (exams[-2] if len(exams) > 1 else None)
        start30 = today - timedelta(days=29)
        cur.execute("""WITH ps AS (SELECT student_id, date, BOOL_OR(lower(status) IN ('present','late')) AS here
                                   FROM attendance WHERE class_id = ANY(%s) AND date BETWEEN %s AND %s
                                   GROUP BY student_id, date)
                       SELECT student_id, ROUND(100.0 * COUNT(*) FILTER (WHERE here) / COUNT(*), 1) AS pct
                       FROM ps GROUP BY student_id""", (class_ids, start30, today))
        att = {r["student_id"]: float(r["pct"]) for r in cur.fetchall()}
        cur.execute("""SELECT er.student_id, er.percentage, er.class_id, s.first_name, s.last_name, s.enrollment_no,
                              pr.percentage AS prev_pct
                       FROM exam_results er JOIN students s ON s.id=er.student_id
                       LEFT JOIN exam_results pr ON pr.student_id=er.student_id AND pr.exam_id=%s
                       WHERE er.exam_id=%s AND er.class_id = ANY(%s) AND s.status='active'""",
                    (prev["id"] if prev else 0, latest["id"], class_ids))
        for r in cur.fetchall():
            pct = float(r["percentage"] or 0)
            prev_pct = float(r["prev_pct"]) if r["prev_pct"] is not None else None
            reasons = []
            if pct < passing:
                reasons.append(f"Below passing ({pct:.0f}%)")
            if prev_pct is not None and prev_pct - pct >= 15:
                reasons.append(f"Dropped {prev_pct - pct:.0f} points")
            a = att.get(r["student_id"])
            if a is not None and a < 75:
                reasons.append(f"Attendance {a:.0f}%")
            if reasons:
                at_risk.append({"student": f"{r['first_name']} {r['last_name']}", "enrollment_no": r["enrollment_no"],
                                "class": _label(by_id[r["class_id"]]["name"], by_id[r["class_id"]]["section"]),
                                "pct": round(pct, 1), "prev_pct": round(prev_pct, 1) if prev_pct is not None else None,
                                "attendance": a, "reasons": reasons})
        at_risk.sort(key=lambda x: (-len(x["reasons"]), x["pct"]))

    return ok(data={"today": str(today), "academic_year": ay["name"] if ay else None,
                    "marks_progress": marks, "subject_performance": subject_perf, "exam_trend": trend,
                    "work": work, "at_risk": at_risk[:20], "passing_pct": passing})


# ---------------------------------------------------------------- teacher

def teacher_scope(cur, user_id):
    """(teacher_id, incharge class ids, all my class ids, {(class_id, subject_id)} I teach)."""
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t:
        fail("No teacher profile is linked to your account.", 404)
    tid = t["id"]
    cur.execute("SELECT class_id, is_primary FROM class_teachers WHERE teacher_id=%s", (tid,))
    ct = cur.fetchall()
    incharge = {r["class_id"] for r in ct if r["is_primary"]}
    pairs = set()
    try:
        cur.execute("SELECT class_id, subject_id FROM class_subject_teacher_assignments WHERE teacher_id=%s", (tid,))
        pairs |= {(r["class_id"], r["subject_id"]) for r in cur.fetchall()}
    except Exception:
        cur.connection.rollback()
    cur.execute("""SELECT ct.class_id, ts.subject_id FROM class_teachers ct
                   JOIN teacher_subjects ts ON ts.teacher_id=ct.teacher_id
                   JOIN class_subjects cs ON cs.class_id=ct.class_id AND cs.subject_id=ts.subject_id
                   WHERE ct.teacher_id=%s""", (tid,))
    pairs |= {(r["class_id"], r["subject_id"]) for r in cur.fetchall()}
    classes = {r["class_id"] for r in ct} | {c for c, _ in pairs}
    return tid, incharge, classes, pairs


@router.get("/teacher")
def teacher_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    if _role(claims) != "teacher":
        fail("This dashboard is for teachers.", 403)
    cur = get_cur(db)
    today = get_processing_date(db)
    start30 = today - timedelta(days=29)
    tid, incharge, my_classes, pairs = teacher_scope(cur, user_id)
    class_ids = sorted(my_classes)
    cur.execute("SELECT id, name, section, level, campus_id FROM classes WHERE id = ANY(%s) ORDER BY level NULLS LAST, name, section",
                (class_ids or [0],))
    classes = [dict(r) for r in cur.fetchall()]
    by_id = {c["id"]: c for c in classes}
    lbl = lambda cid: _label(by_id[cid]["name"], by_id[cid]["section"]) if cid in by_id else str(cid)
    campus_id = classes[0]["campus_id"] if classes else None
    ay = active_year(cur, campus_id)

    # ---- tiles
    cur.execute("SELECT COUNT(*) AS n FROM students WHERE status='active' AND class_id = ANY(%s)", (class_ids or [0],))
    n_students = cur.fetchone()["n"]
    incharge_ids = sorted(incharge)
    marked_today = []
    for cid in incharge_ids:
        cur.execute("SELECT COUNT(DISTINCT student_id) AS n FROM attendance WHERE class_id=%s AND date=%s", (cid, today))
        marked_today.append({"class": lbl(cid), "marked": cur.fetchone()["n"] > 0})
    cur.execute("""SELECT COUNT(*) AS n FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
                   WHERE a.teacher_id=%s AND s.marks IS NULL""", (tid,))
    to_grade = cur.fetchone()["n"]

    # ---- attendance of my classes (last 30 days), one line per class
    att_points = {}
    for c in classes:
        for p in student_attendance_daily(cur, [c["id"]], start30, today):
            att_points.setdefault(p["date"], {"date": p["date"]})[lbl(c["id"])] = p["pct"]
    attendance = {"points": [att_points[k] for k in sorted(att_points)], "series": [lbl(c["id"]) for c in classes]}

    # ---- my subjects in the latest compiled exam
    exams = year_exams(cur, ay["id"] if ay else None, class_ids)
    subject_results = distribution = None
    passing = 40.0
    if ay:
        cur.execute("SELECT passing_pct FROM exam_config WHERE academic_year_id=%s", (ay["id"],))
        r = cur.fetchone()
        if r and r["passing_pct"] is not None:
            passing = float(r["passing_pct"])
    weak = []
    if exams and pairs:
        latest = exams[-1]
        prev = exams[-2] if len(exams) > 1 else None
        pair_c = [p[0] for p in pairs]; pair_s = [p[1] for p in pairs]
        def subject_avgs(exam_id):
            cur.execute("""SELECT es.class_id, es.subject_id, sub.name AS subject,
                                  ROUND(AVG(100.0 * em.marks_obtained / NULLIF(es.total_marks,0)), 1) AS avg
                           FROM exam_subjects es JOIN subjects sub ON sub.id=es.subject_id
                           JOIN exam_marks em ON em.exam_subject_id=es.id
                           WHERE es.exam_id=%s AND (es.class_id, es.subject_id) IN (SELECT x.c, x.s FROM unnest(%s::int[], %s::int[]) AS x(c, s))
                             AND NOT COALESCE(em.is_absent, FALSE) AND em.marks_obtained IS NOT NULL
                           GROUP BY es.class_id, es.subject_id, sub.name""", (exam_id, pair_c, pair_s))
            return {(r["class_id"], r["subject_id"]): dict(r) for r in cur.fetchall()}
        now_avg = subject_avgs(latest["id"])
        prev_avg = subject_avgs(prev["id"]) if prev else {}
        subject_results = {"exam": latest["name"], "exam_id": latest["id"], "previous_exam": prev["name"] if prev else None,
                           "rows": [{"label": lbl(k[0]) + " · " + v["subject"], "avg": _f(v["avg"]),
                                     "prev_avg": _f(prev_avg.get(k, {}).get("avg"))}
                                    for k, v in sorted(now_avg.items(), key=lambda kv: (lbl(kv[0][0]), kv[1]["subject"]))]}
        # score distribution + weak students in my subjects
        cur.execute("""SELECT em.student_id, es.class_id, sub.name AS subject,
                              100.0 * em.marks_obtained / NULLIF(es.total_marks,0) AS pct, em.is_absent,
                              s.first_name, s.last_name, s.enrollment_no
                       FROM exam_subjects es JOIN subjects sub ON sub.id=es.subject_id
                       JOIN exam_marks em ON em.exam_subject_id=es.id JOIN students s ON s.id=em.student_id
                       WHERE es.exam_id=%s AND (es.class_id, es.subject_id) IN (SELECT x.c, x.s FROM unnest(%s::int[], %s::int[]) AS x(c, s))
                         AND s.status='active'""", (latest["id"], pair_c, pair_s))
        bands = [(0, 39, "0-39"), (40, 49, "40-49"), (50, 59, "50-59"), (60, 69, "60-69"), (70, 79, "70-79"), (80, 89, "80-89"), (90, 100, "90-100")]
        counts = {b[2]: 0 for b in bands}
        for r in cur.fetchall():
            if r["is_absent"] or r["pct"] is None:
                weak.append({"student": f"{r['first_name']} {r['last_name']}", "enrollment_no": r["enrollment_no"],
                             "class": lbl(r["class_id"]), "why": f"Absent in {r['subject']}"})
                continue
            p = float(r["pct"])
            for lo, hi, name in bands:
                if lo <= round(p) <= hi:
                    counts[name] += 1; break
            if p < passing:
                weak.append({"student": f"{r['first_name']} {r['last_name']}", "enrollment_no": r["enrollment_no"],
                             "class": lbl(r["class_id"]), "why": f"{r['subject']}: {p:.0f}%"})
        distribution = {"exam": latest["name"], "bands": [{"band": b[2], "students": counts[b[2]]} for b in bands]}

    # low attendance in my classes
    cur.execute("""WITH ps AS (SELECT student_id, class_id, date, BOOL_OR(lower(status) IN ('present','late')) AS here
                               FROM attendance WHERE class_id = ANY(%s) AND date BETWEEN %s AND %s GROUP BY student_id, class_id, date)
                   SELECT ps.student_id, ps.class_id, s.first_name, s.last_name, s.enrollment_no,
                          ROUND(100.0 * COUNT(*) FILTER (WHERE here) / COUNT(*), 0) AS pct
                   FROM ps JOIN students s ON s.id=ps.student_id WHERE s.status='active'
                   GROUP BY ps.student_id, ps.class_id, s.first_name, s.last_name, s.enrollment_no
                   HAVING 100.0 * COUNT(*) FILTER (WHERE here) / COUNT(*) < 75""", (class_ids or [0], start30, today))
    for r in cur.fetchall():
        weak.append({"student": f"{r['first_name']} {r['last_name']}", "enrollment_no": r["enrollment_no"],
                     "class": lbl(r["class_id"]), "why": f"Attendance {int(r['pct'])}%"})
    merged = {}
    for w in weak:
        m = merged.setdefault((w["enrollment_no"], w["class"]), {**w, "reasons": []})
        m["reasons"].append(w["why"])
    attention = sorted(merged.values(), key=lambda x: -len(x["reasons"]))[:20]
    for a in attention: a.pop("why", None)

    # ---- my latest assignments: submitted / graded / missing
    cur.execute("""SELECT a.id, a.title, a.class_id, a.due_date,
                          (SELECT COUNT(*) FROM students st WHERE st.class_id=a.class_id AND st.status='active') AS students,
                          COUNT(s.id) AS submitted, COUNT(s.marks) AS graded
                   FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id=a.id
                   WHERE a.teacher_id=%s GROUP BY a.id, a.title, a.class_id, a.due_date ORDER BY a.due_date DESC NULLS LAST, a.id DESC LIMIT 8""", (tid,))
    assignments = []
    for r in cur.fetchall():
        due_passed = r["due_date"] is not None and r["due_date"] < today
        assignments.append({"label": (r["title"] or "Assignment")[:22] + " · " + lbl(r["class_id"]),
                            "graded": r["graded"], "to_grade": r["submitted"] - r["graded"],
                            "missing": max(r["students"] - r["submitted"], 0) if due_passed else 0,
                            "not_due": max(r["students"] - r["submitted"], 0) if not due_passed else 0})
    assignments.reverse()

    return ok(data={"today": str(today), "academic_year": ay["name"] if ay else None,
                    "tiles": {"classes": len(classes), "students": n_students, "to_grade": to_grade,
                              "incharge_attendance": marked_today},
                    "attendance": attendance, "subject_results": subject_results, "distribution": distribution,
                    "assignments": assignments, "attention": attention, "passing_pct": passing})


# ---------------------------------------------------------------- student / parent

def _cols(cur, table):
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    return {r["column_name"] for r in cur.fetchall()}


def _live_invoice(cur, alias="fi"):
    """SQL condition for invoices that still count: not cancelled, not replaced by a newer invoice."""
    fc = _cols(cur, "fee_invoices")
    cond = f"COALESCE({alias}.status,'') <> 'cancelled'"
    if "superseded_by" in fc:
        cond += f" AND {alias}.superseded_by IS NULL"
    return cond


def _pay_table(cur):
    """The table holding fee payments: whichever has both invoice_id and amount_paid (name varies by install)."""
    cur.execute("""SELECT c.table_name FROM information_schema.columns c
                   JOIN information_schema.tables t ON t.table_name=c.table_name AND t.table_schema=c.table_schema
                   WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.column_name IN ('invoice_id','amount_paid')
                   GROUP BY c.table_name HAVING COUNT(DISTINCT c.column_name)=2 ORDER BY c.table_name""")
    rows = [r["table_name"] for r in cur.fetchall()]
    pref = [t for t in rows if "pay" in t.lower()]
    return (pref or rows or [None])[0]


def _fee_summary(cur, student_id, today):
    """Due / overdue amounts, next due date and payments per month - adapts to the fee tables present."""
    fc = _cols(cur, "fee_invoices")
    if not fc:
        return None
    net = "net_amount" if "net_amount" in fc else "(COALESCE(amount,0) - COALESCE(discount,0) + COALESCE(fine,0))"
    pt = _pay_table(cur)
    pc = _cols(cur, pt) if pt else set()
    if "paid_amount" in fc:
        paid = "COALESCE(fi.paid_amount, 0)"
    elif {"invoice_id", "amount_paid"} <= pc:
        ver = " AND COALESCE(p.is_verified, TRUE)" if "is_verified" in pc else ""
        paid = f"COALESCE((SELECT SUM(p.amount_paid) FROM {pt} p WHERE p.invoice_id=fi.id{ver}), 0)"
    else:
        paid = f"CASE WHEN fi.status='paid' THEN {net} ELSE 0 END"
    cur.execute(f"""SELECT fi.id, fi.status, fi.due_date, fi.month_year, {net} AS net, {paid} AS paid
                    FROM fee_invoices fi WHERE fi.student_id=%s AND {_live_invoice(cur)}""", (student_id,))
    rows = [dict(r) for r in cur.fetchall()]
    due = overdue = 0.0
    next_due = None
    for r in rows:
        bal = max(float(r["net"] or 0) - float(r["paid"] or 0), 0) if r["status"] != "paid" else 0
        due += bal
        if bal and r["due_date"] and r["due_date"] < today:
            overdue += bal
        if bal and r["due_date"] and r["due_date"] >= today and (next_due is None or r["due_date"] < next_due):
            next_due = r["due_date"]
    history = []
    if {"invoice_id", "amount_paid"} <= pc and ("paid_at" in pc or "payment_date" in pc):
        dcol = "paid_at" if "paid_at" in pc else "payment_date"
        ver = " AND COALESCE(p.is_verified, TRUE)" if "is_verified" in pc else ""
        cur.execute(f"""SELECT to_char(p.{dcol}, 'YYYY-MM') AS month, SUM(p.amount_paid) AS paid
                        FROM {pt} p JOIN fee_invoices fi ON fi.id=p.invoice_id
                        WHERE fi.student_id=%s{ver} AND p.{dcol} IS NOT NULL
                        GROUP BY 1 ORDER BY 1 DESC LIMIT 12""", (student_id,))
        history = [{"month": r["month"], "paid": round(float(r["paid"] or 0))} for r in cur.fetchall()][::-1]
    else:
        by_m = {}
        for r in rows:
            if r["month_year"] and float(r["paid"] or 0) > 0:
                by_m[r["month_year"]] = by_m.get(r["month_year"], 0) + float(r["paid"])
        history = [{"month": m, "paid": round(v)} for m, v in sorted(by_m.items())[-12:]]
    return {"due": round(due), "overdue": round(overdue), "next_due": str(next_due) if next_due else None, "history": history}


def _withheld_months(cur, ay_id, student_id, today):
    """Unpaid overdue months if Result Rules withhold this student's results, else 0."""
    try:
        cur.execute("SELECT withhold_on_fee_due, withhold_fee_months FROM exam_config WHERE academic_year_id=%s", (ay_id,))
        r = cur.fetchone()
    except Exception:
        cur.connection.rollback(); return 0
    if not r or not r.get("withhold_on_fee_due"):
        return 0
    cur.execute("""SELECT COUNT(DISTINCT COALESCE(month_year, to_char(due_date,'YYYY-MM'))) AS n FROM fee_invoices
                   WHERE student_id=%s AND status IN ('unpaid','partial','overdue') AND due_date < %s""", (student_id, today))
    n = cur.fetchone()["n"]
    return n if n >= max(int(r.get("withhold_fee_months") or 1), 1) else 0


@router.get("/student")
def student_dashboard(student_id: Optional[int] = None, user_id: int = Depends(get_current_user_id),
                      claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    """A student's own dashboard; parents pass student_id (one of their children)."""
    role = _role(claims)
    cur = get_cur(db)
    today = get_processing_date(db)
    if role == "student":
        cur.execute("SELECT * FROM students WHERE user_id=%s ORDER BY id LIMIT 1", (user_id,))
        st = cur.fetchone()
        children = []
    elif role == "parent":
        cur.execute("""SELECT s.id, s.first_name, s.last_name, s.class_id, c.name AS class_name, c.section
                       FROM students s LEFT JOIN classes c ON c.id=s.class_id
                       WHERE s.parent_id=%s AND s.status <> 'withdrawn' ORDER BY s.first_name""", (user_id,))
        children = [{"id": r["id"], "name": f"{r['first_name']} {r['last_name']}",
                     "class": _label(r["class_name"], r["section"]) if r["class_name"] else ""} for r in cur.fetchall()]
        if not children:
            fail("No children are linked to your account.", 404)
        sid = student_id if student_id in [c["id"] for c in children] else children[0]["id"]
        cur.execute("SELECT * FROM students WHERE id=%s", (sid,))
        st = cur.fetchone()
    else:
        fail("This dashboard is for students and parents.", 403)
    if not st:
        fail("No student profile is linked to your account.", 404)
    st = dict(st)
    sid, class_id = st["id"], st["class_id"]
    cur.execute("SELECT name, section, campus_id FROM classes WHERE id=%s", (class_id,))
    cls = cur.fetchone() or {}
    ay = active_year(cur, cls.get("campus_id"))
    ay_start = None
    if ay:
        cur.execute("SELECT start_date FROM academic_years WHERE id=%s", (ay["id"],))
        ay_start = (cur.fetchone() or {}).get("start_date")
    start = ay_start or (today - timedelta(days=180))

    # ---- attendance this year: totals + per month (one status per day: best of the day)
    cur.execute("""WITH days AS (
                       SELECT date, CASE WHEN BOOL_OR(lower(status)='present') THEN 'present'
                                         WHEN BOOL_OR(lower(status)='late') THEN 'late'
                                         WHEN BOOL_OR(lower(status) IN ('on_leave','excused','leave')) THEN 'leave'
                                         ELSE 'absent' END AS st
                       FROM attendance WHERE student_id=%s AND date BETWEEN %s AND %s GROUP BY date)
                   SELECT to_char(date,'YYYY-MM') AS month, st, COUNT(*) AS n FROM days GROUP BY 1, 2 ORDER BY 1""",
                (sid, start, today))
    months, totals = {}, {"present": 0, "late": 0, "leave": 0, "absent": 0}
    for r in cur.fetchall():
        months.setdefault(r["month"], {"month": r["month"], "present": 0, "late": 0, "leave": 0, "absent": 0})[r["st"]] = r["n"]
        totals[r["st"]] += r["n"]
    days = sum(totals.values())
    att_pct = _f(100.0 * (totals["present"] + totals["late"]) / days) if days else None

    # ---- results: published exams only, hidden while withheld for unpaid fee
    held = _withheld_months(cur, ay["id"], sid, today) if ay else 0
    exams_out, subjects_out, latest_card = [], None, None
    if ay and not held:
        cur.execute("""SELECT e.id, e.name, er.percentage, er.grade, er.class_position, er.is_pass, er.is_compartment,
                              (SELECT ROUND(AVG(x.percentage),1) FROM exam_results x WHERE x.exam_id=e.id AND x.class_id=er.class_id) AS class_avg,
                              (SELECT COUNT(*) FROM exam_results x WHERE x.exam_id=e.id AND x.class_id=er.class_id) AS class_size
                       FROM exam_results er JOIN exams e ON e.id=er.exam_id
                       WHERE er.student_id=%s AND e.academic_year_id=%s AND e.status='published'
                       ORDER BY e.start_date NULLS LAST, e.created_at""", (sid, ay["id"]))
        ex_rows = [dict(r) for r in cur.fetchall()]
        exams_out = [{"exam": r["name"], "mine": _f(r["percentage"]), "class_avg": _f(r["class_avg"])} for r in ex_rows]
        if ex_rows:
            last = ex_rows[-1]
            latest_card = {"exam": last["name"], "exam_id": last["id"], "pct": _f(last["percentage"]), "grade": last["grade"],
                           "position": last["class_position"], "class_size": last["class_size"],
                           "result": "pass" if last["is_pass"] else ("compartment" if last["is_compartment"] else "fail")}
            cur.execute("""SELECT sub.name AS subject,
                                  ROUND(100.0 * MAX(CASE WHEN em.student_id=%s THEN em.marks_obtained END) / NULLIF(es.total_marks,0), 1) AS mine,
                                  ROUND(AVG(100.0 * em.marks_obtained / NULLIF(es.total_marks,0)) FILTER (WHERE NOT COALESCE(em.is_absent,FALSE)), 1) AS class_avg
                           FROM exam_subjects es JOIN subjects sub ON sub.id=es.subject_id
                           JOIN exam_marks em ON em.exam_subject_id=es.id
                           WHERE es.exam_id=%s AND es.class_id=%s
                           GROUP BY sub.name, es.total_marks ORDER BY sub.name""", (sid, last["id"], class_id))
            subjects_out = {"exam": last["name"], "rows": [{"subject": r["subject"], "mine": _f(r["mine"]), "class_avg": _f(r["class_avg"])}
                                                           for r in cur.fetchall()]}

    # ---- assignments & quizzes
    def work(table, sub_table, key, due_expr):
        cur.execute(f"""SELECT t.id, t.total_marks, {due_expr} AS due, s.marks, s.id AS sub_id
                        FROM {table} t LEFT JOIN {sub_table} s ON s.{key}=t.id AND s.student_id=%s
                        WHERE t.class_id=%s AND ({due_expr} IS NULL OR {due_expr} >= %s)""", (sid, class_id, start))
        done = missed = pending = 0; got = tot = 0.0
        for r in cur.fetchall():
            if r["sub_id"]:
                done += 1
                if r["marks"] is not None and r["total_marks"]:
                    got += float(r["marks"]); tot += float(r["total_marks"])
            elif r["due"] is not None and r["due"] < today:
                missed += 1
            else:
                pending += 1
        return {"done": done, "missed": missed, "pending": pending, "avg": _f(100 * got / tot) if tot else None}
    cols_q = _cols(cur, "quiz_submissions")
    assignments = work("assignments", "assignment_submissions", "assignment_id", "t.due_date")
    quizzes = work("quizzes", "quiz_submissions", "quiz_id", "t.due_date::date") if cols_q else None

    return ok(data={
        "today": str(today), "academic_year": ay["name"] if ay else None,
        "student": {"id": sid, "name": f"{st['first_name']} {st['last_name']}", "class": _label(cls.get("name"), cls.get("section")) if cls else ""},
        "children": children,
        "attendance": {"pct": att_pct, "days": days, "totals": totals, "months": [months[k] for k in sorted(months)]},
        "results_withheld_months": held,
        "latest": latest_card, "exams": exams_out, "subjects": subjects_out,
        "assignments": assignments, "quizzes": quizzes,
        "fees": _fee_summary(cur, sid, today),
    })


# ---------------------------------------------------------------- admin / superadmin

def _fee_sql(cur):
    """SQL pieces for invoice net / paid amount and the payments table, from the columns that exist."""
    pt = _pay_table(cur)
    fc, pc = _cols(cur, "fee_invoices"), (_cols(cur, pt) if pt else set())
    net = "fi.net_amount" if "net_amount" in fc else "(COALESCE(fi.amount,0) - COALESCE(fi.discount,0) + COALESCE(fi.fine,0))"
    ver = " AND COALESCE(p.is_verified, TRUE)" if "is_verified" in pc else ""
    pay_date = "paid_at" if "paid_at" in pc else ("payment_date" if "payment_date" in pc else None)
    if "paid_amount" in fc:
        paid = "COALESCE(fi.paid_amount,0)"
    elif {"invoice_id", "amount_paid"} <= pc:
        paid = f"COALESCE((SELECT SUM(p.amount_paid) FROM {pt} p WHERE p.invoice_id=fi.id{ver}),0)"
    else:
        paid = f"CASE WHEN fi.status='paid' THEN {net} ELSE 0 END"
    payments = {"ok": {"invoice_id", "amount_paid"} <= pc and pay_date is not None, "date": pay_date, "ver": ver, "table": pt}
    return net, paid, payments


def _months_back(today, n):
    """['YYYY-MM', ...] for the last n months, oldest first."""
    y, m, out = today.year, today.month, []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0: y, m = y - 1, 12
    return out[::-1]


@router.get("/admin")
def admin_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                    db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if _role(claims) not in ("admin", "superadmin"):
        fail("This dashboard is for administrators.", 403)
    cur = get_cur(db)
    today = get_processing_date(db)
    months = _months_back(today, 12)
    start30 = today - timedelta(days=29)
    cur.execute("SELECT id, name FROM campuses WHERE (%s::int IS NULL OR id=%s) ORDER BY id", (campus_id, campus_id))
    campuses = [dict(r) for r in cur.fetchall()]
    cids = [c["id"] for c in campuses]
    cname = {c["id"]: c["name"] for c in campuses}

    # ---- tiles
    cur.execute("SELECT COUNT(*) AS n FROM students WHERE status='active' AND campus_id = ANY(%s)", (cids or [0],))
    n_students = cur.fetchone()["n"]
    cur.execute("SELECT COUNT(*) AS n FROM staff WHERE status='active' AND campus_id = ANY(%s)", (cids or [0],))
    n_staff = cur.fetchone()["n"]
    cur.execute("SELECT id FROM classes WHERE campus_id = ANY(%s)", (cids or [0],))
    all_class_ids = [r["id"] for r in cur.fetchall()]
    today_att = student_attendance_daily(cur, all_class_ids, today, today)

    # ---- enrollment by class (one bar per class level, split by campus)
    cur.execute("""SELECT c.campus_id, c.name, MIN(c.level) AS level, COUNT(s.id) AS n
                   FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.status='active'
                   WHERE c.campus_id = ANY(%s) GROUP BY c.campus_id, c.name ORDER BY MIN(c.level) NULLS LAST, c.name""", (cids or [0],))
    enroll, order = {}, []
    for r in cur.fetchall():
        if r["name"] not in enroll:
            enroll[r["name"]] = {"class": r["name"]}; order.append(r["name"])
        enroll[r["name"]][cname[r["campus_id"]]] = r["n"]
    enrollment = {"rows": [enroll[k] for k in order], "series": [c["name"] for c in campuses]}

    # ---- admissions vs withdrawals, last 12 months
    cur.execute("""SELECT to_char(admission_date,'YYYY-MM') AS m, COUNT(*) AS n FROM students
                   WHERE campus_id = ANY(%s) AND admission_date IS NOT NULL AND to_char(admission_date,'YYYY-MM') >= %s
                   GROUP BY 1""", (cids or [0], months[0]))
    adm = {r["m"]: r["n"] for r in cur.fetchall()}
    wc = _cols(cur, "withdrawal_requests")
    wdate = "COALESCE(w.effective_date, w.principal_at::date)" if {"effective_date", "principal_at"} <= wc else "w.requested_at::date"
    cur.execute(f"""SELECT to_char({wdate},'YYYY-MM') AS m, COUNT(*) AS n FROM withdrawal_requests w
                    JOIN students s ON s.id=w.student_id
                    WHERE s.campus_id = ANY(%s) AND w.status IN ('approved','completed','withdrawn') AND {wdate} IS NOT NULL
                    GROUP BY 1""", (cids or [0],))
    wd = {r["m"]: r["n"] for r in cur.fetchall()}
    movement = [{"month": m, "admissions": adm.get(m, 0), "withdrawals": wd.get(m, 0)} for m in months]

    # ---- fees: billed vs collected per month, outstanding per campus
    net, paid, pay = _fee_sql(cur)
    live = _live_invoice(cur)
    pt = pay["table"]
    fee = None
    if _cols(cur, "fee_invoices"):
        cur.execute(f"""SELECT fi.month_year AS m, SUM({net}) AS billed FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
                        WHERE {live} AND s.campus_id = ANY(%s) AND fi.month_year >= %s GROUP BY 1""", (cids or [0], months[0]))
        billed = {r["m"]: float(r["billed"] or 0) for r in cur.fetchall()}
        if pay["ok"]:
            cur.execute(f"""SELECT to_char(p.{pay['date']},'YYYY-MM') AS m, SUM(p.amount_paid) AS got
                            FROM {pt} p JOIN fee_invoices fi ON fi.id=p.invoice_id JOIN students s ON s.id=fi.student_id
                            WHERE {live} AND s.campus_id = ANY(%s){pay['ver']} AND to_char(p.{pay['date']},'YYYY-MM') >= %s GROUP BY 1""",
                        (cids or [0], months[0]))
        else:
            cur.execute(f"""SELECT fi.month_year AS m, SUM({paid}) AS got FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
                            WHERE {live} AND s.campus_id = ANY(%s) AND fi.month_year >= %s GROUP BY 1""", (cids or [0], months[0]))
        got = {r["m"]: float(r["got"] or 0) for r in cur.fetchall()}
        collection = [{"month": m, "billed": round(billed.get(m, 0)), "collected": round(got.get(m, 0)),
                       "rate": _f(100.0 * got.get(m, 0) / billed[m]) if billed.get(m) else None} for m in months]
        cur.execute(f"""SELECT s.campus_id,
                               SUM(GREATEST({net} - {paid}, 0)) FILTER (WHERE {live} AND fi.due_date < %s) AS overdue,
                               SUM(GREATEST({net} - {paid}, 0)) FILTER (WHERE fi.due_date >= %s OR fi.due_date IS NULL) AS upcoming
                        FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
                        WHERE s.campus_id = ANY(%s) AND fi.status <> 'paid' GROUP BY s.campus_id""", (today, today, cids or [0]))
        out = {r["campus_id"]: r for r in cur.fetchall()}
        outstanding = [{"campus": cname[c], "overdue": round(float((out.get(c) or {}).get("overdue") or 0)),
                        "upcoming": round(float((out.get(c) or {}).get("upcoming") or 0))} for c in cids]
        this_m = months[-1]
        fee = {"collection": collection, "outstanding": outstanding,
               "collected_this_month": round(got.get(this_m, 0)),
               "outstanding_total": sum(o["overdue"] + o["upcoming"] for o in outstanding),
               "overdue_total": sum(o["overdue"] for o in outstanding)}

    # ---- attendance trend, one line per campus
    att_pts = {}
    for c in campuses:
        cur.execute("SELECT id FROM classes WHERE campus_id=%s", (c["id"],))
        ids = [r["id"] for r in cur.fetchall()]
        for p in student_attendance_daily(cur, ids, start30, today):
            att_pts.setdefault(p["date"], {"date": p["date"]})[c["name"]] = p["pct"]
    attendance = {"points": [att_pts[k] for k in sorted(att_pts)], "series": [c["name"] for c in campuses]}

    # ---- staff by department
    dc = _cols(cur, "departments")
    if "name" in dc:
        cur.execute("""SELECT COALESCE(d.name, 'Unassigned') AS dept, COUNT(*) AS n FROM staff s
                       LEFT JOIN departments d ON d.id=s.department_id
                       WHERE s.status='active' AND s.campus_id = ANY(%s) GROUP BY 1 ORDER BY 2 DESC""", (cids or [0],))
    else:
        cur.execute("""SELECT COALESCE(s.employment_type, 'Staff') AS dept, COUNT(*) AS n FROM staff s
                       WHERE s.status='active' AND s.campus_id = ANY(%s) GROUP BY 1 ORDER BY 2 DESC""", (cids or [0],))
    staff = [{"dept": r["dept"], "staff": r["n"]} for r in cur.fetchall()]

    return ok(data={
        "today": str(today), "scope": cname[campus_id] if campus_id in cname else "All campuses",
        "campuses": [c["name"] for c in campuses],
        "tiles": {"students": n_students, "staff": n_staff,
                  "attendance_today": today_att[0]["pct"] if today_att else None,
                  "collected_this_month": fee["collected_this_month"] if fee else None,
                  "outstanding": fee["outstanding_total"] if fee else None,
                  "overdue": fee["overdue_total"] if fee else None},
        "enrollment": enrollment, "movement": movement, "fees": fee, "attendance": attendance, "staff": staff,
    })


# ---------------------------------------------------------------- finance officer

@router.get("/finance")
def finance_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                      db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _allow(claims, "finance_officer")
    cur = get_cur(db)
    today = get_processing_date(db)
    months = _months_back(today, 12)
    pt = _pay_table(cur)
    fc, pc = _cols(cur, "fee_invoices"), (_cols(cur, pt) if pt else set())
    if not fc:
        fail("Fee invoices are not set up.", 404)
    net, paid, pay = _fee_sql(cur)
    live = _live_invoice(cur)
    scope = "(%s::int IS NULL OR s.campus_id=%s)"
    sc = (campus_id, campus_id)

    # ---- billed vs collected per month (same rules as the admin dashboard)
    cur.execute(f"""SELECT fi.month_year AS m, SUM({net}) AS billed FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
                    WHERE {live} AND {scope} AND fi.month_year >= %s GROUP BY 1""", sc + (months[0],))
    billed = {r["m"]: float(r["billed"] or 0) for r in cur.fetchall()}
    if pay["ok"]:
        cur.execute(f"""SELECT to_char(p.{pay['date']},'YYYY-MM') AS m, SUM(p.amount_paid) AS got
                        FROM {pt} p JOIN fee_invoices fi ON fi.id=p.invoice_id JOIN students s ON s.id=fi.student_id
                        WHERE {live} AND {scope}{pay['ver']} AND to_char(p.{pay['date']},'YYYY-MM') >= %s GROUP BY 1""", sc + (months[0],))
    else:
        cur.execute(f"""SELECT fi.month_year AS m, SUM({paid}) AS got FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
                        WHERE {live} AND {scope} AND fi.month_year >= %s GROUP BY 1""", sc + (months[0],))
    got = {r["m"]: float(r["got"] or 0) for r in cur.fetchall()}
    collection = [{"month": m, "billed": round(billed.get(m, 0)), "collected": round(got.get(m, 0)),
                   "rate": _f(100.0 * got.get(m, 0) / billed[m]) if billed.get(m) else None} for m in months]

    # ---- collection by payment method (last 12 months, verified)
    methods = None
    if pay["ok"] and "method" in pc:
        cur.execute(f"""SELECT COALESCE(NULLIF(p.method,''),'other') AS method, SUM(p.amount_paid) AS amt, COUNT(*) AS n
                        FROM {pt} p JOIN fee_invoices fi ON fi.id=p.invoice_id JOIN students s ON s.id=fi.student_id
                        WHERE {live} AND {scope}{pay['ver']} AND to_char(p.{pay['date']},'YYYY-MM') >= %s
                        GROUP BY 1 ORDER BY 2 DESC""", sc + (months[0],))
        methods = [{"method": r["method"].replace("_", " ").title(), "amount": round(float(r["amt"] or 0)), "payments": r["n"]}
                   for r in cur.fetchall()]

    # ---- pending verification (payments recorded but not yet verified)
    pending_ver = None
    if {"invoice_id", "amount_paid", "is_verified"} <= pc:
        cur.execute(f"""SELECT COUNT(*) AS n, COALESCE(SUM(p.amount_paid),0) AS amt
                        FROM {pt} p JOIN fee_invoices fi ON fi.id=p.invoice_id JOIN students s ON s.id=fi.student_id
                        WHERE {live} AND {scope} AND NOT COALESCE(p.is_verified, FALSE)""", sc)
        r = cur.fetchone()
        pending_ver = {"count": r["n"], "amount": round(float(r["amt"] or 0))}

    # ---- outstanding balances: aging + per student
    cur.execute(f"""SELECT fi.student_id, fi.due_date, fi.month_year, GREATEST({net} - {paid}, 0) AS bal,
                           s.first_name, s.last_name, s.enrollment_no, s.class_id
                    FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
                    WHERE {live} AND {scope} AND fi.status <> 'paid'""", sc)
    buckets = {"Not yet due": 0.0, "1-30 days": 0.0, "31-60 days": 0.0, "61-90 days": 0.0, "90+ days": 0.0}
    per_student = {}
    for r in cur.fetchall():
        bal = float(r["bal"] or 0)
        if bal <= 0:
            continue
        due = r["due_date"]
        if due is None or due >= today:
            buckets["Not yet due"] += bal
            continue
        days = (today - due).days
        key = "1-30 days" if days <= 30 else "31-60 days" if days <= 60 else "61-90 days" if days <= 90 else "90+ days"
        buckets[key] += bal
        p = per_student.setdefault(r["student_id"], {"student": f"{r['first_name']} {r['last_name']}", "enrollment_no": r["enrollment_no"],
                                                     "class_id": r["class_id"], "amount": 0.0, "months": set(), "oldest": due})
        p["amount"] += bal
        p["months"].add(r["month_year"] or str(due)[:7])
        p["oldest"] = min(p["oldest"], due)
    aging = [{"bucket": k, "amount": round(v)} for k, v in buckets.items()]
    cls_ids = list({p["class_id"] for p in per_student.values() if p["class_id"]})
    cur.execute("SELECT id, name, section FROM classes WHERE id = ANY(%s)", (cls_ids or [0],))
    cl = {r["id"]: _label(r["name"], r["section"]) for r in cur.fetchall()}
    defaulters = sorted(({"student": p["student"], "enrollment_no": p["enrollment_no"], "class": cl.get(p["class_id"], ""),
                          "amount": round(p["amount"]), "months": len(p["months"]), "oldest_due": str(p["oldest"]),
                          "days": (today - p["oldest"]).days} for p in per_student.values()),
                        key=lambda x: (-x["months"], -x["amount"]))[:15]

    # ---- discounts vs late fees per invoice month
    adjustments = None
    if "discount" in fc or "fine" in fc:
        d_expr = "SUM(COALESCE(fi.discount,0))" if "discount" in fc else "0"
        f_expr = "SUM(COALESCE(fi.fine,0))" if "fine" in fc else "0"
        cur.execute(f"""SELECT fi.month_year AS m, {d_expr} AS disc, {f_expr} AS fine FROM fee_invoices fi
                        JOIN students s ON s.id=fi.student_id WHERE {live} AND {scope} AND fi.month_year >= %s GROUP BY 1""", sc + (months[0],))
        adj = {r["m"]: r for r in cur.fetchall()}
        adjustments = [{"month": m, "discount": round(float((adj.get(m) or {}).get("disc") or 0)),
                        "fine": round(float((adj.get(m) or {}).get("fine") or 0))} for m in months]

    this_m = collection[-1]
    overdue_total = sum(a["amount"] for a in aging if a["bucket"] != "Not yet due")
    return ok(data={
        "today": str(today),
        "tiles": {"billed_this_month": this_m["billed"], "collected_this_month": this_m["collected"], "rate_this_month": this_m["rate"],
                  "outstanding": sum(a["amount"] for a in aging), "overdue": overdue_total,
                  "defaulters": len(per_student), "pending_verification": pending_ver},
        "collection": collection, "methods": methods, "aging": aging, "adjustments": adjustments, "defaulters": defaulters,
    })


# ---------------------------------------------------------------- HR

# staff_daily_attendance_status.status values: present, absent, leave, on_leave, weekly_off
STAFF_PRESENT = ("present",)
STAFF_LEAVE = ("leave", "on_leave")
STAFF_OFF = ("weekly_off",)          # not a working day - left out of the percentage


@router.get("/hr")
def hr_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                 db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _allow(claims, "hr")
    cur = get_cur(db)
    today = get_processing_date(db)
    months = _months_back(today, 12)
    start30 = today - timedelta(days=29)
    cur.execute("SELECT id, user_id, department_id, joining_date FROM staff WHERE status='active' AND (%s::int IS NULL OR campus_id=%s)",
                (campus_id, campus_id))
    staff = [dict(r) for r in cur.fetchall()]
    sids = [s["id"] for s in staff] or [0]
    uids = [s["user_id"] for s in staff if s["user_id"]] or [0]

    cur.execute("SELECT COUNT(DISTINCT staff_id) AS n FROM staff_attendance_sessions WHERE staff_id = ANY(%s) AND clock_in_at::date=%s", (sids, today))
    present_today = cur.fetchone()["n"]
    cur.execute("""SELECT COUNT(DISTINCT user_id) AS n FROM staff_leave_requests
                   WHERE user_id = ANY(%s) AND lower(status)='approved' AND %s BETWEEN from_date AND to_date""", (uids, today))
    on_leave = cur.fetchone()["n"]
    cur.execute("SELECT COUNT(*) AS n FROM staff_leave_requests WHERE user_id = ANY(%s) AND lower(status)='pending'", (uids,))
    pend_leave = cur.fetchone()["n"]
    cur.execute("""SELECT COUNT(*) AS n FROM resignation_requests WHERE staff_id = ANY(%s)
                   AND status NOT IN ('rejected','withdrawn','completed')""", (sids,))
    resign_open = cur.fetchone()["n"]
    try:
        cur.execute("SELECT COUNT(*) AS n FROM staff_attendance_correction_requests WHERE staff_id = ANY(%s) AND lower(status)='pending'", (sids,))
        corrections = cur.fetchone()["n"]
    except Exception:
        db.rollback(); corrections = None

    # attendance trend from the finalized daily status
    cur.execute("""SELECT status_date AS d,
                          COUNT(*) FILTER (WHERE NOT (lower(status) = ANY(%s))) AS working,
                          COUNT(*) FILTER (WHERE lower(status) = ANY(%s)) AS here,
                          COUNT(*) FILTER (WHERE lower(status) = ANY(%s)) AS on_leave,
                          COUNT(*) FILTER (WHERE lower(status) = 'absent') AS absent,
                          COUNT(*) FILTER (WHERE is_late AND lower(status) = ANY(%s)) AS late
                   FROM staff_daily_attendance_status WHERE staff_id = ANY(%s) AND status_date BETWEEN %s AND %s
                   GROUP BY 1 ORDER BY 1""",
                (list(STAFF_OFF), list(STAFF_PRESENT), list(STAFF_LEAVE), list(STAFF_PRESENT), sids, start30, today))
    # present % of staff who were due to work that day (weekly-off excluded); all-off days are skipped
    trend = [{"date": str(r["d"]), "pct": _f(100.0 * r["here"] / r["working"]), "late": r["late"],
              "on_leave": r["on_leave"], "absent": r["absent"]}
             for r in cur.fetchall() if r["working"]]

    # leave usage by type, last 6 months (approved)
    six = months[-6:]
    cur.execute("""SELECT to_char(lr.from_date,'YYYY-MM') AS m, COALESCE(lt.name,'Other') AS t, SUM(lr.total_days) AS days
                   FROM staff_leave_requests lr LEFT JOIN leave_types lt ON lt.id=lr.leave_type_id
                   WHERE lr.user_id = ANY(%s) AND lower(lr.status)='approved' AND to_char(lr.from_date,'YYYY-MM') >= %s
                   GROUP BY 1, 2""", (uids, six[0]))
    lv, types = {m: {"month": m} for m in six}, []
    for r in cur.fetchall():
        if r["m"] in lv:
            lv[r["m"]][r["t"]] = _f(r["days"])
            if r["t"] not in types: types.append(r["t"])
    leave = {"rows": [lv[m] for m in six], "types": types}

    # headcount by department
    cur.execute("""SELECT COALESCE(d.name,'Unassigned') AS dept, COUNT(*) AS n FROM staff s LEFT JOIN departments d ON d.id=s.department_id
                   WHERE s.id = ANY(%s) GROUP BY 1 ORDER BY 2 DESC""", (sids,))
    departments = [{"dept": r["dept"], "staff": r["n"]} for r in cur.fetchall()]

    # joiners vs leavers, last 12 months
    cur.execute("""SELECT to_char(joining_date,'YYYY-MM') AS m, COUNT(*) AS n FROM staff
                   WHERE (%s::int IS NULL OR campus_id=%s) AND joining_date IS NOT NULL AND to_char(joining_date,'YYYY-MM') >= %s
                   GROUP BY 1""", (campus_id, campus_id, months[0]))
    joined = {r["m"]: r["n"] for r in cur.fetchall()}
    cur.execute("""SELECT to_char(COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day),'YYYY-MM') AS m, COUNT(*) AS n
                   FROM resignation_requests rr JOIN staff s ON s.id=rr.staff_id
                   WHERE (%s::int IS NULL OR s.campus_id=%s) AND rr.status NOT IN ('rejected','withdrawn','submitted')
                     AND COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day) IS NOT NULL
                   GROUP BY 1""", (campus_id, campus_id))
    left = {r["m"]: r["n"] for r in cur.fetchall()}
    movement = [{"month": m, "joined": joined.get(m, 0), "left": left.get(m, 0)} for m in months]

    # payroll cost per run (last 12 months)
    cur.execute("""SELECT pr.year, pr.month, pr.status, SUM(ps.gross_earnings) AS gross, SUM(ps.net_pay) AS net,
                          SUM(ps.total_deductions) AS ded, COUNT(ps.id) AS slips
                   FROM payroll_runs pr LEFT JOIN payroll_payslips ps ON ps.payroll_run_id=pr.id
                   WHERE (%s::int IS NULL OR pr.campus_id=%s) AND (pr.year*100 + pr.month) >= %s
                   GROUP BY pr.year, pr.month, pr.status ORDER BY pr.year, pr.month""",
                (campus_id, campus_id, int(months[0].replace("-", ""))))
    payroll = [{"month": f"{r['year']:04d}-{r['month']:02d}", "gross": round(float(r["gross"] or 0)), "net": round(float(r["net"] or 0)),
                "deductions": round(float(r["ded"] or 0)), "status": r["status"], "slips": r["slips"]} for r in cur.fetchall()]

    return ok(data={"today": str(today),
                    "tiles": {"staff": len(staff), "present_today": present_today, "on_leave_today": on_leave,
                              "pending_leaves": pend_leave, "open_resignations": resign_open, "pending_corrections": corrections},
                    "attendance": trend, "leave": leave, "departments": departments, "movement": movement, "payroll": payroll})


# ---------------------------------------------------------------- librarian

@router.get("/library")
def library_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                      db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _allow(claims, "librarian")
    cur = get_cur(db)
    today = get_processing_date(db)
    months = _months_back(today, 12)
    bscope, bsc = "(%s::int IS NULL OR b.campus_id=%s)", (campus_id, campus_id)

    cur.execute(f"SELECT COUNT(*) AS n FROM library_books b WHERE COALESCE(b.is_active,TRUE) AND {bscope}", bsc)
    titles = cur.fetchone()["n"]
    cur.execute(f"SELECT COUNT(*) AS n FROM library_book_copies c JOIN library_books b ON b.id=c.book_id WHERE {bscope}", bsc)
    copies = cur.fetchone()["n"]
    cur.execute("SELECT COUNT(*) AS n FROM library_issue_transactions")
    use_tx = cur.fetchone()["n"] > 0

    if use_tx:
        src = f"""FROM library_issue_transactions t JOIN library_book_copies c ON c.id=t.copy_id
                  JOIN library_books b ON b.id=c.book_id WHERE {bscope}"""
        issued_col, returned_col = "t.issued_at", "t.returned_at"
    else:
        src = f"FROM library_issues t JOIN library_books b ON b.id=t.book_id WHERE {bscope}"
        issued_col, returned_col = "t.issued_at", "t.returned_at"

    cur.execute(f"SELECT to_char({issued_col},'YYYY-MM') AS m, COUNT(*) AS n {src} AND to_char({issued_col},'YYYY-MM') >= %s GROUP BY 1",
                bsc + (months[0],))
    iss = {r["m"]: r["n"] for r in cur.fetchall()}
    cur.execute(f"SELECT to_char({returned_col},'YYYY-MM') AS m, COUNT(*) AS n {src} AND {returned_col} IS NOT NULL AND to_char({returned_col},'YYYY-MM') >= %s GROUP BY 1",
                bsc + (months[0],))
    ret = {r["m"]: r["n"] for r in cur.fetchall()}
    flow = [{"month": m, "issued": iss.get(m, 0), "returned": ret.get(m, 0)} for m in months]

    cur.execute(f"SELECT COUNT(*) AS n {src} AND {returned_col} IS NULL", bsc)
    out_now = cur.fetchone()["n"]

    # overdue now, with who has it
    if use_tx:
        cur.execute(f"""SELECT b.title, t.due_date, u.first_name, u.last_name, m.member_type, m.library_card_no
                        FROM library_issue_transactions t
                        JOIN library_book_copies c ON c.id=t.copy_id
                        JOIN library_books b ON b.id=c.book_id
                        LEFT JOIN library_members m ON m.id=t.member_id
                        LEFT JOIN users u ON u.id=m.user_id
                        WHERE {bscope} AND t.returned_at IS NULL AND t.due_date < %s
                        ORDER BY t.due_date LIMIT 12""", bsc + (today,))
        overdue = [{"title": r["title"], "due": str(r["due_date"]), "days": (today - r["due_date"]).days,
                    "who": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or (r["library_card_no"] or "-"),
                    "type": r["member_type"]} for r in cur.fetchall()]
    else:
        cur.execute(f"""SELECT b.title, t.due_date, s.first_name, s.last_name FROM library_issues t
                        JOIN library_books b ON b.id=t.book_id LEFT JOIN students s ON s.id=t.student_id
                        WHERE {bscope} AND t.returned_at IS NULL AND t.due_date < %s ORDER BY t.due_date LIMIT 12""", bsc + (today,))
        overdue = [{"title": r["title"], "due": str(r["due_date"]), "days": (today - r["due_date"]).days,
                    "who": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(), "type": "student"} for r in cur.fetchall()]
    cur.execute(f"SELECT COUNT(*) AS n {src} AND {returned_col} IS NULL AND t.due_date < %s", bsc + (today,))
    overdue_n = cur.fetchone()["n"]

    # most-borrowed categories, last 12 months
    if use_tx:
        cat_from = """FROM library_issue_transactions t JOIN library_book_copies c ON c.id=t.copy_id
                      JOIN library_books b ON b.id=c.book_id LEFT JOIN library_categories cat ON cat.id=b.category_id"""
    else:
        cat_from = """FROM library_issues t JOIN library_books b ON b.id=t.book_id
                      LEFT JOIN library_categories cat ON cat.id=b.category_id"""
    cur.execute(f"""SELECT COALESCE(cat.name,'Uncategorised') AS cat, COUNT(*) AS n {cat_from}
                    WHERE {bscope} AND to_char({issued_col},'YYYY-MM') >= %s GROUP BY 1 ORDER BY 2 DESC LIMIT 8""", bsc + (months[0],))
    categories = [{"category": r["cat"], "issues": r["n"]} for r in cur.fetchall()]

    # fines: collected vs waived per month, and still pending
    fines = pending_fines = None
    if use_tx:
        cur.execute(f"""SELECT to_char(fp.paid_at,'YYYY-MM') AS m,
                               SUM(fp.amount_paid) FILTER (WHERE NOT COALESCE(fp.is_waived,FALSE)) AS paid,
                               SUM(fp.amount_paid) FILTER (WHERE COALESCE(fp.is_waived,FALSE)) AS waived
                        FROM library_fine_payments fp JOIN library_issue_transactions t ON t.id=fp.transaction_id
                        JOIN library_book_copies c ON c.id=t.copy_id JOIN library_books b ON b.id=c.book_id
                        WHERE {bscope} AND to_char(fp.paid_at,'YYYY-MM') >= %s GROUP BY 1""", bsc + (months[0],))
        fm = {r["m"]: r for r in cur.fetchall()}
        fines = [{"month": m, "collected": round(float((fm.get(m) or {}).get("paid") or 0)),
                  "waived": round(float((fm.get(m) or {}).get("waived") or 0))} for m in months]
        cur.execute(f"""SELECT COALESCE(SUM(GREATEST(t.fine_amount - COALESCE((SELECT SUM(fp.amount_paid) FROM library_fine_payments fp
                                                                            WHERE fp.transaction_id=t.id), 0), 0)), 0) AS due
                        {src} AND COALESCE(t.fine_amount,0) > 0 AND lower(COALESCE(t.fine_status,'')) NOT IN ('paid','waived','cleared')""", bsc)
        pending_fines = round(float(cur.fetchone()["due"] or 0))

    cur.execute("SELECT COALESCE(member_type,'other') AS t, COUNT(*) AS n FROM library_members WHERE lower(COALESCE(status,'active'))='active' GROUP BY 1")
    members = [{"type": r["t"].title(), "members": r["n"]} for r in cur.fetchall()]

    return ok(data={"today": str(today), "source": "transactions" if use_tx else "issues",
                    "tiles": {"titles": titles, "copies": copies, "issued_now": out_now, "overdue": overdue_n,
                              "pending_fines": pending_fines, "members": sum(m["members"] for m in members)},
                    "flow": flow, "overdue": overdue, "categories": categories, "fines": fines, "members": members})


# ---------------------------------------------------------------- procurement

@router.get("/procurement")
def procurement_dashboard(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                          db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _allow(claims, "procurement")
    cur = get_cur(db)
    today = get_processing_date(db)
    months = _months_back(today, 12)
    # requisitions belong to a department's campus; POs to their requisition's campus (else the vendor's)
    pr_scope = "(%s::int IS NULL OR d.campus_id=%s)"
    po_scope = "(%s::int IS NULL OR COALESCE(d.campus_id, v.campus_id)=%s)"
    sc = (campus_id, campus_id)
    po_from = """FROM purchase_orders po LEFT JOIN purchase_requisitions pr ON pr.id=po.pr_id
                 LEFT JOIN departments d ON d.id=pr.department_id LEFT JOIN procurement_vendors v ON v.id=po.vendor_id"""

    cur.execute(f"""SELECT pr.status, COUNT(*) AS n, COALESCE(SUM(pr.total_estimated_amount),0) AS amt
                    FROM purchase_requisitions pr LEFT JOIN departments d ON d.id=pr.department_id
                    WHERE {pr_scope} GROUP BY 1 ORDER BY 2 DESC""", sc)
    req_status = [{"status": (r["status"] or "unknown").replace("_", " ").title(), "raw": r["status"], "count": r["n"],
                   "amount": round(float(r["amt"] or 0))} for r in cur.fetchall()]
    closed = ("approved", "converted_to_po", "rejected", "cancelled", "draft")
    open_reqs = sum(r["count"] for r in req_status if (r["raw"] or "") not in closed)

    cur.execute(f"""SELECT po.status, COUNT(*) AS n FROM purchase_orders po LEFT JOIN purchase_requisitions pr ON pr.id=po.pr_id
                    LEFT JOIN departments d ON d.id=pr.department_id LEFT JOIN procurement_vendors v ON v.id=po.vendor_id
                    WHERE {po_scope} GROUP BY 1 ORDER BY 2 DESC""", sc)
    po_status = [{"status": (r["status"] or "unknown").replace("_", " ").title(), "raw": r["status"], "count": r["n"]} for r in cur.fetchall()]
    open_pos = sum(r["count"] for r in po_status if (r["raw"] or "") not in ("completed", "cancelled", "closed", "received"))

    cur.execute(f"""SELECT to_char(COALESCE(po.issued_at, po.created_at),'YYYY-MM') AS m, SUM(po.total_amount) AS amt, COUNT(*) AS n
                    {po_from} WHERE {po_scope} AND COALESCE(po.status,'') <> 'cancelled'
                      AND to_char(COALESCE(po.issued_at, po.created_at),'YYYY-MM') >= %s GROUP BY 1""", sc + (months[0],))
    pm = {r["m"]: r for r in cur.fetchall()}
    po_value = [{"month": m, "value": round(float((pm.get(m) or {}).get("amt") or 0)), "orders": (pm.get(m) or {}).get("n") or 0} for m in months]

    cur.execute(f"""SELECT COALESCE(v.name,'Unknown vendor') AS vendor, SUM(po.total_amount) AS amt
                    {po_from} WHERE {po_scope} AND COALESCE(po.status,'') <> 'cancelled'
                      AND to_char(COALESCE(po.issued_at, po.created_at),'YYYY-MM') >= %s
                    GROUP BY 1 ORDER BY 2 DESC LIMIT 8""", sc + (months[0],))
    vendors = [{"vendor": r["vendor"], "amount": round(float(r["amt"] or 0))} for r in cur.fetchall()]

    cur.execute(f"""SELECT COALESCE(d.name,'No department') AS dept, COUNT(*) AS n, COALESCE(SUM(pr.total_estimated_amount),0) AS amt
                    FROM purchase_requisitions pr LEFT JOIN departments d ON d.id=pr.department_id
                    WHERE {pr_scope} AND to_char(pr.created_at,'YYYY-MM') >= %s GROUP BY 1 ORDER BY 3 DESC LIMIT 8""", sc + (months[0],))
    by_dept = [{"dept": r["dept"], "requests": r["n"], "amount": round(float(r["amt"] or 0))} for r in cur.fetchall()]

    cur.execute("""SELECT item_name, current_stock, min_stock, unit FROM procurement_items
                   WHERE COALESCE(is_active,TRUE) AND min_stock IS NOT NULL AND COALESCE(current_stock,0) < min_stock
                     AND (%s::int IS NULL OR campus_id=%s) ORDER BY (min_stock - COALESCE(current_stock,0)) DESC LIMIT 10""", sc)
    low_stock = [{"item": r["item_name"], "stock": r["current_stock"] or 0, "min": r["min_stock"], "unit": r["unit"]} for r in cur.fetchall()]

    return ok(data={"today": str(today),
                    "tiles": {"open_requisitions": open_reqs, "open_pos": open_pos,
                              "po_value_this_month": po_value[-1]["value"], "low_stock": len(low_stock)},
                    "requisitions": req_status, "purchase_orders": po_status, "po_value": po_value,
                    "vendors": vendors, "by_department": by_dept, "low_stock": low_stock})


# ---------------------------------------------------------------- hero banner: who am I

ROLE_LABEL = {"superadmin": "Super Administrator", "admin": "Administrator", "principal": "Principal",
              "academic_coordinator": "Academic Coordinator", "teacher": "Teacher", "student": "Student",
              "parent": "Parent", "finance_officer": "Finance Officer", "hr": "Human Resources",
              "librarian": "Librarian", "procurement": "Procurement"}


@router.get("/me")
def dashboard_me(user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims),
                 db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Identity line for the dashboard banner: name, role, designation/department, class, campus, school."""
    cur = get_cur(db)
    role = _role(claims)
    uc = _cols(cur, "users")
    name = None
    if {"first_name", "last_name"} <= uc:
        cur.execute("SELECT first_name, last_name FROM users WHERE id=%s", (user_id,))
        r = cur.fetchone()
        if r: name = f"{r['first_name'] or ''} {r['last_name'] or ''}".strip()
    if not name and "name" in uc:
        cur.execute("SELECT name FROM users WHERE id=%s", (user_id,))
        r = cur.fetchone()
        if r: name = r["name"]
    out = {"name": name, "role": role, "role_label": ROLE_LABEL.get(role, role.replace("_", " ").title()),
           "designation": None, "department": None, "class": None, "children": None, "campus": None, "school": None}

    # staff: designation + department from the staff record
    cur.execute("""SELECT ds.name AS designation, dp.name AS department, s.campus_id, s.first_name, s.last_name
                   FROM staff s LEFT JOIN designations ds ON ds.id=s.designation_id
                   LEFT JOIN departments dp ON dp.id=s.department_id WHERE s.user_id=%s LIMIT 1""", (user_id,))
    st = cur.fetchone()
    if st:
        out["designation"], out["department"] = st["designation"], st["department"]
        out["name"] = out["name"] or f"{st['first_name'] or ''} {st['last_name'] or ''}".strip()
        campus_id = campus_id or st["campus_id"]
    if role == "student":
        cur.execute("""SELECT s.first_name, s.last_name, c.name, c.section, s.campus_id FROM students s
                       LEFT JOIN classes c ON c.id=s.class_id WHERE s.user_id=%s LIMIT 1""", (user_id,))
        r = cur.fetchone()
        if r:
            out["name"] = out["name"] or f"{r['first_name']} {r['last_name']}"
            out["class"] = _label(r["name"], r["section"]) if r["name"] else None
            campus_id = campus_id or r["campus_id"]
    if role == "parent":
        cur.execute("SELECT COUNT(*) AS n, MIN(campus_id) AS campus_id FROM students WHERE parent_id=%s AND status <> 'withdrawn'", (user_id,))
        r = cur.fetchone()
        out["children"] = r["n"]
        campus_id = campus_id or r["campus_id"]
    if campus_id:
        cur.execute("SELECT name FROM campuses WHERE id=%s", (campus_id,))
        r = cur.fetchone()
        out["campus"] = r["name"] if r else None
    elif role == "superadmin":
        out["campus"] = "All campuses"
    try:
        cur.execute("SELECT value FROM system_settings WHERE key='school_name' LIMIT 1")
        r = cur.fetchone()
        out["school"] = r["value"] if r else None
    except Exception:
        db.rollback()
    return ok(data=out)
