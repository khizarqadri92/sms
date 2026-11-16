import { useState, useEffect, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import admissionsApi from "../api/admissionsApi";
import DatePicker from "../components/DatePicker";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner } from "../components/dashboard/ChartKit";
import "./Admissions.css";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + y.slice(2); };
const CARDS = [
  ["total", "Total Applications", ""], ["new", "New Applications", "warn"], ["under_review", "Under Review", ""],
  ["pending_documents", "Pending Documents", "warn"], ["test_scheduled", "Test Scheduled", ""], ["interview_scheduled", "Interview Scheduled", ""],
  ["awaiting_approval", "Awaiting Principal Approval", "warn"], ["approved", "Approved", "ok"], ["rejected", "Rejected", "bad"],
  ["waiting_list", "Waiting List", ""], ["pending_fee", "Pending Fee Payment", "warn"], ["completed", "Completed Admissions", "ok"],
];
const STATUS_GROUPS = [["", "All statuses"], ["new", "New"], ["under_review", "Under review"], ["pending_documents", "Pending documents"],
  ["test_scheduled", "Test scheduled"], ["interview_scheduled", "Interview scheduled"], ["awaiting_approval", "Awaiting approval"],
  ["approved", "Approved"], ["rejected", "Rejected"], ["waiting_list", "Waiting list"], ["pending_fee", "Pending fee"], ["completed", "Completed"]];

/** Admission staff dashboard: KPIs, charts and filters (session, campus, class, status, dates, staff member). */
export default function AdmissionDashboard({ embedded = false }) {
  const t = useChartTheme();
  const [meta, setMeta] = useState(null);
  const [staff, setStaff] = useState([]);
  const [classes, setClasses] = useState([]);
  const [f, setF] = useState({ academic_year_id: "", campus: "", class_name: "", status: "", date_from: "", date_to: "", assigned_to: "" });
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    admissionsApi.years().then(r => {
      const m = r.data.data; setMeta(m);
      setF(x => ({ ...x, campus: m.campus_id || "", academic_year_id: m.default_year || "" }));
    }).catch(() => {});
    admissionsApi.staff().then(r => setStaff(r.data.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!f.campus) { setClasses([]); return; }
    admissionsApi.getSettings({ campus: f.campus, ...(f.academic_year_id ? { academic_year_id: f.academic_year_id } : {}) })
      .then(r => setClasses((r.data.data.classes || []).map(c => c.class_name))).catch(() => setClasses([]));
  }, [f.campus, f.academic_year_id]);

  const load = useCallback(async () => {
    if (!meta) return;
    setLoading(true); setError("");
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "" && v !== null));
    try { const r = await admissionsApi.dashboard(params); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the dashboard."); }
    finally { setLoading(false); }
  }, [f, meta]);
  useEffect(() => { load(); }, [load]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const k = d?.kpis || {};
  const alert = !d ? null
    : k.awaiting_approval ? { tone: "warn", text: k.awaiting_approval + " application" + (k.awaiting_approval > 1 ? "s are" : " is") + " waiting for the principal's decision" }
    : k.new ? { tone: "warn", text: k.new + " new application" + (k.new > 1 ? "s" : "") + " to review" }
    : k.pending_documents ? { tone: "warn", text: k.pending_documents + " application" + (k.pending_documents > 1 ? "s are" : " is") + " waiting for corrected documents" }
    : { tone: "ok", text: "Nothing waiting - all applications are moving." };

  return (
    <div className={embedded ? "" : "am-page"}>
      <div className="dk-wrap">
        {d && <HeroBanner today={d.today} onRefresh={load} loading={loading} context="Admissions" alert={alert}
          highlights={[
            { label: "Applications", value: k.total, sub: (k.new || 0) + " new" },
            { label: "Approval rate", value: d.conversion.approval_rate != null ? d.conversion.approval_rate + "%" : "-", sub: "of decided applications" },
            { label: "Completed admissions", value: k.completed, sub: d.conversion.rate != null ? d.conversion.rate + "% of applications" : "" },
          ]} />}

        <div className="am-card">
          <div className="am-filters">
            {meta && !meta.campus_id && (
              <label className="am-field">Campus
                <select className="am-input" value={f.campus} onChange={e => set("campus", e.target.value)}>
                  <option value="">All campuses</option>
                  {meta.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="am-field">Session
              <select className="am-input" value={f.academic_year_id} onChange={e => set("academic_year_id", e.target.value)}>
                <option value="">All sessions</option>
                {(meta?.years || []).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </label>
            <label className="am-field">Class
              <select className="am-input" value={f.class_name} onChange={e => set("class_name", e.target.value)} disabled={!classes.length}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="am-field">Status
              <select className="am-input" value={f.status} onChange={e => set("status", e.target.value)}>
                {STATUS_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <div className="am-field">From
              <DatePicker value={f.date_from} placeholder="Any date" max={f.date_to || undefined}
                onChange={v => setF(x => ({ ...x, date_from: v, date_to: x.date_to && v && x.date_to < v ? "" : x.date_to }))} />
            </div>
            <div className="am-field">To
              <DatePicker value={f.date_to} placeholder="Any date" min={f.date_from || undefined} onChange={v => set("date_to", v)} />
            </div>
            <label className="am-field">Staff member
              <select className="am-input" value={f.assigned_to} onChange={e => set("assigned_to", e.target.value)}>
                <option value="">Anyone</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        {error && <EmptyChart text={error} />}
        {d && (
          <>
            <div className="dk-tiles">
              {CARDS.map(([key, label, tone]) => (
                <StatTile key={key} label={label} value={k[key] ?? 0} tone={k[key] ? tone : ""}
                  onClick={key === "total" ? undefined : () => set("status", key)} />
              ))}
            </div>

            <div className="dk-grid">
              <ChartCard title="Monthly applications" subtitle="Last 12 months · applications vs completed admissions" span={2}>
                {d.monthly.some(m => m.applications) ? (
                  <ResponsiveContainer>
                    <LineChart data={d.monthly} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={t.grid} vertical={false} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                      <YAxis allowDecimals={false} {...axis(t)} />
                      <ThemedTooltip t={t} labelFormatter={monthLabel} />
                      <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                      <Line type="monotone" dataKey="applications" name="Applications" stroke={t.main} strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="completed" name="Completed" stroke={t.pass} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No applications in the last 12 months." />}
              </ChartCard>

              <ChartCard title="Class-wise applications" subtitle="Approved / in progress / rejected">
                {d.by_class.length ? (
                  <ResponsiveContainer>
                    <BarChart data={d.by_class} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={t.grid} vertical={false} />
                      <XAxis dataKey="class" {...axis(t)} interval={0} />
                      <YAxis allowDecimals={false} {...axis(t)} />
                      <ThemedTooltip t={t} />
                      <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                      <Bar dataKey="approved" name="Approved" stackId="c" fill={t.pass} />
                      <Bar dataKey="in_progress" name="In progress" stackId="c" fill={t.main} />
                      <Bar dataKey="rejected" name="Rejected" stackId="c" fill={t.fail} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No applications yet." />}
              </ChartCard>

              <ChartCard title="Status distribution" subtitle="Where applications are right now">
                {d.status_distribution.length ? (
                  <ResponsiveContainer>
                    <BarChart data={d.status_distribution} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke={t.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} {...axis(t)} />
                      <YAxis type="category" dataKey="status" width={160} {...axis(t)} />
                      <ThemedTooltip t={t} />
                      <Bar dataKey="count" name="Applications" radius={[0, 4, 4, 0]}>
                        {d.status_distribution.map((s, i) => <Cell key={s.key} fill={t.series[i % t.series.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No applications yet." />}
              </ChartCard>

              <ChartCard title="Gender" subtitle="Applicants">
                {d.gender.length ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={d.gender} dataKey="count" nameKey="gender" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
                        {d.gender.map((g, i) => <Cell key={g.gender} fill={t.series[i % t.series.length]} stroke="none" />)}
                      </Pie>
                      <ThemedTooltip t={t} />
                      <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No applications yet." />}
              </ChartCard>

              <ChartCard title="Admission test results" subtitle="Pass / fail / absent">
                {d.tests.pass + d.tests.fail + d.tests.absent ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={[{ n: "Pass", v: d.tests.pass, c: t.pass }, { n: "Fail", v: d.tests.fail, c: t.fail }, { n: "Absent", v: d.tests.absent, c: t.prev }].filter(x => x.v)}
                        dataKey="v" nameKey="n" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
                        {[{ c: t.pass, v: d.tests.pass }, { c: t.fail, v: d.tests.fail }, { c: t.prev, v: d.tests.absent }].filter(x => x.v).map((x, i) => <Cell key={i} fill={x.c} stroke="none" />)}
                      </Pie>
                      <ThemedTooltip t={t} />
                      <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No test results yet." />}
              </ChartCard>

              <ChartCard title="Interview results" subtitle="Panel recommendations">
                {d.interviews.recommended + d.interviews.not_recommended + d.interviews.further_review ? (
                  <ResponsiveContainer>
                    <BarChart data={[{ r: "Recommended", n: d.interviews.recommended }, { r: "Not recommended", n: d.interviews.not_recommended }, { r: "Further review", n: d.interviews.further_review }]}
                      margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={t.grid} vertical={false} />
                      <XAxis dataKey="r" {...axis(t)} />
                      <YAxis allowDecimals={false} {...axis(t)} />
                      <ThemedTooltip t={t} />
                      <Bar dataKey="n" name="Applicants" radius={[4, 4, 0, 0]}>
                        <Cell fill={t.pass} /><Cell fill={t.fail} /><Cell fill={t.comp} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart text="No interview results yet." />}
              </ChartCard>

              <ChartCard title="Admission conversion" subtitle="From application to completed admission">
                <div className="dk-tiles" style={{ height: "100%", alignContent: "center" }}>
                  <StatTile label="Applications" value={k.total} />
                  <StatTile label="Approved" value={k.approved} tone="ok" sub={d.conversion.approval_rate != null ? d.conversion.approval_rate + "% approval rate" : ""} />
                  <StatTile label="Completed" value={k.completed} tone="ok" sub={d.conversion.rate != null ? d.conversion.rate + "% conversion" : ""} />
                </div>
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
