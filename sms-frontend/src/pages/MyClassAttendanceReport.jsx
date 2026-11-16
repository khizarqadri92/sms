import { useState, useEffect } from "react";
import attendanceApi from "../api/attendanceApi";
import processingDateApi from "../api/processingDateApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./MyClassAttendanceReport.css";

export default function MyClassAttendanceReport() {
  const { formatDate } = useRegionalSettings();
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [report, setReport] = useState([]);
  const [withdrawn, setWithdrawn] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    processingDateApi.get().then(r => {
      const today = r.data.data.current_processing_date;
      const monthStart = today.slice(0, 8) + "01";
      setFromDate(monthStart);
      setToDate(today);
    }).catch(() => {
      const d = new Date();
      const iso = d.toISOString().slice(0, 10);
      setFromDate(iso.slice(0, 8) + "01");
      setToDate(iso);
    });
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    attendanceApi.getTeacherReport({ from: fromDate, to: toDate })
      .then(r => {
        setReport(r.data.data?.report || []);
        setWithdrawn(r.data.data?.withdrawn_students || []);
      })
      .catch(() => { setReport([]); setWithdrawn([]); })
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  return (
    <div className="mar-page">
      <div className="mar-head">
        <div className="mar-title">Attendance Report</div>
        <div className="mar-sub">Student attendance summary for the classes you are incharge of</div>
      </div>

      <div className="mar-filters">
        <div>
          <label className="mar-label">From</label>
          <DatePicker value={fromDate} onChange={setFromDate} max={toDate || undefined} style={{ width: 150 }} />
        </div>
        <div>
          <label className="mar-label">To</label>
          <DatePicker value={toDate} onChange={setToDate} min={fromDate || undefined} style={{ width: 150 }} />
        </div>
      </div>

      {loading && <div className="mar-placeholder">Loading...</div>}

      {!loading && report.length === 0 && (
        <div className="mar-placeholder">
          You are not currently the incharge of any class.
        </div>
      )}

      {!loading && report.map((cls) => (
        <div key={cls.class_id} className="mar-card">
          <div className="mar-card-head">
            {cls.class_name} {cls.section ? "- " + cls.section : ""}
          </div>
          <div className="mar-scroll">
            <table className="mar-table">
              <thead>
                <tr>
                  {["Student", "Enrollment No", "Present", "Absent", "Late", "Excused", "On Leave", "Total", "%"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cls.students.map((s) => (
                  <tr key={s.id}>
                    <td className="mar-name">{s.student_name}</td>
                    <td className="mar-soft">{s.enrollment_no || "-"}</td>
                    <td className="mar-present">{s.present}</td>
                    <td className="mar-absent">{s.absent}</td>
                    <td className="mar-late">{s.late}</td>
                    <td>{s.excused}</td>
                    <td className="mar-leave">{s.on_leave}</td>
                    <td>{s.total}</td>
                    <td className="mar-pct">{s.pct}%</td>
                  </tr>
                ))}
                {cls.students.length === 0 && (
                  <tr><td colSpan={9} className="mar-empty">No students in this class.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!loading && withdrawn.length > 0 && (
        <div className="mar-note">
          <strong>Note:</strong> {withdrawn.length} student(s) withdrawn from your classes during this period are not included above.
        </div>
      )}
    </div>
  );
}
