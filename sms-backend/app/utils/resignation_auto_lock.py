"""
Resignation auto-lock scheduler.
Gated wrapper - only actually runs once the current time matches the
admin-configured resignation_auto_lock_time, and only once per day
(guarded by resignation_auto_lock_last_run) - same pattern as fee_reminders.py.

Finds staff whose resignation has an accepted last working day that has
already passed (strictly before the current processing date, so the
employee keeps normal access through their actual last day) and whose
account isn't locked for this reason yet, then:
  - sets staff.status = 'resigned'
  - deactivates their login account (users.is_active = FALSE, lock_reason = 'resigned')
This runs independently of HR manually finishing the exit/settlement
workflow ("Finalize Employee Exit") - that step still finalizes payroll/PF
records, but the account itself should stop working the day after the
employee's last working day regardless of where that paperwork stands.
"""
import psycopg2.extras
from datetime import datetime as _dt
from zoneinfo import ZoneInfo
from app.db.connection import get_db
from app.utils.processing_date import get_processing_datetime


def run_resignation_auto_lock(app, force=False):
    with app.app_context():
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT key, value FROM system_settings WHERE key IN (%s, %s)",
            ("resignation_auto_lock_time", "resignation_auto_lock_last_run"),
        )
        settings = {r["key"]: r["value"] for r in cur.fetchall()}

        now = get_processing_datetime(db)
        today = now.date()
        today_str = today.isoformat()

        if not force:
            target_time_str = settings.get("resignation_auto_lock_time") or "01:30"
            try:
                target_hour, target_minute = [int(p) for p in target_time_str.split(":")]
            except ValueError:
                target_hour, target_minute = 1, 30
            cur.execute("SELECT value FROM system_settings WHERE key = 'timezone'")
            tz_row = cur.fetchone()
            school_tz = tz_row["value"] if tz_row and tz_row["value"] else "UTC"
            try:
                now_local = now.astimezone(ZoneInfo(school_tz))
            except Exception:
                now_local = now
            target_total_minutes = target_hour * 60 + target_minute
            now_total_minutes = now_local.hour * 60 + now_local.minute
            if now_total_minutes < target_total_minutes or now_total_minutes >= target_total_minutes + 15:
                return {"ran": False, "reason": "Not within the configured time window yet."}

            if settings.get("resignation_auto_lock_last_run") == today_str:
                return {"ran": False, "reason": "Already ran today (" + today_str + ")."}

        cur.execute("""
            SELECT rr.id AS resignation_id, s.id AS staff_id, s.user_id, s.campus_id,
                   COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day) AS last_day
            FROM resignation_requests rr
            JOIN staff s ON s.id = rr.staff_id
            WHERE rr.status NOT IN ('rejected', 'withdrawn')
              AND s.status != 'resigned'
              AND COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day) IS NOT NULL
              AND COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day) < %s
        """, (today,))
        due = cur.fetchall()

        locked_count = 0
        for row in due:
            cur.execute("UPDATE staff SET status='resigned' WHERE id=%s", (row["staff_id"],))
            if row["user_id"]:
                cur.execute(
                    "UPDATE users SET is_active=FALSE, lock_reason='resigned' WHERE id=%s",
                    (row["user_id"],)
                )
                from app.utils.teacher_resignation_cleanup import cleanup_resigned_teacher_assignments
                cleanup_resigned_teacher_assignments(db, row["user_id"], row["campus_id"])
            locked_count += 1
        db.commit()

        cur.execute(
            "UPDATE system_settings SET value = %s, updated_at = %s WHERE key = 'resignation_auto_lock_last_run'",
            (today_str, now),
        )
        db.commit()

        return {"ran": True, "locked_count": locked_count}
