import { useState, useEffect } from "react";
import resignationApi from "../api/resignationApi";
import workflowApi from "../api/workflowApi";
import DatePicker from "../components/DatePicker";
import hrApi from "../api/hrApi";
import { useAuth } from "../auth/AuthContext";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./Resignations.css";

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


export default function Resignations() {
  const { user, roles: userRoles = [], can } = useAuth();
  const { formatDate, formatCurrency, formatDateTime, loading: settingsLoading } = useRegionalSettings();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [wfStep, setWfStep] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [deptLabels, setDeptLabels] = useState({});

  useEffect(() => {
    hrApi.getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
  }, []);
  const [note, setNote] = useState("");
  const [finalDateChoice, setFinalDateChoice] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [acting, setActing] = useState(false);
  const [settlementForm, setSettlementForm] = useState(null);
  const [taxableFlags, setTaxableFlags] = useState({ pending_salary: false, leave_encashment: false, pf_balance: false, adjustments: [] });
  const [flash, setFlash] = useState(null);
  const [clearanceError, setClearanceError] = useState(null);

  const showFlash = (type, text) => { setFlash({ type, text }); setTimeout(() => setFlash(null), 4000); };

  const load = () => {
    setLoading(true);
    resignationApi.getList().then(r => setList(r.data.data || [])).catch(() => setList([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const [expLetter, setExpLetter] = useState(null);
  const [expLetterReviewComments, setExpLetterReviewComments] = useState("");
  const loadExpLetter = (id) => {
    resignationApi.getExperienceLetter(id).then(r => setExpLetter(r.data.data)).catch(() => setExpLetter(null));
  };
  const advanceExpLetter = async (approved) => {
    if (!approved && !expLetterReviewComments.trim()) { showFlash("error", "Please add a comment explaining the requested changes."); return; }
    setActing(true);
    try {
      await resignationApi.advanceExperienceLetter(viewing.id, { action: approved ? "approve" : "reject", note: expLetterReviewComments || null });
      showFlash("success", approved ? "Experience letter approved." : "Changes requested - the employee has been notified.");
      setExpLetterReviewComments("");
      loadExpLetter(viewing.id);
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const openDetail = (id) => {
    resignationApi.getOne(id).then(r => {
      setViewing(r.data.data);
      loadExpLetter(id);
      setSettlementForm(r.data.data.settlement || { pending_salary_amount: 0, leave_encashment_days: 0, leave_encashment_amount: 0, other_dues: 0, other_deductions: 0, adjustments_note: "", adjustments: [] });
      const existingFlags = r.data.data.settlement?.taxable_flags;
      setTaxableFlags(existingFlags && Object.keys(existingFlags).length
        ? { pending_salary: false, leave_encashment: false, pf_balance: false, adjustments: [], ...existingFlags }
        : { pending_salary: false, leave_encashment: false, pf_balance: false, adjustments: [] });
      setNote("");
    }).catch(() => showFlash("error", "Failed to load."));
    // The Approve/Reject buttons must only appear for whoever the CURRENT
    // workflow step is actually assigned to - showing them to everyone who
    // can view this page (including the employee who submitted the
    // resignation themselves, if they also happen to have hr.view access)
    // is misleading even though the backend already rejects the action.
    setWfStep(null);
    workflowApi.getInstance("hr", "resignation", id).then(wr => {
      const steps = wr.data.data?.steps || [];
      const pendingSteps = steps.filter(s => s.status === "pending").sort((a, b) => a.step_order - b.step_order);
      const currentStep = pendingSteps[0];
      const isAssignedToMe = currentStep && (
        currentStep.assigned_to_id === user?.id ||
        (currentStep.assigned_role && userRoles.some(r => r === currentStep.assigned_role || r?.name === currentStep.assigned_role))
      );
      setWfStep(isAssignedToMe ? currentStep : null);
    }).catch(() => setWfStep(null));
  };

  const refreshDetail = () => { if (viewing) openDetail(viewing.id); load(); };

  const doAdvance = async (action) => {
    setActing(true);
    try {
      const payload = { action, note };
      if (action === "approve" && viewing.status === "manager_approved") {
        if (finalDateChoice) payload.final_last_working_day = finalDateChoice;
        if (chequeDate) payload.cheque_collection_date = chequeDate;
      }
      await resignationApi.advance(viewing.id, payload);
      showFlash("success", "Action recorded.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const toggleDept = (id) => {
    setDeptLabels(prev => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = "No outstanding dues";
      return next;
    });
  };

  const initClearance = async () => {
    setClearanceError(null);
    const items = Object.entries(deptLabels).map(([deptId, label]) => ({ department_id: Number(deptId), item_label: label }));
    if (items.length === 0) { setClearanceError("Select at least one department."); return; }
    if (items.some(i => !i.item_label.trim())) { setClearanceError("Enter clearance text for every selected department."); return; }
    setActing(true);
    try {
      await resignationApi.initClearance(viewing.id, items);
      showFlash("success", "Clearance checklist created and sent to department heads.");
      setDeptLabels({});
      refreshDetail();
    } catch (e) {
      setClearanceError(e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const clearItem = async (itemId) => {
    try {
      await resignationApi.clearItem(itemId, { remarks: "" });
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    }
  };

  const skipClearance = async () => {
    if (!window.confirm("Skip clearance entirely? No department sign-off will be required for this resignation.")) return;
    setActing(true);
    try {
      await resignationApi.skipClearance(viewing.id);
      showFlash("success", "Clearance skipped.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const completeClearance = async () => {
    setActing(true);
    try {
      await resignationApi.completeClearance(viewing.id);
      showFlash("success", "Clearance marked complete.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const calcSettlement = async () => {
    setActing(true);
    try {
      await resignationApi.calculateSettlement(viewing.id);
      showFlash("success", "Settlement auto-calculated.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const addAdjustmentRow = () => {
    setSettlementForm(f => ({ ...f, adjustments: [...(f.adjustments || []), { name: "", item_type: "earning", calc_type: "fixed", value: 0 }] }));
  };
  const updateAdjustmentRow = (idx, field, value) => {
    setSettlementForm(f => {
      const next = [...(f.adjustments || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...f, adjustments: next };
    });
  };
  const removeAdjustmentRow = (idx) => {
    setSettlementForm(f => ({ ...f, adjustments: (f.adjustments || []).filter((_, i) => i !== idx) }));
  };

  const submitReview = async () => {
    setActing(true);
    try {
      await resignationApi.reviewSettlement(viewing.id, settlementForm);
      showFlash("success", "Settlement reviewed.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const financeCalculateSettlement = async () => {
    setActing(true);
    try {
      await resignationApi.financeCalculateSettlement(viewing.id);
      // No flash message here - the popup itself refreshes to show the
      // calculated breakdown, which is already clear confirmation. A flash
      // banner on the parent page would render behind this open modal and
      // likely go unseen.
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const calculateTax = async () => {
    setActing(true);
    try {
      await resignationApi.calculateSettlementTax(viewing.id, taxableFlags);
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const finalizeSettlement = async () => {
    setActing(true);
    try {
      await resignationApi.finalizeSettlement(viewing.id);
      showFlash("success", "Settlement finalized.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const completeExit = async () => {
    if (!window.confirm("Finalize this employee's exit? Their status will be set to Resigned.")) return;
    setActing(true);
    try {
      await resignationApi.completeResignation(viewing.id);
      showFlash("success", "Exit finalized.");
      setViewing(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const allCleared = viewing?.clearance_items?.length > 0 && viewing.clearance_items.every(i => i.is_cleared);

  return (
    <div className="res-page">
      <div className="res-header">
        <div className="res-title">Employee Resignations</div>
        <div className="res-subtitle">Manage resignation requests through approval, clearance, and settlement</div>
      </div>

      {flash && (
        <div className="res-flash" style={{ "--flash-bg": flash.type==="success"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--flash-color": flash.type==="success"?"var(--text-success-soft)":"var(--text-danger-soft)" }}>
          {flash.text}
        </div>
      )}

      {(loading || settingsLoading) && <div className="res-loading">Loading...</div>}

      {!loading && !settingsLoading && (
        <div className="res-table-container">
          <table className="res-table">
            <thead>
              <tr className="res-th-row">
                {["Employee", "Code", "Department", "Submitted", "Last Working Day", "Status", ""].map(h=>(
                  <th key={h} className="res-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r=>(
                <tr key={r.id} className="res-tr">
                  <td className="res-td-bold">{r.first_name} {r.last_name}</td>
                  <td className="res-td-secondary">{r.employee_code||"-"}</td>
                  <td className="res-td">{r.department_name||"-"}</td>
                  <td className="res-td">{formatDate(r.resignation_date)}</td>
                  <td className="res-td">{formatDate(r.final_last_working_day||r.system_calculated_last_working_day)||"-"}</td>
                  <td className="res-td">
                    <span className="res-status-badge" style={{ "--badge-bg": (STATUS_COLORS[r.status]||{}).bg, "--badge-color": (STATUS_COLORS[r.status]||{}).color }}>
                      {STATUS_LABELS[r.status]||r.status}
                    </span>
                  </td>
                  <td className="res-td">
                    <button className="btn btn-ghost btn-sm res-view-btn" onClick={()=>openDetail(r.id)}>View</button>
                  </td>
                </tr>
              ))}
              {list.length===0 && (
                <tr><td colSpan={7} className="res-empty-row">No resignation requests.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <div className="res-modal-overlay"
          onClick={()=>setViewing(null)}>
          <div className="res-modal-box" onClick={e=>e.stopPropagation()}>
            <div className="res-modal-header">
              <div>
                <div className="res-modal-name">{viewing.first_name} {viewing.last_name}</div>
                <div className="res-modal-meta">{viewing.department_name} &middot; {viewing.designation_name}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setViewing(null)}>Close</button>
            </div>
            <div className="res-modal-body">
              <div className="res-status-row">
                <span className="res-status-badge-lg" style={{ "--badge-bg": (STATUS_COLORS[viewing.status]||{}).bg, "--badge-color": (STATUS_COLORS[viewing.status]||{}).color }}>
                  {STATUS_LABELS[viewing.status]||viewing.status}
                </span>
                <div className="res-lwd-text">
                  Last Working Day: {formatDate(viewing.final_last_working_day||viewing.system_calculated_last_working_day)||"-"}
                  {viewing.cheque_collection_date && <><br/>Cheque Collection Date: {formatDate(viewing.cheque_collection_date)}</>}
                </div>
              </div>
              {viewing.reason && (
                <div className="res-reason-box">
                  <strong>Reason: </strong>{viewing.reason}
                </div>
              )}
              {viewing.requested_last_working_day && (
                <div className="res-warning-box">
                  <strong>Employee requested a different date: </strong>{formatDate(viewing.requested_last_working_day)}
                </div>
              )}
              {viewing.date_change_reason && (
                <div className="res-warning-box">
                  <strong>Suggested a different last working day: </strong>{viewing.date_change_reason}
                </div>
              )}

              {["submitted","manager_approved"].includes(viewing.status) && wfStep && (
                <div className="res-section-box">
                  <div className="res-section-title">Approval</div>
                  {viewing.status === "manager_approved" && (
                    <div className="res-date-choice-box">
                      <div className="res-date-choice-label">Choose the final last working day</div>
                      <label className="res-radio-label">
                        <input type="radio" name="finalDate" checked={finalDateChoice===viewing.system_calculated_last_working_day || !finalDateChoice}
                          onChange={()=>setFinalDateChoice(viewing.system_calculated_last_working_day)} />
                        System Calculated: {formatDate(viewing.system_calculated_last_working_day)}
                      </label>
                      {viewing.requested_last_working_day && (
                        <label className="res-radio-label-last">
                          <input type="radio" name="finalDate" checked={finalDateChoice===viewing.requested_last_working_day}
                            onChange={()=>setFinalDateChoice(viewing.requested_last_working_day)} />
                          Employee Requested: {formatDate(viewing.requested_last_working_day)}
                        </label>
                      )}
                      <div className="res-mt10">
                        <label className="res-field-label">Cheque Collection Date</label>
                        <DatePicker value={chequeDate} onChange={setChequeDate} style={{width:200}} />
                      </div>
                    </div>
                  )}
                  <textarea className="form-input res-textarea-full" rows={2} placeholder="Note (required for reject)"
                    value={note} onChange={e=>setNote(e.target.value)} />
                  <div className="res-btn-row">
                    <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={()=>doAdvance("approve")}>{viewing.status==="manager_approved"?"Accept":"Approve"}</button>
                    <button className="btn btn-ghost btn-sm res-reject-btn" disabled={acting} onClick={()=>doAdvance("reject")}>Reject</button>
                  </div>
                </div>
              )}

              {viewing.status === "accepted" && can("hr.resignation_management") && (
                <div className="res-section-box">
                  <div className="res-section-title">Clearance Checklist</div>
                  {(!viewing.clearance_items || viewing.clearance_items.length===0) ? (
                    <div>
                      <div className="res-dept-intro">Select departments and specify what needs to be cleared:</div>
                      {departments.map(d=>(
                        <div key={d.id} className="res-dept-row">
                          <label className="res-dept-label">
                            <input type="checkbox" checked={d.id in deptLabels} onChange={()=>toggleDept(d.id)} />
                            {d.name}
                          </label>
                          {d.id in deptLabels && (
                            <input className="form-input res-dept-input"
                              placeholder="What needs to be cleared for this department?"
                              value={deptLabels[d.id]}
                              onChange={e=>setDeptLabels(prev=>({...prev,[d.id]:e.target.value}))} />
                          )}
                        </div>
                      ))}
                      {clearanceError && (
                        <div className="res-error-box">
                          {clearanceError}
                        </div>
                      )}
                      <div className="res-btn-row-mt">
                        <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={initClearance}>
                          Initialize Clearance
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={acting} onClick={skipClearance}>
                          Skip Clearance (No Sign-Off Required)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {viewing.clearance_items.map(item=>(
                        <div key={item.id} className="res-clearance-item">
                          <div className="res-clearance-item-top">
                            <span className="res-clearance-icon" style={{ "--icon-color": item.is_cleared?"#166534":"var(--text-muted)" }}>{item.is_cleared?"\u2713":"\u25cb"}</span>
                            <div className="res-clearance-content">
                              <strong>{item.department_name}</strong> - {item.item_label}
                              <div className="res-clearance-meta">
                                Assigned to: {item.assigned_first_name} {item.assigned_last_name}
                                {item.is_cleared && item.cleared_at && <> &middot; Cleared on {formatDate(item.cleared_at)}</>}
                              </div>
                              {item.remarks && (
                                <div className="res-clearance-remarks">"{item.remarks}"</div>
                              )}
                            </div>
                            <span className="res-clearance-status-badge" style={{ "--badge-bg": item.is_cleared?"#f0fdf4":"#fefce8", "--badge-color": item.is_cleared?"#166534":"#854d0e" }}>
                              {item.is_cleared?"Cleared":"Pending"}
                            </span>
                            {!item.is_cleared && (
                              <button className="btn btn-ghost btn-sm res-clearance-mark-btn" disabled={acting}
                                onClick={() => clearItem(item.id)}>
                                Mark Cleared
                              </button>
                            )}
                          </div>
                          {item.messages && item.messages.length > 0 && (
                            <div className="res-messages-wrap">
                              {item.messages.map((m,i)=>(
                                <div key={i} className="res-message-box">
                                  <div className="res-message-text">{m.message}</div>
                                  <div className="res-message-meta">
                                    {m.first_name} {m.last_name} &middot; {formatDateTime(m.sent_at)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="res-complete-btn-wrap">
                        <button className="btn btn-primary btn-sm res-btn-white" disabled={acting || !allCleared} onClick={completeClearance}>
                          Mark Clearance Complete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {expLetter && (
                <div className="res-section-box">
                  <div className="res-exp-header">
                    <div className="res-exp-title">Experience Letter Details</div>
                    <span className="res-exp-status-badge" style={{ "--badge-bg": expLetter.status==="approved"?"#f0fdf4":expLetter.status.startsWith("rejected")?"#fff1f2":"#fefce8", "--badge-color": expLetter.status==="approved"?"#166534":expLetter.status.startsWith("rejected")?"#881337":"#854d0e" }}>
                      {({pending_hod:"Pending Department Head Review",pending_hr:"Pending HR Final Approval",approved:"Approved",
                         rejected_by_hod:"Changes Requested by Department Head",rejected_by_hr:"Changes Requested by HR"})[expLetter.status] || expLetter.status}
                    </span>
                  </div>

                  <div className="res-exp-notes">
                    {expLetter.notes}
                  </div>

                  {expLetter.status.startsWith("rejected") && (
                    <div className="res-exp-changes-box">
                      <strong>Changes requested:</strong> {expLetter.status==="rejected_by_hod" ? expLetter.hod_comments : expLetter.hr_comments}
                    </div>
                  )}

                  {(expLetter.status === "pending_hod" || expLetter.status === "pending_hr") && (
                    expLetter.can_act ? (
                    <>
                      <textarea className="form-input res-exp-textarea" rows={2}
                        placeholder="Comments (required if requesting changes)"
                        value={expLetterReviewComments} onChange={e=>setExpLetterReviewComments(e.target.value)} />
                      <div className="res-exp-btn-row">
                        <button className="btn btn-primary btn-sm res-btn-white" disabled={acting}
                          onClick={() => advanceExpLetter(true)}>
                          {expLetter.status==="pending_hod" ? "Approve" : "Approve (Final)"}
                        </button>
                        <button className="btn btn-ghost btn-sm res-reject-btn" disabled={acting}
                          onClick={() => advanceExpLetter(false)}>
                          Request Changes
                        </button>
                      </div>
                    </>
                    ) : (
                      <div className="res-waiting-text">
                        Waiting on the other reviewer to act.
                      </div>
                    )
                  )}
                </div>
              )}

              {viewing.status === "cleared" && can("hr.resignation_management") && (
                <div className="res-section-box">
                  <div className="res-section-title">Settlement</div>
                  {!viewing.settlement ? (
                    <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={calcSettlement}>
                      Auto-Calculate Settlement
                    </button>
                  ) : (
                    <>
                      <div className="res-recalc-row">
                        <button className="btn btn-ghost btn-sm res-recalc-btn" disabled={acting}
                          onClick={() => { if (window.confirm("Recalculate attendance-derived figures (present/absent/leave days, pending salary)? Manually entered dues, deductions, and adjustments will be kept.")) calcSettlement(); }}>
                          Recalculate from Attendance
                        </button>
                      </div>
                      <div className="res-stats-grid">
                        <div className="res-stat-item">
                          <div className="res-stat-value" style={{ "--stat-color": "#166534" }}>{viewing.settlement.present_days}</div>
                          <div className="res-stat-label">Present Days</div>
                        </div>
                        <div className="res-stat-item">
                          <div className="res-stat-value" style={{ "--stat-color": "#dc2626" }}>{viewing.settlement.absent_days}</div>
                          <div className="res-stat-label">Absent Days</div>
                        </div>
                        <div className="res-stat-item">
                          <div className="res-stat-value" style={{ "--stat-color": "#0369a1" }}>{viewing.settlement.leave_days_taken}</div>
                          <div className="res-stat-label">Leaves Taken</div>
                        </div>
                        <div className="res-stat-item">
                          <div className="res-stat-value" style={{ "--stat-color": "#c2410c" }}>{viewing.settlement.excess_leave_days}</div>
                          <div className="res-stat-label">Excess Leave (treated as absent)</div>
                        </div>
                      </div>
                      <div className="res-form-grid">
                        <div>
                          <label className="res-field-label-sm">Leave Encashment Days</label>
                          <input type="number" className="form-input res-input-full"
                            value={settlementForm.leave_encashment_days} onChange={e=>setSettlementForm(f=>({...f,leave_encashment_days:e.target.value}))} />
                        </div>
                        <div>
                          <label className="res-field-label-sm">Additional Dues / Adjustments (e.g. bonus, reimbursements)</label>
                          <input type="number" className="form-input res-input-full"
                            value={settlementForm.other_dues} onChange={e=>setSettlementForm(f=>({...f,other_dues:e.target.value}))} />
                        </div>
                        <div>
                          <label className="res-field-label-sm">Deductions (e.g. unreturned assets, damages)</label>
                          <input type="number" className="form-input res-input-full"
                            value={settlementForm.other_deductions} onChange={e=>setSettlementForm(f=>({...f,other_deductions:e.target.value}))} />
                        </div>
                      </div>
                      <textarea className="form-input res-textarea-full" rows={2} placeholder="Adjustment notes"
                        value={settlementForm.adjustments_note||""} onChange={e=>setSettlementForm(f=>({...f,adjustments_note:e.target.value}))} />

                      <div className="res-adj-wrap">
                        <div className="res-adj-header">
                          <label className="res-adj-label">Adjustments</label>
                          <button className="btn btn-ghost btn-sm res-add-adj-btn" onClick={addAdjustmentRow}>+ Add Adjustment</button>
                        </div>
                        {(settlementForm.adjustments || []).map((adj, idx) => (
                          <div key={idx} className="res-adj-row-box">
                            <input placeholder="Description" className="form-input res-adj-name-input"
                              value={adj.name} onChange={e=>updateAdjustmentRow(idx,"name",e.target.value)} />
                            <div className="res-adj-grid-2col">
                              <select className="form-input res-adj-select"
                                value={adj.item_type} onChange={e=>updateAdjustmentRow(idx,"item_type",e.target.value)}>
                                <option value="earning">Earning</option>
                                <option value="deduction">Deduction</option>
                              </select>
                              <select className="form-input res-adj-select"
                                value={adj.calc_type} onChange={e=>updateAdjustmentRow(idx,"calc_type",e.target.value)}>
                                <option value="fixed">Fixed Amount</option>
                                <option value="pct_basic">%age of Basic Salary</option>
                                <option value="pct_pending">%age of Pending Settlement Salary</option>
                              </select>
                            </div>
                            <div className="res-adj-value-row">
                              <input type="number" placeholder={adj.calc_type==="fixed"?"Amount":"%"} className="form-input res-adj-value-input"
                                value={adj.value} onChange={e=>updateAdjustmentRow(idx,"value",e.target.value)} />
                              <button className="btn btn-ghost btn-sm res-adj-remove-btn" onClick={()=>removeAdjustmentRow(idx)}>Remove</button>
                            </div>
                          </div>
                        ))}
                        {(settlementForm.adjustments || []).length === 0 && (
                          <div className="res-no-adj">No additional adjustments.</div>
                        )}
                      </div>

                      <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={submitReview}>
                        Submit Settlement Review
                      </button>
                    </>
                  )}
                </div>
              )}

              {viewing.status === "settlement_reviewed" && viewing.settlement && (
                <div className="res-section-box">
                  <div className="res-section-title">Finalize Settlement</div>
                  {!can("payroll.payroll_approval", "hr.resignation_management") ? (
                    <div className="res-not-assigned">
                      This settlement is now with Finance for calculation and finalization.
                    </div>
                  ) : !viewing.settlement.finance_calculated_at ? (
                    <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={financeCalculateSettlement}>
                      Calculate
                    </button>
                  ) : (
                    <>
                      <table className="res-settlement-table">
                        <thead>
                          <tr className="res-settlement-th-row">
                            <th className="res-settlement-th-left">Component</th>
                            <th className="res-settlement-th-right">Amount</th>
                            <th className="res-settlement-th-center">Taxable</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="res-settlement-tr">
                            <td className="res-settlement-td-label">Salary ({viewing.settlement.total_calendar_days} day(s))</td>
                            <td className="res-settlement-td-value">{formatCurrency(viewing.settlement.gross_salary_amount)}</td>
                            <td></td>
                          </tr>
                          {Number(viewing.settlement.absence_deduction_amount) > 0 && (
                            <tr className="res-settlement-tr">
                              <td className="res-settlement-td-label">Absent ({viewing.settlement.absent_days} day(s)) Deduction</td>
                              <td className="res-settlement-td-negative">-{formatCurrency(viewing.settlement.absence_deduction_amount)}</td>
                              <td></td>
                            </tr>
                          )}
                          <tr className="res-settlement-tr">
                            <td className="res-settlement-td-label-bold">Net Pending Salary</td>
                            <td className="res-settlement-td-value-bold">{formatCurrency(viewing.settlement.pending_salary_amount)}</td>
                            <td className="res-settlement-td-checkbox">
                              <input type="checkbox" checked={taxableFlags.pending_salary} onChange={e=>setTaxableFlags(f=>({...f,pending_salary:e.target.checked}))} />
                            </td>
                          </tr>
                          <tr className="res-settlement-tr">
                            <td className="res-settlement-td-label">Leave Encashment ({viewing.settlement.leave_encashment_days} day(s))</td>
                            <td className="res-settlement-td-value">{formatCurrency(viewing.settlement.leave_encashment_amount)}</td>
                            <td className="res-settlement-td-checkbox">
                              <input type="checkbox" checked={taxableFlags.leave_encashment} onChange={e=>setTaxableFlags(f=>({...f,leave_encashment:e.target.checked}))} />
                            </td>
                          </tr>
                          <tr className="res-settlement-tr">
                            <td className="res-settlement-td-label">Provident Fund Balance</td>
                            <td className="res-settlement-td-value">{formatCurrency(viewing.settlement.pf_balance_amount)}</td>
                            <td className="res-settlement-td-checkbox">
                              <input type="checkbox" checked={taxableFlags.pf_balance} onChange={e=>setTaxableFlags(f=>({...f,pf_balance:e.target.checked}))} />
                            </td>
                          </tr>
                          {Number(viewing.settlement.other_dues) > 0 && (
                            <tr className="res-settlement-tr">
                              <td className="res-settlement-td-label">Additional Dues</td>
                              <td className="res-settlement-td-value">{formatCurrency(viewing.settlement.other_dues)}</td>
                              <td></td>
                            </tr>
                          )}
                          {Number(viewing.settlement.other_deductions) > 0 && (
                            <tr className="res-settlement-tr">
                              <td className="res-settlement-td-label">Deductions</td>
                              <td className="res-settlement-td-negative">-{formatCurrency(viewing.settlement.other_deductions)}</td>
                              <td></td>
                            </tr>
                          )}
                          {(viewing.settlement.adjustments || []).map((adj, idx) => (
                            <tr key={idx} className="res-settlement-tr">
                              <td className="res-settlement-td-label">{adj.name} ({adj.item_type})</td>
                              <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: adj.item_type==="deduction"?"#dc2626":"inherit" }}>
                                {adj.item_type==="deduction"?"-":""}{formatCurrency(adj.resolved_amount)}
                              </td>
                              <td className="res-settlement-td-checkbox">
                                <input type="checkbox" checked={!!taxableFlags.adjustments[idx]}
                                  onChange={e=>setTaxableFlags(f=>{ const next=[...(f.adjustments||[])]; next[idx]=e.target.checked; return {...f,adjustments:next}; })} />
                              </td>
                            </tr>
                          ))}
                          {Number(viewing.settlement.income_tax_amount) > 0 && (
                            <tr className="res-settlement-tr">
                              <td className="res-settlement-td-label">Income Tax</td>
                              <td className="res-settlement-td-negative">-{formatCurrency(viewing.settlement.income_tax_amount)}</td>
                              <td></td>
                            </tr>
                          )}
                          <tr>
                            <td className="res-final-label">Final Amount</td>
                            <td className="res-final-value">{formatCurrency(viewing.settlement.final_amount)}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="res-btn-row-gap">
                        <button className="btn btn-ghost btn-sm" disabled={acting} onClick={calculateTax}>
                          Calculate Tax
                        </button>
                        <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={finalizeSettlement}>
                          Finalize Settlement
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewing.status === "settled" && (
                can("hr.resignation_management") ? (
                <div className="res-section-box">
                  <div className="res-section-title">Finalize Exit</div>
                  <button className="btn btn-primary btn-sm res-btn-white" disabled={acting} onClick={completeExit}>
                    Finalize Employee Exit
                  </button>
                </div>
                ) : (
                  <div className="res-final-status">
                    Settlement finalized - awaiting HR to complete the employee exit.
                  </div>
                )
              )}

              {["completed","rejected","withdrawn"].includes(viewing.status) && (
                <div className="res-final-status">
                  This resignation is <strong>{STATUS_LABELS[viewing.status]}</strong>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
