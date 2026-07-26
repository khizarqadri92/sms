import React, { useState, useEffect } from "react";
import hrApi from "../api/hrApi";
import { useAuth } from "../auth/AuthContext";

export default function HRSetup() {
  const { permissions = [] } = useAuth();
  const canManage = permissions.includes("hr.designations");

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
    <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:20,height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid #e2e8f0",fontWeight:700,fontSize:15,color:"#0f172a"}}>
        {title}
      </div>
      <div style={{padding:16,flex:1,display:"flex",flexDirection:"column",minHeight:0}}>{children}</div>
    </div>
  );

  return (
    <div style={{padding:24,maxWidth:1000,margin:"0 auto"}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:20,color:"#0f172a"}}>HR Setup</h1>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

        {/* Departments */}
        {card("Departments",
          <>
            {canManage&&(
              <div style={{marginBottom:12,padding:12,background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                <div style={{fontWeight:600,fontSize:12,marginBottom:8,color:"#334155"}}>Add Sub-Department</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,alignItems:"flex-end"}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Under (Parent) *</div>
                    <select className="form-input" style={{fontSize:13}} value={deptForm.parent_id||""} onChange={e=>setDeptForm(p=>({...p,parent_id:e.target.value||null}))}>
                      <option value="">Select parent...</option>
                      {departments.filter(d=>!d.parent_id&&d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Sub-Department Name *</div>
                    <input className="form-input" placeholder="e.g. Academic Faculty" style={{fontSize:13}}
                      value={deptForm.name} onChange={e=>setDeptForm(p=>({...p,name:e.target.value}))}/>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{color:"#fff",whiteSpace:"nowrap",height:36}}
                    onClick={async()=>{
                      if(!deptForm.name.trim()||!deptForm.parent_id){showFlash("error","Select parent and enter name.");return;}
                      try{
                        await hrApi.createDepartment({name:deptForm.name,parent_id:Number(deptForm.parent_id),is_parent:false});
                        setDeptForm({name:"",parent_id:null});
                        loadAll(); showFlash("success","Sub-department added.");
                      }catch(e){showFlash("error",e.response?.data?.detail?.message||"Failed.");}
                    }}>+ Add</button>
                </div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>
                  Note: Top-level departments (Academic, Finance, HR, etc.) are fixed and cannot be added manually.
                </div>
              </div>
            )}
            <div style={{maxHeight:280,overflowY:"auto"}}>
              {departments.filter(d=>!d.parent_id).map(parent=>(
                <div key={parent.id} style={{marginBottom:8}}>
                  <div style={{padding:"8px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#f1f5f9",fontSize:13,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>🏢 {parent.name}</span>
                    <span style={{fontSize:10,color:"#64748b"}}>{parent.role_count||0} roles</span>
                  </div>
                  {departments.filter(d=>d.parent_id===parent.id).map(child=>(
                    <div key={child.id} style={{padding:"6px 10px 6px 24px",borderRadius:6,border:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:500,marginTop:2,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>└ {child.name}</span>
                      <span style={{fontSize:10,color:"#94a3b8"}}>{child.role_count||0} roles</span>
                    </div>
                  ))}
                </div>
              ))}
              {departments.filter(d=>!d.parent_id&&!departments.some(x=>x.parent_id===d.id)&&departments.length>0).length===0&&
                departments.filter(d=>!d.parent_id).length===0&&
                <div style={{fontSize:12,color:"#94a3b8",padding:12,textAlign:"center"}}>No departments yet.</div>}
            </div>
          </>
        )}

        {/* Department → Role Mapping */}
        {card("Department → Role Mapping",
          <>
            {canManage&&(
              <>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                <select className="form-input" style={{flex:1,fontSize:12}} value={setupDept} onChange={e=>setSetupDept(e.target.value)}>
                  <option value="">Department...</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select className="form-input" style={{flex:1,fontSize:12}} value={setupRole} onChange={e=>setSetupRole(e.target.value)}>
                  <option value="">Role...</option>
                  {allRoles.map(r=><option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" style={{color:"#fff",whiteSpace:"nowrap"}}
                  onClick={async()=>{
                    if(!setupDept||!setupRole){showFlash("error","Select both.");return;}
                    try{ await hrApi.addDeptRole(setupDept,setupRole); setSetupDept(""); setSetupRole(""); loadAll(); showFlash("success","Mapping added."); }
                    catch(e){showFlash("error",e.response?.data?.detail?.message||"Already exists.");}
                  }}>Add</button>
              </div>
              </>
            )}
            <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
              {setupDeptRoles.map(dr=>(
                <div key={dr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:6,border:"1px solid #f1f5f9",marginBottom:4,background:"#f8fafc"}}>
                  <div style={{fontSize:13}}><strong>{dr.department_name}</strong> → {roleLabel(dr.role_name)}</div>
                  {canManage&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11}}
                    onClick={async()=>{await hrApi.removeDeptRole(dr.id);loadAll();}}>Remove</button>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Designations */}
        {card("Designations",
          <>
            {canManage&&(
              <>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                <input className="form-input" placeholder="Designation name *" style={{flex:1,fontSize:12}}
                  value={desigForm.name} onChange={e=>setDesigForm(p=>({...p,name:e.target.value}))}/>
                <select className="form-input" style={{fontSize:12,width:140}} value={desigForm.department_id}
                  onChange={e=>setDesigForm(p=>({...p,department_id:e.target.value}))}>
                  <option value="">Dept (opt.)</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" style={{color:"#fff",whiteSpace:"nowrap"}}
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
                <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,fontSize:12,fontWeight:600,
                  background:desigMsg.type==="success"?"#dcfce7":"#fee2e2",
                  color:desigMsg.type==="success"?"#166534":"#dc2626"}}>
                  {desigMsg.type==="success"?"\u2713 ":"\u26a0 "}{desigMsg.text}
                </div>
              )}
              </>
            )}
            <div style={{maxHeight:200,overflowY:"auto"}}>
              {designations.map(d=>(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:6,border:"1px solid #f1f5f9",marginBottom:4,background:"#f8fafc"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{d.name}</div>
                    {d.department_name&&<div style={{fontSize:11,color:"#64748b"}}>{d.department_name}</div>}
                  </div>
                  {canManage&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11}}
                    onClick={async()=>{await hrApi.deleteDesignation(d.id);loadAll();}}>Remove</button>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* All System Roles (read-only) */}
        {card("System Roles",
          <div style={{maxHeight:200,overflowY:"auto"}}>
            {allRoles.map(r=>(
              <div key={r.id} style={{padding:"7px 10px",borderRadius:6,border:"1px solid #f1f5f9",marginBottom:4,background:"#f8fafc",fontSize:13}}>
                {roleLabel(r.name)}
              </div>
            ))}
          </div>
        )}
      </div>

      {flash&&<div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"10px 18px",borderRadius:8,
        background:flash.type==="success"?"#dcfce7":"#fee2e2",color:flash.type==="success"?"#166534":"#dc2626",
        boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:14,fontWeight:600}}>{flash.msg}</div>}
    </div>
  );
}
