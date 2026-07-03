import { useState, useEffect, useRef } from "react";
import { leavesApi } from "../api/leavesApi";
import { useAuth } from "../auth/AuthContext";

const STATUS_COLORS = {
  pending:     { bg: "#fef9c3", color: "#854d0e" },
  recommended: { bg: "#dbeafe", color: "#1e40af" },
  approved:    { bg: "#dcfce7", color: "#166534" },
  rejected:    { bg: "#fee2e2", color: "#991b1b" },
};

const fmtDate = (d) => { if (!d) return ''; const s = String(d); if (s.includes(' ')) { const parts = s.split(' '); return parts[1] + ' ' + parts[2] + ' ' + parts[3]; } return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); };

export default function Leaves() {
  const { user, can } = useAuth();
  const canApply = can("leave.apply");
  const role = user?.roles?.[0] || "";
  const isParent = role === "parent";

  const [children, setChildren]   = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [leaves, setLeaves]       = useState([]);
  const [balance, setBalance]     = useState([]);
  const [types, setTypes]         = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [detail, setDetail]       = useState(null);
  const [toast, setToast]         = useState("");
  const [toastType, setToastType] = useState("success");
  const [loading, setLoading]     = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [tab, setTab]             = useState("requests");
  const fileRef = useRef();

  const [form, setForm] = useState({
    leave_type_id: "", from_date: "", to_date: "", reason: "", certificate: null,
  });

  const flash = (type, text) => {
    setToastType(type); setToast(text);
    setTimeout(() => setToast(""), 3500);
  };

  // Load children first for parent
  useEffect(() => {
    const init = async () => {
      try {
        if (isParent) {
          const cr = await leavesApi.getMyChildren();
          const kids = cr.data.data || [];
          setChildren(kids.filter(k => k.status !== "withdrawn"));
          if (kids.length > 0) setSelectedChild(kids[0]);
        }
        const lt = await leavesApi.getActiveLeaveTypes();
        setTypes(lt.data.data || []);
      } catch (e) {
        flash("error", "Failed to load page data.");
      } finally {
        setPageLoading(false);
      }
    };
    init();
  }, [isParent]);

  // Load leaves + balance when selectedChild changes (or on mount for students)
  useEffect(() => {
    if (isParent && !selectedChild) return;
    loadLeavesAndBalance();
  }, [selectedChild]);

  const loadLeavesAndBalance = async () => {
    try {
      const params = isParent && selectedChild ? { student_id: selectedChild.id } : {};
      const [lr, lb] = await Promise.all([
        leavesApi.getLeaves(params),
        leavesApi.getBalance(params),
      ]);
      setLeaves(lr.data.data || []);
      setBalance(lb.data.data || []);
    } catch (e) {
      flash("error", e?.response?.data?.message || e.message || "Failed to load leave data.");
    }
  };

  const selectedType = types.find(t => t.id === parseInt(form.leave_type_id));

  const getCertRule = () => {
    if (!selectedType || !form.from_date || !form.to_date) return null;
    const days = Math.ceil((new Date(form.to_date) - new Date(form.from_date)) / 86400000) + 1;
    return (selectedType.rules || []).find(r => days >= r.day_from && (r.day_to == null || days <= r.day_to));
  };
  const certRule = getCertRule();

  const submit = async () => {
    if (!canApply) return flash("error", "You do not have permission to apply for leave.");
    if (!form.leave_type_id) return flash("error", "Select a leave type.");
    if (!form.from_date || !form.to_date) return flash("error", "Select dates.");
    if (new Date(form.to_date) < new Date(form.from_date)) return flash("error", "To date cannot be before from date.");
    if (!form.reason.trim()) return flash("error", "Reason is required.");
    if (certRule?.certificate_required && !form.certificate) return flash("error", certRule.certificate_label || "Certificate is required.");
    if (isParent && !selectedChild) return flash("error", "Please select a child.");

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("leave_type_id", form.leave_type_id);
      fd.append("from_date", form.from_date);
      fd.append("to_date", form.to_date);
      fd.append("reason", form.reason);
      if (isParent && selectedChild) fd.append("student_id", selectedChild.id);
      if (form.certificate) fd.append("certificate", form.certificate);

      const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1";
      const r = await fetch(baseUrl + "/leaves/apply", {
        method: "POST",
        headers: { Authorization: "Bearer " + localStorage.getItem("access_token") },
        body: fd,
      });
      let data;
      try {
        data = await r.json();
      } catch (parseErr) {
        throw new Error("Server returned invalid response. Check backend is running.");
      }
      if (!r.ok) throw new Error(data.message || data.error || "Submission failed with status " + r.status);

      flash("success", "Leave request submitted successfully.");
      setShowForm(false);
      setForm({ leave_type_id: "", from_date: "", to_date: "", reason: "", certificate: null });
      loadLeavesAndBalance();
    } catch (e) { flash("error", e.message); }
    finally { setLoading(false); }
  };

  const today = new Date().toISOString().split("T")[0];

  if (pageLoading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">My Leaves</h1>
        {canApply && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Apply Leave</button>
        )}
      </div>

      {toast && (
        <div className={toastType === "error" ? "alert alert-error" : "alert alert-success"} style={{ marginBottom: 16 }}>
          {toast}
        </div>
      )}

      {/* Child selector for parent */}
      {isParent && children.length > 1 && (
        <div className="section-card" style={{ marginBottom: 16, padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontWeight: 500, fontSize: 14, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Viewing leaves for:</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {children.map(child => (
                <button key={child.id} onClick={() => setSelectedChild(child)} style={{
                  padding: "6px 16px", borderRadius: 20, border: "1px solid",
                  borderColor: selectedChild?.id === child.id ? "#2563eb" : "var(--color-border-secondary)",
                  background: selectedChild?.id === child.id ? "#eff6ff" : "var(--color-background-primary)",
                  color: selectedChild?.id === child.id ? "#1d4ed8" : "var(--color-text-primary)",
                  fontWeight: selectedChild?.id === child.id ? 600 : 400,
                  fontSize: 13, cursor: "pointer",
                }}>
                  {child.name}
                  <span style={{ fontSize: 11, marginLeft: 6, opacity: .7 }}>{child.class_name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Single child info bar */}
      {isParent && children.length === 1 && selectedChild && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af" }}>
          Showing leaves for <strong>{selectedChild.name}</strong> - {selectedChild.class_name}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {[{ key: "requests", label: "My Requests" }, { key: "balance", label: "Leave Balance" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === t.key ? 600 : 400, fontSize: 14,
            borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent",
            color: tab === t.key ? "#2563eb" : "var(--color-text-secondary)",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Requests Tab */}
      {tab === "requests" && (
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Leave Requests</span>
            <span className="badge badge-gray">{leaves.length} total</span>
          </div>
          {leaves.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
              No leave requests yet. Click "+ Apply Leave" to submit one.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--color-background-tertiary)", borderBottom: "2px solid var(--color-border-tertiary)" }}>
                  {["Leave Type","From","To","Days","Reason","Applied On","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaves.map((lr, i) => (
                  <tr key={lr.id} style={{ borderBottom: "1px solid var(--color-border-tertiary)", background: i % 2 === 0 ? "transparent" : "var(--color-background-tertiary)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 600 }}>{lr.leave_type}</td>
                    <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)" }}>{fmtDate(lr.from_date)}</td>
                    <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)" }}>{fmtDate(lr.to_date)}</td>
                    <td style={{ padding: "12px 14px" }}>{lr.total_days}</td>
                    <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lr.reason}</td>
                    <td style={{ padding: "12px 14px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{new Date(lr.applied_at).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 12px", borderRadius: 20,
                        fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                        background: STATUS_COLORS[lr.status]?.bg,
                        color: STATUS_COLORS[lr.status]?.color,
                      }}>{lr.status}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetail(lr)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Balance Tab */}
      {tab === "balance" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {balance.length === 0 ? (
            <div className="section-card" style={{ gridColumn: "1/-1", padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
              No leave balance information available.
            </div>
          ) : balance.map(b => (
            <div key={b.leave_type_id} className="section-card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{b.leave_type}</div>
              {b.max_days == null ? (
                <div>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>Unlimited leave</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Days used</span>
                    <span style={{ fontWeight: 600 }}>{b.days_used}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Used</span>
                    <span style={{ fontWeight: 600 }}>{b.days_used} / {b.max_days} days</span>
                  </div>
                  <div style={{ height: 8, background: "var(--color-border-tertiary)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{
                      height: "100%", borderRadius: 4,
                      width: Math.min(100, Math.round((b.days_used / b.max_days) * 100)) + "%",
                      background: b.days_remaining === 0 ? "#ef4444" : b.days_remaining <= 2 ? "#f59e0b" : "#2563eb",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Remaining</span>
                    <span style={{ fontWeight: 600, color: b.days_remaining === 0 ? "#ef4444" : b.days_remaining <= 2 ? "#f59e0b" : "#166534" }}>
                      {b.days_remaining} day{b.days_remaining !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Apply Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#0f172a" }}>Apply for Leave</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {isParent && selectedChild ? "Applying for: " + selectedChild.name : "Fill in the details to submit your leave request"}
                </div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: "2px 8px" }}>X</button>
            </div>

            <div style={{ padding: "20px 24px", flex: 1 }}>
              {/* Child selector inside modal for parent with multiple children */}
              {isParent && children.length > 1 && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Applying for *</label>
                  <select className="form-control" value={selectedChild?.id || ""}
                    onChange={e => setSelectedChild(children.find(c => c.id === parseInt(e.target.value)))}>
                    {children.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.class_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Leave Type *</label>
                <select className="form-control" value={form.leave_type_id}
                  onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value, certificate: null }))}>
                  <option value="">Select leave type</option>
                  {types.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.max_days_per_year ? " (max " + t.max_days_per_year + " days/yr)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">From Date *</label>
                  <input className="form-control" type="date" value={form.from_date} min={today}
                    onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">To Date *</label>
                  <input className="form-control" type="date" value={form.to_date}
                    min={form.from_date || today}
                    onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} />
                </div>
              </div>

              {certRule?.certificate_required && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#1e40af" }}>
                  Certificate required: {certRule.certificate_label || "Please upload a supporting document"}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Reason *</label>
                <textarea className="form-control" value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Briefly describe your reason for leave..."
                  style={{ minHeight: 90, resize: "vertical" }} />
              </div>

              {certRule?.certificate_required && (
                <div className="form-group">
                  <label className="form-label">Upload Certificate (PDF / JPG / PNG) *</label>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setForm(f => ({ ...f, certificate: e.target.files[0] }))}
                    style={{ fontSize: 13, marginTop: 4 }} />
                  {form.certificate && (
                    <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>Selected: {form.certificate.name}</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#0f172a" }}>Leave Request #{detail.id}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{detail.leave_type}</div>
              </div>
              <span style={{
                display: "inline-block", padding: "4px 14px", borderRadius: 20,
                fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                background: STATUS_COLORS[detail.status]?.bg,
                color: STATUS_COLORS[detail.status]?.color,
              }}>{detail.status}</span>
            </div>

            <div style={{ padding: "20px 24px", flex: 1 }}>
              {[
                { label: "Leave Type",  value: detail.leave_type },
                { label: "From",        value: fmtDate(detail.from_date) },
                { label: "To",          value: fmtDate(detail.to_date) },
                { label: "Total Days",  value: detail.total_days + " day" + (detail.total_days !== 1 ? "s" : "") },
                { label: "Reason",      value: detail.reason },
                { label: "Applied On",  value: new Date(detail.applied_at).toLocaleString() },
                detail.recommender_name && { label: "Recommended By", value: detail.recommender_name + (detail.recommender_note ? " - " + detail.recommender_note : "") },
                detail.approver_name    && { label: "Actioned By",    value: detail.approver_name },
                detail.approver_note    && { label: "Approver Note",  value: detail.approver_note },
                detail.rejection_reason && { label: "Rejection",      value: detail.rejection_reason },
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 }}>
                  <span style={{ minWidth: 140, fontWeight: 500, color: "#64748b", flexShrink: 0 }}>{row.label}</span>
                  <span style={{ color: "#0f172a" }}>{row.value}</span>
                </div>
              ))}
              {detail.certificate_url && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={async () => {
                    const r = await fetch(leavesApi.getCertUrl(detail.id), { headers: { Authorization: "Bearer " + localStorage.getItem("access_token") } });
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  }} style={{ color: "#2563eb", fontSize: 14, fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    View Certificate
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", background: "#f8fafc", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
              <button className="btn btn-primary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
