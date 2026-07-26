"""
Native FastAPI router for Attendance - migrated from app/api/v1/attendance.py.
Bridges into AttendanceService (already stored-proc-based via
AttendanceRepository) via Flask's app_context() for /mark and the two routes
that use the service directly. All other routes had inline SQL directly in
the Flask blueprint, now converted to dedicated stored procedures and native
FastAPI DB access.
"""

from typing import Optional
from datetime import date as date_cls
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def _flask_app():
    import main
    return main.flask_app


class MarkAttendanceIn(BaseModel):
    class_id: int
    subject_id: Optional[int] = None
    date: Optional[str] = None
    records: list


@router.post("/mark")
def mark_attendance(body: MarkAttendanceIn, marked_by: int = Depends(require_permission("attendance.create")), db=Depends(get_db)):
    att_date = body.date or date_cls.today().isoformat()
    cur = get_cur(db)

    cur.execute("SELECT sp_check_holiday(%s::date) AS title", (att_date,))
    holiday_title = cur.fetchone()["title"]
    if holiday_title:
        fail("Cannot mark attendance on holiday: " + holiday_title + ".", 400)

    cur.execute("SELECT sp_get_attendance_marker_config() AS cfg")
    marker_config = cur.fetchone()["cfg"]

    if marker_config == "incharge_only" and body.class_id:
        cur.execute("SELECT sp_can_mark_class_attendance(%s, %s) AS can_mark", (marked_by, body.class_id))
        if not cur.fetchone()["can_mark"]:
            fail("Only class incharge can mark attendance as per school configuration.", 403)

    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        try:
            result = AttendanceService().mark(body.dict(), marked_by)
        except ValueError as e:
            fail(str(e), 400)
    return ok(data=result, message="Attendance recorded.")


@router.get("/class/{class_id}")
def class_attendance(
    class_id: int, date: Optional[str] = Query(None), subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("attendance.view")),
):
    if not date:
        fail("date query param required (YYYY-MM-DD)", 400)
    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        data = AttendanceService().get_class_attendance(class_id, date, subject_id)
    return ok(data=data)


@router.get("/student/{student_id}")
def student_attendance(
    student_id: int, from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = Query(None),
    subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("attendance.view")),
):
    if not from_ or not to:
        fail("from and to query params required (YYYY-MM-DD)", 400)
    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        data = AttendanceService().get_student_attendance(student_id, from_, to, subject_id)
    return ok(data=data)


@router.get("/student/{student_id}/summary")
def attendance_summary(student_id: int, month: Optional[str] = Query(None), user_id: int = Depends(require_permission("attendance.view"))):
    month = month or date_cls.today().strftime("%Y-%m-01")
    with _flask_app().app_context():
        from app.services.attendance_service import AttendanceService
        data = AttendanceService().get_monthly_summary(student_id, month)
    return ok(data=data)


@router.get("/my")
def my_attendance(
    from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = Query(None),
    subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("attendance.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
    row = cur.fetchone()
    if not row or not row["sid"]:
        fail("Student not found.", 404)
    student_id = row["sid"]

    from_date = from_ or date_cls.today().strftime("%Y-%m-01")
    to_date = to or date_cls.today().isoformat()

    cur.execute("SELECT * FROM sp_get_student_attendance_range(%s, %s, %s, %s)", (student_id, from_date, to_date, subject_id))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["date"] = str(r["date"])

    cur.execute("SELECT * FROM sp_get_my_attendance_summary(%s, %s, %s, %s)", (student_id, from_date, to_date, subject_id))
    summary = dict(cur.fetchone())
    total = summary["total"] or 0
    summary["pct"] = round(summary["present"] / total * 100, 1) if total > 0 else 0

    return ok(data={"records": rows, "summary": summary})


@router.get("/teacher-report")
def teacher_attendance_report(
    from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = Query(None),
    class_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("attendance.view")), db=Depends(get_db),
):
    from_date = from_ or date_cls.today().strftime("%Y-%m-01")
    to_date = to or date_cls.today().isoformat()
    cur = get_cur(db)

    cur.execute("SELECT * FROM sp_get_teacher_incharge_classes(%s)", (user_id,))
    classes = [dict(r) for r in cur.fetchall()]
    if class_id:
        classes = [c for c in classes if c["id"] == class_id]

    report = []
    for cls in classes:
        cur.execute("SELECT * FROM sp_get_class_student_attendance_report(%s, %s, %s)", (cls["id"], from_date, to_date))
        students = [dict(r) for r in cur.fetchall()]
        for s in students:
            s["pct"] = float(s["pct"] or 0)
        report.append({
            "class_id": cls["id"], "class_name": cls["name"], "section": cls["section"],
            "is_incharge": True, "students": students,
        })

    cur.execute("SELECT * FROM sp_get_withdrawn_students_for_teacher(%s)", (user_id,))
    withdrawn = [dict(r) for r in cur.fetchall()]
    for w in withdrawn:
        for k in ("effective_date", "withdrawal_date"):
            if w.get(k):
                w[k] = str(w[k])

    return ok(data={"report": report, "withdrawn_students": withdrawn, "from": from_date, "to": to_date})


@router.get("/report")
def attendance_report(
    date: Optional[str] = Query(None), class_id: Optional[int] = Query(None),
    subject_id: Optional[int] = Query(None), breakdown: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("attendance.report")), db=Depends(get_db),
):
    report_date = date or date_cls.today().isoformat()
    cur = get_cur(db)
    if breakdown == "true":
        cur.execute("SELECT * FROM sp_get_attendance_report_breakdown(%s, %s, %s)", (report_date, class_id, subject_id))
    else:
        cur.execute("SELECT * FROM sp_get_attendance_report(%s, %s, %s)", (report_date, class_id, subject_id))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/config")
def get_attendance_config(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_attendance_config()")
    data = {r["key"]: r["value"] for r in cur.fetchall()}
    return ok(data=data)


@router.get("/admin-report")
def admin_attendance_report(
    from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = Query(None),
    class_id: Optional[int] = Query(None),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db),
):
    from_date = from_ or date_cls.today().strftime("%Y-%m-01")
    to_date = to or date_cls.today().isoformat()
    cur = get_cur(db)

    cur.execute("SELECT * FROM sp_get_admin_report_classes(%s)", (class_id,))
    classes = [dict(r) for r in cur.fetchall()]

    report = []
    for cls in classes:
        cur.execute("SELECT * FROM sp_get_admin_class_stats(%s, %s, %s)", (cls["id"], from_date, to_date))
        stats = dict(cur.fetchone())
        total_records = (stats["present"] or 0) + (stats["absent"] or 0) + (stats["late"] or 0) + (stats["on_leave"] or 0)
        pct = round((stats["present"] or 0) / total_records * 100, 1) if total_records > 0 else 0
        report.append({
            "class_id": cls["id"], "class_name": cls["name"], "section": cls["section"],
            "incharge_name": cls.get("incharge_name"),
            "days_marked": stats["days_marked"] or 0,
            "total_students": stats["total_students"] or 0,
            "present": stats["present"] or 0, "absent": stats["absent"] or 0,
            "late": stats["late"] or 0, "on_leave": stats["on_leave"] or 0,
            "attendance_pct": pct, "is_marked": stats["marked_today"],
        })

    return ok(data={"report": report, "from": from_date, "to": to_date})


@router.get("/student-report")
def student_attendance_report(
    from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = Query(None),
    class_id: Optional[int] = Query(None), search: Optional[str] = Query(""),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db),
):
    from_date = from_ or date_cls.today().strftime("%Y-%m-01")
    to_date = to or date_cls.today().isoformat()
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_student_attendance_report(%s, %s, %s, %s)", (class_id, search.strip() if search else None, from_date, to_date))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        total = (r["present"] or 0) + (r["absent"] or 0) + (r["late"] or 0)
        r["pct"] = round((r["present"] or 0) / total * 100, 1) if total > 0 else 0
    return ok(data=rows)
