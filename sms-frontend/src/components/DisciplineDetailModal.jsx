import React, { useState, useEffect } from "react";
import { disciplineApi } from "../api/disciplineApi";
import workflowApi from "../api/workflowApi";
import { useAuth } from "../auth/AuthContext";
import client from "../api/client";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "./DatePicker";

const SEVERITY_LABELS = {1:"Minor",2:"Moderate",3:"Serious",4:"Severe",5:"Critical"};
const SEVERITY_COLORS = {1:"#22c55e",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#7c3aed"};

export default function DisciplineDetailModal({ caseId, onClose, onActed, wqItem }) {
  const { formatDate } = useRegionalSettings();
  const { user, permissions = [], can } = useAuth();
  const userRoles = user?.roles || [];
  const [detail, setDetail] = useState(null);
  const [wfSteps, setWfSteps] = useState([]);
  const [wfStep, setWfStep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [flashMsg, setFlashMsg] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [committee, setCommittee] = useState({head_id:"", teacher_ids:[], hearing_date:"", witness_user_ids:[], hearing_location:""});
  const [appearanceCandidates, setAppearanceCandidates] = useState([]);
  const [selectedAppearance, setSelectedAppearance] = useState([]);
  const [committeeInfo, setCommitteeInfo] = useState(null);
  const [decideForm, setDecideForm] = useState({action_type:"warning",suspension_from:"",suspension_to:"",note:""});
  const [remarksForm, setRemarksForm] = useState({remarks:"",recommendation:""});
  const isCommitteeMember = wqItem?.action_required==="submit_remarks";
  const isCommitteeCompleted = wqItem?.status==="completed";
  const isParent = userRoles.some(r=>r==="parent"||r?.name==="parent") || permissions.includes("discipline.appeal") || (typeof can==="function" && can("discipline.appeal"));
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealNote, setAppealNote] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const canAppeal = isParent && detail && ["warning","suspension","expulsion"].includes(detail.status) && !detail.appeal_submitted;
  const [evidence, setEvidence] = useState([]);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const flash = (type, msg) => { setFlashMsg({type,msg}); setTimeout(()=>setFlashMsg(null),3000); };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      disciplineApi.getOne(caseId),
      workflowApi.getInstance("discipline", wqItem?.entity_type==="discipline_appeal"?"discipline_appeal":"discipline_case", caseId)
    ]).then(([dr, wr]) => {
      setDetail(dr.data.data);
      const steps = wr.data.data?.steps || [];
      setWfSteps(steps);
      const pending = steps.find(s => s.status === "pending" && (
        s.assigned_to_id === user?.id ||
        (s.assigned_role && userRoles.some(r => r===s.assigned_role || r?.name===s.assigned_role))
      ));
      setWfStep(pending || null);
    }).catch(()=>{}).finally(()=>setLoading(false));
    disciplineApi.getOne(caseId).then(r=>{
      if(r.data.data?.evidence) setEvidence(r.data.data.evidence||[]);
    }).catch(()=>{});
  };

  useEffect(()=>{ if(caseId) loadData(); },[caseId]);

  useEffect(()=>{
    if(wfStep?.step_type==="assign_committee") {
      client.get("/teachers/").then(r=>setTeachers(r.data.data||[])).catch(()=>{});
      disciplineApi.getAppearanceCandidates(caseId).then(r=>{
        const cands = r.data.data||[];
        setAppearanceCandidates(cands);
        // Pre-select all by default
        setSelectedAppearance(cands.filter(c=>c.user_id).map(c=>c.user_id));
      }).catch(()=>{});
    }
    // Always load committee data so it shows at hearing and decide steps
    disciplineApi.getCommittee(caseId).then(r=>setCommitteeInfo(r.data.data||[])).catch(()=>{});
  },[wfStep]);

  const act = async (action) => {
    if(action==="dismiss"&&!note.trim()){setError("Please provide a reason.");return;}
    setActing(true); setError("");
    try {
      const stepType = wfStep?.step_type||"review";
      if(stepType==="appeal_review") {
        await disciplineApi.forwardAppeal(caseId,{note});
      } else if(stepType==="review") {
        await disciplineApi.review(caseId,{action:action==="dismiss"?"dismiss":"approve",note});
      } else if(stepType==="assign_committee") {
        if(!committee.head_id||committee.teacher_ids.length===0){setError("Select committee members and head.");setActing(false);return;}
        await disciplineApi.assignCommittee(caseId,{
          teacher_ids:committee.teacher_ids.map(Number),
          head_id:Number(committee.head_id),
          hearing_date:committee.hearing_date||null,
          witness_user_ids:selectedAppearance,
          hearing_location:committee.hearing_location||""
        });
      } else if(stepType==="hearing") {
        await disciplineApi.hearing(caseId,{notes:note,attendees:"",outcome:"completed"});
      } else if(stepType==="decide") {
        await disciplineApi.decide(caseId,{...decideForm,note:decideForm.note||note});
      }
      flash("success","Action completed.");
      setTimeout(()=>{ loadData(); onActed&&onActed(); },1200);
    } catch(e){ setError(e.response?.data?.message||"Action failed."); }
    finally { setActing(false); }
  };

  const TIMELINE = wfSteps.length>0 ? wfSteps.map((s,idx)=>({
    label:s.step_name, done:s.status==="approved"||s.status==="rejected", current:s.status==="pending"&&wfSteps.findIndex(x=>x.status==="pending")===idx,
    by:s.assigned_role?.replace(/_/g," "), at:s.actioned_at, note:s.note
  })) : [];

  if(!caseId) return null;

  return (
    <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:700,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"12px 20px",background:"#fef9f0",borderBottom:"1px solid #fed7aa",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            {wfStep ? (<>
              <span style={{fontWeight:700,fontSize:13}}>Current Step: </span>
              <span style={{fontSize:13,color:"#c2410c",fontWeight:600}}>{wfStep.step_name}</span>
              {wfStep.assigned_role&&<span style={{fontSize:12,color:"#64748b",marginLeft:8}}>({wfStep.assigned_role.replace(/_/g," ")})</span>}
            </>) : <span style={{fontSize:13,color:"#64748b",fontWeight:600}}>{detail?.status?.replace(/_/g," ").toUpperCase()||"CASE DETAIL"}</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {/* Content */}
        <div style={{padding:20,overflowY:"auto",flex:1}}>
          {flashMsg&&<div style={{padding:"8px 14px",borderRadius:8,marginBottom:12,fontSize:13,
            background:flashMsg.type==="success"?"#dcfce7":"#fee2e2",
            color:flashMsg.type==="success"?"#166534":"#dc2626"}}>{flashMsg.msg}</div>}

          {loading ? <div style={{textAlign:"center",padding:40,color:"#64748b"}}>Loading...</div> : detail && (<>
            {/* Case Info */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:700,color:"#0f172a"}}>{detail.student_name}</div>
              <div style={{fontSize:13,color:"#64748b",marginTop:2}}>{detail.class_name}{detail.section?" - "+detail.section:""}</div>
              <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{padding:"3px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:"#f1f5f9",color:"#475569"}}>{detail.violation_type}</span>
                <span style={{padding:"3px 10px",borderRadius:12,fontSize:12,fontWeight:600,
                  background:SEVERITY_COLORS[detail.severity]||"#94a3b8",color:"#fff"}}>
                  Severity: {SEVERITY_LABELS[detail.severity]||detail.severity}
                </span>
                <span style={{fontSize:12,color:"#94a3b8"}}>Incident: {detail.incident_date}</span>
              </div>
            </div>

            <div style={{marginBottom:16,padding:"10px 14px",background:"#f8fafc",borderRadius:8,fontSize:13,color:"#374151"}}>
              <div style={{fontWeight:600,fontSize:11,color:"#64748b",marginBottom:4,letterSpacing:"0.05em"}}>DESCRIPTION</div>
              {detail.description}
            </div>

            {/* Evidence Section */}
            {evidence.length>0&&(
              <div style={{marginBottom:16,padding:"10px 14px",background:"#fafafa",borderRadius:8,border:"1px solid #e2e8f0"}}>
                <div style={{fontWeight:600,fontSize:11,color:"#64748b",marginBottom:8,letterSpacing:"0.05em"}}>EVIDENCE</div>
                {evidence.map((ev,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,fontSize:13}}>
                    <span style={{color:"#2563eb",cursor:"pointer",textDecoration:"underline"}}
                      onClick={()=>disciplineApi.downloadEvidence(caseId,ev.id)}>
                      📎 {ev.filename||"Evidence "+(i+1)}
                    </span>
                    <span style={{fontSize:11,color:"#94a3b8"}}>{ev.uploaded_by_name||""}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Evidence */}
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="file" style={{fontSize:12,flex:1}} onChange={e=>setEvidenceFile(e.target.files[0])}/>
                <button className="btn btn-ghost btn-sm" style={{fontSize:12,whiteSpace:"nowrap"}} disabled={!evidenceFile||uploadingEvidence}
                  onClick={async()=>{
                    if(!evidenceFile)return;
                    setUploadingEvidence(true);
                    try{
                      const fd=new FormData(); fd.append("file",evidenceFile);
                      await disciplineApi.uploadEvidence(caseId,fd);
                      flash("success","Evidence uploaded.");
                      setEvidenceFile(null);
                      loadData();
                    }catch(e){setError(e.response?.data?.message||"Upload failed.");}
                    finally{setUploadingEvidence(false);}
                  }}>{uploadingEvidence?"Uploading...":"Upload Evidence"}</button>
              </div>
            </div>

            {/* Committee info if assigned */}
            {committeeInfo&&committeeInfo.head&&(
              <div style={{marginBottom:16,padding:"10px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
                <div style={{fontWeight:600,fontSize:11,color:"#166534",marginBottom:6,letterSpacing:"0.05em"}}>HEARING COMMITTEE</div>
                <div style={{fontSize:13,color:"#374151"}}>
                  <strong>Head:</strong> {committeeInfo.head?.name||committeeInfo.head_name}
                  {detail.hearing_date&&<span style={{marginLeft:12,fontSize:12,color:"#64748b"}}>📅 {formatDate(detail.hearing_date)}</span>}
                </div>
                {committeeInfo.members&&committeeInfo.members.length>0&&(
                  <div style={{marginTop:6,fontSize:12,color:"#64748b"}}>
                    Members: {committeeInfo.members.map(m=>m.name||m.teacher_name).join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Progress */}
            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,fontSize:11,color:"#64748b",letterSpacing:"0.05em",marginBottom:12}}>PROGRESS</div>
              {TIMELINE.map((step,i)=>(
                <div key={i} style={{display:"flex",gap:12,marginBottom:10,opacity:(!step.done&&!step.current)?0.4:1}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                      background:step.done?"#22c55e":step.current?"#f97316":"#e2e8f0",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,fontWeight:700,color:(step.done||step.current)?"#fff":"#94a3b8"}}>
                      {step.done?"✓":i+1}
                    </div>
                    {i<TIMELINE.length-1&&<div style={{width:2,flex:1,background:step.done?"#22c55e":"#e2e8f0",minHeight:16}}/>}
                  </div>
                  <div style={{paddingBottom:10}}>
                    <div style={{fontWeight:600,fontSize:14,color:"#0f172a"}}>
                      {step.label}
                      {step.current&&<span style={{marginLeft:8,fontSize:11,color:"#f97316",fontWeight:700}}>Current</span>}
                    </div>
                    {step.by&&<div style={{fontSize:12,color:"#64748b"}}>{step.by}</div>}
                    {step.at&&<div style={{fontSize:11,color:"#94a3b8"}}>
                      {formatDate(step.at)}
                      {step.note&&<span style={{fontStyle:"italic",marginLeft:6}}>"{step.note}"</span>}
                    </div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Section */}
            {/* Committee Member Remarks Form */}
            {isCommitteeMember && (
              <div style={{padding:"16px 20px",background:isCommitteeCompleted?"#f0fdf4":"#fef9f0",
                borderRadius:8,border:"1px solid "+(isCommitteeCompleted?"#bbf7d0":"#fed7aa"),marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:isCommitteeCompleted?"#166534":"#92400e"}}>
                  {isCommitteeCompleted?"✓ REMARKS SUBMITTED":"SUBMIT YOUR HEARING REMARKS"}
                </div>
                {isCommitteeCompleted ? (
                  <div style={{fontSize:13,color:"#166534"}}>You have already submitted your remarks for this case.</div>
                ) : (<>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Your Remarks *</div>
                    <textarea className="form-input" rows={4} style={{width:"100%",fontSize:13}}
                      value={remarksForm.remarks} onChange={e=>setRemarksForm(p=>({...p,remarks:e.target.value}))}
                      placeholder="Describe your assessment of the case based on the hearing..."/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Recommendation</div>
                    <select className="form-input" style={{width:"100%",fontSize:13}}
                      value={remarksForm.recommendation} onChange={e=>setRemarksForm(p=>({...p,recommendation:e.target.value}))}>
                      <option value="">Select recommendation...</option>
                      {["warning","suspension","expulsion","dismissed"].map(r=>(
                        <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",justifyContent:"flex-end"}}>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting||!remarksForm.remarks.trim()}
                      onClick={async()=>{
                        if(!remarksForm.remarks.trim()){setError("Remarks are required.");return;}
                        setActing(true); setError("");
                        try{
                          await disciplineApi.submitRemarks(caseId,remarksForm);
                          flash("success","Remarks submitted successfully.");
                          setTimeout(()=>{loadData();onActed&&onActed();},1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>{acting?"Submitting...":"Submit Remarks"}</button>
                  </div>
                </>)}
              </div>
            )}

            {/* Committee Summary - visible at hearing and decide steps */}
            {committeeInfo&&committeeInfo.length>0&&wfStep&&(wfStep.step_type==="hearing"||wfStep.step_type==="decide")&&(
              <div style={{marginBottom:16,padding:"14px 16px",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa"}}>
                <div style={{fontWeight:700,fontSize:11,color:"#92400e",marginBottom:10,letterSpacing:"0.05em"}}>COMMITTEE HEARING REPORTS</div>
                {committeeInfo.filter(m=>m.is_head).map((m,i)=>(
                  <div key={"h"+i} style={{marginBottom:10,padding:"8px 12px",background:"#fff",borderRadius:6,border:"1px solid #fed7aa"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:700,fontSize:13}}>{m.teacher_name} <span style={{fontSize:11,color:"#f97316",fontWeight:700}}>● Head</span></span>
                      <span style={{fontSize:11,color:m.submitted_at?"#16a34a":"#f97316",fontWeight:600}}>{m.submitted_at?"✓ Submitted":"Pending"}</span>
                    </div>
                    {m.recommendation&&<div style={{fontSize:12,marginTop:4}}>Final Recommendation: <strong style={{color:"#c2410c"}}>{m.recommendation}</strong></div>}
                    {m.remarks&&<div style={{fontSize:12,color:"#374151",fontStyle:"italic",marginTop:2}}>"{m.remarks}"</div>}
                  </div>
                ))}
                {committeeInfo.filter(m=>!m.is_head).map((m,i)=>(
                  <div key={i} style={{marginBottom:6,padding:"8px 12px",background:"#fff",borderRadius:6,border:"1px solid #e2e8f0",
                    opacity:m.submitted_at?1:0.6}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:600,fontSize:13}}>{m.teacher_name}</span>
                      <span style={{fontSize:11,color:m.submitted_at?"#16a34a":"#94a3b8",fontWeight:600}}>{m.submitted_at?"✓":"Pending"}</span>
                    </div>
                    {m.recommendation&&<div style={{fontSize:11,color:"#6b7280",marginTop:2}}>Recommendation: <strong>{m.recommendation}</strong></div>}
                    {m.remarks&&<div style={{fontSize:12,color:"#374151",fontStyle:"italic",marginTop:2}}>"{m.remarks}"</div>}
                  </div>
                ))}
              </div>
            )}

            {wfStep && (
              <div style={{padding:"16px 20px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>

                {/* REVIEW */}
                {wfStep.step_type==="review" && (<>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#0f172a"}}>REVIEW CASE</div>
                  <textarea className="form-input" rows={3} style={{width:"100%",fontSize:13,marginBottom:10}} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Review notes (optional)"/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting}
                      onClick={()=>act("dismiss")}>Dismiss Case</button>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting}
                      onClick={()=>act("approve")}>{acting?"Processing...":"Approve Case"}</button>
                  </div>
                </>)}

                {/* ASSIGN COMMITTEE */}
                {wfStep.step_type==="assign_committee" && (<>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#0f172a"}}>ASSIGN COMMITTEE & SCHEDULE HEARING</div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Hearing Date & Time *</div>
                    <input type="datetime-local" className="form-input" style={{width:"100%",fontSize:13}}
                      value={committee.hearing_date} onChange={e=>setCommittee(p=>({...p,hearing_date:e.target.value}))}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Hearing Location *</div>
                    <input type="text" className="form-input" style={{width:"100%",fontSize:13}}
                      placeholder="e.g. Conference Room, Principal Office..."
                      value={committee.hearing_location} onChange={e=>setCommittee(p=>({...p,hearing_location:e.target.value}))}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Committee Members (select multiple)</div>
                    <select multiple className="form-input" style={{width:"100%",fontSize:13,height:100}}
                      onChange={e=>setCommittee(p=>({...p,teacher_ids:Array.from(e.target.selectedOptions,o=>o.value)}))}>
                      {teachers.map(t=><option key={t.id} value={t.id}>{t.first_name} {t.last_name} — {t.subject||t.designation||""}</option>)}
                    </select>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>Hold Ctrl/Cmd to select multiple</div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Committee Head</div>
                    <select className="form-input" style={{width:"100%",fontSize:13}}
                      value={committee.head_id} onChange={e=>setCommittee(p=>({...p,head_id:e.target.value}))}>
                      <option value="">Select head from members...</option>
                      {committee.teacher_ids.map(id=>{
                        const t = teachers.find(x=>String(x.id)===String(id));
                        return t ? <option key={id} value={id}>{t.first_name} {t.last_name}</option> : null;
                      })}
                    </select>
                  </div>
                  <div style={{marginBottom:10,padding:"10px 12px",background:"#f0f9ff",borderRadius:8,border:"1px solid #bae6fd"}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#0369a1",marginBottom:8}}>WHO WILL APPEAR BEFORE COMMITTEE</div>
                    <div style={{fontSize:11,color:"#475569",marginBottom:10}}>Select persons required to appear. They will be notified with the hearing date and time.</div>
                    {appearanceCandidates.map((cand,idx)=>(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 10px",
                        background:selectedAppearance.includes(cand.user_id)?"#dbeafe":"#f8fafc",
                        borderRadius:6,border:"1px solid "+(selectedAppearance.includes(cand.user_id)?"#93c5fd":"#e2e8f0"),
                        cursor:cand.user_id?"pointer":"default",opacity:cand.user_id?1:0.5}}
                        onClick={()=>{
                          if(!cand.user_id) return;
                          setSelectedAppearance(p=>p.includes(cand.user_id)?p.filter(x=>x!==cand.user_id):[...p,cand.user_id]);
                        }}>
                        <input type="checkbox" readOnly checked={!!selectedAppearance.includes(cand.user_id)} style={{cursor:"pointer"}}/>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:"#0f172a"}}>{cand.name}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>{cand.label}</div>
                        </div>
                        {!cand.user_id&&<span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>No account</span>}
                      </div>
                    ))}
                  </div>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",justifyContent:"flex-end"}}>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting}
                      onClick={()=>act("assign_committee")}>{acting?"Assigning...":"Assign Committee & Notify"}</button>
                  </div>
                </>)}

                {/* HEARING */}
                {wfStep.step_type==="hearing" && (<>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:"#0f172a"}}>COMMITTEE HEARING REPORTS</div>
                  {committeeInfo&&committeeInfo.length>0 ? (<>
                    {/* Committee Head Final Recommendation */}
                    {committeeInfo.filter(m=>m.is_head).map((m,i)=>(
                      <div key={"head-"+i} style={{marginBottom:12,padding:"12px 14px",borderRadius:8,
                        background:"#fff7ed",border:"2px solid #fed7aa"}}>
                        <div style={{fontWeight:700,fontSize:12,color:"#92400e",marginBottom:6,letterSpacing:"0.05em"}}>COMMITTEE HEAD — FINAL RECOMMENDATION</div>
                        <div style={{fontWeight:600,fontSize:13,color:"#0f172a",marginBottom:4}}>{m.name||m.teacher_name}</div>
                        {m.submitted_at ? (<>
                          {m.recommendation&&<div style={{fontSize:13,color:"#374151",marginBottom:4}}>
                            <strong>Recommendation:</strong> <span style={{color:"#c2410c",fontWeight:700}}>{m.recommendation}</span>
                          </div>}
                          {m.remarks&&<div style={{fontSize:12,color:"#374151",fontStyle:"italic"}}>"{m.remarks}"</div>}
                        </>) : <div style={{fontSize:12,color:"#f97316",fontWeight:600}}>⏳ Awaiting submission</div>}
                      </div>
                    ))}
                    {/* Other Members */}
                    <div style={{fontWeight:600,fontSize:11,color:"#64748b",marginBottom:8,letterSpacing:"0.05em"}}>COMMITTEE MEMBERS</div>
                    {committeeInfo.filter(m=>!m.is_head).map((m,i)=>(
                      <div key={i} style={{marginBottom:8,padding:"10px 12px",borderRadius:8,
                        background:m.submitted_at?"#f0fdf4":"#fafafa",
                        border:"1px solid "+(m.submitted_at?"#bbf7d0":"#e2e8f0")}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:m.remarks?6:0}}>
                          <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{m.name||m.teacher_name}</span>
                          <span style={{fontSize:11,fontWeight:600,color:m.submitted_at?"#16a34a":"#94a3b8"}}>
                            {m.submitted_at?"✓ Submitted":"Pending"}
                          </span>
                        </div>
                        {m.recommendation&&<div style={{fontSize:11,color:"#6b7280",marginBottom:2}}>Recommendation: <strong>{m.recommendation}</strong></div>}
                        {m.remarks&&<div style={{fontSize:12,color:"#374151",fontStyle:"italic"}}>"{m.remarks}"</div>}
                      </div>
                    ))}
                  </>) : <div style={{fontSize:13,color:"#94a3b8",marginBottom:12}}>No committee data found.</div>}
                  <div style={{fontSize:13,color:"#475569",marginBottom:10}}>
                    After all members have submitted, mark the hearing as complete to proceed to final decision.
                  </div>
                  <textarea className="form-input" rows={2} style={{width:"100%",fontSize:13,marginBottom:10}} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Hearing summary notes (optional)"/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",justifyContent:"flex-end"}}>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting}
                      onClick={()=>act("hearing")}>{acting?"Processing...":"Mark Hearing Complete"}</button>
                  </div>
                </>)}

                {/* APPEAL REVIEW */}
                {wfStep.step_type==="appeal_review" && (<>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#7c3aed"}}>REVIEW APPEAL</div>
                  <div style={{marginBottom:10,padding:"10px 12px",background:"#faf5ff",borderRadius:6,border:"1px solid #e9d5ff",fontSize:13}}>
                    <strong>Appeal Note:</strong> {detail?.appeal_note||"No note provided."}
                  </div>
                  <textarea className="form-input" rows={3} style={{width:"100%",fontSize:13,marginBottom:10}} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Review notes (optional)"/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting}
                      onClick={async()=>{
                        setActing(true);
                        try{ if(!note.trim()){setError("Please provide rejection reason.");setActing(false);return;}
                          await disciplineApi.forwardAppeal(caseId,{note,action:"reject"});
                          flash("success","Appeal rejected."); setTimeout(()=>{loadData();onActed&&onActed();},1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>Reject Appeal</button>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting}
                      onClick={()=>act("appeal_review")}>{acting?"Processing...":"Forward to Principal"}</button>
                  </div>
                </>)}

                {/* APPEAL DECIDE */}
                {wfStep.step_type==="appeal_decide" && (<>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#7c3aed"}}>APPEAL DECISION</div>
                  <div style={{marginBottom:10,padding:"10px 12px",background:"#faf5ff",borderRadius:6,border:"1px solid #e9d5ff",fontSize:13}}>
                    <strong>Appeal Note:</strong> {detail?.appeal_note||"No note provided."}
                  </div>
                  <textarea className="form-input" rows={3} style={{width:"100%",fontSize:13,marginBottom:10}} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Decision reasoning (required)"/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting||!note.trim()}
                      onClick={async()=>{
                        if(!note.trim()){setError("Please provide reasoning.");return;}
                        setActing(true);
                        try{ await disciplineApi.respondAppeal(caseId,{outcome:"upheld",response:note});
                          flash("success","Appeal rejected — original decision stands.");
                          setTimeout(()=>{loadData();onActed&&onActed();},1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>Reject Appeal</button>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting||!note.trim()}
                      onClick={async()=>{
                        if(!note.trim()){setError("Please provide reasoning.");return;}
                        setActing(true);
                        try{ await disciplineApi.respondAppeal(caseId,{outcome:"overturned",response:note});
                          flash("success","Appeal upheld — decision overturned.");
                          setTimeout(()=>{loadData();onActed&&onActed();},1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>Uphold Appeal</button>
                  </div>
                </>)}

                {/* DECIDE */}
                {wfStep.step_type==="decide" && (<>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:"#0f172a"}}>FINAL DECISION</div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Decision</div>
                    <select className="form-input" style={{width:"100%",fontSize:13}} value={decideForm.action_type}
                      onChange={e=>setDecideForm(p=>({...p,action_type:e.target.value}))}>
                      {["warning","suspension","expulsion","dismissed"].map(o=>(
                        <option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  {decideForm.action_type==="suspension"&&(
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Suspension From</div>
                        <DatePicker style={{width:"100%",fontSize:13}} value={decideForm.suspension_from}
                          onChange={val=>setDecideForm(p=>({...p,suspension_from:val}))}/>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Suspension To</div>
                        <DatePicker style={{width:"100%",fontSize:13}} value={decideForm.suspension_to}
                          onChange={val=>setDecideForm(p=>({...p,suspension_to:val}))}/>
                      </div>
                    </div>
                  )}
                  <textarea className="form-input" rows={2} style={{width:"100%",fontSize:13,marginBottom:10}}
                    placeholder="Decision note..." value={decideForm.note}
                    onChange={e=>setDecideForm(p=>({...p,note:e.target.value}))}/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting}
                      onClick={()=>disciplineApi.review(caseId,{action:"dismiss",note:decideForm.note}).then(()=>{flash("success","Case dismissed.");setTimeout(()=>{loadData();onActed&&onActed();},1200);}).catch(e=>setError(e.response?.data?.message||"Failed."))}>
                      Dismiss
                    </button>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting}
                      onClick={()=>act("decide")}>{acting?"Processing...":"Submit Decision"}</button>
                  </div>
                </>)}

              </div>
            )}
          </>)}
            {/* Parent Appeal Section */}
            {isParent && detail && ["warning","suspension","expulsion","dismissed"].includes(detail.status) && (
              <div style={{marginTop:16,padding:"14px 16px",background:detail.appeal_submitted?"#f0fdf4":"#faf5ff",
                borderRadius:8,border:"1px solid "+(detail.appeal_submitted?"#bbf7d0":"#e9d5ff")}}>
                <div style={{fontWeight:700,fontSize:12,color:detail.appeal_outcome==="rejected"?"#dc2626":detail.appeal_submitted?"#166534":"#7c3aed",marginBottom:6}}>
                  {detail.appeal_outcome==="rejected"?"✗ APPEAL REJECTED":detail.appeal_outcome==="upheld"?"✓ APPEAL UPHELD":detail.appeal_submitted?"⏳ UNDER REVIEW":"APPEAL DECISION"}
                </div>
                {detail.appeal_outcome==="rejected" ? (
                  <div style={{fontSize:13,color:"#dc2626",padding:"8px",background:"#fff1f2",borderRadius:6}}>Your appeal has been rejected. The original decision stands.</div>
                ) : detail.appeal_outcome==="upheld" ? (
                  <div style={{fontSize:13,color:"#166534",padding:"8px",background:"#f0fdf4",borderRadius:6}}>Your appeal has been upheld. The original decision has been overturned.</div>
                ) : detail.appeal_submitted ? (
                  <div style={{fontSize:13,color:"#166534"}}>Your appeal has been submitted and is under review.</div>
                ) : canAppeal ? (<>
                  {detail.appeal_deadline&&<div style={{fontSize:12,color:"#64748b",marginBottom:8}}>
                    Appeal deadline: <strong>{formatDate(detail.appeal_deadline)}</strong>
                  </div>}
                  {!showAppeal ? (
                    <button className="btn btn-sm" style={{background:"#7c3aed",color:"#fff",fontSize:12}}
                      onClick={()=>setShowAppeal(true)}>Submit Appeal</button>
                  ) : (<>
                    <textarea className="form-input" rows={3} style={{width:"100%",fontSize:13,marginBottom:8}}
                      value={appealNote} onChange={e=>setAppealNote(e.target.value)}
                      placeholder="Explain why you are appealing this decision..."/>
                    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setShowAppeal(false)}>Cancel</button>
                      <button className="btn btn-sm" style={{background:"#7c3aed",color:"#fff"}} disabled={appealSubmitting||!appealNote.trim()}
                        onClick={async()=>{
                          if(!appealNote.trim()) return;
                          setAppealSubmitting(true);
                          try{
                            await disciplineApi.appeal(caseId,{note:appealNote});
                            flash("success","Appeal submitted successfully.");
                            setTimeout(()=>{loadData();onActed&&onActed();},1200);
                          }catch(e){setError(e.response?.data?.message||"Appeal failed.");}
                          finally{setAppealSubmitting(false);}
                        }}>{appealSubmitting?"Submitting...":"Submit Appeal"}</button>
                    </div>
                  </>)}
                </>) : (
                  <div style={{fontSize:13,color:"#64748b"}}>
                    {detail.status==="dismissed"?"This case was dismissed.":"Appeal period has ended or appeal is not available."}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}