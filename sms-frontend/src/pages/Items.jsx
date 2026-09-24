import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";

function QuickAddCategoryModal({ categories, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      await procurementApi.createItemCategory({ name, parent_id: parentId || null });
      onSaved();
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add Item Category</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Parent Category</label>
            <select className="form-control" value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">None (top-level)</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ItemFormModal({ item, categories, vendors, onClose, onSaved, onQuickAddCategory }) {
  const [form, setForm] = useState({
    item_code: item?.item_code || "",
    item_name: item?.item_name || "",
    unit: item?.unit || "",
    category_id: item?.category_id || "",
    min_stock: item?.min_stock ?? 0,
    max_stock: item?.max_stock || "",
    preferred_vendor_id: item?.preferred_vendor_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item_name || !form.unit) { setError("Item name and unit are required."); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        max_stock: form.max_stock || null,
        preferred_vendor_id: form.preferred_vendor_id || null,
      };
      if (item) {
        await procurementApi.updateItem(item.id, payload);
      } else {
        await procurementApi.createItem(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480, maxHeight: "88vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{item ? "Edit Item" : "Add Item"}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {!item && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Item Code</label>
                <input className="form-control" value={form.item_code} onChange={e => setForm({ ...form, item_code: e.target.value })} placeholder="Leave blank to auto-generate" />
              </div>
            )}
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Item Name *</label>
              <input className="form-control" value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Unit *</label>
              <input className="form-control" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, box, kg..." />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select className="form-control" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onQuickAddCategory}>+ New</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Min Stock</label>
              <input className="form-control" type="number" min="0" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Max Stock</label>
              <input className="form-control" type="number" min="0" value={form.max_stock} onChange={e => setForm({ ...form, max_stock: e.target.value })} placeholder="Optional" />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Preferred Vendor</label>
              <select className="form-control" value={form.preferred_vendor_id} onChange={e => setForm({ ...form, preferred_vendor_id: e.target.value })}>
                <option value="">None</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : item ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Items() {
  const { isGlobalLocked } = useGovernanceMode("procurement_items");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [quickAddCategory, setQuickAddCategory] = useState(false);

  const fetchItems = (activeSearch) => {
    setLoading(true);
    const params = {};
    const s = activeSearch !== undefined ? activeSearch : search;
    if (s) params.search = s;
    procurementApi.getItems(params)
      .then(r => setItems(r.data.data || []))
      .catch(() => setError("Failed to load items."))
      .finally(() => setLoading(false));
  };

  const fetchCategories = () => {
    procurementApi.getItemCategories().then(r => setCategories(r.data.data || [])).catch(() => {});
  };

  const fetchVendors = () => {
    procurementApi.getVendors().then(r => setVendors(r.data.data || [])).catch(() => {});
  };

  useEffect(() => { fetchItems(); fetchCategories(); fetchVendors(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (item) => {
    try {
      if (item.is_active) {
        await procurementApi.deactivateItem(item.id);
        showToast("Item deactivated.");
      } else {
        await procurementApi.reactivateItem(item.id);
        showToast("Item reactivated.");
      }
      fetchItems();
    } catch {
      setError("Failed to update item status.");
    }
  };

  const isLowStock = (item) => item.current_stock <= item.min_stock;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Item Master</h1>
        {!isGlobalLocked && <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>+ Add Item</button>}
      </div>

      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Items are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="form-control" placeholder="Search by item name or code" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchItems()} />
          <button className="btn btn-secondary" onClick={() => fetchItems()}>Search</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading items...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">No items yet. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Stock</th>
                <th>Preferred Vendor</th>
                <th>Status</th>
                {!isGlobalLocked && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td><code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{i.item_code}</code></td>
                  <td><strong>{i.item_name}</strong></td>
                  <td>{i.category_name || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td>{i.unit}</td>
                  <td>
                    <span style={{ color: isLowStock(i) ? "#dc2626" : "#0f172a", fontWeight: isLowStock(i) ? 700 : 400 }}>
                      {i.current_stock}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}> / min {i.min_stock}{i.max_stock ? ", max " + i.max_stock : ""}</span>
                    {isLowStock(i) && <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>Low Stock</div>}
                  </td>
                  <td>{i.preferred_vendor_name || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td><span className={"badge " + (i.is_active ? "badge-success" : "badge-gray")}>{i.is_active ? "Active" : "Inactive"}</span></td>
                  {!isGlobalLocked && (
                    <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setEditItem(i); setShowForm(true); }}>Edit</button>
                      <button className={"btn btn-xs " + (i.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(i)}>
                        {i.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <ItemFormModal
          item={editItem}
          categories={categories}
          vendors={vendors}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editItem ? "Item updated." : "Item added."); fetchItems(); }}
          onQuickAddCategory={() => setQuickAddCategory(true)}
        />
      )}

      {quickAddCategory && (
        <QuickAddCategoryModal
          categories={categories}
          onClose={() => setQuickAddCategory(false)}
          onSaved={() => { setQuickAddCategory(false); fetchCategories(); }}
        />
      )}
    </div>
  );
}
