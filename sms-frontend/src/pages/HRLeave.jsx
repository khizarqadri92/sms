import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import hrApi from "../api/hrApi";
import { useAuth } from "../auth/AuthContext";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";

const TABS = ["types","policies","validation_rules","balances","requests"];
const TAB_LABELS = {types:"Leave Types", policies:"Leave Policies", validation_rules:"Leave Rules", balances:"Leave Balances", requests:"Leave Requests"};
const STATUS_COLORS = {
  pending:  {bg:"#fefce8",color:"#854d0e",border:"#fef08a"},
  approved: {bg:"#f0fdf4",color:"#166534",border:"#bbf7d0"},
  rejected: {bg:"#fff1f2",color:"#881337",border:"#fecdd3"},
  cancelled:{bg:"#f8fafc",color:"#475569",border:"#e2e8f0"},
};

export default function HRLeave({ visibleTabs } = {}) {
  const TABS_SHOWN = visibleTabs || TABS;
  const processingToday = useProcessingToday();
  const { permissions=[], can } = useAuth();
  const location = useLocation();
  const canEdit    = permissions.includes("hr.edit");
  const canApprove = permissions.includes("hr.approve");
  const { isGlobalLocked: typesLocked } = useGovernanceMode("staff_leave_types");
  const { isGlobalLocked: policiesLocked } = useGovernanceMode("staff_leave_policies");
  const { isGlobalLocked: certTypesLocked } = useGovernanceMode("leave_certificate_types");
  const { isGlobalLocked: rulesLocked } = useGovernanceMode("leave_validation_rules");
  const { isGlobalLocked: policySettingsLocked } = useGovernanceMode("hr_policy_settings");
  const canManageTypes = canEdit && !typesLocked;
  const canManagePolicies = canEdit && !policiesLocked;
  const canManageCertTypes = canEdit && !certTypesLocked;
  const canManageRules = canEdit && !rulesLocked;
  const canManagePolicySettings = canEdit && !policySettingsLocked;

  const [tab, setTab]             = useState(() => { const p = new URLSearchParams(location.search); const requested = p.get("tab"); return (requested && TABS_SHOWN.includes(requested)) ? requested : TABS_SHOWN[0]; });
  const [flash, setFlash]         = useState(null);
  const [loading, setLoading]     = useState(false);

  // Leave Types
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [ltForm, setLtForm]         = useState({name:"",max_days_per_year:"",is_active:true,is_encashable:false});
  const [editLtId, setEditLtId]     = useState(null);

  // Policies
  const [policies, setPolicies]     = useState([]);
  const [allRoles, setAllRoles]     = useState([]);
  const [depts, setDepts]           = useState([]);
  const [selLtForPolicy, setSelLtForPolicy] = useState("");
  const [polForm, setPolForm]       = useState({leave_type_id:"",role_id:"",department_id:"",days_per_year:"",carry_forward:"0",is_paid:true,applies_to:"role",gender:"all"});

  // Balances
  const [balances, setBalances]     = useState([]);
  const [balYear, setBalYear]       = useState(new Date().getFullYear());
  useEffect(() => { setBalYear(new Date(processingToday).getFullYear()); }, [processingToday]);
  const [editBalId, setEditBalId]   = useState(null);
  const [editBalDays, setEditBalDays] = useState("");

  // Leave Rules (extensible validation engine) + Certificate Types
  const [certTypes, setCertTypes]         = useState([]);
  const [certTypeForm, setCertTypeForm]   = useState({name:"",description:""});
  const [validationRules, setValidationRules] = useState([]);
  const [vRuleForm, setVRuleForm] = useState({
    name:"", leave_type_id:"", rule_type:"certificate_required",
    min_days:"1", certificate_type_id:"",
    excluded_leave_type_ids:[], message:"",
    min_days_notice:"1", max_days:"", blackout_from:"", blackout_to:"",
    employment_status:"probation", max_days_allowed:"0"
  });
  const [policySettings, setPolicySettings] = useState({probation_duration_days:90, notice_period_duration_days:30});

  // Requests
  const [requests, setRequests]     = useState([]);
  const [reqFilter, setReqFilter]   = useState("pending");
  const [reviewId, setReviewId]     = useState(null);
  const [reviewNote, setReviewNote] = useState("");

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),4000); };

  const loadTypes = useCallback(()=>{
    hrApi.getLeaveTypes().then(r=>setLeaveTypes(r.data.data||[])).catch(()=>{});
  },[]);

  const loadPolicies = useCallback(()=>{
    hrApi.getLeavePolicies(selLtForPolicy||null).then(r=>setPolicies(r.data.data||[])).catch(()=>{});
  },[selLtForPolicy]);

  const loadBalances = useCallback(()=>{
    setLoading(true);
    hrApi.getLeaveBalances(balYear).then(r=>setBalances(r.data.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[balYear]);

  const loadCertTypes = useCallback(()=>{
    hrApi.getCertificateTypes().then(r=>setCertTypes(r.data.data||[])).catch(()=>{});
  },[]);

  const loadValidationRules = useCallback(()=>{
    hrApi.getValidationRules().then(r=>setValidationRules(r.data.data||[])).catch(()=>{});
  },[]);

  const loadPolicySettings = useCallback(()=>{
    hrApi.getPolicySettings().then(r=>setPolicySettings(r.data.data||{probation_duration_days:90,notice_period_duration_days:30})).catch(()=>{});
  },[]);

  const savePolicySettings = async () => {
    try {
      await hrApi.updatePolicySettings({
        probation_duration_days:Number(policySettings.probation_duration_days)||90,
        notice_period_duration_days:Number(policySettings.notice_period_duration_days)||30
      });
      showFlash("success","Policy settings saved.");
    } catch(e){showFlash("error",e.response?.data?.message||e.response?.data?.detail?.message||"Failed.");}
  };

  const loadRequests = useCallback(()=>{
    hrApi.getLeaveRequests({status:reqFilter||undefined}).then(r=>setRequests(r.data.data||[])).catch(()=>{});
  },[reqFilter]);

  useEffect(()=>{
    hrApi.getAllRoles().then(r=>setAllRoles(r.data.data||[])).catch(()=>{});
    hrApi.getDepartments().then(r=>setDepts(r.data.data||[])).catch(()=>{});
    loadTypes();
  },[]);

  useEffect(()=>{ if(tab==="types") loadTypes(); },[tab]);
  useEffect(()=>{ if(tab==="policies") loadPolicies(); },[tab,selLtForPolicy]);
  useEffect(()=>{ if(tab==="balances") loadBalances(); },[tab,balYear]);
  useEffect(()=>{ if(tab==="requests") loadRequests(); },[tab,reqFilter]);
  useEffect(()=>{ if(tab==="validation_rules"){ loadCertTypes(); loadValidationRules(); loadPolicySettings(); } },[tab]);

  const saveLt = async () => {
    if(!ltForm.name.trim()){showFlash("error","Name required.");return;}
    try {
      const payload = {...ltForm, max_days_per_year:ltForm.max_days_per_year||null};
      if(editLtId) await hrApi.updateLeaveType(editLtId, payload);
      else await hrApi.createLeaveType(payload);
      showFlash("success", editLtId?"Updated.":"Created.");
      setLtForm({name:"",max_days_per_year:"",is_active:true,is_encashable:false});
      setEditLtId(null); loadTypes();
    } catch(e){showFlash("error","Failed.");}
  };

  const savePolicy = async () => {
    if(!polForm.leave_type_id||!polForm.days_per_year){showFlash("error","Leave type and days required.");return;}
    try {
      await hrApi.createLeavePolicy({...polForm,role_id:polForm.role_id||null,department_id:polForm.department_id||null,days_per_year:Number(polForm.days_per_year),carry_forward:Number(polForm.carry_forward)});
      showFlash("success","Policy saved."); setPolForm({leave_type_id:"",role_id:"",department_id:"",days_per_year:"",carry_forward:"0",is_paid:true,applies_to:"role",gender:"all"}); loadPolicies();
    } catch(e){showFlash("error",e.response?.data?.message||e.response?.data?.detail?.message||"Failed.");}
  };

  const initBalances = async () => {
    if(!window.confirm(`Initialize leave balances for ${balYear}? This will create missing records.`)) return;
    try {
      const r = await hrApi.initLeaveBalances(balYear);
      showFlash("success", r.data.message); loadBalances();
    } catch(e){showFlash("error","Failed.");}
  };

  const adjustBalance = async () => {
    try {
      await hrApi.adjustLeaveBalance(editBalId, Number(editBalDays));
      showFlash("success","Balance adjusted."); setEditBalId(null); setEditBalDays(""); loadBalances();
    } catch(e){showFlash("error","Failed.");}
  };

  const saveCertType = async () => {
    if(!certTypeForm.name.trim()){showFlash("error","Name required.");return;}
    try {
      await hrApi.createCertificateType(certTypeForm);
      showFlash("success","Certificate type added.");
      setCertTypeForm({name:"",description:""});
      loadCertTypes();
    } catch(e){showFlash("error",e.response?.data?.message||e.response?.data?.detail?.message||"Failed.");}
  };

  const saveValidationRule = async () => {
    if(!vRuleForm.name.trim()){showFlash("error","Rule name is required.");return;}
    let config = {};
    if(vRuleForm.rule_type==="certificate_required"){
      if(!vRuleForm.certificate_type_id){showFlash("error","Select a certificate type.");return;}
      const ct = certTypes.find(c=>c.id===Number(vRuleForm.certificate_type_id));
      config = {min_days:Number(vRuleForm.min_days)||1, certificate_type_id:Number(vRuleForm.certificate_type_id), certificate_type_name:ct?.name};
    } else if(vRuleForm.rule_type==="cannot_combine_with"){
      if(vRuleForm.excluded_leave_type_ids.length===0){showFlash("error","Select at least one leave type to exclude.");return;}
      config = {excluded_leave_type_ids:vRuleForm.excluded_leave_type_ids.map(Number), message:vRuleForm.message||undefined};
    } else if(vRuleForm.rule_type==="leave_balance"){
      config = {message:vRuleForm.message||undefined};
    } else if(vRuleForm.rule_type==="leave_overlap"){
      config = {message:vRuleForm.message||undefined};
    } else if(vRuleForm.rule_type==="advance_notice"){
      if(!vRuleForm.min_days_notice){showFlash("error","Minimum notice days is required.");return;}
      config = {min_days_notice:Number(vRuleForm.min_days_notice), message:vRuleForm.message||undefined};
    } else if(vRuleForm.rule_type==="max_consecutive_days"){
      if(!vRuleForm.max_days){showFlash("error","Maximum days is required.");return;}
      config = {max_days:Number(vRuleForm.max_days), message:vRuleForm.message||undefined};
    } else if(vRuleForm.rule_type==="blackout_dates"){
      if(!vRuleForm.blackout_from||!vRuleForm.blackout_to){showFlash("error","Both blackout dates are required.");return;}
      config = {date_ranges:[[vRuleForm.blackout_from, vRuleForm.blackout_to]], message:vRuleForm.message||undefined};
    } else if(vRuleForm.rule_type==="employment_status_restriction"){
      config = {status:vRuleForm.employment_status, max_days_allowed:Number(vRuleForm.max_days_allowed)||0, message:vRuleForm.message||undefined};
    }
    try {
      await hrApi.createValidationRule({
        name:vRuleForm.name,
        leave_type_id:vRuleForm.leave_type_id||null,
        rule_type:vRuleForm.rule_type,
        config
      });
      showFlash("success","Rule created.");
      setVRuleForm({name:"",leave_type_id:"",rule_type:"certificate_required",min_days:"1",certificate_type_id:"",excluded_leave_type_ids:[],message:"",min_days_notice:"1",max_days:"",blackout_from:"",blackout_to:"",employment_status:"probation",max_days_allowed:"0"});
      loadValidationRules();
    } catch(e){showFlash("error",e.response?.data?.message||e.response?.data?.detail?.message||"Failed.");}
  };

  const reviewRequest = async (id, status) => {
    try {
      await hrApi.reviewLeaveRequest(id, {status, review_note:reviewNote});
      showFlash("success",`Leave ${status}.`); setReviewId(null); setReviewNote(""); loadRequests();
    } catch(e){showFlash("error","Failed.");}
  };

  const rl = (name) => name?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"—";
  const ss = (s) => STATUS_COLORS[s]||STATUS_COLORS.cancelled;

  return (
    <div style={{padding:20,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 16px",fontSize:20,fontWeight:700}}>Staff Leave Management</h2>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #e2e8f0",marginBottom:20}}>
        {TABS_SHOWN.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"10px 18px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"transparent",
              borderBottom:tab===t?"2px solid #2563eb":"2px solid transparent",color:tab===t?"#2563eb":"#64748b"}}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* LEAVE TYPES */}
      {tab==="types" && (
        <div>
        {typesLocked && (
          <div style={{marginBottom:12,padding:"8px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,fontSize:12,color:"#92400e"}}>
            Leave Types are managed centrally by the superadmin.
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:20,alignItems:"start"}}>
          {canManageTypes && (
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{editLtId?"Edit Leave Type":"Add Leave Type"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Name *</label>
                <input className="form-input" style={{width:"100%",fontSize:13}} value={ltForm.name} onChange={e=>setLtForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Annual Leave"/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Max Days/Year</label>
                <input type="number" className="form-input" style={{width:"100%",fontSize:13}} value={ltForm.max_days_per_year} onChange={e=>setLtForm(p=>({...p,max_days_per_year:e.target.value}))} placeholder="Leave blank for unlimited"/>
              </div>
              <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,cursor:"pointer"}}>
                <input type="checkbox" checked={ltForm.is_active} onChange={e=>setLtForm(p=>({...p,is_active:e.target.checked}))}/>
                Active
              </label>
              <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,cursor:"pointer"}}>
                <input type="checkbox" checked={ltForm.is_encashable} onChange={e=>setLtForm(p=>({...p,is_encashable:e.target.checked}))}/>
                Encashable at Resignation
              </label>
              <div style={{display:"flex",gap:8}}>
                {editLtId&&<button className="btn btn-ghost btn-sm" onClick={()=>{setEditLtId(null);setLtForm({name:"",max_days_per_year:"",is_active:true,is_encashable:false});}}>Cancel</button>}
                <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={saveLt}>{editLtId?"Update":"Add"} Leave Type</button>
              </div>
            </div>
          </div>
          )}
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",fontWeight:700,fontSize:14}}>Leave Types ({leaveTypes.length})</div>
            {leaveTypes.map(lt=>(
              <div key={lt.id} style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>{lt.name}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                    {lt.max_days_per_year?`Max ${lt.max_days_per_year} days/year`:"No day limit"}
                    <span style={{marginLeft:8,padding:"1px 6px",borderRadius:6,background:lt.is_active?"#f0fdf4":"#f1f5f9",color:lt.is_active?"#166534":"#475569",fontSize:10,fontWeight:700}}>{lt.is_active?"Active":"Inactive"}</span>
                    {lt.is_encashable&&<span style={{marginLeft:6,padding:"1px 6px",borderRadius:6,background:"#f0fdf4",color:"#166534",fontSize:10,fontWeight:700}}>Encashable</span>}
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{lt.policy_count} policies configured</div>
                </div>
                {canManageTypes&&<div style={{display:"flex",gap:4}}>
                  <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditLtId(lt.id);setLtForm({name:lt.name,max_days_per_year:lt.max_days_per_year||"",is_active:lt.is_active,is_encashable:lt.is_encashable||false});}}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11}} onClick={async()=>{await hrApi.deleteLeaveType(lt.id);loadTypes();}}>Deactivate</button>
                </div>}
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* LEAVE POLICIES */}
      {tab==="policies" && (
        <div>
        {policiesLocked && (
          <div style={{marginBottom:12,padding:"8px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,fontSize:12,color:"#92400e"}}>
            Leave Policies are managed centrally by the superadmin.
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:20,alignItems:"start"}}>
          {canManagePolicies && (
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Add Leave Policy</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Leave Type *</label>
                <select className="form-input" style={{width:"100%",fontSize:13}} value={polForm.leave_type_id} onChange={e=>setPolForm(p=>({...p,leave_type_id:e.target.value}))}>
                  <option value="">Select...</option>
                  {leaveTypes.map(lt=><option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Applies To</label>
                <select className="form-input" style={{width:"100%",fontSize:13}} value={polForm.applies_to} onChange={e=>setPolForm(p=>({...p,applies_to:e.target.value,role_id:"",department_id:""}))}>
                  <option value="role">Specific Role</option>
                  <option value="department">Specific Department</option>
                  <option value="all">All Staff</option>
                </select>
              </div>
              {polForm.applies_to==="role"&&<div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Role</label>
                <select className="form-input" style={{width:"100%",fontSize:13}} value={polForm.role_id} onChange={e=>setPolForm(p=>({...p,role_id:e.target.value}))}>
                  <option value="">Select role...</option>
                  {allRoles.filter(r=>!["student","parent"].includes(r.name)).map(r=><option key={r.id} value={r.id}>{rl(r.name)}</option>)}
                </select>
              </div>}
              {polForm.applies_to==="department"&&<div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Department</label>
                <select className="form-input" style={{width:"100%",fontSize:13}} value={polForm.department_id} onChange={e=>setPolForm(p=>({...p,department_id:e.target.value}))}>
                  <option value="">Select department...</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Days/Year *</label>
                  <input type="number" className="form-input" style={{width:"100%",fontSize:13}} value={polForm.days_per_year} onChange={e=>setPolForm(p=>({...p,days_per_year:e.target.value}))} placeholder="e.g. 21"/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Carry Forward</label>
                  <input type="number" className="form-input" style={{width:"100%",fontSize:13}} value={polForm.carry_forward} onChange={e=>setPolForm(p=>({...p,carry_forward:e.target.value}))} placeholder="0"/>
                </div>
              </div>
              <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,cursor:"pointer"}}>
                <input type="checkbox" checked={polForm.is_paid} onChange={e=>setPolForm(p=>({...p,is_paid:e.target.checked}))}/>
                Paid Leave
              </label>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:6}}>Applicable Gender</label>
                <div style={{display:"flex",gap:12}}>
                  {[["all","All Staff"],["male","Male Only"],["female","Female Only"]].map(([val,lbl])=>(
                    <label key={val} style={{display:"flex",gap:6,alignItems:"center",fontSize:13,cursor:"pointer",
                      padding:"6px 12px",borderRadius:8,border:"1px solid "+(polForm.gender===val?"#2563eb":"#e2e8f0"),
                      background:polForm.gender===val?"#eff6ff":"#f8fafc",color:polForm.gender===val?"#2563eb":"#475569",fontWeight:600}}>
                      <input type="radio" name="policy_gender" value={val} checked={polForm.gender===val}
                        onChange={()=>setPolForm(p=>({...p,gender:val}))} style={{accentColor:"#2563eb"}}/>
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={savePolicy}>Save Policy</button>
            </div>
          </div>
          )}
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:14}}>Configured Policies</div>
              <select className="form-input" style={{fontSize:12,width:180}} value={selLtForPolicy} onChange={e=>setSelLtForPolicy(e.target.value)}>
                <option value="">All Leave Types</option>
                {leaveTypes.map(lt=><option key={lt.id} value={lt.id}>{lt.name}</option>)}
              </select>
            </div>
            {policies.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No policies configured.</div>:
            policies.map(p=>(
              <div key={p.id} style={{padding:"10px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>{p.leave_type_name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>
                    {p.role_name?rl(p.role_name):p.department_name?"Dept: "+p.department_name:"All Staff"}
                    {" · "}{p.days_per_year} days/year
                    {p.carry_forward>0&&` · Carry: ${p.carry_forward}`}
                    <span style={{marginLeft:6,color:p.is_paid?"#166534":"#64748b"}}>{p.is_paid?"(Paid)":"(Unpaid)"}</span>
                    {p.gender&&p.gender!=="all"&&<span style={{marginLeft:6,padding:"1px 6px",borderRadius:6,fontSize:10,fontWeight:700,
                      background:p.gender==="male"?"#eff6ff":"#fdf2f8",color:p.gender==="male"?"#1d4ed8":"#9d174d"}}>
                      {p.gender==="male"?"♂ Male Only":"♀ Female Only"}
                    </span>}
                  </div>
                </div>
                {canManagePolicies&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11}} onClick={async()=>{await hrApi.deleteLeavePolicy(p.id);loadPolicies();}}>Remove</button>}
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* LEAVE RULES (extensible validation engine) */}
      {tab==="validation_rules" && (
        <div>
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16,marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Policy Settings</div>
            {policySettingsLocked && (
              <div style={{marginBottom:10,padding:"8px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,fontSize:12,color:"#92400e"}}>
                Policy Settings are managed centrally by the superadmin.
              </div>
            )}
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>
              Probation is calculated from each employee's joining date. Notice period starts the day a resignation is accepted (status set to Resigned).
            </div>
            <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Probation Duration (days)</label>
                <input type="number" className="form-input" style={{width:160,fontSize:13}} value={policySettings.probation_duration_days}
                  onChange={e=>setPolicySettings(p=>({...p,probation_duration_days:e.target.value}))}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Notice Period Duration (days)</label>
                <input type="number" className="form-input" style={{width:160,fontSize:13}} value={policySettings.notice_period_duration_days}
                  onChange={e=>setPolicySettings(p=>({...p,notice_period_duration_days:e.target.value}))}/>
              </div>
              {canManagePolicySettings&&<button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={savePolicySettings}>Save</button>}
            </div>
          </div>

          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16,marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Certificate Types</div>
            {certTypesLocked && (
              <div style={{marginBottom:10,padding:"8px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,fontSize:12,color:"#92400e"}}>
                Certificate Types are managed centrally by the superadmin.
              </div>
            )}
            {canManageCertTypes&&(
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <input className="form-input" placeholder="e.g. Medical Certificate" style={{flex:1,fontSize:13}}
                  value={certTypeForm.name} onChange={e=>setCertTypeForm(p=>({...p,name:e.target.value}))}/>
                <input className="form-input" placeholder="Description (optional)" style={{flex:1,fontSize:13}}
                  value={certTypeForm.description} onChange={e=>setCertTypeForm(p=>({...p,description:e.target.value}))}/>
                <button className="btn btn-primary btn-sm" style={{color:"#fff",whiteSpace:"nowrap"}} onClick={saveCertType}>+ Add</button>
              </div>
            )}
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {certTypes.length===0?<div style={{fontSize:12,color:"#94a3b8"}}>No certificate types yet.</div>:
              certTypes.map(ct=>(
                <div key={ct.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:20,background:"#f8fafc",border:"1px solid #e2e8f0",fontSize:12,fontWeight:600}}>
                  {ct.name}
                  {canManageCertTypes&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:10,padding:"0 2px"}}
                    onClick={async()=>{await hrApi.deleteCertificateType(ct.id);loadCertTypes();}}>✕</button>}
                </div>
              ))}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:20,alignItems:"start"}}>
            {rulesLocked && (
              <div style={{gridColumn:"1 / -1",padding:"8px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,fontSize:12,color:"#92400e"}}>
                Leave Validation Rules are managed centrally by the superadmin.
              </div>
            )}
            {canManageRules && (
            <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Add Leave Rule</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Rule Name *</label>
                  <input className="form-input" style={{width:"100%",fontSize:13}} placeholder="e.g. Sick leave needs medical cert"
                    value={vRuleForm.name} onChange={e=>setVRuleForm(p=>({...p,name:e.target.value}))}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Applies To Leave Type</label>
                  <select className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.leave_type_id}
                    onChange={e=>setVRuleForm(p=>({...p,leave_type_id:e.target.value}))}>
                    <option value="">All Leave Types</option>
                    {leaveTypes.map(lt=><option key={lt.id} value={lt.id}>{lt.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Rule Type *</label>
                  <select className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.rule_type}
                    onChange={e=>setVRuleForm(p=>({...p,rule_type:e.target.value}))}>
                    <option value="certificate_required">Certificate Required</option>
                    <option value="cannot_combine_with">Cannot Combine With Another Leave Type</option>
                    <option value="leave_balance">Sufficient Leave Balance</option>
                    <option value="leave_overlap">No Overlapping Leave</option>
                    <option value="advance_notice">Advance Notice Required</option>
                    <option value="max_consecutive_days">Maximum Consecutive Days</option>
                    <option value="blackout_dates">Blackout Dates</option>
                    <option value="employment_status_restriction">Employment Status Restriction (Probation / Notice Period)</option>
                  </select>
                </div>

                {vRuleForm.rule_type==="certificate_required" && (
                  <>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Certificate Type *</label>
                      <select className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.certificate_type_id}
                        onChange={e=>setVRuleForm(p=>({...p,certificate_type_id:e.target.value}))}>
                        <option value="">Select...</option>
                        {certTypes.map(ct=><option key={ct.id} value={ct.id}>{ct.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Required When Leave Is At Least (days)</label>
                      <input type="number" className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.min_days}
                        onChange={e=>setVRuleForm(p=>({...p,min_days:e.target.value}))} placeholder="e.g. 3"/>
                    </div>
                  </>
                )}

                {vRuleForm.rule_type==="cannot_combine_with" && (
                  <>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Excluded Leave Type(s) *</label>
                      <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:140,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8,padding:8}}>
                        {leaveTypes.map(lt=>(
                          <label key={lt.id} style={{display:"flex",gap:8,alignItems:"center",fontSize:12,cursor:"pointer"}}>
                            <input type="checkbox" checked={vRuleForm.excluded_leave_type_ids.includes(lt.id)}
                              onChange={e=>setVRuleForm(p=>({...p,excluded_leave_type_ids: e.target.checked
                                ? [...p.excluded_leave_type_ids, lt.id]
                                : p.excluded_leave_type_ids.filter(id=>id!==lt.id)}))}/>
                            {lt.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Custom Error Message (optional)</label>
                      <input className="form-input" style={{width:"100%",fontSize:13}} placeholder="Shown to staff if they violate this rule"
                        value={vRuleForm.message} onChange={e=>setVRuleForm(p=>({...p,message:e.target.value}))}/>
                    </div>
                  </>
                )}

                {(vRuleForm.rule_type==="leave_balance"||vRuleForm.rule_type==="leave_overlap") && (
                  <div style={{fontSize:12,color:"#64748b",padding:"8px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6}}>
                    No extra configuration needed for this rule - it applies as-is once saved.
                  </div>
                )}

                {vRuleForm.rule_type==="advance_notice" && (
                  <div>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Minimum Notice (days) *</label>
                    <input type="number" className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.min_days_notice}
                      onChange={e=>setVRuleForm(p=>({...p,min_days_notice:e.target.value}))} placeholder="e.g. 3"/>
                  </div>
                )}

                {vRuleForm.rule_type==="max_consecutive_days" && (
                  <div>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Maximum Consecutive Days *</label>
                    <input type="number" className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.max_days}
                      onChange={e=>setVRuleForm(p=>({...p,max_days:e.target.value}))} placeholder="e.g. 10"/>
                  </div>
                )}

                {vRuleForm.rule_type==="blackout_dates" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Blackout From *</label>
                      <DatePicker style={{width:"100%",fontSize:13}} value={vRuleForm.blackout_from}
                        onChange={val=>setVRuleForm(p=>({...p,blackout_from:val}))}/>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Blackout To *</label>
                      <DatePicker style={{width:"100%",fontSize:13}} value={vRuleForm.blackout_to}
                        onChange={val=>setVRuleForm(p=>({...p,blackout_to:val}))}/>
                    </div>
                  </div>
                )}

                {vRuleForm.rule_type==="employment_status_restriction" && (
                  <>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Restrict During *</label>
                      <select className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.employment_status}
                        onChange={e=>setVRuleForm(p=>({...p,employment_status:e.target.value}))}>
                        <option value="probation">Probation Period</option>
                        <option value="notice_period">Notice Period</option>
                      </select>
                      <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Remember to pick the specific Leave Type above under "Applies To" - this quota is per leave type.</div>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Days Allowed During This Period *</label>
                      <input type="number" min="0" className="form-input" style={{width:"100%",fontSize:13}} value={vRuleForm.max_days_allowed}
                        onChange={e=>setVRuleForm(p=>({...p,max_days_allowed:e.target.value}))} placeholder="e.g. 0 (fully blocked) or 2"/>
                    </div>
                  </>
                )}

                {(vRuleForm.rule_type==="leave_overlap"||vRuleForm.rule_type==="advance_notice"||vRuleForm.rule_type==="max_consecutive_days"||vRuleForm.rule_type==="blackout_dates"||vRuleForm.rule_type==="leave_balance"||vRuleForm.rule_type==="employment_status_restriction") && (
                  <div>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Custom Error Message (optional)</label>
                    <input className="form-input" style={{width:"100%",fontSize:13}} placeholder="Shown to staff if they violate this rule"
                      value={vRuleForm.message} onChange={e=>setVRuleForm(p=>({...p,message:e.target.value}))}/>
                  </div>
                )}

                <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={saveValidationRule}>Save Rule</button>
              </div>
            </div>
            )}

            <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",fontWeight:700,fontSize:14}}>Configured Rules ({validationRules.length})</div>
              {validationRules.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No leave rules configured yet.</div>:
              validationRules.map(r=>(
                <div key={r.id} style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                      {r.leave_type_name?r.leave_type_name:"All leave types"}
                      {" · "}
                      {({
                        certificate_required:"Certificate Required",
                        cannot_combine_with:"Cannot Combine",
                        leave_balance:"Sufficient Balance",
                        leave_overlap:"No Overlap",
                        advance_notice:"Advance Notice",
                        max_consecutive_days:"Max Consecutive Days",
                        blackout_dates:"Blackout Dates",
                        employment_status_restriction:"Employment Status Restriction"
                      })[r.rule_type] || r.rule_type}
                    </div>
                  </div>
                  {canManageRules&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11,flexShrink:0}}
                    onClick={async()=>{await hrApi.deleteValidationRule(r.id);loadValidationRules();}}>Remove</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LEAVE BALANCES */}
      {tab==="balances" && (
        <div>
          <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <label style={{fontSize:12,fontWeight:600}}>Year:</label>
              <input type="number" className="form-input" style={{width:100,fontSize:13}} value={balYear} onChange={e=>setBalYear(Number(e.target.value))}/>
            </div>
            {canEdit&&<button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={initBalances}>Initialize Balances for {balYear}</button>}
            <div style={{fontSize:12,color:"#64748b"}}>Initializes missing balance records based on leave policies.</div>
          </div>
          {loading?<div style={{padding:40,textAlign:"center",color:"#64748b"}}>Loading...</div>:
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Staff","Role","Leave Type","Total","Used","Carried","Remaining",""].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"#64748b",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balances.length===0?<tr><td colSpan={8} style={{padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No balances. Click Initialize to create.</td></tr>:
                balances.map(b=>(
                  <tr key={b.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"9px 12px",fontSize:13,fontWeight:500}}>{b.staff_name}</td>
                    <td style={{padding:"9px 12px",fontSize:12,color:"#64748b"}}>{rl(b.role_name)}</td>
                    <td style={{padding:"9px 12px",fontSize:12}}>{b.leave_type_name}</td>
                    <td style={{padding:"9px 12px",fontSize:13,textAlign:"center"}}>
                      {editBalId===b.id?
                        <input type="number" className="form-input" style={{width:60,fontSize:12,padding:"2px 6px"}} value={editBalDays} onChange={e=>setEditBalDays(e.target.value)}/>:
                        b.total_days}
                    </td>
                    <td style={{padding:"9px 12px",fontSize:13,textAlign:"center",color:"#dc2626"}}>{b.used_days}</td>
                    <td style={{padding:"9px 12px",fontSize:13,textAlign:"center",color:"#7c3aed"}}>{b.carried_days}</td>
                    <td style={{padding:"9px 12px",fontSize:13,textAlign:"center"}}>
                      <span style={{fontWeight:700,color:b.remaining_days>0?"#166534":"#dc2626"}}>{b.remaining_days}</span>
                    </td>
                    <td style={{padding:"9px 12px"}}>
                      {canEdit&&(editBalId===b.id?
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn btn-primary btn-sm" style={{color:"#fff",fontSize:11}} onClick={adjustBalance}>Save</button>
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>setEditBalId(null)}>Cancel</button>
                        </div>:
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditBalId(b.id);setEditBalDays(b.total_days);}}>Adjust</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* LEAVE REQUESTS */}
      {tab==="requests" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            {["","pending","approved","rejected"].map(s=>(
              <button key={s} onClick={()=>setReqFilter(s)}
                style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+(reqFilter===s?"#2563eb":"#e2e8f0"),background:reqFilter===s?"#2563eb":"#f8fafc",color:reqFilter===s?"#fff":"#475569",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                {s?s.charAt(0).toUpperCase()+s.slice(1):"All"}
              </button>
            ))}
          </div>
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            {requests.length===0?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No leave requests found.</div>:
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Staff","Role","Leave Type","From","To","Days","Reason","Applied","Status","Action"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"#64748b",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(r=>(
                  <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"10px 12px",fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}>{r.staff_name}</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#64748b",whiteSpace:"nowrap"}}>{rl(r.role_name)}</td>
                    <td style={{padding:"10px 12px",fontSize:12,whiteSpace:"nowrap"}}>{r.leave_type_name}</td>
                    <td style={{padding:"10px 12px",fontSize:12,whiteSpace:"nowrap"}}>{r.from_date}</td>
                    <td style={{padding:"10px 12px",fontSize:12,whiteSpace:"nowrap"}}>{r.to_date}</td>
                    <td style={{padding:"10px 12px",fontSize:13,textAlign:"center",fontWeight:700}}>{r.total_days}</td>
                    <td style={{padding:"10px 12px",fontSize:12,color:"#64748b",maxWidth:160}}>
                      <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.reason}>{r.reason}</div>
                      {r.review_note&&<div style={{fontSize:10,color:"#7c3aed",marginTop:2}}>📝 {r.review_note}</div>}
                    </td>
                    <td style={{padding:"10px 12px",fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>{r.applied_at?.slice(0,10)}</td>
                    <td style={{padding:"10px 12px"}}>
                      <span style={{padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:700,whiteSpace:"nowrap",
                        background:ss(r.status).bg,color:ss(r.status).color,border:"1px solid "+ss(r.status).border}}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{padding:"10px 12px",minWidth:160}}>
                      {canApprove && r.status==="pending" && (
                        reviewId===r.id ? (
                          <div style={{display:"flex",flexDirection:"column",gap:4}}>
                            <textarea className="form-input" placeholder="Review note (optional)" rows={2} style={{fontSize:11,width:150}}
                              value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/>
                            <div style={{display:"flex",gap:4}}>
                              <button className="btn btn-primary btn-sm" style={{color:"#fff",fontSize:10}} onClick={()=>reviewRequest(r.id,"approved")}>Approve</button>
                              <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:10}} onClick={()=>reviewRequest(r.id,"rejected")}>Reject</button>
                              <button className="btn btn-ghost btn-sm" style={{fontSize:10}} onClick={()=>setReviewId(null)}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setReviewId(r.id);setReviewNote("");}}>Review</button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </div>
        </div>
      )}

      {flash&&<div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"10px 18px",borderRadius:8,
        background:flash.type==="success"?"#dcfce7":"#fee2e2",color:flash.type==="success"?"#166534":"#dc2626",
        boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:14,fontWeight:600}}>{flash.msg}</div>}
    </div>
  );
}
