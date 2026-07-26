from app.utils.workflow_engine import engine as wf_engine
"""
Native FastAPI router for Procurement - migrated from app/api/v1/procurement.py.
Every path, method, permission requirement, and response shape matches the
original Flask blueprint exactly, so the existing frontend (procurementApi.js)
needs zero changes. Registered in main.py BEFORE the Flask WSGI mount, so
Starlette routes these paths here instead of falling through to Flask.
"""

import json
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query

from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def clean(value):
    return value if value not in ("", None) else None


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _get_role_user_ids(cur, role_name):
    cur.execute(
        "SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = %s",
        (role_name,)
    )
    return [row["user_id"] for row in cur.fetchall()]


def _notify_current_step_approvers(cur, pr_id, pr_number):
    from app.utils.notify import send_notification
    cur.execute(
        "SELECT approver_role, resolved_approver_id FROM pr_approval_instances "
        "WHERE pr_id = %s AND status = 'pending' ORDER BY step_order LIMIT 1",
        (pr_id,)
    )
    step = cur.fetchone()
    if not step:
        return
    title = "Approval Needed"
    body = "Purchase Requisition " + pr_number + " needs your approval."
    if step["approver_role"] == "department_head":
        if step["resolved_approver_id"]:
            send_notification(step["resolved_approver_id"], title, body, "info", "/procurement/pending-approvals")
    else:
        for uid in _get_role_user_ids(cur, step["approver_role"]):
            send_notification(uid, title, body, "info", "/procurement/pending-approvals")


def _notify_procurement_role(cur, title, body, link=None):
    from app.utils.notify import send_notification
    for uid in _get_role_user_ids(cur, "procurement"):
        send_notification(uid, title, body, "info", link)


# ── Pydantic request models (loosely typed to match Flask's lenient clean() behavior) ──

class DepartmentIn(BaseModel):
    name: str
    head_user_id: Optional[Any] = None


class VendorCategoryIn(BaseModel):
    name: str


class VendorIn(BaseModel):
    name: str
    contact_person: Optional[Any] = None
    phone: Optional[Any] = None
    email: Optional[Any] = None
    address: Optional[Any] = None
    ntn: Optional[Any] = None
    strn: Optional[Any] = None
    bank_name: Optional[Any] = None
    bank_account_no: Optional[Any] = None
    bank_iban: Optional[Any] = None
    category_id: Optional[Any] = None


class VendorBlacklistIn(BaseModel):
    reason: Optional[Any] = None


class ItemCategoryIn(BaseModel):
    name: str
    parent_id: Optional[Any] = None


class ItemIn(BaseModel):
    item_code: Optional[Any] = None
    item_name: str
    unit: str
    category_id: Optional[Any] = None
    min_stock: Optional[Any] = 0
    max_stock: Optional[Any] = None
    preferred_vendor_id: Optional[Any] = None


class ApprovalStepIn(BaseModel):
    approver_role: str


class ApprovalRuleIn(BaseModel):
    name: str
    min_amount: Optional[Any] = None
    max_amount: Optional[Any] = None
    department_id: Optional[Any] = None
    item_category_id: Optional[Any] = None
    is_emergency: Optional[Any] = None
    priority: Optional[Any] = 0
    steps: List[ApprovalStepIn] = []


class RequisitionIn(BaseModel):
    department_id: Optional[Any] = None
    priority: Optional[str] = "normal"
    is_emergency: Optional[Any] = False
    budget_head: Optional[Any] = None
    remarks: Optional[Any] = None


class RequisitionItemIn(BaseModel):
    item_id: Optional[Any] = None
    item_description: str
    quantity: Any
    unit: str
    estimated_unit_price: Optional[Any] = None
    remarks: Optional[Any] = None
    category_id: Optional[Any] = None
    specifications: Optional[Any] = None


class RequisitionActIn(BaseModel):
    action: str
    notes: Optional[Any] = None


class PurchaseOrderIn(BaseModel):
    pr_id: Any
    vendor_id: Any
    delivery_address: Optional[Any] = None
    expected_delivery_date: Optional[Any] = None
    terms: Optional[Any] = None


class POItemUpdateIn(BaseModel):
    unit_price: Any
    tax_percent: Optional[Any] = 0


# ── Departments ──────────────────────────────────────────────

@router.get("/departments")
def list_departments(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_departments")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/departments")
def create_department(body: DepartmentIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_department(%s, %s)", (body.name, clean(body.head_user_id)))
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Department created.")


@router.put("/departments/{id}")
def update_department(id: int, body: DepartmentIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_update_department(%s, %s, %s)", (id, body.name, clean(body.head_user_id)))
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Department not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Department updated.")


@router.delete("/departments/{id}")
def deactivate_department(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_department(%s)", (id,))
    db.commit()
    return ok(message="Department deactivated.")


@router.post("/departments/{id}/reactivate")
def reactivate_department(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_department(%s)", (id,))
    db.commit()
    return ok(message="Department reactivated.")


# ── Vendor Categories ────────────────────────────────────────

@router.get("/vendor-categories")
def list_vendor_categories(user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM procurement_vendor_categories WHERE is_active = TRUE ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/vendor-categories")
def create_vendor_category(body: VendorCategoryIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_vendor_category(%s)", (body.name,))
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Vendor category created.")


@router.delete("/vendor-categories/{id}")
def deactivate_vendor_category(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_vendor_category(%s)", (id,))
    db.commit()
    return ok(message="Vendor category deactivated.")


# ── Vendors ──────────────────────────────────────────────────

@router.get("/vendors")
def list_vendors(search: Optional[str] = Query(None), user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(name ILIKE %s OR contact_person ILIKE %s OR ntn ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t]
    query = "SELECT * FROM vw_procurement_vendors WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/vendors")
def create_vendor(body: VendorIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_vendor(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            body.name, clean(body.contact_person), clean(body.phone), clean(body.email),
            clean(body.address), clean(body.ntn), clean(body.strn),
            clean(body.bank_name), clean(body.bank_account_no), clean(body.bank_iban),
            clean(body.category_id),
        )
    )
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Vendor created.")


@router.put("/vendors/{id}")
def update_vendor(id: int, body: VendorIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_vendor(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, body.name, clean(body.contact_person), clean(body.phone), clean(body.email),
            clean(body.address), clean(body.ntn), clean(body.strn),
            clean(body.bank_name), clean(body.bank_account_no), clean(body.bank_iban),
            clean(body.category_id),
        )
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Vendor not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Vendor updated.")


@router.delete("/vendors/{id}")
def deactivate_vendor(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_vendor(%s)", (id,))
    db.commit()
    return ok(message="Vendor deactivated.")


@router.post("/vendors/{id}/reactivate")
def reactivate_vendor(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_vendor(%s)", (id,))
    db.commit()
    return ok(message="Vendor reactivated.")


@router.post("/vendors/{id}/blacklist")
def blacklist_vendor(id: int, body: VendorBlacklistIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_blacklist_vendor(%s, %s)", (id, clean(body.reason)))
    db.commit()
    return ok(message="Vendor blacklisted.")


@router.post("/vendors/{id}/unblacklist")
def unblacklist_vendor(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_unblacklist_vendor(%s)", (id,))
    db.commit()
    return ok(message="Vendor removed from blacklist.")


# ── Item Categories ────────────────────────────────────────

@router.get("/item-categories")
def list_item_categories(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_procurement_item_categories")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/item-categories")
def create_item_category(body: ItemCategoryIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_item_category(%s, %s)", (body.name, clean(body.parent_id)))
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Item category created.")


@router.put("/item-categories/{id}")
def update_item_category(id: int, body: ItemCategoryIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_update_item_category(%s, %s, %s)", (id, body.name, clean(body.parent_id)))
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Item category not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Item category updated.")


@router.delete("/item-categories/{id}")
def deactivate_item_category(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_item_category(%s)", (id,))
    db.commit()
    return ok(message="Item category deactivated.")


# ── Item Master ──────────────────────────────────────────────

@router.get("/items")
def list_items(search: Optional[str] = Query(None), user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(item_name ILIKE %s OR item_code ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t]
    query = "SELECT * FROM vw_procurement_items WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/items")
def create_item(body: ItemIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_item(%s,%s,%s,%s,%s,%s,%s)",
        (
            clean(body.item_code), body.item_name, body.unit, clean(body.category_id),
            body.min_stock or 0, clean(body.max_stock), clean(body.preferred_vendor_id),
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Item created.")


@router.put("/items/{id}")
def update_item(id: int, body: ItemIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_item(%s,%s,%s,%s,%s,%s,%s)",
        (
            id, body.item_name, body.unit, clean(body.category_id),
            body.min_stock or 0, clean(body.max_stock), clean(body.preferred_vendor_id),
        )
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Item not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Item updated.")


@router.delete("/items/{id}")
def deactivate_item(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_item(%s)", (id,))
    db.commit()
    return ok(message="Item deactivated.")


@router.post("/items/{id}/reactivate")
def reactivate_item(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_item(%s)", (id,))
    db.commit()
    return ok(message="Item reactivated.")


# ── Approval Rules ─────────────────────────

@router.get("/approval-rules")
def list_approval_rules(user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_procurement_approval_rules")
    rules = [dict(r) for r in cur.fetchall()]
    for rule in rules:
        cur.execute("SELECT * FROM sp_get_approval_rule_steps(%s)", (rule["id"],))
        rule["steps"] = [dict(s) for s in cur.fetchall()]
    return ok(data=rules)


@router.post("/approval-rules")
def create_approval_rule(body: ApprovalRuleIn, user_id: int = Depends(require_permission("procurement.configure")), db=Depends(get_db)):
    if not body.steps:
        fail("At least one approval step is required.", 400)
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_approval_rule(%s,%s,%s,%s,%s,%s,%s)",
        (
            body.name, clean(body.min_amount), clean(body.max_amount),
            clean(body.department_id), clean(body.item_category_id),
            body.is_emergency, body.priority or 0,
        )
    )
    rule = dict(cur.fetchone())

    for i, step in enumerate(body.steps, start=1):
        cur.execute("SELECT sp_add_approval_step(%s, %s, %s)", (rule["id"], i, step.approver_role))

    db.commit()
    return ok(data=rule, message="Approval rule created.")


@router.put("/approval-rules/{id}")
def update_approval_rule(id: int, body: ApprovalRuleIn, user_id: int = Depends(require_permission("procurement.configure")), db=Depends(get_db)):
    if not body.steps:
        fail("At least one approval step is required.", 400)
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_approval_rule(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, body.name, clean(body.min_amount), clean(body.max_amount),
            clean(body.department_id), clean(body.item_category_id),
            body.is_emergency, body.priority or 0,
        )
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Approval rule not found.", 404)

    cur.execute("SELECT sp_delete_approval_steps(%s)", (id,))
    for i, step in enumerate(body.steps, start=1):
        cur.execute("SELECT sp_add_approval_step(%s, %s, %s)", (id, i, step.approver_role))

    db.commit()
    return ok(data=dict(row), message="Approval rule updated.")


@router.delete("/approval-rules/{id}")
def deactivate_approval_rule(id: int, user_id: int = Depends(require_permission("procurement.configure")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_approval_rule(%s)", (id,))
    db.commit()
    return ok(message="Approval rule deactivated.")


@router.post("/approval-rules/{id}/reactivate")
def reactivate_approval_rule(id: int, user_id: int = Depends(require_permission("procurement.configure")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_approval_rule(%s)", (id,))
    db.commit()
    return ok(message="Approval rule reactivated.")


# ── Purchase Requisitions ───────────────────────

@router.get("/requisitions/my")
def list_my_requisitions(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_purchase_requisitions WHERE requested_by = %s ORDER BY created_at DESC", (user_id,))
    rows = [dict(r) for r in cur.fetchall()]
    rows = _enrich_prs_with_workflow(db, rows)
    return ok(data=rows)


@router.get("/requisitions/pending-my-approval")
def list_pending_my_approval(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_pending_my_approval(%s)", (user_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/requisitions")
def list_all_requisitions(status: Optional[str] = Query(None), user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if status:
        conditions.append("status = %s")
        params.append(status)
    query = "SELECT * FROM vw_purchase_requisitions WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    rows = _enrich_prs_with_workflow(db, rows)
    return ok(data=rows)


@router.get("/requisitions/{id}")
def get_requisition(id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_purchase_requisitions WHERE id = %s", (id,))
    pr = cur.fetchone()
    if not pr:
        fail("Requisition not found.", 404)
    pr = dict(pr)

    if pr["requested_by"] != user_id:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM role_permissions rp JOIN user_roles ur ON ur.role_id = rp.role_id "
            "JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = %s AND p.code = %s) AS has_perm",
            (user_id, "procurement.view")
        )
        has_view = cur.fetchone()["has_perm"]
        if not has_view:
            cur.execute("SELECT 1 FROM pr_approval_instances WHERE pr_id = %s AND resolved_approver_id = %s", (id, user_id))
            is_approver = cur.fetchone() is not None
            if not is_approver:
                # Also check engine workflow step instances
                cur.execute("""
                    SELECT 1 FROM workflow_step_instances wsi
                    JOIN workflow_instances wi ON wi.id=wsi.instance_id
                    WHERE wi.module='procurement' AND wi.entity_type='purchase_requisition'
                      AND wi.entity_id=%s
                      AND (wsi.assigned_to_id=%s OR wsi.assigned_role=ANY(
                          SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s
                      ))
                    LIMIT 1
                """, (id, user_id, user_id))
                is_approver = cur.fetchone() is not None
            if not is_approver:
                fail("You do not have permission to view this requisition.", 403)

    cur.execute("SELECT * FROM vw_pr_items_detail WHERE pr_id = %s", (id,))
    pr["items"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM vw_pr_approval_instances WHERE pr_id = %s ORDER BY step_order", (id,))
    pr["approval_steps"] = [dict(r) for r in cur.fetchall()]
    # Engine workflow steps (overrides if active)
    try:
        cur.execute("""
            SELECT wsi.step_order, wsi.step_name, wsi.step_type, wsi.status,
                   wsi.assigned_role, wsi.actioned_at
            FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id=wsi.instance_id
            WHERE wi.module='procurement' AND wi.entity_type='purchase_requisition'
              AND wi.entity_id=%s
            ORDER BY wsi.step_order
        """, (id,))
        wf_steps = cur.fetchall()
        if wf_steps:
            def _wf_row(r):
                d = dict(r)
                if d.get("actioned_at"): d["actioned_at"] = str(d["actioned_at"])
                return d
            pr["workflow_steps"] = [_wf_row(r) for r in wf_steps]
            pending = next((s for s in pr["workflow_steps"] if s["status"] == "pending"), None)
            pr["current_wf_step"] = pending["step_name"] if pending else "Completed"
    except Exception:
        pr["workflow_steps"] = []
        pr["current_wf_step"] = None
    return ok(data=pr)


@router.post("/requisitions")
def create_requisition(body: RequisitionIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_pr(%s,%s,%s,%s,%s,%s)",
        (
            user_id, clean(body.department_id), body.priority or "normal",
            body.is_emergency or False, clean(body.budget_head), clean(body.remarks),
        )
    )
    pr = dict(cur.fetchone())
    db.commit()
    return ok(data=pr, message="Requisition created as draft.")


@router.post("/requisitions/{id}/items")
def add_requisition_item(id: int, body: RequisitionItemIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT requested_by FROM purchase_requisitions WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        fail("Requisition not found.", 404)
    if row["requested_by"] != user_id:
        fail("You do not have permission to edit this requisition.", 403)

    specs_json = json.dumps(body.specifications) if body.specifications else None

    cur.execute(
        "SELECT * FROM sp_add_pr_item(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, clean(body.item_id), body.item_description, body.quantity, body.unit,
            clean(body.estimated_unit_price), clean(body.remarks),
            clean(body.category_id), specs_json,
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Item added.")


@router.delete("/requisitions/items/{item_row_id}")
def remove_requisition_item(item_row_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT pr.requested_by FROM pr_items pi JOIN purchase_requisitions pr ON pr.id = pi.pr_id WHERE pi.id = %s",
        (item_row_id,)
    )
    row = cur.fetchone()
    if not row:
        fail("Item not found.", 404)
    if row["requested_by"] != user_id:
        fail("You do not have permission to edit this requisition.", 403)

    cur.execute("SELECT sp_remove_pr_item(%s)", (item_row_id,))
    db.commit()
    return ok(message="Item removed.")



def _enrich_prs_with_workflow(db, rows):
    """Enrich PR list rows with live workflow engine data."""
    if not rows:
        return rows
    _c = db.cursor()
    for row in rows:
        try:
            _c.execute("""
                SELECT
                    wsi.step_order, wsi.step_name, wsi.step_type,
                    wsi.status AS step_status, wsi.assigned_role,
                    wi.status AS wf_status,
                    (SELECT COUNT(*) FROM workflow_step_instances WHERE instance_id=wi.id) AS total_steps,
                    (SELECT COUNT(*) FROM workflow_step_instances WHERE instance_id=wi.id AND status='approved') AS done_steps
                FROM workflow_instances wi
                LEFT JOIN workflow_step_instances wsi ON wsi.instance_id=wi.id AND wsi.status='pending'
                WHERE wi.module='procurement' AND wi.entity_type='purchase_requisition'
                  AND wi.entity_id=%s AND wi.status IN ('active','completed','rejected')
                ORDER BY wi.created_at DESC, wsi.step_order ASC
                LIMIT 1
            """, (row["id"],))
            wf = _c.fetchone()
            if wf:
                row["wf_status"]          = wf[5]   # workflow status
                row["wf_total_steps"]     = wf[6]
                row["wf_done_steps"]      = wf[7]
                row["wf_current_step"]    = wf[1] if wf[3] == 'pending' else None
                row["wf_current_role"]    = wf[4]
                row["wf_step_order"]      = wf[0]
                row["wf_is_engine"]       = True
        except Exception as _e:
            pass
    return rows

def _has_active_pr_workflow(db, pr_id):
    try:
        _c = db.cursor()
        _c.execute("SELECT id FROM workflow_instances WHERE module='procurement' AND entity_type='purchase_requisition' AND entity_id=%s AND status='active' LIMIT 1", (pr_id,))
        return _c.fetchone() is not None
    except Exception:
        return False

def _pr_context(db, pr_id):
    try:
        _c = db.cursor()
        _c.execute("SELECT department_id, priority, requested_by FROM purchase_requisitions WHERE id=%s", (pr_id,))
        row = _c.fetchone()
        if row: return {"entity_id": pr_id, "department_id": row[0], "priority": row[1], "requested_by": row[2]}
    except Exception: pass
    return {"entity_id": pr_id}

def _engine_advance_pr(db, pr_id, action, user_id, note):
    try:
        _c = db.cursor()
        _c.execute("SELECT ws.entity_status_on_approve, ws.entity_status_on_reject FROM workflow_step_instances wsi JOIN workflow_steps ws ON ws.id=wsi.step_id JOIN workflow_instances wi ON wi.id=wsi.instance_id WHERE wi.module='procurement' AND wi.entity_type='purchase_requisition' AND wi.entity_id=%s AND wsi.status='pending' ORDER BY wsi.step_order LIMIT 1", (pr_id,))
        ws = _c.fetchone()
        is_rej = action in ('reject','rejected')
        if is_rej: new_status = (ws[1] if ws and ws[1] else 'rejected')
        else:
            default_s = 'approved' if action == 'approve' else action
            new_status = (ws[0].lower() if ws and ws[0] else default_s)
        # Advance engine and use return value to determine completion
        _adv = wf_engine.advance(db, module="procurement", entity_type="purchase_requisition", entity_id=pr_id, action=action, actioned_by=user_id, note=note or "")
        if is_rej:
            _c.execute("UPDATE purchase_requisitions SET status='rejected' WHERE id=%s", (pr_id,))
            new_status = 'rejected'
        elif _adv and _adv.get('status') == 'completed':
            _c.execute("UPDATE purchase_requisitions SET status='approved' WHERE id=%s", (pr_id,))
            new_status = 'approved'
        else:
            new_status = 'submitted'
        return True, new_status
    except Exception as _e:
        import traceback; traceback.print_exc()
        print("[engine_advance_pr error]", _e)
        return False, None


@router.post("/requisitions/{id}/submit")
def submit_requisition(id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT requested_by FROM purchase_requisitions WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        fail("Requisition not found.", 404)
    if row["requested_by"] != user_id:
        fail("You do not have permission to submit this requisition.", 403)

    # Check if workflow engine has an assignment configured
    _ctx = _pr_context(db, id)
    _wf_test = wf_engine._find_workflow(get_cur(db), "procurement", "purchase_requisition", _ctx)
    if _wf_test:
        # Engine-driven: bypass SP, just mark as submitted
        cur.execute("UPDATE purchase_requisitions SET status='submitted', submitted_at=NOW() WHERE id=%s", (id,))
        db.commit()
    else:
        # Legacy: use SP with pr_approval_rules
        cur.execute("SELECT * FROM sp_submit_pr(%s)", (id,))
        result = cur.fetchone()
        if result["error_msg"]:
            db.rollback()
            fail(result["error_msg"], 400)
        db.commit()

    try:
        cur.execute("SELECT pr_number FROM purchase_requisitions WHERE id = %s", (id,))
        pr_number = cur.fetchone()["pr_number"]
        _notify_procurement_role(
            cur, "New Purchase Requisition Submitted",
            "Requisition " + pr_number + " has been submitted and is in the approval pipeline.",
            "/procurement/pipeline"
        )
        _notify_current_step_approvers(cur, id, pr_number)
    except Exception:
        pass

    # WF Engine: trigger
    try:
        _ctx = _pr_context(db, id)
        _wf_result = wf_engine.trigger(
            db, module="procurement", entity_type="purchase_requisition",
            entity_id=id, initiated_by=user_id,
            submitter_id=user_id, context=_ctx
        )
        if not _wf_result:
            # Fallback: no workflow configured - use old manual WQ insert
            _cwq = db.cursor()
            _cwq.execute(
                "SELECT pai.approver_role, pai.resolved_approver_id, pr.pr_number FROM pr_approval_instances pai JOIN purchase_requisitions pr ON pr.id=pai.pr_id WHERE pai.pr_id=%s AND pai.status=\'pending\' ORDER BY pai.step_order LIMIT 1",
                (id,)
            )
            _step = _cwq.fetchone()
            if _step:
                _role = _step[0]; _uid = _step[1] if _step[1] else None; _prno = _step[2]
            else:
                _cwq.execute("SELECT pr_number FROM purchase_requisitions WHERE id=%s", (id,))
                _pr_row = _cwq.fetchone()
                _role = "procurement"; _uid = None; _prno = _pr_row[0] if _pr_row else str(id)
            _link = "/procurement/pipeline?id=" + str(id)
            _cwq.execute(
                "INSERT INTO work_queue_items (module,entity_type,entity_id,title,description,action_required,priority,assigned_role,assigned_user_id,link,metadata,entity_status,created_by,submitter_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)",
                ("procurement","purchase_requisition",id,str(_prno),"Awaiting approval","approve","normal",_role,_uid,_link,"{}","submitted",user_id,user_id)
            )
    except Exception as _e:
        import traceback; traceback.print_exc()
        print("[PR WF trigger error]", _e)
    return ok(data={}, message="Requisition submitted for approval.")


@router.post("/requisitions/{id}/act")
def act_on_requisition(id: int, body: RequisitionActIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if body.action not in ("approve", "reject", "verify", "recommend", "review", "clear", "sign", "publish"):
        fail("Invalid action.", 400)
    # Engine-first
    if _has_active_pr_workflow(db, id):
        _ok, _new_status = _engine_advance_pr(db, id, body.action, user_id, body.notes)
        if not _ok:
            fail("Workflow advance failed", 500)
        db.commit()
        return ok(data={"status": _new_status}, message="Requisition " + body.action + "d successfully.")
    # Legacy SP
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_act_on_pr_step(%s, %s, %s, %s)", (id, user_id, body.action, clean(body.notes)))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT pr.pr_number, pr.requested_by FROM purchase_requisitions pr WHERE pr.id = %s", (id,))
        pr_row = cur.fetchone()
        pr_number, requested_by = pr_row["pr_number"], pr_row["requested_by"]

        if result["pr_status"] == "approved":
            send_notification(
                requested_by, "Requisition Fully Approved",
                "Your requisition " + pr_number + " has been fully approved and is ready for a Purchase Order.",
                "success", "/procurement/my-requisitions"
            )
            _notify_procurement_role(
                cur, "Requisition Ready for PO",
                "Requisition " + pr_number + " has completed all approvals and is ready to move to a Purchase Order.",
                "/procurement/pipeline"
            )
        elif result["pr_status"] == "rejected":
            send_notification(
                requested_by, "Requisition Rejected",
                "Your requisition " + pr_number + " was rejected.",
                "warning", "/procurement/my-requisitions"
            )
        elif result["pr_status"] == "submitted":
            _notify_current_step_approvers(cur, id, pr_number)
    except Exception:
        pass

    # WF Engine: advance if active workflow
    if _has_active_pr_workflow(db, id):
        _ok, _new_status = _engine_advance_pr(db, id, body.action, user_id, body.notes)
        if not _ok:
            pass  # engine error logged, PR status may have been updated by SP already
    return ok(data={"status": result["pr_status"]}, message="Requisition " + ("approved." if result["pr_status"] == "approved" else body.action + "d."))


# ── Purchase Orders ──────────────────────────

@router.get("/purchase-orders")
def list_purchase_orders(status: Optional[str] = Query(None), user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if status:
        conditions.append("status = %s")
        params.append(status)
    query = "SELECT * FROM vw_purchase_orders WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/purchase-orders/{id}")
def get_purchase_order(id: int, user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_purchase_orders WHERE id = %s", (id,))
    po = cur.fetchone()
    if not po:
        fail("Purchase Order not found.", 404)
    po = dict(po)
    cur.execute("SELECT * FROM po_items WHERE po_id = %s ORDER BY id", (id,))
    po["items"] = [dict(r) for r in cur.fetchall()]
    return ok(data=po)


@router.post("/purchase-orders")
def create_purchase_order(body: PurchaseOrderIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_po_from_pr(%s,%s,%s,%s,%s,%s)",
        (
            body.pr_id, body.vendor_id, user_id,
            clean(body.delivery_address), clean(body.expected_delivery_date), clean(body.terms),
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute(
            "SELECT pr.requested_by, pr.pr_number, po.po_number FROM purchase_requisitions pr "
            "JOIN purchase_orders po ON po.id = %s WHERE pr.id = %s",
            (result["id"], body.pr_id)
        )
        row = cur.fetchone()
        if row:
            send_notification(
                row["requested_by"], "Purchase Order Created",
                "Your requisition " + row["pr_number"] + " is now Purchase Order " + row["po_number"] + ".",
                "info", "/procurement/my-requisitions"
            )
    except Exception:
        pass

    return ok(data={"id": result["id"]}, message="Purchase Order created as draft.")


@router.put("/purchase-orders/items/{item_id}")
def update_po_item(item_id: int, body: POItemUpdateIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_update_po_item(%s, %s, %s)", (item_id, body.unit_price, body.tax_percent or 0))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Item updated.")


@router.post("/purchase-orders/{id}/issue")
def issue_purchase_order(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_issue_po(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute(
            "SELECT pr.requested_by, po.po_number FROM purchase_orders po "
            "JOIN purchase_requisitions pr ON pr.id = po.pr_id WHERE po.id = %s",
            (id,)
        )
        row = cur.fetchone()
        if row:
            send_notification(
                row["requested_by"], "Purchase Order Issued",
                "Purchase Order " + row["po_number"] + " has been issued to the vendor.",
                "info", "/procurement/my-requisitions"
            )
    except Exception:
        pass

    return ok(message="Purchase Order issued.")


@router.post("/purchase-orders/{id}/cancel")
def cancel_purchase_order(id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_cancel_po(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Purchase Order cancelled.")


# ─── Goods Receipt Notes (GRN) ───────────────────────────────────────────────

class GRNCreateIn(BaseModel):
    po_id: int
    received_date: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[dict]] = []


class GRNItemIn(BaseModel):
    po_item_id: int
    quantity_received: float
    condition: Optional[str] = "good"
    notes: Optional[str] = None


@router.get("/grn")
def list_grns(
    po_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_grns(%s)", (po_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("received_date", "created_at", "issued_at"):
            if r.get(k): r[k] = str(r[k])
    if status:
        rows = [r for r in rows if r["status"] == status]
    return ok(data=rows)


@router.get("/grn/{grn_id}")
def get_grn(grn_id: int, user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_grn_detail(%s)", (grn_id,))
    row = cur.fetchone()
    if not row:
        fail("GRN not found.", 404)
    result = dict(row)
    for k in ("received_date", "created_at"):
        if result.get(k): result[k] = str(result[k])
    # Get GRN items with PO item details
    cur.execute("""
        SELECT gi.id, gi.po_item_id, gi.quantity_received, gi.condition, gi.notes,
               pi.item_description, pi.quantity AS ordered_quantity,
               pi.unit, pi.unit_price, pi.received_quantity AS total_received
        FROM grn_items gi
        JOIN po_items pi ON pi.id = gi.po_item_id
        WHERE gi.grn_id = %s ORDER BY gi.id
    """, (grn_id,))
    result["items"] = [dict(r) for r in cur.fetchall()]
    # Get PO items for reference
    cur.execute("""
        SELECT pi.id, pi.item_description, pi.quantity, pi.unit, pi.unit_price,
               COALESCE(pi.received_quantity, 0) AS received_quantity
        FROM po_items pi WHERE pi.po_id = %s ORDER BY pi.id
    """, (result["po_id"],))
    result["po_items"] = [dict(r) for r in cur.fetchall()]
    return ok(data=result)


@router.post("/grn")
def create_grn(body: GRNCreateIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    if not body.po_id:
        fail("po_id is required.", 400)
    if not body.items:
        fail("At least one item is required.", 400)
    cur = get_cur(db)
    # Validate PO is issued or partially delivered
    cur.execute("SELECT status, po_number FROM purchase_orders WHERE id=%s", (body.po_id,))
    po = cur.fetchone()
    if not po:
        fail("Purchase Order not found.", 404)
    if po["status"] not in ("issued", "partially_delivered"):
        fail("GRN can only be created for issued or partially delivered POs.", 400)
    # Generate GRN number
    cur.execute("SELECT NEXTVAL('grn_seq') AS seq")
    seq = cur.fetchone()["seq"]
    from datetime import date
    grn_number = f"GRN-{date.today().year}-{str(seq).zfill(4)}"
    # Create GRN header
    cur.execute("""
        INSERT INTO goods_receipt_notes (grn_number, po_id, received_by, received_date, notes)
        VALUES (%s, %s, %s, %s, %s) RETURNING id
    """, (grn_number, body.po_id, user_id,
          body.received_date or str(date.today()), body.notes or None))
    grn_id = cur.fetchone()["id"]
    # Insert GRN items
    for item in body.items:
        qty = float(item.get("quantity_received", 0))
        if qty <= 0:
            continue
        # Validate quantity not exceeding remaining
        cur.execute("""
            SELECT quantity, COALESCE(received_quantity,0) AS received
            FROM po_items WHERE id=%s AND po_id=%s
        """, (item["po_item_id"], body.po_id))
        poi = cur.fetchone()
        if not poi:
            continue
        remaining = float(poi["quantity"]) - float(poi["received"])
        qty = min(qty, remaining)
        if qty <= 0:
            continue
        cur.execute("""
            INSERT INTO grn_items (grn_id, po_item_id, quantity_received, condition, notes)
            VALUES (%s, %s, %s, %s, %s)
        """, (grn_id, item["po_item_id"], qty,
              item.get("condition", "good"), item.get("notes") or None))
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT created_by FROM purchase_orders WHERE id=%s", (body.po_id,))
        po_row = cur.fetchone()
        with _main.flask_app.app_context():
            if po_row:
                send_notification(po_row["created_by"], "GRN Created",
                    f"Goods Receipt Note {grn_number} created for PO {po['po_number']}.", "info")
    except Exception:
        pass

    return ok(data={"id": grn_id, "grn_number": grn_number}, message=f"GRN {grn_number} created.")


@router.post("/grn/{grn_id}/confirm")
def confirm_grn(grn_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_confirm_grn(%s, %s)", (grn_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"):
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""
            SELECT g.grn_number, po.po_number, po.created_by,
                   pr.requested_by,
                   (ru.first_name || chr(32) || ru.last_name) AS requester_name
            FROM goods_receipt_notes g
            JOIN purchase_orders po ON po.id=g.po_id
            JOIN purchase_requisitions pr ON pr.id=po.pr_id
            JOIN users ru ON ru.id=pr.requested_by
            WHERE g.id=%s
        """, (grn_id,))
        row = cur.fetchone()
        if row:
            # Get item list for notification
            cur.execute("""
                SELECT poi.item_description, gi.quantity_received, poi.unit
                FROM grn_items gi JOIN po_items poi ON poi.id=gi.po_item_id
                WHERE gi.grn_id=%s
            """, (grn_id,))
            items = cur.fetchall()
            item_list = ", ".join(f"{i['item_description']} x{i['quantity_received']} {i['unit'] or ''}" for i in items)
            with _main.flask_app.app_context():
                # Notify PO creator
                send_notification(row["created_by"], "GRN Confirmed",
                    f"GRN {row['grn_number']} confirmed for PO {row['po_number']}.", "success")
                # Notify PR requester to collect order
                if row["requested_by"] != row["created_by"]:
                    send_notification(row["requested_by"], "Your Order Has Arrived — Ready for Collection",
                        f"The items you requested are ready for collection. GRN {row['grn_number']}: {item_list}",
                        "success", "/procurement/my-requisitions")
    except Exception:
        pass

    return ok(message="GRN confirmed. Received quantities updated.")


@router.post("/grn/{grn_id}/cancel")
def cancel_grn(grn_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE goods_receipt_notes SET status='cancelled' WHERE id=%s AND status='draft'", (grn_id,))
    if cur.rowcount == 0:
        fail("GRN not found or already confirmed/cancelled.", 400)
    db.commit()
    return ok(message="GRN cancelled.")


@router.get("/purchase-orders/{po_id}/grns")
def get_po_grns(po_id: int, user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_grns(%s)", (po_id,))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("received_date", "created_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


# ─── Stock Management ─────────────────────────────────────────────────────────

@router.get("/stock")
def get_stock(user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_stock()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/stock/pending-grns")
def get_pending_stock_grns(user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_pending_stock_grns()")
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("received_date", "confirmed_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


@router.get("/stock/grn/{grn_id}")
def get_grn_stock_items(grn_id: int, user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    """Get GRN items enriched with procurement_item stock info for preview."""
    cur = get_cur(db)
    cur.execute("""
        SELECT gi.id, gi.quantity_received, gi.condition,
               poi.item_description, poi.unit,
               pri.item_id,
               COALESCE(pi.item_name, poi.item_description) AS item_name,
               COALESCE(pi.item_code, 'NEW') AS item_code,
               COALESCE(pi.current_stock, 0) AS current_stock,
               CASE WHEN pri.item_id IS NULL THEN TRUE ELSE FALSE END AS is_new_item
        FROM grn_items gi
        JOIN po_items poi ON poi.id = gi.po_item_id
        JOIN pr_items pri ON pri.id = poi.pr_item_id
        LEFT JOIN procurement_items pi ON pi.id = pri.item_id
        WHERE gi.grn_id = %s ORDER BY item_name
    """, (grn_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/grn/{grn_id}/update-stock")
def update_stock_from_grn(grn_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_update_stock_from_grn(%s, %s)", (grn_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"):
        fail(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""
            SELECT g.grn_number, po.po_number, po.created_by
            FROM goods_receipt_notes g JOIN purchase_orders po ON po.id=g.po_id
            WHERE g.id=%s
        """, (grn_id,))
        row = cur.fetchone()
        if row:
            with _main.flask_app.app_context():
                send_notification(row["created_by"], "Stock Updated",
                    f"Stock updated from GRN {row['grn_number']} (PO {row['po_number']}). {result['items_updated']} item(s) updated.", "success")
    except Exception:
        pass

    return ok(message=f"Stock updated. {result['items_updated']} item(s) updated.")


@router.put("/stock/{item_id}")
def adjust_stock(item_id: int, body: dict, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    """Manual stock adjustment."""
    adjustment = body.get("adjustment", 0)
    reason = body.get("reason", "Manual adjustment")
    cur = get_cur(db)
    cur.execute("""
        UPDATE procurement_items SET current_stock = GREATEST(0, COALESCE(current_stock,0) + %s)
        WHERE id=%s RETURNING current_stock
    """, (adjustment, item_id))
    row = cur.fetchone()
    if not row: fail("Item not found.", 404)
    db.commit()
    return ok(data={"current_stock": row["current_stock"]}, message="Stock adjusted.")



def _wq_invoice(db, action, inv_id, vendor_name, amount, inv_no, po_number, user_id):
    from app.utils.work_queue import push_to_queue, complete_queue_item, cancel_queue_items
    desc = "PKR {:,.0f} - {}".format(amount, inv_no)
    if action == "created":
        push_to_queue(db, module="finance", entity_type="vendor_invoice", entity_id=inv_id,
            title="Vendor Invoice - " + vendor_name, description=desc,
            action_required="verify", priority="normal" if amount < 50000 else "high",
            assigned_role="finance_officer", link="/procurement/vendor-invoices?id="+str(inv_id),
            created_by=user_id)
    elif action == "verified":
        complete_queue_item(db, "finance", inv_id, "vendor_invoice", "verify", user_id)
        push_to_queue(db, module="finance", entity_type="vendor_invoice", entity_id=inv_id,
            title="Invoice Approval - " + vendor_name, description=desc,
            action_required="approve", priority="high" if amount > 50000 else "normal",
            assigned_role="principal", link="/procurement/vendor-invoices?id="+str(inv_id),
            created_by=user_id)
    elif action in ("approved", "disputed", "cancelled"):
        cancel_queue_items(db, "finance", inv_id, "vendor_invoice")

@router.post("/grn/{grn_id}/skip-stock")
def skip_stock_from_grn(grn_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_skip_stock_from_grn(%s, %s)", (grn_id, user_id))
    result = cur.fetchone()
    if result and result.get("error_msg"):
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="GRN marked as processed. Stock not updated.")


@router.post("/grn/{grn_id}/notify-collection")
def notify_collection(grn_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    """Manually re-send collection notification to PR requester."""
    cur = get_cur(db)
    cur.execute("""
        SELECT g.grn_number, po.po_number, pr.requested_by,
               (ru.first_name || ' ' || ru.last_name) AS requester_name
        FROM goods_receipt_notes g
        JOIN purchase_orders po ON po.id = g.po_id
        JOIN purchase_requisitions pr ON pr.id = po.pr_id
        JOIN users ru ON ru.id = pr.requested_by
        WHERE g.id = %s AND g.status = 'confirmed'
    """, (grn_id,))
    row = cur.fetchone()
    if not row:
        fail("GRN not found or not confirmed.", 404)
    cur.execute("""
        SELECT poi.item_description, gi.quantity_received, poi.unit
        FROM grn_items gi JOIN po_items poi ON poi.id = gi.po_item_id
        WHERE gi.grn_id = %s
    """, (grn_id,))
    items = cur.fetchall()
    item_list = ", ".join(
        f"{i['item_description']} x{i['quantity_received']} {i['unit'] or ''}"
        for i in items
    )
    try:
        from app.utils.notify import send_notification
        import main as _main
        with _main.flask_app.app_context():
            send_notification(
                row["requested_by"],
                "Your Order Is Ready for Collection",
                f"Please collect your items for GRN {row['grn_number']} (PO {row['po_number']}): {item_list}",
                "success", "/procurement/my-requisitions"
            )
    except Exception as e:
        fail("Notification failed: " + str(e), 500)
    return ok(message=f"Collection notification sent to {row['requester_name']}.")


# ─── Vendor Invoices ──────────────────────────────────────────────────────────

class VendorInvoiceItemIn(BaseModel):
    po_item_id: Optional[int] = None
    description: str
    quantity: Optional[float] = 1
    unit_price: Optional[float] = 0
    tax_percent: Optional[float] = 0


class VendorInvoiceIn(BaseModel):
    vendor_invoice_no: str
    po_id: int
    grn_id: Optional[int] = None
    invoice_date: str
    notes: Optional[str] = None
    items: Optional[List[dict]] = []


class VendorInvoiceUpdateIn(BaseModel):
    vendor_invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[dict]] = []


class DisputeIn(BaseModel):
    reason: str


class PaymentRecordIn(BaseModel):
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = "bank_transfer"
    reference: Optional[str] = None
    notes: Optional[str] = None


@router.get("/vendor-invoices")
def list_vendor_invoices(
    status: Optional[str] = Query(None),
    po_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_vendor_invoices(%s::varchar, %s::integer)", (status, po_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("invoice_date", "received_date", "created_at"):
            if r.get(k): r[k] = str(r[k])
    return ok(data=rows)


@router.get("/vendor-invoices/{inv_id}")
def get_vendor_invoice(inv_id: int, user_id: int = Depends(require_permission("procurement.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_vendor_invoice_detail(%s)", (inv_id,))
    row = cur.fetchone()
    if not row: fail("Vendor invoice not found.", 404)
    result = dict(row)
    for k in ("invoice_date", "received_date", "verified_at", "approved_at", "created_at"):
        if result.get(k): result[k] = str(result[k])
    # Get line items
    cur.execute("""
        SELECT vii.id, vii.po_item_id, vii.description, vii.quantity,
               vii.unit_price, vii.tax_percent, vii.amount,
               poi.item_description AS po_item_description
        FROM vendor_invoice_items vii
        LEFT JOIN po_items poi ON poi.id = vii.po_item_id
        WHERE vii.invoice_id = %s ORDER BY vii.id
    """, (inv_id,))
    result["items"] = [dict(r) for r in cur.fetchall()]
    # Get payment history
    cur.execute("""
        SELECT vip.id, vip.amount, vip.payment_date, vip.payment_method,
               vip.reference, vip.notes, (u.first_name||' '||u.last_name) AS paid_by_name, vip.created_at
        FROM vendor_invoice_payments vip JOIN users u ON u.id=vip.paid_by
        WHERE vip.invoice_id = %s ORDER BY vip.payment_date
    """, (inv_id,))
    payments = [dict(r) for r in cur.fetchall()]
    for p in payments:
        for k in ("payment_date", "created_at"):
            if p.get(k): p[k] = str(p[k])
    result["payments"] = payments
    # Get PO items for reference
    cur.execute("""
        SELECT poi.id, poi.item_description, poi.quantity, poi.unit, poi.unit_price, poi.tax_percent,
               COALESCE(poi.received_quantity, 0) AS received_quantity
        FROM po_items poi WHERE poi.po_id = %s ORDER BY poi.id
    """, (result["po_id"],))
    result["po_items"] = [dict(r) for r in cur.fetchall()]
    return ok(data=result)


def _has_active_inv_workflow(db, inv_id):
    try:
        _c = db.cursor()
        _c.execute("SELECT id FROM workflow_instances WHERE module='finance' AND entity_type='vendor_invoice' AND entity_id=%s AND status='active' LIMIT 1", (inv_id,))
        return _c.fetchone() is not None
    except Exception:
        return False


def _inv_context(db, inv_id):
    try:
        _c = db.cursor()
        _c.execute("SELECT vendor_id, po_id, total_amount FROM vendor_invoices WHERE id=%s", (inv_id,))
        row = _c.fetchone()
        if row: return {"entity_id": inv_id, "vendor_id": row[0], "po_id": row[1], "amount": float(row[2] or 0)}
    except Exception: pass
    return {"entity_id": inv_id}


def _engine_advance_inv(db, inv_id, action, user_id, note):
    try:
        _c = db.cursor()
        _c.execute(
            """SELECT ws.entity_status_on_approve, ws.entity_status_on_reject
               FROM workflow_step_instances wsi
               JOIN workflow_steps ws ON ws.id=wsi.step_id
               JOIN workflow_instances wi ON wi.id=wsi.instance_id
               WHERE wi.module='finance' AND wi.entity_type='vendor_invoice'
                 AND wi.entity_id=%s AND wsi.status='pending'
               ORDER BY wsi.step_order LIMIT 1""", (inv_id,)
        )
        ws = _c.fetchone()
        is_rej = action in ('reject','rejected','dispute')
        if is_rej:
            new_status = (ws[1] if ws and ws[1] else 'disputed')
        else:
            default_s = 'approved' if action == 'approve' else action
            new_status = (ws[0].lower() if ws and ws[0] else default_s)
        _adv = wf_engine.advance(db, module="finance", entity_type="vendor_invoice",
                                  entity_id=inv_id, action=action, actioned_by=user_id, note=note or "")
        if is_rej:
            _c.execute("UPDATE vendor_invoices SET status=%s WHERE id=%s", (new_status, inv_id))
        elif _adv and _adv.get('status') == 'completed':
            _c.execute("UPDATE vendor_invoices SET status='approved' WHERE id=%s", (inv_id,))
            new_status = 'approved'
        else:
            if new_status not in ('pending','verified','approved','paid','disputed','cancelled'):
                new_status = 'pending'
            _c.execute("UPDATE vendor_invoices SET status=%s WHERE id=%s", (new_status, inv_id))
        return True, new_status
    except Exception as _e:
        import traceback; traceback.print_exc()
        print("[engine_advance_inv error]", _e)
        return False, None

@router.post("/vendor-invoices")
def create_vendor_invoice(body: VendorInvoiceIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    if not body.vendor_invoice_no or not body.po_id or not body.invoice_date:
        fail("vendor_invoice_no, po_id and invoice_date are required.", 400)
    cur = get_cur(db)
    # Validate PO exists and is issued/partially delivered/completed
    cur.execute("SELECT vendor_id, status, po_number FROM purchase_orders WHERE id=%s", (body.po_id,))
    po = cur.fetchone()
    if not po: fail("Purchase Order not found.", 404)
    if po["status"] not in ("issued", "partially_delivered", "completed"):
        fail("Vendor invoices can only be created for issued or delivered POs.", 400)
    # Check for duplicate vendor invoice number
    cur.execute("SELECT id FROM vendor_invoices WHERE vendor_invoice_no=%s AND vendor_id=%s", (body.vendor_invoice_no, po["vendor_id"]))
    if cur.fetchone(): fail("A vendor invoice with this number already exists for this vendor.", 400)

    # Calculate totals from items
    items = body.items or []
    subtotal = 0
    tax_total = 0
    for item in items:
        qty = float(item.get("quantity", 1))
        price = float(item.get("unit_price", 0))
        tax_pct = float(item.get("tax_percent", 0))
        item_total = qty * price
        item_tax = item_total * tax_pct / 100
        item["amount"] = round(item_total + item_tax, 2)
        subtotal += item_total
        tax_total += item_tax

    total = round(subtotal + tax_total, 2)
    subtotal = round(subtotal, 2)
    tax_total = round(tax_total, 2)

    cur.execute("""
        INSERT INTO vendor_invoices
            (vendor_invoice_no, po_id, grn_id, vendor_id, invoice_date, received_date,
             subtotal, tax_amount, total_amount, status, notes, created_by)
        VALUES (%s, %s, %s, %s, %s, CURRENT_DATE, %s, %s, %s, 'pending', %s, %s)
        RETURNING id
    """, (body.vendor_invoice_no, body.po_id, body.grn_id or None, po["vendor_id"],
          body.invoice_date, subtotal, tax_total, total, body.notes or None, user_id))
    inv_id = cur.fetchone()["id"]

    for item in items:
        qty = float(item.get("quantity", 1))
        price = float(item.get("unit_price", 0))
        tax_pct = float(item.get("tax_percent", 0))
        amount = round(qty * price * (1 + tax_pct / 100), 2)
        cur.execute("""
            INSERT INTO vendor_invoice_items
                (invoice_id, po_item_id, description, quantity, unit_price, tax_percent, amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (inv_id, item.get("po_item_id") or None, item.get("description", ""),
              qty, price, tax_pct, amount))
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='finance_officer' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for row in rows:
                send_notification(row["id"], "New Vendor Invoice",
                    f"Vendor invoice {body.vendor_invoice_no} received for PO {po['po_number']}. Please verify.", "info")
    except Exception:
        pass

    # Engine trigger
    try:
        _ctx = _inv_context(db, inv_id)
        print("[INV TRIGGER] ctx:", _ctx, "inv_id:", inv_id)
        _wf = wf_engine.trigger(db, module="finance", entity_type="vendor_invoice",
            entity_id=inv_id, initiated_by=user_id, submitter_id=user_id, context=_ctx)
        print("[INV TRIGGER] result:", _wf)
        if _wf: db.commit()
        if not _wf:
            _wq_invoice(db, "created",  inv_id, v.get("name","") if "v" in vars() and isinstance(v,dict) else "", float(total), body.vendor_invoice_no, po.get("po_number","") if "po" in vars() and isinstance(po,dict) else "", user_id)
    except Exception as _we:
        print("[invoice WF trigger error]", _we)
        _wq_invoice(db, "created",  inv_id, v.get("name","") if "v" in vars() and isinstance(v,dict) else "", float(total), body.vendor_invoice_no, po.get("po_number","") if "po" in vars() and isinstance(po,dict) else "", user_id)
    return ok(data={"id": inv_id}, message="Vendor invoice created.")


@router.put("/vendor-invoices/{inv_id}")
def update_vendor_invoice(inv_id: int, body: VendorInvoiceUpdateIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT status, po_id, vendor_id FROM vendor_invoices WHERE id=%s", (inv_id,))
    inv = cur.fetchone()
    if not inv: fail("Invoice not found.", 404)
    if inv["status"] not in ("pending", "disputed"):
        fail("Only pending or disputed invoices can be edited.", 400)

    items = body.items or []
    subtotal = tax_total = 0
    for item in items:
        qty = float(item.get("quantity", 1))
        price = float(item.get("unit_price", 0))
        tax_pct = float(item.get("tax_percent", 0))
        subtotal += qty * price
        tax_total += qty * price * tax_pct / 100

    total = round(subtotal + tax_total, 2)

    cur.execute("""
        UPDATE vendor_invoices SET
            vendor_invoice_no=COALESCE(%s, vendor_invoice_no),
            invoice_date=COALESCE(%s::date, invoice_date),
            notes=%s, subtotal=%s, tax_amount=%s, total_amount=%s
        WHERE id=%s
    """, (body.vendor_invoice_no, body.invoice_date, body.notes,
          round(subtotal, 2), round(tax_total, 2), total, inv_id))

    if items:
        cur.execute("DELETE FROM vendor_invoice_items WHERE invoice_id=%s", (inv_id,))
        for item in items:
            qty = float(item.get("quantity", 1))
            price = float(item.get("unit_price", 0))
            tax_pct = float(item.get("tax_percent", 0))
            amount = round(qty * price * (1 + tax_pct / 100), 2)
            cur.execute("""
                INSERT INTO vendor_invoice_items
                    (invoice_id, po_item_id, description, quantity, unit_price, tax_percent, amount)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (inv_id, item.get("po_item_id") or None, item.get("description", ""),
                  qty, price, tax_pct, amount))
    db.commit()
    return ok(message="Invoice updated.")


@router.post("/vendor-invoices/{inv_id}/act")
def act_on_vendor_invoice(inv_id: int, body: RequisitionActIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if body.action not in ("approve","reject","verify","review","clear","sign","payment","publish"):
        fail("Invalid action.", 400)
    if not _has_active_inv_workflow(db, inv_id):
        fail("No active workflow for this invoice.", 400)
    _ok, _st = _engine_advance_inv(db, inv_id, body.action, user_id, body.notes or "")
    if not _ok: fail("Workflow advance failed.", 500)
    db.commit()
    return ok(data={"status": _st}, message="Invoice " + body.action + "d.")


@router.post("/vendor-invoices/{inv_id}/verify")
def verify_vendor_invoice(inv_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    if _has_active_inv_workflow(db, inv_id):
        _ok, _st = _engine_advance_inv(db, inv_id, 'verify', user_id, '')
        if not _ok: fail('Workflow advance failed', 500)
        db.commit()
        return ok(message='Invoice verified.')
    cur.execute("UPDATE vendor_invoices SET status='verified', verified_by=%s, verified_at=NOW() WHERE id=%s AND status='pending' RETURNING vendor_invoice_no, po_id", (user_id, inv_id))
    row = cur.fetchone()
    if not row: fail("Invoice not found or not in pending status.", 400)
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name IN ('principal','admin') AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for r in rows:
                send_notification(r["id"], "Invoice Verified — Awaiting Approval",
                    f"Vendor invoice {row['vendor_invoice_no']} has been verified and needs your approval.", "info")
    except Exception:
        pass
        _wq_invoice(db, "verified", inv_id, "", 0, "", "", user_id)
    return ok(message="Invoice verified. Awaiting approval.")


@router.post("/vendor-invoices/{inv_id}/approve")
def approve_vendor_invoice(inv_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    if _has_active_inv_workflow(db, inv_id):
        _ok, _st = _engine_advance_inv(db, inv_id, 'approve', user_id, '')
        if not _ok: fail('Workflow advance failed', 500)
        db.commit()
        return ok(message='Invoice approved.')
    cur.execute("UPDATE vendor_invoices SET status='approved', approved_by=%s, approved_at=NOW() WHERE id=%s AND status='verified' RETURNING vendor_invoice_no", (user_id, inv_id))
    row = cur.fetchone()
    if not row: fail("Invoice not found or not verified yet.", 400)
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='finance_officer' AND u.is_active=TRUE")
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for r in rows:
                send_notification(r["id"], "Invoice Approved — Ready for Payment",
                    f"Vendor invoice {row['vendor_invoice_no']} has been approved. Please process payment.", "success")
    except Exception:
        pass
        _wq_invoice(db, "approved", inv_id, "", 0, "", "", user_id)
    return ok(message="Invoice approved. Finance can now process payment.")


@router.post("/vendor-invoices/{inv_id}/dispute")
def dispute_vendor_invoice(inv_id: int, body: DisputeIn, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    if not body.reason: fail("Dispute reason is required.", 400)
    cur = get_cur(db)
    cur.execute("""
        UPDATE vendor_invoices SET status='disputed', dispute_reason=%s
        WHERE id=%s AND status IN ('pending','verified')
        RETURNING vendor_invoice_no, created_by
    """, (body.reason, inv_id))
    row = cur.fetchone()
    if not row: fail("Invoice not found or cannot be disputed at this stage.", 400)
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        with _main.flask_app.app_context():
            send_notification(row["created_by"], "Vendor Invoice Disputed",
                f"Invoice {row['vendor_invoice_no']} has been disputed: {body.reason}", "warning")
    except Exception:
        pass
        _wq_invoice(db, "disputed", inv_id, "", 0, "", "", user_id)
    return ok(message="Invoice marked as disputed.")


@router.post("/vendor-invoices/{inv_id}/pay")
def record_invoice_payment(inv_id: int, body: PaymentRecordIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if not body.amount or float(body.amount) <= 0:
        fail("Payment amount must be greater than zero.", 400)
    cur = get_cur(db)
    cur.execute("SELECT total_amount, paid_amount, status, vendor_invoice_no FROM vendor_invoices WHERE id=%s", (inv_id,))
    inv = cur.fetchone()
    if not inv: fail("Invoice not found.", 404)
    if inv["status"] not in ("approved", "paid"):
        fail("Invoice must be approved before payment can be recorded.", 400)
    balance = float(inv["total_amount"]) - float(inv["paid_amount"])
    if float(body.amount) > balance + 0.01:
        fail(f"Payment amount exceeds balance of Rs. {balance:.2f}", 400)

    from datetime import date as date_mod
    cur.execute("""
        INSERT INTO vendor_invoice_payments
            (invoice_id, amount, payment_date, payment_method, reference, notes, paid_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (inv_id, body.amount, body.payment_date or str(date_mod.today()),
          body.payment_method or "bank_transfer", body.reference or None,
          body.notes or None, user_id))

    new_paid = float(inv["paid_amount"]) + float(body.amount)
    new_status = "paid" if new_paid >= float(inv["total_amount"]) - 0.01 else "approved"
    cur.execute("UPDATE vendor_invoices SET paid_amount=%s, status=%s WHERE id=%s",
                (new_paid, new_status, inv_id))
    db.commit()
    return ok(message=f"Payment of Rs. {float(body.amount):,.2f} recorded." + (" Invoice fully paid." if new_status == "paid" else f" Balance: Rs. {float(inv['total_amount']) - new_paid:,.2f}"))


@router.post("/vendor-invoices/{inv_id}/cancel")
def cancel_vendor_invoice(inv_id: int, user_id: int = Depends(require_permission("procurement.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE vendor_invoices SET status='cancelled' WHERE id=%s AND status IN ('pending','disputed') RETURNING id", (inv_id,))
    if not cur.fetchone(): fail("Invoice not found or cannot be cancelled at this stage.", 400)
    db.commit()
    return ok(message="Invoice cancelled.")
