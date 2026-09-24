import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";

function QuickAddCategoryModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      await procurementApi.createVendorCategory({ name });
      onSaved();
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 340 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add Vendor Category</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} autoFocus />
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

function VendorFormModal({ vendor, categories, onClose, onSaved, onQuickAddCategory }) {
  const [form, setForm] = useState({
    name: vendor?.name || "",
    contact_person: vendor?.contact_person || "",
    phone: vendor?.phone || "",
    email: vendor?.email || "",
    address: vendor?.address || "",
    ntn: vendor?.ntn || "",
    strn: vendor?.strn || "",
    bank_name: vendor?.bank_name || "",
    bank_account_no: vendor?.bank_account_no || "",
    bank_iban: vendor?.bank_iban || "",
    category_id: vendor?.category_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form, category_id: form.category_id || null };
      if (vendor) {
        await procurementApi.updateVendor(vendor.id, payload);
      } else {
        await procurementApi.createVendor(payload);
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
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 520, maxHeight: "88vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{vendor ? "Edit Vendor" : "Add Vendor"}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Vendor Name *</label>
              <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Person</label>
              <input className="form-control" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Email</label>
              <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Address</label>
              <input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">NTN</label>
              <input className="form-control" value={form.ntn} onChange={e => setForm({ ...form, ntn: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">STRN</label>
              <input className="form-control" value={form.strn} onChange={e => setForm({ ...form, strn: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Bank Name</label>
              <input className="form-control" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Account No.</label>
              <input className="form-control" value={form.bank_account_no} onChange={e => setForm({ ...form, bank_account_no: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">IBAN</label>
              <input className="form-control" value={form.bank_iban} onChange={e => setForm({ ...form, bank_iban: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Category</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select className="form-control" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onQuickAddCategory}>+ New</button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : vendor ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BlacklistModal({ vendor, onClose, onSaved }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await procurementApi.blacklistVendor(vendor.id, { reason });
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Blacklist Vendor</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{vendor.name}</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea className="form-control" rows={3} value={reason} onChange={e => setReason(e.target.value)} required />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? "Saving..." : "Blacklist"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Vendors() {
  const { isGlobalLocked } = useGovernanceMode("procurement_vendors");
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [quickAddCategory, setQuickAddCategory] = useState(false);
  const [blacklistVendorTarget, setBlacklistVendorTarget] = useState(null);

  const fetchVendors = (activeSearch) => {
    setLoading(true);
    const params = {};
    const s = activeSearch !== undefined ? activeSearch : search;
    if (s) params.search = s;
    procurementApi.getVendors(params)
      .then(r => setVendors(r.data.data || []))
      .catch(() => setError("Failed to load vendors."))
      .finally(() => setLoading(false));
  };

  const fetchCategories = () => {
    procurementApi.getVendorCategories().then(r => setCategories(r.data.data || [])).catch(() => {});
  };

  useEffect(() => { fetchVendors(); fetchCategories(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (vendor) => {
    try {
      if (vendor.is_active) {
        await procurementApi.deactivateVendor(vendor.id);
        showToast("Vendor deactivated.");
      } else {
        await procurementApi.reactivateVendor(vendor.id);
        showToast("Vendor reactivated.");
      }
      fetchVendors();
    } catch {
      setError("Failed to update vendor status.");
    }
  };

  const handleUnblacklist = async (vendor) => {
    if (!window.confirm("Remove " + vendor.name + " from the blacklist?")) return;
    try {
      await procurementApi.unblacklistVendor(vendor.id);
      showToast("Vendor removed from blacklist.");
      fetchVendors();
    } catch {
      setError("Failed to update vendor.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Vendors</h1>
        {!isGlobalLocked && <button className="btn btn-primary" onClick={() => { setEditVendor(null); setShowForm(true); }}>+ Add Vendor</button>}
      </div>

      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Vendors are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="form-control" placeholder="Search by name, contact, or NTN" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchVendors()} />
          <button className="btn btn-secondary" onClick={() => fetchVendors()}>Search</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading vendors...</div>
      ) : vendors.length === 0 ? (
        <div className="empty-state">No vendors yet. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Contact</th>
                <th>NTN / STRN</th>
                <th>Status</th>
                {!isGlobalLocked && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td>{v.category_name || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td>
                    <div>{v.contact_person || "-"}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{v.phone || v.email || ""}</div>
                  </td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{v.ntn || "-"} / {v.strn || "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                      <span className={"badge " + (v.is_active ? "badge-success" : "badge-gray")}>{v.is_active ? "Active" : "Inactive"}</span>
                      {v.is_blacklisted && <span className="badge badge-danger">Blacklisted</span>}
                    </div>
                  </td>
                  {!isGlobalLocked && (
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => { setEditVendor(v); setShowForm(true); }}>Edit</button>
                        <button className={"btn btn-xs " + (v.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(v)}>
                          {v.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                        {v.is_blacklisted ? (
                          <button className="btn btn-secondary btn-xs" onClick={() => handleUnblacklist(v)}>Unblacklist</button>
                        ) : (
                          <button className="btn btn-danger btn-xs" onClick={() => setBlacklistVendorTarget(v)}>Blacklist</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <VendorFormModal
          vendor={editVendor}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editVendor ? "Vendor updated." : "Vendor added."); fetchVendors(); }}
          onQuickAddCategory={() => setQuickAddCategory(true)}
        />
      )}

      {quickAddCategory && (
        <QuickAddCategoryModal
          onClose={() => setQuickAddCategory(false)}
          onSaved={() => { setQuickAddCategory(false); fetchCategories(); }}
        />
      )}

      {blacklistVendorTarget && (
        <BlacklistModal
          vendor={blacklistVendorTarget}
          onClose={() => setBlacklistVendorTarget(null)}
          onSaved={() => { setBlacklistVendorTarget(null); showToast("Vendor blacklisted."); fetchVendors(); }}
        />
      )}
    </div>
  );
}
