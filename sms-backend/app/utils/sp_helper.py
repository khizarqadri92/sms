"""
Stored Procedure helper utilities.
All DB write operations should go through these helpers.
"""
import json
import psycopg2.extras
from app.db.connection import get_db


def get_cur():
    return get_db().cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def call_sp(proc_name: str, params: tuple = (), fetch: str = "one"):
    """
    Call a stored procedure and return results.
    fetch: "one" | "all" | "none"
    Returns (result, error_msg)
    """
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"SELECT * FROM {proc_name}({','.join(['%s']*len(params))})", params)
        if fetch == "one":
            row = cur.fetchone()
            result = dict(row) if row else {}
        elif fetch == "all":
            result = [dict(r) for r in cur.fetchall()]
        else:
            result = {}
        error_msg = result.get("error_msg") if isinstance(result, dict) else None
        if not error_msg:
            db.commit()
        return result, error_msg
    except Exception as e:
        db.rollback()
        return {}, str(e)


def call_sp_write(proc_name: str, params: tuple = ()):
    """
    For write SPs that return (id, error_msg).
    Returns (id, error_msg)
    """
    result, err = call_sp(proc_name, params, fetch="one")
    if err:
        return None, err
    return result.get("id"), result.get("error_msg")


def call_sp_read(proc_name: str, params: tuple = ()):
    """
    For read SPs that return multiple rows.
    Returns list of dicts.
    """
    result, _ = call_sp(proc_name, params, fetch="all")
    return result if isinstance(result, list) else []


def jsonb(data) -> str:
    """Serialize Python object to JSONB string for SP params."""
    return json.dumps(data)