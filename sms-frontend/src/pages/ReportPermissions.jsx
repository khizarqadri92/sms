import { useState, useEffect } from "react";
import reportPermissionsApi from "../api/reportPermissionsApi";
import "../styles/theme-tokens.css";

export default function ReportPermissions() {
  const [reports, setReports] = useState([]);
  const [roles, setRoles] = useState([]);
  const [grants, setGrants] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const grantKey = (roleId, code) => `${roleId}::${code}`;

  const load = () => {
    setLoading(true);
    reportPermissionsApi.getReportPermissions().then(r => {
      const data = r.data.data;
      setReports(data.reports || []);
      setRoles(data.roles || []);
      setGrants(new Set((data.grants || []).map(g => grantKey(g.role_id, g.permission_code))));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (roleId, code) => {
    const key = grantKey(roleId, code);
    const currentlyGranted = grants.has(key);
    const nextGranted = !currentlyGranted;
    setSaving(key);

    const newGrants = new Set(grants);
    if (nextGranted) newGrants.add(key); else newGrants.delete(key);
    setGrants(newGrants);

    try {
      await reportPermissionsApi.toggle({ role_id: roleId, permission_code: code, granted: nextGranted });
    } catch (e) {
      const reverted = new Set(grants);
      setGrants(reverted);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{padding:24,background:"var(--dm-surface-3)",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"var(--dm-ink)",marginBottom:4}}>Report Permissions</div>
        <div style={{fontSize:13,color:"var(--dm-soft)"}}>Control which roles can view which reports</div>
      </div>

      {loading && <div style={{background:"var(--dm-surface)",borderRadius:12,padding:60,textAlign:"center",color:"var(--dm-faint)",border:"1px solid var(--dm-line)"}}>Loading...</div>}

      {!loading && (
        <div style={{background:"var(--dm-surface)",borderRadius:12,border:"1px solid var(--dm-line)",overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"var(--dm-surface-2)"}}>
                <th style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"var(--dm-faint)",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid var(--dm-line)",position:"sticky",left:0,background:"var(--dm-surface-2)"}}>Report</th>
                {roles.map(r => (
                  <th key={r.id} style={{padding:"10px 12px",fontSize:11,fontWeight:700,color:"var(--dm-faint)",textTransform:"uppercase",textAlign:"center",borderBottom:"1px solid var(--dm-line)",whiteSpace:"nowrap"}}>
                    {r.name.replace(/_/g," ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((rep, i) => (
                <tr key={rep.key} style={{borderBottom:"1px solid var(--dm-line)",background:i%2===0?"var(--dm-surface)":"var(--dm-surface-2)"}}>
                  <td style={{padding:"10px 14px",fontWeight:600,position:"sticky",left:0,background:i%2===0?"var(--dm-surface)":"var(--dm-surface-2)"}}>{rep.label}</td>
                  {roles.map(role => {
                    const key = grantKey(role.id, rep.permission_code);
                    const checked = grants.has(key);
                    const isSaving = saving === key;
                    return (
                      <td key={role.id} style={{padding:"10px 12px",textAlign:"center"}}>
                        <input type="checkbox" checked={checked} disabled={isSaving}
                          onChange={() => toggle(role.id, rep.permission_code)}
                          style={{width:16,height:16,cursor:"pointer"}} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
