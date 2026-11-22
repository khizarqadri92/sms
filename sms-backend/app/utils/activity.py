"""
Central activity logging service (app/utils/activity.py).

    log_activity(cur, user_id=..., module=..., activity_type=..., action=..., description=..., ...)

* used by the activity middleware for every successful change, and by any module that wants to record
  a richer business event (e.g. "Received fee payment - Rs 15,000") - never duplicate the logic elsewhere
* never stores passwords, tokens, secrets or ID numbers (see SENSITIVE)
* snapshots the user's name, role and department at that moment, so history survives renames / deactivation
"""
import json
import re
from datetime import date, datetime
from decimal import Decimal

# any key matching this is never stored (old / new values, metadata)
SENSITIVE = re.compile(r"pass(word)?|pwd|token|secret|totp|otp|hash|api[_-]?key|authori[sz]ation|cnic|b_form|bform|card|cvv|pin\b|salt", re.I)
NOISE = {"updated_at", "created_at", "last_login_at", "failed_login_attempts", "locked_until"}
MAX_TEXT = 300          # long texts are cut
MAX_KEYS = 60


def _plain(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return "(binary)"
    if isinstance(v, str) and len(v) > MAX_TEXT:
        return v[:MAX_TEXT] + "..."
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in list(v)[:30]]
    if isinstance(v, dict):
        return sanitize(v)
    return v


def sanitize(d):
    """A copy without sensitive keys, with JSON-safe, shortened values."""
    if not isinstance(d, dict):
        return None
    out = {}
    for k, v in list(d.items())[:MAX_KEYS]:
        if SENSITIVE.search(str(k)):
            continue
        out[str(k)] = _plain(v)
    return out


def changed_fields(before, after):
    """(old, new) with only the fields that changed - sensitive and bookkeeping fields left out."""
    if not isinstance(before, dict) or not isinstance(after, dict):
        return None, None
    old, new = {}, {}
    for k in set(before) | set(after):
        if k in NOISE or SENSITIVE.search(str(k)):
            continue
        a, b = _plain(before.get(k)), _plain(after.get(k))
        if a != b:
            old[k], new[k] = a, b
    return (old or None), (new or None)


def actor_snapshot(cur, user_id):
    """Name, role and department of the user right now (kept with the record for history)."""
    cur.execute("""SELECT u.first_name || ' ' || u.last_name AS name, u.campus_id,
                          (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id ORDER BY r.id LIMIT 1) AS role,
                          s.department_id, d.name AS department_name, s.campus_id AS staff_campus
                   FROM users u LEFT JOIN staff s ON s.user_id = u.id LEFT JOIN departments d ON d.id = s.department_id
                   WHERE u.id = %s ORDER BY s.id DESC NULLS LAST LIMIT 1""", (user_id,))
    r = cur.fetchone()
    if not r:
        return {}
    r = dict(r) if not isinstance(r, dict) else r
    return {"name": r.get("name"), "role": (r.get("role") or "").replace("_", " ").title() or None,
            "department_id": r.get("department_id"), "department_name": r.get("department_name"),
            "campus_id": r.get("campus_id") if r.get("campus_id") is not None else r.get("staff_campus")}


def log_activity(cur, *, user_id, module, activity_type, action, description, entity_type=None, entity_id=None, entity_name=None,
                 old_values=None, new_values=None, metadata=None, ip_address=None, user_agent=None, request_method=None,
                 request_path=None, campus_id=None):
    """Write one activity record (the caller commits). Returns the new id."""
    a = actor_snapshot(cur, user_id) if user_id else {}
    cur.execute("""INSERT INTO activity_logs (user_id, user_name_snapshot, user_role_snapshot, department_id, department_name_snapshot, campus_id,
                       module, activity_type, action, description, entity_type, entity_id, entity_name, old_values, new_values, metadata,
                       ip_address, user_agent, request_method, request_path)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (user_id, a.get("name"), a.get("role"), a.get("department_id"), a.get("department_name"),
                 a.get("campus_id") if a.get("campus_id") is not None else campus_id,     # own campus; the header only for superadmin
                 (module or "General")[:80], (activity_type or "action")[:20], (action or "")[:200], (description or action or "")[:2000],
                 (entity_type or None) and str(entity_type)[:60], None if entity_id is None else str(entity_id)[:60],
                 (entity_name or None) and str(entity_name)[:250],
                 json.dumps(sanitize(old_values)) if old_values else None, json.dumps(sanitize(new_values)) if new_values else None,
                 json.dumps(sanitize(metadata)) if metadata else None,
                 (ip_address or None) and str(ip_address)[:64], (user_agent or None) and str(user_agent)[:400],
                 request_method, (request_path or None) and str(request_path)[:400]))
    r = cur.fetchone()
    return r["id"] if isinstance(r, dict) else r[0]
