-- ============================================================
-- sp_assign_role_permission  --  Superadmin grant/revoke
-- ============================================================
CREATE OR REPLACE PROCEDURE sp_assign_role_permission(
    p_role_id       INT,
    p_permission_id INT,
    p_action        VARCHAR(10),
    p_granted_by    INT
)
LANGUAGE plpgsql AS $$
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