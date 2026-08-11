import atexit
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from app.db import connection as flask_db_module


def advance_processing_date_job():
    db = flask_db_module._pool.getconn()
    try:
        cur = db.cursor()
        cur.execute("SELECT sp_advance_processing_date();")
        db.commit()
        print(f"[processing_date_scheduler] Advanced processing date at {datetime.now()}")
    except Exception as e:
        db.rollback()
        print(f"[processing_date_scheduler] ERROR: {e}")
    finally:
        flask_db_module._pool.putconn(db)


def catch_up_processing_date():
    """If the server was down over midnight, advance the processing date to today on startup."""
    from datetime import date
    db = flask_db_module._pool.getconn()
    try:
        cur = db.cursor()
        cur.execute("SELECT current_processing_date FROM processing_date ORDER BY id LIMIT 1")
        row = cur.fetchone()
        if row:
            current = row[0]
            today = date.today()
            days_behind = (today - current).days
            for _ in range(max(0, days_behind)):
                cur.execute("SELECT sp_advance_processing_date();")
            if days_behind > 0:
                db.commit()
                print(f"[processing_date_scheduler] Caught up processing date by {days_behind} day(s) on startup.")
    except Exception as e:
        db.rollback()
        print(f"[processing_date_scheduler] Catch-up ERROR: {e}")
    finally:
        flask_db_module._pool.putconn(db)


def deactivate_expired_resignations_job():
    """Finds staff whose accepted resignation's last working day has passed
    (per the processing date, not the real clock), deactivates their login
    account with a reason, and marks their staff record resigned - all
    without requiring HR to have manually clicked "Finalize Exit" yet."""
    db = flask_db_module._pool.getconn()
    try:
        cur = db.cursor()
        cur.execute("SELECT current_processing_date FROM processing_date ORDER BY id LIMIT 1")
        row = cur.fetchone()
        if not row:
            return
        processing_today = row[0]
        cur.execute("""
            SELECT s.id AS staff_id, s.user_id,
                   COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day) AS last_day
            FROM resignation_requests rr
            JOIN staff s ON s.id = rr.staff_id
            WHERE rr.status NOT IN (\'submitted\',\'manager_approved\',\'rejected\',\'withdrawn\',\'completed\')
              AND s.status = \'active\'
              AND COALESCE(rr.final_last_working_day, rr.system_calculated_last_working_day) <= %s
        """, (processing_today,))
        expired = cur.fetchall()
        for staff_id, user_id, last_day in expired:
            cur.execute("UPDATE staff SET status=\'resigned\' WHERE id=%s", (staff_id,))
            # Also sync the legacy teachers table, which tracks its own
            # separate status column not derived from staff.status.
            cur.execute("UPDATE teachers SET status=\'resigned\' WHERE user_id=%s", (user_id,))
            if user_id:
                cur.execute("""
                    UPDATE users SET is_active=FALSE, deactivation_reason=\'resigned\',
                        deactivation_comment=%s, deactivated_at=NOW()
                    WHERE id=%s
                """, (f"Automatically deactivated - resignation last working day ({last_day}) has passed.", user_id))

            # If this person is a teacher, remove their class incharge / subject
            # teacher assignments and notify academic coordinators about the gap.
            cur.execute("SELECT id, first_name, last_name FROM teachers WHERE user_id=%s", (user_id,))
            trow = cur.fetchone()
            if trow:
                teacher_pk, tfirst, tlast = trow
                cur.execute("""
                    SELECT c.name, ct.is_primary FROM class_teachers ct
                    JOIN classes c ON c.id = ct.class_id
                    WHERE ct.teacher_id = %s
                """, (teacher_pk,))
                assignments = cur.fetchall()
                if assignments:
                    lines = [f"- {cname} ({'Class Incharge' if is_primary else 'Subject Teacher'})" for cname, is_primary in assignments]
                    body = (f"{tfirst} {tlast} has resigned and their last working day has passed. "
                            f"Following classes they were teaching:\n" + "\n".join(lines))
                    cur.execute("""
                        SELECT u.id FROM users u
                        JOIN user_roles ur ON ur.user_id=u.id
                        JOIN roles r ON r.id=ur.role_id
                        WHERE r.name=\'academic_coordinator\' AND u.is_active=TRUE
                    """)
                    for (coord_id,) in cur.fetchall():
                        cur.execute("""
                            INSERT INTO notifications (user_id, title, body, type, created_at)
                            VALUES (%s, %s, %s, %s, NOW())
                        """, (coord_id, "Teacher Resigned - Class Coverage Needed", body, "warning"))
                    cur.execute("DELETE FROM class_teachers WHERE teacher_id=%s", (teacher_pk,))
        if expired:
            db.commit()
            print(f"[processing_date_scheduler] Auto-deactivated {len(expired)} account(s) whose resignation last working day passed.")
    except Exception as e:
        db.rollback()
        print(f"[processing_date_scheduler] Deactivation ERROR: {e}")
    finally:
        flask_db_module._pool.putconn(db)


_scheduler = None


def start_scheduler():
    global _scheduler
    catch_up_processing_date()
    deactivate_expired_resignations_job()
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(advance_processing_date_job, "cron", hour=0, minute=0, id="advance_processing_date")
    _scheduler.add_job(deactivate_expired_resignations_job, "cron", hour=0, minute=5, id="deactivate_expired_resignations")
    _scheduler.start()
    atexit.register(lambda: _scheduler.shutdown())
    print("[processing_date_scheduler] Scheduler started - will advance processing date daily at midnight.")
