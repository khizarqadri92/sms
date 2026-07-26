import React, { useState, useEffect, useCallback } from "react";
import reportsApi from "../api/reportsApi";
import hrApi from "../api/hrApi";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const STATUS_LABELS = {
  present: "Present", weekly_off: "Weekly Off", holiday: "Holiday",
  on_leave: "On Leave", absent: "Absent", half_day: "Half Day", pending: "Pending",
};
const STATUS_COLORS = {
  present: { bg: "#f0fdf4", color: "#166534" },
  weekly_off: { bg: "#f8fafc", color: "#64748b" },
  holiday: { bg: "#eff6ff", color: "#1d4ed8" },
  on_leave: { bg: "#fef3c7", color: "#92400e" },
  absent: { bg: "#fef2f2", color: "#dc2626" },
  half_day: { bg: "#fff7ed", color: "#c2410c" },
  pending: { bg: "#f8fafc", color: "#94a3b8" },
};

function toLocalDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function EmployeeAttendance() {
  const now = new Date();
  const [reportType, setReportType] = useState("monthly");
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [date, setDate] = useState(toLocalDateStr(now));

  const [directory, setDirectory] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedStaff, setSelectedStaff] = useState(null);
  const [monthlyDetail, setMonthlyDetail] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    hrApi.getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  const loadMonthlyList = useCallback(() => {
    setLoading(true);
    reportsApi.getAttendanceDirectory({
      department_id: deptFilter || undefined,
      search: search || undefined,
    }).then(r => setDirectory(r.data.data || [])).catch(() => setDirectory([])).finally(() => setLoading(false));
  }, [deptFilter, search]);

  const loadDailyList = useCallback(() => {
    setLoading(true);
    reportsApi.getAttendanceDaily({
      date, department_id: deptFilter || undefined,
    }).then(r => setDailyData(r.data.data || [])).catch(() => setDailyData([])).finally(() => setLoading(false));
  }, [date, deptFilter]);

  useEffect(() => {
    if (reportType === "monthly") loadMonthlyList();
    else loadDailyList();
  }, [reportType, loadMonthlyList, loadDailyList]);

  const filteredDaily = search
    ? dailyData.filter(d =>
        (d.first_name + " " + d.last_name).toLowerCase().includes(search.toLowerCase()))
    : dailyData;

  const openMonthlyDetail = (staff) => {
    setSelectedStaff(staff);
    setDetailLoading(true);
    reportsApi.getAttendanceMonthly(staff.id, { month, year })
      .then(r => setMonthlyDetail(r.data.data || []))
      .catch(() => setMonthlyDetail([]))
      .finally(() => setDetailLoading(false));
  };

  const summary = (() => {
    const counts = {};
    monthlyDetail.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });
    return counts;
  })();

  return (
    <div style={{ maxWidth: 950, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Attendance Report</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Monthly or daily attendance, filterable by department and employee</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["monthly", "Monthly Report"], ["daily", "Daily Report"]].map(([val, label]) => (
          <button key={val} onClick={() => setReportType(val)}
            className={reportType === val ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            style={reportType === val ? { color: "#fff" } : {}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Department</label>
          <select className="form-input" style={{ fontSize: 13, width: 180 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Employee (name or code)</label>
          <input className="form-input" style={{ fontSize: 13, width: 200 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {reportType === "monthly" ? (
          <>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Month</label>
              <select className="form-input" style={{ fontSize: 13, width: 150 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Year</label>
              <input type="number" className="form-input" style={{ fontSize: 13, width: 100 }} value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
          </>
        ) : (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Date</label>
            <input type="date" className="form-input" style={{ fontSize: 13 }} value={date} max={toLocalDateStr(new Date())} onChange={e => setDate(e.target.value)} />
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading...</div>
      ) : reportType === "monthly" ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Employee", "Code", "Department", "Designation", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {directory.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{s.first_name} {s.last_name}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{s.employee_code || "-"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{s.department_name || "-"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{s.designation_name || "-"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openMonthlyDetail(s)}>View Month</button>
                  </td>
                </tr>
              ))}
              {directory.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No employees found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Employee", "Department", "Status", "Hours"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDaily.map(s => {
                const colors = STATUS_COLORS[s.status] || STATUS_COLORS.pending;
                return (
                  <tr key={s.staff_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{s.first_name} {s.last_name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{s.department_name || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: colors.bg, color: colors.color }}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                      {s.is_late && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#fef2f2", color: "#dc2626" }}>Late</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{Number(s.total_hours || 0).toFixed(1)}</td>
                  </tr>
                );
              })}
              {filteredDaily.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No data found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedStaff && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setSelectedStaff(null)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedStaff.first_name} {selectedStaff.last_name} - {MONTH_NAMES[month - 1]} {year}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStaff(null)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {detailLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Loading...</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                    {Object.entries(summary).map(([status, count]) => (
                      <div key={status} style={{
                        fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 10,
                        background: (STATUS_COLORS[status] || STATUS_COLORS.pending).bg,
                        color: (STATUS_COLORS[status] || STATUS_COLORS.pending).color,
                      }}>
                        {STATUS_LABELS[status] || status}: {count}
                      </div>
                    ))}
                  </div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Date", "Status", "Sessions"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyDetail.map(d => {
                          const colors = STATUS_COLORS[d.status] || STATUS_COLORS.pending;
                          return (
                            <tr key={d.status_date} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 10px", fontSize: 12 }}>{new Date(d.status_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: colors.bg, color: colors.color }}>
                                  {STATUS_LABELS[d.status] || d.status}
                                </span>
                                {d.is_late && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#dc2626" }}>Late</span>}
                              </td>
                              <td style={{ padding: "6px 10px", fontSize: 12, color: "#64748b" }}>{d.session_count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
