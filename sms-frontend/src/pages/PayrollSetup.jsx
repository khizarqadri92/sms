import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./PayrollSetup.css";

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
  const { isGlobalLocked } = useGovernanceMode("payroll_components");
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

  if (loading) return <div className="pst-loading">Loading...</div>;

  return (
    <div className="pst-page">
      <div className="pst-header">
        <div>
          <div className="pst-title">Payroll Setup</div>
          <div className="pst-subtitle">Define earning and deduction components used across salary structures</div>
        </div>
        {!isGlobalLocked && <button className="btn btn-primary btn-sm pst-add-btn" onClick={openAdd}>+ Add Component</button>}
      </div>
      {isGlobalLocked && (
        <div className="pst-readonly-alert">
          Payroll Components are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}

      {flash && (
        <div className="pst-flash" style={{
          "--flash-bg": flash.type === "success" ? "#dcfce7" : "#fee2e2",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div className="pst-filter-row">
        {[["", "All"], ["earning", "Earnings"], ["deduction", "Deductions"]].map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(val)}
            className={typeFilter === val ? "btn btn-primary btn-sm pst-filter-btn-active" : "btn btn-ghost btn-sm"}>
            {label}
          </button>
        ))}
      </div>

      <div className="pst-table-wrap">
        <table className="pst-table">
          <thead>
            <tr className="pst-th-row">
              {["Name", "Type", "Calculation", "Part of Salary", "Taxable / Statutory", "Active", ""].map(h => (
                <th key={h} className="pst-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {components.map(c => (
              <tr key={c.id} className="pst-tr" style={{ "--row-opacity": c.is_active ? 1 : 0.5 }}>
                <td className="pst-td-name">
                  {c.name}
                  {c.is_basic && <span className="pst-basic-tag">Basic</span>}
                  {c.is_income_tax && <span className="pst-income-tax-tag">Income Tax</span>}
                </td>
                <td className="pst-td-type">
                  <span className="pst-type-badge" style={{
                    "--badge-bg": c.component_type === "earning" ? "#f0fdf4" : "#fef2f2",
                    "--badge-color": c.component_type === "earning" ? "#166534" : "#dc2626"
                  }}>
                    {c.component_type === "earning" ? "Earning" : "Deduction"}
                  </span>
                </td>
                <td className="pst-td-calc">{CALC_LABELS[c.calculation_type] || c.calculation_type}</td>
                <td className="pst-td-permanent">
                  {c.is_permanent
                    ? <span className="pst-permanent-yes">Yes</span>
                    : <span className="pst-permanent-no">Variable</span>}
                </td>
                <td className="pst-td-taxable">
                  {c.component_type === "earning"
                    ? (c.is_taxable ? "Taxable" : "Non-taxable")
                    : (c.is_statutory ? "Statutory" : "Non-statutory")}
                </td>
                <td className="pst-td-status">
                  {c.is_active ? <span className="pst-status-active">Active</span> : <span className="pst-status-inactive">Inactive</span>}
                </td>
                <td className="pst-actions-cell">
                  {!isGlobalLocked && <button className="btn btn-ghost btn-sm pst-edit-btn" onClick={() => openEdit(c)}>Edit</button>}
                  {!isGlobalLocked && c.is_active && (
                    <button className="btn btn-ghost btn-sm pst-deactivate-btn" onClick={() => deactivate(c.id)}>Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
            {components.length === 0 && (
              <tr><td colSpan={7} className="pst-empty-td">No components configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="pst-modal-overlay">
          <div className="pst-modal-box">
            <div className="pst-modal-header">
              <div className="pst-modal-title">{editingId ? "Edit Component" : "Add Component"}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Close</button>
            </div>
            <div className="pst-modal-body">
              {formError && (
                <div className="pst-error-box">
                  \u26a0 {formError}
                </div>
              )}
              <div className="pst-form-column">
                <div>
                  <label className="pst-field-label">Name *</label>
                  <input className="form-input pst-full-input" placeholder="e.g. House Rent Allowance"
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="pst-grid-2col">
                  <div>
                    <label className="pst-field-label">Component Type *</label>
                    <select className="form-input pst-full-input" value={form.component_type}
                      onChange={e => setForm(p => ({ ...p, component_type: e.target.value }))}>
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </div>
                  <div>
                    <label className="pst-field-label">Calculation Type *</label>
                    <select className="form-input pst-full-input" value={form.calculation_type}
                      onChange={e => setForm(p => ({ ...p, calculation_type: e.target.value }))}>
                      <option value="fixed">Fixed Amount</option>
                      <option value="percent_of_basic">% of Basic</option>
                      <option value="percent_of_gross">% of Gross</option>
                      <option value="per_day">Per Day Amount</option>
                      {form.component_type === "deduction" && <option value="tax_slab">Tax Slab (Income Tax)</option>}
                    </select>
                  </div>
                </div>

                <label className="pst-checkbox-label">
                  <input type="checkbox" checked={form.is_permanent} onChange={e => setForm(p => ({ ...p, is_permanent: e.target.checked }))} />
                  Part of Salary (standard, permanent component)
                </label>

                {form.component_type === "earning" ? (
                  <>
                    <label className="pst-checkbox-label">
                      <input type="checkbox" checked={form.is_taxable} onChange={e => setForm(p => ({ ...p, is_taxable: e.target.checked }))} />
                      Taxable
                    </label>
                    <label className="pst-checkbox-label">
                      <input type="checkbox" checked={form.is_basic} onChange={e => setForm(p => ({ ...p, is_basic: e.target.checked }))} />
                      This is the Basic Salary component
                    </label>
                    {form.is_basic && (
                      <div className="pst-help-text">Only one component can be marked as Basic Salary - marking this one will unmark any other.</div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="pst-checkbox-label">
                      <input type="checkbox" checked={form.is_statutory} onChange={e => setForm(p => ({ ...p, is_statutory: e.target.checked }))} />
                      Statutory (government-mandated, e.g. Tax, PF, EOBI)
                    </label>
                    {form.calculation_type === "tax_slab" && (
                      <div className="pst-help-text">Only one component can use Tax Slab calculation - selecting it here will switch any other Tax Slab component back to Fixed Amount. Its value will always come from the configured Income Tax Slabs, not a manual amount.</div>
                    )}
                  </>
                )}

                {editingId && (
                  <label className="pst-checkbox-label">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                )}
              </div>
              <div className="pst-btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm pst-save-btn" disabled={saving} onClick={submit}>
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
