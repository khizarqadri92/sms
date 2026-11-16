import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";
import "./PayrollTaxSlabs.css";

export default function PayrollTaxSlabs() {
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const [newSetName, setNewSetName] = useState("");
  const [managingSet, setManagingSet] = useState(null);
  const [slabs, setSlabs] = useState([]);
  const [slabError, setSlabError] = useState(null);

  const [calcIncome, setCalcIncome] = useState("");
  const [calcResult, setCalcResult] = useState(null);
  const [calcError, setCalcError] = useState(null);

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const load = useCallback(() => {
    setLoading(true);
    payrollApi.getTaxSlabSets().then(r => setSets(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSet = async () => {
    if (!newSetName.trim()) { showFlash("error", "Name is required."); return; }
    try {
      await payrollApi.createTaxSlabSet({ name: newSetName });
      setNewSetName("");
      showFlash("success", "Slab set created.");
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to create.");
    }
  };

  const activateSet = async (id) => {
    try {
      await payrollApi.activateTaxSlabSet(id);
      showFlash("success", "Slab set activated.");
      load();
    } catch (e) {
      showFlash("error", "Failed to activate.");
    }
  };

  const deleteSet = async (id) => {
    if (!window.confirm("Delete this tax slab set and all its brackets?")) return;
    try {
      await payrollApi.deleteTaxSlabSet(id);
      showFlash("success", "Slab set deleted.");
      if (managingSet?.id === id) setManagingSet(null);
      load();
    } catch (e) {
      showFlash("error", "Failed to delete.");
    }
  };

  const openManage = (set) => {
    setManagingSet(set);
    setSlabError(null);
    payrollApi.getTaxSlabs(set.id).then(r => setSlabs(r.data.data || [])).catch(() => setSlabs([]));
  };

  const addSlabRow = () => {
    const lastMax = slabs.length ? slabs[slabs.length - 1].max_income : null;
    setSlabs(prev => [...prev, {
      id: null,
      min_income: lastMax != null ? Number(lastMax) + 1 : 0,
      max_income: null,
      fixed_amount: 0,
      rate_percent: 0,
      sort_order: prev.length + 1,
    }]);
  };

  const updateSlabField = (idx, field, value) => {
    setSlabs(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const saveSlabRow = async (idx) => {
    setSlabError(null);
    const s = slabs[idx];
    try {
      const r = await payrollApi.upsertTaxSlab(managingSet.id, {
        id: s.id,
        min_income: Number(s.min_income),
        max_income: s.max_income === "" || s.max_income == null ? null : Number(s.max_income),
        fixed_amount: Number(s.fixed_amount) || 0,
        rate_percent: Number(s.rate_percent) || 0,
        sort_order: idx + 1,
      });
      updateSlabField(idx, "id", r.data.data.id);
      showFlash("success", "Slab saved.");
      load();
    } catch (e) {
      setSlabError(e.response?.data?.message || "Failed to save slab.");
    }
  };

  const removeSlabRow = async (idx) => {
    const s = slabs[idx];
    if (s.id) {
      try {
        await payrollApi.deleteTaxSlab(s.id);
        showFlash("success", "Slab removed.");
        load();
      } catch (e) {
        showFlash("error", "Failed to remove.");
        return;
      }
    }
    setSlabs(prev => prev.filter((_, i) => i !== idx));
  };

  const runCalculator = async () => {
    setCalcError(null);
    setCalcResult(null);
    if (!calcIncome) { setCalcError("Enter a monthly income."); return; }
    try {
      const r = await payrollApi.calculateTaxPreview(Number(calcIncome));
      setCalcResult(r.data.data);
    } catch (e) {
      setCalcError(e.response?.data?.message || e.response?.data?.detail?.message || "Failed to calculate.");
    }
  };

  if (loading) return <div className="pts-loading">Loading...</div>;

  return (
    <div className="pts-page">
      <div className="pts-header">
        <div className="pts-title">Income Tax Slabs</div>
        <div className="pts-subtitle">Configure progressive annual tax brackets used to calculate the Income Tax deduction</div>
      </div>

      {flash && (
        <div className="pts-flash" style={{
          "--flash-bg": flash.type === "success" ? "#dcfce7" : "#fee2e2",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div className="pts-calc-card">
        <div className="pts-calc-title">Tax Calculator (Preview)</div>
        <div className="pts-calc-row">
          <div>
            <label className="pts-field-label">Monthly Income</label>
            <input type="number" className="form-input pts-calc-input"
              value={calcIncome} onChange={e => setCalcIncome(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm pts-calc-btn" onClick={runCalculator}>Calculate</button>
        </div>
        {calcError && (
          <div className="pts-error-box">
            {calcError}
          </div>
        )}
        {calcResult && (
          <div className="pts-result-box">
            <div>Annual Income: <strong>{calcResult.annual_income.toLocaleString()}</strong></div>
            <div>Annual Tax: <strong>{calcResult.annual_tax.toLocaleString()}</strong></div>
            <div>Monthly Tax Deduction: <strong className="pts-result-value">{calcResult.monthly_tax.toLocaleString()}</strong></div>
            <div className="pts-result-subtext">Using slab set: {calcResult.slab_set_name}</div>
          </div>
        )}
      </div>

      <div className="pts-new-set-row">
        <input className="form-input pts-new-set-input" placeholder="New slab set name (e.g. Tax Year 2026-27)"
          value={newSetName} onChange={e => setNewSetName(e.target.value)} />
        <button className="btn btn-primary btn-sm pts-add-set-btn" onClick={createSet}>+ Add Slab Set</button>
      </div>

      <div className="pts-table-wrap">
        <table className="pts-table">
          <thead>
            <tr className="pts-th-row">
              {["Name", "Slabs", "Status", ""].map(h => (
                <th key={h} className="pts-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sets.map(s => (
              <tr key={s.id} className="pts-tr">
                <td className="pts-td-name">{s.name}</td>
                <td className="pts-td-count">{s.slab_count} bracket(s)</td>
                <td className="pts-td-status">
                  {s.is_active
                    ? <span className="pts-status-active-tag">Active</span>
                    : <span className="pts-status-inactive-text">Inactive</span>}
                </td>
                <td className="pts-actions-cell">
                  <button className="btn btn-ghost btn-sm pts-manage-btn" onClick={() => openManage(s)}>Manage Brackets</button>
                  {!s.is_active && (
                    <button className="btn btn-ghost btn-sm pts-activate-btn" onClick={() => activateSet(s.id)}>Activate</button>
                  )}
                  <button className="btn btn-ghost btn-sm pts-delete-btn" onClick={() => deleteSet(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {sets.length === 0 && (
              <tr><td colSpan={4} className="pts-empty-td">No tax slab sets configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {managingSet && (
        <div className="pts-modal-overlay">
          <div className="pts-modal-box">
            <div className="pts-modal-header">
              <div className="pts-modal-title">{managingSet.name} - Brackets</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setManagingSet(null)}>Close</button>
            </div>
            <div className="pts-modal-body">
              {slabError && (
                <div className="pts-error-box">
                  {slabError}
                </div>
              )}
              <div className="pts-help-text">
                Each bracket: fixed amount + rate % applied to the portion of annual income above "From". Leave "To" blank for the top bracket ("and above").
              </div>
              <table className="pts-slabs-table">
                <thead>
                  <tr className="pts-slabs-th-row">
                    {["From", "To", "Fixed Amount", "Rate %", ""].map(h => (
                      <th key={h} className="pts-slabs-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((s, idx) => (
                    <tr key={idx} className="pts-slabs-tr">
                      <td className="pts-slab-td">
                        <input type="number" className="form-input pts-slab-input-110"
                          value={s.min_income} onChange={e => updateSlabField(idx, "min_income", e.target.value)} />
                      </td>
                      <td className="pts-slab-td">
                        <input type="number" className="form-input pts-slab-input-110" placeholder="(and above)"
                          value={s.max_income ?? ""} onChange={e => updateSlabField(idx, "max_income", e.target.value)} />
                      </td>
                      <td className="pts-slab-td">
                        <input type="number" className="form-input pts-slab-input-100"
                          value={s.fixed_amount} onChange={e => updateSlabField(idx, "fixed_amount", e.target.value)} />
                      </td>
                      <td className="pts-slab-td">
                        <input type="number" step="0.01" className="form-input pts-slab-input-80"
                          value={s.rate_percent} onChange={e => updateSlabField(idx, "rate_percent", e.target.value)} />
                      </td>
                      <td className="pts-slab-actions-cell">
                        <button className="btn btn-ghost btn-sm pts-slab-save-btn" onClick={() => saveSlabRow(idx)}>Save</button>
                        <button className="btn btn-ghost btn-sm pts-slab-remove-btn" onClick={() => removeSlabRow(idx)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                  {slabs.length === 0 && (
                    <tr><td colSpan={5} className="pts-empty-slabs-td">No brackets yet.</td></tr>
                  )}
                </tbody>
              </table>
              <button className="btn btn-ghost btn-sm" onClick={addSlabRow}>+ Add Bracket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
