"""
Shared cleanup step for when a teacher's resignation is finalized (either via
the scheduled resignation_auto_lock job once their last working day passes,
or via HR manually clicking "Finalize Employee Exit"). History (attendance,
grades, past timetable, etc.) is untouched - only the ACTIVE assignments that
would make this teacher still show up as a class incharge, subject teacher,
or in "assign a teacher" dropdowns are cleared, and principal/academic
coordinator are notified of exactly which classes/subjects are now vacant.
"""
import psycopg2.extras


def cleanup_resigned_teacher_assignments(db, staff_user_id: int, campus_id: int):
    """
    staff_user_id: the users.id of the resigning staff member (not staff.id or teacher.id).
    campus_id: the resigning staff member's own campus, to scope who gets notified.
    No-op if this staff member isn't a teacher (has no row in `teachers`).
    """
    from app.utils.notify import send_notification, render_templated_notification

    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, first_name, last_name FROM teachers WHERE user_id=%s", (staff_user_id,))
    teacher = cur.fetchone()
    if not teacher:
        return {"is_teacher": False}
    teacher_id = teacher["id"]
    teacher_name = f"{teacher['first_name']} {teacher['last_name']}".strip()

    # Class-incharge / subject-teacher rows on class_teachers
    cur.execute("""
        SELECT c.id AS class_id, c.name AS class_name, c.section, ct.is_primary
        FROM class_teachers ct
        JOIN classes c ON c.id = ct.class_id
        WHERE ct.teacher_id = %s
        ORDER BY c.name, c.section
    """, (teacher_id,))
    class_rows = cur.fetchall()

    # Per-subject teaching assignments
    cur.execute("""
        SELECT c.id AS class_id, c.name AS class_name, c.section, s.name AS subject_name
        FROM class_subject_teacher_assignments csta
        JOIN classes c ON c.id = csta.class_id
        JOIN subjects s ON s.id = csta.subject_id
        WHERE csta.teacher_id = %s
        ORDER BY c.name, c.section, s.name
    """, (teacher_id,))
    subject_rows = cur.fetchall()

    if class_rows or subject_rows:
        def _cname(r):
            return r["class_name"] + (f" ({r['section']})" if r.get("section") else "")

        detail_lines = []
        incharge_classes = [r for r in class_rows if r["is_primary"]]
        subject_teacher_classes = [r for r in class_rows if not r["is_primary"]]
        if incharge_classes:
            detail_lines.append("Class incharge vacant for: " + ", ".join(_cname(r) for r in incharge_classes) + ".")
        if subject_teacher_classes:
            detail_lines.append("Subject-teacher role vacant for: " + ", ".join(_cname(r) for r in subject_teacher_classes) + ".")
        if subject_rows:
            detail_lines.append("Subjects now unassigned: " + ", ".join(f"{r['subject_name']} in {_cname(r)}" for r in subject_rows) + ".")
        vacancy_details = " ".join(detail_lines)
        default_title = "Teacher Resigned - Classes Vacant"
        default_body = f"{teacher_name} has resigned. {vacancy_details}"

        cur.execute("""
            SELECT DISTINCT u.id FROM users u
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id
            WHERE r.name IN ('principal', 'academic_coordinator')
              AND u.campus_id = %s AND u.is_active = TRUE
        """, (campus_id,))
        tags = {"teacher_name": teacher_name, "vacancy_details": vacancy_details}
        title, body = render_templated_notification("teacher_resigned", tags, default_title, default_body, campus_id=campus_id)
        for row in cur.fetchall():
            send_notification(row["id"], title, body, ntype="warning")

    cur.execute("UPDATE teachers SET status='resigned' WHERE id=%s", (teacher_id,))
    cur.execute("DELETE FROM class_teachers WHERE teacher_id=%s", (teacher_id,))
    cur.execute("DELETE FROM class_subject_teacher_assignments WHERE teacher_id=%s", (teacher_id,))

    return {
        "is_teacher": True,
        "classes_vacated": len(class_rows),
        "subjects_vacated": len(subject_rows),
    }
