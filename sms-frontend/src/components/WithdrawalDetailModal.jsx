import client from "../api/client";
import React, { useState, useEffect } from "react";
import { withdrawalApi } from "../api/withdrawalApi";
import workflowApi from "../api/workflowApi";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

export default function WithdrawalDetailModal({ requestId, onClose, onActed, wqItem }) {
  const processingToday = useProcessingToday();
  const { user, roles: userRoles = [] } = useAuth();
  const [detail, setDetail]     = useState(null);
  const [wfStep, setWfStep]     = useState(null);
  const [wfSteps, setWfSteps]   = useState([]);
  const [note, setNote]         = useState("");
  const [acting, setActing]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [flashMsg, setFlashMsg] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activity, setActivity] = useState([]);
  const [waitingParent, setWaitingParent] = useState(false);
  const [conductForm, setConductForm] = useState({behaviour:"Good",discipline:"Good",academic_performance:"Good",attendance_regularity:"Good",cocurricular:"Limited",disciplinary_action:false,disciplinary_details:"",remarks:"",recommended_readmission:false});
  useEffect(()=>{
    if(!wfStep && wqItem?.entity_status==="action_required"){
      setTimeout(()=>document.getElementById("parent-action-section")?.scrollIntoView({behavior:"smooth",block:"center"}),400);
    }
  },[wqItem, wfStep]);

  const [hTab, setHTab] = useState("attendance");
  const [hData, setHData] = useState({});
  const [hLoading, setHLoading] = useState(false);

  const flash = (type, msg) => { setFlashMsg({type,msg}); setTimeout(()=>setFlashMsg(null),3000); };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      withdrawalApi.getOne(requestId),
      workflowApi.getInstance("withdrawal","withdrawal_request",requestId)
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
    withdrawalApi.getActivity(requestId).then(r=>{
      const acts = r.data.data||[];
      setActivity(acts);
      const lastReq = [...acts].reverse().find(a=>a.action==='require_action');
      const lastResp = [...acts].reverse().find(a=>a.action==='parent_response');
      setWaitingParent(lastReq && (!lastResp || new Date(lastResp.created_at)<new Date(lastReq.created_at)));
    }).catch(()=>{});
  };

  useEffect(()=>{ if(requestId) loadData(); },[requestId]);
  useEffect(()=>{ if(detail?.id && userRoles.length>0) {
    workflowApi.getInstance("withdrawal","withdrawal_request",requestId).then(wr=>{
      const steps = wr.data.data?.steps||[];
      setWfSteps(steps);
      const p = steps.find(s=>s.status==="pending"&&(
        s.assigned_to_id===user?.id||
        (s.assigned_role&&userRoles.some(r=>r===s.assigned_role||r?.name===s.assigned_role))
      ));
      setWfStep(p||null);
    }).catch(()=>{});
  }},[detail?.id, userRoles.length]);

  const { formatDate, formatDateTime } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";

  const loadHist = async (studentId, tab) => {
    setHTab(tab); setHLoading(true);
    try {
      if (tab === "attendance") {
        const r = await client.get("/students/"+studentId+"/attendance", {params:{from:new Date(new Date(processingToday).setMonth(new Date(processingToday).getMonth()-3)).toISOString().split("T")[0],to:processingToday}});
        setHData(prev => ({...prev, attendance: r.data.data||[]}));
      } else if (tab === "grades") {
        const r = await client.get("/students/"+studentId+"/grades");
        setHData(prev => ({...prev, grades: r.data.data||[]}));
      } else if (tab === "fees") {
        const r = await client.get("/finance/student/"+studentId);
        setHData(prev => ({...prev, fees: r.data.data}));
      } else if (tab === "assignments") {
        const beforeDate = detail?.principal_at ? detail.principal_at.substring(0,10) : (detail?.effective_date ? detail.effective_date.substring(0,10) : "");
        const r = await client.get("/assignments/student-history?student_id="+studentId+(beforeDate?"&before_date="+beforeDate:""));
        setHData(prev => ({...prev, assignments: r.data.data||[]}));
      } else if (tab === "quizzes") {
        const beforeDate = detail?.principal_at ? detail.principal_at.substring(0,10) : (detail?.effective_date ? detail.effective_date.substring(0,10) : "");
        const r = await client.get("/quizzes/student-history?student_id="+studentId+(beforeDate?"&before_date="+beforeDate:""));
        setHData(prev => ({...prev, quizzes: r.data.data||[]}));
      }
    } catch(e) { console.error("History error ["+tab+"]:", e?.response?.status, e?.response?.data||e?.message); } finally { setHLoading(false); }
  };

  const act = async (action) => {
    if(action==="reject"&&!note.trim()){setError("Please provide a reason.");return;}
    setActing(true); setError("");
    try {
      const stepType = wfStep?.step_type||"clear";
      const apiMap = {
        review: withdrawalApi.review, clear: withdrawalApi.clear,
        verify: withdrawalApi.clear, approve: withdrawalApi.approve,
        recommend: withdrawalApi.review, publish: withdrawalApi.review,
      };
      const fn = action==="reject" ? withdrawalApi.clear : (apiMap[stepType]||withdrawalApi.clear);
      const actionVal = action==="reject" ? "reject" : stepType==="approve" ? "approve" : "clear";
      await fn(requestId,{action:actionVal,note});
      flash("success","Action completed successfully.");
      setNote(""); loadData();
      if(onActed) onActed();
    } catch(e){setError(e.response?.data?.message||"Action failed.");}
    finally{setActing(false);}
  };

  const STATUS_COLOR = {
    pending:"#f59e0b",under_review:"#3b82f6",clearance:"#8b5cf6",
    approved:"#22c55e",rejected:"#ef4444",withdrawn:"#6b7280"
  };

  const currentStep = wfSteps.find(s=>s.status==="pending");

  
  const TIMELINE = detail ? (() => {
    if(wfSteps.length>0) return wfSteps.map(s=>({
      label:s.step_name, done:s.status==="approved", current:s===currentStep,
      rawRole:s.assigned_role, by:s.assigned_role?.replace(/_/g," "), at:s.actioned_at, note:s.note
    }));
    return [
      {label:"Application Submitted",done:true,current:false,by:detail.requested_by_name,at:detail.requested_at},
      {label:"Coordinator Review",done:!!detail.coordinator_at,current:detail.status==="pending",by:detail.coordinator_name,at:detail.coordinator_at},
      {label:"Department Clearances",done:false,current:detail.status==="clearance",by:null,at:null},
      {label:"Principal Approval",done:detail.status==="approved",current:false,by:null,at:null},
    ];
  })() : [];

  return (
    <>
    <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",
      display:"flex",alignItems:"flex-start",justifyContent:"center",
      padding:20,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:860,
        marginTop:40,marginBottom:40,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>

        {/* Workflow Action Bar — INSIDE the white box */}
        {wfStep && (
          <div style={{padding:"12px 20px",background:"#eff6ff",borderBottom:"1px solid #bfdbfe",
            display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div>
              <span style={{fontWeight:700,fontSize:13}}>Current Step: </span>
              <span style={{fontSize:13,color:"#0369a1",fontWeight:600}}>{wfStep.step_name}</span>
              {wfStep.assigned_role&&<span style={{fontSize:12,color:"#64748b",marginLeft:8}}>
                ({wfStep.assigned_role.replace(/_/g," ")})</span>}
            </div>
          </div>
        )}

        <div style={{padding:24}}>
          {flashMsg&&<div style={{padding:"8px 14px",borderRadius:8,marginBottom:12,fontSize:13,
            background:flashMsg.type==="success"?"#dcfce7":"#fee2e2",
            color:flashMsg.type==="success"?"#166534":"#991b1b"}}>{flashMsg.msg}</div>}

          {loading ? <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Loading...</div>
          : detail && <>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
              <div>
                <div style={{fontWeight:700,fontSize:20,color:"#0f172a"}}>{detail.student_name}</div>
                <div style={{fontSize:13,color:"#64748b",marginTop:2}}>
                  {detail.student_number} · {detail.class_name}</div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                  <span style={{padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:600,
                    background:`${STATUS_COLOR[detail.status]||"#6b7280"}22`,
                    color:STATUS_COLOR[detail.status]||"#6b7280",textTransform:"capitalize"}}>
                    {(detail.status||"Pending").replace(/_/g," ")}
                  </span>
                  {detail.effective_date&&<span style={{fontSize:12,color:"#94a3b8"}}>
                    Effective: {formatDate(detail.effective_date)}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost btn-sm" style={{fontSize:13}} onClick={()=>{ setShowHistory(true); if(detail?.student_id) loadHist(detail.student_id,"attendance"); }}>View History</button>
                <button className="btn btn-ghost btn-sm" style={{fontSize:13}} onClick={onClose}>Close</button>
              </div>
            </div>



            {/* Reason */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:"0.05em",marginBottom:8}}>REASON</div>
              <div style={{fontSize:14,color:"#334155",lineHeight:1.6}}>{detail.reason}</div>
            </div>


            {/* Progress */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:14}}>PROGRESS</div>
              {TIMELINE.map((step,i)=>(
                <div key={i} style={{display:"flex",gap:12,marginBottom:10,
                  opacity:(!step.done&&!step.current)?0.4:1}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                      background:step.done?"#22c55e":step.current?"#2563eb":"#e2e8f0",
                      border:step.current?"2px solid #2563eb":"2px solid transparent",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,fontWeight:700,
                      color:(step.done||step.current)?"#fff":"#94a3b8"}}>
                      {step.done?"✓":step.current?"●":i+1}
                    </div>
                    {i<TIMELINE.length-1&&<div style={{width:2,flex:1,minHeight:14,marginTop:2,
                      background:step.done?"#22c55e":"#e2e8f0"}}/>}
                  </div>
                  <div style={{paddingBottom:10}}>
                    <div style={{fontWeight:600,fontSize:14,color:"#0f172a"}}>
                      {step.label}
                      {step.current&&<span style={{marginLeft:8,fontSize:11,color:"#2563eb",
                        fontWeight:700}}>Current</span>}
                    </div>
                    {step.by&&<div style={{fontSize:12,color:"#64748b"}}>{step.by}</div>}
                    {step.at&&<div style={{fontSize:11,color:"#94a3b8"}}>
                      {formatDate(step.at)}
                      {step.note&&<div style={{marginTop:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:"#6b7280"}}>{step.by||step.label}: </span>
                        <span style={{fontStyle:"italic",color:"#374151"}}>{step.note}</span>
                      </div>}
                                          </div>}
                      {(()=>{
const stepActivity=activity.filter(a=>a.from_role===step.rawRole);return stepActivity.length>0&&(
                        <div style={{marginTop:6}}>
                          {stepActivity.map((a,ai)=>(
                            <div key={ai} style={{marginTop:4,paddingLeft:8,borderLeft:a.action==="require_action"?"2px solid #f59e0b":"2px solid #22c55e"}}>
                              <span style={{fontSize:11,fontWeight:700,color:a.action==="require_action"?"#92400e":"#15803d"}}>
                                {a.action==="require_action"?"Request to parent: ":"Parent response: "}
                              </span>
                              <span style={{fontSize:12,color:"#374151",fontStyle:"italic"}}>{a.note}</span>
                              <span style={{fontSize:10,color:"#9ca3af",marginLeft:6}}>{formatDateTime(a.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      );})()}
                  </div>
                </div>
              ))}

              {/* Review section for coordinator */}
              {wfStep && wfStep.step_type==="review" && (
                <div style={{marginTop:16,padding:"16px 20px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>REVIEW REQUEST</div>
                  <div style={{fontSize:12,color:"#475569",marginBottom:10}}>Departments required for clearance:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
                    {wfSteps.filter(s=>s.step_type==="clear"||s.step_type==="verify").map((s,i)=>(
                      <span key={i} style={{padding:"4px 12px",background:"#dbeafe",color:"#1e40af",borderRadius:20,fontSize:12,fontWeight:600}}>
                        {(s.step_name||"").replace(/_/g," ")}
                      </span>
                    ))}
                  </div>
                  <textarea className="form-input" rows={2} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder="Add a note (optional)" style={{width:"100%",resize:"vertical",fontSize:13,marginBottom:10}}/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting} onClick={()=>act("reject")}>Reject</button>
                    <button className="btn btn-primary btn-sm" disabled={acting} onClick={()=>act("review")}
                      style={{color:"#ffffff",whiteSpace:"nowrap"}}>
                      {acting?"Processing...":"Reviewed and Forward to Departments"}
                    </button>
                  </div>
                </div>
              )}
            </div>

              {/* Conduct Form Section */}
              {wfStep && wfStep.step_type==="conduct" && (
                <div style={{marginTop:16,padding:"16px 20px",background:"#f0f9ff",borderRadius:8,border:"1px solid #bae6fd"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:"#0369a1"}}>TEACHER CONDUCT FORM</div>
                  {[["behaviour","Behaviour"],["discipline","Discipline"],["academic_performance","Academic Performance"],["attendance_regularity","Attendance Regularity"],["cocurricular","Co-Curricular"]].map(([field,label])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>{label}</div>
                      <select className="form-input" style={{fontSize:13,width:"100%"}} value={conductForm[field]}
                        onChange={e=>setConductForm(p=>({...p,[field]:e.target.value}))}>
                        {["Excellent","Good","Average","Below Average","Poor"].map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"flex",gap:8,alignItems:"center"}}>
                      <input type="checkbox" checked={conductForm.disciplinary_action}
                        onChange={e=>setConductForm(p=>({...p,disciplinary_action:e.target.checked}))}/>
                      Any Disciplinary Action Taken
                    </label>
                    {conductForm.disciplinary_action&&<textarea className="form-input" rows={2} style={{width:"100%",fontSize:13,marginTop:6}}
                      placeholder="Disciplinary details..." value={conductForm.disciplinary_details}
                      onChange={e=>setConductForm(p=>({...p,disciplinary_details:e.target.value}))}/>}
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>Remarks</div>
                    <textarea className="form-input" rows={2} style={{width:"100%",fontSize:13}} placeholder="Additional remarks..."
                      value={conductForm.remarks} onChange={e=>setConductForm(p=>({...p,remarks:e.target.value}))}/>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"flex",gap:8,alignItems:"center"}}>
                      <input type="checkbox" checked={conductForm.recommended_readmission}
                        onChange={e=>setConductForm(p=>({...p,recommended_readmission:e.target.checked}))}/>
                      Recommend for Re-admission
                    </label>
                  </div>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-primary btn-sm" style={{color:"#ffffff"}} disabled={acting}
                      onClick={async()=>{
                        setActing(true); setError("");
                        try{
                          await withdrawalApi.submitConduct(requestId, conductForm);
                          flash("success","Conduct form submitted.");
                          setTimeout(()=>{ loadData(); onActed&&onActed(); },1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>
                      {acting?"Submitting...":"Submit Conduct Form"}
                    </button>
                  </div>
                </div>
              )}
              {/* Bottom action section for non-review steps */}
              {wfStep && wfStep.step_type!=="review" && wfStep.step_type!=="conduct" && (
                <div style={{marginTop:16,padding:"16px 20px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                  {waitingParent&&<div style={{marginBottom:10,padding:"6px 12px",background:"#fef3c7",borderRadius:6,fontSize:12,color:"#92400e",fontWeight:600}}>Waiting for parent response</div>}
                  <textarea className="form-input" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder={wfStep.step_type==="reject"?"Reason for rejection (required)":"Add a note (optional)"}
                    style={{width:"100%",resize:"vertical",fontSize:13,marginBottom:10}}/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
                    {wfStep.can_reject!==false&&(
                      <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting}
                        onClick={()=>act("reject")}>Reject</button>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{color:"#0369a1",fontSize:12}} disabled={acting}
                      onClick={async()=>{ if(!note.trim()){setError("Enter a reason for requiring parent action.");return;}
                        try{ await withdrawalApi.stepActionRequired(requestId,{note}); flash("success","Action request sent."); setNote(""); loadData();}
                        catch(e){setError(e.response?.data?.message||"Failed.");} }}>
                      Require Action from Parent</button>
                    <button className="btn btn-primary btn-sm" style={{color:"#ffffff"}} disabled={acting||waitingParent}
                      onClick={()=>act(wfStep.step_type||"approve")}>
                      {acting?"Processing...":wfStep.action_label||wfStep.step_name}
                    </button>
                  </div>
                </div>
              )}
              {/* Parent action section */}
              {!wfStep && wqItem?.entity_status==="action_required" && (
                <div id="parent-action-section" style={{marginTop:16,padding:"16px 20px",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:"#9a3412"}}>ACTION REQUIRED</div>
                  <div style={{fontSize:13,color:"#7c2d12",marginBottom:12}}>
                    {wqItem?.description||"Please provide the required information for this withdrawal request."}
                  </div>
                  <textarea className="form-input" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder="Your response (required)"
                    style={{width:"100%",resize:"vertical",fontSize:13,marginBottom:10}}/>
                  {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{error}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button className="btn btn-primary btn-sm" disabled={acting}
                      style={{color:"#ffffff"}}
                      onClick={async()=>{
                        setActing(true); setError("");
                        try{
                          await withdrawalApi.parentRespond(requestId,{note});
                          flash("success","Response submitted successfully.");
                          setTimeout(()=>onActed&&onActed(),1200);
                        }catch(e){console.error("Parent respond error:",e.response?.status,e.response?.data);setError(e.response?.data?.message||"Failed to submit response.");}
                        finally{setActing(false);}
                      }}>
                      {acting?"Submitting...":"Submit Response"}
                    </button>
                  </div>
                </div>
              )}
          </>}
        </div>
      </div>
    </div>
      {showHistory && detail && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:800,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{detail.student_name} - Academic History</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{detail.enrollment_no} - {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowHistory(false)}>Close</button>
            </div>
            <div style={{display:"flex",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",flexShrink:0}}>
              {[{key:"attendance",label:"Attendance"},{key:"grades",label:"Grades"},{key:"fees",label:"Fees"},{key:"assignments",label:"Assignments"},{key:"quizzes",label:"Quizzes"}].map(tab=>(
                <button key={tab.key} onClick={()=>loadHist(detail.student_id,tab.key)} style={{padding:"10px 20px",border:"none",borderBottom:"2px solid "+(hTab===tab.key?"#2563eb":"transparent"),background:"transparent",color:hTab===tab.key?"#2563eb":"var(--color-text-secondary)",fontWeight:hTab===tab.key?600:400,fontSize:13,cursor:"pointer"}}>{tab.label}</button>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
              {hLoading ? <div className="loading-state">Loading...</div> : (
                hTab==="attendance" ? (
                  (!hData.attendance||hData.attendance.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No attendance records found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Date","Day","Status","Remarks"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{hData.attendance.map((r,i)=>{const st={present:{background:"#f0fdf4",color:"#166534"},absent:{background:"#fef2f2",color:"#991b1b"},late:{background:"#fffbeb",color:"#92400e"},excused:{background:"#eff6ff",color:"#1e40af"},on_leave:{background:"#f0f9ff",color:"#0369a1"}}[r.status]||{background:"#f1f5f9",color:"#475569"};return <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}><td style={{padding:"8px 12px"}}>{fmtDate(r.date)}</td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{r.date?new Date(r.date).toLocaleDateString("en",{weekday:"short"}):"-"}</td><td style={{padding:"8px 12px"}}><span style={{...st,padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600}}>{r.status}</span></td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{r.remarks||"-"}</td></tr>;})}
                      </tbody>
                    </table>
                ) : hTab==="grades" ? (
                  (!hData.grades||hData.grades.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No grades found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Subject","Exam","Marks","Grade","Date"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{(hData.grades||[]).map((g,i)=><tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}><td style={{padding:"8px 12px",fontWeight:500}}>{g.subject_name||"-"}</td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{g.exam_name||"-"}</td><td style={{padding:"8px 12px"}}>{g.marks_obtained||0}/{g.total_marks||0}</td><td style={{padding:"8px 12px"}}><span style={{fontWeight:700,color:"#2563eb"}}>{g.grade||"-"}</span></td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{fmtDate(g.exam_date)}</td></tr>)}
                      </tbody>
                    </table>
                ) : hTab==="fees" ? (
                  !hData.fees ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No fee data found.</div> :
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                      {[["Total Billed","Rs."+Number(hData.fees.total_billed||0).toLocaleString(),"#2563eb"],["Paid","Rs."+Number(hData.fees.total_paid||0).toLocaleString(),"#166534"],["Outstanding","Rs."+Number(hData.fees.total_due||0).toLocaleString(),"#991b1b"],["Overdue",hData.fees.overdue_count||0,"#dc2626"]].map(([l,v,c])=>(
                        <div key={l} style={{background:"var(--color-background-secondary)",border:"1px solid var(--color-border-tertiary)",borderTop:"3px solid "+c,borderRadius:8,padding:"14px",textAlign:"center"}}>
                          <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                          <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:4}}>{l}</div>
                        </div>
                      ))}
                    </div>
                ) : hTab==="assignments" ? (
                  (!hData.assignments||hData.assignments.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No assignments found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Assignment","Subject","Due Date","Status","Marks"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{(hData.assignments||[]).map((a,i)=>(
                        <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}>
                          <td style={{padding:"8px 12px",fontWeight:500}}>{a.title||"Assignment "+(i+1)}</td>
                          <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{a.subject_name||"-"}</td>
                          <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{fmtDate(a.due_date)}</td>
                          <td style={{padding:"8px 12px"}}><span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,background:a.submitted?"#dcfce7":"#fef9c3",color:a.submitted?"#166534":"#854d0e"}}>{a.submitted?"Submitted":"Pending"}</span></td>
                          <td style={{padding:"8px 12px"}}>{a.marks_obtained!=null?a.marks_obtained+"/"+a.total_marks:"-"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                ) : hTab==="quizzes" ? (
                  (!hData.quizzes||hData.quizzes.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No quizzes found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Quiz","Subject","Date","Score","Grade"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{(hData.quizzes||[]).map((q,i)=>(
                        <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}>
                          <td style={{padding:"8px 12px",fontWeight:500}}>{q.title||"Quiz "+(i+1)}</td>
                          <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{q.subject_name||"-"}</td>
                          <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{fmtDate(q.quiz_date||q.created_at)}</td>
                          <td style={{padding:"8px 12px",fontWeight:q.score!=null?600:400,color:q.score!=null?"#2563eb":"var(--color-text-secondary)"}}>{q.score!=null?q.score+"/"+q.total_marks:"-"}{q.percentage!=null?" ("+Number(q.percentage).toFixed(1)+"%)":""}</td>
                          <td style={{padding:"8px 12px"}}><span style={{fontWeight:700,color:"#2563eb"}}>{q.grade||"-"}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                ) : null
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
