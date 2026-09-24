"""
FastAPI entry point for the SMS backend.

Migration strategy: this FastAPI app is the new front door. Any route not yet
natively implemented in FastAPI falls through to the existing, fully-working
Flask app (mounted as a WSGI sub-application at "/"). As modules get migrated,
their native FastAPI routers are registered here BEFORE the Flask mount, so
Starlette matches them first and only unmigrated paths ever reach Flask.

Run with:  python -m uvicorn main:app --reload --port 5000
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware
from a2wsgi import WSGIMiddleware

from app import create_app as create_flask_app

# The existing, unmodified Flask app - this keeps working exactly as before
# for every module that hasn't been migrated yet.
flask_app = create_flask_app()

app = FastAPI(title="SMS API", version="1.0.0")

# Matches the existing Flask CORS config (flask_cors: origins="*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException as FastAPIHTTPException


@app.exception_handler(FastAPIHTTPException)
async def custom_http_exception_handler(request: Request, exc: FastAPIHTTPException):
    """
    FastAPI's HTTPException always wraps the detail in {"detail": ...}, but the
    existing frontend expects Flask's original shape: {"status": "error", "message": "..."}
    directly at the top level (used by err.response?.data?.message throughout the
    React app). Our own fail() helper and the auth/permission dependencies already
    pass a dict detail in the correct flat shape - this just removes FastAPI's
    extra "detail" wrapper so it reaches the frontend unchanged.
    """
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"status": "error", "message": str(exc.detail)})


@app.get("/api/health-fastapi")
def health_check():
    """Separate health endpoint to confirm FastAPI itself is alive and routing correctly."""
    return {"status": "ok", "server": "fastapi"}


from app.api.v1.procurement import router as procurement_router
from app.api.v1.library import router as library_router

# ── Native FastAPI routers get registered here as modules are migrated ──
from app.api.v1.students import router as students_router
from app.api.v1.teachers import router as teachers_router
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.academics import router as academics_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.materials import router as materials_router
from app.api.v1.diary import router as diary_router
from app.api.v1.assignments import router as assignments_router
from app.api.v1.quizzes import router as quizzes_router
from app.api.v1.syllabus import router as syllabus_router
from app.api.v1.calendar import router as calendar_router
from app.api.v1.announcements import router as announcements_router
from app.api.v1.communication import router as communication_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.config import router as config_router
from app.api.v1.settings import router as settings_router
from app.api.v1.leave_setup import router as leave_setup_router
from app.api.v1.leaves import router as leaves_router
from app.api.v1.withdrawal import router as withdrawal_router
from app.api.v1.discipline import router as discipline_router
from app.api.v1.hr import router as hr_router
from app.api.v1.staff_attendance import router as staff_attendance_router
from app.api.v1.payroll import router as payroll_router
from app.api.v1.provident_fund import router as provident_fund_router
from app.api.v1.income_tax import router as income_tax_router
from app.api.v1.reports import router as reports_router
from app.api.v1.report_permissions import router as report_permissions_router
from app.api.v1.request_permissions import router as request_permissions_router
from app.api.v1.processing_date import router as processing_date_router
from app.api.v1.resignation import router as resignation_router
from app.api.v1.discounts import router as discounts_router
from app.api.v1.finance import router as finance_router
from app.api.v1.exams import router as exams_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.work_queue import router as work_queue_router
from app.api.v1.workflow import router as workflow_router
from app.api.v1.campuses import router as campuses_router

app.include_router(procurement_router, prefix="/api/v1/procurement")
app.include_router(library_router, prefix="/api/v1/library")
app.include_router(students_router, prefix="/api/v1/students")
app.include_router(teachers_router, prefix="/api/v1/teachers")
app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(users_router, prefix="/api/v1/users")
app.include_router(academics_router, prefix="/api/v1/academics")
app.include_router(attendance_router, prefix="/api/v1/attendance")
app.include_router(materials_router, prefix="/api/v1/materials")
app.include_router(diary_router, prefix="/api/v1/diary")
app.include_router(assignments_router, prefix="/api/v1/assignments")
app.include_router(quizzes_router, prefix="/api/v1/quizzes")
app.include_router(syllabus_router, prefix="/api/v1/syllabus")
app.include_router(calendar_router, prefix="/api/v1/calendar")
app.include_router(announcements_router, prefix="/api/v1/announcements")
app.include_router(communication_router, prefix="/api/v1/communication")
app.include_router(notifications_router, prefix="/api/v1/notifications")
app.include_router(config_router, prefix="/api/v1/config")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(leave_setup_router, prefix="/api/v1/leave-setup")
app.include_router(leaves_router, prefix="/api/v1/leaves")
app.include_router(withdrawal_router, prefix="/api/v1/withdrawal")
app.include_router(discipline_router, prefix="/api/v1/discipline")
app.include_router(hr_router, prefix="/api/v1")
app.include_router(staff_attendance_router, prefix="/api/v1/staff-attendance")
app.include_router(payroll_router, prefix="/api/v1/payroll")
app.include_router(provident_fund_router, prefix="/api/v1/payroll/pf")
app.include_router(income_tax_router, prefix="/api/v1/payroll/income-tax")
app.include_router(reports_router, prefix="/api/v1/reports")
app.include_router(report_permissions_router, prefix="/api/v1/admin")
app.include_router(request_permissions_router, prefix="/api/v1/admin")
app.include_router(processing_date_router, prefix="/api/v1/system")

@app.on_event("startup")
def _start_processing_date_scheduler():
    from app.utils.processing_date_scheduler import start_scheduler
    start_scheduler()
app.include_router(resignation_router, prefix="/api/v1/resignation")
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.include_router(discounts_router, prefix="/api/v1/discounts")
app.include_router(finance_router, prefix="/api/v1/finance")
app.include_router(exams_router, prefix="/api/v1/exams")
app.include_router(dashboard_router, prefix="/api/v1/dashboard")
app.include_router(work_queue_router, prefix="/api/v1/work-queue")
app.include_router(workflow_router, prefix="/api/v1/workflow")
app.include_router(campuses_router, prefix="/api/v1/campuses")


# Fallback: anything not yet natively handled by FastAPI falls through to Flask.
# This MUST be registered last so explicit FastAPI routes above take precedence.
app.mount("/", WSGIMiddleware(flask_app))
