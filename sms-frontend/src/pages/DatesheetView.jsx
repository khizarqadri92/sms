import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import studentsApi from "../api/studentsApi";

export default function DatesheetView() {
  const { user } = useAuth();
  const role = user?.roles?.[0] || "";
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
    <div style={{padding:24,minHeight:"100vh",background:"#f1f5f9"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Exam Datesheet</div>
        <div style={{fontSize:13,color:"#64748b"}}>
          {role==="teacher"?"View published datesheets and your invigilator assignments":
           role==="parent"||role==="student"?"View your class exam schedule":
           "Published exam datesheets"}
        </div>
      </div>

      {/* Child Selector for Parent */}
      {role==="parent"&&children.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:13,fontWeight:600,color:"#374151",flexShrink:0}}>Viewing for:</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {children.filter(c=>c.status!=="withdrawn").map(c=>(
              <div key={c.id} onClick={()=>setSelectedChild(c)} style={{padding:"7px 16px",borderRadius:20,border:"1.5px solid",borderColor:selectedChild?.id===c.id?"#0f4c35":"#e2e8f0",background:selectedChild?.id===c.id?"#f0fdf4":"#fafafa",cursor:"pointer",fontWeight:selectedChild?.id===c.id?700:400,fontSize:13,color:selectedChild?.id===c.id?"#0f4c35":"#374151",transition:"all .15s"}}>
                <div style={{fontWeight:selectedChild?.id===c.id?700:500}}>{c.first_name||""} {c.last_name||""}</div>
                <div style={{fontSize:10,color:selectedChild?.id===c.id?"#166534":"#94a3b8",marginTop:1}}>{c.class_name}{c.class_section?" ("+c.class_section+")":""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam Selector */}
      {exams.length>1&&(
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
          {exams.map(e=>(
            <div key={e.id} onClick={()=>loadDatesheet(e)} style={{padding:"10px 16px",borderRadius:10,border:"1.5px solid",borderColor:selected?.id===e.id?"#0f4c35":"#e2e8f0",background:selected?.id===e.id?"#f0fdf4":"#fff",cursor:"pointer",transition:"all .15s"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{e.name}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{e.exam_type_name} &middot; {e.academic_year}</div>
            </div>
          ))}
        </div>
      )}
      {exams.length===0&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>📅</div><div style={{fontWeight:600}}>No published datesheets yet</div></div>}

      {/* Teacher invigilator summary */}
      {role==="teacher"&&myInvigilatorPapers.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #0f4c35",borderRadius:12,padding:"16px 20px",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:14,color:"#0f4c35",marginBottom:12}}>Your Invigilator Assignments</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {myInvigilatorPapers.map((s,i)=>{
              const dt = new Date(s.exam_date+"T00:00:00");
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"10px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
                  <div style={{width:48,height:48,borderRadius:10,background:"#0f4c35",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase"}}>{dt.toLocaleDateString("en-PK",{month:"short"})}</div>
                    <div style={{fontSize:18,fontWeight:900,lineHeight:1}}>{dt.getDate()}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{s.subject_name}</div>
                    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{s.class_name}{s.section?" ("+s.section+")":""}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:600}}>{s.start_time?String(s.start_time).slice(0,5):"-"}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{s.duration_mins} min &middot; {s.venue||"TBD"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Student own class papers summary - show for mypapers tab or always */}
      {(role==="student"||role==="parent")&&myClassId&&datesheet.filter(s=>s.class_id===myClassId).length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #0f4c35",borderRadius:12,padding:"16px 20px",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:14,color:"#0f4c35",marginBottom:12}}>
            {role==="parent"&&selectedChild?selectedChild.first_name+"'s ":"My "}Exam Schedule
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {datesheet.filter(s=>s.class_id===myClassId).sort((a,b)=>(a.exam_date||"").localeCompare(b.exam_date||"")).map((s,i)=>{
              const dt = new Date(s.exam_date+"T00:00:00");
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"10px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
                  <div style={{width:48,height:48,borderRadius:10,background:"#0f4c35",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase"}}>{dt.toLocaleDateString("en-PK",{month:"short"})}</div>
                    <div style={{fontSize:18,fontWeight:900,lineHeight:1}}>{dt.getDate()}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.7)"}}>{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{s.subject_name}</div>
                    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{s.class_name}{s.section?" ("+s.section+")":""}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{s.start_time?String(s.start_time).slice(0,5):"-"}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{s.duration_mins} min</div>
                    {s.venue&&<div style={{fontSize:11,color:"#64748b"}}>{s.venue}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Datesheet Grid */}
      {selected&&datesheet.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>{selected.name}</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{selected.exam_type_name} &middot; {selected.academic_year} &middot; {datesheet.length} papers</div>
            </div>
            <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"4px 12px",borderRadius:10}}>Published</span>
          </div>
          {loading?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>:(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
                <thead>
                  <tr>
                    <th style={{padding:"10px 14px",background:"#f8fafc",borderRight:"1px solid #e2e8f0",borderBottom:"2px solid #e2e8f0",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",width:120}}>Class</th>
                    {dates.map(d=>{
                      const dt=new Date(d+"T00:00:00");
                      return (
                        <th key={d} style={{padding:"8px 10px",background:"#f8fafc",borderRight:"1px solid #e2e8f0",borderBottom:"2px solid #e2e8f0",textAlign:"center",verticalAlign:"middle"}}>
                          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                          <div style={{fontSize:18,fontWeight:900,color:"#0f172a",lineHeight:1}}>{dt.getDate()}</div>
                          <div style={{fontSize:10,color:"#64748b"}}>{dt.toLocaleDateString("en-PK",{month:"short",year:"numeric"})}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls=>{
                    const isMyClass = myClassId&&cls.class_id===myClassId;
                    return (
                      <tr key={cls.class_id} style={{background:isMyClass?"#f0fdf4":"#fff"}}>
                        <td style={{padding:"8px 12px",background:isMyClass?"#dcfce7":"#fafafa",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle"}}>
                          <div style={{fontSize:12,fontWeight:700,color:isMyClass?"#166534":"#0f172a"}}>{cls.class_name}</div>
                          {cls.section&&<div style={{fontSize:10,color:"#94a3b8"}}>Section {cls.section}</div>}
                          {isMyClass&&<div style={{fontSize:9,fontWeight:600,color:"#166534",marginTop:2}}>MY CLASS</div>}
                        </td>
                        {dates.map(d=>{
                          const cell = cellMap[cls.class_id+"__"+d];
                          const isMyInvig = role==="teacher"&&cell&&myTeacherId&&cell.teacher_id===myTeacherId;
                          return (
                            <td key={d} style={{padding:"6px 8px",borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",textAlign:"center",background:isMyInvig?"#fffbeb":isMyClass&&cell?"#f0fdf4":"#fff"}}>
                              {cell?(
                                <div style={{background:isMyInvig?"#fef9c3":isMyClass?"#dcfce7":"#f8fafc",border:"1px solid",borderColor:isMyInvig?"#fde68a":isMyClass?"#bbf7d0":"#e2e8f0",borderRadius:6,padding:"5px 7px",textAlign:"left"}}>
                                  <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:2}}>{cell.subject_name}</div>
                                  <div style={{fontSize:10,color:"#64748b"}}>{cell.start_time?String(cell.start_time).slice(0,5):""} &middot; {cell.duration_mins}min</div>
                                  {cell.venue&&<div style={{fontSize:10,color:"#94a3b8"}}>{cell.venue}</div>}
                                  {cell.teacher_name&&<div style={{fontSize:10,color:isMyInvig?"#92400e":"#64748b",fontWeight:isMyInvig?700:400,marginTop:2}}>{isMyInvig?"You (Invigilator)":cell.teacher_name}</div>}
                                </div>
                              ):(
                                <span style={{color:"#e2e8f0",fontSize:16}}>—</span>
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