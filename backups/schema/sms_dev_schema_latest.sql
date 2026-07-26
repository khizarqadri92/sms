--
-- PostgreSQL database dump
--

\restrict KtTNsyxyoeDFtdQu1DWSj5YLji4LagWghH2Smmrn7Yzh9rHd4fCuOy9tHUv50aJ

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: fn_announce_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_announce_assignment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_subj VARCHAR;
BEGIN
    SELECT name INTO v_subj FROM subjects WHERE id = NEW.subject_id;
    PERFORM sp_system_announcement(
        '📋 Assignment: ' || NEW.title,
        'New assignment "' || NEW.title || '" for ' || COALESCE(v_subj,'') ||
        ' due on ' || NEW.due_date::TEXT || '.',
        'normal', 'student', NEW.class_id, 'assignment', NEW.id
    );
    RETURN NEW;
END;
$$;


--
-- Name: fn_announce_exam(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_announce_exam() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM sp_system_announcement(
        '📝 Exam Scheduled: ' || NEW.name,
        'Exam "' || NEW.name || '" scheduled from ' ||
        NEW.start_date::TEXT || ' to ' || NEW.end_date::TEXT || '.',
        'important', 'student', NULL, 'exam', NEW.id
    );
    RETURN NEW;
END;
$$;


--
-- Name: fn_announce_holiday(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_announce_holiday() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_holiday = TRUE THEN
        PERFORM sp_system_announcement(
            '🏖 Holiday: ' || NEW.title,
            'School will be closed on ' || NEW.event_date::TEXT ||
            CASE WHEN NEW.end_date IS NOT NULL AND NEW.end_date != NEW.event_date
                 THEN ' to ' || NEW.end_date::TEXT ELSE '' END || '.',
            'important', 'all', NULL, 'holiday', NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_announce_quiz(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_announce_quiz() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_subj VARCHAR;
BEGIN
    SELECT name INTO v_subj FROM subjects WHERE id = NEW.subject_id;
    PERFORM sp_system_announcement(
        '📝 Quiz: ' || NEW.title,
        'New quiz "' || NEW.title || '" for ' || COALESCE(v_subj,'') ||
        ' due: ' || NEW.due_date::TEXT || '.',
        'normal', 'student', NEW.class_id, 'quiz', NEW.id
    );
    RETURN NEW;
END;
$$;


--
-- Name: fn_audit_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log(table_name, record_id, operation, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW)::JSONB);
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log(table_name, record_id, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB);
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log(table_name, record_id, operation, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::JSONB);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: fn_generate_id(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_id(p_role character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_preview_next_id(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_preview_next_id(p_role character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
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
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'student_id_counter';
    ELSIF p_role = 'teacher' THEN
        SELECT value INTO v_prefix    FROM system_settings WHERE key = 'teacher_id_prefix';
        SELECT value INTO v_separator FROM system_settings WHERE key = 'teacher_id_separator';
        SELECT value INTO v_digits    FROM system_settings WHERE key = 'teacher_id_digits';
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'teacher_id_counter';
        v_year_fmt := 'none';
    ELSIF p_role = 'parent' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'parent_id_prefix';
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'parent_id_counter';
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 4;
    ELSIF p_role = 'admin' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'admin_id_prefix';
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'admin_id_counter';
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSIF p_role = 'finance_officer' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'finance_id_prefix';
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'finance_id_counter';
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSIF p_role = 'principal' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'principal_id_prefix';
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'principal_id_counter';
        v_year_fmt := 'none'; v_separator := '-'; v_digits := 3;
    ELSIF p_role = 'academic_coordinator' THEN
        SELECT value INTO v_prefix FROM system_settings WHERE key = 'coordinator_id_prefix';
        SELECT (value::INT + 1) INTO v_counter FROM system_settings WHERE key = 'coordinator_id_counter';
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
$$;


--
-- Name: sp_act_on_pr_step(integer, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_act_on_pr_step(p_pr_id integer, p_acting_user_id integer, p_action character varying, p_notes text) RETURNS TABLE(pr_status character varying, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pr_status VARCHAR;
    v_step RECORD;
    v_authorized BOOLEAN;
    v_remaining_pending INTEGER;
BEGIN
    SELECT status INTO v_pr_status FROM purchase_requisitions WHERE id = p_pr_id;
    IF v_pr_status IS NULL THEN
        RETURN QUERY SELECT NULL::VARCHAR, 'PR not found.'::VARCHAR; RETURN;
    END IF;
    IF v_pr_status != 'submitted' THEN
        RETURN QUERY SELECT v_pr_status, 'This PR is not awaiting approval.'::VARCHAR; RETURN;
    END IF;

    SELECT * INTO v_step FROM pr_approval_instances
    WHERE pr_id = p_pr_id AND status = 'pending'
    ORDER BY step_order ASC LIMIT 1;

    IF v_step IS NULL THEN
        RETURN QUERY SELECT v_pr_status, 'There is no pending approval step for this PR.'::VARCHAR; RETURN;
    END IF;

    IF v_step.approver_role = 'department_head' THEN
        v_authorized := (v_step.resolved_approver_id = p_acting_user_id);
    ELSE
        SELECT EXISTS(
            SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = p_acting_user_id AND r.name = v_step.approver_role
        ) INTO v_authorized;
    END IF;

    IF NOT v_authorized THEN
        RETURN QUERY SELECT v_pr_status, 'You are not authorized to act on this approval step.'::VARCHAR; RETURN;
    END IF;

    IF p_action = 'approve' THEN
        UPDATE pr_approval_instances
        SET status = 'approved', acted_by = p_acting_user_id, acted_at = NOW(), notes = p_notes
        WHERE id = v_step.id;

        SELECT COUNT(*) INTO v_remaining_pending FROM pr_approval_instances WHERE pr_id = p_pr_id AND status = 'pending';
        IF v_remaining_pending = 0 THEN
            UPDATE purchase_requisitions SET status = 'approved' WHERE id = p_pr_id;
            v_pr_status := 'approved';
        END IF;

    ELSIF p_action = 'reject' THEN
        UPDATE pr_approval_instances
        SET status = 'rejected', acted_by = p_acting_user_id, acted_at = NOW(), notes = p_notes
        WHERE id = v_step.id;

        UPDATE pr_approval_instances SET status = 'skipped' WHERE pr_id = p_pr_id AND status = 'pending';
        UPDATE purchase_requisitions SET status = 'rejected' WHERE id = p_pr_id;
        v_pr_status := 'rejected';
    ELSE
        RETURN QUERY SELECT v_pr_status, 'Invalid action.'::VARCHAR; RETURN;
    END IF;

    RETURN QUERY SELECT v_pr_status, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_action_leave(integer, character varying, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_action_leave(p_request_id integer, p_action character varying, p_actioned_by integer, p_note text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status    VARCHAR;
    v_student   INT;
    v_type_id   INT;
    v_days      INT;
    v_year_id   INT;
BEGIN
    SELECT lr.status, lr.student_id, lr.leave_type_id, lr.total_days
    INTO v_status, v_student, v_type_id, v_days
    FROM leave_requests lr WHERE lr.id = p_request_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::INT, 'Leave request not found'::VARCHAR; RETURN;
    END IF;
    IF v_status NOT IN ('pending','recommended') THEN
        RETURN QUERY SELECT NULL::INT, ('Cannot action a request with status: ' || v_status)::VARCHAR; RETURN;
    END IF;
    IF p_action NOT IN ('approve','reject') THEN
        RETURN QUERY SELECT NULL::INT, 'Invalid action. Use approve or reject'::VARCHAR; RETURN;
    END IF;

    IF p_action = 'approve' THEN
        UPDATE leave_requests SET
            status = 'approved',
            approved_by = p_actioned_by,
            approved_at = NOW(),
            approver_note = p_note
        WHERE leave_requests.id = p_request_id;

        SELECT ay.id INTO v_year_id FROM academic_years ay WHERE ay.is_active = TRUE LIMIT 1;
        INSERT INTO leave_balances(student_id, leave_type_id, academic_year_id, days_used)
        VALUES(v_student, v_type_id, v_year_id, v_days)
        ON CONFLICT(student_id, leave_type_id, academic_year_id)
        DO UPDATE SET days_used = leave_balances.days_used + v_days;
    ELSE
        UPDATE leave_requests SET
            status = 'rejected',
            approved_by = p_actioned_by,
            approved_at = NOW(),
            rejection_reason = p_note
        WHERE leave_requests.id = p_request_id;
    END IF;

    RETURN QUERY SELECT p_request_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_activate_academic_year(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_activate_academic_year(p_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE academic_years SET is_active = FALSE;
    UPDATE academic_years SET is_active = TRUE WHERE id = p_id;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: procurement_approval_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_approval_steps (
    id integer NOT NULL,
    rule_id integer NOT NULL,
    step_order integer NOT NULL,
    approver_role character varying(50) NOT NULL
);


--
-- Name: sp_add_approval_step(integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_approval_step(p_rule_id integer, p_step_order integer, p_approver_role character varying) RETURNS SETOF public.procurement_approval_steps
    LANGUAGE sql
    AS $$
    INSERT INTO procurement_approval_steps (rule_id, step_order, approver_role)
    VALUES (p_rule_id, p_step_order, p_approver_role)
    RETURNING *;
$$;


--
-- Name: sp_add_book_copies(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_book_copies(p_book_id integer, p_num_copies integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start INTEGER;
    i INTEGER;
BEGIN
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_start FROM library_book_copies WHERE book_id = p_book_id;
    FOR i IN 0..(p_num_copies - 1) LOOP
        INSERT INTO library_book_copies (book_id, accession_no, barcode)
        VALUES (p_book_id, 'ACC-' || p_book_id || '-' || (v_start + i), 'BC-' || p_book_id || '-' || (v_start + i));
    END LOOP;
END;
$$;


--
-- Name: sp_add_education(integer, character varying, character varying, character varying, integer, integer, character varying, boolean, character varying, numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_education(p_staff_id integer, p_degree character varying, p_institution character varying, p_field character varying, p_start_year integer, p_end_year integer, p_grade character varying, p_is_current boolean, p_grade_type character varying, p_total_marks numeric, p_awarded_marks numeric, p_total_cgpa numeric, p_awarded_cgpa numeric) RETURNS integer
    LANGUAGE plpgsql
    AS $$DECLARE v_id INT;
BEGIN
    INSERT INTO staff_education(staff_id, degree, institution, field_of_study, start_year, end_year,
        grade, is_current, grade_type, total_marks, awarded_marks, total_cgpa, awarded_cgpa)
    VALUES(p_staff_id, p_degree, p_institution, p_field, p_start_year, p_end_year,
        p_grade, p_is_current, p_grade_type, p_total_marks, p_awarded_marks, p_total_cgpa, p_awarded_cgpa)
    RETURNING id INTO v_id;
    RETURN v_id;
END;$$;


--
-- Name: sp_add_emergency_contact(integer, character varying, character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_emergency_contact(p_staff_id integer, p_name character varying, p_relationship character varying, p_phone character varying, p_address text) RETURNS integer
    LANGUAGE plpgsql
    AS $$DECLARE v_id INT;
BEGIN
    INSERT INTO staff_emergency_contacts(staff_id, name, relationship, phone, address)
    VALUES(p_staff_id, p_name, p_relationship, p_phone, p_address) RETURNING id INTO v_id;
    RETURN v_id;
END;$$;


--
-- Name: sp_add_employment_history(integer, character varying, character varying, date, date, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_employment_history(p_staff_id integer, p_org character varying, p_role character varying, p_from date, p_to date, p_reason character varying, p_ref_name character varying, p_ref_phone character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $$DECLARE v_id INT;
BEGIN
    INSERT INTO staff_employment_history(staff_id, organization, role, from_date, to_date, reason_leaving, reference_name, reference_phone)
    VALUES(p_staff_id, p_org, p_role, p_from, p_to, p_reason, p_ref_name, p_ref_phone)
    RETURNING id INTO v_id;
    RETURN v_id;
END;$$;


--
-- Name: sp_add_exam_subject(integer, integer, integer, numeric, numeric, date, time without time zone, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_exam_subject(p_exam_id integer, p_subject_id integer, p_teacher_id integer, p_total_marks numeric, p_passing_marks numeric, p_exam_date date, p_start_time time without time zone, p_duration_mins integer, p_venue character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO exam_subjects(exam_id,subject_id,teacher_id,total_marks,passing_marks,exam_date,start_time,duration_mins,venue)
    VALUES(p_exam_id,p_subject_id,p_teacher_id,p_total_marks,p_passing_marks,p_exam_date,p_start_time,p_duration_mins,p_venue)
    ON CONFLICT(exam_id,subject_id) DO UPDATE SET
        teacher_id=COALESCE(p_teacher_id, exam_subjects.teacher_id),
        total_marks=p_total_marks, passing_marks=p_passing_marks,
        exam_date=p_exam_date, start_time=p_start_time,
        duration_mins=p_duration_mins, venue=p_venue
    RETURNING exam_subjects.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_add_exam_subject(integer, integer, integer, integer, numeric, numeric, date, time without time zone, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_exam_subject(p_exam_id integer, p_class_id integer, p_subject_id integer, p_teacher_id integer, p_total_marks numeric, p_passing_marks numeric, p_exam_date date, p_start_time time without time zone, p_duration_mins integer, p_venue character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO exam_subjects(exam_id,class_id,subject_id,teacher_id,total_marks,passing_marks,exam_date,start_time,duration_mins,venue)
    VALUES(p_exam_id,p_class_id,p_subject_id,p_teacher_id,p_total_marks,p_passing_marks,p_exam_date,p_start_time,p_duration_mins,p_venue)
    ON CONFLICT(exam_id,class_id,subject_id) DO UPDATE SET
        teacher_id=COALESCE(p_teacher_id, exam_subjects.teacher_id),
        total_marks=p_total_marks, passing_marks=p_passing_marks,
        exam_date=p_exam_date, start_time=p_start_time,
        duration_mins=p_duration_mins, venue=p_venue
    RETURNING exam_subjects.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_add_experience(integer, character varying, character varying, date, date, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_experience(p_staff_id integer, p_company character varying, p_designation character varying, p_from date, p_to date, p_is_current boolean, p_desc text) RETURNS integer
    LANGUAGE plpgsql
    AS $$DECLARE v_id INT;
BEGIN
    INSERT INTO staff_experience(staff_id, company, designation, from_date, to_date, is_current, description)
    VALUES(p_staff_id, p_company, p_designation, p_from, p_to, p_is_current, p_desc)
    RETURNING id INTO v_id;
    RETURN v_id;
END;$$;


--
-- Name: sp_add_pr_item(integer, integer, character varying, numeric, character varying, numeric, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_pr_item(p_pr_id integer, p_item_id integer, p_item_description character varying, p_quantity numeric, p_unit character varying, p_estimated_unit_price numeric, p_remarks text, p_category_id integer, p_specifications jsonb) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_item_row_id INTEGER;
    v_resolved_category_id INTEGER;
BEGIN
    SELECT pr.status INTO v_status FROM purchase_requisitions pr WHERE pr.id = p_pr_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'PR not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'draft' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Items can only be added while the PR is a draft.'::VARCHAR; RETURN;
    END IF;

    IF p_item_id IS NOT NULL THEN
        SELECT it.category_id INTO v_resolved_category_id FROM procurement_items it WHERE it.id = p_item_id;
    ELSE
        v_resolved_category_id := p_category_id;
    END IF;

    INSERT INTO pr_items (pr_id, item_id, item_description, quantity, unit, estimated_unit_price, remarks, category_id, specifications)
    VALUES (p_pr_id, p_item_id, p_item_description, p_quantity, p_unit, p_estimated_unit_price, p_remarks, v_resolved_category_id, p_specifications)
    RETURNING pr_items.id INTO v_item_row_id;

    UPDATE purchase_requisitions
    SET total_estimated_amount = (
        SELECT COALESCE(SUM(quantity * COALESCE(estimated_unit_price, 0)), 0) FROM pr_items WHERE pr_id = p_pr_id
    )
    WHERE purchase_requisitions.id = p_pr_id;

    RETURN QUERY SELECT v_item_row_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_add_syllabus_topic(integer, character varying, text, integer, integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_syllabus_topic(p_syllabus_id integer, p_title character varying, p_description text, p_planned_week integer DEFAULT NULL::integer, p_planned_month integer DEFAULT NULL::integer, p_planned_date date DEFAULT NULL::date) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT; v_sort INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM syllabus s WHERE s.id=p_syllabus_id) THEN
        RETURN QUERY SELECT NULL::INT, chr(83)||chr(121)||chr(108)||chr(108)||chr(97)||chr(98)||chr(117)||chr(115)||chr(32)||chr(110)||chr(111)||chr(116)||chr(32)||chr(102)||chr(111)||chr(117)||chr(110)||chr(100); RETURN;
    END IF;
    SELECT COALESCE(MAX(st.sort_order),0)+1 INTO v_sort FROM syllabus_topics st WHERE st.syllabus_id=p_syllabus_id;
    INSERT INTO syllabus_topics(syllabus_id,title,description,sort_order,planned_week,planned_month,planned_date)
    VALUES(p_syllabus_id,p_title,p_description,v_sort,p_planned_week,p_planned_month,p_planned_date)
    RETURNING syllabus_topics.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_add_syllabus_topic(integer, character varying, text, integer, integer, integer, date, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_syllabus_topic(p_syllabus_id integer, p_title character varying, p_description text, p_sort_order integer, p_planned_week integer, p_planned_month integer, p_planned_date date, p_month_group_title character varying) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO syllabus_topics (syllabus_id, title, description, sort_order, planned_week, planned_month, planned_date, month_group_title)
    VALUES (p_syllabus_id, p_title, p_description, p_sort_order, p_planned_week, p_planned_month, p_planned_date, p_month_group_title)
    RETURNING id;
$$;


--
-- Name: sp_add_withdrawal_document(integer, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_add_withdrawal_document(p_request_id integer, p_filename character varying, p_url character varying, p_uploaded_by integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO withdrawal_documents(request_id, filename, url, uploaded_by)
    VALUES(p_request_id, p_filename, p_url, p_uploaded_by)
    RETURNING withdrawal_documents.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_apply_leave(integer, integer, date, date, text, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_apply_leave(p_student_id integer, p_leave_type_id integer, p_from_date date, p_to_date date, p_reason text, p_certificate_url character varying, p_applied_by integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id          INT;
    v_total_days  INT;
    v_max_days    INT;
    v_days_used   INT;
    v_cert_req    BOOLEAN;
    v_year_id     INT;
    v_exists      INT;
BEGIN
    IF p_from_date > p_to_date THEN
        RETURN QUERY SELECT NULL::INT, 'From date cannot be after to date'::VARCHAR; RETURN;
    END IF;
    IF p_from_date < CURRENT_DATE THEN
        RETURN QUERY SELECT NULL::INT, 'Cannot apply leave for past dates'::VARCHAR; RETURN;
    END IF;

    SELECT COUNT(*) INTO v_total_days
    FROM generate_series(p_from_date, p_to_date, '1 day'::interval) d
    WHERE EXTRACT(DOW FROM d) NOT IN (0,6);

    IF v_total_days = 0 THEN
        RETURN QUERY SELECT NULL::INT, 'Selected dates fall on weekends only'::VARCHAR; RETURN;
    END IF;

    SELECT lt.certificate_required, lt.max_days_per_year
    INTO v_cert_req, v_max_days
    FROM leave_types lt WHERE lt.id = p_leave_type_id AND lt.is_active = TRUE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::INT, 'Invalid or inactive leave type'::VARCHAR; RETURN;
    END IF;

    IF v_cert_req AND (p_certificate_url IS NULL OR p_certificate_url = '') THEN
        RETURN QUERY SELECT NULL::INT, 'Certificate is required for this leave type'::VARCHAR; RETURN;
    END IF;

    IF v_max_days IS NOT NULL THEN
        SELECT ay.id INTO v_year_id FROM academic_years ay WHERE ay.is_active = TRUE LIMIT 1;
        SELECT COALESCE(lb.days_used, 0) INTO v_days_used
        FROM leave_balances lb
        WHERE lb.student_id = p_student_id
          AND lb.leave_type_id = p_leave_type_id
          AND lb.academic_year_id = v_year_id;
        IF (v_days_used + v_total_days) > v_max_days THEN
            RETURN QUERY SELECT NULL::INT, ('Insufficient leave balance. Used: ' || v_days_used || ' / ' || v_max_days)::VARCHAR; RETURN;
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_exists
    FROM leave_requests lr
    WHERE lr.student_id = p_student_id
      AND lr.status NOT IN ('rejected')
      AND (lr.from_date, lr.to_date) OVERLAPS (p_from_date, p_to_date);

    IF v_exists > 0 THEN
        RETURN QUERY SELECT NULL::INT, 'An overlapping leave request already exists'::VARCHAR; RETURN;
    END IF;

    INSERT INTO leave_requests(student_id, leave_type_id, from_date, to_date, total_days, reason, certificate_url, applied_by)
    VALUES(p_student_id, p_leave_type_id, p_from_date, p_to_date, v_total_days, p_reason, p_certificate_url, p_applied_by)
    RETURNING leave_requests.id INTO v_id;

    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_apply_withdrawal(integer, integer, text, date, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_apply_withdrawal(p_student_id integer, p_requested_by integer, p_reason text, p_effective_date date, p_document_url character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    IF EXISTS(SELECT 1 FROM withdrawal_requests wr
              WHERE wr.student_id = p_student_id
              AND wr.status NOT IN ('rejected', 'withdrawn')) THEN
        RETURN QUERY SELECT NULL::INT, 'A withdrawal request is already in progress'::VARCHAR; RETURN;
    END IF;
    INSERT INTO withdrawal_requests(student_id, requested_by, reason, effective_date, documents)
    VALUES(p_student_id, p_requested_by, p_reason, p_effective_date, p_document_url)
    RETURNING withdrawal_requests.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_approve_datesheet(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_approve_datesheet(p_exam_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE exams SET
        datesheet_status='approved',
        datesheet_approved_at=NOW(), datesheet_approved_by=p_user_id
    WHERE exams.id=p_exam_id;
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_approve_exam_results(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_approve_exam_results(p_exam_id integer, p_principal_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE exams SET status='approved',
        approved_by=p_principal_id, approved_at=NOW()
    WHERE exams.id=p_exam_id;
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_approve_waiver_full(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_approve_waiver_full(p_waiver_id integer, p_actioned_by integer, p_note text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id INTEGER;
BEGIN
    SELECT invoice_id INTO v_invoice_id FROM withdrawal_waivers WHERE id = p_waiver_id;
    IF v_invoice_id IS NOT NULL THEN
        UPDATE fee_invoice_items SET is_waived = TRUE, waived_at = NOW(), waived_by = p_actioned_by
        WHERE invoice_id = v_invoice_id;
        UPDATE fee_invoices SET status = 'cancelled' WHERE id = v_invoice_id;
    END IF;
    UPDATE withdrawal_waivers SET status = 'approved', actioned_by = p_actioned_by,
        actioned_at = NOW(), action_note = p_note WHERE id = p_waiver_id;
END;
$$;


--
-- Name: sp_approve_waiver_partial(integer, integer, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_approve_waiver_partial(p_waiver_id integer, p_actioned_by integer, p_note text, p_approved_amount numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE withdrawal_waivers SET
        status = 'approved',
        waiver_type = 'partial',
        waiver_amount = p_approved_amount,
        actioned_by = p_actioned_by,
        actioned_at = NOW(),
        action_note = p_note
    WHERE id = p_waiver_id;
END;
$$;


--
-- Name: sp_approve_withdrawal(integer, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_approve_withdrawal(p_id integer, p_principal_id integer, p_action character varying, p_note text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM withdrawal_requests wr WHERE wr.id = p_id AND wr.status = 'under_review') THEN
        RETURN QUERY SELECT NULL::INT, 'Not ready for approval'::VARCHAR; RETURN;
    END IF;
    IF p_action = 'approve' THEN
        IF NOT EXISTS(SELECT 1 FROM withdrawal_requests wr WHERE wr.id = p_id AND wr.teacher_conduct_submitted = TRUE) THEN
            RETURN QUERY SELECT NULL::INT, 'Conduct form not submitted by class teacher'::VARCHAR; RETURN;
        END IF;
        UPDATE withdrawal_requests SET status = 'coordinator_final',
            principal_id = p_principal_id, principal_note = p_note, principal_at = NOW()
        WHERE withdrawal_requests.id = p_id;
    ELSE
        UPDATE withdrawal_requests SET status = 'rejected',
            principal_id = p_principal_id, principal_note = p_note, principal_at = NOW()
        WHERE withdrawal_requests.id = p_id;
    END IF;
    RETURN QUERY SELECT p_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_assign_class_subject(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_class_subject(p_class_id integer, p_subject_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO class_subjects (class_id, subject_id)
    VALUES (p_class_id, p_subject_id) ON CONFLICT DO NOTHING;
$$;


--
-- Name: sp_assign_class_teacher(integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_class_teacher(p_class_id integer, p_teacher_id integer, p_is_primary boolean) RETURNS TABLE(error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_existing_name VARCHAR;
    v_incharge_name VARCHAR;
    v_incharge_class_type VARCHAR;
    v_this_class_type VARCHAR;
    v_mont_incharge_name VARCHAR;
BEGIN
    -- Rule 1: Teacher can be incharge of only one class
    IF p_is_primary THEN
        SELECT c.name INTO v_existing_name FROM class_teachers ct
        JOIN classes c ON c.id = ct.class_id
        WHERE ct.teacher_id = p_teacher_id AND ct.is_primary = TRUE AND ct.class_id != p_class_id;
        IF v_existing_name IS NOT NULL THEN
            RETURN QUERY SELECT ('This teacher is already class incharge of ' || v_existing_name || '. A teacher can be incharge of only one class.')::VARCHAR;
            RETURN;
        END IF;
    END IF;

    -- Rule 2: Montessori incharge cannot be assigned as subject teacher elsewhere
    SELECT c.name, c.class_type INTO v_incharge_name, v_incharge_class_type
    FROM class_teachers ct JOIN classes c ON c.id = ct.class_id
    WHERE ct.teacher_id = p_teacher_id AND ct.is_primary = TRUE;
    IF v_incharge_name IS NOT NULL AND v_incharge_class_type = 'montessori' AND NOT p_is_primary THEN
        RETURN QUERY SELECT ('This teacher is the Montessori incharge of ' || v_incharge_name || ' and cannot be assigned as a subject teacher to other classes.')::VARCHAR;
        RETURN;
    END IF;

    -- Rule 3: Cannot assign a Montessori class incharge from another class as regular teacher here
    SELECT class_type INTO v_this_class_type FROM classes WHERE id = p_class_id;
    IF v_this_class_type IS NOT NULL THEN
        IF v_this_class_type = 'montessori' AND NOT p_is_primary THEN
            RETURN QUERY SELECT 'Montessori classes only allow one Class Incharge. Please assign as Incharge.'::VARCHAR;
            RETURN;
        END IF;
        IF v_this_class_type != 'montessori' AND NOT p_is_primary THEN
            SELECT c.name INTO v_mont_incharge_name FROM class_teachers ct
            JOIN classes c ON c.id = ct.class_id
            WHERE ct.teacher_id = p_teacher_id AND ct.is_primary = TRUE AND c.class_type = 'montessori';
            IF v_mont_incharge_name IS NOT NULL THEN
                RETURN QUERY SELECT ('This teacher is the Montessori incharge of ' || v_mont_incharge_name || ' and cannot teach other classes.')::VARCHAR;
                RETURN;
            END IF;
        END IF;
    END IF;

    IF p_is_primary THEN
        UPDATE class_teachers SET is_primary = FALSE WHERE class_id = p_class_id;
    END IF;

    INSERT INTO class_teachers (class_id, teacher_id, is_primary)
    VALUES (p_class_id, p_teacher_id, p_is_primary)
    ON CONFLICT (class_id, teacher_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

    RETURN QUERY SELECT NULL::VARCHAR;
END;
$$;


--
-- Name: sp_assign_hearing_committee(integer, integer[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_hearing_committee(p_case_id integer, p_teacher_ids integer[], p_head_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE t_id INT;
BEGIN
    DELETE FROM hearing_committee WHERE hearing_committee.case_id=p_case_id;
    FOREACH t_id IN ARRAY p_teacher_ids LOOP
        INSERT INTO hearing_committee(case_id, teacher_id, is_head)
        VALUES(p_case_id, t_id, t_id=p_head_id)
        ON CONFLICT(case_id,teacher_id) DO UPDATE SET is_head=(t_id=p_head_id);
    END LOOP;
    RETURN QUERY SELECT p_case_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_assign_or_revoke_role(integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_or_revoke_role(p_user_id integer, p_role_id integer, p_action character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_action = 'assign' THEN
        INSERT INTO user_roles (user_id, role_id) VALUES (p_user_id, p_role_id) ON CONFLICT DO NOTHING;
    ELSE
        DELETE FROM user_roles WHERE user_id = p_user_id AND role_id = p_role_id;
    END IF;
END;
$$;


--
-- Name: sp_assign_permission(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_permission(p_role_id integer, p_permission_id integer, p_granted_by integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO role_permissions (role_id, permission_id, granted_by)
    VALUES (p_role_id, p_permission_id, p_granted_by)
    ON CONFLICT DO NOTHING;
$$;


--
-- Name: sp_assign_rfid_card(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_rfid_card(p_staff_id integer, p_card_uid character varying) RETURNS TABLE(id integer, error_msg text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id INT;
BEGIN
    IF EXISTS(SELECT 1 FROM staff_rfid_cards WHERE card_uid = p_card_uid) THEN
        RETURN QUERY SELECT NULL::INT, 'This card UID is already assigned to someone.'::TEXT;
        RETURN;
    END IF;
    INSERT INTO staff_rfid_cards(staff_id, card_uid) VALUES(p_staff_id, p_card_uid) RETURNING staff_rfid_cards.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::TEXT;
END;
$$;


--
-- Name: sp_assign_role(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_role(p_user_id integer, p_role_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO user_roles (user_id, role_id) VALUES (p_user_id, p_role_id) ON CONFLICT DO NOTHING;
$$;


--
-- Name: sp_assign_role_permission(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_role_permission(p_role_name character varying, p_permission_code character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_role_id INT; v_perm_id INT;
BEGIN
    SELECT r.id INTO v_role_id FROM roles r WHERE r.name=p_role_name;
    SELECT p.id INTO v_perm_id FROM permissions p WHERE p.code=p_permission_code;
    IF v_role_id IS NULL THEN RETURN QUERY SELECT NULL::INT, (chr(82)||chr(111)||chr(108)||chr(101)||chr(32)||chr(110)||chr(111)||chr(116)||chr(32)||chr(102)||chr(111)||chr(117)||chr(110)||chr(100))::VARCHAR; RETURN; END IF;
    IF v_perm_id IS NULL THEN RETURN QUERY SELECT NULL::INT, (chr(80)||chr(101)||chr(114)||chr(109)||chr(32)||chr(110)||chr(111)||chr(116)||chr(32)||chr(102)||chr(111)||chr(117)||chr(110)||chr(100))::VARCHAR; RETURN; END IF;
    INSERT INTO role_permissions(role_id,permission_id) VALUES(v_role_id,v_perm_id) ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT v_role_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_assign_role_permission(integer, integer, character varying, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_assign_role_permission(IN p_role_id integer, IN p_permission_id integer, IN p_action character varying, IN p_granted_by integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_action = 'grant' THEN
        INSERT INTO role_permissions (role_id, permission_id, granted_by)
        VALUES (p_role_id, p_permission_id, p_granted_by)
        ON CONFLICT DO NOTHING;
    ELSIF p_action = 'revoke' THEN
        DELETE FROM role_permissions
        WHERE role_id = p_role_id AND permission_id = p_permission_id;
    ELSE
        RAISE EXCEPTION 'p_action must be grant or revoke, got: %', p_action;
    END IF;
END;
$$;


--
-- Name: sp_assign_teacher_subject(integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_assign_teacher_subject(p_teacher_id integer, p_subject_id integer, p_action character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_action = 'assign' THEN
        INSERT INTO teacher_subjects (teacher_id, subject_id)
        VALUES (p_teacher_id, p_subject_id) ON CONFLICT DO NOTHING;
    ELSE
        DELETE FROM teacher_subjects WHERE teacher_id = p_teacher_id AND subject_id = p_subject_id;
    END IF;
END;
$$;


--
-- Name: sp_auto_close_attendance_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_auto_close_attendance_sessions() RETURNS TABLE(closed_count integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE staff_attendance_sessions
    SET clock_out_at = NOW(), auto_closed = true, updated_at = NOW()
    WHERE clock_out_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT v_count;
END;
$$;


--
-- Name: sp_blacklist_vendor(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_blacklist_vendor(p_id integer, p_reason text) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_vendors SET is_blacklisted = TRUE, blacklist_reason = p_reason WHERE id = p_id;
$$;


--
-- Name: sp_calculate_grades(integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_calculate_grades(IN p_exam_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_can_mark_class_attendance(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_can_mark_class_attendance(p_user_id integer, p_class_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(
        SELECT 1 FROM class_teachers ct
        JOIN teachers t ON t.id = ct.teacher_id
        WHERE t.user_id = p_user_id AND ct.class_id = p_class_id AND ct.is_primary = TRUE
    ) OR EXISTS(
        SELECT 1 FROM roles r JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id AND r.name IN ('superadmin','admin','principal','academic_coordinator')
    );
$$;


--
-- Name: sp_cancel_po(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_cancel_po(p_po_id integer) RETURNS TABLE(error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_pr_id INTEGER;
BEGIN
    SELECT status, pr_id INTO v_status, v_pr_id FROM purchase_orders WHERE id = p_po_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT 'Purchase Order not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status IN ('completed', 'cancelled') THEN
        RETURN QUERY SELECT 'This Purchase Order cannot be cancelled.'::VARCHAR; RETURN;
    END IF;

    UPDATE purchase_orders SET status = 'cancelled' WHERE id = p_po_id;
    UPDATE purchase_requisitions SET status = 'approved' WHERE id = v_pr_id;

    RETURN QUERY SELECT NULL::VARCHAR;
END;
$$;


--
-- Name: sp_cancel_reservation(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_cancel_reservation(p_reservation_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_book_id INTEGER;
    v_copy_id INTEGER;
BEGIN
    SELECT r.status, r.book_id INTO v_status, v_book_id FROM library_reservations r WHERE r.id = p_reservation_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Reservation not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status IN ('fulfilled','cancelled') THEN
        RETURN QUERY SELECT NULL::INTEGER, 'This reservation is already closed.'::VARCHAR; RETURN;
    END IF;

    UPDATE library_reservations SET status = 'cancelled' WHERE library_reservations.id = p_reservation_id;

    IF v_status = 'available' THEN
        SELECT bc.id INTO v_copy_id FROM library_book_copies bc WHERE bc.book_id = v_book_id AND bc.status = 'reserved' LIMIT 1;
        IF v_copy_id IS NOT NULL THEN
            UPDATE library_book_copies SET status = 'available' WHERE library_book_copies.id = v_copy_id;
        END IF;
    END IF;

    RETURN QUERY SELECT p_reservation_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_cancel_work_queue_items(character varying, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_cancel_work_queue_items(p_module character varying, p_entity_id integer, p_entity_type character varying) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE work_queue_items SET status='cancelled', updated_at=NOW()
    WHERE module=p_module AND entity_id=p_entity_id
      AND entity_type=p_entity_type AND status='pending';
$$;


--
-- Name: sp_change_password(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_change_password(p_user_id integer, p_new_hash character varying) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE users SET password_hash = p_new_hash WHERE id = p_user_id;
$$;


--
-- Name: sp_check_already_submitted(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_already_submitted(p_assignment_id integer, p_student_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM assignment_submissions WHERE assignment_id = p_assignment_id AND student_id = p_student_id);
$$;


--
-- Name: sp_check_class_teacher_montessori(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_class_teacher_montessori(p_teacher_id integer, p_class_id integer) RETURNS TABLE(is_primary boolean, class_type character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT ct.is_primary, c.class_type
    FROM class_teachers ct JOIN classes c ON c.id = ct.class_id
    WHERE ct.teacher_id = p_teacher_id AND ct.class_id = p_class_id;
$$;


--
-- Name: sp_check_diary_published(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_diary_published(p_class_id integer, p_date date) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM diary_publish WHERE class_id = p_class_id AND date = p_date);
$$;


--
-- Name: sp_check_holiday(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_holiday(p_date date) RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT title FROM calendar_events
    WHERE is_holiday = TRUE AND p_date BETWEEN event_date AND COALESCE(end_date, event_date)
    LIMIT 1;
$$;


--
-- Name: sp_check_leave_requests_exist(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_leave_requests_exist(p_leave_type_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM leave_requests WHERE leave_type_id = p_leave_type_id);
$$;


--
-- Name: sp_check_leave_type_exists(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_leave_type_exists(p_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM leave_types WHERE id = p_id);
$$;


--
-- Name: sp_check_leave_type_name_exists(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_leave_type_name_exists(p_name character varying) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM leave_types WHERE LOWER(name) = LOWER(p_name));
$$;


--
-- Name: sp_check_quiz_already_submitted(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_quiz_already_submitted(p_quiz_id integer, p_student_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM quiz_submissions WHERE quiz_id = p_quiz_id AND student_id = p_student_id);
$$;


--
-- Name: sp_check_student_belongs_to_parent(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_student_belongs_to_parent(p_student_id integer, p_parent_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM students WHERE id = p_student_id AND parent_id = p_parent_id);
$$;


--
-- Name: sp_check_syllabus_exists(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_syllabus_exists(p_class_id integer, p_subject_id integer, p_year_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM syllabus WHERE class_id = p_class_id AND subject_id = p_subject_id AND academic_year_id = p_year_id);
$$;


--
-- Name: sp_check_syllabus_topic_exists(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_syllabus_topic_exists(p_topic_id integer, p_syllabus_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM syllabus_topics WHERE id = p_topic_id AND syllabus_id = p_syllabus_id);
$$;


--
-- Name: sp_check_teacher_can_mark(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_teacher_can_mark(p_user_id integer, p_syllabus_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(
        SELECT 1 FROM syllabus sy
        JOIN teachers t ON t.user_id = p_user_id
        JOIN teacher_subjects ts ON ts.teacher_id = t.id AND ts.subject_id = sy.subject_id
        WHERE sy.id = p_syllabus_id
    );
$$;


--
-- Name: sp_check_user_is_pure_student(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_check_user_is_pure_student(p_user_id integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = p_user_id AND r.name = 'student')
       AND NOT EXISTS(
           SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = p_user_id AND r.name IN ('teacher','admin','superadmin','principal','parent')
       );
$$;


--
-- Name: sp_clear_payslips(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_clear_payslips(p_run_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM payroll_payslips WHERE payroll_run_id = p_run_id;
$$;


--
-- Name: sp_clear_withdrawal(integer, character varying, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_clear_withdrawal(p_id integer, p_department character varying, p_user_id integer, p_action character varying, p_note text) RETURNS TABLE(id integer, error_msg character varying, all_cleared boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE v_total INT; v_cleared INT;
BEGIN
    UPDATE withdrawal_clearances SET
        status = CASE WHEN p_action='clear' THEN 'cleared' ELSE 'rejected' END,
        cleared_by = p_user_id, cleared_at = NOW(), note = p_note
    WHERE withdrawal_clearances.request_id = p_id
      AND withdrawal_clearances.department = p_department;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE wc.status='cleared')
    INTO v_total, v_cleared
    FROM withdrawal_clearances wc WHERE wc.request_id = p_id;

    IF v_total > 0 AND v_total = v_cleared THEN
        UPDATE withdrawal_requests SET status = 'under_review'
        WHERE withdrawal_requests.id = p_id AND withdrawal_requests.status = 'clearance';
    END IF;

    RETURN QUERY SELECT p_id, NULL::VARCHAR, (v_total > 0 AND v_total = v_cleared);
END;
$$;


--
-- Name: sp_compile_results(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_compile_results(p_exam_id integer, p_incharge_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_class_id INT;
BEGIN
    SELECT e.class_id INTO v_class_id FROM exams e WHERE e.id=p_exam_id;
    DELETE FROM exam_results WHERE exam_results.exam_id=p_exam_id;
    INSERT INTO exam_results(exam_id,student_id,total_marks,marks_obtained,percentage,subjects_failed,compiled_at)
    SELECT
        p_exam_id,
        s.id,
        COALESCE(SUM(es.total_marks),0),
        COALESCE(SUM(CASE WHEN em.is_absent THEN 0 ELSE COALESCE(em.marks_obtained,0) END),0),
        CASE WHEN COALESCE(SUM(es.total_marks),0)>0
             THEN ROUND(COALESCE(SUM(CASE WHEN em.is_absent THEN 0 ELSE COALESCE(em.marks_obtained,0) END),0)/SUM(es.total_marks)*100,2)
             ELSE 0 END,
        COUNT(*) FILTER (WHERE COALESCE(em.marks_obtained,0)<es.passing_marks OR em.is_absent=TRUE),
        NOW()
    FROM students s
    CROSS JOIN exam_subjects es
    LEFT JOIN exam_marks em ON em.student_id=s.id AND em.exam_subject_id=es.id
    WHERE s.class_id=v_class_id AND s.status=chr(97)||chr(99)||chr(116)||chr(105)||chr(118)||chr(101)
      AND es.exam_id=p_exam_id
    GROUP BY s.id;
    UPDATE exam_results er SET
        grade=gs.grade, gpa=gs.gpa,
        is_pass=(er.percentage>=40 AND er.subjects_failed<=2)
    FROM grading_scales gs
    WHERE er.exam_id=p_exam_id
      AND er.percentage BETWEEN gs.min_pct AND gs.max_pct;
    WITH ranked AS (
        SELECT er.id, ROW_NUMBER() OVER(ORDER BY er.marks_obtained DESC, er.percentage DESC) AS pos
        FROM exam_results er WHERE er.exam_id=p_exam_id
    )
    UPDATE exam_results SET class_position=ranked.pos
    FROM ranked WHERE exam_results.id=ranked.id;
    UPDATE exams SET status=chr(99)||chr(111)||chr(109)||chr(112)||chr(105)||chr(108)||chr(101)||chr(100)
    WHERE exams.id=p_exam_id;
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_complete_inventory_audit(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_complete_inventory_audit(p_audit_id integer) RETURNS TABLE(missing_count integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_missing_count INTEGER;
BEGIN
    SELECT status INTO v_status FROM library_inventory_audits WHERE id = p_audit_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT 0, 'Audit not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'in_progress' THEN
        RETURN QUERY SELECT 0, 'This audit is already completed.'::VARCHAR; RETURN;
    END IF;

    UPDATE library_book_copies bc
    SET status = 'missing'
    WHERE bc.status = 'available'
      AND NOT EXISTS (
          SELECT 1 FROM library_inventory_audit_items ai
          WHERE ai.audit_id = p_audit_id AND ai.copy_id = bc.id
      );

    GET DIAGNOSTICS v_missing_count = ROW_COUNT;

    UPDATE library_inventory_audits
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_audit_id;

    RETURN QUERY SELECT v_missing_count, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_complete_work_queue_item(character varying, integer, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_complete_work_queue_item(p_module character varying, p_entity_id integer, p_entity_type character varying, p_action_required character varying, p_completed_by integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE work_queue_items SET
        status = 'completed', completed_by = p_completed_by,
        completed_at = NOW(), updated_at = NOW()
    WHERE module = p_module AND entity_id = p_entity_id
      AND entity_type = p_entity_type
      AND action_required = p_action_required
      AND status = 'pending';
$$;


--
-- Name: sp_conduct_hearing(integer, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_conduct_hearing(p_id integer, p_user_id integer, p_attendees text, p_notes text, p_outcome text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_hearing_id INT;
BEGIN
    INSERT INTO discipline_hearings(case_id, scheduled_at, conducted_at, attendees, notes, outcome, created_by)
    SELECT p_id, dc.hearing_date, NOW(), p_attendees, p_notes, p_outcome, p_user_id
    FROM discipline_cases dc WHERE dc.id=p_id
    RETURNING discipline_hearings.id INTO v_hearing_id;
    UPDATE discipline_cases SET status='hearing_done',
        hearing_notes=p_notes, updated_at=NOW()
    WHERE discipline_cases.id=p_id;
    RETURN QUERY SELECT v_hearing_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_confirm_grn(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_confirm_grn(p_grn_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_po_id INTEGER;
    v_total_items INTEGER;
    v_fully_received INTEGER;
BEGIN
    SELECT po_id INTO v_po_id FROM goods_receipt_notes WHERE goods_receipt_notes.id=p_grn_id AND status='draft';
    IF v_po_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'GRN not found or already confirmed.'::VARCHAR; RETURN;
    END IF;
    -- Update received_quantity on each po_item
    UPDATE po_items SET received_quantity = COALESCE(received_quantity,0) + gi.quantity_received
    FROM grn_items gi
    WHERE gi.grn_id=p_grn_id AND po_items.id=gi.po_item_id;
    -- Mark GRN confirmed
    UPDATE goods_receipt_notes SET status='confirmed' WHERE goods_receipt_notes.id=p_grn_id;
    -- Update PO status
    SELECT COUNT(*), COUNT(*) FILTER (WHERE COALESCE(received_quantity,0)>=quantity)
    INTO v_total_items, v_fully_received
    FROM po_items WHERE po_id=v_po_id;
    IF v_fully_received = v_total_items THEN
        UPDATE purchase_orders SET status='completed' WHERE purchase_orders.id=v_po_id;
    ELSE
        UPDATE purchase_orders SET status='partially_delivered' WHERE purchase_orders.id=v_po_id;
    END IF;
    RETURN QUERY SELECT p_grn_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_count_students(integer, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_count_students(p_class_id integer, p_status character varying, p_search character varying) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(*)::INTEGER FROM students s
    WHERE (p_class_id IS NULL OR s.class_id = p_class_id)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_search IS NULL OR (
          s.first_name ILIKE '%' || p_search || '%'
          OR s.last_name ILIKE '%' || p_search || '%'
          OR s.enrollment_no ILIKE '%' || p_search || '%'
      ));
$$;


--
-- Name: sp_count_teachers(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_count_teachers(p_status character varying, p_search character varying) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(*)::INTEGER FROM teachers t
    JOIN users u ON u.id = t.user_id
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_search IS NULL OR (
          t.first_name ILIKE '%' || p_search || '%'
          OR t.last_name ILIKE '%' || p_search || '%'
          OR t.employee_no ILIKE '%' || p_search || '%'
          OR u.email ILIKE '%' || p_search || '%'
      ));
$$;


--
-- Name: sp_count_unread_notifications(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_count_unread_notifications(p_user_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(*)::INTEGER FROM notifications WHERE user_id = p_user_id AND is_read = FALSE;
$$;


--
-- Name: sp_count_users(character varying, character varying, boolean, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_count_users(p_search character varying, p_role character varying, p_is_active boolean, p_phone character varying) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(*)::INTEGER FROM users u
    WHERE (p_search IS NULL OR (
              u.first_name ILIKE '%' || p_search || '%'
              OR u.last_name ILIKE '%' || p_search || '%'
              OR u.email ILIKE '%' || p_search || '%'
              OR u.phone ILIKE '%' || p_search || '%'
              OR (u.first_name || ' ' || u.last_name) ILIKE '%' || p_search || '%'
          ))
      AND (p_role IS NULL OR u.id IN (
              SELECT ur2.user_id FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE r2.name = p_role
          ))
      AND (p_is_active IS NULL OR u.is_active = p_is_active)
      AND (p_phone IS NULL OR u.phone ILIKE '%' || p_phone || '%');
$$;


--
-- Name: academic_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_years (
    id integer NOT NULL,
    name character varying(20) NOT NULL,
    start_date date,
    end_date date,
    is_active boolean DEFAULT false
);


--
-- Name: sp_create_academic_year(character varying, date, date, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_academic_year(p_name character varying, p_start_date date, p_end_date date, p_is_active boolean) RETURNS SETOF public.academic_years
    LANGUAGE sql
    AS $$
    INSERT INTO academic_years (name, start_date, end_date, is_active)
    VALUES (p_name, p_start_date, p_end_date, COALESCE(p_is_active, FALSE))
    RETURNING *;
$$;


--
-- Name: sp_create_announcement(character varying, text, character varying, character varying, integer, integer, date, date, character varying, character varying, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_announcement(p_title character varying, p_body text, p_priority character varying, p_target_role character varying, p_target_class integer, p_created_by integer, p_start_date date, p_end_date date, p_ann_type character varying, p_source_type character varying, p_source_id integer, p_attachment character varying DEFAULT NULL::character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INTEGER;
BEGIN
    IF TRIM(p_title) = '' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Title is required'::VARCHAR; RETURN;
    END IF;
    INSERT INTO announcements(title,body,priority,target_role,target_class,
        created_by,start_date,end_date,ann_type,source_type,source_id,attachment)
    VALUES(p_title,p_body,p_priority,p_target_role,p_target_class,
        p_created_by,p_start_date,p_end_date,p_ann_type,p_source_type,p_source_id,p_attachment)
    RETURNING announcements.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: procurement_approval_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_approval_rules (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    min_amount numeric(14,2),
    max_amount numeric(14,2),
    department_id integer,
    item_category_id integer,
    is_emergency boolean,
    priority integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sp_create_approval_rule(character varying, numeric, numeric, integer, integer, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_approval_rule(p_name character varying, p_min_amount numeric, p_max_amount numeric, p_department_id integer, p_item_category_id integer, p_is_emergency boolean, p_priority integer) RETURNS SETOF public.procurement_approval_rules
    LANGUAGE sql
    AS $$
    INSERT INTO procurement_approval_rules
        (name, min_amount, max_amount, department_id, item_category_id, is_emergency, priority)
    VALUES (p_name, p_min_amount, p_max_amount, p_department_id, p_item_category_id, p_is_emergency, COALESCE(p_priority, 0))
    RETURNING *;
$$;


--
-- Name: sp_create_assignment(integer, integer, integer, character varying, text, date, numeric, character varying, character varying, character varying, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_assignment(p_class_id integer, p_subject_id integer, p_teacher_id integer, p_title character varying, p_description text, p_due_date date, p_total_marks numeric, p_file_name character varying, p_file_path character varying, p_file_type character varying, p_file_size bigint) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO assignments (class_id, subject_id, teacher_id, title, description, due_date, total_marks,
                              file_name, file_path, file_type, file_size)
    VALUES (p_class_id, p_subject_id, p_teacher_id, p_title, p_description, p_due_date, p_total_marks,
            p_file_name, p_file_path, p_file_type, p_file_size)
    RETURNING id;
$$;


--
-- Name: sp_create_attendance_session(integer, timestamp without time zone, timestamp without time zone, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_attendance_session(p_staff_id integer, p_clock_in_at timestamp without time zone, p_clock_out_at timestamp without time zone, p_notes text, p_created_by integer, p_is_late boolean DEFAULT false) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO staff_attendance_sessions(staff_id, clock_in_at, clock_out_at, source, notes, created_by, is_late)
    VALUES(p_staff_id, p_clock_in_at, p_clock_out_at, 'manual', p_notes, p_created_by, p_is_late)
    RETURNING id;
$$;


--
-- Name: library_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_authors (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    bio text,
    nationality character varying(100),
    date_of_birth date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sp_create_author(character varying, text, character varying, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_author(p_name character varying, p_bio text, p_nationality character varying, p_dob date) RETURNS SETOF public.library_authors
    LANGUAGE sql
    AS $$
    INSERT INTO library_authors (name, bio, nationality, date_of_birth) VALUES (p_name, p_bio, p_nationality, p_dob) RETURNING *;
$$;


--
-- Name: sp_create_book(character varying, character varying, character varying, integer, integer, integer, character varying, integer, character varying, character varying, character varying, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_book(p_isbn character varying, p_title character varying, p_subtitle character varying, p_author_id integer, p_publisher_id integer, p_category_id integer, p_edition character varying, p_publication_year integer, p_language character varying, p_shelf character varying, p_rack character varying, p_description text, p_cover_image text, p_num_copies integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_book_id INTEGER;
    i INTEGER;
BEGIN
    INSERT INTO library_books (isbn, title, subtitle, author_id, publisher_id, category_id,
        edition, publication_year, language, shelf, rack, description, cover_image)
    VALUES (p_isbn, p_title, p_subtitle, p_author_id, p_publisher_id, p_category_id,
        p_edition, p_publication_year, p_language, p_shelf, p_rack, p_description, p_cover_image)
    RETURNING id INTO v_book_id;

    FOR i IN 1..GREATEST(p_num_copies, 1) LOOP
        INSERT INTO library_book_copies (book_id, accession_no, barcode)
        VALUES (v_book_id, 'ACC-' || v_book_id || '-' || i, 'BC-' || v_book_id || '-' || i);
    END LOOP;

    RETURN v_book_id;
END;
$$;


--
-- Name: sp_create_calendar_event(character varying, text, date, date, character varying, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_calendar_event(p_title character varying, p_description text, p_event_date date, p_end_date date, p_event_type character varying, p_is_holiday boolean, p_created_by integer) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO calendar_events (title, description, event_date, end_date, event_type, is_holiday, created_by)
    VALUES (p_title, p_description, p_event_date, p_end_date, p_event_type, p_is_holiday, p_created_by)
    RETURNING id;
$$;


--
-- Name: library_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    parent_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sp_create_category(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_category(p_name character varying, p_parent_id integer) RETURNS SETOF public.library_categories
    LANGUAGE sql
    AS $$
    INSERT INTO library_categories (name, parent_id) VALUES (p_name, p_parent_id) RETURNING *;
$$;


--
-- Name: charge_type_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.charge_type_definitions (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    recurrence character varying(20) NOT NULL,
    interval_months smallint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT charge_type_definitions_recurrence_check CHECK (((recurrence)::text = ANY ((ARRAY['fixed'::character varying, 'interval'::character varying])::text[])))
);


--
-- Name: sp_create_charge_type(character varying, character varying, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_charge_type(p_name character varying, p_recurrence character varying, p_interval_months smallint) RETURNS SETOF public.charge_type_definitions
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_recurrence NOT IN ('fixed', 'interval') THEN
        RAISE EXCEPTION 'recurrence must be fixed or interval';
    END IF;
    IF p_recurrence = 'interval' AND (p_interval_months IS NULL OR p_interval_months < 1) THEN
        RAISE EXCEPTION 'interval_months is required and must be at least 1 when recurrence is interval';
    END IF;
    IF p_recurrence = 'fixed' AND p_interval_months IS NOT NULL THEN
        RAISE EXCEPTION 'interval_months must be null when recurrence is fixed';
    END IF;

    RETURN QUERY
    INSERT INTO charge_type_definitions (name, recurrence, interval_months)
    VALUES (p_name, p_recurrence, p_interval_months)
    RETURNING *;
END;
$$;


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    academic_year_id integer,
    created_at timestamp without time zone DEFAULT now(),
    section character varying(10),
    capacity smallint DEFAULT 40,
    room_number character varying(20),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    class_type character varying(20) DEFAULT 'regular'::character varying NOT NULL,
    level smallint,
    CONSTRAINT classes_class_type_check CHECK (((class_type)::text = ANY ((ARRAY['montessori'::character varying, 'regular'::character varying])::text[])))
);


--
-- Name: sp_create_class(character varying, character varying, integer, integer, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_class(p_name character varying, p_section character varying, p_academic_year_id integer, p_capacity integer, p_room_number character varying, p_class_type character varying) RETURNS SETOF public.classes
    LANGUAGE sql
    AS $$
    INSERT INTO classes (name, section, academic_year_id, capacity, room_number, class_type)
    VALUES (p_name, p_section, p_academic_year_id, COALESCE(p_capacity, 40), p_room_number, COALESCE(p_class_type, 'regular'))
    RETURNING *;
$$;


--
-- Name: sp_create_correction_request(integer, date, integer, time without time zone, time without time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_correction_request(p_staff_id integer, p_request_date date, p_session_id integer, p_clock_in time without time zone, p_clock_out time without time zone, p_reason text) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO staff_attendance_correction_requests(staff_id, request_date, session_id, requested_clock_in, requested_clock_out, reason)
    VALUES(p_staff_id, p_request_date, p_session_id, p_clock_in, p_clock_out, p_reason)
    RETURNING id;
$$;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    head_user_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id integer,
    is_parent boolean DEFAULT false
);


--
-- Name: sp_create_department(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_department(p_name character varying, p_head_user_id integer) RETURNS SETOF public.departments
    LANGUAGE sql
    AS $$
    INSERT INTO departments (name, head_user_id) VALUES (p_name, p_head_user_id) RETURNING *;
$$;


--
-- Name: sp_create_designation(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_designation(p_name character varying, p_department_id integer) RETURNS TABLE(id integer, error_msg text)
    LANGUAGE plpgsql
    AS $$BEGIN
    IF EXISTS(SELECT 1 FROM designations WHERE name=p_name) THEN
        RETURN QUERY SELECT NULL::INT, 'Designation already exists';
        RETURN;
    END IF;
    INSERT INTO designations(name, department_id) VALUES(p_name, p_department_id) RETURNING designations.id INTO id;
    RETURN QUERY SELECT id, NULL::TEXT;
END;$$;


--
-- Name: sp_create_event_type(character varying, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_event_type(p_name character varying, p_color character varying, p_is_holiday boolean) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO event_types (name, color, is_holiday) VALUES (p_name, p_color, p_is_holiday) RETURNING id;
$$;


--
-- Name: sp_create_exam(integer, integer, character varying, integer, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_exam(p_academic_year_id integer, p_exam_type_id integer, p_name character varying, p_class_id integer, p_start_date date, p_end_date date, p_created_by integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO exams(academic_year_id,exam_type_id,name,class_id,start_date,end_date,created_by)
    VALUES(p_academic_year_id,p_exam_type_id,p_name,p_class_id,p_start_date,p_end_date,p_created_by)
    RETURNING exams.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: fee_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_charges (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    apply_month smallint,
    apply_year integer,
    academic_year_id integer,
    is_active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    charge_type_id integer NOT NULL,
    target_type character varying(20) DEFAULT 'whole_school'::character varying NOT NULL,
    CONSTRAINT fee_charges_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['whole_school'::character varying, 'classes'::character varying, 'students'::character varying])::text[])))
);


--
-- Name: sp_create_fee_charge(character varying, numeric, integer, smallint, integer, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_fee_charge(p_name character varying, p_amount numeric, p_charge_type_id integer, p_apply_month smallint, p_apply_year integer, p_class_id integer, p_academic_year_id integer, p_description text) RETURNS SETOF public.fee_charges
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_charge_type_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'charge_type_id % is not a valid active charge type', p_charge_type_id;
    END IF;
    IF p_name IS NULL OR p_amount IS NULL THEN
        RAISE EXCEPTION 'name and amount are required';
    END IF;

    RETURN QUERY
    INSERT INTO fee_charges (name, amount, charge_type_id, apply_month, apply_year, class_id, academic_year_id, description)
    VALUES (p_name, p_amount, p_charge_type_id, p_apply_month, p_apply_year, p_class_id, p_academic_year_id, p_description)
    RETURNING *;
END;
$$;


--
-- Name: sp_create_fee_charge(character varying, numeric, integer, smallint, integer, character varying, integer[], integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_fee_charge(p_name character varying, p_amount numeric, p_charge_type_id integer, p_apply_month smallint, p_apply_year integer, p_target_type character varying, p_class_ids integer[], p_academic_year_id integer, p_description text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_new_id INTEGER;
    v_cid INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_charge_type_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'charge_type_id % is not a valid active charge type', p_charge_type_id;
    END IF;
    IF p_name IS NULL OR p_amount IS NULL THEN
        RAISE EXCEPTION 'name and amount are required';
    END IF;
    IF p_target_type NOT IN ('whole_school', 'classes', 'students') THEN
        RAISE EXCEPTION 'target_type must be whole_school, classes, or students';
    END IF;
    IF p_target_type = 'classes' AND (p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL) THEN
        RAISE EXCEPTION 'at least one class must be selected when target_type is classes';
    END IF;

    INSERT INTO fee_charges (name, amount, charge_type_id, apply_month, apply_year, target_type, academic_year_id, description)
    VALUES (p_name, p_amount, p_charge_type_id, p_apply_month, p_apply_year, p_target_type, p_academic_year_id, p_description)
    RETURNING id INTO v_new_id;

    IF p_target_type = 'classes' THEN
        FOREACH v_cid IN ARRAY p_class_ids LOOP
            INSERT INTO fee_charge_classes (charge_id, class_id) VALUES (v_new_id, v_cid);
        END LOOP;
    END IF;

    RETURN v_new_id;
END;
$$;


--
-- Name: sp_create_fee_charge(character varying, numeric, integer, smallint, integer, character varying, integer[], integer[], integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_fee_charge(p_name character varying, p_amount numeric, p_charge_type_id integer, p_apply_month smallint, p_apply_year integer, p_target_type character varying, p_class_ids integer[], p_student_ids integer[], p_academic_year_id integer, p_description text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_new_id INTEGER;
    v_cid INTEGER;
    v_sid INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_charge_type_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'charge_type_id % is not a valid active charge type', p_charge_type_id;
    END IF;
    IF p_name IS NULL OR p_amount IS NULL THEN
        RAISE EXCEPTION 'name and amount are required';
    END IF;
    IF p_target_type NOT IN ('whole_school', 'classes', 'students') THEN
        RAISE EXCEPTION 'target_type must be whole_school, classes, or students';
    END IF;
    IF p_target_type = 'classes' AND (p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL) THEN
        RAISE EXCEPTION 'at least one class must be selected when target_type is classes';
    END IF;
    IF p_target_type = 'students' AND (p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL) THEN
        RAISE EXCEPTION 'at least one student must be selected when target_type is students';
    END IF;

    INSERT INTO fee_charges (name, amount, charge_type_id, apply_month, apply_year, target_type, academic_year_id, description)
    VALUES (p_name, p_amount, p_charge_type_id, p_apply_month, p_apply_year, p_target_type, p_academic_year_id, p_description)
    RETURNING id INTO v_new_id;

    IF p_target_type = 'classes' THEN
        FOREACH v_cid IN ARRAY p_class_ids LOOP
            INSERT INTO fee_charge_classes (charge_id, class_id) VALUES (v_new_id, v_cid);
        END LOOP;
    ELSIF p_target_type = 'students' THEN
        FOREACH v_sid IN ARRAY p_student_ids LOOP
            INSERT INTO fee_charge_students (charge_id, student_id) VALUES (v_new_id, v_sid);
        END LOOP;
    END IF;

    RETURN v_new_id;
END;
$$;


--
-- Name: sp_create_grade(character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_grade(p_name character varying, p_description text) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_grades(name, description) VALUES(p_name, p_description) RETURNING id;
$$;


--
-- Name: sp_create_item(character varying, character varying, character varying, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_item(p_item_code character varying, p_item_name character varying, p_unit character varying, p_category_id integer, p_min_stock integer, p_max_stock integer, p_preferred_vendor_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_code VARCHAR;
    v_id INTEGER;
BEGIN
    v_code := p_item_code;
    IF v_code IS NULL OR v_code = '' THEN
        SELECT 'ITM-' || LPAD(nextval('procurement_items_id_seq')::TEXT, 5, '0') INTO v_code;
    ELSIF EXISTS (SELECT 1 FROM procurement_items WHERE item_code = v_code) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Item code already exists.'::VARCHAR; RETURN;
    END IF;

    INSERT INTO procurement_items (item_code, item_name, unit, category_id, min_stock, max_stock, preferred_vendor_id)
    VALUES (v_code, p_item_name, p_unit, p_category_id, COALESCE(p_min_stock, 0), p_max_stock, p_preferred_vendor_id)
    RETURNING procurement_items.id INTO v_id;

    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: procurement_item_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_item_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    parent_id integer,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: sp_create_item_category(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_item_category(p_name character varying, p_parent_id integer) RETURNS SETOF public.procurement_item_categories
    LANGUAGE sql
    AS $$
    INSERT INTO procurement_item_categories (name, parent_id) VALUES (p_name, p_parent_id) RETURNING *;
$$;


--
-- Name: sp_create_leave_type(character varying, integer, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_leave_type(p_name character varying, p_max_days_per_year integer, p_notify_mode character varying, p_is_active boolean) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO leave_types (name, max_days_per_year, notify_mode, is_active)
    VALUES (p_name, p_max_days_per_year, COALESCE(p_notify_mode, 'incharge_only'), COALESCE(p_is_active, TRUE))
    RETURNING id;
$$;


--
-- Name: sp_create_material(integer, integer, integer, character varying, text, character varying, character varying, character varying, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_material(p_class_id integer, p_subject_id integer, p_teacher_id integer, p_title character varying, p_description text, p_file_name character varying, p_file_path character varying, p_file_type character varying, p_file_size bigint) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO study_materials (class_id, subject_id, teacher_id, title, description, file_name, file_path, file_type, file_size)
    VALUES (p_class_id, p_subject_id, p_teacher_id, p_title, p_description, p_file_name, p_file_path, p_file_type, p_file_size)
    RETURNING id;
$$;


--
-- Name: sp_create_payroll_adjustment(integer, integer, integer, integer, numeric, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_payroll_adjustment(p_staff_id integer, p_component_id integer, p_month integer, p_year integer, p_amount numeric, p_note text, p_created_by integer) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_adjustments(staff_id, component_id, month, year, amount, note, created_by)
    VALUES(p_staff_id, p_component_id, p_month, p_year, p_amount, p_note, p_created_by)
    RETURNING id;
$$;


--
-- Name: sp_create_payroll_component(character varying, character varying, character varying, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_payroll_component(p_name character varying, p_component_type character varying, p_calculation_type character varying, p_is_permanent boolean, p_is_taxable boolean, p_is_statutory boolean) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_components(name, component_type, calculation_type, is_permanent, is_taxable, is_statutory)
    VALUES(p_name, p_component_type, p_calculation_type, p_is_permanent, p_is_taxable, p_is_statutory)
    RETURNING id;
$$;


--
-- Name: sp_create_payroll_run(integer, integer, integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_payroll_run(p_month integer, p_year integer, p_created_by integer, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date) RETURNS TABLE(id integer, error_msg text)
    LANGUAGE plpgsql
    AS $$
DECLARE v_from DATE; v_to DATE;
BEGIN
    IF EXISTS(SELECT 1 FROM payroll_runs WHERE month=p_month AND year=p_year) THEN
        RETURN QUERY SELECT NULL::INT, 'A payroll run for this month already exists.';
        RETURN;
    END IF;
    v_from := COALESCE(p_from_date, make_date(p_year, p_month, 1));
    v_to := COALESCE(p_to_date, (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date);
    RETURN QUERY INSERT INTO payroll_runs(month, year, created_by, from_date, to_date)
        VALUES(p_month, p_year, p_created_by, v_from, v_to)
        RETURNING payroll_runs.id, NULL::TEXT;
END;
$$;


--
-- Name: sp_create_permission(character varying, text, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_permission(p_code character varying, p_description text, p_module character varying, p_action character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    IF EXISTS(SELECT 1 FROM permissions p WHERE p.code=p_code) THEN
        RETURN QUERY SELECT NULL::INT, (chr(65)||chr(108)||chr(114)||chr(101)||chr(97)||chr(100)||chr(121)||chr(32)||chr(101)||chr(120)||chr(105)||chr(115)||chr(116)||chr(115))::VARCHAR; RETURN;
    END IF;
    INSERT INTO permissions(code,description,module,action) VALUES(p_code,p_description,p_module,p_action) RETURNING permissions.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_create_po_from_pr(integer, integer, integer, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_po_from_pr(p_pr_id integer, p_vendor_id integer, p_created_by integer, p_delivery_address text, p_expected_delivery_date date, p_terms text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pr_status VARCHAR;
    v_number VARCHAR;
    v_year TEXT;
    v_seq INTEGER;
    v_po_id INTEGER;
    v_item RECORD;
    v_total NUMERIC := 0;
BEGIN
    SELECT pr.status INTO v_pr_status FROM purchase_requisitions pr WHERE pr.id = p_pr_id;
    IF v_pr_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Requisition not found.'::VARCHAR; RETURN;
    END IF;
    IF v_pr_status != 'approved' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Only fully-approved requisitions can be converted to a Purchase Order.'::VARCHAR; RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM procurement_vendors v WHERE v.id = p_vendor_id AND v.is_active = TRUE) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Selected vendor is not active.'::VARCHAR; RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM procurement_vendors v WHERE v.id = p_vendor_id AND v.is_blacklisted = TRUE) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Selected vendor is blacklisted.'::VARCHAR; RETURN;
    END IF;

    v_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO v_seq FROM purchase_orders po WHERE po.po_number LIKE 'PO-' || v_year || '-%';
    v_number := 'PO-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');

    INSERT INTO purchase_orders (po_number, pr_id, vendor_id, created_by, delivery_address, expected_delivery_date, terms)
    VALUES (v_number, p_pr_id, p_vendor_id, p_created_by, p_delivery_address, p_expected_delivery_date, p_terms)
    RETURNING purchase_orders.id INTO v_po_id;

    FOR v_item IN SELECT * FROM pr_items pi WHERE pi.pr_id = p_pr_id LOOP
        INSERT INTO po_items (po_id, pr_item_id, item_description, quantity, unit, unit_price)
        VALUES (v_po_id, v_item.id, v_item.item_description, v_item.quantity, v_item.unit, COALESCE(v_item.estimated_unit_price, 0));
        v_total := v_total + (v_item.quantity * COALESCE(v_item.estimated_unit_price, 0));
    END LOOP;

    UPDATE purchase_orders SET total_amount = v_total WHERE purchase_orders.id = v_po_id;
    UPDATE purchase_requisitions SET status = 'converted_to_po' WHERE purchase_requisitions.id = p_pr_id;

    RETURN QUERY SELECT v_po_id, NULL::VARCHAR;
END;
$$;


--
-- Name: purchase_requisitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_requisitions (
    id integer NOT NULL,
    pr_number character varying(30) NOT NULL,
    requested_by integer NOT NULL,
    department_id integer,
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    is_emergency boolean DEFAULT false NOT NULL,
    budget_head character varying(150),
    remarks text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    matched_rule_id integer,
    total_estimated_amount numeric(14,2) DEFAULT 0 NOT NULL,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_requisitions_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT purchase_requisitions_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying, 'rejected'::character varying, 'converted_to_po'::character varying])::text[])))
);


--
-- Name: sp_create_pr(integer, integer, character varying, boolean, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_pr(p_requested_by integer, p_department_id integer, p_priority character varying, p_is_emergency boolean, p_budget_head character varying, p_remarks text) RETURNS SETOF public.purchase_requisitions
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_number VARCHAR;
    v_year TEXT;
    v_seq INTEGER;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO v_seq FROM purchase_requisitions WHERE pr_number LIKE 'PR-' || v_year || '-%';
    v_number := 'PR-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');

    RETURN QUERY
    INSERT INTO purchase_requisitions (pr_number, requested_by, department_id, priority, is_emergency, budget_head, remarks)
    VALUES (v_number, p_requested_by, p_department_id, COALESCE(p_priority, 'normal'), COALESCE(p_is_emergency, FALSE), p_budget_head, p_remarks)
    RETURNING *;
END;
$$;


--
-- Name: library_publishers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_publishers (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    address text,
    contact_person character varying(100),
    phone character varying(30),
    email character varying(150),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sp_create_publisher(character varying, text, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_publisher(p_name character varying, p_address text, p_contact_person character varying, p_phone character varying, p_email character varying) RETURNS SETOF public.library_publishers
    LANGUAGE sql
    AS $$
    INSERT INTO library_publishers (name, address, contact_person, phone, email) VALUES (p_name, p_address, p_contact_person, p_phone, p_email) RETURNING *;
$$;


--
-- Name: sp_create_quiz(integer, integer, integer, character varying, text, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_quiz(p_class_id integer, p_subject_id integer, p_teacher_id integer, p_title character varying, p_description text, p_due_date timestamp with time zone, p_total_marks integer) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO quizzes (class_id, subject_id, teacher_id, title, description, due_date, total_marks)
    VALUES (p_class_id, p_subject_id, p_teacher_id, p_title, p_description, p_due_date, p_total_marks)
    RETURNING id;
$$;


--
-- Name: sp_create_quiz_question(integer, text, character varying, character varying, character varying, character varying, character varying, boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_quiz_question(p_quiz_id integer, p_question text, p_option_a character varying, p_option_b character varying, p_option_c character varying, p_option_d character varying, p_correct character varying, p_multi_select boolean, p_marks integer, p_order_no integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d,
                                 correct, multi_select, marks, order_no)
    VALUES (p_quiz_id, p_question, p_option_a, p_option_b, p_option_c, p_option_d,
            p_correct, p_multi_select, p_marks, p_order_no);
$$;


--
-- Name: sp_create_role(character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_role(p_name character varying, p_description text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    IF EXISTS(SELECT 1 FROM roles r WHERE r.name=p_name) THEN
        RETURN QUERY SELECT NULL::INT, (chr(82)||chr(111)||chr(108)||chr(101)||chr(32)||chr(97)||chr(108)||chr(114)||chr(101)||chr(97)||chr(100)||chr(121)||chr(32)||chr(101)||chr(120)||chr(105)||chr(115)||chr(116)||chr(115))::VARCHAR; RETURN;
    END IF;
    INSERT INTO roles(name,description) VALUES(p_name,p_description) RETURNING roles.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_create_staff(character varying, character varying, character varying, date, character varying, character varying, text, integer, integer, character varying, date, date, numeric, character varying, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_staff(p_first_name character varying, p_last_name character varying, p_gender character varying, p_dob date, p_cnic character varying, p_phone character varying, p_address text, p_designation_id integer, p_department_id integer, p_employment_type character varying, p_joining_date date, p_contract_end date, p_salary numeric, p_employee_code character varying, p_user_id integer, p_created_by integer) RETURNS TABLE(id integer, error_msg text)
    LANGUAGE plpgsql
    AS $$BEGIN
    IF p_employee_code IS NOT NULL AND EXISTS(SELECT 1 FROM staff WHERE employee_code=p_employee_code) THEN
        RETURN QUERY SELECT NULL::INT, 'Employee code already exists';
        RETURN;
    END IF;
    INSERT INTO staff(first_name, last_name, gender, date_of_birth, cnic, phone, address,
        designation_id, department_id, employment_type, joining_date, contract_end_date,
        salary, employee_code, user_id, created_by)
    VALUES(p_first_name, p_last_name, p_gender, p_dob, p_cnic, p_phone, p_address,
        p_designation_id, p_department_id, p_employment_type, p_joining_date, p_contract_end,
        p_salary, p_employee_code, p_user_id, p_created_by)
    RETURNING staff.id INTO id;
    RETURN QUERY SELECT id, NULL::TEXT;
END;$$;


--
-- Name: sp_create_staff_with_user(character varying, character varying, character varying, integer, integer, integer, character varying, date, numeric, character varying, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_staff_with_user(p_first_name character varying, p_last_name character varying, p_email character varying, p_role_id integer, p_department_id integer, p_designation_id integer, p_employment_type character varying, p_joining_date date, p_salary numeric, p_employee_code character varying, p_phone character varying, p_password_hash character varying, p_created_by integer) RETURNS TABLE(user_id integer, staff_id integer, error_msg text, employee_code character varying)
    LANGUAGE plpgsql
    AS $$DECLARE v_user_id INT; v_staff_id INT; v_emp_code VARCHAR;
BEGIN
    IF EXISTS(SELECT 1 FROM users WHERE email=p_email) THEN
        RETURN QUERY SELECT NULL::INT, NULL::INT, 'Email already exists', NULL::VARCHAR;
        RETURN;
    END IF;
    IF p_employee_code IS NULL OR p_employee_code='' THEN
        v_emp_code := sp_generate_employee_code(p_role_id);
    ELSE
        IF EXISTS(SELECT 1 FROM staff WHERE employee_code=p_employee_code) THEN
            RETURN QUERY SELECT NULL::INT, NULL::INT, 'Employee code already in use', NULL::VARCHAR;
            RETURN;
        END IF;
        v_emp_code := p_employee_code;
    END IF;
    INSERT INTO users(first_name, last_name, email, password_hash, phone)
    VALUES(p_first_name, p_last_name, p_email, p_password_hash, p_phone)
    RETURNING id INTO v_user_id;
    INSERT INTO user_roles(user_id, role_id) VALUES(v_user_id, p_role_id);
    INSERT INTO staff(user_id, first_name, last_name, phone, designation_id, department_id,
        employment_type, joining_date, salary, employee_code, created_by)
    VALUES(v_user_id, p_first_name, p_last_name, p_phone, p_designation_id, p_department_id,
        p_employment_type, p_joining_date, p_salary, v_emp_code, p_created_by)
    RETURNING id INTO v_staff_id;
    IF EXISTS(SELECT 1 FROM roles WHERE id=p_role_id AND name IN ('teacher','academic_coordinator','principal')) THEN
        INSERT INTO teachers(user_id, first_name, last_name, employee_no, join_date, status)
        VALUES(v_user_id, p_first_name, p_last_name, v_emp_code, p_joining_date, 'active')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN QUERY SELECT v_user_id, v_staff_id, NULL::TEXT, v_emp_code;
END;$$;


--
-- Name: sp_create_staff_with_user(character varying, character varying, character varying, integer, integer, integer, character varying, date, numeric, character varying, character varying, character varying, integer, boolean, character varying, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_staff_with_user(p_first_name character varying, p_last_name character varying, p_email character varying, p_role_id integer, p_department_id integer, p_designation_id integer, p_employment_type character varying, p_joining_date date, p_salary numeric, p_employee_code character varying, p_phone character varying, p_password_hash character varying, p_created_by integer, p_is_probationary boolean DEFAULT true, p_gender character varying DEFAULT NULL::character varying, p_date_of_birth date DEFAULT NULL::date) RETURNS TABLE(user_id integer, staff_id integer, error_msg text, employee_code character varying)
    LANGUAGE plpgsql
    AS $$DECLARE v_user_id INT; v_staff_id INT; v_emp_code VARCHAR;
BEGIN
    IF EXISTS(SELECT 1 FROM users WHERE email=p_email) THEN
        RETURN QUERY SELECT NULL::INT, NULL::INT, 'Email already exists', NULL::VARCHAR;
        RETURN;
    END IF;
    IF p_employee_code IS NULL OR p_employee_code='' THEN
        v_emp_code := sp_generate_employee_code(p_role_id);
    ELSE
        IF EXISTS(SELECT 1 FROM staff WHERE employee_code=p_employee_code) THEN
            RETURN QUERY SELECT NULL::INT, NULL::INT, 'Employee code already in use', NULL::VARCHAR;
            RETURN;
        END IF;
        v_emp_code := p_employee_code;
    END IF;
    INSERT INTO users(first_name, last_name, email, password_hash, phone)
    VALUES(p_first_name, p_last_name, p_email, p_password_hash, p_phone)
    RETURNING id INTO v_user_id;
    INSERT INTO user_roles(user_id, role_id) VALUES(v_user_id, p_role_id);
    INSERT INTO staff(user_id, first_name, last_name, phone, designation_id, department_id,
        employment_type, joining_date, salary, employee_code, created_by, is_probationary, gender, date_of_birth)
    VALUES(v_user_id, p_first_name, p_last_name, p_phone, p_designation_id, p_department_id,
        p_employment_type, p_joining_date, p_salary, v_emp_code, p_created_by, p_is_probationary, p_gender, p_date_of_birth)
    RETURNING id INTO v_staff_id;
    IF EXISTS(SELECT 1 FROM roles WHERE id=p_role_id AND name IN ('teacher','academic_coordinator','principal')) THEN
        INSERT INTO teachers(user_id, first_name, last_name, employee_no, join_date, status)
        VALUES(v_user_id, p_first_name, p_last_name, v_emp_code, p_joining_date, 'active')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN QUERY SELECT v_user_id, v_staff_id, NULL::TEXT, v_emp_code;
END;$$;


--
-- Name: sp_create_student(character varying, character varying, character varying, character varying, character varying, date, character varying, character varying, text, integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_student(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_phone character varying, p_date_of_birth date, p_gender character varying, p_blood_group character varying, p_address text, p_class_id integer, p_parent_id integer, p_enrollment_no character varying) RETURNS TABLE(id integer, enrollment_no character varying, first_name character varying, last_name character varying, user_id integer, parent_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INTEGER;
    v_enrollment_no VARCHAR;
    v_student_id INTEGER;
BEGIN
    INSERT INTO users (email, password_hash, first_name, last_name, phone, is_verified)
    VALUES (p_email, p_password_hash, p_first_name, p_last_name, p_phone, TRUE)
    RETURNING users.id INTO v_user_id;

    INSERT INTO user_roles (user_id, role_id)
    SELECT v_user_id, r.id FROM roles r WHERE r.name = 'student'
    ON CONFLICT DO NOTHING;

    v_enrollment_no := COALESCE(p_enrollment_no, fn_generate_id('student'));

    INSERT INTO students
        (user_id, enrollment_no, first_name, last_name, date_of_birth, gender,
         blood_group, address, class_id, parent_id)
    VALUES
        (v_user_id, v_enrollment_no, p_first_name, p_last_name, p_date_of_birth, p_gender,
         p_blood_group, p_address, p_class_id, p_parent_id)
    RETURNING students.id INTO v_student_id;

    RETURN QUERY SELECT v_student_id, v_enrollment_no, p_first_name, p_last_name, v_user_id, p_parent_id;
END;
$$;


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    description text,
    credit_hours smallint DEFAULT 1,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: sp_create_subject(character varying, character varying, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_subject(p_name character varying, p_code character varying, p_description text, p_credit_hours integer) RETURNS SETOF public.subjects
    LANGUAGE sql
    AS $$
    INSERT INTO subjects (name, code, description, credit_hours, is_active)
    VALUES (p_name, p_code, p_description, COALESCE(p_credit_hours, 1), TRUE)
    RETURNING *;
$$;


--
-- Name: sp_create_submission(integer, integer, character varying, character varying, character varying, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_submission(p_assignment_id integer, p_student_id integer, p_file_name character varying, p_file_path character varying, p_file_type character varying, p_file_size bigint) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO assignment_submissions (assignment_id, student_id, file_name, file_path, file_type, file_size)
    VALUES (p_assignment_id, p_student_id, p_file_name, p_file_path, p_file_type, p_file_size)
    RETURNING id;
$$;


--
-- Name: sp_create_syllabus(integer, integer, integer, character varying, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_syllabus(p_class_id integer, p_subject_id integer, p_year_id integer, p_title character varying, p_description text, p_created_by integer) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO syllabus (class_id, subject_id, academic_year_id, title, description, created_by)
    VALUES (p_class_id, p_subject_id, p_year_id, p_title, p_description, p_created_by)
    RETURNING id;
$$;


--
-- Name: sp_create_syllabus_attachment(integer, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_syllabus_attachment(p_topic_id integer, p_filename character varying, p_url character varying) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO syllabus_attachments (topic_id, filename, url) VALUES (p_topic_id, p_filename, p_url) RETURNING id;
$$;


--
-- Name: sp_create_syllabus_topic_simple(integer, character varying, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_syllabus_topic_simple(p_syllabus_id integer, p_title character varying, p_description text, p_sort_order integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO syllabus_topics (syllabus_id, title, description, sort_order)
    VALUES (p_syllabus_id, p_title, p_description, p_sort_order);
$$;


--
-- Name: sp_create_tax_slab_set(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_tax_slab_set(p_name character varying) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_tax_slab_sets(name) VALUES(p_name) RETURNING id;
$$;


--
-- Name: sp_create_teacher(character varying, character varying, character varying, character varying, character varying, date, character varying, character varying, character varying, date, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_teacher(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_phone character varying, p_date_of_birth date, p_gender character varying, p_qualification character varying, p_specialization character varying, p_join_date date, p_employee_no character varying) RETURNS TABLE(id integer, employee_no character varying, first_name character varying, last_name character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INTEGER;
    v_employee_no VARCHAR;
    v_teacher_id INTEGER;
BEGIN
    INSERT INTO users (email, password_hash, first_name, last_name, phone, is_verified)
    VALUES (p_email, p_password_hash, p_first_name, p_last_name, p_phone, TRUE)
    RETURNING users.id INTO v_user_id;

    INSERT INTO user_roles (user_id, role_id)
    SELECT v_user_id, r.id FROM roles r WHERE r.name = 'teacher'
    ON CONFLICT DO NOTHING;

    v_employee_no := COALESCE(p_employee_no, fn_generate_id('teacher'));

    INSERT INTO teachers
        (user_id, employee_no, first_name, last_name, date_of_birth, gender,
         qualification, specialization, join_date)
    VALUES
        (v_user_id, v_employee_no, p_first_name, p_last_name, p_date_of_birth, p_gender,
         p_qualification, p_specialization, p_join_date)
    RETURNING teachers.id INTO v_teacher_id;

    RETURN QUERY SELECT v_teacher_id, v_employee_no, p_first_name, p_last_name;
END;
$$;


--
-- Name: sp_create_timetable_entry(integer, integer, integer, integer, time without time zone, time without time zone, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_timetable_entry(p_class_id integer, p_subject_id integer, p_teacher_id integer, p_day_of_week integer, p_start_time time without time zone, p_end_time time without time zone, p_room_number character varying) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, day_of_week integer, start_time text, end_time text, room_number character varying)
    LANGUAGE sql
    AS $$
    INSERT INTO timetable (class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_number)
    VALUES (p_class_id, p_subject_id, p_teacher_id, p_day_of_week, p_start_time, p_end_time, p_room_number)
    RETURNING timetable.id, timetable.class_id, timetable.subject_id, timetable.teacher_id,
              timetable.day_of_week, timetable.start_time::TEXT, timetable.end_time::TEXT, timetable.room_number;
$$;


--
-- Name: sp_create_user(character varying, character varying, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_user(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_phone character varying) RETURNS TABLE(id integer, email character varying, first_name character varying, last_name character varying)
    LANGUAGE sql
    AS $$
    INSERT INTO users (email, password_hash, first_name, last_name, phone)
    VALUES (p_email, p_password_hash, p_first_name, p_last_name, p_phone)
    RETURNING users.id, users.email, users.first_name, users.last_name;
$$;


--
-- Name: procurement_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_vendors (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    contact_person character varying(100),
    phone character varying(30),
    email character varying(150),
    address text,
    ntn character varying(30),
    strn character varying(30),
    bank_name character varying(100),
    bank_account_no character varying(50),
    bank_iban character varying(50),
    category_id integer,
    rating numeric(2,1),
    is_blacklisted boolean DEFAULT false NOT NULL,
    blacklist_reason text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sp_create_vendor(character varying, character varying, character varying, character varying, text, character varying, character varying, character varying, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_vendor(p_name character varying, p_contact_person character varying, p_phone character varying, p_email character varying, p_address text, p_ntn character varying, p_strn character varying, p_bank_name character varying, p_bank_account_no character varying, p_bank_iban character varying, p_category_id integer) RETURNS SETOF public.procurement_vendors
    LANGUAGE sql
    AS $$
    INSERT INTO procurement_vendors
        (name, contact_person, phone, email, address, ntn, strn, bank_name, bank_account_no, bank_iban, category_id)
    VALUES (p_name, p_contact_person, p_phone, p_email, p_address, p_ntn, p_strn, p_bank_name, p_bank_account_no, p_bank_iban, p_category_id)
    RETURNING *;
$$;


--
-- Name: procurement_vendor_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_vendor_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: sp_create_vendor_category(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_vendor_category(p_name character varying) RETURNS SETOF public.procurement_vendor_categories
    LANGUAGE sql
    AS $$
    INSERT INTO procurement_vendor_categories (name) VALUES (p_name) RETURNING *;
$$;


--
-- Name: sp_create_waiver_request(integer, integer, integer, character varying, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_waiver_request(p_withdrawal_id integer, p_invoice_id integer, p_requested_by integer, p_waiver_type character varying, p_waiver_amount numeric, p_reason text) RETURNS integer
    LANGUAGE sql
    AS $$
    INSERT INTO withdrawal_waivers
        (withdrawal_id, invoice_id, requested_by, waiver_type, waiver_amount, reason)
    VALUES (p_withdrawal_id, p_invoice_id, p_requested_by, p_waiver_type, p_waiver_amount, p_reason)
    RETURNING id;
$$;


--
-- Name: sp_create_work_queue_item(character varying, character varying, integer, character varying, text, character varying, character varying, character varying, integer, character varying, date, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_create_work_queue_item(p_module character varying, p_entity_type character varying, p_entity_id integer, p_title character varying, p_description text, p_action_required character varying, p_priority character varying, p_assigned_role character varying, p_assigned_user_id integer, p_link character varying, p_due_date date, p_metadata jsonb, p_created_by integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INTEGER;
BEGIN
    -- Cancel any existing pending item for same entity+action+role
    UPDATE work_queue_items SET status='cancelled', updated_at=NOW()
    WHERE module=p_module AND entity_id=p_entity_id AND entity_type=p_entity_type
      AND action_required=p_action_required
      AND COALESCE(assigned_role,'') = COALESCE(p_assigned_role,'')
      AND status='pending';

    INSERT INTO work_queue_items
        (module, entity_type, entity_id, title, description, action_required,
         priority, assigned_role, assigned_user_id, link, due_date, metadata, created_by)
    VALUES
        (p_module, p_entity_type, p_entity_id, p_title, p_description, p_action_required,
         p_priority, p_assigned_role, p_assigned_user_id, p_link, p_due_date, p_metadata, p_created_by)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;


--
-- Name: sp_deactivate_approval_rule(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_approval_rule(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_approval_rules SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_author(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_author(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_authors SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_book(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_book(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_books SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_category(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_category(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_categories SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_department(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_department(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE departments SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_event_type(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_event_type(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE event_types SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_item(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_item(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_items SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_item_category(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_item_category(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_item_categories SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_payroll_component(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_payroll_component(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE payroll_components SET is_active = false WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_publisher(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_publisher(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_publishers SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_rfid_card(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_rfid_card(p_card_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE staff_rfid_cards SET is_active=false WHERE id=p_card_id;
$$;


--
-- Name: sp_deactivate_student(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_student(p_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
    v_user_id INTEGER;
BEGIN
    SELECT user_id INTO v_user_id FROM students WHERE id = p_id;
    UPDATE students SET status = 'inactive' WHERE id = p_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 AND v_user_id IS NOT NULL THEN
        UPDATE users SET is_active = FALSE WHERE id = v_user_id;
    END IF;
    RETURN v_count > 0;
END;
$$;


--
-- Name: sp_deactivate_subject(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_subject(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE subjects SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_teacher(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_teacher(p_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
    v_user_id INTEGER;
BEGIN
    SELECT user_id INTO v_user_id FROM teachers WHERE id = p_id;
    UPDATE teachers SET status = 'inactive' WHERE id = p_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 AND v_user_id IS NOT NULL THEN
        UPDATE users SET is_active = FALSE WHERE id = v_user_id;
    END IF;
    RETURN v_count > 0;
END;
$$;


--
-- Name: sp_deactivate_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_user(p_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE users SET is_active = FALSE WHERE id = p_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;


--
-- Name: sp_deactivate_vendor(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_vendor(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_vendors SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_deactivate_vendor_category(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_deactivate_vendor_category(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_vendor_categories SET is_active = FALSE WHERE id = p_id;
$$;


--
-- Name: sp_decide_discipline_case(integer, integer, character varying, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_decide_discipline_case(p_id integer, p_principal_id integer, p_action_type character varying, p_note text, p_suspension_from date, p_suspension_to date) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_student_id INT; v_appeal_deadline DATE;
BEGIN
    SELECT dc.student_id INTO v_student_id FROM discipline_cases dc WHERE dc.id=p_id;
    v_appeal_deadline := CURRENT_DATE + 7;
    UPDATE discipline_cases SET
        status=p_action_type,
        action_type=p_action_type,
        principal_id=p_principal_id,
        action_note=p_note,
        suspension_from=p_suspension_from,
        suspension_to=p_suspension_to,
        appeal_deadline=CASE WHEN p_action_type IN ('expulsion','suspension') THEN v_appeal_deadline ELSE NULL END,
        updated_at=NOW()
    WHERE discipline_cases.id=p_id;
    IF p_action_type='suspension' THEN
        UPDATE students SET status='suspended',
            suspension_return_date=p_suspension_to WHERE students.id=v_student_id;
    ELSIF p_action_type='expulsion' THEN
        UPDATE students SET status='expelled' WHERE students.id=v_student_id;
    ELSIF p_action_type IN ('warning','dismissed') THEN
        UPDATE students SET status='active' WHERE students.id=v_student_id;
    END IF;
    RETURN QUERY SELECT p_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_delete_announcement(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_announcement(p_id integer) RETURNS TABLE(success boolean, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM announcements WHERE id=p_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Not found'::VARCHAR; RETURN;
    END IF;
    RETURN QUERY SELECT TRUE, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_delete_approval_steps(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_approval_steps(p_rule_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM procurement_approval_steps WHERE rule_id = p_rule_id;
$$;


--
-- Name: sp_delete_assignment(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_assignment(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM assignments WHERE id = p_id;
$$;


--
-- Name: sp_delete_attendance_session(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_attendance_session(p_session_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM staff_attendance_sessions WHERE id = p_session_id;
$$;


--
-- Name: sp_delete_calendar_event(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_calendar_event(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM calendar_events WHERE id = p_id;
$$;


--
-- Name: sp_delete_class(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_class(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM classes WHERE id = p_id;
$$;


--
-- Name: sp_delete_department_schedule(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_department_schedule(p_department_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM department_attendance_schedules WHERE department_id = p_department_id;
$$;


--
-- Name: sp_delete_education(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_education(p_id integer, p_staff_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN DELETE FROM staff_education WHERE id=p_id AND staff_id=p_staff_id; END;$$;


--
-- Name: sp_delete_employment_history(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_employment_history(p_id integer, p_staff_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN DELETE FROM staff_employment_history WHERE id=p_id AND staff_id=p_staff_id; END;$$;


--
-- Name: sp_delete_experience(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_experience(p_id integer, p_staff_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN DELETE FROM staff_experience WHERE id=p_id AND staff_id=p_staff_id; END;$$;


--
-- Name: sp_delete_fee_charge(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_fee_charge(p_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_in_use BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM fee_invoice_items WHERE charge_id = p_id) INTO v_in_use;

    IF v_in_use THEN
        -- Already used on real invoices: deactivate instead of deleting,
        -- so historical invoice line items keep a valid reference.
        UPDATE fee_charges SET is_active = FALSE WHERE id = p_id;
    ELSE
        -- Never used on any invoice: safe to remove entirely.
        DELETE FROM fee_charge_classes WHERE charge_id = p_id;
        DELETE FROM fee_charge_students WHERE charge_id = p_id;
        DELETE FROM fee_charges WHERE id = p_id;
    END IF;
END;
$$;


--
-- Name: sp_delete_leave_approval_rules(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_leave_approval_rules(p_leave_type_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM leave_approval_rules WHERE leave_type_id = p_leave_type_id;
$$;


--
-- Name: sp_delete_leave_type(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_leave_type(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM leave_types WHERE id = p_id;
$$;


--
-- Name: sp_delete_material(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_material(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM study_materials WHERE id = p_id;
$$;


--
-- Name: sp_delete_my_signature(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_my_signature(p_user_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM user_signatures WHERE user_id = p_user_id;
$$;


--
-- Name: sp_delete_notification(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_notification(p_id integer, p_user_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM notifications WHERE id = p_id AND user_id = p_user_id;
$$;


--
-- Name: sp_delete_payroll_adjustment(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_payroll_adjustment(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM payroll_adjustments WHERE id = p_id;
$$;


--
-- Name: sp_delete_quiz(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_quiz(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM quizzes WHERE id = p_id;
$$;


--
-- Name: sp_delete_syllabus(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_syllabus(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM syllabus WHERE id = p_id;
$$;


--
-- Name: sp_delete_syllabus_attachment(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_syllabus_attachment(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM syllabus_attachments WHERE id = p_id;
$$;


--
-- Name: sp_delete_syllabus_topic(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_syllabus_topic(p_id integer, p_syllabus_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM syllabus_topics WHERE id = p_id AND syllabus_id = p_syllabus_id;
$$;


--
-- Name: sp_delete_tax_slab(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_tax_slab(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM payroll_tax_slabs WHERE id = p_id;
$$;


--
-- Name: sp_delete_tax_slab_set(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_tax_slab_set(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM payroll_tax_slab_sets WHERE id = p_id;
$$;


--
-- Name: sp_delete_timetable_entry(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_delete_timetable_entry(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM timetable WHERE id = p_id;
$$;


--
-- Name: sp_enroll_member(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_enroll_member(p_user_id integer, p_member_type character varying) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id INTEGER;
    v_card VARCHAR;
    v_resolved_type VARCHAR;
BEGIN
    IF EXISTS (SELECT 1 FROM library_members WHERE user_id = p_user_id) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'This user is already a library member.'::VARCHAR;
        RETURN;
    END IF;

    IF p_member_type IN ('student', 'teacher') THEN
        v_resolved_type := p_member_type;
    ELSE
        SELECT r.name INTO v_resolved_type
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id LIMIT 1;

        IF v_resolved_type IS NULL THEN
            RETURN QUERY SELECT NULL::INTEGER, 'Could not determine this user''s role.'::VARCHAR;
            RETURN;
        END IF;
    END IF;

    v_card := 'LIB-' || LPAD(nextval('library_members_id_seq')::TEXT, 5, '0');

    INSERT INTO library_members (user_id, member_type, library_card_no)
    VALUES (p_user_id, v_resolved_type, v_card)
    RETURNING library_members.id INTO v_id;

    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_enroll_student(character varying, character varying, integer, date, character varying, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_enroll_student(p_first_name character varying, p_last_name character varying, p_class_id integer, p_dob date, p_gender character varying, p_user_id integer, p_enrollment_no character varying) RETURNS TABLE(student_id integer, enrollment_no character varying, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check duplicate enrollment_no
    IF EXISTS (SELECT 1 FROM students WHERE enrollment_no = p_enrollment_no) THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::VARCHAR, 'Enrollment number already exists'::VARCHAR;
        RETURN;
    END IF;
    -- Check user not already a student
    IF EXISTS (SELECT 1 FROM students WHERE user_id = p_user_id) THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::VARCHAR, 'User already enrolled as student'::VARCHAR;
        RETURN;
    END IF;
    -- Insert
    INSERT INTO students(first_name, last_name, class_id, date_of_birth, gender, user_id, enrollment_no, status)
    VALUES (p_first_name, p_last_name, p_class_id, p_dob, p_gender, p_user_id, p_enrollment_no, 'active')
    RETURNING id INTO p_user_id; -- reuse variable
    RETURN QUERY SELECT p_user_id, p_enrollment_no, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_enroll_student(character varying, character varying, character varying, character varying, date, character varying, integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_enroll_student(IN p_email character varying, IN p_password_hash character varying, IN p_first_name character varying, IN p_last_name character varying, IN p_dob date, IN p_gender character varying, IN p_class_id integer, IN p_parent_id integer, OUT p_student_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_enter_marks(integer, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_enter_marks(p_exam_subject_id integer, p_marks jsonb, p_teacher_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE rec JSONB; v_exam_id INT;
BEGIN
    SELECT es.exam_id INTO v_exam_id FROM exam_subjects es WHERE es.id=p_exam_subject_id;
    FOR rec IN SELECT * FROM jsonb_array_elements(p_marks) LOOP
        INSERT INTO exam_marks(exam_id, exam_subject_id, student_id, marks_obtained, is_absent, remarks, entered_by)
        VALUES(v_exam_id, p_exam_subject_id,
            (rec->>'student_id')::INT,
            CASE WHEN (rec->>'is_absent')::BOOLEAN THEN NULL ELSE (rec->>'marks')::NUMERIC END,
            COALESCE((rec->>'is_absent')::BOOLEAN, FALSE),
            rec->>'remarks',
            p_teacher_id)
        ON CONFLICT(exam_subject_id, student_id) DO UPDATE SET
            marks_obtained=EXCLUDED.marks_obtained,
            is_absent=EXCLUDED.is_absent,
            remarks=EXCLUDED.remarks,
            entered_by=p_teacher_id,
            updated_at=NOW();
    END LOOP;
    RETURN QUERY SELECT p_exam_subject_id, NULL::VARCHAR;
END;
$$;


--
-- Name: fee_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_invoices (
    id integer NOT NULL,
    student_id integer,
    fee_structure_id integer,
    amount numeric(10,2),
    status character varying(20) DEFAULT 'unpaid'::character varying,
    issued_at timestamp without time zone DEFAULT now(),
    due_date date,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    fine numeric(10,2) DEFAULT 0 NOT NULL,
    notes text,
    issued_by integer,
    paid_at timestamp with time zone,
    net_amount numeric(10,2) GENERATED ALWAYS AS (((amount - discount) + fine)) STORED,
    invoice_no character varying(30),
    month_year character varying(7),
    for_class_id integer,
    late_fee_type character varying(20) DEFAULT 'none'::character varying NOT NULL,
    late_fee_amount numeric(10,2) DEFAULT 0 NOT NULL,
    notice_level integer DEFAULT 0,
    late_fee_billed_through date,
    superseded_by integer,
    CONSTRAINT fee_invoices_status_check CHECK (((status)::text = ANY ((ARRAY['unpaid'::character varying, 'paid'::character varying, 'partial'::character varying, 'overdue'::character varying, 'pending_verification'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    invoice_id integer,
    amount_paid numeric(10,2),
    paid_at timestamp without time zone DEFAULT now(),
    method character varying(30),
    reference character varying(100),
    received_by integer,
    notes text,
    receipt_image text,
    is_verified boolean DEFAULT false NOT NULL,
    verified_by integer,
    verified_at timestamp with time zone
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id integer NOT NULL,
    user_id integer,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    date_of_birth date,
    gender character varying(10),
    enrollment_no character varying(50),
    class_id integer,
    parent_id integer,
    created_at timestamp without time zone DEFAULT now(),
    blood_group character varying(5),
    address text,
    admission_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    father_name character varying(200),
    mother_name character varying(200),
    father_cnic character varying(20),
    father_phone character varying(20),
    mother_phone character varying(20),
    suspension_return_date date,
    CONSTRAINT students_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'graduated'::character varying, 'transferred'::character varying, 'withdrawn'::character varying, 'suspended'::character varying, 'expelled'::character varying])::text[])))
);


--
-- Name: vw_fee_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_fee_report AS
 SELECT fi.id AS invoice_id,
    fi.invoice_no,
    fi.student_id,
    s.first_name,
    s.last_name,
    s.enrollment_no,
    s.parent_id,
    fi.for_class_id AS class_id,
    c.name AS class_name,
    c.section AS class_section,
    c.academic_year_id,
    ay.name AS academic_year_name,
    fi.month_year,
    fi.due_date,
    fi.issued_at,
    fi.paid_at,
    fi.status,
    fi.amount,
    fi.discount,
    fi.fine,
    fi.net_amount,
    COALESCE(( SELECT sum(p.amount_paid) AS sum
           FROM public.payments p
          WHERE (p.invoice_id = fi.id)), (0)::numeric) AS paid_amount,
    (fi.net_amount - COALESCE(( SELECT sum(p.amount_paid) AS sum
           FROM public.payments p
          WHERE (p.invoice_id = fi.id)), (0)::numeric)) AS balance
   FROM (((public.fee_invoices fi
     JOIN public.students s ON ((s.id = fi.student_id)))
     LEFT JOIN public.classes c ON ((c.id = fi.for_class_id)))
     LEFT JOIN public.academic_years ay ON ((ay.id = c.academic_year_id)))
  WHERE ((fi.status)::text <> 'cancelled'::text);


--
-- Name: sp_fee_report_class(integer, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_fee_report_class(p_class_id integer, p_month character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_registration_no character varying DEFAULT NULL::character varying) RETURNS SETOF public.vw_fee_report
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM vw_fee_report v
    WHERE v.class_id = p_class_id
      AND (p_month IS NULL OR v.month_year = p_month)
      AND (p_status IS NULL OR v.status = p_status)
      AND (p_registration_no IS NULL OR v.enrollment_no ILIKE '%' || p_registration_no || '%'
           OR v.first_name ILIKE '%' || p_registration_no || '%'
           OR v.last_name ILIKE '%' || p_registration_no || '%')
    ORDER BY v.issued_at DESC;
$$;


--
-- Name: sp_fee_report_parent(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_fee_report_parent(p_parent_id integer) RETURNS SETOF public.vw_fee_report
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM vw_fee_report v
    WHERE v.parent_id = p_parent_id
    ORDER BY v.student_id, v.issued_at DESC;
$$;


--
-- Name: sp_fee_report_school(integer, integer, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_fee_report_school(p_class_id integer DEFAULT NULL::integer, p_academic_year_id integer DEFAULT NULL::integer, p_month character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_registration_no character varying DEFAULT NULL::character varying) RETURNS SETOF public.vw_fee_report
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM vw_fee_report v
    WHERE (p_class_id IS NULL OR v.class_id = p_class_id)
      AND (p_academic_year_id IS NULL OR v.academic_year_id = p_academic_year_id)
      AND (p_month IS NULL OR v.month_year = p_month)
      AND (p_status IS NULL OR v.status = p_status)
      AND (p_registration_no IS NULL OR v.enrollment_no ILIKE '%' || p_registration_no || '%'
           OR v.first_name ILIKE '%' || p_registration_no || '%'
           OR v.last_name ILIKE '%' || p_registration_no || '%')
    ORDER BY v.issued_at DESC;
$$;


--
-- Name: sp_fee_report_student(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_fee_report_student(p_student_id integer) RETURNS SETOF public.vw_fee_report
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM vw_fee_report v
    WHERE v.student_id = p_student_id
    ORDER BY v.issued_at DESC;
$$;


--
-- Name: sp_finalize_daily_attendance_status(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_finalize_daily_attendance_status(p_date date DEFAULT (CURRENT_DATE - 1)) RETURNS TABLE(finalized_count integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INT;
BEGIN
    INSERT INTO staff_daily_attendance_status (staff_id, status_date, status, is_late, session_count, total_hours)
    SELECT staff_id, p_date, status, is_late, session_count, total_hours
    FROM sp_get_attendance_daily_status_bulk(p_date, NULL)
    ON CONFLICT (staff_id, status_date) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT v_count;
END;
$$;


--
-- Name: sp_finalize_withdrawal(integer, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_finalize_withdrawal(p_id integer, p_coordinator_id integer, p_action character varying, p_note text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM withdrawal_requests wr WHERE wr.id = p_id AND wr.status = 'coordinator_final') THEN
        RETURN QUERY SELECT NULL::INT, 'Not ready for finalization'::VARCHAR; RETURN;
    END IF;
    IF p_action = 'approve' THEN
        UPDATE withdrawal_requests SET status = 'approved' WHERE withdrawal_requests.id = p_id;
        UPDATE students SET status = 'withdrawn'
        WHERE students.id = (SELECT wr.student_id FROM withdrawal_requests wr WHERE wr.id = p_id);
    ELSE
        UPDATE withdrawal_requests SET status = 'rejected' WHERE withdrawal_requests.id = p_id;
    END IF;
    RETURN QUERY SELECT p_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_forward_waiver(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_forward_waiver(p_waiver_id integer, p_finance_user_id integer, p_note text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE withdrawal_waivers SET status = 'forwarded',
        actioned_by = p_finance_user_id, actioned_at = NOW(), action_note = p_note
    WHERE id = p_waiver_id AND status = 'pending';
END;
$$;


--
-- Name: sp_generate_employee_code(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_generate_employee_code(p_role_id integer) RETURNS character varying
    LANGUAGE plpgsql
    AS $$DECLARE
    v_role_key VARCHAR;
    v_prefix   VARCHAR;
    v_digits   INT;
    v_sep      VARCHAR;
    v_counter  INT;
    v_code     VARCHAR;
    v_attempts INT := 0;
BEGIN
    SELECT CASE name
        WHEN 'teacher'             THEN 'teacher'
        WHEN 'academic_coordinator' THEN 'coordinator'
        WHEN 'principal'           THEN 'principal'
        WHEN 'admin'               THEN 'admin'
        WHEN 'finance_officer'     THEN 'finance'
        WHEN 'hr'                  THEN 'hr'
        WHEN 'librarian'           THEN 'librarian'
        WHEN 'procurement'         THEN 'procurement'
        ELSE name
    END INTO v_role_key FROM roles WHERE id=p_role_id;

    SELECT value INTO v_prefix FROM system_settings WHERE key=v_role_key||'_id_prefix';
    SELECT COALESCE(value::INT, 4) INTO v_digits FROM system_settings WHERE key=v_role_key||'_id_digits';
    SELECT COALESCE(value, '-') INTO v_sep FROM system_settings WHERE key=v_role_key||'_id_separator';
    IF v_prefix IS NULL THEN v_prefix := UPPER(LEFT(v_role_key,3)); END IF;

    LOOP
        UPDATE system_settings SET value=(COALESCE(value::INT,0)+1)::TEXT
        WHERE key=v_role_key||'_id_counter'
        RETURNING value::INT INTO v_counter;
        IF v_counter IS NULL THEN v_counter := 1; END IF;

        v_code := v_prefix || v_sep || LPAD(v_counter::TEXT, v_digits, '0');

        -- Check if code already exists
        EXIT WHEN NOT EXISTS(SELECT 1 FROM staff WHERE employee_code=v_code);

        v_attempts := v_attempts + 1;
        IF v_attempts > 100 THEN EXIT; END IF;
    END LOOP;

    RETURN v_code;
END;$$;


--
-- Name: sp_generate_employee_code(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_generate_employee_code(p_department_id integer, p_role_id integer) RETURNS character varying
    LANGUAGE plpgsql
    AS $$DECLARE
    v_dept_code VARCHAR;
    v_role_code VARCHAR;
    v_seq INT;
    v_code VARCHAR;
BEGIN
    -- Get department abbreviation (first 3 chars uppercase)
    SELECT UPPER(LEFT(REPLACE(name,' ',''), 3)) INTO v_dept_code
    FROM departments WHERE id=p_department_id;
    IF v_dept_code IS NULL THEN v_dept_code := 'GEN'; END IF;

    -- Get role abbreviation
    SELECT CASE
        WHEN name='teacher' THEN 'TCH'
        WHEN name='academic_coordinator' THEN 'ACO'
        WHEN name='principal' THEN 'PRI'
        WHEN name='admin' THEN 'ADM'
        WHEN name='finance_officer' THEN 'FIN'
        WHEN name='hr' THEN 'HRM'
        WHEN name='librarian' THEN 'LIB'
        WHEN name='procurement' THEN 'PRO'
        ELSE UPPER(LEFT(name,3))
    END INTO v_role_code
    FROM roles WHERE id=p_role_id;
    IF v_role_code IS NULL THEN v_role_code := 'STF'; END IF;

    -- Get next sequence for this dept+role combo
    SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE(employee_code, '[^0-9]', '', 'g') AS INT)
    ), 0) + 1 INTO v_seq
    FROM staff s
    JOIN users u ON u.id=s.user_id
    JOIN user_roles ur ON ur.user_id=u.id
    WHERE s.department_id=p_department_id AND ur.role_id=p_role_id
    AND employee_code ~ ('^'||v_dept_code||'-'||v_role_code||'-[0-9]+');

    v_code := v_dept_code || '-' || v_role_code || '-' || LPAD(v_seq::TEXT, 3, '0');
    RETURN v_code;
END;$$;


--
-- Name: sp_generate_fee_invoice(integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_generate_fee_invoice(IN p_fee_structure_id integer, IN p_class_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE fs fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO fs FROM fee_structures WHERE id = p_fee_structure_id;
    INSERT INTO fee_invoices(student_id, fee_structure_id, amount, due_date)
    SELECT s.id, p_fee_structure_id, fs.amount, fs.due_date
    FROM students s WHERE s.class_id = p_class_id;
    COMMIT;
END;
$$;


--
-- Name: sp_generate_fee_invoice(integer, integer, integer, integer, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_generate_fee_invoice(p_student_id integer, p_month integer, p_year integer, p_academic_year_id integer, p_due_date date, p_created_by integer) RETURNS TABLE(invoice_id integer, invoice_no character varying, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id  INTEGER;
    v_invoice_no  VARCHAR;
    v_class_id    INTEGER;
    v_total       NUMERIC := 0;
    v_fee_rec     RECORD;
BEGIN
    -- Check duplicate
    IF EXISTS (
        SELECT 1 FROM fee_invoices
        WHERE student_id=p_student_id AND month=p_month AND year=p_year
    ) THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::VARCHAR, 'Invoice already exists for this month'::VARCHAR;
        RETURN;
    END IF;

    -- Get student class
    SELECT class_id INTO v_class_id FROM students WHERE id=p_student_id;
    IF v_class_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::VARCHAR, 'Student not found'::VARCHAR;
        RETURN;
    END IF;

    -- Generate invoice number
    v_invoice_no := 'INV-' || p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-' || LPAD(p_student_id::TEXT, 4, '0');

    -- Create invoice
    INSERT INTO fee_invoices(student_id, academic_year_id, month, year, due_date,
                             invoice_no, status, created_by, total_amount)
    VALUES (p_student_id, p_academic_year_id, p_month, p_year, p_due_date,
            v_invoice_no, 'unpaid', p_created_by, 0)
    RETURNING id INTO v_invoice_id;

    -- Add fee items from class fee config
    FOR v_fee_rec IN
        SELECT ft.id AS fee_type_id, ft.name, cf.amount
        FROM class_fees cf
        JOIN fee_types ft ON ft.id = cf.fee_type_id
        WHERE cf.class_id = v_class_id
          AND cf.academic_year_id = p_academic_year_id
          AND ft.is_active = TRUE
    LOOP
        INSERT INTO fee_invoice_items(invoice_id, fee_type_id, amount, description)
        VALUES (v_invoice_id, v_fee_rec.fee_type_id, v_fee_rec.amount, v_fee_rec.name);
        v_total := v_total + v_fee_rec.amount;
    END LOOP;

    -- Update total
    UPDATE fee_invoices SET total_amount = v_total WHERE id = v_invoice_id;

    RETURN QUERY SELECT v_invoice_id, v_invoice_no, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_generate_waiver_invoice(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_generate_waiver_invoice(p_waiver_id integer, p_generated_by integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_waiver withdrawal_waivers%ROWTYPE;
    v_student_id INTEGER;
    v_orig_amount NUMERIC;
    v_waiver_amount NUMERIC;
    v_to_pay NUMERIC;
    v_new_inv_id INTEGER;
    v_month_year VARCHAR;
    v_due_date DATE;
    v_for_class_id INTEGER;
    v_fee_structure_id INTEGER;
BEGIN
    SELECT * INTO v_waiver FROM withdrawal_waivers WHERE id = p_waiver_id;

    -- Get original invoice details if linked
    IF v_waiver.invoice_id IS NOT NULL THEN
        SELECT fi.amount, fi.month_year, fi.due_date, fi.for_class_id, fi.fee_structure_id
        INTO v_orig_amount, v_month_year, v_due_date, v_for_class_id, v_fee_structure_id
        FROM fee_invoices fi WHERE fi.id = v_waiver.invoice_id;
        -- Cancel original
        UPDATE fee_invoices SET status = 'cancelled', superseded_by = -1 WHERE id = v_waiver.invoice_id;
    ELSE
        -- Get student pending total
        SELECT COALESCE(SUM(net_amount), 0), MIN(due_date)
        INTO v_orig_amount, v_due_date
        FROM fee_invoices
        WHERE student_id = (SELECT s.id FROM withdrawal_requests wr JOIN students s ON s.id = wr.student_id WHERE wr.id = v_waiver.withdrawal_id)
          AND status NOT IN ('paid','cancelled');
        v_month_year := TO_CHAR(NOW(), 'YYYY-MM');
    END IF;

    -- Get student_id
    SELECT s.id INTO v_student_id FROM withdrawal_requests wr
    JOIN students s ON s.id = wr.student_id WHERE wr.id = v_waiver.withdrawal_id;

    v_waiver_amount := COALESCE(v_waiver.waiver_amount, 0);
    v_to_pay := GREATEST(0, v_orig_amount - v_waiver_amount);

    -- Create new invoice with net amount = to_pay
    INSERT INTO fee_invoices(student_id, amount, net_amount, status, issued_at, due_date,
        notes, issued_by, month_year, for_class_id, fee_structure_id)
    VALUES (v_student_id, v_orig_amount, v_to_pay, 'unpaid', NOW(),
        COALESCE(v_due_date, NOW()::DATE + 30),
        'Waiver Invoice - Original: ' || v_orig_amount || ', Waiver: ' || v_waiver_amount || ', Total: ' || v_to_pay,
        p_generated_by, v_month_year, v_for_class_id, v_fee_structure_id)
    RETURNING id INTO v_new_inv_id;

    -- Add line items for breakdown
    INSERT INTO fee_invoice_items(invoice_id, item_type, label, amount)
    VALUES (v_new_inv_id, 'fee', 'Outstanding Fee', v_orig_amount);

    INSERT INTO fee_invoice_items(invoice_id, item_type, label, amount)
    VALUES (v_new_inv_id, 'discount', 'Fee Waiver', -v_waiver_amount);

    -- Update waiver record
    UPDATE withdrawal_waivers SET new_invoice_id = v_new_inv_id WHERE id = p_waiver_id;

    RETURN v_new_inv_id;
END;
$$;


--
-- Name: sp_get_active_academic_year(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_active_academic_year() RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT id FROM academic_years WHERE is_active = TRUE LIMIT 1;
$$;


--
-- Name: sp_get_active_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_active_audit() RETURNS TABLE(audit_id integer, started_at timestamp with time zone, started_by_name text, total_to_verify integer, verified_count integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        a.id, a.started_at, (u.first_name || ' ' || u.last_name)::TEXT,
        (SELECT COUNT(*) FROM library_book_copies bc WHERE bc.status = 'available')::INTEGER,
        (SELECT COUNT(*) FROM library_inventory_audit_items ai WHERE ai.audit_id = a.id)::INTEGER
    FROM library_inventory_audits a
    JOIN users u ON u.id = a.started_by
    WHERE a.status = 'in_progress'
    LIMIT 1;
$$;


--
-- Name: sp_get_active_child_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_active_child_id(p_parent_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT id FROM students WHERE parent_id = p_parent_id AND status = 'active' LIMIT 1;
$$;


--
-- Name: leave_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    max_days_per_year integer,
    certificate_required boolean DEFAULT false,
    certificate_label character varying(200),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    notify_mode character varying(20) DEFAULT 'incharge_only'::character varying
);


--
-- Name: sp_get_active_leave_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_active_leave_types() RETURNS SETOF public.leave_types
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM leave_types WHERE is_active = TRUE ORDER BY name;
$$;


--
-- Name: sp_get_active_users_by_role(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_active_users_by_role(p_role_name character varying) RETURNS TABLE(id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT u.id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = p_role_name AND u.is_active = TRUE;
$$;


--
-- Name: sp_get_admin_class_stats(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_admin_class_stats(p_class_id integer, p_from date, p_to date) RETURNS TABLE(total_students bigint, present bigint, absent bigint, late bigint, on_leave bigint, days_marked bigint, marked_today boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        (SELECT COUNT(*) FROM students WHERE class_id = p_class_id AND status = 'active'),
        COUNT(*) FILTER (WHERE status='present'),
        COUNT(*) FILTER (WHERE status='absent'),
        COUNT(*) FILTER (WHERE status='late'),
        COUNT(*) FILTER (WHERE status IN ('on_leave','excused')),
        COUNT(DISTINCT date),
        EXISTS(SELECT 1 FROM attendance WHERE class_id = p_class_id AND date = p_to)
    FROM attendance
    WHERE class_id = p_class_id AND date BETWEEN p_from AND p_to;
$$;


--
-- Name: sp_get_admin_report_classes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_admin_report_classes(p_class_id integer) RETURNS TABLE(id integer, name character varying, section character varying, incharge_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section,
           (SELECT (u.first_name || ' ' || u.last_name) FROM class_teachers ct
            JOIN teachers t ON t.id = ct.teacher_id JOIN users u ON u.id = t.user_id
            WHERE ct.class_id = c.id AND ct.is_primary = TRUE LIMIT 1)
    FROM classes c
    WHERE p_class_id IS NULL OR c.id = p_class_id
    ORDER BY c.name, c.section;
$$;


--
-- Name: sp_get_all_active_user_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_active_user_ids() RETURNS TABLE(id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT id FROM users WHERE is_active = TRUE;
$$;


--
-- Name: sp_get_all_authors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_authors() RETURNS SETOF public.library_authors
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM library_authors ORDER BY name;
$$;


--
-- Name: sp_get_all_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_categories() RETURNS TABLE(id integer, name character varying, parent_id integer, parent_name text, is_active boolean, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.parent_id, p.name::TEXT, c.is_active, c.created_at
    FROM library_categories c
    LEFT JOIN library_categories p ON p.id = c.parent_id
    ORDER BY c.name;
$$;


--
-- Name: sp_get_all_classes_diary_status(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_classes_diary_status(p_date date) RETURNS TABLE(class_id integer, name character varying, section character varying, incharge_name text, incharge_teacher_id integer, incharge_user_id integer, published_at timestamp with time zone, published boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section,
           (t.first_name || ' ' || t.last_name), t.id, t.user_id,
           dp.published_at,
           CASE WHEN dp.id IS NOT NULL THEN TRUE ELSE FALSE END
    FROM classes c
    LEFT JOIN class_teachers ct ON ct.class_id = c.id AND ct.is_primary = TRUE
    LEFT JOIN teachers t ON t.id = ct.teacher_id
    LEFT JOIN diary_publish dp ON dp.class_id = c.id AND dp.date = p_date
    ORDER BY 8, 2, 3;
$$;


--
-- Name: sp_get_all_leave_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_leave_types() RETURNS SETOF public.leave_types
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM leave_types ORDER BY name;
$$;


--
-- Name: sp_get_all_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_permissions() RETURNS TABLE(id integer, code character varying, module character varying, action character varying, description text)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, code, module, action, description FROM permissions ORDER BY module, action;
$$;


--
-- Name: sp_get_all_publishers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_publishers() RETURNS SETOF public.library_publishers
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM library_publishers ORDER BY name;
$$;


--
-- Name: sp_get_all_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_roles() RETURNS TABLE(id integer, name character varying, description text)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, name, description FROM roles ORDER BY name;
$$;


--
-- Name: sp_get_all_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_settings() RETURNS TABLE(key text, value text, description text, category text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT s.key::TEXT, s.value::TEXT, s.description::TEXT, s.category::TEXT
    FROM system_settings s
    ORDER BY s.category, s.key;
END;
$$;


--
-- Name: sp_get_all_staff(integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_staff(p_department_id integer DEFAULT NULL::integer, p_role_id integer DEFAULT NULL::integer, p_search character varying DEFAULT NULL::character varying) RETURNS TABLE(id integer, user_id integer, first_name character varying, last_name character varying, email character varying, role_name character varying, role_id integer, department_name character varying, department_id integer, designation_name character varying, employee_code character varying, phone character varying, employment_type character varying, joining_date date, status character varying, is_probationary boolean)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT
        COALESCE(s.id, 0)::INT, u.id,
        COALESCE(s.first_name, u.first_name)::VARCHAR,
        COALESCE(s.last_name, u.last_name)::VARCHAR,
        u.email::VARCHAR,
        r.name::VARCHAR, r.id::INT,
        dep.name::VARCHAR, dep.id::INT,
        des.name::VARCHAR,
        s.employee_code::VARCHAR,
        COALESCE(s.phone, u.phone)::VARCHAR,
        COALESCE(s.employment_type, 'full_time')::VARCHAR,
        s.joining_date,
        COALESCE(s.status, 'active')::VARCHAR,
        COALESCE(s.is_probationary, TRUE)
    FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    LEFT JOIN department_roles dr ON dr.role_id=r.id
    LEFT JOIN departments dep ON dep.id=dr.department_id
    LEFT JOIN staff s ON s.user_id=u.id
    LEFT JOIN designations des ON des.id=s.designation_id
    WHERE r.name NOT IN ('student','parent','superadmin')
      AND (p_department_id IS NULL OR dep.id=p_department_id)
      AND (p_role_id IS NULL OR r.id=p_role_id)
      AND (p_search IS NULL OR (u.first_name||' '||u.last_name) ILIKE ('%'||p_search||'%')
           OR u.email ILIKE ('%'||p_search||'%'))
    ORDER BY u.first_name, u.last_name;
END;$$;


--
-- Name: sp_get_all_subjects(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_all_subjects() RETURNS TABLE(id integer, name character varying, code character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, name, code FROM subjects WHERE is_active = TRUE ORDER BY name;
$$;


--
-- Name: sp_get_announcements(integer, character varying, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_announcements(p_user_id integer, p_role character varying, p_class_id integer, p_limit integer) RETURNS TABLE(id integer, title character varying, body text, priority character varying, ann_type character varying, target_role character varying, target_class integer, attachment character varying, start_date date, end_date date, created_by integer, created_by_name character varying, is_read boolean, created_at timestamp without time zone, link character varying, link_label character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT a.id, a.title, a.body, a.priority, a.ann_type,
        a.target_role, a.target_class, a.attachment,
        a.start_date, a.end_date, a.created_by,
        COALESCE(u.first_name||' '||u.last_name,'System')::VARCHAR,
        EXISTS(SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id=a.id AND ar.user_id=p_user_id),
        a.created_at, a.link::VARCHAR, COALESCE(a.link_label,'View')::VARCHAR
    FROM announcements a
    LEFT JOIN users u ON u.id=a.created_by
    WHERE a.is_active=TRUE
      AND a.start_date<=CURRENT_DATE
      AND (a.end_date IS NULL OR a.end_date>=CURRENT_DATE)
      AND (a.target_role='all' OR a.target_role=p_role OR (a.target_class IS NOT NULL AND a.target_class=p_class_id))
    ORDER BY CASE a.priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END, a.created_at DESC
    LIMIT p_limit;
END;
$$;


--
-- Name: sp_get_approval_rule_steps(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_approval_rule_steps(p_rule_id integer) RETURNS SETOF public.procurement_approval_steps
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM procurement_approval_steps WHERE rule_id = p_rule_id ORDER BY step_order;
$$;


--
-- Name: sp_get_approvers_for_leave_type(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_approvers_for_leave_type(p_leave_type_id integer) RETURNS TABLE(id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT u.id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    JOIN leave_approval_rules lac ON lac.leave_type_id = p_leave_type_id
    WHERE r.name = lac.approver_role AND u.is_active = TRUE LIMIT 5;
$$;


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id integer NOT NULL,
    class_id integer NOT NULL,
    subject_id integer NOT NULL,
    teacher_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    due_date date NOT NULL,
    total_marks integer DEFAULT 100 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    file_name character varying(255),
    file_path character varying(500),
    file_type character varying(50),
    file_size integer
);


--
-- Name: sp_get_assignment_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_assignment_by_id(p_id integer) RETURNS SETOF public.assignments
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM assignments WHERE id = p_id;
$$;


--
-- Name: sp_get_assignment_for_delete(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_assignment_for_delete(p_id integer) RETURNS TABLE(id integer, file_path character varying, teacher_user_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.id, a.file_path, t.user_id
    FROM assignments a JOIN teachers t ON t.id = a.teacher_id
    WHERE a.id = p_id;
$$;


--
-- Name: sp_get_attendance_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_attendance_config() RETURNS TABLE(key character varying, value text)
    LANGUAGE sql STABLE
    AS $$
    SELECT key, value FROM system_settings WHERE category = 'attendance_config';
$$;


--
-- Name: sp_get_attendance_daily_status(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_attendance_daily_status(p_staff_id integer, p_from_date date, p_to_date date) RETURNS TABLE(status_date date, status character varying, is_late boolean, session_count integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_working_days INT[];
    v_user_id INT;
    v_min_present NUMERIC;
    v_min_half_day NUMERIC;
    v_max_absent NUMERIC;
BEGIN
    SELECT COALESCE(
        (SELECT string_to_array(value, ',')::INT[] FROM system_settings WHERE key='working_days' AND category='school_timing'),
        ARRAY[1,2,3,4,5]
    ) INTO v_working_days;

    SELECT staff.user_id INTO v_user_id FROM staff WHERE staff.id = p_staff_id;

    SELECT t.min_present_hours, t.min_half_day_hours, t.max_absent_hours
      INTO v_min_present, v_min_half_day, v_max_absent
      FROM attendance_status_thresholds t WHERE t.id = 1;

    RETURN QUERY
    SELECT
        d::DATE AS status_date,
        COALESCE(
            snap.status,
            CASE
                WHEN EXTRACT(ISODOW FROM d)::INT != ALL(v_working_days) THEN 'weekly_off'
                WHEN h.event_date IS NOT NULL THEN 'holiday'
                WHEN lr.id IS NOT NULL THEN 'on_leave'
                WHEN d::DATE > CURRENT_DATE THEN 'pending'
                WHEN COALESCE(s.has_open_session, false) THEN 'present'
                WHEN COALESCE(s.total_hours, 0) >= v_min_present THEN 'present'
                WHEN COALESCE(s.total_hours, 0) >= v_min_half_day THEN 'half_day'
                WHEN COALESCE(s.total_hours, 0) > v_max_absent THEN 'half_day'
                WHEN d::DATE = CURRENT_DATE AND COALESCE(s.session_count,0) = 0 THEN 'pending'
                ELSE 'absent'
            END
        )::VARCHAR AS status,
        COALESCE(snap.is_late, s.any_late, false) AS is_late,
        COALESCE(snap.session_count, s.session_count, 0)::INT AS session_count
    FROM generate_series(p_from_date, p_to_date, '1 day'::interval) d
    LEFT JOIN staff_daily_attendance_status snap ON snap.staff_id = p_staff_id AND snap.status_date = d::DATE
    LEFT JOIN calendar_events h ON h.is_holiday = true AND d::DATE BETWEEN h.event_date AND COALESCE(h.end_date, h.event_date)
    LEFT JOIN staff_leave_requests lr ON lr.user_id = v_user_id AND lr.status = 'approved' AND d::DATE BETWEEN lr.from_date AND lr.to_date
    LEFT JOIN (
        SELECT sas.clock_in_at::date AS sess_date, COUNT(*) AS session_count, BOOL_OR(sas.is_late) AS any_late,
               BOOL_OR(sas.clock_out_at IS NULL) AS has_open_session,
               SUM(EXTRACT(EPOCH FROM (COALESCE(sas.clock_out_at, NOW()) - sas.clock_in_at)) / 3600.0) AS total_hours
        FROM staff_attendance_sessions sas
        WHERE sas.staff_id = p_staff_id
        GROUP BY sas.clock_in_at::date
    ) s ON s.sess_date = d::DATE
    ORDER BY d;
END;
$$;


--
-- Name: sp_get_attendance_daily_status_bulk(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_attendance_daily_status_bulk(p_date date, p_department_id integer DEFAULT NULL::integer) RETURNS TABLE(staff_id integer, first_name character varying, last_name character varying, department_id integer, department_name character varying, status character varying, is_late boolean, session_count integer, total_hours numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_working_days INT[];
    v_min_present NUMERIC;
    v_min_half_day NUMERIC;
    v_max_absent NUMERIC;
BEGIN
    SELECT COALESCE(
        (SELECT string_to_array(value, ',')::INT[] FROM system_settings WHERE key='working_days' AND category='school_timing'),
        ARRAY[1,2,3,4,5]
    ) INTO v_working_days;

    SELECT t.min_present_hours, t.min_half_day_hours, t.max_absent_hours
      INTO v_min_present, v_min_half_day, v_max_absent
      FROM attendance_status_thresholds t WHERE t.id = 1;

    RETURN QUERY
    SELECT
        s.id, s.first_name, s.last_name, s.department_id, d.name,
        COALESCE(
            snap.status,
            CASE
                WHEN EXTRACT(ISODOW FROM p_date)::INT != ALL(v_working_days) THEN 'weekly_off'
                WHEN h.event_date IS NOT NULL THEN 'holiday'
                WHEN lr.id IS NOT NULL THEN 'on_leave'
                WHEN p_date > CURRENT_DATE THEN 'pending'
                WHEN COALESCE(sess.has_open_session, false) THEN 'present'
                WHEN COALESCE(sess.total_hours, 0) >= v_min_present THEN 'present'
                WHEN COALESCE(sess.total_hours, 0) >= v_min_half_day THEN 'half_day'
                WHEN COALESCE(sess.total_hours, 0) > v_max_absent THEN 'half_day'
                WHEN p_date = CURRENT_DATE AND COALESCE(sess.session_count,0) = 0 THEN 'pending'
                ELSE 'absent'
            END
        )::VARCHAR,
        COALESCE(snap.is_late, sess.any_late, false),
        COALESCE(snap.session_count, sess.session_count, 0)::INT,
        COALESCE(snap.total_hours, sess.total_hours, 0)::NUMERIC
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN staff_daily_attendance_status snap ON snap.staff_id = s.id AND snap.status_date = p_date
    LEFT JOIN calendar_events h ON h.is_holiday = true AND p_date BETWEEN h.event_date AND COALESCE(h.end_date, h.event_date)
    LEFT JOIN staff_leave_requests lr ON lr.user_id = s.user_id AND lr.status = 'approved' AND p_date BETWEEN lr.from_date AND lr.to_date
    LEFT JOIN (
        SELECT sas.staff_id AS sid, COUNT(*) AS session_count, BOOL_OR(sas.is_late) AS any_late,
               BOOL_OR(sas.clock_out_at IS NULL) AS has_open_session,
               SUM(EXTRACT(EPOCH FROM (COALESCE(sas.clock_out_at, NOW()) - sas.clock_in_at)) / 3600.0) AS total_hours
        FROM staff_attendance_sessions sas
        WHERE sas.clock_in_at::date = p_date
        GROUP BY sas.staff_id
    ) sess ON sess.sid = s.id
    WHERE s.status = 'active' AND (p_department_id IS NULL OR s.department_id = p_department_id)
    ORDER BY s.first_name;
END;
$$;


--
-- Name: sp_get_attendance_marker_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_attendance_marker_config() RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(
        (SELECT value FROM system_settings WHERE category = 'attendance_config' AND key = 'attendance_marker'),
        'incharge_only'
    );
$$;


--
-- Name: sp_get_attendance_report(date, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_attendance_report(p_date date, p_class_id integer, p_subject_id integer) RETURNS TABLE(class_id integer, name character varying, section character varying, total_students bigint, present bigint, absent bigint, late bigint, excused bigint, pct numeric, marked boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section,
           COUNT(DISTINCT s.id),
           COUNT(a.id) FILTER (WHERE a.status='present'),
           COUNT(a.id) FILTER (WHERE a.status='absent'),
           COUNT(a.id) FILTER (WHERE a.status='late'),
           COUNT(a.id) FILTER (WHERE a.status='excused'),
           CASE WHEN COUNT(DISTINCT s.id) > 0
               THEN ROUND(COUNT(a.id) FILTER (WHERE a.status='present')::NUMERIC/COUNT(DISTINCT s.id)*100, 1)
               ELSE 0 END,
           CASE WHEN COUNT(a.id) > 0 THEN TRUE ELSE FALSE END
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date = p_date
        AND (p_subject_id IS NULL OR a.subject_id = p_subject_id)
    WHERE (p_class_id IS NULL OR c.id = p_class_id)
    GROUP BY c.id, c.name, c.section
    ORDER BY c.name, c.section;
$$;


--
-- Name: sp_get_attendance_report_breakdown(date, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_attendance_report_breakdown(p_date date, p_class_id integer, p_subject_id integer) RETURNS TABLE(class_id integer, name character varying, section character varying, subject_id integer, subject_name character varying, total_students bigint, present bigint, absent bigint, late bigint, pct numeric, marked boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section, subj.id, subj.name,
           COUNT(DISTINCT s.id),
           COUNT(a.id) FILTER (WHERE a.status='present'),
           COUNT(a.id) FILTER (WHERE a.status='absent'),
           COUNT(a.id) FILTER (WHERE a.status='late'),
           CASE WHEN COUNT(DISTINCT s.id) > 0
               THEN ROUND(COUNT(a.id) FILTER (WHERE a.status='present')::NUMERIC/COUNT(DISTINCT s.id)*100, 1)
               ELSE 0 END,
           TRUE
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
    JOIN attendance a ON a.student_id = s.id AND a.date = p_date
    JOIN subjects subj ON subj.id = a.subject_id
    WHERE (p_class_id IS NULL OR c.id = p_class_id)
      AND (p_subject_id IS NULL OR a.subject_id = p_subject_id)
    GROUP BY c.id, c.name, c.section, subj.id, subj.name
    ORDER BY c.name, c.section, subj.name;
$$;


--
-- Name: sp_get_audit_verified_items(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_audit_verified_items(p_audit_id integer) RETURNS TABLE(copy_id integer, book_title text, accession_no character varying, verified_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT bc.id, b.title::TEXT, bc.accession_no, ai.verified_at
    FROM library_inventory_audit_items ai
    JOIN library_book_copies bc ON bc.id = ai.copy_id
    JOIN library_books b ON b.id = bc.book_id
    WHERE ai.audit_id = p_audit_id
    ORDER BY ai.verified_at DESC;
$$;


--
-- Name: sp_get_authors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_authors() RETURNS SETOF public.library_authors
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM library_authors WHERE is_active ORDER BY name;
$$;


--
-- Name: sp_get_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_categories() RETURNS SETOF public.library_categories
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM library_categories WHERE is_active ORDER BY name;
$$;


--
-- Name: sp_get_charge_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_charge_types() RETURNS SETOF public.charge_type_definitions
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM charge_type_definitions ORDER BY id;
$$;


--
-- Name: sp_get_class_attendance(integer, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_class_attendance(p_class_id integer, p_date date, p_subject_id integer) RETURNS TABLE(id integer, student_id integer, student_name text, enrollment_no character varying, status character varying, remarks text, created_at timestamp with time zone, subject_id integer, subject_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.id, a.student_id,
           (s.first_name || ' ' || s.last_name), s.enrollment_no,
           a.status, a.remarks, a.created_at, a.subject_id, subj.name
    FROM attendance a
    JOIN students s ON s.id = a.student_id
    LEFT JOIN subjects subj ON subj.id = a.subject_id
    WHERE a.class_id = p_class_id AND a.date = p_date
      AND (p_subject_id IS NULL OR a.subject_id = p_subject_id OR (a.subject_id IS NULL AND p_subject_id IS NULL))
    ORDER BY s.first_name;
$$;


--
-- Name: sp_get_class_name(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_class_name(p_class_id integer) RETURNS TABLE(name character varying, section character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT name, section FROM classes WHERE id = p_class_id;
$$;


--
-- Name: sp_get_class_student_attendance_report(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_class_student_attendance_report(p_class_id integer, p_from date, p_to date) RETURNS TABLE(id integer, student_name text, enrollment_no character varying, status character varying, present bigint, absent bigint, late bigint, excused bigint, on_leave bigint, total bigint, pct numeric)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, (s.first_name || ' ' || s.last_name), s.enrollment_no, s.status,
           COUNT(a.id) FILTER (WHERE a.status='present'),
           COUNT(a.id) FILTER (WHERE a.status='absent'),
           COUNT(a.id) FILTER (WHERE a.status='late'),
           COUNT(a.id) FILTER (WHERE a.status='excused'),
           COUNT(a.id) FILTER (WHERE a.status='on_leave'),
           COUNT(a.id),
           ROUND(COUNT(a.id) FILTER (WHERE a.status='present')::NUMERIC / NULLIF(COUNT(a.id),0) * 100, 1)
    FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date BETWEEN p_from AND p_to AND a.class_id = p_class_id
    WHERE s.class_id = p_class_id
    GROUP BY s.id, s.first_name, s.last_name, s.enrollment_no, s.status
    ORDER BY s.first_name;
$$;


--
-- Name: sp_get_class_subjects(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_class_subjects(p_class_id integer) RETURNS TABLE(id integer, subject_id integer, subject_name character varying, code character varying, credit_hours integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT cs.id, cs.subject_id, s.name, s.code, s.credit_hours
    FROM class_subjects cs
    JOIN subjects s ON s.id = cs.subject_id
    WHERE cs.class_id = p_class_id ORDER BY s.name;
$$;


--
-- Name: sp_get_class_teachers(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_class_teachers(p_class_id integer) RETURNS TABLE(teacher_id integer, is_primary boolean, teacher_name text, employee_no character varying, specialization character varying, class_type character varying, subject_names text)
    LANGUAGE sql STABLE
    AS $$
    SELECT ct.teacher_id, ct.is_primary,
           (t.first_name || ' ' || t.last_name), t.employee_no, t.specialization,
           c.class_type,
           STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name)
    FROM class_teachers ct
    JOIN teachers t ON t.id = ct.teacher_id
    JOIN classes  c ON c.id = ct.class_id
    LEFT JOIN teacher_subjects ts ON ts.teacher_id = ct.teacher_id
    LEFT JOIN subjects s ON s.id = ts.subject_id
    WHERE ct.class_id = p_class_id
    GROUP BY ct.teacher_id, ct.is_primary, t.first_name, t.last_name, t.employee_no, t.specialization, c.class_type
    ORDER BY ct.is_primary DESC;
$$;


--
-- Name: sp_get_class_teachers_for_notify(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_class_teachers_for_notify(p_class_id integer, p_all_teachers boolean) RETURNS TABLE(user_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT t.user_id FROM class_teachers ct
    JOIN teachers t ON t.id = ct.teacher_id
    WHERE ct.class_id = p_class_id
      AND (p_all_teachers OR ct.is_primary = TRUE)
    LIMIT CASE WHEN p_all_teachers THEN NULL ELSE 1 END;
$$;


--
-- Name: sp_get_classes_with_subjects_teachers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_classes_with_subjects_teachers() RETURNS TABLE(id integer, name character varying, section character varying, class_type character varying, subjects json, teachers json)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section, c.class_type,
           json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code)) FILTER (WHERE s.id IS NOT NULL),
           json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.first_name||' '||t.last_name, 'is_primary', ct.is_primary)) FILTER (WHERE t.id IS NOT NULL)
    FROM classes c
    LEFT JOIN class_subjects cs ON cs.class_id = c.id
    LEFT JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN class_teachers ct ON ct.class_id = c.id
    LEFT JOIN teachers t ON t.id = ct.teacher_id
    GROUP BY c.id, c.name, c.section, c.class_type
    ORDER BY c.name, c.section;
$$;


--
-- Name: sp_get_committee_remarks(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_committee_remarks(p_case_id integer) RETURNS TABLE(teacher_id integer, teacher_name text, is_head boolean, remarks text, recommendation character varying, submitted_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT hc.teacher_id, (u.first_name||' '||u.last_name)::TEXT,
           hc.is_head, hmr.remarks, hmr.recommendation, hmr.submitted_at
    FROM hearing_committee hc
    JOIN teachers t ON t.id=hc.teacher_id
    JOIN users u ON u.id=t.user_id
    LEFT JOIN hearing_member_remarks hmr ON hmr.case_id=hc.case_id AND hmr.teacher_id=hc.teacher_id
    WHERE hc.case_id=p_case_id
    ORDER BY hc.is_head DESC, u.first_name;
END;
$$;


--
-- Name: sp_get_conduct_form(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_conduct_form(p_request_id integer) RETURNS TABLE(id integer, behaviour character varying, discipline character varying, academic_performance character varying, attendance_regularity character varying, cocurricular character varying, disciplinary_action boolean, disciplinary_details text, remarks text, recommended_readmission boolean, submitted_at timestamp with time zone, teacher_name text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT wc.id, wc.behaviour, wc.discipline,
           wc.academic_performance, wc.attendance_regularity,
           wc.cocurricular, wc.disciplinary_action,
           wc.disciplinary_details, wc.remarks,
           wc.recommended_readmission, wc.submitted_at,
           (u.first_name||chr(32)||u.last_name)::TEXT
    FROM withdrawal_conduct wc
    JOIN users u ON u.id=wc.teacher_id
    WHERE wc.request_id=p_request_id
    ORDER BY wc.submitted_at DESC LIMIT 1;
END;
$$;


--
-- Name: sp_get_damaged_copies(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_damaged_copies() RETURNS TABLE(copy_id integer, book_id integer, book_title text, accession_no character varying, barcode character varying, last_returned_at timestamp with time zone, member_id integer, first_name text, last_name text, fine_amount numeric, fine_status character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        bc.id, bc.book_id, b.title::TEXT, bc.accession_no, bc.barcode,
        it.returned_at, it.member_id, u.first_name::TEXT, u.last_name::TEXT,
        it.fine_amount, it.fine_status
    FROM library_book_copies bc
    JOIN library_books b ON b.id = bc.book_id
    LEFT JOIN LATERAL (
        SELECT * FROM library_issue_transactions t
        WHERE t.copy_id = bc.id AND t.return_condition = 'damaged'
        ORDER BY t.returned_at DESC LIMIT 1
    ) it ON TRUE
    LEFT JOIN library_members lm ON lm.id = it.member_id
    LEFT JOIN users u ON u.id = lm.user_id
    WHERE bc.status = 'damaged'
    ORDER BY it.returned_at DESC NULLS LAST;
$$;


--
-- Name: sp_get_departments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_departments() RETURNS TABLE(id integer, name character varying, parent_id integer, parent_name character varying, is_parent boolean, is_active boolean, role_count bigint)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT d.id, d.name, d.parent_id, p.name::VARCHAR, d.is_parent, d.is_active,
        COUNT(dr.role_id)
    FROM departments d
    LEFT JOIN departments p ON p.id=d.parent_id
    LEFT JOIN department_roles dr ON dr.department_id=d.id
    GROUP BY d.id, d.name, d.parent_id, p.name, d.is_parent, d.is_active
    ORDER BY COALESCE(d.parent_id, d.id), d.parent_id NULLS FIRST, d.name;
END;$$;


--
-- Name: sp_get_dept_role_users(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_dept_role_users(p_role_name character varying) RETURNS TABLE(user_id integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT u.id FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    WHERE r.name=p_role_name AND u.is_active=TRUE;
END;
$$;


--
-- Name: sp_get_designations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_designations() RETURNS TABLE(id integer, name character varying, department_id integer, department_name character varying, is_active boolean)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT d.id, d.name, d.department_id, dep.name::VARCHAR, d.is_active
    FROM designations d LEFT JOIN departments dep ON dep.id=d.department_id
    WHERE d.is_active=true ORDER BY d.name;
END;$$;


--
-- Name: sp_get_designations_by_department(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_designations_by_department(p_department_id integer) RETURNS TABLE(id integer, name character varying, department_id integer)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT d.id, d.name, d.department_id FROM designations d
    WHERE d.department_id=p_department_id AND d.is_active=true
    ORDER BY d.name;
END;$$;


--
-- Name: sp_get_diary_status(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_diary_status(p_class_id integer, p_date date) RETURNS TABLE(teacher_id integer, teacher_name text, teacher_user_id integer, subject_id integer, subject_name character varying, status text)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT tt.teacher_id, (t.first_name || ' ' || t.last_name), t.user_id,
           s.id, s.name,
           CASE WHEN dd.id IS NOT NULL THEN 'submitted' ELSE 'pending' END
    FROM timetable tt
    JOIN teachers t ON t.id = tt.teacher_id
    JOIN subjects s ON s.id = tt.subject_id
    LEFT JOIN daily_diary dd ON dd.class_id = tt.class_id
        AND dd.teacher_id = tt.teacher_id AND dd.date = p_date AND dd.status = 'submitted'
    WHERE tt.class_id = p_class_id
    ORDER BY 6, 2;
$$;


--
-- Name: sp_get_discipline_appeals(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_discipline_appeals(p_case_id integer) RETURNS TABLE(id integer, appeal_note text, submitted_at timestamp with time zone, outcome character varying, response text, submitted_by_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT da.id, da.appeal_note, da.submitted_at, da.outcome, da.response,
           (u.first_name||' '||u.last_name)::TEXT
    FROM discipline_appeals da JOIN users u ON u.id=da.submitted_by
    WHERE da.case_id=p_case_id ORDER BY da.submitted_at;
$$;


--
-- Name: sp_get_discipline_case_detail(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_discipline_case_detail(p_case_id integer) RETURNS TABLE(id integer, student_id integer, status character varying, violation_type character varying, severity integer, description text, incident_date date, action_note text, action_type character varying, suspension_from date, suspension_to date, hearing_date timestamp with time zone, hearing_notes text, appeal_deadline date, appeal_submitted boolean, appeal_note text, created_at timestamp with time zone, student_name text, enrollment_no character varying, class_name character varying, section character varying, reporter_name text, coordinator_name text, principal_name text, hearing_location character varying, appeal_outcome character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT dc.id, dc.student_id, dc.status, dc.violation_type,
           dc.severity, dc.description, dc.incident_date, dc.action_note,
           dc.action_type, dc.suspension_from, dc.suspension_to,
           dc.hearing_date, dc.hearing_notes,
           dc.appeal_deadline, dc.appeal_submitted, dc.appeal_note,
           dc.created_at,
           (s.first_name||' '||s.last_name)::TEXT,
           s.enrollment_no, c.name::VARCHAR, c.section::VARCHAR,
           (ru.first_name||' '||ru.last_name)::TEXT,
           (cu.first_name||' '||cu.last_name)::TEXT,
           (pu.first_name||' '||pu.last_name)::TEXT,
           dc.hearing_location,
           dc.appeal_outcome
    FROM discipline_cases dc
    JOIN students s ON s.id=dc.student_id
    JOIN classes c ON c.id=s.class_id
    JOIN users ru ON ru.id=dc.reported_by
    LEFT JOIN users cu ON cu.id=dc.coordinator_id
    LEFT JOIN users pu ON pu.id=dc.principal_id
    WHERE dc.id=p_case_id;
END;
$$;


--
-- Name: sp_get_discipline_cases(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_discipline_cases(p_user_id integer DEFAULT NULL::integer, p_view_all boolean DEFAULT true) RETURNS TABLE(id integer, student_id integer, status character varying, violation_type character varying, severity integer, description text, incident_date date, action_type character varying, suspension_from date, suspension_to date, hearing_date timestamp with time zone, appeal_deadline date, appeal_submitted boolean, created_at timestamp with time zone, student_name text, enrollment_no character varying, class_name character varying, section character varying, reported_by_name text, coordinator_name text, principal_name text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT dc.id, dc.student_id, dc.status, dc.violation_type,
           dc.severity, dc.description, dc.incident_date,
           dc.action_type, dc.suspension_from, dc.suspension_to,
           dc.hearing_date, dc.appeal_deadline, dc.appeal_submitted,
           dc.created_at,
           (s.first_name||' '||s.last_name)::TEXT,
           s.enrollment_no, c.name::VARCHAR, c.section::VARCHAR,
           (ru.first_name||' '||ru.last_name)::TEXT,
           (cu.first_name||' '||cu.last_name)::TEXT,
           (pu.first_name||' '||pu.last_name)::TEXT
    FROM discipline_cases dc
    JOIN students s ON s.id=dc.student_id
    JOIN classes c ON c.id=s.class_id
    JOIN users ru ON ru.id=dc.reported_by
    LEFT JOIN users cu ON cu.id=dc.coordinator_id
    LEFT JOIN users pu ON pu.id=dc.principal_id
    ORDER BY dc.created_at DESC;
END;
$$;


--
-- Name: sp_get_discipline_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_discipline_config() RETURNS TABLE(id integer, violation_types jsonb, severity_labels jsonb, hearing_min_severity integer, committee_min_members integer, require_head boolean, allow_appeal boolean, appeal_days integer, max_suspension_days integer, auto_reinstate boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY SELECT dc.id, dc.violation_types, dc.severity_labels,
        dc.hearing_min_severity, dc.committee_min_members,
        dc.require_head, dc.allow_appeal, dc.appeal_days,
        dc.max_suspension_days, dc.auto_reinstate
    FROM discipline_config dc WHERE dc.id=1;
END;
$$;


--
-- Name: sp_get_discipline_evidence(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_discipline_evidence(p_case_id integer) RETURNS TABLE(id integer, filename character varying, url character varying, description text, uploaded_at timestamp with time zone, uploaded_by_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT de.id, de.filename, de.url, de.description, de.uploaded_at,
           (u.first_name||' '||u.last_name)::TEXT
    FROM discipline_evidence de JOIN users u ON u.id=de.uploaded_by
    WHERE de.case_id=p_case_id ORDER BY de.uploaded_at;
$$;


--
-- Name: sp_get_discipline_hearings(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_discipline_hearings(p_case_id integer) RETURNS TABLE(id integer, scheduled_at timestamp with time zone, conducted_at timestamp with time zone, attendees text, notes text, outcome text, created_at timestamp with time zone, created_by_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT dh.id, dh.scheduled_at, dh.conducted_at, dh.attendees, dh.notes,
           dh.outcome, dh.created_at, (u.first_name||' '||u.last_name)::TEXT
    FROM discipline_hearings dh JOIN users u ON u.id=dh.created_by
    WHERE dh.case_id=p_case_id ORDER BY dh.created_at;
$$;


--
-- Name: sp_get_education(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_education(p_staff_id integer) RETURNS TABLE(id integer, staff_id integer, degree character varying, institution character varying, field_of_study character varying, start_year integer, end_year integer, grade character varying, is_current boolean, grade_type character varying, total_marks numeric, awarded_marks numeric, total_cgpa numeric, awarded_cgpa numeric)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT e.id, e.staff_id, e.degree, e.institution, e.field_of_study,
        e.start_year, e.end_year, e.grade, e.is_current,
        e.grade_type, e.total_marks, e.awarded_marks, e.total_cgpa, e.awarded_cgpa
    FROM staff_education e WHERE e.staff_id=p_staff_id ORDER BY e.end_year DESC NULLS FIRST;
END;$$;


--
-- Name: sp_get_emergency_contacts(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_emergency_contacts(p_staff_id integer) RETURNS TABLE(id integer, staff_id integer, name character varying, relationship character varying, phone character varying, address text)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT ec.id, ec.staff_id, ec.name, ec.relationship, ec.phone, ec.address
    FROM staff_emergency_contacts ec WHERE ec.staff_id=p_staff_id;
END;$$;


--
-- Name: sp_get_employment_history(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_employment_history(p_staff_id integer) RETURNS TABLE(id integer, staff_id integer, organization character varying, role character varying, from_date date, to_date date, reason_leaving character varying, reference_name character varying, reference_phone character varying)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT h.id, h.staff_id, h.organization, h.role, h.from_date, h.to_date, h.reason_leaving, h.reference_name, h.reference_phone
    FROM staff_employment_history h WHERE h.staff_id=p_staff_id ORDER BY h.from_date DESC NULLS FIRST;
END;$$;


--
-- Name: sp_get_exam_detail(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_exam_detail(p_exam_id integer) RETURNS TABLE(id integer, name character varying, status character varying, start_date date, end_date date, exam_type_id integer, exam_type_name character varying, exam_type_code character varying, academic_year_id integer, academic_year_name character varying, published_at timestamp with time zone, approved_at timestamp with time zone, datesheet_status character varying, datesheet_published boolean, datesheet_published_at timestamp with time zone, datesheet_submitted_at timestamp with time zone, datesheet_approved_at timestamp with time zone, class_count bigint, class_names text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.name::VARCHAR, e.status::VARCHAR, e.start_date, e.end_date,
           e.exam_type_id, et.name::VARCHAR, et.code::VARCHAR,
           e.academic_year_id, ay.name::VARCHAR,
           e.published_at, e.approved_at,
           COALESCE(e.datesheet_status,'draft')::VARCHAR,
           COALESCE(e.datesheet_published,FALSE),
           e.datesheet_published_at, e.datesheet_submitted_at, e.datesheet_approved_at,
           COUNT(DISTINCT ec.class_id),
           STRING_AGG(DISTINCT c.name||(CASE WHEN c.section IS NOT NULL AND c.section!='' THEN ' ('||c.section||')' ELSE '' END), ', ')
    FROM exams e
    JOIN exam_types et ON et.id=e.exam_type_id
    JOIN academic_years ay ON ay.id=e.academic_year_id
    LEFT JOIN exam_classes ec ON ec.exam_id=e.id
    LEFT JOIN classes c ON c.id=ec.class_id
    WHERE e.id=p_exam_id
    GROUP BY e.id, et.name, et.code, ay.name;
END;
$$;


--
-- Name: sp_get_exam_marks(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_exam_marks(p_exam_subject_id integer) RETURNS TABLE(id integer, student_name text, enrollment_no character varying, marks_obtained numeric, is_absent boolean, remarks text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, (s.first_name||' '||s.last_name)::TEXT, s.enrollment_no,
           em.marks_obtained, COALESCE(em.is_absent,FALSE), em.remarks
    FROM students s
    JOIN exam_subjects es ON es.id=p_exam_subject_id
    LEFT JOIN exam_marks em ON em.student_id=s.id AND em.exam_subject_id=p_exam_subject_id
    WHERE s.class_id=es.class_id
      AND s.status='active'
    ORDER BY s.first_name, s.last_name;
END;
$$;


--
-- Name: sp_get_exam_results(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_exam_results(p_exam_id integer) RETURNS TABLE(student_id integer, student_name text, enrollment_no character varying, total_marks numeric, marks_obtained numeric, percentage numeric, grade character varying, gpa numeric, class_position integer, subjects_failed integer, is_pass boolean, is_compartment boolean)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, (s.first_name||' '||s.last_name)::TEXT, s.enrollment_no,
           er.total_marks, er.marks_obtained, er.percentage,
           er.grade::VARCHAR, er.gpa, er.class_position,
           er.subjects_failed, er.is_pass, er.is_compartment
    FROM exam_results er
    JOIN students s ON s.id=er.student_id
    WHERE er.exam_id=p_exam_id
    ORDER BY er.class_position;
END;
$$;


--
-- Name: sp_get_exam_subjects(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_exam_subjects(p_exam_id integer) RETURNS TABLE(id integer, class_id integer, class_name character varying, class_section character varying, subject_id integer, subject_name character varying, teacher_id integer, invigilator_name text, subject_teacher_name text, total_marks numeric, passing_marks numeric, exam_date date, start_time time without time zone, duration_mins integer, venue character varying, marks_submitted boolean)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT es.id, es.class_id, c.name::VARCHAR, c.section::VARCHAR,
           es.subject_id, s.name::VARCHAR, es.teacher_id,
           CASE WHEN inv.id IS NULL THEN NULL
                ELSE (invu.first_name||' '||invu.last_name)::TEXT END,
           (SELECT (tu.first_name||' '||tu.last_name)::TEXT
            FROM teacher_subjects tsub
            JOIN teachers tt ON tt.id=tsub.teacher_id
            JOIN users tu ON tu.id=tt.user_id
            JOIN class_teachers ct ON ct.teacher_id=tsub.teacher_id AND ct.class_id=es.class_id
            WHERE tsub.subject_id=es.subject_id LIMIT 1),
           es.total_marks, es.passing_marks, es.exam_date, es.start_time,
           es.duration_mins, es.venue::VARCHAR, COALESCE(es.marks_submitted,FALSE)
    FROM exam_subjects es
    JOIN classes c ON c.id=es.class_id
    JOIN subjects s ON s.id=es.subject_id
    LEFT JOIN teachers inv ON inv.id=es.teacher_id
    LEFT JOIN users invu ON invu.id=inv.user_id
    WHERE es.exam_id=p_exam_id
    ORDER BY es.exam_date, c.name, s.name;
END;
$$;


--
-- Name: sp_get_exams(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_exams(p_class_id integer DEFAULT NULL::integer, p_year_id integer DEFAULT NULL::integer) RETURNS TABLE(id integer, name character varying, status character varying, start_date date, end_date date, exam_type_id integer, exam_type_name character varying, exam_type_code character varying, academic_year_id integer, academic_year_name character varying, created_by_name text, subjects_count bigint, class_count bigint, class_names text, created_at timestamp with time zone, datesheet_published boolean, datesheet_status character varying)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.name::VARCHAR, e.status::VARCHAR, e.start_date, e.end_date,
           e.exam_type_id, et.name::VARCHAR, et.code::VARCHAR,
           e.academic_year_id, ay.name::VARCHAR,
           (u.first_name||' '||u.last_name)::TEXT,
           COUNT(DISTINCT es.id),
           COUNT(DISTINCT ec.class_id),
           STRING_AGG(DISTINCT c.name||(CASE WHEN c.section IS NOT NULL AND c.section!='' THEN ' ('||c.section||')' ELSE '' END), ', ' ORDER BY c.name||(CASE WHEN c.section IS NOT NULL AND c.section!='' THEN ' ('||c.section||')' ELSE '' END)),
           e.created_at,
           COALESCE(e.datesheet_published, FALSE),
           COALESCE(e.datesheet_status, 'draft')::VARCHAR
    FROM exams e
    JOIN exam_types et ON et.id=e.exam_type_id
    JOIN academic_years ay ON ay.id=e.academic_year_id
    JOIN users u ON u.id=e.created_by
    LEFT JOIN exam_subjects es ON es.exam_id=e.id
    LEFT JOIN exam_classes ec ON ec.exam_id=e.id
    LEFT JOIN classes c ON c.id=ec.class_id
    WHERE (p_class_id IS NULL OR ec.class_id=p_class_id)
      AND (p_year_id IS NULL OR e.academic_year_id=p_year_id)
    GROUP BY e.id, et.name, et.code, ay.name, u.first_name, u.last_name
    ORDER BY e.created_at DESC;
END;
$$;


--
-- Name: sp_get_experience(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_experience(p_staff_id integer) RETURNS TABLE(id integer, staff_id integer, company character varying, designation character varying, from_date date, to_date date, is_current boolean, description text)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT e.id, e.staff_id, e.company, e.designation, e.from_date, e.to_date, e.is_current, e.description
    FROM staff_experience e WHERE e.staff_id=p_staff_id ORDER BY e.from_date DESC NULLS FIRST;
END;$$;


--
-- Name: sp_get_fee_charges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_fee_charges() RETURNS TABLE(id integer, name character varying, amount numeric, charge_type_id integer, apply_month smallint, apply_year integer, target_type character varying, academic_year_id integer, is_active boolean, description text, created_at timestamp with time zone, year_name character varying, charge_type_name character varying, recurrence character varying, interval_months smallint, class_ids integer[], class_labels text[], student_ids integer[], student_labels text[])
    LANGUAGE sql STABLE
    AS $$
    SELECT fc.id, fc.name, fc.amount, fc.charge_type_id,
           fc.apply_month, fc.apply_year, fc.target_type,
           fc.academic_year_id, fc.is_active, fc.description,
           fc.created_at, ay.name, ct.name, ct.recurrence, ct.interval_months,
           COALESCE(
               (SELECT array_agg(fcc.class_id ORDER BY c.name)
                FROM fee_charge_classes fcc
                JOIN classes c ON c.id = fcc.class_id
                WHERE fcc.charge_id = fc.id),
               ARRAY[]::INTEGER[]
           ) AS class_ids,
           COALESCE(
               (SELECT array_agg(c.name || COALESCE(' (' || c.section || ')', '') ORDER BY c.name)
                FROM fee_charge_classes fcc
                JOIN classes c ON c.id = fcc.class_id
                WHERE fcc.charge_id = fc.id),
               ARRAY[]::TEXT[]
           ) AS class_labels,
           COALESCE(
               (SELECT array_agg(fcs.student_id ORDER BY s.first_name, s.last_name)
                FROM fee_charge_students fcs
                JOIN students s ON s.id = fcs.student_id
                WHERE fcs.charge_id = fc.id),
               ARRAY[]::INTEGER[]
           ) AS student_ids,
           COALESCE(
               (SELECT array_agg(s.first_name || ' ' || s.last_name || ' (' || s.enrollment_no || ')' ORDER BY s.first_name, s.last_name)
                FROM fee_charge_students fcs
                JOIN students s ON s.id = fcs.student_id
                WHERE fcs.charge_id = fc.id),
               ARRAY[]::TEXT[]
           ) AS student_labels
    FROM fee_charges fc
    LEFT JOIN academic_years ay ON ay.id = fc.academic_year_id
    JOIN charge_type_definitions ct ON ct.id = fc.charge_type_id
    ORDER BY fc.name;
$$;


--
-- Name: sp_get_grade_components(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_grade_components(p_grade_id integer) RETURNS TABLE(id integer, component_id integer, component_name character varying, component_type character varying, calculation_type character varying, is_basic boolean, is_income_tax boolean, value numeric)
    LANGUAGE sql
    AS $$
    SELECT gc.id, c.id, c.name, c.component_type, c.calculation_type, c.is_basic, c.is_income_tax, gc.value
    FROM payroll_grade_components gc
    JOIN payroll_components c ON c.id = gc.component_id
    WHERE gc.grade_id = p_grade_id
    ORDER BY c.component_type, c.name;
$$;


--
-- Name: sp_get_grade_department_components(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_grade_department_components(p_grade_id integer, p_department_id integer) RETURNS TABLE(id integer, component_id integer, component_name character varying, component_type character varying, calculation_type character varying, is_basic boolean, is_income_tax boolean, value numeric)
    LANGUAGE sql
    AS $$
    SELECT gdc.id, c.id, c.name, c.component_type, c.calculation_type, c.is_basic, c.is_income_tax, gdc.value
    FROM payroll_grade_department_components gdc
    JOIN payroll_components c ON c.id = gdc.component_id
    WHERE gdc.grade_id = p_grade_id AND gdc.department_id = p_department_id
    ORDER BY c.component_type, c.name;
$$;


--
-- Name: sp_get_grn_detail(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_grn_detail(p_grn_id integer) RETURNS TABLE(id integer, grn_number character varying, po_id integer, po_number character varying, vendor_name character varying, received_by integer, received_by_name text, received_date date, status character varying, notes text, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT g.id, g.grn_number, g.po_id, po.po_number,
           v.name::VARCHAR, g.received_by,
           (u.first_name||' '||u.last_name)::TEXT,
           g.received_date, g.status::VARCHAR, g.notes, g.created_at
    FROM goods_receipt_notes g
    JOIN purchase_orders po ON po.id=g.po_id
    JOIN procurement_vendors v ON v.id=po.vendor_id
    JOIN users u ON u.id=g.received_by
    WHERE g.id=p_grn_id;
$$;


--
-- Name: sp_get_grns(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_grns(p_po_id integer DEFAULT NULL::integer) RETURNS TABLE(id integer, grn_number character varying, po_id integer, po_number character varying, vendor_name character varying, received_by integer, received_by_name text, received_date date, status character varying, notes text, created_at timestamp with time zone, item_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT g.id, g.grn_number, g.po_id, po.po_number,
           v.name::VARCHAR,
           g.received_by, (u.first_name||' '||u.last_name)::TEXT,
           g.received_date, g.status::VARCHAR, g.notes, g.created_at,
           COUNT(gi.id)
    FROM goods_receipt_notes g
    JOIN purchase_orders po ON po.id=g.po_id
    JOIN procurement_vendors v ON v.id=po.vendor_id
    JOIN users u ON u.id=g.received_by
    LEFT JOIN grn_items gi ON gi.grn_id=g.id
    WHERE (p_po_id IS NULL OR g.po_id=p_po_id)
    GROUP BY g.id, po.po_number, v.name, u.first_name, u.last_name
    ORDER BY g.created_at DESC;
$$;


--
-- Name: sp_get_holidays(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_holidays() RETURNS TABLE(event_date date, end_date date)
    LANGUAGE sql STABLE
    AS $$
    SELECT event_date, end_date FROM calendar_events WHERE is_holiday = TRUE ORDER BY event_date;
$$;


--
-- Name: sp_get_invoice_with_items(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_invoice_with_items(p_invoice_id integer) RETURNS TABLE(invoice_total numeric, net_amount numeric, invoice_status character varying, due_date date, month_year character varying, item_label character varying, item_type character varying, item_amount numeric)
    LANGUAGE sql STABLE
    AS $$
    SELECT fi.amount, fi.net_amount, fi.status, fi.due_date, fi.month_year,
           fii.label, fii.item_type, fii.amount
    FROM fee_invoices fi
    LEFT JOIN fee_invoice_items fii ON fii.invoice_id = fi.id
    WHERE fi.id = p_invoice_id
    ORDER BY fii.id;
$$;


--
-- Name: sp_get_leave_approval_rules(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_approval_rules(p_leave_type_id integer) RETURNS TABLE(id integer, day_from integer, day_to integer, recommender_role character varying, approver_role character varying, sort_order integer, certificate_required boolean, certificate_label character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, day_from, day_to, recommender_role, approver_role,
           sort_order, certificate_required, certificate_label
    FROM leave_approval_rules
    WHERE leave_type_id = p_leave_type_id
    ORDER BY sort_order, day_from;
$$;


--
-- Name: sp_get_leave_balance(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_balance(p_student_id integer, p_academic_year_id integer) RETURNS TABLE(leave_type_id integer, leave_type character varying, max_days integer, days_used integer, days_remaining integer, certificate_required boolean, certificate_label character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        lt.id,
        lt.name::VARCHAR,
        lt.max_days_per_year,
        COALESCE(lb.days_used, 0),
        CASE WHEN lt.max_days_per_year IS NULL THEN NULL
             ELSE lt.max_days_per_year - COALESCE(lb.days_used, 0) END,
        lt.certificate_required,
        lt.certificate_label
    FROM leave_types lt
    LEFT JOIN leave_balances lb ON lb.leave_type_id = lt.id
        AND lb.student_id = p_student_id
        AND lb.academic_year_id = p_academic_year_id
    WHERE lt.is_active = TRUE
    ORDER BY lt.name;
END;
$$;


--
-- Name: sp_get_leave_certificate_url(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_certificate_url(p_leave_id integer) RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT certificate_url FROM leave_requests WHERE id = p_leave_id;
$$;


--
-- Name: sp_get_leave_request_basic(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_request_basic(p_leave_id integer) RETURNS TABLE(student_id integer, leave_type_id integer, total_days integer, status character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT student_id, leave_type_id, total_days, status FROM leave_requests WHERE id = p_leave_id;
$$;


--
-- Name: sp_get_leave_request_dates(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_request_dates(p_leave_id integer) RETURNS TABLE(from_date date, to_date date)
    LANGUAGE sql STABLE
    AS $$
    SELECT from_date, to_date FROM leave_requests WHERE id = p_leave_id;
$$;


--
-- Name: sp_get_leave_request_notify_info(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_request_notify_info(p_leave_id integer) RETURNS TABLE(student_id integer, leave_type_id integer, student_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT lr.student_id, lr.leave_type_id, (u.first_name || ' ' || u.last_name)
    FROM leave_requests lr
    JOIN students s ON s.id = lr.student_id
    JOIN users u ON u.id = s.user_id
    WHERE lr.id = p_leave_id;
$$;


--
-- Name: sp_get_leave_requests(integer, integer, character varying, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_requests(p_viewer_id integer, p_student_id integer DEFAULT NULL::integer, p_status character varying DEFAULT NULL::character varying, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date) RETURNS TABLE(id integer, student_id integer, student_name character varying, enrollment_no character varying, class_name character varying, class_section character varying, leave_type character varying, from_date date, to_date date, total_days integer, reason text, certificate_url character varying, status character varying, applied_by_name character varying, applied_at timestamp with time zone, recommender_name character varying, recommended_at timestamp with time zone, recommender_note text, approver_name character varying, approved_at timestamp with time zone, approver_note text, rejection_reason text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        lr.id,
        lr.student_id,
        (u.first_name || ' ' || u.last_name)::VARCHAR,
        s.enrollment_no,
        c.name::VARCHAR,
        c.section::VARCHAR,
        lt.name::VARCHAR,
        lr.from_date, lr.to_date, lr.total_days,
        lr.reason, lr.certificate_url, lr.status,
        (au.first_name || ' ' || au.last_name)::VARCHAR,
        lr.applied_at,
        (ru.first_name || ' ' || ru.last_name)::VARCHAR,
        lr.recommended_at, lr.recommender_note,
        (appu.first_name || ' ' || appu.last_name)::VARCHAR,
        lr.approved_at, lr.approver_note, lr.rejection_reason
    FROM leave_requests lr
    JOIN students s ON s.id = lr.student_id
    JOIN users u ON u.id = s.user_id
    JOIN classes c ON c.id = s.class_id
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    JOIN users au ON au.id = lr.applied_by
    LEFT JOIN users ru ON ru.id = lr.recommended_by
    LEFT JOIN users appu ON appu.id = lr.approved_by
    WHERE (p_student_id IS NULL OR lr.student_id = p_student_id)
      AND (p_status IS NULL OR lr.status = p_status)
      AND (p_from_date IS NULL OR lr.from_date >= p_from_date)
      AND (p_to_date IS NULL OR lr.to_date <= p_to_date)
    ORDER BY lr.applied_at DESC;
END;
$$;


--
-- Name: sp_get_leave_type_id_for_request(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_type_id_for_request(p_leave_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT leave_type_id FROM leave_requests WHERE id = p_leave_id;
$$;


--
-- Name: sp_get_leave_type_notify_mode(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_leave_type_notify_mode(p_leave_id integer) RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT lt.notify_mode FROM leave_types lt
    JOIN leave_requests lr ON lr.leave_type_id = lt.id
    WHERE lr.id = p_leave_id;
$$;


--
-- Name: sp_get_locked_accounts(integer, character varying, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_locked_accounts(p_class_id integer DEFAULT NULL::integer, p_student character varying DEFAULT NULL::character varying, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date) RETURNS TABLE(user_id integer, student_id integer, first_name text, last_name text, enrollment_no text, class_name text, class_section text, invoice_id integer, invoice_no text, due_date date, days_overdue integer, amount numeric, fine numeric, net_amount numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id::INTEGER,
        s.id::INTEGER,
        s.first_name::TEXT,
        s.last_name::TEXT,
        s.enrollment_no::TEXT,
        c.name::TEXT,
        c.section::TEXT,
        fi.id::INTEGER,
        fi.invoice_no::TEXT,
        fi.due_date,
        (CURRENT_DATE - fi.due_date)::INTEGER AS days_overdue,
        fi.amount,
        fi.fine,
        fi.net_amount
    FROM users u
    JOIN students s ON s.user_id = u.id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN LATERAL (
        SELECT fi2.id, fi2.invoice_no, fi2.due_date, fi2.amount, fi2.fine, fi2.net_amount
        FROM fee_invoices fi2
        WHERE fi2.student_id = s.id AND fi2.status NOT IN ('paid', 'cancelled')
        ORDER BY fi2.due_date ASC
        LIMIT 1
    ) fi ON TRUE
    WHERE u.lock_reason = 'fee_overdue'
      AND (p_class_id IS NULL OR s.class_id = p_class_id)
      AND (p_student IS NULL OR s.first_name ILIKE '%' || p_student || '%'
           OR s.last_name ILIKE '%' || p_student || '%'
           OR s.enrollment_no ILIKE '%' || p_student || '%'
           OR (s.first_name || ' ' || s.last_name) ILIKE '%' || p_student || '%')
      AND (p_from_date IS NULL OR fi.due_date >= p_from_date)
      AND (p_to_date IS NULL OR fi.due_date <= p_to_date)
    ORDER BY days_overdue DESC NULLS LAST;
END;
$$;


--
-- Name: sp_get_lost_copies(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_lost_copies() RETURNS TABLE(copy_id integer, book_id integer, book_title text, accession_no character varying, barcode character varying, purchase_price numeric, last_returned_at timestamp with time zone, member_id integer, first_name text, last_name text, fine_amount numeric, fine_status character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        bc.id, bc.book_id, b.title::TEXT, bc.accession_no, bc.barcode, bc.purchase_price,
        it.returned_at, it.member_id, u.first_name::TEXT, u.last_name::TEXT,
        it.fine_amount, it.fine_status
    FROM library_book_copies bc
    JOIN library_books b ON b.id = bc.book_id
    LEFT JOIN LATERAL (
        SELECT * FROM library_issue_transactions t
        WHERE t.copy_id = bc.id AND t.return_condition = 'lost'
        ORDER BY t.returned_at DESC LIMIT 1
    ) it ON TRUE
    LEFT JOIN library_members lm ON lm.id = it.member_id
    LEFT JOIN users u ON u.id = lm.user_id
    WHERE bc.status = 'lost'
    ORDER BY it.returned_at DESC NULLS LAST;
$$;


--
-- Name: sp_get_matching_leave_rule(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_matching_leave_rule(p_leave_type_id integer, p_total_days integer) RETURNS TABLE(recommender_role character varying, approver_role character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT recommender_role, approver_role
    FROM leave_approval_rules
    WHERE leave_type_id = p_leave_type_id
      AND day_from <= p_total_days
      AND (day_to IS NULL OR day_to >= p_total_days)
    ORDER BY day_from DESC LIMIT 1;
$$;


--
-- Name: study_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_materials (
    id integer NOT NULL,
    class_id integer NOT NULL,
    subject_id integer NOT NULL,
    teacher_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    file_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_type character varying(50),
    file_size integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: sp_get_material_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_material_by_id(p_id integer) RETURNS SETOF public.study_materials
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM study_materials WHERE id = p_id;
$$;


--
-- Name: sp_get_material_for_delete(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_material_for_delete(p_id integer) RETURNS TABLE(id integer, file_path character varying, teacher_id integer, uploader_user_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT sm.id, sm.file_path, sm.teacher_id, t.user_id
    FROM study_materials sm JOIN teachers t ON t.id = sm.teacher_id
    WHERE sm.id = p_id;
$$;


--
-- Name: library_membership_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_membership_rules (
    id integer NOT NULL,
    member_type character varying(20) NOT NULL,
    max_books integer DEFAULT 2 NOT NULL,
    borrow_days integer DEFAULT 7 NOT NULL,
    renewal_limit integer DEFAULT 1 NOT NULL,
    fine_per_day numeric(10,2) DEFAULT 10 NOT NULL,
    CONSTRAINT library_membership_rules_member_type_check CHECK (((member_type)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'superadmin'::character varying, 'admin'::character varying, 'principal'::character varying, 'librarian'::character varying, 'hr'::character varying, 'finance_officer'::character varying, 'procurement'::character varying, 'academic_coordinator'::character varying])::text[])))
);


--
-- Name: sp_get_membership_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_membership_rules() RETURNS SETOF public.library_membership_rules
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM library_membership_rules ORDER BY member_type;
$$;


--
-- Name: sp_get_missing_copies(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_missing_copies() RETURNS TABLE(copy_id integer, book_id integer, book_title text, accession_no character varying, barcode character varying, shelf character varying, rack character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT bc.id, b.id, b.title::TEXT, bc.accession_no, bc.barcode, b.shelf, b.rack
    FROM library_book_copies bc
    JOIN library_books b ON b.id = bc.book_id
    WHERE bc.status = 'missing'
    ORDER BY b.title;
$$;


--
-- Name: sp_get_my_attendance_summary(integer, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_attendance_summary(p_student_id integer, p_from date, p_to date, p_subject_id integer) RETURNS TABLE(total bigint, present bigint, absent bigint, late bigint, excused bigint, on_leave bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status='present'),
           COUNT(*) FILTER (WHERE status='absent'),
           COUNT(*) FILTER (WHERE status='late'),
           COUNT(*) FILTER (WHERE status='excused'),
           COUNT(*) FILTER (WHERE status='on_leave')
    FROM attendance
    WHERE student_id = p_student_id AND date BETWEEN p_from AND p_to
      AND (p_subject_id IS NULL OR subject_id = p_subject_id);
$$;


--
-- Name: sp_get_my_children_for_leave(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_children_for_leave(p_user_id integer) RETURNS TABLE(id integer, enrollment_no character varying, name text, class_name character varying, class_section character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.enrollment_no, (s.first_name || ' ' || s.last_name), c.name, c.section
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE s.parent_id = p_user_id AND s.status = 'active'
    ORDER BY s.first_name;
$$;


--
-- Name: sp_get_my_classes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_classes(p_user_id integer) RETURNS TABLE(id integer, name character varying, section character varying, class_type character varying, is_primary boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT c.id, c.name, c.section, c.class_type, ct.is_primary
    FROM class_teachers ct
    JOIN classes c ON c.id = ct.class_id
    JOIN teachers t ON t.id = ct.teacher_id
    WHERE t.user_id = p_user_id
    ORDER BY ct.is_primary DESC, c.name, c.section;
$$;


--
-- Name: sp_get_my_profile(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_profile(p_user_id integer) RETURNS TABLE(id integer, first_name character varying, last_name character varying, email character varying, phone character varying, is_active boolean, is_verified boolean, last_login_at timestamp with time zone, created_at timestamp without time zone, roles text[])
    LANGUAGE sql STABLE
    AS $$
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
           u.is_active, u.is_verified, u.last_login_at, u.created_at,
           ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL)
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id = p_user_id
    GROUP BY u.id;
$$;


--
-- Name: sp_get_my_signature(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_signature(p_user_id integer) RETURNS TABLE(signature text, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT signature, updated_at FROM user_signatures WHERE user_id = p_user_id;
$$;


--
-- Name: sp_get_my_subjects(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_subjects(p_user_id integer) RETURNS TABLE(id integer, name character varying, code character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT s.id, s.name, s.code
    FROM teacher_subjects ts
    JOIN subjects s ON s.id = ts.subject_id
    JOIN teachers t ON t.id = ts.teacher_id
    WHERE t.user_id = p_user_id
    ORDER BY s.name;
$$;


--
-- Name: sp_get_my_teacher_assignments(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_teacher_assignments(p_teacher_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, title character varying, description text, due_date date, total_marks numeric, status character varying, created_at timestamp with time zone, file_name character varying, file_path character varying, file_type character varying, file_size bigint, subject_name character varying, class_name character varying, section character varying, submission_count bigint, graded_count bigint, total_students bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.id, a.class_id, a.subject_id, a.teacher_id, a.title, a.description,
           a.due_date, a.total_marks, a.status, a.created_at,
           a.file_name, a.file_path, a.file_type, a.file_size,
           s.name, c.name, c.section,
           (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id),
           (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id AND marks IS NOT NULL),
           (SELECT COUNT(*) FROM students WHERE class_id = a.class_id AND status = 'active')
    FROM assignments a
    JOIN subjects s ON s.id = a.subject_id
    JOIN classes c ON c.id = a.class_id
    WHERE a.teacher_id = p_teacher_id
    ORDER BY a.due_date DESC;
$$;


--
-- Name: sp_get_my_teacher_quizzes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_my_teacher_quizzes(p_teacher_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, title character varying, description text, due_date timestamp with time zone, total_marks integer, status character varying, created_at timestamp with time zone, subject_name character varying, class_name character varying, section character varying, question_count bigint, submission_count bigint, total_students bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT q.id, q.class_id, q.subject_id, q.title, q.description,
           q.due_date, q.total_marks, q.status, q.created_at,
           s.name, c.name, c.section,
           (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id),
           (SELECT COUNT(*) FROM quiz_submissions WHERE quiz_id = q.id),
           (SELECT COUNT(*) FROM students WHERE class_id = q.class_id AND status = 'active')
    FROM quizzes q
    JOIN subjects s ON s.id = q.subject_id
    JOIN classes c ON c.id = q.class_id
    WHERE q.teacher_id = p_teacher_id
    ORDER BY q.due_date DESC;
$$;


--
-- Name: sp_get_next_topic_order(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_next_topic_order(p_syllabus_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(MAX(sort_order), 0) + 1 FROM syllabus_topics WHERE syllabus_id = p_syllabus_id;
$$;


--
-- Name: sp_get_parent_children_ids(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_parent_children_ids(p_parent_user_id integer) RETURNS TABLE(student_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT id FROM students WHERE parent_id=p_parent_user_id;
$$;


--
-- Name: sp_get_parent_waiver_requests(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_parent_waiver_requests(p_withdrawal_id integer) RETURNS TABLE(id integer, invoice_id integer, waiver_type character varying, waiver_amount numeric, reason text, status character varying, requested_at timestamp with time zone, actioned_at timestamp with time zone, action_note text, requester_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT ww.id, ww.invoice_id, ww.waiver_type, ww.waiver_amount, ww.reason,
           ww.status, ww.requested_at, ww.actioned_at, ww.action_note,
           (ru.first_name || ' ' || ru.last_name)
    FROM withdrawal_waivers ww
    LEFT JOIN users ru ON ru.id = ww.requested_by
    WHERE ww.withdrawal_id = p_withdrawal_id
    ORDER BY ww.requested_at DESC;
$$;


--
-- Name: sp_get_password_hash_for_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_password_hash_for_user(p_user_id integer) RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT password_hash FROM users WHERE id = p_user_id;
$$;


--
-- Name: sp_get_pending_diary_teachers(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_pending_diary_teachers(p_class_id integer, p_date date) RETURNS TABLE(teacher_id integer, name text, subject_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT tt.teacher_id, (t2.first_name || ' ' || t2.last_name), s.name
    FROM timetable tt
    JOIN teachers t2 ON t2.id = tt.teacher_id
    JOIN subjects s ON s.id = tt.subject_id
    WHERE tt.class_id = p_class_id
      AND NOT EXISTS (
          SELECT 1 FROM daily_diary dd
          WHERE dd.class_id = tt.class_id AND dd.teacher_id = tt.teacher_id
            AND dd.date = p_date AND dd.status = 'submitted'
      );
$$;


--
-- Name: pr_approval_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_approval_instances (
    id integer NOT NULL,
    pr_id integer NOT NULL,
    step_order integer NOT NULL,
    approver_role character varying(50) NOT NULL,
    resolved_approver_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    acted_by integer,
    acted_at timestamp with time zone,
    notes text,
    CONSTRAINT pr_approval_instances_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: pr_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_items (
    id integer NOT NULL,
    pr_id integer NOT NULL,
    item_id integer,
    item_description character varying(200) NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit character varying(30) NOT NULL,
    estimated_unit_price numeric(14,2),
    remarks text,
    category_id integer,
    specifications jsonb
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(150),
    password_hash character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    first_name character varying(100) DEFAULT ''::character varying NOT NULL,
    last_name character varying(100) DEFAULT ''::character varying NOT NULL,
    phone character varying(20),
    profile_photo text,
    is_verified boolean DEFAULT false NOT NULL,
    last_login_at timestamp with time zone,
    lock_reason character varying(50),
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    theme_preference character varying DEFAULT 'indigo'::character varying
);


--
-- Name: vw_purchase_requisitions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_purchase_requisitions AS
 SELECT pr.id,
    pr.pr_number,
    pr.requested_by,
    (((ru.first_name)::text || ' '::text) || (ru.last_name)::text) AS requested_by_name,
    pr.department_id,
    d.name AS department_name,
    pr.priority,
    pr.is_emergency,
    pr.budget_head,
    pr.remarks,
    pr.status,
    pr.matched_rule_id,
    ar.name AS matched_rule_name,
    pr.total_estimated_amount,
    pr.submitted_at,
    pr.created_at,
    ( SELECT count(*) AS count
           FROM public.pr_items
          WHERE (pr_items.pr_id = pr.id)) AS item_count,
    ( SELECT pai.approver_role
           FROM public.pr_approval_instances pai
          WHERE ((pai.pr_id = pr.id) AND ((pai.status)::text = 'pending'::text))
          ORDER BY pai.step_order
         LIMIT 1) AS current_step_role,
    ( SELECT pai.step_order
           FROM public.pr_approval_instances pai
          WHERE ((pai.pr_id = pr.id) AND ((pai.status)::text = 'pending'::text))
          ORDER BY pai.step_order
         LIMIT 1) AS current_step_order,
    ( SELECT count(*) AS count
           FROM public.pr_approval_instances
          WHERE (pr_approval_instances.pr_id = pr.id)) AS total_steps
   FROM (((public.purchase_requisitions pr
     JOIN public.users ru ON ((ru.id = pr.requested_by)))
     LEFT JOIN public.departments d ON ((d.id = pr.department_id)))
     LEFT JOIN public.procurement_approval_rules ar ON ((ar.id = pr.matched_rule_id)))
  ORDER BY pr.created_at DESC;


--
-- Name: sp_get_pending_my_approval(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_pending_my_approval(p_user_id integer) RETURNS SETOF public.vw_purchase_requisitions
    LANGUAGE sql STABLE
    AS $$
    SELECT pr.*
    FROM vw_purchase_requisitions pr
    JOIN pr_approval_instances pai
        ON pai.pr_id = pr.id AND pai.step_order = pr.current_step_order AND pai.status = 'pending'
    WHERE pr.status = 'submitted'
      AND (
          (pai.approver_role = 'department_head' AND pai.resolved_approver_id = p_user_id)
          OR (pai.approver_role != 'department_head' AND EXISTS (
              SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p_user_id AND r.name = pai.approver_role
          ))
      );
$$;


--
-- Name: sp_get_pending_stock_grns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_pending_stock_grns() RETURNS TABLE(id integer, grn_number character varying, po_number character varying, vendor_name character varying, received_date date, received_by_name text, item_count bigint, confirmed_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT g.id, g.grn_number, po.po_number, v.name::VARCHAR,
           g.received_date, (u.first_name||' '||u.last_name)::TEXT,
           COUNT(gi.id), g.created_at
    FROM goods_receipt_notes g
    JOIN purchase_orders po ON po.id = g.po_id
    JOIN procurement_vendors v ON v.id = po.vendor_id
    JOIN users u ON u.id = g.received_by
    LEFT JOIN grn_items gi ON gi.grn_id = g.id
    WHERE g.status = 'confirmed' AND g.stock_updated = FALSE
    GROUP BY g.id, po.po_number, v.name, u.first_name, u.last_name
    ORDER BY g.created_at DESC;
$$;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    code character varying(100) NOT NULL,
    description text,
    module character varying(50),
    action character varying(50)
);


--
-- Name: sp_get_permission_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_permission_by_id(p_id integer) RETURNS SETOF public.permissions
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM permissions WHERE id = p_id;
$$;


--
-- Name: sp_get_principals_admins(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_principals_admins() RETURNS TABLE(id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT u.id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name IN ('principal','admin') AND u.is_active = TRUE;
$$;


--
-- Name: sp_get_public_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_public_settings() RETURNS TABLE(key text, value text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT s.key::TEXT, s.value::TEXT
    FROM system_settings s
    WHERE s.key IN ('school_name','school_logo','school_address','school_tagline','school_phone','school_email');
END;
$$;


--
-- Name: sp_get_publishers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_publishers() RETURNS SETOF public.library_publishers
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM library_publishers WHERE is_active ORDER BY name;
$$;


--
-- Name: sp_get_quiz_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_quiz_by_id(p_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, title character varying, description text, due_date timestamp with time zone, total_marks integer, status character varying, created_at timestamp with time zone, subject_name character varying, class_name character varying, section character varying, teacher_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT q.id, q.class_id, q.subject_id, q.teacher_id, q.title, q.description,
           q.due_date, q.total_marks, q.status, q.created_at,
           s.name, c.name, c.section, (t.first_name || ' ' || t.last_name)
    FROM quizzes q
    JOIN subjects s ON s.id = q.subject_id
    JOIN classes c ON c.id = q.class_id
    JOIN teachers t ON t.id = q.teacher_id
    WHERE q.id = p_id;
$$;


--
-- Name: sp_get_quiz_not_submitted(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_quiz_not_submitted(p_class_id integer, p_quiz_id integer) RETURNS TABLE(student_id integer, student_name text, enrollment_no character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, (s.first_name || ' ' || s.last_name), s.enrollment_no
    FROM students s
    WHERE s.class_id = p_class_id AND s.status = 'active'
      AND s.id NOT IN (SELECT student_id FROM quiz_submissions WHERE quiz_id = p_quiz_id);
$$;


--
-- Name: sp_get_quiz_questions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_quiz_questions(p_quiz_id integer) RETURNS TABLE(id integer, question text, option_a character varying, option_b character varying, option_c character varying, option_d character varying, multi_select boolean, marks integer, order_no integer, correct character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, question, option_a, option_b, option_c, option_d, multi_select, marks, order_no, correct
    FROM quiz_questions WHERE quiz_id = p_quiz_id ORDER BY order_no;
$$;


--
-- Name: sp_get_quiz_results(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_quiz_results(p_quiz_id integer) RETURNS TABLE(id integer, student_id integer, marks integer, total_marks integer, percentage numeric, submitted_at timestamp with time zone, answers jsonb, student_name text, enrollment_no character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT qs.id, qs.student_id, qs.marks, qs.total_marks, qs.percentage,
           qs.submitted_at, qs.answers,
           (s.first_name || ' ' || s.last_name), s.enrollment_no
    FROM quiz_submissions qs
    JOIN students s ON s.id = qs.student_id
    WHERE qs.quiz_id = p_quiz_id
    ORDER BY qs.marks DESC;
$$;


--
-- Name: quiz_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_submissions (
    id integer NOT NULL,
    quiz_id integer NOT NULL,
    student_id integer NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    marks integer DEFAULT 0,
    total_marks integer DEFAULT 0,
    percentage numeric(5,2) DEFAULT 0,
    submitted_at timestamp without time zone DEFAULT now()
);


--
-- Name: sp_get_quiz_submission(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_quiz_submission(p_quiz_id integer, p_student_id integer) RETURNS SETOF public.quiz_submissions
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM quiz_submissions WHERE quiz_id = p_quiz_id AND student_id = p_student_id;
$$;


--
-- Name: sp_get_role_permissions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_role_permissions(p_role_id integer) RETURNS TABLE(id integer, code character varying, module character varying, action character varying, description text)
    LANGUAGE sql STABLE
    AS $$
    SELECT p.id, p.code, p.module, p.action, p.description
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = p_role_id
    ORDER BY p.module, p.action;
$$;


--
-- Name: sp_get_roles_by_department(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_roles_by_department(p_department_id integer) RETURNS TABLE(id integer, name character varying)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT r.id, r.name FROM department_roles dr
    JOIN roles r ON r.id=dr.role_id
    WHERE dr.department_id=p_department_id
    ORDER BY r.name;
END;$$;


--
-- Name: sp_get_school_timing_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_school_timing_settings() RETURNS TABLE(key character varying, value text)
    LANGUAGE sql STABLE
    AS $$
    SELECT key, value FROM system_settings WHERE category IN ('school_timing','fee_settings');
$$;


--
-- Name: sp_get_settings_by_category(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_settings_by_category(p_category character varying) RETURNS TABLE(key text, value text, description text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT s.key::TEXT, s.value::TEXT, s.description::TEXT
    FROM system_settings s
    WHERE s.category = p_category
    ORDER BY s.key;
END;
$$;


--
-- Name: sp_get_sibling_rank(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_sibling_rank(p_student_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_parent_id INTEGER;
    v_method VARCHAR;
    v_rank INTEGER;
BEGIN
    SELECT parent_id INTO v_parent_id FROM students WHERE id = p_student_id;
    IF v_parent_id IS NULL THEN
        RETURN 1;
    END IF;

    SELECT sibling_rank_method INTO v_method FROM discount_apply_config WHERE id = 1;
    IF v_method IS NULL THEN v_method := 'class'; END IF;

    IF v_method = 'registration_no' THEN
        SELECT rnk INTO v_rank FROM (
            SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.enrollment_no ASC) AS rnk
            FROM students s
            WHERE s.parent_id = v_parent_id AND s.status = 'active'
        ) sub WHERE sub.id = p_student_id;

    ELSIF v_method = 'dob' THEN
        SELECT rnk INTO v_rank FROM (
            SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.date_of_birth ASC NULLS LAST, s.enrollment_no ASC) AS rnk
            FROM students s
            WHERE s.parent_id = v_parent_id AND s.status = 'active'
        ) sub WHERE sub.id = p_student_id;

    ELSE
        SELECT rnk INTO v_rank FROM (
            SELECT s.id, ROW_NUMBER() OVER (ORDER BY COALESCE(c.level, 0) DESC, s.enrollment_no ASC) AS rnk
            FROM students s
            LEFT JOIN classes c ON c.id = s.class_id
            WHERE s.parent_id = v_parent_id AND s.status = 'active'
        ) sub WHERE sub.id = p_student_id;
    END IF;

    RETURN COALESCE(v_rank, 1);
END;
$$;


--
-- Name: sp_get_staff(integer, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff(p_department_id integer DEFAULT NULL::integer, p_status character varying DEFAULT NULL::character varying, p_employment_type character varying DEFAULT NULL::character varying, p_search character varying DEFAULT NULL::character varying) RETURNS TABLE(id integer, user_id integer, employee_code character varying, first_name character varying, last_name character varying, gender character varying, phone character varying, designation_name character varying, department_name character varying, employment_type character varying, joining_date date, salary numeric, status character varying, email character varying)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT s.id, s.user_id, s.employee_code, s.first_name, s.last_name,
           s.gender, s.phone, d.name::VARCHAR, dep.name::VARCHAR,
           s.employment_type, s.joining_date, s.salary, s.status, u.email
    FROM staff s
    LEFT JOIN designations d ON d.id=s.designation_id
    LEFT JOIN departments dep ON dep.id=s.department_id
    LEFT JOIN users u ON u.id=s.user_id
    WHERE (p_department_id IS NULL OR s.department_id=p_department_id)
      AND (p_status IS NULL OR s.status=p_status)
      AND (p_employment_type IS NULL OR s.employment_type=p_employment_type)
      AND (p_search IS NULL OR (s.first_name||' '||s.last_name) ILIKE ('%'||p_search||'%') OR s.employee_code ILIKE ('%'||p_search||'%'))
    ORDER BY s.first_name, s.last_name;
END;$$;


--
-- Name: sp_get_staff_by_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_by_user(p_user_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$DECLARE v_id INT;
BEGIN
    SELECT id INTO v_id FROM staff WHERE user_id=p_user_id;
    IF v_id IS NULL THEN
        INSERT INTO staff(user_id, first_name, last_name, created_by)
        SELECT p_user_id, first_name, last_name, p_user_id FROM users WHERE id=p_user_id
        RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END;$$;


--
-- Name: sp_get_staff_department_head(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_department_head(p_user_id integer) RETURNS TABLE(department_id integer, department_name character varying, is_head boolean)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT d.id, d.name::VARCHAR, (d.head_user_id=p_user_id) AS is_head
    FROM staff s
    JOIN departments d ON d.id=s.department_id
    WHERE s.user_id=p_user_id;
END;$$;


--
-- Name: sp_get_staff_detail(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_detail(p_staff_id integer) RETURNS TABLE(id integer, user_id integer, employee_code character varying, first_name character varying, last_name character varying, gender character varying, date_of_birth date, cnic character varying, phone character varying, address text, designation_id integer, designation_name character varying, department_id integer, department_name character varying, employment_type character varying, joining_date date, contract_end_date date, salary numeric, status character varying, profile_photo character varying, email character varying, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT s.id, s.user_id, s.employee_code, s.first_name, s.last_name,
           s.gender, s.date_of_birth, s.cnic, s.phone, s.address,
           s.designation_id, d.name::VARCHAR, s.department_id, dep.name::VARCHAR,
           s.employment_type, s.joining_date, s.contract_end_date, s.salary,
           s.status, s.profile_photo, u.email, s.created_at
    FROM staff s
    LEFT JOIN designations d ON d.id=s.designation_id
    LEFT JOIN departments dep ON dep.id=s.department_id
    LEFT JOIN users u ON u.id=s.user_id
    WHERE s.id=p_staff_id;
END;$$;


--
-- Name: sp_get_staff_documents(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_documents(p_staff_id integer) RETURNS TABLE(id integer, doc_type character varying, doc_name character varying, file_path character varying, uploaded_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT sd.id, sd.doc_type, sd.doc_name, sd.file_path, sd.uploaded_at
    FROM staff_documents sd WHERE sd.staff_id=p_staff_id ORDER BY sd.uploaded_at DESC;
END;$$;


--
-- Name: sp_get_staff_leave_balances(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_leave_balances(p_year integer DEFAULT NULL::integer) RETURNS TABLE(id integer, user_id integer, staff_name text, role_name character varying, leave_type_id integer, leave_type_name character varying, year integer, total_days numeric, used_days numeric, carried_days numeric, remaining_days numeric)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT slb.id, slb.user_id, (u.first_name||' '||u.last_name)::TEXT,
        r.name::VARCHAR, slb.leave_type_id, lt.name::VARCHAR,
        slb.year, slb.total_days, slb.used_days, slb.carried_days,
        (slb.total_days + slb.carried_days - slb.used_days)
    FROM staff_leave_balances slb
    JOIN users u ON u.id=slb.user_id
    JOIN user_roles ur ON ur.user_id=slb.user_id
    JOIN roles r ON r.id=ur.role_id
    JOIN leave_types lt ON lt.id=slb.leave_type_id
    WHERE (p_year IS NULL OR slb.year=p_year)
      AND r.name NOT IN ('student','parent')
    ORDER BY u.first_name, lt.name;
END;$$;


--
-- Name: sp_get_staff_leave_policies(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_leave_policies(p_leave_type_id integer DEFAULT NULL::integer) RETURNS TABLE(id integer, leave_type_id integer, leave_type_name character varying, role_id integer, role_name character varying, department_id integer, department_name character varying, days_per_year numeric, carry_forward numeric, is_paid boolean, applies_to character varying, gender character varying, is_active boolean)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT slp.id, slp.leave_type_id, lt.name::VARCHAR, slp.role_id, r.name::VARCHAR,
        slp.department_id, d.name::VARCHAR, slp.days_per_year, slp.carry_forward,
        slp.is_paid, slp.applies_to, slp.gender, slp.is_active
    FROM staff_leave_policies slp
    JOIN leave_types lt ON lt.id=slp.leave_type_id
    LEFT JOIN roles r ON r.id=slp.role_id
    LEFT JOIN departments d ON d.id=slp.department_id
    WHERE (p_leave_type_id IS NULL OR slp.leave_type_id=p_leave_type_id)
    ORDER BY lt.name, r.name;
END;$$;


--
-- Name: sp_get_staff_leave_requests(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_leave_requests(p_status character varying DEFAULT NULL::character varying, p_year integer DEFAULT NULL::integer) RETURNS TABLE(id integer, user_id integer, staff_name text, role_name character varying, leave_type_name character varying, from_date date, to_date date, total_days numeric, reason text, status character varying, applied_at timestamp with time zone, review_note text, duration_type character varying, half_day_from_time time without time zone, half_day_to_time time without time zone)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT slr.id, slr.user_id, (u.first_name||' '||u.last_name)::TEXT,
        r.name::VARCHAR, lt.name::VARCHAR, slr.from_date, slr.to_date, slr.total_days,
        slr.reason, slr.status, slr.applied_at, slr.review_note,
        slr.duration_type::VARCHAR, slr.half_day_from_time, slr.half_day_to_time
    FROM staff_leave_requests slr
    JOIN users u ON u.id=slr.user_id
    JOIN user_roles ur ON ur.user_id=slr.user_id
    JOIN roles r ON r.id=ur.role_id
    JOIN leave_types lt ON lt.id=slr.leave_type_id
    WHERE (p_status IS NULL OR slr.status=p_status)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM slr.from_date)::INT=p_year)
      AND r.name NOT IN ('student','parent')
    ORDER BY slr.applied_at DESC;
END;$$;


--
-- Name: sp_get_staff_leave_rules(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_leave_rules(p_leave_type_id integer DEFAULT NULL::integer) RETURNS TABLE(id integer, leave_type_id integer, leave_type_name character varying, day_from integer, day_to integer, recommender_role character varying, approver_role character varying, certificate_required boolean, certificate_after_days integer, sort_order integer)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT slr.id, slr.leave_type_id, lt.name::VARCHAR,
        slr.day_from, slr.day_to, slr.recommender_role, slr.approver_role,
        slr.certificate_required, slr.certificate_after_days, slr.sort_order
    FROM staff_leave_rules slr
    JOIN leave_types lt ON lt.id=slr.leave_type_id
    WHERE (p_leave_type_id IS NULL OR slr.leave_type_id=p_leave_type_id)
      AND slr.is_active=true
    ORDER BY slr.leave_type_id, slr.sort_order, slr.day_from;
END;$$;


--
-- Name: sp_get_staff_leave_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_leave_types() RETURNS TABLE(id integer, name character varying, max_days_per_year integer, certificate_required boolean, is_active boolean, policy_count bigint)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT lt.id, lt.name, lt.max_days_per_year, lt.certificate_required,
        lt.is_active, COUNT(slp.id)
    FROM leave_types lt
    LEFT JOIN staff_leave_policies slp ON slp.leave_type_id=lt.id
    WHERE lt.is_active=true
    GROUP BY lt.id ORDER BY lt.name;
END;$$;


--
-- Name: sp_get_staff_payroll_profile(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_payroll_profile(p_staff_id integer) RETURNS TABLE(staff_id integer, salary_type character varying, lump_sum_amount numeric, basic_salary numeric, grade_id integer, grade_name character varying, hourly_rate numeric, daily_wage_amount numeric)
    LANGUAGE sql
    AS $$
    SELECT p_staff_id, COALESCE(spp.salary_type, 'structured'), spp.lump_sum_amount, spp.basic_salary,
        spp.grade_id, g.name, spp.hourly_rate, spp.daily_wage_amount
    FROM (SELECT p_staff_id AS sid) x
    LEFT JOIN staff_payroll_profile spp ON spp.staff_id = p_staff_id
    LEFT JOIN payroll_grades g ON g.id = spp.grade_id;
$$;


--
-- Name: sp_get_staff_profile(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_staff_profile(p_staff_id integer) RETURNS TABLE(id integer, user_id integer, employee_code character varying, first_name character varying, last_name character varying, gender character varying, date_of_birth date, cnic character varying, phone character varying, address text, designation_id integer, designation_name character varying, department_id integer, department_name character varying, employment_type character varying, joining_date date, contract_end_date date, salary numeric, status character varying, profile_photo character varying, email character varying, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY SELECT s.id, s.user_id, s.employee_code, s.first_name, s.last_name,
        s.gender, s.date_of_birth, s.cnic, s.phone, s.address,
        s.designation_id, d.name::VARCHAR, s.department_id, dep.name::VARCHAR,
        s.employment_type, s.joining_date, s.contract_end_date, s.salary,
        s.status, s.profile_photo, u.email, s.created_at
    FROM staff s
    LEFT JOIN designations d ON d.id=s.designation_id
    LEFT JOIN departments dep ON dep.id=s.department_id
    LEFT JOIN users u ON u.id=s.user_id
    WHERE s.id=p_staff_id;
END;$$;


--
-- Name: sp_get_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_stock() RETURNS TABLE(id integer, item_code character varying, item_name character varying, unit character varying, category_id integer, category_name character varying, current_stock integer, min_stock integer, max_stock integer, is_active boolean, stock_status character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT pi.id, pi.item_code, pi.item_name, pi.unit,
           pi.category_id, pc.name::VARCHAR,
           COALESCE(pi.current_stock, 0),
           pi.min_stock, pi.max_stock, pi.is_active,
           CASE
               WHEN COALESCE(pi.current_stock,0) = 0        THEN 'out_of_stock'
               WHEN COALESCE(pi.current_stock,0) <= COALESCE(pi.min_stock,0) THEN 'low_stock'
               WHEN pi.max_stock IS NOT NULL AND COALESCE(pi.current_stock,0) >= pi.max_stock THEN 'overstocked'
               ELSE 'in_stock'
           END::VARCHAR
    FROM procurement_items pi
    LEFT JOIN procurement_item_categories pc ON pc.id = pi.category_id
    WHERE pi.is_active = TRUE
    ORDER BY pi.item_name;
$$;


--
-- Name: sp_get_student_assignment_history(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_assignment_history(p_student_id integer, p_before_date date) RETURNS TABLE(id integer, title character varying, due_date date, total_marks numeric, subject_name character varying, submission_id integer, submitted_at timestamp with time zone, marks_obtained numeric, submission_status character varying, feedback text, submitted boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.id, a.title, a.due_date, a.total_marks, subj.name,
           asub.id, asub.submitted_at, asub.marks, asub.status, asub.feedback,
           CASE WHEN asub.id IS NOT NULL THEN TRUE ELSE FALSE END
    FROM assignments a
    LEFT JOIN subjects subj ON subj.id = a.subject_id
    LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id AND asub.student_id = p_student_id
    WHERE a.class_id = (SELECT st.class_id FROM students st WHERE st.id = p_student_id)
      AND (p_before_date IS NULL OR a.created_at::date <= p_before_date)
    ORDER BY a.due_date DESC;
$$;


--
-- Name: sp_get_student_assignments(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_assignments(p_student_id integer, p_class_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, title character varying, description text, due_date date, total_marks numeric, status character varying, created_at timestamp with time zone, assignment_file character varying, assignment_path character varying, subject_name character varying, class_name character varying, section character varying, teacher_name text, submission_id integer, submitted_at timestamp with time zone, marks numeric, feedback text, sub_status character varying, file_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.id, a.class_id, a.subject_id, a.teacher_id, a.title, a.description,
           a.due_date, a.total_marks, a.status, a.created_at,
           a.file_name, a.file_path,
           s.name, c.name, c.section, (t.first_name || ' ' || t.last_name),
           sub.id, sub.submitted_at, sub.marks, sub.feedback, sub.status, sub.file_name
    FROM assignments a
    JOIN subjects s ON s.id = a.subject_id
    JOIN classes c ON c.id = a.class_id
    JOIN teachers t ON t.id = a.teacher_id
    LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = p_student_id
    WHERE a.class_id = p_class_id
    ORDER BY a.due_date DESC;
$$;


--
-- Name: sp_get_student_attendance_range(integer, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_attendance_range(p_student_id integer, p_from date, p_to date, p_subject_id integer) RETURNS TABLE(date date, status character varying, remarks text, subject_id integer, subject_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.date, a.status, a.remarks, a.subject_id, subj.name
    FROM attendance a
    LEFT JOIN subjects subj ON subj.id = a.subject_id
    WHERE a.student_id = p_student_id AND a.date BETWEEN p_from AND p_to
      AND (p_subject_id IS NULL OR a.subject_id = p_subject_id)
    ORDER BY a.date DESC;
$$;


--
-- Name: sp_get_student_attendance_report(integer, character varying, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_attendance_report(p_class_id integer, p_search character varying, p_from date, p_to date) RETURNS TABLE(id integer, first_name character varying, last_name character varying, enrollment_no character varying, class_name character varying, section character varying, present bigint, absent bigint, late bigint, on_leave bigint, total_days bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.first_name, s.last_name, s.enrollment_no,
           c.name, c.section,
           COUNT(a.id) FILTER (WHERE a.status='present'),
           COUNT(a.id) FILTER (WHERE a.status='absent'),
           COUNT(a.id) FILTER (WHERE a.status='late'),
           COUNT(a.id) FILTER (WHERE a.status='on_leave'),
           COUNT(DISTINCT a.date)
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date BETWEEN p_from AND p_to
    WHERE s.status = 'active'
      AND (p_class_id IS NULL OR s.class_id = p_class_id)
      AND (p_search IS NULL OR p_search = '' OR (
          (s.first_name || ' ' || s.last_name) ILIKE '%' || p_search || '%'
          OR s.enrollment_no ILIKE '%' || p_search || '%'
      ))
    GROUP BY s.id, s.first_name, s.last_name, s.enrollment_no, c.name, c.section
    ORDER BY c.name, c.section, s.first_name;
$$;


--
-- Name: sp_get_student_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_by_id(p_id integer) RETURNS TABLE(id integer, user_id integer, enrollment_no character varying, first_name character varying, last_name character varying, date_of_birth date, gender character varying, blood_group character varying, address text, class_id integer, parent_id integer, status character varying, father_name character varying, mother_name character varying, father_cnic character varying, father_phone character varying, mother_phone character varying, admission_date date, email character varying, phone character varying, is_active boolean, is_verified boolean, last_login_at timestamp with time zone, created_at timestamp without time zone, class_name character varying, section character varying, parent_name text, parent_email character varying, parent_phone character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.user_id, s.enrollment_no, s.first_name, s.last_name,
           s.date_of_birth, s.gender, s.blood_group, s.address, s.class_id,
           s.parent_id, s.status, s.father_name, s.mother_name,
           s.father_cnic, s.father_phone, s.mother_phone, s.admission_date,
           u.email, u.phone, u.is_active, u.is_verified,
           u.last_login_at, u.created_at, c.name, c.section,
           (pu.first_name || ' ' || pu.last_name), pu.email, pu.phone
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN users pu ON pu.id = s.parent_id
    WHERE s.id = p_id;
$$;


--
-- Name: sp_get_student_by_user_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_by_user_id(p_user_id integer) RETURNS TABLE(id integer, user_id integer, enrollment_no character varying, first_name character varying, last_name character varying, date_of_birth date, gender character varying, blood_group character varying, address text, class_id integer, parent_id integer, status character varying, admission_date date, email character varying, phone character varying, is_active boolean, class_name character varying, section character varying, parent_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.user_id, s.enrollment_no, s.first_name, s.last_name,
           s.date_of_birth, s.gender, s.blood_group, s.address, s.class_id,
           s.parent_id, s.status, s.admission_date,
           u.email, u.phone, u.is_active,
           c.name, c.section, (pu.first_name || ' ' || pu.last_name)
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN users pu ON pu.id = s.parent_id
    WHERE s.user_id = p_user_id;
$$;


--
-- Name: sp_get_student_class(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_class(p_user_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT class_id FROM students WHERE user_id = p_user_id;
$$;


--
-- Name: sp_get_student_class_and_name(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_class_and_name(p_student_id integer) RETURNS TABLE(class_id integer, student_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.class_id, (u.first_name || ' ' || u.last_name)
    FROM students s JOIN users u ON u.id = s.user_id
    WHERE s.id = p_student_id;
$$;


--
-- Name: sp_get_student_diary(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_diary(p_class_id integer, p_date date) RETURNS TABLE(id integer, subject_id integer, teacher_id integer, date date, classwork text, homework text, notes text, subject_name character varying, subject_code character varying, teacher_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT dd.id, dd.subject_id, dd.teacher_id, dd.date,
           dd.classwork, dd.homework, dd.notes, s2.name, s2.code, (t.first_name || ' ' || t.last_name)
    FROM daily_diary dd
    JOIN subjects s2 ON s2.id = dd.subject_id
    JOIN teachers t ON t.id = dd.teacher_id
    WHERE dd.class_id = p_class_id AND dd.date = p_date
    ORDER BY s2.name;
$$;


--
-- Name: sp_get_student_id_by_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_id_by_user(p_user_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT id FROM students WHERE user_id = p_user_id;
$$;


--
-- Name: sp_get_student_id_class_by_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_id_class_by_user(p_user_id integer) RETURNS TABLE(id integer, class_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, class_id FROM students WHERE user_id = p_user_id;
$$;


--
-- Name: sp_get_student_issued_books(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_issued_books(p_student_id integer) RETURNS TABLE(id integer, issued_at date, due_date date, returned_at date, status character varying, fine_amount numeric, note text, title character varying, author character varying, isbn character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT it.id, it.issued_at, it.due_date, it.returned_at,
           CASE
               WHEN it.returned_at IS NOT NULL THEN 'returned'
               WHEN CURRENT_DATE > it.due_date THEN 'overdue'
               ELSE 'issued'
           END::VARCHAR,
           it.fine_amount, it.notes,
           b.title, la.name, b.isbn
    FROM students s
    JOIN library_members lm ON lm.user_id = s.user_id
    JOIN library_issue_transactions it ON it.member_id = lm.id
    JOIN library_book_copies bc ON bc.id = it.copy_id
    JOIN library_books b ON b.id = bc.book_id
    LEFT JOIN library_authors la ON la.id = b.author_id
    WHERE s.id = p_student_id
      AND it.returned_at IS NULL
    ORDER BY it.issued_at DESC;
$$;


--
-- Name: sp_get_student_notify_info(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_notify_info(p_student_id integer) RETURNS TABLE(student_user_id integer, parent_id integer, student_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.user_id, s.parent_id, (u.first_name || ' ' || u.last_name)
    FROM students s JOIN users u ON u.id = s.user_id
    WHERE s.id = p_student_id;
$$;


--
-- Name: sp_get_student_pending_invoices(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_pending_invoices(p_student_id integer) RETURNS TABLE(id integer, invoice_no character varying, amount numeric, net_amount numeric, discount numeric, fine numeric, status character varying, due_date date, month_year character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, invoice_no, amount, net_amount, discount, fine, status, due_date, month_year
    FROM fee_invoices
    WHERE student_id = p_student_id AND status NOT IN ('paid','cancelled','waived')
    ORDER BY due_date;
$$;


--
-- Name: sp_get_student_quiz_history(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_quiz_history(p_student_id integer, p_before_date date) RETURNS TABLE(id integer, title character varying, total_marks integer, quiz_date timestamp with time zone, subject_name character varying, score integer, percentage numeric, submitted_at timestamp with time zone, submitted boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT q.id, q.title, q.total_marks, q.created_at, s.name,
           qs.marks, qs.percentage, qs.submitted_at,
           CASE WHEN qs.id IS NOT NULL THEN TRUE ELSE FALSE END
    FROM quizzes q
    LEFT JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN quiz_submissions qs ON qs.quiz_id = q.id AND qs.student_id = p_student_id
    WHERE q.class_id = (SELECT st.class_id FROM students st WHERE st.id = p_student_id)
      AND (p_before_date IS NULL OR q.created_at::date <= p_before_date)
    ORDER BY q.created_at DESC;
$$;


--
-- Name: sp_get_student_siblings(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_siblings(p_student_id integer) RETURNS TABLE(id integer, first_name character varying, last_name character varying, enrollment_no character varying, class_id integer, class_name character varying, class_section character varying, status character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_parent_id INTEGER;
BEGIN
    SELECT parent_id INTO v_parent_id FROM students WHERE students.id = p_student_id;

    IF v_parent_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.enrollment_no,
        s.class_id,
        c.name AS class_name,
        c.section AS class_section,
        s.status
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.parent_id = v_parent_id
      AND s.id <> p_student_id
      AND s.status = 'active'
    ORDER BY s.first_name;
END;
$$;


--
-- Name: sp_get_student_teachers_for_notify(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_teachers_for_notify(p_student_id integer) RETURNS TABLE(user_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT t.user_id FROM students s
    JOIN class_teachers ct ON ct.class_id = s.class_id
    JOIN teachers t ON t.id = ct.teacher_id
    WHERE s.id = p_student_id
    UNION
    SELECT DISTINCT t2.user_id FROM students s2
    JOIN class_teachers ct2 ON ct2.class_id = s2.class_id
    JOIN teacher_subjects ts ON ts.teacher_id = ct2.teacher_id
    JOIN teachers t2 ON t2.id = ts.teacher_id
    WHERE s2.id = p_student_id;
$$;


--
-- Name: sp_get_student_user_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_student_user_id(p_student_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT user_id FROM students WHERE id = p_student_id;
$$;


--
-- Name: sp_get_students_by_parent(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_students_by_parent(p_parent_id integer) RETURNS TABLE(id integer, enrollment_no character varying, first_name character varying, last_name character varying, status character varying, class_id integer, class_name character varying, class_section character varying, gender character varying, date_of_birth date)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.enrollment_no, s.first_name, s.last_name,
           s.status, s.class_id, c.name, c.section,
           s.gender, s.date_of_birth
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.parent_id = p_parent_id;
$$;


--
-- Name: sp_get_subject_class_names(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_subject_class_names(p_subject_id integer, p_class_id integer) RETURNS TABLE(subject_name character varying, class_name character varying, section character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.name, c.name, c.section FROM subjects s, classes c WHERE s.id = p_subject_id AND c.id = p_class_id;
$$;


--
-- Name: sp_get_subject_teachers_for_class(integer, integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_subject_teachers_for_class(p_subject_id integer, p_teacher_ids integer[]) RETURNS TABLE(teacher_id integer, name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT t.id, (t.first_name || ' ' || t.last_name)
    FROM teacher_subjects ts
    JOIN teachers t ON t.id = ts.teacher_id
    WHERE ts.subject_id = p_subject_id AND t.id = ANY(p_teacher_ids);
$$;


--
-- Name: assignment_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_submissions (
    id integer NOT NULL,
    assignment_id integer NOT NULL,
    student_id integer NOT NULL,
    file_name character varying(255),
    file_path character varying(500),
    file_type character varying(50),
    file_size integer,
    submitted_at timestamp without time zone DEFAULT now(),
    marks integer,
    feedback text,
    marked_at timestamp without time zone,
    marked_by integer,
    status character varying(20) DEFAULT 'submitted'::character varying
);


--
-- Name: sp_get_submission_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_submission_by_id(p_sub_id integer) RETURNS SETOF public.assignment_submissions
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM assignment_submissions WHERE id = p_sub_id;
$$;


--
-- Name: sp_get_submission_for_grading(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_submission_for_grading(p_sub_id integer) RETURNS TABLE(id integer, assignment_id integer, student_id integer, total_marks numeric, title character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT sub.id, sub.assignment_id, sub.student_id, a.total_marks, a.title
    FROM assignment_submissions sub
    JOIN assignments a ON a.id = sub.assignment_id
    WHERE sub.id = p_sub_id;
$$;


--
-- Name: sp_get_submissions_for_assignment(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_submissions_for_assignment(p_assignment_id integer) RETURNS TABLE(id integer, student_id integer, file_name character varying, file_type character varying, file_size bigint, submitted_at timestamp with time zone, marks numeric, feedback text, status character varying, student_name text, enrollment_no character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT sub.id, sub.student_id, sub.file_name, sub.file_type, sub.file_size,
           sub.submitted_at, sub.marks, sub.feedback, sub.status,
           (s.first_name || ' ' || s.last_name), s.enrollment_no
    FROM assignment_submissions sub
    JOIN students s ON s.id = sub.student_id
    WHERE sub.assignment_id = p_assignment_id
    ORDER BY sub.submitted_at DESC;
$$;


--
-- Name: sp_get_syllabus_attachment(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_syllabus_attachment(p_id integer, p_topic_id integer) RETURNS TABLE(url character varying, filename character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT url, filename FROM syllabus_attachments WHERE id = p_id AND topic_id = p_topic_id;
$$;


--
-- Name: sp_get_syllabus_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_syllabus_by_id(p_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, academic_year_id integer, title character varying, description text, created_by integer, created_at timestamp with time zone, updated_at timestamp with time zone, class_name character varying, section character varying, subject_name character varying, subject_code character varying, academic_year character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT sy.id, sy.class_id, sy.subject_id, sy.academic_year_id, sy.title,
           sy.description, sy.created_by, sy.created_at, sy.updated_at,
           c.name, c.section, s.name, s.code, ay.name
    FROM syllabus sy
    JOIN classes c ON c.id = sy.class_id
    JOIN subjects s ON s.id = sy.subject_id
    JOIN academic_years ay ON ay.id = sy.academic_year_id
    WHERE sy.id = p_id;
$$;


--
-- Name: sp_get_syllabus_list(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_syllabus_list(p_class_id integer DEFAULT NULL::integer, p_subject_id integer DEFAULT NULL::integer, p_academic_year_id integer DEFAULT NULL::integer) RETURNS TABLE(id integer, title character varying, description text, class_id integer, subject_id integer, academic_year_id integer, class_name character varying, section character varying, subject_name character varying, subject_code character varying, academic_year character varying, total_topics bigint, covered_topics bigint, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$ BEGIN RETURN QUERY SELECT sy.id,sy.title,sy.description,sy.class_id,sy.subject_id,sy.academic_year_id,c.name::VARCHAR,c.section::VARCHAR,s.name::VARCHAR,s.code::VARCHAR,ay.name::VARCHAR,COUNT(DISTINCT st.id),COUNT(DISTINCT sp.id),sy.created_at FROM syllabus sy JOIN classes c ON c.id=sy.class_id JOIN subjects s ON s.id=sy.subject_id JOIN academic_years ay ON ay.id=sy.academic_year_id LEFT JOIN syllabus_topics st ON st.syllabus_id=sy.id LEFT JOIN syllabus_progress sp ON sp.topic_id=st.id WHERE(p_class_id IS NULL OR sy.class_id=p_class_id) AND(p_subject_id IS NULL OR sy.subject_id=p_subject_id) AND(p_academic_year_id IS NULL OR sy.academic_year_id=p_academic_year_id) GROUP BY sy.id,sy.title,sy.description,sy.class_id,sy.subject_id,sy.academic_year_id,c.name,c.section,s.name,s.code,ay.name,sy.created_at ORDER BY c.name,s.name; END; $$;


--
-- Name: sp_get_syllabus_notify_info(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_syllabus_notify_info(p_syllabus_id integer) RETURNS TABLE(title character varying, class_name character varying, subject_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT sy.title, c.name, s.name
    FROM syllabus sy JOIN classes c ON c.id = sy.class_id JOIN subjects s ON s.id = sy.subject_id
    WHERE sy.id = p_syllabus_id;
$$;


--
-- Name: sp_get_syllabus_topics(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_syllabus_topics(p_syllabus_id integer) RETURNS TABLE(id integer, title character varying, description text, sort_order integer, planned_week integer, planned_month integer, planned_date date, month_group_title character varying, covered_at timestamp with time zone, note text, covered_by integer, covered_by_name text, attachments json)
    LANGUAGE sql STABLE
    AS $$
    SELECT st.id, st.title, st.description, st.sort_order, st.planned_week, st.planned_month,
           st.planned_date, st.month_group_title,
           sp.covered_at, sp.note, sp.covered_by, (u.first_name || ' ' || u.last_name),
           ARRAY_TO_JSON(ARRAY_AGG(
               JSON_BUILD_OBJECT('id', sa.id, 'filename', sa.filename, 'url', sa.url)
           ) FILTER (WHERE sa.id IS NOT NULL))
    FROM syllabus_topics st
    LEFT JOIN syllabus_progress sp ON sp.topic_id = st.id
    LEFT JOIN users u ON u.id = sp.covered_by
    LEFT JOIN syllabus_attachments sa ON sa.topic_id = st.id
    WHERE st.syllabus_id = p_syllabus_id
    GROUP BY st.id, st.title, st.description, st.sort_order, st.planned_week, st.planned_month,
             st.planned_date, st.month_group_title, sp.covered_at, sp.note, sp.covered_by,
             u.first_name, u.last_name
    ORDER BY st.sort_order, st.id;
$$;


--
-- Name: sp_get_tax_slabs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_tax_slabs(p_slab_set_id integer) RETURNS TABLE(id integer, min_income numeric, max_income numeric, fixed_amount numeric, rate_percent numeric, sort_order integer)
    LANGUAGE sql
    AS $$
    SELECT id, min_income, max_income, fixed_amount, rate_percent, sort_order
    FROM payroll_tax_slabs WHERE slab_set_id = p_slab_set_id ORDER BY sort_order, min_income;
$$;


--
-- Name: sp_get_teacher_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_by_id(p_id integer) RETURNS TABLE(id integer, user_id integer, employee_no character varying, first_name character varying, last_name character varying, date_of_birth date, gender character varying, qualification character varying, specialization character varying, join_date date, status character varying, email character varying, phone character varying, is_active boolean, last_login_at timestamp with time zone, created_at timestamp without time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT t.id, t.user_id, t.employee_no, t.first_name, t.last_name,
           t.date_of_birth, t.gender, t.qualification, t.specialization,
           t.join_date, t.status, u.email, u.phone, u.is_active,
           u.last_login_at, u.created_at
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    WHERE t.id = p_id;
$$;


--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id integer NOT NULL,
    user_id integer,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    employee_no character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    date_of_birth date,
    gender character varying(10),
    qualification character varying(200),
    specialization character varying(200),
    join_date date DEFAULT CURRENT_DATE,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL
);


--
-- Name: sp_get_teacher_by_user_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_by_user_id(p_user_id integer) RETURNS SETOF public.teachers
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM teachers WHERE user_id = p_user_id;
$$;


--
-- Name: sp_get_teacher_class_ids_by_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_class_ids_by_user(p_user_id integer) RETURNS TABLE(class_id integer, is_primary boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT ct.class_id, ct.is_primary FROM class_teachers ct
    JOIN teachers t ON t.id = ct.teacher_id
    WHERE t.user_id = p_user_id;
$$;


--
-- Name: sp_get_teacher_class_student_ids(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_class_student_ids(p_user_id integer) RETURNS TABLE(student_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id FROM students s
    JOIN classes c ON c.id=s.class_id
    WHERE c.id IN (
        SELECT ct.class_id FROM class_teachers ct
        JOIN teachers t ON t.id=ct.teacher_id
        WHERE t.user_id=p_user_id
    );
$$;


--
-- Name: sp_get_teacher_classes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_classes(p_teacher_id integer) RETURNS TABLE(id integer, name character varying, section character varying, class_type character varying, is_primary boolean, student_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section, c.class_type, ct.is_primary,
           COUNT(s.id)
    FROM class_teachers ct
    JOIN classes  c ON c.id = ct.class_id
    LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
    WHERE ct.teacher_id = p_teacher_id
    GROUP BY c.id, c.name, c.section, c.class_type, ct.is_primary
    ORDER BY c.name;
$$;


--
-- Name: sp_get_teacher_committee_case_ids(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_committee_case_ids(p_user_id integer) RETURNS TABLE(case_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT hc.case_id FROM hearing_committee hc
    JOIN teachers t ON t.id=hc.teacher_id
    WHERE t.user_id=p_user_id;
$$;


--
-- Name: sp_get_teacher_for_quiz_notify(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_for_quiz_notify(p_student_id integer, p_quiz_id integer) RETURNS TABLE(teacher_user_id integer, first_name character varying, last_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT u.id, stu.first_name, stu.last_name
    FROM quizzes qz JOIN teachers t ON t.id = qz.teacher_id
    JOIN users u ON u.id = t.user_id JOIN students stu ON stu.id = p_student_id
    WHERE qz.id = p_quiz_id;
$$;


--
-- Name: sp_get_teacher_for_reminder(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_for_reminder(p_teacher_id integer) RETURNS TABLE(user_id integer, first_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT user_id, first_name FROM teachers WHERE id = p_teacher_id;
$$;


--
-- Name: sp_get_teacher_for_submission_notify(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_for_submission_notify(p_student_id integer, p_assignment_id integer) RETURNS TABLE(teacher_user_id integer, first_name character varying, last_name character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT u.id, stu.first_name, stu.last_name
    FROM assignments a
    JOIN teachers t ON t.id = a.teacher_id
    JOIN users u ON u.id = t.user_id
    JOIN students stu ON stu.id = p_student_id
    WHERE a.id = p_assignment_id;
$$;


--
-- Name: sp_get_teacher_id_by_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_id_by_user(p_user_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT id FROM teachers WHERE user_id=p_user_id;
$$;


--
-- Name: sp_get_teacher_incharge_class_student_ids(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_incharge_class_student_ids(p_user_id integer) RETURNS TABLE(id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id FROM students s
    JOIN class_teachers ct ON ct.class_id = s.class_id
    JOIN teachers t ON t.id = ct.teacher_id
    WHERE t.user_id = p_user_id AND ct.is_primary = TRUE;
$$;


--
-- Name: sp_get_teacher_incharge_classes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_incharge_classes(p_user_id integer) RETURNS TABLE(id integer, name character varying, section character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section
    FROM class_teachers ct
    JOIN teachers t ON t.id = ct.teacher_id
    JOIN classes c ON c.id = ct.class_id
    WHERE t.user_id = p_user_id AND ct.is_primary = TRUE
    ORDER BY c.name, c.section;
$$;


--
-- Name: sp_get_teacher_subjects(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_subjects(p_teacher_id integer) RETURNS TABLE(id integer, name character varying, code character varying, description text, credit_hours integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.name, s.code, s.description, s.credit_hours
    FROM subjects s
    JOIN teacher_subjects ts ON ts.subject_id = s.id
    WHERE ts.teacher_id = p_teacher_id
    ORDER BY s.name;
$$;


--
-- Name: sp_get_teacher_timetable(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_timetable(p_teacher_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, day_of_week integer, start_time text, end_time text, class_name character varying, section character varying, subject_name character varying, day_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT t.id, t.class_id, t.subject_id, t.teacher_id,
           t.day_of_week, t.start_time::TEXT, t.end_time::TEXT,
           c.name, c.section, s.name,
           CASE t.day_of_week
               WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday' WHEN 3 THEN 'Wednesday'
               WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday' WHEN 6 THEN 'Saturday'
           END
    FROM timetable t
    JOIN classes  c ON c.id = t.class_id
    JOIN subjects s ON s.id = t.subject_id
    WHERE t.teacher_id = p_teacher_id
    ORDER BY t.day_of_week, t.start_time;
$$;


--
-- Name: sp_get_teacher_timetable_subjects(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_timetable_subjects(p_teacher_id integer, p_class_id integer) RETURNS TABLE(id integer, subject_name character varying, code character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT s.id, s.name, s.code
    FROM timetable tt JOIN subjects s ON s.id = tt.subject_id
    WHERE tt.teacher_id = p_teacher_id AND tt.class_id = p_class_id
    ORDER BY s.name;
$$;


--
-- Name: sp_get_teacher_user_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teacher_user_id(p_teacher_id integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT user_id FROM teachers WHERE id=p_teacher_id;
$$;


--
-- Name: sp_get_teachers_for_notify(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_teachers_for_notify(p_class_id integer, p_all_teachers boolean) RETURNS TABLE(user_id integer)
    LANGUAGE sql STABLE
    AS $$ SELECT DISTINCT t.user_id FROM class_teachers ct JOIN teachers t ON t.id=ct.teacher_id WHERE ct.class_id=p_class_id AND (p_all_teachers=TRUE OR ct.is_primary=TRUE) AND t.user_id IS NOT NULL; $$;


--
-- Name: sp_get_topic_completion_counts(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_topic_completion_counts(p_syllabus_id integer) RETURNS TABLE(total bigint, covered bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(st.id), COUNT(sp.id)
    FROM syllabus_topics st LEFT JOIN syllabus_progress sp ON sp.topic_id = st.id
    WHERE st.syllabus_id = p_syllabus_id;
$$;


--
-- Name: sp_get_unsubmitted_students(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_unsubmitted_students(p_assignment_id integer) RETURNS TABLE(student_id integer, student_name text, enrollment_no character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, (s.first_name || ' ' || s.last_name), s.enrollment_no
    FROM assignments a
    JOIN students s ON s.class_id = a.class_id AND s.status = 'active'
    WHERE a.id = p_assignment_id
      AND s.id NOT IN (SELECT student_id FROM assignment_submissions WHERE assignment_id = p_assignment_id);
$$;


--
-- Name: sp_get_user_by_email(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_user_by_email(p_email character varying) RETURNS SETOF public.users
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM users WHERE email = p_email;
$$;


--
-- Name: sp_get_user_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_user_by_id(p_id integer) RETURNS TABLE(id integer, email character varying, first_name character varying, last_name character varying, phone character varying, is_active boolean, is_verified boolean, last_login_at timestamp with time zone, created_at timestamp without time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, email, first_name, last_name, phone,
           is_active, is_verified, last_login_at, created_at
    FROM users WHERE id = p_id;
$$;


--
-- Name: sp_get_user_password_hash(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_user_password_hash(p_user_id integer) RETURNS TABLE(password_hash text)
    LANGUAGE sql STABLE
    AS $$
    SELECT u.password_hash::TEXT FROM users u WHERE u.id = p_user_id;
$$;


--
-- Name: sp_get_user_role_and_class(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_user_role_and_class(p_user_id integer) RETURNS TABLE(role_name character varying, class_id integer)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_role VARCHAR;
    v_class_id INTEGER;
BEGIN
    SELECT r.name INTO v_role FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id LIMIT 1;

    v_role := COALESCE(v_role, 'student');

    IF v_role = 'student' THEN
        SELECT s.class_id INTO v_class_id FROM students s WHERE s.user_id = p_user_id;
    ELSIF v_role = 'parent' THEN
        SELECT s.class_id INTO v_class_id FROM students s
        WHERE s.parent_id = p_user_id AND s.status = 'active' LIMIT 1;
    END IF;

    RETURN QUERY SELECT v_role, v_class_id;
END;
$$;


--
-- Name: sp_get_user_roles_and_permissions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_user_roles_and_permissions(p_user_id integer) RETURNS TABLE(roles text[], permissions text[])
    LANGUAGE sql STABLE
    AS $$
    SELECT
        COALESCE((SELECT ARRAY_AGG(r.name) FROM roles r
                  JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = p_user_id), ARRAY[]::TEXT[]),
        COALESCE((SELECT ARRAY_AGG(DISTINCT p.code) FROM permissions p
                  JOIN role_permissions rp ON rp.permission_id = p.id
                  JOIN user_roles ur ON ur.role_id = rp.role_id
                  WHERE ur.user_id = p_user_id), ARRAY[]::TEXT[]);
$$;


--
-- Name: sp_get_user_theme(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_user_theme(p_user_id integer) RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(theme_preference, 'indigo') FROM users WHERE id = p_user_id;
$$;


--
-- Name: sp_get_vendor_invoice_detail(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_vendor_invoice_detail(p_id integer) RETURNS TABLE(id integer, vendor_invoice_no character varying, po_id integer, po_number character varying, grn_id integer, grn_number character varying, vendor_id integer, vendor_name character varying, invoice_date date, received_date date, subtotal numeric, tax_amount numeric, total_amount numeric, paid_amount numeric, balance numeric, status character varying, notes text, dispute_reason text, created_by_name text, verified_by_name text, approved_by_name text, verified_at timestamp with time zone, approved_at timestamp with time zone, created_at timestamp with time zone, po_total_amount numeric)
    LANGUAGE sql STABLE
    AS $$
    SELECT vi.id, vi.vendor_invoice_no, vi.po_id, po.po_number,
           vi.grn_id, g.grn_number,
           vi.vendor_id, v.name::VARCHAR,
           vi.invoice_date, vi.received_date,
           vi.subtotal, vi.tax_amount, vi.total_amount, vi.paid_amount,
           (vi.total_amount - vi.paid_amount),
           vi.status::VARCHAR, vi.notes, vi.dispute_reason,
           (cu.first_name||' '||cu.last_name)::TEXT,
           (CASE WHEN vbu.id IS NOT NULL THEN (vbu.first_name||' '||vbu.last_name)::TEXT ELSE NULL END),
           (CASE WHEN abu.id IS NOT NULL THEN (abu.first_name||' '||abu.last_name)::TEXT ELSE NULL END),
           vi.verified_at, vi.approved_at, vi.created_at,
           po.total_amount
    FROM vendor_invoices vi
    JOIN purchase_orders po ON po.id=vi.po_id
    JOIN procurement_vendors v ON v.id=vi.vendor_id
    JOIN users cu ON cu.id=vi.created_by
    LEFT JOIN goods_receipt_notes g ON g.id=vi.grn_id
    LEFT JOIN users vbu ON vbu.id=vi.verified_by
    LEFT JOIN users abu ON abu.id=vi.approved_by
    WHERE vi.id=p_id;
$$;


--
-- Name: sp_get_vendor_invoices(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_vendor_invoices(p_status character varying DEFAULT NULL::character varying, p_po_id integer DEFAULT NULL::integer) RETURNS TABLE(id integer, vendor_invoice_no character varying, po_id integer, po_number character varying, grn_id integer, grn_number character varying, vendor_id integer, vendor_name character varying, invoice_date date, received_date date, subtotal numeric, tax_amount numeric, total_amount numeric, paid_amount numeric, balance numeric, status character varying, notes text, created_by_name text, created_at timestamp with time zone, item_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT vi.id, vi.vendor_invoice_no, vi.po_id, po.po_number,
           vi.grn_id, g.grn_number,
           vi.vendor_id, v.name::VARCHAR,
           vi.invoice_date, vi.received_date,
           vi.subtotal, vi.tax_amount, vi.total_amount, vi.paid_amount,
           (vi.total_amount - vi.paid_amount),
           vi.status::VARCHAR, vi.notes,
           (u.first_name||' '||u.last_name)::TEXT,
           vi.created_at,
           COUNT(vii.id)
    FROM vendor_invoices vi
    JOIN purchase_orders po ON po.id=vi.po_id
    JOIN procurement_vendors v ON v.id=vi.vendor_id
    JOIN users u ON u.id=vi.created_by
    LEFT JOIN goods_receipt_notes g ON g.id=vi.grn_id
    LEFT JOIN vendor_invoice_items vii ON vii.invoice_id=vi.id
    WHERE (p_status IS NULL OR vi.status=p_status)
      AND (p_po_id IS NULL OR vi.po_id=p_po_id)
    GROUP BY vi.id, po.po_number, g.grn_number, v.name, u.first_name, u.last_name
    ORDER BY vi.created_at DESC;
$$;


--
-- Name: sp_get_waiver_authority_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_waiver_authority_role() RETURNS character varying
    LANGUAGE sql STABLE
    AS $$
    SELECT value FROM system_settings WHERE key = 'waiver_authority_role';
$$;


--
-- Name: sp_get_waiver_request(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_waiver_request(p_id integer) RETURNS TABLE(id integer, withdrawal_id integer, invoice_id integer, requested_by integer, waiver_type character varying, waiver_amount numeric, reason text, status character varying, actioned_by integer, actioned_at timestamp with time zone, action_note text, new_invoice_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, withdrawal_id, invoice_id, requested_by, waiver_type, waiver_amount,
           reason, status, actioned_by, actioned_at, action_note, new_invoice_id
    FROM withdrawal_waivers WHERE id = p_id;
$$;


--
-- Name: sp_get_withdrawal_clearances(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_clearances(p_request_id integer) RETURNS TABLE(department character varying, status character varying, note text, cleared_at timestamp with time zone, cleared_by_name text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT wc.department, wc.status, wc.note, wc.cleared_at,
           (u.first_name||chr(32)||u.last_name)::TEXT
    FROM withdrawal_clearances wc
    LEFT JOIN users u ON u.id=wc.cleared_by
    WHERE wc.request_id=p_request_id
    ORDER BY wc.department;
END;
$$;


--
-- Name: sp_get_withdrawal_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_config() RETURNS TABLE(id integer, departments jsonb, require_coordinator boolean, require_principal boolean, allow_appeal boolean, appeal_days integer, required_documents jsonb, tc_prefix character varying, auto_generate_tc boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY SELECT wc.id, wc.departments, wc.require_coordinator,
        wc.require_principal, wc.allow_appeal, wc.appeal_days,
        wc.required_documents, wc.tc_prefix, wc.auto_generate_tc
    FROM withdrawal_config wc WHERE wc.id=1;
END;
$$;


--
-- Name: sp_get_withdrawal_detail(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_detail(p_id integer) RETURNS TABLE(id integer, student_id integer, status character varying, reason text, requested_at timestamp with time zone, effective_date date, documents character varying, coordinator_note text, coordinator_at timestamp with time zone, principal_note text, principal_at timestamp with time zone, teacher_conduct_submitted boolean, teacher_conduct_at timestamp with time zone, student_name text, enrollment_no character varying, class_name character varying, section character varying, requested_by_name text, coordinator_name text, principal_name text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT wr.id, wr.student_id, wr.status, wr.reason,
           wr.requested_at, wr.effective_date, wr.documents,
           wr.coordinator_note, wr.coordinator_at,
           wr.principal_note, wr.principal_at,
           wr.teacher_conduct_submitted, wr.teacher_conduct_at,
           (s.first_name||chr(32)||s.last_name)::TEXT,
           s.enrollment_no, c.name::VARCHAR, c.section::VARCHAR,
           (u.first_name||chr(32)||u.last_name)::TEXT,
           (coord.first_name||chr(32)||coord.last_name)::TEXT,
           (prin.first_name||chr(32)||prin.last_name)::TEXT
    FROM withdrawal_requests wr
    JOIN students s ON s.id=wr.student_id
    JOIN classes c ON c.id=s.class_id
    JOIN users u ON u.id=wr.requested_by
    LEFT JOIN users coord ON coord.id=wr.coordinator_id
    LEFT JOIN users prin ON prin.id=wr.principal_id
    WHERE wr.id=p_id;
END;
$$;


--
-- Name: sp_get_withdrawal_documents(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_documents(p_request_id integer) RETURNS TABLE(id integer, filename character varying, url character varying, uploaded_at timestamp with time zone, uploaded_by_name text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT wd.id, wd.filename, wd.url, wd.uploaded_at,
           (u.first_name||chr(32)||u.last_name)::TEXT
    FROM withdrawal_documents wd
    JOIN users u ON u.id=wd.uploaded_by
    WHERE wd.request_id=p_request_id;
END;
$$;


--
-- Name: sp_get_withdrawal_list(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_list(p_user_id integer DEFAULT NULL::integer, p_view_all boolean DEFAULT false) RETURNS TABLE(id integer, student_id integer, status character varying, reason text, requested_at timestamp with time zone, effective_date date, documents character varying, student_name text, enrollment_no character varying, class_name character varying, section character varying, requested_by_name text, coordinator_note text, principal_note text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_view_all THEN
        RETURN QUERY
        SELECT wr.id, wr.student_id, wr.status, wr.reason,
               wr.requested_at, wr.effective_date, wr.documents,
               (s.first_name||chr(32)||s.last_name)::TEXT,
               s.enrollment_no, c.name::VARCHAR, c.section::VARCHAR,
               (u.first_name||chr(32)||u.last_name)::TEXT,
               wr.coordinator_note, wr.principal_note
        FROM withdrawal_requests wr
        JOIN students s ON s.id=wr.student_id
        JOIN classes c ON c.id=s.class_id
        JOIN users u ON u.id=wr.requested_by
        ORDER BY wr.requested_at DESC;
    ELSE
        RETURN QUERY
        SELECT wr.id, wr.student_id, wr.status, wr.reason,
               wr.requested_at, wr.effective_date, wr.documents,
               (s.first_name||chr(32)||s.last_name)::TEXT,
               s.enrollment_no, c.name::VARCHAR, c.section::VARCHAR,
               (u.first_name||chr(32)||u.last_name)::TEXT,
               wr.coordinator_note, wr.principal_note
        FROM withdrawal_requests wr
        JOIN students s ON s.id=wr.student_id
        JOIN classes c ON c.id=s.class_id
        JOIN users u ON u.id=wr.requested_by
        WHERE wr.requested_by=p_user_id
        ORDER BY wr.requested_at DESC;
    END IF;
END;
$$;


--
-- Name: sp_get_withdrawal_requester(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_requester(p_req_id integer) RETURNS TABLE(requested_by integer, student_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT requested_by, student_id FROM withdrawal_requests WHERE id = p_req_id;
$$;


--
-- Name: sp_get_withdrawal_tc(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_tc(p_request_id integer) RETURNS TABLE(student_name text, enrollment_no character varying, class_name character varying, section character varying, gender character varying, date_of_birth date, address text, blood_group character varying, father_name character varying, mother_name character varying, father_cnic character varying, father_phone character varying, admission_date date, withdrawal_date timestamp with time zone, reason text, effective_date date, principal_note text, coordinator_note text, parent_name text, parent_email character varying, school_name text, school_address text, school_logo text, academic_year character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        (s.first_name||chr(32)||s.last_name)::TEXT,
        s.enrollment_no, c.name::VARCHAR, c.section::VARCHAR,
        s.gender::VARCHAR, s.date_of_birth,
        s.address::TEXT, s.blood_group::VARCHAR,
        s.father_name::VARCHAR, s.mother_name::VARCHAR,
        s.father_cnic::VARCHAR, s.father_phone::VARCHAR,
        s.admission_date, wr.principal_at,
        wr.reason, wr.effective_date,
        wr.principal_note, wr.coordinator_note,
        (pu.first_name||chr(32)||pu.last_name)::TEXT,
        pu.email::VARCHAR,
        (SELECT ss.value FROM system_settings ss WHERE ss.key=chr(115)||chr(99)||chr(104)||chr(111)||chr(111)||chr(108)||chr(95)||chr(110)||chr(97)||chr(109)||chr(101) LIMIT 1)::TEXT,
        (SELECT ss.value FROM system_settings ss WHERE ss.key=chr(115)||chr(99)||chr(104)||chr(111)||chr(111)||chr(108)||chr(95)||chr(97)||chr(100)||chr(100)||chr(114)||chr(101)||chr(115)||chr(115) LIMIT 1)::TEXT,
        (SELECT ss.value FROM system_settings ss WHERE ss.key=chr(115)||chr(99)||chr(104)||chr(111)||chr(111)||chr(108)||chr(95)||chr(108)||chr(111)||chr(103)||chr(111) LIMIT 1)::TEXT,
        ay.name::VARCHAR
    FROM withdrawal_requests wr
    JOIN students s ON s.id=wr.student_id
    JOIN classes c ON c.id=s.class_id
    JOIN academic_years ay ON ay.is_active=TRUE
    LEFT JOIN users pu ON pu.id=s.parent_id
    WHERE wr.id=p_request_id;
END;
$$;


--
-- Name: sp_get_withdrawal_waivers(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawal_waivers(p_withdrawal_id integer) RETURNS TABLE(id integer, invoice_id integer, waiver_type character varying, waiver_amount numeric, reason text, status character varying, requested_at timestamp with time zone, actioned_at timestamp with time zone, action_note text, new_invoice_id integer, requester_name text, actioner_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT ww.id, ww.invoice_id, ww.waiver_type, ww.waiver_amount, ww.reason,
           ww.status, ww.requested_at, ww.actioned_at, ww.action_note, ww.new_invoice_id,
           (ru.first_name || ' ' || ru.last_name), (au.first_name || ' ' || au.last_name)
    FROM withdrawal_waivers ww
    LEFT JOIN users ru ON ru.id = ww.requested_by
    LEFT JOIN users au ON au.id = ww.actioned_by
    WHERE ww.withdrawal_id = p_withdrawal_id
    ORDER BY ww.requested_at DESC;
$$;


--
-- Name: sp_get_withdrawals_for_classes(integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawals_for_classes(p_class_ids integer[]) RETURNS TABLE(id integer, student_id integer, status character varying, reason text, requested_at timestamp with time zone, effective_date date, documents character varying, student_name text, enrollment_no character varying, class_name character varying, section character varying, requested_by_name text, coordinator_note text, principal_note text, class_id integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT wr.id, wr.student_id, wr.status, wr.reason, wr.requested_at, wr.effective_date,
           wr.documents, (s.first_name||' '||s.last_name), s.enrollment_no,
           c.name, c.section, (u.first_name||' '||u.last_name),
           wr.coordinator_note, wr.principal_note, c.id
    FROM withdrawal_requests wr
    JOIN students s ON s.id = wr.student_id
    JOIN classes c ON c.id = s.class_id
    JOIN users u ON u.id = wr.requested_by
    WHERE s.class_id = ANY(p_class_ids)
    ORDER BY wr.requested_at DESC;
$$;


--
-- Name: sp_get_withdrawn_students_for_teacher(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_withdrawn_students_for_teacher(p_user_id integer) RETURNS TABLE(id integer, student_name text, enrollment_no character varying, status character varying, class_id integer, class_name character varying, section character varying, effective_date date, reason text, withdrawal_date timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT DISTINCT s.id, (s.first_name || ' ' || s.last_name), s.enrollment_no, s.status,
           c.id, c.name, c.section,
           wr.effective_date, wr.reason, wr.requested_at
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN withdrawal_requests wr ON wr.student_id = s.id AND wr.status IN ('approved','withdrawn')
    WHERE s.status = 'withdrawn'
      AND c.id IN (
          SELECT ct.class_id FROM class_teachers ct
          JOIN teachers t ON t.id = ct.teacher_id
          WHERE t.user_id = p_user_id AND ct.is_primary = TRUE
      )
    ORDER BY c.name, (s.first_name || ' ' || s.last_name);
$$;


--
-- Name: sp_get_work_queue(integer, text[], text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_work_queue(p_user_id integer, p_roles text[], p_module text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_priority text DEFAULT NULL::text) RETURNS TABLE(id integer, module text, entity_type text, entity_id integer, title text, description text, action_required text, priority text, assigned_role text, assigned_user_id integer, status text, entity_status text, due_date date, metadata jsonb, submitter_id integer, submitter_name text, assignee_name text, link text, created_at timestamp with time zone, updated_at timestamp with time zone, workflow_instance_id integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT w.* FROM work_queue_items w
        WHERE (p_module IS NULL OR w.module=p_module)
          AND (p_priority IS NULL OR w.priority=p_priority)
          AND (p_status IS NULL OR w.status=p_status)
          AND (
            w.assigned_user_id=p_user_id
            OR (w.assigned_user_id IS NULL AND w.assigned_role=ANY(p_roles))
            OR (w.action_required != 'view' AND (w.submitter_id=p_user_id OR w.created_by=p_user_id))
          )
        ORDER BY w.module, w.entity_id, w.created_at DESC
    )
    SELECT l.id, l.module::TEXT, l.entity_type::TEXT, l.entity_id,
           l.title::TEXT, l.description::TEXT, l.action_required::TEXT, l.priority::TEXT,
           l.assigned_role::TEXT, l.assigned_user_id,
           l.status::TEXT, l.entity_status::TEXT, l.due_date, l.metadata,
           l.submitter_id,
           (su.first_name||' '||su.last_name)::TEXT AS submitter_name,
           COALESCE((au.first_name||' '||au.last_name), l.assigned_role)::TEXT AS assignee_name,
           l.link::TEXT, l.created_at, l.updated_at, l.workflow_instance_id
    FROM base l
    LEFT JOIN users su ON su.id=l.submitter_id
    LEFT JOIN users au ON au.id=l.assigned_user_id;
END;
$$;


--
-- Name: sp_get_work_queue(integer, character varying[], character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_work_queue(p_user_id integer, p_roles character varying[], p_module character varying DEFAULT NULL::character varying, p_priority character varying DEFAULT NULL::character varying, p_status character varying DEFAULT 'pending'::character varying) RETURNS TABLE(id integer, module character varying, entity_type character varying, entity_id integer, title character varying, description text, action_required character varying, priority character varying, assigned_role character varying, assigned_user_id integer, link character varying, status character varying, due_date date, metadata jsonb, created_at timestamp with time zone, is_overdue boolean, submitter_name text, entity_status character varying, assignee_name text)
    LANGUAGE plpgsql
    AS $$ BEGIN RETURN QUERY WITH latest AS (SELECT DISTINCT ON (w.module, w.entity_id) w.* FROM work_queue_items w WHERE (p_module IS NULL OR w.module=p_module) AND (p_priority IS NULL OR w.priority=p_priority) AND (p_status IS NULL OR w.status=p_status) AND (w.assigned_user_id=p_user_id OR (w.assigned_user_id IS NULL AND w.assigned_role=ANY(p_roles)) OR w.submitter_id=p_user_id OR w.created_by=p_user_id) ORDER BY w.module, w.entity_id, w.created_at DESC) SELECT l.id,l.module,l.entity_type,l.entity_id,l.title,l.description,l.action_required,l.priority,l.assigned_role,l.assigned_user_id,l.link,l.status,l.due_date,l.metadata,l.created_at,(l.due_date IS NOT NULL AND l.due_date<CURRENT_DATE AND l.status='pending'),(COALESCE(su.first_name,'')||' '||COALESCE(su.last_name,''))::TEXT,COALESCE(l.entity_status,'submitted')::VARCHAR,CASE WHEN l.assigned_user_id IS NOT NULL THEN (SELECT au.first_name||' '||au.last_name FROM users au WHERE au.id=l.assigned_user_id) WHEN l.assigned_role IS NOT NULL THEN COALESCE((SELECT string_agg(u.first_name||' '||u.last_name,',') FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name=l.assigned_role),initcap(replace(l.assigned_role,'_',' '))) ELSE NULL END FROM latest l LEFT JOIN users cb ON cb.id=l.created_by LEFT JOIN users su ON su.id=l.submitter_id ORDER BY l.created_at DESC; END; $$;


--
-- Name: sp_get_work_queue_count(integer, character varying[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_get_work_queue_count(p_user_id integer, p_roles character varying[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COUNT(*)::INTEGER FROM work_queue_items w
    WHERE w.status = 'pending'
      AND (w.assigned_user_id = p_user_id OR w.assigned_role = ANY(p_roles));
$$;


--
-- Name: sp_grade_submission(integer, numeric, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_grade_submission(p_sub_id integer, p_marks numeric, p_feedback text, p_marked_by integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE assignment_submissions
    SET marks = p_marks, feedback = p_feedback, status = 'graded', marked_at = NOW(), marked_by = p_marked_by
    WHERE id = p_sub_id;
$$;


--
-- Name: sp_init_staff_leave_balances(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_init_staff_leave_balances(p_year integer) RETURNS TABLE(initialized integer, skipped integer)
    LANGUAGE plpgsql
    AS $$DECLARE v_init INT:=0; v_skip INT:=0;
BEGIN
    INSERT INTO staff_leave_balances(user_id, leave_type_id, year, total_days, carried_days)
    SELECT DISTINCT u.id, slp.leave_type_id, p_year, slp.days_per_year,
        CASE WHEN p_year>EXTRACT(YEAR FROM NOW())::INT THEN 0
             ELSE LEAST(slp.carry_forward,
                GREATEST(0, COALESCE((SELECT total_days+carried_days-used_days
                    FROM staff_leave_balances WHERE user_id=u.id AND leave_type_id=slp.leave_type_id
                    AND year=p_year-1),0)))
        END
    FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    JOIN staff_leave_policies slp ON slp.role_id=r.id
    WHERE r.name NOT IN ('student','parent') AND slp.is_active=true
    ON CONFLICT(user_id, leave_type_id, year) DO NOTHING;
    GET DIAGNOSTICS v_init=ROW_COUNT;
    RETURN QUERY SELECT v_init, v_skip;
END;$$;


--
-- Name: sp_insert_leave_approval_rule(integer, integer, integer, character varying, character varying, integer, boolean, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_insert_leave_approval_rule(p_leave_type_id integer, p_day_from integer, p_day_to integer, p_recommender_role character varying, p_approver_role character varying, p_sort_order integer, p_certificate_required boolean, p_certificate_label character varying) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO leave_approval_rules
        (leave_type_id, day_from, day_to, recommender_role, approver_role, sort_order, certificate_required, certificate_label)
    VALUES (p_leave_type_id, p_day_from, p_day_to, p_recommender_role, p_approver_role, p_sort_order, p_certificate_required, p_certificate_label);
$$;


--
-- Name: sp_insert_notification(integer, character varying, text, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_insert_notification(p_user_id integer, p_title character varying, p_body text, p_type character varying, p_link character varying DEFAULT NULL::character varying) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO notifications (user_id, title, body, type, link) VALUES (p_user_id, p_title, p_body, p_type, p_link);
$$;


--
-- Name: sp_issue_book(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_issue_book(p_copy_id integer, p_member_id integer, p_issued_by integer) RETURNS TABLE(transaction_id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_copy_status VARCHAR;
    v_book_id INTEGER;
    v_reserved_res_id INTEGER;
    v_reserved_member_id INTEGER;
    v_member_status VARCHAR;
    v_member_type VARCHAR;
    v_max_books INTEGER;
    v_borrow_days INTEGER;
    v_current_books INTEGER;
    v_pending_fine NUMERIC;
    v_due_date DATE;
    v_tx_id INTEGER;
BEGIN
    SELECT status, book_id INTO v_copy_status, v_book_id FROM library_book_copies WHERE id = p_copy_id;
    IF v_copy_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Book copy not found.'::VARCHAR; RETURN;
    END IF;

    IF v_copy_status = 'reserved' THEN
        SELECT r.id, r.member_id INTO v_reserved_res_id, v_reserved_member_id
        FROM library_reservations r
        WHERE r.book_id = v_book_id AND r.status = 'available'
        ORDER BY r.requested_at ASC LIMIT 1;

        IF v_reserved_member_id IS DISTINCT FROM p_member_id THEN
            RETURN QUERY SELECT NULL::INTEGER, 'This copy is being held for another member''s reservation.'::VARCHAR; RETURN;
        END IF;
    ELSIF v_copy_status != 'available' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'This copy is not available (status: ' || v_copy_status || ').'::VARCHAR; RETURN;
    END IF;

    SELECT status, member_type INTO v_member_status, v_member_type
    FROM library_members WHERE id = p_member_id;
    IF v_member_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Member not found.'::VARCHAR; RETURN;
    END IF;
    IF v_member_status != 'active' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Membership is not active (status: ' || v_member_status || ').'::VARCHAR; RETURN;
    END IF;

    SELECT COALESCE(SUM(fine_amount), 0) INTO v_pending_fine
    FROM library_issue_transactions WHERE member_id = p_member_id AND fine_status = 'pending';
    IF v_pending_fine > 0 THEN
        RETURN QUERY SELECT NULL::INTEGER, ('Member has a pending fine of Rs. ' || v_pending_fine || '. Please clear it first.')::VARCHAR; RETURN;
    END IF;

    SELECT max_books, borrow_days INTO v_max_books, v_borrow_days
    FROM library_membership_rules WHERE member_type = v_member_type;

    SELECT COUNT(*) INTO v_current_books
    FROM library_issue_transactions WHERE member_id = p_member_id AND returned_at IS NULL;
    IF v_current_books >= v_max_books THEN
        RETURN QUERY SELECT NULL::INTEGER, ('Member has reached the maximum of ' || v_max_books || ' books.')::VARCHAR; RETURN;
    END IF;

    v_due_date := CURRENT_DATE + (v_borrow_days || ' days')::INTERVAL;

    INSERT INTO library_issue_transactions (copy_id, member_id, issued_by, due_date)
    VALUES (p_copy_id, p_member_id, p_issued_by, v_due_date)
    RETURNING id INTO v_tx_id;
    -- trg_issue_insert sets the copy status to 'issued'

    IF v_reserved_res_id IS NOT NULL THEN
        UPDATE library_reservations SET status = 'fulfilled' WHERE id = v_reserved_res_id;
    END IF;

    RETURN QUERY SELECT v_tx_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_issue_po(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_issue_po(p_po_id integer) RETURNS TABLE(error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_item_count INTEGER;
BEGIN
    SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT 'Purchase Order not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'draft' THEN
        RETURN QUERY SELECT 'This Purchase Order has already been issued.'::VARCHAR; RETURN;
    END IF;

    SELECT COUNT(*) INTO v_item_count FROM po_items WHERE po_id = p_po_id AND unit_price <= 0;
    IF v_item_count > 0 THEN
        RETURN QUERY SELECT 'All items must have a unit price greater than zero before issuing.'::VARCHAR; RETURN;
    END IF;

    UPDATE purchase_orders SET status = 'issued', issued_at = NOW() WHERE id = p_po_id;
    RETURN QUERY SELECT NULL::VARCHAR;
END;
$$;


--
-- Name: sp_list_academic_years(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_academic_years() RETURNS SETOF public.academic_years
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM academic_years ORDER BY start_date DESC;
$$;


--
-- Name: sp_list_assignments(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_assignments(p_class_id integer, p_subject_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, title character varying, description text, due_date date, total_marks numeric, status character varying, created_at timestamp with time zone, file_name character varying, file_path character varying, file_type character varying, file_size bigint, subject_name character varying, class_name character varying, section character varying, teacher_name text, submission_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT a.id, a.class_id, a.subject_id, a.teacher_id, a.title, a.description,
           a.due_date, a.total_marks, a.status, a.created_at,
           a.file_name, a.file_path, a.file_type, a.file_size,
           s.name, c.name, c.section, (t.first_name || ' ' || t.last_name),
           (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id)
    FROM assignments a
    JOIN subjects s ON s.id = a.subject_id
    JOIN classes c ON c.id = a.class_id
    JOIN teachers t ON t.id = a.teacher_id
    WHERE (p_class_id IS NULL OR a.class_id = p_class_id)
      AND (p_subject_id IS NULL OR a.subject_id = p_subject_id)
    ORDER BY a.due_date DESC;
$$;


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    event_date date NOT NULL,
    end_date date,
    event_type character varying(50) DEFAULT 'event'::character varying NOT NULL,
    is_holiday boolean DEFAULT false,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: sp_list_calendar_events(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_calendar_events(p_year integer, p_month integer) RETURNS SETOF public.calendar_events
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM calendar_events
    WHERE EXTRACT(YEAR FROM event_date) = p_year
      AND (p_month IS NULL OR EXTRACT(MONTH FROM event_date) = p_month)
    ORDER BY event_date;
$$;


--
-- Name: sp_list_classes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_classes() RETURNS TABLE(id integer, name character varying, section character varying, academic_year_id integer, capacity integer, room_number character varying, class_type character varying, year_name character varying, student_count bigint, teacher_count bigint, subject_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.name, c.section, c.academic_year_id, c.capacity,
           c.room_number, c.class_type, ay.name,
           COUNT(DISTINCT s.id), COUNT(DISTINCT ct.teacher_id), COUNT(DISTINCT cs2.subject_id)
    FROM classes c
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
    LEFT JOIN class_teachers ct ON ct.class_id = c.id
    LEFT JOIN class_subjects cs2 ON cs2.class_id = c.id
    GROUP BY c.id, ay.name
    ORDER BY c.name;
$$;


--
-- Name: sp_list_designation_grades(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_designation_grades() RETURNS TABLE(id integer, designation_id integer, designation_name character varying, department_id integer, department_name character varying, grade_id integer, grade_name character varying)
    LANGUAGE sql
    AS $$
    SELECT sdg.id, d.id, d.name, d.department_id, dept.name, g.id, g.name
    FROM staff_designation_grades sdg
    JOIN designations d ON d.id = sdg.designation_id
    LEFT JOIN departments dept ON dept.id = d.department_id
    JOIN payroll_grades g ON g.id = sdg.grade_id
    ORDER BY dept.name, d.name;
$$;


--
-- Name: sp_list_diary_entries(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_diary_entries(p_class_id integer, p_date date) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, date date, classwork text, homework text, notes text, status character varying, created_at timestamp with time zone, updated_at timestamp with time zone, subject_name character varying, subject_code character varying, teacher_name text, class_name character varying, section character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT dd.id, dd.class_id, dd.subject_id, dd.teacher_id, dd.date,
           dd.classwork, dd.homework, dd.notes, dd.status, dd.created_at, dd.updated_at,
           s.name, s.code, (t.first_name || ' ' || t.last_name), c.name, c.section
    FROM daily_diary dd
    JOIN subjects s ON s.id = dd.subject_id
    JOIN teachers t ON t.id = dd.teacher_id
    JOIN classes c ON c.id = dd.class_id
    WHERE (p_class_id IS NULL OR dd.class_id = p_class_id)
      AND (p_date IS NULL OR dd.date = p_date)
    ORDER BY s.name;
$$;


--
-- Name: event_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(20) DEFAULT '#2563eb'::character varying NOT NULL,
    is_holiday boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: sp_list_event_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_event_types() RETURNS SETOF public.event_types
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM event_types WHERE is_active = TRUE ORDER BY name;
$$;


--
-- Name: sp_list_grades(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_grades() RETURNS TABLE(id integer, name character varying, description text, is_active boolean, component_count bigint)
    LANGUAGE sql
    AS $$
    SELECT g.id, g.name, g.description, g.is_active, COUNT(gc.id)
    FROM payroll_grades g
    LEFT JOIN payroll_grade_components gc ON gc.grade_id = g.id
    GROUP BY g.id
    ORDER BY g.name;
$$;


--
-- Name: sp_list_materials(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_materials(p_class_id integer, p_subject_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, title character varying, description text, file_name character varying, file_path character varying, file_type character varying, file_size bigint, created_at timestamp with time zone, subject_name character varying, teacher_name text, class_name character varying, section character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT sm.id, sm.class_id, sm.subject_id, sm.teacher_id, sm.title,
           sm.description, sm.file_name, sm.file_path, sm.file_type, sm.file_size,
           sm.created_at, s.name, (t.first_name || ' ' || t.last_name), c.name, c.section
    FROM study_materials sm
    JOIN subjects s ON s.id = sm.subject_id
    JOIN teachers t ON t.id = sm.teacher_id
    JOIN classes c ON c.id = sm.class_id
    WHERE (p_class_id IS NULL OR sm.class_id = p_class_id)
      AND (p_subject_id IS NULL OR sm.subject_id = p_subject_id)
    ORDER BY sm.created_at DESC;
$$;


--
-- Name: sp_list_notifications(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_notifications(p_user_id integer) RETURNS TABLE(id integer, title character varying, message text, type character varying, is_read boolean, link character varying, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, title, COALESCE(body, message), type, is_read, link, created_at
    FROM notifications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 20;
$$;


--
-- Name: sp_list_payroll_adjustments(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_payroll_adjustments(p_staff_id integer, p_month integer, p_year integer) RETURNS TABLE(id integer, staff_id integer, staff_name text, component_id integer, component_name character varying, component_type character varying, month integer, year integer, amount numeric, note text, created_at timestamp without time zone)
    LANGUAGE sql
    AS $$
    SELECT pa.id, pa.staff_id, (s.first_name || ' ' || s.last_name)::TEXT, pa.component_id, c.name,
        c.component_type, pa.month, pa.year, pa.amount, pa.note, pa.created_at
    FROM payroll_adjustments pa
    JOIN staff s ON s.id = pa.staff_id
    JOIN payroll_components c ON c.id = pa.component_id
    WHERE (p_staff_id IS NULL OR pa.staff_id = p_staff_id)
      AND (p_month IS NULL OR pa.month = p_month)
      AND (p_year IS NULL OR pa.year = p_year)
    ORDER BY pa.created_at DESC;
$$;


--
-- Name: sp_list_payroll_components(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_payroll_components(p_component_type character varying DEFAULT NULL::character varying) RETURNS TABLE(id integer, name character varying, component_type character varying, calculation_type character varying, is_permanent boolean, is_taxable boolean, is_statutory boolean, is_active boolean, is_basic boolean, is_income_tax boolean)
    LANGUAGE sql
    AS $$
    SELECT id, name, component_type, calculation_type, is_permanent, is_taxable, is_statutory, is_active, is_basic, is_income_tax
    FROM payroll_components
    WHERE p_component_type IS NULL OR component_type = p_component_type
    ORDER BY component_type, name;
$$;


--
-- Name: sp_list_payroll_runs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_payroll_runs() RETURNS TABLE(id integer, month integer, year integer, status character varying, created_at timestamp without time zone, submitted_at timestamp without time zone, finalized_at timestamp without time zone, from_date date, to_date date, payslip_count bigint, total_net_pay numeric, employees_ready bigint, total_active_staff bigint, adjustments_count bigint)
    LANGUAGE sql
    AS $$
    SELECT r.id, r.month, r.year, r.status, r.created_at, r.submitted_at, r.finalized_at, r.from_date, r.to_date,
        COUNT(DISTINCT p.id), COALESCE(SUM(p.net_pay), 0),
        (SELECT COUNT(*) FROM staff s JOIN staff_payroll_profile spp ON spp.staff_id = s.id
            WHERE s.status='active' AND spp.salary_type IS NOT NULL),
        (SELECT COUNT(*) FROM staff s WHERE s.status='active'),
        (SELECT COUNT(*) FROM payroll_adjustments a WHERE a.month = r.month AND a.year = r.year)
    FROM payroll_runs r
    LEFT JOIN payroll_payslips p ON p.payroll_run_id = r.id
    GROUP BY r.id
    ORDER BY r.year DESC, r.month DESC;
$$;


--
-- Name: sp_list_payslips(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_payslips(p_run_id integer) RETURNS TABLE(id integer, staff_id integer, staff_name text, salary_type character varying, gross_earnings numeric, total_deductions numeric, net_pay numeric, earnings_breakdown jsonb, deductions_breakdown jsonb, days_present numeric, days_absent numeric, days_half_day numeric, days_on_leave numeric, hours_worked numeric)
    LANGUAGE sql
    AS $$
    SELECT p.id, p.staff_id, (s.first_name || ' ' || s.last_name)::TEXT, p.salary_type, p.gross_earnings,
        p.total_deductions, p.net_pay, p.earnings_breakdown, p.deductions_breakdown,
        p.days_present, p.days_absent, p.days_half_day, p.days_on_leave, p.hours_worked
    FROM payroll_payslips p
    JOIN staff s ON s.id = p.staff_id
    WHERE p.payroll_run_id = p_run_id
    ORDER BY s.first_name;
$$;


--
-- Name: sp_list_quizzes(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_quizzes(p_student_id integer, p_class_id integer, p_subject_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, title character varying, description text, due_date timestamp with time zone, total_marks integer, status character varying, created_at timestamp with time zone, subject_name character varying, class_name character varying, section character varying, teacher_name text, question_count bigint, submission_count bigint, my_marks integer, my_percentage numeric, my_submitted_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT q.id, q.class_id, q.subject_id, q.teacher_id, q.title, q.description,
           q.due_date, q.total_marks, q.status, q.created_at,
           s.name, c.name, c.section, (t.first_name || ' ' || t.last_name),
           (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id),
           (SELECT COUNT(*) FROM quiz_submissions WHERE quiz_id = q.id),
           qs.marks, qs.percentage, qs.submitted_at
    FROM quizzes q
    JOIN subjects s ON s.id = q.subject_id
    JOIN classes c ON c.id = q.class_id
    JOIN teachers t ON t.id = q.teacher_id
    LEFT JOIN quiz_submissions qs ON qs.quiz_id = q.id AND qs.student_id = p_student_id
    WHERE (p_class_id IS NULL OR q.class_id = p_class_id)
      AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    ORDER BY q.due_date DESC;
$$;


--
-- Name: sp_list_students(integer, character varying, character varying, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_students(p_class_id integer, p_status character varying, p_search character varying, p_limit integer, p_offset integer) RETURNS TABLE(id integer, enrollment_no character varying, first_name character varying, last_name character varying, gender character varying, status character varying, admission_date date, class_name character varying, class_section character varying, email character varying)
    LANGUAGE sql STABLE
    AS $$
    SELECT s.id, s.enrollment_no, s.first_name, s.last_name,
           s.gender, s.status, s.admission_date,
           c.name, c.section, u.email
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE (p_class_id IS NULL OR s.class_id = p_class_id)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_search IS NULL OR (
          s.first_name ILIKE '%' || p_search || '%'
          OR s.last_name ILIKE '%' || p_search || '%'
          OR s.enrollment_no ILIKE '%' || p_search || '%'
      ))
    ORDER BY s.first_name, s.last_name
    LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: sp_list_subjects(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_subjects() RETURNS SETOF public.subjects
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM subjects ORDER BY name;
$$;


--
-- Name: sp_list_syllabus(integer, character varying, boolean, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_syllabus(p_user_id integer, p_role character varying, p_has_manage_perm boolean, p_class_id integer, p_subject_id integer, p_year_id integer, p_parent_student_id integer) RETURNS TABLE(id integer, title character varying, description text, class_name character varying, section character varying, subject_name character varying, subject_code character varying, academic_year character varying, academic_year_id integer, class_id integer, subject_id integer, created_at timestamp with time zone, total_topics bigint, covered_topics bigint, teacher_names text)
    LANGUAGE sql STABLE
    AS $$
    SELECT sy.id, sy.title, sy.description,
           c.name, c.section, s.name, s.code, ay.name,
           sy.academic_year_id, sy.class_id, sy.subject_id, sy.created_at,
           COUNT(DISTINCT st.id), COUNT(DISTINCT sp.id),
           STRING_AGG(DISTINCT t.first_name || ' ' || t.last_name, ', ')
    FROM syllabus sy
    JOIN classes c ON c.id = sy.class_id
    JOIN subjects s ON s.id = sy.subject_id
    JOIN academic_years ay ON ay.id = sy.academic_year_id
    LEFT JOIN syllabus_topics st ON st.syllabus_id = sy.id
    LEFT JOIN syllabus_progress sp ON sp.topic_id = st.id
    LEFT JOIN teacher_subjects ts ON ts.subject_id = sy.subject_id
    LEFT JOIN class_teachers ct ON ct.class_id = sy.class_id AND ct.teacher_id = ts.teacher_id
    LEFT JOIN teachers t ON t.id = ct.teacher_id
    WHERE (p_class_id IS NULL OR sy.class_id = p_class_id)
      AND (p_subject_id IS NULL OR sy.subject_id = p_subject_id)
      AND (p_year_id IS NULL OR sy.academic_year_id = p_year_id)
      AND (
          p_role IS DISTINCT FROM 'teacher' OR p_has_manage_perm OR (
              sy.class_id IN (
                  SELECT ct2.class_id FROM class_teachers ct2 JOIN teachers t2 ON t2.id = ct2.teacher_id
                  WHERE t2.user_id = p_user_id AND ct2.is_primary = TRUE
              )
              OR (
                  sy.class_id IN (
                      SELECT ct2.class_id FROM class_teachers ct2 JOIN teachers t2 ON t2.id = ct2.teacher_id
                      WHERE t2.user_id = p_user_id AND ct2.is_primary = FALSE
                  )
                  AND sy.subject_id IN (
                      SELECT ts2.subject_id FROM teacher_subjects ts2 JOIN teachers t2 ON t2.id = ts2.teacher_id
                      WHERE t2.user_id = p_user_id
                  )
              )
          )
      )
      AND (
          p_role IS DISTINCT FROM 'student' OR sy.class_id = (SELECT class_id FROM students WHERE user_id = p_user_id)
      )
      AND (
          p_role IS DISTINCT FROM 'parent' OR (
              CASE WHEN p_parent_student_id IS NOT NULL
                  THEN sy.class_id = (SELECT class_id FROM students WHERE id = p_parent_student_id AND parent_id = p_user_id)
                  ELSE sy.class_id IN (SELECT class_id FROM students WHERE parent_id = p_user_id)
              END
          )
      )
    GROUP BY sy.id, sy.title, sy.description, c.name, c.section, s.name, s.code,
             ay.name, sy.academic_year_id, sy.class_id, sy.subject_id, sy.created_at
    ORDER BY c.name, s.name;
$$;


--
-- Name: sp_list_tax_slab_sets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_tax_slab_sets() RETURNS TABLE(id integer, name character varying, is_active boolean, slab_count bigint)
    LANGUAGE sql
    AS $$
    SELECT s.id, s.name, s.is_active, COUNT(t.id)
    FROM payroll_tax_slab_sets s
    LEFT JOIN payroll_tax_slabs t ON t.slab_set_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC;
$$;


--
-- Name: sp_list_teachers(character varying, character varying, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_teachers(p_status character varying, p_search character varying, p_limit integer, p_offset integer) RETURNS TABLE(id integer, employee_no character varying, first_name character varying, last_name character varying, qualification character varying, specialization character varying, status character varying, join_date date, email character varying, phone character varying, subject_count bigint, subject_names text, class_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT t.id, t.employee_no, t.first_name, t.last_name,
           t.qualification, t.specialization, t.status,
           t.join_date, u.email, u.phone,
           COUNT(DISTINCT ts.subject_id), STRING_AGG(DISTINCT s2.name, ', ' ORDER BY s2.name),
           COUNT(DISTINCT ct.class_id)
    FROM teachers t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.id
    LEFT JOIN subjects s2 ON s2.id = ts.subject_id
    LEFT JOIN class_teachers ct ON ct.teacher_id = t.id
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_search IS NULL OR (
          t.first_name ILIKE '%' || p_search || '%'
          OR t.last_name ILIKE '%' || p_search || '%'
          OR t.employee_no ILIKE '%' || p_search || '%'
          OR u.email ILIKE '%' || p_search || '%'
      ))
    GROUP BY t.id, t.employee_no, t.first_name, t.last_name,
             t.qualification, t.specialization, t.status,
             t.join_date, u.email, u.phone
    ORDER BY t.first_name, t.last_name
    LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: sp_list_timetable(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_timetable(p_class_id integer) RETURNS TABLE(id integer, class_id integer, subject_id integer, teacher_id integer, day_of_week integer, start_time text, end_time text, room_number character varying, class_name character varying, subject_name character varying, subject_code character varying, teacher_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT t.id, t.class_id, t.subject_id, t.teacher_id,
           t.day_of_week, t.start_time::TEXT, t.end_time::TEXT, t.room_number,
           c.name, s.name, s.code, (te.first_name || ' ' || te.last_name)
    FROM timetable t
    JOIN classes  c  ON c.id  = t.class_id
    JOIN subjects s  ON s.id  = t.subject_id
    JOIN teachers te ON te.id = t.teacher_id
    WHERE p_class_id IS NULL OR t.class_id = p_class_id
    ORDER BY t.class_id, t.day_of_week, t.start_time;
$$;


--
-- Name: sp_list_users(character varying, character varying, boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_list_users(p_search character varying, p_role character varying, p_is_active boolean, p_limit integer, p_offset integer) RETURNS TABLE(id integer, email character varying, first_name character varying, last_name character varying, phone character varying, is_active boolean, is_verified boolean, last_login_at timestamp with time zone, created_at timestamp without time zone, roles text[])
    LANGUAGE sql STABLE
    AS $$
    SELECT u.id, u.email, u.first_name, u.last_name,
           u.phone, u.is_active, u.is_verified,
           u.last_login_at, u.created_at,
           COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::TEXT[])
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE (p_search IS NULL OR (
              u.first_name ILIKE '%' || p_search || '%'
              OR u.last_name ILIKE '%' || p_search || '%'
              OR u.email ILIKE '%' || p_search || '%'
              OR COALESCE(u.phone,'') ILIKE '%' || p_search || '%'
              OR (u.first_name || ' ' || u.last_name) ILIKE '%' || p_search || '%'
          ))
      AND (p_role IS NULL OR u.id IN (
              SELECT ur2.user_id FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE r2.name = p_role
          ))
      AND (p_is_active IS NULL OR u.is_active = p_is_active)
    GROUP BY u.id, u.email, u.first_name, u.last_name,
             u.phone, u.is_active, u.is_verified, u.last_login_at, u.created_at
    ORDER BY u.created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: sp_mark_all_notifications_read(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_mark_all_notifications_read(p_user_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE notifications SET is_read = TRUE WHERE user_id = p_user_id AND is_read = FALSE;
$$;


--
-- Name: sp_mark_announcement_read(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_mark_announcement_read(p_ann_id integer, p_user_id integer) RETURNS TABLE(success boolean, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO announcement_reads(announcement_id, user_id)
    VALUES(p_ann_id, p_user_id)
    ON CONFLICT(announcement_id, user_id) DO NOTHING;
    RETURN QUERY SELECT TRUE, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_mark_attendance(integer, date, jsonb, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_mark_attendance(p_class_id integer, p_date date, p_records jsonb, p_marked_by integer, p_subject_id integer DEFAULT NULL::integer) RETURNS TABLE(success boolean, message character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_holiday_title VARCHAR;
    v_rec           JSONB;
    v_student_id    INTEGER;
    v_status        VARCHAR;
BEGIN
    -- Check holiday
    SELECT title INTO v_holiday_title FROM calendar_events
    WHERE is_holiday = TRUE AND p_date BETWEEN event_date AND COALESCE(end_date, event_date)
    LIMIT 1;

    IF v_holiday_title IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, ('Holiday: ' || v_holiday_title)::VARCHAR;
        RETURN;
    END IF;

    -- Insert/update each record
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        v_student_id := (v_rec->>'student_id')::INTEGER;
        v_status     := v_rec->>'status';

        INSERT INTO attendance(student_id, class_id, subject_id, date, status, marked_by)
        VALUES (v_student_id, p_class_id, p_subject_id, p_date, v_status, p_marked_by)
        ON CONFLICT (student_id, class_id, date, COALESCE(subject_id, 0))
        DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by;
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Attendance marked successfully'::VARCHAR;
END;
$$;


--
-- Name: sp_mark_leave_attendance(integer, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_mark_leave_attendance(p_student_id integer, p_from_date date, p_to_date date, p_marked_by integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_class_id INT;
    v_date     DATE;
BEGIN
    SELECT s.class_id INTO v_class_id FROM students s WHERE s.id = p_student_id;

    FOR v_date IN
        SELECT d::date FROM generate_series(p_from_date, p_to_date, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
    LOOP
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE v_date BETWEEN ce.event_date AND COALESCE(ce.end_date, ce.event_date)
              AND ce.is_holiday = TRUE
        );

        INSERT INTO attendance(student_id, class_id, date, status, marked_by)
        VALUES(p_student_id, v_class_id, v_date, 'on_leave', p_marked_by)
        ON CONFLICT (student_id, class_id, date, COALESCE(subject_id, 0))
        DO UPDATE SET status = 'on_leave', updated_at = NOW();
    END LOOP;
END;
$$;


--
-- Name: sp_mark_notification_read(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_mark_notification_read(p_id integer, p_user_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE notifications SET is_read = TRUE WHERE id = p_id AND user_id = p_user_id;
$$;


--
-- Name: sp_mark_syllabus_topic(integer, character varying, integer, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_mark_syllabus_topic(p_topic_id integer, p_action character varying, p_covered_by integer, p_covered_at timestamp with time zone, p_note text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_action = 'cover' THEN
        INSERT INTO syllabus_progress (topic_id, covered_by, covered_at, note)
        VALUES (p_topic_id, p_covered_by, p_covered_at, p_note)
        ON CONFLICT (topic_id) DO UPDATE SET covered_by = p_covered_by, covered_at = p_covered_at, note = p_note;
    ELSE
        DELETE FROM syllabus_progress WHERE topic_id = p_topic_id;
    END IF;
END;
$$;


--
-- Name: sp_match_approval_rule(numeric, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_match_approval_rule(p_amount numeric, p_department_id integer, p_item_category_id integer, p_is_emergency boolean) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_rule_id INTEGER;
BEGIN
    SELECT r.id INTO v_rule_id
    FROM procurement_approval_rules r
    WHERE r.is_active = TRUE
      AND (r.min_amount IS NULL OR p_amount >= r.min_amount)
      AND (r.max_amount IS NULL OR p_amount <= r.max_amount)
      AND (r.department_id IS NULL OR r.department_id = p_department_id)
      AND (r.item_category_id IS NULL OR r.item_category_id = p_item_category_id)
      AND (r.is_emergency IS NULL OR r.is_emergency = p_is_emergency)
    ORDER BY r.priority DESC, r.id ASC
    LIMIT 1;

    RETURN v_rule_id;
END;
$$;


--
-- Name: sp_open_marks_entry(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_open_marks_entry(p_exam_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE exams SET status='marks_open'
    WHERE exams.id=p_exam_id AND exams.status IN ('draft','scheduled');
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_pay_fine(integer, numeric, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_pay_fine(p_transaction_id integer, p_amount numeric, p_method character varying, p_received_by integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pay_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM library_issue_transactions lit WHERE lit.id = p_transaction_id AND lit.fine_status = 'pending') THEN
        RETURN QUERY SELECT NULL::INTEGER, 'No pending fine found for this transaction.'::VARCHAR; RETURN;
    END IF;

    INSERT INTO library_fine_payments (transaction_id, amount_paid, method, received_by)
    VALUES (p_transaction_id, p_amount, p_method, p_received_by)
    RETURNING library_fine_payments.id INTO v_pay_id;

    UPDATE library_issue_transactions SET fine_status = 'paid' WHERE library_issue_transactions.id = p_transaction_id;

    RETURN QUERY SELECT v_pay_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_place_reservation(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_place_reservation(p_book_id integer, p_member_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_member_status VARCHAR;
    v_available INTEGER;
    v_res_id INTEGER;
BEGIN
    SELECT status INTO v_member_status FROM library_members WHERE library_members.id = p_member_id;
    IF v_member_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Member not found.'::VARCHAR; RETURN;
    END IF;
    IF v_member_status != 'active' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Membership is not active.'::VARCHAR; RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM library_reservations
        WHERE book_id = p_book_id AND member_id = p_member_id AND status IN ('waiting','available')
    ) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'You already have an active reservation for this book.'::VARCHAR; RETURN;
    END IF;

    SELECT COUNT(*) INTO v_available FROM library_book_copies WHERE book_id = p_book_id AND status = 'available';
    IF v_available > 0 THEN
        RETURN QUERY SELECT NULL::INTEGER, 'This book has copies available right now \xe2\x80\x94 issue it directly instead of reserving.'::VARCHAR; RETURN;
    END IF;

    INSERT INTO library_reservations (book_id, member_id) VALUES (p_book_id, p_member_id)
    RETURNING library_reservations.id INTO v_res_id;

    RETURN QUERY SELECT v_res_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_publish_datesheet(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_publish_datesheet(p_exam_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE exams SET
        datesheet_published=TRUE,
        datesheet_published_at=NOW(),
        datesheet_published_by=p_user_id,
        datesheet_status='published',
        status=CASE WHEN status='draft' THEN 'scheduled' ELSE status END
    WHERE exams.id=p_exam_id;
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_publish_diary(integer, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_publish_diary(p_class_id integer, p_date date, p_teacher_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO diary_publish (class_id, date, published_by)
    VALUES (p_class_id, p_date, p_teacher_id)
    ON CONFLICT (class_id, date) DO UPDATE SET published_by = p_teacher_id, published_at = NOW();
$$;


--
-- Name: sp_publish_exam_results(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_publish_exam_results(p_exam_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE exams SET status='published',
        published_by=p_user_id, published_at=NOW()
    WHERE exams.id=p_exam_id;
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_reactivate_approval_rule(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_approval_rule(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_approval_rules SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_author(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_author(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_authors SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_category(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_category(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_categories SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_department(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_department(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE departments SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_item(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_item(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_items SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_publisher(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_publisher(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_publishers SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_student(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_student(p_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
    v_user_id INTEGER;
BEGIN
    SELECT user_id INTO v_user_id FROM students WHERE id = p_id;
    UPDATE students SET status = 'active' WHERE id = p_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 AND v_user_id IS NOT NULL THEN
        UPDATE users SET is_active = TRUE WHERE id = v_user_id;
    END IF;
    RETURN v_count > 0;
END;
$$;


--
-- Name: sp_reactivate_subject(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_subject(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE subjects SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_reactivate_teacher(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_teacher(p_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
    v_user_id INTEGER;
BEGIN
    SELECT user_id INTO v_user_id FROM teachers WHERE id = p_id;
    UPDATE teachers SET status = 'active' WHERE id = p_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 AND v_user_id IS NOT NULL THEN
        UPDATE users SET is_active = TRUE WHERE id = v_user_id;
    END IF;
    RETURN v_count > 0;
END;
$$;


--
-- Name: sp_reactivate_user(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_user(p_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE users SET is_active = TRUE WHERE id = p_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;


--
-- Name: sp_reactivate_vendor(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reactivate_vendor(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_vendors SET is_active = TRUE WHERE id = p_id;
$$;


--
-- Name: sp_recommend_leave(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_recommend_leave(p_request_id integer, p_recommended_by integer, p_note text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_status VARCHAR;
BEGIN
    SELECT lr.status INTO v_status FROM leave_requests lr WHERE lr.id = p_request_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::INT, 'Leave request not found'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'pending' THEN
        RETURN QUERY SELECT NULL::INT, ('Cannot recommend a request with status: ' || v_status)::VARCHAR; RETURN;
    END IF;

    UPDATE leave_requests SET
        status = 'recommended',
        recommended_by = p_recommended_by,
        recommended_at = NOW(),
        recommender_note = p_note
    WHERE leave_requests.id = p_request_id;

    RETURN QUERY SELECT p_request_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_record_attendance(jsonb, integer, date, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_record_attendance(IN p_records jsonb, IN p_class_id integer, IN p_date date, IN p_marked_by integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO attendance(student_id, class_id, date, status, marked_by)
    SELECT (rec->>'student_id')::INT, p_class_id, p_date, rec->>'status', p_marked_by
    FROM jsonb_array_elements(p_records) AS rec
    ON CONFLICT DO NOTHING;
    COMMIT;
END;
$$;


--
-- Name: sp_record_password_attempt(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_record_password_attempt(p_user_id integer, p_success boolean) RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts_remaining integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_max_attempts INTEGER;
    v_lockout_minutes INTEGER;
    v_current_attempts INTEGER;
    v_locked_until TIMESTAMPTZ;
BEGIN
    SELECT COALESCE((SELECT value::INTEGER FROM system_settings WHERE category='security' AND key='max_failed_attempts'), 5) INTO v_max_attempts;
    SELECT COALESCE((SELECT value::INTEGER FROM system_settings WHERE category='security' AND key='lockout_duration_minutes'), 15) INTO v_lockout_minutes;

    SELECT u.failed_login_attempts, u.locked_until INTO v_current_attempts, v_locked_until
    FROM users u WHERE u.id = p_user_id;

    -- Auto-clear an expired lock
    IF v_locked_until IS NOT NULL AND v_locked_until <= NOW() THEN
        UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = p_user_id;
        v_locked_until := NULL;
        v_current_attempts := 0;
    END IF;

    -- Still locked from before?
    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN QUERY SELECT TRUE, v_locked_until, 0;
        RETURN;
    END IF;

    IF p_success THEN
        UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = p_user_id;
        RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, v_max_attempts;
        RETURN;
    ELSE
        v_current_attempts := COALESCE(v_current_attempts, 0) + 1;
        IF v_current_attempts >= v_max_attempts THEN
            v_locked_until := NOW() + (v_lockout_minutes || ' minutes')::INTERVAL;
            UPDATE users SET failed_login_attempts = v_current_attempts, locked_until = v_locked_until WHERE id = p_user_id;
            RETURN QUERY SELECT TRUE, v_locked_until, 0;
            RETURN;
        ELSE
            UPDATE users SET failed_login_attempts = v_current_attempts WHERE id = p_user_id;
            RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, (v_max_attempts - v_current_attempts);
            RETURN;
        END IF;
    END IF;
END;
$$;


--
-- Name: sp_reject_waiver(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_reject_waiver(p_waiver_id integer, p_actioned_by integer, p_note text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE v_withdrawal_id INTEGER;
BEGIN
    SELECT withdrawal_id INTO v_withdrawal_id FROM withdrawal_waivers WHERE id = p_waiver_id;
    UPDATE withdrawal_waivers SET status = 'rejected', actioned_by = p_actioned_by,
        actioned_at = NOW(), action_note = p_note WHERE id = p_waiver_id;
    UPDATE withdrawal_clearances SET waiver_requested = FALSE, waiver_id = NULL
    WHERE request_id = v_withdrawal_id AND department = 'finance';
END;
$$;


--
-- Name: sp_remove_class_subject(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_remove_class_subject(p_class_id integer, p_subject_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM class_subjects WHERE class_id = p_class_id AND subject_id = p_subject_id;
$$;


--
-- Name: sp_remove_department_head(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_remove_department_head(p_department_id integer, p_user_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN
    UPDATE departments SET head_user_id=NULL
    WHERE id=p_department_id AND head_user_id=p_user_id;
END;$$;


--
-- Name: sp_remove_designation_grade(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_remove_designation_grade(p_designation_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM staff_designation_grades WHERE designation_id = p_designation_id;
$$;


--
-- Name: sp_remove_grade_component(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_remove_grade_component(p_grade_id integer, p_component_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM payroll_grade_components WHERE grade_id = p_grade_id AND component_id = p_component_id;
$$;


--
-- Name: sp_remove_grade_department_component(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_remove_grade_department_component(p_grade_id integer, p_department_id integer, p_component_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM payroll_grade_department_components WHERE grade_id = p_grade_id AND department_id = p_department_id AND component_id = p_component_id;
$$;


--
-- Name: sp_remove_pr_item(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_remove_pr_item(p_item_row_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pr_id INTEGER;
BEGIN
    SELECT pr_id INTO v_pr_id FROM pr_items WHERE id = p_item_row_id;
    DELETE FROM pr_items WHERE id = p_item_row_id;

    IF v_pr_id IS NOT NULL THEN
        UPDATE purchase_requisitions
        SET total_estimated_amount = (
            SELECT COALESCE(SUM(quantity * COALESCE(estimated_unit_price, 0)), 0) FROM pr_items WHERE pr_id = v_pr_id
        )
        WHERE id = v_pr_id;
    END IF;
END;
$$;


--
-- Name: sp_renew_book(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_renew_book(p_transaction_id integer) RETURNS TABLE(new_due_date date, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_due_date DATE;
    v_returned_at TIMESTAMPTZ;
    v_renewal_count INTEGER;
    v_member_id INTEGER;
    v_member_type VARCHAR;
    v_copy_id INTEGER;
    v_book_id INTEGER;
    v_renewal_limit INTEGER;
    v_borrow_days INTEGER;
    v_new_due DATE;
    v_waiting_count INTEGER;
BEGIN
    SELECT it.due_date, it.returned_at, it.renewal_count, it.member_id, it.copy_id
    INTO v_due_date, v_returned_at, v_renewal_count, v_member_id, v_copy_id
    FROM library_issue_transactions it WHERE it.id = p_transaction_id;

    IF v_due_date IS NULL THEN
        RETURN QUERY SELECT NULL::DATE, 'Transaction not found.'::VARCHAR; RETURN;
    END IF;
    IF v_returned_at IS NOT NULL THEN
        RETURN QUERY SELECT NULL::DATE, 'This book has already been returned.'::VARCHAR; RETURN;
    END IF;
    IF v_due_date < CURRENT_DATE THEN
        RETURN QUERY SELECT NULL::DATE, 'This book is overdue. Please return or clear dues before renewing.'::VARCHAR; RETURN;
    END IF;

    SELECT bc.book_id INTO v_book_id FROM library_book_copies bc WHERE bc.id = v_copy_id;
    SELECT lm.member_type INTO v_member_type FROM library_members lm WHERE lm.id = v_member_id;
    SELECT mr.renewal_limit, mr.borrow_days INTO v_renewal_limit, v_borrow_days
    FROM library_membership_rules mr WHERE mr.member_type = v_member_type;

    IF v_renewal_count >= v_renewal_limit THEN
        RETURN QUERY SELECT NULL::DATE, ('Renewal limit of ' || v_renewal_limit || ' reached for this book.')::VARCHAR; RETURN;
    END IF;

    SELECT COUNT(*) INTO v_waiting_count FROM library_reservations r WHERE r.book_id = v_book_id AND r.status = 'waiting';
    IF v_waiting_count > 0 THEN
        RETURN QUERY SELECT NULL::DATE, 'Cannot renew \xe2\x80\x94 another member is waiting for this book.'::VARCHAR; RETURN;
    END IF;

    v_new_due := CURRENT_DATE + (v_borrow_days || ' days')::INTERVAL;

    UPDATE library_issue_transactions
    SET due_date = v_new_due, renewal_count = v_renewal_count + 1
    WHERE id = p_transaction_id;

    RETURN QUERY SELECT v_new_due, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_report_book_lost(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_report_book_lost(p_transaction_id integer) RETURNS TABLE(copy_id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_returned_at TIMESTAMPTZ;
    v_copy_id INTEGER;
BEGIN
    SELECT it.returned_at, it.copy_id INTO v_returned_at, v_copy_id
    FROM library_issue_transactions it WHERE it.id = p_transaction_id;

    IF v_copy_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Transaction not found.'::VARCHAR; RETURN;
    END IF;
    IF v_returned_at IS NOT NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'This book has already been returned or closed.'::VARCHAR; RETURN;
    END IF;

    UPDATE library_issue_transactions
    SET returned_at = NOW(), return_condition = 'lost'
    WHERE id = p_transaction_id;
    -- trg_issue_return automatically sets the copy status to 'lost'

    RETURN QUERY SELECT v_copy_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_report_discipline_case(integer, integer, character varying, integer, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_report_discipline_case(p_student_id integer, p_reported_by integer, p_violation_type character varying, p_severity integer, p_description text, p_incident_date date) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO discipline_cases(student_id, reported_by, violation_type, severity, description, incident_date)
    VALUES(p_student_id, p_reported_by, p_violation_type, p_severity, p_description, p_incident_date)
    RETURNING discipline_cases.id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_resolve_damaged_copy(integer, character varying, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_resolve_damaged_copy(p_copy_id integer, p_resolution character varying, p_charge_amount numeric, p_charged_by integer) RETURNS TABLE(new_copy_id integer, charged_transaction_id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_book_id INTEGER;
    v_tx_id INTEGER;
    v_new_copy_id INTEGER;
    v_next_num INTEGER;
BEGIN
    SELECT bc.status, bc.book_id INTO v_status, v_book_id FROM library_book_copies bc WHERE bc.id = p_copy_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, 'Copy not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'damaged' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, 'This copy is not marked as damaged.'::VARCHAR; RETURN;
    END IF;

    IF p_resolution = 'repair' THEN
        UPDATE library_book_copies SET status = 'available', condition = 'good' WHERE id = p_copy_id;
    ELSIF p_resolution = 'replace' THEN
        UPDATE library_book_copies SET status = 'removed' WHERE id = p_copy_id;
        SELECT COALESCE(COUNT(*), 0) + 1 INTO v_next_num FROM library_book_copies WHERE book_id = v_book_id;
        INSERT INTO library_book_copies (book_id, accession_no, barcode)
        VALUES (v_book_id, 'ACC-' || v_book_id || '-' || v_next_num, 'BC-' || v_book_id || '-' || v_next_num)
        RETURNING id INTO v_new_copy_id;
    ELSIF p_resolution = 'remove' THEN
        UPDATE library_book_copies SET status = 'removed' WHERE id = p_copy_id;
    ELSE
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, 'Invalid resolution type.'::VARCHAR; RETURN;
    END IF;

    IF p_charge_amount IS NOT NULL AND p_charge_amount > 0 THEN
        SELECT it.id INTO v_tx_id
        FROM library_issue_transactions it
        WHERE it.copy_id = p_copy_id AND it.return_condition = 'damaged'
        ORDER BY it.returned_at DESC LIMIT 1;

        IF v_tx_id IS NOT NULL THEN
            UPDATE library_issue_transactions
            SET fine_amount = fine_amount + p_charge_amount, fine_status = 'pending'
            WHERE id = v_tx_id;
        END IF;
    END IF;

    RETURN QUERY SELECT v_new_copy_id, v_tx_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_resolve_login_identifier(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_resolve_login_identifier(p_identifier character varying) RETURNS SETOF public.users
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INTEGER;
BEGIN
    -- 1. Student enrollment number (students may ONLY log in this way)
    SELECT s.user_id INTO v_user_id FROM students s WHERE s.enrollment_no = p_identifier;
    IF v_user_id IS NOT NULL THEN
        RETURN QUERY SELECT * FROM users WHERE id = v_user_id;
        RETURN;
    END IF;

    -- 2. Parent's phone number (parents may ONLY log in this way)
    SELECT u.id INTO v_user_id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = 'parent' AND u.phone = p_identifier;
    IF v_user_id IS NOT NULL THEN
        RETURN QUERY SELECT * FROM users WHERE id = v_user_id;
        RETURN;
    END IF;

    -- 3. Email - excludes students and parents entirely, even if they have
    -- an email on file, so they cannot bypass their required identifier type.
    SELECT u.id INTO v_user_id FROM users u
    WHERE LOWER(u.email) = LOWER(p_identifier)
      AND NOT EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND r.name IN ('student', 'parent')
      );
    IF v_user_id IS NOT NULL THEN
        RETURN QUERY SELECT * FROM users WHERE id = v_user_id;
        RETURN;
    END IF;

    RETURN;
END;
$$;


--
-- Name: sp_resolve_lost_copy(integer, character varying, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_resolve_lost_copy(p_copy_id integer, p_resolution character varying, p_charge_amount numeric, p_charged_by integer) RETURNS TABLE(new_copy_id integer, charged_transaction_id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_book_id INTEGER;
    v_tx_id INTEGER;
    v_new_copy_id INTEGER;
    v_next_num INTEGER;
BEGIN
    SELECT bc.status, bc.book_id INTO v_status, v_book_id FROM library_book_copies bc WHERE bc.id = p_copy_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, 'Copy not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'lost' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, 'This copy is not marked as lost.'::VARCHAR; RETURN;
    END IF;

    IF p_resolution = 'found' THEN
        UPDATE library_book_copies SET status = 'available', condition = 'good' WHERE id = p_copy_id;
    ELSIF p_resolution = 'replace' THEN
        UPDATE library_book_copies SET status = 'removed' WHERE id = p_copy_id;
        SELECT COALESCE(COUNT(*), 0) + 1 INTO v_next_num FROM library_book_copies WHERE book_id = v_book_id;
        INSERT INTO library_book_copies (book_id, accession_no, barcode)
        VALUES (v_book_id, 'ACC-' || v_book_id || '-' || v_next_num, 'BC-' || v_book_id || '-' || v_next_num)
        RETURNING id INTO v_new_copy_id;
    ELSIF p_resolution = 'remove' THEN
        UPDATE library_book_copies SET status = 'removed' WHERE id = p_copy_id;
    ELSE
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, 'Invalid resolution type.'::VARCHAR; RETURN;
    END IF;

    IF p_charge_amount IS NOT NULL AND p_charge_amount > 0 THEN
        SELECT it.id INTO v_tx_id
        FROM library_issue_transactions it
        WHERE it.copy_id = p_copy_id AND it.return_condition = 'lost'
        ORDER BY it.returned_at DESC LIMIT 1;

        IF v_tx_id IS NOT NULL THEN
            UPDATE library_issue_transactions
            SET fine_amount = fine_amount + p_charge_amount, fine_status = 'pending'
            WHERE id = v_tx_id;
        END IF;
    END IF;

    RETURN QUERY SELECT v_new_copy_id, v_tx_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_resolve_missing_copy(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_resolve_missing_copy(p_copy_id integer, p_resolution character varying) RETURNS TABLE(error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    SELECT status INTO v_status FROM library_book_copies WHERE id = p_copy_id;
    IF v_status IS NULL THEN
        RETURN QUERY SELECT 'Copy not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'missing' THEN
        RETURN QUERY SELECT 'This copy is not marked as missing.'::VARCHAR; RETURN;
    END IF;

    IF p_resolution = 'found' THEN
        UPDATE library_book_copies SET status = 'available' WHERE id = p_copy_id;
    ELSIF p_resolution = 'remove' THEN
        UPDATE library_book_copies SET status = 'removed' WHERE id = p_copy_id;
    ELSE
        RETURN QUERY SELECT 'Invalid resolution type.'::VARCHAR; RETURN;
    END IF;

    RETURN QUERY SELECT NULL::VARCHAR;
END;
$$;


--
-- Name: sp_respond_appeal(integer, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_respond_appeal(p_case_id integer, p_principal_id integer, p_outcome character varying, p_response text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_student_id INT;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM discipline_cases dc WHERE dc.id=p_case_id AND dc.status='appealed') THEN
        RETURN QUERY SELECT NULL::INT, 'Case not in appealed status'::VARCHAR; RETURN;
    END IF;
    SELECT dc.student_id INTO v_student_id FROM discipline_cases dc WHERE dc.id=p_case_id;
    UPDATE discipline_appeals SET
        response=p_response, response_by=p_principal_id,
        response_at=NOW(), outcome=p_outcome
    WHERE discipline_appeals.case_id=p_case_id;
    IF p_outcome='overturned' THEN
        UPDATE discipline_cases SET status='dismissed',
            principal_id=p_principal_id, updated_at=NOW()
        WHERE discipline_cases.id=p_case_id;
        UPDATE students SET status='active', suspension_return_date=NULL
        WHERE students.id=v_student_id;
    ELSE
        UPDATE discipline_cases SET status=discipline_cases.action_type,
            principal_id=p_principal_id, updated_at=NOW()
        WHERE discipline_cases.id=p_case_id;
    END IF;
    RETURN QUERY SELECT p_case_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_return_book(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_return_book(p_transaction_id integer, p_return_condition character varying, p_received_by integer) RETURNS TABLE(fine_amount numeric, days_overdue integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_due_date DATE;
    v_returned_at TIMESTAMPTZ;
    v_member_id INTEGER;
    v_member_type VARCHAR;
    v_fine_per_day NUMERIC;
    v_days_overdue INTEGER;
    v_fine NUMERIC;
BEGIN
    SELECT due_date, returned_at, member_id INTO v_due_date, v_returned_at, v_member_id
    FROM library_issue_transactions WHERE id = p_transaction_id;

    IF v_due_date IS NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, 0, 'Transaction not found.'::VARCHAR; RETURN;
    END IF;
    IF v_returned_at IS NOT NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, 0, 'This book has already been returned.'::VARCHAR; RETURN;
    END IF;

    SELECT member_type INTO v_member_type FROM library_members WHERE id = v_member_id;
    SELECT fine_per_day INTO v_fine_per_day FROM library_membership_rules WHERE member_type = v_member_type;

    v_days_overdue := GREATEST(0, (CURRENT_DATE - v_due_date));
    v_fine := v_days_overdue * COALESCE(v_fine_per_day, 0);

    UPDATE library_issue_transactions
    SET returned_at = NOW(),
        return_condition = p_return_condition,
        received_by = p_received_by,
        fine_amount = v_fine,
        fine_status = CASE WHEN v_fine > 0 THEN 'pending' ELSE 'none' END
    WHERE id = p_transaction_id;
    -- trg_issue_return automatically sets the copy status back to available/lost/damaged

    RETURN QUERY SELECT v_fine, v_days_overdue, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_review_correction_request(integer, character varying, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_review_correction_request(p_id integer, p_status character varying, p_reviewed_by integer, p_review_note text) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE staff_attendance_correction_requests
    SET status = p_status, reviewed_by = p_reviewed_by, reviewed_at = NOW(), review_note = p_review_note
    WHERE id = p_id;
$$;


--
-- Name: sp_review_discipline_case(integer, integer, character varying, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_review_discipline_case(p_id integer, p_coordinator_id integer, p_action character varying, p_note text, p_hearing_date timestamp with time zone) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_action='schedule' THEN
        UPDATE discipline_cases SET status='hearing_scheduled',
            coordinator_id=p_coordinator_id, hearing_date=p_hearing_date,
            action_note=p_note, updated_at=NOW()
        WHERE discipline_cases.id=p_id;
    ELSIF p_action='dismiss' THEN
        UPDATE discipline_cases SET status='dismissed',
            coordinator_id=p_coordinator_id, action_note=p_note, updated_at=NOW()
        WHERE discipline_cases.id=p_id;
    ELSE
        UPDATE discipline_cases SET status='under_review',
            coordinator_id=p_coordinator_id, action_note=p_note, updated_at=NOW()
        WHERE discipline_cases.id=p_id;
    END IF;
    RETURN QUERY SELECT p_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_review_withdrawal(integer, integer, character varying, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_review_withdrawal(p_id integer, p_coordinator_id integer, p_action character varying, p_note text, p_departments text[]) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE dept VARCHAR;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM withdrawal_requests wr WHERE wr.id = p_id AND wr.status = 'pending') THEN
        RETURN QUERY SELECT NULL::INT, 'Not found or not pending'::VARCHAR; RETURN;
    END IF;
    IF p_action = 'approve' THEN
        UPDATE withdrawal_requests SET status = 'clearance',
            coordinator_id = p_coordinator_id, coordinator_note = p_note, coordinator_at = NOW()
        WHERE withdrawal_requests.id = p_id;
        FOREACH dept IN ARRAY p_departments LOOP
            INSERT INTO withdrawal_clearances(request_id, department)
            VALUES(p_id, dept) ON CONFLICT(request_id, department) DO NOTHING;
        END LOOP;
    ELSE
        UPDATE withdrawal_requests SET status = 'rejected',
            coordinator_id = p_coordinator_id, coordinator_note = p_note, coordinator_at = NOW()
        WHERE withdrawal_requests.id = p_id;
    END IF;
    RETURN QUERY SELECT p_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_revoke_permission(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_revoke_permission(p_role_id integer, p_permission_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM role_permissions WHERE role_id = p_role_id AND permission_id = p_permission_id;
$$;


--
-- Name: sp_revoke_refresh_token(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_revoke_refresh_token(p_token_hash character varying) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = p_token_hash;
$$;


--
-- Name: daily_diary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_diary (
    id integer NOT NULL,
    class_id integer NOT NULL,
    subject_id integer NOT NULL,
    teacher_id integer NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    classwork text,
    homework text,
    notes text,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: sp_save_diary_entry(integer, integer, integer, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_save_diary_entry(p_class_id integer, p_subject_id integer, p_teacher_id integer, p_date date, p_classwork text, p_homework text, p_notes text) RETURNS SETOF public.daily_diary
    LANGUAGE sql
    AS $$
    INSERT INTO daily_diary (class_id, subject_id, teacher_id, date, classwork, homework, notes, status)
    VALUES (p_class_id, p_subject_id, p_teacher_id, p_date, p_classwork, p_homework, p_notes, 'submitted')
    ON CONFLICT (class_id, subject_id, date) DO UPDATE
      SET classwork = p_classwork, homework = p_homework, notes = p_notes, status = 'submitted', updated_at = NOW()
    RETURNING *;
$$;


--
-- Name: sp_save_exam_marks(integer, integer, integer, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_save_exam_marks(p_exam_id integer, p_class_id integer, p_subject_id integer, p_marks jsonb, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_exam_status VARCHAR;
    v_es_id INTEGER;
    m JSONB;
BEGIN
    SELECT status INTO v_exam_status FROM exams WHERE exams.id = p_exam_id;
    IF v_exam_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Exam not found.'::VARCHAR; RETURN;
    END IF;
    IF v_exam_status != 'marks_open' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Marks entry is not open for this exam yet.'::VARCHAR; RETURN;
    END IF;
    SELECT es.id INTO v_es_id FROM exam_subjects es
    WHERE es.exam_id = p_exam_id AND es.class_id = p_class_id AND es.subject_id = p_subject_id;
    IF v_es_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Subject not found in datesheet.'::VARCHAR; RETURN;
    END IF;
    FOR m IN SELECT * FROM jsonb_array_elements(p_marks) LOOP
        INSERT INTO exam_marks (exam_id, class_id, subject_id, exam_subject_id, student_id,
            marks_obtained, is_absent, remarks, entered_by, entered_at, updated_at)
        VALUES (
            p_exam_id, p_class_id, p_subject_id, v_es_id, (m->>'student_id')::INTEGER,
            NULLIF(m->>'marks_obtained','')::NUMERIC, COALESCE((m->>'is_absent')::BOOLEAN, FALSE),
            COALESCE(m->>'remarks',''), p_user_id, NOW(), NOW()
        )
        ON CONFLICT (exam_id, class_id, subject_id, student_id)
        DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained, is_absent = EXCLUDED.is_absent,
            remarks = EXCLUDED.remarks, entered_by = EXCLUDED.entered_by, updated_at = NOW();
    END LOOP;
    RETURN QUERY SELECT v_es_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_save_my_signature(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_save_my_signature(p_user_id integer, p_signature text) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO user_signatures (user_id, signature, updated_at)
    VALUES (p_user_id, p_signature, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET signature = p_signature, updated_at = NOW();
$$;


--
-- Name: sp_search_charges(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_search_charges(p_registration_no character varying DEFAULT NULL::character varying, p_receipt_no character varying DEFAULT NULL::character varying) RETURNS TABLE(item_id integer, item_type text, label text, amount numeric, is_waived boolean, waived_at timestamp with time zone, invoice_id integer, invoice_no text, invoice_status text, issued_at timestamp with time zone, paid_at timestamp with time zone, superseded_by integer, first_name text, last_name text, enrollment_no text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        fii.id, fii.item_type::TEXT, fii.label::TEXT, fii.amount, fii.is_waived, fii.waived_at::TIMESTAMPTZ,
        fi.id, fi.invoice_no::TEXT, fi.status::TEXT,
        fi.issued_at::TIMESTAMPTZ, fi.paid_at::TIMESTAMPTZ, fi.superseded_by,
        s.first_name::TEXT, s.last_name::TEXT, s.enrollment_no::TEXT
    FROM fee_invoice_items fii
    JOIN fee_invoices fi ON fi.id = fii.invoice_id
    JOIN students s ON s.id = fi.student_id
    WHERE fii.item_type IN ('charge', 'late_fee')
      AND (p_registration_no IS NULL OR s.enrollment_no ILIKE '%' || p_registration_no || '%')
      AND (
          p_receipt_no IS NULL
          OR fi.invoice_no ILIKE '%' || p_receipt_no || '%'
          OR fi.id IN (
              SELECT p.invoice_id FROM payments p WHERE p.reference ILIKE '%' || p_receipt_no || '%'
          )
      )
    ORDER BY fi.issued_at DESC, fii.id;
END;
$$;


--
-- Name: sp_search_enrollable_users(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_search_enrollable_users(p_type character varying, p_query character varying) RETURNS TABLE(user_id integer, display_name text, identifier text, already_member boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        u.id,
        (u.first_name || ' ' || u.last_name)::TEXT,
        CASE
            WHEN p_type = 'student' THEN COALESCE(s.enrollment_no, '')::TEXT
            WHEN p_type = 'teacher' THEN COALESCE(u.email, '')::TEXT
            ELSE COALESCE(
                (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1),
                u.email, ''
            )::TEXT
        END,
        EXISTS(SELECT 1 FROM library_members lm WHERE lm.user_id = u.id)
    FROM users u
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN teachers t ON t.user_id = u.id
    WHERE u.is_active = TRUE
      AND (
          (p_type = 'student' AND s.id IS NOT NULL AND s.status = 'active')
          OR (p_type = 'teacher' AND t.id IS NOT NULL)
          OR (p_type = 'staff' AND s.id IS NULL AND t.id IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id AND r.name = 'parent'
              ))
      )
      AND (p_query IS NULL OR p_query = ''
           OR u.first_name ILIKE '%' || p_query || '%'
           OR u.last_name ILIKE '%' || p_query || '%'
           OR (p_type = 'student' AND s.enrollment_no ILIKE '%' || p_query || '%'))
    ORDER BY u.first_name
    LIMIT 20;
$$;


--
-- Name: sp_set_active_tax_slab_set(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_set_active_tax_slab_set(p_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE payroll_tax_slab_sets SET is_active = false WHERE is_active = true;
    UPDATE payroll_tax_slab_sets SET is_active = true WHERE id = p_id;
END;
$$;


--
-- Name: sp_set_clearance_waiver_requested(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_set_clearance_waiver_requested(p_withdrawal_id integer, p_waiver_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE withdrawal_clearances
    SET waiver_requested = TRUE, waiver_id = p_waiver_id
    WHERE request_id = p_withdrawal_id AND department = 'finance';
$$;


--
-- Name: sp_set_department_head(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_set_department_head(p_department_id integer, p_user_id integer) RETURNS TABLE(error_msg text)
    LANGUAGE plpgsql
    AS $$DECLARE v_current_head INT;
BEGIN
    -- Check if department already has a head (different from this user)
    SELECT head_user_id INTO v_current_head FROM departments WHERE id=p_department_id;
    IF v_current_head IS NOT NULL AND v_current_head != p_user_id THEN
        RETURN QUERY SELECT 'This department already has a Head of Department. Remove the existing head first.';
        RETURN;
    END IF;
    -- Set as department head
    UPDATE departments SET head_user_id=p_user_id WHERE id=p_department_id;
    RETURN QUERY SELECT NULL::TEXT;
END;$$;


--
-- Name: sp_skip_stock_from_grn(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_skip_stock_from_grn(p_grn_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM goods_receipt_notes
                  WHERE goods_receipt_notes.id = p_grn_id
                    AND status = 'confirmed' AND stock_updated = FALSE) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'GRN not found, not confirmed, or already processed.'::VARCHAR; RETURN;
    END IF;
    UPDATE goods_receipt_notes SET
        stock_updated = TRUE,
        stock_updated_at = NOW(),
        stock_updated_by = p_user_id,
        notes = COALESCE(notes || ' ', '') || '[Stock update skipped]'
    WHERE goods_receipt_notes.id = p_grn_id;
    RETURN QUERY SELECT p_grn_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_start_inventory_audit(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_start_inventory_audit(p_started_by integer, p_notes text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM library_inventory_audits WHERE status = 'in_progress') THEN
        RETURN QUERY SELECT NULL::INTEGER, 'An inventory audit is already in progress.'::VARCHAR; RETURN;
    END IF;

    INSERT INTO library_inventory_audits (started_by, notes)
    VALUES (p_started_by, p_notes)
    RETURNING library_inventory_audits.id INTO v_id;

    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_store_refresh_token(integer, character varying, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_store_refresh_token(p_user_id integer, p_token_hash character varying, p_expires_at timestamp with time zone) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (p_user_id, p_token_hash, p_expires_at);
$$;


--
-- Name: sp_student_stats(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_student_stats(p_student_id integer) RETURNS TABLE(class_name character varying, section character varying, enrollment_no character varying, attendance_pct numeric, pending_fees numeric, assignments_due integer, quizzes_due integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_class_id INTEGER;
BEGIN
    SELECT class_id INTO v_class_id FROM students WHERE id=p_student_id;

    RETURN QUERY
    SELECT
        c.name::VARCHAR,
        c.section::VARCHAR,
        s.enrollment_no::VARCHAR,
        COALESCE(
            ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.status='present') / NULLIF(COUNT(a.id),0), 1),
            0
        )::NUMERIC,
        COALESCE((SELECT SUM(total_amount - paid_amount) FROM fee_invoices
                  WHERE student_id=p_student_id AND status!='paid'), 0)::NUMERIC,
        (SELECT COUNT(*)::INTEGER FROM assignments
         WHERE class_id=v_class_id AND due_date >= CURRENT_DATE
           AND id NOT IN (SELECT assignment_id FROM assignment_submissions WHERE student_id=p_student_id)),
        (SELECT COUNT(*)::INTEGER FROM quizzes
         WHERE class_id=v_class_id AND due_date >= NOW()
           AND id NOT IN (SELECT quiz_id FROM quiz_submissions WHERE student_id=p_student_id))
    FROM students s
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN attendance a ON a.student_id = s.id
    WHERE s.id = p_student_id
    GROUP BY c.name, c.section, s.enrollment_no;
END;
$$;


--
-- Name: sp_submit_appeal(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_appeal(p_case_id integer, p_user_id integer, p_note text) RETURNS TABLE(id integer, error_msg text)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM discipline_cases dc WHERE dc.id=p_case_id AND dc.appeal_deadline >= CURRENT_DATE) THEN
        RETURN QUERY SELECT NULL::INT, 'Appeal deadline passed or case not found';
        RETURN;
    END IF;
    IF EXISTS(SELECT 1 FROM discipline_appeals da WHERE da.case_id=p_case_id) THEN
        RETURN QUERY SELECT NULL::INT, 'Appeal already submitted';
        RETURN;
    END IF;
    INSERT INTO discipline_appeals(case_id, submitted_by, appeal_note)
    VALUES(p_case_id, p_user_id, p_note)
    RETURNING discipline_appeals.id INTO v_id;
    UPDATE discipline_cases SET appeal_submitted=TRUE, status='appealed',
        appeal_note=p_note, updated_at=NOW()
    WHERE discipline_cases.id=p_case_id;
    RETURN QUERY SELECT v_id, NULL::TEXT;
END;
$$;


--
-- Name: sp_submit_conduct_form(integer, integer, character varying, character varying, character varying, character varying, character varying, boolean, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_conduct_form(p_request_id integer, p_teacher_id integer, p_behaviour character varying, p_discipline character varying, p_academic_performance character varying, p_attendance_regularity character varying, p_cocurricular character varying, p_disciplinary_action boolean, p_disciplinary_details text, p_remarks text, p_recommended_readmission boolean) RETURNS TABLE(request_id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id INT;
    v_status VARCHAR;
BEGIN
    SELECT status INTO v_status FROM withdrawal_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::INT, 'Request not found'::VARCHAR; RETURN;
    END IF;
    IF v_status IN ('rejected','cancelled','withdrawn') THEN
        RETURN QUERY SELECT NULL::INT, 'Cannot submit conduct for this request'::VARCHAR; RETURN;
    END IF;
    INSERT INTO withdrawal_conduct(request_id, teacher_id, behaviour, discipline,
        academic_performance, attendance_regularity, cocurricular,
        disciplinary_action, disciplinary_details, remarks, recommended_readmission)
    VALUES(p_request_id, p_teacher_id, p_behaviour, p_discipline,
        p_academic_performance, p_attendance_regularity, p_cocurricular,
        p_disciplinary_action, p_disciplinary_details, p_remarks, p_recommended_readmission)
    RETURNING withdrawal_conduct.id INTO v_id;
    UPDATE withdrawal_requests SET teacher_conduct_submitted = TRUE,
        teacher_conduct_at = NOW(), teacher_conduct_by = p_teacher_id
    WHERE withdrawal_requests.id = p_request_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_submit_datesheet(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_datesheet(p_exam_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE exams SET datesheet_status='submitted',
        datesheet_submitted_at=NOW()
    WHERE exams.id=p_exam_id;
    RETURN QUERY SELECT p_exam_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_submit_final_hearing(integer, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_final_hearing(p_case_id integer, p_head_teacher_id integer, p_attendees text, p_final_remarks text, p_outcome text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM hearing_committee hc
                  WHERE hc.case_id=p_case_id AND hc.teacher_id=p_head_teacher_id AND hc.is_head=TRUE) THEN
        RETURN QUERY SELECT NULL::INT, 'Only head can submit'::VARCHAR; RETURN;
    END IF;
    INSERT INTO discipline_hearings(case_id,conducted_at,attendees,notes,outcome,created_by)
    VALUES(p_case_id,NOW(),p_attendees,p_final_remarks,p_outcome,
        (SELECT t.user_id FROM teachers t WHERE t.id=p_head_teacher_id))
    RETURNING discipline_hearings.id INTO v_id;
    UPDATE discipline_cases SET status='hearing_done',
        hearing_notes=p_final_remarks, updated_at=NOW()
    WHERE discipline_cases.id=p_case_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_submit_member_remarks(integer, integer, text, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_member_remarks(p_case_id integer, p_teacher_id integer, p_remarks text, p_recommendation character varying) RETURNS TABLE(id integer, error_msg character varying, all_submitted boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT; v_total INT; v_submitted INT;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM hearing_committee hc WHERE hc.case_id = p_case_id AND hc.teacher_id = p_teacher_id) THEN
        RETURN QUERY SELECT NULL::INT, 'Not a committee member'::VARCHAR, FALSE; RETURN;
    END IF;
    INSERT INTO hearing_member_remarks(case_id, teacher_id, remarks, recommendation)
    VALUES(p_case_id, p_teacher_id, p_remarks, p_recommendation)
    ON CONFLICT(case_id, teacher_id) DO UPDATE SET remarks = p_remarks, recommendation = p_recommendation, submitted_at = NOW()
    RETURNING hearing_member_remarks.id INTO v_id;
    SELECT COUNT(*), COUNT(hmr.id)
    INTO v_total, v_submitted
    FROM hearing_committee hc
    LEFT JOIN hearing_member_remarks hmr ON hmr.case_id = hc.case_id AND hmr.teacher_id = hc.teacher_id
    WHERE hc.case_id = p_case_id;
    RETURN QUERY SELECT v_id, NULL::VARCHAR, (v_total > 0 AND v_total = v_submitted);
END;
$$;


--
-- Name: sp_submit_pr(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_pr(p_pr_id integer) RETURNS TABLE(matched_rule_id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR;
    v_department_id INTEGER;
    v_is_emergency BOOLEAN;
    v_total NUMERIC;
    v_item_count INTEGER;
    v_primary_category_id INTEGER;
    v_rule_id INTEGER;
    v_step RECORD;
    v_head_user_id INTEGER;
    v_step_count INTEGER;
BEGIN
    SELECT status, department_id, is_emergency, total_estimated_amount
    INTO v_status, v_department_id, v_is_emergency, v_total
    FROM purchase_requisitions WHERE id = p_pr_id;

    IF v_status IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'PR not found.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'draft' THEN
        RETURN QUERY SELECT NULL::INTEGER, 'This PR has already been submitted.'::VARCHAR; RETURN;
    END IF;

    SELECT COUNT(*) INTO v_item_count FROM pr_items WHERE pr_id = p_pr_id;
    IF v_item_count = 0 THEN
        RETURN QUERY SELECT NULL::INTEGER, 'Add at least one item before submitting.'::VARCHAR; RETURN;
    END IF;

    SELECT pi.category_id INTO v_primary_category_id
    FROM pr_items pi
    WHERE pi.pr_id = p_pr_id
    ORDER BY (pi.quantity * COALESCE(pi.estimated_unit_price, 0)) DESC
    LIMIT 1;

    v_rule_id := sp_match_approval_rule(v_total, v_department_id, v_primary_category_id, v_is_emergency);

    IF v_rule_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'No approval rule matches this requisition. Contact an administrator to configure one.'::VARCHAR; RETURN;
    END IF;

    SELECT COUNT(*) INTO v_step_count FROM procurement_approval_steps WHERE rule_id = v_rule_id;
    IF v_step_count = 0 THEN
        RETURN QUERY SELECT NULL::INTEGER, 'The matched approval rule has no steps configured. Contact an administrator.'::VARCHAR; RETURN;
    END IF;

    FOR v_step IN SELECT * FROM procurement_approval_steps WHERE rule_id = v_rule_id ORDER BY step_order LOOP
        v_head_user_id := NULL;
        IF v_step.approver_role = 'department_head' THEN
            IF v_department_id IS NULL THEN
                RETURN QUERY SELECT NULL::INTEGER, 'This PR has no department set, but the matched rule requires department-head approval.'::VARCHAR; RETURN;
            END IF;
            SELECT head_user_id INTO v_head_user_id FROM departments WHERE id = v_department_id;
            IF v_head_user_id IS NULL THEN
                RETURN QUERY SELECT NULL::INTEGER, 'The requesting department has no head assigned, but the matched rule requires department-head approval.'::VARCHAR; RETURN;
            END IF;
        END IF;

        INSERT INTO pr_approval_instances (pr_id, step_order, approver_role, resolved_approver_id)
        VALUES (p_pr_id, v_step.step_order, v_step.approver_role, v_head_user_id);
    END LOOP;

    UPDATE purchase_requisitions
    SET status = 'submitted', submitted_at = NOW(), matched_rule_id = v_rule_id
    WHERE id = p_pr_id;

    RETURN QUERY SELECT v_rule_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_submit_quiz(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_quiz(p_quiz_id integer, p_student_id integer, p_answers jsonb) RETURNS TABLE(marks integer, total integer, percentage numeric, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_marks  INTEGER := 0;
    v_total  INTEGER;
    v_q      RECORD;
    v_ans    TEXT;
    v_pct    NUMERIC;
BEGIN
    -- Check duplicate
    IF EXISTS (SELECT 1 FROM quiz_submissions WHERE quiz_id=p_quiz_id AND student_id=p_student_id) THEN
        RETURN QUERY SELECT 0, 0, 0::NUMERIC, 'Already submitted'::VARCHAR;
        RETURN;
    END IF;

    -- Check expired
    IF EXISTS (SELECT 1 FROM quizzes WHERE id=p_quiz_id AND due_date < NOW()) THEN
        SELECT total_marks INTO v_total FROM quizzes WHERE id=p_quiz_id;
        INSERT INTO quiz_submissions(quiz_id, student_id, answers, marks, total_marks, percentage)
        VALUES (p_quiz_id, p_student_id, p_answers, 0, v_total, 0);
        RETURN QUERY SELECT 0, v_total, 0::NUMERIC, NULL::VARCHAR;
        RETURN;
    END IF;

    SELECT total_marks INTO v_total FROM quizzes WHERE id=p_quiz_id;

    -- Grade each question
    FOR v_q IN SELECT * FROM quiz_questions WHERE quiz_id=p_quiz_id
    LOOP
        v_ans := p_answers->>(v_q.id::TEXT);
        IF v_q.multi_select THEN
            IF v_ans IS NOT NULL AND v_ans = v_q.correct THEN
                v_marks := v_marks + v_q.marks;
            END IF;
        ELSE
            IF UPPER(TRIM(v_ans)) = UPPER(TRIM(v_q.correct)) THEN
                v_marks := v_marks + v_q.marks;
            END IF;
        END IF;
    END LOOP;

    v_pct := ROUND(v_marks::NUMERIC / NULLIF(v_total,0) * 100, 2);

    INSERT INTO quiz_submissions(quiz_id, student_id, answers, marks, total_marks, percentage)
    VALUES (p_quiz_id, p_student_id, p_answers, v_marks, v_total, v_pct);

    RETURN QUERY SELECT v_marks, v_total, v_pct, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_submit_subject_marks(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_submit_subject_marks(p_exam_subject_id integer, p_teacher_id integer) RETURNS TABLE(id integer, error_msg character varying, all_submitted boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE v_exam_id INT; v_total INT; v_submitted INT;
BEGIN
    UPDATE exam_subjects SET marks_submitted=TRUE, submitted_at=NOW()
    WHERE exam_subjects.id=p_exam_subject_id;
    SELECT es.exam_id INTO v_exam_id FROM exam_subjects es WHERE es.id=p_exam_subject_id;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE es.marks_submitted=TRUE)
    INTO v_total, v_submitted
    FROM exam_subjects es WHERE es.exam_id=v_exam_id;
    IF v_total>0 AND v_total=v_submitted THEN
        UPDATE exams SET status='submitted'
        WHERE exams.id=v_exam_id AND exams.status='marks_open';
    END IF;
    RETURN QUERY SELECT p_exam_subject_id, NULL::VARCHAR, (v_total>0 AND v_total=v_submitted);
END;
$$;


--
-- Name: sp_system_announcement(character varying, text, character varying, character varying, integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_system_announcement(p_title character varying, p_body text, p_priority character varying, p_target_role character varying, p_target_class integer, p_source_type character varying, p_source_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INTEGER;
BEGIN
    -- Only deduplicate if source_type and source_id are both provided
    IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT id INTO v_id FROM announcements
        WHERE source_type=p_source_type AND source_id=p_source_id AND ann_type='system' LIMIT 1;
        IF v_id IS NOT NULL THEN
            UPDATE announcements SET title=p_title, body=p_body, is_active=TRUE WHERE id=v_id;
            RETURN v_id;
        END IF;
    END IF;
    INSERT INTO announcements(title,body,priority,target_role,target_class,
        ann_type,source_type,source_id,created_by,start_date)
    VALUES(p_title,p_body,p_priority,p_target_role,p_target_class,
        'system',p_source_type,p_source_id,NULL,CURRENT_DATE)
    RETURNING announcements.id INTO v_id;
    RETURN v_id;
END;
$$;


--
-- Name: sp_toggle_charge_type(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_toggle_charge_type(p_id integer) RETURNS SETOF public.charge_type_definitions
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_id) THEN
        RAISE EXCEPTION 'charge type % not found', p_id;
    END IF;

    RETURN QUERY
    UPDATE charge_type_definitions
    SET is_active = NOT is_active
    WHERE id = p_id
    RETURNING *;
END;
$$;


--
-- Name: sp_toggle_staff_attendance(integer, character varying, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_toggle_staff_attendance(p_staff_id integer, p_source character varying, p_created_by integer, p_is_late boolean DEFAULT false) RETURNS TABLE(action text, session_id integer, clock_in_at timestamp without time zone, clock_out_at timestamp without time zone, error_msg text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_open_id INT;
    v_clock_in TIMESTAMP;
    v_clock_out TIMESTAMP;
    v_min_minutes INT;
BEGIN
    SELECT t.min_session_minutes INTO v_min_minutes FROM attendance_status_thresholds t WHERE t.id = 1;

    SELECT sas.id, sas.clock_in_at INTO v_open_id, v_clock_in FROM staff_attendance_sessions sas
        WHERE sas.staff_id = p_staff_id AND sas.clock_out_at IS NULL
        ORDER BY sas.clock_in_at DESC LIMIT 1;

    IF v_open_id IS NOT NULL THEN
        IF v_min_minutes IS NOT NULL AND v_min_minutes > 0
           AND (EXTRACT(EPOCH FROM (NOW() - v_clock_in)) / 60.0) < v_min_minutes THEN
            RETURN QUERY SELECT NULL::TEXT, NULL::INT, NULL::TIMESTAMP, NULL::TIMESTAMP,
                ('You must wait at least ' || v_min_minutes || ' minute(s) after clocking in before you can clock out.')::TEXT;
            RETURN;
        END IF;

        UPDATE staff_attendance_sessions sas
        SET clock_out_at = NOW(), updated_at = NOW()
        WHERE sas.id = v_open_id
        RETURNING sas.clock_in_at, sas.clock_out_at
        INTO v_clock_in, v_clock_out;

        RETURN QUERY SELECT 'clock_out'::TEXT, v_open_id, v_clock_in, v_clock_out, NULL::TEXT;
    ELSE
        INSERT INTO staff_attendance_sessions(staff_id, clock_in_at, source, created_by, is_late)
        VALUES(p_staff_id, NOW(), p_source, p_created_by, p_is_late)
        RETURNING staff_attendance_sessions.id, staff_attendance_sessions.clock_in_at INTO v_open_id, v_clock_in;

        RETURN QUERY SELECT 'clock_in'::TEXT, v_open_id, v_clock_in, NULL::TIMESTAMP, NULL::TEXT;
    END IF;
END;
$$;


--
-- Name: sp_try_fulfill_reservation(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_try_fulfill_reservation(p_book_id integer) RETURNS TABLE(reservation_id integer, member_id integer, copy_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_res_id INTEGER;
    v_member_id INTEGER;
    v_copy_id INTEGER;
BEGIN
    SELECT r.id, r.member_id INTO v_res_id, v_member_id
    FROM library_reservations r
    WHERE r.book_id = p_book_id AND r.status = 'waiting'
    ORDER BY r.requested_at ASC
    LIMIT 1;

    IF v_res_id IS NULL THEN
        RETURN;
    END IF;

    SELECT bc.id INTO v_copy_id
    FROM library_book_copies bc
    WHERE bc.book_id = p_book_id AND bc.status = 'available'
    LIMIT 1;

    IF v_copy_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE library_book_copies SET status = 'reserved' WHERE id = v_copy_id;
    UPDATE library_reservations SET status = 'available', notified_at = NOW() WHERE id = v_res_id;

    RETURN QUERY SELECT v_res_id, v_member_id, v_copy_id;
END;
$$;


--
-- Name: sp_unassign_class_teacher(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_unassign_class_teacher(p_class_id integer, p_teacher_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM class_teachers WHERE class_id = p_class_id AND teacher_id = p_teacher_id;
$$;


--
-- Name: sp_unblacklist_vendor(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_unblacklist_vendor(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE procurement_vendors SET is_blacklisted = FALSE, blacklist_reason = NULL WHERE id = p_id;
$$;


--
-- Name: sp_unread_announcements_count(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_unread_announcements_count(p_user_id integer, p_role character varying, p_class_id integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM announcements a
    WHERE a.is_active=TRUE
      AND a.start_date <= CURRENT_DATE
      AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
      AND (a.target_role='all' OR a.target_role=p_role
           OR (a.target_class IS NOT NULL AND a.target_class=p_class_id))
      AND NOT EXISTS(
          SELECT 1 FROM announcement_reads ar
          WHERE ar.announcement_id=a.id AND ar.user_id=p_user_id);
    RETURN v_count;
END;
$$;


--
-- Name: sp_update_announcement(integer, character varying, text, character varying, character varying, integer, date, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_announcement(p_id integer, p_title character varying, p_body text, p_priority character varying, p_target_role character varying, p_target_class integer, p_end_date date, p_is_active boolean) RETURNS TABLE(success boolean, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE announcements SET title=p_title, body=p_body, priority=p_priority,
        target_role=p_target_role, target_class=p_target_class,
        end_date=p_end_date, is_active=p_is_active
    WHERE id=p_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Not found'::VARCHAR; RETURN;
    END IF;
    RETURN QUERY SELECT TRUE, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_update_approval_rule(integer, character varying, numeric, numeric, integer, integer, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_approval_rule(p_id integer, p_name character varying, p_min_amount numeric, p_max_amount numeric, p_department_id integer, p_item_category_id integer, p_is_emergency boolean, p_priority integer) RETURNS SETOF public.procurement_approval_rules
    LANGUAGE sql
    AS $$
    UPDATE procurement_approval_rules
    SET name = p_name, min_amount = p_min_amount, max_amount = p_max_amount,
        department_id = p_department_id, item_category_id = p_item_category_id,
        is_emergency = p_is_emergency, priority = COALESCE(p_priority, 0)
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_attendance_schedule_settings(character varying, time without time zone, time without time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_attendance_schedule_settings(p_mode character varying, p_start time without time zone, p_end time without time zone, p_grace integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE attendance_schedule_settings SET
        mode = p_mode,
        default_start_time = p_start,
        default_end_time = p_end,
        grace_minutes = p_grace
    WHERE id = 1;
$$;


--
-- Name: sp_update_attendance_session(integer, timestamp without time zone, timestamp without time zone, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_attendance_session(p_session_id integer, p_clock_in_at timestamp without time zone, p_clock_out_at timestamp without time zone, p_notes text, p_is_late boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE staff_attendance_sessions SET
        clock_in_at = COALESCE(p_clock_in_at, clock_in_at),
        clock_out_at = COALESCE(p_clock_out_at, clock_out_at),
        notes = COALESCE(p_notes, notes),
        is_late = COALESCE(p_is_late, is_late),
        updated_at = NOW()
    WHERE id = p_session_id;
$$;


--
-- Name: sp_update_author(integer, character varying, text, character varying, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_author(p_id integer, p_name character varying, p_bio text, p_nationality character varying, p_dob date) RETURNS SETOF public.library_authors
    LANGUAGE sql
    AS $$
    UPDATE library_authors
    SET name = p_name, bio = p_bio, nationality = p_nationality, date_of_birth = p_dob
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_book(integer, character varying, character varying, character varying, integer, integer, integer, character varying, integer, character varying, character varying, character varying, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_book(p_id integer, p_isbn character varying, p_title character varying, p_subtitle character varying, p_author_id integer, p_publisher_id integer, p_category_id integer, p_edition character varying, p_publication_year integer, p_language character varying, p_shelf character varying, p_rack character varying, p_description text, p_cover_image text) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE library_books SET
        isbn=p_isbn, title=p_title, subtitle=p_subtitle, author_id=p_author_id,
        publisher_id=p_publisher_id, category_id=p_category_id, edition=p_edition,
        publication_year=p_publication_year, language=p_language, shelf=p_shelf,
        rack=p_rack, description=p_description, cover_image=p_cover_image, updated_at=NOW()
    WHERE id=p_id;
$$;


--
-- Name: sp_update_calendar_event(integer, character varying, text, date, date, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_calendar_event(p_id integer, p_title character varying, p_description text, p_event_date date, p_end_date date, p_event_type character varying, p_is_holiday boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE calendar_events SET
        title = p_title, description = p_description, event_date = p_event_date,
        end_date = p_end_date, event_type = p_event_type, is_holiday = p_is_holiday
    WHERE id = p_id;
$$;


--
-- Name: sp_update_category(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_category(p_id integer, p_name character varying, p_parent_id integer) RETURNS SETOF public.library_categories
    LANGUAGE sql
    AS $$
    UPDATE library_categories
    SET name = p_name, parent_id = p_parent_id
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_charge_type(integer, character varying, character varying, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_charge_type(p_id integer, p_name character varying, p_recurrence character varying, p_interval_months smallint) RETURNS SETOF public.charge_type_definitions
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_recurrence NOT IN ('fixed', 'interval') THEN
        RAISE EXCEPTION 'recurrence must be fixed or interval';
    END IF;
    IF p_recurrence = 'interval' AND (p_interval_months IS NULL OR p_interval_months < 1) THEN
        RAISE EXCEPTION 'interval_months is required and must be at least 1 when recurrence is interval';
    END IF;
    IF p_recurrence = 'fixed' AND p_interval_months IS NOT NULL THEN
        RAISE EXCEPTION 'interval_months must be null when recurrence is fixed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_id) THEN
        RAISE EXCEPTION 'charge type % not found', p_id;
    END IF;

    RETURN QUERY
    UPDATE charge_type_definitions
    SET name = p_name, recurrence = p_recurrence, interval_months = p_interval_months
    WHERE id = p_id
    RETURNING *;
END;
$$;


--
-- Name: sp_update_class(integer, character varying, character varying, integer, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_class(p_id integer, p_name character varying, p_section character varying, p_capacity integer, p_room_number character varying, p_class_type character varying) RETURNS SETOF public.classes
    LANGUAGE sql
    AS $$
    UPDATE classes SET
        name = p_name, section = p_section, capacity = COALESCE(p_capacity, 40),
        room_number = p_room_number, class_type = COALESCE(p_class_type, 'regular')
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_department(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_department(p_id integer, p_name character varying, p_head_user_id integer) RETURNS SETOF public.departments
    LANGUAGE sql
    AS $$
    UPDATE departments SET name = p_name, head_user_id = p_head_user_id WHERE id = p_id RETURNING *;
$$;


--
-- Name: sp_update_discipline_config(integer, jsonb, jsonb, integer, integer, boolean, boolean, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_discipline_config(p_user_id integer, p_violation_types jsonb, p_severity_labels jsonb, p_hearing_min_severity integer, p_committee_min_members integer, p_require_head boolean, p_allow_appeal boolean, p_appeal_days integer, p_max_suspension_days integer, p_auto_reinstate boolean) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE discipline_config SET
        violation_types=p_violation_types, severity_labels=p_severity_labels,
        hearing_min_severity=p_hearing_min_severity, committee_min_members=p_committee_min_members,
        require_head=p_require_head, allow_appeal=p_allow_appeal, appeal_days=p_appeal_days,
        max_suspension_days=p_max_suspension_days, auto_reinstate=p_auto_reinstate,
        updated_at=NOW(), updated_by=p_user_id
    WHERE discipline_config.id=1;
    RETURN QUERY SELECT 1, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_update_education(integer, integer, character varying, character varying, character varying, integer, integer, character varying, boolean, character varying, numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_education(p_id integer, p_staff_id integer, p_degree character varying, p_institution character varying, p_field character varying, p_start_year integer, p_end_year integer, p_grade character varying, p_is_current boolean, p_grade_type character varying, p_total_marks numeric, p_awarded_marks numeric, p_total_cgpa numeric, p_awarded_cgpa numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN
    UPDATE staff_education SET degree=p_degree, institution=p_institution, field_of_study=p_field,
        start_year=p_start_year, end_year=p_end_year, grade=p_grade, is_current=p_is_current,
        grade_type=p_grade_type, total_marks=p_total_marks, awarded_marks=p_awarded_marks,
        total_cgpa=p_total_cgpa, awarded_cgpa=p_awarded_cgpa
    WHERE id=p_id AND staff_id=p_staff_id;
END;$$;


--
-- Name: sp_update_event_type(integer, character varying, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_event_type(p_id integer, p_name character varying, p_color character varying, p_is_holiday boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE event_types SET name = p_name, color = p_color, is_holiday = p_is_holiday WHERE id = p_id;
$$;


--
-- Name: sp_update_experience(integer, integer, character varying, character varying, date, date, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_experience(p_id integer, p_staff_id integer, p_company character varying, p_designation character varying, p_from date, p_to date, p_is_current boolean, p_desc text) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN
    UPDATE staff_experience SET company=p_company, designation=p_designation,
        from_date=p_from, to_date=p_to, is_current=p_is_current, description=p_desc
    WHERE id=p_id AND staff_id=p_staff_id;
END;$$;


--
-- Name: sp_update_fee_charge(integer, character varying, numeric, integer, smallint, integer, integer, integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_fee_charge(p_id integer, p_name character varying, p_amount numeric, p_charge_type_id integer, p_apply_month smallint, p_apply_year integer, p_class_id integer, p_academic_year_id integer, p_description text, p_is_active boolean) RETURNS SETOF public.fee_charges
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM fee_charges WHERE id = p_id) THEN
        RAISE EXCEPTION 'fee charge % not found', p_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_charge_type_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'charge_type_id % is not a valid active charge type', p_charge_type_id;
    END IF;

    RETURN QUERY
    UPDATE fee_charges SET
        name = p_name, amount = p_amount, charge_type_id = p_charge_type_id,
        apply_month = p_apply_month, apply_year = p_apply_year,
        class_id = p_class_id, academic_year_id = p_academic_year_id,
        description = p_description, is_active = p_is_active
    WHERE id = p_id
    RETURNING *;
END;
$$;


--
-- Name: sp_update_fee_charge(integer, character varying, numeric, integer, smallint, integer, character varying, integer[], integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_fee_charge(p_id integer, p_name character varying, p_amount numeric, p_charge_type_id integer, p_apply_month smallint, p_apply_year integer, p_target_type character varying, p_class_ids integer[], p_academic_year_id integer, p_description text, p_is_active boolean) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_cid INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM fee_charges WHERE id = p_id) THEN
        RAISE EXCEPTION 'fee charge % not found', p_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_charge_type_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'charge_type_id % is not a valid active charge type', p_charge_type_id;
    END IF;
    IF p_target_type NOT IN ('whole_school', 'classes', 'students') THEN
        RAISE EXCEPTION 'target_type must be whole_school, classes, or students';
    END IF;
    IF p_target_type = 'classes' AND (p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL) THEN
        RAISE EXCEPTION 'at least one class must be selected when target_type is classes';
    END IF;

    UPDATE fee_charges SET
        name = p_name, amount = p_amount, charge_type_id = p_charge_type_id,
        apply_month = p_apply_month, apply_year = p_apply_year,
        target_type = p_target_type, academic_year_id = p_academic_year_id,
        description = p_description, is_active = p_is_active
    WHERE id = p_id;

    DELETE FROM fee_charge_classes WHERE charge_id = p_id;
    IF p_target_type = 'classes' THEN
        FOREACH v_cid IN ARRAY p_class_ids LOOP
            INSERT INTO fee_charge_classes (charge_id, class_id) VALUES (p_id, v_cid);
        END LOOP;
    END IF;

    RETURN p_id;
END;
$$;


--
-- Name: sp_update_fee_charge(integer, character varying, numeric, integer, smallint, integer, character varying, integer[], integer[], integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_fee_charge(p_id integer, p_name character varying, p_amount numeric, p_charge_type_id integer, p_apply_month smallint, p_apply_year integer, p_target_type character varying, p_class_ids integer[], p_student_ids integer[], p_academic_year_id integer, p_description text, p_is_active boolean) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_cid INTEGER;
    v_sid INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM fee_charges WHERE id = p_id) THEN
        RAISE EXCEPTION 'fee charge % not found', p_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM charge_type_definitions WHERE id = p_charge_type_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'charge_type_id % is not a valid active charge type', p_charge_type_id;
    END IF;
    IF p_target_type NOT IN ('whole_school', 'classes', 'students') THEN
        RAISE EXCEPTION 'target_type must be whole_school, classes, or students';
    END IF;
    IF p_target_type = 'classes' AND (p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL) THEN
        RAISE EXCEPTION 'at least one class must be selected when target_type is classes';
    END IF;
    IF p_target_type = 'students' AND (p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL) THEN
        RAISE EXCEPTION 'at least one student must be selected when target_type is students';
    END IF;

    UPDATE fee_charges SET
        name = p_name, amount = p_amount, charge_type_id = p_charge_type_id,
        apply_month = p_apply_month, apply_year = p_apply_year,
        target_type = p_target_type, academic_year_id = p_academic_year_id,
        description = p_description, is_active = p_is_active
    WHERE id = p_id;

    DELETE FROM fee_charge_classes WHERE charge_id = p_id;
    DELETE FROM fee_charge_students WHERE charge_id = p_id;

    IF p_target_type = 'classes' THEN
        FOREACH v_cid IN ARRAY p_class_ids LOOP
            INSERT INTO fee_charge_classes (charge_id, class_id) VALUES (p_id, v_cid);
        END LOOP;
    ELSIF p_target_type = 'students' THEN
        FOREACH v_sid IN ARRAY p_student_ids LOOP
            INSERT INTO fee_charge_students (charge_id, student_id) VALUES (p_id, v_sid);
        END LOOP;
    END IF;

    RETURN p_id;
END;
$$;


--
-- Name: sp_update_grade(integer, character varying, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_grade(p_id integer, p_name character varying, p_description text, p_is_active boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE payroll_grades SET name = p_name, description = p_description, is_active = p_is_active WHERE id = p_id;
$$;


--
-- Name: procurement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_items (
    id integer NOT NULL,
    item_code character varying(30) NOT NULL,
    item_name character varying(150) NOT NULL,
    unit character varying(30) NOT NULL,
    category_id integer,
    min_stock integer DEFAULT 0 NOT NULL,
    max_stock integer,
    preferred_vendor_id integer,
    current_stock integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sp_update_item(integer, character varying, character varying, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_item(p_id integer, p_item_name character varying, p_unit character varying, p_category_id integer, p_min_stock integer, p_max_stock integer, p_preferred_vendor_id integer) RETURNS SETOF public.procurement_items
    LANGUAGE sql
    AS $$
    UPDATE procurement_items
    SET item_name = p_item_name, unit = p_unit, category_id = p_category_id,
        min_stock = COALESCE(p_min_stock, 0), max_stock = p_max_stock, preferred_vendor_id = p_preferred_vendor_id
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_item_category(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_item_category(p_id integer, p_name character varying, p_parent_id integer) RETURNS SETOF public.procurement_item_categories
    LANGUAGE sql
    AS $$
    UPDATE procurement_item_categories SET name = p_name, parent_id = p_parent_id WHERE id = p_id RETURNING *;
$$;


--
-- Name: sp_update_last_login(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_last_login(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE users SET last_login_at = NOW() WHERE id = p_id;
$$;


--
-- Name: sp_update_leave_type(integer, character varying, integer, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_leave_type(p_id integer, p_name character varying, p_max_days_per_year integer, p_notify_mode character varying, p_is_active boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE leave_types SET
        name              = COALESCE(p_name, name),
        max_days_per_year = p_max_days_per_year,
        notify_mode       = COALESCE(p_notify_mode, notify_mode),
        is_active         = COALESCE(p_is_active, is_active)
    WHERE id = p_id;
$$;


--
-- Name: sp_update_membership_rule(character varying, integer, integer, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_membership_rule(p_member_type character varying, p_max_books integer, p_borrow_days integer, p_renewal_limit integer, p_fine_per_day numeric) RETURNS SETOF public.library_membership_rules
    LANGUAGE sql
    AS $$
    UPDATE library_membership_rules
    SET max_books = p_max_books,
        borrow_days = p_borrow_days,
        renewal_limit = p_renewal_limit,
        fine_per_day = p_fine_per_day
    WHERE member_type = p_member_type
    RETURNING *;
$$;


--
-- Name: sp_update_my_profile(integer, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_my_profile(p_user_id integer, p_first_name character varying, p_last_name character varying, p_phone character varying) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE users SET
        first_name = COALESCE(p_first_name, first_name),
        last_name  = COALESCE(p_last_name, last_name),
        phone      = COALESCE(p_phone, phone)
    WHERE id = p_user_id;
$$;


--
-- Name: sp_update_payroll_component(integer, character varying, character varying, character varying, boolean, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_payroll_component(p_id integer, p_name character varying, p_component_type character varying, p_calculation_type character varying, p_is_permanent boolean, p_is_taxable boolean, p_is_statutory boolean, p_is_active boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE payroll_components SET
        name = p_name, component_type = p_component_type, calculation_type = p_calculation_type,
        is_permanent = p_is_permanent, is_taxable = p_is_taxable, is_statutory = p_is_statutory,
        is_active = p_is_active
    WHERE id = p_id;
$$;


--
-- Name: sp_update_payroll_run_status(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_payroll_run_status(p_id integer, p_status character varying, p_finalized_by integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_status = 'pending_approval' THEN
        UPDATE payroll_runs SET status = p_status, submitted_at = NOW() WHERE id = p_id;
    ELSIF p_status IN ('approved','rejected') THEN
        UPDATE payroll_runs SET status = p_status, finalized_at = NOW(), finalized_by = p_finalized_by WHERE id = p_id;
    ELSE
        UPDATE payroll_runs SET status = p_status WHERE id = p_id;
    END IF;
END;
$$;


--
-- Name: sp_update_payroll_settings(character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_payroll_settings(p_basic_salary_mode character varying, p_days_in_month_mode character varying, p_fixed_days_value integer) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE payroll_settings SET
        basic_salary_mode = p_basic_salary_mode,
        days_in_month_mode = p_days_in_month_mode,
        fixed_days_value = p_fixed_days_value
    WHERE id = 1;
$$;


--
-- Name: sp_update_po_item(integer, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_po_item(p_po_item_id integer, p_unit_price numeric, p_tax_percent numeric) RETURNS TABLE(error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_po_id INTEGER;
    v_status VARCHAR;
BEGIN
    SELECT po_id INTO v_po_id FROM po_items WHERE id = p_po_item_id;
    IF v_po_id IS NULL THEN
        RETURN QUERY SELECT 'Item not found.'::VARCHAR; RETURN;
    END IF;
    SELECT status INTO v_status FROM purchase_orders WHERE id = v_po_id;
    IF v_status != 'draft' THEN
        RETURN QUERY SELECT 'Items can only be edited while the PO is a draft.'::VARCHAR; RETURN;
    END IF;

    UPDATE po_items SET unit_price = p_unit_price, tax_percent = COALESCE(p_tax_percent, 0) WHERE id = p_po_item_id;

    UPDATE purchase_orders
    SET total_amount = (
        SELECT COALESCE(SUM(quantity * unit_price * (1 + tax_percent / 100.0)), 0) FROM po_items WHERE po_id = v_po_id
    )
    WHERE id = v_po_id;

    RETURN QUERY SELECT NULL::VARCHAR;
END;
$$;


--
-- Name: sp_update_publisher(integer, character varying, text, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_publisher(p_id integer, p_name character varying, p_address text, p_contact_person character varying, p_phone character varying, p_email character varying) RETURNS SETOF public.library_publishers
    LANGUAGE sql
    AS $$
    UPDATE library_publishers
    SET name = p_name, address = p_address, contact_person = p_contact_person, phone = p_phone, email = p_email
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_settings_by_key(character varying[], character varying[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_settings_by_key(p_keys character varying[], p_values character varying[], p_user_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 1 .. array_length(p_keys, 1) LOOP
        UPDATE system_settings
        SET value = p_values[i], updated_at = NOW(), updated_by = p_user_id
        WHERE key = p_keys[i];
    END LOOP;
END;
$$;


--
-- Name: sp_update_staff(integer, character varying, character varying, character varying, date, character varying, character varying, text, integer, integer, character varying, date, date, numeric, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_staff(p_staff_id integer, p_first_name character varying, p_last_name character varying, p_gender character varying, p_dob date, p_cnic character varying, p_phone character varying, p_address text, p_designation_id integer, p_department_id integer, p_employment_type character varying, p_joining_date date, p_contract_end date, p_salary numeric, p_employee_code character varying, p_user_id integer) RETURNS TABLE(error_msg text)
    LANGUAGE plpgsql
    AS $$BEGIN
    IF p_employee_code IS NOT NULL AND EXISTS(SELECT 1 FROM staff WHERE employee_code=p_employee_code AND id!=p_staff_id) THEN
        RETURN QUERY SELECT 'Employee code already in use';
        RETURN;
    END IF;
    UPDATE staff SET first_name=p_first_name, last_name=p_last_name, gender=p_gender,
        date_of_birth=p_dob, cnic=p_cnic, phone=p_phone, address=p_address,
        designation_id=p_designation_id, department_id=p_department_id,
        employment_type=p_employment_type, joining_date=p_joining_date,
        contract_end_date=p_contract_end, salary=p_salary,
        employee_code=p_employee_code, user_id=p_user_id, updated_at=NOW()
    WHERE id=p_staff_id;
    RETURN QUERY SELECT NULL::TEXT;
END;$$;


--
-- Name: sp_update_staff_personal(integer, character varying, character varying, character varying, date, character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_staff_personal(p_staff_id integer, p_first_name character varying, p_last_name character varying, p_gender character varying, p_dob date, p_cnic character varying, p_phone character varying, p_address text) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN
    UPDATE staff SET first_name=p_first_name, last_name=p_last_name, gender=p_gender,
        date_of_birth=p_dob, cnic=p_cnic, phone=p_phone, address=p_address, updated_at=NOW()
    WHERE id=p_staff_id;
    UPDATE users SET first_name=p_first_name, last_name=p_last_name, phone=p_phone
    WHERE id=(SELECT user_id FROM staff WHERE id=p_staff_id);
END;$$;


--
-- Name: sp_update_staff_status(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_staff_status(p_staff_id integer, p_status character varying) RETURNS TABLE(error_msg text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_old_status VARCHAR;
BEGIN
    IF p_status NOT IN ('active','inactive','terminated','on_leave','resigned') THEN
        RETURN QUERY SELECT 'Invalid status';
        RETURN;
    END IF;

    SELECT status INTO v_old_status FROM staff WHERE id=p_staff_id;

    IF p_status = 'resigned' AND (v_old_status IS DISTINCT FROM 'resigned') THEN
        UPDATE staff SET status=p_status, resignation_accepted_date=CURRENT_DATE, updated_at=NOW() WHERE id=p_staff_id;
    ELSIF p_status <> 'resigned' THEN
        UPDATE staff SET status=p_status, resignation_accepted_date=NULL, updated_at=NOW() WHERE id=p_staff_id;
    ELSE
        UPDATE staff SET status=p_status, updated_at=NOW() WHERE id=p_staff_id;
    END IF;

    RETURN QUERY SELECT NULL::TEXT;
END;
$$;


--
-- Name: sp_update_stock_from_grn(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_stock_from_grn(p_grn_id integer, p_user_id integer) RETURNS TABLE(id integer, error_msg character varying, items_updated integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER := 0;
    v_item RECORD;
    v_new_item_id INTEGER;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM goods_receipt_notes
                  WHERE goods_receipt_notes.id = p_grn_id
                    AND status = 'confirmed' AND stock_updated = FALSE) THEN
        RETURN QUERY SELECT NULL::INTEGER, 'GRN not found, not confirmed, or stock already updated.'::VARCHAR, 0; RETURN;
    END IF;
    FOR v_item IN
        SELECT gi.id AS grn_item_id, gi.quantity_received,
               poi.item_description, poi.unit,
               pri.id AS pr_item_id, pri.item_id, pri.category_id
        FROM grn_items gi
        JOIN po_items poi ON poi.id = gi.po_item_id
        JOIN pr_items pri ON pri.id = poi.pr_item_id
        WHERE gi.grn_id = p_grn_id
    LOOP
        IF v_item.item_id IS NOT NULL THEN
            UPDATE procurement_items
            SET current_stock = COALESCE(current_stock,0) + v_item.quantity_received::INTEGER
            WHERE procurement_items.id = v_item.item_id;
        ELSE
            INSERT INTO procurement_items (item_name, unit, category_id, current_stock, is_active)
            VALUES (v_item.item_description, COALESCE(v_item.unit,'pcs'),
                    v_item.category_id, v_item.quantity_received::INTEGER, TRUE)
            RETURNING procurement_items.id INTO v_new_item_id;
            UPDATE pr_items SET item_id = v_new_item_id
            WHERE pr_items.id = v_item.pr_item_id;
        END IF;
        v_count := v_count + 1;
    END LOOP;
    UPDATE goods_receipt_notes SET
        stock_updated = TRUE, stock_updated_at = NOW(), stock_updated_by = p_user_id
    WHERE goods_receipt_notes.id = p_grn_id;
    RETURN QUERY SELECT p_grn_id, NULL::VARCHAR, v_count;
END;
$$;


--
-- Name: sp_update_student(integer, character varying, character varying, date, character varying, character varying, text, integer, integer, character varying, character varying, character varying, character varying, character varying, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_student(p_id integer, p_first_name character varying, p_last_name character varying, p_date_of_birth date, p_gender character varying, p_blood_group character varying, p_address text, p_class_id integer, p_parent_id integer, p_status character varying, p_father_name character varying, p_mother_name character varying, p_father_cnic character varying, p_father_phone character varying, p_mother_phone character varying, p_clear_parent boolean DEFAULT false) RETURNS SETOF public.students
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INTEGER;
BEGIN
    UPDATE students SET
        first_name    = COALESCE(p_first_name, first_name),
        last_name     = COALESCE(p_last_name, last_name),
        date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
        gender        = COALESCE(p_gender, gender),
        blood_group   = COALESCE(p_blood_group, blood_group),
        address       = COALESCE(p_address, address),
        class_id      = COALESCE(p_class_id, class_id),
        parent_id     = CASE WHEN p_clear_parent THEN NULL ELSE COALESCE(p_parent_id, parent_id) END,
        status        = COALESCE(p_status, status),
        father_name   = COALESCE(p_father_name, father_name),
        mother_name   = COALESCE(p_mother_name, mother_name),
        father_cnic   = COALESCE(p_father_cnic, father_cnic),
        father_phone  = COALESCE(p_father_phone, father_phone),
        mother_phone  = COALESCE(p_mother_phone, mother_phone)
    WHERE students.id = p_id
    RETURNING user_id INTO v_user_id;

    IF p_status IS NOT NULL AND v_user_id IS NOT NULL THEN
        UPDATE users SET is_active = (p_status = 'active') WHERE id = v_user_id;
    END IF;

    RETURN QUERY SELECT * FROM students WHERE students.id = p_id;
END;
$$;


--
-- Name: sp_update_subject(integer, character varying, character varying, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_subject(p_id integer, p_name character varying, p_code character varying, p_description text, p_credit_hours integer, p_is_active boolean) RETURNS SETOF public.subjects
    LANGUAGE sql
    AS $$
    UPDATE subjects SET
        name = p_name, code = p_code, description = p_description,
        credit_hours = COALESCE(p_credit_hours, 1), is_active = COALESCE(p_is_active, TRUE)
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_syllabus(integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_syllabus(p_id integer, p_title character varying, p_description text) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE syllabus SET title = p_title, description = p_description, updated_at = NOW() WHERE id = p_id;
$$;


--
-- Name: sp_update_syllabus_topic(integer, integer, character varying, text, integer, integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_syllabus_topic(p_id integer, p_syllabus_id integer, p_title character varying, p_description text, p_planned_week integer, p_planned_month integer, p_planned_date date) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE syllabus_topics
    SET title = p_title, description = p_description, planned_week = p_planned_week,
        planned_month = p_planned_month, planned_date = p_planned_date
    WHERE id = p_id AND syllabus_id = p_syllabus_id;
$$;


--
-- Name: sp_update_teacher(integer, character varying, character varying, character varying, character varying, character varying, date, character varying, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_teacher(p_id integer, p_first_name character varying, p_last_name character varying, p_qualification character varying, p_specialization character varying, p_status character varying, p_date_of_birth date, p_gender character varying, p_join_date date) RETURNS SETOF public.teachers
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INTEGER;
BEGIN
    UPDATE teachers SET
        first_name     = COALESCE(p_first_name, first_name),
        last_name      = COALESCE(p_last_name, last_name),
        qualification  = COALESCE(p_qualification, qualification),
        specialization = COALESCE(p_specialization, specialization),
        status         = COALESCE(p_status, status),
        date_of_birth  = COALESCE(p_date_of_birth, date_of_birth),
        gender         = COALESCE(p_gender, gender),
        join_date      = COALESCE(p_join_date, join_date)
    WHERE teachers.id = p_id
    RETURNING user_id INTO v_user_id;

    IF p_status IS NOT NULL AND v_user_id IS NOT NULL THEN
        UPDATE users SET is_active = (p_status = 'active') WHERE id = v_user_id;
    END IF;

    RETURN QUERY SELECT * FROM teachers WHERE teachers.id = p_id;
END;
$$;


--
-- Name: sp_update_user(integer, character varying, character varying, character varying, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_user(p_id integer, p_email character varying, p_first_name character varying, p_last_name character varying, p_phone character varying, p_is_active boolean) RETURNS TABLE(id integer, email character varying, first_name character varying, last_name character varying, is_active boolean)
    LANGUAGE sql
    AS $$
    UPDATE users SET
        email      = COALESCE(p_email, email),
        first_name = COALESCE(p_first_name, first_name),
        last_name  = COALESCE(p_last_name, last_name),
        phone      = COALESCE(p_phone, phone),
        is_active  = COALESCE(p_is_active, is_active)
    WHERE users.id = p_id
    RETURNING users.id, users.email, users.first_name, users.last_name, users.is_active;
$$;


--
-- Name: sp_update_user_theme(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_user_theme(p_user_id integer, p_theme character varying) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE users SET theme_preference = p_theme WHERE id = p_user_id;
$$;


--
-- Name: sp_update_vendor(integer, character varying, character varying, character varying, character varying, text, character varying, character varying, character varying, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_vendor(p_id integer, p_name character varying, p_contact_person character varying, p_phone character varying, p_email character varying, p_address text, p_ntn character varying, p_strn character varying, p_bank_name character varying, p_bank_account_no character varying, p_bank_iban character varying, p_category_id integer) RETURNS SETOF public.procurement_vendors
    LANGUAGE sql
    AS $$
    UPDATE procurement_vendors
    SET name = p_name, contact_person = p_contact_person, phone = p_phone, email = p_email, address = p_address,
        ntn = p_ntn, strn = p_strn, bank_name = p_bank_name, bank_account_no = p_bank_account_no, bank_iban = p_bank_iban,
        category_id = p_category_id
    WHERE id = p_id
    RETURNING *;
$$;


--
-- Name: sp_update_withdrawal_config(integer, jsonb, boolean, boolean, boolean, integer, jsonb, character varying, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_update_withdrawal_config(p_user_id integer, p_departments jsonb, p_require_coordinator boolean, p_require_principal boolean, p_allow_appeal boolean, p_appeal_days integer, p_required_documents jsonb, p_tc_prefix character varying, p_auto_generate_tc boolean) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE withdrawal_config SET
        departments=p_departments, require_coordinator=p_require_coordinator,
        require_principal=p_require_principal, allow_appeal=p_allow_appeal,
        appeal_days=p_appeal_days, required_documents=p_required_documents,
        tc_prefix=p_tc_prefix, auto_generate_tc=p_auto_generate_tc,
        updated_at=NOW(), updated_by=p_user_id
    WHERE withdrawal_config.id=1;
    RETURN QUERY SELECT 1, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_upsert_department_schedule(integer, time without time zone, time without time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_department_schedule(p_department_id integer, p_start time without time zone, p_end time without time zone, p_grace integer) RETURNS TABLE(id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id INT;
BEGIN
    INSERT INTO department_attendance_schedules(department_id, start_time, end_time, grace_minutes)
    VALUES(p_department_id, p_start, p_end, p_grace)
    ON CONFLICT (department_id) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        grace_minutes = EXCLUDED.grace_minutes
    RETURNING department_attendance_schedules.id INTO v_id;
    RETURN QUERY SELECT v_id;
END;
$$;


--
-- Name: sp_upsert_designation_grade(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_designation_grade(p_designation_id integer, p_grade_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO staff_designation_grades(designation_id, grade_id)
    VALUES(p_designation_id, p_grade_id)
    ON CONFLICT (designation_id) DO UPDATE SET grade_id = p_grade_id;
$$;


--
-- Name: sp_upsert_grade_component(integer, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_grade_component(p_grade_id integer, p_component_id integer, p_value numeric) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_grade_components(grade_id, component_id, value)
    VALUES(p_grade_id, p_component_id, p_value)
    ON CONFLICT (grade_id, component_id) DO UPDATE SET value = p_value;
$$;


--
-- Name: sp_upsert_grade_department_component(integer, integer, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_grade_department_component(p_grade_id integer, p_department_id integer, p_component_id integer, p_value numeric) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_grade_department_components(grade_id, department_id, component_id, value)
    VALUES(p_grade_id, p_department_id, p_component_id, p_value)
    ON CONFLICT (grade_id, department_id, component_id) DO UPDATE SET value = p_value;
$$;


--
-- Name: sp_upsert_payslip(integer, integer, character varying, numeric, numeric, numeric, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_payslip(p_run_id integer, p_staff_id integer, p_salary_type character varying, p_gross numeric, p_deductions numeric, p_net numeric, p_earnings_breakdown jsonb, p_deductions_breakdown jsonb, p_days_present numeric, p_days_absent numeric, p_days_half_day numeric, p_days_on_leave numeric, p_hours_worked numeric) RETURNS TABLE(id integer)
    LANGUAGE sql
    AS $$
    INSERT INTO payroll_payslips(payroll_run_id, staff_id, salary_type, gross_earnings, total_deductions, net_pay,
        earnings_breakdown, deductions_breakdown, days_present, days_absent, days_half_day, days_on_leave, hours_worked)
    VALUES(p_run_id, p_staff_id, p_salary_type, p_gross, p_deductions, p_net,
        p_earnings_breakdown, p_deductions_breakdown, p_days_present, p_days_absent, p_days_half_day, p_days_on_leave, p_hours_worked)
    ON CONFLICT (payroll_run_id, staff_id) DO UPDATE SET
        salary_type=p_salary_type, gross_earnings=p_gross, total_deductions=p_deductions, net_pay=p_net,
        earnings_breakdown=p_earnings_breakdown, deductions_breakdown=p_deductions_breakdown,
        days_present=p_days_present, days_absent=p_days_absent, days_half_day=p_days_half_day,
        days_on_leave=p_days_on_leave, hours_worked=p_hours_worked
    RETURNING id;
$$;


--
-- Name: sp_upsert_settings_by_category(character varying, character varying[], character varying[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_settings_by_category(p_category character varying, p_keys character varying[], p_values character varying[], p_user_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 1 .. array_length(p_keys, 1) LOOP
        INSERT INTO system_settings (category, key, value, updated_at, updated_by)
        VALUES (p_category, p_keys[i], p_values[i], NOW(), p_user_id)
        ON CONFLICT (category, key) DO UPDATE
        SET value = p_values[i], updated_at = NOW(), updated_by = p_user_id;
    END LOOP;
END;
$$;


--
-- Name: sp_upsert_staff_payroll_profile(integer, character varying, numeric, numeric, integer, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_staff_payroll_profile(p_staff_id integer, p_salary_type character varying, p_lump_sum_amount numeric, p_basic_salary numeric, p_grade_id integer, p_hourly_rate numeric, p_daily_wage_amount numeric) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO staff_payroll_profile(staff_id, salary_type, lump_sum_amount, basic_salary, grade_id, hourly_rate, daily_wage_amount, updated_at)
    VALUES(p_staff_id, p_salary_type, p_lump_sum_amount, p_basic_salary, p_grade_id, p_hourly_rate, p_daily_wage_amount, NOW())
    ON CONFLICT (staff_id) DO UPDATE SET
        salary_type = p_salary_type, lump_sum_amount = p_lump_sum_amount, basic_salary = p_basic_salary,
        grade_id = p_grade_id, hourly_rate = p_hourly_rate, daily_wage_amount = p_daily_wage_amount, updated_at = NOW();
$$;


--
-- Name: sp_upsert_tax_slab(integer, integer, numeric, numeric, numeric, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_upsert_tax_slab(p_id integer, p_slab_set_id integer, p_min_income numeric, p_max_income numeric, p_fixed_amount numeric, p_rate_percent numeric, p_sort_order integer) RETURNS TABLE(id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE v_id INT;
BEGIN
    IF p_id IS NULL THEN
        INSERT INTO payroll_tax_slabs(slab_set_id, min_income, max_income, fixed_amount, rate_percent, sort_order)
        VALUES(p_slab_set_id, p_min_income, p_max_income, p_fixed_amount, p_rate_percent, p_sort_order)
        RETURNING payroll_tax_slabs.id INTO v_id;
    ELSE
        UPDATE payroll_tax_slabs SET min_income=p_min_income, max_income=p_max_income,
            fixed_amount=p_fixed_amount, rate_percent=p_rate_percent, sort_order=p_sort_order
        WHERE payroll_tax_slabs.id = p_id;
        v_id := p_id;
    END IF;
    RETURN QUERY SELECT v_id;
END;
$$;


--
-- Name: sp_user_has_permission(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_user_has_permission(p_user_id integer, p_permission_code character varying) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(
        SELECT 1 FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = p_user_id AND p.code = p_permission_code
    );
$$;


--
-- Name: sp_user_has_role_in(integer, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_user_has_role_in(p_user_id integer, p_role_names text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS(
        SELECT 1 FROM roles r JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id AND r.name = ANY(p_role_names)
    );
$$;


--
-- Name: sp_verify_audit_copy(integer, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_verify_audit_copy(p_audit_id integer, p_identifier character varying, p_verified_by integer) RETURNS TABLE(copy_id integer, book_title text, already_verified boolean, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_copy_id INTEGER;
    v_status VARCHAR;
    v_title TEXT;
    v_already BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM library_inventory_audits a WHERE a.id = p_audit_id AND a.status = 'in_progress') THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::TEXT, FALSE, 'This audit is not currently in progress.'::VARCHAR; RETURN;
    END IF;

    SELECT bc.id, bc.status, b.title::TEXT INTO v_copy_id, v_status, v_title
    FROM library_book_copies bc
    JOIN library_books b ON b.id = bc.book_id
    WHERE bc.barcode = p_identifier OR bc.accession_no = p_identifier;

    IF v_copy_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::TEXT, FALSE, 'No copy found with that barcode or accession number.'::VARCHAR; RETURN;
    END IF;
    IF v_status != 'available' THEN
        RETURN QUERY SELECT v_copy_id, v_title, FALSE, ('This copy is currently ' || v_status || ', not available \xe2\x80\x94 skipping.')::VARCHAR; RETURN;
    END IF;

    SELECT EXISTS(SELECT 1 FROM library_inventory_audit_items ai WHERE ai.audit_id = p_audit_id AND ai.copy_id = v_copy_id) INTO v_already;

    IF NOT v_already THEN
        INSERT INTO library_inventory_audit_items (audit_id, copy_id, verified_by)
        VALUES (p_audit_id, v_copy_id, p_verified_by);
    END IF;

    RETURN QUERY SELECT v_copy_id, v_title, v_already, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_waive_charge(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_waive_charge(p_item_id integer, p_user_id integer) RETURNS TABLE(new_invoice_id integer, new_invoice_no text, new_amount numeric, old_invoice_id integer, waived_label text, waived_amount numeric, student_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id INTEGER;
    v_student_id INTEGER;
    v_due_date DATE;
    v_for_class_id INTEGER;
    v_month_year VARCHAR;
    v_invoice_amount NUMERIC;
    v_discount NUMERIC;
    v_status VARCHAR;
    v_label VARCHAR;
    v_amount NUMERIC;
    v_is_waived BOOLEAN;
    v_new_amount NUMERIC;
    v_next_id INTEGER;
    v_new_invoice_no VARCHAR;
    v_new_invoice_id INTEGER;
    r RECORD;
BEGIN
    SELECT fii.label, fii.amount, fii.is_waived,
           fi.id, fi.student_id, fi.due_date, fi.for_class_id, fi.month_year,
           fi.amount, fi.discount, fi.status
    INTO v_label, v_amount, v_is_waived,
         v_invoice_id, v_student_id, v_due_date, v_for_class_id, v_month_year,
         v_invoice_amount, v_discount, v_status
    FROM fee_invoice_items fii
    JOIN fee_invoices fi ON fi.id = fii.invoice_id
    WHERE fii.id = p_item_id AND fii.item_type = 'charge';

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'CHARGE_NOT_FOUND';
    END IF;
    IF v_status = 'paid' THEN
        RAISE EXCEPTION 'INVOICE_ALREADY_PAID';
    END IF;
    IF v_is_waived THEN
        RAISE EXCEPTION 'ALREADY_WAIVED';
    END IF;

    UPDATE fee_invoice_items SET is_waived=TRUE, waived_at=NOW(), waived_by=p_user_id
    WHERE id = p_item_id;

    -- Cancel the old invoice AND free its (student_id, month_year) slot,
    -- since that's enforced by a unique index and the new invoice needs it.
    UPDATE fee_invoices SET status='cancelled', month_year=NULL WHERE id = v_invoice_id;

    v_new_amount := v_invoice_amount - v_amount;

    SELECT COALESCE(MAX(id), 0) + 1 INTO v_next_id FROM fee_invoices;
    v_new_invoice_no := 'INV-' || EXTRACT(YEAR FROM v_due_date)::TEXT || '-' || LPAD(v_next_id::TEXT, 4, '0');

    INSERT INTO fee_invoices
        (student_id, amount, discount, due_date, issued_by, month_year, for_class_id, invoice_no, status)
    VALUES
        (v_student_id, v_new_amount, v_discount, v_due_date, p_user_id, v_month_year, v_for_class_id, v_new_invoice_no, 'unpaid')
    RETURNING id INTO v_new_invoice_id;

    UPDATE fee_invoices SET superseded_by = v_new_invoice_id WHERE id = v_invoice_id;

    FOR r IN
        SELECT item_type, label, amount, charge_id, discount_id
        FROM fee_invoice_items
        WHERE invoice_id = v_invoice_id AND id != p_item_id
    LOOP
        INSERT INTO fee_invoice_items (invoice_id, item_type, label, amount, charge_id, discount_id)
        VALUES (v_new_invoice_id, r.item_type, r.label, r.amount, r.charge_id, r.discount_id);
    END LOOP;

    RETURN QUERY SELECT v_new_invoice_id, v_new_invoice_no::TEXT, v_new_amount, v_invoice_id, v_label::TEXT, v_amount, v_student_id;
END;
$$;


--
-- Name: sp_waive_fine(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_waive_fine(p_transaction_id integer, p_waived_by integer) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pay_id INTEGER;
    v_fine NUMERIC;
BEGIN
    SELECT lit.fine_amount INTO v_fine FROM library_issue_transactions lit WHERE lit.id = p_transaction_id AND lit.fine_status = 'pending';
    IF v_fine IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, 'No pending fine found for this transaction.'::VARCHAR; RETURN;
    END IF;

    INSERT INTO library_fine_payments (transaction_id, amount_paid, is_waived, waived_by, waived_at)
    VALUES (p_transaction_id, v_fine, TRUE, p_waived_by, NOW())
    RETURNING library_fine_payments.id INTO v_pay_id;

    UPDATE library_issue_transactions SET fine_status = 'waived' WHERE library_issue_transactions.id = p_transaction_id;

    RETURN QUERY SELECT v_pay_id, NULL::VARCHAR;
END;
$$;


--
-- Name: sp_withdrawal_require_action(integer, character varying, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_withdrawal_require_action(p_request_id integer, p_department character varying, p_user_id integer, p_note text) RETURNS TABLE(id integer, error_msg character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM withdrawal_clearances wc
                  WHERE wc.request_id = p_request_id AND wc.department = p_department) THEN
        RETURN QUERY SELECT NULL::INT, 'Clearance not found'::VARCHAR; RETURN;
    END IF;
    UPDATE withdrawal_clearances SET
        status = 'pending',
        cleared_by = p_user_id,
        cleared_at = NOW(),
        note = p_note
    WHERE withdrawal_clearances.request_id = p_request_id
      AND withdrawal_clearances.department = p_department;
    RETURN QUERY SELECT p_request_id, NULL::VARCHAR;
END;
$$;


--
-- Name: trg_fn_issue_sets_copy_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_issue_sets_copy_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.returned_at IS NULL THEN
        UPDATE library_book_copies SET status = 'issued' WHERE id = NEW.copy_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_prevent_delete_issued_copy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_prevent_delete_issued_copy() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status = 'issued' THEN
        RAISE EXCEPTION 'Cannot delete a book copy that is currently issued.';
    END IF;
    RETURN OLD;
END;
$$;


--
-- Name: trg_fn_return_sets_copy_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_return_sets_copy_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.returned_at IS NULL AND NEW.returned_at IS NOT NULL THEN
        UPDATE library_book_copies
        SET status = CASE
            WHEN NEW.return_condition = 'lost' THEN 'lost'
            WHEN NEW.return_condition = 'damaged' THEN 'damaged'
            ELSE 'available'
        END,
        condition = COALESCE(NEW.return_condition, condition)
        WHERE id = NEW.copy_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: academic_years_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.academic_years_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: academic_years_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.academic_years_id_seq OWNED BY public.academic_years.id;


--
-- Name: announcement_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_reads (
    id integer NOT NULL,
    announcement_id integer NOT NULL,
    user_id integer NOT NULL,
    read_at timestamp without time zone DEFAULT now()
);


--
-- Name: announcement_reads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.announcement_reads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: announcement_reads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.announcement_reads_id_seq OWNED BY public.announcement_reads.id;


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    body text,
    target_roles text[],
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    priority character varying(20) DEFAULT 'normal'::character varying,
    ann_type character varying(20) DEFAULT 'manual'::character varying,
    target_role character varying(50) DEFAULT 'all'::character varying,
    target_class integer,
    attachment character varying(500),
    start_date date DEFAULT CURRENT_DATE,
    end_date date,
    is_active boolean DEFAULT true,
    source_type character varying(50),
    source_id integer,
    link character varying(200),
    link_label character varying(50) DEFAULT 'View'::character varying,
    CONSTRAINT announcements_priority_check CHECK (((priority)::text = ANY ((ARRAY['normal'::character varying, 'important'::character varying, 'urgent'::character varying])::text[])))
);


--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: assignment_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignment_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignment_submissions_id_seq OWNED BY public.assignment_submissions.id;


--
-- Name: assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignments_id_seq OWNED BY public.assignments.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    student_id integer,
    class_id integer,
    date date NOT NULL,
    status character varying(10) NOT NULL,
    marked_by integer,
    created_at timestamp without time zone DEFAULT now(),
    subject_id integer,
    remarks text,
    updated_by integer,
    updated_at timestamp with time zone,
    CONSTRAINT attendance_status_check CHECK (((status)::text = ANY ((ARRAY['present'::character varying, 'absent'::character varying, 'late'::character varying, 'excused'::character varying, 'on_leave'::character varying])::text[])))
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: attendance_schedule_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_schedule_settings (
    id integer DEFAULT 1 NOT NULL,
    mode character varying(20) DEFAULT 'same_for_all'::character varying NOT NULL,
    default_start_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    default_end_time time without time zone DEFAULT '16:00:00'::time without time zone NOT NULL,
    grace_minutes integer DEFAULT 10 NOT NULL,
    CONSTRAINT attendance_schedule_settings_mode_check CHECK (((mode)::text = ANY ((ARRAY['same_for_all'::character varying, 'per_department'::character varying])::text[]))),
    CONSTRAINT single_row_attendance_schedule CHECK ((id = 1))
);


--
-- Name: attendance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_settings (
    id integer DEFAULT 1 NOT NULL,
    rfid_device_api_key character varying(100),
    auto_close_time time without time zone DEFAULT '20:00:00'::time without time zone,
    CONSTRAINT single_row_attendance_settings CHECK ((id = 1))
);


--
-- Name: attendance_status_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_status_thresholds (
    id integer DEFAULT 1 NOT NULL,
    min_present_hours numeric(4,2) DEFAULT 6 NOT NULL,
    min_half_day_hours numeric(4,2) DEFAULT 3 NOT NULL,
    max_absent_hours numeric(4,2) DEFAULT 1 NOT NULL,
    min_session_minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT single_row_attendance_thresholds CHECK ((id = 1))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    table_name character varying(100),
    operation character varying(10),
    old_data jsonb,
    new_data jsonb,
    user_id integer,
    changed_at timestamp without time zone DEFAULT now(),
    record_id integer
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: calendar_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calendar_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calendar_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calendar_events_id_seq OWNED BY public.calendar_events.id;


--
-- Name: charge_type_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.charge_type_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: charge_type_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.charge_type_definitions_id_seq OWNED BY public.charge_type_definitions.id;


--
-- Name: class_fee_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_fee_config (
    id integer NOT NULL,
    class_id integer NOT NULL,
    academic_year_id integer NOT NULL,
    tuition_fee numeric(10,2) DEFAULT 0 NOT NULL,
    due_day smallint DEFAULT 10 NOT NULL,
    late_fee_type character varying(20) DEFAULT 'none'::character varying NOT NULL,
    late_fee_amount numeric(10,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_fee_config_late_fee_type_check CHECK (((late_fee_type)::text = ANY ((ARRAY['none'::character varying, 'fixed'::character varying, 'percentage'::character varying, 'per_day'::character varying])::text[])))
);


--
-- Name: class_fee_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.class_fee_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: class_fee_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.class_fee_config_id_seq OWNED BY public.class_fee_config.id;


--
-- Name: class_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_fees (
    id integer NOT NULL,
    class_id integer NOT NULL,
    fee_type_id integer NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    academic_year_id integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_fees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.class_fees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: class_fees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.class_fees_id_seq OWNED BY public.class_fees.id;


--
-- Name: class_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_subjects (
    id integer NOT NULL,
    class_id integer NOT NULL,
    subject_id integer NOT NULL,
    academic_year_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.class_subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: class_subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.class_subjects_id_seq OWNED BY public.class_subjects.id;


--
-- Name: class_teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_teachers (
    class_id integer NOT NULL,
    teacher_id integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: classes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.classes_id_seq OWNED BY public.classes.id;


--
-- Name: daily_diary_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_diary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_diary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_diary_id_seq OWNED BY public.daily_diary.id;


--
-- Name: department_attendance_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_attendance_schedules (
    id integer NOT NULL,
    department_id integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    grace_minutes integer DEFAULT 10 NOT NULL
);


--
-- Name: department_attendance_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.department_attendance_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: department_attendance_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.department_attendance_schedules_id_seq OWNED BY public.department_attendance_schedules.id;


--
-- Name: department_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_roles (
    id integer NOT NULL,
    department_id integer NOT NULL,
    role_id integer NOT NULL
);


--
-- Name: department_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.department_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: department_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.department_roles_id_seq OWNED BY public.department_roles.id;


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    department_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: designations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.designations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: designations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.designations_id_seq OWNED BY public.designations.id;


--
-- Name: diary_publish; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diary_publish (
    id integer NOT NULL,
    class_id integer NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    published_by integer,
    published_at timestamp without time zone DEFAULT now()
);


--
-- Name: diary_publish_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diary_publish_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diary_publish_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diary_publish_id_seq OWNED BY public.diary_publish.id;


--
-- Name: discipline_appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discipline_appeals (
    id integer NOT NULL,
    case_id integer,
    submitted_by integer,
    appeal_note text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now(),
    response text,
    response_by integer,
    response_at timestamp with time zone,
    outcome character varying(20)
);


--
-- Name: discipline_appeals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discipline_appeals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discipline_appeals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discipline_appeals_id_seq OWNED BY public.discipline_appeals.id;


--
-- Name: discipline_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discipline_cases (
    id integer NOT NULL,
    student_id integer,
    reported_by integer,
    coordinator_id integer,
    principal_id integer,
    violation_type character varying(50) NOT NULL,
    severity integer DEFAULT 1,
    description text NOT NULL,
    incident_date date NOT NULL,
    status character varying(30) DEFAULT 'reported'::character varying,
    action_type character varying(20),
    suspension_from date,
    suspension_to date,
    action_note text,
    hearing_date timestamp with time zone,
    hearing_notes text,
    appeal_deadline date,
    appeal_submitted boolean DEFAULT false,
    appeal_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hearing_location character varying(200),
    appeal_outcome character varying(20) DEFAULT NULL::character varying,
    CONSTRAINT dc_action_check CHECK (((action_type)::text = ANY ((ARRAY['warning'::character varying, 'suspension'::character varying, 'expulsion'::character varying, 'dismissed'::character varying, NULL::character varying])::text[]))),
    CONSTRAINT dc_status_check CHECK (((status)::text = ANY ((ARRAY['reported'::character varying, 'under_review'::character varying, 'hearing_scheduled'::character varying, 'hearing_done'::character varying, 'decision_pending'::character varying, 'warning'::character varying, 'suspended'::character varying, 'suspension'::character varying, 'expelled'::character varying, 'expulsion'::character varying, 'dismissed'::character varying, 'appealed'::character varying])::text[])))
);


--
-- Name: discipline_cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discipline_cases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discipline_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discipline_cases_id_seq OWNED BY public.discipline_cases.id;


--
-- Name: discipline_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discipline_config (
    id integer NOT NULL,
    violation_types jsonb DEFAULT '[]'::jsonb,
    severity_labels jsonb DEFAULT '{"1": "Minor", "2": "Moderate", "3": "Serious", "4": "Critical"}'::jsonb,
    hearing_min_severity integer DEFAULT 2,
    committee_min_members integer DEFAULT 2,
    require_head boolean DEFAULT true,
    allow_appeal boolean DEFAULT true,
    appeal_days integer DEFAULT 7,
    max_suspension_days integer DEFAULT 14,
    auto_reinstate boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by integer
);


--
-- Name: discipline_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discipline_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discipline_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discipline_config_id_seq OWNED BY public.discipline_config.id;


--
-- Name: discipline_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discipline_evidence (
    id integer NOT NULL,
    case_id integer,
    filename character varying(300),
    url character varying(500),
    description text,
    uploaded_by integer,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: discipline_evidence_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discipline_evidence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discipline_evidence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discipline_evidence_id_seq OWNED BY public.discipline_evidence.id;


--
-- Name: discipline_hearings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discipline_hearings (
    id integer NOT NULL,
    case_id integer,
    scheduled_at timestamp with time zone,
    conducted_at timestamp with time zone,
    attendees text,
    notes text,
    outcome text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: discipline_hearings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discipline_hearings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discipline_hearings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discipline_hearings_id_seq OWNED BY public.discipline_hearings.id;


--
-- Name: discount_apply_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_apply_config (
    id integer NOT NULL,
    on_all boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sibling_rank_method character varying DEFAULT 'class'::character varying,
    CONSTRAINT discount_apply_config_sibling_rank_method_check CHECK (((sibling_rank_method)::text = ANY ((ARRAY['class'::character varying, 'registration_no'::character varying, 'dob'::character varying])::text[])))
);


--
-- Name: discount_apply_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discount_apply_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discount_apply_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discount_apply_config_id_seq OWNED BY public.discount_apply_config.id;


--
-- Name: discount_apply_fee_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_apply_fee_types (
    id integer NOT NULL,
    fee_type_id integer NOT NULL
);


--
-- Name: discount_apply_fee_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discount_apply_fee_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discount_apply_fee_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discount_apply_fee_types_id_seq OWNED BY public.discount_apply_fee_types.id;


--
-- Name: discount_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    type character varying(20) DEFAULT 'percentage'::character varying NOT NULL,
    value numeric(10,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_sibling boolean DEFAULT false NOT NULL,
    CONSTRAINT discount_types_type_check CHECK (((type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::text[])))
);


--
-- Name: discount_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discount_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discount_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discount_types_id_seq OWNED BY public.discount_types.id;


--
-- Name: event_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_types_id_seq OWNED BY public.event_types.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    event_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    venue character varying(200),
    event_type character varying(50) DEFAULT 'general'::character varying NOT NULL,
    target_roles text[] DEFAULT '{}'::text[],
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: exam_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_classes (
    id integer NOT NULL,
    exam_id integer,
    class_id integer,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: exam_classes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_classes_id_seq OWNED BY public.exam_classes.id;


--
-- Name: exam_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_config (
    id integer NOT NULL,
    academic_year_id integer,
    passing_pct numeric(5,2) DEFAULT 40,
    max_fail_subjects integer DEFAULT 2,
    allow_compartment boolean DEFAULT true,
    compartment_min_pct numeric(5,2) DEFAULT 33,
    position_formula jsonb DEFAULT '[]'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by integer,
    grading_mode character varying(10) DEFAULT 'score'::character varying,
    datesheet_publish_mode character varying(20) DEFAULT 'per_class'::character varying,
    datesheet_require_approval boolean DEFAULT true
);


--
-- Name: exam_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_config_id_seq OWNED BY public.exam_config.id;


--
-- Name: exam_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_marks (
    id integer NOT NULL,
    exam_id integer,
    exam_subject_id integer,
    student_id integer,
    marks_obtained numeric(6,2),
    is_absent boolean DEFAULT false,
    remarks text,
    entered_by integer,
    entered_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    class_id integer,
    subject_id integer
);


--
-- Name: exam_marks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_marks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_marks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_marks_id_seq OWNED BY public.exam_marks.id;


--
-- Name: exam_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_results (
    id integer NOT NULL,
    exam_id integer,
    student_id integer,
    total_marks numeric(8,2) DEFAULT 0,
    marks_obtained numeric(8,2) DEFAULT 0,
    percentage numeric(5,2) DEFAULT 0,
    grade character varying(5),
    gpa numeric(3,2),
    class_position integer,
    subjects_failed integer DEFAULT 0,
    is_pass boolean DEFAULT false,
    is_compartment boolean DEFAULT false,
    compiled_at timestamp with time zone,
    class_id integer
);


--
-- Name: exam_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_results_id_seq OWNED BY public.exam_results.id;


--
-- Name: exam_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_schedule (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    subject_id integer NOT NULL,
    exam_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    room_number character varying(20)
);


--
-- Name: exam_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_schedule_id_seq OWNED BY public.exam_schedule.id;


--
-- Name: exam_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_subjects (
    id integer NOT NULL,
    exam_id integer,
    subject_id integer,
    teacher_id integer,
    total_marks numeric(6,2) DEFAULT 100,
    passing_marks numeric(6,2) DEFAULT 40,
    exam_date date,
    start_time time without time zone,
    duration_mins integer DEFAULT 120,
    venue character varying(100),
    marks_submitted boolean DEFAULT false,
    submitted_at timestamp with time zone,
    class_id integer,
    submitted_by integer
);


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_subjects_id_seq OWNED BY public.exam_subjects.id;


--
-- Name: exam_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    weight numeric(5,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    order_no integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    publish_mode character varying(20) DEFAULT 'per_class'::character varying,
    require_datesheet_approval boolean DEFAULT true,
    include_in_final boolean DEFAULT true,
    datesheet_submit_role character varying(30) DEFAULT 'academic_coordinator'::character varying,
    datesheet_approve_role character varying(30) DEFAULT 'principal'::character varying,
    datesheet_publish_role character varying(30) DEFAULT 'academic_coordinator'::character varying
);


--
-- Name: exam_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_types_id_seq OWNED BY public.exam_types.id;


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    academic_year_id integer,
    start_date date,
    end_date date,
    class_id integer,
    datesheet_published boolean DEFAULT false,
    datesheet_published_at timestamp with time zone,
    datesheet_published_by integer,
    exam_type_id integer,
    created_by integer,
    published_by integer,
    approved_by integer,
    published_at timestamp with time zone,
    approved_at timestamp with time zone,
    status character varying(30) DEFAULT 'draft'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    datesheet_status character varying(20) DEFAULT 'draft'::character varying,
    datesheet_submitted_at timestamp with time zone,
    datesheet_approved_at timestamp with time zone,
    datesheet_approved_by integer,
    CONSTRAINT exam_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'marks_open'::character varying, 'submitted'::character varying, 'compiled'::character varying, 'reviewed'::character varying, 'approved'::character varying, 'published'::character varying])::text[])))
);


--
-- Name: exams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exams_id_seq OWNED BY public.exams.id;


--
-- Name: fee_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: fee_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_categories_id_seq OWNED BY public.fee_categories.id;


--
-- Name: fee_charge_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_charge_classes (
    id integer NOT NULL,
    charge_id integer NOT NULL,
    class_id integer NOT NULL
);


--
-- Name: fee_charge_classes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_charge_classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_charge_classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_charge_classes_id_seq OWNED BY public.fee_charge_classes.id;


--
-- Name: fee_charge_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_charge_students (
    id integer NOT NULL,
    charge_id integer NOT NULL,
    student_id integer NOT NULL
);


--
-- Name: fee_charge_students_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_charge_students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_charge_students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_charge_students_id_seq OWNED BY public.fee_charge_students.id;


--
-- Name: fee_charges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_charges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_charges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_charges_id_seq OWNED BY public.fee_charges.id;


--
-- Name: fee_invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_invoice_items (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    item_type character varying(20) NOT NULL,
    label character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    charge_id integer,
    discount_id integer,
    is_waived boolean DEFAULT false NOT NULL,
    waived_at timestamp without time zone,
    waived_by integer,
    CONSTRAINT fee_invoice_items_item_type_check CHECK (((item_type)::text = ANY ((ARRAY['tuition'::character varying, 'charge'::character varying, 'discount'::character varying, 'late_fee'::character varying])::text[])))
);


--
-- Name: fee_invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_invoice_items_id_seq OWNED BY public.fee_invoice_items.id;


--
-- Name: fee_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_invoices_id_seq OWNED BY public.fee_invoices.id;


--
-- Name: fee_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_structures (
    id integer NOT NULL,
    name character varying(100),
    academic_year_id integer,
    amount numeric(10,2),
    due_date date,
    fee_category_id integer,
    frequency character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    class_id integer,
    is_active boolean DEFAULT true NOT NULL,
    description text,
    created_by integer,
    late_fee_type character varying(20) DEFAULT 'none'::character varying NOT NULL,
    late_fee_amount numeric(10,2) DEFAULT 0 NOT NULL,
    due_day smallint,
    CONSTRAINT fee_structures_late_fee_type_check CHECK (((late_fee_type)::text = ANY ((ARRAY['none'::character varying, 'fixed'::character varying, 'percentage'::character varying])::text[])))
);


--
-- Name: fee_structures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_structures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_structures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_structures_id_seq OWNED BY public.fee_structures.id;


--
-- Name: fee_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fee_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_types_id_seq OWNED BY public.fee_types.id;


--
-- Name: goods_receipt_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_notes (
    id integer NOT NULL,
    grn_number character varying NOT NULL,
    po_id integer NOT NULL,
    received_by integer NOT NULL,
    received_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    stock_updated boolean DEFAULT false,
    stock_updated_at timestamp with time zone,
    stock_updated_by integer,
    CONSTRAINT goods_receipt_notes_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'confirmed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: goods_receipt_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipt_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipt_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipt_notes_id_seq OWNED BY public.goods_receipt_notes.id;


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    id integer NOT NULL,
    student_id integer,
    exam_id integer,
    subject_id integer,
    marks numeric(5,2),
    grade character varying(5),
    remarks text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: grades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grades_id_seq OWNED BY public.grades.id;


--
-- Name: grading_scales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grading_scales (
    id integer NOT NULL,
    grade character varying(5) NOT NULL,
    min_pct numeric(5,2) NOT NULL,
    max_pct numeric(5,2) NOT NULL,
    gpa numeric(3,2) DEFAULT 0,
    description character varying(50),
    is_active boolean DEFAULT true,
    order_no integer DEFAULT 1,
    mode character varying(10) DEFAULT 'both'::character varying
);


--
-- Name: grading_scales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grading_scales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grading_scales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grading_scales_id_seq OWNED BY public.grading_scales.id;


--
-- Name: grn_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grn_items (
    id integer NOT NULL,
    grn_id integer NOT NULL,
    po_item_id integer NOT NULL,
    quantity_received numeric DEFAULT 0 NOT NULL,
    condition character varying DEFAULT 'good'::character varying NOT NULL,
    notes text,
    CONSTRAINT grn_items_condition_check CHECK (((condition)::text = ANY ((ARRAY['good'::character varying, 'damaged'::character varying, 'partial'::character varying])::text[])))
);


--
-- Name: grn_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grn_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grn_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grn_items_id_seq OWNED BY public.grn_items.id;


--
-- Name: grn_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grn_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hearing_appearance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hearing_appearance (
    id integer NOT NULL,
    case_id integer,
    user_id integer,
    person_type character varying(20) NOT NULL,
    person_name text,
    notified_at timestamp with time zone
);


--
-- Name: hearing_appearance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hearing_appearance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hearing_appearance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hearing_appearance_id_seq OWNED BY public.hearing_appearance.id;


--
-- Name: hearing_committee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hearing_committee (
    id integer NOT NULL,
    case_id integer,
    teacher_id integer,
    is_head boolean DEFAULT false,
    assigned_at timestamp with time zone DEFAULT now()
);


--
-- Name: hearing_committee_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hearing_committee_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hearing_committee_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hearing_committee_id_seq OWNED BY public.hearing_committee.id;


--
-- Name: hearing_member_remarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hearing_member_remarks (
    id integer NOT NULL,
    case_id integer,
    teacher_id integer,
    remarks text NOT NULL,
    recommendation character varying(20),
    submitted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hmr_rec_check CHECK (((recommendation)::text = ANY ((ARRAY['warning'::character varying, 'suspension'::character varying, 'expulsion'::character varying, 'dismissed'::character varying])::text[])))
);


--
-- Name: hearing_member_remarks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hearing_member_remarks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hearing_member_remarks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hearing_member_remarks_id_seq OWNED BY public.hearing_member_remarks.id;


--
-- Name: hr_policy_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_policy_settings (
    id integer DEFAULT 1 NOT NULL,
    probation_duration_days integer DEFAULT 90,
    notice_period_duration_days integer DEFAULT 30,
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: invoice_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_approval_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_approval_rules (
    id integer NOT NULL,
    leave_type_id integer,
    day_from integer DEFAULT 1 NOT NULL,
    day_to integer,
    recommender_role character varying(50),
    approver_role character varying(50) NOT NULL,
    sort_order integer DEFAULT 0,
    certificate_required boolean DEFAULT false,
    certificate_label character varying(300)
);


--
-- Name: leave_approval_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_approval_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_approval_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_approval_rules_id_seq OWNED BY public.leave_approval_rules.id;


--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_balances (
    id integer NOT NULL,
    student_id integer,
    leave_type_id integer,
    academic_year_id integer,
    days_used integer DEFAULT 0
);


--
-- Name: leave_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_balances_id_seq OWNED BY public.leave_balances.id;


--
-- Name: leave_certificate_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_certificate_types (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    is_active boolean DEFAULT true
);


--
-- Name: leave_certificate_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_certificate_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_certificate_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_certificate_types_id_seq OWNED BY public.leave_certificate_types.id;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    student_id integer,
    leave_type_id integer,
    from_date date NOT NULL,
    to_date date NOT NULL,
    total_days integer NOT NULL,
    reason text NOT NULL,
    certificate_url character varying(500),
    status character varying(20) DEFAULT 'pending'::character varying,
    applied_by integer,
    applied_at timestamp with time zone DEFAULT now(),
    recommended_by integer,
    recommended_at timestamp with time zone,
    recommender_note text,
    approved_by integer,
    approved_at timestamp with time zone,
    approver_note text,
    rejection_reason text
);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: leave_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_types_id_seq OWNED BY public.leave_types.id;


--
-- Name: leave_validation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_validation_rules (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    leave_type_id integer,
    rule_type character varying(50) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: leave_validation_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_validation_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_validation_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_validation_rules_id_seq OWNED BY public.leave_validation_rules.id;


--
-- Name: library_authors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_authors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_authors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_authors_id_seq OWNED BY public.library_authors.id;


--
-- Name: library_book_copies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_book_copies (
    id integer NOT NULL,
    book_id integer NOT NULL,
    accession_no character varying(50),
    barcode character varying(50),
    purchase_price numeric(10,2),
    purchase_date date,
    vendor character varying(150),
    condition character varying(20) DEFAULT 'good'::character varying NOT NULL,
    status character varying(20) DEFAULT 'available'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT library_book_copies_condition_check CHECK (((condition)::text = ANY ((ARRAY['excellent'::character varying, 'good'::character varying, 'damaged'::character varying, 'lost'::character varying])::text[]))),
    CONSTRAINT library_book_copies_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'issued'::character varying, 'reserved'::character varying, 'lost'::character varying, 'damaged'::character varying, 'removed'::character varying, 'missing'::character varying])::text[])))
);


--
-- Name: library_book_copies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_book_copies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_book_copies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_book_copies_id_seq OWNED BY public.library_book_copies.id;


--
-- Name: library_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_books (
    id integer NOT NULL,
    isbn character varying(30),
    title character varying(255) NOT NULL,
    subtitle character varying(255),
    author_id integer,
    publisher_id integer,
    category_id integer,
    edition character varying(50),
    publication_year integer,
    language character varying(50) DEFAULT 'English'::character varying,
    shelf character varying(50),
    rack character varying(50),
    description text,
    cover_image text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: library_books_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_books_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_books_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_books_id_seq OWNED BY public.library_books.id;


--
-- Name: library_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_categories_id_seq OWNED BY public.library_categories.id;


--
-- Name: library_fine_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_fine_payments (
    id integer NOT NULL,
    transaction_id integer NOT NULL,
    amount_paid numeric(10,2) NOT NULL,
    method character varying(30) DEFAULT 'cash'::character varying,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    received_by integer,
    is_waived boolean DEFAULT false NOT NULL,
    waived_by integer,
    waived_at timestamp with time zone
);


--
-- Name: library_fine_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_fine_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_fine_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_fine_payments_id_seq OWNED BY public.library_fine_payments.id;


--
-- Name: library_inventory_audit_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_inventory_audit_items (
    id integer NOT NULL,
    audit_id integer NOT NULL,
    copy_id integer NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_by integer
);


--
-- Name: library_inventory_audit_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_inventory_audit_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_inventory_audit_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_inventory_audit_items_id_seq OWNED BY public.library_inventory_audit_items.id;


--
-- Name: library_inventory_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_inventory_audits (
    id integer NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    started_by integer,
    status character varying(20) DEFAULT 'in_progress'::character varying NOT NULL,
    notes text,
    CONSTRAINT library_inventory_audits_status_check CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: library_inventory_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_inventory_audits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_inventory_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_inventory_audits_id_seq OWNED BY public.library_inventory_audits.id;


--
-- Name: library_issue_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_issue_transactions (
    id integer NOT NULL,
    copy_id integer NOT NULL,
    member_id integer NOT NULL,
    issued_by integer,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date date NOT NULL,
    returned_at timestamp with time zone,
    return_condition character varying(20),
    received_by integer,
    renewal_count integer DEFAULT 0 NOT NULL,
    fine_amount numeric(10,2) DEFAULT 0 NOT NULL,
    fine_status character varying(20) DEFAULT 'none'::character varying NOT NULL,
    notes text,
    CONSTRAINT library_issue_transactions_fine_status_check CHECK (((fine_status)::text = ANY ((ARRAY['none'::character varying, 'pending'::character varying, 'paid'::character varying, 'waived'::character varying])::text[]))),
    CONSTRAINT library_issue_transactions_return_condition_check CHECK (((return_condition)::text = ANY ((ARRAY['excellent'::character varying, 'good'::character varying, 'damaged'::character varying, 'lost'::character varying])::text[])))
);


--
-- Name: library_issue_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_issue_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_issue_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_issue_transactions_id_seq OWNED BY public.library_issue_transactions.id;


--
-- Name: library_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_issues (
    id integer NOT NULL,
    book_id integer,
    student_id integer,
    issued_by integer,
    issued_at date DEFAULT CURRENT_DATE,
    due_date date,
    returned_at date,
    status character varying(20) DEFAULT 'issued'::character varying,
    fine_amount numeric(10,2) DEFAULT 0,
    note text,
    CONSTRAINT li_status_check CHECK (((status)::text = ANY ((ARRAY['issued'::character varying, 'returned'::character varying, 'overdue'::character varying, 'lost'::character varying])::text[])))
);


--
-- Name: library_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_issues_id_seq OWNED BY public.library_issues.id;


--
-- Name: library_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_members (
    id integer NOT NULL,
    user_id integer NOT NULL,
    member_type character varying(20) NOT NULL,
    library_card_no character varying(30),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    joined_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT library_members_member_type_check CHECK (((member_type)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'superadmin'::character varying, 'admin'::character varying, 'principal'::character varying, 'librarian'::character varying, 'hr'::character varying, 'finance_officer'::character varying, 'procurement'::character varying, 'academic_coordinator'::character varying])::text[]))),
    CONSTRAINT library_members_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'inactive'::character varying])::text[])))
);


--
-- Name: library_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_members_id_seq OWNED BY public.library_members.id;


--
-- Name: library_membership_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_membership_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_membership_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_membership_rules_id_seq OWNED BY public.library_membership_rules.id;


--
-- Name: library_publishers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_publishers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_publishers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_publishers_id_seq OWNED BY public.library_publishers.id;


--
-- Name: library_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_reservations (
    id integer NOT NULL,
    book_id integer NOT NULL,
    member_id integer NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'waiting'::character varying NOT NULL,
    notified_at timestamp with time zone,
    CONSTRAINT library_reservations_status_check CHECK (((status)::text = ANY ((ARRAY['waiting'::character varying, 'available'::character varying, 'fulfilled'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: library_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_reservations_id_seq OWNED BY public.library_reservations.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    sender_id integer,
    receiver_id integer,
    subject character varying(200),
    body text,
    is_read boolean DEFAULT false,
    sent_at timestamp without time zone DEFAULT now()
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    body text,
    is_read boolean DEFAULT false NOT NULL,
    reference_id integer,
    reference_type character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message text,
    link character varying(200)
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: payroll_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_adjustments (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    component_id integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    note text,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT payroll_adjustments_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: payroll_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_adjustments_id_seq OWNED BY public.payroll_adjustments.id;


--
-- Name: payroll_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_components (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    component_type character varying(20) NOT NULL,
    calculation_type character varying(20) DEFAULT 'fixed'::character varying NOT NULL,
    is_permanent boolean DEFAULT true NOT NULL,
    is_taxable boolean DEFAULT true NOT NULL,
    is_statutory boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    is_basic boolean DEFAULT false NOT NULL,
    is_income_tax boolean DEFAULT false NOT NULL,
    CONSTRAINT payroll_components_calculation_type_check CHECK (((calculation_type)::text = ANY ((ARRAY['fixed'::character varying, 'percent_of_basic'::character varying, 'percent_of_gross'::character varying, 'per_day'::character varying, 'tax_slab'::character varying])::text[]))),
    CONSTRAINT payroll_components_component_type_check CHECK (((component_type)::text = ANY ((ARRAY['earning'::character varying, 'deduction'::character varying])::text[])))
);


--
-- Name: payroll_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_components_id_seq OWNED BY public.payroll_components.id;


--
-- Name: payroll_grade_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_grade_components (
    id integer NOT NULL,
    grade_id integer NOT NULL,
    component_id integer NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: payroll_grade_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_grade_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_grade_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_grade_components_id_seq OWNED BY public.payroll_grade_components.id;


--
-- Name: payroll_grade_department_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_grade_department_components (
    id integer NOT NULL,
    grade_id integer NOT NULL,
    department_id integer NOT NULL,
    component_id integer NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: payroll_grade_department_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_grade_department_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_grade_department_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_grade_department_components_id_seq OWNED BY public.payroll_grade_department_components.id;


--
-- Name: payroll_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_grades (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: payroll_grades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_grades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_grades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_grades_id_seq OWNED BY public.payroll_grades.id;


--
-- Name: payroll_payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_payslips (
    id integer NOT NULL,
    payroll_run_id integer NOT NULL,
    staff_id integer NOT NULL,
    salary_type character varying(20) NOT NULL,
    gross_earnings numeric(14,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    net_pay numeric(14,2) DEFAULT 0 NOT NULL,
    earnings_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    deductions_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    days_present numeric(5,1) DEFAULT 0,
    days_absent numeric(5,1) DEFAULT 0,
    days_half_day numeric(5,1) DEFAULT 0,
    days_on_leave numeric(5,1) DEFAULT 0,
    hours_worked numeric(10,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: payroll_payslips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_payslips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_payslips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_payslips_id_seq OWNED BY public.payroll_payslips.id;


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_runs (
    id integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    submitted_at timestamp without time zone,
    finalized_at timestamp without time zone,
    finalized_by integer,
    from_date date,
    to_date date,
    CONSTRAINT payroll_runs_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT payroll_runs_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'hr_submitted'::character varying, 'pending_approval'::character varying, 'approved'::character varying, 'released'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: payroll_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_runs_id_seq OWNED BY public.payroll_runs.id;


--
-- Name: payroll_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_settings (
    id integer DEFAULT 1 NOT NULL,
    basic_salary_mode character varying(20) DEFAULT 'individual'::character varying NOT NULL,
    days_in_month_mode character varying(20) DEFAULT 'fixed_30'::character varying NOT NULL,
    fixed_days_value integer DEFAULT 30 NOT NULL,
    CONSTRAINT payroll_settings_basic_salary_mode_check CHECK (((basic_salary_mode)::text = ANY ((ARRAY['grade_fixed'::character varying, 'individual'::character varying])::text[]))),
    CONSTRAINT payroll_settings_days_in_month_mode_check CHECK (((days_in_month_mode)::text = ANY ((ARRAY['fixed_30'::character varying, 'actual'::character varying])::text[]))),
    CONSTRAINT single_row_payroll_settings CHECK ((id = 1))
);


--
-- Name: payroll_tax_slab_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_tax_slab_sets (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: payroll_tax_slab_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_tax_slab_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_tax_slab_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_tax_slab_sets_id_seq OWNED BY public.payroll_tax_slab_sets.id;


--
-- Name: payroll_tax_slabs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_tax_slabs (
    id integer NOT NULL,
    slab_set_id integer NOT NULL,
    min_income numeric(14,2) NOT NULL,
    max_income numeric(14,2),
    fixed_amount numeric(14,2) DEFAULT 0 NOT NULL,
    rate_percent numeric(5,2) DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: payroll_tax_slabs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_tax_slabs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_tax_slabs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_tax_slabs_id_seq OWNED BY public.payroll_tax_slabs.id;


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: po_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_items (
    id integer NOT NULL,
    po_id integer NOT NULL,
    pr_item_id integer,
    item_description character varying(200) NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit character varying(30) NOT NULL,
    unit_price numeric(14,2) DEFAULT 0 NOT NULL,
    tax_percent numeric(5,2) DEFAULT 0 NOT NULL,
    received_quantity numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: po_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.po_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: po_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.po_items_id_seq OWNED BY public.po_items.id;


--
-- Name: pr_approval_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_approval_instances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_approval_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_approval_instances_id_seq OWNED BY public.pr_approval_instances.id;


--
-- Name: pr_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_items_id_seq OWNED BY public.pr_items.id;


--
-- Name: procurement_approval_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_approval_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_approval_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_approval_rules_id_seq OWNED BY public.procurement_approval_rules.id;


--
-- Name: procurement_approval_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_approval_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_approval_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_approval_steps_id_seq OWNED BY public.procurement_approval_steps.id;


--
-- Name: procurement_item_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_item_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_item_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_item_categories_id_seq OWNED BY public.procurement_item_categories.id;


--
-- Name: procurement_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_items_id_seq OWNED BY public.procurement_items.id;


--
-- Name: procurement_vendor_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_vendor_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_vendor_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_vendor_categories_id_seq OWNED BY public.procurement_vendor_categories.id;


--
-- Name: procurement_vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_vendors_id_seq OWNED BY public.procurement_vendors.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    po_number character varying(30) NOT NULL,
    pr_id integer NOT NULL,
    vendor_id integer NOT NULL,
    created_by integer NOT NULL,
    delivery_address text,
    expected_delivery_date date,
    terms text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    issued_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_orders_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'issued'::character varying, 'partially_delivered'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: purchase_requisitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_requisitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_requisitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_requisitions_id_seq OWNED BY public.purchase_requisitions.id;


--
-- Name: quiz_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_questions (
    id integer NOT NULL,
    quiz_id integer NOT NULL,
    question text NOT NULL,
    option_a character varying(500) NOT NULL,
    option_b character varying(500) NOT NULL,
    option_c character varying(500),
    option_d character varying(500),
    correct character varying(10) NOT NULL,
    multi_select boolean DEFAULT false,
    marks integer DEFAULT 1 NOT NULL,
    order_no integer DEFAULT 1
);


--
-- Name: quiz_questions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quiz_questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quiz_questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quiz_questions_id_seq OWNED BY public.quiz_questions.id;


--
-- Name: quiz_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quiz_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quiz_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quiz_submissions_id_seq OWNED BY public.quiz_submissions.id;


--
-- Name: quizzes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quizzes (
    id integer NOT NULL,
    class_id integer NOT NULL,
    subject_id integer NOT NULL,
    teacher_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    due_date timestamp without time zone NOT NULL,
    total_marks integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: quizzes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quizzes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quizzes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quizzes_id_seq OWNED BY public.quizzes.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: report_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_cards (
    id integer NOT NULL,
    student_id integer,
    academic_year_id integer,
    final_marks numeric(8,2) DEFAULT 0,
    final_pct numeric(5,2) DEFAULT 0,
    final_grade character varying(5),
    final_gpa numeric(3,2),
    final_position integer,
    is_promoted boolean DEFAULT false,
    is_compartment boolean DEFAULT false,
    remarks text,
    generated_at timestamp with time zone DEFAULT now()
);


--
-- Name: report_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.report_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: report_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.report_cards_id_seq OWNED BY public.report_cards.id;


--
-- Name: result_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.result_components (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(30) NOT NULL,
    collection_method character varying(20) DEFAULT 'per_subject'::character varying,
    description text,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rc_method_check CHECK (((collection_method)::text = ANY ((ARRAY['per_subject'::character varying, 'overall'::character varying, 'auto'::character varying])::text[])))
);


--
-- Name: result_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.result_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: result_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.result_components_id_seq OWNED BY public.result_components.id;


--
-- Name: result_formula; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.result_formula (
    id integer NOT NULL,
    academic_year_id integer,
    formula jsonb DEFAULT '[]'::jsonb,
    total_weight numeric(5,2) DEFAULT 0,
    is_configured boolean DEFAULT false,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now(),
    formula_mode character varying(20) DEFAULT 'percentage'::character varying
);


--
-- Name: result_formula_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.result_formula_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: result_formula_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.result_formula_id_seq OWNED BY public.result_formula.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL,
    granted_by integer,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: sibling_discount_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sibling_discount_tiers (
    id integer NOT NULL,
    child_no smallint NOT NULL,
    percentage numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: sibling_discount_tiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sibling_discount_tiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sibling_discount_tiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sibling_discount_tiers_id_seq OWNED BY public.sibling_discount_tiers.id;


--
-- Name: sp_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sp_registry (
    id integer NOT NULL,
    proc_name character varying(100) NOT NULL,
    description text,
    module character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: sp_registry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sp_registry_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sp_registry_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sp_registry_id_seq OWNED BY public.sp_registry.id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    user_id integer,
    employee_code character varying(50),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    gender character varying(10),
    date_of_birth date,
    cnic character varying(20),
    phone character varying(20),
    address text,
    designation_id integer,
    department_id integer,
    employment_type character varying(30) DEFAULT 'full_time'::character varying,
    joining_date date,
    contract_end_date date,
    salary numeric(12,2),
    status character varying(20) DEFAULT 'active'::character varying,
    profile_photo character varying(255),
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resignation_accepted_date date,
    is_probationary boolean DEFAULT true,
    CONSTRAINT staff_employment_check CHECK (((employment_type)::text = ANY ((ARRAY['full_time'::character varying, 'part_time'::character varying, 'contract'::character varying, 'intern'::character varying])::text[]))),
    CONSTRAINT staff_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'terminated'::character varying, 'on_leave'::character varying, 'resigned'::character varying])::text[])))
);


--
-- Name: staff_attendance_correction_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_attendance_correction_requests (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    request_date date NOT NULL,
    session_id integer,
    requested_clock_in time without time zone,
    requested_clock_out time without time zone,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    review_note text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT staff_attendance_correction_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: staff_attendance_correction_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_attendance_correction_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_attendance_correction_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_attendance_correction_requests_id_seq OWNED BY public.staff_attendance_correction_requests.id;


--
-- Name: staff_attendance_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_attendance_sessions (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    clock_in_at timestamp without time zone NOT NULL,
    clock_out_at timestamp without time zone,
    source character varying(20) DEFAULT 'web'::character varying NOT NULL,
    auto_closed boolean DEFAULT false NOT NULL,
    notes text,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_late boolean DEFAULT false NOT NULL,
    CONSTRAINT staff_attendance_sessions_source_check CHECK (((source)::text = ANY ((ARRAY['rfid'::character varying, 'web'::character varying, 'manual'::character varying, 'correction'::character varying])::text[])))
);


--
-- Name: staff_attendance_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_attendance_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_attendance_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_attendance_sessions_id_seq OWNED BY public.staff_attendance_sessions.id;


--
-- Name: staff_daily_attendance_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_daily_attendance_status (
    staff_id integer NOT NULL,
    status_date date NOT NULL,
    status character varying(20) NOT NULL,
    is_late boolean DEFAULT false NOT NULL,
    session_count integer DEFAULT 0 NOT NULL,
    total_hours numeric(5,2) DEFAULT 0 NOT NULL,
    finalized_at timestamp without time zone DEFAULT now()
);


--
-- Name: staff_designation_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_designation_grades (
    id integer NOT NULL,
    designation_id integer NOT NULL,
    grade_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: staff_designation_grades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_designation_grades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_designation_grades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_designation_grades_id_seq OWNED BY public.staff_designation_grades.id;


--
-- Name: staff_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_documents (
    id integer NOT NULL,
    staff_id integer,
    doc_type character varying(50) NOT NULL,
    doc_name character varying(200) NOT NULL,
    file_path character varying(500),
    uploaded_by integer,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: staff_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_documents_id_seq OWNED BY public.staff_documents.id;


--
-- Name: staff_education; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_education (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    degree character varying(200) NOT NULL,
    institution character varying(300) NOT NULL,
    field_of_study character varying(200),
    start_year integer,
    end_year integer,
    grade character varying(50),
    is_current boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    grade_type character varying(10) DEFAULT 'marks'::character varying,
    total_marks numeric(8,2),
    awarded_marks numeric(8,2),
    total_cgpa numeric(4,2),
    awarded_cgpa numeric(4,2)
);


--
-- Name: staff_education_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_education_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_education_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_education_id_seq OWNED BY public.staff_education.id;


--
-- Name: staff_emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_emergency_contacts (
    id integer NOT NULL,
    staff_id integer,
    name character varying(100) NOT NULL,
    relationship character varying(50),
    phone character varying(20) NOT NULL,
    address text
);


--
-- Name: staff_emergency_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_emergency_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_emergency_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_emergency_contacts_id_seq OWNED BY public.staff_emergency_contacts.id;


--
-- Name: staff_employment_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_employment_history (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    organization character varying(300) NOT NULL,
    role character varying(200) NOT NULL,
    from_date date,
    to_date date,
    reason_leaving character varying(300),
    reference_name character varying(200),
    reference_phone character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: staff_employment_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_employment_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_employment_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_employment_history_id_seq OWNED BY public.staff_employment_history.id;


--
-- Name: staff_experience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_experience (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    company character varying(300) NOT NULL,
    designation character varying(200) NOT NULL,
    from_date date,
    to_date date,
    is_current boolean DEFAULT false,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: staff_experience_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_experience_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_experience_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_experience_id_seq OWNED BY public.staff_experience.id;


--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: staff_leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave_balances (
    id integer NOT NULL,
    user_id integer NOT NULL,
    leave_type_id integer NOT NULL,
    year integer DEFAULT (EXTRACT(year FROM now()))::integer NOT NULL,
    total_days numeric(5,1) DEFAULT 0 NOT NULL,
    used_days numeric(5,1) DEFAULT 0 NOT NULL,
    carried_days numeric(5,1) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: staff_leave_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_leave_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_leave_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_leave_balances_id_seq OWNED BY public.staff_leave_balances.id;


--
-- Name: staff_leave_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave_policies (
    id integer NOT NULL,
    leave_type_id integer NOT NULL,
    role_id integer,
    department_id integer,
    days_per_year numeric(5,1) DEFAULT 0 NOT NULL,
    carry_forward numeric(5,1) DEFAULT 0 NOT NULL,
    is_paid boolean DEFAULT true NOT NULL,
    applies_to character varying(20) DEFAULT 'role'::character varying,
    effective_from date DEFAULT CURRENT_DATE,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    gender character varying(10) DEFAULT 'all'::character varying,
    CONSTRAINT slp_applies CHECK (((applies_to)::text = ANY ((ARRAY['role'::character varying, 'department'::character varying, 'all'::character varying])::text[]))),
    CONSTRAINT slp_gender_check CHECK (((gender)::text = ANY ((ARRAY['all'::character varying, 'male'::character varying, 'female'::character varying])::text[])))
);


--
-- Name: staff_leave_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_leave_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_leave_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_leave_policies_id_seq OWNED BY public.staff_leave_policies.id;


--
-- Name: staff_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    leave_type_id integer NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    total_days numeric(5,1) NOT NULL,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    applied_at timestamp with time zone DEFAULT now(),
    reviewed_by integer,
    reviewed_at timestamp with time zone,
    review_note text,
    duration_type character varying(10) DEFAULT 'full'::character varying NOT NULL,
    half_day_from_time time without time zone,
    half_day_to_time time without time zone,
    CONSTRAINT slr_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT staff_leave_requests_duration_type_check CHECK (((duration_type)::text = ANY ((ARRAY['full'::character varying, 'half'::character varying])::text[])))
);


--
-- Name: staff_leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_leave_requests_id_seq OWNED BY public.staff_leave_requests.id;


--
-- Name: staff_leave_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave_rules (
    id integer NOT NULL,
    leave_type_id integer NOT NULL,
    day_from integer DEFAULT 1 NOT NULL,
    day_to integer,
    recommender_role character varying(50),
    approver_role character varying(50) NOT NULL,
    certificate_required boolean DEFAULT false,
    certificate_after_days integer,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: staff_leave_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_leave_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_leave_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_leave_rules_id_seq OWNED BY public.staff_leave_rules.id;


--
-- Name: staff_payroll_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_payroll_profile (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    salary_type character varying(20) DEFAULT 'structured'::character varying NOT NULL,
    lump_sum_amount numeric(12,2),
    basic_salary numeric(12,2),
    grade_id integer,
    hourly_rate numeric(12,2),
    daily_wage_amount numeric(12,2),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT staff_payroll_profile_salary_type_check CHECK (((salary_type)::text = ANY ((ARRAY['lump_sum'::character varying, 'structured'::character varying, 'hourly'::character varying, 'daily_wage'::character varying])::text[])))
);


--
-- Name: staff_payroll_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_payroll_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_payroll_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_payroll_profile_id_seq OWNED BY public.staff_payroll_profile.id;


--
-- Name: staff_rfid_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_rfid_cards (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    card_uid character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_at timestamp without time zone DEFAULT now()
);


--
-- Name: staff_rfid_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_rfid_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_rfid_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_rfid_cards_id_seq OWNED BY public.staff_rfid_cards.id;


--
-- Name: student_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_discounts (
    id integer NOT NULL,
    student_id integer NOT NULL,
    discount_type_id integer NOT NULL,
    assigned_by integer,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from date,
    valid_until date,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    override_value numeric
);


--
-- Name: student_discounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_discounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_discounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_discounts_id_seq OWNED BY public.student_discounts.id;


--
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.students_id_seq OWNED BY public.students.id;


--
-- Name: study_materials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.study_materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: study_materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.study_materials_id_seq OWNED BY public.study_materials.id;


--
-- Name: subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subjects_id_seq OWNED BY public.subjects.id;


--
-- Name: syllabus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syllabus (
    id integer NOT NULL,
    class_id integer,
    subject_id integer,
    academic_year_id integer,
    title character varying(200) NOT NULL,
    description text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tracking_mode character varying(20) DEFAULT 'topic'::character varying
);


--
-- Name: syllabus_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syllabus_attachments (
    id integer NOT NULL,
    topic_id integer,
    filename character varying(300) NOT NULL,
    url character varying(500) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: syllabus_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.syllabus_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: syllabus_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.syllabus_attachments_id_seq OWNED BY public.syllabus_attachments.id;


--
-- Name: syllabus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.syllabus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: syllabus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.syllabus_id_seq OWNED BY public.syllabus.id;


--
-- Name: syllabus_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syllabus_progress (
    id integer NOT NULL,
    topic_id integer,
    covered_by integer,
    covered_at date DEFAULT CURRENT_DATE,
    note text
);


--
-- Name: syllabus_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.syllabus_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: syllabus_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.syllabus_progress_id_seq OWNED BY public.syllabus_progress.id;


--
-- Name: syllabus_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syllabus_topics (
    id integer NOT NULL,
    syllabus_id integer,
    title character varying(300) NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    planned_week integer,
    planned_month integer,
    planned_date date,
    month_title character varying(200),
    parent_id integer,
    month_group_title character varying(200)
);


--
-- Name: syllabus_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.syllabus_topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: syllabus_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.syllabus_topics_id_seq OWNED BY public.syllabus_topics.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    category character varying(50) DEFAULT 'general'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: teacher_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_subjects (
    teacher_id integer NOT NULL,
    subject_id integer NOT NULL
);


--
-- Name: teachers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teachers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teachers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teachers_id_seq OWNED BY public.teachers.id;


--
-- Name: timetable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable (
    id integer NOT NULL,
    class_id integer,
    subject_id integer,
    teacher_id integer,
    day_of_week smallint,
    start_time time without time zone,
    end_time time without time zone,
    room_number character varying(20)
);


--
-- Name: timetable_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timetable_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timetable_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timetable_id_seq OWNED BY public.timetable.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL
);


--
-- Name: user_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_signatures (
    id integer NOT NULL,
    user_id integer NOT NULL,
    signature text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_signatures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_signatures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_signatures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_signatures_id_seq OWNED BY public.user_signatures.id;


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: v_staff_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_staff_directory AS
 SELECT s.id,
    s.first_name,
    s.last_name,
    s.employee_code,
    s.status,
    s.department_id,
    d.name AS department_name,
    s.designation_id,
    des.name AS designation_name
   FROM ((public.staff s
     LEFT JOIN public.departments d ON ((d.id = s.department_id)))
     LEFT JOIN public.designations des ON ((des.id = s.designation_id)));


--
-- Name: vendor_invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_invoice_items (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    po_item_id integer,
    description character varying NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    tax_percent numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL
);


--
-- Name: vendor_invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_invoice_items_id_seq OWNED BY public.vendor_invoice_items.id;


--
-- Name: vendor_invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_invoice_payments (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    amount numeric NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_method character varying DEFAULT 'bank_transfer'::character varying NOT NULL,
    reference character varying,
    notes text,
    paid_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vendor_invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_invoice_payments_id_seq OWNED BY public.vendor_invoice_payments.id;


--
-- Name: vendor_invoice_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_invoice_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_invoices (
    id integer NOT NULL,
    vendor_invoice_no character varying NOT NULL,
    po_id integer NOT NULL,
    grn_id integer,
    vendor_id integer NOT NULL,
    invoice_date date NOT NULL,
    received_date date DEFAULT CURRENT_DATE NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    tax_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    paid_amount numeric DEFAULT 0 NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    dispute_reason text,
    created_by integer NOT NULL,
    verified_by integer,
    verified_at timestamp with time zone,
    approved_by integer,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT vendor_invoices_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'approved'::character varying, 'paid'::character varying, 'disputed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: vendor_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_invoices_id_seq OWNED BY public.vendor_invoices.id;


--
-- Name: vw_class_attendance_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_class_attendance_summary AS
 SELECT a.class_id,
    c.name AS class_name,
    a.date,
    count(*) FILTER (WHERE ((a.status)::text = 'present'::text)) AS present_count,
    count(*) FILTER (WHERE ((a.status)::text = 'absent'::text)) AS absent_count,
    count(*) AS total
   FROM (public.attendance a
     JOIN public.classes c ON ((c.id = a.class_id)))
  GROUP BY a.class_id, c.name, a.date;


--
-- Name: vw_departments; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_departments AS
 SELECT d.id,
    d.name,
    d.head_user_id,
    (((u.first_name)::text || ' '::text) || (u.last_name)::text) AS head_name,
    d.is_active,
    d.created_at
   FROM (public.departments d
     LEFT JOIN public.users u ON ((u.id = d.head_user_id)))
  ORDER BY d.name;


--
-- Name: vw_fee_collection_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_fee_collection_status AS
 SELECT fi.id,
    s.first_name,
    s.last_name,
    fs.name AS fee_name,
    fi.amount,
    fi.status,
    fi.due_date
   FROM ((public.fee_invoices fi
     JOIN public.students s ON ((s.id = fi.student_id)))
     JOIN public.fee_structures fs ON ((fs.id = fi.fee_structure_id)));


--
-- Name: vw_inventory_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_inventory_summary AS
 SELECT ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'available'::text)) AS available_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'issued'::text)) AS issued_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'reserved'::text)) AS reserved_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'damaged'::text)) AS damaged_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'lost'::text)) AS lost_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'missing'::text)) AS missing_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'removed'::text)) AS removed_count,
    ( SELECT count(*) AS count
           FROM public.library_book_copies) AS total_count;


--
-- Name: vw_library_books; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_library_books AS
SELECT
    NULL::integer AS id,
    NULL::character varying(30) AS isbn,
    NULL::character varying(255) AS title,
    NULL::character varying(255) AS subtitle,
    NULL::character varying(50) AS edition,
    NULL::integer AS publication_year,
    NULL::character varying(50) AS language,
    NULL::character varying(50) AS shelf,
    NULL::character varying(50) AS rack,
    NULL::text AS description,
    NULL::text AS cover_image,
    NULL::boolean AS is_active,
    NULL::integer AS author_id,
    NULL::character varying(150) AS author_name,
    NULL::integer AS publisher_id,
    NULL::character varying(150) AS publisher_name,
    NULL::integer AS category_id,
    NULL::character varying(100) AS category_name,
    NULL::bigint AS total_copies,
    NULL::bigint AS available_copies,
    NULL::bigint AS issued_copies,
    NULL::bigint AS lost_copies,
    NULL::bigint AS damaged_copies;


--
-- Name: vw_library_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_library_dashboard AS
 SELECT ( SELECT count(*) AS count
           FROM public.library_books
          WHERE library_books.is_active) AS total_books,
    ( SELECT count(*) AS count
           FROM public.library_book_copies) AS total_copies,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'available'::text)) AS available_copies,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'issued'::text)) AS issued_copies,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'lost'::text)) AS lost_copies,
    ( SELECT count(*) AS count
           FROM public.library_book_copies
          WHERE ((library_book_copies.status)::text = 'damaged'::text)) AS damaged_copies,
    ( SELECT count(*) AS count
           FROM public.library_issue_transactions
          WHERE ((library_issue_transactions.returned_at IS NULL) AND (library_issue_transactions.due_date < CURRENT_DATE))) AS overdue_count,
    ( SELECT count(*) AS count
           FROM public.library_issue_transactions
          WHERE ((library_issue_transactions.returned_at IS NULL) AND ((library_issue_transactions.issued_at)::date = CURRENT_DATE))) AS issued_today,
    ( SELECT count(*) AS count
           FROM public.library_issue_transactions
          WHERE ((library_issue_transactions.returned_at)::date = CURRENT_DATE)) AS returned_today,
    ( SELECT COALESCE(sum(library_fine_payments.amount_paid), (0)::numeric) AS "coalesce"
           FROM public.library_fine_payments
          WHERE (((library_fine_payments.paid_at)::date = CURRENT_DATE) AND (NOT library_fine_payments.is_waived))) AS fine_collected_today,
    ( SELECT COALESCE(sum(library_issue_transactions.fine_amount), (0)::numeric) AS "coalesce"
           FROM public.library_issue_transactions
          WHERE ((library_issue_transactions.fine_status)::text = 'pending'::text)) AS fine_pending_total;


--
-- Name: vw_library_fine_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_library_fine_history AS
 SELECT fp.id AS payment_id,
    fp.transaction_id,
    fp.amount_paid,
    fp.method,
    fp.paid_at,
    fp.is_waived,
    fp.waived_at,
        CASE
            WHEN fp.is_waived THEN 'waived'::text
            ELSE 'paid'::text
        END AS resolution,
    lm.id AS member_id,
    lm.member_type,
    lm.library_card_no,
    u.first_name,
    u.last_name,
    u.email,
    b.id AS book_id,
    b.title AS book_title,
    bc.accession_no,
    it.issued_at,
    it.due_date,
    it.returned_at,
    it.return_condition,
    it.fine_amount AS original_fine_amount,
    ru.first_name AS received_by_first_name,
    ru.last_name AS received_by_last_name,
    wu.first_name AS waived_by_first_name,
    wu.last_name AS waived_by_last_name
   FROM (((((((public.library_fine_payments fp
     JOIN public.library_issue_transactions it ON ((it.id = fp.transaction_id)))
     JOIN public.library_book_copies bc ON ((bc.id = it.copy_id)))
     JOIN public.library_books b ON ((b.id = bc.book_id)))
     JOIN public.library_members lm ON ((lm.id = it.member_id)))
     JOIN public.users u ON ((u.id = lm.user_id)))
     LEFT JOIN public.users ru ON ((ru.id = fp.received_by)))
     LEFT JOIN public.users wu ON ((wu.id = fp.waived_by)))
  ORDER BY COALESCE(fp.paid_at, fp.waived_at) DESC;


--
-- Name: vw_library_issues; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_library_issues AS
 SELECT it.id AS transaction_id,
    it.copy_id,
    bc.accession_no,
    bc.barcode,
    b.id AS book_id,
    b.title AS book_title,
    it.member_id,
    lm.member_type,
    lm.library_card_no,
    u.first_name,
    u.last_name,
    it.issued_at,
    it.due_date,
    it.returned_at,
    it.return_condition,
    it.renewal_count,
    it.fine_amount,
    it.fine_status,
    it.notes,
    (CURRENT_DATE - it.due_date) AS days_overdue,
        CASE
            WHEN (it.returned_at IS NOT NULL) THEN 'returned'::text
            WHEN (CURRENT_DATE > it.due_date) THEN 'overdue'::text
            ELSE 'issued'::text
        END AS current_status
   FROM ((((public.library_issue_transactions it
     JOIN public.library_book_copies bc ON ((bc.id = it.copy_id)))
     JOIN public.library_books b ON ((b.id = bc.book_id)))
     JOIN public.library_members lm ON ((lm.id = it.member_id)))
     JOIN public.users u ON ((u.id = lm.user_id)));


--
-- Name: vw_library_members; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_library_members AS
SELECT
    NULL::integer AS member_id,
    NULL::integer AS user_id,
    NULL::character varying(20) AS member_type,
    NULL::character varying(30) AS library_card_no,
    NULL::character varying(20) AS status,
    NULL::date AS joined_date,
    NULL::character varying(100) AS first_name,
    NULL::character varying(100) AS last_name,
    NULL::character varying(150) AS email,
    NULL::character varying(20) AS phone,
    NULL::character varying AS display_role,
    NULL::integer AS max_books,
    NULL::integer AS borrow_days,
    NULL::integer AS renewal_limit,
    NULL::numeric(10,2) AS fine_per_day,
    NULL::bigint AS books_currently_issued,
    NULL::numeric AS pending_fine;


--
-- Name: vw_library_pending_fines; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_library_pending_fines AS
 SELECT it.id AS transaction_id,
    it.member_id,
    lm.member_type,
    lm.library_card_no,
    u.first_name,
    u.last_name,
    u.email,
    b.id AS book_id,
    b.title AS book_title,
    bc.accession_no,
    it.issued_at,
    it.due_date,
    it.returned_at,
    it.return_condition,
    it.fine_amount,
    it.fine_status,
        CASE
            WHEN (it.returned_at IS NULL) THEN (CURRENT_DATE - it.due_date)
            ELSE ((it.returned_at)::date - it.due_date)
        END AS days_overdue
   FROM ((((public.library_issue_transactions it
     JOIN public.library_book_copies bc ON ((bc.id = it.copy_id)))
     JOIN public.library_books b ON ((b.id = bc.book_id)))
     JOIN public.library_members lm ON ((lm.id = it.member_id)))
     JOIN public.users u ON ((u.id = lm.user_id)))
  WHERE ((it.fine_status)::text = 'pending'::text)
  ORDER BY it.fine_amount DESC;


--
-- Name: vw_pr_approval_instances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_pr_approval_instances AS
 SELECT pai.id,
    pai.pr_id,
    pai.step_order,
    pai.approver_role,
    pai.resolved_approver_id,
    pai.status,
    pai.acted_by,
    pai.acted_at,
    pai.notes,
    (((au.first_name)::text || ' '::text) || (au.last_name)::text) AS acted_by_name,
    (((hu.first_name)::text || ' '::text) || (hu.last_name)::text) AS resolved_approver_name
   FROM ((public.pr_approval_instances pai
     LEFT JOIN public.users au ON ((au.id = pai.acted_by)))
     LEFT JOIN public.users hu ON ((hu.id = pai.resolved_approver_id)))
  ORDER BY pai.pr_id, pai.step_order;


--
-- Name: vw_pr_items_detail; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_pr_items_detail AS
 SELECT pi.id,
    pi.pr_id,
    pi.item_id,
    pi.item_description,
    pi.quantity,
    pi.unit,
    pi.estimated_unit_price,
    pi.remarks,
    it.item_name AS catalog_item_name,
    it.item_code,
    it.category_id,
    ic.name AS category_name
   FROM ((public.pr_items pi
     LEFT JOIN public.procurement_items it ON ((it.id = pi.item_id)))
     LEFT JOIN public.procurement_item_categories ic ON ((ic.id = it.category_id)))
  ORDER BY pi.id;


--
-- Name: vw_procurement_approval_rules; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_procurement_approval_rules AS
 SELECT r.id,
    r.name,
    r.min_amount,
    r.max_amount,
    r.department_id,
    r.item_category_id,
    r.is_emergency,
    r.priority,
    r.is_active,
    r.created_at,
    d.name AS department_name,
    c.name AS item_category_name
   FROM ((public.procurement_approval_rules r
     LEFT JOIN public.departments d ON ((d.id = r.department_id)))
     LEFT JOIN public.procurement_item_categories c ON ((c.id = r.item_category_id)))
  ORDER BY r.priority DESC, r.id;


--
-- Name: vw_procurement_item_categories; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_procurement_item_categories AS
 SELECT c.id,
    c.name,
    c.parent_id,
    p.name AS parent_name,
    c.is_active
   FROM (public.procurement_item_categories c
     LEFT JOIN public.procurement_item_categories p ON ((p.id = c.parent_id)))
  ORDER BY c.name;


--
-- Name: vw_procurement_items; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_procurement_items AS
 SELECT i.id,
    i.item_code,
    i.item_name,
    i.unit,
    i.category_id,
    i.min_stock,
    i.max_stock,
    i.preferred_vendor_id,
    i.current_stock,
    i.is_active,
    i.created_at,
    c.name AS category_name,
    v.name AS preferred_vendor_name
   FROM ((public.procurement_items i
     LEFT JOIN public.procurement_item_categories c ON ((c.id = i.category_id)))
     LEFT JOIN public.procurement_vendors v ON ((v.id = i.preferred_vendor_id)))
  ORDER BY i.item_name;


--
-- Name: vw_procurement_vendors; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_procurement_vendors AS
 SELECT v.id,
    v.name,
    v.contact_person,
    v.phone,
    v.email,
    v.address,
    v.ntn,
    v.strn,
    v.bank_name,
    v.bank_account_no,
    v.bank_iban,
    v.category_id,
    v.rating,
    v.is_blacklisted,
    v.blacklist_reason,
    v.is_active,
    v.created_at,
    vc.name AS category_name
   FROM (public.procurement_vendors v
     LEFT JOIN public.procurement_vendor_categories vc ON ((vc.id = v.category_id)))
  ORDER BY v.name;


--
-- Name: vw_purchase_orders; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_purchase_orders AS
 SELECT po.id,
    po.po_number,
    po.pr_id,
    pr.pr_number,
    pr.requested_by,
    (((ru.first_name)::text || ' '::text) || (ru.last_name)::text) AS requested_by_name,
    po.vendor_id,
    v.name AS vendor_name,
    po.created_by,
    (((cu.first_name)::text || ' '::text) || (cu.last_name)::text) AS created_by_name,
    po.delivery_address,
    po.expected_delivery_date,
    po.terms,
    po.status,
    po.total_amount,
    po.issued_at,
    po.created_at,
    ( SELECT count(*) AS count
           FROM public.po_items
          WHERE (po_items.po_id = po.id)) AS item_count
   FROM ((((public.purchase_orders po
     JOIN public.purchase_requisitions pr ON ((pr.id = po.pr_id)))
     JOIN public.users ru ON ((ru.id = pr.requested_by)))
     JOIN public.procurement_vendors v ON ((v.id = po.vendor_id)))
     JOIN public.users cu ON ((cu.id = po.created_by)))
  ORDER BY po.created_at DESC;


--
-- Name: vw_student_attendance_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_student_attendance_summary AS
 SELECT s.id AS student_id,
    s.enrollment_no,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS student_name,
    c.name AS class_name,
    (date_trunc('month'::text, (a.date)::timestamp with time zone))::date AS month,
    count(*) AS total_days,
    count(*) FILTER (WHERE ((a.status)::text = 'present'::text)) AS present_days,
    count(*) FILTER (WHERE ((a.status)::text = 'absent'::text)) AS absent_days,
    round((((count(*) FILTER (WHERE ((a.status)::text = 'present'::text)))::numeric * 100.0) / (NULLIF(count(*), 0))::numeric), 2) AS attendance_pct
   FROM ((public.attendance a
     JOIN public.students s ON ((s.id = a.student_id)))
     JOIN public.classes c ON ((c.id = a.class_id)))
  GROUP BY s.id, s.enrollment_no, s.first_name, s.last_name, c.name, (date_trunc('month'::text, (a.date)::timestamp with time zone));


--
-- Name: vw_student_fee_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_student_fee_report AS
 SELECT s.id AS student_id,
    s.first_name,
    s.last_name,
    s.enrollment_no,
    s.class_id,
    s.parent_id,
    s.user_id AS student_user_id,
    c.name AS class_name,
    c.section AS class_section,
    c.academic_year_id,
    ay.name AS academic_year_name,
    fi.id AS invoice_id,
    fi.invoice_no,
    fi.month_year,
    fi.due_date,
    fi.status AS invoice_status,
    fi.amount,
    fi.discount,
    fi.fine,
    fi.net_amount,
    COALESCE(p.paid_amount, (0)::numeric) AS paid_amount,
    (fi.net_amount - COALESCE(p.paid_amount, (0)::numeric)) AS balance
   FROM ((((public.students s
     LEFT JOIN public.classes c ON ((c.id = s.class_id)))
     LEFT JOIN public.academic_years ay ON ((ay.id = c.academic_year_id)))
     LEFT JOIN public.fee_invoices fi ON (((fi.student_id = s.id) AND ((fi.status)::text <> 'cancelled'::text))))
     LEFT JOIN LATERAL ( SELECT sum(payments.amount_paid) AS paid_amount
           FROM public.payments
          WHERE (payments.invoice_id = fi.id)) p ON (true))
  WHERE ((s.status)::text = 'active'::text);


--
-- Name: vw_student_fee_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_student_fee_summary AS
 SELECT s.id AS student_id,
    s.enrollment_no,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS student_name,
    c.name AS class_name,
    count(fi.id) AS total_invoices,
    COALESCE(sum(fi.net_amount), (0)::numeric) AS total_billed,
    COALESCE(sum(p.amount_paid), (0)::numeric) AS total_paid,
    (COALESCE(sum(fi.net_amount), (0)::numeric) - COALESCE(sum(p.amount_paid), (0)::numeric)) AS total_due,
    count(fi.id) FILTER (WHERE ((fi.status)::text = 'overdue'::text)) AS overdue_count
   FROM (((public.students s
     LEFT JOIN public.classes c ON ((c.id = s.class_id)))
     LEFT JOIN public.fee_invoices fi ON ((fi.student_id = s.id)))
     LEFT JOIN public.payments p ON ((p.invoice_id = fi.id)))
  GROUP BY s.id, s.enrollment_no, s.first_name, s.last_name, c.name;


--
-- Name: vw_student_report_card; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_student_report_card AS
 SELECT s.id AS student_id,
    s.first_name,
    s.last_name,
    c.name AS class_name,
    sub.name AS subject_name,
    e.name AS exam_name,
    g.marks,
    g.grade
   FROM ((((public.grades g
     JOIN public.students s ON ((s.id = g.student_id)))
     JOIN public.subjects sub ON ((sub.id = g.subject_id)))
     JOIN public.exams e ON ((e.id = g.exam_id)))
     JOIN public.classes c ON ((c.id = s.class_id)));


--
-- Name: vw_teacher_timetable; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_teacher_timetable AS
 SELECT t.id AS teacher_id,
    t.employee_no,
    (((t.first_name)::text || ' '::text) || (t.last_name)::text) AS teacher_name,
    tt.day_of_week,
        CASE tt.day_of_week
            WHEN 1 THEN 'Monday'::text
            WHEN 2 THEN 'Tuesday'::text
            WHEN 3 THEN 'Wednesday'::text
            WHEN 4 THEN 'Thursday'::text
            WHEN 5 THEN 'Friday'::text
            WHEN 6 THEN 'Saturday'::text
            WHEN 7 THEN 'Sunday'::text
            ELSE NULL::text
        END AS day_name,
    tt.start_time,
    tt.end_time,
    c.name AS class_name,
    sub.name AS subject_name,
    tt.room_number
   FROM (((public.timetable tt
     JOIN public.teachers t ON ((t.id = tt.teacher_id)))
     JOIN public.classes c ON ((c.id = tt.class_id)))
     JOIN public.subjects sub ON ((sub.id = tt.subject_id)))
  ORDER BY t.id, tt.day_of_week, tt.start_time;


--
-- Name: withdrawal_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_activity_log (
    id integer NOT NULL,
    withdrawal_id integer NOT NULL,
    user_id integer,
    user_name character varying,
    action character varying NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    from_role character varying,
    related_id integer
);


--
-- Name: withdrawal_activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_activity_log_id_seq OWNED BY public.withdrawal_activity_log.id;


--
-- Name: withdrawal_clearances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_clearances (
    id integer NOT NULL,
    request_id integer,
    department character varying(50) NOT NULL,
    cleared_by integer,
    cleared_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    note text,
    waiver_requested boolean DEFAULT false,
    waiver_id integer,
    CONSTRAINT wc_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'cleared'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: withdrawal_clearances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_clearances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_clearances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_clearances_id_seq OWNED BY public.withdrawal_clearances.id;


--
-- Name: withdrawal_conduct; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_conduct (
    id integer NOT NULL,
    request_id integer,
    teacher_id integer,
    behaviour character varying(20),
    discipline character varying(20),
    academic_performance character varying(20),
    attendance_regularity character varying(20),
    cocurricular character varying(20),
    disciplinary_action boolean DEFAULT false,
    disciplinary_details text,
    remarks text,
    recommended_readmission boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: withdrawal_conduct_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_conduct_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_conduct_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_conduct_id_seq OWNED BY public.withdrawal_conduct.id;


--
-- Name: withdrawal_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_config (
    id integer NOT NULL,
    departments jsonb DEFAULT '["finance", "library", "admin"]'::jsonb,
    require_coordinator boolean DEFAULT true,
    require_principal boolean DEFAULT true,
    allow_appeal boolean DEFAULT false,
    appeal_days integer DEFAULT 7,
    required_documents jsonb DEFAULT '[]'::jsonb,
    tc_prefix character varying(20) DEFAULT 'TC'::character varying,
    auto_generate_tc boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by integer
);


--
-- Name: withdrawal_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_config_id_seq OWNED BY public.withdrawal_config.id;


--
-- Name: withdrawal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_documents (
    id integer NOT NULL,
    request_id integer,
    filename character varying(300) NOT NULL,
    url character varying(500) NOT NULL,
    uploaded_by integer,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: withdrawal_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_documents_id_seq OWNED BY public.withdrawal_documents.id;


--
-- Name: withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_requests (
    id integer NOT NULL,
    student_id integer,
    requested_by integer,
    reason text NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    status character varying(30) DEFAULT 'pending'::character varying,
    coordinator_note text,
    coordinator_id integer,
    coordinator_at timestamp with time zone,
    principal_note text,
    principal_id integer,
    principal_at timestamp with time zone,
    effective_date date,
    documents character varying(300),
    teacher_conduct_submitted boolean DEFAULT false,
    teacher_conduct_at timestamp with time zone,
    teacher_conduct_by integer,
    CONSTRAINT withdrawal_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'under_review'::character varying, 'clearance'::character varying, 'finance_clearance'::character varying, 'library_clearance'::character varying, 'approved'::character varying, 'rejected'::character varying, 'withdrawn'::character varying, 'coordinator_final'::character varying, 'reviewed'::character varying, 'cleared'::character varying, 'in_clearance'::character varying])::text[])))
);


--
-- Name: withdrawal_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_requests_id_seq OWNED BY public.withdrawal_requests.id;


--
-- Name: withdrawal_waivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_waivers (
    id integer NOT NULL,
    withdrawal_id integer NOT NULL,
    invoice_id integer,
    requested_by integer NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    waiver_type character varying NOT NULL,
    waiver_amount numeric,
    reason text,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    actioned_by integer,
    actioned_at timestamp with time zone,
    action_note text,
    new_invoice_id integer,
    CONSTRAINT withdrawal_waivers_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'forwarded'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT withdrawal_waivers_waiver_type_check CHECK (((waiver_type)::text = ANY ((ARRAY['full'::character varying, 'partial'::character varying])::text[])))
);


--
-- Name: withdrawal_waivers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_waivers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_waivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_waivers_id_seq OWNED BY public.withdrawal_waivers.id;


--
-- Name: work_queue_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_queue_items (
    id integer NOT NULL,
    module character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id integer NOT NULL,
    title character varying NOT NULL,
    description text,
    action_required character varying NOT NULL,
    priority character varying DEFAULT 'normal'::character varying NOT NULL,
    assigned_role character varying,
    assigned_user_id integer,
    link character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    due_date date,
    metadata jsonb DEFAULT '{}'::jsonb,
    workflow_instance_id integer,
    created_by integer,
    completed_by integer,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    entity_status character varying DEFAULT 'submitted'::character varying,
    previous_assignee_ids integer[] DEFAULT '{}'::integer[],
    submitter_id integer,
    CONSTRAINT work_queue_items_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT work_queue_items_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: work_queue_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.work_queue_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_queue_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.work_queue_items_id_seq OWNED BY public.work_queue_items.id;


--
-- Name: workflow_assignment_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_assignment_conditions (
    id integer NOT NULL,
    assignment_id integer NOT NULL,
    field character varying NOT NULL,
    operator character varying NOT NULL,
    value character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT workflow_assignment_conditions_operator_check CHECK (((operator)::text = ANY ((ARRAY['>'::character varying, '<'::character varying, '>='::character varying, '<='::character varying, '='::character varying, '!='::character varying, 'in'::character varying, 'not_in'::character varying])::text[])))
);


--
-- Name: workflow_assignment_conditions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_assignment_conditions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_assignment_conditions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_assignment_conditions_id_seq OWNED BY public.workflow_assignment_conditions.id;


--
-- Name: workflow_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_assignments (
    id integer NOT NULL,
    module character varying NOT NULL,
    entity_type character varying NOT NULL,
    workflow_id integer NOT NULL,
    priority integer DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: workflow_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_assignments_id_seq OWNED BY public.workflow_assignments.id;


--
-- Name: workflow_condition_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_condition_fields (
    id integer NOT NULL,
    module character varying NOT NULL,
    entity_type character varying NOT NULL,
    label character varying NOT NULL,
    field_key character varying NOT NULL,
    field_type character varying DEFAULT 'number'::character varying NOT NULL,
    dropdown_sql character varying,
    sort_order integer DEFAULT 0,
    operator_set character varying DEFAULT 'all'::character varying,
    field_options jsonb,
    CONSTRAINT workflow_condition_fields_field_type_check CHECK (((field_type)::text = ANY ((ARRAY['number'::character varying, 'text'::character varying, 'dropdown'::character varying, 'boolean'::character varying, 'select'::character varying])::text[])))
);


--
-- Name: workflow_condition_fields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_condition_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_condition_fields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_condition_fields_id_seq OWNED BY public.workflow_condition_fields.id;


--
-- Name: workflow_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_conditions (
    id integer NOT NULL,
    step_id integer NOT NULL,
    field character varying NOT NULL,
    operator character varying NOT NULL,
    value character varying NOT NULL,
    effect character varying NOT NULL,
    CONSTRAINT workflow_conditions_effect_check CHECK (((effect)::text = ANY ((ARRAY['include_step'::character varying, 'skip_step'::character varying])::text[]))),
    CONSTRAINT workflow_conditions_operator_check CHECK (((operator)::text = ANY ((ARRAY['>'::character varying, '<'::character varying, '>='::character varying, '<='::character varying, '='::character varying, '!='::character varying, 'in'::character varying, 'not_in'::character varying])::text[])))
);


--
-- Name: workflow_conditions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_conditions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_conditions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_conditions_id_seq OWNED BY public.workflow_conditions.id;


--
-- Name: workflow_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_definitions (
    id integer NOT NULL,
    name character varying NOT NULL,
    code character varying NOT NULL,
    module character varying NOT NULL,
    entity_type character varying NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    default_wq_link character varying
);


--
-- Name: workflow_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_definitions_id_seq OWNED BY public.workflow_definitions.id;


--
-- Name: workflow_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_instances (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    module character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id integer NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    current_step_order integer DEFAULT 1,
    context jsonb DEFAULT '{}'::jsonb,
    initiated_by integer,
    submitter_id integer,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT workflow_instances_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: workflow_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_instances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_instances_id_seq OWNED BY public.workflow_instances.id;


--
-- Name: workflow_module_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_module_links (
    id integer NOT NULL,
    module character varying NOT NULL,
    entity_type character varying NOT NULL,
    page_link character varying NOT NULL,
    label character varying
);


--
-- Name: workflow_module_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_module_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_module_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_module_links_id_seq OWNED BY public.workflow_module_links.id;


--
-- Name: workflow_step_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_step_instances (
    id integer NOT NULL,
    instance_id integer NOT NULL,
    step_id integer NOT NULL,
    step_order integer NOT NULL,
    step_name character varying,
    step_type character varying,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    assigned_to_id integer,
    assigned_role character varying,
    actioned_by integer,
    actioned_at timestamp with time zone,
    note text,
    wq_item_id integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT workflow_step_instances_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'skipped'::character varying, 'notified'::character varying])::text[])))
);


--
-- Name: workflow_step_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_step_instances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_step_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_step_instances_id_seq OWNED BY public.workflow_step_instances.id;


--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_steps (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    step_order integer NOT NULL,
    step_name character varying NOT NULL,
    step_type character varying DEFAULT 'approve'::character varying NOT NULL,
    approver_type character varying DEFAULT 'role'::character varying NOT NULL,
    approver_role character varying,
    approver_user_id integer,
    approver_lookup character varying,
    is_required boolean DEFAULT true,
    can_reject boolean DEFAULT true,
    action_label character varying DEFAULT 'Approve'::character varying,
    reject_label character varying DEFAULT 'Reject'::character varying,
    entity_status_on_approve character varying,
    entity_status_on_reject character varying DEFAULT 'rejected'::character varying,
    notify_on_assign boolean DEFAULT true,
    notify_title character varying,
    notify_body character varying,
    wq_priority character varying DEFAULT 'normal'::character varying,
    wq_link_template character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT workflow_steps_approver_type_check CHECK (((approver_type)::text = ANY ((ARRAY['role'::character varying, 'specific_user'::character varying, 'dept_head'::character varying, 'class_teacher'::character varying, 'dynamic'::character varying])::text[]))),
    CONSTRAINT workflow_steps_step_type_check CHECK (((step_type)::text = ANY ((ARRAY['approve'::character varying, 'recommend'::character varying, 'review'::character varying, 'verify'::character varying, 'clear'::character varying, 'notify'::character varying, 'publish'::character varying, 'payment'::character varying, 'conduct'::character varying, 'decide'::character varying, 'hearing'::character varying, 'assign_committee'::character varying, 'appeal_review'::character varying, 'appeal_decide'::character varying])::text[])))
);


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_steps_id_seq OWNED BY public.workflow_steps.id;


--
-- Name: wq_status_colors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wq_status_colors (
    id integer NOT NULL,
    status_key character varying NOT NULL,
    label character varying NOT NULL,
    bg_color character varying DEFAULT '#f8fafc'::character varying NOT NULL,
    border_color character varying DEFAULT '#e2e8f0'::character varying NOT NULL,
    badge_color character varying DEFAULT '#64748b'::character varying NOT NULL,
    text_color character varying DEFAULT '#374151'::character varying NOT NULL,
    is_active boolean DEFAULT true
);


--
-- Name: wq_status_colors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wq_status_colors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wq_status_colors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wq_status_colors_id_seq OWNED BY public.wq_status_colors.id;


--
-- Name: academic_years id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_years ALTER COLUMN id SET DEFAULT nextval('public.academic_years_id_seq'::regclass);


--
-- Name: announcement_reads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads ALTER COLUMN id SET DEFAULT nextval('public.announcement_reads_id_seq'::regclass);


--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: assignment_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions ALTER COLUMN id SET DEFAULT nextval('public.assignment_submissions_id_seq'::regclass);


--
-- Name: assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments ALTER COLUMN id SET DEFAULT nextval('public.assignments_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: calendar_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events ALTER COLUMN id SET DEFAULT nextval('public.calendar_events_id_seq'::regclass);


--
-- Name: charge_type_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_type_definitions ALTER COLUMN id SET DEFAULT nextval('public.charge_type_definitions_id_seq'::regclass);


--
-- Name: class_fee_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fee_config ALTER COLUMN id SET DEFAULT nextval('public.class_fee_config_id_seq'::regclass);


--
-- Name: class_fees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fees ALTER COLUMN id SET DEFAULT nextval('public.class_fees_id_seq'::regclass);


--
-- Name: class_subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects ALTER COLUMN id SET DEFAULT nextval('public.class_subjects_id_seq'::regclass);


--
-- Name: classes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes ALTER COLUMN id SET DEFAULT nextval('public.classes_id_seq'::regclass);


--
-- Name: daily_diary id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_diary ALTER COLUMN id SET DEFAULT nextval('public.daily_diary_id_seq'::regclass);


--
-- Name: department_attendance_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_attendance_schedules ALTER COLUMN id SET DEFAULT nextval('public.department_attendance_schedules_id_seq'::regclass);


--
-- Name: department_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_roles ALTER COLUMN id SET DEFAULT nextval('public.department_roles_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: designations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations ALTER COLUMN id SET DEFAULT nextval('public.designations_id_seq'::regclass);


--
-- Name: diary_publish id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_publish ALTER COLUMN id SET DEFAULT nextval('public.diary_publish_id_seq'::regclass);


--
-- Name: discipline_appeals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_appeals ALTER COLUMN id SET DEFAULT nextval('public.discipline_appeals_id_seq'::regclass);


--
-- Name: discipline_cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_cases ALTER COLUMN id SET DEFAULT nextval('public.discipline_cases_id_seq'::regclass);


--
-- Name: discipline_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_config ALTER COLUMN id SET DEFAULT nextval('public.discipline_config_id_seq'::regclass);


--
-- Name: discipline_evidence id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_evidence ALTER COLUMN id SET DEFAULT nextval('public.discipline_evidence_id_seq'::regclass);


--
-- Name: discipline_hearings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_hearings ALTER COLUMN id SET DEFAULT nextval('public.discipline_hearings_id_seq'::regclass);


--
-- Name: discount_apply_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_apply_config ALTER COLUMN id SET DEFAULT nextval('public.discount_apply_config_id_seq'::regclass);


--
-- Name: discount_apply_fee_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_apply_fee_types ALTER COLUMN id SET DEFAULT nextval('public.discount_apply_fee_types_id_seq'::regclass);


--
-- Name: discount_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_types ALTER COLUMN id SET DEFAULT nextval('public.discount_types_id_seq'::regclass);


--
-- Name: event_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_types ALTER COLUMN id SET DEFAULT nextval('public.event_types_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: exam_classes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_classes ALTER COLUMN id SET DEFAULT nextval('public.exam_classes_id_seq'::regclass);


--
-- Name: exam_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_config ALTER COLUMN id SET DEFAULT nextval('public.exam_config_id_seq'::regclass);


--
-- Name: exam_marks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks ALTER COLUMN id SET DEFAULT nextval('public.exam_marks_id_seq'::regclass);


--
-- Name: exam_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results ALTER COLUMN id SET DEFAULT nextval('public.exam_results_id_seq'::regclass);


--
-- Name: exam_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_schedule ALTER COLUMN id SET DEFAULT nextval('public.exam_schedule_id_seq'::regclass);


--
-- Name: exam_subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects ALTER COLUMN id SET DEFAULT nextval('public.exam_subjects_id_seq'::regclass);


--
-- Name: exam_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_types ALTER COLUMN id SET DEFAULT nextval('public.exam_types_id_seq'::regclass);


--
-- Name: exams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams ALTER COLUMN id SET DEFAULT nextval('public.exams_id_seq'::regclass);


--
-- Name: fee_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories ALTER COLUMN id SET DEFAULT nextval('public.fee_categories_id_seq'::regclass);


--
-- Name: fee_charge_classes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_classes ALTER COLUMN id SET DEFAULT nextval('public.fee_charge_classes_id_seq'::regclass);


--
-- Name: fee_charge_students id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_students ALTER COLUMN id SET DEFAULT nextval('public.fee_charge_students_id_seq'::regclass);


--
-- Name: fee_charges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charges ALTER COLUMN id SET DEFAULT nextval('public.fee_charges_id_seq'::regclass);


--
-- Name: fee_invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_items ALTER COLUMN id SET DEFAULT nextval('public.fee_invoice_items_id_seq'::regclass);


--
-- Name: fee_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices ALTER COLUMN id SET DEFAULT nextval('public.fee_invoices_id_seq'::regclass);


--
-- Name: fee_structures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures ALTER COLUMN id SET DEFAULT nextval('public.fee_structures_id_seq'::regclass);


--
-- Name: fee_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_types ALTER COLUMN id SET DEFAULT nextval('public.fee_types_id_seq'::regclass);


--
-- Name: goods_receipt_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes ALTER COLUMN id SET DEFAULT nextval('public.goods_receipt_notes_id_seq'::regclass);


--
-- Name: grades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades ALTER COLUMN id SET DEFAULT nextval('public.grades_id_seq'::regclass);


--
-- Name: grading_scales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_scales ALTER COLUMN id SET DEFAULT nextval('public.grading_scales_id_seq'::regclass);


--
-- Name: grn_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items ALTER COLUMN id SET DEFAULT nextval('public.grn_items_id_seq'::regclass);


--
-- Name: hearing_appearance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_appearance ALTER COLUMN id SET DEFAULT nextval('public.hearing_appearance_id_seq'::regclass);


--
-- Name: hearing_committee id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_committee ALTER COLUMN id SET DEFAULT nextval('public.hearing_committee_id_seq'::regclass);


--
-- Name: hearing_member_remarks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_member_remarks ALTER COLUMN id SET DEFAULT nextval('public.hearing_member_remarks_id_seq'::regclass);


--
-- Name: leave_approval_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approval_rules ALTER COLUMN id SET DEFAULT nextval('public.leave_approval_rules_id_seq'::regclass);


--
-- Name: leave_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances ALTER COLUMN id SET DEFAULT nextval('public.leave_balances_id_seq'::regclass);


--
-- Name: leave_certificate_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_certificate_types ALTER COLUMN id SET DEFAULT nextval('public.leave_certificate_types_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: leave_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_types ALTER COLUMN id SET DEFAULT nextval('public.leave_types_id_seq'::regclass);


--
-- Name: leave_validation_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_validation_rules ALTER COLUMN id SET DEFAULT nextval('public.leave_validation_rules_id_seq'::regclass);


--
-- Name: library_authors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_authors ALTER COLUMN id SET DEFAULT nextval('public.library_authors_id_seq'::regclass);


--
-- Name: library_book_copies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_book_copies ALTER COLUMN id SET DEFAULT nextval('public.library_book_copies_id_seq'::regclass);


--
-- Name: library_books id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_books ALTER COLUMN id SET DEFAULT nextval('public.library_books_id_seq'::regclass);


--
-- Name: library_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_categories ALTER COLUMN id SET DEFAULT nextval('public.library_categories_id_seq'::regclass);


--
-- Name: library_fine_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_fine_payments ALTER COLUMN id SET DEFAULT nextval('public.library_fine_payments_id_seq'::regclass);


--
-- Name: library_inventory_audit_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audit_items ALTER COLUMN id SET DEFAULT nextval('public.library_inventory_audit_items_id_seq'::regclass);


--
-- Name: library_inventory_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audits ALTER COLUMN id SET DEFAULT nextval('public.library_inventory_audits_id_seq'::regclass);


--
-- Name: library_issue_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issue_transactions ALTER COLUMN id SET DEFAULT nextval('public.library_issue_transactions_id_seq'::regclass);


--
-- Name: library_issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues ALTER COLUMN id SET DEFAULT nextval('public.library_issues_id_seq'::regclass);


--
-- Name: library_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_members ALTER COLUMN id SET DEFAULT nextval('public.library_members_id_seq'::regclass);


--
-- Name: library_membership_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_membership_rules ALTER COLUMN id SET DEFAULT nextval('public.library_membership_rules_id_seq'::regclass);


--
-- Name: library_publishers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_publishers ALTER COLUMN id SET DEFAULT nextval('public.library_publishers_id_seq'::regclass);


--
-- Name: library_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_reservations ALTER COLUMN id SET DEFAULT nextval('public.library_reservations_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: payroll_adjustments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments ALTER COLUMN id SET DEFAULT nextval('public.payroll_adjustments_id_seq'::regclass);


--
-- Name: payroll_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_components ALTER COLUMN id SET DEFAULT nextval('public.payroll_components_id_seq'::regclass);


--
-- Name: payroll_grade_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_components ALTER COLUMN id SET DEFAULT nextval('public.payroll_grade_components_id_seq'::regclass);


--
-- Name: payroll_grade_department_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_department_components ALTER COLUMN id SET DEFAULT nextval('public.payroll_grade_department_components_id_seq'::regclass);


--
-- Name: payroll_grades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grades ALTER COLUMN id SET DEFAULT nextval('public.payroll_grades_id_seq'::regclass);


--
-- Name: payroll_payslips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_payslips ALTER COLUMN id SET DEFAULT nextval('public.payroll_payslips_id_seq'::regclass);


--
-- Name: payroll_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs ALTER COLUMN id SET DEFAULT nextval('public.payroll_runs_id_seq'::regclass);


--
-- Name: payroll_tax_slab_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_tax_slab_sets ALTER COLUMN id SET DEFAULT nextval('public.payroll_tax_slab_sets_id_seq'::regclass);


--
-- Name: payroll_tax_slabs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_tax_slabs ALTER COLUMN id SET DEFAULT nextval('public.payroll_tax_slabs_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: po_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items ALTER COLUMN id SET DEFAULT nextval('public.po_items_id_seq'::regclass);


--
-- Name: pr_approval_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_approval_instances ALTER COLUMN id SET DEFAULT nextval('public.pr_approval_instances_id_seq'::regclass);


--
-- Name: pr_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_items ALTER COLUMN id SET DEFAULT nextval('public.pr_items_id_seq'::regclass);


--
-- Name: procurement_approval_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_rules ALTER COLUMN id SET DEFAULT nextval('public.procurement_approval_rules_id_seq'::regclass);


--
-- Name: procurement_approval_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_steps ALTER COLUMN id SET DEFAULT nextval('public.procurement_approval_steps_id_seq'::regclass);


--
-- Name: procurement_item_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_item_categories ALTER COLUMN id SET DEFAULT nextval('public.procurement_item_categories_id_seq'::regclass);


--
-- Name: procurement_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_items ALTER COLUMN id SET DEFAULT nextval('public.procurement_items_id_seq'::regclass);


--
-- Name: procurement_vendor_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_vendor_categories ALTER COLUMN id SET DEFAULT nextval('public.procurement_vendor_categories_id_seq'::regclass);


--
-- Name: procurement_vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_vendors ALTER COLUMN id SET DEFAULT nextval('public.procurement_vendors_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: purchase_requisitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions ALTER COLUMN id SET DEFAULT nextval('public.purchase_requisitions_id_seq'::regclass);


--
-- Name: quiz_questions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions ALTER COLUMN id SET DEFAULT nextval('public.quiz_questions_id_seq'::regclass);


--
-- Name: quiz_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_submissions ALTER COLUMN id SET DEFAULT nextval('public.quiz_submissions_id_seq'::regclass);


--
-- Name: quizzes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes ALTER COLUMN id SET DEFAULT nextval('public.quizzes_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: report_cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards ALTER COLUMN id SET DEFAULT nextval('public.report_cards_id_seq'::regclass);


--
-- Name: result_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_components ALTER COLUMN id SET DEFAULT nextval('public.result_components_id_seq'::regclass);


--
-- Name: result_formula id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_formula ALTER COLUMN id SET DEFAULT nextval('public.result_formula_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: sibling_discount_tiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sibling_discount_tiers ALTER COLUMN id SET DEFAULT nextval('public.sibling_discount_tiers_id_seq'::regclass);


--
-- Name: sp_registry id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_registry ALTER COLUMN id SET DEFAULT nextval('public.sp_registry_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: staff_attendance_correction_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_correction_requests ALTER COLUMN id SET DEFAULT nextval('public.staff_attendance_correction_requests_id_seq'::regclass);


--
-- Name: staff_attendance_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_sessions ALTER COLUMN id SET DEFAULT nextval('public.staff_attendance_sessions_id_seq'::regclass);


--
-- Name: staff_designation_grades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_designation_grades ALTER COLUMN id SET DEFAULT nextval('public.staff_designation_grades_id_seq'::regclass);


--
-- Name: staff_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents ALTER COLUMN id SET DEFAULT nextval('public.staff_documents_id_seq'::regclass);


--
-- Name: staff_education id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_education ALTER COLUMN id SET DEFAULT nextval('public.staff_education_id_seq'::regclass);


--
-- Name: staff_emergency_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_emergency_contacts ALTER COLUMN id SET DEFAULT nextval('public.staff_emergency_contacts_id_seq'::regclass);


--
-- Name: staff_employment_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_employment_history ALTER COLUMN id SET DEFAULT nextval('public.staff_employment_history_id_seq'::regclass);


--
-- Name: staff_experience id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_experience ALTER COLUMN id SET DEFAULT nextval('public.staff_experience_id_seq'::regclass);


--
-- Name: staff_leave_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_balances ALTER COLUMN id SET DEFAULT nextval('public.staff_leave_balances_id_seq'::regclass);


--
-- Name: staff_leave_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_policies ALTER COLUMN id SET DEFAULT nextval('public.staff_leave_policies_id_seq'::regclass);


--
-- Name: staff_leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests ALTER COLUMN id SET DEFAULT nextval('public.staff_leave_requests_id_seq'::regclass);


--
-- Name: staff_leave_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_rules ALTER COLUMN id SET DEFAULT nextval('public.staff_leave_rules_id_seq'::regclass);


--
-- Name: staff_payroll_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payroll_profile ALTER COLUMN id SET DEFAULT nextval('public.staff_payroll_profile_id_seq'::regclass);


--
-- Name: staff_rfid_cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_rfid_cards ALTER COLUMN id SET DEFAULT nextval('public.staff_rfid_cards_id_seq'::regclass);


--
-- Name: student_discounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discounts ALTER COLUMN id SET DEFAULT nextval('public.student_discounts_id_seq'::regclass);


--
-- Name: students id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students ALTER COLUMN id SET DEFAULT nextval('public.students_id_seq'::regclass);


--
-- Name: study_materials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_materials ALTER COLUMN id SET DEFAULT nextval('public.study_materials_id_seq'::regclass);


--
-- Name: subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects ALTER COLUMN id SET DEFAULT nextval('public.subjects_id_seq'::regclass);


--
-- Name: syllabus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus ALTER COLUMN id SET DEFAULT nextval('public.syllabus_id_seq'::regclass);


--
-- Name: syllabus_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_attachments ALTER COLUMN id SET DEFAULT nextval('public.syllabus_attachments_id_seq'::regclass);


--
-- Name: syllabus_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_progress ALTER COLUMN id SET DEFAULT nextval('public.syllabus_progress_id_seq'::regclass);


--
-- Name: syllabus_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics ALTER COLUMN id SET DEFAULT nextval('public.syllabus_topics_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: teachers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers ALTER COLUMN id SET DEFAULT nextval('public.teachers_id_seq'::regclass);


--
-- Name: timetable id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable ALTER COLUMN id SET DEFAULT nextval('public.timetable_id_seq'::regclass);


--
-- Name: user_signatures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_signatures ALTER COLUMN id SET DEFAULT nextval('public.user_signatures_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendor_invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_items ALTER COLUMN id SET DEFAULT nextval('public.vendor_invoice_items_id_seq'::regclass);


--
-- Name: vendor_invoice_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.vendor_invoice_payments_id_seq'::regclass);


--
-- Name: vendor_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices ALTER COLUMN id SET DEFAULT nextval('public.vendor_invoices_id_seq'::regclass);


--
-- Name: withdrawal_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_activity_log ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_activity_log_id_seq'::regclass);


--
-- Name: withdrawal_clearances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_clearances ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_clearances_id_seq'::regclass);


--
-- Name: withdrawal_conduct id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_conduct ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_conduct_id_seq'::regclass);


--
-- Name: withdrawal_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_config ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_config_id_seq'::regclass);


--
-- Name: withdrawal_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_documents ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_documents_id_seq'::regclass);


--
-- Name: withdrawal_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_requests_id_seq'::regclass);


--
-- Name: withdrawal_waivers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_waivers_id_seq'::regclass);


--
-- Name: work_queue_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_queue_items ALTER COLUMN id SET DEFAULT nextval('public.work_queue_items_id_seq'::regclass);


--
-- Name: workflow_assignment_conditions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_assignment_conditions ALTER COLUMN id SET DEFAULT nextval('public.workflow_assignment_conditions_id_seq'::regclass);


--
-- Name: workflow_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_assignments ALTER COLUMN id SET DEFAULT nextval('public.workflow_assignments_id_seq'::regclass);


--
-- Name: workflow_condition_fields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_condition_fields ALTER COLUMN id SET DEFAULT nextval('public.workflow_condition_fields_id_seq'::regclass);


--
-- Name: workflow_conditions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_conditions ALTER COLUMN id SET DEFAULT nextval('public.workflow_conditions_id_seq'::regclass);


--
-- Name: workflow_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions ALTER COLUMN id SET DEFAULT nextval('public.workflow_definitions_id_seq'::regclass);


--
-- Name: workflow_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances ALTER COLUMN id SET DEFAULT nextval('public.workflow_instances_id_seq'::regclass);


--
-- Name: workflow_module_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_module_links ALTER COLUMN id SET DEFAULT nextval('public.workflow_module_links_id_seq'::regclass);


--
-- Name: workflow_step_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances ALTER COLUMN id SET DEFAULT nextval('public.workflow_step_instances_id_seq'::regclass);


--
-- Name: workflow_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.workflow_steps_id_seq'::regclass);


--
-- Name: wq_status_colors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wq_status_colors ALTER COLUMN id SET DEFAULT nextval('public.wq_status_colors_id_seq'::regclass);


--
-- Name: academic_years academic_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_years
    ADD CONSTRAINT academic_years_pkey PRIMARY KEY (id);


--
-- Name: announcement_reads announcement_reads_announcement_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_user_id_key UNIQUE (announcement_id, user_id);


--
-- Name: announcement_reads announcement_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: assignment_submissions assignment_submissions_assignment_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);


--
-- Name: assignment_submissions assignment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance_schedule_settings attendance_schedule_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_schedule_settings
    ADD CONSTRAINT attendance_schedule_settings_pkey PRIMARY KEY (id);


--
-- Name: attendance_settings attendance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_settings
    ADD CONSTRAINT attendance_settings_pkey PRIMARY KEY (id);


--
-- Name: attendance_status_thresholds attendance_status_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_status_thresholds
    ADD CONSTRAINT attendance_status_thresholds_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: charge_type_definitions charge_type_definitions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_type_definitions
    ADD CONSTRAINT charge_type_definitions_name_key UNIQUE (name);


--
-- Name: charge_type_definitions charge_type_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_type_definitions
    ADD CONSTRAINT charge_type_definitions_pkey PRIMARY KEY (id);


--
-- Name: class_fee_config class_fee_config_class_id_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fee_config
    ADD CONSTRAINT class_fee_config_class_id_academic_year_id_key UNIQUE (class_id, academic_year_id);


--
-- Name: class_fee_config class_fee_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fee_config
    ADD CONSTRAINT class_fee_config_pkey PRIMARY KEY (id);


--
-- Name: class_fees class_fees_class_id_fee_type_id_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fees
    ADD CONSTRAINT class_fees_class_id_fee_type_id_academic_year_id_key UNIQUE (class_id, fee_type_id, academic_year_id);


--
-- Name: class_fees class_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fees
    ADD CONSTRAINT class_fees_pkey PRIMARY KEY (id);


--
-- Name: class_subjects class_subjects_class_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_subject_id_key UNIQUE (class_id, subject_id);


--
-- Name: class_subjects class_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_pkey PRIMARY KEY (id);


--
-- Name: class_teachers class_teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_pkey PRIMARY KEY (class_id, teacher_id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: daily_diary daily_diary_class_id_subject_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_diary
    ADD CONSTRAINT daily_diary_class_id_subject_id_date_key UNIQUE (class_id, subject_id, date);


--
-- Name: daily_diary daily_diary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_diary
    ADD CONSTRAINT daily_diary_pkey PRIMARY KEY (id);


--
-- Name: department_attendance_schedules department_attendance_schedules_department_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_attendance_schedules
    ADD CONSTRAINT department_attendance_schedules_department_id_key UNIQUE (department_id);


--
-- Name: department_attendance_schedules department_attendance_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_attendance_schedules
    ADD CONSTRAINT department_attendance_schedules_pkey PRIMARY KEY (id);


--
-- Name: department_roles department_roles_department_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_roles
    ADD CONSTRAINT department_roles_department_id_role_id_key UNIQUE (department_id, role_id);


--
-- Name: department_roles department_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_roles
    ADD CONSTRAINT department_roles_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: designations designations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_name_key UNIQUE (name);


--
-- Name: designations designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_pkey PRIMARY KEY (id);


--
-- Name: diary_publish diary_publish_class_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_publish
    ADD CONSTRAINT diary_publish_class_id_date_key UNIQUE (class_id, date);


--
-- Name: diary_publish diary_publish_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_publish
    ADD CONSTRAINT diary_publish_pkey PRIMARY KEY (id);


--
-- Name: discipline_appeals discipline_appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_appeals
    ADD CONSTRAINT discipline_appeals_pkey PRIMARY KEY (id);


--
-- Name: discipline_cases discipline_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_cases
    ADD CONSTRAINT discipline_cases_pkey PRIMARY KEY (id);


--
-- Name: discipline_config discipline_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_config
    ADD CONSTRAINT discipline_config_pkey PRIMARY KEY (id);


--
-- Name: discipline_evidence discipline_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_evidence
    ADD CONSTRAINT discipline_evidence_pkey PRIMARY KEY (id);


--
-- Name: discipline_hearings discipline_hearings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_hearings
    ADD CONSTRAINT discipline_hearings_pkey PRIMARY KEY (id);


--
-- Name: discount_apply_config discount_apply_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_apply_config
    ADD CONSTRAINT discount_apply_config_pkey PRIMARY KEY (id);


--
-- Name: discount_apply_fee_types discount_apply_fee_types_fee_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_apply_fee_types
    ADD CONSTRAINT discount_apply_fee_types_fee_type_id_key UNIQUE (fee_type_id);


--
-- Name: discount_apply_fee_types discount_apply_fee_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_apply_fee_types
    ADD CONSTRAINT discount_apply_fee_types_pkey PRIMARY KEY (id);


--
-- Name: discount_types discount_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_types
    ADD CONSTRAINT discount_types_name_key UNIQUE (name);


--
-- Name: discount_types discount_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_types
    ADD CONSTRAINT discount_types_pkey PRIMARY KEY (id);


--
-- Name: event_types event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_types
    ADD CONSTRAINT event_types_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: exam_classes exam_classes_exam_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_classes
    ADD CONSTRAINT exam_classes_exam_id_class_id_key UNIQUE (exam_id, class_id);


--
-- Name: exam_classes exam_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_classes
    ADD CONSTRAINT exam_classes_pkey PRIMARY KEY (id);


--
-- Name: exam_config exam_config_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_config
    ADD CONSTRAINT exam_config_academic_year_id_key UNIQUE (academic_year_id);


--
-- Name: exam_config exam_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_config
    ADD CONSTRAINT exam_config_pkey PRIMARY KEY (id);


--
-- Name: exam_marks exam_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_pkey PRIMARY KEY (id);


--
-- Name: exam_marks exam_marks_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_unique UNIQUE (exam_id, class_id, subject_id, student_id);


--
-- Name: exam_results exam_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_pkey PRIMARY KEY (id);


--
-- Name: exam_results exam_results_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_unique UNIQUE (exam_id, student_id);


--
-- Name: exam_schedule exam_schedule_exam_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_schedule
    ADD CONSTRAINT exam_schedule_exam_id_subject_id_key UNIQUE (exam_id, subject_id);


--
-- Name: exam_schedule exam_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_schedule
    ADD CONSTRAINT exam_schedule_pkey PRIMARY KEY (id);


--
-- Name: exam_subjects exam_subjects_exam_class_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_exam_class_subject_key UNIQUE (exam_id, class_id, subject_id);


--
-- Name: exam_subjects exam_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_pkey PRIMARY KEY (id);


--
-- Name: exam_types exam_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_types
    ADD CONSTRAINT exam_types_code_key UNIQUE (code);


--
-- Name: exam_types exam_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_types
    ADD CONSTRAINT exam_types_pkey PRIMARY KEY (id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: fee_categories fee_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_name_key UNIQUE (name);


--
-- Name: fee_categories fee_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_pkey PRIMARY KEY (id);


--
-- Name: fee_charge_classes fee_charge_classes_charge_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_classes
    ADD CONSTRAINT fee_charge_classes_charge_id_class_id_key UNIQUE (charge_id, class_id);


--
-- Name: fee_charge_classes fee_charge_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_classes
    ADD CONSTRAINT fee_charge_classes_pkey PRIMARY KEY (id);


--
-- Name: fee_charge_students fee_charge_students_charge_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_students
    ADD CONSTRAINT fee_charge_students_charge_id_student_id_key UNIQUE (charge_id, student_id);


--
-- Name: fee_charge_students fee_charge_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_students
    ADD CONSTRAINT fee_charge_students_pkey PRIMARY KEY (id);


--
-- Name: fee_charges fee_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_pkey PRIMARY KEY (id);


--
-- Name: fee_invoice_items fee_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_items
    ADD CONSTRAINT fee_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: fee_invoices fee_invoices_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_invoice_no_key UNIQUE (invoice_no);


--
-- Name: fee_invoices fee_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_pkey PRIMARY KEY (id);


--
-- Name: fee_structures fee_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);


--
-- Name: fee_types fee_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_types
    ADD CONSTRAINT fee_types_name_key UNIQUE (name);


--
-- Name: fee_types fee_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_types
    ADD CONSTRAINT fee_types_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_notes goods_receipt_notes_grn_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_grn_number_key UNIQUE (grn_number);


--
-- Name: goods_receipt_notes goods_receipt_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_pkey PRIMARY KEY (id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- Name: grading_scales grading_scales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_scales
    ADD CONSTRAINT grading_scales_pkey PRIMARY KEY (id);


--
-- Name: grn_items grn_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_pkey PRIMARY KEY (id);


--
-- Name: hearing_appearance hearing_appearance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_appearance
    ADD CONSTRAINT hearing_appearance_pkey PRIMARY KEY (id);


--
-- Name: hearing_committee hearing_committee_case_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_committee
    ADD CONSTRAINT hearing_committee_case_id_teacher_id_key UNIQUE (case_id, teacher_id);


--
-- Name: hearing_committee hearing_committee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_committee
    ADD CONSTRAINT hearing_committee_pkey PRIMARY KEY (id);


--
-- Name: hearing_member_remarks hearing_member_remarks_case_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_member_remarks
    ADD CONSTRAINT hearing_member_remarks_case_id_teacher_id_key UNIQUE (case_id, teacher_id);


--
-- Name: hearing_member_remarks hearing_member_remarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_member_remarks
    ADD CONSTRAINT hearing_member_remarks_pkey PRIMARY KEY (id);


--
-- Name: hr_policy_settings hr_policy_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_policy_settings
    ADD CONSTRAINT hr_policy_settings_pkey PRIMARY KEY (id);


--
-- Name: leave_approval_rules leave_approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approval_rules
    ADD CONSTRAINT leave_approval_rules_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_student_id_leave_type_id_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_student_id_leave_type_id_academic_year_id_key UNIQUE (student_id, leave_type_id, academic_year_id);


--
-- Name: leave_certificate_types leave_certificate_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_certificate_types
    ADD CONSTRAINT leave_certificate_types_name_key UNIQUE (name);


--
-- Name: leave_certificate_types leave_certificate_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_certificate_types
    ADD CONSTRAINT leave_certificate_types_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: leave_types leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT leave_types_pkey PRIMARY KEY (id);


--
-- Name: leave_validation_rules leave_validation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_validation_rules
    ADD CONSTRAINT leave_validation_rules_pkey PRIMARY KEY (id);


--
-- Name: library_authors library_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_authors
    ADD CONSTRAINT library_authors_pkey PRIMARY KEY (id);


--
-- Name: library_book_copies library_book_copies_accession_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_book_copies
    ADD CONSTRAINT library_book_copies_accession_no_key UNIQUE (accession_no);


--
-- Name: library_book_copies library_book_copies_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_book_copies
    ADD CONSTRAINT library_book_copies_barcode_key UNIQUE (barcode);


--
-- Name: library_book_copies library_book_copies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_book_copies
    ADD CONSTRAINT library_book_copies_pkey PRIMARY KEY (id);


--
-- Name: library_books library_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_books
    ADD CONSTRAINT library_books_pkey PRIMARY KEY (id);


--
-- Name: library_categories library_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_categories
    ADD CONSTRAINT library_categories_name_key UNIQUE (name);


--
-- Name: library_categories library_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_categories
    ADD CONSTRAINT library_categories_pkey PRIMARY KEY (id);


--
-- Name: library_fine_payments library_fine_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_fine_payments
    ADD CONSTRAINT library_fine_payments_pkey PRIMARY KEY (id);


--
-- Name: library_inventory_audit_items library_inventory_audit_items_audit_id_copy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audit_items
    ADD CONSTRAINT library_inventory_audit_items_audit_id_copy_id_key UNIQUE (audit_id, copy_id);


--
-- Name: library_inventory_audit_items library_inventory_audit_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audit_items
    ADD CONSTRAINT library_inventory_audit_items_pkey PRIMARY KEY (id);


--
-- Name: library_inventory_audits library_inventory_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audits
    ADD CONSTRAINT library_inventory_audits_pkey PRIMARY KEY (id);


--
-- Name: library_issue_transactions library_issue_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issue_transactions
    ADD CONSTRAINT library_issue_transactions_pkey PRIMARY KEY (id);


--
-- Name: library_issues library_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_pkey PRIMARY KEY (id);


--
-- Name: library_members library_members_library_card_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_members
    ADD CONSTRAINT library_members_library_card_no_key UNIQUE (library_card_no);


--
-- Name: library_members library_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_members
    ADD CONSTRAINT library_members_pkey PRIMARY KEY (id);


--
-- Name: library_members library_members_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_members
    ADD CONSTRAINT library_members_user_id_key UNIQUE (user_id);


--
-- Name: library_membership_rules library_membership_rules_member_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_membership_rules
    ADD CONSTRAINT library_membership_rules_member_type_key UNIQUE (member_type);


--
-- Name: library_membership_rules library_membership_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_membership_rules
    ADD CONSTRAINT library_membership_rules_pkey PRIMARY KEY (id);


--
-- Name: library_publishers library_publishers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_publishers
    ADD CONSTRAINT library_publishers_pkey PRIMARY KEY (id);


--
-- Name: library_reservations library_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_reservations
    ADD CONSTRAINT library_reservations_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payroll_adjustments payroll_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_pkey PRIMARY KEY (id);


--
-- Name: payroll_components payroll_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_components
    ADD CONSTRAINT payroll_components_pkey PRIMARY KEY (id);


--
-- Name: payroll_grade_components payroll_grade_components_grade_id_component_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_components
    ADD CONSTRAINT payroll_grade_components_grade_id_component_id_key UNIQUE (grade_id, component_id);


--
-- Name: payroll_grade_components payroll_grade_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_components
    ADD CONSTRAINT payroll_grade_components_pkey PRIMARY KEY (id);


--
-- Name: payroll_grade_department_components payroll_grade_department_comp_grade_id_department_id_compon_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_department_components
    ADD CONSTRAINT payroll_grade_department_comp_grade_id_department_id_compon_key UNIQUE (grade_id, department_id, component_id);


--
-- Name: payroll_grade_department_components payroll_grade_department_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_department_components
    ADD CONSTRAINT payroll_grade_department_components_pkey PRIMARY KEY (id);


--
-- Name: payroll_grades payroll_grades_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grades
    ADD CONSTRAINT payroll_grades_name_key UNIQUE (name);


--
-- Name: payroll_grades payroll_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grades
    ADD CONSTRAINT payroll_grades_pkey PRIMARY KEY (id);


--
-- Name: payroll_payslips payroll_payslips_payroll_run_id_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_payslips
    ADD CONSTRAINT payroll_payslips_payroll_run_id_staff_id_key UNIQUE (payroll_run_id, staff_id);


--
-- Name: payroll_payslips payroll_payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_payslips
    ADD CONSTRAINT payroll_payslips_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_month_year_key UNIQUE (month, year);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: payroll_settings payroll_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_settings
    ADD CONSTRAINT payroll_settings_pkey PRIMARY KEY (id);


--
-- Name: payroll_tax_slab_sets payroll_tax_slab_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_tax_slab_sets
    ADD CONSTRAINT payroll_tax_slab_sets_pkey PRIMARY KEY (id);


--
-- Name: payroll_tax_slabs payroll_tax_slabs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_tax_slabs
    ADD CONSTRAINT payroll_tax_slabs_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: po_items po_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT po_items_pkey PRIMARY KEY (id);


--
-- Name: pr_approval_instances pr_approval_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_approval_instances
    ADD CONSTRAINT pr_approval_instances_pkey PRIMARY KEY (id);


--
-- Name: pr_approval_instances pr_approval_instances_pr_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_approval_instances
    ADD CONSTRAINT pr_approval_instances_pr_id_step_order_key UNIQUE (pr_id, step_order);


--
-- Name: pr_items pr_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_items
    ADD CONSTRAINT pr_items_pkey PRIMARY KEY (id);


--
-- Name: procurement_approval_rules procurement_approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_rules
    ADD CONSTRAINT procurement_approval_rules_pkey PRIMARY KEY (id);


--
-- Name: procurement_approval_steps procurement_approval_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_steps
    ADD CONSTRAINT procurement_approval_steps_pkey PRIMARY KEY (id);


--
-- Name: procurement_approval_steps procurement_approval_steps_rule_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_steps
    ADD CONSTRAINT procurement_approval_steps_rule_id_step_order_key UNIQUE (rule_id, step_order);


--
-- Name: procurement_item_categories procurement_item_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_item_categories
    ADD CONSTRAINT procurement_item_categories_name_key UNIQUE (name);


--
-- Name: procurement_item_categories procurement_item_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_item_categories
    ADD CONSTRAINT procurement_item_categories_pkey PRIMARY KEY (id);


--
-- Name: procurement_items procurement_items_item_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_items
    ADD CONSTRAINT procurement_items_item_code_key UNIQUE (item_code);


--
-- Name: procurement_items procurement_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_items
    ADD CONSTRAINT procurement_items_pkey PRIMARY KEY (id);


--
-- Name: procurement_vendor_categories procurement_vendor_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_vendor_categories
    ADD CONSTRAINT procurement_vendor_categories_name_key UNIQUE (name);


--
-- Name: procurement_vendor_categories procurement_vendor_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_vendor_categories
    ADD CONSTRAINT procurement_vendor_categories_pkey PRIMARY KEY (id);


--
-- Name: procurement_vendors procurement_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_vendors
    ADD CONSTRAINT procurement_vendors_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: purchase_requisitions purchase_requisitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_pkey PRIMARY KEY (id);


--
-- Name: purchase_requisitions purchase_requisitions_pr_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_pr_number_key UNIQUE (pr_number);


--
-- Name: quiz_questions quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_pkey PRIMARY KEY (id);


--
-- Name: quiz_submissions quiz_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_submissions
    ADD CONSTRAINT quiz_submissions_pkey PRIMARY KEY (id);


--
-- Name: quiz_submissions quiz_submissions_quiz_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_submissions
    ADD CONSTRAINT quiz_submissions_quiz_id_student_id_key UNIQUE (quiz_id, student_id);


--
-- Name: quizzes quizzes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: report_cards report_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_pkey PRIMARY KEY (id);


--
-- Name: report_cards report_cards_student_id_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_student_id_academic_year_id_key UNIQUE (student_id, academic_year_id);


--
-- Name: result_components result_components_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_components
    ADD CONSTRAINT result_components_code_key UNIQUE (code);


--
-- Name: result_components result_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_components
    ADD CONSTRAINT result_components_pkey PRIMARY KEY (id);


--
-- Name: result_formula result_formula_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_formula
    ADD CONSTRAINT result_formula_academic_year_id_key UNIQUE (academic_year_id);


--
-- Name: result_formula result_formula_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_formula
    ADD CONSTRAINT result_formula_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sibling_discount_tiers sibling_discount_tiers_child_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sibling_discount_tiers
    ADD CONSTRAINT sibling_discount_tiers_child_no_key UNIQUE (child_no);


--
-- Name: sibling_discount_tiers sibling_discount_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sibling_discount_tiers
    ADD CONSTRAINT sibling_discount_tiers_pkey PRIMARY KEY (id);


--
-- Name: sp_registry sp_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_registry
    ADD CONSTRAINT sp_registry_pkey PRIMARY KEY (id);


--
-- Name: sp_registry sp_registry_proc_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sp_registry
    ADD CONSTRAINT sp_registry_proc_name_key UNIQUE (proc_name);


--
-- Name: staff_attendance_correction_requests staff_attendance_correction_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_correction_requests
    ADD CONSTRAINT staff_attendance_correction_requests_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance_sessions staff_attendance_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_sessions
    ADD CONSTRAINT staff_attendance_sessions_pkey PRIMARY KEY (id);


--
-- Name: staff_daily_attendance_status staff_daily_attendance_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_daily_attendance_status
    ADD CONSTRAINT staff_daily_attendance_status_pkey PRIMARY KEY (staff_id, status_date);


--
-- Name: staff_designation_grades staff_designation_grades_designation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_designation_grades
    ADD CONSTRAINT staff_designation_grades_designation_id_key UNIQUE (designation_id);


--
-- Name: staff_designation_grades staff_designation_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_designation_grades
    ADD CONSTRAINT staff_designation_grades_pkey PRIMARY KEY (id);


--
-- Name: staff_documents staff_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_pkey PRIMARY KEY (id);


--
-- Name: staff_education staff_education_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_education
    ADD CONSTRAINT staff_education_pkey PRIMARY KEY (id);


--
-- Name: staff_emergency_contacts staff_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_emergency_contacts
    ADD CONSTRAINT staff_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: staff staff_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_employee_code_key UNIQUE (employee_code);


--
-- Name: staff_employment_history staff_employment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_employment_history
    ADD CONSTRAINT staff_employment_history_pkey PRIMARY KEY (id);


--
-- Name: staff_experience staff_experience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_experience
    ADD CONSTRAINT staff_experience_pkey PRIMARY KEY (id);


--
-- Name: staff_leave_balances staff_leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_balances
    ADD CONSTRAINT staff_leave_balances_pkey PRIMARY KEY (id);


--
-- Name: staff_leave_balances staff_leave_balances_user_id_leave_type_id_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_balances
    ADD CONSTRAINT staff_leave_balances_user_id_leave_type_id_year_key UNIQUE (user_id, leave_type_id, year);


--
-- Name: staff_leave_policies staff_leave_policies_leave_type_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_policies
    ADD CONSTRAINT staff_leave_policies_leave_type_id_role_id_key UNIQUE (leave_type_id, role_id);


--
-- Name: staff_leave_policies staff_leave_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_policies
    ADD CONSTRAINT staff_leave_policies_pkey PRIMARY KEY (id);


--
-- Name: staff_leave_requests staff_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: staff_leave_rules staff_leave_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_rules
    ADD CONSTRAINT staff_leave_rules_pkey PRIMARY KEY (id);


--
-- Name: staff_payroll_profile staff_payroll_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payroll_profile
    ADD CONSTRAINT staff_payroll_profile_pkey PRIMARY KEY (id);


--
-- Name: staff_payroll_profile staff_payroll_profile_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payroll_profile
    ADD CONSTRAINT staff_payroll_profile_staff_id_key UNIQUE (staff_id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_rfid_cards staff_rfid_cards_card_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_rfid_cards
    ADD CONSTRAINT staff_rfid_cards_card_uid_key UNIQUE (card_uid);


--
-- Name: staff_rfid_cards staff_rfid_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_rfid_cards
    ADD CONSTRAINT staff_rfid_cards_pkey PRIMARY KEY (id);


--
-- Name: student_discounts student_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discounts
    ADD CONSTRAINT student_discounts_pkey PRIMARY KEY (id);


--
-- Name: student_discounts student_discounts_student_id_discount_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discounts
    ADD CONSTRAINT student_discounts_student_id_discount_type_id_key UNIQUE (student_id, discount_type_id);


--
-- Name: students students_enrollment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_enrollment_no_key UNIQUE (enrollment_no);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: study_materials study_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_materials
    ADD CONSTRAINT study_materials_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_code_key UNIQUE (code);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: syllabus_attachments syllabus_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_attachments
    ADD CONSTRAINT syllabus_attachments_pkey PRIMARY KEY (id);


--
-- Name: syllabus syllabus_class_id_subject_id_academic_year_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus
    ADD CONSTRAINT syllabus_class_id_subject_id_academic_year_id_key UNIQUE (class_id, subject_id, academic_year_id);


--
-- Name: syllabus syllabus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus
    ADD CONSTRAINT syllabus_pkey PRIMARY KEY (id);


--
-- Name: syllabus_progress syllabus_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_progress
    ADD CONSTRAINT syllabus_progress_pkey PRIMARY KEY (id);


--
-- Name: syllabus_progress syllabus_progress_topic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_progress
    ADD CONSTRAINT syllabus_progress_topic_id_key UNIQUE (topic_id);


--
-- Name: syllabus_topics syllabus_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_cat_key_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_cat_key_uniq UNIQUE (category, key);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: teacher_subjects teacher_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_pkey PRIMARY KEY (teacher_id, subject_id);


--
-- Name: teachers teachers_employee_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_employee_no_key UNIQUE (employee_no);


--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- Name: timetable timetable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: user_signatures user_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_pkey PRIMARY KEY (id);


--
-- Name: user_signatures user_signatures_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendor_invoice_items vendor_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_items
    ADD CONSTRAINT vendor_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: vendor_invoice_payments vendor_invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_payments
    ADD CONSTRAINT vendor_invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: vendor_invoices vendor_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_activity_log withdrawal_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_activity_log
    ADD CONSTRAINT withdrawal_activity_log_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_clearances withdrawal_clearances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_clearances
    ADD CONSTRAINT withdrawal_clearances_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_clearances withdrawal_clearances_request_id_department_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_clearances
    ADD CONSTRAINT withdrawal_clearances_request_id_department_key UNIQUE (request_id, department);


--
-- Name: withdrawal_conduct withdrawal_conduct_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_conduct
    ADD CONSTRAINT withdrawal_conduct_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_config withdrawal_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_config
    ADD CONSTRAINT withdrawal_config_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_documents withdrawal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_documents
    ADD CONSTRAINT withdrawal_documents_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_waivers withdrawal_waivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers
    ADD CONSTRAINT withdrawal_waivers_pkey PRIMARY KEY (id);


--
-- Name: work_queue_items work_queue_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_queue_items
    ADD CONSTRAINT work_queue_items_pkey PRIMARY KEY (id);


--
-- Name: workflow_assignment_conditions workflow_assignment_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_assignment_conditions
    ADD CONSTRAINT workflow_assignment_conditions_pkey PRIMARY KEY (id);


--
-- Name: workflow_assignments workflow_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_assignments
    ADD CONSTRAINT workflow_assignments_pkey PRIMARY KEY (id);


--
-- Name: workflow_condition_fields workflow_condition_fields_module_entity_type_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_condition_fields
    ADD CONSTRAINT workflow_condition_fields_module_entity_type_field_key_key UNIQUE (module, entity_type, field_key);


--
-- Name: workflow_condition_fields workflow_condition_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_condition_fields
    ADD CONSTRAINT workflow_condition_fields_pkey PRIMARY KEY (id);


--
-- Name: workflow_conditions workflow_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_conditions
    ADD CONSTRAINT workflow_conditions_pkey PRIMARY KEY (id);


--
-- Name: workflow_definitions workflow_definitions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_code_key UNIQUE (code);


--
-- Name: workflow_definitions workflow_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_instances workflow_instances_module_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_module_entity_type_entity_id_key UNIQUE (module, entity_type, entity_id);


--
-- Name: workflow_instances workflow_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_pkey PRIMARY KEY (id);


--
-- Name: workflow_module_links workflow_module_links_module_entity_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_module_links
    ADD CONSTRAINT workflow_module_links_module_entity_type_key UNIQUE (module, entity_type);


--
-- Name: workflow_module_links workflow_module_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_module_links
    ADD CONSTRAINT workflow_module_links_pkey PRIMARY KEY (id);


--
-- Name: workflow_step_instances workflow_step_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances
    ADD CONSTRAINT workflow_step_instances_pkey PRIMARY KEY (id);


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: wq_status_colors wq_status_colors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wq_status_colors
    ADD CONSTRAINT wq_status_colors_pkey PRIMARY KEY (id);


--
-- Name: wq_status_colors wq_status_colors_status_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wq_status_colors
    ADD CONSTRAINT wq_status_colors_status_key_key UNIQUE (status_key);


--
-- Name: idx_ann_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ann_active ON public.announcements USING btree (is_active, start_date);


--
-- Name: idx_ann_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ann_class ON public.announcements USING btree (target_class);


--
-- Name: idx_ann_reads_ann; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ann_reads_ann ON public.announcement_reads USING btree (announcement_id);


--
-- Name: idx_ann_reads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ann_reads_user ON public.announcement_reads USING btree (user_id);


--
-- Name: idx_ann_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ann_role ON public.announcements USING btree (target_role);


--
-- Name: idx_ann_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ann_type ON public.announcements USING btree (ann_type);


--
-- Name: idx_approval_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_rules_active ON public.procurement_approval_rules USING btree (is_active);


--
-- Name: idx_approval_steps_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_steps_rule ON public.procurement_approval_steps USING btree (rule_id);


--
-- Name: idx_assign_sub_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assign_sub_student ON public.assignment_submissions USING btree (student_id);


--
-- Name: idx_assignments_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_class ON public.assignments USING btree (class_id);


--
-- Name: idx_assignments_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_subject ON public.assignments USING btree (subject_id);


--
-- Name: idx_assignments_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_teacher ON public.assignments USING btree (teacher_id);


--
-- Name: idx_attendance_class_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_class_date ON public.attendance USING btree (class_id, date);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (date);


--
-- Name: idx_attendance_sessions_staff_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_sessions_staff_date ON public.staff_attendance_sessions USING btree (staff_id, clock_in_at);


--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id);


--
-- Name: idx_attendance_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_attendance_unique ON public.attendance USING btree (student_id, date, COALESCE(subject_id, 0));


--
-- Name: idx_audit_items_audit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_items_audit ON public.library_inventory_audit_items USING btree (audit_id);


--
-- Name: idx_audit_log_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_table ON public.audit_log USING btree (table_name, changed_at);


--
-- Name: idx_calendar_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_date ON public.calendar_events USING btree (event_date);


--
-- Name: idx_calendar_holiday; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_holiday ON public.calendar_events USING btree (is_holiday) WHERE (is_holiday = true);


--
-- Name: idx_calendar_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_type ON public.calendar_events USING btree (event_type);


--
-- Name: idx_class_subjects_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_subjects_class ON public.class_subjects USING btree (class_id);


--
-- Name: idx_class_teachers_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_teachers_class ON public.class_teachers USING btree (class_id);


--
-- Name: idx_class_teachers_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_teachers_teacher ON public.class_teachers USING btree (teacher_id);


--
-- Name: idx_diary_class_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diary_class_date ON public.daily_diary USING btree (class_id, date);


--
-- Name: idx_diary_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diary_teacher ON public.daily_diary USING btree (teacher_id);


--
-- Name: idx_discipline_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discipline_status ON public.discipline_cases USING btree (status);


--
-- Name: idx_discipline_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discipline_student ON public.discipline_cases USING btree (student_id);


--
-- Name: idx_exam_marks_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_marks_exam ON public.exam_marks USING btree (exam_id);


--
-- Name: idx_exam_marks_stu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_marks_stu ON public.exam_marks USING btree (student_id);


--
-- Name: idx_exam_results; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_results ON public.exam_results USING btree (exam_id);


--
-- Name: idx_exams_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_class ON public.exams USING btree (class_id);


--
-- Name: idx_exams_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_year ON public.exams USING btree (academic_year_id);


--
-- Name: idx_fee_invoices_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_invoices_due ON public.fee_invoices USING btree (due_date) WHERE ((status)::text <> 'paid'::text);


--
-- Name: idx_fee_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_invoices_status ON public.fee_invoices USING btree (status);


--
-- Name: idx_fee_invoices_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_invoices_student ON public.fee_invoices USING btree (student_id);


--
-- Name: idx_grades_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grades_exam ON public.grades USING btree (exam_id);


--
-- Name: idx_grades_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grades_student ON public.grades USING btree (student_id);


--
-- Name: idx_hearing_committee_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hearing_committee_case ON public.hearing_committee USING btree (case_id);


--
-- Name: idx_hearing_committee_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hearing_committee_teacher ON public.hearing_committee USING btree (teacher_id);


--
-- Name: idx_hearing_remarks_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hearing_remarks_case ON public.hearing_member_remarks USING btree (case_id);


--
-- Name: idx_invoice_student_month; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoice_student_month ON public.fee_invoices USING btree (student_id, month_year) WHERE (month_year IS NOT NULL);


--
-- Name: idx_leave_approval_rules_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_approval_rules_type ON public.leave_approval_rules USING btree (leave_type_id);


--
-- Name: idx_leave_balances_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_balances_student ON public.leave_balances USING btree (student_id);


--
-- Name: idx_leave_requests_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_dates ON public.leave_requests USING btree (from_date, to_date);


--
-- Name: idx_leave_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_status ON public.leave_requests USING btree (status);


--
-- Name: idx_leave_requests_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_student ON public.leave_requests USING btree (student_id);


--
-- Name: idx_lib_issues_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lib_issues_status ON public.library_issues USING btree (status);


--
-- Name: idx_lib_issues_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lib_issues_student ON public.library_issues USING btree (student_id);


--
-- Name: idx_library_book_copies_book_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_book_copies_book_id ON public.library_book_copies USING btree (book_id);


--
-- Name: idx_library_book_copies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_book_copies_status ON public.library_book_copies USING btree (status);


--
-- Name: idx_library_books_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_books_author ON public.library_books USING btree (author_id);


--
-- Name: idx_library_books_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_books_category ON public.library_books USING btree (category_id);


--
-- Name: idx_library_books_isbn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_books_isbn ON public.library_books USING btree (isbn);


--
-- Name: idx_library_issue_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_issue_copy ON public.library_issue_transactions USING btree (copy_id);


--
-- Name: idx_library_issue_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_issue_member ON public.library_issue_transactions USING btree (member_id);


--
-- Name: idx_library_issue_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_issue_open ON public.library_issue_transactions USING btree (returned_at) WHERE (returned_at IS NULL);


--
-- Name: idx_library_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_members_user ON public.library_members USING btree (user_id);


--
-- Name: idx_library_reservations_book; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_reservations_book ON public.library_reservations USING btree (book_id) WHERE ((status)::text = 'waiting'::text);


--
-- Name: idx_materials_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_class ON public.study_materials USING btree (class_id);


--
-- Name: idx_materials_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_subject ON public.study_materials USING btree (subject_id);


--
-- Name: idx_messages_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_receiver ON public.messages USING btree (receiver_id, is_read);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_po_items_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_items_po ON public.po_items USING btree (po_id);


--
-- Name: idx_po_pr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_pr ON public.purchase_orders USING btree (pr_id);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_pr_approval_pr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pr_approval_pr ON public.pr_approval_instances USING btree (pr_id);


--
-- Name: idx_pr_items_pr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pr_items_pr ON public.pr_items USING btree (pr_id);


--
-- Name: idx_pr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pr_status ON public.purchase_requisitions USING btree (status);


--
-- Name: idx_procurement_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procurement_items_category ON public.procurement_items USING btree (category_id);


--
-- Name: idx_procurement_vendors_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_procurement_vendors_category ON public.procurement_vendors USING btree (category_id);


--
-- Name: idx_quiz_sub_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_sub_student ON public.quiz_submissions USING btree (student_id);


--
-- Name: idx_quizzes_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_class ON public.quizzes USING btree (class_id);


--
-- Name: idx_quizzes_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_teacher ON public.quizzes USING btree (teacher_id);


--
-- Name: idx_student_discounts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_discounts_student ON public.student_discounts USING btree (student_id);


--
-- Name: idx_students_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_class_id ON public.students USING btree (class_id);


--
-- Name: idx_students_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_user_id ON public.students USING btree (user_id);


--
-- Name: idx_syllabus_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_class ON public.syllabus USING btree (class_id);


--
-- Name: idx_syllabus_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_progress ON public.syllabus_progress USING btree (topic_id);


--
-- Name: idx_syllabus_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_subject ON public.syllabus USING btree (subject_id);


--
-- Name: idx_syllabus_topics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_topics ON public.syllabus_topics USING btree (syllabus_id);


--
-- Name: idx_syllabus_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_year ON public.syllabus USING btree (academic_year_id);


--
-- Name: idx_teachers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teachers_user_id ON public.teachers USING btree (user_id);


--
-- Name: idx_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_active ON public.users USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_wal_withdrawal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wal_withdrawal ON public.withdrawal_activity_log USING btree (withdrawal_id);


--
-- Name: idx_wf_assign_cond; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_assign_cond ON public.workflow_assignment_conditions USING btree (assignment_id);


--
-- Name: idx_wf_assign_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_assign_module ON public.workflow_assignments USING btree (module, entity_type, is_active);


--
-- Name: idx_wf_def_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_def_module ON public.workflow_definitions USING btree (module, entity_type, is_active);


--
-- Name: idx_wf_inst_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_entity ON public.workflow_instances USING btree (module, entity_type, entity_id);


--
-- Name: idx_wf_inst_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_status ON public.workflow_instances USING btree (status);


--
-- Name: idx_wf_step_inst_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_step_inst_status ON public.workflow_step_instances USING btree (instance_id, status);


--
-- Name: idx_withdrawal_clearance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawal_clearance ON public.withdrawal_clearances USING btree (request_id);


--
-- Name: idx_withdrawal_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawal_status ON public.withdrawal_requests USING btree (status);


--
-- Name: idx_withdrawal_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawal_student ON public.withdrawal_requests USING btree (student_id);


--
-- Name: idx_wq_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wq_created ON public.work_queue_items USING btree (created_at DESC);


--
-- Name: idx_wq_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wq_entity ON public.work_queue_items USING btree (module, entity_id, status);


--
-- Name: idx_wq_role_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wq_role_status ON public.work_queue_items USING btree (assigned_role, status);


--
-- Name: idx_wq_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wq_user_status ON public.work_queue_items USING btree (assigned_user_id, status);


--
-- Name: uq_attendance_student_date_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_attendance_student_date_subject ON public.attendance USING btree (student_id, class_id, date, COALESCE(subject_id, 0));


--
-- Name: vw_library_books _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.vw_library_books AS
 SELECT b.id,
    b.isbn,
    b.title,
    b.subtitle,
    b.edition,
    b.publication_year,
    b.language,
    b.shelf,
    b.rack,
    b.description,
    b.cover_image,
    b.is_active,
    a.id AS author_id,
    a.name AS author_name,
    p.id AS publisher_id,
    p.name AS publisher_name,
    c.id AS category_id,
    c.name AS category_name,
    count(bc.id) FILTER (WHERE ((bc.status)::text <> 'removed'::text)) AS total_copies,
    count(bc.id) FILTER (WHERE ((bc.status)::text = 'available'::text)) AS available_copies,
    count(bc.id) FILTER (WHERE ((bc.status)::text = 'issued'::text)) AS issued_copies,
    count(bc.id) FILTER (WHERE ((bc.status)::text = 'lost'::text)) AS lost_copies,
    count(bc.id) FILTER (WHERE ((bc.status)::text = 'damaged'::text)) AS damaged_copies
   FROM ((((public.library_books b
     LEFT JOIN public.library_authors a ON ((a.id = b.author_id)))
     LEFT JOIN public.library_publishers p ON ((p.id = b.publisher_id)))
     LEFT JOIN public.library_categories c ON ((c.id = b.category_id)))
     LEFT JOIN public.library_book_copies bc ON ((bc.book_id = b.id)))
  GROUP BY b.id, a.id, a.name, p.id, p.name, c.id, c.name;


--
-- Name: vw_library_members _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.vw_library_members AS
 SELECT lm.id AS member_id,
    lm.user_id,
    lm.member_type,
    lm.library_card_no,
    lm.status,
    lm.joined_date,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
        CASE
            WHEN ((lm.member_type)::text = 'staff'::text) THEN COALESCE(( SELECT r.name
               FROM (public.user_roles ur
                 JOIN public.roles r ON ((r.id = ur.role_id)))
              WHERE (ur.user_id = u.id)
             LIMIT 1), 'staff'::character varying)
            ELSE lm.member_type
        END AS display_role,
    mr.max_books,
    mr.borrow_days,
    mr.renewal_limit,
    mr.fine_per_day,
    count(it.id) FILTER (WHERE (it.returned_at IS NULL)) AS books_currently_issued,
    COALESCE(sum(it.fine_amount) FILTER (WHERE ((it.fine_status)::text = 'pending'::text)), (0)::numeric) AS pending_fine
   FROM (((public.library_members lm
     JOIN public.users u ON ((u.id = lm.user_id)))
     LEFT JOIN public.library_membership_rules mr ON (((mr.member_type)::text = (lm.member_type)::text)))
     LEFT JOIN public.library_issue_transactions it ON ((it.member_id = lm.id)))
  GROUP BY lm.id, u.id, u.first_name, u.last_name, u.email, u.phone, mr.max_books, mr.borrow_days, mr.renewal_limit, mr.fine_per_day;


--
-- Name: assignments trg_announce_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_announce_assignment AFTER INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.fn_announce_assignment();


--
-- Name: exams trg_announce_exam; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_announce_exam AFTER INSERT ON public.exams FOR EACH ROW EXECUTE FUNCTION public.fn_announce_exam();


--
-- Name: calendar_events trg_announce_holiday; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_announce_holiday AFTER INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.fn_announce_holiday();


--
-- Name: quizzes trg_announce_quiz; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_announce_quiz AFTER INSERT ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.fn_announce_quiz();


--
-- Name: fee_invoices trg_audit_fee_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fee_invoices AFTER INSERT OR DELETE OR UPDATE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();


--
-- Name: payments trg_audit_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_payments AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();


--
-- Name: students trg_audit_students; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();


--
-- Name: users trg_audit_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();


--
-- Name: library_issue_transactions trg_issue_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_issue_insert AFTER INSERT ON public.library_issue_transactions FOR EACH ROW EXECUTE FUNCTION public.trg_fn_issue_sets_copy_status();


--
-- Name: library_issue_transactions trg_issue_return; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_issue_return AFTER UPDATE ON public.library_issue_transactions FOR EACH ROW EXECUTE FUNCTION public.trg_fn_return_sets_copy_status();


--
-- Name: library_book_copies trg_prevent_delete_issued_copy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_delete_issued_copy BEFORE DELETE ON public.library_book_copies FOR EACH ROW EXECUTE FUNCTION public.trg_fn_prevent_delete_issued_copy();


--
-- Name: announcement_reads announcement_reads_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_reads announcement_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: announcements announcements_target_class_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_target_class_fkey FOREIGN KEY (target_class) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: assignment_submissions assignment_submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--
-- Name: assignment_submissions assignment_submissions_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id);


--
-- Name: assignment_submissions assignment_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: assignments assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id);


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: attendance attendance_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: attendance attendance_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: calendar_events calendar_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: class_fee_config class_fee_config_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fee_config
    ADD CONSTRAINT class_fee_config_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;


--
-- Name: class_fee_config class_fee_config_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fee_config
    ADD CONSTRAINT class_fee_config_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_fees class_fees_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fees
    ADD CONSTRAINT class_fees_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;


--
-- Name: class_fees class_fees_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fees
    ADD CONSTRAINT class_fees_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_fees class_fees_fee_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_fees
    ADD CONSTRAINT class_fees_fee_type_id_fkey FOREIGN KEY (fee_type_id) REFERENCES public.fee_types(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: class_subjects class_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: class_teachers class_teachers_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_teachers class_teachers_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: classes classes_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: daily_diary daily_diary_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_diary
    ADD CONSTRAINT daily_diary_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: daily_diary daily_diary_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_diary
    ADD CONSTRAINT daily_diary_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: daily_diary daily_diary_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_diary
    ADD CONSTRAINT daily_diary_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: department_attendance_schedules department_attendance_schedules_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_attendance_schedules
    ADD CONSTRAINT department_attendance_schedules_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: department_roles department_roles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_roles
    ADD CONSTRAINT department_roles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: department_roles department_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_roles
    ADD CONSTRAINT department_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: departments departments_head_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_head_user_id_fkey FOREIGN KEY (head_user_id) REFERENCES public.users(id);


--
-- Name: departments departments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: designations designations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: diary_publish diary_publish_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_publish
    ADD CONSTRAINT diary_publish_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: diary_publish diary_publish_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_publish
    ADD CONSTRAINT diary_publish_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.teachers(id);


--
-- Name: discipline_appeals discipline_appeals_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_appeals
    ADD CONSTRAINT discipline_appeals_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.discipline_cases(id) ON DELETE CASCADE;


--
-- Name: discipline_appeals discipline_appeals_response_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_appeals
    ADD CONSTRAINT discipline_appeals_response_by_fkey FOREIGN KEY (response_by) REFERENCES public.users(id);


--
-- Name: discipline_appeals discipline_appeals_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_appeals
    ADD CONSTRAINT discipline_appeals_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: discipline_cases discipline_cases_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_cases
    ADD CONSTRAINT discipline_cases_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES public.users(id);


--
-- Name: discipline_cases discipline_cases_principal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_cases
    ADD CONSTRAINT discipline_cases_principal_id_fkey FOREIGN KEY (principal_id) REFERENCES public.users(id);


--
-- Name: discipline_cases discipline_cases_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_cases
    ADD CONSTRAINT discipline_cases_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(id);


--
-- Name: discipline_cases discipline_cases_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_cases
    ADD CONSTRAINT discipline_cases_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: discipline_config discipline_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_config
    ADD CONSTRAINT discipline_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: discipline_evidence discipline_evidence_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_evidence
    ADD CONSTRAINT discipline_evidence_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.discipline_cases(id) ON DELETE CASCADE;


--
-- Name: discipline_evidence discipline_evidence_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_evidence
    ADD CONSTRAINT discipline_evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: discipline_hearings discipline_hearings_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_hearings
    ADD CONSTRAINT discipline_hearings_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.discipline_cases(id) ON DELETE CASCADE;


--
-- Name: discipline_hearings discipline_hearings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_hearings
    ADD CONSTRAINT discipline_hearings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: discount_apply_fee_types discount_apply_fee_types_fee_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_apply_fee_types
    ADD CONSTRAINT discount_apply_fee_types_fee_type_id_fkey FOREIGN KEY (fee_type_id) REFERENCES public.fee_types(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: exam_classes exam_classes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_classes
    ADD CONSTRAINT exam_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: exam_classes exam_classes_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_classes
    ADD CONSTRAINT exam_classes_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_config exam_config_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_config
    ADD CONSTRAINT exam_config_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: exam_config exam_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_config
    ADD CONSTRAINT exam_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: exam_marks exam_marks_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: exam_marks exam_marks_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.users(id);


--
-- Name: exam_marks exam_marks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_exam_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_exam_subject_id_fkey FOREIGN KEY (exam_subject_id) REFERENCES public.exam_subjects(id) ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: exam_marks exam_marks_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: exam_results exam_results_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: exam_results exam_results_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_results exam_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: exam_schedule exam_schedule_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_schedule
    ADD CONSTRAINT exam_schedule_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_schedule exam_schedule_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_schedule
    ADD CONSTRAINT exam_schedule_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: exam_subjects exam_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: exam_subjects exam_subjects_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_subjects exam_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: exam_subjects exam_subjects_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: exam_subjects exam_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: exams exams_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: exams exams_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: exams exams_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: exams exams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: exams exams_datesheet_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_datesheet_approved_by_fkey FOREIGN KEY (datesheet_approved_by) REFERENCES public.users(id);


--
-- Name: exams exams_datesheet_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_datesheet_published_by_fkey FOREIGN KEY (datesheet_published_by) REFERENCES public.users(id);


--
-- Name: exams exams_exam_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_exam_type_id_fkey FOREIGN KEY (exam_type_id) REFERENCES public.exam_types(id);


--
-- Name: exams exams_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id);


--
-- Name: fee_charge_classes fee_charge_classes_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_classes
    ADD CONSTRAINT fee_charge_classes_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES public.fee_charges(id) ON DELETE CASCADE;


--
-- Name: fee_charge_classes fee_charge_classes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_classes
    ADD CONSTRAINT fee_charge_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: fee_charge_students fee_charge_students_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_students
    ADD CONSTRAINT fee_charge_students_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES public.fee_charges(id) ON DELETE CASCADE;


--
-- Name: fee_charge_students fee_charge_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charge_students
    ADD CONSTRAINT fee_charge_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: fee_charges fee_charges_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: fee_charges fee_charges_charge_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_charge_type_id_fkey FOREIGN KEY (charge_type_id) REFERENCES public.charge_type_definitions(id);


--
-- Name: fee_invoice_items fee_invoice_items_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_items
    ADD CONSTRAINT fee_invoice_items_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES public.fee_charges(id);


--
-- Name: fee_invoice_items fee_invoice_items_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_items
    ADD CONSTRAINT fee_invoice_items_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.student_discounts(id);


--
-- Name: fee_invoice_items fee_invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_items
    ADD CONSTRAINT fee_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.fee_invoices(id) ON DELETE CASCADE;


--
-- Name: fee_invoice_items fee_invoice_items_waived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_items
    ADD CONSTRAINT fee_invoice_items_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES public.users(id);


--
-- Name: fee_invoices fee_invoices_fee_structure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_fee_structure_id_fkey FOREIGN KEY (fee_structure_id) REFERENCES public.fee_structures(id);


--
-- Name: fee_invoices fee_invoices_for_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_for_class_id_fkey FOREIGN KEY (for_class_id) REFERENCES public.classes(id);


--
-- Name: fee_invoices fee_invoices_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id);


--
-- Name: fee_invoices fee_invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: fee_invoices fee_invoices_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.fee_invoices(id);


--
-- Name: fee_structures fee_structures_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: fee_structures fee_structures_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: fee_structures fee_structures_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: fee_structures fee_structures_fee_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES public.fee_categories(id);


--
-- Name: goods_receipt_notes goods_receipt_notes_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);


--
-- Name: goods_receipt_notes goods_receipt_notes_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);


--
-- Name: goods_receipt_notes goods_receipt_notes_stock_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_stock_updated_by_fkey FOREIGN KEY (stock_updated_by) REFERENCES public.users(id);


--
-- Name: grades grades_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id);


--
-- Name: grades grades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: grades grades_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: grn_items grn_items_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE;


--
-- Name: grn_items grn_items_po_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_po_item_id_fkey FOREIGN KEY (po_item_id) REFERENCES public.po_items(id);


--
-- Name: hearing_appearance hearing_appearance_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_appearance
    ADD CONSTRAINT hearing_appearance_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.discipline_cases(id) ON DELETE CASCADE;


--
-- Name: hearing_appearance hearing_appearance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_appearance
    ADD CONSTRAINT hearing_appearance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: hearing_committee hearing_committee_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_committee
    ADD CONSTRAINT hearing_committee_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.discipline_cases(id) ON DELETE CASCADE;


--
-- Name: hearing_committee hearing_committee_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_committee
    ADD CONSTRAINT hearing_committee_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: hearing_member_remarks hearing_member_remarks_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_member_remarks
    ADD CONSTRAINT hearing_member_remarks_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.discipline_cases(id) ON DELETE CASCADE;


--
-- Name: hearing_member_remarks hearing_member_remarks_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearing_member_remarks
    ADD CONSTRAINT hearing_member_remarks_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: leave_approval_rules leave_approval_rules_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approval_rules
    ADD CONSTRAINT leave_approval_rules_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON DELETE CASCADE;


--
-- Name: leave_balances leave_balances_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: leave_balances leave_balances_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id);


--
-- Name: leave_balances leave_balances_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.users(id);


--
-- Name: leave_requests leave_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: leave_requests leave_requests_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id);


--
-- Name: leave_requests leave_requests_recommended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_recommended_by_fkey FOREIGN KEY (recommended_by) REFERENCES public.users(id);


--
-- Name: leave_requests leave_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: leave_validation_rules leave_validation_rules_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_validation_rules
    ADD CONSTRAINT leave_validation_rules_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON DELETE CASCADE;


--
-- Name: library_book_copies library_book_copies_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_book_copies
    ADD CONSTRAINT library_book_copies_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.library_books(id) ON DELETE CASCADE;


--
-- Name: library_books library_books_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_books
    ADD CONSTRAINT library_books_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.library_authors(id);


--
-- Name: library_books library_books_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_books
    ADD CONSTRAINT library_books_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.library_categories(id);


--
-- Name: library_books library_books_publisher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_books
    ADD CONSTRAINT library_books_publisher_id_fkey FOREIGN KEY (publisher_id) REFERENCES public.library_publishers(id);


--
-- Name: library_categories library_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_categories
    ADD CONSTRAINT library_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.library_categories(id);


--
-- Name: library_fine_payments library_fine_payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_fine_payments
    ADD CONSTRAINT library_fine_payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);


--
-- Name: library_fine_payments library_fine_payments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_fine_payments
    ADD CONSTRAINT library_fine_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.library_issue_transactions(id);


--
-- Name: library_fine_payments library_fine_payments_waived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_fine_payments
    ADD CONSTRAINT library_fine_payments_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES public.users(id);


--
-- Name: library_inventory_audit_items library_inventory_audit_items_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audit_items
    ADD CONSTRAINT library_inventory_audit_items_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES public.library_inventory_audits(id) ON DELETE CASCADE;


--
-- Name: library_inventory_audit_items library_inventory_audit_items_copy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audit_items
    ADD CONSTRAINT library_inventory_audit_items_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.library_book_copies(id);


--
-- Name: library_inventory_audit_items library_inventory_audit_items_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audit_items
    ADD CONSTRAINT library_inventory_audit_items_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: library_inventory_audits library_inventory_audits_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_inventory_audits
    ADD CONSTRAINT library_inventory_audits_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.users(id);


--
-- Name: library_issue_transactions library_issue_transactions_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issue_transactions
    ADD CONSTRAINT library_issue_transactions_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id);


--
-- Name: library_issue_transactions library_issue_transactions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issue_transactions
    ADD CONSTRAINT library_issue_transactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.library_members(id);


--
-- Name: library_issue_transactions library_issue_transactions_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issue_transactions
    ADD CONSTRAINT library_issue_transactions_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);


--
-- Name: library_issues library_issues_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id);


--
-- Name: library_issues library_issues_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: library_members library_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_members
    ADD CONSTRAINT library_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: library_reservations library_reservations_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_reservations
    ADD CONSTRAINT library_reservations_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.library_members(id);


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.fee_invoices(id);


--
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);


--
-- Name: payments payments_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: payroll_adjustments payroll_adjustments_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.payroll_components(id);


--
-- Name: payroll_adjustments payroll_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payroll_adjustments payroll_adjustments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: payroll_grade_components payroll_grade_components_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_components
    ADD CONSTRAINT payroll_grade_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.payroll_components(id) ON DELETE CASCADE;


--
-- Name: payroll_grade_components payroll_grade_components_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_components
    ADD CONSTRAINT payroll_grade_components_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.payroll_grades(id) ON DELETE CASCADE;


--
-- Name: payroll_grade_department_components payroll_grade_department_components_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_department_components
    ADD CONSTRAINT payroll_grade_department_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.payroll_components(id) ON DELETE CASCADE;


--
-- Name: payroll_grade_department_components payroll_grade_department_components_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_department_components
    ADD CONSTRAINT payroll_grade_department_components_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: payroll_grade_department_components payroll_grade_department_components_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_grade_department_components
    ADD CONSTRAINT payroll_grade_department_components_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.payroll_grades(id) ON DELETE CASCADE;


--
-- Name: payroll_payslips payroll_payslips_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_payslips
    ADD CONSTRAINT payroll_payslips_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON DELETE CASCADE;


--
-- Name: payroll_payslips payroll_payslips_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_payslips
    ADD CONSTRAINT payroll_payslips_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: payroll_runs payroll_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payroll_runs payroll_runs_finalized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.users(id);


--
-- Name: payroll_tax_slabs payroll_tax_slabs_slab_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_tax_slabs
    ADD CONSTRAINT payroll_tax_slabs_slab_set_id_fkey FOREIGN KEY (slab_set_id) REFERENCES public.payroll_tax_slab_sets(id) ON DELETE CASCADE;


--
-- Name: po_items po_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT po_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: po_items po_items_pr_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT po_items_pr_item_id_fkey FOREIGN KEY (pr_item_id) REFERENCES public.pr_items(id);


--
-- Name: pr_approval_instances pr_approval_instances_acted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_approval_instances
    ADD CONSTRAINT pr_approval_instances_acted_by_fkey FOREIGN KEY (acted_by) REFERENCES public.users(id);


--
-- Name: pr_approval_instances pr_approval_instances_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_approval_instances
    ADD CONSTRAINT pr_approval_instances_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE;


--
-- Name: pr_approval_instances pr_approval_instances_resolved_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_approval_instances
    ADD CONSTRAINT pr_approval_instances_resolved_approver_id_fkey FOREIGN KEY (resolved_approver_id) REFERENCES public.users(id);


--
-- Name: pr_items pr_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_items
    ADD CONSTRAINT pr_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.procurement_item_categories(id);


--
-- Name: pr_items pr_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_items
    ADD CONSTRAINT pr_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.procurement_items(id);


--
-- Name: pr_items pr_items_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_items
    ADD CONSTRAINT pr_items_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE;


--
-- Name: procurement_approval_rules procurement_approval_rules_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_rules
    ADD CONSTRAINT procurement_approval_rules_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: procurement_approval_rules procurement_approval_rules_item_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_rules
    ADD CONSTRAINT procurement_approval_rules_item_category_id_fkey FOREIGN KEY (item_category_id) REFERENCES public.procurement_item_categories(id);


--
-- Name: procurement_approval_steps procurement_approval_steps_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_approval_steps
    ADD CONSTRAINT procurement_approval_steps_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.procurement_approval_rules(id) ON DELETE CASCADE;


--
-- Name: procurement_item_categories procurement_item_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_item_categories
    ADD CONSTRAINT procurement_item_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.procurement_item_categories(id);


--
-- Name: procurement_items procurement_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_items
    ADD CONSTRAINT procurement_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.procurement_item_categories(id);


--
-- Name: procurement_items procurement_items_preferred_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_items
    ADD CONSTRAINT procurement_items_preferred_vendor_id_fkey FOREIGN KEY (preferred_vendor_id) REFERENCES public.procurement_vendors(id);


--
-- Name: procurement_vendors procurement_vendors_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_vendors
    ADD CONSTRAINT procurement_vendors_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.procurement_vendor_categories(id);


--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: purchase_orders purchase_orders_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.purchase_requisitions(id);


--
-- Name: purchase_orders purchase_orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.procurement_vendors(id);


--
-- Name: purchase_requisitions purchase_requisitions_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: purchase_requisitions purchase_requisitions_matched_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_matched_rule_id_fkey FOREIGN KEY (matched_rule_id) REFERENCES public.procurement_approval_rules(id);


--
-- Name: purchase_requisitions purchase_requisitions_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: quiz_questions quiz_questions_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;


--
-- Name: quiz_submissions quiz_submissions_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_submissions
    ADD CONSTRAINT quiz_submissions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;


--
-- Name: quiz_submissions quiz_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_submissions
    ADD CONSTRAINT quiz_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: quizzes quizzes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: quizzes quizzes_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: quizzes quizzes_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: report_cards report_cards_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: report_cards report_cards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: result_components result_components_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_components
    ADD CONSTRAINT result_components_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: result_formula result_formula_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_formula
    ADD CONSTRAINT result_formula_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: result_formula result_formula_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_formula
    ADD CONSTRAINT result_formula_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: role_permissions role_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: staff_attendance_correction_requests staff_attendance_correction_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_correction_requests
    ADD CONSTRAINT staff_attendance_correction_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: staff_attendance_correction_requests staff_attendance_correction_requests_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_correction_requests
    ADD CONSTRAINT staff_attendance_correction_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.staff_attendance_sessions(id) ON DELETE SET NULL;


--
-- Name: staff_attendance_correction_requests staff_attendance_correction_requests_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_correction_requests
    ADD CONSTRAINT staff_attendance_correction_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_attendance_sessions staff_attendance_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_sessions
    ADD CONSTRAINT staff_attendance_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: staff_attendance_sessions staff_attendance_sessions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance_sessions
    ADD CONSTRAINT staff_attendance_sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: staff_daily_attendance_status staff_daily_attendance_status_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_daily_attendance_status
    ADD CONSTRAINT staff_daily_attendance_status_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: staff_designation_grades staff_designation_grades_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_designation_grades
    ADD CONSTRAINT staff_designation_grades_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designations(id) ON DELETE CASCADE;


--
-- Name: staff_designation_grades staff_designation_grades_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_designation_grades
    ADD CONSTRAINT staff_designation_grades_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.payroll_grades(id) ON DELETE CASCADE;


--
-- Name: staff staff_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designations(id);


--
-- Name: staff_documents staff_documents_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: staff_education staff_education_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_education
    ADD CONSTRAINT staff_education_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_emergency_contacts staff_emergency_contacts_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_emergency_contacts
    ADD CONSTRAINT staff_emergency_contacts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_employment_history staff_employment_history_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_employment_history
    ADD CONSTRAINT staff_employment_history_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_experience staff_experience_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_experience
    ADD CONSTRAINT staff_experience_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_leave_balances staff_leave_balances_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_balances
    ADD CONSTRAINT staff_leave_balances_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON DELETE CASCADE;


--
-- Name: staff_leave_balances staff_leave_balances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_balances
    ADD CONSTRAINT staff_leave_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: staff_leave_policies staff_leave_policies_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_policies
    ADD CONSTRAINT staff_leave_policies_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: staff_leave_policies staff_leave_policies_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_policies
    ADD CONSTRAINT staff_leave_policies_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON DELETE CASCADE;


--
-- Name: staff_leave_policies staff_leave_policies_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_policies
    ADD CONSTRAINT staff_leave_policies_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: staff_leave_requests staff_leave_requests_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id);


--
-- Name: staff_leave_requests staff_leave_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: staff_leave_requests staff_leave_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: staff_leave_rules staff_leave_rules_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_rules
    ADD CONSTRAINT staff_leave_rules_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON DELETE CASCADE;


--
-- Name: staff_payroll_profile staff_payroll_profile_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payroll_profile
    ADD CONSTRAINT staff_payroll_profile_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.payroll_grades(id);


--
-- Name: staff_payroll_profile staff_payroll_profile_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payroll_profile
    ADD CONSTRAINT staff_payroll_profile_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_rfid_cards staff_rfid_cards_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_rfid_cards
    ADD CONSTRAINT staff_rfid_cards_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: student_discounts student_discounts_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discounts
    ADD CONSTRAINT student_discounts_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: student_discounts student_discounts_discount_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discounts
    ADD CONSTRAINT student_discounts_discount_type_id_fkey FOREIGN KEY (discount_type_id) REFERENCES public.discount_types(id);


--
-- Name: student_discounts student_discounts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discounts
    ADD CONSTRAINT student_discounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: students students_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id);


--
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: study_materials study_materials_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_materials
    ADD CONSTRAINT study_materials_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: study_materials study_materials_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_materials
    ADD CONSTRAINT study_materials_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: study_materials study_materials_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_materials
    ADD CONSTRAINT study_materials_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: syllabus syllabus_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus
    ADD CONSTRAINT syllabus_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;


--
-- Name: syllabus_attachments syllabus_attachments_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_attachments
    ADD CONSTRAINT syllabus_attachments_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.syllabus_topics(id) ON DELETE CASCADE;


--
-- Name: syllabus syllabus_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus
    ADD CONSTRAINT syllabus_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: syllabus syllabus_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus
    ADD CONSTRAINT syllabus_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: syllabus_progress syllabus_progress_covered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_progress
    ADD CONSTRAINT syllabus_progress_covered_by_fkey FOREIGN KEY (covered_by) REFERENCES public.users(id);


--
-- Name: syllabus_progress syllabus_progress_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_progress
    ADD CONSTRAINT syllabus_progress_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.syllabus_topics(id) ON DELETE CASCADE;


--
-- Name: syllabus syllabus_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus
    ADD CONSTRAINT syllabus_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: syllabus_topics syllabus_topics_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.syllabus_topics(id) ON DELETE CASCADE;


--
-- Name: syllabus_topics syllabus_topics_syllabus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_syllabus_id_fkey FOREIGN KEY (syllabus_id) REFERENCES public.syllabus(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: teacher_subjects teacher_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: teacher_subjects teacher_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teachers teachers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: timetable timetable_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: timetable timetable_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: timetable timetable_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_signatures user_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vendor_invoice_items vendor_invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_items
    ADD CONSTRAINT vendor_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.vendor_invoices(id) ON DELETE CASCADE;


--
-- Name: vendor_invoice_items vendor_invoice_items_po_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_items
    ADD CONSTRAINT vendor_invoice_items_po_item_id_fkey FOREIGN KEY (po_item_id) REFERENCES public.po_items(id);


--
-- Name: vendor_invoice_payments vendor_invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_payments
    ADD CONSTRAINT vendor_invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.vendor_invoices(id);


--
-- Name: vendor_invoice_payments vendor_invoice_payments_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoice_payments
    ADD CONSTRAINT vendor_invoice_payments_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.users(id);


--
-- Name: vendor_invoices vendor_invoices_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: vendor_invoices vendor_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: vendor_invoices vendor_invoices_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id);


--
-- Name: vendor_invoices vendor_invoices_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);


--
-- Name: vendor_invoices vendor_invoices_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.procurement_vendors(id);


--
-- Name: vendor_invoices vendor_invoices_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: withdrawal_activity_log withdrawal_activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_activity_log
    ADD CONSTRAINT withdrawal_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: withdrawal_activity_log withdrawal_activity_log_withdrawal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_activity_log
    ADD CONSTRAINT withdrawal_activity_log_withdrawal_id_fkey FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawal_requests(id);


--
-- Name: withdrawal_clearances withdrawal_clearances_cleared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_clearances
    ADD CONSTRAINT withdrawal_clearances_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES public.users(id);


--
-- Name: withdrawal_clearances withdrawal_clearances_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_clearances
    ADD CONSTRAINT withdrawal_clearances_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE;


--
-- Name: withdrawal_clearances withdrawal_clearances_waiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_clearances
    ADD CONSTRAINT withdrawal_clearances_waiver_id_fkey FOREIGN KEY (waiver_id) REFERENCES public.withdrawal_waivers(id);


--
-- Name: withdrawal_conduct withdrawal_conduct_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_conduct
    ADD CONSTRAINT withdrawal_conduct_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE;


--
-- Name: withdrawal_conduct withdrawal_conduct_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_conduct
    ADD CONSTRAINT withdrawal_conduct_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id);


--
-- Name: withdrawal_config withdrawal_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_config
    ADD CONSTRAINT withdrawal_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: withdrawal_documents withdrawal_documents_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_documents
    ADD CONSTRAINT withdrawal_documents_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE;


--
-- Name: withdrawal_documents withdrawal_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_documents
    ADD CONSTRAINT withdrawal_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: withdrawal_requests withdrawal_requests_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES public.users(id);


--
-- Name: withdrawal_requests withdrawal_requests_principal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_principal_id_fkey FOREIGN KEY (principal_id) REFERENCES public.users(id);


--
-- Name: withdrawal_requests withdrawal_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: withdrawal_requests withdrawal_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: withdrawal_requests withdrawal_requests_teacher_conduct_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_teacher_conduct_by_fkey FOREIGN KEY (teacher_conduct_by) REFERENCES public.users(id);


--
-- Name: withdrawal_waivers withdrawal_waivers_actioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers
    ADD CONSTRAINT withdrawal_waivers_actioned_by_fkey FOREIGN KEY (actioned_by) REFERENCES public.users(id);


--
-- Name: withdrawal_waivers withdrawal_waivers_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers
    ADD CONSTRAINT withdrawal_waivers_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.fee_invoices(id);


--
-- Name: withdrawal_waivers withdrawal_waivers_new_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers
    ADD CONSTRAINT withdrawal_waivers_new_invoice_id_fkey FOREIGN KEY (new_invoice_id) REFERENCES public.fee_invoices(id);


--
-- Name: withdrawal_waivers withdrawal_waivers_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers
    ADD CONSTRAINT withdrawal_waivers_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: withdrawal_waivers withdrawal_waivers_withdrawal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_waivers
    ADD CONSTRAINT withdrawal_waivers_withdrawal_id_fkey FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE;


--
-- Name: work_queue_items work_queue_items_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_queue_items
    ADD CONSTRAINT work_queue_items_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id);


--
-- Name: work_queue_items work_queue_items_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_queue_items
    ADD CONSTRAINT work_queue_items_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);


--
-- Name: work_queue_items work_queue_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_queue_items
    ADD CONSTRAINT work_queue_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: work_queue_items work_queue_items_submitter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_queue_items
    ADD CONSTRAINT work_queue_items_submitter_id_fkey FOREIGN KEY (submitter_id) REFERENCES public.users(id);


--
-- Name: workflow_assignment_conditions workflow_assignment_conditions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_assignment_conditions
    ADD CONSTRAINT workflow_assignment_conditions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.workflow_assignments(id) ON DELETE CASCADE;


--
-- Name: workflow_assignments workflow_assignments_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_assignments
    ADD CONSTRAINT workflow_assignments_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id);


--
-- Name: workflow_conditions workflow_conditions_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_conditions
    ADD CONSTRAINT workflow_conditions_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.workflow_steps(id) ON DELETE CASCADE;


--
-- Name: workflow_definitions workflow_definitions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: workflow_instances workflow_instances_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.users(id);


--
-- Name: workflow_instances workflow_instances_submitter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_submitter_id_fkey FOREIGN KEY (submitter_id) REFERENCES public.users(id);


--
-- Name: workflow_instances workflow_instances_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id);


--
-- Name: workflow_step_instances workflow_step_instances_actioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances
    ADD CONSTRAINT workflow_step_instances_actioned_by_fkey FOREIGN KEY (actioned_by) REFERENCES public.users(id);


--
-- Name: workflow_step_instances workflow_step_instances_assigned_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances
    ADD CONSTRAINT workflow_step_instances_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES public.users(id);


--
-- Name: workflow_step_instances workflow_step_instances_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances
    ADD CONSTRAINT workflow_step_instances_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.workflow_instances(id) ON DELETE CASCADE;


--
-- Name: workflow_step_instances workflow_step_instances_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances
    ADD CONSTRAINT workflow_step_instances_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.workflow_steps(id);


--
-- Name: workflow_step_instances workflow_step_instances_wq_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_instances
    ADD CONSTRAINT workflow_step_instances_wq_item_id_fkey FOREIGN KEY (wq_item_id) REFERENCES public.work_queue_items(id);


--
-- Name: workflow_steps workflow_steps_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id);


--
-- Name: workflow_steps workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict KtTNsyxyoeDFtdQu1DWSj5YLji4LagWghH2Smmrn7Yzh9rHd4fCuOy9tHUv50aJ

