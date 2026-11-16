import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell, ReferenceLine } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

/** Academic coordinator: marks progress, subject performance, exam trend, work completion, at-risk students. */
export default function CoordinatorDashboard() {
  const t = useChartTheme();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.coordinator(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the dashboard."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading dashboard..." /></div>;

  const mp = d.marks_progress;
  const papers = mp ? mp.by_class.reduce((a, c) => a + c.papers, 0) : 0;
  const done = mp ? mp.by_class.reduce((a, c) => a + c.submitted, 0) : 0;
  const weakest = d.subject_performance?.subjects?.[0];

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={mp && done < papers ? { tone: "warn", text: (papers - done) + " paper" + (papers - done > 1 ? "s" : "") + " still need marks in " + mp.exam, onClick: () => navigate("/exams/" + mp.exam_id) }
      : d.at_risk.length ? { tone: "bad", text: d.at_risk.length + " student" + (d.at_risk.length > 1 ? "s need" : " needs") + " attention - below passing, a big drop, or low attendance" }
      : { tone: "ok", text: mp ? "All marks for " + mp.exam + " are submitted." : "No exam is waiting for marks." }}
        highlights={[
      mp && { label: "Marks submitted · " + mp.exam, value: Math.round(100 * done / (papers || 1)) + "%", sub: done + " of " + papers + " papers", onClick: () => navigate("/exams/" + mp.exam_id) },
      { label: "Students at risk", value: d.at_risk.length, sub: "Below " + d.passing_pct + "% or falling" },
      d.subject_performance?.subjects?.length && (() => { const s = d.subject_performance.subjects; const best = s[s.length - 1];
        return { label: "Strongest subject", value: best.subject, sub: best.avg + "% average · " + d.subject_performance.exam }; })(),
    ].filter(Boolean)} />

      <div className="dk-tiles">
        <StatTile label={mp ? "Marks submitted · " + mp.exam : "Marks entry"} value={mp ? done + " / " + papers : "None open"}
          tone={mp ? (done === papers ? "ok" : "warn") : ""} sub={mp ? Math.round(100 * done / (papers || 1)) + "% of papers" : "No exam is open for marks"}
          onClick={mp ? () => navigate("/exams/" + mp.exam_id) : undefined} />
        <StatTile label="Weakest subject" value={weakest ? weakest.subject : "-"} tone={weakest && weakest.avg < d.passing_pct + 10 ? "bad" : ""}
          sub={weakest ? weakest.avg + "% average · " + d.subject_performance.exam : "No exam compiled yet"} />
        <StatTile label="Students at risk" value={d.at_risk.length} tone={d.at_risk.length ? "bad" : "ok"}
          sub={"Below " + d.passing_pct + "%, big drop or low attendance"} />
      </div>

      <div className="dk-grid">
        <div className="dk-card">
          <div className="dk-card-head">
            <div><div className="dk-card-title">Marks entry progress</div>
              <div className="dk-card-sub">{mp ? mp.exam + " · papers with marks submitted" : "No exam is currently open for marks."}</div></div>
            {mp && <button className="dk-link" onClick={() => navigate("/exams/" + mp.exam_id)}>Open exam</button>}
          </div>
          {mp?.by_class?.length ? mp.by_class.map(c => (
            <div key={c.class} className="dk-prow">
              <span>{c.class}</span>
              <div className="dk-progress"><span style={{ width: c.pct + "%", background: c.pct === 100 ? t.pass : c.pct >= 50 ? t.main : t.comp }} /></div>
              <span className="dk-prow-val">{c.submitted}/{c.papers}</span>
            </div>
          )) : <EmptyChart text="Progress appears when an exam is open for marks." />}
        </div>

        <ChartCard title="Subject performance" subtitle={d.subject_performance ? "Average % · " + d.subject_performance.exam : "Latest exam"}>
          {d.subject_performance?.subjects?.length ? (
            <ResponsiveContainer>
              <BarChart data={d.subject_performance.subjects} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} {...axis(t)} />
                <YAxis type="category" dataKey="subject" width={90} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <ReferenceLine x={d.passing_pct} stroke={t.fail} strokeDasharray="4 4" />
                <Bar dataKey="avg" name="Average" radius={[0, 4, 4, 0]}>
                  {d.subject_performance.subjects.map(s => <Cell key={s.subject} fill={s.avg < d.passing_pct + 10 ? t.comp : t.main} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No exam compiled yet this year." />}
        </ChartCard>

        <ChartCard title="Class averages across the year" subtitle="Each line is a class" span={2}>
          {d.exam_trend?.points?.length ? (
            <ResponsiveContainer>
              <LineChart data={d.exam_trend.points} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="exam" {...axis(t)} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                {d.exam_trend.series.map((s, i) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={t.series[i % t.series.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="The trend appears once exams are compiled." />}
        </ChartCard>

        <ChartCard title="Assignments & quizzes" subtitle="Submitted vs missed (work already due)">
          {d.work.length ? (
            <ResponsiveContainer>
              <BarChart data={d.work} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="class" {...axis(t)} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="assignments_done" name="Assignments submitted" stackId="a" fill={t.pass} />
                <Bar dataKey="assignments_missed" name="Assignments missed" stackId="a" fill={t.fail} />
                <Bar dataKey="quizzes_done" name="Quizzes taken" stackId="q" fill={t.main} />
                <Bar dataKey="quizzes_missed" name="Quizzes missed" stackId="q" fill={t.comp} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No assignments or quizzes are due yet." />}
        </ChartCard>

        <div className="dk-card">
          <div className="dk-card-head"><div><div className="dk-card-title">Students needing attention</div>
            <div className="dk-card-sub">Latest exam and last 30 days of attendance</div></div></div>
          {d.at_risk.length ? (
            <div className="dk-table-wrap">
              <table className="dk-table">
                <thead><tr><th>Student</th><th>Class</th><th>Latest %</th><th>Why</th></tr></thead>
                <tbody>{d.at_risk.map(s => (
                  <tr key={s.enrollment_no + s.student}>
                    <td><b>{s.student}</b><div className="dk-card-sub">{s.enrollment_no}</div></td>
                    <td>{s.class}</td>
                    <td>{s.pct}%{s.prev_pct != null && <div className="dk-card-sub">was {s.prev_pct}%</div>}</td>
                    <td>{s.reasons.map(r => <span key={r} className="dk-chip">{r}</span>)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyChart text="No students flagged - nice." />}
        </div>
      </div>
    </div>
  );
}
