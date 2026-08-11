import { useState, useEffect } from "react";
import attendanceApi from "../api/attendanceApi";
import processingDateApi from "../api/processingDateApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

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
    <div style={{ padding: 24, background: "#f1f5f9", minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Attendance Report</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Student attendance summary for the classes you are incharge of</div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>From</label>
          <DatePicker value={fromDate} onChange={setFromDate} max={toDate || undefined} style={{ width: 150 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>To</label>
          <DatePicker value={toDate} onChange={setToDate} min={fromDate || undefined} style={{ width: 150 }} />
        </div>
      </div>

      {loading && <div style={{ background: "#fff", borderRadius: 12, padding: 60, textAlign: "center", color: "#94a3b8", border: "1px solid #e2e8f0" }}>Loading...</div>}

      {!loading && report.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 60, textAlign: "center", color: "#94a3b8", border: "1px solid #e2e8f0" }}>
          You are not currently the incharge of any class.
        </div>
      )}

      {!loading && report.map((cls) => (
        <div key={cls.class_id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", fontWeight: 700, fontSize: 15 }}>
            {cls.class_name} {cls.section ? "- " + cls.section : ""}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Student", "Enrollment No", "Present", "Absent", "Late", "Excused", "On Leave", "Total", "%"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cls.students.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{s.student_name}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b" }}>{s.enrollment_no || "-"}</td>
                  <td style={{ padding: "10px 14px", color: "#166534" }}>{s.present}</td>
                  <td style={{ padding: "10px 14px", color: "#dc2626" }}>{s.absent}</td>
                  <td style={{ padding: "10px 14px", color: "#c2410c" }}>{s.late}</td>
                  <td style={{ padding: "10px 14px" }}>{s.excused}</td>
                  <td style={{ padding: "10px 14px", color: "#0369a1" }}>{s.on_leave}</td>
                  <td style={{ padding: "10px 14px" }}>{s.total}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{s.pct}%</td>
                </tr>
              ))}
              {cls.students.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>No students in this class.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {!loading && withdrawn.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: 16, fontSize: 13, color: "#92400e" }}>
          <strong>Note:</strong> {withdrawn.length} student(s) withdrawn from your classes during this period are not included above.
        </div>
      )}
    </div>
  );
}
