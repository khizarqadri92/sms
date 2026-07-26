import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class PermissionRepository(BaseRepository):

    def user_has_permission(self, user_id: int, permission_code: str) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_user_has_permission(%s, %s) AS has_perm", (user_id, permission_code))
        return cur.fetchone()["has_perm"]

    def find_all(self, filters=None, page=1, per_page=100) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_all_permissions()")
        return [dict(r) for r in cur.fetchall()]

    def find_by_id(self, id: int) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_permission_by_id(%s)", (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def get_role_permissions(self, role_id: int) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_role_permissions(%s)", (role_id,))
        return [dict(r) for r in cur.fetchall()]

    def assign_permission(self, role_id: int, permission_id: int, granted_by):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_assign_permission(%s, %s, %s)", (role_id, permission_id, granted_by))
        db.commit()

    def revoke_permission(self, role_id: int, permission_id: int, revoked_by):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_revoke_permission(%s, %s)", (role_id, permission_id))
        db.commit()

    def create(self, data): pass
    def update(self, id, data): pass
    def delete(self, id): pass
