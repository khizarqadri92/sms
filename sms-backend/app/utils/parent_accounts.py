"""
Parent login accounts for admissions.

One primary-guardian phone -> one parent account (users.login_phone, unique).
  * An existing parent account with that phone is REUSED: linked, never duplicated,
    its password never reset.
  * Otherwise a parent account is created: login = the normalized phone,
    a random temporary password (returned once, stored only as a bcrypt hash),
    must_change_password = TRUE, temporary password valid for 14 days.
Works with a psycopg2 RealDictCursor. The caller commits.
"""
import re
import secrets
import string

import bcrypt

TEMP_PASSWORD_DAYS = 14


def normalize_phone(raw):
    """Pakistani mobile -> 03XXXXXXXXX (None if not a mobile number). Same rule as fn_normalize_pk_phone."""
    if not raw:
        return None
    d = re.sub(r"\D", "", str(raw))
    if d.startswith("0092"): d = d[4:]
    elif d.startswith("92"): d = d[2:]
    if d.startswith("3") and len(d) == 10: d = "0" + d
    return d if re.fullmatch(r"03\d{9}", d) else None


def temp_password(n=10):
    """Readable random password: no look-alike characters (0/O, 1/l/I); upper, lower and a digit."""
    alphabet = "".join(ch for ch in string.ascii_letters + string.digits if ch not in "0O1lI")
    while True:
        p = "".join(secrets.choice(alphabet) for _ in range(n))
        if any(c.isdigit() for c in p) and any(c.isupper() for c in p) and any(c.islower() for c in p):
            return p


def guardian_of(app):
    """(name, phone, email) of the application's primary guardian."""
    pg = app["primary_guardian"]
    if pg == "other":
        return app.get("guardian_name"), app.get("guardian_phone"), app.get("guardian_email")
    return app.get(f"{pg}_name"), app.get(f"{pg}_phone"), app.get(f"{pg}_email")


def find_parent(cur, phone):
    """The parent account for a normalized phone: login_phone first, else ONE parent whose phone matches."""
    cur.execute("SELECT id FROM users WHERE login_phone=%s", (phone,))
    r = cur.fetchone()
    if r:
        return r["id"]
    cur.execute("""SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
                   WHERE r.name='parent' AND fn_normalize_pk_phone(u.phone)=%s ORDER BY u.id LIMIT 2""", (phone,))
    rows = cur.fetchall()
    if len(rows) == 1:
        cur.execute("UPDATE users SET login_phone=%s WHERE id=%s AND login_phone IS NULL", (phone, rows[0]["id"]))
        return rows[0]["id"]
    if len(rows) > 1:                                   # ambiguous: never guess, never add another duplicate
        raise ValueError(f"{len(rows)} parent accounts already use {phone}. Ask an admin to merge them before linking this application.")
    return None


def find_family_parent(cur, app, sibling_student_ids=()):
    """
    The parent account of a family that already has children at the school:
      1. a sibling entered on the form whose record has a parent account,
      2. the father's / mother's / guardian's CNIC on an existing student's record,
      3. one of the family's mobile numbers on an existing student's record.
    Returns that parent's user id, or None.
    """
    if sibling_student_ids:
        cur.execute("SELECT parent_id FROM students WHERE id = ANY(%s) AND parent_id IS NOT NULL ORDER BY id LIMIT 1", (list(sibling_student_ids),))
        r = cur.fetchone()
        if r: return r["parent_id"]
    cnics = [re.sub(r"\D", "", app.get(k) or "") for k in ("father_cnic", "mother_cnic", "guardian_cnic")]
    cnics = [x for x in cnics if len(x) == 13]
    if cnics:
        cur.execute("""SELECT parent_id FROM students WHERE parent_id IS NOT NULL AND (
                           regexp_replace(COALESCE(father_cnic,''), '\\D', '', 'g') = ANY(%s)
                        OR regexp_replace(COALESCE(mother_cnic,''), '\\D', '', 'g') = ANY(%s)
                        OR regexp_replace(COALESCE(guardian_cnic,''), '\\D', '', 'g') = ANY(%s))
                       GROUP BY parent_id ORDER BY COUNT(*) DESC, parent_id LIMIT 1""", (cnics, cnics, cnics))
        r = cur.fetchone()
        if r: return r["parent_id"]
    phones = [normalize_phone(app.get(k)) for k in ("father_phone", "mother_phone", "guardian_phone")]
    phones = [x for x in phones if x]
    if phones:
        cur.execute("""SELECT parent_id FROM students WHERE parent_id IS NOT NULL AND (
                           fn_normalize_pk_phone(father_phone) = ANY(%s) OR fn_normalize_pk_phone(mother_phone) = ANY(%s)
                        OR fn_normalize_pk_phone(guardian_phone) = ANY(%s))
                       GROUP BY parent_id ORDER BY COUNT(*) DESC, parent_id LIMIT 1""", (phones, phones, phones))
        r = cur.fetchone()
        if r: return r["parent_id"]
    return None


def ensure_parent_account(cur, app, campus_id, sibling_student_ids=()):
    """
    Link or create the parent account for an application's primary guardian.
    Returns {"user_id", "created", "login", "temporary_password" (only when created)}.
    Raises ValueError when the guardian has no usable mobile number.
    """
    name, raw_phone, email = guardian_of(app)
    phone = normalize_phone(raw_phone)
    # a family already at the school keeps its parent account (whatever number this form gives)
    family = find_family_parent(cur, app, sibling_student_ids)
    if family:
        cur.execute("SELECT login_phone, phone FROM users WHERE id=%s", (family,))
        u = cur.fetchone() or {}
        return {"user_id": family, "created": False, "login": u.get("login_phone") or u.get("phone") or phone, "temporary_password": None}
    if not phone:
        raise ValueError("The primary guardian has no valid mobile number for the login.")
    existing = find_parent(cur, phone)
    if existing:
        return {"user_id": existing, "created": False, "login": phone, "temporary_password": None}
    parts = (name or "Parent").strip().split()
    first, last = parts[0], " ".join(parts[1:]) or "-"
    temp = temp_password()
    email = (email or "").strip().lower() or None
    if email:
        cur.execute("SELECT 1 FROM users WHERE lower(email)=%s", (email,))
        if cur.fetchone():
            email = None                                 # email already used elsewhere - the phone is the login anyway
    cur.execute("""INSERT INTO users (email, password_hash, first_name, last_name, phone, login_phone, is_active, is_verified,
                                      campus_id, must_change_password, temp_password_expires_at)
                   VALUES (%s,%s,%s,%s,%s,%s,TRUE,TRUE,%s,TRUE, fn_admission_now() + make_interval(days => %s))
                   RETURNING id""",
                (email, bcrypt.hashpw(temp.encode(), bcrypt.gensalt()).decode(), first, last, phone, phone, campus_id, TEMP_PASSWORD_DAYS))
    uid = cur.fetchone()["id"]
    cur.execute("""INSERT INTO user_roles (user_id, role_id) SELECT %s, id FROM roles WHERE name='parent'
                   AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=%s AND x.role_id=roles.id)""", (uid, uid))
    return {"user_id": uid, "created": True, "login": phone, "temporary_password": temp}
