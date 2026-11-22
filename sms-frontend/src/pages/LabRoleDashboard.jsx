import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import labApi from "../api/labApi";
import { HeroBanner } from "../components/dashboard/ChartKit";
import "./Laboratory.css";

const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const num = v => (v === null || v === undefined) ? "-" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const day = v => (v || "").slice(0, 10);
const EQ_STATUS = { available: "Available", issued: "Issued", partially_available: "Partly issued", under_maintenance: "Under maintenance", lost: "Lost", retired: "Retired" };
const REQ_STATUS = { requested: "Requested", approved: "Approved", issued: "Issued", partially_returned: "Partly returned", returned: "Returned", rejected: "Rejected", cancelled: "Cancelled" };
const C = { green: "#16a34a", amber: "#d97706", red: "#dc2626", blue: "#2563eb", violet: "#7c3aed", slate: "#94a3b8", teal: "#0d9488" };
const EQ_COLOR = { available: C.green, issued: C.blue, partially_available: C.teal, under_maintenance: C.amber, lost: C.red, retired: C.slate };

/* ---------- small SVG charts (no library) ---------- */
function Donut({ parts, center, label }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 52, W = 16, L = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="lrd-donut">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--l-bg2)" strokeWidth={W} />
        {total > 0 && parts.filter(p => p.value > 0).map(p => {
          const len = p.value / total * L, off = acc; acc += len;
          return <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth={W}
                         strokeDasharray={`${len} ${L - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{p.label}: {p.value}</title></circle>;
        })}
        <text x="70" y="68" textAnchor="middle" className="lrd-donut-n">{center ?? total}</text>
        <text x="70" y="86" textAnchor="middle" className="lrd-donut-l">{label}</text>
      </svg>
      <ul className="lrd-legend">
        {parts.map(p => <li key={p.label}><span style={{ background: p.color }} />{p.label}<b>{p.value}</b></li>)}
      </ul>
    </div>
  );
}

function StackedBars({ rows, keys }) {
  const max = Math.max(1, ...rows.map(r => keys.reduce((s, k) => s + (r[k.key] || 0), 0)));
  return (
    <div className="lrd-stack">
      {rows.map(r => (
        <div key={r.name} className="lrd-stack-row">
          <span className="lrd-stack-name" title={r.name}>{r.name}</span>
          <span className="lrd-stack-track">
            {keys.map(k => r[k.key] > 0 && <span key={k.key} style={{ width: (r[k.key] / max * 100) + "%", background: k.color }} title={`${k.label}: ${r[k.key]}`} />)}
          </span>
          <b>{keys.reduce((s, k) => s + (r[k.key] || 0), 0)}</b>
        </div>
      ))}
      <ul className="lrd-legend lrd-legend-row">{keys.map(k => <li key={k.key}><span style={{ background: k.color }} />{k.label}</li>)}</ul>
    </div>
  );
}

function GroupedBars({ rows, keys, height = 150 }) {
  const max = Math.max(1, ...rows.flatMap(r => keys.map(k => r[k.key] || 0)));
  const gw = 100 / rows.length, bw = gw * 0.7 / keys.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label="Stock activity by month">
        {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1="0" x2="100" y1={height / 3 * (1 - f)} y2={height / 3 * (1 - f)} stroke="var(--l-line)" strokeWidth="0.2" />)}
        {rows.map((r, i) => keys.map((k, j) => {
          const h = (r[k.key] || 0) / max * (height / 3 - 1);
          return <rect key={i + k.key} x={i * gw + gw * 0.15 + j * bw} y={height / 3 - h} width={bw * 0.9} height={h} fill={k.color}><title>{r.month} - {k.label}: {r[k.key]}</title></rect>;
        }))}
      </svg>
      <div className="lrd-axis">{rows.map(r => <span key={r.month}>{r.month.split(" ")[0]}</span>)}</div>
      <ul className="lrd-legend lrd-legend-row">{keys.map(k => <li key={k.key}><span style={{ background: k.color }} />{k.label}</li>)}</ul>
    </div>
  );
}

function HBars({ rows, color }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="lrd-stack">
      {rows.map(r => (
        <div key={r.label} className="lrd-stack-row">
          <span className="lrd-stack-name" title={r.label}>{r.label}</span>
          <span className="lrd-stack-track"><span style={{ width: (r.value / max * 100) + "%", background: color }} /></span>
          <b>{r.text ?? r.value}</b>
        </div>
      ))}
    </div>
  );
}

const Empty = ({ children }) => <div className="lab-muted" style={{ padding: "18px 0" }}>{children}</div>;

/* ---------- the dashboard ---------- */
export default function LabRoleDashboard({ compact = false }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [sum, setSum] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      labApi.dashboardCharts().then(r => setD(r.data.data)).catch(e => setErr(errMsg(e))),
      labApi.inventorySummary().then(r => setSum(r.data.data || {})).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="lab"><div className="lab-note err">{err}</div></div>;
  if (!d) return <div className="lab"><div className="lab-muted">Loading the lab dashboard...</div></div>;
  const eq = sum.equipment || {}, st = sum.stock || {};
  const Kpi = ({ n, label, to, tone }) => (
    <button type="button" className={"lab-kpi" + (tone ? " lrd-" + tone : "")} onClick={() => navigate(to)}><b>{num(n)}</b><span>{label}</span></button>);
  const sh = d.stock_health || {};
  const mine = d.scope === "mine";
  const items = (sh.ok || 0) + (sh.low || 0) + (sh.near_expiry || 0) + (sh.expired || 0);
  const units = (eq.available_units || 0) + (eq.issued_units || 0) + (eq.out_of_service || 0);
  const s = n => n === 1 ? "" : "s";
  // the one thing that needs attention most (red, then amber, else green)
  const alert = d.overdue.length ? { tone: "bad", text: `${d.overdue.length} equipment return${s(d.overdue.length)} overdue`, onClick: () => navigate("/lab/issues?overdue=1") }
    : sh.expired ? { tone: "bad", text: `${sh.expired} item${s(sh.expired)} with expired stock - write ${sh.expired === 1 ? "it" : "them"} off`, onClick: () => navigate("/lab/consumables?flag=expired") }
    : d.pending_requests ? { tone: "warn", text: `${d.pending_requests} equipment request${s(d.pending_requests)} waiting for approval`, onClick: () => navigate("/lab/issues") }
    : sh.low ? { tone: "warn", text: `${sh.low} item${s(sh.low)} at or below minimum stock`, onClick: () => navigate("/lab/consumables?flag=low") }
    : st.grn_pending ? { tone: "warn", text: `${st.grn_pending} goods-received line${s(st.grn_pending)} to put into lab stock`, onClick: () => navigate("/lab/consumables") }
    : { tone: "ok", text: "All in order - nothing overdue, no expired or low stock." };
  return (
    <div className="lab lrd" style={compact ? { padding: 0 } : undefined}>
      {!compact && d.lab_count > 0 && (
        <HeroBanner today={d.today} onRefresh={load} loading={loading} alert={alert}
          highlights={[
            { label: "Equipment available", value: num(eq.available_units), sub: `of ${num(units)} unit${s(units)}${eq.out_of_service ? ` · ${num(eq.out_of_service)} out of service` : ""}` },
            { label: "Stock health", value: items ? `${num(sh.ok)} / ${num(items)}` : "-", sub: items ? `items OK${sh.near_expiry ? ` · ${sh.near_expiry} near expiry` : ""}` : "No consumables yet" },
            { label: "Requests", value: num(d.pending_requests), sub: `to approve · ${num(eq.issued_units)} unit${s(eq.issued_units)} issued` },
          ]} />
      )}
      <div className="lab-head">
        <div><h1 style={compact ? { fontSize: 20 } : undefined}>{mine ? "My Labs" : "Laboratory Overview"}</h1>
          <div className="lab-sub">{mine ? `The ${d.lab_count === 1 ? "lab" : d.lab_count + " labs"} you supervise` : `All ${d.lab_count} active labs`} - equipment, stock and requests.</div></div>
        <button type="button" className="lab-btn" onClick={() => navigate("/lab")}>Lab dashboard</button>
      </div>
      {d.lab_count === 0 ? <div className="lab-card"><Empty>{mine ? "You don't supervise any lab yet." : "No labs yet."}</Empty></div> : (
        <>
          <div className="lab-kpis">
            <Kpi n={eq.available_units} label="Equipment available" to="/lab/equipment?status=available" />
            <Kpi n={eq.issued_units} label="Equipment issued" to="/lab/issues" />
            <Kpi n={d.pending_requests} label="Requests to approve" to="/lab/issues" tone={d.pending_requests ? "warn" : ""} />
            <Kpi n={d.overdue.length} label="Overdue returns" to="/lab/issues?overdue=1" tone={d.overdue.length ? "bad" : ""} />
            <Kpi n={sh.low} label="Low-stock items" to="/lab/consumables?flag=low" tone={sh.low ? "warn" : ""} />
            <Kpi n={sh.expired} label="Items with expired stock" to="/lab/consumables?flag=expired" tone={sh.expired ? "bad" : ""} />
            {st.grn_pending > 0 && <Kpi n={st.grn_pending} label="Goods received to put away" to="/lab/consumables" tone="warn" />}
          </div>

          <div className="lrd-grid">
            <div className="lab-card"><b>Equipment by status</b>
              {d.equipment_by_status.length === 0 ? <Empty>No equipment registered yet.</Empty> :
                <Donut label="items" parts={d.equipment_by_status.map(x => ({ label: EQ_STATUS[x.status] || x.status, value: x.items, color: EQ_COLOR[x.status] || C.slate }))} />}
            </div>
            <div className="lab-card"><b>Stock health</b>
              {(sh.ok + sh.low + sh.near_expiry + sh.expired) === 0 ? <Empty>No consumables yet.</Empty> :
                <Donut label="items" parts={[{ label: "OK", value: sh.ok, color: C.green }, { label: "Low stock", value: sh.low, color: C.amber },
                                             { label: "Near expiry", value: sh.near_expiry, color: C.violet }, { label: "Expired stock", value: sh.expired, color: C.red }]} />}
            </div>
            <div className="lab-card"><b>Equipment requests - last 6 months</b>
              {d.requests_by_status.length === 0 ? <Empty>No requests yet.</Empty> :
                <HBars color={C.blue} rows={d.requests_by_status.map(x => ({ label: REQ_STATUS[x.status] || x.status, value: x.n }))} />}
            </div>
            <div className="lab-card lrd-wide"><b>Equipment by lab (units)</b>
              <StackedBars rows={d.equipment_by_lab} keys={[{ key: "available", label: "Available", color: C.green }, { key: "issued", label: "Issued", color: C.blue },
                                                           { key: "out_of_service", label: "Damaged / maintenance", color: C.amber }]} />
            </div>
            <div className="lab-card"><b>Most used - last 90 days</b>
              {d.top_used.length === 0 ? <Empty>Nothing used yet.</Empty> :
                <HBars color={C.teal} rows={d.top_used.map(x => ({ label: `${x.name}${mine ? "" : " · " + x.lab}`, value: x.used, text: `${num(x.used)} ${x.unit || ""}` }))} />}
            </div>
            <div className="lab-card lrd-full"><b>Stock activity - last 6 months (transactions)</b>
              <GroupedBars rows={d.stock_activity} keys={[{ key: "received", label: "Received", color: C.green }, { key: "used", label: "Issued / used", color: C.blue },
                                                         { key: "written_off", label: "Written off", color: C.red }]} />
            </div>
          </div>

          <div className="lrd-grid">
            <div className="lab-card"><b>Overdue returns</b>
              {d.overdue.length === 0 ? <Empty>Nothing overdue.</Empty> : d.overdue.map(x => (
                <div key={x.id} className="lrd-item" onClick={() => navigate("/lab/issues?overdue=1")}>
                  <span><b>{x.number}</b> · {x.requested_by}<div className="lab-muted">{x.lab}</div></span><span className="lrd-bad">due {day(x.expected_return_date)}</span></div>))}
            </div>
            <div className="lab-card"><b>Low stock</b>
              {d.low_stock.length === 0 ? <Empty>All stock above minimum.</Empty> : d.low_stock.map(x => (
                <div key={x.id} className="lrd-item" onClick={() => navigate("/lab/consumables?flag=low")}>
                  <span><b>{x.name}</b><div className="lab-muted">{x.lab}</div></span><span className="lrd-warn">{num(x.current_stock)} / min {num(x.min_stock)} {x.unit || ""}</span></div>))}
            </div>
            <div className="lab-card"><b>Expiring or expired batches</b>
              {d.expiring.length === 0 ? <Empty>Nothing expiring soon.</Empty> : d.expiring.map((x, i) => (
                <div key={i} className="lrd-item" onClick={() => navigate("/lab/consumables?flag=near_expiry")}>
                  <span><b>{x.name}</b> · batch {x.batch_no}<div className="lab-muted">{x.lab} · {num(x.quantity)} left</div></span>
                  <span className={x.expiry_date < new Date().toISOString().slice(0, 10) ? "lrd-bad" : "lrd-warn"}>{x.expiry_date < new Date().toISOString().slice(0, 10) ? "expired " : "expires "}{day(x.expiry_date)}</span></div>))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
