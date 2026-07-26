import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { configApi } from "../api/configApi";
import { examsApi } from "../api/examsApi";

const DEPT_OPTIONS = [
  {key:"finance",   label:"Finance",   icon:"💰"},
  {key:"library",   label:"Library",   icon:"📚"},
  {key:"admin",     label:"Admin",     icon:"🏛️"},
  {key:"hr",        label:"HR",        icon:"👥"},
  {key:"transport", label:"Transport", icon:"🚌"},
];

const Toggle = ({checked, onChange}) => (
  <span onClick={onChange} style={{position:"relative",display:"inline-block",width:42,height:22,cursor:"pointer",background:checked?"#2563eb":"#cbd5e1",borderRadius:24,flexShrink:0,transition:"background .2s"}}>
    <span style={{position:"absolute",height:16,width:16,left:checked?23:3,bottom:3,background:"#fff",borderRadius:"50%",transition:"left .2s"}} />
  </span>
);

export default function ConfigPage() {
  const { user } = useAuth();
  const [activeTab,    setActiveTab]    = useState("withdrawal");
  const [examSubTab,   setExamSubTab]   = useState("types");
  const [toast,        setToast]        = useState("");
  const [toastType,    setToastType]    = useState("success");
  const [loading,      setLoading]      = useState(false);

  const [wConfig, setWConfig] = useState({
    departments:["finance","library","admin"], require_coordinator:true,
    require_principal:true, allow_appeal:false, appeal_days:7,
    required_documents:[], tc_prefix:"TC", auto_generate_tc:true
  });
  const [waiverAuthRole, setWaiverAuthRole] = useState("principal");
  const [dConfig, setDConfig] = useState({
    violation_types:[], severity_labels:{"1":"Minor","2":"Moderate","3":"Serious","4":"Critical"},
    hearing_min_severity:2, committee_min_members:2, require_head:true,
    allow_appeal:true, appeal_days:7, max_suspension_days:14, auto_reinstate:true
  });
  const [examTypes,    setExamTypes]    = useState([]);
  const [gradingScale, setGradingScale] = useState([]);
  const [gradingMode,  setGradingMode]  = useState("score");
  const [examConfig,   setExamConfig]   = useState({});
  const [newExamType,    setNewExamType]    = useState({name:"",code:"",weight:0,order_no:1});
  const [components,     setComponents]     = useState([]);
  const [formula,        setFormula]        = useState([]);
  const [formulaTotal,   setFormulaTotal]   = useState(0);
  const safeTotal = Number(formulaTotal)||0;
  const [newComponent,   setNewComponent]   = useState({name:"",code:"",collection_method:"per_subject",description:""});
  const [formulaMode,    setFormulaMode]    = useState("percentage");
  const [editingType,  setEditingType]  = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [newDoc,       setNewDoc]       = useState("");
  const [newViolation, setNewViolation] = useState({label:"",default_severity:1});

  const flash = (type, msg) => { setToastType(type); setToast(msg); setTimeout(()=>setToast(""),3500); };

  useEffect(() => {
    configApi.getWithdrawal().then(r=>setWConfig(r.data.data||wConfig)).catch(()=>{});
    fetch("/api/v1/settings/category/finance",{headers:{"Authorization":"Bearer "+(localStorage.getItem("access_token")||"")}}).then(r=>r.json()).then(d=>{if(d?.data?.waiver_authority_role)setWaiverAuthRole(d.data.waiver_authority_role);}).catch(()=>{});
    configApi.getDiscipline().then(r=>setDConfig(r.data.data||dConfig)).catch(()=>{});
    examsApi.getTypes().then(r=>setExamTypes(r.data.data||[])).catch(()=>{});
    examsApi.getComponents().then(r=>setComponents(r.data.data||[])).catch(()=>{});
    examsApi.getFormula().then(r=>{ if(r.data.data) { setFormula(r.data.data.formula||[]); setFormulaTotal(r.data.data.total_weight||0); if(r.data.data.formula_mode) setFormulaMode(r.data.data.formula_mode||"percentage"); } }).catch(()=>{});
    examsApi.getGrading().then(r=>setGradingScale(r.data.data||[])).catch(()=>{});
    examsApi.getExamConfig().then(r=>{
      if (r.data.data) {
        setExamConfig(r.data.data);
        if (r.data.data.grading_mode) setGradingMode(r.data.data.grading_mode);
      }
    }).catch(()=>{});
  }, []);

  const saveWithdrawal = async () => {
    setLoading(true);
    try { await configApi.updateWithdrawal(wConfig); flash("success","Withdrawal config saved."); }
    catch { flash("error","Failed to save."); } finally { setLoading(false); }
  };

  const saveDiscipline = async () => {
    setLoading(true);
    try { await configApi.updateDiscipline(dConfig); flash("success","Discipline config saved."); }
    catch { flash("error","Failed."); } finally { setLoading(false); }
  };

  const SEVERITY_COLORS = {1:"#22c55e",2:"#f59e0b",3:"#ef4444",4:"#991b1b"};

  // Exam type helpers
  const formalTypes     = examTypes.filter(t=>["FIRST_TERM","FINAL_TERM"].includes(t.code)||(!["ASSIGNMENT","QUIZ","UNIT_TEST"].includes(t.code)&&!t.is_assessment));
  const assessmentTypes = examTypes.filter(t=>["ASSIGNMENT","QUIZ","UNIT_TEST"].includes(t.code)||t.is_assessment);
  const totalWeight     = examTypes.reduce((s,t)=>s+Number(t.weight||0),0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Workflow Configuration</h1>
      </div>

      {toast && <div className={"alert "+(toastType==="error"?"alert-error":"alert-success")} style={{marginBottom:16}}>{toast}</div>}

      {/* Main Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid var(--color-border-tertiary)",marginBottom:20}}>
        {[{key:"withdrawal",label:"Withdrawal"},{key:"discipline",label:"Discipline"},{key:"exam",label:"Exam & Grading"}].map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{padding:"10px 24px",border:"none",borderBottom:"2px solid "+(activeTab===t.key?"#2563eb":"transparent"),background:"transparent",color:activeTab===t.key?"#2563eb":"var(--color-text-secondary)",fontWeight:activeTab===t.key?600:400,fontSize:14,cursor:"pointer"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── WITHDRAWAL CONFIG ── */}
      {activeTab==="withdrawal" && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Clearance Departments</span></div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:14}}>Select which departments must clear a withdrawal request.</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {DEPT_OPTIONS.map(d=>{
                const active = (wConfig.departments||[]).includes(d.key);
                return (
                  <button key={d.key} onClick={()=>setWConfig(c=>({...c,departments:active?c.departments.filter(x=>x!==d.key):[...c.departments,d.key]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:10,border:"2px solid",borderColor:active?"#2563eb":"#e2e8f0",background:active?"#eff6ff":"#fff",color:active?"#2563eb":"#64748b",fontWeight:active?600:400,cursor:"pointer",fontSize:13}}>
                    <span>{d.icon}</span>{d.label}{active&&<span style={{fontSize:10,background:"#2563eb",color:"#fff",padding:"1px 6px",borderRadius:10}}>Required</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Approval Chain</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[{key:"require_coordinator",label:"Require Coordinator Review",desc:"Coordinator must review and forward to departments"},{key:"require_principal",label:"Require Principal Approval",desc:"Principal must give final approval"}].map(item=>(
                <div key={item.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                  <div><div style={{fontSize:14,fontWeight:600}}>{item.label}</div><div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{item.desc}</div></div>
                  <Toggle checked={!!wConfig[item.key]} onChange={()=>setWConfig(c=>({...c,[item.key]:!c[item.key]}))} />
                </div>
              ))}
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Appeal Settings</span></div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",marginBottom:12}}>
              <div><div style={{fontSize:14,fontWeight:600}}>Allow Parent Appeal</div><div style={{fontSize:12,color:"var(--color-text-secondary)"}}>Parents can appeal against withdrawal decision</div></div>
              <Toggle checked={!!wConfig.allow_appeal} onChange={()=>setWConfig(c=>({...c,allow_appeal:!c.allow_appeal}))} />
            </div>
            {wConfig.allow_appeal&&<div className="form-group" style={{marginBottom:0}}><label className="form-label">Appeal Window (days)</label><input type="number" className="form-control" style={{width:120}} min={1} max={30} value={wConfig.appeal_days} onChange={e=>setWConfig(c=>({...c,appeal_days:parseInt(e.target.value)||7}))} /></div>}
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Transfer Certificate</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">TC Number Prefix</label><input type="text" className="form-control" value={wConfig.tc_prefix||"TC"} onChange={e=>setWConfig(c=>({...c,tc_prefix:e.target.value}))} /></div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>Auto-generate TC</div><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Generate on approval</div></div>
                <Toggle checked={!!wConfig.auto_generate_tc} onChange={()=>setWConfig(c=>({...c,auto_generate_tc:!c.auto_generate_tc}))} />
              </div>
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Fee Waiver Authority</span></div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:14}}>Select which role can approve or reject fee waiver requests during withdrawal.</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <select className="form-control" style={{maxWidth:220}} value={waiverAuthRole} onChange={e=>setWaiverAuthRole(e.target.value)}>
                <option value="principal">Principal</option>
                <option value="superadmin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="academic_coordinator">Academic Coordinator</option>
              </select>
              <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={async()=>{try{await fetch("/api/v1/settings/category/finance",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(localStorage.getItem("access_token")||"")},body:JSON.stringify({waiver_authority_role:waiverAuthRole})});flash("success","Waiver authority saved.");}catch(e){flash("error","Failed to save.");}}}>Save</button>
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Required Documents</span></div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input type="text" className="form-control" value={newDoc} onChange={e=>setNewDoc(e.target.value)} placeholder="e.g. Birth Certificate..." onKeyDown={e=>e.key==="Enter"&&(newDoc.trim()&&setWConfig(c=>({...c,required_documents:[...(c.required_documents||[]),newDoc.trim()]}))&&setNewDoc(""))} />
              <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={()=>{if(newDoc.trim()){setWConfig(c=>({...c,required_documents:[...(c.required_documents||[]),newDoc.trim()]}));setNewDoc("");}}}>Add</button>
            </div>
            {(wConfig.required_documents||[]).length===0?<div style={{fontSize:13,color:"var(--color-text-secondary)",fontStyle:"italic"}}>No required documents.</div>:(wConfig.required_documents||[]).map((doc,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",marginBottom:6}}>
                <span style={{fontSize:13}}>📄 {doc}</span>
                <button onClick={()=>setWConfig(c=>({...c,required_documents:c.required_documents.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:12,fontWeight:600}}>Remove</button>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button className="btn btn-primary" disabled={loading} onClick={saveWithdrawal}>{loading?"Saving...":"Save Withdrawal Config"}</button>
          </div>
        </div>
      )}

      {/* ── DISCIPLINE CONFIG ── */}
      {activeTab==="discipline" && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Hearing Settings</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:14}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Minimum Severity for Hearing</label>
                <select className="form-control" value={dConfig.hearing_min_severity} onChange={e=>setDConfig(c=>({...c,hearing_min_severity:parseInt(e.target.value)}))}>
                  {[1,2,3,4].map(s=><option key={s} value={s}>{s} - {(dConfig.severity_labels||{})[s]||s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Minimum Committee Members</label>
                <input type="number" className="form-control" min={1} max={10} value={dConfig.committee_min_members} onChange={e=>setDConfig(c=>({...c,committee_min_members:parseInt(e.target.value)||2}))} />
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {[{key:"require_head",label:"Require Committee Head",desc:"One member must be head"},{key:"auto_reinstate",label:"Auto-reinstate on Return Date",desc:"Reinstate suspended students automatically"}].map(item=>(
                <div key={item.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                  <div><div style={{fontSize:13,fontWeight:600}}>{item.label}</div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{item.desc}</div></div>
                  <Toggle checked={!!dConfig[item.key]} onChange={()=>setDConfig(c=>({...c,[item.key]:!c[item.key]}))} />
                </div>
              ))}
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Suspension & Appeal</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">Maximum Suspension Days</label><input type="number" className="form-control" min={1} max={365} value={dConfig.max_suspension_days} onChange={e=>setDConfig(c=>({...c,max_suspension_days:parseInt(e.target.value)||14}))} /></div>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",marginBottom:8}}>
                  <div><div style={{fontSize:13,fontWeight:600}}>Allow Parent Appeal</div><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Against suspension or expulsion</div></div>
                  <Toggle checked={!!dConfig.allow_appeal} onChange={()=>setDConfig(c=>({...c,allow_appeal:!c.allow_appeal}))} />
                </div>
                {dConfig.allow_appeal&&<div className="form-group" style={{marginBottom:0}}><label className="form-label">Appeal Window (days)</label><input type="number" className="form-control" min={1} max={30} value={dConfig.appeal_days} onChange={e=>setDConfig(c=>({...c,appeal_days:parseInt(e.target.value)||7}))} /></div>}
              </div>
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Severity Levels</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[1,2,3,4].map(s=>(
                <div key={s} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:8,border:"2px solid "+SEVERITY_COLORS[s]+"44",background:SEVERITY_COLORS[s]+"11"}}>
                  <span style={{fontWeight:800,fontSize:20,color:SEVERITY_COLORS[s],minWidth:24}}>{s}</span>
                  <input type="text" className="form-control" style={{border:"none",background:"transparent",fontWeight:600,color:SEVERITY_COLORS[s]}} value={(dConfig.severity_labels||{})[s]||""} onChange={e=>setDConfig(c=>({...c,severity_labels:{...(c.severity_labels||{}),[s]:e.target.value}}))} />
                </div>
              ))}
            </div>
          </div>
          <div className="section-card">
            <div className="section-card-header"><span className="section-card-title">Violation Types</span></div>
            <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"flex-end"}}>
              <div className="form-group" style={{marginBottom:0,flex:1}}><label className="form-label">Violation Label</label><input type="text" className="form-control" value={newViolation.label} onChange={e=>setNewViolation(f=>({...f,label:e.target.value}))} placeholder="e.g. Behavioral - Vandalism" /></div>
              <div className="form-group" style={{marginBottom:0,width:160}}><label className="form-label">Default Severity</label><select className="form-control" value={newViolation.default_severity} onChange={e=>setNewViolation(f=>({...f,default_severity:parseInt(e.target.value)}))}>{[1,2,3,4].map(s=><option key={s} value={s}>{s} - {(dConfig.severity_labels||{})[s]||s}</option>)}</select></div>
              <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={()=>{if(!newViolation.label.trim())return;const types=Array.isArray(dConfig.violation_types)?dConfig.violation_types:[];const newId=types.length>0?Math.max(...types.map(v=>v.id||0))+1:1;setDConfig(c=>({...c,violation_types:[...types,{...newViolation,id:newId}]}));setNewViolation({label:"",default_severity:1});}}>Add</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(dConfig.violation_types||[]).map((v,i)=>(
                <div key={v.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderRadius:8,border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                  <span style={{fontSize:13,flex:1}}>{v.label}</span>
                  <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,background:SEVERITY_COLORS[v.default_severity]+"22",color:SEVERITY_COLORS[v.default_severity],marginRight:12}}>Severity {v.default_severity}</span>
                  <button onClick={()=>setDConfig(c=>({...c,violation_types:(c.violation_types||[]).filter(x=>x.id!==v.id)}))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:12,fontWeight:600}}>Remove</button>
                </div>
              ))}
              {(dConfig.violation_types||[]).length===0&&<div style={{fontSize:13,color:"var(--color-text-secondary)",fontStyle:"italic"}}>No violation types configured.</div>}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}><button className="btn btn-primary" disabled={loading} onClick={saveDiscipline}>{loading?"Saving...":"Save Discipline Config"}</button></div>
        </div>
      )}

      {/* ── EXAM & GRADING CONFIG ── */}
      {activeTab==="exam" && (
        <div>
          {/* Exam Sub-tabs */}
          <div style={{display:"flex",background:"var(--color-background-secondary)",borderRadius:10,padding:4,marginBottom:20,border:"1px solid var(--color-border-tertiary)",width:"fit-content"}}>
            {[{key:"types",label:"Exam Types"},{key:"formula",label:"Result Formula"},{key:"grading",label:"Grading Scale"}].map(t=>(
              <button key={t.key} onClick={()=>setExamSubTab(t.key)} style={{padding:"8px 18px",borderRadius:8,border:"none",fontSize:13,cursor:"pointer",background:examSubTab===t.key?"var(--color-background-primary)":"transparent",color:examSubTab===t.key?"var(--color-text-primary)":"var(--color-text-secondary)",fontWeight:examSubTab===t.key?600:400,boxShadow:examSubTab===t.key?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all .15s",whiteSpace:"nowrap"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Exam Types Sub-tab */}
          {examSubTab==="types" && (
            <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>

              {/* Left: Exam Types List */}
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
                {examTypes.map((t,i)=>(
                  <div key={t.id} onClick={()=>setSelectedType(prev=>prev?.id===t.id?null:{...t})}
                    style={{background:"#fff",border:"1.5px solid",borderColor:selectedType?.id===t.id?"#0f4c35":"#e2e8f0",borderRadius:10,overflow:"hidden",cursor:"pointer",transition:"all .15s",boxShadow:selectedType?.id===t.id?"0 0 0 2px rgba(15,76,53,0.15)":"none",opacity:t.is_active?1:0.6}}>

                    {/* Card Header */}
                    <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px"}}>
                      <div style={{width:4,height:40,borderRadius:4,background:["#2563eb","#7c3aed","#f59e0b","#059669","#dc2626"][i%5],flexShrink:0}} />
                      {editingType===t.id ? (
                        <div style={{flex:1,display:"flex",gap:10,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                          <input className="form-control" style={{flex:2}} value={t.name} onChange={e=>setExamTypes(prev=>prev.map((x,j)=>j===i?{...x,name:e.target.value}:x))} />
                          <input className="form-control" style={{width:110}} value={t.code} onChange={e=>setExamTypes(prev=>prev.map((x,j)=>j===i?{...x,code:e.target.value.toUpperCase()}:x))} />
                          <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={async()=>{await examsApi.updateType(t.id,{name:t.name,code:t.code,weight:t.weight,order_no:t.order_no,is_active:t.is_active,publish_mode:t.publish_mode||"per_class",require_datesheet_approval:t.require_datesheet_approval!==false,include_in_final:t.include_in_final!==false,datesheet_submit_role:t.datesheet_submit_role||"academic_coordinator",datesheet_approve_role:t.datesheet_approve_role||"principal",datesheet_publish_role:t.datesheet_publish_role||"academic_coordinator"});flash("success","Updated.");setEditingType(null);}}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={()=>setEditingType(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                              <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{t.name}</span>
                              <span style={{fontSize:11,color:"#94a3b8",background:"#f1f5f9",padding:"1px 7px",borderRadius:6}}>{t.code}</span>
                              {!t.is_active&&<span style={{fontSize:10,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"1px 7px",borderRadius:10}}>Inactive</span>}
                            </div>
                            <div style={{fontSize:11,color:"#64748b",display:"flex",gap:12}}>
                              <span>Publish: <strong>{(t.publish_mode||"per_class")==="per_class"?"Per Class":"All Classes"}</strong></span>
                              <span>Approval: <strong>{t.require_datesheet_approval!==false?"Required":"Not required"}</strong></span>
                              <span>Weight: <strong style={{color:"#2563eb"}}>{t.weight}%</strong></span>
                            </div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10}} onClick={e=>e.stopPropagation()}>
                            <Toggle checked={!!t.is_active} onChange={async()=>{setExamTypes(prev=>prev.map((x,j)=>j===i?{...x,is_active:!x.is_active}:x));await examsApi.updateType(t.id,{...t,is_active:!t.is_active});}} />
                            <button className="btn btn-ghost btn-sm" onClick={()=>setEditingType(t.id)}>Edit</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add New */}
                <div style={{background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:10,padding:"16px 18px"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Add Exam Type</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                    <div className="form-group" style={{marginBottom:0,flex:2,minWidth:130}}><label className="form-label" style={{fontSize:11}}>Name *</label><input className="form-control" value={newExamType.name} onChange={e=>setNewExamType(f=>({...f,name:e.target.value}))} placeholder="e.g. Second Term" /></div>
                    <div className="form-group" style={{marginBottom:0,width:110}}><label className="form-label" style={{fontSize:11}}>Code *</label><input className="form-control" value={newExamType.code} onChange={e=>setNewExamType(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="SECOND_TERM" /></div>
                    <div className="form-group" style={{marginBottom:0,width:70}}><label className="form-label" style={{fontSize:11}}>Order</label><input type="number" className="form-control" value={newExamType.order_no} onChange={e=>setNewExamType(f=>({...f,order_no:e.target.value}))} min={1} /></div>
                    <button className="btn btn-primary" onClick={async()=>{if(!newExamType.name||!newExamType.code)return flash("error","Name and code required.");try{await examsApi.createType({...newExamType,weight:0});const r=await examsApi.getTypes();setExamTypes(r.data.data||[]);setNewExamType({name:"",code:"",weight:0,order_no:examTypes.length+1});flash("success","Added.");}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Add</button>
                  </div>
                </div>
              </div>

              {/* Right: Config Panel */}
              {selectedType&&(
                <div style={{width:300,flexShrink:0,background:"#fff",border:"1.5px solid #0f4c35",borderRadius:12,overflow:"hidden",position:"sticky",top:20}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{selectedType.name}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:1}}>{selectedType.code} &middot; {selectedType.weight}% weight</div>
                    </div>
                    <button onClick={()=>setSelectedType(null)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer",lineHeight:1,padding:"0 4px"}}>&#215;</button>
                  </div>

                  {/* Datesheet Workflow */}
                  <div style={{padding:"16px 18px",borderBottom:"1px solid #f1f5f9"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Datesheet Workflow</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"#f8fafc",borderRadius:8,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600}}>Require Approval</div>
                        <div style={{fontSize:11,color:"#64748b"}}>Before coordinator can publish</div>
                      </div>
                      <Toggle checked={selectedType.require_datesheet_approval!==false} onChange={async()=>{
                        const val=!(selectedType.require_datesheet_approval!==false);
                        const updated={...selectedType,require_datesheet_approval:val};
                        setSelectedType(updated);
                        setExamTypes(prev=>prev.map(x=>x.id===selectedType.id?updated:x));
                        await examsApi.updateType(selectedType.id,updated);
                        flash("success","Updated.");
                      }} />
                    </div>
                    {[
                      {key:"datesheet_submit_role",label:"Who Submits Datesheet",def:"academic_coordinator"},
                      ...(selectedType.require_datesheet_approval!==false?[{key:"datesheet_approve_role",label:"Who Approves Datesheet",def:"principal"}]:[]),
                      {key:"datesheet_publish_role",label:"Who Publishes Datesheet",def:"academic_coordinator"},
                    ].map(row=>(
                      <div key={row.key} style={{marginBottom:10}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>{row.label}</div>
                        <select value={selectedType[row.key]||row.def} onChange={async e=>{
                          const updated={...selectedType,[row.key]:e.target.value};
                          setSelectedType(updated);
                          setExamTypes(prev=>prev.map(x=>x.id===selectedType.id?updated:x));
                          await examsApi.updateType(selectedType.id,updated);
                          flash("success","Updated.");
                        }} style={{width:"100%",padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:7,fontSize:13,color:"#0f172a",background:"#fff"}}>
                          <option value="academic_coordinator">Academic Coordinator</option>
                          <option value="principal">Principal</option>
                          <option value="admin">Admin</option>
                          <option value="superadmin">Super Admin</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Result Weight */}
                  <div style={{padding:"16px 18px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Result Weight</div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <input type="number" min={0} max={100} value={selectedType.weight||0}
                        onChange={e=>setSelectedType(prev=>({...prev,weight:e.target.value}))}
                        onBlur={async()=>{
                          setExamTypes(prev=>prev.map(x=>x.id===selectedType.id?{...x,weight:selectedType.weight}:x));
                          await examsApi.updateType(selectedType.id,{...selectedType});
                          flash("success","Weight updated.");
                        }}
                        style={{width:80,padding:"8px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:18,fontWeight:800,color:"#0f172a",textAlign:"center"}} />
                      <span style={{fontSize:13,color:"#64748b"}}>% of final result</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

                    {/* Assessments Sub-tab - now merged into types */}
          {examSubTab==="assessments" && null}
          {examSubTab==="formula" && null}

                    {/* Result Formula Sub-tab */}
          {examSubTab==="formula" && (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* Formula Mode Toggle */}
              <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"16px 20px",marginBottom:0}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Calculation Mode</div>
                <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Choose how the final result is calculated across components.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {[
                    {v:"percentage",l:"Percentage Mode",d:"Each component has a weight % that must total 100%. System converts marks to percentage then applies weights.",icon:"%"},
                    {v:"marks",     l:"Marks Mode",     d:"Each component has a maximum marks value. System adds all marks directly. Total = sum of all max marks.",icon:"#"},
                  ].map(opt=>(
                    <div key={opt.v} onClick={()=>{setFormulaMode(opt.v);setFormula(prev=>prev.map(c=>({...c,weight:0})));setFormulaTotal(0);}} style={{padding:"14px 16px",borderRadius:10,border:"2px solid",borderColor:formulaMode===opt.v?"#2563eb":"#e2e8f0",background:formulaMode===opt.v?"#eff6ff":"var(--color-background-secondary)",cursor:"pointer",transition:"all .15s"}}>
                      <div style={{fontSize:18,fontWeight:800,color:formulaMode===opt.v?"#2563eb":"#94a3b8",marginBottom:6,fontFamily:"monospace"}}>{opt.icon}</div>
                      <div style={{fontWeight:700,fontSize:13,color:formulaMode===opt.v?"#2563eb":"var(--color-text-primary)"}}>{opt.l}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:4,lineHeight:1.4}}>{opt.d}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formula Status */}
              <div style={{background:Math.abs(safeTotal-100)<0.5?"#f0fdf4":"#fffbeb",border:"1.5px solid "+(Math.abs(safeTotal-100)<0.5?"#bbf7d0":"#fde68a"),borderRadius:12,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:formulaMode==="marks"?"#166534":Math.abs(safeTotal-100)<0.5?"#166534":"#854d0e"}}>{formulaMode==="marks"?(formula.length>0?"Formula Configured":"No Components Selected"):Math.abs(safeTotal-100)<0.5?"Formula Configured":"Formula Incomplete"}</div>
                  <div style={{fontSize:12,color:formulaMode==="marks"?"#166534":Math.abs(safeTotal-100)<0.5?"#166534":"#854d0e",marginTop:2}}>{formulaMode==="marks"?formula.length+" component(s) selected ? marks added directly for final result.":Math.abs(safeTotal-100)<0.5?"All weights total 100%.":"Weights must total 100%. Currently at "+safeTotal.toFixed(1)+"%."}</div>
                </div>
                <div style={{fontSize:32,fontWeight:800,color:formulaMode==="marks"?"#166534":Math.abs(safeTotal-100)<0.5?"#166534":"#854d0e"}}>{formulaMode==="marks"?formula.length+" selected":safeTotal.toFixed(0)+"%"}</div>
              </div>

              {/* Weight Bar */}
              {formula.filter(c=>c.weight>0).length>0&&(
                <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"16px 20px"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Distribution Preview</div>
                  {formulaMode==="percentage"&&(
                    <div style={{height:12,borderRadius:8,background:"#f1f5f9",overflow:"hidden",display:"flex",marginBottom:10}}>
                      {formula.filter(c=>Number(c.weight||0)>0).map((c,i)=>{
                        const colors=["#2563eb","#7c3aed","#f59e0b","#059669","#0891b2","#dc2626","#8b5cf6","#d97706"];
                        return <div key={i} style={{height:"100%",width:Math.min(Number(c.weight),100)+"%",background:colors[i%colors.length],flexShrink:0,transition:"width .2s"}} />;
                      })}
                    </div>
                  )}
                  {formulaMode==="marks"&&formula.length>0&&(
                    <div style={{padding:"10px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#166534",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Selected Components</div>
                      <div style={{fontSize:14,fontWeight:600,color:"#0f172a",lineHeight:2}}>
                        {formula.map((c,i)=>(
                          <span key={i}>
                            <span style={{background:"#eff6ff",color:"#2563eb",padding:"2px 10px",borderRadius:20,fontSize:13}}>{c.name}</span>
                            {i<formula.length-1&&<span style={{color:"#94a3b8",margin:"0 8px",fontSize:16}}>+</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Exam Types */}
              <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
                <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc"}}>
                  <div style={{fontWeight:700,fontSize:14}}>Exam Types</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Formal exams with datesheet and marks entry</div>
                </div>
                {examTypes.map((t,i)=>{
                  const entry = formula.find(f=>f.source==="exam_type"&&f.ref_id===t.id);
                  const included = !!entry;
                  const weight = entry?.weight||0;
                  return (
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:16,padding:"12px 20px",borderBottom:"1px solid #f8fafc",background:included?"#fafeff":"#fff"}}>
                      <input type="checkbox" checked={included} onChange={e=>{
                        if(e.target.checked){setFormula(prev=>[...prev,{source:"exam_type",ref_id:t.id,name:t.name,weight:0}]);}else{setFormula(prev=>{const updated=prev.filter(f=>!(f.source==="exam_type"&&f.ref_id===t.id));setFormulaTotal(updated.reduce((s,c)=>s+Number(c.weight||0),0));return updated;});}
                      }} style={{width:16,height:16,cursor:"pointer"}} />
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13}}>{t.name}</div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{t.code}</div>
                      </div>
                      {included&&formulaMode==="percentage"&&(
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <input type="number" min={0} max={100} placeholder={formulaMode==="marks"?"e.g. 100":"e.g. 40"} style={{width:80,padding:"5px 8px",border:"1.5px solid #2563eb",borderRadius:6,fontSize:13,fontWeight:700,color:"#2563eb",textAlign:"center"}}
                            value={weight||""}
                            onChange={e=>{const w=Number(e.target.value);setFormula(prev=>{const updated=prev.map(f=>f.source==="exam_type"&&f.ref_id===t.id?{...f,weight:w}:f);setFormulaTotal(updated.reduce((s,x)=>s+Number(x.weight||0),0));return updated;});}} />
                          <span style={{fontSize:12,color:"#64748b"}}>{formulaMode==="marks"?"max marks":"%"}</span>
                        </div>
                      )}
                      {!included&&<span style={{fontSize:11,color:"#cbd5e1"}}>Not included</span>}
                    </div>
                  );
                })}
              </div>

              {/* Custom Components */}
              <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
                <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc"}}>
                  <div style={{fontWeight:700,fontSize:14}}>Custom Components</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Assignment, Quiz, Attendance and other continuous assessments</div>
                </div>
                {components.map((c,i)=>{
                  const entry = formula.find(f=>f.source==="component"&&f.ref_id===c.id);
                  const included = !!entry;
                  const weight = entry?.weight||0;
                  const methodColors = {per_subject:"#eff6ff",overall:"#fdf4ff",auto:"#f0fdf4"};
                  const methodLabels = {per_subject:"Per Subject",overall:"Overall",auto:"Auto"};
                  return (
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:16,padding:"12px 20px",borderBottom:"1px solid #f8fafc",background:included?"#fafeff":"#fff",opacity:c.is_active?1:0.5}}>
                      <input type="checkbox" checked={included} disabled={!c.is_active} onChange={e=>{
                        if(e.target.checked){setFormula(prev=>[...prev,{source:"component",ref_id:c.id,name:c.name,code:c.code,weight:0}]);}else{setFormula(prev=>{const updated=prev.filter(f=>!(f.source==="component"&&f.ref_id===c.id));setFormulaTotal(updated.reduce((s,x)=>s+Number(x.weight||0),0));return updated;});}
                      }} style={{width:16,height:16,cursor:"pointer"}} />
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontWeight:600,fontSize:13}}>{c.name}</span>
                          <span style={{fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:10,background:methodColors[c.collection_method]||"#f1f5f9",color:"#475569"}}>{methodLabels[c.collection_method]||c.collection_method}</span>
                        </div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{c.description||c.code}</div>
                      </div>
                      {included&&formulaMode==="percentage"&&(
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <input type="number" min={0} max={100} placeholder={formulaMode==="marks"?"e.g. 20":"e.g. 10"} style={{width:80,padding:"5px 8px",border:"1.5px solid #2563eb",borderRadius:6,fontSize:13,fontWeight:700,color:"#2563eb",textAlign:"center"}}
                            value={weight||""}
                            onChange={e=>{const w=Number(e.target.value);setFormula(prev=>{const updated=prev.map(f=>f.source==="component"&&f.ref_id===c.id?{...f,weight:w}:f);setFormulaTotal(updated.reduce((s,x)=>s+Number(x.weight||0),0));return updated;});}} />
                          <span style={{fontSize:12,color:"#64748b"}}>{formulaMode==="marks"?"max marks":"%"}</span>
                        </div>
                      )}
                      {!included&&<span style={{fontSize:11,color:"#cbd5e1"}}>Not included</span>}
                    </div>
                  );
                })}

                {/* Add Custom Component */}
                <div style={{padding:"14px 20px",borderTop:"1px solid #f1f5f9",background:"#fafafa"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#64748b",marginBottom:10}}>Add Custom Component</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                    <div className="form-group" style={{marginBottom:0,flex:2,minWidth:120}}><label className="form-label" style={{fontSize:11}}>Name *</label><input className="form-control" value={newComponent.name} onChange={e=>setNewComponent(f=>({...f,name:e.target.value}))} placeholder="e.g. Oral Test" /></div>
                    <div className="form-group" style={{marginBottom:0,width:110}}><label className="form-label" style={{fontSize:11}}>Code *</label><input className="form-control" value={newComponent.code} onChange={e=>setNewComponent(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="ORAL_TEST" /></div>
                    <div className="form-group" style={{marginBottom:0,width:130}}><label className="form-label" style={{fontSize:11}}>Method</label>
                      <select className="form-control" value={newComponent.collection_method} onChange={e=>setNewComponent(f=>({...f,collection_method:e.target.value}))}>
                        <option value="per_subject">Per Subject</option>
                        <option value="overall">Overall</option>
                        <option value="auto">Auto (System)</option>
                      </select>
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={async()=>{
                      if(!newComponent.name||!newComponent.code) return flash("error","Name and code required.");
                      try {
                        await examsApi.createComponent(newComponent);
                        const r = await examsApi.getComponents();
                        setComponents(r.data.data||[]);
                        setNewComponent({name:"",code:"",collection_method:"per_subject",description:""});
                        flash("success","Component added.");
                      } catch(e){ flash("error",e.response?.data?.message||"Failed."); }
                    }}>Add</button>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",alignSelf:"center"}}>Total: <strong style={{color:Math.abs(safeTotal-100)<0.5?"#166534":"#854d0e"}}>{formula.reduce((s,c)=>s+Number(c.weight||0),0).toFixed(1)}%</strong></div>
                <button className="btn btn-primary" disabled={loading} onClick={async()=>{
                  const total = formula.reduce((s,c)=>s+Number(c.weight||0),0);
                  setFormulaTotal(total);
                  setLoading(true);
                  try { await examsApi.updateFormula({formula, formula_mode:formulaMode}); flash("success","Result formula saved."); }
                  catch { flash("error","Failed."); } finally { setLoading(false); }
                }}>{loading?"Saving...":"Save Formula"}</button>
              </div>
            </div>
          )}

          {/* Grading Scale Sub-tab */}
          {examSubTab==="grading" && (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="section-card">
                <div className="section-card-header"><span className="section-card-title">Grading Mode</span></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  {[{v:"score",l:"Score Based",d:"Show marks and percentage. Grade letter displayed as secondary info.",icon:"🔢"},{v:"gpa",l:"GPA Based",d:"GPA and letter grade are primary. Percentage shown as reference.",icon:"🎓"},{v:"both",l:"Score + GPA",d:"All values shown equally — marks, percentage, grade and GPA.",icon:"📊"}].map(opt=>(
                    <div key={opt.v} onClick={async()=>{setGradingMode(opt.v);const cfg=await examsApi.getExamConfig();await examsApi.updateExamConfig({...cfg.data.data,grading_mode:opt.v});flash("success","Mode updated.");}} style={{padding:"14px 16px",borderRadius:10,border:"2px solid",borderColor:gradingMode===opt.v?"#2563eb":"#e2e8f0",background:gradingMode===opt.v?"#eff6ff":"var(--color-background-secondary)",cursor:"pointer",transition:"all .15s"}}>
                      <div style={{fontSize:18,fontWeight:800,color:formulaMode===opt.v?"#2563eb":"#94a3b8",marginBottom:6,fontFamily:"monospace"}}>{opt.icon}</div>
                      <div style={{fontWeight:700,fontSize:13,color:gradingMode===opt.v?"#2563eb":"var(--color-text-primary)"}}>{opt.l}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:4}}>{opt.d}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-card">
                <div className="section-card-header"><span className="section-card-title">Grade Scale</span></div>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:14}}>Define grades with percentage ranges and GPA values. Changes apply to newly compiled results.</div>
                <div style={{marginBottom:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"70px 90px 90px 80px 1fr 90px",gap:8,padding:"8px 12px",background:"var(--color-background-secondary)",borderRadius:8,marginBottom:8}}>
                    {["Grade","Min %","Max %","GPA","Description",""].map(h=><div key={h} style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</div>)}
                  </div>
                  {gradingScale.map((g,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"70px 90px 90px 80px 1fr 90px",gap:8,padding:"6px 12px",borderRadius:8,marginBottom:4,border:"1px solid var(--color-border-tertiary)",alignItems:"center"}}>
                      <input className="form-control" value={g.grade} onChange={e=>setGradingScale(p=>p.map((x,j)=>j===i?{...x,grade:e.target.value}:x))} style={{fontWeight:700,textAlign:"center",padding:"5px"}} />
                      <input type="number" className="form-control" value={g.min_pct} onChange={e=>setGradingScale(p=>p.map((x,j)=>j===i?{...x,min_pct:e.target.value}:x))} style={{padding:"5px"}} />
                      <input type="number" className="form-control" value={g.max_pct} onChange={e=>setGradingScale(p=>p.map((x,j)=>j===i?{...x,max_pct:e.target.value}:x))} style={{padding:"5px"}} />
                      <input type="number" step="0.1" className="form-control" value={g.gpa} onChange={e=>setGradingScale(p=>p.map((x,j)=>j===i?{...x,gpa:e.target.value}:x))} style={{padding:"5px"}} />
                      <input className="form-control" value={g.description||""} onChange={e=>setGradingScale(p=>p.map((x,j)=>j===i?{...x,description:e.target.value}:x))} placeholder="e.g. Excellent" style={{padding:"5px"}} />
                      <button onClick={()=>setGradingScale(p=>p.filter((_,j)=>j!==i))} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:11,padding:"4px 8px",fontWeight:600}}>Remove</button>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setGradingScale(p=>[...p,{grade:"",min_pct:0,max_pct:0,gpa:0,description:""}])}>+ Add Grade</button>
                  <button className="btn btn-primary" disabled={loading} onClick={async()=>{setLoading(true);try{await examsApi.updateGrading({grades:gradingScale});flash("success","Grading scale saved.");}catch{flash("error","Failed.");}finally{setLoading(false);}}}>{loading?"Saving...":"Save Grading Scale"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}