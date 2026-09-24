"""
Native FastAPI router for Campus management (multi-campus Phase 1).

A campus is a top-level organizational unit that isolates students,
teachers, staff and classes from every other campus. Only superadmin can
list/create/edit campuses - regular users never see this screen since
they're each tied to exactly one campus already.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur
from app.fastapi_campus import get_current_campus_id

router = APIRouter()


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class CampusIn(BaseModel):
    id: Optional[int] = None
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    is_active: bool = True
    uses_own_settings: bool = False


@router.get("/me")
def my_campus(user_id: int = Depends(get_current_user_id), campus_id=Depends(get_current_campus_id), db=Depends(get_db)):
    """Returns the campus name to show in the header - a regular user's
    own fixed campus, or for superadmin, whichever campus the switcher
    currently has selected (None means "All Campuses"). No campuses.view
    permission required since this is just the caller's own context."""
    if campus_id is None:
        return ok(data={"id": None, "name": "All Campuses"})
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM campuses WHERE id = %s", (campus_id,))
    row = cur.fetchone()
    return ok(data=dict(row) if row else {"id": None, "name": "All Campuses"})


@router.get("/")
def list_campuses(user_id: int = Depends(require_permission("campuses.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_list_campuses()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/")
def upsert_campus(body: CampusIn, user_id: int = Depends(require_permission("campuses.manage")), db=Depends(get_db)):
    """Creates a new campus (id omitted) or updates an existing one (id
    given). Cloning an existing campus's setup - beyond the basic fields
    here - is limited in this phase to what's actually per-campus so far
    (e.g. academic years when academic_year_mode is set to per_campus);
    most settings (school timing, ID formats, fee settings) remain shared
    across all campuses until a later phase makes them per-campus too."""
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_upsert_campus(%s, %s, %s, %s, %s, %s, %s, %s) AS campus_id",
        (body.id, body.name, body.code, body.address, body.contact_phone, body.contact_email, body.is_active, body.uses_own_settings)
    )
    campus_id = cur.fetchone()["campus_id"]
    db.commit()
    return ok(data={"id": campus_id}, message="Campus saved.")



class GovernanceUpdateIn(BaseModel):
    mode: str


@router.get("/governance")
def list_governance(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Every configurable catalog/master-data type (departments, subjects,
    fee types, etc.), with its current global-vs-per-campus mode. Setting
    a row to "global" means every campus is forced onto the shared
    (campus_id NULL) rows for that entity - no campus can override it
    until a superadmin switches it back."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM setting_governance ORDER BY category, display_name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/governance/{entity_key}")
def update_governance(entity_key: str, body: GovernanceUpdateIn, user_id: int = Depends(require_permission("campuses.manage")), db=Depends(get_db)):
    if body.mode not in ("global", "per_campus"):
        fail("mode must be 'global' or 'per_campus'.", 400)
    cur = get_cur(db)
    cur.execute("SELECT locked FROM setting_governance WHERE entity_key=%s", (entity_key,))
    row = cur.fetchone()
    if not row:
        fail("Unknown entity_key.", 404)
    if row["locked"]:
        fail("This setup is fixed to Global and cannot be changed.", 400)
    cur.execute(
        "UPDATE setting_governance SET mode=%s, updated_by=%s, updated_at=now() WHERE entity_key=%s RETURNING entity_key",
        (body.mode, user_id, entity_key)
    )
    db.commit()
    return ok(message="Setting governance updated.")
