from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
import psycopg2.extras
from datetime import date

bp = Blueprint("finance", __name__)


def get_db_cur():
    from app.db.connection import get_db
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    return db, cur


# ── Fee Categories ────────────────────────────────────────────
@bp.get("/categories")
@jwt_required_custom
@require_permission("finance.view")
def list_categories():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM fee_categories WHERE is_active = TRUE ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/categories")
@jwt_required_custom
@require_permission("finance.manage")
def create_category():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db_cur()
    try:
        cur.execute("""
            INSERT INTO fee_categories (name, description)
            VALUES (%s, %s) RETURNING *
        """, (body["name"], body.get("description")))
        db.commit()
        return success(data=dict(cur.fetchone()), status=201)
    except Exception as e:
        db.rollback()
        return error(str(e), 400)


# ── Fee Structures ────────────────────────────────────────────
@bp.get("/structures")
@jwt_required_custom
@require_permission("finance.view")
def list_structures():
    db, cur = get_db_cur()
    cur.execute("""
        SELECT fs.*, fc.name AS category_name, ay.name AS year_name,
               c.name AS class_name
        FROM fee_structures fs
        LEFT JOIN fee_categories fc ON fc.id = fs.fee_category_id
        LEFT JOIN academic_years ay ON ay.id = fs.academic_year_id
        LEFT JOIN classes        c  ON c.id  = fs.class_id
        WHERE fs.is_active = TRUE
        ORDER BY fs.name
    """)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/structures")
@jwt_required_custom
@require_permission("finance.manage")
def create_structure():
    body    = request.get_json() or {}
    user_id = int(get_jwt_identity())
    if not body.get("name") or not body.get("amount"):
        return error("name and amount are required.", 400)
    db, cur = get_db_cur()
    cur.execute("""
        INSERT INTO fee_structures
            (name, amount, frequency, fee_category_id, academic_year_id,
             class_id, description, is_active, created_by,
             late_fee_type, late_fee_amount, due_day)
        VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s) RETURNING *
    """, (
        body["name"], body["amount"],
        body.get("frequency", "monthly"),
        body.get("fee_category_id")  or None,
        body.get("academic_year_id") or None,
        body.get("class_id")         or None,
        body.get("description")      or None,
        user_id,
        body.get("late_fee_type",   "none"),
        body.get("late_fee_amount", 0),
        body.get("due_day")          or None,
    ))
    db.commit()
    return success(data=dict(cur.fetchone()), status=201)


@bp.put("/structures/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def update_structure(id):
    body = request.get_json() or {}
    db, cur = get_db_cur()
    cur.execute("""
        UPDATE fee_structures
        SET name=%s, amount=%s, frequency=%s, description=%s, is_active=%s,
            late_fee_type=%s, late_fee_amount=%s, due_day=%s
        WHERE id=%s RETURNING *
    """, (
        body.get("name"), body.get("amount"),
        body.get("frequency","monthly"),
        body.get("description") or None,
        body.get("is_active", True),
        body.get("late_fee_type",   "none"),
        body.get("late_fee_amount", 0),
        body.get("due_day")     or None,
        id
    ))
    db.commit()
    row = cur.fetchone()
    return success(data=dict(row)) if row else error("Not found.", 404)


@bp.delete("/structures/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def deactivate_structure(id):
    db, cur = get_db_cur()
    cur.execute("UPDATE fee_structures SET is_active=FALSE WHERE id=%s", (id,))
    db.commit()
    return success(message="Fee structure deactivated.")


# ── Invoices ──────────────────────────────────────────────────
@bp.get("/invoices")
@jwt_required_custom
@require_permission("finance.view")
def list_invoices():
    status         = request.args.get("status")
    student_id     = request.args.get("student_id")
    class_id       = request.args.get("class_id")
    registration_no= request.args.get("registration_no")
    invoice_no     = request.args.get("invoice_no")
    month          = request.args.get("month")
    academic_year_id = request.args.get("academic_year_id")
    db, cur   = get_db_cur()
    conditions, params = ["1=1"], []
    if status:
        conditions.append("fi.status = %s")
        params.append(status)
    if student_id:
        conditions.append("fi.student_id = %s")
        params.append(student_id)
    if class_id:
        conditions.append("fi.for_class_id = %s")
        params.append(class_id)
    if registration_no:
        conditions.append("(s.enrollment_no ILIKE %s OR s.first_name ILIKE %s OR s.last_name ILIKE %s OR (s.first_name || ' ' || s.last_name) ILIKE %s)")
        t = f"%{registration_no}%"
        params += [t, t, t, t]
    if invoice_no:
        conditions.append("fi.invoice_no ILIKE %s")
        params.append(f"%{invoice_no}%")
    if month:
        conditions.append("fi.month_year = %s")
        params.append(month)
    if academic_year_id:
        conditions.append("c.academic_year_id = %s")
        params.append(academic_year_id)
    cur.execute(f"""
        SELECT fi.*, s.first_name || ' ' || s.last_name AS student_name,
               s.enrollment_no, fs.name AS structure_name,
               c.name AS class_name, c.section AS class_section,
               COALESCE((SELECT SUM(amount_paid) FROM payments WHERE invoice_id=fi.id),0) AS paid_amount
        FROM fee_invoices fi
        JOIN students     s  ON s.id  = fi.student_id
        LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id
        LEFT JOIN classes c ON c.id = fi.for_class_id
        WHERE {' AND '.join(conditions)}
        ORDER BY fi.issued_at DESC
        LIMIT 200
    """, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/invoices")
@jwt_required_custom
@require_permission("finance.manage")
def create_invoice():
    body    = request.get_json() or {}
    user_id = int(get_jwt_identity())
    if not body.get("student_id") or not body.get("amount"):
        return error("student_id and amount are required.", 400)
    db, cur = get_db_cur()
    cur.execute("""
        INSERT INTO fee_invoices
            (student_id, fee_structure_id, amount, due_date,
             discount, fine, notes, issued_by, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'unpaid') RETURNING *
    """, (
        body["student_id"],
        body.get("fee_structure_id") or None,
        body["amount"],
        body.get("due_date")         or None,
        body.get("discount", 0),
        body.get("fine", 0),
        body.get("notes")            or None,
        user_id,
    ))
    db.commit()
    return success(data=dict(cur.fetchone()), status=201)


@bp.put("/invoices/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def update_invoice(id):
    body = request.get_json() or {}
    db, cur = get_db_cur()
    cur.execute("""
        UPDATE fee_invoices
        SET discount=%s, fine=%s, notes=%s, status=%s, due_date=%s
        WHERE id=%s RETURNING *
    """, (
        body.get("discount", 0), body.get("fine", 0),
        body.get("notes") or None, body.get("status","unpaid"),
        body.get("due_date") or None, id
    ))
    db.commit()
    row = cur.fetchone()
    return success(data=dict(row)) if row else error("Not found.", 404)


# ── Bulk invoice generation ───────────────────────────────────
@bp.post("/invoices/bulk")
@jwt_required_custom
@require_permission("finance.manage")
def bulk_generate():
    body           = request.get_json() or {}
    structure_id   = body.get("fee_structure_id")
    class_id       = body.get("class_id")
    due_date       = body.get("due_date")
    user_id        = int(get_jwt_identity())
    if not structure_id or not class_id:
        return error("fee_structure_id and class_id are required.", 400)
    db, cur = get_db_cur()
    cur.execute("SELECT amount FROM fee_structures WHERE id=%s", (structure_id,))
    fs = cur.fetchone()
    if not fs:
        return error("Fee structure not found.", 404)
    cur.execute("""
        SELECT id FROM students
        WHERE class_id=%s AND status='active'
    """, (class_id,))
    students = cur.fetchall()
    if not students:
        return error("No active students in this class.", 400)
    count = 0
    for s in students:
        cur.execute("""
            INSERT INTO fee_invoices
                (student_id, fee_structure_id, amount, due_date, issued_by, status)
            VALUES (%s, %s, %s, %s, %s, 'unpaid')
        """, (s["id"], structure_id, fs["amount"], due_date, user_id))
        count += 1
    db.commit()
    return success(message=f"{count} invoices generated successfully.")


# ── Payments ──────────────────────────────────────────────────
@bp.get("/payments")
@jwt_required_custom
@require_permission("finance.view")
def list_payments():
    db, cur = get_db_cur()

    student   = request.args.get("student")
    reference = request.args.get("reference")
    class_id  = request.args.get("class_id")
    month     = request.args.get("month")
    from_date = request.args.get("from_date")
    to_date   = request.args.get("to_date")

    conditions = ["1=1"]
    params = []

    if student:
        conditions.append("(s.first_name ILIKE %s OR s.last_name ILIKE %s OR s.enrollment_no ILIKE %s OR (s.first_name || ' ' || s.last_name) ILIKE %s)")
        t = f"%{student}%"
        params += [t, t, t, t]
    if reference:
        conditions.append("p.reference ILIKE %s")
        params.append(f"%{reference}%")
    if class_id:
        conditions.append("fi.for_class_id = %s")
        params.append(class_id)
    if month:
        conditions.append("fi.month_year = %s")
        params.append(month)
    if from_date:
        conditions.append("p.paid_at::date >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("p.paid_at::date <= %s")
        params.append(to_date)

    query = """
        SELECT p.*, fi.amount, fi.status AS invoice_status, fi.month_year, fi.invoice_no, fi.id AS invoice_id,
               s.first_name || ' ' || s.last_name AS student_name,
               s.enrollment_no, p.receipt_image,
               c.name AS class_name, c.section AS class_section
        FROM payments p
        JOIN fee_invoices fi ON fi.id = p.invoice_id
        JOIN students     s  ON s.id  = fi.student_id
        LEFT JOIN classes c  ON c.id  = fi.for_class_id
        WHERE """ + " AND ".join(conditions) + """
        ORDER BY p.paid_at DESC
        LIMIT 200
    """
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/payments")
@jwt_required_custom
def record_payment():
    body    = request.get_json() or {}
    user_id = int(get_jwt_identity())
    if not body.get("invoice_id") or not body.get("amount_paid"):
        return error("invoice_id and amount_paid are required.", 400)
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM fee_invoices WHERE id=%s", (body["invoice_id"],))
    invoice = cur.fetchone()
    if not invoice:
        return error("Invoice not found.", 404)
    receipt_image = body.get("receipt_image") or None
    if receipt_image and len(receipt_image) > 2000000:
        return error("Receipt image too large. Max 1.5MB.", 400)
    # If no receipt is attached, the finance officer is entering this payment
    # directly and confirming it themselves, so it's auto-verified. If a receipt
    # is attached (e.g. parent-submitted proof), it still needs manual verification.
    auto_verified = receipt_image is None

    cur.execute("""
        INSERT INTO payments (invoice_id, amount_paid, method, reference, received_by, notes, receipt_image, is_verified, verified_by, verified_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CASE WHEN %s THEN NOW() ELSE NULL END) RETURNING *
    """, (
        body["invoice_id"], body["amount_paid"],
        body.get("method", "cash"),
        body.get("reference") or None,
        user_id,
        body.get("notes") or None,
        receipt_image,
        auto_verified,
        user_id if auto_verified else None,
        auto_verified,
    ))
    cur.execute("""
        SELECT COALESCE(SUM(amount_paid),0) AS total_paid
        FROM payments WHERE invoice_id=%s
    """, (body["invoice_id"],))
    total_paid = cur.fetchone()["total_paid"]
    net_amount = float(invoice["net_amount"] or invoice["amount"])

    if receipt_image:
        cur.execute("UPDATE fee_invoices SET status='pending_verification' WHERE id=%s", (body["invoice_id"],))
    elif float(total_paid) >= net_amount:
        cur.execute("UPDATE fee_invoices SET status='paid', paid_at=NOW() WHERE id=%s", (body["invoice_id"],))
    elif float(total_paid) > 0:
        cur.execute("UPDATE fee_invoices SET status='partial' WHERE id=%s", (body["invoice_id"],))
    db.commit()

    # Notify student and parent about payment
    try:
        from app.utils.notify import send_notification
        cur.execute("""
            SELECT s.user_id, s.parent_id, s.first_name, s.last_name
            FROM fee_invoices fi JOIN students s ON s.id=fi.student_id
            WHERE fi.id=%s
        """, (body["invoice_id"],))
        stu = cur.fetchone()
        if stu:
            status_msg = "submitted and awaiting verification" if receipt_image else "recorded"
            msg = f"Payment of Rs. {float(body['amount_paid']):,.0f} has been {status_msg}."
            if stu["user_id"]:
                send_notification(stu["user_id"], "Payment Received", msg, "success", "/my-fees")
            if stu["parent_id"]:
                send_notification(stu["parent_id"], "Payment Received",
                    f"{stu['first_name']} {stu['last_name']}: {msg}", "success", "/my-fees")
    except Exception:
        pass

    return success(message="Payment submitted. Awaiting verification." if receipt_image else "Payment recorded.", status=201)


# ── Dashboard stats ───────────────────────────────────────────
@bp.get("/dashboard")
@jwt_required_custom
@require_permission("finance.view")
def finance_dashboard():
    db, cur = get_db_cur()
    cur.execute("""
        SELECT
            COUNT(*)                                          AS total_invoices,
            COUNT(*) FILTER (WHERE status='paid')            AS paid_invoices,
            COUNT(*) FILTER (WHERE status='unpaid')          AS unpaid_invoices,
            COUNT(*) FILTER (WHERE status='partial')         AS partial_invoices,
            COUNT(*) FILTER (WHERE status='overdue')         AS overdue_invoices,
            COUNT(*) FILTER (WHERE status='pending_verification') AS pending_verification_invoices,
            COALESCE(SUM(net_amount),0)                      AS total_billed,
            COALESCE(SUM(net_amount) FILTER (WHERE status='paid'),0) AS total_collected
        FROM fee_invoices
        WHERE status != 'cancelled'
    """)
    stats = dict(cur.fetchone())
    cur.execute("""
        SELECT COALESCE(SUM(amount_paid),0) AS collected_today
        FROM payments WHERE DATE(paid_at) = CURRENT_DATE
    """)
    stats["collected_today"] = float(cur.fetchone()["collected_today"])
    cur.execute("""
        SELECT COALESCE(SUM(amount_paid),0) AS collected_month
        FROM payments
        WHERE DATE_TRUNC('month',paid_at) = DATE_TRUNC('month',CURRENT_DATE)
    """)
    stats["collected_month"] = float(cur.fetchone()["collected_month"])

    cur.execute("""
        SELECT COUNT(*) AS pending_verification_count,
               COALESCE(SUM(amount_paid),0) AS pending_verification_amount
        FROM payments
        WHERE is_verified = FALSE
    """)
    pv = cur.fetchone()
    stats["pending_verification_count"]  = pv["pending_verification_count"]
    stats["pending_verification_amount"] = float(pv["pending_verification_amount"])

    stats["total_billed"]    = float(stats["total_billed"])
    stats["total_collected"] = float(stats["total_collected"])
    return success(data=stats)


# ── Student fee summary ───────────────────────────────────────
@bp.get("/student/<int:student_id>")
@jwt_required_custom
@require_permission("finance.view")
def student_summary(student_id):
    db, cur = get_db_cur()
    cur.execute("""
        SELECT
            COUNT(*)                                         AS total_invoices,
            COALESCE(SUM(net_amount),0)                     AS total_billed,
            COALESCE(SUM(net_amount) FILTER (WHERE status='paid'),0) AS total_paid,
            COALESCE(SUM(net_amount) FILTER (WHERE status IN ('unpaid','partial','overdue')),0) AS total_due,
            COUNT(*) FILTER (WHERE status='overdue')        AS overdue_count,
            %s AS student_id
        FROM fee_invoices
        WHERE student_id = %s AND status != 'cancelled'
    """, (student_id, student_id))
    row = dict(cur.fetchone())
    row["total_billed"] = float(row["total_billed"])
    row["total_paid"]   = float(row["total_paid"])
    row["total_due"]    = float(row["total_due"])
    return success(data=row)

# ── Invoice PDF Download ──────────────────────────────────────
@bp.get("/invoices/<int:id>/payments")
@jwt_required_custom
@require_permission("finance.view")
def get_invoice_payments(id):
    db, cur = get_db_cur()
    cur.execute("""
        SELECT fi.id, fi.invoice_no, fi.amount, fi.discount, fi.fine, fi.net_amount,
               fi.status, fi.month_year, fi.due_date,
               s.first_name || ' ' || s.last_name AS student_name, s.enrollment_no
        FROM fee_invoices fi
        JOIN students s ON s.id = fi.student_id
        WHERE fi.id = %s
    """, (id,))
    invoice = cur.fetchone()
    if not invoice:
        return error("Invoice not found.", 404)
    cur.execute("""
        SELECT id, amount_paid, method, reference, notes, paid_at, is_verified
        FROM payments
        WHERE invoice_id = %s
        ORDER BY paid_at ASC
    """, (id,))
    payments = [dict(r) for r in cur.fetchall()]
    total_paid = sum(float(p["amount_paid"]) for p in payments)
    invoice = dict(invoice)
    invoice["total_paid"] = total_paid
    invoice["balance"] = float(invoice["net_amount"]) - total_paid

    cur.execute("""
        SELECT id, item_type, label, amount
        FROM fee_invoice_items
        WHERE invoice_id = %s
        ORDER BY
            CASE item_type WHEN 'tuition' THEN 1 WHEN 'charge' THEN 2 WHEN 'discount' THEN 3 WHEN 'late_fee' THEN 4 ELSE 5 END,
            id
    """, (id,))
    items = [dict(r) for r in cur.fetchall()]

    return success(data={"invoice": invoice, "payments": payments, "items": items})


@bp.get("/charges/search")
@jwt_required_custom
@require_permission("finance.view")
def search_charges():
    registration_no = request.args.get("registration_no")
    receipt_no       = request.args.get("receipt_no")
    if not registration_no and not receipt_no:
        return error("Provide a registration number or receipt number.", 400)
    db, cur = get_db_cur()
    cur.execute(
        "SELECT * FROM sp_search_charges(%s::varchar, %s::varchar)",
        (registration_no, receipt_no)
    )
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/charges/<int:item_id>/waive")
@jwt_required_custom
@require_permission("finance.manage")
def waive_charge(item_id):
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    try:
        cur.execute("SELECT * FROM sp_waive_charge(%s::integer, %s::integer)", (item_id, user_id))
        result = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        msg = str(e)
        if "CHARGE_NOT_FOUND" in msg:
            return error("Charge item not found.", 404)
        if "INVOICE_ALREADY_PAID" in msg:
            return error("Cannot waive a charge on an already-paid invoice.", 400)
        if "ALREADY_WAIVED" in msg:
            return error("This charge has already been waived.", 400)
        return error("Failed to waive charge.", 500)

    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT user_id, parent_id, first_name, last_name FROM students WHERE id = %s", (result["student_id"],))
        stu = cur.fetchone()
        if stu:
            msg = "The charge \"" + result["waived_label"] + "\" (Rs. " + format(float(result["waived_amount"]), ",.0f") + ") has been waived. Your updated invoice is " + result["new_invoice_no"] + ", amount Rs. " + format(float(result["new_amount"]), ",.0f") + "."
            if stu["user_id"]:
                send_notification(stu["user_id"], "Charge Waived - Invoice Updated", msg, "info", "/my-fees")
            if stu["parent_id"]:
                send_notification(stu["parent_id"], stu["first_name"] + " " + stu["last_name"] + ": Charge Waived", msg, "info", "/my-fees")
    except Exception:
        pass

    return success(message="Charge waived. New invoice " + result["new_invoice_no"] + " generated.",
                   data={"new_invoice_id": result["new_invoice_id"], "new_invoice_no": result["new_invoice_no"]})


@bp.get("/invoices/<int:id>/pdf")
@jwt_required_custom
@require_permission("finance.view")
def download_invoice_pdf(id):
    from flask import Response
    from app.utils.invoice_pdf import generate_invoice_pdf
    try:
        pdf_bytes = generate_invoice_pdf(id)
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=invoice_{id}.pdf"}
        )
    except Exception as e:
        return error(str(e), 500)


# ── Monthly Auto Invoice Generation ──────────────────────────
def _run_monthly_invoice_generation(cur, db, user_id, target_month):
    cur.execute("SELECT value FROM system_settings WHERE key = 'fee_due_day'")
    row     = cur.fetchone()
    due_day = int(row["value"]) if row else 10
    import calendar
    last_day = calendar.monthrange(target_month.year, target_month.month)[1]
    safe_due_day = min(due_day, last_day)
    due_date  = target_month.replace(day=safe_due_day)
    month_year = target_month.strftime("%Y-%m")

    cur.execute("""
        SELECT cf.class_id, cf.amount, c.name AS class_name, c.section,
               cf.academic_year_id
        FROM class_fees cf
        JOIN classes c ON c.id = cf.class_id
        JOIN fee_types ft ON ft.id = cf.fee_type_id
        WHERE cf.is_active = TRUE AND ft.name = 'Tuition Fee'
    """)
    class_tuitions = cur.fetchall()

    total_generated = 0
    for ct in class_tuitions:
        cur.execute("SELECT id FROM students WHERE class_id = %s AND status = 'active'", (ct["class_id"],))
        students = cur.fetchall()

        for s in students:
            cur.execute("""
                SELECT id FROM fee_invoices
                WHERE student_id = %s AND month_year = %s
            """, (s["id"], month_year))
            if cur.fetchone():
                continue

            cur.execute("""
                INSERT INTO fee_invoices
                    (student_id, fee_structure_id, amount, due_date, issued_by,
                     status, invoice_no, month_year, for_class_id)
                VALUES (%s, NULL, %s, %s, %s, 'unpaid',
                    'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                    LPAD(nextval('invoice_seq')::TEXT, 4, '0'), %s, %s)
                RETURNING id
            """, (s["id"], ct["amount"], due_date, user_id, month_year, ct["class_id"]))
            inv_id = cur.fetchone()["id"]
            total_generated += 1

            cur.execute("""
                INSERT INTO notifications (user_id, title, message, type, link)
                SELECT u.id,
                    'Fee Invoice Generated',
                    'Your Tuition Fee invoice for ' || %s ||
                    ' is ready. Amount: Rs. ' || %s::TEXT,
                    'info',
                    '/my-fees'
                FROM students st
                JOIN users u ON u.id = st.user_id
                WHERE st.id = %s
            """, (target_month.strftime("%B %Y"), ct["amount"], s["id"]))

    db.commit()
    return total_generated


@bp.post("/invoices/generate-monthly")
@jwt_required_custom
@require_permission("finance.manage")
def generate_monthly_invoices():
    from flask_jwt_extended import get_jwt_identity
    from app.db.connection import get_db
    import psycopg2.extras
    from datetime import date
    from flask import request as _request

    user_id = int(get_jwt_identity())
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    body = _request.get_json(silent=True) or {}
    target_str = body.get("month")
    if target_str:
        y, m = target_str.split("-")
        target_month = date(int(y), int(m), 1)
    else:
        today = date.today()
        target_month = date(today.year, today.month, 1)

    print("[DEBUG generate_monthly_invoices] body=", body, "target_month=", target_month)
    total_generated = _run_monthly_invoice_generation(cur, db, user_id, target_month)
    print("[DEBUG generate_monthly_invoices] total_generated=", total_generated)
    return success(message=f"{total_generated} invoices generated for {target_month.strftime('%B %Y')}.")


@bp.get("/auto-generate-settings")
@jwt_required_custom
@require_permission("finance.view")
def get_auto_generate_settings():
    from app.db.connection import get_db
    import psycopg2.extras
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT key, value FROM system_settings WHERE key IN (%s, %s, %s, %s)", ("fee_auto_generate_enabled", "fee_auto_generate_day", "fee_auto_generate_last_run", "fee_auto_generate_time"))
    rows = {r["key"]: r["value"] for r in cur.fetchall()}
    return success(data={
        "enabled": rows.get("fee_auto_generate_enabled") == "true",
        "day": int(rows.get("fee_auto_generate_day") or 1),
        "time": rows.get("fee_auto_generate_time") or "01:00",
        "last_run": rows.get("fee_auto_generate_last_run") or None,
    })


@bp.post("/auto-generate-settings/run-now")
@jwt_required_custom
@require_permission("finance.manage")
def run_auto_generate_now():
    from flask import current_app
    from app.utils.fee_automation import run_fee_auto_generation
    try:
        result = run_fee_auto_generation(current_app._get_current_object(), force=True)
    except Exception as e:
        return error("Test run failed: " + str(e), 500)
    if result.get("ran"):
        return success(
            message=str(result.get("total_generated")) + " invoices generated for " + result.get("month") + " (test run).",
            data=result,
        )
    return success(message="No invoices generated: " + result.get("reason", ""), data=result)


@bp.put("/auto-generate-settings")
@jwt_required_custom
@require_permission("finance.manage")
def update_auto_generate_settings():
    from app.db.connection import get_db
    from flask import request as _request
    body = _request.get_json(silent=True) or {}
    enabled = bool(body.get("enabled"))
    day = int(body.get("day") or 1)
    if day < 1 or day > 31:
        return error("Day must be between 1 and 31.", 400)

    time_str = (body.get("time") or "01:00").strip()
    parts = time_str.split(":")
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return error("Time must be in HH:MM format.", 400)
    hh, mm = int(parts[0]), int(parts[1])
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        return error("Time must be a valid 24-hour HH:MM value.", 400)
    time_str = "%02d:%02d" % (hh, mm)

    db = get_db()
    cur = db.cursor()
    cur.execute("UPDATE system_settings SET value = %s, updated_at = NOW() WHERE key = %s", ("true" if enabled else "false", "fee_auto_generate_enabled"))
    cur.execute("UPDATE system_settings SET value = %s, updated_at = NOW() WHERE key = %s", (str(day), "fee_auto_generate_day"))
    cur.execute("UPDATE system_settings SET value = %s, updated_at = NOW() WHERE key = %s", (time_str, "fee_auto_generate_time"))
    db.commit()
    return success(message="Auto-generation settings updated.")

# ── Verify Payment ────────────────────────────────────────────
@bp.put("/payments/<int:id>/verify")
@jwt_required_custom
@require_permission("finance.collect")
def verify_payment(id):
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM payments WHERE id=%s", (id,))
    payment = cur.fetchone()
    if not payment:
        return error("Payment not found.", 404)
    cur.execute("UPDATE payments SET is_verified=TRUE, verified_by=%s, verified_at=NOW() WHERE id=%s",
                (user_id, id))
    cur.execute("""
        SELECT COALESCE(SUM(amount_paid),0) AS total_paid
        FROM payments WHERE invoice_id=%s
    """, (payment["invoice_id"],))
    total_paid = float(cur.fetchone()["total_paid"])
    cur.execute("SELECT net_amount, amount FROM fee_invoices WHERE id=%s", (payment["invoice_id"],))
    inv = cur.fetchone()
    net_amount = float(inv["net_amount"] or inv["amount"])
    if total_paid >= net_amount:
        cur.execute("UPDATE fee_invoices SET status='paid', paid_at=NOW() WHERE id=%s", (payment["invoice_id"],))
        cur.execute("""
            SELECT s.user_id FROM fee_invoices fi JOIN students s ON s.id = fi.student_id
            WHERE fi.id = %s
        """, (payment["invoice_id"],))
        paid_stu = cur.fetchone()
        if paid_stu and paid_stu["user_id"]:
            cur.execute("""
                UPDATE users SET is_active=TRUE, lock_reason=NULL
                WHERE id=%s AND lock_reason='fee_overdue'
            """, (paid_stu["user_id"],))
    else:
        cur.execute("UPDATE fee_invoices SET status='partial' WHERE id=%s", (payment["invoice_id"],))
    db.commit()

    # Notify student and parent about verified payment
    try:
        from app.utils.notify import send_notification
        cur.execute("""
            SELECT s.user_id, s.parent_id, s.first_name, s.last_name, p.amount_paid
            FROM payments p
            JOIN fee_invoices fi ON fi.id=p.invoice_id
            JOIN students s ON s.id=fi.student_id
            WHERE p.id=%s
        """, (id,))
        stu = cur.fetchone()
        if stu:
            msg = f"Your payment of Rs. {float(stu['amount_paid']):,.0f} has been verified."
            if stu["user_id"]:
                send_notification(stu["user_id"], "Payment Verified", msg, "success", "/my-fees")
            if stu["parent_id"]:
                send_notification(stu["parent_id"], "Payment Verified",
                    f"{stu['first_name']} {stu['last_name']}: {msg}", "success", "/my-fees")
    except Exception:
        pass

    return success(message="Payment verified successfully.")

@bp.get("/payments/<int:id>/receipt")
@jwt_required_custom
@require_permission("finance.view")
def download_payment_receipt(id):
    from flask import Response
    from app.utils.invoice_pdf import generate_payment_receipt_pdf
    db, cur = get_db_cur()
    cur.execute("SELECT is_verified FROM payments WHERE id=%s", (id,))
    pay = cur.fetchone()
    if not pay:
        return error("Payment not found.", 404)
    if not pay["is_verified"]:
        return error("Receipt only available after finance officer verification.", 400)
    try:
        pdf_bytes = generate_payment_receipt_pdf(id)
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=receipt_{id}.pdf"}
        )
    except Exception as e:
        return error(str(e), 500)

# ── Class Fee Configuration ───────────────────────────────────
@bp.get("/class-fee-config")
@jwt_required_custom
@require_permission("finance.view")
def get_class_fee_configs():
    db, cur = get_db_cur()
    cur.execute("""
        SELECT cfc.*, c.name AS class_name, ay.name AS year_name
        FROM class_fee_config cfc
        JOIN classes c ON c.id = cfc.class_id
        JOIN academic_years ay ON ay.id = cfc.academic_year_id
        ORDER BY c.name
    """)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/class-fee-config")
@jwt_required_custom
@require_permission("finance.manage")
def create_class_fee_config():
    body = request.get_json() or {}
    if not body.get("class_id") or not body.get("academic_year_id"):
        return error("class_id and academic_year_id are required.", 400)
    if body.get("late_fee_type", "none") not in ("none", "fixed", "percentage", "per_day"):
        return error("Invalid late_fee_type.", 400)
    db, cur = get_db_cur()
    cur.execute("""
        INSERT INTO class_fee_config (class_id, academic_year_id, tuition_fee, due_day, late_fee_type, late_fee_amount)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (class_id, academic_year_id) DO UPDATE
        SET tuition_fee=EXCLUDED.tuition_fee, due_day=EXCLUDED.due_day,
            late_fee_type=EXCLUDED.late_fee_type, late_fee_amount=EXCLUDED.late_fee_amount
        RETURNING *
    """, (body["class_id"], body["academic_year_id"], body.get("tuition_fee", 0),
          body.get("due_day", 10), body.get("late_fee_type","none"), body.get("late_fee_amount", 0)))
    db.commit()
    return success(data=dict(cur.fetchone()), message="Class fee config saved.", status=201)


@bp.delete("/class-fee-config/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def delete_class_fee_config(id):
    db, cur = get_db_cur()
    cur.execute("DELETE FROM class_fee_config WHERE id=%s", (id,))
    db.commit()
    return success(message="Deleted.")


# ── Fee Charges ───────────────────────────────────────────────
@bp.get("/charges")
@jwt_required_custom
@require_permission("finance.view")
def get_fee_charges():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM sp_get_fee_charges()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/charge-types")
@jwt_required_custom
@require_permission("finance.view")
def get_charge_types():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM sp_get_charge_types()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/charge-types")
@jwt_required_custom
@require_permission("finance.manage")
def create_charge_type():
    body = request.get_json() or {}
    if not body.get("name") or not body.get("recurrence"):
        return error("name and recurrence are required.", 400)
    interval_months = body.get("interval_months")
    interval_months = int(interval_months) if interval_months not in (None, "") else None
    db, cur = get_db_cur()
    try:
        cur.execute(
            "SELECT * FROM sp_create_charge_type(%s::varchar, %s::varchar, %s::smallint)",
            (body["name"], body["recurrence"], interval_months),
        )
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        return error(str(e).split("\n")[0], 400)
    return success(data=dict(row), message="Charge type created.", status=201)


@bp.put("/charge-types/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def update_charge_type(id):
    body = request.get_json() or {}
    if not body.get("name") or not body.get("recurrence"):
        return error("name and recurrence are required.", 400)
    interval_months = body.get("interval_months")
    interval_months = int(interval_months) if interval_months not in (None, "") else None
    db, cur = get_db_cur()
    try:
        cur.execute(
            "SELECT * FROM sp_update_charge_type(%s::integer, %s::varchar, %s::varchar, %s::smallint)",
            (id, body["name"], body["recurrence"], interval_months),
        )
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        return error(str(e).split("\n")[0], 400)
    return success(data=dict(row), message="Charge type updated.")


@bp.put("/charge-types/<int:id>/toggle")
@jwt_required_custom
@require_permission("finance.manage")
def toggle_charge_type(id):
    db, cur = get_db_cur()
    try:
        cur.execute("SELECT * FROM sp_toggle_charge_type(%s)", (id,))
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        return error(str(e).split("\n")[0], 400)
    return success(data=dict(row), message="Charge type status updated.")


@bp.post("/charges")
@jwt_required_custom
@require_permission("finance.manage")
def create_fee_charge():
    body = request.get_json() or {}
    if not body.get("name") or body.get("amount") is None or not body.get("charge_type_id"):
        return error("name, amount, and charge_type_id are required.", 400)
    target_type = body.get("target_type", "whole_school")
    db, cur = get_db_cur()
    apply_month = body.get("apply_month") or None
    apply_year  = body.get("apply_year")  or None
    acad_yr     = body.get("academic_year_id") or None
    class_ids   = body.get("class_ids") or []
    class_ids   = [int(c) for c in class_ids]
    student_ids = body.get("student_ids") or []
    student_ids = [int(s) for s in student_ids]
    if apply_month: apply_month = int(apply_month)
    if apply_year:  apply_year  = int(apply_year)
    if acad_yr:     acad_yr     = int(acad_yr)
    try:
        cur.execute(
            "SELECT sp_create_fee_charge(%s::varchar, %s::numeric, %s::integer, %s::smallint, %s::integer, %s::varchar, %s::integer[], %s::integer[], %s::integer, %s::text) AS new_id",
            (body["name"], body["amount"], int(body["charge_type_id"]),
             apply_month, apply_year, target_type, class_ids, student_ids, acad_yr,
             body.get("description") or None),
        )
        new_id = cur.fetchone()["new_id"]
        cur.execute("SELECT * FROM sp_get_fee_charges() WHERE id = %s", (new_id,))
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        return error(str(e).split("\n")[0], 400)
    return success(data=dict(row), message="Charge created.", status=201)


@bp.put("/charges/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def update_fee_charge(id):
    body = request.get_json() or {}
    db, cur = get_db_cur()
    apply_month = body.get("apply_month") or None
    apply_year  = body.get("apply_year")  or None
    acad_yr     = body.get("academic_year_id") or None
    charge_type_id = body.get("charge_type_id")
    target_type = body.get("target_type", "whole_school")
    class_ids   = body.get("class_ids") or []
    class_ids   = [int(c) for c in class_ids]
    student_ids = body.get("student_ids") or []
    student_ids = [int(s) for s in student_ids]
    if apply_month: apply_month = int(apply_month)
    if apply_year:  apply_year  = int(apply_year)
    if acad_yr:     acad_yr     = int(acad_yr)
    try:
        cur.execute(
            "SELECT sp_update_fee_charge(%s::integer, %s::varchar, %s::numeric, %s::integer, %s::smallint, %s::integer, %s::varchar, %s::integer[], %s::integer[], %s::integer, %s::text, %s::boolean) AS updated_id",
            (id, body.get("name"), body.get("amount"), int(charge_type_id) if charge_type_id else None,
             apply_month, apply_year, target_type, class_ids, student_ids, acad_yr,
             body.get("description") or None, body.get("is_active", True)),
        )
        updated_id = cur.fetchone()["updated_id"]
        cur.execute("SELECT * FROM sp_get_fee_charges() WHERE id = %s", (updated_id,))
        row = cur.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        return error(str(e).split("\n")[0], 400)
    return success(data=dict(row), message="Charge updated.")


@bp.delete("/charges/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def delete_fee_charge(id):
    db, cur = get_db_cur()
    try:
        cur.execute("SELECT sp_delete_fee_charge(%s::integer)", (id,))
        db.commit()
    except Exception as e:
        db.rollback()
        return error(str(e).split("\n")[0], 400)
    return success(message="Deleted.")


# ── Smart Monthly Invoice Generation ──────────────────────────
def _run_smart_monthly_generation(cur, db, user_id, yr, mo, due_day=10):
    """Core smart invoice generation, shared by the manual endpoint
    (generate_smart_monthly route) and the scheduled/auto job (fee_automation.py)."""
    month_yr = f"{yr}-{mo:02d}"

    # Grace period, needed for per-day late fee rollover billing
    cur.execute("SELECT value FROM system_settings WHERE key = 'fee_grace_days'")
    grace_row = cur.fetchone()
    grace_days = int(grace_row["value"]) if grace_row and grace_row["value"].isdigit() else 3

    # Get all active students with a class
    cur.execute("""
        SELECT DISTINCT s.id AS student_id, s.class_id, ay.id AS academic_year_id
        FROM students s
        JOIN academic_years ay ON ay.is_active = TRUE
        WHERE s.status = 'active' AND s.class_id IS NOT NULL
    """)
    students = cur.fetchall()

    # Get extra charges applicable for this month (current schema: charge_type_definitions + target_type)
    cur.execute("""
        SELECT fc.id, fc.name, fc.amount, fc.apply_month, fc.apply_year, fc.target_type,
               ctd.recurrence, ctd.interval_months
        FROM fee_charges fc
        JOIN charge_type_definitions ctd ON ctd.id = fc.charge_type_id
        WHERE fc.is_active = TRUE
    """)
    all_charges = cur.fetchall()

    charges = []
    for c in all_charges:
        if c["recurrence"] == "interval" and c["interval_months"] == 1:
            charges.append(c)
        elif c["recurrence"] == "fixed" and c["apply_month"] == mo and c["apply_year"] == yr:
            charges.append(c)
        # recurrence == 'interval' with interval_months > 1: not yet implemented, skipped

    charge_ids = [c["id"] for c in charges]
    class_targets, student_targets = {}, {}
    if charge_ids:
        cur.execute("SELECT charge_id, class_id FROM fee_charge_classes WHERE charge_id = ANY(%s::integer[])", (charge_ids,))
        for r in cur.fetchall():
            class_targets.setdefault(r["charge_id"], set()).add(r["class_id"])
        cur.execute("SELECT charge_id, student_id FROM fee_charge_students WHERE charge_id = ANY(%s::integer[])", (charge_ids,))
        for r in cur.fetchall():
            student_targets.setdefault(r["charge_id"], set()).add(r["student_id"])

    # Get discount config
    cur.execute("SELECT on_all FROM discount_apply_config LIMIT 1")
    dc = cur.fetchone()
    discount_on_all = dc["on_all"] if dc else False
    cur.execute("SELECT fee_type_id FROM discount_apply_fee_types")
    discount_fee_type_ids = [r["fee_type_id"] for r in cur.fetchall()]

    generated, skipped = 0, 0

    for st in students:
        # Check if already generated for this month
        cur.execute(
            "SELECT id FROM fee_invoices WHERE student_id=%s AND month_year=%s",
            (st["student_id"], month_yr)
        )
        if cur.fetchone():
            skipped += 1
            continue

        # Get class fees for this student's class
        cur.execute("""
            SELECT cf.amount, ft.id AS fee_type_id, ft.name AS fee_type_name
            FROM class_fees cf
            JOIN fee_types ft ON ft.id = cf.fee_type_id
            WHERE cf.class_id = %s AND cf.academic_year_id = %s AND cf.is_active = TRUE
        """, (st["class_id"], st["academic_year_id"]))
        class_fee_rows = cur.fetchall()

        # Get late fee config for this class
        cur.execute("""
            SELECT late_fee_type, late_fee_amount FROM class_fee_config
            WHERE class_id = %s AND academic_year_id = %s AND is_active = TRUE LIMIT 1
        """, (st["class_id"], st["academic_year_id"]))
        late_cfg = cur.fetchone()
        late_fee_type   = late_cfg["late_fee_type"]   if late_cfg else "none"
        late_fee_amount = float(late_cfg["late_fee_amount"]) if late_cfg else 0

        if not class_fee_rows:
            skipped += 1
            continue

        fees_total = sum(float(r["amount"]) for r in class_fee_rows)

        # Applicable charges for this student, based on target_type (NO discount on charges)
        applicable_charges = []
        for c in charges:
            if c["target_type"] == "whole_school":
                applicable_charges.append(c)
            elif c["target_type"] == "classes" and st["class_id"] in class_targets.get(c["id"], set()):
                applicable_charges.append(c)
            elif c["target_type"] == "students" and st["student_id"] in student_targets.get(c["id"], set()):
                applicable_charges.append(c)
        charges_total = sum(float(c["amount"]) for c in applicable_charges)

        base_amount = fees_total + charges_total

        # ── Discount: calculate discountable base ─────────────────
        if discount_on_all:
            discountable = fees_total
        elif discount_fee_type_ids:
            discountable = sum(
                float(r["amount"]) for r in class_fee_rows
                if r["fee_type_id"] in discount_fee_type_ids
            )
        else:
            discountable = 0

        # Candidate discounts
        candidate_discounts = []

        # Manual student discounts
        cur.execute("""
            SELECT sd.id AS sd_id, dt.name AS discount_name, dt.type AS discount_type,
                   COALESCE(sd.override_value, dt.value) AS discount_value
            FROM student_discounts sd
            JOIN discount_types dt ON dt.id = sd.discount_type_id
            WHERE sd.student_id = %s AND sd.is_active = TRUE
              AND (sd.valid_from  IS NULL OR sd.valid_from  <= CURRENT_DATE)
              AND (sd.valid_until IS NULL OR sd.valid_until >= CURRENT_DATE)
        """, (st["student_id"],))
        for d in cur.fetchall():
            dv  = float(d["discount_value"])
            amt = round(discountable * dv / 100, 2) if d["discount_type"] == "percentage" else min(dv, discountable)
            candidate_discounts.append({"label": d["discount_name"], "amount": amt, "sd_id": d["sd_id"]})

        # Sibling discount (rank-based, respects configured ranking method)
        cur.execute("SELECT sp_get_sibling_rank(%s::integer) AS rank", (st["student_id"],))
        sib_rank = cur.fetchone()["rank"]
        if sib_rank > 1 and discountable > 0:
            cur.execute("SELECT percentage FROM sibling_discount_tiers WHERE child_no = %s::integer AND is_active = TRUE",
                        (sib_rank,))
            tier = cur.fetchone()
            if tier:
                sib_pct = float(tier["percentage"])
                sib_amt = round(discountable * sib_pct / 100, 2)
                candidate_discounts.append({"label": f"Sibling Discount ({sib_pct:.0f}%)", "amount": sib_amt, "sd_id": None})

        winning = max(candidate_discounts, key=lambda x: x["amount"]) if candidate_discounts else None
        discount_total = winning["amount"] if winning else 0
        discount_total = min(discount_total, discountable)
        due_date = date(yr, mo, due_day)

        # ── Per-day late fee rollover from previous unpaid invoices ──
        from datetime import timedelta
        late_fee_rollover_total   = 0
        late_fee_rollover_sources = []
        cur.execute("""
            SELECT id, invoice_no, due_date, late_fee_amount, late_fee_billed_through
            FROM fee_invoices
            WHERE student_id = %s AND late_fee_type = 'per_day'
              AND status IN ('unpaid', 'partial', 'overdue')
        """, (st["student_id"],))
        for old_inv in cur.fetchall():
            bill_from = old_inv["late_fee_billed_through"] or (old_inv["due_date"] + timedelta(days=grace_days))
            bill_to   = date(yr, mo, 1)
            days_to_bill = (bill_to - bill_from).days
            if days_to_bill > 0:
                rollover_amount = round(float(old_inv["late_fee_amount"]) * days_to_bill, 2)
                if rollover_amount > 0:
                    late_fee_rollover_total += rollover_amount
                    late_fee_rollover_sources.append({
                        "label": f"Late Fee - Invoice {old_inv['invoice_no']} ({days_to_bill} days)",
                        "amount": rollover_amount,
                    })
                    cur.execute("UPDATE fee_invoices SET late_fee_billed_through=%s WHERE id=%s", (bill_to, old_inv["id"]))

        # Generate invoice_no
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM fee_invoices")
        next_id = cur.fetchone()["next_id"]
        invoice_no = f"INV-{yr}-{str(next_id).zfill(4)}"

        cur.execute("""
            INSERT INTO fee_invoices
                (student_id, amount, discount, fine, due_date, issued_by, month_year,
                 for_class_id, invoice_no, status, late_fee_type, late_fee_amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'unpaid', %s, %s)
            RETURNING id
        """, (st["student_id"], base_amount, discount_total, late_fee_rollover_total,
              due_date, user_id, month_yr, st["class_id"], invoice_no,
              late_fee_type, late_fee_amount))
        inv_id = cur.fetchone()["id"]

        for src in late_fee_rollover_sources:
            cur.execute("""
                INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount)
                VALUES (%s, 'late_fee', %s, %s)
            """, (inv_id, src["label"], src["amount"]))

        # Insert line items - all class fees
        for fee_row in class_fee_rows:
            cur.execute("""
                INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount)
                VALUES (%s, 'tuition', %s, %s)
            """, (inv_id, fee_row["fee_type_name"], float(fee_row["amount"])))

        for c in applicable_charges:
            cur.execute("""
                INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount, charge_id)
                VALUES (%s, 'charge', %s, %s, %s)
            """, (inv_id, c["name"], float(c["amount"]), c["id"]))

        if winning:
            cur.execute("""
                INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount, discount_id)
                VALUES (%s, 'discount', %s, %s, %s)
            """, (inv_id, winning["label"], winning["amount"], winning.get("sd_id")))

        generated += 1

    db.commit()

    # Notify students and parents about new invoices
    try:
        from app.utils.notify import send_notification
        cur.execute("""
            SELECT fi.id, fi.student_id, fi.amount, fi.due_date,
                   s.user_id, s.parent_id, s.first_name, s.last_name
            FROM fee_invoices fi
            JOIN students s ON s.id = fi.student_id
            WHERE fi.month_year = %s
        """, (month_yr,))
        for inv in cur.fetchall():
            msg = f"Fee invoice of Rs. {float(inv['amount']):,.0f} generated. Due: {inv['due_date']}."
            if inv["user_id"]:
                send_notification(inv["user_id"], "Fee Invoice Generated", msg, "info", "/my-fees")
            if inv["parent_id"]:
                send_notification(inv["parent_id"], "Child Fee Invoice", f"{inv['first_name']} {inv['last_name']}: {msg}", "info", "/my-fees")
    except Exception:
        pass

    return {"generated": generated, "skipped": skipped, "month_yr": month_yr}


@bp.post("/invoices/generate-smart-monthly")
@jwt_required_custom
@require_permission("finance.bulk")
def generate_smart_monthly():
    from flask_jwt_extended import get_jwt_identity
    from datetime import date
    import calendar
    user_id  = int(get_jwt_identity())
    body     = request.get_json() or {}
    yr       = int(body.get("year",  date.today().year))
    mo       = int(body.get("month", date.today().month))
    db, cur  = get_db_cur()
    if body.get("due_day"):
        due_day = int(body["due_day"])
    else:
        cur.execute("SELECT value FROM system_settings WHERE key = 'fee_due_day'")
        row = cur.fetchone()
        due_day = int(row["value"]) if row and row["value"].isdigit() else 10
    last_day = calendar.monthrange(yr, mo)[1]
    due_day  = min(due_day, last_day)
    result = _run_smart_monthly_generation(cur, db, user_id, yr, mo, due_day)
    return success(message=f"Generated {result['generated']} invoices. {result['skipped']} already existed.")

# ── Fee Types ─────────────────────────────────────────────────
@bp.get("/fee-types")
@jwt_required_custom
@require_permission("finance.view")
def get_fee_types():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM fee_types ORDER BY name")
    return success(data=[dict(r) for r in cur.fetchall()])

@bp.post("/fee-types")
@jwt_required_custom
@require_permission("finance.manage")
def create_fee_type():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db_cur()
    cur.execute("INSERT INTO fee_types (name, description) VALUES (%s, %s) RETURNING *",
                (body["name"], body.get("description") or None))
    db.commit()
    return success(data=dict(cur.fetchone()), message="Fee type created.", status=201)

@bp.put("/fee-types/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def update_fee_type(id):
    body = request.get_json() or {}
    db, cur = get_db_cur()
    cur.execute("UPDATE fee_types SET name=%s, description=%s, is_active=%s WHERE id=%s",
                (body.get("name"), body.get("description"), body.get("is_active", True), id))
    db.commit()
    return success(message="Fee type updated.")

@bp.delete("/fee-types/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def delete_fee_type(id):
    db, cur = get_db_cur()
    cur.execute("DELETE FROM fee_types WHERE id=%s", (id,))
    db.commit()
    return success(message="Deleted.")


# ── Class Fees ────────────────────────────────────────────────
@bp.get("/class-fees")
@jwt_required_custom
@require_permission("finance.view")
def get_class_fees():
    db, cur = get_db_cur()
    class_id = request.args.get("class_id")
    year_id  = request.args.get("academic_year_id")
    conds, params = ["1=1"], []
    if class_id:
        conds.append("cf.class_id = %s"); params.append(class_id)
    if year_id:
        conds.append("cf.academic_year_id = %s"); params.append(year_id)
    cur.execute(f"""
        SELECT cf.*, c.name AS class_name, ft.name AS fee_type_name, ay.name AS year_name
        FROM class_fees cf
        JOIN classes c ON c.id = cf.class_id
        JOIN fee_types ft ON ft.id = cf.fee_type_id
        JOIN academic_years ay ON ay.id = cf.academic_year_id
        WHERE {" AND ".join(conds)}
        ORDER BY c.name, ft.name
    """, params)
    return success(data=[dict(r) for r in cur.fetchall()])

@bp.post("/class-fees")
@jwt_required_custom
@require_permission("finance.manage")
def create_class_fee():
    body = request.get_json() or {}
    if not all([body.get("class_id"), body.get("fee_type_id"), body.get("academic_year_id")]):
        return error("class_id, fee_type_id, academic_year_id are required.", 400)
    db, cur = get_db_cur()
    cur.execute("""
        INSERT INTO class_fees (class_id, fee_type_id, amount, academic_year_id)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (class_id, fee_type_id, academic_year_id)
        DO UPDATE SET amount=%s, is_active=TRUE
        RETURNING *
    """, (body["class_id"], body["fee_type_id"], body.get("amount", 0),
          body["academic_year_id"], body.get("amount", 0)))
    db.commit()
    return success(data=dict(cur.fetchone()), message="Class fee saved.", status=201)

@bp.delete("/class-fees/<int:id>")
@jwt_required_custom
@require_permission("finance.manage")
def delete_class_fee(id):
    db, cur = get_db_cur()
    cur.execute("DELETE FROM class_fees WHERE id=%s", (id,))
    db.commit()
    return success(message="Deleted.")


# ── Discount Apply Config ─────────────────────────────────────
@bp.get("/discount-config")
@jwt_required_custom
@require_permission("finance.view")
def get_discount_config():
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM discount_apply_config LIMIT 1")
    config = dict(cur.fetchone() or {"on_all": False})
    cur.execute("""
        SELECT daf.fee_type_id, ft.name AS fee_type_name
        FROM discount_apply_fee_types daf
        JOIN fee_types ft ON ft.id = daf.fee_type_id
    """)
    config["fee_type_ids"] = [r["fee_type_id"] for r in cur.fetchall()]
    return success(data=config)

@bp.put("/discount-config")
@jwt_required_custom
@require_permission("finance.manage")
def save_discount_config():
    body       = request.get_json() or {}
    on_all     = body.get("on_all", False)
    fee_type_ids = body.get("fee_type_ids", [])
    sibling_rank_method = body.get("sibling_rank_method", "class")
    if sibling_rank_method not in ("class", "registration_no", "dob"):
        return error("Invalid sibling_rank_method.", 400)
    db, cur = get_db_cur()
    cur.execute(
        "UPDATE discount_apply_config SET on_all=%s, sibling_rank_method=%s::varchar, updated_at=NOW()",
        (on_all, sibling_rank_method)
    )
    cur.execute("DELETE FROM discount_apply_fee_types")
    for fid in fee_type_ids:
        cur.execute("INSERT INTO discount_apply_fee_types (fee_type_id) VALUES (%s) ON CONFLICT DO NOTHING", (fid,))
    db.commit()
    return success(message="Discount config saved.")

# ── Run fee reminders (called daily or manually) ──────────────────
@bp.post("/run-fee-reminders")
@jwt_required_custom
def run_fee_reminders_endpoint():
    from app.utils.fee_reminders import run_fee_reminders
    try:
        results = run_fee_reminders()
        return success(data=results, message=f"Fee reminders processed.")
    except Exception as e:
        return error(str(e), 500)

# ── Unlock student account ────────────────────────────────────────
@bp.get("/reports/fee-report")
@jwt_required_custom
@require_permission("students.view")
def fee_report_school():
    class_id = request.args.get("class_id")
    academic_year_id = request.args.get("academic_year_id")
    month = request.args.get("month")
    status = request.args.get("status")
    registration_no = request.args.get("registration_no")
    db, cur = get_db_cur()
    cur.execute(
        "SELECT * FROM sp_fee_report_school(%s::integer, %s::integer, %s::varchar, %s::varchar, %s::varchar)",
        (class_id, academic_year_id, month, status, registration_no)
    )
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/reports/fee-report/my-class")
@jwt_required_custom
def fee_report_my_class():
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("""
        SELECT ct.class_id
        FROM teachers t
        JOIN class_teachers ct ON ct.teacher_id = t.id AND ct.is_primary = TRUE
        WHERE t.user_id = %s
        LIMIT 1
    """, (user_id,))
    row = cur.fetchone()
    if not row:
        return error("You are not assigned as a class incharge.", 403)
    month = request.args.get("month")
    status = request.args.get("status")
    registration_no = request.args.get("registration_no")
    cur.execute(
        "SELECT * FROM sp_fee_report_class(%s::integer, %s::varchar, %s::varchar, %s::varchar)",
        (row["class_id"], month, status, registration_no)
    )
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/reports/fee-report/my-child")
@jwt_required_custom
def fee_report_my_child():
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("SELECT * FROM sp_fee_report_parent(%s::integer)", (user_id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/reports/fee-report/me")
@jwt_required_custom
def fee_report_me():
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return error("Student profile not found.", 404)
    cur.execute("SELECT * FROM sp_fee_report_student(%s::integer)", (row["id"],))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/locked-accounts")
@jwt_required_custom
@require_permission("students.view")
def get_locked_accounts():
    class_id  = request.args.get("class_id")
    student   = request.args.get("student")
    from_date = request.args.get("from_date")
    to_date   = request.args.get("to_date")
    db, cur = get_db_cur()
    cur.execute(
        "SELECT * FROM sp_get_locked_accounts(%s::integer, %s::varchar, %s::date, %s::date)",
        (class_id, student, from_date, to_date)
    )
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/locked-accounts/my-class")
@jwt_required_custom
def get_my_class_locked_accounts():
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    db, cur = get_db_cur()
    cur.execute("""
        SELECT ct.class_id
        FROM teachers t
        JOIN class_teachers ct ON ct.teacher_id = t.id AND ct.is_primary = TRUE
        WHERE t.user_id = %s
        LIMIT 1
    """, (user_id,))
    row = cur.fetchone()
    if not row:
        return error("You are not assigned as a class incharge.", 403)
    student   = request.args.get("student")
    from_date = request.args.get("from_date")
    to_date   = request.args.get("to_date")
    cur.execute(
        "SELECT * FROM sp_get_locked_accounts(%s::integer, %s::varchar, %s::date, %s::date)",
        (row["class_id"], student, from_date, to_date)
    )
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/unlock-account/<int:student_id>")
@jwt_required_custom
@require_permission("finance.manage")
def unlock_account(student_id):
    db, cur = get_db_cur()
    cur.execute("SELECT user_id FROM students WHERE id=%s", (student_id,))
    s = cur.fetchone()
    if not s: return error("Student not found.", 404)
    cur.execute("UPDATE users SET is_active=TRUE, lock_reason=NULL WHERE id=%s", (s["user_id"],))
    cur.execute("UPDATE fee_invoices SET notice_level=0 WHERE student_id=%s AND status='overdue'", (student_id,))
    db.commit()
    return success(message="Account unlocked.")
