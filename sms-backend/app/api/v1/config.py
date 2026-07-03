from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, get_jwt
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.utils.sp_helper import call_sp
import psycopg2.extras, json

bp = Blueprint("config", __name__)

def get_cur():
    from app.db.connection import get_db
    db = get_db()
    return db, db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


@bp.get("/withdrawal")
@jwt_required_custom
@require_permission("settings.view")
def get_withdrawal_config():
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_withdrawal_config()")
    row = cur.fetchone()
    if not row: return error("Config not found", 404)
    return success(data=dict(row))


@bp.put("/withdrawal")
@jwt_required_custom
@require_permission("settings.manage")
def update_withdrawal_config():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    result, err = call_sp("sp_update_withdrawal_config", (
        user_id,
        json.dumps(body.get("departments", ["finance","library","admin"])),
        body.get("require_coordinator", True),
        body.get("require_principal", True),
        body.get("allow_appeal", False),
        body.get("appeal_days", 7),
        json.dumps(body.get("required_documents", [])),
        body.get("tc_prefix", "TC"),
        body.get("auto_generate_tc", True),
    ))
    if err: return error(err, 400)
    return success(message="Withdrawal configuration updated.")


@bp.get("/discipline")
@jwt_required_custom
@require_permission("settings.view")
def get_discipline_config():
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_discipline_config()")
    row = cur.fetchone()
    if not row: return error("Config not found", 404)
    return success(data=dict(row))


@bp.put("/discipline")
@jwt_required_custom
@require_permission("settings.manage")
def update_discipline_config():
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    result, err = call_sp("sp_update_discipline_config", (
        user_id,
        json.dumps(body.get("violation_types", [])),
        json.dumps(body.get("severity_labels", {})),
        body.get("hearing_min_severity", 2),
        body.get("committee_min_members", 2),
        body.get("require_head", True),
        body.get("allow_appeal", True),
        body.get("appeal_days", 7),
        body.get("max_suspension_days", 14),
        body.get("auto_reinstate", True),
    ))
    if err: return error(err, 400)
    return success(message="Discipline configuration updated.")