import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import studentsApi from "../api/studentsApi";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import financeApi  from "../api/financeApi";
import InvoiceTimelineModal from "../components/InvoiceTimelineModal";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./StudentViews.css";

const fmtInvoiceMonth = (my) => {
  if (!my) return "";
  const [y, m] = my.split("-");
  return new Date(Number(y), Number(m)-1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

const downloadInvoice = async (invoiceId) => {
  try {
    const res = await financeApi.downloadInvoicePdf(invoiceId);
    const url = window.URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
    const a   = document.createElement("a");
    a.href    = url;
    a.download = "invoice_" + invoiceId + ".pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch { alert("Failed to download invoice."); }
};

const downloadReceipt = async (paymentId) => {
  try {
    const res = await financeApi.downloadPaymentReceipt(paymentId);
    const url = window.URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
    const a   = document.createElement("a");
    a.href    = url;
    a.download = "receipt_" + paymentId + ".pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch { alert("The receipt is available once the school has verified the payment."); }
};

export default function MyFees() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const [summary,     setSummary]     = useState(null);
  const [searchParams] = useSearchParams();
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [showPayment, setShowPayment] = useState(null);
  const [success,     setSuccess]     = useState("");
  const [tab,         setTab]         = useState("fees");
  const [timelineInvoiceId, setTimelineInvoiceId] = useState(null);
  const { user } = useAuth();
  const isStudent = effectiveRole(user) === "student";
  const [children,    setChildren]    = useState([]);      // a parent's children (picker when more than one)

  useEffect(() => {
    const handler = e => {
      if (["fees","history"].includes(e.detail?.sub)) setTab(e.detail.sub);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  useEffect(() => { fetchMyFees(); }, []);

  const fetchMyFees = async (chosenId) => {
    setLoading(true); setError("");
    try {
      let studentId = chosenId || searchParams.get("studentId") || summary?.studentId;
      if (!studentId) {
        if (isStudent) {
          const meRes = await studentsApi.getMe();                 // a student: their own record
          studentId = meRes.data.data?.id;
        } else {
          const cr = await studentsApi.getMyChildren();            // a parent: their children
          const kids = cr.data.data || [];
          setChildren(kids);
          studentId = kids[0]?.id;
          if (!kids.length) { setError("No children are linked to your account yet."); setLoading(false); return; }
        }
      } else if (!isStudent && !children.length) {
        studentsApi.getMyChildren().then(cr => setChildren(cr.data.data || [])).catch(() => {});
      }
      if (!studentId) { setError("Student profile not found."); setLoading(false); return; }
      const res = await studentsApi.getFees(studentId);
      setSummary({ ...res.data.data, studentId });
    } catch {
      setError("Failed to load fee information.");
    } finally { setLoading(false); }
  };

  const handlePaymentDone = () => {
    setShowPayment(null);
    setSuccess("Payment submitted. It will be marked paid once the school verifies your receipt.");
    fetchMyFees();
    setTimeout(() => setSuccess(""), 6000);
  };

  if (loading) return <div className="loading-state">Loading your fees...</div>;

  if (error) return (
    <div className="section-card">
      <div className="alert alert-error">{error}</div>
    </div>
  );

  if (!summary) return <div className="empty-state">No fee records found.</div>;

  const invoices = summary.invoices || [];
  const unpaid   = invoices.filter(i => i.status !== "paid");
  const paid     = invoices.filter(i => i.status === "paid");

  const statusBadge = status => {
    const map = { paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple", pending_verification:"badge-warning" };
    return "badge " + (map[status] || "badge-gray");
  };

  return (
    <div>
      <div className="page-header sv-gap16" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 className="page-heading">{isStudent ? "My Fees" : "Fees"}</h1>
        {!isStudent && children.length > 1 && (
          <select className="form-control" style={{ maxWidth: 260 }} value={String(summary.studentId)}
                  onChange={e => fetchMyFees(e.target.value)}>
            {children.map(ch => (
              <option key={ch.id} value={String(ch.id)}>
                {ch.first_name} {ch.last_name}{ch.class_name ? ` - ${ch.class_name}${ch.class_section ? ` (${ch.class_section})` : ""}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid sv-stats">
        {[
          { label:"Total Billed",     value:"Rs. " + Number(summary.total_billed || 0).toLocaleString(),  tone:"" },
          { label:"Total Paid",       value:"Rs. " + Number(summary.total_paid   || 0).toLocaleString(),  tone:"green" },
          { label:"Balance Due",      value:"Rs. " + Number(summary.total_due    || 0).toLocaleString(),  tone: summary.total_due > 0 ? "red" : "green" },
          { label:"Overdue Invoices", value: summary.overdue_count || 0,                                  tone: summary.overdue_count > 0 ? "red" : "green" },
        ].map(s => (
          <div key={s.label} className={"stat-card sv-stat" + (s.tone ? " sv-stat--" + s.tone : "")}>
            <div className="stat-card-value">{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {tab === "fees" && (
        <div>
          <div className="section-card-header sv-sec-head">
            <span className="section-card-title sv-sec-title">
              Pending Invoices ({unpaid.length})
            </span>
          </div>

          {unpaid.length === 0 ? (
            <div className="empty-state">No pending fees. All paid!</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fee</th>
                    <th>Amount</th>
                    <th>Discount</th>
                    <th>Fine</th>
                    <th>Gross Amount</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaid.map(inv => {
                    const balance = Number(inv.net_amount) - Number(inv.paid_amount || 0);
                    const isOverdue = inv.due_date && new Date(inv.due_date) < new Date(processingToday);
                    return (
                      <tr key={inv.id}>
                        <td>
                          <strong>{inv.structure_name || "Invoice"}</strong>
                          <div className="sv-fee-month">
                            {fmtInvoiceMonth(inv.month_year)}{inv.class_name ? " — " + inv.class_name + (inv.class_section ? " (" + inv.class_section + ")" : "") : ""}
                          </div>
                        </td>
                        <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                        <td className={inv.discount > 0 ? "sv-green" : "sv-na"}>{inv.discount > 0 ? "- Rs. " + Number(inv.discount).toLocaleString() : "N/A"}</td>
                        <td className={inv.fine > 0 ? "sv-red" : "sv-na"}>{inv.fine > 0 ? "+ Rs. " + Number(inv.fine).toLocaleString() : "N/A"}</td>
                        <td><strong>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                        <td className="sv-green">Rs. {Number(inv.paid_amount || 0).toLocaleString()}</td>
                        <td className="sv-red sv-bold">Rs. {Number(balance).toLocaleString()}</td>
                        <td className={"sv-due" + (isOverdue ? " sv-due--late" : "")}>
                          {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                          {isOverdue && <div className="sv-due-flag">Overdue</div>}
                        </td>
                        <td><span className={statusBadge(inv.status) + " sv-cap"}>{inv.status === "pending_verification" ? "Pending verification" : inv.status}</span></td>
                        <td>
                          <div className="sv-actions-col">
                            {inv.status === "pending_verification" ? (
                              <button className="btn btn-ghost btn-sm" onClick={() => setTimelineInvoiceId(inv.id)} title="Your payment is being checked by the school">
                                Awaiting verification
                              </button>
                            ) : (
                              <button className="btn btn-primary btn-sm" onClick={() => setShowPayment({ ...inv, paid_amount: inv.paid_amount || 0 })}>
                                Pay Now
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => downloadInvoice(inv.id)}>
                              Download PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div>
          <div className="section-card-header sv-sec-head">
            <span className="section-card-title sv-sec-title">
              Payment History ({paid.length})
            </span>
          </div>
          {paid.length === 0 ? (
            <div className="empty-state">No paid invoices yet.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fee</th>
                    <th>Net Amount</th>
                    <th>Issue Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map(inv => (
                    <tr key={inv.id} onClick={() => setTimelineInvoiceId(inv.id)} className="sv-click-row">
                      <td>
                        <strong>{inv.structure_name || "Invoice"}</strong>
                        <div className="sv-fee-month">
                          {fmtInvoiceMonth(inv.month_year)}{inv.class_name ? " — " + inv.class_name + (inv.class_section ? " (" + inv.class_section + ")" : "") : ""}
                        </div>
                      </td>
                      <td className="sv-green sv-bold">Rs. {Number(inv.net_amount).toLocaleString()}</td>
                      <td className="sv-due">{formatDate(inv.issued_at)}</td>
                      <td>
                      <div className="sv-actions-row" onClick={e => e.stopPropagation()}>
                        <span className="badge badge-success">Paid</span>
                        {inv.verified_payment_id && (
                          <button className="btn btn-success btn-sm" onClick={() => downloadReceipt(inv.verified_payment_id)}>Receipt</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadInvoice(inv.id)}>Download</button>
                      </div>
                    </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {timelineInvoiceId && (
        <InvoiceTimelineModal
          studentId={summary.studentId}
          invoiceId={timelineInvoiceId}
          onClose={() => setTimelineInvoiceId(null)}
        />
      )}

      {showPayment && (
        <div className="modal-overlay">
          <div className="modal sv-modal-box">
            <div className="modal-header">
              <div>
                <span className="modal-title">Pay Fee</span>
                <div className="sv-fee-month">{showPayment.structure_name || "Invoice"}</div>
              </div>
              <button className="modal-close" onClick={() => setShowPayment(null)}>x</button>
            </div>
            <div className="modal-body">
              <PayFeeForm invoice={showPayment} onPaid={handlePaymentDone} onClose={() => setShowPayment(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayFeeForm({ invoice, onPaid, onClose }) {
  const balance = Number(invoice.net_amount) - Number(invoice.paid_amount || 0);
  const [form,   setForm]   = useState({ amount_paid: balance, method:"bank_transfer", reference:"", notes:"", receipt_image:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const onReceipt = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1500000) { setError("Receipt image is too large (max 1.5 MB)."); return; }
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, receipt_image: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.receipt_image) { setError("Please attach a photo or scan of your payment receipt."); return; }
    setSaving(true); setError("");
    try {
      await financeApi.recordPayment({ ...form, invoice_id: invoice.id });
      onPaid();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to record payment.");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="sv-pay-boxes">
        <div className="sv-pay-box">
          <div className="sv-pay-label">Total</div>
          <div className="sv-pay-value">Rs. {Number(invoice.net_amount).toLocaleString()}</div>
        </div>
        <div className="sv-pay-box sv-pay-box--green">
          <div className="sv-pay-label">Already Paid</div>
          <div className="sv-pay-value">Rs. {Number(invoice.paid_amount || 0).toLocaleString()}</div>
        </div>
        <div className="sv-pay-box sv-pay-box--red">
          <div className="sv-pay-label">Balance</div>
          <div className="sv-pay-value">Rs. {Number(balance).toLocaleString()}</div>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="form-label">Amount Paying (Rs.) *</label>
        <input className="form-control" type="number" value={form.amount_paid} onChange={e => setForm({...form, amount_paid:e.target.value})} required min="1" step="0.01" />
      </div>
      <div className="form-group">
        <label className="form-label">Payment Method *</label>
        <select className="form-control" value={form.method} onChange={e => setForm({...form, method:e.target.value})}>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="online">Online Payment</option>
          <option value="cheque">Cheque</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Payment Receipt *</label>
        <input className="form-control" type="file" accept="image/*" onChange={onReceipt} />
        {form.receipt_image && (
          <div className="sv-receipt-prev">
            <img src={form.receipt_image} alt="receipt" className="sv-thumb" />
            <button type="button" className="btn btn-danger btn-xs" onClick={() => setForm({ ...form, receipt_image: "" })}>Remove</button>
          </div>
        )}
      </div>
      <div className="sv-pay-note">
        Your payment is checked by the school before it counts. The invoice is marked <b>paid</b> and your receipt
        becomes available once it's verified. Paying in cash? Please pay at the school's finance office.
      </div>
      <div className="form-group">
        <label className="form-label">Reference No.</label>
        <input className="form-control" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Optional reference number" />
      </div>
      <div className="sv-pay-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Submitting..." : "Submit Payment"}</button>
      </div>
    </form>
  );
}