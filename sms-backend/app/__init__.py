from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import config
import os

jwt = JWTManager()

def create_app(env=None):
    app = Flask(__name__)
    env = env or os.getenv("FLASK_ENV", "default")
    app.config.from_object(config[env])
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    jwt.init_app(app)

    # Background scheduler - fee reminders and auto-generation
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    import atexit

    scheduler = BackgroundScheduler(daemon=True)
    _should_run_scheduler = True  # uvicorn --reload does not use WERKZEUG_RUN_MAIN (that is a Flask-only reloader mechanism) - always start here

    def run_fee_reminders_job():
        try:
            from app.utils.fee_reminders import run_fee_reminders_scheduled
            result = run_fee_reminders_scheduled(app, force=False)
            if result.get("ran"):
                app.logger.info(f"Fee reminders ran: {result.get('results')}")
            else:
                app.logger.info("Fee reminders check: " + result.get("reason", ""))
        except Exception as e:
            app.logger.error(f"Fee reminder job failed: {e}")

    def run_attendance_auto_close_job():
        try:
            from app.utils.attendance_auto_close import run_attendance_auto_close_scheduled
            result = run_attendance_auto_close_scheduled(app, force=False)
            if result.get("ran"):
                app.logger.info("Attendance auto-close: " + str(result.get("closed_count")) + " session(s) closed.")
            else:
                app.logger.info("Attendance auto-close check: " + result.get("reason", ""))
        except Exception as e:
            app.logger.error("Attendance auto-close job failed: " + str(e))

    def run_attendance_finalize_job():
        try:
            from app.utils.attendance_finalize import run_attendance_finalize_scheduled
            result = run_attendance_finalize_scheduled(app, force=False)
            if result.get("ran"):
                app.logger.info("Attendance finalize: " + str(result.get("finalized_count")) + " staff day(s) finalized.")
            else:
                app.logger.info("Attendance finalize check: " + result.get("reason", ""))
        except Exception as e:
            app.logger.error("Attendance finalize job failed: " + str(e))

    def run_fee_auto_generation_job():
        try:
            from app.utils.fee_automation import run_fee_auto_generation
            result = run_fee_auto_generation(app, force=False)
            if result.get("ran"):
                app.logger.info("Fee auto-generation: " + str(result.get("total_generated")) + " invoices generated for " + result.get("month") + ".")
            else:
                app.logger.info("Fee auto-generation check: " + result.get("reason", ""))
        except Exception as e:
            app.logger.error("Fee auto-generation job failed: " + str(e))

    if _should_run_scheduler:
        scheduler.add_job(func=run_fee_reminders_job, trigger=CronTrigger(minute="*/15"),
                          id="fee_reminders", replace_existing=True)
        scheduler.add_job(func=run_fee_auto_generation_job, trigger=CronTrigger(minute="*/15"),
                          id="fee_auto_generation", replace_existing=True)
        scheduler.add_job(func=run_attendance_auto_close_job, trigger=CronTrigger(minute="*/15"),
                          id="attendance_auto_close", replace_existing=True)
        scheduler.add_job(func=run_attendance_finalize_job, trigger=CronTrigger(minute="*/15"),
                          id="attendance_finalize", replace_existing=True)
        scheduler.start()
        atexit.register(lambda: scheduler.shutdown(wait=False))
        app.logger.info("Background scheduler started.")

    from app.db.connection import init_pool
    init_pool(app)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "v1"}

    return app
