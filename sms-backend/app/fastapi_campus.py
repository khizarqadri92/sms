"""
Resolves which campus a request is scoped to, for multi-campus data
isolation. Kept deliberately simple (a fresh DB lookup per request rather
than embedding campus_id in the JWT) since the JWT is issued by the
existing Flask login endpoint - changing its claims would mean touching
Flask auth code too, and a user's campus assignment can change without
requiring them to log back in this way.
"""
from typing import Optional
from fastapi import Header, Depends
from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur


def enforce_same_campus(record_campus_id, caller_campus_id):
    """
    Raises a 404 if the caller is scoped to a specific campus (caller_campus_id
    is not None) and the record being accessed belongs to a different one.
    Used before update/delete operations on a record fetched by id, so a
    user can't reach across campus boundaries just by knowing or guessing
    another campus's record id. A 404 (rather than 403) avoids confirming
    to the caller that the record exists at all in another campus.
    Superadmin with no specific campus selected (caller_campus_id is None)
    is exempt, matching the "all campuses" view used elsewhere.
    """
    from fastapi import HTTPException
    if caller_campus_id is not None and record_campus_id is not None and record_campus_id != caller_campus_id:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Record not found."})



def get_current_campus_id(
    x_campus_id: Optional[int] = Header(None),
    user_id: int = Depends(get_current_user_id),
    db=Depends(get_db),
) -> Optional[int]:
    """
    Returns the campus this request should be scoped to.

    A regular (non-superadmin) user is always scoped to their own assigned
    campus_id, regardless of any X-Campus-Id header they might send - this
    prevents a user from spoofing access to another campus's data by simply
    setting a header.

    Superadmin accounts have campus_id = NULL in the users table (they
    aren't tied to one campus), so for them the X-Campus-Id header - set by
    the frontend's campus switcher - determines which campus's data to
    operate on. If superadmin sends no header, this returns None, meaning
    "all campuses" for endpoints that support an unscoped view; endpoints
    that require a specific campus (e.g. creating a student) should treat
    a None return as a 400 error asking the caller to pick a campus first.
    """
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    user_campus_id = row["campus_id"] if row else None
    if user_campus_id is not None:
        return user_campus_id
    return x_campus_id


def get_settings_campus_id(campus_id: Optional[int] = Depends(get_current_campus_id), db=Depends(get_db)) -> Optional[int]:
    """
    Returns the campus_id to pass into settings SPs - only when that campus
    has explicitly opted into its own independent settings (uses_own_settings).
    Otherwise returns None, meaning the caller should see and edit the
    shared global defaults, same as before multi-campus existed. This keeps
    the "use Main Campus's settings" vs "use my own settings" choice made
    at campus-creation time authoritative, rather than just following
    whatever campus is currently selected.
    """
    if campus_id is None:
        return None
    cur = get_cur(db)
    cur.execute("SELECT uses_own_settings FROM campuses WHERE id = %s", (campus_id,))
    row = cur.fetchone()
    if row and row["uses_own_settings"]:
        return campus_id
    return None



def catalog_campus_id(entity_key: str):
    """
    Factory for a FastAPI dependency scoping a catalog/master-data endpoint
    (departments, subjects, fee types, etc.) to the right campus_id, honoring
    the superadmin-controlled setting_governance table. If a superadmin has
    locked this entity_key to "global", every campus is forced onto the
    shared (campus_id NULL) rows - creates go there too, and no campus can
    carve out its own override until a superadmin switches it back. When
    the entity isn't governed (not in the table) or is set to "per_campus",
    this behaves exactly like get_current_campus_id.
    Usage: campus_id: Optional[int] = Depends(catalog_campus_id("departments"))
    """
    def _dep(campus_id: Optional[int] = Depends(get_current_campus_id), db=Depends(get_db)) -> Optional[int]:
        cur = get_cur(db)
        cur.execute("SELECT mode FROM setting_governance WHERE entity_key=%s", (entity_key,))
        row = cur.fetchone()
        if row and row["mode"] == "global":
            return None
        return campus_id
    return _dep



def catalog_campus_id_for_write(entity_key: str):
    """
    Write-side counterpart to catalog_campus_id, for POST/PUT/DELETE
    endpoints on a governed catalog entity. When a superadmin has locked
    this entity_key to "global", a regular campus-scoped user (one with
    their own fixed users.campus_id, i.e. not superadmin) is blocked from
    creating/editing/deleting - the setting is centrally managed and only
    editable from the superadmin's own Setup page. Superadmin (whose own
    campus_id is NULL) is unaffected either way, matching catalog_campus_id's
    "global forces campus_id=NULL" behavior for their own writes.
    Usage: campus_id: Optional[int] = Depends(catalog_campus_id_for_write("fee_types"))
    """
    def _dep(x_campus_id: Optional[int] = Header(None), user_id: int = Depends(get_current_user_id), db=Depends(get_db)) -> Optional[int]:
        from fastapi import HTTPException
        cur = get_cur(db)
        cur.execute("SELECT campus_id FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        own_campus_id = row["campus_id"] if row else None
        raw_campus_id = own_campus_id if own_campus_id is not None else x_campus_id
        cur.execute("SELECT mode FROM setting_governance WHERE entity_key=%s", (entity_key,))
        grow = cur.fetchone()
        is_global = grow and grow["mode"] == "global"
        if is_global and own_campus_id is not None:
            raise HTTPException(status_code=403, detail={"status": "error", "message": "This setting is managed centrally by the superadmin and cannot be changed here."})
        if is_global:
            return None
        return raw_campus_id
    return _dep


def resolve_governed_settings_campus_id(db, entity_key, campus_id):
    """
    Plain (non-Depends) version of the same governance + uses_own_settings
    logic, for routes where the entity_key isn't known until request time
    (e.g. a /category/{cat} path param) so the Depends()-factory pattern
    can't be used. See governed_settings_campus_id below for the Depends
    version used everywhere else.
    """
    cur = get_cur(db)
    cur.execute("SELECT mode FROM setting_governance WHERE entity_key=%s", (entity_key,))
    row = cur.fetchone()
    if row and row["mode"] == "global":
        return None
    if campus_id is None:
        return None
    cur.execute("SELECT uses_own_settings FROM campuses WHERE id=%s", (campus_id,))
    crow = cur.fetchone()
    if crow and crow["uses_own_settings"]:
        return campus_id
    return None


def resolve_governed_settings_campus_id_for_write(db, entity_key, raw_campus_id, own_campus_id):
    """
    Plain (non-Depends) write-side counterpart to resolve_governed_settings_campus_id,
    for routes where the entity_key isn't known until request time (e.g. a
    /category/{cat} path param). Raises 403 if this entity_key is locked to
    "global" and the caller is a regular campus-scoped user (own_campus_id
    is not None) - the setting is centrally managed and only editable from
    the superadmin's own Setup page.
    """
    from fastapi import HTTPException
    cur = get_cur(db)
    cur.execute("SELECT mode FROM setting_governance WHERE entity_key=%s", (entity_key,))
    row = cur.fetchone()
    if row and row["mode"] == "global" and own_campus_id is not None:
        raise HTTPException(status_code=403, detail={"status": "error", "message": "This setting is managed centrally by the superadmin and cannot be changed here."})
    return resolve_governed_settings_campus_id(db, entity_key, raw_campus_id)


def governed_settings_campus_id_for_write(entity_key: str):
    """
    Write-side counterpart to governed_settings_campus_id, for PUT/POST
    endpoints on a governed settings category. When a superadmin has locked
    this entity_key to "global", a regular campus-scoped user (their own
    users.campus_id is not NULL, i.e. not superadmin) is blocked from
    saving changes - the setting is centrally managed and only editable
    from the superadmin's own Setup page. Superadmin is unaffected.
    Usage: campus_id: Optional[int] = Depends(governed_settings_campus_id_for_write("discount_config"))
    """
    def _dep(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)) -> Optional[int]:
        from fastapi import HTTPException
        cur = get_cur(db)
        cur.execute("SELECT campus_id FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        own_campus_id = row["campus_id"] if row else None
        cur.execute("SELECT mode FROM setting_governance WHERE entity_key=%s", (entity_key,))
        grow = cur.fetchone()
        is_global = grow and grow["mode"] == "global"
        if is_global and own_campus_id is not None:
            raise HTTPException(status_code=403, detail={"status": "error", "message": "This setting is managed centrally by the superadmin and cannot be changed here."})
        return resolve_governed_settings_campus_id(db, entity_key, campus_id)
    return _dep


def governed_settings_campus_id(entity_key: str):
    """
    Factory combining setting_governance with get_settings_campus_id, for
    settings categories (school_info, security, fee_settings, etc.) that
    are now also superadmin-governable. If a superadmin has locked this
    entity_key to "global", every campus is forced onto the shared config
    regardless of that campus's own uses_own_settings flag - the governance
    lock always wins. Otherwise this falls back to the existing per-campus
    "uses_own_settings" choice made at campus-creation time, unchanged.
    Usage: campus_id: Optional[int] = Depends(governed_settings_campus_id("school_info"))
    """
    def _dep(campus_id: Optional[int] = Depends(get_current_campus_id), db=Depends(get_db)) -> Optional[int]:
        return resolve_governed_settings_campus_id(db, entity_key, campus_id)
    return _dep
