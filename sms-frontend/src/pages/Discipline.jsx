import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { disciplineApi } from "../api/disciplineApi";
import studentsApi from "../api/studentsApi";

const STATUS_STYLES = {
  reported:          { bg:"#fef9c3", color:"#854d0e", border:"#fde047", label:"Reported"          },
  under_review:      { bg:"#dbeafe", color:"#1e40af", border:"#93c5fd", label:"Under Review"      },
  hearing_scheduled: { bg:"#ede9fe", color:"#5b21b6", border:"#c4b5fd", label:"Hearing Scheduled" },
  hearing_done:      { bg:"#e0f2fe", color:"#0369a1", border:"#7dd3fc", label:"Hearing Done"      },
  decision_pending:  { bg:"#fef9c3", color:"#854d0e", border:"#fde047", label:"Decision Pending"  },
  warning:           { bg:"#fffbeb", color:"#92400e", border:"#fcd34d", label:"Warning Issued"     },
  suspended:         { bg:"#fee2e2", color:"#991b1b", border:"#fca5a5", label:"Suspended"         },
  expelled:          { bg:"#1f2937", color:"#f9fafb", border:"#374151", label:"Expelled"          },
  suspension:        { bg:"#fee2e2", color:"#991b1b", border:"#fca5a5", label:"Suspended"         },
  expulsion:         { bg:"#1f2937", color:"#f9fafb", border:"#374151", label:"Expelled"          },
  dismissed:         { bg:"#f0fdf4", color:"#166534", border:"#86efac", label:"Dismissed"         },
  appealed:          { bg:"#fdf4ff", color:"#7e22ce", border:"#e9d5ff", label:"Appealed"          },
};

const VIOLATION_TYPES = [
  "Behavioral - Fighting/Bullying",
  "Behavioral - Harassment/Threats",
  "Academic - Cheating/Plagiarism",
  "Academic - Exam Fraud",
  "Disciplinary - Repeated Rule Violations",
  "Disciplinary - Uniform Policy",
  "Legal - Theft",
  "Legal - Substance Abuse",
  "Legal - Possession of Weapons",
  "Attendance - Unauthorized Absence",
  "Policy - Social Media Misconduct",
  "Policy - Property Damage",
  "Other",
];

const SEVERITY_LABELS = { 1:"Minor", 2:"Moderate", 3:"Serious", 4:"Critical" };
const SEVERITY_COLORS = { 1:"#22c55e", 2:"#f59e0b", 3:"#ef4444", 4:"#991b1b" };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "-";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "-";

const StatusBadge = ({status}) => {
  const s = STATUS_STYLES[status]||{bg:"#f1f5f9",color:"#475569",border:"#e2e8f0",label:status};
  return <span style={{background:s.bg,color:s.color,border:"1px solid "+s.border,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>{s.label}</span>;
};

export default function Discipline() {
  const { user, can } = useAuth();
  const role = user?.roles?.[0] || "";
  const canReport  = can("discipline.report");
  const canReview  = can("discipline.review");
  const canHearing = can("discipline.hearing");
  const canDecide  = can("discipline.decide");
  const canAppeal  = can("discipline.appeal");

  const [list,          setList]          = useState([]);
  const [detail,        setDetail]        = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [toast,         setToast]         = useState("");
  const [toastType,     setToastType]     = useState("success");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [showReport,    setShowReport]    = useState(false);
  const [showReview,    setShowReview]    = useState(false);
  const [showHearing,   setShowHearing]   = useState(false);
  const [showDecide,    setShowDecide]    = useState(false);
  const [showAppeal,    setShowAppeal]    = useState(false);
  const [students,      setStudents]      = useState([]);
  const [myClasses,     setMyClasses]     = useState([]);
  const [reportClass,   setReportClass]   = useState("");
  const [allTeachers,     setAllTeachers]     = useState([]);
  const [committee,       setCommittee]       = useState([]);
  const [committeeHead,   setCommitteeHead]   = useState(null);
  const [hearingAttendees,setHearingAttendees]= useState({student:true,parent:true,class_teacher:true});
  const [caseCommittee,   setCaseCommittee]   = useState([]);
  const [showRemarks,     setShowRemarks]     = useState(false);
  const [showFinalHearing,setShowFinalHearing]= useState(false);
  const [myTeacherId,     setMyTeacherId]     = useState(null);
  const [remarksForm,     setRemarksForm]     = useState({remarks:"",recommendation:""});
  const [finalHearingForm,setFinalHearingForm]= useState({attendees:"",final_remarks:"",outcome:""});

  const [reportForm, setReportForm] = useState({
    student_id:"", violation_type:"", severity:1, custom_violation:"",
    description:"", incident_date:new Date().toISOString().split("T")[0]
  });
  const [reviewForm, setReviewForm] = useState({ action:"review", note:"", hearing_date:"" });
  const [hearingForm, setHearingForm] = useState({ attendees:"", notes:"", outcome:"" });
  const [decideForm, setDecideForm] = useState({
    action_type:"", note:"", suspension_from:"", suspension_to:""
  });
  const [appealNote, setAppealNote] = useState("");
  const [showAppealResponse, setShowAppealResponse] = useState(false);
  const [appealResponseForm, setAppealResponseForm] = useState({outcome:"",response:""});

  const flash = (type, msg) => { setToastType(type); setToast(msg); setTimeout(()=>setToast(""),3500); };

  useEffect(() => {
    load();
    if (role==="teacher"||role==="academic_coordinator") {
      import("../api/teachersApi").then(({default:tApi})=>{
        tApi.getMe().then(r=>{ if(r.data.data?.id) setMyTeacherId(r.data.data.id); }).catch(()=>{});
      });
    }
    import("../api/teachersApi").then(({default:tApi})=>{
      tApi.getAll({per_page:200}).then(r=>setAllTeachers(r.data.data?.items||r.data.data||[])).catch(()=>{});
    });
    if (canReport && (role==="teacher"||role==="academic_coordinator")) {
      import("../api/teachersApi").then(({default:tApi})=>{
        tApi.getMe().then(r=>{
          const cls = r.data.data?.classes || [];
          // Sort: incharge classes first
          const sorted = [...cls].sort((a,b)=>{
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return (a.name||"").localeCompare(b.name||"");
          });
          setMyClasses(sorted);
          if (sorted.length>0) setReportClass(String(sorted[0].id));
        }).catch(()=>{});
      });
    } else if (canReport) {
      import("../api/academicsApi").then(({default:aApi})=>{
        aApi.getClasses().then(r=>setMyClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
      });
    }
  }, []);

  useEffect(()=>{
    if (!reportClass) { setStudents([]); return; }
    studentsApi.getAll({class_id:reportClass, status:"active", per_page:200})
      .then(r=>setStudents(r.data.data||[])).catch(()=>{});
  }, [reportClass]);

  const load = async () => {
    try { const r = await disciplineApi.getAll(); setList(r.data.data||[]); } catch { flash("error","Failed to load."); }
  };

  const loadDetail = async (id) => {
    try {
      const r = await disciplineApi.getOne(id);
      setDetail(r.data.data);
      const c = await disciplineApi.getCommittee(id);
      setCaseCommittee(c.data.data||[]);
    } catch { flash("error","Failed to load details."); }
  };

  const doSubmit = async (fn, successMsg) => {
    setLoading(true);
    try {
      await fn();
      flash("success", successMsg);
      load();
      if (detail) loadDetail(detail.id);
    } catch(e) { flash("error", e.response?.data?.message||"Failed."); }
    finally { setLoading(false); }
  };

  const filteredList = statusFilter ? list.filter(c=>c.status===statusFilter) : list;

  const TIMELINE = detail ? [
    {label:"Case Reported",       done:true,                              current:false,                                     by:detail.reported_by_name, at:detail.created_at},
    {label:"Coordinator Review",  done:!!detail.coordinator_name,         current:detail.status==="reported",                by:detail.coordinator_name, at:null, note:detail.action_note},
    {label:"Hearing Scheduled",   done:detail.status!=="reported"&&detail.status!=="under_review"&&detail.hearing_date!=null, current:detail.status==="under_review", by:null, at:detail.hearing_date},
    {label:"Hearing Conducted",   done:["hearing_done","decision_pending","warning","suspension","suspended","expulsion","expelled","dismissed","appealed"].includes(detail.status), current:detail.status==="hearing_scheduled", by:null, at:detail.hearings?.[0]?.conducted_at},
    {label:"Decision",            done:["warning","suspension","suspended","expulsion","expelled","dismissed","appealed"].includes(detail.status), current:detail.status==="hearing_done"||detail.status==="decision_pending", by:detail.principal_name, at:null},
  ] : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Discipline Cases</h1>
        {canReport && <button className="btn btn-primary" onClick={()=>setShowReport(true)}>+ Report Case</button>}
      </div>

      {toast && <div className={"alert "+(toastType==="error"?"alert-error":"alert-success")} style={{marginBottom:16}}>{toast}</div>}

      {/* Filters */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {["","reported","under_review","hearing_scheduled","hearing_done","warning","suspension","expulsion","dismissed","appealed"].map(f=>(
          <button key={f} onClick={()=>setStatusFilter(f)} style={{padding:"4px 12px",borderRadius:20,border:"1px solid",fontSize:11,cursor:"pointer",borderColor:statusFilter===f?"#2563eb":"#e2e8f0",background:statusFilter===f?"#eff6ff":"#fff",color:statusFilter===f?"#2563eb":"#64748b",fontWeight:statusFilter===f?600:400}}>
            {f===""?"All":STATUS_STYLES[f]?.label||f}
          </button>
        ))}
        <span style={{fontSize:11,color:"var(--color-text-secondary)",alignSelf:"center",marginLeft:4}}>{filteredList.length} case{filteredList.length!==1?"s":""}</span>
      </div>

      <div style={{display:"grid",gridTemplateColumns:detail?"1fr 420px":"1fr",gap:20,alignItems:"start"}}>

        {/* List */}
        <div style={{background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
          {filteredList.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-secondary)",fontSize:14}}>No discipline cases found.</div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1.5px solid #cbd5e1",background:"var(--color-background-secondary)"}}>
                  {["Student","Class","Violation","Severity","Incident Date","Status",""].map(h=>(
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.map((c,i)=>{
                  const active = detail?.id===c.id;
                  return (
                    <tr key={c.id} style={{borderBottom:"1px solid #e2e8f0",background:active?"#eff6ff":"#fff",cursor:"pointer",transition:"background .1s"}} onClick={()=>loadDetail(c.id)}>
                      <td style={{padding:"12px 14px"}}>
                        <div style={{fontWeight:600,color:"var(--color-text-primary)"}}>{c.student_name}</div>
                        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{c.enrollment_no}</div>
                      </td>
                      <td style={{padding:"12px 14px",color:"var(--color-text-primary)"}}>{c.class_name}{c.section?" ("+c.section+")":""}</td>
                      <td style={{padding:"12px 14px",color:"var(--color-text-secondary)",maxWidth:180,fontSize:12}}>{c.violation_type}</td>
                      <td style={{padding:"12px 14px"}}>
                        <span style={{background:SEVERITY_COLORS[c.severity]+"22",color:SEVERITY_COLORS[c.severity],padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{SEVERITY_LABELS[c.severity]||c.severity}</span>
                      </td>
                      <td style={{padding:"12px 14px",color:"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{fmtDate(c.incident_date)}</td>
                      <td style={{padding:"12px 14px"}}><StatusBadge status={c.status} /></td>
                      <td style={{padding:"12px 14px"}}><button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();loadDetail(c.id);}}>View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail Panel */}
        {detail && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className="section-card" style={{padding:0,overflow:"hidden"}}>

              {/* Header */}
              <div style={{padding:"16px 20px",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16}}>{detail.student_name}</div>
                  <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{detail.enrollment_no} &middot; {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <StatusBadge status={detail.status} />
                    <span style={{fontSize:11,background:SEVERITY_COLORS[detail.severity]+"22",color:SEVERITY_COLORS[detail.severity],padding:"2px 8px",borderRadius:10,fontWeight:600}}>{SEVERITY_LABELS[detail.severity]} Severity</span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setDetail(null)}>Close</button>
              </div>

              {/* Violation */}
              <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Violation</div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--color-text-primary)",marginBottom:4}}>{detail.violation_type}</div>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 14px"}}>{detail.description}</div>
                <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:6}}>Incident: {fmtDate(detail.incident_date)} &middot; Reported by: {detail.reported_by_name}</div>
              </div>

              {/* Timeline */}
              <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:12}}>Progress</div>
                {TIMELINE.map((step,i)=>(
                  <div key={i} style={{display:"flex",gap:12,marginBottom:10,opacity:(!step.done&&!step.current)?0.4:1}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:step.done?"#22c55e":step.current?"#2563eb":"var(--color-background-tertiary)",border:step.current?"2px solid #2563eb":"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:step.done||step.current?"#fff":"#94a3b8"}}>
                        {step.done?"✓":step.current?"●":i+1}
                      </div>
                      {i<TIMELINE.length-1&&<div style={{width:2,flex:1,minHeight:12,background:step.done?"#22c55e":"#e2e8f0",marginTop:2}}/>}
                    </div>
                    <div style={{flex:1,paddingBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontSize:13,fontWeight:step.current?700:600,color:step.current?"#2563eb":step.done?"var(--color-text-primary)":"var(--color-text-secondary)"}}>{step.label}</div>
                        {step.current&&<span style={{fontSize:10,fontWeight:700,background:"#eff6ff",color:"#2563eb",padding:"1px 7px",borderRadius:10}}>Current</span>}
                      </div>
                      {step.by&&<div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:1}}>{step.by}{step.at?" - "+fmtDateTime(step.at):""}</div>}
                      {step.note&&<div style={{fontSize:11,color:"var(--color-text-secondary)",fontStyle:"italic",marginTop:2}}>"{step.note}"</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hearing Info */}
              {detail.hearings?.length>0&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Hearing Records</div>
                  {detail.hearings.map((h,i)=>(
                    <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Hearing {i+1} &middot; {fmtDateTime(h.conducted_at)}</div>
                      <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}><strong>Attendees:</strong> {h.attendees}</div>
                      <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}><strong>Notes:</strong> {h.notes}</div>
                      <div style={{fontSize:12,color:"var(--color-text-secondary)"}}><strong>Outcome:</strong> {h.outcome}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Decision */}
              {detail.action_type&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Decision</div>
                  <div style={{background:detail.action_type==="expulsion"?"#fef2f2":detail.action_type==="suspension"?"#fffbeb":"#f0fdf4",borderRadius:8,padding:"12px 14px",border:"1px solid "+(detail.action_type==="expulsion"?"#fecaca":detail.action_type==="suspension"?"#fde68a":"#bbf7d0")}}>
                    <div style={{fontWeight:700,fontSize:14,color:detail.action_type==="expulsion"?"#991b1b":detail.action_type==="suspension"?"#854d0e":"#166534",textTransform:"uppercase",marginBottom:6}}>{detail.action_type}</div>
                    {detail.suspension_from&&<div style={{fontSize:12,marginBottom:4}}>Period: {fmtDate(detail.suspension_from)} to {fmtDate(detail.suspension_to)}</div>}
                    {detail.action_note&&<div style={{fontSize:13,color:"var(--color-text-secondary)"}}>{detail.action_note}</div>}
                    {detail.appeal_deadline&&<div style={{fontSize:11,color:"#854d0e",marginTop:6}}>Appeal deadline: {fmtDate(detail.appeal_deadline)}</div>}
                  </div>
                </div>
              )}

              {/* Committee Remarks */}
              {caseCommittee.length>0&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Hearing Committee</div>
                  {caseCommittee.map((m,i)=>(
                    <div key={i} style={{borderRadius:8,padding:"10px 14px",marginBottom:8,background:m.is_head?"#fef9c3":"var(--color-background-secondary)",border:"1px solid "+(m.is_head?"#fde68a":"var(--color-border-tertiary)")}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:m.remarks?6:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:13,fontWeight:600}}>{m.teacher_name}</span>
                          {m.is_head&&<span style={{fontSize:10,fontWeight:700,background:"#fde68a",color:"#854d0e",padding:"1px 7px",borderRadius:10}}>HEAD</span>}
                        </div>
                        {m.submitted_at
                          ? <span style={{fontSize:11,fontWeight:600,color:"#166534",background:"#dcfce7",padding:"2px 8px",borderRadius:10}}>Submitted</span>
                          : <span style={{fontSize:11,fontWeight:600,color:"#854d0e",background:"#fef9c3",padding:"2px 8px",borderRadius:10}}>Pending</span>
                        }
                      </div>
                      {m.remarks&&(
                        <>
                          <div style={{fontSize:13,color:"var(--color-text-primary)",marginBottom:4}}>{m.remarks}</div>
                          <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>
                            Recommendation: <strong style={{color:m.recommendation==="expulsion"?"#991b1b":m.recommendation==="suspension"?"#ef4444":m.recommendation==="warning"?"#f59e0b":"#166534"}}>{m.recommendation}</strong>
                            &nbsp;&middot;&nbsp;{m.submitted_at?new Date(m.submitted_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):""}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {/* My Remarks Action */}
                  {role==="teacher" && myTeacherId && (()=>{
                    const myEntry = caseCommittee.find(m=>m.teacher_id===myTeacherId);
                    const allSubmitted = caseCommittee.every(m=>m.submitted_at);
                    if (!myEntry) return null;
                    return (
                      <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                        {!myEntry.submitted_at&&(
                          <button className="btn btn-primary" onClick={()=>{setRemarksForm({remarks:"",recommendation:""});setShowRemarks(true);}}>Submit My Remarks</button>
                        )}
                        {myEntry.is_head && allSubmitted && detail.status==="hearing_scheduled" && (
                          <button className="btn btn-primary" style={{background:"#166534"}} onClick={()=>{setFinalHearingForm({attendees:"",final_remarks:"",outcome:""});setShowFinalHearing(true);}}>Submit Final Hearing Report</button>
                        )}
                        {myEntry.submitted_at&&!myEntry.is_head&&<span style={{fontSize:12,color:"#166534"}}>Your remarks have been submitted.</span>}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Evidence */}
              {detail.evidence?.length>0&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Evidence ({detail.evidence.length})</div>
                  {detail.evidence.map((e,i)=>(
                    <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:i<detail.evidence.length-1?"1px solid var(--color-border-tertiary)":"none"}}>
                      <span style={{fontSize:16}}>&#128206;</span>
                      <div style={{flex:1}}>
                        <button onClick={()=>disciplineApi.downloadEvidence(detail.id,e.id)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:13,fontWeight:500,color:"#2563eb",textDecoration:"underline",textAlign:"left"}}>{e.filename}</button>
                        {e.description&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{e.description}</div>}
                        <div style={{fontSize:11,color:"#94a3b8"}}>{e.uploaded_by_name} - {fmtDate(e.uploaded_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Appeals */}
              {detail.appeals?.length>0&&(
                <div style={{padding:"14px 20px",borderBottom:"1px solid var(--color-border-tertiary)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Appeals</div>
                  {detail.appeals.map((a,i)=>(
                    <div key={i} style={{background:"#fdf4ff",border:"1px solid #e9d5ff",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#7e22ce",marginBottom:4}}>Appeal by {a.submitted_by_name} &middot; {fmtDate(a.submitted_at)}</div>
                      <div style={{fontSize:13,color:"var(--color-text-primary)"}}>{a.appeal_note}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{padding:"14px 20px"}}>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {canReview && detail.status==="reported" && (
                    <button className="btn btn-primary" onClick={()=>{setReviewForm({action:"review",note:"",hearing_date:""});setShowReview(true);}}>Review Case</button>
                  )}
                  {canReview && detail.status==="under_review" && (
                    <button className="btn btn-primary" onClick={()=>{setReviewForm({action:"schedule",note:"",hearing_date:""});setShowReview(true);}}>Schedule Hearing</button>
                  )}
                  {canHearing && detail.status==="hearing_scheduled" && (
                    <button className="btn btn-primary" onClick={()=>{setHearingForm({attendees:"",notes:"",outcome:""});setShowHearing(true);}}>Record Hearing</button>
                  )}
                  {canDecide && ["hearing_done","decision_pending"].includes(detail.status) && (
                    <button className="btn btn-primary" style={{background:"#991b1b"}} onClick={()=>{setDecideForm({action_type:"",note:"",suspension_from:"",suspension_to:""});setShowDecide(true);}}>Make Decision</button>
                  )}
                  {canReport && (
                    <label className="btn btn-ghost btn-sm" style={{cursor:"pointer"}}>
                      + Evidence
                      <input type="file" style={{display:"none"}} onChange={async(e)=>{
                        if(!e.target.files[0]) return;
                        const fd = new FormData();
                        fd.append("file", e.target.files[0]);
                        fd.append("description","");
                        try { await disciplineApi.uploadEvidence(detail.id, fd); flash("success","Evidence uploaded."); loadDetail(detail.id); }
                        catch { flash("error","Upload failed."); }
                      }} />
                    </label>
                  )}
                  {canDecide && detail.status==="appealed" && (
                    <button className="btn btn-primary" style={{background:"#7e22ce"}} onClick={()=>{setAppealResponseForm({outcome:"",response:""});setShowAppealResponse(true);}}>Respond to Appeal</button>
                  )}
                  {canAppeal && ["expelled","suspended","suspension","expulsion"].includes(detail.status) && !detail.appeal_submitted && detail.appeal_deadline && detail.appeal_deadline >= new Date().toISOString().split("T")[0] && (
                    <button className="btn btn-ghost btn-sm" style={{color:"#7e22ce",border:"1px solid #e9d5ff"}} onClick={()=>{setAppealNote("");setShowAppeal(true);}}>Submit Appeal</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReport&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:540,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#fef2f2",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16,color:"#991b1b"}}>Report Discipline Case</div>
              <div style={{fontSize:12,color:"#991b1b",marginTop:2}}>Report a student for disciplinary action</div>
            </div>
            <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Class *</label>
                <select className="form-control" value={reportClass} onChange={e=>{setReportClass(e.target.value);setReportForm(f=>({...f,student_id:""}));}}>
                  <option value="">Select class</option>
                  {myClasses.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}{c.is_primary?" [Incharge]":""}</option>)}
                </select>
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Student *</label>
                <select className="form-control" value={reportForm.student_id} onChange={e=>setReportForm(f=>({...f,student_id:e.target.value}))} disabled={!reportClass}>
                  <option value="">{reportClass?"Select student":"Select class first"}</option>
                  {students.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.enrollment_no})</option>)}
                </select>
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Violation Type *</label>
                <select className="form-control" value={reportForm.violation_type} onChange={e=>setReportForm(f=>({...f,violation_type:e.target.value,custom_violation:""}))}>
                  <option value="">Select violation type</option>
                  {VIOLATION_TYPES.map(v=><option key={v} value={v}>{v}</option>)}
                </select>
                {reportForm.violation_type==="Other" && (
                  <textarea className="form-control" style={{marginTop:8,minHeight:60,resize:"vertical"}}
                    placeholder="Describe the violation type in detail..."
                    value={reportForm.custom_violation||""}
                    onChange={e=>setReportForm(f=>({...f,custom_violation:e.target.value}))}
                  />
                )}
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Severity *</label>
                <div style={{display:"flex",gap:8}}>
                  {[1,2,3,4].map(s=>(
                    <button key={s} onClick={()=>setReportForm(f=>({...f,severity:s}))} style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid",borderColor:reportForm.severity===s?SEVERITY_COLORS[s]:"#e2e8f0",background:reportForm.severity===s?SEVERITY_COLORS[s]+"22":"#fff",color:reportForm.severity===s?SEVERITY_COLORS[s]:"#64748b",fontWeight:reportForm.severity===s?700:400,fontSize:12,cursor:"pointer"}}>
                      {s} - {SEVERITY_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Incident Date *</label>
                <input type="date" className="form-control" value={reportForm.incident_date} onChange={e=>setReportForm(f=>({...f,incident_date:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea className="form-control" value={reportForm.description} onChange={e=>setReportForm(f=>({...f,description:e.target.value}))} placeholder="Describe the incident in detail..." style={{minHeight:100,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc",flexShrink:0}}>
              <button className="btn btn-secondary" onClick={()=>setShowReport(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#991b1b"}} disabled={loading} onClick={()=>doSubmit(()=>disciplineApi.report({...reportForm, violation_type: reportForm.violation_type==="Other" && reportForm.custom_violation ? "Other: "+reportForm.custom_violation : reportForm.violation_type}),"Case reported successfully.").then(()=>setShowReport(false))}>{loading?"Reporting...":"Report Case"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReview&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:560,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc",flexShrink:0}}>
              <div style={{fontWeight:600,fontSize:16}}>{reviewForm.action==="schedule"?"Schedule Hearing & Form Committee":"Review Case"}</div>
            </div>
            <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
              {reviewForm.action==="schedule" ? (
                <>
                  <div className="form-group" style={{marginBottom:14}}>
                    <label className="form-label">Hearing Date & Time *</label>
                    <input type="datetime-local" className="form-control" value={reviewForm.hearing_date} onChange={e=>setReviewForm(f=>({...f,hearing_date:e.target.value}))} />
                  </div>
                  <div className="form-group" style={{marginBottom:14}}>
                    <label className="form-label">Required Attendees</label>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      {[{key:"student",label:"Student"},{key:"parent",label:"Parent/Guardian"},{key:"class_teacher",label:"Class Teacher"},{key:"principal",label:"Principal"}].map(a=>(
                        <label key={a.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",padding:"6px 12px",borderRadius:8,border:"1px solid",borderColor:hearingAttendees[a.key]?"#2563eb":"#e2e8f0",background:hearingAttendees[a.key]?"#eff6ff":"#fff",color:hearingAttendees[a.key]?"#2563eb":"#475569"}}>
                          <input type="checkbox" checked={!!hearingAttendees[a.key]} onChange={e=>setHearingAttendees(prev=>({...prev,[a.key]:e.target.checked}))} style={{display:"none"}} />
                          {a.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{marginBottom:14}}>
                    <label className="form-label">Hearing Committee Members *</label>
                    <div style={{maxHeight:160,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8,padding:8}}>
                      {allTeachers.map(t=>(
                        <label key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,cursor:"pointer",background:committee.includes(t.id)?"#eff6ff":"transparent"}}>
                          <input type="checkbox" checked={committee.includes(t.id)} onChange={e=>{if(e.target.checked){setCommittee(prev=>[...prev,t.id]);}else{setCommittee(prev=>prev.filter(x=>x!==t.id));if(committeeHead===t.id)setCommitteeHead(null);}}} />
                          <span style={{fontSize:13,color:committee.includes(t.id)?"#2563eb":"var(--color-text-primary)"}}>{t.first_name} {t.last_name}</span>
                          {t.class_name&&<span style={{fontSize:11,color:"#64748b"}}>({t.class_name}{t.section?" "+t.section:""})</span>}
                          {committeeHead===t.id&&<span style={{fontSize:10,fontWeight:700,background:"#fef9c3",color:"#854d0e",padding:"1px 7px",borderRadius:10}}>HEAD</span>}
                        </label>
                      ))}
                    </div>
                    {committee.length>0&&<div style={{fontSize:12,color:"#2563eb",marginTop:6}}>{committee.length} member(s) selected</div>}
                  </div>
                  {committee.length>0&&(
                    <div className="form-group" style={{marginBottom:14}}>
                      <label className="form-label">Head of Committee *</label>
                      <select className="form-control" value={committeeHead||""} onChange={e=>setCommitteeHead(Number(e.target.value)||null)}>
                        <option value="">Select head</option>
                        {allTeachers.filter(t=>committee.includes(t.id)).map(t=>(
                          <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : null}
              <div className="form-group">
                <label className="form-label">Note {reviewForm.action==="schedule"?"(Instructions for committee)":""}</label>
                <textarea className="form-control" value={reviewForm.note} onChange={e=>setReviewForm(f=>({...f,note:e.target.value}))} placeholder={reviewForm.action==="schedule"?"Add any instructions or agenda for the hearing committee...":"Add review notes..."} style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc",flexShrink:0}}>
              <button className="btn btn-secondary" onClick={()=>setShowReview(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} onClick={()=>{
                const attendeeList = Object.entries(hearingAttendees).filter(([k,v])=>v).map(([k])=>k.replace("_"," ")).join(", ");
                const committeeNote = committee.length>0 ? " | Committee: "+allTeachers.filter(t=>committee.includes(t.id)).map(t=>t.first_name+" "+t.last_name).join(", ") : "";
                const headTeacher = allTeachers.find(t=>t.id===committeeHead);
                const headNote = headTeacher ? " | Head: "+headTeacher.first_name+" "+headTeacher.last_name : "";
                const fullNote = (reviewForm.note||"") + (reviewForm.action==="schedule" ? " | Attendees: "+attendeeList+committeeNote+headNote : "");
                doSubmit(async()=>{
                  await disciplineApi.review(detail.id,{...reviewForm,note:fullNote,hearing_date:reviewForm.hearing_date||null});
                  if(reviewForm.action==="schedule" && committee.length>0 && committeeHead) {
                    await disciplineApi.assignCommittee(detail.id,{teacher_ids:committee,head_id:committeeHead});
                  }
                },"Hearing scheduled & committee assigned.").then(()=>setShowReview(false));
              }}>{loading?"Saving...":"Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Hearing Modal */}
      {showHearing&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc"}}>
              <div style={{fontWeight:600,fontSize:16}}>Record Hearing</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Attendees *</label>
                <input className="form-control" value={hearingForm.attendees} onChange={e=>setHearingForm(f=>({...f,attendees:e.target.value}))} placeholder="e.g. Student, Parent, Class Teacher, Principal..." />
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Hearing Notes *</label>
                <textarea className="form-control" value={hearingForm.notes} onChange={e=>setHearingForm(f=>({...f,notes:e.target.value}))} placeholder="Record discussion points and statements..." style={{minHeight:90,resize:"vertical"}} />
              </div>
              <div className="form-group">
                <label className="form-label">Outcome / Recommendation *</label>
                <textarea className="form-control" value={hearingForm.outcome} onChange={e=>setHearingForm(f=>({...f,outcome:e.target.value}))} placeholder="Summarize the hearing outcome..." style={{minHeight:70,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button className="btn btn-secondary" onClick={()=>setShowHearing(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading} onClick={()=>doSubmit(()=>disciplineApi.hearing(detail.id,hearingForm),"Hearing recorded.").then(()=>setShowHearing(false))}>{loading?"Saving...":"Record Hearing"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Decide Modal */}
      {showDecide&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#fef2f2"}}>
              <div style={{fontWeight:700,fontSize:16,color:"#991b1b"}}>Make Decision</div>
              <div style={{fontSize:12,color:"#991b1b",marginTop:2}}>This decision will be final and affect student status</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Decision *</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[{v:"warning",l:"Warning",c:"#f59e0b"},{v:"suspension",l:"Suspension",c:"#ef4444"},{v:"expulsion",l:"Expulsion",c:"#991b1b"},{v:"dismissed",l:"Dismiss Case",c:"#22c55e"}].map(opt=>(
                    <button key={opt.v} onClick={()=>setDecideForm(f=>({...f,action_type:opt.v}))} style={{padding:"10px",borderRadius:8,border:"2px solid",borderColor:decideForm.action_type===opt.v?opt.c:"#e2e8f0",background:decideForm.action_type===opt.v?opt.c+"22":"#fff",color:decideForm.action_type===opt.v?opt.c:"#64748b",fontWeight:decideForm.action_type===opt.v?700:400,fontSize:13,cursor:"pointer"}}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              {decideForm.action_type==="suspension"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">From *</label>
                    <input type="date" className="form-control" value={decideForm.suspension_from} onChange={e=>setDecideForm(f=>({...f,suspension_from:e.target.value}))} />
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">To *</label>
                    <input type="date" className="form-control" value={decideForm.suspension_to} onChange={e=>setDecideForm(f=>({...f,suspension_to:e.target.value}))} />
                  </div>
                </div>
              )}
              {decideForm.action_type==="expulsion"&&(
                <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#991b1b"}}>
                  ⚠️ This will permanently change student status to <strong>Expelled</strong>. Parent will have 7 days to appeal.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Decision Note *</label>
                <textarea className="form-control" value={decideForm.note} onChange={e=>setDecideForm(f=>({...f,note:e.target.value}))} placeholder="Explain the reasoning for this decision..." style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button className="btn btn-secondary" onClick={()=>setShowDecide(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#991b1b"}} disabled={loading||!decideForm.action_type} onClick={()=>doSubmit(()=>disciplineApi.decide(detail.id,decideForm),"Decision recorded.").then(()=>setShowDecide(false))}>{loading?"Processing...":"Confirm Decision"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Member Remarks Modal */}
      {showRemarks&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc"}}>
              <div style={{fontWeight:600,fontSize:16}}>Submit Hearing Remarks</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Submit your individual assessment of this case</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Recommendation *</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[{v:"warning",l:"Warning",c:"#f59e0b"},{v:"suspension",l:"Suspension",c:"#ef4444"},{v:"expulsion",l:"Expulsion",c:"#991b1b"},{v:"dismissed",l:"Dismiss",c:"#22c55e"}].map(opt=>(
                    <button key={opt.v} onClick={()=>setRemarksForm(f=>({...f,recommendation:opt.v}))} style={{padding:"8px",borderRadius:8,border:"2px solid",borderColor:remarksForm.recommendation===opt.v?opt.c:"#e2e8f0",background:remarksForm.recommendation===opt.v?opt.c+"22":"#fff",color:remarksForm.recommendation===opt.v?opt.c:"#64748b",fontWeight:remarksForm.recommendation===opt.v?700:400,fontSize:13,cursor:"pointer"}}>{opt.l}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Your Remarks *</label>
                <textarea className="form-control" value={remarksForm.remarks} onChange={e=>setRemarksForm(f=>({...f,remarks:e.target.value}))} placeholder="Provide your detailed assessment and findings..." style={{minHeight:100,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button className="btn btn-secondary" onClick={()=>setShowRemarks(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading||!remarksForm.remarks||!remarksForm.recommendation} onClick={()=>doSubmit(()=>disciplineApi.submitRemarks(detail.id,remarksForm),"Remarks submitted.").then(()=>setShowRemarks(false))}>{loading?"Submitting...":"Submit Remarks"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Final Hearing Modal */}
      {showFinalHearing&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:560,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f0fdf4",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16,color:"#166534"}}>Submit Final Hearing Report</div>
              <div style={{fontSize:12,color:"#166534",marginTop:2}}>As head of committee, consolidate all remarks and submit final report</div>
            </div>
            <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
              {/* Show all member remarks for reference */}
              <div style={{marginBottom:16,background:"#f8fafc",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:".06em"}}>Committee Remarks Summary</div>
                {caseCommittee.map((m,i)=>(
                  <div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:i<caseCommittee.length-1?"1px solid #e2e8f0":"none"}}>
                    <div style={{fontSize:12,fontWeight:600}}>{m.teacher_name}{m.is_head?" (Head)":""} ? <span style={{color:"#2563eb"}}>{m.recommendation}</span></div>
                    <div style={{fontSize:12,color:"#64748b"}}>{m.remarks||"No remarks yet"}</div>
                  </div>
                ))}
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Attendees *</label>
                <input className="form-control" value={finalHearingForm.attendees} onChange={e=>setFinalHearingForm(f=>({...f,attendees:e.target.value}))} placeholder="Student, Parent, Class Teacher, Committee Members..." />
              </div>
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Final Consolidated Remarks *</label>
                <textarea className="form-control" value={finalHearingForm.final_remarks} onChange={e=>setFinalHearingForm(f=>({...f,final_remarks:e.target.value}))} placeholder="Summarize committee findings and observations..." style={{minHeight:90,resize:"vertical"}} />
              </div>
              <div className="form-group">
                <label className="form-label">Committee Recommendation / Outcome *</label>
                <textarea className="form-control" value={finalHearingForm.outcome} onChange={e=>setFinalHearingForm(f=>({...f,outcome:e.target.value}))} placeholder="State the committee outcome and recommendation to principal..." style={{minHeight:70,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc",flexShrink:0}}>
              <button className="btn btn-secondary" onClick={()=>setShowFinalHearing(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#166534"}} disabled={loading||!finalHearingForm.final_remarks||!finalHearingForm.outcome} onClick={()=>doSubmit(()=>disciplineApi.submitFinalHearing(detail.id,finalHearingForm),"Final hearing report submitted.").then(()=>setShowFinalHearing(false))}>{loading?"Submitting...":"Submit Final Report"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Response Modal */}
      {showAppealResponse && detail && (
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e9d5ff",background:"#fdf4ff"}}>
              <div style={{fontWeight:700,fontSize:16,color:"#7e22ce"}}>Respond to Appeal</div>
              <div style={{fontSize:12,color:"#7e22ce",marginTop:2}}>Review the parent appeal and make your final decision</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              {/* Show appeal note */}
              {detail.appeals?.length>0&&(
                <div style={{background:"#fdf4ff",border:"1px solid #e9d5ff",borderRadius:8,padding:"12px 14px",marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#7e22ce",marginBottom:6}}>PARENT APPEAL</div>
                  <div style={{fontSize:13,color:"var(--color-text-primary)"}}>{detail.appeals[0].appeal_note}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:4}}>By {detail.appeals[0].submitted_by_name} &middot; {fmtDate(detail.appeals[0].submitted_at)}</div>
                </div>
              )}
              <div className="form-group" style={{marginBottom:14}}>
                <label className="form-label">Decision *</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <button onClick={()=>setAppealResponseForm(f=>({...f,outcome:"overturned"}))} style={{padding:"12px",borderRadius:8,border:"2px solid",borderColor:appealResponseForm.outcome==="overturned"?"#22c55e":"#e2e8f0",background:appealResponseForm.outcome==="overturned"?"#f0fdf4":"#fff",color:appealResponseForm.outcome==="overturned"?"#166534":"#64748b",fontWeight:appealResponseForm.outcome==="overturned"?700:400,cursor:"pointer",fontSize:13}}>
                    Accept Appeal<br/><span style={{fontSize:11,fontWeight:400}}>Student reinstated</span>
                  </button>
                  <button onClick={()=>setAppealResponseForm(f=>({...f,outcome:"upheld"}))} style={{padding:"12px",borderRadius:8,border:"2px solid",borderColor:appealResponseForm.outcome==="upheld"?"#991b1b":"#e2e8f0",background:appealResponseForm.outcome==="upheld"?"#fef2f2":"#fff",color:appealResponseForm.outcome==="upheld"?"#991b1b":"#64748b",fontWeight:appealResponseForm.outcome==="upheld"?700:400,cursor:"pointer",fontSize:13}}>
                    Reject Appeal<br/><span style={{fontSize:11,fontWeight:400}}>Original decision stands</span>
                  </button>
                </div>
              </div>
              {appealResponseForm.outcome==="overturned"&&(
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#166534"}}>
                  Student status will be changed back to <strong>Active</strong>.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Response Note *</label>
                <textarea className="form-control" value={appealResponseForm.response} onChange={e=>setAppealResponseForm(f=>({...f,response:e.target.value}))} placeholder="Explain your decision on the appeal..." style={{minHeight:80,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button className="btn btn-secondary" onClick={()=>setShowAppealResponse(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#7e22ce"}} disabled={loading||!appealResponseForm.outcome||!appealResponseForm.response.trim()} onClick={()=>doSubmit(()=>disciplineApi.respondAppeal(detail.id,appealResponseForm),"Appeal response recorded.").then(()=>setShowAppealResponse(false))}>{loading?"Processing...":"Submit Response"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Modal */}
      {showAppeal&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e9d5ff",background:"#fdf4ff"}}>
              <div style={{fontWeight:600,fontSize:16,color:"#7e22ce"}}>Submit Appeal</div>
              <div style={{fontSize:12,color:"#7e22ce",marginTop:2}}>Appeal deadline: {fmtDate(detail?.appeal_deadline)}</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div className="form-group">
                <label className="form-label">Appeal Reason *</label>
                <textarea className="form-control" value={appealNote} onChange={e=>setAppealNote(e.target.value)} placeholder="Explain why you are appealing this decision..." style={{minHeight:100,resize:"vertical"}} />
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button className="btn btn-secondary" onClick={()=>setShowAppeal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:"#7e22ce"}} disabled={loading||!appealNote.trim()} onClick={()=>doSubmit(()=>disciplineApi.appeal(detail.id,{note:appealNote}),"Appeal submitted.").then(()=>setShowAppeal(false))}>{loading?"Submitting...":"Submit Appeal"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}