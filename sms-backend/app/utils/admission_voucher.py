"""
Admission fee voucher (A4): a PARENT copy and a SCHOOL copy, separated by a cut line.
School name, logo, address and bank details come from app.utils.school_info.get_school_info.
"""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

NAVY = colors.HexColor("#1e3a5f")
SOFT = colors.HexColor("#64748b")
LINE = colors.HexColor("#cbd5e1")


def _d(v):
    if not v:
        return "-"
    try:
        return datetime.fromisoformat(str(v)[:19]).strftime("%d %b %Y")
    except ValueError:
        return str(v)[:10]


def _copy(c, top, school, v, label):
    W = A4[0]
    x0, x1 = 15 * mm, W - 15 * mm
    # header band: logo + school name
    c.setFillColor(NAVY); c.rect(x0, top - 22 * mm, x1 - x0, 22 * mm, fill=1, stroke=0)
    tx = x0 + 5 * mm
    if school.get("logo_bytes"):
        try:
            c.drawImage(ImageReader(io.BytesIO(school["logo_bytes"])), x0 + 4 * mm, top - 19 * mm, 16 * mm, 16 * mm, mask="auto",
                        preserveAspectRatio=True)
            tx = x0 + 23 * mm
        except Exception:
            pass
    name = school.get("name") or "School"
    size = 14 if len(name) <= 40 else 11.5
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", size); c.drawString(tx, top - 10 * mm, name)
    c.setFont("Helvetica", 8.5)
    c.drawString(tx, top - 15.5 * mm, " | ".join(x for x in (school.get("address"), school.get("phone")) if x)[:110])
    c.setFont("Helvetica-Bold", 9); c.drawRightString(x1 - 4 * mm, top - 6.5 * mm, label)

    # title
    y = top - 31 * mm
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 13); c.drawString(x0, y, "ADMISSION FEE VOUCHER")
    c.setFont("Helvetica-Bold", 10); c.drawRightString(x1, y, v["invoice_no"])

    # details grid
    rows = [("Application No.", v["application_no"]), ("Session", v["session"]),
            ("Applicant", v["student"]), ("Class applied for", v["class_name"]),
            ("Issued on", _d(v["issued_at"])), ("Due date", _d(v["due_date"]))]
    y -= 9 * mm
    colw = (x1 - x0) / 2
    for i, (k, val) in enumerate(rows):
        cx = x0 + (i % 2) * colw
        cy = y - (i // 2) * 8 * mm
        c.setFillColor(SOFT); c.setFont("Helvetica", 7.5); c.drawString(cx, cy + 3.2 * mm, k.upper())
        c.setFillColor(colors.black); c.setFont("Helvetica-Bold", 10); c.drawString(cx, cy - 1 * mm, str(val or "-")[:48])
    y -= 3 * 8 * mm + 2 * mm

    # amount box
    c.setStrokeColor(LINE); c.setFillColor(colors.HexColor("#f1f5f9"))
    c.roundRect(x0, y - 14 * mm, x1 - x0, 14 * mm, 2 * mm, fill=1, stroke=1)
    c.setFillColor(colors.black); c.setFont("Helvetica", 10); c.drawString(x0 + 5 * mm, y - 8.5 * mm, "Admission fee")
    c.setFont("Helvetica-Bold", 15); c.drawRightString(x1 - 5 * mm, y - 9.5 * mm, f"Rs. {v['amount']:,.0f}")

    # bank details + status
    y -= 21 * mm
    st = school.get("settings") or {}
    bank = [("Bank", st.get("bank_name")), ("Account title", st.get("bank_account_title") or name),
            ("Account no.", st.get("bank_account_no")), ("IBAN", st.get("bank_iban"))]
    bank = [b for b in bank if b[1]]
    c.setFillColor(SOFT); c.setFont("Helvetica-Bold", 8); c.drawString(x0, y, "PAY AT THE BANK OR THE SCHOOL FINANCE OFFICE")
    c.setFont("Helvetica", 9); c.setFillColor(colors.black)
    for i, (k, val) in enumerate(bank):
        c.drawString(x0, y - (i + 1) * 4.6 * mm, f"{k}: {val}")
    if v.get("status") == "paid":
        c.saveState(); c.setFillColor(colors.HexColor("#16a34a")); c.setFont("Helvetica-Bold", 22)
        c.translate(x1 - 30 * mm, y - 8 * mm); c.rotate(12); c.drawCentredString(0, 0, "PAID"); c.restoreState()
    c.setFillColor(SOFT); c.setFont("Helvetica-Oblique", 7.5)
    c.drawString(x0, y - (len(bank) + 1) * 4.6 * mm - 2 * mm,
                 "Keep the bank receipt. The admission is confirmed once the school verifies the payment.")


def build_voucher(school, v):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    H = A4[1]
    _copy(c, H - 12 * mm, school, v, "PARENT COPY")
    c.setStrokeColor(LINE); c.setDash(3, 3); c.line(10 * mm, H / 2, A4[0] - 10 * mm, H / 2); c.setDash()
    c.setFillColor(SOFT); c.setFont("Helvetica", 7); c.drawCentredString(A4[0] / 2, H / 2 + 1.5 * mm, "cut here")
    _copy(c, H / 2 - 8 * mm, school, v, "SCHOOL COPY")
    c.showPage(); c.save()
    return buf.getvalue()
