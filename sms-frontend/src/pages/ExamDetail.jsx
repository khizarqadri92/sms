import React from "react";
﻿import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import "./ExamDetail.css";
import "./ExamResultsExtra.css";

const STATUS_STYLES = {
  draft:      { bg:"var(--bg-hover)", color:"var(--text-secondary)", label:"Draft" },
  scheduled:  { bg:"var(--bg-info-soft)", color:"#1e40af", label:"Scheduled" },
  marks_open: { bg:"var(--bg-warning-soft)", color:"#854d0e", label:"Marks Open" },
  submitted:  { bg:"var(--bg-info-soft)", color:"#0369a1", label:"Submitted" },
  compiled:   { bg:"rgba(124,58,237,0.12)", color:"#5b21b6", label:"Compiled" },
  reviewed:   { bg:"rgba(190,24,93,0.12)", color:"#9d174d", label:"Reviewed" },
  approved:   { bg:"var(--bg-success-soft)", color:"#166534", label:"Approved" },
  published:  { bg:"var(--bg-success-soft)", color:"#166534", label:"Published" },
};

const DS_STYLES = {
  draft:     { bg:"var(--bg-hover)", color:"var(--text-secondary)", label:"Datesheet: Draft" },
  submitted: { bg:"var(--bg-info-soft)", color:"#1e40af", label:"Datesheet: Awaiting Approval" },
  approved:  { bg:"var(--bg-warning-soft)", color:"#854d0e", label:"Datesheet: Approved" },
  published: { bg:"var(--bg-success-soft)", color:"#166534", label:"Datesheet: Published" },
};



function DatesheetTab({examId, canManage, navigate, examsApi, detail}) {
  const [datesheet, setDatesheet] = React.useState([]);
  const [loading,   setLoading]   = React.useState(true);

  React.useEffect(()=>{
    examsApi.getSubjects(examId).then(r=>{
      setDatesheet(Array.isArray(r.data.data)?r.data.data:[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[examId]);

  const dates = [...new Set(datesheet.map(s=>s.exam_date||""))].filter(Boolean).sort();
  const classes = [...new Map(datesheet.map(s=>[s.class_id,{class_id:s.class_id,class_name:s.class_name,section:s.section}])).values()];
  const cellMap = {};
  datesheet.forEach(s=>{ cellMap[s.class_id+"__"+s.exam_date]=s; });

  return (
    <div>
      <div className="ed-dt-header-row">
        <div className="ed-dt-title">{detail.datesheet_status==="published"?"Published Datesheet":"Datesheet"}</div>
        {canManage&&detail.datesheet_status!=="published"&&(
          <button onClick={()=>navigate("/datesheet?exam="+examId)} className="ed-manage-btn">Manage Datesheet</button>
        )}
      </div>
      {loading?<div className="ed-loading-text">Loading...</div>:
      datesheet.length===0?<div className="ed-empty-wrap">No datesheet entries yet.</div>:(
        <div className="ed-dt-table-wrap">
          <div style={{overflowX:"auto"}}>
            <table className="ed-dt-table">
              <thead>
                <tr>
                  <th className="ed-dt-th-class">Class</th>
                  {dates.map(d=>{
                    const dt=new Date(d+"T00:00:00");
                    return (
                      <th key={d} className="ed-dt-th-date">
                        <div className="ed-dt-day-label">{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                        <div className="ed-dt-day-num">{dt.getDate()}</div>
                        <div className="ed-dt-day-month">{dt.toLocaleDateString("en-PK",{month:"short",year:"numeric"})}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {classes.map(cls=>(
                  <tr key={cls.class_id}>
                    <td className="ed-dt-td-class">
                      <div className="ed-dt-td-class-name">{cls.class_name}</div>
                      {cls.section&&<div className="ed-dt-td-class-section">Section {cls.section}</div>}
                    </td>
                    {dates.map(d=>{
                      const cell=cellMap[cls.class_id+"__"+d];
                      return (
                        <td key={d} className="ed-dt-td-cell" style={{ "--cell-bg": cell?"var(--bg-card)":"var(--color-background-secondary)" }}>
                          {cell?(
                            <div className="ed-dt-cell-entry">
                              <div className="ed-dt-cell-subject">{cell.subject_name}</div>
                              <div className="ed-dt-cell-time">{cell.start_time?String(cell.start_time).slice(0,5):""} · {cell.duration_mins}min</div>
                              {cell.venue&&<div className="ed-dt-cell-venue">{cell.venue}</div>}
                              {cell.teacher_name&&<div className="ed-dt-cell-teacher">{cell.teacher_name}</div>}
                            </div>
                          ):<span className="ed-dt-cell-empty">—</span>}
                        </td>
                      );
                    })}
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

function ResultsTab({examId, detail, canManage, canApprove, canCompile, canPublish, acting, doAction, examsApi}) {
  const [compStatus,    setCompStatus]    = React.useState(null);
  const [selectedClass, setSelectedClass] = React.useState(null);
  const [classResults,  setClassResults]  = React.useState(null);
  const [loadingClass,  setLoadingClass]  = React.useState(false);
  const [finalRes,      setFinalRes]      = React.useState(null);   // {is_final, mode, byStudent}
  const [busyDoc,       setBusyDoc]       = React.useState("");

  // download a PDF from an axios blob request
  const downloadPdf = async (key, request, filename) => {
    setBusyDoc(key);
    try {
      const r = await request();
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch(e){
      let m = "Download failed.";
      try { const t = JSON.parse(await e.response.data.text()); m = t.message || t.detail?.message || m; } catch {}
      alert(m);
    } finally { setBusyDoc(""); }
  };

  const loadFinal = async (cls) => {
    try {
      const f = await examsApi.getFinalResults(examId, cls.class_id);
      const d = f.data.data || {};
      setFinalRes({ is_final: d.is_final, configured: d.configured, mode: d.mode,
                    byStudent: Object.fromEntries((d.results||[]).map(r=>[r.student_id, r])) });
    } catch { setFinalRes(null); }
  };

  const recalcFinal = async () => {
    await doAction(()=>examsApi.computeFinalResults(examId,{class_id:selectedClass.class_id}),"Final result recalculated.");
    await loadFinal(selectedClass);
  };

  React.useEffect(()=>{
    examsApi.getCompilationStatus(examId).then(r=>setCompStatus(r.data.data)).catch(()=>{});
  },[examId]);

  const [reminding, setReminding] = React.useState({});

  const sendReminder = async (userId, name, type) => {
    setReminding(p=>({...p,[userId]:true}));
    try {
      const msg = type==="compile"
        ? "All subject marks have been submitted. Please compile the results for your class."
        : "Please submit your exam marks as soon as possible.";
      const title = type==="compile" ? "Please Compile Results" : "Marks Submission Reminder";
      await examsApi.sendReminder(examId, {user_id:userId, title, message:msg});
      alert("Reminder sent to "+name);
    } catch(e){ alert("Failed to send reminder."); }
    finally { setReminding(p=>({...p,[userId]:false})); }
  };

  const loadClassResults = async (cls) => {
    if(selectedClass?.class_id===cls.class_id){ setSelectedClass(null); setClassResults(null); return; }
    setSelectedClass(cls);
    setLoadingClass(true);
    try {
      if(cls.is_compiled){
        const r = await examsApi.getClassResults(examId, cls.class_id);
        setClassResults({...r.data.data, mode:"compiled"});
        await loadFinal(cls);
      } else {
        setFinalRes(null);
        const r = await examsApi.getClassMarksSummary(examId, cls.class_id);
        const d = r.data.data||{};
        console.log("pending summary:", JSON.stringify(d));
        setClassResults({subjects: d.subjects||[], all_submitted: d.all_submitted, incharge: d.incharge||null, mode:"pending"});
      }
    } catch(e){}
    finally { setLoadingClass(false); }
  };

  const subjects = classResults?.subjects||[];
  const students = classResults?.students||[];
  const examStatus = compStatus?.exam_status || detail.status;
  const otherPending = compStatus?.other_campuses_pending || [];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Action bar */}
      <div className="ed-rt-action-bar">
        <div>
          <div className="ed-rt-title">Results Overview</div>
          <div className="ed-rt-subtitle">
            {compStatus?compStatus.compiled+"/"+compStatus.total+" classes compiled"+(compStatus.not_required?" · "+compStatus.not_required+" without students (not required)":""):"Loading..."}
          </div>
        </div>
        <div className="ed-rt-btn-row">
          {compStatus?.all_compiled&&canManage&&!canApprove&&examStatus==="compiled"&&(
            <button disabled={acting} onClick={()=>doAction(()=>examsApi.updateStatus(examId,{status:"reviewed"}),"Sent for principal approval.")} className="ed-action-btn" style={{background:"#7c3aed"}}>Send for Principal Approval</button>
          )}
          {compStatus?.all_compiled&&canApprove&&examStatus==="compiled"&&(
            <span className="ed-rt-waiting-text">Waiting for the academic coordinator to send these results for your approval.</span>
          )}
          {examStatus==="reviewed"&&!canApprove&&(
            <span className="ed-rt-waiting-text">Sent to the principal - waiting for approval.</span>
          )}
          {examStatus==="approved"&&!canPublish&&(
            <span className="ed-rt-waiting-text">Approved by the principal - waiting to be published by someone with publish permission.</span>
          )}
          {examStatus==="reviewed"&&canApprove&&(
            <button disabled={acting} onClick={()=>doAction(()=>examsApi.approve(examId),"Results approved.")} className="ed-action-btn" style={{background:"#166534"}}>Approve Results</button>
          )}
          {examStatus==="approved"&&canPublish&&(
            <button disabled={acting} onClick={()=>doAction(()=>examsApi.publish(examId),"Results published!")} className="ed-action-btn" style={{background:"#166534"}}>Publish Results</button>
          )}
          {!compStatus?.all_compiled&&!["reviewed","approved","published"].includes(examStatus)&&(
            <span className="ed-rt-waiting-text">Waiting for all classes to compile results</span>
          )}
          {compStatus?.all_compiled&&otherPending.length>0&&!["reviewed","approved","published"].includes(examStatus)&&(
            <span className="ed-rt-waiting-text">
              Your classes are all compiled. This exam is shared, so approval waits for:{" "}
              {otherPending.map(o=>o.campus+" ("+o.compiled+"/"+o.total+" classes compiled)").join(", ")}
            </span>
          )}
          {examStatus==="published"&&(
            <span className="ed-rt-published-text">Results Published</span>
          )}
        </div>
      </div>

      <div className="ed-rt-content-grid" style={{ "--content-cols": selectedClass?"280px 1fr":"1fr" }}>
        {/* Class List */}
        <div className="ed-rt-class-list-wrap">
          <div className="ed-rt-class-list-header">Classes</div>
          {(compStatus?.classes||[]).map((cls,i)=>(
            <div key={i} onClick={()=>!cls.not_required&&loadClassResults(cls)}
              className={"ed-rt-class-row"+(cls.not_required?" ed-rt-class-row--off":"")}
              style={{ "--row-bg": selectedClass?.class_id===cls.class_id?"var(--bg-success-soft)":"var(--bg-card)", "--row-border": selectedClass?.class_id===cls.class_id?"#0f4c35":cls.is_compiled?"#22c55e":"var(--border-color)" }}>
              <div className="ed-rt-class-top-row">
                <div className="ed-rt-class-name">{cls.class_name}{cls.section?" ("+cls.section+")":""}</div>
                {cls.not_required
                  ? <span className="ed-rt-norequired-tag">No students</span>
                  : cls.is_compiled
                  ? <span className="ed-rt-compiled-tag">Compiled</span>
                  : <span className="ed-rt-pending-tag">Pending</span>
                }
              </div>
              <div className="ed-rt-class-meta-row">
                <span>Incharge: {cls.incharge_name||"-"}</span>
              </div>
              <div className="ed-rt-class-subjects-row">
                <span>Subjects: <strong style={{color:cls.subjects_submitted===cls.subjects_total&&cls.subjects_total>0?"#166534":"#854d0e"}}>{cls.subjects_submitted}/{cls.subjects_total}</strong></span>
                <span>Students: {cls.student_count}</span>
              </div>
              <div className="ed-rt-class-cta">{cls.not_required?"Not required — no marks or compiling needed":cls.is_compiled?"Click to view results":"Click to view marks status"}</div>
            </div>
          ))}
        </div>

        {/* Class Results Detail */}
        {selectedClass&&(
          <div className="ed-rt-detail-wrap">
            <div className="ed-rt-detail-header">
              <div>
                <div className="ed-rt-detail-title">{selectedClass.class_name}{selectedClass.section?" ("+selectedClass.section+")":""} — {classResults?.mode==="pending"?"Marks Status":"Results"}</div>
                <div className="ed-rt-detail-subtitle">{classResults?.mode==="pending"?(classResults?.subjects?.length||0)+" subjects":(students.length+" students · "+subjects.length+" subjects")}</div>
              </div>
              <button onClick={()=>{setSelectedClass(null);setClassResults(null);}} className="ed-rt-close-btn">&#215;</button>
            </div>
            {loadingClass?<div className="ed-loading-text">Loading...</div>:classResults?.mode==="pending"?(
              <div className="ed-rt-pending-body">
                <div className="ed-rt-pending-title">Subject Marks Status</div>
                {/* Class Incharge Info */}
  {classResults?.incharge&&(
                  <div className="ed-rt-incharge-box">
                    <div>
                      <div className="ed-rt-incharge-label">Class Incharge</div>
                      <div className="ed-rt-incharge-name">{classResults.incharge.name}</div>
                    </div>
                    {classResults?.all_submitted&&(
                      <button disabled={reminding[classResults.incharge.user_id]} onClick={()=>sendReminder(classResults.incharge.user_id,classResults.incharge.name,"compile")} className="ed-rt-remind-btn">
                        {reminding[classResults.incharge.user_id]?"Sending...":"Remind to Compile"}
                      </button>
                    )}
                  </div>
                )}

                <div className="ed-rt-subjects-stack">
                  {(classResults?.subjects||[]).map((s,i)=>(
                    <div key={i} className="ed-rt-subject-row" style={{ "--subj-bg": s.marks_submitted?"var(--bg-success-soft)":"var(--bg-warning-soft)", "--subj-border": s.marks_submitted?"#bbf7d0":"#fde68a" }}>
                      <div style={{flex:1}}>
                        <div className="ed-rt-subject-name">{s.subject_name}</div>
                        <div className="ed-rt-subject-meta-row">
                          {s.subject_teacher_name
                            ? <span className="ed-rt-teacher-assigned">{s.subject_teacher_name}</span>
                            : <span className="ed-rt-teacher-none">No teacher assigned</span>
                          }
                          {s.exam_date&&<span className="ed-rt-exam-date"> {s.exam_date}</span>}
                        </div>
                      </div>
                      <div className="ed-rt-subject-actions">
                        {s.marks_submitted
                          ? <span className="ed-rt-submitted-tag">Submitted</span>
                          : <>
                              <span className="ed-rt-pending-marks-tag">Pending</span>
                              {s.teacher_user_id&&(
                                <button disabled={reminding[s.teacher_user_id]} onClick={()=>sendReminder(s.teacher_user_id,s.subject_teacher_name,"marks")} className="ed-rt-remind-subject-btn">
                                  {reminding[s.teacher_user_id]?"...":"Remind"}
                                </button>
                              )}
                            </>
                        }
                      </div>
                    </div>
                  ))}
                </div>
                {classResults?.all_submitted&&(
                  <div className="ed-rt-all-submitted-box">
                    <span>All marks submitted. Waiting for class incharge to compile.</span>
                    {canCompile&&(
                      <button disabled={acting} onClick={()=>doAction(()=>examsApi.compileResults(examId,{class_id:selectedClass.class_id}),"Class compiled.")} className="ed-rt-compile-btn">
                        {acting?"Compiling...":"Compile Now"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ):(
              <>
              {finalRes?.is_final&&(
                <div className="ed-fr-bar">
                  <div>
                    <div className="ed-fr-bar-title">Final (year) result</div>
                    <div className="ed-fr-bar-sub">
                      {finalRes.configured
                        ? "Calculated with the Result Formula ("+(finalRes.mode==="marks"?"marks":"weighted %")+") when this class is compiled."
                        : "Result Formula is not configured for this academic year."}
                    </div>
                  </div>
                  {canCompile&&finalRes.configured&&(
                    <button disabled={acting} onClick={recalcFinal} className="ed-fr-btn">{acting?"Working...":"Recalculate Final Result"}</button>
                  )}
                </div>
              )}
              {classResults?.withhold_rule?.enabled&&(
                <div className="ed-fw-note">
                  Results are withheld for students with fee unpaid for {classResults.withhold_rule.months}+ month{classResults.withhold_rule.months>1?"s":""}.
                  {" "}{students.filter(s=>s.fee_withheld).length} student(s) in this class are withheld; they see their result automatically once dues are cleared.
                </div>
              )}
              <div className="ed-rt-results-table-wrap">
                <table className="ed-rt-results-table">
                  <thead>
                    <tr className="ed-rt-th-row">
                      <th className="ed-rt-th-sticky-0">#</th>
                      <th className="ed-rt-th-sticky-30">Student</th>
                      {subjects.map(s=>(
                        <th key={s.name} className="ed-rt-th-subject">
                          <div>{s.name}</div>
                          <div className="ed-rt-th-subject-max">/{s.total}</div>
                        </th>
                      ))}
                      <th className="ed-rt-th-total">Total</th>
                      <th className="ed-rt-th-total">Obtained</th>
                      <th className="ed-rt-th-total">%</th>
                      <th className="ed-rt-th">Grade</th>
                      <th className="ed-rt-th">Pos</th>
                      <th className="ed-rt-th">Result</th>
                      {finalRes?.is_final&&<th className="ed-rt-th ed-fr-th">Final %</th>}
                      {finalRes?.is_final&&<th className="ed-rt-th ed-fr-th">Final Result</th>}
                      <th className="ed-rt-th">Documents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s,i)=>(
                      <tr key={s.id} className="ed-rt-tr" style={{ "--row-bg": i%2===0?"var(--bg-card)":"var(--color-background-secondary)" }}>
                        <td className="ed-rt-td-rank">{s.class_position||i+1}</td>
                        <td className="ed-rt-td-student">
                          <div className="ed-rt-student-name">{s.first_name} {s.last_name}</div>
                          {s.fee_withheld&&<span className="ed-fw-tag" title={"Fee unpaid for "+s.fee_due_months+" month(s)"}>Fee withheld · {s.fee_due_months} mo</span>}
                          <div className="ed-rt-student-enrollment">{s.enrollment_no}</div>
                        </td>
                        {subjects.map(sub=>{
                          const sm = s.subject_marks?.[sub.name];
                          return (
                            <td key={sub.name} className="ed-rt-td-subject">
                              {sm?.absent
                                ? <span className="ed-rt-absent-text">Absent</span>
                                : <span style={{fontWeight:600,color:sm&&sm.marks>=(sub.passing??sub.total*0.4)?"#166534":"#991b1b"}}>{sm?.marks??"-"}</span>
                              }
                            </td>
                          );
                        })}
                        <td className="ed-rt-td-total">{s.total_marks}</td>
                        <td className="ed-rt-td-result-color" style={{ "--result-color": s.is_pass?"#166534":"#991b1b" }}>{s.marks_obtained}</td>
                        <td className="ed-rt-td-result-color" style={{ "--result-color": s.is_pass?"#166534":"#991b1b" }}>{s.percentage}%</td>
                        <td className="ed-rt-td-grade">{s.grade}</td>
                        <td className="ed-rt-td-pos">{s.class_position}</td>
                        <td className="ed-rt-td-pass">
                          {s.is_pass
                            ? <span className="ed-rt-pass-tag">Pass</span>
                            : s.is_compartment
                            ? <span className="ed-rt-comp-tag" title={(s.subjects_failed||0)+" subject(s) failed"}>Compartment</span>
                            : <span className="ed-rt-fail-tag">Fail</span>
                          }
                        </td>
                        {finalRes?.is_final&&(()=>{ const f = finalRes.byStudent?.[s.id]; return (<>
                          <td className="ed-rt-td-pos ed-fr-td">{f?f.percentage.toFixed(2)+"%":"-"}{f?.grade?<div className="ed-fr-grade">{f.grade} · #{f.class_position}</div>:null}</td>
                          <td className="ed-rt-td-pass ed-fr-td">{!f?<span className="ed-fr-none">Not calculated</span>
                            : f.is_pass?<span className="ed-rt-pass-tag">Pass</span>
                            : f.is_compartment?<span className="ed-rt-comp-tag">Compartment</span>
                            : <span className="ed-rt-fail-tag">Fail</span>}</td>
                        </>); })()}
                        <td className="ed-fr-docs">
                          <button className="ed-fr-doc-btn" disabled={busyDoc==="card"+s.id}
                            onClick={()=>downloadPdf("card"+s.id, ()=>examsApi.downloadResultCard(examId, s.id), "ResultCard_"+(s.enrollment_no||s.id)+".pdf")}>
                            {busyDoc==="card"+s.id?"...":"Result Card"}
                          </button>
                          {finalRes?.is_final&&finalRes.byStudent?.[s.id]?.is_pass&&(
                            <button className="ed-fr-doc-btn ed-fr-doc-btn--cert" disabled={busyDoc==="cert"+s.id}
                              onClick={()=>downloadPdf("cert"+s.id, ()=>examsApi.downloadCertificate(examId, s.id), "Certificate_"+(s.enrollment_no||s.id)+".pdf")}>
                              {busyDoc==="cert"+s.id?"...":"Certificate"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExamDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const activeTab = searchParams.get("tab") || "overview";
  const setTab = (t) => setSearchParams({tab:t});

  const canManage  = can("exam.manage");
  const canApprove = can("exam.approve");
  const canMarks   = can("exam.marks");
  const canCompile = can("exam.compile");
  const canPublish = can("exam.publish");

  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash,   setFlash]   = useState({});
  const [acting,      setActing]      = useState(false);
  const [compStatus,  setCompStatus]  = useState(null);

  const notify = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash({}),4000); };

  const loadDetail = async () => {
    try {
      const r = await examsApi.getOne(Number(id));
      setDetail(r.data.data);
    } catch(e){ notify("error","Failed to load exam."); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadDetail(); },[id]);

  useEffect(()=>{
    if(activeTab==="results"&&detail){
      examsApi.getCompilationStatus(Number(id)).then(r=>setCompStatus(r.data.data)).catch(()=>{});
    }
  },[activeTab,detail]);

  const doAction = async (fn, msg) => {
    setActing(true);
    try { await fn(); notify("success", msg); loadDetail(); }
    catch(e){ notify("error", e.response?.data?.message||"Failed."); }
    finally { setActing(false); }
  };

  if(loading) return <div className="ed-loading-text">Loading...</div>;
  if(!detail) return <div className="ed-loading-text">Exam not found.</div>;

  const ds = detail.datesheet_status || "draft";
  const dsStyle = DS_STYLES[ds] || DS_STYLES.draft;
  const stStyle = STATUS_STYLES[detail.status] || STATUS_STYLES.draft;

  const tabs = [
    {k:"overview", l:"Overview"},
    {k:"datesheet", l:"Datesheet"},
    ...(canMarks&&(detail.status==="marks_open"||detail.status==="compiled"||detail.status==="reviewed"||detail.status==="approved"||detail.status==="published") ? [{k:"marks",l:"Marks"}] : []),
    ...((["marks_open","submitted","compiled","reviewed","approved","published"].includes(detail.status))&&(canManage||canApprove||canCompile) ? [{k:"results",l:"Results"}] : []),
  ];

  return (
    <div className="ed-page">
      {/* Back + Header */}
      <div style={{marginBottom:20}}>
        <button onClick={()=>navigate("/exams")} className="ed-back-btn">&#8592; Back to Exams</button>
        <div className="ed-header-row">
          <div>
            <div className="ed-exam-name">{detail.name}</div>
            <div className="ed-meta-row">
              <span className="ed-meta-text">{detail.exam_type_name}</span>
              <span className="ed-meta-dot">·</span>
              <span className="ed-meta-text">{detail.academic_year}</span>
              <span className="ed-meta-dot">·</span>
              <span className="ed-meta-text">{detail.class_count} class{detail.class_count!==1?"es":""}</span>
              {detail.start_date&&<><span className="ed-meta-dot">·</span><span className="ed-meta-text">{detail.start_date} — {detail.end_date}</span></>}
            </div>
          </div>
          <div className="ed-badges-row">
            <span className="ed-badge" style={{ "--badge-bg": dsStyle.bg, "--badge-color": dsStyle.color }}>{dsStyle.label}</span>
            <span className="ed-badge" style={{ "--badge-bg": stStyle.bg, "--badge-color": stStyle.color }}>{stStyle.label}</span>
          </div>
        </div>
      </div>

      {flash.msg&&<div className="ed-flash" style={{ "--flash-bg": flash.type==="error"?"var(--bg-danger-soft)":"var(--bg-success-soft)", "--flash-border": flash.type==="error"?"#fecaca":"#bbf7d0", "--flash-color": flash.type==="error"?"#991b1b":"#166534" }}>{flash.msg}</div>}

      {/* Progress Steps */}
      <div className="ed-progress-card">
        <div className="ed-progress-row">
          {[
            {label:"Create",done:true},
            {label:"Datesheet",done:["published","approved","submitted"].includes(detail.datesheet_status||""), v:detail.datesheet_status||"Not started"},
            {label:"Marks Entry",done:["submitted","compiled","reviewed","approved","published"].includes(detail.status),active:detail.status==="marks_open"},
            {label:"Compile",done:["compiled","reviewed","approved","published"].includes(detail.status)},
            {label:"Approve",done:["approved","published"].includes(detail.status),active:detail.status==="reviewed"},
            {label:"Publish",done:detail.status==="published",active:detail.status==="approved"},
          ].map((s,i,arr)=>(
            <div key={i} className="ed-progress-step">
              <div className="ed-step-col">
                <div className="ed-step-dot" style={{ "--dot-bg": s.done?"#0f4c35":s.active?"#2563eb":"var(--border-color)", "--dot-color": s.done||s.active?"#fff":"var(--text-muted)" }}>
                  {s.done?"✓":i+1}
                </div>
                <div className="ed-step-label" style={{ "--label-weight": s.active?700:500, "--label-color": s.active?"#2563eb":s.done?"#0f4c35":"var(--text-muted)" }}>{s.label}</div>
              </div>
              {i<arr.length-1&&<div className="ed-step-line" style={{ "--line-bg": s.done?"#0f4c35":"var(--border-color)" }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ed-action-row">

        {canManage&&detail.datesheet_status==="draft"&&detail.datesheet_published===false&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.submitDatesheet(Number(id)),"Datesheet submitted.")} className="ed-action-btn" style={{background:"#0f4c35"}}>Submit Datesheet</button>
        )}
        {canApprove&&detail.datesheet_status==="submitted"&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.approveDatesheet(Number(id)),"Datesheet approved.")} className="ed-action-btn" style={{background:"#166534"}}>Approve Datesheet</button>
        )}

        {canManage&&detail.datesheet_published&&detail.status==="scheduled"&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.openMarks(Number(id)),"Marks entry opened!")} className="ed-action-btn" style={{background:"#d97706"}}>Open Marks Entry</button>
        )}
        {canMarks&&detail.status==="marks_open"&&(
          <button onClick={()=>navigate("/exam-marks?exam="+id)} className="ed-action-btn" style={{background:"#854d0e"}}>Enter Marks</button>
        )}


      </div>

      {/* Tabs */}
      <div className="ed-tabs-row">
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} className="ed-tab-btn"
            style={{ "--tab-border": activeTab===t.k?"#0f4c35":"transparent", "--tab-color": activeTab===t.k?"#0f4c35":"var(--text-secondary)", "--tab-weight": activeTab===t.k?700:500 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab==="overview"&&(
        <div className="ed-overview-grid">
          <div className="ed-overview-card">
            <div className="ed-overview-title">Exam Details</div>
            {[
              {l:"Exam Name", v:detail.name},
              {l:"Type", v:detail.exam_type_name},
              {l:"Academic Year", v:detail.academic_year},
              {l:"Classes", v:(detail.class_names||detail.class_count+" classes")},
              {l:"Start Date", v:detail.start_date||"-"},
              {l:"End Date", v:detail.end_date||"-"},
            ].map((row,i)=>(
              <div key={i} className="ed-detail-row">
                <div className="ed-detail-label">{row.l}</div>
                <div className="ed-detail-value">{row.v}</div>
              </div>
            ))}
          </div>
          <div className="ed-overview-card">
            <div className="ed-overview-title">Status Timeline</div>
            {[
              {l:"Exam Created", done:true, v:"Exam record created"},
              {l:"Datesheet", done:["published","approved"].includes(detail.datesheet_status||""), v:detail.datesheet_status||"Not started"},
              {l:"Marks Entry", done:["marks_open","compiled","reviewed","approved","published"].includes(detail.status), v:["marks_open","compiled","reviewed","approved","published"].includes(detail.status)?"Done":"Not started"},
              {l:"Results Compiled", done:["compiled","reviewed","approved","published"].includes(detail.status), v:["compiled","reviewed","approved","published"].includes(detail.status)?"Done":"Pending"},
              {l:"Results Approved", done:["approved","published"].includes(detail.status), v:["approved","published"].includes(detail.status)?"Approved":detail.status==="reviewed"?"Awaiting Approval":"Pending"},
              {l:"Results Published", done:detail.status==="published", v:detail.status==="published"?"Published":"Pending"},
            ].map((row,i)=>(
              <div key={i} className="ed-timeline-row">
                <div className="ed-timeline-dot" style={{ "--dot-bg": row.done?"#0f4c35":"var(--border-color)" }}>
                  {row.done&&<span className="ed-timeline-check">✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div className="ed-timeline-label">{row.l}</div>
                  <div className="ed-timeline-value">{row.v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Datesheet Tab */}
      {activeTab==="datesheet"&&<DatesheetTab examId={Number(id)} canManage={canManage} navigate={navigate} examsApi={examsApi} detail={detail} />}

      {/* Marks Tab */}
      {activeTab==="marks"&&(
        <div className="ed-marks-tab-card">
          <div className="ed-marks-tab-icon">📝</div>
          <div className="ed-marks-tab-title">Exam Marks Entry</div>
          <div className="ed-marks-tab-desc">Enter and manage student marks for each subject.</div>
          <button onClick={()=>navigate("/exam-marks?exam="+id)} className="ed-goto-marks-btn">Go to Marks Entry →</button>
        </div>
      )}

      {/* Results Tab */}
      {activeTab==="results"&&<ResultsTab examId={Number(id)} detail={detail} canManage={canManage} canApprove={canApprove} canCompile={canCompile} canPublish={canPublish} acting={acting} doAction={doAction} examsApi={examsApi} />}

    </div>
  );
}