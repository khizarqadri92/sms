import { useState } from "react";
import usersApi from "../../api/usersApi";

export default function CreateUserModal({ roles, onCreated, onClose }) {
  const [form, setForm]       = useState({ first_name:"", last_name:"", email:"", phone:"", password:"", role_id:"" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await usersApi.create(form); onCreated(); }
    catch (err) { setError(err.response?.data?.message || "Failed to create user."); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Create New User</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input className="form-control" name="first_name" value={form.first_name} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input className="form-control" name="last_name" value={form.last_name} onChange={handleChange} required />
              </div>
              <div className="form-group form-grid-full">
                <label className="form-label">Email *</label>
                <input className="form-control" type="email" name="email" value={form.email} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-control" name="phone" value={form.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input className="form-control" type="password" name="password" value={form.password} onChange={handleChange} required />
              </div>
              <div className="form-group form-grid-full">
                <label className="form-label">Assign Role</label>
                <select className="form-control" name="role_id" value={form.role_id} onChange={handleChange}>
                  <option value="">— Select role —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer" style={{ padding:0, marginTop:16, border:"none" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? "Creating..." : "Create User"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}