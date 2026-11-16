import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import studentsApi from "../api/studentsApi";
import "./StudentViews.css";

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

  const [docBusy, setDocBusy] = useState("");
  const downloadDoc = async (kind) => {
    if (!selectedExam) return;
    const studentId = role==="student" ? myInfo?.id : selectedChild?.id;
    if (!studentId) return;
    setDocBusy(kind);
    try {
      const path = kind==="cert" ? "certificate" : "result-card";
      const r = await client.get(`/exams/${selectedExam.id}/${path}/${studentId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind==="cert"?"Certificate":"ResultCard"}_${selectedExam.name}.pdf`.replace(/\s+/g,"_");
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      let m = "Download failed.";
      try { const t = JSON.parse(await e.response.data.text()); m = t.message || m; } catch {}
      alert(m);
    } finally { setDocBusy(""); }
  };
  const downloadCard = () => downloadDoc("card");

  const pickChild = async (child) => {
    setSelectedChild(child);
    const exam = selectedExam || exams[0];
    if(exam){ setSelectedExam(exam); await loadResults(exam, child); }
  };

  const subjects = results?.subjects||[];

  return (
    <div className="sv-er-page">
      <div className="sv-er-head">
        <div className="sv-er-title">Exam Results</div>
        <div className="sv-er-sub">View published exam results</div>
      </div>

      {/* Child Selector for Parent */}
      {role==="parent"&&children.length>0&&(
        <div className="sv-er-childbar">
          <div className="sv-er-childlabel">Child:</div>
          <div className="sv-chips">
            {children.map(c=>(
              <div key={c.id} onClick={()=>pickChild(c)} className={"sv-er-child"+(selectedChild?.id===c.id?" sv-er-child--on":"")}>
                <div>{c.first_name} {c.last_name}</div>
                <div className="sv-er-child-class">{c.class_name}{c.class_section?" ("+c.class_section+")":""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam Selector */}
      {exams.length===0&&<div className="sv-er-placeholder"><div className="sv-er-ph-icon">📊</div><div className="sv-er-ph-title">No published results yet</div></div>}
      {exams.length>1&&(
        <div className="sv-er-exams">
          {exams.map(e=>(
            <div key={e.id} onClick={()=>loadResults(e)} className={"sv-er-exam"+(selectedExam?.id===e.id?" sv-er-exam--on":"")}>
              <div className="sv-er-exam-name">{e.name}</div>
              <div className="sv-er-exam-type">{e.exam_type_name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Result Card */}
      {loading&&<div className="sv-er-placeholder">Loading results...</div>}

      {results?.withheld&&!loading&&(
        <div className="sv-er-withheld">
          <div className="sv-er-withheld-icon">&#128274;</div>
          <div>
            <div className="sv-er-withheld-title">Result withheld</div>
            <div className="sv-er-withheld-text">{results.message}</div>
            <a href={role === "parent" && selectedChild ? "/my-fees?studentId=" + selectedChild.id : "/my-fees"} className="sv-er-withheld-link">Go to My Fees &rarr;</a>
          </div>
        </div>
      )}

      {results&&!results.withheld&&!loading&&(
        <div className="sv-er-stack">
          {/* Result Summary */}
          <div className={"sv-er-summary"+(results.is_pass?"":" sv-er-summary--fail")}>
            <div className="sv-er-banner">
              <div>
                <div className="sv-er-exam-title">{selectedExam?.name}</div>
                <div className="sv-er-doc-row">
                <button onClick={downloadCard} disabled={docBusy==="card"} className="sv-er-download">
                  Download Result Card
                </button>
                {results.final?.certificate_available&&(
                  <button onClick={()=>downloadDoc("cert")} disabled={docBusy==="cert"} className="sv-er-download sv-er-download--cert">
                    {docBusy==="cert"?"Preparing...":"Download Certificate"}
                  </button>
                )}
                </div>
                <div className="sv-er-classline">{results.class_name}{results.section?" ("+results.section+")":""} · {selectedExam?.academic_year}</div>
              </div>
              <div className="sv-er-score">
                <div className="sv-er-pct">{results.percentage}%</div>
                <div className="sv-er-verdict">{results.is_pass?"PASS":results.is_compartment?"COMPARTMENT":"FAIL"}</div>
              </div>
            </div>
            <div className="sv-er-figs">
              {[
                {l:"Total Marks",v:results.total_marks},
                {l:"Obtained",v:results.marks_obtained,bold:true},
                {l:"Grade",v:results.grade,tone:"blue"},
                {l:"Position",v:results.class_position?"#"+results.class_position:"-",tone:"purple"},
              ].map((item,i)=>(
                <div key={i} className="sv-er-fig">
                  <div className="sv-er-fig-label">{item.l}</div>
                  <div className={"sv-er-fig-value"+(item.tone?" sv-er-fig-value--"+item.tone:"")}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Final (year) result - shown on the year's final exam */}
          {results.final&&(
            <div className={"sv-er-final"+(results.final.is_pass?"":results.final.is_compartment?" sv-er-final--comp":" sv-er-final--fail")}>
              <div>
                <div className="sv-er-final-label">Final Result · Academic Year {selectedExam?.academic_year}</div>
                <div className="sv-er-final-sub">Combined from all of this year&apos;s exams, assignments and quizzes</div>
              </div>
              <div className="sv-er-final-figs">
                <span><b>{results.final.percentage.toFixed(2)}%</b> overall</span>
                <span>Grade <b>{results.final.grade}</b></span>
                {results.final.class_position&&<span>Position <b>{results.final.class_position}</b></span>}
                <span className="sv-er-final-verdict">{results.final.is_pass?"PASSED":results.final.is_compartment?"COMPARTMENT":"FAILED"}</span>
              </div>
            </div>
          )}

          {/* Subject-wise Results */}
          <div className="sv-er-card">
            <div className="sv-er-card-head">Subject-wise Marks</div>
            <div className="sv-scroll"><table className="sv-er-table">
              <thead>
                <tr>
                  {["Subject","Total","Obtained","Percentage","Status"].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((s,i)=>{
                  const pct = s.marks_obtained!=null&&!s.is_absent ? Math.round(s.marks_obtained/s.total_marks*100) : null;
                  const pass = pct!=null&&pct>=40;
                  const tone = s.is_absent ? "sv-er-absent" : pass ? "sv-er-pass" : "sv-er-fail";
                  return (
                    <tr key={i} className={s.is_absent?"sv-er-absent-row":""}>
                      <td className="sv-er-subj">{s.subject_name}</td>
                      <td className="sv-er-total">{s.total_marks}</td>
                      <td className={"sv-er-mark "+tone}>
                        {s.is_absent?"Absent":s.marks_obtained??"-"}
                      </td>
                      <td className={"sv-er-mpct "+(s.is_absent?"sv-er-dim":tone)}>
                        {s.is_absent?"-":pct+"%"}
                      </td>
                      <td>
                        {s.is_absent
                          ? <span className="sv-er-pill sv-er-pill--fail">Absent</span>
                          : pass
                            ? <span className="sv-er-pill sv-er-pill--pass">Pass</span>
                            : <span className="sv-er-pill sv-er-pill--fail">Fail</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {selectedExam&&!loading&&!results&&(
        <div className="sv-er-placeholder sv-er-placeholder--sm">
          <div className="sv-er-ph-title">No results found{role==="parent"&&!selectedChild?" — please select a child":""}</div>
        </div>
      )}
    </div>
  );
}