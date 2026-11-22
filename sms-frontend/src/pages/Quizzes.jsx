import { useState, useEffect } from "react";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import quizzesApi from "../api/quizzesApi";
import diaryApi from "../api/diaryApi";
import { useProcessingNow } from "../hooks/useProcessingNow";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./Quizzes.css";

const now = () => new Date().toISOString().slice(0,16);
const isExpired = (due, nowValue) => new Date(due) < (nowValue || new Date());

export default function Quizzes() {
  const { user } = useAuth();
  const role = effectiveRole(user);
  if (role === "student") return <StudentQuizzes />;
  if (role === "parent")  return <ParentQuizzes />;
  if (role === "principal" || role === "admin" || role === "superadmin") return <PrincipalQuizzes />;
  return <TeacherQuizzes />;
}

/* ── Create Quiz Modal ────────────────────────────────────────── */
function CreateQuizModal({ onClose, onCreated }) {
  const processingNow = useProcessingNow();
  const [step,     setStep]     = useState(1); // 1=details, 2=questions
  const [form,     setForm]     = useState({ class_id:"", subject_id:"", title:"", description:"", due_date:"" });
  const [classes,  setClasses]  = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [questions,setQuestions]= useState([
    { question:"", option_a:"", option_b:"", option_c:"", option_d:"", correct:"A", multi_select:false, marks:1 }
  ]);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    diaryApi.getMyClasses().then(r => setClasses(r.data.data||[])).catch(()=>{});
  }, []);
  useEffect(() => {
    if (!form.class_id) return;
    diaryApi.getMySubjects({ class_id: form.class_id }).then(r => setSubjects(r.data.data||[])).catch(()=>{});
  }, [form.class_id]);

  const addQuestion = () => setQuestions(prev => [...prev,
    { question:"", option_a:"", option_b:"", option_c:"", option_d:"", correct:"A", multi_select:false, marks:1 }
  ]);

  const updateQ = (i, field, val) => setQuestions(prev => prev.map((q,idx) => idx===i ? {...q,[field]:val} : q));
  const removeQ = (i) => { if (questions.length>1) setQuestions(prev => prev.filter((_,idx)=>idx!==i)); };

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      for (const q of questions) {
        if (!q.question||!q.option_a||!q.option_b) { setErr("All questions need text and at least options A and B."); setSaving(false); return; }
      }
      await quizzesApi.create({ ...form, questions,
        class_id: parseInt(form.class_id), subject_id: parseInt(form.subject_id) });
      onCreated();
    } catch(e) { setErr(e.response?.data?.message||"Failed to create quiz."); }
    finally { setSaving(false); }
  };

  const totalMarks = questions.reduce((s,q) => s+parseInt(q.marks||1), 0);

  return (
    <div className="qz-modal-overlay">
      <div className="qz-modal-box">
        {/* Header */}
        <div className="qz-modal-header-round">
          <div>
            <div className="qz-modal-title">Create Quiz</div>
            <div className="qz-modal-subtitle">
              Step {step} of 2 — {step===1?"Quiz Details":"Questions ("+questions.length+" questions · "+totalMarks+" marks)"}
            </div>
          </div>
          <button onClick={onClose} className="qz-modal-close-btn">×</button>
        </div>

        {/* Step 1: Details */}
        {step===1 && (
          <div className="qz-form-body">
            {err && <div className="qz-err-box">{err}</div>}
            <div className="qz-form-grid-2col">
              <div>
                <label className="qz-field-label">Class *</label>
                <select className="form-control" value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value,subject_id:""})}>
                  <option value="">Select class</option>
                  {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
                </select>
              </div>
              <div>
                <label className="qz-field-label">Subject *</label>
                <select className="form-control" value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} disabled={!form.class_id}>
                  <option value="">Select subject</option>
                  {subjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="qz-field-label">Title *</label>
              <input className="form-control" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Chapter 3 Quiz" />
            </div>
            <div>
              <label className="qz-field-label">Instructions</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Quiz instructions..." style={{ resize:"vertical" }} />
            </div>
            <div>
              <label className="qz-field-label">Due Date & Time *</label>
              <input type="datetime-local" className="form-control" value={form.due_date} min={processingNow.toISOString().slice(0,16)} onChange={e=>setForm({...form,due_date:e.target.value})} />
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => {
                if (!form.class_id||!form.subject_id||!form.title||!form.due_date) { setErr("Fill all required fields."); return; }
                setErr(""); setStep(2);
              }} className="qz-next-btn">
                Next: Add Questions →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Questions */}
        {step===2 && (
          <div className="qz-form-body-flat">
            {err && <div className="qz-err-box" style={{ marginBottom:14 }}>{err}</div>}

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {questions.map((q, i) => (
                <div key={i} className="qz-question-card">
                  <div className="qz-question-header-row">
                    <div className="qz-question-title">Question {i+1}</div>
                    <div className="qz-question-actions">
                      <label className="qz-multi-label">
                        <input type="checkbox" checked={q.multi_select} onChange={e=>updateQ(i,"multi_select",e.target.checked)} />
                        Multiple correct answers
                      </label>
                      <div className="qz-marks-field">
                        <label className="qz-marks-field-label">Marks:</label>
                        <input type="number" min="1" value={q.marks} onChange={e=>updateQ(i,"marks",e.target.value)}
                          className="qz-marks-input" />
                      </div>
                      {questions.length>1 && (
                        <button onClick={()=>removeQ(i)} className="qz-remove-q-btn">×</button>
                      )}
                    </div>
                  </div>

                  <textarea className="form-control" rows={2} value={q.question} onChange={e=>updateQ(i,"question",e.target.value)}
                    placeholder="Enter your question..." style={{ marginBottom:12, resize:"vertical" }} />

                  <div className="qz-option-grid">
                    {["A","B","C","D"].map(opt => (
                      <div key={opt}>
                        <div className="qz-option-label-row">
                          {q.multi_select ? (
                            <input type="checkbox"
                              checked={(q.correct||"").split(",").includes(opt)}
                              onChange={e => {
                                const curr = (q.correct||"").split(",").filter(Boolean);
                                const next = e.target.checked ? [...curr,opt] : curr.filter(x=>x!==opt);
                                updateQ(i,"correct",next.join(","));
                              }} />
                          ) : (
                            <input type="radio" name={`q${i}`} value={opt} checked={q.correct===opt}
                              onChange={()=>updateQ(i,"correct",opt)} />
                          )}
                          <label className="qz-option-label">Option {opt}</label>
                          {(opt==="A"||opt==="B") && <span className="qz-required-star">*</span>}
                        </div>
                        <input className="form-control" style={{ fontSize:12 }}
                          value={q["option_"+opt.toLowerCase()]||""}
                          onChange={e=>updateQ(i,"option_"+opt.toLowerCase(),e.target.value)}
                          placeholder={opt==="C"||opt==="D"?"Optional":"Option "+opt+" *"} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="qz-footer-row">
              <button onClick={addQuestion} className="qz-add-question-btn">
                + Add Question
              </button>
              <div className="qz-btn-group">
                <button onClick={()=>setStep(1)} className="qz-back-btn">
                  ← Back
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="qz-create-btn">
                  {saving ? "Creating..." : `Create Quiz (${questions.length}Q · ${totalMarks} marks)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Quiz Card ────────────────────────────────────────────────── */
function QuizCard({ q, onClick, onDelete, isTeacher }) {
  const processingNow = useProcessingNow();
  const { formatDateTime } = useRegionalSettings();
  const expired = isExpired(q.due_date, processingNow);
  return (
    <div className="qz-card"
      onClick={onClick}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#bfdbfe"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border-color)"}>
      <div className="qz-card-accent-bar" style={{ "--accent-color": expired?"#ef4444":"#7c3aed" }} />
      <div className="qz-card-body">
        <div style={{ flex:1 }}>
          <div className="qz-card-top-row">
            <div className="qz-card-icon">📋</div>
            <div>
              <div className="qz-card-title">{q.title}</div>
              <div className="qz-card-subtitle">
                {q.class_name}{q.section?" ("+q.section+")":""} · {q.subject_name}
                {isTeacher && <span> · {q.teacher_name}</span>}
              </div>
            </div>
          </div>
          <div className="qz-tag-row">
            <span className="qz-status-tag" style={{ "--tag-bg": expired?"var(--bg-danger-soft)":"rgba(124,58,237,0.12)", "--tag-color": expired?"#dc2626":"#7c3aed", "--tag-border": expired?"#fecaca":"#ddd6fe" }}>
              {expired?"Expired":"Active"}
            </span>
            <span className="qz-count-tag">
              {q.question_count} questions
            </span>
            <span className="qz-marks-tag">
              {q.total_marks} marks
            </span>
            {isTeacher && (
              <span className="qz-count-tag">
                {q.submission_count} submitted
              </span>
            )}
            <span className="qz-due-tag">
              📅 Due {formatDateTime(q.due_date)}
            </span>
          </div>
        </div>
        <div className="qz-card-actions">
          {onDelete && (
            <button onClick={e=>{ e.stopPropagation(); onDelete(q.id); }}
              className="qz-delete-btn">
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Teacher View ─────────────────────────────────────────────── */
function TeacherQuizzes() {
  const [showModal,   setShowModal]   = useState(false);
  const [quizzes,     setQuizzes]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selQuiz,     setSelQuiz]     = useState(null);
  const [inchargeClasses,    setInchargeClasses]    = useState([]);
  const [inchargeClass,      setInchargeClass]      = useState("");
  const [inchargeQuizzes,    setInchargeQuizzes]    = useState([]);
  const [inchargeSubj,       setInchargeSubj]       = useState("");
  const [inchargeAllSubjects,setInchargeAllSubjects]= useState([]);
  const [allClasses,  setAllClasses]  = useState([]);

  const load = () => quizzesApi.myQuizzes().then(r=>{setQuizzes(r.data.data||[]);setLoading(false);}).catch(()=>setLoading(false));
  useEffect(()=>{
    load();
    diaryApi.getMyClasses().then(r=>{
      const cls=r.data.data||[];
      setAllClasses(cls);
      const inc=cls.filter(c=>c.is_primary);
      setInchargeClasses(inc);
      if(inc.length>0) setInchargeClass(String(inc[0].id));
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(!inchargeClass) return;
    quizzesApi.list({class_id:inchargeClass}).then(r=>setInchargeQuizzes(r.data.data||[])).catch(()=>{});
    import("../api/academicsApi").then(({default:aApi})=>{
      aApi.getClassSubjects(inchargeClass).then(r=>setInchargeAllSubjects(r.data.data||[])).catch(()=>{});
    });
  },[inchargeClass]);

  const handleDelete = async (id) => {
    if(!window.confirm("Delete this quiz?")) return;
    await quizzesApi.remove(id);
    setQuizzes(p=>p.filter(q=>q.id!==id));
    setInchargeQuizzes(p=>p.filter(q=>q.id!==id));
  };

  const inchargeSubjects = inchargeAllSubjects.length>0
    ? inchargeAllSubjects.map(s=>({id:s.subject_id||s.id,name:s.subject_name}))
    : [...new Map(inchargeQuizzes.map(q=>[q.subject_id,{id:q.subject_id,name:q.subject_name}])).values()];

  if (selQuiz) return <QuizResults quiz={selQuiz} onBack={()=>setSelQuiz(null)} />;

  return (
    <div>
      {showModal && <CreateQuizModal onClose={()=>setShowModal(false)} onCreated={()=>{setShowModal(false);load();}} />}
      <div className="page-header">
        <h1 className="page-heading">Quizzes</h1>
        <button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ New Quiz</button>
      </div>

      {/* My Quizzes */}
      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="qz-section-title">My Quizzes</div>
        {loading?<div className="loading-state">Loading...</div>:quizzes.length===0?(
          <div className="empty-state">No quizzes yet. Click + New Quiz to create one.</div>
        ):(
          <div className="qz-list-stack">
            {quizzes.map(q=><QuizCard key={q.id} q={q} onClick={()=>setSelQuiz(q)} onDelete={handleDelete} isTeacher />)}
          </div>
        )}
      </div>

      {/* Incharge View */}
      {inchargeClasses.length>0 && (
        <div>
          <div className="qz-incharge-header-row">
            <span className="qz-section-title" style={{ marginBottom:0 }}>Class Quizzes — Incharge View</span>
            {inchargeClasses.length>1 ? (
              <select className="qz-incharge-select"
                value={inchargeClass} onChange={e=>{setInchargeClass(e.target.value);setInchargeSubj("");}}>
                {inchargeClasses.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            ) : inchargeClasses.length===1 && (
              <span className="qz-incharge-badge">
                {inchargeClasses[0].name}{inchargeClasses[0].section?" ("+inchargeClasses[0].section+")":""}
              </span>
            )}
          </div>
          <div className="qz-two-col-grid">
            <div className="qz-sidebar">
              <div className="qz-sidebar-header">
                <div className="qz-sidebar-title">Subjects</div>
              </div>
              {inchargeSubjects.map(s=>{
                const cnt=inchargeQuizzes.filter(q=>String(q.subject_id)===String(s.id)).length;
                return (
                  <div key={s.id} onClick={()=>setInchargeSubj(String(s.id))}
                    className="qz-sidebar-item"
                    style={{ "--item-border": inchargeSubj===String(s.id)?"#7c3aed":"transparent", "--item-bg": inchargeSubj===String(s.id)?"rgba(124,58,237,0.12)":"transparent" }}>
                    <div className="qz-sidebar-item-name" style={{ "--name-weight": inchargeSubj===String(s.id)?700:500, "--name-color": inchargeSubj===String(s.id)?"#7c3aed":"var(--text-heading)" }}>{s.name}</div>
                    <div className="qz-sidebar-item-count">{cnt} quiz{cnt!==1?"zes":""}</div>
                  </div>
                );
              })}
            </div>
            <div>
              {!inchargeSubj?(
                <div className="qz-empty-panel">
                  <div className="qz-empty-panel-icon">📋</div>
                  <div style={{ fontSize:14 }}>Select a subject to view quizzes</div>
                </div>
              ):(
                <div className="qz-list-stack">
                  {inchargeQuizzes.filter(q=>String(q.subject_id)===inchargeSubj).length===0?(
                    <div className="qz-empty-panel-sm">
                      No quizzes for this subject.
                    </div>
                  ):inchargeQuizzes.filter(q=>String(q.subject_id)===inchargeSubj).map(q=>(
                    <QuizCard key={q.id} q={q} onClick={()=>setSelQuiz(q)} isTeacher />
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

/* ── Quiz Results (teacher/principal) ─────────────────────────── */
function QuizResults({ quiz, onBack, readOnly }) {
  const { formatDateTime } = useRegionalSettings();
  const [data,    setData]    = useState({ submitted:[], not_submitted:[] });
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    quizzesApi.results(quiz.id).then(r=>{setData(r.data.data||{submitted:[],not_submitted:[]});setLoading(false);}).catch(()=>setLoading(false));
  },[quiz.id]);

  const avg = data.submitted.length>0 ? Math.round(data.submitted.reduce((s,r)=>s+Number(r.marks),0)/data.submitted.length) : 0;

  return (
    <div>
      <div className="qz-results-header-row">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <div>
          <div className="qz-results-title">{quiz.title}</div>
          <div className="qz-results-subtitle">{quiz.class_name}{quiz.section?" ("+quiz.section+")":""} · {quiz.subject_name} · {quiz.total_marks} marks · {quiz.question_count} questions</div>
        </div>
      </div>

      <div className="qz-stats-grid-4">
        {[["Submitted",data.submitted.length,"#7c3aed"],["Not Submitted",data.not_submitted.length,"#ef4444"],
          ["Avg Score",avg+"/"+quiz.total_marks,"#2563eb"],["Avg %",data.submitted.length>0?Math.round(data.submitted.reduce((s,r)=>s+Number(r.percentage),0)/data.submitted.length)+"%":"0%","#22c55e"]
        ].map(([l,v,c])=>(
          <div key={l} className="qz-stat-card" style={{ "--stat-color": c }}>
            <div className="qz-stat-value">{v}</div>
            <div className="qz-stat-label">{l}</div>
          </div>
        ))}
      </div>

      <div className="section-card" style={{ marginBottom:12 }}>
        <div className="qz-subsection-title">Submitted ({data.submitted.length})</div>
        {loading?<div className="loading-state">Loading...</div>:data.submitted.length===0?(
          <div className="empty-state">No submissions yet.</div>
        ):(
          <table className="qz-table">
            <thead>
              <tr className="qz-th-row">
                {["#","Student","Enrollment","Marks","Percentage","Submitted At"].map(h=>(
                  <th key={h} className="qz-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.submitted.map((r,i)=>(
                <tr key={r.id} className="qz-tr">
                  <td className="qz-td-muted">{i+1}</td>
                  <td className="qz-td" style={{fontWeight:600}}>{r.student_name}</td>
                  <td className="qz-td-muted-sm">{r.enrollment_no}</td>
                  <td className="qz-td">
                    <span className="qz-marks-result" style={{ "--result-color": Number(r.marks)>=quiz.total_marks*0.5?"#16a34a":"#dc2626" }}>
                      {r.marks}/{quiz.total_marks}
                    </span>
                  </td>
                  <td className="qz-td">
                    <div className="qz-progress-row">
                      <div className="qz-progress-track">
                        <div className="qz-progress-fill" style={{ "--fill-color": Number(r.percentage)>=75?"#22c55e":Number(r.percentage)>=50?"#f59e0b":"#ef4444", "--fill-width": r.percentage+"%" }} />
                      </div>
                      <span className="qz-progress-pct">{Math.round(r.percentage)}%</span>
                    </div>
                  </td>
                  <td className="qz-td-muted-sm">
                    {formatDateTime(r.submitted_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data.not_submitted.length>0 && (
        <div className="section-card">
          <div className="qz-subsection-title-danger">Not Submitted ({data.not_submitted.length})</div>
          {data.not_submitted.map(s=>(
            <div key={s.student_id} className="qz-not-submitted-row">
              <span style={{ fontWeight:500 }}>{s.student_name}</span>
              <span style={{ color:"var(--text-muted)", fontSize:12 }}>{s.enrollment_no}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Student View ─────────────────────────────────────────────── */
function StudentQuizzes() {
  const { formatDateTime } = useRegionalSettings();
  const [quizzes,  setQuizzes]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selQuiz,  setSelQuiz]  = useState(null);
  const [filter,   setFilter]   = useState("all");

  const load = () => {
    import("../api/studentsApi").then(({default:sApi})=>{
      sApi.getMyProfile().then(r=>{
        const p=r.data.data;
        if(!p?.class_id){setLoading(false);return;}
        quizzesApi.list({class_id:p.class_id}).then(r2=>{setQuizzes(r2.data.data||[]);setLoading(false);}).catch(()=>setLoading(false));
      }).catch(()=>setLoading(false));
    });
  };
  useEffect(()=>load(),[]);

  if (selQuiz) return <AttemptQuiz quiz={selQuiz} onBack={()=>{setSelQuiz(null);load();}} />;

  const FILTERS=[["all","All"],["active","Active"],["attempted","Attempted"],["expired","Expired"]];
  const visible = quizzes.filter(q=>{
    if(filter==="active")   return !q.is_expired && !q.my_submission;
    if(filter==="attempted")return !!q.my_submission;
    if(filter==="expired")  return q.is_expired && !q.my_submission;
    return true;
  });

  return (
    <div>
      <div className="page-header"><h1 className="page-heading">Quizzes</h1></div>
      <div className="qz-filter-tabs">
        {FILTERS.map(([val,label])=>(
          <button key={val} onClick={()=>setFilter(val)}
            className="qz-filter-tab"
            style={{ "--tab-color": filter===val?"#7c3aed":"var(--text-secondary)", "--tab-border": filter===val?"2px solid #7c3aed":"2px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>
      {loading?<div className="loading-state">Loading...</div>:visible.length===0?(
        <div className="section-card"><div className="empty-state">No quizzes found.</div></div>
      ):(
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {visible.map(q=>(
            <div key={q.id} className="qz-card-static">
              <div className="qz-card-accent-bar" style={{ "--accent-color": q.is_expired?"#ef4444":"#7c3aed" }} />
              <div className="qz-card-body-pad">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:10 }}>
                    <div className="qz-card-icon">📋</div>
                    <div>
                      <div className="qz-card-title">{q.title}</div>
                      <div className="qz-card-subtitle">{q.subject_name} · {q.teacher_name}</div>
                    </div>
                  </div>
                  <span className="qz-status-tag" style={{ "--tag-bg": q.is_expired?"var(--bg-danger-soft)":"rgba(124,58,237,0.12)", "--tag-color": q.is_expired?"#dc2626":"#7c3aed", "--tag-border": q.is_expired?"#fecaca":"#ddd6fe" }}>
                    {q.is_expired?"Expired":"Active"}
                  </span>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  <span className="qz-count-tag">{q.question_count} questions</span>
                  <span className="qz-marks-tag">{q.total_marks} marks</span>
                  <span className="qz-due-tag">
                    Due: {formatDateTime(q.due_date)}
                  </span>
                </div>
                {q.my_submission ? (
                  <div className="qz-completed-box">
                    <div>
                      <div className="qz-completed-label">✓ Completed</div>
                      <div className="qz-completed-sub">
                        Submitted: {formatDateTime(q.my_submission.submitted_at)}
                      </div>
                    </div>
                    <div className="qz-score-group">
                      <div className="qz-score-value-wrap">
                        <div className="qz-score-value">
                          {q.my_submission.marks}<span className="qz-score-total">/{q.total_marks}</span>
                        </div>
                        <div className="qz-score-pct">{Math.round(q.my_submission.percentage)}%</div>
                      </div>
                      <button onClick={()=>setSelQuiz(q)} className="qz-view-result-btn">
                        View Result
                      </button>
                    </div>
                  </div>
                ) : q.is_expired ? (
                  <div className="qz-expired-box">
                    ⚠ Quiz expired — not submitted
                  </div>
                ) : (
                  <button onClick={()=>setSelQuiz(q)} className="qz-start-btn">
                    Start Quiz →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Attempt Quiz Modal ──────────────────────────────────────── */
function AttemptQuiz({ quiz, onBack }) {
  const [quizData,  setQuizData]  = useState(null);
  const [answers,   setAnswers]   = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [submitting,setSubmitting]= useState(false);
  const [err,       setErr]       = useState("");
  const [current,   setCurrent]   = useState(0);

  useEffect(()=>{
    quizzesApi.get(quiz.id).then(r=>{
      setQuizData(r.data.data);
      if(r.data.data?.submission){ setSubmitted(true); setResult(r.data.data.submission); }
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[quiz.id]);

  const handleAnswer = (qid, opt, multi) => {
    if(multi){
      const curr=answers[qid]||[];
      const next=curr.includes(opt)?curr.filter(x=>x!==opt):[...curr,opt];
      setAnswers(p=>({...p,[qid]:next}));
    } else {
      setAnswers(p=>({...p,[qid]:opt}));
    }
  };

  const handleSubmit = async () => {
    if(!quizData) return;
    const unanswered=quizData.questions.filter(q=>!answers[q.id]||(Array.isArray(answers[q.id])&&answers[q.id].length===0));
    if(unanswered.length>0 && !window.confirm(`${unanswered.length} question(s) unanswered. Submit anyway?`)) return;
    setSubmitting(true); setErr("");
    try {
      const res=await quizzesApi.submit(quiz.id,{answers});
      setResult(res.data.data);
      // Re-fetch quiz to get correct answers for review
      const qRes = await quizzesApi.get(quiz.id);
      setQuizData(qRes.data.data);
      setSubmitted(true);
      setCurrent(0);
    } catch(e){ setErr(e.response?.data?.message||"Failed to submit."); }
    finally{ setSubmitting(false); }
  };

  const questions = quizData?.questions || [];
  const q = questions[current];
  const answered = Object.keys(answers).length;
  const progress = questions.length > 0 ? Math.round(answered/questions.length*100) : 0;

  return (
    <div className="qz-modal-overlay-dark">
      <div className="qz-modal-box-round">

        {/* Header */}
        <div className="qz-modal-header-plain">
          <div className="qz-attempt-header-row">
            <div>
              <div className="qz-modal-title-sm">{quizData?.title||quiz.title}</div>
              <div className="qz-modal-subtitle">{quizData?.subject_name} · {quizData?.total_marks} marks · {questions.length} questions</div>
            </div>
            {!submitted && (
              <div className="qz-attempt-progress-wrap">
                <div className="qz-attempt-progress-text">{answered}/{questions.length} answered</div>
                <div className="qz-attempt-progress-pct">{progress}% complete</div>
              </div>
            )}
            {submitted && (
              <button onClick={onBack} className="qz-attempt-close-btn">
                Close
              </button>
            )}
          </div>
          {!submitted && (
            <div className="qz-attempt-progress-track">
              <div className="qz-attempt-progress-fill" style={{ "--fill-width": progress+"%" }} />
            </div>
          )}
        </div>

        <div style={{ padding:"20px 24px", flex:1 }}>

          {loading && <div className="loading-state">Loading quiz...</div>}

          {/* Result screen */}
          {submitted && result && (
            <div>
              <div className="qz-result-screen-top">
                <div className="qz-result-emoji">{result.percentage>=80?"🏆":result.percentage>=60?"🎯":result.percentage>=40?"📝":"📚"}</div>
                <div className="qz-result-score">
                  {result.marks}<span className="qz-result-score-total">/{quizData?.total_marks}</span>
                </div>
                <div className="qz-result-pct">
                  {Math.round(result.percentage)}%
                </div>
                <div className="qz-result-message">
                  {result.percentage>=80?"Excellent work! 🎉":result.percentage>=60?"Good job! Keep it up.":result.percentage>=40?"Not bad. Review the topics.":"Keep studying. You can do better!"}
                </div>
              </div>

              {/* Question review */}
              <div className="qz-review-section">
                <div className="qz-review-title">Review Answers</div>
                <div className="qz-review-stack">
                  {questions.map((q,i)=>{
                    // Use saved answers from submission (after re-fetch) or local state
                    const submission = quizData?.submission;
                    const savedAns = submission?.answers?.[String(q.id)] ?? submission?.answers?.[q.id] ?? answers[q.id];
                    const ans = savedAns ?? (q.multi_select?[]:"");
                    const ansArr = Array.isArray(ans) ? ans : (ans ? String(ans).split(",").filter(Boolean) : []);
                    const correctArr = q.correct ? q.correct.split(",").map(x=>x.trim()) : [];
                    const isCorrect = q.correct ? (q.multi_select
                      ? JSON.stringify(ansArr.slice().sort()) === JSON.stringify(correctArr.slice().sort())
                      : String(ans).trim().toUpperCase() === q.correct.trim().toUpperCase()) : false;
                    return (
                      <div key={q.id} className="qz-review-card" style={{ "--review-border": isCorrect?"#bbf7d0":"#fecaca", "--review-accent": isCorrect?"#22c55e":"#ef4444", "--review-bg": isCorrect?"var(--bg-success-soft)":"var(--bg-danger-soft)" }}>
                        <div className="qz-review-top-row">
                          <div className="qz-review-question">Q{i+1}. {q.question}</div>
                          <span className="qz-review-marks" style={{ "--marks-color": isCorrect?"#16a34a":"#dc2626" }}>
                            {isCorrect?"✓ +"+q.marks+" marks":"✗ 0 marks"}
                          </span>
                        </div>
                        <div className="qz-review-answer-text">
                          Your answer: <strong>{ansArr.length>0?ansArr.join(", "):"—"}</strong>
                          {!isCorrect && q.correct && <span className="qz-review-correct-note"> · Correct: <strong>{q.correct}</strong></span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Quiz attempt */}
          {!submitted && !loading && q && (
            <div>
              {/* Question navigator */}
              <div className="qz-nav-grid">
                {questions.map((_,i)=>{
                  const isAns=answers[questions[i].id]&&(Array.isArray(answers[questions[i].id])?answers[questions[i].id].length>0:true);
                  return (
                    <button key={i} onClick={()=>setCurrent(i)}
                      className="qz-nav-btn"
                      style={{ "--nav-border": i===current?"#7c3aed":isAns?"#22c55e":"var(--border-color)", "--nav-bg": i===current?"#7c3aed":isAns?"var(--bg-success-soft)":"var(--bg-hover)", "--nav-color": i===current?"#fff":isAns?"#16a34a":"var(--text-secondary)" }}>
                      {i+1}
                    </button>
                  );
                })}
              </div>

              {err && <div className="qz-err-box" style={{ marginBottom:14 }}>{err}</div>}

              {/* Current question */}
              <div className="qz-question-box">
                <div className="qz-question-top-row">
                  <div className="qz-question-text">
                    <span className="qz-question-num">Q{current+1}.</span>{q.question}
                  </div>
                  <div className="qz-question-tags">
                    <span className="qz-marks-tag-small">
                      {q.marks} mark{q.marks!==1?"s":""}
                    </span>
                    {q.multi_select && <span className="qz-multiselect-tag">Multi-select</span>}
                  </div>
                </div>

                <div className="qz-options-stack">
                  {["A","B","C","D"].filter(opt=>q["option_"+opt.toLowerCase()]).map(opt=>{
                    const ans=answers[q.id]||(q.multi_select?[]:"");
                    const isSelected=q.multi_select?(Array.isArray(ans)&&ans.includes(opt)):ans===opt;
                    return (
                      <div key={opt} onClick={()=>handleAnswer(q.id,opt,q.multi_select)}
                        className="qz-option-item"
                        style={{ "--option-border": isSelected?"#7c3aed":"var(--border-color)", "--option-bg": isSelected?"rgba(124,58,237,0.12)":"var(--bg-card)" }}>
                        <div className="qz-option-radio"
                          style={{ "--radio-radius": q.multi_select?"6px":"50%", "--radio-border": isSelected?"#7c3aed":"#cbd5e1", "--radio-bg": isSelected?"#7c3aed":"transparent" }}>
                          {isSelected && <div className="qz-option-radio-dot" style={{ "--dot-radius": q.multi_select?"2px":"50%" }} />}
                        </div>
                        <div>
                          <span className="qz-option-letter">{opt}.</span>
                          <span className="qz-option-text" style={{ "--option-text-color": isSelected?"#7c3aed":"var(--text-heading)", "--option-text-weight": isSelected?600:400 }}>
                            {q["option_"+opt.toLowerCase()]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div className="qz-nav-footer">
                <button onClick={()=>setCurrent(p=>Math.max(0,p-1))} disabled={current===0}
                  className="qz-prev-btn"
                  style={{ "--prev-cursor": current===0?"not-allowed":"pointer", "--prev-opacity": current===0?0.5:1 }}>
                  ← Previous
                </button>
                {current < questions.length-1 ? (
                  <button onClick={()=>setCurrent(p=>p+1)}
                    className="qz-next-q-btn">
                    Next →
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={submitting}
                    className="qz-submit-btn">
                    {submitting?"Submitting...":"Submit Quiz ✓"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Parent View ──────────────────────────────────────────────── */
function ParentQuizzes() {
  const [children,  setChildren]  = useState([]);
  const [selChild,  setSelChild]  = useState(null);
  const [quizzes,   setQuizzes]   = useState([]);
  const [selSubject,setSelSubject]= useState(null);
  const [selQuiz,   setSelQuiz]   = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(()=>{
    import("../api/studentsApi").then(m=>{
      m.default.getMyChildren().then(r=>{
        const kids=(r.data.data||[]).filter(k=>k.status!=="withdrawn");
        setChildren(kids);
        if(kids.length>0) setSelChild(kids[0]);
      });
    });
  },[]);

  useEffect(()=>{
    if(!selChild?.class_id) return;
    setLoading(true); setSelSubject(null); setQuizzes([]);
    quizzesApi.list({class_id:selChild.class_id}).then(r=>{setQuizzes(r.data.data||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[selChild]);

  const bySubject = quizzes.reduce((acc,q)=>{
    if(!acc[q.subject_id]) acc[q.subject_id]={subject_name:q.subject_name,subject_id:q.subject_id,quizzes:[]};
    acc[q.subject_id].quizzes.push(q);
    return acc;
  },{});

  if(selQuiz) return <ParentQuizResult quiz={selQuiz} studentId={selChild?.id} onBack={()=>setSelQuiz(null)} />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Quizzes</h1>
        <select className="form-control" style={{ maxWidth:200 }}
          value={selChild?.id||""} onChange={e=>{const c=children.find(x=>String(x.id)===e.target.value);setSelChild(c);}}>
          {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </div>
      {selChild && (
        <div className="qz-two-col-grid">
          <div className="qz-sidebar">
            <div className="qz-sidebar-header">
              <div className="qz-sidebar-title">Subjects</div>
            </div>
            {loading?<div className="qz-sidebar-loading">Loading...</div>
            :Object.values(bySubject).map(s=>(
              <div key={s.subject_id} onClick={()=>setSelSubject(s.subject_id)}
                className="qz-sidebar-item"
                style={{ "--item-border": selSubject===s.subject_id?"#7c3aed":"transparent", "--item-bg": selSubject===s.subject_id?"rgba(124,58,237,0.12)":"transparent" }}>
                <div className="qz-sidebar-item-name" style={{ "--name-weight": selSubject===s.subject_id?700:500, "--name-color": selSubject===s.subject_id?"#7c3aed":"var(--text-heading)" }}>{s.subject_name}</div>
                <div className="qz-sidebar-item-count">{s.quizzes.length} quiz{s.quizzes.length!==1?"zes":""}</div>
              </div>
            ))}
          </div>
          <div>
            {!selSubject?(
              <div className="qz-empty-panel">
                <div className="qz-empty-panel-icon">📋</div>
                <div style={{ fontSize:14 }}>Select a subject to view quizzes</div>
              </div>
            ):(
              <div className="qz-list-stack">
                {bySubject[selSubject]?.quizzes.map(q=>(
                  <QuizCard key={q.id} q={q} onClick={()=>setSelQuiz(q)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Parent Quiz Result ──────────────────────────────────────── */
function ParentQuizResult({ quiz, studentId, onBack }) {
  const processingNow = useProcessingNow();
  const { formatDateTime } = useRegionalSettings();
  const [quizData, setQuizData] = useState(null);
  const [sub,      setSub]      = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(()=>{
    Promise.all([
      quizzesApi.get(quiz.id),
      quizzesApi.results(quiz.id)
    ]).then(([qRes, rRes]) => {
      setQuizData(qRes.data.data);
      const subs = rRes.data.data?.submitted || [];
      setSub(subs.find(s=>s.student_id===studentId)||null);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[quiz.id, studentId]);

  return (
    <div className="qz-modal-overlay-dark">
      <div className="qz-modal-box-round-sm">

        {/* Header */}
        <div className="qz-modal-header-round">
          <div>
            <div className="qz-modal-title-sm">{quiz.title}</div>
            <div className="qz-modal-subtitle">{quiz.subject_name} · {quiz.total_marks} marks · {quiz.question_count} questions</div>
          </div>
          <button onClick={onBack} className="qz-modal-close-btn">×</button>
        </div>

        <div style={{ padding:"20px 24px" }}>
          {loading ? <div className="loading-state">Loading...</div> : !sub ? (
            <div className="qz-not-submitted-banner">
              <div className="qz-not-submitted-icon">⚠️</div>
              <div className="qz-not-submitted-title">Not Submitted</div>
              <div className="qz-not-submitted-sub">
                {isExpired(quiz.due_date, processingNow) ? "Quiz expired without submission." : `Due: ${formatDateTime(quiz.due_date)}`}
              </div>
            </div>
          ) : (
            <>
              {/* Score banner */}
              <div className="qz-score-banner">
                <div className="qz-result-emoji-sm">{sub.percentage>=80?"🏆":sub.percentage>=60?"🎯":sub.percentage>=40?"📝":"📚"}</div>
                <div className="qz-result-score-lg">
                  {sub.marks}<span className="qz-score-total">/{quiz.total_marks}</span>
                </div>
                <div className="qz-result-pct-purple">{Math.round(sub.percentage)}%</div>
                <div className="qz-result-submitted-text">
                  Submitted: {formatDateTime(sub.submitted_at)}
                </div>
              </div>

              {/* Questions review */}
              {quizData?.questions && (
                <div>
                  <div className="qz-review-title">Question Review</div>
                  <div className="qz-review-stack">
                    {quizData.questions.map((q,i) => {
                      const savedAns = sub?.answers?.[String(q.id)] ?? sub?.answers?.[q.id];
                      const ans = savedAns ?? (q.multi_select?[]:"");
                      const ansArr = Array.isArray(ans) ? ans : (ans ? String(ans).split(",").filter(Boolean) : []);
                      const correctArr = q.correct ? q.correct.split(",").map(x=>x.trim()) : [];
                      const isCorrect = q.correct ? (q.multi_select
                        ? JSON.stringify(ansArr.slice().sort())===JSON.stringify(correctArr.slice().sort())
                        : String(ans).trim().toUpperCase()===q.correct.trim().toUpperCase()) : false;

                      return (
                        <div key={q.id} className="qz-review-card-lg" style={{ "--review-border": isCorrect?"#bbf7d0":"#fecaca", "--review-accent": isCorrect?"#22c55e":"#ef4444", "--review-bg": isCorrect?"var(--bg-success-soft)":"var(--bg-danger-soft)" }}>
                          <div className="qz-review-top-row-lg">
                            <div className="qz-review-question-heading">Q{i+1}. {q.question}</div>
                            <span className="qz-review-marks-ml" style={{ "--marks-color": isCorrect?"#16a34a":"#dc2626" }}>
                              {isCorrect?"✓ +"+q.marks+" marks":"✗ 0 marks"}
                            </span>
                          </div>
                          {/* Options */}
                          <div className="qz-review-options-grid">
                            {["A","B","C","D"].filter(opt=>q["option_"+opt.toLowerCase()]).map(opt=>{
                              const isSelected = q.multi_select ? ansArr.includes(opt) : String(ans)===opt;
                              const isRight = correctArr.includes(opt);
                              let bg="var(--bg-hover)", border="var(--border-color)", color="var(--text-secondary)";
                              if(isRight) { bg="#dcfce7"; border="#22c55e"; color="#16a34a"; }
                              if(isSelected && !isRight) { bg="#fee2e2"; border="#ef4444"; color="#dc2626"; }
                              return (
                                <div key={opt} className="qz-review-option-item" style={{ "--opt-border": border, "--opt-bg": bg }}>
                                  <span className="qz-review-option-letter">{opt}.</span>
                                  <span className="qz-review-option-text" style={{ "--opt-color": color }}>{q["option_"+opt.toLowerCase()]}</span>
                                  {isRight && <span className="qz-review-check">✓</span>}
                                  {isSelected && !isRight && <span className="qz-review-cross">✗</span>}
                                </div>
                              );
                            })}
                          </div>
                          {!isCorrect && q.correct && (
                            <div className="qz-review-correct-note-standalone">
                              Correct answer: {q.correct}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Principal View ───────────────────────────────────────────── */
function PrincipalQuizzes() {
  const { formatDateTime } = useRegionalSettings();
  const [classes,   setClasses]   = useState([]);
  const [selClass,  setSelClass]  = useState(null);
  const [quizzes,   setQuizzes]   = useState([]);
  const [selSubject,setSelSubject]= useState(null);
  const [selQuiz,   setSelQuiz]   = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(()=>{
    import("../api/academicsApi").then(({default:aApi})=>{
      aApi.getClasses().then(r=>setClasses(r.data.data||[])).catch(()=>{});
    });
  },[]);

  useEffect(()=>{
    if(!selClass) return;
    setLoading(true); setSelSubject(null); setQuizzes([]);
    quizzesApi.list({class_id:selClass.id}).then(r=>{setQuizzes(r.data.data||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[selClass]);

  const bySubject = quizzes.reduce((acc,q)=>{
    if(!acc[q.subject_id]) acc[q.subject_id]={subject_name:q.subject_name,subject_id:q.subject_id,quizzes:[]};
    acc[q.subject_id].quizzes.push(q);
    return acc;
  },{});

  if(selQuiz) return <QuizResults quiz={selQuiz} onBack={()=>setSelQuiz(null)} readOnly />;

  return (
    <div>
      <div className="page-header"><h1 className="page-heading">Quizzes</h1></div>
      <div className="qz-two-col-grid-wide">
        <div className="qz-sidebar">
          <div className="qz-sidebar-header">
            <div className="qz-sidebar-title">Classes</div>
          </div>
          {classes.map(c=>(
            <div key={c.id} onClick={()=>{setSelClass(c);setSelSubject(null);}}
              className="qz-class-row"
              style={{ "--item-border": selClass?.id===c.id?"#7c3aed":"transparent", "--item-bg": selClass?.id===c.id?"rgba(124,58,237,0.12)":"transparent" }}>
              <div className="qz-sidebar-item-name" style={{ "--name-weight": selClass?.id===c.id?700:500, "--name-color": selClass?.id===c.id?"#7c3aed":"var(--text-heading)" }}>
                {c.name}{c.section?" ("+c.section+")":""}
              </div>
            </div>
          ))}
        </div>
        <div>
          {!selClass?(
            <div className="qz-empty-panel">
              <div className="qz-empty-panel-icon">📋</div>
              <div>Select a class to view quizzes</div>
            </div>
          ):loading?<div className="loading-state">Loading...</div>
          :Object.keys(bySubject).length===0?(
            <div className="qz-empty-panel">
              No quizzes for {selClass.name}{selClass.section?" ("+selClass.section+")":""}.
            </div>
          ):(
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {Object.values(bySubject).map(subj=>(
                <div key={subj.subject_id} className="qz-subject-group-card">
                  <div className="qz-subject-group-header">
                    <div className="qz-subject-icon">📋</div>
                    <div className="qz-subject-group-title">{subj.subject_name}</div>
                    <span className="qz-subject-count-badge">
                      {subj.quizzes.length} quiz{subj.quizzes.length!==1?"zes":""}
                    </span>
                  </div>
                  {subj.quizzes.map(q=>(
                    <div key={q.id} onClick={()=>setSelQuiz(q)}
                      className="qz-quiz-row"
                      onMouseEnter={e=>e.currentTarget.style.background="var(--bg-hover)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div>
                        <div className="qz-quiz-row-title">{q.title}</div>
                        <div className="qz-quiz-row-meta">
                          {q.question_count}Q · {q.total_marks} marks · Due: {formatDateTime(q.due_date)} · {q.teacher_name}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span className="qz-status-tag" style={{ "--tag-bg": q.is_expired?"var(--bg-danger-soft)":"rgba(124,58,237,0.12)", "--tag-color": q.is_expired?"#dc2626":"#7c3aed", "--tag-border": q.is_expired?"#fecaca":"#ddd6fe" }}>
                          {q.is_expired?"Expired":"Active"}
                        </span>
                        <span className="qz-count-tag">
                          {q.submission_count} submitted
                        </span>
                        <span className="qz-chevron">›</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}