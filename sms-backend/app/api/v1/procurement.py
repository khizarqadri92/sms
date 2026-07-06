from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
import psycopg2.extras

from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db

bp = Blueprint("procurement", __name__)


def get_cur():
    return get_db().cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def clean(value):
    return value if value not in ("", None) else None


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


# ── Departments ──────────────────────────────────────────────

@bp.get("/departments")
@jwt_required_custom
def list_departments():
    cur = get_cur()
    cur.execute("SELECT * FROM vw_departments")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/departments")
@jwt_required_custom
@require_permission("procurement.manage")
def create_department():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_create_department(%s, %s)", (body["name"], clean(body.get("head_user_id"))))
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Department created.")


@bp.put("/departments/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def update_department(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_update_department(%s, %s, %s)", (id, body["name"], clean(body.get("head_user_id"))))
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Department not found.", 404)
    db.commit()
    return success(data=dict(row), message="Department updated.")


@bp.delete("/departments/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def deactivate_department(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_department(%s)", (id,))
    db.commit()
    return success(message="Department deactivated.")


@bp.post("/departments/<int:id>/reactivate")
@jwt_required_custom
@require_permission("procurement.manage")
def reactivate_department(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_department(%s)", (id,))
    db.commit()
    return success(message="Department reactivated.")


# ── Vendor Categories ────────────────────────────────────────

@bp.get("/vendor-categories")
@jwt_required_custom
@require_permission("procurement.view")
def list_vendor_categories():
    cur = get_cur()
    cur.execute("SELECT * FROM procurement_vendor_categories WHERE is_active = TRUE ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/vendor-categories")
@jwt_required_custom
@require_permission("procurement.manage")
def create_vendor_category():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_create_vendor_category(%s)", (body["name"],))
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Vendor category created.")


@bp.delete("/vendor-categories/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def deactivate_vendor_category(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_vendor_category(%s)", (id,))
    db.commit()
    return success(message="Vendor category deactivated.")


# ── Vendors ──────────────────────────────────────────────────

@bp.get("/vendors")
@jwt_required_custom
@require_permission("procurement.view")
def list_vendors():
    search = request.args.get("search")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(name ILIKE %s OR contact_person ILIKE %s OR ntn ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t]
    query = "SELECT * FROM vw_procurement_vendors WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/vendors")
@jwt_required_custom
@require_permission("procurement.manage")
def create_vendor():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_vendor(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            body["name"], clean(body.get("contact_person")), clean(body.get("phone")), clean(body.get("email")),
            clean(body.get("address")), clean(body.get("ntn")), clean(body.get("strn")),
            clean(body.get("bank_name")), clean(body.get("bank_account_no")), clean(body.get("bank_iban")),
            clean(body.get("category_id")),
        )
    )
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Vendor created.")


@bp.put("/vendors/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def update_vendor(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_update_vendor(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, body["name"], clean(body.get("contact_person")), clean(body.get("phone")), clean(body.get("email")),
            clean(body.get("address")), clean(body.get("ntn")), clean(body.get("strn")),
            clean(body.get("bank_name")), clean(body.get("bank_account_no")), clean(body.get("bank_iban")),
            clean(body.get("category_id")),
        )
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Vendor not found.", 404)
    db.commit()
    return success(data=dict(row), message="Vendor updated.")


@bp.delete("/vendors/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def deactivate_vendor(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_vendor(%s)", (id,))
    db.commit()
    return success(message="Vendor deactivated.")


@bp.post("/vendors/<int:id>/reactivate")
@jwt_required_custom
@require_permission("procurement.manage")
def reactivate_vendor(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_vendor(%s)", (id,))
    db.commit()
    return success(message="Vendor reactivated.")


@bp.post("/vendors/<int:id>/blacklist")
@jwt_required_custom
@require_permission("procurement.manage")
def blacklist_vendor(id):
    body = request.get_json() or {}
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_blacklist_vendor(%s, %s)", (id, clean(body.get("reason"))))
    db.commit()
    return success(message="Vendor blacklisted.")


@bp.post("/vendors/<int:id>/unblacklist")
@jwt_required_custom
@require_permission("procurement.manage")
def unblacklist_vendor(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_unblacklist_vendor(%s)", (id,))
    db.commit()
    return success(message="Vendor removed from blacklist.")


# ── Item Categories ────────────────────────────────────────

@bp.get("/item-categories")
@jwt_required_custom
def list_item_categories():
    cur = get_cur()
    cur.execute("SELECT * FROM vw_procurement_item_categories")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/item-categories")
@jwt_required_custom
@require_permission("procurement.manage")
def create_item_category():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_create_item_category(%s, %s)", (body["name"], clean(body.get("parent_id"))))
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Item category created.")


@bp.put("/item-categories/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def update_item_category(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_update_item_category(%s, %s, %s)", (id, body["name"], clean(body.get("parent_id"))))
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Item category not found.", 404)
    db.commit()
    return success(data=dict(row), message="Item category updated.")


@bp.delete("/item-categories/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def deactivate_item_category(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_item_category(%s)", (id,))
    db.commit()
    return success(message="Item category deactivated.")


# ── Item Master ──────────────────────────────────────────────

@bp.get("/items")
@jwt_required_custom
def list_items():
    search = request.args.get("search")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(item_name ILIKE %s OR item_code ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t]
    query = "SELECT * FROM vw_procurement_items WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/items")
@jwt_required_custom
@require_permission("procurement.manage")
def create_item():
    body = request.get_json() or {}
    if not body.get("item_name") or not body.get("unit"):
        return error("item_name and unit are required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_item(%s,%s,%s,%s,%s,%s,%s)",
        (
            clean(body.get("item_code")), body["item_name"], body["unit"], clean(body.get("category_id")),
            body.get("min_stock") or 0, clean(body.get("max_stock")), clean(body.get("preferred_vendor_id")),
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"id": result["id"]}, message="Item created.")


@bp.put("/items/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def update_item(id):
    body = request.get_json() or {}
    if not body.get("item_name") or not body.get("unit"):
        return error("item_name and unit are required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_update_item(%s,%s,%s,%s,%s,%s,%s)",
        (
            id, body["item_name"], body["unit"], clean(body.get("category_id")),
            body.get("min_stock") or 0, clean(body.get("max_stock")), clean(body.get("preferred_vendor_id")),
        )
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Item not found.", 404)
    db.commit()
    return success(data=dict(row), message="Item updated.")


@bp.delete("/items/<int:id>")
@jwt_required_custom
@require_permission("procurement.manage")
def deactivate_item(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_item(%s)", (id,))
    db.commit()
    return success(message="Item deactivated.")


@bp.post("/items/<int:id>/reactivate")
@jwt_required_custom
@require_permission("procurement.manage")
def reactivate_item(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_item(%s)", (id,))
    db.commit()
    return success(message="Item reactivated.")



# ── Approval Rules ─────────────────────────

@bp.get("/approval-rules")
@jwt_required_custom
@require_permission("procurement.view")
def list_approval_rules():
    cur = get_cur()
    cur.execute("SELECT * FROM vw_procurement_approval_rules")
    rules = [dict(r) for r in cur.fetchall()]
    for rule in rules:
        cur.execute("SELECT * FROM sp_get_approval_rule_steps(%s)", (rule["id"],))
        rule["steps"] = [dict(s) for s in cur.fetchall()]
    return success(data=rules)


@bp.post("/approval-rules")
@jwt_required_custom
@require_permission("procurement.configure")
def create_approval_rule():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    steps = body.get("steps") or []
    if not steps:
        return error("At least one approval step is required.", 400)

    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_approval_rule(%s,%s,%s,%s,%s,%s,%s)",
        (
            body["name"], clean(body.get("min_amount")), clean(body.get("max_amount")),
            clean(body.get("department_id")), clean(body.get("item_category_id")),
            body.get("is_emergency"), body.get("priority") or 0,
        )
    )
    rule = dict(cur.fetchone())

    for i, step in enumerate(steps, start=1):
        cur.execute("SELECT sp_add_approval_step(%s, %s, %s)", (rule["id"], i, step["approver_role"]))

    db.commit()
    return success(data=rule, message="Approval rule created.")


@bp.put("/approval-rules/<int:id>")
@jwt_required_custom
@require_permission("procurement.configure")
def update_approval_rule(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    steps = body.get("steps") or []
    if not steps:
        return error("At least one approval step is required.", 400)

    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_update_approval_rule(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, body["name"], clean(body.get("min_amount")), clean(body.get("max_amount")),
            clean(body.get("department_id")), clean(body.get("item_category_id")),
            body.get("is_emergency"), body.get("priority") or 0,
        )
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Approval rule not found.", 404)

    cur.execute("SELECT sp_delete_approval_steps(%s)", (id,))
    for i, step in enumerate(steps, start=1):
        cur.execute("SELECT sp_add_approval_step(%s, %s, %s)", (id, i, step["approver_role"]))

    db.commit()
    return success(data=dict(row), message="Approval rule updated.")


@bp.delete("/approval-rules/<int:id>")
@jwt_required_custom
@require_permission("procurement.configure")
def deactivate_approval_rule(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_approval_rule(%s)", (id,))
    db.commit()
    return success(message="Approval rule deactivated.")


@bp.post("/approval-rules/<int:id>/reactivate")
@jwt_required_custom
@require_permission("procurement.configure")
def reactivate_approval_rule(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_approval_rule(%s)", (id,))
    db.commit()
    return success(message="Approval rule reactivated.")



# ── Purchase Requisitions ───────────────────────

@bp.get("/requisitions/my")
@jwt_required_custom
def list_my_requisitions():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT * FROM vw_purchase_requisitions WHERE requested_by = %s ORDER BY created_at DESC", (user_id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/requisitions/pending-my-approval")
@jwt_required_custom
def list_pending_my_approval():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_pending_my_approval(%s)", (user_id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/requisitions")
@jwt_required_custom
@require_permission("procurement.view")
def list_all_requisitions():
    status = request.args.get("status")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if status:
        conditions.append("status = %s")
        params.append(status)
    query = "SELECT * FROM vw_purchase_requisitions WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/requisitions/<int:id>")
@jwt_required_custom
def get_requisition(id):
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT * FROM vw_purchase_requisitions WHERE id = %s", (id,))
    pr = cur.fetchone()
    if not pr:
        return error("Requisition not found.", 404)
    pr = dict(pr)

    if pr["requested_by"] != user_id:
        from app.middleware.rbac import PermissionRepository
        perm_repo = PermissionRepository()
        if not perm_repo.user_has_permission(user_id, "procurement.view"):
            cur.execute("SELECT 1 FROM pr_approval_instances WHERE pr_id = %s AND resolved_approver_id = %s", (id, user_id))
            is_approver = cur.fetchone() is not None
            if not is_approver:
                return error("You do not have permission to view this requisition.", 403)

    cur.execute("SELECT * FROM vw_pr_items_detail WHERE pr_id = %s", (id,))
    pr["items"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM vw_pr_approval_instances WHERE pr_id = %s ORDER BY step_order", (id,))
    pr["approval_steps"] = [dict(r) for r in cur.fetchall()]
    return success(data=pr)


@bp.post("/requisitions")
@jwt_required_custom
def create_requisition():
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_pr(%s,%s,%s,%s,%s,%s)",
        (
            user_id, clean(body.get("department_id")), body.get("priority") or "normal",
            body.get("is_emergency") or False, clean(body.get("budget_head")), clean(body.get("remarks")),
        )
    )
    pr = dict(cur.fetchone())
    db.commit()
    return success(data=pr, message="Requisition created as draft.")


@bp.post("/requisitions/<int:id>/items")
@jwt_required_custom
def add_requisition_item(id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    if not body.get("item_description") or not body.get("quantity") or not body.get("unit"):
        return error("item_description, quantity, and unit are required.", 400)

    db, cur = get_db(), get_cur()
    cur.execute("SELECT requested_by FROM purchase_requisitions WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        return error("Requisition not found.", 404)
    if row["requested_by"] != user_id:
        return error("You do not have permission to edit this requisition.", 403)

    import json
    specs = body.get("specifications")
    specs_json = json.dumps(specs) if specs else None

    cur.execute(
        "SELECT * FROM sp_add_pr_item(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, clean(body.get("item_id")), body["item_description"], body["quantity"], body["unit"],
            clean(body.get("estimated_unit_price")), clean(body.get("remarks")),
            clean(body.get("category_id")), specs_json,
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"id": result["id"]}, message="Item added.")


@bp.delete("/requisitions/items/<int:item_row_id>")
@jwt_required_custom
def remove_requisition_item(item_row_id):
    user_id = int(get_jwt_identity())
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT pr.requested_by FROM pr_items pi JOIN purchase_requisitions pr ON pr.id = pi.pr_id WHERE pi.id = %s",
        (item_row_id,)
    )
    row = cur.fetchone()
    if not row:
        return error("Item not found.", 404)
    if row["requested_by"] != user_id:
        return error("You do not have permission to edit this requisition.", 403)

    cur.execute("SELECT sp_remove_pr_item(%s)", (item_row_id,))
    db.commit()
    return success(message="Item removed.")


@bp.post("/requisitions/<int:id>/submit")
@jwt_required_custom
def submit_requisition(id):
    user_id = int(get_jwt_identity())
    db, cur = get_db(), get_cur()
    cur.execute("SELECT requested_by FROM purchase_requisitions WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        return error("Requisition not found.", 404)
    if row["requested_by"] != user_id:
        return error("You do not have permission to submit this requisition.", 403)

    cur.execute("SELECT * FROM sp_submit_pr(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
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

    return success(data={"matched_rule_id": result["matched_rule_id"]}, message="Requisition submitted for approval.")


@bp.post("/requisitions/<int:id>/act")
@jwt_required_custom
def act_on_requisition(id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    action = body.get("action")
    if action not in ("approve", "reject"):
        return error("action must be approve or reject.", 400)

    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_act_on_pr_step(%s, %s, %s, %s)", (id, user_id, action, clean(body.get("notes"))))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute(
            "SELECT pr.pr_number, pr.requested_by FROM purchase_requisitions pr WHERE pr.id = %s", (id,)
        )
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

    return success(data={"status": result["pr_status"]}, message="Requisition " + ("approved." if result["pr_status"] == "approved" else action + "d."))



# ── Purchase Orders ──────────────────────────

@bp.get("/purchase-orders")
@jwt_required_custom
@require_permission("procurement.view")
def list_purchase_orders():
    status = request.args.get("status")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if status:
        conditions.append("status = %s")
        params.append(status)
    query = "SELECT * FROM vw_purchase_orders WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/purchase-orders/<int:id>")
@jwt_required_custom
@require_permission("procurement.view")
def get_purchase_order(id):
    cur = get_cur()
    cur.execute("SELECT * FROM vw_purchase_orders WHERE id = %s", (id,))
    po = cur.fetchone()
    if not po:
        return error("Purchase Order not found.", 404)
    po = dict(po)
    cur.execute("SELECT * FROM po_items WHERE po_id = %s ORDER BY id", (id,))
    po["items"] = [dict(r) for r in cur.fetchall()]
    return success(data=po)


@bp.post("/purchase-orders")
@jwt_required_custom
@require_permission("procurement.manage")
def create_purchase_order():
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    if not body.get("pr_id") or not body.get("vendor_id"):
        return error("pr_id and vendor_id are required.", 400)

    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_po_from_pr(%s,%s,%s,%s,%s,%s)",
        (
            body["pr_id"], body["vendor_id"], user_id,
            clean(body.get("delivery_address")), clean(body.get("expected_delivery_date")), clean(body.get("terms")),
        )
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute(
            "SELECT pr.requested_by, pr.pr_number, po.po_number FROM purchase_requisitions pr "
            "JOIN purchase_orders po ON po.id = %s WHERE pr.id = %s",
            (result["id"], body["pr_id"])
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

    return success(data={"id": result["id"]}, message="Purchase Order created as draft.")


@bp.put("/purchase-orders/items/<int:item_id>")
@jwt_required_custom
@require_permission("procurement.manage")
def update_po_item(item_id):
    body = request.get_json() or {}
    if body.get("unit_price") is None:
        return error("unit_price is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_update_po_item(%s, %s, %s)", (item_id, body["unit_price"], body.get("tax_percent") or 0))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(message="Item updated.")


@bp.post("/purchase-orders/<int:id>/issue")
@jwt_required_custom
@require_permission("procurement.manage")
def issue_purchase_order(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_issue_po(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
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

    return success(message="Purchase Order issued.")


@bp.post("/purchase-orders/<int:id>/cancel")
@jwt_required_custom
@require_permission("procurement.manage")
def cancel_purchase_order(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_cancel_po(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(message="Purchase Order cancelled.")
