import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";

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

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Income Tax Slabs</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Configure progressive annual tax brackets used to calculate the Income Tax deduction</div>
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

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Tax Calculator (Preview)</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Monthly Income</label>
            <input type="number" className="form-input" style={{ width: 180, fontSize: 13 }}
              value={calcIncome} onChange={e => setCalcIncome(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={runCalculator}>Calculate</button>
        </div>
        {calcError && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", borderRadius: 8, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>
            {calcError}
          </div>
        )}
        {calcResult && (
          <div style={{ marginTop: 12, padding: 12, background: "#eff6ff", borderRadius: 8, fontSize: 13 }}>
            <div>Annual Income: <strong>{calcResult.annual_income.toLocaleString()}</strong></div>
            <div>Annual Tax: <strong>{calcResult.annual_tax.toLocaleString()}</strong></div>
            <div>Monthly Tax Deduction: <strong style={{ color: "#1d4ed8" }}>{calcResult.monthly_tax.toLocaleString()}</strong></div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Using slab set: {calcResult.slab_set_name}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="form-input" style={{ fontSize: 13, width: 240 }} placeholder="New slab set name (e.g. Tax Year 2026-27)"
          value={newSetName} onChange={e => setNewSetName(e.target.value)} />
        <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={createSet}>+ Add Slab Set</button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Slabs", "Status", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sets.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{s.name}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{s.slab_count} bracket(s)</td>
                <td style={{ padding: "10px 14px" }}>
                  {s.is_active
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: "#f0fdf4", color: "#166534" }}>Active</span>
                    : <span style={{ fontSize: 11, color: "#94a3b8" }}>Inactive</span>}
                </td>
                <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openManage(s)}>Manage Brackets</button>
                  {!s.is_active && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "#166534" }} onClick={() => activateSet(s.id)}>Activate</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "#dc2626" }} onClick={() => deleteSet(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {sets.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No tax slab sets configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {managingSet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 700, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{managingSet.name} - Brackets</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setManagingSet(null)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {slabError && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
                  {slabError}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                Each bracket: fixed amount + rate % applied to the portion of annual income above "From". Leave "To" blank for the top bracket ("and above").
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["From", "To", "Fixed Amount", "Rate %", ""].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((s, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="number" className="form-input" style={{ width: 110, fontSize: 12 }}
                          value={s.min_income} onChange={e => updateSlabField(idx, "min_income", e.target.value)} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="number" className="form-input" style={{ width: 110, fontSize: 12 }} placeholder="(and above)"
                          value={s.max_income ?? ""} onChange={e => updateSlabField(idx, "max_income", e.target.value)} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="number" className="form-input" style={{ width: 100, fontSize: 12 }}
                          value={s.fixed_amount} onChange={e => updateSlabField(idx, "fixed_amount", e.target.value)} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="number" step="0.01" className="form-input" style={{ width: 80, fontSize: 12 }}
                          value={s.rate_percent} onChange={e => updateSlabField(idx, "rate_percent", e.target.value)} />
                      </td>
                      <td style={{ padding: "6px 8px", display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => saveSlabRow(idx)}>Save</button>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: "#dc2626" }} onClick={() => removeSlabRow(idx)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                  {slabs.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No brackets yet.</td></tr>
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
