"""
Native FastAPI router for Syllabus - migrated from app/api/v1/syllabus.py.
Role/permission-based filtering (list_syllabus, mark_topic) uses JWT claims
directly via get_jwt_claims, matching the original Flask get_jwt() usage.
File upload/download use FastAPI's native UploadFile/Form and
FileResponse/send_from_directory equivalent.
"""

import os
import time
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "syllabus")
ALLOWED_EXT = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".jpg", ".jpeg", ".png"}


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class SyllabusCreateIn(BaseModel):
    class_id: Any
    subject_id: Any
    title: str
    description: Optional[str] = ""
    academic_year_id: Optional[Any] = None
    topics: Optional[list] = []


class SyllabusUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class TopicIn(BaseModel):
    title: str
    description: Optional[str] = ""
    planned_week: Optional[Any] = None
    planned_month: Optional[Any] = None
    planned_date: Optional[Any] = None
    month_group_title: Optional[Any] = None


class MarkTopicIn(BaseModel):
    action: Optional[str] = "cover"
    covered_at: Optional[Any] = None
    note: Optional[str] = ""


@router.get("/")
def list_syllabus(
    class_id: Optional[int] = Query(None), subject_id: Optional[int] = Query(None),
    academic_year_id: Optional[int] = Query(None), student_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("syllabus.view")), db=Depends(get_db),
    claims: dict = Depends(get_jwt_claims),
):
    roles = claims.get("roles", [])
    perms = claims.get("permissions", [])
    role = roles[0] if roles else ""
    has_manage = "syllabus.manage" in perms

    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_list_syllabus(%s, %s, %s, %s, %s, %s, %s)",
        (user_id, role, has_manage, class_id, subject_id, academic_year_id, student_id)
    )
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["created_at"] = str(r["created_at"])
    return ok(data=rows)


@router.get("/{sid}")
def get_syllabus(sid: int, user_id: int = Depends(require_permission("syllabus.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_syllabus_by_id(%s)", (sid,))
    row = cur.fetchone()
    if not row:
        fail("Syllabus not found", 404)
    result = dict(row)
    for k in ("created_at", "updated_at"):
        if result.get(k):
            result[k] = str(result[k])

    cur.execute("SELECT * FROM sp_get_syllabus_topics(%s)", (sid,))
    topics = [dict(r) for r in cur.fetchall()]
    for t in topics:
        for k in ("covered_at", "planned_date"):
            if t.get(k):
                t[k] = str(t[k])
    result["topics"] = topics
    return ok(data=result)


@router.post("/")
def create_syllabus(body: SyllabusCreateIn, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_active_academic_year() AS yid")
    yr = cur.fetchone()
    if not yr or not yr["yid"]:
        fail("No active academic year", 400)
    year_id = body.academic_year_id or yr["yid"]

    cur.execute("SELECT sp_check_syllabus_exists(%s, %s, %s) AS exists", (body.class_id, body.subject_id, year_id))
    if cur.fetchone()["exists"]:
        fail("Syllabus already exists for this class, subject and year", 400)

    cur.execute(
        "SELECT sp_create_syllabus(%s,%s,%s,%s,%s,%s) AS id",
        (body.class_id, body.subject_id, year_id, body.title, body.description or "", user_id)
    )
    sy_id = cur.fetchone()["id"]

    for i, t in enumerate(body.topics or []):
        if t.get("title"):
            cur.execute(
                "SELECT sp_create_syllabus_topic_simple(%s, %s, %s, %s)",
                (sy_id, t["title"], t.get("description", ""), i)
            )
    db.commit()
    return ok(data={"id": sy_id}, message="Syllabus created.")


@router.put("/{sid}")
def update_syllabus(sid: int, body: SyllabusUpdateIn, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_syllabus_by_id(%s)", (sid,))
    if not cur.fetchone():
        fail("Syllabus not found", 404)
    cur.execute("SELECT sp_update_syllabus(%s, %s, %s)", (sid, body.title, body.description))
    db.commit()
    return ok(message="Syllabus updated.")


@router.delete("/{sid}")
def delete_syllabus(sid: int, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_syllabus_by_id(%s)", (sid,))
    if not cur.fetchone():
        fail("Syllabus not found", 404)
    cur.execute("SELECT sp_delete_syllabus(%s)", (sid,))
    db.commit()
    return ok(message="Syllabus deleted.")


@router.post("/{sid}/topics")
def add_topic(sid: int, body: TopicIn, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_syllabus_by_id(%s)", (sid,))
    if not cur.fetchone():
        fail("Syllabus not found", 404)

    cur.execute("SELECT sp_get_next_topic_order(%s) AS next", (sid,))
    next_order = cur.fetchone()["next"]

    cur.execute(
        "SELECT sp_add_syllabus_topic(%s,%s,%s,%s,%s,%s,%s,%s) AS id",
        (sid, body.title, body.description or "", next_order,
         body.planned_week, body.planned_month, body.planned_date, body.month_group_title)
    )
    topic_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": topic_id}, message="Topic added.")


@router.put("/{sid}/topics/{tid}")
def update_topic(sid: int, tid: int, body: TopicIn, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_update_syllabus_topic(%s,%s,%s,%s,%s,%s,%s)",
        (tid, sid, body.title, body.description or "", body.planned_week, body.planned_month, body.planned_date)
    )
    db.commit()
    return ok(message="Topic updated.")


@router.delete("/{sid}/topics/{tid}")
def delete_topic(sid: int, tid: int, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_syllabus_topic(%s, %s)", (tid, sid))
    db.commit()
    return ok(message="Topic deleted.")


@router.post("/{sid}/topics/{tid}/mark")
def mark_topic(
    sid: int, tid: int, body: MarkTopicIn,
    user_id: int = Depends(require_permission("syllabus.mark")), db=Depends(get_db),
    claims: dict = Depends(get_jwt_claims),
):
    roles = claims.get("roles", [])
    role = roles[0] if roles else ""

    cur = get_cur(db)
    cur.execute("SELECT sp_check_syllabus_topic_exists(%s, %s) AS exists", (tid, sid))
    if not cur.fetchone()["exists"]:
        fail("Topic not found", 404)

    if role == "teacher":
        cur.execute("SELECT sp_check_teacher_can_mark(%s, %s) AS can_mark", (user_id, sid))
        if not cur.fetchone()["can_mark"]:
            fail("You are not assigned to teach this subject", 403)

    action = body.action or "cover"
    cur.execute(
        "SELECT sp_mark_syllabus_topic(%s, %s, %s, %s, %s)",
        (tid, action, user_id, body.covered_at, body.note or "")
    )
    db.commit()

    cur.execute("SELECT * FROM sp_get_topic_completion_counts(%s)", (sid,))
    counts = cur.fetchone()
    if counts and counts["total"] > 0 and counts["total"] == counts["covered"] and action == "cover":
        try:
            from app.utils.notify import send_notification
            cur.execute("SELECT * FROM sp_get_syllabus_notify_info(%s)", (sid,))
            sy = cur.fetchone()
            cur.execute("SELECT * FROM sp_get_principals_admins()")
            for row in cur.fetchall():
                send_notification(
                    row["id"], title="Syllabus Completed",
                    body=sy["subject_name"] + " syllabus for " + sy["class_name"] + " is 100% complete.",
                    ntype="info"
                )
        except Exception as e:
            print("[syllabus notify]", e)

    return ok(message="Topic " + ("covered" if action == "cover" else "uncovered") + ".")


@router.post("/{sid}/topics/{tid}/attach")
def attach_file(
    sid: int, tid: int, file: UploadFile = File(...),
    user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT sp_check_syllabus_topic_exists(%s, %s) AS exists", (tid, sid))
    if not cur.fetchone()["exists"]:
        fail("Topic not found", 404)

    if not file.filename:
        fail("No file uploaded", 400)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        fail("Invalid file type", 400)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    fname = "syllabus_" + str(tid) + "_" + str(int(time.time())) + ext
    with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
        f.write(file.file.read())

    cur.execute("SELECT sp_create_syllabus_attachment(%s, %s, %s) AS id", (tid, file.filename, fname))
    att_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": att_id, "url": fname}, message="File attached.")


@router.delete("/{sid}/topics/{tid}/attach/{aid}")
def delete_attachment(sid: int, tid: int, aid: int, user_id: int = Depends(require_permission("syllabus.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_syllabus_attachment(%s, %s)", (aid, tid))
    row = cur.fetchone()
    if not row:
        fail("Attachment not found", 404)
    try:
        os.remove(os.path.join(UPLOAD_DIR, row["url"]))
    except Exception:
        pass
    cur.execute("SELECT sp_delete_syllabus_attachment(%s)", (aid,))
    db.commit()
    return ok(message="Attachment deleted.")


@router.get("/{sid}/topics/{tid}/attach/{aid}")
def download_attachment(sid: int, tid: int, aid: int, user_id: int = Depends(require_permission("syllabus.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_syllabus_attachment(%s, %s)", (aid, tid))
    row = cur.fetchone()
    if not row:
        fail("Attachment not found", 404)
    fp = os.path.join(UPLOAD_DIR, row["url"])
    if not os.path.exists(fp):
        fail("File not found on server.", 404)
    return FileResponse(fp, filename=row["filename"])
