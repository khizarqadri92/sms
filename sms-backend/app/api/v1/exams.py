from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, get_jwt
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.utils.sp_helper import call_sp
import psycopg2.extras, json

bp = Blueprint("exams", __name__)

def get_db():
    from app.db.connection import get_db as _g
    return _g()

def get_cur(db=None):
    db = db or get_db()
    return db, db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def fmt(row, keys):
    for k in keys:
        if row.get(k): row[k] = str(row[k])
    return row

# ── Exam Types ──────────────────────────────────────────────────────
@bp.get("/components")
@jwt_required_custom
@require_permission("exam.view")
def get_components():
    db, cur = get_cur()
    cur.execute("SELECT * FROM result_components ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])

@bp.post("/components")
@jwt_required_custom
@require_permission("exam.config")
def create_component():
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    db, cur = get_cur()
    try:
        cur.execute("INSERT INTO result_components(name,code,collection_method,description,created_by) VALUES(%s,%s,%s,%s,%s) RETURNING id",
                    (body.get("name"), body.get("code","").upper(), body.get("collection_method","per_subject"), body.get("description",""), user_id))
        db.commit()
        return success(data={"id":cur.fetchone()["id"]}, message="Component created.")
    except Exception as e:
        db.rollback()
        return error("Code already exists or invalid data: "+str(e), 400)

@bp.put("/components/<int:comp_id>")
@jwt_required_custom
@require_permission("exam.config")
def update_component(comp_id):
    body = request.get_json() or {}
    db, cur = get_cur()
    cur.execute("UPDATE result_components SET name=%s, collection_method=%s, description=%s, is_active=%s WHERE id=%s",
                (body.get("name"), body.get("collection_method","per_subject"), body.get("description",""), body.get("is_active",True), comp_id))
    db.commit()
    return success(message="Updated.")

@bp.get("/formula")
@jwt_required_custom
@require_permission("exam.view")
def get_formula():
    db, cur = get_cur()
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: return error("No active academic year", 404)
    cur.execute("SELECT * FROM result_formula WHERE academic_year_id=%s", (ay["id"],))
    row = cur.fetchone()
    if not row:
        cur.execute("INSERT INTO result_formula(academic_year_id) VALUES(%s) ON CONFLICT(academic_year_id) DO NOTHING", (ay["id"],))
        db.commit()
        cur.execute("SELECT * FROM result_formula WHERE academic_year_id=%s", (ay["id"],))
        row = cur.fetchone()
    result = dict(row)
    if result.get("updated_at"): result["updated_at"] = str(result["updated_at"])
    return success(data=result)

@bp.put("/formula")
@jwt_required_custom
@require_permission("exam.config")
def update_formula():
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    formula = body.get("formula", [])
    total = sum(float(c.get("weight",0)) for c in formula)
    db, cur = get_cur()
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: return error("No active academic year", 404)
    formula_mode = body.get("formula_mode","percentage")
    is_configured = abs(total-100)<0.5 if formula_mode=="percentage" else len(formula)>0
    cur.execute("UPDATE result_formula SET formula=%s, total_weight=%s, is_configured=%s, formula_mode=%s, updated_by=%s, updated_at=NOW() WHERE academic_year_id=%s",
                (json.dumps(formula), total, is_configured, formula_mode, user_id, ay["id"]))
    db.commit()
    return success(message="Formula saved.")

@bp.get("/types")
@jwt_required_custom
@require_permission("exam.view")
def get_exam_types():
    db, cur = get_cur()
    cur.execute("SELECT * FROM exam_types ORDER BY order_no")
    return success(data=[dict(r) for r in cur.fetchall()])

@bp.post("/types")
@jwt_required_custom
@require_permission("exam.config")
def create_exam_type():
    body = request.get_json() or {}
    db, cur = get_cur()
    cur.execute("""INSERT INTO exam_types(name,code,weight,order_no)
                   VALUES(%s,%s,%s,%s) RETURNING id""",
                (body.get("name"), body.get("code"), body.get("weight",0), body.get("order_no",1)))
    db.commit()
    return success(data={"id": cur.fetchone()["id"]}, message="Exam type created.")

@bp.put("/types/<int:type_id>")
@jwt_required_custom
@require_permission("exam.config")
def update_exam_type(type_id):
    body = request.get_json() or {}
    db, cur = get_cur()
    cur.execute("""UPDATE exam_types SET name=%s, weight=%s, order_no=%s, is_active=%s,
                   publish_mode=%s, require_datesheet_approval=%s, include_in_final=%s,
                   datesheet_submit_role=%s, datesheet_approve_role=%s, datesheet_publish_role=%s
                   WHERE id=%s""",
                (body.get("name"), body.get("weight",0), body.get("order_no",1),
                 body.get("is_active",True), body.get("publish_mode","per_class"),
                 body.get("require_datesheet_approval",True), body.get("include_in_final",True),
                 body.get("datesheet_submit_role","academic_coordinator"),
                 body.get("datesheet_approve_role","principal"),
                 body.get("datesheet_publish_role","academic_coordinator"), type_id))
    db.commit()
    return success(message="Exam type updated.")

# ── Grading Scale ───────────────────────────────────────────────────
@bp.get("/grading")
@jwt_required_custom
@require_permission("exam.view")
def get_grading():
    db, cur = get_cur()
    cur.execute("SELECT * FROM grading_scales WHERE is_active=TRUE ORDER BY order_no")
    return success(data=[dict(r) for r in cur.fetchall()])

@bp.put("/grading")
@jwt_required_custom
@require_permission("exam.config")
def update_grading():
    body = request.get_json() or {}
    grades = body.get("grades", [])
    db, cur = get_cur()
    cur.execute("DELETE FROM grading_scales")
    for i, g in enumerate(grades):
        cur.execute("""INSERT INTO grading_scales(grade,min_pct,max_pct,gpa,description,order_no)
                       VALUES(%s,%s,%s,%s,%s,%s)""",
                    (g.get("grade"), g.get("min_pct"), g.get("max_pct"),
                     g.get("gpa",0), g.get("description",""), i+1))
    db.commit()
    return success(message="Grading scale updated.")

# ── Exam Config ─────────────────────────────────────────────────────
@bp.get("/exam-config")
@jwt_required_custom
@require_permission("exam.view")
def get_exam_config():
    db, cur = get_cur()
    cur.execute("SELECT * FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: return error("No active academic year", 404)
    cur.execute("SELECT * FROM exam_config WHERE academic_year_id=%s", (ay["id"],))
    row = cur.fetchone()
    if not row:
        cur.execute("""INSERT INTO exam_config(academic_year_id) VALUES(%s)
                       ON CONFLICT(academic_year_id) DO NOTHING RETURNING *""", (ay["id"],))
        db.commit()
        cur.execute("SELECT * FROM exam_config WHERE academic_year_id=%s", (ay["id"],))
        row = cur.fetchone()
    result = dict(row)
    if result.get("updated_at"): result["updated_at"] = str(result["updated_at"])
    return success(data=result)

@bp.put("/exam-config")
@jwt_required_custom
@require_permission("exam.config")
def update_exam_config():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    db, cur = get_cur()
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: return error("No active academic year", 404)
    cur.execute("""UPDATE exam_config SET
        passing_pct=%s, max_fail_subjects=%s, allow_compartment=%s,
        compartment_min_pct=%s, position_formula=%s, grading_mode=%s,
        updated_at=NOW(), updated_by=%s
        WHERE academic_year_id=%s""",
        (body.get("passing_pct",40), body.get("max_fail_subjects",2),
         body.get("allow_compartment",True), body.get("compartment_min_pct",33),
         json.dumps(body.get("position_formula",[])), body.get("grading_mode","score"),
         user_id, ay["id"]))
    db.commit()
    return success(message="Exam config updated.")

# ── Exams CRUD ──────────────────────────────────────────────────────
@bp.get("/")
@jwt_required_custom
@require_permission("exam.view")
def list_exams():
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    db, cur = get_cur()
    class_id = request.args.get("class_id")

    # Teacher: only their incharge classes
    if role == "teacher":
        cur.execute("""SELECT ct.class_id FROM class_teachers ct
                       JOIN teachers t ON t.id=ct.teacher_id
                       WHERE t.user_id=%s AND ct.is_primary=TRUE""", (user_id,))
        incharge = [r["class_id"] for r in cur.fetchall()]
        if class_id and int(class_id) in incharge:
            pass
        elif not class_id and incharge:
            class_id = incharge[0]

    cur.execute("SELECT * FROM sp_get_exams(%s, NULL)", (class_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for row in rows:
        fmt(row, ["start_date","end_date","created_at"])
    return success(data=rows)

@bp.get("/<int:exam_id>")
@jwt_required_custom
@require_permission("exam.view")
def get_exam(exam_id):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_exam_detail(%s)", (exam_id,))
    row = cur.fetchone()
    if not row: return error("Exam not found", 404)
    result = dict(row)
    # Add linked classes
    cur.execute("""SELECT ec.class_id, c.name as class_name, c.section
                   FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s ORDER BY c.name, c.section""", (exam_id,))
    result["exam_classes"] = [dict(r) for r in cur.fetchall()]
    fmt(result, ["start_date","end_date","published_at","approved_at"])
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    subjects = [dict(r) for r in cur.fetchall()]
    for s in subjects:
        fmt(s, ["exam_date","submitted_at"])
        if s.get("start_time"): s["start_time"] = str(s["start_time"])
    result["subjects"] = subjects
    return success(data=result)

@bp.post("/")
@jwt_required_custom
@require_permission("exam.manage")
def create_exam():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    db, cur = get_cur()
    cur.execute("SELECT id FROM academic_years WHERE is_active=TRUE LIMIT 1")
    ay = cur.fetchone()
    if not ay: return error("No active academic year", 404)

    class_ids = body.get("class_ids", [])
    if body.get("all_classes"):
        cur.execute("SELECT id FROM classes ORDER BY name, section")
        class_ids = [r["id"] for r in cur.fetchall()]
    if not class_ids:
        return error("Select at least one class.", 400)

    # Create ONE exam record (no class_id)
    cur.execute("""INSERT INTO exams(academic_year_id, exam_type_id, name, start_date, end_date, created_by, status)
                   VALUES(%s,%s,%s,%s,%s,%s,'draft') RETURNING id""",
                (ay["id"], body.get("exam_type_id"), body.get("name"),
                 body.get("start_date"), body.get("end_date"), user_id))
    exam_id = cur.fetchone()["id"]

    # Link classes
    for class_id in class_ids:
        cur.execute("INSERT INTO exam_classes(exam_id, class_id) VALUES(%s,%s) ON CONFLICT DO NOTHING", (exam_id, class_id))

    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
                      JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "New Exam Created",
                f"Exam '{body.get('name','')}' created for {len(class_ids)} class(es). Build the datesheet.", "info")
    except Exception as e:
        print("[exam notify]", e)

    return success(message=f"Exam created for {len(class_ids)} class(es).", data={"id": exam_id})

@bp.put("/<int:exam_id>")
@jwt_required_custom
@require_permission("exam.manage")
def update_exam(exam_id):
    body = request.get_json() or {}
    db, cur = get_cur()
    cur.execute("""UPDATE exams SET name=%s, start_date=%s, end_date=%s
                   WHERE id=%s""",
                (body.get("name"), body.get("start_date"), body.get("end_date"), exam_id))
    db.commit()
    return success(message="Exam updated.")

@bp.delete("/<int:exam_id>")
@jwt_required_custom
@require_permission("exam.manage")
def delete_exam(exam_id):
    db, cur = get_cur()
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    row = cur.fetchone()
    if not row: return error("Exam not found", 404)
    if row["status"] not in ("draft","scheduled"):
        return error("Only draft or scheduled exams can be deleted.", 400)
    cur.execute("DELETE FROM exams WHERE id=%s", (exam_id,))
    db.commit()
    return success(message="Exam deleted.")


@bp.delete("/<int:exam_id>/subjects/<int:subject_id>")
@jwt_required_custom
@require_permission("exam.manage")
def delete_exam_subject(exam_id, subject_id):
    db, cur = get_cur()
    cur.execute("SELECT e.status FROM exams e WHERE e.id=%s", (exam_id,))
    row = cur.fetchone()
    if row and row["status"] not in ("draft","scheduled"):
        return error("Cannot remove subjects after datesheet is published.", 400)
    cur.execute("DELETE FROM exam_subjects WHERE id=%s AND exam_id=%s", (subject_id, exam_id))
    db.commit()
    return success(message="Subject removed.")


@bp.get("/<int:exam_id>/available-subjects")
@jwt_required_custom
@require_permission("exam.manage")
def get_available_subjects(exam_id):
    db, cur = get_cur()
    cur.execute("""
        SELECT DISTINCT s.id, s.name, s.code,
               STRING_AGG(DISTINCT c.name||(CASE WHEN c.section IS NOT NULL AND c.section!='' THEN ' ('||c.section||')' ELSE '' END), ', ') as class_names
        FROM exam_classes ec
        JOIN class_subjects cs ON cs.class_id=ec.class_id
        JOIN subjects s ON s.id=cs.subject_id
        JOIN classes c ON c.id=ec.class_id
        WHERE ec.exam_id=%s
          AND s.id NOT IN (SELECT subject_id FROM exam_subjects WHERE exam_id=%s)
        GROUP BY s.id, s.name, s.code
        ORDER BY s.name
    """, (exam_id, exam_id))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/<int:exam_id>/subjects")
@jwt_required_custom
@require_permission("exam.manage")
def add_subject(exam_id):
    body = request.get_json() or {}
    teacher_id = body.get("teacher_id") or None
    result, err = call_sp("sp_add_exam_subject", (
        exam_id, body.get("class_id"), body.get("subject_id"), teacher_id,
        body.get("total_marks",100), body.get("passing_marks",40),
        body.get("exam_date"), body.get("start_time"), body.get("duration_mins",120),
        body.get("venue","")
    ))
    if err: return error(err, 400)
    return success(message="Subject added.")

@bp.get("/<int:exam_id>/subjects")
@jwt_required_custom
@require_permission("exam.view")
def get_exam_subjects_list(exam_id):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ["exam_date","start_time","submitted_at"]:
            if r.get(k): r[k] = str(r[k])
    return success(data=rows)


@bp.get("/<int:exam_id>/datesheet")
@jwt_required_custom
@require_permission("exam.view")
def get_datesheet(exam_id):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_exam_detail(%s)", (exam_id,))
    row = cur.fetchone()
    if not row: return error("Exam not found", 404)
    result = dict(row)
    # Add linked classes
    cur.execute("""SELECT ec.class_id, c.name as class_name, c.section
                   FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                   WHERE ec.exam_id=%s ORDER BY c.name, c.section""", (exam_id,))
    result["exam_classes"] = [dict(r) for r in cur.fetchall()]
    fmt(result, ["start_date","end_date","published_at","approved_at"])
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    subjects = [dict(r) for r in cur.fetchall()]
    for s in subjects:
        fmt(s, ["exam_date","submitted_at"])
        if s.get("start_time"): s["start_time"] = str(s["start_time"])
    result["subjects"] = subjects
    cur.execute("""SELECT datesheet_published, datesheet_published_at
                   FROM exams WHERE id=%s""", (exam_id,))
    ds = cur.fetchone()
    result["datesheet_published"] = ds["datesheet_published"] if ds else False
    result["datesheet_published_at"] = str(ds["datesheet_published_at"]) if ds and ds["datesheet_published_at"] else None
    return success(data=result)


@bp.post("/<int:exam_id>/datesheet/submit")
@jwt_required_custom
@require_permission("exam.manage")
def submit_datesheet(exam_id):
    user_id = int(get_jwt_identity())
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    if not cur.fetchall():
        return error("Add subjects to datesheet before submitting.", 400)
    result, err = call_sp("sp_submit_datesheet", (exam_id, user_id))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
                      JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND u.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "Datesheet Awaiting Approval",
                f"Datesheet for '{exam['name']}' has been submitted for your approval.", "info")
    except Exception as e: print("[datesheet notify]", e)
    return success(message="Datesheet submitted for principal approval.")


@bp.post("/<int:exam_id>/datesheet/approve")
@jwt_required_custom
@require_permission("exam.approve")
def approve_datesheet(exam_id):
    user_id = int(get_jwt_identity())
    result, err = call_sp("sp_approve_datesheet", (exam_id, user_id))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
                      JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "Datesheet Approved",
                f"Datesheet for '{exam['name']}' has been approved. You can now publish it.", "success")
    except Exception as e: print("[datesheet notify]", e)
    return success(message="Datesheet approved.")




@bp.post("/<int:exam_id>/datesheet/publish")
@jwt_required_custom
@require_permission("exam.manage")
def publish_datesheet(exam_id):
    user_id = int(get_jwt_identity())
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_exam_subjects(%s)", (exam_id,))
    subjects = cur.fetchall()
    if not subjects:
        return error("Add subjects to the datesheet before publishing.", 400)
    result, err = call_sp("sp_publish_datesheet", (exam_id, user_id))
    if err: return error(err, 400)
    try:
        _db, _cur = get_cur()
        _cur.execute("SELECT name FROM exams WHERE id=%s",(exam_id,))
        _ex = _cur.fetchone()
        if _ex:
            auto_announce(str(_ex[0]) + " - Exam Schedule Published", "The exam datesheet is now available. Check the schedule for your class.", "/datesheet-view", "View Schedule", "exam")
            notify_all_users(str(_ex[0]) + " - Exam Schedule Published", "The exam datesheet is now available.", "/datesheet-view", "exam")
    except Exception as _e: print("[ds_announce]", _e)
    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT e.class_id, e.name FROM exams e WHERE e.id=%s", (exam_id,))
        exam = cur.fetchone()
        if exam:
            exam_name = exam["name"]
            class_id  = exam["class_id"]
            # Notify subject teachers
            cur.execute("""SELECT DISTINCT t.user_id FROM exam_subjects es
                          JOIN teachers t ON t.id=es.teacher_id WHERE es.exam_id=%s""", (exam_id,))
            for row in cur.fetchall():
                send_notification(row["user_id"], "Datesheet Published",
                    f"Datesheet for '{exam_name}' has been published.", "info")
            # Notify students and parents
            cur.execute("""SELECT s.user_id, s.parent_id FROM students s
                          WHERE s.class_id=%s AND s.status='active'""", (class_id,))
            for row in cur.fetchall():
                if row["user_id"]: send_notification(row["user_id"], "Datesheet Published",
                    f"Exam datesheet for '{exam_name}' is now available.", "info")
                if row["parent_id"]: send_notification(row["parent_id"], "Datesheet Published",
                    f"Exam datesheet for your child has been published.", "info")
            # Notify principal
            cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
                          JOIN roles r ON r.id=ur.role_id WHERE r.name='principal' AND u.is_active=TRUE""")
            for row in cur.fetchall():
                send_notification(row["id"], "Datesheet Published",
                    f"Datesheet for '{exam_name}' has been published.", "info")
    except Exception as e:
        print("[datesheet notify]", e)
    return success(message="Datesheet published successfully.")


@bp.post("/<int:exam_id>/open")
@jwt_required_custom
@require_permission("exam.manage")
def open_marks(exam_id):
    user_id = int(get_jwt_identity())
    result, err = call_sp("sp_open_marks_entry", (exam_id, user_id))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("SELECT es.teacher_id, t.user_id FROM exam_subjects es JOIN teachers t ON t.id=es.teacher_id WHERE es.exam_id=%s", (exam_id,))
        for row in cur.fetchall():
            send_notification(row["user_id"], "Marks Entry Open",
                "Marks entry has been opened for your exam. Please enter marks.", "info")
    except Exception as e: print("[exam notify]", e)
    return success(message="Marks entry opened.")

# ── Mark Entry ──────────────────────────────────────────────────────
@bp.get("/<int:exam_id>/subjects/<int:subject_id>/marks")
@jwt_required_custom
@require_permission("exam.view")
def get_marks(exam_id, subject_id):
    db, cur = get_cur()
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: return error("Exam subject not found", 404)
    cur.execute("SELECT * FROM sp_get_exam_marks(%s)", (es["id"],))
    rows = [dict(r) for r in cur.fetchall()]
    return success(data=rows)

@bp.post("/<int:exam_id>/subjects/<int:subject_id>/marks")
@jwt_required_custom
@require_permission("exam.marks")
def enter_marks(exam_id, subject_id):
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    marks   = body.get("marks", [])
    db, cur = get_cur()
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: return error("Exam subject not found", 404)
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return error("Teacher not found", 404)
    result, err = call_sp("sp_enter_marks", (es["id"], json.dumps(marks), t["id"]))
    if err: return error(err, 400)
    return success(message="Marks saved.")

@bp.post("/<int:exam_id>/subjects/<int:subject_id>/submit")
@jwt_required_custom
@require_permission("exam.marks")
def submit_marks(exam_id, subject_id):
    user_id = int(get_jwt_identity())
    db, cur = get_cur()
    cur.execute("SELECT id FROM exam_subjects WHERE exam_id=%s AND subject_id=%s", (exam_id, subject_id))
    es = cur.fetchone()
    if not es: return error("Exam subject not found", 404)
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t: return error("Teacher not found", 404)
    result, err = call_sp("sp_submit_subject_marks", (es["id"], t["id"]))
    if err: return error(err, 400)
    if result and result.get("all_submitted"):
        try:
            from app.utils.notify import send_notification
            cur.execute("""SELECT ct.teacher_id, tt.user_id FROM exams e
                          JOIN class_teachers ct ON ct.class_id=e.class_id AND ct.is_primary=TRUE
                          JOIN teachers tt ON tt.id=ct.teacher_id WHERE e.id=%s""", (exam_id,))
            incharge = cur.fetchone()
            if incharge:
                send_notification(incharge["user_id"], "All Marks Submitted",
                    "All subject teachers have submitted marks. Please compile results.", "info")
        except Exception as e: print("[exam notify]", e)
    return success(message="Marks submitted.")

# ── Compile & Approve & Publish ─────────────────────────────────────

@bp.put("/<int:exam_id>/status")
@jwt_required_custom
@require_permission("exam.manage")
def update_status(exam_id):
    body   = request.get_json() or {}
    status = body.get("status","")
    db, cur = get_cur()
    cur.execute("UPDATE exams SET status=%s WHERE id=%s", (status, exam_id))
    db.commit()
    return success(message="Status updated.")

@bp.post("/<int:exam_id>/approve")
@jwt_required_custom
@require_permission("exam.approve")
def approve_results(exam_id):
    user_id = int(get_jwt_identity())
    result, err = call_sp("sp_approve_exam_results", (exam_id, user_id))
    if err: return error(err, 400)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
                      JOIN roles r ON r.id=ur.role_id WHERE r.name='academic_coordinator' AND u.is_active=TRUE""")
        for row in cur.fetchall():
            send_notification(row["id"], "Results Approved", "Principal has approved exam results. You can now publish.", "success")
    except Exception as e: print("[exam notify]", e)
    return success(message="Results approved.")

@bp.post("/<int:exam_id>/publish")
@jwt_required_custom
@require_permission("exam.publish")
def publish_results(exam_id):
    user_id = int(get_jwt_identity())
    result, err = call_sp("sp_publish_exam_results", (exam_id, user_id))
    if err: return error(err, 400)
    try:
        _db, _cur = get_cur()
        _cur.execute("SELECT name FROM exams WHERE id=%s",(exam_id,))
        _ex = _cur.fetchone()
        if _ex:
            auto_announce(str(_ex[0]) + " - Results Published", "Exam results are now available. Check your result.", "/exam-results", "View Results", "result")
            notify_all_users(str(_ex[0]) + " - Results Published", "Exam results are now available. Check your result.", "/exam-results", "result")
    except Exception as _e: print("[res_announce]", _e)
    try:
        from app.utils.notify import send_notification
        db, cur = get_cur()
        cur.execute("""SELECT s.user_id, s.parent_id FROM students s
                      JOIN exams e ON e.class_id=s.class_id WHERE e.id=%s AND s.status='active'""", (exam_id,))
        for row in cur.fetchall():
            if row["user_id"]: send_notification(row["user_id"], "Results Published", "Your exam results are now available.", "success")
            if row["parent_id"]: send_notification(row["parent_id"], "Results Published", "Your child's exam results are now available.", "success")
    except Exception as e: print("[exam notify]", e)
    return success(message="Results published.")

@bp.get("/<int:exam_id>/results")
@jwt_required_custom
@require_permission("exam.view")
def get_results(exam_id):
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    db, cur = get_cur()
    # Check exam is published for student/parent
    if role in ("student","parent"):
        cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
        e = cur.fetchone()
        if not e or e["status"] != "published":
            return error("Results not published yet", 403)
    cur.execute("SELECT * FROM sp_get_exam_results(%s)", (exam_id,))
    rows = [dict(r) for r in cur.fetchall()]
    # Student: only own result
    if role == "student":
        cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
        stu = cur.fetchone()
        if stu: rows = [r for r in rows if r["student_id"]==stu["id"]]
    # Parent: only children
    elif role == "parent":
        cur.execute("SELECT id FROM students WHERE parent_id=%s", (user_id,))
        ids = {r["id"] for r in cur.fetchall()}
        rows = [r for r in rows if r["student_id"] in ids]
    return success(data=rows)



def notify_all_users(title, body, link, notif_type="exam"):
    try:
        db, cur = get_cur()
        cur.execute("SELECT id FROM users WHERE is_active=TRUE")
        users = [r["id"] for r in cur.fetchall()]
        for uid in users:
            cur.execute("""
                INSERT INTO notifications(user_id, title, body, link, type)
                VALUES(%s,%s,%s,%s,%s)
            """, (uid, title, body, link, notif_type))
        db.commit()
        print(f"[notify_all] Sent to {len(users)} users")
    except Exception as e:
        print("[notify_all]", e)

def auto_announce(title, body, link, link_label="View", ann_type="exam"):
    try:
        db, cur = get_cur()
        cur.execute("""INSERT INTO announcements(title,body,link,link_label,ann_type,target_role,priority,source_type)
                       VALUES(%s,%s,%s,%s,%s,'all','normal','exam_auto')""",
                    (title, body, link, link_label, ann_type))
        db.commit()
    except Exception as e:
        print("[auto_announce]", e)


def check_not_published(exam_id):
    db, cur = get_cur()
    cur.execute("SELECT status FROM exams WHERE id=%s", (exam_id,))
    row = cur.fetchone()
    if row and row["status"] == "published":
        return error("Results have been published. This exam is now locked.", 403)
    return None

# ?? Marks Entry ?????????????????????????????????????????????????????????????

@bp.get("/<int:exam_id>/marks-entry")
@jwt_required_custom
@require_permission("exam.marks")
def get_marks_entry(exam_id):
    """Get students and their marks for a subject in a class"""
    db, cur = get_cur()
    user_id = int(get_jwt_identity())
    claims  = get_jwt()
    role    = (claims.get("roles") or [""])[0]
    class_id   = request.args.get("class_id", type=int)
    subject_id = request.args.get("subject_id", type=int)

    if not class_id or not subject_id:
        return error("class_id and subject_id required", 400)

    # Get exam subject info
    cur.execute("""
        SELECT es.*, s.name as subject_name, c.name as class_name, c.section,
               es.total_marks, es.passing_marks
        FROM exam_subjects es
        JOIN subjects s ON s.id=es.subject_id
        JOIN classes c ON c.id=es.class_id
        WHERE es.exam_id=%s AND es.class_id=%s AND es.subject_id=%s
    """, (exam_id, class_id, subject_id))
    es = cur.fetchone()
    if not es: return error("Subject not in datesheet", 404)

    # Get students in class
    cur.execute("""
        SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
               em.marks_obtained, em.is_absent, em.remarks, em.entered_at
        FROM students s
        LEFT JOIN exam_marks em ON em.student_id=s.id
            AND em.exam_id=%s AND em.class_id=%s AND em.subject_id=%s
        WHERE s.class_id=%s AND s.status='active'
        ORDER BY s.first_name, s.last_name
    """, (exam_id, class_id, subject_id, class_id))
    students = [dict(r) for r in cur.fetchall()]
    for s in students:
        if s.get("entered_at"): s["entered_at"] = str(s["entered_at"])

    result = dict(es)
    if result.get("exam_date"): result["exam_date"] = str(result["exam_date"])
    if result.get("start_time"): result["start_time"] = str(result["start_time"])
    if result.get("submitted_at"): result["submitted_at"] = str(result["submitted_at"])
    result["students"] = students
    return success(data=result)


@bp.post("/<int:exam_id>/marks-entry")
@jwt_required_custom
@require_permission("exam.marks")
def save_marks(exam_id):
    """Save marks for multiple students"""
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    class_id   = body.get("class_id")
    subject_id = body.get("subject_id")
    marks_list = body.get("marks", [])

    if not class_id or not subject_id:
        return error("class_id and subject_id required", 400)

    result, err = call_sp("sp_save_exam_marks", (exam_id, class_id, subject_id, json.dumps(marks_list), user_id))
    if err: return error(err, 400)
    return success(message=f"Marks saved for {len(marks_list)} students.")


@bp.post("/<int:exam_id>/submit-subject-marks")
@jwt_required_custom
@require_permission("exam.marks")
def submit_subject_marks(exam_id):
    """Subject teacher submits marks - locks entry"""
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    class_id   = body.get("class_id")
    subject_id = body.get("subject_id")
    db, cur = get_cur()
    cur.execute("""
        UPDATE exam_subjects SET marks_submitted=TRUE, submitted_at=NOW(), submitted_by=%s
        WHERE exam_id=%s AND class_id=%s AND subject_id=%s
    """, (user_id, exam_id, class_id, subject_id))
    db.commit()
    # Notify class incharge
    try:
        from app.utils.notify import send_notification
        cur.execute("""SELECT ct.teacher_id, t.user_id FROM class_teachers ct
                      JOIN teachers t ON t.id=ct.teacher_id
                      WHERE ct.class_id=%s AND ct.is_primary=TRUE""", (class_id,))
        row = cur.fetchone()
        if row:
            cur.execute("SELECT s.name FROM subjects s WHERE s.id=%s", (subject_id,))
            subj = cur.fetchone()
            send_notification(row["user_id"], "Marks Submitted",
                f"{subj['name'] if subj else 'Subject'} marks submitted. Please compile when all subjects are done.", "info")
    except Exception as e: print("[marks notify]", e)
    return success(message="Marks submitted successfully.")


@bp.get("/<int:exam_id>/class-marks-summary")
@jwt_required_custom
@require_permission("exam.view")
def get_class_marks_summary(exam_id):
    """Class incharge sees all subjects + submission status"""
    class_id = request.args.get("class_id", type=int)
    if not class_id: return error("class_id required", 400)
    db, cur = get_cur()

    # Get all subjects in datesheet for this class
    cur.execute("""
        SELECT es.id, es.subject_id, s.name as subject_name,
               es.total_marks, es.passing_marks, es.exam_date,
               es.marks_submitted, es.submitted_at,
               es.submitted_by,
               COUNT(DISTINCT em.student_id) FILTER (WHERE em.marks_obtained IS NOT NULL OR em.is_absent=TRUE) as marks_entered,
               (SELECT COUNT(*) FROM students sq WHERE sq.class_id=%s AND sq.status='active') as total_students,
               (SELECT u.first_name||' '||u.last_name FROM teacher_subjects ts
                JOIN teachers tt ON tt.id=ts.teacher_id
                JOIN users u ON u.id=tt.user_id
                JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id AND ct.class_id=%s
                WHERE ts.subject_id=es.subject_id LIMIT 1) as subject_teacher_name,
               (SELECT u.id FROM teacher_subjects ts
                JOIN teachers tt ON tt.id=ts.teacher_id
                JOIN users u ON u.id=tt.user_id
                JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id AND ct.class_id=%s
                WHERE ts.subject_id=es.subject_id LIMIT 1) as teacher_user_id
        FROM exam_subjects es
        JOIN subjects s ON s.id=es.subject_id
        LEFT JOIN exam_marks em ON em.exam_subject_id=es.id
        WHERE es.exam_id=%s AND es.class_id=%s
        GROUP BY es.id, s.name
        ORDER BY es.exam_date, s.name
    """, (class_id, class_id, class_id, exam_id, class_id))
    subjects = [dict(r) for r in cur.fetchall()]
    for s in subjects:
        if s.get("exam_date"): s["exam_date"] = str(s["exam_date"])
        if s.get("submitted_at"): s["submitted_at"] = str(s["submitted_at"])

    all_submitted = all(s["marks_submitted"] for s in subjects) if subjects else False

    # Check if results compiled for this class
    cur.execute("""
        SELECT er.compiled_at, u.first_name||' '||u.last_name as compiled_by_name,
               u.id as incharge_user_id,
               (SELECT u2.first_name||' '||u2.last_name FROM class_teachers ct2
                JOIN teachers t2 ON t2.id=ct2.teacher_id
                JOIN users u2 ON u2.id=t2.user_id
                WHERE ct2.class_id=%s AND ct2.is_primary=TRUE LIMIT 1) as incharge_name,
               (SELECT u2.id FROM class_teachers ct2
                JOIN teachers t2 ON t2.id=ct2.teacher_id
                JOIN users u2 ON u2.id=t2.user_id
                WHERE ct2.class_id=%s AND ct2.is_primary=TRUE LIMIT 1) as incharge_user_id_raw
        FROM exam_results er
        JOIN class_teachers ct ON ct.class_id=%s AND ct.is_primary=TRUE
        JOIN teachers t ON t.id=ct.teacher_id
        JOIN users u ON u.id=t.user_id
        WHERE er.exam_id=%s AND er.class_id=%s
        LIMIT 1
    """, (class_id, class_id, class_id, exam_id, class_id))
    compiled_row = cur.fetchone()
    compiled_info = dict(compiled_row) if compiled_row else None
    if compiled_info and compiled_info.get("compiled_at"):
        compiled_info["compiled_at"] = str(compiled_info["compiled_at"])

    # Get class incharge info
    cur.execute("""
        SELECT u.id as user_id, u.first_name||' '||u.last_name as name
        FROM class_teachers ct
        JOIN teachers t ON t.id=ct.teacher_id
        JOIN users u ON u.id=t.user_id
        WHERE ct.class_id=%s AND ct.is_primary=TRUE LIMIT 1
    """, (class_id,))
    incharge_row = cur.fetchone()
    incharge = dict(incharge_row) if incharge_row else None
    return success(data={"subjects": subjects, "all_submitted": all_submitted, "compiled": compiled_info, "incharge": incharge})

    # Get class incharge info
    cur.execute("""
        SELECT u.id as user_id, u.first_name||' '||u.last_name as name
        FROM class_teachers ct
        JOIN teachers t ON t.id=ct.teacher_id
        JOIN users u ON u.id=t.user_id
        WHERE ct.class_id=%s AND ct.is_primary=TRUE LIMIT 1
    """, (class_id,))
    incharge_row = cur.fetchone()
    incharge = dict(incharge_row) if incharge_row else None
    return success(data={"subjects": subjects, "all_submitted": all_submitted, "compiled": compiled_info, "incharge": incharge})


@bp.post("/<int:exam_id>/compile-results")
@jwt_required_custom
@require_permission("exam.compile")
def compile_results(exam_id):
    """Class incharge compiles results for their class"""
    user_id  = int(get_jwt_identity())
    body     = request.get_json() or {}
    class_id = body.get("class_id")
    if not class_id: return error("class_id required", 400)
    db, cur  = get_cur()

    # Get grading scale
    cur.execute("SELECT * FROM grading_scales ORDER BY min_pct DESC")
    grades = [dict(r) for r in cur.fetchall()]

    def get_grade(pct):
        for g in grades:
            if pct >= float(g["min_pct"]):
                return g["grade"], float(g.get("gpa",0))
        return "F", 0.0

    # Get all students
    cur.execute("SELECT id FROM students WHERE class_id=%s AND status='active'", (class_id,))
    students = [r["id"] for r in cur.fetchall()]

    # Get total marks from exam_subjects
    cur.execute("""SELECT SUM(total_marks) as total FROM exam_subjects
                   WHERE exam_id=%s AND class_id=%s""", (exam_id, class_id))
    total_row = cur.fetchone()
    total_possible = float(total_row["total"] or 0)

    results = []
    for sid in students:
        cur.execute("""SELECT COALESCE(SUM(em.marks_obtained),0) as obtained
                       FROM exam_marks em
                       JOIN exam_subjects es ON es.id=em.exam_subject_id
                       WHERE em.exam_id=%s AND es.class_id=%s AND em.student_id=%s
                       AND em.is_absent=FALSE""", (exam_id, class_id, sid))
        row = cur.fetchone()
        obtained = float(row["obtained"] or 0)
        pct = (obtained/total_possible*100) if total_possible > 0 else 0
        grade, gpa = get_grade(pct)
        results.append({"student_id":sid, "obtained":obtained, "pct":pct, "grade":grade, "gpa":gpa})

    # Rank students
    results.sort(key=lambda x: x["obtained"], reverse=True)
    for i, r in enumerate(results):
        cur.execute("""
            INSERT INTO exam_results(exam_id, student_id, class_id,
                total_marks, marks_obtained, percentage, grade, gpa, class_position, is_pass, compiled_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT(exam_id, student_id) DO UPDATE SET
                total_marks=%s, marks_obtained=%s, percentage=%s,
                grade=%s, gpa=%s, class_position=%s, is_pass=%s, compiled_at=NOW()
        """, (
            exam_id, r["student_id"], class_id,
            total_possible, r["obtained"], r["pct"], r["grade"], r["gpa"],
            i+1, r["pct"] >= 40,
            total_possible, r["obtained"], r["pct"], r["grade"], r["gpa"],
            i+1, r["pct"] >= 40
        ))

    # Check if ALL classes are compiled
    cur.execute("""
        SELECT COUNT(DISTINCT ec.class_id) as total,
               COUNT(DISTINCT er.class_id) as compiled
        FROM exam_classes ec
        LEFT JOIN exam_results er ON er.exam_id=%s AND er.class_id=ec.class_id
        WHERE ec.exam_id=%s
    """, (exam_id, exam_id))
    status_row = cur.fetchone()
    if status_row and status_row["compiled"] >= status_row["total"]:
        cur.execute("UPDATE exams SET status='compiled' WHERE id=%s", (exam_id,))
    db.commit()
    return success(message=f"Results compiled for {len(students)} students.")


@bp.get("/<int:exam_id>/compilation-status")
@jwt_required_custom
@require_permission("exam.view")
def get_compilation_status(exam_id):
    """Coordinator sees per-class compilation status"""
    db, cur = get_cur()
    cur.execute("""
        SELECT ec.class_id, c.name as class_name, c.section,
               -- check if results compiled
               EXISTS(SELECT 1 FROM exam_results er WHERE er.exam_id=%s AND er.class_id=ec.class_id) as is_compiled,
               -- count subjects submitted
               COUNT(DISTINCT es.id) FILTER (WHERE es.marks_submitted=TRUE) as subjects_submitted,
               COUNT(DISTINCT es.id) as subjects_total,
               -- class incharge name
               (SELECT u.first_name||' '||u.last_name FROM class_teachers ct
                JOIN teachers t ON t.id=ct.teacher_id JOIN users u ON u.id=t.user_id
                WHERE ct.class_id=ec.class_id AND ct.is_primary=TRUE LIMIT 1) as incharge_name,
               -- student count
               (SELECT COUNT(*) FROM students st WHERE st.class_id=ec.class_id AND st.status='active') as student_count
        FROM exam_classes ec
        JOIN classes c ON c.id=ec.class_id
        LEFT JOIN exam_subjects es ON es.exam_id=%s AND es.class_id=ec.class_id
        WHERE ec.exam_id=%s
        GROUP BY ec.class_id, c.name, c.section
        ORDER BY c.name, c.section
    """, (exam_id, exam_id, exam_id))
    rows = [dict(r) for r in cur.fetchall()]
    total = len(rows)
    compiled = sum(1 for r in rows if r['is_compiled'])
    all_compiled = total > 0 and compiled == total
    return success(data={"classes": rows, "total": total, "compiled": compiled, "all_compiled": all_compiled})


@bp.get("/<int:exam_id>/class-results/<int:class_id>")
@jwt_required_custom
@require_permission("exam.view")
def get_class_results(exam_id, class_id):
    db, cur = get_cur()
    # Get students with their marks per subject
    cur.execute("""
        SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
               er.total_marks, er.marks_obtained, er.percentage,
               er.grade, er.gpa, er.class_position, er.is_pass
        FROM students s
        JOIN exam_results er ON er.student_id=s.id AND er.exam_id=%s
        WHERE s.class_id=%s AND s.status='active'
        ORDER BY er.class_position
    """, (exam_id, class_id))
    students = [dict(r) for r in cur.fetchall()]

    # Get per-subject marks for each student
    cur.execute("""
        SELECT em.student_id, sub.name as subject_name, es.total_marks,
               em.marks_obtained, em.is_absent
        FROM exam_marks em
        JOIN exam_subjects es ON es.id=em.exam_subject_id
        JOIN subjects sub ON sub.id=es.subject_id
        WHERE em.exam_id=%s AND es.class_id=%s
        ORDER BY sub.name
    """, (exam_id, class_id))
    marks_rows = cur.fetchall()

    # Build subject marks map per student
    from collections import defaultdict
    subj_marks = defaultdict(dict)
    subjects_set = []
    seen = set()
    for r in marks_rows:
        subj_marks[r["student_id"]][r["subject_name"]] = {
            "marks": float(r["marks_obtained"]) if r["marks_obtained"] else 0,
            "total": float(r["total_marks"]),
            "absent": r["is_absent"]
        }
        if r["subject_name"] not in seen:
            subjects_set.append({"name":r["subject_name"],"total":float(r["total_marks"])})
            seen.add(r["subject_name"])

    for s in students:
        s["subject_marks"] = subj_marks.get(s["id"],{})
        for k in ["total_marks","marks_obtained","percentage","gpa"]:
            if s.get(k): s[k]=float(s[k])

    return success(data={"students":students,"subjects":subjects_set})


@bp.post("/<int:exam_id>/send-reminder")
@jwt_required_custom
@require_permission("exam.manage")
def send_reminder(exam_id):
    body = request.get_json() or {}
    target_user_id = body.get("user_id")
    message = body.get("message", "Please submit your exam marks.")
    title = body.get("title", "Marks Entry Reminder")
    if not target_user_id: return error("user_id required", 400)
    try:
        from app.utils.notify import send_notification
        send_notification(target_user_id, title, message, "warning")
    except Exception as e:
        print("[reminder]", e)
    return success(message="Reminder sent.")


@bp.get("/<int:exam_id>/student-results/<int:student_id>")
@jwt_required_custom
@require_permission("exam.view")
def get_student_results(exam_id, student_id):
    db, cur = get_cur()
    # Get overall result
    cur.execute("""
        SELECT er.*, s.first_name, s.last_name, s.enrollment_no,
               c.name as class_name, c.section
        FROM exam_results er
        JOIN students s ON s.id=er.student_id
        JOIN classes c ON c.id=er.class_id
        WHERE er.exam_id=%s AND er.student_id=%s
    """, (exam_id, student_id))
    row = cur.fetchone()
    if not row: return error("Results not found", 404)
    result = dict(row)
    for k in ["total_marks","marks_obtained","percentage","gpa"]:
        if result.get(k): result[k] = float(result[k])
    if result.get("compiled_at"): result["compiled_at"] = str(result["compiled_at"])

    # Get per-subject marks
    cur.execute("""
        SELECT sub.name as subject_name, es.total_marks,
               em.marks_obtained, em.is_absent
        FROM exam_marks em
        JOIN exam_subjects es ON es.id=em.exam_subject_id
        JOIN subjects sub ON sub.id=es.subject_id
        WHERE em.exam_id=%s AND em.student_id=%s
        ORDER BY sub.name
    """, (exam_id, student_id))
    subjects = []
    for r in cur.fetchall():
        s = dict(r)
        if s.get("total_marks"): s["total_marks"] = float(s["total_marks"])
        if s.get("marks_obtained"): s["marks_obtained"] = float(s["marks_obtained"])
        subjects.append(s)

    result["subjects"] = subjects
    return success(data=result)
