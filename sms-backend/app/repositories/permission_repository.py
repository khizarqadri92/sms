import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class PermissionRepository(BaseRepository):

    def user_has_permission(self, user_id: int, permission_code: str) -> bool:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT 1 FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id
            JOIN user_roles ur        ON ur.role_id = rp.role_id
            WHERE ur.user_id = %s AND p.code = %s
            LIMIT 1
        """, (user_id, permission_code))
        return cur.fetchone() is not None

    def find_all(self, filters=None, page=1, per_page=100) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, code, module, action, description "
            "FROM permissions ORDER BY module, action"
        )
        return [dict(r) for r in cur.fetchall()]

    def find_by_id(self, id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM permissions WHERE id = %s", (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def get_role_permissions(self, role_id: int) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT p.id, p.code, p.module, p.action, p.description
            FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id
            WHERE rp.role_id = %s
            ORDER BY p.module, p.action
        """, (role_id,))
        return [dict(r) for r in cur.fetchall()]

    def assign_permission(self, role_id: int, permission_id: int, granted_by):
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO role_permissions (role_id, permission_id, granted_by)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (role_id, permission_id, granted_by))
        db.commit()

    def revoke_permission(self, role_id: int, permission_id: int, revoked_by):
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            DELETE FROM role_permissions
            WHERE role_id = %s AND permission_id = %s
        """, (role_id, permission_id))
        db.commit()

    def create(self, data): pass
    def update(self, id, data): pass
    def delete(self, id): pass