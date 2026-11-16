import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import "./ExamViews.css";

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
    <div className="ev-page">
      <div className="ev-head">
        <div className="ev-title">Class Results</div>
        <div className="ev-sub">View compiled results for your class</div>
      </div>

      <div className="ev-layout">
        {/* Sidebar */}
        <div className="ev-side">
          <div className="ev-panel">
            <div className="ev-panel-head">Exams</div>
            {exams.length===0&&<div className="ev-panel-empty">No compiled exams.</div>}
            {exams.map(e=>(
              <div key={e.id} onClick={()=>{setSelectedExam(e);setResults(null);if(selectedClass)loadResults(e,selectedClass);}}
                className={"ev-item"+(selectedExam?.id===e.id?" ev-item--on":"")}>
                <div className="ev-item-name">{e.name}</div>
                <div className="ev-item-meta">{e.exam_type_name}</div>
              </div>
            ))}
          </div>
          <div className="ev-panel">
            <div className="ev-panel-head">My Classes</div>
            {myClasses.length===0&&<div className="ev-panel-empty">No incharge classes.</div>}
            {myClasses.map(c=>(
              <div key={c.id} onClick={()=>{setSelectedClass(c);if(selectedExam)loadResults(selectedExam,c);}}
                className={"ev-item"+(selectedClass?.id===c.id?" ev-item--on":"")}>
                <div className="ev-item-name">{c.name}{c.section?" ("+c.section+")":""}</div>
                <div className="ev-item-tag">Incharge</div>
              </div>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        <div>
          {!selectedExam&&<div className="ev-placeholder"><div className="ev-placeholder-icon">📊</div><div className="ev-placeholder-title">Select an exam and class</div></div>}
          {selectedExam&&!selectedClass&&<div className="ev-placeholder"><div className="ev-placeholder-title">Select your class</div></div>}
          {loading&&<div className="ev-placeholder">Loading results...</div>}
          {results&&!loading&&(
            <div className="ev-card">
              <div className="ev-card-head">
                <div className="ev-card-title">{selectedClass.name}{selectedClass.section?" ("+selectedClass.section+")":""} — {selectedExam.name}</div>
                <div className="ev-card-sub">{students.length} students · {subjects.length} subjects</div>
              </div>
              <div className="ev-scroll">
                <table className="ev-results">
                  <thead>
                    <tr>
                      <th className="ev-th-left ev-th-num">#</th>
                      <th className="ev-th-left ev-th-student">Student</th>
                      {subjects.map(s=>(
                        <th key={s.name} className="ev-th-subject">
                          <div>{s.name}</div><div className="ev-th-max">/{s.total}</div>
                        </th>
                      ))}
                      <th className="ev-sum">Total</th>
                      <th className="ev-sum">Obtained</th>
                      <th className="ev-sum">%</th>
                      <th>Grade</th>
                      <th>Pos</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s,i)=>(
                      <tr key={s.id}>
                        <td className="ev-td-faint">{s.class_position||i+1}</td>
                        <td className="ev-td-left">
                          <div className="ev-student-name">{s.first_name} {s.last_name}</div>
                          <div className="ev-student-no">{s.enrollment_no}</div>
                        </td>
                        {subjects.map(sub=>{
                          const sm=s.subject_marks?.[sub.name];
                          return (
                            <td key={sub.name} className="ev-td-subject">
                              {sm?.absent?<span className="ev-mark-absent">Absent</span>:
                               <span className={"ev-mark "+(sm&&sm.marks>=sub.total*0.4?"ev-pass":"ev-fail")}>{sm?.marks??"-"}</span>}
                            </td>
                          );
                        })}
                        <td className="ev-sum">{s.total_marks}</td>
                        <td className={"ev-sum "+(s.is_pass?"ev-pass":"ev-fail")}>{s.marks_obtained}</td>
                        <td className={"ev-sum "+(s.is_pass?"ev-pass":"ev-fail")}>{s.percentage}%</td>
                        <td className="ev-td-bold">{s.grade}</td>
                        <td className="ev-td-soft">{s.class_position}</td>
                        <td>
                          {s.is_pass?<span className="ev-pill ev-pill--green">Pass</span>:<span className="ev-pill ev-pill--red">Fail</span>}
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
