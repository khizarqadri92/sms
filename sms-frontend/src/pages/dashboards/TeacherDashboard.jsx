import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell, ReferenceLine } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

/** Teacher: only their own classes, subjects and assignments. */
export default function TeacherDashboard() {
  const t = useChartTheme();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.teacher(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the dashboard."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading dashboard..." /></div>;

  const tl = d.tiles;
  const unmarked = tl.incharge_attendance.filter(c => !c.marked);
  const sr = d.subject_results;

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={unmarked.length ? { tone: "bad", text: "Attendance not marked yet today for " + unmarked.map(c => c.class).join(", "), onClick: () => navigate("/attendance") }
      : tl.to_grade ? { tone: "warn", text: tl.to_grade + " submission" + (tl.to_grade > 1 ? "s are" : " is") + " waiting for your marks", onClick: () => navigate("/assignments") }
      : { tone: "ok", text: "You're all set - attendance marked and nothing to grade." }}
        highlights={[
      { label: "My students", value: tl.students, sub: tl.classes + " class" + (tl.classes === 1 ? "" : "es") },
      { label: "To grade", value: tl.to_grade, sub: "Assignment submissions", onClick: () => navigate("/assignments") },
      { label: "Need attention", value: d.attention.length, sub: "Low marks or attendance" },
    ]} />

      <div className="dk-tiles">
        <StatTile label="My classes" value={tl.classes} sub={tl.students + " students"} onClick={() => navigate("/classes")} />
        {tl.incharge_attendance.length > 0 && (
          <StatTile label="Attendance today" tone={unmarked.length ? "warn" : "ok"}
            value={unmarked.length ? "Not marked" : "Marked"}
            sub={unmarked.length ? unmarked.map(c => c.class).join(", ") : tl.incharge_attendance.map(c => c.class).join(", ")}
            onClick={() => navigate("/attendance")} />
        )}
        <StatTile label="Submissions to grade" value={tl.to_grade} tone={tl.to_grade ? "warn" : "ok"}
          sub={tl.to_grade ? "Waiting for your marks" : "All graded"} onClick={() => navigate("/assignments")} />
        <StatTile label="Students needing attention" value={d.attention.length} tone={d.attention.length ? "bad" : "ok"} />
      </div>

      <div className="dk-grid">
        <ChartCard title="Attendance - my classes" subtitle="Last 30 days · one line per class" span={2}>
          {d.attendance.points.length ? (
            <ResponsiveContainer>
              <LineChart data={d.attendance.points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} {...axis(t)} minTickGap={20} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" labelFormatter={fmtDay} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <ReferenceLine y={75} stroke={t.comp} strokeDasharray="4 4" />
                {d.attendance.series.map((s, i) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={t.series[i % t.series.length]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No attendance marked in your classes in the last 30 days." />}
        </ChartCard>

        <ChartCard title="My subject results" subtitle={sr ? "Average % · " + sr.exam + (sr.previous_exam ? " vs " + sr.previous_exam : "") : "Latest exam"}>
          {sr?.rows?.length ? (
            <ResponsiveContainer>
              <BarChart data={sr.rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="label" {...axis(t)} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <ReferenceLine y={d.passing_pct} stroke={t.fail} strokeDasharray="4 4" />
                {sr.previous_exam && <Bar dataKey="prev_avg" name={sr.previous_exam} fill={t.prev} radius={[4, 4, 0, 0]} />}
                <Bar dataKey="avg" name={sr.exam} fill={t.main} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="Your subject results appear once an exam is compiled." />}
        </ChartCard>

        <ChartCard title="Score distribution" subtitle={d.distribution ? "Your subjects · " + d.distribution.exam : "Latest exam"}>
          {d.distribution?.bands?.some(b => b.students) ? (
            <ResponsiveContainer>
              <BarChart data={d.distribution.bands} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="band" {...axis(t)} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Bar dataKey="students" name="Students" radius={[4, 4, 0, 0]}>
                  {d.distribution.bands.map((b, i) => <Cell key={b.band} fill={i === 0 ? t.fail : i >= 5 ? t.pass : t.main} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No marks in your subjects yet." />}
        </ChartCard>

        <ChartCard title="My assignments" subtitle="Latest 8 · graded / to grade / missing">
          {d.assignments.length ? (
            <ResponsiveContainer>
              <BarChart data={d.assignments} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axis(t)} />
                <YAxis type="category" dataKey="label" width={150} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="graded" name="Graded" stackId="s" fill={t.pass} />
                <Bar dataKey="to_grade" name="To grade" stackId="s" fill={t.comp} />
                <Bar dataKey="missing" name="Missing" stackId="s" fill={t.fail} />
                <Bar dataKey="not_due" name="Not due yet" stackId="s" fill={t.prev} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="You haven't set any assignments yet." />}
        </ChartCard>

        <div className="dk-card">
          <div className="dk-card-head"><div><div className="dk-card-title">Students needing attention</div>
            <div className="dk-card-sub">Below {d.passing_pct}% in your subject, absent, or under 75% attendance</div></div></div>
          {d.attention.length ? (
            <div className="dk-table-wrap">
              <table className="dk-table">
                <thead><tr><th>Student</th><th>Class</th><th>Why</th></tr></thead>
                <tbody>{d.attention.map(s => (
                  <tr key={s.enrollment_no + s.class}>
                    <td><b>{s.student}</b><div className="dk-card-sub">{s.enrollment_no}</div></td>
                    <td>{s.class}</td>
                    <td>{s.reasons.map(r => <span key={r} className="dk-chip">{r}</span>)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyChart text="No students flagged in your classes." />}
        </div>
      </div>
    </div>
  );
}
