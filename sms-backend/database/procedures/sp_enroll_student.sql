-- Enroll a student: create user + student record atomically
CREATE OR REPLACE PROCEDURE sp_enroll_student(
    p_email       VARCHAR, p_password_hash VARCHAR,
    p_first_name  VARCHAR, p_last_name VARCHAR,
    p_dob         DATE,    p_gender VARCHAR,
    p_class_id    INT,     p_parent_id INT,
    OUT p_student_id INT
) LANGUAGE plpgsql AS $$
DECLARE v_user_id INT; v_role_id INT;
BEGIN
    INSERT INTO users(email, password_hash) VALUES(p_email, p_password_hash) RETURNING id INTO v_user_id;
    SELECT id INTO v_role_id FROM roles WHERE name = 'student';
    INSERT INTO user_roles(user_id, role_id) VALUES(v_user_id, v_role_id);
    INSERT INTO students(user_id, first_name, last_name, date_of_birth, gender, class_id, parent_id)
    VALUES(v_user_id, p_first_name, p_last_name, p_dob, p_gender, p_class_id, p_parent_id)
    RETURNING id INTO p_student_id;
    COMMIT;
END;
$$;
