import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";

function AuthorFormModal({ author, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: author?.name || "",
    nationality: author?.nationality || "",
    date_of_birth: author?.date_of_birth ? author.date_of_birth.slice(0, 10) : "",
    bio: author?.bio || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      if (author) {
        await libraryApi.updateAuthor(author.id, form);
      } else {
        await libraryApi.createAuthor(form);
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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{author ? "Edit Author" : "Add Author"}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Nationality</label>
            <input className="form-control" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input className="form-control" type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Biography</label>
            <textarea className="form-control" rows={3} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : author ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LibraryAuthors() {
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editAuthor, setEditAuthor] = useState(null);

  const fetchAuthors = () => {
    setLoading(true);
    libraryApi.getAllAuthors()
      .then(r => setAuthors(r.data.data || []))
      .catch(() => setError("Failed to load authors."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAuthors(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (author) => {
    try {
      if (author.is_active) {
        await libraryApi.deactivateAuthor(author.id);
        showToast("Author deactivated.");
      } else {
        await libraryApi.reactivateAuthor(author.id);
        showToast("Author reactivated.");
      }
      fetchAuthors();
    } catch {
      setError("Failed to update author status.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Authors</h1>
        <button className="btn btn-primary" onClick={() => { setEditAuthor(null); setShowForm(true); }}>+ Add Author</button>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading authors...</div>
      ) : authors.length === 0 ? (
        <div className="empty-state">No authors yet. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Nationality</th>
                <th>Date of Birth</th>
                <th>Biography</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {authors.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.nationality || <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td>{a.date_of_birth ? new Date(a.date_of_birth).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : <span style={{ color: "#94a3b8" }}>-</span>}</td>
                  <td style={{ maxWidth: 260, fontSize: 12, color: "#64748b" }}>{a.bio ? (a.bio.length > 80 ? a.bio.slice(0, 80) + "..." : a.bio) : "-"}</td>
                  <td><span className={"badge " + (a.is_active ? "badge-success" : "badge-gray")}>{a.is_active ? "Active" : "Inactive"}</span></td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => { setEditAuthor(a); setShowForm(true); }}>Edit</button>
                    <button className={"btn btn-xs " + (a.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(a)}>
                      {a.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <AuthorFormModal
          author={editAuthor}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editAuthor ? "Author updated." : "Author added."); fetchAuthors(); }}
        />
      )}
    </div>
  );
}
