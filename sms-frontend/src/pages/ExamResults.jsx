import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import studentsApi from "../api/studentsApi";

export default function ExamResults() {
  const { user } = useAuth();
  const role = user?.roles?.[0] || "";
  const [exams,        setExams]        = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [results,      setResults]      = useState(null);
  const [children,     setChildren]     = useState([]);
  const [selectedChild,setSelectedChild]= useState(null);
  const [loading,      setLoading]      = useState(false);
  const [myInfo,       setMyInfo]       = useState(null);

  useEffect(()=>{
    examsApi.getAll().then(async r=>{
      const pub = (r.data.data||[]).filter(e=>e.status==="published");
      setExams(pub);
      if(pub.length===1){
        if(role==="student"){
          try{ const mi=await client.get("/students/me"); setMyInfo(mi.data.data); loadResults(pub[0],null,mi.data.data); }catch(e){}
        } else if(role==="parent"){
          // will load after child selected
        }
      }
    }).catch(()=>{});

    if(role==="student"){
      client.get("/students/me").then(r=>{
        setMyInfo(r.data.data);
      }).catch(()=>{});
    }
    if(role==="parent"){
      studentsApi.getMyChildren().then(r=>{
        const kids=(r.data.data||[]).filter(c=>c.status!=="withdrawn");
        console.log("children:", JSON.stringify(kids[0]));
        setChildren(kids);
        if(kids.length===1) setSelectedChild(kids[0]);
      }).catch(()=>{});
    }
  },[]);

  const loadResults = async (exam, child=null, info=null) => {
    setSelectedExam(exam);
    setLoading(true);
    setResults(null);
    try {
      let studentId;
      if(role==="student"){
        const mi = info||myInfo;
        if(!mi){ const r=await client.get("/students/me"); setMyInfo(r.data.data); studentId=r.data.data?.id; } else { studentId=mi.id; }
      } else {
        studentId = child?.id || selectedChild?.id;
        console.log("parent studentId:", studentId, "child:", child, "selectedChild:", selectedChild);
      }
      if(!studentId){ setLoading(false); return; }
      const r = await client.get(`/exams/${exam.id}/student-results/${studentId}`);
      setResults(r.data.data);
    } catch(e){ setResults(null); }
    finally { setLoading(false); }
  };

  const pickChild = async (child) => {
    setSelectedChild(child);
    const exam = selectedExam || exams[0];
    if(exam){ setSelectedExam(exam); await loadResults(exam, child); }
  };

  const subjects = results?.subjects||[];
  const passColor = "#166534"; const failColor = "#991b1b";

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Exam Results</div>
        <div style={{fontSize:13,color:"#64748b"}}>View published exam results</div>
      </div>

      {/* Child Selector for Parent */}
      {role==="parent"&&children.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:13,fontWeight:600,color:"#374151",flexShrink:0}}>Child:</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {children.map(c=>(
              <div key={c.id} onClick={()=>pickChild(c)} style={{padding:"7px 16px",borderRadius:20,border:"1.5px solid",borderColor:selectedChild?.id===c.id?"#0f4c35":"#e2e8f0",background:selectedChild?.id===c.id?"#f0fdf4":"#fafafa",cursor:"pointer",fontWeight:selectedChild?.id===c.id?700:400,fontSize:13,color:selectedChild?.id===c.id?"#0f4c35":"#374151"}}>
                <div>{c.first_name} {c.last_name}</div>
                <div style={{fontSize:10,color:"#94a3b8"}}>{c.class_name}{c.class_section?" ("+c.class_section+")":""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam Selector */}
      {exams.length===0&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div><div style={{fontWeight:600}}>No published results yet</div></div>}
      {exams.length>1&&(
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
          {exams.map(e=>(
            <div key={e.id} onClick={()=>loadResults(e)} style={{padding:"10px 16px",borderRadius:10,border:"1.5px solid",borderColor:selectedExam?.id===e.id?"#0f4c35":"#e2e8f0",background:selectedExam?.id===e.id?"#f0fdf4":"#fff",cursor:"pointer"}}>
              <div style={{fontWeight:700,fontSize:13}}>{e.name}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{e.exam_type_name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Result Card */}
      {loading&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading results...</div>}

      {results&&!loading&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Result Summary */}
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid "+(results.is_pass?"#0f4c35":"#ef4444"),overflow:"hidden"}}>
            <div style={{padding:"20px 24px",background:results.is_pass?"#f0fdf4":"#fff8f8",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontWeight:800,fontSize:20,color:"#0f172a"}}>{selectedExam?.name}</div>
                <div style={{fontSize:13,color:"#64748b",marginTop:4}}>{results.class_name}{results.section?" ("+results.section+")":""} · {selectedExam?.academic_year}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:48,fontWeight:900,color:results.is_pass?passColor:failColor,lineHeight:1}}>{results.percentage}%</div>
                <div style={{fontSize:14,fontWeight:700,background:results.is_pass?"#dcfce7":"#fee2e2",color:results.is_pass?passColor:failColor,padding:"4px 16px",borderRadius:20,marginTop:8}}>{results.is_pass?"PASS":"FAIL"}</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:"1px solid #f1f5f9"}}>
              {[
                {l:"Total Marks",v:results.total_marks},
                {l:"Obtained",v:results.marks_obtained,bold:true},
                {l:"Grade",v:results.grade,color:"#2563eb"},
                {l:"Position",v:results.class_position?"#"+results.class_position:"-",color:"#7c3aed"},
              ].map((item,i)=>(
                <div key={i} style={{padding:"16px",textAlign:"center",borderRight:i<3?"1px solid #f1f5f9":"none"}}>
                  <div style={{fontSize:11,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{item.l}</div>
                  <div style={{fontSize:22,fontWeight:800,color:item.color||"#0f172a"}}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject-wise Results */}
          <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",fontWeight:700,fontSize:15}}>Subject-wise Marks</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Subject","Total","Obtained","Percentage","Status"].map(h=>(
                    <th key={h} style={{padding:"10px 16px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((s,i)=>{
                  const pct = s.marks_obtained!=null&&!s.is_absent ? Math.round(s.marks_obtained/s.total_marks*100) : null;
                  const pass = pct!=null&&pct>=40;
                  return (
                    <tr key={i} style={{borderBottom:"1px solid #f8fafc",background:s.is_absent?"#fff8f8":i%2===0?"#fff":"#fafafa"}}>
                      <td style={{padding:"12px 16px",fontWeight:600,fontSize:13}}>{s.subject_name}</td>
                      <td style={{padding:"12px 16px",fontSize:13,color:"#64748b"}}>{s.total_marks}</td>
                      <td style={{padding:"12px 16px",fontSize:14,fontWeight:700,color:s.is_absent?"#ef4444":pass?passColor:failColor}}>
                        {s.is_absent?"Absent":s.marks_obtained??"-"}
                      </td>
                      <td style={{padding:"12px 16px",fontSize:13,fontWeight:600,color:s.is_absent?"#94a3b8":pass?passColor:failColor}}>
                        {s.is_absent?"-":pct+"%"}
                      </td>
                      <td style={{padding:"12px 16px"}}>
                        {s.is_absent
                          ? <span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Absent</span>
                          : pass
                            ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Pass</span>
                            : <span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Fail</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedExam&&!loading&&!results&&(
        <div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>
          <div style={{fontWeight:600}}>No results found{role==="parent"&&!selectedChild?" — please select a child":""}</div>
        </div>
      )}
    </div>
  );
}