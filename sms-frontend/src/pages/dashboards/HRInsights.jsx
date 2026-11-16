import { useState, useEffect, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell, ReferenceLine } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + y.slice(2); };
const k = (v) => v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : v;

/** HR: staff attendance, leave usage, headcount, joiners vs leavers, payroll cost. */
export default function HRInsights() {
  const t = useChartTheme();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.hr(); setD(r.data.data); }
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
        alert={tl.pending_leaves ? { tone: "warn", text: tl.pending_leaves + " leave request" + (tl.pending_leaves > 1 ? "s are" : " is") + " waiting for review" }
      : tl.pending_corrections ? { tone: "warn", text: tl.pending_corrections + " attendance correction" + (tl.pending_corrections > 1 ? "s" : "") + " to review" }
      : { tone: "ok", text: "No leave or attendance requests waiting." }}
        highlights={[
      { label: "Clocked in today", value: tl.present_today + " / " + tl.staff, sub: tl.staff ? Math.round(100 * tl.present_today / tl.staff) + "% of staff" : "" },
      { label: "On leave today", value: tl.on_leave_today },
      { label: "Open resignations", value: tl.open_resignations },
    ]} />
      <div className="dk-tiles">
        <StatTile label="Active staff" value={tl.staff} />
        <StatTile label="Clocked in today" value={tl.present_today + " / " + tl.staff}
          tone={tl.staff && tl.present_today / tl.staff >= 0.9 ? "ok" : "warn"} />
        <StatTile label="On leave today" value={tl.on_leave_today} />
        <StatTile label="Pending leave requests" value={tl.pending_leaves} tone={tl.pending_leaves ? "warn" : "ok"} />
        <StatTile label="Open resignations" value={tl.open_resignations} tone={tl.open_resignations ? "warn" : ""} />
        {tl.pending_corrections != null && <StatTile label="Attendance corrections" value={tl.pending_corrections} tone={tl.pending_corrections ? "warn" : "ok"} />}
      </div>
      <div className="dk-grid">
        <ChartCard title="Staff attendance" subtitle="Last 30 days · present % of staff due to work (weekly off excluded) · right axis = staff count" span={2}>
          {d.attendance.length ? (
            <ResponsiveContainer>
              <LineChart data={d.attendance} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} {...axis(t)} minTickGap={20} />
                <YAxis yAxisId="p" domain={[0, 100]} {...axis(t)} />
                <YAxis yAxisId="l" orientation="right" allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={fmtDay} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <ReferenceLine yAxisId="p" y={90} stroke={t.comp} strokeDasharray="4 4" />
                <Line yAxisId="p" type="monotone" dataKey="pct" name="Present %" stroke={t.main} strokeWidth={2.5} dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="absent" name="Absent" stroke={t.fail} strokeWidth={1.5} dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="on_leave" name="On leave" stroke={t.prev} strokeWidth={1.5} dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="late" name="Late arrivals" stroke={t.comp} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No finalized staff attendance in the last 30 days." />}
        </ChartCard>
        <ChartCard title="Leave taken by type" subtitle="Approved days · last 6 months">
          {d.leave.types.length ? (
            <ResponsiveContainer>
              <BarChart data={d.leave.rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} suffix=" days" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                {d.leave.types.map((ty, i) => <Bar key={ty} dataKey={ty} stackId="l" fill={t.series[i % t.series.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No approved leave in the last 6 months." />}
        </ChartCard>
        <ChartCard title="Headcount by department" subtitle="Active staff">
          {d.departments.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.departments} dataKey="staff" nameKey="dept" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
                  {d.departments.map((x, i) => <Cell key={x.dept} fill={t.series[i % t.series.length]} stroke="none" />)}
                </Pie>
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No active staff." />}
        </ChartCard>
        <ChartCard title="Joiners vs leavers" subtitle="Last 12 months">
          {d.movement.some(m => m.joined || m.left) ? (
            <ResponsiveContainer>
              <BarChart data={d.movement} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="joined" name="Joined" fill={t.pass} radius={[4, 4, 0, 0]} />
                <Bar dataKey="left" name="Left" fill={t.fail} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No joiners or leavers in the last 12 months." />}
        </ChartCard>
        <ChartCard title="Payroll cost" subtitle="Per payroll run · last 12 months">
          {d.payroll.length ? (
            <ResponsiveContainer>
              <BarChart data={d.payroll} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} />
                <YAxis tickFormatter={k} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="net" name="Net pay (Rs.)" stackId="p" fill={t.main} />
                <Bar dataKey="deductions" name="Deductions (Rs.)" stackId="p" fill={t.prev} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No payroll runs in the last 12 months." />}
        </ChartCard>
      </div>
    </div>
  );
}
