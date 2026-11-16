import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + y.slice(2); };
const rs = (n) => n == null ? "-" : "Rs. " + Number(n).toLocaleString();
const k = (v) => v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : v;

/** Finance officer: collection, payment methods, dues aging, discounts & fines, defaulters. */
export default function FinanceDashboard() {
  const t = useChartTheme();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.finance(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the dashboard."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading dashboard..." /></div>;

  const tl = d.tiles;
  const pv = tl.pending_verification;
  const agingColors = [t.prev, t.comp, "#f97316", t.fail, t.dark ? "#fca5a5" : "#7f1d1d"];

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={pv && pv.count ? { tone: "warn", text: pv.count + " payment" + (pv.count > 1 ? "s" : "") + " (" + rs(pv.amount) + ") waiting for verification", onClick: () => navigate("/finance") }
      : tl.overdue ? { tone: "bad", text: rs(tl.overdue) + " overdue across " + tl.defaulters + " student" + (tl.defaulters === 1 ? "" : "s") }
      : { tone: "ok", text: "No overdue fee and nothing to verify." }}
        highlights={[
      { label: "Collection rate this month", value: tl.rate_this_month != null ? tl.rate_this_month + "%" : "-", sub: rs(tl.collected_this_month) + " of " + rs(tl.billed_this_month) },
      { label: "Overdue", value: rs(tl.overdue), sub: tl.defaulters + " students" },
      { label: "Over 90 days", value: rs((d.aging.find(a => a.bucket === "90+ days") || {}).amount || 0), sub: "Hardest to recover" },
    ]} />

      <div className="dk-tiles">
        <StatTile label="Billed this month" value={rs(tl.billed_this_month)} />
        <StatTile label="Collected this month" value={rs(tl.collected_this_month)}
          tone={tl.rate_this_month == null ? "" : tl.rate_this_month >= 80 ? "ok" : tl.rate_this_month >= 50 ? "warn" : "bad"}
          sub={tl.rate_this_month != null ? tl.rate_this_month + "% collected" : ""} />
        <StatTile label="Outstanding" value={rs(tl.outstanding)} tone={tl.overdue ? "bad" : "warn"} sub={rs(tl.overdue) + " overdue"} />
        <StatTile label="Students with overdue fee" value={tl.defaulters} tone={tl.defaulters ? "bad" : "ok"} />
        {pv && <StatTile label="Payments to verify" value={pv.count} tone={pv.count ? "warn" : "ok"}
          sub={pv.count ? rs(pv.amount) + " waiting" : "All verified"} onClick={() => navigate("/finance")} />}
      </div>

      <div className="dk-grid">
        <ChartCard title="Billed vs collected" subtitle="Last 12 months · line = collection rate" span={2}>
          {d.collection.some(m => m.billed || m.collected) ? (
            <ResponsiveContainer>
              <ComposedChart data={d.collection} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis yAxisId="rs" tickFormatter={k} {...axis(t)} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar yAxisId="rs" dataKey="billed" name="Billed (Rs.)" fill={t.prev} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="rs" dataKey="collected" name="Collected (Rs.)" fill={t.pass} radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="rate" name="Collection %" stroke={t.main} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No invoices in the last 12 months." />}
        </ChartCard>

        <ChartCard title="Dues aging" subtitle="Unpaid balance by days past due">
          {d.aging.some(a => a.amount) ? (
            <ResponsiveContainer>
              <BarChart data={d.aging} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="bucket" {...axis(t)} interval={0} />
                <YAxis tickFormatter={k} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Bar dataKey="amount" name="Unpaid (Rs.)" radius={[4, 4, 0, 0]}>
                  {d.aging.map((a, i) => <Cell key={a.bucket} fill={agingColors[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No unpaid fee." />}
        </ChartCard>

        <ChartCard title="Collection by payment method" subtitle="Last 12 months · verified payments">
          {d.methods?.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.methods} dataKey="amount" nameKey="method" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
                  {d.methods.map((m, i) => <Cell key={m.method} fill={t.series[i % t.series.length]} stroke="none" />)}
                </Pie>
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text={d.methods ? "No verified payments in the last 12 months." : "Payment method isn't recorded with payments."} />}
        </ChartCard>

        <ChartCard title="Discounts vs late fees" subtitle="Per invoice month">
          {d.adjustments?.some(a => a.discount || a.fine) ? (
            <ResponsiveContainer>
              <BarChart data={d.adjustments} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis tickFormatter={k} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="discount" name="Discounts (Rs.)" fill={t.main} radius={[4, 4, 0, 0]} />
                <Bar dataKey="fine" name="Late fees (Rs.)" fill={t.fail} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text={d.adjustments ? "No discounts or late fees in the last 12 months." : "Discounts and fines aren't recorded on invoices."} />}
        </ChartCard>

        <div className="dk-card">
          <div className="dk-card-head"><div><div className="dk-card-title">Top defaulters</div>
            <div className="dk-card-sub">Most months overdue first</div></div></div>
          {d.defaulters.length ? (
            <div className="dk-table-wrap">
              <table className="dk-table">
                <thead><tr><th>Student</th><th>Class</th><th>Months</th><th>Overdue</th><th>Oldest</th></tr></thead>
                <tbody>{d.defaulters.map(s => (
                  <tr key={s.enrollment_no + s.student}>
                    <td><b>{s.student}</b><div className="dk-card-sub">{s.enrollment_no}</div></td>
                    <td>{s.class}</td>
                    <td><span className="dk-chip">{s.months}</span></td>
                    <td><b>{rs(s.amount)}</b></td>
                    <td>{s.days} days</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyChart text="No overdue fee - nice." />}
        </div>
      </div>
    </div>
  );
}
