import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import labApi from "../api/labApi";
import "./Laboratory.css";

const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const Note = ({ n }) => n ? <div className={"lab-note " + (n.type === "ok" ? "ok" : "err")}>{n.msg}</div> : null;
const num = v => (v === null || v === undefined || v === "") ? "-" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const day = v => (v || "").slice(0, 10);
const EQ_STATUS = { available: "Available", issued: "Issued", partially_available: "Partly issued", under_maintenance: "Under maintenance", lost: "Lost", retired: "Retired" };
const EQ_CLASS = { available: "s-active", issued: "s-under_maintenance", partially_available: "s-under_maintenance", under_maintenance: "s-under_maintenance", lost: "s-inactive", retired: "s-inactive" };
const ISSUE_STATUS = { requested: "Requested", approved: "Approved", issued: "Issued", partially_returned: "Partly returned", returned: "Returned", rejected: "Rejected", cancelled: "Cancelled" };
const KIND_LABEL = { receipt: "Receipt", issue: "Issue", consumption: "Consumption", transfer_out: "Transfer out", transfer_in: "Transfer in", adjustment: "Adjustment",
                     return: "Return", damage: "Damage", expiry: "Expiry", disposal: "Disposal", reversal: "Reversal" };
const MOVE_LABEL = { registered: "Registered", transfer: "Transferred", issue: "Issued", return: "Returned", damaged: "Damaged", lost: "Lost", maintenance_out: "Sent for maintenance",
                     repaired: "Back in service", retired: "Retired", condition: "Condition changed", quantity_adjust: "Units added" };

function useLabs() {
  const [labs, setLabs] = useState([]);
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    labApi.labs({ limit: 200 }).then(r => setLabs(r.data.data || [])).catch(() => {});
    labApi.meta().then(r => setMeta(r.data.data)).catch(() => {});
  }, []);
  return { labs, meta };
}
const Panel = ({ title, onClose, children, right }) => (
  <div className="lab-modal" onClick={onClose}>
    <aside className="lab-panel" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ flex: 1, fontSize: 16 }}>{title}</b>{right}
        <button type="button" className="lab-btn sm" onClick={onClose}>Close</button></div>
      {children}
    </aside>
  </div>
);

/* ================================================================== EQUIPMENT REGISTER */
const EMPTY_EQ = { lab_id: "", category_id: "", name: "", code: "", tracking: "quantity", quantity: 1, serial_no: "", asset_tag: "", manufacturer: "", model: "",
                   purchase_date: "", purchase_price: "", supplier_name: "", warranty_expiry: "", condition: "good", remarks: "" };

function EquipmentForm({ item, labs, meta, suppliers, onClose, onSaved }) {
  const [f, setF] = useState(item ? { ...EMPTY_EQ, ...Object.fromEntries(Object.entries(item).filter(([k]) => k in EMPTY_EQ).map(([k, v]) => [k, v ?? ""])) } : EMPTY_EQ);
  const [note, setNote] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...f, lab_id: Number(f.lab_id), category_id: f.category_id ? Number(f.category_id) : null, quantity: Number(f.quantity) || 1,
                   purchase_price: f.purchase_price === "" ? null : Number(f.purchase_price), purchase_date: f.purchase_date || null, warranty_expiry: f.warranty_expiry || null };
    try { const r = item ? await labApi.editEquipment(item.id, body) : await labApi.addEquipment(body); onSaved(r.data.message); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <Panel title={item ? `Edit ${item.name}` : "Register equipment"} onClose={onClose}>
      <div className="lab-form">
        <label className="lab-field">Lab *<select className="lab-input" value={f.lab_id} disabled={!!item} onChange={e => set("lab_id", e.target.value)}>
          <option value="">Choose...</option>{labs.filter(l => l.status !== "inactive").map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="lab-field">Category<select className="lab-input" value={f.category_id} onChange={e => set("category_id", e.target.value)}>
          <option value="">Choose...</option>{(meta?.lookups.equipment_category || []).filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="lab-field">Name *<input className="lab-input" value={f.name} onChange={e => set("name", e.target.value)} /></label>
        <label className="lab-field">Code *<input className="lab-input" value={f.code} onChange={e => set("code", e.target.value.toUpperCase())} /></label>
        {!item && <label className="lab-field">Tracking<select className="lab-input" value={f.tracking} onChange={e => set("tracking", e.target.value)}>
          <option value="quantity">By quantity (identical items)</option><option value="individual">Individual item (serial / asset tag)</option></select></label>}
        {!item && f.tracking === "quantity" && <label className="lab-field">Quantity *<input className="lab-input" type="number" min={1} value={f.quantity} onChange={e => set("quantity", e.target.value)} /></label>}
        <label className="lab-field">Serial number<input className="lab-input" value={f.serial_no} onChange={e => set("serial_no", e.target.value)} /></label>
        <label className="lab-field">Asset tag<input className="lab-input" value={f.asset_tag} onChange={e => set("asset_tag", e.target.value)} /></label>
        <label className="lab-field">Manufacturer<input className="lab-input" value={f.manufacturer} onChange={e => set("manufacturer", e.target.value)} /></label>
        <label className="lab-field">Model<input className="lab-input" value={f.model} onChange={e => set("model", e.target.value)} /></label>
        <label className="lab-field">Purchase date<input className="lab-input" type="date" value={f.purchase_date} onChange={e => set("purchase_date", e.target.value)} /></label>
        <label className="lab-field">Purchase price<input className="lab-input" type="number" min={0} value={f.purchase_price} onChange={e => set("purchase_price", e.target.value)} /></label>
        <label className="lab-field">Supplier<input className="lab-input" list="lab-suppliers" value={f.supplier_name} onChange={e => set("supplier_name", e.target.value)} /></label>
        <label className="lab-field">Warranty until<input className="lab-input" type="date" value={f.warranty_expiry} onChange={e => set("warranty_expiry", e.target.value)} /></label>
        {!item && <label className="lab-field">Condition<select className="lab-input" value={f.condition} onChange={e => set("condition", e.target.value)}>
          {["excellent", "good", "fair", "damaged"].map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label>}
        <label className="lab-field wide">Remarks<textarea className="lab-input" rows={2} value={f.remarks} onChange={e => set("remarks", e.target.value)} /></label>
      </div>
      <datalist id="lab-suppliers">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
      <Note n={note} />
      <div><button type="button" className="lab-btn primary" onClick={save}>{item ? "Save" : "Register"}</button></div>
    </Panel>
  );
}

function EquipmentDetails({ id, labs, onClose, onChanged, onEdit }) {
  const { can } = useAuth();
  const [d, setD] = useState(null);
  const [note, setNote] = useState(null);
  const [act, setAct] = useState(null);       // {action, quantity, to_lab_id, condition, notes}
  const load = useCallback(() => labApi.equipmentItem(id).then(r => setD(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async () => {
    try { const r = await labApi.equipmentAction(id, { ...act, quantity: act.quantity ? Number(act.quantity) : null, to_lab_id: act.to_lab_id ? Number(act.to_lab_id) : null });
          setNote({ type: "ok", msg: r.data.message }); setAct(null); load(); onChanged(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const manage = can("laboratory.equipment_management") || can("laboratory.lab_management");
  const actions = d ? [
    can("laboratory.equipment_transfer") && ["transfer", "Transfer to another lab"],
    manage && ["damaged", "Report damage"], manage && ["maintenance_out", "Send for maintenance"], manage && ["maintenance_in", "Back in service"],
    manage && d.tracking === "quantity" && ["add_units", "Add units"], manage && ["condition", "Change condition"],
    can("laboratory.equipment_retire") && ["lost", "Mark lost"], can("laboratory.equipment_retire") && ["retire", "Retire"],
  ].filter(Boolean) : [];
  const needsQty = act && d && d.tracking === "quantity" && ["damaged", "maintenance_out", "maintenance_in", "lost", "retire", "add_units"].includes(act.action);
  return (
    <Panel title={d ? `${d.name} (${d.code})` : "Equipment"} onClose={onClose}
           right={d && manage && !["retired", "lost"].includes(d.status) && <button type="button" className="lab-btn sm" onClick={() => onEdit(d)}>Edit</button>}>
      <Note n={note} />
      {d && (
        <>
          <div><span className={"lab-badge " + (EQ_CLASS[d.status] || "")}>{EQ_STATUS[d.status]}</span> <span className="lab-muted">· {d.condition} · {d.lab_name}</span></div>
          <div className="lab-kpis">
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{d.quantity}</b><span>Total</span></div>
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{d.available_quantity}</b><span>Available</span></div>
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{d.issued_quantity}</b><span>Issued</span></div>
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{d.damaged_quantity}</b><span>Out of service</span></div>
          </div>
          <dl className="lab-kv">
            <dt>Category</dt><dd>{d.category || "-"}</dd><dt>Tracking</dt><dd>{d.tracking === "individual" ? "Individual item" : "By quantity"}</dd>
            <dt>Serial / asset tag</dt><dd>{[d.serial_no, d.asset_tag].filter(Boolean).join(" / ") || "-"}</dd>
            <dt>Make / model</dt><dd>{[d.manufacturer, d.model].filter(Boolean).join(" ") || "-"}</dd>
            <dt>Purchased</dt><dd>{[day(d.purchase_date), d.purchase_price && `Rs ${num(d.purchase_price)}`, d.supplier_name].filter(Boolean).join(" · ") || "-"}</dd>
            <dt>Warranty until</dt><dd>{day(d.warranty_expiry) || "-"}</dd><dt>Remarks</dt><dd>{d.remarks || "-"}</dd>
          </dl>
          {actions.length > 0 && !["retired", "lost"].includes(d.status) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {actions.map(([a, l]) => <button key={a} type="button" className={"lab-btn sm" + (["lost", "retire"].includes(a) ? " danger" : "")} onClick={() => setAct({ action: a, notes: "" })}>{l}</button>)}
            </div>
          )}
          {act && (
            <div className="lab-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b>{actions.find(x => x[0] === act.action)?.[1]}</b>
              {act.action === "transfer" && <label className="lab-field">To lab<select className="lab-input" value={act.to_lab_id || ""} onChange={e => setAct({ ...act, to_lab_id: e.target.value })}>
                <option value="">Choose...</option>{labs.filter(l => l.id !== d.lab_id && l.status !== "inactive").map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
              {needsQty && <label className="lab-field">Quantity<input className="lab-input" type="number" min={1} value={act.quantity || ""} onChange={e => setAct({ ...act, quantity: e.target.value })} /></label>}
              {["condition", "maintenance_in"].includes(act.action) && <label className="lab-field">Condition<select className="lab-input" value={act.condition || ""} onChange={e => setAct({ ...act, condition: e.target.value })}>
                <option value="">Choose...</option>{["excellent", "good", "fair", ...(act.action === "condition" ? ["damaged"] : [])].map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
              <label className="lab-field">{["lost", "retire"].includes(act.action) ? "Reason *" : "Notes"}<input className="lab-input" value={act.notes} onChange={e => setAct({ ...act, notes: e.target.value })} /></label>
              <div style={{ display: "flex", gap: 8 }}><button type="button" className="lab-btn sm primary" onClick={run}>Confirm</button><button type="button" className="lab-btn sm" onClick={() => setAct(null)}>Cancel</button></div>
            </div>
          )}
          {d.open_issues.length > 0 && <div><b>Currently issued on</b>{d.open_issues.map(i => <div key={i.id} className="lab-muted">{i.number} · {i.qty_issued - i.qty_returned - i.qty_damaged - i.qty_lost} out · due {day(i.expected_return_date)}</div>)}</div>}
          <div><b>History</b>
            <div className="lab-scroll"><table className="lab-table" style={{ marginTop: 6 }}>
              <thead><tr><th>When</th><th>What</th><th>Qty</th><th>Details</th><th>By</th></tr></thead>
              <tbody>{d.movements.map(m => (
                <tr key={m.id} style={{ cursor: "default" }}><td>{day(m.created_at)}</td><td>{MOVE_LABEL[m.kind] || m.kind}</td><td>{m.quantity ?? "-"}</td>
                  <td>{[m.from_lab && m.to_lab ? `${m.from_lab} → ${m.to_lab}` : null, m.issue_number, m.condition, m.notes].filter(Boolean).join(" · ") || "-"}</td><td>{m.by_name || "-"}</td></tr>
              ))}</tbody></table></div>
          </div>
        </>
      )}
    </Panel>
  );
}

export function EquipmentPage() {
  const { can } = useAuth();
  const { labs, meta } = useLabs();
  const [params] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({ q: "", lab_id: params.get("lab_id") || "", category_id: "", status: params.get("status") || "", condition: "" });
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState(null);
  const load = useCallback(() => labApi.equipment(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).then(r => setRows(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [f]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { labApi.suppliers().then(r => setSuppliers(r.data.data || [])).catch(() => {}); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const canAdd = can("laboratory.equipment_management") || can("laboratory.lab_management");
  return (
    <div className="lab">
      <div className="lab-head"><div><h1>Equipment Register</h1><div className="lab-sub">Every piece of lab equipment, where it is, and everything that happened to it.</div></div>
        {canAdd && <button type="button" className="lab-btn primary" onClick={() => setForm({})}>Register equipment</button>}</div>
      <div className="lab-filters" role="search">
        <input className="lab-input" style={{ flex: "1 1 220px" }} placeholder="Search name, code, serial or asset tag" value={f.q} onChange={e => set("q", e.target.value)} />
        <select className="lab-input" value={f.lab_id} onChange={e => set("lab_id", e.target.value)}><option value="">All labs</option>{labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className="lab-input" value={f.category_id} onChange={e => set("category_id", e.target.value)}><option value="">All categories</option>{(meta?.lookups.equipment_category || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="lab-input" value={f.status} onChange={e => set("status", e.target.value)}><option value="">All statuses</option>{Object.entries(EQ_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="lab-input" value={f.condition} onChange={e => set("condition", e.target.value)}><option value="">Any condition</option>{["excellent", "good", "fair", "damaged"].map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      <Note n={note} />
      <div className="lab-card" style={{ padding: 0 }}><div className="lab-scroll">
        <table className="lab-table">
          <thead><tr><th>Equipment</th><th>Lab</th><th>Category</th><th>Available</th><th>Condition</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="lab-muted">Loading...</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="lab-muted">No equipment found.</td></tr>}
            {(rows || []).map(e => (
              <tr key={e.id} onClick={() => setOpen(e.id)} tabIndex={0} onKeyDown={k => k.key === "Enter" && setOpen(e.id)}>
                <td><b>{e.name}</b><div className="lab-muted">{e.code}{e.serial_no ? ` · SN ${e.serial_no}` : ""}</div></td>
                <td>{e.lab_name}</td><td>{e.category || "-"}</td><td>{e.available_quantity} of {e.quantity}</td><td>{e.condition}</td>
                <td><span className={"lab-badge " + (EQ_CLASS[e.status] || "")}>{EQ_STATUS[e.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      {open && <EquipmentDetails id={open} labs={labs} onClose={() => setOpen(null)} onChanged={load} onEdit={item => { setOpen(null); setForm({ item }); }} />}
      {form && <EquipmentForm item={form.item} labs={labs} meta={meta} suppliers={suppliers} onClose={() => setForm(null)} onSaved={m => { setForm(null); setNote({ type: "ok", msg: m }); load(); }} />}
    </div>
  );
}

/* ================================================================== ISSUE & RETURN */
function NewIssue({ labs, onClose, onSaved }) {
  const [labId, setLabId] = useState("");
  const [avail, setAvail] = useState([]);
  const [lines, setLines] = useState([]);
  const [f, setF] = useState({ expected_return_date: "", purpose: "", issued_to_name: "" });
  const [note, setNote] = useState(null);
  useEffect(() => { if (labId) labApi.equipment({ lab_id: labId, available: true, limit: 200 }).then(r => setAvail(r.data.data || [])).catch(() => {}); setLines([]); }, [labId]);
  const add = id => { if (id && !lines.some(l => l.equipment_id === Number(id))) setLines([...lines, { equipment_id: Number(id), quantity: 1 }]); };
  const save = async () => {
    try { const r = await labApi.requestIssue({ lab_id: Number(labId), ...f, items: lines }); onSaved(r.data.message); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <Panel title="Request equipment" onClose={onClose}>
      <div className="lab-form">
        <label className="lab-field">Lab *<select className="lab-input" value={labId} onChange={e => setLabId(e.target.value)}><option value="">Choose...</option>
          {labs.filter(l => l.status !== "inactive").map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="lab-field">Return by *<input className="lab-input" type="date" value={f.expected_return_date} onChange={e => setF({ ...f, expected_return_date: e.target.value })} /></label>
        <label className="lab-field">For (person / class)<input className="lab-input" value={f.issued_to_name} onChange={e => setF({ ...f, issued_to_name: e.target.value })} /></label>
        <label className="lab-field">Purpose<input className="lab-input" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Grade 9 pendulum practical" /></label>
      </div>
      {labId && <label className="lab-field">Add equipment<select className="lab-input" value="" onChange={e => add(e.target.value)}><option value="">Choose an item...</option>
        {avail.filter(a => !lines.some(l => l.equipment_id === a.id)).map(a => <option key={a.id} value={a.id}>{a.name} ({a.code}) - {a.available_quantity} available</option>)}</select></label>}
      {lines.map((l, i) => { const a = avail.find(x => x.id === l.equipment_id) || {}; return (
        <div key={l.equipment_id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{a.name} <span className="lab-muted">({a.available_quantity} available)</span></span>
          <input className="lab-input" style={{ width: 80 }} type="number" min={1} max={a.available_quantity} value={l.quantity} disabled={a.tracking === "individual"}
                 onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} aria-label={`${a.name} quantity`} />
          <button type="button" className="lab-btn sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
        </div>); })}
      <Note n={note} />
      <div><button type="button" className="lab-btn primary" disabled={!labId || !lines.length || !f.expected_return_date} onClick={save}>Send request</button></div>
    </Panel>
  );
}

function IssueDetails({ id, onClose, onChanged }) {
  const { can, user } = useAuth();
  const [d, setD] = useState(null);
  const [note, setNote] = useState(null);
  const [mode, setMode] = useState(null);      // issue | return
  const [q, setQ] = useState({});
  const load = useCallback(() => labApi.issue(id).then(r => setD(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  const go = async fn => { try { const r = await fn(); setNote({ type: "ok", msg: r.data.message }); setMode(null); load(); onChanged(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); } };
  const canIssue = can("laboratory.equipment_issue_return") || can("laboratory.lab_management");
  const out = it => it.qty_issued - it.qty_returned - it.qty_damaged - it.qty_lost;
  return (
    <Panel title={d ? `${d.number} · ${d.lab_name}` : "Request"} onClose={onClose}>
      <Note n={note} />
      {d && (
        <>
          <div><span className="lab-badge s-under_maintenance">{ISSUE_STATUS[d.status]}</span>{d.overdue && <span className="lab-badge" style={{ background: "#FEE2E2", color: "#991B1B", marginLeft: 6 }}>Overdue</span>}</div>
          <dl className="lab-kv">
            <dt>Requested by</dt><dd>{d.requested_by_name} · {day(d.request_date)}</dd><dt>For</dt><dd>{d.issued_to_name || "-"}</dd>
            <dt>Purpose</dt><dd>{d.purpose || "-"}</dd><dt>Return by</dt><dd>{day(d.expected_return_date)}</dd>{d.decision_note && <><dt>Note</dt><dd>{d.decision_note}</dd></>}
          </dl>
          <table className="lab-table">
            <thead><tr><th>Item</th><th>Asked</th><th>Issued</th><th>Back</th><th>Damaged</th><th>Lost</th>{mode && <th>{mode === "issue" ? "Issue now" : "Receiving"}</th>}</tr></thead>
            <tbody>{d.items.map(it => (
              <tr key={it.id} style={{ cursor: "default" }}>
                <td><b>{it.name}</b><div className="lab-muted">{it.code}</div></td><td>{it.qty_requested}</td><td>{it.qty_issued}</td><td>{it.qty_returned}</td><td>{it.qty_damaged}</td><td>{it.qty_lost}</td>
                {mode === "issue" && <td><input className="lab-input" style={{ width: 70 }} type="number" min={0} max={it.qty_requested} value={q[it.id]?.quantity ?? it.qty_requested}
                                                onChange={e => setQ({ ...q, [it.id]: { quantity: Number(e.target.value) } })} /></td>}
                {mode === "return" && <td style={{ whiteSpace: "nowrap" }}>{out(it) === 0 ? <span className="lab-muted">all back</span> : ["returned", "damaged", "lost"].map(k => (
                  <input key={k} className="lab-input" style={{ width: 62, marginRight: 4 }} type="number" min={0} placeholder={k} title={k} aria-label={`${it.name} ${k}`}
                         value={q[it.id]?.[k] ?? (k === "returned" ? out(it) : 0)} onChange={e => setQ({ ...q, [it.id]: { ...(q[it.id] || {}), [k]: Number(e.target.value) } })} />))}</td>}
              </tr>
            ))}</tbody>
          </table>
          {mode === "return" && <div className="lab-muted">Enter how many came back in good order, damaged, or are missing. Anything not entered stays out.</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canIssue && d.status === "requested" && !mode && <button type="button" className="lab-btn sm primary" onClick={() => go(() => labApi.approveIssue(id, ""))}>Approve</button>}
            {canIssue && ["requested", "approved"].includes(d.status) && !mode && <button type="button" className="lab-btn sm" onClick={() => setMode("issue")}>Issue</button>}
            {canIssue && ["requested", "approved"].includes(d.status) && !mode && <button type="button" className="lab-btn sm danger" onClick={() => { const n = window.prompt("Why is it rejected?"); if (n) go(() => labApi.rejectIssue(id, n)); }}>Reject</button>}
            {canIssue && ["issued", "partially_returned"].includes(d.status) && !mode && <button type="button" className="lab-btn sm primary" onClick={() => setMode("return")}>Receive back</button>}
            {["requested", "approved"].includes(d.status) && !mode && (canIssue || d.requested_by === user?.id) && <button type="button" className="lab-btn sm" onClick={() => go(() => labApi.cancelIssue(id))}>Cancel request</button>}
            {mode === "issue" && <><button type="button" className="lab-btn sm primary" onClick={() => go(() => labApi.handOver(id, d.items.map(it => ({ item_id: it.id, quantity: q[it.id]?.quantity ?? it.qty_requested }))))}>Confirm issue</button>
              <button type="button" className="lab-btn sm" onClick={() => setMode(null)}>Back</button></>}
            {mode === "return" && <><button type="button" className="lab-btn sm primary" onClick={() => go(() => labApi.receiveBack(id, d.items.filter(it => out(it) > 0).map(it => ({ item_id: it.id,
                returned: q[it.id]?.returned ?? out(it), damaged: q[it.id]?.damaged ?? 0, lost: q[it.id]?.lost ?? 0 })), ""))}>Confirm return</button>
              <button type="button" className="lab-btn sm" onClick={() => setMode(null)}>Back</button></>}
          </div>
        </>
      )}
    </Panel>
  );
}

export function IssuesPage() {
  const { can } = useAuth();
  const { labs } = useLabs();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("overdue") ? "overdue" : "open");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(false);
  const [note, setNote] = useState(null);
  const TABS = [["open", "Open"], ["requested", "To approve"], ["out", "Out"], ["overdue", "Overdue"], ["closed", "Closed"], ["mine", "My requests"]];
  const load = useCallback(() => {
    const p = { requested: { status: "requested" }, overdue: { overdue: true }, mine: { mine: true } }[tab] || {};
    labApi.issues(p).then(r => {
      let d = r.data.data || [];
      if (tab === "open") d = d.filter(x => ["requested", "approved", "issued", "partially_returned"].includes(x.status));
      if (tab === "out") d = d.filter(x => ["issued", "partially_returned"].includes(x.status));
      if (tab === "closed") d = d.filter(x => ["returned", "rejected", "cancelled"].includes(x.status));
      setRows(d);
    }).catch(e => setNote({ type: "err", msg: errMsg(e) }));
  }, [tab]);
  useEffect(() => { setRows(null); load(); }, [load]);
  return (
    <div className="lab">
      <div className="lab-head"><div><h1>Equipment Issue &amp; Return</h1><div className="lab-sub">Request equipment for a practical; the lab supervisor approves, issues and receives it back.</div></div>
        {(can("laboratory.equipment_issue_request") || can("laboratory.equipment_issue_return") || can("laboratory.lab_management")) &&
          <button type="button" className="lab-btn primary" onClick={() => setForm(true)}>Request equipment</button>}</div>
      <div className="lab-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={"lab-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}</div>
      <Note n={note} />
      <div className="lab-card" style={{ padding: 0 }}><div className="lab-scroll">
        <table className="lab-table">
          <thead><tr><th>Request</th><th>Lab</th><th>Requested by</th><th>Return by</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="lab-muted">Loading...</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={5} className="lab-muted">Nothing here.</td></tr>}
            {(rows || []).map(i => (
              <tr key={i.id} onClick={() => setOpen(i.id)} tabIndex={0} onKeyDown={k => k.key === "Enter" && setOpen(i.id)}>
                <td><b>{i.number}</b><div className="lab-muted">{i.purpose || ""}</div></td><td>{i.lab_name}</td><td>{i.requested_by_name}</td>
                <td>{day(i.expected_return_date)}{i.overdue && <span className="lab-badge" style={{ background: "#FEE2E2", color: "#991B1B", marginLeft: 6 }}>Overdue</span>}</td>
                <td><span className="lab-badge s-under_maintenance">{ISSUE_STATUS[i.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      {open && <IssueDetails id={open} onClose={() => setOpen(null)} onChanged={load} />}
      {form && <NewIssue labs={labs} onClose={() => setForm(false)} onSaved={m => { setForm(false); setNote({ type: "ok", msg: m }); setTab("mine"); load(); }} />}
    </div>
  );
}

/* ================================================================== CONSUMABLES & STOCK */
const EMPTY_C = { lab_id: "", category_id: "", unit_id: "", name: "", code: "", min_stock: 0, max_stock: "", unit_price: "", supplier_name: "", storage_location: "", description: "", batch_tracked: false, status: "active", procurement_item_id: "" };

function ProcurementPicker({ value, label, onChange }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState([]);
  useEffect(() => { if (q.length < 2) { setOpts([]); return; } const t = setTimeout(() => labApi.procurementItems(q).then(r => setOpts(r.data.data || [])).catch(() => {}), 250); return () => clearTimeout(t); }, [q]);
  return (
    <div className="lab-field wide">Procurement item <span style={{ fontWeight: 400 }}>- goods received for it in Procurement can be put straight into this item's stock</span>
      {value ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="lab-badge s-active">{label || `#${value}`}</span>
        <button type="button" className="lab-btn sm" onClick={() => onChange("", "")}>Unlink</button></div> : <>
        <input className="lab-input" placeholder="Search Procurement items (name or code)" value={q} onChange={e => setQ(e.target.value)} />
        {opts.map(o => <button key={o.id} type="button" className="lab-btn sm" style={{ alignSelf: "flex-start" }} onClick={() => { onChange(o.id, `${o.item_name} (${o.item_code})`); setQ(""); }}>{o.item_name} ({o.item_code})</button>)}</>}
    </div>
  );
}

function ConsumableForm({ item, labs, meta, suppliers, onClose, onSaved }) {
  const [f, setF] = useState(item ? { ...EMPTY_C, ...Object.fromEntries(Object.entries(item).filter(([k]) => k in EMPTY_C).map(([k, v]) => [k, v ?? ""])) } : EMPTY_C);
  const [procLabel, setProcLabel] = useState(item?.procurement_item || "");
  const [note, setNote] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...f, lab_id: Number(f.lab_id), category_id: f.category_id ? Number(f.category_id) : null, unit_id: f.unit_id ? Number(f.unit_id) : null,
                   procurement_item_id: f.procurement_item_id ? Number(f.procurement_item_id) : null,
                   min_stock: Number(f.min_stock) || 0, max_stock: f.max_stock === "" ? null : Number(f.max_stock), unit_price: f.unit_price === "" ? null : Number(f.unit_price) };
    try { const r = item ? await labApi.editConsumable(item.id, body) : await labApi.addConsumable(body); onSaved(r.data.message); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <Panel title={item ? `Edit ${item.name}` : "Add consumable item"} onClose={onClose}>
      <div className="lab-form">
        <label className="lab-field">Lab *<select className="lab-input" value={f.lab_id} disabled={!!item} onChange={e => set("lab_id", e.target.value)}><option value="">Choose...</option>
          {labs.filter(l => l.status !== "inactive").map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="lab-field">Category<select className="lab-input" value={f.category_id} onChange={e => set("category_id", e.target.value)}><option value="">Choose...</option>
          {(meta?.lookups.consumable_category || []).filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="lab-field">Name *<input className="lab-input" value={f.name} onChange={e => set("name", e.target.value)} /></label>
        <label className="lab-field">Code *<input className="lab-input" value={f.code} onChange={e => set("code", e.target.value.toUpperCase())} /></label>
        <label className="lab-field">Unit<select className="lab-input" value={f.unit_id} onChange={e => set("unit_id", e.target.value)}><option value="">Choose...</option>
          {(meta?.lookups.unit || []).filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="lab-field">Unit price<input className="lab-input" type="number" min={0} value={f.unit_price} onChange={e => set("unit_price", e.target.value)} /></label>
        <label className="lab-field">Minimum stock (low-stock alert)<input className="lab-input" type="number" min={0} value={f.min_stock} onChange={e => set("min_stock", e.target.value)} /></label>
        <label className="lab-field">Maximum stock<input className="lab-input" type="number" min={0} value={f.max_stock} onChange={e => set("max_stock", e.target.value)} /></label>
        <label className="lab-field">Supplier<input className="lab-input" list="lab-suppliers2" value={f.supplier_name} onChange={e => set("supplier_name", e.target.value)} /></label>
        <label className="lab-field">Storage location<input className="lab-input" value={f.storage_location} onChange={e => set("storage_location", e.target.value)} /></label>
        <label className="lab-field wide" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={!!f.batch_tracked} onChange={e => set("batch_tracked", e.target.checked)} />
          Track by batch and expiry date (chemicals, reagents and other expiry-sensitive items)</label>
        {item && <label className="lab-field">Status<select className="lab-input" value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
        <ProcurementPicker value={f.procurement_item_id} label={procLabel} onChange={(id, lbl) => { set("procurement_item_id", id); setProcLabel(lbl); }} />
        <label className="lab-field wide">Description<textarea className="lab-input" rows={2} value={f.description} onChange={e => set("description", e.target.value)} /></label>
      </div>
      <datalist id="lab-suppliers2">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
      <Note n={note} />
      <div><button type="button" className="lab-btn primary" onClick={save}>{item ? "Save" : "Add item"}</button></div>
    </Panel>
  );
}

const STOCK_ACTIONS = [["receive", "Receive", "laboratory.stock_receive"], ["issue", "Issue", "laboratory.stock_issue"], ["consumption", "Record use", "laboratory.stock_issue"],
  ["return", "Return unused", "laboratory.stock_issue"], ["transfer", "Transfer", "laboratory.stock_transfer"], ["adjust", "Stock count", "laboratory.stock_adjust"],
  ["damage", "Damaged", "laboratory.stock_dispose"], ["expiry", "Expired", "laboratory.stock_dispose"], ["disposal", "Dispose", "laboratory.stock_dispose"]];

function ConsumableDetails({ id, labs, suppliers, onClose, onChanged, onEdit }) {
  const { can } = useAuth();
  const [d, setD] = useState(null);
  const [note, setNote] = useState(null);
  const [act, setAct] = useState(null);
  const load = useCallback(() => labApi.consumable(id).then(r => setD(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  const set = (k, v) => setAct(x => ({ ...x, [k]: v }));
  const run = async () => {
    const n = v => v === "" || v === undefined || v === null ? null : Number(v);
    const a = act.action;
    try {
      const r = a === "receive" ? await labApi.stockReceive({ consumable_id: id, quantity: n(act.quantity), unit_cost: n(act.unit_cost), batch_no: act.batch_no, expiry_date: act.expiry_date || null,
                                                               purchase_date: act.purchase_date || null, supplier_name: act.supplier_name, reference: act.reference })
              : a === "transfer" ? await labApi.stockTransfer({ consumable_id: id, to_lab_id: n(act.to_lab_id), quantity: n(act.quantity), batch_id: n(act.batch_id), reason: act.reason })
              : a === "adjust" ? await labApi.stockAdjust({ consumable_id: id, counted_quantity: n(act.quantity), batch_id: n(act.batch_id), reason: act.reason || "" })
              : await labApi.stockOut({ consumable_id: id, quantity: n(act.quantity), kind: a, batch_id: n(act.batch_id), issued_to: act.issued_to, reason: act.reason, reference: act.reference });
      setNote({ type: "ok", msg: r.data.message }); setAct(null); load(); onChanged();
    } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const anyStock = can("laboratory.lab_management");
  const acts = STOCK_ACTIONS.filter(([, , p]) => anyStock || can(p));
  const batchPick = d && d.batch_tracked && act && act.action !== "receive";
  return (
    <Panel title={d ? `${d.name} (${d.code})` : "Item"} onClose={onClose}
           right={d && (anyStock || can("laboratory.stock_receive")) && <button type="button" className="lab-btn sm" onClick={() => onEdit(d)}>Edit</button>}>
      <Note n={note} />
      {d && (
        <>
          <div className="lab-kpis">
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{num(d.current_stock)}</b><span>In stock{d.unit ? ` (${d.unit})` : ""}</span></div>
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{num(d.min_stock)}</b><span>Minimum</span></div>
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{num(d.near_expiry_qty)}</b><span>Near expiry</span></div>
            <div className="lab-kpi" style={{ cursor: "default" }}><b>{num(d.expired_qty)}</b><span>Expired</span></div>
          </div>
          {d.low_stock && <div className="lab-note err">Low stock - at or below the minimum of {num(d.min_stock)}.</div>}
          <div className="lab-muted">{d.lab_name}{d.category ? ` · ${d.category}` : ""}{d.storage_location ? ` · ${d.storage_location}` : ""}{d.batch_tracked ? " · tracked by batch" : ""}</div>
          {acts.length > 0 && d.status === "active" && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {acts.map(([a, l]) => <button key={a} type="button" className={"lab-btn sm" + (["damage", "expiry", "disposal"].includes(a) ? " danger" : a === "receive" ? " primary" : "")} onClick={() => setAct({ action: a })}>{l}</button>)}</div>}
          {act && (
            <div className="lab-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b>{STOCK_ACTIONS.find(x => x[0] === act.action)[1]}</b>
              <div className="lab-form">
                <label className="lab-field">{act.action === "adjust" ? "Counted quantity (what is actually there)" : "Quantity"} *<input className="lab-input" type="number" min={0} value={act.quantity || ""} onChange={e => set("quantity", e.target.value)} /></label>
                {act.action === "receive" && <>
                  <label className="lab-field">Unit cost<input className="lab-input" type="number" min={0} value={act.unit_cost || ""} onChange={e => set("unit_cost", e.target.value)} /></label>
                  {d.batch_tracked && <><label className="lab-field">Batch number *<input className="lab-input" value={act.batch_no || ""} onChange={e => set("batch_no", e.target.value)} /></label>
                    <label className="lab-field">Expiry date<input className="lab-input" type="date" value={act.expiry_date || ""} onChange={e => set("expiry_date", e.target.value)} /></label></>}
                  <label className="lab-field">Supplier<input className="lab-input" list="lab-suppliers3" value={act.supplier_name || ""} onChange={e => set("supplier_name", e.target.value)} /></label>
                  <label className="lab-field">Reference (PO / goods received no.)<input className="lab-input" value={act.reference || ""} onChange={e => set("reference", e.target.value)} /></label></>}
                {batchPick && <label className="lab-field">Batch {["damage", "expiry", "disposal", "adjust", "return"].includes(act.action) ? "*" : "(earliest expiry if left empty)"}
                  <select className="lab-input" value={act.batch_id || ""} onChange={e => set("batch_id", e.target.value)}><option value="">{["damage", "expiry", "disposal", "adjust", "return"].includes(act.action) ? "Choose..." : "Earliest expiry first"}</option>
                    {d.batches.filter(b => act.action === "return" || act.action === "adjust" || b.quantity > 0).map(b => <option key={b.id} value={b.id}>{b.batch_no} - {num(b.quantity)}{b.expiry_date ? ` - exp ${day(b.expiry_date)}` : ""}{b.expired ? " (expired)" : ""}</option>)}</select></label>}
                {act.action === "transfer" && <label className="lab-field">To lab *<select className="lab-input" value={act.to_lab_id || ""} onChange={e => set("to_lab_id", e.target.value)}><option value="">Choose...</option>
                  {labs.filter(l => l.id !== d.lab_id && l.status !== "inactive").map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
                {["issue", "consumption"].includes(act.action) && <label className="lab-field">Issued to / used for<input className="lab-input" value={act.issued_to || ""} onChange={e => set("issued_to", e.target.value)} /></label>}
                {act.action !== "receive" && <label className="lab-field wide">Reason {["adjust", "damage", "expiry", "disposal"].includes(act.action) ? "*" : ""}<input className="lab-input" value={act.reason || ""} onChange={e => set("reason", e.target.value)} /></label>}
              </div>
              <datalist id="lab-suppliers3">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
              <div style={{ display: "flex", gap: 8 }}><button type="button" className="lab-btn sm primary" onClick={run}>Confirm</button><button type="button" className="lab-btn sm" onClick={() => setAct(null)}>Cancel</button></div>
            </div>
          )}
          {d.batch_tracked && <div><b>Batches</b><table className="lab-table" style={{ marginTop: 6 }}>
            <thead><tr><th>Batch</th><th>Quantity</th><th>Expiry</th><th>Cost</th></tr></thead>
            <tbody>{d.batches.length === 0 ? <tr><td colSpan={4} className="lab-muted">No batches yet.</td></tr> : d.batches.map(b => (
              <tr key={b.id} style={{ cursor: "default" }}><td>{b.batch_no}</td><td>{num(b.quantity)}</td>
                <td>{day(b.expiry_date) || "-"}{b.expired && b.quantity > 0 && <span className="lab-badge" style={{ background: "#FEE2E2", color: "#991B1B", marginLeft: 6 }}>Expired</span>}</td><td>{b.unit_cost != null ? num(b.unit_cost) : "-"}</td></tr>))}</tbody></table></div>}
          <div><b>Ledger</b><div className="lab-scroll"><table className="lab-table" style={{ marginTop: 6 }}>
            <thead><tr><th>No.</th><th>When</th><th>Type</th><th>Change</th><th>Before → after</th><th>Details</th></tr></thead>
            <tbody>{d.ledger.map(t => (
              <tr key={t.id} style={{ cursor: "default" }}><td>{t.number}</td><td>{day(t.created_at)}</td><td>{KIND_LABEL[t.kind] || t.kind}</td>
                <td style={{ color: t.change < 0 ? "#B91C1C" : "#15803D", fontWeight: 600 }}>{t.change > 0 ? "+" : ""}{num(t.change)}</td><td>{num(t.previous_qty)} → {num(t.resulting_qty)}</td>
                <td>{[t.batch_no && `Batch ${t.batch_no}`, t.issued_to, t.reference, t.reason, t.by_name].filter(Boolean).join(" · ")}</td></tr>))}</tbody></table></div></div>
        </>
      )}
    </Panel>
  );
}

export function ConsumablesPage() {
  const { can } = useAuth();
  const { labs, meta } = useLabs();
  const [params] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({ q: "", lab_id: "", category_id: "", flag: params.get("flag") || "" });
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState(null);
  const load = useCallback(() => labApi.consumables(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).then(r => setRows(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [f]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { labApi.suppliers().then(r => setSuppliers(r.data.data || [])).catch(() => {}); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <div className="lab">
      <div className="lab-head"><div><h1>Consumables &amp; Stock</h1><div className="lab-sub">Chemicals, reagents and supplies in each lab. Every change goes through the stock ledger.</div></div>
        {(can("laboratory.stock_receive") || can("laboratory.lab_management")) && <button type="button" className="lab-btn primary" onClick={() => setForm({})}>Add item</button>}</div>
      <div className="lab-filters" role="search">
        <input className="lab-input" style={{ flex: "1 1 220px" }} placeholder="Search name or code" value={f.q} onChange={e => set("q", e.target.value)} />
        <select className="lab-input" value={f.lab_id} onChange={e => set("lab_id", e.target.value)}><option value="">All labs</option>{labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className="lab-input" value={f.category_id} onChange={e => set("category_id", e.target.value)}><option value="">All categories</option>{(meta?.lookups.consumable_category || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="lab-input" value={f.flag} onChange={e => set("flag", e.target.value)}><option value="">All items</option><option value="low">Low stock</option><option value="near_expiry">Near expiry</option><option value="expired">Has expired stock</option></select>
      </div>
      <Note n={note} />
      {(can("laboratory.stock_receive") || can("laboratory.lab_management") || can("laboratory.stock_view")) && <GrnPending onReceived={load} />}
      <div className="lab-card" style={{ padding: 0 }}><div className="lab-scroll">
        <table className="lab-table">
          <thead><tr><th>Item</th><th>Lab</th><th>In stock</th><th>Minimum</th><th>Next expiry</th><th>Alerts</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="lab-muted">Loading...</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="lab-muted">No items found.</td></tr>}
            {(rows || []).map(c => (
              <tr key={c.id} onClick={() => setOpen(c.id)} tabIndex={0} onKeyDown={k => k.key === "Enter" && setOpen(c.id)}>
                <td><b>{c.name}</b><div className="lab-muted">{c.code}{c.category ? ` · ${c.category}` : ""}</div></td><td>{c.lab_name}</td>
                <td>{num(c.current_stock)} {c.unit || ""}</td><td>{num(c.min_stock)}</td><td>{day(c.next_expiry) || "-"}</td>
                <td>{c.low_stock && <span className="lab-badge s-under_maintenance">Low</span>} {c.expired_qty > 0 && <span className="lab-badge" style={{ background: "#FEE2E2", color: "#991B1B" }}>Expired</span>} {c.near_expiry_qty > 0 && <span className="lab-badge s-inactive">Near expiry</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      {open && <ConsumableDetails id={open} labs={labs} suppliers={suppliers} onClose={() => setOpen(null)} onChanged={load} onEdit={item => { setOpen(null); setForm({ item }); }} />}
      {form && <ConsumableForm item={form.item} labs={labs} meta={meta} suppliers={suppliers} onClose={() => setForm(null)} onSaved={m => { setForm(null); setNote({ type: "ok", msg: m }); load(); }} />}
    </div>
  );
}

/* goods received in Procurement (confirmed GRNs) for linked lab items, waiting to go into lab stock */
function GrnPending({ onReceived }) {
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState({});
  const [note, setNote] = useState(null);
  const load = useCallback(() => labApi.grnPending().then(r => setRows(r.data.data || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  if (!rows || rows.length === 0) return null;
  const receive = async line => {
    const p = pick[line.grn_item_id] || {};
    const targets = line.targets.filter(t => t.can_receive);
    const target = targets.find(t => String(t.consumable_id) === String(p.consumable_id)) || (targets.length === 1 ? targets[0] : null);
    if (!target) { setNote({ type: "err", msg: "Choose which lab item it goes into." }); return; }
    try { const r = await labApi.grnReceive(line.grn_item_id, { consumable_id: target.consumable_id, batch_no: p.batch_no, expiry_date: p.expiry_date || null });
          setNote({ type: "ok", msg: r.data.message }); load(); onReceived(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="lab-card" style={{ display: "flex", flexDirection: "column", gap: 10, borderColor: "var(--l-acc)" }}>
      <b>Goods received from Procurement ({rows.length})</b>
      <div className="lab-muted">Confirmed goods-received notes for items linked to lab stock. Receive each line into the right lab - it can only be received once.</div>
      <Note n={note} />
      {rows.map(line => {
        const targets = line.targets.filter(t => t.can_receive);
        const p = pick[line.grn_item_id] || {};
        const chosen = targets.find(t => String(t.consumable_id) === String(p.consumable_id)) || (targets.length === 1 ? targets[0] : null);
        const setP = (k, v) => setPick(x => ({ ...x, [line.grn_item_id]: { ...(x[line.grn_item_id] || {}), [k]: v } }));
        return (
          <div key={line.grn_item_id} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--l-line)", paddingTop: 10 }}>
            <div style={{ flex: "1 1 220px" }}><b>{line.item_description}</b> - {num(line.quantity_received)} {line.unit || ""}
              <div className="lab-muted">{line.grn_number} · {line.po_number} · {day(line.received_date)}{line.unit_price != null ? ` · Rs ${num(line.unit_price)} each` : ""}</div></div>
            {targets.length === 0 ? <span className="lab-muted">For {line.targets.map(t => t.lab_name).join(", ")} - waiting for that lab's supervisor.</span> : <>
              {targets.length > 1 && <label className="lab-field">Into<select className="lab-input" value={p.consumable_id || ""} onChange={e => setP("consumable_id", e.target.value)}>
                <option value="">Choose lab item...</option>{targets.map(t => <option key={t.consumable_id} value={t.consumable_id}>{t.name} - {t.lab_name}</option>)}</select></label>}
              {targets.length === 1 && <span className="lab-muted">Into {targets[0].name} - {targets[0].lab_name}</span>}
              {chosen?.batch_tracked && <><label className="lab-field">Batch *<input className="lab-input" style={{ width: 120 }} value={p.batch_no || ""} onChange={e => setP("batch_no", e.target.value)} /></label>
                <label className="lab-field">Expiry<input className="lab-input" type="date" value={p.expiry_date || ""} onChange={e => setP("expiry_date", e.target.value)} /></label></>}
              <button type="button" className="lab-btn sm primary" onClick={() => receive(line)}>Receive</button></>}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== STOCK TRANSACTIONS (ledger) */
export function StockLedgerPage() {
  const { can } = useAuth();
  const { labs } = useLabs();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ q: "", lab_id: "", kind: "", date_from: "", date_to: "", page: 1 });
  const [note, setNote] = useState(null);
  const load = useCallback(() => labApi.transactions(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).then(r => { setRows(r.data.data); setTotal(r.data.pagination.total); })
    .catch(e => setNote({ type: "err", msg: errMsg(e) })), [f]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v, page: k === "page" ? v : 1 }));
  const reverse = async t => {
    const reason = window.prompt(`Reverse ${t.number}? This adds an opposite entry (history is never edited). Reason:`);
    if (!reason) return;
    try { const r = await labApi.reverseTxn(t.id, reason); setNote({ type: "ok", msg: r.data.message }); load(); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const canReverse = can("laboratory.stock_adjust") || can("laboratory.lab_management");
  return (
    <div className="lab">
      <div><h1>Stock Transactions</h1><div className="lab-sub">Every stock change, numbered and permanent. Mistakes are corrected with a reversal.</div></div>
      <div className="lab-filters" role="search">
        <input className="lab-input" style={{ flex: "1 1 200px" }} placeholder="Search number, item or reference" value={f.q} onChange={e => set("q", e.target.value)} />
        <select className="lab-input" value={f.lab_id} onChange={e => set("lab_id", e.target.value)}><option value="">All labs</option>{labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className="lab-input" value={f.kind} onChange={e => set("kind", e.target.value)}><option value="">All types</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="lab-input" type="date" value={f.date_from} onChange={e => set("date_from", e.target.value)} aria-label="From" />
        <input className="lab-input" type="date" value={f.date_to} onChange={e => set("date_to", e.target.value)} aria-label="To" />
      </div>
      <Note n={note} />
      <div className="lab-card" style={{ padding: 0 }}><div className="lab-scroll">
        <table className="lab-table">
          <thead><tr><th>No.</th><th>When</th><th>Item</th><th>Lab</th><th>Type</th><th>Change</th><th>Before → after</th><th>Details</th><th /></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={9} className="lab-muted">Loading...</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={9} className="lab-muted">No transactions.</td></tr>}
            {(rows || []).map(t => (
              <tr key={t.id} style={{ cursor: "default" }}>
                <td>{t.number}</td><td>{day(t.created_at)}</td><td>{t.item}<div className="lab-muted">{t.item_code}{t.batch_no ? ` · ${t.batch_no}` : ""}</div></td><td>{t.lab_name}</td>
                <td>{KIND_LABEL[t.kind] || t.kind}{t.reversed && <div className="lab-muted">reversed</div>}</td>
                <td style={{ color: t.change < 0 ? "#B91C1C" : "#15803D", fontWeight: 600 }}>{t.change > 0 ? "+" : ""}{num(t.change)}</td>
                <td>{num(t.previous_qty)} → {num(t.resulting_qty)}</td><td>{[t.issued_to, t.reference, t.reason, t.by_name].filter(Boolean).join(" · ")}</td>
                <td>{canReverse && !t.reversed && t.kind !== "reversal" && t.kind !== "transfer_in" && <button type="button" className="lab-btn sm" onClick={() => reverse(t)}>Reverse</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      {total > 50 && <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button type="button" className="lab-btn sm" disabled={f.page <= 1} onClick={() => set("page", f.page - 1)}>Previous</button>
        <span className="lab-muted">Page {f.page} of {Math.ceil(total / 50)}</span>
        <button type="button" className="lab-btn sm" disabled={f.page >= Math.ceil(total / 50)} onClick={() => set("page", f.page + 1)}>Next</button></div>}
    </div>
  );
}
