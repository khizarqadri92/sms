-- Attendance & Exams
CREATE TABLE attendance (
    id         SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    class_id   INT REFERENCES classes(id),
    date       DATE NOT NULL,
    status     VARCHAR(10) NOT NULL,  -- 'present','absent','late'
    marked_by  INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE exams (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    academic_year_id INT REFERENCES academic_years(id),
    start_date       DATE,
    end_date         DATE
);

CREATE TABLE grades (
    id         SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    exam_id    INT REFERENCES exams(id),
    subject_id INT REFERENCES subjects(id),
    marks      NUMERIC(5,2),
    grade      VARCHAR(5),
    remarks    TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
