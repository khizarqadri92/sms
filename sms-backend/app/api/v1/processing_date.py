from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_permissions import require_permission

router = APIRouter()


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


@router.get("/processing-date")
def get_current_processing_date(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_processing_date()")
    row = cur.fetchone()
    return ok(data=dict(row) if row else None)


@router.post("/processing-date/advance")
def advance_processing_date(user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_advance_processing_date();")
    db.commit()
    cur.execute("SELECT * FROM sp_get_processing_date()")
    row = cur.fetchone()
    return ok(data=dict(row) if row else None, message="Processing date advanced to next day.")


class SetProcessingDateIn(BaseModel):
    new_date: str


@router.put("/processing-date")
def set_processing_date(body: SetProcessingDateIn,
        user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_set_processing_date(%s,%s)", (body.new_date, "manual_override_user_" + str(user_id)))
    db.commit()
    return ok(message="Processing date updated.")


@router.get("/processing-time")
def get_processing_time(db=Depends(get_db)):
    from datetime import datetime, timezone as _tz, timedelta as _td
    cur = get_cur(db)
    cur.execute("SELECT mode, time_offset_seconds, updated_by, updated_at FROM processing_time ORDER BY id LIMIT 1")
    row = cur.fetchone()
    mode = row["mode"] if row else "auto"
    offset = row["time_offset_seconds"] if row else 0
    current_time = (datetime.now(_tz.utc) + _td(seconds=offset)).isoformat()
    return ok(data={"mode": mode, "time_offset_seconds": offset, "current_time": current_time,
                     "updated_by": row["updated_by"] if row else None, "updated_at": str(row["updated_at"]) if row else None})


@router.post("/processing-time/set-automatic")
def set_processing_time_automatic(user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE processing_time SET mode=\'auto\', time_offset_seconds=0, updated_by=%s, updated_at=NOW() WHERE id=(SELECT id FROM processing_time ORDER BY id LIMIT 1)", (user_id,))
    db.commit()
    return ok(message="Processing time set to automatic (follows real clock).")


class SetManualTimeIn(BaseModel):
    new_time: str


@router.post("/processing-time/set-manual")
def set_processing_time_manual(body: SetManualTimeIn,
        user_id: int = Depends(require_permission("users.manage_roles")), db=Depends(get_db)):
    from datetime import datetime, timezone as _tz
    from zoneinfo import ZoneInfo
    cur = get_cur(db)
    cur.execute("SELECT value FROM system_settings WHERE category=\'regional_format\' AND key=\'timezone\'")
    tz_row = cur.fetchone()
    tz_name = tz_row["value"] if tz_row else "UTC"
    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        local_tz = _tz.utc
    try:
        target = datetime.fromisoformat(body.new_time)
        if target.tzinfo is None:
            target = target.replace(tzinfo=local_tz)
    except ValueError:
        fail("Invalid time format. Use ISO format.", 400)
    now = datetime.now(_tz.utc)
    offset_seconds = int((target - now).total_seconds())
    cur = get_cur(db)
    cur.execute("UPDATE processing_time SET mode=\'manual\', time_offset_seconds=%s, updated_by=%s, updated_at=NOW() WHERE id=(SELECT id FROM processing_time ORDER BY id LIMIT 1)",
        (offset_seconds, user_id))
    db.commit()
    return ok(message="Manual processing time set.")
