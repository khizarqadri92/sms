import React, { useState, useEffect, useCallback } from "react";
import workflowApi from "../api/workflowApi";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const STEP_TYPES     = ["approve","accept","recommend","review","verify","clear","payment","finalize_settlement","finalize_exit","notify","publish","conduct","decide","hearing","assign_committee"];
const ENTITY_STEP_TYPES = {
  payroll_run: ["approve","verify","payment"],
  resignation: ["approve","accept","clear","payment","finalize_settlement","finalize_exit"],
  resignation_experience_letter: ["approve"],
  staff_leave: ["approve","recommend"],
  attendance_correction: ["approve","verify"],
  leave_application: ["approve","recommend"],
  purchase_requisition: ["approve","recommend","verify"],
  vendor_invoice: ["approve","verify","payment"],
  withdrawal_request: ["approve","clear","verify"],
  discipline_case: ["hearing","decide","conduct","assign_committee"],
  exam: ["review","approve","publish"],
  announcement: ["approve","publish"],
  book_request: ["approve"],
};
const APPROVER_TYPES = ["role","specific_user","class_teacher","dept_head","designation","dynamic"];
const PRIORITIES     = ["low","normal","high","urgent"];
const MODULES        = ["leaves","procurement","finance","withdrawal","discipline","exams","communication","library","hr"];

const MODULE_ENTITY_TYPES = {
  hr:            [
    { value: "staff_leave",           label: "Staff Leave" },
    { value: "attendance_correction", label: "Attendance Correction" },
    { value: "payroll_run",           label: "Payroll Run" },
    { value: "resignation",           label: "Employee Resignation" },
    { value: "resignation_experience_letter", label: "Experience Letter Review" },
  ],
  leaves:        [{ value: "leave_application",   label: "Leave Application" }],
  procurement:   [{ value: "purchase_requisition", label: "Purchase Requisition" }],
  finance:       [{ value: "vendor_invoice",       label: "Vendor Invoice" }],
  withdrawal:    [{ value: "withdrawal_request",   label: "Withdrawal Request" }],
  discipline:    [{ value: "discipline_case",      label: "Discipline Case" }],
  exams:         [{ value: "exam",                 label: "Exam" }],
  communication: [{ value: "announcement",         label: "Announcement" }],
  library:       [{ value: "book_request",         label: "Book Request" }],
};
const ENTITY_STATUS_OPTIONS = {
  payroll_run: ["draft","hr_submitted","pending_approval","approved","released"],
  resignation: ["submitted","manager_approved","accepted","cleared","settlement_reviewed","settled","completed","rejected","withdrawn"],
  resignation_experience_letter: ["pending_hod","pending_hr","approved","rejected_by_hod","rejected_by_hr"],
  staff_leave: ["pending","approved","rejected"],
  attendance_correction: ["pending","approved","rejected"],
  leave_application: ["pending","approved","rejected"],
  purchase_requisition: ["draft","submitted","approved","rejected","converted_to_po"],
  vendor_invoice: ["pending","verified","approved","paid","disputed","cancelled"],
  withdrawal_request: ["pending","approved","rejected","cleared"],
  exam: ["draft","scheduled","marks_open","submitted","compiled","reviewed","approved","published"],
  announcement: ["draft","published"],
  book_request: ["pending","approved","rejected"],
};
const MODULE_DEFAULT_ENTITY = Object.fromEntries(
  Object.entries(MODULE_ENTITY_TYPES).map(([m, list]) => [m, list[0]?.value || ""])
);

const OPERATOR_LABELS = {
  ">":"is greater than", "<":"is less than",
  ">=":"is greater than or equal to", "<=":"is less than or equal to",
  "=":"is equal to", "!=":"is not equal to",
  "in":"is one of", "not_in":"is not one of"
};

const OPERATORS_BY_SET = {
  numeric:  [">","<",">=","<=","=","!="],
  text:     ["=","!=","in","not_in"],
  boolean:  ["="],
  equality: ["=","!=","in","not_in"],
  all:      [">","<",">=","<=","=","!=","in","not_in"],
};

function getOperators(fieldKey, condFields) {
  const f = condFields.find(cf => cf.field_key === fieldKey);
  const set = f?.operator_set || "all";
  return OPERATORS_BY_SET[set] || OPERATORS_BY_SET.all;
}

function CondValueInput({ field, value, onChange, condFields }) {
  const f = condFields.find(cf => cf.field_key === field);
  const [dynOpts, setDynOpts] = useState([]);
  const [loadingOpts, setLoadingOpts] = useState(false);

  useEffect(() => {
    if (!f || (f.field_type !== "select" && f.field_type !== "dropdown")) return;
    if (f.dropdown_sql) {
      setLoadingOpts(true);
      workflowApi.getFieldOptions(field)
        .then(r => setDynOpts(r.data.data || []))
        .catch(() => setDynOpts([]))
        .finally(() => setLoadingOpts(false));
    } else if (f.field_options) {
      const raw = typeof f.field_options === "string" ? JSON.parse(f.field_options) : f.field_options;
      setDynOpts(raw.map(o => typeof o==="object" ? { value: o.value, label: o.label } : { value: o, label: o.charAt(0).toUpperCase()+o.slice(1) }));
    }
  }, [field]);

  if (!f) return <input className="form-input" style={{margin:0}} placeholder="Value" value={value} onChange={e=>onChange(e.target.value)}/>;

  if (f.field_type === "boolean") {
    return (
      <select className="form-input" style={{margin:0}} value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">— Select —</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  if (f.field_type === "select" || f.field_type === "dropdown") {
    return (
      <select className="form-input" style={{margin:0}} value={value} onChange={e=>onChange(e.target.value)} disabled={loadingOpts}>
        <option value="">{loadingOpts ? "Loading..." : "— Select —"}</option>
        {dynOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (f.field_type === "number") {
    return <input type="number" className="form-input" style={{margin:0}} placeholder="e.g. 5" value={value} onChange={e=>onChange(e.target.value)}/>;
  }
  return <input className="form-input" style={{margin:0}} placeholder="Value" value={value} onChange={e=>onChange(e.target.value)}/>;
}

const STEP_TYPE_COLOR = {
  approve:"#059669", recommend:"#2563eb", review:"#f59e0b", payment:"#7c3aed",
  verify:"#7c3aed", clear:"#0891b2", notify:"#64748b", publish:"#dc2626",
};

const EMPTY_STEP = {
  step_order:1, step_name:"", step_type:"approve", approver_type:"role",
  approver_role:"", approver_lookup:"", action_label:"Approve", reject_label:"Reject",
  entity_status_on_approve:"", entity_status_on_reject:"rejected",
  notify_on_assign:true, notify_title:"", notify_body:"",
  wq_priority:"normal", wq_link_template:""
};

export default function WorkflowBuilder() {
  const { formatDate } = useRegionalSettings();
  const { isGlobalLocked } = useGovernanceMode("workflow_definitions");
  const [workflows, setWorkflows]     = useState([]);
  const [roles, setRoles]             = useState([]);
  const [designations, setDesignations] = useState([]);
  const [moduleLinks, setModuleLinks] = useState([]);
  const [condFields, setCondFields]   = useState([]);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [flash, setFlash]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState("workflows");
  const [assignments, setAssignments] = useState([]);
  const [instances, setInstances]     = useState([]);
  const [showNewWF, setShowNewWF]     = useState(false);
  const [showNewStep, setNewStep]     = useState(false);
  const [editStep, setEditStep]       = useState(null);
  const [showNewAssign, setNewAssign] = useState(false);
  const [autoLink, setAutoLink]       = useState("");
  const [saving, setSaving]           = useState(false);
  const [wfForm, setWfForm]           = useState({ name:"", code:"", module:"leaves", entity_type:"leave_application", description:"", is_active:true });
  const [stepForm, setStepForm]       = useState(EMPTY_STEP);
  const [assignForm, setAssignForm]   = useState({ module:"leaves", entity_type:"leave_application", workflow_id:"", priority:0, is_default:false });
  const [newCondRows, setNewCondRows] = useState([]);

  const showFlash = (t,m) => { setFlash({type:t,msg:m}); setTimeout(()=>setFlash(null),4000); };

  const load = useCallback(()=>{
    setLoading(true);
    Promise.all([workflowApi.getWorkflows(), workflowApi.getRoles(), workflowApi.getModuleLinks(), workflowApi.getDesignations()])
      .then(([wf,r,ml,d])=>{ setWorkflows(wf.data.data||[]); setRoles(r.data.data||[]); setModuleLinks(ml.data.data||[]); setDesignations(d.data.data||[]); })
      .catch(()=>showFlash("error","Failed to load."))
      .finally(()=>setLoading(false));
  },[]);

  const loadAssignments = useCallback(()=>{
    workflowApi.getAssignments().then(r=>setAssignments(r.data.data||[])).catch(()=>{});
  },[]);

  const loadInstances = useCallback(()=>{
    workflowApi.getInstances({limit:30}).then(r=>setInstances(r.data.data||[])).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(tab !== "instances") return;
    const t = setInterval(loadInstances, 15000);
    return () => clearInterval(t);
  },[tab, loadInstances]);

  const loadCondFields = useCallback((mod, ent)=>{
    workflowApi.getConditionFields(mod, ent).then(r=>setCondFields(r.data.data||[])).catch(()=>{});
  },[]);

  useEffect(()=>{ load(); loadAssignments(); loadInstances(); },[load,loadAssignments,loadInstances]);
  useEffect(()=>{ if(assignForm.module&&assignForm.entity_type) loadCondFields(assignForm.module,assignForm.entity_type); },[assignForm.module,assignForm.entity_type,loadCondFields]);

  const selectWorkflow = (wf) => {
    setSelected(wf);
    workflowApi.getWorkflow(wf.id).then(r=>setDetail(r.data.data)).catch(()=>{});
    const ml = moduleLinks.find(m=>m.module===wf.module&&m.entity_type===wf.entity_type);
    setAutoLink(ml?ml.page_link+'?id={entity_id}':'/'+wf.module+'?id={entity_id}');
  };

  const createWorkflow = async () => {
    if(!wfForm.name||!wfForm.code){showFlash("error","Name and Code required."); return;}
    setSaving(true);
    try {
      const r = await workflowApi.createWorkflow(wfForm);
      showFlash("success","Workflow created."); setShowNewWF(false);
      setWfForm({name:"",code:"",module:"leaves",entity_type:"leave_application",description:"",is_active:true});
      load();
      if(r.data.data?.id) workflowApi.getWorkflow(r.data.data.id).then(res=>{setSelected({...wfForm,id:r.data.data.id});setDetail(res.data.data);});
    } catch(e){showFlash("error",e.response?.data?.message||"Failed.");}
    finally{setSaving(false);}
  };

  const toggleActive = async (wf) => {
    try { await workflowApi.updateWorkflow(wf.id,{...wf,is_active:!wf.is_active}); showFlash("success","Updated."); load(); if(detail?.id===wf.id) setDetail(p=>p?{...p,is_active:!p.is_active}:null); }
    catch{showFlash("error","Failed.");}
  };

  const deleteWorkflow = async (id) => {
    if(!window.confirm("Delete this workflow?")) return;
    try { await workflowApi.deleteWorkflow(id); showFlash("success","Deleted."); setSelected(null); setDetail(null); load(); }
    catch(e){showFlash("error",e.response?.data?.message||"Failed.");}
  };

  const saveStep = async () => {
    if(!stepForm.step_name){showFlash("error","Step name required."); return;}
    setSaving(true);
    try {
      if(editStep){await workflowApi.updateStep(editStep.id,stepForm); showFlash("success","Step updated.");}
      else{await workflowApi.addStep(detail.id,stepForm); showFlash("success","Step added.");}
      setNewStep(false); setEditStep(null); setStepForm(EMPTY_STEP);
      workflowApi.getWorkflow(detail.id).then(r=>setDetail(r.data.data));
    } catch{showFlash("error","Failed.");}
    finally{setSaving(false);}
  };

  const deleteStep = async (stepId) => {
    if(!window.confirm("Delete step?")) return;
    try { await workflowApi.deleteStep(stepId); workflowApi.getWorkflow(detail.id).then(r=>setDetail(r.data.data)); }
    catch{showFlash("error","Failed.");}
  };

  const openEditStep = (step) => {
    setEditStep(step);
    setStepForm({step_order:step.step_order,step_name:step.step_name,step_type:step.step_type,approver_type:step.approver_type,approver_role:step.approver_role||"",approver_lookup:step.approver_lookup||"",action_label:step.action_label||"Approve",reject_label:step.reject_label||"Reject",entity_status_on_approve:step.entity_status_on_approve||"",entity_status_on_reject:step.entity_status_on_reject||"rejected",notify_on_assign:step.notify_on_assign,notify_title:step.notify_title||"",notify_body:step.notify_body||"",wq_priority:step.wq_priority||"normal",wq_link_template:step.wq_link_template||""});
    setNewStep(true);
  };

  const deleteCondition = async (condId) => {
    try { await workflowApi.deleteCondition(condId); workflowApi.getWorkflow(detail.id).then(r=>setDetail(r.data.data)); } catch{}
  };

  const addCondRow    = () => setNewCondRows(p=>[...p,{field:"",operator:"=",value:""}]);
  const removeCondRow = (i) => setNewCondRows(p=>p.filter((_,idx)=>idx!==i));
  const updateCondRow = (i,k,v) => setNewCondRows(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));

  const saveAssignment = async () => {
    if(!assignForm.workflow_id){showFlash("error","Select a workflow."); return;}
    setSaving(true);
    try {
      const r = await workflowApi.createAssignment({...assignForm,workflow_id:parseInt(assignForm.workflow_id)});
      const aid = r.data.data?.id;
      for(const c of newCondRows) { if(c.field&&c.value) await workflowApi.addAssignmentCondition(aid,c); }
      showFlash("success","Assignment created."); setNewAssign(false); setNewCondRows([]);
      setAssignForm({module:"leaves",entity_type:"leave_application",workflow_id:"",priority:0,is_default:false});
      loadAssignments();
    } catch{showFlash("error","Failed.");}
    finally{setSaving(false);}
  };

  const deleteAssignment = async (id) => {
    if(!window.confirm("Remove assignment?")) return;
    try { await workflowApi.deleteAssignment(id); loadAssignments(); } catch{}
  };

  const deleteAssignCond = async (cid) => {
    try { await workflowApi.deleteAssignmentCondition(cid); loadAssignments(); } catch{}
  };

  const getCondLabel = (fk) => condFields.find(f=>f.field_key===fk)?.label || fk;

  return (
    <div>
      <div className="page-header" style={{marginBottom:20}}>
        <div>
          <h1 className="page-heading">Workflow Builder</h1>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:4}}>Define and manage approval workflows for all modules</div>
        </div>
      </div>

      {flash && <div className={`alert alert-${flash.type}`} style={{marginBottom:16}}>{flash.msg}</div>}

      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid #e2e8f0"}}>
        {[{label:"Workflows",value:"workflows"},{label:"Assignments",value:"assignments"},{label:"Monitor",value:"instances"}].map(t=>(
          <button key={t.value} onClick={()=>setTab(t.value)}
            style={{padding:"8px 20px",border:"none",background:"none",cursor:"pointer",fontSize:14,fontWeight:tab===t.value?700:400,color:tab===t.value?"#2563eb":"var(--color-text-secondary)",borderBottom:tab===t.value?"2px solid #2563eb":"2px solid transparent",marginBottom:-2}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── WORKFLOWS TAB ── */}
      {tab==="workflows" && (
        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20}}>
          <div>
            {isGlobalLocked && (
              <div style={{marginBottom:12,padding:"8px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,fontSize:12,color:"#92400e"}}>
                Workflows are managed centrally by the superadmin. This list is read-only here.
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14}}>Workflows ({workflows.length})</div>
              {!isGlobalLocked && <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={()=>setShowNewWF(true)}>+ New</button>}
            </div>

            {showNewWF && (
              <div className="section-card" style={{marginBottom:12,padding:16}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>New Workflow</div>
                <input className="form-input" placeholder="Name *" value={wfForm.name} onChange={e=>setWfForm(f=>({...f,name:e.target.value}))} style={{marginBottom:8}}/>
                <input className="form-input" placeholder="Code (unique slug) *" value={wfForm.code} onChange={e=>setWfForm(f=>({...f,code:e.target.value.toLowerCase().replace(/\s+/g,'_')}))} style={{marginBottom:8}}/>
                <select className="form-input" value={wfForm.module} onChange={e=>{const et=MODULE_DEFAULT_ENTITY[e.target.value]||"";setWfForm(f=>({...f,module:e.target.value,entity_type:et}));}} style={{marginBottom:8}}>
                  {MODULES.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
                <select className="form-input" value={wfForm.entity_type} onChange={e=>setWfForm(f=>({...f,entity_type:e.target.value}))} style={{marginBottom:8}}>
                  {(MODULE_ENTITY_TYPES[wfForm.module]||[]).map(et=><option key={et.value} value={et.value}>{et.label}</option>)}
                </select>
                <textarea className="form-input" placeholder="Description (optional)" rows={2} value={wfForm.description} onChange={e=>setWfForm(f=>({...f,description:e.target.value}))} style={{marginBottom:10}}/>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setShowNewWF(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={saving} onClick={createWorkflow}>Create</button>
                </div>
              </div>
            )}

            {loading ? <div style={{padding:20,textAlign:"center",color:"var(--color-text-secondary)"}}>Loading...</div> : (
              <div>
                {workflows.map(wf=>(
                  <div key={wf.id} onClick={()=>selectWorkflow(wf)}
                    style={{padding:"10px 14px",borderRadius:8,marginBottom:6,cursor:"pointer",background:selected?.id===wf.id?"#eff6ff":"#fff",border:selected?.id===wf.id?"1px solid #2563eb":"1px solid #e2e8f0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontWeight:600,fontSize:13}}>{wf.name}</div>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:wf.is_active?"#dcfce7":"#f1f5f9",color:wf.is_active?"#166534":"#64748b",fontWeight:700}}>{wf.is_active?"ACTIVE":"OFF"}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:3}}>{wf.module} · {wf.entity_type} · {wf.step_count} step{wf.step_count!==1?"s":""}</div>
                  </div>
                ))}
                {workflows.length===0 && <div style={{textAlign:"center",padding:32,color:"var(--color-text-secondary)",fontSize:13}}>No workflows yet.</div>}
              </div>
            )}
          </div>

          <div>
            {!detail ? (
              <div className="section-card" style={{textAlign:"center",padding:60}}>
                <div style={{fontSize:40,marginBottom:12}}>⚙️</div>
                <div style={{fontWeight:600,fontSize:16,marginBottom:6}}>Select a workflow</div>
                <div style={{color:"var(--color-text-secondary)",fontSize:13}}>Click a workflow to view and edit its steps</div>
              </div>
            ) : (
              <>
                <div className="section-card" style={{marginBottom:16,padding:"16px 20px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:17}}>{detail.name}</div>
                      <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:3}}>Code: <code>{detail.code}</code> · {detail.module} / {detail.entity_type}</div>
                      {detail.description && <div style={{fontSize:13,marginTop:6}}>{detail.description}</div>}
                    </div>
                    {!isGlobalLocked && (
                      <div style={{display:"flex",gap:8}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>toggleActive(detail)}>{detail.is_active?"Deactivate":"Activate"}</button>
                        <button className="btn btn-ghost btn-sm" style={{color:"#ef4444"}} onClick={()=>deleteWorkflow(detail.id)}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="section-card">
                  <div className="section-card-header">
                    <span className="section-card-title">Steps ({detail.steps?.length||0})</span>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={()=>{setEditStep(null);setStepForm({...EMPTY_STEP,step_order:(detail.steps?.length||0)+1});setNewStep(true);}}>+ Add Step</button>
                  </div>

                  {showNewStep && (
                    <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:16,marginBottom:16}}>
                      <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>{editStep?"Edit Step":"New Step"}</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Order</label><input type="number" className="form-input" style={{margin:0}} value={stepForm.step_order} onChange={e=>setStepForm(f=>({...f,step_order:parseInt(e.target.value)}))}/></div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Step Name *</label><input className="form-input" style={{margin:0}} placeholder="e.g. Principal Approval" value={stepForm.step_name} onChange={e=>setStepForm(f=>({...f,step_name:e.target.value}))}/></div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Step Type</label><select className="form-input" style={{margin:0}} value={stepForm.step_type} onChange={e=>setStepForm(f=>({...f,step_type:e.target.value}))}>{(ENTITY_STEP_TYPES[selected?.entity_type]||STEP_TYPES).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Approver Type</label><select className="form-input" style={{margin:0}} value={stepForm.approver_type} onChange={e=>setStepForm(f=>({...f,approver_type:e.target.value}))}>{APPROVER_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g," ")}</option>)}</select></div>
                        {stepForm.approver_type==="role" && (<div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Role</label><select className="form-input" style={{margin:0}} value={stepForm.approver_role} onChange={e=>setStepForm(f=>({...f,approver_role:e.target.value}))}><option value="">— Select Role —</option>{roles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}</select></div>)}
                        {stepForm.approver_type==="dept_head" && (<div style={{padding:"8px 10px",background:"#fefce8",border:"1px solid #fef08a",borderRadius:6,fontSize:12,color:"#854d0e",marginTop:4}}><strong>Dept Head (HOD)</strong> - Automatically routes to Head of Department of the submitter. Ensure HOD is assigned in HR Staff Management.</div>)}
                        {stepForm.approver_type==="class_teacher" && (<div style={{padding:"8px 10px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:6,fontSize:12,color:"#1d4ed8",marginTop:4}}><strong>Class Teacher</strong> - Routes to primary class teacher of the student.</div>)}
                        {stepForm.approver_type==="designation" && (<div>
                          <label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Designation</label>
                          <select className="form-input" style={{margin:0}} value={stepForm.approver_lookup} onChange={e=>setStepForm(f=>({...f,approver_lookup:e.target.value}))}>
                            <option value="">Select Designation...</option>
                            {designations.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
                          </select>
                          <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Routes to the active staff member with this designation - useful when several designations (e.g. Accountant, Finance Officer, Finance Manager) share one broad permission role.</div>
                        </div>)}
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>WQ Priority</label><select className="form-input" style={{margin:0}} value={stepForm.wq_priority} onChange={e=>setStepForm(f=>({...f,wq_priority:e.target.value}))}>{PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Action Label</label><input className="form-input" style={{margin:0}} value={stepForm.action_label} onChange={e=>setStepForm(f=>({...f,action_label:e.target.value}))}/></div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Status on Approve</label>
                          {(ENTITY_STATUS_OPTIONS[selected?.entity_type]||[]).length>0 ? (
                            <select className="form-input" style={{margin:0}} value={stepForm.entity_status_on_approve} onChange={e=>setStepForm(f=>({...f,entity_status_on_approve:e.target.value}))}>
                              <option value="">Select status...</option>
                              {ENTITY_STATUS_OPTIONS[selected?.entity_type].map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <input className="form-input" style={{margin:0}} placeholder="e.g. recommended" value={stepForm.entity_status_on_approve} onChange={e=>setStepForm(f=>({...f,entity_status_on_approve:e.target.value}))}/>
                          )}
                        </div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Status on Reject</label>
                          {(ENTITY_STATUS_OPTIONS[selected?.entity_type]||[]).length>0 ? (
                            <select className="form-input" style={{margin:0}} value={stepForm.entity_status_on_reject} onChange={e=>setStepForm(f=>({...f,entity_status_on_reject:e.target.value}))}>
                              <option value="">Select status...</option>
                              {ENTITY_STATUS_OPTIONS[selected?.entity_type].map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <input className="form-input" style={{margin:0}} placeholder="e.g. rejected" value={stepForm.entity_status_on_reject} onChange={e=>setStepForm(f=>({...f,entity_status_on_reject:e.target.value}))}/>
                          )}
                        </div>
                        <div>
                          <label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>WQ Link (auto)</label>
                          <div style={{display:"flex",gap:6}}>
                            <input className="form-input" style={{margin:0,flex:1}} placeholder={autoLink||"/module?id={entity_id}"} value={stepForm.wq_link_template} onChange={e=>setStepForm(f=>({...f,wq_link_template:e.target.value}))}/>
                            {autoLink&&!stepForm.wq_link_template&&<button type="button" className="btn btn-ghost btn-sm" style={{fontSize:11,whiteSpace:"nowrap"}} onClick={()=>setStepForm(f=>({...f,wq_link_template:autoLink}))}>Use Auto</button>}
                          </div>
                          <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Auto: {autoLink||"(select workflow first)"}</div>
                        </div>
                        <div><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Notify Title</label><input className="form-input" style={{margin:0}} placeholder="Action Required" value={stepForm.notify_title} onChange={e=>setStepForm(f=>({...f,notify_title:e.target.value}))}/></div>
                        <div style={{gridColumn:"span 2"}}><label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Notify Body</label><input className="form-input" style={{margin:0}} placeholder="You have a pending action." value={stepForm.notify_body} onChange={e=>setStepForm(f=>({...f,notify_body:e.target.value}))}/></div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setNewStep(false);setEditStep(null);}}>Cancel</button>
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={saving} onClick={saveStep}>{saving?"Saving...":"Save Step"}</button>
                      </div>
                    </div>
                  )}

                  {(!detail.steps||detail.steps.length===0) ? (
                    <div style={{textAlign:"center",padding:24,color:"var(--color-text-secondary)",fontSize:13}}>No steps yet.</div>
                  ) : detail.steps.map((step,i)=>(
                    <div key={step.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:i<detail.steps.length-1?"1px solid #f1f5f9":"none"}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:STEP_TYPE_COLOR[step.step_type]||"#64748b",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{step.step_order}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:14}}>{step.step_name}</div>
                        <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>
                          <span style={{background:STEP_TYPE_COLOR[step.step_type]+"20",color:STEP_TYPE_COLOR[step.step_type],padding:"1px 8px",borderRadius:10,fontSize:11,fontWeight:700,marginRight:8}}>{step.step_type}</span>
                          {step.approver_type==="role"?`Role: ${step.approver_role||"—"}`:step.approver_type}
                          {step.entity_status_on_approve&&<span style={{marginLeft:8}}>→ <em>{step.entity_status_on_approve}</em></span>}
                        </div>
                        {step.conditions&&step.conditions.length>0&&(
                          <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                            {step.conditions.map(c=>(
                              <span key={c.id} style={{fontSize:11,background:"#eff6ff",color:"#2563eb",padding:"2px 8px",borderRadius:8,display:"flex",alignItems:"center",gap:4}}>
                                {c.field} {c.operator} {c.value} → {c.effect?.replace(/_/g," ")}
                                <button style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:12,padding:"0 2px"}} onClick={()=>deleteCondition(c.id)}>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openEditStep(step)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{color:"#ef4444"}} onClick={()=>deleteStep(step.id)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ASSIGNMENTS TAB ── */}
      {tab==="assignments" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Link workflows to modules with smart conditions.</div>
            {!isGlobalLocked && <button className="btn btn-primary" style={{color:"#fff"}} onClick={()=>setNewAssign(true)}>+ New Assignment</button>}
          </div>

          {showNewAssign && (
            <div className="section-card" style={{marginBottom:20,padding:20}}>
              <div style={{fontWeight:600,marginBottom:16}}>New Assignment</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
                <div>
                  <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:4}}>Module</label>
                  <select className="form-input" value={assignForm.module} onChange={e=>{const et=MODULE_DEFAULT_ENTITY[e.target.value]||"";setAssignForm(f=>({...f,module:e.target.value,entity_type:et}));setNewCondRows([]);}}>
                    {MODULES.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:4}}>Entity Type</label>
                  <select className="form-input" value={assignForm.entity_type} onChange={e=>{setAssignForm(f=>({...f,entity_type:e.target.value}));setNewCondRows([]);}}>
                    {(MODULE_ENTITY_TYPES[assignForm.module]||[]).map(et=><option key={et.value} value={et.value}>{et.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:4}}>Workflow *</label>
                  <select className="form-input" value={assignForm.workflow_id} onChange={e=>setAssignForm(f=>({...f,workflow_id:e.target.value}))}>
                    <option value="">— Select Workflow —</option>
                    {workflows.filter(w=>w.module===assignForm.module).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    {workflows.filter(w=>w.module===assignForm.module).length===0 && <option disabled>No workflows for this module yet</option>}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:4}}>Priority</label>
                  <input type="number" className="form-input" value={assignForm.priority} onChange={e=>setAssignForm(f=>({...f,priority:parseInt(e.target.value)}))}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:20}}>
                  <input type="checkbox" id="isDef" checked={assignForm.is_default} onChange={e=>setAssignForm(f=>({...f,is_default:e.target.checked}))}/>
                  <label htmlFor="isDef" style={{fontSize:13,cursor:"pointer"}}>Default fallback (no conditions)</label>
                </div>
              </div>

              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>Conditions</div>
                    <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>ALL conditions must match for this workflow to be selected</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={addCondRow}>+ Add Condition</button>
                </div>

                {newCondRows.length===0 && (
                  <div style={{fontSize:12,color:"#94a3b8",fontStyle:"italic",padding:"8px 0"}}>No conditions — matches all entities. Use as default fallback.</div>
                )}

                {newCondRows.map((row,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 32px",gap:8,marginBottom:8,alignItems:"flex-end"}}>
                    <div>
                      {i===0&&<label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Field</label>}
                      <select className="form-input" style={{margin:0}} value={row.field}
                        onChange={e=>{ const v=e.target.value; updateCondRow(i,"field",v); updateCondRow(i,"operator","="); updateCondRow(i,"value",""); }}>
                        <option value="">— Select Field —</option>
                        {condFields.map(f=><option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                      </select>
                    </div>
                    <div>
                      {i===0&&<label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Operator</label>}
                      <select className="form-input" style={{margin:0}} value={row.operator} onChange={e=>updateCondRow(i,"operator",e.target.value)}>
                        {getOperators(row.field,condFields).map(v=><option key={v} value={v}>{OPERATOR_LABELS[v]||v}</option>)}
                      </select>
                    </div>
                    <div>
                      {i===0&&<label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:4}}>Value</label>}
                      <CondValueInput field={row.field} value={row.value} condFields={condFields} onChange={v=>updateCondRow(i,"value",v)}/>
                    </div>
                    <button style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:20,paddingBottom:6}} onClick={()=>removeCondRow(i)}>×</button>
                  </div>
                ))}
              </div>

              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" onClick={()=>{setNewAssign(false);setNewCondRows([]);}}>Cancel</button>
                <button className="btn btn-primary" style={{color:"#fff"}} disabled={saving} onClick={saveAssignment}>{saving?"Saving...":"Save Assignment"}</button>
              </div>
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {assignments.length===0&&<div className="section-card" style={{textAlign:"center",padding:40,color:"var(--color-text-secondary)"}}>No assignments yet.</div>}
            {assignments.map(a=>(
              <div key={a.id} className="section-card" style={{padding:"14px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      <span style={{fontWeight:700,fontSize:14}}>{a.workflow_name}</span>
                      {a.is_default&&<span className="badge badge-primary">Default</span>}
                      <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>Priority: {a.priority}</span>
                    </div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:8}}>
                      Module: <strong>{a.module}</strong> / Entity: <strong>{a.entity_type}</strong>
                    </div>
                    {a.conditions&&a.conditions.length>0 ? (
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:4}}>CONDITIONS (ALL must match):</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {a.conditions.map(c=>(
                            <div key={c.id} style={{display:"flex",alignItems:"center",gap:6,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"4px 10px"}}>
                              <span style={{fontSize:12,color:"#1e40af",fontWeight:500}}>
                                {getCondLabel(c.field)} <strong>{OPERATOR_LABELS[c.operator]||c.operator}</strong> {c.value}
                              </span>
                              <button style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:14,lineHeight:1}} onClick={()=>deleteAssignCond(c.id)}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{fontSize:12,color:"#94a3b8",fontStyle:"italic"}}>No conditions — matches all entities</div>
                    )}
                  </div>
                  {!isGlobalLocked && <button className="btn btn-ghost btn-sm" style={{color:"#ef4444",flexShrink:0}} onClick={()=>deleteAssignment(a.id)}>Remove</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MONITOR TAB ── */}
      {tab==="instances" && (
        <div>
          <div style={{marginBottom:16,display:"flex",justifyContent:"space-between"}}>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Live workflow runs across all modules.</div>
            <span style={{fontSize:12,color:"var(--color-text-secondary)",marginRight:8}}>Auto-refreshes every 15s</span>
          <button className="btn btn-ghost btn-sm" onClick={loadInstances}>↻ Refresh</button>
          </div>
          <div className="section-card" style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"var(--color-background-secondary)",borderBottom:"1px solid var(--color-border-primary)"}}>
                  {["Workflow","Module","Entity","Status","Progress","Started"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instances.length===0?(
                  <tr><td colSpan={6} style={{padding:"32px",textAlign:"center",color:"var(--color-text-secondary)"}}>No workflow instances yet.</td></tr>
                ):instances.map((inst,i)=>(
                  <tr key={inst.id} style={{borderBottom:"1px solid var(--color-border-primary)",background:i%2===0?"transparent":"var(--color-background-secondary)"}}>
                    <td style={{padding:"10px 14px",fontWeight:600,fontSize:13}}>{inst.workflow_name}</td>
                    <td style={{padding:"10px 14px",fontSize:13}}>{inst.module}</td>
                    <td style={{padding:"10px 14px",fontSize:13}}>#{inst.entity_id} <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{inst.entity_type}</span></td>
                    <td style={{padding:"10px 14px"}}><span className={`badge ${inst.status==="active"?"badge-warning":inst.status==="completed"?"badge-success":"badge-danger"}`}>{inst.status}</span></td>
                    <td style={{padding:"10px 14px",fontSize:13}}>Step {inst.current_step_order}/{inst.total_steps}{inst.pending_steps>0&&<span style={{marginLeft:6,fontSize:11,color:"#f59e0b"}}>({inst.pending_steps} pending)</span>}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:"var(--color-text-secondary)"}}>{inst.created_at?formatDate(inst.created_at):"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
