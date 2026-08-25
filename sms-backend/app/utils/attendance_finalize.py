"""
Attendance daily-status finalization scheduler.
Gated wrapper - only actually runs once the current time matches the
admin-configured attendance_finalize_time, and only once per day
(guarded by attendance_finalize_last_run) - same pattern as fee_reminders.py.
Config from system_settings (category=attendance):
  attendance_finalize_time      - HH:MM (24hr), time of day the scheduled run should fire
  attendance_finalize_last_run  - YYYY-MM-DD of the last date the scheduled run completed

Freezes YESTERDAY status_date, once per day, so later changes to the
Present/Half Day/Absent hour thresholds never retroactively reclassify
already-finalized days (matches how the late-arrival flag is snapshotted).
"""
import psycopg2.extras
from datetime import datetime as _dt, timedelta as _td
from app.db.connection import get_db
from app.utils.processing_date import get_processing_datetime


def run_attendance_finalize_scheduled(app, force=False):
    with app.app_context():
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT key, value FROM system_settings WHERE key IN (%s, %s)",
            ("attendance_finalize_time", "attendance_finalize_last_run"),
        )
        settings = {r["key"]: r["value"] for r in cur.fetchall()}

        # Use the application's simulated processing date/time, not the real
        # system clock - otherwise this scheduler only ever finalizes "real
        # yesterday" and never advances alongside a manually-set processing
        # date, leaving attendance permanently unfinalized ("pending") for
        # any date around the simulated "today".
        now = get_processing_datetime(db)
        today_str = now.date().isoformat()

        if not force:
            target_time_str = settings.get("attendance_finalize_time") or "00:30"
            try:
                target_hour, target_minute = [int(p) for p in target_time_str.split(":")]
            except ValueError:
                target_hour, target_minute = 0, 30
            target_total_minutes = target_hour * 60 + target_minute
            now_total_minutes = now.hour * 60 + now.minute
            if now_total_minutes < target_total_minutes or now_total_minutes >= target_total_minutes + 15:
                return {"ran": False, "reason": "Not within the configured time window yet."}

            if settings.get("attendance_finalize_last_run") == today_str:
                return {"ran": False, "reason": "Already ran today (" + today_str + ")."}

        yesterday = (now.date() - _td(days=1)).isoformat()
        cur.execute("SELECT * FROM sp_finalize_daily_attendance_status(%s)", (yesterday,))
        result = cur.fetchone()
        finalized_count = result["finalized_count"] if result else 0

        cur.execute(
            "UPDATE system_settings SET value = %s, updated_at = %s WHERE key = \'attendance_finalize_last_run\'",
            (today_str, now),
        )
        db.commit()

        return {"ran": True, "finalized_count": finalized_count}
