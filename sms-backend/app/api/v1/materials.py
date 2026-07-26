"""
Native FastAPI router for Materials - migrated from app/api/v1/materials.py.
File upload/download use FastAPI's native UploadFile/Form and FileResponse
mechanisms instead of Flask's request.files/send_file.
"""

import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "materials")
ALLOWED_EXT = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "mp4", "zip", "txt"}


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


@router.post("/upload")
def upload_material(
    class_id: int = Form(...), subject_id: int = Form(...), title: str = Form(...),
    description: Optional[str] = Form(""), file: UploadFile = File(...),
    user_id: int = Depends(require_permission("material.upload")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher profile not found.", 403)
    teacher_id = row["tid"]

    title = (title or "").strip()
    description = (description or "").strip()
    if not title:
        fail("class_id, subject_id and title are required.", 400)
    if not file.filename:
        fail("Empty file.", 400)

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT:
        fail("File type ." + ext + " not allowed.", 400)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = uuid.uuid4().hex + "." + ext
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    contents = file.file.read()
    with open(file_path, "wb") as f:
        f.write(contents)
    file_size = os.path.getsize(file_path)

    cur.execute(
        "SELECT sp_create_material(%s,%s,%s,%s,%s,%s,%s,%s,%s) AS id",
        (class_id, subject_id, teacher_id, title, description, file.filename, unique_name, ext, file_size)
    )
    new_id = cur.fetchone()["id"]
    db.commit()

    try:
        from app.utils.notify import send_to_class
        cur.execute("SELECT * FROM sp_get_subject_class_names(%s, %s)", (subject_id, class_id))
        row2 = cur.fetchone()
        subj_name = row2["subject_name"] if row2 else "a subject"
        cls_name = (row2["class_name"] + ((" (" + row2["section"] + ")") if row2 and row2["section"] else "")) if row2 else "your class"
        send_to_class(
            int(class_id), title="New Study Material",
            body="New material '" + title + "' uploaded for " + subj_name + " in " + cls_name + ".",
            ntype="info", notify_students=True, notify_parents=True, notify_teachers=False
        )
    except Exception:
        pass

    return ok(data={"id": new_id}, message="Material uploaded successfully.")


@router.get("/")
def list_materials(
    class_id: Optional[int] = Query(None), subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("material.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_materials(%s, %s)", (class_id, subject_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
    return ok(data=rows)


@router.get("/my-classes")
def my_classes(user_id: int = Depends(require_permission("material.upload")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_classes(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/{id}/download")
def download_material(id: int, user_id: int = Depends(require_permission("material.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_material_by_id(%s)", (id,))
    m = cur.fetchone()
    if not m:
        raise HTTPException(status_code=404)
    file_path = os.path.join(UPLOAD_DIR, m["file_path"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404)
    return FileResponse(file_path, filename=m["file_name"])


@router.delete("/{id}")
def delete_material(id: int, user_id: int = Depends(require_permission("material.delete")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_material_for_delete(%s)", (id,))
    m = cur.fetchone()
    if not m:
        fail("Material not found.", 404)

    if m["uploader_user_id"] != user_id:
        cur.execute("SELECT sp_user_has_role_in(%s, %s) AS has_role", (user_id, ["superadmin", "admin", "principal"]))
        if not cur.fetchone()["has_role"]:
            fail("Permission denied.", 403)

    fp = os.path.join(UPLOAD_DIR, m["file_path"])
    if os.path.exists(fp):
        os.remove(fp)
    cur.execute("SELECT sp_delete_material(%s)", (id,))
    db.commit()
    return ok(message="Material deleted.")
