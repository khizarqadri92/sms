import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import teachersApi from "../api/teachersApi";
import academicsApi from "../api/academicsApi";
import settingsApi from "../api/settingsApi";
import financeApi from "../api/financeApi";

export default function MyClasses() {
  const navigate               = useNavigate();
  const [teacher, setTeacher]  = useState(null);
  const [loading, setLoading]  = useState(true);
  const [error,   setError]    = useState("");
  const [detail,  setDetail]   = useState(null);
  const [classTeachers, setClassTeachers] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [attConfig, setAttConfig] = useState("incharge_only");
  const [lockedStudents, setLockedStudents] = useState([]);
  const [loadingLocked,  setLoadingLocked]  = useState(false);

  useEffect(() => {
    Promise.all([
      teachersApi.getMe(),
      settingsApi.getByCategory("attendance_config"),
    ]).then(([tr, sr]) => {
      setTeacher(tr.data.data);
      setAttConfig(sr.data.data?.attendance_marker || "incharge_only");
    }).catch(() => setError("Failed to load your classes."))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (c) => {
    setDetail(c);
    setClassTeachers([]);
    setLockedStudents([]);
    setLoadingDetail(true);
    try {
      const r = await academicsApi.getClassTeachers(c.id);
      setClassTeachers(r.data.data || []);
    } catch {}
    finally { setLoadingDetail(false); }

    if (c.is_primary) {
      setLoadingLocked(true);
      try {
        const lr = await financeApi.getMyClassLockedAccounts();
        setLockedStudents(lr.data.data || []);
      } catch {}
      finally { setLoadingLocked(false); }
    }
  };

  const fmtLockedDate = d => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-";

  if (loading) return <div className="loading-state">Loading your classes...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-heading">My Classes</h1>
          {teacher && (
            <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 4 }}>
              {teacher.first_name} {teacher.last_name} &mdash; {teacher.employee_no}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {!error && teacher && (
        <>
          {/* Classes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>
              Assigned Classes
            </div>
            {(!teacher.classes || teacher.classes.length === 0) ? (
              <div className="section-card" style={{ padding: "32px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
                No classes assigned to you yet.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {teacher.classes.map(c => {
                  const showAttBtn = attConfig === "all_teachers" || c.is_primary;
                  return (
                    <div key={c.id} style={{
                      background: "#ffffff", borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      borderLeft: c.is_primary ? "4px solid #4f46e5" : "4px solid #c7d2fe",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}>
                      <div style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a" }}>
                              {c.name}
                              {c.section && <span style={{ fontWeight: 400, color: "#64748b", fontSize: 14, marginLeft: 6 }}>({c.section})</span>}
                            </div>
                            <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
                              {c.student_count} student{c.student_count !== 1 ? "s" : ""}
                              {c.class_type && <span style={{ marginLeft: 8, background: "#f1f5f9", color: "#475569", padding: "1px 8px", borderRadius: 10, fontSize: 11 }}>{c.class_type}</span>}
                            </div>
                          </div>
                          {c.is_primary && (
                            <span style={{ background: "#ede9fe", color: "#4f46e5", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                              Class Teacher
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openDetail(c)}
                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            View
                          </button>
                          {showAttBtn && (
                            <button onClick={() => navigate("/attendance?class_id=" + c.id + "&class_name=" + encodeURIComponent(c.name + (c.section ? " (" + c.section + ")" : "")))}
                              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #e0e7ff", background: "#f5f3ff", color: "#4f46e5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                              Attendance
                            </button>
                          )}
                          <button onClick={() => navigate("/diary?class_id=" + c.id)}
                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #dcfce7", background: "#f0fdf4", color: "#166534", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            Diary
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subjects */}
          <div className="section-card">
            <div className="section-card-header">
              <span className="section-card-title">My Subjects</span>
              <span className="badge badge-gray">{teacher.subjects?.length || 0} subjects</span>
            </div>
            {(!teacher.subjects || teacher.subjects.length === 0) ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>No subjects assigned.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 4 }}>
                {teacher.subjects.map(s => (
                  <div key={s.id} style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-secondary)", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 500 }}>
                    {s.name}
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 6 }}>({s.code})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Class Detail Modal */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a" }}>
                  {detail.name}{detail.section ? " (" + detail.section + ")" : ""}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  {detail.student_count} students &nbsp;&middot;&nbsp; {detail.class_type || "Regular"}
                </div>
              </div>
              {detail.is_primary && (
                <span style={{ background: "#ede9fe", color: "#4f46e5", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>
                  Your Class
                </span>
              )}
            </div>

            <div style={{ padding: "20px 24px", flex: 1 }}>
              {/* Class info */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>Class Information</div>
                {[
                  { label: "Class Name",     value: detail.name },
                  { label: "Section",        value: detail.section || "?" },
                  { label: "Total Students", value: detail.student_count },
                  { label: "Your Role",      value: detail.is_primary ? "Class Teacher (Incharge)" : "Subject Teacher" },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 16, padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 }}>
                    <span style={{ minWidth: 140, fontWeight: 500, color: "#64748b", flexShrink: 0 }}>{row.label}</span>
                    <span style={{ color: "#0f172a" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Teachers in this class */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
                  Teachers in This Class
                </div>
                {loadingDetail ? (
                  <div style={{ color: "#64748b", fontSize: 14 }}>Loading...</div>
                ) : classTeachers.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 14 }}>No teachers assigned yet.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Teacher</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Subject</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classTeachers.map((t, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 500 }}>{t.teacher_name || (t.first_name + " " + t.last_name)}</td>
                          <td style={{ padding: "10px 12px", color: "#475569" }}>{t.subject_names || "?"}</td>
                          <td style={{ padding: "10px 12px" }}>
                            {t.is_primary
                              ? <span style={{ background: "#ede9fe", color: "#4f46e5", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10 }}>Incharge</span>
                              : <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 10 }}>Subject</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {detail.is_primary && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
                    Locked Students (Unpaid Fees)
                  </div>
                  {loadingLocked ? (
                    <div style={{ color: "#64748b", fontSize: 14 }}>Loading...</div>
                  ) : lockedStudents.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: 14 }}>No locked students in this class.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Student</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Enrollment No.</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Due Date</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Days Overdue</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Net Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lockedStudents.map((r, i) => (
                          <tr key={r.user_id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.first_name} {r.last_name}</td>
                            <td style={{ padding: "10px 12px", color: "#475569" }}>{r.enrollment_no}</td>
                            <td style={{ padding: "10px 12px", color: "#475569" }}>{fmtLockedDate(r.due_date)}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10 }}>
                                {r.days_overdue != null ? r.days_overdue + " days" : "-"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.net_amount != null ? "Rs. " + Number(r.net_amount).toLocaleString() : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
              {(attConfig === "all_teachers" || detail.is_primary) && (
                <button onClick={() => { setDetail(null); navigate("/attendance?class_id=" + detail.id + "&class_name=" + encodeURIComponent(detail.name + (detail.section ? " (" + detail.section + ")" : ""))); }}
                  style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e0e7ff", background: "#f5f3ff", color: "#4f46e5", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Mark Attendance
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
