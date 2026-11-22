"""
The ONE rule for "may this user do this?" - role permissions + acting roles + extra
permissions valid on the processing date (database functions fn_user_effective_*).
Use these everywhere instead of querying role_permissions directly.
"""


def effective_permissions(cur, user_id):
    cur.execute("SELECT code FROM fn_user_effective_permissions(%s)", (user_id,))
    return sorted({(r["code"] if isinstance(r, dict) else r[0]) for r in cur.fetchall()})


def effective_roles(cur, user_id):
    """Role names, own roles first, acting roles after (so the first role stays the user's own)."""
    cur.execute("SELECT role_name, is_acting FROM fn_user_effective_roles(%s) ORDER BY is_acting, role_name", (user_id,))
    out = []
    for r in cur.fetchall():
        name = r["role_name"] if isinstance(r, dict) else r[0]
        if name not in out: out.append(name)
    return out


def has_permission(cur, user_id, code):
    cur.execute("SELECT fn_user_has_permission(%s, %s) AS ok", (user_id, code))
    r = cur.fetchone()
    return bool(r["ok"] if isinstance(r, dict) else r[0])
