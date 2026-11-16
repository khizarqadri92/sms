import React, { useState, useEffect } from "react";
import hrApi from "../api/hrApi";
import { useAuth } from "../auth/AuthContext";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./HRSetup.css";

export default function HRSetup() {
  const { permissions = [] } = useAuth();
  const { isGlobalLocked: subDeptsLocked } = useGovernanceMode("sub_departments");
  const { isGlobalLocked: designationsLocked } = useGovernanceMode("designations");
  const canManage = permissions.includes("hr.designations");
  const canManageSubDepts = canManage && !subDeptsLocked;
  const canManageDesignations = canManage && !designationsLocked;

  const [departments, setDepartments]       = useState([]);
  const [allRoles, setAllRoles]             = useState([]);
  const [designations, setDesignations]     = useState([]);
  const [setupDeptRoles, setSetupDeptRoles] = useState([]);
  const [flash, setFlash]                   = useState(null);

  const [desigForm, setDesigForm]   = useState({name:"", department_id:""});
  const [desigMsg, setDesigMsg]     = useState(null);
  const [setupDept, setSetupDept]   = useState("");
  const [setupRole, setSetupRole]   = useState("");
  const [deptForm, setDeptForm]     = useState({name:"",parent_id:null});
  const [deptMsg, setDeptMsg]       = useState(null);
  const [mapMsg, setMapMsg]         = useState(null);

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),4000); };

  const loadAll = () => {
    hrApi.getDepartments().then(r=>setDepartments(r.data.data||[])).catch(()=>{});
    hrApi.getAllRoles().then(r=>setAllRoles(r.data.data||[])).catch(()=>{});
    hrApi.getDesignations().then(r=>setDesignations(r.data.data||[])).catch(()=>{});
    hrApi.getSetupDeptRoles().then(r=>setSetupDeptRoles(r.data.data||[])).catch(()=>{});
  };

  useEffect(()=>{ loadAll(); },[]);

  const roleLabel = (name) => name?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"—";

  const card = (title, children) => (
    <div className="hrs-card">
      <div className="hrs-card-header">
        {title}
      </div>
      <div className="hrs-card-body">{children}</div>
    </div>
  );

  return (
    <div className="hrs-page">
      <h1 className="hrs-title">HR Setup</h1>

      <div className="hrs-grid">

        {/* Departments */}
        {card("Departments",
          <>
            {subDeptsLocked&&(
              <div className="hrs-locked-alert">
                Sub-departments are managed centrally by the superadmin.
              </div>
            )}
            {canManageSubDepts&&(
              <div className="hrs-add-panel">
                <div className="hrs-add-panel-title">Add Sub-Department</div>
                <div className="hrs-add-grid-3col">
                  <div>
                    <div className="hrs-field-label">Under (Parent) *</div>
                    <select className="form-input hrs-fs13" value={deptForm.parent_id||""} onChange={e=>setDeptForm(p=>({...p,parent_id:e.target.value||null}))}>
                      <option value="">Select parent...</option>
                      {departments.filter(d=>!d.parent_id&&d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="hrs-field-label">Sub-Department Name *</div>
                    <input className="form-input hrs-fs13" placeholder="e.g. Academic Faculty"
                      value={deptForm.name} onChange={e=>setDeptForm(p=>({...p,name:e.target.value}))}/>
                  </div>
                  <button className="btn btn-primary btn-sm hrs-add-btn"
                    onClick={async()=>{
                      setDeptMsg(null);
                      if(!deptForm.name.trim()||!deptForm.parent_id){setDeptMsg({type:"error",text:"Select parent and enter name."});setTimeout(()=>setDeptMsg(null),5000);return;}
                      try{
                        await hrApi.createDepartment({name:deptForm.name,parent_id:Number(deptForm.parent_id),is_parent:false});
                        setDeptForm({name:"",parent_id:null});
                        loadAll(); setDeptMsg({type:"success",text:"Sub-department added."});
                      }catch(e){setDeptMsg({type:"error",text:e.response?.data?.detail?.message||"Failed."});}
                      setTimeout(()=>setDeptMsg(null),5000);
                    }}>+ Add</button>
                </div>
                {deptMsg && (
                  <div className="hrs-msg-box" style={{
                    "--msg-bg": deptMsg.type==="success"?"#dcfce7":"#fee2e2",
                    "--msg-color": deptMsg.type==="success"?"#166534":"#dc2626"}}>
                    {deptMsg.type==="success"?"\u2713 ":"\u26a0 "}{deptMsg.text}
                  </div>
                )}
                <div className="hrs-help-text">
                  Note: Top-level departments (Academic, Finance, HR, etc.) are fixed and cannot be added manually.
                </div>
              </div>
            )}
            <div className="hrs-list-scroll">
              {departments.filter(d=>!d.parent_id).map(parent=>(
                <div key={parent.id} className="hrs-mb8">
                  <div className="hrs-parent-row">
                    <span>🏢 {parent.name}</span>
                    <span className="hrs-parent-role-count">{parent.role_count||0} roles</span>
                  </div>
                  {departments.filter(d=>d.parent_id===parent.id).map(child=>(
                    <div key={child.id} className="hrs-child-row">
                      <span>└ {child.name}</span>
                      <span className="hrs-child-role-count">{child.role_count||0} roles</span>
                    </div>
                  ))}
                </div>
              ))}
              {departments.filter(d=>!d.parent_id&&!departments.some(x=>x.parent_id===d.id)&&departments.length>0).length===0&&
                departments.filter(d=>!d.parent_id).length===0&&
                <div className="hrs-empty-text">No departments yet.</div>}
            </div>
          </>
        )}

        {/* Department → Role Mapping */}
        {card("Department → Role Mapping",
          <>
            {canManage&&(
              <>
              <div className="hrs-add-row-flex">
                <select className="form-input hrs-mapping-select" value={setupDept} onChange={e=>setSetupDept(e.target.value)}>
                  <option value="">Department...</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select className="form-input hrs-mapping-select" value={setupRole} onChange={e=>setSetupRole(e.target.value)}>
                  <option value="">Role...</option>
                  {allRoles.map(r=><option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
                <button className="btn btn-primary btn-sm hrs-add-btn"
                  onClick={async()=>{
                    setMapMsg(null);
                    if(!setupDept||!setupRole){setMapMsg({type:"error",text:"Select both."});setTimeout(()=>setMapMsg(null),5000);return;}
                    try{ await hrApi.addDeptRole(setupDept,setupRole); setSetupDept(""); setSetupRole(""); loadAll(); setMapMsg({type:"success",text:"Mapping added."}); }
                    catch(e){setMapMsg({type:"error",text:e.response?.data?.detail?.message||"Already exists."});}
                    setTimeout(()=>setMapMsg(null),5000);
                  }}>Add</button>
              </div>
              {mapMsg && (
                <div className="hrs-msg-box" style={{
                  "--msg-bg": mapMsg.type==="success"?"#dcfce7":"#fee2e2",
                  "--msg-color": mapMsg.type==="success"?"#166534":"#dc2626"}}>
                  {mapMsg.type==="success"?"\u2713 ":"\u26a0 "}{mapMsg.text}
                </div>
              )}
              </>
            )}
            <div className="hrs-list-scroll-flex">
              {setupDeptRoles.map(dr=>(
                <div key={dr.id} className="hrs-list-item-row">
                  <div className="hrs-list-item-text"><strong>{dr.department_name}</strong> → {roleLabel(dr.role_name)}</div>
                  {canManage&&<button className="btn btn-ghost btn-sm hrs-remove-btn"
                    onClick={async()=>{await hrApi.removeDeptRole(dr.id);loadAll();}}>Remove</button>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Designations */}
        {card("Designations",
          <>
            {designationsLocked&&(
              <div className="hrs-locked-alert">
                Designations are managed centrally by the superadmin.
              </div>
            )}
            {canManageDesignations&&(
              <>
              <div className="hrs-add-row-flex">
                <input className="form-input hrs-desig-input" placeholder="Designation name *"
                  value={desigForm.name} onChange={e=>setDesigForm(p=>({...p,name:e.target.value}))}/>
                <select className="form-input hrs-desig-dept-select" value={desigForm.department_id}
                  onChange={e=>setDesigForm(p=>({...p,department_id:e.target.value}))}>
                  <option value="">Dept (opt.)</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm hrs-add-btn"
                  onClick={async()=>{
                    setDesigMsg(null);
                    if(!desigForm.name.trim()){setDesigMsg({type:"error",text:"Name required."});return;}
                    try{
                      await hrApi.createDesignation({name:desigForm.name,department_id:desigForm.department_id||null});
                      setDesigForm({name:"",department_id:""});
                      loadAll();
                      setDesigMsg({type:"success",text:"Designation added."});
                    } catch(e){
                      setDesigMsg({type:"error",text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to add designation."});
                    }
                    setTimeout(()=>setDesigMsg(null), 5000);
                  }}>Add</button>
              </div>
              {desigMsg && (
                <div className="hrs-msg-box" style={{
                  "--msg-bg": desigMsg.type==="success"?"#dcfce7":"#fee2e2",
                  "--msg-color": desigMsg.type==="success"?"#166534":"#dc2626"}}>
                  {desigMsg.type==="success"?"\u2713 ":"\u26a0 "}{desigMsg.text}
                </div>
              )}
              </>
            )}
            <div className="hrs-list-scroll">
              {designations.map(d=>(
                <div key={d.id} className="hrs-list-item-row">
                  <div>
                    <div className="hrs-list-item-name">{d.name}</div>
                    {d.department_name&&<div className="hrs-list-item-subtext">{d.department_name}</div>}
                  </div>
                  {canManageDesignations&&<button className="btn btn-ghost btn-sm hrs-remove-btn"
                    onClick={async()=>{await hrApi.deleteDesignation(d.id);loadAll();}}>Remove</button>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* All System Roles (read-only) */}
        {card("System Roles",
          <div className="hrs-list-scroll">
            {allRoles.map(r=>(
              <div key={r.id} className="hrs-role-item">
                {roleLabel(r.name)}
              </div>
            ))}
          </div>
        )}
      </div>

      {flash&&<div className="hrs-flash-toast" style={{
        "--flash-bg": flash.type==="success"?"#dcfce7":"#fee2e2",
        "--flash-color": flash.type==="success"?"#166534":"#dc2626"}}>{flash.msg}</div>}
    </div>
  );
}
