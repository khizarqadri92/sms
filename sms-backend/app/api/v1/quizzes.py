from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db
import psycopg2.extras, json
from datetime import datetime

bp = Blueprint("quizzes", __name__)

def get_cur():
    db = get_db()
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def serialize(rows):
    result = []
    for r in rows:
        d = dict(r)
        for k,v in d.items():
            if hasattr(v, "isoformat"): d[k] = str(v)
        result.append(d)
    return result

# ── Create quiz with questions ────────────────────────────────────
@bp.post("/")
@jwt_required_custom
@require_permission("quiz.create")
def create_quiz():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    cur = get_cur(); db = get_db()

    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return error("Teacher not found.", 403)

    required = ["class_id","subject_id","title","due_date","questions"]
    for f in required:
        if not body.get(f): return error(f"{f} is required.", 400)

    questions = body["questions"]
    if not questions or len(questions)==0: return error("At least one question required.", 400)

    # Calculate total marks
    total_marks = sum(int(q.get("marks",1)) for q in questions)

    cur.execute("""
        INSERT INTO quizzes (class_id,subject_id,teacher_id,title,description,due_date,total_marks)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (body["class_id"], body["subject_id"], t["id"], body["title"],
          body.get("description",""), body["due_date"], total_marks))
    quiz_id = cur.fetchone()["id"]

    for i, q in enumerate(questions, 1):
        correct = q.get("correct","")
        if isinstance(correct, list): correct = ",".join(correct)
        cur.execute("""
            INSERT INTO quiz_questions (quiz_id,question,option_a,option_b,option_c,option_d,
                                        correct,multi_select,marks,order_no)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (quiz_id, q["question"], q["option_a"], q["option_b"],
              q.get("option_c"), q.get("option_d"), correct,
              q.get("multi_select", False), int(q.get("marks",1)), i))
    db.commit()

    # Notify students and parents
    try:
        from app.utils.notify import send_to_class
        cur.execute("SELECT s.name AS sn, c.name AS cn, c.section FROM subjects s, classes c WHERE s.id=%s AND c.id=%s",
                    (body["subject_id"], body["class_id"]))
        row = cur.fetchone()
        sname = row["sn"] if row else "a subject"
        cname = row["cn"]+((" ("+row["section"]+")") if row and row["section"] else "") if row else ""
        send_to_class(int(body["class_id"]),
            title="New Quiz Available",
            body=f"New quiz '{body['title']}' for {sname} in {cname}. Due: {body['due_date']}.",
            ntype="info", notify_students=True, notify_parents=True, notify_teachers=False)
    except: pass

    return success(data={"id": quiz_id}, message="Quiz created.")

# ── List quizzes ───────────────────────────────────────────────────
@bp.get("/")
@jwt_required_custom
@require_permission("quiz.view")
def list_quizzes():
    class_id   = request.args.get("class_id")
    subject_id = request.args.get("subject_id")
    cur = get_cur()
    user_id = int(get_jwt_identity())
    # Get student id if applicable
    cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
    student = cur.fetchone()
    student_id = student["id"] if student else None

    cur.execute("""
        SELECT q.id, q.class_id, q.subject_id, q.teacher_id, q.title, q.description,
               q.due_date, q.total_marks, q.status, q.created_at,
               s.name AS subject_name, c.name AS class_name, c.section,
               t.first_name||' '||t.last_name AS teacher_name,
               (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id=q.id) AS question_count,
               (SELECT COUNT(*) FROM quiz_submissions WHERE quiz_id=q.id) AS submission_count,
               qs.marks AS my_marks, qs.percentage AS my_percentage, qs.submitted_at AS my_submitted_at
        FROM quizzes q
        JOIN subjects s ON s.id=q.subject_id
        JOIN classes  c ON c.id=q.class_id
        JOIN teachers t ON t.id=q.teacher_id
        LEFT JOIN quiz_submissions qs ON qs.quiz_id=q.id AND qs.student_id=%s
        WHERE (%s IS NULL OR q.class_id=%s)
          AND (%s IS NULL OR q.subject_id=%s)
        ORDER BY q.due_date DESC
    """, (student_id, class_id, class_id, subject_id, subject_id))
    rows = serialize(cur.fetchall())
    now = datetime.now().isoformat()
    for r in rows:
        r["is_expired"] = r["due_date"] < now
        r["my_submission"] = None
        if r.get("my_submitted_at"):
            r["my_submission"] = {
                "marks": r["my_marks"],
                "percentage": float(r["my_percentage"] or 0),
                "submitted_at": r["my_submitted_at"]
            }
    return success(data=rows)

# ── Teacher: my quizzes ────────────────────────────────────────────
@bp.get("/my-quizzes")
@jwt_required_custom
@require_permission("quiz.create")
def my_quizzes():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return success(data=[])
    cur.execute("""
        SELECT q.id, q.class_id, q.subject_id, q.title, q.description,
               q.due_date, q.total_marks, q.status, q.created_at,
               s.name AS subject_name, c.name AS class_name, c.section,
               (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id=q.id) AS question_count,
               (SELECT COUNT(*) FROM quiz_submissions WHERE quiz_id=q.id) AS submission_count,
               (SELECT COUNT(*) FROM students WHERE class_id=q.class_id AND status='active') AS total_students
        FROM quizzes q
        JOIN subjects s ON s.id=q.subject_id
        JOIN classes  c ON c.id=q.class_id
        WHERE q.teacher_id=%s
        ORDER BY q.due_date DESC
    """, (t["id"],))
    rows = serialize(cur.fetchall())
    now = datetime.now().isoformat()
    for r in rows: r["is_expired"] = r["due_date"] < now
    return success(data=rows)

# ── Get quiz with questions (for student to attempt) ──────────────
@bp.get("/<int:id>")
@jwt_required_custom
@require_permission("quiz.view")
def get_quiz(id):
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("""
        SELECT q.*, s.name AS subject_name, c.name AS class_name, c.section,
               t.first_name||' '||t.last_name AS teacher_name
        FROM quizzes q
        JOIN subjects s ON s.id=q.subject_id
        JOIN classes  c ON c.id=q.class_id
        JOIN teachers t ON t.id=q.teacher_id
        WHERE q.id=%s
    """, (id,))
    quiz = cur.fetchone()
    if not quiz: return error("Quiz not found.", 404)
    quiz = dict(quiz)
    quiz["due_date"] = str(quiz["due_date"])
    quiz["created_at"] = str(quiz["created_at"])
    quiz["is_expired"] = quiz["due_date"] < datetime.now().isoformat()

    cur.execute("""
        SELECT id, question, option_a, option_b, option_c, option_d,
               multi_select, marks, order_no, correct
        FROM quiz_questions WHERE quiz_id=%s ORDER BY order_no
    """, (id,))
    questions = [dict(r) for r in cur.fetchall()]

    # Check if student already submitted
    cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
    s = cur.fetchone()
    submission = None
    if s:
        cur.execute("SELECT * FROM quiz_submissions WHERE quiz_id=%s AND student_id=%s", (id, s["id"]))
        sub = cur.fetchone()
        if sub:
            submission = dict(sub)
            submission["submitted_at"] = str(submission["submitted_at"])
            submission["answers"] = submission["answers"] if isinstance(submission["answers"], dict) else {}

    # Check user role - hide correct answers only from students who haven't submitted
    cur.execute("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=%s", (user_id,))
    user_roles = [r["name"] for r in cur.fetchall()]
    is_student = "student" in user_roles and not any(r in user_roles for r in ["teacher","admin","superadmin","principal","parent"])

    # Hide correct answers from students unless submitted
    if is_student and submission is None:
        for q in questions:
            del q["correct"]

    quiz["questions"] = questions
    quiz["submission"] = submission
    return success(data=quiz)

# ── Student: submit quiz ───────────────────────────────────────────
@bp.post("/<int:id>/submit")
@jwt_required_custom
@require_permission("quiz.attempt")
def submit_quiz(id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    answers = body.get("answers", {})
    cur = get_cur(); db = get_db()

    cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
    s = cur.fetchone()
    if not s: return error("Student not found.", 403)

    cur.execute("SELECT * FROM quizzes WHERE id=%s", (id,))
    quiz = cur.fetchone()
    if not quiz: return error("Quiz not found.", 404)

    # Check if already submitted
    cur.execute("SELECT id FROM quiz_submissions WHERE quiz_id=%s AND student_id=%s", (id, s["id"]))
    if cur.fetchone(): return error("You have already submitted this quiz.", 400)

    # Get questions with correct answers
    cur.execute("SELECT * FROM quiz_questions WHERE quiz_id=%s", (id,))
    questions = cur.fetchall()

    # Use stored procedure for atomic grading + duplicate check
    cur.execute("SELECT * FROM sp_submit_quiz(%s, %s, %s::jsonb)",
                (id, s["id"], json.dumps(answers)))
    result = cur.fetchone()
    if result["error_msg"]:
        return error(result["error_msg"], 400)
    marks_obtained = int(result["marks"])
    total          = int(result["total"])
    pct            = float(result["percentage"])
    db.commit()

    # Notify teacher
    try:
        from app.utils.notify import send_notification
        cur.execute("""
            SELECT u.id AS tuid, stu.first_name, stu.last_name
            FROM quizzes qz JOIN teachers t ON t.id=qz.teacher_id
            JOIN users u ON u.id=t.user_id JOIN students stu ON stu.id=%s
            WHERE qz.id=%s
        """, (s["id"], id))
        row = cur.fetchone()
        if row:
            send_notification(row["tuid"], "Quiz Submitted",
                f"{row['first_name']} {row['last_name']} submitted '{quiz['title']}'. Score: {marks_obtained}/{total}.",
                "info")
    except: pass

    return success(data={"marks": marks_obtained, "total": total, "percentage": pct},
                   message=f"Quiz submitted! You scored {marks_obtained}/{total} ({pct}%)")

# ── Get quiz results (teacher/principal) ──────────────────────────
@bp.get("/<int:id>/results")
@jwt_required_custom
@require_permission("quiz.view")
def quiz_results(id):
    cur = get_cur()
    cur.execute("SELECT * FROM quizzes WHERE id=%s", (id,))
    quiz = cur.fetchone()
    if not quiz: return error("Quiz not found.", 404)

    cur.execute("""
        SELECT qs.id, qs.student_id, qs.marks, qs.total_marks, qs.percentage,
               qs.submitted_at, qs.answers,
               s.first_name||' '||s.last_name AS student_name, s.enrollment_no
        FROM quiz_submissions qs
        JOIN students s ON s.id=qs.student_id
        WHERE qs.quiz_id=%s
        ORDER BY qs.marks DESC
    """, (id,))
    submitted = serialize(cur.fetchall())

    # Not submitted
    cur.execute("""
        SELECT s.id AS student_id, s.first_name||' '||s.last_name AS student_name, s.enrollment_no
        FROM students s
        WHERE s.class_id=%s AND s.status='active'
          AND s.id NOT IN (SELECT student_id FROM quiz_submissions WHERE quiz_id=%s)
    """, (quiz["class_id"], id))
    not_submitted = [dict(r) for r in cur.fetchall()]

    return success(data={"quiz": dict(quiz), "submitted": submitted, "not_submitted": not_submitted})

# ── Delete quiz ────────────────────────────────────────────────────
@bp.get("/student-history")
@jwt_required_custom
@require_permission("quiz.view")
def student_quiz_history():
    from app.db.connection import get_db
    import psycopg2.extras
    student_id      = request.args.get("student_id")
    withdrawal_date = request.args.get("before_date")
    if not student_id:
        return error("student_id required", 400)
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    date_filter = "AND q.created_at::date <= %s::date" if withdrawal_date else ""
    params = [student_id, student_id]
    if withdrawal_date: params.append(withdrawal_date)
    cur.execute("""
        SELECT q.id, q.title, q.total_marks, q.created_at AS quiz_date,
               s.name AS subject_name,
               qs.marks AS score, qs.percentage, qs.submitted_at,
               CASE WHEN qs.id IS NOT NULL THEN TRUE ELSE FALSE END AS submitted
        FROM quizzes q
        LEFT JOIN subjects s ON s.id=q.subject_id
        LEFT JOIN quiz_submissions qs ON qs.quiz_id=q.id AND qs.student_id=%s::int
        WHERE q.class_id=(SELECT st.class_id FROM students st WHERE st.id=%s::int)
        """ + date_filter + """
        ORDER BY q.created_at DESC
    """, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ["quiz_date","submitted_at"]:
            if r.get(k): r[k] = str(r[k])
    return success(data=rows)


@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("quiz.create")
def delete_quiz(id):
    cur = get_cur(); db = get_db()
    cur.execute("DELETE FROM quizzes WHERE id=%s", (id,))
    db.commit()
    return success(message="Quiz deleted.")