from reportlab.lib.pagesizes import A4, A5, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from io import BytesIO
from datetime import date, timedelta
import psycopg2.extras
from app.utils.processing_date import get_processing_date

NAVY    = colors.HexColor("#1e3a5f")
LBLUE   = colors.HexColor("#e8f0fe")
GREEN   = colors.HexColor("#16a34a")
RED     = colors.HexColor("#dc2626")
ORANGE  = colors.HexColor("#ea580c")
LORANGE = colors.HexColor("#fff7ed")
WHITE   = colors.white
LGRAY   = colors.HexColor("#f8fafc")
CGRAY   = colors.HexColor("#e2e8f0")


def get_settings(db, category):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT key, value FROM system_settings WHERE category = %s", (category,))
    return {r["key"]: r["value"] for r in cur.fetchall()}


def get_invoice_data(db, invoice_id):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT fi.*, fi.invoice_no,
               s.first_name || ' ' || s.last_name AS student_name,
               s.enrollment_no,
               c.name  AS class_name,
               COALESCE(fs.name, 'Monthly Fee') AS structure_name,
               COALESCE(fi.late_fee_type, fs.late_fee_type, 'none') AS late_fee_type,
               COALESCE(fi.late_fee_amount, fs.late_fee_amount, 0) AS late_fee_amount
        FROM fee_invoices fi
        JOIN   students      s  ON s.id  = fi.student_id
        LEFT JOIN classes    c  ON c.id  = s.class_id
        LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id
        WHERE fi.id = %s
    """, (invoice_id,))
    inv = dict(cur.fetchone())
    cur.execute("""
        SELECT item_type, label, amount FROM fee_invoice_items
        WHERE invoice_id = %s ORDER BY id
    """, (invoice_id,))
    inv["line_items"] = [dict(r) for r in cur.fetchall()]
    cur.execute("""
        SELECT sd.*, dt.name AS discount_name, dt.type AS discount_type, dt.value AS discount_value
        FROM student_discounts sd
        JOIN discount_types dt ON dt.id = sd.discount_type_id
        WHERE sd.student_id = %s AND sd.is_active = TRUE
          AND (sd.valid_until IS NULL OR sd.valid_until >= %s)
          AND (sd.valid_from  IS NULL OR sd.valid_from  <= %s)
    """, (inv["student_id"], get_processing_date(db), get_processing_date(db)))
    inv["discounts"] = [dict(r) for r in cur.fetchall()]
    return inv


def p(text, bold=False, color=colors.black, align=TA_LEFT, size=6.5):
    fn = "Helvetica-Bold" if bold else "Helvetica"
    return Paragraph(text, ParagraphStyle(
        "x", fontSize=size, fontName=fn,
        textColor=color, alignment=align, leading=size + 2
    ))


def get_logo_image(school, size=18):
    import base64, io
    from reportlab.platypus import Image
    logo_data = school.get("school_logo", "")
    if not logo_data or "," not in logo_data:
        return None
    try:
        header, b64 = logo_data.split(",", 1)
        img_bytes = base64.b64decode(b64)
        img_buf   = io.BytesIO(img_bytes)
        img       = Image(img_buf, width=size*mm, height=size*mm)
        img.hAlign = "LEFT"
        return img
    except Exception:
        return None


def get_logo_image(school, size=18):
    import base64, io
    from reportlab.platypus import Image
    logo_data = school.get("school_logo", "")
    if not logo_data or "," not in logo_data:
        return None
    try:
        header, b64 = logo_data.split(",", 1)
        img_bytes = base64.b64decode(b64)
        img_buf   = io.BytesIO(img_bytes)
        img       = Image(img_buf, width=size*mm, height=size*mm)
        img.hAlign = "LEFT"
        return img
    except Exception:
        return None


def amount_in_words(amount):
    ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
            "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
            "Seventeen","Eighteen","Nineteen"]
    tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
    def two_digits(n):
        if n < 20: return ones[n]
        return tens[n//10] + (" " + ones[n%10] if n%10 else "")
    def three_digits(n):
        if n >= 100:
            return ones[n//100] + " Hundred" + (" " + two_digits(n%100) if n%100 else "")
        return two_digits(n)
    n = int(amount)
    if n == 0: return "Zero Rupees Only"
    parts = []
    if n >= 100000:
        parts.append(three_digits(n//100000) + " Lakh")
        n %= 100000
    if n >= 1000:
        parts.append(three_digits(n//1000) + " Thousand")
        n %= 1000
    if n > 0:
        parts.append(three_digits(n))
    return " ".join(parts) + " Rupees Only"


def make_copy(title, inv, school, fee_settings, col_w):
    due_day    = int(fee_settings.get("fee_due_day",          10))
    grace_days = int(fee_settings.get("fee_grace_days",         3))
    r1_days    = int(fee_settings.get("fee_reminder1_days",    5))
    lock_days  = int(fee_settings.get("fee_lock_days",        15))

    issued    = inv["issued_at"] if isinstance(inv["issued_at"], date) else inv["issued_at"].date()
    due_date  = inv["due_date"] or date(issued.year, issued.month, due_day)
    reminder1 = due_date + timedelta(days=r1_days)
    lock_date = due_date + timedelta(days=lock_days)

    school_name  = school.get("school_name",  "School Management System")
    school_city  = school.get("school_city",  "")
    school_phone = school.get("school_phone", "")

    amount     = float(inv["amount"]     or 0)
    net_amount = float(inv["net_amount"] or amount)
    fine       = float(inv["fine"]       or 0)

    late_fee, late_label = 0, ""
    late_start = due_date + timedelta(days=grace_days)
    if inv.get("late_fee_type") == "fixed":
        late_fee   = float(inv.get("late_fee_amount") or 0)
        late_label = "Late Fee after %s (Grace: %d days)" % (late_start.strftime("%d %b"), grace_days)
    elif inv.get("late_fee_type") == "percentage":
        pct        = float(inv.get("late_fee_amount") or 0)
        late_fee   = round(net_amount * pct / 100, 2)
        late_label = "Late Fee %.0f%% after %s (Grace: %d days)" % (pct, late_start.strftime("%d %b"), grace_days)

    inv_no = inv.get("invoice_no") or ("INV-%s-%s" % (issued.year, str(inv["id"]).zfill(4)))

    c1 = col_w * 0.67
    c2 = col_w * 0.33

    data = []
    styles = []

    # â”€â”€ row 0: school name + copy label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    logo = get_logo_image(school, size=8)
    school_cell = [logo, p(school_name, bold=True, color=WHITE, size=7.5)] if logo else p(school_name, bold=True, color=WHITE, size=7.5)
    if logo:
        from reportlab.platypus import KeepInFrame
        inner = Table([[logo, p(school_name, bold=True, color=WHITE, size=7.5)]], colWidths=[10*mm, c1-10*mm])
        inner.setStyle(TableStyle([
            ("VALIGN",        (0,0),(-1,-1),"MIDDLE"),
            ("LEFTPADDING",   (0,0),(-1,-1),0),
            ("RIGHTPADDING",  (0,0),(-1,-1),2),
            ("TOPPADDING",    (0,0),(-1,-1),0),
            ("BOTTOMPADDING", (0,0),(-1,-1),0),
        ]))
        data.append([inner, p(title, bold=True, color=WHITE, align=TA_RIGHT, size=6)])
    else:
        data.append([p(school_name, bold=True, color=WHITE, size=7.5),
                     p(title,      bold=True, color=WHITE, align=TA_RIGHT, size=6)])
    styles += [("BACKGROUND", (0,0), (-1,0), NAVY),
               ("TOPPADDING",    (0,0), (-1,0), 4),
               ("BOTTOMPADDING", (0,0), (-1,0), 4)]

    # â”€â”€ row 1: city/phone + invoice no â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    sub_color = colors.HexColor("#94a3b8")
    data.append([p("%s  %s" % (school_city, school_phone), color=sub_color, size=5.5),
                 p(inv_no, color=sub_color, align=TA_RIGHT, size=5.5)])
    styles.append(("BACKGROUND", (0,1), (-1,1), NAVY))

    # â”€â”€ row 2: issued + due â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    data.append([p("Issued: <b>%s</b>" % issued.strftime("%d-%b-%Y")),
                 p("Due: <b>%s</b>"    % due_date.strftime("%d-%b-%Y"), align=TA_RIGHT)])
    styles.append(("BACKGROUND", (0,2), (-1,2), LBLUE))

    # â”€â”€ row 3: student name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    data.append([p("Student: <b>%s</b>" % inv["student_name"]), ""])
    styles.append(("SPAN", (0,3), (1,3)))

    # â”€â”€ row 4: enrollment + class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    data.append([p("Enroll: <b>%s</b>   Class: <b>%s</b>" % (
        inv["enrollment_no"], inv["class_name"] or "N/A")), ""])
    styles.append(("SPAN", (0,4), (1,4)))

    # â”€â”€ row 5: fee header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    data.append([p("<b>Description</b>", bold=True, color=WHITE),
                 p("<b>Amount</b>",      bold=True, color=WHITE, align=TA_RIGHT)])
    styles.append(("BACKGROUND", (0,5), (-1,5), NAVY))

    # â”€â”€ row 6: main fee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # ── line items (new) or fallback (old invoices) ──────────
    next_row = 6
    line_items = inv.get("line_items", [])
    if line_items:
        tuition_items  = [i for i in line_items if i["item_type"] == "tuition"]
        charge_items   = [i for i in line_items if i["item_type"] == "charge"]
        discount_items = [i for i in line_items if i["item_type"] == "discount"]
        for item in tuition_items:
            data.append([p(item["label"]),
                         p("Rs. %s" % "{:,.0f}".format(float(item["amount"])), align=TA_RIGHT)])
            next_row += 1
        for item in charge_items:
            data.append([p(item["label"], color=colors.HexColor("#1d4ed8")),
                         p("Rs. %s" % "{:,.0f}".format(float(item["amount"])), color=colors.HexColor("#1d4ed8"), align=TA_RIGHT)])
            next_row += 1
        if charge_items:
            subtotal = sum(float(i["amount"]) for i in tuition_items + charge_items)
            data.append([p("<b>Sub Total</b>", bold=True),
                         p("<b>Rs. %s</b>" % "{:,.0f}".format(subtotal), bold=True, align=TA_RIGHT)])
            next_row += 1
        for item in discount_items:
            data.append([p("(-) %s" % item["label"], color=GREEN),
                         p("- Rs. %s" % "{:,.0f}".format(float(item["amount"])), color=GREEN, align=TA_RIGHT)])
            next_row += 1
    else:
        data.append([p(inv.get("structure_name") or "Monthly Fee"),
                     p("Rs. %s" % "{:,.0f}".format(amount), align=TA_RIGHT)])
        next_row += 1
        for d in inv["discounts"]:
            dval     = float(d["discount_value"])
            disc_amt = round(amount * dval / 100, 2) if d["discount_type"] == "percentage" else dval
            suffix   = "%" if d["discount_type"] == "percentage" else " Rs."
            data.append([p("(-) %s (%d%s)" % (d["discount_name"], int(dval), suffix), color=GREEN),
                         p("- Rs. %s" % "{:,.0f}".format(disc_amt), color=GREEN, align=TA_RIGHT)])
            next_row += 1

    # â”€â”€ fine if any â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if fine > 0:
        data.append([p("Fine", color=RED),
                     p("+ Rs. %s" % "{:,.0f}".format(fine), color=RED, align=TA_RIGHT)])
        next_row += 1

    # â”€â”€ net amount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    net_row = next_row
    data.append([p("<b>Net Amount Due</b>", bold=True, color=WHITE),
                 p("<b>Rs. %s</b>" % "{:,.0f}".format(net_amount), bold=True, color=WHITE, align=TA_RIGHT)])
    styles.append(("BACKGROUND", (0, net_row), (-1, net_row), NAVY))
    next_row += 1

    # amount in words
    words_row = next_row
    data.append([p("In Words: <i>%s</i>" % amount_in_words(net_amount), size=5.5, color=colors.HexColor("#1d4ed8")), ""])
    styles.append(("SPAN",       (0, words_row), (1, words_row)))
    styles.append(("BACKGROUND", (0, words_row), (-1, words_row), colors.HexColor("#eff6ff")))
    next_row += 1

        # ── late fee / amount after due date ──────────────────────
    if late_fee > 0:
        late_row = next_row
        data.append([p(late_label, color=ORANGE),
                     p("+ Rs. %s" % "{:,.0f}".format(late_fee), color=ORANGE, align=TA_RIGHT)])
        styles.append(("BACKGROUND", (0, late_row), (-1, late_row), LORANGE))
        next_row += 1
        after_row = next_row
        amount_after_due = net_amount + late_fee
        data.append([p("<b>Amount After Due Date</b>", bold=True, color=RED),
                     p("<b>Rs. %s</b>" % "{:,.0f}".format(amount_after_due), bold=True, color=RED, align=TA_RIGHT)])
        styles.append(("BACKGROUND", (0, after_row), (-1, after_row), colors.HexColor("#fef2f2")))
        next_row += 1

    # â”€â”€ dates / bank info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if title == "BANK COPY":
        bank_info = "%s | A/C: %s" % (
            school.get("bank_name", "N/A"), school.get("bank_account", "N/A"))
        data.append([p(bank_info, size=5.5), ""])
    else:
        data.append([p("Reminder: %s  |  Lock: %s" % (
            reminder1.strftime("%d-%b"), lock_date.strftime("%d-%b-%Y")),
            color=RED, size=5.5), ""])
    styles.append(("SPAN", (0, next_row), (1, next_row)))
    styles.append(("BACKGROUND", (0, next_row), (-1, next_row), LGRAY))
    next_row += 1

    # â”€â”€ signature â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    sig = {"SCHOOL COPY": "Parent Signature",
           "BANK COPY":   "Bank Stamp",
           "STUDENT COPY":"Accounts Office"}.get(title, "")
    data.append([p(sig, align=TA_RIGHT, size=5.5, color=colors.gray), ""])
    styles.append(("SPAN",    (0, next_row), (1, next_row)))
    styles.append(("LINEABOVE",(0, next_row), (-1, next_row), 0.5, CGRAY))
    styles.append(("TOPPADDING",    (0, next_row), (-1, next_row), 8))
    styles.append(("BOTTOMPADDING", (0, next_row), (-1, next_row), 4))

    # â”€â”€ global styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    styles += [
        ("FONTSIZE",      (0,0), (-1,-1), 6.5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
        ("TOPPADDING",    (0,0), (-1,-1), 2),
        ("LEFTPADDING",   (0,0), (-1,-1), 3),
        ("RIGHTPADDING",  (0,0), (-1,-1), 3),
        ("BOX",           (0,0), (-1,-1), 0.5, CGRAY),
        ("INNERGRID",     (0,6), (-1, net_row-1), 0.25, CGRAY),
        ("ROWBACKGROUNDS",(0,6), (-1, net_row-1), [WHITE, LGRAY]),
    ]

    t = Table(data, colWidths=[c1, c2])
    t.setStyle(TableStyle(styles))
    return t


def generate_invoice_pdf(invoice_id):
    from app.db.connection import get_db
    import calendar
    db           = get_db()
    inv          = get_invoice_data(db, invoice_id)
    fee_settings = get_settings(db, "fee_settings")
    school       = get_settings(db, "school_info")

    school_name    = school.get("school_name",  "School Management System")
    school_city    = school.get("school_city",  "")
    school_phone   = school.get("school_phone", "")
    school_address = school.get("school_address", "")
    bank_name      = school.get("bank_name",    "")
    bank_account   = school.get("bank_account", "")

    due_day    = int(fee_settings.get("fee_due_day",    10))
    grace_days = int(fee_settings.get("fee_grace_days",  3))
    lock_days  = int(fee_settings.get("fee_lock_days",  15))

    issued   = inv["issued_at"] if isinstance(inv["issued_at"], date) else inv["issued_at"].date()
    due_date = inv["due_date"] or date(issued.year, issued.month, due_day)
    late_start = due_date + timedelta(days=grace_days)
    lock_date  = due_date + timedelta(days=lock_days)

    # Month label from month_year or issued date
    month_yr = inv.get("month_year") or issued.strftime("%Y-%m")
    try:
        yr, mo = int(month_yr[:4]), int(month_yr[5:7])
        month_label = "%s %d" % (calendar.month_name[mo], yr)
    except Exception:
        month_label = issued.strftime("%B %Y")

    amount     = float(inv["amount"]     or 0)
    net_amount = float(inv["net_amount"] or amount)
    fine       = float(inv["fine"]       or 0)

    # Late fee calculation
    late_fee, late_label = 0, ""
    lft = inv.get("late_fee_type", "none")
    lfa = float(inv.get("late_fee_amount") or 0)
    if lft == "fixed" and lfa > 0:
        late_fee   = lfa
        late_label = "Late Fee Rs. %s after %s (Grace: %d days)" % ("{:,.0f}".format(late_fee), late_start.strftime("%d-%b"), grace_days)
    elif lft == "percentage" and lfa > 0:
        late_fee   = round(net_amount * lfa / 100, 2)
        late_label = "Late Fee %.0f%% after %s (Grace: %d days)" % (lfa, late_start.strftime("%d-%b"), grace_days)

    buffer   = BytesIO()
    page_w, page_h = landscape(A4)
    margin   = 8 * mm
    gap      = 5 * mm
    col_w    = (page_w - 2*margin - 2*gap) / 3

    def pp(text, bold=False, size=7, color=colors.black, align=TA_LEFT):
        fn = "Helvetica-Bold" if bold else "Helvetica"
        return Paragraph(text, ParagraphStyle("x", fontName=fn, fontSize=size,
                          textColor=color, alignment=align, leading=size+2.5))

    def make_challan(copy_label):
        rows = []
        styles_list = []

        # ── School name centered header ───────────────────────
        rows.append([pp("<b>%s</b>" % school_name, bold=True, size=9, color=WHITE, align=TA_CENTER), ""])
        styles_list += [
            ("SPAN",          (0,0),(1,0)),
            ("BACKGROUND",    (0,0),(1,0), NAVY),
            ("TOPPADDING",    (0,0),(1,0), 5),
            ("BOTTOMPADDING", (0,0),(1,0), 5),
            ("ALIGN",         (0,0),(1,0), "CENTER"),
        ]

        # ── Address + phone ───────────────────────────────────
        addr_txt = " | ".join(filter(None, [school_address or school_city, school_phone]))
        rows.append([pp(addr_txt, size=6, color=colors.gray, align=TA_CENTER), ""])
        styles_list += [
            ("SPAN",          (0,1),(1,1)),
            ("TOPPADDING",    (0,1),(1,1), 2),
            ("BOTTOMPADDING", (0,1),(1,1), 2),
        ]

        # ── Month pill badge row ──────────────────────────────
        badge_text = "MONTHLY FEE CHALLAN — %s — %s" % (month_label.upper(), copy_label)
        rows.append([pp("<b>%s</b>" % badge_text, bold=True, size=6.5, color=WHITE, align=TA_CENTER), ""])
        styles_list += [
            ("SPAN",          (0,2),(1,2)),
            ("BACKGROUND",    (0,2),(1,2), NAVY),
            ("TOPPADDING",    (0,2),(1,2), 3),
            ("BOTTOMPADDING", (0,2),(1,2), 3),
            ("ROUNDEDCORNERS",(0,2),(1,2), [10,10,10,10]),
        ]

        # ── Student info grid ─────────────────────────────────
        c1 = col_w * 0.5
        c2 = col_w * 0.5
        rows.append([
            pp("Student: <b>%s</b>" % inv["student_name"], size=6.5),
            pp("Class: <b>%s</b>" % (inv["class_name"] or "N/A"), size=6.5),
        ])
        rows.append([
            pp("Reg No: <b>%s</b>" % inv["enrollment_no"], size=6.5),
            pp("Due Date: <b>%s</b>" % due_date.strftime("%d-%b-%Y"), size=6.5, color=RED),
        ])
        rows.append([
            pp("Invoice: <b>%s</b>" % inv["invoice_no"], size=6.5),
            pp("Issued: <b>%s</b>" % issued.strftime("%d-%b-%Y"), size=6.5),
        ])
        styles_list += [
            ("BACKGROUND",    (0,3),(1,5), LBLUE),
            ("TOPPADDING",    (0,3),(1,5), 2),
            ("BOTTOMPADDING", (0,3),(1,5), 2),
            ("LINEBELOW",     (0,3),(1,5), 0.25, CGRAY),
        ]

        # ── Particulars header ────────────────────────────────
        next_r = 6
        rows.append([pp("<b>Particulars</b>", bold=True, color=WHITE, size=6.5), pp("<b>Amount (Rs.)</b>", bold=True, color=WHITE, align=TA_RIGHT, size=6.5)])
        styles_list += [
            ("BACKGROUND",    (0,next_r),(1,next_r), NAVY),
            ("TOPPADDING",    (0,next_r),(1,next_r), 3),
            ("BOTTOMPADDING", (0,next_r),(1,next_r), 3),
        ]
        next_r += 1

        # ── Line items ────────────────────────────────────────
        line_items = inv.get("line_items", [])
        fee_items      = [i for i in line_items if i["item_type"] in ("tuition", "charge")]
        discount_items = [i for i in line_items if i["item_type"] == "discount"]

        if fee_items:
            for item in fee_items:
                amt = float(item["amount"])
                c = colors.HexColor("#1d4ed8") if item["item_type"] == "charge" else colors.black
                rows.append([pp(item["label"], size=6.5, color=c),
                             pp("{:,.0f}".format(amt), size=6.5, align=TA_RIGHT, color=c)])
                next_r += 1
            # Subtotal if multiple items
            if len(fee_items) > 1:
                subtotal = sum(float(i["amount"]) for i in fee_items)
                rows.append([pp("Sub Total", size=6.5, color=colors.gray),
                             pp("{:,.0f}".format(subtotal), size=6.5, align=TA_RIGHT, color=colors.gray)])
                styles_list.append(("LINEABOVE", (0,next_r),(1,next_r), 0.5, CGRAY))
                next_r += 1
        else:
            # Fallback: old invoices
            rows.append([pp(inv.get("structure_name") or "Monthly Fee", size=6.5),
                         pp("{:,.0f}".format(amount), size=6.5, align=TA_RIGHT)])
            next_r += 1
            for d in inv.get("discounts", []):
                dval = float(d["discount_value"])
                disc_amt = round(amount * dval / 100, 2) if d["discount_type"] == "percentage" else dval
                rows.append([pp("(-) %s" % d["discount_name"], size=6.5, color=GREEN),
                             pp("(%s)" % "{:,.0f}".format(disc_amt), size=6.5, align=TA_RIGHT, color=GREEN)])
                next_r += 1

        for item in discount_items:
            rows.append([pp("(-) %s" % item["label"], size=6.5, color=GREEN),
                         pp("(%s)" % "{:,.0f}".format(float(item["amount"])), size=6.5, align=TA_RIGHT, color=GREEN)])
            next_r += 1

        if fine > 0:
            rows.append([pp("Fine", size=6.5, color=RED),
                         pp("{:,.0f}".format(fine), size=6.5, align=TA_RIGHT, color=RED)])
            next_r += 1

        # ── Total due ─────────────────────────────────────────
        total_row = next_r
        rows.append([pp("<b>Total Due</b>", bold=True, color=WHITE, size=7),
                     pp("<b>Rs. {:,.0f}</b>".format(net_amount), bold=True, color=WHITE, align=TA_RIGHT, size=7)])
        styles_list += [
            ("BACKGROUND",    (0,total_row),(1,total_row), NAVY),
            ("TOPPADDING",    (0,total_row),(1,total_row), 4),
            ("BOTTOMPADDING", (0,total_row),(1,total_row), 4),
        ]
        next_r += 1

        # ── Amount in words ───────────────────────────────────
        rows.append([pp("<i>%s</i>" % amount_in_words(net_amount), size=6, color=colors.HexColor("#1d4ed8")), ""])
        styles_list += [
            ("SPAN",       (0,next_r),(1,next_r)),
            ("BACKGROUND", (0,next_r),(1,next_r), colors.HexColor("#eff6ff")),
            ("TOPPADDING", (0,next_r),(1,next_r), 2),
            ("BOTTOMPADDING",(0,next_r),(1,next_r), 2),
        ]
        next_r += 1

        # ── Late fee row ──────────────────────────────────────
        if late_fee > 0:
            rows.append([pp(late_label, size=6, color=ORANGE),
                         pp("Rs. {:,.0f}".format(net_amount + late_fee), size=6.5, align=TA_RIGHT, color=RED, bold=True)])
            styles_list += [
                ("BACKGROUND",    (0,next_r),(1,next_r), colors.HexColor("#fff7ed")),
                ("TOPPADDING",    (0,next_r),(1,next_r), 2),
                ("BOTTOMPADDING", (0,next_r),(1,next_r), 2),
            ]
            next_r += 1

        # ── Bank info or reminder ─────────────────────────────
        if copy_label == "BANK COPY" and bank_name:
            bank_txt = "Bank: <b>%s</b>  |  A/C: <b>%s</b>" % (bank_name, bank_account)
            rows.append([pp(bank_txt, size=6, align=TA_CENTER), ""])
        else:
            rows.append([pp("Lock Date: <b>%s</b>  |  Payable at School Counter" % lock_date.strftime("%d-%b-%Y"), size=6, color=RED, align=TA_CENTER), ""])
        styles_list += [
            ("SPAN",          (0,next_r),(1,next_r)),
            ("BACKGROUND",    (0,next_r),(1,next_r), LGRAY),
            ("TOPPADDING",    (0,next_r),(1,next_r), 2),
            ("BOTTOMPADDING", (0,next_r),(1,next_r), 2),
        ]
        next_r += 1

        # ── Signature row ─────────────────────────────────────
        sig_lbl = {"SCHOOL COPY":"Parent Signature","BANK COPY":"Bank Stamp","STUDENT COPY":"Cashier Signature"}.get(copy_label,"")
        rows.append([pp(sig_lbl, size=6, color=colors.gray, align=TA_RIGHT), ""])
        styles_list += [
            ("SPAN",          (0,next_r),(1,next_r)),
            ("LINEABOVE",     (0,next_r),(1,next_r), 0.5, CGRAY),
            ("TOPPADDING",    (0,next_r),(1,next_r), 8),
            ("BOTTOMPADDING", (0,next_r),(1,next_r), 4),
        ]

        # ── Global styles ─────────────────────────────────────
        styles_list += [
            ("FONTSIZE",      (0,0),(1,-1), 6.5),
            ("LEFTPADDING",   (0,0),(1,-1), 4),
            ("RIGHTPADDING",  (0,0),(1,-1), 4),
            ("TOPPADDING",    (0,0),(1,-1), 2),
            ("BOTTOMPADDING", (0,0),(1,-1), 2),
            ("BOX",           (0,0),(1,-1), 0.5, CGRAY),
            ("INNERGRID",     (0,6),(1,total_row-1), 0.25, CGRAY),
            ("ROWBACKGROUNDS",(0,7),(1,total_row-1), [WHITE, LGRAY]),
        ]

        t = Table(rows, colWidths=[col_w*0.62, col_w*0.38])
        t.setStyle(TableStyle(styles_list))
        return t

    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        leftMargin=margin, rightMargin=margin,
        topMargin=margin,  bottomMargin=margin,
    )

    s = make_challan("STUDENT COPY")
    b = make_challan("BANK COPY")
    c = make_challan("SCHOOL COPY")

    outer = Table(
        [[s, Spacer(gap,1), b, Spacer(gap,1), c]],
        colWidths=[col_w, gap, col_w, gap, col_w]
    )
    outer.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
    ]))

    doc.build([outer])
    buffer.seek(0)
    return buffer.read()


def generate_payment_receipt_pdf(payment_id):
    from app.db.connection import get_db
    import psycopg2.extras, base64, io as _io
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT p.*,
               fi.invoice_no, fi.amount, fi.net_amount, fi.discount,
               fi.due_date, fi.issued_at,
               s.first_name || ' ' || s.last_name AS student_name,
               s.enrollment_no,
               c.name  AS class_name,
               fs.name AS structure_name,
               u.first_name || ' ' || u.last_name AS verified_by_name,
               us.signature AS officer_signature
        FROM payments p
        JOIN fee_invoices fi ON fi.id = p.invoice_id
        JOIN students s ON s.id = fi.student_id
        LEFT JOIN classes c  ON c.id  = s.class_id
        LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id
        LEFT JOIN users u  ON u.id  = p.verified_by
        LEFT JOIN user_signatures us ON us.user_id = p.verified_by
        WHERE p.id = %s
    """, (payment_id,))
    pay = cur.fetchone()
    if not pay:
        raise ValueError("Payment not found.")
    pay = dict(pay)

    school = get_settings(db, "school_info")
    school_name  = school.get("school_name",  "School Management System")
    school_city  = school.get("school_city",  "")
    school_phone = school.get("school_phone", "")
    school_logo  = school.get("school_logo",  "")

    buffer = BytesIO()
    doc    = SimpleDocTemplate(
        buffer, pagesize=A5,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=10*mm,  bottomMargin=10*mm,
    )

    def pp(text, bold=False, size=9, color=colors.black, align=TA_LEFT):
        fn = "Helvetica-Bold" if bold else "Helvetica"
        return Paragraph(text, ParagraphStyle("x", fontSize=size, fontName=fn,
                          textColor=color, alignment=align, leading=size+3))

    elements = []

    # ── Logo + School Name Header ─────────────────────────────
    logo_cell = None
    if school_logo and "," in school_logo:
        try:
            from reportlab.platypus import Image
            _, b64 = school_logo.split(",", 1)
            img_bytes = base64.b64decode(b64)
            logo_cell = Image(_io.BytesIO(img_bytes), width=14*mm, height=14*mm)
        except Exception:
            logo_cell = None

    if not logo_cell:
        initials = "".join(w[0] for w in school_name.split()[:2]).upper()
        logo_cell = pp(f"<b>{initials}</b>", bold=True, size=11, color=WHITE, align=TA_CENTER)

    hdr_inner = Table(
        [[logo_cell,
          pp(f"<b>{school_name}</b>", bold=True, size=12, align=TA_CENTER),
          pp("Fee Payment Receipt", size=8, color=colors.gray, align=TA_CENTER)]],
        colWidths=[16*mm, None, None]
    )
    hdr_inner.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("LEFTPADDING",   (0,0),(0,0),   2),
        ("BACKGROUND",    (0,0),(0,0),   NAVY),
        ("ROUNDEDCORNERS",(0,0),(0,0),   [8,8,8,8]),
    ]))

    hdr = Table([[hdr_inner]], colWidths=[135*mm])
    hdr.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 10),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LINEBELOW",     (0,0),(-1,-1), 0.5, CGRAY),
    ]))
    elements.append(hdr)
    elements.append(Spacer(1, 3*mm))

    # ── Receipt No + Dates ────────────────────────────────────
    rcp_no   = f"RCP-{str(payment_id).zfill(5)}"
    pay_date = pay["paid_at"].strftime("%d-%b-%Y") if pay.get("paid_at") else "N/A"
    ver_date = pay["verified_at"].strftime("%d-%b-%Y %I:%M %p") if pay.get("verified_at") else "N/A"

    meta = Table([[
        pp(f"Receipt No: <b>{rcp_no}</b>", size=8),
        pp(f"Date: <b>{pay_date}</b>", size=8, align=TA_RIGHT),
    ]], colWidths=[67*mm, 68*mm])
    meta.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), LBLUE),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("RIGHTPADDING",  (0,0),(-1,-1), 6),
    ]))
    elements.append(meta)
    elements.append(Spacer(1, 4*mm))

    # ── Student & Payment Details ─────────────────────────────
    amount_paid = float(pay["amount_paid"] or 0)
    net_amount  = float(pay["net_amount"]  or 0)

    rows = [
        [pp("<b>Field</b>", bold=True, color=WHITE), pp("<b>Details</b>", bold=True, color=WHITE)],
        [pp("Student Name",  size=8), pp(pay["student_name"],  size=8, bold=True)],
        [pp("Enrollment No", size=8), pp(pay["enrollment_no"], size=8)],
        [pp("Class",         size=8), pp(pay["class_name"] or "N/A", size=8)],
        [pp("Fee Head",      size=8), pp(pay["structure_name"] or "Fee Payment", size=8)],
        [pp("Invoice Amount",size=8), pp(f"Rs. {net_amount:,.0f}", size=8)],
        [pp("Amount Paid",   size=8), pp(f"<b>Rs. {amount_paid:,.0f}</b>", bold=True, size=9, color=GREEN)],
        [pp("Payment Method",size=8), pp((pay.get("method") or "cash").replace("_"," ").title(), size=8)],
    ]
    if pay.get("reference"):
        rows.append([pp("Reference No", size=8), pp(pay["reference"], size=8)])

    det = Table(rows, colWidths=[45*mm, 90*mm])
    ts  = [
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, LGRAY]),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("RIGHTPADDING",  (0,0),(-1,-1), 6),
        ("BOX",           (0,0),(-1,-1), 0.5, CGRAY),
        ("INNERGRID",     (0,0),(-1,-1), 0.25, CGRAY),
    ]
    det.setStyle(TableStyle(ts))
    elements.append(det)
    elements.append(Spacer(1, 5*mm))

    # ── PAID circular stamp + signatures ─────────────────────
    verified_name = pay.get("verified_by_name") or "Finance Officer"

    # Officer signature image or blank line
    officer_sig_rows = []
    sig_data = pay.get("officer_signature")
    if sig_data and "," in sig_data:
        try:
            from reportlab.platypus import Image
            _, b64 = sig_data.split(",", 1)
            img_bytes = base64.b64decode(b64)
            sig_img = Image(_io.BytesIO(img_bytes), width=44*mm, height=16*mm)
            sig_img.hAlign = "CENTER"
            officer_sig_rows.append(sig_img)
        except Exception:
            officer_sig_rows.append(pp("_________________________", size=8, align=TA_CENTER))
    else:
        officer_sig_rows.append(pp("_________________________", size=8, align=TA_CENTER))

    officer_sig_rows += [
        pp(f"<b>{verified_name}</b>", bold=True, size=8, align=TA_CENTER),
        pp("Finance Officer", size=7, color=colors.gray, align=TA_CENTER),
        pp(ver_date, size=6, color=colors.gray, align=TA_CENTER),
    ]

    from reportlab.graphics.shapes import Drawing, Circle, String
    from reportlab.graphics import renderPDF

    d = Drawing(50*mm, 50*mm)
    cx, cy = 25*mm, 25*mm
    r  = 20*mm
    d.add(Circle(cx, cy, r, fillColor=None, strokeColor=GREEN, strokeWidth=2))
    d.add(Circle(cx, cy, r-3*mm, fillColor=None, strokeColor=GREEN, strokeWidth=0.5))
    d.add(String(cx, cy+3*mm, "PAID",     fontSize=11, fontName="Helvetica-Bold",
                 fillColor=GREEN, textAnchor="middle"))
    d.add(String(cx, cy-4*mm, "VERIFIED", fontSize=7,  fontName="Helvetica",
                 fillColor=GREEN, textAnchor="middle"))

    sig_row = Table([[
        Table([[row] for row in officer_sig_rows], colWidths=[50*mm]),
        d,
        Table([[
            pp("_________________________", size=8, align=TA_CENTER),
            pp(pay["student_name"], size=8, align=TA_CENTER),
            pp("Parent / Guardian", size=7, color=colors.gray, align=TA_CENTER),
        ]], colWidths=[50*mm]),
    ]], colWidths=[50*mm, 35*mm, 50*mm])
    sig_row.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("ALIGN",         (1,0),(1,0),   "CENTER"),
    ]))
    elements.append(sig_row)
    elements.append(Spacer(1, 4*mm))

    # ── Footer ────────────────────────────────────────────────
    elements.append(pp(
        "This is a computer-generated receipt. Valid only with Finance Officer verification.",
        size=7, color=colors.gray, align=TA_CENTER
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
