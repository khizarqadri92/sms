import { useState, useEffect } from "react";
import { withdrawalApi } from "../api/withdrawalApi";
import studentsApi from "../api/studentsApi";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./StudentViews.css";

// Colours for each status: .sv-wst--<status> in StudentViews.css (light + dark)
const STATUS_STYLES = {
  pending:           { label:"Pending"           },
  under_review:      { label:"Under Review"      },
  clearance:         { label:"Clearance"         },
  coordinator_final: { label:"Final Processing"  },
  approved:          { label:"Approved"          },
  rejected:          { label:"Rejected"          },
  withdrawn:         { label:"Withdrawn"         },
};
const wst = (status) => "sv-wst--" + status;
const DEPT_LABELS = { finance:"Finance", library:"Library", admin:"Admin", hr:"HR", transport:"Transport" };

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => new Date().toISOString().slice(0,7)+"-01";

export default function WithdrawalHistory() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";
  const { user } = useAuth();
  const [list,       setList]      = useState([]);
  const [detail,     setDetail]    = useState(null);
  const [tc,         setTc]        = useState(null);
  const [showTc,     setShowTc]    = useState(false);
  const [loading,    setLoading]   = useState(true);
  const [tcLoading,  setTcLoading] = useState(false);
  const [conductData,setConductData]=useState(null);
  const [activeTab,  setActiveTab] = useState("overview");
  const [attData,    setAttData]   = useState([]);
  const [attSummary, setAttSummary]= useState(null);
  const [attFrom,    setAttFrom]   = useState(monthStart());
  const [attTo,      setAttTo]     = useState(today());
  useEffect(() => { setAttFrom(processingToday.slice(0,7) + "-01"); setAttTo(processingToday); }, [processingToday]);
  const [gradesData, setGradesData]= useState([]);
  const [feesData,   setFeesData]  = useState(null);
  const [tabLoading, setTabLoading]= useState(false);

  useEffect(() => {
    withdrawalApi.getAll()
      .then(r => setList(r.data.data||[]))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);

  const loadDetail = async (w) => {
    setActiveTab("overview"); setTc(null); setConductData(null);
    try {
      const r = await withdrawalApi.getOne(w.id);
      const d = r.data.data; console.log('detail loaded:', d); setDetail(d);
      const c = await withdrawalApi.getConductForm(w.id);
      setConductData(c.data.data);
    } catch { setDetail(w); }
  };

  const loadTC = async (id) => {
    setTcLoading(true);
    try { const r = await withdrawalApi.getTC(id); setTc(r.data.data); setShowTc(true); }
    catch {} finally { setTcLoading(false); }
  };

  const loadTabData = async (tab, studentId) => {
    setActiveTab(tab); setTabLoading(true);
    try {
      if (tab==="attendance") {
        const [rec, sum] = await Promise.all([
          studentsApi.getAttendance(studentId, {from:attFrom, to:attTo}),
          studentsApi.getAttendanceSummary(studentId, {month:attFrom}),
        ]);
        setAttData(rec.data.data||[]);
        setAttSummary(sum.data.data);
      } else if (tab==="grades") {
        const r = await studentsApi.getGrades(studentId);
        setGradesData(r.data.data||[]);
      } else if (tab==="fees") {
        const r = await studentsApi.getFees(studentId);
        setFeesData(r.data.data);
      }
    } catch {} finally { setTabLoading(false); }
  };

  const printTC = () => {
    const el = document.getElementById("tc-print");
    const w = window.open("","_blank");
    w.document.write("<html><head><title>Transfer Certificate</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#000}*{box-sizing:border-box}</style></head><body>"+el.innerHTML+"</body></html>");
    w.document.close(); w.print();
  };

  const STATUS_BADGE_INLINE = {
    present:  { label:"Present"  },
    absent:   { label:"Absent"   },
    late:     { label:"Late"     },
    excused:  { label:"Excused"  },
    on_leave: { label:"On Leave" },
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Withdrawal History</h1>
      </div>

      <div className={"sv-wd-layout" + (detail ? " sv-wd-layout--split" : "")}>

        {/* List */}
        <div className="sv-wd-list">
          {list.length===0 ? (
            <div className="sv-wd-empty">No withdrawal requests found.</div>
          ) : list.map(w => {
            const s = STATUS_STYLES[w.status]||{label:w.status};
            const active = detail?.id===w.id;
            return (
              <div key={w.id} onClick={()=>loadDetail(w)} className={"sv-wd-item " + wst(w.status) + (active ? " sv-wd-item--on" : "")}>
                <div className="sv-wd-item-top">
                  <div>
                    <div className="sv-wd-name">{w.student_name}</div>
                    <div className="sv-wd-meta">{w.enrollment_no} &middot; {w.class_name}{w.section?" ("+w.section+")":""}</div>
                  </div>
                  <span className={"sv-wd-pill " + wst(w.status)}>{s.label}</span>
                </div>
                <div className="sv-wd-reason">{w.reason?.slice(0,60)}{w.reason?.length>60?"...":""}</div>
                <div className="sv-wd-date">Applied: {fmtDate(w.requested_at)}</div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        {detail && (
          <div className="sv-wd-detail">

            {/* Header */}
            <div className="section-card sv-wd-card">
              <div className="sv-wd-head">
                <div>
                  <div className="sv-wd-head-name">{detail.student_name}</div>
                  <div className="sv-wd-head-meta">{detail.enrollment_no} &middot; {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div className="sv-wd-head-pill">
                    <span className={"sv-wd-pill " + wst(detail.status)}>{STATUS_STYLES[detail.status]?.label||detail.status}</span>
                  </div>
                </div>
                <div className="sv-wd-btns">
                  {(detail.status==="approved"||detail.status==="withdrawn") && (
                    <button className="btn btn-primary" disabled={tcLoading} onClick={()=>loadTC(detail.id)}>
                      {tcLoading?"Loading...":"View TC"}
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={()=>setDetail(null)}>Close</button>
                </div>
              </div>

              {/* Tabs */}
              <div className="sv-wd-tabs">
                {[
                  {key:"overview",    label:"Overview"},
                  {key:"attendance",  label:"Attendance"},
                  {key:"grades",      label:"Grades"},
                  {key:"fees",        label:"Fees"},
                ].map(tab=>(
                  <button key={tab.key} onClick={()=>tab.key===activeTab?null:loadTabData(tab.key,detail.student_id)}
                    className={"sv-wd-tab" + (activeTab===tab.key ? " sv-wd-tab--on" : "")}>{tab.label}</button>
                ))}
              </div>

              <div className="sv-wd-body">
                {tabLoading ? <div className="loading-state">Loading...</div> : (

                  /* Overview Tab */
                  activeTab==="overview" ? (
                    <div>
                      <div className="sv-wd-sec">
                        <div className="sv-wd-label">Reason</div>
                        <div className="sv-wd-reasonbox">{detail.reason}</div>
                      </div>
                      <div className="sv-wd-sec">
                        <div className="sv-wd-label sv-wd-label--10">Progress</div>
                        {[
                          {label:"Application Submitted", done:true,                    at:detail.requested_at},
                          {label:"Coordinator Reviewed",  done:!!detail.coordinator_at, at:detail.coordinator_at, note:detail.coordinator_note},
                          {label:"Department Clearances", done:detail.clearances?.every(c=>c.status==="cleared"), at:null},
                          {label:"Principal Approved",    done:!!detail.principal_at,   at:detail.principal_at,   note:detail.principal_note},
                          {label:"Withdrawal Completed",  done:detail.status==="withdrawn", at:null},
                        ].map((step,i)=>(
                          <div key={i} className={"sv-wd-step" + (step.done ? " sv-wd-step--done" : "")}>
                            <div className="sv-wd-step-dot">{step.done?"✓":i+1}</div>
                            <div>
                              <div className="sv-wd-step-label">{step.label}</div>
                              {step.at&&<div className="sv-wd-step-at">{fmtDate(step.at)}</div>}
                              {step.note&&<div className="sv-wd-step-note">"{step.note}"</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {detail.clearances?.length>0&&(
                        <div className="sv-wd-sec">
                          <div className="sv-wd-label">Department Clearances</div>
                          <div className="sv-wd-clears">
                            {detail.clearances.map(c=>(
                              <div key={c.department} className={"sv-wd-clear" + (c.status==="cleared" ? " sv-wd-clear--ok" : "")}>
                                {DEPT_LABELS[c.department]||c.department}: {c.status==="cleared"?"Cleared":"Pending"}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {conductData&&(
                        <div>
                          <div className="sv-wd-label">Teacher Conduct Report</div>
                          <div className="sv-wd-conduct">
                            <div className="sv-wd-conduct-by">By {conductData.teacher_name}</div>
                            <div className="sv-wd-conduct-grid">
                              {[["Behaviour",conductData.behaviour],["Discipline",conductData.discipline],["Academic",conductData.academic_performance],["Attendance",conductData.attendance_regularity]].map(([l,v])=>(
                                <div key={l}><span className="sv-wd-conduct-key">{l}:</span> <strong>{v}</strong></div>
                              ))}
                            </div>
                            {conductData.remarks&&<div className="sv-wd-conduct-rem">"{conductData.remarks}"</div>}
                            <div className="sv-wd-conduct-re">Re-admission recommended: <strong>{conductData.recommended_readmission?"Yes":"No"}</strong></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )

                  /* Attendance Tab */
                  : activeTab==="attendance" ? (
                    <div>
                      <div className="sv-wd-filters">
                        <div className="form-group">
                          <label className="form-label">From</label>
                          <DatePicker style={{width:150}} value={attFrom} onChange={val=>setAttFrom(val)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">To</label>
                          <DatePicker style={{width:150}} value={attTo} onChange={val=>setAttTo(val)} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={()=>loadTabData("attendance",detail.student_id)}>Load</button>
                      </div>
                      {attSummary&&(
                        <div className="sv-tiles sv-tiles--5">
                          {[["Present",attSummary.present_days||0,"green"],["Absent",attSummary.absent_days||0,"red"],["Late",attSummary.late_days||0,"amber"],["On Leave",attSummary.on_leave_days||0,"cyan"],["Att %",(attSummary.attendance_pct||0)+"%","blue"]].map(([l,v,c])=>(
                            <div key={l} className={"sv-tile sv-tone-" + c}>
                              <div className="sv-tile-val">{v}</div>
                              <div className="sv-tile-label sv-tile-label--gap">{l}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {attData.length===0?<div className="sv-wd-none">No records.</div>:(
                        <table className="sv-rec sv-rec--13">
                          <thead><tr>{["Date","Day","Status","Remarks"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                          <tbody>{attData.map((r,i)=>{const st=STATUS_BADGE_INLINE[r.status]||{label:r.status};return(
                            <tr key={i}>
                              <td>{fmtDate(r.date)}</td>
                              <td className="sv-rec-soft">{r.date?new Date(r.date).toLocaleDateString("en",{weekday:"short"}):"-"}</td>
                              <td><span className={"sv-att sv-att--" + r.status}>{st.label}</span></td>
                              <td className="sv-rec-soft">{r.remarks||"-"}</td>
                            </tr>
                          );})}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )

                  /* Grades Tab */
                  : activeTab==="grades" ? (
                    <div>
                      {gradesData.length===0?<div className="sv-wd-none">No grades found.</div>:(
                        <table className="sv-rec sv-rec--13">
                          <thead><tr>{["Subject","Exam","Marks","Grade","Date"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                          <tbody>{gradesData.map((g,i)=>(
                            <tr key={i}>
                              <td className="sv-rec-strong">{g.subject_name||"-"}</td>
                              <td className="sv-rec-soft">{g.exam_name||"-"}</td>
                              <td>{g.marks_obtained||0}/{g.total_marks||0}</td>
                              <td><span className="sv-wd-grade">{g.grade||"-"}</span></td>
                              <td className="sv-rec-soft">{fmtDate(g.exam_date)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                    </div>
                  )

                  /* Fees Tab */
                  : activeTab==="fees" ? (
                    <div>
                      {!feesData?<div className="sv-wd-none">No fee data found.</div>:(
                        <div>
                          <div className="sv-tiles sv-tiles--gap12">
                            {[["Total Billed","Rs."+Number(feesData.total_billed||0).toLocaleString(),"blue"],["Paid","Rs."+Number(feesData.total_paid||0).toLocaleString(),"dgreen"],["Outstanding","Rs."+Number(feesData.total_due||0).toLocaleString(),"dred"],["Overdue",feesData.overdue_count||0,"red"]].map(([l,v,c])=>(
                              <div key={l} className={"sv-tile sv-tone-" + c}>
                                <div className="sv-tile-val">{v}</div>
                                <div className="sv-tile-label sv-tile-label--gap">{l}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TC Modal */}
      {showTc&&tc&&(
        <div className="sv-overlay sv-tc-overlay">
          <div className="sv-modal sv-tc-box">
            <div className="sv-modal-head sv-tc-head">
              <div className="sv-tc-title">Transfer Certificate</div>
              <div className="sv-wd-btns">
                <button className="btn btn-primary" onClick={printTC}>Print TC</button>
                <button className="btn btn-secondary" onClick={()=>setShowTc(false)}>Close</button>
              </div>
            </div>
            <div className="sv-tc-scroll">
              {/* The certificate keeps its inline styles: Print copies this HTML into a window with no app CSS */}
              <div id="tc-print" className="sv-paper">
                <div style={{borderTop:"4px solid #0F6E56"}} />
                <div style={{padding:"20px 28px 14px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:16}}>
                  {tc.school_logo?<img src={tc.school_logo} alt="logo" style={{width:60,height:60,objectFit:"contain",borderRadius:8,flexShrink:0}} />:<div style={{width:60,height:60,borderRadius:8,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>&#127979;</div>}
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:17,fontWeight:700,color:"#0f172a"}}>{tc.school_name||"School"}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{tc.school_address||""}</div>
                  </div>
                </div>
                <div style={{padding:"10px 28px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,height:1,background:"#e2e8f0"}} />
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:3,color:"#64748b"}}>TRANSFER CERTIFICATE</div>
                  <div style={{flex:1,height:1,background:"#e2e8f0"}} />
                </div>
                <div style={{padding:"10px 28px",display:"flex",justifyContent:"space-between",borderBottom:"1px solid #e2e8f0",fontSize:12}}>
                  <span style={{color:"#64748b"}}>TC No: <strong>TC-{detail?.id}-{new Date(processingToday).getFullYear()}</strong></span>
                  <span style={{color:"#64748b"}}>Issue Date: <strong>{fmtDate(processingToday)}</strong></span>
                </div>
                <div style={{padding:"16px 28px",borderBottom:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Student Information</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 24px"}}>
                    {[["Student Name",tc.student_name],["Enrollment No",tc.enrollment_no],["Class / Section",tc.class_name+(tc.section?" ("+tc.section+")":"")],["Gender",tc.gender||"-"],["Date of Birth",fmtDate(tc.date_of_birth)],["Blood Group",tc.blood_group||"-"],["Admission Date",fmtDate(tc.admission_date)],["Academic Year",tc.academic_year]].map(([l,v])=>(
                      <div key={l} style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:10,color:"#64748b"}}>{l}</span>
                        <span style={{fontSize:13,color:"#0f172a",fontWeight:500,borderBottom:"1px dotted #e2e8f0",paddingBottom:4}}>{v||"-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{padding:"16px 28px",borderBottom:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Parent / Guardian</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 24px"}}>
                    {[["Father Name",tc.father_name||tc.parent_name||"-"],["Mother Name",tc.mother_name||"-"],["Father CNIC",tc.father_cnic||"-"],["Father Phone",tc.father_phone||"-"],["Guardian Email",tc.parent_email||"-"],["Address",tc.address||"-"]].map(([l,v])=>(
                      <div key={l} style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:10,color:"#64748b"}}>{l}</span>
                        <span style={{fontSize:13,color:"#0f172a",fontWeight:500,borderBottom:"1px dotted #e2e8f0",paddingBottom:4}}>{v||"-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{padding:"16px 28px",borderBottom:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Withdrawal Details</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 24px",marginBottom:10}}>
                    {[["Effective Date",fmtDate(tc.effective_date)],["Withdrawal Date",fmtDate(tc.withdrawal_date)]].map(([l,v])=>(
                      <div key={l} style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:10,color:"#64748b"}}>{l}</span>
                        <span style={{fontSize:13,color:"#0f172a",fontWeight:500,borderBottom:"1px dotted #e2e8f0",paddingBottom:4}}>{v||"-"}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontSize:10,color:"#64748b"}}>Reason</span>
                    <div style={{fontSize:13,color:"#0f172a",borderBottom:"1px dotted #e2e8f0",paddingBottom:4}}>{tc.reason||"-"}</div>
                  </div>
                  {tc.principal_note&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:2}}><span style={{fontSize:10,color:"#64748b"}}>Principal Note</span><div style={{fontSize:13,color:"#0f172a",borderBottom:"1px dotted #e2e8f0",paddingBottom:4}}>{tc.principal_note}</div></div>}
                </div>
                {detail?.clearances?.some(c=>c.status==="cleared")&&(
                  <div style={{padding:"14px 28px",borderBottom:"1px solid #e2e8f0"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Department Clearances</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {detail.clearances.filter(c=>c.status==="cleared").map(c=>(
                        <div key={c.department} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"#EAF3DE",borderRadius:20,border:"1px solid #C0DD97"}}>
                          <span style={{fontSize:11,fontWeight:600,color:"#3B6D11"}}>{c.department.charAt(0).toUpperCase()+c.department.slice(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{padding:"28px 28px 20px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:24}}>
                  {["Class Teacher","Academic Coordinator","Principal"].map(r=>(
                    <div key={r} style={{textAlign:"center"}}>
                      <div style={{height:44,borderBottom:"1px solid #94a3b8",marginBottom:6}} />
                      <div style={{fontSize:11,color:"#475569",fontWeight:600}}>{r}</div>
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Signature & Stamp</div>
                    </div>
                  ))}
                </div>
                <div style={{padding:"10px 28px",background:"#f8fafc",borderTop:"1px solid #e2e8f0",textAlign:"center",fontSize:10,color:"#94a3b8"}}>
                  Computer-generated document. Valid only with official school stamp and authorized signature.
                </div>
                <div style={{borderBottom:"4px solid #0F6E56"}} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}