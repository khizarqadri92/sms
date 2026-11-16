import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import assignmentsApi from "../api/assignmentsApi";
import diaryApi from "../api/diaryApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useProcessingToday } from "../hooks/useProcessingToday";

const today = () => new Date().toISOString().split("T")[0];
const API   = process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function createAssignmentWithFile(data, file) {
  const fd = new FormData();
  Object.entries(data).forEach(([k,v]) => fd.append(k, v));
  if (file) fd.append("file", file);
  const res = await fetch(`${API}/assignments/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create assignment");
  }
  return res.json();
}

async function submitAssignmentWithFile(id, file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/assignments/${id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Submission failed");
  }
  return res.json();
}

export default function Assignments() {
  const { user } = useAuth();
  const role = user?.roles?.[0];
  if (role === "student") return <StudentAssignments />;
  if (role === "parent")  return <ParentAssignments />;
  if (role === "principal" || role === "admin" || role === "superadmin" || role === "academic_coordinator")
    return <PrincipalAssignments />;
  return <TeacherAssignments />;
}

/* ── Create Assignment Modal ──────────────────────────────────── */
function CreateModal({ onClose, onCreated }) {
  const processingToday = useProcessingToday();
  const [form,    setForm]    = useState({ class_id:"", subject_id:"", title:"", description:"", due_date:"", total_marks:"20" });
  const [classes, setClasses] = useState([]);
  const [subjects,setSubjects]= useState([]);
  const [file,    setFile]    = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");
  const fileRef = useRef();

  useEffect(() => {
    diaryApi.getMyClasses().then(r => setClasses(r.data.data||[])).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!form.class_id) return;
    diaryApi.getMySubjects({ class_id: form.class_id }).then(r => setSubjects(r.data.data||[])).catch(()=>{});
  }, [form.class_id]);

  const handleFile = (f) => {
    const allowed = ["pdf","doc","docx","xls","xlsx","ppt","pptx"];
    const ext = f.name.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) { setErr("Only PDF, Word, Excel, PPT files allowed."); return; }
    if (f.size > 10*1024*1024) { setErr("File must be under 10MB."); return; }
    setFile(f); setErr("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!form.class_id||!form.subject_id||!form.title||!form.due_date) { setErr("Please fill all required fields."); return; }
    setSaving(true); setErr("");
    try {
      await createAssignmentWithFile({ ...form }, file);
      onCreated();
    } catch(e) { setErr(e.message||"Failed to create."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"var(--bg-card)", borderRadius:16, border:"0.5px solid var(--border-color)", width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto" }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:"0.5px solid var(--border-color)", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"var(--bg-card)", zIndex:1 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:600, color:"var(--text-heading)" }}>New Assignment</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:2 }}>Fill in the details below</div>
          </div>
          <button onClick={onClose} style={{ background:"var(--bg-hover)", border:"1px solid var(--border-color)", borderRadius:8, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"var(--text-secondary)" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
          {err && <div style={{ background:"var(--bg-danger-soft)", border:"1px solid #fecaca", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#dc2626" }}>{err}</div>}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>Class *</label>
              <select className="form-control" value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value,subject_id:""})}>
                <option value="">Select class</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>Subject *</label>
              <select className="form-control" value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} disabled={!form.class_id}>
                <option value="">Select subject</option>
                {subjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>Title *</label>
            <input className="form-control" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Chapter 3 — Fractions exercise" />
          </div>

          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>Instructions</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the assignment requirements..." style={{ resize:"vertical" }} />
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>Due date *</label>
              <DatePicker value={form.due_date} min={processingToday} onChange={val=>setForm({...form,due_date:val})} />
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>Total marks *</label>
              <input type="number" className="form-control" value={form.total_marks} min="1" onChange={e=>setForm({...form,total_marks:e.target.value})} />
            </div>
          </div>

          {/* File upload */}
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>
              Attachment <span style={{ fontWeight:400, color:"var(--text-muted)" }}>(optional)</span>
            </label>
            {!file ? (
              <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                style={{ border:"1.5px dashed #cbd5e1", borderRadius:10, padding:"20px 16px", textAlign:"center", cursor:"pointer", background:"var(--bg-hover)" }}>
                <div style={{ fontSize:24, marginBottom:6 }}>📎</div>
                <div style={{ fontSize:13, color:"var(--text-secondary)" }}>Drop file here or <span style={{ color:"#2563eb", fontWeight:600 }}>browse</span></div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>PDF, Word, Excel, PPT — max 10MB</div>
                <input ref={fileRef} type="file" style={{ display:"none" }} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--bg-info-soft)", borderRadius:8, border:"1px solid #bfdbfe" }}>
                <div style={{ fontSize:20 }}>📄</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1d4ed8" }}>{file.name}</div>
                  <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{(file.size/1024).toFixed(0)} KB</div>
                </div>
                <button onClick={() => { setFile(null); if(fileRef.current) fileRef.current.value=""; }}
                  style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-secondary)", fontSize:18, lineHeight:1 }}>×</button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 24px", borderTop:"0.5px solid var(--border-color)", display:"flex", justifyContent:"flex-end", gap:10, position:"sticky", bottom:0, background:"var(--bg-card)" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding:"8px 20px", fontSize:13, background:"#2563eb", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:600 }}>
            {saving ? "Creating..." : "Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Teacher View ─────────────────────────────────────────────── */
function TeacherAssignments() {
  const [showModal,   setShowModal]   = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [allClasses,  setAllClasses]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selAssign,   setSelAssign]   = useState(null);
  const [selClass,    setSelClass]    = useState("");
  const [selSubj,     setSelSubj]     = useState("");
  const [inchargeClasses,    setInchargeClasses]    = useState([]);
  const [inchargeClass,      setInchargeClass]      = useState("");
  const [inchargeAssignments,setInchargeAssignments]= useState([]);
  const [inchargeSubj,       setInchargeSubj]       = useState("");
  const [inchargeAllSubjects,setInchargeAllSubjects]= useState([]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this assignment?")) return;
    try {
      await assignmentsApi.remove(id);
      setAssignments(prev=>prev.filter(a=>a.id!==id));
      setInchargeAssignments(prev=>prev.filter(a=>a.id!==id));
    } catch { alert("Failed to delete."); }
  };

  const loadMyAssignments = () => {
    assignmentsApi.myAssignments().then(r => { setAssignments(r.data.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  };

  useEffect(() => {
    loadMyAssignments();
    diaryApi.getMyClasses().then(r => {
      const cls = r.data.data||[];
      setAllClasses(cls);
      const incharge = cls.filter(c=>c.is_primary);
      setInchargeClasses(incharge);
      if (incharge.length>0) setInchargeClass(String(incharge[0].id));
    }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!inchargeClass) return;
    assignmentsApi.list({ class_id: inchargeClass }).then(r => setInchargeAssignments(r.data.data||[])).catch(()=>{});
    import("../api/academicsApi").then(({ default: aApi }) => {
      aApi.getClassSubjects(inchargeClass).then(r => setInchargeAllSubjects(r.data.data||[])).catch(()=>{});
    });
  }, [inchargeClass]);

  const filtered = assignments.filter(a => {
    if (selClass && String(a.class_id)!==selClass) return false;
    if (selSubj  && String(a.subject_id)!==selSubj) return false;
    return true;
  });
  const classSubjects = selClass
    ? [...new Map(assignments.filter(a=>String(a.class_id)===selClass).map(a=>[a.subject_id,{id:a.subject_id,name:a.subject_name}])).values()]
    : [];
  const filteredIncharge = inchargeAssignments.filter(a => !inchargeSubj || String(a.subject_id)===inchargeSubj);
  // Use all subjects of incharge class, not just those with assignments
  const inchargeSubjects = inchargeAllSubjects.length > 0
    ? inchargeAllSubjects.map(s => ({ id: s.subject_id||s.id, name: s.subject_name }))
    : [...new Map(inchargeAssignments.map(a=>[a.subject_id,{id:a.subject_id,name:a.subject_name}])).values()];

  if (selAssign) return <SubmissionsView assignment={selAssign} onBack={() => setSelAssign(null)} />;

  return (
    <div>
      {showModal && <CreateModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); loadMyAssignments(); }} />}

      <div className="page-header">
        <h1 className="page-heading">Assignments</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Assignment</button>
      </div>

      {/* My Assignments */}
      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
          <span style={{ fontWeight:700, fontSize:15, color:"var(--text-heading)" }}>My Assignments</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <select style={{ height:34, fontSize:12, padding:"0 8px", border:"1px solid var(--border-color)", borderRadius:8, background:"var(--bg-card)", minWidth:140 }} value={selClass} onChange={e=>{setSelClass(e.target.value);setSelSubj("");}}>
              <option value="">All Classes</option>
              {allClasses.map(c=>(
                <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>
              ))}
            </select>
            {selClass && classSubjects.length>0 && (
              <select style={{ height:34, fontSize:12, padding:"0 8px", border:"1px solid var(--border-color)", borderRadius:8, background:"var(--bg-card)", minWidth:140 }} value={selSubj} onChange={e=>setSelSubj(e.target.value)}>
                <option value="">All Subjects</option>
                {classSubjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)", fontWeight:600 }}>{filtered.length}</span>
          </div>
        </div>
        {loading ? <div className="loading-state">Loading...</div> : filtered.length===0 ? (
          <div className="empty-state">No assignments yet. Click <strong>+ New Assignment</strong> to create one.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {filtered.map(a => <AssignmentCard key={a.id} a={a} onView={() => setSelAssign(a)} onDelete={handleDelete} isTeacher />)}
          </div>
        )}
      </div>

      {/* Incharge View */}
      {inchargeClasses.length>0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontWeight:700, fontSize:15, color:"var(--text-heading)" }}>Class Assignments — Incharge View</span>
            {inchargeClasses.length>1 ? (
              <select style={{ height:34, fontSize:12, padding:"0 8px", border:"1px solid var(--border-color)", borderRadius:8, background:"var(--bg-card)", minWidth:160 }}
                value={inchargeClass} onChange={e=>{setInchargeClass(e.target.value);setInchargeSubj("");}}>
                {inchargeClasses.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            ) : inchargeClasses.length===1 && (
              <span style={{ fontSize:13, fontWeight:600, color:"#7c3aed", background:"#f5f3ff", padding:"4px 12px", borderRadius:20 }}>
                {inchargeClasses[0].name}{inchargeClasses[0].section?" ("+inchargeClasses[0].section+")":""}
              </span>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>
            {/* Left: subjects */}
            <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden", alignSelf:"start" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border-color)", background:"var(--bg-hover)" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Subjects</div>
              </div>
              {inchargeSubjects.length===0 ? (
                <div style={{ padding:16, fontSize:12, color:"var(--text-muted)" }}>No subjects found.</div>
              ) : inchargeSubjects.map(s => {
                const count = inchargeAssignments.filter(a=>String(a.subject_id)===String(s.id)).length;
                return (
                  <div key={s.id} onClick={() => setInchargeSubj(String(s.id))}
                    style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid var(--border-color)",
                      borderLeft:"3px solid "+(inchargeSubj===String(s.id)?"#2563eb":"transparent"),
                      background: inchargeSubj===String(s.id)?"var(--bg-info-soft)":"transparent" }}>
                    <div style={{ fontSize:13, fontWeight:inchargeSubj===String(s.id)?700:500,
                      color:inchargeSubj===String(s.id)?"#2563eb":"var(--text-heading)" }}>{s.name}</div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{count} assignment{count!==1?"s":""}</div>
                  </div>
                );
              })}
            </div>

            {/* Right: assignments */}
            <div>
              {!inchargeSubj ? (
                <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, padding:"40px", textAlign:"center", color:"var(--text-muted)" }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>📖</div>
                  <div style={{ fontSize:14 }}>Select a subject to view assignments</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {inchargeAssignments.filter(a=>String(a.subject_id)===inchargeSubj).length===0 ? (
                    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, padding:"30px", textAlign:"center", color:"var(--text-muted)" }}>
                      <div style={{ fontSize:14 }}>No assignments for this subject yet.</div>
                    </div>
                  ) : inchargeAssignments.filter(a=>String(a.subject_id)===inchargeSubj).map(a => (
                    <div key={a.id} style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden", cursor:"pointer" }}
                      onClick={() => setSelAssign(a)}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="#bfdbfe"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border-color)"}>
                      <div style={{ height:3, background:a.is_overdue?"#ef4444":"#2563eb" }} />
                      <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:"var(--text-heading)" }}>{a.title}</div>
                          <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>{a.teacher_name} · Due: {a.due_date} · {a.total_marks} marks</div>
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                            background:a.is_overdue?"var(--bg-danger-soft)":"var(--bg-success-soft)", color:a.is_overdue?"#dc2626":"#16a34a",
                            border:"1px solid "+(a.is_overdue?"#fecaca":"#bbf7d0") }}>
                            {a.is_overdue?"Closed":"Active"}
                          </span>
                          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)" }}>
                            {a.submission_count} submitted
                          </span>
                          <span style={{ fontSize:18, color:"#cbd5e1" }}>›</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Assignment Card ──────────────────────────────────────────── */
function AssignmentCard({ a, onView, onDelete, isTeacher, compact }) {
  const handleDownload = async () => {
    try {
      const res = await fetch(`${API}/assignments/${a.id}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a"); el.href=url; el.download=a.file_name||a.assignment_file||"assignment"; el.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  const accentColor = a.is_overdue ? "#ef4444" : "#2563eb";
  const file = a.file_name || a.assignment_file;

  if (compact) return (
    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:10, padding:"12px 16px",
      borderLeft:"3px solid "+accentColor, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <div style={{ fontWeight:600, fontSize:13, color:"var(--text-heading)" }}>{a.title}</div>
        <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>
          {a.subject_name} · {a.teacher_name} · Due: {a.due_date}
        </div>
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:600,
          background: a.is_overdue?"var(--bg-danger-soft)":"var(--bg-success-soft)", color: a.is_overdue?"#dc2626":"#16a34a",
          border:"1px solid "+(a.is_overdue?"#fecaca":"#bbf7d0") }}>
          {a.is_overdue ? "Closed" : "Active"}
        </span>
        <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)" }}>
          {a.submission_count} submitted
        </span>
        {onView && <button className="btn btn-ghost" style={{ fontSize:12, padding:"4px 12px" }} onClick={onView}>View</button>}
      </div>
    </div>
  );

  return (
    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden" }}>
      {/* Color accent top bar */}
      <div style={{ height:3, background: accentColor }} />
      <div style={{ padding:"16px 18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <div style={{ width:36, height:36, borderRadius:10, background: a.is_overdue?"var(--bg-danger-soft)":"var(--bg-info-soft)",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                📝
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:"var(--text-heading)" }}>{a.title}</div>
                <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
                  {a.class_name}{a.section?" ("+a.section+")":""} · {a.subject_name}
                  {isTeacher && <span> · {a.teacher_name}</span>}
                </div>
              </div>
            </div>

            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                background: a.is_overdue?"var(--bg-danger-soft)":"var(--bg-success-soft)", color: a.is_overdue?"#dc2626":"#16a34a",
                border:"1px solid "+(a.is_overdue?"#fecaca":"#bbf7d0") }}>
                {a.is_overdue ? "Closed" : "Active"}
              </span>
              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)" }}>
                📅 Due {a.due_date}
              </span>
              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-info-soft)", color:"#2563eb", border:"1px solid #bfdbfe" }}>
                {a.total_marks} marks
              </span>
              {isTeacher && (
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)" }}>
                  {a.submission_count}/{a.total_students} submitted
                </span>
              )}
              {isTeacher && a.graded_count>0 && (
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-warning-soft)", color:"#92400e", border:"1px solid #fde68a" }}>
                  {a.graded_count} graded
                </span>
              )}
            </div>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center", marginLeft:16 }}>
            {onView && (
              <button onClick={onView} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", fontSize:12, fontWeight:600,
                background:"var(--bg-info-soft)", border:"1px solid #bfdbfe", borderRadius:8, cursor:"pointer", color:"#2563eb" }}>
                📋 Submissions
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(a.id)} style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center",
                background:"var(--bg-danger-soft)", border:"1px solid #fecaca", borderRadius:8, cursor:"pointer", fontSize:16 }}>
                🗑
              </button>
            )}
          </div>
        </div>

        {file && (
          <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid var(--border-color)" }}>
            <button onClick={handleDownload}
              style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"7px 14px", fontSize:12, fontWeight:600,
                background:"var(--bg-hover)", border:"1px solid var(--border-color)", borderRadius:8, cursor:"pointer", color:"var(--text-secondary)" }}>
              <span>📎</span> {file}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Submissions View ─────────────────────────────────────────── */
function SubmissionsView({ assignment, onBack, readOnly }) {
  const { formatDateTime } = useRegionalSettings();
  const [data,    setData]    = useState({ submissions:[], not_submitted:[] });
  const [loading, setLoading] = useState(true);
  const [forms,   setForms]   = useState({});
  const [saving,  setSaving]  = useState({});
  const [msg,     setMsg]     = useState("");

  useEffect(() => {
    assignmentsApi.getSubmissions(assignment.id)
      .then(r => { setData(r.data.data||{submissions:[],not_submitted:[]}); setLoading(false); })
      .catch(()=>setLoading(false));
  }, [assignment.id]);

  const handleGrade = async (subId) => {
    const f = forms[subId]||{};
    if (!f.marks && f.marks!==0) { alert("Enter marks."); return; }
    setSaving(p=>({...p,[subId]:true}));
    try {
      await assignmentsApi.grade(subId, { marks:parseInt(f.marks), feedback:f.feedback||"" });
      setMsg("Marks saved!");
      setData(prev=>({...prev, submissions:prev.submissions.map(s=>s.id===subId?{...s,marks:parseInt(f.marks),status:"graded"}:s)}));
    } catch { setMsg("Failed."); }
    finally { setSaving(p=>({...p,[subId]:false})); setTimeout(()=>setMsg(""),3000); }
  };

  const handleDownload = async (sub) => {
    try {
      const res = await fetch(`${API}/assignments/submissions/${sub.id}/download`, {
        headers:{ Authorization:`Bearer ${getToken()}` }
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=sub.file_name; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>{assignment.title}</div>
          <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{assignment.class_name}{assignment.section?" ("+assignment.section+")":""} · {assignment.subject_name} · Due: {assignment.due_date} · {assignment.total_marks} marks</div>
        </div>
      </div>

      {msg && <div style={{ background:"var(--bg-success-soft)", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#16a34a" }}>{msg}</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
        {[["Submitted",data.submissions.length,"#2563eb"],["Not Submitted",data.not_submitted.length,"#ef4444"],["Graded",data.submissions.filter(s=>s.marks!==null).length,"#22c55e"]].map(([l,v,c])=>(
          <div key={l} style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderTop:"3px solid "+c, borderRadius:10, padding:"12px", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{l}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="loading-state">Loading...</div> : (
        <>
          <div className="section-card" style={{ marginBottom:12 }}>
            <div className="section-card-header">
              <span className="section-card-title">Submitted ({data.submissions.length})</span>
            </div>
            {data.submissions.length===0 ? <div className="empty-state">No submissions yet.</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {data.submissions.map(sub=>(
                  <div key={sub.id} style={{ border:"1px solid var(--border-color)", borderRadius:10, padding:"14px 16px", background: sub.marks!==null?"var(--bg-success-soft)":"var(--bg-card)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{sub.student_name}</div>
                        <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{sub.enrollment_no} · {formatDateTime(sub.submitted_at)}</div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        {sub.marks!==null && <span className="badge badge-success">{sub.marks}/{assignment.total_marks}</span>}
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={()=>handleDownload(sub)}>⬇ Download</button>
                      </div>
                    </div>
                    {readOnly ? (
                      <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:4 }}>
                        <div style={{ padding:"6px 14px", background: sub.marks!==null?"var(--bg-success-soft)":"var(--bg-hover)",
                          border:"1px solid "+(sub.marks!==null?"#bbf7d0":"var(--border-color)"), borderRadius:8, fontSize:13 }}>
                          {sub.marks!==null
                            ? <span style={{ fontWeight:700, color:"#16a34a" }}>Marks: {sub.marks}/{assignment.total_marks}</span>
                            : <span style={{ color:"var(--text-muted)" }}>Not graded yet</span>}
                        </div>
                        {sub.feedback && <div style={{ fontSize:12, color:"var(--text-secondary)" }}>Feedback: {sub.feedback}</div>}
                      </div>
                    ) : (
                      <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
                        <div className="form-group" style={{ marginBottom:0, width:120 }}>
                          <label className="form-label" style={{ fontSize:11 }}>Marks / {assignment.total_marks}</label>
                          <input type="number" className="form-control" style={{ height:32, fontSize:12 }} min="0" max={assignment.total_marks}
                            value={forms[sub.id]?.marks ?? (sub.marks??"")}
                            onChange={e=>setForms(p=>({...p,[sub.id]:{...p[sub.id],marks:e.target.value}}))} />
                        </div>
                        <div className="form-group" style={{ marginBottom:0, flex:1 }}>
                          <label className="form-label" style={{ fontSize:11 }}>Feedback</label>
                          <input className="form-control" style={{ height:32, fontSize:12 }}
                            value={forms[sub.id]?.feedback ?? (sub.feedback||"")}
                            onChange={e=>setForms(p=>({...p,[sub.id]:{...p[sub.id],feedback:e.target.value}}))}
                            placeholder="Optional feedback..." />
                        </div>
                        <button className="btn btn-primary" style={{ height:32, fontSize:12, padding:"0 14px" }}
                          disabled={saving[sub.id]} onClick={()=>handleGrade(sub.id)}>
                          {saving[sub.id]?"Saving...":"Save Marks"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.not_submitted.length>0 && (
            <div className="section-card">
              <div className="section-card-header"><span className="section-card-title" style={{ color:"#ef4444" }}>Not Submitted ({data.not_submitted.length})</span></div>
              {data.not_submitted.map(s=>(
                <div key={s.student_id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", background:"var(--bg-danger-soft)", borderRadius:8, marginBottom:4, fontSize:13 }}>
                  <span style={{ fontWeight:500 }}>{s.student_name}</span>
                  <span style={{ color:"var(--text-muted)", fontSize:12 }}>{s.enrollment_no}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Student View ─────────────────────────────────────────────── */
function StudentAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState({});
  const [msg,         setMsg]         = useState("");
  const [filter,      setFilter]      = useState("all");
  const fileRefs = useRef({});

  const load = () => assignmentsApi.studentList().then(r=>{setAssignments(r.data.data||[]);setLoading(false);}).catch(()=>setLoading(false));
  useEffect(()=>{ load(); },[]);

  const handleDownloadFile = async (a) => {
    try {
      const res = await fetch(`${API}/assignments/${a.id}/download`, { headers:{Authorization:`Bearer ${getToken()}`} });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a"); el.href=url; el.download=a.file_name||a.assignment_file||"assignment"; el.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  const handleSubmit = async (id) => {
    const file = fileRefs.current[id]?.files[0];
    if (!file) { alert("Please select a file."); return; }
    setSubmitting(p=>({...p,[id]:true}));
    try {
      await submitAssignmentWithFile(id, file);
      setMsg("Assignment submitted successfully!");
      load();
    } catch(e) { setMsg(e.message||"Submission failed."); }
    finally { setSubmitting(p=>({...p,[id]:false})); setTimeout(()=>setMsg(""),4000); }
  };

  const FILTERS = [["all","All"],["active","Active"],["submitted","Submitted"],["graded","Graded"],["closed","Closed"]];
  const visible = assignments.filter(a=>{
    if (filter==="active")    return !a.is_overdue && !a.submission_id;
    if (filter==="submitted") return !!a.submission_id;
    if (filter==="graded")    return a.marks!==null;
    if (filter==="closed")    return a.is_overdue && !a.submission_id;
    return true;
  });

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header"><h1 className="page-heading">Assignments</h1></div>
      {msg && <div style={{ background:"var(--bg-success-soft)", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#16a34a" }}>{msg}</div>}

      <div style={{ display:"flex", gap:2, marginBottom:14, borderBottom:"1px solid var(--border-color)" }}>
        {FILTERS.map(([val,label])=>(
          <button key={val} onClick={()=>setFilter(val)}
            style={{ padding:"6px 16px", fontSize:12, fontWeight:500, border:"none", cursor:"pointer", background:"transparent",
              color:filter===val?"#2563eb":"var(--text-secondary)", borderBottom:filter===val?"2px solid #2563eb":"2px solid transparent", marginBottom:-1 }}>
            {label}
          </button>
        ))}
      </div>

      {visible.length===0 ? <div className="section-card"><div className="empty-state">No assignments found.</div></div> : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {visible.map(a=>(
            <div key={a.id} style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden" }}>
              <div style={{ height:3, background: a.sub_status==="graded"?"#22c55e":a.submission_id?"#7c3aed":a.is_overdue?"#ef4444":"#2563eb" }} />
              <div style={{ padding:"16px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:"var(--bg-info-soft)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>📝</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:"var(--text-heading)" }}>{a.title}</div>
                    <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:2 }}>{a.subject_name} · {a.teacher_name}</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                    background:a.is_overdue?"var(--bg-danger-soft)":"var(--bg-success-soft)", color:a.is_overdue?"#dc2626":"#16a34a",
                    border:"1px solid "+(a.is_overdue?"#fecaca":"#bbf7d0") }}>{a.is_overdue?"Closed":"Active"}</span>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-info-soft)", color:"#2563eb", border:"1px solid #bfdbfe" }}>{a.total_marks} marks</span>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)" }}>📅 {a.due_date}</span>
                </div>
              </div>

              {a.description && <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:10, padding:"10px 12px", background:"var(--bg-hover)", borderRadius:8, lineHeight:1.5 }}>{a.description}</div>}

              {/* Teacher attachment */}
              {a.assignment_file && (
                <div style={{ marginBottom:10 }}>
                  <button onClick={()=>handleDownloadFile(a)}
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"7px 14px", fontSize:12, fontWeight:600,
                      background:"var(--bg-hover)", border:"1px solid var(--border-color)", borderRadius:8, cursor:"pointer", color:"var(--text-secondary)" }}>
                    📎 {a.assignment_file}
                  </button>
                </div>
              )}

              {/* Already submitted */}
              {a.submission_id && (
                <div style={{ padding:"12px 14px", background:a.marks!==null?"var(--bg-success-soft)":"#f5f3ff",
                  borderRadius:8, marginBottom:10, border:"1px solid "+(a.marks!==null?"#bbf7d0":"#ddd6fe") }}>
                  <div style={{ fontSize:13, fontWeight:700, color:a.marks!==null?"#16a34a":"#7c3aed" }}>
                    {a.marks!==null ? `✓ Graded: ${a.marks}/${a.total_marks} marks` : "✓ Submitted — awaiting grading"}
                  </div>
                  {a.feedback && <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>Feedback: {a.feedback}</div>}
                </div>
              )}

              {/* Submit form */}
              {a.can_submit && (
                <div style={{ marginTop:4 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>Upload your assignment</label>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <label style={{ flex:1, display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                      border:"1.5px dashed #cbd5e1", borderRadius:8, cursor:"pointer", background:"var(--bg-hover)" }}>
                      <span style={{ fontSize:16 }}>📎</span>
                      <span id={"lbl-"+a.id} style={{ fontSize:12, color:"var(--text-secondary)" }}>Choose file (PDF, Word, Excel)</span>
                      <input type="file" ref={el=>fileRefs.current[a.id]=el} accept=".pdf,.doc,.docx,.xls,.xlsx"
                        style={{ display:"none" }} onChange={e=>{
                          const el=document.getElementById("lbl-"+a.id);
                          if(el) el.textContent=e.target.files[0]?.name||"Choose file";
                        }} />
                    </label>
                    <button onClick={()=>handleSubmit(a.id)} disabled={submitting[a.id]}
                      style={{ padding:"9px 20px", fontSize:13, fontWeight:600, background:"#2563eb", color:"#fff",
                        border:"none", borderRadius:8, cursor:"pointer", whiteSpace:"nowrap" }}>
                      {submitting[a.id] ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                </div>
              )}

              {a.is_overdue && !a.submission_id && (
                <div style={{ fontSize:12, color:"#ef4444", fontWeight:600, marginTop:8 }}>⚠ Due date passed — submission closed</div>
              )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Parent View ──────────────────────────────────────────────── */
function ParentAssignments() {
  const [children,    setChildren]    = useState([]);
  const [selChild,    setSelChild]    = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selSubject,  setSelSubject]  = useState(null);
  const [selAssign,   setSelAssign]   = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyChildren().then(r => {
        const kids = (r.data.data||[]).filter(k => k.status !== "withdrawn");
        setChildren(kids);
        if (kids.length>0) setSelChild(kids[0]);
      });
    });
  }, []);

  useEffect(() => {
    if (!selChild?.class_id) return;
    setLoading(true);
    setSelSubject(null); setSelAssign(null); setAssignments([]);
    assignmentsApi.list({ class_id: selChild.class_id })
      .then(r => { setAssignments(r.data.data||[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, [selChild]);

  // Group by subject
  const bySubject = assignments.reduce((acc, a) => {
    if (!acc[a.subject_id]) acc[a.subject_id] = { subject_name: a.subject_name, subject_id: a.subject_id, assignments: [] };
    acc[a.subject_id].assignments.push(a);
    return acc;
  }, {});

  const subjectList = Object.values(bySubject);
  const selSubjData = selSubject ? bySubject[selSubject] : null;

  // Get student id for this child
  const studentId = selChild?.id;

  if (selAssign) return <ParentSubmissionView assignment={selAssign} studentId={studentId} onBack={() => setSelAssign(null)} />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Assignments</h1>
        <select className="form-control" style={{ maxWidth:200 }}
          value={selChild?.id||""} onChange={e => { const c=children.find(x=>String(x.id)===e.target.value); setSelChild(c); }}>
          {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </div>

      {selChild && (
        <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>

          {/* Left: subjects */}
          <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden", alignSelf:"start" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border-color)", background:"var(--bg-hover)" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Subjects</div>
            </div>
            {loading ? <div style={{ padding:16, fontSize:12, color:"var(--text-muted)" }}>Loading...</div>
            : subjectList.length===0 ? <div style={{ padding:16, fontSize:12, color:"var(--text-muted)" }}>No assignments yet.</div>
            : subjectList.map(s => (
              <div key={s.subject_id} onClick={() => { setSelSubject(s.subject_id); setSelAssign(null); }}
                style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid var(--border-color)",
                  borderLeft:"3px solid "+(selSubject===s.subject_id?"#2563eb":"transparent"),
                  background: selSubject===s.subject_id?"var(--bg-info-soft)":"transparent" }}>
                <div style={{ fontSize:13, fontWeight: selSubject===s.subject_id?700:500,
                  color: selSubject===s.subject_id?"#2563eb":"var(--text-heading)" }}>{s.subject_name}</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{s.assignments.length} assignment{s.assignments.length!==1?"s":""}</div>
              </div>
            ))}
          </div>

          {/* Right: assignments or detail */}
          <div>
            {!selSubject ? (
              <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, padding:"40px", textAlign:"center", color:"var(--text-muted)" }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📚</div>
                <div style={{ fontSize:14 }}>Select a subject to view assignments</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {selSubjData?.assignments.map(a => (
                  <div key={a.id} onClick={() => setSelAssign(a)}
                    style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden", cursor:"pointer" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#bfdbfe"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border-color)"}>
                    <div style={{ height:3, background: a.is_overdue?"#ef4444":"#2563eb" }} />
                    <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:"var(--text-heading)" }}>{a.title}</div>
                        <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:2 }}>{a.teacher_name} · Due: {a.due_date} · {a.total_marks} marks</div>
                        {a.description && <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:4 }}>{a.description}</div>}
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                          background:a.is_overdue?"var(--bg-danger-soft)":"var(--bg-success-soft)", color:a.is_overdue?"#dc2626":"#16a34a",
                          border:"1px solid "+(a.is_overdue?"#fecaca":"#bbf7d0") }}>
                          {a.is_overdue?"Closed":"Active"}
                        </span>
                        <span style={{ fontSize:18, color:"#cbd5e1" }}>›</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Parent Submission Detail View ────────────────────────────── */
function ParentSubmissionView({ assignment, studentId, onBack }) {
  const { formatDateTime } = useRegionalSettings();
  const [sub,     setSub]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    assignmentsApi.getSubmissions(assignment.id).then(r => {
      const subs = r.data.data?.submissions || [];
      const found = subs.find(s => s.student_id === studentId);
      setSub(found || null);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, [assignment.id, studentId]);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>{assignment.title}</div>
          <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{assignment.subject_name} · Due: {assignment.due_date} · {assignment.total_marks} marks</div>
        </div>
      </div>

      {loading ? <div className="loading-state">Loading...</div> : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* Assignment info */}
          {assignment.description && (
            <div className="section-card">
              <div style={{ fontSize:13, color:"var(--text-secondary)" }}>{assignment.description}</div>
            </div>
          )}

          {/* Submission status */}
          <div className="section-card">
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Submission Status</div>
            {!sub ? (
              <div style={{ padding:"16px", background:"var(--bg-danger-soft)", borderRadius:10, border:"1px solid #fecaca", textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:8 }}>⚠️</div>
                <div style={{ fontWeight:600, color:"#dc2626", fontSize:14 }}>Not Submitted</div>
                <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>
                  {assignment.is_overdue ? "Due date has passed." : `Due: ${assignment.due_date}`}
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ padding:"14px 16px", background:"var(--bg-success-soft)", borderRadius:10, border:"1px solid #bbf7d0" }}>
                  <div style={{ fontWeight:700, color:"#16a34a", fontSize:14, marginBottom:4 }}>✓ Submitted</div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
                    {formatDateTime(sub.submitted_at)}
                  </div>
                </div>

                {/* Marks */}
                <div style={{ padding:"16px", background: sub.marks!==null?"var(--bg-info-soft)":"var(--bg-hover)",
                  borderRadius:10, border:"1px solid "+(sub.marks!==null?"#bfdbfe":"var(--border-color)"), textAlign:"center" }}>
                  {sub.marks!==null ? (
                    <>
                      <div style={{ fontSize:36, fontWeight:800, color:"#2563eb" }}>{sub.marks}<span style={{ fontSize:18, color:"var(--text-muted)" }}>/{assignment.total_marks}</span></div>
                      <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>Marks obtained</div>
                      <div style={{ fontSize:12, color:"#7c3aed", marginTop:4, fontWeight:600 }}>
                        {Math.round(sub.marks/assignment.total_marks*100)}%
                      </div>
                      {sub.feedback && (
                        <div style={{ marginTop:12, padding:"10px 14px", background:"var(--bg-card)", borderRadius:8, fontSize:13, color:"var(--text-secondary)", textAlign:"left" }}>
                          <span style={{ fontWeight:600 }}>Feedback: </span>{sub.feedback}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:24, marginBottom:8 }}>⏳</div>
                      <div style={{ fontWeight:600, color:"var(--text-secondary)" }}>Awaiting grading</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Principal View ───────────────────────────────────────────── */
function PrincipalAssignments() {
  const [classes,     setClasses]     = useState([]);
  const [selClass,    setSelClass]    = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selAssign,   setSelAssign]   = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    import("../api/academicsApi").then(({ default: aApi }) => {
      aApi.getClasses().then(r => setClasses(r.data.data||[])).catch(()=>{});
    });
  }, []);

  useEffect(() => {
    if (!selClass) return;
    setLoading(true);
    assignmentsApi.list({ class_id: selClass.id })
      .then(r => { setAssignments(r.data.data||[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, [selClass]);

  const bySubject = assignments.reduce((acc, a) => {
    if (!acc[a.subject_id]) acc[a.subject_id] = { subject_name: a.subject_name, subject_id: a.subject_id, assignments: [] };
    acc[a.subject_id].assignments.push(a);
    return acc;
  }, {});

  if (selAssign) return <SubmissionsView assignment={selAssign} onBack={() => setSelAssign(null)} readOnly />;

  return (
    <div>
      <div className="page-header"><h1 className="page-heading">Assignments</h1></div>
      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:16 }}>

        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden", alignSelf:"start" }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border-color)", background:"var(--bg-hover)" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Classes</div>
          </div>
          {classes.map(c => (
            <div key={c.id} onClick={() => { setSelClass(c); setAssignments([]); }}
              style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid var(--border-color)",
                borderLeft:"3px solid "+(selClass?.id===c.id?"#2563eb":"transparent"),
                background: selClass?.id===c.id?"var(--bg-info-soft)":"transparent" }}>
              <div style={{ fontSize:13, fontWeight: selClass?.id===c.id?700:500, color: selClass?.id===c.id?"#2563eb":"var(--text-heading)" }}>
                {c.name}{c.section?" ("+c.section+")":""}
              </div>
            </div>
          ))}
        </div>

        <div>
          {!selClass ? (
            <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, padding:"40px", textAlign:"center", color:"var(--text-muted)" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📚</div>
              <div style={{ fontSize:14 }}>Select a class to view assignments</div>
            </div>
          ) : loading ? <div className="loading-state">Loading...</div>
          : Object.keys(bySubject).length===0 ? (
            <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, padding:"40px", textAlign:"center", color:"var(--text-muted)" }}>
              <div style={{ fontSize:14 }}>No assignments for {selClass.name}{selClass.section?" ("+selClass.section+")":""}.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {Object.values(bySubject).map(subj => (
                <div key={subj.subject_id} style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", background:"var(--bg-hover)", borderBottom:"1px solid var(--border-color)", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:"var(--bg-info-soft)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📖</div>
                    <div style={{ fontWeight:700, fontSize:14, color:"var(--text-heading)" }}>{subj.subject_name}</div>
                    <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, background:"#e0e7ff", color:"#3730a3", border:"1px solid #c7d2fe", marginLeft:"auto" }}>
                      {subj.assignments.length} assignment{subj.assignments.length!==1?"s":""}
                    </span>
                  </div>
                  <div>
                    {subj.assignments.map(a => (
                      <div key={a.id} onClick={() => setSelAssign(a)}
                        style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid var(--border-color)",
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          transition:"background 0.1s" }}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--bg-hover)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13, color:"var(--text-heading)" }}>{a.title}</div>
                          <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>Due: {a.due_date} · {a.total_marks} marks · {a.teacher_name}</div>
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                            background:a.is_overdue?"var(--bg-danger-soft)":"var(--bg-success-soft)", color:a.is_overdue?"#dc2626":"#16a34a",
                            border:"1px solid "+(a.is_overdue?"#fecaca":"#bbf7d0") }}>
                            {a.is_overdue?"Closed":"Active"}
                          </span>
                          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"var(--bg-hover)", color:"var(--text-secondary)", border:"1px solid var(--border-color)" }}>
                            {a.submission_count} submitted
                          </span>
                          <span style={{ fontSize:18, color:"#cbd5e1" }}>›</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
