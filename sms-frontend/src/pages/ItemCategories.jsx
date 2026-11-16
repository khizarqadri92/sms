import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./ItemCategories.css";

function CategoryFormModal({ category, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: category?.name || "",
    parent_id: category?.parent_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const payload = { name: form.name, parent_id: form.parent_id || null };
      if (category) {
        await procurementApi.updateItemCategory(category.id, payload);
      } else {
        await procurementApi.createItemCategory(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const otherCategories = categories.filter(c => c.id !== category?.id);

  return (
    <div className="ic-modal-overlay" onClick={onClose}>
      <div className="ic-modal-box" onClick={e => e.stopPropagation()}>
        <div className="ic-modal-title">{category ? "Edit Category" : "Add Category"}</div>
        {error && <div className="alert alert-error ic-mb12">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Parent Category</label>
            <select className="form-control" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">None (top-level)</option>
              {otherCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ic-btn-row">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : category ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ItemCategories() {
  const { isGlobalLocked } = useGovernanceMode("procurement_item_categories");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editCategory, setEditCategory] = useState(null);

  const fetchCategories = () => {
    setLoading(true);
    procurementApi.getItemCategories()
      .then(r => setCategories(r.data.data || []))
      .catch(() => setError("Failed to load categories."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCategories(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleDeactivate = async (cat) => {
    if (!window.confirm('Deactivate category "' + cat.name + '"?')) return;
    try {
      await procurementApi.deactivateItemCategory(cat.id);
      showToast("Category deactivated.");
      fetchCategories();
    } catch {
      setError("Failed to update category.");
    }
  };

  return (
    <div>
      <div className="page-header ic-page-header">
        <h1 className="page-heading">Item Categories</h1>
        {!isGlobalLocked && <button className="btn btn-primary" onClick={() => { setEditCategory(null); setShowForm(true); }}>+ Add Category</button>}
      </div>

      {isGlobalLocked && (
        <div className="alert ic-readonly-alert">
          Item Categories are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      <div className="ic-intro-text">
        Categories are used for the Item Master catalog, custom items on Purchase Requisitions, and Approval Rule matching (e.g., routing all "Books" purchases through a specific approval chain).
      </div>

      {success && <div className="alert alert-success ic-mb16">{success}</div>}
      {error && <div className="alert alert-error ic-mb16">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading categories...</div>
      ) : categories.length === 0 ? (
        <div className="empty-state">No categories yet. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Parent Category</th>
                <th>Status</th>
                {!isGlobalLocked && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.parent_name || <span className="ic-none-text">None</span>}</td>
                  <td><span className={"badge " + (c.is_active ? "badge-success" : "badge-gray")}>{c.is_active ? "Active" : "Inactive"}</span></td>
                  {!isGlobalLocked && (
                    <td className="ic-actions-cell">
                      <button className="btn btn-ghost btn-xs" onClick={() => { setEditCategory(c); setShowForm(true); }}>Edit</button>
                      {c.is_active && (
                        <button className="btn btn-danger btn-xs" onClick={() => handleDeactivate(c)}>Deactivate</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CategoryFormModal
          category={editCategory}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editCategory ? "Category updated." : "Category added."); fetchCategories(); }}
        />
      )}
    </div>
  );
}
