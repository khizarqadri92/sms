import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import workflowApi from "../api/workflowApi";
import { leavesApi } from "../api/leavesApi";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./LeaveApproval.css";

const STATUS_COLORS = {
  pending:     { bg: "#fef9c3", color: "#854d0e" },
  recommended: { bg: "#dbeafe", color: "#1e40af" },
  approved:    { bg: "#dcfce7", color: "#166534" },
  rejected:    { bg: "#fee2e2", color: "#991b1b" },
};

const FILTERS = ["pending", "recommended", "approved", "rejected", "all"];



export default function LeaveApproval() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "";
  const { user } = useAuth();
  const perms        = user?.permissions || [];
  const roles        = user?.roles || [];
  const canRecommend = perms.includes("leave.recommend");
  const canApprove   = perms.includes("leave.approve");
  const userRole     = effectiveRole(user) || "";

  const canApproveLeave = (lr) => {
    if (canApprove) return true;
    if (!lr.needs_recommendation && lr.approver_role === userRole) return true;
    if (lr.status === "recommended" && lr.approver_role === userRole) return true;
    return false;
  };

  const canRecommendLeave = (lr) => {
    if (!canRecommend) return false;
    if (!lr.needs_recommendation) return false;
    // Only show recommend if user role matches the configured recommender role
    if (lr.recommender_role && lr.recommender_role !== userRole) return false;
    return true;
  };

  const [leaves, setLeaves]   = useState([]);
  const [filter, setFilter]   = useState(new URLSearchParams(window.location.search).get("id") ? "all" : "pending");
  const [detail, setDetail]   = useState(null);
  const [action, setAction]   = useState(null);
  const [note, setNote]       = useState("");
  const [toast, setToast]     = useState("");
  const [toastType, setToastType] = useState("success");
  const [loading, setLoading] = useState(false);
  const [wfStep, setWfStep] = useState(null);

  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get("id") ? "all" : "pending";

  const loadWfStep = async (leaveId) => {
    try {
      const r = await workflowApi.getInstance("leaves", "leave_application", leaveId);
      const steps = r.data.data?.steps || [];
      const pending = steps.find(s => s.status === "pending");
      setWfStep(pending || null);
    } catch { setWfStep(null); }
  };

  const load = async () => {
    try {
      const r = await leavesApi.getLeaves({ status: filter === "all" ? undefined : filter });
      setLeaves(r.data.data || []);
    } catch { flash("error", "Failed to load leave requests."); }
  };

  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    const targetId = searchParams.get("id");
    if (targetId && leaves.length > 0) {
      const found = leaves.find(l => String(l.id) === String(targetId));
      if (found) setDetail(found);
    }
  }, [leaves, searchParams]);

  useEffect(() => {
    if (detail) loadWfStep(detail.id);
    else setWfStep(null);
  }, [detail?.id]);

  const flash = (type, text) => {
    setToastType(type); setToast(text);
    setTimeout(() => setToast(""), 3500);
  };

  const doAction = async () => {
    if (action.type === "reject" && !note.trim()) return flash("error", "Rejection reason is required.");
    setLoading(true);
    try {
      if (action.type === "recommend") {
        await leavesApi.recommend(action.id, { note });
        flash("success", "Leave recommended successfully.");
      } else {
        await leavesApi.actionLeave(action.id, { action: action.type, note });
        flash("success", "Leave " + action.type + "d successfully.");
      }
      setAction(null); setNote(""); setDetail(null); load();
    } catch (e) {
      flash("error", e.response?.data?.message || "Action failed.");
    } finally { setLoading(false); }
  };

  const pendingCount = leaves.filter(l => l.status === "pending").length;
  const recCount     = leaves.filter(l => l.status === "recommended").length;

  const ActionButtons = ({ lr, size = "table" }) => {
    const btnClass = size === "table" ? "btn btn-ghost btn-sm" : "btn btn-primary";
    return (
      <>
                {/* Workflow engine: show buttons based on current step */}
        {wfStep && (user?.id === wfStep.assigned_to_id || (wfStep.assigned_role && roles.includes(wfStep.assigned_role))) && lr.status !== "approved" && lr.status !== "rejected" && (
          <>
            <button className={btnClass} style={{ "--btn-bg": size === "modal" ? "#166534" : undefined, "--btn-color": size === "table" ? "#166534" : undefined, marginLeft: size === "table" ? 6 : 0, background: "var(--btn-bg)", color: "var(--btn-color)" }}
              onClick={() => { setAction({ id: lr.id, type: wfStep.step_type }); setNote(""); }}>
              {wfStep.action_label || wfStep.step_name || wfStep.step_type}
            </button>
            {wfStep.can_reject !== false && (
              <button className={btnClass} style={{ color: "#991b1b", marginLeft: 4 }}
                onClick={() => { setAction({ id: lr.id, type: "reject" }); setNote(""); }}>
                {wfStep.reject_label || "Reject"}
              </button>
            )}
          </>
        )}
        {/* Legacy non-engine: fallback permission-based buttons */}
        {!wfStep && canRecommendLeave(lr) && lr.status === "pending" && (
          <button className={btnClass} style={{ marginLeft: size === "table" ? 6 : 0 }}
            onClick={() => { setAction({ id: lr.id, type: "recommend" }); setNote(""); }}>
            Recommend
          </button>
        )}
        {!wfStep && canApproveLeave(lr) && (lr.status === "pending" || lr.status === "recommended") && (
          <button className={btnClass} style={{ "--btn-bg": size === "modal" ? "#166534" : undefined, "--btn-color": size === "table" ? "#166534" : undefined, marginLeft: size === "table" ? 6 : 0, background: "var(--btn-bg)", color: "var(--btn-color)" }}
            onClick={() => { setAction({ id: lr.id, type: "approve" }); setNote(""); }}>
            Approve
          </button>
        )}
      </>
    );
  };

  if (userRole === "hr") return (
    <div>
      <div className="page-header"><h1 className="page-heading">Staff Leave Requests</h1></div>
      <div className="section-card" style={{ textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>??</div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Staff Leave Management Coming Soon</div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Teacher and staff leave requests will be managed here.</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Leave Requests</h1>
        <div className="la-header-badges">
          {pendingCount > 0 && (
            <span className="la-pending-badge">
              {pendingCount} pending
            </span>
          )}
          {recCount > 0 && (
            <span className="la-recommended-badge">
              {recCount} recommended
            </span>
          )}
        </div>
      </div>

      {toast && (
        <div className={(toastType === "error" ? "alert alert-error" : "alert alert-success") + " la-toast"}>
          {toast}
        </div>
      )}

      <div className="la-tab-row">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} className="la-tab-btn"
            style={{ "--tab-weight": filter === f ? 600 : 400, "--tab-border": filter === f ? "#2563eb" : "transparent", "--tab-color": filter === f ? "#2563eb" : "var(--color-text-secondary)" }}>{f}</button>
        ))}
      </div>

      <div className="section-card la-card-flat">
        {leaves.length === 0 ? (
          <div className="la-empty-text">
            No {filter === "all" ? "" : filter} leave requests found.
          </div>
        ) : (
          <table className="la-table">
            <thead>
              <tr className="la-th-row">
                {["Student","Class","Leave Type","From","To","Days","Status","Applied","Actions"].map(h => (
                  <th key={h} className="la-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map((lr, i) => (
                <tr key={lr.id} className="la-tr" style={{ "--row-bg": i % 2 === 0 ? "transparent" : "var(--color-background-tertiary)" }}>
                  <td className="la-td">
                    <div style={{ fontWeight: 600 }}>{lr.student_name}</div>
                    <div className="la-td-sub">{lr.enrollment_no}</div>
                  </td>
                  <td className="la-td-muted-sm">{lr.class_name}{lr.class_section ? " (" + lr.class_section + ")" : ""}</td>
                  <td className="la-td-med">{lr.leave_type}</td>
                  <td className="la-td-muted">{fmtDate(lr.from_date)}</td>
                  <td className="la-td-muted">{fmtDate(lr.to_date)}</td>
                  <td className="la-td">{lr.total_days}</td>
                  <td className="la-td">
                    <span className="la-status-badge" style={{ "--status-bg": STATUS_COLORS[lr.status]?.bg, "--status-color": STATUS_COLORS[lr.status]?.color }}>{lr.status}</span>
                  </td>
                  <td className="la-td-nowrap-muted">
                    {formatDate(lr.applied_at)}
                  </td>
                  <td className="la-td-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetail(lr)}>View</button>
                    <ActionButtons lr={lr} size="table" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div className="la-modal-overlay">
          <div className="la-modal-box">
            <div className="la-modal-header">
              <div>
                <div className="la-modal-title">Leave Request #{detail.id}</div>
                <div className="la-modal-subtitle">{detail.student_name} - {detail.leave_type}</div>
              </div>
              <span className="la-modal-status-badge" style={{ "--status-bg": STATUS_COLORS[detail.status]?.bg, "--status-color": STATUS_COLORS[detail.status]?.color }}>{detail.status}</span>
            </div>

            <div className="la-modal-body">
              {[
                { label: "Student",    value: detail.student_name + " (" + detail.enrollment_no + ")" },
                { label: "Class",      value: detail.class_name + (detail.class_section ? " (" + detail.class_section + ")" : "") },
                { label: "Leave Type", value: detail.leave_type },
                { label: "From",       value: fmtDate(detail.from_date) },
                { label: "To",         value: fmtDate(detail.to_date) },
                { label: "Total Days", value: detail.total_days + " day" + (detail.total_days !== 1 ? "s" : "") },
                { label: "Reason",     value: detail.reason },
                { label: "Applied By", value: detail.applied_by_name + " on " + formatDateTime(detail.applied_at) },
                detail.recommender_name && { label: "Recommended By", value: detail.recommender_name + (detail.recommender_note ? " - " + detail.recommender_note : "") },
                detail.approver_name    && { label: "Actioned By",    value: detail.approver_name },
                detail.approver_note    && { label: "Approver Note",  value: detail.approver_note },
                detail.rejection_reason && { label: "Rejection",      value: detail.rejection_reason },
              ].filter(Boolean).map((row, i) => (
                <div key={i} className="la-detail-row">
                  <span className="la-detail-label">{row.label}</span>
                  <span className="la-detail-value">{row.value}</span>
                </div>
              ))}
              {detail.certificate_url && (
                <div className="la-cert-wrap">
                  <button onClick={async () => {
                    const r = await fetch(leavesApi.getCertUrl(detail.id), { headers: { Authorization: "Bearer " + sessionStorage.getItem("access_token") } });
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  }} className="la-cert-btn">
                    View Certificate
                  </button>
                </div>
              )}
            </div>

            <div className="la-modal-footer">
              <ActionButtons lr={detail} size="modal" />
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {action && (
        <div className="la-modal-overlay" style={{ zIndex: 1001 }}>
          <div className="la-action-modal-box">
            <div className="la-action-modal-header">
              <div className="la-action-modal-title">
                {action.type} Leave Request #{action.id}
              </div>
            </div>
            <div className="la-action-modal-body">
              <div className="form-group">
                <label className="form-label">
                  {action.type === "reject" ? "Rejection reason *" : "Note (optional)"}
                </label>
                <textarea className="form-control la-textarea" value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={action.type === "reject" ? "State reason for rejection..." : "Optional note..."} />
              </div>
            </div>
            <div className="la-action-modal-footer">
              <button className="btn btn-secondary" onClick={() => setAction(null)}>Cancel</button>
              <button className="btn btn-primary la-action-submit-btn" disabled={loading}
                style={{ "--submit-bg": action.type === "reject" ? "#991b1b" : action.type === "approve" ? "#166534" : "#2563eb" }}
                onClick={doAction}>
                {loading ? "Processing..." : action.type.charAt(0).toUpperCase() + action.type.slice(1)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}