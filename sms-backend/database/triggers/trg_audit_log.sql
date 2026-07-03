-- Universal audit trigger — attach to any table
CREATE OR REPLACE FUNCTION fn_audit_log() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log(table_name, operation, old_data, new_data)
    VALUES(TG_TABLE_NAME, TG_OP,
           CASE WHEN TG_OP='DELETE' THEN row_to_json(OLD)::JSONB ELSE NULL END,
           CASE WHEN TG_OP<>'DELETE' THEN row_to_json(NEW)::JSONB ELSE NULL END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_students AFTER INSERT OR UPDATE OR DELETE ON students FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_grades   AFTER INSERT OR UPDATE OR DELETE ON grades   FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
