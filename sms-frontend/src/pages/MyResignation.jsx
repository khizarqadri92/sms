import { useState, useEffect } from "react";
import resignationApi from "../api/resignationApi";
import hrApi from "../api/hrApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./MyResignation.css";

const STATUS_LABELS = {
  submitted: "Submitted", manager_approved: "Manager Approved", accepted: "Accepted",
  cleared: "Clearance Complete", settlement_reviewed: "Settlement Reviewed",
  settled: "Settlement Finalized", completed: "Completed", rejected: "Rejected", withdrawn: "Withdrawn",
};
const STATUS_COLORS = {
  submitted: { bg: "#eff6ff", color: "#1d4ed8" },
  manager_approved: { bg: "#eff6ff", color: "#1d4ed8" },
  accepted: { bg: "#f0fdf4", color: "#166534" },
  cleared: { bg: "#f0fdf4", color: "#166534" },
  settlement_reviewed: { bg: "#fefce8", color: "#854d0e" },
  settled: { bg: "#fefce8", color: "#854d0e" },
  completed: { bg: "#ecfdf5", color: "#047857" },
  rejected: { bg: "#fff1f2", color: "#881337" },
  withdrawn: { bg: "var(--bg-hover)", color: "var(--text-secondary)" },
};

export default function MyResignation() {
  const { formatDate, formatCurrency, formatDateTime, loading: settingsLoading } = useRegionalSettings();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [defaultLastDay, setDefaultLastDay] = useState("");
  const [dateChangeReason, setDateChangeReason] = useState("");
  const [suggestedDate, setSuggestedDate] = useState("");
  const [expLetterNotes, setExpLetterNotes] = useState("");
  const [expLetterSaving, setExpLetterSaving] = useState(false);
  const [expLetterMsg, setExpLetterMsg] = useState(null);
  const [expLetter, setExpLetter] = useState(null);
  const loadExperienceLetter = (resignationId) => {
    resignationApi.getExperienceLetter(resignationId).then(r => setExpLetter(r.data.data)).catch(() => setExpLetter(null));
  };
  const saveExperienceLetter = async () => {
    setExpLetterMsg(null);
    setExpLetterSaving(true);
    try {
      await resignationApi.submitExperienceLetter(active.id, expLetterNotes);
      setExpLetterMsg({ type: "success", text: "Experience letter details submitted for review." });
      loadExperienceLetter(active.id);
    } catch (e) {
      setExpLetterMsg({ type: "error", text: e.response?.data?.message || "Failed to save." });
    } finally {
      setExpLetterSaving(false);
    }
  };
  const EXP_LETTER_STATUS_LABELS = {
    pending_hod: "Pending Department Head Review", pending_hr: "Pending HR Final Approval",
    approved: "Approved", rejected_by_hod: "Changes Requested by Department Head", rejected_by_hr: "Changes Requested by HR",
  };
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    resignationApi.getNoticePeriodDays().then(r => {
      const iso = r.data.data?.preview_last_working_day;
      if (iso) {
        setDefaultLastDay(iso);
        setLastDay(iso);
      }
    }).catch(() => {});
  }, []);
  const [msg, setMsg] = useState(null);
  const [viewing, setViewing] = useState(null);
  const openDetail = (id) => {
    resignationApi.getOne(id).then(r => setViewing(r.data.data)).catch(() => {});
  };

  const load = () => {
    setLoading(true);
    resignationApi.getMy().then(r => setList(r.data.data || [])).catch(() => setList([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const active = list.find(r => !["rejected", "withdrawn", "completed"].includes(r.status));

  useEffect(() => {
    if (active) loadExperienceLetter(active.id);
  }, [active?.id]);
  useEffect(() => {
    if (expLetter) setExpLetterNotes(expLetter.notes || "");
  }, [expLetter?.id]);

  const submit = async () => {
    if (!reason.trim()) {
      setMsg({ type: "error", text: "Please provide a reason for your resignation." });
      return;
    }
    if (suggestedDate && !dateChangeReason.trim()) {
      setMsg({ type: "error", text: "Please provide a reason for requesting a different last working day." });
      return;
    }
    setMsg(null);
    setSubmitting(true);
    try {
      await resignationApi.submit({
        reason, requested_last_working_day: suggestedDate || null,
        date_change_reason: suggestedDate ? dateChangeReason : null,
      });
      setMsg({ type: "success", text: "Resignation submitted." });
      setReason(""); setSuggestedDate(""); setDateChangeReason("");
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || "Failed to submit." });
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this resignation request?")) return;
    try {
      await resignationApi.withdraw(id);
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || "Failed to withdraw." });
    }
  };

  return (
    <div className="mr-page">
      <div className="mr-header">
        <div className="mr-title">My Resignation</div>
        <div className="mr-subtitle">Submit and track your resignation request</div>
      </div>

      {(loading || settingsLoading) && <div className="mr-loading">Loading...</div>}

      {msg && (
        <div className="mr-msg" style={{ "--msg-bg": msg.type==="success"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--msg-color": msg.type==="success"?"var(--text-success-soft)":"var(--text-danger-soft)" }}>
          {msg.text}
        </div>
      )}

      {!loading && !settingsLoading && active && (
        <div className="mr-card">
          <div className="mr-card-header">
            <div className="mr-clickable" onClick={()=>openDetail(active.id)}>
              <div className="mr-card-title">Active Resignation Request</div>
              <div className="mr-card-subtext">Submitted {formatDate(active.resignation_date)} &middot; Click for details</div>
            </div>
            <span className="mr-status-badge" style={{ "--badge-bg": (STATUS_COLORS[active.status]||{}).bg, "--badge-color": (STATUS_COLORS[active.status]||{}).color }}>
              {STATUS_LABELS[active.status] || active.status}
            </span>
          </div>
          <div className="mr-lwd-text">
            Last Working Day: <strong>{formatDate(active.final_last_working_day || active.system_calculated_last_working_day)}</strong>
          </div>
          {active.requested_last_working_day && (
            <div className="mr-requested-text">
              You requested: {formatDate(active.requested_last_working_day)} (pending review)
            </div>
          )}
          <button className="btn btn-ghost btn-sm mr-withdraw-btn" onClick={()=>withdraw(active.id)}>
            Withdraw Resignation
          </button>

          {!["submitted","manager_approved","rejected","withdrawn"].includes(active.status) && (
            <div className="mr-exp-section">
              <div className="mr-exp-header">
                <div className="mr-exp-title">Experience Letter Details</div>
                {expLetter && (
                  <span className="mr-exp-status-badge" style={{
                    "--badge-bg": expLetter.status==="approved"?"var(--bg-success-soft)":expLetter.status.startsWith("rejected")?"#fff1f2":"#fefce8",
                    "--badge-color": expLetter.status==="approved"?"var(--text-success-soft)":expLetter.status.startsWith("rejected")?"#881337":"#854d0e" }}>
                    {EXP_LETTER_STATUS_LABELS[expLetter.status] || expLetter.status}
                  </span>
                )}
              </div>

              {expLetter && expLetter.status.startsWith("rejected") && (
                <div className="mr-exp-changes-box">
                  <strong>Changes requested:</strong> {expLetter.status==="rejected_by_hod" ? expLetter.hod_comments : expLetter.hr_comments}
                </div>
              )}

              {expLetter && ["pending_hod","pending_hr","approved"].includes(expLetter.status) ? (
                <div className="mr-exp-notes-box">
                  {expLetter.notes}
                </div>
              ) : (
                <>
                  <div className="mr-exp-intro">
                    Share any details (projects, achievements, role summary) you'd like HR to consider for your experience letter.
                  </div>
                  {expLetterMsg && (
                    <div className="mr-exp-msg" style={{ "--msg-bg": expLetterMsg.type==="success"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--msg-color": expLetterMsg.type==="success"?"var(--text-success-soft)":"var(--text-danger-soft)" }}>
                      {expLetterMsg.text}
                    </div>
                  )}
                  <textarea className="form-input mr-exp-textarea" rows={8}
                    value={expLetterNotes} onChange={e=>setExpLetterNotes(e.target.value)} placeholder="Enter details for your experience letter..." />
                  <button className="btn btn-primary btn-sm mr-save-btn" disabled={expLetterSaving} onClick={saveExperienceLetter}>
                    {expLetterSaving?"Saving...":(expLetter ? "Resubmit" : "Submit for Review")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !settingsLoading && !active && (
        <div className="mr-card">
          <div className="mr-submit-title">Submit Resignation</div>
          <div className="mr-field-wrap">
            <label className="mr-field-label">Reason</label>
            <textarea className="form-input mr-textarea-full" rows={3}
              value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for resignation..." />
          </div>
          <div className="mr-field-wrap">
            <label className="mr-field-label">Last Working Day (as per notice period policy)</label>
            <div className="form-input mr-lwd-readonly">
              {formatDate(lastDay)}
            </div>
          </div>
          <div className="mr-suggest-box">
            <label className="mr-field-label">Request a different last working day (optional)</label>
            <DatePicker value={suggestedDate} onChange={setSuggestedDate} style={{width:220,marginBottom:8}} />
            {suggestedDate && (
              <textarea className="form-input mr-textarea-full" rows={2}
                value={dateChangeReason} onChange={e=>setDateChangeReason(e.target.value)} placeholder="Explain why you're requesting this date instead of the standard notice period..." />
            )}
          </div>
          <button className="btn btn-primary btn-sm mr-save-btn" disabled={submitting} onClick={submit}>
            {submitting ? "Submitting..." : "Submit Resignation"}
          </button>
        </div>
      )}

      {!loading && !settingsLoading && list.length > 0 && (
        <div className="mr-history-wrap">
          <div className="mr-history-header">History</div>
          <table className="mr-table">
            <thead>
              <tr className="mr-th-row">
                {["Submitted", "Last Working Day", "Status"].map(h=>(
                  <th key={h} className="mr-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r=>(
                <tr key={r.id} className="mr-tr" onClick={()=>openDetail(r.id)}>
                  <td className="mr-td-date">{formatDate(r.resignation_date)}</td>
                  <td className="mr-td">{formatDate(r.final_last_working_day || r.system_calculated_last_working_day) || "-"}</td>
                  <td className="mr-td">
                    <span className="mr-status-badge-sm" style={{ "--badge-bg": (STATUS_COLORS[r.status]||{}).bg, "--badge-color": (STATUS_COLORS[r.status]||{}).color }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <div className="mr-modal-overlay"
          onClick={()=>setViewing(null)}>
          <div className="mr-modal-box" onClick={e=>e.stopPropagation()}>
            <div className="mr-modal-header">
              <div className="mr-modal-title">Resignation Request</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setViewing(null)}>Close</button>
            </div>
            <div className="mr-modal-body">
              <div className="mr-status-row">
                <span className="mr-status-badge" style={{ "--badge-bg": (STATUS_COLORS[viewing.status]||{}).bg, "--badge-color": (STATUS_COLORS[viewing.status]||{}).color }}>
                  {STATUS_LABELS[viewing.status]||viewing.status}
                </span>
                <div className="mr-lwd-subtext">
              Last Working Day: {formatDate(viewing.final_last_working_day||viewing.system_calculated_last_working_day)||"-"}
              {viewing.cheque_collection_date && <><br/>Cheque Collection Date: {formatDate(viewing.cheque_collection_date)}</>}
            </div>
              </div>
              {viewing.requested_last_working_day && (
            <div className="mr-requested-box">
              <strong>You requested a different date: </strong>{formatDate(viewing.requested_last_working_day)}
              {viewing.date_change_reason && <div className="mr-requested-reason">Reason: {viewing.date_change_reason}</div>}
            </div>
          )}
          {viewing.reason && (
                <div className="mr-reason-box">
                  <strong>Reason: </strong>{viewing.reason}
                </div>
              )}
              {viewing.clearance_items && viewing.clearance_items.length > 0 && (
                <div className="mr-clearance-section">
                  <div className="mr-clearance-title">Clearance Checklist</div>
                  {viewing.clearance_items.map(item=>(
                    <div key={item.id} className="mr-clearance-item">
                      <div className="mr-clearance-item-top">
                        <span className="mr-clearance-icon" style={{ "--icon-color": item.is_cleared?"#166534":"var(--text-muted)" }}>{item.is_cleared?"✓":"○"}</span>
                        <div><strong>{item.department_name}</strong> - {item.item_label}</div>
                        {item.remarks && (
                          <div className="mr-clearance-remarks">"{item.remarks}"</div>
                        )}
                      </div>
                      {item.messages && item.messages.length > 0 && (
                        <div className="mr-messages-wrap">
                          {item.messages.map((m,i)=>(
                            <div key={i} className="mr-message-box">
                              <div className="mr-message-text">{m.message}</div>
                              <div className="mr-message-meta">
                                {m.first_name} {m.last_name} &middot; {formatDateTime(m.sent_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {viewing.settlement && (
                <div>
                  <div className="mr-settlement-title">Settlement</div>
                  <div className="mr-settlement-text">
                    Final Amount: <strong>{formatCurrency(viewing.settlement.final_amount)}</strong>
                    {" "}({viewing.settlement.status})
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
