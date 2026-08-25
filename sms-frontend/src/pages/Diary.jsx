import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import diaryApi from "../api/diaryApi";
import academicsApi from "../api/academicsApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";

const today = () => new Date().toISOString().split("T")[0];

export default function Diary() {
  const { user } = useAuth();
  const role = user?.roles?.[0];
  if (role === "student") return <StudentDiary />;
  if (role === "parent")  return <ParentDiary />;
  if (role === "principal" || role === "admin" || role === "superadmin" || role === "academic_coordinator") return <PrincipalDiary />;
  return <TeacherDiary role={role} />;
}

/* ── Principal View: all classes publish status + remind ──────── */
function PrincipalDiary() {
  const processingToday = useProcessingToday();
  const { formatTime } = useRegionalSettings();
  const [classes,   setClasses]   = useState([]);
  const [selDate,   setSelDate]   = useState(today());
  useEffect(() => { setSelDate(processingToday); }, [processingToday]);
  const [loading,   setLoading]   = useState(false);
  const [reminding, setReminding] = useState({});
  const [msg,       setMsg]       = useState("");

  useEffect(() => { loadStatus(); }, [selDate]);

  const loadStatus = () => {
    setLoading(true);
    diaryApi.getAllStatus({ date: selDate })
      .then(r => setClasses(r.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  const handleRemind = async (cls) => {
    if (!cls.incharge_user_id) { alert("No incharge assigned to this class."); return; }
    setReminding(p => ({...p, [cls.class_id]: true}));
    try {
      await diaryApi.remindPublish({ incharge_user_id: cls.incharge_user_id, class_name: cls.name+(cls.section?" ("+cls.section+")":""), date: selDate });
      setMsg("Reminder sent to " + cls.incharge_name);
    } catch { setMsg("Failed to send reminder."); }
    setTimeout(() => { setMsg(""); setReminding(p => ({...p, [cls.class_id]: false})); }, 3000);
  };

  const published = classes.filter(c => c.published);
  const pending   = classes.filter(c => !c.published);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Daily Diary — Publish Status</h1>
        <DatePicker style={{ maxWidth:180 }} value={selDate} onChange={val => setSelDate(val)} />
      </div>

      {msg && <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#16a34a" }}>{msg}</div>}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Pending */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">⏳ Not Published</span>
            <span className="badge badge-warning">{pending.length} classes</span>
          </div>
          {loading ? <div className="loading-state">Loading...</div> : pending.length === 0 ? (
            <div className="empty-state">All classes published for this date! 🎉</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {pending.map(cls => (
                <div key={cls.class_id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:"#fef9c3", border:"1px solid #fde68a", borderRadius:8 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{cls.name}{cls.section?" ("+cls.section+")":""}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                      {cls.incharge_name ? "Incharge: "+cls.incharge_name : "No incharge assigned"}
                    </div>
                  </div>
                  {cls.incharge_user_id && (
                    <button className="btn btn-ghost" style={{ fontSize:11, color:"#dc2626", padding:"4px 10px" }}
                      disabled={reminding[cls.class_id]}
                      onClick={() => handleRemind(cls)}>
                      {reminding[cls.class_id] ? "Sending..." : "🔔 Remind"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Published */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">✓ Published</span>
            <span className="badge badge-success">{published.length} classes</span>
          </div>
          {loading ? <div className="loading-state">Loading...</div> : published.length === 0 ? (
            <div className="empty-state">No classes published yet.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {published.map(cls => (
                <div key={cls.class_id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{cls.name}{cls.section?" ("+cls.section+")":""}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                      {cls.incharge_name ? "Incharge: "+cls.incharge_name : ""}
                    </div>
                  </div>
                  <span style={{ fontSize:11, color:"#16a34a", fontWeight:600 }}>
                    {cls.published_at ? formatTime(cls.published_at) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Teacher / Incharge View ─────────────────────────────────── */
function TeacherDiary({ role }) {
  const processingToday = useProcessingToday();
  const [classes,   setClasses]   = useState([]);
  const [selDate,   setSelDate]   = useState(today());
  useEffect(() => { setSelDate(processingToday); }, [processingToday]);
  const [activeTab, setActiveTab] = useState("incharge"); // "incharge" | "mysubjects"

  useEffect(() => {
    diaryApi.getMyClasses().then(r => {
      const cls = r.data.data || [];
      setClasses(cls);
    }).catch(() => {});
  }, []);

  const inchargeClasses = classes.filter(c => c.is_primary);
  const subjectClasses  = classes.filter(c => !c.is_primary);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Daily Diary</h1>
        <DatePicker style={{ maxWidth:180 }} value={selDate} onChange={val => setSelDate(val)} />
      </div>

      {/* Tab switcher */}
      <div style={{ display:"flex", borderBottom:"2px solid #e2e8f0", marginBottom:16 }}>
        <button onClick={() => setActiveTab("incharge")}
          style={{ padding:"10px 20px", fontWeight:600, fontSize:13, border:"none", cursor:"pointer", borderBottom: activeTab==="incharge" ? "2px solid #2563eb" : "none", color: activeTab==="incharge" ? "#2563eb" : "#64748b", background:"transparent", marginBottom:-2 }}>
          📋 Class Incharge {inchargeClasses.length > 0 ? "("+inchargeClasses.length+")" : ""}
        </button>
        <button onClick={() => setActiveTab("mysubjects")}
          style={{ padding:"10px 20px", fontWeight:600, fontSize:13, border:"none", cursor:"pointer", borderBottom: activeTab==="mysubjects" ? "2px solid #2563eb" : "none", color: activeTab==="mysubjects" ? "#2563eb" : "#64748b", background:"transparent", marginBottom:-2 }}>
          📚 My Subjects {subjectClasses.length > 0 ? "("+subjectClasses.length+" classes)" : ""}
        </button>
      </div>

      {activeTab === "incharge" && (
        inchargeClasses.length === 0 ? (
          <div className="section-card"><div className="empty-state">You are not a class incharge.</div></div>
        ) : (
          inchargeClasses.map(cls => (
            <InchargeSection key={cls.id} cls={cls} date={selDate} />
          ))
        )
      )}

      {activeTab === "mysubjects" && (
        <MySubjectsSection classes={classes} date={selDate} />
      )}
    </div>
  );
}

/* ── Incharge Section: see all teachers, remind, publish ─────── */
function InchargeSection({ cls, date }) {
  const [entries,   setEntries]   = useState([]);
  const [status,    setStatus]    = useState({ submitted:[], pending:[] });
  const [published, setPublished] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [reminding, setReminding] = useState({});
  const [msg,       setMsg]       = useState("");

  useEffect(() => { loadAll(); }, [cls.id, date]);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      diaryApi.getEntries({ class_id: cls.id, date }),
      diaryApi.getStatus({ class_id: cls.id, date }),
    ]).then(([r1, r2]) => {
      setEntries(r1.data.data?.entries || []);
      setPublished(r1.data.data?.published || false);
      setStatus(r2.data.data || { submitted:[], pending:[] });
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const handlePublish = async () => {
    if (status.pending.length > 0) {
      if (!window.confirm(status.pending.length + " teacher(s) haven't submitted yet. Publish anyway?")) return;
    }
    try {
      await diaryApi.publish({ class_id: cls.id, date, force: true });
      setMsg("Diary published!");
      setPublished(true);
      loadAll();
    } catch (e) { setMsg(e.response?.data?.message || "Failed."); }
    setTimeout(() => setMsg(""), 3000);
  };

  const handleRemind = async (teacher_id, teacher_name) => {
    setReminding(p => ({...p, [teacher_id]: true}));
    try {
      await diaryApi.sendReminder({ teacher_id, class_id: cls.id, date });
      setMsg("Reminder sent to " + teacher_name);
    } catch { setMsg("Failed to send reminder."); }
    setTimeout(() => { setMsg(""); setReminding(p => ({...p, [teacher_id]: false})); }, 3000);
  };

  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <h3 style={{ fontSize:15, fontWeight:700, color:"#1e3a5f" }}>
          {cls.name}{cls.section?" ("+cls.section+")":""} <span style={{ fontSize:12, color:"#64748b", fontWeight:400 }}>— Class Incharge</span>
        </h3>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {msg && <span style={{ fontSize:12, color:"#16a34a" }}>{msg}</span>}
          {published ? (
            <span className="badge badge-success">✓ Published</span>
          ) : (
            <button className="btn btn-primary" style={{ fontSize:12 }} onClick={handlePublish}>
              📢 Publish Diary
            </button>
          )}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* Status */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Submission Status</span>
            <div style={{ display:"flex", gap:6 }}>
              <span className="badge badge-success">{status.submitted.length} ✓</span>
              <span className="badge badge-warning">{status.pending.length} ⏳</span>
            </div>
          </div>
          {loading ? <div className="loading-state">Loading...</div> : (
            <>
              {status.pending.map((p, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 8px", background:"#fef2f2", borderRadius:6, marginBottom:4 }}>
                  <div>
                    <span style={{ fontWeight:600, fontSize:12 }}>{p.teacher_name}</span>
                    <span style={{ fontSize:11, color:"#64748b", marginLeft:6 }}>— {p.subject_name}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize:11, color:"#dc2626", padding:"2px 8px" }}
                    disabled={reminding[p.teacher_id]} onClick={() => handleRemind(p.teacher_id, p.teacher_name)}>
                    {reminding[p.teacher_id] ? "..." : "🔔 Remind"}
                  </button>
                </div>
              ))}
              {status.submitted.map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 8px", background:"#f0fdf4", borderRadius:6, marginBottom:4, fontSize:12 }}>
                  <span style={{ fontWeight:600 }}>{s.teacher_name}</span>
                  <span style={{ color:"#64748b" }}>{s.subject_name}</span>
                </div>
              ))}
              {status.submitted.length===0 && status.pending.length===0 && <div className="empty-state">No timetable data.</div>}
            </>
          )}
        </div>

        {/* Entries */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Diary Entries</span>
            <span className="badge badge-gray">{entries.length}</span>
          </div>
          {entries.length === 0 ? <div className="empty-state">No entries yet.</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:300, overflowY:"auto" }}>
              {entries.map(e => (
                <div key={e.id} style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 10px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:12, color:"#1e3a5f" }}>{e.subject_name}</span>
                    <span style={{ fontSize:11, color:"#64748b" }}>{e.teacher_name}</span>
                  </div>
                  {e.classwork && <div style={{ fontSize:11, marginBottom:2 }}><b>CW:</b> {e.classwork}</div>}
                  {e.homework  && <div style={{ fontSize:11, color:"#dc2626" }}><b>HW:</b> {e.homework}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── My Subjects Section: teacher fills own diary ─────────────── */
function MySubjectsSection({ classes, date }) {
  const [selClass,  setSelClass]  = useState("");
  const [subjects,  setSubjects]  = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [form,      setForm]      = useState({ subject_id:"", classwork:"", homework:"", notes:"" });
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState("");
  const [published, setPublished] = useState(false);

  // Include ALL classes (incharge can also submit their own subjects)
  const allClasses = classes;

  useEffect(() => {
    if (allClasses.length > 0 && !selClass) setSelClass(String(allClasses[0].id));
  }, [allClasses]);

  useEffect(() => {
    if (!selClass) return;
    diaryApi.getMySubjects({ class_id: selClass }).then(r => setSubjects(r.data.data || [])).catch(() => {});
    diaryApi.getEntries({ class_id: selClass, date })
      .then(r => {
        setEntries(r.data.data?.entries || []);
        setPublished(r.data.data?.published || false);
      }).catch(() => {});
  }, [selClass, date]);

  const handleSave = async () => {
    if (!form.subject_id || !selClass) return;
    setSaving(true);
    try {
      await diaryApi.saveEntry({ class_id: parseInt(selClass), subject_id: parseInt(form.subject_id), date, classwork: form.classwork, homework: form.homework, notes: form.notes });
      setMsg("Entry saved!");
      setForm({ subject_id:"", classwork:"", homework:"", notes:"" });
      diaryApi.getEntries({ class_id: selClass, date }).then(r => setEntries(r.data.data?.entries || []));
    } catch(err) { const errMsg = err.response?.data?.message || err.message || "Failed to save."; setMsg(errMsg); alert(errMsg); }
    finally { setSaving(false); setTimeout(() => setMsg(""), 3000); }
  };

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <select className="form-control" style={{ maxWidth:220 }} value={selClass} onChange={e => setSelClass(e.target.value)}>
          {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
        </select>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="section-card">
          <div className="section-card-header"><span className="section-card-title">{form.subject_id && subjects.find(s=>String(s.id)===String(form.subject_id)) ? "Edit: "+subjects.find(s=>String(s.id)===String(form.subject_id)).subject_name : "Add Entry"}</span>{form.subject_id && <button className="btn btn-ghost" style={{fontSize:11}} onClick={() => setForm({subject_id:"",classwork:"",homework:"",notes:""})}>✕ Clear</button>}</div>
          {published && <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 12px", marginBottom:10, fontSize:12, color:"#16a34a", fontWeight:600 }}>✓ Diary published — editing is locked.</div>}
          {msg && <div style={{ color:"#16a34a", fontSize:12, marginBottom:8 }}>{msg}</div>}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <select className="form-control" value={form.subject_id} disabled={published} onChange={e => {
                const sid = e.target.value;
                const existing = entries.find(en => String(en.subject_id) === sid);
                setForm(existing ? { subject_id:sid, classwork:existing.classwork||"", homework:existing.homework||"", notes:existing.notes||"" } : { ...form, subject_id:sid });
              }}>
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Classwork</label>
              <textarea className="form-control" rows={3} value={form.classwork} onChange={e => setForm({...form, classwork:e.target.value})} disabled={published} placeholder="What was covered today..." />
            </div>
            <div className="form-group">
              <label className="form-label">Homework</label>
              <textarea className="form-control" rows={2} value={form.homework} onChange={e => setForm({...form, homework:e.target.value})} disabled={published} placeholder="Homework assigned..." />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} disabled={published} placeholder="Additional notes..." />
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.subject_id || published}>
              {saving ? "Saving..." : published ? "Diary Published" : "Save Entry"}
            </button>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">My Entries — {date}</span>
            <span className="badge badge-gray">{entries.filter(e => subjects.some(s => s.id === e.subject_id)).length} submitted</span>
          </div>
          {subjects.length === 0 ? <div className="empty-state">No subjects assigned for this class.</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {subjects.map(subj => {
                const entry = entries.find(e => e.subject_id === subj.id);
                return (
                  <div key={subj.id} style={{ padding:"8px 10px", border:"1px solid #e2e8f0", borderRadius:8, borderLeft:"3px solid "+(entry?"#16a34a":"#e2e8f0") }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontWeight:600, fontSize:12 }}>{subj.subject_name}</span>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <span className={"badge "+(entry?"badge-success":"badge-warning")} style={{ fontSize:10 }}>
                          {entry ? "✓ Submitted" : "⏳ Pending"}
                        </span>
                        {entry && (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize:11, padding:"2px 8px", color: published?"#94a3b8":"#2563eb" }}
                            disabled={published}
                            title={published ? "Diary published - cannot edit" : "Edit entry"}
                            onClick={() => {
                              if (published) return;
                              setForm({ subject_id: String(subj.id), classwork: entry.classwork||"", homework: entry.homework||"", notes: entry.notes||"" });
                              window.scrollTo(0, 0);
                            }}
                          >
                            {published ? "🔒" : "✏️ Edit"}
                          </button>
                        )}
                      </div>
                    </div>
                    {entry?.classwork && <div style={{ fontSize:11, color:"#64748b", marginTop:3 }}><b>CW:</b> {entry.classwork.slice(0,60)}{entry.classwork.length>60?"...":""}</div>}
                    {entry?.homework  && <div style={{ fontSize:11, color:"#dc2626" }}><b>HW:</b> {entry.homework.slice(0,60)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Student View ─────────────────────────────────────────────── */
function StudentDiary() {
  const processingToday = useProcessingToday();
  const [entries,   setEntries]   = useState([]);
  const [published, setPublished] = useState(false);
  const [selDate,   setSelDate]   = useState(today());
  useEffect(() => { setSelDate(processingToday); }, [processingToday]);
  const [selSubj,   setSelSubj]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [classInfo, setClassInfo] = useState(null);

  useEffect(() => {
    setLoading(true);
    diaryApi.getStudent({ date: selDate })
      .then(r => {
        const ents = r.data.data?.entries || [];
        setEntries(ents);
        setPublished(r.data.data?.published || false);
        setClassInfo({ name: r.data.data?.class_name, section: r.data.data?.section });
        if (ents.length > 0) setSelSubj(ents[0].subject_id);
      }).catch(() => {}).finally(() => setLoading(false));
  }, [selDate]);

  const active = entries.find(e => e.subject_id === selSubj);

  const COLORS = ["#178DD9","#1D9E75","#D85A30","#7F77DD","#BA7517","#D4537E","#0F6E56","#993556"];
  const colorMap = {};
  entries.forEach((e, i) => { colorMap[e.subject_id] = COLORS[i % COLORS.length]; });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Daily Diary</h1>
        <DatePicker style={{ maxWidth:180 }} value={selDate} onChange={val => setSelDate(val)} />
      </div>
      {classInfo?.name && <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:12 }}>
        Class: {classInfo.name}{classInfo.section ? " ("+classInfo.section+")" : ""}
      </div>}

      {loading ? <div className="loading-state">Loading...</div> : !published ? (
        <div className="section-card"><div className="empty-state">Diary not published yet for {selDate}.</div></div>
      ) : entries.length === 0 ? (
        <div className="section-card"><div className="empty-state">No diary entries for this date.</div></div>
      ) : (
        <DiaryPanel entries={entries} selSubj={selSubj} setSelSubj={setSelSubj} active={active} colorMap={colorMap} />
      )}
    </div>
  );
}

/* ── Parent View ──────────────────────────────────────────────── */
function ParentDiary() {
  const processingToday = useProcessingToday();
  const [children,  setChildren]  = useState([]);
  const [selChild,  setSelChild]  = useState("");
  const [entries,   setEntries]   = useState([]);
  const [published, setPublished] = useState(false);
  const [selDate,   setSelDate]   = useState(today());
  useEffect(() => { setSelDate(processingToday); }, [processingToday]);
  const [selSubj,   setSelSubj]   = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyChildren().then(r => {
        const kids = r.data.data || [];
        setChildren(kids);
        if (kids.length > 0) setSelChild(String(kids[0].id));
      });
    });
  }, []);

  useEffect(() => {
    if (!selChild || !selDate) return;
    const child = children.find(c => String(c.id) === selChild);
    if (!child?.class_id) return;
    setLoading(true);
    diaryApi.getEntries({ class_id: child.class_id, date: selDate })
      .then(r => {
        const ents = r.data.data?.entries || [];
        setEntries(ents);
        setPublished(r.data.data?.published || false);
        if (ents.length > 0) setSelSubj(ents[0].subject_id);
        else setSelSubj(null);
      }).catch(() => {}).finally(() => setLoading(false));
  }, [selChild, selDate, children]);

  const child  = children.find(c => String(c.id) === selChild);
  const isWithdrawn = child?.status === "withdrawn";
  const active = entries.find(e => e.subject_id === selSubj);

  const COLORS = ["#178DD9","#1D9E75","#D85A30","#7F77DD","#BA7517","#D4537E","#0F6E56","#993556"];
  const colorMap = {};
  entries.forEach((e, i) => { colorMap[e.subject_id] = COLORS[i % COLORS.length]; });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Daily Diary</h1>
        <div style={{ display:"flex", gap:10 }}>
          <select className="form-control" style={{ maxWidth:180 }} value={selChild} onChange={e => setSelChild(e.target.value)}>
            {children.filter(c => c.status !== "withdrawn").map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
          <DatePicker style={{ maxWidth:160 }} value={selDate} onChange={val => setSelDate(val)} />
        </div>
      </div>

      {child && <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:12 }}>
        Class: {child.class_name}{child.class_section ? " ("+child.class_section+")" : ""}
      </div>}

      {loading ? <div className="loading-state">Loading...</div> : !published ? (
        <div className="section-card"><div className="empty-state">Diary not published yet for {selDate}.</div></div>
      ) : entries.length === 0 ? (
        <div className="section-card"><div className="empty-state">No diary entries for this date.</div></div>
      ) : (
        <DiaryPanel entries={entries} selSubj={selSubj} setSelSubj={setSelSubj} active={active} colorMap={colorMap} />
      )}
    </div>
  );
}

/* ── Shared Diary Panel ───────────────────────────────────────── */
function DiaryPanel({ entries, selSubj, setSelSubj, active, colorMap }) {
  return (
    <div style={{ border:"1px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden", background:"var(--color-background-primary)" }}>
      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", minHeight:400 }}>

        {/* Left: subject list */}
        <div style={{ borderRight:"1px solid var(--color-border-tertiary)", background:"#f8fafc" }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Subjects</div>
          </div>
          {entries.map((e) => {
            const color = colorMap[e.subject_id];
            const isActive = e.subject_id === selSubj;
            return (
              <div key={e.subject_id} onClick={() => setSelSubj(e.subject_id)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", cursor:"pointer",
                  borderLeft: isActive ? "4px solid "+color : "4px solid transparent",
                  borderBottom:"1px solid var(--color-border-tertiary)",
                  background: isActive ? "var(--color-background-primary)" : "transparent",
                  transition:"background 0.15s" }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:color+"22", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:color }} />
                </div>
                <div style={{ overflow:"hidden" }}>
                  <div style={{ fontSize:13, fontWeight:isActive?700:500, color: isActive ? color : "var(--color-text-primary)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.subject_name}</div>
                  <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.teacher_name}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: diary content */}
        <div style={{ background:"#fff" }}>
          {active ? (
            <>
              {/* Header */}
              <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--color-border-tertiary)", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:42, height:42, borderRadius:10, background:colorMap[active.subject_id]+"22", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <div style={{ fontSize:18 }}>📖</div>
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:"var(--color-text-primary)" }}>{active.subject_name}</div>
                  <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginTop:2 }}>Teacher: {active.teacher_name}</div>
                </div>
              </div>

              {/* Content */}
              <div style={{ padding:"20px 20px", display:"flex", flexDirection:"column", gap:16 }}>
                {active.classwork && (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📚</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1d4ed8", textTransform:"uppercase", letterSpacing:"0.06em" }}>Classwork</div>
                    </div>
                    <div style={{ background:"#fff", border:"1.5px solid #1d4ed8", borderRadius:8, padding:"12px 16px", fontSize:13, lineHeight:1.7, color:"var(--color-text-primary)" }}>{active.classwork}</div>
                  </div>
                )}
                {active.homework && (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#fef2f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>✏️</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.06em" }}>Homework</div>
                    </div>
                    <div style={{ background:"#fff", border:"1.5px solid #dc2626", borderRadius:8, padding:"12px 16px", fontSize:13, lineHeight:1.7, color:"var(--color-text-primary)" }}>{active.homework}</div>
                  </div>
                )}
                {active.notes && (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📝</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>Notes</div>
                    </div>
                    <div style={{ background:"#fff", border:"1.5px solid #475569", borderRadius:8, padding:"12px 16px", fontSize:13, lineHeight:1.7, color:"var(--color-text-primary)" }}>{active.notes}</div>
                  </div>
                )}
                {!active.classwork && !active.homework && !active.notes && (
                  <div className="empty-state">No content added for this subject yet.</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", padding:40 }}>
              <div style={{ textAlign:"center", color:"var(--color-text-secondary)" }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📖</div>
                <div style={{ fontSize:14 }}>Select a subject to view diary</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
