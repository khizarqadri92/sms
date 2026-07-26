import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";

const CALC_LABELS = {
  fixed: "Fixed Amount",
  percent_of_basic: "% of Basic",
  percent_of_gross: "% of Gross",
  per_day: "Per Day Amount",
  tax_slab: "Tax Slab (Income Tax)",
};

const emptyForm = {
  name: "", component_type: "earning", calculation_type: "fixed",
  is_permanent: true, is_taxable: true, is_statutory: false, is_active: true, is_basic: false, is_income_tax: false,
};

export default function PayrollSetup() {
  const [components, setComponents] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [flash, setFlash] = useState(null);

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const load = useCallback(() => {
    setLoading(true);
    payrollApi.getComponents(typeFilter ? { component_type: typeFilter } : {})
      .then(r => setComponents(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name, component_type: c.component_type, calculation_type: c.calculation_type,
      is_permanent: c.is_permanent, is_taxable: c.is_taxable, is_statutory: c.is_statutory, is_active: c.is_active,
      is_basic: c.is_basic, is_income_tax: c.is_income_tax,
    });
    setFormError(null);
    setShowForm(true);
  };

  const submit = async () => {
    setFormError(null);
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true);
    try {
      if (editingId) {
        await payrollApi.updateComponent(editingId, form);
        showFlash("success", "Component updated.");
      } else {
        await payrollApi.createComponent(form);
        showFlash("success", "Component created.");
      }
      setShowForm(false);
      load();
    } catch (e) {
      setFormError(e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm("Deactivate this component? It will no longer be available for new salary structures.")) return;
    try {
      await payrollApi.deactivateComponent(id);
      showFlash("success", "Component deactivated.");
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    }
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Payroll Setup</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Define earning and deduction components used across salary structures</div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={openAdd}>+ Add Component</button>
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

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["", "All"], ["earning", "Earnings"], ["deduction", "Deductions"]].map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(val)}
            className={typeFilter === val ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            style={typeFilter === val ? { color: "#fff" } : {}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Type", "Calculation", "Part of Salary", "Taxable / Statutory", "Active", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {components.map(c => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: c.is_active ? 1 : 0.5 }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>
                  {c.name}
                  {c.is_basic && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#eff6ff", color: "#1d4ed8" }}>Basic</span>}
                  {c.is_income_tax && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#fef2f2", color: "#dc2626" }}>Income Tax</span>}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                    background: c.component_type === "earning" ? "#f0fdf4" : "#fef2f2",
                    color: c.component_type === "earning" ? "#166534" : "#dc2626"
                  }}>
                    {c.component_type === "earning" ? "Earning" : "Deduction"}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{CALC_LABELS[c.calculation_type] || c.calculation_type}</td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  {c.is_permanent
                    ? <span style={{ color: "#166534", fontWeight: 600 }}>Yes</span>
                    : <span style={{ color: "#94a3b8" }}>Variable</span>}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>
                  {c.component_type === "earning"
                    ? (c.is_taxable ? "Taxable" : "Non-taxable")
                    : (c.is_statutory ? "Statutory" : "Non-statutory")}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  {c.is_active ? <span style={{ color: "#166534" }}>Active</span> : <span style={{ color: "#dc2626" }}>Inactive</span>}
                </td>
                <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openEdit(c)}>Edit</button>
                  {c.is_active && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "#dc2626" }} onClick={() => deactivate(c.id)}>Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
            {components.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No components configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{editingId ? "Edit Component" : "Add Component"}</div>
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
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Name *</label>
                  <input className="form-input" style={{ width: "100%", fontSize: 13 }} placeholder="e.g. House Rent Allowance"
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Component Type *</label>
                    <select className="form-input" style={{ width: "100%", fontSize: 13 }} value={form.component_type}
                      onChange={e => setForm(p => ({ ...p, component_type: e.target.value }))}>
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Calculation Type *</label>
                    <select className="form-input" style={{ width: "100%", fontSize: 13 }} value={form.calculation_type}
                      onChange={e => setForm(p => ({ ...p, calculation_type: e.target.value }))}>
                      <option value="fixed">Fixed Amount</option>
                      <option value="percent_of_basic">% of Basic</option>
                      <option value="percent_of_gross">% of Gross</option>
                      <option value="per_day">Per Day Amount</option>
                      {form.component_type === "deduction" && <option value="tax_slab">Tax Slab (Income Tax)</option>}
                    </select>
                  </div>
                </div>

                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_permanent} onChange={e => setForm(p => ({ ...p, is_permanent: e.target.checked }))} />
                  Part of Salary (standard, permanent component)
                </label>

                {form.component_type === "earning" ? (
                  <>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.is_taxable} onChange={e => setForm(p => ({ ...p, is_taxable: e.target.checked }))} />
                      Taxable
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.is_basic} onChange={e => setForm(p => ({ ...p, is_basic: e.target.checked }))} />
                      This is the Basic Salary component
                    </label>
                    {form.is_basic && (
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Only one component can be marked as Basic Salary - marking this one will unmark any other.</div>
                    )}
                  </>
                ) : (
                  <>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.is_statutory} onChange={e => setForm(p => ({ ...p, is_statutory: e.target.checked }))} />
                      Statutory (government-mandated, e.g. Tax, PF, EOBI)
                    </label>
                    {form.calculation_type === "tax_slab" && (
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Only one component can use Tax Slab calculation - selecting it here will switch any other Tax Slab component back to Fixed Amount. Its value will always come from the configured Income Tax Slabs, not a manual amount.</div>
                    )}
                  </>
                )}

                {editingId && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={saving} onClick={submit}>
                  {saving ? "Saving..." : (editingId ? "Update" : "Create")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
