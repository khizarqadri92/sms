import { useState, useEffect } from "react";
import { examsApi } from "../api/examsApi";
import client from "../api/client";

export default function MarksHistory() {
  const [exams,        setExams]        = useState([]);
  const [myClasses,    setMyClasses]    = useState([]);
  const [mySubjects,   setMySubjects]   = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [selectedClass,setSelectedClass]= useState(null);
  const [selectedSub,  setSelectedSub]  = useState(null);
  const [marksData,    setMarksData]    = useState(null);
  const [loading,      setLoading]      = useState(false);

  useEffect(()=>{
    examsApi.getAll().then(r=>setExams((r.data.data||[]).filter(e=>e.status!=="draft"))).catch(()=>{});
    client.get("/academics/my-classes").then(r=>setMyClasses(r.data.data||[])).catch(()=>{});
    client.get("/academics/my-subjects").then(r=>setMySubjects(r.data.data||[])).catch(()=>{});
  },[]);

  const [classSubjects, setClassSubjects] = useState([]);

  const pickClass = async (cls) => {
    setSelectedClass(cls); setSelectedSub(null); setMarksData(null);
    if(!selectedExam) return;
    const r = await examsApi.getSubjects(selectedExam.id);
    let subs = (r.data.data||[]).filter(s=>s.class_id===cls.id);
    const isIncharge = cls.is_primary;
    if(!isIncharge){
      const mySubIds = mySubjects.map(s=>s.id);
      subs = subs.filter(s=>mySubIds.includes(s.subject_id));
    }
    setClassSubjects(subs);
  };

  const pickSubject = async (sub) => {
    setSelectedSub(sub); setLoading(true);
    try {
      const r = await examsApi.getMarksEntry(selectedExam.id, selectedClass.id, sub.subject_id);
      setMarksData(r.data.data);
    } catch(e){}
    finally { setLoading(false); }
  };

  const totalMarks = marksData?.total_marks||100;
  const passing = marksData?.passing_marks||40;

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Marks History</div>
        <div style={{fontSize:13,color:"#64748b"}}>View marks you have entered for your subjects</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:20,alignItems:"flex-start"}}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Exams */}
          <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>Exams</div>
            {exams.map(e=>(
              <div key={e.id} onClick={()=>{setSelectedExam(e);setSelectedClass(null);setSelectedSub(null);setMarksData(null);}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedExam?.id===e.id?"#0f4c35":"transparent"),background:selectedExam?.id===e.id?"#f0fdf4":"#fff"}}>
                <div style={{fontWeight:600,fontSize:13}}>{e.name}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{e.exam_type_name}</div>
              </div>
            ))}
          </div>
          {/* Classes */}
          {selectedExam&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>Classes</div>
            {myClasses.map(c=>(
              <div key={c.id} onClick={()=>pickClass(c)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedClass?.id===c.id?"#0f4c35":"transparent"),background:selectedClass?.id===c.id?"#f0fdf4":"#fff"}}>
                <div style={{fontWeight:600,fontSize:13}}>{c.name}{c.section?" ("+c.section+")":""}</div>
              </div>
            ))}
          </div>}
          {/* Subjects */}
          {selectedClass&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>My Subjects</div>
            {classSubjects.length===0&&<div style={{padding:"14px",fontSize:12,color:"#94a3b8"}}>No subjects found.</div>}
            {classSubjects.map(s=>(
              <div key={s.id} onClick={()=>pickSubject(s)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedSub?.subject_id===s.subject_id?"#0f4c35":s.marks_submitted?"#22c55e":"transparent"),background:selectedSub?.subject_id===s.subject_id?"#f0fdf4":"#fff"}}>
                <div style={{fontWeight:600,fontSize:13}}>{s.subject_name}</div>
                <div style={{fontSize:10,marginTop:2}}>{s.marks_submitted?<span style={{color:"#166534",fontWeight:600}}>Submitted</span>:<span style={{color:"#854d0e"}}>Pending</span>}</div>
              </div>
            ))}
          </div>}
        </div>

        {/* Marks Table */}
        <div>
          {!selectedExam&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>📝</div><div style={{fontWeight:600}}>Select exam → class → subject</div></div>}
          {loading&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}
          {marksData&&!loading&&(
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{selectedSub.subject_name} — {selectedClass.name}{selectedClass.section?" ("+selectedClass.section+")":""}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Max: {totalMarks} · Passing: {passing} · {marksData.students?.length||0} students</div>
                </div>
                {selectedSub.marks_submitted&&<span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"4px 12px",borderRadius:10}}>Submitted ✓</span>}
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["#","Student","Marks / "+totalMarks,"%","Status"].map(h=>(
                      <th key={h} style={{padding:"10px 16px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(marksData.students||[]).map((s,i)=>{
                    const m = s.marks_obtained;
                    const absent = s.is_absent;
                    const pct = m!=null&&!absent?Math.round(m/totalMarks*100):null;
                    return (
                      <tr key={s.id} style={{borderBottom:"1px solid #f8fafc",background:absent?"#fff8f8":i%2===0?"#fff":"#fafafa"}}>
                        <td style={{padding:"10px 16px",color:"#94a3b8",fontSize:12}}>{i+1}</td>
                        <td style={{padding:"10px 16px"}}>
                          <div style={{fontWeight:600,fontSize:13}}>{s.first_name} {s.last_name}</div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>{s.enrollment_no}</div>
                        </td>
                        <td style={{padding:"10px 16px",fontSize:14,fontWeight:700,color:absent?"#ef4444":pct&&pct>=passing?"#166534":"#991b1b"}}>{absent?"Absent":m??"-"}</td>
                        <td style={{padding:"10px 16px",fontSize:13,fontWeight:600,color:absent?"#94a3b8":pct&&pct>=passing?"#166534":"#991b1b"}}>{absent?"-":pct+"%"}</td>
                        <td style={{padding:"10px 16px"}}>
                          {absent?<span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Absent</span>:
                           pct&&pct>=passing?<span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Pass</span>:
                           m!=null?<span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Fail</span>:
                           <span style={{fontSize:11,color:"#94a3b8"}}>-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}