from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_campus import get_current_campus_id, get_settings_campus_id
from app.fastapi_campus import enforce_same_campus
from app.fastapi_campus import governed_settings_campus_id
from app.fastapi_campus import governed_settings_campus_id_for_write, catalog_campus_id, catalog_campus_id_for_write
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_date, get_processing_datetime

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def require_permission(perm: str):
    def dep(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
        cur = get_cur(db)
        cur.execute("""SELECT 1 FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id=ur.role_id
            JOIN permissions p ON p.id=rp.permission_id
            WHERE ur.user_id=%s AND p.code=%s LIMIT 1""", (user_id, perm))
        if not cur.fetchone():
            fail("You do not have permission to perform this action.", 403)
        return user_id
    return dep


def _has_permission(db, user_id, perm):
    cur = get_cur(db)
    cur.execute("""SELECT 1 FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id=ur.role_id
        JOIN permissions p ON p.id=rp.permission_id
        WHERE ur.user_id=%s AND p.code=%s LIMIT 1""", (user_id, perm))
    return cur.fetchone() is not None


def _get_hod_department_ids(db, user_id):
    cur = get_cur(db)
    cur.execute("SELECT id FROM departments WHERE head_user_id=%s", (user_id,))
    return [r["id"] for r in cur.fetchall()]


def _check_view_access(db, user_id, department_id=None):
    """View-access gate for attendance data, shared by HR and HOD.
    Returns None if the user has full hr.view access (no restriction needed).
    Otherwise returns the list of department_ids this user may view (as HOD).
    Raises 403 if they have neither hr.view nor are HOD of anything, or are
    asking about a specific department they do not head."""
    if _has_permission(db, user_id, "hr.view"):
        return None
    hod_depts = _get_hod_department_ids(db, user_id)
    if not hod_depts:
        fail("You do not have permission to view attendance data.", 403)
    if department_id is not None and department_id not in hod_depts:
        fail("You can only view attendance for your own department.", 403)
    return hod_depts


def _get_staff_id_for_user(db, user_id: int):
    cur = get_cur(db)
    cur.execute("SELECT id FROM staff WHERE user_id=%s", (user_id,))
    row = cur.fetchone()
    if not row:
        fail("No staff record found for this account.", 400)
    return row["id"]


def _get_department_id_for_staff(db, staff_id):
    cur = get_cur(db)
    cur.execute("SELECT department_id FROM staff WHERE id=%s", (staff_id,))
    row = cur.fetchone()
    return row["department_id"] if row else None


def _get_effective_schedule(db, department_id, campus_id=None):
    """Returns the CURRENTLY configured schedule. Only ever used at write-time
    (when a session is created or its clock_in_at is corrected) so that a later
    change to the schedule never rewrites the late-status of past attendance."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM attendance_schedule_settings WHERE campus_id = %s OR campus_id IS NULL ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
    settings = cur.fetchone()
    if settings["mode"] == "per_department" and department_id:
        cur.execute("SELECT start_time, end_time, grace_minutes FROM department_attendance_schedules WHERE department_id=%s", (department_id,))
        dept_row = cur.fetchone()
        if dept_row:
            return dept_row["start_time"], dept_row["end_time"], dept_row["grace_minutes"]
    return settings["default_start_time"], settings["default_end_time"], settings["grace_minutes"]


def _is_late(clock_in_at, start_time, grace_minutes):
    if clock_in_at is None or start_time is None:
        return False
    cutoff = datetime.combine(clock_in_at.date(), start_time) + timedelta(minutes=grace_minutes or 0)
    return clock_in_at > cutoff


def _get_campus_id_for_staff(db, staff_id):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM staff WHERE id=%s", (staff_id,))
    row = cur.fetchone()
    return row["campus_id"] if row else None
def _compute_is_late_for_staff(db, staff_id, clock_in_dt):
    """Snapshot helper: computes is_late using the schedule in effect RIGHT NOW,
    then this value is stored permanently on the session row - it is never
    recomputed later even if the schedule subsequently changes."""
    dept_id = _get_department_id_for_staff(db, staff_id)
    campus_id = _get_campus_id_for_staff(db, staff_id)
    start_time, end_time, grace_minutes = _get_effective_schedule(db, dept_id, campus_id)
    return _is_late(clock_in_dt, start_time, grace_minutes)


# --- SELF-SERVICE (employee own clock in/out) ---
@router.post("/my/toggle")
def my_toggle(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    is_late_value = _compute_is_late_for_staff(db, staff_id, get_processing_datetime(db))
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_toggle_staff_attendance(%s,%s,%s,%s)", (staff_id, "web", user_id, is_late_value))
    row = dict(cur.fetchone())
    if row.get("error_msg"):
        fail(row["error_msg"], 400)
    db.commit()
    for k in ("clock_in_at", "clock_out_at"):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()
    return ok(data=row, message="Clocked in." if row["action"] == "clock_in" else "Clocked out.")


@router.get("/my/today")
def my_today(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    cur = get_cur(db)
    cur.execute("""SELECT * FROM staff_attendance_sessions
        WHERE staff_id=%s AND clock_in_at::date = %s
        ORDER BY clock_in_at""", (staff_id, get_processing_date(db)))
    sessions = [dict(r) for r in cur.fetchall()]
    is_clocked_in = any(s["clock_out_at"] is None for s in sessions)
    return ok(data={"sessions": sessions, "is_clocked_in": is_clocked_in})


@router.get("/my/history")
def my_history(from_date: Optional[str] = None, to_date: Optional[str] = None,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    cur = get_cur(db)
    q = "SELECT * FROM staff_attendance_sessions WHERE staff_id=%s"
    params = [staff_id]
    if from_date:
        q += " AND clock_in_at::date >= %s"; params.append(from_date)
    if to_date:
        q += " AND clock_in_at::date <= %s"; params.append(to_date)
    q += " ORDER BY clock_in_at DESC LIMIT 200"
    cur.execute(q, tuple(params))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/my-hod-status")
def my_hod_status(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM departments WHERE head_user_id=%s", (user_id,))
    depts = [dict(r) for r in cur.fetchall()]
    return ok(data={
        "is_hod": len(depts) > 0,
        "departments": depts,
        "has_hr_view": _has_permission(db, user_id, "hr.view"),
    })


# --- RFID DEVICE ENDPOINT (device-key auth, no user login) ---
class RfidSwipeIn(BaseModel):
    card_uid: str


def verify_device_key(x_device_key: Optional[str] = Header(None), db=Depends(get_db)):
    # The physical RFID device has no login/campus context of its own, so
    # its key is checked against every configured key (global default plus
    # any campus's own override) rather than a single fixed row.
    cur = get_cur(db)
    if not x_device_key:
        fail("Invalid or missing device key.", 401)
    cur.execute("SELECT 1 FROM attendance_settings WHERE rfid_device_api_key = %s", (x_device_key,))
    if not cur.fetchone():
        fail("Invalid or missing device key.", 401)
    return True


@router.post("/rfid-swipe")
def rfid_swipe(body: RfidSwipeIn, _=Depends(verify_device_key), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT s.id AS staff_id, s.first_name, s.last_name
        FROM staff_rfid_cards rc JOIN staff s ON s.id=rc.staff_id
        WHERE rc.card_uid=%s AND rc.is_active=true""", (body.card_uid,))
    srow = cur.fetchone()
    if not srow:
        fail("Card not recognized or inactive.", 404)
    is_late_value = _compute_is_late_for_staff(db, srow["staff_id"], get_processing_datetime(db))
    cur.execute("SELECT * FROM sp_toggle_staff_attendance(%s,%s,%s,%s)", (srow["staff_id"], "rfid", None, is_late_value))
    row = dict(cur.fetchone())
    if row.get("error_msg"):
        fail(row["error_msg"], 400)
    db.commit()
    for k in ("clock_in_at", "clock_out_at"):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()
    row["staff_name"] = srow["first_name"] + " " + srow["last_name"]
    return ok(data=row)


# --- HR: RFID CARD MANAGEMENT (unchanged - hr.edit required, not exposed to HOD) ---
class RfidCardIn(BaseModel):
    staff_id: int
    card_uid: str


@router.get("/rfid-cards")
def list_rfid_cards(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT rc.*, s.first_name, s.last_name FROM staff_rfid_cards rc
        JOIN staff s ON s.id=rc.staff_id ORDER BY rc.assigned_at DESC""")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/rfid-cards")
def assign_rfid_card(body: RfidCardIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_assign_rfid_card(%s,%s)", (body.staff_id, body.card_uid))
    row = cur.fetchone()
    if row["error_msg"]:
        fail(row["error_msg"], 400)
    db.commit()
    return ok(data={"id": row["id"]}, message="Card assigned.")


@router.delete("/rfid-cards/{card_id}")
def deactivate_rfid_card(card_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_rfid_card(%s)", (card_id,))
    db.commit()
    return ok(message="Card deactivated.")


# --- SESSION VIEW (HR: full access, HOD: view-only within their department) + HR-ONLY CORRECTIONS ---
@router.get("/staff/{staff_id}/sessions")
def get_staff_sessions(staff_id: int, from_date: Optional[str] = None, to_date: Optional[str] = None,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    target_dept = _get_department_id_for_staff(db, staff_id)
    _check_view_access(db, user_id, target_dept)
    cur = get_cur(db)
    q = "SELECT * FROM staff_attendance_sessions WHERE staff_id=%s"
    params = [staff_id]
    if from_date:
        q += " AND clock_in_at::date >= %s"; params.append(from_date)
    if to_date:
        q += " AND clock_in_at::date <= %s"; params.append(to_date)
    q += " ORDER BY clock_in_at DESC"
    cur.execute(q, tuple(params))
    return ok(data=[dict(r) for r in cur.fetchall()])


class SessionIn(BaseModel):
    staff_id: int
    clock_in_at: str
    clock_out_at: Optional[str] = None
    notes: Optional[str] = None


@router.post("/sessions")
def create_session_manual(body: SessionIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    clock_in_dt = datetime.fromisoformat(body.clock_in_at)
    is_late_value = _compute_is_late_for_staff(db, body.staff_id, clock_in_dt)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_attendance_session(%s,%s,%s,%s,%s,%s)",
        (body.staff_id, body.clock_in_at, body.clock_out_at, body.notes, user_id, is_late_value))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Session added.")


class SessionUpdateIn(BaseModel):
    clock_in_at: Optional[str] = None
    clock_out_at: Optional[str] = None
    notes: Optional[str] = None


@router.put("/sessions/{session_id}")
def update_session(session_id: int, body: SessionUpdateIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    is_late_value = None
    if body.clock_in_at:
        cur0 = get_cur(db)
        cur0.execute("SELECT staff_id FROM staff_attendance_sessions WHERE id=%s", (session_id,))
        srow = cur0.fetchone()
        if srow:
            clock_in_dt = datetime.fromisoformat(body.clock_in_at)
            is_late_value = _compute_is_late_for_staff(db, srow["staff_id"], clock_in_dt)
    cur = get_cur(db)
    cur.execute("SELECT sp_update_attendance_session(%s,%s,%s,%s,%s)",
        (session_id, body.clock_in_at, body.clock_out_at, body.notes, is_late_value))
    db.commit()
    return ok(message="Session updated.")


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_attendance_session(%s)", (session_id,))
    db.commit()
    return ok(message="Session deleted.")


# --- LIVE DASHBOARD (HR: full access, HOD: auto-scoped to their own department) ---
@router.get("/dashboard")
def attendance_dashboard(department_id: Optional[int] = None,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    hod_depts = _check_view_access(db, user_id, department_id)
    if department_id is not None:
        effective_filter = [department_id]
    elif hod_depts is not None:
        effective_filter = hod_depts
    else:
        effective_filter = None
    cur = get_cur(db)
    cur.execute("""SELECT s.id AS staff_id, s.first_name, s.last_name, s.department_id, d.name AS department_name,
        (SELECT id FROM staff_attendance_sessions WHERE staff_id=s.id AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1) AS open_session_id,
        (SELECT clock_in_at FROM staff_attendance_sessions WHERE staff_id=s.id AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1) AS current_clock_in,
        (SELECT is_late FROM staff_attendance_sessions WHERE staff_id=s.id AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1) AS is_late,
        EXISTS(SELECT 1 FROM staff_attendance_sessions WHERE staff_id=s.id AND clock_in_at::date = %s) AS has_session_today
        FROM staff s LEFT JOIN departments d ON d.id=s.department_id
        WHERE s.status=\'active\' AND (%s::int[] IS NULL OR s.department_id = ANY(%s::int[]))
          AND (%s IS NULL OR s.campus_id = %s)
          AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=s.user_id AND r.name='superadmin')
        ORDER BY s.first_name""", (get_processing_date(db), effective_filter, effective_filter, campus_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


# --- ATTENDANCE SETTINGS (HR only - not exposed to HOD) ---
@router.get("/settings")
def get_attendance_settings(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id("attendance"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_settings_by_category(%s::varchar, %s)", ("attendance", campus_id))
    return ok(data={r["key"]: r["value"] for r in cur.fetchall()})


class AttendanceSettingsIn(BaseModel):
    attendance_auto_close_time: str


@router.put("/settings")
def update_attendance_settings(body: AttendanceSettingsIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id_for_write("attendance"))):
    cur = get_cur(db)
    cur.execute("SELECT sp_upsert_settings_by_category(%s::varchar, %s::varchar[], %s::varchar[], %s::integer, %s)",
        ("attendance", ["attendance_auto_close_time"], [body.attendance_auto_close_time], user_id, campus_id))
    db.commit()
    return ok(message="Settings updated.")


# --- ATTENDANCE SCHEDULE SETTINGS (HR only - not exposed to HOD) ---
@router.get("/schedule-settings")
def get_schedule_settings(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM attendance_schedule_settings WHERE campus_id = %s OR campus_id IS NULL ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
    settings = dict(cur.fetchone())
    cur.execute("""SELECT ds.*, d.name AS department_name FROM department_attendance_schedules ds
        JOIN departments d ON d.id=ds.department_id
        WHERE (%s IS NULL OR d.campus_id IS NULL OR d.campus_id = %s)
        ORDER BY d.name""", (raw_campus_id, raw_campus_id))
    departments = [dict(r) for r in cur.fetchall()]
    return ok(data={"settings": settings, "departments": departments})


class ScheduleSettingsIn(BaseModel):
    mode: str
    default_start_time: str
    default_end_time: str
    grace_minutes: int


@router.put("/schedule-settings")
def update_schedule_settings(body: ScheduleSettingsIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_settings_campus_id)):
    if body.mode not in ("same_for_all", "per_department"):
        fail("Invalid mode.", 400)
    cur = get_cur(db)
    cur.execute("SELECT sp_update_attendance_schedule_settings(%s,%s,%s,%s,%s)",
        (body.mode, body.default_start_time, body.default_end_time, body.grace_minutes, campus_id))
    db.commit()
    return ok(message="Schedule settings updated.")


class DepartmentScheduleIn(BaseModel):
    department_id: int
    start_time: str
    end_time: str
    grace_minutes: int


@router.post("/schedule-settings/departments")
def upsert_department_schedule(body: DepartmentScheduleIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM departments WHERE id=%s", (body.department_id,))
    _row = cur.fetchone()
    if _row: enforce_same_campus(_row["campus_id"], campus_id)
    cur.execute("SELECT * FROM sp_upsert_department_schedule(%s,%s,%s,%s)",
        (body.department_id, body.start_time, body.end_time, body.grace_minutes))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Department schedule saved.")


@router.delete("/schedule-settings/departments/{department_id}")
def delete_department_schedule(department_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM departments WHERE id=%s", (department_id,))
    _row = cur.fetchone()
    if _row: enforce_same_campus(_row["campus_id"], campus_id)
    cur.execute("SELECT sp_delete_department_schedule(%s)", (department_id,))
    db.commit()
    return ok(message="Department schedule removed.")


# --- DAILY STATUS RESOLUTION (HR: full access, HOD: auto-scoped) ---
@router.get("/dashboard-by-date")
def dashboard_by_date(date: str, department_id: Optional[int] = None,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    hod_depts = _check_view_access(db, user_id, department_id)
    cur = get_cur(db)
    if department_id is None and hod_depts is not None:
        results = []
        for d in hod_depts:
            cur.execute("SELECT * FROM sp_get_attendance_daily_status_bulk(%s,%s,%s)", (date, d, campus_id))
            results.extend([dict(r) for r in cur.fetchall()])
        return ok(data=results)
    cur.execute("SELECT * FROM sp_get_attendance_daily_status_bulk(%s,%s,%s)", (date, department_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


def _daily_status_rows(db, staff_id, from_date, to_date):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_attendance_daily_status(%s,%s,%s)", (staff_id, from_date, to_date))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["status_date"] = str(r["status_date"])
    return rows


@router.get("/my/daily-status")
def my_daily_status(from_date: str, to_date: str,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    return ok(data=_daily_status_rows(db, staff_id, from_date, to_date))


@router.get("/staff/{staff_id}/daily-status")
def staff_daily_status(staff_id: int, from_date: str, to_date: str,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    target_dept = _get_department_id_for_staff(db, staff_id)
    _check_view_access(db, user_id, target_dept)
    return ok(data=_daily_status_rows(db, staff_id, from_date, to_date))


# --- ATTENDANCE STATUS THRESHOLDS (present / half-day / absent hours, min session duration) ---
@router.get("/status-thresholds")
def get_status_thresholds(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id("attendance_thresholds"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM attendance_status_thresholds WHERE campus_id = %s OR campus_id IS NULL ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
    row = dict(cur.fetchone())
    for k in ("min_present_hours", "min_half_day_hours", "max_absent_hours"):
        row[k] = float(row[k])
    return ok(data=row)


class StatusThresholdsIn(BaseModel):
    min_present_hours: float
    min_half_day_hours: float
    max_absent_hours: float
    min_session_minutes: int


@router.put("/status-thresholds")
def update_status_thresholds(body: StatusThresholdsIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id_for_write("attendance_thresholds"))):
    cur = get_cur(db)
    cur.execute("""INSERT INTO attendance_status_thresholds (campus_id, min_present_hours, min_half_day_hours, max_absent_hours, min_session_minutes)
        VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (COALESCE(campus_id, 0)) DO UPDATE SET
        min_present_hours=%s, min_half_day_hours=%s, max_absent_hours=%s, min_session_minutes=%s""",
        (campus_id, body.min_present_hours, body.min_half_day_hours, body.max_absent_hours, body.min_session_minutes,
         body.min_present_hours, body.min_half_day_hours, body.max_absent_hours, body.min_session_minutes))
    db.commit()
    return ok(message="Attendance status thresholds updated.")


@router.post("/finalize-daily-status")
def finalize_daily_status(target_date: Optional[str] = None, user_id: int = Depends(require_permission("hr.manage")), db=Depends(get_db)):
    """Call once daily from your existing notification scheduler, to freeze
    yesterday's Present/Half Day/Absent status so later threshold changes
    never retroactively reclassify already-finalized days."""
    cur = get_cur(db)
    if target_date:
        cur.execute("SELECT * FROM sp_finalize_daily_attendance_status(%s)", (target_date,))
    else:
        cur.execute("SELECT * FROM sp_finalize_daily_attendance_status()")
    row = cur.fetchone()
    db.commit()
    return ok(data={"finalized_count": row["finalized_count"]}, message=str(row["finalized_count"]) + " staff day(s) finalized.")


# --- ATTENDANCE CORRECTION REQUESTS (employee-submitted, workflow-approved) ---
class CorrectionRequestIn(BaseModel):
    request_date: str
    session_id: Optional[int] = None
    requested_clock_in: Optional[str] = None
    requested_clock_out: Optional[str] = None
    reason: str


@router.post("/my/correction-request")
def submit_correction_request(body: CorrectionRequestIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    if not body.requested_clock_in and not body.requested_clock_out:
        fail("Provide at least a Clock In time or a Clock Out time.", 400)
    staff_id = _get_staff_id_for_user(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_correction_request(%s,%s,%s,%s,%s,%s)",
        (staff_id, body.request_date, body.session_id, body.requested_clock_in, body.requested_clock_out, body.reason))
    new_id = cur.fetchone()["id"]
    db.commit()

    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        dept_id = _get_department_id_for_staff(db, staff_id)
        cur.execute("""SELECT r.name AS role_name,
            EXISTS(SELECT 1 FROM departments WHERE head_user_id=%s) AS is_hod
            FROM user_roles ur JOIN roles r ON r.id=ur.role_id
            WHERE ur.user_id=%s LIMIT 1""", (user_id, user_id))
        rr = cur.fetchone()
        submitter_role = rr["role_name"] if rr else ""
        is_hod = bool(rr["is_hod"]) if rr else False
        wf.trigger(db, module="hr", entity_type="attendance_correction",
            entity_id=new_id, initiated_by=user_id, submitter_id=user_id,
            context={"staff_id": staff_id, "department_id": dept_id,
                     "submitter_role": submitter_role, "is_hod": is_hod})
        db.commit()
    except Exception as we:
        print(f"[attendance correction workflow] {we}")

    return ok(data={"id": new_id}, message="Correction request submitted.")


@router.get("/my/correction-requests")
def get_my_correction_requests(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = _get_staff_id_for_user(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT * FROM staff_attendance_correction_requests WHERE staff_id=%s ORDER BY created_at DESC", (staff_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/correction-requests")
def list_correction_requests(status: Optional[str] = None, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    hod_depts = _check_view_access(db, user_id, None)
    cur = get_cur(db)
    q = """SELECT cr.*, s.first_name, s.last_name, s.department_id FROM staff_attendance_correction_requests cr
        JOIN staff s ON s.id=cr.staff_id"""
    conditions = []
    params = []
    if status:
        conditions.append("cr.status=%s")
        params.append(status)
    if hod_depts is not None:
        conditions.append("s.department_id = ANY(%s)")
        params.append(hod_depts)
    if conditions:
        q += " WHERE " + " AND ".join(conditions)
    q += " ORDER BY cr.created_at DESC"
    cur.execute(q, tuple(params))
    return ok(data=[dict(r) for r in cur.fetchall()])


class CorrectionAdvanceIn(BaseModel):
    action: str
    note: Optional[str] = None


@router.post("/correction-requests/{req_id}/advance")
def advance_correction_request(req_id: int, body: CorrectionAdvanceIn,
        user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    """Advance the attendance-correction workflow - works for any step.
    Only once the workflow is fully completed does this actually apply the
    requested clock in/out change to the real attendance session."""
    if body.action not in ("approve", "reject"):
        fail("Action must be approve or reject.", 400)
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        result = wf.advance(db, "hr", "attendance_correction", req_id,
            action=body.action, actioned_by=user_id, note=body.note or body.action)
        db.commit()

        if result:
            wf_status = result.get("status", "")
            if wf_status in ("completed", "approved"):
                cur = get_cur(db)
                cur.execute("SELECT * FROM staff_attendance_correction_requests WHERE id=%s", (req_id,))
                creq = cur.fetchone()
                if creq:
                    req_date = creq["request_date"]
                    clock_in_dt = datetime.combine(req_date, creq["requested_clock_in"]) if creq["requested_clock_in"] else None
                    clock_out_dt = datetime.combine(req_date, creq["requested_clock_out"]) if creq["requested_clock_out"] else None

                    if creq["session_id"]:
                        is_late_value = None
                        if clock_in_dt:
                            is_late_value = _compute_is_late_for_staff(db, creq["staff_id"], clock_in_dt)
                        cur.execute("SELECT sp_update_attendance_session(%s,%s,%s,%s,%s)",
                            (creq["session_id"],
                             clock_in_dt.isoformat() if clock_in_dt else None,
                             clock_out_dt.isoformat() if clock_out_dt else None,
                             "Corrected via approved request #" + str(req_id),
                             is_late_value))
                    else:
                        if not clock_in_dt:
                            fail("Cannot create a new session without a Clock In time.", 400)
                        is_late_value = _compute_is_late_for_staff(db, creq["staff_id"], clock_in_dt)
                        cur.execute("SELECT * FROM sp_create_attendance_session(%s,%s,%s,%s,%s,%s)",
                            (creq["staff_id"], clock_in_dt.isoformat(),
                             clock_out_dt.isoformat() if clock_out_dt else None,
                             "Created via approved request #" + str(req_id),
                             user_id, is_late_value))

                    # If this day was already finalized (frozen), clear the stale snapshot so
                    # it recalculates fresh from the corrected session data (late flag, hours, status).
                    cur.execute("DELETE FROM staff_daily_attendance_status WHERE staff_id=%s AND status_date=%s",
                        (creq["staff_id"], req_date))

                    cur.execute("SELECT sp_review_correction_request(%s,%s,%s,%s)",
                        (req_id, "approved", user_id, body.note))
                    db.commit()
            elif wf_status in ("rejected",):
                cur = get_cur(db)
                cur.execute("SELECT sp_review_correction_request(%s,%s,%s,%s)",
                    (req_id, "rejected", user_id, body.note))
                db.commit()

        return ok(message=f"Correction request {body.action}d successfully.")
    except Exception as e:
        print(f"[correction advance] {e}")
        import traceback; traceback.print_exc()
        fail(str(e), 400)


# --- AUTO-CLOSE FORGOTTEN SESSIONS (wire into your existing scheduler) ---
@router.post("/auto-close-open-sessions")
def auto_close_open_sessions(user_id: int = Depends(require_permission("hr.manage")), db=Depends(get_db)):
    """Call once daily (e.g. just after midnight) from your existing notification scheduler."""
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_auto_close_attendance_sessions()")
    row = cur.fetchone()
    db.commit()
    return ok(data={"closed_count": row["closed_count"]}, message=str(row["closed_count"]) + " forgotten session(s) auto-closed.")
