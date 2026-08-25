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
        <div className="modal-header">
          <span className="modal-title">Manage Role</span>
          <button className="modal-close" onClick={onClose}>&#10005;</button>
        </div>
        <div className="modal-body">
          <p style={{ color:"var(--color-text-secondary)", fontSize:14, marginBottom:20 }}>
            User: <strong>{user.first_name} {user.last_name}</strong> ({user.email})
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-control" value={roleId} onChange={e => setRoleId(e.target.value)}>
                <option value="">&mdash; Select role &mdash;</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Action</label>
              <select className="form-control" value={action} onChange={e => setAction(e.target.value)}>
                <option value="assign">Assign role</option>
                <option value="revoke">Revoke role</option>
              </select>
            </div>
            <div className="modal-footer" style={{ padding:0, marginTop:16, border:"none" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Updating..." : "Update Role"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
