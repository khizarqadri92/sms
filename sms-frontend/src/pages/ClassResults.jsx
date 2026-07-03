import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import client from "../api/client";

export default function ClassResults() {
  const { user } = useAuth();
  const [exams,         setExams]         = useState([]);
  const [myClasses,     setMyClasses]     = useState([]);
  const [selectedExam,  setSelectedExam]  = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [results,       setResults]       = useState(null);
  const [loading,       setLoading]       = useState(false);

  useEffect(()=>{
    examsApi.getAll().then(r=>setExams((r.data.data||[]).filter(e=>["compiled","reviewed","approved","published"].includes(e.status)))).catch(()=>{});
    client.get("/academics/my-classes").then(r=>{
      const inchargeClasses = (r.data.data||[]).filter(c=>c.is_primary);
      setMyClasses(inchargeClasses);
    }).catch(()=>{});
  },[]);

  const loadResults = async (exam, cls) => {
    setLoading(true); setResults(null);
    try {
      const r = await examsApi.getClassResults(exam.id, cls.id);
      setResults(r.data.data);
    } catch(e){}
    finally { setLoading(false); }
  };

  const subjects = results?.subjects||[];
  const students = results?.students||[];

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Class Results</div>
        <div style={{fontSize:13,color:"#64748b"}}>View compiled results for your class</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:20,alignItems:"flex-start"}}>
        {/* Sidebar */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>Exams</div>
            {exams.length===0&&<div style={{padding:"14px",fontSize:12,color:"#94a3b8"}}>No compiled exams.</div>}
            {exams.map(e=>(
              <div key={e.id} onClick={()=>{setSelectedExam(e);setResults(null);if(selectedClass)loadResults(e,selectedClass);}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedExam?.id===e.id?"#0f4c35":"transparent"),background:selectedExam?.id===e.id?"#f0fdf4":"#fff"}}>
                <div style={{fontWeight:600,fontSize:13}}>{e.name}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:1}}>{e.exam_type_name}</div>
              </div>
            ))}
          </div>
          <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:".06em"}}>My Classes</div>
            {myClasses.length===0&&<div style={{padding:"14px",fontSize:12,color:"#94a3b8"}}>No incharge classes.</div>}
            {myClasses.map(c=>(
              <div key={c.id} onClick={()=>{setSelectedClass(c);if(selectedExam)loadResults(selectedExam,c);}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f8fafc",borderLeft:"3px solid "+(selectedClass?.id===c.id?"#0f4c35":"transparent"),background:selectedClass?.id===c.id?"#f0fdf4":"#fff"}}>
                <div style={{fontWeight:600,fontSize:13}}>{c.name}{c.section?" ("+c.section+")":""}</div>
                <div style={{fontSize:10,color:"#166534",fontWeight:600}}>Incharge</div>
              </div>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        <div>
          {!selectedExam&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div><div style={{fontWeight:600}}>Select an exam and class</div></div>}
          {selectedExam&&!selectedClass&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontWeight:600}}>Select your class</div></div>}
          {loading&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading results...</div>}
          {results&&!loading&&(
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc"}}>
                <div style={{fontWeight:700,fontSize:15}}>{selectedClass.name}{selectedClass.section?" ("+selectedClass.section+")":""} — {selectedExam.name}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{students.length} students · {subjects.length} subjects</div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"#f8fafc"}}>
                      <th style={{padding:"9px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",width:30}}>#</th>
                      <th style={{padding:"9px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",minWidth:130}}>Student</th>
                      {subjects.map(s=>(
                        <th key={s.name} style={{padding:"9px 10px",textAlign:"center",borderBottom:"1px solid #e2e8f0",fontWeight:700,color:"#374151",whiteSpace:"nowrap"}}>
                          <div>{s.name}</div><div style={{fontSize:10,color:"#94a3b8",fontWeight:400}}>/{s.total}</div>
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
                        <td style={{padding:"8px 12px",color:"#94a3b8",textAlign:"center"}}>{s.class_position||i+1}</td>
                        <td style={{padding:"8px 12px"}}>
                          <div style={{fontWeight:600,color:"#0f172a"}}>{s.first_name} {s.last_name}</div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>{s.enrollment_no}</div>
                        </td>
                        {subjects.map(sub=>{
                          const sm=s.subject_marks?.[sub.name];
                          return (
                            <td key={sub.name} style={{padding:"8px 10px",textAlign:"center"}}>
                              {sm?.absent?<span style={{fontSize:10,fontWeight:600,color:"#ef4444"}}>Absent</span>:
                               <span style={{fontWeight:600,color:sm&&sm.marks>=sub.total*0.4?"#166534":"#991b1b"}}>{sm?.marks??"-"}</span>}
                            </td>
                          );
                        })}
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700,background:"#fffbeb"}}>{s.total_marks}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700,background:"#fffbeb",color:s.is_pass?"#166534":"#991b1b"}}>{s.marks_obtained}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700,background:"#fffbeb",color:s.is_pass?"#166534":"#991b1b"}}>{s.percentage}%</td>
                        <td style={{padding:"8px 12px",textAlign:"center",fontWeight:700}}>{s.grade}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{s.class_position}</td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          {s.is_pass?<span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Pass</span>:<span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Fail</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}