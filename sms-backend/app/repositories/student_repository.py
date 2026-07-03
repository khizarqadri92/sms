import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class StudentRepository(BaseRepository):

    def find_by_id(self, id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT s.*, u.email, u.phone, u.is_active, u.is_verified,
                   u.last_login_at, u.created_at,
                   c.name AS class_name, c.section,
                   pu.first_name || ' ' || pu.last_name AS parent_name,
                   pu.email AS parent_email,
                   pu.phone AS parent_phone
            FROM students s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN classes c  ON c.id = s.class_id
            LEFT JOIN users pu   ON pu.id = s.parent_id
            WHERE s.id = %s
        """, (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_user_id(self, user_id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT s.*, u.email, u.phone, u.is_active,
                   c.name AS class_name, c.section,
                   pu.first_name || ' ' || pu.last_name AS parent_name
            FROM students s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN classes c  ON c.id = s.class_id
            LEFT JOIN users pu   ON pu.id = s.parent_id
            WHERE s.user_id = %s
        """, (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters: Dict = None, page: int = 1, per_page: int = 20) -> List[Dict]:
        filters = filters or {}
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        conditions, params = ["1=1"], []

        if filters.get("class_id"):
            conditions.append("s.class_id = %s")
            params.append(filters["class_id"])
        if filters.get("status"):
            conditions.append("s.status = %s")
            params.append(filters["status"])
        if filters.get("search"):
            conditions.append(
                "(s.first_name ILIKE %s OR s.last_name ILIKE %s OR s.enrollment_no ILIKE %s)"
            )
            term = "%" + filters["search"] + "%"
            params += [term, term, term]

        offset = (page - 1) * per_page
        params += [per_page, offset]

        cur.execute("""
            SELECT s.id, s.enrollment_no, s.first_name, s.last_name,
                   s.gender, s.status, s.admission_date,
                   c.name AS class_name, c.section, u.email
            FROM students s
            JOIN users u ON u.id = s.user_id
            LEFT JOIN classes c ON c.id = s.class_id
            WHERE """ + " AND ".join(conditions) + """
            ORDER BY s.first_name, s.last_name
            LIMIT %s OFFSET %s
        """, params)
        return [dict(r) for r in cur.fetchall()]

    def count(self, filters: Dict = None) -> int:
        filters = filters or {}
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        conditions, params = ["1=1"], []

        if filters.get("class_id"):
            conditions.append("s.class_id = %s")
            params.append(filters["class_id"])
        if filters.get("status"):
            conditions.append("s.status = %s")
            params.append(filters["status"])
        if filters.get("search"):
            conditions.append(
                "(s.first_name ILIKE %s OR s.last_name ILIKE %s OR s.enrollment_no ILIKE %s)"
            )
            term = "%" + filters["search"] + "%"
            params += [term, term, term]

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM students s WHERE " + " AND ".join(conditions),
            params
        )
        return cur.fetchone()["cnt"]

    def create(self, data: Dict) -> Dict:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("""
            INSERT INTO users (email, password_hash, first_name, last_name, phone, is_verified)
            VALUES (%s, %s, %s, %s, %s, TRUE)
            RETURNING id
        """, (
            data["email"],
            data["password_hash"],
            data["first_name"],
            data["last_name"],
            data.get("phone")
        ))
        user_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO user_roles (user_id, role_id)
            SELECT %s, id FROM roles WHERE name = 'student'
            ON CONFLICT DO NOTHING
        """, (user_id,))

        enrollment_no = data.get("enrollment_no") or None
        if not enrollment_no:
            cur.execute("SELECT fn_generate_id('student') AS eid")
            enrollment_no = cur.fetchone()["eid"]

        cur.execute("""
            INSERT INTO students
                (user_id, enrollment_no, first_name, last_name,
                 date_of_birth, gender, blood_group, address,
                 class_id, parent_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, enrollment_no, first_name, last_name
        """, (
            user_id,
            enrollment_no,
            data["first_name"],
            data["last_name"],
            data.get("date_of_birth") or None,
            data.get("gender")        or None,
            data.get("blood_group")   or None,
            data.get("address")       or None,
            data.get("class_id")      or None,
            data.get("parent_id")     or None,
        ))
        db.commit()
        return dict(cur.fetchone())

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        if not data:
            return self.find_by_id(id)
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        allowed = {"first_name","last_name","date_of_birth","gender",
                   "blood_group","address","class_id","parent_id","status",
                   "father_name","mother_name","father_cnic","father_phone","mother_phone"}
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            return self.find_by_id(id)
        int_fields  = {"class_id", "parent_id"}
        date_fields = {"date_of_birth"}
        for k in int_fields:
            if k in updates and (updates[k] == "" or updates[k] is None):
                updates[k] = None
            elif k in updates:
                try:    updates[k] = int(updates[k])
                except: updates[k] = None
        for k in date_fields:
            if k in updates and updates[k] == "":
                updates[k] = None
        fields = ", ".join(k + " = %s" for k in updates)
        values = list(updates.values()) + [id]
        cur.execute(
            "UPDATE students SET " + fields + " WHERE id = %s RETURNING id",
            values
        )
        db.commit()
        return self.find_by_id(id) if cur.rowcount else None

    def delete(self, id: int) -> bool:
        db  = get_db()
        cur = db.cursor()
        cur.execute("UPDATE students SET status = 'inactive' WHERE id = %s", (id,))
        db.commit()
        return cur.rowcount > 0

    def find_by_parent(self, parent_id: int) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT s.id, s.enrollment_no, s.first_name, s.last_name,
                   s.status, s.class_id, c.name AS class_name, c.section,
                   s.gender, s.date_of_birth
            FROM students s
            LEFT JOIN classes c ON c.id = s.class_id
            WHERE s.parent_id = %s
        """, (parent_id,))
        return [dict(r) for r in cur.fetchall()]