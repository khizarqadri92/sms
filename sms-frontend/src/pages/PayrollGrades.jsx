import React, { useState, useEffect, useCallback, useRef } from "react";
import payrollApi from "../api/payrollApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./PayrollGrades.css";

const CALC_LABELS = {
  fixed: "Fixed Amount",
  percent_of_basic: "% of Basic",
  percent_of_gross: "% of Gross",
  per_day: "Per Day Amount",
  tax_slab: "Tax Slab (Income Tax)",
};

export default function PayrollGrades() {
  const { isGlobalLocked } = useGovernanceMode("payroll_grades");
  const [settings, setSettings] = useState({ basic_salary_mode: "individual", days_in_month_mode: "fixed_30", fixed_days_value: 30, pf_employer_contribution_mode: "same_as_employee", pf_employer_percentage: 0, pf_employer_fixed_amount: 0 });
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

  if (loading) return <div className="pg-loading">Loading...</div>;

  return (
    <div className="pg-page">
      <div className="pg-header">
        <div className="pg-title">Payroll Grades</div>
        <div className="pg-subtitle">Define employee grades and attach salary components to each</div>
      </div>

      <div className="pg-settings-card">
        <div className="pg-settings-title">Basic Salary Mode</div>
        <div className="pg-settings-desc">
          Controls whether Basic Salary is fixed at the grade level (everyone in a grade earns the same) or set individually per employee.
        </div>
        <div className="pg-radio-row-16-mb14">
          <label className="pg-radio-label">
            <input type="radio" checked={settings.basic_salary_mode === "grade_fixed"}
              onChange={() => setSettings(p => ({ ...p, basic_salary_mode: "grade_fixed" }))} />
            Fixed by Grade (uniform for everyone in the grade)
          </label>
          <label className="pg-radio-label">
            <input type="radio" checked={settings.basic_salary_mode === "individual"}
              onChange={() => setSettings(p => ({ ...p, basic_salary_mode: "individual" }))} />
            Individual per Employee
          </label>
        </div>

        <div className="pg-settings-title-mt18">Days in Month (for "Days of Salary" adjustments)</div>
        <div className="pg-settings-desc">
          Controls the divisor used to calculate a per-day rate from an employee salary, based on the adjustment target month.
        </div>
        <div className="pg-radio-row-16-mb14">
          <label className="pg-radio-label">
            <input type="radio" checked={settings.days_in_month_mode === "fixed_30"}
              onChange={() => setSettings(p => ({ ...p, days_in_month_mode: "fixed_30" }))} />
            Fixed number of days for every month:
            <input type="number" min="1" max="31" className="form-input pg-inline-input-70"
              disabled={settings.days_in_month_mode !== "fixed_30"}
              value={settings.fixed_days_value} onChange={e => setSettings(p => ({ ...p, fixed_days_value: e.target.value }))} />
          </label>
          <label className="pg-radio-label">
            <input type="radio" checked={settings.days_in_month_mode === "actual"}
              onChange={() => setSettings(p => ({ ...p, days_in_month_mode: "actual" }))} />
            Actual calendar days in that month (28-31)
          </label>
        </div>

        <div className="pg-settings-title-mt20">Employer Provident Fund Contribution</div>
        <div className="pg-radio-col-10-mb14">
          <label className="pg-radio-label">
            <input type="radio" checked={settings.pf_employer_contribution_mode === "same_as_employee"}
              onChange={() => setSettings(p => ({ ...p, pf_employer_contribution_mode: "same_as_employee" }))} />
            Same as employee deduction percentage
          </label>
          <label className="pg-radio-label">
            <input type="radio" checked={settings.pf_employer_contribution_mode === "percentage"}
              onChange={() => setSettings(p => ({ ...p, pf_employer_contribution_mode: "percentage" }))} />
            Different percentage of basic salary:
            <input type="number" min="0" max="100" step="0.01" className="form-input pg-inline-input-80"
              disabled={settings.pf_employer_contribution_mode !== "percentage"}
              value={settings.pf_employer_percentage} onChange={e => setSettings(p => ({ ...p, pf_employer_percentage: e.target.value }))} />
            %
          </label>
          <label className="pg-radio-label">
            <input type="radio" checked={settings.pf_employer_contribution_mode === "fixed"}
              onChange={() => setSettings(p => ({ ...p, pf_employer_contribution_mode: "fixed" }))} />
            Fixed amount per employee:
            <input type="number" min="0" step="0.01" className="form-input pg-inline-input-100"
              disabled={settings.pf_employer_contribution_mode !== "fixed"}
              value={settings.pf_employer_fixed_amount} onChange={e => setSettings(p => ({ ...p, pf_employer_fixed_amount: e.target.value }))} />
          </label>
        </div>
        <button className="btn btn-primary btn-sm pg-save-btn" disabled={savingSettings} onClick={saveSettings}>
          {savingSettings ? "Saving..." : "Save"}
        </button>
        {settingsMsg && (
          <div className="pg-settings-msg" style={{
            "--msg-bg": settingsMsg.type === "success" ? "#dcfce7" : "#fee2e2",
            "--msg-color": settingsMsg.type === "success" ? "#166534" : "#dc2626"
          }}>
            {settingsMsg.type === "success" ? "" : ""}{settingsMsg.text}
          </div>
        )}
      </div>

      {flash && (
        <div className="pg-flash" style={{
          "--flash-bg": flash.type === "success" ? "#dcfce7" : "#fee2e2",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "" : ""}{flash.msg}
        </div>
      )}

      {isGlobalLocked && (
        <div className="pg-readonly-alert">
          Payroll Grades are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      <div className="pg-section-header-row">
        <div className="pg-section-title">Grades</div>
        {!isGlobalLocked && <button className="btn btn-primary btn-sm pg-add-btn" onClick={openAddGrade}>+ Add Grade</button>}
      </div>

      <div className="pg-table-wrap">
        <table className="pg-table">
          <thead>
            <tr className="pg-th-row">
              {["Name", "Description", "Components", "Active", ""].map(h => (
                <th key={h} className="pg-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grades.map(g => (
              <tr key={g.id} className="pg-tr" style={{ "--row-opacity": g.is_active ? 1 : 0.5 }}>
                <td className="pg-td-name">{g.name}</td>
                <td className="pg-td-desc">{g.description || "-"}</td>
                <td className="pg-td-comp-count">{g.component_count} attached</td>
                <td className="pg-td-status">
                  {g.is_active ? <span className="pg-status-active">Active</span> : <span className="pg-status-inactive">Inactive</span>}
                </td>
                <td className="pg-actions-cell">
                  {!isGlobalLocked && (
                    <>
                      <button className="btn btn-ghost btn-sm pg-action-btn-sm" onClick={() => openManageComponents(g)}>Manage Components</button>
                      <button className="btn btn-ghost btn-sm pg-action-btn-sm" onClick={() => openEditGrade(g)}>Edit</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {grades.length === 0 && (
              <tr><td colSpan={5} className="pg-empty-td">No grades configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showGradeForm && (
        <div className="pg-modal-overlay">
          <div className="pg-modal-box-sm">
            <div className="pg-modal-header">
              <div className="pg-modal-title">{editingGradeId ? "Edit Grade" : "Add Grade"}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowGradeForm(false)}>Close</button>
            </div>
            <div className="pg-modal-body">
              {gradeFormError && (
                <div className="pg-error-box">
                  {gradeFormError}
                </div>
              )}
              <div className="pg-form-column">
                <div>
                  <label className="pg-field-label">Name *</label>
                  <input className="form-input pg-full-input" placeholder="e.g. Grade 1, Senior Teacher"
                    value={gradeForm.name} onChange={e => setGradeForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="pg-field-label">Description</label>
                  <textarea className="form-input pg-full-input" rows={2}
                    value={gradeForm.description} onChange={e => setGradeForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                {editingGradeId && (
                  <label className="pg-checkbox-label">
                    <input type="checkbox" checked={gradeForm.is_active} onChange={e => setGradeForm(p => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                )}
              </div>
              <div className="pg-btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowGradeForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm pg-save-btn" disabled={savingGrade} onClick={submitGrade}>
                  {savingGrade ? "Saving..." : (editingGradeId ? "Update" : "Create")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {managingGrade && (
        <div className="pg-modal-overlay">
          <div ref={modalScrollRef} className="pg-modal-box-lg">
            <div className="pg-modal-header">
              <div className="pg-modal-title">{managingGrade.name} - Components</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setManagingGrade(null); loadAll(true); }}>Close</button>
            </div>
            <div className="pg-modal-body">
              {componentActionError && (
                <div className="pg-action-msg" style={{
                  "--msg-bg": componentActionError.type === "success" ? "#dcfce7" : "#fef2f2",
                  "--msg-border": componentActionError.type === "success" ? "#bbf7d0" : "#fecaca",
                  "--msg-color": componentActionError.type === "success" ? "#166534" : "#b91c1c"
                }}>
                  {componentActionError.type === "success" ? "\u2713 " : "\u26a0 "}{componentActionError.text}
                </div>
              )}

              <div className="pg-dept-override-card">
                <label className="pg-field-label-mb6">Department-Specific Overrides</label>
                <div className="pg-help-text-mb8">
                  Optional - only needed if a specific department should differ from this grade's defaults below.
                </div>
                <select className="form-input pg-dept-select" value={overrideDeptId}
                  onChange={e => loadDeptOverrides(e.target.value)}>
                  <option value="">View defaults only (no department selected)</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {overrideDeptId && (
                <div className="pg-overrides-section">
                  <div className="pg-overrides-title">
                    Overrides for {departments.find(d => d.id === Number(overrideDeptId))?.name}
                  </div>
                  <div className="pg-comp-list-column">
                    {allComponents.map(comp => {
                      const overridden = isDeptOverridden(comp.id);
                      return (
                        <div key={comp.id} className="pg-comp-row-override">
                          <input type="checkbox" checked={overridden} onChange={() => toggleDeptOverride(comp)} />
                          <div className="pg-comp-row-flex">
                            {comp.name}
                            <div className="pg-comp-subtext">{CALC_LABELS[comp.calculation_type]}</div>
                          </div>
                          {overridden && (
                            comp.calculation_type === "tax_slab" ? (
                              <div className="pg-tax-slab-note">
                                Income tax will be deducted as per Income Tax Slabs
                              </div>
                            ) : (
                              <>
                                <input type="number" step="0.01" className="form-input pg-value-input-110"
                                  value={deptOverrideValues[comp.id] ?? 0}
                                  onChange={e => setDeptOverrideValues(p => ({ ...p, [comp.id]: e.target.value }))} />
                                <button className="btn btn-ghost btn-sm pg-action-btn-sm" onClick={() => saveDeptOverrideValue(comp)}>Save</button>
                              </>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pg-grade-defaults-title">Grade Defaults</div>
              {["earning", "deduction"].map(type => (
                <div key={type} className="pg-type-section">
                  <div className="pg-type-section-title">{type}s</div>
                  <div className="pg-comp-list-column">
                    {allComponents.filter(c => c.component_type === type).map(comp => {
                      const blocked = basicModeBlocksComponent(comp);
                      const attached = isAttached(comp.id);
                      return (
                        <div key={comp.id} className="pg-comp-row-default" style={{ "--row-bg": blocked ? "var(--bg-hover)" : "var(--bg-card)", "--row-opacity-comp": blocked ? 0.5 : 1 }}>
                          <input type="checkbox" checked={attached && !blocked} disabled={blocked} onChange={() => toggleComponent(comp)} />
                          <div className="pg-comp-row-flex">
                            {comp.name}
                            {comp.is_basic && <span className="pg-basic-tag">Basic</span>}
                            <div className="pg-comp-subtext">{CALC_LABELS[comp.calculation_type]}</div>
                          </div>
                          {blocked ? (
                            <div className="pg-blocked-text">Set per-employee</div>
                          ) : comp.calculation_type === "tax_slab" ? (
                            attached && <div className="pg-tax-slab-note">
                              Income tax will be deducted as per Income Tax Slabs
                            </div>
                          ) : attached && (
                            <>
                              <input type="number" step="0.01" className="form-input pg-value-input-110"
                                value={componentValues[comp.id] ?? 0}
                                onChange={e => setComponentValues(p => ({ ...p, [comp.id]: e.target.value }))} />
                              <button className="btn btn-ghost btn-sm pg-action-btn-sm" onClick={() => saveComponentValue(comp)}>Save</button>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {allComponents.filter(c => c.component_type === type).length === 0 && (
                      <div className="pg-no-components-text">No {type} components configured yet.</div>
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
