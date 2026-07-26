import React, { useState, useEffect, useCallback, useRef } from "react";
import payrollApi from "../api/payrollApi";

const CALC_LABELS = {
  fixed: "Fixed Amount",
  percent_of_basic: "% of Basic",
  percent_of_gross: "% of Gross",
  per_day: "Per Day Amount",
  tax_slab: "Tax Slab (Income Tax)",
};

export default function PayrollGrades() {
  const [settings, setSettings] = useState({ basic_salary_mode: "individual", days_in_month_mode: "fixed_30", fixed_days_value: 30 });
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const [showGradeForm, setShowGradeForm] = useState(false);
  const [editingGradeId, setEditingGradeId] = useState(null);
  const [gradeForm, setGradeForm] = useState({ name: "", description: "", is_active: true });
  const [gradeFormError, setGradeFormError] = useState(null);
  const [savingGrade, setSavingGrade] = useState(false);

  const [managingGrade, setManagingGrade] = useState(null);
  const [allComponents, setAllComponents] = useState([]);
  const [gradeComponents, setGradeComponents] = useState([]);
  const [componentValues, setComponentValues] = useState({});
  const [componentActionError, setComponentActionError] = useState(null);
  const modalScrollRef = useRef(null);
  const preserveScroll = (fn) => {
    const el = modalScrollRef.current;
    const pos = el ? el.scrollTop : 0;
    const restore = () => { if (modalScrollRef.current) modalScrollRef.current.scrollTop = pos; };
    return fn().finally(() => {
      restore();
      requestAnimationFrame(restore);
      requestAnimationFrame(() => requestAnimationFrame(restore));
      setTimeout(restore, 0);
      setTimeout(restore, 50);
      setTimeout(restore, 150);
    });
  };
  const [departments, setDepartments] = useState([]);
  const [overrideDeptId, setOverrideDeptId] = useState("");
  const [deptOverrides, setDeptOverrides] = useState([]);
  const [deptOverrideValues, setDeptOverrideValues] = useState({});

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const loadAll = useCallback((isBackground = false) => {
    if (!isBackground) setLoading(true);
    Promise.all([payrollApi.getSettings(), payrollApi.getGrades(), payrollApi.getDepartmentsList()])
      .then(([s, g, d]) => {
        setSettings(s.data.data);
        setGrades(g.data.data || []);
        setDepartments(d.data.data || []);
      }).catch(() => {}).finally(() => { if (!isBackground) setLoading(false); });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveSettings = async () => {
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      await payrollApi.updateSettings(settings);
      setSettingsMsg({ type: "success", text: "Payroll settings saved." });
      loadAll(true);
    } catch (e) {
      setSettingsMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    } finally {
      setSavingSettings(false);
    }
    setTimeout(() => setSettingsMsg(null), 6000);
  };

  const openAddGrade = () => {
    setEditingGradeId(null);
    setGradeForm({ name: "", description: "", is_active: true });
    setGradeFormError(null);
    setShowGradeForm(true);
  };

  const openEditGrade = (g) => {
    setEditingGradeId(g.id);
    setGradeForm({ name: g.name, description: g.description || "", is_active: g.is_active });
    setGradeFormError(null);
    setShowGradeForm(true);
  };

  const submitGrade = async () => {
    setGradeFormError(null);
    if (!gradeForm.name.trim()) { setGradeFormError("Name is required."); return; }
    setSavingGrade(true);
    try {
      if (editingGradeId) {
        await payrollApi.updateGrade(editingGradeId, gradeForm);
        showFlash("success", "Grade updated.");
      } else {
        await payrollApi.createGrade(gradeForm);
        showFlash("success", "Grade created.");
      }
      setShowGradeForm(false);
      loadAll(true);
    } catch (e) {
      setGradeFormError(e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save.");
    } finally {
      setSavingGrade(false);
    }
  };

  const openManageComponents = async (grade) => {
    setManagingGrade(grade);
    setComponentActionError(null);
    setOverrideDeptId("");
    setDeptOverrides([]);
    setDeptOverrideValues({});
    try {
      const [allC, gradeC] = await Promise.all([
        payrollApi.getComponents({}),
        payrollApi.getGradeComponents(grade.id),
      ]);
      const active = (allC.data.data || []).filter(c => c.is_active);
      setAllComponents(active);
      const gc = gradeC.data.data || [];
      setGradeComponents(gc);
      const values = {};
      gc.forEach(item => { values[item.component_id] = item.value; });
      setComponentValues(values);
    } catch (e) {
      showFlash("error", "Failed to load components.");
    }
  };

  const isAttached = (componentId) => gradeComponents.some(gc => gc.component_id === componentId);

  const toggleComponent = (comp) => preserveScroll(async () => {
    if (!managingGrade) return;
    setComponentActionError(null);
    try {
      if (isAttached(comp.id)) {
        await payrollApi.removeGradeComponent(managingGrade.id, comp.id);
        setGradeComponents(prev => prev.filter(gc => gc.component_id !== comp.id));
      } else {
        const value = Number(componentValues[comp.id]) || 0;
        await payrollApi.upsertGradeComponent(managingGrade.id, { component_id: comp.id, value });
        setGradeComponents(prev => [...prev, { component_id: comp.id, value }]);
      }
    } catch (e) {
      setComponentActionError({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed." });
    }
  });

  const saveComponentValue = async (comp) => {
    if (!managingGrade) return;
    setComponentActionError(null);
    const value = Number(componentValues[comp.id]) || 0;
    try {
      await payrollApi.upsertGradeComponent(managingGrade.id, { component_id: comp.id, value });
      setGradeComponents(prev => prev.map(gc => gc.component_id === comp.id ? { ...gc, value } : gc));
      setComponentActionError({ type: "success", text: comp.name + " saved." });
      setTimeout(() => setComponentActionError(null), 3000);
    } catch (e) {
      setComponentActionError({ type: "error", text: e.response?.data?.message || "Failed to save value." });
    }
  };

  const loadDeptOverrides = (deptId) => {
    setOverrideDeptId(deptId);
    if (!managingGrade || !deptId) { setDeptOverrides([]); setDeptOverrideValues({}); return; }
    payrollApi.getGradeDepartmentComponents(managingGrade.id, deptId).then(r => {
      const rows = r.data.data || [];
      setDeptOverrides(rows);
      const values = {};
      rows.forEach(item => { values[item.component_id] = item.value; });
      setDeptOverrideValues(values);
    }).catch(() => setComponentActionError("Failed to load department overrides."));
  };

  const isDeptOverridden = (componentId) => deptOverrides.some(o => o.component_id === componentId);

  const toggleDeptOverride = (comp) => preserveScroll(async () => {
    if (!managingGrade || !overrideDeptId) return;
    setComponentActionError(null);
    try {
      if (isDeptOverridden(comp.id)) {
        await payrollApi.removeGradeDepartmentComponent(managingGrade.id, overrideDeptId, comp.id);
        setDeptOverrides(prev => prev.filter(o => o.component_id !== comp.id));
      } else {
        const value = Number(deptOverrideValues[comp.id]) || 0;
        await payrollApi.upsertGradeDepartmentComponent(managingGrade.id, overrideDeptId, { component_id: comp.id, value });
        setDeptOverrides(prev => [...prev, { component_id: comp.id, value }]);
      }
    } catch (e) {
      setComponentActionError({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed." });
    }
  });

  const saveDeptOverrideValue = async (comp) => {
    if (!managingGrade || !overrideDeptId) return;
    setComponentActionError(null);
    const value = Number(deptOverrideValues[comp.id]) || 0;
    try {
      await payrollApi.upsertGradeDepartmentComponent(managingGrade.id, overrideDeptId, { component_id: comp.id, value });
      setDeptOverrides(prev => prev.map(o => o.component_id === comp.id ? { ...o, value } : o));
      setComponentActionError({ type: "success", text: comp.name + " override saved." });
      setTimeout(() => setComponentActionError(null), 3000);
    } catch (e) {
      setComponentActionError({ type: "error", text: e.response?.data?.message || "Failed to save value." });
    }
  };

  const basicModeBlocksComponent = (comp) => comp.is_basic && settings.basic_salary_mode === "individual";

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Payroll Grades</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Define employee grades and attach salary components to each</div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Basic Salary Mode</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
          Controls whether Basic Salary is fixed at the grade level (everyone in a grade earns the same) or set individually per employee.
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={settings.basic_salary_mode === "grade_fixed"}
              onChange={() => setSettings(p => ({ ...p, basic_salary_mode: "grade_fixed" }))} />
            Fixed by Grade (uniform for everyone in the grade)
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={settings.basic_salary_mode === "individual"}
              onChange={() => setSettings(p => ({ ...p, basic_salary_mode: "individual" }))} />
            Individual per Employee
          </label>
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, marginTop: 18 }}>Days in Month (for "Days of Salary" adjustments)</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
          Controls the divisor used to calculate a per-day rate from an employee salary, based on the adjustment target month.
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={settings.days_in_month_mode === "fixed_30"}
              onChange={() => setSettings(p => ({ ...p, days_in_month_mode: "fixed_30" }))} />
            Fixed number of days for every month:
            <input type="number" min="1" max="31" className="form-input" style={{ width: 70, fontSize: 13 }}
              disabled={settings.days_in_month_mode !== "fixed_30"}
              value={settings.fixed_days_value} onChange={e => setSettings(p => ({ ...p, fixed_days_value: e.target.value }))} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={settings.days_in_month_mode === "actual"}
              onChange={() => setSettings(p => ({ ...p, days_in_month_mode: "actual" }))} />
            Actual calendar days in that month (28-31)
          </label>
        </div>
        <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={savingSettings} onClick={saveSettings}>
          {savingSettings ? "Saving..." : "Save"}
        </button>
        {settingsMsg && (
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: settingsMsg.type === "success" ? "#dcfce7" : "#fee2e2",
            color: settingsMsg.type === "success" ? "#166534" : "#dc2626"
          }}>
            {settingsMsg.type === "success" ? "" : ""}{settingsMsg.text}
          </div>
        )}
      </div>

      {flash && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: flash.type === "success" ? "#dcfce7" : "#fee2e2",
          color: flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "" : ""}{flash.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Grades</div>
        <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={openAddGrade}>+ Add Grade</button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Description", "Components", "Active", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grades.map(g => (
              <tr key={g.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: g.is_active ? 1 : 0.5 }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{g.name}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{g.description || "-"}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{g.component_count} attached</td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  {g.is_active ? <span style={{ color: "#166534" }}>Active</span> : <span style={{ color: "#dc2626" }}>Inactive</span>}
                </td>
                <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openManageComponents(g)}>Manage Components</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openEditGrade(g)}>Edit</button>
                </td>
              </tr>
            ))}
            {grades.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No grades configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showGradeForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{editingGradeId ? "Edit Grade" : "Add Grade"}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowGradeForm(false)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {gradeFormError && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
                  {gradeFormError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Name *</label>
                  <input className="form-input" style={{ width: "100%", fontSize: 13 }} placeholder="e.g. Grade 1, Senior Teacher"
                    value={gradeForm.name} onChange={e => setGradeForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Description</label>
                  <textarea className="form-input" rows={2} style={{ width: "100%", fontSize: 13 }}
                    value={gradeForm.description} onChange={e => setGradeForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                {editingGradeId && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={gradeForm.is_active} onChange={e => setGradeForm(p => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowGradeForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={savingGrade} onClick={submitGrade}>
                  {savingGrade ? "Saving..." : (editingGradeId ? "Update" : "Create")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {managingGrade && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div ref={modalScrollRef} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{managingGrade.name} - Components</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setManagingGrade(null); loadAll(true); }}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {componentActionError && (
                <div style={{
                  marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: componentActionError.type === "success" ? "#dcfce7" : "#fef2f2",
                  border: "1px solid " + (componentActionError.type === "success" ? "#bbf7d0" : "#fecaca"),
                  color: componentActionError.type === "success" ? "#166534" : "#b91c1c"
                }}>
                  {componentActionError.type === "success" ? "\u2713 " : "\u26a0 "}{componentActionError.text}
                </div>
              )}

              <div style={{ marginBottom: 18, padding: 12, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Department-Specific Overrides</label>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
                  Optional - only needed if a specific department should differ from this grade's defaults below.
                </div>
                <select className="form-input" style={{ width: 240, fontSize: 13 }} value={overrideDeptId}
                  onChange={e => loadDeptOverrides(e.target.value)}>
                  <option value="">View defaults only (no department selected)</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {overrideDeptId && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                    Overrides for {departments.find(d => d.id === Number(overrideDeptId))?.name}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {allComponents.map(comp => {
                      const overridden = isDeptOverridden(comp.id);
                      return (
                        <div key={comp.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                          background: "#fff", border: "1px solid #fde68a", borderRadius: 8
                        }}>
                          <input type="checkbox" checked={overridden} onChange={() => toggleDeptOverride(comp)} />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                            {comp.name}
                            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>{CALC_LABELS[comp.calculation_type]}</div>
                          </div>
                          {overridden && (
                            comp.calculation_type === "tax_slab" ? (
                              <div style={{ fontSize: 11, color: "#1d4ed8", fontStyle: "italic", maxWidth: 220, textAlign: "right" }}>
                                Income tax will be deducted as per Income Tax Slabs
                              </div>
                            ) : (
                              <>
                                <input type="number" step="0.01" className="form-input" style={{ width: 110, fontSize: 12 }}
                                  value={deptOverrideValues[comp.id] ?? 0}
                                  onChange={e => setDeptOverrideValues(p => ({ ...p, [comp.id]: e.target.value }))} />
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => saveDeptOverrideValue(comp)}>Save</button>
                              </>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Grade Defaults</div>
              {["earning", "deduction"].map(type => (
                <div key={type} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, textTransform: "capitalize" }}>{type}s</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {allComponents.filter(c => c.component_type === type).map(comp => {
                      const blocked = basicModeBlocksComponent(comp);
                      const attached = isAttached(comp.id);
                      return (
                        <div key={comp.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                          background: blocked ? "#f8fafc" : "#fff", border: "1px solid #e2e8f0", borderRadius: 8, opacity: blocked ? 0.5 : 1
                        }}>
                          <input type="checkbox" checked={attached && !blocked} disabled={blocked} onChange={() => toggleComponent(comp)} />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                            {comp.name}
                            {comp.is_basic && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#eff6ff", color: "#1d4ed8" }}>Basic</span>}
                            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>{CALC_LABELS[comp.calculation_type]}</div>
                          </div>
                          {blocked ? (
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>Set per-employee</div>
                          ) : comp.calculation_type === "tax_slab" ? (
                            attached && <div style={{ fontSize: 11, color: "#1d4ed8", fontStyle: "italic", maxWidth: 220, textAlign: "right" }}>
                              Income tax will be deducted as per Income Tax Slabs
                            </div>
                          ) : attached && (
                            <>
                              <input type="number" step="0.01" className="form-input" style={{ width: 110, fontSize: 12 }}
                                value={componentValues[comp.id] ?? 0}
                                onChange={e => setComponentValues(p => ({ ...p, [comp.id]: e.target.value }))} />
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => saveComponentValue(comp)}>Save</button>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {allComponents.filter(c => c.component_type === type).length === 0 && (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>No {type} components configured yet.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
