import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import { examsApi } from "../api/examsApi";
import client from "../api/client";

export default function ExamMarks() {
  const { user, can } = useAuth();
  const [searchParams] = useSearchParams();
  const role = user?.roles?.[0] || "";
  const canCompile = can("exam.compile");
  const isCoordinator = ["academic_coordinator","admin","superadmin"].includes(role);

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
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Exam Marks Entry</div>
        <div style={{fontSize:13,color:"#64748b"}}>Select an exam, then a class to enter marks</div>
      </div>

      {flash.msg&&<div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,background:flash.type==="error"?"#fef2f2":"#f0fdf4",border:"1px solid "+(flash.type==="error"?"#fecaca":"#bbf7d0"),color:flash.type==="error"?"#991b1b":"#166534",fontSize:13}}>{flash.msg}</div>}

      <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:20,alignItems:"flex-start"}}>

        {/* LEFT SIDEBAR */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Exam List */}
          <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>Exams</div>
            {exams.length===0&&<div style={{padding:"14px",fontSize:12,color:"#94a3b8"}}>No open exams.</div>}
            {exams.map(e=>(
              <div key={e.id} onClick={()=>pickExam(e)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedExam?.id===e.id?"#0f4c35":"transparent"),background:selectedExam?.id===e.id?"#f0fdf4":"#fff",transition:"all .1s"}}>
                <div style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{e.name}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:1}}>{e.exam_type_name}</div>
              </div>
            ))}
          </div>

          {/* Class List */}
          {selectedExam&&(
            <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>Classes</div>
              {myClasses.length===0&&<div style={{padding:"14px",fontSize:12,color:"#94a3b8"}}>No classes assigned.</div>}
              {myClasses.map(c=>(
                <div key={c.id} onClick={()=>pickClass(c)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedClass?.id===c.id?"#0f4c35":"transparent"),background:selectedClass?.id===c.id?"#f0fdf4":"#fff",transition:"all .1s",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{c.name}{c.section?" ("+c.section+")":""}</div>
                    {c.is_primary&&<div style={{fontSize:10,color:"#166534",fontWeight:600}}>Incharge</div>}
                  </div>
                  {selectedClass?.id===c.id&&loadingSubs&&<div style={{width:14,height:14,border:"2px solid #e2e8f0",borderTop:"2px solid #0f4c35",borderRadius:"50%",animation:"spin .6s linear infinite"}} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT CONTENT */}
        <div>
          {!selectedExam&&(
            <div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontWeight:600,fontSize:15}}>Select an exam to start</div>
            </div>
          )}

          {selectedExam&&!selectedClass&&(
            <div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:40,marginBottom:12}}>🏫</div>
              <div style={{fontWeight:600,fontSize:15}}>Select a class from the left</div>
            </div>
          )}

          {/* Class detail panel - always visible when class selected */}
          {selectedClass&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* Class header */}
              <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1.5px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:"#0f172a"}}>{selectedClass.name}{selectedClass.section?" ("+selectedClass.section+")":""}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{selectedExam.name} · {subjects.length} subject{subjects.length!==1?"s":""}</div>
                </div>
                {summary?.compiled?(
                  <div style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px"}}>
                    <span style={{fontSize:16,color:"#166534"}}>&#10003;</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#166534"}}>Results Compiled</div>
                      <div style={{fontSize:11,color:"#64748b"}}>by {summary.compiled.compiled_by_name||"Class Incharge"}</div>
                    </div>
                  </div>
                ):summary?.all_submitted&&canCompile&&(isCoordinator||myClasses.find(c=>c.id===selectedClass?.id&&c.is_primary))?(
                  <button disabled={saving} onClick={compileResults} style={{padding:"8px 18px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"Compiling...":"Compile Results"}</button>
                ):summary?.all_submitted&&!canCompile?(
                  <div style={{fontSize:12,color:"#166534",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",fontWeight:600}}>All marks submitted ? awaiting class incharge to compile</div>
                ):null}
              </div>

              {/* Subjects grid + marks side by side */}
              <div style={{display:"grid",gridTemplateColumns:selectedSub?"1fr 1fr":"1fr",gap:16}}>

                {/* Subjects table */}
                <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontWeight:700,fontSize:13}}>Subjects</div>
                  {loadingSubs?<div style={{padding:24,textAlign:"center",color:"#94a3b8",fontSize:13}}>Loading...</div>:
                  subjects.length===0?<div style={{padding:24,textAlign:"center",color:"#94a3b8",fontSize:13}}>No subjects in datesheet for this class.</div>:(
                    <div>
                      {subjects.map((s,i)=>{
                        const sm = summary?.subjects?.find(x=>x.subject_id===s.subject_id);
                        const isSelected = selectedSub?.subject_id===s.subject_id;
                        const canEdit = mySubjectIds.length===0||mySubjectIds.includes(s.subject_id);
                        const entered = sm?.marks_entered||0;
                        const total = sm?.total_students||0;
                        return (
                          <div key={i} style={{padding:"12px 16px",borderBottom:"1px solid #f8fafc",background:isSelected?"#f0fdf4":s.marks_submitted?"#f8fffe":!canEdit?"#fafafa":"#fff",borderLeft:"3px solid "+(isSelected?"#0f4c35":s.marks_submitted?"#22c55e":"transparent"),transition:"all .1s"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                              <div>
                                <div style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{s.subject_name}</div>
                                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Date: {s.exam_date||"-"} · Max: {s.total_marks}</div>
                                {(s.subject_teacher_name||s.teacher_name)&&<div style={{fontSize:11,color:"#2563eb",marginTop:2,fontWeight:500}}>Subject Teacher: {s.subject_teacher_name||s.teacher_name}</div>}
                              </div>
                              {s.marks_submitted
                                ? <span style={{fontSize:10,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:8,flexShrink:0}}>Submitted</span>
                                : <span style={{fontSize:10,fontWeight:600,background:"#fef9c3",color:"#854d0e",padding:"2px 8px",borderRadius:8,flexShrink:0}}>Pending</span>
                              }
                            </div>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                              <div style={{fontSize:11,color:"#64748b"}}>Entered: <strong style={{color:entered===total&&total>0?"#166534":"#0f172a"}}>{entered}/{total}</strong></div>
                              <div style={{display:"flex",gap:6}}>
                                {(s.marks_submitted||entered>0)&&(
                                  <button onClick={()=>pickSubject(s)} style={{padding:"3px 10px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:6,fontSize:11,fontWeight:600,color:"#2563eb",cursor:"pointer"}}>View</button>
                                )}
                                {canEdit&&!s.marks_submitted&&(
                                  <button onClick={()=>pickSubject(s)} style={{padding:"3px 10px",background:"#0f4c35",border:"none",borderRadius:6,fontSize:11,fontWeight:600,color:"#fff",cursor:"pointer"}}>{entered>0?"Edit":"Enter"}</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {summary&&!summary.all_submitted&&<div style={{padding:"8px 14px",fontSize:11,color:"#854d0e",background:"#fffbeb",borderTop:"1px solid #fde68a"}}>Submit all subjects to compile results.</div>}
                </div>

                {/* Marks Entry Panel */}
                {selectedSub&&(
                  <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #0f4c35",overflow:"hidden"}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{selectedSub.subject_name}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:1}}>Max: {totalMarks} · Pass: {marksData?.passing_marks||40} · {enteredCount}/{totalStudents} entered</div>
                      </div>
                      {!selectedSub?.marks_submitted&&(
                        <div style={{display:"flex",gap:6}}>
                          <button disabled={saving} onClick={saveMarks} style={{padding:"5px 12px",background:"#2563eb",color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer"}}>Save</button>
                          <button disabled={saving} onClick={submitMarks} style={{padding:"5px 12px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer"}}>Submit</button>
                        </div>
                      )}
                      {selectedSub?.marks_submitted&&<span style={{fontSize:11,fontWeight:600,color:"#166534",background:"#dcfce7",padding:"4px 10px",borderRadius:8}}>Submitted - View Only</span>}
                    </div>

                    {/* Progress */}
                    <div style={{padding:"6px 14px",borderBottom:"1px solid #f8fafc",background:"#fafafa"}}>
                      <div style={{height:5,borderRadius:5,background:"#e2e8f0",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:5,background:"#0f4c35",width:(totalStudents>0?enteredCount/totalStudents*100:0)+"%",transition:"width .2s"}} />
                      </div>
                    </div>

                    {loadingMarks?<div style={{padding:24,textAlign:"center",color:"#94a3b8",fontSize:13}}>Loading students...</div>:(
                      <div style={{maxHeight:500,overflowY:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse"}}>
                          <thead style={{position:"sticky",top:0,zIndex:1}}>
                            <tr style={{background:"#f8fafc"}}>
                              <th style={{padding:"8px 10px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>#</th>
                              <th style={{padding:"8px 10px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>Student</th>
                              <th style={{padding:"8px 10px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"center",borderBottom:"1px solid #e2e8f0"}}>Absent</th>
                              <th style={{padding:"8px 10px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"center",borderBottom:"1px solid #e2e8f0"}}>Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(marksData?.students||[]).map((s,i)=>{
                              const m=marks[s.id]||{marks_obtained:"",is_absent:false,remarks:""};
                              const pct=m.marks_obtained!==""&&!m.is_absent?Math.round(Number(m.marks_obtained)/totalMarks*100):null;
                              const pass=marksData?.passing_marks||40;
                              return (
                                <tr key={s.id} style={{borderBottom:"1px solid #f8fafc",background:m.is_absent?"#fff8f8":i%2===0?"#fff":"#fafafa"}}>
                                  <td style={{padding:"7px 10px",fontSize:11,color:"#94a3b8",textAlign:"center"}}>{i+1}</td>
                                  <td style={{padding:"7px 10px"}}>
                                    <div style={{fontWeight:600,fontSize:12}}>{s.first_name} {s.last_name}</div>
                                    {pct!==null&&<div style={{fontSize:10,fontWeight:700,color:pct>=pass?"#166534":"#991b1b"}}>{pct}%</div>}
                                  </td>
                                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                                    <input type="checkbox" checked={m.is_absent} disabled={!!selectedSub?.marks_submitted} onChange={e=>!selectedSub?.marks_submitted&&setMarks(p=>({...p,[s.id]:{...p[s.id],is_absent:e.target.checked,marks_obtained:e.target.checked?"":p[s.id]?.marks_obtained||""}}))} style={{cursor:selectedSub?.marks_submitted?"not-allowed":"pointer",accentColor:"#ef4444",opacity:selectedSub?.marks_submitted?0.6:1}} />
                                  </td>
                                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                                    {m.is_absent?<span style={{fontSize:11,color:"#ef4444",fontWeight:600}}>Absent</span>:
                                    <input type="number" min={0} max={totalMarks} value={m.marks_obtained}
                                      onChange={e=>!selectedSub?.marks_submitted&&setMarks(p=>({...p,[s.id]:{...p[s.id],marks_obtained:e.target.value}}))}
                                      readOnly={!!selectedSub?.marks_submitted}
                                      disabled={!!selectedSub?.marks_submitted}
                                      style={{width:65,padding:"5px 8px",border:"1.5px solid",borderColor:m.marks_obtained!==""?(Number(m.marks_obtained)>=pass?"#22c55e":"#ef4444"):"#e2e8f0",borderRadius:7,fontSize:13,textAlign:"center",fontWeight:700,color:m.marks_obtained!==""?(Number(m.marks_obtained)>=pass?"#166534":"#991b1b"):"#0f172a",background:selectedSub?.marks_submitted?"#f8fafc":"#fff"}} />}
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}