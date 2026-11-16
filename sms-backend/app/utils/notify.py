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


def render_templated_notification(event_key: str, tags: dict, default_title: str, default_body: str, campus_id: int = None):
    """
    Looks up an admin-configurable message for this event (Setup -> Notification
    Templates). If a template exists and is active, its title/body (with
    {{tag}} placeholders substituted from `tags`) is used instead of the
    hard-coded default - so admins can reword these automated messages without
    a code change, while the underlying trigger/recipient logic is unaffected.
    Falls back to the given defaults if no active template is configured.

    Governance-aware: this entity is itself governed (Setup -> Setting
    Governance -> Notification Templates), and the two modes are kept fully
    separate - neither leaks into the other:
      - mode='global': every campus uses the single shared row (campus_id
        IS NULL), which only superadmin can edit.
      - mode='per_campus': each campus's own row (campus_id=X) is used if it
        exists and is active; if that campus hasn't configured this event
        yet, this falls straight through to the hard-coded default below,
        NOT to the global row - so superadmin's own configuration (or edits
        to it) never leaks into a campus that hasn't set up its own version,
        and a campus's customization never affects any other campus.
    """
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT mode FROM setting_governance WHERE entity_key='notification_templates'")
    gov = cur.fetchone()
    mode = gov["mode"] if gov else "global"

    row = None
    if mode == "per_campus" and campus_id:
        cur.execute(
            "SELECT title_template, body_template FROM notification_templates WHERE event_key=%s AND campus_id=%s AND is_active=TRUE",
            (event_key, campus_id)
        )
        row = cur.fetchone()
    else:
        cur.execute(
            "SELECT title_template, body_template FROM notification_templates WHERE event_key=%s AND campus_id IS NULL AND is_active=TRUE",
            (event_key,)
        )
        row = cur.fetchone()

    if not row:
        return default_title, default_body

    title, body = row["title_template"], row["body_template"]
    for key, value in (tags or {}).items():
        placeholder = "{{" + key + "}}"
        title = title.replace(placeholder, str(value))
        body = body.replace(placeholder, str(value))
    return title, body