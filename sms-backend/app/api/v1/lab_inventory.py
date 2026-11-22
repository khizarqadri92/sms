"""
Laboratory - equipment & stock (app/api/v1/lab_inventory.py), mounted at /api/v1/laboratory

Equipment register (individual / quantity tracking) with a movement history; equipment issue & return
(request -> approve -> issue -> full / partial return with damaged & lost); consumables per lab with optional
batches & expiry; one stock engine: every change is a numbered, immutable ledger entry (previous -> resulting),
stock never goes negative, expired batches are never issued, corrections are reversals.
Lab supervisors act on the labs they supervise; Lab management (Lab Admin, admin) on all labs.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_campus import get_current_campus_id
from app.fastapi_permissions import require_any_permission
from app.utils.access import effective_permissions

router = APIRouter()

P_MANAGE = "laboratory.lab_management"
P_EQ_VIEW, P_EQ_MANAGE, P_EQ_TRANSFER, P_EQ_REQUEST, P_EQ_ISSUE, P_EQ_RETIRE = (
    "laboratory.equipment_view", "laboratory.equipment_management", "laboratory.equipment_transfer",
    "laboratory.equipment_issue_request", "laboratory.equipment_issue_return", "laboratory.equipment_retire")
P_ST_VIEW, P_ST_RECEIVE, P_ST_ISSUE, P_ST_TRANSFER, P_ST_ADJUST, P_ST_DISPOSE = (
    "laboratory.stock_view", "laboratory.stock_receive", "laboratory.stock_issue", "laboratory.stock_transfer",
    "laboratory.stock_adjust", "laboratory.stock_dispose")
EQ_ANY = (P_EQ_VIEW, P_EQ_MANAGE, P_EQ_TRANSFER, P_EQ_REQUEST, P_EQ_ISSUE, P_EQ_RETIRE, P_MANAGE)
ST_ANY = (P_ST_VIEW, P_ST_RECEIVE, P_ST_ISSUE, P_ST_TRANSFER, P_ST_ADJUST, P_ST_DISPOSE, P_MANAGE)
CONDITIONS = ("excellent", "good", "fair", "damaged")


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success", **extra):
    return {"status": "success", "message": message, "data": data, **extra}


def _plain(v):
    if isinstance(v, Decimal): return float(v)
    return v.isoformat() if hasattr(v, "isoformat") else v


def _row(r):
    return {k: _plain(v) for k, v in dict(r).items()}


def _today(db):
    try:
        from app.utils.processing_date import get_processing_date
        return get_processing_date(db)
    except Exception:
        return date.today()


def _perms(cur, user_id):
    return set(effective_permissions(cur, user_id))


def _need(cur, user_id, lab_id, perm, msg="You don't have permission to do this."):
    """perm, and either Lab management (all labs) or supervising this lab."""
    perms = _perms(cur, user_id)
    if perm not in perms and P_MANAGE not in perms:
        fail(msg, 403)
    if P_MANAGE in perms:
        return
    cur.execute("SELECT 1 FROM labs WHERE id = %s AND supervisor_user_id = %s", (lab_id, user_id))
    if not cur.fetchone():
        fail("You can do this only for the labs you supervise.", 403)


def _lab(cur, lab_id, campus_id=None, for_use=False):
    cur.execute("SELECT id, name, code, campus_id, status FROM labs WHERE id = %s", (lab_id,))
    r = cur.fetchone()
    if not r or (campus_id is not None and r["campus_id"] is not None and r["campus_id"] != campus_id):
        fail("Lab not found.", 404)
    if for_use and r["status"] == "inactive":
        fail(f"{r['name']} is inactive.", 409)
    return r


# ================================================================== equipment
EQ_SELECT = """SELECT e.*, l.name AS lab_name, l.code AS lab_code, c.name AS category,
                      (e.quantity - e.available_quantity - e.damaged_quantity) AS issued_quantity
               FROM lab_equipment e JOIN labs l ON l.id = e.lab_id LEFT JOIN lab_lookups c ON c.id = e.category_id"""


def _move(cur, eq_id, kind, by, quantity=None, from_lab=None, to_lab=None, condition=None, issue_id=None, notes=None):
    cur.execute("""INSERT INTO lab_equipment_movements (equipment_id, kind, from_lab_id, to_lab_id, quantity, condition, issue_id, notes, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", (eq_id, kind, from_lab, to_lab, quantity, condition, issue_id, notes, by))


def _restatus(cur, eq_id):
    """Recompute the status of quantity items (and normal individual items) from their counts."""
    cur.execute("SELECT * FROM lab_equipment WHERE id = %s", (eq_id,))
    e = cur.fetchone()
    if e["status"] in ("retired", "lost", "under_maintenance"):
        return
    out = e["quantity"] - e["available_quantity"] - e["damaged_quantity"]
    if e["quantity"] == 0:
        st = "retired"
    elif out > 0 and e["available_quantity"] == 0:
        st = "issued"
    elif out > 0:
        st = "partially_available"
    else:
        st = "available"
    cur.execute("UPDATE lab_equipment SET status = %s, updated_at = now() WHERE id = %s", (st, eq_id))


@router.get("/equipment")
def list_equipment(lab_id: Optional[int] = None, category_id: Optional[int] = None, status: Optional[str] = None, condition: Optional[str] = None,
                   q: Optional[str] = None, available: bool = False, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                   user_id: int = Depends(require_any_permission(*EQ_ANY)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    where, params = [], []
    if campus_id is not None: where.append("(l.campus_id = %s OR l.campus_id IS NULL)"); params.append(campus_id)
    if lab_id: where.append("e.lab_id = %s"); params.append(lab_id)
    if category_id: where.append("e.category_id = %s"); params.append(category_id)
    if status: where.append("e.status = %s"); params.append(status)
    if condition: where.append("e.condition = %s"); params.append(condition)
    if available: where.append("e.available_quantity > 0 AND e.status NOT IN ('under_maintenance', 'lost', 'retired')")
    if q:
        where.append("(e.name ILIKE %s OR e.code ILIKE %s OR e.serial_no ILIKE %s OR e.asset_tag ILIKE %s)"); params += [f"%{q.strip()}%"] * 4
    w = ("WHERE " + " AND ".join(where)) if where else ""
    cur.execute(f"SELECT COUNT(*) AS n FROM lab_equipment e JOIN labs l ON l.id = e.lab_id {w}", params)
    total = cur.fetchone()["n"]
    cur.execute(f"{EQ_SELECT} {w} ORDER BY l.name, e.name LIMIT %s OFFSET %s", params + [limit, (page - 1) * limit])
    return ok(data=[_row(r) for r in cur.fetchall()], pagination={"page": page, "limit": limit, "total": total})


@router.get("/equipment/{eq_id}")
def equipment_detail(eq_id: int, user_id: int = Depends(require_any_permission(*EQ_ANY)), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(EQ_SELECT + " WHERE e.id = %s", (eq_id,))
    e = cur.fetchone()
    if not e: fail("Equipment not found.", 404)
    d = _row(e)
    cur.execute("""SELECT m.*, fl.name AS from_lab, tl.name AS to_lab, u.first_name || ' ' || u.last_name AS by_name, i.number AS issue_number
                   FROM lab_equipment_movements m LEFT JOIN labs fl ON fl.id = m.from_lab_id LEFT JOIN labs tl ON tl.id = m.to_lab_id
                   LEFT JOIN users u ON u.id = m.created_by LEFT JOIN lab_equipment_issues i ON i.id = m.issue_id
                   WHERE m.equipment_id = %s ORDER BY m.id DESC LIMIT 200""", (eq_id,))
    d["movements"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT i.id, i.number, i.status, i.expected_return_date, it.qty_issued, it.qty_returned, it.qty_damaged, it.qty_lost
                   FROM lab_equipment_issue_items it JOIN lab_equipment_issues i ON i.id = it.issue_id
                   WHERE it.equipment_id = %s AND i.status IN ('issued', 'partially_returned') ORDER BY i.id DESC""", (eq_id,))
    d["open_issues"] = [_row(r) for r in cur.fetchall()]
    return ok(data=d)


class EquipmentIn(BaseModel):
    lab_id: int
    category_id: Optional[int] = None
    name: str
    code: str
    tracking: str = "quantity"
    quantity: int = 1
    serial_no: Optional[str] = None
    asset_tag: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    supplier_name: Optional[str] = None
    warranty_expiry: Optional[date] = None
    condition: str = "good"
    remarks: Optional[str] = None


def _unique_checks(cur, body, eq_id=None):
    for col, label in (("code", "Equipment code"), ("serial_no", "Serial number"), ("asset_tag", "Asset tag")):
        v = (getattr(body, col) or "").strip()
        if not v: continue
        cur.execute(f"SELECT name FROM lab_equipment WHERE lower({col}) = lower(%s) AND (%s::int IS NULL OR id <> %s)", (v, eq_id, eq_id))
        r = cur.fetchone()
        if r: fail(f"{label} {v} is already used by {r['name']}.", 409)


@router.post("/equipment")
def register_equipment(body: EquipmentIn, user_id: int = Depends(require_any_permission(P_EQ_MANAGE, P_MANAGE)), db=Depends(get_db),
                       campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _lab(cur, body.lab_id, campus_id, for_use=True)
    _need(cur, user_id, body.lab_id, P_EQ_MANAGE)
    name, code = (body.name or "").strip(), (body.code or "").strip().upper()
    if not name or not code: fail("Equipment name and code are required.")
    if body.tracking not in ("individual", "quantity"): fail("Tracking is individual or by quantity.")
    if body.condition not in CONDITIONS: fail("Choose a condition.")
    qty = 1 if body.tracking == "individual" else body.quantity
    if qty is None or qty < 1: fail("Quantity must be at least 1.")
    if body.tracking == "individual" and not ((body.serial_no or "").strip() or (body.asset_tag or "").strip()):
        fail("Individually tracked equipment needs a serial number or an asset tag.")
    _unique_checks(cur, body)
    dmg = qty if body.condition == "damaged" else 0
    cur.execute("""INSERT INTO lab_equipment (lab_id, category_id, name, code, tracking, quantity, available_quantity, damaged_quantity, serial_no, asset_tag,
                       manufacturer, model, purchase_date, purchase_price, supplier_name, warranty_expiry, condition, remarks, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (body.lab_id, body.category_id, name, code, body.tracking, qty, qty - dmg, dmg, (body.serial_no or "").strip() or None,
                 (body.asset_tag or "").strip() or None, body.manufacturer, body.model, body.purchase_date, body.purchase_price, body.supplier_name,
                 body.warranty_expiry, body.condition, body.remarks, user_id))
    eid = cur.fetchone()["id"]
    _move(cur, eid, "registered", user_id, quantity=qty, to_lab=body.lab_id, condition=body.condition)
    _restatus(cur, eid)
    db.commit()
    return ok(data={"id": eid}, message=f"{name} registered.")


@router.put("/equipment/{eq_id}")
def edit_equipment(eq_id: int, body: EquipmentIn, user_id: int = Depends(require_any_permission(P_EQ_MANAGE, P_MANAGE)), db=Depends(get_db)):
    """Details only - lab, quantity and status change through transfers and actions, so the history stays complete."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM lab_equipment WHERE id = %s FOR UPDATE", (eq_id,))
    e = cur.fetchone()
    if not e: fail("Equipment not found.", 404)
    _need(cur, user_id, e["lab_id"], P_EQ_MANAGE)
    name, code = (body.name or "").strip(), (body.code or "").strip().upper()
    if not name or not code: fail("Equipment name and code are required.")
    _unique_checks(cur, body, eq_id)
    cur.execute("""UPDATE lab_equipment SET category_id=%s, name=%s, code=%s, serial_no=%s, asset_tag=%s, manufacturer=%s, model=%s, purchase_date=%s,
                   purchase_price=%s, supplier_name=%s, warranty_expiry=%s, remarks=%s, updated_at=now() WHERE id=%s""",
                (body.category_id, name, code, (body.serial_no or "").strip() or None, (body.asset_tag or "").strip() or None, body.manufacturer, body.model,
                 body.purchase_date, body.purchase_price, body.supplier_name, body.warranty_expiry, body.remarks, eq_id))
    db.commit()
    return ok(message="Equipment saved.")


class EquipmentActionIn(BaseModel):
    action: str                          # transfer | damaged | maintenance_out | maintenance_in | lost | retire | condition | add_units
    quantity: Optional[int] = None
    to_lab_id: Optional[int] = None
    condition: Optional[str] = None
    notes: Optional[str] = None


@router.post("/equipment/{eq_id}/action")
def equipment_action(eq_id: int, body: EquipmentActionIn, user_id: int = Depends(require_any_permission(*EQ_ANY)), db=Depends(get_db),
                     campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM lab_equipment WHERE id = %s FOR UPDATE", (eq_id,))
    e = cur.fetchone()
    if not e: fail("Equipment not found.", 404)
    a, ind, notes = body.action, e["tracking"] == "individual", (body.notes or "").strip() or None
    if e["status"] in ("retired", "lost") and a not in ("condition",):
        fail(f"This equipment is {e['status']} - nothing more can be done with it.", 409)
    need = {"transfer": P_EQ_TRANSFER, "lost": P_EQ_RETIRE, "retire": P_EQ_RETIRE}.get(a, P_EQ_MANAGE)
    _need(cur, user_id, e["lab_id"], need)
    qty = 1 if ind else (body.quantity or 0)
    out = e["quantity"] - e["available_quantity"] - e["damaged_quantity"]
    if a == "transfer":
        if not body.to_lab_id or body.to_lab_id == e["lab_id"]: fail("Choose the lab to move it to.")
        dest = _lab(cur, body.to_lab_id, campus_id, for_use=True)
        if out > 0: fail("Some of it is issued - it can move once everything is back.", 409)
        if e["status"] == "under_maintenance": fail("It is under maintenance - move it after it's back.", 409)
        cur.execute("UPDATE lab_equipment SET lab_id = %s, updated_at = now() WHERE id = %s", (dest["id"], eq_id))
        _move(cur, eq_id, "transfer", user_id, quantity=e["quantity"], from_lab=e["lab_id"], to_lab=dest["id"], notes=notes)
        msg = f"Moved to {dest['name']}."
    elif a in ("damaged", "maintenance_out"):
        if ind:
            if e["available_quantity"] < 1: fail("It isn't in the lab right now (issued or already out of service).", 409)
            if a == "damaged":
                cur.execute("UPDATE lab_equipment SET available_quantity=0, damaged_quantity=1, condition='damaged', updated_at=now() WHERE id=%s", (eq_id,))
            else:
                cur.execute("UPDATE lab_equipment SET available_quantity=0, status='under_maintenance', updated_at=now() WHERE id=%s", (eq_id,))
        else:
            if qty < 1 or qty > e["available_quantity"]: fail(f"Enter a quantity between 1 and {e['available_quantity']} (available in the lab).")
            cur.execute("UPDATE lab_equipment SET available_quantity = available_quantity - %s, damaged_quantity = damaged_quantity + %s, updated_at=now() WHERE id=%s",
                        (qty, qty, eq_id))
        _move(cur, eq_id, a, user_id, quantity=qty, from_lab=e["lab_id"], notes=notes)
        msg = "Recorded as damaged - it can't be issued until repaired." if a == "damaged" else "Sent for maintenance - it can't be issued until it's back."
    elif a == "maintenance_in":
        cond = body.condition if body.condition in CONDITIONS and body.condition != "damaged" else "good"
        if ind:
            if e["status"] != "under_maintenance" and e["damaged_quantity"] < 1: fail("It isn't damaged or under maintenance.", 409)
            cur.execute("UPDATE lab_equipment SET available_quantity=1, damaged_quantity=0, status='available', condition=%s, updated_at=now() WHERE id=%s", (cond, eq_id))
        else:
            if qty < 1 or qty > e["damaged_quantity"]: fail(f"Enter a quantity between 1 and {e['damaged_quantity']} (out of service).")
            cur.execute("UPDATE lab_equipment SET available_quantity = available_quantity + %s, damaged_quantity = damaged_quantity - %s, updated_at=now() WHERE id=%s",
                        (qty, qty, eq_id))
        _move(cur, eq_id, "repaired", user_id, quantity=qty, condition=cond, notes=notes)
        msg = "Back in service - it can be issued again."
    elif a in ("lost", "retire"):
        if ind:
            if out > 0 and a == "retire": fail("It is issued - receive it back first.", 409)
            cur.execute("UPDATE lab_equipment SET available_quantity=0, damaged_quantity=0, status=%s, updated_at=now() WHERE id=%s",
                        ("lost" if a == "lost" else "retired", eq_id))
        else:
            pool = e["damaged_quantity"] + e["available_quantity"]
            if qty < 1 or qty > pool: fail(f"Enter a quantity between 1 and {pool} (in the lab, including out of service).")
            from_damaged = min(qty, e["damaged_quantity"])
            cur.execute("""UPDATE lab_equipment SET quantity = quantity - %s, damaged_quantity = damaged_quantity - %s,
                           available_quantity = available_quantity - %s, updated_at=now() WHERE id=%s""", (qty, from_damaged, qty - from_damaged, eq_id))
        if not notes: fail("Give a reason (it is kept in the equipment's history).")
        _move(cur, eq_id, "lost" if a == "lost" else "retired", user_id, quantity=qty, from_lab=e["lab_id"], notes=notes)
        msg = "Recorded as lost." if a == "lost" else "Retired - kept in the register's history."
    elif a == "condition":
        if body.condition not in CONDITIONS: fail("Choose a condition.")
        cur.execute("UPDATE lab_equipment SET condition=%s, updated_at=now() WHERE id=%s", (body.condition, eq_id))
        _move(cur, eq_id, "condition", user_id, condition=body.condition, notes=notes)
        msg = "Condition updated."
    elif a == "add_units":
        if ind: fail("Individually tracked equipment is registered one item at a time.")
        if qty < 1: fail("Enter how many units were added.")
        cur.execute("UPDATE lab_equipment SET quantity = quantity + %s, available_quantity = available_quantity + %s, updated_at=now() WHERE id=%s", (qty, qty, eq_id))
        _move(cur, eq_id, "quantity_adjust", user_id, quantity=qty, notes=notes)
        msg = f"{qty} unit(s) added."
    else:
        fail("Unknown action.")
    _restatus(cur, eq_id)
    db.commit()
    return ok(message=msg)


# ================================================================== issue & return
ISSUE_SELECT = """SELECT i.*, l.name AS lab_name, ru.first_name || ' ' || ru.last_name AS requested_by_name,
                         (i.status IN ('issued', 'partially_returned') AND i.expected_return_date < %s) AS overdue
                  FROM lab_equipment_issues i JOIN labs l ON l.id = i.lab_id JOIN users ru ON ru.id = i.requested_by"""


@router.get("/issues")
def list_issues(status: Optional[str] = None, lab_id: Optional[int] = None, mine: bool = False, overdue: bool = False,
                user_id: int = Depends(require_any_permission(*EQ_ANY)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    today = _today(db)
    where, params = [], [today]
    if campus_id is not None: where.append("(l.campus_id = %s OR l.campus_id IS NULL)"); params.append(campus_id)
    if status: where.append("i.status = %s"); params.append(status)
    if lab_id: where.append("i.lab_id = %s"); params.append(lab_id)
    if mine: where.append("i.requested_by = %s"); params.append(user_id)
    if overdue: where.append("i.status IN ('issued', 'partially_returned') AND i.expected_return_date < %s"); params.append(today)
    perms = _perms(cur, user_id)
    if P_MANAGE not in perms and P_EQ_ISSUE not in perms and P_EQ_VIEW not in perms:      # requesters see their own
        where.append("i.requested_by = %s"); params.append(user_id)
    w = ("WHERE " + " AND ".join(where)) if where else ""
    cur.execute(f"{ISSUE_SELECT} {w} ORDER BY i.id DESC LIMIT 300", params)
    return ok(data=[_row(r) for r in cur.fetchall()])


def _issue(cur, issue_id, today):
    cur.execute(ISSUE_SELECT + " WHERE i.id = %s", (today, issue_id))
    i = cur.fetchone()
    if not i: fail("Request not found.", 404)
    d = _row(i)
    cur.execute("""SELECT it.*, e.name, e.code, e.tracking, e.available_quantity, e.status AS equipment_status, e.condition AS equipment_condition
                   FROM lab_equipment_issue_items it JOIN lab_equipment e ON e.id = it.equipment_id WHERE it.issue_id = %s ORDER BY it.id""", (issue_id,))
    d["items"] = [_row(r) for r in cur.fetchall()]
    return d


@router.get("/issues/{issue_id}")
def issue_detail(issue_id: int, user_id: int = Depends(require_any_permission(*EQ_ANY)), db=Depends(get_db)):
    cur = get_cur(db)
    return ok(data=_issue(cur, issue_id, _today(db)))


class IssueItemIn(BaseModel):
    equipment_id: int
    quantity: int


class IssueIn(BaseModel):
    lab_id: int
    expected_return_date: date
    items: List[IssueItemIn]
    purpose: Optional[str] = None
    issued_to_name: Optional[str] = None


def _issuable(e, qty):
    if e["status"] in ("under_maintenance", "retired", "lost"):
        fail(f"{e['name']} is {e['status'].replace('_', ' ')} and can't be issued.", 409)
    if e["tracking"] == "individual" and e["condition"] == "damaged":
        fail(f"{e['name']} is damaged and can't be issued.", 409)
    if qty > e["available_quantity"]:
        fail(f"Only {e['available_quantity']} of {e['name']} available.", 409)


@router.post("/issues")
def request_issue(body: IssueIn, user_id: int = Depends(require_any_permission(P_EQ_REQUEST, P_EQ_ISSUE, P_MANAGE)), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _lab(cur, body.lab_id, campus_id, for_use=True)
    today = _today(db)
    if body.expected_return_date < today: fail("The return date can't be in the past.")
    if not body.items: fail("Add at least one item.")
    ids = [i.equipment_id for i in body.items]
    if len(ids) != len(set(ids)): fail("Each item once, please - put the total quantity on one line.")
    for it in body.items:
        cur.execute("SELECT * FROM lab_equipment WHERE id = %s", (it.equipment_id,))
        e = cur.fetchone()
        if not e or e["lab_id"] != body.lab_id: fail("Every item must belong to the chosen lab.")
        if it.quantity < 1: fail("Quantities must be at least 1.")
        _issuable(e, it.quantity)
    cur.execute("SELECT nextval('lab_issue_seq') AS n"); n = cur.fetchone()["n"]
    number = f"ISS-{today.year}-{n:04d}"
    cur.execute("""INSERT INTO lab_equipment_issues (number, lab_id, requested_by, issued_to_name, purpose, request_date, expected_return_date)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""", (number, body.lab_id, user_id, body.issued_to_name, body.purpose, today, body.expected_return_date))
    iid = cur.fetchone()["id"]
    for it in body.items:
        cur.execute("INSERT INTO lab_equipment_issue_items (issue_id, equipment_id, qty_requested) VALUES (%s,%s,%s)", (iid, it.equipment_id, it.quantity))
    db.commit()
    return ok(data={"id": iid, "number": number}, message=f"Request {number} sent to the lab supervisor.")


class DecisionIn(BaseModel):
    note: Optional[str] = None


def _issue_locked(cur, issue_id):
    cur.execute("SELECT * FROM lab_equipment_issues WHERE id = %s FOR UPDATE", (issue_id,))
    i = cur.fetchone()
    if not i: fail("Request not found.", 404)
    return i


@router.post("/issues/{issue_id}/approve")
def approve_issue(issue_id: int, body: DecisionIn, user_id: int = Depends(require_any_permission(P_EQ_ISSUE, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    i = _issue_locked(cur, issue_id)
    _need(cur, user_id, i["lab_id"], P_EQ_ISSUE)
    if i["status"] != "requested": fail("Only a new request can be approved.", 409)
    cur.execute("UPDATE lab_equipment_issues SET status='approved', approved_by=%s, approved_at=now(), decision_note=%s WHERE id=%s",
                (user_id, (body.note or "").strip() or None, issue_id))
    db.commit()
    return ok(message=f"{i['number']} approved - issue it when collected.")


@router.post("/issues/{issue_id}/reject")
def reject_issue(issue_id: int, body: DecisionIn, user_id: int = Depends(require_any_permission(P_EQ_ISSUE, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    i = _issue_locked(cur, issue_id)
    _need(cur, user_id, i["lab_id"], P_EQ_ISSUE)
    if i["status"] not in ("requested", "approved"): fail("This request can no longer be rejected.", 409)
    if not (body.note or "").strip(): fail("Give a reason for rejecting.")
    cur.execute("UPDATE lab_equipment_issues SET status='rejected', decision_note=%s, approved_by=%s, approved_at=now(), closed_at=now() WHERE id=%s",
                (body.note.strip(), user_id, issue_id))
    db.commit()
    return ok(message=f"{i['number']} rejected.")


@router.post("/issues/{issue_id}/cancel")
def cancel_issue(issue_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    i = _issue_locked(cur, issue_id)
    if i["requested_by"] != user_id: _need(cur, user_id, i["lab_id"], P_EQ_ISSUE)
    if i["status"] not in ("requested", "approved"): fail("Only a request that hasn't been issued can be cancelled.", 409)
    cur.execute("UPDATE lab_equipment_issues SET status='cancelled', closed_at=now() WHERE id=%s", (issue_id,))
    db.commit()
    return ok(message=f"{i['number']} cancelled.")


class IssueOutItem(BaseModel):
    item_id: int
    quantity: int
    condition: Optional[str] = "good"


class IssueOutIn(BaseModel):
    items: List[IssueOutItem]


@router.post("/issues/{issue_id}/issue")
def hand_over(issue_id: int, body: IssueOutIn, user_id: int = Depends(require_any_permission(P_EQ_ISSUE, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    i = _issue_locked(cur, issue_id)
    _need(cur, user_id, i["lab_id"], P_EQ_ISSUE)
    if i["status"] not in ("requested", "approved"): fail("This request has already been issued or closed.", 409)
    given = {x.item_id: x for x in body.items}
    cur.execute("SELECT * FROM lab_equipment_issue_items WHERE issue_id = %s ORDER BY id", (issue_id,))
    total = 0
    for it in cur.fetchall():
        g = given.get(it["id"])
        q = g.quantity if g else it["qty_requested"]
        if q < 0 or q > it["qty_requested"]: fail("You can issue up to the requested quantity.")
        if q == 0: continue
        cur.execute("SELECT * FROM lab_equipment WHERE id = %s FOR UPDATE", (it["equipment_id"],))
        e = cur.fetchone()
        _issuable(e, q)
        cur.execute("UPDATE lab_equipment SET available_quantity = available_quantity - %s, updated_at = now() WHERE id = %s", (q, e["id"]))
        if e["tracking"] == "individual":
            cur.execute("UPDATE lab_equipment SET status='issued' WHERE id=%s", (e["id"],))
        cur.execute("UPDATE lab_equipment_issue_items SET qty_issued = %s, issue_condition = %s WHERE id = %s",
                    (q, (g.condition if g else None) or e["condition"], it["id"]))
        _move(cur, e["id"], "issue", user_id, quantity=q, from_lab=i["lab_id"], issue_id=issue_id)
        _restatus(cur, e["id"]); total += q
    if total == 0: fail("Nothing to issue.")
    cur.execute("UPDATE lab_equipment_issues SET status='issued', issued_by=%s, issued_at=now(), approved_by=COALESCE(approved_by, %s), approved_at=COALESCE(approved_at, now()) WHERE id=%s",
                (user_id, user_id, issue_id))
    db.commit()
    return ok(message=f"{i['number']} issued ({total} item(s)).")


class ReturnItem(BaseModel):
    item_id: int
    returned: int = 0
    damaged: int = 0
    lost: int = 0
    condition: Optional[str] = None


class ReturnIn(BaseModel):
    items: List[ReturnItem]
    note: Optional[str] = None


@router.post("/issues/{issue_id}/return")
def receive_back(issue_id: int, body: ReturnIn, user_id: int = Depends(require_any_permission(P_EQ_ISSUE, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    i = _issue_locked(cur, issue_id)
    _need(cur, user_id, i["lab_id"], P_EQ_ISSUE)
    if i["status"] not in ("issued", "partially_returned"): fail("Nothing is out on this request.", 409)
    cur.execute("SELECT * FROM lab_equipment_issue_items WHERE issue_id = %s FOR UPDATE", (issue_id,))
    items = {r["id"]: r for r in cur.fetchall()}
    for x in body.items:
        it = items.get(x.item_id)
        if not it: fail("Unknown item on this request.")
        if min(x.returned, x.damaged, x.lost) < 0: fail("Quantities can't be negative.")
        outstanding = it["qty_issued"] - it["qty_returned"] - it["qty_damaged"] - it["qty_lost"]
        if x.returned + x.damaged + x.lost > outstanding:
            fail(f"Only {outstanding} still out for this item.")
        if x.returned + x.damaged + x.lost == 0: continue
        cur.execute("SELECT * FROM lab_equipment WHERE id = %s FOR UPDATE", (it["equipment_id"],))
        e = cur.fetchone()
        if e["tracking"] == "individual":
            if x.lost:
                cur.execute("UPDATE lab_equipment SET status='lost', available_quantity=0 WHERE id=%s", (e["id"],))
            elif x.damaged:
                cur.execute("UPDATE lab_equipment SET status='available', damaged_quantity=1, available_quantity=0, condition='damaged' WHERE id=%s", (e["id"],))
            else:
                cond = x.condition if x.condition in CONDITIONS and x.condition != "damaged" else e["condition"]
                cur.execute("UPDATE lab_equipment SET status='available', available_quantity=1, condition=%s WHERE id=%s", (cond, e["id"]))
        else:
            cur.execute("""UPDATE lab_equipment SET available_quantity = available_quantity + %s, damaged_quantity = damaged_quantity + %s,
                           quantity = quantity - %s WHERE id = %s""", (x.returned, x.damaged, x.lost, e["id"]))
        cur.execute("""UPDATE lab_equipment_issue_items SET qty_returned = qty_returned + %s, qty_damaged = qty_damaged + %s, qty_lost = qty_lost + %s,
                       return_condition = COALESCE(%s, return_condition) WHERE id = %s""", (x.returned, x.damaged, x.lost, x.condition, it["id"]))
        if x.returned: _move(cur, e["id"], "return", user_id, quantity=x.returned, to_lab=i["lab_id"], condition=x.condition, issue_id=issue_id, notes=body.note)
        if x.damaged: _move(cur, e["id"], "damaged", user_id, quantity=x.damaged, issue_id=issue_id, notes=body.note or "Returned damaged")
        if x.lost: _move(cur, e["id"], "lost", user_id, quantity=x.lost, issue_id=issue_id, notes=body.note or "Not returned")
        _restatus(cur, e["id"])
    cur.execute("""SELECT COALESCE(SUM(qty_issued - qty_returned - qty_damaged - qty_lost), 0) AS out FROM lab_equipment_issue_items WHERE issue_id = %s""", (issue_id,))
    left = cur.fetchone()["out"]
    cur.execute("UPDATE lab_equipment_issues SET status=%s, closed_at=CASE WHEN %s = 0 THEN now() END WHERE id=%s",
                ("returned" if left == 0 else "partially_returned", left, issue_id))
    db.commit()
    return ok(message=f"{i['number']}: " + ("everything is back - closed." if left == 0 else f"{left} item(s) still out."))


# ================================================================== consumables
def _settings(cur, campus_id):
    try:
        from app.api.v1.laboratory import settings_for
        return settings_for(cur, campus_id)
    except Exception:
        return {"near_expiry_days": 30}


CON_SELECT = """SELECT c.*, l.name AS lab_name, cat.name AS category, u.name AS unit,
                       (SELECT pi.item_name || ' (' || pi.item_code || ')' FROM procurement_items pi WHERE pi.id = c.procurement_item_id) AS procurement_item,
                       (c.min_stock > 0 AND c.current_stock <= c.min_stock) AS low_stock,
                       (SELECT COALESCE(SUM(b.quantity), 0) FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.expiry_date < %(today)s) AS expired_qty,
                       (SELECT COALESCE(SUM(b.quantity), 0) FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.expiry_date >= %(today)s
                          AND b.expiry_date <= %(soon)s) AS near_expiry_qty,
                       (SELECT MIN(b.expiry_date) FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.quantity > 0) AS next_expiry
                FROM lab_consumables c JOIN labs l ON l.id = c.lab_id LEFT JOIN lab_lookups cat ON cat.id = c.category_id LEFT JOIN lab_lookups u ON u.id = c.unit_id"""


@router.get("/consumables")
def list_consumables(lab_id: Optional[int] = None, category_id: Optional[int] = None, q: Optional[str] = None, flag: Optional[str] = None,
                     include_inactive: bool = False, user_id: int = Depends(require_any_permission(*ST_ANY)), db=Depends(get_db),
                     campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    today = _today(db); soon = today + timedelta(days=int(_settings(cur, campus_id).get("near_expiry_days") or 30))
    where, p = [], {"today": today, "soon": soon}
    if campus_id is not None: where.append("(l.campus_id = %(campus)s OR l.campus_id IS NULL)"); p["campus"] = campus_id
    if lab_id: where.append("c.lab_id = %(lab)s"); p["lab"] = lab_id
    if category_id: where.append("c.category_id = %(cat)s"); p["cat"] = category_id
    if not include_inactive: where.append("c.status = 'active'")
    if q: where.append("(c.name ILIKE %(q)s OR c.code ILIKE %(q)s)"); p["q"] = f"%{q.strip()}%"
    w = ("WHERE " + " AND ".join(where)) if where else ""
    cur.execute(f"SELECT * FROM ({CON_SELECT} {w}) x ORDER BY lab_name, name", p)
    rows = [_row(r) for r in cur.fetchall()]
    if flag == "low": rows = [r for r in rows if r["low_stock"]]
    elif flag == "expired": rows = [r for r in rows if r["expired_qty"] > 0]
    elif flag == "near_expiry": rows = [r for r in rows if r["near_expiry_qty"] > 0]
    return ok(data=rows, near_expiry_days=(soon - today).days)


@router.get("/consumables/{cid}")
def consumable_detail(cid: int, user_id: int = Depends(require_any_permission(*ST_ANY)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    today = _today(db); soon = today + timedelta(days=int(_settings(cur, campus_id).get("near_expiry_days") or 30))
    cur.execute(CON_SELECT + " WHERE c.id = %(id)s", {"today": today, "soon": soon, "id": cid})
    c = cur.fetchone()
    if not c: fail("Item not found.", 404)
    d = _row(c)
    cur.execute("SELECT *, (expiry_date < %s) AS expired FROM lab_stock_batches WHERE consumable_id = %s ORDER BY expiry_date NULLS LAST, id", (today, cid))
    d["batches"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT t.*, b.batch_no, u.first_name || ' ' || u.last_name AS by_name FROM lab_stock_transactions t
                   LEFT JOIN lab_stock_batches b ON b.id = t.batch_id LEFT JOIN users u ON u.id = t.created_by
                   WHERE t.consumable_id = %s ORDER BY t.id DESC LIMIT 200""", (cid,))
    d["ledger"] = [_row(r) for r in cur.fetchall()]
    return ok(data=d)


class ConsumableIn(BaseModel):
    lab_id: int
    category_id: Optional[int] = None
    unit_id: Optional[int] = None
    name: str
    code: str
    min_stock: float = 0
    max_stock: Optional[float] = None
    unit_price: Optional[float] = None
    supplier_name: Optional[str] = None
    storage_location: Optional[str] = None
    description: Optional[str] = None
    batch_tracked: bool = False
    status: str = "active"
    procurement_item_id: Optional[int] = None


def _check_proc_item(cur, pid):
    if not pid: return None
    cur.execute("SELECT to_regclass('public.procurement_items') AS t")
    if not cur.fetchone()["t"]: fail("Procurement items aren't available on this system.")
    cur.execute("SELECT id FROM procurement_items WHERE id = %s", (pid,))
    if not cur.fetchone(): fail("That Procurement item doesn't exist.")
    return pid


def _con_checks(cur, body, cid=None):
    name, code = (body.name or "").strip(), (body.code or "").strip().upper()
    if not name or not code: fail("Item name and code are required.")
    if body.min_stock < 0 or (body.max_stock is not None and body.max_stock < body.min_stock): fail("Maximum stock must be at least the minimum.")
    cur.execute("SELECT name FROM lab_consumables WHERE lab_id = %s AND lower(code) = lower(%s) AND (%s::int IS NULL OR id <> %s)", (body.lab_id, code, cid, cid))
    r = cur.fetchone()
    if r: fail(f"Code {code} is already used in this lab by {r['name']}.", 409)
    return name, code


@router.post("/consumables")
def create_consumable(body: ConsumableIn, user_id: int = Depends(require_any_permission(P_ST_RECEIVE, P_MANAGE)), db=Depends(get_db),
                      campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _lab(cur, body.lab_id, campus_id, for_use=True)
    _need(cur, user_id, body.lab_id, P_ST_RECEIVE)
    name, code = _con_checks(cur, body)
    pid = _check_proc_item(cur, body.procurement_item_id)
    cur.execute("""INSERT INTO lab_consumables (lab_id, category_id, unit_id, name, code, min_stock, max_stock, unit_price, supplier_name, storage_location,
                       description, batch_tracked, created_by, procurement_item_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (body.lab_id, body.category_id, body.unit_id, name, code, body.min_stock, body.max_stock, body.unit_price, body.supplier_name,
                 body.storage_location, body.description, body.batch_tracked, user_id, pid))
    i = cur.fetchone()["id"]; db.commit()
    return ok(data={"id": i}, message=f"{name} added - receive stock to fill it.")


@router.put("/consumables/{cid}")
def edit_consumable(cid: int, body: ConsumableIn, user_id: int = Depends(require_any_permission(P_ST_RECEIVE, P_ST_ADJUST, P_MANAGE)), db=Depends(get_db)):
    """Details only - stock changes only through transactions."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM lab_consumables WHERE id = %s FOR UPDATE", (cid,))
    c = cur.fetchone()
    if not c: fail("Item not found.", 404)
    _need(cur, user_id, c["lab_id"], P_ST_RECEIVE)
    body.lab_id = c["lab_id"]
    name, code = _con_checks(cur, body, cid)
    if c["batch_tracked"] != body.batch_tracked and c["current_stock"] > 0:
        fail("Batch tracking can only be switched while the item has no stock.", 409)
    if body.status not in ("active", "inactive"): fail("Status is active or inactive.")
    pid = _check_proc_item(cur, body.procurement_item_id)
    cur.execute("""UPDATE lab_consumables SET category_id=%s, unit_id=%s, name=%s, code=%s, min_stock=%s, max_stock=%s, unit_price=%s, supplier_name=%s,
                   storage_location=%s, description=%s, batch_tracked=%s, status=%s, procurement_item_id=%s, updated_at=now() WHERE id=%s""",
                (body.category_id, body.unit_id, name, code, body.min_stock, body.max_stock, body.unit_price, body.supplier_name, body.storage_location,
                 body.description, body.batch_tracked, body.status, pid, cid))
    db.commit()
    return ok(message="Item saved.")


# ------------------------------------------------------------------ the stock engine
def _lock_item(cur, cid):
    cur.execute("SELECT * FROM lab_consumables WHERE id = %s FOR UPDATE", (cid,))
    c = cur.fetchone()
    if not c: fail("Item not found.", 404)
    return c


def _post(cur, item, kind, change, by, batch=None, unit_cost=None, reference=None, reason=None, issued_to=None, session_id=None, related_id=None):
    """The ONLY place stock changes: one numbered, immutable ledger entry; item (and batch) quantities kept in step."""
    change = Decimal(str(change))
    prev = Decimal(str(item["current_stock"]))
    result = prev + change
    if result < 0:
        fail(f"Not enough {item['name']} in stock ({float(prev):g} available).", 409)
    if batch is not None:
        bq = Decimal(str(batch["quantity"])) + change
        if bq < 0: fail(f"Batch {batch['batch_no']} has only {float(batch['quantity']):g}.", 409)
        cur.execute("UPDATE lab_stock_batches SET quantity = %s WHERE id = %s", (bq, batch["id"]))
        batch["quantity"] = bq
    cur.execute("UPDATE lab_consumables SET current_stock = %s, updated_at = now() WHERE id = %s", (result, item["id"]))
    item["current_stock"] = result
    cur.execute("SELECT nextval('lab_stock_txn_seq') AS n"); n = cur.fetchone()["n"]
    cost = Decimal(str(unit_cost)) if unit_cost is not None else (Decimal(str(batch["unit_cost"])) if batch and batch.get("unit_cost") is not None else
                                                                  (Decimal(str(item["unit_price"])) if item.get("unit_price") is not None else None))
    cur.execute("""INSERT INTO lab_stock_transactions (number, kind, consumable_id, lab_id, batch_id, change, previous_qty, resulting_qty, unit_cost, total_cost,
                       reference, reason, issued_to, session_id, related_id, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, number""",
                (f"STK-{date.today().year}-{n:06d}", kind, item["id"], item["lab_id"], batch["id"] if batch else None, change, prev, result, cost,
                 (abs(change) * cost) if cost is not None else None, reference, reason, issued_to, session_id, related_id, by))
    return dict(cur.fetchone())


def _lock_batch(cur, item, batch_id):
    cur.execute("SELECT * FROM lab_stock_batches WHERE id = %s AND consumable_id = %s FOR UPDATE", (batch_id, item["id"]))
    b = cur.fetchone()
    if not b: fail("Batch not found for this item.", 404)
    return dict(b)


def _take(cur, item, qty, batch_id, today, allow_expired=False):
    """Which batch(es) to take qty from: the chosen one, or earliest-expiring unexpired first."""
    if not item["batch_tracked"]:
        return [(None, qty)]
    if batch_id:
        b = _lock_batch(cur, item, batch_id)
        if not allow_expired and b["expiry_date"] and b["expiry_date"] < today:
            fail(f"Batch {b['batch_no']} expired on {b['expiry_date']} - it can only be written off.", 409)
        return [(b, qty)]
    cur.execute("""SELECT * FROM lab_stock_batches WHERE consumable_id = %s AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= %s)
                   ORDER BY expiry_date NULLS LAST, id FOR UPDATE""", (item["id"], today))
    plan, left = [], Decimal(str(qty))
    for b in cur.fetchall():
        if left <= 0: break
        t = min(left, Decimal(str(b["quantity"])))
        plan.append((dict(b), t)); left -= t
    if left > 0:
        usable = Decimal(str(qty)) - left
        fail(f"Only {float(usable):g} of {item['name']} is usable (not expired).", 409)
    return plan


class ReceiveIn(BaseModel):
    consumable_id: int
    quantity: float
    unit_cost: Optional[float] = None
    batch_no: Optional[str] = None
    expiry_date: Optional[date] = None
    purchase_date: Optional[date] = None
    supplier_name: Optional[str] = None
    reference: Optional[str] = None          # PO / goods-received number


@router.post("/stock/receive")
def receive(body: ReceiveIn, user_id: int = Depends(require_any_permission(P_ST_RECEIVE, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    item = dict(_lock_item(cur, body.consumable_id))
    _need(cur, user_id, item["lab_id"], P_ST_RECEIVE)
    if item["status"] != "active": fail("This item is inactive.", 409)
    if body.quantity <= 0: fail("Quantity must be more than zero.")
    batch = None
    if item["batch_tracked"]:
        bno = (body.batch_no or "").strip()
        if not bno: fail("This item is tracked by batch - enter the batch number.")
        cur.execute("SELECT * FROM lab_stock_batches WHERE consumable_id = %s AND lower(batch_no) = lower(%s) FOR UPDATE", (item["id"], bno))
        b = cur.fetchone()
        if b:
            batch = dict(b)
            if body.expiry_date and batch["expiry_date"] and body.expiry_date != batch["expiry_date"]:
                fail(f"Batch {bno} already exists with expiry {batch['expiry_date']} - check the batch number.", 409)
        else:
            cur.execute("""INSERT INTO lab_stock_batches (consumable_id, batch_no, quantity, purchase_date, expiry_date, unit_cost, supplier_name, storage_location)
                           VALUES (%s,%s,0,%s,%s,%s,%s,%s) RETURNING *""", (item["id"], bno, body.purchase_date, body.expiry_date, body.unit_cost,
                                                                         body.supplier_name or item["supplier_name"], item["storage_location"]))
            batch = dict(cur.fetchone())
    t = _post(cur, item, "receipt", body.quantity, user_id, batch=batch, unit_cost=body.unit_cost, reference=(body.reference or "").strip() or None,
              reason=("Supplier: " + body.supplier_name) if body.supplier_name else None)
    db.commit()
    return ok(data=t, message=f"{t['number']}: received {body.quantity:g}. Stock now {float(item['current_stock']):g}.")


class OutIn(BaseModel):
    consumable_id: int
    quantity: float
    kind: str = "issue"                      # issue | consumption | damage | expiry | disposal | return
    batch_id: Optional[int] = None
    issued_to: Optional[str] = None
    reason: Optional[str] = None
    reference: Optional[str] = None
    session_id: Optional[int] = None


@router.post("/stock/out")
def stock_out(body: OutIn, user_id: int = Depends(require_any_permission(P_ST_ISSUE, P_ST_DISPOSE, P_MANAGE)), db=Depends(get_db)):
    """issue / consumption / damage / expiry / disposal take stock out; return puts unused stock back."""
    cur = get_cur(db)
    item = dict(_lock_item(cur, body.consumable_id))
    perm = P_ST_DISPOSE if body.kind in ("damage", "expiry", "disposal") else P_ST_ISSUE
    if body.kind not in ("issue", "consumption", "damage", "expiry", "disposal", "return"): fail("Unknown stock movement.")
    _need(cur, user_id, item["lab_id"], perm)
    if body.quantity <= 0: fail("Quantity must be more than zero.")
    if body.kind in ("damage", "expiry", "disposal") and not (body.reason or "").strip(): fail("Give a reason (it is kept in the ledger).")
    today = _today(db)
    if body.kind == "return":
        batch = _lock_batch(cur, item, body.batch_id) if item["batch_tracked"] else None
        if item["batch_tracked"] and not body.batch_id: fail("Choose the batch the stock goes back to.")
        ts = [_post(cur, item, "return", body.quantity, user_id, batch=batch, reason=body.reason, reference=body.reference, session_id=body.session_id)]
    else:
        if item["batch_tracked"] and body.kind in ("damage", "expiry", "disposal") and not body.batch_id:
            fail("Choose the batch being written off.")
        plan = _take(cur, item, body.quantity, body.batch_id, today, allow_expired=body.kind in ("expiry", "disposal", "damage"))
        ts = [_post(cur, item, body.kind, -q, user_id, batch=b, issued_to=body.issued_to, reason=body.reason, reference=body.reference, session_id=body.session_id)
              for b, q in plan]
    db.commit()
    return ok(data=ts, message=f"{', '.join(t['number'] for t in ts)}: stock now {float(item['current_stock']):g}.")


class TransferIn(BaseModel):
    consumable_id: int
    to_lab_id: int
    quantity: float
    batch_id: Optional[int] = None
    reason: Optional[str] = None


@router.post("/stock/transfer")
def transfer(body: TransferIn, user_id: int = Depends(require_any_permission(P_ST_TRANSFER, P_MANAGE)), db=Depends(get_db),
             campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Both halves in one transaction: out of this lab, into the same item (same code) in the other lab."""
    cur = get_cur(db)
    item = dict(_lock_item(cur, body.consumable_id))
    _need(cur, user_id, item["lab_id"], P_ST_TRANSFER)
    if body.to_lab_id == item["lab_id"]: fail("Choose a different lab.")
    dest_lab = _lab(cur, body.to_lab_id, campus_id, for_use=True)
    src_lab = _lab(cur, item["lab_id"])
    if body.quantity <= 0: fail("Quantity must be more than zero.")
    cur.execute("SELECT id FROM lab_consumables WHERE lab_id = %s AND lower(code) = lower(%s)", (body.to_lab_id, item["code"]))
    r = cur.fetchone()
    if r:
        dest = dict(_lock_item(cur, r["id"]))
        if dest["batch_tracked"] != item["batch_tracked"]: fail(f"{dest_lab['name']} tracks this item differently (batches) - align them first.", 409)
    else:
        cur.execute("""INSERT INTO lab_consumables (lab_id, category_id, unit_id, name, code, min_stock, max_stock, unit_price, supplier_name, description,
                           batch_tracked, created_by) SELECT %s, category_id, unit_id, name, code, 0, NULL, unit_price, supplier_name, description, batch_tracked, %s
                       FROM lab_consumables WHERE id = %s RETURNING id""", (body.to_lab_id, user_id, item["id"]))
        dest = dict(_lock_item(cur, cur.fetchone()["id"]))
    today = _today(db)
    plan = _take(cur, item, body.quantity, body.batch_id, today)
    pairs = []
    for b, q in plan:
        out_t = _post(cur, item, "transfer_out", -q, user_id, batch=b, reason=body.reason, reference=f"To {dest_lab['name']}")
        dest_b = None
        if b is not None:
            cur.execute("SELECT * FROM lab_stock_batches WHERE consumable_id = %s AND lower(batch_no) = lower(%s) FOR UPDATE", (dest["id"], b["batch_no"]))
            x = cur.fetchone()
            if x: dest_b = dict(x)
            else:
                cur.execute("""INSERT INTO lab_stock_batches (consumable_id, batch_no, quantity, purchase_date, expiry_date, unit_cost, supplier_name)
                               VALUES (%s,%s,0,%s,%s,%s,%s) RETURNING *""", (dest["id"], b["batch_no"], b["purchase_date"], b["expiry_date"], b["unit_cost"], b["supplier_name"]))
                dest_b = dict(cur.fetchone())
        in_t = _post(cur, dest, "transfer_in", q, user_id, batch=dest_b, reason=body.reason, reference=f"From {src_lab['name']} ({out_t['number']})", related_id=out_t["id"])
        pairs.append((out_t["number"], in_t["number"]))
    db.commit()
    return ok(message=f"Transferred {body.quantity:g} to {dest_lab['name']} ({', '.join(a + ' / ' + b for a, b in pairs)}).")


class AdjustIn(BaseModel):
    consumable_id: int
    counted_quantity: float                 # what is actually there (stock count)
    batch_id: Optional[int] = None
    reason: str


@router.post("/stock/adjust")
def adjust(body: AdjustIn, user_id: int = Depends(require_any_permission(P_ST_ADJUST, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    item = dict(_lock_item(cur, body.consumable_id))
    _need(cur, user_id, item["lab_id"], P_ST_ADJUST)
    if not (body.reason or "").strip(): fail("An adjustment needs a reason.")
    if body.counted_quantity < 0: fail("The counted quantity can't be negative.")
    batch = None
    if item["batch_tracked"]:
        if not body.batch_id: fail("Choose the batch you counted.")
        batch = _lock_batch(cur, item, body.batch_id)
        change = Decimal(str(body.counted_quantity)) - Decimal(str(batch["quantity"]))
    else:
        change = Decimal(str(body.counted_quantity)) - Decimal(str(item["current_stock"]))
    if change == 0: return ok(message="The count matches the stock - nothing to adjust.")
    t = _post(cur, item, "adjustment", change, user_id, batch=batch, reason=body.reason.strip())
    db.commit()
    return ok(data=t, message=f"{t['number']}: adjusted by {float(change):+g}. Stock now {float(item['current_stock']):g}.")


class ReverseIn(BaseModel):
    reason: str


@router.post("/stock/transactions/{txn_id}/reverse")
def reverse(txn_id: int, body: ReverseIn, user_id: int = Depends(require_any_permission(P_ST_ADJUST, P_MANAGE)), db=Depends(get_db)):
    """Correct a mistake without editing history: an opposite entry (both halves for a transfer)."""
    cur = get_cur(db)
    if not (body.reason or "").strip(): fail("Give the reason for the correction.")
    cur.execute("SELECT * FROM lab_stock_transactions WHERE id = %s", (txn_id,))
    t = cur.fetchone()
    if not t: fail("Transaction not found.", 404)
    if t["kind"] == "reversal": fail("A reversal can't itself be reversed - record a new transaction instead.", 409)
    cur.execute("SELECT number FROM lab_stock_transactions WHERE kind = 'reversal' AND related_id = %s", (txn_id,))
    r = cur.fetchone()
    if r: fail(f"Already reversed by {r['number']}.", 409)
    group = [dict(t)]
    if t["kind"] == "transfer_out":
        cur.execute("SELECT * FROM lab_stock_transactions WHERE related_id = %s AND kind = 'transfer_in'", (txn_id,)); group += [dict(x) for x in cur.fetchall()]
    elif t["kind"] == "transfer_in":
        fail("Reverse the transfer from its 'transfer out' entry (both halves are corrected together).", 409)
    done = []
    for x in sorted(group, key=lambda g: g["change"]):          # put stock back before taking it from the other lab
        item = dict(_lock_item(cur, x["consumable_id"]))
        _need(cur, user_id, item["lab_id"], P_ST_ADJUST)
        batch = _lock_batch(cur, item, x["batch_id"]) if x["batch_id"] else None
        rt = _post(cur, item, "reversal", -Decimal(str(x["change"])), user_id, batch=batch, reason=body.reason.strip(),
                   reference=f"Reverses {x['number']}", related_id=x["id"])
        done.append(rt["number"])
    db.commit()
    return ok(message=f"Reversed by {', '.join(done)}.")


@router.get("/stock/transactions")
def transactions(lab_id: Optional[int] = None, consumable_id: Optional[int] = None, kind: Optional[str] = None, date_from: Optional[date] = None,
                 date_to: Optional[date] = None, q: Optional[str] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                 user_id: int = Depends(require_any_permission(*ST_ANY)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    where, params = [], []
    if campus_id is not None: where.append("(l.campus_id = %s OR l.campus_id IS NULL)"); params.append(campus_id)
    if lab_id: where.append("t.lab_id = %s"); params.append(lab_id)
    if consumable_id: where.append("t.consumable_id = %s"); params.append(consumable_id)
    if kind: where.append("t.kind = %s"); params.append(kind)
    if date_from: where.append("t.created_at >= %s"); params.append(date_from)
    if date_to: where.append("t.created_at < %s"); params.append(date_to + timedelta(days=1))
    if q: where.append("(t.number ILIKE %s OR c.name ILIKE %s OR t.reference ILIKE %s)"); params += [f"%{q.strip()}%"] * 3
    w = ("WHERE " + " AND ".join(where)) if where else ""
    base = f"""FROM lab_stock_transactions t JOIN lab_consumables c ON c.id = t.consumable_id JOIN labs l ON l.id = t.lab_id
               LEFT JOIN lab_stock_batches b ON b.id = t.batch_id LEFT JOIN users u ON u.id = t.created_by {w}"""
    cur.execute(f"SELECT COUNT(*) AS n {base}", params); total = cur.fetchone()["n"]
    cur.execute(f"""SELECT t.*, c.name AS item, c.code AS item_code, l.name AS lab_name, b.batch_no, u.first_name || ' ' || u.last_name AS by_name,
                           EXISTS (SELECT 1 FROM lab_stock_transactions r WHERE r.kind = 'reversal' AND r.related_id = t.id) AS reversed
                    {base} ORDER BY t.id DESC LIMIT %s OFFSET %s""", params + [limit, (page - 1) * limit])
    return ok(data=[_row(r) for r in cur.fetchall()], pagination={"page": page, "limit": limit, "total": total})


# ================================================================== Procurement goods received -> lab stock
@router.get("/procurement-items")
def procurement_items(q: Optional[str] = None, user_id: int = Depends(require_any_permission(P_ST_RECEIVE, P_MANAGE)), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT to_regclass('public.procurement_items') AS t")
    if not cur.fetchone()["t"]: return ok(data=[])
    cur.execute("""SELECT id, item_name, item_code FROM procurement_items WHERE (%s::text IS NULL OR item_name ILIKE %s OR item_code ILIKE %s)
                   ORDER BY item_name LIMIT 50""", (q, f"%{(q or '').strip()}%", f"%{(q or '').strip()}%"))
    return ok(data=[dict(r) for r in cur.fetchall()])


PENDING_SQL = """
    SELECT gi.id AS grn_item_id, g.grn_number, g.received_date, po.po_number, gi.quantity_received, gi.condition,
           poi.item_description, poi.unit, poi.unit_price, pri.item_id AS procurement_item_id,
           c.id AS consumable_id, c.name AS consumable, c.code, c.batch_tracked, c.lab_id, l.name AS lab_name, l.supervisor_user_id
    FROM grn_items gi
    JOIN goods_receipt_notes g ON g.id = gi.grn_id AND g.status = 'confirmed'
    JOIN purchase_orders po ON po.id = g.po_id
    JOIN po_items poi ON poi.id = gi.po_item_id
    JOIN pr_items pri ON pri.id = poi.pr_item_id
    JOIN lab_consumables c ON c.procurement_item_id = pri.item_id AND c.status = 'active'
    JOIN labs l ON l.id = c.lab_id AND l.status <> 'inactive'
    WHERE NOT EXISTS (SELECT 1 FROM lab_grn_receipts r WHERE r.grn_item_id = gi.id)
      AND (%(campus)s::int IS NULL OR l.campus_id = %(campus)s OR l.campus_id IS NULL)"""


def _procurement_ready(cur):
    cur.execute("SELECT to_regclass('public.goods_receipt_notes') IS NOT NULL AND to_regclass('public.pr_items') IS NOT NULL AS ok")
    return cur.fetchone()["ok"]


@router.get("/grn-pending")
def grn_pending(user_id: int = Depends(require_any_permission(P_ST_RECEIVE, P_ST_VIEW, P_MANAGE)), db=Depends(get_db),
                campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Confirmed Procurement goods-received lines for items linked to lab consumables, not yet in lab stock."""
    cur = get_cur(db)
    if not _procurement_ready(cur): return ok(data=[])
    perms = _perms(cur, user_id)
    cur.execute(PENDING_SQL + " ORDER BY g.received_date, g.grn_number, gi.id", {"campus": campus_id})
    lines = {}
    for r in cur.fetchall():
        d = _row(r)
        line = lines.setdefault(d["grn_item_id"], {k: d[k] for k in ("grn_item_id", "grn_number", "received_date", "po_number", "quantity_received", "condition",
                                                                     "item_description", "unit", "unit_price")} | {"targets": []})
        can = P_MANAGE in perms or (P_ST_RECEIVE in perms and d["supervisor_user_id"] == user_id)
        line["targets"].append({"consumable_id": d["consumable_id"], "name": d["consumable"], "code": d["code"], "lab_id": d["lab_id"],
                                "lab_name": d["lab_name"], "batch_tracked": d["batch_tracked"], "can_receive": can})
    return ok(data=list(lines.values()))


class GrnReceiveIn(BaseModel):
    consumable_id: int
    batch_no: Optional[str] = None
    expiry_date: Optional[date] = None


@router.post("/grn-pending/{grn_item_id}/receive")
def grn_receive(grn_item_id: int, body: GrnReceiveIn, user_id: int = Depends(require_any_permission(P_ST_RECEIVE, P_MANAGE)), db=Depends(get_db),
                campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    if not _procurement_ready(cur): fail("Procurement isn't available on this system.")
    cur.execute("SELECT 1 FROM lab_grn_receipts WHERE grn_item_id = %s", (grn_item_id,))
    if cur.fetchone(): fail("This goods-received line is already in lab stock.", 409)
    cur.execute(PENDING_SQL + " AND gi.id = %(gi)s AND c.id = %(cid)s", {"campus": campus_id, "gi": grn_item_id, "cid": body.consumable_id})
    line = cur.fetchone()
    if not line: fail("This line isn't waiting for that lab item (not confirmed, not linked, or already received).", 409)
    item = dict(_lock_item(cur, body.consumable_id))
    _need(cur, user_id, item["lab_id"], P_ST_RECEIVE)
    qty = Decimal(str(line["quantity_received"]))
    if qty <= 0: fail("Nothing was received on this line.")
    batch = None
    if item["batch_tracked"]:
        bno = (body.batch_no or "").strip()
        if not bno: fail("This item is tracked by batch - enter the batch number (and expiry date) from the package.")
        cur.execute("SELECT * FROM lab_stock_batches WHERE consumable_id = %s AND lower(batch_no) = lower(%s) FOR UPDATE", (item["id"], bno))
        b = cur.fetchone()
        if b: batch = dict(b)
        else:
            cur.execute("""INSERT INTO lab_stock_batches (consumable_id, batch_no, quantity, purchase_date, expiry_date, unit_cost, storage_location)
                           VALUES (%s,%s,0,%s,%s,%s,%s) RETURNING *""", (item["id"], bno, line["received_date"], body.expiry_date, line["unit_price"], item["storage_location"]))
            batch = dict(cur.fetchone())
    t = _post(cur, item, "receipt", qty, user_id, batch=batch, unit_cost=line["unit_price"], reference=line["grn_number"],
              reason=f"Goods received - PO {line['po_number']}" + (f" (condition: {line['condition']})" if line["condition"] and line["condition"] != "good" else ""))
    try:
        cur.execute("INSERT INTO lab_grn_receipts (grn_item_id, consumable_id, transaction_id, quantity, received_by) VALUES (%s,%s,%s,%s,%s)",
                    (grn_item_id, item["id"], t["id"], qty, user_id))
    except Exception:
        db.rollback(); fail("This goods-received line was just received by someone else.", 409)
    db.commit()
    return ok(data=t, message=f"{t['number']}: {float(qty):g} received into {item['name']} from {line['grn_number']}. Stock now {float(item['current_stock']):g}.")


# ================================================================== dashboard graphs (Lab Admin: all labs; supervisors: their labs)
@router.get("/dashboard/charts")
def dashboard_charts(user_id: int = Depends(require_any_permission(*(EQ_ANY + ST_ANY), "laboratory.lab_view", "laboratory.own_lab_management")),
                     db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    perms = _perms(cur, user_id)
    today = _today(db); soon = today + timedelta(days=int(_settings(cur, campus_id).get("near_expiry_days") or 30))
    if P_MANAGE in perms or "laboratory.lab_view" in perms and "laboratory.own_lab_management" not in perms:
        cur.execute("SELECT id FROM labs WHERE status <> 'inactive' AND (%s::int IS NULL OR campus_id = %s OR campus_id IS NULL)", (campus_id, campus_id))
        scope = "all"
    else:
        cur.execute("SELECT id FROM labs WHERE supervisor_user_id = %s AND status <> 'inactive'", (user_id,))
        scope = "mine"
    labs = [r["id"] for r in cur.fetchall()] or [-1]
    p = {"labs": labs, "today": today, "soon": soon}
    out = {"scope": scope, "lab_count": 0 if labs == [-1] else len(labs), "today": today.isoformat()}

    cur.execute("""SELECT status, COUNT(*) AS items, COALESCE(SUM(quantity), 0) AS units FROM lab_equipment
                   WHERE lab_id = ANY(%(labs)s) GROUP BY status ORDER BY items DESC""", p)
    out["equipment_by_status"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT l.name, COALESCE(SUM(e.available_quantity) FILTER (WHERE e.status NOT IN ('under_maintenance', 'lost', 'retired')), 0) AS available,
                          COALESCE(SUM(e.quantity - e.available_quantity - e.damaged_quantity) FILTER (WHERE e.status NOT IN ('lost', 'retired', 'under_maintenance')), 0) AS issued,
                          COALESCE(SUM(e.damaged_quantity), 0) + COALESCE(SUM(e.quantity) FILTER (WHERE e.status = 'under_maintenance'), 0) AS out_of_service
                   FROM labs l LEFT JOIN lab_equipment e ON e.lab_id = l.id AND e.status NOT IN ('lost', 'retired')
                   WHERE l.id = ANY(%(labs)s) GROUP BY l.id, l.name ORDER BY l.name""", p)
    out["equipment_by_lab"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT
          COUNT(*) FILTER (WHERE x.expired) AS expired,
          COUNT(*) FILTER (WHERE NOT x.expired AND x.low) AS low,
          COUNT(*) FILTER (WHERE NOT x.expired AND NOT x.low AND x.near) AS near_expiry,
          COUNT(*) FILTER (WHERE NOT x.expired AND NOT x.low AND NOT x.near) AS ok
        FROM (SELECT c.id, (c.min_stock > 0 AND c.current_stock <= c.min_stock) AS low,
                     EXISTS (SELECT 1 FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.quantity > 0 AND b.expiry_date < %(today)s) AS expired,
                     EXISTS (SELECT 1 FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.quantity > 0 AND b.expiry_date BETWEEN %(today)s AND %(soon)s) AS near
              FROM lab_consumables c WHERE c.status = 'active' AND c.lab_id = ANY(%(labs)s)) x""", p)
    out["stock_health"] = _row(cur.fetchone())
    cur.execute("""SELECT to_char(m, 'Mon YYYY') AS month,
                          COUNT(t.id) FILTER (WHERE t.kind IN ('receipt', 'transfer_in', 'return')) AS received,
                          COUNT(t.id) FILTER (WHERE t.kind IN ('issue', 'consumption')) AS used,
                          COUNT(t.id) FILTER (WHERE t.kind IN ('damage', 'expiry', 'disposal')) AS written_off
                   FROM generate_series(date_trunc('month', %(today)s::date) - interval '5 months', date_trunc('month', %(today)s::date), interval '1 month') m
                   LEFT JOIN lab_stock_transactions t ON date_trunc('month', t.created_at) = m AND t.lab_id = ANY(%(labs)s)
                   GROUP BY m ORDER BY m""", p)
    out["stock_activity"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT c.name, l.name AS lab, u.name AS unit, SUM(-t.change) AS used FROM lab_stock_transactions t
                   JOIN lab_consumables c ON c.id = t.consumable_id JOIN labs l ON l.id = t.lab_id LEFT JOIN lab_lookups u ON u.id = c.unit_id
                   WHERE t.kind IN ('issue', 'consumption') AND t.created_at >= %(today)s::date - 90 AND t.lab_id = ANY(%(labs)s)
                   GROUP BY c.id, c.name, l.name, u.name ORDER BY used DESC LIMIT 6""", p)
    out["top_used"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT status, COUNT(*) AS n FROM lab_equipment_issues WHERE lab_id = ANY(%(labs)s) AND request_date >= %(today)s::date - 180
                   GROUP BY status""", p)
    out["requests_by_status"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT i.id, i.number, l.name AS lab, i.expected_return_date, ru.first_name || ' ' || ru.last_name AS requested_by
                   FROM lab_equipment_issues i JOIN labs l ON l.id = i.lab_id JOIN users ru ON ru.id = i.requested_by
                   WHERE i.status IN ('issued', 'partially_returned') AND i.expected_return_date < %(today)s AND i.lab_id = ANY(%(labs)s)
                   ORDER BY i.expected_return_date LIMIT 8""", p)
    out["overdue"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT c.id, c.name, l.name AS lab, c.current_stock, c.min_stock, u.name AS unit FROM lab_consumables c
                   JOIN labs l ON l.id = c.lab_id LEFT JOIN lab_lookups u ON u.id = c.unit_id
                   WHERE c.status = 'active' AND c.min_stock > 0 AND c.current_stock <= c.min_stock AND c.lab_id = ANY(%(labs)s)
                   ORDER BY c.current_stock / NULLIF(c.min_stock, 0), c.name LIMIT 8""", p)
    out["low_stock"] = [_row(r) for r in cur.fetchall()]
    cur.execute("""SELECT c.id, c.name, l.name AS lab, b.batch_no, b.expiry_date, b.quantity FROM lab_stock_batches b
                   JOIN lab_consumables c ON c.id = b.consumable_id JOIN labs l ON l.id = c.lab_id
                   WHERE b.quantity > 0 AND b.expiry_date <= %(soon)s AND c.lab_id = ANY(%(labs)s) ORDER BY b.expiry_date LIMIT 8""", p)
    out["expiring"] = [_row(r) for r in cur.fetchall()]
    cur.execute("SELECT COUNT(*) AS n FROM lab_equipment_issues WHERE status = 'requested' AND lab_id = ANY(%(labs)s)", p)
    out["pending_requests"] = cur.fetchone()["n"]
    return ok(data=out)


# ================================================================== suppliers (Procurement vendors when available) + summary
@router.get("/suppliers")
def suppliers(user_id: int = Depends(require_any_permission(*(EQ_ANY + ST_ANY))), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT table_name, string_agg(column_name, ',') AS cols FROM information_schema.columns WHERE table_schema = 'public'
                   AND table_name IN ('procurement_vendors', 'vendors') GROUP BY table_name ORDER BY table_name = 'procurement_vendors' DESC""")
    for r in cur.fetchall():
        cols = r["cols"].split(",")
        name_col = next((c for c in ("name", "vendor_name", "company_name") if c in cols), None)
        if name_col:
            active = " WHERE COALESCE(is_active, TRUE)" if "is_active" in cols else ""
            cur.execute(f"SELECT id, {name_col} AS name FROM {r['table_name']}{active} ORDER BY {name_col} LIMIT 500")
            return ok(data=[dict(x) for x in cur.fetchall()], source="procurement")
    return ok(data=[], source="none")


@router.get("/inventory/summary")
def inventory_summary(lab_id: Optional[int] = None, user_id: int = Depends(get_current_user_id), db=Depends(get_db),
                      campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Dashboard figures for equipment and stock (each part only for people who may see it)."""
    cur = get_cur(db)
    perms = _perms(cur, user_id)
    today = _today(db); soon = today + timedelta(days=int(_settings(cur, campus_id).get("near_expiry_days") or 30))
    lab_f = "AND (%(campus)s::int IS NULL OR l.campus_id = %(campus)s OR l.campus_id IS NULL) AND (%(lab)s::int IS NULL OR l.id = %(lab)s)"
    p = {"campus": campus_id, "lab": lab_id, "today": today, "soon": soon}
    out = {}
    if perms & set(EQ_ANY):
        cur.execute(f"""SELECT COALESCE(SUM(e.quantity), 0) AS total_units, COUNT(*) AS items,
                               COALESCE(SUM(e.available_quantity) FILTER (WHERE e.status NOT IN ('under_maintenance', 'lost', 'retired')), 0) AS available_units,
                               COALESCE(SUM(e.quantity - e.available_quantity - e.damaged_quantity) FILTER (WHERE e.status NOT IN ('lost', 'retired', 'under_maintenance')), 0) AS issued_units,
                               COUNT(*) FILTER (WHERE e.status = 'under_maintenance') + COALESCE(SUM(e.damaged_quantity), 0) AS out_of_service
                        FROM lab_equipment e JOIN labs l ON l.id = e.lab_id WHERE e.status NOT IN ('retired', 'lost') {lab_f}""", p)
        out["equipment"] = _row(cur.fetchone())
        cur.execute(f"""SELECT e.status AS name, COUNT(*) AS n FROM lab_equipment e JOIN labs l ON l.id = e.lab_id WHERE TRUE {lab_f} GROUP BY 1 ORDER BY 2 DESC""", p)
        out["equipment_by_status"] = [_row(r) for r in cur.fetchall()]
        cur.execute(f"""SELECT COUNT(*) AS n FROM lab_equipment_issues i JOIN labs l ON l.id = i.lab_id
                        WHERE i.status IN ('issued', 'partially_returned') AND i.expected_return_date < %(today)s {lab_f}""", p)
        out["overdue_returns"] = cur.fetchone()["n"]
        cur.execute(f"""SELECT COUNT(*) AS n FROM lab_equipment_issues i JOIN labs l ON l.id = i.lab_id WHERE i.status = 'requested' {lab_f}""", p)
        out["pending_requests"] = cur.fetchone()["n"]
    if perms & set(ST_ANY):
        cur.execute(f"""SELECT COUNT(*) FILTER (WHERE c.min_stock > 0 AND c.current_stock <= c.min_stock) AS low_stock,
                               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.quantity > 0 AND b.expiry_date < %(today)s)) AS expired,
                               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lab_stock_batches b WHERE b.consumable_id = c.id AND b.quantity > 0
                                                AND b.expiry_date >= %(today)s AND b.expiry_date <= %(soon)s)) AS near_expiry,
                               COUNT(*) AS items
                        FROM lab_consumables c JOIN labs l ON l.id = c.lab_id WHERE c.status = 'active' {lab_f}""", p)
        out["stock"] = _row(cur.fetchone())
        if _procurement_ready(cur):
            cur.execute("SELECT COUNT(DISTINCT x.grn_item_id) AS n FROM (" + PENDING_SQL + ") x", {"campus": campus_id})
            out["stock"]["grn_pending"] = cur.fetchone()["n"]
    return ok(data=out)
