"""
Dedicated background-job process for the SMS backend.

Run exactly this, alongside the API (never inside it):
    python scheduler_service.py

The API (uvicorn main:app, any number of workers, --reload or not) no longer
starts any scheduler. Only this process runs background jobs, and it holds a
PostgreSQL session-level advisory lock for its whole lifetime: a second copy
started anywhere (same server or another one) logs a message and exits.

Jobs (logic unchanged - same functions as before):
  1. fee_reminders            every 15 min (its own time/day gate decides)
  2. fee_auto_generation      every minute, Asia/Karachi (catches up missed runs)
  3. attendance_auto_close    every 15 min
  4. attendance_finalize      every 15 min
  5. resignation_auto_lock    every 15 min
  6. advance_processing_date  00:00 school time   (moved from main.py startup)
  7. deactivate_expired_resignations 00:05 school time (moved from main.py startup)
On start it also runs the processing-date catch-up, as main.py used to.
"""
import logging
import os
import signal
import sys
from logging.handlers import RotatingFileHandler

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

SCHEDULER_SINGLETON_LOCK_KEY = 72410000      # held for the life of this process
SCHOOL_TZ_NAME = "Asia/Karachi"

logger = logging.getLogger("sms.scheduler")


def setup_logging():
    os.makedirs("logs", exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    file_h = RotatingFileHandler(os.path.join("logs", "scheduler.log"), maxBytes=5_000_000, backupCount=10, encoding="utf-8")
    file_h.setFormatter(fmt)
    root.handlers[:] = [console, file_h]
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


def school_tz():
    from app.utils.fee_automation import resolve_school_tz
    tz, label = resolve_school_tz(SCHOOL_TZ_NAME)
    return tz, label


def acquire_singleton(db_module):
    """Takes the process-wide lock on a dedicated connection that is never returned to the pool."""
    conn = db_module._pool.getconn()
    cur = conn.cursor()
    cur.execute("SELECT pg_try_advisory_lock(%s)", (SCHEDULER_SINGLETON_LOCK_KEY,))
    got = cur.fetchone()[0]
    conn.commit()
    if not got:
        db_module._pool.putconn(conn)
        return None
    return conn


def main():
    setup_logging()
    # Load main.py once, exactly like the API process does. Many modules (the
    # fee generator's notifications included) do `import main as _main` lazily
    # and use main.flask_app; if main were first imported inside a job it would
    # run create_app() again mid-job. Importing it here makes those later
    # imports no-ops and gives every job the same Flask app and DB pool.
    # (main.py no longer starts any scheduler, so this starts nothing extra.)
    import main as api_main
    from app.db import connection as db_module

    app = api_main.flask_app
    tz, tz_label = school_tz()

    lock_conn = acquire_singleton(db_module)
    if lock_conn is None:
        logger.error("Another scheduler process is already running (advisory lock %s is held). Exiting.",
                     SCHEDULER_SINGLETON_LOCK_KEY)
        sys.exit(2)
    logger.info("Scheduler singleton lock acquired. School timezone: %s.", tz_label)

    # ---------------------------------------------------------------- job wrappers
    def gated(name, target, summary):
        """target = "module:function"; imported inside the job (as create_app did),
        so one broken module only affects its own job."""
        mod_name, func_name = target.split(":")
        def _job():
            try:
                import importlib
                func = getattr(importlib.import_module(mod_name), func_name)
                result = func(app, force=False)
                if result.get("ran"):
                    logger.info("%s: %s", name, summary(result))
                else:
                    logger.info("%s check: %s", name, result.get("reason", ""))
            except Exception:
                logger.exception("%s job failed.", name)
        _job.__name__ = name
        return _job

    from app.utils import processing_date_scheduler as pds

    def lock_heartbeat():
        """If the DB connection holding the singleton lock dies, the lock is gone - exit so a
        supervisor restarts us cleanly instead of risking a second instance."""
        try:
            c = lock_conn.cursor()
            c.execute("SELECT 1")
            lock_conn.commit()
        except Exception:
            logger.exception("Lost the scheduler lock connection - exiting so it can be restarted.")
            os._exit(3)

    common = dict(max_instances=1, coalesce=True, misfire_grace_time=3600, replace_existing=True)
    sched = BlockingScheduler(timezone=tz, job_defaults={"max_instances": 1, "coalesce": True, "misfire_grace_time": 3600})

    sched.add_job(gated("fee_reminders", "app.utils.fee_reminders:run_fee_reminders_scheduled", lambda r: str(r.get("results"))),
                  CronTrigger(minute="*/15", timezone=tz), id="fee_reminders", **common)
    sched.add_job(gated("fee_auto_generation", "app.utils.fee_automation:run_fee_auto_generation",
                        lambda r: f"{r.get('total_generated')} invoices generated for {r.get('month')}"
                                  + (" (catch-up)" if r.get("catch_up") else "")),
                  CronTrigger(minute="*", timezone=tz), id="fee_auto_generation", **common)
    sched.add_job(gated("attendance_auto_close", "app.utils.attendance_auto_close:run_attendance_auto_close_scheduled",
                        lambda r: f"{r.get('closed_count')} session(s) closed"),
                  CronTrigger(minute="*/15", timezone=tz), id="attendance_auto_close", **common)
    sched.add_job(gated("attendance_finalize", "app.utils.attendance_finalize:run_attendance_finalize_scheduled",
                        lambda r: f"{r.get('finalized_count')} staff day(s) finalized"),
                  CronTrigger(minute="*/15", timezone=tz), id="attendance_finalize", **common)
    sched.add_job(gated("resignation_auto_lock", "app.utils.resignation_auto_lock:run_resignation_auto_lock",
                        lambda r: f"{r.get('locked_count')} account(s) locked"),
                  CronTrigger(minute="*/15", timezone=tz), id="resignation_auto_lock", **common)
    sched.add_job(pds.advance_processing_date_job, CronTrigger(hour=0, minute=0, timezone=tz),
                  id="advance_processing_date", **common)
    sched.add_job(pds.deactivate_expired_resignations_job, CronTrigger(hour=0, minute=5, timezone=tz),
                  id="deactivate_expired_resignations", **common)
    sched.add_job(lock_heartbeat, CronTrigger(minute="*/5", timezone=tz), id="lock_heartbeat", **common)

    # previously done by main.py's startup hook in every worker
    try:
        pds.catch_up_processing_date()
        pds.deactivate_expired_resignations_job()
    except Exception:
        logger.exception("Startup processing-date catch-up failed.")

    def shutdown(signum, _frame):
        logger.info("Signal %s received - shutting down scheduler.", signum)
        sched.shutdown(wait=False)
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info("Scheduler started with jobs: %s", ", ".join(j.id for j in sched.get_jobs()))
    try:
        sched.start()
    finally:
        try:
            cur = lock_conn.cursor()
            cur.execute("SELECT pg_advisory_unlock(%s)", (SCHEDULER_SINGLETON_LOCK_KEY,))
            lock_conn.commit()
            lock_conn.close()
        except Exception:
            pass
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    main()
