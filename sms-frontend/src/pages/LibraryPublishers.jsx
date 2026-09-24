import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";

function PublisherFormModal({ publisher, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: publisher?.name || "",
    address: publisher?.address || "",
    contact_person: publisher?.contact_person || "",
    phone: publisher?.phone || "",
    email: publisher?.email || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      if (publisher) {
        await libraryApi.updatePublisher(publisher.id, form);
      } else {
        await libraryApi.createPublisher(form);
      }
      onSaved();
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, maxHeight: "85vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{publisher ? "Edit Publisher" : "Add Publisher"}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Person</label>
            <input className="form-control" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : publisher ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LibraryPublishers() {
  const { isGlobalLocked } = useGovernanceMode("library_publishers");
  const [publishers, setPublishers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editPublisher, setEditPublisher] = useState(null);

  const fetchPublishers = () => {
    setLoading(true);
    libraryApi.getAllPublishers()
      .then(r => setPublishers(r.data.data || []))
      .catch(() => setError("Failed to load publishers."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPublishers(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (publisher) => {
    try {
      if (publisher.is_active) {
        await libraryApi.deactivatePublisher(publisher.id);
        showToast("Publisher deactivated.");
      } else {
        await libraryApi.reactivatePublisher(publisher.id);
        showToast("Publisher reactivated.");
      }
      fetchPublishers();
    } catch {
      setError("Failed to update publisher status.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Publishers</h1>
        {!isGlobalLocked && <button className="btn btn-primary" onClick={() => { setEditPublisher(null); setShowForm(true); }}>+ Add Publisher</button>}
      </div>

      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Library Publishers are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading publishers...</div>
      ) : publishers.length === 0 ? (
        <div className="empty-state">No publishers yet. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Status</th>
                {!isGlobalLocked && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {publishers.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.contact_person || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td>{p.phone || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td>{p.email || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td style={{ maxWidth: 200, fontSize: 12, color: "#64748b" }}>{p.address || "-"}</td>
                  <td><span className={"badge " + (p.is_active ? "badge-success" : "badge-gray")}>{p.is_active ? "Active" : "Inactive"}</span></td>
                  {!isGlobalLocked && (
                    <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setEditPublisher(p); setShowForm(true); }}>Edit</button>
                      <button className={"btn btn-xs " + (p.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(p)}>
                        {p.is_active ? "Deactivate" : "Reactivate"}
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
        <PublisherFormModal
          publisher={editPublisher}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editPublisher ? "Publisher updated." : "Publisher added."); fetchPublishers(); }}
        />
      )}
    </div>
  );
}
