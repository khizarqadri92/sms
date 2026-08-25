import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import studentsApi from "../api/studentsApi";
import financeApi  from "../api/financeApi";
import InvoiceTimelineModal from "../components/InvoiceTimelineModal";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

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

  useEffect(() => {
    const handler = e => {
      if (["fees","history"].includes(e.detail?.sub)) setTab(e.detail.sub);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  useEffect(() => { fetchMyFees(); }, []);

  const fetchMyFees = async () => {
    setLoading(true);
    try {
      const paramStudentId = searchParams.get("studentId");
      let studentId = paramStudentId;
      if (!studentId) {
        const meRes = await studentsApi.getMe();
        studentId = meRes.data.data?.id;
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
    setSuccess("Payment recorded successfully.");
    fetchMyFees();
    setTimeout(() => setSuccess(""), 4000);
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
    const map = { paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple" };
    return "badge " + (map[status] || "badge-gray");
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h1 className="page-heading">My Fees</h1>
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid" style={{ marginBottom:20 }}>
        {[
          { label:"Total Billed",     value:"Rs. " + Number(summary.total_billed || 0).toLocaleString(),  color:"#2563eb" },
          { label:"Total Paid",       value:"Rs. " + Number(summary.total_paid   || 0).toLocaleString(),  color:"#16a34a" },
          { label:"Balance Due",      value:"Rs. " + Number(summary.total_due    || 0).toLocaleString(),  color: summary.total_due > 0 ? "#dc2626" : "#16a34a" },
          { label:"Overdue Invoices", value: summary.overdue_count || 0,                                  color: summary.overdue_count > 0 ? "#dc2626" : "#16a34a" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderTop:"3px solid " + s.color, padding:"16px" }}>
            <div className="stat-card-value" style={{ fontSize:18, color:s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {tab === "fees" && (
        <div>
          <div className="section-card-header" style={{ marginBottom:12 }}>
            <span className="section-card-title" style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>
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
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            {fmtInvoiceMonth(inv.month_year)}{inv.class_name ? " — " + inv.class_name + (inv.class_section ? " (" + inv.class_section + ")" : "") : ""}
                          </div>
                        </td>
                        <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                        <td style={{ color:"#16a34a" }}>{inv.discount > 0 ? "- Rs. " + Number(inv.discount).toLocaleString() : "N/A"}</td>
                        <td style={{ color: inv.fine > 0 ? "#dc2626" : "#94a3b8" }}>{inv.fine > 0 ? "+ Rs. " + Number(inv.fine).toLocaleString() : "N/A"}</td>
                        <td><strong>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                        <td style={{ color:"#16a34a" }}>Rs. {Number(inv.paid_amount || 0).toLocaleString()}</td>
                        <td style={{ color:"#dc2626", fontWeight:700 }}>Rs. {Number(balance).toLocaleString()}</td>
                        <td style={{ fontSize:12, color: isOverdue ? "#dc2626" : "#64748b", fontWeight: isOverdue ? 700 : 400 }}>
                          {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                          {isOverdue && <div style={{ fontSize:10, color:"#dc2626" }}>Overdue</div>}
                        </td>
                        <td><span className={statusBadge(inv.status)} style={{ textTransform:"capitalize" }}>{inv.status}</span></td>
                        <td>
                          <div style={{ display:"flex", gap:6, flexDirection:"column" }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowPayment({ ...inv, paid_amount: inv.paid_amount || 0 })}>
                              Pay Now
                            </button>
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
          <div className="section-card-header" style={{ marginBottom:12 }}>
            <span className="section-card-title" style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>
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
                    <tr key={inv.id} onClick={() => setTimelineInvoiceId(inv.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <strong>{inv.structure_name || "Invoice"}</strong>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {fmtInvoiceMonth(inv.month_year)}{inv.class_name ? " — " + inv.class_name + (inv.class_section ? " (" + inv.class_section + ")" : "") : ""}
                        </div>
                      </td>
                      <td style={{ color:"#16a34a", fontWeight:700 }}>Rs. {Number(inv.net_amount).toLocaleString()}</td>
                      <td style={{ fontSize:12, color:"#64748b" }}>{formatDate(inv.issued_at)}</td>
                      <td>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }} onClick={e => e.stopPropagation()}>
                        <span className="badge badge-success">Paid</span>
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
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="modal-title">Pay Fee</span>
                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{showPayment.structure_name || "Invoice"}</div>
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
  const [form,   setForm]   = useState({ amount_paid: balance, method:"cash", reference:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleSubmit = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await financeApi.recordPayment({ ...form, invoice_id: invoice.id });
      onPaid();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to record payment.");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
        <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Total</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>Rs. {Number(invoice.net_amount).toLocaleString()}</div>
        </div>
        <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Already Paid</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#16a34a" }}>Rs. {Number(invoice.paid_amount || 0).toLocaleString()}</div>
        </div>
        <div style={{ background:"#fef2f2", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Balance</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#dc2626" }}>Rs. {Number(balance).toLocaleString()}</div>
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
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cheque">Cheque</option>
          <option value="online">Online Payment</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Reference No.</label>
        <input className="form-control" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Optional reference number" />
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Processing..." : "Pay Now"}</button>
      </div>
    </form>
  );
}