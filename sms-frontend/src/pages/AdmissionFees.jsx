import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const rs = n => "Rs. " + Number(n || 0).toLocaleString();
const TONE = { paid: "good", partial: "info", unpaid: "warn", overdue: "bad", pending_verification: "info" };
export const openVoucher = async (invoiceId, notify) => {
  try {
    const r = await admissionsApi.voucher(invoiceId);
    const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
    window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { notify && notify("error", "Could not open the voucher."); }
};

/** Admission fee vouchers: record counter payments, verify parents' payments, print vouchers. */
export default function AdmissionFees() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const navigate = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useState({ status: "due", q: "" });
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);         // fee detail
  const [form, setForm] = useState({ amount: "", method: "cash", reference: "", notes: "" });
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 5000 : 9000); };
  const load = useCallback(() => {
    admissionsApi.fees(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).then(r => setRows(r.data.data)).catch(e => notify("error", errMsg(e)));
  }, [f]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  const show = id => admissionsApi.fee(id).then(r => {
    const d = r.data.data; setOpen(d);
    const paid = d.payments.filter(p => p.review_status === "verified").reduce((a, p) => a + p.amount_paid, 0);
    setForm({ amount: String(Math.max(0, d.invoice.net_amount - paid)), method: "cash", reference: "", notes: "" });
  }).catch(e => notify("error", errMsg(e)));

  const record = async () => {
    setBusy(true);
    try { const r = await admissionsApi.feePayment(open.invoice.id, { ...form, amount: Number(form.amount) }); notify("success", r.data.message); show(open.invoice.id); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const [receipt, setReceipt] = useState(null);
  const viewReceipt = async p => {
    try { const r = await admissionsApi.feeReceipt(p.id); setReceipt(r.data.data.receipt_image); } catch (e) { notify("error", errMsg(e)); }
  };
  const review = async (p, decision) => {
    let reason = null;
    if (decision === "reject") { reason = window.prompt("Why can't this payment be verified? (the parent will see this)"); if (reason === null) return; }
    setBusy(true);
    try { const r = await admissionsApi.reviewFeePay(p.id, { decision, reason }); notify("success", r.data.message); show(open.invoice.id); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };

  const inv = open?.invoice;
  const paidSoFar = open ? open.payments.filter(p => p.review_status === "verified").reduce((a, p) => a + p.amount_paid, 0) : 0;
  return (
    <div className="am-page">
      <div className="am-head">
        <div><div className="am-title">Admission Fees</div><div className="am-sub">Vouchers are issued automatically when an application is approved</div></div>
      </div>
      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}
      {receipt && (
        <div className="am-modal" onClick={() => setReceipt(null)}>
          <div className="am-modal-box" onClick={e => e.stopPropagation()}>
            <img src={receipt} alt="Payment receipt" style={{ maxWidth: "100%", maxHeight: "75vh", display: "block", margin: "0 auto" }} />
            <button className="am-btn" style={{ marginTop: 10 }} onClick={() => setReceipt(null)}>Close</button>
          </div>
        </div>
      )}
      <div className="am-card">
        <div className="am-filters">
          <label className="am-field" style={{ flex: 1, minWidth: 220 }}>Search
            <input className="am-input" placeholder="Voucher no., application no. or student" value={f.q} onChange={e => setF(x => ({ ...x, q: e.target.value }))} />
          </label>
          <label className="am-field">Show
            <select className="am-input" value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value }))}>
              <option value="due">Due</option><option value="pending">Payment waiting for verification</option><option value="paid">Paid</option><option value="">All</option>
            </select>
          </label>
        </div>
      </div>
      <div className="am-detail">
        <div className="am-card">
          <div className="am-table-wrap">
            <table className="am-table">
              <thead><tr><th>Voucher</th><th>Applicant</th><th>Amount</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {(rows || []).map(r => (
                  <tr key={r.id} className={"am-click" + (open?.invoice.id === r.id ? " am-row-sel" : "")} onClick={() => show(r.id)}>
                    <td><b>{r.invoice_no}</b><div className="am-hint">{r.application_no}</div></td>
                    <td>{r.student}<div className="am-hint">{r.class_name}</div></td>
                    <td>{rs(r.net_amount)}</td>
                    <td>{rs(r.paid)}{r.pending_payments > 0 && <div className="am-status am-status--info">{r.pending_payments} to verify</div>}</td>
                    <td className="am-hint">{fD(r.due_date)}</td>
                    <td><span className={"am-status am-status--" + (TONE[r.status] || "")}>{r.status.replace("_", " ")}</span></td>
                  </tr>
                ))}
                {rows && !rows.length && <tr><td colSpan={6} className="am-hint" style={{ textAlign: "center", padding: 24 }}>No vouchers here.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {inv && (
          <div className="am-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="am-assess-head">
              <div className="am-card-title" style={{ margin: 0 }}>{inv.invoice_no}</div>
              <span className={"am-status am-status--" + (TONE[inv.status] || "")}>{inv.status.replace("_", " ")}</span>
            </div>
            <div className="am-kv">
              <div><span>Applicant</span><b className="am-click" onClick={() => navigate("/admissions/applications/" + inv.application_id)}>{inv.student}</b></div>
              <div><span>Application</span>{inv.application_no}</div>
              <div><span>Amount</span>{rs(inv.net_amount)}</div><div><span>Paid</span>{rs(paidSoFar)}</div>
              <div><span>Balance</span><b>{rs(inv.net_amount - paidSoFar)}</b></div><div><span>Due</span>{fD(inv.due_date)}</div>
            </div>
            <button className="am-btn am-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => openVoucher(inv.id, notify)}>Voucher (PDF)</button>
            {open.payments.length > 0 && (
              <table className="am-table am-table--compact">
                <thead><tr><th>Payment</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>{open.payments.map(p => (
                  <tr key={p.id}>
                    <td>{fD(p.paid_at)} · {p.method.replace("_", " ")}{p.reference ? " · " + p.reference : ""}<div className="am-hint">{p.received_by_name || "Submitted by parent"}{p.rejected_reason ? " · " + p.rejected_reason : ""}</div></td>
                    <td>{rs(p.amount_paid)}</td>
                    <td>{p.review_status === "pending" && can("admissions.admission_fee_verification") ? (
                      <span className="am-doc-actions">
                        {p.has_receipt && <button className="am-btn am-btn--sm" onClick={() => viewReceipt(p)}>View receipt</button>}
                        <button className="am-btn am-btn--sm am-btn--ok" disabled={busy} onClick={() => review(p, "verify")}>Verify</button>
                        <button className="am-btn am-btn--sm am-btn--bad" disabled={busy} onClick={() => review(p, "reject")}>Reject</button>
                      </span>) : <span className={"am-status am-status--" + ({ verified: "good", rejected: "bad", pending: "info" }[p.review_status])}>{p.review_status}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {can("admissions.admission_fee_collection") && inv.status !== "paid" && ["fee_voucher_generated", "payment_partially_paid"].includes(inv.application_status) && (
              <div className="am-assess-form">
                <div className="am-card-title" style={{ margin: 0, fontSize: 13 }}>Record payment at the counter</div>
                <div className="am-grid">
                  <label className="am-field">Amount (Rs.)<input type="number" min="1" className="am-input" value={form.amount} onChange={e => setForm(x => ({ ...x, amount: e.target.value }))} /></label>
                  <label className="am-field">Method
                    <select className="am-input" value={form.method} onChange={e => setForm(x => ({ ...x, method: e.target.value }))}>
                      <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="online">Online</option>
                    </select>
                  </label>
                  <label className="am-field">Reference / receipt no.<input className="am-input" value={form.reference} onChange={e => setForm(x => ({ ...x, reference: e.target.value }))} /></label>
                </div>
                {!open.allow_partial && <div className="am-hint">Partial payment isn't allowed this session - the full balance is due.</div>}
                <button className="am-btn am-btn--primary" disabled={busy} onClick={record}>Record payment</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
