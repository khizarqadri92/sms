import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import RequisitionDetailModal from "../components/RequisitionDetailModal";

const statusBadge = (status) => ({
  draft: "badge-gray",
  submitted: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
  converted_to_po: "badge-primary",
}[status] || "badge-gray");

function NewRequisitionModal({ departments, onClose, onCreated }) {
  const [form, setForm] = useState({ department_id: "", priority: "normal", is_emergency: false, budget_head: "", remarks: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const r = await procurementApi.createRequisition({ ...form, department_id: form.department_id || null });
      onCreated(r.data.data.id);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create requisition.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>New Purchase Requisition</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Department</label>
            <select className="form-control" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              <option value="">Select department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="form-group" style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_emergency} onChange={e => setForm({ ...form, is_emergency: e.target.checked })} />
                Emergency Purchase
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Budget Head</label>
            <input className="form-control" value={form.budget_head} onChange={e => setForm({ ...form, budget_head: e.target.value })} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <textarea className="form-control" rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create Draft"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddItemModal({ items, categories, onClose, onAdded }) {
  const [mode, setMode] = useState("catalog");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [form, setForm] = useState({ item_description: "", quantity: "1", unit: "", estimated_unit_price: "", remarks: "" });
  const [categoryId, setCategoryId] = useState("");
  const [bookDetails, setBookDetails] = useState({ author: "", publisher: "", isbn: "", edition: "" });
  const [genericSpecs, setGenericSpecs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = categories.find(c => String(c.id) === String(categoryId));
  const isBookCategory = selectedCategory && selectedCategory.name.toLowerCase().includes("book");

  const handleCatalogSelect = (id) => {
    setSelectedItemId(id);
    const item = items.find(i => String(i.id) === String(id));
    if (item) {
      setForm({ ...form, item_description: item.item_name, unit: item.unit });
    }
  };

  const buildSpecifications = () => {
    if (mode !== "custom") return null;
    if (isBookCategory) {
      const cleaned = Object.fromEntries(Object.entries(bookDetails).filter(([, v]) => v));
      return Object.keys(cleaned).length ? cleaned : null;
    }
    return genericSpecs ? { notes: genericSpecs } : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item_description || !form.quantity || !form.unit) { setError("Description, quantity, and unit are required."); return; }
    if (mode === "custom" && !categoryId) { setError("Please select a category for this item."); return; }
    setSaving(true); setError("");
    try {
      await onAdded({
        item_id: mode === "catalog" ? selectedItemId || null : null,
        item_description: form.item_description,
        quantity: form.quantity,
        unit: form.unit,
        estimated_unit_price: form.estimated_unit_price || null,
        remarks: form.remarks || null,
        category_id: mode === "custom" ? categoryId : null,
        specifications: buildSpecifications(),
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, maxHeight: "88vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add Item</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button type="button" className="btn btn-sm" style={mode === "catalog" ? { background: "#2563eb", color: "#fff", border: "none" } : { background: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0" }} onClick={() => setMode("catalog")}>From Catalog</button>
          <button type="button" className="btn btn-sm" style={mode === "custom" ? { background: "#2563eb", color: "#fff", border: "none" } : { background: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0" }} onClick={() => setMode("custom")}>Custom Item</button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "catalog" && (
            <div className="form-group">
              <label className="form-label">Item</label>
              <select className="form-control" value={selectedItemId} onChange={e => handleCatalogSelect(e.target.value)}>
                <option value="">Select an item</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.item_code})</option>)}
              </select>
            </div>
          )}
          {mode === "custom" && (
            <>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <input className="form-control" value={form.item_description} onChange={e => setForm({ ...form, item_description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Category *</label>
                <select className="form-control" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">Select a category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {isBookCategory && (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Book Details</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label">Author</label>
                      <input className="form-control" value={bookDetails.author} onChange={e => setBookDetails({ ...bookDetails, author: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label">Publisher</label>
                      <input className="form-control" value={bookDetails.publisher} onChange={e => setBookDetails({ ...bookDetails, publisher: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label">ISBN</label>
                      <input className="form-control" value={bookDetails.isbn} onChange={e => setBookDetails({ ...bookDetails, isbn: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Edition</label>
                      <input className="form-control" value={bookDetails.edition} onChange={e => setBookDetails({ ...bookDetails, edition: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {categoryId && !isBookCategory && (
                <div className="form-group">
                  <label className="form-label">Additional Specifications</label>
                  <textarea className="form-control" rows={2} value={genericSpecs} onChange={e => setGenericSpecs(e.target.value)} placeholder="Brand, model, size, or any other relevant details" />
                </div>
              )}
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input className="form-control" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Unit *</label>
              <input className="form-control" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, box..." />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Estimated Unit Price (Rs.)</label>
            <input className="form-control" type="number" min="0" step="0.01" value={form.estimated_unit_price} onChange={e => setForm({ ...form, estimated_unit_price: e.target.value })} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Optional" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Adding..." : "Add Item"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DraftEditPanel({ draft, items, categories, onClose, onChanged }) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAddItem = async (payload) => {
    await procurementApi.addRequisitionItem(draft.id, payload);
    onChanged();
  };

  const handleRemoveItem = async (itemRowId) => {
    try {
      await procurementApi.removeRequisitionItem(itemRowId);
      onChanged();
    } catch {
      setError("Failed to remove item.");
    }
  };

  const handleSubmitPR = async () => {
    if (!window.confirm("Submit this requisition for approval? You won't be able to edit items after this.")) return;
    setSubmitting(true); setError("");
    try {
      await procurementApi.submitRequisition(draft.id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 600, maxHeight: "88vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{draft.pr_number}</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Draft - add items, then submit for approval</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 8px" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Items</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddItem(true)}>+ Add Item</button>
        </div>

        {draft.items.length === 0 ? (
          <div className="empty-state">No items added yet.</div>
        ) : (
          <div className="table-container" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Est. Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map(it => (
                  <tr key={it.id}>
                    <td>
                      {it.item_description}
                      {it.specifications && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {Object.entries(it.specifications).map(([k, v]) => k + ": " + v).join(" / ")}
                        </div>
                      )}
                    </td>
                    <td>{Number(it.quantity).toLocaleString()}</td>
                    <td>{it.unit}</td>
                    <td>{it.estimated_unit_price ? "Rs. " + Number(it.estimated_unit_price).toLocaleString() : "-"}</td>
                    <td><button className="btn btn-danger btn-xs" onClick={() => handleRemoveItem(it.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ textAlign: "right", fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Estimated Total: <strong>Rs. {Number(draft.total_estimated_amount).toLocaleString()}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" disabled={submitting || draft.items.length === 0} onClick={handleSubmitPR}>
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>

        {showAddItem && (
          <AddItemModal items={items} categories={categories} onClose={() => setShowAddItem(false)} onAdded={handleAddItem} />
        )}
      </div>
    </div>
  );
}

export default function MyRequisitions() {
  const [requisitions, setRequisitions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [viewId, setViewId] = useState(null);

  const fetchRequisitions = () => {
    setLoading(true);
    procurementApi.getMyRequisitions()
      .then(r => setRequisitions(r.data.data || []))
      .catch(() => setError("Failed to load requisitions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequisitions();
    procurementApi.getDepartments().then(r => setDepartments((r.data.data || []).filter(d => d.is_active))).catch(() => {});
    procurementApi.getItems().then(r => setItems((r.data.data || []).filter(i => i.is_active))).catch(() => {});
    procurementApi.getItemCategories().then(r => setCategories((r.data.data || []).filter(c => c.is_active))).catch(() => {});
  }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const openDraft = (id) => {
    procurementApi.getRequisition(id).then(r => { setDraft(r.data.data); setDraftId(id); }).catch(() => setError("Failed to load draft."));
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">My Purchase Requisitions</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Requisition</button>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : requisitions.length === 0 ? (
        <div className="empty-state">No requisitions yet. Create one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>PR Number</th>
                <th>Department</th>
                <th>Priority</th>
                <th>Items</th>
                <th>Est. Total</th>
                <th>Status</th>
                <th>Current Step</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map(pr => (
                <tr key={pr.id}>
                  <td><strong>{pr.pr_number}</strong></td>
                  <td>{pr.department_name || "-"}</td>
                  <td style={{ textTransform: "capitalize" }}>{pr.priority}{pr.is_emergency && " (Emergency)"}</td>
                  <td>{pr.item_count}</td>
                  <td>Rs. {Number(pr.total_estimated_amount).toLocaleString()}</td>
                  <td><span className={"badge " + statusBadge(pr.status)} style={{ textTransform: "capitalize" }}>{pr.status.replace("_", " ")}</span></td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{pr.current_step_role ? "Step " + pr.current_step_order + ": " + pr.current_step_role.replace("_", " ") : "-"}</td>
                  <td>
                    {pr.status === "draft" ? (
                      <button className="btn btn-secondary btn-xs" onClick={() => openDraft(pr.id)}>Edit / Submit</button>
                    ) : (
                      <button className="btn btn-ghost btn-xs" onClick={() => setViewId(pr.id)}>View</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewRequisitionModal
          departments={departments}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); fetchRequisitions(); showToast("Draft created. Add items and submit when ready."); openDraft(id); }}
        />
      )}

      {draftId && draft && (
        <DraftEditPanel
          draft={draft}
          items={items}
          categories={categories}
          onClose={() => { setDraftId(null); setDraft(null); fetchRequisitions(); }}
          onChanged={() => openDraft(draftId)}
        />
      )}

      {viewId && (
        <RequisitionDetailModal requisitionId={viewId} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}
