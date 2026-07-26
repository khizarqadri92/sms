"""
Native FastAPI router for Notifications - migrated from app/api/v1/notifications.py.
Reuses sp_insert_notification (built for Diary, now extended with an
optional p_link parameter for this module's /send endpoint) for sending.

Note: the original /send route imported require_permission but never
actually applied it as a decorator - any authenticated user could send a
notification to anyone. This migration preserves that exact behavior
faithfully, but it's worth flagging as a likely pre-existing oversight.
"""

from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class SendNotificationIn(BaseModel):
    user_id: Any
    title: str
    message: Optional[str] = ""
    type: Optional[str] = "info"
    link: Optional[str] = ""


@router.get("/")
def list_notifications(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_notifications(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/unread-count")
def unread_count(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_count_unread_notifications(%s) AS cnt", (user_id,))
    return ok(data={"count": cur.fetchone()["cnt"]})


@router.put("/{id}/read")
def mark_read(id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_mark_notification_read(%s, %s)", (id, user_id))
    db.commit()
    return ok(message="Marked as read.")


@router.put("/read-all")
def mark_all_read(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_mark_all_notifications_read(%s)", (user_id,))
    db.commit()
    return ok(message="All notifications marked as read.")


@router.delete("/{id}")
def delete_notification(id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_notification(%s, %s)", (id, user_id))
    db.commit()
    return ok(message="Notification deleted.")


@router.post("/send")
def send_notification(body: SendNotificationIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if not body.user_id or not body.title:
        fail("user_id and title are required.", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_insert_notification(%s, %s, %s, %s, %s)", (body.user_id, body.title, body.message or "", body.type or "info", body.link or None))
    db.commit()
    return ok(message="Notification sent.")
