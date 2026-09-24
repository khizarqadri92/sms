import { useState, useEffect } from "react";
import campusesApi from "../api/campusesApi";

const EMPTY_FORM = {
  id: null, name: "", code: "", address: "", contact_phone: "", contact_email: "", is_active: true, uses_own_settings: false,
};

export default function Campuses() {
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true);
    campusesApi.list().then(r => setCampuses(r.data.data || [])).catch(() => setError("Failed to load campuses.")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startEdit = (c) => {
    setForm({
      id: c.id, name: c.name, code: c.code || "", address: c.address || "",
      contact_phone: c.contact_phone || "", contact_email: c.contact_email || "", is_active: c.is_active,
      uses_own_settings: c.uses_own_settings || false,
    });
    setShowForm(true);
    setError(""); setSuccess("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Campus name is required."); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      await campusesApi.upsert({
        id: form.id,
        name: form.name,
        code: form.code || null,
        address: form.address || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        is_active: form.is_active,
        uses_own_settings: form.uses_own_settings,
      });
      setSuccess(form.id ? "Campus updated." : "Campus created.");
      setTimeout(() => setSuccess(""), 4000);
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save campus.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Campuses</h1>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowForm(!showForm); setError(""); }}>
          {showForm ? "Cancel" : "+ Add Campus"}
        </button>
      </div>

      {showForm && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <div className="section-card-header">
            <span className="section-card-title">{form.id ? "Edit Campus" : "New Campus"}</span>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Campus Name *</label>
              <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Code / Prefix (optional)</label>
              <input className="form-control" value={form.code} placeholder="e.g. CAM-A" onChange={e => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="form-group form-grid-full">
              <label className="form-label">Address</label>
              <input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Phone</label>
              <input className="form-control" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Email</label>
              <input className="form-control" type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div className="form-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 24 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="form-group form-grid-full">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.uses_own_settings} onChange={e => setForm({ ...form, uses_own_settings: e.target.checked })} />
                This campus manages its own settings (school timing, ID formats, attendance config, fee settings)
              </label>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                If unchecked, this campus follows Main Campus's shared settings automatically.
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : form.id ? "Update Campus" : "Create Campus"}
          </button>
        </div>
      )}

      {success && <div className="alert alert-success">{success}</div>}
      {error && !showForm && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading campuses...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Students</th>
              <th>Teachers</th>
              <th>Staff</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campuses.map(c => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong>{c.is_main && <span className="badge badge-primary" style={{ marginLeft: 8, fontSize: 10 }}>Main</span>}</td>
                <td>{c.code || "-"}</td>
                <td>{c.student_count}</td>
                <td>{c.teacher_count}</td>
                <td>{c.staff_count}</td>
                <td><span className={"badge " + (c.is_active ? "badge-success" : "badge-danger")}>{c.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}