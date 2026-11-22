import { useState, useEffect } from "react";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import "./ExamMarks.css";

export default function ExamMarks() {
  const { user, can } = useAuth();
  const [searchParams] = useSearchParams();
  const role = effectiveRole(user) || "";
  const canCompile = can("exams_results.result_compilation");
  const isCoordinator = can("exams_results.marks_change_after_submission");   // coordinator-level marks control

  const [exams,         setExams]         = useState([]);
  const [myClasses,     setMyClasses]     = useState([]);
  const [subjects,      setSubjects]      = useState([]);
  const [selectedExam,  setSelectedExam]  = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSub,   setSelectedSub]   = useState(null);
  const [marksData,     setMarksData]     = useState(null);
  const [marks,         setMarks]         = useState({});
  const [summary,       setSummary]       = useState(null);
  const [loadingSubs,   setLoadingSubs]   = useState(false);
  const [loadingMarks,  setLoadingMarks]  = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [mySubjectIds,  setMySubjectIds]  = useState([]);
  const [flash,         setFlash]         = useState({});

  const notify = (type,msg) => { setFlash({type,msg}); setTimeout(()=>setFlash({}),4000); };

  useEffect(()=>{
    examsApi.getAll().then(r=>{
      const open = (r.data.data||[]).filter(e=>["marks_open","compiled","scheduled"].includes(e.status));
      setExams(open);
      const examId = searchParams.get("exam");
      if(examId){ const found=open.find(e=>String(e.id)===examId); if(found) pickExam(found); }
    }).catch(()=>{});
    client.get("/academics/my-classes").then(r=>setMyClasses(r.data.data||[])).catch(()=>{});
    client.get("/academics/my-subjects").then(r=>setMySubjectIds((r.data.data||[]).map(s=>s.id))).catch(()=>{});
  },[]);

  const pickExam = (exam) => {
    setSelectedExam(exam);
    setSelectedClass(null);
    setSelectedSub(null);
    setMarksData(null);
    setSubjects([]);
    setSummary(null);
  };

  const pickClass = async (cls) => {
    setSelectedClass(cls);
    setSelectedSub(null);
    setMarksData(null);
    setLoadingSubs(true);
    try {
      const r = await examsApi.getSubjects(selectedExam.id);
      let subs = (r.data.data||[]).filter(s=>s.class_id===cls.id);
      // Teachers only see their subjects; incharge/coordinator sees all
      if(role==="teacher"&&mySubjectIds.length>0){
        const isIncharge = myClasses.find(c=>c.id===cls.id&&c.is_primary);
        if(!isIncharge) subs = subs.filter(s=>mySubjectIds.includes(s.subject_id));
      }
      setSubjects(subs);
      const sr = await examsApi.getClassMarksSummary(selectedExam.id, cls.id);
      setSummary(sr.data.data);
    } catch(e){ notify("error", e.response?.data?.message || "Failed to load class data."); }
    finally { setLoadingSubs(false); }
  };

  const pickSubject = async (sub) => {
    setSelectedSub(sub);
    setLoadingMarks(true);
    try {
      const r = await examsApi.getMarksEntry(selectedExam.id, selectedClass.id, sub.subject_id);
      setMarksData(r.data.data);
      const m = {};
      (r.data.data.students||[]).forEach(s=>{
        m[s.id]={marks_obtained:s.marks_obtained||"",is_absent:s.is_absent||false,remarks:s.remarks||""};
      });
      setMarks(m);
    } catch(e){ notify("error", e.response?.data?.message || "Failed to load marks."); }
    finally { setLoadingMarks(false); }
  };

  const saveMarks = async () => {
    setSaving(true);
    try {
      const list = Object.entries(marks).map(([sid,m])=>({
        student_id:Number(sid),
        marks_obtained:m.is_absent?null:(m.marks_obtained===""?null:Number(m.marks_obtained)),
        is_absent:m.is_absent, remarks:m.remarks||""
      }));
      await examsApi.saveMarks(selectedExam.id,{class_id:selectedClass.id,subject_id:selectedSub.subject_id,marks:list});
      notify("success","Marks saved.");
    } catch(e){ notify("error", e.response?.data?.message || "Failed to save."); }
    finally { setSaving(false); }
  };

  const submitMarks = async () => {
    if(!window.confirm("Submit marks? You won't be able to edit after submission.")) return;
    setSaving(true);
    try {
      const list = Object.entries(marks).map(([sid,m])=>({
        student_id:Number(sid),
        marks_obtained:m.is_absent?null:(m.marks_obtained===""?null:Number(m.marks_obtained)),
        is_absent:m.is_absent, remarks:m.remarks||""
      }));
      await examsApi.saveMarks(selectedExam.id,{class_id:selectedClass.id,subject_id:selectedSub.subject_id,marks:list});
      await examsApi.submitSubjectMarks(selectedExam.id,{class_id:selectedClass.id,subject_id:selectedSub.subject_id});
      notify("success","Marks submitted!");
      setSelectedSub(null); setMarksData(null);
      const sr = await examsApi.getClassMarksSummary(selectedExam.id,selectedClass.id);
      setSummary(sr.data.data);
      const r = await examsApi.getSubjects(selectedExam.id);
      let subs = (r.data.data||[]).filter(s=>s.class_id===selectedClass.id);
      // Re-apply teacher filter
      if(role==="teacher"&&mySubjectIds.length>0){
        const isIncharge = myClasses.find(c=>c.id===selectedClass.id&&c.is_primary);
        if(!isIncharge) subs = subs.filter(s=>mySubjectIds.includes(s.subject_id));
      }
      setSubjects(subs);
    } catch(e){ notify("error", e.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const compileResults = async () => {
    if(!window.confirm("Compile results for this class?")) return;
    setSaving(true);
    try {
      await examsApi.compileResults(selectedExam.id,{class_id:selectedClass.id});
      notify("success","Results compiled!");
      const sr = await examsApi.getClassMarksSummary(selectedExam.id,selectedClass.id);
      setSummary(sr.data.data);
    } catch(e){ notify("error", e.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const totalMarks = marksData?.total_marks||100;
  const enteredCount = Object.values(marks).filter(m=>m.marks_obtained!==""||m.is_absent).length;
  const totalStudents = marksData?.students?.length||0;

  return (
    <div className="em-page">
      <div className="em-header">
        <div className="em-title">Exam Marks Entry</div>
        <div className="em-subtitle">Select an exam, then a class to enter marks</div>
      </div>

      {flash.msg&&<div className="em-flash" style={{ "--flash-bg": flash.type==="error"?"var(--bg-danger-soft)":"var(--bg-success-soft)", "--flash-border": flash.type==="error"?"#fecaca":"#bbf7d0", "--flash-color": flash.type==="error"?"#991b1b":"#166534" }}>{flash.msg}</div>}

      <div className="em-main-grid">

        {/* LEFT SIDEBAR */}
        <div className="em-sidebar">

          {/* Exam List */}
          <div className="em-side-card">
            <div className="em-side-card-header">Exams</div>
            {exams.length===0&&<div className="em-side-empty">No open exams.</div>}
            {exams.map(e=>(
              <div key={e.id} onClick={()=>pickExam(e)} className="em-side-item"
                style={{ "--item-border": selectedExam?.id===e.id?"#0f4c35":"transparent", "--item-bg": selectedExam?.id===e.id?"var(--bg-success-soft)":"var(--bg-card)" }}>
                <div className="em-side-item-name">{e.name}</div>
                <div className="em-side-item-sub">{e.exam_type_name}</div>
              </div>
            ))}
          </div>

          {/* Class List */}
          {selectedExam&&(
            <div className="em-side-card">
              <div className="em-side-card-header">Classes</div>
              {myClasses.length===0&&<div className="em-side-empty">No classes assigned.</div>}
              {myClasses.map(c=>(
                <div key={c.id} onClick={()=>pickClass(c)} className="em-side-item-row"
                  style={{ "--item-border": selectedClass?.id===c.id?"#0f4c35":"transparent", "--item-bg": selectedClass?.id===c.id?"var(--bg-success-soft)":"var(--bg-card)" }}>
                  <div>
                    <div className="em-side-item-name">{c.name}{c.section?" ("+c.section+")":""}</div>
                    {c.is_primary&&<div className="em-side-item-incharge">Incharge</div>}
                  </div>
                  {selectedClass?.id===c.id&&loadingSubs&&<div className="em-spinner" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT CONTENT */}
        <div>
          {!selectedExam&&(
            <div className="em-placeholder">
              <div className="em-placeholder-icon">📋</div>
              <div className="em-placeholder-text">Select an exam to start</div>
            </div>
          )}

          {selectedExam&&!selectedClass&&(
            <div className="em-placeholder">
              <div className="em-placeholder-icon">🏫</div>
              <div className="em-placeholder-text">Select a class from the left</div>
            </div>
          )}

          {/* Class detail panel - always visible when class selected */}
          {selectedClass&&(
            <div className="em-detail-stack">

              {/* Class header */}
              <div className="em-class-header">
                <div>
                  <div className="em-class-name">{selectedClass.name}{selectedClass.section?" ("+selectedClass.section+")":""}</div>
                  <div className="em-class-meta">{selectedExam.name} · {subjects.length} subject{subjects.length!==1?"s":""}</div>
                </div>
                {summary?.compiled?(
                  <div className="em-compiled-badge">
                    <span className="em-compiled-check">&#10003;</span>
                    <div>
                      <div className="em-compiled-title">Results Compiled</div>
                      <div className="em-compiled-by">by {summary.compiled.compiled_by_name||"Class Incharge"}</div>
                    </div>
                  </div>
                ):summary?.all_submitted&&canCompile&&(isCoordinator||myClasses.find(c=>c.id===selectedClass?.id&&c.is_primary))?(
                  <button disabled={saving} onClick={compileResults} className="em-compile-btn">{saving?"Compiling...":"Compile Results"}</button>
                ):summary?.all_submitted&&!canCompile?(
                  <div className="em-awaiting-text">All marks submitted — awaiting class incharge to compile</div>
                ):null}
              </div>

              {/* Subjects grid + marks side by side */}
              <div className="em-content-grid" style={{ "--content-cols": selectedSub?"1fr 1fr":"1fr" }}>

                {/* Subjects table */}
                <div className="em-subjects-card">
                  <div className="em-subjects-header">Subjects</div>
                  {loadingSubs?<div className="em-subjects-loading">Loading...</div>:
                  subjects.length===0?<div className="em-subjects-loading">No subjects in datesheet for this class.</div>:(
                    <div>
                      {subjects.map((s,i)=>{
                        const sm = summary?.subjects?.find(x=>x.subject_id===s.subject_id);
                        const isSelected = selectedSub?.subject_id===s.subject_id;
                        const canEdit = mySubjectIds.length===0||mySubjectIds.includes(s.subject_id);
                        const entered = sm?.marks_entered||0;
                        const total = sm?.total_students||0;
                        return (
                          <div key={i} className="em-subject-row"
                            style={{ "--row-bg": isSelected?"var(--bg-success-soft)":s.marks_submitted?"var(--bg-success-soft)":!canEdit?"var(--color-background-secondary)":"var(--bg-card)", "--row-border-left": isSelected?"#0f4c35":s.marks_submitted?"#22c55e":"transparent" }}>
                            <div className="em-subject-top-row">
                              <div>
                                <div className="em-subject-name">{s.subject_name}</div>
                                <div className="em-subject-meta">Date: {s.exam_date||"-"} · Max: {s.total_marks}</div>
                                {(s.subject_teacher_name||s.teacher_name)&&<div className="em-subject-teacher">Subject Teacher: {s.subject_teacher_name||s.teacher_name}</div>}
                              </div>
                              {s.marks_submitted
                                ? <span className="em-submitted-tag">Submitted</span>
                                : <span className="em-pending-tag">Pending</span>
                              }
                            </div>
                            <div className="em-subject-bottom-row">
                              <div className="em-entered-text">Entered: <strong style={{color: entered===total&&total>0?"#166534":"var(--text-heading)"}}>{entered}/{total}</strong></div>
                              <div className="em-subject-actions">
                                {(s.marks_submitted||entered>0)&&(
                                  <button onClick={()=>pickSubject(s)} className="em-view-btn">View</button>
                                )}
                                {canEdit&&!s.marks_submitted&&(
                                  <button onClick={()=>pickSubject(s)} className="em-edit-btn">{entered>0?"Edit":"Enter"}</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {summary&&!summary.all_submitted&&<div className="em-submit-all-note">Submit all subjects to compile results.</div>}
                </div>

                {/* Marks Entry Panel */}
                {selectedSub&&(
                  <div className="em-marks-panel">
                    <div className="em-marks-header">
                      <div>
                        <div className="em-marks-subject-name">{selectedSub.subject_name}</div>
                        <div className="em-marks-meta">Max: {totalMarks} · Pass: {marksData?.passing_marks||40} · {enteredCount}/{totalStudents} entered</div>
                      </div>
                      {!selectedSub?.marks_submitted&&(
                        <div className="em-marks-actions">
                          <button disabled={saving} onClick={saveMarks} className="em-save-btn">Save</button>
                          <button disabled={saving} onClick={submitMarks} className="em-submit-btn">Submit</button>
                        </div>
                      )}
                      {selectedSub?.marks_submitted&&<span className="em-viewonly-badge">Submitted - View Only</span>}
                    </div>

                    {/* Progress */}
                    <div className="em-progress-wrap">
                      <div className="em-progress-track">
                        <div className="em-progress-fill" style={{ "--fill-width": (totalStudents>0?enteredCount/totalStudents*100:0)+"%" }} />
                      </div>
                    </div>

                    {loadingMarks?<div className="em-marks-loading">Loading students...</div>:(
                      <div className="em-marks-table-wrap">
                        <table className="em-marks-table">
                          <thead className="em-marks-thead">
                            <tr className="em-marks-th-row">
                              <th className="em-marks-th">#</th>
                              <th className="em-marks-th">Student</th>
                              <th className="em-marks-th-center">Absent</th>
                              <th className="em-marks-th-center">Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(marksData?.students||[]).map((s,i)=>{
                              const m=marks[s.id]||{marks_obtained:"",is_absent:false,remarks:""};
                              const pct=m.marks_obtained!==""&&!m.is_absent?Math.round(Number(m.marks_obtained)/totalMarks*100):null;
                              const pass=marksData?.passing_marks||40;
                              return (
                                <tr key={s.id} className="em-marks-tr" style={{ "--tr-bg": m.is_absent?"var(--bg-danger-soft)":i%2===0?"var(--bg-card)":"var(--color-background-secondary)" }}>
                                  <td className="em-marks-td-index">{i+1}</td>
                                  <td className="em-marks-td">
                                    <div className="em-student-name">{s.first_name} {s.last_name}</div>
                                    {pct!==null&&<div className="em-student-pct" style={{ "--pct-color": pct>=pass?"#166534":"#991b1b" }}>{pct}%</div>}
                                  </td>
                                  <td className="em-marks-td-center">
                                    <input type="checkbox" checked={m.is_absent} disabled={!!selectedSub?.marks_submitted} onChange={e=>!selectedSub?.marks_submitted&&setMarks(p=>({...p,[s.id]:{...p[s.id],is_absent:e.target.checked,marks_obtained:e.target.checked?"":p[s.id]?.marks_obtained||""}}))} style={{cursor:selectedSub?.marks_submitted?"not-allowed":"pointer",accentColor:"#ef4444",opacity:selectedSub?.marks_submitted?0.6:1}} />
                                  </td>
                                  <td className="em-marks-td-center">
                                    {m.is_absent?<span className="em-absent-text">Absent</span>:
                                    <input type="number" min={0} max={totalMarks} value={m.marks_obtained}
                                      onChange={e=>!selectedSub?.marks_submitted&&setMarks(p=>({...p,[s.id]:{...p[s.id],marks_obtained:e.target.value}}))}
                                      readOnly={!!selectedSub?.marks_submitted}
                                      disabled={!!selectedSub?.marks_submitted}
                                      className="em-marks-input"
                                      style={{ "--marks-border": m.marks_obtained!==""?(Number(m.marks_obtained)>=pass?"#22c55e":"#ef4444"):"var(--border-color)", "--marks-color": m.marks_obtained!==""?(Number(m.marks_obtained)>=pass?"#166534":"#991b1b"):"var(--text-heading)", "--marks-bg": selectedSub?.marks_submitted?"var(--bg-hover)":"var(--bg-card)" }} />}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}