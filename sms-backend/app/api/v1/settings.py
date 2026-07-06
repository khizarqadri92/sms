from flask import Blueprint, request
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras

bp = Blueprint("settings", __name__)


def get_cur():
    from app.db.connection import get_db
    return get_db(), get_db().cursor(cursor_factory=psycopg2.extras.RealDictCursor)


@bp.get("/public")
def get_public_settings():
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM sp_get_public_settings()")
    rows = {r["key"]: r["value"] for r in cur.fetchall()}
    return success(data=rows)


@bp.get("/")
@jwt_required_custom
@require_permission("roles.manage")
def get_settings():
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_all_settings()")
    rows = cur.fetchall()
    grouped = {}
    for r in rows:
        cat = r["category"]
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(dict(r))
    return success(data=grouped)


@bp.put("/")
@jwt_required_custom
@require_permission("roles.manage")
def update_settings():
    body = request.get_json() or {}
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_cur()
    keys   = list(body.keys())
    values = [str(v) for v in body.values()]
    if keys:
        cur.execute(
            "SELECT sp_update_settings_by_key(%s::varchar[], %s::varchar[], %s::integer)",
            (keys, values, user_id)
        )
    db.commit()
    return success(message="Settings saved.")


@bp.get("/preview-id")
@jwt_required_custom
@require_permission("roles.manage")
def preview_id():
    role = request.args.get("role", "student")
    db, cur = get_cur()
    cur.execute("SELECT fn_generate_id(%s::varchar) AS preview_id", (role,))
    preview = cur.fetchone()["preview_id"]
    db.rollback()
    return success(data={"preview_id": preview})


@bp.get("/fee")
@jwt_required_custom
@require_permission("settings.view")
def get_fee_settings():
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("fee_settings",))
    rows = cur.fetchall()
    data = {r["key"]: r["value"] for r in rows}
    return success(data=data)


@bp.put("/fee")
@jwt_required_custom
@require_permission("settings.manage")
def update_fee_settings():
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}
    allowed = {"fee_due_day","fee_reminder1_days","fee_reminder2_days",
               "fee_lock_days","fee_late_type","fee_late_fixed",
               "fee_late_percentage","fee_grace_days","fee_reminder_time"}
    filtered = {k: v for k, v in body.items() if k in allowed}
    db, cur = get_cur()
    keys   = list(filtered.keys())
    values = [str(v) for v in filtered.values()]
    if keys:
        cur.execute(
            "SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer)",
            ("fee_settings", keys, values, user_id)
        )
    db.commit()
    return success(message="Fee settings saved.")


@bp.get("/category/<string:cat>")
@jwt_required_custom
@require_permission("settings.view")
def get_category_settings(cat):
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", (cat,))
    data = {r["key"]: r["value"] for r in cur.fetchall()}
    return success(data=data)


@bp.get("/security-public")
@jwt_required_custom
def get_security_public_settings():
    # Every logged-in user needs these values (idle lock, lockout) regardless
    # of role, so this intentionally does not require settings.view.
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("security",))
    all_data = {r["key"]: r["value"] for r in cur.fetchall()}
    allowed_keys = ("idle_timeout_minutes", "max_failed_attempts", "lockout_duration_minutes")
    data = {k: v for k, v in all_data.items() if k in allowed_keys}
    return success(data=data)


@bp.get("/school-info-public")
@jwt_required_custom
def get_school_info_public():
    # School name/logo appear in the header for every role, so this
    # intentionally does not require settings.view either.
    db, cur = get_cur()
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar)", ("school_info",))
    all_data = {r["key"]: r["value"] for r in cur.fetchall()}
    allowed_keys = ("school_name", "school_logo")
    data = {k: v for k, v in all_data.items() if k in allowed_keys}
    return success(data=data)


@bp.post("/category/<string:cat>")
@jwt_required_custom
@require_permission("settings.manage")
def save_category_settings(cat):
    body = request.get_json() or {}
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_cur()
    keys   = list(body.keys())
    values = [str(v) for v in body.values()]
    if keys:
        cur.execute(
            "SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer)",
            (cat, keys, values, user_id)
        )
    db.commit()
    if cat == "school_timing":
        try:
            from app.utils.notify import send_bulk
            from app.db.connection import get_db
            db2 = get_db()
            cur2 = db2.cursor()
            cur2.execute("SELECT id FROM users WHERE is_active=TRUE")
            all_users = [r[0] for r in cur2.fetchall()]
            send_bulk(all_users,
                title="School Timing Updated",
                body="School timing settings have been updated. Please check the new schedule.",
                ntype="info")
        except Exception:
            pass
    return success(message="Settings saved.")
