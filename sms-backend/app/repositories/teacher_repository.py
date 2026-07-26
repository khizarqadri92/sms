import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class TeacherRepository(BaseRepository):

    def find_by_id(self, id: int) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_teacher_by_id(%s)", (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_user_id(self, user_id: int) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_teacher_by_user_id(%s)", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters: Dict = None, page: int = 1, per_page: int = 20) -> List[Dict]:
        filters = filters or {}
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        offset = (page - 1) * per_page
        cur.execute(
            "SELECT * FROM sp_list_teachers(%s, %s, %s, %s)",
            (filters.get("status"), filters.get("search"), per_page, offset)
        )
        return [dict(r) for r in cur.fetchall()]

    def count(self, filters: Dict = None) -> int:
        filters = filters or {}
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_count_teachers(%s, %s) AS cnt", (filters.get("status"), filters.get("search")))
        return cur.fetchone()["cnt"]

    def create(self, data: Dict) -> Dict:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_create_teacher(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                data["email"],
                data["password_hash"],
                data["first_name"],
                data["last_name"],
                data.get("phone") or None,
                data.get("date_of_birth") or None,
                data.get("gender") or None,
                data.get("qualification") or None,
                data.get("specialization") or None,
                data.get("join_date") or None,
                data.get("employee_no") or None,
            )
        )
        row = cur.fetchone()
        db.commit()
        return dict(row)

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        if not data:
            return self.find_by_id(id)
        allowed = {"first_name", "last_name", "qualification",
                   "specialization", "status", "date_of_birth", "gender", "join_date"}
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            return self.find_by_id(id)

        date_fields = {"date_of_birth", "join_date"}
        for k in date_fields:
            if k in updates and updates[k] == "":
                updates[k] = None

        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_update_teacher(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                id,
                updates.get("first_name"), updates.get("last_name"), updates.get("qualification"),
                updates.get("specialization"), updates.get("status"), updates.get("date_of_birth"),
                updates.get("gender"), updates.get("join_date"),
            )
        )
        row = cur.fetchone()
        db.commit()
        return self.find_by_id(id) if row else None

    def delete(self, id: int) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_deactivate_teacher(%s) AS deactivated", (id,))
        result = cur.fetchone()["deactivated"]
        db.commit()
        return result

    def reactivate(self, id: int) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_reactivate_teacher(%s) AS reactivated", (id,))
        result = cur.fetchone()["reactivated"]
        db.commit()
        return result

    def get_subjects(self, teacher_id: int) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_teacher_subjects(%s)", (teacher_id,))
        return [dict(r) for r in cur.fetchall()]

    def assign_subject(self, teacher_id: int, subject_id: int, action: str):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_assign_teacher_subject(%s, %s, %s)", (teacher_id, subject_id, action))
        db.commit()

    def get_timetable(self, teacher_id: int) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_teacher_timetable(%s)", (teacher_id,))
        return [dict(r) for r in cur.fetchall()]

    def get_classes(self, teacher_id: int) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_teacher_classes(%s)", (teacher_id,))
        return [dict(r) for r in cur.fetchall()]

    def get_all_subjects(self) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_all_subjects()")
        return [dict(r) for r in cur.fetchall()]
