"""
Native FastAPI router for Notification Templates - lets superadmin/admin
configure the wording of automated notifications (fee reminders, attendance
alerts, teacher resignation, etc.) with {{tag}} placeholders for dynamic
values, while the underlying trigger/recipient logic (when it fires, who it
goes to) stays exactly as coded. See app/utils/notify.py's
render_templated_notification for the read side used by each event.
"""
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.fastapi_campus import catalog_campus_id, catalog_campus_id_for_write

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class TemplateUpdateIn(BaseModel):
    title_template: str
    body_template: str
    is_active: bool = True


@router.get("/")
def list_templates(user_id: int = Depends(require_permission("settings.view")),
                    campus_id: Optional[int] = Depends(catalog_campus_id("notification_templates")),
                    db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT event_key, display_name, category, audience, title_template, body_template,
               available_tags, is_active, updated_at
        FROM notification_templates
        WHERE campus_id IS NULL
        ORDER BY category, display_name
    """)
    global_rows = {r["event_key"]: dict(r) for r in cur.fetchall()}

    campus_overrides = {}
    if campus_id is not None:
        cur.execute("""
            SELECT event_key, title_template, body_template, is_active, updated_at
            FROM notification_templates WHERE campus_id=%s
        """, (campus_id,))
        campus_overrides = {r["event_key"]: dict(r) for r in cur.fetchall()}

    rows = []
    for key, d in global_rows.items():
        override = campus_overrides.get(key)
        if override:
            d = {**d, **override}
            d["is_customized"] = True
        else:
            d["is_customized"] = False
        d["updated_at"] = str(d["updated_at"]) if d["updated_at"] else None
        rows.append(d)
    rows.sort(key=lambda d: (d["category"], d["display_name"]))
    return ok(data=rows)


@router.put("/{event_key}")
def update_template(event_key: str, body: TemplateUpdateIn,
                     user_id: int = Depends(require_permission("settings.manage")),
                     campus_id: Optional[int] = Depends(catalog_campus_id_for_write("notification_templates")),
                     db=Depends(get_db)):
    if not body.title_template.strip() or not body.body_template.strip():
        fail("Title and message body are required.", 400)
    cur = get_cur(db)

    if campus_id is None:
        cur.execute(
            """UPDATE notification_templates
               SET title_template=%s, body_template=%s, is_active=%s, updated_at=now(), updated_by=%s
               WHERE event_key=%s AND campus_id IS NULL""",
            (body.title_template, body.body_template, body.is_active, user_id, event_key)
        )
        if cur.rowcount == 0:
            fail("Template not found.", 404)
    else:
        cur.execute(
            """UPDATE notification_templates
               SET title_template=%s, body_template=%s, is_active=%s, updated_at=now(), updated_by=%s
               WHERE event_key=%s AND campus_id=%s""",
            (body.title_template, body.body_template, body.is_active, user_id, event_key, campus_id)
        )
        if cur.rowcount == 0:
            # No campus-specific override yet - create one, copying the fixed
            # descriptive fields (display_name/category/audience/available_tags)
            # from the global row so this campus's row is fully self-contained.
            cur.execute(
                "SELECT display_name, category, audience, available_tags FROM notification_templates WHERE event_key=%s AND campus_id IS NULL",
                (event_key,)
            )
            base = cur.fetchone()
            if not base:
                fail("Template not found.", 404)
            cur.execute(
                """INSERT INTO notification_templates
                   (event_key, campus_id, display_name, category, audience, title_template, body_template, available_tags, is_active, updated_at, updated_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now(), %s)""",
                (event_key, campus_id, base["display_name"], base["category"], base["audience"],
                 body.title_template, body.body_template, json.dumps(base["available_tags"]), body.is_active, user_id)
            )
    db.commit()
    return ok(message="Notification template updated.")
