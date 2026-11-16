import { useState, useEffect } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import portalApi from "../api/portalApi";
import AdmissionApplicationForm from "./AdmissionApplicationForm";
import AdmissionReview from "./AdmissionReview";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong. Please try again.";

/** Published schedule of a campus, as parents see it. */
export function ScheduleCard({ s }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  return (
    <div className="am-card">
      <div className="am-card-title">Admission schedule · {s.session}</div>
      <table className="am-table am-table--compact am-sched"><tbody>
        <tr><td>Applications open</td><td><b>{fD(s.application_start)}</b></td></tr>
        <tr><td>Applications close</td><td><b>{fD(s.application_end)}</b></td></tr>
        {s.test_required && <tr><td>Admission tests start from</td><td><b>{fD(s.tests_start)}</b></td></tr>}
        {s.test_required && (s.tests || []).map(t => <tr key={t.class_name}><td className="am-sched-sub">{t.class_name} test</td><td>{fD(t.test_date)}, {t.start_time}{t.venue ? " · " + t.venue : ""}</td></tr>)}
        {s.interview_required && <tr><td>Interviews from</td><td><b>{fD(s.interview_start)}</b></td></tr>}
        <tr><td>Classes commence</td><td><b>{fD(s.classes_commence)}</b></td></tr>
        <tr><td>Admission fee</td><td><b>Rs. {Number(s.admission_fee || 0).toLocaleString()}</b></td></tr>
      </tbody></table>
      <div className="am-hint" style={{ marginTop: 8 }}>Documents to upload: {(s.required_documents || []).join(", ")}</div>
    </div>
  );
}

/**
 * Apply: campus -> schedule -> form -> documents -> done.
 * mode="public" (no login) or "parent" (logged in: linked to the account, no login details shown).
 */
export default function AdmissionApplyFlow({ mode = "public", onDone }) {
  const [campuses, setCampuses] = useState(null);
  const [campus, setCampus] = useState("");
  const [sched, setSched] = useState(null);
  const [step, setStep] = useState("form");          // form -> documents -> review -> done
  const [focus, setFocus] = useState(null);          // section to jump to when editing from Review
  const [fromReview, setFromReview] = useState(false);
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const [formData, setFormData] = useState(null);
  const [files, setFiles] = useState({});
  const [hp, setHp] = useState("");                  // honeypot (hidden)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    portalApi.campuses().then(r => { const c = r.data.data.campuses; setCampuses(c); if (c.length === 1) setCampus(String(c[0].campus_id)); })
      .catch(e => setError(errMsg(e)));
  }, []);
  useEffect(() => {
    if (!campus) { setSched(null); return; }
    portalApi.schedule(campus).then(r => setSched(r.data.data)).catch(e => setError(errMsg(e)));
  }, [campus]);

  // documents the application needs (a guardian document only when the guardian is "Other")
  const needed = sched && formData ? sched.required_documents.filter(d => formData.primary_guardian === "other" || !/guardian/i.test(d)) : [];
  const toDocs = () => needed.map(name => ({ name, file: files[name] })).filter(d => d.file);
  const pick = (name, f) => {
    if (f && f.size > 5 * 1024 * 1024) { setError(name + ": the file is larger than 5 MB."); return; }
    setError(""); setFiles(x => ({ ...x, [name]: f }));
  };
  const submit = async () => {
    const missing = needed.filter(n => !files[n]);
    if (missing.length) { setError("Please upload: " + missing.join(", ") + "."); return; }
    setBusy(true); setError("");
    const data = { ...formData, campus_id: Number(campus), academic_year_id: sched.academic_year_id, ...(hp ? { website: hp } : {}) };
    try {
      const r = mode === "parent" ? await portalApi.myApply(data, toDocs()) : await portalApi.apply(data, toDocs());
      setResult(r.data.data); setStep("done"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(errMsg(e)); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { setBusy(false); }
  };

  if (step === "done" && result) return (
    <div className="am-card am-reg-done">
      <div className="am-card-title">Application submitted</div>
      <div className="am-kv"><div><span>Application no.</span><b>{result.application_no}</b></div></div>
      {mode === "public" && result.new_account && (
        <>
          <div className="am-kv">
            <div><span>Login (your mobile)</span><b>{result.login}</b></div>
            <div><span>Temporary password</span><b className="am-mono">{result.temporary_password}</b></div>
          </div>
          <div className="am-notice">Write these down now - the password is shown only once. Sign in to follow the application; you'll set your own password at first sign-in.</div>
        </>
      )}
      {mode === "public" && !result.new_account && (
        <div className="am-hint">Sign in with your existing parent account ({result.login}) to follow this application.</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {mode === "public" ? <a className="am-btn am-btn--primary" href="/login">Go to sign in</a>
                           : <button className="am-btn am-btn--primary" onClick={() => onDone && onDone()}>Back to my admissions</button>}
      </div>
    </div>
  );

  return (
    <div className="am-form">
      {error && <div className="am-flash am-flash--error">{error}</div>}
      {campuses && !campuses.length && <div className="am-notice">Admissions are not open at the moment. Please check again later.</div>}
      {campuses && campuses.length > 1 && (
        <div className="am-card">
          <label className="am-field">Campus
            <select className="am-input" value={campus} onChange={e => { setCampus(e.target.value); setStep("form"); setFormData(null); }}>
              <option value="">Choose a campus...</option>
              {campuses.map(c => <option key={c.campus_id} value={c.campus_id}>{c.campus} · {c.session}</option>)}
            </select>
          </label>
        </div>
      )}
      {sched && <ScheduleCard s={sched} />}
      {sched && !sched.open_now && <div className="am-notice">{sched.closed_reason || "Applications for this campus are not open today - see the dates above."}</div>}

      {sched && sched.open_now && (
        <div className="am-wizard">
          {[["form", "Details"], ["documents", "Documents"], ["review", "Review & submit"]].map(([k, l], i) => {
            const order = ["form", "documents", "review"], cur = order.indexOf(step);
            return <div key={k} className={"am-wizard-step" + (i < cur ? " done" : i === cur ? " now" : "")}><span>{i < cur ? "\u2713" : i + 1}</span>{l}</div>;
          })}
        </div>
      )}
      {sched && step === "review" && formData && (
        <>
          <AdmissionReview f={formData} docs={needed.map(name => ({ name, file: files[name] }))} campus={sched.campus} session={sched.session}
            onEdit={letter => { setFromReview(true); setFocus(letter); setStep("form"); }}
            onEditDocs={() => { setFromReview(true); setStep("documents"); toTop(); }} />
          <div className="am-save-bar am-save-bar--review">
            <button className="am-btn" disabled={busy} onClick={() => { setStep("documents"); toTop(); }}>&larr; Back</button>
            <button className="am-btn am-btn--primary am-btn--lg" disabled={busy} onClick={submit}>{busy ? "Submitting..." : "Confirm & submit application"}</button>
          </div>
        </>
      )}

      {sched && sched.open_now && step === "form" && (
        <AdmissionApplicationForm key={campus + (focus || "")} initial={formData || {}} allowDraft={false}
          submitLabel={fromReview ? "Back to review" : "Continue to documents"} focusSection={focus}
          lookupCnic={mode === "parent" ? (cnic => portalApi.myLookupCnic(cnic).then(r => r.data.data)) : undefined}
          lookupCnicPublic={mode === "public" ? (cnic => portalApi.publicLookupCnic(cnic).then(r => r.data.data)) : undefined}
          lookupStudent={(no, cnic) => {
            if (mode === "parent") return portalApi.myLookupStudent(no, cnic).then(r => r.data.data);
            if (!cnic) return Promise.reject({ response: { data: { message: "Enter the father's or mother's CNIC above first." } } });
            return portalApi.publicLookupStudent(no, cnic).then(r => r.data.data);
          }}
          classes={sched.classes} onSave={f => { setFormData(f); setFocus(null); setStep(fromReview ? "review" : "documents"); toTop(); }} />
      )}

      {sched && step === "documents" && (
        <div className="am-card">
          <div className="am-card-title">Upload documents <span className="am-muted">· PDF, JPG or PNG, up to 5 MB each</span></div>
          {needed.map(name => (
            <div className="am-doc" key={name}>
              <div><b>{name}</b> <span className="am-req">*</span>{files[name] && <div className="am-hint">{files[name].name}</div>}</div>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => pick(name, e.target.files?.[0] || null)} />
            </div>
          ))}
          <input type="text" name="website" value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
          <div className="am-hint" style={{ margin: "10px 0" }}>By submitting you confirm the information is correct. Admission is confirmed only after verification, the school's decision and payment of the admission fee.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="am-btn" disabled={busy} onClick={() => { setStep("form"); toTop(); }}>&larr; Back to the form</button>
            <button className="am-btn am-btn--primary" disabled={busy} onClick={() => {
              const missing = needed.filter(n => !files[n]);
              if (missing.length) { setError("Please upload: " + missing.join(", ") + "."); toTop(); return; }
              setError(""); setStep("review"); toTop();
            }}>Review application &rarr;</button>
          </div>
        </div>
      )}
    </div>
  );
}
