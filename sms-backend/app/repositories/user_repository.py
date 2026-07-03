import psycopg2.extras
from typing import Dict, List, Optional
from app.repositories.base_repository import BaseRepository
from app.db.connection import get_db


class UserRepository(BaseRepository):

    def find_by_id(self, id: int) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, email, first_name, last_name, phone, "
            "is_active, is_verified, last_login_at, created_at "
            "FROM users WHERE id = %s", (id,)
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_email(self, email: str) -> Optional[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM users WHERE email = %s", (email,)
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def find_all(self, filters: Dict = None, page: int = 1, per_page: int = 20) -> List[Dict]:
        filters = filters or {}
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        conditions, qparams = ["1=1"], []
        if filters.get("search"):
            conditions.append(
                "(u.first_name ILIKE %s OR u.last_name ILIKE %s "
                "OR u.email ILIKE %s OR COALESCE(u.phone,'') ILIKE %s "
                "OR (u.first_name || ' ' || u.last_name) ILIKE %s)"
            )
            t = f"%{filters['search']}%"
            qparams += [t, t, t, t, t]
        if filters.get("role"):
            conditions.append(
                "u.id IN (SELECT ur2.user_id FROM user_roles ur2 "
                "JOIN roles r2 ON r2.id = ur2.role_id WHERE r2.name = %s)"
            )
            qparams.append(filters["role"])
        if filters.get("is_active") in ("true", "false"):
            conditions.append("u.is_active = %s")
            qparams.append(filters["is_active"] == "true")
        offset = (page - 1) * per_page
        qparams += [per_page, offset]
        cur.execute("""
            SELECT u.id, u.email, u.first_name, u.last_name,
                   u.phone, u.is_active, u.is_verified,
                   u.last_login_at, u.created_at,
                   COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::TEXT[]) AS roles
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            LEFT JOIN roles r       ON r.id = ur.role_id
            WHERE """ + " AND ".join(conditions) + """
            GROUP BY u.id, u.email, u.first_name, u.last_name,
                     u.phone, u.is_active, u.is_verified,
                     u.last_login_at, u.created_at
            ORDER BY u.created_at DESC
            LIMIT %s OFFSET %s
        """, qparams)
        rows = cur.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["roles"] = list(r["roles"]) if r["roles"] else []
            result.append(r)
        return result

    def count(self, filters: Dict = None) -> int:
        filters = filters or {}
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        conditions, params = ["1=1"], []
        if filters.get("search"):
            conditions.append(
                "(u.first_name ILIKE %s OR u.last_name ILIKE %s "
                "OR u.email ILIKE %s OR u.phone ILIKE %s "
                "OR (u.first_name || ' ' || u.last_name) ILIKE %s)"
            )
            term = f"%{filters['search']}%"
            params += [term, term, term, term, term]
        if filters.get("role"):
            conditions.append(
                "u.id IN (SELECT ur2.user_id FROM user_roles ur2 "
                "JOIN roles r2 ON r2.id = ur2.role_id WHERE r2.name = %s)"
            )
            params.append(filters["role"])
        if filters.get("is_active") in ("true", "false"):
            conditions.append("u.is_active = %s")
            params.append(filters["is_active"] == "true")
        if filters.get("phone"):
            conditions.append("u.phone ILIKE %s")
            params.append(f"%{filters['phone']}%")
        cur.execute(
            f"SELECT COUNT(*) AS cnt FROM users u WHERE {' AND '.join(conditions)}", params
        )
        return cur.fetchone()["cnt"]

    def create(self, data: Dict) -> Dict:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "INSERT INTO users (email, password_hash, first_name, last_name, phone) "
            "VALUES (%s, %s, %s, %s, %s) "
            "RETURNING id, email, first_name, last_name",
            (data["email"], data["password_hash"],
             data["first_name"], data["last_name"], data.get("phone"))
        )
        db.commit()
        return dict(cur.fetchone())

    def update(self, id: int, data: Dict) -> Optional[Dict]:
        if not data:
            return self.find_by_id(id)
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        fields = ", ".join(f"{k} = %s" for k in data)
        values = list(data.values()) + [id]
        cur.execute(
            f"UPDATE users SET {fields} WHERE id = %s "
            "RETURNING id, email, first_name, last_name, is_active",
            values
        )
        db.commit()
        row = cur.fetchone()
        return dict(row) if row else None

    def delete(self, id: int) -> bool:
        db  = get_db()
        cur = db.cursor()
        cur.execute("UPDATE users SET is_active = FALSE WHERE id = %s", (id,))
        db.commit()
        return cur.rowcount > 0

    def update_last_login(self, id: int):
        db  = get_db()
        cur = db.cursor()
        cur.execute("UPDATE users SET last_login_at = NOW() WHERE id = %s", (id,))
        db.commit()

    def get_user_roles_and_permissions(self, user_id: int) -> Dict:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT r.id, r.name FROM roles r "
            "JOIN user_roles ur ON ur.role_id = r.id "
            "WHERE ur.user_id = %s", (user_id,)
        )
        roles = cur.fetchall()
        cur.execute(
            "SELECT DISTINCT p.code FROM permissions p "
            "JOIN role_permissions rp ON rp.permission_id = p.id "
            "JOIN user_roles ur ON ur.role_id = rp.role_id "
            "WHERE ur.user_id = %s", (user_id,)
        )
        permissions = cur.fetchall()
        return {
            "roles":       [r["name"] for r in roles],
            "permissions": [p["code"] for p in permissions]
        }

    def get_all_roles(self) -> List[Dict]:
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, description FROM roles ORDER BY name")
        return [dict(r) for r in cur.fetchall()]

    def assign_role(self, user_id: int, role_id: int):
        db  = get_db()
        cur = db.cursor()
        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) "
            "ON CONFLICT DO NOTHING",
            (user_id, role_id)
        )
        db.commit()

    def assign_or_revoke_role(self, user_id: int, role_id: int, action: str):
        db  = get_db()
        cur = db.cursor()
        if action == "assign":
            cur.execute(
                "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (user_id, role_id)
            )
        else:
            cur.execute(
                "DELETE FROM user_roles WHERE user_id = %s AND role_id = %s",
                (user_id, role_id)
            )
        db.commit()

    def store_refresh_token(self, user_id: int, token_hash: str, expires_at):
        db  = get_db()
        cur = db.cursor()
        cur.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) "
            "VALUES (%s, %s, %s)",
            (user_id, token_hash, expires_at)
        )
        db.commit()

    def revoke_refresh_token(self, token_hash: str):
        db  = get_db()
        cur = db.cursor()
        cur.execute(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = %s",
            (token_hash,)
        )
        db.commit()