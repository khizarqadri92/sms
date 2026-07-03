CREATE OR REPLACE VIEW vw_fee_collection_status AS
SELECT fi.id, s.first_name, s.last_name, fs.name AS fee_name,
       fi.amount, fi.status, fi.due_date
FROM fee_invoices fi
JOIN students s ON s.id = fi.student_id
JOIN fee_structures fs ON fs.id = fi.fee_structure_id;
