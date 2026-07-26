from typing import Dict, List
import bcrypt
import re
from app.repositories.teacher_repository import TeacherRepository


class TeacherService:

    def __init__(self, repo: TeacherRepository = None):
        self._repo = repo or TeacherRepository()

    def get_all(self, filters: Dict, page: int, per_page: int) -> Dict:
        items = self._repo.find_all(filters, page, per_page)
        total = self._repo.count(filters)
        return {"items": items, "total": total, "page": page, "per_page": per_page}

    def get_by_id(self, id: int) -> Dict:
        teacher = self._repo.find_by_id(id)
        if not teacher:
            raise ValueError(f"Teacher {id} not found.")
        teacher["subjects"] = self._repo.get_subjects(id)
        teacher["classes"]  = self._repo.get_classes(id)
        return teacher

    def get_by_user_id(self, user_id: int):
        teacher = self._repo.find_by_user_id(user_id)
        if not teacher:
            return None
        teacher["subjects"] = self._repo.get_subjects(teacher["id"])
        teacher["classes"]  = self._repo.get_classes(teacher["id"])
        return teacher

    def create(self, data: Dict) -> Dict:
        self._validate(data)
        data["password_hash"] = bcrypt.hashpw(
            data.pop("password", "changeme123").encode(),
            bcrypt.gensalt()
        ).decode()
        return self._repo.create(data)

    def update(self, id: int, data: Dict) -> Dict:
        teacher = self._repo.find_by_id(id)
        if not teacher:
            raise ValueError(f"Teacher {id} not found.")
        return self._repo.update(id, data)

    def deactivate(self, id: int):
        teacher = self._repo.find_by_id(id)
        if not teacher:
            raise ValueError(f"Teacher {id} not found.")
        self._repo.delete(id)

    def reactivate(self, id: int):
        teacher = self._repo.find_by_id(id)
        if not teacher:
            raise ValueError(f"Teacher {id} not found.")
        self._repo.reactivate(id)

    def get_subjects(self, id: int) -> List[Dict]:
        return self._repo.get_subjects(id)

    def assign_subject(self, teacher_id: int, subject_id: int, action: str):
        if not subject_id:
            raise ValueError("subject_id is required.")
        self._repo.assign_subject(teacher_id, subject_id, action)

    def get_timetable(self, id: int) -> List[Dict]:
        return self._repo.get_timetable(id)

    def get_classes(self, id: int) -> List[Dict]:
        return self._repo.get_classes(id)

    def get_all_subjects(self) -> List[Dict]:
        return self._repo.get_all_subjects()

    def _validate(self, data: Dict):
        for field in ["email", "first_name", "last_name"]:
            if not data.get(field):
                raise ValueError(f"{field} is required.")
        if not re.match(r"[^@]+@[^@]+\.[^@]+", data["email"]):
            raise ValueError("Invalid email format.")