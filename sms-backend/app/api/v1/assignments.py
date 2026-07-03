from flask import Blueprint, request, send_file, abort
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db
import psycopg2.extras, os, uuid
from datetime import date

bp = Blueprint("assignments", __name__)
UPLOAD_DIR  = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "assignments")
ALLOWED_EXT = {"pdf", "doc", "docx", "xls", "xlsx"}

def get_cur():
    db = get_db()
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# ── Create assignment (teacher) ────────────────────────────────────
@bp.post("/")
@jwt_required_custom
@require_permission("assignment.create")
def create_assignment():
    user_id = int(get_jwt_identity())
    cur = get_cur(); db = get_db()

    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return error("Teacher not found.", 403)

    # Support both JSON and multipart/form-data
    if request.form:
        body = request.form
    else:
        body = request.get_json() or {}

    required = ["class_id","subject_id","title","due_date","total_marks"]
    for f in required:
        if not body.get(f): return error(f"{f} is required.", 400)

    # Handle optional file upload
    fname = fpath = ftype = fsize = None
    if "file" in request.files and request.files["file"].filename:
        file = request.files["file"]
        ext  = file.filename.rsplit(".",1)[-1].lower() if "." in file.filename else ""
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        unique_name = f"asgn_{uuid.uuid4().hex}.{ext}"
        fp = os.path.join(UPLOAD_DIR, unique_name)
        file.save(fp)
        fname = file.filename
        fpath = unique_name
        ftype = ext
        fsize = os.path.getsize(fp)

    cur.execute("""
        INSERT INTO assignments (class_id,subject_id,teacher_id,title,description,due_date,total_marks,
                                 file_name,file_path,file_type,file_size)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (body["class_id"], body["subject_id"], t["id"], body["title"],
          body.get("description",""), body["due_date"], body["total_marks"],
          fname, fpath, ftype, fsize))
    new_id = cur.fetchone()["id"]
    db.commit()

    # Notify students and parents
    from app.utils.notify import send_to_class
    cur.execute("SELECT s.name AS sn, c.name AS cn, c.section FROM subjects s, classes c WHERE s.id=%s AND c.id=%s",
                (body["subject_id"], body["class_id"]))
    row = cur.fetchone()
    sname = row["sn"] if row else "a subject"
    cname = row["cn"]+((" ("+row["section"]+")") if row and row["section"] else "") if row else ""
    send_to_class(int(body["class_id"]),
        title="New Assignment",
        body=f"New assignment '{body['title']}' for {sname} in {cname}. Due: {body['due_date']}.",
        ntype="info", notify_students=True, notify_parents=True, notify_teachers=False)

    return success(data={"id": new_id}, message="Assignment created.")

# ── List assignments ───────────────────────────────────────────────
@bp.get("/")
@jwt_required_custom
@require_permission("assignment.view")
def list_assignments():
    user_id    = int(get_jwt_identity())
    class_id   = request.args.get("class_id")
    subject_id = request.args.get("subject_id")
    cur = get_cur()

    cur.execute("""
        SELECT a.id, a.class_id, a.subject_id, a.teacher_id, a.title, a.description,
               a.due_date, a.total_marks, a.status, a.created_at,
               a.file_name, a.file_path, a.file_type, a.file_size,
               s.name AS subject_name, c.name AS class_name, c.section,
               t.first_name||' '||t.last_name AS teacher_name,
               (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id=a.id) AS submission_count
        FROM assignments a
        JOIN subjects s  ON s.id  = a.subject_id
        JOIN classes  c  ON c.id  = a.class_id
        JOIN teachers t  ON t.id  = a.teacher_id
        WHERE (%s IS NULL OR a.class_id=%s)
          AND (%s IS NULL OR a.subject_id=%s)
        ORDER BY a.due_date DESC
    """, (class_id, class_id, subject_id, subject_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["due_date"]   = str(r["due_date"])
        r["created_at"] = str(r["created_at"])
        r["is_overdue"] = r["due_date"] < date.today().isoformat()
    return success(data=rows)

# ── Get teacher's assignments ──────────────────────────────────────
@bp.get("/my-assignments")
@jwt_required_custom
@require_permission("assignment.create")
def my_assignments():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return success(data=[])

    cur.execute("""
        SELECT a.id, a.class_id, a.subject_id, a.teacher_id, a.title, a.description,
               a.due_date, a.total_marks, a.status, a.created_at,
               a.file_name, a.file_path, a.file_type, a.file_size,
               s.name AS subject_name, c.name AS class_name, c.section,
               (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id=a.id)                      AS submission_count,
               (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id=a.id AND marks IS NOT NULL) AS graded_count,
               (SELECT COUNT(*) FROM students WHERE class_id=a.class_id AND status='active')               AS total_students
        FROM assignments a
        JOIN subjects  s ON s.id = a.subject_id
        JOIN classes   c ON c.id = a.class_id
        WHERE a.teacher_id = %s
        ORDER BY a.due_date DESC
    """, (t["id"],))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["due_date"]   = str(r["due_date"])
        r["created_at"] = str(r["created_at"])
        r["is_overdue"] = r["due_date"] < date.today().isoformat()
    return success(data=rows)

# ── Get student's assignments ──────────────────────────────────────
@bp.get("/student")
@jwt_required_custom
@require_permission("assignment.view")
def student_assignments():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT id, class_id FROM students WHERE user_id=%s", (user_id,))
    s = cur.fetchone()
    if not s: return success(data=[])

    cur.execute("""
        SELECT a.id, a.class_id, a.subject_id, a.teacher_id, a.title, a.description,
               a.due_date, a.total_marks, a.status, a.created_at,
               a.file_name AS assignment_file, a.file_path AS assignment_path,
               s.name AS subject_name, c.name AS class_name, c.section,
               t.first_name||' '||t.last_name AS teacher_name,
               sub.id AS submission_id, sub.submitted_at, sub.marks,
               sub.feedback, sub.status AS sub_status, sub.file_name
        FROM assignments a
        JOIN subjects s  ON s.id  = a.subject_id
        JOIN classes  c  ON c.id  = a.class_id
        JOIN teachers t  ON t.id  = a.teacher_id
        LEFT JOIN assignment_submissions sub ON sub.assignment_id=a.id AND sub.student_id=%s
        WHERE a.class_id = %s
        ORDER BY a.due_date DESC
    """, (s["id"], s["class_id"]))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["due_date"]      = str(r["due_date"])
        r["created_at"]    = str(r["created_at"])
        r["submitted_at"]  = str(r["submitted_at"]) if r["submitted_at"] else None
        r["is_overdue"]    = r["due_date"] < date.today().isoformat()
        r["can_submit"]    = not r["is_overdue"] and not r["submission_id"]
    return success(data=rows)

# ── Submit assignment (student) ────────────────────────────────────
@bp.post("/<int:id>/submit")
@jwt_required_custom
@require_permission("assignment.submit")
def submit_assignment(id):
    user_id = int(get_jwt_identity())
    cur = get_cur(); db = get_db()

    cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
    s = cur.fetchone()
    if not s: return error("Student not found.", 403)

    cur.execute("SELECT * FROM assignments WHERE id=%s", (id,))
    asgn = cur.fetchone()
    if not asgn: return error("Assignment not found.", 404)

    # Check due date
    if str(asgn["due_date"]) < date.today().isoformat():
        return error("Due date has passed. Submission not allowed.", 400)

    # Check already submitted
    cur.execute("SELECT id FROM assignment_submissions WHERE assignment_id=%s AND student_id=%s", (id, s["id"]))
    if cur.fetchone(): return error("You have already submitted this assignment.", 400)

    if "file" not in request.files: return error("No file uploaded.", 400)
    file = request.files["file"]
    ext  = file.filename.rsplit(".",1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT: return error(f"File type .{ext} not allowed. Use PDF, DOC, DOCX, XLS, XLSX.", 400)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path   = os.path.join(UPLOAD_DIR, unique_name)
    file.save(file_path)
    file_size   = os.path.getsize(file_path)

    cur.execute("""
        INSERT INTO assignment_submissions (assignment_id,student_id,file_name,file_path,file_type,file_size)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id
    """, (id, s["id"], file.filename, unique_name, ext, file_size))
    db.commit()

    # Notify teacher
    from app.utils.notify import send_notification
    cur.execute("""
        SELECT u.id AS teacher_user_id, stu.first_name, stu.last_name
        FROM assignments a
        JOIN teachers t ON t.id=a.teacher_id
        JOIN users u ON u.id=t.user_id
        JOIN students stu ON stu.id=%s
        WHERE a.id=%s
    """, (s["id"], id))
    row = cur.fetchone()
    if row:
        send_notification(row["teacher_user_id"],
            "Assignment Submitted",
            f"{row['first_name']} {row['last_name']} submitted '{asgn['title']}'.",
            "info")
    return success(message="Assignment submitted successfully.")

# ── Get submissions for an assignment (teacher) ────────────────────
@bp.get("/<int:id>/submissions")
@jwt_required_custom
@require_permission("assignment.view")
def get_submissions(id):
    cur = get_cur()
    cur.execute("""
        SELECT sub.id, sub.student_id, sub.file_name, sub.file_type, sub.file_size,
               sub.submitted_at, sub.marks, sub.feedback, sub.status,
               s.first_name||' '||s.last_name AS student_name,
               s.enrollment_no
        FROM assignment_submissions sub
        JOIN students s ON s.id = sub.student_id
        WHERE sub.assignment_id = %s
        ORDER BY sub.submitted_at DESC
    """, (id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows: r["submitted_at"] = str(r["submitted_at"])

    # Also get unsubmitted students
    cur.execute("""
        SELECT s.id AS student_id, s.first_name||' '||s.last_name AS student_name, s.enrollment_no
        FROM assignments a
        JOIN students s ON s.class_id=a.class_id AND s.status='active'
        WHERE a.id=%s
          AND s.id NOT IN (SELECT student_id FROM assignment_submissions WHERE assignment_id=%s)
    """, (id, id))
    not_submitted = [dict(r) for r in cur.fetchall()]
    return success(data={"submissions": rows, "not_submitted": not_submitted})

# ── Grade submission (teacher) ─────────────────────────────────────
@bp.put("/submissions/<int:sub_id>/grade")
@jwt_required_custom
@require_permission("assignment.grade")
def grade_submission(sub_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    marks   = body.get("marks")
    feedback= body.get("feedback","")
    if marks is None: return error("marks required.", 400)
    cur = get_cur(); db = get_db()

    cur.execute("SELECT sub.*, a.total_marks, a.title FROM assignment_submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE sub.id=%s", (sub_id,))
    sub = cur.fetchone()
    if not sub: return error("Submission not found.", 404)

    if int(marks) > int(sub["total_marks"]):
        return error(f"Marks cannot exceed total marks ({sub['total_marks']}).", 400)

    cur.execute("""
        UPDATE assignment_submissions SET marks=%s, feedback=%s, status='graded', marked_at=NOW(), marked_by=%s
        WHERE id=%s
    """, (marks, feedback, user_id, sub_id))
    db.commit()

    # Notify student
    from app.utils.notify import send_notification
    cur.execute("SELECT user_id FROM students WHERE id=%s", (sub["student_id"],))
    stu = cur.fetchone()
    if stu:
        send_notification(stu["user_id"],
            "Assignment Graded",
            f"Your assignment '{sub['title']}' has been graded. Marks: {marks}/{sub['total_marks']}.",
            "success")
    return success(message="Marks saved.")

# ── Download submission file ───────────────────────────────────────
@bp.get("/submissions/<int:sub_id>/download")
@jwt_required_custom
@require_permission("assignment.grade")
def download_submission(sub_id):
    cur = get_cur()
    cur.execute("SELECT * FROM assignment_submissions WHERE id=%s", (sub_id,))
    sub = cur.fetchone()
    if not sub: abort(404)
    fp = os.path.join(UPLOAD_DIR, sub["file_path"])
    if not os.path.exists(fp): abort(404)
    return send_file(fp, download_name=sub["file_name"], as_attachment=True)



# ── Download assignment file ───────────────────────────────────────
@bp.get("/<int:id>/download")
@jwt_required_custom
@require_permission("assignment.view")
def download_assignment_file(id):
    cur = get_cur()
    cur.execute("SELECT * FROM assignments WHERE id=%s", (id,))
    a = cur.fetchone()
    if not a: abort(404)
    if not a["file_path"]: return error("No file attached to this assignment.", 404)
    fp = os.path.join(UPLOAD_DIR, a["file_path"])
    if not os.path.exists(fp): return error("File not found on server.", 404)
    return send_file(fp, download_name=a["file_name"], as_attachment=True)

# ── Delete assignment ──────────────────────────────────────────────
@bp.get("/student-history")
@jwt_required_custom
@require_permission("assignment.view")
def student_assignment_history():
    from app.db.connection import get_db
    import psycopg2.extras
    student_id   = request.args.get("student_id")
    withdrawal_date = request.args.get("before_date")
    if not student_id:
        return error("student_id required", 400)
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    date_filter = "AND a.created_at::date <= %s::date" if withdrawal_date else ""
    params = [student_id, student_id]
    if withdrawal_date: params.append(withdrawal_date)
    cur.execute("""
        SELECT a.id, a.title, a.due_date, a.total_marks,
               subj.name AS subject_name,
               asub.id AS submission_id,
               asub.submitted_at,
               asub.marks AS marks_obtained,
               asub.status AS submission_status,
               asub.feedback,
               CASE WHEN asub.id IS NOT NULL THEN TRUE ELSE FALSE END AS submitted
        FROM assignments a
        LEFT JOIN subjects subj ON subj.id=a.subject_id
        LEFT JOIN assignment_submissions asub ON asub.assignment_id=a.id AND asub.student_id=%s::int
        WHERE a.class_id=(SELECT st.class_id FROM students st WHERE st.id=%s::int)
        """ + date_filter + """
        ORDER BY a.due_date DESC
    """, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ["due_date","submitted_at"]:
            if r.get(k): r[k] = str(r[k])
    return success(data=rows)


@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("assignment.create")
def delete_assignment(id):
    user_id = int(get_jwt_identity())
    cur = get_cur(); db = get_db()
    cur.execute("SELECT a.*, t.user_id AS t_user_id FROM assignments a JOIN teachers t ON t.id=a.teacher_id WHERE a.id=%s", (id,))
    a = cur.fetchone()
    if not a: return error("Assignment not found.", 404)
    # Only creator or admin can delete
    cur.execute("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=%s", (user_id,))
    roles = [r["name"] for r in cur.fetchall()]
    if a["t_user_id"] != user_id and not any(r in roles for r in ["superadmin","admin","principal"]):
        return error("Permission denied.", 403)
    # Remove file if exists
    if a["file_path"]:
        fp = os.path.join(UPLOAD_DIR, a["file_path"])
        if os.path.exists(fp): os.remove(fp)
    cur.execute("DELETE FROM assignments WHERE id=%s", (id,))
    db.commit()
    return success(message="Assignment deleted.")
