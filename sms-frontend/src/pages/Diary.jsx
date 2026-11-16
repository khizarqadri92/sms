import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import diaryApi from "../api/diaryApi";
import academicsApi from "../api/academicsApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";
import "./Diary.css";

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

      {msg && <div className="dia-msg-box">{msg}</div>}

      <div className="dia-two-col-grid">
        {/* Pending */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">⏳ Not Published</span>
            <span className="badge badge-warning">{pending.length} classes</span>
          </div>
          {loading ? <div className="loading-state">Loading...</div> : pending.length === 0 ? (
            <div className="empty-state">All classes published for this date! 🎉</div>
          ) : (
            <div className="dia-list-stack">
              {pending.map(cls => (
                <div key={cls.class_id} className="dia-pending-item">
                  <div>
                    <div className="dia-item-name">{cls.name}{cls.section?" ("+cls.section+")":""}</div>
                    <div className="dia-item-sub">
                      {cls.incharge_name ? "Incharge: "+cls.incharge_name : "No incharge assigned"}
                    </div>
                  </div>
                  {cls.incharge_user_id && (
                    <button className="btn btn-ghost dia-remind-btn"
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
            <div className="dia-list-stack">
              {published.map(cls => (
                <div key={cls.class_id} className="dia-published-item">
                  <div>
                    <div className="dia-item-name">{cls.name}{cls.section?" ("+cls.section+")":""}</div>
                    <div className="dia-item-sub">
                      {cls.incharge_name ? "Incharge: "+cls.incharge_name : ""}
                    </div>
                  </div>
                  <span className="dia-published-time">
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
      <div className="dia-tab-row">
        <button onClick={() => setActiveTab("incharge")}
          className="dia-tab-btn" style={{ "--tab-border": activeTab==="incharge" ? "#2563eb" : "transparent", "--tab-color": activeTab==="incharge" ? "#2563eb" : "var(--text-secondary)" }}>
          📋 Class Incharge {inchargeClasses.length > 0 ? "("+inchargeClasses.length+")" : ""}
        </button>
        <button onClick={() => setActiveTab("mysubjects")}
          className="dia-tab-btn" style={{ "--tab-border": activeTab==="mysubjects" ? "#2563eb" : "transparent", "--tab-color": activeTab==="mysubjects" ? "#2563eb" : "var(--text-secondary)" }}>
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
    <div className="dia-section-wrap">
      <div className="dia-section-header-row">
        <h3 className="dia-section-title">
          {cls.name}{cls.section?" ("+cls.section+")":""} <span className="dia-section-subtitle">— Class Incharge</span>
        </h3>
        <div className="dia-header-actions">
          {msg && <span className="dia-success-msg-text">{msg}</span>}
          {published ? (
            <span className="badge badge-success">✓ Published</span>
          ) : (
            <button className="btn btn-primary dia-publish-btn" onClick={handlePublish}>
              📢 Publish Diary
            </button>
          )}
        </div>
      </div>

      <div className="dia-two-col-grid">
        {/* Status */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Submission Status</span>
            <div className="dia-status-badge-row">
              <span className="badge badge-success">{status.submitted.length} ✓</span>
              <span className="badge badge-warning">{status.pending.length} ⏳</span>
            </div>
          </div>
          {loading ? <div className="loading-state">Loading...</div> : (
            <>
              {status.pending.map((p, i) => (
                <div key={i} className="dia-pending-row">
                  <div>
                    <span className="dia-pending-name">{p.teacher_name}</span>
                    <span className="dia-pending-subject">— {p.subject_name}</span>
                  </div>
                  <button className="btn btn-ghost dia-small-remind-btn"
                    disabled={reminding[p.teacher_id]} onClick={() => handleRemind(p.teacher_id, p.teacher_name)}>
                    {reminding[p.teacher_id] ? "..." : "🔔 Remind"}
                  </button>
                </div>
              ))}
              {status.submitted.map((s, i) => (
                <div key={i} className="dia-submitted-row">
                  <span style={{ fontWeight:600 }}>{s.teacher_name}</span>
                  <span style={{ color:"var(--text-secondary)" }}>{s.subject_name}</span>
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
            <div className="dia-entries-scroll">
              {entries.map(e => (
                <div key={e.id} className="dia-entry-card">
                  <div className="dia-entry-header">
                    <span className="dia-entry-subject">{e.subject_name}</span>
                    <span className="dia-entry-teacher">{e.teacher_name}</span>
                  </div>
                  {e.classwork && <div className="dia-entry-cw"><b>CW:</b> {e.classwork}</div>}
                  {e.homework  && <div className="dia-entry-hw"><b>HW:</b> {e.homework}</div>}
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
      <div className="dia-class-select-row">
        <select className="form-control dia-class-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
          {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
        </select>
      </div>
      <div className="dia-two-col-grid">
        <div className="section-card">
          <div className="section-card-header"><span className="section-card-title">{form.subject_id && subjects.find(s=>String(s.id)===String(form.subject_id)) ? "Edit: "+subjects.find(s=>String(s.id)===String(form.subject_id)).subject_name : "Add Entry"}</span>{form.subject_id && <button className="btn btn-ghost dia-clear-btn" onClick={() => setForm({subject_id:"",classwork:"",homework:"",notes:""})}>✕ Clear</button>}</div>
          {published && <div className="dia-published-notice">✓ Diary published — editing is locked.</div>}
          {msg && <div className="dia-info-msg">{msg}</div>}
          <div className="dia-form-stack">
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
            <div className="dia-subject-list-stack">
              {subjects.map(subj => {
                const entry = entries.find(e => e.subject_id === subj.id);
                return (
                  <div key={subj.id} className="dia-subject-item" style={{ "--border-left-color": entry?"#16a34a":"var(--border-color)" }}>
                    <div className="dia-subject-item-top">
                      <span className="dia-subject-name">{subj.subject_name}</span>
                      <div className="dia-subject-actions">
                        <span className={"badge "+(entry?"badge-success":"badge-warning")} style={{ fontSize:10 }}>
                          {entry ? "✓ Submitted" : "⏳ Pending"}
                        </span>
                        {entry && (
                          <button
                            className="btn btn-ghost dia-edit-btn"
                            style={{ "--edit-color": published?"var(--text-muted)":"#2563eb" }}
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
                    {entry?.classwork && <div className="dia-subject-cw-text"><b>CW:</b> {entry.classwork.slice(0,60)}{entry.classwork.length>60?"...":""}</div>}
                    {entry?.homework  && <div className="dia-subject-hw-text"><b>HW:</b> {entry.homework.slice(0,60)}</div>}
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
      {classInfo?.name && <div className="dia-class-info-text">
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
        <div className="dia-header-select-row">
          <select className="form-control dia-child-select" value={selChild} onChange={e => setSelChild(e.target.value)}>
            {children.filter(c => c.status !== "withdrawn").map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
          <DatePicker style={{ maxWidth:160 }} value={selDate} onChange={val => setSelDate(val)} />
        </div>
      </div>

      {child && <div className="dia-class-info-text">
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
    <div className="dia-panel-wrap">
      <div className="dia-panel-grid">

        {/* Left: subject list */}
        <div className="dia-subject-sidebar">
          <div className="dia-sidebar-header">
            <div className="dia-sidebar-header-title">Subjects</div>
          </div>
          {entries.map((e) => {
            const color = colorMap[e.subject_id];
            const isActive = e.subject_id === selSubj;
            return (
              <div key={e.subject_id} onClick={() => setSelSubj(e.subject_id)}
                className="dia-sidebar-item"
                style={{ "--border-left": isActive ? "4px solid "+color : "4px solid transparent", "--sidebar-item-bg": isActive ? "var(--color-background-primary)" : "transparent" }}>
                <div className="dia-sidebar-icon" style={{ "--icon-bg": color+"22" }}>
                  <div className="dia-sidebar-dot" style={{ "--dot-bg": color }} />
                </div>
                <div className="dia-sidebar-text-wrap">
                  <div className="dia-sidebar-subject-name" style={{ "--name-weight": isActive?700:500, "--name-color": isActive ? color : "var(--color-text-primary)" }}>{e.subject_name}</div>
                  <div className="dia-sidebar-teacher-name">{e.teacher_name}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: diary content */}
        <div className="dia-content-pane">
          {active ? (
            <>
              {/* Header */}
              <div className="dia-content-header">
                <div className="dia-content-icon" style={{ "--icon-bg": colorMap[active.subject_id]+"22" }}>
                  <div style={{ fontSize:18 }}>📖</div>
                </div>
                <div>
                  <div className="dia-content-title">{active.subject_name}</div>
                  <div className="dia-content-subtitle">Teacher: {active.teacher_name}</div>
                </div>
              </div>

              {/* Content */}
              <div className="dia-content-body">
                {active.classwork && (
                  <div>
                    <div className="dia-block-label-row">
                      <div className="dia-block-icon-cw">📚</div>
                      <div className="dia-block-label-cw">Classwork</div>
                    </div>
                    <div className="dia-block-text-cw">{active.classwork}</div>
                  </div>
                )}
                {active.homework && (
                  <div>
                    <div className="dia-block-label-row">
                      <div className="dia-block-icon-hw">✏️</div>
                      <div className="dia-block-label-hw">Homework</div>
                    </div>
                    <div className="dia-block-text-hw">{active.homework}</div>
                  </div>
                )}
                {active.notes && (
                  <div>
                    <div className="dia-block-label-row">
                      <div className="dia-block-icon-notes">📝</div>
                      <div className="dia-block-label-notes">Notes</div>
                    </div>
                    <div className="dia-block-text-notes">{active.notes}</div>
                  </div>
                )}
                {!active.classwork && !active.homework && !active.notes && (
                  <div className="empty-state">No content added for this subject yet.</div>
                )}
              </div>
            </>
          ) : (
            <div className="dia-empty-panel">
              <div className="dia-empty-panel-inner">
                <div className="dia-empty-panel-icon">📖</div>
                <div style={{ fontSize:14 }}>Select a subject to view diary</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
