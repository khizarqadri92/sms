import React, { useState, useEffect, useCallback } from "react";
import attendanceApi from "../api/attendanceApi";
import { StaffMethodsCard, StaffBiometricTab } from "./StaffAttendanceMethods";
import hrApi from "../api/hrApi";
import settingsApi from "../api/settingsApi";
import processingDateApi from "../api/processingDateApi";
import DatePicker from "../components/DatePicker";
import DateTimePicker from "../components/DateTimePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useProcessingNow } from "../hooks/useProcessingNow";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import "./AttendanceDashboard.css";

function fmtTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function toLocalDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
  on_leave: { bg: "#fef3c7", color: "var(--text-warning-soft)" },
  absent: { bg: "#fef2f2", color: "#dc2626" },
  pending: { bg: "var(--bg-hover)", color: "var(--text-muted)" },
};
function formatDuration(ms) {
  if (ms == null || ms < 0) return "-";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return (h > 0 ? h + "h " : "") + m + "m";
}
function formatTime12hr(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ":" + String(m).padStart(2, "0") + " " + period;
}
function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const TABS = ["live", "rfid", "settings", "schedule"];
const TAB_LABELS = { live: "Live Status", rfid: "RFID Cards", biometric: "Biometric", settings: "Settings", schedule: "Schedule" };

export default function AttendanceDashboard({ visibleTabs } = {}) {
  // Biometric sits next to RFID Cards wherever that tab is shown
  const TABS_SHOWN = (visibleTabs || TABS).flatMap(t => t === "rfid" && !(visibleTabs || []).includes("biometric") ? ["rfid", "biometric"] : [t]);
  const { formatDate, formatTime } = useRegionalSettings();
  const { isGlobalLocked: attendanceSettingsLocked } = useGovernanceMode("attendance");
  const { isGlobalLocked: thresholdsLocked } = useGovernanceMode("attendance_thresholds");
  const fmtTime = (iso) => iso ? formatTime(iso) : "-";
  const [tab, setTab] = useState(TABS_SHOWN[0]);
  const [flash, setFlash] = useState(null);
  const now = useProcessingNow();
  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  // Access mode: full HR (hr.view) vs restricted HOD (view-only, own department only)
  const [accessInfo, setAccessInfo] = useState(null);
  const isRestrictedMode = accessInfo !== null && !accessInfo.has_hr_view;
  const myDeptIds = accessInfo?.departments?.map(d => d.id) || [];

  useEffect(() => {
    attendanceApi.getMyHodStatus().then(r => {
      setAccessInfo(r.data.data);
      if (!r.data.data.has_hr_view && r.data.data.departments?.length === 1) {
        setDeptFilter(String(r.data.data.departments[0].id));
      }
    }).catch(() => setAccessInfo({ is_hod: false, departments: [], has_hr_view: false }));
  }, []);

  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dashboard, setDashboard] = useState([]);

  const [rfidCards, setRfidCards] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [cardForm, setCardForm] = useState({ staff_id: "", card_uid: "" });
  const [cardMsg, setCardMsg] = useState(null);

  const [autoCloseTime, setAutoCloseTime] = useState("20:00");
  const [settingsMsg, setSettingsMsg] = useState(null);
  const loadAttendanceSettings = useCallback(() => {
    attendanceApi.getSettings().then(r => {
      setAutoCloseTime(r.data.data?.attendance_auto_close_time || "20:00");
    }).catch(() => {});
  }, []);
  const saveAttendanceSettings = async () => {
    setSettingsMsg(null);
    try {
      await attendanceApi.updateSettings({ attendance_auto_close_time: autoCloseTime });
      setSettingsMsg({ type: "success", text: "Saved - auto clock-out time is now " + formatTime12hr(autoCloseTime) + "." });
    } catch (e) {
      setSettingsMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    }
    setTimeout(() => setSettingsMsg(null), 10000);
  };

  const [scheduleSettings, setScheduleSettings] = useState({ mode: "same_for_all", default_start_time: "08:00", default_end_time: "16:00", grace_minutes: 10 });
  const [deptSchedules, setDeptSchedules] = useState([]);
  const [deptScheduleForm, setDeptScheduleForm] = useState({ department_id: "", start_time: "08:00", end_time: "16:00", grace_minutes: 10 });
  const [scheduleMsg, setScheduleMsg] = useState(null);

  const loadScheduleSettings = useCallback(() => {
    attendanceApi.getScheduleSettings().then(r => {
      setScheduleSettings(r.data.data.settings);
      setDeptSchedules(r.data.data.departments || []);
    }).catch(() => {});
  }, []);

  const loadDeptSchedulesOnly = useCallback(() => {
    attendanceApi.getScheduleSettings().then(r => {
      setDeptSchedules(r.data.data.departments || []);
    }).catch(() => {});
  }, []);

  const saveScheduleSettings = async () => {
    setScheduleMsg(null);
    try {
      await attendanceApi.updateScheduleSettings(scheduleSettings);
      setScheduleMsg({ type: "success", text: "Schedule settings saved." });
    } catch (e) {
      setScheduleMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    }
    setTimeout(() => setScheduleMsg(null), 10000);
  };

  const saveDeptSchedule = async () => {
    if (!deptScheduleForm.department_id) { setScheduleMsg({ type: "error", text: "Select a department first." }); return; }
    try {
      await attendanceApi.upsertDeptSchedule({
        department_id: Number(deptScheduleForm.department_id),
        start_time: deptScheduleForm.start_time,
        end_time: deptScheduleForm.end_time,
        grace_minutes: Number(deptScheduleForm.grace_minutes),
      });
      setScheduleMsg({ type: "success", text: "Department schedule saved." });
      setDeptScheduleForm({ department_id: "", start_time: "08:00", end_time: "16:00", grace_minutes: 10 });
      loadDeptSchedulesOnly();
    } catch (e) {
      setScheduleMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    }
    setTimeout(() => setScheduleMsg(null), 10000);
  };

  const removeDeptSchedule = async (deptId) => {
    if (!window.confirm("Remove this department\'s custom schedule? It will fall back to the default times.")) return;
    try { await attendanceApi.deleteDeptSchedule(deptId); loadDeptSchedulesOnly(); }
    catch (e) { setScheduleMsg({ type: "error", text: "Failed to remove." }); }
  };

  const [selectedStaff, setSelectedStaff] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionForm, setSessionForm] = useState({ clock_in_at: "", clock_out_at: "", notes: "" });
  const [editingSessionId, setEditingSessionId] = useState(null);

  const [processingToday, setProcessingToday] = useState(null);
  const [viewDate, setViewDate] = useState(null);
  useEffect(() => {
    processingDateApi.get().then(r => {
      const d = r.data.data.current_processing_date;
      setProcessingToday(d);
      setViewDate(d);
    }).catch(() => {
      const d = toLocalDateStr(now);
      setProcessingToday(d);
      setViewDate(d);
    });
  }, []);
  const isLiveMode = viewDate === processingToday;

  const loadDashboard = useCallback(() => {
    if (isLiveMode) {
      attendanceApi.getDashboard(deptFilter ? { department_id: deptFilter } : {})
        .then(r => setDashboard(r.data.data || [])).catch(() => {});
    } else {
      attendanceApi.getDashboardByDate({ date: viewDate, ...(deptFilter ? { department_id: deptFilter } : {}) })
        .then(r => setDashboard(r.data.data || [])).catch(() => {});
    }
  }, [deptFilter, viewDate, isLiveMode]);

  const loadRfidCards = useCallback(() => {
    attendanceApi.getRfidCards().then(r => setRfidCards(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    hrApi.getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
    hrApi.getAllStaff().then(r => setAllStaff(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { if (tab === "live") loadDashboard(); }, [tab, loadDashboard]);
  useEffect(() => { if (tab === "rfid") loadRfidCards(); }, [tab, loadRfidCards]);
  useEffect(() => { if (tab === "settings") loadAttendanceSettings(); }, [tab, loadAttendanceSettings]);
  useEffect(() => { if (tab === "schedule") loadScheduleSettings(); }, [tab, loadScheduleSettings]);

  const [statusThresholds, setStatusThresholds] = useState({
    min_present_hours: 6, min_half_day_hours: 3, max_absent_hours: 1, min_session_minutes: 0
  });
  const [thresholdsMsg, setThresholdsMsg] = useState(null);

  const loadStatusThresholds = useCallback(() => {
    attendanceApi.getStatusThresholds().then(r => setStatusThresholds(r.data.data)).catch(() => {});
  }, []);

  const saveStatusThresholds = async () => {
    setThresholdsMsg(null);
    try {
      await attendanceApi.updateStatusThresholds({
        min_present_hours: Number(statusThresholds.min_present_hours),
        min_half_day_hours: Number(statusThresholds.min_half_day_hours),
        max_absent_hours: Number(statusThresholds.max_absent_hours),
        min_session_minutes: Number(statusThresholds.min_session_minutes),
      });
      setThresholdsMsg({ type: "success", text: "Attendance status thresholds saved." });
    } catch (e) {
      setThresholdsMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed to save." });
    }
    setTimeout(() => setThresholdsMsg(null), 8000);
  };

  useEffect(() => { if (tab === "settings") loadStatusThresholds(); }, [tab, loadStatusThresholds]);

  const assignCard = async () => {
    setCardMsg(null);
    if (!cardForm.staff_id || !cardForm.card_uid.trim()) { setCardMsg({ type: "error", text: "Select staff and enter card UID." }); setTimeout(() => setCardMsg(null), 5000); return; }
    try {
      await attendanceApi.assignRfidCard({ staff_id: Number(cardForm.staff_id), card_uid: cardForm.card_uid.trim() });
      setCardMsg({ type: "success", text: "Card assigned." });
      setCardForm({ staff_id: "", card_uid: "" });
      loadRfidCards();
    } catch (e) {
      setCardMsg({ type: "error", text: e.response?.data?.message || e.response?.data?.detail?.message || "Failed." });
    }
    setTimeout(() => setCardMsg(null), 5000);
  };

  const deactivateCard = async (id) => {
    if (!window.confirm("Deactivate this card?")) return;
    try { await attendanceApi.deactivateRfidCard(id); showFlash("success", "Card deactivated."); loadRfidCards(); }
    catch (e) { showFlash("error", "Failed."); }
  };

  const [dayDetailExpanded, setDayDetailExpanded] = useState(false);
  const [modalViewMonth, setModalViewMonth] = useState(now);
  const [modalDailyStatus, setModalDailyStatus] = useState([]);

  const loadModalDailyStatus = (staffId, monthDate) => {
    const from = toLocalDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
    const to = toLocalDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
    attendanceApi.getStaffDailyStatus(staffId, { from_date: from, to_date: to })
      .then(r => setModalDailyStatus(r.data.data || [])).catch(() => setModalDailyStatus([]));
  };

  const openStaffSessions = async (staffId, staffName) => {
    setSelectedStaff({ id: staffId, name: staffName });
    setEditingSessionId(null);
    setDayDetailExpanded(false);
    setSessionForm({ clock_in_at: "", clock_out_at: "", notes: "" });
    const initialMonth = !isLiveMode ? new Date(viewDate + "T00:00:00") : new Date((processingToday || toLocalDateStr(now)) + "T00:00:00");
    setModalViewMonth(initialMonth);
    loadModalDailyStatus(staffId, initialMonth);
    try {
      const r = await attendanceApi.getStaffSessions(staffId);
      setSessions(r.data.data || []);
    } catch (e) { setSessions([]); }
  };

  const modalGoPrevMonth = () => {
    const m = new Date(modalViewMonth.getFullYear(), modalViewMonth.getMonth() - 1, 1);
    setModalViewMonth(m);
    loadModalDailyStatus(selectedStaff.id, m);
  };
  const modalGoNextMonth = () => {
    const m = new Date(modalViewMonth.getFullYear(), modalViewMonth.getMonth() + 1, 1);
    setModalViewMonth(m);
    loadModalDailyStatus(selectedStaff.id, m);
  };

  // Shared by both the day-summary card and the sessions table below it,
  // so expanding the summary shows sessions for the SAME date, not all-time.
  const targetDateStr = !isLiveMode ? viewDate : (processingToday || toLocalDateStr(now));
  const daySessions = sessions.filter(s => s.clock_in_at.slice(0, 10) === targetDateStr);
  const dayFirstIn = daySessions.length ? daySessions.reduce((a, b) => a.clock_in_at < b.clock_in_at ? a : b) : null;
  const dayOpenOnes = daySessions.filter(s => !s.clock_out_at);
  const dayClosedOnes = daySessions.filter(s => s.clock_out_at);
  const dayLastOut = dayClosedOnes.length ? dayClosedOnes.reduce((a, b) => a.clock_out_at > b.clock_out_at ? a : b) : null;
  const dayTotalMs = daySessions.reduce((sum, s) => {
    const end = s.clock_out_at ? new Date(s.clock_out_at) : now;
    return sum + (end - new Date(s.clock_in_at));
  }, 0);

  const reloadSelectedSessions = async () => {
    if (!selectedStaff) return;
    const r = await attendanceApi.getStaffSessions(selectedStaff.id);
    setSessions(r.data.data || []);
  };

  const saveSession = async () => {
    if (!sessionForm.clock_in_at) { showFlash("error", "Clock in time is required."); return; }
    try {
      if (editingSessionId) {
        await attendanceApi.updateSession(editingSessionId, {
          clock_in_at: sessionForm.clock_in_at || null,
          clock_out_at: sessionForm.clock_out_at || null,
          notes: sessionForm.notes || null,
        });
        showFlash("success", "Session updated.");
      } else {
        await attendanceApi.createSession({
          staff_id: selectedStaff.id,
          clock_in_at: sessionForm.clock_in_at,
          clock_out_at: sessionForm.clock_out_at || null,
          notes: sessionForm.notes || null,
        });
        showFlash("success", "Session added.");
      }
      setEditingSessionId(null);
      setSessionForm({ clock_in_at: "", clock_out_at: "", notes: "" });
      reloadSelectedSessions();
      loadDashboard();
    } catch (e) {
      showFlash("error", e.response?.data?.message || e.response?.data?.detail?.message || "Failed.");
    }
  };

  const editSession = (s) => {
    setEditingSessionId(s.id);
    setSessionForm({
      clock_in_at: toDatetimeLocal(s.clock_in_at),
      clock_out_at: toDatetimeLocal(s.clock_out_at),
      notes: s.notes || "",
    });
  };

  const deleteSession = async (id) => {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    try {
      await attendanceApi.deleteSession(id);
      showFlash("success", "Session deleted.");
      reloadSelectedSessions();
      loadDashboard();
    } catch (e) { showFlash("error", "Failed."); }
  };

  return (
    <div className="ad-page">
      <h1 className="ad-title">Employee Attendance</h1>

      <div className="ad-tab-row">
        {(isRestrictedMode ? ["live"] : TABS_SHOWN).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="ad-tab-btn"
            style={{
              "--tab-color": tab === t ? "#0f4c35" : "var(--text-secondary)",
              "--tab-border": tab === t ? "#0f4c35" : "transparent"
            }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <div>
          <div className="ad-filter-row">
            <div className="ad-filter-group">
              {isRestrictedMode && myDeptIds.length <= 1 ? (
                <div className="ad-dept-label">
                  {departments.find(d => myDeptIds.includes(d.id))?.name || "My Department"}
                </div>
              ) : (
                <select className="form-input ad-select-sm" value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}>
                  {!isRestrictedMode && <option value="">All Departments</option>}
                  {(isRestrictedMode ? departments.filter(d => myDeptIds.includes(d.id)) : departments).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <input type="text" className="form-input ad-input-sm" placeholder="Search name..."
                value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
              <select className="form-input ad-input-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                {isLiveMode ? (
                  <>
                    <option value="in">Clocked In</option>
                    <option value="out">Clocked Out</option>
                    <option value="none">Not Clocked In</option>
                  </>
                ) : (
                  Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)
                )}
              </select>
              <DatePicker value={viewDate} onChange={setViewDate} max={processingToday || toLocalDateStr(now)} style={{ width: 150 }} />
              {!isLiveMode && (
                <button className="btn btn-ghost btn-sm ad-back-today-btn" onClick={() => setViewDate(processingToday || toLocalDateStr(now))}>Back to Today</button>
              )}
            </div>
            <div className="ad-summary-text">
              {isLiveMode
                ? dashboard.filter(d => d.open_session_id).length + " of " + dashboard.length + " currently clocked in"
                : dashboard.filter(d => d.status === "present").length + " present, " +
                  dashboard.filter(d => d.status === "absent").length + " absent, " +
                  dashboard.filter(d => d.status === "on_leave").length + " on leave"}
            </div>
          </div>

          {(() => {
            const filteredDashboard = dashboard.filter(s => {
              if (nameFilter && !((s.first_name + " " + s.last_name).toLowerCase().includes(nameFilter.toLowerCase()))) return false;
              if (statusFilter) {
                if (isLiveMode) {
                  const state = s.open_session_id ? "in" : (s.has_session_today ? "out" : "none");
                  if (state !== statusFilter) return false;
                } else if (s.status !== statusFilter) return false;
              }
              return true;
            });
            return (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr className="ad-tr">
                  {(isLiveMode ? ["Name", "Department", "Status", "Since", "Duration", ""] : ["Name", "Department", "Status", ""]).map(h => (
                    <th key={h} className="ad-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDashboard.map(s => (
                  <tr key={s.staff_id} className="ad-tr">
                    <td className="ad-td-bold">{s.first_name} {s.last_name}</td>
                    <td className="ad-td-secondary">{s.department_name || "-"}</td>
                    <td className="ad-td">
                      {isLiveMode ? (
                        <>
                          <span className="ad-status-badge" style={{
                            "--badge-bg": s.open_session_id ? "var(--bg-success-soft)" : "var(--bg-hover)",
                            "--badge-color": s.open_session_id ? "#166534" : "var(--text-secondary)",
                            "--badge-border": s.open_session_id ? "#bbf7d0" : "var(--border-color)"
                          }}>
                            {s.open_session_id ? "Clocked In" : (s.has_session_today ? "Clocked Out" : "Not Clocked In")}
                          </span>
                          {s.is_late && s.open_session_id && (
                            <span className="ad-late-tag">
                              Late
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="ad-status-badge" style={{
                            "--badge-bg": (STATUS_COLORS[s.status] || STATUS_COLORS.pending).bg,
                            "--badge-color": (STATUS_COLORS[s.status] || STATUS_COLORS.pending).color,
                          }}>
                            {STATUS_LABELS[s.status] || s.status}
                          </span>
                          {s.is_late && (
                            <span className="ad-late-tag">
                              Late
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    {isLiveMode && (
                      <>
                        <td className="ad-td-secondary">{s.current_clock_in ? fmtTime(s.current_clock_in) : "-"}</td>
                        <td className="ad-td-secondary">
                          {s.current_clock_in ? formatDuration(now - new Date(s.current_clock_in)) : "-"}
                        </td>
                      </>
                    )}
                    <td className="ad-td">
                      <button className="btn btn-ghost btn-sm ad-view-details-btn" onClick={() => openStaffSessions(s.staff_id, s.first_name + " " + s.last_name)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDashboard.length === 0 && (
                  <tr><td colSpan={isLiveMode ? 6 : 4} className="ad-empty-row">No staff found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
            );
          })()}
        </div>
      )}

      {tab === "rfid" && (
        <div>
          <div className="ad-card">
            <div className="ad-card-title">Assign RFID Card</div>
            <div className="ad-assign-row">
              <select className="form-input ad-select-flex" value={cardForm.staff_id}
                onChange={e => setCardForm(p => ({ ...p, staff_id: e.target.value }))}>
                <option value="">Select staff...</option>
                {allStaff.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} {s.employee_code ? "(" + s.employee_code + ")" : ""}</option>)}
              </select>
              <input className="form-input ad-input-flex" placeholder="Card UID (scan or type)"
                value={cardForm.card_uid} onChange={e => setCardForm(p => ({ ...p, card_uid: e.target.value }))} />
              <button className="btn btn-primary btn-sm ad-assign-btn" onClick={assignCard}>Assign</button>
            </div>
            {cardMsg && (
              <div className="ad-msg" style={{
                "--msg-bg": cardMsg.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
                "--msg-color": cardMsg.type === "success" ? "#166534" : "#dc2626"
              }}>
                {cardMsg.type === "success" ? "✓ " : "⚠ "}{cardMsg.text}
              </div>
            )}
          </div>

          <div className="ad-card-flat">
            <div className="ad-card-header">Assigned Cards</div>
            {rfidCards.length === 0 ? (
              <div className="ad-empty-text">No cards assigned yet.</div>
            ) : (
              rfidCards.map(c => (
                <div key={c.id} className="ad-card-row">
                  <div>
                    <div className="ad-card-row-name">{c.first_name} {c.last_name}</div>
                    <div className="ad-card-row-uid">{c.card_uid}</div>
                  </div>
                  <div className="ad-card-row-right">
                    <span className="ad-active-badge" style={{
                      "--badge-bg": c.is_active ? "#f0fdf4" : "#fef2f2",
                      "--badge-color": c.is_active ? "#166534" : "#991b1b"
                    }}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                    {c.is_active && (
                      <button className="btn btn-ghost btn-sm ad-deactivate-btn" onClick={() => deactivateCard(c.id)}>Deactivate</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "biometric" && <StaffBiometricTab />}

      {tab === "settings" && <StaffMethodsCard locked={attendanceSettingsLocked} />}

      {tab === "settings" && (
        <div className="ad-settings-card">
          <div className="ad-settings-title">Auto Clock-Out Time</div>
          {attendanceSettingsLocked && (
            <div className="ad-readonly-notice">
              Managed centrally by the superadmin. Read-only here.
            </div>
          )}
          <div className="ad-settings-desc">
            Every day at this time, any employee still clocked in will be automatically clocked out.
          </div>
          <div className="ad-time-row">
            <input type="time" className="form-input ad-time-input" disabled={attendanceSettingsLocked}
              value={autoCloseTime} onChange={e => { setAutoCloseTime(e.target.value); setSettingsMsg(null); }} />
            {!attendanceSettingsLocked && <button className="btn btn-primary btn-sm ad-save-btn" onClick={saveAttendanceSettings}>Save</button>}
          </div>
          {settingsMsg && (
            <div className="ad-msg" style={{
              "--msg-bg": settingsMsg.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
              "--msg-color": settingsMsg.type === "success" ? "#166534" : "#dc2626"
            }}>
              {settingsMsg.type === "success" ? "✓ " : "⚠ "}{settingsMsg.text}
            </div>
          )}
          <div className="ad-help-text">
            Checked every 15 minutes by the background scheduler - changes may take up to 15 minutes to take effect on the next run.
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="ad-settings-card-mt">
          <div className="ad-settings-title">Attendance Status Thresholds</div>
          {thresholdsLocked && (
            <div className="ad-readonly-notice">
              Managed centrally by the superadmin. Read-only here.
            </div>
          )}
          <div className="ad-settings-desc">
            Once saved, changes only apply going forward - already-finalized past days are never reclassified.
          </div>

          <div className="ad-field-grid">
            <div>
              <label className="ad-field-label">Minimum Hours for Present</label>
              <input type="number" step="0.5" className="form-input ad-number-input" disabled={thresholdsLocked}
                value={statusThresholds.min_present_hours}
                onChange={e => { setStatusThresholds(p => ({ ...p, min_present_hours: e.target.value })); setThresholdsMsg(null); }} />
            </div>
            <div>
              <label className="ad-field-label">Minimum Hours for Half Day</label>
              <input type="number" step="0.5" className="form-input ad-number-input" disabled={thresholdsLocked}
                value={statusThresholds.min_half_day_hours}
                onChange={e => { setStatusThresholds(p => ({ ...p, min_half_day_hours: e.target.value })); setThresholdsMsg(null); }} />
            </div>
            <div>
              <label className="ad-field-label">Maximum Hours for Absent (at or below this = Absent)</label>
              <input type="number" step="0.5" className="form-input ad-number-input" disabled={thresholdsLocked}
                value={statusThresholds.max_absent_hours}
                onChange={e => { setStatusThresholds(p => ({ ...p, max_absent_hours: e.target.value })); setThresholdsMsg(null); }} />
            </div>
            <div>
              <label className="ad-field-label">Minimum Session Duration Before Clock Out (minutes, 0 = disabled)</label>
              <input type="number" className="form-input ad-number-input" disabled={thresholdsLocked}
                value={statusThresholds.min_session_minutes}
                onChange={e => { setStatusThresholds(p => ({ ...p, min_session_minutes: e.target.value })); setThresholdsMsg(null); }} />
            </div>
          </div>

          {!thresholdsLocked && <button className="btn btn-primary btn-sm ad-save-btn-mt" onClick={saveStatusThresholds}>Save</button>}

          {thresholdsMsg && (
            <div className="ad-msg" style={{
              "--msg-bg": thresholdsMsg.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
              "--msg-color": thresholdsMsg.type === "success" ? "#166534" : "#dc2626"
            }}>
              {thresholdsMsg.type === "success" ? "\u2713 " : "\u26a0 "}{thresholdsMsg.text}
            </div>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div>
          <div className="ad-card">
            <div className="ad-card-title">Attendance Timing Mode</div>
            <div className="ad-radio-row">
              <label className="ad-radio-label">
                <input type="radio" checked={scheduleSettings.mode === "same_for_all"}
                  onChange={() => setScheduleSettings(p => ({ ...p, mode: "same_for_all" }))}/>
                Same timing for all departments
              </label>
              <label className="ad-radio-label">
                <input type="radio" checked={scheduleSettings.mode === "per_department"}
                  onChange={() => setScheduleSettings(p => ({ ...p, mode: "per_department" }))}/>
                Separate timing per department
              </label>
            </div>

            <div className="ad-schedule-label">
              {scheduleSettings.mode === "same_for_all" ? "Timing (applies to everyone)" : "Default Timing (fallback for unconfigured departments)"}
            </div>
            <div className="ad-time-group-row">
              <div>
                <label className="ad-small-field-label">Start Time</label>
                <input type="time" className="form-input ad-time-group-field-140"
                  value={scheduleSettings.default_start_time} onChange={e => setScheduleSettings(p => ({ ...p, default_start_time: e.target.value }))}/>
              </div>
              <div>
                <label className="ad-small-field-label">End Time</label>
                <input type="time" className="form-input ad-time-group-field-140"
                  value={scheduleSettings.default_end_time} onChange={e => setScheduleSettings(p => ({ ...p, default_end_time: e.target.value }))}/>
              </div>
              <div>
                <label className="ad-small-field-label">Grace Period (minutes)</label>
                <input type="number" className="form-input ad-time-group-field-140"
                  value={scheduleSettings.grace_minutes} onChange={e => setScheduleSettings(p => ({ ...p, grace_minutes: e.target.value }))}/>
              </div>
              <button className="btn btn-primary btn-sm ad-save-btn" onClick={saveScheduleSettings}>Save</button>
            </div>

            {scheduleMsg && (
              <div className="ad-msg" style={{
                "--msg-bg": scheduleMsg.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
                "--msg-color": scheduleMsg.type === "success" ? "#166534" : "#dc2626"
              }}>
                {scheduleMsg.type === "success" ? "\u2713 " : "\u26a0 "}{scheduleMsg.text}
              </div>
            )}
          </div>

          {scheduleSettings.mode === "per_department" && (
            <div className="ad-card">
              <div className="ad-card-title">Per-Department Timing</div>
              <div className="ad-dept-schedule-form">
                <div>
                  <label className="ad-small-field-label">Department</label>
                  <select className="form-input ad-time-group-field-200" value={deptScheduleForm.department_id}
                    onChange={e => setDeptScheduleForm(p => ({ ...p, department_id: e.target.value }))}>
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ad-small-field-label">Start</label>
                  <input type="time" className="form-input ad-time-group-field-120"
                    value={deptScheduleForm.start_time} onChange={e => setDeptScheduleForm(p => ({ ...p, start_time: e.target.value }))}/>
                </div>
                <div>
                  <label className="ad-small-field-label">End</label>
                  <input type="time" className="form-input ad-time-group-field-120"
                    value={deptScheduleForm.end_time} onChange={e => setDeptScheduleForm(p => ({ ...p, end_time: e.target.value }))}/>
                </div>
                <div>
                  <label className="ad-small-field-label">Grace (min)</label>
                  <input type="number" className="form-input ad-time-group-field-90"
                    value={deptScheduleForm.grace_minutes} onChange={e => setDeptScheduleForm(p => ({ ...p, grace_minutes: e.target.value }))}/>
                </div>
                <button className="btn btn-primary btn-sm ad-save-btn" onClick={saveDeptSchedule}>Save</button>
              </div>

              {deptSchedules.length === 0 ? (
                <div className="ad-dept-schedule-empty">No department-specific schedules configured yet - all departments use the default timing above.</div>
              ) : (
                deptSchedules.map(ds => (
                  <div key={ds.id} className="ad-dept-schedule-row">
                    <div>
                      <div className="ad-dept-schedule-name">{ds.department_name}</div>
                      <div className="ad-dept-schedule-meta">{ds.start_time} - {ds.end_time} (grace: {ds.grace_minutes} min)</div>
                    </div>
                    <div className="ad-dept-schedule-actions">
                      <button className="btn btn-ghost btn-sm ad-edit-btn"
                        onClick={() => setDeptScheduleForm({ department_id: String(ds.department_id), start_time: ds.start_time, end_time: ds.end_time, grace_minutes: ds.grace_minutes })}>
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm ad-remove-btn" onClick={() => removeDeptSchedule(ds.department_id)}>Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {selectedStaff && (
        <div className="ad-modal-overlay"
          onClick={() => setSelectedStaff(null)}>
          <div className="ad-modal-box"
            onClick={e => e.stopPropagation()}>
            <div className="ad-modal-header">
              <div className="ad-modal-title">{selectedStaff.name} - Attendance Sessions</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStaff(null)}>Close</button>
            </div>
            <div className="ad-modal-body">
              {!isRestrictedMode && (
              <div className="ad-add-session-box">
                <div className="ad-add-session-title">{editingSessionId ? "Edit Session" : "Add Manual Session"}</div>
                <div className="ad-datetime-grid">
                  <div>
                    <label className="ad-small-field-label">Clock In *</label>
                    <DateTimePicker style={{ width: "100%", fontSize: 12 }}
                      value={sessionForm.clock_in_at} onChange={val => setSessionForm(p => ({ ...p, clock_in_at: val }))} />
                  </div>
                  <div>
                    <label className="ad-small-field-label">Clock Out</label>
                    <DateTimePicker style={{ width: "100%", fontSize: 12 }}
                      value={sessionForm.clock_out_at} onChange={val => setSessionForm(p => ({ ...p, clock_out_at: val }))} />
                  </div>
                </div>
                <input className="form-input ad-notes-input" placeholder="Notes (reason for manual entry/correction)"
                  value={sessionForm.notes} onChange={e => setSessionForm(p => ({ ...p, notes: e.target.value }))} />
                <div className="ad-form-actions">
                  {editingSessionId && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingSessionId(null); setSessionForm({ clock_in_at: "", clock_out_at: "", notes: "" }); }}>
                      Cancel Edit
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm ad-save-btn" onClick={saveSession}>
                    {editingSessionId ? "Update Session" : "Add Session"}
                  </button>
                </div>
              </div>
              )}

              <div className="ad-day-summary-card">
                <div onClick={() => setDayDetailExpanded(!dayDetailExpanded)}
                  className="ad-day-summary-header">
                  <div>
                    <div className="ad-day-summary-title">{(() => { const d = new Date(targetDateStr + "T00:00:00"); return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]}, ${formatDate(d)}`; })()}</div>
                    <div className="ad-day-summary-meta">
                      {daySessions.length === 0 ? "No sessions recorded" : (
                        <>First in: <strong>{fmtTime(dayFirstIn.clock_in_at)}</strong> &middot; Last out: <strong>{dayLastOut ? fmtTime(dayLastOut.clock_out_at) : (dayOpenOnes.length ? "Still in" : "-")}</strong> &middot; Total: <strong>{formatDuration(dayTotalMs)}</strong></>
                      )}
                    </div>
                  </div>
                  <span className="ad-expand-toggle">{dayDetailExpanded ? "\u25b2 Hide" : "\u25bc " + daySessions.length + " session(s)"}</span>
                </div>
              </div>

              {dayDetailExpanded && (
              <table className="ad-table">
                <thead>
                  <tr className="ad-tr">
                    {(isRestrictedMode ? ["Clock In", "Clock Out", "Duration", "Source"] : ["Clock In", "Clock Out", "Duration", "Source", ""]).map(h => (
                      <th key={h} className="ad-sessions-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daySessions.map(s => (
                    <tr key={s.id} className="ad-tr">
                      <td className="ad-sessions-td">
                        {fmtTime(s.clock_in_at)}
                        {s.is_late && <span className="ad-late-tag-sm">Late</span>}
                      </td>
                      <td className="ad-sessions-td">
                        {s.clock_out_at ? fmtTime(s.clock_out_at) : <span className="ad-open-text">Open</span>}
                        {s.auto_closed && <span className="ad-auto-closed-tag">Auto-closed</span>}
                      </td>
                      <td className="ad-sessions-td-bold">
                        {formatDuration((s.clock_out_at ? new Date(s.clock_out_at) : now) - new Date(s.clock_in_at))}
                      </td>
                      <td className="ad-sessions-td">
                        <span className="ad-source-tag">{s.source}</span>
                      </td>
                      {!isRestrictedMode && (
                      <td className="ad-actions-cell">
                        <button className="btn btn-ghost btn-sm ad-edit-btn" onClick={() => editSession(s)}>Edit</button>
                        <button className="btn btn-ghost btn-sm ad-remove-btn" onClick={() => deleteSession(s.id)}>Delete</button>
                      </td>
                      )}
                    </tr>
                  ))}
                  {daySessions.length === 0 && (
                    <tr><td colSpan={isRestrictedMode ? 4 : 5} className="ad-empty-row">No sessions recorded.</td></tr>
                  )}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className="ad-flash-toast" style={{
          "--flash-bg": flash.type === "success" ? "var(--bg-success-soft)" : "var(--bg-danger-soft)",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>{flash.msg}</div>
      )}
    </div>
  );
}
