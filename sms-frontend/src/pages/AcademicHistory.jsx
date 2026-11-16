import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { promotionsApi } from "../api/promotionsApi";
import "./Promotions.css";

/**
 * Past sessions, read-only.
 *   student -> own sessions          parent -> each child's sessions
 *   teacher -> classes they teach    principal / coordinator / admin -> whole campus
 * Each record: class, outcome, final result, exams, quizzes, assignments, attendance.
 */
const errMsg = (e) => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const RESULT = { pass: "Pass", compartment: "Compartment", fail: "Fail", none: "No result" };
const OUTCOME = { promoted: ["Promoted", "pm-st--done"], detained: ["Detained", "pm-st--ret"], graduated: ["Graduated", "pm-st--draft"] };
const outcomeTag = (o, to) => <span className={"pm-st " + (OUTCOME[o] || ["", ""])[1]}>{(OUTCOME[o] || [o])[0]}{to ? " → " + to : ""}</span>;

export default function AcademicHistory() {
  const { user } = useAuth();
  const role = user?.role || (user?.roles || [])[0] || "";
  const own = role === "student" || role === "parent";
  return (
    <div className="pm-page">
      <div className="pm-head">
        <div>
          <div className="pm-title">Academic History</div>
          <div className="pm-sub">{own ? "Results, quizzes, assignments and attendance from past sessions" : "Past sessions of your classes - exams, quizzes, assignments and attendance"}</div>
        </div>
      </div>
      {own ? <OwnHistory parent={role === "parent"} /> : <StaffHistory />}
    </div>
  );
}

// ---------------------------------------------------------------- students / parents
function OwnHistory({ parent }) {
  const [kids, setKids] = useState(null);
  const [kid, setKid] = useState(null);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    promotionsApi.historyMe().then(r => { const k = r.data.data || []; setKids(k); if (k.length) setKid(k[0].student_id); })
      .catch(e => setError(errMsg(e)));
  }, []);
  const open = (sid, yid) => promotionsApi.historyStudent(sid, yid).then(r => setRecord(r.data.data)).catch(e => setError(errMsg(e)));

  if (error) return <div className="pm-card pm-muted">{error}</div>;
  if (!kids) return <div className="pm-card pm-muted">Loading...</div>;
  if (!kids.length) return <div className="pm-card pm-muted">No past sessions yet. Your history appears here after your first session is completed.</div>;
  const k = kids.find(x => x.student_id === kid) || kids[0];
  return (
    <>
      {parent && kids.length > 1 && (
        <div className="pm-hist-classes pm-mb">
          {kids.map(x => <button key={x.student_id} className={"pm-btn" + (x.student_id === k.student_id ? " pm-btn--primary" : "")}
            onClick={() => setKid(x.student_id)}>{x.name}</button>)}
        </div>
      )}
      <div className="pm-sessions">
        {k.sessions.map(s => (
          <div key={s.year_id} className="pm-card pm-session-card pm-click" onClick={() => open(k.student_id, s.year_id)} title="Open this session">
            <div className="pm-batch-title">{s.year}</div>
            <div className="pm-muted">{s.class}</div>
            <div className="pm-session-card-row">
              <span className="pm-big">{s.final_pct != null ? s.final_pct.toFixed(1) + "%" : "-"}</span>
              {outcomeTag(s.outcome, s.to)}
            </div>
            <div className="pm-muted pm-xs">View exams, quizzes, assignments and attendance &rarr;</div>
          </div>
        ))}
      </div>
      {record && <RecordModal d={record} onClose={() => setRecord(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- teachers / principal / coordinator / admin
export function StaffHistory() {
  const [years, setYears] = useState(null);
  const [yearId, setYearId] = useState(null);
  const [h, setH] = useState(null);
  const [classId, setClassId] = useState(null);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    promotionsApi.historyYears().then(r => { const ys = r.data.data || []; setYears(ys); if (ys.length) setYearId(ys[0].id); })
      .catch(e => setError(errMsg(e)));
  }, []);
  useEffect(() => {
    if (!yearId) return;
    promotionsApi.history(yearId, classId).then(r => setH(r.data.data)).catch(e => setError(errMsg(e)));
  }, [yearId, classId]);
  const open = (sid) => promotionsApi.historyStudent(sid, yearId).then(r => setRecord(r.data.data)).catch(e => setError(errMsg(e)));

  if (error) return <div className="pm-card pm-muted">{error}</div>;
  if (!years) return <div className="pm-card pm-muted">Loading...</div>;
  if (!years.length) return <div className="pm-card pm-muted">No session history yet. History appears once a session's promotions are approved.</div>;
  return (
    <>
      <div className="pm-card">
        <div className="pm-hist-bar">
          <label className="pm-muted">Session&nbsp;
            <select className="pm-input" value={yearId || ""} onChange={e => { setYearId(Number(e.target.value)); setClassId(null); }}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.closed ? " (closed)" : y.active ? " (current)" : ""}</option>)}
            </select>
          </label>
          <span className="pm-muted">Classes as they were in this session · click a class, then a student</span>
        </div>
        {h && (
          <div className="pm-hist-classes">
            {h.classes.length ? h.classes.map(c => (
              <button key={c.id} className={"pm-btn pm-btn--sm" + (classId === c.id ? " pm-btn--primary" : "")} onClick={() => setClassId(c.id)}>
                {c.label} <span className="pm-count">{c.students}</span>
              </button>
            )) : <span className="pm-muted">None of your classes have history in this session.</span>}
          </div>
        )}
      </div>
      {h && classId && (
        <div className="pm-card">
          <div className="pm-card-title">{(h.classes.find(c => c.id === classId) || {}).label} · {h.year.name}</div>
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead><tr><th>Student</th><th>Final result</th><th>Position</th><th>Outcome</th><th>Moved to</th></tr></thead>
              <tbody>{h.students.map(s => (
                <tr key={s.student_id} className="pm-click" onClick={() => open(s.student_id)} title="Open this student's record">
                  <td><div className="pm-strong">{s.student}</div><div className="pm-muted pm-xs">{s.enrollment_no}</div></td>
                  <td>{s.final_pct != null ? s.final_pct.toFixed(2) + "%" : "-"} {s.grade && <span className="pm-muted">· {s.grade}</span>}</td>
                  <td>{s.position || "-"}</td>
                  <td>{outcomeTag(s.outcome)}</td>
                  <td>{s.to || (s.outcome === "graduated" ? "Left the school" : "Same class")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {record && <RecordModal d={record} onClose={() => setRecord(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- one student's session record
function RecordModal({ d, onClose }) {
  const done = d.assignments?.filter(a => a.status !== "missed").length || 0;
  const taken = d.quizzes?.filter(q => q.status === "taken") || [];
  const quizAvg = taken.length && taken.every(q => q.pct != null) ? (taken.reduce((a, q) => a + q.pct, 0) / taken.length).toFixed(1) + "%" : "-";
  return (
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="pm-batch-head">
          <div>
            <div className="pm-batch-title">{d.student.name}</div>
            <div className="pm-muted">{d.student.enrollment_no}{d.student.father_name ? " · Father: " + d.student.father_name : ""} · {d.year.name} · {d.class}</div>
          </div>
          {outcomeTag(d.outcome, d.to)}
        </div>

        <div className="pm-hist-tiles">
          <div className="pm-hist-tile"><b>{d.final ? d.final.pct.toFixed(2) + "%" : "-"}</b><span>Final result{d.final?.grade ? " · " + d.final.grade : ""}{d.final?.position ? " · #" + d.final.position : ""}</span></div>
          <div className="pm-hist-tile"><b>{d.attendance.pct != null ? d.attendance.pct + "%" : "-"}</b><span>Attendance · {d.attendance.present}/{d.attendance.days} days</span></div>
          <div className="pm-hist-tile"><b>{done} / {d.assignments?.length || 0}</b><span>Assignments submitted</span></div>
          <div className="pm-hist-tile"><b>{quizAvg}</b><span>Quiz average · {taken.length}/{d.quizzes?.length || 0} taken</span></div>
        </div>

        <div className="pm-card-title pm-mt">Exams</div>
        {d.exams.length ? (
          <div className="pm-table-wrap"><table className="pm-table">
            <thead><tr><th>Exam</th><th>Marks</th><th>%</th><th>Grade</th><th>Position</th><th>Result</th></tr></thead>
            <tbody>{d.exams.map(e => (
              <tr key={e.exam_id}><td className="pm-strong">{e.exam}</td><td>{e.obtained} / {e.total}</td><td>{e.pct.toFixed(2)}%</td>
                <td>{e.grade || "-"}</td><td>{e.position ? e.position + " / " + e.class_size : "-"}</td>
                <td><span className={"pm-res pm-res--" + e.result}>{RESULT[e.result] || e.result}</span></td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="pm-muted">No exam results recorded for this session.</div>}

        <div className="pm-card-title pm-mt">Quizzes</div>
        {d.quizzes?.length ? (
          <div className="pm-table-wrap"><table className="pm-table">
            <thead><tr><th>Quiz</th><th>Subject</th><th>Date</th><th>Score</th></tr></thead>
            <tbody>{d.quizzes.map((q, i) => (
              <tr key={i}><td className="pm-strong">{q.title}</td><td>{q.subject || "-"}</td><td>{q.due || "-"}</td>
                <td>{q.status === "missed" ? <span className="pm-res pm-res--fail">Missed</span> : (q.marks ?? "-") + " / " + (q.total ?? "-") + (q.pct != null ? " (" + q.pct + "%)" : "")}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="pm-muted">No quizzes this session.</div>}

        <div className="pm-card-title pm-mt">Assignments</div>
        {d.assignments?.length ? (
          <div className="pm-table-wrap"><table className="pm-table">
            <thead><tr><th>Assignment</th><th>Subject</th><th>Due</th><th>Marks</th></tr></thead>
            <tbody>{d.assignments.map((a, i) => (
              <tr key={i}><td className="pm-strong">{a.title}</td><td>{a.subject || "-"}</td><td>{a.due || "-"}</td>
                <td>{a.status === "missed" ? <span className="pm-res pm-res--fail">Missed</span>
                  : a.status === "submitted" ? <span className="pm-muted">Submitted, not graded</span>
                  : a.marks + " / " + (a.total ?? "-")}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="pm-muted">No assignments this session.</div>}

        {d.final?.rows?.length > 0 && (
          <>
            <div className="pm-card-title pm-mt">How the final result was calculated</div>
            <div className="pm-table-wrap"><table className="pm-table">
              <thead><tr><th>Component</th><th>Weight</th><th>Score</th><th>Contribution</th></tr></thead>
              <tbody>{d.final.rows.map((r, i) => (
                <tr key={i}><td>{r.name}{r.note ? <span className="pm-muted pm-xs"> ({r.note})</span> : null}</td><td>{r.weight}%</td>
                  <td>{r.pct != null ? r.pct + "%" : "-"}</td><td>{r.contribution != null ? r.contribution + "%" : "-"}</td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
        <div className="pm-head-actions pm-modal-actions"><button className="pm-btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
