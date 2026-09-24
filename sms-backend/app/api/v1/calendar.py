"""
Native FastAPI router for Calendar - migrated from app/api/v1/calendar.py.
Fully self-contained inline SQL in the original, now converted to
dedicated stored procedures.
"""

from datetime import date as date_cls
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_campus import get_current_campus_id
from app.fastapi_campus import enforce_same_campus, catalog_campus_id, catalog_campus_id_for_write
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class EventIn(BaseModel):
    title: str
    description: Optional[str] = ""
    event_date: str
    end_date: Optional[Any] = None
    event_type: Optional[str] = "event"
    is_holiday: Optional[bool] = False


class EventTypeIn(BaseModel):
    name: str
    color: Optional[str] = "#2563eb"
    is_holiday: Optional[bool] = False


@router.get("/")
def list_events(
    month: Optional[int] = Query(None), year: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("calendar.view")), db=Depends(get_db),
):
    y = year or get_processing_date(db).year
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_calendar_events(%s, %s)", (y, month))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["event_date"] = str(r["event_date"])
        r["end_date"] = str(r["end_date"]) if r.get("end_date") else None
        r["created_at"] = str(r["created_at"])
    return ok(data=rows)


@router.post("/")
def create_event(body: EventIn, user_id: int = Depends(require_permission("calendar.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_create_calendar_event(%s,%s,%s,%s,%s,%s,%s) AS id",
        (body.title, body.description or "", body.event_date, body.end_date or None,
         body.event_type or "event", body.is_holiday or False, user_id)
    )
    new_id = cur.fetchone()["id"]
    db.commit()

    if body.is_holiday:
        try:
            from app.utils.notify import send_bulk
            import main as _main
            cur.execute("SELECT * FROM sp_get_all_active_user_ids()")
            all_users = [r["id"] for r in cur.fetchall()]
            with _main.flask_app.app_context():
                send_bulk(all_users, title="Holiday Announced", body=body.title + " on " + body.event_date + ".", ntype="info")
        except Exception as e:
            print("[calendar notify]", e)

    return ok(data={"id": new_id}, message="Event created.")


@router.put("/{id}")
def update_event(id: int, body: EventIn, user_id: int = Depends(require_permission("calendar.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_update_calendar_event(%s,%s,%s,%s,%s,%s,%s)",
        (id, body.title, body.description or "", body.event_date, body.end_date or None,
         body.event_type or "event", body.is_holiday or False)
    )
    db.commit()
    return ok(message="Event updated.")


@router.delete("/{id}")
def delete_event(id: int, user_id: int = Depends(require_permission("calendar.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_calendar_event(%s)", (id,))
    db.commit()
    return ok(message="Event deleted.")


@router.get("/holidays")
def get_holidays(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_holidays()")
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["event_date"] = str(r["event_date"])
        r["end_date"] = str(r["end_date"]) if r.get("end_date") else None
    return ok(data=rows)


@router.get("/event-types")
def list_event_types(user_id: int = Depends(require_permission("calendar.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("event_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_event_types(%s)", (campus_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/event-types")
def create_event_type(body: EventTypeIn, user_id: int = Depends(require_permission("calendar.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("event_types"))):
    cur = get_cur(db)
    cur.execute("SELECT sp_create_event_type(%s,%s,%s,%s) AS id", (body.name, body.color or "#2563eb", body.is_holiday or False, campus_id))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Event type created.")


@router.put("/event-types/{id}")
def update_event_type(id: int, body: EventTypeIn, user_id: int = Depends(require_permission("calendar.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("event_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM event_types WHERE id=%s", (id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("SELECT sp_update_event_type(%s,%s,%s,%s)", (id, body.name, body.color or "#2563eb", body.is_holiday or False))
    db.commit()
    return ok(message="Event type updated.")


@router.delete("/event-types/{id}")
def delete_event_type(id: int, user_id: int = Depends(require_permission("calendar.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("event_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM event_types WHERE id=%s", (id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("SELECT sp_deactivate_event_type(%s)", (id,))
    db.commit()
    return ok(message="Event type deleted.")
