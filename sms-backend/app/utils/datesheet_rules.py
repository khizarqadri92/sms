"""
Datesheet scheduling rules - one place for every check, so the manual
Add, the Edit-by-id endpoint, the live /datesheet/check endpoint and the
auto generator can never disagree about what counts as a conflict.

check_entry() returns {"errors": [...], "warnings": [...]}:
  errors   = hard rules; the backend refuses to save
  warnings = soft rules; saved, but shown to the coordinator
Each item is {"code": str, "message": str}.

Times: an entry occupies [start_time, start_time + duration_mins) on its
exam_date. An entry with no start time is treated as occupying the whole
day, so a missing time never hides a clash.
"""
from datetime import datetime, time, timedelta
from typing import Optional


# ---------------------------------------------------------------- helpers

def _to_time(v) -> Optional[time]:
    if v is None or v == "":
        return None
    if isinstance(v, time):
        return v
    parts = str(v).strip()[:8].split(":")
    try:
        return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return None


def span(start_time, duration_mins):
    """(start, end) as datetimes on a fixed day, or None if no start time."""
    st = _to_time(start_time)
    if st is None:
        return None
    base = datetime(2000, 1, 1, st.hour, st.minute)
    return base, base + timedelta(minutes=max(int(duration_mins or 0), 1))


def overlaps(a, b) -> bool:
    if a is None or b is None:          # unknown time -> assume a clash
        return True
    return a[0] < b[1] and b[0] < a[1]


def fmt_time(v) -> str:
    t = _to_time(v)
    return t.strftime("%H:%M") if t else "no time set"


def class_label(name, section) -> str:
    return f"{name} ({section})" if section else str(name)


def class_strength(cur, class_id) -> int:
    cur.execute("SELECT COUNT(*) AS n FROM students WHERE class_id=%s AND status='active'", (class_id,))
    row = cur.fetchone()
    return int(row["n"]) if row else 0


# Leave statuses that mean "this leave is not happening" - ignored entirely.
LEAVE_IGNORED = ("rejected", "cancelled", "canceled", "withdrawn", "revoked")
# Leave statuses that mean "approved" - these block an assignment.
LEAVE_APPROVED = ("approved",)


def teacher_leave(cur, teacher_id, exam_date, paper_span=None) -> Optional[dict]:
    """
    Checks staff_leave_requests for the teacher on exam_date.
    Returns None, or {"approved": bool, "text": str}:
      approved=True  -> approved leave: the assignment is blocked
      approved=False -> a request still awaiting approval: a warning
    Half-day leave only counts when its hours overlap the paper's time.
    """
    cur.execute("""SELECT lr.status, lr.from_date, lr.to_date,
                          lr.half_day_from_time, lr.half_day_to_time
                   FROM staff_leave_requests lr
                   JOIN teachers t ON t.user_id = lr.user_id
                   WHERE t.id = %s AND %s BETWEEN lr.from_date AND lr.to_date
                     AND lower(COALESCE(lr.status, '')) <> ALL(%s)""",
                (teacher_id, exam_date, list(LEAVE_IGNORED)))
    found = None
    for lv in cur.fetchall():
        if lv["half_day_from_time"] and lv["half_day_to_time"]:
            start, end = _to_time(lv["half_day_from_time"]), _to_time(lv["half_day_to_time"])
            if start and end:
                leave_span = (datetime(2000, 1, 1, start.hour, start.minute),
                              datetime(2000, 1, 1, end.hour, end.minute))
                if not overlaps(paper_span, leave_span):
                    continue          # half-day leave at a different time of day
            part = f"half day {fmt_time(lv['half_day_from_time'])}-{fmt_time(lv['half_day_to_time'])}"
        else:
            part = "full day" if lv["from_date"] == lv["to_date"] else f"{lv['from_date']} to {lv['to_date']}"
        approved = str(lv["status"] or "").lower() in LEAVE_APPROVED
        item = {"approved": approved, "text": part}
        if approved:
            return item               # approved leave wins over a pending one
        found = found or item
    return found


# ---------------------------------------------------------------- main check

def check_entry(cur, exam_id: int, entry: dict, exclude_id: Optional[int] = None,
                campus_id: Optional[int] = None) -> dict:
    """
    entry keys: class_id, subject_id, exam_date, start_time, duration_mins,
                room_id, teacher_id (= invigilator)
    exclude_id: the entry being edited (so it doesn't clash with itself)
    """
    errors, warnings = [], []
    err = lambda code, msg: errors.append({"code": code, "message": msg})
    warn = lambda code, msg: warnings.append({"code": code, "message": msg})

    class_id   = entry.get("class_id")
    subject_id = entry.get("subject_id")
    exam_date  = entry.get("exam_date") or None
    room_id    = entry.get("room_id") or None
    teacher_id = entry.get("teacher_id") or None
    my_span    = span(entry.get("start_time"), entry.get("duration_mins"))
    excl       = exclude_id or -1

    if not class_id or not subject_id:
        err("missing", "Select a class and a subject.")
        return {"errors": errors, "warnings": warnings}

    # 1. subject must belong to the class
    cur.execute("SELECT 1 FROM class_subjects WHERE class_id=%s AND subject_id=%s", (class_id, subject_id))
    if not cur.fetchone():
        err("subject_not_in_class", "This subject is not assigned to the selected class.")

    # 2. same subject twice for the same class in this exam
    cur.execute("""SELECT es.exam_date FROM exam_subjects es
                   WHERE es.exam_id=%s AND es.class_id=%s AND es.subject_id=%s AND es.id<>%s""",
                (exam_id, class_id, subject_id, excl))
    dup = cur.fetchone()
    if dup:
        when = f" on {dup['exam_date']}" if dup["exam_date"] else ""
        err("subject_repeated", f"This subject is already scheduled for this class{when}.")

    if exam_date:
        # 3. one paper per class per day
        cur.execute("""SELECT s.name AS subject_name FROM exam_subjects es
                       JOIN subjects s ON s.id=es.subject_id
                       WHERE es.exam_id=%s AND es.class_id=%s AND es.exam_date=%s AND es.id<>%s""",
                    (exam_id, class_id, exam_date, excl))
        same_day = cur.fetchone()
        if same_day:
            err("class_two_papers", f"This class already has {same_day['subject_name']} on {exam_date}.")

        # 4. date inside the exam period, not a holiday
        cur.execute("SELECT start_date, end_date FROM exams WHERE id=%s", (exam_id,))
        ex = cur.fetchone()
        if ex and ex["start_date"] and ex["end_date"]:
            if not (str(ex["start_date"]) <= str(exam_date) <= str(ex["end_date"])):
                warn("outside_period", f"{exam_date} is outside the exam period ({ex['start_date']} to {ex['end_date']}).")
        cur.execute("""SELECT title FROM calendar_events
                       WHERE is_holiday AND %s BETWEEN event_date AND COALESCE(end_date, event_date) LIMIT 1""",
                    (exam_date,))
        hol = cur.fetchone()
        if hol:
            warn("holiday", f"{exam_date} is a holiday ({hol['title']}).")

    # 5. invigilator
    if teacher_id:
        cur.execute("""SELECT t.campus_id, u.is_active, u.first_name, u.last_name
                       FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.id=%s""", (teacher_id,))
        t = cur.fetchone()
        if not t:
            err("teacher_missing", "Selected invigilator was not found.")
        else:
            tname = f"{t['first_name']} {t['last_name']}"
            if not t["is_active"]:
                err("teacher_inactive", f"{tname} is not an active teacher.")
            if campus_id is not None and t["campus_id"] is not None and t["campus_id"] != campus_id:
                err("teacher_campus", f"{tname} belongs to another campus.")
            if exam_date:
                lv = teacher_leave(cur, teacher_id, exam_date, my_span)
                if lv and lv["approved"]:
                    err("teacher_on_leave", f"{tname} is on approved leave on {exam_date} ({lv['text']}).")
                elif lv:
                    warn("teacher_leave_pending", f"{tname} has a leave request awaiting approval on {exam_date} ({lv['text']}).")
                # same invigilator in a different room at an overlapping time
                cur.execute("""SELECT es.room_id, es.venue, es.start_time, es.duration_mins,
                                      c.name AS class_name, c.section
                               FROM exam_subjects es JOIN classes c ON c.id=es.class_id
                               WHERE es.teacher_id=%s AND es.exam_date=%s AND es.id<>%s""",
                            (teacher_id, exam_date, excl))
                for o in cur.fetchall():
                    if not overlaps(my_span, span(o["start_time"], o["duration_mins"])):
                        continue
                    same_room = room_id and o["room_id"] and int(room_id) == int(o["room_id"])
                    if not same_room:
                        err("teacher_double_booked",
                            f"{tname} already invigilates {class_label(o['class_name'], o['section'])} "
                            f"at {fmt_time(o['start_time'])} on {exam_date}.")
                        break
            # soft: own subject / own class
            cur.execute("""SELECT 1 FROM teacher_subjects ts
                           JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id AND ct.class_id=%s
                           WHERE ts.teacher_id=%s AND ts.subject_id=%s LIMIT 1""",
                        (class_id, teacher_id, subject_id))
            if cur.fetchone():
                warn("own_subject", f"{tname} teaches this subject to this class.")
            else:
                cur.execute("SELECT 1 FROM class_teachers WHERE class_id=%s AND teacher_id=%s AND is_primary",
                            (class_id, teacher_id))
                if cur.fetchone():
                    warn("own_class", f"{tname} is this class's incharge.")

    # 6. room
    if room_id:
        cur.execute("SELECT name, capacity, is_active, campus_id FROM rooms WHERE id=%s", (room_id,))
        r = cur.fetchone()
        if not r:
            err("room_missing", "Selected room was not found.")
        else:
            if not r["is_active"]:
                err("room_inactive", f"Room {r['name']} is not active.")
            if campus_id is not None and r["campus_id"] is not None and r["campus_id"] != campus_id:
                err("room_campus", f"Room {r['name']} belongs to another campus.")
            if exam_date:
                cur.execute("""SELECT es.start_time, es.duration_mins, c.name AS class_name, c.section
                               FROM exam_subjects es JOIN classes c ON c.id=es.class_id
                               WHERE es.room_id=%s AND es.exam_date=%s AND es.id<>%s""",
                            (room_id, exam_date, excl))
                for o in cur.fetchall():
                    if overlaps(my_span, span(o["start_time"], o["duration_mins"])):
                        err("room_double_booked",
                            f"Room {r['name']} is already used by {class_label(o['class_name'], o['section'])} "
                            f"at {fmt_time(o['start_time'])} on {exam_date}.")
                        break
            n = class_strength(cur, class_id)
            if n > int(r["capacity"]):
                warn("room_capacity", f"Room {r['name']} seats {r['capacity']}, but the class has {n} students.")

    return {"errors": errors, "warnings": warnings}
