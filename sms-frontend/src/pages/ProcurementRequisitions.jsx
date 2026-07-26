import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useAutoOpenById } from "../hooks/useAutoOpenById";
import RequisitionDetailModal from "../components/RequisitionDetailModal";

const statusBadge = (status) => ({
  draft: "badge-gray",
  submitted: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
  converted_to_po: "badge-primary",
}[status] || "badge-gray");

export default function ProcurementRequisitions() {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(window.location.search).get("id") ? "" : "submitted");
  const [viewId, setViewId] = useState(null);

  const fetchRequisitions = (status) => {
    setLoading(true);
    const params = {};
    const s = status !== undefined ? status : statusFilter;
    const fetchStatus = s === "in_progress" ? "submitted" : s;
    if (fetchStatus) params.status = fetchStatus;
    procurementApi.getAllRequisitions(params)
      .then(r => {
        let rows = r.data.data || [];
        if (s === "submitted") rows = rows.filter(p => !p.wf_is_engine || (p.wf_done_steps || 0) === 0);
        if (s === "in_progress") rows = rows.filter(p => p.wf_is_engine && (p.wf_done_steps || 0) > 0);
        setRequisitions(rows);
      })
      .catch(() => setError("Failed to load requisitions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRequisitions(); }, []);

  const filters = [
    { label: "Submitted", value: "submitted" },
    { label: "In Progress", value: "in_progress" },
    { label: "Approved (Ready for PO)", value: "approved" },
    { label: "Rejected", value: "rejected" },
    { label: "All", value: "" },
  ];

  useAutoOpenById(requisitions, (req) => setViewId(req.id));
  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Requisitions Pipeline</h1>
      </div>

      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
        Every Purchase Requisition across the school, regardless of who's currently approving it. Once a requisition shows "Approved," it's ready to move ahead to a Purchase Order.
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {filters.map(f => (
            <button
              key={f.value}
              className={"btn " + (statusFilter === f.value ? "btn-primary" : "btn-secondary")}
              onClick={() => { setStatusFilter(f.value); fetchRequisitions(f.value); }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : requisitions.length === 0 ? (
        <div className="empty-state">No requisitions match this filter.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>PR Number</th>
                <th>Requested By</th>
                <th>Department</th>
                <th>Priority</th>
                <th>Items</th>
                <th>Est. Total</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map(pr => (
                <tr key={pr.id}>
                  <td><strong>{pr.pr_number}</strong></td>
                  <td>{pr.requested_by_name}</td>
                  <td>{pr.department_name || "-"}</td>
                  <td style={{ textTransform: "capitalize" }}>{pr.priority}{pr.is_emergency && " (Emergency)"}</td>
                  <td>{pr.item_count}</td>
                  <td>Rs. {Number(pr.total_estimated_amount).toLocaleString()}</td>
                  <td><span className={"badge " + statusBadge(pr.status)} style={{ textTransform: "capitalize" }}>{pr.status.replace("_", " ")}</span></td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>
                    {pr.wf_is_engine
                      ? (pr.wf_current_step
                          ? pr.wf_current_step + " (" + pr.wf_step_order + "/" + pr.wf_total_steps + ")"
                          : pr.wf_status === "completed" ? "All steps complete" : pr.wf_status === "rejected" ? "Rejected" : "-")
                      : pr.status === "submitted" && pr.current_step_role
                        ? "Waiting on: " + pr.current_step_role.replace("_", " ") + " (step " + pr.current_step_order + "/" + pr.total_steps + ")"
                        : pr.status === "approved"
                          ? "All " + pr.total_steps + " steps complete"
                          : "-"}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-xs" onClick={() => setViewId(pr.id)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewId && (
        <RequisitionDetailModal requisitionId={viewId} onClose={() => setViewId(null)} showApprovalActions={true} onActed={() => { setViewId(null); fetchRequisitions(); }} />
      )}
    </div>
  );
}
