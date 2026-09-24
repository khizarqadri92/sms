import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useAuth } from "../auth/AuthContext";

function DepartmentFormModal({ department, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: department?.name || "",
    head_user_id: department?.head_user_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const payload = { name: form.name, head_user_id: form.head_user_id || null };
      if (department) {
        await procurementApi.updateDepartment(department.id, payload);
      } else {
        await procurementApi.createDepartment(payload);
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
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{department ? "Edit Department" : "Add Department"}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Department Head (User ID)</label>
            <input className="form-control" type="number" value={form.head_user_id} onChange={e => setForm({ ...form, head_user_id: e.target.value })} placeholder="Optional" />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Enter the user ID of the department head, if known.</div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : department ? "Update" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Departments() {
  const { user } = useAuth();
  const isSuperAdmin = (user?.roles?.[0] || "") === "superadmin";
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editDepartment, setEditDepartment] = useState(null);

  const fetchDepartments = () => {
    setLoading(true);
    procurementApi.getDepartments()
      .then(r => setDepartments(r.data.data || []))
      .catch(() => setError("Failed to load departments."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDepartments(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleToggleActive = async (dept) => {
    try {
      if (dept.is_active) {
        await procurementApi.deactivateDepartment(dept.id);
        showToast("Department deactivated.");
      } else {
        await procurementApi.reactivateDepartment(dept.id);
        showToast("Department reactivated.");
      }
      fetchDepartments();
    } catch {
      setError("Failed to update department status.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Departments</h1>
        {isSuperAdmin && <button className="btn btn-primary" onClick={() => { setEditDepartment(null); setShowForm(true); }}>+ Add Department</button>}
      </div>

      {!isSuperAdmin && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Departments are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading departments...</div>
      ) : departments.length === 0 ? (
        <div className="empty-state">No departments yet. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department Head</th>
                <th>Status</th>
                {isSuperAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {departments.map(d => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.head_name || <span style={{ color: "#94a3b8" }}>Not assigned</span>}</td>
                  <td><span className={"badge " + (d.is_active ? "badge-success" : "badge-gray")}>{d.is_active ? "Active" : "Inactive"}</span></td>
                  {isSuperAdmin && (
                    <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setEditDepartment(d); setShowForm(true); }}>Edit</button>
                      <button className={"btn btn-xs " + (d.is_active ? "btn-danger" : "btn-secondary")} onClick={() => handleToggleActive(d)}>
                        {d.is_active ? "Deactivate" : "Reactivate"}
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
        <DepartmentFormModal
          department={editDepartment}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); showToast(editDepartment ? "Department updated." : "Department added."); fetchDepartments(); }}
        />
      )}
    </div>
  );
}
