import client from "../api/client";
import React, { useState, useEffect } from "react";
import { withdrawalApi } from "../api/withdrawalApi";
import workflowApi from "../api/workflowApi";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./WithdrawalDetailModal.css";

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
        // Backend returns {exams: [...], subjects: [...]} (exam-level summary
        // rows plus per-subject detail rows, each tagged with exam_id) - keep
        // this shape so the UI can group subjects under their exam rather
        // than mixing every exam's subjects into one flat list.
        setHData(prev => ({...prev, grades: { exams: r.data.data?.exams || [], subjects: r.data.data?.subjects || [] }}));
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
    <div className="wdm-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div className="wdm-box">

        {/* Workflow Action Bar */}
        {wfStep && (
          <div className="wdm-action-bar">
            <div>
              <span className="wdm-action-bar-label">Current Step: </span>
              <span className="wdm-action-bar-step">{wfStep.step_name}</span>
              {wfStep.assigned_role&&<span className="wdm-action-bar-role">
                ({wfStep.assigned_role.replace(/_/g," ")})</span>}
            </div>
          </div>
        )}

        <div className="wdm-body">
          {flashMsg&&<div className="wdm-flash" style={{ "--flash-bg": flashMsg.type==="success"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--flash-color": flashMsg.type==="success"?"var(--text-success-soft)":"var(--text-danger-soft)" }}>{flashMsg.msg}</div>}

          {loading ? <div className="wdm-loading">Loading...</div>
          : detail && <>
            {/* Header */}
            <div className="wdm-header">
              <div>
                <div className="wdm-student-name">{detail.student_name}</div>
                <div className="wdm-student-meta">
                  {detail.student_number} · {detail.class_name}</div>
                <div className="wdm-status-row">
                  <span className="wdm-status-badge" style={{ "--status-bg": `${STATUS_COLOR[detail.status]||"#6b7280"}22`, "--status-color": STATUS_COLOR[detail.status]||"#6b7280" }}>
                    {(detail.status||"Pending").replace(/_/g," ")}
                  </span>
                  {detail.effective_date&&<span className="wdm-effective-date">
                    Effective: {formatDate(detail.effective_date)}</span>}
                </div>
              </div>
              <div className="wdm-header-actions">
                <button className="btn btn-ghost btn-sm wdm-header-btn" onClick={()=>{ setShowHistory(true); if(detail?.student_id) loadHist(detail.student_id,"attendance"); }}>View History</button>
                <button className="btn btn-ghost btn-sm wdm-header-btn" onClick={onClose}>Close</button>
              </div>
            </div>



            {/* Reason */}
            <div className="wdm-section">
              <div className="wdm-section-label">REASON</div>
              <div className="wdm-reason-text">{detail.reason}</div>
            </div>


            {/* Progress */}
            <div>
              <div className="wdm-progress-label">PROGRESS</div>
              {TIMELINE.map((step,i)=>(
                <div key={i} className="wdm-timeline-row" style={{ "--row-opacity": (!step.done&&!step.current)?0.4:1 }}>
                  <div className="wdm-timeline-dot-col">
                    <div className="wdm-timeline-dot" style={{ "--dot-bg": step.done?"#22c55e":step.current?"#2563eb":"var(--border-color)", "--dot-border": step.current?"2px solid #2563eb":"2px solid transparent", "--dot-color": (step.done||step.current)?"#fff":"var(--text-muted)" }}>
                      {step.done?"✓":step.current?"●":i+1}
                    </div>
                    {i<TIMELINE.length-1&&<div className="wdm-timeline-connector" style={{ "--connector-bg": step.done?"#22c55e":"var(--border-color)" }}/>}
                  </div>
                  <div className="wdm-timeline-content">
                    <div className="wdm-timeline-label">
                      {step.label}
                      {step.current&&<span className="wdm-current-tag">Current</span>}
                    </div>
                    {step.by&&<div className="wdm-timeline-by">{step.by}</div>}
                    {step.at&&<div className="wdm-timeline-at">
                      {formatDate(step.at)}
                      {step.note&&<div className="wdm-timeline-note-wrap">
                        <span className="wdm-timeline-note-label">{step.by||step.label}: </span>
                        <span className="wdm-timeline-note-text">{step.note}</span>
                      </div>}
                                          </div>}
                      {(()=>{
const stepActivity=activity.filter(a=>a.from_role===step.rawRole);return stepActivity.length>0&&(
                        <div className="wdm-activity-wrap">
                          {stepActivity.map((a,ai)=>(
                            <div key={ai} className="wdm-activity-item" style={{ "--activity-border": a.action==="require_action"?"2px solid #f59e0b":"2px solid #22c55e" }}>
                              <span className="wdm-activity-label" style={{ "--activity-color": a.action==="require_action"?"#92400e":"#15803d" }}>
                                {a.action==="require_action"?"Request to parent: ":"Parent response: "}
                              </span>
                              <span className="wdm-activity-note">{a.note}</span>
                              <span className="wdm-activity-time">{formatDateTime(a.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      );})()}
                  </div>
                </div>
              ))}

              {/* Review section for coordinator */}
              {wfStep && wfStep.step_type==="review" && (
                <div className="wdm-action-box">
                  <div className="wdm-action-box-title">REVIEW REQUEST</div>
                  <div className="wdm-action-box-subtitle">Departments required for clearance:</div>
                  <div className="wdm-chips-wrap">
                    {wfSteps.filter(s=>s.step_type==="clear"||s.step_type==="verify").map((s,i)=>(
                      <span key={i} className="wdm-dept-chip">
                        {(s.step_name||"").replace(/_/g," ")}
                      </span>
                    ))}
                  </div>
                  <textarea className="form-input wdm-textarea-full" rows={2} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder="Add a note (optional)"/>
                  {error&&<div className="wdm-error-text">{error}</div>}
                  <div className="wdm-btn-row">
                    <button className="btn btn-ghost btn-sm wdm-reject-btn" disabled={acting} onClick={()=>act("reject")}>Reject</button>
                    <button className="btn btn-primary btn-sm wdm-btn-white-nowrap" disabled={acting} onClick={()=>act("review")}>
                      {acting?"Processing...":"Reviewed and Forward to Departments"}
                    </button>
                  </div>
                </div>
              )}
            </div>

              {/* Conduct Form Section */}
              {wfStep && wfStep.step_type==="conduct" && (
                <div className="wdm-action-box-info">
                  <div className="wdm-conduct-title">TEACHER CONDUCT FORM</div>
                  {[["behaviour","Behaviour"],["discipline","Discipline"],["academic_performance","Academic Performance"],["attendance_regularity","Attendance Regularity"],["cocurricular","Co-Curricular"]].map(([field,label])=>(
                    <div key={field} className="wdm-field-wrap">
                      <div className="wdm-field-label-sm">{label}</div>
                      <select className="form-input wdm-field-select" value={conductForm[field]}
                        onChange={e=>setConductForm(p=>({...p,[field]:e.target.value}))}>
                        {["Excellent","Good","Average","Below Average","Poor"].map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                  <div className="wdm-field-wrap">
                    <label className="wdm-checkbox-label">
                      <input type="checkbox" checked={conductForm.disciplinary_action}
                        onChange={e=>setConductForm(p=>({...p,disciplinary_action:e.target.checked}))}/>
                      Any Disciplinary Action Taken
                    </label>
                    {conductForm.disciplinary_action&&<textarea className="form-input wdm-textarea-mt6" rows={2}
                      placeholder="Disciplinary details..." value={conductForm.disciplinary_details}
                      onChange={e=>setConductForm(p=>({...p,disciplinary_details:e.target.value}))}/>}
                  </div>
                  <div className="wdm-field-wrap">
                    <div className="wdm-field-label-sm">Remarks</div>
                    <textarea className="form-input wdm-textarea-plain" rows={2} placeholder="Additional remarks..."
                      value={conductForm.remarks} onChange={e=>setConductForm(p=>({...p,remarks:e.target.value}))}/>
                  </div>
                  <div className="wdm-field-wrap">
                    <label className="wdm-checkbox-label">
                      <input type="checkbox" checked={conductForm.recommended_readmission}
                        onChange={e=>setConductForm(p=>({...p,recommended_readmission:e.target.checked}))}/>
                      Recommend for Re-admission
                    </label>
                  </div>
                  {error&&<div className="wdm-error-text">{error}</div>}
                  <div className="wdm-btn-row">
                    <button className="btn btn-primary btn-sm wdm-btn-white" disabled={acting}
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
                <div className="wdm-action-box">
                  {waitingParent&&<div className="wdm-waiting-banner">Waiting for parent response</div>}
                  <textarea className="form-input wdm-textarea-full" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder={wfStep.step_type==="reject"?"Reason for rejection (required)":"Add a note (optional)"}/>
                  {error&&<div className="wdm-error-text">{error}</div>}
                  <div className="wdm-btn-row-wrap">
                    {wfStep.can_reject!==false&&(
                      <button className="btn btn-ghost btn-sm wdm-reject-btn" disabled={acting}
                        onClick={()=>act("reject")}>Reject</button>
                    )}
                    <button className="btn btn-ghost btn-sm wdm-info-btn" disabled={acting}
                      onClick={async()=>{ if(!note.trim()){setError("Enter a reason for requiring parent action.");return;}
                        try{ await withdrawalApi.stepActionRequired(requestId,{note}); flash("success","Action request sent."); setNote(""); loadData();}
                        catch(e){setError(e.response?.data?.message||"Failed.");} }}>
                      Require Action from Parent</button>
                    <button className="btn btn-primary btn-sm wdm-btn-white" disabled={acting||waitingParent}
                      onClick={()=>act(wfStep.step_type||"approve")}>
                      {acting?"Processing...":wfStep.action_label||wfStep.step_name}
                    </button>
                  </div>
                </div>
              )}
              {/* Parent action section */}
              {!wfStep && wqItem?.entity_status==="action_required" && (
                <div id="parent-action-section" className="wdm-parent-box">
                  <div className="wdm-parent-title">ACTION REQUIRED</div>
                  <div className="wdm-parent-desc">
                    {wqItem?.description||"Please provide the required information for this withdrawal request."}
                  </div>
                  <textarea className="form-input wdm-textarea-full" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder="Your response (required)"/>
                  {error&&<div className="wdm-error-text">{error}</div>}
                  <div className="wdm-btn-row">
                    <button className="btn btn-primary btn-sm wdm-btn-white" disabled={acting}
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
        <div className="wdm-hist-overlay">
          <div className="wdm-hist-box">
            <div className="wdm-hist-header">
              <div>
                <div className="wdm-hist-title">{detail.student_name} - Academic History</div>
                <div className="wdm-hist-meta">{detail.enrollment_no} - {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowHistory(false)}>Close</button>
            </div>
            <div className="wdm-hist-tabs">
              {[{key:"attendance",label:"Attendance"},{key:"grades",label:"Grades"},{key:"fees",label:"Fees"},{key:"assignments",label:"Assignments"},{key:"quizzes",label:"Quizzes"}].map(tab=>(
                <button key={tab.key} onClick={()=>loadHist(detail.student_id,tab.key)} className="wdm-hist-tab" style={{ "--tab-border": hTab===tab.key?"#2563eb":"transparent", "--tab-color": hTab===tab.key?"#2563eb":"var(--color-text-secondary)", "--tab-weight": hTab===tab.key?600:400 }}>{tab.label}</button>
              ))}
            </div>
            <div className="wdm-hist-body">
              {hLoading ? <div className="loading-state">Loading...</div> : (
                hTab==="attendance" ? (
                  (!hData.attendance||hData.attendance.length===0) ?
                    <div className="wdm-hist-empty">No attendance records found.</div> :
                    <table className="wdm-hist-table">
                      <thead><tr className="wdm-hist-th-row">{["Date","Day","Status","Remarks"].map(h=><th key={h} className="wdm-hist-th">{h}</th>)}</tr></thead>
                      <tbody>{hData.attendance.map((r,i)=>{const st={present:{bg:"#f0fdf4",color:"#166534"},absent:{bg:"#fef2f2",color:"#991b1b"},late:{bg:"#fffbeb",color:"#92400e"},excused:{bg:"#eff6ff",color:"#1e40af"},on_leave:{bg:"#f0f9ff",color:"#0369a1"}}[r.status]||{bg:"#f1f5f9",color:"#475569"};return <tr key={i} className="wdm-hist-tr"><td className="wdm-hist-td">{fmtDate(r.date)}</td><td className="wdm-hist-td-secondary">{r.date?new Date(r.date).toLocaleDateString("en",{weekday:"short"}):"-"}</td><td className="wdm-hist-td"><span className="wdm-badge-sm" style={{ "--badge-bg": st.bg, "--badge-color": st.color }}>{r.status}</span></td><td className="wdm-hist-td-secondary">{r.remarks||"-"}</td></tr>;})}
                      </tbody>
                    </table>
                ) : hTab==="grades" ? (
                  (!hData.grades?.exams||hData.grades.exams.length===0) ?
                    <div className="wdm-hist-empty">No grades found.</div> :
                    <div className="wdm-exam-cards-wrap">
                      {hData.grades.exams.map(exam=>{
                        const examSubjects=(hData.grades.subjects||[]).filter(s=>s.exam_id===exam.exam_id);
                        return (
                          <div key={exam.exam_id} className="wdm-exam-card">
                            <div className="wdm-exam-header">
                              <div>
                                <div className="wdm-exam-name">{exam.exam_name}</div>
                                <div className="wdm-exam-date">{fmtDate(exam.start_date)}</div>
                              </div>
                              <div className="wdm-exam-stats">
                                {exam.percentage!=null&&<span>Overall: <strong className="wdm-exam-stat-value">{Number(exam.percentage).toFixed(1)}%</strong></span>}
                                {exam.grade_letter&&<span className="wdm-grade-letter">{exam.grade_letter}</span>}
                                {exam.gpa!=null&&<span>GPA: <strong className="wdm-exam-stat-value">{exam.gpa}</strong></span>}
                                {exam.class_position&&<span>Rank: <strong className="wdm-exam-stat-value">#{exam.class_position}</strong></span>}
                              </div>
                            </div>
                            {examSubjects.length>0&&(
                              <table className="wdm-hist-table">
                                <thead><tr className="wdm-hist-th-row">{["Subject","Marks","%","Grade","Result"].map(h=><th key={h} className="wdm-hist-th-sm">{h}</th>)}</tr></thead>
                                <tbody>{examSubjects.map((s,i)=>(
                                  <tr key={i} className="wdm-hist-tr">
                                    <td className="wdm-hist-td-sm-medium">{s.subject_name}</td>
                                    <td className="wdm-hist-td-sm">{s.is_absent?"-":`${s.marks||0}/${s.total_marks||0}`}</td>
                                    <td className="wdm-hist-td-sm">{s.is_absent?"-":(s.percentage!=null?Number(s.percentage).toFixed(1)+"%":"-")}</td>
                                    <td className="wdm-hist-td-sm"><span className="wdm-grade-letter">{s.grade_letter||"-"}</span></td>
                                    <td className="wdm-hist-td-sm">
                                      <span className="wdm-badge-pill" style={{ "--badge-bg": s.is_absent?"var(--bg-warning-soft)":s.result==="pass"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--badge-color": s.is_absent?"var(--text-warning-soft)":s.result==="pass"?"var(--text-success-soft)":"var(--text-danger-soft)" }}>
                                        {s.is_absent?"Absent":s.result==="pass"?"Pass":"Fail"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                ) : hTab==="fees" ? (
                  !hData.fees ?
                    <div className="wdm-hist-empty">No fee data found.</div> :
                    <div className="wdm-fees-grid">
                      {[["Total Billed","Rs."+Number(hData.fees.total_billed||0).toLocaleString(),"#2563eb"],["Paid","Rs."+Number(hData.fees.total_paid||0).toLocaleString(),"#166534"],["Outstanding","Rs."+Number(hData.fees.total_due||0).toLocaleString(),"#991b1b"],["Overdue",hData.fees.overdue_count||0,"#dc2626"]].map(([l,v,c])=>(
                        <div key={l} className="wdm-fees-card" style={{ "--card-color": c }}>
                          <div className="wdm-fees-value" style={{ "--card-color": c }}>{v}</div>
                          <div className="wdm-fees-label">{l}</div>
                        </div>
                      ))}
                    </div>
                ) : hTab==="assignments" ? (
                  (!hData.assignments||hData.assignments.length===0) ?
                    <div className="wdm-hist-empty">No assignments found.</div> :
                    <table className="wdm-hist-table">
                      <thead><tr className="wdm-hist-th-row">{["Assignment","Subject","Due Date","Status","Marks"].map(h=><th key={h} className="wdm-hist-th">{h}</th>)}</tr></thead>
                      <tbody>{(hData.assignments||[]).map((a,i)=>(
                        <tr key={i} className="wdm-hist-tr">
                          <td className="wdm-hist-td-medium">{a.title||"Assignment "+(i+1)}</td>
                          <td className="wdm-hist-td-secondary">{a.subject_name||"-"}</td>
                          <td className="wdm-hist-td-secondary">{fmtDate(a.due_date)}</td>
                          <td className="wdm-hist-td"><span className="wdm-badge-pill" style={{ "--badge-bg": a.submitted?"#dcfce7":"#fef9c3", "--badge-color": a.submitted?"#166534":"#854d0e" }}>{a.submitted?"Submitted":"Pending"}</span></td>
                          <td className="wdm-hist-td">{a.marks_obtained!=null?a.marks_obtained+"/"+a.total_marks:"-"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                ) : hTab==="quizzes" ? (
                  (!hData.quizzes||hData.quizzes.length===0) ?
                    <div className="wdm-hist-empty">No quizzes found.</div> :
                    <table className="wdm-hist-table">
                      <thead><tr className="wdm-hist-th-row">{["Quiz","Subject","Date","Score","Grade"].map(h=><th key={h} className="wdm-hist-th">{h}</th>)}</tr></thead>
                      <tbody>{(hData.quizzes||[]).map((q,i)=>(
                        <tr key={i} className="wdm-hist-tr">
                          <td className="wdm-hist-td-medium">{q.title||"Quiz "+(i+1)}</td>
                          <td className="wdm-hist-td-secondary">{q.subject_name||"-"}</td>
                          <td className="wdm-hist-td-secondary">{fmtDate(q.quiz_date||q.created_at)}</td>
                          <td className="wdm-hist-td" style={{ fontWeight: q.score!=null?600:400 }}><span className="wdm-quiz-score" style={{ "--score-color": q.score!=null?"#2563eb":"var(--color-text-secondary)" }}>{q.score!=null?q.score+"/"+q.total_marks:"-"}{q.percentage!=null?" ("+Number(q.percentage).toFixed(1)+"%)":""}</span></td>
                          <td className="wdm-hist-td"><span className="wdm-grade-letter">{q.grade||"-"}</span></td>
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
