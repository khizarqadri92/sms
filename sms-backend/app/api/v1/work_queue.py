"""
Native FastAPI router for Work Queue.
Central inbox of all pending approvals/recommendations across all modules.
Modules push items via the shared work_queue_utils.py helper.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


# ─── Work Queue Endpoints ──────────────────────────────────────────────────────

@router.get("/")
def get_my_queue(
    module: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    status: Optional[str] = Query("pending"),
    user_id: int = Depends(get_current_user_id),
    claims: dict = Depends(get_jwt_claims),
    db=Depends(get_db),
):
    roles = claims.get("roles", [])
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_work_queue(%s, %s::varchar[], %s, %s, %s)",
                (user_id, roles, module, priority, status or "pending"))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get("created_at"): r["created_at"] = str(r["created_at"])
        if r.get("due_date"):   r["due_date"]   = str(r["due_date"])
        r["assignee_display"] = r.get("assignee_name") or r.get("assigned_role","")
    return ok(data=rows)


@router.get("/count")
def get_queue_count(
    user_id: int = Depends(get_current_user_id),
    claims: dict = Depends(get_jwt_claims),
    db=Depends(get_db),
):
    roles = claims.get("roles", [])
    cur = get_cur(db)
    cur.execute("SELECT sp_get_work_queue_count(%s, %s::varchar[]) AS cnt", (user_id, roles))
    count = cur.fetchone()["cnt"]
    return ok(data={"count": count})


@router.get("/modules")
def get_queue_modules(
    user_id: int = Depends(get_current_user_id),
    claims: dict = Depends(get_jwt_claims),
    db=Depends(get_db),
):
    """Get distinct modules with pending item counts for the tab bar."""
    roles = claims.get("roles", [])
    cur = get_cur(db)
    cur.execute("""
        SELECT module, COUNT(*) AS count
        FROM work_queue_items
        WHERE status = 'pending'
          AND (assigned_user_id = %s OR assigned_role = ANY(%s::varchar[]))
        GROUP BY module ORDER BY module
    """, (user_id, roles))
    rows = [dict(r) for r in cur.fetchall()]
    return ok(data=rows)


@router.post("/{item_id}/complete")
def complete_item(
    item_id: int,
    user_id: int = Depends(get_current_user_id),
    db=Depends(get_db),
):
    cur = get_cur(db)
    _pn = get_processing_datetime(db)
    cur.execute("""
        UPDATE work_queue_items
        SET status='completed', completed_by=%s, completed_at=%s, updated_at=%s
        WHERE id=%s AND status='pending'
    """, (user_id, _pn, _pn, item_id))
    if cur.rowcount == 0:
        fail("Item not found or already completed.", 404)
    db.commit()
    return ok(message="Item marked complete.")


@router.post("/{item_id}/cancel")
def cancel_item(
    item_id: int,
    user_id: int = Depends(require_permission("admin.manage")),
    db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("UPDATE work_queue_items SET status='cancelled', updated_at=%s WHERE id=%s AND status='pending'", (get_processing_datetime(db), item_id,))
    if cur.rowcount == 0:
        fail("Item not found or already actioned.", 404)
    db.commit()
    return ok(message="Item cancelled.")


@router.get("/history")
def get_queue_history(
    module: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    user_id: int = Depends(get_current_user_id),
    claims: dict = Depends(get_jwt_claims),
    db=Depends(get_db),
):
    roles = claims.get("roles", [])
    cur = get_cur(db)
    conds = ["(w.assigned_user_id=%s OR w.assigned_role=ANY(%s::varchar[]))",
             "w.status != 'pending'"]
    params = [user_id, roles]
    if module:
        conds.append("w.module=%s"); params.append(module)
    params.append(limit)
    cur.execute(f"""
        SELECT w.*, u.first_name||' '||u.last_name AS completed_by_name
        FROM work_queue_items w
        LEFT JOIN users u ON u.id=w.completed_by
        WHERE {" AND ".join(conds)}
        ORDER BY w.updated_at DESC LIMIT %s
    """, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("created_at", "completed_at", "due_date", "updated_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


@router.get("/admin")
def admin_all_items(
    module: Optional[str] = Query(None),
    status: Optional[str] = Query("pending"),
    role: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    user_id: int = Depends(require_permission("admin.manage")),
    db=Depends(get_db),
):
    """Admin view of all queue items across all roles."""
    cur = get_cur(db)
    conds, params = ["1=1"], []
    if module:  conds.append("module=%s");          params.append(module)
    if status:  conds.append("status=%s");           params.append(status)
    if role:    conds.append("assigned_role=%s");    params.append(role)
    params.append(limit)
    cur.execute(f"""
        SELECT w.*, u.first_name||' '||u.last_name AS completed_by_name
        FROM work_queue_items w
        LEFT JOIN users u ON u.id=w.completed_by
        WHERE {" AND ".join(conds)}
        ORDER BY CASE w.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                 w.created_at DESC LIMIT %s
    """, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("created_at", "completed_at", "due_date", "updated_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


# ─── Color Config ─────────────────────────────────────────────────────────────

@router.get("/color-config")
def get_color_config(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM wq_status_colors ORDER BY status_key")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/color-config/{status_key}")
def update_color_config(
    status_key: str, body: dict,
    user_id: int = Depends(require_permission("admin.manage")), db=Depends(get_db)
):
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO wq_status_colors (status_key, label, bg_color, border_color, badge_color, text_color)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (status_key) DO UPDATE SET
            label=EXCLUDED.label, bg_color=EXCLUDED.bg_color,
            border_color=EXCLUDED.border_color, badge_color=EXCLUDED.badge_color,
            text_color=EXCLUDED.text_color
    """, (status_key, body.get("label", status_key),
          body.get("bg_color", "#f8fafc"), body.get("border_color", "#e2e8f0"),
          body.get("badge_color", "#64748b"), body.get("text_color", "#374151")))
    db.commit()
    return ok(message="Color config updated.")
