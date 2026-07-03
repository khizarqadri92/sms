from typing import Dict, List
import bcrypt
import re
from app.repositories.student_repository import StudentRepository


class StudentService:

    def __init__(self, student_repo: StudentRepository = None):
        self._repo = student_repo or StudentRepository()

    def get_all(self, filters: Dict, page: int, per_page: int) -> Dict:
        students = self._repo.find_all(filters, page, per_page)
        total    = self._repo.count(filters)
        return {"items": students, "total": total, "page": page, "per_page": per_page}

    def get_by_id(self, id: int) -> Dict:
        student = self._repo.find_by_id(id)
        if not student:
            raise ValueError(f"Student {id} not found.")
        return student

    def get_by_user_id(self, user_id: int):
        return self._repo.find_by_user_id(user_id)

    def enroll(self, data: Dict) -> Dict:
        self._validate_enrollment(data)
        data["password_hash"] = bcrypt.hashpw(
            data.pop("password", "changeme123").encode(),
            bcrypt.gensalt()
        ).decode()
        return self._repo.create(data)

    def update(self, id: int, data: Dict) -> Dict:
        student = self._repo.find_by_id(id)
        if not student:
            raise ValueError(f"Student {id} not found.")
        return self._repo.update(id, data)

    def deactivate(self, id: int) -> bool:
        student = self._repo.find_by_id(id)
        if not student:
            raise ValueError(f"Student {id} not found.")
        return self._repo.delete(id)

    def get_by_parent(self, parent_user_id: int) -> List[Dict]:
        return self._repo.find_by_parent(parent_user_id)

    def _validate_enrollment(self, data: Dict):
        for field in ["email", "first_name", "last_name"]:
            if not data.get(field):
                raise ValueError(f"{field} is required.")
        if not re.match(r"[^@]+@[^@]+\.[^@]+", data["email"]):
            raise ValueError("Invalid email format.")