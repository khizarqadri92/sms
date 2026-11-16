"""
Admission application form (A4 PDF): school header, the student's passport photo at the
top right, sections A-E, documents, test / interview and signature lines.
Contains nothing internal (no staff notes or assessments) - the same PDF is safe for
parents and staff. Dates use the school's configured date format.
"""
import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

NAVY = colors.HexColor("#1e3a5f")
SOFT = colors.HexColor("#64748b")
LINE = colors.HexColor("#cbd5e1")
BAND = colors.HexColor("#eef2f7")
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONF = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
REL = {"grandfather": "Grandfather", "grandmother": "Grandmother", "paternal_uncle": "Paternal Uncle", "maternal_uncle": "Maternal Uncle",
       "paternal_aunt": "Paternal Aunt", "maternal_aunt": "Maternal Aunt", "brother": "Brother", "sister": "Sister", "other": "Other"}
NOTIFY = {"primary": "Primary guardian", "father": "Father", "mother": "Mother", "guardian": "Other guardian",
          "both_parents": "Both parents", "all": "All contacts"}


def fmt_date(v, fmt="DD/MM/YYYY"):
    """Same formats as the app's RegionalSettingsContext.formatDate."""
    if not v:
        return "-"
    if isinstance(v, str):
        try:
            v = datetime.fromisoformat(v.replace(" ", "T")[:19])
        except ValueError:
            return v
    d, m, y = v.day, v.month, v.year
    return {"MM/DD/YYYY": f"{m:02d}/{d:02d}/{y}", "YYYY-MM-DD": f"{y}-{m:02d}-{d:02d}", "DD-MM-YYYY": f"{d:02d}-{m:02d}-{y}",
            "DD MMM YYYY": f"{d:02d} {MON[m-1]} {y}", "MMM DD, YYYY": f"{MON[m-1]} {d:02d}, {y}",
            "DD MMMM YYYY": f"{d:02d} {MONF[m-1]} {y}", "MMMM DD, YYYY": f"{MONF[m-1]} {d:02d}, {y}"}.get(fmt, f"{d:02d}/{m:02d}/{y}")


def cnic(v):
    d = "".join(ch for ch in (v or "") if ch.isdigit())
    return f"{d[:5]}-{d[5:12]}-{d[12:]}" if len(d) == 13 else (v or "-")


class _Doc:
    def __init__(self, c, school, a):
        self.c, self.school, self.a = c, school, a
        self.W, self.H = A4
        self.x0, self.x1 = 15 * mm, self.W - 15 * mm
        self.y = 0

    def header(self, first=True):
        c, s = self.c, self.school
        c.setFillColor(NAVY); c.rect(0, self.H - 28 * mm, self.W, 28 * mm, fill=1, stroke=0)
        tx = self.x0
        if s.get("logo_bytes"):
            try:
                c.drawImage(ImageReader(io.BytesIO(s["logo_bytes"])), self.x0, self.H - 24 * mm, 20 * mm, 20 * mm, mask="auto", preserveAspectRatio=True)
                tx = self.x0 + 24 * mm
            except Exception:
                pass
        name = s.get("name") or "School"
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 15 if len(name) <= 42 else 12.5); c.drawString(tx, self.H - 12 * mm, name)
        c.setFont("Helvetica", 8.5)
        c.drawString(tx, self.H - 18 * mm, " | ".join(x for x in (s.get("address"), s.get("phone")) if x)[:120])
        self.y = self.H - 36 * mm
        if first:
            c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 14); c.drawString(self.x0, self.y, "ADMISSION APPLICATION FORM")
            self.y -= 6 * mm
            c.setFillColor(SOFT); c.setFont("Helvetica", 9)
            a = self.a
            c.drawString(self.x0, self.y, f"Application no. {a['application_no']}   |   Session {a['session']}   |   {a['campus']}")
            self.y -= 5 * mm
            c.drawString(self.x0, self.y, f"Class applied for: {a['class_name']}   |   Status: {a['status_label']}")
            self.y -= 5 * mm
            c.drawString(self.x0, self.y, f"Submitted: {a['submitted']}")
        else:
            c.setFillColor(SOFT); c.setFont("Helvetica", 9); c.drawString(self.x0, self.y, f"Application no. {self.a['application_no']} (continued)")
        self.y -= 8 * mm

    def photo(self, img_bytes):
        """Passport-size box at the top right (35 x 45 mm)."""
        c = self.c
        w, h = 35 * mm, 45 * mm
        x, y = self.x1 - w, self.H - 36 * mm - h + 6 * mm
        c.setStrokeColor(LINE); c.setFillColor(colors.white); c.rect(x, y, w, h, fill=1, stroke=1)
        drawn = False
        if img_bytes:
            try:
                img = ImageReader(io.BytesIO(img_bytes))
                iw, ih = img.getSize()
                scale = min((w - 2 * mm) / iw, (h - 2 * mm) / ih)
                dw, dh = iw * scale, ih * scale
                c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")
                drawn = True
            except Exception:
                drawn = False
        if not drawn:
            c.setFillColor(SOFT); c.setFont("Helvetica", 8)
            c.drawCentredString(x + w / 2, y + h / 2 + 2 * mm, "Affix recent")
            c.drawCentredString(x + w / 2, y + h / 2 - 2 * mm, "photograph")
        self.photo_bottom = y

    def need(self, height):
        if self.y - height < 22 * mm:
            self.footer(); self.c.showPage(); self.header(first=False)

    def section(self, title):
        self.need(26 * mm)                               # a heading never sits alone at the foot of a page
        c = self.c
        c.setFillColor(BAND); c.rect(self.x0, self.y - 2 * mm, self.x1 - self.x0, 7 * mm, fill=1, stroke=0)
        c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 10); c.drawString(self.x0 + 2 * mm, self.y, title)
        self.y -= 9 * mm

    def grid(self, pairs, cols=2, right_limit=None):
        """Label / value pairs in columns. right_limit narrows the area (beside the photo)."""
        c = self.c
        x1 = right_limit or self.x1
        colw = (x1 - self.x0) / cols
        rows = [pairs[i:i + cols] for i in range(0, len(pairs), cols)]
        for row in rows:
            self.need(10 * mm)
            for j, (k, v) in enumerate(row):
                cx = self.x0 + j * colw
                c.setFillColor(SOFT); c.setFont("Helvetica", 7.2); c.drawString(cx, self.y + 3.2 * mm, k.upper())
                c.setFillColor(colors.black); c.setFont("Helvetica-Bold", 9.5)
                text = str(v if v not in (None, "") else "-")
                while c.stringWidth(text, "Helvetica-Bold", 9.5) > colw - 3 * mm and len(text) > 3:
                    text = text[:-2]
                if text != str(v if v not in (None, "") else "-"): text = text[:-1] + "…"
                c.drawString(cx, self.y - 1 * mm, text)
            self.y -= 9.5 * mm

    def table(self, head, rows, widths):
        c = self.c
        self.need(8 * mm + 6 * mm * len(rows))
        x = self.x0
        c.setFillColor(SOFT); c.setFont("Helvetica-Bold", 7.5)
        for h, w in zip(head, widths):
            c.drawString(x, self.y, h.upper()); x += w
        self.y -= 5 * mm
        c.setStrokeColor(LINE); c.line(self.x0, self.y + 3.5 * mm, self.x1, self.y + 3.5 * mm)
        for r in rows:
            self.need(6 * mm)
            x = self.x0
            c.setFillColor(colors.black); c.setFont("Helvetica", 9)
            for v, w in zip(r, widths):
                c.drawString(x, self.y, str(v)[:60]); x += w
            self.y -= 6 * mm
        self.y -= 2 * mm

    def footer(self):
        c = self.c
        c.setFillColor(SOFT); c.setFont("Helvetica", 7)
        c.drawString(self.x0, 10 * mm, f"Printed {self.a['printed']} - application {self.a['application_no']}")
        c.drawRightString(self.x1, 10 * mm, f"Page {c.getPageNumber()}")


def build_application_pdf(school, a, docs, test, interview, photo_bytes, date_fmt="DD/MM/YYYY"):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Admission application {a['application_no']}")
    d = _Doc(c, school, a)
    d.header()
    d.photo(photo_bytes)
    d.y = min(d.y, d.photo_bottom - 6 * mm)            # sections start below the photo
    F = lambda v: fmt_date(v, date_fmt)

    d.section("A. STUDENT")
    d.grid([("First name", a["student_first_name"]), ("Last name", a["student_last_name"]),
            ("Date of birth", F(a["date_of_birth"])), ("Gender", (a["gender"] or "").title()),
            ("B-Form / birth certificate", cnic(a["b_form_no"]) if a["b_form_no"] else "-"), ("Class applied for", a["class_name"]),
            ("Previous school", a["previous_school"]), ("Previous class", a["previous_class"]),
            ("Religion", a.get("religion")), ("Sect", a.get("sect")),
            ("Nationality", a.get("nationality")), ("Lives with", {"father": "Father", "mother": "Mother", "both": "Both parents",
                                                                   "guardian": "Guardian"}.get(a.get("living_with"), "-"))])
    if a.get("previous_school"):
        d.grid([("Reason for leaving the previous school", a.get("leaving_reason"))], cols=1)
    d.grid([("Residential address", a["address"])], cols=1)
    pg = a["primary_guardian"]
    for who, title in (("father", "B. FATHER"), ("mother", "C. MOTHER")):
        d.section(title + ("  (primary guardian)" if pg == who else ""))
        d.grid([("Name", a[f"{who}_name"]), ("CNIC", cnic(a[f"{who}_cnic"]) if a[f"{who}_cnic"] else "-"),
                ("Occupation", a[f"{who}_occupation"]), ("Mobile", a[f"{who}_phone"]), ("Email", a[f"{who}_email"])])
    d.section("D. GUARDIAN")
    if pg == "other":
        rel = a["guardian_relationship_other"] if a["guardian_relationship"] == "other" else REL.get(a["guardian_relationship"], a["guardian_relationship"])
        d.grid([("Primary guardian", "Other"), ("Relationship", rel), ("Name", a["guardian_name"]),
                ("CNIC", cnic(a["guardian_cnic"]) if a["guardian_cnic"] else "-"), ("Occupation", a["guardian_occupation"]),
                ("Mobile", a["guardian_phone"]), ("Email", a["guardian_email"])])
    else:
        d.grid([("Primary guardian", pg.title())])
    d.section("E. ADMISSION MESSAGES")
    d.grid([("Send admission updates to", NOTIFY.get(a["notify_contact"], a["notify_contact"]))], cols=1)

    d.section("F. BROTHERS / SISTERS AT THE SCHOOL")
    sibs = a.get("siblings") or []
    if sibs:
        d.table(["Registration no.", "Name", "Class", "Campus"], [(s["enrollment_no"], s["name"], s.get("class_name") or "-", s.get("campus") or "-") for s in sibs],
                [40 * mm, 60 * mm, 45 * mm, 35 * mm])
    else:
        d.grid([("Siblings at the school", "None")], cols=1)
    d.section("G. DISABILITY / SPECIAL NEEDS")
    if a.get("has_disability"):
        names = {"physical": "Physical", "visual": "Visual", "hearing": "Hearing", "speech": "Speech", "learning": "Learning",
                 "intellectual": "Intellectual", "autism": "Autism spectrum", "other": "Other"}
        d.grid([("Disability / special need", "Yes"), ("Type", ", ".join(names.get(t, t) for t in (a.get("disability_types") or [])) or "-")])
        d.grid([("Details / support needed", a.get("disability_details"))], cols=1)
    else:
        d.grid([("Disability / special need", "None declared")], cols=1)
    d.section("H. TRANSPORT")
    if a.get("transport_mode") == "school_van":
        d.grid([("Transport", "School van"), ("Pick-up address / area", a.get("pickup_address"))])
    else:
        d.grid([("Transport", "Self (pick and drop by the family)")], cols=1)

    d.section("DOCUMENTS")
    status = {"pending": "Received - being checked", "verified": "Verified", "rejected": "Rejected", "resubmission_required": "Re-upload needed"}
    d.table(["Document", "Status", "Uploaded"], [(x["document_name"], status.get(x["status"], x["status"]), F(x["uploaded_at"])) for x in docs] or
            [("No documents uploaded", "", "")], [90 * mm, 50 * mm, 40 * mm])
    if test or interview:
        d.section("ADMISSION TEST & INTERVIEW")
        pairs = []
        if test:
            t_at = test["scheduled_at"]
            pairs += [("Admission test", f"{F(t_at)} {t_at:%I:%M %p}" if hasattr(t_at, "strftime") else F(t_at)), ("Test venue", test.get("room"))]
        if interview:
            i_at = interview["scheduled_at"]
            pairs += [("Interview", f"{F(i_at)} {i_at:%I:%M %p}" if hasattr(i_at, "strftime") else F(i_at)), ("Interview place", interview.get("location"))]
        d.grid(pairs)

    # declaration + signatures
    d.need(36 * mm)
    d.y -= 2 * mm
    c.setFillColor(SOFT); c.setFont("Helvetica-Oblique", 8)
    c.drawString(d.x0, d.y, "I confirm that the information given is correct. Admission is confirmed only after verification, the school's")
    d.y -= 4 * mm
    c.drawString(d.x0, d.y, "decision and payment of the admission fee.")
    d.y -= 20 * mm
    c.setStrokeColor(colors.black)
    for x, label in ((d.x0, "Signature of parent / guardian"), (d.x0 + 95 * mm, "Admission office (signature & stamp)")):
        c.line(x, d.y, x + 75 * mm, d.y)
        c.setFillColor(SOFT); c.setFont("Helvetica", 8); c.drawString(x, d.y - 4 * mm, label)
    d.footer()
    c.save()
    return buf.getvalue()
