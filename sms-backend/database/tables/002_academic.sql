-- Academic core tables
CREATE TABLE academic_years (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(20) NOT NULL,  -- '2024-2025'
    start_date DATE,
    end_date   DATE,
    is_active  BOOLEAN DEFAULT FALSE
);

CREATE TABLE classes (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(50) NOT NULL,
    academic_year_id INT REFERENCES academic_years(id),
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subjects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(20) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE students (
    id              SERIAL PRIMARY KEY,
    user_id         INT REFERENCES users(id),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    date_of_birth   DATE,
    gender          VARCHAR(10),
    enrollment_no   VARCHAR(50) UNIQUE,
    class_id        INT REFERENCES classes(id),
    parent_id       INT REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teachers (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES users(id),
    first_name   VARCHAR(100) NOT NULL,
    last_name    VARCHAR(100) NOT NULL,
    employee_no  VARCHAR(50) UNIQUE,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE timetable (
    id          SERIAL PRIMARY KEY,
    class_id    INT REFERENCES classes(id),
    subject_id  INT REFERENCES subjects(id),
    teacher_id  INT REFERENCES teachers(id),
    day_of_week SMALLINT,    -- 1=Mon … 7=Sun
    start_time  TIME,
    end_time    TIME
);
