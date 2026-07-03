-- Bulk-insert attendance for a class in one call
CREATE OR REPLACE PROCEDURE sp_record_attendance(
    p_records JSONB,  -- [{"student_id":1,"status":"present"}, ...]
    p_class_id INT, p_date DATE, p_marked_by INT
) LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO attendance(student_id, class_id, date, status, marked_by)
    SELECT (rec->>'student_id')::INT, p_class_id, p_date, rec->>'status', p_marked_by
    FROM jsonb_array_elements(p_records) AS rec
    ON CONFLICT DO NOTHING;
    COMMIT;
END;
$$;
