import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import RequisitionDetailModal from "../components/RequisitionDetailModal";

export default function PendingApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [viewId, setViewId] = useState(null);

  const fetchPending = () => {
    setLoading(true);
    procurementApi.getPendingMyApproval()
      .then(r => setPending(r.data.data || []))
      .catch(() => setError("Failed to load pending approvals."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Pending My Approval</h1>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : pending.length === 0 ? (
        <div className="empty-state">Nothing awaiting your approval right now.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>PR Number</th>
                <th>Requested By</th>
                <th>Department</th>
                <th>Priority</th>
                <th>Est. Total</th>
                <th>Step</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(pr => (
                <tr key={pr.id}>
                  <td><strong>{pr.pr_number}</strong></td>
                  <td>{pr.requested_by_name}</td>
                  <td>{pr.department_name || "-"}</td>
                  <td style={{ textTransform: "capitalize" }}>{pr.priority}{pr.is_emergency && " (Emergency)"}</td>
                  <td>Rs. {Number(pr.total_estimated_amount).toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>Step {pr.current_step_order} of {pr.total_steps}</td>
                  <td>
                    <button className="btn btn-primary btn-xs" onClick={() => setViewId(pr.id)}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewId && (
        <RequisitionDetailModal
          requisitionId={viewId}
          showApprovalActions={true}
          onClose={() => setViewId(null)}
          onActed={() => { showToast("Decision recorded."); fetchPending(); }}
        />
      )}
    </div>
  );
}
