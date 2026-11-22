import { useState, useEffect } from "react";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import studentsApi from "../api/studentsApi";
import "./ExamViews.css";

export default function DatesheetView() {
  const { user } = useAuth();
  const role = effectiveRole(user) || "";
  const [exams,    setExams]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [datesheet,setDatesheet]= useState([]);
  const [myInfo,   setMyInfo]   = useState(null); // teacher_id or class_id
  const [loading,   setLoading]   = useState(false);
  const [activeSub,  setActiveSub]  = useState("schedule");
  const [children,  setChildren]  = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);

  useEffect(()=>{
    const handler = e => { if(e.detail?.sub) setActiveSub(e.detail.sub); };
    window.addEventListener("subnav-change", handler);
    return ()=>window.removeEventListener("subnav-change", handler);
  },[]);

  useEffect(()=>{
    examsApi.getAll().then(r=>{
      const all = (r.data.data||[]).filter(e=>e.datesheet_published||e.datesheet_status==="published");
      setExams(all);
      if(all.length===1) loadDatesheet(all[0]);
    }).catch(()=>{});

    // Get current user's teacher_id or class info
    if(role==="teacher"){
      client.get("/teachers/me").then(r=>setMyInfo(r.data.data)).catch(()=>{});
    }
    if(role==="student"){
      client.get("/students/me").then(r=>setMyInfo(r.data.data)).catch(()=>{});
    }
    if(role==="parent"){
      studentsApi.getMyChildren().then(r=>{
        const kids = (r.data.data||[]).filter(c=>c.status!=="withdrawn");
        setChildren(kids);
        if(kids.length===1) setSelectedChild(kids[0]);
      }).catch(()=>{});
    }
  },[]);

  const loadDatesheet = async (exam) => {
    setSelected(exam);
    setLoading(true);
    try {
      const r = await examsApi.getSubjects(exam.id);
      setDatesheet(Array.isArray(r.data.data)?r.data.data:[]);
    } catch(e){}
    finally { setLoading(false); }
  };

  const dates = [...new Set(datesheet.map(s=>s.exam_date||""))].filter(Boolean).sort();
  const classes = [...new Map(datesheet.map(s=>[s.class_id,{class_id:s.class_id,class_name:s.class_name,section:s.section}])).values()];
  const cellMap = {};
  datesheet.forEach(s=>{ cellMap[s.class_id+"__"+s.exam_date] = s; });

  // For teacher: highlight papers where they are invigilator
  const myTeacherId = myInfo?.id;
  const myInvigilatorPapers = datesheet.filter(s=>s.teacher_id===myTeacherId);

  // For student/parent: highlight their class papers
  const myClassId = role==="parent" ? selectedChild?.class_id : myInfo?.class_id;

  return (
    <div className="ev-page">
      <div className="ev-head">
        <div className="ev-title">Exam Datesheet</div>
        <div className="ev-sub">
          {role==="teacher"?"View published datesheets and your invigilator assignments":
           role==="parent"||role==="student"?"View your class exam schedule":
           "Published exam datesheets"}
        </div>
      </div>

      {/* Child Selector for Parent */}
      {role==="parent"&&children.length>0&&(
        <div className="ev-childbar">
          <div className="ev-childbar-label">Viewing for:</div>
          <div className="ev-chips">
            {children.filter(c=>c.status!=="withdrawn").map(c=>(
              <div key={c.id} onClick={()=>setSelectedChild(c)} className={"ev-child"+(selectedChild?.id===c.id?" ev-child--on":"")}>
                <div className="ev-child-name">{c.first_name||""} {c.last_name||""}</div>
                <div className="ev-child-class">{c.class_name}{c.class_section?" ("+c.class_section+")":""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam Selector */}
      {exams.length>1&&(
        <div className="ev-exams">
          {exams.map(e=>(
            <div key={e.id} onClick={()=>loadDatesheet(e)} className={"ev-exam"+(selected?.id===e.id?" ev-exam--on":"")}>
              <div className="ev-exam-name">{e.name}</div>
              <div className="ev-exam-meta">{e.exam_type_name} &middot; {e.academic_year}</div>
            </div>
          ))}
        </div>
      )}
      {exams.length===0&&<div className="ev-placeholder ev-placeholder--sm"><div className="ev-placeholder-icon">📅</div><div className="ev-placeholder-title">No published datesheets yet</div></div>}

      {/* Teacher invigilator summary */}
      {role==="teacher"&&myInvigilatorPapers.length>0&&(
        <div className="ev-highlight">
          <div className="ev-highlight-title">Your Invigilator Assignments</div>
          <div className="ev-papers">
            {myInvigilatorPapers.map((s,i)=>{
              const dt = new Date(s.exam_date+"T00:00:00");
              return (
                <div key={i} className="ev-paper">
                  <div className="ev-date">
                    <div className="ev-date-mon">{dt.toLocaleDateString("en-PK",{month:"short"})}</div>
                    <div className="ev-date-day">{dt.getDate()}</div>
                  </div>
                  <div className="ev-paper-main">
                    <div className="ev-paper-subj">{s.subject_name}</div>
                    <div className="ev-paper-class">{s.class_name}{s.section?" ("+s.section+")":""}</div>
                  </div>
                  <div className="ev-paper-side">
                    <div className="ev-paper-time">{s.start_time?String(s.start_time).slice(0,5):"-"}</div>
                    <div className="ev-paper-info">{s.duration_mins} min &middot; {s.venue||"TBD"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Student own class papers summary - show for mypapers tab or always */}
      {(role==="student"||role==="parent")&&myClassId&&datesheet.filter(s=>s.class_id===myClassId).length>0&&(
        <div className="ev-highlight">
          <div className="ev-highlight-title">
            {role==="parent"&&selectedChild?selectedChild.first_name+"'s ":"My "}Exam Schedule
          </div>
          <div className="ev-papers">
            {datesheet.filter(s=>s.class_id===myClassId).sort((a,b)=>(a.exam_date||"").localeCompare(b.exam_date||"")).map((s,i)=>{
              const dt = new Date(s.exam_date+"T00:00:00");
              return (
                <div key={i} className="ev-paper">
                  <div className="ev-date">
                    <div className="ev-date-mon">{dt.toLocaleDateString("en-PK",{month:"short"})}</div>
                    <div className="ev-date-day">{dt.getDate()}</div>
                    <div className="ev-date-wd">{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                  </div>
                  <div className="ev-paper-main">
                    <div className="ev-paper-subj">{s.subject_name}</div>
                    <div className="ev-paper-class">{s.class_name}{s.section?" ("+s.section+")":""}</div>
                  </div>
                  <div className="ev-paper-side">
                    <div className="ev-paper-time">{s.start_time?String(s.start_time).slice(0,5):"-"}</div>
                    <div className="ev-paper-info ev-paper-info--gap">{s.duration_mins} min</div>
                    {s.venue&&<div className="ev-paper-info">{s.venue}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Datesheet Grid */}
      {selected&&datesheet.length>0&&(
        <div className="ev-card">
          <div className="ev-card-head ev-card-head--plain ev-card-head--bar">
            <div>
              <div className="ev-card-title">{selected.name}</div>
              <div className="ev-card-sub">{selected.exam_type_name} &middot; {selected.academic_year} &middot; {datesheet.length} papers</div>
            </div>
            <span className="ev-pill ev-pill--green ev-pill--lg">Published</span>
          </div>
          {loading?<div className="ev-card-loading">Loading...</div>:(
            <div className="ev-scroll">
              <table className="ev-ds">
                <thead>
                  <tr>
                    <th className="ev-ds-classhead">Class</th>
                    {dates.map(d=>{
                      const dt=new Date(d+"T00:00:00");
                      return (
                        <th key={d}>
                          <div className="ev-ds-wd">{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                          <div className="ev-ds-day">{dt.getDate()}</div>
                          <div className="ev-ds-mon">{dt.toLocaleDateString("en-PK",{month:"short",year:"numeric"})}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls=>{
                    const isMyClass = myClassId&&cls.class_id===myClassId;
                    return (
                      <tr key={cls.class_id} className={isMyClass?"ev-ds-mine":""}>
                        <td className="ev-ds-class">
                          <div className="ev-ds-classname">{cls.class_name}</div>
                          {cls.section&&<div className="ev-ds-section">Section {cls.section}</div>}
                          {isMyClass&&<div className="ev-ds-mytag">MY CLASS</div>}
                        </td>
                        {dates.map(d=>{
                          const cell = cellMap[cls.class_id+"__"+d];
                          const isMyInvig = role==="teacher"&&cell&&myTeacherId&&cell.teacher_id===myTeacherId;
                          return (
                            <td key={d} className={"ev-ds-cell"+(isMyInvig?" ev-ds-cell--invig":isMyClass&&cell?" ev-ds-cell--mine":"")}>
                              {cell?(
                                <div className={"ev-slot"+(isMyInvig?" ev-slot--invig":isMyClass?" ev-slot--mine":"")}>
                                  <div className="ev-slot-subj">{cell.subject_name}</div>
                                  <div className="ev-slot-time">{cell.start_time?String(cell.start_time).slice(0,5):""} &middot; {cell.duration_mins}min</div>
                                  {cell.venue&&<div className="ev-slot-venue">{cell.venue}</div>}
                                  {cell.teacher_name&&<div className="ev-slot-teacher">{isMyInvig?"You (Invigilator)":cell.teacher_name}</div>}
                                </div>
                              ):(
                                <span className="ev-ds-none">—</span>
                              )}
                            </td>
                          );
                        })}
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
  );
}
