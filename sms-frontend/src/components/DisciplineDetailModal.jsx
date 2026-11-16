import React, { useState, useEffect } from "react";
import { disciplineApi } from "../api/disciplineApi";
import workflowApi from "../api/workflowApi";
import { useAuth } from "../auth/AuthContext";
import client from "../api/client";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "./DatePicker";
import "./DisciplineDetailModal.css";

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
    <div className="ddm-overlay">
      <div className="ddm-box">
        {/* Header */}
        <div className="ddm-header">
          <div>
            {wfStep ? (<>
              <span className="ddm-header-label">Current Step: </span>
              <span className="ddm-header-step">{wfStep.step_name}</span>
              {wfStep.assigned_role&&<span className="ddm-header-role">({wfStep.assigned_role.replace(/_/g," ")})</span>}
            </>) : <span className="ddm-header-status">{detail?.status?.replace(/_/g," ").toUpperCase()||"CASE DETAIL"}</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {/* Content */}
        <div className="ddm-content">
          {flashMsg&&<div className="ddm-flash" style={{ "--flash-bg": flashMsg.type==="success"?"#dcfce7":"#fee2e2", "--flash-color": flashMsg.type==="success"?"var(--text-success-soft)":"var(--text-danger-soft)" }}>{flashMsg.msg}</div>}

          {loading ? <div className="ddm-loading">Loading...</div> : detail && (<>
            {/* Case Info */}
            <div className="ddm-case-info">
              <div className="ddm-student-name">{detail.student_name}</div>
              <div className="ddm-student-meta">{detail.class_name}{detail.section?" - "+detail.section:""}</div>
              <div className="ddm-badge-row">
                <span className="ddm-violation-badge">{detail.violation_type}</span>
                <span className="ddm-severity-badge" style={{ "--severity-color": SEVERITY_COLORS[detail.severity]||"#94a3b8" }}>
                  Severity: {SEVERITY_LABELS[detail.severity]||detail.severity}
                </span>
                <span className="ddm-incident-date">Incident: {detail.incident_date}</span>
              </div>
            </div>

            <div className="ddm-desc-box">
              <div className="ddm-label">DESCRIPTION</div>
              {detail.description}
            </div>

            {/* Evidence Section */}
            {evidence.length>0&&(
              <div className="ddm-evidence-box">
                <div className="ddm-evidence-label">EVIDENCE</div>
                {evidence.map((ev,i)=>(
                  <div key={i} className="ddm-evidence-item">
                    <span className="ddm-evidence-link"
                      onClick={()=>disciplineApi.downloadEvidence(caseId,ev.id)}>
                      📎 {ev.filename||"Evidence "+(i+1)}
                    </span>
                    <span className="ddm-evidence-uploader">{ev.uploaded_by_name||""}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Evidence */}
            {permissions.includes("discipline.report") && (
            <div className="ddm-upload-wrap">
              <div className="ddm-upload-row">
                <input type="file" className="ddm-file-input" onChange={e=>setEvidenceFile(e.target.files[0])}/>
                <button className="btn btn-ghost btn-sm ddm-upload-btn" disabled={!evidenceFile||uploadingEvidence}
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
            )}

            {/* Committee info if assigned */}
            {committeeInfo&&committeeInfo.head&&(
              <div className="ddm-committee-box">
                <div className="ddm-committee-label">HEARING COMMITTEE</div>
                <div className="ddm-committee-body">
                  <strong>Head:</strong> {committeeInfo.head?.name||committeeInfo.head_name}
                  {detail.hearing_date&&<span className="ddm-hearing-date">📅 {formatDate(detail.hearing_date)}</span>}
                </div>
                {committeeInfo.members&&committeeInfo.members.length>0&&(
                  <div className="ddm-committee-members">
                    Members: {committeeInfo.members.map(m=>m.name||m.teacher_name).join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Progress */}
            <div className="ddm-section">
              <div className="ddm-section-label">PROGRESS</div>
              {TIMELINE.map((step,i)=>(
                <div key={i} className="ddm-timeline-row" style={{ "--row-opacity": (!step.done&&!step.current)?0.4:1 }}>
                  <div className="ddm-timeline-dot-col">
                    <div className="ddm-timeline-dot" style={{ "--dot-bg": step.done?"#22c55e":step.current?"#f97316":"var(--border-color)", "--dot-color": (step.done||step.current)?"#fff":"var(--text-muted)" }}>
                      {step.done?"✓":i+1}
                    </div>
                    {i<TIMELINE.length-1&&<div className="ddm-timeline-connector" style={{ "--connector-bg": step.done?"#22c55e":"var(--border-color)" }}/>}
                  </div>
                  <div className="ddm-timeline-content">
                    <div className="ddm-timeline-label">
                      {step.label}
                      {step.current&&<span className="ddm-current-tag">Current</span>}
                    </div>
                    {step.by&&<div className="ddm-timeline-by">{step.by}</div>}
                    {step.at&&<div className="ddm-timeline-at">
                      {formatDate(step.at)}
                      {step.note&&<span className="ddm-timeline-note">"{step.note}"</span>}
                    </div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Section */}
            {/* Committee Member Remarks Form */}
            {isCommitteeMember && (
              <div className="ddm-remarks-box" style={{ "--box-bg": isCommitteeCompleted?"var(--bg-success-soft)":"var(--bg-warning-soft)", "--box-border": isCommitteeCompleted?"var(--border-success-soft)":"var(--border-warning-soft)" }}>
                <div className="ddm-remarks-title" style={{ "--title-color": isCommitteeCompleted?"var(--text-success-soft)":"var(--text-warning-soft)" }}>
                  {isCommitteeCompleted?"✓ REMARKS SUBMITTED":"SUBMIT YOUR HEARING REMARKS"}
                </div>
                {isCommitteeCompleted ? (
                  <div className="ddm-remarks-completed">You have already submitted your remarks for this case.</div>
                ) : (<>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Your Remarks *</div>
                    <textarea className="form-input ddm-textarea-full" rows={4}
                      value={remarksForm.remarks} onChange={e=>setRemarksForm(p=>({...p,remarks:e.target.value}))}
                      placeholder="Describe your assessment of the case based on the hearing..."/>
                  </div>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Recommendation</div>
                    <select className="form-input ddm-select-full"
                      value={remarksForm.recommendation} onChange={e=>setRemarksForm(p=>({...p,recommendation:e.target.value}))}>
                      <option value="">Select recommendation...</option>
                      {["warning","suspension","expulsion","dismissed"].map(r=>(
                        <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end-single">
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting||!remarksForm.remarks.trim()}
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
              <div className="ddm-summary-box">
                <div className="ddm-summary-title-sm">COMMITTEE HEARING REPORTS</div>
                {committeeInfo.filter(m=>m.is_head).map((m,i)=>(
                  <div key={"h"+i} className="ddm-head-card">
                    <div className="ddm-head-card-row">
                      <span className="ddm-head-name">{m.teacher_name} <span className="ddm-head-tag">● Head</span></span>
                      <span className="ddm-head-status" style={{ "--status-color": m.submitted_at?"#16a34a":"#f97316" }}>{m.submitted_at?"✓ Submitted":"Pending"}</span>
                    </div>
                    {m.recommendation&&<div className="ddm-recommendation">Final Recommendation: <strong className="ddm-recommendation-value">{m.recommendation}</strong></div>}
                    {m.remarks&&<div className="ddm-remarks-quote">"{m.remarks}"</div>}
                  </div>
                ))}
                {committeeInfo.filter(m=>!m.is_head).map((m,i)=>(
                  <div key={i} className="ddm-head-member-row" style={{ "--row-opacity": m.submitted_at?1:0.6 }}>
                    <div className="ddm-member-row">
                      <span className="ddm-head-name">{m.teacher_name}</span>
                      <span className="ddm-member-status" style={{ "--status-color": m.submitted_at?"#16a34a":"var(--text-muted)" }}>{m.submitted_at?"✓":"Pending"}</span>
                    </div>
                    {m.recommendation&&<div className="ddm-member-recommendation">Recommendation: <strong>{m.recommendation}</strong></div>}
                    {m.remarks&&<div className="ddm-remarks-quote">"{m.remarks}"</div>}
                  </div>
                ))}
              </div>
            )}

            {wfStep && (
              <div className="ddm-action-box">

                {/* REVIEW */}
                {wfStep.step_type==="review" && (<>
                  <div className="ddm-step-title">REVIEW CASE</div>
                  <textarea className="form-input ddm-textarea-full" rows={3} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Review notes (optional)"/>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end">
                    <button className="btn btn-ghost btn-sm ddm-reject-btn" disabled={acting}
                      onClick={()=>act("dismiss")}>Dismiss Case</button>
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting}
                      onClick={()=>act("approve")}>{acting?"Processing...":"Approve Case"}</button>
                  </div>
                </>)}

                {/* ASSIGN COMMITTEE */}
                {wfStep.step_type==="assign_committee" && (<>
                  <div className="ddm-step-title">ASSIGN COMMITTEE & SCHEDULE HEARING</div>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Hearing Date & Time *</div>
                    <div className="ddm-datetime-row">
                      <div className="ddm-flex1">
                        <DatePicker
                          value={committee.hearing_date ? committee.hearing_date.split("T")[0] : ""}
                          onChange={val => setCommittee(p => ({...p, hearing_date: val ? `${val}T${(p.hearing_date && p.hearing_date.split("T")[1]) || "00:00"}` : ""}))}
                        />
                      </div>
                      <input type="time" className="form-input ddm-time-input"
                        value={committee.hearing_date ? committee.hearing_date.split("T")[1] || "" : ""}
                        onChange={e => setCommittee(p => ({...p, hearing_date: `${(p.hearing_date && p.hearing_date.split("T")[0]) || ""}T${e.target.value}`}))}/>
                    </div>
                  </div>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Hearing Location *</div>
                    <input type="text" className="form-input ddm-input-full"
                      placeholder="e.g. Conference Room, Principal Office..."
                      value={committee.hearing_location} onChange={e=>setCommittee(p=>({...p,hearing_location:e.target.value}))}/>
                  </div>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Committee Members (select multiple)</div>
                    <select multiple className="form-input ddm-multi-select"
                      onChange={e=>setCommittee(p=>({...p,teacher_ids:Array.from(e.target.selectedOptions,o=>o.value)}))}>
                      {teachers.map(t=><option key={t.id} value={t.id}>{t.first_name} {t.last_name} — {t.subject||t.designation||""}</option>)}
                    </select>
                    <div className="ddm-hint">Hold Ctrl/Cmd to select multiple</div>
                  </div>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Committee Head</div>
                    <select className="form-input ddm-select-full"
                      value={committee.head_id} onChange={e=>setCommittee(p=>({...p,head_id:e.target.value}))}>
                      <option value="">Select head from members...</option>
                      {committee.teacher_ids.map(id=>{
                        const t = teachers.find(x=>String(x.id)===String(id));
                        return t ? <option key={id} value={id}>{t.first_name} {t.last_name}</option> : null;
                      })}
                    </select>
                  </div>
                  <div className="ddm-appearance-box">
                    <div className="ddm-appearance-title">WHO WILL APPEAR BEFORE COMMITTEE</div>
                    <div className="ddm-appearance-desc">Select persons required to appear. They will be notified with the hearing date and time.</div>
                    {appearanceCandidates.map((cand,idx)=>(
                      <div key={idx} className="ddm-candidate-row" style={{
                        "--row-bg": selectedAppearance.includes(cand.user_id)?"var(--bg-info-soft)":"var(--bg-hover)",
                        "--row-border": selectedAppearance.includes(cand.user_id)?"var(--border-info-soft)":"var(--border-color)",
                        "--row-cursor": cand.user_id?"pointer":"default", "--row-opacity": cand.user_id?1:0.5 }}
                        onClick={()=>{
                          if(!cand.user_id) return;
                          setSelectedAppearance(p=>p.includes(cand.user_id)?p.filter(x=>x!==cand.user_id):[...p,cand.user_id]);
                        }}>
                        <input type="checkbox" readOnly checked={!!selectedAppearance.includes(cand.user_id)} className="ddm-candidate-checkbox"/>
                        <div>
                          <div className="ddm-candidate-name">{cand.name}</div>
                          <div className="ddm-candidate-label-text">{cand.label}</div>
                        </div>
                        {!cand.user_id&&<span className="ddm-no-account">No account</span>}
                      </div>
                    ))}
                  </div>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end-single">
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting}
                      onClick={()=>act("assign_committee")}>{acting?"Assigning...":"Assign Committee & Notify"}</button>
                  </div>
                </>)}

                {/* HEARING */}
                {wfStep.step_type==="hearing" && (<>
                  <div className="ddm-step-title-mb12">COMMITTEE HEARING REPORTS</div>
                  {committeeInfo&&committeeInfo.length>0 ? (<>
                    {/* Committee Head Final Recommendation */}
                    {committeeInfo.filter(m=>m.is_head).map((m,i)=>(
                      <div key={"head-"+i} className="ddm-head-card-final">
                        <div className="ddm-summary-title-sm">COMMITTEE HEAD — FINAL RECOMMENDATION</div>
                        <div className="ddm-head-name-mb">{m.name||m.teacher_name}</div>
                        {m.submitted_at ? (<>
                          {m.recommendation&&<div className="ddm-recommendation-mb">
                            <strong>Recommendation:</strong> <span className="ddm-recommendation-value">{m.recommendation}</span>
                          </div>}
                          {m.remarks&&<div className="ddm-remarks-quote">"{m.remarks}"</div>}
                        </>) : <div className="ddm-awaiting">⏳ Awaiting submission</div>}
                      </div>
                    ))}
                    {/* Other Members */}
                    <div className="ddm-members-label">COMMITTEE MEMBERS</div>
                    {committeeInfo.filter(m=>!m.is_head).map((m,i)=>(
                      <div key={i} className="ddm-member-card" style={{ "--card-bg": m.submitted_at?"var(--bg-success-soft)":"var(--bg-hover)", "--card-border": m.submitted_at?"var(--border-success-soft)":"var(--border-color)" }}>
                        <div className="ddm-member-row" style={{ marginBottom: m.remarks?6:0 }}>
                          <span className="ddm-member-name">{m.name||m.teacher_name}</span>
                          <span className="ddm-member-status" style={{ "--status-color": m.submitted_at?"#16a34a":"var(--text-muted)" }}>
                            {m.submitted_at?"✓ Submitted":"Pending"}
                          </span>
                        </div>
                        {m.recommendation&&<div className="ddm-member-recommendation">Recommendation: <strong>{m.recommendation}</strong></div>}
                        {m.remarks&&<div className="ddm-remarks-quote">"{m.remarks}"</div>}
                      </div>
                    ))}
                  </>) : <div className="ddm-no-data">No committee data found.</div>}
                  <div className="ddm-hearing-hint">
                    After all members have submitted, mark the hearing as complete to proceed to final decision.
                  </div>
                  <textarea className="form-input ddm-textarea-full" rows={2} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Hearing summary notes (optional)"/>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end-single">
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting}
                      onClick={()=>act("hearing")}>{acting?"Processing...":"Mark Hearing Complete"}</button>
                  </div>
                </>)}

                {/* APPEAL REVIEW */}
                {wfStep.step_type==="appeal_review" && (<>
                  <div className="ddm-step-title-purple">REVIEW APPEAL</div>
                  <div className="ddm-appeal-note-box">
                    <strong>Appeal Note:</strong> {detail?.appeal_note||"No note provided."}
                  </div>
                  <textarea className="form-input ddm-textarea-full" rows={3} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Review notes (optional)"/>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end">
                    <button className="btn btn-ghost btn-sm ddm-reject-btn" disabled={acting}
                      onClick={async()=>{
                        setActing(true);
                        try{ if(!note.trim()){setError("Please provide rejection reason.");setActing(false);return;}
                          await disciplineApi.forwardAppeal(caseId,{note,action:"reject"});
                          flash("success","Appeal rejected."); setTimeout(()=>{loadData();onActed&&onActed();},1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>Reject Appeal</button>
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting}
                      onClick={()=>act("appeal_review")}>{acting?"Processing...":"Forward to Principal"}</button>
                  </div>
                </>)}

                {/* APPEAL DECIDE */}
                {wfStep.step_type==="appeal_decide" && (<>
                  <div className="ddm-step-title-purple">APPEAL DECISION</div>
                  <div className="ddm-appeal-note-box">
                    <strong>Appeal Note:</strong> {detail?.appeal_note||"No note provided."}
                  </div>
                  <textarea className="form-input ddm-textarea-full" rows={3} value={note}
                    onChange={e=>setNote(e.target.value)} placeholder="Decision reasoning (required)"/>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end">
                    <button className="btn btn-ghost btn-sm ddm-reject-btn" disabled={acting||!note.trim()}
                      onClick={async()=>{
                        if(!note.trim()){setError("Please provide reasoning.");return;}
                        setActing(true);
                        try{ await disciplineApi.respondAppeal(caseId,{outcome:"upheld",response:note});
                          flash("success","Appeal rejected — original decision stands.");
                          setTimeout(()=>{loadData();onActed&&onActed();},1200);
                        }catch(e){setError(e.response?.data?.message||"Failed.");}
                        finally{setActing(false);}
                      }}>Reject Appeal</button>
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting||!note.trim()}
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
                  <div className="ddm-step-title-mb12">FINAL DECISION</div>
                  <div className="ddm-field-wrap">
                    <div className="ddm-field-label">Decision</div>
                    <select className="form-input ddm-select-full" value={decideForm.action_type}
                      onChange={e=>setDecideForm(p=>({...p,action_type:e.target.value}))}>
                      {["warning","suspension","expulsion","dismissed"].map(o=>(
                        <option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  {decideForm.action_type==="suspension"&&(
                    <div className="ddm-suspension-row">
                      <div className="ddm-flex1">
                        <div className="ddm-field-label">Suspension From</div>
                        <DatePicker style={{width:"100%",fontSize:13}} value={decideForm.suspension_from}
                          onChange={val=>setDecideForm(p=>({...p,suspension_from:val}))}/>
                      </div>
                      <div className="ddm-flex1">
                        <div className="ddm-field-label">Suspension To</div>
                        <DatePicker style={{width:"100%",fontSize:13}} value={decideForm.suspension_to}
                          onChange={val=>setDecideForm(p=>({...p,suspension_to:val}))}/>
                      </div>
                    </div>
                  )}
                  <textarea className="form-input ddm-textarea-full" rows={2}
                    placeholder="Decision note..." value={decideForm.note}
                    onChange={e=>setDecideForm(p=>({...p,note:e.target.value}))}/>
                  {error&&<div className="ddm-error-text">{error}</div>}
                  <div className="ddm-btn-row-end">
                    <button className="btn btn-ghost btn-sm ddm-reject-btn" disabled={acting}
                      onClick={()=>disciplineApi.review(caseId,{action:"dismiss",note:decideForm.note}).then(()=>{flash("success","Case dismissed.");setTimeout(()=>{loadData();onActed&&onActed();},1200);}).catch(e=>setError(e.response?.data?.message||"Failed."))}>
                      Dismiss
                    </button>
                    <button className="btn btn-primary btn-sm ddm-btn-white" disabled={acting}
                      onClick={()=>act("decide")}>{acting?"Processing...":"Submit Decision"}</button>
                  </div>
                </>)}

              </div>
            )}
          </>)}
            {/* Parent Appeal Section */}
            {isParent && detail && ["warning","suspension","expulsion","dismissed"].includes(detail.status) && (
              <div className="ddm-parent-appeal-box" style={{ "--box-bg": detail.appeal_submitted?"var(--bg-success-soft)":"var(--bg-purple-soft)", "--box-border": detail.appeal_submitted?"var(--border-success-soft)":"var(--border-purple-soft)" }}>
                <div className="ddm-parent-appeal-title" style={{ "--title-color": detail.appeal_outcome==="rejected"?"var(--text-danger-soft)":detail.appeal_submitted?"var(--text-success-soft)":"var(--text-purple-soft)" }}>
                  {detail.appeal_outcome==="rejected"?"✗ APPEAL REJECTED":detail.appeal_outcome==="upheld"?"✓ APPEAL UPHELD":detail.appeal_submitted?"⏳ UNDER REVIEW":"APPEAL DECISION"}
                </div>
                {detail.appeal_outcome==="rejected" ? (
                  <div className="ddm-rejected-msg">Your appeal has been rejected. The original decision stands.</div>
                ) : detail.appeal_outcome==="upheld" ? (
                  <div className="ddm-upheld-msg">Your appeal has been upheld. The original decision has been overturned.</div>
                ) : detail.appeal_submitted ? (
                  <div className="ddm-under-review-msg">Your appeal has been submitted and is under review.</div>
                ) : canAppeal ? (<>
                  {detail.appeal_deadline&&<div className="ddm-deadline">
                    Appeal deadline: <strong>{formatDate(detail.appeal_deadline)}</strong>
                  </div>}
                  {!showAppeal ? (
                    <button className="btn btn-sm ddm-purple-btn"
                      onClick={()=>setShowAppeal(true)}>Submit Appeal</button>
                  ) : (<>
                    <textarea className="form-input ddm-appeal-note-textarea" rows={3}
                      value={appealNote} onChange={e=>setAppealNote(e.target.value)}
                      placeholder="Explain why you are appealing this decision..."/>
                    <div className="ddm-btn-row-end">
                      <button className="btn btn-ghost btn-sm" onClick={()=>setShowAppeal(false)}>Cancel</button>
                      <button className="btn btn-sm ddm-purple-btn-sm" disabled={appealSubmitting||!appealNote.trim()}
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
                  <div className="ddm-not-available">
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