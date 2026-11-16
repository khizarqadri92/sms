import { useState, useEffect } from "react";
import { examsApi } from "../api/examsApi";
import client from "../api/client";
import "./ExamViews.css";

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
    <div className="ev-page">
      <div className="ev-head">
        <div className="ev-title">Marks History</div>
        <div className="ev-sub">View marks you have entered for your subjects</div>
      </div>

      <div className="ev-layout">
        <div className="ev-side">
          {/* Exams */}
          <div className="ev-panel">
            <div className="ev-panel-head">Exams</div>
            {exams.map(e=>(
              <div key={e.id} onClick={()=>{setSelectedExam(e);setSelectedClass(null);setSelectedSub(null);setMarksData(null);}}
                className={"ev-item"+(selectedExam?.id===e.id?" ev-item--on":"")}>
                <div className="ev-item-name">{e.name}</div>
                <div className="ev-item-meta">{e.exam_type_name}</div>
              </div>
            ))}
          </div>
          {/* Classes */}
          {selectedExam&&<div className="ev-panel">
            <div className="ev-panel-head">Classes</div>
            {myClasses.map(c=>(
              <div key={c.id} onClick={()=>pickClass(c)}
                className={"ev-item"+(selectedClass?.id===c.id?" ev-item--on":"")}>
                <div className="ev-item-name">{c.name}{c.section?" ("+c.section+")":""}</div>
              </div>
            ))}
          </div>}
          {/* Subjects */}
          {selectedClass&&<div className="ev-panel">
            <div className="ev-panel-head">My Subjects</div>
            {classSubjects.length===0&&<div className="ev-panel-empty">No subjects found.</div>}
            {classSubjects.map(s=>(
              <div key={s.id} onClick={()=>pickSubject(s)}
                className={"ev-item"+(selectedSub?.subject_id===s.subject_id?" ev-item--on":s.marks_submitted?" ev-item--done":"")}>
                <div className="ev-item-name">{s.subject_name}</div>
                <div className="ev-item-state">{s.marks_submitted?<span className="ev-state-done">Submitted</span>:<span className="ev-state-pending">Pending</span>}</div>
              </div>
            ))}
          </div>}
        </div>

        {/* Marks Table */}
        <div>
          {!selectedExam&&<div className="ev-placeholder"><div className="ev-placeholder-icon">📝</div><div className="ev-placeholder-title">Select exam → class → subject</div></div>}
          {loading&&<div className="ev-placeholder">Loading...</div>}
          {marksData&&!loading&&(
            <div className="ev-card">
              <div className="ev-card-head ev-card-head--bar">
                <div>
                  <div className="ev-card-title">{selectedSub.subject_name} — {selectedClass.name}{selectedClass.section?" ("+selectedClass.section+")":""}</div>
                  <div className="ev-card-sub">Max: {totalMarks} · Passing: {passing} · {marksData.students?.length||0} students</div>
                </div>
                {selectedSub.marks_submitted&&<span className="ev-pill ev-pill--green ev-pill--lg">Submitted ✓</span>}
              </div>
              <table className="ev-marks">
                <thead>
                  <tr>
                    {["#","Student","Marks / "+totalMarks,"%","Status"].map(h=>(
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(marksData.students||[]).map((s,i)=>{
                    const m = s.marks_obtained;
                    const absent = s.is_absent;
                    const pct = m!=null&&!absent?Math.round(m/totalMarks*100):null;
                    const tone = absent?"ev-absent":pct&&pct>=passing?"ev-pass":"ev-fail";
                    return (
                      <tr key={s.id} className={absent?"ev-row-absent":""}>
                        <td className="ev-td-index">{i+1}</td>
                        <td>
                          <div className="ev-student-name">{s.first_name} {s.last_name}</div>
                          <div className="ev-student-no">{s.enrollment_no}</div>
                        </td>
                        <td className={"ev-td-mark "+tone}>{absent?"Absent":m??"-"}</td>
                        <td className={"ev-td-pct "+(absent?"ev-faint":tone)}>{absent?"-":pct+"%"}</td>
                        <td>
                          {absent?<span className="ev-pill ev-pill--red">Absent</span>:
                           pct&&pct>=passing?<span className="ev-pill ev-pill--green">Pass</span>:
                           m!=null?<span className="ev-pill ev-pill--red">Fail</span>:
                           <span className="ev-dash-text">-</span>}
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
