# ================================================================
# STORED PROCEDURE CONVENTION — SMS Project
# ================================================================
# ALL database operations must use stored procedures.
# No direct INSERT/UPDATE/DELETE in Python code.
# SELECT queries for simple lookups are OK inline.
#
# NAMING:
#   sp_<action>_<entity>        — main operations
#   fn_<name>                   — helper functions / triggers
#   vw_<name>                   — views
#
# PATTERN:
#   cur.execute("SELECT * FROM sp_create_xyz(%s, %s)", (val1, val2))
#   result = cur.fetchone()
#   if result["error_msg"]: return error(result["error_msg"], 400)
#   db.commit()
#
# RETURN TABLE convention for write SPs:
#   RETURNS TABLE(id INTEGER, error_msg VARCHAR)
#   — id: new record id (NULL on error)
#   — error_msg: NULL on success, message on error
#
# RETURN TABLE convention for read SPs:
#   RETURNS TABLE(<columns>)
#   — returns the actual data rows
#
# EXAMPLES ALREADY CREATED:
#   sp_enroll_student(...)
#   sp_mark_attendance(...)
#   sp_generate_fee_invoice(...)
#   sp_submit_quiz(...)
#   sp_student_stats(...)
#   fn_audit_log() — trigger
# ================================================================