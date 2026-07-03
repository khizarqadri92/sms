-- Generate fee invoices for all students in a class
CREATE OR REPLACE PROCEDURE sp_generate_fee_invoice(
    p_fee_structure_id INT, p_class_id INT
) LANGUAGE plpgsql AS $$
DECLARE fs fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO fs FROM fee_structures WHERE id = p_fee_structure_id;
    INSERT INTO fee_invoices(student_id, fee_structure_id, amount, due_date)
    SELECT s.id, p_fee_structure_id, fs.amount, fs.due_date
    FROM students s WHERE s.class_id = p_class_id;
    COMMIT;
END;
$$;
