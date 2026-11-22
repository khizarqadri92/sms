import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import api from "../api/attendanceCaptureApi";
import settingsApi from "../api/settingsApi";
import "./AttendanceCapture.css";

const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const RESULT = { present: "Present", late: "Late", duplicate: "Already scanned", unknown: "Unknown card", inactive_student: "Not an active student",
                 already_marked: "Already marked", holiday: "Holiday", method_off: "Not in use here",
                 staff_in: "Clocked in", staff_out: "Clocked out", staff_error: "Not recorded" };
const timeOf = iso => (iso || "").slice(11, 16);
const SERVER = typeof window !== "undefined" ? window.location.hostname : "your-server";

/* how to connect the chosen model */
function ConnectHelp({ model }) {
  if (!model) return null;
  if (model.connect === "gate") return (
    <div className="ac2-help">Plug the USB card reader into the computer at the gate and open <b>Gate Scan</b> on it (full screen).
      The reader types each card number; the screen records it straight away. No set-up on the reader is needed.</div>);
  if (model.connect === "zkteco") return (
    <div className="ac2-help">On the terminal open <b>Comm. → Cloud Server Setting</b> (ADMS) and enter: server address <code>{SERVER}</code>, port <code>5000</code>,
      and turn <b>HTTPS off</b>. Then add the terminal under <b>Devices</b> with its <b>serial number</b> (Menu → System Info → Device Info).
      Enrol each student's thumb on the terminal and type the terminal's <b>user number</b> under <b>Cards &amp; fingerprints</b>.</div>);
  return (
    <div className="ac2-help">Add the device under <b>Devices</b> to get its key. The device (or its software) sends each scan to
      <code>POST http://{SERVER}:5000/api/v1/attendance-capture/device/scans</code> with the header <code>X-Device-Key: &lt;key&gt;</code> and the body
      <code>{'{"identifier": "<card or user number>", "time": "YYYY-MM-DD HH:MM:SS"}'}</code>.</div>);
}

/* ------------------------------------------------------------------ Method */
function MethodTab({ readOnly = false, onSaved }) {
  const [s, setS] = useState(null);
  const [note, setNote] = useState(null);
  useEffect(() => {
    // Manual class / period IS the existing "who can mark attendance" setting (incharge only / all subject teachers)
    Promise.all([api.getSettings(), settingsApi.getByCategory("attendance_config").catch(() => null)]).then(([r, old]) => {
      const d = r.data.data, marker = old?.data?.data?.attendance_marker;
      setS({ ...d, manual_mode: marker === "all_teachers" ? "period" : marker === "incharge_only" ? "class" : d.manual_mode });
    }).catch(e => setNote({ type: "err", msg: errMsg(e) }));
  }, []);
  if (!s) return <div className="ac2-card">{note ? note.msg : "Loading..."}</div>;
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));
  const models = (s.models || []).filter(m => m.kind === s.method);
  const model = (s.models || []).find(m => m.key === s.device_model && m.kind === s.method);
  const pick = m => setS(x => ({ ...x, method: m, device_model: m === "manual" ? x.device_model : ((x.models || []).find(z => z.key === x.device_model && z.kind === m) ? x.device_model : "") }));
  const save = async () => {
    setNote(null);
    try {
      const r = await api.saveSettings(s);
      // keep the existing marking rule in step (used by the teachers' Attendance page)
      await settingsApi.saveByCategory("attendance_config", { attendance_marker: s.manual_mode === "period" ? "all_teachers" : "incharge_only" });
      setNote({ type: "ok", msg: r.data.message }); onSaved && onSaved(s.method);
    } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="ac2-card">
      <div className="ac2-muted">Applies to: <b>{s.scope}</b></div>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div className="ac2-methods" role="radiogroup" aria-label="Attendance method">
        <button type="button" role="radio" aria-checked={s.method === "manual"} className={"ac2-method" + (s.method === "manual" ? " on" : "")} onClick={() => pick("manual")}>
          <b>Manual attendance</b><span>Teachers mark attendance in the app.</span></button>
        <button type="button" role="radio" aria-checked={s.method === "rfid"} className={"ac2-method" + (s.method === "rfid" ? " on" : "")} onClick={() => pick("rfid")}>
          <b>RFID card</b><span>Students tap their card once a day at the school.</span></button>
        <button type="button" role="radio" aria-checked={s.method === "biometric"} className={"ac2-method" + (s.method === "biometric" ? " on" : "")} onClick={() => pick("biometric")}>
          <b>Biometric (thumb)</b><span>Students scan their thumb once a day at the school.</span></button>
      </div>

      {s.method === "manual" ? (
        <div className="ac2-field">Manual attendance is
          <div className="ac2-sublist" role="radiogroup">
            {[["class", "Class based", "the class incharge marks once a day"], ["period", "Period based", "each subject teacher marks their period"]].map(([v, l, d]) => (
              <button key={v} type="button" role="radio" aria-checked={s.manual_mode === v} className={"ac2-pill" + (s.manual_mode === v ? " on" : "")}
                      onClick={() => set("manual_mode", v)} title={d}>{l} <span className="ac2-muted">· {d}</span></button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <label className="ac2-field">Device model
            <select className="ac2-input" value={s.device_model || ""} onChange={e => set("device_model", e.target.value)}>
              <option value="">Choose the model...</option>
              {models.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <ConnectHelp model={model} />
          <div className="ac2-grid">
            <label className="ac2-field">School starts<input className="ac2-input" type="time" value={s.school_start} onChange={e => set("school_start", e.target.value)} /></label>
            <label className="ac2-field">Late after<input className="ac2-input" type="time" value={s.late_after} onChange={e => set("late_after", e.target.value)} /></label>
            <label className="ac2-field">Absent if no scan by<input className="ac2-input" type="time" value={s.absent_after} onChange={e => set("absent_after", e.target.value)} /></label>
          </div>
          <label className="ac2-muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={!!s.auto_absent} onChange={e => set("auto_absent", e.target.checked)} />
            Mark students absent automatically when they haven't scanned by that time</label>
          <div className="ac2-note info">With {s.method === "rfid" ? "RFID cards" : "biometric scanning"}, teachers don't mark attendance - each student's scan records the whole day.</div>
        </>
      )}
      </fieldset>
      {note && <div className={"ac2-note " + note.type}>{note.msg}</div>}
      {!readOnly && <div><button type="button" className="ac2-btn primary" onClick={save}>Save</button></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Devices */
function DevicesTab() {
  const [rows, setRows] = useState(null);
  const [models, setModels] = useState([]);
  const [f, setF] = useState({ name: "", location: "", model: "", serial_no: "" });
  const [note, setNote] = useState(null);
  const [key, setKey] = useState(null);
  const load = useCallback(() => api.devices().then(r => setRows(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), []);
  useEffect(() => { load(); api.config().then(r => setModels(r.data.data.models || [])).catch(() => {}); }, [load]);
  const m = models.find(x => x.key === f.model);
  const add = async () => {
    setNote(null); setKey(null);
    try { const r = await api.addDevice({ ...f, is_active: true }); setNote({ type: "ok", msg: r.data.message }); setKey(r.data.data.api_key); setF({ name: "", location: "", model: "", serial_no: "" }); load(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const toggle = async d => { try { await api.editDevice(d.id, { ...d, is_active: !d.is_active }); load(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); } };
  const regen = async d => { try { const r = await api.newKey(d.id); setKey(r.data.data.api_key); setNote({ type: "ok", msg: r.data.message }); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); } };
  return (
    <div className="ac2-card">
      <b>Add a device</b>
      <div className="ac2-grid">
        <label className="ac2-field">Name<input className="ac2-input" placeholder="e.g. Main Gate" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="ac2-field">Location<input className="ac2-input" placeholder="optional" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></label>
        <label className="ac2-field">Model
          <select className="ac2-input" value={f.model} onChange={e => setF({ ...f, model: e.target.value })}>
            <option value="">Choose...</option>
            <optgroup label="RFID card">{models.filter(x => x.kind === "rfid").map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
            <optgroup label="Biometric (thumb)">{models.filter(x => x.kind === "biometric").map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
          </select></label>
        {m?.connect === "zkteco" && <label className="ac2-field">Serial number (SN)<input className="ac2-input" value={f.serial_no} onChange={e => setF({ ...f, serial_no: e.target.value })} /></label>}
      </div>
      <ConnectHelp model={m} />
      <div><button type="button" className="ac2-btn primary" disabled={!f.name || !f.model} onClick={add}>Add device</button></div>
      {note && <div className={"ac2-note " + note.type}>{note.msg}</div>}
      {key && <div className="ac2-note info">Device key (copy it now, it won't be shown again): <code style={{ userSelect: "all" }}>{key}</code></div>}
      <div className="ac2-scroll">
        <table className="ac2-table">
          <thead><tr><th>Device</th><th>Model</th><th>Serial</th><th>Last seen</th><th>Scans today</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows && rows.length === 0 && <tr><td colSpan={7} className="ac2-muted">No devices yet.</td></tr>}
            {(rows || []).map(d => (
              <tr key={d.id}>
                <td><b>{d.name}</b>{d.location ? <div className="ac2-muted">{d.location}</div> : null}</td>
                <td>{d.model_label}</td><td>{d.serial_no || "-"}</td>
                <td>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : <span className="ac2-muted">never</span>}</td>
                <td>{d.scans_today}</td>
                <td><span className={"ac2-badge " + (d.is_active ? "r-present" : "r-duplicate")}>{d.is_active ? "Active" : "Off"}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="ac2-btn sm" onClick={() => toggle(d)}>{d.is_active ? "Turn off" : "Turn on"}</button>{" "}
                  {d.connect === "http" && <button type="button" className="ac2-btn sm" onClick={() => regen(d)}>New key</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Cards & fingerprints */
function CardsTab({ defaultKind }) {
  const [kind, setKind] = useState(defaultKind === "biometric" ? "biometric" : "rfid");
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState(false);
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState({});
  const [note, setNote] = useState(null);
  const load = useCallback(() => api.students({ kind, q: q || undefined, missing: missing || undefined }).then(r => setD(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [kind, q, missing]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  const save = async st => {
    setNote(null);
    try { const r = await api.assign(st.id, kind, edit[st.id], st.identifier ? "Replaced" : null); setNote({ type: "ok", msg: `${st.name}: ${r.data.message}` }); setEdit(x => ({ ...x, [st.id]: undefined })); load(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const remove = async st => {
    const reason = window.prompt(`Remove ${st.name}'s ${kind === "rfid" ? "card" : "fingerprint number"}? Reason (e.g. Lost card):`, "Lost card");
    if (reason === null) return;
    try { await api.remove(st.id, kind, reason || "Removed"); load(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="ac2-card">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={"ac2-pill" + (kind === "rfid" ? " on" : "")} onClick={() => setKind("rfid")}>RFID cards</button>
        <button type="button" className={"ac2-pill" + (kind === "biometric" ? " on" : "")} onClick={() => setKind("biometric")}>Fingerprint (device user numbers)</button>
        <input className="ac2-input" style={{ flex: "1 1 200px" }} placeholder="Search student or registration no." value={q} onChange={e => setQ(e.target.value)} />
        <label className="ac2-muted" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={missing} onChange={e => setMissing(e.target.checked)} /> Only without one</label>
      </div>
      {d && <div className="ac2-muted">{d.counts.enrolled} of {d.counts.total} active students have {kind === "rfid" ? "a card" : "a fingerprint number"}.</div>}
      <div className="ac2-muted">{kind === "rfid" ? "Click a card box and tap the card on a USB reader - or type its number - then press Enter."
        : "Enrol the thumb on the terminal first, then type the terminal's user number here. The fingerprint itself stays on the device."}</div>
      {note && <div className={"ac2-note " + note.type}>{note.msg}</div>}
      <div className="ac2-scroll">
        <table className="ac2-table">
          <thead><tr><th>Student</th><th>Class</th><th>{kind === "rfid" ? "Card number" : "Device user no."}</th><th /></tr></thead>
          <tbody>
            {(d?.students || []).map(st => (
              <tr key={st.id}>
                <td><b>{st.name}</b><div className="ac2-muted">{st.enrollment_no || ""}</div></td>
                <td>{st.class_label || "-"}</td>
                <td>
                  <input className="ac2-input" style={{ width: 190 }} value={edit[st.id] ?? st.identifier ?? ""} placeholder={kind === "rfid" ? "tap or type the card" : "user number"}
                         onChange={e => setEdit(x => ({ ...x, [st.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && edit[st.id] && save(st)}
                         aria-label={`${st.name} ${kind === "rfid" ? "card number" : "user number"}`} />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="ac2-btn sm primary" disabled={!edit[st.id] || edit[st.id] === st.identifier} onClick={() => save(st)}>{st.identifier ? "Replace" : "Assign"}</button>{" "}
                  {st.identifier && <button type="button" className="ac2-btn sm" onClick={() => remove(st)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Today */
function TodayTab({ canSettings, canDevices }) {
  const [d, setD] = useState(null);
  const [note, setNote] = useState(null);
  const [pick, setPick] = useState({});
  const [found, setFound] = useState({});
  const load = useCallback(() => api.today().then(r => setD(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const search = async (scan, q) => {
    setPick(x => ({ ...x, [scan.id]: { q } }));
    if (q.length < 2) return setFound(x => ({ ...x, [scan.id]: [] }));
    try { const r = await api.students({ kind: scan.kind, q }); setFound(x => ({ ...x, [scan.id]: r.data.data.students.slice(0, 6) })); } catch {}
  };
  const resolve = async (scan, st) => {
    try { const r = await api.resolve(scan.id, st.id); setNote({ type: "ok", msg: `${st.name}: ${r.data.message}` }); load(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  if (!d) return <div className="ac2-card">{note ? note.msg : "Loading..."}</div>;
  const c = d.counts;
  return (
    <div className="ac2-card">
      <div className="ac2-counts">
        <div className="ac2-count"><b>{c.present}</b><span>Present</span></div>
        <div className="ac2-count"><b>{c.late}</b><span>Late</span></div>
        <div className="ac2-count"><b>{c.absent}</b><span>Absent</span></div>
        <div className="ac2-count"><b>{c.leave}</b><span>On leave</span></div>
        <div className="ac2-count"><b>{c.not_yet}</b><span>Not scanned yet</span></div>
      </div>
      {d.settings.method !== "manual" && <div className="ac2-muted">Late after {d.settings.late_after}. {d.settings.auto_absent ? `Students with no scan by ${d.settings.absent_after} are marked absent automatically.` : ""}
        {canSettings && <> <button type="button" className="ac2-btn sm" onClick={async () => { try { const r = await api.runAbsentees(); setNote({ type: "ok", msg: r.data.message }); load(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); } }}>Mark absentees now</button></>}</div>}
      {note && <div className={"ac2-note " + note.type}>{note.msg}</div>}
      {d.unknown.length > 0 && (
        <>
          <b>Unknown cards / numbers ({d.unknown.length})</b>
          {d.unknown.map(sc => (
            <div key={sc.id} className="ac2-help" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span><b>{sc.identifier}</b> · {timeOf(sc.scanned_at)}{sc.device ? " · " + sc.device : ""}</span>
              {canDevices && <span style={{ position: "relative", flex: "1 1 220px" }}>
                <input className="ac2-input" style={{ width: "100%" }} placeholder="Whose is it? Search student..." value={pick[sc.id]?.q || ""} onChange={e => search(sc, e.target.value)} />
                {(found[sc.id] || []).map(st => (
                  <button key={st.id} type="button" className="ac2-btn sm" style={{ margin: "4px 4px 0 0" }} onClick={() => resolve(sc, st)}>{st.name} · {st.class_label}</button>
                ))}
              </span>}
            </div>
          ))}
        </>
      )}
      <b>Today's scans</b>
      <div className="ac2-scroll">
        <table className="ac2-table">
          <thead><tr><th>Time</th><th>Student</th><th>Class</th><th>Card / number</th><th>Device</th><th>Result</th></tr></thead>
          <tbody>
            {d.scans.length === 0 && <tr><td colSpan={6} className="ac2-muted">No scans yet today.</td></tr>}
            {d.scans.map(sc => (
              <tr key={sc.id}><td>{timeOf(sc.scanned_at)}</td><td>{sc.student || "-"}</td><td>{sc.class_label || "-"}</td><td>{sc.identifier}</td><td>{sc.device || "Gate screen"}</td>
                <td><span className={"ac2-badge r-" + sc.result}>{RESULT[sc.result] || sc.result}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Attendance Setup panel (Academic Setup > Attendance Setup) */
export function AttendanceSetupPanel({ canManage = true }) {
  const { can } = useAuth();
  const [method, setMethod] = useState(null);
  useEffect(() => { api.config().then(r => setMethod(r.data.data.method)).catch(() => setMethod("manual")); }, []);
  const [tab, setTab] = useState("method");
  // devices and cards can be prepared BEFORE switching the school to RFID / Biometric, so the tabs follow permissions only
  const tabs = [["method", "Method"],
                can("attendance.device_management") && ["devices", "Devices"],
                can("attendance.device_management") && ["cards", "Cards & fingerprints"],
                can("attendance.scan_log") && ["today", "Today"]].filter(Boolean);
  const notInUse = method === "manual" && tab !== "method" && (
    <div className="ac2-note info" style={{ marginBottom: 12 }}>Not in use yet - this campus records attendance manually. You can prepare devices and cards now;
      choose <b>RFID card</b> or <b>Biometric</b> under <b>Method</b> to start recording attendance from scans.</div>);
  return (
    <div className="ac2" style={{ padding: 0, maxWidth: "none" }}>
      <div className="ac2-sub">How student attendance is recorded: manually by teachers (class or period based), by RFID card, or by thumb scan.
        {method && <> Currently: <b>{method === "manual" ? "Manual" : method === "rfid" ? "RFID card" : "Biometric (thumb)"}</b>.</>}</div>
      {tabs.length > 1 && (
        <div className="ac2-tabs" role="tablist">
          {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={"ac2-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      )}
      {notInUse}
      {tab === "method" && <MethodTab readOnly={!canManage} onSaved={m => setMethod(m)} />}
      {tab === "devices" && <DevicesTab />}
      {tab === "cards" && <CardsTab defaultKind={method} />}
      {tab === "today" && <TodayTab canSettings={canManage} canDevices={can("attendance.device_management")} />}
    </div>
  );
}

/* the old separate page - now just the same panel (kept so an old bookmark still works) */
export default function AttendanceCapture() {
  return <div className="ac2"><h1>Attendance Setup</h1><AttendanceSetupPanel /></div>;
}

/* ------------------------------------------------------------------ Gate Scan (kiosk, USB RFID reader) */
export function GateScan() {
  const [last, setLast] = useState(null);
  const [recent, setRecent] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [err, setErr] = useState("");
  const buf = useRef("");
  const input = useRef(null);
  const clear = useRef(null);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {                             // keep the hidden box focused so every card tap lands here
    const f = () => input.current && input.current.focus();
    f(); const t = setInterval(f, 1500); window.addEventListener("click", f); return () => { clearInterval(t); window.removeEventListener("click", f); };
  }, []);
  const submit = async code => {
    if (!code.trim()) return;
    setErr("");
    try {
      const r = await api.gateScan(code.trim());
      const d = r.data.data; setLast(d); setRecent(x => [d, ...x].slice(0, 12));
      clearTimeout(clear.current); clear.current = setTimeout(() => setLast(null), 4000);
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <div className="gate ac2" style={{ maxWidth: "none" }}>
      <div className="gate-top">
        <div><h1 style={{ margin: 0 }}>Gate Scan</h1><div className="ac2-sub">Tap your card on the reader</div></div>
        <div className="gate-clock">{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
      </div>
      <input ref={input} className="gate-input" aria-label="Card number" autoComplete="off"
             onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = buf.current; buf.current = ""; e.target.value = ""; submit(v); } }}
             onChange={e => { buf.current = e.target.value; }} />
      {err && <div className="ac2-note err">{err}</div>}
      <div className={"gate-result" + (last ? " " + last.result : "")} role="status" aria-live="assertive">
        {!last ? <div className="gate-small" style={{ color: "var(--c-ink3)" }}>Waiting for a card...</div> : (
          <>
            <div className="gate-big">{RESULT[last.result] || last.result}</div>
            {last.student && <div className="gate-name">{last.student.name}</div>}
            {last.student && <div className="gate-small">{last.student.class_label} · {last.time}</div>}
            {last.result === "unknown" && <div className="gate-small">This card isn't registered - please see the office.</div>}
          </>
        )}
      </div>
      <div className="gate-recent">
        {recent.map((r, i) => <span key={i} className={"ac2-badge r-" + r.result}>{r.time} · {r.student ? r.student.name : "Unknown card"} · {RESULT[r.result] || r.result}</span>)}
      </div>
    </div>
  );
}
