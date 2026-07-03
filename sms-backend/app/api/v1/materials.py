from flask import Blueprint, request, send_file, abort
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db
import psycopg2.extras
import os, uuid

bp = Blueprint("materials", __name__)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "materials")
ALLOWED_EXT = {"pdf","doc","docx","xls","xlsx","ppt","pptx","jpg","jpeg","png","mp4","zip","txt"}

def get_cur():
    db = get_db()
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# ── Upload material ────────────────────────────────────────────────
@bp.post("/upload")
@jwt_required_custom
@require_permission("material.upload")
def upload_material():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    db  = get_db()

    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t:
        return error("Teacher profile not found.", 403)
    teacher_id = t["id"]

    class_id   = request.form.get("class_id")
    subject_id = request.form.get("subject_id")
    title      = request.form.get("title","").strip()
    description= request.form.get("description","").strip()

    if not all([class_id, subject_id, title]):
        return error("class_id, subject_id and title are required.", 400)
    if "file" not in request.files:
        return error("No file uploaded.", 400)

    file = request.files["file"]
    if not file.filename:
        return error("Empty file.", 400)

    ext = file.filename.rsplit(".",1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT:
        return error(f"File type .{ext} not allowed.", 400)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path   = os.path.join(UPLOAD_DIR, unique_name)
    file.save(file_path)
    file_size   = os.path.getsize(file_path)

    cur.execute("""
        INSERT INTO study_materials (class_id,subject_id,teacher_id,title,description,file_name,file_path,file_type,file_size)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (class_id, subject_id, teacher_id, title, description, file.filename, unique_name, ext, file_size))
    new_id = cur.fetchone()["id"]
    db.commit()
    # Notify students and parents
    from app.utils.notify import send_to_class
    cur.execute("SELECT s.name AS sname, c.name AS cname, c.section FROM subjects s, classes c WHERE s.id=%s AND c.id=%s", (subject_id, class_id))
    row = cur.fetchone()
    subj_name = row["sname"] if row else "a subject"
    cls_name  = row["cname"]+((" ("+row["section"]+")") if row and row["section"] else "") if row else "your class"
    send_to_class(int(class_id),
        title="New Study Material",
        body=f"New material '{title}' uploaded for {subj_name} in {cls_name}.",
        ntype="info",
        notify_students=True, notify_parents=True, notify_teachers=False)
    return success(data={"id": new_id}, message="Material uploaded successfully.")

# ── List materials ─────────────────────────────────────────────────
@bp.get("/")
@jwt_required_custom
@require_permission("material.view")
def list_materials():
    class_id   = request.args.get("class_id")
    subject_id = request.args.get("subject_id")
    cur = get_cur()
    cur.execute("""
        SELECT sm.*, s.name AS subject_name,
               t.first_name||' '||t.last_name AS teacher_name,
               c.name AS class_name, c.section
        FROM study_materials sm
        JOIN subjects  s ON s.id = sm.subject_id
        JOIN teachers  t ON t.id = sm.teacher_id
        JOIN classes   c ON c.id = sm.class_id
        WHERE (%s IS NULL OR sm.class_id=%s)
          AND (%s IS NULL OR sm.subject_id=%s)
        ORDER BY sm.created_at DESC
    """, (class_id, class_id, subject_id, subject_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("created_at"): r["created_at"] = str(r["created_at"])
    return success(data=rows)

# ── Download material ──────────────────────────────────────────────
@bp.get("/<int:id>/download")
@jwt_required_custom
@require_permission("material.view")
def download_material(id):
    cur = get_cur()
    cur.execute("SELECT * FROM study_materials WHERE id=%s", (id,))
    m = cur.fetchone()
    if not m:
        abort(404)
    file_path = os.path.join(UPLOAD_DIR, m["file_path"])
    if not os.path.exists(file_path):
        abort(404)
    return send_file(file_path, download_name=m["file_name"], as_attachment=True)

# ── Delete material ────────────────────────────────────────────────
@bp.delete("/<int:id>")
@jwt_required_custom
@require_permission("material.delete")
def delete_material(id):
    user_id = int(get_jwt_identity())
    cur = get_cur()
    db  = get_db()
    cur.execute("SELECT sm.*, t.user_id FROM study_materials sm JOIN teachers t ON t.id=sm.teacher_id WHERE sm.id=%s", (id,))
    m = cur.fetchone()
    if not m:
        return error("Material not found.", 404)
    # Only uploader or admin can delete
    from app.db.connection import get_db as gdb
    cur.execute("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=%s", (user_id,))
    roles = [r["name"] for r in cur.fetchall()]
    if m["user_id"] != user_id and not any(r in roles for r in ["superadmin","admin","principal"]):
        return error("Permission denied.", 403)
    # Delete file
    fp = os.path.join(UPLOAD_DIR, m["file_path"])
    if os.path.exists(fp):
        os.remove(fp)
    cur.execute("DELETE FROM study_materials WHERE id=%s", (id,))
    db.commit()
    return success(message="Material deleted.")

# ── Teacher: my classes for material upload ────────────────────────
@bp.get("/my-classes")
@jwt_required_custom
@require_permission("material.upload")
def my_classes():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("""
        SELECT DISTINCT c.id, c.name, c.section, c.class_type, ct.is_primary
        FROM class_teachers ct
        JOIN classes c ON c.id = ct.class_id
        JOIN teachers t ON t.id = ct.teacher_id
        WHERE t.user_id = %s ORDER BY c.name, c.section
    """, (user_id,))
    return success(data=[dict(r) for r in cur.fetchall()])