import React from "react";
﻿import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";

const STATUS_STYLES = {
  draft:      { bg:"#f1f5f9", color:"#475569", label:"Draft" },
  scheduled:  { bg:"#dbeafe", color:"#1e40af", label:"Scheduled" },
  marks_open: { bg:"#fef9c3", color:"#854d0e", label:"Marks Open" },
  submitted:  { bg:"#e0f2fe", color:"#0369a1", label:"Submitted" },
  compiled:   { bg:"#ede9fe", color:"#5b21b6", label:"Compiled" },
  reviewed:   { bg:"#fce7f3", color:"#9d174d", label:"Reviewed" },
  approved:   { bg:"#dcfce7", color:"#166534", label:"Approved" },
  published:  { bg:"#dcfce7", color:"#166534", label:"Published" },
};

const DS_STYLES = {
  draft:     { bg:"#f1f5f9", color:"#475569", label:"Datesheet: Draft" },
  submitted: { bg:"#dbeafe", color:"#1e40af", label:"Datesheet: Awaiting Approval" },
  approved:  { bg:"#fef9c3", color:"#854d0e", label:"Datesheet: Approved" },
  published: { bg:"#dcfce7", color:"#166534", label:"Datesheet: Published" },
};



function DatesheetTab({examId, canManage, navigate, examsApi, detail}) {
  const [datesheet, setDatesheet] = React.useState([]);
  const [loading,   setLoading]   = React.useState(true);

  React.useEffect(()=>{
    examsApi.getSubjects(examId).then(r=>{
      setDatesheet(Array.isArray(r.data.data)?r.data.data:[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[examId]);

  const dates = [...new Set(datesheet.map(s=>s.exam_date||""))].filter(Boolean).sort();
  const classes = [...new Map(datesheet.map(s=>[s.class_id,{class_id:s.class_id,class_name:s.class_name,section:s.section}])).values()];
  const cellMap = {};
  datesheet.forEach(s=>{ cellMap[s.class_id+"__"+s.exam_date]=s; });

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:15}}>{detail.datesheet_status==="published"?"Published Datesheet":"Datesheet"}</div>
        {canManage&&detail.datesheet_status!=="published"&&(
          <button onClick={()=>navigate("/datesheet?exam="+examId)} style={{padding:"7px 16px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Manage Datesheet</button>
        )}
      </div>
      {loading?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>:
      datesheet.length===0?<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>No datesheet entries yet.</div>:(
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
              <thead>
                <tr>
                  <th style={{padding:"10px 14px",background:"#f8fafc",borderRight:"1px solid #e2e8f0",borderBottom:"2px solid #e2e8f0",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",width:120}}>Class</th>
                  {dates.map(d=>{
                    const dt=new Date(d+"T00:00:00");
                    return (
                      <th key={d} style={{padding:"8px 10px",background:"#f8fafc",borderRight:"1px solid #e2e8f0",borderBottom:"2px solid #e2e8f0",textAlign:"center"}}>
                        <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                        <div style={{fontSize:16,fontWeight:900,color:"#0f172a",lineHeight:1}}>{dt.getDate()}</div>
                        <div style={{fontSize:10,color:"#64748b"}}>{dt.toLocaleDateString("en-PK",{month:"short",year:"numeric"})}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {classes.map(cls=>(
                  <tr key={cls.class_id}>
                    <td style={{padding:"8px 12px",background:"#fafafa",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{cls.class_name}</div>
                      {cls.section&&<div style={{fontSize:10,color:"#94a3b8"}}>Section {cls.section}</div>}
                    </td>
                    {dates.map(d=>{
                      const cell=cellMap[cls.class_id+"__"+d];
                      return (
                        <td key={d} style={{padding:"6px 8px",borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",textAlign:"center",background:cell?"#fff":"#fafafa"}}>
                          {cell?(
                            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:6,padding:"5px 7px",textAlign:"left"}}>
                              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:2}}>{cell.subject_name}</div>
                              <div style={{fontSize:10,color:"#64748b"}}>{cell.start_time?String(cell.start_time).slice(0,5):""} · {cell.duration_mins}min</div>
                              {cell.venue&&<div style={{fontSize:10,color:"#94a3b8"}}>{cell.venue}</div>}
                              {cell.teacher_name&&<div style={{fontSize:10,color:"#64748b",marginTop:2}}>{cell.teacher_name}</div>}
                            </div>
                          ):<span style={{color:"#e2e8f0",fontSize:16}}>?</span>}
                        </td>
                      );
                    })}
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

function ResultsTab({examId, detail, canManage, canApprove, acting, doAction, examsApi}) {
  const [compStatus,    setCompStatus]    = React.useState(null);
  const [selectedClass, setSelectedClass] = React.useState(null);
  const [classResults,  setClassResults]  = React.useState(null);
  const [loadingClass,  setLoadingClass]  = React.useState(false);

  React.useEffect(()=>{
    examsApi.getCompilationStatus(examId).then(r=>setCompStatus(r.data.data)).catch(()=>{});
  },[examId]);

  const [reminding, setReminding] = React.useState({});

  const sendReminder = async (userId, name, type) => {
    setReminding(p=>({...p,[userId]:true}));
    try {
      const msg = type==="compile"
        ? "All subject marks have been submitted. Please compile the results for your class."
        : "Please submit your exam marks as soon as possible.";
      const title = type==="compile" ? "Please Compile Results" : "Marks Submission Reminder";
      await examsApi.sendReminder(examId, {user_id:userId, title, message:msg});
      alert("Reminder sent to "+name);
    } catch(e){ alert("Failed to send reminder."); }
    finally { setReminding(p=>({...p,[userId]:false})); }
  };

  const loadClassResults = async (cls) => {
    if(selectedClass?.class_id===cls.class_id){ setSelectedClass(null); setClassResults(null); return; }
    setSelectedClass(cls);
    setLoadingClass(true);
    try {
      if(cls.is_compiled){
        const r = await examsApi.getClassResults(examId, cls.class_id);
        setClassResults({...r.data.data, mode:"compiled"});
      } else {
        const r = await examsApi.getClassMarksSummary(examId, cls.class_id);
        const d = r.data.data||{};
        console.log("pending summary:", JSON.stringify(d));
        setClassResults({subjects: d.subjects||[], all_submitted: d.all_submitted, incharge: d.incharge||null, mode:"pending"});
      }
    } catch(e){}
    finally { setLoadingClass(false); }
  };

  const subjects = classResults?.subjects||[];
  const students = classResults?.students||[];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Action bar */}
      <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>Results Overview</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
            {compStatus?compStatus.compiled+"/"+compStatus.total+" classes compiled":"Loading..."}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {compStatus?.all_compiled&&canManage&&detail.status==="compiled"&&(
            <button disabled={acting} onClick={()=>doAction(()=>examsApi.updateStatus(examId,{status:"reviewed"}),"Sent for principal approval.")} style={{padding:"8px 20px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Send for Principal Approval</button>
          )}
          {detail.status==="reviewed"&&canApprove&&(
            <button disabled={acting} onClick={()=>doAction(()=>examsApi.approve(examId),"Results approved.")} style={{padding:"8px 20px",background:"#166534",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Approve Results</button>
          )}
          {detail.status==="approved"&&canManage&&(
            <button disabled={acting} onClick={()=>doAction(()=>examsApi.publish(examId),"Results published!")} style={{padding:"8px 20px",background:"#166534",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Publish Results</button>
          )}
          {!compStatus?.all_compiled&&!["reviewed","approved","published"].includes(detail.status)&&(
            <span style={{fontSize:12,color:"#854d0e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"6px 14px",fontWeight:600}}>Waiting for all classes to compile results</span>
          )}
          {detail.status==="published"&&(
            <span style={{fontSize:12,fontWeight:700,background:"#dcfce7",color:"#166534",padding:"6px 16px",borderRadius:8}}>Results Published</span>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:selectedClass?"280px 1fr":"1fr",gap:16,alignItems:"flex-start"}}>
        {/* Class List */}
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontWeight:700,fontSize:13}}>Classes</div>
          {(compStatus?.classes||[]).map((cls,i)=>(
            <div key={i} onClick={()=>loadClassResults(cls)}
              style={{padding:"12px 16px",borderBottom:"1px solid #f8fafc",cursor:"pointer",background:selectedClass?.class_id===cls.class_id?"#f0fdf4":"#fff",borderLeft:"3px solid "+(selectedClass?.class_id===cls.class_id?"#0f4c35":cls.is_compiled?"#22c55e":"#e2e8f0"),transition:"all .1s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontWeight:700,fontSize:13}}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</div>
                {cls.is_compiled
                  ? <span style={{fontSize:10,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"1px 7px",borderRadius:8}}>Compiled</span>
                  : <span style={{fontSize:10,fontWeight:600,background:"#f1f5f9",color:"#94a3b8",padding:"1px 7px",borderRadius:8}}>Pending</span>
                }
              </div>
              <div style={{fontSize:11,color:"#64748b",display:"flex",gap:10}}>
                <span>Incharge: {cls.incharge_name||"-"}</span>
              </div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2,display:"flex",gap:10}}>
                <span>Subjects: <strong style={{color:cls.subjects_submitted===cls.subjects_total&&cls.subjects_total>0?"#166534":"#854d0e"}}>{cls.subjects_submitted}/{cls.subjects_total}</strong></span>
                <span>Students: {cls.student_count}</span>
              </div>
              <div style={{fontSize:10,color:"#0f4c35",marginTop:3,fontWeight:600}}>{cls.is_compiled?"Click to view results":"Click to view marks statusatus ?"}</div>
            </div>
          ))}
        </div>

        {/* Class Results Detail */}
        {selectedClass&&(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #0f4c35",overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{selectedClass.class_name}{selectedClass.section?" ("+selectedClass.section+")":""} — {classResults?.mode==="pending"?"Marks Status":"Results"}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{classResults?.mode==="pending"?(classResults?.subjects?.length||0)+" subjects":(students.length+" students · "+subjects.length+" subjects")}</div>
              </div>
              <button onClick={()=>{setSelectedClass(null);setClassResults(null);}} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>&#215;</button>
            </div>
            {loadingClass?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>:classResults?.mode==="pending"?(
              <div style={{padding:"16px 20px"}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#0f172a"}}>Subject Marks Status</div>
                {/* Class Incharge Info */}
  {classResults?.incharge&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".08em",marginBottom:2}}>Class Incharge</div>
                      <div style={{fontWeight:700,fontSize:13,color:"#1e40af",marginTop:2}}>{classResults.incharge.name}</div>
                    </div>
                    {classResults?.all_submitted&&(
                      <button disabled={reminding[classResults.incharge.user_id]} onClick={()=>sendReminder(classResults.incharge.user_id,classResults.incharge.name,"compile")} style={{padding:"5px 12px",background:"#2563eb",color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        {reminding[classResults.incharge.user_id]?"Sending...":"Remind to Compile"}
                      </button>
                    )}
                  </div>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {(classResults?.subjects||[]).map((s,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:s.marks_submitted?"#f0fdf4":"#fffbeb",borderRadius:8,border:"1px solid "+(s.marks_submitted?"#bbf7d0":"#fde68a")}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13}}>{s.subject_name}</div>
                        <div style={{fontSize:11,marginTop:3,display:"flex",alignItems:"center",gap:8}}>
                          {s.subject_teacher_name
                            ? <span style={{color:"#2563eb",fontWeight:600}}>{s.subject_teacher_name}</span>
                            : <span style={{color:"#94a3b8"}}>No teacher assigned</span>
                          }
                          {s.exam_date&&<span style={{color:"#94a3b8"}}> {s.exam_date}</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {s.marks_submitted
                          ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"3px 10px",borderRadius:8}}>Submitted</span>
                          : <>
                              <span style={{fontSize:11,fontWeight:700,background:"#fef9c3",color:"#854d0e",padding:"3px 10px",borderRadius:8}}>? Pending</span>
                              {s.teacher_user_id&&(
                                <button disabled={reminding[s.teacher_user_id]} onClick={()=>sendReminder(s.teacher_user_id,s.subject_teacher_name,"marks")} style={{padding:"3px 10px",background:"#f59e0b",color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                                  {reminding[s.teacher_user_id]?"...":"?? Remind"}
                                </button>
                              )}
                            </>
                        }
                      </div>
                    </div>
                  ))}
                </div>
                {classResults?.all_submitted&&(
                  <div style={{marginTop:8,padding:"10px 14px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,fontSize:12,color:"#166534",fontWeight:600}}>
                    ? All marks submitted. Waiting for class incharge to compile.
                  </div>
                )}
              </div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"#f8fafc"}}>
                      <th style={{padding:"9px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",position:"sticky",left:0,background:"#f8fafc",zIndex:1}}>#</th>
                      <th style={{padding:"9px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",position:"sticky",left:30,background:"#f8fafc",zIndex:1,minWidth:140}}>Student</th>
                      {subjects.map(s=>(
                        <th key={s.name} style={{padding:"9px 10px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",whiteSpace:"nowrap",minWidth:80}}>
                          <div>{s.name}</div>
                          <div style={{fontSize:10,color:"#94a3b8",fontWeight:400}}>/{s.total}</div>
                        </th>
                      ))}
                      <th style={{padding:"9px 12px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",background:"#fef9c3"}}>Total</th>
                      <th style={{padding:"9px 12px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",background:"#fef9c3"}}>Obtained</th>
                      <th style={{padding:"9px 12px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",background:"#fef9c3"}}>%</th>
                      <th style={{padding:"9px 12px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151"}}>Grade</th>
                      <th style={{padding:"9px 12px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151"}}>Pos</th>
                      <th style={{padding:"9px 12px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151"}}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s,i)=>(
                      <tr key={s.id} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                        <td style={{padding:"8px 12px",color:"#94a3b8",textAlign:"center",position:"sticky",left:0,background:i%2===0?"#fff":"#fafafa"}}>{s.class_position||i+1}</td>
                        <td style={{padding:"8px 12px",position:"sticky",left:30,background:i%2===0?"#fff":"#fafafa"}}>
                          <div style={{fontWeight:600,color:"#0f172a"}}>{s.first_name} {s.last_name}</div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>{s.enrollment_no}</div>
                        </td>
                        {subjects.map(sub=>{
                          const sm = s.subject_marks?.[sub.name];
                          return (
                            <td key={sub.name} style={{padding:"8px 10px",textAlign:"center"}}>
                              {sm?.absent
                                ? <span style={{fontSize:10,fontWeight:600,color:"#ef4444"}}>Absent</span>
                                : <span style={{fontWeight:600,color:sm&&sm.marks>=sub.total*0.4?"#166534":"#991b1b"}}>{sm?.marks??"-"}</span>
                              }
                            </td>
                          );
                        })}
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700,background:"#fffbeb"}}>{s.total_marks}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700,background:"#fffbeb",color:s.is_pass?"#166534":"#991b1b"}}>{s.marks_obtained}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700,background:"#fffbeb",color:s.is_pass?"#166534":"#991b1b"}}>{s.percentage}%</td>
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700}}>{s.grade}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{s.class_position}</td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          {s.is_pass
                            ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Pass</span>
                            : <span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Fail</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExamDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const activeTab = searchParams.get("tab") || "overview";
  const setTab = (t) => setSearchParams({tab:t});

  const canManage  = can("exam.manage");
  const canApprove = can("exam.approve");
  const canMarks   = can("exam.marks");
  const canCompile = can("exam.compile");

  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash,   setFlash]   = useState({});
  const [acting,      setActing]      = useState(false);
  const [compStatus,  setCompStatus]  = useState(null);

  const notify = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash({}),4000); };

  const loadDetail = async () => {
    try {
      const r = await examsApi.getOne(Number(id));
      setDetail(r.data.data);
    } catch(e){ notify("error","Failed to load exam."); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadDetail(); },[id]);

  useEffect(()=>{
    if(activeTab==="results"&&detail){
      examsApi.getCompilationStatus(Number(id)).then(r=>setCompStatus(r.data.data)).catch(()=>{});
    }
  },[activeTab,detail]);

  const doAction = async (fn, msg) => {
    setActing(true);
    try { await fn(); notify("success", msg); loadDetail(); }
    catch(e){ notify("error", e.response?.data?.message||"Failed."); }
    finally { setActing(false); }
  };

  if(loading) return <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>;
  if(!detail) return <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Exam not found.</div>;

  const ds = detail.datesheet_status || "draft";
  const dsStyle = DS_STYLES[ds] || DS_STYLES.draft;
  const stStyle = STATUS_STYLES[detail.status] || STATUS_STYLES.draft;

  const tabs = [
    {k:"overview", l:"Overview"},
    {k:"datesheet", l:"Datesheet"},
    ...(canMarks&&(detail.status==="marks_open"||detail.status==="compiled"||detail.status==="reviewed"||detail.status==="approved"||detail.status==="published") ? [{k:"marks",l:"Marks"}] : []),
    ...((detail.status==="compiled"||detail.status==="reviewed"||detail.status==="approved"||detail.status==="published")&&(canManage||canApprove) ? [{k:"results",l:"Results"}] : []),
  ];

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      {/* Back + Header */}
      <div style={{marginBottom:20}}>
        <button onClick={()=>navigate("/exams")} style={{background:"none",border:"none",color:"#0f4c35",fontWeight:600,fontSize:13,cursor:"pointer",padding:0,marginBottom:12}}>&#8592; Back to Exams</button>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:6}}>{detail.name}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:12,color:"#64748b"}}>{detail.exam_type_name}</span>
              <span style={{color:"#cbd5e1"}}>·</span>
              <span style={{fontSize:12,color:"#64748b"}}>{detail.academic_year}</span>
              <span style={{color:"#cbd5e1"}}>·</span>
              <span style={{fontSize:12,color:"#64748b"}}>{detail.class_count} class{detail.class_count!==1?"es":""}</span>
              {detail.start_date&&<><span style={{color:"#cbd5e1"}}>·</span><span style={{fontSize:12,color:"#64748b"}}>{detail.start_date} — {detail.end_date}</span></>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:600,background:dsStyle.bg,color:dsStyle.color,padding:"4px 12px",borderRadius:20}}>{dsStyle.label}</span>
            <span style={{fontSize:11,fontWeight:600,background:stStyle.bg,color:stStyle.color,padding:"4px 12px",borderRadius:20}}>{stStyle.label}</span>
          </div>
        </div>
      </div>

      {flash.msg&&<div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,background:flash.type==="error"?"#fef2f2":"#f0fdf4",border:"1px solid "+(flash.type==="error"?"#fecaca":"#bbf7d0"),color:flash.type==="error"?"#991b1b":"#166534",fontSize:13}}>{flash.msg}</div>}

      {/* Progress Steps */}
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"16px 20px",marginBottom:20,overflowX:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:0,minWidth:500}}>
          {[
            {label:"Create",done:true},
            {label:"Datesheet",done:["published","approved","submitted"].includes(detail.datesheet_status||""), v:detail.datesheet_status||"Not started"},
            {label:"Marks Entry",done:["submitted","compiled","reviewed","approved","published"].includes(detail.status),active:detail.status==="marks_open"},
            {label:"Compile",done:["compiled","reviewed","approved","published"].includes(detail.status)},
            {label:"Approve",done:["approved","published"].includes(detail.status),active:detail.status==="reviewed"},
            {label:"Publish",done:detail.status==="published",active:detail.status==="approved"},
          ].map((s,i,arr)=>(
            <div key={i} style={{display:"flex",alignItems:"center",flex:1}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:s.done?"#0f4c35":s.active?"#2563eb":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:s.done||s.active?"#fff":"#94a3b8",flexShrink:0}}>
                  {s.done?"✓":i+1}
                </div>
                <div style={{fontSize:10,fontWeight:s.active?700:500,color:s.active?"#2563eb":s.done?"#0f4c35":"#94a3b8",whiteSpace:"nowrap"}}>{s.label}</div>
              </div>
              {i<arr.length-1&&<div style={{flex:1,height:2,background:s.done?"#0f4c35":"#e2e8f0",margin:"0 4px",marginBottom:16}} />}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>

        {canManage&&detail.datesheet_status==="draft"&&detail.datesheet_published===false&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.submitDatesheet(Number(id)),"Datesheet submitted.")} style={{padding:"8px 18px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Submit Datesheet</button>
        )}
        {canApprove&&detail.datesheet_status==="submitted"&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.approveDatesheet(Number(id)),"Datesheet approved.")} style={{padding:"8px 18px",background:"#166534",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Approve Datesheet</button>
        )}

        {canManage&&detail.datesheet_published&&detail.status==="scheduled"&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.openMarks(Number(id)),"Marks entry opened!")} style={{padding:"8px 18px",background:"#d97706",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Open Marks Entry</button>
        )}
        {canMarks&&detail.status==="marks_open"&&(
          <button onClick={()=>navigate("/exam-marks?exam="+id)} style={{padding:"8px 18px",background:"#854d0e",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Enter Marks</button>
        )}
        {canManage&&detail.status==="compiled"&&(
          <button disabled={acting} onClick={()=>doAction(()=>examsApi.updateStatus(Number(id),{status:"reviewed"}),"Sent for approval.")} style={{padding:"8px 18px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Send for Approval</button>
        )}


      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"2px solid #e2e8f0",marginBottom:20}}>
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"10px 20px",border:"none",borderBottom:"2px solid "+(activeTab===t.k?"#0f4c35":"transparent"),marginBottom:-2,background:"transparent",color:activeTab===t.k?"#0f4c35":"#64748b",fontWeight:activeTab===t.k?700:500,fontSize:14,cursor:"pointer"}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab==="overview"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:"#fff",borderRadius:12,padding:"20px",border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Exam Details</div>
            {[
              {l:"Exam Name", v:detail.name},
              {l:"Type", v:detail.exam_type_name},
              {l:"Academic Year", v:detail.academic_year},
              {l:"Classes", v:(detail.class_names||detail.class_count+" classes")},
              {l:"Start Date", v:detail.start_date||"-"},
              {l:"End Date", v:detail.end_date||"-"},
            ].map((row,i)=>(
              <div key={i} style={{display:"flex",gap:16,padding:"8px 0",borderBottom:"1px solid #f8fafc"}}>
                <div style={{fontSize:12,color:"#64748b",width:120,flexShrink:0}}>{row.l}</div>
                <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{row.v}</div>
              </div>
            ))}
          </div>
          <div style={{background:"#fff",borderRadius:12,padding:"20px",border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Status Timeline</div>
            {[
              {l:"Exam Created", done:true, v:"Exam record created"},
              {l:"Datesheet", done:["published","approved"].includes(detail.datesheet_status||""), v:detail.datesheet_status||"Not started"},
              {l:"Marks Entry", done:["marks_open","compiled","reviewed","approved","published"].includes(detail.status), v:["marks_open","compiled","reviewed","approved","published"].includes(detail.status)?"Done":"Not started"},
              {l:"Results Compiled", done:["compiled","reviewed","approved","published"].includes(detail.status), v:["compiled","reviewed","approved","published"].includes(detail.status)?"Done":"Pending"},
              {l:"Results Approved", done:["approved","published"].includes(detail.status), v:["approved","published"].includes(detail.status)?"Approved":detail.status==="reviewed"?"Awaiting Approval":"Pending"},
              {l:"Results Published", done:detail.status==="published", v:detail.status==="published"?"Published":"Pending"},
            ].map((row,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:"1px solid #f8fafc"}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:row.done?"#0f4c35":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {row.done&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#0f172a"}}>{row.l}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{row.v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Datesheet Tab */}
      {activeTab==="datesheet"&&<DatesheetTab examId={Number(id)} canManage={canManage} navigate={navigate} examsApi={examsApi} detail={detail} />}

      {/* Marks Tab */}
      {activeTab==="marks"&&(
        <div style={{background:"#fff",borderRadius:12,padding:"20px",border:"1px solid #e2e8f0",textAlign:"center",color:"#64748b"}}>
          <div style={{fontSize:32,marginBottom:12}}>📝</div>
          <div style={{fontWeight:600,fontSize:15,marginBottom:8}}>Exam Marks Entry</div>
          <div style={{fontSize:13,marginBottom:16}}>Enter and manage student marks for each subject.</div>
          <button onClick={()=>navigate("/exam-marks?exam="+id)} style={{padding:"10px 24px",background:"#854d0e",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>Go to Marks Entry →</button>
        </div>
      )}

      {/* Results Tab */}
      {activeTab==="results"&&<ResultsTab examId={Number(id)} detail={detail} canManage={canManage} canApprove={canApprove} acting={acting} doAction={doAction} examsApi={examsApi} />}

    </div>
  );
}