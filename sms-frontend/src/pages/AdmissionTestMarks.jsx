import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";

/** Class-wise marks sheet: every candidate of a class test in one grid. */
export default function AdmissionTestMarks() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const staff = can("admissions.admission_test_view");
  const [d, setD] = useState(null);
  const [rows, setRows] = useState({});
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 5000 : 10000); };
  const load = useCallback(() => admissionsApi.candidates(id).then(r => {
    const data = r.data.data; setD(data);
    setRows(Object.fromEntries(data.candidates.filter(c => !c.result).map(c => [c.application_id, { absent: false, obtained: data.session.subjects.map(() => "") }])));
  }).catch(e => notify("error", errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);

  const setMark = (aid, i, v) => setRows(r => ({ ...r, [aid]: { ...r[aid], obtained: r[aid].obtained.map((x, j) => j === i ? v : x) } }));
  const outcome = (subs, obtained) => {
    if (obtained.some(x => x === "")) return null;
    const pass = subs.every((s, i) => Number(obtained[i]) >= s.passing_marks);
    const tot = obtained.reduce((a, x) => a + Number(x), 0), max = subs.reduce((a, s) => a + s.max_marks, 0);
    return { pass, pct: max ? Math.round(1000 * tot / max) / 10 : 0 };
  };
  const save = async () => {
    const payload = Object.entries(rows).map(([aid, r]) => ({ application_id: Number(aid), absent: r.absent,
      obtained: r.absent ? [] : r.obtained.map(x => x === "" ? null : Number(x)) }))
      .filter(r => r.absent || r.obtained.some(x => x !== null));
    if (!payload.length) { notify("error", "Enter marks for at least one candidate."); return; }
    setBusy(true);
    try { const r = await admissionsApi.saveMarks(id, payload); notify("success", r.data.message); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };

  if (!d) return <div className="am-page">{flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}<div className="am-card am-hint">Loading...</div></div>;
  const subs = d.session.subjects;
  const canMark = can("admissions.admission_test_marks_entry") || d.can_mark;   // Admission test marks entry, or this test's examiner
  const pending = d.candidates.filter(c => !c.result).length;
  return (
    <div className="am-page">
      <div className="am-head">
        <div>
          {staff ? <button className="am-btn am-btn--sm" onClick={() => navigate("/admissions/tests")}>&larr; Admission Tests</button>
                 : d.is_examiner && <span className="am-status am-status--info">You are the examiner</span>}
          <div className="am-title" style={{ marginTop: 8 }}>{d.session.class_name} admission test · marks</div>
          <div className="am-sub">{fD(d.session.test_date)} · {d.session.start_time}{d.session.venue ? " · " + d.session.venue : ""} · pass = at least the passing marks in every subject</div>
        </div>
        {canMark && pending > 0 && <button className="am-btn am-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save marks"}</button>}
      </div>
      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}
      <div className="am-card">
        <div className="am-table-wrap">
          <table className="am-table">
            <thead><tr><th>Applicant</th>{subs.map(s => <th key={s.name}>{s.name}<div className="am-hint">pass {s.passing_marks} / {s.max_marks}</div></th>)}<th>Absent</th><th>Result</th></tr></thead>
            <tbody>
              {d.candidates.map(c => {
                const r = rows[c.application_id];
                const live = r && !r.absent ? outcome(subs, r.obtained) : null;
                return (
                  <tr key={c.application_id}>
                    <td><b className="am-click" onClick={() => navigate("/admissions/applications/" + c.application_id)}>{c.student}</b><div className="am-hint">{c.application_no}</div></td>
                    {subs.map((s, i) => (
                      <td key={s.name}>{r && canMark
                        ? <input type="number" min="0" max={s.max_marks} step="0.5" className={"am-input am-input--sm" + (r.obtained[i] !== "" && Number(r.obtained[i]) > s.max_marks ? " am-input--bad" : "")}
                            disabled={r.absent} value={r.obtained[i]} onChange={e => setMark(c.application_id, i, e.target.value)} />
                        : ((c.subjects || [])[i]?.obtained ?? "-")}</td>
                    ))}
                    <td>{r && canMark ? <input type="checkbox" checked={r.absent} onChange={e => setRows(x => ({ ...x, [c.application_id]: { ...x[c.application_id], absent: e.target.checked } }))} />
                                      : (c.result === "absent" ? "Yes" : "")}</td>
                    <td>{c.result ? <span className={"am-status am-status--" + (c.result === "pass" ? "good" : "bad")}>{c.result.toUpperCase()}{c.result !== "absent" ? " · " + c.percentage + "%" : ""}</span>
                       : r?.absent ? <span className="am-status am-status--bad">ABSENT</span>
                       : live ? <span className={"am-status am-status--" + (live.pass ? "good" : "bad")}>{live.pass ? "PASS" : "FAIL"} · {live.pct}%</span>
                       : <span className="am-hint">not marked</span>}</td>
                  </tr>
                );
              })}
              {!d.candidates.length && <tr><td colSpan={subs.length + 3} className="am-hint" style={{ textAlign: "center", padding: 24 }}>No applicants in this test yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="am-hint" style={{ marginTop: 8 }}>Rows left blank stay unmarked. If any entry is wrong, nothing is saved and the applicant is named.</div>
      </div>
    </div>
  );
}
