import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";

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
        await libraryApi.updateCategory(category.id, payload);
      } else {
        await libraryApi.createCategory(payload);
      }
      onSaved();
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const otherCategories = categories.filter(c => c.id !== category?.id);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{category ? "Edit Category" : "Add Category"}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : category ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LibraryCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editCategory, setEditCategory] = useState(null);

  const fetchCategories = () => {
    setLoading(true);
    libraryApi.getAllCategories()
      .then(r => setCategories(r.data.data || []))
      .catch(() => setError("Failed to load categories."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCategories(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (cat) => {
    try {
      if (cat.is_active) {
        await libraryApi.deactivateCategory(cat.id);
        showToast("Category deactivated.");
      } else {
        await libraryApi.reactivateCategory(cat.id);
        showToast("Category reactivated.");
      }
      fetchCategories();
    } catch {
      setError("Failed to update category status.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Categories</h1>
        <button className="btn btn-primary" onClick={() => { setEditCategory(null); setShowForm(true); }}>+ Add Category</button>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.parent_name || <span style={{ color: "#94a3b8" }}>None</span>}</td>
                  <td><span className={"badge " + (c.is_active ? "badge-success" : "badge-gray")}>{c.is_active ? "Active" : "Inactive"}</span></td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => { setEditCategory(c); setShowForm(true); }}>Edit</button>
                    <button className={"btn btn-xs " + (c.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(c)}>
                      {c.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
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
