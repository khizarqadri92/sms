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


@router.get("/public")
def get_public_settings(db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_public_settings()")
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.get("/")
def get_settings(user_id: int = Depends(require_permission("roles.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_settings()")
    rows = cur.fetchall()
    grouped = {}
    for r in rows:
        cat = r["category"]
        grouped.setdefault(cat, []).append(dict(r))
    return ok(data=grouped)


@router.put("/")
def update_settings(body: SettingsBody, user_id: int = Depends(require_permission("roles.manage")), db=Depends(get_db)):
    data = body.dict()
    keys = list(data.keys())
    values = [str(v) for v in data.values()]
    cur = get_cur(db)
    if keys:
        cur.execute("SELECT sp_update_settings_by_key(%s::varchar[], %s::varchar[], %s::integer)", (keys, values, user_id))
    db.commit()
    return ok(message="Settings saved.")


@router.get("/preview-id")
def preview_id(role: str = Query("student"), user_id: int = Depends(require_permission("roles.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT fn_generate_id(%s::varchar) AS preview_id", (role,))
    preview = cur.fetchone()["preview_id"]
    db.rollback()
    return ok(data={"preview_id": preview})


@router.get("/fee")
def get_fee_settings(user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("fee_settings",))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.put("/fee")
def update_fee_settings(body: SettingsBody, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db)):
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
            "SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer)",
            ("fee_settings", keys, values, user_id)
        )
    db.commit()
    return ok(message="Fee settings saved.")


@router.get("/category/{cat}")
def get_category_settings(cat: str, user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", (cat,))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.get("/security-public")
def get_security_public_settings(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("security",))
    all_data = {r["key"]: r["value"] for r in cur.fetchall()}
    allowed_keys = ("idle_timeout_minutes", "max_failed_attempts", "lockout_duration_minutes")
    return ok(data={k: v for k, v in all_data.items() if k in allowed_keys})


@router.get("/regional-format-public")
def get_regional_format_public(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("regional_format",))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


@router.get("/school-info-public")
def get_school_info_public(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("school_info",))
    all_data = {r["key"]: r["value"] for r in cur.fetchall()}
    allowed_keys = ("school_name", "school_logo")
    return ok(data={k: v for k, v in all_data.items() if k in allowed_keys})


@router.post("/category/{cat}")
def save_category_settings(cat: str, body: SettingsBody, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db)):
    data = body.dict()
    keys = list(data.keys())
    values = [str(v) for v in data.values()]
    cur = get_cur(db)
    if keys:
        cur.execute(
            "SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer)",
            (cat, keys, values, user_id)
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
