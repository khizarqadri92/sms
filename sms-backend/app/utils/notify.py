"""Central notification helper — call from any endpoint to send notifications."""
import psycopg2.extras
from app.db.connection import get_db
from app.utils.processing_date import get_processing_datetime

def send_notification(user_id: int, title: str, body: str, ntype: str = "info", link: str = None):
    """Send a single notification."""
    db  = get_db()
    cur = db.cursor()
    proc_time = get_processing_datetime(db)
    cur.execute("""
        INSERT INTO notifications (user_id, title, body, type, link, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (user_id, title, body, ntype, link, proc_time))
    db.commit()

def send_to_class(class_id: int, title: str, body: str, ntype: str = "info", link: str = None,
                  notify_students: bool = True, notify_parents: bool = True, notify_teachers: bool = False):
    """Send notification to all students/parents/teachers of a class."""
    db  = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if notify_students:
        cur.execute("SELECT user_id FROM students WHERE class_id=%s AND status='active' AND user_id IS NOT NULL", (class_id,))
        for r in cur.fetchall():
            send_notification(r["user_id"], title, body, ntype, link)

    if notify_parents:
        cur.execute("""
            SELECT DISTINCT u.id FROM students s
            JOIN users u ON u.id = s.parent_id
            WHERE s.class_id=%s AND s.status='active' AND s.parent_id IS NOT NULL
        """, (class_id,))
        for r in cur.fetchall():
            send_notification(r["id"], title, body, ntype, link)

    if notify_teachers:
        cur.execute("""
            SELECT DISTINCT t.user_id FROM class_teachers ct
            JOIN teachers t ON t.id = ct.teacher_id
            WHERE ct.class_id=%s AND t.user_id IS NOT NULL
        """, (class_id,))
        for r in cur.fetchall():
            send_notification(r["user_id"], title, body, ntype, link)

def send_bulk(user_ids: list, title: str, body: str, ntype: str = "info", link: str = None):
    """Send same notification to multiple users."""
    for uid in user_ids:
        send_notification(uid, title, body, ntype, link)