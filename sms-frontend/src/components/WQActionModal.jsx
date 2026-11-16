import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import workflowApi from "../api/workflowApi";
import { leavesApi } from "../api/leavesApi";
import procurementApi from "../api/procurementApi";
import { withdrawalApi } from "../api/withdrawalApi";
import { useAuth } from "../auth/AuthContext";
import hrApi from "../api/hrApi";
import attendanceApi from "../api/attendanceApi";
import payrollApi from "../api/payrollApi";
import resignationApi from "../api/resignationApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "./DatePicker";
import "./WQActionModal.css";

const MODULE_ACT = {
  "leaves/leave_application":          (id, action, note) => leavesApi.actionLeave(id, { action, note }),
  "procurement/purchase_requisition":  (id, action, note) => procurementApi.actOnRequisition(id, { action, notes: note }),
  "finance/vendor_invoice":            (id, action, note) => procurementApi.actOnVendorInvoice(id, { action, notes: note }),
  "withdrawal/withdrawal_request":     (id, action, note) => withdrawalApi.clear(id, { action, note }),
  "hr/staff_leave":                     (id, action, note) => hrApi.advanceLeaveWorkflow(id, { action, note }),
  "hr/attendance_correction":           (id, action, note) => attendanceApi.advanceCorrectionRequest(id, { action, note }),
  "hr/payroll_run": (id, action, note, wfStep) => {
    if (action === "reject") return payrollApi.advancePayrollRun(id, { action: "reject", note });
    switch (wfStep?.step_order) {
      case 1: return payrollApi.markAdjustmentsDone(id);
      case 2: return payrollApi.hrSubmitPayrollRun(id);
      case 3: return payrollApi.generatePayrollRun(id);
      case 4: return payrollApi.submitPayrollRun(id);
      case 5: return payrollApi.advancePayrollRun(id, { action: "approve", note });
      case 6: return payrollApi.releasePayrollRun(id);
      default: return Promise.reject(new Error("Unknown payroll workflow step."));
    }
  },
  "hr/resignation": (id, action, note, wfStep) => {
    if (wfStep?.step_type === "finalize_settlement") return resignationApi.finalizeSettlement(id);
    if (wfStep?.step_type === "finalize_exit") return resignationApi.completeResignation(id);
    if (wfStep?.step_type === "clear") return resignationApi.completeClearance(id);
    return resignationApi.advance(id, { action, note });
  },
};

const ENTITY_TYPE_LABELS = {
  leave_application: "Leave Request",
  purchase_requisition: "Purchase Requisition",
  vendor_invoice: "Vendor Invoice",
  withdrawal_request: "Withdrawal Request",
  staff_leave: "Staff Leave Request",
  attendance_correction: "Attendance Correction",
  payroll_run: "Payroll Run",
  resignation: "Resignation Request",
  resignation_experience_letter: "Experience Letter Review",
  resignation_clearance: "Clearance Request",
};

export default function WQActionModal({ item, onClose, onActed }) {
  const navigate = useNavigate();
  const { user, roles: userRoles = [], can } = useAuth();
  const { formatDate, formatDateTime } = useRegionalSettings();
  const [wfStep, setWfStep]       = useState(null);
  const [allSteps, setAllSteps]   = useState([]);
  const [leaveDetail, setLeaveDetail] = useState(null);
  const [correctionDetail, setCorrectionDetail] = useState(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [resignationDetail, setResignationDetail] = useState(null);
  const [finalDateChoice, setFinalDateChoice] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [clearanceMessage, setClearanceMessage] = useState("");
  const [clearanceRemarks, setClearanceRemarks] = useState("");
  const [clearanceMsgSent, setClearanceMsgSent] = useState(false);
  const [clearanceActing, setClearanceActing] = useState(false);
  const [deptStaff, setDeptStaff] = useState([]);
  const [reassignTo, setReassignTo] = useState("");

  useEffect(() => {
    if (!item) return;
    if (item.entity_type === "resignation_clearance") {
      setLoading(false);
      resignationApi.getDepartmentStaff(item.entity_id).then(r => setDeptStaff(r.data.data || [])).catch(() => {});
      return;
    }
    setLoading(true);
    workflowApi.getInstance(item.module, item.entity_type, item.entity_id)
      .then(r => {
        const steps = r.data.data?.steps || [];
        setAllSteps(steps);
        // Only the step with the LOWEST step_order among pending steps is
        // actually "current" - all future steps are also stored as pending
        // in the DB until the workflow reaches them, so matching by
        // user/role alone (without considering order) can incorrectly pick
        // a later step the current user happens to also be eligible for,
        // even though an earlier step is still awaiting someone else.
        const pendingSteps = steps.filter(s => s.status === "pending").sort((a, b) => a.step_order - b.step_order);
        const currentStep = pendingSteps[0];
        const isAssignedToMe = currentStep && (
          currentStep.assigned_to_id === user?.id ||
          (currentStep.assigned_role && userRoles.some(r => r === currentStep.assigned_role || r?.name === currentStep.assigned_role))
        );
        setWfStep(isAssignedToMe ? currentStep : null);
      })
      .catch(() => setWfStep(null))
      .finally(() => setLoading(false));
    if(item.module==="hr" && item.entity_type==="staff_leave") {
      hrApi.getLeaveRequests({}).then(r=>{
        const req = (r.data.data||[]).find(x=>x.id===item.entity_id);
        setLeaveDetail(req||null);
      }).catch(()=>{});
    }
    if(item.module==="hr" && item.entity_type==="resignation") {
      resignationApi.getOne(item.entity_id).then(r=>setResignationDetail(r.data.data)).catch(()=>{});
    }
    if(item.module==="hr" && item.entity_type==="attendance_correction") {
      attendanceApi.getCorrectionRequests({}).then(r=>{
        const req = (r.data.data||[]).find(x=>x.id===item.entity_id);
        setCorrectionDetail(req||null);
      }).catch(()=>{});
    }
  }, [item?.id]);

  const act = async (action) => {
    if (action === "reject" && !note.trim()) { setError("Please provide a reason."); return; }
    setActing(true); setError("");
    const key = `${item.module}/${item.entity_type}`;
    const fn = MODULE_ACT[key];
    if (!fn) { setError("Action not supported for this module."); setActing(false); return; }
    try {
      await fn(item.entity_id, action, note, wfStep);
      if (onActed) onActed();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Action failed.");
    } finally { setActing(false); }
  };

  if (!item) return null;

  return (
    <div className="wqa-overlay"
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="wqa-box">
        <div className="wqa-header">
          <div>
            <div className="wqa-title">{item.title}</div>
            <div className="wqa-desc">{item.description}</div>
          {leaveDetail && (
            <div className="wqa-detail-box">
              <div className="wqa-detail-title">Leave Request Details</div>
              <div className="wqa-detail-grid">
                <div><span className="wqa-detail-field-label">Staff: </span><strong>{leaveDetail.staff_name}</strong></div>
                <div><span className="wqa-detail-field-label">Leave Type: </span><strong>{leaveDetail.leave_type_name}</strong></div>
                <div><span className="wqa-detail-field-label">From: </span><strong>{leaveDetail.from_date}</strong></div>
                <div><span className="wqa-detail-field-label">To: </span><strong>{leaveDetail.to_date}</strong></div>
                <div><span className="wqa-detail-field-label">Days: </span><strong>{leaveDetail.total_days}</strong></div>
                <div><span className="wqa-detail-field-label">Applied: </span><strong>{leaveDetail.applied_at?.slice(0,10)}</strong></div>
                <div className="wqa-detail-full"><span className="wqa-detail-field-label">Reason: </span>{leaveDetail.reason}</div>
              </div>
            </div>
          )}
          {correctionDetail && (() => {
            const hasIn = !!correctionDetail.requested_clock_in;
            const hasOut = !!correctionDetail.requested_clock_out;
            const updatingLabel = hasIn && hasOut ? "Clock In & Clock Out" : hasIn ? "Clock In only" : "Clock Out only";
            return (
            <div className="wqa-detail-box">
              <div className="wqa-detail-title">Correction Request Details</div>
              <div className="wqa-detail-grid">
                <div><span className="wqa-detail-field-label">Staff: </span><strong>{correctionDetail.first_name} {correctionDetail.last_name}</strong></div>
                <div><span className="wqa-detail-field-label">Date: </span><strong>{correctionDetail.request_date}</strong></div>
                <div className="wqa-detail-full">
                  <span className="wqa-detail-field-label">Requesting to update: </span>
                  <strong className="wqa-updating-label">{updatingLabel}</strong>
                </div>
                <div className={"wqa-clock-box " + (hasIn ? "wqa-clock-box-active" : "wqa-clock-box-inactive")}>
                  <div className="wqa-clock-label">Clock In</div>
                  <div className={"wqa-clock-value " + (hasIn ? "wqa-clock-value-active" : "wqa-clock-value-inactive")}>{hasIn ? correctionDetail.requested_clock_in.slice(0,5) : "Not requested"}</div>
                </div>
                <div className={"wqa-clock-box " + (hasOut ? "wqa-clock-box-active" : "wqa-clock-box-inactive")}>
                  <div className="wqa-clock-label">Clock Out</div>
                  <div className={"wqa-clock-value " + (hasOut ? "wqa-clock-value-active" : "wqa-clock-value-inactive")}>{hasOut ? correctionDetail.requested_clock_out.slice(0,5) : "Not requested"}</div>
                </div>
                <div className="wqa-detail-full"><span className="wqa-detail-field-label">Reason: </span>{correctionDetail.reason}</div>
              </div>
            </div>
            );
          })()}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="wqa-summary-grid">
          <div><div className="wqa-summary-label">REQUEST TYPE</div><div className="wqa-summary-value">{ENTITY_TYPE_LABELS[item.entity_type] || item.entity_type}</div></div>
          <div><div className="wqa-summary-label">STATUS</div><div className="wqa-summary-value wqa-capitalize">{item.entity_status||item.status}</div></div>
          <div><div className="wqa-summary-label">ACTION REQUIRED</div><div className="wqa-summary-value">{wfStep?.step_name || item.action_required}</div></div>
          <div><div className="wqa-summary-label">PRIORITY</div><div className="wqa-summary-value wqa-capitalize">{item.priority}</div></div>
        </div>

        {loading && <div className="wqa-loading">Loading workflow step...</div>}

        {!loading && allSteps.length > 0 && (
          <div className="wqa-timeline-section">
            <div className="wqa-timeline-title">Approval Timeline</div>
            <div className="wqa-timeline-list">
              {allSteps.map((s, i) => {
                const stColors = {
                  approved: {bg:"var(--bg-success-soft)",color:"var(--text-success-soft)",icon:"\u2713"},
                  rejected: {bg:"var(--bg-danger-soft)",color:"var(--text-danger-soft)",icon:"\u2715"},
                  pending:  {bg:"var(--bg-warning-soft)",color:"var(--text-warning-soft)",icon:"\u25CF"},
                  skipped:  {bg:"var(--bg-hover)",color:"var(--text-muted)",icon:"\u2013"},
                };
                const sc = stColors[s.status] || stColors.pending;
                return (
                  <div key={s.id} className="wqa-timeline-item" style={{ "--item-bg": "var(--bg-hover)" }}>
                    <div className="wqa-timeline-dot" style={{ "--dot-bg": sc.bg, "--dot-color": sc.color }}>
                      {sc.icon}
                    </div>
                    <div className="wqa-timeline-content">
                      <div className="wqa-timeline-step-name">
                        {s.step_name}
                        <span className="wqa-timeline-status-badge" style={{ "--badge-bg": sc.bg, "--badge-color": sc.color }}>{s.status}</span>
                      </div>
                      {s.assigned_role && <div className="wqa-timeline-assigned">Assigned to: {s.assigned_role.replace(/_/g," ")}</div>}
                      {s.actioned_at && <div className="wqa-timeline-actioned">{formatDateTime(s.actioned_at)}</div>}
                      {s.note && <div className="wqa-timeline-note">"{s.note}"</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && item.entity_type === "resignation_clearance" && item.status === "pending" && (
          <div className="wqa-section">
            <div className="wqa-section-title-info">Clearance Action</div>
            {error && <div className="wqa-error-text">{error}</div>}
            <label className="wqa-field-label">Comments (optional)</label>
            <textarea className="form-input wqa-textarea-full" rows={2}
              value={clearanceRemarks} onChange={e=>setClearanceRemarks(e.target.value)} placeholder="Any notes about this clearance..." />
            <div className="wqa-actions-row-mb12">
              <button className="btn btn-primary btn-sm wqa-btn-white" disabled={clearanceActing}
                onClick={async ()=>{
                  setClearanceActing(true); setError("");
                  try { await resignationApi.clearItem(item.entity_id, { remarks: clearanceRemarks }); if(onActed) onActed(); onClose(); }
                  catch(e){ setError(e.response?.data?.message || "Failed."); }
                  finally { setClearanceActing(false); }
                }}>
                Mark Cleared
              </button>
            </div>
            {deptStaff.length > 0 && (
              <div className="wqa-reassign-box">
                <label className="wqa-field-label">Reassign to someone in your department</label>
                <div className="wqa-flex-gap8">
                  <select className="form-input wqa-select-flex" value={reassignTo} onChange={e=>setReassignTo(e.target.value)}>
                    <option value="">Select staff member...</option>
                    {deptStaff.map(s=><option key={s.user_id} value={s.user_id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" disabled={clearanceActing || !reassignTo}
                    onClick={async ()=>{
                      setClearanceActing(true); setError("");
                      try { await resignationApi.reassignClearance(item.entity_id, { assigned_to_id: Number(reassignTo) }); if(onActed) onActed(); onClose(); }
                      catch(e){ setError(e.response?.data?.message || "Failed."); }
                      finally { setClearanceActing(false); }
                    }}>
                    Reassign
                  </button>
                </div>
              </div>
            )}
            <label className="wqa-field-label">Send message to employee (if something needs to be cleared first)</label>
            {clearanceMsgSent && (
              <div className="wqa-msg-sent-box">
                Message sent to the employee.
              </div>
            )}
            <textarea className="form-input wqa-textarea-full-mb8" rows={2}
              value={clearanceMessage} onChange={e=>{setClearanceMessage(e.target.value); setClearanceMsgSent(false);}} placeholder="e.g. Please return your ID card before we can clear you." />
            <div className="wqa-flex-end">
              <button className="btn btn-ghost btn-sm" disabled={clearanceActing || !clearanceMessage.trim()}
                onClick={async ()=>{
                  setClearanceActing(true); setError(""); setClearanceMsgSent(false);
                  try { await resignationApi.notifyClearance(item.entity_id, { message: clearanceMessage }); setClearanceMessage(""); setClearanceMsgSent(true); }
                  catch(e){ setError(e.response?.data?.message || "Failed."); }
                  finally { setClearanceActing(false); }
                }}>
                Send Message
              </button>
            </div>
          </div>
        )}

        {!loading && wfStep && item.entity_type === "resignation" && ["clear","review","finalize_settlement"].includes(wfStep.step_type) && (
          <div className="wqa-section">
            <div className="wqa-step-title">
              Current Step: {wfStep.step_name}
            </div>
            <div className="wqa-step-desc">
              {wfStep.step_type === "review"
                ? "Review and adjust the settlement amount from the full Resignations page."
                : wfStep.step_type === "finalize_settlement"
                ? "Calculate the final payout (including Provident Fund balance) and finalize from the full Resignations page."
                : "Select departments and monitor clearance progress from the full Resignations page."}
            </div>
            <button className="btn btn-primary btn-sm wqa-btn-white"
              onClick={() => { onClose(); navigate(`/hr/resignations?id=${item.entity_id}`); }}>
              {wfStep.step_type === "review" ? "Open Settlement Review" : wfStep.step_type === "finalize_settlement" ? "Open Settlement Finalization" : "Open Clearance Checklist"}
            </button>
          </div>
        )}

        {!loading && wfStep && !(item.entity_type === "resignation" && ["clear","review","finalize_settlement"].includes(wfStep.step_type)) && (
          <div className="wqa-section">
            <div className="wqa-step-title-mb8">
              Current Step: {wfStep.step_name}
            </div>
            {item.entity_type === "resignation" && resignationDetail?.status === "manager_approved" && resignationDetail && (
              <div className="wqa-date-choice-box">
                <div className="wqa-date-choice-title">Choose the final last working day</div>
                <label className="wqa-radio-label">
                  <input type="radio" name="wqFinalDate" checked={finalDateChoice===resignationDetail.system_calculated_last_working_day || !finalDateChoice}
                    onChange={()=>setFinalDateChoice(resignationDetail.system_calculated_last_working_day)} />
                  System Calculated: {formatDate(resignationDetail.system_calculated_last_working_day)}
                </label>
                {resignationDetail.requested_last_working_day && (
                  <label className="wqa-radio-label-last">
                    <input type="radio" name="wqFinalDate" checked={finalDateChoice===resignationDetail.requested_last_working_day}
                      onChange={()=>setFinalDateChoice(resignationDetail.requested_last_working_day)} />
                    Employee Requested: {formatDate(resignationDetail.requested_last_working_day)}
                  </label>
                )}
                <div className="wqa-mt10">
                  <label className="wqa-field-label">Cheque Collection Date</label>
                  <DatePicker value={chequeDate} onChange={setChequeDate} style={{width:200}} />
                </div>
              </div>
            )}
            {wfStep.can_reject !== false && (
              <div className="wqa-mb12">
                <label className="wqa-field-label">
                  Notes {wfStep.reject_label ? `(required for ${wfStep.reject_label})` : "(optional)"}
                </label>
                <textarea className="form-input wqa-textarea-resize" rows={3} value={note}
                  onChange={e=>setNote(e.target.value)}
                  placeholder="Add a note..." />
              </div>
            )}
            {error && <div className="wqa-error-text">{error}</div>}
            <div className="wqa-btn-row">
              {wfStep.can_reject !== false && (
                <button className="btn btn-ghost btn-sm wqa-reject-btn" disabled={acting}
                  onClick={() => act("reject")}>
                  {wfStep.reject_label || "Reject"}
                </button>
              )}
              <button className="btn btn-primary btn-sm wqa-btn-white" disabled={acting}
                onClick={async () => {
                  if (item.entity_type === "resignation" && resignationDetail?.status === "manager_approved") {
                    setActing(true); setError("");
                    try {
                      const payload = { action: "approve", note };
                      if (finalDateChoice) payload.final_last_working_day = finalDateChoice;
                      if (chequeDate) payload.cheque_collection_date = chequeDate;
                      await resignationApi.advance(item.entity_id, payload);
                      if (onActed) onActed(); onClose();
                    } catch(e) { setError(e.response?.data?.message || "Failed."); }
                    finally { setActing(false); }
                  } else {
                    act(wfStep.step_type);
                  }
                }}>
                {wfStep.action_label || wfStep.step_name || "Approve"}
              </button>
            </div>
          </div>
        )}

        {!loading && item.entity_type === "resignation_experience_letter" && item.status === "pending" && (
          <div className="wqa-section">
            <div className="wqa-step-desc">
              Review the employee's experience letter details and approve or request changes from the full Resignations page.
            </div>
            <button className="btn btn-primary btn-sm wqa-btn-white"
              onClick={() => { onClose(); navigate(`/hr/resignations?id=${item.entity_id}`); }}>
              Open Experience Letter Review
            </button>
          </div>
        )}

        {!loading && !wfStep && item.status === "pending" && item.entity_type !== "resignation_experience_letter" && (
          <div className="wqa-no-action">
            No pending action for your role on this request.
            <br/>
            <a href="#" onClick={(e) => { e.preventDefault(); onClose(); navigate(
              item.entity_type==="resignation" ? `/hr/resignations?id=${item.entity_id}` :
              // A purchase requisition's default workflow link points to Pending
              // Approvals (where approvers act on it) - but when the viewer is
              // the submitter rather than an approver, that page shows nothing
              // for them, so send submitters to their own requisitions list instead.
              (item.entity_type==="purchase_requisition" && String(item.submitter_id)===String(user?.id)) ? `/procurement/my-requisitions?id=${item.entity_id}` :
              item.link
            ); }} className="wqa-link">Open full request →</a>
          </div>
        )}

        {item.status !== "pending" && (
          <div className="wqa-final-status">
            This request is <strong>{item.status}</strong>.
          </div>
        )}


      </div>
    </div>
  );
}
