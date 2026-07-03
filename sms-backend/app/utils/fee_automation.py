import psycopg2.extras
import calendar
from datetime import date, datetime as _dt


def run_fee_auto_generation(app, force=False):
    """Core auto-generation check, shared by the scheduled job and the
    manual 'Test Now' endpoint. With force=True, the day-of-month and
    time-of-day gates are skipped, but the same-month duplicate guard
    (fee_auto_generate_last_run) still applies unless also bypassed by
    the caller resetting that setting first - this keeps 'Test Now'
    honest about whether this month already ran, while still letting an
    admin verify the pipeline fires correctly.
    Returns a dict describing what happened, for the caller to report back.
    """
    from app.db.connection import get_db

    with app.app_context():
        db_conn = get_db()
        cur = db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT key, value FROM system_settings WHERE key IN (%s, %s, %s, %s)",
            ("fee_auto_generate_enabled", "fee_auto_generate_day",
             "fee_auto_generate_last_run", "fee_auto_generate_time"),
        )
        settings = {r["key"]: r["value"] for r in cur.fetchall()}

        if not force and settings.get("fee_auto_generate_enabled") != "true":
            return {"ran": False, "reason": "Auto-generation is disabled."}

        now = _dt.now()
        today = now.date()
        target_day = int(settings.get("fee_auto_generate_day") or 1)
        this_month_str = today.strftime("%Y-%m")

        last_day_this_month = calendar.monthrange(today.year, today.month)[1]
        effective_target_day = min(target_day, last_day_this_month)

        if not force and today.day != effective_target_day:
            return {"ran": False, "reason": "Today is not the configured day (" + str(effective_target_day) + ")."}

        if not force:
            target_time_str = settings.get("fee_auto_generate_time") or "01:00"
            try:
                target_hour, target_minute = [int(p) for p in target_time_str.split(":")]
            except ValueError:
                target_hour, target_minute = 1, 0
            target_total_minutes = target_hour * 60 + target_minute
            now_total_minutes = now.hour * 60 + now.minute
            if now_total_minutes < target_total_minutes or now_total_minutes >= target_total_minutes + 15:
                return {"ran": False, "reason": "Not within the configured time window yet."}

        if settings.get("fee_auto_generate_last_run") == this_month_str:
            return {"ran": False, "reason": "Already generated for " + this_month_str + " this month."}

        from app.api.v1.finance import _run_smart_monthly_generation

        target_month = date(today.year, today.month, 1)

        cur.execute(
            "SELECT u.id FROM users u "
            "JOIN user_roles ur ON ur.user_id = u.id "
            "JOIN roles r ON r.id = ur.role_id "
            "WHERE r.name = 'superadmin' AND u.is_active = TRUE "
            "ORDER BY u.id LIMIT 1"
        )
        row = cur.fetchone()
        system_user_id = row["id"] if row else None
        if not system_user_id:
            return {"ran": False, "reason": "No active superadmin found to attribute invoices to."}

        cur.execute("SELECT value FROM system_settings WHERE key = 'fee_due_day'")
        due_day_row = cur.fetchone()
        raw_due_day = int(due_day_row["value"]) if due_day_row and due_day_row["value"] else 10
        last_day_for_due = calendar.monthrange(today.year, today.month)[1]
        due_day = min(raw_due_day, last_day_for_due)

        result = _run_smart_monthly_generation(cur, db_conn, system_user_id, today.year, today.month, due_day)
        total = result["generated"]

        cur.execute(
            "UPDATE system_settings SET value = %s, updated_at = NOW() WHERE key = 'fee_auto_generate_last_run'",
            (this_month_str,),
        )
        db_conn.commit()

        return {"ran": True, "total_generated": total, "month": this_month_str}
