import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import usersApi from "../api/usersApi";


export default function Roles() {
  const { can } = useAuth();
  const [roles, setRoles]         = useState([]);
  const [allPerms, setAllPerms]   = useState([]);
  const [selectedRole, setRole]   = useState(null);
  const [rolePerms, setRolePerms] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving]       = useState(null);
  const [success, setSuccess]     = useState("");
  const [error, setError]         = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [r, p] = await Promise.all([
        usersApi.getAllRoles(),
        usersApi.getAllPermissions(),
      ]);
      setRoles(r.data.data    || []);
      setAllPerms(p.data.data || []);
    } catch {
      setError("Failed to load roles and permissions.");
    } finally {
      setLoading(false);
    }
  };

  const selectRole = async (role) => {
    setRole(role);
    setRolePerms([]);
    setLoadingPerms(true);
    try {
      const res = await usersApi.getRolePermissions(role.id);
      setRolePerms(res.data.data || []);
    } catch {
      setError("Failed to load role permissions.");
    } finally {
      setLoadingPerms(false);
    }
  };

  const togglePermission = async (perm, checked) => {
    setSaving(perm.id);
    setError("");
    const action = checked ? "grant" : "revoke";
    try {
      await usersApi.assignPermission({
        role_id:       selectedRole.id,
        permission_id: perm.id,
        action,
      });
      setRolePerms(prev =>
        checked
          ? [...prev, perm.code]
          : prev.filter(c => c !== perm.code)
      );
      setSuccess(`${perm.code} ${action}ed for ${selectedRole.name}.`);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError(`Failed to ${action} permission.`);
    } finally {
      setSaving(null);
    }
  };

  const groupedPerms = allPerms.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const moduleGrantedCount = (module) =>
    allPerms
      .filter(p => p.module === module)
      .filter(p => rolePerms.includes(p.code)).length;

  const moduleTotalCount = (module) =>
    allPerms.filter(p => p.module === module).length;

  if (loading) return <div className="loading-text">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Roles &amp; Permissions</h1>
        {selectedRole && (
          <span className="total-badge">
            {rolePerms.length} / {allPerms.length} permissions granted
          </span>
        )}
      </div>

      {error   && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      <div className="roles-layout">

        <div className="roles-panel">
          <h2>Roles</h2>
          <p className="roles-hint">Select a role to manage its permissions</p>
          {roles.map(r => (
            <div
              key={r.id}
              className={`role-item ${selectedRole?.id === r.id ? "role-item-active" : ""}`}
              onClick={() => selectRole(r)}
            >
              <span className="role-item-name">{r.name}</span>
              {r.description && (
                <span className="role-item-desc">{r.description}</span>
              )}
            </div>
          ))}
        </div>

        <div className="perms-panel">
          {!selectedRole ? (
            <div className="empty-text">ÃƒÂ¢Ã¢â‚¬Â Ã‚Â Select a role from the left panel</div>
          ) : loadingPerms ? (
            <div className="loading-text">Loading permissions...</div>
          ) : (
            <>
              <div className="perms-header">
                <h2>Permissions for: <span className="perms-role-name">{selectedRole.name}</span></h2>
                <p className="perms-desc">{selectedRole.description}</p>
              </div>

              {Object.entries(groupedPerms).map(([module, perms]) => (
                <div key={module} className="perm-module">
                  <div className="perm-module-header">
                    <span className="perm-module-title">{module}</span>
                    <span className="perm-module-count">
                      {moduleGrantedCount(module)} / {moduleTotalCount(module)}
                    </span>
                  </div>
                  <div className="perm-list">
                    {perms.map(p => (
                      <label
                        key={p.id}
                        className={`perm-item ${saving === p.id ? "perm-item-saving" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={rolePerms.includes(p.code)}
                          disabled={saving === p.id}
                          onChange={e => togglePermission(p, e.target.checked)}
                        />
                        <span className="perm-item-action" title={p.description}>{p.code.includes(".") ? p.code.split(".")[1] : p.action}</span>
                        {saving === p.id && (
                          <span className="perm-saving-indicator">saving...</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
