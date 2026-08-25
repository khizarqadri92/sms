import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import usersApi from "../api/usersApi";
import CreateUserModal from "../components/users/CreateUserModal";
import AssignRoleModal from "../components/users/AssignRoleModal";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

function getRoleBadge(role) {
  const map = {
    superadmin:           "badge-danger",
    admin:                "badge-warning",
    principal:            "badge-purple",
    academic_coordinator: "badge-primary",
    teacher:              "badge-success",
    finance_officer:      "badge-warning",
    parent:               "badge-gray",
    student:              "badge-primary",
  };
  return map[role] || "badge-gray";
}

export default function Users() {
  const { formatDate } = useRegionalSettings();
  const { can } = useAuth();
  const [users, setUsers]       = useState([]);
  const [roles, setRoles]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [search, setSearch]         = useState("");
  const [page, setPage]           = useState(1);
  const [roleFilter, setRoleFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [total, setTotal]       = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelected] = useState(null);

  useEffect(() => { fetchUsers(); }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.sub === "create") setShowCreate(true);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);
  useEffect(() => { fetchRoles(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = { page, per_page:20 };
      if (search)       params.search    = search;
      if (roleFilter)   params.role      = roleFilter;
      if (statusFilter) params.is_active = statusFilter;
      const res = await usersApi.getAll(params);
      setUsers(res.data.data            || []);
      setTotal(res.data.pagination?.total || 0);
    } catch { setError("Failed to load users."); }
    finally  { setLoading(false); }
  };

  const fetchRoles = async () => {
    try { const res = await usersApi.getAllRoles(); setRoles(res.data.data || []); } catch {}
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("Deactivate this user? They will no longer be able to log in.")) return;
    try { await usersApi.remove(id); setSuccess("User deactivated."); fetchUsers(); }
    catch { setError("Failed to deactivate."); }
  };

  const handleReactivate = async (id) => {
    if (!window.confirm("Reactivate this user? They will be able to log in again.")) return;
    try { await usersApi.reactivate(id); setSuccess("User reactivated."); fetchUsers(); }
    catch { setError("Failed to reactivate."); }
  };

  const handleCreated = () => { setShowCreate(false); setSuccess("User created."); fetchUsers(); setTimeout(() => setSuccess(""), 3000); };
  const handleRoleAssigned = () => { setSelected(null); setSuccess("Role updated."); fetchUsers(); setTimeout(() => setSuccess(""), 3000); };

  return (
    <div>
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-heading">Users</h1>
          <span className="badge badge-primary">{total} total</span>
        </div>
        {can("users.create") && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create User</button>}
      </div>

      <div className="toolbar">
        <div style={{ display:"flex", gap:8, flex:1, flexWrap:"wrap" }}>
            <input
              className="search-input"
              placeholder="Search by name, email or phone..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ flex:1, minWidth:200 }}
            />
            <select
              className="filter-select"
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="admin">Admin</option>
              <option value="principal">Principal</option>
              <option value="academic_coordinator">Coordinator</option>
              <option value="teacher">Teacher</option>
              <option value="finance_officer">Finance Officer</option>
              <option value="parent">Parent</option>
              <option value="student">Student</option>
            </select>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? <div className="loading-state">Loading users...</div>
      : users.length === 0 ? <div className="empty-state">No users found.</div>
      : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"#eff6ff", color:"#2563eb", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {(u.first_name?.[0] || "") + (u.last_name?.[0] || "")}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, color:"#0f172a" }}>{u.first_name} {u.last_name}</div>
                        <div style={{ fontSize:11, color:"#94a3b8" }}>{u.phone || "No phone"}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize:13, color:"#475569" }}>{u.email}</td>
                  <td>
                    {u.roles?.length > 0
                      ? u.roles.map(r => <span key={r} className={"badge " + getRoleBadge(r)} style={{ marginRight:4 }}>{r.replace("_"," ")}</span>)
                      : <span className="badge badge-gray">No role</span>}
                  </td>
                  <td><span className={`badge ${u.is_active ? "badge-success" : "badge-danger"}`}>{u.is_active ? "Active" : "Inactive"}</span></td>
                  <td style={{ fontSize:12, color:"#64748b" }}>{u.last_login_at ? formatDate(u.last_login_at) : "Never"}</td>
                  <td style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => setSelected(u)}>Assign Role</button>
                    {can("users.delete") && (
                      u.is_active ? (
                        <button className="btn btn-danger btn-xs" onClick={() => handleDeactivate(u.id)}>Deactivate</button>
                      ) : (
                        <button className="btn btn-secondary btn-xs" onClick={() => handleReactivate(u.id)}>Activate</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button className="pg-btn" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>â† Prev</button>
        <span className="pg-info">Page {page}</span>
        <button className="pg-btn" onClick={() => setPage(p => p+1)} disabled={users.length<20}>Next â†’</button>
      </div>

      {showCreate && <CreateUserModal roles={roles} onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
      {selectedUser && <AssignRoleModal user={selectedUser} roles={roles} onAssigned={handleRoleAssigned} onClose={() => setSelected(null)} />}
    </div>
  );
}