import { useState } from "react";
import usersApi from "../../api/usersApi";

export default function AssignRoleModal({ user, roles, onAssigned, onClose }) {
  const [roleId, setRoleId]   = useState("");
  const [action, setAction]   = useState("assign");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roleId) { setError("Please select a role."); return; }
    setLoading(true);
    try {
      await usersApi.assignRole(user.id, { role_id: parseInt(roleId), action });
      onAssigned();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update role.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Manage Role</h2>
        <p style={{ color:"#666", fontSize:14, marginBottom:20 }}>
          User: <strong>{user.first_name} {user.last_name}</strong> ({user.email})
        </p>
        {error && <div className="alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">Role</label>
            <select className="form-select" value={roleId} onChange={e => setRoleId(e.target.value)}>
              <option value="">— Select role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Action</label>
            <select className="form-select" value={action} onChange={e => setAction(e.target.value)}>
              <option value="assign">Assign role</option>
              <option value="revoke">Revoke role</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Updating..." : "Update Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}