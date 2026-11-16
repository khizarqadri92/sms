"""
Datesheet planner - generates a complete datesheet in memory, and checks
a whole set of (possibly edited) entries before anything is saved.

Same rules as datesheet_rules.check_entry (which checks one entry against
what is already saved); this module checks entries against each other as
well, since a generated or edited preview isn't in the database yet.

Scheduling is driven entirely by per-class settings:
  start_date  - first day this class may sit a paper
  gap_days    - exam days left free after each paper (0 = every day)
  order       - subject_ids in the order they should be sat (optional)
The UI patterns are presets of these:
  daily     -> every class: exam start date, gap 0
  alternate -> every class: exam start date, gap 1 (one paper, one leave day)
  classwise -> whatever the coordinator set per class
"""
import random
from datetime import date, datetime, timedelta
from typing import Optional

from app.utils.datesheet_rules import span, overlaps, fmt_time, class_label, LEAVE_IGNORED, LEAVE_APPROVED, _to_time


def _d(v) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()


class Planner:
    """
    Loads everything once for an exam + campus, then answers questions in
    memory. scope_class_ids = the classes being (re)generated; entries of
    this exam outside that scope, or kept manual entries, are treated as
    fixed bookings that generated papers must work around.
    """

    def __init__(self, cur, exam_id: int, campus_id: int, scope_class_ids, start: date, end: date, replace: str = "auto"):
        self.cur, self.exam_id, self.campus_id = cur, exam_id, campus_id
        self.start, self.end, self.replace = start, end, replace
        self.scope = set(int(x) for x in scope_class_ids)

        cur.execute("SELECT start_date, end_date FROM exams WHERE id=%s", (exam_id,))
        ex = cur.fetchone() or {}
        self.exam_start, self.exam_end = _d(ex.get("start_date")), _d(ex.get("end_date"))

        # classes of this exam on this campus
        cur.execute("""SELECT ec.class_id, c.name, c.section, ec.shift_id
                       FROM exam_classes ec JOIN classes c ON c.id=ec.class_id
                       WHERE ec.exam_id=%s AND c.campus_id=%s ORDER BY c.name, c.section""", (exam_id, campus_id))
        self.classes = {r["class_id"]: dict(r) for r in cur.fetchall()}

        cur.execute("""SELECT class_id, COUNT(*)::int AS n FROM students
                       WHERE status='active' AND class_id = ANY(%s) GROUP BY class_id""", (list(self.classes) or [0],))
        self.strength = {r["class_id"]: r["n"] for r in cur.fetchall()}

        cur.execute("""SELECT cs.class_id, cs.subject_id, s.name FROM class_subjects cs
                       JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id = ANY(%s) ORDER BY s.name""",
                    (list(self.classes) or [0],))
        self.class_subjects, self.subject_name = {}, {}
        for r in cur.fetchall():
            self.class_subjects.setdefault(r["class_id"], []).append(r["subject_id"])
            self.subject_name[r["subject_id"]] = r["name"]

        cur.execute("""SELECT t.id, t.user_id, u.first_name, u.last_name FROM teachers t
                       JOIN users u ON u.id=t.user_id
                       WHERE u.is_active AND t.campus_id=%s ORDER BY u.first_name, u.last_name""", (campus_id,))
        self.teachers = {r["id"]: dict(r) for r in cur.fetchall()}
        self.teacher_name = {tid: f"{t['first_name']} {t['last_name']}" for tid, t in self.teachers.items()}

        cur.execute("""SELECT ts.teacher_id, ts.subject_id, ct.class_id FROM teacher_subjects ts
                       JOIN class_teachers ct ON ct.teacher_id=ts.teacher_id""")
        self.teaches = {(r["teacher_id"], r["class_id"], r["subject_id"]) for r in cur.fetchall()}
        cur.execute("SELECT class_id, teacher_id FROM class_teachers WHERE is_primary")
        self.incharge = {(r["teacher_id"], r["class_id"]) for r in cur.fetchall()}

        cur.execute("SELECT id, name, capacity FROM rooms WHERE is_active AND campus_id=%s ORDER BY capacity, name", (campus_id,))
        self.rooms = {r["id"]: dict(r) for r in cur.fetchall()}

        cur.execute("""SELECT id, shift_no, name, start_time, duration_mins FROM exam_shifts
                       WHERE exam_id=%s AND campus_id=%s ORDER BY shift_no""", (exam_id, campus_id))
        self.shifts = {r["id"]: {**dict(r), "start_time": str(r["start_time"])[:5]} for r in cur.fetchall()}

        lo, hi = min(start, self.exam_start or start), max(end, self.exam_end or end)
        cur.execute("""SELECT title, event_date, COALESCE(end_date, event_date) AS end_date FROM calendar_events
                       WHERE is_holiday AND event_date <= %s AND COALESCE(end_date, event_date) >= %s""", (hi, lo))
        self.holidays = {}
        for h in cur.fetchall():
            d = _d(h["event_date"])
            while d <= _d(h["end_date"]):
                self.holidays[d] = h["title"]; d += timedelta(days=1)

        user_to_teacher = {t["user_id"]: tid for tid, t in self.teachers.items()}
        cur.execute("""SELECT user_id, status, from_date, to_date, half_day_from_time, half_day_to_time
                       FROM staff_leave_requests
                       WHERE user_id = ANY(%s) AND from_date <= %s AND to_date >= %s
                         AND lower(COALESCE(status,'')) <> ALL(%s)""",
                    (list(user_to_teacher) or [0], hi, lo, list(LEAVE_IGNORED)))
        self.leave = {}
        for lv in cur.fetchall():
            self.leave.setdefault(user_to_teacher[lv["user_id"]], []).append(dict(lv))

        # fixed bookings: other exams on these dates + this exam's entries that stay
        cur.execute("""SELECT es.id, es.exam_id, es.class_id, es.subject_id, es.exam_date, es.start_time,
                              es.duration_mins, es.room_id, es.teacher_id, COALESCE(es.source,'manual') AS source,
                              c.name AS class_name, c.section
                       FROM exam_subjects es JOIN classes c ON c.id=es.class_id
                       WHERE (es.exam_id<>%s AND es.exam_date BETWEEN %s AND %s) OR es.exam_id=%s""",
                    (exam_id, lo, hi, exam_id))
        self.fixed, self.replaced_ids = [], []
        for r in cur.fetchall():
            r = dict(r)
            if r["exam_id"] == exam_id and r["class_id"] in self.scope and (replace == "all" or r["source"] == "auto"):
                self.replaced_ids.append(r["id"])      # will be replaced by the new set
                continue
            r["exam_date"] = _d(r["exam_date"])
            self.fixed.append(r)

    # ------------------------------------------------------------ helpers
    def exam_days(self, weekdays):
        """Exam dates in [start, end] on the chosen weekdays (Mon=0), minus holidays."""
        days, d = [], self.start
        while d <= self.end:
            if d.weekday() in weekdays and d not in self.holidays:
                days.append(d)
            d += timedelta(days=1)
        return days

    def slot_for(self, class_id, default_time, default_dur):
        """The class's fixed shift (multiple-shift exams) or the single default time."""
        if len(self.shifts) > 1:
            sid = self.classes.get(class_id, {}).get("shift_id")
            sh = self.shifts.get(sid) or next(iter(self.shifts.values()))
            return sh["id"], sh["start_time"], sh["duration_mins"]
        return None, default_time, default_dur

    def leave_state(self, teacher_id, d, paper_span):
        """None, or 'approved' / 'pending' if the teacher's leave overlaps this paper."""
        found = None
        for lv in self.leave.get(teacher_id, []):
            if not (_d(lv["from_date"]) <= d <= _d(lv["to_date"])):
                continue
            hs, he = _to_time(lv["half_day_from_time"]), _to_time(lv["half_day_to_time"])
            if hs and he:
                leave_span = (datetime(2000, 1, 1, hs.hour, hs.minute), datetime(2000, 1, 1, he.hour, he.minute))
                if not overlaps(paper_span, leave_span):
                    continue
            if str(lv["status"] or "").lower() in LEAVE_APPROVED:
                return "approved"
            found = "pending"
        return found

    def _all_bookings(self, entries, skip_key=None):
        for f in self.fixed:
            yield ("fixed", f)
        for e in entries:
            if e.get("key") != skip_key:
                yield ("set", e)

    # ------------------------------------------------------------ check one entry against fixed + set
    def check(self, e, entries):
        errors, warnings = [], []
        err = lambda c, m: errors.append({"code": c, "message": m})
        warn = lambda c, m: warnings.append({"code": c, "message": m})
        cid, sid = int(e["class_id"]), int(e["subject_id"])
        d = _d(e.get("exam_date"))
        my_span = span(e.get("start_time"), e.get("duration_mins"))
        room_id = e.get("room_id") or None
        tid = e.get("teacher_id") or None
        key = e.get("key")

        if cid not in self.classes:
            err("class_scope", "This class is not part of the exam on this campus.")
        if sid not in self.class_subjects.get(cid, []):
            err("subject_not_in_class", "This subject is not assigned to the selected class.")

        for kind, o in self._all_bookings(entries, skip_key=key):
            if int(o["class_id"]) == cid and int(o["subject_id"]) == sid and (kind == "set" or o["exam_id"] == self.exam_id):
                err("subject_repeated", f"{self.subject_name.get(sid, 'This subject')} is already scheduled for this class.")
                break

        if d:
            for kind, o in self._all_bookings(entries, skip_key=key):
                if int(o["class_id"]) == cid and _d(o["exam_date"]) == d and (kind == "set" or o["exam_id"] == self.exam_id):
                    err("class_two_papers", f"This class already has {self.subject_name.get(int(o['subject_id']), 'a paper')} on {d}.")
                    break
            if self.exam_start and self.exam_end and not (self.exam_start <= d <= self.exam_end):
                warn("outside_period", f"{d} is outside the exam period ({self.exam_start} to {self.exam_end}).")
            if d in self.holidays:
                warn("holiday", f"{d} is a holiday ({self.holidays[d]}).")

        if tid:
            tid = int(tid)
            tname = self.teacher_name.get(tid)
            if not tname:
                err("teacher_campus", "Selected invigilator is not an active teacher of this campus.")
            elif d:
                lv = self.leave_state(tid, d, my_span)
                if lv == "approved":
                    err("teacher_on_leave", f"{tname} is on approved leave on {d}.")
                elif lv == "pending":
                    warn("teacher_leave_pending", f"{tname} has a leave request awaiting approval on {d}.")
                for kind, o in self._all_bookings(entries, skip_key=key):
                    if o.get("teacher_id") and int(o["teacher_id"]) == tid and _d(o["exam_date"]) == d \
                            and overlaps(my_span, span(o.get("start_time"), o.get("duration_mins"))):
                        same_room = room_id and o.get("room_id") and int(room_id) == int(o["room_id"])
                        if not same_room:
                            err("teacher_double_booked", f"{tname} already invigilates "
                                f"{class_label(o.get('class_name') or self.classes.get(int(o['class_id']), {}).get('name'), o.get('section') or self.classes.get(int(o['class_id']), {}).get('section'))} "
                                f"at {fmt_time(o.get('start_time'))} on {d}.")
                            break
            if tname and (tid, cid, sid) in self.teaches:
                warn("own_subject", f"{tname} teaches this subject to this class.")
            elif tname and (tid, cid) in self.incharge:
                warn("own_class", f"{tname} is this class's incharge.")

        if room_id:
            room_id = int(room_id)
            r = self.rooms.get(room_id)
            if not r:
                err("room_missing", "Selected room is not an active room of this campus.")
            else:
                if d:
                    for kind, o in self._all_bookings(entries, skip_key=key):
                        if o.get("room_id") and int(o["room_id"]) == room_id and _d(o["exam_date"]) == d \
                                and overlaps(my_span, span(o.get("start_time"), o.get("duration_mins"))):
                            err("room_double_booked", f"Room {r['name']} is already used at {fmt_time(o.get('start_time'))} on {d}.")
                            break
                n = self.strength.get(cid, 0)
                if n > int(r["capacity"]):
                    warn("room_capacity", f"Room {r['name']} seats {r['capacity']}, but the class has {n} students.")
        return {"errors": errors, "warnings": warnings}

    def check_set(self, entries):
        return {e["key"]: self.check(e, entries) for e in entries}

    # ------------------------------------------------------------ generate
    def generate(self, class_cfg, weekdays, default_time, default_dur, seed=None):
        """
        class_cfg: {class_id: {"start_date": "YYYY-MM-DD"|None, "gap_days": int, "order": [subject_ids]}}
        Returns (entries, problems, stats).
        """
        rnd = random.Random(seed)
        days = self.exam_days(weekdays)
        problems = []
        if not days:
            return [], [{"type": "error", "message": "No exam days between the start and end dates on the chosen weekdays (holidays are skipped)."}], {"papers": 0, "days": 0, "invigilators": 0, "duty_min": 0, "duty_max": 0}

        entries = []
        # subjects already fixed for a class (kept manual entries, out of scope) are skipped
        fixed_subjects = {(int(f["class_id"]), int(f["subject_id"])) for f in self.fixed if f["exam_id"] == self.exam_id}
        fixed_dates = {(int(f["class_id"]), f["exam_date"]) for f in self.fixed if f["exam_id"] == self.exam_id}

        # 1. dates: each class walks the exam days from its start date, leaving gap_days free after each paper
        for cid in sorted(self.scope, key=lambda c: (self.classes.get(c, {}).get("name", ""), self.classes.get(c, {}).get("section") or "")):
            if cid not in self.classes:
                continue
            cfg = class_cfg.get(cid) or class_cfg.get(str(cid)) or {}
            gap = max(int(cfg.get("gap_days") or 0), 0)
            cstart = _d(cfg.get("start_date")) or self.start
            order = [int(s) for s in (cfg.get("order") or []) if int(s) in self.class_subjects.get(cid, [])]
            subjects = order + [s for s in self.class_subjects.get(cid, []) if s not in order]
            subjects = [s for s in subjects if (cid, s) not in fixed_subjects]
            label = class_label(self.classes[cid]["name"], self.classes[cid]["section"])
            if not self.class_subjects.get(cid):
                problems.append({"type": "warning", "message": f"{label}: no subjects are assigned to this class."})
                continue
            free = [d for d in days if d >= cstart and (cid, d) not in fixed_dates]
            picked, i = [], 0
            while i < len(free) and len(picked) < len(subjects):
                picked.append(free[i]); i += gap + 1
            if len(picked) < len(subjects):
                left = [self.subject_name[s] for s in subjects[len(picked):]]
                problems.append({"type": "error", "message":
                    f"{label}: {len(subjects)} papers but only {len(picked)} exam days fit (from {cstart}, {gap} leave day(s) between). "
                    f"Not scheduled: {', '.join(left)}. Extend the end date, start earlier, or reduce leave days."})
            shift_id, st, dur = self.slot_for(cid, default_time, default_dur)
            for d, s in zip(picked, subjects):
                entries.append({"key": f"{cid}-{s}", "class_id": cid, "subject_id": s, "exam_date": d,
                                "start_time": st, "duration_mins": dur, "shift_id": shift_id,
                                "room_id": None, "teacher_id": None})

        # 2. rooms per date + slot: biggest classes first, smallest room that fits
        by_slot = {}
        for e in entries:
            by_slot.setdefault((e["exam_date"], e["start_time"], e["duration_mins"]), []).append(e)
        for (d, st, dur), group in by_slot.items():
            sp = span(st, dur)
            busy = {int(f["room_id"]) for f in self.fixed if f.get("room_id") and f["exam_date"] == d
                    and overlaps(sp, span(f.get("start_time"), f.get("duration_mins")))}
            free_rooms = [r for rid, r in self.rooms.items() if rid not in busy]
            for e in sorted(group, key=lambda x: -self.strength.get(x["class_id"], 0)):
                n = self.strength.get(e["class_id"], 0)
                fit = [r for r in free_rooms if r["capacity"] >= n]
                room = min(fit, key=lambda r: r["capacity"]) if fit else (max(free_rooms, key=lambda r: r["capacity"]) if free_rooms else None)
                if room:
                    e["room_id"] = room["id"]; free_rooms.remove(room)
            if self.rooms and any(not e["room_id"] for e in group):
                problems.append({"type": "warning", "message": f"{d} {st}: not enough free rooms for every class - some papers have no room."})

        # 3. invigilators per date + slot: never two rooms at once, skip leave, prefer neutral teachers, fewest duties first
        duties = {tid: 0 for tid in self.teachers}
        for f in self.fixed:
            if f.get("teacher_id") and int(f["teacher_id"]) in duties and f["exam_id"] == self.exam_id:
                duties[int(f["teacher_id"])] += 1
        for (d, st, dur), group in sorted(by_slot.items(), key=lambda kv: (kv[0][0], str(kv[0][1]))):
            sp = span(st, dur)
            busy = {int(f["teacher_id"]) for f in self.fixed if f.get("teacher_id") and f["exam_date"] == d
                    and overlaps(sp, span(f.get("start_time"), f.get("duration_mins")))}
            for e in group:
                cid, sid = e["class_id"], e["subject_id"]
                pool = [t for t in self.teachers if t not in busy and self.leave_state(t, d, sp) != "approved"]
                if not pool:
                    problems.append({"type": "warning", "message": f"{d} {st}: no free invigilator for {class_label(self.classes[cid]['name'], self.classes[cid]['section'])} {self.subject_name[sid]}."})
                    continue
                def rank(t):
                    own = 2 if (t, cid, sid) in self.teaches else (1 if (t, cid) in self.incharge else 0)
                    pending = 1 if self.leave_state(t, d, sp) == "pending" else 0
                    return (own, pending, duties[t], rnd.random())
                t = min(pool, key=rank)
                e["teacher_id"] = t; busy.add(t); duties[t] += 1

        used = [n for n in duties.values() if n]
        stats = {"papers": len(entries), "days": len({e["exam_date"] for e in entries}),
                 "invigilators": len(used), "duty_min": min(used) if used else 0, "duty_max": max(used) if used else 0}
        return entries, problems, stats

    # ------------------------------------------------------------ presentation
    def describe(self, e):
        """Adds display names to an entry (for the preview grid)."""
        cid, sid = int(e["class_id"]), int(e["subject_id"])
        c = self.classes.get(cid, {})
        sh = self.shifts.get(e.get("shift_id")) if e.get("shift_id") else None
        r = self.rooms.get(int(e["room_id"])) if e.get("room_id") else None
        return {**e, "exam_date": str(e["exam_date"]) if e.get("exam_date") else None,
                "class_name": c.get("name"), "class_section": c.get("section"),
                "subject_name": self.subject_name.get(sid), "shift_name": sh["name"] if sh else None,
                "room_name": r["name"] if r else None, "room_capacity": r["capacity"] if r else None,
                "class_strength": self.strength.get(cid, 0),
                "invigilator_name": self.teacher_name.get(int(e["teacher_id"])) if e.get("teacher_id") else None}
