import React, { useState, useEffect, useCallback } from "react";
import hrApi from "../api/hrApi";
import payrollApi from "../api/payrollApi";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import "./HRStaff.css";

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
  const processingToday = useProcessingToday();
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
  const [bankForm, setBankForm] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState(null);

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

  useEffect(() => {
    if (detailTab === "bankinfo" && selected?.id) {
      setBankMsg(null);
      payrollApi.getStaffBankInfo(selected.id).then(r => setBankForm(r.data.data)).catch(() => {});
    }
  }, [detailTab, selected?.id]);
  const saveBankInfo = async () => {
    setBankMsg(null);
    setBankSaving(true);
    try {
      await payrollApi.updateStaffBankInfo(selected.id, bankForm);
      setBankMsg({ type: "success", text: "Bank information saved." });
    } catch (e) {
      setBankMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    } finally {
      setBankSaving(false);
    }
  };
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
    return new Date(processingToday) <= end;
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
    <div className="hst-page">


      {/* STAFF LIST */}
      {(
        <div className="hst-body">
          {/* Left: List */}
          <div className="hst-list-pane" style={{ "--pane-width": selected?"360px":"auto", "--pane-flex": selected?"none":"1" }}>
            <div className="hst-list-header">
              <div className="hst-list-header-top">
                <h2 className="hst-list-title">All Staff ({staff.length})</h2>
                {canCreate&&<button className="btn btn-primary btn-sm hst-add-btn" onClick={openAdd}>+ Add Staff</button>}
              </div>
              <div className="hst-search-wrap">
                <input className="form-input hst-search-input" placeholder="Search by name or email..."
                  value={search} onChange={e=>setSearch(e.target.value)}/>
                {search&&(
                  <button onClick={()=>setSearch("")} aria-label="Clear search" className="hst-clear-btn">
                    ×
                  </button>
                )}
              </div>
              <div className="hst-filter-row">
                <select className="form-input hst-filter-select" value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select className="form-input hst-filter-select" value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
                  <option value="">All Roles</option>
                  {filterRoleOptions.map(r=><option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
              </div>
            </div>
            <div className="hst-list-scroll">
              {loading ? <div className="hst-loading-text">Loading...</div>
              : staff.length===0 ? <div className="hst-empty-text">No staff found.</div>
              : staff.map(s=>(
                <div key={s.user_id} onClick={()=>openDetail(s)}
                  className="hst-staff-row"
                  style={{ "--row-bg": selected?.user_id===s.user_id?"var(--bg-info-soft)":"var(--bg-card)" }}>
                  <div className="hst-staff-row-top">
                    <div>
                      <div className="hst-staff-name">{s.first_name} {s.last_name}</div>
                      <div className="hst-staff-meta">
                        <span className="hst-role-tag">
                          {roleLabel(s.role_name)}
                        </span>
                        {s.department_name&&<span className="hst-dept-text">{s.department_name}</span>}
                      </div>
                      {s.designation_name&&<div className="hst-desig-text">{s.designation_name}</div>}
                    </div>
                    <div className="hst-staff-badges-col">
                      <span className="hst-status-badge" style={{ "--status-bg": ss(s.status).bg, "--status-color": ss(s.status).color, "--status-border": ss(s.status).border }}>
                        {s.status?.replace(/_/g," ")}
                      </span>
                      {isOnProbation(s.joining_date, s.is_probationary)&&
                        <span className="hst-probation-badge">
                          On Probation
                        </span>}
                    </div>
                  </div>
                  <div className="hst-staff-email">{s.email}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail */}
          {selected && (
            <div className="hst-detail-pane">
              <div className="hst-detail-inner">
                <div className="hst-detail-header-row">
                  <div className="hst-detail-header-left">
                    {selected.profile_photo ?
                      <img src={"http://localhost:5000/"+selected.profile_photo} alt="Profile" className="hst-avatar-img"/>
                      : <div className="hst-avatar-placeholder">
                          {(selected.first_name||"?")[0]?.toUpperCase()}
                        </div>}
                  <div>
                    <h2 className="hst-detail-name">{selected.first_name} {selected.last_name}</h2>
                    <div className="hst-detail-meta-row">
                      <span className="hst-role-tag-lg">
                        {roleLabel(selected.role_name)}
                      </span>
                      {selected.department_name&&<span className="hst-dept-text-lg">{selected.department_name}</span>}
                      {selected.designation_name&&<span className="hst-desig-text-lg">· {selected.designation_name}</span>}
                      {isHead&&<span className="hst-hod-badge">
                        ⭐ Head of Department
                      </span>}
                    </div>
                    <div className="hst-detail-email">{selected.email}</div>
                  </div>
                  </div>
                  <div className="hst-detail-header-right">
                    <span className="hst-status-badge-lg" style={{ "--status-bg": ss(selected.status).bg, "--status-color": ss(selected.status).color, "--status-border": ss(selected.status).border }}>
                      {selected.status?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"Active"}
                    </span>
                    {isOnProbation(selected.joining_date, selected.is_probationary)&&
                      <span className="hst-probation-badge-lg">
                        On Probation
                      </span>}
                    <button className="btn btn-ghost btn-sm hst-close-btn" onClick={()=>setSelected(null)}>✕ Close</button>
                  </div>
                </div>

                {/* Detail Tabs */}
                <div className="hst-detail-tab-row">
                  {["info","education","experience","documents","contacts","salary","bankinfo"].map(t=>(
                    <button key={t} onClick={()=>setDetailTab(t)}
                      className="hst-detail-tab-btn"
                      style={{ "--tab-border": detailTab===t?"#2563eb":"transparent", "--tab-color": detailTab===t?"#2563eb":"var(--text-secondary)" }}>
                      {({info:"Info",education:"Education",experience:"Experience",documents:"Documents",contacts:"Emergency Contacts",salary:"Salary",bankinfo:"Bank Info"})[t]}
                    </button>
                  ))}
                </div>

                {detailLoading && <div className="hst-loading-text">Loading...</div>}

                {/* INFO */}
                {!detailLoading && detailTab==="info" && (
                  <div>
                    {canEdit && (
                      <div className="hst-edit-btn-row">
                        {!editingInfo&&<button className="btn btn-ghost btn-sm hst-edit-btn" onClick={()=>{
                          const _initialInfoForm = {first_name:selected.first_name||"",last_name:selected.last_name||"",gender:selected.gender||"",date_of_birth:selected.date_of_birth||"",cnic:selected.cnic||"",phone:selected.phone||"",address:selected.address||"",employment_type:selected.employment_type||"full_time",joining_date:selected.joining_date||"",role_id:selected.role_id||"",salary:selected.salary||"",employee_code:selected.employee_code||"",department_id:selected.department_id||"",designation_id:selected.designation_id||""};
                          setInfoForm(_initialInfoForm);
                          setInfoFormOriginal(_initialInfoForm);
                          setEditingInfo(true);
                        }}>✏️ Edit Info</button>}
                      </div>
                    )}
                    {editingInfo ? (
                      <div className="hst-edit-card">
                        <div className="hst-edit-card-title">EDIT STAFF INFO</div>
                        <div className="hst-edit-grid-2col">
                          {[["First Name","first_name"],["Last Name","last_name"],["CNIC","cnic"],["Phone","phone"],["Employee Code","employee_code"]].map(([lbl,key,type])=>(
                            <div key={key}>
                              <div className="hst-edit-field-label">{lbl}</div>
                              <input type={type||"text"} className="form-input hst-edit-input" value={infoForm[key]||""}
                                disabled={key==="employee_code"}
                                onChange={e=>setInfoForm(p=>({...p,[key]:e.target.value}))}/>
                            </div>
                          ))}
                          <div>
                            <div className="hst-edit-field-label">Gender</div>
                            <select className="form-input hst-edit-input" value={infoForm.gender||""} onChange={e=>setInfoForm(p=>({...p,gender:e.target.value}))}>
                              <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <div className="hst-edit-field-label">Date of Birth</div>
                            <DatePicker style={{width:"100%",fontSize:12}} value={infoForm.date_of_birth||""} onChange={val=>setInfoForm(p=>({...p,date_of_birth:val}))}/>
                          </div>
                          <div>
                            <div className="hst-edit-field-label">Joining Date</div>
                            <DatePicker style={{width:"100%",fontSize:12}} value={infoForm.joining_date||""} onChange={val=>setInfoForm(p=>({...p,joining_date:val}))}/>
                          </div>
                          <div>
                            <div className="hst-edit-field-label">Employment Type</div>
                            <select className="form-input hst-edit-input" value={infoForm.employment_type||"full_time"} onChange={e=>setInfoForm(p=>({...p,employment_type:e.target.value}))}>
                              {EMP_TYPES.map(t=><option key={t} value={t}>{EMP_LABELS[t]}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="hst-edit-field-label">Department</div>
                            <select className="form-input hst-edit-input" value={infoForm.department_id||""} onChange={e=>setInfoForm(p=>({...p,department_id:e.target.value,designation_id:""}))}>
                              <option value="">Select...</option>
                              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="hst-edit-field-label">Designation</div>
                            <select className="form-input hst-edit-input" value={infoForm.designation_id||""} onChange={e=>setInfoForm(p=>({...p,designation_id:e.target.value}))}>
                              <option value="">Select...</option>
                              {designations.filter(d=>!infoForm.department_id||d.department_id===Number(infoForm.department_id)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="hst-edit-field-label">Role</div>
                            <select className="form-input hst-edit-input" value={infoForm.role_id||""} onChange={e=>setInfoForm(p=>({...p,role_id:e.target.value}))}>
                              <option value="">Select role...</option>
                              {allRoles.map(r=><option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                            </select>
                          </div>
                          <div className="hst-edit-field-full">
                            <div className="hst-edit-field-label">Address</div>
                            <textarea className="form-input hst-edit-input" rows={2} value={infoForm.address||""} onChange={e=>setInfoForm(p=>({...p,address:e.target.value}))}/>
                          </div>
                          <div className="hst-edit-field-full">
                            <div className="hst-edit-field-label">Profile Photo</div>
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
                            {photoUploading&&<span className="hst-uploading-text">Uploading...</span>}
                          </div>
                        </div>
                        <div className="hst-edit-btn-row-end">
                          <button className="btn btn-ghost btn-sm hst-edit-btn" onClick={()=>setEditingInfo(false)}>Cancel</button>
                          <button className="btn btn-primary btn-sm hst-save-btn" onClick={async()=>{
                            try{
                              await hrApi.updateStaff(selected.id,{first_name:infoForm.first_name,last_name:infoForm.last_name,gender:infoForm.gender,date_of_birth:infoForm.date_of_birth||null,cnic:infoForm.cnic,phone:infoForm.phone,address:infoForm.address,designation_id:infoForm.designation_id||null,department_id:infoForm.department_id||null,employment_type:infoForm.employment_type||'full_time',joining_date:infoForm.joining_date||null,contract_end_date:null,employee_code:infoForm.employee_code||null,user_id:selected.user_id});
                              if(infoForm.role_id&&Number(infoForm.role_id)!==selected.role_id) await hrApi.updateStaffRole(selected.id,Number(infoForm.role_id));
                              showFlash("success","Updated."); setEditingInfo(false); reloadSelected(selected);
                            }catch(e){showFlash("error",e.response?.data?.message||e.response?.data?.detail?.message||"Failed.");}
                          }}>Save Changes</button>
                        </div>
                      </div>
                    ) : (
                      <div className="hst-info-grid">
                        {[["Phone",selected.phone],["Employee Code",selected.employee_code],["Employment Type",EMP_LABELS[selected.employment_type]||selected.employment_type],["Joining Date",selected.joining_date],["CNIC",selected.cnic],["Date of Birth",selected.date_of_birth],["Gender",selected.gender]].map(([label,value])=>(
                          <div key={label} className="hst-info-card">
                            <div className="hst-info-label">{label.toUpperCase()}</div>
                            <div className="hst-info-value">{value||"—"}</div>
                          </div>
                        ))}
                        {selected.address&&<div className="hst-info-card-full">
                          <div className="hst-info-label">ADDRESS</div>
                          <div className="hst-info-full-value">{selected.address}</div>
                        </div>}
                      </div>
                    )}
                    {inlineMsg&&(
                      <div className="hst-inline-msg" style={{ "--msg-bg": inlineMsg.type==="error"?"var(--bg-danger-soft)":"var(--bg-success-soft)", "--msg-border": inlineMsg.type==="error"?"#fecdd3":"#bbf7d0", "--msg-color": inlineMsg.type==="error"?"#dc2626":"#166534" }}>
                        <span>{inlineMsg.type==="error"?"⚠️ ":"✅ "}{inlineMsg.msg}</span>
                        <button onClick={()=>setInlineMsg(null)} className="hst-inline-msg-close">×</button>
                      </div>
                    )}
                    {canEdit&&selected.id&&!editingInfo&&(
                      <div className="hst-status-card">
                        <div className="hst-status-card-label">CHANGE STATUS</div>
                        <div className="hst-status-card-btn-row">
                          {Object.keys(STATUS_COLORS).map(s=>(
                            <button key={s} onClick={()=>changeStatus(s)} disabled={selected.status===s}
                              className="hst-status-option-btn"
                              style={{ "--opt-bg": selected.status===s?ss(s).bg:"var(--bg-hover)", "--opt-color": selected.status===s?ss(s).color:"var(--text-secondary)",
                                "--opt-border": selected.status===s?ss(s).border:"var(--border-color)", "--opt-opacity": selected.status===s?1:0.7 }}>
                              {s.replace(/_/g," ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {canEdit&&selected.id&&selected.department_id&&!editingInfo&&(
                      <div className="hst-status-card">
                        <div className="hst-status-card-label">DEPARTMENT HEAD</div>
                        <div className="hst-hod-row">
                          <label className="hst-hod-label">
                            <input type="checkbox" checked={isHead} className="hst-hod-checkbox"
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
                          {isHead&&<span className="hst-hod-current-badge">⭐ Currently HOD</span>}
                          {hodLoading&&<span className="hst-updating-text">Updating...</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* EDUCATION */}
                {!detailLoading && detailTab==="education" && (
                  <div>
                    {/* Add/Edit Form */}
                    <div className="hst-form-card">
                      <div className="hst-form-card-title">{editEduId?"EDIT EDUCATION":"ADD EDUCATION"}</div>
                      <div className="hst-form-grid-2col">
                        {[["Degree *","degree"],["Institution *","institution"],["Field of Study","field_of_study"],["Start Year","start_year","number"],["End Year","end_year","number"]].map(([lbl,key,type])=>(
                          <div key={key}>
                            <div className="hst-field-label-sm">{lbl}</div>
                            <input type={type||"text"} className="form-input hst-form-input-sm" value={eduForm[key]||""} onChange={e=>setEduForm(p=>({...p,[key]:e.target.value}))}/>
                          </div>
                        ))}
                        <div>
                          <div className="hst-field-label-sm">Grading</div>
                          <select className="form-input hst-form-input-sm" value={eduForm.grade_type} onChange={e=>setEduForm(p=>({...p,grade_type:e.target.value,total_marks:"",awarded_marks:"",total_cgpa:"",awarded_cgpa:""}))}>
                            <option value="marks">Marks</option><option value="cgpa">CGPA</option>
                          </select>
                        </div>
                        {eduForm.grade_type==="marks"?(<>
                          <div><div className="hst-field-label-sm">Total Marks</div><input type="number" className="form-input hst-form-input-sm" value={eduForm.total_marks||""} onChange={e=>setEduForm(p=>({...p,total_marks:e.target.value}))}/></div>
                          <div><div className="hst-field-label-sm">Awarded Marks</div><input type="number" className="form-input hst-form-input-sm" value={eduForm.awarded_marks||""} onChange={e=>setEduForm(p=>({...p,awarded_marks:e.target.value}))}/></div>
                        </>):(<>
                          <div><div className="hst-field-label-sm">Total CGPA</div><input type="number" className="form-input hst-form-input-sm" value={eduForm.total_cgpa||""} onChange={e=>setEduForm(p=>({...p,total_cgpa:e.target.value}))}/></div>
                          <div><div className="hst-field-label-sm">Awarded CGPA</div><input type="number" className="form-input hst-form-input-sm" value={eduForm.awarded_cgpa||""} onChange={e=>setEduForm(p=>({...p,awarded_cgpa:e.target.value}))}/></div>
                        </>)}
                      </div>
                      <div className="hst-form-footer-row">
                        <label className="hst-checkbox-label-sm">
                          <input type="checkbox" checked={eduForm.is_current} onChange={e=>setEduForm(p=>({...p,is_current:e.target.checked}))}/>Currently studying
                        </label>
                        <div className="hst-form-btn-group">
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
                      <div className="hst-empty-state">No education records.</div>:
                      selected.education.map(e=>(
                        <div key={e.id} className="hst-record-card">
                          <div>
                            <div className="hst-record-title">{e.degree}</div>
                            <div className="hst-record-subtitle">{e.institution}</div>
                            {e.field_of_study&&<div className="hst-record-meta">{e.field_of_study}</div>}
                            <div className="hst-record-dates">
                              {e.start_year||"?"} — {e.is_current?"Present":e.end_year||"?"}
                              {e.grade_type==="marks"&&e.total_marks&&<span style={{marginLeft:8}}>· {e.awarded_marks}/{e.total_marks} Marks</span>}
                              {e.grade_type==="cgpa"&&e.total_cgpa&&<span style={{marginLeft:8}}>· {e.awarded_cgpa}/{e.total_cgpa} CGPA</span>}
                            </div>
                          </div>
                          <div className="hst-record-actions">
                            <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditEduId(e.id);setEduForm({degree:e.degree,institution:e.institution,field_of_study:e.field_of_study||"",start_year:e.start_year||"",end_year:e.end_year||"",is_current:e.is_current,grade_type:e.grade_type||"marks",total_marks:e.total_marks||"",awarded_marks:e.awarded_marks||"",total_cgpa:e.total_cgpa||"",awarded_cgpa:e.awarded_cgpa||""});}}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-sm hst-remove-btn" onClick={async()=>{await hrApi.deleteStaffEducation(selected.id,e.id);reloadSelected(selected);}}>Remove</button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* EXPERIENCE */}
                {!detailLoading && detailTab==="experience" && (
                  <div>
                    <div className="hst-form-card">
                      <div className="hst-form-card-title">{editExpId?"EDIT EXPERIENCE":"ADD EXPERIENCE"}</div>
                      <div className="hst-form-grid-2col">
                        {[["Company *","company"],["Designation *","designation"]].map(([lbl,key,type])=>(
                          <div key={key}>
                            <div className="hst-field-label-sm">{lbl}</div>
                            <input type={type||"text"} className="form-input hst-form-input-sm" value={expForm[key]||""} onChange={e=>setExpForm(p=>({...p,[key]:e.target.value}))}/>
                          </div>
                        ))}
                        <div>
                          <div className="hst-field-label-sm">From Date</div>
                          <DatePicker style={{width:"100%",fontSize:12}} value={expForm.from_date||""} onChange={val=>setExpForm(p=>({...p,from_date:val}))}/>
                        </div>
                        <div>
                          <div className="hst-field-label-sm">To Date</div>
                          <DatePicker style={{width:"100%",fontSize:12}} value={expForm.to_date||""} onChange={val=>setExpForm(p=>({...p,to_date:val}))}/>
                        </div>
                        <div className="hst-edit-field-full">
                          <div className="hst-field-label-sm">Description</div>
                          <textarea className="form-input hst-form-input-sm" rows={2} value={expForm.description||""} onChange={e=>setExpForm(p=>({...p,description:e.target.value}))}/>
                        </div>
                      </div>
                      <div className="hst-form-footer-row">
                        <label className="hst-checkbox-label-sm">
                          <input type="checkbox" checked={expForm.is_current} onChange={e=>setExpForm(p=>({...p,is_current:e.target.checked}))}/>Currently working here
                        </label>
                        <div className="hst-form-btn-group">
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
                      <div className="hst-empty-state">No experience records.</div>:
                      selected.experience.map(e=>(
                        <div key={e.id} className="hst-record-card">
                          <div>
                            <div className="hst-record-title">{e.designation}</div>
                            <div className="hst-record-subtitle">{e.company}</div>
                            <div className="hst-record-dates">{e.from_date||"?"} — {e.is_current?"Present":e.to_date||"?"}</div>
                            {e.description&&<div className="hst-record-meta" style={{marginTop:3}}>{e.description}</div>}
                          </div>
                          <div className="hst-record-actions">
                            <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setEditExpId(e.id);setExpForm({company:e.company,designation:e.designation,from_date:e.from_date||"",to_date:e.to_date||"",is_current:e.is_current,description:e.description||""});}}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-sm hst-remove-btn" onClick={async()=>{await hrApi.deleteStaffExperience(selected.id,e.id);reloadSelected(selected);}}>Remove</button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* DOCUMENTS */}
                {!detailLoading && detailTab==="documents" && selected.id && (
                  <div>
                    {canDocs&&(
                      <div className="hst-upload-card">
                        <div className="hst-upload-card-title">UPLOAD DOCUMENT</div>
                        <div className="hst-upload-grid-2col">
                          <select className="form-input" style={{fontSize:13}} value={docForm.doc_type}
                            onChange={e=>setDocForm(p=>({...p,doc_type:e.target.value}))}>
                            {DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                          <input className="form-input" placeholder="Document name *" style={{fontSize:13}}
                            value={docForm.doc_name} onChange={e=>setDocForm(p=>({...p,doc_name:e.target.value}))}/>
                        </div>
                        <div className="hst-upload-row">
                          <input type="file" className="hst-upload-file-input" onChange={e=>setDocForm(p=>({...p,file:e.target.files[0]}))}/>
                          <button className="btn btn-primary btn-sm hst-upload-btn" disabled={uploading} onClick={uploadDoc}>
                            {uploading?"Uploading...":"Upload"}
                          </button>
                        </div>
                      </div>
                    )}
                    {(!selected.documents||selected.documents.length===0)?
                      <div className="hst-empty-text">No documents.</div>:
                      selected.documents.map(doc=>(
                        <div key={doc.id} className="hst-doc-row">
                          <div>
                            <div className="hst-doc-name">{doc.doc_name}</div>
                            <div className="hst-doc-meta">{doc.doc_type} · {doc.uploaded_at}</div>
                          </div>
                          {canDocs&&<button className="btn btn-ghost btn-sm hst-remove-btn"
                            onClick={async()=>{await hrApi.deleteDocument(selected.id,doc.id);hrApi.getStaffById(selected.id).then(r=>setSelected(p=>({...p,...r.data.data}))).catch(()=>{});}}>
                            Remove</button>}
                        </div>
                      ))}
                  </div>
                )}
                {!detailLoading && detailTab==="documents" && !selected.id &&
                  <div className="hst-empty-text">No HR record — create one to manage documents.</div>}

                {/* EMERGENCY CONTACTS */}
                {!detailLoading && detailTab==="contacts" && selected.id && (
                  <div>
                    {canEdit&&(
                      <div className="hst-upload-card">
                        <div className="hst-upload-card-title">ADD EMERGENCY CONTACT</div>
                        <div className="hst-upload-grid-2col">
                          <input className="form-input" placeholder="Name *" style={{fontSize:13}} value={ecForm.name} onChange={e=>setEcForm(p=>({...p,name:e.target.value}))}/>
                          <input className="form-input" placeholder="Relationship" style={{fontSize:13}} value={ecForm.relationship} onChange={e=>setEcForm(p=>({...p,relationship:e.target.value}))}/>
                          <input className="form-input" placeholder="Phone *" style={{fontSize:13}} value={ecForm.phone} onChange={e=>setEcForm(p=>({...p,phone:e.target.value}))}/>
                          <input className="form-input" placeholder="Address" style={{fontSize:13}} value={ecForm.address} onChange={e=>setEcForm(p=>({...p,address:e.target.value}))}/>
                        </div>
                        <div className="hst-save-row">
                          <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={addEC}>Add Contact</button>
                        </div>
                      </div>
                    )}
                    {(!selected.emergency_contacts||selected.emergency_contacts.length===0)?
                      <div className="hst-empty-text">No emergency contacts.</div>:
                      selected.emergency_contacts.map(ec=>(
                        <div key={ec.id} className="hst-doc-row">
                          <div>
                            <div className="hst-ec-name">{ec.name} {ec.relationship&&<span className="hst-ec-relationship">({ec.relationship})</span>}</div>
                            <div className="hst-ec-phone">📞 {ec.phone}</div>
                            {ec.address&&<div className="hst-ec-address">{ec.address}</div>}
                          </div>
                          {canEdit&&<button className="btn btn-ghost btn-sm hst-remove-btn"
                            onClick={async()=>{await hrApi.deleteEmergencyContact(selected.id,ec.id);hrApi.getStaffById(selected.id).then(r=>setSelected(p=>({...p,...r.data.data}))).catch(()=>{});}}>
                            Remove</button>}
                        </div>
                      ))}
                  </div>
                )}

                {!detailLoading && detailTab==="salary" && payrollForm && (
                  <div className="hst-salary-card">
                    {payrollMsg && (
                      <div className="hst-salary-msg" style={{ "--msg-bg": payrollMsg.type==="success"?"#dcfce7":"#fee2e2", "--msg-color": payrollMsg.type==="success"?"#166534":"#dc2626" }}>
                        {payrollMsg.type==="success"?"\u2713 ":"\u26a0 "}{payrollMsg.text}
                      </div>
                    )}
                    <div className="hst-salary-section">
                      <label className="hst-salary-section-label">Salary Type</label>
                      <div className="hst-radio-row">
                        {[["lump_sum","Lump Sum Salary"],["structured","Structured Salary"],["hourly","Hourly Salary"],["daily_wage","Daily Wage"]].map(([val,label])=>(
                          <label key={val} className="hst-radio-label" style={{cursor:canEdit?"pointer":"default"}}>
                            <input type="radio" disabled={!canEdit} checked={payrollForm.salary_type===val}
                              onChange={()=>setPayrollForm(p=>({...p,salary_type:val}))} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {payrollForm.salary_type==="lump_sum" && (
                      <div className="hst-salary-section">
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Lump Sum Amount *</label>
                        <input type="number" step="0.01" className="form-input hst-salary-input-220" disabled={!canEdit}
                          value={payrollForm.lump_sum_amount ?? ""} onChange={e=>setPayrollForm(p=>({...p,lump_sum_amount:e.target.value}))} />
                        <div className="hst-help-text">This full amount, minus applicable deductions, is what the employee is awarded.</div>
                      </div>
                    )}

                    {payrollForm.salary_type==="structured" && (
                      <>
                        <div className="hst-salary-section">
                          <label className="hst-salary-section-label" style={{marginBottom:4}}>Grade *</label>
                          <select className="form-input hst-salary-input-260" disabled={!canEdit}
                            value={payrollForm.grade_id || ""} onChange={e=>setPayrollForm(p=>({...p,grade_id:e.target.value?Number(e.target.value):null}))}>
                            <option value="">Select grade...</option>
                            {payrollGrades.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                        {basicSalaryMode==="individual" && (
                          <div className="hst-salary-section">
                            <label className="hst-salary-section-label" style={{marginBottom:4}}>Basic Salary *</label>
                            <input type="number" step="0.01" className="form-input hst-salary-input-220" disabled={!canEdit}
                              value={payrollForm.basic_salary ?? ""} onChange={e=>setPayrollForm(p=>({...p,basic_salary:e.target.value}))} />
                          </div>
                        )}
                      </>
                    )}

                    {payrollForm.salary_type==="hourly" && (
                      <div className="hst-salary-section">
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Per Hour Rate *</label>
                        <input type="number" step="0.01" className="form-input hst-salary-input-220" disabled={!canEdit}
                          value={payrollForm.hourly_rate ?? ""} onChange={e=>setPayrollForm(p=>({...p,hourly_rate:e.target.value}))} />
                      </div>
                    )}

                    {payrollForm.salary_type==="daily_wage" && (
                      <div className="hst-salary-section">
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Daily Wage Amount *</label>
                        <input type="number" step="0.01" className="form-input hst-salary-input-220" disabled={!canEdit}
                          value={payrollForm.daily_wage_amount ?? ""} onChange={e=>setPayrollForm(p=>({...p,daily_wage_amount:e.target.value}))} />
                      </div>
                    )}

                    <div className="hst-salary-section">
                      <label className="hst-salary-section-label">Salary Transfer Mode</label>
                      <div className="hst-radio-row">
                        {[["bank_transfer","Bank Transfer"],["cash","By Hand (Cash)"],["cheque","Cheque"]].map(([val,label])=>(
                          <label key={val} className="hst-radio-label" style={{cursor:canEdit?"pointer":"default"}}>
                            <input type="radio" disabled={!canEdit} checked={payrollForm.transfer_mode===val}
                              onChange={()=>setPayrollForm(p=>({...p,transfer_mode:val}))} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="hst-save-row">
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={payrollSaving} onClick={savePayrollProfile}>
                          {payrollSaving?"Saving...":"Save Salary Profile"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!detailLoading && detailTab==="bankinfo" && bankForm && (
                  <div className="hst-salary-card">
                    <div className="hst-bank-card-title">Bank Information</div>
                    {bankMsg && (
                      <div className="hst-bank-msg" style={{ "--msg-bg": bankMsg.type==="success"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--msg-color": bankMsg.type==="success"?"#166534":"#991b1b" }}>
                        {bankMsg.text}
                      </div>
                    )}
                    <div className="hst-bank-grid">
                      <div>
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Bank Name</label>
                        <input className="form-input" style={{fontSize:13}} disabled={!canEdit}
                          value={bankForm.bank_name ?? ""} onChange={e=>setBankForm(p=>({...p,bank_name:e.target.value}))} />
                      </div>
                      <div>
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Account Title</label>
                        <input className="form-input" style={{fontSize:13}} disabled={!canEdit}
                          value={bankForm.account_title ?? ""} onChange={e=>setBankForm(p=>({...p,account_title:e.target.value}))} />
                      </div>
                      <div>
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Account Number</label>
                        <input className="form-input" style={{fontSize:13}} disabled={!canEdit}
                          value={bankForm.account_number ?? ""} onChange={e=>setBankForm(p=>({...p,account_number:e.target.value}))} />
                      </div>
                      <div>
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>IBAN</label>
                        <input className="form-input" style={{fontSize:13}} disabled={!canEdit}
                          value={bankForm.iban ?? ""} onChange={e=>setBankForm(p=>({...p,iban:e.target.value}))} />
                      </div>
                      <div>
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Branch Name</label>
                        <input className="form-input" style={{fontSize:13}} disabled={!canEdit}
                          value={bankForm.branch_name ?? ""} onChange={e=>setBankForm(p=>({...p,branch_name:e.target.value}))} />
                      </div>
                      <div>
                        <label className="hst-salary-section-label" style={{marginBottom:4}}>Branch Code</label>
                        <input className="form-input" style={{fontSize:13}} disabled={!canEdit}
                          value={bankForm.branch_code ?? ""} onChange={e=>setBankForm(p=>({...p,branch_code:e.target.value}))} />
                      </div>
                    </div>
                    {canEdit && (
                      <div className="hst-save-row">
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={bankSaving} onClick={saveBankInfo}>
                          {bankSaving?"Saving...":"Save Bank Information"}
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
        <div className="hst-modal-overlay">
          <div className="hst-modal-box">
            <div className="hst-modal-header">
              <div className="hst-modal-title">Add New Staff Member</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Close</button>
            </div>
            <div className="hst-modal-body">
              <div className="hst-modal-grid-2col">
                <div>
                  <label className="hst-edit-field-label">First Name *</label>
                  <input className="form-input hst-edit-input" style={{fontSize:13}} value={form.first_name} onChange={e=>setForm(p=>({...p,first_name:e.target.value}))}/>
                </div>
                <div>
                  <label className="hst-edit-field-label">Last Name *</label>
                  <input className="form-input hst-edit-input" style={{fontSize:13}} value={form.last_name} onChange={e=>setForm(p=>({...p,last_name:e.target.value}))}/>
                </div>
                <div>
                  <label className="hst-edit-field-label">Email *</label>
                  <input type="email" className="form-input hst-edit-input" style={{fontSize:13}} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
                </div>
                <div>
                  <label className="hst-edit-field-label">Password</label>
                  <input className="form-input hst-edit-input" style={{fontSize:13}} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}/>
                </div>
                <div>
                  <label className="hst-edit-field-label">Phone</label>
                  <input className="form-input hst-edit-input" style={{fontSize:13}} value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/>
                </div>
                <div>
                  <label className="hst-edit-field-label">Employee Code</label>
                  <input className="form-input hst-disabled-input" disabled placeholder="Will be auto-generated" value=""/>
                </div>
                <div>
                  <label className="hst-edit-field-label">Gender</label>
                  <select className="form-input hst-edit-input" style={{fontSize:13}} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="hst-edit-field-label">Date of Birth</label>
                  <DatePicker style={{width:"100%",fontSize:13}} value={form.date_of_birth} onChange={val=>setForm(p=>({...p,date_of_birth:val}))}/>
                </div>
                <div className="hst-dept-role-card">
                  <div className="hst-dept-role-title">DEPARTMENT & ROLE</div>
                  <div className="hst-dept-role-grid-3col">
                    <div>
                      <label className="hst-edit-field-label">Department</label>
                      <select className="form-input hst-edit-input" style={{fontSize:13}} value={form.department_id} onChange={e=>onFormDeptChange(e.target.value)}>
                        <option value="">Select...</option>
                        {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="hst-edit-field-label">Role *</label>
                      <select className="form-input hst-edit-input" style={{fontSize:13}} value={form.role_id} onChange={e=>setForm(p=>({...p,role_id:e.target.value}))}>
                        <option value="">Select role...</option>
                        {(form.department_id ? formRoles : allRoles).map(r=>(
                          <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="hst-edit-field-label">Designation</label>
                      <select className="form-input hst-edit-input" style={{fontSize:13}} value={form.designation_id} onChange={e=>setForm(p=>({...p,designation_id:e.target.value}))}>
                        <option value="">Select...</option>
                        {(form.department_id ? formDesig : designations).map(d=>(
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="hst-edit-field-label">Employment Type</label>
                  <select className="form-input hst-edit-input" style={{fontSize:13}} value={form.employment_type} onChange={e=>setForm(p=>({...p,employment_type:e.target.value}))}>
                    {EMP_TYPES.map(t=><option key={t} value={t}>{EMP_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="hst-edit-field-label">Joining Date</label>
                  <DatePicker style={{width:"100%",fontSize:13}} value={form.joining_date} onChange={val=>setForm(p=>({...p,joining_date:val}))}/>
                </div>
                <div className="hst-modal-full-field">
                  <label className="hst-checkbox-label-sm" style={{fontSize:13}}>
                    <input type="checkbox" checked={form.is_probationary} onChange={e=>setForm(p=>({...p,is_probationary:e.target.checked}))}/>
                    Subject to Probation Period
                  </label>
                  <div className="hst-probation-help">
                    Uncheck to treat this employee as regular from day one (no probation restrictions will apply, regardless of joining date).
                  </div>
                </div>
              </div>
              <div className="hst-modal-footer">
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
      {flash&&<div className="hst-flash-toast" style={{ "--flash-bg": flash.type==="success"?"#dcfce7":"#fee2e2", "--flash-color": flash.type==="success"?"#166534":"#dc2626" }}>{flash.msg}</div>}
    </div>
  );
}
