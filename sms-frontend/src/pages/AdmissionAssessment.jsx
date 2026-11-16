import { useState, useEffect } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import admissionsApi from "../api/admissionsApi";
import DatePicker from "../components/DatePicker";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const REC = { recommended: ["Recommended", "good"], not_recommended: ["Not recommended", "bad"], further_review: ["Further review", "warn"] };

function DateTime({ date, time, onDate, onTime }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}><DatePicker value={date} onChange={onDate} placeholder="Date" /></div>
      <input type="time" className="am-input" value={time} onChange={e => onTime(e.target.value)} style={{ width: 120 }} />
    </div>
  );
}

/** Admission test card: schedule (subjects, room, examiner), then marks. */
export function TestCard({ appId, tests, action, recordAction, staff, notify, reload, className }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const [form, setForm] = useState({ date: "", time: "10:00", room: "", examiner_id: "", subjects: [{ name: "English", max_marks: 50, passing_marks: 20 }, { name: "Mathematics", max_marks: 50, passing_marks: 20 }] });
  const open = tests.find(t => !t.result);
  const [marks, setMarks] = useState({ absent: false, obtained: [], remarks: "", internal_notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setMarks(m => ({ ...m, obtained: (open.subjects || []).map(() => "") })); }, [open?.id]);
  const setSub = (i, k, v) => setForm(f => ({ ...f, subjects: f.subjects.map((s, j) => j === i ? { ...s, [k]: v } : s) }));

  const schedule = async () => {
    if (!form.date) { notify("error", "Choose the test date."); return; }
    setBusy(true);
    try {
      const r = await admissionsApi.scheduleTest(appId, { scheduled_at: form.date + "T" + (form.time || "09:00"), room: form.room,
        examiner_id: form.examiner_id ? Number(form.examiner_id) : null,
        subjects: form.subjects.map(s => ({ name: s.name, max_marks: Number(s.max_marks), passing_marks: Number(s.passing_marks) })) });
      notify("success", r.data.message); reload();
    } catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const record = async () => {
    setBusy(true);
    try {
      const r = await admissionsApi.recordTest(appId, open.id, { absent: marks.absent, obtained: marks.absent ? [] : marks.obtained.map(x => x === "" ? null : Number(x)),
        remarks: marks.remarks, internal_notes: marks.internal_notes });
      notify("success", r.data.message); reload();
    } catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };

  if (!tests.length && !action) return null;
  return (
    <div className="am-card">
      <div className="am-card-title">Admission test</div>
      {tests.map(t => (
        <div key={t.id} className="am-assess">
          <div className="am-assess-head">
            <div><b>{fDT(t.scheduled_at)}</b><span className="am-hint">{t.room ? " · Room " + t.room : ""}</span></div>
            {t.result ? <span className={"am-status am-status--" + (t.result === "pass" ? "good" : "bad")}>{t.result.toUpperCase()}{t.result !== "absent" ? " · " + Number(t.percentage) + "%" : ""}</span>
                      : <span className="am-status am-status--info">Scheduled</span>}
          </div>
          <table className="am-table am-table--compact">
            <thead><tr><th>Subject</th><th>Max</th><th>Pass</th><th>Obtained</th></tr></thead>
            <tbody>{(t.subjects || []).map((s, i) => (
              <tr key={i}><td>{s.name}</td><td>{s.max_marks}</td><td>{s.passing_marks}</td>
                <td>{t.id === open?.id && recordAction && !marks.absent
                  ? <input type="number" min="0" max={s.max_marks} className="am-input am-input--sm" value={marks.obtained[i] ?? ""}
                      onChange={e => setMarks(m => ({ ...m, obtained: m.obtained.map((x, j) => j === i ? e.target.value : x) }))} />
                  : (s.obtained ?? "-")}</td></tr>
            ))}</tbody>
          </table>
          {t.remarks && <div className="am-tl-note">Note for parent: {t.remarks}</div>}
          {t.internal_notes && <div className="am-tl-note">Internal: {t.internal_notes}</div>}
          {t.id === open?.id && recordAction && (
            <div className="am-assess-form">
              <label className="am-check"><input type="checkbox" checked={marks.absent} onChange={e => setMarks(m => ({ ...m, absent: e.target.checked }))} /> Applicant was absent</label>
              <input className="am-input" placeholder="Note for the parent (optional)" value={marks.remarks} onChange={e => setMarks(m => ({ ...m, remarks: e.target.value }))} />
              <input className="am-input" placeholder="Internal notes (staff only)" value={marks.internal_notes} onChange={e => setMarks(m => ({ ...m, internal_notes: e.target.value }))} />
              <button className="am-btn am-btn--primary" disabled={busy} onClick={record}>Save result</button>
            </div>
          )}
        </div>
      ))}
      {action && !open && (
        <div className="am-notice">
          Admission tests are held class-wise. This applicant joins the {className || "class"} test automatically once it is scheduled in{" "}
          <a href="/admissions/tests">Admission Tests</a>.
        </div>
      )}
    </div>
  );
}

/** Interview card: schedule (panel, place), then recommendation and notes. */
export function InterviewCard({ appId, interviews, action, recordAction, staff, notify, reload, className, campusId, yearId }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const [form, setForm] = useState({ date: "", time: "11:00", location: "", panel_id: "" });
  const [panels, setPanels] = useState(null);
  useEffect(() => {
    if (!action || !campusId) return;
    admissionsApi.panels({ campus: campusId, academic_year_id: yearId, class_name: className }).then(r => {
      const p = r.data.data; setPanels(p.panels.filter(x => x.is_active));
      if (p.default_panel_id) setForm(f => ({ ...f, panel_id: f.panel_id || String(p.default_panel_id) }));
    }).catch(() => setPanels([]));
  }, [action, campusId, yearId, className]);
  const [res, setRes] = useState({ recommendation: "", assessment: "", parent_note: "", internal_remarks: "" });
  const [busy, setBusy] = useState(false);
  const open = interviews.find(i => !i.recommendation);
  const name = id => (staff.find(s => s.id === id) || {}).name || "#" + id;

  const schedule = async () => {
    if (!form.date) { notify("error", "Choose the interview date."); return; }
    setBusy(true);
    if (!form.panel_id) { notify("error", "Choose an interview panel."); return; }
    try { const r = await admissionsApi.scheduleInterview(appId, { scheduled_at: form.date + "T" + (form.time || "10:00"), location: form.location, panel_id: Number(form.panel_id) });
      notify("success", r.data.message); reload(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const record = async () => {
    if (!res.recommendation) { notify("error", "Choose a recommendation."); return; }
    setBusy(true);
    try { const r = await admissionsApi.recordInterview(appId, open.id, res); notify("success", r.data.message); reload(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };

  if (!interviews.length && !action) return null;
  return (
    <div className="am-card">
      <div className="am-card-title">Interview</div>
      {interviews.map(i => (
        <div key={i.id} className="am-assess">
          <div className="am-assess-head">
            <div><b>{fDT(i.scheduled_at)}</b><span className="am-hint">{i.location ? " · " + i.location : ""}{i.panel_name ? " · " + i.panel_name : ""}{(i.panel_names || []).length ? ": " + i.panel_names.join(", ") : (i.panel_user_ids?.length ? " · Panel: " + i.panel_user_ids.map(name).join(", ") : "")}</span></div>
            {i.recommendation ? <span className={"am-status am-status--" + REC[i.recommendation][1]}>{REC[i.recommendation][0]}</span>
                              : <span className="am-status am-status--info">Scheduled</span>}
          </div>
          {i.parent_note && <div className="am-tl-note">Note for parent: {i.parent_note}</div>}
          {i.assessment && <div className="am-tl-note">Assessment: {i.assessment}</div>}
          {i.internal_remarks && <div className="am-tl-note">Internal: {i.internal_remarks}</div>}
          {i.id === open?.id && recordAction && (
            <div className="am-assess-form">
              <select className="am-input" value={res.recommendation} onChange={e => setRes(r => ({ ...r, recommendation: e.target.value }))}>
                <option value="">Recommendation...</option>{Object.entries(REC).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <textarea className="am-input" rows={2} placeholder="Assessment (staff only)" value={res.assessment} onChange={e => setRes(r => ({ ...r, assessment: e.target.value }))} />
              <input className="am-input" placeholder="Note for the parent (optional)" value={res.parent_note} onChange={e => setRes(r => ({ ...r, parent_note: e.target.value }))} />
              <input className="am-input" placeholder="Internal remarks (staff only)" value={res.internal_remarks} onChange={e => setRes(r => ({ ...r, internal_remarks: e.target.value }))} />
              <button className="am-btn am-btn--primary" disabled={busy} onClick={record}>Save interview</button>
            </div>
          )}
        </div>
      ))}
      {action && !open && (
        <div className="am-assess-form">
          {action.blocked && !/schedule first/i.test(action.blocked) && <div className="am-notice">{action.blocked}</div>}
          <div className="am-grid">
            <div className="am-field">Date &amp; time<DateTime date={form.date} time={form.time} onDate={v => setForm(f => ({ ...f, date: v }))} onTime={v => setForm(f => ({ ...f, time: v }))} /></div>
            <label className="am-field">Location<input className="am-input" value={form.location} placeholder="Panel's location" onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></label>
          </div>
          {panels && !panels.length && <div className="am-notice">No interview panels yet - the academic coordinator sets them up in <a href="/admissions/panels">Interview Panels</a>.</div>}
          {panels && panels.length > 0 && (
            <label className="am-field">Interview panel
              <select className="am-input" value={form.panel_id} onChange={e => setForm(f => ({ ...f, panel_id: e.target.value }))}>
                <option value="">Choose...</option>
                {panels.map(p => <option key={p.id} value={p.id}>{p.name}{p.class_names.length ? " · " + p.class_names.join(", ") : ""}</option>)}
              </select>
              {form.panel_id && (() => { const p = panels.find(x => String(x.id) === String(form.panel_id)); return p ? <span className="am-hint">{p.members.map(m => m.name).join(", ")}{p.location ? " · " + p.location : ""}</span> : null; })()}
            </label>
          )}
          <button className="am-btn am-btn--primary" disabled={busy} onClick={schedule}>Schedule interview</button>
        </div>
      )}
    </div>
  );
}
