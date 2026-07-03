-- Performance indexes for the most queried columns
CREATE INDEX idx_students_class_id     ON students(class_id);
CREATE INDEX idx_attendance_student    ON attendance(student_id);
CREATE INDEX idx_attendance_date       ON attendance(date);
CREATE INDEX idx_attendance_class_date ON attendance(class_id, date);
CREATE INDEX idx_grades_student        ON grades(student_id);
CREATE INDEX idx_grades_exam           ON grades(exam_id);
CREATE INDEX idx_fee_invoices_student  ON fee_invoices(student_id);
CREATE INDEX idx_fee_invoices_status   ON fee_invoices(status);
CREATE INDEX idx_messages_receiver     ON messages(receiver_id, is_read);
CREATE INDEX idx_audit_log_table       ON audit_log(table_name, changed_at);
