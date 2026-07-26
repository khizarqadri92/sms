import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class StudentRepository(BaseRepository):

    def find_by_id(self, id: int) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_student_by_id(%s)", (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_user_id(self, user_id: int) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_student_by_user_id(%s)", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters: Dict = None, page: int = 1, per_page: int = 20) -> List[Dict]:
        filters = filters or {}
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        offset = (page - 1) * per_page
        cur.execute(
            "SELECT * FROM sp_list_students(%s, %s, %s, %s, %s)",
            (filters.get("class_id"), filters.get("status"), filters.get("search"), per_page, offset)
        )
        return [dict(r) for r in cur.fetchall()]

    def count(self, filters: Dict = None) -> int:
        filters = filters or {}
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT sp_count_students(%s, %s, %s) AS cnt",
            (filters.get("class_id"), filters.get("status"), filters.get("search"))
        )
        return cur.fetchone()["cnt"]

    def create(self, data: Dict) -> Dict:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_create_student(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                data.get("email") or None,
                data["password_hash"],
                data["first_name"],
                data["last_name"],
                data.get("phone") or None,
                data.get("date_of_birth") or None,
                data.get("gender") or None,
                data.get("blood_group") or None,
                data.get("address") or None,
                data.get("class_id") or None,
                data.get("parent_id") or None,
                data.get("enrollment_no") or None,
            )
        )
        row = cur.fetchone()
        db.commit()
        return dict(row)

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        if not data:
            return self.find_by_id(id)

        allowed = {"first_name", "last_name", "date_of_birth", "gender",
                   "blood_group", "address", "class_id", "parent_id", "status",
                   "father_name", "mother_name", "father_cnic", "father_phone", "mother_phone"}
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            return self.find_by_id(id)

        int_fields = {"class_id", "parent_id"}
        date_fields = {"date_of_birth"}
        for k in int_fields:
            if k in updates and (updates[k] == "" or updates[k] is None):
                updates[k] = None
            elif k in updates:
                try:
                    updates[k] = int(updates[k])
                except Exception:
                    updates[k] = None
        for k in date_fields:
            if k in updates and updates[k] == "":
                updates[k] = None

        # parent_id explicitly present but empty/None means "clear it";
        # parent_id absent entirely means "leave it untouched".
        clear_parent = "parent_id" in updates and updates.get("parent_id") is None

        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_update_student(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                id,
                updates.get("first_name"), updates.get("last_name"), updates.get("date_of_birth"),
                updates.get("gender"), updates.get("blood_group"), updates.get("address"),
                updates.get("class_id"), updates.get("parent_id"), updates.get("status"),
                updates.get("father_name"), updates.get("mother_name"), updates.get("father_cnic"),
                updates.get("father_phone"), updates.get("mother_phone"), clear_parent,
            )
        )
        row = cur.fetchone()
        db.commit()
        return self.find_by_id(id) if row else None

    def delete(self, id: int) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_deactivate_student(%s) AS deactivated", (id,))
        result = cur.fetchone()["deactivated"]
        db.commit()
        return result

    def reactivate(self, id: int) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_reactivate_student(%s) AS reactivated", (id,))
        result = cur.fetchone()["reactivated"]
        db.commit()
        return result

    def find_by_parent(self, parent_id: int) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_students_by_parent(%s)", (parent_id,))
        return [dict(r) for r in cur.fetchall()]
