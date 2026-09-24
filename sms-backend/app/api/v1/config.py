"""
Native FastAPI router for Config - migrated from app/api/v1/config.py.
All 4 stored procedures (sp_get/update_withdrawal_config, sp_get/update_discipline_config)
already existed and were verified clean (no broken chr()-stub pattern), and
their signatures were confirmed against pg_proc before wiring this up.
The call_sp() helper's error-checking pattern is replicated inline.
"""

import json
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_campus import get_settings_campus_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class WithdrawalConfigIn(BaseModel):
    departments: Optional[List[str]] = ["finance", "library", "admin"]
    require_coordinator: Optional[bool] = True
    require_principal: Optional[bool] = True
    allow_appeal: Optional[bool] = False
    appeal_days: Optional[int] = 7
    required_documents: Optional[List[Any]] = []
    tc_prefix: Optional[str] = "TC"
    auto_generate_tc: Optional[bool] = True


class DisciplineConfigIn(BaseModel):
    violation_types: Optional[List[Any]] = []
    severity_labels: Optional[dict] = {}
    hearing_min_severity: Optional[int] = 2
    committee_min_members: Optional[int] = 2
    require_head: Optional[bool] = True
    allow_appeal: Optional[bool] = True
    appeal_days: Optional[int] = 7
    max_suspension_days: Optional[int] = 14
    auto_reinstate: Optional[bool] = True


@router.get("/withdrawal")
def get_withdrawal_config(user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_withdrawal_config(%s)", (campus_id,))
    row = cur.fetchone()
    if not row:
        fail("Config not found", 404)
    return ok(data=dict(row))


@router.put("/withdrawal")
def update_withdrawal_config(body: WithdrawalConfigIn, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    try:
        cur.execute(
            "SELECT * FROM sp_update_withdrawal_config(%s,%s::jsonb,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)",
            (
                user_id, json.dumps(body.departments), body.require_coordinator, body.require_principal,
                body.allow_appeal, body.appeal_days, json.dumps(body.required_documents),
                body.tc_prefix, body.auto_generate_tc, campus_id,
            )
        )
        row = cur.fetchone()
        result = dict(row) if row else {}
        error_msg = result.get("error_msg")
        if error_msg:
            db.rollback()
            fail(error_msg, 400)
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        fail(str(e), 400)
    return ok(message="Withdrawal configuration updated.")


@router.get("/discipline")
def get_discipline_config(user_id: int = Depends(require_permission("settings.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_discipline_config(%s)", (campus_id,))
    row = cur.fetchone()
    if not row:
        fail("Config not found", 404)
    return ok(data=dict(row))


@router.put("/discipline")
def update_discipline_config(body: DisciplineConfigIn, user_id: int = Depends(require_permission("settings.manage")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    cur = get_cur(db)
    try:
        cur.execute(
            "SELECT * FROM sp_update_discipline_config(%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                user_id, json.dumps(body.violation_types), json.dumps(body.severity_labels),
                body.hearing_min_severity, body.committee_min_members, body.require_head,
                body.allow_appeal, body.appeal_days, body.max_suspension_days, body.auto_reinstate, campus_id,
            )
        )
        row = cur.fetchone()
        result = dict(row) if row else {}
        error_msg = result.get("error_msg")
        if error_msg:
            db.rollback()
            fail(error_msg, 400)
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        fail(str(e), 400)
    return ok(message="Discipline configuration updated.")
