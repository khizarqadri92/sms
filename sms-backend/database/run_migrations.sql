\echo '>>> Running 001_rbac...'
\i tables/001_rbac.sql

\echo '>>> Running 002_academic...'
\i tables/002_academic.sql

\echo '>>> Running 003_academic_operations...'
\i tables/003_academic_operations.sql

\echo '>>> Running 004_finance...'
\i tables/004_finance.sql

\echo '>>> Running 005_communication...'
\i tables/005_communication.sql

\echo '>>> Running 006_audit...'
\i tables/006_audit.sql

\echo '>>> Running stored procedures...'
\i procedures/sp_enroll_student.sql
\i procedures/sp_record_attendance.sql
\i procedures/sp_generate_fee_invoice.sql
\i procedures/sp_calculate_grades.sql
\i procedures/sp_assign_role_permission.sql

\echo '>>> Running views...'
\i views/vw_report_card.sql
\i views/vw_attendance_summary.sql
\i views/vw_fee_status.sql
\i views/vw_teacher_timetable.sql

\echo '>>> Running indexes...'
\i indexes/idx_performance.sql

\echo '>>> All migrations complete.'