import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import studentsApi   from "../api/studentsApi";
import attendanceApi from "../api/attendanceApi";
import teachersApi   from "../api/teachersApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import { useAuth }   from "../auth/AuthContext";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => new Date().toISOString().slice(0,7) + "-01";

const STATUS_STYLES = {
  present:  { bg:"#f0fdf4", border:"#22c55e", color:"#166534", btn:"#22c55e", label:"Present"  },
  absent:   { bg:"#fef2f2", border:"#ef4444", color:"#991b1b", btn:"#ef4444", label:"Absent"   },
  late:     { bg:"#fffbeb", border:"#f59e0b", color:"#92400e", btn:"#f59e0b", label:"Late"     },
 on_leave:  { bg:"#eff6ff", border:"#2563eb", color:"#1e40af", btn:"#2563eb", label:"On Leave"   },
};

const STATUS_INLINE = {
  present:  { background:"#f0fdf4", color:"#166534", border:"1px solid #22c55e" },
  absent:   { background:"#fef2f2", color:"#991b1b", border:"1px solid #ef4444" },
  late:     { background:"#fffbeb", color:"#92400e", border:"1px solid #f59e0b" },
  on_leave: { background:"#f0f9ff", color:"#0369a1", border:"1px solid #38bdf8" },
};
const STATUS_LABEL = { present:"Present", absent:"Absent", late:"Late", on_leave:"On Leave", on_leave:"On Leave" };
export default function Attendance() {
  const { user } = useAuth();
  const role = user?.roles?.[0] || "";
  if (role === "hr") return (
    <div>
      <div className="page-header"><h1 className="page-heading">Staff Attendance</h1></div>
      <div className="section-card" style={{ textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>??</div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Staff Attendance Management Coming Soon</div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          Teacher and staff daily attendance tracking will be available here.
        </div>
      </div>
    </div>
  );
  if (role === "student") return <StudentAttendance />;
  if (role === "parent")  return <ParentAttendance />;
  if (role === "principal" || role === "admin" || role === "superadmin") return <PrincipalAttendance />;
  return <TeacherAttendance />;
}

/* ── Teacher: mark attendance ─────────────────────────────────── */
function TeacherAttendance() {
  const { user } = useAuth();
  const location = useLocation();
  const params   = new URLSearchParams(location.search);
  const [myClasses,  setMyClasses]  = useState([]);
  const [classId,    setClassId]    = useState(params.get("class_id") || "");
  const processingToday = useProcessingToday();
  const [date,       setDate]       = useState(processingToday);
  useEffect(() => { setDate(processingToday); }, [processingToday]);
  const [students,   setStudents]   = useState([]);
  const [records,    setRecords]    = useState({});
  const [existing,   setExisting]   = useState({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState("");
  const [err,        setErr]        = useState("");
  const [workDays,   setWorkDays]   = useState([1,2,3,4,5]); // Mon-Fri default
  const [attConfig,  setAttConfig]  = useState("incharge_only");
  const [subjects,   setSubjects]   = useState([]);
  const [selSubj,    setSelSubj]    = useState("");

  // Fetch school timing settings for working days
  useEffect(() => {
    import("../api/settingsApi").then(({ default: sApi }) => {
      sApi.getByCategory("school_timing").then(r => {
        const d = r.data.data || {};
        const wd = (d.working_days || "1,2,3,4,5").split(",").map(Number);
        setWorkDays(wd);
      }).catch(() => {});
    }).catch(() => {});
    attendanceApi.getConfig().then(r => {
      setAttConfig(r.data.data?.attendance_marker || "incharge_only");
    }).catch(() => {});
  }, []);

  const isWorkingDay = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay(); // 0=Sun,1=Mon,...6=Sat
    return workDays.includes(day);
  };

  useEffect(() => {
    attendanceApi.getConfig().then(r => {
      const cfg = r.data.data?.attendance_marker || "incharge_only";
      teachersApi.getMe().then(r2 => {
        let cls = r2.data.data?.classes || [];
        if (cfg === "incharge_only") {
          cls = cls.filter(c => c.is_primary);
        }
        setMyClasses(cls);
        if (!classId && cls.length > 0) setClassId(String(cls[0].id));
      }).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => {
      // Default to showing all classes on error
      teachersApi.getMe().then(r2 => {
        setMyClasses(r2.data.data?.classes || []);
      }).catch(() => {}).finally(() => setLoading(false));
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    // Load subjects for this teacher in this class when all_teachers mode
    if (attConfig === "all_teachers") {
      import("../api/diaryApi").then(({ default: dApi }) => {
        dApi.getMySubjects({ class_id: classId }).then(r => {
          const subs = r.data.data || [];
          setSubjects(subs);
          if (subs.length > 0) setSelSubj(String(subs[0].id));
        }).catch(() => {});
      });
    }
    studentsApi.getAll({ class_id: classId, status:"active", per_page:100 }).then(r => {
      const list = r.data.data || [];
      setStudents(list);
      const init = {}; list.forEach(s => { init[s.id] = "present"; }); setRecords(init); setExisting({});
    }).catch(() => {});
  }, [classId]);

  useEffect(() => {
    if (!classId || students.length === 0) return;
    attendanceApi.getByClass(classId, date, attConfig==="all_teachers" && selSubj ? selSubj : null).then(r => {
      const map = {}; (r.data.data||[]).forEach(x => { map[x.student_id] = x.status; });
      setExisting(map);
      setRecords(prev => { const u={...prev}; students.forEach(s => { u[s.id]=map[s.id]||"present"; }); return u; });
    }).catch(() => {});
  }, [date, students.length, classId]);

  useEffect(() => {
    const init = {};
    students.forEach(s => { init[s.id] = 'present'; });
    setRecords(init);
  }, [date]);

  const markAll = (status) => { const u={}; students.forEach(s => { u[s.id]=status; }); setRecords(u); };

  const handleSave = async () => {
    if (!classId || students.length === 0) return;
    setSaving(true); setErr("");
    try {
      await attendanceApi.mark({ class_id:parseInt(classId), date, subject_id: attConfig==="all_teachers" && selSubj ? parseInt(selSubj) : null, records: students.filter(s => records[s.id] !== "on_leave").map(s => ({ student_id:s.id, status:records[s.id]||"present" })) });
      setMsg("Attendance saved for " + date);
      setTimeout(() => setMsg(""), 4000);
    } catch { setErr("Failed to save."); }
    finally { setSaving(false); }
  };

  const counts = Object.values(records).reduce((a,s)=>{ a[s]=(a[s]||0)+1; return a; },{});
  const isSaved = Object.keys(existing).length > 0;

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header"><h1 className="page-heading">Mark Attendance</h1></div>
      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
          <div className="form-group" style={{ marginBottom:0, flex:1, minWidth:180 }}>
            <label className="form-label">Class</label>
            <select className="form-control" value={classId} onChange={e => setClassId(e.target.value)}>
              <option value="">Select class</option>
              {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}{c.is_primary?" ★":""}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Date</label>
            <DatePicker value={date} max={processingToday}
              onChange={(val) => {
                if (!isWorkingDay(val)) {
                  setErr("Selected date is not a working day.");
                  return;
                }
                setErr("");
                setDate(val);
              }}
              style={{ width:180 }} />
          </div>
          {attConfig === "all_teachers" && subjects.length > 0 && (
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Subject</label>
              <select className="form-control" value={selSubj} onChange={e => setSelSubj(e.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:4, paddingTop:20 }}>
            {!isWorkingDay(date) && (
              <span style={{ fontSize:12, color:"#dc2626", fontWeight:600, background:"#fef2f2", padding:"4px 10px", borderRadius:6, border:"1px solid #fecaca" }}>⚠ Not a working day</span>
            )}
            {isSaved && isWorkingDay(date) && (
              <span style={{ fontSize:12, color:"#92400e", fontWeight:600, background:"#fffbeb", padding:"4px 10px", borderRadius:6, border:"1px solid #fde68a" }}>✓ Already marked — updating</span>
            )}
          </div>
        </div>
      </div>

      {!classId && <div className="empty-state">Select a class to mark attendance.</div>}

      {classId && students.length > 0 && (
        <>
          {/* Summary */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:16 }}>
            {Object.entries(STATUS_STYLES).map(([st, sty]) => (
              <div key={st} style={{ background:"#fff", border:"1px solid #e2e8f0", borderTop:"3px solid "+sty.btn, borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:sty.btn }}>{counts[st]||0}</div>
                <div style={{ fontSize:12, color:"#64748b" }}>{sty.label || st}</div>
              </div>
            ))}
          </div>

          <div className="section-card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{students.length} Students</div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ fontSize:12, color:"#94a3b8" }}>Mark all:</span>
                {Object.entries(STATUS_STYLES).map(([st,sty]) => (
                  <button key={st} onClick={() => markAll(st)}
                    style={{ padding:"4px 11px", borderRadius:6, border:"1px solid "+sty.btn, background:"transparent", color:sty.btn, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                    {sty.label || st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {students.map((s, i) => {
                const status = records[s.id] || "present";
                const sty = STATUS_STYLES[status] || STATUS_STYLES["absent"];
                const isOnLeave = status === "on_leave" || status === "withdrawn";
                return (
                  <div key={s.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:8, background:sty.bg, borderLeft:"3px solid "+sty.border }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontSize:12, color:"#94a3b8", width:22, textAlign:"right" }}>{i+1}</span>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"#fff", border:"1px solid "+sty.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:sty.color }}>
                        {s.first_name[0]}{s.last_name[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{s.first_name} {s.last_name}</div>
                        <div style={{ fontSize:11, color:"#94a3b8" }}>{s.enrollment_no}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5 }}>
                      {Object.entries(STATUS_STYLES).map(([st,stySt]) => (
                        <button key={st} onClick={() => !isOnLeave && setRecords(p=>({...p,[s.id]:st}))}
                          disabled={isOnLeave}
                          style={{ padding:"5px 11px", borderRadius:6, border:"none", fontSize:11, fontWeight:600, cursor:"pointer",
                            background: status===st ? stySt.btn : "#f1f5f9",
                            color:      status===st ? "#fff"    : "#94a3b8" }}>
                          {stySt.label || st}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop:18, display:"flex", justifyContent:"flex-end", gap:12 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !isWorkingDay(date)}>
                {saving ? "Saving..." : (isSaved?"Update":"Save")+" Attendance ("+students.length+")"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Student: view own attendance ─────────────────────────────── */
function StudentAttendance() {
  const [records,   setRecords]   = useState([]);
  const [summary,   setSummary]   = useState(null);
  const processingToday = useProcessingToday();
  const [from,      setFrom]      = useState(monthStart());
  const [to,        setTo]        = useState(processingToday);
  useEffect(() => { setTo(processingToday); }, [processingToday]);
  const [loading,   setLoading]   = useState(true);
  const [attConfig, setAttConfig] = useState("incharge_only");
  const [subjects,  setSubjects]  = useState([]);
  const [selSubj,   setSelSubj]   = useState("");
  const [classId,   setClassId]   = useState(null);

  useEffect(() => {
    attendanceApi.getConfig().then(r => setAttConfig(r.data.data?.attendance_marker||"incharge_only")).catch(()=>{});
    import("../api/studentsApi").then(({ default: sApi }) => {
      sApi.getMyProfile().then(r => {
        const p = r.data.data;
        if (p?.class_id) {
          setClassId(p.class_id);
          import("../api/academicsApi").then(({ default: aApi }) => {
            aApi.getClassSubjects(p.class_id).then(r2 => setSubjects(r2.data.data||[])).catch(()=>{});
          });
        }
      });
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    attendanceApi.getMy({ from, to, subject_id: selSubj || undefined })
      .then(r => { setRecords(r.data.data?.records||[]); setSummary(r.data.data?.summary||null); })
      .catch(()=>{}).finally(()=>setLoading(false));
  }, [from, to, selSubj]);

  const STATUS_INLINE = {
    present:  { background:"#f0fdf4", color:"#166534", border:"1px solid #22c55e" },
    absent:   { background:"#fef2f2", color:"#991b1b", border:"1px solid #ef4444" },
    late:     { background:"#fffbeb", color:"#92400e", border:"1px solid #f59e0b" },
    on_leave2: { background:"#eff6ff", color:"#1e40af", border:"1px solid #2563eb" },
    on_leave: { background:"#eff6ff", color:"#1e40af", border:"1px solid #2563eb" },
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">My Attendance</h1>
      </div>
      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">From</label>
            <DatePicker value={from} onChange={setFrom} style={{ width:160 }} />
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">To</label>
            <DatePicker value={to} onChange={setTo} style={{ width:160 }} />
          </div>
          {attConfig==="all_teachers" && subjects.length>0 && (
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Subject</label>
              <select className="form-control" value={selSubj} onChange={e=>setSelSubj(e.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map(s=><option key={s.subject_id||s.id} value={s.subject_id||s.id}>{s.subject_name}</option>)}
              </select>
            </div>
          )}
        </div>
        {attConfig==="incharge_only" && <div style={{ fontSize:12, color:"#64748b", marginTop:8 }}>Attendance is marked by class incharge — no subject-wise breakdown.</div>}
      </div>

      {summary && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:16 }}>
          {[
            ["Present",  summary.present,              "#22c55e"],
            ["Absent",   summary.absent,               "#ef4444"],
            ["Late",     summary.late||0,              "#f59e0b"],
            ["On Leave", summary.on_leave||0,          "#0891b2"],
            ["On Leave",  summary.on_leave||0,           "#2563eb"],
          ].map(([label,val,color])=>(
            <div key={label} style={{ background:"#fff", border:"1px solid #e2e8f0", borderTop:"3px solid "+color, borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:800, color }}>{val}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-card">
        {loading ? <div className="loading-state">Loading...</div> : records.length===0 ? (
          <div className="empty-state">No attendance records for this period.</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#f8fafc" }}>
                {["Date","Day","Status",attConfig==="all_teachers"?"Subject":"","Remarks"].filter(Boolean).map(h=>(
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:"#64748b", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"10px 12px", fontWeight:500 }}>{r.date}</td>
                  <td style={{ padding:"10px 12px", color:"#64748b" }}>{new Date(r.date+"T00:00:00").toLocaleDateString("en-PK",{weekday:"short"})}</td>
                  <td style={{ padding:"10px 12px" }}><span style={{ ...( STATUS_INLINE[r.status] || STATUS_INLINE[r.status] || { background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" }), padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{STATUS_LABEL[r.status] || STATUS_LABEL[r.status] || r.status}</span></td>
                  {attConfig==="all_teachers" && <td style={{ padding:"10px 12px", color:"#64748b" }}>{r.subject_name||"—"}</td>}
                  <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:12 }}>{r.remarks||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Parent: view child attendance ────────────────────────────── */
function ParentAttendance() {
  const [children,  setChildren]  = useState([]);
  const [selChild,  setSelChild]  = useState("");
  const [records,   setRecords]   = useState([]);
  const processingToday = useProcessingToday();
  const [from,      setFrom]      = useState(monthStart());
  const [to,        setTo]        = useState(processingToday);
  useEffect(() => { setTo(processingToday); }, [processingToday]);
  const [loading,   setLoading]   = useState(false);
  const [attConfig, setAttConfig] = useState("incharge_only");
  const [subjects,  setSubjects]  = useState([]);
  const [selSubj,   setSelSubj]   = useState("");

  useEffect(() => {
    attendanceApi.getConfig().then(r => setAttConfig(r.data.data?.attendance_marker||"incharge_only")).catch(()=>{});
    import("../api/studentsApi").then(m => {
      m.default.getMyChildren().then(r => {
        const allKids = r.data.data||[];
        const kids = allKids.filter(k => k.status !== "withdrawn");
        setChildren(kids);
        if (kids.length>0) setSelChild(String(kids[0].id));
      });
    });
  }, []);

  useEffect(() => {
    if (!selChild) return;
    const child = children.find(c=>String(c.id)===selChild);
    if (child?.class_id) {
      import("../api/academicsApi").then(({ default: aApi }) => {
        aApi.getClassSubjects(child.class_id).then(r=>setSubjects(r.data.data||[])).catch(()=>{});
      });
    }
  }, [selChild, children]);

  useEffect(() => {
    if (!selChild) return;
    setLoading(true);
    attendanceApi.getByStudent(selChild, { from, to, subject_id: selSubj||undefined })
      .then(r => setRecords(r.data.data||[]))
      .catch(()=>{}).finally(()=>setLoading(false));
  }, [selChild, from, to, selSubj]);

  const counts = records.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{});
  const total  = records.length;
  const pct    = total>0 ? Math.round(((counts.present||0)/total)*100) : 0;
  const STATUS_INLINE = {
    present:  { background:"#f0fdf4", color:"#166534", border:"1px solid #22c55e" },
    absent:   { background:"#fef2f2", color:"#991b1b", border:"1px solid #ef4444" },
    late:     { background:"#fffbeb", color:"#92400e", border:"1px solid #f59e0b" },
    on_leave2: { background:"#eff6ff", color:"#1e40af", border:"1px solid #2563eb" },
    on_leave: { background:"#eff6ff", color:"#1e40af", border:"1px solid #2563eb" },
  };

  return (
    <div>
      <div className="page-header"><h1 className="page-heading">Child Attendance</h1></div>
      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div className="form-group" style={{ marginBottom:0, minWidth:180 }}>
            <label className="form-label">Child</label>
            <select className="form-control" value={selChild} onChange={e=>{setSelChild(e.target.value);setSelSubj("");}}>
              {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">From</label>
            <DatePicker value={from} onChange={setFrom} style={{ width:150 }} />
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">To</label>
            <DatePicker value={to} onChange={setTo} style={{ width:150 }} />
          </div>
          {attConfig==="all_teachers" && subjects.length>0 && (
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Subject</label>
              <select className="form-control" value={selSubj} onChange={e=>setSelSubj(e.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map(s=><option key={s.subject_id||s.id} value={s.subject_id||s.id}>{s.subject_name}</option>)}
              </select>
            </div>
          )}
        </div>
        {attConfig==="incharge_only" && <div style={{ fontSize:12, color:"#64748b", marginTop:8 }}>Attendance is marked by class incharge — no subject-wise breakdown.</div>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:16 }}>
        {[["Present",counts.present||0,"#22c55e"],["Absent",counts.absent||0,"#ef4444"],["Late",counts.late||0,"#f59e0b"],["On Leave",counts.on_leave||0,"#0891b2"],["On Leave",counts.on_leave||0,"#2563eb"]].map(([label,val,color])=>(
          <div key={label} style={{ background:"#fff", border:"1px solid #e2e8f0", borderTop:"3px solid "+color, borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:800, color }}>{val}</div>
            <div style={{ fontSize:12, color:"#64748b" }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="section-card">
        {loading ? <div className="loading-state">Loading...</div> : records.length===0 ? (
          <div className="empty-state">No attendance records for this period.</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#f8fafc" }}>
                {["Date","Day","Status",attConfig==="all_teachers"?"Subject":"","Remarks"].filter(Boolean).map(h=>(
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:"#64748b", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"10px 12px", fontWeight:500 }}>{r.date}</td>
                  <td style={{ padding:"10px 12px", color:"#64748b" }}>{new Date(r.date+"T00:00:00").toLocaleDateString("en-PK",{weekday:"short"})}</td>
                  <td style={{ padding:"10px 12px" }}><span style={{ ...( STATUS_INLINE[r.status] || STATUS_INLINE[r.status] || { background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" }), padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{STATUS_LABEL[r.status] || STATUS_LABEL[r.status] || r.status}</span></td>
                  {attConfig==="all_teachers" && <td style={{ padding:"10px 12px", color:"#64748b" }}>{r.subject_name||"—"}</td>}
                  <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:12 }}>{r.remarks||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Principal: all classes report ───────────────────────────── */
function PrincipalAttendance() {
  const { formatDate } = useRegionalSettings();
  const processingToday = useProcessingToday();
  const [selDate,  setSelDate]  = useState(processingToday);
  useEffect(() => { setSelDate(processingToday); }, [processingToday]);
  const [selClass, setSelClass] = useState("");
  const [classes,  setClasses]  = useState([]);
  const [summary,  setSummary]  = useState([]);
  const [detail,   setDetail]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(()=>{
    import("../api/academicsApi").then(({default:aApi})=>{
      aApi.getClasses().then(r=>setClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
    });
  },[]);

  useEffect(()=>{ loadSummary(); },[selDate]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const {default: client} = await import("../api/client");
      const r = await client.get("/attendance/admin-report", {params:{from:selDate,to:selDate}});
      setSummary(r.data.data?.report||[]);
    } catch(e){ console.log("summary err",e); }
    finally { setLoading(false); }
  };

  const loadDetail = async (classId) => {
    setSelClass(classId);
    if(!classId){ setDetail([]); return; }
    setDetailLoading(true);
    try {
      const r = await attendanceApi.getByClass(classId, selDate);
      setDetail(r.data.data||[]);
    } catch(e){ console.log("detail err",e); }
    finally { setDetailLoading(false); }
  };

  const cls = classes.find(c=>String(c.id)===String(selClass));
  const filteredSummary = selClass ? summary.filter(s=>String(s.class_id)===String(selClass)) : summary;
  const totalPresent = filteredSummary.reduce((a,s)=>a+(s.present||0),0);
  const totalAbsent  = filteredSummary.reduce((a,s)=>a+(s.absent||0),0);
  const totalLate    = filteredSummary.reduce((a,s)=>a+(s.late||0),0);
  const totalLeave   = filteredSummary.reduce((a,s)=>a+(s.on_leave||0),0);
  const totalStudents= filteredSummary.reduce((a,s)=>a+(s.total_students||0),0);

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Attendance</div>
        <div style={{fontSize:13,color:"#64748b"}}>View daily attendance by class and student</div>
      </div>

      {/* Filters */}
      <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0",marginBottom:20,display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Date</label>
          <DatePicker value={selDate} onChange={(val)=>{setSelDate(val);setSelClass("");setDetail([]);}} style={{width:160}} />
        </div>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Class</label>
          <select value={selClass} onChange={e=>loadDetail(e.target.value)} style={{padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,minWidth:180}}>
            <option value="">All Classes</option>
            {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
          </select>
        </div>
        <div style={{fontSize:12,color:"#64748b",paddingBottom:4}}>
          Showing attendance for <strong>{formatDate(selDate)}</strong>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Total Students", v:totalStudents, c:"#2563eb"},
          {l:"Present",        v:totalPresent,  c:"#166534"},
          {l:"Absent",         v:totalAbsent,   c:"#991b1b"},
          {l:"Late",           v:totalLate,     c:"#854d0e"},
          {l:"On Leave",       v:totalLeave,    c:"#1e40af"},
        ].map((s,i)=>(
          <div key={i} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid #e2e8f0",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      <div>
        {/* Class List */}
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:selClass?16:0}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontWeight:700,fontSize:13}}>Classes &mdash; {formatDate(selDate)}</div>
          {loading?<div style={{padding:20,textAlign:"center",color:"#94a3b8",fontSize:13}}>Loading...</div>:(
            <div>
              {summary.length===0&&<div style={{padding:20,textAlign:"center",color:"#94a3b8",fontSize:13}}>No attendance marked for this date.</div>}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Class","Incharge","Present","Absent","Late","On Leave","Status"].map(h=>(
                      <th key={h} style={{padding:"9px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s,i)=>(
                    <tr key={i} onClick={()=>loadDetail(String(s.class_id))}
                      style={{borderBottom:"1px solid #f8fafc",cursor:"pointer",background:String(selClass)===String(s.class_id)?"#f0fdf4":i%2===0?"#fff":"#fafafa",borderLeft:"3px solid "+(String(selClass)===String(s.class_id)?"#0f4c35":"transparent")}}>
                      <td style={{padding:"10px 14px",fontWeight:700}}>{s.class_name}{s.section?" ("+s.section+")":""}</td>
                      <td style={{padding:"10px 14px",color:"#2563eb",fontSize:12}}>{s.incharge_name||"-"}</td>
                      <td style={{padding:"10px 14px",color:"#166534",fontWeight:600}}>{s.present||0}</td>
                      <td style={{padding:"10px 14px",color:"#991b1b",fontWeight:600}}>{s.absent||0}</td>
                      <td style={{padding:"10px 14px",color:"#854d0e",fontWeight:600}}>{s.late||0}</td>
                      <td style={{padding:"10px 14px",color:"#1e40af",fontWeight:600}}>{s.on_leave||0}</td>
                      <td style={{padding:"10px 14px"}}>
                        {s.is_marked
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
        </div>

        {/* Student Detail */}
        {selClass&&(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #0f4c35",overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#f0fdf4",fontWeight:700,fontSize:13}}>
              {cls?.name}{cls?.section?" ("+cls.section+")":""} ? Students
            </div>
            {detailLoading?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>Loading...</div>:
            detail.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No attendance marked for this class.</div>:(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["#","Student","Enrollment","Status","Remarks"].map(h=>(
                      <th key={h} style={{padding:"9px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.map((r,i)=>{
                    const sc = STATUS_INLINE[r.status]||{background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0"};
                    return (
                      <tr key={i} style={{borderBottom:"1px solid #f8fafc"}}>
                        <td style={{padding:"9px 14px",color:"#94a3b8"}}>{i+1}</td>
                        <td style={{padding:"9px 14px",fontWeight:600}}>{r.student_name}</td>
                        <td style={{padding:"9px 14px",color:"#64748b",fontSize:12}}>{r.enrollment_no}</td>
                        <td style={{padding:"9px 14px"}}>
                          <span style={{...sc,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>
                            {STATUS_LABEL[r.status]||r.status}
                          </span>
                        </td>
                        <td style={{padding:"9px 14px",color:"#94a3b8",fontSize:12}}>{r.remarks||"-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


