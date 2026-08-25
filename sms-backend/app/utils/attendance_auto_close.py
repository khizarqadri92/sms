"""
Attendance auto-close scheduler.
Gated wrapper - only actually runs once the current time matches the
admin-configured attendance_auto_close_time, and only once per day
(guarded by attendance_auto_close_last_run) - same pattern as fee_reminders.py.
Config from system_settings (category=attendance):
  attendance_auto_close_time      - HH:MM (24hr), time of day the scheduled run should fire
  attendance_auto_close_last_run  - YYYY-MM-DD of the last date the scheduled run completed
"""
import psycopg2.extras
from datetime import datetime as _dt
from app.db.connection import get_db
from app.utils.processing_date import get_processing_datetime


def run_attendance_auto_close_scheduled(app, force=False):
    """Gated wrapper for the scheduler. Checks the admin-configured
    attendance_auto_close_time and a same-day duplicate guard
    (attendance_auto_close_last_run), then closes any still-open
    attendance sessions if due. With force=True both gates are skipped.
    Returns a dict describing what happened."""
    with app.app_context():
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT key, value FROM system_settings WHERE key IN (%s, %s)",
            ("attendance_auto_close_time", "attendance_auto_close_last_run"),
        )
        settings = {r["key"]: r["value"] for r in cur.fetchall()}

        now = get_processing_datetime(db)
        today_str = now.date().isoformat()

        if not force:
            target_time_str = settings.get("attendance_auto_close_time") or "20:00"
            try:
                target_hour, target_minute = [int(p) for p in target_time_str.split(":")]
            except ValueError:
                target_hour, target_minute = 20, 0
            target_total_minutes = target_hour * 60 + target_minute
            now_total_minutes = now.hour * 60 + now.minute
            if now_total_minutes < target_total_minutes or now_total_minutes >= target_total_minutes + 15:
                return {"ran": False, "reason": "Not within the configured time window yet."}

            if settings.get("attendance_auto_close_last_run") == today_str:
                return {"ran": False, "reason": "Already ran today (" + today_str + ")."}

        cur.execute("SELECT * FROM sp_auto_close_attendance_sessions()")
        result = cur.fetchone()
        closed_count = result["closed_count"] if result else 0

        cur.execute(
            "UPDATE system_settings SET value = %s, updated_at = %s WHERE key = \'attendance_auto_close_last_run\'",
            (today_str, now),
        )
        db.commit()

        return {"ran": True, "closed_count": closed_count}
