"""
Admission workflow tests. Run against a THROWAWAY copy of the database (it deletes admission rows):
    set ADM_TEST_DB=admtest  (a database created from your schema + migration_admissions_phase1.sql)
    python tests/test_admission_workflow.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app", "services"))
import admission_workflow as W
db = psycopg2.connect(dbname=os.environ.get("ADM_TEST_DB", "admtest"), user=os.environ.get("PGUSER", "postgres"),
                      password=os.environ.get("PGPASSWORD", ""), host=os.environ.get("PGHOST", "localhost"))
cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
TODAY = date(2027, 2, 15)
ok = bad = 0
def check(name, cond, extra=""):
    global ok, bad; ok += bool(cond); bad += (not cond); print(("  PASS " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra else ""))
def refused(fn):
    try: fn(); db.commit(); return None
    except W.WorkflowError as e: db.rollback(); return (e.status_code, str(e))
def do(app, action, act, **kw):
    r = W.perform(cur, app, action, act, TODAY, **kw); db.commit(); return r

# --- people (permissions exactly as the migration grants them)
STAFF = W.actor(10, ["admission.view","admission.create","admission.edit","admission.verify","admission.assess","admission.register","admission.reports"])
COORD = W.actor(11, ["admission.view","admission.verify","admission.assess","admission.reports"])
PRIN  = W.actor(12, ["admission.view","admission.decide","admission.register","admission.settings","admission.reports"])
FIN   = W.actor(13, ["admission.view","admission.reports","finance.verify"])
PARENT, OTHER_PARENT, SYSTEM = W.actor(100), W.actor(101), W.actor(None, system=True)

# --- settings: open Feb-Mar, Grade 1 has 1 seat, ages 5-7
cur.execute("DELETE FROM admission_status_history; DELETE FROM admission_documents; DELETE FROM admission_tests; DELETE FROM admission_interviews; DELETE FROM admission_applications; DELETE FROM admission_class_settings; DELETE FROM admission_settings;")
cur.execute("""INSERT INTO admission_settings(campus_id,academic_year_id,opens_on,closes_on,test_required,interview_required,admission_fee,required_documents)
               VALUES(1,1,'2027-02-01','2027-03-31',TRUE,TRUE,10000,'["B-Form","Photo"]') RETURNING id""")
sid = cur.fetchone()["id"]
cur.execute("INSERT INTO admission_class_settings(setting_id,class_name,level,capacity,min_age_years,max_age_years) VALUES(%s,'Grade 1',3,1,5,7),(%s,'Nursery',2,NULL,NULL,NULL)", (sid, sid))
db.commit()
seq = [0]
def new_app(first, dob="2021-03-01", cls="Grade 1", parent=100):
    seq[0] += 1
    cur.execute("""INSERT INTO admission_applications(application_no,campus_id,academic_year_id,class_name,student_first_name,student_last_name,
                   date_of_birth,gender,primary_guardian,father_name,father_phone,parent_user_id)
                   VALUES(%s,1,1,%s,%s,'Khan',%s,'male','father','Imran Khan','03001234567',%s) RETURNING id""",
                (f"ADM-2027-{seq[0]:05d}", cls, first, dob, parent))
    i = cur.fetchone()["id"]; db.commit(); return i
def docs(app, status="pending"):
    for d in ("B-Form", "Photo"):
        cur.execute("INSERT INTO admission_documents(application_id,document_name,file_path,status) VALUES(%s,%s,'x.pdf',%s)", (app, d, status))
    db.commit()
def set_docs(app, status): cur.execute("UPDATE admission_documents SET status=%s WHERE application_id=%s", (status, app)); db.commit()
def status(app): return W.load(cur, app)["status"]

print("\n1. Submission")
a = new_app("Ali")
check("submit refused while required documents are missing", refused(lambda: do(a, "submit", PARENT)) == (400, "Please upload: B-Form, Photo."))
docs(a)
check("another parent can't submit someone else's application", (refused(lambda: do(a, "submit", OTHER_PARENT)) or (0,))[0] == 403)
do(a, "submit", PARENT); check("own parent submits -> submitted", status(a) == "submitted")
late = new_app("Late"); docs(late)
r = W.perform  # closed window
try: W.perform(cur, late, "submit", PARENT, date(2027, 4, 5)); db.commit(); m = None
except W.WorkflowError as e: db.rollback(); m = str(e)
check("submit refused after the closing date", m and "closed on 31 Mar 2027" in m, m)

print("\n2. Verification, correction, documents")
check("parent can't start the review", (refused(lambda: do(a, "start_review", PARENT)) or (0,))[0] == 403)
check("finance can't start the review", (refused(lambda: do(a, "start_review", FIN)) or (0,))[0] == 403)
do(a, "start_review", STAFF)
check("correction needs a reason", refused(lambda: do(a, "request_correction", STAFF)) == (400, "Please give a reason."))
do(a, "request_correction", STAFF, remarks="B-Form number is unreadable")
check("-> correction_required", status(a) == "correction_required")
do(a, "resubmit", PARENT); check("parent resubmits -> initial_verification", status(a) == "initial_verification")
do(a, "verify_information", COORD); check("coordinator verifies information -> document_verification", status(a) == "document_verification")
check("schedule test refused while documents are unverified", "not verified yet" in (refused(lambda: do(a, "schedule_test", STAFF)) or (0, ""))[1])
check("reject documents refused until one is marked rejected", "Mark which documents" in refused(lambda: do(a, "reject_documents", STAFF, remarks="x"))[1])
cur.execute("UPDATE admission_documents SET status='resubmission_required' WHERE application_id=%s AND document_name='Photo'", (a,)); db.commit()
do(a, "reject_documents", STAFF, remarks="Photo is blurry"); check("-> documents_rejected", status(a) == "documents_rejected")
do(a, "resubmit_documents", PARENT); set_docs(a, "verified")
check("parent re-uploads -> document_verification", status(a) == "document_verification")

print("\n3. Can't skip the test / interview")
check("send for approval refused: test not done", "admission test must be completed" in refused(lambda: do(a, "send_for_approval", STAFF))[1])
check("schedule test refused without a schedule record", "Create the test schedule" in refused(lambda: do(a, "schedule_test", STAFF))[1])
cur.execute("INSERT INTO admission_tests(application_id,scheduled_at) VALUES(%s,'2027-02-20 10:00')", (a,)); db.commit()
do(a, "schedule_test", STAFF); check("-> test_scheduled", status(a) == "test_scheduled")
check("record test refused before marks are entered", "Enter the test marks" in refused(lambda: do(a, "record_test", STAFF))[1])
cur.execute("UPDATE admission_tests SET result='pass', percentage=78 WHERE application_id=%s", (a,)); db.commit()
do(a, "record_test", STAFF); check("-> test_completed", status(a) == "test_completed")
check("send for approval refused: interview not done", "interview must be completed" in refused(lambda: do(a, "send_for_approval", STAFF))[1])
cur.execute("INSERT INTO admission_interviews(application_id,scheduled_at) VALUES(%s,'2027-02-22 11:00')", (a,)); db.commit()
do(a, "schedule_interview", COORD)
cur.execute("UPDATE admission_interviews SET recommendation='recommended', internal_remarks='Confident child' WHERE application_id=%s", (a,)); db.commit()
do(a, "record_interview", COORD); do(a, "send_for_approval", STAFF)
check("-> awaiting_approval", status(a) == "awaiting_approval")

print("\n4. Principal decides; others can't")
for who, nm in ((STAFF, "admission staff"), (COORD, "coordinator"), (FIN, "finance")):
    check(f"{nm} can't approve", (refused(lambda: do(a, "approve", who)) or (0,))[0] == 403)
do(a, "approve", PRIN); check("principal approves -> approved", status(a) == "approved")

print("\n5. Capacity + waiting list")
b = new_app("Bilal"); docs(b, "verified")
cur.execute("UPDATE admission_applications SET status='awaiting_approval' WHERE id=%s", (b,)); db.commit()
m = refused(lambda: do(b, "approve", PRIN))
check("Grade 1 full (1 seat) -> approve refused", m and "is full (1/1" in m[1], m)
do(b, "waitlist", PRIN); app_b = W.load(cur, b)
check("-> waiting_list with position 1", app_b["status"] == "waiting_list" and app_b["waiting_list_position"] == 1)
check("override without a reason refused", refused(lambda: do(b, "approve", PRIN, override=True)) == (400, "An override needs a reason."))
check("staff can't override", (refused(lambda: do(b, "approve", STAFF, override=True, remarks="x")) or (0,))[0] == 403)
do(b, "approve", PRIN, override=True, remarks="Board approved an extra seat")
cur.execute("SELECT is_override FROM admission_status_history WHERE application_id=%s ORDER BY id DESC LIMIT 1", (b,))
was_override = cur.fetchone()["is_override"]
check("principal override approves, recorded as override, position cleared",
      status(b) == "approved" and was_override and W.load(cur, b)["waiting_list_position"] is None)

print("\n6. Fee, payment, registration")
check("register refused before payment", (refused(lambda: do(a, "register", STAFF)) or (0,))[0] == 409)
check("voucher step refused until a voucher is linked", "Generate the admission fee voucher" in refused(lambda: do(a, "generate_voucher", STAFF))[1])
cur.execute("INSERT INTO fee_invoices(net_amount,status) VALUES(10000,'unpaid') RETURNING id"); inv = cur.fetchone()["id"]
cur.execute("UPDATE admission_applications SET fee_invoice_id=%s WHERE id=%s", (inv, a)); db.commit()
do(a, "generate_voucher", STAFF); check("-> fee_voucher_generated", status(a) == "fee_voucher_generated")
check("finance user can't mark payment verified by hand (system only)", (refused(lambda: do(a, "payment_verified", FIN)) or (0,))[0] == 403)
check("payment step refused while the invoice is unpaid", "not fully paid" in refused(lambda: do(a, "payment_verified", SYSTEM))[1])
cur.execute("UPDATE fee_invoices SET status='paid' WHERE id=%s", (inv,)); db.commit()
do(a, "payment_verified", SYSTEM); check("verified payment -> payment_verified", status(a) == "payment_verified")
check("register refused until the student record exists", "Create the student record" in refused(lambda: do(a, "register", STAFF))[1])
cur.execute("INSERT INTO students(first_name,last_name,campus_id,admission_date,status) VALUES('Ali','Khan',1,'2027-04-01','active') RETURNING id")
cur.execute("UPDATE admission_applications SET student_id=%s WHERE id=%s", (cur.fetchone()["id"], a)); db.commit()
do(a, "register", STAFF); check("-> admission_completed", status(a) == "admission_completed")
check("completed application can't be withdrawn", (refused(lambda: do(a, "withdraw", PARENT, remarks="x")) or (0,))[0] == 409)

print("\n7. Other paths")
c = new_app("Sara", dob="2024-06-01", cls="Grade 1"); docs(c, "verified")
cur.execute("UPDATE admission_applications SET status='initial_verification' WHERE id=%s", (c,)); db.commit()
m = refused(lambda: do(c, "verify_information", STAFF))
check("too young for Grade 1 -> refused with age", m and "needs at least 5" in m[1], m)
check("staff can't reject (decide only)", (refused(lambda: do(c, "reject", STAFF, remarks="x")) or (0,))[0] == 403)
do(c, "reject", PRIN, remarks="Below the minimum age"); check("principal rejects -> rejected", status(c) == "rejected")
d = new_app("Hamza", cls="Nursery"); docs(d, "verified")
do(d, "submit", PARENT); do(d, "withdraw", PARENT, remarks="Moving cities"); check("parent withdraws -> withdrawn", status(d) == "withdrawn")
e = new_app("Zain", cls="Nursery"); docs(e, "verified"); cur.execute("UPDATE admission_applications SET status='approved' WHERE id=%s", (e,)); db.commit()
do(e, "waive_fee", PRIN, remarks="Staff child - fee waived")
check("principal waives the fee -> payment_verified, fee_waived", status(e) == "payment_verified" and W.load(cur, e)["fee_waived"])
cur.execute("UPDATE admission_settings SET test_required=FALSE, interview_required=FALSE")
f = new_app("Noor", cls="Nursery"); docs(f, "verified"); cur.execute("UPDATE admission_applications SET status='document_verification' WHERE id=%s", (f,)); db.commit()
check("with test & interview switched off, scheduling a test is refused", "not required" in refused(lambda: do(f, "schedule_test", STAFF))[1])
do(f, "send_for_approval", STAFF); check("...and it goes straight to the principal", status(f) == "awaiting_approval")
check("unknown action refused", refused(lambda: do(f, "make_admitted", PRIN)) == (400, "Unknown action."))

print("\n8. Duplicates + history")
try:
    cur.execute("""INSERT INTO admission_applications(application_no,campus_id,academic_year_id,class_name,student_first_name,student_last_name,date_of_birth,gender,primary_guardian)
                   VALUES('ADM-DUP',1,1,'Grade 1','ali','KHAN','2021-03-01','male','father')"""); db.commit(); dup = False
except psycopg2.errors.UniqueViolation: db.rollback(); dup = True
check("second active application for the same child/session/campus blocked (case-insensitive)", dup)
cur.execute("SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE remarks IS NOT NULL) AS with_reason FROM admission_status_history WHERE application_id=%s", (a,))
h = cur.fetchone(); check("every step of Ali's application is in the history", h["n"] == 16, str(dict(h)))
acts = W.available_actions(cur, W.load(cur, f), PRIN, TODAY)
check("available_actions lists the principal's options", {x["action"] for x in acts} >= {"approve", "reject", "waitlist", "hold"}, str([x["action"] for x in acts]))
print(f"\nRESULT: {ok} passed, {bad} failed")
