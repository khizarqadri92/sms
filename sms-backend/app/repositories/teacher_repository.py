import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class TeacherRepository(BaseRepository):

    def find_by_id(self, id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT t.*, u.email, u.phone, u.is_active,
                   u.last_login_at, u.created_at
            FROM teachers t
            JOIN users u ON u.id = t.user_id
            WHERE t.id = %s
        """, (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_user_id(self, user_id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM teachers WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters: Dict = None, page: int = 1, per_page: int = 20) -> List[Dict]:
        filters = filters or {}
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        conditions, params = ["1=1"], []

        if filters.get("status"):
            conditions.append("t.status = %s")
            params.append(filters["status"])
        if filters.get("search"):
            conditions.append(
                "(t.first_name ILIKE %s OR t.last_name ILIKE %s "
                "OR t.employee_no ILIKE %s OR u.email ILIKE %s)"
            )
            term = "%" + filters["search"] + "%"
            params += [term, term, term, term]

        offset = (page - 1) * per_page
        params += [per_page, offset]

        cur.execute("""
            SELECT t.id, t.employee_no, t.first_name, t.last_name,
                   t.qualification, t.specialization, t.status,
                   t.join_date, u.email, u.phone,
                   COUNT(DISTINCT ts.subject_id) AS subject_count,
                   STRING_AGG(DISTINCT s2.name, ', ' ORDER BY s2.name) AS subject_names,
                   COUNT(DISTINCT ct.class_id)   AS class_count
            FROM teachers t
            JOIN users u ON u.id = t.user_id
            LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.id
            LEFT JOIN subjects s2 ON s2.id = ts.subject_id
            LEFT JOIN class_teachers   ct ON ct.teacher_id = t.id
            WHERE """ + " AND ".join(conditions) + """
            GROUP BY t.id, t.employee_no, t.first_name, t.last_name,
                     t.qualification, t.specialization, t.status,
                     t.join_date, u.email, u.phone
            ORDER BY t.first_name, t.last_name
            LIMIT %s OFFSET %s
        """, params)
        return [dict(r) for r in cur.fetchall()]

    def count(self, filters: Dict = None) -> int:
        filters = filters or {}
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        conditions, params = ["1=1"], []
        if filters.get("status"):
            conditions.append("t.status = %s")
            params.append(filters["status"])
        if filters.get("search"):
            conditions.append(
                "(t.first_name ILIKE %s OR t.last_name ILIKE %s OR t.employee_no ILIKE %s)"
            )
            term = "%" + filters["search"] + "%"
            params += [term, term, term]
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM teachers t WHERE " + " AND ".join(conditions),
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
            SELECT %s, id FROM roles WHERE name = 'teacher'
            ON CONFLICT DO NOTHING
        """, (user_id,))

        employee_no = data.get("employee_no") or None
        if not employee_no:
            cur.execute("SELECT fn_generate_id('teacher') AS eid")
            employee_no = cur.fetchone()["eid"]

        cur.execute("""
            INSERT INTO teachers
                (user_id, employee_no, first_name, last_name,
                 date_of_birth, gender, qualification, specialization, join_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, employee_no, first_name, last_name
        """, (
            user_id,
            employee_no,
            data["first_name"],
            data["last_name"],
            data.get("date_of_birth")  or None,
            data.get("gender")         or None,
            data.get("qualification")  or None,
            data.get("specialization") or None,
            data.get("join_date")      or None,
        ))
        db.commit()
        return dict(cur.fetchone())

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        if not data:
            return self.find_by_id(id)
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        allowed = {"first_name","last_name","qualification",
                   "specialization","status","date_of_birth","gender","join_date"}
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            return self.find_by_id(id)
        date_fields = {"date_of_birth", "join_date"}
        for k in date_fields:
            if k in updates and updates[k] == "":
                updates[k] = None
        fields = ", ".join(k + " = %s" for k in updates)
        values = list(updates.values()) + [id]
        cur.execute(
            "UPDATE teachers SET " + fields + " WHERE id = %s RETURNING id",
            values
        )
        db.commit()
        return self.find_by_id(id) if cur.rowcount else None

    def delete(self, id: int) -> bool:
        db  = get_db()
        cur = db.cursor()
        cur.execute("UPDATE teachers SET status = 'inactive' WHERE id = %s", (id,))
        db.commit()
        return cur.rowcount > 0

    def get_subjects(self, teacher_id: int) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT s.id, s.name, s.code, s.description, s.credit_hours
            FROM subjects s
            JOIN teacher_subjects ts ON ts.subject_id = s.id
            WHERE ts.teacher_id = %s
            ORDER BY s.name
        """, (teacher_id,))
        return [dict(r) for r in cur.fetchall()]

    def assign_subject(self, teacher_id: int, subject_id: int, action: str):
        db  = get_db()
        cur = db.cursor()
        if action == "assign":
            cur.execute("""
                INSERT INTO teacher_subjects (teacher_id, subject_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (teacher_id, subject_id))
        else:
            cur.execute("""
                DELETE FROM teacher_subjects
                WHERE teacher_id = %s AND subject_id = %s
            """, (teacher_id, subject_id))
        db.commit()

    def get_timetable(self, teacher_id: int) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT t.*, c.name AS class_name, c.section, s.name AS subject_name,
                   CASE t.day_of_week
                       WHEN 1 THEN 'Monday'
                       WHEN 2 THEN 'Tuesday'
                       WHEN 3 THEN 'Wednesday'
                       WHEN 4 THEN 'Thursday'
                       WHEN 5 THEN 'Friday'
                       WHEN 6 THEN 'Saturday'
                   END AS day_name
            FROM timetable t
            JOIN classes  c ON c.id = t.class_id
            JOIN subjects s ON s.id = t.subject_id
            WHERE t.teacher_id = %s
            ORDER BY t.day_of_week, t.start_time
        """, (teacher_id,))
        rows = []
        for r in cur.fetchall():
            row = dict(r)
            for k in ["start_time", "end_time"]:
                if k in row and row[k] is not None and not isinstance(row[k], str):
                    row[k] = str(row[k])
            rows.append(row)
        return rows

    def get_classes(self, teacher_id: int) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT c.id, c.name, c.section, c.class_type, ct.is_primary,
                   COUNT(s.id) AS student_count
            FROM class_teachers ct
            JOIN classes  c ON c.id = ct.class_id
            LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
            WHERE ct.teacher_id = %s
            GROUP BY c.id, c.name, c.section, c.class_type, ct.is_primary
            ORDER BY c.name
        """, (teacher_id,))
        return [dict(r) for r in cur.fetchall()]

    def get_all_subjects(self) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, code FROM subjects WHERE is_active = TRUE ORDER BY name")
        return [dict(r) for r in cur.fetchall()]