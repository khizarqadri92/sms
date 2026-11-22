"""
Roles & Permissions administration (the new page).
  /api/v1/access/catalogue                        permissions grouped module -> area
  /api/v1/access/roles                            list / create / copy / rename / delete roles
  /api/v1/access/roles/{id}/permissions           a role's permissions (read / save the full set)
  /api/v1/access/users, /users/{id}               a person's roles, acting roles, extra permissions, effective permissions (with source)
  /api/v1/access/users/{id}/acting-roles          give a role for a period (e.g. acting principal); revoke
  /api/v1/access/users/{id}/extra-permissions     give single permissions for a period; revoke
  /api/v1/access/history                          who changed what
  /api/v1/access/me                               the caller's own current roles + permissions (to refresh the screen)
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_permissions import require_permission
from app.utils.access import effective_permissions, effective_roles

router = APIRouter()
PROTECTED_ROLES = {"superadmin"}
# superadmin always keeps these, so it can never lock itself out of Roles & Permissions
SUPERADMIN_KEEPS = {"users_access.role_management", "users_access.permission_management",
                    "users_access.role_assignment", "users_access.permission_history"}


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _log(cur, actor, action, role_id=None, user_id=None, details=None):
    cur.execute("INSERT INTO permission_change_log (actor_id, action, role_id, user_id, details) VALUES (%s,%s,%s,%s,%s)",
                (actor, action, role_id, user_id, details))


# ---------------------------------------------------------------- the caller
@router.get("/me")
def my_access(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT role_name FROM fn_user_effective_roles(%s) WHERE is_acting ORDER BY role_name", (user_id,))
    acting = [r["role_name"] for r in cur.fetchall()]
    return ok(data={"roles": effective_roles(cur, user_id), "acting_roles": acting, "permissions": effective_permissions(cur, user_id)})


# ---------------------------------------------------------------- catalogue
@router.get("/catalogue")
def catalogue(user_id: int = Depends(require_permission("users_access.role_management")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT p.id, p.code, p.label, p.description, p.area, p.module, p.module_label, p.note, p.is_public, p.sort_order,
                          COALESCE((SELECT array_agg(v.label ORDER BY v.sort_order) FROM permissions v WHERE v.code = ANY(p.implies)), '{}') AS includes
                   FROM permissions p WHERE NOT p.is_legacy ORDER BY p.sort_order, p.id""")
    modules = []
    for p in cur.fetchall():
        if not modules or modules[-1]["key"] != p["module"]:
            modules.append({"key": p["module"], "label": p["module_label"], "areas": []})
        areas = modules[-1]["areas"]
        if not areas or areas[-1]["label"] != p["area"]:
            areas.append({"label": p["area"], "permissions": []})
        areas[-1]["permissions"].append({k: p[k] for k in ("id", "code", "label", "description", "note", "is_public", "includes")})
    return ok(data=modules)


# ---------------------------------------------------------------- roles
@router.get("/roles")
def list_roles(user_id: int = Depends(require_permission("users_access.role_management")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT r.id, r.name, r.description,
                          (SELECT COUNT(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
                           WHERE rp.role_id=r.id AND NOT p.is_legacy) AS permissions,
                          (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id=r.id) AS users
                   FROM roles r ORDER BY r.name""")
    return ok(data=[{**dict(r), "protected": r["name"] in PROTECTED_ROLES} for r in cur.fetchall()])


class RoleIn(BaseModel):
    name: str
    description: Optional[str] = None
    copy_from_role_id: Optional[int] = None


def _role_name(name):
    import re
    n = re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")
    if not n or len(n) > 50: fail("Give the role a name (letters and numbers).")
    return n


@router.post("/roles")
def create_role(body: RoleIn, user_id: int = Depends(require_permission("users_access.role_management")), db=Depends(get_db)):
    cur = get_cur(db)
    name = _role_name(body.name)
    cur.execute("SELECT 1 FROM roles WHERE name=%s", (name,))
    if cur.fetchone(): fail(f"A role called '{name}' already exists.", 409)
    cur.execute("INSERT INTO roles (name, description) VALUES (%s,%s) RETURNING id", (name, (body.description or "").strip() or None))
    rid = cur.fetchone()["id"]
    if body.copy_from_role_id:
        cur.execute("""INSERT INTO role_permissions (role_id, permission_id)
                       SELECT %s, rp.permission_id FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
                       WHERE rp.role_id=%s AND NOT p.is_legacy""", (rid, body.copy_from_role_id))
    _log(cur, user_id, "role_created", rid, details=f"{name}" + (f" (copied from role {body.copy_from_role_id})" if body.copy_from_role_id else ""))
    db.commit()
    return ok(data={"id": rid, "name": name}, message=f"Role '{name}' created.")


@router.put("/roles/{role_id}")
def update_role(role_id: int, body: RoleIn, user_id: int = Depends(require_permission("users_access.role_management")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT name FROM roles WHERE id=%s", (role_id,))
    r = cur.fetchone()
    if not r: fail("Role not found.", 404)
    name = _role_name(body.name)
    if r["name"] in PROTECTED_ROLES and name != r["name"]: fail("The superadmin role can't be renamed.", 409)
    cur.execute("SELECT 1 FROM roles WHERE name=%s AND id<>%s", (name, role_id))
    if cur.fetchone(): fail(f"A role called '{name}' already exists.", 409)
    cur.execute("UPDATE roles SET name=%s, description=%s WHERE id=%s", (name, (body.description or "").strip() or None, role_id))
    _log(cur, user_id, "role_updated", role_id, details=f"{r['name']} -> {name}")
    db.commit()
    return ok(message="Role saved.")


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, user_id: int = Depends(require_permission("users_access.role_management")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT name, (SELECT COUNT(*) FROM user_roles WHERE role_id=r.id) AS users FROM roles r WHERE id=%s", (role_id,))
    r = cur.fetchone()
    if not r: fail("Role not found.", 404)
    if r["name"] in PROTECTED_ROLES: fail("The superadmin role can't be deleted.", 409)
    if r["users"]: fail(f"{r['users']} user(s) have this role - move them to another role first.", 409)
    cur.execute("DELETE FROM role_permissions WHERE role_id=%s", (role_id,))
    cur.execute("UPDATE user_acting_roles SET revoked_at=now(), revoked_by=%s WHERE role_id=%s AND revoked_at IS NULL", (user_id, role_id))
    cur.execute("DELETE FROM roles WHERE id=%s", (role_id,))
    _log(cur, user_id, "role_deleted", role_id, details=r["name"])
    db.commit()
    return ok(message=f"Role '{r['name']}' deleted.")


@router.get("/roles/{role_id}/permissions")
def role_permissions(role_id: int, user_id: int = Depends(require_permission("users_access.role_management")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
                   WHERE rp.role_id=%s AND NOT p.is_legacy""", (role_id,))
    return ok(data=[r["code"] for r in cur.fetchall()])


class RolePermsIn(BaseModel):
    codes: List[str]


@router.put("/roles/{role_id}/permissions")
def save_role_permissions(role_id: int, body: RolePermsIn, user_id: int = Depends(require_permission("users_access.permission_management")),
                          db=Depends(get_db)):
    """Saves the role's complete set; records exactly what was added and removed."""
    cur = get_cur(db)
    cur.execute("SELECT name FROM roles WHERE id=%s", (role_id,))
    r = cur.fetchone()
    if not r: fail("Role not found.", 404)
    cur.execute("SELECT id, code, label FROM permissions WHERE NOT is_legacy AND code = ANY(%s)", (list(set(body.codes)),))
    wanted = {p["code"]: p for p in cur.fetchall()}
    unknown = set(body.codes) - set(wanted)
    if unknown: fail("Unknown permission(s): " + ", ".join(sorted(unknown)[:5]))
    if r["name"] == "superadmin" and not SUPERADMIN_KEEPS <= set(wanted):
        fail("Superadmin always keeps Role management, Permission management, Role assignment and Permission history, "
             "so it can't be locked out of this page.", 409)
    cur.execute("""SELECT p.id, p.code, p.label FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
                   WHERE rp.role_id=%s AND NOT p.is_legacy""", (role_id,))
    current = {p["code"]: p for p in cur.fetchall()}
    add = [wanted[c] for c in wanted if c not in current]
    remove = [current[c] for c in current if c not in wanted]
    for p in add: cur.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (role_id, p["id"]))
    if remove: cur.execute("DELETE FROM role_permissions WHERE role_id=%s AND permission_id = ANY(%s)", (role_id, [p["id"] for p in remove]))
    if add or remove:
        _log(cur, user_id, "role_permissions_changed", role_id,
             details="; ".join(filter(None, ["added: " + ", ".join(p["label"] for p in add) if add else "",
                                             "removed: " + ", ".join(p["label"] for p in remove) if remove else ""])))
    db.commit()
    return ok(data={"added": len(add), "removed": len(remove)},
              message=f"{r['name']}: {len(add)} added, {len(remove)} removed." if (add or remove) else "No changes.")


# ---------------------------------------------------------------- people
@router.get("/users")
def find_users(q: Optional[str] = Query(None), user_id: int = Depends(require_permission("users_access.role_assignment")), db=Depends(get_db)):
    cur = get_cur(db)
    like = "%" + (q or "").strip().lower() + "%"
    cur.execute("""SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email,
                          (SELECT string_agg(r.name, ', ' ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id) AS roles
                   FROM users u WHERE COALESCE(u.is_active, TRUE)
                     AND (lower(u.first_name || ' ' || u.last_name) LIKE %s OR lower(COALESCE(u.email,'')) LIKE %s)
                   ORDER BY u.first_name, u.last_name LIMIT 25""", (like, like))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/users/{target}")
def user_access(target: int, user_id: int = Depends(require_permission("users_access.role_assignment")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id, first_name || ' ' || last_name AS name, email FROM users WHERE id=%s", (target,))
    u = cur.fetchone()
    if not u: fail("User not found.", 404)
    cur.execute("SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s ORDER BY r.name", (target,))
    roles = [dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT a.id, r.id AS role_id, r.name AS role, a.valid_from, a.valid_until, a.reason, a.granted_at,
                          g.first_name || ' ' || g.last_name AS granted_by
                   FROM user_acting_roles a JOIN roles r ON r.id=a.role_id LEFT JOIN users g ON g.id=a.granted_by
                   WHERE a.user_id=%s AND a.revoked_at IS NULL ORDER BY a.valid_from NULLS FIRST, a.id""", (target,))
    acting = [{**dict(r), "valid_from": str(r["valid_from"]) if r["valid_from"] else None, "valid_until": str(r["valid_until"]) if r["valid_until"] else None,
               "granted_at": str(r["granted_at"])} for r in cur.fetchall()]
    cur.execute("""SELECT x.id, p.code, p.label, p.module_label, x.valid_from, x.valid_until, x.reason, x.granted_at,
                          g.first_name || ' ' || g.last_name AS granted_by
                   FROM user_permission_grants x JOIN permissions p ON p.id=x.permission_id LEFT JOIN users g ON g.id=x.granted_by
                   WHERE x.user_id=%s AND x.revoked_at IS NULL ORDER BY p.sort_order, x.id""", (target,))
    extra = [{**dict(r), "valid_from": str(r["valid_from"]) if r["valid_from"] else None, "valid_until": str(r["valid_until"]) if r["valid_until"] else None,
              "granted_at": str(r["granted_at"])} for r in cur.fetchall()]
    # effective new permissions today, with where each comes from
    cur.execute("SELECT code FROM fn_user_effective_permissions(%s)", (target,))
    eff = {r["code"] for r in cur.fetchall()}
    cur.execute("SELECT role_name, is_acting FROM fn_user_effective_roles(%s)", (target,))
    eroles = cur.fetchall()
    cur.execute("""SELECT p.code, p.label, p.module_label, p.area, array_agg(DISTINCT r.name) AS via_roles
                   FROM permissions p LEFT JOIN role_permissions rp ON rp.permission_id=p.id
                   LEFT JOIN roles r ON r.id=rp.role_id AND r.name = ANY(%s)
                   WHERE NOT p.is_legacy AND p.code = ANY(%s) GROUP BY p.id ORDER BY p.sort_order""",
                ([r["role_name"] for r in eroles], list(eff)))
    acting_names = {r["role_name"] for r in eroles if r["is_acting"]}
    extra_codes = {x["code"] for x in extra}
    effective = []
    for p in cur.fetchall():
        via = [x for x in (p["via_roles"] or []) if x]
        src = ["role: " + x + (" (acting)" if x in acting_names else "") for x in via]
        if p["code"] in extra_codes: src.append("extra permission")
        effective.append({"code": p["code"], "label": p["label"], "module": p["module_label"], "area": p["area"], "source": src or ["superadmin"]})
    return ok(data={"user": dict(u), "roles": roles, "acting_roles": acting, "extra_permissions": extra, "effective": effective})


class PeriodIn(BaseModel):
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    reason: Optional[str] = None


class ActingRoleIn(PeriodIn):
    role_id: int


class ExtraPermsIn(PeriodIn):
    codes: List[str]


def _period(body):
    if body.valid_from and body.valid_until and body.valid_until < body.valid_from:
        fail("The end date is before the start date.")
    if not (body.reason or "").strip():
        fail("Give a reason (e.g. 'Acting principal while the principal is on leave').")


@router.post("/users/{target}/acting-roles")
def add_acting_role(target: int, body: ActingRoleIn, user_id: int = Depends(require_permission("users_access.role_assignment")), db=Depends(get_db)):
    cur = get_cur(db)
    _period(body)
    cur.execute("SELECT name FROM roles WHERE id=%s", (body.role_id,))
    r = cur.fetchone()
    if not r: fail("Role not found.", 404)
    if r["name"] in PROTECTED_ROLES: fail("Superadmin can't be given as an acting role.", 409)
    cur.execute("SELECT 1 FROM user_roles WHERE user_id=%s AND role_id=%s", (target, body.role_id))
    if cur.fetchone(): fail("This person already has that role permanently.", 409)
    cur.execute("""INSERT INTO user_acting_roles (user_id, role_id, valid_from, valid_until, reason, granted_by)
                   VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""", (target, body.role_id, body.valid_from, body.valid_until, body.reason.strip(), user_id))
    aid = cur.fetchone()["id"]
    _log(cur, user_id, "acting_role_given", body.role_id, target,
         f"{r['name']} from {body.valid_from or 'now'} until {body.valid_until or 'revoked'} - {body.reason.strip()}")
    db.commit()
    return ok(data={"id": aid}, message=f"Acting role '{r['name']}' given.")


@router.delete("/acting-roles/{aid}")
def revoke_acting_role(aid: int, user_id: int = Depends(require_permission("users_access.role_assignment")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE user_acting_roles SET revoked_at=now(), revoked_by=%s WHERE id=%s AND revoked_at IS NULL RETURNING user_id, role_id", (user_id, aid))
    r = cur.fetchone()
    if not r: fail("Not found (or already ended).", 404)
    _log(cur, user_id, "acting_role_revoked", r["role_id"], r["user_id"])
    db.commit()
    return ok(message="Acting role ended.")


@router.post("/users/{target}/extra-permissions")
def add_extra_permissions(target: int, body: ExtraPermsIn, user_id: int = Depends(require_permission("users_access.role_assignment")),
                          db=Depends(get_db)):
    cur = get_cur(db)
    _period(body)
    if not body.codes: fail("Choose at least one permission.")
    cur.execute("SELECT id, code, label FROM permissions WHERE NOT is_legacy AND NOT is_public AND code = ANY(%s)", (list(set(body.codes)),))
    perms = cur.fetchall()
    if len(perms) != len(set(body.codes)): fail("Unknown permission in the list.")
    for p in perms:
        cur.execute("""INSERT INTO user_permission_grants (user_id, permission_id, valid_from, valid_until, reason, granted_by)
                       VALUES (%s,%s,%s,%s,%s,%s)""", (target, p["id"], body.valid_from, body.valid_until, body.reason.strip(), user_id))
    _log(cur, user_id, "extra_permissions_given", None, target,
         ", ".join(p["label"] for p in perms) + f" from {body.valid_from or 'now'} until {body.valid_until or 'revoked'} - {body.reason.strip()}")
    db.commit()
    return ok(message=f"{len(perms)} extra permission(s) given.")


@router.delete("/extra-permissions/{gid}")
def revoke_extra_permission(gid: int, user_id: int = Depends(require_permission("users_access.role_assignment")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""UPDATE user_permission_grants g SET revoked_at=now(), revoked_by=%s WHERE id=%s AND revoked_at IS NULL
                   RETURNING user_id, (SELECT label FROM permissions WHERE id=g.permission_id) AS label""", (user_id, gid))
    r = cur.fetchone()
    if not r: fail("Not found (or already ended).", 404)
    _log(cur, user_id, "extra_permission_revoked", None, r["user_id"], r["label"])
    db.commit()
    return ok(message="Extra permission removed.")


# ---------------------------------------------------------------- history
@router.get("/history")
def history(limit: int = Query(200, le=1000), user_id: int = Depends(require_permission("users_access.permission_history")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT l.id, l.at, l.action, l.details, a.first_name || ' ' || a.last_name AS by_name, r.name AS role,
                          t.first_name || ' ' || t.last_name AS for_user
                   FROM permission_change_log l LEFT JOIN users a ON a.id=l.actor_id LEFT JOIN roles r ON r.id=l.role_id
                   LEFT JOIN users t ON t.id=l.user_id ORDER BY l.at DESC, l.id DESC LIMIT %s""", (limit,))
    return ok(data=[{**dict(r), "at": str(r["at"])} for r in cur.fetchall()])



# ---------------------------------------------------------------- refusals
@router.get("/refusals")
def refusals(days: int = Query(14, ge=1, le=90), user_id: int = Depends(require_permission("users_access.permission_history")), db=Depends(get_db)):
    """What people were refused recently, grouped: role(s) + missing permission + page, with a count."""
    cur = get_cur(db)
    cur.execute("""SELECT f.code, f.method, f.path, COUNT(*) AS times, MAX(f.at) AS last_at, COUNT(DISTINCT f.user_id) AS people,
                          string_agg(DISTINCT u.first_name || ' ' || u.last_name, ', ') AS who,
                          string_agg(DISTINCT r.name, ', ') AS roles,
                          (SELECT string_agg(p.label, ' / ') FROM permissions p WHERE p.code = ANY(string_to_array(replace(f.code, ' or ', ','), ','))) AS label
                   FROM permission_refusals f LEFT JOIN users u ON u.id=f.user_id
                   LEFT JOIN user_roles ur ON ur.user_id=f.user_id LEFT JOIN roles r ON r.id=ur.role_id
                   WHERE f.at > now() - make_interval(days => %s)
                   GROUP BY f.code, f.method, f.path ORDER BY MAX(f.at) DESC LIMIT 300""", (days,))
    return ok(data=[{**dict(r), "last_at": str(r["last_at"])} for r in cur.fetchall()])
