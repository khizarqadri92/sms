import React, { useState, useEffect } from "react";
import hrApi from "../api/hrApi";
import { useAuth } from "../auth/AuthContext";

const TABS = ["personal","education","experience","documents","contacts"];
const TAB_LABELS = { personal:"Personal Info", education:"Education", experience:"Experience", documents:"Documents", contacts:"Emergency Contacts" };
const DOC_TYPES = ["CV/Resume","Degree Certificate","Transcript","Experience Letter","CNIC Copy","Police Clearance","Medical Certificate","Other"];

const EMPTY_EDU = {degree:"",institution:"",field_of_study:"",start_year:"",end_year:"",is_current:false,grade_type:"marks",total_marks:"",awarded_marks:"",total_cgpa:"",awarded_cgpa:""};
const EMPTY_EXP = {company:"",designation:"",from_date:"",to_date:"",is_current:false,description:""};

export default function MyProfile() {
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
      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>{label}</label>
      {opts ? (
        <select className="form-input" style={{width:"100%",fontSize:13}} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}>
          {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : (
        <input type={type} className="form-input" style={{width:"100%",fontSize:13}} value={form[key]||""} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/>
      )}
    </div>
  );

  const infoBox = (label, value) => (
    <div style={{background:"#f8fafc",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0"}}>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600,letterSpacing:"0.05em"}}>{label}</div>
      <div style={{fontSize:14,color:"#0f172a",marginTop:3,fontWeight:500}}>{value||"—"}</div>
    </div>
  );

  const formBox = (title, children, onSave, onCancel, isEditing, saveLbl="Save") => (
    <div style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:16,marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#334155"}}>{title}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>{children}</div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        {isEditing && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={onSave}>{saveLbl}</button>
      </div>
    </div>
  );

  if(loading) return <div style={{padding:60,textAlign:"center",color:"#64748b"}}>Loading profile...</div>;

  return (
    <div style={{maxWidth:860,margin:"0 auto",padding:24}}>
      {/* Header Card */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:24,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <div style={{position:"relative",flexShrink:0}}>
            {photoUrl ?
              <img src={"http://localhost:5000"+photoUrl} alt="Profile" style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:"2px solid #e2e8f0"}}/>
              : <div style={{width:64,height:64,borderRadius:"50%",background:"#2563eb",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700}}>
                  {(profile?.first_name||"?")[0]?.toUpperCase()}
                </div>}
            <label style={{position:"absolute",bottom:0,right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}
              title="Change photo">
              {photoUploading?"⏳":"📷"}
              <input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{
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
            <h1 style={{margin:0,fontSize:20,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
              {profile?.first_name} {profile?.last_name}
              {hodInfo?.is_head && (
                <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a",whiteSpace:"nowrap"}}>
                  ⭐ HOD{hodInfo?.department_name?" · "+hodInfo.department_name:""}
                </span>
              )}
            </h1>
            <div style={{fontSize:13,color:"#64748b",marginTop:2}}>{profile?.designation_name||"—"} {profile?.department_name?"· "+profile.department_name:""}</div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{profile?.email}{profile?.employee_code?" · #"+profile.employee_code:""}</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <span style={{padding:"4px 12px",background:"#f0fdf4",color:"#166534",border:"1px solid #bbf7d0",borderRadius:10,fontSize:12,fontWeight:600}}>
            {(profile?.status||"active").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
          </span>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>Joined: {profile?.joining_date||"—"}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{display:"flex",borderBottom:"1px solid #e2e8f0",overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>{setTab(t);setEditEduId(null);setEditExpId(null);setEditing(false);}}
              style={{padding:"12px 18px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"transparent",whiteSpace:"nowrap",
                borderBottom:tab===t?"2px solid #2563eb":"2px solid transparent",color:tab===t?"#2563eb":"#64748b"}}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div style={{padding:20}}>
          {/* PERSONAL */}
          {tab==="personal" && (
            editing ? (
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  {inp("First Name *","first_name",personalForm,setPersonalForm)}
                  {inp("Last Name *","last_name",personalForm,setPersonalForm)}
                  {inp("Gender","gender",personalForm,setPersonalForm,"text",[{v:"",l:"Select..."},{v:"male",l:"Male"},{v:"female",l:"Female"},{v:"other",l:"Other"}])}
                  {inp("Date of Birth","date_of_birth",personalForm,setPersonalForm,"date")}
                  {inp("CNIC","cnic",personalForm,setPersonalForm)}
                  {inp("Phone","phone",personalForm,setPersonalForm)}
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Address</label>
                    <textarea className="form-input" rows={2} style={{width:"100%",fontSize:13}} value={personalForm.address} onChange={e=>setPersonalForm(p=>({...p,address:e.target.value}))}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={saving} onClick={savePersonal}>{saving?"Saving...":"Save Changes"}</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(true)}>✏️ Edit Profile</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {infoBox("First Name",profile?.first_name)}
                  {infoBox("Last Name",profile?.last_name)}
                  {infoBox("Gender",profile?.gender)}
                  {infoBox("Date of Birth",profile?.date_of_birth)}
                  {infoBox("CNIC",profile?.cnic)}
                  {infoBox("Phone",profile?.phone)}
                  {infoBox("Email",profile?.email)}
                  {infoBox("Employee Code",profile?.employee_code?"#"+profile.employee_code:"—")}
                  {infoBox("Employment Type",profile?.employment_type?.replace(/_/g," "))}
                  {infoBox("Joining Date",profile?.joining_date)}
                  {profile?.address&&<div style={{gridColumn:"1/-1"}}>{infoBox("Address",profile.address)}</div>}
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
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:6}}>Grading Type</label>
                    <div style={{display:"flex",gap:12}}>
                      {["marks","cgpa"].map(gt=>(
                        <label key={gt} style={{fontSize:13,display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}>
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
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:13,display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}>
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
                <div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No education records yet.</div>:
                profile.education.map(e=>(
                  <div key={e.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14}}>{e.degree}</div>
                      <div style={{fontSize:13,color:"#475569",marginTop:2}}>{e.institution}</div>
                      {e.field_of_study&&<div style={{fontSize:12,color:"#64748b"}}>{e.field_of_study}</div>}
                      <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>
                        {e.start_year||"?"} — {e.is_current?"Present":e.end_year||"?"}
                        {e.grade_type==="marks"&&e.total_marks&&<span style={{marginLeft:8}}>· {e.awarded_marks}/{e.total_marks} Marks</span>}
                        {e.grade_type==="cgpa"&&e.total_cgpa&&<span style={{marginLeft:8}}>· {e.awarded_cgpa}/{e.total_cgpa} CGPA</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:12}}
                        onClick={()=>{ setEditEduId(e.id); setEduForm({degree:e.degree,institution:e.institution,field_of_study:e.field_of_study||"",start_year:e.start_year||"",end_year:e.end_year||"",is_current:e.is_current,grade_type:e.grade_type||"marks",total_marks:e.total_marks||"",awarded_marks:e.awarded_marks||"",total_cgpa:e.total_cgpa||"",awarded_cgpa:e.awarded_cgpa||""}); window.scrollTo(0,0); }}>
                        ✏️ Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:12}}
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
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:13,display:"flex",gap:6,alignItems:"center",cursor:"pointer",marginBottom:8}}>
                      <input type="checkbox" checked={expForm.is_current} onChange={e=>setExpForm(p=>({...p,is_current:e.target.checked}))}/>
                      Currently working here
                    </label>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Description / Responsibilities</label>
                    <textarea className="form-input" rows={2} style={{width:"100%",fontSize:13}} value={expForm.description||""} onChange={e=>setExpForm(p=>({...p,description:e.target.value}))}/>
                  </div>
                </>,
                saveExp,
                ()=>{setEditExpId(null);setExpForm(EMPTY_EXP);},
                !!editExpId, editExpId?"Update":"Add Experience"
              )}
              {(!profile?.experience||profile.experience.length===0)?
                <div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No experience records yet.</div>:
                profile.experience.map(e=>(
                  <div key={e.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14}}>{e.designation}</div>
                      <div style={{fontSize:13,color:"#475569"}}>{e.company}</div>
                      <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{e.from_date||"?"} — {e.is_current?"Present":e.to_date||"?"}</div>
                      {e.description&&<div style={{fontSize:12,color:"#64748b",marginTop:4}}>{e.description}</div>}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:12}}
                        onClick={()=>{ setEditExpId(e.id); setExpForm({company:e.company,designation:e.designation,from_date:e.from_date||"",to_date:e.to_date||"",is_current:e.is_current,description:e.description||""}); window.scrollTo(0,0); }}>
                        ✏️ Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:12}}
                        onClick={async()=>{ await hrApi.deleteExperience(e.id); load(); }}>Remove</button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* DOCUMENTS */}
          {tab==="documents" && (
            <div>
              <div style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:16,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#334155"}}>UPLOAD DOCUMENT</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Document Type</label>
                    <select className="form-input" style={{width:"100%",fontSize:13}} value={docForm.doc_type} onChange={e=>setDocForm(p=>({...p,doc_type:e.target.value}))}>
                      {DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Document Name *</label>
                    <input className="form-input" style={{width:"100%",fontSize:13}} placeholder="e.g. BSc Degree Certificate" value={docForm.doc_name} onChange={e=>setDocForm(p=>({...p,doc_name:e.target.value}))}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <input type="file" style={{flex:1,fontSize:12}} onChange={e=>setDocForm(p=>({...p,file:e.target.files[0]}))}/>
                  <button className="btn btn-primary btn-sm" style={{color:"#fff",whiteSpace:"nowrap"}} disabled={uploading} onClick={uploadDoc}>
                    {uploading?"Uploading...":"Upload"}
                  </button>
                </div>
              </div>
              {(!profile?.documents||profile.documents.length===0)?
                <div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No documents uploaded.</div>:
                profile.documents.map(doc=>(
                  <div key={doc.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>📄 {doc.doc_name}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{doc.doc_type} · {doc.uploaded_at}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:12}}
                      onClick={async()=>{ await hrApi.deleteMyDocument(doc.id); load(); }}>Remove</button>
                  </div>
                ))}
            </div>
          )}

          {/* EMERGENCY CONTACTS */}
          {tab==="contacts" && (
            <div>
              <div style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:16,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#334155"}}>ADD EMERGENCY CONTACT</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  {inp("Name *","name",ecForm,setEcForm)}
                  {inp("Relationship","relationship",ecForm,setEcForm)}
                  {inp("Phone *","phone",ecForm,setEcForm)}
                  {inp("Address","address",ecForm,setEcForm)}
                </div>
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={addEC}>Add Contact</button>
                </div>
              </div>
              {(!profile?.emergency_contacts||profile.emergency_contacts.length===0)?
                <div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No emergency contacts.</div>:
                profile.emergency_contacts.map(ec=>(
                  <div key={ec.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{ec.name}{ec.relationship&&<span style={{fontSize:11,color:"#64748b",marginLeft:6}}>({ec.relationship})</span>}</div>
                      <div style={{fontSize:12,color:"#475569"}}>📞 {ec.phone}</div>
                      {ec.address&&<div style={{fontSize:11,color:"#94a3b8"}}>{ec.address}</div>}
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:12}}
                      onClick={async()=>{ await hrApi.deleteMyEmergencyContact(ec.id); load(); }}>Remove</button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {flash&&<div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"10px 18px",borderRadius:8,
        background:flash.type==="success"?"#dcfce7":"#fee2e2",color:flash.type==="success"?"#166534":"#dc2626",
        boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:14,fontWeight:600}}>{flash.msg}</div>}
    </div>
  );
}
