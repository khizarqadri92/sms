"""
FastAPI router for Dynamic Workflow Engine.
Handles CRUD for workflow_definitions, workflow_steps, workflow_conditions,
workflow_assignments, and instance monitoring.
"""

from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()

def get_cur(db): return _get_cur(db)
def fail(msg, code=400): raise HTTPException(status_code=code, detail={"status":"error","message":msg})
def ok(data=None, message="Success"): return {"status":"success","message":message,"data":data}


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class WorkflowDefIn(BaseModel):
    name: str
    code: str
    module: str
    entity_type: str
    description: Optional[str] = None
    is_active: Optional[bool] = True

class WorkflowStepIn(BaseModel):
    step_order: int
    step_name: str
    step_type: Optional[str] = "approve"
    approver_type: Optional[str] = "role"
    approver_role: Optional[str] = None
    approver_user_id: Optional[int] = None
    approver_lookup: Optional[str] = None
    is_required: Optional[bool] = True
    can_reject: Optional[bool] = True
    action_label: Optional[str] = "Approve"
    reject_label: Optional[str] = "Reject"
    entity_status_on_approve: Optional[str] = None
    entity_status_on_reject: Optional[str] = "rejected"
    notify_on_assign: Optional[bool] = True
    notify_title: Optional[str] = None
    notify_body: Optional[str] = None
    wq_priority: Optional[str] = "normal"
    wq_link_template: Optional[str] = None

class WorkflowConditionIn(BaseModel):
    field: str
    operator: str
    value: str
    effect: str

class WorkflowAssignmentIn(BaseModel):
    module: str
    entity_type: str
    workflow_id: int
    condition_field: Optional[str] = None
    condition_op: Optional[str] = "="
    condition_value: Optional[str] = None
    priority: Optional[int] = 0
    is_default: Optional[bool] = False


# ─── Workflow Definitions ─────────────────────────────────────────────────────

@router.get("/")
def list_workflows(
    module: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db)
):
    cur = get_cur(db)
    conds, params = ["1=1"], []
    if module: conds.append("module=%s"); params.append(module)
    if is_active is not None: conds.append("is_active=%s"); params.append(is_active)
    cur.execute(f"""
        SELECT wd.*, COUNT(ws.id) AS step_count
        FROM workflow_definitions wd
        LEFT JOIN workflow_steps ws ON ws.workflow_id = wd.id
        WHERE {" AND ".join(conds)}
        GROUP BY wd.id ORDER BY wd.module, wd.name
    """, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get('created_at'): r['created_at'] = str(r['created_at'])
        if r.get('updated_at'): r['updated_at'] = str(r['updated_at'])
    return ok(data=rows)



# ─── Module Link Registry ─────────────────────────────────────────────────────

@router.get("/module-links")
def get_module_links(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM workflow_module_links ORDER BY module, entity_type")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/module-links/{module}/{entity_type}")
def get_module_link(module: str, entity_type: str,
                    user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM workflow_module_links WHERE module=%s AND entity_type=%s",
                (module, entity_type))
    row = cur.fetchone()
    link = f"{row['page_link']}?id={{entity_id}}" if row else f"/{module}?id={{entity_id}}"
    return ok(data={"link": link, "label": row['label'] if row else module})

@router.get("/condition-fields")
def get_condition_fields(
    module: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db)
):
    cur = get_cur(db)
    conds, params = ["1=1"], []
    if module: conds.append("module=%s"); params.append(module)
    if entity_type: conds.append("entity_type=%s"); params.append(entity_type)
    cur.execute(f"SELECT * FROM workflow_condition_fields WHERE {' AND '.join(conds)} ORDER BY sort_order", params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/{wf_id}")
def get_workflow(wf_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM workflow_definitions WHERE id=%s", (wf_id,))
    wf = cur.fetchone()
    if not wf: fail("Workflow not found.", 404)
    result = dict(wf)
    for k in ('created_at','updated_at'):
        if result.get(k): result[k] = str(result[k])

    # Steps with conditions
    cur.execute("""
        SELECT ws.*, json_agg(json_build_object(
            'id',wc.id,'field',wc.field,'operator',wc.operator,
            'value',wc.value,'effect',wc.effect
        )) FILTER (WHERE wc.id IS NOT NULL) AS conditions
        FROM workflow_steps ws
        LEFT JOIN workflow_conditions wc ON wc.step_id = ws.id
        WHERE ws.workflow_id = %s
        GROUP BY ws.id ORDER BY ws.step_order
    """, (wf_id,))
    result['steps'] = [dict(s) for s in cur.fetchall()]

    # Assignments
    cur.execute("""
        SELECT wa.*, wd.name AS workflow_name
        FROM workflow_assignments wa
        JOIN workflow_definitions wd ON wd.id = wa.workflow_id
        WHERE wa.workflow_id = %s ORDER BY wa.priority DESC
    """, (wf_id,))
    result['assignments'] = [dict(a) for a in cur.fetchall()]

    return ok(data=result)


@router.post("/")
def create_workflow(body: WorkflowDefIn,
                    user_id: int = Depends(require_permission("users.manage_roles")),
                    db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM workflow_definitions WHERE code=%s", (body.code,))
    if cur.fetchone(): fail(f"Workflow with code '{body.code}' already exists.")
    cur.execute("""
        INSERT INTO workflow_definitions (name, code, module, entity_type, description, is_active, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (body.name, body.code, body.module, body.entity_type,
          body.description, body.is_active, user_id))
    wf_id = cur.fetchone()['id']
    db.commit()
    return ok(data={"id": wf_id}, message="Workflow created.")


@router.put("/{wf_id}")
def update_workflow(wf_id: int, body: WorkflowDefIn,
                    user_id: int = Depends(require_permission("users.manage_roles")),
                    db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        UPDATE workflow_definitions SET name=%s, module=%s, entity_type=%s,
        description=%s, is_active=%s, updated_at=NOW() WHERE id=%s
    """, (body.name, body.module, body.entity_type,
          body.description, body.is_active, wf_id))
    if cur.rowcount == 0: fail("Workflow not found.", 404)
    db.commit()
    return ok(message="Workflow updated.")


@router.delete("/{wf_id}")
def delete_workflow(wf_id: int,
                    user_id: int = Depends(require_permission("users.manage_roles")),
                    db=Depends(get_db)):
    cur = get_cur(db)
    # Clean up all related records
    cur.execute("""DELETE FROM workflow_step_instances WHERE instance_id IN
        (SELECT id FROM workflow_instances WHERE workflow_id=%s)""", (wf_id,))
    cur.execute("DELETE FROM workflow_instances WHERE workflow_id=%s", (wf_id,))
    cur.execute("DELETE FROM workflow_assignment_conditions WHERE assignment_id IN (SELECT id FROM workflow_assignments WHERE workflow_id=%s)", (wf_id,))
    cur.execute("DELETE FROM workflow_assignments WHERE workflow_id=%s", (wf_id,))
    cur.execute("DELETE FROM workflow_steps WHERE workflow_id=%s", (wf_id,))
    cur.execute("DELETE FROM workflow_definitions WHERE id=%s", (wf_id,))
    db.commit()
    return ok(message="Workflow deleted.")


# ─── Workflow Steps ───────────────────────────────────────────────────────────

@router.post("/{wf_id}/steps")
def add_step(wf_id: int, body: WorkflowStepIn,
             user_id: int = Depends(require_permission("users.manage_roles")),
             db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO workflow_steps
            (workflow_id, step_order, step_name, step_type, approver_type,
             approver_role, approver_user_id, approver_lookup, is_required,
             can_reject, action_label, reject_label, entity_status_on_approve,
             entity_status_on_reject, notify_on_assign, notify_title, notify_body,
             wq_priority, wq_link_template)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (wf_id, body.step_order, body.step_name, body.step_type, body.approver_type,
          body.approver_role, body.approver_user_id, body.approver_lookup,
          body.is_required, body.can_reject, body.action_label, body.reject_label,
          body.entity_status_on_approve, body.entity_status_on_reject,
          body.notify_on_assign, body.notify_title, body.notify_body,
          body.wq_priority, body.wq_link_template))
    step_id = cur.fetchone()['id']
    db.commit()
    return ok(data={"id": step_id}, message="Step added.")


@router.put("/steps/{step_id}")
def update_step(step_id: int, body: WorkflowStepIn,
                user_id: int = Depends(require_permission("users.manage_roles")),
                db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        UPDATE workflow_steps SET
            step_order=%s, step_name=%s, step_type=%s, approver_type=%s,
            approver_role=%s, approver_user_id=%s, approver_lookup=%s,
            is_required=%s, can_reject=%s, action_label=%s, reject_label=%s,
            entity_status_on_approve=%s, entity_status_on_reject=%s,
            notify_on_assign=%s, notify_title=%s, notify_body=%s,
            wq_priority=%s, wq_link_template=%s
        WHERE id=%s
    """, (body.step_order, body.step_name, body.step_type, body.approver_type,
          body.approver_role, body.approver_user_id, body.approver_lookup,
          body.is_required, body.can_reject, body.action_label, body.reject_label,
          body.entity_status_on_approve, body.entity_status_on_reject,
          body.notify_on_assign, body.notify_title, body.notify_body,
          body.wq_priority, body.wq_link_template, step_id))
    if cur.rowcount == 0: fail("Step not found.", 404)
    db.commit()
    return ok(message="Step updated.")


@router.delete("/steps/{step_id}")
def delete_step(step_id: int,
                user_id: int = Depends(require_permission("users.manage_roles")),
                db=Depends(get_db)):
    cur = get_cur(db)
    # Remove step instances first
    cur.execute("DELETE FROM workflow_step_instances WHERE step_id=%s", (step_id,))
    cur.execute("DELETE FROM workflow_steps WHERE id=%s", (step_id,))
    db.commit()
    return ok(message="Step deleted.")


# ─── Step Conditions ──────────────────────────────────────────────────────────

@router.post("/steps/{step_id}/conditions")
def add_condition(step_id: int, body: WorkflowConditionIn,
                  user_id: int = Depends(require_permission("users.manage_roles")),
                  db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO workflow_conditions (step_id, field, operator, value, effect)
        VALUES (%s,%s,%s,%s,%s) RETURNING id
    """, (step_id, body.field, body.operator, body.value, body.effect))
    cond_id = cur.fetchone()['id']
    db.commit()
    return ok(data={"id": cond_id}, message="Condition added.")


@router.delete("/conditions/{cond_id}")
def delete_condition(cond_id: int,
                     user_id: int = Depends(require_permission("users.manage_roles")),
                     db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM workflow_conditions WHERE id=%s", (cond_id,))
    db.commit()
    return ok(message="Condition deleted.")


# ─── Workflow Assignments ─────────────────────────────────────────────────────

@router.get("/assignments/list")
def list_assignments(
    module: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db)
):
    cur = get_cur(db)
    conds, params = ["1=1"], []
    if module: conds.append("wa.module=%s"); params.append(module)
    cur.execute(f"""
        SELECT wa.*, wd.name AS workflow_name, wd.module AS workflow_module
        FROM workflow_assignments wa
        JOIN workflow_definitions wd ON wd.id = wa.workflow_id
        WHERE {" AND ".join(conds)}
        ORDER BY wa.module, wa.entity_type, wa.priority DESC
    """, params)
    assignments = [dict(r) for r in cur.fetchall()]
    # Attach conditions to each assignment
    for a in assignments:
        cur.execute("SELECT * FROM workflow_assignment_conditions WHERE assignment_id=%s ORDER BY id", (a["id"],))
        a["conditions"] = [dict(c) for c in cur.fetchall()]
    return ok(data=assignments)


@router.post("/assignments")
def create_assignment(body: WorkflowAssignmentIn,
                      user_id: int = Depends(require_permission("users.manage_roles")),
                      db=Depends(get_db)):
    cur = get_cur(db)
    if body.is_default:
        cur.execute(
            "UPDATE workflow_assignments SET is_default=FALSE WHERE module=%s AND entity_type=%s",
            (body.module, body.entity_type)
        )
    cur.execute("""
        INSERT INTO workflow_assignments (module, entity_type, workflow_id, priority, is_default)
        VALUES (%s,%s,%s,%s,%s) RETURNING id
    """, (body.module, body.entity_type, body.workflow_id, body.priority, body.is_default))
    assign_id = cur.fetchone()['id']
    db.commit()
    return ok(data={"id": assign_id}, message="Assignment created.")


@router.put("/assignments/{assign_id}")
def update_assignment(assign_id: int, body: WorkflowAssignmentIn,
                      user_id: int = Depends(require_permission("users.manage_roles")),
                      db=Depends(get_db)):
    cur = get_cur(db)
    if body.is_default:
        cur.execute(
            "UPDATE workflow_assignments SET is_default=FALSE WHERE module=%s AND entity_type=%s AND id!=%s",
            (body.module, body.entity_type, assign_id)
        )
    cur.execute("""
        UPDATE workflow_assignments SET workflow_id=%s, priority=%s, is_default=%s, is_active=%s WHERE id=%s
    """, (body.workflow_id, body.priority, body.is_default, True, assign_id))
    db.commit()
    return ok(message="Assignment updated.")


@router.delete("/assignments/{assign_id}")
def delete_assignment(assign_id: int,
                      user_id: int = Depends(require_permission("users.manage_roles")),
                      db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM workflow_assignments WHERE id=%s", (assign_id,))
    db.commit()
    return ok(message="Assignment deleted.")


# ─── Instance Monitoring ──────────────────────────────────────────────────────

@router.get("/instances/list")
def list_instances(
    module: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    user_id: int = Depends(require_permission("users.manage_roles")),
    db=Depends(get_db)
):
    cur = get_cur(db)
    conds, params = ["1=1"], []
    if module: conds.append("wi.module=%s"); params.append(module)
    if status: conds.append("wi.status=%s"); params.append(status)
    params.append(limit)
    cur.execute(f"""
        SELECT wi.*, wd.name AS workflow_name,
               (SELECT COUNT(*) FROM workflow_step_instances WHERE instance_id=wi.id) AS total_steps,
               (SELECT COUNT(*) FROM workflow_step_instances WHERE instance_id=wi.id AND status='pending') AS pending_steps
        FROM workflow_instances wi
        JOIN workflow_definitions wd ON wd.id = wi.workflow_id
        WHERE {" AND ".join(conds)}
        ORDER BY wi.created_at DESC LIMIT %s
    """, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ('created_at','updated_at','completed_at'):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


@router.get("/instances/{module}/{entity_type}/{entity_id}")
def get_instance(module: str, entity_type: str, entity_id: int,
                 user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    from app.utils.workflow_engine import engine
    status = engine.get_status(db, module=module, entity_type=entity_type, entity_id=entity_id)
    if not status: fail("No workflow instance found.", 404)
    return ok(data=status)


@router.get("/modules/list")
def list_modules(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """List all modules/entity_types that have workflows configured."""
    cur = get_cur(db)
    cur.execute("""
        SELECT DISTINCT module, entity_type FROM workflow_definitions
        WHERE is_active=TRUE ORDER BY module, entity_type
    """)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/roles/list")
def list_roles(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """List all roles for approver assignment dropdowns."""
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM roles ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


# ─── Assignment Conditions ────────────────────────────────────────────────────

class AssignmentConditionIn(BaseModel):
    field:    str
    operator: str
    value:    str

@router.post("/assignments/{assign_id}/conditions")
def add_assignment_condition(assign_id: int, body: AssignmentConditionIn,
                             user_id: int = Depends(require_permission("users.manage_roles")),
                             db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "INSERT INTO workflow_assignment_conditions (assignment_id, field, operator, value) VALUES (%s,%s,%s,%s) RETURNING id",
        (assign_id, body.field, body.operator, body.value)
    )
    cond_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": cond_id}, message="Condition added.")

@router.delete("/assignments/conditions/{cond_id}")
def delete_assignment_condition(cond_id: int,
                                user_id: int = Depends(require_permission("users.manage_roles")),
                                db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM workflow_assignment_conditions WHERE id=%s", (cond_id,))
    db.commit()
    return ok(message="Condition removed.")


# ─── Condition Fields Registry ────────────────────────────────────────────────


@router.get("/condition-fields/{field_key}/options")
def get_field_options(field_key: str,
                      user_id: int = Depends(get_current_user_id),
                      db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT field_type, field_options, dropdown_sql FROM workflow_condition_fields WHERE field_key=%s LIMIT 1", (field_key,))
    row = cur.fetchone()
    if not row:
        return ok(data=[])
    if row["dropdown_sql"]:
        try:
            cur.execute(row["dropdown_sql"])
            rows = cur.fetchall()
            return ok(data=[dict(r) for r in rows])
        except Exception as e:
            return ok(data=[], message=str(e))
    if row["field_options"]:
        import json
        opts = row["field_options"] if isinstance(row["field_options"], list) else json.loads(row["field_options"])
        return ok(data=[{"value": o, "label": o.capitalize()} for o in opts])
    return ok(data=[])
