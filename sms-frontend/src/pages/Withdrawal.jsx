import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { withdrawalApi } from "../api/withdrawalApi";
import workQueueApi from "../api/workQueueApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import workflowApi from "../api/workflowApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import studentsApi from "../api/studentsApi";
import client from "../api/client";
import "./Withdrawal.css";

const STATUS_STYLES = {
  pending:           { bg:"var(--bg-warning-soft)", color:"#854d0e", border:"#fde047", label:"Pending"          },
  under_review:      { bg:"var(--bg-info-soft)", color:"#1e40af", border:"#93c5fd", label:"Under Review"     },
  clearance:         { bg:"rgba(124,58,237,0.12)", color:"#5b21b6", border:"#c4b5fd", label:"Clearance"        },
  coordinator_final: { bg:"var(--bg-warning-soft)", color:"#854d0e", border:"#fde047", label:"Final Processing" },
  approved:          { bg:"var(--bg-success-soft)", color:"#166534", border:"#86efac", label:"Approved"         },
  rejected:          { bg:"var(--bg-danger-soft)", color:"#991b1b", border:"#fca5a5", label:"Rejected"         },
  withdrawn:         { bg:"var(--bg-hover)", color:"var(--text-secondary)", border:"var(--border-color-strong)", label:"Withdrawn"        },
};
const DEPT_LABELS = { finance:"Finance", library:"Library", admin:"Admin", hr:"HR", transport:"Transport" };
const WITHDRAWAL_REASONS = [
  "Family relocating to another city/country",
  "Admission in another school",
  "Financial constraints",
  "Health/medical reasons",
  "Family personal reasons",
  "Completion of studies",
  "Other",
];

const StatusBadge = ({status}) => {
  const s = STATUS_STYLES[status] || { bg:"var(--bg-hover)", color:"var(--text-secondary)", border:"var(--border-color)", label:status };
  return <span className="wd-status-badge" style={{ "--badge-bg": s.bg, "--badge-color": s.color, "--badge-border": s.border }}>{s.label}</span>;
};

export default function Withdrawal() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";
  const { user, can } = useAuth();
  const role    = effectiveRole(user) || "";
  const canApply   = can("withdrawal.withdrawal_request");
  const canReview  = can("withdrawal.withdrawal_review");
  const [wfStep, setWfStep]   = useState(null);
  const [wfSteps, setWfSteps] = useState([]);
  const [wfStatus, setWfStatus] = useState(null);
  const [hasActionRequired, setHasActionRequired] = useState(false);
  const [wfExists, setWfExists] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [wfDone, setWfDone]   = useState(false);
  const { user: wfUser, roles: wfRoles } = useAuth();
  const navigate = useNavigate();
  const fromWQ = new URLSearchParams(window.location.search).get("from") === "wq";
  const userRoles = wfRoles || [];

  // Auto-open modal from URL when coming from Work Queue
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get("id");
    const fromWq = params.get("from") === "wq";
    if (urlId && fromWq) { setShowModal(true); loadDetail(Number(urlId)); }
  }, [user?.id]);

  const loadWfStep = async (id) => {
    try {
      const r = await workflowApi.getInstance("withdrawal", "withdrawal_request", id);
      const inst = r.data.data;
      setWfExists(!!inst);
      setWfDone(inst?.status === "completed");
      setWfStatus(inst?.status || null);
      const steps = inst?.steps || [];
      setWfSteps(steps);
      const uid = wfUser?.id;
      const pending = steps.find(s => s.status === "pending" && (
        s.assigned_to_id === uid ||
        (s.assigned_role && userRoles.some(r => r===s.assigned_role || r?.name===s.assigned_role))
      ));
      setWfStep(pending || null);
    } catch { setWfStep(null); setWfExists(false); setWfDone(false); }
  };
  const canClear   = can("withdrawal.withdrawal_clearance");
  const canApprove = can("withdrawal.withdrawal_approval");

  const [list,           setList]           = useState([]);
  const [detail,         setDetail]         = useState(null);
  const [waivers, setWaivers] = useState([]);
  const [selectedWaiverDetail, setSelectedWaiverDetail] = useState(null);


  const [toast,          setToast]          = useState("");
  const [toastType,      setToastType]      = useState("success");
  const [loading,        setLoading]        = useState(false);
  const [showApply,      setShowApply]      = useState(false);
  const [action,         setAction]         = useState(null);
  const [note,           setNote]           = useState("");
  const [statusFilter,   setStatusFilter]   = useState("");
  const [teacherView,    setTeacherView]    = useState("incharge");
  const [children,       setChildren]       = useState([]);
  const [depts,          setDepts]          = useState(["finance","library","admin"]);
  const [feeData,        setFeeData]        = useState(null);
  const [showFees,       setShowFees]       = useState(false);
  const [feeLoading,     setFeeLoading]     = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [showUnpaidModal,setShowUnpaidModal]= useState(false);
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [waiverForm, setWaiverForm] = useState({invoice_id:null,waiver_type:"full",waiver_amount:"",reason:""});
  
  const [clearNote,      setClearNote]      = useState("");
  const [studentBooks,   setStudentBooks]   = useState([]);
  const [showBooksModal, setShowBooksModal] = useState(false);
  const [booksLoading,   setBooksLoading]   = useState(false);
  const [bookNote,       setBookNote]       = useState("");
  const [showRequireModal, setShowRequireModal] = useState(false);
  const [requireNote,    setRequireNote]    = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showConductModal, setShowConductModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTab, setHistoryTab] = useState("attendance");
  const [historyData, setHistoryData] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conductData,    setConductData]    = useState(null);
  const [conductForm,    setConductForm]    = useState({
    behaviour:"Good", discipline:"Good", academic_performance:"Good",
    attendance_regularity:"Good", cocurricular:"Limited",
    disciplinary_action:false, disciplinary_details:"", remarks:"", recommended_readmission:false
  });
  const [applyForm, setApplyForm] = useState({
    student_id:"", reason:"", effective_date:processingToday, document:null
  });

  const flash = (type, msg) => { setToastType(type); setToast(msg); setTimeout(()=>setToast(""),3500); };

  useEffect(() => {
    load();
    if (role==="parent") studentsApi.getMyChildren().then(r=>setChildren(r.data.data||[])).catch(()=>{});
  }, []);

  const load = async () => {
    try { const r = await withdrawalApi.getAll(); setList(r.data.data||[]); } catch { flash("error","Failed to load."); }
  };

  useEffect(() => {
    if (detail?.id && userRoles.length > 0) loadWfStep(detail.id);
  }, [detail?.id, userRoles.length]);

  const loadDetail = async (id) => {
    try {
      const r = await withdrawalApi.getOne(id);
      setDetail(r.data.data);
      withdrawalApi.getWaivers(id).then(r=>setWaivers(r.data.data||[])).catch(()=>{});

      loadWfStep(id);
      workQueueApi.getMyQueue({module:"withdrawal",status:"pending"}).then(r=>{
        const items = r.data.data||[];
        setHasActionRequired(items.some(i=>Number(i.entity_id)===Number(id)&&i.action_required==="submit"));
      }).catch(()=>{});
      setFeeData(null); setShowFees(false); setStudentBooks([]);
      try { const cr = await withdrawalApi.getConductForm(id); setConductData(cr.data.data); } catch { setConductData(null); }
    } catch { flash("error","Failed to load details."); }
  };

  const loadFees = async (studentId) => {
    setFeeLoading(true);
    try {
      const [s, inv] = await Promise.all([
        client.get("/finance/student/"+studentId),
        client.get("/finance/invoices?student_id="+studentId+"&status=unpaid"),
      ]);
      setFeeData(s.data.data);
      setUnpaidInvoices(inv.data.data||[]);
      setShowFees(true);
    } catch { flash("error","Failed to load fee details."); }
    finally { setFeeLoading(false); }
  };

  const loadBooks = async (studentId) => {
    setBooksLoading(true);
    try {
      const r = await client.get("/withdrawal/student/"+studentId+"/books");
      setStudentBooks(r.data.data||[]);
      setShowBooksModal(true); setBookNote("");
    } catch { flash("error","Failed to load books."); }
    finally { setBooksLoading(false); }
  };

  const submitApply = async () => {
    if (!applyForm.student_id||!applyForm.reason) return flash("error","Student and reason are required.");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("student_id",applyForm.student_id); fd.append("reason",applyForm.reason);
      fd.append("effective_date",applyForm.effective_date||"");
      if (applyForm.document) fd.append("document",applyForm.document);
      await withdrawalApi.apply(fd);
      flash("success","Withdrawal request submitted."); setShowApply(false);
      setApplyForm({student_id:"",reason:"",effective_date:processingToday,document:null});
      load();
    } catch(e){ flash("error",e.response?.data?.message||"Failed."); }
    finally { setLoading(false); }
  };

  const loadHistory = async (studentId, tab) => {
    setHistoryTab(tab); setHistoryLoading(true);
    try {
      if (tab === "attendance") {
        const r = await client.get("/students/"+studentId+"/attendance", {params:{from:new Date(new Date(processingToday).setMonth(new Date(processingToday).getMonth()-3)).toISOString().split("T")[0],to:processingToday}});
        setHistoryData(prev => ({...prev, attendance: r.data.data||[]}));
      } else if (tab === "grades") {
        const r = await client.get("/students/"+studentId+"/grades");
        // Backend returns {exams: [...], subjects: [...]} (exam-level summary
        // rows plus per-subject detail rows, each tagged with exam_id) - keep
        // this shape so the UI can group subjects under their exam rather
        // than mixing every exam's subjects into one flat list.
        setHistoryData(prev => ({...prev, grades: { exams: r.data.data?.exams || [], subjects: r.data.data?.subjects || [] }}));
      } else if (tab === "fees") {
        const r = await client.get("/finance/student/"+studentId);
        setHistoryData(prev => ({...prev, fees: r.data.data}));
      } else if (tab === "assignments") {
        const beforeDate = detail?.principal_at ? detail.principal_at.substring(0,10) : (detail?.effective_date ? detail.effective_date.substring(0,10) : "");
        const r = await client.get("/assignments/student-history?student_id="+studentId+(beforeDate?"&before_date="+beforeDate:""));
        setHistoryData(prev => ({...prev, assignments: r.data.data||[]}));
      } else if (tab === "quizzes") {
        const beforeDate = detail?.principal_at ? detail.principal_at.substring(0,10) : (detail?.effective_date ? detail.effective_date.substring(0,10) : "");
        const r = await client.get("/quizzes/student-history?student_id="+studentId+(beforeDate?"&before_date="+beforeDate:""));
        setHistoryData(prev => ({...prev, quizzes: r.data.data||[]}));
      }
    } catch(e) { console.log("History error:", e); } finally { setHistoryLoading(false); }
  };

  const openHistory = async (studentId) => {
    setHistoryData({}); setShowHistoryModal(true); setHistoryTab("attendance");
    loadHistory(studentId, "attendance");
  };

  const doAction = async (fn) => {
    setLoading(true);
    try { await fn(); setAction(null); setNote(""); load(); if(detail) loadDetail(detail.id); }
    catch(e){ flash("error",e.response?.data?.message||"Failed."); }
    finally { setLoading(false); }
  };

  const inchargeList = list.filter(w=>w.is_incharge!==false||(role!=="teacher"));
  const subjectList  = list.filter(w=>w.is_incharge===false);
  const viewList     = role==="teacher" ? (teacherView==="incharge" ? inchargeList : subjectList) : list;
  const filteredList = statusFilter ? viewList.filter(w=>w.status===statusFilter) : viewList;
  const myDept       = {finance_officer:"finance",librarian:"library",admin:"admin",hr:"hr"}[role];

  const TIMELINE_STEPS = detail ? (() => {
    const allCleared = detail.clearances?.length>0 && detail.clearances.every(c=>c.status==="cleared");
    return [
      {label:"Application Submitted",  done:true,                                            current:false,                                                       by:detail.requested_by_name, at:detail.requested_at},
      {label:"Coordinator Review",      done:!!detail.coordinator_at&&detail.status!=="rejected", current:detail.status==="pending",                              by:detail.coordinator_name,  at:detail.coordinator_at, note:detail.coordinator_note},
      {label:"Department Clearances",   done:allCleared,                                      current:detail.status==="clearance",                               by:null, at:null},
      {label:"Teacher Conduct Form",    done:!!detail.teacher_conduct_submitted,               current:detail.status==="under_review"&&!detail.teacher_conduct_submitted, by:null, at:null},
      {label:"Principal Approval",      done:!!detail.principal_at&&detail.status!=="rejected",current:detail.status==="under_review"&&!!detail.teacher_conduct_submitted, by:detail.principal_name, at:detail.principal_at, note:detail.principal_note},
      {label:"Final Processing",        done:detail.status==="approved"||detail.status==="withdrawn", current:detail.status==="coordinator_final",               by:null, at:null},
      {label:"Withdrawal Completed",    done:detail.status==="withdrawn",                     current:detail.status==="approved",                                by:null, at:null},
    ];
  })() : [];

  return (
    <div>
      <div className="page-header" style={fromWQ?{display:"none"}:{}}>
        <h1 className="page-heading">Student Withdrawal</h1>
        {canApply && <button className="btn btn-primary" onClick={()=>setShowApply(true)}>+ Apply for Withdrawal</button>}
      </div>

      {toast && <div className={"alert wd-toast "+(toastType==="error"?"alert-error":"alert-success")}>{toast}</div>}

      <div style={fromWQ?{display:"none"}:{}}>

        {/* ── LEFT PANEL ── */}
        <div>
          {/* Teacher Toggle */}
          {role==="teacher" && (
            <div className="wd-teacher-toggle">
              {[{label:"Incharge ("+inchargeList.length+")",value:"incharge"},{label:"Subject ("+subjectList.length+")",value:"subject"}].map(v=>(
                <button key={v.value} onClick={()=>{setTeacherView(v.value);setDetail(null);}} className="wd-teacher-toggle-btn"
                  style={{ "--toggle-bg": teacherView===v.value?"var(--color-background-primary)":"transparent", "--toggle-color": teacherView===v.value?"var(--color-text-primary)":"var(--color-text-secondary)", "--toggle-weight": teacherView===v.value?600:400, "--toggle-shadow": teacherView===v.value?"0 1px 3px rgba(0,0,0,0.08)":"none" }}>
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {/* Status Filter */}
          {!canApply && (
            <div className="wd-filter-row">
              {["","pending","clearance","under_review","coordinator_final","approved","withdrawn","rejected"].map(f=>(
                <button key={f} onClick={()=>setStatusFilter(f)} className="wd-filter-pill"
                  style={{ "--pill-border": statusFilter===f?"var(--color-border-info)":"var(--color-border-tertiary)", "--pill-bg": statusFilter===f?"var(--color-background-info)":"var(--color-background-primary)", "--pill-color": statusFilter===f?"var(--color-text-info)":"var(--color-text-secondary)", "--pill-weight": statusFilter===f?600:400 }}>
                  {f===""?"All":STATUS_STYLES[f]?.label||f}
                </button>
              ))}
              <span className="wd-filter-count">{filteredList.length} request{filteredList.length!==1?"s":""}</span>
            </div>
          )}

          {/* List */}
          {filteredList.length===0 ? (
            <div className="wd-empty-text">No withdrawal requests found.</div>
          ) : (
            <div className="wd-table-wrap">
              <table className="wd-table">
                <thead>
                  <tr className="wd-th-row">
                    {["Student","Class","Reason","Departments","Applied","Status",""].map(h=>(
                      <th key={h} className="wd-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((w,i)=>{
                    const active = detail?.id===w.id;
                    return (
                      <tr key={w.id} className="wd-tr" style={{ "--row-bg": active?"var(--bg-hover)":"var(--bg-card)" }} onClick={()=>loadDetail(w.id)}>
                        <td className="wd-td">
                          <div className="wd-td-name">{w.student_name}</div>
                          <div className="wd-td-sub">{w.enrollment_no}</div>
                        </td>
                        <td className="wd-td-primary">{w.class_name}{w.section?" ("+w.section+")":""}</td>
                        <td className="wd-td-reason">{w.reason?.slice(0,50)}{w.reason?.length>50?"...":""}</td>
                        <td className="wd-td">
                          <div className="wd-dept-tags">
                            {(w.clearances||[]).map(c=>(
                              <span key={c.department} className="wd-dept-tag" style={{ "--tag-bg": c.status==="cleared"?"var(--bg-success-soft)":c.status==="rejected"?"var(--bg-danger-soft)":"var(--bg-hover)", "--tag-color": c.status==="cleared"?"#166534":c.status==="rejected"?"#991b1b":"var(--text-secondary)" }}>{DEPT_LABELS[c.department]||c.department}</span>
                            ))}
                          </div>
                        </td>
                        <td className="wd-td-secondary-nowrap">{fmtDate(w.requested_at)}</td>
                        <td className="wd-td"><StatusBadge status={w.status} /></td>
                        <td className="wd-td">
                          <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();loadDetail(w.id);setShowModal(true);}}>View</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        {detail && showModal && (
          <div className="wd-modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setDetail(null);setShowModal(false);if(fromWQ)navigate("/work-queue");}}}>
            <div className="wd-detail-panel">
              <div className="wd-detail-stack">

              {/* Parent Action Required Response */}
              {hasActionRequired && !wfStep && (
              <div className="section-card wd-action-bar" style={{ "--bar-bg": "var(--bg-warning-soft)", "--bar-border": "var(--border-warning-soft)", "--bar-label-color": "var(--text-warning-soft)" }}>
                <div>
                  <span className="wd-action-bar-label">Action Required: </span>
                  <span className="wd-action-bar-text">The department has requested you to submit information.</span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={async()=>{
                  try{
                    await withdrawalApi.parentRespond(detail.id,{note:"Parent responded"});
                    flash("success","Response submitted. Department notified.");
                    setHasActionRequired(false); loadDetail(detail.id);
                  }catch(e){flash("error","Failed.");}
                }}>Mark as Submitted</button>
              </div>
            )}
              {/* Workflow Action Bar */}
              {wfStep && !showModal && (
              <div className="section-card wd-action-bar" style={{ "--bar-bg": "var(--bg-info-soft)", "--bar-border": "var(--border-info-soft)", "--bar-label-color": "var(--text-info-soft)" }}>
                <div>
                  <span className="wd-action-bar-label" style={{color:"var(--text-primary)"}}>Current Step: </span>
                  <span className="wd-action-bar-text-colored">{wfStep.step_name}</span>
                  {wfStep.assigned_role&&<span className="wd-action-bar-role">({wfStep.assigned_role.replace(/_/g," ")})</span>}
                </div>
                <div className="wd-action-bar-btns">
                  <button className="btn btn-primary btn-sm" onClick={async()=>{
                    try{
                      await withdrawalApi[wfStep.step_type==="approve"?"approve":wfStep.step_type==="review"?"review":"clear"](detail.id,{action:wfStep.step_type==="approve"?"approve":"clear",note:""});
                      flash("success","Done."); loadDetail(detail.id);
                    }catch(e){flash("error",e.response?.data?.message||"Failed.");}
                  }}>{wfStep.action_label||wfStep.step_name}</button>
                  <button className="btn btn-ghost btn-sm" style={{color:"#b45309"}} onClick={async()=>{
                    const reason=prompt("What does the parent need to do?");
                    if(!reason)return;
                    try{await withdrawalApi.stepActionRequired(detail.id,{note:reason});flash("success","Action request sent.");}
                    catch(e){flash("error","Failed.");}
                  }}>Require Action from Parent</button>
                  {wfStep.can_reject!==false&&(
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} onClick={async()=>{
                      const note=prompt("Rejection reason:");
                      if(!note)return;
                      try{
                        await withdrawalApi[wfStep.step_type==="approve"?"approve":"review"](detail.id,{action:"reject",note});
                        flash("success","Rejected."); loadDetail(detail.id);
                      }catch(e){flash("error",e.response?.data?.message||"Failed.");}
                    }}>{wfStep.reject_label||"Reject"}</button>
                  )}
                </div>
              </div>
            )}
            {/* Header Card */}
            <div className="section-card wd-header-card">
              <div className="wd-header-top">
                <div>
                  <div className="wd-header-name">{detail.student_name}</div>
                  <div className="wd-header-meta">{detail.enrollment_no} &middot; {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div className="wd-header-badges-row">
                    <StatusBadge status={detail.status} />
                    {detail.effective_date && <span className="wd-effective-text">Effective: {fmtDate(detail.effective_date)}</span>}
                    {role==="teacher"&&!detail.is_incharge&&<span className="wd-subject-teacher-tag">Subject Teacher</span>}
                  </div>
                </div>
<div className="wd-header-actions">
                  <button className="btn btn-ghost btn-sm" onClick={()=>openHistory(detail.student_id)}>View History</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setDetail(null);setShowModal(false);if(fromWQ)navigate("/work-queue");}}>Close</button>
                </div>
              </div>

              {/* Reason */}
              <div className="wd-section-block">
                <div className="wd-section-label">Reason</div>
                <div className="wd-reason-text">{detail.reason}</div>
              </div>

              {/* Timeline */}
              <div className="wd-section-block">
                <div className="wd-section-label">Progress</div>
                {(wfSteps.length>0 ? wfSteps.map((s,i)=>({label:s.step_name, done:s.status==="approved"||s.status==="skipped", current:s.status==="pending"&&wfSteps.findIndex(x=>x.status==="pending")===i, by:s.assigned_role?.replace(/_/g," "), at:s.actioned_at, note:s.note, num:s.step_order})) : TIMELINE_STEPS).map((step,i)=>(
                  <div key={i} className="wd-timeline-row" style={{ "--row-opacity": (!step.done&&!step.current)?0.4:1 }}>
                    <div className="wd-timeline-dot-col">
                      <div className="wd-timeline-dot" style={{ "--dot-bg": step.done?"#22c55e":step.current?"#2563eb":"var(--color-background-tertiary)", "--dot-border": step.current?"2px solid #2563eb":"2px solid transparent", "--dot-color": step.done||step.current?"#fff":"var(--text-muted)" }}>
                        {step.done?"✓":step.current?"●":i+1}
                      </div>
                      {i<(wfSteps.length>0?wfSteps.length:TIMELINE_STEPS.length)-1&&<div className="wd-timeline-line" style={{ "--line-bg": step.done?"#22c55e":"var(--color-border-tertiary)" }}/>}
                    </div>
                    <div className="wd-timeline-content">
                      <div className="wd-timeline-label-row">
                        <div className="wd-timeline-label" style={{ "--label-weight": step.current?700:600, "--label-color": step.current?"#2563eb":step.done?"var(--color-text-primary)":"var(--color-text-secondary)" }}>{step.label}</div>
                        {step.current&&<span className="wd-timeline-current-tag">Current</span>}
                      </div>
                      {step.by&&<div className="wd-timeline-by">{step.by}{step.at?" - "+fmtDate(step.at):""}</div>}
                      {step.note&&<div className="wd-timeline-note">"{step.note}"</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Department Clearances */}
              {detail.clearances?.length>0&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Department Clearances</div>
                  {detail.clearances.map(c=>(
                    <div key={c.department} className="wd-clearance-row" style={{ "--row-bg": c.status==="cleared"?"var(--bg-success-soft)":c.status==="rejected"?"var(--bg-danger-soft)":"var(--color-background-secondary)", "--row-border": c.status==="cleared"?"var(--border-success-soft)":c.status==="rejected"?"var(--border-danger-soft)":"var(--color-border-tertiary)" }}>
                      <div>
                        <div className="wd-clearance-name">{DEPT_LABELS[c.department]||c.department}</div>
                        {c.cleared_by_name&&<div className="wd-clearance-by">{c.cleared_by_name}{c.cleared_at?" - "+fmtDate(c.cleared_at):""}</div>}
                        {c.note&&<div className="wd-clearance-note">"{c.note}"</div>}
                      </div>
                      <span className="wd-clearance-status" style={{ "--status-bg": c.status==="cleared"?"var(--bg-success-soft)":c.status==="rejected"?"var(--bg-danger-soft)":"var(--bg-hover)", "--status-color": c.status==="cleared"?"#166534":c.status==="rejected"?"#991b1b":"var(--text-secondary)" }}>{c.status==="cleared"?"Cleared":c.status==="rejected"?"Rejected":"Pending"}</span>
                    </div>
                  ))}
                </div>
              )}

              
              
              {/* Waiver Requests - Finance/Authority View */}
              {waivers.length>0&&(role==="finance_officer"||role==="principal"||role==="superadmin"||role==="admin")&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Fee Waiver Requests</div>
                  {waivers.map(w=>(
                    <div key={w.id} className="wd-waiver-card" style={{ "--card-bg": w.status==="approved"?"var(--bg-success-soft)":w.status==="rejected"?"var(--bg-danger-soft)":w.status==="forwarded"?"var(--bg-info-soft)":"var(--bg-warning-soft)", "--card-border": w.status==="approved"?"var(--border-success-soft)":w.status==="rejected"?"var(--border-danger-soft)":w.status==="forwarded"?"var(--border-info-soft)":"var(--border-warning-soft)" }}>
                      <div className="wd-waiver-top-row">
                        <div>
                          <div className="wd-waiver-title">{w.waiver_type==="full"?"Full Waiver":"Partial Waiver"}{w.waiver_amount?" - Rs. "+w.waiver_amount:""}</div>
                          <div className="wd-waiver-by">By: {w.requester_name}{w.requested_at?" - "+fmtDate(w.requested_at):""}</div>
                          {w.reason&&<div className="wd-waiver-reason">"{w.reason}"</div>}
                          {w.action_note&&<div className="wd-waiver-note">Note: {w.action_note}</div>}
                          {w.invoice_items?.length>0&&(
                            <div className="wd-invoice-box">
                              <div className="wd-invoice-box-title">Invoice Details{w.invoice_month_year?" - "+w.invoice_month_year:""}</div>
                              {w.invoice_items.map((item,idx)=>(
                                <div key={idx} className="wd-invoice-item-row" style={{ "--item-border": idx<w.invoice_items.length-1?"1px solid var(--border-color)":"none" }}>
                                  <span className="wd-invoice-item-label">{item.label||item.type}</span>
                                  <span className="wd-invoice-item-amount">Rs. {item.amount}</span>
                                </div>
                              ))}
                              <div className="wd-invoice-total-row">
                                <span>Total Due</span>
                                <span className="wd-invoice-total-amount">Rs. {w.invoice_total}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <span className="wd-waiver-status-tag" style={{ "--status-bg": w.status==="approved"?"var(--bg-success-soft)":w.status==="rejected"?"var(--bg-danger-soft)":w.status==="forwarded"?"var(--bg-info-soft)":"var(--bg-warning-soft)", "--status-color": w.status==="approved"?"#166534":w.status==="rejected"?"#991b1b":w.status==="forwarded"?"#1d4ed8":"#92400e" }}>
                          {w.status==="forwarded"?"Forwarded to Authority":w.status.charAt(0).toUpperCase()+w.status.slice(1)}
                        </span>
                      </div>
                      {/* Finance officer sees pending waivers - can forward to authority */}
                      {w.status==="pending"&&role==="finance_officer"&&(
                        <div className="wd-waiver-actions-row">
                          <input placeholder="Note for authority (optional)" className="wd-waiver-input" style={{flex:1}} id={"fwd-note-"+w.id} />
                          <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={async()=>{
                            const note=document.getElementById("fwd-note-"+w.id)?.value||"";
                            try{await withdrawalApi.forwardWaiver(w.id,{action:"forward",note});flash("success","Waiver forwarded to authority.");withdrawalApi.getWaivers(detail.id).then(r=>setWaivers(r.data.data||[])).catch(()=>{});}
                            catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Forward to Authority</button>
                        </div>
                      )}
                      {/* Finance officer sees approved waivers - clear or generate invoice */}
                      {w.status==="approved"&&role==="finance_officer"&&(
                        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                          {w.waiver_type==="full"&&!detail.clearances?.find(c=>c.department==="finance"&&c.status==="cleared")&&(
                            <button className="btn btn-primary btn-sm" style={{background:"#166534",color:"#fff"}} onClick={async()=>{
                              try{await withdrawalApi.clear(detail.id,{action:"clear",note:"Full waiver approved by authority. Finance clearance granted."});
                              flash("success","Finance clearance marked.");load();loadDetail(detail.id);withdrawalApi.getWaivers(detail.id).then(r=>setWaivers(r.data.data||[])).catch(()=>{});}
                              catch(e){flash("error",e.response?.data?.message||"Failed.");}
                            }}>Mark Finance Cleared</button>
                          )}
                          {w.waiver_type==="partial"&&!w.new_invoice_id&&(
                            <button className="btn btn-primary btn-sm" style={{background:"#1d4ed8",color:"#fff"}} onClick={async()=>{
                              try{await withdrawalApi.generateWaiverInvoice(w.id);
                              flash("success","New invoice generated. Parent can now pay the reduced amount.");
                              withdrawalApi.getWaivers(detail.id).then(r=>setWaivers(r.data.data||[])).catch(()=>{});}
                              catch(e){flash("error",e.response?.data?.message||"Failed.");}
                            }}>Generate New Invoice</button>
                          )}
                          {w.waiver_type==="partial"&&w.new_invoice_id&&(
                            <div style={{fontSize:12,color:"#166534",fontWeight:600}}>✓ New invoice #{w.new_invoice_id} generated. Awaiting parent payment.</div>
                          )}
                        </div>
                      )}
                      {/* Authority sees forwarded waivers - can approve or reject */}
                      {w.status==="forwarded"&&(role==="principal"||role==="superadmin")&&(
                        <div className="wd-waiver-actions-row">
                          <button className="btn btn-ghost btn-sm" style={{border:"1px solid #2563eb",color:"#2563eb"}} onClick={async()=>{setSelectedWaiverDetail(w);try{const r=await withdrawalApi.getPendingInvoices(detail.id);setSelectedWaiverDetail({...w,pendingInvoices:r.data.data||[]});}catch(e){}}}>View Fee Details</button>
                          <input type="number" placeholder="Approved amount (blank = full waiver)" className="wd-waiver-input" id={"waiver-amt-"+w.id} />
                          <input placeholder="Decision note" className="wd-waiver-input-wide" id={"waiver-nt-"+w.id} />
                          <button className="btn btn-primary btn-sm" style={{background:"#166534",color:"#fff"}} onClick={async()=>{
                            const amt=document.getElementById("waiver-amt-"+w.id)?.value;
                            const note=document.getElementById("waiver-nt-"+w.id)?.value||"";
                            try{await withdrawalApi.actionWaiver(w.id,{action:"approve",note,approved_amount:amt?parseFloat(amt):null});flash("success","Waiver approved.");withdrawalApi.getWaivers(detail.id).then(r=>setWaivers(r.data.data||[])).catch(()=>{});loadDetail(detail.id);}
                            catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Approve</button>
                          <button className="btn btn-ghost btn-sm" style={{border:"1px solid #991b1b",color:"#991b1b"}} onClick={async()=>{
                            const note=document.getElementById("waiver-nt-"+w.id)?.value||"";
                            try{await withdrawalApi.actionWaiver(w.id,{action:"reject",note});flash("success","Waiver rejected.");withdrawalApi.getWaivers(detail.id).then(r=>setWaivers(r.data.data||[])).catch(()=>{});loadDetail(detail.id);}
                            catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
{/* Finance Action Required - Parent View */}
              {role==="parent"&&detail.status==="clearance"&&detail.clearances?.some(c=>c.department==="finance"&&c.status==="rejected")&&(
                <div className="wd-fee-action-notice">
                  <div className="wd-fee-action-title">Finance Action Required</div>
                  <div className="wd-fee-action-box">
                    <div className="wd-fee-action-box-title">Outstanding fee dues on your account</div>
                    <div className="wd-fee-action-box-text">{detail.clearances?.find(c=>c.department==="finance")?.note||"Please settle your outstanding dues to proceed with withdrawal."}</div>
                  </div>
                  <div className="wd-fee-action-btn-row">
                    <a href={"/my-fees?studentId="+detail.student_id} className="wd-fee-link-btn">View My Invoices</a>
                    <button className="btn btn-ghost btn-sm" style={{border:"1px solid #d97706",color:"#d97706"}}
                      onClick={()=>{setWaiverForm(f=>({...f,invoice_id:null}));setShowWaiverModal(true);}}>
                      Request Fee Waiver
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{border:"1px solid #166534",color:"#166534"}}
                      onClick={async()=>{try{
                        await fetch("/api/v1/withdrawal/"+detail.id+"/paid-notification",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(localStorage.getItem("access_token")||"")}});
                        flash("success","Finance team notified. They will verify and clear your dues.");
                      }catch(e){flash("error","Failed to notify.");}}}>
                      I Have Paid
                    </button>
                  </div>
                </div>
              )}
{/* Conduct Form Summary */}
              {(detail.status==="under_review"||detail.status==="coordinator_final"||detail.status==="approved"||detail.status==="withdrawn")&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Teacher Conduct Form</div>
                  {conductData ? (
                    <div className="wd-conduct-box">
                      <div className="wd-conduct-by">Submitted by {conductData.teacher_name}</div>
                      <div className="wd-conduct-grid">
                        {[["Behaviour",conductData.behaviour],["Discipline",conductData.discipline],["Academic",conductData.academic_performance],["Attendance",conductData.attendance_regularity],["Co-curricular",conductData.cocurricular]].map(([l,v])=>(
                          <div key={l}><span style={{color:"var(--text-secondary)"}}>{l}:</span> <strong style={{color:"var(--text-heading)"}}>{v}</strong></div>
                        ))}
                      </div>
                      {conductData.remarks&&<div className="wd-conduct-remarks">"{conductData.remarks}"</div>}
                      {conductData.disciplinary_action&&<div className="wd-conduct-disciplinary">Disciplinary: {conductData.disciplinary_details}</div>}
                      <div className="wd-conduct-readmission">Re-admission recommended: <strong>{conductData.recommended_readmission?"Yes":"No"}</strong></div>
                      {(role==="teacher"||role==="superadmin")&&<button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>setShowConductModal(true)}>Update</button>}
                    </div>
                  ) : (
                    <div className="wd-conduct-pending-box">
                      <span className="wd-conduct-pending-text">Awaiting teacher conduct form</span>
                      {(role==="teacher"||role==="superadmin"||role==="admin")&&<button className="btn btn-ghost btn-sm" style={{color:"var(--text-warning-soft)",border:"1px solid var(--border-warning-soft)"}} onClick={()=>setShowConductModal(true)}>Fill Form</button>}
                    </div>
                  )}
                </div>
              )}

              {/* Fee Details (Finance Officer) */}
              {(role==="finance_officer"||role==="superadmin")&&detail.status==="clearance"&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Fee Details</div>
                  <button className="btn btn-ghost btn-sm" disabled={feeLoading} onClick={()=>showFees?setShowFees(false):loadFees(detail.student_id)}>
                    {feeLoading?"Loading...":showFees?"Hide Fee Details":"View Fee Details"}
                  </button>
                  {showFees&&feeData&&(
                    <div className="wd-fee-summary-wrap">
                      {unpaidInvoices.length>0&&(
                        <div className="wd-fee-unpaid-bar">
                          <span className="wd-fee-unpaid-text">{unpaidInvoices.length} unpaid invoice{unpaidInvoices.length>1?"s":""}</span>
                          <button className="btn btn-ghost btn-sm" style={{color:"var(--text-danger-soft)",border:"1px solid var(--border-danger-soft)"}} onClick={()=>{setShowUnpaidModal(true);setClearNote("");}}>View</button>
                        </div>
                      )}
                      <div className="wd-fee-stats-row">
                        {[{label:"Invoices",value:feeData.total_invoices||0,color:"#2563eb"},{label:"Billed",value:"Rs."+Number(feeData.total_billed||0).toLocaleString(),color:"var(--text-secondary)"},{label:"Paid",value:"Rs."+Number(feeData.total_paid||0).toLocaleString(),color:"#166534"},{label:"Outstanding",value:"Rs."+Number(feeData.total_due||0).toLocaleString(),color:"#991b1b"},{label:"Overdue",value:feeData.overdue_count||0,color:"#dc2626"}].map(s=>(
                          <div key={s.label} className="wd-fee-stat">
                            <div className="wd-fee-stat-value" style={{ "--stat-color": s.color }}>{s.value}</div>
                            <div className="wd-fee-stat-label">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Library Books (Librarian) */}
              {(role==="librarian"||role==="superadmin")&&detail.status==="clearance"&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Library Books</div>
                  <button className="btn btn-ghost btn-sm" disabled={booksLoading} onClick={()=>loadBooks(detail.student_id)}>
                    {booksLoading?"Loading...":"Check Issued Books"}
                  </button>
                </div>
              )}

              {/* Admin Require Action */}
              {canClear&&detail.status==="clearance"&&myDept&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Actions</div>
                  <div className="wd-form-row">
                    {(() => {
                      const myClearance = detail.clearances?.find(c=>c.department===myDept);
                      if (!myClearance||myClearance.status!=="pending") return null;
                      return <>
                        {role==="admin"&&<button className="btn btn-ghost btn-sm" style={{color:"#d97706",border:"1px solid #fde68a"}} onClick={()=>{setShowRequireModal(true);setRequireNote("");}}>Require Action from Parent</button>}
                        {role==="librarian"&&<button className="btn btn-ghost btn-sm" style={{color:"#854d0e",border:"1px solid #fde68a"}} onClick={()=>loadBooks(detail.student_id)}>Check Books Before Clearing</button>}
                        <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>{setAction({id:detail.id,type:"clear",kind:"clear"});setNote("");}}>Mark Cleared</button>
                        <button className="btn btn-ghost btn-sm" style={{color:"var(--color-text-danger)"}} onClick={()=>{setAction({id:detail.id,type:"reject",kind:"clear"});setNote("");}}>Reject</button>
                      </>;
                    })()}
                  </div>
                </div>
              )}

              {/* Coordinator Review */}
              {canReview&&detail.status==="pending"&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Review Request</div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,marginBottom:6,color:"var(--color-text-secondary)"}}>Departments required for clearance:</div>
                    <div className="wd-dept-chips-row">
                      {wfSteps.filter(s=>s.step_type==="clear"||s.step_type==="verify").map((s,i)=>(
                        <span key={i} className="wd-dept-chip">
                          {(s.step_name||s.assigned_role||"").replace(/_/g," ")}
                        </span>
                      ))}
                    </div>
                    <textarea className="form-input wd-review-note-area" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                      placeholder="Add a note (optional)"/>
                  </div>
                  <div className="wd-review-actions">
                    <button className="btn btn-primary" onClick={()=>setAction({id:detail.id,type:"approve",kind:"review"})}>Review and Forward to Department</button>
                    <button className="btn btn-ghost btn-sm wd-reject-text-btn" onClick={()=>setAction({id:detail.id,type:"reject",kind:"review"})}>Reject</button>
                  </div>
                </div>
              )}

              {/* Coordinator Final */}
              {canReview&&detail.status==="coordinator_final"&&(
                <div className="wd-section-block">
                  <div className="wd-section-label">Final Processing</div>
                  <div className="wd-review-actions">
                    <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>doAction(async()=>{await withdrawalApi.finalize(detail.id,{action:"approve",note:""});flash("success","Withdrawal completed.");})}>Complete Withdrawal</button>
                    <button className="btn btn-ghost btn-sm wd-reject-text-btn" onClick={()=>doAction(async()=>{await withdrawalApi.finalize(detail.id,{action:"reject",note:""});flash("error","Rejected.");})}>Reject</button>
                  </div>
                </div>
              )}

              {/* Principal Approve */}
              {canApprove&&detail.status==="under_review"&&(
                <div className="wd-section-block-noborder">
                  <div className="wd-section-label">Principal Decision</div>
                  {!conductData&&<div style={{fontSize:12,color:"#991b1b",marginBottom:8}}>Conduct form not yet submitted by class teacher.</div>}
                  <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>setShowSummaryModal(true)}>View Summary & Approve</button>
                </div>
              )}
            </div>
          </div>
            </div>
          </div>
        )}
      </div>

      {/* STUDENT HISTORY MODAL */}
      {showHistoryModal && detail && (
        <div className="wd-history-modal-overlay">
          <div className="wd-history-modal-box">
            <div className="wd-history-header">
              <div>
                <div className="wd-history-title">{detail.student_name} - Academic History</div>
                <div className="wd-history-subtitle">{detail.enrollment_no} - {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowHistoryModal(false)}>Close</button>
            </div>
            <div className="wd-history-tabs">
              {[{key:"attendance",label:"Attendance"},{key:"grades",label:"Grades"},{key:"fees",label:"Fees"},{key:"assignments",label:"Assignments"},{key:"quizzes",label:"Quizzes"}].map(tab=>(
                <button key={tab.key} onClick={()=>loadHistory(detail.student_id,tab.key)} className="wd-history-tab"
                  style={{ "--tab-border": historyTab===tab.key?"#2563eb":"transparent", "--tab-color": historyTab===tab.key?"#2563eb":"var(--color-text-secondary)", "--tab-weight": historyTab===tab.key?600:400 }}>{tab.label}</button>
              ))}
            </div>
            <div className="wd-history-content">
              {historyLoading ? <div className="loading-state">Loading...</div> : (
                historyTab==="attendance" ? (
                  (!historyData.attendance||historyData.attendance.length===0) ?
                    <div className="wd-history-empty">No attendance records found.</div> :
                    <table className="wd-table">
                      <thead><tr className="wd-th-row">{["Date","Day","Status","Remarks"].map(h=><th key={h} className="wd-th" style={{fontSize:11,fontWeight:700}}>{h}</th>)}</tr></thead>
                      <tbody>{historyData.attendance.map((r,i)=>{const st={present:{background:"var(--bg-success-soft)",color:"#166534"},absent:{background:"var(--bg-danger-soft)",color:"#991b1b"},late:{background:"var(--bg-warning-soft)",color:"#92400e"},excused:{background:"var(--bg-info-soft)",color:"#1e40af"},on_leave:{background:"var(--bg-info-soft)",color:"#0369a1"}}[r.status]||{background:"var(--bg-hover)",color:"var(--text-secondary)"};return <tr key={i} className="wd-tr" style={{"--row-bg":"transparent"}}><td style={{padding:"8px 12px"}}>{fmtDate(r.date)}</td><td className="wd-td-secondary">{r.date?new Date(r.date).toLocaleDateString("en",{weekday:"short"}):"-"}</td><td style={{padding:"8px 12px"}}><span style={{...st,padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600}}>{r.status}</span></td><td className="wd-td-secondary">{r.remarks||"-"}</td></tr>;})}
                      </tbody>
                    </table>
                ) : historyTab==="grades" ? (
                  (!historyData.grades?.exams||historyData.grades.exams.length===0) ?
                    <div className="wd-history-empty">No grades found.</div> :
                    <div style={{display:"flex",flexDirection:"column",gap:16}}>
                      {historyData.grades.exams.map(exam=>{
                        const examSubjects=(historyData.grades.subjects||[]).filter(s=>s.exam_id===exam.exam_id);
                        return (
                          <div key={exam.exam_id} className="wd-exam-card">
                            <div className="wd-exam-header">
                              <div>
                                <div className="wd-exam-name">{exam.exam_name}</div>
                                <div className="wd-exam-date">{fmtDate(exam.start_date)}</div>
                              </div>
                              <div className="wd-exam-stats">
                                {exam.percentage!=null&&<span>Overall: <strong className="wd-exam-stat-value">{Number(exam.percentage).toFixed(1)}%</strong></span>}
                                {exam.grade_letter&&<span style={{fontWeight:700,color:"#2563eb"}}>{exam.grade_letter}</span>}
                                {exam.gpa!=null&&<span>GPA: <strong className="wd-exam-stat-value">{exam.gpa}</strong></span>}
                                {exam.class_position&&<span>Rank: <strong className="wd-exam-stat-value">#{exam.class_position}</strong></span>}
                              </div>
                            </div>
                            {examSubjects.length>0&&(
                              <table className="wd-table">
                                <thead><tr className="wd-th-row">{["Subject","Marks","%","Grade","Result"].map(h=><th key={h} className="wd-th" style={{fontSize:11,fontWeight:700}}>{h}</th>)}</tr></thead>
                                <tbody>{examSubjects.map((s,i)=>(
                                  <tr key={i} className="wd-tr" style={{"--row-bg":"transparent"}}>
                                    <td style={{padding:"6px 14px",fontWeight:500}}>{s.subject_name}</td>
                                    <td style={{padding:"6px 14px"}}>{s.is_absent?"-":`${s.marks||0}/${s.total_marks||0}`}</td>
                                    <td style={{padding:"6px 14px"}}>{s.is_absent?"-":(s.percentage!=null?Number(s.percentage).toFixed(1)+"%":"-")}</td>
                                    <td style={{padding:"6px 14px"}}><span style={{fontWeight:700,color:"#2563eb"}}>{s.grade_letter||"-"}</span></td>
                                    <td style={{padding:"6px 14px"}}>
                                      <span className="wd-result-pill" style={{"--result-bg":s.is_absent?"var(--bg-warning-soft)":s.result==="pass"?"var(--bg-success-soft)":"var(--bg-danger-soft)","--result-color":s.is_absent?"var(--text-warning-soft)":s.result==="pass"?"var(--text-success-soft)":"var(--text-danger-soft)"}}>
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
                ) : historyTab==="fees" ? (
                  !historyData.fees ?
                    <div className="wd-history-empty">No fee data found.</div> :
                    <div className="wd-fee-cards-grid">
                      {[["Total Billed","Rs."+Number(historyData.fees.total_billed||0).toLocaleString(),"#2563eb"],["Paid","Rs."+Number(historyData.fees.total_paid||0).toLocaleString(),"#166534"],["Outstanding","Rs."+Number(historyData.fees.total_due||0).toLocaleString(),"#991b1b"],["Overdue",historyData.fees.overdue_count||0,"#dc2626"]].map(([l,v,c])=>(
                        <div key={l} className="wd-fee-card" style={{"--card-color":c}}>
                          <div className="wd-fee-card-value">{v}</div>
                          <div className="wd-fee-card-label">{l}</div>
                        </div>
                      ))}
                    </div>
                ) : historyTab==="assignments" ? (
                  (!historyData.assignments||historyData.assignments.length===0) ?
                    <div className="wd-history-empty">No assignments found.</div> :
                    <table className="wd-table">
                      <thead><tr className="wd-th-row">{["Assignment","Subject","Due Date","Status","Marks"].map(h=><th key={h} className="wd-th" style={{fontSize:11,fontWeight:700}}>{h}</th>)}</tr></thead>
                      <tbody>{(historyData.assignments||[]).map((a,i)=>(
                        <tr key={i} className="wd-tr" style={{"--row-bg":"transparent"}}>
                          <td style={{padding:"8px 12px",fontWeight:500}}>{a.title||"Assignment "+(i+1)}</td>
                          <td className="wd-td-secondary">{a.subject_name||"-"}</td>
                          <td className="wd-td-secondary">{fmtDate(a.due_date)}</td>
                          <td style={{padding:"8px 12px"}}><span className="wd-result-pill" style={{"--result-bg":a.submitted?"var(--bg-success-soft)":"var(--bg-warning-soft)","--result-color":a.submitted?"#166534":"#854d0e"}}>{a.submitted?"Submitted":"Pending"}</span></td>
                          <td style={{padding:"8px 12px"}}>{a.marks_obtained!=null?a.marks_obtained+"/"+a.total_marks:"-"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                ) : historyTab==="quizzes" ? (
                  (!historyData.quizzes||historyData.quizzes.length===0) ?
                    <div className="wd-history-empty">No quizzes found.</div> :
                    <table className="wd-table">
                      <thead><tr className="wd-th-row">{["Quiz","Subject","Date","Score","Grade"].map(h=><th key={h} className="wd-th" style={{fontSize:11,fontWeight:700}}>{h}</th>)}</tr></thead>
                      <tbody>{(historyData.quizzes||[]).map((q,i)=>(
                        <tr key={i} className="wd-tr" style={{"--row-bg":"transparent"}}>
                          <td style={{padding:"8px 12px",fontWeight:500}}>{q.title||"Quiz "+(i+1)}</td>
                          <td className="wd-td-secondary">{q.subject_name||"-"}</td>
                          <td className="wd-td-secondary">{fmtDate(q.quiz_date||q.created_at)}</td>
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

      {/* APPLY MODAL */}
      {showApply&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box" style={{"--modal-max-width":"500px"}}>
            <div className="wd-modal-header">
              <div className="wd-modal-title">Apply for Withdrawal</div>
            </div>
            <div className="wd-modal-body">
              {role==="parent"&&(
                <div className="form-group" style={{marginBottom:14}}>
                  <label className="form-label">Select Child *</label>
                  <select className="form-control" value={applyForm.student_id} onChange={e=>setApplyForm(f=>({...f,student_id:e.target.value}))}>
                    <option value="">Select child</option>
                    {children.map(c=><option key={c.id} value={c.id} disabled={c.status==="withdrawn"}>
                        {c.first_name} {c.last_name} - {c.class_name}{(c.class_section||c.section)?" ("+(c.class_section||c.section)+")":""} [{c.status==="withdrawn"?"Withdrawn":"Active"}]
                      </option>)}
                  </select>
                </div>
              )}
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Reason *</label>
                <select className="form-control" style={{marginBottom:8}} onChange={e=>{if(e.target.value&&e.target.value!=="Other")setApplyForm(f=>({...f,reason:e.target.value}));else if(e.target.value==="Other")setApplyForm(f=>({...f,reason:""}));}}>
                  <option value="">-- Select a reason --</option>
                  {WITHDRAWAL_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
                <textarea className="form-control" value={applyForm.reason} onChange={e=>setApplyForm(f=>({...f,reason:e.target.value}))} placeholder="Add details or type custom reason..." style={{minHeight:70,resize:"vertical"}} />
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Effective Date</label>
                <DatePicker value={applyForm.effective_date} onChange={val=>setApplyForm(f=>({...f,effective_date:val}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Supporting Document (optional)</label>
                <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e=>setApplyForm(f=>({...f,document:e.target.files[0]}))} />
              </div>
            </div>
            <div className="wd-modal-footer">
              <button className="btn btn-secondary" onClick={()=>setShowApply(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} onClick={submitApply}>{loading?"Submitting...":"Submit Request"}</button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW NOTE MODAL */}
      {action?.kind==="review"&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box">
            <div className="wd-modal-header">
              <div className="wd-modal-title" style={{color:"var(--text-primary)"}}>{action.type==="approve"?"Forward to Departments":"Reject Request"}</div>
            </div>
            <div className="wd-modal-body">
              <div className="form-group">
                <label className="form-label">{action.type==="reject"?"Rejection Reason *":"Note (optional)"}</label>
                <textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div className="wd-modal-footer">
              <button className="btn btn-secondary" onClick={()=>setAction(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} style={{background:action.type==="reject"?"#991b1b":undefined}} onClick={()=>doAction(async()=>{await withdrawalApi.review(action.id,{action:action.type,note,departments:depts});flash("success","Done.");})}>
                {loading?"Processing...":action.type==="approve"?"Forward":"Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR NOTE MODAL */}
      {action?.kind==="clear"&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box">
            <div className="wd-modal-header">
              <div className="wd-modal-title" style={{color:"var(--text-primary)"}}>{action.type==="clear"?"Mark Department Cleared":"Reject Clearance"}</div>
            </div>
            <div className="wd-modal-body">
              <div className="form-group">
                <label className="form-label">{action.type==="reject"?"Rejection Reason *":"Note (optional)"}</label>
                <textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div className="wd-modal-footer">
              <button className="btn btn-secondary" onClick={()=>setAction(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} style={{background:action.type==="reject"?"#991b1b":"#166534"}} onClick={()=>doAction(async()=>{await withdrawalApi.clear(action.id,{action:action.type,note});flash(action.type==="clear"?"success":"error","Done.");})}>
                {loading?"Processing...":action.type==="clear"?"Mark Cleared":"Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINCIPAL SUMMARY MODAL */}
      {showSummaryModal&&detail&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box-tall" style={{"--modal-max-width":"600px"}}>
            <div className="wd-modal-header" style={{flexShrink:0}}>
              <div className="wd-modal-title" style={{color:"var(--text-primary)",fontSize:16}}>Withdrawal Summary</div>
              <div className="wd-modal-subtitle">Review all details before final approval</div>
            </div>
            <div className="wd-modal-body-scroll">
              <div style={{marginBottom:16,background:"var(--color-background-secondary)",borderRadius:8,padding:"14px 16px"}}>
                <div className="wd-section-label" style={{marginBottom:8}}>Student</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Name:</span> <strong>{detail.student_name}</strong></div>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Enrollment:</span> {detail.enrollment_no}</div>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Class:</span> {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Effective:</span> {fmtDate(detail.effective_date)}</div>
                </div>
                <div style={{marginTop:8,fontSize:13}}><span style={{color:"var(--color-text-secondary)"}}>Reason:</span> {detail.reason}</div>
              </div>
              <div style={{marginBottom:16}}>
                <div className="wd-section-label" style={{marginBottom:8}}>Clearances</div>
                {detail.clearances?.map(c=>(
                  <div key={c.department} className="wd-clearance-row" style={{ "--row-bg": c.status==="cleared"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--row-border": c.status==="cleared"?"var(--border-success-soft)":"var(--border-danger-soft)" }}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600}}>{DEPT_LABELS[c.department]||c.department}</span>
                      {c.note&&<div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{c.note}</div>}
                    </div>
                    <span className="wd-clearance-status" style={{ "--status-bg": c.status==="cleared"?"var(--bg-success-soft)":"var(--bg-danger-soft)", "--status-color": c.status==="cleared"?"#166534":"#991b1b" }}>{c.status==="cleared"?"Cleared":"Pending"}</span>
                  </div>
                ))}
              </div>
              {conductData&&(
                <div style={{marginBottom:16,background:"var(--bg-success-soft)",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-success-soft)",marginBottom:8}}>Conduct Report</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:12}}>
                    {[["Behaviour",conductData.behaviour],["Discipline",conductData.discipline],["Academic",conductData.academic_performance],["Attendance",conductData.attendance_regularity]].map(([l,v])=>(
                      <div key={l}><span style={{color:"var(--text-secondary)"}}>{l}:</span> <strong style={{color:"var(--text-success-soft)"}}>{v}</strong></div>
                    ))}
                  </div>
                  {conductData.remarks&&<div style={{marginTop:6,fontSize:12,fontStyle:"italic",color:"var(--text-secondary)"}}>"{conductData.remarks}"</div>}
                </div>
              )}
              {detail.coordinator_note&&(
                <div style={{marginBottom:16,background:"var(--bg-info-soft)",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-info-soft)",marginBottom:4}}>Coordinator Note</div>
                  <div style={{fontSize:13,color:"var(--text-info-soft)"}}>{detail.coordinator_note}</div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Principal Note (optional)</label>
                <textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:70,resize:"vertical"}} />
              </div>
            </div>
            <div className="wd-modal-footer-shrink">
              <button className="btn btn-secondary" onClick={()=>setShowSummaryModal(false)}>Cancel</button>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--color-text-danger)"}} onClick={()=>doAction(async()=>{await withdrawalApi.approve(detail.id,{action:"reject",note});setShowSummaryModal(false);flash("error","Rejected.");})}>Reject</button>
              <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>doAction(async()=>{await withdrawalApi.approve(detail.id,{action:"approve",note});setShowSummaryModal(false);flash("success","Approved. Sent to coordinator.");})}>Approve & Forward</button>
            </div>
          </div>
        </div>
      )}

      {/* REQUIRE ACTION MODAL */}
      {showRequireModal&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box" style={{"--modal-max-width":"500px"}}>
            <div className="wd-modal-header-colored" style={{"--header-bg":"var(--bg-warning-soft)",borderBottom:"1px solid var(--border-warning-soft)"}}>
              <div className="wd-modal-title-colored" style={{"--header-text":"var(--text-warning-soft)",fontSize:16}}>Require Action from Parent/Student</div>
              <div className="wd-modal-subtitle-colored" style={{"--header-text":"var(--text-warning-soft)"}}>Parent will be notified. Clearance held until resolved.</div>
            </div>
            <div className="wd-modal-body">
              <div className="form-group">
                <label className="form-label">Requirement Details *</label>
                <textarea className="form-control" value={requireNote} onChange={e=>setRequireNote(e.target.value)} placeholder="e.g. Student must return school uniform, ID card not submitted..." style={{minHeight:90,resize:"vertical"}} />
              </div>
            </div>
            <div className="wd-modal-footer">
              <button className="btn btn-secondary" onClick={()=>setShowRequireModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#d97706"}} disabled={!requireNote.trim()} onClick={async()=>{try{await withdrawalApi.requireAction(detail.id,{note:requireNote});flash("success","Requirement submitted.");setShowRequireModal(false);load();loadDetail(detail.id);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* LIBRARY BOOKS MODAL */}
      {showBooksModal&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box-tall" style={{"--modal-max-width":"560px",maxHeight:"85vh"}}>
            <div className="wd-books-header" style={{"--header-bg": studentBooks.length>0?"var(--bg-danger-soft)":"var(--bg-success-soft)"}}>
              <div style={{fontWeight:600,fontSize:16,color:studentBooks.length>0?"#991b1b":"#166534"}}>{studentBooks.length>0?"Unreturned Books":"No Issued Books"}</div>
              <div style={{fontSize:12,color:studentBooks.length>0?"#991b1b":"#166534",marginTop:2}}>{studentBooks.length>0?studentBooks.length+" book(s) must be returned before clearance":"Student has no pending book returns"}</div>
            </div>
            <div className="wd-modal-body-scroll">
              {studentBooks.length>0?(
                <>
                  <table className="wd-table" style={{marginBottom:16}}>
                    <thead>
                      <tr className="wd-th-row">
                        {["Title","Author","Issued","Due","Status"].map(h=><th key={h} className="wd-th" style={{fontSize:11,fontWeight:700}}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {studentBooks.map((b,i)=>(
                        <tr key={b.id} className="wd-tr" style={{"--row-bg": i%2===0?"var(--color-background-primary)":"var(--color-background-secondary)"}}>
                          <td style={{padding:"8px 10px",fontWeight:500}}>{b.title}</td>
                          <td className="wd-td-secondary" style={{padding:"8px 10px"}}>{b.author||"-"}</td>
                          <td style={{padding:"8px 10px"}}>{b.issued_at||"-"}</td>
                          <td style={{padding:"8px 10px",color:b.status==="overdue"?"#991b1b":"inherit"}}>{b.due_date||"-"}</td>
                          <td style={{padding:"8px 10px"}}><span className="wd-result-pill" style={{fontSize:10,"--result-bg":b.status==="overdue"?"var(--bg-danger-soft)":"var(--bg-warning-soft)","--result-color":b.status==="overdue"?"#991b1b":"#854d0e"}}>{b.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="form-group">
                    <label className="form-label">Library Note *</label>
                    <textarea className="form-control" value={bookNote} onChange={e=>setBookNote(e.target.value)} placeholder="Add note about unreturned books..." style={{minHeight:70,resize:"vertical"}} />
                  </div>
                  <div className="wd-books-warning">Submitting will reject library clearance until books are returned.</div>
                </>
              ):(
                <div className="wd-books-ok-text">No pending books. You can proceed to mark clearance.</div>
              )}
            </div>
            <div className="wd-modal-footer-shrink">
              <button className="btn btn-secondary" onClick={()=>setShowBooksModal(false)}>Close</button>
              {studentBooks.length>0?(
                <button className="btn btn-primary" style={{background:"#991b1b"}} disabled={!bookNote.trim()} onClick={async()=>{try{await withdrawalApi.clear(detail.id,{action:"reject",note:"LIBRARY PENDING: "+bookNote});flash("error","Library clearance rejected.");setShowBooksModal(false);load();loadDetail(detail.id);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Reject Clearance</button>
              ):(
                <button className="btn btn-primary" style={{background:"#166534"}} onClick={async()=>{try{await withdrawalApi.clear(detail.id,{action:"clear",note:"No pending books - library cleared."});flash("success","Library cleared.");setShowBooksModal(false);load();loadDetail(detail.id);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Mark Library Cleared</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UNPAID INVOICES MODAL */}
      {showUnpaidModal&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box-tall" style={{"--modal-max-width":"560px",maxHeight:"85vh"}}>
            <div className="wd-books-header" style={{"--header-bg":"var(--bg-danger-soft)",borderBottom:"1px solid var(--border-danger-soft)"}}>
              <div style={{fontWeight:600,fontSize:16,color:"var(--text-danger-soft)"}}>Unpaid Fee Invoices</div>
              <div style={{fontSize:12,color:"var(--text-danger-soft)",marginTop:2}}>Student has outstanding dues before withdrawal clearance</div>
            </div>
            <div className="wd-modal-body-scroll">
              <table className="wd-table" style={{marginBottom:16}}>
                <thead>
                  <tr style={{background:"var(--bg-danger-soft)"}}>
                    {["Invoice #","Month","Amount","Due"].map(h=><th key={h} className="wd-th" style={{fontSize:11,fontWeight:700,color:"var(--text-danger-soft)"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {unpaidInvoices.map((inv,i)=>(
                    <tr key={inv.id} className="wd-tr" style={{"--row-bg": i%2===0?"var(--bg-card)":"var(--bg-hover)"}}>
                      <td style={{padding:"8px 10px",fontWeight:600}}>#{inv.id}</td>
                      <td style={{padding:"8px 10px"}}>{inv.month||"-"}</td>
                      <td style={{padding:"8px 10px"}}>Rs.{Number(inv.net_amount||0).toLocaleString()}</td>
                      <td style={{padding:"8px 10px",color:"var(--text-danger-soft)",fontWeight:600}}>Rs.{Number((inv.net_amount||0)-(inv.paid_amount||0)).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="form-group">
                <label className="form-label">Finance Note *</label>
                <textarea className="form-control" value={clearNote} onChange={e=>setClearNote(e.target.value)} placeholder="Note about outstanding dues..." style={{minHeight:70,resize:"vertical"}} />
              </div>
            </div>
            <div className="wd-modal-footer-shrink">
              <button className="btn btn-secondary" onClick={()=>setShowUnpaidModal(false)}>Close</button>
              <button className="btn btn-ghost" style={{color:"#d97706"}} onClick={()=>{setWaiverForm(f=>({...f,invoice_id:unpaidInvoices[0]?.id||null}));setShowWaiverModal(true);}}>Request Waiver</button>
              <button className="btn btn-primary" style={{background:"#991b1b"}} disabled={!clearNote.trim()} onClick={async()=>{try{await withdrawalApi.clear(detail.id,{action:"reject",note:"UNPAID FEES: "+clearNote});flash("error","Finance clearance rejected.");setShowUnpaidModal(false);load();loadDetail(detail.id);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Reject Clearance</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONDUCT FORM MODAL ── */}
      
      {/* WAIVER FEE DETAIL MODAL */}
      {selectedWaiverDetail&&(
        <div style={{position:"fixed",inset:0,zIndex:1020,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div className="wd-modal-box" style={{"--modal-max-width":"520px",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--border-color)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div className="wd-modal-title" style={{color:"var(--text-primary)"}}>Fee Waiver Request Details</div>
                <div className="wd-modal-subtitle">{selectedWaiverDetail.waiver_type==="full"?"Full Waiver Requested":"Partial Waiver Requested"}{selectedWaiverDetail.waiver_amount?" - Rs. "+selectedWaiverDetail.waiver_amount:""}</div>
              </div>
              <button style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"var(--color-text-secondary)"}} onClick={()=>setSelectedWaiverDetail(null)}>×</button>
            </div>
            <div style={{padding:"20px 24px",maxHeight:"70vh",overflowY:"auto"}}>
              
              {(()=>{const invoices=selectedWaiverDetail.pendingInvoices||[];const total=invoices.reduce((s,i)=>s+parseFloat(i.net_amount||0),0);return invoices.length>0?(
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:10,textTransform:"uppercase",letterSpacing:".05em"}}>Unpaid Fee Invoices</div>
                  {invoices.map((inv,idx)=>(
                    <div key={idx} style={{borderRadius:8,border:"1px solid var(--border-danger-soft)",background:"var(--bg-danger-soft)",padding:"10px 14px",marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text-danger-soft)"}}>Invoice #{inv.id}{inv.month_year?" - "+inv.month_year:""}</div>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--text-danger-soft)"}}>Rs. {inv.net_amount}</div>
                      </div>
                      <div style={{display:"flex",gap:16,fontSize:12,color:"var(--color-text-secondary)"}}>
                        {inv.due_date&&<span>Due: {inv.due_date}</span>}
                        <span className="wd-result-pill" style={{"--result-bg":"var(--bg-danger-soft)","--result-color":"#991b1b"}}>{inv.status}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"12px 14px",borderRadius:8,background:"var(--bg-danger-soft)",border:"1px solid var(--border-danger-soft)",marginTop:4}}>
                    <div style={{fontWeight:700,fontSize:14,color:"var(--text-danger-soft)"}}>Total Outstanding</div>
                    <div style={{fontWeight:700,fontSize:16,color:"var(--text-danger-soft)"}}>Rs. {total.toFixed(2)}</div>
                  </div>
                </div>
              ):(
                <div style={{color:"var(--color-text-secondary)",fontSize:13,textAlign:"center",padding:20}}>No unpaid invoices found for this student.</div>
              );})()}
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--border-color)",display:"flex",justifyContent:"flex-end",background:"var(--bg-hover)"}}>
              <button className="btn btn-secondary" onClick={()=>setSelectedWaiverDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
{/* WAIVER REQUEST MODAL */}
      {showWaiverModal&&(
        <div style={{position:"fixed",inset:0,zIndex:1010,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div className="wd-modal-box" style={{"--modal-max-width":"500px",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div className="wd-modal-header-colored" style={{"--header-bg":"var(--bg-warning-soft)",borderBottom:"1px solid var(--border-warning-soft)"}}>
              <div className="wd-modal-title-colored" style={{"--header-text":"var(--text-warning-soft)",fontSize:16}}>Request Fee Waiver</div>
              <div className="wd-modal-subtitle-colored" style={{"--header-text":"var(--text-warning-soft)"}}>Submit a waiver request to the authority for approval</div>
            </div>
            <div className="wd-modal-body">
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Waiver Type *</label>
                <select className="form-control" value={waiverForm.waiver_type} onChange={e=>setWaiverForm(f=>({...f,waiver_type:e.target.value}))}>
                  <option value="full">Full Waiver (cancel entire invoice)</option>
                  <option value="partial">Partial Waiver (reduce amount)</option>
                </select>
              </div>
              {waiverForm.waiver_type==="partial"&&(
                <div className="form-group" style={{marginBottom:14}}>
                  <label className="form-label">Amount to Waive (Rs.) *</label>
                  <input type="number" className="form-control" value={waiverForm.waiver_amount} onChange={e=>setWaiverForm(f=>({...f,waiver_amount:e.target.value}))} placeholder="Enter amount to waive" />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Reason *</label>
                <textarea className="form-control" value={waiverForm.reason} onChange={e=>setWaiverForm(f=>({...f,reason:e.target.value}))} placeholder="Reason for waiver request..." style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div className="wd-modal-footer" style={{background:"var(--bg-hover)",borderTop:"1px solid var(--border-color)"}}>
              <button className="btn btn-secondary" onClick={()=>setShowWaiverModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#d97706"}}
                disabled={!waiverForm.reason.trim()||(waiverForm.waiver_type==="partial"&&!waiverForm.waiver_amount)}
                onClick={async()=>{try{await withdrawalApi.requestWaiver(detail.id,{invoice_id:waiverForm.invoice_id,waiver_type:waiverForm.waiver_type,waiver_amount:waiverForm.waiver_amount||null,reason:waiverForm.reason});flash("success","Waiver request submitted for approval.");setShowWaiverModal(false);setShowUnpaidModal(false);load();loadDetail(detail.id);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>
                Submit Waiver Request
              </button>
            </div>
              </div>
            </div>
          
      )}

      {showConductModal&&(
        <div className="wd-modal-overlay-bottom">
          <div className="wd-modal-box-tall" style={{"--modal-max-width":"560px"}}>
            <div className="wd-modal-header" style={{flexShrink:0}}>
              <div className="wd-modal-title" style={{color:"var(--text-primary)"}}>Student Conduct Form</div>
              <div className="wd-modal-subtitle">Fill student conduct report for withdrawal processing</div>
            </div>
            <div className="wd-modal-body-scroll">
              {[{label:"Behaviour",key:"behaviour",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Discipline",key:"discipline",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Academic Performance",key:"academic_performance",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Attendance Regularity",key:"attendance_regularity",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Co-curricular Activities",key:"cocurricular",opts:["Active","Limited","None"]}].map(field=>(
                <div key={field.key} className="form-group" style={{marginBottom:14}}>
                  <label className="form-label">{field.label}</label>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {field.opts.map(opt=>(
                      <button key={opt} onClick={()=>setConductForm(f=>({...f,[field.key]:opt}))} className="wd-selected-pill"
                        style={{ "--sel-border": conductForm[field.key]===opt?"#2563eb":"var(--color-border-tertiary)", "--sel-bg": conductForm[field.key]===opt?"var(--bg-info-soft)":"var(--color-background-primary)", "--sel-color": conductForm[field.key]===opt?"#2563eb":"var(--color-text-secondary)", "--sel-weight": conductForm[field.key]===opt?600:400 }}>{opt}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Disciplinary Action Taken?</label>
                <div className="wd-form-row" style={{flexWrap:"nowrap"}}>
                  {["Yes","No"].map(opt=>(
                    <button key={opt} onClick={()=>setConductForm(f=>({...f,disciplinary_action:opt==="Yes"}))} className="wd-selected-pill"
                      style={{ "--sel-border": (conductForm.disciplinary_action&&opt==="Yes")||(!conductForm.disciplinary_action&&opt==="No")?"#2563eb":"var(--color-border-tertiary)", "--sel-bg": (conductForm.disciplinary_action&&opt==="Yes")||(!conductForm.disciplinary_action&&opt==="No")?"var(--bg-info-soft)":"var(--color-background-primary)", "--sel-color": (conductForm.disciplinary_action&&opt==="Yes")||(!conductForm.disciplinary_action&&opt==="No")?"#2563eb":"var(--color-text-secondary)", "--sel-weight": 400 }}>{opt}</button>
                  ))}
                </div>
                {conductForm.disciplinary_action&&<textarea className="form-control" style={{marginTop:8,minHeight:60,resize:"vertical"}} placeholder="Describe the disciplinary action..." value={conductForm.disciplinary_details} onChange={e=>setConductForm(f=>({...f,disciplinary_details:e.target.value}))} />}
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">General Remarks</label>
                <textarea className="form-control" value={conductForm.remarks} onChange={e=>setConductForm(f=>({...f,remarks:e.target.value}))} placeholder="Overall assessment of the student..." style={{minHeight:70,resize:"vertical"}} />
              </div>
              <div className="form-group">
                <label className="form-label">Recommended for Re-admission?</label>
                <div className="wd-form-row" style={{flexWrap:"nowrap"}}>
                  {["Yes","No"].map(opt=>(
                    <button key={opt} onClick={()=>setConductForm(f=>({...f,recommended_readmission:opt==="Yes"}))} className="wd-selected-pill"
                      style={{ "--sel-border": (conductForm.recommended_readmission&&opt==="Yes")||(!conductForm.recommended_readmission&&opt==="No")?"#2563eb":"var(--color-border-tertiary)", "--sel-bg": (conductForm.recommended_readmission&&opt==="Yes")||(!conductForm.recommended_readmission&&opt==="No")?"var(--bg-info-soft)":"var(--color-background-primary)", "--sel-color": (conductForm.recommended_readmission&&opt==="Yes")||(!conductForm.recommended_readmission&&opt==="No")?"#2563eb":"var(--color-text-secondary)", "--sel-weight": 400 }}>{opt}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="wd-modal-footer-shrink">
              <button className="btn btn-secondary" onClick={()=>setShowConductModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={async()=>{try{await withdrawalApi.submitConduct(detail.id,conductForm);flash("success","Conduct form submitted.");setShowConductModal(false);setConductData(null);const c=await withdrawalApi.getConductForm(detail.id);setConductData(c.data.data);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}