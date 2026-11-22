import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import DatePicker from "../components/DatePicker";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const NEW = { class_name: "", test_date: "", start_time: "09:00", venue: "", examiner_id: "", instructions: "",
  subjects: [{ name: "English", max_marks: 50, passing_marks: 20 }, { name: "Mathematics", max_marks: 50, passing_marks: 20 }] };

/** One combined admission test per class: schedule it, then enter the class's marks in one sheet. */
export default function AdmissionTests() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const navigate = useNavigate();
  const { can } = useAuth();
  const canSchedule = can("admissions.admission_test_schedule");     // Roles & Permissions: Admission test schedule
  const canDelete = can("admissions.admission_test_delete");         // Admission test delete
  const [meta, setMeta] = useState(null);
  const [campus, setCampus] = useState("");
  const [yearId, setYearId] = useState("");
  const [d, setD] = useState(null);
  const [examiners, setExaminers] = useState({ teachers: [], other: [] });
  const [edit, setEdit] = useState(null);           // form (new or existing)
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 5000 : 9000); };

  useEffect(() => {
    admissionsApi.years().then(r => { const m = r.data.data; setMeta(m); setCampus(m.campus_id || (m.campuses[0] && m.campuses[0].id) || ""); setYearId(m.default_year || ""); })
      .catch(e => notify("error", errMsg(e)));
  }, []);
  useEffect(() => {
    if (!campus) return;
    admissionsApi.examiners({ campus }).then(r => setExaminers(r.data.data)).catch(() => setExaminers({ teachers: [], other: [] }));
  }, [campus]);
  const load = useCallback(() => {
    if (!campus) return;
    admissionsApi.sessions({ campus, ...(yearId ? { academic_year_id: yearId } : {}) }).then(r => setD(r.data.data)).catch(e => notify("error", errMsg(e)));
  }, [campus, yearId]);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setEdit(f => ({ ...f, [k]: v }));
  const setSub = (i, k, v) => setEdit(f => ({ ...f, subjects: f.subjects.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const save = async () => {
    if (!edit.class_name || !edit.test_date) { notify("error", "Choose the class and the test date."); return; }
    setBusy(true);
    const body = { campus_id: Number(campus), academic_year_id: Number(yearId), class_name: edit.class_name, test_date: edit.test_date,
      start_time: edit.start_time || "09:00", venue: edit.venue, examiner_id: edit.examiner_id ? Number(edit.examiner_id) : null, instructions: edit.instructions,
      subjects: edit.subjects.map(s => ({ name: s.name, max_marks: Number(s.max_marks), passing_marks: Number(s.passing_marks) })) };
    try {
      const r = edit.id ? await admissionsApi.updateSession(edit.id, body) : await admissionsApi.createSession(body);
      notify("success", r.data.message); setEdit(null); load();
    } catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async s => {
    if (!window.confirm(`Remove the ${s.class_name} test?`)) return;
    try { const r = await admissionsApi.deleteSession(s.id); notify("success", r.data.message); load(); } catch (e) { notify("error", errMsg(e)); }
  };

  const unscheduled = d ? d.classes.filter(c => !d.sessions.some(s => s.class_name.toLowerCase() === c.toLowerCase())) : [];
  return (
    <div className="am-page">
      <div className="am-head">
        <div><div className="am-title">Admission Tests</div><div className="am-sub">One combined test per class · applicants join automatically once their documents are verified</div></div>
        <div className="am-filters">
          {meta && !meta.campus_id && (
            <label className="am-field">Campus
              <select className="am-input" value={campus} onChange={e => { setCampus(e.target.value); setYearId(""); }}>
                {meta.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="am-field">Session
            <select className="am-input" value={yearId} onChange={e => setYearId(e.target.value)}>
              {(meta?.years || []).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}
      {d && !d.configured && <div className="am-notice">Save the Admission Settings for this session first.</div>}
      {d && d.configured && !d.test_required && <div className="am-notice">An admission test isn't required this session (Admission Settings).</div>}
      {d && d.configured && d.test_required && unscheduled.length > 0 && (
        <div className="am-notice">No test scheduled yet for: {unscheduled.join(", ")}.</div>
      )}

      {d && d.configured && d.test_required && (
        <div className="am-sessions">
          {d.sessions.map(s => (
            <div key={s.id} className="am-card am-session">
              <div className="am-assess-head">
                <div className="am-card-title" style={{ margin: 0 }}>{s.class_name}</div>
                <span className={"am-status am-status--" + (s.candidates && s.marked === s.candidates ? "good" : "info")}>{s.marked}/{s.candidates} marked</span>
              </div>
              <div className="am-kv">
                <div><span>Date</span>{fD(s.test_date)}</div><div><span>Time</span>{s.start_time}</div>
                <div><span>Venue</span>{s.venue || "-"}</div><div><span>Examiner</span>{s.examiner_name || "-"}</div>
              </div>
              <div className="am-hint">{s.subjects.map(x => `${x.name} (${x.passing_marks}/${x.max_marks})`).join(" · ")}</div>
              {s.instructions && <div className="am-tl-note">{s.instructions}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="am-btn am-btn--primary am-btn--sm" disabled={!s.candidates} onClick={() => navigate("/admissions/tests/" + s.id)}>Marks sheet ({s.candidates})</button>
                {canSchedule && <button className="am-btn am-btn--sm" onClick={() => setEdit({ ...s, examiner_id: s.examiner_id || "" })}>Edit</button>}
                {canDelete && !s.candidates && <button className="am-btn am-btn--sm am-btn--bad" onClick={() => remove(s)}>Remove</button>}
              </div>
            </div>
          ))}
          {canSchedule && unscheduled.length > 0 && !edit && (
            <button className="am-card am-session am-session--add" onClick={() => setEdit({ ...NEW, class_name: unscheduled[0] })}>+ Schedule a class test</button>
          )}
        </div>
      )}

      {edit && (
        <div className="am-card">
          <div className="am-card-title">{edit.id ? "Edit " + edit.class_name + " test" : "Schedule a class test"}</div>
          <div className="am-grid">
            <label className="am-field">Class
              <select className="am-input" value={edit.class_name} disabled={!!edit.id} onChange={e => setF("class_name", e.target.value)}>
                {(edit.id ? [edit.class_name] : unscheduled).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="am-field">Test date
              <DatePicker value={edit.test_date} onChange={v => setF("test_date", v)} placeholder="Choose the date"
                min={d.setting.tests_start_on || d.setting.opens_on || undefined} max={d.setting.classes_commence_on || undefined} />
            </div>
            <label className="am-field">Start time<input type="time" className="am-input" value={edit.start_time} onChange={e => setF("start_time", e.target.value)} /></label>
            <label className="am-field">Venue<input className="am-input" value={edit.venue || ""} onChange={e => setF("venue", e.target.value)} placeholder="e.g. Main Hall" /></label>
            <label className="am-field">Examiner
              <select className="am-input" value={edit.examiner_id} onChange={e => setF("examiner_id", e.target.value)}>
                <option value="">Not assigned</option>
                {examiners.teachers.length > 0 && <optgroup label="Teachers">{examiners.teachers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
                {examiners.other.length > 0 && <optgroup label="Other academic staff">{examiners.other.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}</optgroup>}
              </select>
            </label>
          </div>
          <table className="am-table am-table--compact" style={{ marginTop: 12 }}>
            <thead><tr><th>Subject</th><th>Max marks</th><th>Passing marks</th><th></th></tr></thead>
            <tbody>{edit.subjects.map((s, i) => (
              <tr key={i}>
                <td><input className="am-input" value={s.name} onChange={e => setSub(i, "name", e.target.value)} /></td>
                <td><input type="number" min="1" className="am-input am-input--sm" value={s.max_marks} onChange={e => setSub(i, "max_marks", e.target.value)} /></td>
                <td><input type="number" min="0" className="am-input am-input--sm" value={s.passing_marks} onChange={e => setSub(i, "passing_marks", e.target.value)} /></td>
                <td>{edit.subjects.length > 1 && <button className="am-btn am-btn--sm" onClick={() => setEdit(f => ({ ...f, subjects: f.subjects.filter((_, j) => j !== i) }))}>Remove</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          <button className="am-btn am-btn--sm" style={{ marginTop: 8 }} onClick={() => setEdit(f => ({ ...f, subjects: [...f.subjects, { name: "", max_marks: 50, passing_marks: 20 }] }))}>+ Subject</button>
          <label className="am-field" style={{ marginTop: 12 }}>Instructions for parents
            <textarea className="am-input" rows={2} value={edit.instructions || ""} onChange={e => setF("instructions", e.target.value)} placeholder="e.g. Report 30 minutes early with the admission slip and a pencil." />
          </label>
          <div className="am-hint">A pass needs at least the passing marks in every subject. Changing the date or venue moves everyone not yet marked.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="am-btn am-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save test"}</button>
            <button className="am-btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
