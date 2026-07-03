CREATE OR REPLACE VIEW vw_class_attendance_summary AS
SELECT a.class_id, c.name AS class_name, a.date,
       COUNT(*) FILTER (WHERE a.status='present') AS present_count,
       COUNT(*) FILTER (WHERE a.status='absent')  AS absent_count,
       COUNT(*) AS total
FROM attendance a JOIN classes c ON c.id = a.class_id
GROUP BY a.class_id, c.name, a.date;
