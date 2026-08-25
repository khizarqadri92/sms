"""
Native FastAPI router for Quizzes - migrated from app/api/v1/quizzes.py.
sp_submit_quiz already existed (used by the original Flask code for atomic
grading); all other inline SQL converted to dedicated stored procedures.
"""

from typing import Optional, Any, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


def serialize(rows):
    result = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = str(v)
        result.append(d)
    return result


class QuestionIn(BaseModel):
    question: str
    option_a: str
    option_b: str
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct: Optional[Any] = ""
    multi_select: Optional[bool] = False
    marks: Optional[int] = 1


class QuizCreateIn(BaseModel):
    class_id: Any
    subject_id: Any
    title: str
    description: Optional[str] = ""
    due_date: str
    questions: List[QuestionIn]


class SubmitQuizIn(BaseModel):
    answers: dict = {}


@router.post("/")
def create_quiz(body: QuizCreateIn, user_id: int = Depends(require_permission("quiz.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        fail("Teacher not found.", 403)
    teacher_id = row["tid"]

    if not body.questions:
        fail("At least one question required.", 400)

    total_marks = sum(q.marks or 1 for q in body.questions)

    cur.execute(
        "SELECT sp_create_quiz(%s,%s,%s,%s,%s,%s,%s) AS id",
        (body.class_id, body.subject_id, teacher_id, body.title, body.description or "", body.due_date, total_marks)
    )
    quiz_id = cur.fetchone()["id"]

    for i, q in enumerate(body.questions, 1):
        correct = q.correct
        if isinstance(correct, list):
            correct = ",".join(correct)
        cur.execute(
            "SELECT sp_create_quiz_question(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (quiz_id, q.question, q.option_a, q.option_b, q.option_c, q.option_d,
             correct or "", q.multi_select or False, q.marks or 1, i)
        )
    db.commit()

    try:
        from app.utils.notify import send_to_class
        cur.execute("SELECT * FROM sp_get_subject_class_names(%s, %s)", (body.subject_id, body.class_id))
        row2 = cur.fetchone()
        sname = row2["subject_name"] if row2 else "a subject"
        cname = (row2["class_name"] + ((" (" + row2["section"] + ")") if row2 and row2["section"] else "")) if row2 else ""
        send_to_class(
            int(body.class_id), title="New Quiz Available",
            body="New quiz '" + body.title + "' for " + sname + " in " + cname + ". Due: " + body.due_date + ".",
            ntype="info", notify_students=True, notify_parents=True, notify_teachers=False
        )
    except Exception:
        pass

    return ok(data={"id": quiz_id}, message="Quiz created.")


@router.get("/")
def list_quizzes(
    class_id: Optional[int] = Query(None), subject_id: Optional[int] = Query(None),
    user_id: int = Depends(require_permission("quiz.view")), db=Depends(get_db),
):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
    row = cur.fetchone()
    student_id = row["sid"] if row else None

    cur.execute("SELECT * FROM sp_list_quizzes(%s, %s, %s)", (student_id, class_id, subject_id))
    rows = serialize(cur.fetchall())
    now = get_processing_datetime(db).isoformat()
    for r in rows:
        r["is_expired"] = r["due_date"] < now
        r["my_submission"] = None
        if r.get("my_submitted_at"):
            r["my_submission"] = {
                "marks": r["my_marks"],
                "percentage": float(r["my_percentage"] or 0),
                "submitted_at": r["my_submitted_at"],
            }
    return ok(data=rows)


@router.get("/my-quizzes")
def my_quizzes(user_id: int = Depends(require_permission("quiz.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_teacher_id_by_user(%s) AS tid", (user_id,))
    row = cur.fetchone()
    if not row or not row["tid"]:
        return ok(data=[])
    cur.execute("SELECT * FROM sp_get_my_teacher_quizzes(%s)", (row["tid"],))
    rows = serialize(cur.fetchall())
    now = get_processing_datetime(db).isoformat()
    for r in rows:
        r["is_expired"] = r["due_date"] < now
    return ok(data=rows)


@router.get("/student-history")
def student_quiz_history(
    student_id: Optional[int] = Query(None), before_date: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("quiz.view")), db=Depends(get_db),
):
    if not student_id:
        fail("student_id required", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_student_quiz_history(%s, %s)", (student_id, before_date))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        for k in ("quiz_date", "submitted_at"):
            if r.get(k):
                r[k] = str(r[k])
    return ok(data=rows)


@router.get("/{id}")
def get_quiz(id: int, user_id: int = Depends(require_permission("quiz.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_quiz_by_id(%s)", (id,))
    quiz = cur.fetchone()
    if not quiz:
        fail("Quiz not found.", 404)
    quiz = dict(quiz)
    quiz["due_date"] = str(quiz["due_date"])
    quiz["created_at"] = str(quiz["created_at"])
    quiz["is_expired"] = quiz["due_date"] < get_processing_datetime(db).isoformat()

    cur.execute("SELECT * FROM sp_get_quiz_questions(%s)", (id,))
    questions = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
    srow = cur.fetchone()
    submission = None
    if srow and srow["sid"]:
        cur.execute("SELECT * FROM sp_get_quiz_submission(%s, %s)", (id, srow["sid"]))
        sub = cur.fetchone()
        if sub:
            submission = dict(sub)
            submission["submitted_at"] = str(submission["submitted_at"])
            submission["answers"] = submission["answers"] if isinstance(submission["answers"], dict) else {}

    cur.execute("SELECT sp_check_user_is_pure_student(%s) AS is_student", (user_id,))
    is_student = cur.fetchone()["is_student"]

    if is_student and submission is None:
        for q in questions:
            q.pop("correct", None)

    quiz["questions"] = questions
    quiz["submission"] = submission
    return ok(data=quiz)


@router.post("/{id}/submit")
def submit_quiz(id: int, body: SubmitQuizIn, user_id: int = Depends(require_permission("quiz.attempt")), db=Depends(get_db)):
    import json
    cur = get_cur(db)
    cur.execute("SELECT sp_get_student_id_by_user(%s) AS sid", (user_id,))
    row = cur.fetchone()
    if not row or not row["sid"]:
        fail("Student not found.", 403)
    student_id = row["sid"]

    cur.execute("SELECT * FROM sp_get_quiz_by_id(%s)", (id,))
    quiz = cur.fetchone()
    if not quiz:
        fail("Quiz not found.", 404)

    cur.execute("SELECT sp_check_quiz_already_submitted(%s, %s) AS submitted", (id, student_id))
    if cur.fetchone()["submitted"]:
        fail("You have already submitted this quiz.", 400)

    cur.execute("SELECT * FROM sp_submit_quiz(%s, %s, %s::jsonb)", (id, student_id, json.dumps(body.answers)))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    marks_obtained = int(result["marks"])
    total = int(result["total"])
    pct = float(result["percentage"])
    db.commit()

    try:
        from app.utils.notify import send_notification
        cur.execute("SELECT * FROM sp_get_teacher_for_quiz_notify(%s, %s)", (student_id, id))
        row2 = cur.fetchone()
        if row2:
            send_notification(
                row2["teacher_user_id"], "Quiz Submitted",
                row2["first_name"] + " " + row2["last_name"] + " submitted '" + quiz["title"] + "'. Score: " + str(marks_obtained) + "/" + str(total) + ".",
                "info"
            )
    except Exception:
        pass

    return ok(
        data={"marks": marks_obtained, "total": total, "percentage": pct},
        message="Quiz submitted! You scored " + str(marks_obtained) + "/" + str(total) + " (" + str(pct) + "%)"
    )


@router.get("/{id}/results")
def quiz_results(id: int, user_id: int = Depends(require_permission("quiz.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_quiz_by_id(%s)", (id,))
    quiz = cur.fetchone()
    if not quiz:
        fail("Quiz not found.", 404)

    cur.execute("SELECT * FROM sp_get_quiz_results(%s)", (id,))
    submitted = serialize(cur.fetchall())

    cur.execute("SELECT * FROM sp_get_quiz_not_submitted(%s, %s)", (quiz["class_id"], id))
    not_submitted = [dict(r) for r in cur.fetchall()]

    return ok(data={"quiz": dict(quiz), "submitted": submitted, "not_submitted": not_submitted})


@router.delete("/{id}")
def delete_quiz(id: int, user_id: int = Depends(require_permission("quiz.create")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_quiz(%s)", (id,))
    db.commit()
    return ok(message="Quiz deleted.")
