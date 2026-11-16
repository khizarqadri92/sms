import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import teachersApi from "../api/teachersApi";
import academicsApi from "../api/academicsApi";
import settingsApi from "../api/settingsApi";
import financeApi from "../api/financeApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./MyClasses.css";

export default function MyClasses() {
  const { formatDate } = useRegionalSettings();
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
  const [tab, setTab] = useState("list");
  useEffect(() => {
    const handler = (e) => {
      const sub = e.detail?.sub;
      if (["list", "timetable", "overview"].includes(sub)) setTab(sub);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

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

  const fmtLockedDate = d => d ? formatDate(d) : "-";

  if (loading) return <div className="loading-state">Loading your classes...</div>;

  return (
    <div className="mc-page">
      <div className="page-header">
        <div>
          <h1 className="page-heading">My Classes</h1>
          {teacher && (
            <div className="mc-teacher-line">
              {teacher.first_name} {teacher.last_name} &mdash; {teacher.employee_no}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error mc-error">{error}</div>}

      {!error && teacher && tab === "timetable" && <MyTimetableTab />}
      {!error && teacher && tab === "overview" && <MyClassOverviewTab classes={teacher.classes || []} />}
      {!error && teacher && tab === "list" && (
        <>
          {/* Classes */}
          <div className="mc-block">
            <div className="mc-label">
              Assigned Classes
            </div>
            {(!teacher.classes || teacher.classes.length === 0) ? (
              <div className="section-card mc-empty-card">
                No classes assigned to you yet.
              </div>
            ) : (
              <div className="mc-grid">
                {teacher.classes.map(c => {
                  const showAttBtn = attConfig === "all_teachers" || c.is_primary;
                  return (
                    <div key={c.id} className={"mc-card" + (c.is_primary ? " mc-card--primary" : "")}>
                      <div className="mc-card-body">
                        <div className="mc-card-top">
                          <div>
                            <div className="mc-class-name">
                              {c.name}
                              {c.section && <span className="mc-class-section">({c.section})</span>}
                            </div>
                            <div className="mc-class-meta">
                              {c.student_count} student{c.student_count !== 1 ? "s" : ""}
                              {c.class_type && <span className="mc-type-chip">{c.class_type}</span>}
                            </div>
                          </div>
                          {c.is_primary && (
                            <span className="mc-role-pill">
                              Class Teacher
                            </span>
                          )}
                        </div>

                        <div className="mc-actions">
                          <button className="mc-btn" onClick={() => openDetail(c)}>
                            View
                          </button>
                          {showAttBtn && (
                            <button onClick={() => navigate("/attendance?class_id=" + c.id + "&class_name=" + encodeURIComponent(c.name + (c.section ? " (" + c.section + ")" : "")))}
                              className="mc-btn mc-btn--indigo">
                              Attendance
                            </button>
                          )}
                          <button className="mc-btn mc-btn--green" onClick={() => navigate("/diary?class_id=" + c.id)}>
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
              <div className="mc-empty-line">No subjects assigned.</div>
            ) : (
              <div className="mc-subjects">
                {teacher.subjects.map(s => (
                  <div key={s.id} className="mc-subject">
                    {s.name}
                    <span className="mc-subject-code">({s.code})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Class Detail Modal */}
      {detail && (
        <div className="mc-overlay">
          <div className="mc-modal">
            <div className="mc-modal-head">
              <div>
                <div className="mc-class-name">
                  {detail.name}{detail.section ? " (" + detail.section + ")" : ""}
                </div>
                <div className="mc-modal-sub">
                  {detail.student_count} students &nbsp;&middot;&nbsp; {detail.class_type || "Regular"}
                </div>
              </div>
              {detail.is_primary && (
                <span className="mc-role-pill mc-role-pill--lg">
                  Your Class
                </span>
              )}
            </div>

            <div className="mc-modal-body">
              {/* Class info */}
              <div className="mc-modal-section">
                <div className="mc-label mc-label--sm">Class Information</div>
                {[
                  { label: "Class Name",     value: detail.name },
                  { label: "Section",        value: detail.section || "?" },
                  { label: "Total Students", value: detail.student_count },
                  { label: "Your Role",      value: detail.is_primary ? "Class Teacher (Incharge)" : "Subject Teacher" },
                ].map((row, i) => (
                  <div key={i} className="mc-info-row">
                    <span className="mc-info-key">{row.label}</span>
                    <span className="mc-info-val">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Teachers in this class */}
              <div>
                <div className="mc-label mc-label--sm">
                  Teachers in This Class
                </div>
                {loadingDetail ? (
                  <div className="mc-muted">Loading...</div>
                ) : classTeachers.length === 0 ? (
                  <div className="mc-muted">No teachers assigned yet.</div>
                ) : (
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th>Teacher</th>
                        <th>Subject</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classTeachers.map((t, i) => (
                        <tr key={i}>
                          <td className="mc-td-strong">{t.teacher_name || (t.first_name + " " + t.last_name)}</td>
                          <td className="mc-td-soft">{t.subject_names || "?"}</td>
                          <td>
                            {t.is_primary
                              ? <span className="mc-tag mc-tag--indigo">Incharge</span>
                              : <span className="mc-tag mc-tag--gray">Subject</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {detail.is_primary && (
                <div className="mc-modal-section--top">
                  <div className="mc-label mc-label--sm">
                    Locked Students (Unpaid Fees)
                  </div>
                  {loadingLocked ? (
                    <div className="mc-muted">Loading...</div>
                  ) : lockedStudents.length === 0 ? (
                    <div className="mc-muted">No locked students in this class.</div>
                  ) : (
                    <table className="mc-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Enrollment No.</th>
                          <th>Due Date</th>
                          <th>Days Overdue</th>
                          <th>Net Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lockedStudents.map((r, i) => (
                          <tr key={r.user_id}>
                            <td className="mc-td-strong">{r.first_name} {r.last_name}</td>
                            <td className="mc-td-soft">{r.enrollment_no}</td>
                            <td className="mc-td-soft">{fmtLockedDate(r.due_date)}</td>
                            <td>
                              <span className="mc-tag mc-tag--red">
                                {r.days_overdue != null ? r.days_overdue + " days" : "-"}
                              </span>
                            </td>
                            <td className="mc-td-bold">{r.net_amount != null ? "Rs. " + Number(r.net_amount).toLocaleString() : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <div className="mc-modal-foot">
              {(attConfig === "all_teachers" || detail.is_primary) && (
                <button onClick={() => { setDetail(null); navigate("/attendance?class_id=" + detail.id + "&class_name=" + encodeURIComponent(detail.name + (detail.section ? " (" + detail.section + ")" : ""))); }}
                  className="mc-btn mc-btn--indigo mc-btn--wide">
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


const TT_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function MyTimetableTab() {
  const [timetable, setTimetable] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    teachersApi.getMyTimetable()
      .then(res => setTimetable(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Loading timetable...</div>;
  if (timetable.length === 0) return (
    <div className="section-card">
      <div className="empty-state">No timetable assigned yet. Contact academic coordinator to set up timetable.</div>
    </div>
  );

  // One row per class this teacher teaches, one column per weekday -
  // matches the table layout used in the admin's timetable view, instead
  // of a per-day card list that made it hard to see a class's whole week
  // at a glance.
  const classRowsMap = new Map();
  for (const slot of timetable) {
    if (!classRowsMap.has(slot.class_id)) {
      classRowsMap.set(slot.class_id, { class_id: slot.class_id, class_name: slot.class_name, section: slot.section });
    }
  }
  const classRows = [...classRowsMap.values()].sort((a, b) =>
    (a.class_name + (a.section || "")).localeCompare(b.class_name + (b.section || ""))
  );

  return (
    <div className="section-card mc-tt-card">
      <div className="section-card-header mc-tt-head">
        <span className="section-card-title">My Weekly Timetable</span>
        <span className="badge badge-gray">{timetable.length} periods</span>
      </div>
      <table className="table mc-tt-table">
        <thead>
          <tr>
            <th>Class</th>
            {TT_DAYS.map(day => <th key={day}>{day}</th>)}
          </tr>
        </thead>
        <tbody>
          {classRows.map(row => (
            <tr key={row.class_id}>
              <td><strong>{row.class_name}{row.section ? ` (${row.section})` : ""}</strong></td>
              {TT_DAYS.map(day => {
                const slots = timetable
                  .filter(t => t.class_id === row.class_id && t.day_name === day)
                  .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
                return (
                  <td key={day} className="mc-tt-cell">
                    {slots.length === 0 ? (
                      <span className="mc-tt-none">&mdash;</span>
                    ) : (
                      slots.map((slot, i) => (
                        <div key={i} className="mc-slot">
                          <div className="mc-slot-subject">{slot.subject_name}</div>
                          <div className="mc-slot-time">
                            {slot.start_time ? slot.start_time.slice(0, 5) : ""} - {slot.end_time ? slot.end_time.slice(0, 5) : ""}
                          </div>
                          {slot.room_number && <div className="mc-slot-room">Room: {slot.room_number}</div>}
                        </div>
                      ))
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyClassOverviewTab({ classes }) {
  if (!classes || classes.length === 0) {
    return (
      <div className="section-card">
        <div className="empty-state">No classes assigned to you yet.</div>
      </div>
    );
  }

  return (
    <div className="mc-grid">
      {classes.map(c => (
        <div key={c.id} className={"mc-card mc-card--pad" + (c.is_primary ? " mc-card--primary" : "")}>
          <div className="mc-card-top mc-card-top--tight">
            <div>
              <div className="mc-class-name">
                {c.name}
                {c.section && <span className="mc-class-section">({c.section})</span>}
              </div>
              <div className="mc-class-meta">
                {c.student_count} student{c.student_count !== 1 ? "s" : ""}
                {c.class_type && <span className="mc-type-chip">{c.class_type}</span>}
              </div>
            </div>
            {c.is_primary && (
              <span className="mc-role-pill">
                Class Teacher
              </span>
            )}
          </div>
          {c.subject_names && (
            <div className="mc-teaching">
              Teaching: {c.subject_names}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
