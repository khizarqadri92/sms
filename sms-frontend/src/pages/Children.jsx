import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import studentsApi from "../api/studentsApi";
import { useAuth } from "../auth/AuthContext";
import InvoiceTimelineModal from "../components/InvoiceTimelineModal";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";
import "./StudentViews.css";

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
      <div className="page-header sv-gap16">
        <h1 className="page-heading">My Children</h1>
      </div>

      {children.length > 1 && (
        <div className="sv-ch-kids">
          {children.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={"sv-ch-kid" + (selected?.id === c.id ? " sv-ch-kid--on" : "")}
            >
              {c.first_name} {c.last_name}
              {c.status==="withdrawn" && <span className="sv-ch-wtag">Withdrawn</span>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div>
          {selected.status === "withdrawn" && (
            <div className="sv-ch-alert">
              <span className="sv-ch-alert-icon">&#9888;</span>
              <div>
                <div className="sv-ch-alert-title">Student Withdrawn</div>
                <div className="sv-ch-alert-text">This student has been withdrawn from school. Only historical academic data is available below.</div>
              </div>
            </div>
          )}
          {sub === "overview"   && <ChildOverview   child={selected} />}
          {sub === "timetable"  && selected.status !== "withdrawn" && <ChildTimetable child={selected} />}
          {sub === "timetable"  && selected.status === "withdrawn" && (
            <div className="section-card sv-ch-na">
              <div className="sv-ch-na-icon">&#128197;</div>
              <div className="sv-ch-na-title">Timetable Not Available</div>
              <div className="sv-ch-na-text">Timetable is not available for withdrawn students.</div>
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
  const navigate = useNavigate();
  const { can } = useAuth();
  return (
    <div className="sv-ch-two">
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
            <span className="profile-detail-value sv-cap">{value}</span>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Info</span>
        </div>
        <div className="sv-ch-quick">
          <div className="sv-ch-avatar">
            {child.first_name?.[0]}{child.last_name?.[0]}
          </div>
          <div className="sv-ch-name">{child.first_name} {child.last_name}</div>
          <div className="sv-ch-enrol">{child.enrollment_no}</div>
          <div className="sv-ch-badge">
            <span className="badge badge-success">{child.status || "active"}</span>
          </div>
          {can("communication.message_my_child_teachers") && (
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                    onClick={() => navigate(`/messages?student=${child.id}`)}>
              Message teachers
            </button>
          )}
        </div>
        <div className="sv-ch-hintbox">
          <p>
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
        <div className="sv-ch-datebar">
          <DatePicker style={{ width:140, fontSize:12 }} value={from} onChange={val=>setFrom(val)} />
          <DatePicker style={{ width:140, fontSize:12 }} value={to} onChange={val=>setTo(val)} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="sv-tiles">
        {[["Present",counts.present||0,"green"],["Absent",counts.absent||0,"red"],["Late",counts.late||0,"amber"],["Attendance %",pct+"%","blue"]].map(([label,val,tone]) => (
          <div key={label} className={"sv-tile sv-tone-" + tone}>
            <div className="sv-tile-val">{val}</div>
            <div className="sv-tile-label">{label}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="loading-state">Loading...</div> : records.length === 0 ? (
        <div className="empty-state">No attendance records for this period.</div>
      ) : (
        <table className="sv-rec">
          <thead>
            <tr>
              {["Date","Day","Status","Remarks"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r,i) => (
              <tr key={i}>
                <td className="sv-rec-strong">{r.date}</td>
                <td className="sv-rec-soft">{new Date(r.date+"T00:00:00").toLocaleDateString("en-PK",{weekday:"short"})}</td>
                <td><span className={"badge "+(STATUS_BADGE[r.status]||"badge-gray")}>{r.status}</span></td>
                <td className="sv-rec-faint">{r.remarks||"—"}</td>
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
              <td className="sv-due">{g.exam_name || "N/A"}</td>
              <td><strong className="sv-blue">{g.marks_obtained}</strong></td>
              <td className="sv-soft">{g.total_marks}</td>
              <td><span className="badge badge-primary">{g.grade || "N/A"}</span></td>
              <td className="sv-due">{g.exam_date ? formatDate(g.exam_date) : "N/A"}</td>
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
  const statusBadge = s => ({ paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple", pending_verification:"badge-warning" })[s] || "badge-gray";

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid sv-gap16">
        {[
          { label:"Total Billed", value:"Rs. " + Number(summary.total_billed||0).toLocaleString(), tone:"blue" },
          { label:"Total Paid",   value:"Rs. " + Number(summary.total_paid||0).toLocaleString(),   tone:"green" },
          { label:"Balance Due",  value:"Rs. " + Number(summary.total_due||0).toLocaleString(),    tone: summary.total_due > 0 ? "red" : "green" },
          { label:"Overdue",      value: summary.overdue_count || 0,                               tone: summary.overdue_count > 0 ? "red" : "green" },
        ].map(s => (
          <div key={s.label} className={"stat-card sv-stat-line sv-tone-" + s.tone}>
            <div className="stat-card-value">{s.value}</div>
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
                  <tr key={inv.id} onClick={() => inv.status === "paid" && setTimelineInvoiceId(inv.id)} className={inv.status === "paid" ? "sv-click-row" : ""}>
                    <td>
                      <strong>{inv.structure_name || "Invoice"}</strong>
                      {inv.class_name && (
                        <div className="sv-ch-inv-class">
                          {inv.class_name}{inv.class_section ? " (" + inv.class_section + ")" : ""}
                        </div>
                      )}
                    </td>
                    <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                    <td className={inv.discount > 0 ? "sv-green" : "sv-na"}>{inv.discount > 0 ? "- Rs. " + Number(inv.discount).toLocaleString() : "N/A"}</td>
                    <td className={inv.fine > 0 ? "sv-red" : "sv-na"}>{inv.fine > 0 ? "+ Rs. " + Number(inv.fine).toLocaleString() : "N/A"}</td>
                    <td><strong>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                    <td className="sv-green">Rs. {Number(inv.paid_amount||0).toLocaleString()}</td>
                    <td className="sv-red sv-bold">Rs. {Number(balance).toLocaleString()}</td>
                    <td className={"sv-due" + (isOverdue ? " sv-due--late" : "")}>
                      {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                      {isOverdue && <div className="sv-due-flag">Overdue</div>}
                    </td>
                    <td><span className={"badge " + statusBadge(inv.status) + " sv-cap"}>{inv.status === "pending_verification" ? "Pending verification" : inv.status}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="sv-actions-wrap">
                        <button className="btn btn-ghost btn-xs" onClick={() => downloadInvoicePdf(inv.id)}>
                          Invoice
                        </button>
                        {inv.verified_payment_id && (
                          <button className="btn btn-success btn-xs sv-ch-receipt" onClick={() => downloadPaymentReceipt(inv.verified_payment_id)}>
                            Receipt
                          </button>
                        )}
                        {inv.status === "pending_verification" ? (
                          <span className="badge badge-warning" title="Your payment is being checked by the school">Awaiting verification</span>
                        ) : inv.status !== "paid" && balance > 0 && (
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
    e.preventDefault();
    if (!form.receipt_image) { setError("Please attach a photo or scan of your payment receipt."); return; }
    setSaving(true); setError("");
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
      <div className="modal sv-modal-box">
        <div className="modal-header">
          <div>
            <span className="modal-title">Pay Fee</span>
            <div className="sv-fee-month">{invoice.structure_name || "Invoice"}</div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div className="sv-pay-boxes sv-pay-boxes--two">
            <div className="sv-pay-box">
              <div className="sv-pay-label">Net Amount</div>
              <div className="sv-pay-value">Rs. {Number(invoice.net_amount).toLocaleString()}</div>
            </div>
            <div className="sv-pay-box sv-pay-box--red">
              <div className="sv-pay-label">Balance Due</div>
              <div className="sv-pay-value">Rs. {Number(balance).toLocaleString()}</div>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="sv-note">
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
              <input type="file" accept="image/png,image/jpeg,image/jpg" id="receipt-upload" className="sv-hidden" onChange={handleReceiptUpload} />
              <div className="sv-file-row">
                <label htmlFor="receipt-upload" className="btn btn-secondary sv-file-btn">
                  Choose File
                </label>
                {form.receipt_image ? (
                  <div className="sv-file-pick">
                    <img src={form.receipt_image} alt="receipt" className="sv-thumb" />
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => setForm({...form, receipt_image:""})}>Remove</button>
                  </div>
                ) : (
                  <span className="sv-file-hint">PNG or JPG, max 1.5MB</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Any additional notes" />
            </div>
            <div className="sv-pay-actions">
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

  // Subject colours: sv-c0 ... sv-c7 in StudentViews.css (light + dark)
  const PALETTE_SIZE = 8;
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
  subjIds.forEach((id, i) => { subjColorMap[id] = "sv-c" + (i % PALETTE_SIZE); });
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
      <div className="sv-days sv-days--compact">
        {["All","Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
          <button key={d} onClick={() => setActiveDay(i===0?"all":String(i))}
            className={"sv-day" + (activeDay===(i===0?"all":String(i)) ? " sv-day--on" : "")}>
            {d}
          </button>
        ))}
      </div>
      <div className="sv-scroll">
        <table className="sv-tt sv-tt--compact">
          <thead>
            <tr>
              <th className="sv-tt-timehead">Time</th>
              {days.map(d => <th key={d}>{DAYS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {timeSlotsAll.map(time => (
              <tr key={time}>
                <td className="sv-tt-time">{time}</td>
                {days.map(d => {
                  const s = slots.find(sl => String(sl.day_of_week)===d && (sl.start_time||"").slice(0,5)===time);
                  const c = s ? (subjColorMap[s.subject_id] || "sv-c0") : null;
                  return (
                    <td key={d} className="sv-tt-cell">
                      {s ? (
                        <div className={"sv-period " + c}>
                          <div className="sv-period-subj">{s.subject_name}</div>
                          <div className="sv-period-teach">{s.teacher_name}</div>
                        </div>
                      ) : <div className="sv-tt-none">—</div>}
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