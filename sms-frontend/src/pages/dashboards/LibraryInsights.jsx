import { useState, useEffect, useCallback } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + y.slice(2); };

/** Librarian: issues vs returns, overdue books, popular categories, fines. */
export default function LibraryInsights() {
  const t = useChartTheme();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.library(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the charts."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading charts..." /></div>;
  const tl = d.tiles;

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={tl.overdue ? { tone: "bad", text: tl.overdue + " book" + (tl.overdue > 1 ? "s are" : " is") + " overdue" + (d.overdue[0] ? " - longest " + d.overdue[0].days + " days (" + d.overdue[0].title + ")" : "") }
      : { tone: "ok", text: "No overdue books." }}
        highlights={[
      { label: "Issued right now", value: tl.issued_now, sub: tl.copies + " copies in total" },
      tl.pending_fines != null && { label: "Unpaid fines", value: "Rs. " + Number(tl.pending_fines).toLocaleString() },
      { label: "Active members", value: tl.members },
    ].filter(Boolean)} />
      <div className="dk-tiles">
        <StatTile label="Titles" value={tl.titles} sub={tl.copies + " copies"} />
        <StatTile label="Issued right now" value={tl.issued_now} />
        <StatTile label="Overdue" value={tl.overdue} tone={tl.overdue ? "bad" : "ok"} />
        {tl.pending_fines != null && <StatTile label="Unpaid fines" value={"Rs. " + Number(tl.pending_fines).toLocaleString()} tone={tl.pending_fines ? "warn" : "ok"} />}
        <StatTile label="Active members" value={tl.members} />
      </div>
      <div className="dk-grid">
        <ChartCard title="Issued vs returned" subtitle="Last 12 months" span={2}>
          {d.flow.some(m => m.issued || m.returned) ? (
            <ResponsiveContainer>
              <BarChart data={d.flow} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="issued" name="Issued" fill={t.main} radius={[4, 4, 0, 0]} />
                <Bar dataKey="returned" name="Returned" fill={t.pass} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No books issued in the last 12 months." />}
        </ChartCard>
        <ChartCard title="Most borrowed categories" subtitle="Last 12 months">
          {d.categories.length ? (
            <ResponsiveContainer>
              <BarChart data={d.categories} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axis(t)} />
                <YAxis type="category" dataKey="category" width={110} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Bar dataKey="issues" name="Issues" radius={[0, 4, 4, 0]}>
                  {d.categories.map((c, i) => <Cell key={c.category} fill={t.series[i % t.series.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No borrowing yet." />}
        </ChartCard>
        <ChartCard title="Members by type" subtitle="Active members">
          {d.members.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.members} dataKey="members" nameKey="type" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
                  {d.members.map((m, i) => <Cell key={m.type} fill={t.series[i % t.series.length]} stroke="none" />)}
                </Pie>
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No library members yet." />}
        </ChartCard>
        {d.fines && (
          <ChartCard title="Fines" subtitle="Collected vs waived · last 12 months">
            {d.fines.some(f => f.collected || f.waived) ? (
              <ResponsiveContainer>
                <BarChart data={d.fines} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                  <YAxis {...axis(t)} />
                  <ThemedTooltip t={t} labelFormatter={monthLabel} />
                  <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                  <Bar dataKey="collected" name="Collected (Rs.)" fill={t.pass} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="waived" name="Waived (Rs.)" fill={t.prev} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="No fines collected or waived in the last 12 months." />}
          </ChartCard>
        )}
        <div className="dk-card">
          <div className="dk-card-head"><div><div className="dk-card-title">Overdue books</div>
            <div className="dk-card-sub">Longest overdue first</div></div></div>
          {d.overdue.length ? (
            <div className="dk-table-wrap">
              <table className="dk-table">
                <thead><tr><th>Book</th><th>Borrower</th><th>Due</th><th>Late</th></tr></thead>
                <tbody>{d.overdue.map((o, i) => (
                  <tr key={i}><td><b>{o.title}</b></td><td>{o.who}<div className="dk-card-sub">{o.type}</div></td>
                    <td>{o.due}</td><td><span className="dk-chip">{o.days} days</span></td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyChart text="No overdue books." />}
        </div>
      </div>
    </div>
  );
}
