"""
Session scoping for class records (diary, assignments, quizzes, study materials, attendance).
Each record carries the session it belongs to (academic_year_id, stamped automatically).
Lists show the class's CURRENT session unless a past session is asked for (history, read-only).
"""
from fastapi import HTTPException

ALLOWED = {"assignments", "quizzes", "study_materials", "daily_diary", "attendance"}


def keep_session(cur, table, rows, academic_year_id=None):
    """Only the rows of the requested session (default: each record's class's current session)."""
    if table not in ALLOWED: raise ValueError(table)
    ids = [r["id"] for r in rows if r.get("id") is not None]
    if not ids: return rows
    cur.execute(f"""SELECT x.id FROM {table} x JOIN classes c ON c.id = x.class_id
                    WHERE x.id = ANY(%s) AND x.academic_year_id = COALESCE(%s, c.academic_year_id)""", (ids, academic_year_id))
    keep = {r["id"] for r in cur.fetchall()}
    return [r for r in rows if r.get("id") in keep]


def assert_current_session(cur, table, row_id):
    """Past sessions are read-only history."""
    if table not in ALLOWED: raise ValueError(table)
    cur.execute(f"""SELECT x.academic_year_id = c.academic_year_id AS current FROM {table} x JOIN classes c ON c.id = x.class_id
                    WHERE x.id = %s""", (row_id,))
    r = cur.fetchone()
    if r is not None and r["current"] is False:
        raise HTTPException(status_code=409, detail={"status": "error",
                            "message": "This belongs to a past session and is kept as read-only history."})
