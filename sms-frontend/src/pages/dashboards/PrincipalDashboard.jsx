import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell, ReferenceLine } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

/** Principal: campus attendance, latest results and pending approvals. */
export default function PrincipalDashboard() {
  const t = useChartTheme();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.principal(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the dashboard."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading dashboard..." /></div>;

  const tl = d.tiles;
  const att = tl.student_attendance_today;
  const tone = (v) => v == null ? "" : v >= 90 ? "ok" : v >= 75 ? "warn" : "bad";
  const lowClass = d.class_attendance.length ? Math.min(...d.class_attendance.map(c => c.pct)) : null;
  const pend = d.pending;
  const pendItems = [
    ["Results to approve", pend.results, "/exams"], ["Promotion lists", pend.promotions, "/promotions"],
    ["Student leaves", pend.student_leaves, "/work-queue"], ["Staff leaves", pend.staff_leaves, "/work-queue"],
    ["Withdrawals", pend.withdrawals, "/work-queue"],
  ];

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={(() => { const n = Object.values(pend).reduce((a, b) => a + b, 0);
      if (n) return { tone: "warn", text: n + " item" + (n > 1 ? "s are" : " is") + " waiting for your approval", onClick: () => navigate(pend.results ? "/exams" : pend.promotions ? "/promotions" : "/work-queue") };
      if (att != null && att < 75) return { tone: "bad", text: "Student attendance today is only " + att + "%" };
      return { tone: "ok", text: "All caught up - nothing is waiting for your approval." }; })()}
        highlights={[
      { label: "Students present today", value: att == null ? "Not marked" : att + "%", sub: tl.student_marked_today ? tl.student_marked_today + " marked" : "" },
      lowClass != null && { label: "Lowest class attendance", value: lowClass + "%", sub: (d.class_attendance.find(c => c.pct === lowClass) || {}).class + " · last 30 days" },
      d.results?.by_class?.length && (() => { const tot = d.results.by_class.reduce((a, c) => a + c.pass + c.compartment + c.fail, 0); const p = d.results.by_class.reduce((a, c) => a + c.pass, 0);
        return { label: "Pass rate · " + d.results.exam, value: tot ? Math.round(100 * p / tot) + "%" : "-", sub: p + " of " + tot + " students", onClick: () => navigate("/exams/" + d.results.exam_id) }; })(),
    ].filter(Boolean)} />

      <div className="dk-tiles">
        <StatTile label="Students" value={tl.students} />
        <StatTile label="Student attendance today" value={att == null ? "Not marked" : att + "%"} tone={tone(att)}
          sub={tl.student_marked_today ? tl.student_marked_today + " marked" : "No attendance marked yet"} />
        <StatTile label="Staff present today" value={tl.staff_present_today + " / " + tl.staff}
          tone={tone(tl.staff_attendance_today)} sub={tl.staff_attendance_today != null ? tl.staff_attendance_today + "%" : ""} />
        <StatTile label="Pending approvals" value={Object.values(pend).reduce((a, b) => a + b, 0)}
          tone={Object.values(pend).some(Boolean) ? "warn" : "ok"} />
      </div>

      <div className="dk-card">
        <div className="dk-card-head"><div className="dk-card-title">Waiting for you</div></div>
        <div className="dk-pending">
          {pendItems.map(([label, n, link]) => (
            <div key={label} className={"dk-pend" + (n ? " dk-pend--hot" : "")} onClick={() => navigate(link)}>
              <span>{label}</span><span className="dk-pend-n">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dk-grid">
        <ChartCard title="Student attendance - last 30 days" subtitle="Share of students present each school day" span={2}>
          {d.attendance_trend.length ? (
            <ResponsiveContainer>
              <LineChart data={d.attendance_trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} {...axis(t)} minTickGap={20} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" labelFormatter={fmtDay} />
                <ReferenceLine y={75} stroke={t.comp} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="pct" name="Present" stroke={t.main} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No attendance marked in the last 30 days." />}
        </ChartCard>

        <ChartCard title="Attendance by class" subtitle="Last 30 days · lowest class highlighted">
          {d.class_attendance.length ? (
            <ResponsiveContainer>
              <BarChart data={d.class_attendance} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="class" {...axis(t)} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <Bar dataKey="pct" name="Attendance" radius={[4, 4, 0, 0]}>
                  {d.class_attendance.map(c => <Cell key={c.class_id} fill={c.pct === lowClass ? t.fail : t.main} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No class attendance yet." />}
        </ChartCard>

        <ChartCard title={"Results by class" + (d.results ? " - " + d.results.exam : "")} subtitle="Pass / compartment / fail · click a class to open the exam">
          {d.results?.by_class?.length ? (
            <ResponsiveContainer>
              <BarChart data={d.results.by_class} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                onClick={() => navigate("/exams/" + d.results.exam_id)} style={{ cursor: "pointer" }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="class" {...axis(t)} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="pass" name="Pass" stackId="r" fill={t.pass} />
                <Bar dataKey="compartment" name="Compartment" stackId="r" fill={t.comp} />
                <Bar dataKey="fail" name="Fail" stackId="r" fill={t.fail} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No exam compiled yet this year." />}
        </ChartCard>

        <ChartCard title="Class average" subtitle={d.results?.previous_exam ? d.results.exam + " vs " + d.results.previous_exam : "Latest exam"}>
          {d.results?.by_class?.length ? (
            <ResponsiveContainer>
              <BarChart data={d.results.by_class} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="class" {...axis(t)} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                {d.results.previous_exam && <Bar dataKey="prev_avg" name={d.results.previous_exam} fill={t.prev} radius={[4, 4, 0, 0]} />}
                <Bar dataKey="avg" name={d.results.exam} fill={t.main} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="Class averages appear once an exam is compiled." />}
        </ChartCard>

        <ChartCard title="Grade distribution" subtitle={d.results ? d.results.exam : "Latest exam"}>
          {d.results?.grades?.some(g => g.students) ? (
            <ResponsiveContainer>
              <BarChart data={d.results.grades} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="grade" {...axis(t)} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Bar dataKey="students" name="Students" radius={[4, 4, 0, 0]}>
                  {d.results.grades.map((g, i) => <Cell key={g.grade} fill={i === d.results.grades.length - 1 ? t.fail : t.series[i % t.series.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="Grades appear once an exam is compiled." />}
        </ChartCard>
      </div>
    </div>
  );
}
