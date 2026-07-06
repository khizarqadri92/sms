import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

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
  const [pr, setPr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState(false);

  const fetchDetail = () => {
    setLoading(true);
    procurementApi.getRequisition(requisitionId)
      .then(r => setPr(r.data.data))
      .catch(() => setError("Failed to load requisition."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(); }, [requisitionId]);

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

            {pr.approval_steps.length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Approval Timeline</div>
                <div style={{ position: "relative", paddingLeft: 24, marginBottom: 16 }}>
                  <div style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: "#e2e8f0" }} />
                  {pr.approval_steps.map(step => {
                    const color = step.status === "approved" ? "#16a34a" : step.status === "rejected" ? "#dc2626" : step.status === "skipped" ? "#94a3b8" : "#f59e0b";
                    return (
                      <div key={step.id} style={{ position: "relative", marginBottom: 16 }}>
                        <div style={{ position: "absolute", left: -24, top: 2, width: 14, height: 14, borderRadius: "50%", background: color, border: "3px solid #fff", boxShadow: "0 0 0 1px " + color }} />
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          Step {step.step_order}: {roleLabel(step.approver_role)}
                          {step.resolved_approver_name && <span style={{ fontWeight: 400, color: "#64748b" }}> ({step.resolved_approver_name})</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, textTransform: "capitalize" }}>{step.status}</div>
                        {step.acted_by_name && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{step.acted_by_name} · {fmtDateTime(step.acted_at)}</div>
                        )}
                        {step.notes && <div style={{ fontSize: 12, color: "#374151", marginTop: 4, fontStyle: "italic" }}>"{step.notes}"</div>}
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
                  <button className="btn btn-danger" disabled={acting} onClick={() => handleAct("reject")}>Reject</button>
                  <button className="btn btn-primary" disabled={acting} onClick={() => handleAct("approve")}>Approve</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
