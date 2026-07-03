-- Nightly: mark unpaid invoices past due_date as overdue
CREATE OR REPLACE FUNCTION fn_flag_overdue_fees() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE fee_invoices SET status = 'overdue'
    WHERE status = 'unpaid' AND due_date < CURRENT_DATE;
END;
$$;
