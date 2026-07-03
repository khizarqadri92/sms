CREATE OR REPLACE VIEW vw_student_report_card AS
SELECT s.id AS student_id, s.first_name, s.last_name,
       c.name AS class_name, sub.name AS subject_name,
       e.name AS exam_name, g.marks, g.grade
FROM grades g
JOIN students s  ON s.id = g.student_id
JOIN subjects sub ON sub.id = g.subject_id
JOIN exams e     ON e.id = g.exam_id
JOIN classes c   ON c.id = s.class_id;
