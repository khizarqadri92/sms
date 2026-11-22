import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import activityApi from "../api/activityApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useTheme } from "../auth/ThemeContext";
import "./ActivityStream.css";

// same shade as the top bar and the News & Announcements header
function darkenColor(hex, amount = 40) {
  try {
    const h = hex.replace("#", "");
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - amount);
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - amount);
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
  } catch { return "#1e3a5f"; }
}
const WIDGET_TABS = [["", "All"], ["create", "Created"], ["update", "Updated"], ["action", "Approvals"]];

const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const initials = n => (n || "?").split(" ").map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
const AVATAR_COLORS = ["#0E9FB5", "#1E3A5F", "#7C3AED", "#0F766E", "#B45309", "#BE185D", "#2563EB", "#15803D"];
const avatarColor = n => AVATAR_COLORS[[...(n || "?")].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
const TYPES = [["", "All types"], ["create", "Created"], ["update", "Updated"], ["delete", "Deleted"], ["action", "Approvals & actions"]];
const label = k => k.replace(/_/g, " ").replace(/\b(id|cnic|dob)\b/gi, m => m.toUpperCase()).replace(/^./, c => c.toUpperCase());
const short = v => { const s = v === null || v === undefined || v === "" ? "(empty)" : typeof v === "object" ? JSON.stringify(v) : String(v); return s.length > 60 ? s.slice(0, 57) + "..." : s; };
const show = v => v === null || v === undefined || v === "" ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v);

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return null;
}
function dayLabel(iso, formatDateTime) {
  const d = new Date(iso), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return formatDateTime(iso).split(",")[0];
}

/* type icon (like Jira's issue-type icon) */
const ICON = {
  create: { c: "#16A34A", p: <path d="M12 5v14M5 12h14" /> },
  update: { c: "#2563EB", p: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /> },
  delete: { c: "#DC2626", p: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /> },
  action: { c: "#7C3AED", p: <path d="m5 12 5 5L20 7" /> },
};
const TypeIcon = ({ type }) => {
  const i = ICON[type] || ICON.action;
  return <span className="as-type" style={{ borderColor: i.c, color: i.c }} aria-hidden="true">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{i.p}</svg></span>;
};

/* "record fee payment" -> "recorded fee payment" */
const IRREGULAR = { send: "sent", pay: "paid", make: "made", set: "set", reset: "reset", get: "got", give: "gave", take: "took", put: "put",
  run: "ran", begin: "began", write: "wrote", submit: "submitted", admit: "admitted", commit: "committed", transfer: "transferred",
  cancel: "cancelled", enrol: "enrolled", stop: "stopped", plan: "planned", log: "logged", tag: "tagged", map: "mapped", ship: "shipped" };
function past(phrase) {
  const [w, ...rest] = phrase.split(" ");
  const lw = w.toLowerCase();
  let p = IRREGULAR[lw];
  if (!p) p = lw.endsWith("ed") ? lw : lw.endsWith("e") ? lw + "d" : /[^aeiou]y$/.test(lw) ? lw.slice(0, -1) + "ied" : lw + "ed";
  return [p, ...rest].join(" ");
}
const money = v => typeof v === "number" ? v.toLocaleString() : v;

/* the sentence: "Ahmed Khan changed the Phone of student Ali Ahmed to '0300-…'" */
function Sentence({ a, onPerson, onEntity }) {
  const who = <button type="button" className="as-name" onClick={() => onPerson(a)}>{a.user_name || "Someone"}</button>;
  const ent = a.entity_name || (a.entity_id && a.entity_type ? `#${a.entity_id}` : null);     // a bare number means nothing to a reader
  const entity = ent ? <>{a.entity_type ? <span className="as-etype">{a.entity_type} </span> : null}
    <button type="button" className="as-link" onClick={() => onEntity(a)}>{ent}</button></> : null;
  const changed = a.new_values && a.old_values ? Object.keys(a.new_values) : [];
  if (a.activity_type === "update" && changed.length === 1) {
    const k = changed[0];
    return <>{who} changed the {label(k)} of {entity || <span className="as-etype">a record</span>} to '<b>{short(a.new_values[k])}</b>'</>;
  }
  if (a.activity_type === "update" && changed.length > 1) {
    const ks = changed.slice(0, 3).map(label).join(", ") + (changed.length > 3 ? ` and ${changed.length - 3} more` : "");
    return <>{who} updated {ks} of {entity || <span className="as-etype">a record</span>}</>;
  }
  const verb = a.action ? past(a.action) : "made a change";
  const amount = a.new_values && (a.new_values.amount ?? a.new_values.amount_paid ?? a.new_values.paid_amount);
  return <>{who} {verb}{amount !== undefined && amount !== null ? <> of <b>{money(amount)}</b></> : null}{entity ? <> - {entity}</> : null}</>;
}

/* the same sentence as plain text (announcement-style body) */
function sentenceText(a) {
  const who = a.user_name || "Someone";
  const ent = a.entity_name || (a.entity_id && a.entity_type ? `#${a.entity_id}` : null);
  const of = ent ? `${a.entity_type ? a.entity_type + " " : ""}${ent}` : "a record";
  const changed = a.new_values && a.old_values ? Object.keys(a.new_values) : [];
  if (a.activity_type === "update" && changed.length === 1) return `${who} changed the ${label(changed[0])} of ${of} to '${short(a.new_values[changed[0]])}'`;
  if (a.activity_type === "update" && changed.length > 1)
    return `${who} updated ${changed.slice(0, 3).map(label).join(", ")}${changed.length > 3 ? ` and ${changed.length - 3} more` : ""} of ${of}`;
  const amount = a.new_values && (a.new_values.amount ?? a.new_values.amount_paid ?? a.new_values.paid_amount);
  return `${who} ${a.action ? past(a.action) : "made a change"}${amount != null ? ` of ${money(amount)}` : ""}${ent ? ` - ${of}` : ""}`;
}
const KIND = {
  create: { color: "#16a34a", light: "#f0fdf4", label: "Created" },
  update: { color: "#2563eb", light: "#eff6ff", label: "Updated" },
  delete: { color: "#dc2626", light: "#fef2f2", label: "Deleted" },
  action: { color: "#7c3aed", light: "#f5f3ff", label: "Approval" },
};

/* announcement-style list: dot, bold title + coloured label, grey body, meta line with "Details ->" */
export function AnnStyleList({ rows, formatDateTime, onOpen, dark }) {
  return (
    <div className="as-ann-list">
      {rows.map(a => {
        const k = KIND[a.activity_type] || KIND.action;
        const rel = ago(a.created_at);
        const title = a.action ? past(a.action).replace(/^./, ch => ch.toUpperCase()) : "Change";
        return (
          <div key={a.id} className="as-ann-item" role="button" tabIndex={0} onClick={() => onOpen(a.id)}
               onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(a.id))}
               style={{ "--k": k.color, "--k-tint": dark ? k.color + "26" : k.light }}>
            <div className="as-ann-dot-col"><div className="as-ann-dot" style={{ background: k.color }} /><div className="as-ann-dot-line" /></div>
            <div className="as-ann-content">
              <div className="as-ann-title-row">
                <div className="as-ann-title">{title}</div>
                <span className="as-ann-pill" style={{ background: dark ? k.color + "26" : k.light, color: k.color, borderColor: k.color + "30" }}>{k.label}</span>
              </div>
              <div className="as-ann-body">{sentenceText(a)}</div>
              <div className="as-ann-meta">
                <span title={formatDateTime(a.created_at)}>{rel || formatDateTime(a.created_at)}</span>
                {a.user_name && <><span>·</span><span>{a.user_name}</span></>}
                {a.module && <><span>·</span><span>{a.module}</span></>}
                <span className="as-ann-open">Details →</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* one activity's before -> after table */
function Changes({ oldV, newV }) {
  const keys = Array.from(new Set([...Object.keys(oldV || {}), ...Object.keys(newV || {})]));
  if (!keys.length) return <div className="as-muted">No field changes were recorded for this action.</div>;
  const both = oldV && newV;
  return (
    <table className="as-changes">
      <thead><tr><th>Field</th>{both && <th>Before</th>}<th>{both ? "After" : oldV ? "Value" : "Entered"}</th></tr></thead>
      <tbody>{keys.map(k => (
        <tr key={k}><td>{label(k)}</td>{both && <td className="as-old">{show(oldV[k])}</td>}<td className={both ? "as-new" : ""}>{show((newV || oldV)[k])}</td></tr>
      ))}</tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ the stream (shared by the page and the widget) */
export function StreamList({ rows, compact, fresh = [], formatDateTime, onPerson, onDetails, showDept }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState({});
  const onEntity = a => {
    const to = { student: `/students/${a.entity_id}`, "admission application": `/admissions/applications/${a.entity_id}` }[a.entity_type];
    if (to && a.entity_id && a.activity_type !== "delete") navigate(to); else onDetails(a.id);
  };
  // group: same day, then consecutive activities by the same person under one avatar
  const days = [];
  for (const a of rows) {
    const day = dayLabel(a.created_at, formatDateTime);
    let d = days[days.length - 1];
    if (!d || d.day !== day) { d = { day, groups: [] }; days.push(d); }
    const g = d.groups[d.groups.length - 1];
    if (!compact && g && g.user_id === a.user_id) g.items.push(a);
    else d.groups.push({ user_id: a.user_id, name: a.user_name, role: a.user_role, dept: a.department_name, items: [a] });
  }
  return (
    <div className={"as-stream" + (compact ? " compact" : "")}>
      {days.map(d => (
        <section key={d.day}>
          <div className="as-day">{d.day}</div>
          {d.groups.map((g, gi) => (
            <div key={gi} className="as-group">
              {!compact && <span className="as-avatar" style={{ background: avatarColor(g.name) }}
                                 title={[g.name, g.role, showDept ? g.dept : null].filter(Boolean).join(" · ")}>{initials(g.name)}</span>}
              <div className="as-items">
                {g.items.map(a => {
                  const rel = ago(a.created_at);
                  return (
                    <div key={a.id} className={"as-item" + (fresh.includes(a.id) ? " fresh" : "")}>
                      {compact && <span className="as-avatar as-avatar--sm" style={{ background: avatarColor(a.user_name) }}>{initials(a.user_name)}</span>}
                      <div className="as-body">
                        <div className="as-text"><Sentence a={a} onPerson={onPerson} onEntity={onEntity} /></div>
                        <div className="as-meta">
                          <TypeIcon type={a.activity_type} />
                          <span title={formatDateTime(a.created_at)}>{rel || formatDateTime(a.created_at)}</span>
                          {!compact && <span className="as-module">{a.module}</span>}
                          {!compact && showDept && a.department_name && a.department_name !== a.module && <span className="as-module">{a.department_name}</span>}
                          <button type="button" className="as-act" onClick={() => setOpen(o => ({ ...o, [a.id]: !o[a.id] }))}>{open[a.id] ? "Hide changes" : "Changes"}</button>
                          <button type="button" className="as-act" onClick={() => onDetails(a.id)}>Details</button>
                          {!compact && a.user_id && <button type="button" className="as-act as-more-by" onClick={() => onPerson(a)}>More by {(a.user_name || "").split(" ")[0]}</button>}
                        </div>
                        {open[a.id] && <Changes oldV={a.old_values} newV={a.new_values} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ details panel */
function DetailPanel({ id, onClose, formatDateTime }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { activityApi.get(id).then(r => setD(r.data.data)).catch(e => setErr(errMsg(e))); }, [id]);
  return (
    <div className="as-modal" onClick={onClose}>
      <aside className="as-panel" role="dialog" aria-label="Activity details" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ flex: 1, fontSize: 16 }}>Activity details</b>
          <button type="button" className="as-btn" onClick={onClose}>Close</button>
        </div>
        {err && <div className="as-err">{err}</div>}
        {!d && !err && <div className="as-muted">Loading...</div>}
        {d && (
          <>
            <div className="as-text" style={{ fontWeight: 600 }}>{d.description}</div>
            <dl className="as-kv">
              <dt>Performed by</dt><dd>{d.user_name_snapshot || "-"}</dd>
              <dt>Role</dt><dd>{d.user_role_snapshot || "-"}</dd>
              <dt>Department</dt><dd>{d.department_name_snapshot || "-"}</dd>
              <dt>Module</dt><dd>{d.module}</dd>
              <dt>Action</dt><dd>{d.action}</dd>
              {d.entity_type && <><dt>Record</dt><dd>{label(d.entity_type)}{d.entity_name ? ": " + d.entity_name : ""}{d.entity_id ? ` (#${d.entity_id})` : ""}</dd></>}
              <dt>When</dt><dd>{formatDateTime(d.created_at)}</dd>
              {d.ip_address !== undefined && <><dt>IP address</dt><dd>{d.ip_address || "-"}</dd></>}
              {d.user_agent !== undefined && <><dt>Browser</dt><dd>{d.user_agent || "-"}</dd></>}
            </dl>
            <Changes oldV={d.old_values} newV={d.new_values} />
          </>
        )}
      </aside>
    </div>
  );
}

const ViewToggle = ({ compact, setCompact }) => (
  <div className="as-views" role="group" aria-label="View">
    <button type="button" className={"as-view" + (!compact ? " on" : "")} aria-pressed={!compact} title="Detailed view" onClick={() => setCompact(false)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="6" height="6" rx="1" /><path d="M13 6h8M13 9h5" /><rect x="3" y="14" width="6" height="6" rx="1" /><path d="M13 16h8M13 19h5" /></svg>
    </button>
    <button type="button" className={"as-view" + (compact ? " on" : "")} aria-pressed={compact} title="Compact view" onClick={() => setCompact(true)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
    </button>
  </div>
);

/* ------------------------------------------------------------------ the page */
export default function ActivityStream() {
  const { formatDateTime } = useRegionalSettings();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState(null);
  const [depts, setDepts] = useState([]);
  const [people, setPeople] = useState([]);
  const [f, setF] = useState({ department_id: "", employee_id: "", module: "", activity_type: "", date_from: "", date_to: "", q: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [compact, setCompact] = useState(false);
  const [detail, setDetail] = useState(null);
  const [fresh, setFresh] = useState([]);
  const [err, setErr] = useState("");
  const [rec, setRec] = useState(null);
  const [, tick] = useState(0);
  const topId = useRef(0);
  const params = useCallback(p => { const o = { ...p }; Object.keys(o).forEach(k => (o[k] === "" || o[k] == null) && delete o[k]); return o; }, []);
  const load = useCallback(async (pg = 1) => {
    try {
      const r = await activityApi.list({ ...params(f), page: pg, limit: 30 });
      const data = r.data.data || [];
      setRows(prev => pg === 1 ? data : [...(prev || []), ...data]);
      setTotal(r.data.pagination?.total || 0); setPage(pg); setScope(r.data.scope);
      if (pg === 1) { topId.current = data[0]?.id || 0; setFresh([]); }
    } catch (e) { setErr(errMsg(e)); setRows([]); }
  }, [f, params]);
  useEffect(() => {
    activityApi.summary().then(r => setSummary(r.data.data)).catch(e => setErr(errMsg(e)));
    activityApi.departments().then(r => setDepts(r.data.data || [])).catch(() => {});
  }, []);
  useEffect(() => { activityApi.employees(params({ department_id: f.department_id })).then(r => setPeople(r.data.data || [])).catch(() => {}); }, [f.department_id, params]);
  useEffect(() => { const t = setTimeout(() => load(1), f.q ? 350 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { if (rows && rows.length === 0 && total === 0 && activityApi.status) activityApi.status().then(r => setRec(r.data.data)).catch(() => {}); }, [rows, total]);
  useEffect(() => {                                       // new activities every 30 s; "x minutes ago" keeps ticking
    const t = setInterval(async () => {
      tick(x => x + 1);
      if (!topId.current) return;
      try {
        const r = await activityApi.list({ ...params(f), since_id: topId.current, limit: 50 });
        const nw = r.data.data || [];
        if (nw.length) {
          topId.current = nw[0].id;
          setRows(prev => [...nw, ...(prev || [])]); setTotal(x => x + nw.length); setFresh(x => [...nw.map(a => a.id), ...x]);
          activityApi.summary().then(s => setSummary(s.data.data)).catch(() => {});
        }
      } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, [f, params]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v, ...(k === "department_id" ? { employee_id: "" } : {}) }));
  const system = scope ? scope.system : summary?.scope?.system;
  const modules = (summary?.by_module || []).map(m => m.name);
  const active = Object.values(f).filter(Boolean).length;
  if (err && !rows && !summary) return <div className="as-page"><div className="as-err">{err}</div></div>;
  return (
    <div className="as-page">
      {summary && (
        <div className="as-stats">
          <div><b>{summary.today}</b><span>activities today</span></div>
          <div><b>{summary.this_week}</b><span>this week</span></div>
          <div><b>{summary.active_users_today}</b><span>{system === false ? "employees" : "people"} active today</span></div>
          {summary.by_module.slice(0, 3).map(m => <div key={m.name}><b>{m.n}</b><span>{m.name} this week</span></div>)}
        </div>
      )}

      <div className="as-card">
        <div className="as-head">
          <h1 className="as-title">{system === false ? "Department Activity Stream" : "Activity Stream"}</h1>
          <button type="button" className={"as-btn" + (active ? " on" : "")} onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters}>
            Filters{active ? ` (${active})` : ""}
          </button>
          <ViewToggle compact={compact} setCompact={setCompact} />
        </div>
        {showFilters && (
          <div className="as-filters" role="search">
            {system && <select className="as-input" value={f.department_id} onChange={e => set("department_id", e.target.value)} aria-label="Department">
              <option value="">All departments</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
            <select className="as-input" value={f.employee_id} onChange={e => set("employee_id", e.target.value)} aria-label="Employee">
              <option value="">All employees</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ""}</option>)}</select>
            <select className="as-input" value={f.module} onChange={e => set("module", e.target.value)} aria-label="Module">
              <option value="">All modules</option>{modules.map(m => <option key={m} value={m}>{m}</option>)}</select>
            <select className="as-input" value={f.activity_type} onChange={e => set("activity_type", e.target.value)} aria-label="Type">
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className="as-input" type="date" value={f.date_from} onChange={e => set("date_from", e.target.value)} aria-label="From" />
            <input className="as-input" type="date" value={f.date_to} onChange={e => set("date_to", e.target.value)} aria-label="To" />
            <input className="as-input" style={{ flex: "1 1 200px" }} placeholder="Search employee or activity" value={f.q} onChange={e => set("q", e.target.value)} aria-label="Search" />
            {active > 0 && <button type="button" className="as-btn" onClick={() => setF({ department_id: "", employee_id: "", module: "", activity_type: "", date_from: "", date_to: "", q: "" })}>Clear</button>}
          </div>
        )}
        {err && <div className="as-err">{err}</div>}
        {rows === null && <div className="as-muted as-pad">Loading...</div>}
        {rows && rows.length === 0 && <div className="as-muted as-pad">No activity found.</div>}
        {rows && rows.length > 0 && (
          <StreamList rows={rows} compact={compact} fresh={fresh} formatDateTime={formatDateTime} showDept={system !== false}
                      onPerson={a => { set("employee_id", String(a.user_id)); setShowFilters(true); }} onDetails={setDetail} />
        )}
        {rows && rows.length < total && <div className="as-more"><button type="button" className="as-btn" onClick={() => load(page + 1)}>Show more ({total - rows.length})</button></div>}
      </div>

      {rows && rows.length === 0 && rec && (
        <div className="as-card as-pad" style={{ fontSize: 13 }}>
          <b>Recorder status</b>
          {!rec.installed ? <div className="as-err" style={{ marginTop: 8 }}>The recorder is not running. Copy the new main.py and app\activity_middleware.py, then restart Uvicorn.{rec.last_error ? " (" + rec.last_error + ")" : ""}</div> : (
            <div className="as-muted" style={{ marginTop: 6, display: "grid", gap: 4 }}>
              <span>Running since {rec.started_at}. Changes seen: {rec.changes_seen} · recorded: {rec.recorded} · in the database: {rec.activities_in_database}</span>
              {Object.entries(rec.skipped || {}).map(([k, n]) => <span key={k}>Skipped {n}× - {k}</span>)}
              {rec.last_skip && <span>Last skipped: {rec.last_skip.path} ({rec.last_skip.reason})</span>}
              {rec.last_error && <span style={{ color: "#B91C1C" }}>Last error: {rec.last_error}</span>}
              {rec.changes_seen === 0 && <span>No changes have reached the recorder since it started - make a change (e.g. edit a student) and reload this page.</span>}
            </div>
          )}
        </div>
      )}
      {detail && <DetailPanel id={detail} onClose={() => setDetail(null)} formatDateTime={formatDateTime} />}
    </div>
  );
}

/* ------------------------------------------------------------------ dashboard widget, same look (renders nothing without access) */
export function ActivityWidget({ narrow = false, onAvailable }) {
  const navigate = useNavigate();
  const { formatDateTime } = useRegionalSettings();
  const { theme, colorMode } = useTheme();
  const headBg = theme?.primary ? darkenColor(theme.primary, colorMode === "dark" ? 195 : 50) : "#1e3a5f";
  const [s, setS] = useState(null);
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("");
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    const get = () => activityApi.summary().then(r => { setS(r.data.data); onAvailable && onAvailable(true); })
                                          .catch(() => { setS(false); onAvailable && onAvailable(false); });
    get(); const t = setInterval(get, 60000); return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!s) return;
    const get = () => activityApi.list({ limit: narrow ? 8 : 10, ...(tab ? { activity_type: tab } : {}) }).then(r => setRows(r.data.data || [])).catch(() => setRows([]));
    get(); const t = setInterval(get, 60000); return () => clearInterval(t);
  }, [s, tab, narrow]);
  if (!s) return null;
  const dept = s.scope && s.scope.system === false;
  return (
    <div className={"as-card as-widget" + (narrow ? " as-widget--narrow" : "")}>
      <div className="as-whead" style={{ background: headBg }}>
        <div className="as-whead-row">
          <div className="as-whead-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
            <span className="as-whead-title">{dept ? "Department Activity Stream" : "Activity Stream"}</span>
            {s.today > 0 && <span className="as-whead-badge" title={`${s.today} today`}>{s.today}</span>}
          </div>
          <button type="button" className="as-whead-btn" onClick={() => navigate("/activity")}>View all</button>
        </div>
        <div className="as-whead-tabs" role="tablist">
          {WIDGET_TABS.map(([val, lbl]) => (
            <button key={val || "all"} type="button" role="tab" aria-selected={tab === val} className={"as-whead-tab" + (tab === val ? " on" : "")}
                    onClick={() => setTab(val)}>{lbl}</button>
          ))}
        </div>
      </div>
      {rows === null ? <div className="as-ann-empty">Loading...</div>
        : rows.length === 0 ? <div className="as-ann-empty">{tab ? "Nothing of this kind yet." : "No activity yet."}</div>
        : <AnnStyleList rows={rows} formatDateTime={formatDateTime} onOpen={setDetail} dark={colorMode === "dark"} />}
      {detail && <DetailPanel id={detail} onClose={() => setDetail(null)} formatDateTime={formatDateTime} />}
    </div>
  );
}
