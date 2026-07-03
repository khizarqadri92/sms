-- Finance tables
CREATE TABLE fee_structures (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100),
    academic_year_id INT REFERENCES academic_years(id),
    amount           NUMERIC(10,2),
    due_date         DATE
);

CREATE TABLE fee_invoices (
    id                SERIAL PRIMARY KEY,
    student_id        INT REFERENCES students(id),
    fee_structure_id  INT REFERENCES fee_structures(id),
    amount            NUMERIC(10,2),
    status            VARCHAR(20) DEFAULT 'unpaid',  -- unpaid/paid/overdue
    issued_at         TIMESTAMP DEFAULT NOW(),
    due_date          DATE
);

CREATE TABLE payments (
    id          SERIAL PRIMARY KEY,
    invoice_id  INT REFERENCES fee_invoices(id),
    amount_paid NUMERIC(10,2),
    paid_at     TIMESTAMP DEFAULT NOW(),
    method      VARCHAR(30),  -- cash/bank/online
    reference   VARCHAR(100),
    received_by INT REFERENCES users(id)
);
