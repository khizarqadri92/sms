import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import procurementApi from "../api/procurementApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./ApprovalRules.css";

const APPROVER_ROLES = [
  { value: "department_head", label: "Department Head (of requesting dept.)" },
  { value: "teacher", label: "Teacher" },
  { value: "principal", label: "Principal" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "procurement", label: "Procurement Officer" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Super Admin" },
];

const roleLabel = (value) => APPROVER_ROLES.find(r => r.value === value)?.label || value;

function RuleFormModal({ rule, departments, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: rule?.name || "",
    min_amount: rule?.min_amount || "",
    max_amount: rule?.max_amount || "",
    department_id: rule?.department_id || "",
    item_category_id: rule?.item_category_id || "",
    is_emergency: rule?.is_emergency === true ? "true" : rule?.is_emergency === false ? "false" : "",
    priority: rule?.priority ?? 0,
  });
  const [steps, setSteps] = useState(
    rule?.steps?.length ? rule.steps.map(s => s.approver_role) : []
  );
  const [newStepRole, setNewStepRole] = useState(APPROVER_ROLES[0].value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addStep = () => setSteps([...steps, newStepRole]);
  const removeStep = (idx) => setSteps(steps.filter((_, i) => i !== idx));
  const moveStep = (idx, dir) => {
    const next = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSteps(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    if (steps.length === 0) { setError("Add at least one approval step."); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        name: form.name,
        min_amount: form.min_amount || null,
        max_amount: form.max_amount || null,
        department_id: form.department_id || null,
        item_category_id: form.item_category_id || null,
        is_emergency: form.is_emergency === "" ? null : form.is_emergency === "true",
        priority: Number(form.priority) || 0,
        steps: steps.map(role => ({ approver_role: role })),
      };
      if (rule) {
        await procurementApi.updateApprovalRule(rule.id, payload);
      } else {
        await procurementApi.createApprovalRule(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ar-modal-overlay" onClick={onClose}>
      <div className="ar-modal-box" onClick={e => e.stopPropagation()}>
        <div className="ar-modal-title">{rule ? "Edit Approval Rule" : "Add Approval Rule"}</div>
        <div className="ar-modal-subtitle">
          Leave a condition blank to match "any" for that field. When a Purchase Requisition is submitted, the highest-priority rule whose conditions all match is used.
        </div>
        {error && <div className="alert alert-error ar-mb12">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Rule Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>

          <div className="ar-form-grid">
            <div className="form-group">
              <label className="form-label">Min Amount</label>
              <input className="form-control" type="number" min="0" step="0.01" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })} placeholder="No minimum" />
            </div>
            <div className="form-group">
              <label className="form-label">Max Amount</label>
              <input className="form-control" type="number" min="0" step="0.01" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })} placeholder="No maximum" />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select className="form-control" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Any department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Item Category</label>
              <select className="form-control" value={form.item_category_id} onChange={e => setForm({ ...form, item_category_id: e.target.value })}>
                <option value="">Any category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Purchase</label>
              <select className="form-control" value={form.is_emergency} onChange={e => setForm({ ...form, is_emergency: e.target.value })}>
                <option value="">Doesn't matter</option>
                <option value="true">Only if marked Emergency</option>
                <option value="false">Only if NOT Emergency</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <input className="form-control" type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
              <div className="ar-hint">Higher priority wins when multiple rules match.</div>
            </div>
          </div>

          <div className="ar-steps-label">Approval Steps (in order)</div>
          <div className="ar-steps-box">
            {steps.length === 0 ? (
              <div className="ar-no-steps">No steps added yet.</div>
            ) : (
              steps.map((role, idx) => (
                <div key={idx} className="ar-step-row" style={{ "--row-border": idx < steps.length - 1 ? "1px solid var(--border-color)" : "none" }}>
                  <span className="ar-step-num">{idx + 1}.</span>
                  <span className="ar-step-name">{roleLabel(role)}</span>
                  <button type="button" className="btn btn-ghost btn-xs" disabled={idx === 0} onClick={() => moveStep(idx, -1)}>↑</button>
                  <button type="button" className="btn btn-ghost btn-xs" disabled={idx === steps.length - 1} onClick={() => moveStep(idx, 1)}>↓</button>
                  <button type="button" className="btn btn-danger btn-xs" onClick={() => removeStep(idx)}>Remove</button>
                </div>
              ))
            )}
          </div>
          <div className="ar-add-step-row">
            <select className="form-control" value={newStepRole} onChange={e => setNewStepRole(e.target.value)}>
              {APPROVER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button type="button" className="btn btn-secondary" onClick={addStep}>+ Add Step</button>
          </div>

          <div className="ar-btn-row">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : rule ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function conditionSummary(rule) {
  const parts = [];
  if (rule.min_amount || rule.max_amount) {
    if (rule.min_amount && rule.max_amount) parts.push(`Rs. ${Number(rule.min_amount).toLocaleString()} - ${Number(rule.max_amount).toLocaleString()}`);
    else if (rule.min_amount) parts.push(`Rs. ${Number(rule.min_amount).toLocaleString()}+`);
    else parts.push(`Up to Rs. ${Number(rule.max_amount).toLocaleString()}`);
  }
  if (rule.department_name) parts.push(rule.department_name);
  if (rule.item_category_name) parts.push(rule.item_category_name);
  if (rule.is_emergency === true) parts.push("Emergency only");
  if (rule.is_emergency === false) parts.push("Non-emergency only");
  return parts.length ? parts.join(" · ") : "Any purchase";
}

export default function ApprovalRules() {
  const { can } = useAuth();
  const { isGlobalLocked } = useGovernanceMode("procurement_approval_rules");
  const canConfigure = can("procurement.configure") && !isGlobalLocked;
  const [rules, setRules] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);

  const fetchRules = () => {
    setLoading(true);
    procurementApi.getApprovalRules()
      .then(r => setRules(r.data.data || []))
      .catch(() => setError("Failed to load approval rules."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
    procurementApi.getDepartments().then(r => setDepartments((r.data.data || []).filter(d => d.is_active))).catch(() => {});
    procurementApi.getItemCategories().then(r => setCategories(r.data.data || [])).catch(() => {});
  }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (rule) => {
    try {
      if (rule.is_active) {
        await procurementApi.deactivateApprovalRule(rule.id);
        showToast("Rule deactivated.");
      } else {
        await procurementApi.reactivateApprovalRule(rule.id);
        showToast("Rule reactivated.");
      }
      fetchRules();
    } catch {
      setError("Failed to update rule status.");
    }
  };

  return (
    <div>
      <div className="page-header ar-page-header">
        <h1 className="page-heading">Approval Rules</h1>
        {canConfigure && (
          <button className="btn btn-primary" onClick={() => { setEditRule(null); setShowForm(true); }}>+ Add Rule</button>
        )}
      </div>

      {isGlobalLocked && (
        <div className="alert ar-readonly-alert">
          Approval Rules are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      <div className="ar-intro-text">
        Configure who must approve a Purchase Requisition based on amount, department, item category, or emergency status. When a PR is submitted, the highest-priority rule whose conditions match is applied.
      </div>

      {success && <div className="alert alert-success ar-mb16">{success}</div>}
      {error && <div className="alert alert-error ar-mb16">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="empty-state">No approval rules yet. Add one to get started — you'll need at least a default catch-all rule before Purchase Requisitions can be approved.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Name</th>
                <th>Conditions</th>
                <th>Approval Chain</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td><span className="badge badge-primary">{r.priority}</span></td>
                  <td><strong>{r.name}</strong></td>
                  <td className="ar-condition-cell">{conditionSummary(r)}</td>
                  <td className="ar-chain-cell">
                    {r.steps.length === 0 ? (
                      <span className="ar-no-steps-warning">No steps configured</span>
                    ) : (
                      r.steps.map(s => roleLabel(s.approver_role)).join(" → ")
                    )}
                  </td>
                  <td><span className={"badge " + (r.is_active ? "badge-success" : "badge-gray")}>{r.is_active ? "Active" : "Inactive"}</span></td>
                  <td>
                    {canConfigure ? (
                      <div className="ar-actions-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => { setEditRule(r); setShowForm(true); }}>Edit</button>
                        <button className={"btn btn-xs " + (r.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(r)}>
                          {r.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    ) : (
                      <span className="ar-view-only">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <RuleFormModal
          rule={editRule}
          departments={departments}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editRule ? "Rule updated." : "Rule added."); fetchRules(); }}
        />
      )}
    </div>
  );
}
