"""
Native FastAPI router for Announcements - migrated from app/api/v1/announcements.py.
Most business logic already lived in stored procedures (verified clean, no
broken chr()-stub pattern found). The remaining role/class lookup, previously
duplicated inline in two routes, is now a dedicated stored procedure.
"""

from datetime import date as date_cls
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def serialize(rows):
    result = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = str(v)
        result.append(d)
    return result


class AnnouncementIn(BaseModel):
    title: str
    body: str
    priority: Optional[str] = "normal"
    target_role: Optional[str] = "all"
    target_class: Optional[Any] = None
    start_date: Optional[str] = None
    end_date: Optional[Any] = None
    attachment: Optional[Any] = None


class AnnouncementUpdateIn(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    priority: Optional[str] = "normal"
    target_role: Optional[str] = "all"
    target_class: Optional[Any] = None
    end_date: Optional[Any] = None
    is_active: Optional[bool] = True


@router.get("/")
def list_announcements(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_user_role_and_class(%s)", (user_id,))
    row = cur.fetchone()
    role, class_id = row["role_name"], row["class_id"]

    cur.execute("SELECT * FROM sp_get_announcements(%s,%s,%s,%s)", (user_id, role, class_id, 100))
    rows = serialize(cur.fetchall())
    return ok(data=rows)


@router.get("/unread-count")
def unread_count(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_user_role_and_class(%s)", (user_id,))
    row = cur.fetchone()
    role, class_id = row["role_name"], row["class_id"]

    cur.execute("SELECT sp_unread_announcements_count(%s,%s,%s) AS cnt", (user_id, role, class_id))
    cnt = cur.fetchone()["cnt"]
    return ok(data={"count": cnt})


@router.post("/")
def create_announcement(body: AnnouncementIn, user_id: int = Depends(require_permission("announcement.create")), db=Depends(get_db)):
    if not body.title or not body.body:
        fail("Title and body required.", 400)

    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_announcement(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            body.title, body.body, body.priority or "normal", body.target_role or "all",
            body.target_class or None, user_id, body.start_date or str(date_cls.today()),
            body.end_date or None, "manual", None, None, body.attachment or None,
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Announcement created.")


@router.put("/{id}")
def update_announcement(id: int, body: AnnouncementUpdateIn, user_id: int = Depends(require_permission("announcement.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_announcement(%s,%s,%s,%s,%s,%s,%s,%s)",
        (id, body.title, body.body, body.priority or "normal", body.target_role or "all",
         body.target_class or None, body.end_date or None, body.is_active if body.is_active is not None else True)
    )
    result = cur.fetchone()
    if not result["success"]:
        fail(result["error_msg"], 404)
    db.commit()
    return ok(message="Updated.")


@router.delete("/{id}")
def delete_announcement(id: int, user_id: int = Depends(require_permission("announcement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_delete_announcement(%s)", (id,))
    result = cur.fetchone()
    if not result["success"]:
        fail(result["error_msg"], 404)
    db.commit()
    return ok(message="Deleted.")


@router.post("/{id}/read")
def mark_read(id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_mark_announcement_read(%s,%s)", (id, user_id))
    db.commit()
    return ok(message="Marked as read.")
