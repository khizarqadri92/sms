import { useState, useEffect } from "react";
import admissionsApi from "../api/admissionsApi";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";

/** Register a fee-paid applicant as a student: choose the section; the login details are shown ONCE. */
export default function RegisterCard({ app, canRegister, notify, reload }) {
  const [sections, setSections] = useState(null);
  const [classId, setClassId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);           // {enrollment_no, class, login, temporary_password}
  const [copied, setCopied] = useState(false);
  const ready = app.status === "payment_verified" && !app.student_id;
  useEffect(() => {
    if (!ready) return;
    admissionsApi.sections(app.id).then(r => {
      const s = r.data.data; setSections(s);
      const first = s.find(x => x.seats_left === null || x.seats_left > 0); if (first) setClassId(String(first.id));
    }).catch(() => setSections([]));
  }, [ready, app.id]);

  const register = async () => {
    const sec = sections.find(s => String(s.id) === String(classId));
    if (!sec) { notify("error", "Choose the section."); return; }
    if (!window.confirm(`Register ${app.student_first_name} ${app.student_last_name} in ${sec.label}?`)) return;
    setBusy(true);
    try { const r = await admissionsApi.register(app.id, { class_id: Number(classId), email: email.trim() || null }); setDone(r.data.data); notify("success", r.data.message); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const copy = () => {
    navigator.clipboard?.writeText(`Login: ${done.login}\nTemporary password: ${done.temporary_password}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (done) return (
    <div className="am-card am-reg-done">
      <div className="am-card-title">Registered as a student</div>
      <div className="am-kv">
        <div><span>Enrollment no.</span><b>{done.enrollment_no}</b></div>
        <div><span>Class</span>{done.class}</div>
        <div><span>Student login</span><b>{done.login}</b></div>
        <div><span>Temporary password</span><b className="am-mono">{done.temporary_password}</b></div>
      </div>
      <div className="am-notice">Give these to the family now - the password is shown only once. The student must change it at first login.</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="am-btn am-btn--sm" onClick={copy}>{copied ? "Copied" : "Copy login details"}</button>
        <button className="am-btn am-btn--sm am-btn--primary" onClick={() => { setDone(null); reload(); }}>Done</button>
      </div>
    </div>
  );
  if (app.status === "admission_completed") return (
    <div className="am-card"><div className="am-card-title">Admission completed</div>
      <div className="am-hint">This applicant is registered as a student. Their login details were shown at registration.</div></div>
  );
  if (!ready || !canRegister) return null;
  return (
    <div className="am-card">
      <div className="am-card-title">Register as student</div>
      {sections && !sections.length && <div className="am-notice">No sections of {app.class_name} exist for this session - add them in Classes first.</div>}
      {sections && sections.length > 0 && (
        <>
          <div className="am-grid">
            <label className="am-field">Section of {app.class_name}
              <select className="am-input" value={classId} onChange={e => setClassId(e.target.value)}>
                {sections.map(s => <option key={s.id} value={s.id} disabled={s.seats_left !== null && s.seats_left <= 0}>
                  {s.label}{s.seats_left === null ? "" : s.seats_left > 0 ? ` - ${s.seats_left} seat${s.seats_left === 1 ? "" : "s"} left` : " - full"}</option>)}
              </select>
            </label>
            <label className="am-field">Student email (optional)
              <input className="am-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Login also works with the enrollment no." />
            </label>
          </div>
          <div className="am-hint" style={{ margin: "8px 0" }}>Creates the student with an enrollment number and login, copies the parents' details, links the parent account and the admission fee voucher.</div>
          <button className="am-btn am-btn--primary" disabled={busy || !classId} onClick={register}>{busy ? "Registering..." : "Register as student"}</button>
        </>
      )}
    </div>
  );
}
