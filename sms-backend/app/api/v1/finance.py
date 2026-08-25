"""
Native FastAPI router for Finance - migrated from app/api/v1/finance.py.
All 15+ SPs verified clean (no chr() stubs).
PDF generation uses existing Flask utilities via app context + StreamingResponse.
Smart monthly generation migrated as pure Python/DB logic.
All send_notification calls wrapped in Flask app context per project pattern.
"""

import calendar
from datetime import date, timedelta
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id, get_jwt_claims
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime, get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def fmt(row, keys):
    for k in keys:
        if row.get(k): row[k] = str(row[k])
    return row


DATE_KEYS = ["due_date", "issued_at", "paid_at", "valid_from", "valid_until", "created_at",
             "updated_at", "waived_at", "late_fee_billed_through"]


# ─── Pydantic models ────────────────────────────────────────────────────────

class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None


class StructureIn(BaseModel):
    name: str
    amount: float
    frequency: Optional[str] = "monthly"
    fee_category_id: Optional[int] = None
    academic_year_id: Optional[int] = None
    class_id: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = True
    late_fee_type: Optional[str] = "none"
    late_fee_amount: Optional[float] = 0
    due_day: Optional[int] = None


class InvoiceCreateIn(BaseModel):
    student_id: int
    amount: float
    fee_structure_id: Optional[int] = None
    due_date: Optional[str] = None
    discount: Optional[float] = 0
    fine: Optional[float] = 0
    notes: Optional[str] = None


class InvoiceUpdateIn(BaseModel):
    discount: Optional[float] = 0
    fine: Optional[float] = 0
    notes: Optional[str] = None
    status: Optional[str] = "unpaid"
    due_date: Optional[str] = None


class BulkGenerateIn(BaseModel):
    fee_structure_id: int
    class_id: int
    due_date: Optional[str] = None


class PaymentIn(BaseModel):
    invoice_id: int
    amount_paid: float
    method: Optional[str] = "cash"
    reference: Optional[str] = None
    notes: Optional[str] = None
    receipt_image: Optional[str] = None


class ClassFeeConfigIn(BaseModel):
    class_id: int
    academic_year_id: int
    tuition_fee: Optional[float] = 0
    due_day: Optional[int] = 10
    late_fee_type: Optional[str] = "none"
    late_fee_amount: Optional[float] = 0


class ChargeTypeIn(BaseModel):
    name: str
    recurrence: str
    interval_months: Optional[Any] = None


class FeeChargeIn(BaseModel):
    name: str
    amount: float
    charge_type_id: int
    target_type: Optional[str] = "whole_school"
    apply_month: Optional[Any] = None
    apply_year: Optional[Any] = None
    academic_year_id: Optional[Any] = None
    class_ids: Optional[List[int]] = []
    student_ids: Optional[List[int]] = []
    description: Optional[str] = None
    is_active: Optional[bool] = True


class FeeTypeIn(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: Optional[bool] = True


class ClassFeeIn(BaseModel):
    class_id: int
    fee_type_id: int
    academic_year_id: int
    amount: Optional[float] = 0


class DiscountConfigIn(BaseModel):
    on_all: Optional[bool] = False
    fee_type_ids: Optional[List[int]] = []
    sibling_rank_method: Optional[str] = "class"


class SmartMonthlyIn(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    due_day: Optional[int] = None


class MonthlyGenerateIn(BaseModel):
    month: Optional[str] = None


class AutoGenSettingsIn(BaseModel):
    enabled: bool
    day: int
    time: Optional[str] = "01:00"


class SiblingTierIn(BaseModel):
    tiers: List[dict]


# ─── Fee Categories ─────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM fee_categories WHERE is_active = TRUE ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/categories")
def create_category(body: CategoryIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute("INSERT INTO fee_categories (name, description) VALUES (%s, %s) RETURNING *",
                    (body.name, body.description))
        db.commit()
        return ok(data=dict(cur.fetchone()))
    except Exception as e:
        db.rollback(); fail(str(e), 400)


# ─── Fee Structures ──────────────────────────────────────────────────────────

@router.get("/structures")
def list_structures(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT fs.*, fc.name AS category_name, ay.name AS year_name, c.name AS class_name
        FROM fee_structures fs
        LEFT JOIN fee_categories fc ON fc.id = fs.fee_category_id
        LEFT JOIN academic_years ay ON ay.id = fs.academic_year_id
        LEFT JOIN classes c ON c.id = fs.class_id
        WHERE fs.is_active = TRUE ORDER BY fs.name
    """)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/structures")
def create_structure(body: StructureIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO fee_structures
            (name, amount, frequency, fee_category_id, academic_year_id,
             class_id, description, is_active, created_by, late_fee_type, late_fee_amount, due_day)
        VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s) RETURNING *
    """, (body.name, body.amount, body.frequency or "monthly",
          body.fee_category_id or None, body.academic_year_id or None, body.class_id or None,
          body.description or None, user_id, body.late_fee_type or "none",
          body.late_fee_amount or 0, body.due_day or None))
    db.commit()
    return ok(data=dict(cur.fetchone()))


@router.put("/structures/{struct_id}")
def update_structure(struct_id: int, body: StructureIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        UPDATE fee_structures
        SET name=%s, amount=%s, frequency=%s, description=%s, is_active=%s,
            late_fee_type=%s, late_fee_amount=%s, due_day=%s
        WHERE id=%s RETURNING *
    """, (body.name, body.amount, body.frequency or "monthly", body.description or None,
          body.is_active if body.is_active is not None else True,
          body.late_fee_type or "none", body.late_fee_amount or 0,
          body.due_day or None, struct_id))
    db.commit()
    row = cur.fetchone()
    if not row: fail("Not found.", 404)
    return ok(data=dict(row))


@router.delete("/structures/{struct_id}")
def deactivate_structure(struct_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE fee_structures SET is_active=FALSE WHERE id=%s", (struct_id,))
    db.commit()
    return ok(message="Fee structure deactivated.")


# ─── Fee Types ───────────────────────────────────────────────────────────────

@router.get("/fee-types")
def get_fee_types(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM fee_types ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/fee-types")
def create_fee_type(body: FeeTypeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("INSERT INTO fee_types (name, description) VALUES (%s, %s) RETURNING *",
                (body.name, body.description or None))
    db.commit()
    return ok(data=dict(cur.fetchone()), message="Fee type created.")


@router.put("/fee-types/{type_id}")
def update_fee_type(type_id: int, body: FeeTypeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("UPDATE fee_types SET name=%s, description=%s, is_active=%s WHERE id=%s",
                (body.name, body.description, body.is_active if body.is_active is not None else True, type_id))
    db.commit()
    return ok(message="Fee type updated.")


@router.delete("/fee-types/{type_id}")
def delete_fee_type(type_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM fee_types WHERE id=%s", (type_id,))
    db.commit()
    return ok(message="Deleted.")


# ─── Class Fees ───────────────────────────────────────────────────────────────

@router.get("/class-fees")
def get_class_fees(
    class_id: Optional[str] = Query(None), academic_year_id: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    conds, params = ["1=1"], []
    if class_id:
        conds.append("cf.class_id = %s"); params.append(class_id)
    if academic_year_id:
        conds.append("cf.academic_year_id = %s"); params.append(academic_year_id)
    cur.execute(f"""
        SELECT cf.*, c.name AS class_name, ft.name AS fee_type_name, ay.name AS year_name
        FROM class_fees cf
        JOIN classes c ON c.id = cf.class_id
        JOIN fee_types ft ON ft.id = cf.fee_type_id
        JOIN academic_years ay ON ay.id = cf.academic_year_id
        WHERE {" AND ".join(conds)} ORDER BY c.name, ft.name
    """, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/class-fees")
def create_class_fee(body: ClassFeeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO class_fees (class_id, fee_type_id, amount, academic_year_id)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (class_id, fee_type_id, academic_year_id)
        DO UPDATE SET amount=%s, is_active=TRUE RETURNING *
    """, (body.class_id, body.fee_type_id, body.amount or 0, body.academic_year_id, body.amount or 0))
    db.commit()
    return ok(data=dict(cur.fetchone()), message="Class fee saved.")


@router.delete("/class-fees/{fee_id}")
def delete_class_fee(fee_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM class_fees WHERE id=%s", (fee_id,))
    db.commit()
    return ok(message="Deleted.")


# ─── Class Fee Config ─────────────────────────────────────────────────────────

@router.get("/class-fee-config")
def get_class_fee_configs(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT cfc.*, c.name AS class_name, ay.name AS year_name
        FROM class_fee_config cfc
        JOIN classes c ON c.id = cfc.class_id
        JOIN academic_years ay ON ay.id = cfc.academic_year_id
        ORDER BY c.name
    """)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/class-fee-config")
def create_class_fee_config(body: ClassFeeConfigIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if body.late_fee_type not in ("none", "fixed", "percentage", "per_day"):
        fail("Invalid late_fee_type.", 400)
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO class_fee_config (class_id, academic_year_id, tuition_fee, due_day, late_fee_type, late_fee_amount)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (class_id, academic_year_id) DO UPDATE
        SET tuition_fee=EXCLUDED.tuition_fee, due_day=EXCLUDED.due_day,
            late_fee_type=EXCLUDED.late_fee_type, late_fee_amount=EXCLUDED.late_fee_amount
        RETURNING *
    """, (body.class_id, body.academic_year_id, body.tuition_fee or 0,
          body.due_day or 10, body.late_fee_type or "none", body.late_fee_amount or 0))
    db.commit()
    return ok(data=dict(cur.fetchone()), message="Class fee config saved.")


@router.delete("/class-fee-config/{cfg_id}")
def delete_class_fee_config(cfg_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("DELETE FROM class_fee_config WHERE id=%s", (cfg_id,))
    db.commit()
    return ok(message="Deleted.")


# ─── Invoices ────────────────────────────────────────────────────────────────

@router.get("/invoices")
def list_invoices(
    status: Optional[str] = Query(None), student_id: Optional[str] = Query(None),
    class_id: Optional[str] = Query(None), registration_no: Optional[str] = Query(None),
    invoice_no: Optional[str] = Query(None), month: Optional[str] = Query(None),
    academic_year_id: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if status:
        conditions.append("fi.status = %s"); params.append(status)
    if student_id:
        conditions.append("fi.student_id = %s"); params.append(student_id)
    if class_id:
        conditions.append("fi.for_class_id = %s"); params.append(class_id)
    if registration_no:
        conditions.append("(s.enrollment_no ILIKE %s OR s.first_name ILIKE %s OR s.last_name ILIKE %s OR (s.first_name || ' ' || s.last_name) ILIKE %s)")
        t = f"%{registration_no}%"; params += [t, t, t, t]
    if invoice_no:
        conditions.append("fi.invoice_no ILIKE %s"); params.append(f"%{invoice_no}%")
    if month:
        conditions.append("fi.month_year = %s"); params.append(month)
    if academic_year_id:
        conditions.append("c.academic_year_id = %s"); params.append(academic_year_id)
    cur.execute(f"""
        SELECT fi.*, s.first_name || ' ' || s.last_name AS student_name,
               s.enrollment_no, fs.name AS structure_name,
               c.name AS class_name, c.section AS class_section,
               COALESCE((SELECT SUM(amount_paid) FROM payments WHERE invoice_id=fi.id),0) AS paid_amount
        FROM fee_invoices fi
        JOIN students s ON s.id = fi.student_id
        LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id
        LEFT JOIN classes c ON c.id = fi.for_class_id
        WHERE {' AND '.join(conditions)} ORDER BY fi.issued_at DESC LIMIT 200
    """, params)
    rows = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.post("/invoices")
def create_invoice(body: InvoiceCreateIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        INSERT INTO fee_invoices
            (student_id, fee_structure_id, amount, due_date, discount, fine, notes, issued_by, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'unpaid') RETURNING *
    """, (body.student_id, body.fee_structure_id or None, body.amount,
          body.due_date or None, body.discount or 0, body.fine or 0,
          body.notes or None, user_id))
    db.commit()
    return ok(data=fmt(dict(cur.fetchone()), DATE_KEYS))


@router.put("/invoices/{inv_id}")
def update_invoice(inv_id: int, body: InvoiceUpdateIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        UPDATE fee_invoices SET discount=%s, fine=%s, notes=%s, status=%s, due_date=%s
        WHERE id=%s RETURNING *
    """, (body.discount or 0, body.fine or 0, body.notes or None,
          body.status or "unpaid", body.due_date or None, inv_id))
    db.commit()
    row = cur.fetchone()
    if not row: fail("Not found.", 404)
    return ok(data=fmt(dict(row), DATE_KEYS))


@router.post("/invoices/bulk")
def bulk_generate(body: BulkGenerateIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT amount FROM fee_structures WHERE id=%s", (body.fee_structure_id,))
    fs = cur.fetchone()
    if not fs: fail("Fee structure not found.", 404)
    cur.execute("SELECT id FROM students WHERE class_id=%s AND status='active'", (body.class_id,))
    students = cur.fetchall()
    if not students: fail("No active students in this class.", 400)
    count = 0
    for s in students:
        cur.execute("""
            INSERT INTO fee_invoices (student_id, fee_structure_id, amount, due_date, issued_by, status)
            VALUES (%s, %s, %s, %s, %s, 'unpaid')
        """, (s["id"], body.fee_structure_id, fs["amount"], body.due_date, user_id))
        count += 1
    db.commit()
    return ok(message=f"{count} invoices generated successfully.")


@router.post("/invoices/generate-monthly")
def generate_monthly_invoices(body: MonthlyGenerateIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if body.month:
        y, m = body.month.split("-")
        target_month = date(int(y), int(m), 1)
    else:
        today = get_processing_date(db)
        target_month = date(today.year, today.month, 1)
    cur = get_cur(db)
    total = _run_monthly_invoice_generation(cur, db, user_id, target_month)
    return ok(message=f"{total} invoices generated for {target_month.strftime('%B %Y')}.")


@router.post("/invoices/generate-smart-monthly")
def generate_smart_monthly(body: SmartMonthlyIn, user_id: int = Depends(require_permission("finance.bulk")), db=Depends(get_db)):
    yr = body.year or get_processing_date(db).year
    mo = body.month or get_processing_date(db).month
    cur = get_cur(db)
    if body.due_day:
        due_day = body.due_day
    else:
        cur.execute("SELECT value FROM system_settings WHERE key = 'fee_due_day'")
        row = cur.fetchone()
        due_day = int(row["value"]) if row and row["value"].isdigit() else 10
    last_day = calendar.monthrange(yr, mo)[1]
    due_day = min(due_day, last_day)
    result = _run_smart_monthly_generation(cur, db, user_id, yr, mo, due_day)
    return ok(message=f"Generated {result['generated']} invoices. {result['skipped']} already existed.")


@router.get("/invoices/{inv_id}/payments")
def get_invoice_payments(inv_id: int, user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT fi.id, fi.invoice_no, fi.amount, fi.discount, fi.fine, fi.net_amount,
               fi.status, fi.month_year, fi.due_date,
               s.first_name || ' ' || s.last_name AS student_name, s.enrollment_no
        FROM fee_invoices fi JOIN students s ON s.id = fi.student_id WHERE fi.id = %s
    """, (inv_id,))
    invoice = cur.fetchone()
    if not invoice: fail("Invoice not found.", 404)
    cur.execute("""
        SELECT id, amount_paid, method, reference, notes, paid_at, is_verified
        FROM payments WHERE invoice_id = %s ORDER BY paid_at ASC
    """, (inv_id,))
    payments = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    total_paid = sum(float(p.get("amount_paid") or 0) for p in payments)
    inv = fmt(dict(invoice), DATE_KEYS)
    inv["total_paid"] = total_paid
    inv["balance"] = float(inv.get("net_amount") or 0) - total_paid
    cur.execute("""
        SELECT id, item_type, label, amount FROM fee_invoice_items WHERE invoice_id = %s
        ORDER BY CASE item_type WHEN 'tuition' THEN 1 WHEN 'charge' THEN 2
                                WHEN 'discount' THEN 3 WHEN 'late_fee' THEN 4 ELSE 5 END, id
    """, (inv_id,))
    items = [dict(r) for r in cur.fetchall()]
    return ok(data={"invoice": inv, "payments": payments, "items": items})


@router.get("/invoices/{inv_id}/pdf")
def download_invoice_pdf(inv_id: int, user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    try:
        import main as _main
        with _main.flask_app.app_context():
            from app.utils.invoice_pdf import generate_invoice_pdf
            pdf_bytes = generate_invoice_pdf(inv_id)
        return StreamingResponse(
            iter([pdf_bytes]), media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=invoice_{inv_id}.pdf"}
        )
    except Exception as e:
        fail(str(e), 500)


# ─── Payments ────────────────────────────────────────────────────────────────

@router.get("/payments")
def list_payments(
    student: Optional[str] = Query(None), reference: Optional[str] = Query(None),
    class_id: Optional[str] = Query(None), month: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None), to_date: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if student:
        conditions.append("(s.first_name ILIKE %s OR s.last_name ILIKE %s OR s.enrollment_no ILIKE %s OR (s.first_name || ' ' || s.last_name) ILIKE %s)")
        t = f"%{student}%"; params += [t, t, t, t]
    if reference:
        conditions.append("p.reference ILIKE %s"); params.append(f"%{reference}%")
    if class_id:
        conditions.append("fi.for_class_id = %s"); params.append(class_id)
    if month:
        conditions.append("fi.month_year = %s"); params.append(month)
    if from_date:
        conditions.append("p.paid_at::date >= %s"); params.append(from_date)
    if to_date:
        conditions.append("p.paid_at::date <= %s"); params.append(to_date)
    cur.execute("""
        SELECT p.*, fi.amount, fi.status AS invoice_status, fi.month_year, fi.invoice_no, fi.id AS invoice_id,
               s.first_name || ' ' || s.last_name AS student_name, s.enrollment_no, p.receipt_image,
               c.name AS class_name, c.section AS class_section
        FROM payments p
        JOIN fee_invoices fi ON fi.id = p.invoice_id
        JOIN students s ON s.id = fi.student_id
        LEFT JOIN classes c ON c.id = fi.for_class_id
        WHERE """ + " AND ".join(conditions) + " ORDER BY p.paid_at DESC LIMIT 200", params)
    rows = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.post("/payments")
def record_payment(body: PaymentIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM fee_invoices WHERE id=%s", (body.invoice_id,))
    invoice = cur.fetchone()
    if not invoice: fail("Invoice not found.", 404)
    receipt_image = body.receipt_image or None
    if receipt_image and len(receipt_image) > 2000000:
        fail("Receipt image too large. Max 1.5MB.", 400)
    auto_verified = receipt_image is None
    _proc_now = get_processing_datetime(db)
    cur.execute("""
        INSERT INTO payments (invoice_id, amount_paid, method, reference, received_by, notes, receipt_image,
                              is_verified, verified_by, verified_at, paid_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CASE WHEN %s THEN %s ELSE NULL END, %s) RETURNING *
    """, (body.invoice_id, body.amount_paid, body.method or "cash", body.reference or None,
          user_id, body.notes or None, receipt_image, auto_verified,
          user_id if auto_verified else None, auto_verified, _proc_now, _proc_now))
    cur.execute("SELECT COALESCE(SUM(amount_paid),0) AS total_paid FROM payments WHERE invoice_id=%s", (body.invoice_id,))
    total_paid = float(cur.fetchone()["total_paid"])
    net_amount = float(invoice["net_amount"] or invoice["amount"])
    if receipt_image:
        cur.execute("UPDATE fee_invoices SET status='pending_verification' WHERE id=%s", (body.invoice_id,))
    elif total_paid >= net_amount:
        cur.execute("UPDATE fee_invoices SET status='paid', paid_at=%s WHERE id=%s", (get_processing_datetime(db), body.invoice_id,))
    elif total_paid > 0:
        cur.execute("UPDATE fee_invoices SET status='partial' WHERE id=%s", (body.invoice_id,))
    db.commit()

    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""
            SELECT s.user_id, s.parent_id, s.first_name, s.last_name
            FROM fee_invoices fi JOIN students s ON s.id=fi.student_id WHERE fi.id=%s
        """, (body.invoice_id,))
        stu = cur.fetchone()
        if stu:
            status_msg = "submitted and awaiting verification" if receipt_image else "recorded"
            msg = f"Payment of Rs. {float(body.amount_paid):,.0f} has been {status_msg}."
            with _main.flask_app.app_context():
                if stu["user_id"]:
                    send_notification(stu["user_id"], "Payment Received", msg, "success", "/my-fees")
                if stu["parent_id"]:
                    send_notification(stu["parent_id"], "Payment Received",
                        f"{stu['first_name']} {stu['last_name']}: {msg}", "success", "/my-fees")
    except Exception:
        pass

    return ok(message="Payment submitted. Awaiting verification." if receipt_image else "Payment recorded.")


@router.put("/payments/{pay_id}/verify")
def verify_payment(pay_id: int, user_id: int = Depends(require_permission("finance.collect")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM payments WHERE id=%s", (pay_id,))
    payment = cur.fetchone()
    if not payment: fail("Payment not found.", 404)
    cur.execute("UPDATE payments SET is_verified=TRUE, verified_by=%s, verified_at=%s WHERE id=%s", (user_id, get_processing_datetime(db), pay_id))
    cur.execute("SELECT COALESCE(SUM(amount_paid),0) AS total_paid FROM payments WHERE invoice_id=%s", (payment["invoice_id"],))
    total_paid = float(cur.fetchone()["total_paid"])
    cur.execute("SELECT net_amount, amount FROM fee_invoices WHERE id=%s", (payment["invoice_id"],))
    inv = cur.fetchone()
    net_amount = float(inv["net_amount"] or inv["amount"])
    if total_paid >= net_amount:
        cur.execute("UPDATE fee_invoices SET status='paid', paid_at=%s WHERE id=%s", (get_processing_datetime(db), payment["invoice_id"],))
        cur.execute("SELECT s.user_id FROM fee_invoices fi JOIN students s ON s.id = fi.student_id WHERE fi.id = %s", (payment["invoice_id"],))
        paid_stu = cur.fetchone()
        if paid_stu and paid_stu["user_id"]:
            cur.execute("UPDATE users SET is_active=TRUE, lock_reason=NULL WHERE id=%s AND lock_reason='fee_overdue'", (paid_stu["user_id"],))
    else:
        cur.execute("UPDATE fee_invoices SET status='partial' WHERE id=%s", (payment["invoice_id"],))
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""
            SELECT s.user_id, s.parent_id, s.first_name, s.last_name, p.amount_paid
            FROM payments p JOIN fee_invoices fi ON fi.id=p.invoice_id
            JOIN students s ON s.id=fi.student_id WHERE p.id=%s
        """, (pay_id,))
        stu = cur.fetchone()
        if stu:
            msg = f"Your payment of Rs. {float(stu['amount_paid']):,.0f} has been verified."
            with _main.flask_app.app_context():
                if stu["user_id"]:
                    send_notification(stu["user_id"], "Payment Verified", msg, "success", "/my-fees")
                if stu["parent_id"]:
                    send_notification(stu["parent_id"], "Payment Verified",
                        f"{stu['first_name']} {stu['last_name']}: {msg}", "success", "/my-fees")
    except Exception:
        pass
    return ok(message="Payment verified successfully.")


@router.get("/payments/{pay_id}/receipt")
def download_payment_receipt(pay_id: int, user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT is_verified FROM payments WHERE id=%s", (pay_id,))
    pay = cur.fetchone()
    if not pay: fail("Payment not found.", 404)
    if not pay["is_verified"]: fail("Receipt only available after finance officer verification.", 400)
    try:
        import main as _main
        with _main.flask_app.app_context():
            from app.utils.invoice_pdf import generate_payment_receipt_pdf
            pdf_bytes = generate_payment_receipt_pdf(pay_id)
        return StreamingResponse(
            iter([pdf_bytes]), media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=receipt_{pay_id}.pdf"}
        )
    except Exception as e:
        fail(str(e), 500)


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
def finance_dashboard(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""
        SELECT COUNT(*) AS total_invoices,
            COUNT(*) FILTER (WHERE status='paid') AS paid_invoices,
            COUNT(*) FILTER (WHERE status='unpaid') AS unpaid_invoices,
            COUNT(*) FILTER (WHERE status='partial') AS partial_invoices,
            COUNT(*) FILTER (WHERE status='overdue') AS overdue_invoices,
            COUNT(*) FILTER (WHERE status='pending_verification') AS pending_verification_invoices,
            COALESCE(SUM(net_amount),0) AS total_billed,
            COALESCE(SUM(net_amount) FILTER (WHERE status='paid'),0) AS total_collected
        FROM fee_invoices WHERE status != 'cancelled'
    """)
    stats = dict(cur.fetchone())
    cur.execute("SELECT COALESCE(SUM(amount_paid),0) AS collected_today FROM payments WHERE DATE(paid_at) = %s", (get_processing_date(db),))
    stats["collected_today"] = float(cur.fetchone()["collected_today"])
    cur.execute("SELECT COALESCE(SUM(amount_paid),0) AS collected_month FROM payments WHERE DATE_TRUNC('month',paid_at) = DATE_TRUNC('month',%s::date)", (get_processing_date(db),))
    stats["collected_month"] = float(cur.fetchone()["collected_month"])
    cur.execute("SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_paid),0) AS amt FROM payments WHERE is_verified = FALSE")
    pv = cur.fetchone()
    stats["pending_verification_count"] = pv["cnt"]
    stats["pending_verification_amount"] = float(pv["amt"])
    stats["total_billed"] = float(stats["total_billed"])
    stats["total_collected"] = float(stats["total_collected"])
    return ok(data=stats)


# ─── Student Fee Summary ──────────────────────────────────────────────────────

@router.get("/student/{student_id}")
def student_summary(student_id: int, user_id: int = Depends(get_current_user_id), claims: dict = Depends(get_jwt_claims), db=Depends(get_db)):
    perms = claims.get("permissions", [])
    if not any(p in perms for p in ["finance.view","withdrawal.view_all","withdrawal.review","withdrawal.clear","withdrawal.approve"]):
        from app.utils.helpers import fail; fail("Permission denied: finance.view", 403)
    cur = get_cur(db)
    cur.execute("""
        SELECT COUNT(*) AS total_invoices,
               COALESCE(SUM(net_amount),0) AS total_billed,
               COALESCE(SUM(net_amount) FILTER (WHERE status='paid'),0) AS total_paid,
               COALESCE(SUM(net_amount) FILTER (WHERE status IN ('unpaid','partial','overdue')),0) AS total_due,
               COUNT(*) FILTER (WHERE status='overdue') AS overdue_count,
               %s AS student_id
        FROM fee_invoices WHERE student_id = %s AND status != 'cancelled'
    """, (student_id, student_id))
    row = dict(cur.fetchone())
    row["total_billed"] = float(row["total_billed"])
    row["total_paid"] = float(row["total_paid"])
    row["total_due"] = float(row["total_due"])
    return ok(data=row)


# ─── Charges ─────────────────────────────────────────────────────────────────

@router.get("/charges/search")
def search_charges(
    registration_no: Optional[str] = Query(None), receipt_no: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db),
):
    if not registration_no and not receipt_no:
        fail("Provide a registration number or receipt number.", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_search_charges(%s::varchar, %s::varchar)", (registration_no, receipt_no))
    rows = [fmt(dict(r), DATE_KEYS) for r in cur.fetchall()]
    return ok(data=rows)


@router.get("/charges")
def get_fee_charges(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_fee_charges()")
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


@router.post("/charges")
def create_fee_charge(body: FeeChargeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    apply_month = int(body.apply_month) if body.apply_month not in (None, "") else None
    apply_year = int(body.apply_year) if body.apply_year not in (None, "") else None
    acad_yr = int(body.academic_year_id) if body.academic_year_id not in (None, "") else None
    class_ids = [int(c) for c in (body.class_ids or [])]
    student_ids = [int(s) for s in (body.student_ids or [])]
    try:
        cur.execute(
            "SELECT sp_create_fee_charge(%s::varchar,%s::numeric,%s::integer,%s::smallint,%s::integer,%s::varchar,%s::integer[],%s::integer[],%s::integer,%s::text) AS new_id",
            (body.name, body.amount, int(body.charge_type_id), apply_month, apply_year,
             body.target_type or "whole_school", class_ids, student_ids, acad_yr, body.description or None))
        new_id = cur.fetchone()["new_id"]
        cur.execute("SELECT * FROM sp_get_fee_charges() WHERE id = %s", (new_id,))
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback(); fail(str(e).split("\n")[0], 400)
    return ok(data=fmt(dict(row), DATE_KEYS), message="Charge created.")


@router.put("/charges/{charge_id}")
def update_fee_charge(charge_id: int, body: FeeChargeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    apply_month = int(body.apply_month) if body.apply_month not in (None, "") else None
    apply_year = int(body.apply_year) if body.apply_year not in (None, "") else None
    acad_yr = int(body.academic_year_id) if body.academic_year_id not in (None, "") else None
    class_ids = [int(c) for c in (body.class_ids or [])]
    student_ids = [int(s) for s in (body.student_ids or [])]
    try:
        cur.execute(
            "SELECT sp_update_fee_charge(%s::integer,%s::varchar,%s::numeric,%s::integer,%s::smallint,%s::integer,%s::varchar,%s::integer[],%s::integer[],%s::integer,%s::text,%s::boolean) AS updated_id",
            (charge_id, body.name, body.amount, int(body.charge_type_id) if body.charge_type_id else None,
             apply_month, apply_year, body.target_type or "whole_school", class_ids, student_ids,
             acad_yr, body.description or None, body.is_active if body.is_active is not None else True))
        updated_id = cur.fetchone()["updated_id"]
        cur.execute("SELECT * FROM sp_get_fee_charges() WHERE id = %s", (updated_id,))
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback(); fail(str(e).split("\n")[0], 400)
    return ok(data=fmt(dict(row), DATE_KEYS), message="Charge updated.")


@router.delete("/charges/{charge_id}")
def delete_fee_charge(charge_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute("SELECT sp_delete_fee_charge(%s::integer)", (charge_id,))
        db.commit()
    except Exception as e:
        db.rollback(); fail(str(e).split("\n")[0], 400)
    return ok(message="Deleted.")


@router.post("/charges/{item_id}/waive")
def waive_charge(item_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute("SELECT * FROM sp_waive_charge(%s::integer, %s::integer)", (item_id, user_id))
        result = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        msg = str(e)
        if "CHARGE_NOT_FOUND" in msg: fail("Charge item not found.", 404)
        if "INVOICE_ALREADY_PAID" in msg: fail("Cannot waive a charge on an already-paid invoice.", 400)
        if "ALREADY_WAIVED" in msg: fail("This charge has already been waived.", 400)
        fail("Failed to waive charge.", 500)
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("SELECT user_id, parent_id, first_name, last_name FROM students WHERE id = %s", (result["student_id"],))
        stu = cur.fetchone()
        if stu:
            msg = (f"The charge \"{result['waived_label']}\" (Rs. {float(result['waived_amount']):,.0f}) has been waived. "
                   f"Your updated invoice is {result['new_invoice_no']}, amount Rs. {float(result['new_amount']):,.0f}.")
            with _main.flask_app.app_context():
                if stu["user_id"]:
                    send_notification(stu["user_id"], "Charge Waived - Invoice Updated", msg, "info", "/my-fees")
                if stu["parent_id"]:
                    send_notification(stu["parent_id"], f"{stu['first_name']} {stu['last_name']}: Charge Waived", msg, "info", "/my-fees")
    except Exception:
        pass
    return ok(message=f"Charge waived. New invoice {result['new_invoice_no']} generated.",
              data={"new_invoice_id": result["new_invoice_id"], "new_invoice_no": result["new_invoice_no"]})


# ─── Charge Types ─────────────────────────────────────────────────────────────

@router.get("/charge-types")
def get_charge_types(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_charge_types()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/charge-types")
def create_charge_type(body: ChargeTypeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    interval_months = int(body.interval_months) if body.interval_months not in (None, "") else None
    cur = get_cur(db)
    try:
        cur.execute("SELECT * FROM sp_create_charge_type(%s::varchar, %s::varchar, %s::smallint)",
                    (body.name, body.recurrence, interval_months))
        row = cur.fetchone(); db.commit()
    except Exception as e:
        db.rollback(); fail(str(e).split("\n")[0], 400)
    return ok(data=dict(row), message="Charge type created.")


@router.put("/charge-types/{ct_id}")
def update_charge_type(ct_id: int, body: ChargeTypeIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    interval_months = int(body.interval_months) if body.interval_months not in (None, "") else None
    cur = get_cur(db)
    try:
        cur.execute("SELECT * FROM sp_update_charge_type(%s::integer, %s::varchar, %s::varchar, %s::smallint)",
                    (ct_id, body.name, body.recurrence, interval_months))
        row = cur.fetchone(); db.commit()
    except Exception as e:
        db.rollback(); fail(str(e).split("\n")[0], 400)
    return ok(data=dict(row), message="Charge type updated.")


@router.put("/charge-types/{ct_id}/toggle")
def toggle_charge_type(ct_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    try:
        cur.execute("SELECT * FROM sp_toggle_charge_type(%s)", (ct_id,))
        row = cur.fetchone(); db.commit()
    except Exception as e:
        db.rollback(); fail(str(e).split("\n")[0], 400)
    return ok(data=dict(row), message="Charge type status updated.")


# ─── Auto-generate Settings ───────────────────────────────────────────────────

@router.get("/auto-generate-settings")
def get_auto_generate_settings(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT key, value FROM system_settings WHERE key IN (%s,%s,%s,%s)",
                ("fee_auto_generate_enabled","fee_auto_generate_day","fee_auto_generate_last_run","fee_auto_generate_time"))
    rows = {r["key"]: r["value"] for r in cur.fetchall()}
    return ok(data={
        "enabled": rows.get("fee_auto_generate_enabled") == "true",
        "day": int(rows.get("fee_auto_generate_day") or 1),
        "time": rows.get("fee_auto_generate_time") or "01:00",
        "last_run": rows.get("fee_auto_generate_last_run") or None,
    })


@router.put("/auto-generate-settings")
def update_auto_generate_settings(body: AutoGenSettingsIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if body.day < 1 or body.day > 31:
        fail("Day must be between 1 and 31.", 400)
    time_str = (body.time or "01:00").strip()
    parts = time_str.split(":")
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        fail("Time must be in HH:MM format.", 400)
    hh, mm = int(parts[0]), int(parts[1])
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        fail("Time must be a valid 24-hour HH:MM value.", 400)
    time_str = "%02d:%02d" % (hh, mm)
    cur = get_cur(db)
    _pn = get_processing_datetime(db)
    cur.execute("UPDATE system_settings SET value=%s, updated_at=%s WHERE key=%s",
                ("true" if body.enabled else "false", _pn, "fee_auto_generate_enabled"))
    cur.execute("UPDATE system_settings SET value=%s, updated_at=%s WHERE key=%s", (str(body.day), _pn, "fee_auto_generate_day"))
    cur.execute("UPDATE system_settings SET value=%s, updated_at=%s WHERE key=%s", (time_str, _pn, "fee_auto_generate_time"))
    db.commit()
    return ok(message="Auto-generation settings updated.")


@router.post("/auto-generate-settings/run-now")
def run_auto_generate_now(user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    try:
        import main as _main
        with _main.flask_app.app_context():
            from app.utils.fee_automation import run_fee_auto_generation
            result = run_fee_auto_generation(_main.flask_app, force=True)
    except Exception as e:
        fail("Test run failed: " + str(e), 500)
    if result.get("ran"):
        return ok(message=str(result.get("total_generated")) + " invoices generated for " + result.get("month") + " (test run).", data=result)
    return ok(message="No invoices generated: " + result.get("reason", ""), data=result)


# ─── Fee Reminders ────────────────────────────────────────────────────────────

@router.post("/run-fee-reminders")
def run_fee_reminders_endpoint(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    try:
        import main as _main
        with _main.flask_app.app_context():
            from app.utils.fee_reminders import run_fee_reminders
            results = run_fee_reminders()
        return ok(data=results, message="Fee reminders processed.")
    except Exception as e:
        fail(str(e), 500)


# ─── Fee Reports ──────────────────────────────────────────────────────────────

@router.get("/reports/fee-report")
def fee_report_school(
    class_id: Optional[str] = Query(None), academic_year_id: Optional[str] = Query(None),
    month: Optional[str] = Query(None), status: Optional[str] = Query(None),
    registration_no: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("students.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_fee_report_school(%s::integer,%s::integer,%s::varchar,%s::varchar,%s::varchar)",
                (class_id, academic_year_id, month, status, registration_no))
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


@router.get("/reports/fee-report/my-class")
def fee_report_my_class(
    month: Optional[str] = Query(None), status: Optional[str] = Query(None),
    registration_no: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("""
        SELECT ct.class_id FROM teachers t
        JOIN class_teachers ct ON ct.teacher_id = t.id AND ct.is_primary = TRUE
        WHERE t.user_id = %s LIMIT 1
    """, (user_id,))
    row = cur.fetchone()
    if not row: fail("You are not assigned as a class incharge.", 403)
    cur.execute("SELECT * FROM sp_fee_report_class(%s::integer,%s::varchar,%s::varchar,%s::varchar)",
                (row["class_id"], month, status, registration_no))
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


@router.get("/reports/fee-report/my-child")
def fee_report_my_child(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_fee_report_parent(%s::integer)", (user_id,))
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


@router.get("/reports/fee-report/me")
def fee_report_me(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row: fail("Student profile not found.", 404)
    cur.execute("SELECT * FROM sp_fee_report_student(%s::integer)", (row["id"],))
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


# ─── Locked Accounts ──────────────────────────────────────────────────────────

@router.get("/locked-accounts")
def get_locked_accounts(
    class_id: Optional[str] = Query(None), student: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None), to_date: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("students.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_locked_accounts(%s::integer,%s::varchar,%s::date,%s::date)",
                (class_id, student, from_date, to_date))
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


@router.get("/locked-accounts/my-class")
def get_my_class_locked_accounts(
    student: Optional[str] = Query(None), from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("""
        SELECT ct.class_id FROM teachers t
        JOIN class_teachers ct ON ct.teacher_id = t.id AND ct.is_primary = TRUE
        WHERE t.user_id = %s LIMIT 1
    """, (user_id,))
    row = cur.fetchone()
    if not row: fail("You are not assigned as a class incharge.", 403)
    cur.execute("SELECT * FROM sp_get_locked_accounts(%s::integer,%s::varchar,%s::date,%s::date)",
                (row["class_id"], student, from_date, to_date))
    return ok(data=[fmt(dict(r), DATE_KEYS) for r in cur.fetchall()])


@router.post("/unlock-account/{student_id}")
def unlock_account(student_id: int, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT user_id FROM students WHERE id=%s", (student_id,))
    s = cur.fetchone()
    if not s: fail("Student not found.", 404)
    cur.execute("UPDATE users SET is_active=TRUE, lock_reason=NULL WHERE id=%s", (s["user_id"],))
    cur.execute("UPDATE fee_invoices SET notice_level=0 WHERE student_id=%s AND status='overdue'", (student_id,))
    db.commit()
    return ok(message="Account unlocked.")


# ─── Discount Config ──────────────────────────────────────────────────────────

@router.get("/discount-config")
def get_discount_config(user_id: int = Depends(require_permission("finance.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM discount_apply_config LIMIT 1")
    config = dict(cur.fetchone() or {"on_all": False})
    cur.execute("""
        SELECT daf.fee_type_id, ft.name AS fee_type_name
        FROM discount_apply_fee_types daf
        JOIN fee_types ft ON ft.id = daf.fee_type_id
    """)
    config["fee_type_ids"] = [r["fee_type_id"] for r in cur.fetchall()]
    return ok(data=config)


@router.put("/discount-config")
def save_discount_config(body: DiscountConfigIn, user_id: int = Depends(require_permission("finance.manage")), db=Depends(get_db)):
    if body.sibling_rank_method not in ("class", "registration_no", "dob"):
        fail("Invalid sibling_rank_method.", 400)
    cur = get_cur(db)
    cur.execute("UPDATE discount_apply_config SET on_all=%s, sibling_rank_method=%s::varchar, updated_at=%s",
                (body.on_all, body.sibling_rank_method, get_processing_datetime(db)))
    cur.execute("DELETE FROM discount_apply_fee_types")
    for fid in (body.fee_type_ids or []):
        cur.execute("INSERT INTO discount_apply_fee_types (fee_type_id) VALUES (%s) ON CONFLICT DO NOTHING", (fid,))
    db.commit()
    return ok(message="Discount config saved.")


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _run_monthly_invoice_generation(cur, db, user_id, target_month):
    cur.execute("SELECT value FROM system_settings WHERE key = 'fee_due_day'")
    row = cur.fetchone()
    due_day = int(row["value"]) if row else 10
    last_day = calendar.monthrange(target_month.year, target_month.month)[1]
    safe_due_day = min(due_day, last_day)
    due_date = target_month.replace(day=safe_due_day)
    month_year = target_month.strftime("%Y-%m")
    cur.execute("""
        SELECT cf.class_id, cf.amount, c.name AS class_name, c.section, cf.academic_year_id
        FROM class_fees cf JOIN classes c ON c.id = cf.class_id
        JOIN fee_types ft ON ft.id = cf.fee_type_id
        WHERE cf.is_active = TRUE AND ft.name = 'Tuition Fee'
    """)
    class_tuitions = cur.fetchall()
    total_generated = 0
    for ct in class_tuitions:
        cur.execute("SELECT id FROM students WHERE class_id = %s AND status = 'active'", (ct["class_id"],))
        students = cur.fetchall()
        for s in students:
            cur.execute("SELECT id FROM fee_invoices WHERE student_id = %s AND month_year = %s", (s["id"], month_year))
            if cur.fetchone(): continue
            _proc_year = get_processing_date(db).year
            cur.execute("""
                INSERT INTO fee_invoices
                    (student_id, fee_structure_id, amount, due_date, issued_by,
                     status, invoice_no, month_year, for_class_id, issued_at)
                VALUES (%s, NULL, %s, %s, %s, 'unpaid',
                    'INV-' || %s::text || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0'),
                    %s, %s, %s) RETURNING id
            """, (s["id"], ct["amount"], due_date, user_id, _proc_year, month_year, ct["class_id"], get_processing_datetime(db)))
            inv_id = cur.fetchone()["id"]
            cur.execute("""
                INSERT INTO notifications (user_id, title, message, type, link)
                SELECT u.id, 'Fee Invoice Generated',
                    'Your Tuition Fee invoice for ' || %s || ' is ready. Amount: Rs. ' || %s::TEXT,
                    'info', '/my-fees'
                FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = %s
            """, (target_month.strftime("%B %Y"), ct["amount"], s["id"]))
            total_generated += 1
    db.commit()
    return total_generated


def _run_smart_monthly_generation(cur, db, user_id, yr, mo, due_day=10):
    month_yr = f"{yr}-{mo:02d}"
    cur.execute("SELECT value FROM system_settings WHERE key = 'fee_grace_days'")
    grace_row = cur.fetchone()
    grace_days = int(grace_row["value"]) if grace_row and grace_row["value"].isdigit() else 3
    cur.execute("""
        SELECT DISTINCT s.id AS student_id, s.class_id, ay.id AS academic_year_id
        FROM students s JOIN academic_years ay ON ay.is_active = TRUE
        WHERE s.status = 'active' AND s.class_id IS NOT NULL
    """)
    students = cur.fetchall()
    cur.execute("""
        SELECT fc.id, fc.name, fc.amount, fc.apply_month, fc.apply_year, fc.target_type,
               ctd.recurrence, ctd.interval_months
        FROM fee_charges fc JOIN charge_type_definitions ctd ON ctd.id = fc.charge_type_id
        WHERE fc.is_active = TRUE
    """)
    all_charges = cur.fetchall()
    charges = []
    for c in all_charges:
        if c["recurrence"] == "interval" and c["interval_months"] == 1:
            charges.append(c)
        elif c["recurrence"] == "fixed" and c["apply_month"] == mo and c["apply_year"] == yr:
            charges.append(c)
    charge_ids = [c["id"] for c in charges]
    class_targets, student_targets = {}, {}
    if charge_ids:
        cur.execute("SELECT charge_id, class_id FROM fee_charge_classes WHERE charge_id = ANY(%s::integer[])", (charge_ids,))
        for r in cur.fetchall():
            class_targets.setdefault(r["charge_id"], set()).add(r["class_id"])
        cur.execute("SELECT charge_id, student_id FROM fee_charge_students WHERE charge_id = ANY(%s::integer[])", (charge_ids,))
        for r in cur.fetchall():
            student_targets.setdefault(r["charge_id"], set()).add(r["student_id"])
    cur.execute("SELECT on_all FROM discount_apply_config LIMIT 1")
    dc = cur.fetchone()
    discount_on_all = dc["on_all"] if dc else False
    cur.execute("SELECT fee_type_id FROM discount_apply_fee_types")
    discount_fee_type_ids = [r["fee_type_id"] for r in cur.fetchall()]
    generated, skipped = 0, 0
    for st in students:
        cur.execute("SELECT id FROM fee_invoices WHERE student_id=%s AND month_year=%s", (st["student_id"], month_yr))
        if cur.fetchone():
            skipped += 1; continue
        cur.execute("""
            SELECT cf.amount, ft.id AS fee_type_id, ft.name AS fee_type_name
            FROM class_fees cf JOIN fee_types ft ON ft.id = cf.fee_type_id
            WHERE cf.class_id = %s AND cf.academic_year_id = %s AND cf.is_active = TRUE
        """, (st["class_id"], st["academic_year_id"]))
        class_fee_rows = cur.fetchall()
        cur.execute("""
            SELECT late_fee_type, late_fee_amount FROM class_fee_config
            WHERE class_id = %s AND academic_year_id = %s AND is_active = TRUE LIMIT 1
        """, (st["class_id"], st["academic_year_id"]))
        late_cfg = cur.fetchone()
        late_fee_type = late_cfg["late_fee_type"] if late_cfg else "none"
        late_fee_amount = float(late_cfg["late_fee_amount"]) if late_cfg else 0
        if not class_fee_rows:
            skipped += 1; continue
        fees_total = sum(float(r["amount"]) for r in class_fee_rows)
        applicable_charges = []
        for c in charges:
            if c["target_type"] == "whole_school": applicable_charges.append(c)
            elif c["target_type"] == "classes" and st["class_id"] in class_targets.get(c["id"], set()): applicable_charges.append(c)
            elif c["target_type"] == "students" and st["student_id"] in student_targets.get(c["id"], set()): applicable_charges.append(c)
        charges_total = sum(float(c["amount"]) for c in applicable_charges)
        base_amount = fees_total + charges_total
        if discount_on_all:
            discountable = fees_total
        elif discount_fee_type_ids:
            discountable = sum(float(r["amount"]) for r in class_fee_rows if r["fee_type_id"] in discount_fee_type_ids)
        else:
            discountable = 0
        candidate_discounts = []
        cur.execute("""
            SELECT sd.id AS sd_id, dt.name AS discount_name, dt.type AS discount_type,
                   COALESCE(sd.override_value, dt.value) AS discount_value
            FROM student_discounts sd JOIN discount_types dt ON dt.id = sd.discount_type_id
            WHERE sd.student_id = %s AND sd.is_active = TRUE
              AND (sd.valid_from IS NULL OR sd.valid_from <= %s)
              AND (sd.valid_until IS NULL OR sd.valid_until >= %s)
        """, (st["student_id"], get_processing_date(db), get_processing_date(db)))
        for d in cur.fetchall():
            dv = float(d["discount_value"])
            amt = round(discountable * dv / 100, 2) if d["discount_type"] == "percentage" else min(dv, discountable)
            candidate_discounts.append({"label": d["discount_name"], "amount": amt, "sd_id": d["sd_id"]})
        cur.execute("SELECT sp_get_sibling_rank(%s::integer) AS rank", (st["student_id"],))
        sib_rank = cur.fetchone()["rank"]
        if sib_rank > 1 and discountable > 0:
            cur.execute("SELECT percentage FROM sibling_discount_tiers WHERE child_no = %s::integer AND is_active = TRUE", (sib_rank,))
            tier = cur.fetchone()
            if tier:
                sib_pct = float(tier["percentage"])
                sib_amt = round(discountable * sib_pct / 100, 2)
                candidate_discounts.append({"label": f"Sibling Discount ({sib_pct:.0f}%)", "amount": sib_amt, "sd_id": None})
        winning = max(candidate_discounts, key=lambda x: x["amount"]) if candidate_discounts else None
        discount_total = min(winning["amount"] if winning else 0, discountable)
        due_date_val = date(yr, mo, due_day)
        late_fee_rollover_total = 0
        late_fee_rollover_sources = []
        cur.execute("""
            SELECT id, invoice_no, due_date, late_fee_amount, late_fee_billed_through
            FROM fee_invoices WHERE student_id = %s AND late_fee_type = 'per_day'
              AND status IN ('unpaid','partial','overdue')
        """, (st["student_id"],))
        for old_inv in cur.fetchall():
            bill_from = old_inv["late_fee_billed_through"] or (old_inv["due_date"] + timedelta(days=grace_days))
            bill_to = date(yr, mo, 1)
            days_to_bill = (bill_to - bill_from).days
            if days_to_bill > 0:
                rollover_amount = round(float(old_inv["late_fee_amount"]) * days_to_bill, 2)
                if rollover_amount > 0:
                    late_fee_rollover_total += rollover_amount
                    late_fee_rollover_sources.append({"label": f"Late Fee - Invoice {old_inv['invoice_no']} ({days_to_bill} days)", "amount": rollover_amount})
                    cur.execute("UPDATE fee_invoices SET late_fee_billed_through=%s WHERE id=%s", (bill_to, old_inv["id"]))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM fee_invoices")
        next_id = cur.fetchone()["next_id"]
        invoice_no = f"INV-{yr}-{str(next_id).zfill(4)}"
        cur.execute("""
            INSERT INTO fee_invoices
                (student_id, amount, discount, fine, due_date, issued_by, month_year,
                 for_class_id, invoice_no, status, late_fee_type, late_fee_amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'unpaid', %s, %s) RETURNING id
        """, (st["student_id"], base_amount, discount_total, late_fee_rollover_total,
              due_date_val, user_id, month_yr, st["class_id"], invoice_no, late_fee_type, late_fee_amount))
        inv_id = cur.fetchone()["id"]
        for src in late_fee_rollover_sources:
            cur.execute("INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount) VALUES (%s, 'late_fee', %s, %s)",
                        (inv_id, src["label"], src["amount"]))
        for fee_row in class_fee_rows:
            cur.execute("INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount) VALUES (%s, 'tuition', %s, %s)",
                        (inv_id, fee_row["fee_type_name"], float(fee_row["amount"])))
        for c in applicable_charges:
            cur.execute("INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount, charge_id) VALUES (%s, 'charge', %s, %s, %s)",
                        (inv_id, c["name"], float(c["amount"]), c["id"]))
        if winning:
            cur.execute("INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount, discount_id) VALUES (%s, 'discount', %s, %s, %s)",
                        (inv_id, winning["label"], winning["amount"], winning.get("sd_id")))
        generated += 1
    db.commit()
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""
            SELECT fi.id, fi.student_id, fi.amount, fi.due_date,
                   s.user_id, s.parent_id, s.first_name, s.last_name
            FROM fee_invoices fi JOIN students s ON s.id = fi.student_id WHERE fi.month_year = %s
        """, (month_yr,))
        with _main.flask_app.app_context():
            for inv in cur.fetchall():
                msg = f"Fee invoice of Rs. {float(inv['amount']):,.0f} generated. Due: {inv['due_date']}."
                if inv["user_id"]: send_notification(inv["user_id"], "Fee Invoice Generated", msg, "info", "/my-fees")
                if inv["parent_id"]: send_notification(inv["parent_id"], "Child Fee Invoice", f"{inv['first_name']} {inv['last_name']}: {msg}", "info", "/my-fees")
    except Exception:
        pass
    return {"generated": generated, "skipped": skipped, "month_yr": month_yr}
