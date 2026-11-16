"""
Monthly fee auto-generation - the check shared by the dedicated scheduler
process (every minute) and the manual "Test Now" endpoint (force=True).

When it runs (force=False):
  * Logical DATE  = processing_date.current_processing_date (never the
    server's calendar date).
  * Clock TIME    = real UTC now + processing_time.time_offset_seconds
    (offset applied exactly once), converted to the school timezone.
  * It is due once the processing date is past the configured day, or on
    that day at/after the configured local time. Any later check in the same
    month catches up a missed run. It always generates for the processing
    date's own month - never another month.

Duplicate protection (force=True too):
  * pg_try_advisory_xact_lock serialises every run across all processes.
  * After taking the lock, fee_auto_generate_last_run is re-read with
    SELECT ... FOR UPDATE.
  * Invoices and the last_run update are committed in ONE transaction on a
    dedicated pooled connection; _run_smart_monthly_generation's own
    db.commit() is deferred to that single commit, so a crash can never
    leave invoices without last_run (or the reverse).
"""
import calendar
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import psycopg2.extras

logger = logging.getLogger("sms.fee_automation")

DEFAULT_SCHOOL_TZ = "Asia/Karachi"
DEFAULT_TIME = (1, 0)                    # used when fee_auto_generate_time is missing/invalid (previous default)
FEE_GENERATION_LOCK_KEY = 72410001       # pg advisory lock: one fee generation at a time
_FIXED_PKT = timezone(timedelta(hours=5), "UTC+05:00")   # Karachi has no DST


# --------------------------------------------------------------------- helpers

def resolve_school_tz(name):
    """
    Returns (tzinfo, label). Tries the configured zone, then Asia/Karachi.
    If the timezone database itself is missing (Windows without the tzdata
    package), falls back to a fixed UTC+05:00 - exact for Pakistan, which
    has no daylight saving - and logs an error saying how to fix it.
    """
    for candidate in (name, DEFAULT_SCHOOL_TZ):
        if not candidate or not str(candidate).strip():
            continue
        try:
            return ZoneInfo(str(candidate).strip()), str(candidate).strip()
        except Exception as e:  # ZoneInfoNotFoundError, ValueError, ...
            logger.error("Timezone %r could not be loaded (%s: %s).", candidate, type(e).__name__, e)
    logger.error("No timezone database available - using fixed UTC+05:00. Install it with: pip install tzdata")
    return _FIXED_PKT, "UTC+05:00 (fallback)"


def parse_hhmm(value, default=DEFAULT_TIME):
    """'23:00' -> (23, 0, False). Invalid/missing -> (default hour, default minute, True)."""
    try:
        parts = str(value).strip().split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h, m, False
    except (TypeError, ValueError, IndexError):
        pass
    return default[0], default[1], True


def parse_day(value):
    """Configured day of month, clamped to 1..31 (default 1)."""
    try:
        d = int(str(value).strip())
    except (TypeError, ValueError):
        return 1
    return min(max(d, 1), 31)


def school_clock(cur, tz):
    """
    (utc_now, offset_seconds, local_now): the real UTC instant, the
    processing-time offset, and the offset-adjusted clock in the school
    timezone. Only the clock TIME of local_now is used for the schedule;
    the logical DATE always comes from processing_date.
    """
    cur.execute("SELECT time_offset_seconds FROM processing_time ORDER BY id LIMIT 1")
    row = cur.fetchone()
    offset = int(row["time_offset_seconds"] or 0) if row else 0
    utc_now = datetime.now(timezone.utc)
    local_now = (utc_now + timedelta(seconds=offset)).astimezone(tz)
    return utc_now, offset, local_now


def evaluate_due(proc_date, local_hour, local_minute, cfg_day, cfg_hour, cfg_minute):
    """
    Pure scheduling decision - no DB, so it is unit-testable.
    Returns (due, reason, effective_day, catch_up).
    A configured day beyond the month's length means its last day
    (day 31 -> 30 Nov, 28/29 Feb).
    """
    effective_day = min(cfg_day, calendar.monthrange(proc_date.year, proc_date.month)[1])
    now_min, cfg_min = local_hour * 60 + local_minute, cfg_hour * 60 + cfg_minute
    if proc_date.day < effective_day:
        return False, f"Waiting for day {effective_day} of {proc_date:%Y-%m}.", effective_day, False
    if proc_date.day == effective_day and now_min < cfg_min:
        return False, f"Waiting for {cfg_hour:02d}:{cfg_minute:02d} school time on day {effective_day}.", effective_day, False
    catch_up = proc_date.day > effective_day
    return True, "Due" + (" (catch-up of a missed run)" if catch_up else ""), effective_day, catch_up


class _DeferredCommit:
    """
    Wraps the connection handed to _run_smart_monthly_generation so its own
    db.commit() becomes a no-op; the caller commits invoices + last_run once.
    Everything else (cursor(), rollback(), ...) passes straight through.
    """
    def __init__(self, conn):
        self._conn = conn

    def commit(self):
        logger.debug("Generator commit deferred to the single fee-generation transaction.")

    def __getattr__(self, name):
        return getattr(self._conn, name)


# --------------------------------------------------------------------- main entry

def run_fee_auto_generation(app, force=False):
    """
    Shared by the scheduler (force=False) and 'Test Now' (force=True).
    force=True skips the enabled/day/time checks but still respects the
    monthly duplicate guard and the lock. Returns a dict describing what
    happened (same keys as before: ran, reason / total_generated, month).
    """
    from app.db import connection as db_module

    trigger = "manual Test Now" if force else "scheduler"
    with app.app_context():
        pool = db_module._pool          # keep this exact pool: the connection must go back to it
        conn = pool.getconn()
        try:
            conn.autocommit = False
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            result = _run(conn, cur, force, trigger)
            if result.get("ran"):
                logger.info("Fee auto-generation (%s): generated %s invoice(s) for %s%s.", trigger,
                            result.get("total_generated"), result.get("month"),
                            " (catch-up)" if result.get("catch_up") else "")
            else:
                logger.info("Fee auto-generation (%s) skipped: %s", trigger, result.get("reason"))
            return result
        except Exception:
            logger.exception("Fee auto-generation (%s) failed - transaction rolled back, nothing was saved.", trigger)
            raise
        finally:
            # Rolls back anything uncommitted (no-op after a successful commit)
            # and so also releases the advisory transaction lock.
            try:
                conn.rollback()
            except Exception:
                logger.exception("Rollback during cleanup failed.")
            try:
                pool.putconn(conn)
            except Exception:
                logger.exception("Returning the connection to the pool failed.")


def _run(conn, cur, force, trigger):
    cur.execute(
        "SELECT key, value FROM system_settings WHERE key IN (%s, %s, %s, %s, %s)",
        ("fee_auto_generate_enabled", "fee_auto_generate_day", "fee_auto_generate_last_run",
         "fee_auto_generate_time", "timezone"),
    )
    settings = {r["key"]: r["value"] for r in cur.fetchall()}

    if not force and settings.get("fee_auto_generate_enabled") != "true":
        return {"ran": False, "reason": "Auto-generation is disabled."}

    # logical processing date (never the server calendar date)
    cur.execute("SELECT current_processing_date FROM processing_date ORDER BY id LIMIT 1")
    row = cur.fetchone()
    if not row or not row["current_processing_date"]:
        return {"ran": False, "reason": "Processing date is not set."}
    proc_date = row["current_processing_date"]
    if isinstance(proc_date, datetime):
        proc_date = proc_date.date()

    tz, tz_label = resolve_school_tz(settings.get("timezone"))
    utc_now, offset, local_now = school_clock(cur, tz)
    cfg_day = parse_day(settings.get("fee_auto_generate_day"))
    cfg_h, cfg_m, bad_time = parse_hhmm(settings.get("fee_auto_generate_time"))
    if bad_time:
        logger.error("Invalid fee_auto_generate_time %r - using %02d:%02d.",
                     settings.get("fee_auto_generate_time"), cfg_h, cfg_m)
    month_str = proc_date.strftime("%Y-%m")
    last_run = settings.get("fee_auto_generate_last_run")

    logger.info(
        "Fee auto-generation check (%s): processing_date=%s utc_now=%s offset=%ss tz=%s local_time=%s "
        "configured=day %s at %02d:%02d last_generated=%s",
        trigger, proc_date, utc_now.isoformat(timespec="seconds"), offset, tz_label,
        local_now.strftime("%H:%M:%S"), cfg_day, cfg_h, cfg_m, last_run or "never",
    )

    catch_up = False
    if not force:
        due, reason, _eff, catch_up = evaluate_due(proc_date, local_now.hour, local_now.minute, cfg_day, cfg_h, cfg_m)
        if not due:
            return {"ran": False, "reason": reason}
    # cheap early exit; re-checked under the lock below
    if last_run == month_str:
        return {"ran": False, "reason": "Already generated for " + month_str + " this month."}

    # ---- one run at a time across every process (scheduler, Test Now, API workers)
    cur.execute("SELECT pg_try_advisory_xact_lock(%s) AS got", (FEE_GENERATION_LOCK_KEY,))
    if not cur.fetchone()["got"]:
        return {"ran": False, "reason": "Another fee generation run is in progress."}

    cur.execute("SELECT value FROM system_settings WHERE key = 'fee_auto_generate_last_run' FOR UPDATE")
    guard = cur.fetchone()
    if guard is None:
        logger.error("system_settings row 'fee_auto_generate_last_run' is missing - refusing to run without a duplicate guard.")
        return {"ran": False, "reason": "Duplicate-protection setting fee_auto_generate_last_run is missing."}
    if guard["value"] == month_str:
        return {"ran": False, "reason": "Already generated for " + month_str + " this month."}

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
    try:
        raw_due_day = int(due_day_row["value"]) if due_day_row and due_day_row["value"] else 10
    except ValueError:
        raw_due_day = 10
    due_day = min(max(raw_due_day, 1), calendar.monthrange(proc_date.year, proc_date.month)[1])

    from app.api.v1.finance import _run_smart_monthly_generation
    from app.utils.processing_date import get_processing_datetime

    logger.info("Generating invoices for %s (due day %s)%s.", month_str, due_day, " - catch-up" if catch_up else "")
    result = _run_smart_monthly_generation(cur, _DeferredCommit(conn), system_user_id,
                                           proc_date.year, proc_date.month, due_day)
    total = result["generated"]

    cur.execute(
        "UPDATE system_settings SET value = %s, updated_at = %s WHERE key = 'fee_auto_generate_last_run'",
        (month_str, get_processing_datetime(conn)),
    )
    conn.commit()   # invoices + last_run together; also releases the advisory lock

    return {"ran": True, "total_generated": total, "month": month_str,
            "skipped": result.get("skipped"), "catch_up": catch_up}
