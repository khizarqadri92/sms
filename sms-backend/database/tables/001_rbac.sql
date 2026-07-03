-- RBAC core tables
-- roles, permissions, user_roles, role_permissions
-- Superadmin manages permissions via API — no code deploy needed.

CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,  -- 'superadmin','admin','teacher'...
    description TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE permissions (
    id   SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,  -- 'attendance.create', 'grades.edit'
    description TEXT
);

CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
