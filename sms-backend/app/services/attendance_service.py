from typing import Dict, List
from datetime import date
from app.repositories.attendance_repository import AttendanceRepository


class AttendanceService:

    VALID_STATUSES = {"present", "absent", "late", "excused", "on_leave"}

    def __init__(self, repo: AttendanceRepository = None):
        self._repo = repo or AttendanceRepository()

    def mark(self, payload: Dict, marked_by: int) -> Dict:
        records = payload.get("records", [])
        self._validate_bulk(records)
        return self._repo.bulk_upsert(
            records    = records,
            class_id   = payload["class_id"],
            subject_id = payload.get("subject_id"),
            date       = payload["date"],
            marked_by  = marked_by,
        )

    def get_class_attendance(self, class_id: int, for_date: str, subject_id=None) -> List[Dict]:
        return self._repo.find_by_class_date(class_id, for_date, subject_id)

    def get_student_attendance(self, student_id: int, from_date: str, to_date: str, subject_id=None) -> List[Dict]:
        return self._repo.find_by_student(student_id, from_date, to_date, subject_id)

    def get_monthly_summary(self, student_id: int, month: str) -> Dict:
        summary = self._repo.get_summary(student_id, month)
        return summary or {
            "student_id":    student_id,
            "month":         month,
            "total_days":    0,
            "present_days":  0,
            "absent_days":   0,
            "attendance_pct": 0
        }

    def _validate_bulk(self, records: list):
        if not records:
            raise ValueError("records list cannot be empty.")
        for r in records:
            if "student_id" not in r or "status" not in r:
                raise ValueError("Each record needs student_id and status.")
            if r["status"] not in self.VALID_STATUSES:
                raise ValueError(f"Invalid status '{r['status']}'.")