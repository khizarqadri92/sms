-- ============================================================
-- vw_teacher_timetable  --  weekly schedule per teacher
-- ============================================================
CREATE OR REPLACE VIEW vw_teacher_timetable AS
SELECT
    t.id                                AS teacher_id,
    t.employee_no,
    t.first_name || ' ' || t.last_name  AS teacher_name,
    tt.day_of_week,
    CASE tt.day_of_week
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
        WHEN 7 THEN 'Sunday'
    END                                 AS day_name,
    tt.start_time,
    tt.end_time,
    c.name                              AS class_name,
    sub.name                            AS subject_name,
    tt.room_number
FROM timetable tt
JOIN teachers t   ON t.id = tt.teacher_id
JOIN classes  c   ON c.id = tt.class_id
JOIN subjects sub ON sub.id = tt.subject_id
ORDER BY t.id, tt.day_of_week, tt.start_time;