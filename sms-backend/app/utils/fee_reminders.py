"""
Fee reminder, late fee, and account lock scheduler.

The core logic (run_fee_reminders) can be triggered two ways:
  1. Manually, via POST /api/v1/finance/run-fee-reminders (the "Run Now" button) -
     runs immediately, no time/duplicate checks.
  2. On a schedule, via run_fee_reminders_scheduled(app), polled every 15 minutes
     by APScheduler. Only actually runs once the current time matches the
     admin-configured fee_reminder_time, and only once per day.

Config from system_settings (category=fee_settings):
  fee_grace_days       - days after due_date before late fee starts / 1st reminder
  fee_reminder1_days    - days after due_date for 1st notice
  fee_reminder2_days    - days after due_date for 2nd notice
  fee_lock_days        - days after due_date to lock account
  fee_reminder_time     - HH:MM (24hr), time of day the scheduled run should fire
  fee_reminder_last_run - YYYY-MM-DD of the last date the scheduled run completed

Late fee config comes from each invoice own late_fee_type/late_fee_amount,
snapshotted from class_fee_config at invoice-generation time:
  none       - no late fee
  fixed      - flat Rs. amount, applied once overdue (calculated here, daily)
  percentage - percent of invoice amount, applied once overdue (calculated here, daily)
  per_day    - Rs. amount per day overdue; NOT handled here. Billed once, as a
               rollover line item, the next time a new monthly invoice is
               generated (see _run_smart_monthly_generation in finance.py).
               This job leaves per_day invoices fine field untouched.
"""
import psycopg2.extras
from datetime import date, datetime as _dt
from app.db.connection import get_db
from app.utils.notify import send_notification

def _calculate_late_fee(late_fee_type, late_fee_amount, invoice_amount, days_overdue, grace_days):
    late_fee_amount = float(late_fee_amount or 0)
    if late_fee_type == "fixed":
        return round(late_fee_amount, 2)
    if late_fee_type == "percentage":
        return round(float(invoice_amount) * late_fee_amount / 100, 2)
    return 0.0

def run_fee_reminders():
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = date.today()

    # Reconciliation safety net: reactivate any fee-locked account whose
    # invoices are all actually paid (covers drift from manual data fixes,
    # payments recorded through other paths, or any other inconsistency
    # between the lock flag and the real payment status).
    cur.execute("""
        SELECT u.id FROM users u
        JOIN students s ON s.user_id = u.id
        WHERE u.lock_reason = 'fee_overdue'
          AND NOT EXISTS (
              SELECT 1 FROM fee_invoices fi
              WHERE fi.student_id = s.id AND fi.status != 'paid'
          )
    """)
    stale_locked = cur.fetchall()
    for row in stale_locked:
        cur.execute("UPDATE users SET is_active=TRUE, lock_reason=NULL WHERE id=%s", (row["id"],))
    if stale_locked:
        db.commit()

    # Load fee config
    cur.execute("SELECT key, value FROM system_settings WHERE category='fee_settings'")
    cfg = {r["key"]: int(r["value"]) for r in cur.fetchall() if r["value"].isdigit()}
    grace_days     = cfg.get("fee_grace_days", 3)
    reminder1_days = cfg.get("fee_reminder1_days", 5)
    reminder2_days = cfg.get("fee_reminder2_days", 10)
    lock_days      = cfg.get("fee_lock_days", 15)

    # Get all unpaid/partial invoices that are overdue
    cur.execute("""
        SELECT fi.id, fi.student_id, fi.due_date, fi.amount, fi.discount, fi.fine,
               fi.late_fee_type, fi.late_fee_amount,
               fi.status, fi.notice_level,
               s.user_id, s.parent_id, s.first_name, s.last_name, s.enrollment_no,
               u.is_active AS student_active
        FROM fee_invoices fi
        JOIN students s ON s.id = fi.student_id
        JOIN users u ON u.id = s.user_id
        WHERE fi.status IN ('unpaid','partial','overdue')
          AND fi.due_date < %s
    """, (today,))
    invoices = cur.fetchall()

    results = {"notice1": 0, "notice2": 0, "locked": 0, "skipped": 0, "late_fee_applied": 0, "reconciled": len(stale_locked)}

    for inv in invoices:
        due_date     = inv["due_date"]
        days_overdue = (today - due_date).days
        notice_level = inv["notice_level"] or 0

        # Mark overdue
        if inv["status"] in ("unpaid", "partial") and days_overdue > grace_days:
            cur.execute("UPDATE fee_invoices SET status='overdue' WHERE id=%s", (inv["id"],))

        # Recompute late fee for fixed/percentage only. per_day invoices are billed
        # once as a rollover line item at next-invoice generation time, not here -
        # so their existing fine value is left untouched by this daily job.
        if inv["late_fee_type"] == "per_day":
            new_fine = float(inv["fine"] or 0)
        else:
            new_fine = 0.0
            if days_overdue > grace_days:
                new_fine = _calculate_late_fee(
                    inv["late_fee_type"], inv["late_fee_amount"],
                    inv["amount"], days_overdue, grace_days
                )
            if round(float(inv["fine"] or 0), 2) != new_fine:
                cur.execute("UPDATE fee_invoices SET fine=%s WHERE id=%s", (new_fine, inv["id"]))
                results["late_fee_applied"] += 1

        name   = f"{inv['first_name']} {inv['last_name']}"
        amount = float(inv["amount"]) - float(inv["discount"] or 0) + new_fine

        # 1st Notice
        if days_overdue >= reminder1_days and notice_level < 1:
            msg = (f"Fee payment reminder (1st Notice): Rs. {amount:,.0f} is overdue by {days_overdue} days. "
                   f"Due date was {due_date}. Please pay immediately to avoid account suspension.")
            if inv["user_id"]:
                send_notification(inv["user_id"], "Fee Overdue - 1st Notice", msg, "warning", "/my-fees")
            if inv["parent_id"]:
                send_notification(inv["parent_id"], f"{name}: Fee Overdue - 1st Notice", msg, "warning", "/my-fees")
            cur.execute("UPDATE fee_invoices SET notice_level=1 WHERE id=%s", (inv["id"],))
            results["notice1"] += 1

        # 2nd Notice
        elif days_overdue >= reminder2_days and notice_level < 2:
            msg = (f"Fee payment reminder (2nd Notice): Rs. {amount:,.0f} is overdue by {days_overdue} days. "
                   f"Your account will be LOCKED in {lock_days - days_overdue} days if not paid.")
            if inv["user_id"]:
                send_notification(inv["user_id"], "Fee Overdue - 2nd Notice", msg, "danger", "/my-fees")
            if inv["parent_id"]:
                send_notification(inv["parent_id"], f"{name}: Fee Overdue - 2nd Notice", msg, "danger", "/my-fees")
            cur.execute("UPDATE fee_invoices SET notice_level=2 WHERE id=%s", (inv["id"],))
            results["notice2"] += 1

        # Account Lock
        elif days_overdue >= lock_days and notice_level < 3:
            msg = (f"Account Locked: Your account has been locked due to non-payment of Rs. {amount:,.0f}. "
                   f"Please contact school administration immediately.")
            if inv["user_id"]:
                send_notification(inv["user_id"], "Account Locked - Fee Overdue", msg, "danger", "/my-fees")
                cur.execute("UPDATE users SET is_active=FALSE, lock_reason='fee_overdue' WHERE id=%s", (inv["user_id"],))
            if inv["parent_id"]:
                send_notification(inv["parent_id"], f"{name}: Account Locked", msg, "danger", "/my-fees")
            cur.execute("UPDATE fee_invoices SET notice_level=3 WHERE id=%s", (inv["id"],))
            results["locked"] += 1
        else:
            results["skipped"] += 1

    db.commit()
    return results


def run_fee_reminders_scheduled(app, force=False):
    """Gated wrapper for the scheduler. Checks the admin-configured
    fee_reminder_time and a same-day duplicate guard (fee_reminder_last_run),
    then calls run_fee_reminders() if due. With force=True both gates are
    skipped. Returns a dict describing what happened."""
    with app.app_context():
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT key, value FROM system_settings WHERE key IN (%s, %s)",
            ("fee_reminder_time", "fee_reminder_last_run"),
        )
        settings = {r["key"]: r["value"] for r in cur.fetchall()}

        now = _dt.now()
        today_str = now.date().isoformat()

        if not force:
            target_time_str = settings.get("fee_reminder_time") or "08:00"
            try:
                target_hour, target_minute = [int(p) for p in target_time_str.split(":")]
            except ValueError:
                target_hour, target_minute = 8, 0
            target_total_minutes = target_hour * 60 + target_minute
            now_total_minutes = now.hour * 60 + now.minute
            if now_total_minutes < target_total_minutes or now_total_minutes >= target_total_minutes + 15:
                return {"ran": False, "reason": "Not within the configured time window yet."}

            if settings.get("fee_reminder_last_run") == today_str:
                return {"ran": False, "reason": "Already ran today (" + today_str + ")."}

        results = run_fee_reminders()

        cur.execute(
            "UPDATE system_settings SET value = %s, updated_at = NOW() WHERE key = 'fee_reminder_last_run'",
            (today_str,),
        )
        db.commit()

        return {"ran": True, "results": results}
