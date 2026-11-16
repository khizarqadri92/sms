import React, { useState, useEffect, useCallback } from "react";
import attendanceApi from "../api/attendanceApi";
import processingDateApi from "../api/processingDateApi";
import { useProcessingNow } from "../hooks/useProcessingNow";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./MyAttendance.css";

function formatDuration(ms) {
  if (ms == null || ms < 0) return "-";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return (h > 0 ? h + "h " : "") + m + "m";
}

function toLocalDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fmtTimeForInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function fmtTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
const WEEKDAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function fmtDateLabel(dateStr, formatDate) {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = WEEKDAY_SHORT[d.getDay()];
  return formatDate ? `${weekday}, ${formatDate(d)}` : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const STATUS_LABELS = {
  present: "Present", half_day: "Half Day", weekly_off: "Weekly Off", holiday: "Holiday",
  on_leave: "On Leave", absent: "Absent", pending: "Pending"
};
const STATUS_COLORS = {
  present: { bg: "#f0fdf4", color: "#166534" },
  half_day: { bg: "#fff7ed", color: "#c2410c" },
  weekly_off: { bg: "var(--bg-hover)", color: "var(--text-secondary)" },
  holiday: { bg: "#eff6ff", color: "#1d4ed8" },
  on_leave: { bg: "#fef3c7", color: "#92400e" },
  absent: { bg: "#fef2f2", color: "#dc2626" },
  pending: { bg: "var(--bg-hover)", color: "var(--text-muted)" },
};

export default function MyAttendance() {
  const { formatDate, formatTime } = useRegionalSettings();
  const fmtTime = (iso) => iso ? formatTime(iso) : "-";
  const [today, setToday]       = useState(null);
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [processingToday, setProcessingToday] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [toggleMsg, setToggleMsg] = useState(null);
  const [flash, setFlash]       = useState(null);
  const now = useProcessingNow();
  const [monthlyStatus, setMonthlyStatus] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ request_date: "", requested_clock_in: "", requested_clock_out: "", reason: "", update_field: "", existing_session_id: null });
  const [existingMarks, setExistingMarks] = useState(null);

  useEffect(() => {
    if (!correctionForm.request_date) { setExistingMarks(null); return; }
    attendanceApi.getMyHistory({ from_date: correctionForm.request_date, to_date: correctionForm.request_date })
      .then(r => {
        const sessions = r.data.data || [];
        if (sessions.length > 0) {
          const firstIn = sessions.reduce((a, b) => a.clock_in_at < b.clock_in_at ? a : b);
          const closedOnes = sessions.filter(s => s.clock_out_at);
          const lastOut = closedOnes.length ? closedOnes.reduce((a, b) => a.clock_out_at > b.clock_out_at ? a : b) : null;
          setExistingMarks({ in: firstIn.clock_in_at, out: lastOut ? lastOut.clock_out_at : null });
          setCorrectionForm(p => ({
            ...p,
            requested_clock_in: fmtTimeForInput(firstIn.clock_in_at),
            requested_clock_out: lastOut ? fmtTimeForInput(lastOut.clock_out_at) : "",
            existing_session_id: sessions.length === 1 ? sessions[0].id : null,
          }));
        } else {
          setExistingMarks(null);
          setCorrectionForm(p => ({ ...p, requested_clock_in: "", requested_clock_out: "", existing_session_id: null }));
        }
      }).catch(() => {});
  }, [correctionForm.request_date]);
  const [correctionError, setCorrectionError] = useState(null);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [myCorrectionRequests, setMyCorrectionRequests] = useState([]);
  const [viewMonth, setViewMonth] = useState(null);

  useEffect(() => {
    processingDateApi.get().then(r => {
      const d = new Date(r.data.data.current_processing_date + "T00:00:00");
      setProcessingToday(d);
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }).catch(() => {
      const d = now;
      setProcessingToday(d);
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    });
  }, []);
  const monthStart = viewMonth ? toLocalDateStr(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)) : null;
  const monthEnd = viewMonth ? toLocalDateStr(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)) : null;
  const daysInMonth = viewMonth ? new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate() : 0;
  const statusByDate = {};
  monthlyStatus.forEach(d => { statusByDate[d.status_date] = d; });
  const goPrevMonth = () => setViewMonth(v => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  const goNextMonth = () => setViewMonth(v => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  const isCurrentOrFutureMonth = !viewMonth || !processingToday || viewMonth.getFullYear() > processingToday.getFullYear() ||
    (viewMonth.getFullYear() === processingToday.getFullYear() && viewMonth.getMonth() >= processingToday.getMonth());

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const loadToday = useCallback(() => {
    attendanceApi.getMyToday().then(r => setToday(r.data.data)).catch(() => {});
  }, []);

  const loadCorrectionRequests = useCallback(() => {
    attendanceApi.getMyCorrectionRequests().then(r => setMyCorrectionRequests(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    attendanceApi.getMyToday().then(r => setToday(r.data.data)).catch(() => {}).finally(() => setLoading(false));
    loadCorrectionRequests();
  }, [loadCorrectionRequests]);

  const submitCorrectionRequest = async () => {
    setCorrectionError(null);
    if (!correctionForm.request_date || !correctionForm.reason.trim()) {
      setCorrectionError("Date and reason are required."); return;
    }
    if (!correctionForm.update_field) {
      setCorrectionError("Select whether you are updating Clock In, Clock Out, or both."); return;
    }
    const wantsIn = correctionForm.update_field === "clock_in" || correctionForm.update_field === "both";
    const wantsOut = correctionForm.update_field === "clock_out" || correctionForm.update_field === "both";
    if ((wantsIn && !correctionForm.requested_clock_in) || (wantsOut && !correctionForm.requested_clock_out)) {
      setCorrectionError("Please provide the time for the field(s) you selected to update."); return;
    }
    setCorrectionSaving(true);
    try {
      const r = await attendanceApi.submitCorrectionRequest({
        request_date: correctionForm.request_date,
        session_id: correctionForm.existing_session_id,
        requested_clock_in: wantsIn ? correctionForm.requested_clock_in : null,
        requested_clock_out: wantsOut ? correctionForm.requested_clock_out : null,
        reason: correctionForm.reason,
      });
      showFlash("success", r.data.message);
      setShowCorrectionForm(false);
      setCorrectionForm({ request_date: "", requested_clock_in: "", requested_clock_out: "", reason: "", update_field: "", existing_session_id: null });
      setExistingMarks(null);
      loadCorrectionRequests();
    } catch (e) {
      setCorrectionError(e.response?.data?.message || e.response?.data?.detail?.message || "Failed to submit.");
    } finally {
      setCorrectionSaving(false);
    }
  };

  // History + daily status are both scoped to the currently viewed month
  useEffect(() => {
    if (!monthStart || !monthEnd) return;
    attendanceApi.getMyHistory({ from_date: monthStart, to_date: monthEnd })
      .then(r => setHistory(r.data.data || [])).catch(() => {});
    attendanceApi.getMyDailyStatus({ from_date: monthStart, to_date: monthEnd })
      .then(r => setMonthlyStatus(r.data.data || [])).catch(() => {});
  }, [monthStart, monthEnd]);

  const handleToggle = async () => {
    setToggling(true);
    setToggleMsg(null);
    try {
      const r = await attendanceApi.toggle();
      const action = r.data.data.action;
      setToday(prev => prev ? { ...prev, is_clocked_in: action === "clock_in" } : prev);
      setToggleMsg({ type: "success", text: r.data.message });
      loadToday();
      attendanceApi.getMyHistory({ from_date: monthStart, to_date: monthEnd })
        .then(r2 => setHistory(r2.data.data || [])).catch(() => {});
    } catch (e) {
      setToggleMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to record attendance." });
    } finally {
      setToggling(false);
    }
    setTimeout(() => setToggleMsg(null), 8000);
  };

  const isClockedIn = today?.is_clocked_in;
  const openSession = today?.sessions?.find(s => !s.clock_out_at);

  const todayTotalMs = (today?.sessions || []).reduce((sum, s) => {
    const start = new Date(s.clock_in_at);
    const end = s.clock_out_at ? new Date(s.clock_out_at) : now;
    return sum + (end - start);
  }, 0);

  // Group history sessions by date, for both the table and the detail popup
  const historyByDate = {};
  history.forEach(s => {
    const d = s.clock_in_at?.slice(0, 10);
    if (!historyByDate[d]) historyByDate[d] = [];
    historyByDate[d].push(s);
  });

  const dayTotalMs = (sessions) => sessions.reduce((sum, s) => {
    const start = new Date(s.clock_in_at);
    const end = s.clock_out_at ? new Date(s.clock_out_at) : now;
    return sum + (end - start);
  }, 0);

  const selectedDaySessions = selectedDay ? (historyByDate[selectedDay] || []) : [];
  const selectedDayStatusRow = selectedDay ? statusByDate[selectedDay] : null;

  if (loading || !viewMonth) return <div className="ma-loading">Loading...</div>;

  return (
    <div className="ma-page">
      <div className="ma-header">
        <div className="ma-title">My Attendance</div>
        <div className="ma-header-row">
          <div className="ma-subtitle">Clock in and out, and view your attendance history</div>
          <button className="btn btn-primary btn-sm ma-correction-btn"
            onClick={() => { setCorrectionError(null); setShowCorrectionForm(true); }}>
            Request Correction
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="ma-status-card" style={{
        "--card-bg": isClockedIn ? "var(--bg-success-soft)" : "var(--bg-card)",
        "--card-border": isClockedIn ? "#22c55e" : "var(--border-color)"
      }}>
        <div className="ma-status-label" style={{ "--label-color": isClockedIn ? "#166534" : "var(--text-secondary)" }}>
          {isClockedIn ? "Currently Clocked In" : "Not Clocked In"}
        </div>
        {isClockedIn && openSession && (
          <div className="ma-since-text">
            Since {fmtTime(openSession.clock_in_at)} &middot; {formatDuration(now - new Date(openSession.clock_in_at))} so far
          </div>
        )}
        <button
          className="ma-toggle-btn"
          onClick={handleToggle}
          disabled={toggling}
          style={{
            "--toggle-bg": isClockedIn ? "#dc2626" : "#16a34a", "--toggle-cursor": toggling ? "not-allowed" : "pointer",
            "--toggle-opacity": toggling ? 0.7 : 1
          }}
        >
          {toggling ? "Please wait..." : isClockedIn ? "Clock Out" : "Clock In"}
        </button>
        {toggleMsg && (
          <div className="ma-toggle-msg" style={{
            "--msg-bg": toggleMsg.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
            "--msg-color": toggleMsg.type === "success" ? "#166534" : "#dc2626"
          }}>
            {toggleMsg.type === "success" ? "\u2713 " : "\u26a0 "}{toggleMsg.text}
          </div>
        )}
        {todayTotalMs > 0 && (
          <div className="ma-total-today">
            Total today: <strong className="ma-total-today-value">{formatDuration(todayTotalMs)}</strong>
          </div>
        )}
      </div>

      {/* Today's Sessions */}
      {today?.sessions?.length > 0 && (
        <div className="ma-card">
          <div className="ma-card-header">Today's Sessions</div>
          <table className="ma-table">
            <thead>
              <tr className="ma-th-row">
                {["Clock In", "Clock Out", "Duration", "Source"].map(h => (
                  <th key={h} className="ma-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {today.sessions.map(s => (
                <tr key={s.id} className="ma-tr">
                  <td className="ma-td">
                    {fmtTime(s.clock_in_at)}
                    {s.is_late && <span className="ma-late-tag">Late</span>}
                  </td>
                  <td className="ma-td">
                    {s.clock_out_at ? fmtTime(s.clock_out_at) : <span className="ma-in-progress-tag">In Progress</span>}
                  </td>
                  <td className="ma-td-bold">
                    {formatDuration((s.clock_out_at ? new Date(s.clock_out_at) : now) - new Date(s.clock_in_at))}
                  </td>
                  <td className="ma-td">
                    <span className="ma-source-tag">{s.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Attendance History - Table */}
      <div className="ma-card-flat">
        <div className="ma-month-nav">
          <button className="btn btn-ghost btn-sm ma-nav-btn" onClick={goPrevMonth}>&larr; Prev</button>
          <div className="ma-month-label">
            {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button className="btn btn-ghost btn-sm ma-nav-btn" onClick={goNextMonth} disabled={isCurrentOrFutureMonth}>Next &rarr;</button>
        </div>
        <table className="ma-table">
          <thead>
            <tr className="ma-th-row">
              {["Date", "Status", "First In", "Last Out", "Total Hours", "Out of School"].map(h => (
                <th key={h} className="ma-th-lg">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = toLocalDateStr(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum));
              if (processingToday && dateStr > toLocalDateStr(processingToday)) return null;
              const statusRow = statusByDate[dateStr];
              const sessions = historyByDate[dateStr] || [];
              const colors = statusRow ? (STATUS_COLORS[statusRow.status] || STATUS_COLORS.pending) : STATUS_COLORS.pending;
              const firstIn = sessions.length ? sessions.reduce((a, b) => a.clock_in_at < b.clock_in_at ? a : b) : null;
              const closedOnes = sessions.filter(s => s.clock_out_at);
              const lastOut = closedOnes.length ? closedOnes.reduce((a, b) => a.clock_out_at > b.clock_out_at ? a : b) : null;
              const hasOpenSession = sessions.some(s => !s.clock_out_at);
              const spanEndTime = hasOpenSession ? now : (lastOut ? new Date(lastOut.clock_out_at) : null);
              const outOfSchoolMs = (firstIn && spanEndTime)
                ? Math.max(0, (spanEndTime - new Date(firstIn.clock_in_at)) - dayTotalMs(sessions))
                : null;
              return (
                <tr key={dateStr} onClick={() => setSelectedDay(dateStr)}
                  className="ma-tr-clickable">
                  <td className="ma-td-bold">{fmtDateLabel(dateStr, formatDate)}</td>
                  <td className="ma-td">
                    <span className="ma-status-badge" style={{ "--badge-bg": colors.bg, "--badge-color": colors.color }}>
                      {STATUS_LABELS[statusRow?.status] || statusRow?.status || "-"}
                    </span>
                    {statusRow?.is_late && <span className="ma-late-tag-sm">Late</span>}
                  </td>
                  <td className="ma-td-secondary">{firstIn ? fmtTime(firstIn.clock_in_at) : "-"}</td>
                  <td className="ma-td-secondary">
                    {hasOpenSession ? <span className="ma-open-text">Open</span> : (lastOut ? fmtTime(lastOut.clock_out_at) : "-")}
                  </td>
                  <td className="ma-td-bold">
                    {sessions.length ? formatDuration(dayTotalMs(sessions)) : "-"}
                  </td>
                  <td className="ma-oos-value" style={{ "--oos-color": outOfSchoolMs > 0 ? "#c2410c" : "var(--text-muted)" }}>
                    {outOfSchoolMs != null ? formatDuration(outOfSchoolMs) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Day Detail Popup */}
      {selectedDay && (
        <div className="ma-modal-overlay"
          onClick={() => setSelectedDay(null)}>
          <div className="ma-modal-box"
            onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <div className="ma-modal-title">{fmtDateLabel(selectedDay, formatDate)}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>Close</button>
            </div>
            <div className="ma-modal-body">
              {selectedDayStatusRow && (
                <div className="ma-status-wrap">
                  <span className="ma-status-badge-lg" style={{
                    "--badge-bg": (STATUS_COLORS[selectedDayStatusRow.status] || STATUS_COLORS.pending).bg,
                    "--badge-color": (STATUS_COLORS[selectedDayStatusRow.status] || STATUS_COLORS.pending).color
                  }}>
                    {STATUS_LABELS[selectedDayStatusRow.status] || selectedDayStatusRow.status}
                  </span>
                </div>
              )}
              {selectedDaySessions.length === 0 ? (
                <div className="ma-empty-text">No sessions recorded for this day.</div>
              ) : (
              <table className="ma-table">
                <thead>
                  <tr className="ma-th-row">
                    {["Clock In", "Clock Out", "Duration", "Source"].map(h => (
                      <th key={h} className="ma-th-sm">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedDaySessions.map(s => (
                    <tr key={s.id} className="ma-tr">
                      <td className="ma-td-sm">
                        {fmtTime(s.clock_in_at)}
                        {s.is_late && <span className="ma-late-tag">Late</span>}
                      </td>
                      <td className="ma-td-sm">
                        {s.clock_out_at ? fmtTime(s.clock_out_at) : <span className="ma-open-text">Open</span>}
                        {s.auto_closed && <span className="ma-auto-closed-tag">Auto-closed</span>}
                      </td>
                      <td className="ma-td-sm-bold">
                        {formatDuration((s.clock_out_at ? new Date(s.clock_out_at) : now) - new Date(s.clock_in_at))}
                      </td>
                      <td className="ma-td-sm">
                        <span className="ma-source-tag-sm">{s.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </div>
      )}

      {myCorrectionRequests.length > 0 && (
        <div className="ma-card-mt24">
          <div className="ma-card-header">My Correction Requests</div>
          <table className="ma-table">
            <thead>
              <tr className="ma-th-row">
                {["Date", "Requested In", "Requested Out", "Reason", "Status"].map(h => (
                  <th key={h} className="ma-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myCorrectionRequests.map(r => {
                const statusColors = {
                  pending: { bg: "#fefce8", color: "#854d0e" },
                  approved: { bg: "#f0fdf4", color: "#166534" },
                  rejected: { bg: "#fff1f2", color: "#881337" },
                };
                const sc = statusColors[r.status] || statusColors.pending;
                return (
                  <tr key={r.id} className="ma-tr">
                    <td className="ma-td">{fmtDateLabel(r.request_date, formatDate)}</td>
                    <td className="ma-td">{r.requested_clock_in?.slice(0, 5) || "-"}</td>
                    <td className="ma-td">{r.requested_clock_out?.slice(0, 5) || "-"}</td>
                    <td className="ma-reason-cell">
                      <div className="ma-reason-text" title={r.reason}>{r.reason}</div>
                    </td>
                    <td className="ma-td">
                      <span className="ma-status-badge" style={{ "--badge-bg": sc.bg, "--badge-color": sc.color }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Request Correction Modal */}
      {showCorrectionForm && (
        <div className="ma-modal-overlay">
          <div className="ma-modal-box-sm">
            <div className="ma-modal-header">
              <div className="ma-modal-title">Request Attendance Correction</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCorrectionForm(false)}>Close</button>
            </div>
            <div className="ma-modal-body">
              {correctionError && (
                <div className="ma-error-banner">
                  \u26a0 {correctionError}
                </div>
              )}
              <div className="ma-form-column">
                <div>
                  <label className="ma-field-label">Date *</label>
                  <DatePicker style={{ width: "100%", fontSize: 13 }} max={processingToday ? toLocalDateStr(processingToday) : undefined}
                    value={correctionForm.request_date} onChange={val => setCorrectionForm(p => ({ ...p, request_date: val, update_field: "" }))} />
                </div>

                {existingMarks && (
                  <div className="ma-existing-marks-box">
                    Currently marked: <strong>In {existingMarks.in ? fmtTime(existingMarks.in) : "-"}</strong> &middot; <strong>Out {existingMarks.out ? fmtTime(existingMarks.out) : "Not clocked out"}</strong>
                  </div>
                )}

                {correctionForm.request_date && (
                  <div>
                    <label className="ma-field-label-mb6">What do you want to update? *</label>
                    <div className="ma-radio-row">
                      {[["clock_in", "Clock In"], ["clock_out", "Clock Out"], ["both", "Both"]].map(([val, label]) => (
                        <label key={val} className="ma-radio-label">
                          <input type="radio" name="update_field" checked={correctionForm.update_field === val}
                            onChange={() => setCorrectionForm(p => ({ ...p, update_field: val }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {correctionForm.update_field && (
                  <div className="ma-time-grid">
                    {(correctionForm.update_field === "clock_in" || correctionForm.update_field === "both") && (
                      <div>
                        <label className="ma-field-label">Clock In Time *</label>
                        <input type="time" className="form-input ma-input-full"
                          value={correctionForm.requested_clock_in} onChange={e => setCorrectionForm(p => ({ ...p, requested_clock_in: e.target.value }))} />
                      </div>
                    )}
                    {(correctionForm.update_field === "clock_out" || correctionForm.update_field === "both") && (
                      <div>
                        <label className="ma-field-label">Clock Out Time *</label>
                        <input type="time" className="form-input ma-input-full"
                          value={correctionForm.requested_clock_out} onChange={e => setCorrectionForm(p => ({ ...p, requested_clock_out: e.target.value }))} />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="ma-field-label">Reason *</label>
                  <textarea className="form-input ma-input-full" rows={3}
                    placeholder="Why do you need this correction?"
                    value={correctionForm.reason} onChange={e => setCorrectionForm(p => ({ ...p, reason: e.target.value }))} />
                </div>
              </div>
              <div className="ma-btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCorrectionForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm ma-submit-btn" disabled={correctionSaving} onClick={submitCorrectionRequest}>
                  {correctionSaving ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className="ma-flash-toast" style={{
          "--flash-bg": flash.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>{flash.msg}</div>
      )}
    </div>
  );
}
