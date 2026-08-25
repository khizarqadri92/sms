import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useAuth } from "../auth/AuthContext";
import workflowApi from "../api/workflowApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";



const roleLabel = (role) => ({
  department_head: "Department Head",
  teacher: "Teacher",
  principal: "Principal",
  finance_officer: "Finance Officer",
  procurement: "Procurement Officer",
  admin: "Admin",
  superadmin: "Super Admin",
}[role] || role);

const statusBadge = (status) => ({
  draft: "badge-gray",
  submitted: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
  converted_to_po: "badge-primary",
}[status] || "badge-gray");

export default function RequisitionDetailModal({ requisitionId, onClose, onActed, showApprovalActions }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";
  const fmtDateTime = (d) => d ? formatDateTime(d) : "-";
  const [pr, setPr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState(false);
  const [wfStep, setWfStep] = useState(null);
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const loadWfStep = async (prId) => {
    try {
      const r = await workflowApi.getInstance("procurement", "purchase_requisition", prId);
      const steps = r.data.data?.steps || [];
      const pending = steps.find(s => s.status === "pending" && (
        s.assigned_to_id === user?.id ||
        (s.assigned_role && userRoles.includes(s.assigned_role))
      ));
      setWfStep(pending || null);
    } catch { setWfStep(null); }
  };

  const fetchDetail = () => {
    setLoading(true);
    procurementApi.getRequisition(requisitionId)
      .then(r => setPr(r.data.data))
      .catch(() => setError("Failed to load requisition."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(); }, [requisitionId]);
  useEffect(() => { if (requisitionId && user?.id) loadWfStep(requisitionId); }, [requisitionId, user?.id]);

  const handleAct = async (action) => {
    if (action === "reject" && !notes) {
      setError("Please provide a reason for rejection.");
      return;
    }
    setActing(true); setError("");
    try {
      await procurementApi.actOnRequisition(requisitionId, { action, notes });
      if (onActed) onActed();
      fetchDetail();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to record decision.");
    } finally {
      setActing(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : !pr ? (
          <div className="alert alert-error">Failed to load requisition.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{pr.pr_number}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{pr.requested_by_name} · {pr.department_name || "No department"} · {fmtDate(pr.created_at)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className={"badge " + statusBadge(pr.status)} style={{ textTransform: "capitalize" }}>{pr.status.replace("_", " ")}</span>
                {pr.workflow_steps && pr.workflow_steps.length > 0 && (
                  <span style={{ fontSize: 12, marginLeft: 8, color: "#64748b" }}>
                    {pr.workflow_steps.filter(s => s.status === "approved").length}/{pr.workflow_steps.length} steps done
                    {pr.current_wf_step ? " · Now: " + pr.current_wf_step : " · Completed"}
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
              </div>
            </div>

            {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16, marginBottom: 16 }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Priority</div>
                <div style={{ fontSize: 14, fontWeight: 700, textTransform: "capitalize" }}>{pr.priority}{pr.is_emergency && " (Emergency)"}</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Estimated Total</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Rs. {Number(pr.total_estimated_amount).toLocaleString()}</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Approval Rule</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{pr.matched_rule_name || "-"}</div>
              </div>
            </div>

            {pr.budget_head && (
              <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Budget Head:</strong> {pr.budget_head}</div>
            )}
            {pr.remarks && (
              <div style={{ fontSize: 13, marginBottom: 16 }}><strong>Remarks:</strong> {pr.remarks}</div>
            )}

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Items</div>
            <div className="table-container" style={{ marginBottom: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Est. Unit Price</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.items.map(it => (
                    <tr key={it.id}>
                      <td>
                        {it.item_description}{it.category_name && <span style={{ fontSize: 11, color: "#94a3b8" }}> ({it.category_name})</span>}
                        {it.specifications && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            {Object.entries(it.specifications).map(([k, v]) => k + ": " + v).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td>{Number(it.quantity).toLocaleString()}</td>
                      <td>{it.unit}</td>
                      <td>{it.estimated_unit_price ? "Rs. " + Number(it.estimated_unit_price).toLocaleString() : "-"}</td>
                      <td>{it.estimated_unit_price ? "Rs. " + (Number(it.quantity) * Number(it.estimated_unit_price)).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(pr.workflow_steps && pr.workflow_steps.length > 0 ? pr.workflow_steps : pr.approval_steps || []).length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Approval Timeline</div>
                <div style={{ position: "relative", paddingLeft: 24, marginBottom: 16 }}>
                  <div style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: "#e2e8f0" }} />
                  {(pr.workflow_steps && pr.workflow_steps.length > 0 ? pr.workflow_steps : pr.approval_steps || []).map((step, idx) => {
                    const isEngine = !!(pr.workflow_steps && pr.workflow_steps.length > 0);
                    const status = isEngine ? step.status : step.status;
                    const color = status === "approved" ? "#16a34a" : status === "rejected" ? "#dc2626" : status === "skipped" ? "#94a3b8" : "#f59e0b";
                    const stepName = isEngine ? step.step_name : ("Step " + step.step_order + ": " + roleLabel(step.approver_role));
                    const stepNum = isEngine ? step.step_order : step.step_order;
                    return (
                      <div key={idx} style={{ position: "relative", marginBottom: 16 }}>
                        <div style={{ position: "absolute", left: -24, top: 2, width: 14, height: 14, borderRadius: "50%", background: color, border: "3px solid #fff", boxShadow: "0 0 0 1px " + color }} />
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          Step {stepNum}: {stepName}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, textTransform: "capitalize" }}>{status}</div>
                        {isEngine && step.assigned_role && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Assigned to: {step.assigned_role.replace(/_/g," ")}</div>
                        )}
                        {!isEngine && step.acted_by_name && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{step.acted_by_name} · {fmtDateTime(step.acted_at)}</div>
                        )}
                        {isEngine && step.actioned_at && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmtDateTime(step.actioned_at)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {showApprovalActions && (
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
                <div className="form-group">
                  <label className="form-label">Notes (required for rejection)</label>
                  <textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  {wfStep && (
                    <>
                      {wfStep.can_reject !== false && (
                        <button className="btn btn-danger" disabled={acting} onClick={() => handleAct("reject")}>
                          {wfStep.reject_label || "Reject"}
                        </button>
                      )}
                      <button className="btn btn-primary" disabled={acting} onClick={() => handleAct(wfStep.step_type)}>
                        {wfStep.action_label || wfStep.step_name || "Approve"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
