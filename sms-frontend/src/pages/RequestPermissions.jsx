import { useState, useEffect } from "react";
import requestPermissionsApi from "../api/requestPermissionsApi";

const SCOPE_LABELS = {
  none: "No Access",
  all: "All Departments",
  specific: "Specific Departments",
  hod: "HOD of Own Department",
};

export default function RequestPermissions() {
  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [grants, setGrants] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [deptPicker, setDeptPicker] = useState(null);

  const key = (roleId, requestType) => `${roleId}::${requestType}`;

  const load = () => {
    setLoading(true);
    requestPermissionsApi.get().then(r => {
      const data = r.data.data;
      setRequests(data.requests || []);
      setRoles(data.roles || []);
      setDepartments(data.departments || []);
      const map = {};
      (data.grants || []).forEach(g => { map[key(g.role_id, g.request_type)] = { scope: g.scope, department_ids: g.department_ids || [] }; });
      setGrants(map);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const getGrant = (roleId, requestType) => grants[key(roleId, requestType)] || { scope: "none", department_ids: [] };

  const save = async (roleId, requestType, scope, departmentIds) => {
    const k = key(roleId, requestType);
    setSaving(k);
    const prev = grants[k];
    setGrants(g => ({ ...g, [k]: { scope, department_ids: departmentIds } }));
    try {
      await requestPermissionsApi.upsert({ role_id: roleId, request_type: requestType, scope, department_ids: departmentIds });
    } catch (e) {
      setGrants(g => ({ ...g, [k]: prev || { scope: "none", department_ids: [] } }));
    } finally {
      setSaving(null);
    }
  };

  const handleScopeChange = (roleId, requestType, newScope) => {
    const current = getGrant(roleId, requestType);
    if (newScope === "specific") {
      setDeptPicker({ roleId, requestType, selected: new Set(current.department_ids) });
    } else {
      save(roleId, requestType, newScope, []);
    }
  };

  const toggleDeptInPicker = (deptId) => {
    setDeptPicker(p => {
      const next = new Set(p.selected);
      if (next.has(deptId)) next.delete(deptId); else next.add(deptId);
      return { ...p, selected: next };
    });
  };

  const saveDeptPicker = () => {
    save(deptPicker.roleId, deptPicker.requestType, "specific", Array.from(deptPicker.selected));
    setDeptPicker(null);
  };

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Request Permissions</div>
        <div style={{fontSize:13,color:"#64748b"}}>Control which roles can view which request pages, scoped by department. This is additive to existing module permissions (e.g. HR access already sees everything).</div>
      </div>

      {loading && <div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}

      {!loading && (
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                <th style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0",position:"sticky",left:0,background:"#f8fafc"}}>Request Type</th>
                {roles.map(r => (
                  <th key={r.id} style={{padding:"10px 12px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"center",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>
                    {r.name.replace(/_/g," ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((req, i) => (
                <tr key={req.key} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"10px 14px",fontWeight:600,position:"sticky",left:0,background:i%2===0?"#fff":"#fafafa"}}>{req.label}</td>
                  {roles.map(role => {
                    const grant = getGrant(role.id, req.key);
                    const k = key(role.id, req.key);
                    const isSaving = saving === k;
                    return (
                      <td key={role.id} style={{padding:"8px 10px",textAlign:"center"}}>
                        <select value={grant.scope} disabled={isSaving}
                          onChange={e => handleScopeChange(role.id, req.key, e.target.value)}
                          style={{fontSize:12,padding:"4px 6px",borderRadius:6,border:"1px solid #e2e8f0",minWidth:150}}>
                          {Object.entries(SCOPE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                        {grant.scope === "specific" && (
                          <div style={{fontSize:10,color:"#64748b",marginTop:3,cursor:"pointer",textDecoration:"underline"}}
                            onClick={() => setDeptPicker({ roleId: role.id, requestType: req.key, selected: new Set(grant.department_ids) })}>
                            {grant.department_ids.length} dept(s) - edit
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deptPicker && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}
          onClick={() => setDeptPicker(null)}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,maxHeight:"70vh",overflowY:"auto"}} onClick={e => e.stopPropagation()}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:15}}>Select Departments</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeptPicker(null)}>Close</button>
            </div>
            <div style={{padding:20}}>
              {departments.map(d => (
                <label key={d.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:8,cursor:"pointer"}}>
                  <input type="checkbox" checked={deptPicker.selected.has(d.id)} onChange={() => toggleDeptInPicker(d.id)} />
                  {d.name}
                </label>
              ))}
              <button className="btn btn-primary btn-sm" style={{color:"#fff",marginTop:10}} onClick={saveDeptPicker}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
