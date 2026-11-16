"""
Student promotion (end of academic year).

Flow:  coordinator creates a list for a class (decisions pre-filled from the
       year-end final result) -> adjusts -> submits -> principal reviews the
       Promoted / Detained / Graduated lists, decides each "needs approval"
       student, then approves (which executes) or returns it.

Rules
  * Next class = same campus, next higher `level`. No higher level -> graduate.
    (Create Grade 6 with a higher level and Grade 5 promotes into it.)
  * Section: same letter as now if the next class has it; otherwise fill the
    next class's sections in order (A, then B, ...) up to each one's capacity.
  * Top-down: a class can be executed only once the class it moves into has
    been promoted this year (its seats are then known).
  * Needs principal approval: compartment, fee due (Result Rules threshold),
    no final result, or any coordinator override (reason required).
Permissions: exam.manage = coordinator side, exam.approve = principal.
"""
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_campus import get_current_campus_id, enforce_same_campus
from app.fastapi_permissions import require_permission
from app.fastapi_auth import get_jwt_claims
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime, get_processing_date

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _label(name, section):
    return f"{name} ({section})" if section else str(name)


# =============================================================================
# Core rules (plain functions - tested directly)
# =============================================================================

def active_year(cur, campus_id):
    cur.execute("""SELECT id, name, start_date, end_date FROM academic_years
                   WHERE is_active AND (campus_id = %s OR campus_id IS NULL)
                   ORDER BY campus_id NULLS LAST LIMIT 1""", (campus_id,))
    r = cur.fetchone()
    return dict(r) if r else None


def campus_classes(cur, campus_id):
    cur.execute("""SELECT c.id, c.name, c.section, c.level, c.capacity, c.campus_id,
                          (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.status='active') AS students
                   FROM classes c WHERE c.campus_id=%s
                   ORDER BY c.level NULLS LAST, c.name, c.section NULLS FIRST""", (campus_id,))
    return [dict(r) for r in cur.fetchall()]


def next_level_classes(classes, cls):
    """Classes (sections) of the next higher level on the campus; [] = graduate."""
    if cls.get("level") is None:
        return None                     # level not set - can't tell
    higher = sorted({c["level"] for c in classes if c.get("level") is not None and c["level"] > cls["level"]})
    if not higher:
        return []
    return sorted([c for c in classes if c.get("level") == higher[0]], key=lambda c: (c.get("section") or ""))


def fee_rule(cur, ay_id):
    cur.execute("SELECT withhold_on_fee_due, withhold_fee_months FROM exam_config WHERE academic_year_id=%s", (ay_id,))
    r = cur.fetchone()
    if not r or not r.get("withhold_on_fee_due"):
        return False, 0
    return True, max(int(r.get("withhold_fee_months") or 1), 1)


def fee_due_months(cur, student_ids, today):
    if not student_ids:
        return {}
    cur.execute("""SELECT student_id, COUNT(DISTINCT COALESCE(month_year, to_char(due_date,'YYYY-MM'))) AS months
                   FROM fee_invoices
                   WHERE student_id = ANY(%s) AND status IN ('unpaid','partial','overdue') AND due_date < %s
                   GROUP BY student_id""", (list(student_ids), today))
    return {r["student_id"]: int(r["months"]) for r in cur.fetchall()}


def seat_plan(targets, current_section, n_needed_before, occupied):
    """
    Picks the target section for one student.
    targets: sections of the next class; occupied: {class_id: seats taken (incl. already allocated)}
    Same section letter first (if it has room), else fill in order A, B, ...
    Returns (class_id or None if every section is full).
    """
    same = [t for t in targets if (t.get("section") or "") == (current_section or "") and current_section]
    order = same + [t for t in targets if t not in same]
    for t in order:
        cap = t.get("capacity") or 10**6
        if occupied.get(t["id"], 0) < cap:
            return t["id"]
    return None


def build_items(cur, db, cls, classes, ay_id):
    """Suggested decision for every active student of the class."""
    today = get_processing_date(db)
    cur.execute("""SELECT s.id, s.first_name, s.last_name, s.enrollment_no FROM students s
                   WHERE s.class_id=%s AND s.status='active' ORDER BY s.first_name, s.last_name""", (cls["id"],))
    students = [dict(r) for r in cur.fetchall()]
    ids = [s["id"] for s in students]
    cur.execute("""SELECT student_id, percentage, is_pass, is_compartment FROM final_results
                   WHERE academic_year_id=%s AND student_id = ANY(%s)""", (ay_id, ids or [0]))
    finals = {r["student_id"]: dict(r) for r in cur.fetchall()}
    fee_on, fee_months = fee_rule(cur, ay_id)
    due = fee_due_months(cur, ids, today) if fee_on else {}
    targets = next_level_classes(classes, cls)
    occupied = {t["id"]: planned_occupancy(cur, ay_id, t["id"]) for t in (targets or [])}

    items = []
    # best results first, so they keep their own section when seats are tight
    order = sorted(students, key=lambda s: -(float(finals[s["id"]]["percentage"]) if s["id"] in finals else -1))
    for s in order:
        fr = finals.get(s["id"])
        result = "none" if not fr else ("pass" if fr["is_pass"] else ("compartment" if fr["is_compartment"] else "fail"))
        reasons = []
        if targets == []:
            suggested = "graduate" if result == "pass" else ("detain" if result == "fail" else "graduate")
        else:
            suggested = "detain" if result == "fail" else "promote"
        if result == "compartment": reasons.append("compartment")
        if result == "none":
            suggested = "detain"; reasons.append("no_result")
        n_due = due.get(s["id"], 0)
        if fee_on and n_due >= fee_months and suggested in ("promote", "graduate"):
            reasons.append("fee_due")
        to_class = None
        if suggested == "promote" and targets:
            to_class = seat_plan(targets, cls.get("section"), 0, occupied)
            if to_class: occupied[to_class] = occupied.get(to_class, 0) + 1
        items.append({"student_id": s["id"], "suggested": suggested, "decision": suggested, "to_class_id": to_class,
                      "final_pct": float(fr["percentage"]) if fr else None, "final_result": result,
                      "fee_due_months": n_due, "reasons": reasons,
                      "needs_approval": bool([r for r in reasons if r != "no_result"])})
    return items


def arrived_this_year(cur, ay_id, class_id):
    """Students placed INTO class_id by an executed promotion this year (next year's occupants)."""
    cur.execute("""SELECT pi.student_id FROM promotion_items pi JOIN promotion_batches pb ON pb.id=pi.batch_id
                   WHERE pb.academic_year_id=%s AND pb.status='executed' AND pi.applied_decision='promote'
                     AND pi.to_class_id=%s""", (ay_id, class_id))
    return {r["student_id"] for r in cur.fetchall()}


def original_occupants(cur, ay_id, class_id):
    """Active students in the class who were there this year (not just promoted into it)."""
    arrived = arrived_this_year(cur, ay_id, class_id)
    cur.execute("SELECT id FROM students WHERE class_id=%s AND status='active'", (class_id,))
    return {r["id"] for r in cur.fetchall()} - arrived


def target_batch_status(cur, ay_id, class_id):
    cur.execute("SELECT id, status FROM promotion_batches WHERE academic_year_id=%s AND class_id=%s AND status<>'rolled_back'",
                (ay_id, class_id))
    b = cur.fetchone()
    return dict(b) if b else None


def planned_occupancy(cur, ay_id, class_id):
    """
    Seats expected to be taken in class_id next year, before new arrivals:
    executed -> the real current count; otherwise current students minus those
    the class's own (not yet executed) list moves out. With no list yet, its
    current students are assumed to stay (safe side). Execution re-checks.
    """
    cur.execute("SELECT COUNT(*) AS n FROM students WHERE class_id=%s AND status='active'", (class_id,))
    now = cur.fetchone()["n"]
    b = target_batch_status(cur, ay_id, class_id)
    if not b or b["status"] == "executed":
        return now
    cur.execute("SELECT COUNT(*) AS n FROM promotion_items WHERE batch_id=%s AND decision IN ('promote','graduate')", (b["id"],))
    return max(now - cur.fetchone()["n"], 0)


def results_status(cur, ay_id, class_id):
    """
    Promotion opens only after the year's final exam results are PUBLISHED.
    Returns (ready, reason, exam_name).
    """
    cur.execute("""SELECT fr.exam_id, e.name, e.status, COUNT(*) AS n
                   FROM final_results fr JOIN students s ON s.id=fr.student_id
                   LEFT JOIN exams e ON e.id=fr.exam_id
                   WHERE fr.academic_year_id=%s AND s.class_id=%s AND s.status='active'
                   GROUP BY fr.exam_id, e.name, e.status""", (ay_id, class_id))
    rows = cur.fetchall()
    if not rows:
        return False, "No final results yet - the final exam hasn't been compiled for this class", None
    unpublished = [r for r in rows if (r["status"] or "") != "published"]
    if unpublished:
        name = unpublished[0]["name"] or "The final exam"
        return False, f"Waiting for results to be published · {name}", name
    return True, None, rows[0]["name"]


def blocking_classes(cur, ay_id, cls, classes):
    """
    Top-down rule: next-level classes whose ORIGINAL students still have to move
    up this year. Students already promoted into them don't count.
    """
    targets = next_level_classes(classes, cls) or []
    pending = []
    for t in targets:
        if not original_occupants(cur, ay_id, t["id"]):
            continue
        b = target_batch_status(cur, ay_id, t["id"])
        if not b or b["status"] != "executed":
            pending.append(_label(t["name"], t.get("section")))
    return pending


def execute_batch(cur, db, batch, classes, user_id):
    """Applies an approved batch: moves students, graduates, writes history. Caller commits."""
    cur.execute("SELECT * FROM promotion_items WHERE batch_id=%s FOR UPDATE", (batch["id"],))
    items = [dict(r) for r in cur.fetchall()]
    cap = {c["id"]: (c.get("capacity") or 10**6) for c in classes}
    now = get_processing_datetime(db)
    moved = {}
    results = {"promoted": 0, "detained": 0, "graduated": 0}
    for it in items:
        d = it["decision"]
        if it["needs_approval"] and it["principal_decision"] != "approve" and d in ("promote", "graduate"):
            d = "detain"                          # principal did not approve the promotion
        if d == "promote":
            if not it["to_class_id"]:
                fail("A student marked Promote has no target class - fix the list first.", 400)
            moved[it["to_class_id"]] = moved.get(it["to_class_id"], 0) + 1
        it["_applied"] = d
    for cid, n in moved.items():
        cur.execute("SELECT COUNT(*) AS n FROM students WHERE class_id=%s AND status='active'", (cid,))
        if cur.fetchone()["n"] + n > cap.get(cid, 10**6):
            c = next((x for x in classes if x["id"] == cid), {})
            fail(f"{_label(c.get('name'), c.get('section'))} would exceed its capacity of {cap[cid]}.", 400)
    for it in items:
        d = it["_applied"]
        if d == "promote":
            cur.execute("UPDATE students SET class_id=%s WHERE id=%s", (it["to_class_id"], it["student_id"]))
            outcome, to_c = "promoted", it["to_class_id"]
        elif d == "graduate":
            cur.execute("UPDATE students SET status='graduated' WHERE id=%s", (it["student_id"],))
            outcome, to_c = "graduated", None
        else:
            outcome, to_c = "detained", None
        cur.execute("UPDATE promotion_items SET applied_decision=%s WHERE id=%s", (d, it["id"]))
        cur.execute("""INSERT INTO student_class_history(student_id, academic_year_id, class_id, outcome, to_class_id,
                                                         final_pct, final_result, batch_id, recorded_by, recorded_at)
                       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (it["student_id"], batch["academic_year_id"], it["from_class_id"], outcome, to_c,
                     it["final_pct"], it["final_result"], batch["id"], user_id, now))
        results[outcome] += 1
    cur.execute("UPDATE promotion_batches SET status='executed', executed_at=%s WHERE id=%s", (now, batch["id"]))
    return results, items


# =============================================================================
# API
# =============================================================================

def _year_or_fail(cur, campus_id):
    if campus_id is None:
        fail("Select a campus first.", 400)
    ay = active_year(cur, campus_id)
    if not ay:
        fail("No active academic year for this campus.", 400)
    return ay


def _batch(cur, batch_id, campus_id):
    cur.execute("SELECT * FROM promotion_batches WHERE id=%s", (batch_id,))
    b = cur.fetchone()
    if not b:
        fail("Promotion list not found.", 404)
    enforce_same_campus(b["campus_id"], campus_id)
    return dict(b)


def _items_view(cur, batch_id, classes):
    cls_by_id = {c["id"]: c for c in classes}
    cur.execute("""SELECT pi.*, s.first_name, s.last_name, s.enrollment_no FROM promotion_items pi
                   JOIN students s ON s.id=pi.student_id WHERE pi.batch_id=%s
                   ORDER BY s.first_name, s.last_name""", (batch_id,))
    out = []
    for r in cur.fetchall():
        d = dict(r)
        d["final_pct"] = float(d["final_pct"]) if d["final_pct"] is not None else None
        t = cls_by_id.get(d["to_class_id"])
        d["to_class_label"] = _label(t["name"], t.get("section")) if t else None
        d["student_name"] = f"{d.pop('first_name')} {d.pop('last_name')}"
        out.append(d)
    return out


@router.get("/overview")
def overview(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db),
             campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Every class of the campus with its next class, students and this year's promotion status."""
    cur = get_cur(db)
    ay = _year_or_fail(cur, campus_id)
    classes = campus_classes(cur, campus_id)
    cur.execute("SELECT * FROM promotion_batches WHERE academic_year_id=%s AND campus_id=%s AND status<>'rolled_back'",
                (ay["id"], campus_id))
    batches = {b["class_id"]: dict(b) for b in cur.fetchall()}
    rows = []
    for c in classes:
        nxt = next_level_classes(classes, c)
        b = batches.get(c["id"])
        rows.append({**c, "label": _label(c["name"], c.get("section")),
                     "next": None if nxt is None else ("graduate" if nxt == [] else ", ".join(_label(t["name"], t.get("section")) for t in nxt)),
                     "level_missing": c.get("level") is None,
                     **(lambda rs: {"results_ready": rs[0], "results_note": rs[1]})(
                         results_status(cur, ay["id"], c["id"]) if c["students"] else (False, None, None)),
                     "batch": {"id": b["id"], "status": b["status"]} if b else None,
                     "waiting_for": blocking_classes(cur, ay["id"], c, classes) if c["students"] and nxt else []})
    return ok(data={"academic_year": {**ay, "start_date": str(ay["start_date"]), "end_date": str(ay["end_date"])}, "classes": rows})


class LevelsIn(BaseModel):
    levels: dict          # {class_id: level}


@router.put("/levels")
def set_levels(body: LevelsIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db),
               campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Set class order (level) - needed before a campus can be promoted."""
    cur = get_cur(db)
    for cid, lvl in (body.levels or {}).items():
        cur.execute("SELECT campus_id FROM classes WHERE id=%s", (int(cid),))
        r = cur.fetchone()
        if not r: fail("Class not found.", 404)
        enforce_same_campus(r["campus_id"], campus_id)
        if lvl in (None, ""):
            cur.execute("UPDATE classes SET level=NULL WHERE id=%s", (int(cid),))
        else:
            if int(lvl) < 1: fail("Level must be 1 or more.", 400)
            cur.execute("UPDATE classes SET level=%s WHERE id=%s", (int(lvl), int(cid)))
    db.commit()
    return ok(message="Class order saved.")


class CreateIn(BaseModel):
    class_id: int


@router.post("/batches")
def create_batch(body: CreateIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Creates (or rebuilds, while still a draft/returned) the promotion list for a class."""
    cur = get_cur(db)
    ay = _year_or_fail(cur, campus_id)
    classes = campus_classes(cur, campus_id)
    cls = next((c for c in classes if c["id"] == body.class_id), None)
    if not cls: fail("Class not found on your campus.", 404)
    if cls.get("level") is None: fail("Set this class's level (class order) first.", 400)
    if not cls["students"]: fail("This class has no active students.", 400)
    ready, why, _ = results_status(cur, ay["id"], cls["id"])
    if not ready:
        fail(f"{_label(cls['name'], cls.get('section'))}: {why}. Promotion opens once the final results are published.", 400)
    cur.execute("SELECT * FROM promotion_batches WHERE academic_year_id=%s AND class_id=%s AND status<>'rolled_back'",
                (ay["id"], cls["id"]))
    b = cur.fetchone()
    if b and b["status"] not in ("draft", "returned"):
        fail(f"This class's promotion list is already {b['status']}.", 400)
    if b:
        batch_id = b["id"]
        cur.execute("DELETE FROM promotion_items WHERE batch_id=%s", (batch_id,))
        cur.execute("UPDATE promotion_batches SET status='draft' WHERE id=%s", (batch_id,))
    else:
        cur.execute("""INSERT INTO promotion_batches(campus_id, academic_year_id, class_id, created_by, created_at)
                       VALUES(%s,%s,%s,%s,%s) RETURNING id""",
                    (campus_id, ay["id"], cls["id"], user_id, get_processing_datetime(db)))
        batch_id = cur.fetchone()["id"]
    for it in build_items(cur, db, cls, classes, ay["id"]):
        cur.execute("""INSERT INTO promotion_items(batch_id, student_id, from_class_id, suggested_decision, decision,
                                                   to_class_id, final_pct, final_result, fee_due_months,
                                                   needs_approval, approval_reasons)
                       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (batch_id, it["student_id"], cls["id"], it["suggested"], it["decision"], it["to_class_id"],
                     it["final_pct"], it["final_result"], it["fee_due_months"], it["needs_approval"], it["reasons"]))
    db.commit()
    return ok(message="Promotion list prepared.", data={"batch_id": batch_id})


@router.get("/batches/{batch_id}")
def get_batch(batch_id: int, user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db),
              campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    classes = campus_classes(cur, b["campus_id"])
    cls = next((c for c in classes if c["id"] == b["class_id"]), {})
    nxt = next_level_classes(classes, cls) or []
    for k in ("created_at", "submitted_at", "decided_at", "executed_at", "rolled_back_at"):
        if b.get(k): b[k] = str(b[k])
    return ok(data={"batch": b, "class": {**cls, "label": _label(cls.get("name"), cls.get("section"))},
                    "targets": [{"id": t["id"], "label": _label(t["name"], t.get("section")), "capacity": t.get("capacity"),
                                 "students": t["students"]} for t in nxt],
                    "is_final_class": nxt == [],
                    "waiting_for": blocking_classes(cur, b["academic_year_id"], cls, classes),
                    "items": _items_view(cur, batch_id, classes)})


class ItemIn(BaseModel):
    decision: str                  # promote | detain | graduate
    to_class_id: Optional[int] = None
    reason: Optional[str] = None


@router.put("/batches/{batch_id}/items/{item_id}")
def update_item(batch_id: int, item_id: int, body: ItemIn, user_id: int = Depends(require_permission("exam.manage")),
                db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Coordinator changes one student's decision / section. Any change from the suggestion needs a reason + principal approval."""
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    if b["status"] not in ("draft", "returned"): fail("This list can't be changed now.", 400)
    if body.decision not in ("promote", "detain", "graduate"): fail("Decision must be promote, detain or graduate.", 400)
    cur.execute("SELECT * FROM promotion_items WHERE id=%s AND batch_id=%s", (item_id, batch_id))
    it = cur.fetchone()
    if not it: fail("Student not in this list.", 404)
    classes = campus_classes(cur, b["campus_id"])
    cls = next(c for c in classes if c["id"] == b["class_id"])
    targets = next_level_classes(classes, cls) or []
    if body.decision == "promote":
        if not targets: fail("This is the final class - use Graduate.", 400)
        if body.to_class_id not in [t["id"] for t in targets]: fail("Pick a section of the next class.", 400)
    if body.decision == "graduate" and targets:
        fail("Only the final class can graduate.", 400)
    # compartment / fee_due / no_result describe the student and stay; "override" is recomputed
    reasons = [r for r in (it["approval_reasons"] or []) if r != "override"]
    if body.decision != it["suggested_decision"]:
        if not (body.reason or "").strip(): fail("Give a reason for changing the suggested decision.", 400)
        reasons.append("override")
    moving_up = body.decision in ("promote", "graduate")
    needs = "override" in reasons or (moving_up and any(r in ("compartment", "fee_due") for r in reasons))
    cur.execute("""UPDATE promotion_items SET decision=%s, to_class_id=%s, reason=%s, needs_approval=%s,
                   approval_reasons=%s, principal_decision=NULL WHERE id=%s""",
                (body.decision, body.to_class_id if body.decision == "promote" else None,
                 (body.reason or "").strip() or None, needs, reasons, item_id))
    db.commit()
    return ok(message="Saved.")


@router.post("/batches/{batch_id}/submit")
def submit_batch(batch_id: int, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db),
                 campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    if b["status"] not in ("draft", "returned"): fail("Only a draft or returned list can be submitted.", 400)
    ready, why, _ = results_status(cur, b["academic_year_id"], b["class_id"])
    if not ready: fail(why + ". Promotion opens once the final results are published.", 400)
    cur.execute("SELECT COUNT(*) AS n FROM promotion_items WHERE batch_id=%s AND decision='promote' AND to_class_id IS NULL", (batch_id,))
    if cur.fetchone()["n"]:
        fail("Some promoted students have no section (the next class is full) - choose a section for them.", 400)
    cur.execute("""UPDATE promotion_batches SET status='submitted', submitted_by=%s, submitted_at=%s,
                   principal_comment=NULL WHERE id=%s""", (user_id, get_processing_datetime(db), batch_id))
    db.commit()
    _notify_role(cur, "principal", b["campus_id"], "Promotion List Awaiting Approval",
                 "A class promotion list is waiting for your approval.", "/promotions")
    return ok(message="Sent to the principal for approval.")


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = None


@router.post("/batches/{batch_id}/items/{item_id}/decide")
def decide_item(batch_id: int, item_id: int, body: DecideIn, user_id: int = Depends(require_permission("exam.approve")),
                db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Principal decides one 'needs approval' student (compartment / fee due / override)."""
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    if b["status"] != "submitted": fail("This list is not waiting for approval.", 400)
    cur.execute("""UPDATE promotion_items SET principal_decision=%s, principal_note=%s
                   WHERE id=%s AND batch_id=%s AND needs_approval RETURNING id""",
                ("approve" if body.approve else "reject", body.note, item_id, batch_id))
    if not cur.fetchone(): fail("This student doesn't need a separate decision.", 400)
    db.commit()
    return ok(message="Decision saved.")


class ApproveIn(BaseModel):
    comment: Optional[str] = None


@router.post("/batches/{batch_id}/approve")
def approve_batch(batch_id: int, body: ApproveIn, user_id: int = Depends(require_permission("exam.approve")),
                  db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Principal approves the list - students are moved immediately."""
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    if b["status"] != "submitted": fail("This list is not waiting for approval.", 400)
    ready, why, _ = results_status(cur, b["academic_year_id"], b["class_id"])
    if not ready: fail(why + ". Promotion opens once the final results are published.", 400)
    cur.execute("SELECT COUNT(*) AS n FROM promotion_items WHERE batch_id=%s AND needs_approval AND principal_decision IS NULL", (batch_id,))
    n = cur.fetchone()["n"]
    if n: fail(f"Decide the {n} student(s) marked 'Needs your decision' first.", 400)
    classes = campus_classes(cur, b["campus_id"])
    cls = next(c for c in classes if c["id"] == b["class_id"])
    waiting = blocking_classes(cur, b["academic_year_id"], cls, classes)
    if waiting:
        fail("Promote " + ", ".join(waiting) + " first - its students must move up before this class can move in.", 400)
    cur.execute("UPDATE promotion_batches SET decided_by=%s, decided_at=%s, principal_comment=%s WHERE id=%s",
                (user_id, get_processing_datetime(db), body.comment, batch_id))
    counts, items = execute_batch(cur, db, b, classes, user_id)
    db.commit()
    _notify_parents(cur, items, classes)
    return ok(message=f"Approved: {counts['promoted']} promoted, {counts['detained']} detained, {counts['graduated']} graduated.",
              data=counts)


class ReturnIn(BaseModel):
    comment: str


@router.post("/batches/{batch_id}/return")
def return_batch(batch_id: int, body: ReturnIn, user_id: int = Depends(require_permission("exam.approve")),
                 db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    if b["status"] != "submitted": fail("This list is not waiting for approval.", 400)
    if not (body.comment or "").strip(): fail("Add a comment for the coordinator.", 400)
    cur.execute("""UPDATE promotion_batches SET status='returned', decided_by=%s, decided_at=%s, principal_comment=%s
                   WHERE id=%s""", (user_id, get_processing_datetime(db), body.comment.strip(), batch_id))
    db.commit()
    return ok(message="Returned to the coordinator.")


@router.post("/batches/{batch_id}/rollback")
def rollback_batch(batch_id: int, user_id: int = Depends(require_permission("exam.approve")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Undoes an executed list: students go back to their class (graduates become
    active again). Refused once a lower class has already moved into this
    class's seats, or a student has moved on again.
    """
    cur = get_cur(db)
    b = _batch(cur, batch_id, campus_id)
    if b["status"] != "executed": fail("Only an executed list can be undone.", 400)
    cur.execute("SELECT is_active, closed_at FROM academic_years WHERE id=%s", (b["academic_year_id"],))
    _y = cur.fetchone()
    if not _y or not _y["is_active"] or _y.get("closed_at"):
        fail("This session is closed - its promotions are part of history and can't be undone.", 400)
    cur.execute("""SELECT 1 FROM promotion_batches pb JOIN promotion_items pi ON pi.batch_id=pb.id
                   WHERE pb.academic_year_id=%s AND pb.status='executed' AND pi.to_class_id=%s AND pb.id<>%s LIMIT 1""",
                (b["academic_year_id"], b["class_id"], batch_id))
    if cur.fetchone():
        fail("A lower class has already been promoted into this class - undo that one first.", 400)
    cur.execute("SELECT * FROM promotion_items WHERE batch_id=%s", (batch_id,))
    for it in cur.fetchall():
        if it["applied_decision"] == "promote":
            cur.execute("UPDATE students SET class_id=%s WHERE id=%s AND class_id=%s RETURNING id",
                        (it["from_class_id"], it["student_id"], it["to_class_id"]))
            if not cur.fetchone():
                fail("A student has moved again since this promotion, so it can't be undone automatically.", 400)
        elif it["applied_decision"] == "graduate":
            cur.execute("UPDATE students SET status='active' WHERE id=%s AND status='graduated'", (it["student_id"],))
    cur.execute("DELETE FROM student_class_history WHERE batch_id=%s", (batch_id,))
    cur.execute("UPDATE promotion_batches SET status='rolled_back', rolled_back_by=%s, rolled_back_at=%s WHERE id=%s",
                (user_id, get_processing_datetime(db), batch_id))
    db.commit()
    return ok(message="Promotion undone - students are back in their class.")


@router.get("/report")
def report(academic_year_id: Optional[int] = Query(None), user_id: int = Depends(require_permission("exam.view")),
           db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Promoted / detained / graduated lists for a year (from the permanent class history)."""
    cur = get_cur(db)
    ay = _year_or_fail(cur, campus_id)
    ay_id = academic_year_id or ay["id"]
    cur.execute("""SELECT h.outcome, h.final_pct, h.final_result, h.recorded_at,
                          s.first_name, s.last_name, s.enrollment_no,
                          c.name AS class_name, c.section, t.name AS to_name, t.section AS to_section
                   FROM student_class_history h JOIN students s ON s.id=h.student_id
                   JOIN classes c ON c.id=h.class_id LEFT JOIN classes t ON t.id=h.to_class_id
                   WHERE h.academic_year_id=%s AND c.campus_id=%s
                   ORDER BY c.level, c.name, c.section, s.first_name""", (ay_id, campus_id))
    lists = {"promoted": [], "detained": [], "graduated": []}
    for r in cur.fetchall():
        lists[r["outcome"]].append({"student": f"{r['first_name']} {r['last_name']}", "enrollment_no": r["enrollment_no"],
                                    "from": _label(r["class_name"], r["section"]),
                                    "to": _label(r["to_name"], r["to_section"]) if r["to_name"] else None,
                                    "final_pct": float(r["final_pct"]) if r["final_pct"] is not None else None,
                                    "final_result": r["final_result"]})
    return ok(data={"academic_year_id": ay_id, **lists})


# ---------------------------------------------------------------- notifications

def _notify_role(cur, role, campus_id, title, body, link):
    try:
        from app.utils.notify import send_notification
        import main as _main
        cur.execute("""SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
                       WHERE r.name=%s AND u.is_active AND (u.campus_id=%s OR u.campus_id IS NULL)""", (role, campus_id))
        rows = cur.fetchall()
        with _main.flask_app.app_context():
            for r in rows:
                send_notification(r["id"], title, body, "info", link)
    except Exception as e:
        print("[promotion notify]", e)


def _notify_parents(cur, items, classes):
    try:
        from app.utils.notify import send_notification
        import main as _main
        by_id = {c["id"]: c for c in classes}
        ids = [it["student_id"] for it in items]
        cur.execute("SELECT id, first_name, parent_id, user_id FROM students WHERE id = ANY(%s)", (ids or [0],))
        people = {r["id"]: r for r in cur.fetchall()}
        with _main.flask_app.app_context():
            for it in items:
                p = people.get(it["student_id"])
                if not p: continue
                d = it["_applied"]
                fr = by_id.get(it["from_class_id"], {}); to = by_id.get(it["to_class_id"], {})
                msg = (f"{p['first_name']} has been promoted to {_label(to.get('name'), to.get('section'))}." if d == "promote"
                       else f"{p['first_name']} has completed {_label(fr.get('name'), fr.get('section'))} and graduated." if d == "graduate"
                       else f"{p['first_name']} will continue in {_label(fr.get('name'), fr.get('section'))} next year.")
                for uid in (p["parent_id"], p["user_id"]):
                    if uid: send_notification(uid, "Promotion Result", msg, "info")
    except Exception as e:
        print("[promotion notify]", e)



# =============================================================================
# Start New Session (after every class is promoted)
# =============================================================================

def session_readiness(cur, campus_id, ay):
    """
    Each class that had students this year must have an EXECUTED promotion
    list (approved by the principal). Empty classes, and classes holding only
    students already promoted into them, need nothing.
    """
    classes = campus_classes(cur, campus_id)
    rows, pending = [], 0
    for c in classes:
        originals = original_occupants(cur, ay["id"], c["id"])
        b = target_batch_status(cur, ay["id"], c["id"])
        if not originals and not (b and b["status"] == "executed"):
            continue                                   # nothing to promote here
        status = b["status"] if b else "not_started"
        done = status == "executed"
        pending += 0 if done else 1
        rows.append({"class_id": c["id"], "label": _label(c["name"], c.get("section")), "level": c.get("level"),
                     "students": len(originals), "status": status, "done": done})
    rows.sort(key=lambda r: (r["done"], -(r["level"] or 0)))
    return {"classes": rows, "total": len(rows), "done": len(rows) - pending, "ready": len(rows) > 0 and pending == 0}


def _next_year_suggestion(cur, campus_id, ay):
    cur.execute("SELECT start_date, end_date FROM academic_years WHERE id=%s", (ay["id"],))
    r = cur.fetchone()
    from datetime import timedelta
    if not r or not r["start_date"] or not r["end_date"]:
        return None
    s = r["end_date"] + timedelta(days=1)
    try:
        e = r["end_date"].replace(year=r["end_date"].year + 1)
    except ValueError:                                  # 29 Feb
        e = r["end_date"] + timedelta(days=365)
    return {"name": f"{s.year}-{e.year}", "start_date": str(s), "end_date": str(e)}


def _copy_year_rows(cur, table, from_ay, to_ay):
    """Copies a year-scoped settings row (exam_config, result_formula) to the new year if it has none yet."""
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    cols = [r["column_name"] for r in cur.fetchall()]
    if not cols or "academic_year_id" not in cols:
        return False
    cur.execute(f"SELECT 1 FROM {table} WHERE academic_year_id=%s", (to_ay,))
    if cur.fetchone():
        return False
    cur.execute(f"SELECT 1 FROM {table} WHERE academic_year_id=%s", (from_ay,))
    if not cur.fetchone():
        return False
    keep = [c for c in cols if c not in ("id", "academic_year_id")]
    col_list = ", ".join(keep)
    cur.execute(f"INSERT INTO {table} (academic_year_id, {col_list}) SELECT %s, {col_list} FROM {table} WHERE academic_year_id=%s",
                (to_ay, from_ay))
    return True


def _cols(cur, table):
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    return {r["column_name"] for r in cur.fetchall()}


def _carry_syllabus(cur, from_ay, to_ay, campus_id):
    """
    New session = fresh syllabus progress. Each syllabus of the closing year (this campus)
    is copied into the new year with the same chapters/topics, sub-topic structure and
    attachments but NO progress; planned dates move forward by the gap between the years.
    The old syllabus and its progress stay untouched as history. Returns syllabi copied.
    """
    cur.execute("SELECT to_regclass('public.syllabus') AS t")
    if not cur.fetchone()["t"]:
        return 0
    cur.execute("SELECT start_date FROM academic_years WHERE id=%s", (from_ay,)); a = cur.fetchone()
    cur.execute("SELECT start_date FROM academic_years WHERE id=%s", (to_ay,)); b = cur.fetchone()
    shift = (b["start_date"] - a["start_date"]).days if a and b and a["start_date"] and b["start_date"] else 0
    cur.execute("""SELECT sy.* FROM syllabus sy JOIN classes c ON c.id=sy.class_id
                   WHERE sy.academic_year_id=%s AND c.campus_id IS NOT DISTINCT FROM COALESCE(%s, c.campus_id)""",
                (from_ay, campus_id))
    old = [dict(r) for r in cur.fetchall()]
    sy_cols = _cols(cur, "syllabus")
    tp_cols = _cols(cur, "syllabus_topics")
    copied = 0
    for s in old:
        cur.execute("SELECT 1 FROM syllabus WHERE class_id=%s AND subject_id=%s AND academic_year_id=%s",
                    (s["class_id"], s["subject_id"], to_ay))
        if cur.fetchone():
            continue                                    # already set up for the new year
        keep = [k for k in ("class_id", "subject_id", "title", "description", "created_by", "tracking_mode") if k in sy_cols]
        cur.execute(f"""INSERT INTO syllabus (academic_year_id, {", ".join(keep)}, created_at)
                        VALUES (%s, {", ".join(["%s"] * len(keep))}, now()) RETURNING id""",
                    [to_ay] + [s[k] for k in keep])
        new_sid = cur.fetchone()["id"]
        cur.execute("SELECT * FROM syllabus_topics WHERE syllabus_id=%s ORDER BY parent_id NULLS FIRST, sort_order, id", (s["id"],))
        topics = [dict(r) for r in cur.fetchall()]
        id_map = {}
        tkeep = [k for k in ("title", "description", "sort_order", "planned_week", "planned_month", "month_title", "month_group_title")
                 if k in tp_cols]
        pending = topics[:]
        while pending:                                  # parents before children
            progressed = False
            for t in list(pending):
                if t.get("parent_id") and t["parent_id"] not in id_map:
                    continue
                pdate = t.get("planned_date")
                if pdate and shift:
                    from datetime import timedelta
                    pdate = pdate + timedelta(days=shift)
                cols = ["syllabus_id"] + tkeep + (["planned_date"] if "planned_date" in tp_cols else []) + (["parent_id"] if "parent_id" in tp_cols else [])
                vals = [new_sid] + [t.get(k) for k in tkeep] + ([pdate] if "planned_date" in tp_cols else []) + \
                       ([id_map.get(t.get("parent_id"))] if "parent_id" in tp_cols else [])
                cur.execute(f"INSERT INTO syllabus_topics ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id", vals)
                id_map[t["id"]] = cur.fetchone()["id"]
                pending.remove(t); progressed = True
            if not progressed:                          # orphaned parent link: copy the rest flat
                for t in pending: t["parent_id"] = None
        if id_map and _cols(cur, "syllabus_attachments"):
            cur.execute("""INSERT INTO syllabus_attachments (topic_id, filename, url, created_at)
                           SELECT m.new_id, a.filename, a.url, now() FROM syllabus_attachments a
                           JOIN unnest(%s::int[], %s::int[]) AS m(old_id, new_id) ON m.old_id=a.topic_id""",
                        (list(id_map.keys()), list(id_map.values())))
        copied += 1
    return copied


@router.get("/session")
def session_status(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db),
                   campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    ay = _year_or_fail(cur, campus_id)
    ready = session_readiness(cur, campus_id, ay)
    cur.execute("""SELECT id, name, start_date, end_date FROM academic_years
                   WHERE campus_id IS NOT DISTINCT FROM %s AND id<>%s AND NOT is_active AND closed_at IS NULL
                     AND start_date > (SELECT start_date FROM academic_years WHERE id=%s)
                   ORDER BY start_date""", (campus_id, ay["id"], ay["id"]))
    upcoming = [{"id": r["id"], "name": r["name"], "start_date": str(r["start_date"]), "end_date": str(r["end_date"])} for r in cur.fetchall()]
    # the session card shows only once promotion is open: some class's final results are
    # published, or a promotion list already exists this session
    cur.execute("SELECT 1 FROM promotion_batches WHERE academic_year_id=%s AND status<>'rolled_back' LIMIT 1", (ay["id"],))
    has_batch = cur.fetchone() is not None
    visible = has_batch or any(results_status(cur, ay["id"], c["class_id"])[0] for c in ready["classes"])
    return ok(data={"academic_year": {"id": ay["id"], "name": ay["name"]}, **ready, "visible": visible,
                    "upcoming_years": upcoming, "suggested": _next_year_suggestion(cur, campus_id, ay)})


class NewYearIn(BaseModel):
    name: str
    start_date: str
    end_date: str


class StartSessionIn(BaseModel):
    to_year_id: Optional[int] = None        # an existing (inactive, future) year, or
    new_year: Optional[NewYearIn] = None    # create one now


@router.post("/session/start")
def start_new_session(body: StartSessionIn, user_id: int = Depends(require_permission("exam.manage")), db=Depends(get_db),
                      campus_id: Optional[int] = Depends(get_current_campus_id)):
    """
    Closes the current academic year and opens the next one for this campus.
    Only possible once every class's promotion list is approved and executed.
    History (results, attendance, fees, promotions) keeps its old year.
    """
    cur = get_cur(db)
    ay = _year_or_fail(cur, campus_id)
    ready = session_readiness(cur, campus_id, ay)
    if not ready["ready"]:
        left = [r["label"] for r in ready["classes"] if not r["done"]]
        fail("All classes must be promoted first. Still pending: " + ", ".join(left) + "." if left
             else "There are no promoted classes in this session yet.", 400)
    cur.execute("SELECT start_date, end_date FROM academic_years WHERE id=%s", (ay["id"],))
    cur_dates = cur.fetchone()

    # ---- the next year: existing or new
    if body.to_year_id:
        cur.execute("""SELECT id, name, start_date, is_active, closed_at, campus_id FROM academic_years WHERE id=%s""", (body.to_year_id,))
        ny = cur.fetchone()
        if not ny: fail("Academic year not found.", 404)
        enforce_same_campus(ny["campus_id"], campus_id)
        if ny["is_active"] or ny["closed_at"]: fail("Choose a year that is not active or closed.", 400)
        if cur_dates and ny["start_date"] and ny["start_date"] <= cur_dates["start_date"]:
            fail("The new session must start after the current one.", 400)
        new_id, new_name = ny["id"], ny["name"]
    elif body.new_year:
        y = body.new_year
        if not y.name.strip(): fail("Enter a name for the new session.", 400)
        if y.end_date <= y.start_date: fail("The end date must be after the start date.", 400)
        if cur_dates and cur_dates["end_date"] and y.start_date <= str(cur_dates["end_date"]):
            fail("The new session must start after the current one ends (" + str(cur_dates["end_date"]) + ").", 400)
        cur.execute("""SELECT 1 FROM academic_years WHERE campus_id IS NOT DISTINCT FROM %s AND lower(name)=lower(%s)""",
                    (campus_id, y.name.strip()))
        if cur.fetchone(): fail("An academic year with this name already exists.", 400)
        cur.execute("""INSERT INTO academic_years(name, start_date, end_date, is_active, campus_id)
                       VALUES(%s,%s,%s,FALSE,%s) RETURNING id""", (y.name.strip(), y.start_date, y.end_date, campus_id))
        new_id, new_name = cur.fetchone()["id"], y.name.strip()
    else:
        fail("Choose the next academic year or create one.", 400)

    now = get_processing_datetime(db)
    # ---- close the old year, open the new one (this campus only)
    cur.execute("UPDATE academic_years SET is_active=FALSE, closed_at=%s, closed_by=%s WHERE id=%s", (now, user_id, ay["id"]))
    cur.execute("UPDATE academic_years SET is_active=FALSE WHERE campus_id IS NOT DISTINCT FROM %s AND id<>%s AND is_active",
                (campus_id, new_id))
    cur.execute("UPDATE academic_years SET is_active=TRUE WHERE id=%s", (new_id,))
    # ---- classes move into the new session (students are already in their promoted classes)
    cur.execute("UPDATE classes SET academic_year_id=%s WHERE campus_id IS NOT DISTINCT FROM %s", (new_id, campus_id))
    moved = cur.rowcount
    # ---- carry exam settings forward
    copied = [t for t in ("exam_config", "result_formula") if _copy_year_rows(cur, t, ay["id"], new_id)]
    # ---- fresh syllabus progress: same syllabus, nothing covered yet
    n_syl = _carry_syllabus(cur, ay["id"], new_id, campus_id)
    if n_syl:
        copied.append(f"syllabus ({n_syl})")
    # ---- record it
    cur.execute("""SELECT COUNT(*) FILTER (WHERE outcome='promoted') AS p, COUNT(*) FILTER (WHERE outcome='detained') AS d,
                          COUNT(*) FILTER (WHERE outcome='graduated') AS g
                   FROM student_class_history h JOIN classes c ON c.id=h.class_id
                   WHERE h.academic_year_id=%s AND c.campus_id IS NOT DISTINCT FROM %s""", (ay["id"], campus_id))
    s = cur.fetchone()
    cur.execute("""INSERT INTO session_transitions(campus_id, from_year_id, to_year_id, started_by, started_at, classes_moved,
                                                   students_promoted, students_detained, students_graduated, settings_copied)
                   VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (campus_id, ay["id"], new_id, user_id, now, moved, s["p"], s["d"], s["g"], copied))
    db.commit()
    _notify_role(cur, "principal", campus_id, "New Session Started",
                 f"{ay['name']} is closed and {new_name} has started.", "/promotions")
    return ok(message=f"{ay['name']} is closed and {new_name} has started. {moved} classes moved into the new session."
                      + (f" {n_syl} syllabi carried over with progress reset." if n_syl else ""),
              data={"closed": ay["name"], "started": new_name, "classes_moved": moved,
                    "promoted": s["p"], "detained": s["d"], "graduated": s["g"], "settings_copied": copied})



# =============================================================================
# Session history (closed sessions are read-only history)
#   student -> own record      parent -> their children's records
#   teacher -> classes they teach   principal / coordinator / admin -> their campus
# =============================================================================

def _role(claims):
    roles = (claims or {}).get("roles") or []
    return roles[0] if roles else ""


def _teacher_class_ids(cur, user_id):
    cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    t = cur.fetchone()
    if not t:
        return set()
    cur.execute("SELECT class_id FROM class_teachers WHERE teacher_id=%s", (t["id"],))
    ids = {r["class_id"] for r in cur.fetchall()}
    try:
        cur.execute("SELECT class_id FROM class_subject_teacher_assignments WHERE teacher_id=%s", (t["id"],))
        ids |= {r["class_id"] for r in cur.fetchall()}
    except Exception:
        cur.connection.rollback()
    return ids


def _own_student_ids(cur, role, user_id):
    """Students the caller may see as a student / parent; None = not a student or parent."""
    if role == "student":
        cur.execute("SELECT id FROM students WHERE user_id=%s", (user_id,))
    elif role == "parent":
        cur.execute("SELECT id FROM students WHERE parent_id=%s", (user_id,))
    else:
        return None
    return {r["id"] for r in cur.fetchall()}

@router.get("/history/years")
def history_years(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db),
                  claims: dict = Depends(get_jwt_claims), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Sessions with history the caller may see, newest first."""
    cur = get_cur(db)
    role = _role(claims)
    own = _own_student_ids(cur, role, user_id)
    extra, args = "", [campus_id]
    if own is not None:
        extra, args = " AND h.student_id = ANY(%s)", [None, list(own) or [0]]
    elif role == "teacher":
        extra, args = " AND h.class_id = ANY(%s)", [campus_id, list(_teacher_class_ids(cur, user_id)) or [0]]
    cur.execute(f"""SELECT DISTINCT ay.id, ay.name, ay.start_date, ay.end_date, ay.closed_at, ay.is_active
                   FROM academic_years ay JOIN student_class_history h ON h.academic_year_id=ay.id
                   JOIN classes c ON c.id=h.class_id
                   WHERE c.campus_id IS NOT DISTINCT FROM COALESCE(%s, c.campus_id){extra}
                   ORDER BY ay.start_date DESC""", tuple(args))
    return ok(data=[{"id": r["id"], "name": r["name"], "start_date": str(r["start_date"]), "end_date": str(r["end_date"]),
                     "closed": r["closed_at"] is not None, "active": r["is_active"]} for r in cur.fetchall()])


@router.get("/history")
def history_class(year_id: int, class_id: Optional[int] = Query(None), user_id: int = Depends(require_permission("exam.view")),
                  db=Depends(get_db), claims: dict = Depends(get_jwt_claims), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Classes as they were in that year, and (with class_id) each student's outcome and results."""
    cur = get_cur(db)
    role = _role(claims)
    if role in ("student", "parent"):
        fail("Use My History to see your own records.", 403)
    allowed = _teacher_class_ids(cur, user_id) if role == "teacher" else None
    if allowed is not None and class_id and class_id not in allowed:
        fail("Record not found.", 404)
    cur.execute("SELECT id, name, start_date, end_date, campus_id FROM academic_years WHERE id=%s", (year_id,))
    ay = cur.fetchone()
    if not ay: fail("Academic year not found.", 404)
    enforce_same_campus(ay["campus_id"], campus_id)
    cur.execute("""SELECT c.id, c.name, c.section, c.level, COUNT(*) AS students
                   FROM student_class_history h JOIN classes c ON c.id=h.class_id
                   WHERE h.academic_year_id=%s AND c.campus_id IS NOT DISTINCT FROM COALESCE(%s, c.campus_id)
                   GROUP BY c.id ORDER BY c.level, c.name, c.section""", (year_id, campus_id))
    classes = [{"id": r["id"], "label": _label(r["name"], r["section"]), "students": r["students"]} for r in cur.fetchall()
               if allowed is None or r["id"] in allowed]
    students = []
    if class_id:
        cur.execute("""SELECT h.student_id, h.outcome, h.final_pct, h.final_result, s.first_name, s.last_name, s.enrollment_no,
                              t.name AS to_name, t.section AS to_section,
                              fr.grade, fr.class_position
                       FROM student_class_history h JOIN students s ON s.id=h.student_id
                       LEFT JOIN classes t ON t.id=h.to_class_id
                       LEFT JOIN final_results fr ON fr.student_id=h.student_id AND fr.academic_year_id=h.academic_year_id
                       WHERE h.academic_year_id=%s AND h.class_id=%s
                       ORDER BY fr.class_position NULLS LAST, s.first_name""", (year_id, class_id))
        for r in cur.fetchall():
            students.append({"student_id": r["student_id"], "student": f"{r['first_name']} {r['last_name']}",
                             "enrollment_no": r["enrollment_no"], "outcome": r["outcome"],
                             "to": _label(r["to_name"], r["to_section"]) if r["to_name"] else None,
                             "final_pct": float(r["final_pct"]) if r["final_pct"] is not None else None,
                             "final_result": r["final_result"], "grade": r["grade"], "position": r["class_position"]})
    return ok(data={"year": {"id": ay["id"], "name": ay["name"]}, "classes": classes, "students": students})


@router.get("/history/student/{student_id}")
def history_student(student_id: int, year_id: int, user_id: int = Depends(require_permission("exam.view")),
                    db=Depends(get_db), claims: dict = Depends(get_jwt_claims), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """One student's full record for a past session: class, exams, quizzes, assignments, final result, attendance, outcome."""
    cur = get_cur(db)
    role = _role(claims)
    own = _own_student_ids(cur, role, user_id)
    if own is not None:
        if student_id not in own: fail("Record not found.", 404)
        campus_id = None                     # their own record, whichever campus it was on
    cur.execute("SELECT id, name, start_date, end_date, campus_id FROM academic_years WHERE id=%s", (year_id,))
    ay = cur.fetchone()
    if not ay: fail("Academic year not found.", 404)
    enforce_same_campus(ay["campus_id"], campus_id)
    cur.execute("""SELECT h.*, c.name AS class_name, c.section, t.name AS to_name, t.section AS to_section,
                          s.first_name, s.last_name, s.enrollment_no, s.father_name, s.status
                   FROM student_class_history h JOIN classes c ON c.id=h.class_id JOIN students s ON s.id=h.student_id
                   LEFT JOIN classes t ON t.id=h.to_class_id
                   WHERE h.student_id=%s AND h.academic_year_id=%s""", (student_id, year_id))
    h = cur.fetchone()
    if not h: fail("No record for this student in that session.", 404)
    if role == "teacher" and h["class_id"] not in _teacher_class_ids(cur, user_id):
        fail("Record not found.", 404)
    # assignments and quizzes set for the class that session
    cur.execute("""SELECT a.id, a.title, a.due_date, a.total_marks, sub.name AS subject, s.marks, s.id AS sub_id, s.submitted_at
                   FROM assignments a LEFT JOIN subjects sub ON sub.id=a.subject_id
                   LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=%s
                   WHERE a.class_id=%s AND (a.due_date IS NULL OR a.due_date BETWEEN %s AND %s)
                   ORDER BY a.due_date NULLS LAST, a.id""", (student_id, h["class_id"], ay["start_date"], ay["end_date"]))
    assignments = []
    for r in cur.fetchall():
        st = ("graded" if r["marks"] is not None else "submitted") if r["sub_id"] else "missed"
        assignments.append({"title": r["title"], "subject": r["subject"], "due": str(r["due_date"]) if r["due_date"] else None,
                            "marks": r["marks"], "total": r["total_marks"], "status": st})
    cur.execute("""SELECT q.id, q.title, q.due_date, q.total_marks, sub.name AS subject,
                          s.marks, s.total_marks AS sub_total, s.id AS sub_id
                   FROM quizzes q LEFT JOIN subjects sub ON sub.id=q.subject_id
                   LEFT JOIN quiz_submissions s ON s.quiz_id=q.id AND s.student_id=%s
                   WHERE q.class_id=%s AND (q.due_date IS NULL OR q.due_date::date BETWEEN %s AND %s)
                   ORDER BY q.due_date NULLS LAST, q.id""", (student_id, h["class_id"], ay["start_date"], ay["end_date"]))
    quizzes = []
    for r in cur.fetchall():
        total = r["sub_total"] or r["total_marks"]
        quizzes.append({"title": r["title"], "subject": r["subject"], "due": str(r["due_date"])[:10] if r["due_date"] else None,
                        "marks": r["marks"], "total": total, "status": "taken" if r["sub_id"] else "missed",
                        "pct": round(100.0 * r["marks"] / total, 1) if r["sub_id"] and r["marks"] is not None and total else None})
    cur.execute("""SELECT e.id, e.name, e.start_date, er.percentage, er.grade, er.class_position, er.is_pass, er.is_compartment,
                          er.marks_obtained, er.total_marks,
                          (SELECT COUNT(*) FROM exam_results x WHERE x.exam_id=e.id AND x.class_id=er.class_id) AS class_size
                   FROM exam_results er JOIN exams e ON e.id=er.exam_id
                   WHERE er.student_id=%s AND e.academic_year_id=%s ORDER BY e.start_date NULLS LAST, e.id""", (student_id, year_id))
    exams = [{"exam": r["name"], "exam_id": r["id"], "pct": float(r["percentage"] or 0), "grade": r["grade"],
              "position": r["class_position"], "class_size": r["class_size"],
              "obtained": float(r["marks_obtained"] or 0), "total": float(r["total_marks"] or 0),
              "result": "pass" if r["is_pass"] else ("compartment" if r["is_compartment"] else "fail")} for r in cur.fetchall()]
    cur.execute("SELECT * FROM final_results WHERE student_id=%s AND academic_year_id=%s", (student_id, year_id))
    fr = cur.fetchone()
    final = None
    if fr:
        bd = fr["breakdown"] if isinstance(fr["breakdown"], dict) else json.loads(fr["breakdown"] or "{}")
        final = {"pct": float(fr["percentage"]), "grade": fr["grade"], "position": fr["class_position"],
                 "result": "pass" if fr["is_pass"] else ("compartment" if fr["is_compartment"] else "fail"),
                 "certificate_no": fr["certificate_no"], "rows": bd.get("rows", [])}
    cur.execute("""WITH days AS (SELECT date, BOOL_OR(lower(status) IN ('present','late')) AS here,
                                        BOOL_OR(lower(status) IN ('leave','on_leave','excused')) AS lv
                                 FROM attendance WHERE student_id=%s AND date BETWEEN %s AND %s GROUP BY date)
                   SELECT COUNT(*) AS days, COUNT(*) FILTER (WHERE here) AS present, COUNT(*) FILTER (WHERE NOT here AND lv) AS leave
                   FROM days""", (student_id, ay["start_date"], ay["end_date"]))
    a = cur.fetchone()
    attendance = {"days": a["days"], "present": a["present"], "leave": a["leave"], "absent": a["days"] - a["present"] - a["leave"],
                  "pct": round(100.0 * a["present"] / a["days"], 1) if a["days"] else None}
    return ok(data={"year": {"id": ay["id"], "name": ay["name"]},
                    "student": {"id": student_id, "name": f"{h['first_name']} {h['last_name']}", "enrollment_no": h["enrollment_no"],
                                "father_name": h["father_name"], "current_status": h["status"]},
                    "class": _label(h["class_name"], h["section"]), "outcome": h["outcome"],
                    "to": _label(h["to_name"], h["to_section"]) if h["to_name"] else None,
                    "exams": exams, "final": final, "attendance": attendance,
                    "assignments": assignments, "quizzes": quizzes})


@router.get("/history/me")
def history_me(user_id: int = Depends(require_permission("exam.view")), db=Depends(get_db),
               claims: dict = Depends(get_jwt_claims)):
    """Students: their own past sessions. Parents: each child's past sessions."""
    cur = get_cur(db)
    own = _own_student_ids(cur, _role(claims), user_id)
    if own is None:
        fail("This view is for students and parents.", 403)
    cur.execute("""SELECT h.student_id, s.first_name, s.last_name, ay.id AS year_id, ay.name AS year_name, ay.start_date,
                          c.name AS class_name, c.section, h.outcome, h.final_pct, t.name AS to_name, t.section AS to_section
                   FROM student_class_history h JOIN students s ON s.id=h.student_id
                   JOIN academic_years ay ON ay.id=h.academic_year_id JOIN classes c ON c.id=h.class_id
                   LEFT JOIN classes t ON t.id=h.to_class_id
                   WHERE h.student_id = ANY(%s) ORDER BY s.first_name, ay.start_date DESC""", (list(own) or [0],))
    kids = {}
    for r in cur.fetchall():
        k = kids.setdefault(r["student_id"], {"student_id": r["student_id"], "name": f"{r['first_name']} {r['last_name']}", "sessions": []})
        k["sessions"].append({"year_id": r["year_id"], "year": r["year_name"], "class": _label(r["class_name"], r["section"]),
                              "outcome": r["outcome"], "final_pct": float(r["final_pct"]) if r["final_pct"] is not None else None,
                              "to": _label(r["to_name"], r["to_section"]) if r["to_name"] else None})
    return ok(data=list(kids.values()))
