import { useState, useEffect, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + y.slice(2); };
const rs = (n) => n == null ? "-" : "Rs. " + Number(n).toLocaleString();
const k = (v) => v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : v;

/** Admin / superadmin: school-wide or campus overview (follows the campus switcher). */
export default function AdminOverview() {
  const t = useChartTheme();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.admin(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the dashboard."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading dashboard..." /></div>;

  const tl = d.tiles;
  const multi = d.campuses.length > 1;
  const f = d.fees;
  const hasMovement = d.movement.some(m => m.admissions || m.withdrawals);
  const hasCollection = f && f.collection.some(m => m.billed || m.collected);

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={tl.overdue ? { tone: "warn", text: rs(tl.overdue) + " of fee is overdue" + (multi ? " across all campuses" : "") }
      : tl.attendance_today != null && tl.attendance_today < 75 ? { tone: "bad", text: "Attendance today is only " + tl.attendance_today + "%" }
      : { tone: "ok", text: "No overdue fee and attendance is on track." }}
        highlights={[
      { label: multi ? "Students across " + d.campuses.length + " campuses" : "Active students", value: tl.students, sub: tl.staff + " staff" },
      f && (() => { const m = f.collection[f.collection.length - 1]; return { label: "Collected this month", value: m.rate != null ? m.rate + "%" : "-", sub: rs(m.collected) + " of " + rs(m.billed) }; })(),
      { label: "Attendance today", value: tl.attendance_today == null ? "Not marked" : tl.attendance_today + "%" },
    ].filter(Boolean)} />

      <div className="dk-tiles">
        <StatTile label="Active students" value={tl.students} sub={multi ? d.campuses.length + " campuses" : d.scope} />
        <StatTile label="Active staff" value={tl.staff} />
        <StatTile label="Attendance today" value={tl.attendance_today == null ? "Not marked" : tl.attendance_today + "%"}
          tone={tl.attendance_today == null ? "" : tl.attendance_today >= 90 ? "ok" : tl.attendance_today >= 75 ? "warn" : "bad"} />
        <StatTile label="Collected this month" value={rs(tl.collected_this_month)} tone="ok" />
        <StatTile label="Outstanding fee" value={rs(tl.outstanding)} tone={tl.overdue ? "bad" : "warn"}
          sub={tl.overdue ? rs(tl.overdue) + " overdue" : "Nothing overdue"} />
      </div>

      <div className="dk-grid">
        <ChartCard title="Enrollment by class" subtitle={multi ? "Active students, by campus" : "Active students"} span={2}>
          {d.enrollment.rows.length ? (
            <ResponsiveContainer>
              <BarChart data={d.enrollment.rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="class" {...axis(t)} interval={0} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} />
                {multi && <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />}
                {d.enrollment.series.map((s, i) => (
                  <Bar key={s} dataKey={s} name={s} stackId="e" fill={t.series[i % t.series.length]}
                    radius={i === d.enrollment.series.length - 1 ? [4, 4, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No classes yet." />}
        </ChartCard>

        <ChartCard title="Fee billed vs collected" subtitle="Last 12 months · line = collection rate">
          {hasCollection ? (
            <ResponsiveContainer>
              <ComposedChart data={f.collection} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis yAxisId="rs" tickFormatter={k} {...axis(t)} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} {...axis(t)} unit="%" />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar yAxisId="rs" dataKey="billed" name="Billed (Rs.)" fill={t.prev} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="rs" dataKey="collected" name="Collected (Rs.)" fill={t.pass} radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="rate" name="Collection %" stroke={t.main} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No fee invoices in the last 12 months." />}
        </ChartCard>

        <ChartCard title="Outstanding fee" subtitle={multi ? "By campus · overdue vs not yet due" : "Overdue vs not yet due"}>
          {f && f.outstanding.some(o => o.overdue || o.upcoming) ? (
            <ResponsiveContainer>
              <BarChart data={f.outstanding} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="campus" {...axis(t)} />
                <YAxis tickFormatter={k} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="overdue" name="Overdue (Rs.)" stackId="o" fill={t.fail} />
                <Bar dataKey="upcoming" name="Not yet due (Rs.)" stackId="o" fill={t.comp} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No outstanding fee." />}
        </ChartCard>

        <ChartCard title="Admissions vs withdrawals" subtitle="Last 12 months">
          {hasMovement ? (
            <ResponsiveContainer>
              <BarChart data={d.movement} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="admissions" name="Admissions" fill={t.pass} radius={[4, 4, 0, 0]} />
                <Bar dataKey="withdrawals" name="Withdrawals" fill={t.fail} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No admissions or withdrawals in the last 12 months." />}
        </ChartCard>

        <ChartCard title="Staff by department" subtitle="Active staff">
          {d.staff.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.staff} dataKey="staff" nameKey="dept" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
                  {d.staff.map((s, i) => <Cell key={s.dept} fill={t.series[i % t.series.length]} stroke="none" />)}
                </Pie>
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No active staff." />}
        </ChartCard>

        <ChartCard title="Student attendance" subtitle={multi ? "Last 30 days · one line per campus" : "Last 30 days"} span={2}>
          {d.attendance.points.length ? (
            <ResponsiveContainer>
              <LineChart data={d.attendance.points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} {...axis(t)} minTickGap={20} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" labelFormatter={fmtDay} />
                {multi && <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />}
                {d.attendance.series.map((s, i) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={t.series[i % t.series.length]} strokeWidth={2.5} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No attendance marked in the last 30 days." />}
        </ChartCard>
      </div>
    </div>
  );
}
