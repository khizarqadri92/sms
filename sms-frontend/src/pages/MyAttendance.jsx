import React, { useState, useEffect, useCallback } from "react";
import attendanceApi from "../api/attendanceApi";
import processingDateApi from "../api/processingDateApi";
import { useProcessingNow } from "../hooks/useProcessingNow";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

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
  weekly_off: { bg: "#f8fafc", color: "#64748b" },
  holiday: { bg: "#eff6ff", color: "#1d4ed8" },
  on_leave: { bg: "#fef3c7", color: "#92400e" },
  absent: { bg: "#fef2f2", color: "#dc2626" },
  pending: { bg: "#f8fafc", color: "#94a3b8" },
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

  if (loading || !viewMonth) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>My Attendance</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>Clock in and out, and view your attendance history</div>
          <button className="btn btn-primary btn-sm" style={{ color: "#fff" }}
            onClick={() => { setCorrectionError(null); setShowCorrectionForm(true); }}>
            Request Correction
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div style={{
        background: isClockedIn ? "#f0fdf4" : "#fff",
        border: "2px solid " + (isClockedIn ? "#22c55e" : "#e2e8f0"),
        borderRadius: 16, padding: 28, marginBottom: 24, textAlign: "center"
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isClockedIn ? "#166534" : "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>
          {isClockedIn ? "Currently Clocked In" : "Not Clocked In"}
        </div>
        {isClockedIn && openSession && (
          <div style={{ fontSize: 14, color: "#166534", marginBottom: 14 }}>
            Since {fmtTime(openSession.clock_in_at)} &middot; {formatDuration(now - new Date(openSession.clock_in_at))} so far
          </div>
        )}
        <button
          onClick={handleToggle}
          disabled={toggling}
          style={{
            padding: "16px 48px", fontSize: 17, fontWeight: 700, borderRadius: 12, border: "none", color: "#fff",
            background: isClockedIn ? "#dc2626" : "#16a34a", cursor: toggling ? "not-allowed" : "pointer",
            opacity: toggling ? 0.7 : 1, boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
          }}
        >
          {toggling ? "Please wait..." : isClockedIn ? "Clock Out" : "Clock In"}
        </button>
        {toggleMsg && (
          <div style={{
            marginTop: 14, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, display: "inline-block",
            background: toggleMsg.type === "success" ? "#dcfce7" : "#fee2e2",
            color: toggleMsg.type === "success" ? "#166534" : "#dc2626"
          }}>
            {toggleMsg.type === "success" ? "\u2713 " : "\u26a0 "}{toggleMsg.text}
          </div>
        )}
        {todayTotalMs > 0 && (
          <div style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>
            Total today: <strong style={{ color: "#0f172a" }}>{formatDuration(todayTotalMs)}</strong>
          </div>
        )}
      </div>

      {/* Today's Sessions */}
      {today?.sessions?.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", fontWeight: 700, fontSize: 14 }}>Today's Sessions</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Clock In", "Clock Out", "Duration", "Source"].map(h => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {today.sessions.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>
                    {fmtTime(s.clock_in_at)}
                    {s.is_late && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#fef2f2", color: "#dc2626" }}>Late</span>}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>
                    {s.clock_out_at ? fmtTime(s.clock_out_at) : <span style={{ color: "#16a34a", fontWeight: 600 }}>In Progress</span>}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>
                    {formatDuration((s.clock_out_at ? new Date(s.clock_out_at) : now) - new Date(s.clock_in_at))}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#f1f5f9", color: "#475569", textTransform: "uppercase" }}>{s.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Attendance History - Table */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 13 }} onClick={goPrevMonth}>&larr; Prev</button>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 13 }} onClick={goNextMonth} disabled={isCurrentOrFutureMonth}>Next &rarr;</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Date", "Status", "First In", "Last Out", "Total Hours", "Out of School"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
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
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>{fmtDateLabel(dateStr, formatDate)}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: colors.bg, color: colors.color }}>
                      {STATUS_LABELS[statusRow?.status] || statusRow?.status || "-"}
                    </span>
                    {statusRow?.is_late && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#fef2f2", color: "#dc2626" }}>Late</span>}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: "#475569" }}>{firstIn ? fmtTime(firstIn.clock_in_at) : "-"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: "#475569" }}>
                    {hasOpenSession ? <span style={{ color: "#16a34a", fontWeight: 600 }}>Open</span> : (lastOut ? fmtTime(lastOut.clock_out_at) : "-")}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>
                    {sessions.length ? formatDuration(dayTotalMs(sessions)) : "-"}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: outOfSchoolMs > 0 ? "#c2410c" : "#94a3b8" }}>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setSelectedDay(null)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtDateLabel(selectedDay, formatDate)}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {selectedDayStatusRow && (
                <div style={{ marginBottom: 14 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 10,
                    background: (STATUS_COLORS[selectedDayStatusRow.status] || STATUS_COLORS.pending).bg,
                    color: (STATUS_COLORS[selectedDayStatusRow.status] || STATUS_COLORS.pending).color
                  }}>
                    {STATUS_LABELS[selectedDayStatusRow.status] || selectedDayStatusRow.status}
                  </span>
                </div>
              )}
              {selectedDaySessions.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No sessions recorded for this day.</div>
              ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Clock In", "Clock Out", "Duration", "Source"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedDaySessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 10px", fontSize: 12 }}>
                        {fmtTime(s.clock_in_at)}
                        {s.is_late && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#fef2f2", color: "#dc2626" }}>Late</span>}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 12 }}>
                        {s.clock_out_at ? fmtTime(s.clock_out_at) : <span style={{ color: "#16a34a", fontWeight: 600 }}>Open</span>}
                        {s.auto_closed && <span style={{ marginLeft: 6, fontSize: 10, color: "#c2410c", fontWeight: 600 }}>Auto-closed</span>}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>
                        {formatDuration((s.clock_out_at ? new Date(s.clock_out_at) : now) - new Date(s.clock_in_at))}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "#f1f5f9", color: "#475569", textTransform: "uppercase" }}>{s.source}</span>
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
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginTop: 24 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", fontWeight: 700, fontSize: 14 }}>My Correction Requests</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Date", "Requested In", "Requested Out", "Reason", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
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
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{fmtDateLabel(r.request_date, formatDate)}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{r.requested_clock_in?.slice(0, 5) || "-"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13 }}>{r.requested_clock_out?.slice(0, 5) || "-"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b", maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>{r.reason}</div>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.color }}>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Request Attendance Correction</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCorrectionForm(false)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {correctionError && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
                  \u26a0 {correctionError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Date *</label>
                  <DatePicker style={{ width: "100%", fontSize: 13 }} max={processingToday ? toLocalDateStr(processingToday) : undefined}
                    value={correctionForm.request_date} onChange={val => setCorrectionForm(p => ({ ...p, request_date: val, update_field: "" }))} />
                </div>

                {existingMarks && (
                  <div style={{ padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, color: "#475569" }}>
                    Currently marked: <strong>In {existingMarks.in ? fmtTime(existingMarks.in) : "-"}</strong> &middot; <strong>Out {existingMarks.out ? fmtTime(existingMarks.out) : "Not clocked out"}</strong>
                  </div>
                )}

                {correctionForm.request_date && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>What do you want to update? *</label>
                    <div style={{ display: "flex", gap: 14 }}>
                      {[["clock_in", "Clock In"], ["clock_out", "Clock Out"], ["both", "Both"]].map(([val, label]) => (
                        <label key={val} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                          <input type="radio" name="update_field" checked={correctionForm.update_field === val}
                            onChange={() => setCorrectionForm(p => ({ ...p, update_field: val }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {correctionForm.update_field && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(correctionForm.update_field === "clock_in" || correctionForm.update_field === "both") && (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Clock In Time *</label>
                        <input type="time" className="form-input" style={{ width: "100%", fontSize: 13 }}
                          value={correctionForm.requested_clock_in} onChange={e => setCorrectionForm(p => ({ ...p, requested_clock_in: e.target.value }))} />
                      </div>
                    )}
                    {(correctionForm.update_field === "clock_out" || correctionForm.update_field === "both") && (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Clock Out Time *</label>
                        <input type="time" className="form-input" style={{ width: "100%", fontSize: 13 }}
                          value={correctionForm.requested_clock_out} onChange={e => setCorrectionForm(p => ({ ...p, requested_clock_out: e.target.value }))} />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Reason *</label>
                  <textarea className="form-input" rows={3} style={{ width: "100%", fontSize: 13 }}
                    placeholder="Why do you need this correction?"
                    value={correctionForm.reason} onChange={e => setCorrectionForm(p => ({ ...p, reason: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCorrectionForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={correctionSaving} onClick={submitCorrectionRequest}>
                  {correctionSaving ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 9999, padding: "10px 18px", borderRadius: 8,
          background: flash.type === "success" ? "#dcfce7" : "#fee2e2",
          color: flash.type === "success" ? "#166534" : "#dc2626",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", fontSize: 14, fontWeight: 600
        }}>{flash.msg}</div>
      )}
    </div>
  );
}
