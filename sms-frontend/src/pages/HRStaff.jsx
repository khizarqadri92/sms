import React, { useState, useEffect, useCallback } from "react";
import hrApi from "../api/hrApi";
import payrollApi from "../api/payrollApi";
import { useAuth } from "../auth/AuthContext";

const STATUS_COLORS = {
  active:     {bg:"#f0fdf4",color:"#166534",border:"#bbf7d0"},
  inactive:   {bg:"#f8fafc",color:"#475569",border:"#e2e8f0"},
  terminated: {bg:"#fff1f2",color:"#881337",border:"#fecdd3"},
  on_leave:   {bg:"#fefce8",color:"#854d0e",border:"#fef08a"},
  resigned:   {bg:"#faf5ff",color:"#581c87",border:"#e9d5ff"},
};
const EMP_TYPES = ["full_time","part_time","contract","intern"];
const EMP_LABELS = {full_time:"Full Time",part_time:"Part Time",contract:"Contract",intern:"Intern"};
const DOC_TYPES = ["Contract","CNIC Copy","Degree/Certificate","Experience Letter","Medical Certificate","Other"];

function roleLabel(name) {
  return name?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) || "—";
}

export default function HRStaff() {
  const { permissions = [] } = useAuth();
  const canCreate = permissions.includes("hr.create");
  const canEdit   = permissions.includes("hr.edit");
  const canDelete = permissions.includes("hr.delete");
  const canDocs   = permissions.includes("hr.documents");
  const canDesig  = permissions.includes("hr.designations");

  const [staff, setStaff]               = useState([]);
  const [departments, setDepartments]   = useState([]);
  const [allRoles, setAllRoles]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [flash, setFlash]               = useState(null);
  const [search, setSearch]             = useState("");
  const [filterDept, setFilterDept]     = useState("");
  const [filterRole, setFilterRole]     = useState("");

  // Add Staff Modal
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState({
    first_name:"", last_name:"", email:"", password:"Staff@1234",
    role_id:"", department_id:"", designation_id:"",
    employment_type:"full_time", joining_date:"",
    employee_code:"", phone:"", is_probationary:true, gender:"", date_of_birth:""
  });
  const [formRoles, setFormRoles]       = useState([]);
  const [formDesig, setFormDesig]       = useState([]);
  const [saving, setSaving]             = useState(false);

  // Detail Panel
  const [selected, setSelected]         = useState(null);
  const [detailTab, setDetailTab]       = useState("info");
  const [detailLoading, setDetailLoading] = useState(false);

  const [designations, setDesignations] = useState([]);
  const [payrollGrades, setPayrollGrades] = useState([]);
  const [payrollProfile, setPayrollProfile] = useState(null);
  const [payrollForm, setPayrollForm] = useState(null);
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [payrollMsg, setPayrollMsg] = useState(null);
  const [basicSalaryMode, setBasicSalaryMode] = useState("individual");

  useEffect(() => {
    if (detailTab === "salary" && selected?.id) {
      setPayrollMsg(null);
      Promise.all([
        payrollApi.getStaffPayrollProfile(selected.id),
        payrollApi.getGrades(),
        payrollApi.getSettings(),
      ]).then(([p, g, s]) => {
        setPayrollProfile(p.data.data);
        setPayrollForm(p.data.data);
        setPayrollGrades((g.data.data || []).filter(x => x.is_active));
        setBasicSalaryMode(s.data.data.basic_salary_mode);
      }).catch(() => {});
    }
  }, [detailTab, selected?.id]);

  const savePayrollProfile = async () => {
    setPayrollMsg(null);
    setPayrollSaving(true);
    try {
      await payrollApi.updateStaffPayrollProfile(selected.id, payrollForm);
      setPayrollMsg({ type: "success", text: "Salary profile saved." });
      setPayrollProfile(payrollForm);
    } catch (e) {
      setPayrollMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    } finally {
      setPayrollSaving(false);
    }
  };
  const [desigForm, setDesigForm]       = useState({name:"", department_id:""});

  // Document / Emergency Contact
  const [docForm, setDocForm]           = useState({doc_type:"Contract", doc_name:"", file:null});
  const [uploading, setUploading]       = useState(false);
  const [ecForm, setEcForm]             = useState({name:"", relationship:"", phone:"", address:""});

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),4000); };

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if(filterDept) params.department_id = filterDept;
    if(filterRole) params.role_id = filterRole;
    if(search) params.search = search;
    hrApi.getAllStaff(params)
      .then(r => setStaff(r.data.data || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, [filterDept, filterRole, search]);

  useEffect(() => { load(); }, [load]);

  const [policySettings, setPolicySettings] = useState({probation_duration_days:90});

  useEffect(() => {
    hrApi.getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
    hrApi.getAllRoles().then(r => setAllRoles(r.data.data || [])).catch(() => {});
    hrApi.getDesignations().then(r => setDesignations(r.data.data || [])).catch(() => {});
    hrApi.getPolicySettings().then(r => setPolicySettings(r.data.data || {probation_duration_days:90})).catch(() => {});
  }, []);

  const isOnProbation = (joiningDate, isProbationary) => {
    if(!joiningDate || isProbationary===false) return false;
    const start = new Date(joiningDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (Number(policySettings.probation_duration_days)||90));
    return new Date() <= end;
  };


  // Cascade: department changes → load roles and designations
  const onFormDeptChange = (deptId) => {
    setForm(p=>({...p, department_id:deptId, role_id:"", designation_id:""}));
    setFormRoles([]); setFormDesig([]);
    if(deptId) {
      hrApi.getDeptRoles(deptId).then(r => setFormRoles(r.data.data || [])).catch(() => {});
      hrApi.getDeptDesignations(deptId).then(r => setFormDesig(r.data.data || [])).catch(() => {});
    }
  };

  const openAdd = () => {
    setForm({first_name:"",last_name:"",email:"",password:"Staff@1234",role_id:"",department_id:"",designation_id:"",employment_type:"full_time",joining_date:"",employee_code:"",phone:"",is_probationary:true,gender:"",date_of_birth:""});
    setFormRoles([]); setFormDesig([]);
    setShowForm(true);
  };

  const saveStaff = async () => {
    if(!form.first_name||!form.last_name||!form.email||!form.role_id){
      showFlash("error","First name, last name, email and role are required."); return;
    }
    setSaving(true);
    try {
      const payload = {...form,
        role_id:Number(form.role_id), department_id:form.department_id||null,
        designation_id:form.designation_id||null,
        joining_date:form.joining_date||null,
        is_probationary:form.is_probationary,
        employee_code:null};  // Auto-generated by server
      const r = await hrApi.createStaffFull(payload);
      const empCode = r.data.data?.employee_code||"";
      showFlash("success", empCode ? `Staff created. Employee Code: #${empCode}` : "Staff created successfully.");
      setShowForm(false); load();
    } catch(e){ showFlash("error", e.response?.data?.detail?.message || e.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm]       = useState({});
  const [infoFormOriginal, setInfoFormOriginal] = useState({});
  const [photoUploading, setPhotoUploading] = useState(false);
  const [isHead, setIsHead]               = useState(false);
  const [hodLoading, setHodLoading]       = useState(false);
  const [inlineMsg, setInlineMsg]         = useState(null);
  const [editEduId, setEditEduId]     = useState(null);
  const [editExpId, setEditExpId] = useState(null);
  const EMPTY_EDU = {degree:"",institution:"",field_of_study:"",start_year:"",end_year:"",is_current:false,grade_type:"marks",total_marks:"",awarded_marks:"",total_cgpa:"",awarded_cgpa:""};
  const EMPTY_EXP = {company:"",designation:"",from_date:"",to_date:"",is_current:false,description:""};
  const [eduForm, setEduForm] = useState(EMPTY_EDU);
  const [expForm, setExpForm] = useState(EMPTY_EXP);

  const reloadSelected = (s) => {
    hrApi.getProfileByUser(s.user_id)
      .then(r => {
        const d = r.data.data;
        setSelected(p=>({...p, ...d}));
        if(d.department_id) {
          hrApi.getDepartmentHead(d.department_id)
            .then(hr => setIsHead(hr.data.data?.id === d.user_id))
            .catch(()=>{});
        }
      })
      .catch(() => {});
  };

  const openDetail = (s) => {
    if (editingInfo && JSON.stringify(infoForm) !== JSON.stringify(infoFormOriginal)) {
      if (!window.confirm("You have unsaved changes on this staff member's Info tab. Discard them and continue?")) {
        return;
      }
    }
    setEditingInfo(false);
    setInfoForm({});
    setInfoFormOriginal({});
    setDetailLoading(true);
    setSelected(s);
    setDetailTab("info");
    setEditEduId(null); setEditExpId(null);
    setEduForm(EMPTY_EDU); setExpForm(EMPTY_EXP);
    hrApi.getProfileByUser(s.user_id)
      .then(r => {
        const d = r.data.data;
        setSelected(p=>({...p, ...d}));
        if(d.department_id) {
          hrApi.getDepartmentHead(d.department_id)
            .then(hr => setIsHead(hr.data.data?.id === d.user_id))
            .catch(()=>setIsHead(false));
        } else setIsHead(false);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  const changeStatus = async (status) => {
    if(!selected?.id) return;
    try {
      await hrApi.updateStatus(selected.id, status);
      showFlash("success","Status updated.");
      setSelected(p=>({...p, status})); load();
    } catch(e){ showFlash("error","Failed."); }
  };

  const uploadDoc = async () => {
    if(!docForm.doc_name||!docForm.file){showFlash("error","Doc name and file required.");return;}
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("doc_type",docForm.doc_type); fd.append("doc_name",docForm.doc_name); fd.append("file",docForm.file);
      await hrApi.uploadDocument(selected.id, fd);
      showFlash("success","Uploaded."); setDocForm({doc_type:"Contract",doc_name:"",file:null});
      hrApi.getStaffById(selected.id).then(r=>setSelected(p=>({...p,...r.data.data}))).catch(()=>{});
    } catch(e){ showFlash("error","Failed."); }
    finally { setUploading(false); }
  };

  const addEC = async () => {
    if(!ecForm.name||!ecForm.phone){showFlash("error","Name and phone required.");return;}
    try {
      await hrApi.addEmergencyContact(selected.id, ecForm);
      showFlash("success","Contact added."); setEcForm({name:"",relationship:"",phone:"",address:""});
      hrApi.getStaffById(selected.id).then(r=>setSelected(p=>({...p,...r.data.data}))).catch(()=>{});
    } catch(e){ showFlash("error","Failed."); }
  };

  const ss = (s) => STATUS_COLORS[s] || STATUS_COLORS.inactive;

  // Filter roles for the filter bar (deduplicate)
  const filterRoleOptions = allRoles;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 60px)"}}>


      {/* STAFF LIST */}
      {(
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Left: List */}
          <div style={{width:selected?360:undefined,flex:selected?undefined:1,borderRight:"1px solid #e2e8f0",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid #e2e8f0",background:"#fff",flexShrink:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700}}>All Staff ({staff.length})</h2>
                {canCreate&&<button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={openAdd}>+ Add Staff</button>}
              </div>
              <div style={{position:"relative",marginBottom:8}}>
                <input className="form-input" placeholder="Search by name or email..." style={{width:"100%",fontSize:13,paddingRight:28}}
                  value={search} onChange={e=>setSearch(e.target.value)}/>
                {search&&(
                  <button onClick={()=>setSearch("")} aria-label="Clear search"
                    style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",
                      cursor:"pointer",color:"#94a3b8",fontSize:16,lineHeight:1,padding:4}}>
                    ×
                  </button>
                )}
              </div>
              <div style={{display:"flex",gap:6}}>
                <select className="form-input" style={{fontSize:12,flex:1}} value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select className="form-input" style={{fontSize:12,flex:1}} value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
                  <option value="">All Roles</option>
                  {filterRoleOptions.map(r=><option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
              </div>
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {loading ? <div style={{padding:40,textAlign:"center",color:"#64748b"}}>Loading...</div>
              : staff.length===0 ? <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No staff found.</div>
              : staff.map(s=>(
                <div key={s.user_id} onClick={()=>openDetail(s)}
                  style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",
                    background:selected?.user_id===s.user_id?"#eff6ff":"#fff"}}
                  onMouseEnter={e=>{if(selected?.user_id!==s.user_id)e.currentTarget.style.background="#f8fafc";}}
                  onMouseLeave={e=>{if(selected?.user_id!==s.user_id)e.currentTarget.style.background="#fff";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:"#0f172a"}}>{s.first_name} {s.last_name}</div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                        <span style={{padding:"1px 6px",background:"#e0f2fe",color:"#0369a1",borderRadius:8,fontSize:11,fontWeight:600}}>
                          {roleLabel(s.role_name)}
                        </span>
                        {s.department_name&&<span style={{marginLeft:6,color:"#94a3b8"}}>{s.department_name}</span>}
                      </div>
                      {s.designation_name&&<div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{s.designation_name}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600,
                        background:ss(s.status).bg,color:ss(s.status).color,border:"1px solid "+ss(s.status).border,whiteSpace:"nowrap"}}>
                        {s.status?.replace(/_/g," ")}
                      </span>
                      {isOnProbation(s.joining_date, s.is_probationary)&&
                        <span style={{padding:"1px 7px",borderRadius:8,fontSize:10,fontWeight:700,whiteSpace:"nowrap",
                          background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa"}}>
                          On Probation
                        </span>}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{s.email}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail */}
          {selected && (
            <div style={{flex:1,overflowY:"auto",background:"#f8fafc"}}>
              <div style={{padding:20,maxWidth:720,margin:"0 auto"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    {selected.profile_photo ?
                      <img src={"http://localhost:5000/"+selected.profile_photo} alt="Profile" style={{width:60,height:60,borderRadius:"50%",objectFit:"cover",border:"2px solid #e2e8f0",flexShrink:0}}/>
                      : <div style={{width:60,height:60,borderRadius:"50%",background:"#2563eb",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,flexShrink:0}}>
                          {(selected.first_name||"?")[0]?.toUpperCase()}
                        </div>}
                  <div>
                    <h2 style={{margin:0,fontSize:20,fontWeight:700}}>{selected.first_name} {selected.last_name}</h2>
                    <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{padding:"2px 10px",background:"#e0f2fe",color:"#0369a1",borderRadius:8,fontSize:12,fontWeight:600}}>
                        {roleLabel(selected.role_name)}
                      </span>
                      {selected.department_name&&<span style={{fontSize:13,color:"#64748b"}}>{selected.department_name}</span>}
                      {selected.designation_name&&<span style={{fontSize:12,color:"#94a3b8"}}>· {selected.designation_name}</span>}
                      {isHead&&<span style={{padding:"2px 10px",background:"#fef9c3",color:"#854d0e",border:"1px solid #fde047",borderRadius:8,fontSize:12,fontWeight:700}}>
                        ⭐ Head of Department
                      </span>}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>{selected.email}</div>
                  </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <span style={{padding:"4px 12px",borderRadius:10,fontSize:12,fontWeight:600,
                      background:ss(selected.status).bg,color:ss(selected.status).color,border:"1px solid "+ss(selected.status).border}}>
                      {selected.status?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"Active"}
                    </span>
                    {isOnProbation(selected.joining_date, selected.is_probationary)&&
                      <span style={{padding:"4px 12px",borderRadius:10,fontSize:12,fontWeight:700,
                        background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa"}}>
                        On Probation
                      </span>}
                    <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)} style={{fontSize:12}}>✕ Close</button>
                  </div>
                </div>

                {/* Detail Tabs */}
                <div style={{display:"flex",gap:0,marginBottom:16,borderBottom:"1px solid #e2e8f0"}}>
                  {["info","education","experience","documents","contacts","salary"].map(t=>(
                    <button key={t} onClick={()=>setDetailTab(t)}
                      style={{padding:"8px 16px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"transparent",
                        borderBottom:detailTab===t?"2px solid #2563eb":"2px solid transparent",
                        color:detailTab===t?"#2563eb":"#64748b"}}>
                      {({info:"Info",education:"Education",experience:"Experience",documents:"Documents",contacts:"Emergency Contacts",salary:"Salary"})[t]}
                    </button>
                  ))}
                </div>

                {detailLoading && <div style={{padding:40,textAlign:"center",color:"#64748b"}}>Loading...</div>}

                {/* INFO */}
                {!detailLoading && detailTab==="info" && (
                  <div>
                    {canEdit && (
                      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                        {!editingInfo&&<button className="btn btn-ghost btn-sm" style={{fontSize:12}} onClick={()=>{
                          const _initialInfoForm = {first_name:selected.first_name||"",last_name:selected.last_name||"",gender:selected.gender||"",date_of_birth:selected.date_of_birth||"",cnic:selected.cnic||"",phone:selected.phone||"",address:selected.address||"",employment_type:selected.employment_type||"full_time",joining_date:selected.joining_date||"",role_id:selected.role_id||"",salary:selected.salary||"",employee_code:selected.employee_code||"",department_id:selected.department_id||"",designation_id:selected.designation_id||""};
                          setInfoForm(_initialInfoForm);
                          setInfoFormOriginal(_initialInfoForm);
                          setEditingInfo(true);
                        }}>✏️ Edit Info</button>}
                      </div>
                    )}
                    {editingInfo ? (
                      <div style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:16,marginBottom:14}}>
                        <div style={{fontWeight:700,fontSize:12,marginBottom:10}}>EDIT STAFF INFO</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                          {[["First Name","first_name"],["Last Name","last_name"],["CNIC","cnic"],["Phone","phone"],["Employee Code","employee_code"],["Joining Date","joining_date","date"]].map(([lbl,key,type])=>(
                            <div key={key}>
                              <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>{lbl}</div>
                              <input type={type||"text"} className="form-input" style={{width:"100%",fontSize:12}} value={infoForm[key]||""}
                                disabled={key==="employee_code"}
                                onChange={e=>setInfoForm(p=>({...p,[key]:e.target.value}))}/>
                            </div>
                          ))}
                          <div>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Gender</div>
                            <select className="form-input" style={{width:"100%",fontSize:12}} value={infoForm.gender||""} onChange={e=>setInfoForm(p=>({...p,gender:e.target.value}))}>
                              <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Date of Birth</div>
                            <input type="date" className="form-input" style={{width:"100%",fontSize:12}} value={infoForm.date_of_birth||""} onChange={e=>setInfoForm(p=>({...p,date_of_birth:e.target.value}))}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Employment Type</div>
                            <select className="form-input" style={{width:"100%",fontSize:12}} value={infoForm.employment_type||"full_time"} onChange={e=>setInfoForm(p=>({...p,employment_type:e.target.value}))}>
                              {EMP_TYPES.map(t=><option key={t} value={t}>{EMP_LABELS[t]}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Department</div>
                            <select className="form-input" style={{width:"100%",fontSize:12}} value={infoForm.department_id||""} onChange={e=>setInfoForm(p=>({...p,department_id:e.target.value,designation_id:""}))}>
                              <option value="">Select...</option>
                              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Designation</div>
                            <select className="form-input" style={{width:"100%",fontSize:12}} value={infoForm.designation_id||""} onChange={e=>setInfoForm(p=>({...p,designation_id:e.target.value}))}>
                              <option value="">Select...</option>
                              {designations.filter(d=>!infoForm.department_id||d.department_id===Number(infoForm.department_id)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Role</div>
                            <select className="form-input" style={{width:"100%",fontSize:12}} value={infoForm.role_id||""} onChange={e=>setInfoForm(p=>({...p,role_id:e.target.value}))}>
                              <option value="">Select role...</option>
                              {allRoles.map(r=><option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                            </select>
                          </div>
                          <div style={{gridColumn:"1/-1"}}>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Address</div>
                            <textarea className="form-input" rows={2} style={{width:"100%",fontSize:12}} value={infoForm.address||""} onChange={e=>setInfoForm(p=>({...p,address:e.target.value}))}/>
                          </div>
                          <div style={{gridColumn:"1/-1"}}>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Profile Photo</div>
                            <input type="file" accept="image/*" style={{fontSize:12}}
                              onChange={async e=>{
                                const file=e.target.files[0]; if(!file||!selected.id) return;
                                setPhotoUploading(true);
                                try{ const fd=new FormData(); fd.append("file",file);
                                  const r=await hrApi.uploadStaffPhoto(selected.id,fd);
                                  setSelected(p=>({...p,profile_photo:r.data.data.photo_url.replace("/uploads/","uploads/")}));
                                  showFlash("success","Photo updated.");
                                }catch(err){showFlash("error","Failed.");}
                                finally{setPhotoUploading(false);}
                              }}/>
                            {photoUploading&&<span style={{fontSize:11,color:"#64748b",marginLeft:8}}>Uploading...</span>}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                          <button className="btn btn-ghost btn-sm" style={{fontSize:12}} onClick={()=>setEditingInfo(false)}>Cancel</button>
                          <button className="btn btn-primary btn-sm" style={{color:"#fff",fontSize:12}} onClick={async()=>{
                            try{
                              await hrApi.updateStaff(selected.id,{first_name:infoForm.first_name,last_name:infoForm.last_name,gender:infoForm.gender,date_of_birth:infoForm.date_of_birth||null,cnic:infoForm.cnic,phone:infoForm.phone,address:infoForm.address,designation_id:infoForm.designation_id||null,department_id:infoForm.department_id||null,employment_type:infoForm.employment_type||'full_time',joining_date:infoForm.joining_date||null,contract_end_date:null,employee_code:infoForm.employee_code||null,user_id:selected.user_id});
                              if(infoForm.role_id&&Number(infoForm.role_id)!==selected.role_id) await hrApi.updateStaffRole(selected.id,Number(infoForm.role_id));
                              showFlash("success","Updated."); setEditingInfo(false); reloadSelected(selected);
                            }catch(e){showFlash("error",e.response?.data?.message||e.response?.data?.detail?.message||"Failed.");}
                          }}>Save Changes</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                        {[["Phone",selected.phone],["Employee Code",selected.employee_code],["Employment Type",EMP_LABELS[selected.employment_type]||selected.employment_type],["Joining Date",selected.joining_date],["CNIC",selected.cnic],["Date of Birth",selected.date_of_birth],["Gender",selected.gender]].map(([label,value])=>(
                          <div key={label} style={{background:"#fff",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0"}}>
                            <div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{label.toUpperCase()}</div>
                            <div style={{fontSize:14,color:"#0f172a",marginTop:3,fontWeight:500}}>{value||"—"}</div>
                          </div>
                        ))}
                        {selected.address&&<div style={{gridColumn:"1/-1",background:"#fff",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0"}}>
                          <div style={{fontSize:11,color:"#64748b",fontWeight:600}}>ADDRESS</div>
                          <div style={{fontSize:13,color:"#0f172a",marginTop:3}}>{selected.address}</div>
                        </div>}
                      </div>
                    )}
                    {inlineMsg&&(
                      <div style={{padding:"10px 14px",marginBottom:8,borderRadius:8,background:inlineMsg.type==="error"?"#fff1f2":"#f0fdf4",border:"1px solid "+(inlineMsg.type==="error"?"#fecdd3":"#bbf7d0"),color:inlineMsg.type==="error"?"#dc2626":"#166534",fontSize:13,fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>{inlineMsg.type==="error"?"⚠️ ":"✅ "}{inlineMsg.msg}</span>
                        <button onClick={()=>setInlineMsg(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"inherit",lineHeight:1}}>×</button>
                      </div>
                    )}
                    {canEdit&&selected.id&&!editingInfo&&(
                      <div style={{background:"#fff",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0"}}>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:8}}>CHANGE STATUS</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {Object.keys(STATUS_COLORS).map(s=>(
                            <button key={s} onClick={()=>changeStatus(s)} disabled={selected.status===s}
                              style={{padding:"4px 12px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
                                background:selected.status===s?ss(s).bg:"#f1f5f9",color:selected.status===s?ss(s).color:"#475569",
                                border:"1px solid "+(selected.status===s?ss(s).border:"#e2e8f0"),opacity:selected.status===s?1:0.7}}>
                              {s.replace(/_/g," ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {canEdit&&selected.id&&selected.department_id&&!editingInfo&&(
                      <div style={{background:"#fff",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0"}}>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:8}}>DEPARTMENT HEAD</div>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <label style={{display:"flex",gap:8,alignItems:"center",cursor:"pointer",fontSize:13,fontWeight:600}}>
                            <input type="checkbox" checked={isHead} style={{accentColor:"#2563eb",width:16,height:16}}
                              onChange={async(e)=>{
                                setHodLoading(true);
                                try{
                                  if(e.target.checked){
                                    await hrApi.setDepartmentHead(selected.id);
                                    setIsHead(true);
                                    setInlineMsg({type:"success",msg:"Department Head assigned successfully."});
                                  } else {
                                    await hrApi.removeDepartmentHead(selected.id);
                                    setIsHead(false);
                                    setInlineMsg({type:"success",msg:"Department Head removed."});
                                  }
                                  reloadSelected(selected);
                                }catch(err){
                                  setInlineMsg({type:"error",msg:err.response?.data?.detail?.message||err.response?.data?.message||err.response?.data?.detail||(typeof err.response?.data?.detail==="string"?err.response?.data?.detail:null)||"This department already has a Head of Department. Contact HR to remove the existing HOD first."});
                                  e.target.checked = !e.target.checked;
                                }finally{setHodLoading(false);}
                              }}/>
                            Head of Department
                          </label>
                          {isHead&&<span style={{padding:"3px 10px",background:"#fef9c3",color:"#854d0e",border:"1px solid #fde047",borderRadius:8,fontSize:12,fontWeight:700}}>⭐ Currently HOD</span>}
                          {hodLoading&&<span style={{fontSize:12,color:"#64748b"}}>Updating...</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* EDUCATION */}
                {!detailLoading && detailTab==="education" && (
                  <div>
                    {/* Add/Edit Form */}
                    <div style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:14,marginBottom:14}}>
                      <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#334155"}}>{editEduId?"EDIT EDUCATION":"ADD EDUCATION"}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                        {[["Degree *","degree"],["Institution *","institution"],["Field of Study","field_of_study"],["Start Year","start_year","number"],["End Year","end_year","number"]].map(([lbl,key,type])=>(
                          <div key={key}>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>{lbl}</div>
                            <input type={type||"text"} className="form-input" style={{width:"100%",fontSize:12}} value={eduForm[key]||""} onChange={e=>setEduForm(p=>({...p,[key]:e.target.value}))}/>
                          </div>
                        ))}
                        <div>
                          <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Grading</div>
                          <select className="form-input" style={{width:"100%",fontSize:12}} value={eduForm.grade_type} onChange={e=>setEduForm(p=>({...p,grade_type:e.target.value,total_marks:"",awarded_marks:"",total_cgpa:"",awarded_cgpa:""}))}>
                            <option value="marks">Marks</option><option value="cgpa">CGPA</option>
                          </select>
                        </div>
                        {eduForm.grade_type==="marks"?(<>
                          <div><div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Total Marks</div><input type="number" className="form-input" style={{width:"100%",fontSize:12}} value={eduForm.total_marks||""} onChange={e=>setEduForm(p=>({...p,total_marks:e.target.value}))}/></div>
                          <div><div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Awarded Marks</div><input type="number" className="form-input" style={{width:"100%",fontSize:12}} value={eduForm.awarded_marks||""} onChange={e=>setEduForm(p=>({...p,awarded_marks:e.target.value}))}/></div>
                        </>):(<>
                          <div><div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Total CGPA</div><input type="number" className="form-input" style={{width:"100%",fontSize:12}} value={eduForm.total_cgpa||""} onChange={e=>setEduForm(p=>({...p,total_cgpa:e.target.value}))}/></div>
                          <div><div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Awarded CGPA</div><input type="number" className="form-input" style={{width:"100%",fontSize:12}} value={eduForm.awarded_cgpa||""} onChange={e=>setEduForm(p=>({...p,awarded_cgpa:e.target.value}))}/></div>
                        </>)}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <label style={{fontSize:12,display:"flex",gap:5,alignItems:"center",cursor:"pointer"}}>
                          <input type="checkbox" checked={eduForm.is_current} onChange={e=>setEduForm(p=>({...p,is_current:e.target.checked}))}/>Currently studying
                        </label>
                        <div style={{display:"flex",gap:6}}>
                          {editEduId&&<button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditEduId(null);setEduForm(EMPTY_EDU);}}>Cancel</button>}
                          <button className="btn btn-primary btn-sm" style={{color:"#fff",fontSize:11}} onClick={async()=>{
                            if(!eduForm.degree||!eduForm.institution){showFlash("error","Degree and institution required.");return;}
                            const p={...eduForm,start_year:eduForm.start_year||null,end_year:eduForm.end_year||null,total_marks:eduForm.total_marks||null,awarded_marks:eduForm.awarded_marks||null,total_cgpa:eduForm.total_cgpa||null,awarded_cgpa:eduForm.awarded_cgpa||null};
                            try{
                              if(editEduId) await hrApi.updateStaffEducation(selected.id,editEduId,p);
                              else await hrApi.addStaffEducation(selected.id,p);
                              showFlash("success",editEduId?"Updated.":"Added."); setEditEduId(null); setEduForm(EMPTY_EDU); reloadSelected(selected);
                            }catch(e){showFlash("error","Failed.");}
                          }}>{editEduId?"Update":"Add Education"}</button>
                        </div>
                      </div>
                    </div>
                    {(!selected.education||selected.education.length===0)?
                      <div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No education records.</div>:
                      selected.education.map(e=>(
                        <div key={e.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:13}}>{e.degree}</div>
                            <div style={{fontSize:12,color:"#475569"}}>{e.institution}</div>
                            {e.field_of_study&&<div style={{fontSize:11,color:"#64748b"}}>{e.field_of_study}</div>}
                            <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                              {e.start_year||"?"} — {e.is_current?"Present":e.end_year||"?"}
                              {e.grade_type==="marks"&&e.total_marks&&<span style={{marginLeft:8}}>· {e.awarded_marks}/{e.total_marks} Marks</span>}
                              {e.grade_type==="cgpa"&&e.total_cgpa&&<span style={{marginLeft:8}}>· {e.awarded_cgpa}/{e.total_cgpa} CGPA</span>}
                            </div>
                          </div>
                          <div style={{display:"flex",gap:4}}>
                            <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditEduId(e.id);setEduForm({degree:e.degree,institution:e.institution,field_of_study:e.field_of_study||"",start_year:e.start_year||"",end_year:e.end_year||"",is_current:e.is_current,grade_type:e.grade_type||"marks",total_marks:e.total_marks||"",awarded_marks:e.awarded_marks||"",total_cgpa:e.total_cgpa||"",awarded_cgpa:e.awarded_cgpa||""});}}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11}} onClick={async()=>{await hrApi.deleteStaffEducation(selected.id,e.id);reloadSelected(selected);}}>Remove</button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* EXPERIENCE */}
                {!detailLoading && detailTab==="experience" && (
                  <div>
                    <div style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:14,marginBottom:14}}>
                      <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#334155"}}>{editExpId?"EDIT EXPERIENCE":"ADD EXPERIENCE"}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                        {[["Company *","company"],["Designation *","designation"],["From Date","from_date","date"],["To Date","to_date","date"]].map(([lbl,key,type])=>(
                          <div key={key}>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>{lbl}</div>
                            <input type={type||"text"} className="form-input" style={{width:"100%",fontSize:12}} value={expForm[key]||""} onChange={e=>setExpForm(p=>({...p,[key]:e.target.value}))}/>
                          </div>
                        ))}
                        <div style={{gridColumn:"1/-1"}}>
                          <div style={{fontSize:11,fontWeight:600,marginBottom:3}}>Description</div>
                          <textarea className="form-input" rows={2} style={{width:"100%",fontSize:12}} value={expForm.description||""} onChange={e=>setExpForm(p=>({...p,description:e.target.value}))}/>
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <label style={{fontSize:12,display:"flex",gap:5,alignItems:"center",cursor:"pointer"}}>
                          <input type="checkbox" checked={expForm.is_current} onChange={e=>setExpForm(p=>({...p,is_current:e.target.checked}))}/>Currently working here
                        </label>
                        <div style={{display:"flex",gap:6}}>
                          {editExpId&&<button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditExpId(null);setExpForm(EMPTY_EXP);}}>Cancel</button>}
                          <button className="btn btn-primary btn-sm" style={{color:"#fff",fontSize:11}} onClick={async()=>{
                            if(!expForm.company||!expForm.designation){showFlash("error","Company and designation required.");return;}
                            const p={...expForm,from_date:expForm.from_date||null,to_date:expForm.to_date||null};
                            try{
                              if(editExpId) await hrApi.updateStaffExperience(selected.id,editExpId,p);
                              else await hrApi.addStaffExperience(selected.id,p);
                              showFlash("success",editExpId?"Updated.":"Added."); setEditExpId(null); setExpForm(EMPTY_EXP); reloadSelected(selected);
                            }catch(e){showFlash("error","Failed.");}
                          }}>{editExpId?"Update":"Add Experience"}</button>
                        </div>
                      </div>
                    </div>
                    {(!selected.experience||selected.experience.length===0)?
                      <div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No experience records.</div>:
                      selected.experience.map(e=>(
                        <div key={e.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:13}}>{e.designation}</div>
                            <div style={{fontSize:12,color:"#475569"}}>{e.company}</div>
                            <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{e.from_date||"?"} — {e.is_current?"Present":e.to_date||"?"}</div>
                            {e.description&&<div style={{fontSize:11,color:"#64748b",marginTop:3}}>{e.description}</div>}
                          </div>
                          <div style={{display:"flex",gap:4}}>
                            <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditExpId(e.id);setExpForm({company:e.company,designation:e.designation,from_date:e.from_date||"",to_date:e.to_date||"",is_current:e.is_current,description:e.description||""});}}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11}} onClick={async()=>{await hrApi.deleteStaffExperience(selected.id,e.id);reloadSelected(selected);}}>Remove</button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* DOCUMENTS */}
                {!detailLoading && detailTab==="documents" && selected.id && (
                  <div>
                    {canDocs&&(
                      <div style={{background:"#fff",padding:14,borderRadius:8,border:"1px solid #e2e8f0",marginBottom:12}}>
                        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>UPLOAD DOCUMENT</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                          <select className="form-input" style={{fontSize:13}} value={docForm.doc_type}
                            onChange={e=>setDocForm(p=>({...p,doc_type:e.target.value}))}>
                            {DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                          <input className="form-input" placeholder="Document name *" style={{fontSize:13}}
                            value={docForm.doc_name} onChange={e=>setDocForm(p=>({...p,doc_name:e.target.value}))}/>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <input type="file" style={{flex:1,fontSize:12}} onChange={e=>setDocForm(p=>({...p,file:e.target.files[0]}))}/>
                          <button className="btn btn-primary btn-sm" style={{color:"#fff",whiteSpace:"nowrap"}} disabled={uploading} onClick={uploadDoc}>
                            {uploading?"Uploading...":"Upload"}
                          </button>
                        </div>
                      </div>
                    )}
                    {(!selected.documents||selected.documents.length===0)?
                      <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No documents.</div>:
                      selected.documents.map(doc=>(
                        <div key={doc.id} style={{background:"#fff",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>{doc.doc_name}</div>
                            <div style={{fontSize:11,color:"#64748b"}}>{doc.doc_type} · {doc.uploaded_at}</div>
                          </div>
                          {canDocs&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:12}}
                            onClick={async()=>{await hrApi.deleteDocument(selected.id,doc.id);hrApi.getStaffById(selected.id).then(r=>setSelected(p=>({...p,...r.data.data}))).catch(()=>{});}}>
                            Remove</button>}
                        </div>
                      ))}
                  </div>
                )}
                {!detailLoading && detailTab==="documents" && !selected.id &&
                  <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No HR record — create one to manage documents.</div>}

                {/* EMERGENCY CONTACTS */}
                {!detailLoading && detailTab==="contacts" && selected.id && (
                  <div>
                    {canEdit&&(
                      <div style={{background:"#fff",padding:14,borderRadius:8,border:"1px solid #e2e8f0",marginBottom:12}}>
                        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>ADD EMERGENCY CONTACT</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                          <input className="form-input" placeholder="Name *" style={{fontSize:13}} value={ecForm.name} onChange={e=>setEcForm(p=>({...p,name:e.target.value}))}/>
                          <input className="form-input" placeholder="Relationship" style={{fontSize:13}} value={ecForm.relationship} onChange={e=>setEcForm(p=>({...p,relationship:e.target.value}))}/>
                          <input className="form-input" placeholder="Phone *" style={{fontSize:13}} value={ecForm.phone} onChange={e=>setEcForm(p=>({...p,phone:e.target.value}))}/>
                          <input className="form-input" placeholder="Address" style={{fontSize:13}} value={ecForm.address} onChange={e=>setEcForm(p=>({...p,address:e.target.value}))}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"flex-end"}}>
                          <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={addEC}>Add Contact</button>
                        </div>
                      </div>
                    )}
                    {(!selected.emergency_contacts||selected.emergency_contacts.length===0)?
                      <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No emergency contacts.</div>:
                      selected.emergency_contacts.map(ec=>(
                        <div key={ec.id} style={{background:"#fff",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>{ec.name} {ec.relationship&&<span style={{fontSize:11,color:"#64748b"}}>({ec.relationship})</span>}</div>
                            <div style={{fontSize:12,color:"#475569"}}>📞 {ec.phone}</div>
                            {ec.address&&<div style={{fontSize:11,color:"#94a3b8"}}>{ec.address}</div>}
                          </div>
                          {canEdit&&<button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:12}}
                            onClick={async()=>{await hrApi.deleteEmergencyContact(selected.id,ec.id);hrApi.getStaffById(selected.id).then(r=>setSelected(p=>({...p,...r.data.data}))).catch(()=>{});}}>
                            Remove</button>}
                        </div>
                      ))}
                  </div>
                )}

                {!detailLoading && detailTab==="salary" && payrollForm && (
                  <div style={{background:"#fff",padding:16,borderRadius:8,border:"1px solid #e2e8f0"}}>
                    {payrollMsg && (
                      <div style={{marginBottom:14,padding:"10px 14px",borderRadius:8,fontSize:13,fontWeight:600,
                        background:payrollMsg.type==="success"?"#dcfce7":"#fee2e2",
                        color:payrollMsg.type==="success"?"#166534":"#dc2626"}}>
                        {payrollMsg.type==="success"?"\u2713 ":"\u26a0 "}{payrollMsg.text}
                      </div>
                    )}
                    <div style={{marginBottom:14}}>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:6}}>Salary Type</label>
                      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                        {[["lump_sum","Lump Sum Salary"],["structured","Structured Salary"],["hourly","Hourly Salary"],["daily_wage","Daily Wage"]].map(([val,label])=>(
                          <label key={val} style={{display:"flex",gap:6,alignItems:"center",fontSize:13,cursor:canEdit?"pointer":"default"}}>
                            <input type="radio" disabled={!canEdit} checked={payrollForm.salary_type===val}
                              onChange={()=>setPayrollForm(p=>({...p,salary_type:val}))} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {payrollForm.salary_type==="lump_sum" && (
                      <div style={{marginBottom:14}}>
                        <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Lump Sum Amount *</label>
                        <input type="number" step="0.01" className="form-input" style={{width:220,fontSize:13}} disabled={!canEdit}
                          value={payrollForm.lump_sum_amount ?? ""} onChange={e=>setPayrollForm(p=>({...p,lump_sum_amount:e.target.value}))} />
                        <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>This full amount, minus applicable deductions, is what the employee is awarded.</div>
                      </div>
                    )}

                    {payrollForm.salary_type==="structured" && (
                      <>
                        <div style={{marginBottom:14}}>
                          <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Grade *</label>
                          <select className="form-input" style={{width:260,fontSize:13}} disabled={!canEdit}
                            value={payrollForm.grade_id || ""} onChange={e=>setPayrollForm(p=>({...p,grade_id:e.target.value?Number(e.target.value):null}))}>
                            <option value="">Select grade...</option>
                            {payrollGrades.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                        {basicSalaryMode==="individual" && (
                          <div style={{marginBottom:14}}>
                            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Basic Salary *</label>
                            <input type="number" step="0.01" className="form-input" style={{width:220,fontSize:13}} disabled={!canEdit}
                              value={payrollForm.basic_salary ?? ""} onChange={e=>setPayrollForm(p=>({...p,basic_salary:e.target.value}))} />
                          </div>
                        )}
                      </>
                    )}

                    {payrollForm.salary_type==="hourly" && (
                      <div style={{marginBottom:14}}>
                        <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Per Hour Rate *</label>
                        <input type="number" step="0.01" className="form-input" style={{width:220,fontSize:13}} disabled={!canEdit}
                          value={payrollForm.hourly_rate ?? ""} onChange={e=>setPayrollForm(p=>({...p,hourly_rate:e.target.value}))} />
                      </div>
                    )}

                    {payrollForm.salary_type==="daily_wage" && (
                      <div style={{marginBottom:14}}>
                        <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Daily Wage Amount *</label>
                        <input type="number" step="0.01" className="form-input" style={{width:220,fontSize:13}} disabled={!canEdit}
                          value={payrollForm.daily_wage_amount ?? ""} onChange={e=>setPayrollForm(p=>({...p,daily_wage_amount:e.target.value}))} />
                      </div>
                    )}

                    {canEdit && (
                      <div style={{display:"flex",justifyContent:"flex-end"}}>
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={payrollSaving} onClick={savePayrollProfile}>
                          {payrollSaving?"Saving...":"Save Salary Profile"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* ADD STAFF MODAL */}
      {showForm && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:620,maxHeight:"92vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16}}>Add New Staff Member</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Close</button>
            </div>
            <div style={{padding:20}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>First Name *</label>
                  <input className="form-input" style={{width:"100%",fontSize:13}} value={form.first_name} onChange={e=>setForm(p=>({...p,first_name:e.target.value}))}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Last Name *</label>
                  <input className="form-input" style={{width:"100%",fontSize:13}} value={form.last_name} onChange={e=>setForm(p=>({...p,last_name:e.target.value}))}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Email *</label>
                  <input type="email" className="form-input" style={{width:"100%",fontSize:13}} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Password</label>
                  <input className="form-input" style={{width:"100%",fontSize:13}} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Phone</label>
                  <input className="form-input" style={{width:"100%",fontSize:13}} value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Employee Code</label>
                  <input className="form-input" style={{width:"100%",fontSize:13, color:"#94a3b8"}} disabled placeholder="Will be auto-generated" value=""/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Gender</label>
                  <select className="form-input" style={{width:"100%",fontSize:13}} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Date of Birth</label>
                  <input type="date" className="form-input" style={{width:"100%",fontSize:13}} value={form.date_of_birth} onChange={e=>setForm(p=>({...p,date_of_birth:e.target.value}))}/>
                </div>
                <div style={{gridColumn:"1/-1",background:"#f8fafc",borderRadius:8,padding:12,border:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#475569",marginBottom:10}}>DEPARTMENT & ROLE</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Department</label>
                      <select className="form-input" style={{width:"100%",fontSize:13}} value={form.department_id} onChange={e=>onFormDeptChange(e.target.value)}>
                        <option value="">Select...</option>
                        {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Role *</label>
                      <select className="form-input" style={{width:"100%",fontSize:13}} value={form.role_id} onChange={e=>setForm(p=>({...p,role_id:e.target.value}))}>
                        <option value="">Select role...</option>
                        {(form.department_id ? formRoles : allRoles).map(r=>(
                          <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Designation</label>
                      <select className="form-input" style={{width:"100%",fontSize:13}} value={form.designation_id} onChange={e=>setForm(p=>({...p,designation_id:e.target.value}))}>
                        <option value="">Select...</option>
                        {(form.department_id ? formDesig : designations).map(d=>(
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Employment Type</label>
                  <select className="form-input" style={{width:"100%",fontSize:13}} value={form.employment_type} onChange={e=>setForm(p=>({...p,employment_type:e.target.value}))}>
                    {EMP_TYPES.map(t=><option key={t} value={t}>{EMP_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Joining Date</label>
                  <input type="date" className="form-input" style={{width:"100%",fontSize:13}} value={form.joining_date} onChange={e=>setForm(p=>({...p,joining_date:e.target.value}))}/>
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,cursor:"pointer"}}>
                    <input type="checkbox" checked={form.is_probationary} onChange={e=>setForm(p=>({...p,is_probationary:e.target.checked}))}/>
                    Subject to Probation Period
                  </label>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                    Uncheck to treat this employee as regular from day one (no probation restrictions will apply, regardless of joining date).
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={saving} onClick={saveStaff}>
                  {saving?"Creating...":"Create Staff Member"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flash */}
      {flash&&<div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"10px 18px",borderRadius:8,
        background:flash.type==="success"?"#dcfce7":"#fee2e2",color:flash.type==="success"?"#166534":"#dc2626",
        boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:14,fontWeight:600}}>{flash.msg}</div>}
    </div>
  );
}
