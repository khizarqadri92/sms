import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import labApi from "../api/labApi";
import "./Laboratory.css";

const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const STATUS_LABEL = { active: "Active", inactive: "Inactive", under_maintenance: "Under maintenance" };
const Status = ({ s }) => <span className={"lab-badge s-" + s}>{STATUS_LABEL[s] || s}</span>;
const Note = ({ n }) => n ? <div className={"lab-note " + (n.type === "ok" ? "ok" : "err")}>{n.msg}</div> : null;
const supLabel = s => `${s.name}${s.is_teacher ? " - Teacher" : s.department ? " - " + s.department : ""}${s.has_role ? " (Lab Supervisor" + (s.labs_supervised ? `, ${s.labs_supervised} lab${s.labs_supervised > 1 ? "s" : ""}` : "") + ")" : ""}`;
const EMPTY_LAB = { name: "", code: "", lab_type_id: "", building: "", floor: "", room_number: "", capacity: "", supervisor_user_id: "",
                    description: "", safety_instructions: "", facilities: "" };

/* ================================================================== Dashboard */
export function LabDashboard() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [inv, setInv] = useState({});
  const [err, setErr] = useState("");
  useEffect(() => {
    labApi.dashboard().then(r => setD(r.data.data)).catch(e => setErr(errMsg(e)));
    if (labApi.inventorySummary) labApi.inventorySummary().then(r => setInv(r.data.data || {})).catch(() => {});
  }, []);
  if (err) return <div className="lab"><h1>Laboratory</h1><div className="lab-note err">{err}</div></div>;
  if (!d) return <div className="lab"><h1>Laboratory</h1><div className="lab-muted">Loading...</div></div>;
  const k = d.kpis, maxT = Math.max(1, ...d.by_type.map(x => x.n));
  const Kpi = ({ n, label, to }) => <button type="button" className="lab-kpi" onClick={() => navigate(to)}><b>{n}</b><span>{label}</span></button>;
  return (
    <div className="lab">
      <div><h1>Laboratory</h1><div className="lab-sub">Labs, equipment, stock, practicals and safety.</div></div>
      <div className="lab-kpis">
        <Kpi n={k.total} label="Total labs" to="/lab/labs" />
        <Kpi n={k.active} label="Active labs" to="/lab/labs?status=active" />
        <Kpi n={k.under_maintenance} label="Under maintenance" to="/lab/labs?status=under_maintenance" />
        <Kpi n={k.inactive} label="Inactive" to="/lab/labs?status=inactive" />
        <Kpi n={k.without_supervisor} label="Without a supervisor" to="/lab/labs" />
        <Kpi n={k.active_capacity} label="Seats in active labs" to="/lab/labs?status=active" />
      </div>
      {(inv.equipment || inv.stock) && (
        <div className="lab-kpis">
          {inv.equipment && <>
            <Kpi n={inv.equipment.total_units} label="Equipment (units)" to="/lab/equipment" />
            <Kpi n={inv.equipment.available_units} label="Available" to="/lab/equipment?status=available" />
            <Kpi n={inv.equipment.issued_units} label="Issued" to="/lab/issues" />
            <Kpi n={inv.equipment.out_of_service} label="Under maintenance / damaged" to="/lab/equipment?status=under_maintenance" />
            <Kpi n={inv.overdue_returns} label="Overdue returns" to="/lab/issues?overdue=1" />
            <Kpi n={inv.pending_requests} label="Requests to approve" to="/lab/issues" />
          </>}
          {inv.stock && <>
            <Kpi n={inv.stock.low_stock} label="Low-stock items" to="/lab/consumables?flag=low" />
            <Kpi n={inv.stock.near_expiry} label="Near expiry" to="/lab/consumables?flag=near_expiry" />
            <Kpi n={inv.stock.expired} label="Expired stock" to="/lab/consumables?flag=expired" />
            {inv.stock.grn_pending > 0 && <Kpi n={inv.stock.grn_pending} label="Goods received to put away" to="/lab/consumables" />}
          </>}
        </div>
      )}
      <div className="lab-grid2">
        <div className="lab-card">
          <b>Labs by type</b>
          {d.by_type.length === 0 ? <div className="lab-muted" style={{ marginTop: 8 }}>No labs yet.</div> : d.by_type.map(x => (
            <div key={x.name} className="lab-bar"><span>{x.name}</span><span className="lab-bar-track"><span className="lab-bar-fill" style={{ display: "block", width: (x.n / maxT * 100) + "%" }} /></span><span>{x.n}</span></div>
          ))}
        </div>
        <div className="lab-card">
          <b>Needs attention</b>
          {d.alerts.length === 0 ? <div className="lab-muted" style={{ marginTop: 8 }}>Nothing needs attention.</div> : d.alerts.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--l-line)", cursor: "pointer" }}
                 onClick={() => navigate(`/lab/labs?open=${a.id}`)}>
              <span style={{ flex: 1 }}><b>{a.name}</b> <span className="lab-muted">({a.code})</span>
                <div className="lab-muted">{a.status === "under_maintenance" ? (a.status_reason || "Under maintenance") : "No supervisor assigned"}</div></span>
              <Status s={a.status} />
            </div>
          ))}
        </div>
      </div>
      <div className="lab-muted">Practical sessions, maintenance and incident figures appear here as those parts are added.</div>
    </div>
  );
}

/* ================================================================== Lab form (create / edit) */
function LabForm({ lab, meta, supervisors, onClose, onSaved }) {
  const [f, setF] = useState(lab ? { ...EMPTY_LAB, ...Object.fromEntries(Object.entries(lab).map(([k, v]) => [k, v ?? ""])) } : EMPTY_LAB);
  const [note, setNote] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const canAssign = meta.can_manage_all || meta.can_assign;
  const types = (meta.lookups.lab_type || []).filter(t => t.is_active || String(t.id) === String(f.lab_type_id));
  const save = async () => {
    setNote(null);
    const body = { ...f, capacity: Number(f.capacity), lab_type_id: f.lab_type_id ? Number(f.lab_type_id) : null,
                   supervisor_user_id: f.supervisor_user_id ? Number(f.supervisor_user_id) : null };
    try { const r = lab ? await labApi.updateLab(lab.id, body) : await labApi.createLab(body); onSaved(r.data.message); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="lab-modal" onClick={onClose}>
      <aside className="lab-panel" role="dialog" aria-label={lab ? "Edit lab" : "Add lab"} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}><b style={{ flex: 1, fontSize: 16 }}>{lab ? "Edit lab" : "Add lab"}</b>
          <button type="button" className="lab-btn sm" onClick={onClose}>Close</button></div>
        <div className="lab-form">
          <label className="lab-field">Lab name *<input className="lab-input" value={f.name} onChange={e => set("name", e.target.value)} /></label>
          <label className="lab-field">Lab code *<input className="lab-input" value={f.code} disabled={lab && !meta.can_manage_all} onChange={e => set("code", e.target.value.toUpperCase())} /></label>
          <label className="lab-field">Type<select className="lab-input" value={f.lab_type_id} onChange={e => set("lab_type_id", e.target.value)}>
            <option value="">Choose...</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="lab-field">Capacity (students) *<input className="lab-input" type="number" min={1} value={f.capacity} onChange={e => set("capacity", e.target.value)} /></label>
          <label className="lab-field">Building<input className="lab-input" value={f.building} onChange={e => set("building", e.target.value)} /></label>
          <label className="lab-field">Floor<input className="lab-input" value={f.floor} onChange={e => set("floor", e.target.value)} /></label>
          <label className="lab-field">Room number<input className="lab-input" value={f.room_number} onChange={e => set("room_number", e.target.value)} /></label>
          <label className="lab-field">Supervisor<select className="lab-input" value={f.supervisor_user_id} disabled={!canAssign} onChange={e => set("supervisor_user_id", e.target.value)}>
            <option value="">No supervisor yet</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{supLabel(s)}</option>)}
            {lab && lab.supervisor_user_id && !supervisors.some(s => s.id === lab.supervisor_user_id) && <option value={lab.supervisor_user_id}>{lab.supervisor_name}</option>}
          </select></label>
          <label className="lab-field wide">Facilities<textarea className="lab-input" rows={2} value={f.facilities} onChange={e => set("facilities", e.target.value)} placeholder="e.g. 12 workbenches, fume hood, projector" /></label>
          <label className="lab-field wide">Safety instructions<textarea className="lab-input" rows={3} value={f.safety_instructions} onChange={e => set("safety_instructions", e.target.value)} /></label>
          <label className="lab-field wide">Description<textarea className="lab-input" rows={2} value={f.description} onChange={e => set("description", e.target.value)} /></label>
        </div>
        {canAssign && <div className="lab-muted">Any teacher or staff member can be chosen. If they don't have the Lab Supervisor role yet, it is given automatically.</div>}
        <Note n={note} />
        <div><button type="button" className="lab-btn primary" onClick={save}>{lab ? "Save" : "Add lab"}</button></div>
      </aside>
    </div>
  );
}

/* ================================================================== Lab details */
function LabDetails({ id, meta, supervisors, onClose, onChanged, onEdit }) {
  const [lab, setLab] = useState(null);
  const [note, setNote] = useState(null);
  const [sup, setSup] = useState("");
  const load = useCallback(() => labApi.lab(id).then(r => { setLab(r.data.data); setSup(r.data.data.supervisor_user_id || ""); }).catch(e => setNote({ type: "err", msg: errMsg(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  const status = async s => {
    const reason = s === "active" ? "" : window.prompt(s === "inactive" ? "Why is the lab being deactivated?" : "What maintenance is being done?");
    if (reason === null) return;
    try { const r = await labApi.setStatus(id, s, reason); setNote({ type: "ok", msg: r.data.message }); load(); onChanged(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const changeSup = async () => {
    try { const r = await labApi.setSupervisor(id, sup ? Number(sup) : null); setNote({ type: "ok", msg: r.data.message }); load(); onChanged(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="lab-modal" onClick={onClose}>
      <aside className="lab-panel" role="dialog" aria-label="Lab details" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ flex: 1, fontSize: 16 }}>{lab ? `${lab.name} (${lab.code})` : "Lab"}</b>
          {lab?.can_edit && <button type="button" className="lab-btn sm" onClick={() => onEdit(lab)}>Edit</button>}
          <button type="button" className="lab-btn sm" onClick={onClose}>Close</button>
        </div>
        <Note n={note} />
        {lab && (
          <>
            <div><Status s={lab.status} />{lab.status_reason && lab.status !== "active" && <span className="lab-muted"> · {lab.status_reason}</span>}</div>
            <dl className="lab-kv">
              <dt>Type</dt><dd>{lab.lab_type || "-"}</dd>
              <dt>Location</dt><dd>{[lab.building, lab.floor && `Floor ${lab.floor}`, lab.room_number && `Room ${lab.room_number}`].filter(Boolean).join(", ") || "-"}</dd>
              <dt>Capacity</dt><dd>{lab.capacity} students</dd>
              <dt>Supervisor</dt><dd>{lab.supervisor_name || <span className="lab-muted">None</span>}</dd>
              <dt>Facilities</dt><dd>{lab.facilities || "-"}</dd>
              <dt>Safety instructions</dt><dd>{lab.safety_instructions || "-"}</dd>
              <dt>Description</dt><dd>{lab.description || "-"}</dd>
            </dl>
            {lab.can_change_status && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {lab.status !== "active" && <button type="button" className="lab-btn sm" onClick={() => status("active")}>Reactivate</button>}
                {lab.status !== "under_maintenance" && <button type="button" className="lab-btn sm" onClick={() => status("under_maintenance")}>Mark under maintenance</button>}
                {lab.status !== "inactive" && <button type="button" className="lab-btn sm danger" onClick={() => status("inactive")}>Deactivate</button>}
              </div>
            )}
            {lab.can_assign && (
              <div className="lab-card" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="lab-field" style={{ flex: 1, minWidth: 200 }}>Supervisor
                  <select className="lab-input" value={sup} onChange={e => setSup(e.target.value)}>
                    <option value="">No supervisor</option>{supervisors.map(s => <option key={s.id} value={s.id}>{supLabel(s)}</option>)}
                  </select></label>
                <button type="button" className="lab-btn sm primary" disabled={String(sup) === String(lab.supervisor_user_id || "")} onClick={changeSup}>Change supervisor</button>
              </div>
            )}
            <div>
              <b>Supervisor history</b>
              {lab.supervisor_history.length === 0 ? <div className="lab-muted">No supervisor has been assigned yet.</div> : (
                <table className="lab-table" style={{ marginTop: 6 }}>
                  <thead><tr><th>Supervisor</th><th>From</th><th>To</th><th>Changed by</th></tr></thead>
                  <tbody>{lab.supervisor_history.map((h, i) => (
                    <tr key={i} style={{ cursor: "default" }}><td>{h.name}</td><td>{(h.from_at || "").slice(0, 10)}</td><td>{h.to_at ? h.to_at.slice(0, 10) : "now"}</td><td>{h.changed_by || "-"}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div className="lab-muted">Equipment, consumables, timetable, sessions and maintenance for this lab appear here as those parts are added.</div>
          </>
        )}
      </aside>
    </div>
  );
}

/* ================================================================== Labs list */
export function LabsPage() {
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [f, setF] = useState({ q: "", status: params.get("status") || "", lab_type_id: "", mine: false });
  const [form, setForm] = useState(null);           // {} new, {lab} edit
  const [open, setOpen] = useState(params.get("open") ? Number(params.get("open")) : null);
  const [note, setNote] = useState(null);
  const load = useCallback(() => labApi.labs({ q: f.q || undefined, status: f.status || undefined, lab_type_id: f.lab_type_id || undefined, mine: f.mine || undefined })
    .then(r => setRows(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [f]);
  useEffect(() => {
    labApi.meta().then(r => { setMeta(r.data.data); if (r.data.data.can_manage_all || r.data.data.can_assign) labApi.supervisors().then(s => setSupervisors(s.data.data)).catch(() => {}); })
      .catch(e => setNote({ type: "err", msg: errMsg(e) }));
  }, []);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  if (!meta) return <div className="lab"><h1>Labs</h1>{note ? <Note n={note} /> : <div className="lab-muted">Loading...</div>}</div>;
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); if (k === "status") setParams(v ? { status: v } : {}); };
  return (
    <div className="lab">
      <div className="lab-head">
        <div><h1>Labs</h1><div className="lab-sub">Every laboratory, its supervisor and its status.</div></div>
        {meta.can_manage_all && <button type="button" className="lab-btn primary" onClick={() => setForm({})}>Add lab</button>}
      </div>
      <div className="lab-filters" role="search">
        <input className="lab-input" style={{ flex: "1 1 220px" }} placeholder="Search name, code, building or room" value={f.q} onChange={e => set("q", e.target.value)} aria-label="Search labs" />
        <select className="lab-input" value={f.status} onChange={e => set("status", e.target.value)} aria-label="Status">
          <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="lab-input" value={f.lab_type_id} onChange={e => set("lab_type_id", e.target.value)} aria-label="Type">
          <option value="">All types</option>{(meta.lookups.lab_type || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {meta.supervised_lab_ids.length > 0 && <label className="lab-check" style={{ borderRadius: 8 }}><input type="checkbox" checked={f.mine} onChange={e => set("mine", e.target.checked)} /> Only labs I supervise</label>}
      </div>
      <Note n={note} />
      <div className="lab-card" style={{ padding: 0 }}>
        <div className="lab-scroll">
          <table className="lab-table">
            <thead><tr><th>Lab</th><th>Type</th><th>Location</th><th>Capacity</th><th>Supervisor</th><th>Status</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={6} className="lab-muted">Loading...</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={6} className="lab-muted">{meta.can_manage_all ? "No labs yet - add the first one." : "No labs found."}</td></tr>}
              {(rows || []).map(l => (
                <tr key={l.id} onClick={() => setOpen(l.id)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setOpen(l.id)}>
                  <td><b>{l.name}</b><div className="lab-muted">{l.code}</div></td>
                  <td>{l.lab_type || "-"}</td>
                  <td>{[l.building, l.room_number && `Room ${l.room_number}`].filter(Boolean).join(", ") || "-"}</td>
                  <td>{l.capacity}</td>
                  <td>{l.supervisor_name || <span className="lab-muted">None</span>}</td>
                  <td><Status s={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <LabDetails id={open} meta={meta} supervisors={supervisors} onClose={() => setOpen(null)} onChanged={load}
                           onEdit={lab => { setOpen(null); setForm({ lab }); }} />}
      {form && <LabForm lab={form.lab} meta={meta} supervisors={supervisors} onClose={() => setForm(null)}
                        onSaved={m => { setForm(null); setNote({ type: "ok", msg: m }); load(); }} />}
    </div>
  );
}

/* ================================================================== Settings */
function ListEditor({ kind, title, items, onChanged }) {
  const [add, setAdd] = useState({ code: "", name: "" });
  const [note, setNote] = useState(null);
  const create = async () => {
    try { const r = await labApi.addLookup({ kind, ...add }); setNote({ type: "ok", msg: r.data.message }); setAdd({ code: "", name: "" }); onChanged(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const toggle = async it => {
    try { const r = await labApi.editLookup(it.id, { kind, code: it.code, name: it.name, description: it.description, sort_order: it.sort_order, is_active: !it.is_active });
          setNote({ type: "ok", msg: r.data.message }); onChanged(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="lab-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b>{title}</b>
      <div className="lab-filters">
        <input className="lab-input" style={{ width: 110 }} placeholder="Code" value={add.code} onChange={e => setAdd({ ...add, code: e.target.value.toUpperCase() })} />
        <input className="lab-input" style={{ flex: "1 1 200px" }} placeholder="Name" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} onKeyDown={e => e.key === "Enter" && create()} />
        <button type="button" className="lab-btn sm primary" disabled={!add.code || !add.name} onClick={create}>Add</button>
      </div>
      <Note n={note} />
      <table className="lab-table">
        <thead><tr><th>Code</th><th>Name</th><th>Status</th><th /></tr></thead>
        <tbody>{items.map(it => (
          <tr key={it.id} style={{ cursor: "default" }}><td>{it.code}</td><td>{it.name}</td><td><span className={"lab-badge " + (it.is_active ? "s-active" : "s-inactive")}>{it.is_active ? "In use" : "Hidden"}</span></td>
            <td><button type="button" className="lab-btn sm" onClick={() => toggle(it)}>{it.is_active ? "Hide" : "Use again"}</button></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function LabSettingsPage() {
  const [tab, setTab] = useState("general");
  const [kinds, setKinds] = useState({});
  const [items, setItems] = useState([]);
  const [s, setS] = useState(null);
  const [note, setNote] = useState(null);
  const loadLists = useCallback(() => labApi.lookups().then(r => setItems(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), []);
  useEffect(() => {
    labApi.meta().then(r => setKinds(r.data.data.kinds)).catch(() => {});
    labApi.getSettings().then(r => setS(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) }));
    loadLists();
  }, [loadLists]);
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));
  const save = async () => {
    try { const r = await labApi.saveSettings(s); setNote({ type: "ok", msg: r.data.message }); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const toggleClass = c => set("practical_classes", s.practical_classes.includes(c) ? s.practical_classes.filter(x => x !== c) : [...s.practical_classes, c]);
  return (
    <div className="lab">
      <div><h1>Lab Settings</h1><div className="lab-sub">Lists used across the laboratory module, alerts, and which classes have practical work.</div></div>
      <div className="lab-tabs" role="tablist">
        {[["general", "General"], ...Object.entries(kinds)].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={"lab-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "general" && (s ? (
        <div className="lab-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="lab-muted">Applies to: <b>{s.scope}</b></div>
          <div className="lab-field">Classes with practical work <span style={{ fontWeight: 400 }}>- students of these classes see their own lab sessions, experiments and practical results</span>
            <div className="lab-checks" style={{ marginTop: 6 }}>
              {s.class_names.length === 0 && <span className="lab-muted">No classes in the current session.</span>}
              {s.class_names.map(c => (
                <label key={c} className={"lab-check" + (s.practical_classes.includes(c) ? " on" : "")}>
                  <input type="checkbox" checked={s.practical_classes.includes(c)} onChange={() => toggleClass(c)} /> {c}</label>
              ))}
            </div>
          </div>
          <div className="lab-form">
            <label className="lab-field">Warn about expiry (days before)<input className="lab-input" type="number" min={1} max={365} value={s.near_expiry_days} onChange={e => set("near_expiry_days", Number(e.target.value))} /></label>
            <label className="lab-field">Default equipment issue period (days)<input className="lab-input" type="number" min={1} max={90} value={s.default_issue_days} onChange={e => set("default_issue_days", Number(e.target.value))} /></label>
          </div>
          {[["low_stock_alerts", "Notify lab supervisors when stock falls below its minimum"],
            ["allow_schedule_under_maintenance", "Allow booking labs that are under maintenance (people with the override permission only)"],
            ["student_access", "Students of practical classes can see their lab activities"],
            ["results_integration", "Practical marks can be added to exam results (when an assessment is linked to an exam)"]].map(([k, l]) => (
            <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}><input type="checkbox" checked={!!s[k]} onChange={e => set(k, e.target.checked)} /> {l}</label>
          ))}
          <Note n={note} />
          <div><button type="button" className="lab-btn primary" onClick={save}>Save</button></div>
        </div>
      ) : <div className="lab-card">{note ? <Note n={note} /> : "Loading..."}</div>)}
      {tab !== "general" && <ListEditor kind={tab} title={kinds[tab]} items={items.filter(i => i.kind === tab)} onChanged={loadLists} />}
    </div>
  );
}
