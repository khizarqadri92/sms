import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import attendanceApi from "../api/attendanceApi";
import academicsApi from "../api/academicsApi";
import client from "../api/client";

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => new Date().toISOString().slice(0,7) + "-01";
const fmtPct = (p) => (p||0).toFixed(1) + "%";

export default function AttendanceReport() {
  const { user } = useAuth();
  const role = user?.roles?.[0] || "";
  const isAdmin = ["principal","admin","superadmin","academic_coordinator"].includes(role);
  const [from,      setFrom]      = useState(monthStart());
  const [to,        setTo]        = useState(today());
  const [classId,   setClassId]   = useState("");
  const [classes,   setClasses]   = useState([]);
  const [report,    setReport]    = useState([]);
  const [adminReport, setAdminReport] = useState([]);
  const [withdrawn, setWithdrawn] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState("");
  const [sortBy,    setSortBy]    = useState("name");
  const [expandedClasses, setExpandedClasses] = useState({});

  useEffect(() => {
    if (role === "teacher") {
      client.get("/attendance/teacher-report", { params: { from, to } })
        .then(r => {
          const data = r.data.data?.report || [];
          setReport(data);
          const expanded = {};
          data.forEach(c => { expanded[c.class_id] = true; });
          setExpandedClasses(expanded);
        }).catch(() => {});
    } else {
      academicsApi.getClasses().then(r => setClasses(r.data.data?.items || r.data.data || [])).catch(() => {});
    }
  }, []);

  const loadAdminReport = async () => {
      if(!isAdmin) return;
    setLoading(true);
    try {
      const params = {from, to};
      if(classId) params.class_id = classId;
      const r = await client.get("/attendance/admin-report", {params});
        setAdminReport(r.data.data?.report||[]);
    } catch(e){}
    finally{setLoading(false);}
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const r = await client.get("/attendance/teacher-report", { params: { from, to, class_id: classId||undefined } });
      const data = r.data.data?.report || [];
      setReport(data);
      setWithdrawn(r.data.data?.withdrawn_students || []);
      const expanded = {};
      data.forEach(c => { expanded[c.class_id] = true; });
      setExpandedClasses(expanded);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (role === "teacher") loadReport();
    const adminRoles = ["principal","admin","superadmin","academic_coordinator"];
    if (adminRoles.includes(role)) {
      client.get("/attendance/admin-report", {params:{from,to}}).then(r=>{
        setAdminReport(r.data.data?.report||[]);
      }).catch(e=>console.log("adminReport error:", e));
    }
  }, [from, to, role]);

  const pctColor = (p) => p >= 90 ? "#166534" : p >= 75 ? "#854d0e" : "#991b1b";
  const pctBg    = (p) => p >= 90 ? "#f0fdf4" : p >= 75 ? "#fffbeb" : "#fef2f2";

  const sortStudents = (students) => {
    const filtered = search ? students.filter(s => s.student_name.toLowerCase().includes(search.toLowerCase()) || s.enrollment_no.includes(search)) : students;
    return [...filtered].sort((a,b) => {
      if (sortBy === "name")    return a.student_name.localeCompare(b.student_name);
      if (sortBy === "pct_asc") return a.pct - b.pct;
      if (sortBy === "pct_desc")return b.pct - a.pct;
      if (sortBy === "absent")  return b.absent - a.absent;
      return 0;
    });
  };

  const classTotal = (cls) => {
    const total = cls.students.length;
    const avgPct = total > 0 ? (cls.students.reduce((a,s)=>a+s.pct,0)/total).toFixed(1) : 0;
    const lowAtt = cls.students.filter(s=>s.pct<75).length;
    return { total, avgPct, lowAtt };
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Attendance Report</h1>
      </div>

      {/* Admin/Principal class-wise summary */}
      {isAdmin&&adminReport.length>0&&(
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:20}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",fontWeight:700,fontSize:15}}>Class-wise Attendance Summary</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Class","Total","Present","Absent","Late","On Leave","% Present","Status"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adminReport.map((cls,i)=>(
                <tr key={cls.class_id} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"10px 14px",fontWeight:600}}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</td>
                  <td style={{padding:"10px 14px",color:"#64748b"}}>{cls.total_students}</td>
                  <td style={{padding:"10px 14px",color:"#166534",fontWeight:600}}>{cls.present}</td>
                  <td style={{padding:"10px 14px",color:"#991b1b",fontWeight:600}}>{cls.absent}</td>
                  <td style={{padding:"10px 14px",color:"#854d0e",fontWeight:600}}>{cls.late}</td>
                  <td style={{padding:"10px 14px",color:"#1e40af",fontWeight:600}}>{cls.on_leave}</td>
                  <td style={{padding:"10px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1,height:6,borderRadius:6,background:"#f1f5f9",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:6,background:cls.attendance_pct>=75?"#22c55e":cls.attendance_pct>=50?"#f59e0b":"#ef4444",width:cls.attendance_pct+"%"}} />
                      </div>
                      <span style={{fontWeight:600,color:cls.attendance_pct>=75?"#166534":cls.attendance_pct>=50?"#854d0e":"#991b1b"}}>{cls.attendance_pct}%</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    {cls.is_marked
                      ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Marked</span>
                      : <span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Not Marked</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filters */}
      <div className="section-card" style={{marginBottom:16,padding:"16px 20px"}}>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">From</label>
            <input type="date" className="form-control" style={{width:160}} value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">To</label>
            <input type="date" className="form-control" style={{width:160}} value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          {role !== "teacher" && (
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Class</label>
              <select className="form-control" style={{width:180}} value={classId} onChange={e=>setClassId(e.target.value)}>
                <option value="">All Classes</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Search Student</label>
            <input type="text" className="form-control" style={{width:200}} placeholder="Name or enrollment..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Sort By</label>
            <select className="form-control" style={{width:160}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="name">Name A-Z</option>
              <option value="pct_desc">Highest Attendance</option>
              <option value="pct_asc">Lowest Attendance</option>
              <option value="absent">Most Absent</option>
            </select>
          </div>
          {role !== "teacher" && (
            <button className="btn btn-primary" onClick={()=>{ if(isAdmin) { client.get("/attendance/admin-report",{params:{from,to,class_id:classId||undefined}}).then(r=>setAdminReport(r.data.data?.report||[])).catch(()=>{}); } else { loadReport(); } }} disabled={loading}>
              {loading ? "Loading..." : "Generate Report"}
            </button>
          )}
        </div>
      </div>

      {/* Admin Summary Cards */}
      {isAdmin&&adminReport.length>0&&(()=>{
        const totalS = adminReport.reduce((a,c)=>a+c.total_students,0);
        const totalP = adminReport.reduce((a,c)=>a+c.present,0);
        const totalA = adminReport.reduce((a,c)=>a+c.absent,0);
        const totalL = adminReport.reduce((a,c)=>a+c.late,0);
        const totalOL = adminReport.reduce((a,c)=>a+c.on_leave,0);
        const avgPct = totalS>0?((totalP/totalS)*100).toFixed(1):0;
        const marked = adminReport.filter(c=>c.is_marked).length;
        return (
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:20}}>
            {[
              {label:"Total Students",val:totalS,color:"#2563eb"},
              {label:"Present Today",val:totalP,color:"#166534"},
              {label:"Overall %",val:avgPct+"%",color:"#7c3aed"},
              {label:"Classes Marked",val:marked+"/"+adminReport.length,color:"#c2410c"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#fff",borderRadius:12,padding:"20px",border:"1px solid #e2e8f0",textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.val}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{s.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Summary Cards */}
      {report.length > 0 && (() => {
        const allStudents = report.flatMap(c=>c.students);
        const avg = allStudents.length > 0 ? (allStudents.reduce((a,s)=>a+s.pct,0)/allStudents.length).toFixed(1) : 0;
        const low = allStudents.filter(s=>s.pct<75).length;
        return (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:16}}>
            {[
              {label:"Total Students", value:allStudents.length, color:"#2563eb"},
              {label:"Avg Attendance",  value:avg+"%",            color:avg>=90?"#166534":avg>=75?"#854d0e":"#991b1b"},
              {label:"Low Attendance",  value:low,                color:"#991b1b"},
              {label:"Classes",         value:report.length,      color:"#7c3aed"},
            ].map(s=>(
              <div key={s.label} style={{background:"#fff",border:"1px solid #e2e8f0",borderTop:"3px solid "+s.color,borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:800,color:s.color}}>{s.value}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{s.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Report Tables */}
      {loading ? (
        <div className="loading-state">Generating report...</div>
      ) : report.length === 0 ? (
        <div className="section-card" style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-secondary)"}}>
          {role==="teacher" ? "No attendance data for this period." : "Select filters and click Generate Report."}
        </div>
      ) : (
        report.map(cls => {
          const stats = classTotal(cls);
          const students = sortStudents(cls.students);
          const isExpanded = expandedClasses[cls.class_id] !== false;
          return (
            <div key={cls.class_id} className="section-card" style={{marginBottom:16,padding:0,overflow:"hidden"}}>
              <div style={{padding:"14px 20px",background:"var(--color-background-secondary)",borderBottom:"1px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setExpandedClasses(prev=>({...prev,[cls.class_id]:!isExpanded}))}>
                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:15}}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</div>
                  <div style={{display:"flex",gap:10,fontSize:12}}>
                    <span style={{color:"#64748b"}}>{stats.total} students</span>
                    <span style={{color:pctColor(stats.avgPct),fontWeight:600}}>Avg: {stats.avgPct}%</span>
                    {stats.lowAtt>0 && <span style={{color:"#991b1b",fontWeight:600}}>{stats.lowAtt} below 75%</span>}
                  </div>
                </div>
                <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{isExpanded?"Hide":"Show"}</span>
              </div>
              {isExpanded && (
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{background:"var(--color-background-tertiary)"}}>
                        {["Student","Enrollment","Present","Absent","Late","On Leave","Total","Attendance %"].map(h=>(
                          <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s,i)=>(
                        <tr key={s.id} style={{borderBottom:"1px solid var(--color-border-tertiary)",background:i%2===0?"#fff":"var(--color-background-secondary)"}}>
                          <td style={{padding:"10px 12px",fontWeight:500}}>
                            {s.student_name}
                            {s.status==="withdrawn" && <span style={{marginLeft:6,fontSize:10,fontWeight:600,background:"#f1f5f9",color:"#475569",padding:"1px 7px",borderRadius:10}}>Withdrawn</span>}
                          </td>
                          <td style={{padding:"10px 12px",color:"var(--color-text-secondary)",fontSize:12}}>{s.enrollment_no}</td>
                          <td style={{padding:"10px 12px",color:"#166534",fontWeight:600}}>{s.present}</td>
                          <td style={{padding:"10px 12px",color:"#991b1b",fontWeight:600}}>{s.absent}</td>
                          <td style={{padding:"10px 12px",color:"#854d0e"}}>{s.late}</td>
                          <td style={{padding:"10px 12px",color:"#1e40af"}}>{s.on_leave}</td>
                          <td style={{padding:"10px 12px",color:"var(--color-text-secondary)"}}>{s.total}</td>
                          <td style={{padding:"10px 12px"}}>
                            <span style={{background:pctBg(s.pct),color:pctColor(s.pct),padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{fmtPct(s.pct)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    {/* Withdrawn Students Section */}
      {withdrawn.length > 0 && (
        <div className="section-card" style={{marginBottom:16,padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 20px",background:"#fef2f2",borderBottom:"1px solid #fecaca",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:15,color:"#991b1b"}}>Withdrawn Students</div>
            <span style={{fontSize:12,color:"#991b1b"}}>{withdrawn.length} student{withdrawn.length!==1?"s":""}</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#fff5f5"}}>
                  {["Student","Enrollment","Class","Section","Reason","Effective Date","Withdrawal Date"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"#991b1b",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withdrawn.map((s,i)=>(
                  <tr key={s.id} style={{borderBottom:"1px solid #fee2e2",background:i%2===0?"#fff":"#fff5f5"}}>
                    <td style={{padding:"10px 12px",fontWeight:500}}>{s.student_name}</td>
                    <td style={{padding:"10px 12px",color:"#64748b",fontSize:12}}>{s.enrollment_no}</td>
                    <td style={{padding:"10px 12px"}}>{s.class_name}</td>
                    <td style={{padding:"10px 12px"}}>{s.section||"-"}</td>
                    <td style={{padding:"10px 12px",color:"#64748b",maxWidth:200}}>{s.reason?.slice(0,50)}{s.reason?.length>50?"...":""}</td>
                    <td style={{padding:"10px 12px"}}>{s.effective_date||"-"}</td>
                    <td style={{padding:"10px 12px",color:"#64748b"}}>{s.withdrawal_date ? new Date(s.withdrawal_date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "-"}</td>
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