import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { withdrawalApi } from "../api/withdrawalApi";
import workQueueApi from "../api/workQueueApi";
import workflowApi from "../api/workflowApi";
import studentsApi from "../api/studentsApi";
import client from "../api/client";

const STATUS_STYLES = {
  pending:           { bg:"#fef9c3", color:"#854d0e", border:"#fde047", label:"Pending"          },
  under_review:      { bg:"#dbeafe", color:"#1e40af", border:"#93c5fd", label:"Under Review"     },
  clearance:         { bg:"#ede9fe", color:"#5b21b6", border:"#c4b5fd", label:"Clearance"        },
  coordinator_final: { bg:"#fef9c3", color:"#854d0e", border:"#fde047", label:"Final Processing" },
  approved:          { bg:"#dcfce7", color:"#166534", border:"#86efac", label:"Approved"         },
  rejected:          { bg:"#fee2e2", color:"#991b1b", border:"#fca5a5", label:"Rejected"         },
  withdrawn:         { bg:"#f1f5f9", color:"#475569", border:"#cbd5e1", label:"Withdrawn"        },
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
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "-";
const StatusBadge = ({status}) => {
  const s = STATUS_STYLES[status] || { bg:"#f1f5f9", color:"#475569", border:"#e2e8f0", label:status };
  return <span style={{ background:s.bg, color:s.color, border:"1px solid "+s.border, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{s.label}</span>;
};

export default function Withdrawal() {
  const { user, can } = useAuth();
  const role    = user?.roles?.[0] || "";
  const canApply   = can("withdrawal.apply");
  const canReview  = can("withdrawal.review");
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
  const canClear   = can("withdrawal.clear");
  const canApprove = can("withdrawal.approve");

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
    student_id:"", reason:"", effective_date:new Date().toISOString().split("T")[0], document:null
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
      setApplyForm({student_id:"",reason:"",effective_date:new Date().toISOString().split("T")[0],document:null});
      load();
    } catch(e){ flash("error",e.response?.data?.message||"Failed."); }
    finally { setLoading(false); }
  };

  const loadHistory = async (studentId, tab) => {
    setHistoryTab(tab); setHistoryLoading(true);
    try {
      if (tab === "attendance") {
        const r = await client.get("/students/"+studentId+"/attendance", {params:{from:new Date(new Date().setMonth(new Date().getMonth()-3)).toISOString().split("T")[0],to:new Date().toISOString().split("T")[0]}});
        setHistoryData(prev => ({...prev, attendance: r.data.data||[]}));
      } else if (tab === "grades") {
        const r = await client.get("/students/"+studentId+"/grades");
        setHistoryData(prev => ({...prev, grades: r.data.data||[]}));
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

      {toast && <div className={"alert "+(toastType==="error"?"alert-error":"alert-success")} style={{marginBottom:16}}>{toast}</div>}

      <div style={fromWQ?{display:"none"}:{}}>

        {/* ── LEFT PANEL ── */}
        <div>
          {/* Teacher Toggle */}
          {role==="teacher" && (
            <div style={{display:"flex",background:"var(--color-background-secondary)",borderRadius:10,padding:4,marginBottom:12,border:"1px solid var(--color-border-tertiary)"}}>
              {[{label:"Incharge ("+inchargeList.length+")",value:"incharge"},{label:"Subject ("+subjectList.length+")",value:"subject"}].map(v=>(
                <button key={v.value} onClick={()=>{setTeacherView(v.value);setDetail(null);}} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",fontSize:13,cursor:"pointer",background:teacherView===v.value?"var(--color-background-primary)":"transparent",color:teacherView===v.value?"var(--color-text-primary)":"var(--color-text-secondary)",fontWeight:teacherView===v.value?600:400,boxShadow:teacherView===v.value?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all .15s"}}>
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {/* Status Filter */}
          {!canApply && (
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {["","pending","clearance","under_review","coordinator_final","approved","withdrawn","rejected"].map(f=>(
                <button key={f} onClick={()=>setStatusFilter(f)} style={{padding:"4px 12px",borderRadius:20,border:"1px solid",fontSize:11,cursor:"pointer",borderColor:statusFilter===f?"var(--color-border-info)":"var(--color-border-tertiary)",background:statusFilter===f?"var(--color-background-info)":"var(--color-background-primary)",color:statusFilter===f?"var(--color-text-info)":"var(--color-text-secondary)",fontWeight:statusFilter===f?600:400}}>
                  {f===""?"All":STATUS_STYLES[f]?.label||f}
                </button>
              ))}
              <span style={{fontSize:11,color:"var(--color-text-secondary)",alignSelf:"center",marginLeft:2}}>{filteredList.length} request{filteredList.length!==1?"s":""}</span>
            </div>
          )}

          {/* List */}
          {filteredList.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-secondary)",fontSize:14}}>No withdrawal requests found.</div>
          ) : (
            <div style={{overflowX:"auto",background:"#fff",borderRadius:8,border:"1px solid #e2e8f0",marginTop:8}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,background:"#fff"}}>
                <thead>
                  <tr style={{borderBottom:"1.5px solid #cbd5e1"}}>
                    {["Student","Class","Reason","Departments","Applied","Status",""].map(h=>(
                      <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:12,fontWeight:600,color:"var(--color-text-secondary)"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((w,i)=>{
                    const active = detail?.id===w.id;
                    return (
                      <tr key={w.id} style={{borderBottom:"1px solid #e2e8f0",background:active?"#eff6ff":"#fff",cursor:"pointer",transition:"background .1s"}} onClick={()=>loadDetail(w.id)}>
                        <td style={{padding:"12px 12px"}}>
                          <div style={{fontWeight:600,color:"var(--color-text-primary)"}}>{w.student_name}</div>
                          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{w.enrollment_no}</div>
                        </td>
                        <td style={{padding:"12px 12px",color:"var(--color-text-primary)"}}>{w.class_name}{w.section?" ("+w.section+")":""}</td>
                        <td style={{padding:"12px 12px",color:"var(--color-text-secondary)",maxWidth:180}}>{w.reason?.slice(0,50)}{w.reason?.length>50?"...":""}</td>
                        <td style={{padding:"12px 12px"}}>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {(w.clearances||[]).map(c=>(
                              <span key={c.department} style={{fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:6,background:c.status==="cleared"?"#dcfce7":c.status==="rejected"?"#fee2e2":"#f1f5f9",color:c.status==="cleared"?"#166534":c.status==="rejected"?"#991b1b":"#64748b"}}>{DEPT_LABELS[c.department]||c.department}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{padding:"12px 12px",color:"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{fmtDate(w.requested_at)}</td>
                        <td style={{padding:"12px 12px"}}><StatusBadge status={w.status} /></td>
                        <td style={{padding:"12px 12px"}}>
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
          <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px",overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setDetail(null);setShowModal(false);if(fromWQ)navigate("/work-queue");}}}>
            <div style={{background:"var(--color-background-primary)",borderRadius:12,width:"100%",maxWidth:860,marginTop:40,marginBottom:40,padding:24,position:"relative"}}>
             {/* <button className="btn btn-ghost btn-sm" onClick={()=>{setDetail(null);setShowModal(false);if(fromWQ)navigate("/work-queue");}} style={{position:"absolute",top:12,right:12}}>? Close</button>  */}
              <div style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* Parent Action Required Response */}
              {hasActionRequired && !wfStep && (
              <div className="section-card" style={{padding:"12px 16px",background:"#fffbeb",border:"1px solid #f59e0b",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div>
                  <span style={{fontWeight:700,fontSize:13,color:"#b45309"}}>Action Required: </span>
                  <span style={{fontSize:13}}>The department has requested you to submit information.</span>
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
              <div className="section-card" style={{padding:"12px 16px",background:"#f0f9ff",border:"1px solid #bae6fd",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div>
                  <span style={{fontWeight:700,fontSize:13}}>Current Step: </span>
                  <span style={{fontSize:13,color:"#0369a1"}}>{wfStep.step_name}</span>
                  {wfStep.assigned_role&&<span style={{fontSize:12,color:"#64748b",marginLeft:8}}>({wfStep.assigned_role.replace(/_/g," ")})</span>}
                </div>
                <div style={{display:"flex",gap:8}}>
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
            <div className="section-card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17,color:"var(--color-text-primary)"}}>{detail.student_name}</div>
                  <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:2}}>{detail.enrollment_no} &middot; {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
                    <StatusBadge status={detail.status} />
                    {detail.effective_date && <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>Effective: {fmtDate(detail.effective_date)}</span>}
                    {role==="teacher"&&!detail.is_incharge&&<span style={{fontSize:11,background:"#fef9c3",color:"#854d0e",padding:"2px 8px",borderRadius:10,fontWeight:600}}>Subject Teacher</span>}
                  </div>
                </div>
<div style={{display:"flex",gap:8}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>openHistory(detail.student_id)}>View History</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setDetail(null);setShowModal(false);if(fromWQ)navigate("/work-queue");}}>Close</button>
                </div>
              </div>

              {/* Reason */}
              <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Reason</div>
                <div style={{fontSize:14,color:"var(--color-text-primary)",background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 14px"}}>{detail.reason}</div>
              </div>

              {/* Timeline */}
              <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:12}}>Progress</div>
                {(wfSteps.length>0 ? wfSteps.map((s,i)=>({label:s.step_name, done:s.status==="approved"||s.status==="skipped", current:s.status==="pending"&&wfSteps.findIndex(x=>x.status==="pending")===i, by:s.assigned_role?.replace(/_/g," "), at:s.actioned_at, note:s.note, num:s.step_order})) : TIMELINE_STEPS).map((step,i)=>(
                  <div key={i} style={{display:"flex",gap:12,marginBottom:10,opacity:(!step.done&&!step.current)?0.4:1}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,background:step.done?"#22c55e":step.current?"#2563eb":"var(--color-background-tertiary)",border:step.current?"2px solid #2563eb":"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:step.done||step.current?"#fff":"#94a3b8"}}>
                        {step.done?"✓":step.current?"●":i+1}
                      </div>
                      {i<(wfSteps.length>0?wfSteps.length:TIMELINE_STEPS.length)-1&&<div style={{width:2,flex:1,minHeight:14,background:step.done?"#22c55e":"var(--color-border-tertiary)",marginTop:2}}/>}
                    </div>
                    <div style={{flex:1,paddingBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontSize:13,fontWeight:step.current?700:600,color:step.current?"#2563eb":step.done?"var(--color-text-primary)":"var(--color-text-secondary)"}}>{step.label}</div>
                        {step.current&&<span style={{fontSize:10,fontWeight:700,background:"#eff6ff",color:"#2563eb",padding:"1px 7px",borderRadius:10}}>Current</span>}
                      </div>
                      {step.by&&<div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:1}}>{step.by}{step.at?" - "+fmtDate(step.at):""}</div>}
                      {step.note&&<div style={{fontSize:12,color:"var(--color-text-secondary)",fontStyle:"italic",marginTop:2}}>"{step.note}"</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Department Clearances */}
              {detail.clearances?.length>0&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Department Clearances</div>
                  {detail.clearances.map(c=>(
                    <div key={c.department} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderRadius:8,marginBottom:6,background:c.status==="cleared"?"#f0fdf4":c.status==="rejected"?"#fef2f2":"var(--color-background-secondary)",border:"1px solid "+(c.status==="cleared"?"#bbf7d0":c.status==="rejected"?"#fecaca":"var(--color-border-tertiary)")}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--color-text-primary)"}}>{DEPT_LABELS[c.department]||c.department}</div>
                        {c.cleared_by_name&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{c.cleared_by_name}{c.cleared_at?" - "+fmtDate(c.cleared_at):""}</div>}
                        {c.note&&<div style={{fontSize:11,color:"var(--color-text-secondary)",fontStyle:"italic",marginTop:2}}>"{c.note}"</div>}
                      </div>
                      <span style={{fontSize:11,fontWeight:600,padding:"2px 10px",borderRadius:10,background:c.status==="cleared"?"#dcfce7":c.status==="rejected"?"#fee2e2":"#f1f5f9",color:c.status==="cleared"?"#166534":c.status==="rejected"?"#991b1b":"#64748b"}}>{c.status==="cleared"?"Cleared":c.status==="rejected"?"Rejected":"Pending"}</span>
                    </div>
                  ))}
                </div>
              )}

              
              
              {/* Waiver Requests - Finance/Authority View */}
              {waivers.length>0&&(role==="finance_officer"||role==="principal"||role==="superadmin"||role==="admin")&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Fee Waiver Requests</div>
                  {waivers.map(w=>(
                    <div key={w.id} style={{background:w.status==="approved"?"#f0fdf4":w.status==="rejected"?"#fef2f2":w.status==="forwarded"?"#eff6ff":"#fffbeb",border:"1px solid "+(w.status==="approved"?"#bbf7d0":w.status==="rejected"?"#fecaca":w.status==="forwarded"?"#bfdbfe":"#fde68a"),borderRadius:8,padding:"12px 14px",marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600}}>{w.waiver_type==="full"?"Full Waiver":"Partial Waiver"}{w.waiver_amount?" - Rs. "+w.waiver_amount:""}</div>
                          <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>By: {w.requester_name}{w.requested_at?" - "+fmtDate(w.requested_at):""}</div>
                          {w.reason&&<div style={{fontSize:12,color:"#78350f",marginTop:4,fontStyle:"italic"}}>"{w.reason}"</div>}
                          {w.action_note&&<div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:4}}>Note: {w.action_note}</div>}
                          {w.invoice_items?.length>0&&(
                            <div style={{marginTop:8,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:"8px 10px"}}>
                              <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Invoice Details{w.invoice_month_year?" - "+w.invoice_month_year:""}</div>
                              {w.invoice_items.map((item,idx)=>(
                                <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:idx<w.invoice_items.length-1?"1px solid #f1f5f9":"none"}}>
                                  <span style={{color:"var(--color-text-primary)"}}>{item.label||item.type}</span>
                                  <span style={{fontWeight:600,color:"#1d4ed8"}}>Rs. {item.amount}</span>
                                </div>
                              ))}
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,marginTop:6,paddingTop:6,borderTop:"1px solid #e2e8f0"}}>
                                <span>Total Due</span>
                                <span style={{color:"#991b1b"}}>Rs. {w.invoice_total}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <span style={{fontSize:11,fontWeight:600,padding:"2px 10px",borderRadius:10,flexShrink:0,background:w.status==="approved"?"#dcfce7":w.status==="rejected"?"#fee2e2":w.status==="forwarded"?"#dbeafe":"#fef9c3",color:w.status==="approved"?"#166534":w.status==="rejected"?"#991b1b":w.status==="forwarded"?"#1d4ed8":"#92400e"}}>
                          {w.status==="forwarded"?"Forwarded to Authority":w.status.charAt(0).toUpperCase()+w.status.slice(1)}
                        </span>
                      </div>
                      {/* Finance officer sees pending waivers - can forward to authority */}
                      {w.status==="pending"&&role==="finance_officer"&&(
                        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                          <input placeholder="Note for authority (optional)" style={{flex:1,padding:"6px 10px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:12}} id={"fwd-note-"+w.id} />
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
                        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                          <button className="btn btn-ghost btn-sm" style={{border:"1px solid #2563eb",color:"#2563eb"}} onClick={async()=>{setSelectedWaiverDetail(w);try{const r=await withdrawalApi.getPendingInvoices(detail.id);setSelectedWaiverDetail({...w,pendingInvoices:r.data.data||[]});}catch(e){}}}>View Fee Details</button>
                          <input type="number" placeholder="Approved amount (blank = full waiver)" style={{flex:1,minWidth:180,padding:"6px 10px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:12}} id={"waiver-amt-"+w.id} />
                          <input placeholder="Decision note" style={{flex:2,minWidth:180,padding:"6px 10px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:12}} id={"waiver-nt-"+w.id} />
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
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)",background:"#fef9ec"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Finance Action Required</div>
                  <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#92400e",marginBottom:4}}>Outstanding fee dues on your account</div>
                    <div style={{fontSize:12,color:"#78350f"}}>{detail.clearances?.find(c=>c.department==="finance")?.note||"Please settle your outstanding dues to proceed with withdrawal."}</div>
                  </div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <a href={"/my-fees?studentId="+detail.student_id} style={{padding:"8px 16px",borderRadius:8,background:"#1d4ed8",color:"#fff",fontSize:13,fontWeight:600,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}>View My Invoices</a>
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
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Teacher Conduct Form</div>
                  {conductData ? (
                    <div style={{border:"1px solid #bbf7d0",borderRadius:8,padding:"12px 14px",background:"#f0fdf4"}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#166534",marginBottom:8}}>Submitted by {conductData.teacher_name}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",fontSize:12}}>
                        {[["Behaviour",conductData.behaviour],["Discipline",conductData.discipline],["Academic",conductData.academic_performance],["Attendance",conductData.attendance_regularity],["Co-curricular",conductData.cocurricular]].map(([l,v])=>(
                          <div key={l}><span style={{color:"#64748b"}}>{l}:</span> <strong>{v}</strong></div>
                        ))}
                      </div>
                      {conductData.remarks&&<div style={{marginTop:6,fontSize:12,color:"#475569",fontStyle:"italic"}}>"{conductData.remarks}"</div>}
                      {conductData.disciplinary_action&&<div style={{marginTop:4,fontSize:12,color:"#991b1b"}}>Disciplinary: {conductData.disciplinary_details}</div>}
                      <div style={{marginTop:4,fontSize:12}}>Re-admission recommended: <strong>{conductData.recommended_readmission?"Yes":"No"}</strong></div>
                      {(role==="teacher"||role==="superadmin")&&<button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>setShowConductModal(true)}>Update</button>}
                    </div>
                  ) : (
                    <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,color:"#854d0e"}}>Awaiting teacher conduct form</span>
                      {(role==="teacher"||role==="superadmin"||role==="admin")&&<button className="btn btn-ghost btn-sm" style={{color:"#854d0e",border:"1px solid #fde68a"}} onClick={()=>setShowConductModal(true)}>Fill Form</button>}
                    </div>
                  )}
                </div>
              )}

              {/* Fee Details (Finance Officer) */}
              {(role==="finance_officer"||role==="superadmin")&&detail.status==="clearance"&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Fee Details</div>
                  <button className="btn btn-ghost btn-sm" disabled={feeLoading} onClick={()=>showFees?setShowFees(false):loadFees(detail.student_id)}>
                    {feeLoading?"Loading...":showFees?"Hide Fee Details":"View Fee Details"}
                  </button>
                  {showFees&&feeData&&(
                    <div style={{border:"1px solid var(--color-border-tertiary)",borderRadius:8,overflow:"hidden",marginTop:10}}>
                      {unpaidInvoices.length>0&&(
                        <div style={{padding:"10px 14px",background:"#fef2f2",borderBottom:"1px solid #fecaca",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:13,color:"#991b1b",fontWeight:600}}>{unpaidInvoices.length} unpaid invoice{unpaidInvoices.length>1?"s":""}</span>
                          <button className="btn btn-ghost btn-sm" style={{color:"#991b1b",border:"1px solid #fecaca"}} onClick={()=>{setShowUnpaidModal(true);setClearNote("");}}>View</button>
                        </div>
                      )}
                      <div style={{padding:"12px 14px",display:"flex",gap:0,flexWrap:"wrap"}}>
                        {[{label:"Invoices",value:feeData.total_invoices||0,color:"#2563eb"},{label:"Billed",value:"Rs."+Number(feeData.total_billed||0).toLocaleString(),color:"#475569"},{label:"Paid",value:"Rs."+Number(feeData.total_paid||0).toLocaleString(),color:"#166534"},{label:"Outstanding",value:"Rs."+Number(feeData.total_due||0).toLocaleString(),color:"#991b1b"},{label:"Overdue",value:feeData.overdue_count||0,color:"#dc2626"}].map(s=>(
                          <div key={s.label} style={{flex:"1 1 0",textAlign:"center",padding:"10px 6px",borderRight:"1px solid var(--color-border-tertiary)"}}>
                            <div style={{fontSize:16,fontWeight:800,color:s.color}}>{s.value}</div>
                            <div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:3}}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Library Books (Librarian) */}
              {(role==="librarian"||role==="superadmin")&&detail.status==="clearance"&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Library Books</div>
                  <button className="btn btn-ghost btn-sm" disabled={booksLoading} onClick={()=>loadBooks(detail.student_id)}>
                    {booksLoading?"Loading...":"Check Issued Books"}
                  </button>
                </div>
              )}

              {/* Admin Require Action */}
              {canClear&&detail.status==="clearance"&&myDept&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Actions</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
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
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Review Request</div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,marginBottom:6,color:"var(--color-text-secondary)"}}>Departments required for clearance:</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {wfSteps.filter(s=>s.step_type==="clear"||s.step_type==="verify").map((s,i)=>(
                        <span key={i} style={{padding:"4px 12px",background:"#dbeafe",color:"#1e40af",borderRadius:20,fontSize:12,fontWeight:600}}>
                          {(s.step_name||s.assigned_role||"").replace(/_/g," ")}
                        </span>
                      ))}
                    </div>
                    <textarea className="form-input" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                      placeholder="Add a note (optional)"
                      style={{width:"100%",resize:"vertical",fontSize:13,marginTop:10}}/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-primary" onClick={()=>setAction({id:detail.id,type:"approve",kind:"review"})}>Review and Forward to Department</button>
                    <button className="btn btn-ghost btn-sm" style={{color:"var(--color-text-danger)"}} onClick={()=>setAction({id:detail.id,type:"reject",kind:"review"})}>Reject</button>
                  </div>
                </div>
              )}

              {/* Coordinator Final */}
              {canReview&&detail.status==="coordinator_final"&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Final Processing</div>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>doAction(async()=>{await withdrawalApi.finalize(detail.id,{action:"approve",note:""});flash("success","Withdrawal completed.");})}>Complete Withdrawal</button>
                    <button className="btn btn-ghost btn-sm" style={{color:"var(--color-text-danger)"}} onClick={()=>doAction(async()=>{await withdrawalApi.finalize(detail.id,{action:"reject",note:""});flash("error","Rejected.");})}>Reject</button>
                  </div>
                </div>
              )}

              {/* Principal Approve */}
              {canApprove&&detail.status==="under_review"&&(
                <div style={{padding:"14px 20px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Principal Decision</div>
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

      {/* ?? STUDENT HISTORY MODAL ?? */}
      {showHistoryModal && detail && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:800,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{detail.student_name} - Academic History</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{detail.enrollment_no} - {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowHistoryModal(false)}>Close</button>
            </div>
            <div style={{display:"flex",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",flexShrink:0}}>
              {[{key:"attendance",label:"Attendance"},{key:"grades",label:"Grades"},{key:"fees",label:"Fees"},{key:"assignments",label:"Assignments"},{key:"quizzes",label:"Quizzes"}].map(tab=>(
                <button key={tab.key} onClick={()=>loadHistory(detail.student_id,tab.key)} style={{padding:"10px 20px",border:"none",borderBottom:"2px solid "+(historyTab===tab.key?"#2563eb":"transparent"),background:"transparent",color:historyTab===tab.key?"#2563eb":"var(--color-text-secondary)",fontWeight:historyTab===tab.key?600:400,fontSize:13,cursor:"pointer"}}>{tab.label}</button>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
              {historyLoading ? <div className="loading-state">Loading...</div> : (
                historyTab==="attendance" ? (
                  (!historyData.attendance||historyData.attendance.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No attendance records found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Date","Day","Status","Remarks"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{historyData.attendance.map((r,i)=>{const st={present:{background:"#f0fdf4",color:"#166534"},absent:{background:"#fef2f2",color:"#991b1b"},late:{background:"#fffbeb",color:"#92400e"},excused:{background:"#eff6ff",color:"#1e40af"},on_leave:{background:"#f0f9ff",color:"#0369a1"}}[r.status]||{background:"#f1f5f9",color:"#475569"};return <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}><td style={{padding:"8px 12px"}}>{fmtDate(r.date)}</td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{r.date?new Date(r.date).toLocaleDateString("en",{weekday:"short"}):"-"}</td><td style={{padding:"8px 12px"}}><span style={{...st,padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600}}>{r.status}</span></td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{r.remarks||"-"}</td></tr>;})}
                      </tbody>
                    </table>
                ) : historyTab==="grades" ? (
                  (!historyData.grades||historyData.grades.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No grades found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Subject","Exam","Marks","Grade","Date"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{(historyData.grades||[]).map((g,i)=><tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}><td style={{padding:"8px 12px",fontWeight:500}}>{g.subject_name||"-"}</td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{g.exam_name||"-"}</td><td style={{padding:"8px 12px"}}>{g.marks_obtained||0}/{g.total_marks||0}</td><td style={{padding:"8px 12px"}}><span style={{fontWeight:700,color:"#2563eb"}}>{g.grade||"-"}</span></td><td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{fmtDate(g.exam_date)}</td></tr>)}
                      </tbody>
                    </table>
                ) : historyTab==="fees" ? (
                  !historyData.fees ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No fee data found.</div> :
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                      {[["Total Billed","Rs."+Number(historyData.fees.total_billed||0).toLocaleString(),"#2563eb"],["Paid","Rs."+Number(historyData.fees.total_paid||0).toLocaleString(),"#166534"],["Outstanding","Rs."+Number(historyData.fees.total_due||0).toLocaleString(),"#991b1b"],["Overdue",historyData.fees.overdue_count||0,"#dc2626"]].map(([l,v,c])=>(
                        <div key={l} style={{background:"var(--color-background-secondary)",border:"1px solid var(--color-border-tertiary)",borderTop:"3px solid "+c,borderRadius:8,padding:"14px",textAlign:"center"}}>
                          <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                          <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:4}}>{l}</div>
                        </div>
                      ))}
                    </div>
                ) : historyTab==="assignments" ? (
                  (!historyData.assignments||historyData.assignments.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No assignments found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Assignment","Subject","Due Date","Status","Marks"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{(historyData.assignments||[]).map((a,i)=>(
                        <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}>
                          <td style={{padding:"8px 12px",fontWeight:500}}>{a.title||"Assignment "+(i+1)}</td>
                          <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{a.subject_name||"-"}</td>
                          <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{fmtDate(a.due_date)}</td>
                          <td style={{padding:"8px 12px"}}><span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,background:a.submitted?"#dcfce7":"#fef9c3",color:a.submitted?"#166534":"#854d0e"}}>{a.submitted?"Submitted":"Pending"}</span></td>
                          <td style={{padding:"8px 12px"}}>{a.marks_obtained!=null?a.marks_obtained+"/"+a.total_marks:"-"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                ) : historyTab==="quizzes" ? (
                  (!historyData.quizzes||historyData.quizzes.length===0) ?
                    <div style={{textAlign:"center",padding:"32px",color:"var(--color-text-secondary)"}}>No quizzes found.</div> :
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Quiz","Subject","Date","Score","Grade"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                      <tbody>{(historyData.quizzes||[]).map((q,i)=>(
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

      {/* ── APPLY MODAL ── */}
      {showApply&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
              <div style={{fontWeight:600,fontSize:16,color:"var(--color-text-primary)"}}>Apply for Withdrawal</div>
            </div>
            <div style={{padding:"20px 24px"}}>
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
                <input type="date" className="form-control" value={applyForm.effective_date} onChange={e=>setApplyForm(f=>({...f,effective_date:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Supporting Document (optional)</label>
                <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e=>setApplyForm(f=>({...f,document:e.target.files[0]}))} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)"}}>
              <button className="btn btn-secondary" onClick={()=>setShowApply(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} onClick={submitApply}>{loading?"Submitting...":"Submit Request"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW NOTE MODAL ── */}
      {action?.kind==="review"&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:460,boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
              <div style={{fontWeight:600,fontSize:16}}>{action.type==="approve"?"Forward to Departments":"Reject Request"}</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group">
                <label className="form-label">{action.type==="reject"?"Rejection Reason *":"Note (optional)"}</label>
                <textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)"}}>
              <button className="btn btn-secondary" onClick={()=>setAction(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} style={{background:action.type==="reject"?"#991b1b":undefined}} onClick={()=>doAction(async()=>{await withdrawalApi.review(action.id,{action:action.type,note,departments:depts});flash("success","Done.");})}>
                {loading?"Processing...":action.type==="approve"?"Forward":"Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLEAR NOTE MODAL ── */}
      {action?.kind==="clear"&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:460,boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
              <div style={{fontWeight:600,fontSize:16}}>{action.type==="clear"?"Mark Department Cleared":"Reject Clearance"}</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group">
                <label className="form-label">{action.type==="reject"?"Rejection Reason *":"Note (optional)"}</label>
                <textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)"}}>
              <button className="btn btn-secondary" onClick={()=>setAction(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} style={{background:action.type==="reject"?"#991b1b":"#166534"}} onClick={()=>doAction(async()=>{await withdrawalApi.clear(action.id,{action:action.type,note});flash(action.type==="clear"?"success":"error","Done.");})}>
                {loading?"Processing...":action.type==="clear"?"Mark Cleared":"Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINCIPAL SUMMARY MODAL ── */}
      {showSummaryModal&&detail&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:600,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16}}>Withdrawal Summary</div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>Review all details before final approval</div>
            </div>
            <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
              <div style={{marginBottom:16,background:"var(--color-background-secondary)",borderRadius:8,padding:"14px 16px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Student</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Name:</span> <strong>{detail.student_name}</strong></div>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Enrollment:</span> {detail.enrollment_no}</div>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Class:</span> {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div><span style={{color:"var(--color-text-secondary)"}}>Effective:</span> {fmtDate(detail.effective_date)}</div>
                </div>
                <div style={{marginTop:8,fontSize:13}}><span style={{color:"var(--color-text-secondary)"}}>Reason:</span> {detail.reason}</div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Clearances</div>
                {detail.clearances?.map(c=>(
                  <div key={c.department} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:8,marginBottom:6,background:c.status==="cleared"?"#f0fdf4":"#fef2f2",border:"1px solid "+(c.status==="cleared"?"#bbf7d0":"#fecaca")}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600}}>{DEPT_LABELS[c.department]||c.department}</span>
                      {c.note&&<div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{c.note}</div>}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:10,background:c.status==="cleared"?"#dcfce7":"#fee2e2",color:c.status==="cleared"?"#166534":"#991b1b"}}>{c.status==="cleared"?"Cleared":"Pending"}</span>
                  </div>
                ))}
              </div>
              {conductData&&(
                <div style={{marginBottom:16,background:"#f0fdf4",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#166534",marginBottom:8}}>Conduct Report</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:12}}>
                    {[["Behaviour",conductData.behaviour],["Discipline",conductData.discipline],["Academic",conductData.academic_performance],["Attendance",conductData.attendance_regularity]].map(([l,v])=>(
                      <div key={l}><span style={{color:"#64748b"}}>{l}:</span> <strong style={{color:"#166534"}}>{v}</strong></div>
                    ))}
                  </div>
                  {conductData.remarks&&<div style={{marginTop:6,fontSize:12,fontStyle:"italic"}}>"{conductData.remarks}"</div>}
                </div>
              )}
              {detail.coordinator_note&&(
                <div style={{marginBottom:16,background:"#eff6ff",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:4}}>Coordinator Note</div>
                  <div style={{fontSize:13,color:"#1e40af"}}>{detail.coordinator_note}</div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Principal Note (optional)</label>
                <textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:70,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)",flexShrink:0}}>
              <button className="btn btn-secondary" onClick={()=>setShowSummaryModal(false)}>Cancel</button>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--color-text-danger)"}} onClick={()=>doAction(async()=>{await withdrawalApi.approve(detail.id,{action:"reject",note});setShowSummaryModal(false);flash("error","Rejected.");})}>Reject</button>
              <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>doAction(async()=>{await withdrawalApi.approve(detail.id,{action:"approve",note});setShowSummaryModal(false);flash("success","Approved. Sent to coordinator.");})}>Approve & Forward</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REQUIRE ACTION MODAL ── */}
      {showRequireModal&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #fde68a",background:"#fffbeb"}}>
              <div style={{fontWeight:600,fontSize:16,color:"#92400e"}}>Require Action from Parent/Student</div>
              <div style={{fontSize:12,color:"#92400e",marginTop:2}}>Parent will be notified. Clearance held until resolved.</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group">
                <label className="form-label">Requirement Details *</label>
                <textarea className="form-control" value={requireNote} onChange={e=>setRequireNote(e.target.value)} placeholder="e.g. Student must return school uniform, ID card not submitted..." style={{minHeight:90,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)"}}>
              <button className="btn btn-secondary" onClick={()=>setShowRequireModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#d97706"}} disabled={!requireNote.trim()} onClick={async()=>{try{await withdrawalApi.requireAction(detail.id,{note:requireNote});flash("success","Requirement submitted.");setShowRequireModal(false);load();loadDetail(detail.id);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIBRARY BOOKS MODAL ── */}
      {showBooksModal&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:studentBooks.length>0?"#fef2f2":"#f0fdf4",flexShrink:0}}>
              <div style={{fontWeight:600,fontSize:16,color:studentBooks.length>0?"#991b1b":"#166534"}}>{studentBooks.length>0?"Unreturned Books":"No Issued Books"}</div>
              <div style={{fontSize:12,color:studentBooks.length>0?"#991b1b":"#166534",marginTop:2}}>{studentBooks.length>0?studentBooks.length+" book(s) must be returned before clearance":"Student has no pending book returns"}</div>
            </div>
            <div style={{padding:"16px 24px",flex:1,overflowY:"auto"}}>
              {studentBooks.length>0?(
                <>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16}}>
                    <thead>
                      <tr style={{background:"var(--color-background-secondary)"}}>
                        {["Title","Author","Issued","Due","Status"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {studentBooks.map((b,i)=>(
                        <tr key={b.id} style={{borderBottom:"1px solid var(--color-border-tertiary)",background:i%2===0?"var(--color-background-primary)":"var(--color-background-secondary)"}}>
                          <td style={{padding:"8px 10px",fontWeight:500}}>{b.title}</td>
                          <td style={{padding:"8px 10px",color:"var(--color-text-secondary)"}}>{b.author||"-"}</td>
                          <td style={{padding:"8px 10px"}}>{b.issued_at||"-"}</td>
                          <td style={{padding:"8px 10px",color:b.status==="overdue"?"#991b1b":"inherit"}}>{b.due_date||"-"}</td>
                          <td style={{padding:"8px 10px"}}><span style={{fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:10,background:b.status==="overdue"?"#fee2e2":"#fef9c3",color:b.status==="overdue"?"#991b1b":"#854d0e"}}>{b.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="form-group">
                    <label className="form-label">Library Note *</label>
                    <textarea className="form-control" value={bookNote} onChange={e=>setBookNote(e.target.value)} placeholder="Add note about unreturned books..." style={{minHeight:70,resize:"vertical"}} />
                  </div>
                  <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px",marginTop:10,fontSize:12,color:"#854d0e"}}>Submitting will reject library clearance until books are returned.</div>
                </>
              ):(
                <div style={{textAlign:"center",padding:"20px 0",color:"#166534",fontSize:14}}>No pending books. You can proceed to mark clearance.</div>
              )}
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)",flexShrink:0}}>
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

      {/* ── UNPAID INVOICES MODAL ── */}
      {showUnpaidModal&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #fecaca",background:"#fef2f2",flexShrink:0}}>
              <div style={{fontWeight:600,fontSize:16,color:"#991b1b"}}>Unpaid Fee Invoices</div>
              <div style={{fontSize:12,color:"#991b1b",marginTop:2}}>Student has outstanding dues before withdrawal clearance</div>
            </div>
            <div style={{padding:"16px 24px",flex:1,overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16}}>
                <thead>
                  <tr style={{background:"#fef2f2"}}>
                    {["Invoice #","Month","Amount","Due"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:700,color:"#991b1b"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {unpaidInvoices.map((inv,i)=>(
                    <tr key={inv.id} style={{borderBottom:"1px solid #fee2e2",background:i%2===0?"#fff":"#fff5f5"}}>
                      <td style={{padding:"8px 10px",fontWeight:600}}>#{inv.id}</td>
                      <td style={{padding:"8px 10px"}}>{inv.month||"-"}</td>
                      <td style={{padding:"8px 10px"}}>Rs.{Number(inv.net_amount||0).toLocaleString()}</td>
                      <td style={{padding:"8px 10px",color:"#991b1b",fontWeight:600}}>Rs.{Number((inv.net_amount||0)-(inv.paid_amount||0)).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="form-group">
                <label className="form-label">Finance Note *</label>
                <textarea className="form-control" value={clearNote} onChange={e=>setClearNote(e.target.value)} placeholder="Note about outstanding dues..." style={{minHeight:70,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)",flexShrink:0}}>
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
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:600,fontSize:16}}>Fee Waiver Request Details</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{selectedWaiverDetail.waiver_type==="full"?"Full Waiver Requested":"Partial Waiver Requested"}{selectedWaiverDetail.waiver_amount?" - Rs. "+selectedWaiverDetail.waiver_amount:""}</div>
              </div>
              <button style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"var(--color-text-secondary)"}} onClick={()=>setSelectedWaiverDetail(null)}>×</button>
            </div>
            <div style={{padding:"20px 24px",maxHeight:"70vh",overflowY:"auto"}}>
              
              {(()=>{const invoices=selectedWaiverDetail.pendingInvoices||[];const total=invoices.reduce((s,i)=>s+parseFloat(i.net_amount||0),0);return invoices.length>0?(
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:10,textTransform:"uppercase",letterSpacing:".05em"}}>Unpaid Fee Invoices</div>
                  {invoices.map((inv,idx)=>(
                    <div key={idx} style={{borderRadius:8,border:"1px solid #fecaca",background:"#fef2f2",padding:"10px 14px",marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>Invoice #{inv.id}{inv.month_year?" - "+inv.month_year:""}</div>
                        <div style={{fontSize:14,fontWeight:700,color:"#991b1b"}}>Rs. {inv.net_amount}</div>
                      </div>
                      <div style={{display:"flex",gap:16,fontSize:12,color:"var(--color-text-secondary)"}}>
                        {inv.due_date&&<span>Due: {inv.due_date}</span>}
                        <span style={{background:"#fee2e2",color:"#991b1b",padding:"1px 8px",borderRadius:10,fontWeight:600}}>{inv.status}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"12px 14px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca",marginTop:4}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#991b1b"}}>Total Outstanding</div>
                    <div style={{fontWeight:700,fontSize:16,color:"#991b1b"}}>Rs. {total.toFixed(2)}</div>
                  </div>
                </div>
              ):(
                <div style={{color:"var(--color-text-secondary)",fontSize:13,textAlign:"center",padding:20}}>No unpaid invoices found for this student.</div>
              );})()}
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"flex-end",background:"#f8fafc"}}>
              <button className="btn btn-secondary" onClick={()=>setSelectedWaiverDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
{/* WAIVER REQUEST MODAL */}
      {showWaiverModal&&(
        <div style={{position:"fixed",inset:0,zIndex:1010,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#fffbeb"}}>
              <div style={{fontWeight:600,fontSize:16,color:"#92400e"}}>Request Fee Waiver</div>
              <div style={{fontSize:12,color:"#92400e",marginTop:2}}>Submit a waiver request to the authority for approval</div>
            </div>
            <div style={{padding:"20px 24px"}}>
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
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
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
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:24}}>
          <div style={{background:"#ffffff",borderRadius:12,width:"100%",maxWidth:560,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.18)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",flexShrink:0}}>
              <div style={{fontWeight:600,fontSize:16}}>Student Conduct Form</div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>Fill student conduct report for withdrawal processing</div>
            </div>
            <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
              {[{label:"Behaviour",key:"behaviour",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Discipline",key:"discipline",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Academic Performance",key:"academic_performance",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Attendance Regularity",key:"attendance_regularity",opts:["Excellent","Good","Satisfactory","Poor"]},{label:"Co-curricular Activities",key:"cocurricular",opts:["Active","Limited","None"]}].map(field=>(
                <div key={field.key} className="form-group" style={{marginBottom:14}}>
                  <label className="form-label">{field.label}</label>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {field.opts.map(opt=>(
                      <button key={opt} onClick={()=>setConductForm(f=>({...f,[field.key]:opt}))} style={{padding:"6px 14px",borderRadius:20,border:"1px solid",fontSize:13,cursor:"pointer",borderColor:conductForm[field.key]===opt?"#2563eb":"var(--color-border-tertiary)",background:conductForm[field.key]===opt?"#eff6ff":"var(--color-background-primary)",color:conductForm[field.key]===opt?"#2563eb":"var(--color-text-secondary)",fontWeight:conductForm[field.key]===opt?600:400}}>{opt}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Disciplinary Action Taken?</label>
                <div style={{display:"flex",gap:8}}>
                  {["Yes","No"].map(opt=>(
                    <button key={opt} onClick={()=>setConductForm(f=>({...f,disciplinary_action:opt==="Yes"}))} style={{padding:"6px 14px",borderRadius:20,border:"1px solid",fontSize:13,cursor:"pointer",borderColor:(conductForm.disciplinary_action&&opt==="Yes")||(!conductForm.disciplinary_action&&opt==="No")?"#2563eb":"var(--color-border-tertiary)",background:(conductForm.disciplinary_action&&opt==="Yes")||(!conductForm.disciplinary_action&&opt==="No")?"#eff6ff":"var(--color-background-primary)",color:(conductForm.disciplinary_action&&opt==="Yes")||(!conductForm.disciplinary_action&&opt==="No")?"#2563eb":"var(--color-text-secondary)"}}>{opt}</button>
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
                <div style={{display:"flex",gap:8}}>
                  {["Yes","No"].map(opt=>(
                    <button key={opt} onClick={()=>setConductForm(f=>({...f,recommended_readmission:opt==="Yes"}))} style={{padding:"6px 14px",borderRadius:20,border:"1px solid",fontSize:13,cursor:"pointer",borderColor:(conductForm.recommended_readmission&&opt==="Yes")||(!conductForm.recommended_readmission&&opt==="No")?"#2563eb":"var(--color-border-tertiary)",background:(conductForm.recommended_readmission&&opt==="Yes")||(!conductForm.recommended_readmission&&opt==="No")?"#eff6ff":"var(--color-background-primary)",color:(conductForm.recommended_readmission&&opt==="Yes")||(!conductForm.recommended_readmission&&opt==="No")?"#2563eb":"var(--color-text-secondary)"}}>{opt}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--color-border-tertiary)",display:"flex",gap:10,justifyContent:"flex-end",background:"var(--color-background-secondary)",flexShrink:0}}>
              <button className="btn btn-secondary" onClick={()=>setShowConductModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={async()=>{try{await withdrawalApi.submitConduct(detail.id,conductForm);flash("success","Conduct form submitted.");setShowConductModal(false);setConductData(null);const c=await withdrawalApi.getConductForm(detail.id);setConductData(c.data.data);}catch(e){flash("error",e.response?.data?.message||"Failed.");}}}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}