import { useState, useEffect } from "react";
import { leavesApi } from "../api/leavesApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";

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
    <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
      {opts.map(opt => (
        <button key={String(opt.v)} onClick={() => onChange(opt.v)} style={{
          flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: 13,
          background: val === opt.v ? "#2563eb" : "#f8fafc",
          color: val === opt.v ? "#fff" : "#64748b",
          fontWeight: val === opt.v ? 600 : 400,
        }}>{opt.l}</button>
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
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Student Leave Types are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}

      {toast && <div className="alert alert-success" style={{ marginBottom: 16 }}>{toast}</div>}
      {error && !showForm && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Configured Leave Types</span>
          <span className="badge badge-gray">{types.length} types</span>
        </div>
        {types.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
            No leave types configured yet. Click "+ Add Leave Type" to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {types.map((lt, idx) => {
              const ACCENT_COLORS = ["#2563eb","#10b981","#f59e0b","#8b5cf6","#ef4444","#0ea5e9","#ec4899"];
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              return (
                <div key={lt.id} style={{
                  background: "#ffffff",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  borderLeft: "4px solid " + accent,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  overflow: "hidden",
                }}>
                  {/* Header */}
                  <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{lt.name}</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", padding: "2px 10px",
                        borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: lt.is_active ? "#dcfce7" : "#fee2e2",
                        color: lt.is_active ? "#166534" : "#991b1b",
                      }}>{lt.is_active ? "Active" : "Inactive"}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "#f1f5f9", color: "#475569" }}>
                        {lt.max_days_per_year ? ("Max " + lt.max_days_per_year + " days/year") : "Unlimited days/year"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "#f1f5f9", color: "#475569" }}>
                        {lt.notify_mode === "all_teachers" ? "All teachers notified" : "Incharge notified"}
                      </span>
                    </div>
                    {!isGlobalLocked && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openEdit(lt)} style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#ffffff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#0f172a" }}>Edit</button>
                        <button onClick={() => remove(lt.id)} style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid #fecaca", background: "#fff5f5", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#dc2626" }}>Delete</button>
                      </div>
                    )}
                  </div>

                  {/* Rules table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#fafbfc" }}>
                        <th style={{ padding: "8px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em", width: 140 }}>Day range</th>
                        <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>Recommender</th>
                        <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>Approver</th>
                        <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lt.rules || []).map((rule, ri) => (
                        <tr key={ri} style={{ borderTop: "1px solid #f1f5f9", background: ri % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                          <td style={{ padding: "11px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                background: rule.recommender_role ? "#f59e0b" : "#22c55e" }} />
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                                {rule.day_to ? (rule.day_from + " - " + rule.day_to + " days") : (rule.day_from + "+ days")}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "11px 14px", color: rule.recommender_role ? "#0f172a" : "#94a3b8", fontStyle: rule.recommender_role ? "normal" : "italic" }}>
                            {rule.recommender_role
                              ? RECOMMENDER_OPTIONS.find(r => r.value === rule.recommender_role)?.label
                              : "None - direct"}
                          </td>
                          <td style={{ padding: "11px 14px", fontWeight: 500, color: "#0f172a" }}>
                            {APPROVER_OPTIONS.find(r => r.value === rule.approver_role)?.label || rule.approver_role}
                          </td>
                          <td style={{ padding: "11px 14px" }}>
                            {rule.certificate_required
                              ? <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#dbeafe", color: "#1e40af" }}>Required</span>
                              : <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "#f1f5f9", color: "#64748b" }}>Not required</span>}
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
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 680,
            maxHeight: "92vh", overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#0f172a" }}>{editing ? "Edit Leave Type" : "New Leave Type"}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Set approval rules per day range - certificate requirement is per rule</div>
              </div>
              <button onClick={() => { setShowForm(false); setError(""); }}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: "2px 8px" }}>&times;</button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px", flex: 1 }}>
              {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}

              {/* Basic row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
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
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>Approval rules by number of days</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Each rule defines who approves and whether a certificate is needed for that duration.</div>
                  </div>
                </div>

                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "60px 60px 1fr 1fr 130px auto", gap: 8, marginBottom: 4, padding: "0 10px" }}>
                  {["From","To","Recommender","Approver","Certificate",""].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</div>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {form.rules.map((rule, i) => (
                    <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "60px 60px 1fr 1fr 130px auto", gap: 8, alignItems: "center" }}>
                        {/* From */}
                        <input type="number" min={1} value={rule.day_from}
                          onChange={e => setRule(i, "day_from", parseInt(e.target.value) || 1)}
                          readOnly={i === 0}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13, background: i === 0 ? "#f1f5f9" : "#fff", width: "100%", boxSizing: "border-box", textAlign: "center" }} />
                        {/* To */}
                        <input type="number" min={rule.day_from} value={rule.day_to}
                          onChange={e => setRule(i, "day_to", e.target.value)}
                          placeholder="no limit"
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff", width: "100%", boxSizing: "border-box", textAlign: "center" }} />
                        {/* Recommender */}
                        <select value={rule.recommender_role}
                          onChange={e => setRule(i, "recommender_role", e.target.value)}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, background: "#fff", width: "100%", boxSizing: "border-box" }}>
                          {RECOMMENDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {/* Approver */}
                        <select value={rule.approver_role}
                          onChange={e => setRule(i, "approver_role", e.target.value)}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, background: "#fff", width: "100%", boxSizing: "border-box" }}>
                          {APPROVER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {/* Certificate dropdown */}
                        <select value={rule.certificate_required ? "required" : "not_required"}
                          onChange={e => setRule(i, "certificate_required", e.target.value === "required")}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12,
                            background: rule.certificate_required ? "#eff6ff" : "#fff",
                            color: rule.certificate_required ? "#1d4ed8" : "#374151",
                            fontWeight: rule.certificate_required ? 600 : 400,
                            width: "100%", boxSizing: "border-box" }}>
                          <option value="not_required">Not required</option>
                          <option value="required">Required</option>
                        </select>
                        {/* Delete */}
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          {form.rules.length > 1 && (
                            <button onClick={() => removeRule(i)}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}>X</button>
                          )}
                        </div>
                      </div>

                      {/* Certificate label ? shown inline under row when required */}
                      {rule.certificate_required && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0" }}>
                          <input
                            value={rule.certificate_label}
                            onChange={e => setRule(i, "certificate_label", e.target.value)}
                            placeholder="Instruction shown to student, e.g. Please upload a doctor's certificate"
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #bfdbfe", fontSize: 12, background: "#eff6ff", boxSizing: "border-box", color: "#1e40af" }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={addRule} style={{
                  marginTop: 8, width: "100%", padding: "8px", border: "1px dashed #cbd5e1",
                  borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13,
                  color: "#2563eb", fontWeight: 500,
                }}>+ Add rule</button>
              </div>

              {/* Notify mode */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>Notify teachers when leave is applied</div>
                {seg(form.notify_mode,
                  [{ v: "incharge_only", l: "Class incharge only" }, { v: "all_teachers", l: "All subject teachers" }],
                  v => setField("notify_mode", v)
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
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



