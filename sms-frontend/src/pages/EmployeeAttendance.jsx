import React, { useState, useEffect, useCallback, useRef } from "react";
import reportsApi from "../api/reportsApi";
import hrApi from "../api/hrApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";
import DatePicker from "../components/DatePicker";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./EmployeeAttendance.css";

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
  const { formatDate } = useRegionalSettings();
  const processingToday = useProcessingToday();
  const now = new Date(processingToday);
  const [reportType, setReportType] = useState("monthly");
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [date, setDate] = useState(toLocalDateStr(now));
  // useProcessingToday() starts with the browser's local date and corrects
  // itself asynchronously once the real processing date is fetched - but
  // month/year/date above only read it once via useState's initializer, so
  // without this they would stay stuck on the local-date fallback forever.
  // This runs again (and only again) when processingToday's value actually
  // changes - i.e. once, when the real value replaces the initial fallback.
  useEffect(() => {
    const d = new Date(processingToday);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
    setDate(toLocalDateStr(d));
  }, [processingToday]);

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

  const monthlyColumns = [
    { label: "Employee", value: s => `${s.first_name} ${s.last_name}` },
    { label: "Code", value: s => s.employee_code || "-" },
    { label: "Department", value: s => s.department_name || "-" },
    { label: "Designation", value: s => s.designation_name || "-" },
  ];
  const dailyColumns = [
    { label: "Employee", value: s => `${s.first_name} ${s.last_name}` },
    { label: "Department", value: s => s.department_name || "-" },
    { label: "Status", value: s => STATUS_LABELS[s.status] || s.status },
    { label: "Hours", value: s => Number(s.total_hours || 0).toFixed(1) },
  ];
  const exportColumns = reportType === "monthly" ? monthlyColumns : dailyColumns;
  const exportRows = reportType === "monthly" ? directory : filteredDaily;

  return (
    <div className="ea-page">
      <div className="ea-header">
        <div className="ea-title">Attendance Report</div>
        <div className="ea-subtitle">Monthly or daily attendance, filterable by department and employee</div>
      </div>

      <div className="ea-type-toggle-row">
        {[["monthly", "Monthly Report"], ["daily", "Daily Report"]].map(([val, label]) => (
          <button key={val} onClick={() => setReportType(val)}
            className={reportType === val ? "btn btn-primary btn-sm ea-toggle-active" : "btn btn-ghost btn-sm"}>
            {label}
          </button>
        ))}
      </div>

      <div className="no-print ea-export-row">
        <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(exportColumns, exportRows, "Employee_Attendance")}>Export CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Employee Attendance", exportColumns, exportRows, "Employee_Attendance")}>Export PDF</button>
      </div>

      <div className="no-print ea-filter-row">
        <div>
          <label className="ea-field-label">Department</label>
          <select className="form-input ea-dept-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="ea-field-label">Employee (name or code)</label>
          <input className="form-input ea-search-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {reportType === "monthly" ? (
          <>
            <div>
              <label className="ea-field-label">Month</label>
              <select className="form-input ea-month-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="ea-field-label">Year</label>
              <input type="number" className="form-input ea-year-input" value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
          </>
        ) : (
          <div>
            <label className="ea-field-label">Date</label>
            <DatePicker style={{ fontSize: 13 }} value={date} max={processingToday} onChange={val => setDate(val)} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="ea-loading-text">Loading...</div>
      ) : reportType === "monthly" ? (
        <div className="ea-table-wrap">
          <table className="ea-table">
            <thead>
              <tr className="ea-th-row">
                {["Employee", "Code", "Department", "Designation", ""].map(h => (
                  <th key={h} className="ea-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {directory.map(s => (
                <tr key={s.id} className="ea-tr">
                  <td className="ea-td-bold">{s.first_name} {s.last_name}</td>
                  <td className="ea-td-muted">{s.employee_code || "-"}</td>
                  <td className="ea-td-muted">{s.department_name || "-"}</td>
                  <td className="ea-td-muted">{s.designation_name || "-"}</td>
                  <td className="ea-td">
                    <button className="btn btn-ghost btn-sm ea-view-btn" onClick={() => openMonthlyDetail(s)}>View Month</button>
                  </td>
                </tr>
              ))}
              {directory.length === 0 && (
                <tr><td colSpan={5} className="ea-empty-row">No employees found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ea-table-wrap">
          <table className="ea-table">
            <thead>
              <tr className="ea-th-row">
                {["Employee", "Department", "Status", "Hours"].map(h => (
                  <th key={h} className="ea-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDaily.map(s => {
                const colors = STATUS_COLORS[s.status] || STATUS_COLORS.pending;
                return (
                  <tr key={s.staff_id} className="ea-tr">
                    <td className="ea-td-bold">{s.first_name} {s.last_name}</td>
                    <td className="ea-td-muted">{s.department_name || "-"}</td>
                    <td className="ea-td">
                      <span className="ea-status-badge" style={{ "--badge-bg": colors.bg, "--badge-color": colors.color }}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                      {s.is_late && (
                        <span className="ea-late-badge">Late</span>
                      )}
                    </td>
                    <td className="ea-hours-td">{Number(s.total_hours || 0).toFixed(1)}</td>
                  </tr>
                );
              })}
              {filteredDaily.length === 0 && (
                <tr><td colSpan={4} className="ea-empty-row">No data found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedStaff && (
        <div className="ea-modal-overlay"
          onClick={() => setSelectedStaff(null)}>
          <div className="ea-modal-box"
            onClick={e => e.stopPropagation()}>
            <div className="ea-modal-header">
              <div className="ea-modal-title">{selectedStaff.first_name} {selectedStaff.last_name} - {MONTH_NAMES[month - 1]} {year}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStaff(null)}>Close</button>
            </div>
            <div className="ea-modal-body">
              {detailLoading ? (
                <div className="ea-modal-loading">Loading...</div>
              ) : (
                <>
                  <div className="ea-summary-row">
                    {Object.entries(summary).map(([status, count]) => (
                      <div key={status} className="ea-summary-chip" style={{
                        "--chip-bg": (STATUS_COLORS[status] || STATUS_COLORS.pending).bg,
                        "--chip-color": (STATUS_COLORS[status] || STATUS_COLORS.pending).color,
                      }}>
                        {STATUS_LABELS[status] || status}: {count}
                      </div>
                    ))}
                  </div>
                  <div className="ea-detail-table-wrap">
                    <table className="ea-table">
                      <thead>
                        <tr className="ea-th-row">
                          {["Date", "Status", "Sessions"].map(h => (
                            <th key={h} className="ea-detail-th">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyDetail.map(d => {
                          const colors = STATUS_COLORS[d.status] || STATUS_COLORS.pending;
                          return (
                            <tr key={d.status_date} className="ea-tr">
                              <td className="ea-detail-td">{(() => { const dd = new Date(d.status_date + "T00:00:00"); return `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dd.getDay()]}, ${formatDate(dd)}`; })()}</td>
                              <td className="ea-detail-td">
                                <span className="ea-detail-status-badge" style={{ "--badge-bg": colors.bg, "--badge-color": colors.color }}>
                                  {STATUS_LABELS[d.status] || d.status}
                                </span>
                                {d.is_late && <span className="ea-detail-late-text">Late</span>}
                              </td>
                              <td className="ea-detail-sessions-td">{d.session_count}</td>
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
