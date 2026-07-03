CREATE OR REPLACE VIEW vw_student_fee_summary AS
SELECT
    s.id                                                AS student_id,
    s.enrollment_no,
    s.first_name || ' ' || s.last_name                  AS student_name,
    c.name                                              AS class_name,
    COUNT(fi.id)                                        AS total_invoices,
    COALESCE(SUM(fi.net_amount), 0)                     AS total_billed,
    COALESCE(SUM(p.amount_paid), 0)                     AS total_paid,
    COALESCE(SUM(fi.net_amount), 0) -
        COALESCE(SUM(p.amount_paid), 0)                 AS total_due,
    COUNT(fi.id) FILTER (WHERE fi.status = 'overdue')   AS overdue_count
FROM students s
LEFT JOIN classes       c  ON c.id = s.class_id
LEFT JOIN fee_invoices  fi ON fi.student_id = s.id
LEFT JOIN payments      p  ON p.invoice_id = fi.id
GROUP BY s.id, s.enrollment_no, s.first_name, s.last_name, c.name;