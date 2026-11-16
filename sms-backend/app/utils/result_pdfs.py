"""
PDF builders for the exam result card (A4 portrait) and the Final
Certificate of Passing (A4 landscape). Pure functions: they take plain dicts
and return PDF bytes, so they can be tested without a database.
"""
import io
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, KeepTogether)

GREEN = colors.HexColor("#0f4c35")
GREEN_2 = colors.HexColor("#166534")
GOLD = colors.HexColor("#b8860b")
GOLD_SOFT = colors.HexColor("#f6e7b4")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#e2e8f0")
ZEBRA = colors.HexColor("#f8fafc")
PASS_C, COMP_C, FAIL_C = colors.HexColor("#15803d"), colors.HexColor("#b45309"), colors.HexColor("#b91c1c")
PASS_BG, COMP_BG, FAIL_BG = colors.HexColor("#dcfce7"), colors.HexColor("#fef3c7"), colors.HexColor("#fee2e2")

VERDICT = {"pass": ("PASS", PASS_C, PASS_BG), "compartment": ("COMPARTMENT", COMP_C, COMP_BG), "fail": ("FAIL", FAIL_C, FAIL_BG)}


def _p(text, size=9, color=INK, bold=False, align=TA_LEFT, leading=None, font=None):
    st = ParagraphStyle("x", fontName=font or ("Helvetica-Bold" if bold else "Helvetica"), fontSize=size,
                        textColor=color, alignment=align, leading=leading or size * 1.25)
    return Paragraph(str(text), st)


def _fmt(n, d=0):
    if n is None or n == "":
        return "-"
    try:
        return (f"{float(n):,.{d}f}").rstrip("0").rstrip(".") if d else f"{float(n):,.0f}"
    except (TypeError, ValueError):
        return str(n)


def _logo(logo_bytes, size):
    if not logo_bytes:
        return None
    try:
        return RLImage(io.BytesIO(logo_bytes), width=size, height=size)
    except Exception:
        return None


# =============================================================================
# Result card
# =============================================================================

def build_result_card(d):
    """
    d = {
      school: {name, address, phone, logo_bytes},
      exam: {name, academic_year},
      student: {name, father_name, enrollment_no, class_label, gender},
      subjects: [{name, total, passing, obtained, absent, grade}],
      summary: {total, obtained, pct, grade, gpa, position, class_size, verdict, subjects_failed, remark},
      grading_mode: "score" | "gpa" | "both",
      final: None | {rows: [{name, weight, pct, contribution, note}], pct, grade, gpa, position, verdict, mode},
      issued_on: "09 Nov 2026",
    }
    """
    buf = io.BytesIO()
    W, H = A4
    margin = 14 * mm

    def frame(c, _doc):
        c.saveState()
        c.setStrokeColor(GREEN); c.setLineWidth(1.6)
        c.rect(8 * mm, 8 * mm, W - 16 * mm, H - 16 * mm)
        c.setStrokeColor(GOLD); c.setLineWidth(0.6)
        c.rect(10 * mm, 10 * mm, W - 20 * mm, H - 20 * mm)
        c.setFont("Helvetica", 7); c.setFillColor(MUTED)
        c.drawCentredString(W / 2, 12.5 * mm, "This is a computer-generated result card. "
                            + (d["school"].get("name") or "") + " - " + d.get("issued_on", ""))
        c.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=13 * mm, bottomMargin=18 * mm, leftMargin=margin, rightMargin=margin,
                            title=f"Result Card - {d['student']['name']}", author=d["school"].get("name") or "")
    inner = W - 2 * margin
    story = []
    sch, ex, st, sm = d["school"], d["exam"], d["student"], d["summary"]

    # ---------------- header band
    logo = _logo(sch.get("logo_bytes"), 19 * mm)
    _nm = sch.get("name") or "School"
    _sz = 17 if len(_nm) <= 30 else (14.5 if len(_nm) <= 44 else 12.5)     # long names step down to fit
    head_txt = [_p(_nm, _sz, colors.white, True, leading=_sz * 1.2)]
    sub = " | ".join(x for x in [sch.get("address"), ("Phone: " + sch["phone"]) if sch.get("phone") else ""] if x)
    if sub:
        head_txt.append(_p(sub, 8.5, colors.HexColor("#d1fae5")))
    badge = Table([[_p("RESULT CARD", 10, GREEN, True, TA_CENTER)]], colWidths=[34 * mm], rowHeights=[9 * mm])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GOLD_SOFT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("ROUNDEDCORNERS", [4, 4, 4, 4])]))
    cells = ([logo] if logo else []) + [head_txt, badge]
    widths = ([23 * mm] if logo else []) + [inner - (23 * mm if logo else 0) - 38 * mm, 38 * mm]
    hdr = Table([cells], colWidths=widths, rowHeights=[27 * mm])
    hdr.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREEN), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                             ("ROUNDEDCORNERS", [6, 6, 6, 6])]))
    story += [hdr, Spacer(1, 6)]

    # ---------------- exam title
    story.append(_p(ex.get("name") or "Examination", 14, INK, True, TA_CENTER))
    if ex.get("academic_year"):
        story.append(_p("Academic Year " + ex["academic_year"], 9, MUTED, align=TA_CENTER))
    story.append(Spacer(1, 7))

    # ---------------- student panel
    rel = {"male": "Son of", "female": "Daughter of"}.get(str(st.get("gender") or "").lower(), "Father")
    info = [
        [_p("Student Name", 7.5, MUTED), _p(st.get("name"), 10.5, INK, True),
         _p("Enrollment No.", 7.5, MUTED), _p(st.get("enrollment_no") or "-", 10, INK, True)],
        [_p(rel, 7.5, MUTED), _p(st.get("father_name") or "-", 10, INK, True),
         _p("Class", 7.5, MUTED), _p(st.get("class_label") or "-", 10, INK, True)],
    ]
    it = Table(info, colWidths=[26 * mm, inner / 2 - 26 * mm, 26 * mm, inner / 2 - 26 * mm])
    it.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ZEBRA), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LINEBELOW", (0, 0), (-1, 0), 0.4, LINE),
                            ("ROUNDEDCORNERS", [5, 5, 5, 5])]))
    story += [it, Spacer(1, 9)]

    # ---------------- subjects
    head = ["#", "Subject", "Max", "Pass", "Obtained", "%", "Grade", "Status"]
    rows = [[_p(h, 8, colors.white, True, TA_CENTER if i != 1 else TA_LEFT) for i, h in enumerate(head)]]
    styles = [("BACKGROUND", (0, 0), (-1, 0), GREEN), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
              ("TOPPADDING", (0, 0), (-1, -1), 4.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
              ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE), ("BOX", (0, 0), (-1, -1), 0.6, LINE)]
    for i, s in enumerate(d["subjects"], start=1):
        absent = s.get("absent")
        obt = s.get("obtained")
        pct = (float(obt) / float(s["total"]) * 100) if (obt is not None and not absent and s.get("total")) else None
        passed = (not absent) and obt is not None and float(obt) >= float(s.get("passing") or 0)
        status = ("ABSENT", FAIL_C) if absent else (("PASS", PASS_C) if passed else ("FAIL", FAIL_C))
        rows.append([_p(i, 8.5, MUTED, align=TA_CENTER), _p(s["name"], 9, INK, True),
                     _p(_fmt(s.get("total")), 9, align=TA_CENTER), _p(_fmt(s.get("passing")), 9, MUTED, align=TA_CENTER),
                     _p("Absent" if absent else _fmt(obt, 1), 9.5, status[1] if not passed else INK, True, TA_CENTER),
                     _p(_fmt(pct, 1) if pct is not None else "-", 9, align=TA_CENTER),
                     _p(s.get("grade") or "-", 9, INK, True, TA_CENTER),
                     _p(status[0], 8, status[1], True, TA_CENTER)])
        if i % 2 == 0:
            styles.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    cw = [9 * mm, None, 15 * mm, 15 * mm, 20 * mm, 15 * mm, 15 * mm, 22 * mm]
    cw[1] = inner - sum(x for x in cw if x)
    st_tbl = Table(rows, colWidths=cw, repeatRows=1)
    st_tbl.setStyle(TableStyle(styles))
    story += [st_tbl, Spacer(1, 9)]

    # ---------------- summary tiles
    vtext, vcol, vbg = VERDICT.get(sm.get("verdict") or "fail", VERDICT["fail"])
    gm = d.get("grading_mode") or "score"
    grade_val = sm.get("grade") or "-"
    if gm in ("gpa", "both") and sm.get("gpa") is not None:
        grade_val = f"{grade_val}  ({float(sm['gpa']):.2f})"
    pos = "-" if not sm.get("position") else (f"{sm['position']}" + (f" / {sm['class_size']}" if sm.get("class_size") else ""))
    tiles = [("Total Marks", _fmt(sm.get("total"))), ("Obtained", _fmt(sm.get("obtained"), 1)),
             ("Percentage", _fmt(sm.get("pct"), 2) + "%"), ("Grade" + (" (GPA)" if gm in ("gpa", "both") else ""), grade_val),
             ("Position", pos)]
    tcells = [[_p(lbl, 7.5, MUTED, align=TA_CENTER) for lbl, _ in tiles] + [_p("RESULT", 7.5, vcol, True, TA_CENTER)],
              [_p(val, 13, INK, True, TA_CENTER) for _, val in tiles] + [_p(vtext, 12.5 if len(vtext) <= 6 else 9.5, vcol, True, TA_CENTER)]]
    tw = inner * 0.155
    tt = Table(tcells, colWidths=[tw] * 5 + [inner - tw * 5])
    tt.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-2, -1), 0.4, LINE),
                            ("BACKGROUND", (0, 0), (-2, -1), colors.white), ("BACKGROUND", (-1, 0), (-1, -1), vbg),
                            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                            ("LINEABOVE", (0, 0), (-1, 0), 2, GOLD), ("ROUNDEDCORNERS", [5, 5, 5, 5])]))
    story.append(tt)
    if sm.get("verdict") == "compartment" and sm.get("subjects_failed"):
        story.append(Spacer(1, 3))
        story.append(_p(f"Compartment in {sm['subjects_failed']} subject(s): the student must reappear in the failed subject(s).",
                        8, COMP_C, align=TA_CENTER))
    story.append(Spacer(1, 9))

    # ---------------- final (year) result
    fin = d.get("final")
    if fin:
        fv_text, fv_col, fv_bg = VERDICT.get(fin.get("verdict") or "fail", VERDICT["fail"])
        block = [_p("Final Result - Academic Year " + (ex.get("academic_year") or ""), 11, GREEN, True), Spacer(1, 4)]
        is_marks = fin.get("mode") == "marks"
        fr = [[_p(h, 8, colors.white, True, TA_CENTER if i else TA_LEFT)
               for i, h in enumerate(["Component", "Max Marks" if is_marks else "Weight", "Score", "Contribution"])]]
        for r in fin["rows"]:
            note = r.get("note")
            fr.append([_p(r["name"] + (f"  <font size=7 color='#94a3b8'>({note})</font>" if note else ""), 9, INK, True),
                       _p(_fmt(r.get("weight"), 1) + ("" if is_marks else "%"), 9, align=TA_CENTER),
                       _p("-" if r.get("pct") is None else _fmt(r["pct"], 2) + "%", 9, align=TA_CENTER),
                       _p("-" if r.get("contribution") is None else _fmt(r["contribution"], 2) + ("" if is_marks else "%"), 9, INK, True, TA_CENTER)])
        fpos = "-" if not fin.get("position") else str(fin["position"])
        fr.append([_p("FINAL", 9.5, GREEN, True), _p(f"Grade {fin.get('grade') or '-'}  |  Position {fpos}", 8.5, MUTED, align=TA_CENTER), "",
                   _p(_fmt(fin.get("pct"), 2) + "%", 11.5, GREEN, True, TA_CENTER)])
        ft = Table(fr, colWidths=[inner - 3 * 32 * mm, 32 * mm, 32 * mm, 32 * mm])
        fs = [("BACKGROUND", (0, 0), (-1, 0), GREEN_2), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
              ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE), ("BACKGROUND", (0, -1), (-1, -1), GOLD_SOFT),
              ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
              ("SPAN", (1, -1), (2, -1))]
        ft.setStyle(TableStyle(fs))
        verdict_bar = Table([[_p("Final Result: " + fv_text, 11, fv_col, True, TA_CENTER)]], colWidths=[inner])
        verdict_bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), fv_bg), ("TOPPADDING", (0, 0), (-1, -1), 5),
                                         ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("ROUNDEDCORNERS", [4, 4, 4, 4])]))
        block += [ft, Spacer(1, 4), verdict_bar, Spacer(1, 9)]
        story.append(KeepTogether(block))

    # ---------------- remarks + signatures
    remark = sm.get("remark") or ""
    rm = Table([[_p("Remarks", 8, MUTED, True)], [_p(remark or "&nbsp;", 9.5, INK)]], colWidths=[inner], rowHeights=[None, 13 * mm])
    rm.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 1), (-1, 1), "TOP"),
                            ("BACKGROUND", (0, 0), (-1, 0), ZEBRA), ("ROUNDEDCORNERS", [4, 4, 4, 4])]))
    story += [KeepTogether([rm, Spacer(1, 18)])]
    sig = Table([[_p("Class Teacher", 8.5, MUTED, align=TA_CENTER), "", _p("Principal", 8.5, MUTED, align=TA_CENTER), "",
                  _p("Parent / Guardian", 8.5, MUTED, align=TA_CENTER)]],
                colWidths=[inner * 0.26, inner * 0.11, inner * 0.26, inner * 0.11, inner * 0.26])
    sig.setStyle(TableStyle([("LINEABOVE", (0, 0), (0, 0), 0.8, INK), ("LINEABOVE", (2, 0), (2, 0), 0.8, INK),
                             ("LINEABOVE", (4, 0), (4, 0), 0.8, INK), ("TOPPADDING", (0, 0), (-1, -1), 4)]))
    story.append(sig)
    story.append(Spacer(1, 6))
    story.append(_p("Issued on " + d.get("issued_on", ""), 8, MUTED, align=TA_RIGHT))

    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()


# =============================================================================
# Final Certificate of Passing
# =============================================================================

def build_certificate(d):
    """
    d = {
      school: {name, address, logo_bytes},
      student: {name, father_name, gender, enrollment_no, class_label},
      academic_year, pct, grade, position, certificate_no, issued_on
    }
    """
    buf = io.BytesIO()
    W, H = landscape(A4)
    c = rl_canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle(f"Certificate - {d['student']['name']}")
    sch, st = d["school"], d["student"]

    # background + borders
    c.setFillColor(colors.HexColor("#fffdf6")); c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(GREEN); c.rect(9 * mm, 9 * mm, W - 18 * mm, H - 18 * mm, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#fffdf6")); c.rect(13 * mm, 13 * mm, W - 26 * mm, H - 26 * mm, stroke=0, fill=1)
    c.setStrokeColor(GOLD); c.setLineWidth(1.4); c.rect(16 * mm, 16 * mm, W - 32 * mm, H - 32 * mm)
    c.setLineWidth(0.5); c.rect(18 * mm, 18 * mm, W - 36 * mm, H - 36 * mm)

    # corner ornaments
    def corner(x, y, sx, sy):
        c.saveState(); c.translate(x, y); c.scale(sx, sy)
        c.setStrokeColor(GOLD); c.setLineWidth(1.6)
        c.line(0, 0, 22 * mm, 0); c.line(0, 0, 0, 22 * mm)
        c.setLineWidth(0.7)
        c.line(3 * mm, 3 * mm, 16 * mm, 3 * mm); c.line(3 * mm, 3 * mm, 3 * mm, 16 * mm)
        c.setFillColor(GOLD)
        p = c.beginPath(); p.moveTo(7 * mm, 7 * mm); p.lineTo(10 * mm, 8.5 * mm); p.lineTo(8.5 * mm, 10 * mm); p.close()
        c.drawPath(p, stroke=0, fill=1)
        c.circle(7 * mm, 7 * mm, 1.3 * mm, stroke=0, fill=1)
        c.restoreState()
    o = 21 * mm
    corner(o, o, 1, 1); corner(W - o, o, -1, 1); corner(o, H - o, 1, -1); corner(W - o, H - o, -1, -1)

    # faint watermark
    c.saveState(); c.setFillColor(colors.HexColor("#0f4c35")); c.setFillAlpha(0.045)
    c.setFont("Times-Bold", 120); c.translate(W / 2, H / 2 - 20 * mm); c.rotate(12)
    c.drawCentredString(0, 0, "PASSED"); c.restoreState()

    # logo / emblem
    y = H - 33 * mm
    logo = sch.get("logo_bytes")
    drawn = False
    if logo:
        try:
            img = ImageReader(io.BytesIO(logo))
            c.drawImage(img, W / 2 - 11 * mm, y - 12 * mm, 22 * mm, 22 * mm, mask="auto", preserveAspectRatio=True)
            drawn = True
        except Exception:
            drawn = False
    if not drawn:
        c.setFillColor(GREEN); c.circle(W / 2, y - 1 * mm, 10 * mm, stroke=0, fill=1)
        c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.circle(W / 2, y - 1 * mm, 8.5 * mm, stroke=1, fill=0)
        initials = "".join(w[0] for w in (sch.get("name") or "S").split()[:3]).upper()
        c.setFillColor(colors.white); c.setFont("Times-Bold", 14); c.drawCentredString(W / 2, y - 3.5 * mm, initials)

    # school
    c.setFillColor(GREEN); c.setFont("Times-Bold", 22); c.drawCentredString(W / 2, H - 55 * mm, (sch.get("name") or "School").upper())
    if sch.get("address"):
        c.setFillColor(MUTED); c.setFont("Helvetica", 9); c.drawCentredString(W / 2, H - 61 * mm, sch["address"])

    # title
    c.setFillColor(GOLD); c.setFont("Times-Bold", 34)
    c.drawCentredString(W / 2, H - 78 * mm, "C E R T I F I C A T E")
    c.setFillColor(GREEN); c.setFont("Times-Italic", 16)
    c.drawCentredString(W / 2, H - 87 * mm, "of Passing")
    c.setStrokeColor(GOLD); c.setLineWidth(0.8)
    c.line(W / 2 - 45 * mm, H - 91 * mm, W / 2 - 8 * mm, H - 91 * mm); c.line(W / 2 + 8 * mm, H - 91 * mm, W / 2 + 45 * mm, H - 91 * mm)
    c.setFillColor(GOLD); c.circle(W / 2, H - 91 * mm, 1.4 * mm, stroke=0, fill=1)

    # body
    c.setFillColor(INK); c.setFont("Times-Roman", 13)
    c.drawCentredString(W / 2, H - 102 * mm, "This is to certify that")
    c.setFillColor(GREEN); c.setFont("Times-BoldItalic", 30)
    c.drawCentredString(W / 2, H - 116 * mm, st.get("name") or "")
    c.setStrokeColor(GOLD); c.setLineWidth(0.7); c.line(W / 2 - 80 * mm, H - 119.5 * mm, W / 2 + 80 * mm, H - 119.5 * mm)

    rel = {"male": "son of", "female": "daughter of"}.get(str(st.get("gender") or "").lower(), "child of")
    line1 = (f"{rel} {st['father_name']}, " if st.get("father_name") else "") + f"Enrollment No. {st.get('enrollment_no') or '-'},"
    line2 = (f"has successfully passed {st.get('class_label') or 'the class'} in the academic year "
             f"{d.get('academic_year') or ''}")
    perf = f"securing {float(d.get('pct') or 0):.2f}% marks with Grade {d.get('grade') or '-'}"
    if d.get("position") and int(d["position"]) <= 3:
        perf += f" and {_ordinal(int(d['position']))} position in class"
    c.setFillColor(INK); c.setFont("Times-Roman", 13.5)
    c.drawCentredString(W / 2, H - 129 * mm, line1)
    c.drawCentredString(W / 2, H - 137 * mm, line2)
    c.drawCentredString(W / 2, H - 145 * mm, perf + ",")
    c.drawCentredString(W / 2, H - 153 * mm, "and is hereby declared eligible for promotion to the next class.")

    # seal
    sx, sy = W / 2, 39 * mm
    c.setFillColor(GOLD); c.circle(sx, sy, 13 * mm, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#d4a017")); c.circle(sx, sy, 11 * mm, stroke=0, fill=1)
    c.setStrokeColor(colors.white); c.setLineWidth(0.8); c.circle(sx, sy, 9.6 * mm, stroke=1, fill=0)
    c.setFillColor(colors.white); c.setFont("Times-Bold", 11); c.drawCentredString(sx, sy + 0.5 * mm, "PASSED")
    c.setFont("Helvetica-Bold", 6.5); c.drawCentredString(sx, sy - 4.5 * mm, d.get("academic_year") or "")
    for dx in (-5 * mm, 5 * mm):     # ribbon tails
        c.setFillColor(GREEN)
        p = c.beginPath(); p.moveTo(sx + dx - 2.5 * mm, sy - 11 * mm); p.lineTo(sx + dx + 2.5 * mm, sy - 11 * mm)
        p.lineTo(sx + dx + 2.5 * mm, sy - 21 * mm); p.lineTo(sx + dx, sy - 18.5 * mm); p.lineTo(sx + dx - 2.5 * mm, sy - 21 * mm); p.close()
        c.drawPath(p, stroke=0, fill=1)
    c.setFillColor(GOLD); c.circle(sx, sy, 11 * mm, stroke=0, fill=0)

    # signatures
    for x, label in ((W * 0.22, "Class Teacher"), (W * 0.78, "Principal")):
        c.setStrokeColor(INK); c.setLineWidth(0.8); c.line(x - 32 * mm, 40 * mm, x + 32 * mm, 40 * mm)
        c.setFillColor(MUTED); c.setFont("Helvetica-Bold", 9.5); c.drawCentredString(x, 35 * mm, label)

    # footer details
    c.setFillColor(MUTED); c.setFont("Helvetica", 8)
    c.drawString(46 * mm, 26 * mm, "Certificate No: " + (d.get("certificate_no") or "-"))
    c.drawRightString(W - 46 * mm, 26 * mm, "Date of Issue: " + (d.get("issued_on") or ""))

    c.showPage(); c.save()
    return buf.getvalue()


def _ordinal(n):
    return f"{n}{'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"
