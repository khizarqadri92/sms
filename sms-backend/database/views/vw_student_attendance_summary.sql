CREATE OR REPLACE VIEW vw_student_attendance_summary AS
SELECT
    s.id                                                        AS student_id,
    s.enrollment_no,
    s.first_name || ' ' || s.last_name                          AS student_name,
    c.name                                                      AS class_name,
    DATE_TRUNC('month', a.date)::DATE                           AS month,
    COUNT(*)                                                    AS total_days,
    COUNT(*) FILTER (WHERE a.status = 'present')                AS present_days,
    COUNT(*) FILTER (WHERE a.status = 'absent')                 AS absent_days,
    ROUND(COUNT(*) FILTER (WHERE a.status = 'present') * 100.0
          / NULLIF(COUNT(*), 0), 2)                             AS attendance_pct
FROM attendance a
JOIN students s ON s.id = a.student_id
JOIN classes  c ON c.id = a.class_id
GROUP BY s.id, s.enrollment_no, s.first_name, s.last_name, c.name,
         DATE_TRUNC('month', a.date);