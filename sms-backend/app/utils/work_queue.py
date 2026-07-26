"""
Shared utility for pushing items to the work queue.
All modules import and call push_to_queue() and complete_queue_item().

Usage:
    from app.utils.work_queue import push_to_queue, complete_queue_item, cancel_queue_items

    # Push when action needed:
    push_to_queue(db, module="leaves", entity_type="leave_application", entity_id=34,
        title="Leave Request — Ahmed Ali", description="3 days casual leave",
        action_required="recommend", priority="normal",
        assigned_role="teacher", link="/leaves/34", created_by=user_id)

    # Complete when actioned:
    complete_queue_item(db, module="leaves", entity_id=34,
        entity_type="leave_application", action_required="recommend", completed_by=user_id)

    # Cancel all items for an entity (e.g. leave withdrawn):
    cancel_queue_items(db, module="leaves", entity_id=34, entity_type="leave_application")
"""

import json
from typing import Optional


def push_to_queue(
    db,
    module: str,
    entity_type: str,
    entity_id: int,
    title: str,
    action_required: str,
    link: str,
    created_by: int,
    description: str = "",
    priority: str = "normal",
    assigned_role: Optional[str] = None,
    assigned_user_id: Optional[int] = None,
    due_date: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Optional[int]:
    """
    Create a work queue item. Auto-cancels any existing pending item
    for the same entity + action + role combination to avoid duplicates.
    Returns the new item id.
    """
    try:
        cur = db.cursor()
        cur.execute("""
            SELECT sp_create_work_queue_item(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::date, %s::jsonb, %s) AS item_id
        """, (
            module, entity_type, entity_id,
            title, description or "", action_required,
            priority, assigned_role, assigned_user_id,
            link, due_date, json.dumps(metadata or {}), created_by
        ))
        row = cur.fetchone()
        db.commit()
        return row[0] if row else None
    except Exception as e:
        print(f"[work_queue] push_to_queue error: {e}")
        pass  # caller manages transaction
        return None


def complete_queue_item(
    db,
    module: str,
    entity_id: int,
    entity_type: str,
    action_required: str,
    completed_by: int,
) -> None:
    """Mark work queue item(s) as completed when user actions them."""
    try:
        cur = db.cursor()
        cur.execute("SELECT sp_complete_work_queue_item(%s, %s, %s, %s, %s)",
                    (module, entity_id, entity_type, action_required, completed_by))
        db.commit()
    except Exception as e:
        print(f"[work_queue] complete_queue_item error: {e}")
        pass  # caller manages transaction


def cancel_queue_items(db, module: str, entity_id: int, entity_type: str) -> None:
    """Cancel ALL pending queue items for an entity (e.g. request withdrawn/cancelled)."""
    try:
        cur = db.cursor()
        cur.execute("SELECT sp_cancel_work_queue_items(%s, %s, %s)",
                    (module, entity_id, entity_type))
        db.commit()
    except Exception as e:
        print(f"[work_queue] cancel_queue_items error: {e}")
        pass  # caller manages transaction


# ─── Module-specific helpers (convenience wrappers) ────────────────────────────

def wq_leave_recommend(db, leave_id: int, student_name: str, duration: int,
                       leave_type: str, assigned_role: str, created_by: int):
    push_to_queue(db, module="leaves", entity_type="leave_application",
        entity_id=leave_id,
        title=f"Leave Request — {student_name}",
        description=f"{duration} day(s) {leave_type} leave",
        action_required="recommend", priority="normal",
        assigned_role=assigned_role,
        link=f"/leaves",
        metadata={"student_name": student_name, "duration": duration, "leave_type": leave_type},
        created_by=created_by)


def wq_leave_approve(db, leave_id: int, student_name: str, duration: int,
                     leave_type: str, assigned_role: str, created_by: int):
    push_to_queue(db, module="leaves", entity_type="leave_application",
        entity_id=leave_id,
        title=f"Leave Approval — {student_name}",
        description=f"{duration} day(s) {leave_type} leave",
        action_required="approve", priority="normal",
        assigned_role=assigned_role,
        link=f"/leaves",
        metadata={"student_name": student_name, "duration": duration, "leave_type": leave_type},
        created_by=created_by)


def wq_pr_approve(db, pr_id: int, pr_number: str, amount: float,
                  department: str, assigned_role: str, created_by: int):
    priority = "high" if amount > 50000 else "normal"
    push_to_queue(db, module="procurement", entity_type="purchase_requisition",
        entity_id=pr_id,
        title=f"Purchase Requisition — {pr_number}",
        description=f"PKR {amount:,.0f} — {department}",
        action_required="approve", priority=priority,
        assigned_role=assigned_role,
        link="/procurement/pipeline",
        metadata={"pr_number": pr_number, "amount": amount, "department": department},
        created_by=created_by)


def wq_vendor_invoice_verify(db, inv_id: int, vendor_name: str, amount: float,
                              po_number: str, created_by: int):
    push_to_queue(db, module="finance", entity_type="vendor_invoice",
        entity_id=inv_id,
        title=f"Vendor Invoice — {vendor_name}",
        description=f"PKR {amount:,.0f} against {po_number}",
        action_required="verify", priority="normal",
        assigned_role="finance_officer",
        link="/procurement/vendor-invoices",
        metadata={"vendor_name": vendor_name, "amount": amount, "po_number": po_number},
        created_by=created_by)


def wq_vendor_invoice_approve(db, inv_id: int, vendor_name: str, amount: float,
                               inv_no: str, created_by: int):
    push_to_queue(db, module="finance", entity_type="vendor_invoice",
        entity_id=inv_id,
        title=f"Invoice Approval — {vendor_name}",
        description=f"PKR {amount:,.0f} — {inv_no}",
        action_required="approve", priority="high" if amount > 50000 else "normal",
        assigned_role="principal",
        link="/procurement/vendor-invoices",
        metadata={"vendor_name": vendor_name, "amount": amount, "invoice_no": inv_no},
        created_by=created_by)


def wq_withdrawal_clearance(db, req_id: int, student_name: str,
                             department: str, assigned_role: str, created_by: int):
    push_to_queue(db, module="withdrawal", entity_type="withdrawal_request",
        entity_id=req_id,
        title=f"Withdrawal Clearance — {student_name}",
        description=f"{department} department clearance required",
        action_required="clear", priority="normal",
        assigned_role=assigned_role,
        link="/withdrawal",
        metadata={"student_name": student_name, "department": department},
        created_by=created_by)


def wq_discipline_review(db, case_id: int, student_name: str,
                          violation: str, assigned_role: str, created_by: int):
    push_to_queue(db, module="discipline", entity_type="discipline_case",
        entity_id=case_id,
        title=f"Discipline Case — {student_name}",
        description=violation,
        action_required="review", priority="high",
        assigned_role=assigned_role,
        link="/discipline",
        metadata={"student_name": student_name, "violation": violation},
        created_by=created_by)


def wq_exam_datesheet_approve(db, exam_id: int, exam_name: str,
                               assigned_role: str, created_by: int):
    push_to_queue(db, module="exams", entity_type="exam",
        entity_id=exam_id,
        title=f"Datesheet Approval — {exam_name}",
        description="Exam datesheet submitted for approval",
        action_required="approve", priority="normal",
        assigned_role=assigned_role,
        link="/exams",
        metadata={"exam_name": exam_name},
        created_by=created_by)


def wq_fee_waiver_forward(db, waiver_id: int, student_name: str,
                           amount: float, assigned_role: str, created_by: int):
    push_to_queue(db, module="withdrawal", entity_type="fee_waiver",
        entity_id=waiver_id,
        title=f"Fee Waiver — {student_name}",
        description=f"Waiver request for PKR {amount:,.0f}",
        action_required="approve", priority="high",
        assigned_role=assigned_role,
        link="/withdrawal",
        metadata={"student_name": student_name, "amount": amount},
        created_by=created_by)
