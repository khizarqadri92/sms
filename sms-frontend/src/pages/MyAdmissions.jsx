import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import portalApi from "../api/portalApi";
import AdmissionApplyFlow from "./AdmissionApplyFlow";
import AdmissionApplicationForm from "./AdmissionApplicationForm";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const rs = n => "Rs. " + Number(n || 0).toLocaleString();
const DOC_TONE = { verified: "good", rejected: "bad", resubmission_required: "warn" };

function Steps({ a }) {
  if (["rejected", "withdrawn"].includes(a.status)) return null;
  return <div className="am-steps">{a.stages.map((s, i) => <div key={s} className={i < a.stage ? "done" : i === a.stage ? "now" : ""}>{s}</div>)}</div>;
}

function Application({ a, reload, notify }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState({ name: "", file: null, key: 0 });
  const [pay, setPay] = useState({ amount: "", method: "bank_transfer", reference: "", receipt: "" });
  const run = async (fn, okMsg) => { setBusy(true); try { const r = await fn(); notify("success", okMsg || r.data.message); reload(); } catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); } };
  const upload = () => {
    if (!up.name || !up.file) { notify("error", "Choose the document and a file."); return; }
    run(() => portalApi.upload(a.id, up.name, up.file)).then(() => setUp({ name: "", file: null, key: up.key + 1 }));
  };
  const formPdf = async () => {
    try { const r = await portalApi.formPdf(a.id); const u = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    catch { notify("error", "Could not open the application PDF."); }
  };
  const voucher = async () => {
    try { const r = await portalApi.voucher(a.id); const u = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    catch { notify("error", "Could not open the voucher."); }
  };
  const receipt = f => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { notify("error", "Attach a photo or scan of the receipt (an image)."); return; }
    if (f.size > 1500000) { notify("error", "The receipt image is too large (max 1.5 MB)."); return; }
    const r = new FileReader(); r.onload = ev => setPay(p => ({ ...p, receipt: ev.target.result })); r.readAsDataURL(f);
  };
  const balance = a.fee ? a.fee.amount - a.fee.paid : 0;
  const docChoices = [...new Set([...a.missing_documents, ...a.documents.filter(d => d.status !== "verified").map(d => d.document_name), ...a.documents.map(d => d.document_name)])];

  return (
    <div className="am-card">
      <div className="am-assess-head">
        <div>
          <div className="am-card-title" style={{ margin: 0 }}>{a.student}</div>
          <div className="am-hint">{a.application_no} · {a.class_name} · {a.session} · {a.campus}</div>
        </div>
        <span className={"am-status am-status--" + ({ admission_completed: "good", payment_verified: "good", rejected: "bad", withdrawn: "bad" }[a.status] || "info")}>{a.status_label}</span>
      </div>
      <Steps a={a} />
      {a.action_needed && <div className="am-next">{a.action_needed}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button className="am-btn am-btn--sm" onClick={() => setOpen(o => !o)}>{open ? "Hide details" : "View details"}</button>
        <button className="am-btn am-btn--sm" onClick={formPdf}>Application (PDF)</button>
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          {editing ? (
            <AdmissionApplicationForm initial={{ ...a.form, siblings: a.siblings }} classes={[{ class_name: a.class_name }]} allowDraft={false} submitLabel="Save corrections" saving={busy}
              lookupCnic={cnic => portalApi.myLookupCnic(cnic).then(r => r.data.data)}
              lookupStudent={(no, cnic) => portalApi.myLookupStudent(no, cnic).then(r => r.data.data)}
              onSave={f => run(() => portalApi.edit(a.id, f)).then(() => setEditing(false))} />
          ) : a.can_edit && <button className="am-btn" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>Correct the application details</button>}

          <div className="am-kv">
            <div><span>Brothers / sisters here</span>{a.siblings?.length ? a.siblings.map(s => s.name + " (" + (s.class_name || s.enrollment_no) + ")").join(", ") : "None"}</div>
            <div><span>Disability / special need</span>{a.form.has_disability ? "Yes" : "None declared"}</div>
            <div><span>Transport</span>{a.form.transport_mode === "school_van" ? "School van" : "Self pick and drop"}</div>
          </div>
          <div>
            <div className="am-card-title" style={{ fontSize: 14 }}>Documents</div>
            {a.documents.map(d => (
              <div className="am-doc" key={d.id}><div><b>{d.document_name}</b>{d.remarks && <div className="am-hint">{d.remarks}</div>}</div>
                <span className={"am-status am-status--" + (DOC_TONE[d.status] || "")}>{d.status.replace("_", " ")}</span></div>
            ))}
            {a.missing_documents.map(m => <div className="am-doc" key={m}><b>{m}</b><span className="am-status am-status--warn">missing</span></div>)}
            {a.can_upload && (
              <div className="am-filters" style={{ marginTop: 8 }}>
                <label className="am-field">Document
                  <select className="am-input" value={up.name} onChange={e => setUp(x => ({ ...x, name: e.target.value }))}>
                    <option value="">Choose...</option>{docChoices.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="am-field">File<input key={up.key} className="am-input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setUp(x => ({ ...x, file: e.target.files?.[0] || null }))} /></label>
                <button className="am-btn" disabled={busy} onClick={upload}>Upload</button>
              </div>
            )}
            {a.can_resubmit && <button className="am-btn am-btn--primary" style={{ marginTop: 10 }} disabled={busy}
              onClick={() => run(() => portalApi.action(a.id, "resubmit"))}>Send back for review</button>}
          </div>

          {a.test && (
            <div>
              <div className="am-card-title" style={{ fontSize: 14 }}>Admission test</div>
              <div className="am-kv">
                <div><span>Date &amp; time</span>{fDT(a.test.date)}</div><div><span>Venue</span>{a.test.venue || "-"}</div>
                <div><span>Result</span>{a.test.result ? (a.test.result === "absent" ? "Absent" : a.test.result.toUpperCase() + (a.test.percentage != null ? " · " + a.test.percentage + "%" : "")) : "Not held yet"}</div>
              </div>
              {a.test.instructions && <div className="am-tl-note">{a.test.instructions}</div>}
              {a.test.note && <div className="am-tl-note">{a.test.note}</div>}
            </div>
          )}
          {a.interview && (
            <div>
              <div className="am-card-title" style={{ fontSize: 14 }}>Interview</div>
              <div className="am-kv"><div><span>Date &amp; time</span>{fDT(a.interview.date)}</div><div><span>Place</span>{a.interview.location || "-"}</div>
                <div><span>Status</span>{a.interview.done ? "Done" : "Scheduled"}</div></div>
              {a.interview.note && <div className="am-tl-note">{a.interview.note}</div>}
            </div>
          )}

          {a.fee && (
            <div>
              <div className="am-card-title" style={{ fontSize: 14 }}>Admission fee</div>
              <div className="am-kv">
                <div><span>Voucher</span>{a.fee.invoice_no}</div><div><span>Amount</span>{rs(a.fee.amount)}</div>
                <div><span>Paid</span>{rs(a.fee.paid)}</div><div><span>Due</span>{fD(a.fee.due_date)}</div>
              </div>
              {a.fee.payments.map((p, i) => <div key={i} className="am-hint">{fD(p.date)} · {rs(p.amount)} · {p.status === "pending" ? "waiting for the school to verify" : p.status}{p.reason ? " - " + p.reason : ""}</div>)}
              <button className="am-btn am-btn--sm" style={{ marginTop: 8 }} onClick={voucher}>Download voucher (PDF)</button>
              {a.can_pay && !a.fee.pending && (
                <div className="am-assess-form">
                  <div className="am-hint">Paid at the bank? Upload the receipt here - the school verifies it.</div>
                  <div className="am-grid">
                    <label className="am-field">Amount paid (Rs.)<input type="number" min="1" className="am-input" value={pay.amount || balance} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></label>
                    <label className="am-field">How you paid
                      <select className="am-input" value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}>
                        <option value="bank_transfer">Bank transfer / deposit</option><option value="online">Online</option><option value="cheque">Cheque</option>
                      </select>
                    </label>
                    <label className="am-field">Transaction / receipt no.<input className="am-input" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} /></label>
                    <label className="am-field">Receipt photo<input className="am-input" type="file" accept="image/*" onChange={e => receipt(e.target.files?.[0])} /></label>
                  </div>
                  <button className="am-btn am-btn--primary" disabled={busy || !pay.receipt}
                    onClick={() => run(() => portalApi.pay(a.id, { amount: Number(pay.amount || balance), method: pay.method, reference: pay.reference, receipt_image: pay.receipt }))}>Submit payment</button>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="am-card-title" style={{ fontSize: 14 }}>Timeline</div>
            <div className="am-timeline">{a.timeline.map((t, i) => (
              <div key={i} className="am-tl"><b>{t.title}</b><div className="am-tl-when">{fDT(t.at)}</div>{t.note && <div className="am-tl-note">{t.note}</div>}</div>
            ))}</div>
          </div>
          {a.can_withdraw && <button className="am-btn am-btn--sm am-btn--bad" style={{ alignSelf: "flex-start" }} disabled={busy}
            onClick={() => { const why = window.prompt("Withdraw this application? Tell us why (optional):", ""); if (why !== null) run(() => portalApi.action(a.id, "withdraw", why || null)); }}>Withdraw application</button>}
        </div>
      )}
    </div>
  );
}

/** Parent: my children's admission applications. */
export default function MyAdmissions() {
  const [apps, setApps] = useState(null);
  const [applying, setApplying] = useState(() => new URLSearchParams(window.location.search).get("apply") === "1");
  const [flash, setFlash] = useState(null);
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 5000 : 9000); };
  const load = useCallback(() => portalApi.mine().then(r => setApps(r.data.data)).catch(e => notify("error", errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="am-page">
      <div className="am-head">
        <div><div className="am-title">My Admissions</div><div className="am-sub">Your children's admission applications</div></div>
        {!applying && <button className="am-btn am-btn--primary" onClick={() => setApplying(true)}>+ Apply for another child</button>}
      </div>
      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}
      {applying ? (
        <>
          <button className="am-btn am-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setApplying(false)}>&larr; My admissions</button>
          <AdmissionApplyFlow mode="parent" onDone={() => { setApplying(false); load(); }} />
        </>
      ) : (
        <>
          {apps && !apps.length && <div className="am-card am-hint">No applications yet. Use "Apply for another child" to start one.</div>}
          {(apps || []).map(a => <Application key={a.id} a={a} reload={load} notify={notify} />)}
        </>
      )}
    </div>
  );
}
