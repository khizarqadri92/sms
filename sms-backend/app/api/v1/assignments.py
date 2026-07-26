"""
Native FastAPI router for Assignments - migrated from app/api/v1/assignments.py.
File upload/download use FastAPI's native UploadFile/Form and FileResponse.
The original create_assignment endpoint supported both JSON and multipart
bodies; since file attachment is optional but the endpoint must support file
upload at all, this is standardized on multipart Form fields (matching what
any frontend supporting optional file attachment would need to send anyway).
"""

import os
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "assignments")
ALLOWED_EXT = {"pdf", "doc", "docx", "xls", "xlsx"}


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class GradeIn(BaseModel):
    marks: float
    feedback: Optional[str] = ""


@router.post("/")
def create_assignment(
    class_id: int = Form(...), subject_id: int = Form(...), title: str = Form(...),
    due_date: str = Form(...), total_marks: float = Form(...),
    description: Optional[str] = Form(""), file: Optional[UploadFile] = File(None),
    user_id: int = Depends(require_permission("assignment.create")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher not found.", 403)
    teacher_id = row["tid"]

    fname = fpath = ftype = fsize = None
    if file and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        unique_name = "asgn_" + uuid.uuid4().hex + "." + ext
        fp = os.path.join(UPLOAD_DIR, unique_name)
        with open(fp, "wb") as f:
            f.write(file.file.read())
        fname, fpath, ftype = file.filename, unique_name, ext
        fsize = os.path.getsize(fp)

    cur.execute(
        "SELECT sp_create_assignment(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) AS id",
        (class_id, subject_id, teacher_id, title, description or "", due_date, total_marks, fname, fpath, ftype, fsize)
    )
    new_id = cur.fetchone()["id"]
    db.commit()

    try:
        from app.utils.notify import send_to_class
        cur.execute("SELECT * FROM sp_get_subject_class_names(%s, %s)", (subject_id, class_id))
        row2 = cur.fetchone()
        sname = row2["subject_name"] if row2 else "a subject"
        cname = (row2["class_name"] + ((" (" + row2["section"] + ")") if row2 and row2["section"] else "")) if row2 else ""
        send_to_class(
            int(class_id), title="New Assignment",
            body="New assignment '" + title + "' for " + sname + " in " + cname + ". Due: " + due_date + ".",
            ntype="info", notify_students=True, notify_parents=True, notify_teachers=False
        )
    except Exception:
        pass

    return ok(data={"id": new_id}, message="Assignment created.")


@router.get("/")
def list_assignments(
    class_id: Optional[int] = Query(None), subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("assignment.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_assignments(%s, %s)", (class_id, subject_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["due_date"] = str(r["due_date"])
        r["created_at"] = str(r["created_at"])
        r["is_overdue"] = r["due_date"] < date.today().isoformat()
    return ok(data=rows)


@router.get("/my-assignments")
def my_assignments(user_id: int = Depends(require_permission("assignment.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        return ok(data=[])
    cur.execute("SELECT * FROM sp_get_my_teacher_assignments(%s)", (row["tid"],))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["due_date"] = str(r["due_date"])
        r["created_at"] = str(r["created_at"])
        r["is_overdue"] = r["due_date"] < date.today().isoformat()
    return ok(data=rows)


@router.get("/student")
def student_assignments(user_id: int = Depends(require_permission("assignment.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_student_id_class_by_user(%s)", (user_id,))
    s = cur.fetchone()
    if not s:
        return ok(data=[])
    cur.execute("SELECT * FROM sp_get_student_assignments(%s, %s)", (s["id"], s["class_id"]))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["due_date"] = str(r["due_date"])
        r["created_at"] = str(r["created_at"])
        r["submitted_at"] = str(r["submitted_at"]) if r["submitted_at"] else None
        r["is_overdue"] = r["due_date"] < date.today().isoformat()
        r["can_submit"] = (not r["is_overdue"]) and (not r["submission_id"])
    return ok(data=rows)


@router.get("/student-history")
def student_assignment_history(
    student_id: Optional[int] = Query(None), before_date: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("assignment.view")), db=Depends(get_db),
):
    if not student_id:
        fail("student_id required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_student_assignment_history(%s, %s)", (student_id, before_date))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("due_date", "submitted_at"):
            if r.get(k):
                r[k] = str(r[k])
    return ok(data=rows)


@router.post("/{id}/submit")
def submit_assignment(
    id: int, file: UploadFile = File(...),
    user_id: int = Depends(require_permission("assignment.submit")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_student_id_class_by_user(%s)", (user_id,))
    s = cur.fetchone()
    if not s:
        fail("Student not found.", 403)

    cur.execute("SELECT * FROM sp_get_assignment_by_id(%s)", (id,))
    asgn = cur.fetchone()
    if not asgn:
        fail("Assignment not found.", 404)

    if str(asgn["due_date"]) < date.today().isoformat():
        fail("Due date has passed. Submission not allowed.", 400)

    cur.execute("SELECT sp_check_already_submitted(%s, %s) AS submitted", (id, s["id"]))
    if cur.fetchone()["submitted"]:
        fail("You have already submitted this assignment.", 400)

    if not file.filename:
        fail("No file uploaded.", 400)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT:
        fail("File type ." + ext + " not allowed. Use PDF, DOC, DOCX, XLS, XLSX.", 400)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = uuid.uuid4().hex + "." + ext
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    file_size = os.path.getsize(file_path)

    cur.execute(
        "SELECT sp_create_submission(%s,%s,%s,%s,%s,%s) AS id",
        (id, s["id"], file.filename, unique_name, ext, file_size)
    )
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT * FROM sp_get_teacher_for_submission_notify(%s, %s)", (s["id"], id))
        row = cur.fetchone()
        if row:
            send_notification(
                row["teacher_user_id"], "Assignment Submitted",
                row["first_name"] + " " + row["last_name"] + " submitted '" + asgn["title"] + "'.",
                "info"
            )
    except Exception:
        pass

    return ok(message="Assignment submitted successfully.")


@router.get("/{id}/submissions")
def get_submissions(id: int, user_id: int = Depends(require_permission("assignment.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_submissions_for_assignment(%s)", (id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["submitted_at"] = str(r["submitted_at"])
    cur.execute("SELECT * FROM sp_get_unsubmitted_students(%s)", (id,))
    not_submitted = [dict(r) for r in cur.fetchall()]
    return ok(data={"submissions": rows, "not_submitted": not_submitted})


@router.put("/submissions/{sub_id}/grade")
def grade_submission(sub_id: int, body: GradeIn, user_id: int = Depends(require_permission("assignment.grade")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_submission_for_grading(%s)", (sub_id,))
    sub = cur.fetchone()
    if not sub:
        fail("Submission not found.", 404)

    if body.marks > sub["total_marks"]:
        fail("Marks cannot exceed total marks (" + str(sub["total_marks"]) + ").", 400)

    cur.execute("SELECT sp_grade_submission(%s, %s, %s, %s)", (sub_id, body.marks, body.feedback or "", user_id))
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT sp_get_student_user_id(%s) AS uid", (sub["student_id"],))
        stu = cur.fetchone()
        if stu and stu["uid"]:
            send_notification(
                stu["uid"], "Assignment Graded",
                "Your assignment '" + sub["title"] + "' has been graded. Marks: " + str(body.marks) + "/" + str(sub["total_marks"]) + ".",
                "success"
            )
    except Exception:
        pass

    return ok(message="Marks saved.")


@router.get("/submissions/{sub_id}/download")
def download_submission(sub_id: int, user_id: int = Depends(require_permission("assignment.grade")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_submission_by_id(%s)", (sub_id,))
    sub = cur.fetchone()
    if not sub:
        raise HTTPException(status_code=404)
    fp = os.path.join(UPLOAD_DIR, sub["file_path"])
    if not os.path.exists(fp):
        raise HTTPException(status_code=404)
    return FileResponse(fp, filename=sub["file_name"])


@router.get("/{id}/download")
def download_assignment_file(id: int, user_id: int = Depends(require_permission("assignment.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_assignment_by_id(%s)", (id,))
    a = cur.fetchone()
    if not a:
        raise HTTPException(status_code=404)
    if not a["file_path"]:
        fail("No file attached to this assignment.", 404)
    fp = os.path.join(UPLOAD_DIR, a["file_path"])
    if not os.path.exists(fp):
        fail("File not found on server.", 404)
    return FileResponse(fp, filename=a["file_name"])


@router.delete("/{id}")
def delete_assignment(id: int, user_id: int = Depends(require_permission("assignment.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_assignment_for_delete(%s)", (id,))
    a = cur.fetchone()
    if not a:
        fail("Assignment not found.", 404)

    if a["teacher_user_id"] != user_id:
        cur.execute("SELECT sp_user_has_role_in(%s, %s) AS has_role", (user_id, ["superadmin", "admin", "principal"]))
        if not cur.fetchone()["has_role"]:
            fail("Permission denied.", 403)

    if a["file_path"]:
        fp = os.path.join(UPLOAD_DIR, a["file_path"])
        if os.path.exists(fp):
            os.remove(fp)
    cur.execute("SELECT sp_delete_assignment(%s)", (id,))
    db.commit()
    return ok(message="Assignment deleted.")
