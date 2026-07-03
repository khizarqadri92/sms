-- Audit log — populated by trigger, never by app code
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    operation  VARCHAR(10),   -- INSERT/UPDATE/DELETE
    old_data   JSONB,
    new_data   JSONB,
    user_id    INT,
    changed_at TIMESTAMP DEFAULT NOW()
);
