import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import workflowApi from "../api/workflowApi";
import { leavesApi } from "../api/leavesApi";
import { useAuth } from "../auth/AuthContext";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

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
  const userRole     = roles[0] || "";

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
            <button className={btnClass} style={{ background: size === "modal" ? "#166534" : undefined, color: size === "table" ? "#166534" : undefined, marginLeft: size === "table" ? 6 : 0 }}
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
          <button className={btnClass} style={{ background: size === "modal" ? "#166534" : undefined, color: size === "table" ? "#166534" : undefined, marginLeft: size === "table" ? 6 : 0 }}
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
        <div style={{ display: "flex", gap: 8 }}>
          {pendingCount > 0 && (
            <span style={{ background: "#fef9c3", color: "#854d0e", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {pendingCount} pending
            </span>
          )}
          {recCount > 0 && (
            <span style={{ background: "#dbeafe", color: "#1e40af", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {recCount} recommended
            </span>
          )}
        </div>
      </div>

      {toast && (
        <div className={toastType === "error" ? "alert alert-error" : "alert alert-success"} style={{ marginBottom: 16 }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            fontWeight: filter === f ? 600 : 400, fontSize: 13, textTransform: "capitalize",
            borderBottom: filter === f ? "2px solid #2563eb" : "2px solid transparent",
            color: filter === f ? "#2563eb" : "var(--color-text-secondary)",
          }}>{f}</button>
        ))}
      </div>

      <div className="section-card" style={{ padding: 0 }}>
        {leaves.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
            No {filter === "all" ? "" : filter} leave requests found.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--color-background-tertiary)", borderBottom: "2px solid var(--color-border-tertiary)" }}>
                {["Student","Class","Leave Type","From","To","Days","Status","Applied","Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map((lr, i) => (
                <tr key={lr.id} style={{ borderBottom: "1px solid var(--color-border-tertiary)", background: i % 2 === 0 ? "transparent" : "var(--color-background-tertiary)" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{lr.student_name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{lr.enrollment_no}</div>
                  </td>
                  <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)", fontSize: 13 }}>{lr.class_name}{lr.class_section ? " (" + lr.class_section + ")" : ""}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 500 }}>{lr.leave_type}</td>
                  <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)" }}>{fmtDate(lr.from_date)}</td>
                  <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)" }}>{fmtDate(lr.to_date)}</td>
                  <td style={{ padding: "12px 14px" }}>{lr.total_days}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20,
                      fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                      background: STATUS_COLORS[lr.status]?.bg,
                      color: STATUS_COLORS[lr.status]?.color,
                    }}>{lr.status}</span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {formatDate(lr.applied_at)}
                  </td>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#0f172a" }}>Leave Request #{detail.id}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{detail.student_name} - {detail.leave_type}</div>
              </div>
              <span style={{
                padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                background: STATUS_COLORS[detail.status]?.bg, color: STATUS_COLORS[detail.status]?.color,
              }}>{detail.status}</span>
            </div>

            <div style={{ padding: "20px 24px", flex: 1 }}>
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
                <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 }}>
                  <span style={{ minWidth: 130, fontWeight: 500, color: "#64748b", flexShrink: 0 }}>{row.label}</span>
                  <span style={{ color: "#0f172a" }}>{row.value}</span>
                </div>
              ))}
              {detail.certificate_url && (
                <div style={{ marginTop: 14 }}>
                  <button onClick={async () => {
                    const r = await fetch(leavesApi.getCertUrl(detail.id), { headers: { Authorization: "Bearer " + sessionStorage.getItem("access_token") } });
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  }} style={{ color: "#2563eb", fontSize: 14, fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    View Certificate
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
              <ActionButtons lr={detail} size="modal" />
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {action && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: "#0f172a", textTransform: "capitalize" }}>
                {action.type} Leave Request #{action.id}
              </div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div className="form-group">
                <label className="form-label">
                  {action.type === "reject" ? "Rejection reason *" : "Note (optional)"}
                </label>
                <textarea className="form-control" value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={action.type === "reject" ? "State reason for rejection..." : "Optional note..."}
                  style={{ minHeight: 90, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc" }}>
              <button className="btn btn-secondary" onClick={() => setAction(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading}
                style={{ background: action.type === "reject" ? "#991b1b" : action.type === "approve" ? "#166534" : "#2563eb" }}
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