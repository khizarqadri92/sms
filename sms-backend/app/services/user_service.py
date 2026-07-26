from typing import Dict, List
import bcrypt
import re
from app.repositories.user_repository import UserRepository
from app.repositories.permission_repository import PermissionRepository


class UserService:

    def __init__(self):
        self._users = UserRepository()
        self._perms = PermissionRepository()

    def get_all(self, filters: Dict, page: int, per_page: int) -> Dict:
        items = self._users.find_all(filters, page, per_page)
        total = self._users.count(filters)
        return {"items": items, "total": total, "page": page, "per_page": per_page}

    def get_by_id(self, id: int) -> Dict:
        user = self._users.find_by_id(id)
        if not user:
            raise ValueError(f"User {id} not found.")
        rbac = self._users.get_user_roles_and_permissions(id)
        return {**user, **rbac}

    def create(self, data: Dict) -> Dict:
        self._validate(data)
        data["password_hash"] = bcrypt.hashpw(
            data.pop("password", "changeme123").encode(),
            bcrypt.gensalt()
        ).decode()
        user = self._users.create(data)
        if data.get("role_id"):
            self._users.assign_role(user["id"], data["role_id"])
        return user

    def update(self, id: int, data: Dict) -> Dict:
        user = self._users.find_by_id(id)
        if not user:
            raise ValueError(f"User {id} not found.")
        allowed = {"first_name", "last_name", "phone", "is_active"}
        updates = {k: v for k, v in data.items() if k in allowed}
        return self._users.update(id, updates)

    def deactivate(self, id: int):
        user = self._users.find_by_id(id)
        if not user:
            raise ValueError(f"User {id} not found.")
        self._users.delete(id)

    def reactivate(self, id: int):
        user = self._users.find_by_id(id)
        if not user:
            raise ValueError(f"User {id} not found.")
        self._users.reactivate(id)

    def assign_role(self, user_id: int, role_id: int, action: str) -> Dict:
        if not role_id:
            raise ValueError("role_id is required.")
        self._users.assign_or_revoke_role(user_id, role_id, action)
        return self._users.get_user_roles_and_permissions(user_id)

    def get_all_roles(self) -> List[Dict]:
        return self._users.get_all_roles()

    def get_role_permissions(self, role_id: int) -> List[str]:
        perms = self._perms.get_role_permissions(role_id)
        return [p["code"] for p in perms]

    def get_all_permissions(self) -> List[Dict]:
        return self._perms.find_all()

    def assign_permission(self, role_id: int, permission_id: int, action: str):
        if not role_id or not permission_id:
            raise ValueError("role_id and permission_id are required.")
        if action == "grant":
            self._perms.assign_permission(role_id, permission_id, granted_by=None)
        else:
            self._perms.revoke_permission(role_id, permission_id, revoked_by=None)

    def _validate(self, data: Dict):
        for field in ["email", "first_name", "last_name"]:
            if not data.get(field):
                raise ValueError(f"{field} is required.")
        if not re.match(r"[^@]+@[^@]+\.[^@]+", data["email"]):
            raise ValueError("Invalid email format.")
        existing = self._users.find_by_email(data["email"])
        if existing:
            raise ValueError("Email already exists.")