from typing import Dict
import hashlib
import bcrypt
from datetime import datetime, timezone, timedelta
from flask_jwt_extended import create_access_token, create_refresh_token
from app.repositories.user_repository import UserRepository


class AuthService:

    def __init__(self, user_repo: UserRepository = None):
        self._users = user_repo or UserRepository()

    def _resolve_user(self, identifier: str):
        """
        Resolves a login identifier (student enrollment number, parent phone
        number, or email) to a user record via sp_resolve_login_identifier.
        """
        from app.db.connection import get_db
        import psycopg2.extras
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sp_resolve_login_identifier(%s)", (identifier,))
        row = cur.fetchone()
        return dict(row) if row else None

    def login(self, identifier: str, password: str) -> Dict:
        user = self._resolve_user(identifier)
        if not user:
            raise ValueError("Invalid credentials.")

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

        # a temporary password (new parent / student account) works only until it expires
        if user.get("must_change_password") and user.get("temp_password_expires_at"):
            cur.execute("SELECT %s < fn_admission_now() AS expired", (user["temp_password_expires_at"],))
            if cur.fetchone()["expired"]:
                raise PermissionError("Your temporary password has expired. Please contact the school for a new one.")

        if not user["is_active"]:
            if user.get("lock_reason") == "fee_overdue":
                raise PermissionError("Account is locked due to unpaid dues, Pay your dues or contact with Admin")
            if user.get("lock_reason") == "resigned":
                raise PermissionError("This account is inactive as the employee has resigned.")
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

        if user.get("totp_enabled"):
            pending_token = create_access_token(
                identity=str(user["id"]),
                additional_claims={"2fa_pending": True},
                expires_delta=timedelta(minutes=5),
            )
            return {"requires_2fa": True, "pending_token": pending_token}

        return self._issue_tokens(user)

    def _issue_tokens(self, user: Dict) -> Dict:
        """
        Shared final step of a successful login, whether that login completed
        in one step (no 2FA) or two (password, then a verified TOTP code).
        """
        rbac = self._effective(user["id"])
        self._users.update_last_login(user["id"])

        identity = str(user["id"])
        additional_claims = {
            "roles":       rbac["roles"],
            "permissions": rbac["permissions"],
            "email":       user["email"],
            "name":        f"{user['first_name']} {user['last_name']}",
        }
        must_change = self.must_change_password(user["id"])
        if must_change:
            # only "set my new password" accepts this token (see fastapi_auth.get_current_user_id)
            additional_claims["pwd_change"] = True

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
                "must_change_password": must_change,
            }
        }

    def _effective(self, user_id: int) -> Dict:
        """Roles (own first, acting after) and permissions valid today: roles + acting roles + extra permissions."""
        from app.db.connection import get_db
        import psycopg2.extras
        from app.utils.access import effective_permissions, effective_roles
        cur = get_db().cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return {"roles": effective_roles(cur, user_id), "permissions": effective_permissions(cur, user_id)}

    def must_change_password(self, user_id: int) -> bool:
        from app.db.connection import get_db
        cur = get_db().cursor()
        cur.execute("SELECT COALESCE(must_change_password, FALSE) FROM users WHERE id=%s", (user_id,))
        row = cur.fetchone()
        return bool(row and row[0])

    def set_first_password(self, user_id: int, new_password: str) -> Dict:
        """Replaces a temporary password and clears the 'must change' flag, then logs in normally."""
        import re as _re
        from app.db.connection import get_db
        import psycopg2.extras
        if len(new_password) < 8 or not _re.search(r"[A-Za-z]", new_password) or not _re.search(r"\d", new_password):
            raise ValueError("Use at least 8 characters, with letters and numbers.")
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE id=%s", (user_id,))
        user = cur.fetchone()
        if not user:
            raise ValueError("User not found.")
        if bcrypt.checkpw(new_password.encode(), user["password_hash"].encode()):
            raise ValueError("Choose a new password - not the temporary one.")
        cur.execute("""UPDATE users SET password_hash=%s, must_change_password=FALSE, temp_password_expires_at=NULL WHERE id=%s""",
                    (bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode(), user_id))
        db.commit()
        return self._issue_tokens(dict(user))

    def verify_2fa_login(self, user_id: int, code: str) -> Dict:
        """
        Second step of login when the account has TOTP enabled. Verifies the
        submitted 6-digit code against the user's confirmed totp_secret and,
        if valid, completes login the same way a non-2FA login would.
        """
        import pyotp
        from app.db.connection import get_db
        import psycopg2.extras
        db = get_db()
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, email, first_name, last_name, totp_secret, totp_enabled FROM users WHERE id = %s",
            (user_id,)
        )
        row = cur.fetchone()
        user = dict(row) if row else None
        if not user:
            raise ValueError("User not found.")
        if not user.get("totp_enabled") or not user.get("totp_secret"):
            raise ValueError("Two-factor authentication is not enabled for this account.")
        totp = pyotp.TOTP(user["totp_secret"])
        if not totp.verify(str(code).strip(), valid_window=1):
            raise ValueError("Invalid or expired code.")
        return self._issue_tokens(user)

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