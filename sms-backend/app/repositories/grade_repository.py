import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class GradeRepository(BaseRepository):

    def find_by_student(self, student_id: int) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                g.id, g.marks, g.grade_letter, g.remarks, g.is_published,
                g.entered_at,
                e.name  AS exam_name,
                e.exam_type,
                e.total_marks,
                e.start_date,
                sub.name AS subject_name,
                sub.code AS subject_code,
                ROUND((g.marks / e.total_marks * 100), 2) AS percentage,
                CASE WHEN g.marks >= e.passing_marks THEN 'pass' ELSE 'fail' END AS result
            FROM grades g
            JOIN exams    e   ON e.id   = g.exam_id
            JOIN subjects sub ON sub.id = g.subject_id
            WHERE g.student_id = %s AND g.is_published = TRUE
            ORDER BY e.start_date DESC, sub.name
        """, (student_id,))
        return [dict(r) for r in cur.fetchall()]

    def find_by_id(self, id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM grades WHERE id = %s", (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters=None, page=1, per_page=20) -> List[Dict]:
        return []

    def create(self, data: Dict) -> Dict:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            INSERT INTO grades
                (student_id, exam_id, subject_id, marks, remarks, entered_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (student_id, exam_id, subject_id)
            DO UPDATE SET marks = EXCLUDED.marks, remarks = EXCLUDED.remarks
            RETURNING id, marks, grade_letter
        """, (data["student_id"], data["exam_id"], data["subject_id"],
              data["marks"], data.get("remarks"), data["entered_by"]))
        db.commit()
        return dict(cur.fetchone())

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            UPDATE grades SET marks = %s, remarks = %s
            WHERE id = %s RETURNING id, marks, grade_letter
        """, (data["marks"], data.get("remarks"), id))
        db.commit()
        row = cur.fetchone()
        return dict(row) if row else None

    def delete(self, id: int) -> bool:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM grades WHERE id = %s", (id,))
        db.commit()
        return cur.rowcount > 0