import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class UserRepository(BaseRepository):

    def find_by_id(self, id: int) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_user_by_id(%s)", (id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_email(self, email: str) -> Optional[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_user_by_email(%s)", (email,))
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters: Dict = None, page: int = 1, per_page: int = 20) -> List[Dict]:
        filters = filters or {}
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        offset = (page - 1) * per_page
        is_active = None
        if filters.get("is_active") in ("true", "false"):
            is_active = filters["is_active"] == "true"
        cur.execute(
            "SELECT * FROM sp_list_users(%s, %s, %s, %s, %s, %s)",
            (filters.get("search"), filters.get("role"), is_active, per_page, offset, filters.get("campus_id"))
        )
        rows = cur.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["roles"] = list(r["roles"]) if r["roles"] else []
            result.append(r)
        return result

    def count(self, filters: Dict = None) -> int:
        filters = filters or {}
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        is_active = None
        if filters.get("is_active") in ("true", "false"):
            is_active = filters["is_active"] == "true"
        cur.execute(
            "SELECT sp_count_users(%s, %s, %s, %s, %s) AS cnt",
            (filters.get("search"), filters.get("role"), is_active, filters.get("phone"), filters.get("campus_id"))
        )
        return cur.fetchone()["cnt"]

    def create(self, data: Dict) -> Dict:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_create_user(%s, %s, %s, %s, %s, %s)",
            (data["email"], data["password_hash"], data["first_name"], data["last_name"], data.get("phone"), data.get("campus_id"))
        )
        db.commit()
        return dict(cur.fetchone())

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        if not data:
            return self.find_by_id(id)
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM sp_update_user(%s, %s, %s, %s, %s, %s)",
            (
                id, data.get("email"), data.get("first_name"), data.get("last_name"),
                data.get("phone"), data.get("is_active"),
            )
        )
        db.commit()
        row = cur.fetchone()
        return dict(row) if row else None

    def delete(self, id: int) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_deactivate_user(%s) AS deactivated", (id,))
        result = cur.fetchone()["deactivated"]
        db.commit()
        return result

    def reactivate(self, id: int) -> bool:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT sp_reactivate_user(%s) AS reactivated", (id,))
        result = cur.fetchone()["reactivated"]
        db.commit()
        return result

    def update_last_login(self, id: int):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_update_last_login(%s)", (id,))
        db.commit()

    def get_user_roles_and_permissions(self, user_id: int) -> Dict:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_user_roles_and_permissions(%s)", (user_id,))
        row = cur.fetchone()
        return {
            "roles": list(row["roles"]) if row and row["roles"] else [],
            "permissions": list(row["permissions"]) if row and row["permissions"] else [],
        }

    def get_all_roles(self) -> List[Dict]:
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_get_all_roles()")
        return [dict(r) for r in cur.fetchall()]

    def assign_role(self, user_id: int, role_id: int):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_assign_role(%s, %s)", (user_id, role_id))
        db.commit()

    def assign_or_revoke_role(self, user_id: int, role_id: int, action: str):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_assign_or_revoke_role(%s, %s, %s)", (user_id, role_id, action))
        db.commit()

    def store_refresh_token(self, user_id: int, token_hash: str, expires_at):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_store_refresh_token(%s, %s, %s)", (user_id, token_hash, expires_at))
        db.commit()

    def revoke_refresh_token(self, token_hash: str):
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT sp_revoke_refresh_token(%s)", (token_hash,))
        db.commit()
