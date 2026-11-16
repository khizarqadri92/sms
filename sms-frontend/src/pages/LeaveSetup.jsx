import { useState, useEffect } from "react";
import { leavesApi } from "../api/leavesApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./LeaveSetup.css";

const RECOMMENDER_OPTIONS = [
  { value: "", label: "-- None --" },
  { value: "teacher",              label: "Class incharge" },
  { value: "academic_coordinator", label: "Academic coordinator" },
  { value: "principal",            label: "Principal" },
  { value: "admin",                label: "Admin" },
];

const APPROVER_OPTIONS = [
  { value: "teacher",              label: "Class incharge" },
  { value: "academic_coordinator", label: "Academic coordinator" },
  { value: "principal",            label: "Principal" },
  { value: "admin",                label: "Admin" },
];

const EMPTY_RULE = {
  day_from: 1, day_to: "",
  recommender_role: "", approver_role: "principal",
  certificate_required: false, certificate_label: "",
};

const EMPTY_FORM = {
  name: "", max_days_per_year: "",
  notify_mode: "incharge_only", is_active: true,
  rules: [{ ...EMPTY_RULE }],
};

export default function LeaveSetup() {
  const { isGlobalLocked } = useGovernanceMode("student_leave_types");
  const [types, setTypes]       = useState([]);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState("");
  const [error, setError]       = useState("");

  const load = async () => {
    try { const r = await leavesApi.getLeaveTypes(); setTypes(r.data.data || []); }
    catch { setError("Failed to load leave types."); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => { setToast(msg); setError(""); setTimeout(() => setToast(""), 3500); };

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true); setError(""); };

  const openEdit = (lt) => {
    setForm({
      name: lt.name,
      max_days_per_year: lt.max_days_per_year ?? "",
      notify_mode: lt.notify_mode || "incharge_only",
      is_active: lt.is_active,
      rules: lt.rules?.length ? lt.rules.map(r => ({
        day_from: r.day_from,
        day_to: r.day_to ?? "",
        recommender_role: r.recommender_role || "",
        approver_role: r.approver_role,
        certificate_required: r.certificate_required || false,
        certificate_label: r.certificate_label || "",
      })) : [{ ...EMPTY_RULE }],
    });
    setEditing(lt.id);
    setShowForm(true);
    setError("");
  };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setRule = (i, key, val) => setForm(f => {
    const rules = [...f.rules];
    rules[i] = { ...rules[i], [key]: val };
    if (key === "day_to" && val && i + 1 < rules.length) {
      rules[i + 1] = { ...rules[i + 1], day_from: parseInt(val) + 1 };
    }
    return { ...f, rules };
  });

  const addRule = () => {
    setForm(f => {
      const last    = f.rules[f.rules.length - 1];
      const newFrom = last.day_to ? parseInt(last.day_to) + 1 : last.day_from + 1;
      return { ...f, rules: [...f.rules, { ...EMPTY_RULE, day_from: newFrom }] };
    });
  };

  const removeRule = (i) => setForm(f => ({ ...f, rules: f.rules.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name.trim())   return setError("Leave type name is required.");
    if (!form.rules.length)  return setError("At least one approval rule is required.");
    for (let i = 0; i < form.rules.length; i++) {
      if (!form.rules[i].approver_role) return setError(`Rule ${i + 1}: approver is required.`);
      if (form.rules[i].certificate_required && !form.rules[i].certificate_label.trim())
        return setError(`Rule ${i + 1}: certificate instruction cannot be empty.`);
    }
    setLoading(true); setError("");
    try {
      const payload = {
        ...form,
        max_days_per_year: form.max_days_per_year === "" ? null : parseInt(form.max_days_per_year),
        rules: form.rules.map(r => ({ ...r, day_to: r.day_to === "" ? null : parseInt(r.day_to) })),
      };
      if (editing) await leavesApi.updateLeaveType(editing, payload);
      else         await leavesApi.createLeaveType(payload);
      showToast(editing ? "Leave type updated." : "Leave type created.");
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Save failed.");
    } finally { setLoading(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this leave type?")) return;
    try { await leavesApi.deleteLeaveType(id); showToast("Deleted."); load(); }
    catch (e) { setError(e.response?.data?.message || "Delete failed."); }
  };

  const ruleLabel = (rule) => {
    const range = rule.day_to ? `${rule.day_from}?${rule.day_to} days` : `${rule.day_from}+ days`;
    const rec   = rule.recommender_role ? `${RECOMMENDER_OPTIONS.find(r => r.value === rule.recommender_role)?.label} ? ` : "";
    const app   = APPROVER_OPTIONS.find(r => r.value === rule.approver_role)?.label || rule.approver_role;
    const cert  = rule.certificate_required ? " ? Certificate required" : "";
    return `${range}: ${rec}${app}${cert}`;
  };

  const seg = (val, opts, onChange) => (
    <div className="lsu-seg-wrap">
      {opts.map(opt => (
        <button key={String(opt.v)} onClick={() => onChange(opt.v)} className="lsu-seg-btn"
          style={{ "--seg-bg": val === opt.v ? "#2563eb" : "var(--bg-hover)", "--seg-color": val === opt.v ? "#fff" : "var(--text-secondary)", "--seg-weight": val === opt.v ? 600 : 400 }}>{opt.l}</button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Leave Setup</h1>
        {!isGlobalLocked && <button className="btn btn-primary" onClick={openCreate}>+ Add Leave Type</button>}
      </div>
      {isGlobalLocked && (
        <div className="alert lsu-locked-alert">
          Student Leave Types are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}

      {toast && <div className="alert alert-success lsu-toast">{toast}</div>}
      {error && !showForm && <div className="alert alert-error lsu-toast">{error}</div>}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Configured Leave Types</span>
          <span className="badge badge-gray">{types.length} types</span>
        </div>
        {types.length === 0 ? (
          <div className="lsu-empty-text">
            No leave types configured yet. Click "+ Add Leave Type" to get started.
          </div>
        ) : (
          <div className="lsu-types-stack">
            {types.map((lt, idx) => {
              const ACCENT_COLORS = ["#2563eb","#10b981","#f59e0b","#8b5cf6","#ef4444","#0ea5e9","#ec4899"];
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              return (
                <div key={lt.id} className="lsu-type-card" style={{ "--accent-color": accent }}>
                  {/* Header */}
                  <div className="lsu-type-header">
                    <div className="lsu-type-header-left">
                      <span className="lsu-type-name">{lt.name}</span>
                      <span className="lsu-status-pill" style={{ "--pill-bg": lt.is_active ? "var(--bg-success-soft)" : "var(--bg-danger-soft)", "--pill-color": lt.is_active ? "#166534" : "#991b1b" }}>{lt.is_active ? "Active" : "Inactive"}</span>
                      <span className="lsu-meta-pill">
                        {lt.max_days_per_year ? ("Max " + lt.max_days_per_year + " days/year") : "Unlimited days/year"}
                      </span>
                      <span className="lsu-meta-pill">
                        {lt.notify_mode === "all_teachers" ? "All teachers notified" : "Incharge notified"}
                      </span>
                    </div>
                    {!isGlobalLocked && (
                      <div className="lsu-type-actions">
                        <button onClick={() => openEdit(lt)} className="lsu-edit-btn">Edit</button>
                        <button onClick={() => remove(lt.id)} className="lsu-delete-btn">Delete</button>
                      </div>
                    )}
                  </div>

                  {/* Rules table */}
                  <table className="lsu-rules-table">
                    <thead>
                      <tr className="lsu-th-row">
                        <th className="lsu-th-wide">Day range</th>
                        <th className="lsu-th">Recommender</th>
                        <th className="lsu-th">Approver</th>
                        <th className="lsu-th">Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lt.rules || []).map((rule, ri) => (
                        <tr key={ri} className="lsu-rule-row" style={{ "--row-bg": ri % 2 === 0 ? "var(--bg-card)" : "var(--bg-hover)" }}>
                          <td className="lsu-td-range">
                            <div className="lsu-range-content">
                              <div className="lsu-range-dot" style={{ "--dot-color": rule.recommender_role ? "#f59e0b" : "#22c55e" }} />
                              <span className="lsu-range-text">
                                {rule.day_to ? (rule.day_from + " - " + rule.day_to + " days") : (rule.day_from + "+ days")}
                              </span>
                            </div>
                          </td>
                          <td className="lsu-td-recommender" style={{ "--rec-color": rule.recommender_role ? "var(--text-heading)" : "var(--text-muted)", "--rec-style": rule.recommender_role ? "normal" : "italic" }}>
                            {rule.recommender_role
                              ? RECOMMENDER_OPTIONS.find(r => r.value === rule.recommender_role)?.label
                              : "None - direct"}
                          </td>
                          <td className="lsu-td-approver">
                            {APPROVER_OPTIONS.find(r => r.value === rule.approver_role)?.label || rule.approver_role}
                          </td>
                          <td className="lsu-td-cert">
                            {rule.certificate_required
                              ? <span className="lsu-cert-required">Required</span>
                              : <span className="lsu-cert-not-required">Not required</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="lsu-modal-overlay">
          <div className="lsu-modal-box">
            {/* Header */}
            <div className="lsu-modal-header">
              <div>
                <div className="lsu-modal-title">{editing ? "Edit Leave Type" : "New Leave Type"}</div>
                <div className="lsu-modal-subtitle">Set approval rules per day range - certificate requirement is per rule</div>
              </div>
              <button onClick={() => { setShowForm(false); setError(""); }}
                className="lsu-modal-close-btn">&times;</button>
            </div>

            {/* Body */}
            <div className="lsu-modal-body">
              {error && <div className="alert alert-error lsu-form-err">{error}</div>}

              {/* Basic row */}
              <div className="lsu-basic-row">
                <div className="form-group">
                  <label className="form-label">Leave type name *</label>
                  <input className="form-control" value={form.name}
                    onChange={e => setField("name", e.target.value)}
                    placeholder="e.g. Sick Leave" />
                </div>
                <div className="form-group">
                  <label className="form-label">Max days per year</label>
                  <input className="form-control" type="number" min={1}
                    value={form.max_days_per_year}
                    onChange={e => setField("max_days_per_year", e.target.value)}
                    placeholder="Blank = unlimited" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  {seg(form.is_active, [{v:true,l:"Active"},{v:false,l:"Inactive"}], v => setField("is_active", v))}
                </div>
              </div>

              {/* Approval rules */}
              <div className="lsu-rules-section">
                <div className="lsu-rules-section-header">
                  <div>
                    <div className="lsu-rules-section-title">Approval rules by number of days</div>
                    <div className="lsu-rules-section-sub">Each rule defines who approves and whether a certificate is needed for that duration.</div>
                  </div>
                </div>

                {/* Column headers */}
                <div className="lsu-col-headers">
                  {["From","To","Recommender","Approver","Certificate",""].map(h => (
                    <div key={h} className="lsu-col-header">{h}</div>
                  ))}
                </div>

                <div className="lsu-rules-stack">
                  {form.rules.map((rule, i) => (
                    <div key={i} className="lsu-rule-card">
                      <div className="lsu-rule-grid">
                        {/* From */}
                        <input type="number" min={1} value={rule.day_from}
                          onChange={e => setRule(i, "day_from", parseInt(e.target.value) || 1)}
                          readOnly={i === 0}
                          className="lsu-rule-input" style={{ "--input-bg": i === 0 ? "var(--bg-hover)" : "var(--bg-input)" }} />
                        {/* To */}
                        <input type="number" min={rule.day_from} value={rule.day_to}
                          onChange={e => setRule(i, "day_to", e.target.value)}
                          placeholder="no limit"
                          className="lsu-rule-input" />
                        {/* Recommender */}
                        <select value={rule.recommender_role}
                          onChange={e => setRule(i, "recommender_role", e.target.value)}
                          className="lsu-rule-select">
                          {RECOMMENDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {/* Approver */}
                        <select value={rule.approver_role}
                          onChange={e => setRule(i, "approver_role", e.target.value)}
                          className="lsu-rule-select">
                          {APPROVER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {/* Certificate dropdown */}
                        <select value={rule.certificate_required ? "required" : "not_required"}
                          onChange={e => setRule(i, "certificate_required", e.target.value === "required")}
                          className="lsu-cert-select"
                          style={{ "--cert-bg": rule.certificate_required ? "var(--bg-info-soft)" : "var(--bg-input)", "--cert-color": rule.certificate_required ? "#1d4ed8" : "var(--text-primary)", "--cert-weight": rule.certificate_required ? 600 : 400 }}>
                          <option value="not_required">Not required</option>
                          <option value="required">Required</option>
                        </select>
                        {/* Delete */}
                        <div className="lsu-rule-delete-wrap">
                          {form.rules.length > 1 && (
                            <button onClick={() => removeRule(i)}
                              className="lsu-rule-delete-btn">X</button>
                          )}
                        </div>
                      </div>

                      {/* Certificate label - shown inline under row when required */}
                      {rule.certificate_required && (
                        <div className="lsu-cert-label-wrap">
                          <input
                            value={rule.certificate_label}
                            onChange={e => setRule(i, "certificate_label", e.target.value)}
                            placeholder="Instruction shown to student, e.g. Please upload a doctor's certificate"
                            className="lsu-cert-label-input" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={addRule} className="lsu-add-rule-btn">+ Add rule</button>
              </div>

              {/* Notify mode */}
              <div className="lsu-notify-section">
                <div className="lsu-notify-title">Notify teachers when leave is applied</div>
                {seg(form.notify_mode,
                  [{ v: "incharge_only", l: "Class incharge only" }, { v: "all_teachers", l: "All subject teachers" }],
                  v => setField("notify_mode", v)
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="lsu-modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setError(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={loading}>
                {loading ? "Saving..." : editing ? "Update Leave Type" : "Create Leave Type"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



