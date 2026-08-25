"""
Native FastAPI router for Diary - migrated from app/api/v1/diary.py.
Fully self-contained inline SQL in the original, now converted to
dedicated stored procedures.
"""

from typing import Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class SaveEntryIn(BaseModel):
    class_id: Any
    subject_id: Any
    date: str
    classwork: Optional[str] = ""
    homework: Optional[str] = ""
    notes: Optional[str] = ""


class PublishIn(BaseModel):
    class_id: Any
    date: str
    force: Optional[bool] = False


class RemindIn(BaseModel):
    teacher_id: Any
    class_id: Any
    date: Optional[str] = None


class RemindPublishIn(BaseModel):
    incharge_user_id: Any
    class_name: Optional[str] = "your class"
    date: Optional[str] = None


@router.get("/")
def get_diary(
    date: Optional[str] = Query(None), class_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("diary.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    published = False
    if class_id and date:
        cur.execute("SELECT sp_check_diary_published(%s, %s) AS pub", (class_id, date))
        published = cur.fetchone()["pub"]

    cur.execute("SELECT * FROM sp_list_diary_entries(%s, %s)", (class_id, date))
    entries = [dict(r) for r in cur.fetchall()]
    for e in entries:
        for k in ("date", "created_at", "updated_at"):
            if e.get(k):
                e[k] = str(e[k])
    return ok(data={"entries": entries, "published": published})


@router.post("/entry")
def save_entry(body: SaveEntryIn, user_id: int = Depends(require_permission("diary.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher profile not found.", 403)
    teacher_id = row["tid"]

    cur.execute("SELECT sp_check_diary_published(%s, %s) AS pub", (body.class_id, body.date))
    if cur.fetchone()["pub"]:
        fail("Diary has been published and cannot be edited.", 403)

    cur.execute(
        "SELECT * FROM sp_save_diary_entry(%s,%s,%s,%s,%s,%s,%s)",
        (body.class_id, body.subject_id, teacher_id, body.date, body.classwork or "", body.homework or "", body.notes or "")
    )
    entry = dict(cur.fetchone())
    db.commit()
    if entry.get("date"):
        entry["date"] = str(entry["date"])
    return ok(data=entry, message="Diary entry saved.")


@router.post("/publish")
def publish_diary(body: PublishIn, user_id: int = Depends(require_permission("diary.publish")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    teacher_id = row["tid"] if row else None

    if not body.force:
        cur.execute("SELECT * FROM sp_get_pending_diary_teachers(%s, %s)", (body.class_id, body.date))
        pending = [dict(r) for r in cur.fetchall()]
        if pending:
            fail("Some teachers have not submitted their diary yet.", 400, details=pending)

    cur.execute("SELECT sp_publish_diary(%s, %s, %s)", (body.class_id, body.date, teacher_id))
    db.commit()

    try:
        from app.utils.notify import send_to_class
        cur.execute("SELECT * FROM sp_get_class_name(%s)", (body.class_id,))
        cls = cur.fetchone()
        cls_name = (cls["name"] + ((" (" + cls["section"] + ")") if cls and cls["section"] else "")) if cls else "your class"
        send_to_class(
            body.class_id, title="Daily Diary Published",
            body="The daily diary for " + cls_name + " has been published for " + body.date + ".",
            ntype="info", notify_students=True, notify_parents=True, notify_teachers=False
        )
    except Exception:
        pass

    return ok(message="Diary published successfully.")


@router.get("/status")
def diary_status(
    class_id: Optional[int] = Query(None), date: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("diary.view")), db=Depends(get_db),
):
    if not class_id or not date:
        fail("class_id and date required.", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_diary_status(%s, %s)", (class_id, date))
    rows = [dict(r) for r in cur.fetchall()]
    submitted = [r for r in rows if r["status"] == "submitted"]
    pending = [r for r in rows if r["status"] == "pending"]
    return ok(data={"submitted": submitted, "pending": pending})


@router.post("/remind")
def send_reminder(body: RemindIn, user_id: int = Depends(require_permission("diary.publish")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_teacher_for_reminder(%s)", (body.teacher_id,))
    t = cur.fetchone()
    if not t:
        fail("Teacher not found.", 404)
    cur.execute(
        "SELECT sp_insert_notification(%s, %s, %s, 'reminder')",
        (t["user_id"], "Diary Reminder", "Please submit your daily diary for " + str(body.date) + ". Your diary entry is pending.")
    )
    db.commit()
    return ok(message="Reminder sent to " + t["first_name"] + ".")


@router.get("/my-classes")
def my_classes(user_id: int = Depends(require_permission("diary.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_my_classes(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/my-subjects")
def my_subjects(class_id: Optional[int] = Query(None), user_id: int = Depends(require_permission("diary.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        return ok(data=[])
    teacher_id = row["tid"]

    cur.execute("SELECT * FROM sp_check_class_teacher_montessori(%s, %s)", (teacher_id, class_id))
    ct = cur.fetchone()

    if ct and ct["is_primary"] and ct["class_type"] == "montessori":
        cur.execute("SELECT * FROM sp_get_class_subjects(%s)", (class_id,))
        rows = [dict(r) for r in cur.fetchall()]
        data = [{"id": r["subject_id"], "subject_name": r["subject_name"], "code": r["code"]} for r in rows]
    else:
        cur.execute("SELECT * FROM sp_get_teacher_timetable_subjects(%s, %s)", (teacher_id, class_id))
        data = [dict(r) for r in cur.fetchall()]

    return ok(data=data)


@router.get("/student")
def student_diary(date: Optional[str] = Query(None), user_id: int = Depends(require_permission("diary.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_student_class(%s) AS cid", (user_id,))
    row = cur.fetchone()
    if not row or not row["cid"]:
        fail("Student not found.", 404)
    class_id = row["cid"]

    query_date = date or get_processing_date(db).strftime("%Y-%m-%d")
    cur.execute("SELECT sp_check_diary_published(%s, %s) AS pub", (class_id, query_date))
    if not cur.fetchone()["pub"]:
        return ok(data={"entries": [], "published": False})

    cur.execute("SELECT * FROM sp_get_student_diary(%s, %s)", (class_id, query_date))
    entries = [dict(r) for r in cur.fetchall()]
    for e in entries:
        if e.get("date"):
            e["date"] = str(e["date"])

    cur.execute("SELECT * FROM sp_get_class_name(%s)", (class_id,))
    cls = cur.fetchone()
    class_name = cls["name"] if cls else None
    section = cls["section"] if cls else None

    return ok(data={"entries": entries, "published": True, "class_name": class_name, "section": section})


@router.get("/all-status")
def all_classes_status(date: Optional[str] = Query(None), user_id: int = Depends(require_permission("diary.view")), db=Depends(get_db)):
    query_date = date or get_processing_date(db).strftime("%Y-%m-%d")
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_classes_diary_status(%s)", (query_date,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("published_at"):
            r["published_at"] = str(r["published_at"])
    return ok(data=rows)


@router.post("/remind-publish")
def remind_publish(body: RemindPublishIn, user_id: int = Depends(require_permission("diary.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_insert_notification(%s, %s, %s, 'reminder')",
        (
            body.incharge_user_id, "Diary Publish Reminder",
            "Please publish the daily diary for " + (body.class_name or "your class") + " for " + str(body.date) + ". Students and parents are waiting."
        )
    )
    db.commit()
    return ok(message="Reminder sent to class incharge.")
