"""
Native FastAPI router for Settings - migrated from app/api/v1/settings.py.
All 5 stored procedures already existed and were verified clean (no broken
chr()-stub pattern). Reuses sp_get_all_active_user_ids (built for Calendar)
for the school_timing bulk-notification lookup.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_campus import get_settings_campus_id
from app.fastapi_campus import governed_settings_campus_id, resolve_governed_settings_campus_id, get_current_campus_id
from app.fastapi_campus import governed_settings_campus_id_for_write, resolve_governed_settings_campus_id_for_write
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class SettingsBody(BaseModel):
    class Config:
        extra = "allow"


class TimingOverrideIn(BaseModel):
    id: Optional[int] = None
    label: str
    day_of_week: Optional[int] = None
    override_date: Optional[str] = None
    start_time: str
    end_time: str
    break_start_time: Optional[str] = None
    break_duration: Optional[int] = None
    period_duration: int
    is_active: bool = True


@router.get("/public")
def get_public_settings(db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_public_settings()")
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.get("/")
def get_settings(user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_settings()")
    rows = cur.fetchall()
    grouped = {}
    for r in rows:
        cat = r["category"]
        grouped.setdefault(cat, []).append(dict(r))
    return ok(data=grouped)


@router.put("/")
def update_settings(body: SettingsBody, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db)):
    data = body.dict()
    keys = list(data.keys())
    values = [str(v) for v in data.values()]
    cur = get_cur(db)
    if keys:
        cur.execute("SELECT sp_update_settings_by_key(%s::varchar[], %s::varchar[], %s::integer)", (keys, values, user_id))
    db.commit()
    return ok(message="Settings saved.")


@router.get("/preview-id")
def preview_id(role: str = Query("student"), user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT fn_generate_id(%s::varchar) AS preview_id", (role,))
    preview = cur.fetchone()["preview_id"]
    db.rollback()
    return ok(data={"preview_id": preview})


@router.get("/fee")
def get_fee_settings(user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id("fee_settings"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar, %s)", ("fee_settings", campus_id))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.put("/fee")
def update_fee_settings(body: SettingsBody, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id_for_write("fee_settings"))):
    allowed = {
        "fee_due_day", "fee_reminder1_days", "fee_reminder2_days",
        "fee_lock_days", "fee_late_type", "fee_late_fixed",
        "fee_late_percentage", "fee_grace_days", "fee_reminder_time",
    }
    data = body.dict()
    filtered = {k: v for k, v in data.items() if k in allowed}
    keys = list(filtered.keys())
    values = [str(v) for v in filtered.values()]
    cur = get_cur(db)
    if keys:
        cur.execute(
            "SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer, %s)",
            ("fee_settings", keys, values, user_id, campus_id)
        )
    db.commit()
    return ok(message="Fee settings saved.")


@router.get("/category/{cat}")
def get_category_settings(cat: str, user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    campus_id = resolve_governed_settings_campus_id(db, cat, raw_campus_id)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar, %s)", (cat, campus_id))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.get("/security-public")
def get_security_public_settings(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("security",))
    all_data = {r["key"]: r["value"] for r in cur.fetchall()}
    allowed_keys = ("idle_timeout_minutes", "max_failed_attempts", "lockout_duration_minutes")
    return ok(data={k: v for k, v in all_data.items() if k in allowed_keys})


@router.get("/regional-format-public")
def get_regional_format_public(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id("regional_format"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar, %s)", ("regional_format", campus_id))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.get("/school-info-public")
def get_school_info_public(user_id: int = Depends(get_current_user_id), db=Depends(get_db), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    campus_id = resolve_governed_settings_campus_id(db, "school_info", raw_campus_id)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar, %s)", ("school_info", campus_id))
    all_data = {r["key"]: r["value"] for r in cur.fetchall()}
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("school_name",))
    all_data.update({r["key"]: r["value"] for r in cur.fetchall()})
    allowed_keys = ("school_name", "school_logo")
    return ok(data={k: v for k, v in all_data.items() if k in allowed_keys})


@router.post("/category/{cat}")
def save_category_settings(cat: str, body: SettingsBody, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    data = body.dict()
    keys = list(data.keys())
    values = [str(v) for v in data.values()]
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM users WHERE id=%s", (user_id,))
    _urow = cur.fetchone()
    own_campus_id = _urow["campus_id"] if _urow else None
    campus_id = resolve_governed_settings_campus_id_for_write(db, cat, raw_campus_id, own_campus_id)
    if keys:
        cur.execute(
            "SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer, %s)",
            (cat, keys, values, user_id, campus_id)
        )
    db.commit()

    if cat == "school_timing":
        try:
            from app.utils.notify import send_bulk
            import main as _main
            cur.execute("SELECT * FROM sp_get_all_active_user_ids()")
            all_users = [r["id"] for r in cur.fetchall()]
            with _main.flask_app.app_context():
                send_bulk(
                    all_users, title="School Timing Updated",
                    body="School timing settings have been updated. Please check the new schedule.",
                    ntype="info"
                )
        except Exception as e:
            print("[settings notify]", e)

    return ok(message="Settings saved.")


@router.get("/school-timing/overrides")
def list_timing_overrides(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Returns every configured day-specific timing override (either tied to
    a recurring weekday, e.g. every Friday, or a specific calendar date, e.g.
    Dec 24) - used by the Settings UI list and by the AI Timetable Generator
    to know which days need a different start/end/break/period schedule."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_timing_overrides()")
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("start_time", "end_time", "break_start_time"):
            if r.get(k) is not None:
                r[k] = str(r[k])[:5]
        if r.get("override_date") is not None:
            r["override_date"] = str(r["override_date"])
    return ok(data=rows)


@router.put("/school-timing/overrides")
def upsert_timing_override(body: TimingOverrideIn, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db)):
    """Creates a new override (id omitted) or updates an existing one (id
    given). Exactly one of day_of_week/override_date must be set - enforced
    by a DB check constraint as well as here for a clearer error message."""
    if bool(body.day_of_week) == bool(body.override_date):
        fail("Provide exactly one of day_of_week or override_date, not both or neither.", 400)
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_upsert_timing_override(%s::integer, %s::varchar, %s::smallint, %s::date, %s::time, %s::time, %s::time, %s::integer, %s::integer, %s::boolean)",
        (body.id, body.label, body.day_of_week, body.override_date, body.start_time, body.end_time,
         body.break_start_time, body.break_duration, body.period_duration, body.is_active)
    )
    new_id = cur.fetchone()["sp_upsert_timing_override"]
    db.commit()
    return ok(data={"id": new_id}, message="Timing override saved.")


@router.delete("/school-timing/overrides/{id}")
def delete_timing_override(id: int, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_timing_override(%s)", (id,))
    db.commit()
    return ok(message="Timing override removed.")
