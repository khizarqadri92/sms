import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import quizzesApi from "../api/quizzesApi";
import diaryApi from "../api/diaryApi";
import { useProcessingNow } from "../hooks/useProcessingNow";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const now = () => new Date().toISOString().slice(0,16);
const isExpired = (due, nowValue) => new Date(due) < (nowValue || new Date());

export default function Quizzes() {
  const { user } = useAuth();
  const role = user?.roles?.[0];
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
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", zIndex:1000, padding:20, overflowY:"auto" }}>
      <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e2e8f0", width:"100%", maxWidth:680, marginTop:20, marginBottom:20 }}>
        {/* Header */}
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff", zIndex:1, borderRadius:"16px 16px 0 0" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Create Quiz</div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
              Step {step} of 2 — {step===1?"Quiz Details":"Questions ("+questions.length+" questions · "+totalMarks+" marks)"}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:18, color:"#64748b" }}>×</button>
        </div>

        {/* Step 1: Details */}
        {step===1 && (
          <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
            {err && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#dc2626" }}>{err}</div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Class *</label>
                <select className="form-control" value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value,subject_id:""})}>
                  <option value="">Select class</option>
                  {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Subject *</label>
                <select className="form-control" value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} disabled={!form.class_id}>
                  <option value="">Select subject</option>
                  {subjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Title *</label>
              <input className="form-control" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Chapter 3 Quiz" />
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Instructions</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Quiz instructions..." style={{ resize:"vertical" }} />
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Due Date & Time *</label>
              <input type="datetime-local" className="form-control" value={form.due_date} min={processingNow.toISOString().slice(0,16)} onChange={e=>setForm({...form,due_date:e.target.value})} />
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => {
                if (!form.class_id||!form.subject_id||!form.title||!form.due_date) { setErr("Fill all required fields."); return; }
                setErr(""); setStep(2);
              }} style={{ padding:"9px 24px", fontSize:13, fontWeight:600, background:"#2563eb", color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
                Next: Add Questions →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Questions */}
        {step===2 && (
          <div style={{ padding:"20px 24px" }}>
            {err && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#dc2626", marginBottom:14 }}>{err}</div>}

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {questions.map((q, i) => (
                <div key={i} style={{ border:"1px solid #e2e8f0", borderRadius:12, padding:"16px", background:"#f8fafc" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:"#1e3a5f" }}>Question {i+1}</div>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#64748b", cursor:"pointer" }}>
                        <input type="checkbox" checked={q.multi_select} onChange={e=>updateQ(i,"multi_select",e.target.checked)} />
                        Multiple correct answers
                      </label>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <label style={{ fontSize:12, color:"#64748b" }}>Marks:</label>
                        <input type="number" min="1" value={q.marks} onChange={e=>updateQ(i,"marks",e.target.value)}
                          style={{ width:50, height:28, fontSize:12, border:"1px solid #e2e8f0", borderRadius:6, padding:"0 6px" }} />
                      </div>
                      {questions.length>1 && (
                        <button onClick={()=>removeQ(i)} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:14, color:"#dc2626" }}>×</button>
                      )}
                    </div>
                  </div>

                  <textarea className="form-control" rows={2} value={q.question} onChange={e=>updateQ(i,"question",e.target.value)}
                    placeholder="Enter your question..." style={{ marginBottom:12, resize:"vertical" }} />

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {["A","B","C","D"].map(opt => (
                      <div key={opt}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
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
                          <label style={{ fontSize:12, fontWeight:700, color:"#475569" }}>Option {opt}</label>
                          {(opt==="A"||opt==="B") && <span style={{ fontSize:10, color:"#dc2626" }}>*</span>}
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

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16 }}>
              <button onClick={addQuestion} style={{ padding:"8px 16px", fontSize:12, fontWeight:600,
                background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, cursor:"pointer", color:"#16a34a" }}>
                + Add Question
              </button>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>setStep(1)} style={{ padding:"8px 16px", fontSize:12, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", color:"#64748b", fontWeight:600 }}>
                  ← Back
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding:"9px 24px", fontSize:13, fontWeight:600, background:"#2563eb", color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
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
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", cursor:"pointer" }}
      onClick={onClick}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#bfdbfe"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#e2e8f0"}>
      <div style={{ height:3, background: expired?"#ef4444":"#7c3aed" }} />
      <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:6 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"#f5f3ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>📋</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f" }}>{q.title}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>
                {q.class_name}{q.section?" ("+q.section+")":""} · {q.subject_name}
                {isTeacher && <span> · {q.teacher_name}</span>}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
              background:expired?"#fef2f2":"#f5f3ff", color:expired?"#dc2626":"#7c3aed",
              border:"1px solid "+(expired?"#fecaca":"#ddd6fe") }}>
              {expired?"Expired":"Active"}
            </span>
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" }}>
              {q.question_count} questions
            </span>
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe" }}>
              {q.total_marks} marks
            </span>
            {isTeacher && (
              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f8fafc", color:"#64748b", border:"1px solid #e2e8f0" }}>
                {q.submission_count} submitted
              </span>
            )}
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f8fafc", color:"#64748b", border:"1px solid #e2e8f0" }}>
              📅 Due {formatDateTime(q.due_date)}
            </span>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginLeft:12 }}>
          {onDelete && (
            <button onClick={e=>{ e.stopPropagation(); onDelete(q.id); }}
              style={{ width:32, height:32, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, cursor:"pointer", fontSize:16 }}>
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
        <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:14 }}>My Quizzes</div>
        {loading?<div className="loading-state">Loading...</div>:quizzes.length===0?(
          <div className="empty-state">No quizzes yet. Click + New Quiz to create one.</div>
        ):(
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {quizzes.map(q=><QuizCard key={q.id} q={q} onClick={()=>setSelQuiz(q)} onDelete={handleDelete} isTeacher />)}
          </div>
        )}
      </div>

      {/* Incharge View */}
      {inchargeClasses.length>0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontWeight:700, fontSize:15, color:"#1e3a5f" }}>Class Quizzes — Incharge View</span>
            {inchargeClasses.length>1 ? (
              <select style={{ height:34, fontSize:12, padding:"0 8px", border:"1px solid #e2e8f0", borderRadius:8, background:"#fff", minWidth:160 }}
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
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", alignSelf:"start" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em" }}>Subjects</div>
              </div>
              {inchargeSubjects.map(s=>{
                const cnt=inchargeQuizzes.filter(q=>String(q.subject_id)===String(s.id)).length;
                return (
                  <div key={s.id} onClick={()=>setInchargeSubj(String(s.id))}
                    style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid #f1f5f9",
                      borderLeft:"3px solid "+(inchargeSubj===String(s.id)?"#7c3aed":"transparent"),
                      background:inchargeSubj===String(s.id)?"#f5f3ff":"transparent" }}>
                    <div style={{ fontSize:13, fontWeight:inchargeSubj===String(s.id)?700:500,
                      color:inchargeSubj===String(s.id)?"#7c3aed":"#1e3a5f" }}>{s.name}</div>
                    <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{cnt} quiz{cnt!==1?"zes":""}</div>
                  </div>
                );
              })}
            </div>
            <div>
              {!inchargeSubj?(
                <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"40px", textAlign:"center", color:"#94a3b8" }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:14 }}>Select a subject to view quizzes</div>
                </div>
              ):(
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {inchargeQuizzes.filter(q=>String(q.subject_id)===inchargeSubj).length===0?(
                    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"30px", textAlign:"center", color:"#94a3b8" }}>
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
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>{quiz.title}</div>
          <div style={{ fontSize:12, color:"#64748b" }}>{quiz.class_name}{quiz.section?" ("+quiz.section+")":""} · {quiz.subject_name} · {quiz.total_marks} marks · {quiz.question_count} questions</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
        {[["Submitted",data.submitted.length,"#7c3aed"],["Not Submitted",data.not_submitted.length,"#ef4444"],
          ["Avg Score",avg+"/"+quiz.total_marks,"#2563eb"],["Avg %",data.submitted.length>0?Math.round(data.submitted.reduce((s,r)=>s+Number(r.percentage),0)/data.submitted.length)+"%":"0%","#22c55e"]
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:"#fff", border:"1px solid #e2e8f0", borderTop:"3px solid "+c, borderRadius:10, padding:"12px", textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
            <div style={{ fontSize:12, color:"#64748b" }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="section-card" style={{ marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Submitted ({data.submitted.length})</div>
        {loading?<div className="loading-state">Loading...</div>:data.submitted.length===0?(
          <div className="empty-state">No submissions yet.</div>
        ):(
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#f8fafc" }}>
                {["#","Student","Enrollment","Marks","Percentage","Submitted At"].map(h=>(
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:"#64748b", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.submitted.map((r,i)=>(
                <tr key={r.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"10px 12px", color:"#94a3b8" }}>{i+1}</td>
                  <td style={{ padding:"10px 12px", fontWeight:600 }}>{r.student_name}</td>
                  <td style={{ padding:"10px 12px", color:"#64748b", fontSize:12 }}>{r.enrollment_no}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <span style={{ fontWeight:700, color: Number(r.marks)>=quiz.total_marks*0.5?"#16a34a":"#dc2626" }}>
                      {r.marks}/{quiz.total_marks}
                    </span>
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ flex:1, height:6, background:"#f1f5f9", borderRadius:3, overflow:"hidden", minWidth:60 }}>
                        <div style={{ height:"100%", background:Number(r.percentage)>=75?"#22c55e":Number(r.percentage)>=50?"#f59e0b":"#ef4444", width:r.percentage+"%" }} />
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, minWidth:36 }}>{Math.round(r.percentage)}%</span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:12 }}>
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
          <div style={{ fontWeight:700, fontSize:14, color:"#ef4444", marginBottom:10 }}>Not Submitted ({data.not_submitted.length})</div>
          {data.not_submitted.map(s=>(
            <div key={s.student_id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", background:"#fef2f2", borderRadius:8, marginBottom:4, fontSize:13 }}>
              <span style={{ fontWeight:500 }}>{s.student_name}</span>
              <span style={{ color:"#94a3b8", fontSize:12 }}>{s.enrollment_no}</span>
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
      <div style={{ display:"flex", gap:2, marginBottom:14, borderBottom:"1px solid #e2e8f0" }}>
        {FILTERS.map(([val,label])=>(
          <button key={val} onClick={()=>setFilter(val)}
            style={{ padding:"6px 16px", fontSize:12, fontWeight:500, border:"none", cursor:"pointer", background:"transparent",
              color:filter===val?"#7c3aed":"#64748b", borderBottom:filter===val?"2px solid #7c3aed":"2px solid transparent", marginBottom:-1 }}>
            {label}
          </button>
        ))}
      </div>
      {loading?<div className="loading-state">Loading...</div>:visible.length===0?(
        <div className="section-card"><div className="empty-state">No quizzes found.</div></div>
      ):(
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {visible.map(q=>(
            <div key={q.id} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
              <div style={{ height:3, background:q.is_expired?"#ef4444":"#7c3aed" }} />
              <div style={{ padding:"16px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"#f5f3ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>📋</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f" }}>{q.title}</div>
                      <div style={{ fontSize:12, color:"#64748b" }}>{q.subject_name} · {q.teacher_name}</div>
                    </div>
                  </div>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                    background:q.is_expired?"#fef2f2":"#f5f3ff", color:q.is_expired?"#dc2626":"#7c3aed",
                    border:"1px solid "+(q.is_expired?"#fecaca":"#ddd6fe") }}>
                    {q.is_expired?"Expired":"Active"}
                  </span>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" }}>{q.question_count} questions</span>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe" }}>{q.total_marks} marks</span>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f8fafc", color:"#64748b", border:"1px solid #e2e8f0" }}>
                    Due: {formatDateTime(q.due_date)}
                  </span>
                </div>
                {q.my_submission ? (
                  <div style={{ padding:"14px 16px", background:"#f0fdf4", borderRadius:10, border:"1px solid #bbf7d0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontWeight:700, color:"#16a34a", fontSize:14 }}>✓ Completed</div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                        Submitted: {formatDateTime(q.my_submission.submitted_at)}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:28, fontWeight:800, color:"#2563eb" }}>
                          {q.my_submission.marks}<span style={{ fontSize:16, color:"#94a3b8" }}>/{q.total_marks}</span>
                        </div>
                        <div style={{ fontSize:12, color:"#7c3aed", fontWeight:600 }}>{Math.round(q.my_submission.percentage)}%</div>
                      </div>
                      <button onClick={()=>setSelQuiz(q)} style={{ padding:"8px 16px", fontSize:12, fontWeight:600,
                        background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:8, cursor:"pointer", color:"#7c3aed" }}>
                        View Result
                      </button>
                    </div>
                  </div>
                ) : q.is_expired ? (
                  <div style={{ padding:"10px 14px", background:"#fef2f2", borderRadius:8, fontSize:13, color:"#dc2626", fontWeight:600 }}>
                    ⚠ Quiz expired — not submitted
                  </div>
                ) : (
                  <button onClick={()=>setSelQuiz(q)} style={{ padding:"10px 24px", fontSize:13, fontWeight:700,
                    background:"#7c3aed", color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
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
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:680, maxHeight:"92vh", overflowY:"auto", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f1f5f9", position:"sticky", top:0, background:"#fff", zIndex:1, borderRadius:"20px 20px 0 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f" }}>{quizData?.title||quiz.title}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{quizData?.subject_name} · {quizData?.total_marks} marks · {questions.length} questions</div>
            </div>
            {!submitted && (
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, color:"#64748b" }}>{answered}/{questions.length} answered</div>
                <div style={{ fontSize:11, color:"#7c3aed", fontWeight:600 }}>{progress}% complete</div>
              </div>
            )}
            {submitted && (
              <button onClick={onBack} style={{ padding:"7px 16px", fontSize:12, fontWeight:600,
                background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:8, cursor:"pointer", color:"#7c3aed" }}>
                Close
              </button>
            )}
          </div>
          {!submitted && (
            <div style={{ height:6, background:"#f1f5f9", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", background:"#7c3aed", width:progress+"%", transition:"width 0.3s", borderRadius:3 }} />
            </div>
          )}
        </div>

        <div style={{ padding:"20px 24px", flex:1 }}>

          {loading && <div className="loading-state">Loading quiz...</div>}

          {/* Result screen */}
          {submitted && result && (
            <div>
              <div style={{ textAlign:"center", padding:"20px 0 28px" }}>
                <div style={{ fontSize:64, marginBottom:8 }}>{result.percentage>=80?"🏆":result.percentage>=60?"🎯":result.percentage>=40?"📝":"📚"}</div>
                <div style={{ fontSize:42, fontWeight:800, color:"#2563eb" }}>
                  {result.marks}<span style={{ fontSize:22, color:"#94a3b8", fontWeight:400 }}>/{quizData?.total_marks}</span>
                </div>
                <div style={{ fontSize:20, fontWeight:700, color:"#1e3a5f", marginTop:4 }}>
                  {Math.round(result.percentage)}%
                </div>
                <div style={{ fontSize:14, color:"#64748b", marginTop:8 }}>
                  {result.percentage>=80?"Excellent work! 🎉":result.percentage>=60?"Good job! Keep it up.":result.percentage>=40?"Not bad. Review the topics.":"Keep studying. You can do better!"}
                </div>
              </div>

              {/* Question review */}
              <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:20 }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f", marginBottom:14 }}>Review Answers</div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
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
                      <div key={q.id} style={{ border:"1px solid "+(isCorrect?"#bbf7d0":"#fecaca"), borderRadius:10, padding:"12px 14px",
                        borderLeft:"4px solid "+(isCorrect?"#22c55e":"#ef4444"), background:isCorrect?"#f0fdf4":"#fef2f2" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <div style={{ fontWeight:600, fontSize:13 }}>Q{i+1}. {q.question}</div>
                          <span style={{ fontSize:12, fontWeight:700, color:isCorrect?"#16a34a":"#dc2626" }}>
                            {isCorrect?"✓ +"+q.marks+" marks":"✗ 0 marks"}
                          </span>
                        </div>
                        <div style={{ fontSize:12, color:"#64748b" }}>
                          Your answer: <strong>{ansArr.length>0?ansArr.join(", "):"—"}</strong>
                          {!isCorrect && q.correct && <span style={{ color:"#16a34a" }}> · Correct: <strong>{q.correct}</strong></span>}
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
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:20 }}>
                {questions.map((_,i)=>{
                  const isAns=answers[questions[i].id]&&(Array.isArray(answers[questions[i].id])?answers[questions[i].id].length>0:true);
                  return (
                    <button key={i} onClick={()=>setCurrent(i)}
                      style={{ width:34, height:34, borderRadius:8, border:"2px solid "+(i===current?"#7c3aed":isAns?"#22c55e":"#e2e8f0"),
                        background:i===current?"#7c3aed":isAns?"#f0fdf4":"#f8fafc",
                        color:i===current?"#fff":isAns?"#16a34a":"#64748b",
                        fontWeight:700, fontSize:13, cursor:"pointer" }}>
                      {i+1}
                    </button>
                  );
                })}
              </div>

              {err && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#dc2626", marginBottom:14 }}>{err}</div>}

              {/* Current question */}
              <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:14, padding:"20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", flex:1, lineHeight:1.5 }}>
                    <span style={{ color:"#7c3aed", marginRight:8 }}>Q{current+1}.</span>{q.question}
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginLeft:12 }}>
                    <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f5f3ff", color:"#7c3aed", border:"1px solid #ddd6fe", whiteSpace:"nowrap" }}>
                      {q.marks} mark{q.marks!==1?"s":""}
                    </span>
                    {q.multi_select && <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:"#fffbeb", color:"#92400e", border:"1px solid #fde68a", whiteSpace:"nowrap" }}>Multi-select</span>}
                  </div>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {["A","B","C","D"].filter(opt=>q["option_"+opt.toLowerCase()]).map(opt=>{
                    const ans=answers[q.id]||(q.multi_select?[]:"");
                    const isSelected=q.multi_select?(Array.isArray(ans)&&ans.includes(opt)):ans===opt;
                    return (
                      <div key={opt} onClick={()=>handleAnswer(q.id,opt,q.multi_select)}
                        style={{ padding:"14px 16px", border:"2px solid "+(isSelected?"#7c3aed":"#e2e8f0"),
                          borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", gap:12,
                          background:isSelected?"#f5f3ff":"#fff", transition:"all 0.1s" }}>
                        <div style={{ width:26, height:26, borderRadius:q.multi_select?"6px":"50%",
                          border:"2px solid "+(isSelected?"#7c3aed":"#cbd5e1"),
                          display:"flex", alignItems:"center", justifyContent:"center",
                          background:isSelected?"#7c3aed":"transparent", flexShrink:0 }}>
                          {isSelected && <div style={{ width:10, height:10, borderRadius:q.multi_select?"2px":"50%", background:"#fff" }} />}
                        </div>
                        <div>
                          <span style={{ fontSize:12, fontWeight:700, color:"#94a3b8", marginRight:8 }}>{opt}.</span>
                          <span style={{ fontSize:14, color:isSelected?"#7c3aed":"#1e3a5f", fontWeight:isSelected?600:400 }}>
                            {q["option_"+opt.toLowerCase()]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16 }}>
                <button onClick={()=>setCurrent(p=>Math.max(0,p-1))} disabled={current===0}
                  style={{ padding:"8px 18px", fontSize:13, fontWeight:600, background:"#f8fafc",
                    border:"1px solid #e2e8f0", borderRadius:8, cursor:current===0?"not-allowed":"pointer", color:"#64748b", opacity:current===0?0.5:1 }}>
                  ← Previous
                </button>
                {current < questions.length-1 ? (
                  <button onClick={()=>setCurrent(p=>p+1)}
                    style={{ padding:"8px 18px", fontSize:13, fontWeight:600, background:"#7c3aed",
                      color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
                    Next →
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={submitting}
                    style={{ padding:"10px 28px", fontSize:14, fontWeight:700, background:"#16a34a",
                      color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", alignSelf:"start" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em" }}>Subjects</div>
            </div>
            {loading?<div style={{ padding:16, fontSize:12, color:"#94a3b8" }}>Loading...</div>
            :Object.values(bySubject).map(s=>(
              <div key={s.subject_id} onClick={()=>setSelSubject(s.subject_id)}
                style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid #f1f5f9",
                  borderLeft:"3px solid "+(selSubject===s.subject_id?"#7c3aed":"transparent"),
                  background:selSubject===s.subject_id?"#f5f3ff":"transparent" }}>
                <div style={{ fontSize:13, fontWeight:selSubject===s.subject_id?700:500,
                  color:selSubject===s.subject_id?"#7c3aed":"#1e3a5f" }}>{s.subject_name}</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{s.quizzes.length} quiz{s.quizzes.length!==1?"zes":""}</div>
              </div>
            ))}
          </div>
          <div>
            {!selSubject?(
              <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"40px", textAlign:"center", color:"#94a3b8" }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14 }}>Select a subject to view quizzes</div>
              </div>
            ):(
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
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
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:640, maxHeight:"92vh", overflowY:"auto", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff", zIndex:1, borderRadius:"20px 20px 0 0" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f" }}>{quiz.title}</div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{quiz.subject_name} · {quiz.total_marks} marks · {quiz.question_count} questions</div>
          </div>
          <button onClick={onBack} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:18, color:"#64748b" }}>×</button>
        </div>

        <div style={{ padding:"20px 24px" }}>
          {loading ? <div className="loading-state">Loading...</div> : !sub ? (
            <div style={{ textAlign:"center", padding:"30px 0" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
              <div style={{ fontWeight:600, color:"#dc2626", fontSize:16 }}>Not Submitted</div>
              <div style={{ fontSize:13, color:"#64748b", marginTop:6 }}>
                {isExpired(quiz.due_date, processingNow) ? "Quiz expired without submission." : `Due: ${formatDateTime(quiz.due_date)}`}
              </div>
            </div>
          ) : (
            <>
              {/* Score banner */}
              <div style={{ textAlign:"center", padding:"20px 0 24px", borderBottom:"1px solid #f1f5f9", marginBottom:20 }}>
                <div style={{ fontSize:52, marginBottom:8 }}>{sub.percentage>=80?"🏆":sub.percentage>=60?"🎯":sub.percentage>=40?"📝":"📚"}</div>
                <div style={{ fontSize:40, fontWeight:800, color:"#2563eb" }}>
                  {sub.marks}<span style={{ fontSize:20, color:"#94a3b8", fontWeight:400 }}>/{quiz.total_marks}</span>
                </div>
                <div style={{ fontSize:18, fontWeight:700, color:"#7c3aed", marginTop:4 }}>{Math.round(sub.percentage)}%</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>
                  Submitted: {formatDateTime(sub.submitted_at)}
                </div>
              </div>

              {/* Questions review */}
              {quizData?.questions && (
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f", marginBottom:14 }}>Question Review</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {quizData.questions.map((q,i) => {
                      const savedAns = sub?.answers?.[String(q.id)] ?? sub?.answers?.[q.id];
                      const ans = savedAns ?? (q.multi_select?[]:"");
                      const ansArr = Array.isArray(ans) ? ans : (ans ? String(ans).split(",").filter(Boolean) : []);
                      const correctArr = q.correct ? q.correct.split(",").map(x=>x.trim()) : [];
                      const isCorrect = q.correct ? (q.multi_select
                        ? JSON.stringify(ansArr.slice().sort())===JSON.stringify(correctArr.slice().sort())
                        : String(ans).trim().toUpperCase()===q.correct.trim().toUpperCase()) : false;

                      return (
                        <div key={q.id} style={{ border:"1px solid "+(isCorrect?"#bbf7d0":"#fecaca"), borderRadius:10, padding:"14px",
                          borderLeft:"4px solid "+(isCorrect?"#22c55e":"#ef4444"), background:isCorrect?"#f0fdf4":"#fef2f2" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                            <div style={{ fontWeight:600, fontSize:13, color:"#1e3a5f", flex:1 }}>Q{i+1}. {q.question}</div>
                            <span style={{ fontSize:12, fontWeight:700, color:isCorrect?"#16a34a":"#dc2626", marginLeft:10 }}>
                              {isCorrect?"✓ +"+q.marks+" marks":"✗ 0 marks"}
                            </span>
                          </div>
                          {/* Options */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                            {["A","B","C","D"].filter(opt=>q["option_"+opt.toLowerCase()]).map(opt=>{
                              const isSelected = q.multi_select ? ansArr.includes(opt) : String(ans)===opt;
                              const isRight = correctArr.includes(opt);
                              let bg="#f8fafc", border="#e2e8f0", color="#475569";
                              if(isRight) { bg="#dcfce7"; border="#22c55e"; color="#16a34a"; }
                              if(isSelected && !isRight) { bg="#fee2e2"; border="#ef4444"; color="#dc2626"; }
                              return (
                                <div key={opt} style={{ padding:"8px 12px", border:"1px solid "+border, borderRadius:8, background:bg, fontSize:12 }}>
                                  <span style={{ fontWeight:700, marginRight:6, color:"#94a3b8" }}>{opt}.</span>
                                  <span style={{ color }}>{q["option_"+opt.toLowerCase()]}</span>
                                  {isRight && <span style={{ marginLeft:6, fontSize:11, color:"#16a34a" }}>✓</span>}
                                  {isSelected && !isRight && <span style={{ marginLeft:6, fontSize:11, color:"#dc2626" }}>✗</span>}
                                </div>
                              );
                            })}
                          </div>
                          {!isCorrect && q.correct && (
                            <div style={{ fontSize:11, color:"#16a34a", fontWeight:600 }}>
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
      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:16 }}>
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", alignSelf:"start" }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em" }}>Classes</div>
          </div>
          {classes.map(c=>(
            <div key={c.id} onClick={()=>{setSelClass(c);setSelSubject(null);}}
              style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid #f1f5f9",
                borderLeft:"3px solid "+(selClass?.id===c.id?"#7c3aed":"transparent"),
                background:selClass?.id===c.id?"#f5f3ff":"transparent" }}>
              <div style={{ fontSize:13, fontWeight:selClass?.id===c.id?700:500,
                color:selClass?.id===c.id?"#7c3aed":"#1e3a5f" }}>
                {c.name}{c.section?" ("+c.section+")":""}
              </div>
            </div>
          ))}
        </div>
        <div>
          {!selClass?(
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"40px", textAlign:"center", color:"#94a3b8" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
              <div>Select a class to view quizzes</div>
            </div>
          ):loading?<div className="loading-state">Loading...</div>
          :Object.keys(bySubject).length===0?(
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"40px", textAlign:"center", color:"#94a3b8" }}>
              No quizzes for {selClass.name}{selClass.section?" ("+selClass.section+")":""}.
            </div>
          ):(
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {Object.values(bySubject).map(subj=>(
                <div key={subj.subject_id} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:"#f5f3ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📋</div>
                    <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f" }}>{subj.subject_name}</div>
                    <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, background:"#ede9fe", color:"#5b21b6", border:"1px solid #ddd6fe", marginLeft:"auto" }}>
                      {subj.quizzes.length} quiz{subj.quizzes.length!==1?"zes":""}
                    </span>
                  </div>
                  {subj.quizzes.map(q=>(
                    <div key={q.id} onClick={()=>setSelQuiz(q)}
                      style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid #f8fafc",
                        display:"flex", justifyContent:"space-between", alignItems:"center" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13, color:"#1e3a5f" }}>{q.title}</div>
                        <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                          {q.question_count}Q · {q.total_marks} marks · Due: {formatDateTime(q.due_date)} · {q.teacher_name}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600,
                          background:q.is_expired?"#fef2f2":"#f5f3ff", color:q.is_expired?"#dc2626":"#7c3aed",
                          border:"1px solid "+(q.is_expired?"#fecaca":"#ddd6fe") }}>
                          {q.is_expired?"Expired":"Active"}
                        </span>
                        <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" }}>
                          {q.submission_count} submitted
                        </span>
                        <span style={{ fontSize:18, color:"#cbd5e1" }}>›</span>
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