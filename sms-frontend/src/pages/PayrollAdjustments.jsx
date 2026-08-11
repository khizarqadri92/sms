import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function PayrollAdjustments() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
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

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Payroll Adjustments</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>One-time bonuses, deductions, and other variable entries for a specific month</div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={openAdd}>+ Add Adjustment</button>
      </div>

      {flash && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: flash.type === "success" ? "#dcfce7" : "#fee2e2",
          color: flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select className="form-input" style={{ fontSize: 13, width: 160 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" className="form-input" style={{ fontSize: 13, width: 100 }} value={year} onChange={e => setYear(Number(e.target.value))} />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Employee", "Component", "Type", "Amount", "Note", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adjustments.map(a => (
              <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{a.staff_name}</td>
                <td style={{ padding: "10px 14px", fontSize: 13 }}>{a.component_name}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                    background: a.component_type === "earning" ? "#f0fdf4" : "#fef2f2",
                    color: a.component_type === "earning" ? "#166534" : "#dc2626"
                  }}>
                    {a.component_type === "earning" ? "Earning" : "Deduction"}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{Number(a.amount).toFixed(2)}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b", maxWidth: 200 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.note}>{a.note || "-"}</div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "#dc2626" }} onClick={() => remove(a.id)}>Remove</button>
                </td>
              </tr>
            ))}
            {adjustments.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No adjustments for {MONTH_NAMES[month - 1]} {year}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Add Adjustment</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {formError && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
                  \u26a0 {formError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Component *</label>
                  <select className="form-input" style={{ width: "100%", fontSize: 13 }} value={componentId} onChange={e => setComponentId(e.target.value)}>
                    <option value="">Select component...</option>
                    {variableComponents.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.component_type === "earning" ? "Earning" : "Deduction"})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Amount Basis</label>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {[["fixed", "Fixed Amount"], ["percent_of_basic", "% of Basic Salary"], ["days", "Days of Salary"]].map(([val, label]) => (
                      <label key={val} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={amountType === val} onChange={() => setAmountType(val)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {amountType !== "fixed" && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                      Resolved per employee from their actual salary setup (Basic Salary, Lump Sum, or Hourly/Daily Wage x30). Employees without a usable figure are skipped.
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Month *</label>
                    <select className="form-input" style={{ width: "100%", fontSize: 13 }} value={formMonth} onChange={e => setFormMonth(e.target.value)}>
                      {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Year *</label>
                    <input type="number" className="form-input" style={{ width: "100%", fontSize: 13 }} value={formYear} onChange={e => setFormYear(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Apply To</label>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {[["single", "Single Employee"], ["multiple", "Multiple Employees"], ["department", "Department(s)"], ["school", "Whole School"]].map(([val, label]) => (
                      <label key={val} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={targetMode === val} onChange={() => setTargetMode(val)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {targetMode === "single" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Employee *</label>
                      <select className="form-input" style={{ width: "100%", fontSize: 13 }} value={singleStaffId} onChange={e => setSingleStaffId(e.target.value)}>
                        <option value="">Select employee...</option>
                        {staffList.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{amountFieldLabel} *</label>
                      <input type="number" step="0.01" className="form-input" style={{ width: "100%", fontSize: 13 }}
                        value={singleAmount} onChange={e => setSingleAmount(e.target.value)} />
                    </div>
                  </div>
                )}

                {(targetMode === "multiple" || targetMode === "department") && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Amount</label>
                    <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
                      <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={amountMode === "same"} onChange={() => setAmountMode("same")} />
                        Same for all
                      </label>
                      <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={amountMode === "different"} onChange={() => setAmountMode("different")} />
                        Different for each
                      </label>
                    </div>
                    {amountMode === "same" && (
                      <input type="number" step="0.01" className="form-input" style={{ width: 200, fontSize: 13, marginBottom: 10 }}
                        placeholder={amountFieldLabel} value={sameAmount} onChange={e => setSameAmount(e.target.value)} />
                    )}
                  </div>
                )}

                {targetMode === "multiple" && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Select Employees *</label>
                    <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                      {staffList.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px" }}>
                          <input type="checkbox" checked={selectedStaffIds.includes(s.id)} onChange={() => toggleStaffId(s.id)} />
                          <div style={{ flex: 1, fontSize: 13 }}>{s.first_name} {s.last_name} <span style={{ color: "#94a3b8", fontSize: 11 }}>({s.department_name || "No dept"})</span></div>
                          {amountMode === "different" && selectedStaffIds.includes(s.id) && (
                            <input type="number" step="0.01" className="form-input" style={{ width: 100, fontSize: 12 }}
                              value={perEmployeeAmounts[s.id] ?? ""} onChange={e => setPerEmployeeAmounts(p => ({ ...p, [s.id]: e.target.value }))} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {targetMode === "department" && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Select Department(s) *</label>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                      {departments.map(d => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px" }}>
                          <input type="checkbox" checked={selectedDeptIds.includes(d.id)} onChange={() => toggleDeptId(d.id)} />
                          <div style={{ flex: 1, fontSize: 13 }}>{d.name}</div>
                          {amountMode === "different" && selectedDeptIds.includes(d.id) && (
                            <input type="number" step="0.01" className="form-input" style={{ width: 100, fontSize: 12 }}
                              value={perDeptAmounts[d.id] ?? ""} onChange={e => setPerDeptAmounts(p => ({ ...p, [d.id]: e.target.value }))} />
                          )}
                        </div>
                      ))}
                      {departments.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", padding: 8 }}>No departments found.</div>}
                    </div>
                  </div>
                )}

                {targetMode === "school" && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{amountFieldLabel} for every employee *</label>
                    <input type="number" step="0.01" className="form-input" style={{ width: 200, fontSize: 13 }}
                      value={sameAmount} onChange={e => setSameAmount(e.target.value)} />
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>This will apply to all {staffList.length} active employees.</div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Note</label>
                  <textarea className="form-input" rows={2} style={{ width: "100%", fontSize: 13 }}
                    placeholder="Reason for this entry..." value={note} onChange={e => setNote(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={validateAndConfirm}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(15,23,42,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Confirm Adjustment</div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 16, lineHeight: 1.6 }}>
              This will add <strong>{componentName}</strong> to <strong>{entryCount}</strong> employee(s) for {MONTH_NAMES[formMonth - 1]} {formYear}
              {amountType === "fixed"
                ? <>, totalling <strong>{totalAmount.toFixed(2)}</strong>.</>
                : <>. The actual amount for each employee will be calculated from their own salary setup at save time.</>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)} disabled={saving}>Back</button>
              <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={saving} onClick={submit}>
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
