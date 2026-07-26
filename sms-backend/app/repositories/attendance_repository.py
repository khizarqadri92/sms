import json
import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class AttendanceRepository(BaseRepository):

    def bulk_upsert(self, records: list, class_id: int, subject_id,
                    date: str, marked_by: int) -> Dict:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_mark_attendance(%s, %s::date, %s::jsonb, %s, %s)",
            (class_id, date, json.dumps(records), marked_by, subject_id)
        )
        result = cur.fetchone()
        if result and not result["success"]:
            raise ValueError(result["message"])
        db.commit()
        inserted = len(records)
        updated = 0

        try:
            from app.utils.notify import send_notification
            cur2 = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            absent_recs = [r for r in records if r.get("status") == "absent"]
            for rec in absent_recs:
                cur2.execute(
                    "SELECT s.user_id, s.parent_id, s.first_name, s.last_name, c.name AS cn, c.section AS sec "
                    "FROM students s JOIN classes c ON c.id=%s WHERE s.id=%s",
                    (class_id, rec["student_id"])
                )
                stu = cur2.fetchone()
                if stu:
                    cls = stu["cn"] + ((" ("+stu["sec"]+")") if stu["sec"] else "")
                    msg = f"{stu['first_name']} {stu['last_name']} is ABSENT on {date} in {cls}."
                    if stu["user_id"]:
                        send_notification(stu["user_id"], "Attendance: Absent", msg, "warning")
                    if stu["parent_id"]:
                        send_notification(stu["parent_id"], "Child Absent Today", msg, "warning")
        except Exception:
            pass

        return {"inserted": inserted, "updated": updated}

    def find_by_class_date(self, class_id: int, date: str, subject_id=None) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_class_attendance(%s, %s, %s)", (class_id, date, subject_id))
        return [dict(r) for r in cur.fetchall()]

    def find_by_student(self, student_id: int, from_date: str, to_date: str, subject_id=None) -> List[Dict]:
        subject_id = int(subject_id) if subject_id else None
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_student_attendance_range(%s, %s, %s, %s)", (student_id, from_date, to_date, subject_id))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["date"] = str(r["date"])
        return rows

    def get_summary(self, student_id: int, month: str) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT * FROM vw_student_attendance_summary
            WHERE student_id = %s AND month = %s
        """, (student_id, month))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_id(self, id): pass
    def find_all(self, filters=None, page=1, per_page=20): pass
    def create(self, data): pass
    def update(self, id, data): pass
    def delete(self, id): pass
