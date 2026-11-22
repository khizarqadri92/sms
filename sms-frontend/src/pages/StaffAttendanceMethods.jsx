import { useState, useEffect, useCallback } from "react";
import attendanceApi from "../api/attendanceApi";

const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const Msg = ({ m }) => m ? (
  <div className="ad-msg" style={{ "--msg-bg": m.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)", "--msg-color": m.type === "success" ? "#166534" : "#dc2626" }}>
    {m.type === "success" ? "\u2713 " : "\u26a0 "}{m.text}</div>) : null;

/* Settings tab: which ways employees record attendance */
export function StaffMethodsCard({ locked = false }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { attendanceApi.getCaptureSettings().then(r => setS(r.data.data)).catch(e => setMsg({ type: "error", text: errMsg(e) })); }, []);
  if (!s) return <div className="ad-settings-card"><div className="ad-settings-title">Attendance Methods</div>{msg ? <Msg m={msg} /> : "Loading..."}</div>;
  const set = (k, v) => { setS(x => ({ ...x, [k]: v })); setMsg(null); };
  const save = async () => {
    try { const r = await attendanceApi.updateCaptureSettings({ rfid_enabled: s.rfid_enabled, biometric_enabled: s.biometric_enabled, self_service_allowed: s.self_service_allowed });
          setMsg({ type: "success", text: r.data.message }); }
    catch (e) { setMsg({ type: "error", text: errMsg(e) }); }
  };
  const Row = ({ k, title, desc }) => (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border-color, #E5E7EB)", borderRadius: 8, cursor: locked ? "default" : "pointer" }}>
      <input type="checkbox" checked={!!s[k]} disabled={locked} onChange={e => set(k, e.target.checked)} style={{ marginTop: 3 }} />
      <span><b style={{ fontSize: 13 }}>{title}</b><br /><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{desc}</span></span>
    </label>
  );
  return (
    <div className="ad-settings-card" style={{ marginBottom: 16 }}>
      <div className="ad-settings-title">Attendance Methods</div>
      {locked && <div className="ad-readonly-notice">Managed centrally by the superadmin. Read-only here.</div>}
      <div className="ad-settings-desc">How employees clock in and out. Applies to: <b>{s.scope}</b>.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 620 }}>
        <Row k="rfid_enabled" title="RFID card" desc="Employees tap their card on a reader (cards are assigned under RFID Cards)." />
        <Row k="biometric_enabled" title="Biometric (thumb)" desc="Employees scan their thumb on a terminal (user numbers are assigned under Biometric). The same terminals as students can be used." />
        <Row k="self_service_allowed" title="Clock in / out from their own page" desc="Shows the Clock In / Clock Out button on each employee's My Attendance page. Turn off to allow only cards / biometric - the button is then hidden for every employee." />
      </div>
      {!locked && <div style={{ marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={save}>Save</button></div>}
      <Msg m={msg} />
    </div>
  );
}

/* Biometric tab - same layout as the RFID Cards tab */
export function StaffBiometricTab() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ staff_id: "", identifier: "" });
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => attendanceApi.getBiometricIds().then(r => setRows(r.data.data || [])).catch(e => setMsg({ type: "error", text: errMsg(e) })), []);
  useEffect(() => { load(); }, [load]);
  const assign = async () => {
    if (!form.staff_id || !form.identifier.trim()) { setMsg({ type: "error", text: "Select the staff member and enter their user number." }); return; }
    try {
      const r = await attendanceApi.assignBiometricId({ staff_id: Number(form.staff_id), identifier: form.identifier.trim() });
      setMsg({ type: "success", text: r.data.message }); setForm({ staff_id: "", identifier: "" }); load();
    } catch (e) { setMsg({ type: "error", text: errMsg(e) }); }
  };
  const remove = async r => {
    if (!window.confirm(`Remove ${r.name}'s biometric number?`)) return;
    try { const res = await attendanceApi.removeBiometricId(r.id); setMsg({ type: "success", text: res.data.message }); load(); }
    catch (e) { setMsg({ type: "error", text: errMsg(e) }); }
  };
  const assigned = rows.filter(r => r.identifier);
  return (
    <div>
      <div className="ad-card">
        <div className="ad-card-title">Assign Biometric Number</div>
        <div className="ad-assign-row">
          <select className="form-input ad-select-flex" value={form.staff_id} onChange={e => setForm(p => ({ ...p, staff_id: e.target.value }))}>
            <option value="">Select staff...</option>
            {rows.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name} {s.employee_code ? "(" + s.employee_code + ")" : ""}{s.identifier ? " - has " + s.identifier : ""}</option>)}
          </select>
          <input className="form-input ad-input-flex" placeholder="User number on the terminal (e.g. 1042)"
                 value={form.identifier} onChange={e => setForm(p => ({ ...p, identifier: e.target.value }))} onKeyDown={e => e.key === "Enter" && assign()} />
          <button className="btn btn-primary btn-sm ad-assign-btn" onClick={assign}>Assign</button>
        </div>
        <div className="ad-help-text">Enrol the employee's thumb on the terminal first, then enter the terminal's user number here. The fingerprint itself stays on the device.</div>
        <Msg m={msg} />
      </div>

      <div className="ad-card-flat">
        <div className="ad-card-header">Assigned Numbers ({assigned.length} of {rows.length} staff)</div>
        {assigned.length === 0 ? (
          <div className="ad-empty-text">No biometric numbers assigned yet.</div>
        ) : (
          assigned.map(r => (
            <div key={r.id} className="ad-card-row">
              <div>
                <div className="ad-card-row-name">{r.name}{r.department ? <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}> · {r.department}</span> : null}</div>
                <div className="ad-card-row-uid">User no. {r.identifier}</div>
              </div>
              <div className="ad-card-row-right">
                <span className="ad-active-badge" style={{ "--badge-bg": "#f0fdf4", "--badge-color": "#166534" }}>Active</span>
                <button className="btn btn-ghost btn-sm ad-deactivate-btn" onClick={() => remove(r)}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
