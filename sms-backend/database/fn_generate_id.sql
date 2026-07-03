CREATE OR REPLACE FUNCTION fn_generate_id(p_role VARCHAR)
RETURNS VARCHAR LANGUAGE plpgsql AS $func$
DECLARE
    v_prefix    TEXT;
    v_separator TEXT := '-';
    v_year      TEXT := '';
    v_digits    INT  := 4;
    v_counter   INT;
    v_seq       TEXT;
    v_year_fmt  TEXT;
    v_result    TEXT;
BEGIN
    IF p_role = 'student' THEN
        SELECT value INTO v_prefix    FROM system_settings WHERE key = 'student_id_prefix';
        SELECT value INTO v_separator FROM system_settings WHERE key = 'student_id_separator';
        SELECT value INTO v_year_fmt  FROM system_settings WHERE key = 'student_id_year';
        SELECT value INTO v_digits    FROM system_settings WHERE key = 'student_id_digits';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'student_id_counter'
            RETURNING value::INT INTO v_counter;
    ELSIF p_role = 'teacher' THEN
        SELECT value INTO v_prefix    FROM system_settings WHERE key = 'teacher_id_prefix';
        SELECT value INTO v_separator FROM system_settings WHERE key = 'teacher_id_separator';
        SELECT value INTO v_digits    FROM system_settings WHERE key = 'teacher_id_digits';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'teacher_id_counter'
            RETURNING value::INT INTO v_counter;
        v_year_fmt := 'none';
    ELSIF p_role = 'parent' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'parent_id_prefix';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'parent_id_counter'
            RETURNING value::INT INTO v_counter;
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 4;
    ELSIF p_role = 'admin' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'admin_id_prefix';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'admin_id_counter'
            RETURNING value::INT INTO v_counter;
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSIF p_role = 'finance_officer' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'finance_id_prefix';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'finance_id_counter'
            RETURNING value::INT INTO v_counter;
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSIF p_role = 'principal' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'principal_id_prefix';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'principal_id_counter'
            RETURNING value::INT INTO v_counter;
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSIF p_role = 'academic_coordinator' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'coordinator_id_prefix';
        UPDATE system_settings SET value = (value::INT + 1)::TEXT WHERE key = 'coordinator_id_counter'
            RETURNING value::INT INTO v_counter;
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSE
        RETURN 'USR-0000';
    END IF;

    v_seq := LPAD(v_counter::TEXT, v_digits, '0');

    IF v_year_fmt = 'YYYY' THEN
        v_year   := TO_CHAR(NOW(), 'YYYY');
        v_result := v_prefix || v_separator || v_year || v_separator || v_seq;
    ELSIF v_year_fmt = 'YY' THEN
        v_year   := TO_CHAR(NOW(), 'YY');
        v_result := v_prefix || v_separator || v_year || v_separator || v_seq;
    ELSE
        v_result := v_prefix || v_separator || v_seq;
    END IF;

    RETURN v_result;
END;
$func$;