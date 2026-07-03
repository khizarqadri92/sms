-- Calculate letter grade from numeric marks
CREATE OR REPLACE PROCEDURE sp_calculate_grades(p_exam_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE grades SET grade = CASE
        WHEN marks >= 90 THEN 'A+'
        WHEN marks >= 80 THEN 'A'
        WHEN marks >= 70 THEN 'B'
        WHEN marks >= 60 THEN 'C'
        WHEN marks >= 50 THEN 'D'
        ELSE 'F'
    END
    WHERE exam_id = p_exam_id;
    COMMIT;
END;
$$;
