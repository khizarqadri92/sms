"""
Activity Stream API (app/api/v1/activities.py), mounted at /api/v1/activities.

Who sees what (decided here, on the server, for every request):
  * permission users_access.system_activity_stream   -> every department (campus users: their own campus)
  * head of a department (departments.head_user_id)   -> that department + its sub-departments
  * permission users_access.department_activity_stream -> their own department (staff.department_id)
  * nobody else; a department_id sent by the browser is ignored unless the caller may see it
  * IP address / browser only with users_access.activity_security_details
Logs are read-only: there is no endpoint that creates, edits or deletes them.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_campus import get_current_campus_id
from app.utils.access import effective_permissions

router = APIRouter()
P_SYSTEM, P_DEPT, P_SENSITIVE = ("users_access.system_activity_stream", "users_access.department_activity_stream",
                                 "users_access.activity_security_details")


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success", **extra):
    return {"status": "success", "message": message, "data": data, **extra}


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def _access(cur, user_id, campus_id):
    """-> dict(system: bool, departments: [ids] | None, campus_id, sensitive: bool). departments None = all."""
    perms = set(effective_permissions(cur, user_id))
    if P_SYSTEM in perms:
        return {"system": True, "departments": None, "campus_id": campus_id, "sensitive": P_SENSITIVE in perms}
    cur.execute("SELECT fn_headed_department_ids(%s) AS ids", (user_id,))
    depts = set(cur.fetchone()["ids"] or [])
    if P_DEPT in perms:
        cur.execute("SELECT department_id FROM staff WHERE user_id = %s AND department_id IS NOT NULL", (user_id,))
        depts |= {r["department_id"] for r in cur.fetchall()}
    if not depts:
        fail("You don't have access to the activity stream.", 403)
    return {"system": False, "departments": sorted(depts), "campus_id": None, "sensitive": P_SENSITIVE in perms}


def _scope_sql(acc, department_id=None):
    """WHERE parts limiting rows to what this caller may see (+ an optional department filter, validated)."""
    where, params = [], []
    if acc["departments"] is not None:
        allowed = acc["departments"]
        if department_id and department_id in allowed:
            allowed = [department_id]                           # a department they may see
        where.append("a.department_id = ANY(%s)"); params.append(allowed)     # anything else sent is ignored
    else:
        if acc["campus_id"] is not None:
            where.append("a.campus_id = %s"); params.append(acc["campus_id"])
        if department_id:
            where.append("a.department_id = %s"); params.append(department_id)
    return where, params


COLS = """a.id, a.user_id, a.user_name_snapshot AS user_name, a.user_role_snapshot AS user_role, a.department_id,
          a.department_name_snapshot AS department_name, a.module, a.activity_type, a.action, a.description,
          a.entity_type, a.entity_id, a.entity_name, a.old_values, a.new_values, a.created_at"""


@router.get("/")
def list_activities(department_id: Optional[int] = None, employee_id: Optional[int] = None, module: Optional[str] = None,
                    activity_type: Optional[str] = None, action: Optional[str] = None, date_from: Optional[date] = None,
                    date_to: Optional[date] = None, q: Optional[str] = None, since_id: Optional[int] = None,
                    page: int = Query(1, ge=1), limit: int = Query(25, ge=1, le=100),
                    user_id: int = Depends(get_current_user_id), db=Depends(get_db),
                    campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    acc = _access(cur, user_id, campus_id)
    where, params = _scope_sql(acc, department_id)
    if employee_id: where.append("a.user_id = %s"); params.append(employee_id)
    if module: where.append("a.module = %s"); params.append(module)
    if activity_type: where.append("a.activity_type = %s"); params.append(activity_type)
    if action: where.append("a.action ILIKE %s"); params.append(f"%{action}%")
    if date_from: where.append("a.created_at >= %s"); params.append(date_from)
    if date_to: where.append("a.created_at < %s"); params.append(date_to + timedelta(days=1))
    if since_id: where.append("a.id > %s"); params.append(since_id)
    if q:
        where.append("(a.user_name_snapshot ILIKE %s OR a.description ILIKE %s OR a.entity_name ILIKE %s)"); params += [f"%{q.strip()}%"] * 3
    w = ("WHERE " + " AND ".join(where)) if where else ""
    cur.execute(f"SELECT COUNT(*) AS n FROM activity_logs a {w}", params)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT {COLS} FROM activity_logs a {w} ORDER BY a.created_at DESC, a.id DESC LIMIT %s OFFSET %s",
                params + [limit, (page - 1) * limit])
    rows = [{k: _iso(v) for k, v in dict(r).items()} for r in cur.fetchall()]
    return ok(data=rows, pagination={"page": page, "limit": limit, "total": total},
              scope={"system": acc["system"], "departments": acc["departments"]})


@router.get("/summary")
def summary(department_id: Optional[int] = None, user_id: int = Depends(get_current_user_id), db=Depends(get_db),
            campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    acc = _access(cur, user_id, campus_id)
    where, params = _scope_sql(acc, department_id)
    w = (" AND " + " AND ".join(where)) if where else ""
    cur.execute(f"""SELECT COUNT(*) FILTER (WHERE a.created_at >= date_trunc('day', now())) AS today,
                           COUNT(*) FILTER (WHERE a.created_at >= date_trunc('week', now())) AS this_week,
                           COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at >= date_trunc('day', now())) AS active_users_today
                    FROM activity_logs a WHERE a.created_at >= now() - interval '8 days'{w}""", params)
    s = dict(cur.fetchone())
    cur.execute(f"""SELECT COALESCE(a.department_name_snapshot, 'No department') AS name, COUNT(*) AS n FROM activity_logs a
                    WHERE a.created_at >= date_trunc('week', now()){w} GROUP BY 1 ORDER BY 2 DESC LIMIT 12""", params)
    s["by_department"] = [dict(r) for r in cur.fetchall()]
    cur.execute(f"""SELECT a.module AS name, COUNT(*) AS n FROM activity_logs a
                    WHERE a.created_at >= date_trunc('week', now()){w} GROUP BY 1 ORDER BY 2 DESC LIMIT 12""", params)
    s["by_module"] = [dict(r) for r in cur.fetchall()]
    cur.execute(f"SELECT {COLS} FROM activity_logs a WHERE TRUE{w} ORDER BY a.created_at DESC, a.id DESC LIMIT 8", params)
    s["recent"] = [{k: _iso(v) for k, v in dict(r).items()} for r in cur.fetchall()]
    s["scope"] = {"system": acc["system"], "departments": acc["departments"]}
    return ok(data=s)


@router.get("/departments")
def departments(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    acc = _access(cur, user_id, campus_id)
    if acc["departments"] is None:
        cur.execute("""SELECT id, name, parent_id FROM departments WHERE COALESCE(is_active, TRUE)
                       AND (%s::int IS NULL OR campus_id IS NULL OR campus_id = %s) ORDER BY name""", (campus_id, campus_id))
    else:
        cur.execute("SELECT id, name, parent_id FROM departments WHERE id = ANY(%s) ORDER BY name", (acc["departments"],))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/employees")
def employees(department_id: Optional[int] = None, user_id: int = Depends(get_current_user_id), db=Depends(get_db),
              campus_id: Optional[int] = Depends(get_current_campus_id)):
    """People who appear in the activity the caller may see (for the employee filter)."""
    cur = get_cur(db)
    acc = _access(cur, user_id, campus_id)
    where, params = _scope_sql(acc, department_id)
    w = ("WHERE a.user_id IS NOT NULL" + (" AND " + " AND ".join(where) if where else ""))
    cur.execute(f"""SELECT a.user_id AS id, MAX(a.user_name_snapshot) AS name, MAX(a.user_role_snapshot) AS role
                    FROM activity_logs a {w} GROUP BY a.user_id ORDER BY 2 LIMIT 500""", params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/recorder-status")
def recorder_status(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Is the recorder running, what did it see, record and skip (and why)? System stream users only."""
    cur = get_cur(db)
    if P_SYSTEM not in set(effective_permissions(cur, user_id)):
        fail("You don't have access to this.", 403)
    try:
        from app.activity_middleware import STATS
        s = dict(STATS)
    except Exception as e:
        s = {"installed": False, "last_error": f"the recorder file can't be loaded: {e}"}
    cur.execute("SELECT COUNT(*) AS n FROM activity_logs"); s["activities_in_database"] = cur.fetchone()["n"]
    return ok(data=s)


@router.get("/{activity_id}")
def activity_detail(activity_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db),
                    campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    acc = _access(cur, user_id, campus_id)
    where, params = _scope_sql(acc)
    cur.execute(f"SELECT a.* FROM activity_logs a WHERE a.id = %s" + ("".join(" AND " + x for x in where)), [activity_id] + params)
    r = cur.fetchone()
    if not r:
        fail("Activity not found.", 404)                    # also when it exists but isn't theirs to see
    d = {k: _iso(v) for k, v in dict(r).items()}
    if not acc["sensitive"]:
        for k in ("ip_address", "user_agent", "request_path"):
            d.pop(k, None)
    return ok(data=d)
