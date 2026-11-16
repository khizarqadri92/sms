import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import "./PayrollAdjustments.css";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function PayrollAdjustments() {
  const processingToday = useProcessingToday();
  const now = new Date(processingToday);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  useEffect(() => {
    const d = new Date(processingToday);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  }, [processingToday]);
  const [adjustments, setAdjustments] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [variableComponents, setVariableComponents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [componentId, setComponentId] = useState("");
  const [amountType, setAmountType] = useState("fixed");
  const amountFieldLabel = amountType === "fixed" ? "Amount" : amountType === "percent_of_basic" ? "Percentage of Basic (%)" : "Number of Days";
  const [formMonth, setFormMonth] = useState(month);
  const [formYear, setFormYear] = useState(year);
  const [note, setNote] = useState("");
  const [targetMode, setTargetMode] = useState("single");
  const [amountMode, setAmountMode] = useState("same");
  const [singleStaffId, setSingleStaffId] = useState("");
  const [singleAmount, setSingleAmount] = useState("");
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);
  const [sameAmount, setSameAmount] = useState("");
  const [perEmployeeAmounts, setPerEmployeeAmounts] = useState({});
  const [perDeptAmounts, setPerDeptAmounts] = useState({});

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      payrollApi.getAdjustments({ month, year }),
      payrollApi.getStaffList(),
      payrollApi.getComponents({}),
      payrollApi.getDepartmentsList(),
    ]).then(([a, s, c, d]) => {
      setAdjustments(a.data.data || []);
      setStaffList(s.data.data || []);
      setVariableComponents((c.data.data || []).filter(x => x.is_active && !x.is_permanent));
      setDepartments(d.data.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setComponentId(""); setFormMonth(month); setFormYear(year); setNote("");
    setTargetMode("single"); setAmountMode("same"); setAmountType("fixed");
    setSingleStaffId(""); setSingleAmount("");
    setSelectedStaffIds([]); setSelectedDeptIds([]);
    setSameAmount(""); setPerEmployeeAmounts({}); setPerDeptAmounts({});
    setFormError(null);
  };

  const openAdd = () => { resetForm(); setShowForm(true); };

  const toggleStaffId = (id) => {
    setSelectedStaffIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleDeptId = (id) => {
    setSelectedDeptIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Resolve the final flat list of {staff_id, amount} regardless of target/amount mode
  const resolveEntries = () => {
    if (targetMode === "single") {
      return singleStaffId ? [{ staff_id: Number(singleStaffId), amount: Number(singleAmount) }] : [];
    }
    if (targetMode === "multiple") {
      if (amountMode === "same") {
        return selectedStaffIds.map(id => ({ staff_id: id, amount: Number(sameAmount) }));
      }
      return selectedStaffIds.map(id => ({ staff_id: id, amount: Number(perEmployeeAmounts[id]) || 0 }));
    }
    if (targetMode === "department") {
      const entries = [];
      selectedDeptIds.forEach(deptId => {
        const amt = amountMode === "same" ? Number(sameAmount) : (Number(perDeptAmounts[deptId]) || 0);
        staffList.filter(s => s.department_id === deptId).forEach(s => entries.push({ staff_id: s.id, amount: amt }));
      });
      return entries;
    }
    if (targetMode === "school") {
      return staffList.map(s => ({ staff_id: s.id, amount: Number(sameAmount) }));
    }
    return [];
  };

  const validateAndConfirm = () => {
    setFormError(null);
    if (!componentId) { setFormError("Component is required."); return; }
    const entries = resolveEntries();
    if (entries.length === 0) { setFormError("Select at least one employee."); return; }
    if (entries.some(e => !e.amount)) { setFormError("Every selected employee/department needs an amount."); return; }
    setShowConfirm(true);
  };

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    const entries = resolveEntries();
    try {
      if (targetMode === "single") {
        await payrollApi.createAdjustment({
          staff_id: entries[0].staff_id, component_id: Number(componentId),
          month: Number(formMonth), year: Number(formYear), amount: entries[0].amount, amount_type: amountType, note: note || null,
        });
      } else {
        await payrollApi.bulkCreateAdjustments({
          component_id: Number(componentId), month: Number(formMonth), year: Number(formYear),
          note: note || null, amount_type: amountType, entries,
        });
      }
      showFlash("success", entries.length + " adjustment(s) created.");
      setShowConfirm(false);
      setShowForm(false);
      load();
    } catch (e) {
      setShowConfirm(false);
      setFormError(e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this adjustment?")) return;
    try {
      await payrollApi.deleteAdjustment(id);
      showFlash("success", "Adjustment removed.");
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    }
  };

  const entryCount = showConfirm ? resolveEntries().length : 0;
  const totalAmount = showConfirm ? resolveEntries().reduce((s, e) => s + e.amount, 0) : 0;
  const componentName = variableComponents.find(c => c.id === Number(componentId))?.name || "";

  if (loading) return <div className="padj-loading">Loading...</div>;

  return (
    <div className="padj-page">
      <div className="padj-header">
        <div>
          <div className="padj-title">Payroll Adjustments</div>
          <div className="padj-subtitle">One-time bonuses, deductions, and other variable entries for a specific month</div>
        </div>
        <button className="btn btn-primary btn-sm padj-add-btn" onClick={openAdd}>+ Add Adjustment</button>
      </div>

      {flash && (
        <div className="padj-flash" style={{
          "--flash-bg": flash.type === "success" ? "#dcfce7" : "#fee2e2",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div className="padj-my-row">
        <select className="form-input padj-month-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" className="form-input padj-year-input" value={year} onChange={e => setYear(Number(e.target.value))} />
      </div>

      <div className="padj-table-wrap">
        <table className="padj-table">
          <thead>
            <tr className="padj-th-row">
              {["Employee", "Component", "Type", "Amount", "Note", ""].map(h => (
                <th key={h} className="padj-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adjustments.map(a => (
              <tr key={a.id} className="padj-tr">
                <td className="padj-td-name">{a.staff_name}</td>
                <td className="padj-td-comp">{a.component_name}</td>
                <td className="padj-td-type">
                  <span className="padj-type-badge" style={{
                    "--badge-bg": a.component_type === "earning" ? "#f0fdf4" : "#fef2f2",
                    "--badge-color": a.component_type === "earning" ? "#166534" : "#dc2626"
                  }}>
                    {a.component_type === "earning" ? "Earning" : "Deduction"}
                  </span>
                </td>
                <td className="padj-td-amount">{Number(a.amount).toFixed(2)}</td>
                <td className="padj-td-note">
                  <div className="padj-note-truncate" title={a.note}>{a.note || "-"}</div>
                </td>
                <td className="padj-td-actions">
                  <button className="btn btn-ghost btn-sm padj-remove-btn" onClick={() => remove(a.id)}>Remove</button>
                </td>
              </tr>
            ))}
            {adjustments.length === 0 && (
              <tr><td colSpan={6} className="padj-empty-td">No adjustments for {MONTH_NAMES[month - 1]} {year}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="padj-modal-overlay">
          <div className="padj-modal-box">
            <div className="padj-modal-header">
              <div className="padj-modal-title">Add Adjustment</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Close</button>
            </div>
            <div className="padj-modal-body">
              {formError && (
                <div className="padj-error-box">
                  \u26a0 {formError}
                </div>
              )}
              <div className="padj-form-column">
                <div>
                  <label className="padj-field-label">Component *</label>
                  <select className="form-input padj-full-select" value={componentId} onChange={e => setComponentId(e.target.value)}>
                    <option value="">Select component...</option>
                    {variableComponents.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.component_type === "earning" ? "Earning" : "Deduction"})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="padj-field-label-mb6">Amount Basis</label>
                  <div className="padj-radio-row-14">
                    {[["fixed", "Fixed Amount"], ["percent_of_basic", "% of Basic Salary"], ["days", "Days of Salary"]].map(([val, label]) => (
                      <label key={val} className="padj-radio-label">
                        <input type="radio" checked={amountType === val} onChange={() => setAmountType(val)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {amountType !== "fixed" && (
                    <div className="padj-help-text-mt6">
                      Resolved per employee from their actual salary setup (Basic Salary, Lump Sum, or Hourly/Daily Wage x30). Employees without a usable figure are skipped.
                    </div>
                  )}
                </div>

                <div className="padj-grid-2col">
                  <div>
                    <label className="padj-field-label">Month *</label>
                    <select className="form-input padj-full-select" value={formMonth} onChange={e => setFormMonth(e.target.value)}>
                      {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="padj-field-label">Year *</label>
                    <input type="number" className="form-input padj-full-input" value={formYear} onChange={e => setFormYear(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="padj-field-label-mb6">Apply To</label>
                  <div className="padj-radio-row-12">
                    {[["single", "Single Employee"], ["multiple", "Multiple Employees"], ["department", "Department(s)"], ["school", "Whole School"]].map(([val, label]) => (
                      <label key={val} className="padj-radio-label">
                        <input type="radio" checked={targetMode === val} onChange={() => setTargetMode(val)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {targetMode === "single" && (
                  <div className="padj-grid-2col">
                    <div>
                      <label className="padj-field-label">Employee *</label>
                      <select className="form-input padj-full-select" value={singleStaffId} onChange={e => setSingleStaffId(e.target.value)}>
                        <option value="">Select employee...</option>
                        {staffList.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="padj-field-label">{amountFieldLabel} *</label>
                      <input type="number" step="0.01" className="form-input padj-full-input"
                        value={singleAmount} onChange={e => setSingleAmount(e.target.value)} />
                    </div>
                  </div>
                )}

                {(targetMode === "multiple" || targetMode === "department") && (
                  <div>
                    <label className="padj-field-label-mb6">Amount</label>
                    <div className="padj-radio-row-14-mb10">
                      <label className="padj-radio-label">
                        <input type="radio" checked={amountMode === "same"} onChange={() => setAmountMode("same")} />
                        Same for all
                      </label>
                      <label className="padj-radio-label">
                        <input type="radio" checked={amountMode === "different"} onChange={() => setAmountMode("different")} />
                        Different for each
                      </label>
                    </div>
                    {amountMode === "same" && (
                      <input type="number" step="0.01" className="form-input padj-amount-input-200-mb10"
                        placeholder={amountFieldLabel} value={sameAmount} onChange={e => setSameAmount(e.target.value)} />
                    )}
                  </div>
                )}

                {targetMode === "multiple" && (
                  <div>
                    <label className="padj-field-label-mb6">Select Employees *</label>
                    <div className="padj-select-list-box">
                      {staffList.map(s => (
                        <div key={s.id} className="padj-select-item-row">
                          <input type="checkbox" checked={selectedStaffIds.includes(s.id)} onChange={() => toggleStaffId(s.id)} />
                          <div className="padj-select-item-flex">{s.first_name} {s.last_name} <span className="padj-select-item-dept-text">({s.department_name || "No dept"})</span></div>
                          {amountMode === "different" && selectedStaffIds.includes(s.id) && (
                            <input type="number" step="0.01" className="form-input padj-per-item-amount"
                              value={perEmployeeAmounts[s.id] ?? ""} onChange={e => setPerEmployeeAmounts(p => ({ ...p, [s.id]: e.target.value }))} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {targetMode === "department" && (
                  <div>
                    <label className="padj-field-label-mb6">Select Department(s) *</label>
                    <div className="padj-select-list-box">
                      {departments.map(d => (
                        <div key={d.id} className="padj-select-item-row">
                          <input type="checkbox" checked={selectedDeptIds.includes(d.id)} onChange={() => toggleDeptId(d.id)} />
                          <div className="padj-select-item-flex">{d.name}</div>
                          {amountMode === "different" && selectedDeptIds.includes(d.id) && (
                            <input type="number" step="0.01" className="form-input padj-per-item-amount"
                              value={perDeptAmounts[d.id] ?? ""} onChange={e => setPerDeptAmounts(p => ({ ...p, [d.id]: e.target.value }))} />
                          )}
                        </div>
                      ))}
                      {departments.length === 0 && <div className="padj-empty-dept-text">No departments found.</div>}
                    </div>
                  </div>
                )}

                {targetMode === "school" && (
                  <div>
                    <label className="padj-field-label">{amountFieldLabel} for every employee *</label>
                    <input type="number" step="0.01" className="form-input padj-amount-input-200"
                      value={sameAmount} onChange={e => setSameAmount(e.target.value)} />
                    <div className="padj-help-text-mt4">This will apply to all {staffList.length} active employees.</div>
                  </div>
                )}

                <div>
                  <label className="padj-field-label">Note</label>
                  <textarea className="form-input padj-textarea-full" rows={2}
                    placeholder="Reason for this entry..." value={note} onChange={e => setNote(e.target.value)} />
                </div>
              </div>
              <div className="padj-btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm padj-save-btn" onClick={validateAndConfirm}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="padj-confirm-overlay">
          <div className="padj-confirm-box">
            <div className="padj-confirm-title">Confirm Adjustment</div>
            <div className="padj-confirm-text">
              This will add <strong>{componentName}</strong> to <strong>{entryCount}</strong> employee(s) for {MONTH_NAMES[formMonth - 1]} {formYear}
              {amountType === "fixed"
                ? <>, totalling <strong>{totalAmount.toFixed(2)}</strong>.</>
                : <>. The actual amount for each employee will be calculated from their own salary setup at save time.</>}
            </div>
            <div className="padj-confirm-btn-row">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)} disabled={saving}>Back</button>
              <button className="btn btn-primary btn-sm padj-save-btn" disabled={saving} onClick={submit}>
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
