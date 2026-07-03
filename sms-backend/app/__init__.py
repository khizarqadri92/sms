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

    # Start background scheduler for fee reminders
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    import atexit

    scheduler = BackgroundScheduler(daemon=True)
    _should_run_scheduler = not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"

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

    # Polls every 15 minutes; actual run time is configurable via fee_reminder_time setting
    if _should_run_scheduler:
        scheduler.add_job(
            func=run_fee_reminders_job,
            trigger=CronTrigger(minute="*/15"),
            id="fee_reminders",
            replace_existing=True
        )
        scheduler.start()
        atexit.register(lambda: scheduler.shutdown(wait=False))
        app.logger.info("Fee reminder scheduler started - polls every 15 minutes, configurable run time")

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
        scheduler.add_job(
            func=run_fee_auto_generation_job,
            trigger=CronTrigger(minute="*/15"),
            id="fee_auto_generation",
            replace_existing=True
        )

    from app.db.connection import init_pool
    init_pool(app)

    from app.api.v1.auth          import bp as auth_bp
    from app.api.v1.users         import bp as users_bp
    from app.api.v1.students      import bp as students_bp
    from app.api.v1.teachers      import bp as teachers_bp
    from app.api.v1.academics     import bp as academics_bp
    from app.api.v1.attendance    import bp as attendance_bp
    from app.api.v1.finance       import bp as finance_bp
    from app.api.v1.diary         import bp as diary_bp
    from app.api.v1.materials     import bp as materials_bp
    from app.api.v1.assignments   import bp as assignments_bp
    from app.api.v1.quizzes       import bp as quizzes_bp
    from app.api.v1.calendar      import bp as calendar_bp
    from app.api.v1.announcements import bp as announcements_bp
    from app.api.v1.communication import bp as communication_bp
    from app.api.v1.dashboard     import bp as dashboard_bp
    from app.api.v1.settings      import bp as settings_bp
    from app.api.v1.notifications import bp as notifications_bp
    from app.api.v1.discounts    import bp as discounts_bp
    from app.api.v1.leaves       import bp as leaves_bp
    from app.api.v1.syllabus     import bp as syllabus_bp
    from app.api.v1.withdrawal   import bp as withdrawal_bp
    from app.api.v1.discipline   import bp as discipline_bp
    from app.api.v1.config       import bp as config_bp
    from app.api.v1.exams        import bp as exams_bp
    from app.api.v1.leave_setup  import bp as leave_setup_bp

    prefix = "/api/v1"
    app.register_blueprint(auth_bp,          url_prefix=f"{prefix}/auth")
    app.register_blueprint(users_bp,         url_prefix=f"{prefix}/users")
    app.register_blueprint(students_bp,      url_prefix=f"{prefix}/students")
    app.register_blueprint(teachers_bp,      url_prefix=f"{prefix}/teachers")
    app.register_blueprint(academics_bp,     url_prefix=f"{prefix}/academics")
    app.register_blueprint(attendance_bp,    url_prefix=f"{prefix}/attendance")
    app.register_blueprint(finance_bp,       url_prefix=f"{prefix}/finance")
    app.register_blueprint(diary_bp,          url_prefix=f"{prefix}/diary")
    app.register_blueprint(materials_bp,      url_prefix=f"{prefix}/materials")
    app.register_blueprint(assignments_bp,    url_prefix=f"{prefix}/assignments")
    app.register_blueprint(quizzes_bp,        url_prefix=f"{prefix}/quizzes")
    app.register_blueprint(calendar_bp,       url_prefix=f"{prefix}/calendar")
    app.register_blueprint(announcements_bp,  url_prefix=f"{prefix}/announcements")
    app.register_blueprint(communication_bp, url_prefix=f"{prefix}/communication")
    app.register_blueprint(dashboard_bp,     url_prefix=f"{prefix}/dashboard")
    app.register_blueprint(settings_bp,      url_prefix=f"{prefix}/settings")
    app.register_blueprint(discounts_bp,     url_prefix=f"{prefix}/discounts")
    app.register_blueprint(leaves_bp,        url_prefix=f"{prefix}/leaves")
    app.register_blueprint(syllabus_bp,      url_prefix=f"{prefix}/syllabus")
    app.register_blueprint(withdrawal_bp,    url_prefix=f"{prefix}/withdrawal")
    app.register_blueprint(discipline_bp,    url_prefix=f"{prefix}/discipline")
    app.register_blueprint(config_bp,        url_prefix=f"{prefix}/config")
    app.register_blueprint(exams_bp,         url_prefix=f"{prefix}/exams")
    app.register_blueprint(leave_setup_bp,   url_prefix=f"{prefix}/leave-setup")
    app.register_blueprint(notifications_bp, url_prefix=f"{prefix}/notifications")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "v1"}

    return app

