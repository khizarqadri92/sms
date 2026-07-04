from typing import Dict
import hashlib
import bcrypt
from datetime import datetime, timezone, timedelta
from flask_jwt_extended import create_access_token, create_refresh_token
from app.repositories.user_repository import UserRepository


class AuthService:

    def __init__(self, user_repo: UserRepository = None):
        self._users = user_repo or UserRepository()

    def login(self, email: str, password: str) -> Dict:
        user = self._users.find_by_email(email)
        if not user:
            raise ValueError("Invalid email or password.")

        from app.db.connection import get_db
        import psycopg2.extras
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        password_matches = bcrypt.checkpw(password.encode(), user["password_hash"].encode())
        cur.execute("SELECT * FROM sp_record_password_attempt(%s::integer, %s::boolean)", (user["id"], password_matches))
        attempt_result = cur.fetchone()
        db.commit()

        if attempt_result["is_locked"]:
            until_str = attempt_result["locked_until"].strftime("%Y-%m-%d %H:%M") if attempt_result["locked_until"] else "later"
            raise PermissionError("Account locked due to too many failed attempts. Try again after " + until_str + ".")

        if not password_matches:
            raise ValueError("Invalid email or password. " + str(attempt_result["attempts_remaining"]) + " attempt(s) remaining.")

        if not user["is_active"]:
            if user.get("lock_reason") == "fee_overdue":
                raise PermissionError("Account is locked due to unpaid dues, Pay your dues or contact with Admin")
            raise PermissionError("Account is disabled.")
        # Check if student is withdrawn
        from app.db.connection import get_db
        import psycopg2.extras
        db  = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT s.status FROM students s WHERE s.user_id=%s", (user["id"],))
        stu = cur.fetchone()
        if stu and stu["status"] == "withdrawn":
            raise PermissionError("Your enrollment has been withdrawn from school. Please contact the administration.")
        if stu and stu["status"] == "expelled":
            raise PermissionError("Your enrollment has been terminated due to disciplinary action. Please contact the administration.")
        if stu and stu["status"] == "suspended":
            from datetime import date
            raise PermissionError("Your account is temporarily suspended. Please contact the school administration.")

        rbac = self._users.get_user_roles_and_permissions(user["id"])
        self._users.update_last_login(user["id"])

        identity = str(user["id"])
        additional_claims = {
            "roles":       rbac["roles"],
            "permissions": rbac["permissions"],
            "email":       user["email"],
            "name":        f"{user['first_name']} {user['last_name']}",
        }

        access_token  = create_access_token(
            identity=identity,
            additional_claims=additional_claims
        )
        refresh_token = create_refresh_token(identity=identity)

        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        self._users.store_refresh_token(user["id"], token_hash, expires_at)

        return {
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "user": {
                "id":          user["id"],
                "email":       user["email"],
                "name":        additional_claims["name"],
                "roles":       rbac["roles"],
                "permissions": rbac["permissions"],
            }
        }

    def logout(self, refresh_token: str):
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        self._users.revoke_refresh_token(token_hash)

    def hash_password(self, plain: str) -> str:
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    def get_me(self, user_id: int) -> Dict:
        user = self._users.find_by_id(user_id)
        if not user:
            raise ValueError("User not found.")
        rbac = self._users.get_user_roles_and_permissions(user_id)
        return {**user, **rbac}