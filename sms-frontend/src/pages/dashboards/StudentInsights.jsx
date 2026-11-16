import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell,
         RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner } from "../../components/dashboard/ChartKit";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }); };
const rs = (n) => "Rs. " + Number(n || 0).toLocaleString();

/** Student's own progress; for a parent, the same per child with a child switcher. */
export default function StudentInsights({ parent = false, childId = null, children }) {
  const t = useChartTheme();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { const r = await dashboardsApi.student(childId); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load progress."); }
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  // the schedule / children cards (children) always show, even while progress loads or if it fails
  if (error) return <div className="dk-wrap">{children}<EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap">{children}<EmptyChart text="Loading progress..." /></div>;

  const a = d.attendance;
  const pie = [
    { name: "Present", value: a.totals.present, color: t.pass }, { name: "Late", value: a.totals.late, color: t.main },
    { name: "Leave", value: a.totals.leave, color: t.prev }, { name: "Absent", value: a.totals.absent, color: t.fail },
  ].filter(x => x.value);
  const L = d.latest;
  const fees = d.fees;
  const resTone = L ? (L.result === "pass" ? "ok" : L.result === "compartment" ? "warn" : "bad") : "";
  const subjRows = d.subjects?.rows || [];
  const name = parent ? d.student.name.split(" ")[0] + "'s" : "My";
  // students: their own fees page; parents: the selected child's fees (My Fees needs ?studentId= for a parent)
  const feesLink = parent ? "/my-fees?studentId=" + d.student.id : "/my-fees";

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load}
        context={parent ? "Viewing " + d.student.name + (d.student.class ? " (" + d.student.class + ")" : "") : (d.academic_year ? "Academic year " + d.academic_year : null)}
        alert={d.results_withheld_months ? { tone: "bad", text: (parent ? d.student.name.split(" ")[0] + "'s results are" : "Your results are") + " withheld - fee for " + d.results_withheld_months + " month(s) is unpaid", onClick: () => navigate(feesLink) }
          : fees && fees.overdue ? { tone: "bad", text: rs(fees.overdue) + " of fee is overdue", onClick: () => navigate(feesLink) }
          : d.assignments.pending ? { tone: "warn", text: d.assignments.pending + " assignment" + (d.assignments.pending > 1 ? "s are" : " is") + " due soon", onClick: () => navigate("/assignments") }
          : d.assignments.missed ? { tone: "warn", text: d.assignments.missed + " assignment" + (d.assignments.missed > 1 ? "s were" : " was") + " missed this year" }
          : { tone: "ok", text: "All up to date - no fee overdue and no assignments pending." }}
        highlights={[
          { label: "Attendance this year", value: a.pct == null ? "-" : a.pct + "%", sub: a.days ? a.days + " school days" : "" },
          L && !d.results_withheld_months ? { label: "Class position · " + L.exam, value: L.position ? L.position + " / " + L.class_size : (L.grade || "-"), sub: L.pct + "% · Grade " + (L.grade || "-"), onClick: () => navigate("/exam-results") }
            : { label: "Latest result", value: d.results_withheld_months ? "Withheld" : "-", sub: d.results_withheld_months ? "Clear dues to view" : "Not published yet" },
          fees && { label: "Next fee due", value: fees.next_due ? new Date(fees.next_due + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Nothing due",
                    sub: fees.due ? rs(fees.due) + " outstanding" : "All paid", onClick: () => navigate(feesLink) },
        ].filter(Boolean)} />
      {children}

      <div className="dk-tiles">
        <StatTile label="Attendance this year" value={a.pct == null ? "-" : a.pct + "%"}
          tone={a.pct == null ? "" : a.pct >= 90 ? "ok" : a.pct >= 75 ? "warn" : "bad"} sub={a.days ? a.days + " school days recorded" : "No attendance yet"} />
        <StatTile label={L ? "Latest result · " + L.exam : "Latest result"} tone={resTone}
          value={d.results_withheld_months ? "Withheld" : L ? L.pct + "%" : "-"}
          sub={d.results_withheld_months ? "Fee unpaid " + d.results_withheld_months + " month(s)" : L ? "Grade " + (L.grade || "-") + (L.position ? " · Position " + L.position + "/" + L.class_size : "") : "No published result yet"}
          onClick={() => navigate(d.results_withheld_months ? "/my-fees" : "/exam-results")} />
        <StatTile label="Assignments" value={d.assignments.done + " done"} tone={d.assignments.missed ? "bad" : d.assignments.pending ? "warn" : "ok"}
          sub={(d.assignments.pending ? d.assignments.pending + " pending · " : "") + (d.assignments.missed ? d.assignments.missed + " missed" : "none missed")}
          onClick={() => navigate("/assignments")} />
        {fees && (
          <StatTile label="Fee due" value={rs(fees.due)} tone={fees.overdue ? "bad" : fees.due ? "warn" : "ok"}
            sub={fees.overdue ? rs(fees.overdue) + " overdue" : fees.next_due ? "Next due " + fees.next_due : "All paid"}
            onClick={() => navigate(feesLink)} />
        )}
      </div>

      {d.results_withheld_months > 0 && (
        <div className="dk-withheld">Results are withheld because fee for {d.results_withheld_months} month(s) is unpaid. They appear here as soon as the dues are cleared.</div>
      )}

      <div className="dk-grid">
        <ChartCard title={name + " attendance"} subtitle="This academic year">
          {pie.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                  {pie.map(p => <Cell key={p.name} fill={p.color} stroke="none" />)}
                </Pie>
                <ThemedTooltip t={t} suffix=" days" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No attendance recorded yet." />}
        </ChartCard>

        <ChartCard title="Attendance by month" subtitle="School days">
          {a.months.length ? (
            <ResponsiveContainer>
              <BarChart data={a.months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} />
                <YAxis allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="present" name="Present" stackId="a" fill={t.pass} />
                <Bar dataKey="late" name="Late" stackId="a" fill={t.main} />
                <Bar dataKey="leave" name="Leave" stackId="a" fill={t.prev} />
                <Bar dataKey="absent" name="Absent" stackId="a" fill={t.fail} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No attendance recorded yet." />}
        </ChartCard>

        <ChartCard title={name + " exam results"} subtitle="Compared with the class average">
          {d.exams.length ? (
            <ResponsiveContainer>
              <LineChart data={d.exams} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="exam" {...axis(t)} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Line type="monotone" dataKey="class_avg" name="Class average" stroke={t.prev} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="mine" name={parent ? d.student.name.split(" ")[0] : "Me"} stroke={t.main} strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart text={d.results_withheld_months ? "Results are withheld." : "No published results yet this year."} />}
        </ChartCard>

        <ChartCard title="Subject strengths" subtitle={d.subjects ? d.subjects.exam + " · compared with the class" : "Latest exam"}>
          {subjRows.length >= 3 ? (
            <ResponsiveContainer>
              <RadarChart data={subjRows} outerRadius="72%">
                <PolarGrid stroke={t.grid} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: t.muted, fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: t.muted, fontSize: 9 }} axisLine={false} />
                <Radar name="Class average" dataKey="class_avg" stroke={t.prev} fill={t.prev} fillOpacity={0.25} />
                <Radar name={parent ? d.student.name.split(" ")[0] : "Me"} dataKey="mine" stroke={t.main} fill={t.main} fillOpacity={0.35} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <ThemedTooltip t={t} suffix="%" />
              </RadarChart>
            </ResponsiveContainer>
          ) : subjRows.length ? (
            <ResponsiveContainer>
              <BarChart data={subjRows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="subject" {...axis(t)} />
                <YAxis domain={[0, 100]} {...axis(t)} />
                <ThemedTooltip t={t} suffix="%" />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="class_avg" name="Class average" fill={t.prev} radius={[4, 4, 0, 0]} />
                <Bar dataKey="mine" name={parent ? d.student.name.split(" ")[0] : "Me"} fill={t.main} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text={d.results_withheld_months ? "Results are withheld." : "Subject marks appear after results are published."} />}
        </ChartCard>

        <ChartCard title="Assignments & quizzes" subtitle="Done, pending and missed this year">
          {(d.assignments.done + d.assignments.pending + d.assignments.missed + (d.quizzes ? d.quizzes.done + d.quizzes.pending + d.quizzes.missed : 0)) ? (
            <ResponsiveContainer>
              <BarChart data={[
                  { k: "Assignments" + (d.assignments.avg != null ? " (" + d.assignments.avg + "%)" : ""), ...d.assignments },
                  ...(d.quizzes ? [{ k: "Quizzes" + (d.quizzes.avg != null ? " (" + d.quizzes.avg + "%)" : ""), ...d.quizzes }] : []),
                ]} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axis(t)} />
                <YAxis type="category" dataKey="k" width={130} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar dataKey="done" name="Done" stackId="w" fill={t.pass} />
                <Bar dataKey="pending" name="Pending" stackId="w" fill={t.comp} />
                <Bar dataKey="missed" name="Missed" stackId="w" fill={t.fail} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No assignments or quizzes yet." />}
        </ChartCard>

        <ChartCard title="Fee payments" subtitle="Paid per month (verified payments)">
          {fees?.history?.length ? (
            <ResponsiveContainer>
              <BarChart data={fees.history} margin={{ top: 8, right: 8, left: 6, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} />
                <YAxis {...axis(t)} tickFormatter={v => v >= 1000 ? v / 1000 + "k" : v} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Bar dataKey="paid" name="Paid (Rs.)" fill={t.pass} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No fee payments recorded yet." />}
        </ChartCard>
      </div>
    </div>
  );
}
