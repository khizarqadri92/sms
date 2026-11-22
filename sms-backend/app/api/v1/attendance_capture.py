"""
Student attendance capture (app/api/v1/attendance_capture.py)

  router        -> /api/v1/attendance-capture   (settings, devices, cards, gate scan, today, generic device push)
  iclock_router -> /iclock                      (ZKTeco ADMS "push" protocol: terminals send scans here)

Method per campus: manual (class | period - unchanged) | rfid | biometric.
With rfid / biometric: ONE scan a day at the school -> present (before "late after") or late;
no scan by "absent after" -> absent (auto). Manual marking is refused while a device method is on.
"""
import hashlib
import re
import secrets
from datetime import datetime, date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_db import get_db, get_cur
from app.fastapi_campus import get_current_campus_id
from app.fastapi_permissions import require_permission, require_any_permission

router = APIRouter()
iclock_router = APIRouter()

P_SETTINGS, P_DEVICES, P_GATE, P_LOG = ("attendance.capture_settings", "attendance.device_management",
                                         "attendance.gate_scan", "attendance.scan_log")
P_OLD_SETTINGS = "attendance.attendance_settings"          # the existing Attendance Setup permission also manages the method

# device models offered in the settings (any other device: the generic options)
MODELS = [
    {"key": "usb_reader",      "kind": "rfid",      "label": "USB RFID card reader (Gate Scan screen)",          "connect": "gate"},
    {"key": "zkteco_rfid",     "kind": "rfid",      "label": "ZKTeco card terminal (push / ADMS)",             "connect": "zkteco"},
    {"key": "rfid_http",       "kind": "rfid",      "label": "Other network RFID reader (generic HTTP push)",  "connect": "http"},
    {"key": "zkteco_adms",     "kind": "biometric", "label": "ZKTeco fingerprint terminal - K40, MB160, uFace, SpeedFace (push / ADMS)", "connect": "zkteco"},
    {"key": "biometric_http",  "kind": "biometric", "label": "Other biometric device (generic HTTP push)",     "connect": "http"},
]
MODEL_BY_KEY = {m["key"]: m for m in MODELS}


def fail(message, status_code=400):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _hash(key):
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _hm(v):
    return str(v)[:5] if v is not None else None


def _processing_date(db):
    try:
        from app.utils.processing_date import get_processing_date
        return get_processing_date(db)
    except Exception:
        return date.today()


# ------------------------------------------------------------------ settings
def settings_for(cur, campus_id):
    cur.execute("""SELECT * FROM attendance_capture_settings WHERE campus_id = %s OR campus_id IS NULL
                   ORDER BY campus_id NULLS LAST LIMIT 1""", (campus_id,))
    s = dict(cur.fetchone() or {"method": "manual", "manual_mode": "class"})
    for k in ("school_start", "late_after", "absent_after"):
        s[k] = _hm(s.get(k))
    s.pop("updated_at", None)
    return s


def _student_row(cur, student_id):
    cur.execute("""SELECT s.id, s.first_name || ' ' || s.last_name AS name, s.class_id, s.campus_id, COALESCE(s.status, 'active') AS status,
                          c.name || COALESCE(' (' || c.section || ')', '') AS class_label, c.academic_year_id
                   FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = %s""", (student_id,))
    return cur.fetchone()


# ------------------------------------------------------------------ the one rule for every scan
def process_scan(cur, db, *, kind, identifier, scanned_at=None, device_id=None, device_campus=None):
    """Store the scan and, when it belongs to a student of a device-method campus, record the day's attendance."""
    identifier = (identifier or "").strip()
    now = datetime.now()
    scanned_at = scanned_at or now
    day = scanned_at.date()
    if day == now.date():
        day = _processing_date(db)                                   # follow the school's processing date
    out = {"result": None, "student": None, "status": None, "time": scanned_at.strftime("%H:%M")}

    def store(result, student_id=None, att_id=None, campus=None, staff_id=None):
        cur.execute("""INSERT INTO attendance_scans (device_id, campus_id, kind, identifier, scanned_at, student_id, result, attendance_id, staff_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (device_id, campus if campus is not None else device_campus, kind, identifier[:80], scanned_at, student_id, result, att_id, staff_id))
        out["scan_id"] = cur.fetchone()["id"]; out["result"] = result
        return out

    if not identifier:
        return store("unknown")
    cur.execute("SELECT student_id FROM student_attendance_ids WHERE kind = %s AND lower(identifier) = lower(%s) AND is_active", (kind, identifier))
    r = cur.fetchone()
    if not r:
        # not a student: maybe an employee (shared terminals / gate readers) -> clock in / out in staff attendance
        try:
            from app.api.v1.staff_attendance import staff_device_scan
            sres = staff_device_scan(cur, db, kind, identifier, scanned_at)
        except ImportError:
            sres = None
        if sres:
            out["student"] = {"id": None, "name": sres["staff"]["name"], "class_label": "Staff"}
            out["staff"] = sres["staff"]; out["status"] = "late" if sres.get("is_late") else None
            if sres.get("message"): out["message"] = sres["message"]
            return store(sres["result"], staff_id=sres["staff"]["id"])
        return store("unknown")
    st = _student_row(cur, r["student_id"])
    out["student"] = {"id": st["id"], "name": st["name"], "class_label": st["class_label"]}
    if st["status"] != "active" or not st["class_id"]:
        return store("inactive_student", st["id"], campus=st["campus_id"])
    s = settings_for(cur, st["campus_id"])
    if s["method"] != kind:
        return store("method_off", st["id"], campus=st["campus_id"])
    cur.execute("SELECT sp_check_holiday(%s::date) AS title", (day,))
    if (cur.fetchone() or {}).get("title"):
        return store("holiday", st["id"], campus=st["campus_id"])
    t = scanned_at.strftime("%H:%M")
    cur.execute("""SELECT id, status, source FROM attendance WHERE student_id = %s AND date = %s AND subject_id IS NULL
                   ORDER BY id LIMIT 1""", (st["id"], day))
    ex = cur.fetchone()
    if ex:
        if ex["source"] in ("rfid", "biometric") and ex["status"] in ("present", "late"):
            out["status"] = ex["status"]
            return store("duplicate", st["id"], ex["id"], st["campus_id"])
        if ex["status"] == "absent" and ex["source"] == "auto_absent":            # arrived after the absent time
            cur.execute("""UPDATE attendance SET status='late', source=%s, scanned_at=%s, remarks=%s, updated_at=now() WHERE id=%s""",
                        (kind, scanned_at, f"Arrived at {t} (after the absent time)", ex["id"]))
            out["status"] = "late"
            return store("late", st["id"], ex["id"], st["campus_id"])
        out["status"] = ex["status"]
        return store("already_marked", st["id"], ex["id"], st["campus_id"])          # leave / excused / marked before
    status = "present" if t <= (s.get("late_after") or "23:59") else "late"
    cur.execute("""INSERT INTO attendance (student_id, class_id, date, status, marked_by, subject_id, remarks, academic_year_id, source, scanned_at, created_at)
                   VALUES (%s,%s,%s,%s,NULL,NULL,%s,%s,%s,%s, now()) RETURNING id""",
                (st["id"], st["class_id"], day, status, f"{'Card' if kind == 'rfid' else 'Thumb'} scan at {t}", st["academic_year_id"], kind, scanned_at))
    att = cur.fetchone()["id"]
    out["status"] = status
    return store(status, st["id"], att, st["campus_id"])


# ------------------------------------------------------------------ automatic absent
def mark_absentees(cur, db, campus_id=None, force=False):
    """Students of device-method campuses with no attendance by the absent time -> absent (once; safe to repeat)."""
    now = datetime.now(); day = _processing_date(db); done = 0
    cur.execute("SELECT DISTINCT campus_id FROM students WHERE COALESCE(status, 'active') = 'active'" + ("" if campus_id is None else " AND campus_id = %s"),
                () if campus_id is None else (campus_id,))
    for c in [r["campus_id"] for r in cur.fetchall()]:
        s = settings_for(cur, c)
        if s["method"] == "manual" or not s.get("auto_absent"):
            continue
        if not force and now.strftime("%H:%M") < (s.get("absent_after") or "23:59"):
            continue
        cur.execute("SELECT sp_check_holiday(%s::date) AS title", (day,))
        if (cur.fetchone() or {}).get("title"):
            continue
        cur.execute("""INSERT INTO attendance (student_id, class_id, date, status, marked_by, subject_id, remarks, academic_year_id, source, created_at)
                       SELECT st.id, st.class_id, %s, 'absent', NULL, NULL, %s, cl.academic_year_id, 'auto_absent', now()
                       FROM students st JOIN classes cl ON cl.id = st.class_id
                       WHERE COALESCE(st.status, 'active') = 'active' AND st.campus_id IS NOT DISTINCT FROM %s
                         AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = st.id AND a.date = %s AND a.subject_id IS NULL)""",
                    (day, f"No scan by {s['absent_after']}", c, day))
        done += cur.rowcount
    return done


# ================================================================== settings
@router.get("/config")
def config(user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """For every screen: which method this campus uses (Attendance page hides marking when a device method is on)."""
    cur = get_cur(db)
    s = settings_for(cur, campus_id)
    return ok(data={"method": s["method"], "manual_mode": s["manual_mode"], "device_model": s.get("device_model"),
                    "school_start": s["school_start"], "late_after": s["late_after"], "absent_after": s["absent_after"],
                    "auto_absent": s.get("auto_absent"), "manual_marking": s["method"] == "manual", "models": MODELS})


class SettingsIn(BaseModel):
    method: str = "manual"
    manual_mode: str = "class"
    device_model: Optional[str] = None
    school_start: str = "08:00"
    late_after: str = "08:10"
    absent_after: str = "09:30"
    auto_absent: bool = True
    duplicate_minutes: int = 5


@router.get("/settings")
def get_settings(user_id: int = Depends(require_any_permission(P_SETTINGS, P_OLD_SETTINGS)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    return ok(data={**settings_for(cur, campus_id), "models": MODELS, "scope": "campus" if campus_id is not None else "school-wide default"})


@router.put("/settings")
def save_settings(body: SettingsIn, user_id: int = Depends(require_any_permission(P_SETTINGS, P_OLD_SETTINGS)), db=Depends(get_db),
                  campus_id: Optional[int] = Depends(get_current_campus_id)):
    if body.method not in ("manual", "rfid", "biometric"): fail("Choose Manual, RFID or Biometric.")
    if body.manual_mode not in ("class", "period"): fail("Manual attendance is either class based or period based.")
    times = (body.school_start, body.late_after, body.absent_after)
    if not all(re.match(r"^\d{2}:\d{2}$", t or "") for t in times): fail("Times must be HH:MM.")
    model = None
    if body.method != "manual":
        m = MODEL_BY_KEY.get(body.device_model or "")
        if not m or m["kind"] != body.method: fail("Choose the device model for " + ("RFID cards." if body.method == "rfid" else "biometric scanning."))
        if not (body.school_start <= body.late_after < body.absent_after):
            fail("The times must follow each other: school start, then 'late after', then 'absent if no scan by'.")
        model = m["key"]
    cur = get_cur(db)
    vals = (body.method, body.manual_mode, model, body.school_start, body.late_after, body.absent_after, body.auto_absent,
            max(0, min(120, body.duplicate_minutes)), user_id)
    if campus_id is None:
        cur.execute("""UPDATE attendance_capture_settings SET method=%s, manual_mode=%s, device_model=%s, school_start=%s, late_after=%s,
                       absent_after=%s, auto_absent=%s, duplicate_minutes=%s, updated_by=%s, updated_at=now() WHERE campus_id IS NULL""", vals)
    else:
        cur.execute("""INSERT INTO attendance_capture_settings (method, manual_mode, device_model, school_start, late_after, absent_after, auto_absent,
                       duplicate_minutes, updated_by, campus_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (campus_id) DO UPDATE SET method=EXCLUDED.method, manual_mode=EXCLUDED.manual_mode, device_model=EXCLUDED.device_model,
                       school_start=EXCLUDED.school_start, late_after=EXCLUDED.late_after, absent_after=EXCLUDED.absent_after,
                       auto_absent=EXCLUDED.auto_absent, duplicate_minutes=EXCLUDED.duplicate_minutes, updated_by=EXCLUDED.updated_by, updated_at=now()""",
                    vals + (campus_id,))
    db.commit()
    label = {"manual": f"Manual ({body.manual_mode} based)", "rfid": "RFID card", "biometric": "Biometric (thumb)"}[body.method]
    return ok(message=f"Attendance method saved: {label}.")


# ================================================================== devices
class DeviceIn(BaseModel):
    name: str
    location: Optional[str] = None
    model: str
    serial_no: Optional[str] = None
    is_active: bool = True


@router.get("/devices")
def list_devices(user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""SELECT d.id, d.campus_id, d.name, d.location, d.kind, d.model, d.serial_no, d.is_active, d.last_seen_at, d.api_key_hash IS NOT NULL AS has_key,
                          (SELECT COUNT(*) FROM attendance_scans s WHERE s.device_id = d.id AND s.scanned_at >= CURRENT_DATE) AS scans_today
                   FROM attendance_devices d WHERE (%s::int IS NULL OR d.campus_id IS NULL OR d.campus_id = %s) ORDER BY d.name""", (campus_id, campus_id))
    rows = []
    for r in cur.fetchall():
        d = dict(r); d["last_seen_at"] = d["last_seen_at"].isoformat() if d["last_seen_at"] else None
        d["model_label"] = MODEL_BY_KEY.get(d["model"], {}).get("label", d["model"]); d["connect"] = MODEL_BY_KEY.get(d["model"], {}).get("connect")
        rows.append(d)
    return ok(data=rows)


@router.post("/devices")
def add_device(body: DeviceIn, user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    m = MODEL_BY_KEY.get(body.model)
    if not m: fail("Choose the device model.")
    if not body.name.strip(): fail("Give the device a name (e.g. Main Gate).")
    if m["connect"] == "zkteco" and not (body.serial_no or "").strip(): fail("Enter the terminal's serial number (SN) - it's on the device's About screen.")
    key = secrets.token_urlsafe(24) if m["connect"] == "http" else None
    cur = get_cur(db)
    try:
        cur.execute("""INSERT INTO attendance_devices (campus_id, name, location, kind, model, serial_no, api_key_hash, is_active, created_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (campus_id, body.name.strip(), (body.location or "").strip() or None, m["kind"], m["key"],
                     (body.serial_no or "").strip() or None, _hash(key) if key else None, body.is_active, user_id))
    except Exception as e:
        db.rollback()
        if "ad_serial_once" in str(e): fail("A device with this serial number is already registered.", 409)
        raise
    did = cur.fetchone()["id"]; db.commit()
    return ok(data={"id": did, "api_key": key}, message="Device added." + (" Copy its key now - it is shown only once." if key else ""))


@router.put("/devices/{device_id}")
def edit_device(device_id: int, body: DeviceIn, user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db)):
    m = MODEL_BY_KEY.get(body.model)
    if not m: fail("Choose the device model.")
    cur = get_cur(db)
    cur.execute("""UPDATE attendance_devices SET name=%s, location=%s, kind=%s, model=%s, serial_no=%s, is_active=%s WHERE id=%s RETURNING id""",
                (body.name.strip(), (body.location or "").strip() or None, m["kind"], m["key"], (body.serial_no or "").strip() or None, body.is_active, device_id))
    if not cur.fetchone(): fail("Device not found.", 404)
    db.commit()
    return ok(message="Device saved.")


@router.post("/devices/{device_id}/new-key")
def new_key(device_id: int, user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db)):
    key = secrets.token_urlsafe(24)
    cur = get_cur(db)
    cur.execute("UPDATE attendance_devices SET api_key_hash=%s WHERE id=%s RETURNING id", (_hash(key), device_id))
    if not cur.fetchone(): fail("Device not found.", 404)
    db.commit()
    return ok(data={"api_key": key}, message="New key created - the old one stops working. Copy it now.")


# ================================================================== student cards / fingerprint numbers
@router.get("/students")
def enrolment(kind: str = Query("rfid"), class_id: Optional[int] = None, q: Optional[str] = None, missing: bool = False,
              user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    where, params = ["COALESCE(s.status, 'active') = 'active'"], [kind]
    if campus_id is not None: where.append("s.campus_id = %s"); params.append(campus_id)
    if class_id: where.append("s.class_id = %s"); params.append(class_id)
    if q: where.append("(s.first_name || ' ' || s.last_name ILIKE %s OR s.enrollment_no ILIKE %s)"); params += [f"%{q.strip()}%"] * 2
    if missing: where.append("i.id IS NULL")
    cur.execute(f"""SELECT s.id, s.first_name || ' ' || s.last_name AS name, s.enrollment_no, c.name || COALESCE(' (' || c.section || ')', '') AS class_label,
                           i.identifier, i.assigned_at
                    FROM students s LEFT JOIN classes c ON c.id = s.class_id
                    LEFT JOIN student_attendance_ids i ON i.student_id = s.id AND i.kind = %s AND i.is_active
                    WHERE {' AND '.join(where)} ORDER BY class_label, name LIMIT 500""", params)
    rows = [{**dict(r), "assigned_at": r["assigned_at"].isoformat() if r["assigned_at"] else None} for r in cur.fetchall()]
    cur.execute(f"""SELECT COUNT(*) AS total, COUNT(i.id) AS enrolled FROM students s
                    LEFT JOIN student_attendance_ids i ON i.student_id = s.id AND i.kind = %s AND i.is_active
                    WHERE COALESCE(s.status, 'active') = 'active'{' AND s.campus_id = %s' if campus_id is not None else ''}""",
                [kind] + ([campus_id] if campus_id is not None else []))
    return ok(data={"students": rows, "counts": dict(cur.fetchone())})


class IdentifierIn(BaseModel):
    kind: str
    identifier: str
    reason: Optional[str] = None


@router.post("/students/{student_id}/identifier")
def assign_identifier(student_id: int, body: IdentifierIn, user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db)):
    if body.kind not in ("rfid", "biometric"): fail("Card (rfid) or fingerprint (biometric).")
    ident = (body.identifier or "").strip()
    if not ident: fail("Enter or scan the card number." if body.kind == "rfid" else "Enter the student's user number from the device.")
    cur = get_cur(db)
    cur.execute("""SELECT i.student_id, s.first_name || ' ' || s.last_name AS name FROM student_attendance_ids i JOIN students s ON s.id = i.student_id
                   WHERE i.kind = %s AND lower(i.identifier) = lower(%s) AND i.is_active""", (body.kind, ident))
    other = cur.fetchone()
    if other and other["student_id"] != student_id:
        fail(f"This {'card' if body.kind == 'rfid' else 'number'} already belongs to {other['name']}.", 409)
    if other:
        return ok(message="Already assigned to this student.")
    if body.kind == "biometric":
        try:
            cur.execute("SAVEPOINT staff_ids")
            cur.execute("""SELECT s.first_name || ' ' || s.last_name AS name FROM staff_biometric_ids b JOIN staff s ON s.id = b.staff_id
                           WHERE lower(b.identifier) = lower(%s) AND b.is_active""", (ident,))
            clash = cur.fetchone(); cur.execute("RELEASE SAVEPOINT staff_ids")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT staff_ids"); clash = None
        if clash:
            fail(f"Number {ident} is already used by the employee {clash['name']} on the terminals.", 409)
    cur.execute("""UPDATE student_attendance_ids SET is_active=FALSE, deactivated_at=now(), deactivated_by=%s, reason=%s
                   WHERE student_id=%s AND kind=%s AND is_active""", (user_id, body.reason or "Replaced", student_id, body.kind))
    replaced = cur.rowcount
    cur.execute("INSERT INTO student_attendance_ids (student_id, kind, identifier, assigned_by) VALUES (%s,%s,%s,%s)", (student_id, body.kind, ident, user_id))
    db.commit()
    return ok(message=("Card" if body.kind == "rfid" else "Fingerprint number") + (" replaced." if replaced else " assigned."))


@router.delete("/students/{student_id}/identifier")
def remove_identifier(student_id: int, kind: str = Query(...), reason: str = Query("Removed"), user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""UPDATE student_attendance_ids SET is_active=FALSE, deactivated_at=now(), deactivated_by=%s, reason=%s
                   WHERE student_id=%s AND kind=%s AND is_active""", (user_id, reason, student_id, kind))
    if not cur.rowcount: fail("Nothing assigned.", 404)
    db.commit()
    return ok(message="Removed. The old card / number no longer works.")


# ================================================================== gate scan (USB reader) + today
class GateIn(BaseModel):
    identifier: str
    device_id: Optional[int] = None


@router.post("/gate-scan")
def gate_scan(body: GateIn, user_id: int = Depends(require_permission(P_GATE)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    if body.device_id:
        cur.execute("UPDATE attendance_devices SET last_seen_at=now() WHERE id=%s", (body.device_id,))
    mark_absentees(cur, db)
    res = process_scan(cur, db, kind="rfid", identifier=body.identifier, device_id=body.device_id, device_campus=campus_id)
    db.commit()
    return ok(data=res)


@router.get("/today")
def today(user_id: int = Depends(require_permission(P_LOG)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    marked = mark_absentees(cur, db); db.commit()
    day = _processing_date(db)
    camp = "" if campus_id is None else " AND st.campus_id = %s"
    cur.execute(f"""SELECT COUNT(*) FILTER (WHERE a.status = 'present') AS present, COUNT(*) FILTER (WHERE a.status = 'late') AS late,
                           COUNT(*) FILTER (WHERE a.status = 'absent') AS absent, COUNT(*) FILTER (WHERE a.status IN ('on_leave', 'excused')) AS leave,
                           COUNT(*) FILTER (WHERE a.id IS NULL) AS not_yet
                    FROM students st LEFT JOIN attendance a ON a.student_id = st.id AND a.date = %s AND a.subject_id IS NULL
                    WHERE COALESCE(st.status, 'active') = 'active'{camp}""", [day] + ([campus_id] if campus_id is not None else []))
    counts = dict(cur.fetchone())
    cur.execute(f"""SELECT sc.id, sc.kind, sc.identifier, sc.scanned_at, sc.result, d.name AS device,
                           COALESCE(st.first_name || ' ' || st.last_name, sf.first_name || ' ' || sf.last_name) AS student,
                           CASE WHEN sc.staff_id IS NOT NULL THEN 'Staff' ELSE c.name || COALESCE(' (' || c.section || ')', '') END AS class_label
                    FROM attendance_scans sc LEFT JOIN attendance_devices d ON d.id = sc.device_id LEFT JOIN students st ON st.id = sc.student_id
                    LEFT JOIN classes c ON c.id = st.class_id LEFT JOIN staff sf ON sf.id = sc.staff_id
                    WHERE sc.scanned_at >= %s::date AND sc.scanned_at < %s::date + 1 {('AND sc.campus_id IS NOT DISTINCT FROM %s' if campus_id is not None else '')}
                    ORDER BY sc.scanned_at DESC, sc.id DESC LIMIT 200""",
                [datetime.now().date(), datetime.now().date()] + ([campus_id] if campus_id is not None else []))
    scans = [{**dict(r), "scanned_at": r["scanned_at"].isoformat()} for r in cur.fetchall()]
    s = settings_for(cur, campus_id)
    return ok(data={"date": day.isoformat(), "counts": counts, "scans": scans, "unknown": [x for x in scans if x["result"] == "unknown"],
                    "settings": {k: s.get(k) for k in ("method", "device_model", "late_after", "absent_after", "auto_absent")}, "just_marked_absent": marked})


@router.post("/run-absentees")
def run_absentees(user_id: int = Depends(require_any_permission(P_SETTINGS, P_OLD_SETTINGS)), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    n = mark_absentees(cur, db, campus_id, force=True); db.commit()
    return ok(data={"marked": n}, message=f"{n} student(s) with no scan marked absent.")


class ResolveIn(BaseModel):
    student_id: int


@router.post("/scans/{scan_id}/resolve")
def resolve_unknown(scan_id: int, body: ResolveIn, user_id: int = Depends(require_permission(P_DEVICES)), db=Depends(get_db)):
    """An unknown card / number: give it to a student and count that scan for them."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM attendance_scans WHERE id=%s", (scan_id,))
    sc = cur.fetchone()
    if not sc or sc["result"] != "unknown": fail("Only an unknown scan can be resolved.", 409)
    assign_identifier(body.student_id, IdentifierIn(kind=sc["kind"], identifier=sc["identifier"], reason="Resolved from an unknown scan"), user_id, db)
    res = process_scan(cur, db, kind=sc["kind"], identifier=sc["identifier"], scanned_at=sc["scanned_at"], device_id=sc["device_id"], device_campus=sc["campus_id"])
    cur.execute("UPDATE attendance_scans SET resolved_by=%s, resolved_at=now() WHERE id=%s", (user_id, scan_id))
    db.commit()
    return ok(data=res, message=f"Assigned and counted: {res.get('status') or res['result']}.")


# ================================================================== devices sending scans
class PushScan(BaseModel):
    identifier: str
    time: Optional[str] = None          # "YYYY-MM-DD HH:MM:SS" (device local time); omitted = now


class PushIn(BaseModel):
    scans: Optional[List[PushScan]] = None
    identifier: Optional[str] = None
    time: Optional[str] = None


def _parse_time(v):
    if not v: return None
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
        try: return datetime.strptime(v.strip()[:19], f)
        except ValueError: pass
    return None


@router.post("/device/scans")
def device_push(body: PushIn, x_device_key: Optional[str] = Header(None), db=Depends(get_db)):
    """Generic HTTP push for network RFID readers / biometric devices: header X-Device-Key, body {"scans": [{"identifier", "time"}]}."""
    if not x_device_key: fail("Missing X-Device-Key.", 401)
    cur = get_cur(db)
    cur.execute("SELECT * FROM attendance_devices WHERE api_key_hash = %s AND is_active", (_hash(x_device_key),))
    dev = cur.fetchone()
    if not dev: fail("Unknown or inactive device.", 401)
    items = body.scans or ([PushScan(identifier=body.identifier, time=body.time)] if body.identifier else [])
    results = [process_scan(cur, db, kind=dev["kind"], identifier=i.identifier, scanned_at=_parse_time(i.time), device_id=dev["id"], device_campus=dev["campus_id"])["result"]
               for i in items[:500]]
    cur.execute("UPDATE attendance_devices SET last_seen_at=now() WHERE id=%s", (dev["id"],))
    db.commit()
    return ok(data={"received": len(results), "results": results})


# ------------------------------------------------------------------ ZKTeco push (ADMS / iclock)
def _zk_device(cur, sn):
    cur.execute("SELECT * FROM attendance_devices WHERE serial_no = %s AND is_active", (sn,))
    d = cur.fetchone()
    if d:
        cur.execute("UPDATE attendance_devices SET last_seen_at=now() WHERE id=%s", (d["id"],))
    return d


@iclock_router.get("/cdata")
def zk_handshake(SN: str = Query(""), db=Depends(get_db)):
    """Terminal start-up: tell it to send attendance logs in real time."""
    cur = get_cur(db)
    dev = _zk_device(cur, SN); db.commit()
    if not dev:
        print(f"[attendance] ZKTeco terminal {SN!r} is not registered - add it under Attendance capture > Devices")
        return PlainTextResponse("OK")
    return PlainTextResponse(f"GET OPTION FROM: {SN}\nATTLOGStamp=None\nOPERLOGStamp=9999\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\n"
                             f"TransTimes=00:00;14:05\nTransInterval=1\nTransFlag=TransData AttLog\nRealtime=1\nEncrypt=None\n")


@iclock_router.post("/cdata")
async def zk_upload(request: Request, SN: str = Query(""), table: str = Query(""), db=Depends(get_db)):
    """ATTLOG lines: PIN <tab> YYYY-MM-DD HH:MM:SS <tab> status <tab> verify ..."""
    raw = (await request.body()).decode("utf-8", "ignore")
    cur = get_cur(db)
    dev = _zk_device(cur, SN)
    if not dev or table.upper() != "ATTLOG":
        db.commit(); return PlainTextResponse("OK")
    n = 0
    for line in raw.splitlines():
        parts = line.strip().split("\t")
        if len(parts) >= 2 and parts[0].strip():
            process_scan(cur, db, kind=dev["kind"], identifier=parts[0].strip(), scanned_at=_parse_time(parts[1]), device_id=dev["id"], device_campus=dev["campus_id"])
            n += 1
    db.commit()
    return PlainTextResponse(f"OK: {n}")


@iclock_router.get("/getrequest")
def zk_getrequest(SN: str = Query(""), db=Depends(get_db)):
    cur = get_cur(db); _zk_device(cur, SN); db.commit()
    return PlainTextResponse("OK")


@iclock_router.post("/devicecmd")
def zk_devicecmd():
    return PlainTextResponse("OK")
