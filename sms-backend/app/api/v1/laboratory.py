"""
Laboratory Management (app/api/v1/laboratory.py) - mounted at /api/v1/laboratory

Phase 1: labs (with a supervisor per lab), supervisor history, editable lists (lab types, categories, units ...),
lab settings (alerts, practical classes ...) and the dashboard foundation.
Lab supervisors hold the 'lab_supervisor' role; with 'My labs management' they edit only the labs they supervise.
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_campus import get_current_campus_id
from app.fastapi_permissions import require_permission, require_any_permission
from app.utils.access import effective_permissions

router = APIRouter()

P_VIEW, P_MANAGE, P_OWN, P_ASSIGN, P_SETTINGS = ("laboratory.lab_view", "laboratory.lab_management", "laboratory.own_lab_management",
                                                 "laboratory.lab_supervisor_assign", "laboratory.settings")
ANY_LAB = (P_VIEW, P_MANAGE, P_OWN, P_ASSIGN, P_SETTINGS)
KINDS = {"lab_type": "Lab types", "equipment_category": "Equipment categories", "consumable_category": "Consumable categories",
         "unit": "Units of measurement", "incident_category": "Incident categories", "maintenance_category": "Maintenance categories"}
STATUSES = {"active": "Active", "inactive": "Inactive", "under_maintenance": "Under maintenance"}


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success", **extra):
    return {"status": "success", "message": message, "data": data, **extra}


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def _row(r):
    return {k: _iso(v) for k, v in dict(r).items()}


def _scope(cur, user_id):
    perms = set(effective_permissions(cur, user_id))
    cur.execute("SELECT id FROM labs WHERE supervisor_user_id = %s", (user_id,))
    return {"perms": perms, "all": P_MANAGE in perms, "own": P_OWN in perms, "assign": P_ASSIGN in perms,
            "supervised": [r["id"] for r in cur.fetchall()]}


def _is_employee(cur, user_id):
    """An active teacher or staff member (anyone the school employs) may be a lab supervisor."""
    cur.execute("""SELECT 1 FROM users u WHERE u.id = %s AND COALESCE(u.is_active, TRUE)
                   AND (EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id) OR EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.id))""", (user_id,))
    return cur.fetchone() is not None


def _role_id(cur, name):
    cur.execute("SELECT id FROM roles WHERE name = %s", (name,))
    r = cur.fetchone()
    return r["id"] if r else None


def _log_role(cur, actor, action, role_id, user_id, details):
    cur.execute("INSERT INTO permission_change_log (actor_id, action, role_id, user_id, details) VALUES (%s,%s,%s,%s,%s)",
                (actor, action, role_id, user_id, details))


def _ensure_supervisor_role(cur, user_id, by, lab_name):
    """Give the Lab Supervisor role automatically when someone is made a lab's supervisor."""
    rid = _role_id(cur, "lab_supervisor")
    cur.execute("SELECT 1 FROM user_roles WHERE user_id = %s AND role_id = %s", (user_id, rid))
    if cur.fetchone():
        return False
    cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s,%s)", (user_id, rid))
    cur.execute("INSERT INTO lab_role_grants (user_id, granted_by) VALUES (%s,%s) ON CONFLICT (user_id) DO NOTHING", (user_id, by))
    _log_role(cur, by, "role_assigned", rid, user_id, f"Lab Supervisor role given automatically (made supervisor of {lab_name})")
    return True


def _release_supervisor_role(cur, user_id, by):
    """Take the automatically given role away again once they supervise no lab (roles given by hand are kept)."""
    if not user_id:
        return
    cur.execute("SELECT 1 FROM labs WHERE supervisor_user_id = %s", (user_id,))
    if cur.fetchone():
        return
    cur.execute("DELETE FROM lab_role_grants WHERE user_id = %s RETURNING user_id", (user_id,))
    if cur.fetchone():
        rid = _role_id(cur, "lab_supervisor")
        cur.execute("DELETE FROM user_roles WHERE user_id = %s AND role_id = %s", (user_id, rid))
        _log_role(cur, by, "role_removed", rid, user_id, "Lab Supervisor role removed automatically (no longer supervises any lab)")


LAB_SELECT = """SELECT l.*, t.name AS lab_type, t.code AS lab_type_code,
                       u.first_name || ' ' || u.last_name AS supervisor_name, u.email AS supervisor_email
                FROM labs l LEFT JOIN lab_lookups t ON t.id = l.lab_type_id LEFT JOIN users u ON u.id = l.supervisor_user_id"""


def _get_lab(cur, lab_id, campus_id=None):
    cur.execute(LAB_SELECT + " WHERE l.id = %s", (lab_id,))
    r = cur.fetchone()
    if not r or (campus_id is not None and r["campus_id"] is not None and r["campus_id"] != campus_id):
        fail("Lab not found.", 404)
    return dict(r)


# ================================================================== meta (what this person may do) + supervisors
@router.get("/meta")
def meta(user_id: int = Depends(require_any_permission(*ANY_LAB)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    sc = _scope(cur, user_id)
    cur.execute("SELECT id, kind, code, name, is_active FROM lab_lookups ORDER BY kind, sort_order, name")
    lookups = {}
    for r in cur.fetchall():
        lookups.setdefault(r["kind"], []).append(dict(r))
    return ok(data={"lookups": lookups, "kinds": KINDS, "statuses": STATUSES, "can_manage_all": sc["all"], "can_manage_own": sc["own"],
                    "can_assign": sc["assign"], "can_settings": P_SETTINGS in sc["perms"], "supervised_lab_ids": sc["supervised"],
                    "campus_selected": campus_id is not None})


@router.get("/supervisors")
def supervisors(user_id: int = Depends(require_any_permission(P_MANAGE, P_ASSIGN)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Every active employee (teacher or staff) can be made a lab supervisor; those who already hold the role come first."""
    cur = get_cur(db)
    cur.execute("""SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email,
                          d.name AS department, (t.id IS NOT NULL) AS is_teacher,
                          EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = 'lab_supervisor') AS has_role,
                          (SELECT COUNT(*) FROM labs lx WHERE lx.supervisor_user_id = u.id AND lx.status <> 'inactive') AS labs_supervised
                   FROM users u LEFT JOIN staff s ON s.user_id = u.id LEFT JOIN departments d ON d.id = s.department_id
                   LEFT JOIN teachers t ON t.user_id = u.id
                   WHERE COALESCE(u.is_active, TRUE) AND (s.id IS NOT NULL OR t.id IS NOT NULL)
                     AND (%s::int IS NULL OR u.campus_id IS NULL OR u.campus_id = %s)
                   ORDER BY has_role DESC, name""", (campus_id, campus_id))
    seen, rows = set(), []
    for r in cur.fetchall():
        if r["id"] not in seen:
            seen.add(r["id"]); rows.append(dict(r))
    return ok(data=rows)


# ================================================================== labs
@router.get("/labs")
def list_labs(q: Optional[str] = None, status: Optional[str] = None, lab_type_id: Optional[int] = None, mine: bool = False,
              page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
              user_id: int = Depends(require_any_permission(*ANY_LAB)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    where, params = [], []
    if campus_id is not None: where.append("(l.campus_id = %s OR l.campus_id IS NULL)"); params.append(campus_id)
    if status: where.append("l.status = %s"); params.append(status)
    if lab_type_id: where.append("l.lab_type_id = %s"); params.append(lab_type_id)
    if mine: where.append("l.supervisor_user_id = %s"); params.append(user_id)
    if q:
        where.append("(l.name ILIKE %s OR l.code ILIKE %s OR l.room_number ILIKE %s OR l.building ILIKE %s)"); params += [f"%{q.strip()}%"] * 4
    w = ("WHERE " + " AND ".join(where)) if where else ""
    cur.execute(f"SELECT COUNT(*) AS n FROM labs l {w}", params)
    total = cur.fetchone()["n"]
    cur.execute(f"{LAB_SELECT} {w} ORDER BY l.status = 'inactive', l.name LIMIT %s OFFSET %s", params + [limit, (page - 1) * limit])
    rows = [_row(r) for r in cur.fetchall()]
    sc = _scope(cur, user_id)
    for r in rows:
        r["can_edit"] = sc["all"] or (sc["own"] and r["id"] in sc["supervised"])
    return ok(data=rows, pagination={"page": page, "limit": limit, "total": total})


@router.get("/labs/{lab_id}")
def lab_detail(lab_id: int, user_id: int = Depends(require_any_permission(*ANY_LAB)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    lab = _row(_get_lab(cur, lab_id, campus_id))
    cur.execute("""SELECT h.from_at, h.to_at, u.first_name || ' ' || u.last_name AS name, cb.first_name || ' ' || cb.last_name AS changed_by
                   FROM lab_supervisor_history h LEFT JOIN users u ON u.id = h.user_id LEFT JOIN users cb ON cb.id = h.changed_by
                   WHERE h.lab_id = %s ORDER BY h.from_at DESC, h.id DESC""", (lab_id,))
    lab["supervisor_history"] = [_row(r) for r in cur.fetchall()]
    sc = _scope(cur, user_id)
    lab["can_edit"] = sc["all"] or (sc["own"] and lab_id in sc["supervised"])
    lab["can_change_status"] = sc["all"]
    lab["can_assign"] = sc["assign"] or sc["all"]
    return ok(data=lab)


class LabIn(BaseModel):
    name: str
    code: str
    lab_type_id: Optional[int] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    room_number: Optional[str] = None
    capacity: int
    supervisor_user_id: Optional[int] = None
    description: Optional[str] = None
    safety_instructions: Optional[str] = None
    facilities: Optional[str] = None


def _clean(body):
    name, code = (body.name or "").strip(), (body.code or "").strip().upper()
    if not name: fail("Lab name is required.")
    if not code: fail("Lab code is required.")
    if body.capacity is None or body.capacity <= 0: fail("Capacity must be more than zero.")
    return name, code


def _check_type(cur, type_id):
    if type_id:
        cur.execute("SELECT 1 FROM lab_lookups WHERE id = %s AND kind = 'lab_type' AND is_active", (type_id,))
        if not cur.fetchone(): fail("Choose an active lab type.")


def _check_code(cur, code, lab_id=None):
    cur.execute("SELECT name FROM labs WHERE lower(code) = lower(%s) AND (%s::int IS NULL OR id <> %s)", (code, lab_id, lab_id))
    r = cur.fetchone()
    if r: fail(f"Lab code {code} is already used by {r['name']}.", 409)


def _set_supervisor(cur, lab_id, new_user, by):
    cur.execute("UPDATE lab_supervisor_history SET to_at = now() WHERE lab_id = %s AND to_at IS NULL", (lab_id,))
    if new_user:
        cur.execute("INSERT INTO lab_supervisor_history (lab_id, user_id, changed_by) VALUES (%s,%s,%s)", (lab_id, new_user, by))


@router.post("/labs")
def create_lab(body: LabIn, user_id: int = Depends(require_permission(P_MANAGE)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    name, code = _clean(body)
    if campus_id is None:
        cur.execute("SELECT COUNT(*) AS n FROM campuses")
        if (cur.fetchone() or {}).get("n", 0) > 1:
            fail("Choose a campus first (top bar) - a lab belongs to one campus.")
    _check_type(cur, body.lab_type_id); _check_code(cur, code)
    if body.supervisor_user_id and not _is_employee(cur, body.supervisor_user_id):
        fail("The supervisor must be an active teacher or staff member.")
    cur.execute("""INSERT INTO labs (campus_id, name, code, lab_type_id, building, floor, room_number, capacity, supervisor_user_id,
                       description, safety_instructions, facilities, created_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (campus_id, name, code, body.lab_type_id, body.building, body.floor, body.room_number, body.capacity, body.supervisor_user_id,
                 body.description, body.safety_instructions, body.facilities, user_id))
    lid = cur.fetchone()["id"]
    if body.supervisor_user_id:
        _set_supervisor(cur, lid, body.supervisor_user_id, user_id)
        _ensure_supervisor_role(cur, body.supervisor_user_id, user_id, name)
    db.commit()
    return ok(data={"id": lid}, message=f"Lab {name} created.")


@router.put("/labs/{lab_id}")
def update_lab(lab_id: int, body: LabIn, user_id: int = Depends(require_any_permission(P_MANAGE, P_OWN)), db=Depends(get_db),
               campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    lab = _get_lab(cur, lab_id, campus_id)
    sc = _scope(cur, user_id)
    if not sc["all"]:
        if lab["supervisor_user_id"] != user_id:
            fail("You can only edit the labs you supervise.", 403)
        if (body.code or "").strip().upper() != lab["code"].upper() or (body.supervisor_user_id or None) != lab["supervisor_user_id"]:
            fail("Changing a lab's code or supervisor needs Lab management.", 403)
    name, code = _clean(body)
    _check_type(cur, body.lab_type_id); _check_code(cur, code, lab_id)
    if (body.supervisor_user_id or None) != lab["supervisor_user_id"]:
        if not (sc["all"] or sc["assign"]): fail("Changing the supervisor needs 'Assign lab supervisor'.", 403)
        if body.supervisor_user_id and not _is_employee(cur, body.supervisor_user_id):
            fail("The supervisor must be an active teacher or staff member.")
        _set_supervisor(cur, lab_id, body.supervisor_user_id, user_id)
        sup_changed = True
    else:
        sup_changed = False
    cur.execute("""UPDATE labs SET name=%s, code=%s, lab_type_id=%s, building=%s, floor=%s, room_number=%s, capacity=%s, supervisor_user_id=%s,
                   description=%s, safety_instructions=%s, facilities=%s, updated_at=now() WHERE id=%s""",
                (name, code, body.lab_type_id, body.building, body.floor, body.room_number, body.capacity, body.supervisor_user_id,
                 body.description, body.safety_instructions, body.facilities, lab_id))
    if sup_changed:
        if body.supervisor_user_id: _ensure_supervisor_role(cur, body.supervisor_user_id, user_id, name)
        _release_supervisor_role(cur, lab["supervisor_user_id"], user_id)
    db.commit()
    return ok(message="Lab saved.")


class StatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


@router.post("/labs/{lab_id}/status")
def change_status(lab_id: int, body: StatusIn, user_id: int = Depends(require_permission(P_MANAGE)), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    if body.status not in STATUSES: fail("Status must be Active, Inactive or Under maintenance.")
    cur = get_cur(db)
    lab = _get_lab(cur, lab_id, campus_id)
    if lab["status"] == body.status: return ok(message=f"Already {STATUSES[body.status].lower()}.")
    if body.status != "active" and not (body.reason or "").strip():
        fail("Give a reason (it is kept with the lab's history).")
    cur.execute("UPDATE labs SET status=%s, status_reason=%s, updated_at=now() WHERE id=%s", (body.status, (body.reason or "").strip() or None, lab_id))
    db.commit()
    return ok(message={"active": "Lab reactivated - it can be booked again.", "inactive": "Lab deactivated - it can no longer be booked; its history is kept.",
                       "under_maintenance": "Lab marked under maintenance - no new bookings unless overridden."}[body.status])


class SupervisorIn(BaseModel):
    user_id: Optional[int] = None


@router.post("/labs/{lab_id}/supervisor")
def assign_supervisor(lab_id: int, body: SupervisorIn, user_id: int = Depends(require_any_permission(P_ASSIGN, P_MANAGE)), db=Depends(get_db),
                      campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    lab = _get_lab(cur, lab_id, campus_id)
    if (body.user_id or None) == lab["supervisor_user_id"]: return ok(message="No change.")
    if body.user_id and not _is_employee(cur, body.user_id):
        fail("The supervisor must be an active teacher or staff member.")
    cur.execute("UPDATE labs SET supervisor_user_id=%s, updated_at=now() WHERE id=%s", (body.user_id, lab_id))
    _set_supervisor(cur, lab_id, body.user_id, user_id)
    given = _ensure_supervisor_role(cur, body.user_id, user_id, lab["name"]) if body.user_id else False
    _release_supervisor_role(cur, lab["supervisor_user_id"], user_id)
    db.commit()
    msg = "Supervisor changed." if body.user_id else "Supervisor removed."
    return ok(message=msg + (" They now have the Lab Supervisor role (they'll see it after signing in again)." if given else ""))


# ================================================================== editable lists
class LookupIn(BaseModel):
    kind: str
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


@router.get("/lookups")
def lookups(kind: Optional[str] = None, user_id: int = Depends(require_any_permission(*ANY_LAB)), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT l.*, (SELECT COUNT(*) FROM labs x WHERE x.lab_type_id = l.id) AS used_by_labs FROM lab_lookups l
                   WHERE (%s::text IS NULL OR l.kind = %s) ORDER BY l.kind, l.sort_order, l.name""", (kind, kind))
    return ok(data=[_row(r) for r in cur.fetchall()])


def _lookup_values(body):
    if body.kind not in KINDS: fail("Unknown list.")
    code, name = (body.code or "").strip().upper(), (body.name or "").strip()
    if not code or not name: fail("Code and name are required.")
    return code, name


@router.post("/lookups")
def add_lookup(body: LookupIn, user_id: int = Depends(require_permission(P_SETTINGS)), db=Depends(get_db)):
    code, name = _lookup_values(body)
    cur = get_cur(db)
    try:
        cur.execute("""INSERT INTO lab_lookups (kind, code, name, description, is_active, sort_order) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (body.kind, code, name, body.description, body.is_active, body.sort_order))
    except Exception as e:
        db.rollback()
        if "lab_lookups_code" in str(e) or "lab_lookups_name" in str(e): fail(f"{name} ({code}) already exists in {KINDS[body.kind].lower()}.", 409)
        raise
    i = cur.fetchone()["id"]; db.commit()
    return ok(data={"id": i}, message=f"{name} added.")


@router.put("/lookups/{lookup_id}")
def edit_lookup(lookup_id: int, body: LookupIn, user_id: int = Depends(require_permission(P_SETTINGS)), db=Depends(get_db)):
    code, name = _lookup_values(body)
    cur = get_cur(db)
    try:
        cur.execute("""UPDATE lab_lookups SET code=%s, name=%s, description=%s, is_active=%s, sort_order=%s WHERE id=%s AND kind=%s RETURNING id""",
                    (code, name, body.description, body.is_active, body.sort_order, lookup_id, body.kind))
    except Exception as e:
        db.rollback()
        if "lab_lookups_code" in str(e) or "lab_lookups_name" in str(e): fail(f"{name} ({code}) already exists.", 409)
        raise
    if not cur.fetchone(): fail("Not found.", 404)
    db.commit()
    return ok(message=f"{name} saved." + ("" if body.is_active else " It's hidden from new choices; existing records keep it."))


# ================================================================== settings
class SettingsIn(BaseModel):
    near_expiry_days: int = 30
    low_stock_alerts: bool = True
    default_issue_days: int = 7
    allow_schedule_under_maintenance: bool = False
    practical_classes: List[str] = []
    student_access: bool = True
    results_integration: bool = False


def settings_for(cur, campus_id):
    cur.execute("SELECT * FROM lab_settings WHERE campus_id = %s OR campus_id IS NULL ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
    s = dict(cur.fetchone() or {})
    s.pop("updated_at", None)
    s["practical_classes"] = list(s.get("practical_classes") or [])
    return s


@router.get("/settings")
def get_settings(user_id: int = Depends(require_permission(P_SETTINGS)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    s = settings_for(cur, campus_id)
    cur.execute("""SELECT DISTINCT c.name FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
                   WHERE ay.is_active AND (%s::int IS NULL OR c.campus_id = %s) ORDER BY c.name""", (campus_id, campus_id))
    s["class_names"] = [r["name"] for r in cur.fetchall()]
    s["scope"] = "campus" if campus_id is not None else "school-wide default"
    return ok(data=s)


@router.put("/settings")
def save_settings(body: SettingsIn, user_id: int = Depends(require_permission(P_SETTINGS)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if not (1 <= body.near_expiry_days <= 365): fail("Near-expiry warning: between 1 and 365 days.")
    if not (1 <= body.default_issue_days <= 90): fail("Default issue period: between 1 and 90 days.")
    classes = sorted({c.strip() for c in body.practical_classes if c and c.strip()})
    cur = get_cur(db)
    vals = (body.near_expiry_days, body.low_stock_alerts, body.default_issue_days, body.allow_schedule_under_maintenance, classes,
            body.student_access, body.results_integration, user_id)
    if campus_id is None:
        cur.execute("""UPDATE lab_settings SET near_expiry_days=%s, low_stock_alerts=%s, default_issue_days=%s, allow_schedule_under_maintenance=%s,
                       practical_classes=%s, student_access=%s, results_integration=%s, updated_by=%s, updated_at=now() WHERE campus_id IS NULL""", vals)
    else:
        cur.execute("""INSERT INTO lab_settings (near_expiry_days, low_stock_alerts, default_issue_days, allow_schedule_under_maintenance, practical_classes,
                       student_access, results_integration, updated_by, campus_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (campus_id) DO UPDATE SET near_expiry_days=EXCLUDED.near_expiry_days, low_stock_alerts=EXCLUDED.low_stock_alerts,
                       default_issue_days=EXCLUDED.default_issue_days, allow_schedule_under_maintenance=EXCLUDED.allow_schedule_under_maintenance,
                       practical_classes=EXCLUDED.practical_classes, student_access=EXCLUDED.student_access, results_integration=EXCLUDED.results_integration,
                       updated_by=EXCLUDED.updated_by, updated_at=now()""", vals + (campus_id,))
    db.commit()
    return ok(message="Lab settings saved.")


# ================================================================== dashboard (foundation; equipment / stock / sessions arrive with later phases)
@router.get("/dashboard")
def dashboard(user_id: int = Depends(require_any_permission(*ANY_LAB)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    camp = "WHERE (%s::int IS NULL OR l.campus_id = %s OR l.campus_id IS NULL)"
    cur.execute(f"""SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active,
                           COUNT(*) FILTER (WHERE status = 'under_maintenance') AS under_maintenance, COUNT(*) FILTER (WHERE status = 'inactive') AS inactive,
                           COUNT(*) FILTER (WHERE status <> 'inactive' AND supervisor_user_id IS NULL) AS without_supervisor,
                           COALESCE(SUM(capacity) FILTER (WHERE status = 'active'), 0) AS active_capacity
                    FROM labs l {camp}""", (campus_id, campus_id))
    k = dict(cur.fetchone())
    cur.execute(f"""SELECT COALESCE(t.name, 'No type') AS name, COUNT(*) AS n FROM labs l LEFT JOIN lab_lookups t ON t.id = l.lab_type_id
                    {camp} AND l.status <> 'inactive' GROUP BY 1 ORDER BY 2 DESC""", (campus_id, campus_id))
    by_type = [dict(r) for r in cur.fetchall()]
    cur.execute(f"""SELECT l.id, l.name, l.code, l.status, l.status_reason FROM labs l {camp} AND (l.status = 'under_maintenance'
                    OR (l.status = 'active' AND l.supervisor_user_id IS NULL)) ORDER BY l.name LIMIT 10""", (campus_id, campus_id))
    alerts = [dict(r) for r in cur.fetchall()]
    sc = _scope(cur, user_id)
    return ok(data={"kpis": k, "by_type": by_type, "alerts": alerts, "my_labs": sc["supervised"]})
