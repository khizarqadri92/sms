import React, { useState, useEffect } from "react";
import hrApi from "../api/hrApi";
import authApi from "../api/authApi";
import { useAuth } from "../auth/AuthContext";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./MyProfile.css";

const TABS = ["personal","education","experience","documents","contacts","security"];
const TAB_LABELS = { personal:"Personal Info", education:"Education", experience:"Experience", documents:"Documents", contacts:"Emergency Contacts", security:"Security" };
const DOC_TYPES = ["CV/Resume","Degree Certificate","Transcript","Experience Letter","CNIC Copy","Police Clearance","Medical Certificate","Other"];

const EMPTY_EDU = {degree:"",institution:"",field_of_study:"",start_year:"",end_year:"",is_current:false,grade_type:"marks",total_marks:"",awarded_marks:"",total_cgpa:"",awarded_cgpa:""};
const EMPTY_EXP = {company:"",designation:"",from_date:"",to_date:"",is_current:false,description:""};

export default function MyProfile() {
  const { formatDate } = useRegionalSettings();
  const { user } = useAuth();
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("personal");
  const [flash, setFlash]         = useState(null);
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(false);

  const [personalForm, setPersonalForm] = useState({first_name:"",last_name:"",gender:"",date_of_birth:"",cnic:"",phone:"",address:""});
  const [eduForm, setEduForm]     = useState(EMPTY_EDU);
  const [editEduId, setEditEduId] = useState(null);
  const [expForm, setExpForm]     = useState(EMPTY_EXP);
  const [editExpId, setEditExpId] = useState(null);
  const [docForm, setDocForm]     = useState({doc_type:"CV/Resume",doc_name:"",file:null});
  const [ecForm, setEcForm]       = useState({name:"",relationship:"",phone:"",address:""});
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl]   = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [hodInfo, setHodInfo]     = useState(null);
  const [hodDebug, setHodDebug]   = useState(null);

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),4000); };

  const load = () => {
    setLoading(true);
    hrApi.getMyProfile().then(r => {
      const p = r.data.data;
      setProfile(p);
      setPersonalForm({first_name:p.first_name||"",last_name:p.last_name||"",gender:p.gender||"",date_of_birth:p.date_of_birth||"",cnic:p.cnic||"",phone:p.phone||"",address:p.address||""});
      if(p?.id){
        hrApi.checkIsHead(p.id).then(hr=>{
          const d = hr.data?.data;
          setHodInfo(d?.is_head ? {is_head:true, department_name: d?.department?.department_name || p.department_name} : {is_head:false});
        }).catch(()=>setHodInfo(null));
      }
    }).catch(()=>{}).finally(()=>setLoading(false));
    hrApi.getMyPhoto().then(r=>setPhotoUrl(r.data.data?.photo_url)).catch(()=>{});
  };
  useEffect(()=>{ load(); },[]);

  const savePersonal = async () => {
    if(!personalForm.first_name||!personalForm.last_name){showFlash("error","Name required.");return;}
    setSaving(true);
    try{ await hrApi.updateMyPersonal(personalForm); showFlash("success","Profile updated."); setEditing(false); load(); }
    catch(e){ showFlash("error","Failed."); }
    finally{ setSaving(false); }
  };

  const saveEdu = async () => {
    if(!eduForm.degree||!eduForm.institution){showFlash("error","Degree and institution required.");return;}
    const payload = {...eduForm,
      start_year:eduForm.start_year||null, end_year:eduForm.end_year||null,
      total_marks:eduForm.total_marks||null, awarded_marks:eduForm.awarded_marks||null,
      total_cgpa:eduForm.total_cgpa||null, awarded_cgpa:eduForm.awarded_cgpa||null};
    try{
      if(editEduId){ await hrApi.updateEducation(editEduId, payload); showFlash("success","Updated."); }
      else { await hrApi.addEducation(payload); showFlash("success","Added."); }
      setEduForm(EMPTY_EDU); setEditEduId(null); load();
    }catch(e){ showFlash("error","Failed."); }
  };

  const saveExp = async () => {
    if(!expForm.company||!expForm.designation){showFlash("error","Company and designation required.");return;}
    const payload = {...expForm, from_date:expForm.from_date||null, to_date:expForm.to_date||null};
    try{
      if(editExpId){ await hrApi.updateExperience(editExpId, payload); showFlash("success","Updated."); }
      else { await hrApi.addExperience(payload); showFlash("success","Added."); }
      setExpForm(EMPTY_EXP); setEditExpId(null); load();
    }catch(e){ showFlash("error","Failed."); }
  };

  const uploadDoc = async () => {
    if(!docForm.doc_name||!docForm.file){showFlash("error","Name and file required.");return;}
    setUploading(true);
    try{
      const fd = new FormData();
      fd.append("doc_type",docForm.doc_type); fd.append("doc_name",docForm.doc_name); fd.append("file",docForm.file);
      await hrApi.uploadMyDocument(fd); showFlash("success","Uploaded.");
      setDocForm({doc_type:"CV/Resume",doc_name:"",file:null}); load();
    }catch(e){ showFlash("error","Failed."); }
    finally{ setUploading(false); }
  };

  const addEC = async () => {
    if(!ecForm.name||!ecForm.phone){showFlash("error","Name and phone required.");return;}
    try{ await hrApi.addMyEmergencyContact(ecForm); showFlash("success","Added."); setEcForm({name:"",relationship:"",phone:"",address:""}); load(); }
    catch(e){ showFlash("error","Failed."); }
  };

  const inp = (label, key, form, setForm, type="text", opts=null) => (
    <div key={key}>
      <label className="mp-field-label">{label}</label>
      {opts ? (
        <select className="form-input mp-field-input" value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}>
          {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : type === "date" ? (
        <DatePicker style={{width:"100%",fontSize:13}} value={form[key]||""} onChange={val=>setForm(p=>({...p,[key]:val}))}/>
      ) : (
        <input type={type} className="form-input mp-field-input" value={form[key]||""} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/>
      )}
    </div>
  );

  const infoBox = (label, value) => (
    <div className="mp-info-box">
      <div className="mp-info-label">{label}</div>
      <div className="mp-info-value">{value||"—"}</div>
    </div>
  );

  const formBox = (title, children, onSave, onCancel, isEditing, saveLbl="Save") => (
    <div className="mp-form-box">
      <div className="mp-form-title">{title}</div>
      <div className="mp-form-grid">{children}</div>
      <div className="mp-btn-row">
        {isEditing && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary btn-sm mp-btn-white" onClick={onSave}>{saveLbl}</button>
      </div>
    </div>
  );

  if(loading) return <div className="mp-loading">Loading profile...</div>;

  return (
    <div className="mp-page">
      {/* Header Card */}
      <div className="mp-header-card">
        <div className="mp-header-left">
          <div className="mp-avatar-wrap">
            {photoUrl ?
              <img src={"http://localhost:5000"+photoUrl} alt="Profile" className="mp-avatar-img"/>
              : <div className="mp-avatar-fallback">
                  {(profile?.first_name||"?")[0]?.toUpperCase()}
                </div>}
            <label className="mp-photo-upload-btn"
              title="Change photo">
              {photoUploading?"⏳":"📷"}
              <input type="file" accept="image/*" className="mp-hidden-input" onChange={async e=>{
                const f=e.target.files[0]; if(!f) return;
                setPhotoUploading(true);
                try{ const fd=new FormData(); fd.append("file",f);
                  const r=await hrApi.uploadMyPhoto(fd);
                  setPhotoUrl(r.data.data.photo_url); showFlash("success","Photo updated.");
                }catch(err){showFlash("error","Photo upload failed.");}
                finally{setPhotoUploading(false);}
              }}/>
            </label>
          </div>
          <div>
            <h1 className="mp-name-heading">
              {profile?.first_name} {profile?.last_name}
              {hodInfo?.is_head && (
                <span className="mp-hod-badge">
                  ⭐ HOD{hodInfo?.department_name?" · "+hodInfo.department_name:""}
                </span>
              )}
            </h1>
            <div className="mp-designation">{profile?.designation_name||"—"} {profile?.department_name?"· "+profile.department_name:""}</div>
            <div className="mp-email-text">{profile?.email}{profile?.employee_code?" · #"+profile.employee_code:""}</div>
          </div>
        </div>
        <div className="mp-status-wrap">
          <span className="mp-status-badge">
            {(profile?.status||"active").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
          </span>
          <div className="mp-joined-text">Joined: {profile?.joining_date?formatDate(profile.joining_date):"—"}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mp-tabs-container">
        <div className="mp-tabs-row">
          {TABS.map(t=>(
            <button key={t} onClick={()=>{setTab(t);setEditEduId(null);setEditExpId(null);setEditing(false);}}
              className="mp-tab-btn" style={{ "--tab-border": tab===t?"2px solid #2563eb":"2px solid transparent", "--tab-color": tab===t?"#2563eb":"var(--text-secondary)" }}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="mp-tab-content">
          {/* PERSONAL */}
          {tab==="personal" && (
            editing ? (
              <div>
                <div className="mp-grid">
                  {inp("First Name *","first_name",personalForm,setPersonalForm)}
                  {inp("Last Name *","last_name",personalForm,setPersonalForm)}
                  {inp("Gender","gender",personalForm,setPersonalForm,"text",[{v:"",l:"Select..."},{v:"male",l:"Male"},{v:"female",l:"Female"},{v:"other",l:"Other"}])}
                  {inp("Date of Birth","date_of_birth",personalForm,setPersonalForm,"date")}
                  {inp("CNIC","cnic",personalForm,setPersonalForm)}
                  {inp("Phone","phone",personalForm,setPersonalForm)}
                  <div className="mp-full-field">
                    <label className="mp-field-label">Address</label>
                    <textarea className="form-input mp-textarea-full" rows={2} value={personalForm.address} onChange={e=>setPersonalForm(p=>({...p,address:e.target.value}))}/>
                  </div>
                </div>
                <div className="mp-btn-row-end">
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm mp-btn-white" disabled={saving} onClick={savePersonal}>{saving?"Saving...":"Save Changes"}</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mp-edit-row">
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(true)}>✏️ Edit Profile</button>
                </div>
                <div className="mp-info-grid">
                  {infoBox("First Name",profile?.first_name)}
                  {infoBox("Last Name",profile?.last_name)}
                  {infoBox("Gender",profile?.gender)}
                  {infoBox("Date of Birth",profile?.date_of_birth?formatDate(profile.date_of_birth):"")}
                  {infoBox("CNIC",profile?.cnic)}
                  {infoBox("Phone",profile?.phone)}
                  {infoBox("Email",profile?.email)}
                  {infoBox("Employee Code",profile?.employee_code?"#"+profile.employee_code:"—")}
                  {infoBox("Employment Type",profile?.employment_type?.replace(/_/g," "))}
                  {infoBox("Joining Date",profile?.joining_date?formatDate(profile.joining_date):"")}
                  {profile?.address&&<div className="mp-full-field">{infoBox("Address",profile.address)}</div>}
                </div>
              </div>
            )
          )}

          {/* EDUCATION */}
          {tab==="education" && (
            <div>
              {formBox(
                editEduId ? "EDIT EDUCATION" : "ADD EDUCATION",
                <>
                  {inp("Degree/Certificate *","degree",eduForm,setEduForm)}
                  {inp("Institution *","institution",eduForm,setEduForm)}
                  {inp("Field of Study","field_of_study",eduForm,setEduForm)}
                  {inp("Start Year","start_year",eduForm,setEduForm,"number")}
                  {inp("End Year","end_year",eduForm,setEduForm,"number")}
                  <div className="mp-full-field">
                    <label className="mp-field-label">Grading Type</label>
                    <div className="mp-radio-row">
                      {["marks","cgpa"].map(gt=>(
                        <label key={gt} className="mp-radio-label">
                          <input type="radio" name="grade_type" value={gt} checked={eduForm.grade_type===gt}
                            onChange={e=>setEduForm(p=>({...p,grade_type:gt,total_marks:"",awarded_marks:"",total_cgpa:"",awarded_cgpa:""}))}/>
                          {gt==="marks"?"Marks":"CGPA"}
                        </label>
                      ))}
                    </div>
                  </div>
                  {eduForm.grade_type==="marks" ? (<>
                    {inp("Total Marks","total_marks",eduForm,setEduForm,"number")}
                    {inp("Awarded Marks","awarded_marks",eduForm,setEduForm,"number")}
                  </>) : (<>
                    {inp("Total CGPA","total_cgpa",eduForm,setEduForm,"number")}
                    {inp("Awarded CGPA","awarded_cgpa",eduForm,setEduForm,"number")}
                  </>)}
                  <div className="mp-full-field">
                    <label className="mp-radio-label">
                      <input type="checkbox" checked={eduForm.is_current} onChange={e=>setEduForm(p=>({...p,is_current:e.target.checked}))}/>
                      Currently studying here
                    </label>
                  </div>
                </>,
                saveEdu,
                ()=>{setEditEduId(null);setEduForm(EMPTY_EDU);},
                !!editEduId, editEduId?"Update":"Add Education"
              )}
              {(!profile?.education||profile.education.length===0)?
                <div className="mp-no-records">No education records yet.</div>:
                profile.education.map(e=>(
                  <div key={e.id} className="mp-list-item">
                    <div className="mp-list-item-content">
                      <div className="mp-list-item-title">{e.degree}</div>
                      <div className="mp-list-item-subtitle">{e.institution}</div>
                      {e.field_of_study&&<div className="mp-list-item-desc-mt0">{e.field_of_study}</div>}
                      <div className="mp-list-item-meta">
                        {e.start_year||"?"} — {e.is_current?"Present":e.end_year||"?"}
                        {e.grade_type==="marks"&&e.total_marks&&<span className="mp-list-item-meta-span">· {e.awarded_marks}/{e.total_marks} Marks</span>}
                        {e.grade_type==="cgpa"&&e.total_cgpa&&<span className="mp-list-item-meta-span">· {e.awarded_cgpa}/{e.total_cgpa} CGPA</span>}
                      </div>
                    </div>
                    <div className="mp-list-item-actions">
                      <button className="btn btn-ghost btn-sm mp-edit-btn"
                        onClick={()=>{ setEditEduId(e.id); setEduForm({degree:e.degree,institution:e.institution,field_of_study:e.field_of_study||"",start_year:e.start_year||"",end_year:e.end_year||"",is_current:e.is_current,grade_type:e.grade_type||"marks",total_marks:e.total_marks||"",awarded_marks:e.awarded_marks||"",total_cgpa:e.total_cgpa||"",awarded_cgpa:e.awarded_cgpa||""}); window.scrollTo(0,0); }}>
                        ✏️ Edit
                      </button>
                      <button className="btn btn-ghost btn-sm mp-delete-btn"
                        onClick={async()=>{ await hrApi.deleteEducation(e.id); load(); }}>Remove</button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* EXPERIENCE */}
          {tab==="experience" && (
            <div>
              {formBox(
                editExpId ? "EDIT EXPERIENCE" : "ADD EXPERIENCE",
                <>
                  {inp("Company/Organization *","company",expForm,setExpForm)}
                  {inp("Designation/Title *","designation",expForm,setExpForm)}
                  {inp("From Date","from_date",expForm,setExpForm,"date")}
                  {inp("To Date","to_date",expForm,setExpForm,"date")}
                  <div className="mp-full-field">
                    <label className="mp-checkbox-label-mb8">
                      <input type="checkbox" checked={expForm.is_current} onChange={e=>setExpForm(p=>({...p,is_current:e.target.checked}))}/>
                      Currently working here
                    </label>
                    <label className="mp-field-label">Description / Responsibilities</label>
                    <textarea className="form-input mp-textarea-full" rows={2} value={expForm.description||""} onChange={e=>setExpForm(p=>({...p,description:e.target.value}))}/>
                  </div>
                </>,
                saveExp,
                ()=>{setEditExpId(null);setExpForm(EMPTY_EXP);},
                !!editExpId, editExpId?"Update":"Add Experience"
              )}
              {(!profile?.experience||profile.experience.length===0)?
                <div className="mp-no-records">No experience records yet.</div>:
                profile.experience.map(e=>(
                  <div key={e.id} className="mp-list-item">
                    <div className="mp-list-item-content">
                      <div className="mp-list-item-title">{e.designation}</div>
                      <div className="mp-list-item-subtitle-mt0">{e.company}</div>
                      <div className="mp-list-item-meta">{e.from_date?formatDate(e.from_date):"?"} — {e.is_current?"Present":(e.to_date?formatDate(e.to_date):"?")}</div>
                      {e.description&&<div className="mp-list-item-desc">{e.description}</div>}
                    </div>
                    <div className="mp-list-item-actions">
                      <button className="btn btn-ghost btn-sm mp-edit-btn"
                        onClick={()=>{ setEditExpId(e.id); setExpForm({company:e.company,designation:e.designation,from_date:e.from_date||"",to_date:e.to_date||"",is_current:e.is_current,description:e.description||""}); window.scrollTo(0,0); }}>
                        ✏️ Edit
                      </button>
                      <button className="btn btn-ghost btn-sm mp-delete-btn"
                        onClick={async()=>{ await hrApi.deleteExperience(e.id); load(); }}>Remove</button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* DOCUMENTS */}
          {tab==="documents" && (
            <div>
              <div className="mp-form-box">
                <div className="mp-form-title">UPLOAD DOCUMENT</div>
                <div className="mp-form-grid">
                  <div>
                    <label className="mp-field-label">Document Type</label>
                    <select className="form-input mp-field-input" value={docForm.doc_type} onChange={e=>setDocForm(p=>({...p,doc_type:e.target.value}))}>
                      {DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mp-field-label">Document Name *</label>
                    <input className="form-input mp-field-input" placeholder="e.g. BSc Degree Certificate" value={docForm.doc_name} onChange={e=>setDocForm(p=>({...p,doc_name:e.target.value}))}/>
                  </div>
                </div>
                <div className="mp-2fa-code-row">
                  <input type="file" className="mp-doc-file-input" onChange={e=>setDocForm(p=>({...p,file:e.target.files[0]}))}/>
                  <button className="btn btn-primary btn-sm mp-btn-white mp-btn-nowrap" disabled={uploading} onClick={uploadDoc}>
                    {uploading?"Uploading...":"Upload"}
                  </button>
                </div>
              </div>
              {(!profile?.documents||profile.documents.length===0)?
                <div className="mp-no-records">No documents uploaded.</div>:
                profile.documents.map(doc=>(
                  <div key={doc.id} className="mp-list-item-flat">
                    <div>
                      <div className="mp-doc-name">📄 {doc.doc_name}</div>
                      <div className="mp-doc-meta">{doc.doc_type} · {doc.uploaded_at}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm mp-delete-btn"
                      onClick={async()=>{ await hrApi.deleteMyDocument(doc.id); load(); }}>Remove</button>
                  </div>
                ))}
            </div>
          )}

          {/* EMERGENCY CONTACTS */}
          {tab==="contacts" && (
            <div>
              <div className="mp-form-box">
                <div className="mp-form-title">ADD EMERGENCY CONTACT</div>
                <div className="mp-form-grid">
                  {inp("Name *","name",ecForm,setEcForm)}
                  {inp("Relationship","relationship",ecForm,setEcForm)}
                  {inp("Phone *","phone",ecForm,setEcForm)}
                  {inp("Address","address",ecForm,setEcForm)}
                </div>
                <div className="mp-edit-row-mb0">
                  <button className="btn btn-primary btn-sm mp-btn-white" onClick={addEC}>Add Contact</button>
                </div>
              </div>
              {(!profile?.emergency_contacts||profile.emergency_contacts.length===0)?
                <div className="mp-no-records">No emergency contacts.</div>:
                profile.emergency_contacts.map(ec=>(
                  <div key={ec.id} className="mp-list-item-flat">
                    <div>
                      <div className="mp-contact-name">{ec.name}{ec.relationship&&<span className="mp-contact-relationship">({ec.relationship})</span>}</div>
                      <div className="mp-contact-phone">📞 {ec.phone}</div>
                      {ec.address&&<div className="mp-contact-address">{ec.address}</div>}
                    </div>
                    <button className="btn btn-ghost btn-sm mp-delete-btn"
                      onClick={async()=>{ await hrApi.deleteMyEmergencyContact(ec.id); load(); }}>Remove</button>
                  </div>
                ))}
            </div>
          )}

          {/* SECURITY */}
          {tab==="security" && <TwoFactorSection showFlash={showFlash} />}
        </div>
      </div>

      {flash&&<div className="mp-flash-toast" style={{ "--flash-bg": flash.type==="success"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--flash-color": flash.type==="success"?"#166534":"#dc2626" }}>{flash.msg}</div>}
    </div>
  );
}

function TwoFactorSection({ showFlash }) {
  const [status, setStatus]   = useState(null); // { totp_enabled }
  const [loading, setLoading] = useState(true);
  const [stage, setStage]     = useState("idle"); // idle | setup | confirm | disable
  const [qr, setQr]           = useState(null);
  const [secret, setSecret]   = useState("");
  const [code, setCode]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]       = useState(false);

  const load = () => {
    setLoading(true);
    authApi.get2FAStatus().then(r => setStatus(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const r = await authApi.setup2FA();
      setQr(r.data.data.qr_code);
      setSecret(r.data.data.secret);
      setCode("");
      setStage("confirm");
    } catch { showFlash("error", "Failed to start 2FA setup."); }
    finally { setBusy(false); }
  };

  const confirmSetup = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await authApi.confirm2FASetup(code);
      showFlash("success", "Two-factor authentication enabled.");
      setStage("idle"); setQr(null); setSecret(""); setCode("");
      load();
    } catch (e) { showFlash("error", e.response?.data?.message || "Invalid or expired code."); }
    finally { setBusy(false); }
  };

  const confirmDisable = async () => {
    if (!password) return;
    setBusy(true);
    try {
      await authApi.disable2FA(password);
      showFlash("success", "Two-factor authentication disabled.");
      setStage("idle"); setPassword("");
      load();
    } catch (e) { showFlash("error", e.response?.data?.message || "Incorrect password."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="mp-no-records">Loading...</div>;

  return (
    <div>
      <div className="mp-2fa-wrap">
        <div className="mp-2fa-header-row">
          <div>
            <div className="mp-2fa-title">Two-Factor Authentication</div>
            <div className="mp-2fa-desc">
              Adds an extra verification step at login using a code from an authenticator app (e.g. Google Authenticator, Authy).
            </div>
          </div>
          <span className="mp-2fa-status-badge" style={{ "--status-bg": status?.totp_enabled ? "var(--bg-success-soft)" : "var(--bg-hover)", "--status-color": status?.totp_enabled ? "#166534" : "var(--text-secondary)" }}>
            {status?.totp_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {stage === "idle" && (
          <div className="mp-2fa-idle">
            {status?.totp_enabled ? (
              <button className="btn btn-danger btn-sm" onClick={() => setStage("disable")}>Disable Two-Factor Authentication</button>
            ) : (
              <button className="btn btn-primary btn-sm mp-btn-white" disabled={busy} onClick={startSetup}>
                {busy ? "Starting..." : "Enable Two-Factor Authentication"}
              </button>
            )}
          </div>
        )}

        {stage === "confirm" && (
          <div className="mp-2fa-stage-box">
            <div className="mp-2fa-step-label">1. Scan this QR code with your authenticator app</div>
            {qr && <img src={qr} alt="2FA QR code" className="mp-2fa-qr-img" />}
            <div className="mp-2fa-secret-text">
              Can't scan? Enter this code manually: <code className="mp-2fa-secret-code">{secret}</code>
            </div>
            <div className="mp-2fa-step-label-mb8">2. Enter the 6-digit code from the app</div>
            <div className="mp-2fa-code-row">
              <input className="form-control mp-2fa-code-input" type="text" inputMode="numeric" maxLength={6}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g,""))} placeholder="000000" autoFocus />
              <button className="btn btn-primary btn-sm mp-btn-white" disabled={busy || code.length !== 6} onClick={confirmSetup}>
                {busy ? "Verifying..." : "Verify & Enable"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setStage("idle"); setQr(null); setCode(""); }}>Cancel</button>
            </div>
          </div>
        )}

        {stage === "disable" && (
          <div className="mp-2fa-stage-box">
            <div className="mp-2fa-step-label-mb8">Enter your password to confirm</div>
            <div className="mp-2fa-code-row">
              <input className="form-control mp-2fa-password-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoFocus />
              <button className="btn btn-danger btn-sm" disabled={busy || !password} onClick={confirmDisable}>
                {busy ? "Disabling..." : "Disable"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setStage("idle"); setPassword(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
