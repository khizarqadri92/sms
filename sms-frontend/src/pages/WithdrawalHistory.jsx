import { useState, useEffect } from "react";
import { withdrawalApi } from "../api/withdrawalApi";
import studentsApi from "../api/studentsApi";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const STATUS_STYLES = {
  pending:           { bg:"#fef9c3", color:"#854d0e",  label:"Pending"           },
  under_review:      { bg:"#dbeafe", color:"#1e40af",  label:"Under Review"      },
  clearance:         { bg:"#ede9fe", color:"#5b21b6",  label:"Clearance"         },
  coordinator_final: { bg:"#fef9c3", color:"#854d0e",  label:"Final Processing"  },
  approved:          { bg:"#dcfce7", color:"#166534",  label:"Approved"          },
  rejected:          { bg:"#fee2e2", color:"#991b1b",  label:"Rejected"          },
  withdrawn:         { bg:"#f1f5f9", color:"#475569",  label:"Withdrawn"         },
};
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
    present:  { bg:"#f0fdf4", color:"#166534", label:"Present"  },
    absent:   { bg:"#fef2f2", color:"#991b1b", label:"Absent"   },
    late:     { bg:"#fffbeb", color:"#92400e", label:"Late"      },
    excused:  { bg:"#eff6ff", color:"#1e40af", label:"Excused"  },
    on_leave: { bg:"#f0f9ff", color:"#0369a1", label:"On Leave" },
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Withdrawal History</h1>
      </div>

      <div style={{display:"grid",gridTemplateColumns:detail?"340px 1fr":"1fr",gap:20,alignItems:"start"}}>

        {/* List */}
        <div style={{background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:12,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
          {list.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-secondary)",fontSize:14}}>No withdrawal requests found.</div>
          ) : list.map(w => {
            const s = STATUS_STYLES[w.status]||{bg:"#f1f5f9",color:"#475569",label:w.status};
            const active = detail?.id===w.id;
            return (
              <div key={w.id} onClick={()=>loadDetail(w)} style={{
                background:"#fff",border:"1.5px solid "+(active?"#2563eb":"#e2e8f0"),
                borderLeft:"4px solid "+(active?"#2563eb":s.color),
                borderRadius:10,padding:"14px 16px",cursor:"pointer",marginBottom:8,
                boxShadow:active?"0 2px 8px rgba(37,99,235,0.12)":"0 1px 3px rgba(0,0,0,0.05)",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14,color:"var(--color-text-primary)"}}>{w.student_name}</div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{w.enrollment_no} &middot; {w.class_name}{w.section?" ("+w.section+")":""}</div>
                  </div>
                  <span style={{background:s.bg,color:s.color,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>{s.label}</span>
                </div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{w.reason?.slice(0,60)}{w.reason?.length>60?"...":""}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Applied: {fmtDate(w.requested_at)}</div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        {detail && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Header */}
            <div className="section-card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--color-background-secondary)"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17}}>{detail.student_name}</div>
                  <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:2}}>{detail.enrollment_no} &middot; {detail.class_name}{detail.section?" ("+detail.section+")":""}</div>
                  <div style={{marginTop:6}}>
                    <span style={{background:STATUS_STYLES[detail.status]?.bg||"#f1f5f9",color:STATUS_STYLES[detail.status]?.color||"#475569",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>{STATUS_STYLES[detail.status]?.label||detail.status}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {(detail.status==="approved"||detail.status==="withdrawn") && (
                    <button className="btn btn-primary" disabled={tcLoading} onClick={()=>loadTC(detail.id)}>
                      {tcLoading?"Loading...":"View TC"}
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={()=>setDetail(null)}>Close</button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{display:"flex",borderBottom:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                {[
                  {key:"overview",    label:"Overview"},
                  {key:"attendance",  label:"Attendance"},
                  {key:"grades",      label:"Grades"},
                  {key:"fees",        label:"Fees"},
                ].map(tab=>(
                  <button key={tab.key} onClick={()=>tab.key===activeTab?null:loadTabData(tab.key,detail.student_id)} style={{
                    padding:"10px 18px",border:"none",borderBottom:"2px solid "+(activeTab===tab.key?"#2563eb":"transparent"),
                    background:"transparent",color:activeTab===tab.key?"#2563eb":"var(--color-text-secondary)",
                    fontWeight:activeTab===tab.key?600:400,fontSize:13,cursor:"pointer",
                  }}>{tab.label}</button>
                ))}
              </div>

              <div style={{padding:"20px"}}>
                {tabLoading ? <div className="loading-state">Loading...</div> : (

                  /* Overview Tab */
                  activeTab==="overview" ? (
                    <div>
                      <div style={{marginBottom:16}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Reason</div>
                        <div style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 14px",fontSize:14}}>{detail.reason}</div>
                      </div>
                      <div style={{marginBottom:16}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Progress</div>
                        {[
                          {label:"Application Submitted", done:true,                    at:detail.requested_at},
                          {label:"Coordinator Reviewed",  done:!!detail.coordinator_at, at:detail.coordinator_at, note:detail.coordinator_note},
                          {label:"Department Clearances", done:detail.clearances?.every(c=>c.status==="cleared"), at:null},
                          {label:"Principal Approved",    done:!!detail.principal_at,   at:detail.principal_at,   note:detail.principal_note},
                          {label:"Withdrawal Completed",  done:detail.status==="withdrawn", at:null},
                        ].map((step,i)=>(
                          <div key={i} style={{display:"flex",gap:12,marginBottom:8,opacity:step.done?1:0.4}}>
                            <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:step.done?"#22c55e":"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:step.done?"#fff":"#94a3b8"}}>{step.done?"✓":i+1}</div>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:step.done?"var(--color-text-primary)":"var(--color-text-secondary)"}}>{step.label}</div>
                              {step.at&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{fmtDate(step.at)}</div>}
                              {step.note&&<div style={{fontSize:12,fontStyle:"italic",color:"var(--color-text-secondary)"}}>"{step.note}"</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {detail.clearances?.length>0&&(
                        <div style={{marginBottom:16}}>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Department Clearances</div>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            {detail.clearances.map(c=>(
                              <div key={c.department} style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:600,background:c.status==="cleared"?"#f0fdf4":"#fef2f2",color:c.status==="cleared"?"#166534":"#991b1b",border:"1px solid "+(c.status==="cleared"?"#bbf7d0":"#fecaca")}}>
                                {DEPT_LABELS[c.department]||c.department}: {c.status==="cleared"?"Cleared":"Pending"}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {conductData&&(
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Teacher Conduct Report</div>
                          <div style={{border:"1px solid #bbf7d0",borderRadius:8,padding:"12px 14px",background:"#f0fdf4"}}>
                            <div style={{fontWeight:600,fontSize:12,color:"#166534",marginBottom:8}}>By {conductData.teacher_name}</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",fontSize:13}}>
                              {[["Behaviour",conductData.behaviour],["Discipline",conductData.discipline],["Academic",conductData.academic_performance],["Attendance",conductData.attendance_regularity]].map(([l,v])=>(
                                <div key={l}><span style={{color:"#64748b"}}>{l}:</span> <strong>{v}</strong></div>
                              ))}
                            </div>
                            {conductData.remarks&&<div style={{marginTop:6,fontSize:12,fontStyle:"italic"}}>"{conductData.remarks}"</div>}
                            <div style={{marginTop:4,fontSize:12}}>Re-admission recommended: <strong>{conductData.recommended_readmission?"Yes":"No"}</strong></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )

                  /* Attendance Tab */
                  : activeTab==="attendance" ? (
                    <div>
                      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end"}}>
                        <div className="form-group" style={{marginBottom:0}}>
                          <label className="form-label">From</label>
                          <DatePicker style={{width:150}} value={attFrom} onChange={val=>setAttFrom(val)} />
                        </div>
                        <div className="form-group" style={{marginBottom:0}}>
                          <label className="form-label">To</label>
                          <DatePicker style={{width:150}} value={attTo} onChange={val=>setAttTo(val)} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={()=>loadTabData("attendance",detail.student_id)}>Load</button>
                      </div>
                      {attSummary&&(
                        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
                          {[["Present",attSummary.present_days||0,"#22c55e"],["Absent",attSummary.absent_days||0,"#ef4444"],["Late",attSummary.late_days||0,"#f59e0b"],["On Leave",attSummary.on_leave_days||0,"#0891b2"],["Att %",(attSummary.attendance_pct||0)+"%","#2563eb"]].map(([l,v,c])=>(
                            <div key={l} style={{background:"#fff",border:"1px solid #e2e8f0",borderTop:"3px solid "+c,borderRadius:8,padding:"10px",textAlign:"center"}}>
                              <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                              <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{l}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {attData.length===0?<div style={{textAlign:"center",padding:"24px",color:"var(--color-text-secondary)"}}>No records.</div>:(
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                          <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Date","Day","Status","Remarks"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                          <tbody>{attData.map((r,i)=>{const st=STATUS_BADGE_INLINE[r.status]||{bg:"#f1f5f9",color:"#475569",label:r.status};return(
                            <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}>
                              <td style={{padding:"8px 12px"}}>{fmtDate(r.date)}</td>
                              <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{r.date?new Date(r.date).toLocaleDateString("en",{weekday:"short"}):"-"}</td>
                              <td style={{padding:"8px 12px"}}><span style={{background:st.bg,color:st.color,padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600}}>{st.label}</span></td>
                              <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{r.remarks||"-"}</td>
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
                      {gradesData.length===0?<div style={{textAlign:"center",padding:"24px",color:"var(--color-text-secondary)"}}>No grades found.</div>:(
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                          <thead><tr style={{background:"var(--color-background-secondary)"}}>{["Subject","Exam","Marks","Grade","Date"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)"}}>{h}</th>)}</tr></thead>
                          <tbody>{gradesData.map((g,i)=>(
                            <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)"}}>
                              <td style={{padding:"8px 12px",fontWeight:500}}>{g.subject_name||"-"}</td>
                              <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{g.exam_name||"-"}</td>
                              <td style={{padding:"8px 12px"}}>{g.marks_obtained||0}/{g.total_marks||0}</td>
                              <td style={{padding:"8px 12px"}}><span style={{fontWeight:700,color:"#2563eb"}}>{g.grade||"-"}</span></td>
                              <td style={{padding:"8px 12px",color:"var(--color-text-secondary)"}}>{fmtDate(g.exam_date)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                    </div>
                  )

                  /* Fees Tab */
                  : activeTab==="fees" ? (
                    <div>
                      {!feesData?<div style={{textAlign:"center",padding:"24px",color:"var(--color-text-secondary)"}}>No fee data found.</div>:(
                        <div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                            {[["Total Billed","Rs."+Number(feesData.total_billed||0).toLocaleString(),"#2563eb"],["Paid","Rs."+Number(feesData.total_paid||0).toLocaleString(),"#166534"],["Outstanding","Rs."+Number(feesData.total_due||0).toLocaleString(),"#991b1b"],["Overdue",feesData.overdue_count||0,"#dc2626"]].map(([l,v,c])=>(
                              <div key={l} style={{background:"#fff",border:"1px solid #e2e8f0",borderTop:"3px solid "+c,borderRadius:8,padding:"12px",textAlign:"center"}}>
                                <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                                <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{l}</div>
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
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:700,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16}}>Transfer Certificate</div>
              <div style={{display:"flex",gap:10}}>
                <button className="btn btn-primary" onClick={printTC}>Print TC</button>
                <button className="btn btn-secondary" onClick={()=>setShowTc(false)}>Close</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"24px"}}>
              <div id="tc-print" style={{fontFamily:"Arial,sans-serif",maxWidth:680,margin:"0 auto"}}>
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