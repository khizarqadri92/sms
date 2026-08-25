import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import studentsApi from "../api/studentsApi";
import InvoiceTimelineModal from "../components/InvoiceTimelineModal";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";

export default function Children() {
  const [children, setChildren] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState(null);
  const [sub,      setSub]      = useState("overview");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = e => {
      if (["overview","timetable","attendance","grades","fees"].includes(e.detail?.sub)) setSub(e.detail.sub);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  useEffect(() => {
    fetchChildren();
  }, []);

  const fetchChildren = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getMyChildren();
      const kids = res.data.data || [];
      setChildren(kids);
      if (kids.length > 0) setSelected(kids[0]);
    } catch { setError("Failed to load children."); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;
  if (error)   return <div className="alert alert-error">{error}</div>;
  if (children.length === 0) return (
    <div className="section-card">
      <div className="empty-state">
        No children linked to your account. Please contact the school administration.
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h1 className="page-heading">My Children</h1>
      </div>

      {children.length > 1 && (
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          {children.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              style={{
                padding:"8px 16px", borderRadius:8, border:"2px solid",
                borderColor: selected?.id === c.id ? "var(--theme-primary,#2563eb)" : "#e2e8f0",
                background:  selected?.id === c.id ? "var(--theme-primary-light,#eff6ff)" : "#fff",
                color:       selected?.id === c.id ? "var(--theme-primary,#2563eb)" : "#64748b",
                fontWeight:  selected?.id === c.id ? 700 : 500,
                cursor:"pointer", fontSize:13
              }}
            >
              {c.first_name} {c.last_name}
              {c.status==="withdrawn" && <span style={{marginLeft:6,fontSize:10,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"1px 7px",borderRadius:10}}>Withdrawn</span>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div>
          {selected.status === "withdrawn" && (
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:20}}>&#9888;</span>
              <div>
                <div style={{fontWeight:600,fontSize:14,color:"#991b1b"}}>Student Withdrawn</div>
                <div style={{fontSize:13,color:"#991b1b",marginTop:2}}>This student has been withdrawn from school. Only historical academic data is available below.</div>
              </div>
            </div>
          )}
          {sub === "overview"   && <ChildOverview   child={selected} />}
          {sub === "timetable"  && selected.status !== "withdrawn" && <ChildTimetable child={selected} />}
          {sub === "timetable"  && selected.status === "withdrawn" && (
            <div className="section-card" style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-secondary)"}}>
              <div style={{fontSize:32,marginBottom:8}}>&#128197;</div>
              <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Timetable Not Available</div>
              <div style={{fontSize:13}}>Timetable is not available for withdrawn students.</div>
            </div>
          )}
          {sub === "attendance" && <ChildAttendance child={selected} />}
          {sub === "grades"     && <ChildGrades     child={selected} />}
          {sub === "fees"       && <ChildFees       child={selected} />}
        </div>
      )}
    </div>
  );
}

function ChildOverview({ child }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Student Info</span>
          <span className="badge badge-primary">{child.class_name ? child.class_name + (child.class_section ? " (" + child.class_section + ")" : "") : "N/A"}</span>
        </div>
        {[
          ["Full Name",     child.first_name + " " + child.last_name],
          ["Enrollment No", child.enrollment_no],
          ["Class",         child.class_name ? child.class_name + (child.class_section ? " (" + child.class_section + ")" : "") : "N/A"],
          ["Gender",        child.gender        || "N/A"],
          ["Blood Group",   child.blood_group   || "N/A"],
          ["Status",        child.status        || "active"],
        ].map(([label, value]) => (
          <div key={label} className="profile-detail">
            <span className="profile-detail-label">{label}</span>
            <span className="profile-detail-value" style={{ textTransform:"capitalize" }}>{value}</span>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Info</span>
        </div>
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,var(--theme-primary,#2563eb),#60a5fa)", color:"#fff", fontWeight:800, fontSize:24, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
            {child.first_name?.[0]}{child.last_name?.[0]}
          </div>
          <div style={{ fontSize:18, fontWeight:700, color:"#0f172a" }}>{child.first_name} {child.last_name}</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{child.enrollment_no}</div>
          <div style={{ marginTop:12 }}>
            <span className="badge badge-success">{child.status || "active"}</span>
          </div>
        </div>
        <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:12, marginTop:8 }}>
          <p style={{ fontSize:12, color:"#94a3b8", textAlign:"center" }}>
            Use the sub-tabs above to view attendance, grades and fees for {child.first_name}.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChildAttendance({ child }) {
  const processingToday = useProcessingToday();
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [from,     setFrom]     = useState(new Date().toISOString().slice(0,7)+"-01");
  const [to,       setTo]       = useState(new Date().toISOString().split("T")[0]);
  useEffect(() => { setFrom(processingToday.slice(0,7)+"-01"); setTo(processingToday); }, [processingToday]);

  useEffect(() => {
    if (!child?.id) return;
    setLoading(true);
    studentsApi.getAttendance(child.id, { from, to })
      .then(res => setRecords(res.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [child?.id, from, to]);

  const counts = records.reduce((a,r)=>{ a[r.status]=(a[r.status]||0)+1; return a; },{});
  const total  = records.length;
  const pct    = total > 0 ? Math.round(((counts.present||0)/total)*100) : 0;
  const STATUS_BADGE = { present:"badge-success", absent:"badge-danger", late:"badge-warning", excused:"badge-primary" };

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">{child.first_name}&apos;s Attendance</span>
        <div style={{ display:"flex", gap:8 }}>
          <DatePicker style={{ width:140, fontSize:12 }} value={from} onChange={val=>setFrom(val)} />
          <DatePicker style={{ width:140, fontSize:12 }} value={to} onChange={val=>setTo(val)} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
        {[["Present",counts.present||0,"#22c55e"],["Absent",counts.absent||0,"#ef4444"],["Late",counts.late||0,"#f59e0b"],["Attendance %",pct+"%","#2563eb"]].map(([label,val,color]) => (
          <div key={label} style={{ background:"#fff", border:"1px solid #e2e8f0", borderTop:"3px solid "+color, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:800, color }}>{val}</div>
            <div style={{ fontSize:11, color:"#64748b" }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="loading-state">Loading...</div> : records.length === 0 ? (
        <div className="empty-state">No attendance records for this period.</div>
      ) : (
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#f8fafc" }}>
              {["Date","Day","Status","Remarks"].map(h => (
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:"#64748b", fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r,i) => (
              <tr key={i} style={{ borderBottom:"1px solid #f1f5f9" }}>
                <td style={{ padding:"8px 10px", fontWeight:500 }}>{r.date}</td>
                <td style={{ padding:"8px 10px", color:"#64748b" }}>{new Date(r.date+"T00:00:00").toLocaleDateString("en-PK",{weekday:"short"})}</td>
                <td style={{ padding:"8px 10px" }}><span className={"badge "+(STATUS_BADGE[r.status]||"badge-gray")}>{r.status}</span></td>
                <td style={{ padding:"8px 10px", color:"#94a3b8" }}>{r.remarks||"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


function ChildGrades({ child }) {
  const { formatDate } = useRegionalSettings();
  const [grades,  setGrades]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentsApi.getGrades(child.id)
      .then(res => setGrades(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [child.id]);

  if (loading) return <div className="loading-state">Loading grades...</div>;
  if (grades.length === 0) return <div className="empty-state">No grades published yet.</div>;

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr><th>Subject</th><th>Exam</th><th>Marks</th><th>Total</th><th>Grade</th><th>Date</th></tr>
        </thead>
        <tbody>
          {grades.map((g, i) => (
            <tr key={i}>
              <td><strong>{g.subject_name}</strong></td>
              <td style={{ fontSize:12, color:"#64748b" }}>{g.exam_name || "N/A"}</td>
              <td><strong style={{ color:"#2563eb" }}>{g.marks_obtained}</strong></td>
              <td style={{ color:"#64748b" }}>{g.total_marks}</td>
              <td><span className="badge badge-primary">{g.grade || "N/A"}</span></td>
              <td style={{ fontSize:12, color:"#64748b" }}>{g.exam_date ? formatDate(g.exam_date) : "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const downloadPaymentReceipt = async (paymentId) => {
  try {
    const { default: financeApi } = await import("../api/financeApi");
    const res = await financeApi.downloadPaymentReceipt(paymentId);
    const url = window.URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
    const a   = document.createElement("a");
    a.href    = url;
    a.download = "receipt_" + paymentId + ".pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.message || "Receipt not available. Payment may not be verified yet.");
  }
};

const downloadInvoicePdf = async (invoiceId) => {
  try {
    const { default: financeApi } = await import("../api/financeApi");
    const res = await financeApi.downloadInvoicePdf(invoiceId);
    const url = window.URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
    const a   = document.createElement("a");
    a.href    = url;
    a.download = "invoice_" + invoiceId + ".pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch { alert("Failed to download invoice."); }
};

function ChildFees({ child }) {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showPayment, setShowPayment] = useState(null);
  const [success,     setSuccess]     = useState("");
  const [timelineInvoiceId, setTimelineInvoiceId] = useState(null);

  useEffect(() => { fetchFees(); }, [child.id]);

  const fetchFees = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getFees(child.id);
      setSummary(res.data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const handlePaymentDone = () => {
    setShowPayment(null);
    setSuccess("Payment submitted successfully. Awaiting school verification.");
    fetchFees();
    setTimeout(() => setSuccess(""), 5000);
  };

  if (loading) return <div className="loading-state">Loading fees...</div>;
  if (!summary) return <div className="empty-state">No fee records found.</div>;

  const invoices    = summary.invoices || [];
  const statusBadge = s => ({ paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple" })[s] || "badge-gray";

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid" style={{ marginBottom:16 }}>
        {[
          { label:"Total Billed", value:"Rs. " + Number(summary.total_billed||0).toLocaleString(), color:"#2563eb" },
          { label:"Total Paid",   value:"Rs. " + Number(summary.total_paid||0).toLocaleString(),   color:"#16a34a" },
          { label:"Balance Due",  value:"Rs. " + Number(summary.total_due||0).toLocaleString(),    color: summary.total_due > 0 ? "#dc2626" : "#16a34a" },
          { label:"Overdue",      value: summary.overdue_count || 0,                               color: summary.overdue_count > 0 ? "#dc2626" : "#16a34a" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderTop:"3px solid " + s.color }}>
            <div className="stat-card-value" style={{ color:s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {invoices.length === 0 ? <div className="empty-state">No invoices found.</div> : (
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const balance = Number(inv.net_amount) - Number(inv.paid_amount || 0);
                const isOverdue = inv.due_date && new Date(inv.due_date) < new Date(processingToday) && inv.status !== "paid";
                return (
                  <tr key={inv.id} onClick={() => inv.status === "paid" && setTimelineInvoiceId(inv.id)} style={{ cursor: inv.status === "paid" ? "pointer" : "default" }}>
                    <td>
                      <strong>{inv.structure_name || "Invoice"}</strong>
                      {inv.class_name && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {inv.class_name}{inv.class_section ? " (" + inv.class_section + ")" : ""}
                        </div>
                      )}
                    </td>
                    <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                    <td style={{ color:"#16a34a" }}>{inv.discount > 0 ? "- Rs. " + Number(inv.discount).toLocaleString() : "N/A"}</td>
                    <td style={{ color: inv.fine > 0 ? "#dc2626" : "#94a3b8" }}>{inv.fine > 0 ? "+ Rs. " + Number(inv.fine).toLocaleString() : "N/A"}</td>
                    <td><strong>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                    <td style={{ color:"#16a34a" }}>Rs. {Number(inv.paid_amount||0).toLocaleString()}</td>
                    <td style={{ color:"#dc2626", fontWeight:700 }}>Rs. {Number(balance).toLocaleString()}</td>
                    <td style={{ fontSize:12, color: isOverdue ? "#dc2626" : "#64748b", fontWeight: isOverdue ? 700 : 400 }}>
                      {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                      {isOverdue && <div style={{ fontSize:10, color:"#dc2626" }}>Overdue</div>}
                    </td>
                    <td><span className={"badge " + statusBadge(inv.status)} style={{ textTransform:"capitalize" }}>{inv.status}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => downloadInvoicePdf(inv.id)}>
                          Invoice
                        </button>
                        {inv.verified_payment_id && (
                          <button className="btn btn-success btn-xs" onClick={() => downloadPaymentReceipt(inv.verified_payment_id)}
                            style={{ background:"#16a34a", color:"#fff", border:"none" }}>
                            Receipt
                          </button>
                        )}
                        {inv.status !== "paid" && balance > 0 && (
                          <button className="btn btn-primary btn-xs" onClick={() => setShowPayment({ ...inv, paid_amount: inv.paid_amount || 0 })}>
                            Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {timelineInvoiceId && (
        <InvoiceTimelineModal
          studentId={child.id}
          invoiceId={timelineInvoiceId}
          onClose={() => setTimelineInvoiceId(null)}
        />
      )}

      {showPayment && (
        <ParentPaymentModal
          invoice={showPayment}
          onPaid={handlePaymentDone}
          onClose={() => setShowPayment(null)}
        />
      )}
    </div>
  );
}

function ParentPaymentModal({ invoice, onPaid, onClose }) {
  const balance  = Number(invoice.net_amount) - Number(invoice.paid_amount || 0);
  const [form,   setForm]   = useState({ amount_paid: balance, method:"bank_transfer", reference:"", notes:"", receipt_image:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1500000) { setError("Receipt image must be under 1.5MB."); return; }
    const reader = new FileReader();
    reader.onload = ev => setForm({ ...form, receipt_image: ev.target.result });
    reader.readAsDataURL(file);
  };

  const handleSubmit = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const { default: financeApi } = await import("../api/financeApi");
      await financeApi.recordPayment({ ...form, invoice_id: invoice.id });
      onPaid();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit payment.");
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <span className="modal-title">Pay Fee</span>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{invoice.structure_name || "Invoice"}</div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Net Amount</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Rs. {Number(invoice.net_amount).toLocaleString()}</div>
            </div>
            <div style={{ background:"#fef2f2", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Balance Due</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#dc2626" }}>Rs. {Number(balance).toLocaleString()}</div>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#92400e" }}>
            Upload your bank transfer receipt or payment proof. School will verify your payment.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Amount Paid (Rs.) *</label>
              <input className="form-control" type="number" value={form.amount_paid} onChange={e => setForm({...form, amount_paid:e.target.value})} required min="1" step="0.01" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select className="form-control" value={form.method} onChange={e => setForm({...form, method:e.target.value})}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online Payment</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Transaction / Reference No.</label>
              <input className="form-control" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Bank transaction number" />
            </div>
            <div className="form-group">
              <label className="form-label">Upload Receipt (optional)</label>
              <input type="file" accept="image/png,image/jpeg,image/jpg" id="receipt-upload" style={{ display:"none" }} onChange={handleReceiptUpload} />
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <label htmlFor="receipt-upload" className="btn btn-secondary" style={{ cursor:"pointer", display:"inline-block", marginBottom:0 }}>
                  Choose File
                </label>
                {form.receipt_image ? (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <img src={form.receipt_image} alt="receipt" style={{ width:48, height:48, objectFit:"cover", borderRadius:6, border:"1px solid #e2e8f0" }} />
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => setForm({...form, receipt_image:""})}>Remove</button>
                  </div>
                ) : (
                  <span style={{ fontSize:12, color:"#94a3b8" }}>PNG or JPG, max 1.5MB</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Any additional notes" />
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Submitting..." : "Submit Payment"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ChildTimetable({ child }) {
  const [slots,   setSlots]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState("all");

  const COLOR_PALETTE = [
    {bg:"#eff6ff",border:"#2563eb",text:"#1e40af"},
    {bg:"#f0fdf4",border:"#16a34a",text:"#166534"},
    {bg:"#fef9c3",border:"#ca8a04",text:"#854d0e"},
    {bg:"#fef2f2",border:"#dc2626",text:"#991b1b"},
    {bg:"#f5f3ff",border:"#7c3aed",text:"#5b21b6"},
    {bg:"#fff7ed",border:"#ea580c",text:"#9a3412"},
    {bg:"#ecfeff",border:"#0891b2",text:"#0e7490"},
    {bg:"#fdf4ff",border:"#a21caf",text:"#86198f"},
  ];
  const DAYS = { "1":"Monday","2":"Tuesday","3":"Wednesday","4":"Thursday","5":"Friday" };

  useEffect(() => {
    if (!child?.id) return;
    import("../api/academicsApi").then(m => {
      m.default.getTimetable({ class_id: child.class_id })
        .then(r => setSlots(r.data.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [child?.id]);

  const subjIds = [...new Set(slots.map(s => s.subject_id))];
  const subjColorMap = {};
  subjIds.forEach((id, i) => { subjColorMap[id] = COLOR_PALETTE[i % COLOR_PALETTE.length]; });
  const timeSlotsAll = [...new Set(slots.map(s => (s.start_time||"").slice(0,5)))].sort();
  const days = activeDay === "all" ? ["1","2","3","4","5"] : [activeDay];

  if (loading) return <div className="loading-state">Loading timetable...</div>;
  if (!child?.class_id) return <div className="empty-state">Child not assigned to a class.</div>;
  if (slots.length === 0) return <div className="empty-state">No timetable available yet.</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">{child.first_name}&apos;s Timetable — {child.class_name}</span>
      </div>
      <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", marginBottom:12 }}>
        {["All","Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
          <button key={d} onClick={() => setActiveDay(i===0?"all":String(i))}
            style={{ flex:1, padding:"6px 2px", fontSize:11, fontWeight:500, border:"none", cursor:"pointer",
              background: activeDay===(i===0?"all":String(i)) ? "#1e3a5f" : "var(--color-background-secondary)",
              color: activeDay===(i===0?"all":String(i)) ? "#fff" : "var(--color-text-secondary)" }}>
            {d}
          </button>
        ))}
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
          <thead>
            <tr>
              <th style={{ background:"#1e3a5f", color:"#fff", padding:"6px 8px", width:70, textAlign:"left" }}>Time</th>
              {days.map(d => <th key={d} style={{ background:"#1e3a5f", color:"#fff", padding:"6px 4px", textAlign:"center" }}>{DAYS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {timeSlotsAll.map(time => (
              <tr key={time} style={{ borderBottom:"1px solid #f1f5f9" }}>
                <td style={{ padding:"6px 8px", fontWeight:600, fontSize:10, color:"#64748b" }}>{time}</td>
                {days.map(d => {
                  const s = slots.find(sl => String(sl.day_of_week)===d && (sl.start_time||"").slice(0,5)===time);
                  const c = s ? (subjColorMap[s.subject_id]||COLOR_PALETTE[0]) : null;
                  return (
                    <td key={d} style={{ padding:"3px 4px", border:"0.5px solid #f1f5f9", verticalAlign:"top" }}>
                      {s ? (
                        <div style={{ background:c.bg, borderLeft:"2px solid "+c.border, borderRadius:4, padding:"4px 6px" }}>
                          <div style={{ fontWeight:600, color:c.text }}>{s.subject_name}</div>
                          <div style={{ color:"#64748b", fontSize:10 }}>{s.teacher_name}</div>
                        </div>
                      ) : <div style={{ color:"#e2e8f0", textAlign:"center" }}>—</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}