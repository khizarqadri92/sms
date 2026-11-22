import { useState, useEffect, useRef } from "react";
import { leavesApi } from "../api/leavesApi";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";
import "./StudentViews.css";

// Status pill colours: .sv-status--<status> in StudentViews.css (light + dark)
const statusClass = (s) => "sv-status" + (s ? " sv-status--" + s : "");



export default function Leaves() {
  const processingToday = useProcessingToday();
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "";
  const { user, can } = useAuth();
  const canApply = can("hr.leave_application", "hr.student_leave_application");
  const role = effectiveRole(user) || "";
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
        headers: { Authorization: "Bearer " + sessionStorage.getItem("access_token") },
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

  const today = processingToday;

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
        <div className={(toastType === "error" ? "alert alert-error" : "alert alert-success") + " sv-gap16"}>
          {toast}
        </div>
      )}

      {/* Child selector for parent */}
      {isParent && children.length > 1 && (
        <div className="section-card sv-childbar">
          <div className="sv-childbar-row">
            <span className="sv-childbar-label">Viewing leaves for:</span>
            <div className="sv-chips">
              {children.map(child => (
                <button key={child.id} onClick={() => setSelectedChild(child)}
                  className={"sv-chip" + (selectedChild?.id === child.id ? " sv-chip--on" : "")}>
                  {child.name}
                  <span className="sv-chip-class">{child.class_name}{child.class_section ? " (" + child.class_section + ")" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Single child info bar */}
      {isParent && children.length === 1 && selectedChild && (
        <div className="sv-info sv-info--bar">
          Showing leaves for <strong>{selectedChild.name}</strong> - {selectedChild.class_name}{selectedChild.class_section ? " (" + selectedChild.class_section + ")" : ""}
        </div>
      )}

      {/* Tab bar */}
      <div className="sv-tabs">
        {[{ key: "requests", label: "My Requests" }, { key: "balance", label: "Leave Balance" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={"sv-tab" + (tab === t.key ? " sv-tab--on" : "")}>{t.label}</button>
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
            <div className="sv-empty">
              No leave requests yet. Click "+ Apply Leave" to submit one.
            </div>
          ) : (
            <table className="sv-table">
              <thead>
                <tr>
                  {["Leave Type","From","To","Days","Reason","Applied On","Status",""].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaves.map((lr, i) => (
                  <tr key={lr.id}>
                    <td className="sv-td-strong">{lr.leave_type}</td>
                    <td className="sv-td-soft">{fmtDate(lr.from_date)}</td>
                    <td className="sv-td-soft">{fmtDate(lr.to_date)}</td>
                    <td>{lr.total_days}</td>
                    <td className="sv-td-soft sv-td-reason">{lr.reason}</td>
                    <td className="sv-td-soft sv-td-nowrap">{formatDate(lr.applied_at)}</td>
                    <td>
                      <span className={statusClass(lr.status)}>{lr.status}</span>
                    </td>
                    <td>
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
        <div className="sv-bal-grid">
          {balance.length === 0 ? (
            <div className="section-card sv-bal-empty">
              No leave balance information available.
            </div>
          ) : balance.map(b => (
            <div key={b.leave_type_id} className="section-card sv-bal-card">
              <div className="sv-bal-name">{b.leave_type}</div>
              {b.max_days == null ? (
                <div>
                  <div className="sv-bal-note">Unlimited leave</div>
                  <div className="sv-bal-row">
                    <span className="sv-soft">Days used</span>
                    <span className="sv-bal-val">{b.days_used}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="sv-bal-row sv-bal-row--mb">
                    <span className="sv-soft">Used</span>
                    <span className="sv-bal-val">{b.days_used} / {b.max_days} days</span>
                  </div>
                  <div className="sv-bar">
                    <div className={"sv-bar-fill" + (b.days_remaining === 0 ? " sv-bar-fill--empty" : b.days_remaining <= 2 ? " sv-bar-fill--low" : "")}
                      style={{ width: Math.min(100, Math.round((b.days_used / b.max_days) * 100)) + "%" }} />
                  </div>
                  <div className="sv-bal-row sv-bal-row--sm">
                    <span className="sv-soft">Remaining</span>
                    <span className={"sv-bal-val " + (b.days_remaining === 0 ? "sv-left-empty" : b.days_remaining <= 2 ? "sv-left-low" : "sv-left-ok")}>
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
        <div className="sv-overlay">
          <div className="sv-modal sv-modal--wide">
            <div className="sv-modal-head">
              <div>
                <div className="sv-modal-title">Apply for Leave</div>
                <div className="sv-modal-sub">
                  {isParent && selectedChild ? "Applying for: " + selectedChild.name : "Fill in the details to submit your leave request"}
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="sv-modal-x">X</button>
            </div>

            <div className="sv-modal-body">
              {/* Child selector inside modal for parent with multiple children */}
              {isParent && children.length > 1 && (
                <div className="form-group sv-mb14">
                  <label className="form-label">Applying for *</label>
                  <select className="form-control" value={selectedChild?.id || ""}
                    onChange={e => setSelectedChild(children.find(c => c.id === parseInt(e.target.value)))}>
                    {children.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.class_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group sv-mb14">
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

              <div className="sv-two">
                <div className="form-group">
                  <label className="form-label">From Date *</label>
                  <DatePicker value={form.from_date} min={today}
                    onChange={val => setForm(f => ({ ...f, from_date: val }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">To Date *</label>
                  <DatePicker value={form.to_date}
                    min={form.from_date || today}
                    onChange={val => setForm(f => ({ ...f, to_date: val }))} />
                </div>
              </div>

              {certRule?.certificate_required && (
                <div className="sv-info sv-info--note">
                  Certificate required: {certRule.certificate_label || "Please upload a supporting document"}
                </div>
              )}

              <div className="form-group sv-mb14">
                <label className="form-label">Reason *</label>
                <textarea value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Briefly describe your reason for leave..."
                  className="form-control sv-textarea" />
              </div>

              {certRule?.certificate_required && (
                <div className="form-group">
                  <label className="form-label">Upload Certificate (PDF / JPG / PNG) *</label>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setForm(f => ({ ...f, certificate: e.target.files[0] }))}
                    className="sv-file" />
                  {form.certificate && (
                    <div className="sv-picked">Selected: {form.certificate.name}</div>
                  )}
                </div>
              )}
            </div>

            <div className="sv-modal-foot">
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
        <div className="sv-overlay">
          <div className="sv-modal">
            <div className="sv-modal-head">
              <div>
                <div className="sv-modal-title">Leave Request #{detail.id}</div>
                <div className="sv-modal-sub">{detail.leave_type}</div>
              </div>
              <span className={statusClass(detail.status) + " sv-status--lg"}>{detail.status}</span>
            </div>

            <div className="sv-modal-body">
              {[
                { label: "Leave Type",  value: detail.leave_type },
                { label: "From",        value: fmtDate(detail.from_date) },
                { label: "To",          value: fmtDate(detail.to_date) },
                { label: "Total Days",  value: detail.total_days + " day" + (detail.total_days !== 1 ? "s" : "") },
                { label: "Reason",      value: detail.reason },
                { label: "Applied On",  value: formatDateTime(detail.applied_at) },
                detail.recommender_name && { label: "Recommended By", value: detail.recommender_name + (detail.recommender_note ? " - " + detail.recommender_note : "") },
                detail.approver_name    && { label: "Actioned By",    value: detail.approver_name },
                detail.approver_note    && { label: "Approver Note",  value: detail.approver_note },
                detail.rejection_reason && { label: "Rejection",      value: detail.rejection_reason },
              ].filter(Boolean).map((row, i) => (
                <div key={i} className="sv-row">
                  <span className="sv-row-key">{row.label}</span>
                  <span className="sv-row-val">{row.value}</span>
                </div>
              ))}
              {detail.certificate_url && (
                <div className="sv-cert">
                  <button onClick={async () => {
                    const r = await fetch(leavesApi.getCertUrl(detail.id), { headers: { Authorization: "Bearer " + sessionStorage.getItem("access_token") } });
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  }} className="sv-cert-btn">
                    View Certificate
                  </button>
                </div>
              )}
            </div>

            <div className="sv-modal-foot">
              <button className="btn btn-primary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
