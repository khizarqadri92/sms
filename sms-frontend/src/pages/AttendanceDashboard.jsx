import React, { useState, useEffect, useCallback } from "react";
import attendanceApi from "../api/attendanceApi";
import hrApi from "../api/hrApi";
import settingsApi from "../api/settingsApi";
import processingDateApi from "../api/processingDateApi";
import DatePicker from "../components/DatePicker";

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
  weekly_off: { bg: "#f8fafc", color: "#64748b" },
  holiday: { bg: "#eff6ff", color: "#1d4ed8" },
  on_leave: { bg: "#fef3c7", color: "#92400e" },
  absent: { bg: "#fef2f2", color: "#dc2626" },
  pending: { bg: "#f8fafc", color: "#94a3b8" },
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
const TAB_LABELS = { live: "Live Status", rfid: "RFID Cards", settings: "Settings", schedule: "Schedule" };

export default function AttendanceDashboard() {
  const [tab, setTab] = useState("live");
  const [flash, setFlash] = useState(null);
  const [now, setNow] = useState(new Date());
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
      const d = toLocalDateStr(new Date());
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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

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
    if (!cardForm.staff_id || !cardForm.card_uid.trim()) { showFlash("error", "Select staff and enter card UID."); return; }
    try {
      await attendanceApi.assignRfidCard({ staff_id: Number(cardForm.staff_id), card_uid: cardForm.card_uid.trim() });
      showFlash("success", "Card assigned.");
      setCardForm({ staff_id: "", card_uid: "" });
      loadRfidCards();
    } catch (e) {
      showFlash("error", e.response?.data?.message || e.response?.data?.detail?.message || "Failed.");
    }
  };

  const deactivateCard = async (id) => {
    if (!window.confirm("Deactivate this card?")) return;
    try { await attendanceApi.deactivateRfidCard(id); showFlash("success", "Card deactivated."); loadRfidCards(); }
    catch (e) { showFlash("error", "Failed."); }
  };

  const [dayDetailExpanded, setDayDetailExpanded] = useState(false);
  const [modalViewMonth, setModalViewMonth] = useState(new Date());
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
    const initialMonth = !isLiveMode ? new Date(viewDate + "T00:00:00") : new Date((processingToday || toLocalDateStr(new Date())) + "T00:00:00");
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
  const targetDateStr = !isLiveMode ? viewDate : (processingToday || toLocalDateStr(new Date()));
  const daySessions = sessions.filter(s => s.clock_in_at.slice(0, 10) === targetDateStr);
  const dayFirstIn = daySessions.length ? daySessions.reduce((a, b) => a.clock_in_at < b.clock_in_at ? a : b) : null;
  const dayOpenOnes = daySessions.filter(s => !s.clock_out_at);
  const dayClosedOnes = daySessions.filter(s => s.clock_out_at);
  const dayLastOut = dayClosedOnes.length ? dayClosedOnes.reduce((a, b) => a.clock_out_at > b.clock_out_at ? a : b) : null;
  const dayTotalMs = daySessions.reduce((sum, s) => {
    const end = s.clock_out_at ? new Date(s.clock_out_at) : new Date();
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
    <div style={{ padding: 24, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#0f172a" }}>Employee Attendance</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
        {(isRestrictedMode ? ["live"] : TABS).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "10px 18px", fontSize: 13, fontWeight: 600, border: "none", background: "none", cursor: "pointer",
              color: tab === t ? "#0f4c35" : "#64748b",
              borderBottom: "2px solid " + (tab === t ? "#0f4c35" : "transparent")
            }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {isRestrictedMode && myDeptIds.length <= 1 ? (
                <div style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#374151", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                  {departments.find(d => myDeptIds.includes(d.id))?.name || "My Department"}
                </div>
              ) : (
                <select className="form-input" style={{ width: 200, fontSize: 13 }} value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}>
                  {!isRestrictedMode && <option value="">All Departments</option>}
                  {(isRestrictedMode ? departments.filter(d => myDeptIds.includes(d.id)) : departments).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <input type="text" className="form-input" style={{ fontSize: 13, width: 160 }} placeholder="Search name..."
                value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
              <select className="form-input" style={{ fontSize: 13, width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
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
              <DatePicker value={viewDate} onChange={setViewDate} max={processingToday || toLocalDateStr(new Date())} style={{ width: 150 }} />
              {!isLiveMode && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setViewDate(processingToday || toLocalDateStr(new Date()))}>Back to Today</button>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
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
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {(isLiveMode ? ["Name", "Department", "Status", "Since", "Duration", ""] : ["Name", "Department", "Status", ""]).map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDashboard.map(s => (
                  <tr key={s.staff_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{s.first_name} {s.last_name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{s.department_name || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {isLiveMode ? (
                        <>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                            background: s.open_session_id ? "#f0fdf4" : "#f8fafc",
                            color: s.open_session_id ? "#166534" : "#64748b",
                            border: "1px solid " + (s.open_session_id ? "#bbf7d0" : "#e2e8f0")
                          }}>
                            {s.open_session_id ? "Clocked In" : (s.has_session_today ? "Clocked Out" : "Not Clocked In")}
                          </span>
                          {s.is_late && s.open_session_id && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                              Late
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                            background: (STATUS_COLORS[s.status] || STATUS_COLORS.pending).bg,
                            color: (STATUS_COLORS[s.status] || STATUS_COLORS.pending).color,
                          }}>
                            {STATUS_LABELS[s.status] || s.status}
                          </span>
                          {s.is_late && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#fef2f2", color: "#dc2626" }}>
                              Late
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    {isLiveMode && (
                      <>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{s.current_clock_in ? fmtTime(s.current_clock_in) : "-"}</td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>
                          {s.current_clock_in ? formatDuration(now - new Date(s.current_clock_in)) : "-"}
                        </td>
                      </>
                    )}
                    <td style={{ padding: "10px 14px" }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openStaffSessions(s.staff_id, s.first_name + " " + s.last_name)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDashboard.length === 0 && (
                  <tr><td colSpan={isLiveMode ? 6 : 4} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No staff found.</td></tr>
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
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Assign RFID Card</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="form-input" style={{ flex: 1, fontSize: 13 }} value={cardForm.staff_id}
                onChange={e => setCardForm(p => ({ ...p, staff_id: e.target.value }))}>
                <option value="">Select staff...</option>
                {allStaff.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} {s.employee_code ? "(" + s.employee_code + ")" : ""}</option>)}
              </select>
              <input className="form-input" style={{ flex: 1, fontSize: 13 }} placeholder="Card UID (scan or type)"
                value={cardForm.card_uid} onChange={e => setCardForm(p => ({ ...p, card_uid: e.target.value }))} />
              <button className="btn btn-primary btn-sm" style={{ color: "#fff", whiteSpace: "nowrap" }} onClick={assignCard}>Assign</button>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", fontWeight: 700, fontSize: 14 }}>Assigned Cards</div>
            {rfidCards.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No cards assigned yet.</div>
            ) : (
              rfidCards.map(c => (
                <div key={c.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.first_name} {c.last_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{c.card_uid}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      background: c.is_active ? "#f0fdf4" : "#fef2f2",
                      color: c.is_active ? "#166534" : "#991b1b"
                    }}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                    {c.is_active && (
                      <button className="btn btn-ghost btn-sm" style={{ color: "#dc2626", fontSize: 11 }} onClick={() => deactivateCard(c.id)}>Deactivate</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, maxWidth: 480 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Auto Clock-Out Time</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
            Every day at this time, any employee still clocked in will be automatically clocked out.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="time" className="form-input" style={{ fontSize: 14, width: 160 }}
              value={autoCloseTime} onChange={e => { setAutoCloseTime(e.target.value); setSettingsMsg(null); }} />
            <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={saveAttendanceSettings}>Save</button>
          </div>
          {settingsMsg && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: settingsMsg.type === "success" ? "#dcfce7" : "#fee2e2",
              color: settingsMsg.type === "success" ? "#166534" : "#dc2626"
            }}>
              {settingsMsg.type === "success" ? "✓ " : "⚠ "}{settingsMsg.text}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>
            Checked every 15 minutes by the background scheduler - changes may take up to 15 minutes to take effect on the next run.
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, maxWidth: 480, marginTop: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Attendance Status Thresholds</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
            Once saved, changes only apply going forward - already-finalized past days are never reclassified.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Minimum Hours for Present</label>
              <input type="number" step="0.5" className="form-input" style={{ fontSize: 14, width: 160 }}
                value={statusThresholds.min_present_hours}
                onChange={e => { setStatusThresholds(p => ({ ...p, min_present_hours: e.target.value })); setThresholdsMsg(null); }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Minimum Hours for Half Day</label>
              <input type="number" step="0.5" className="form-input" style={{ fontSize: 14, width: 160 }}
                value={statusThresholds.min_half_day_hours}
                onChange={e => { setStatusThresholds(p => ({ ...p, min_half_day_hours: e.target.value })); setThresholdsMsg(null); }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Maximum Hours for Absent (at or below this = Absent)</label>
              <input type="number" step="0.5" className="form-input" style={{ fontSize: 14, width: 160 }}
                value={statusThresholds.max_absent_hours}
                onChange={e => { setStatusThresholds(p => ({ ...p, max_absent_hours: e.target.value })); setThresholdsMsg(null); }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Minimum Session Duration Before Clock Out (minutes, 0 = disabled)</label>
              <input type="number" className="form-input" style={{ fontSize: 14, width: 160 }}
                value={statusThresholds.min_session_minutes}
                onChange={e => { setStatusThresholds(p => ({ ...p, min_session_minutes: e.target.value })); setThresholdsMsg(null); }} />
            </div>
          </div>

          <button className="btn btn-primary btn-sm" style={{ color: "#fff", marginTop: 16 }} onClick={saveStatusThresholds}>Save</button>

          {thresholdsMsg && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: thresholdsMsg.type === "success" ? "#dcfce7" : "#fee2e2",
              color: thresholdsMsg.type === "success" ? "#166534" : "#dc2626"
            }}>
              {thresholdsMsg.type === "success" ? "\u2713 " : "\u26a0 "}{thresholdsMsg.text}
            </div>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Attendance Timing Mode</div>
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={scheduleSettings.mode === "same_for_all"}
                  onChange={() => setScheduleSettings(p => ({ ...p, mode: "same_for_all" }))}/>
                Same timing for all departments
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={scheduleSettings.mode === "per_department"}
                  onChange={() => setScheduleSettings(p => ({ ...p, mode: "per_department" }))}/>
                Separate timing per department
              </label>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
              {scheduleSettings.mode === "same_for_all" ? "Timing (applies to everyone)" : "Default Timing (fallback for unconfigured departments)"}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Start Time</label>
                <input type="time" className="form-input" style={{ fontSize: 13, width: 140 }}
                  value={scheduleSettings.default_start_time} onChange={e => setScheduleSettings(p => ({ ...p, default_start_time: e.target.value }))}/>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>End Time</label>
                <input type="time" className="form-input" style={{ fontSize: 13, width: 140 }}
                  value={scheduleSettings.default_end_time} onChange={e => setScheduleSettings(p => ({ ...p, default_end_time: e.target.value }))}/>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Grace Period (minutes)</label>
                <input type="number" className="form-input" style={{ fontSize: 13, width: 140 }}
                  value={scheduleSettings.grace_minutes} onChange={e => setScheduleSettings(p => ({ ...p, grace_minutes: e.target.value }))}/>
              </div>
              <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={saveScheduleSettings}>Save</button>
            </div>

            {scheduleMsg && (
              <div style={{
                marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: scheduleMsg.type === "success" ? "#dcfce7" : "#fee2e2",
                color: scheduleMsg.type === "success" ? "#166534" : "#dc2626"
              }}>
                {scheduleMsg.type === "success" ? "\u2713 " : "\u26a0 "}{scheduleMsg.text}
              </div>
            )}
          </div>

          {scheduleSettings.mode === "per_department" && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Per-Department Timing</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16, padding: 14, background: "#f8fafc", borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Department</label>
                  <select className="form-input" style={{ fontSize: 13, width: 200 }} value={deptScheduleForm.department_id}
                    onChange={e => setDeptScheduleForm(p => ({ ...p, department_id: e.target.value }))}>
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Start</label>
                  <input type="time" className="form-input" style={{ fontSize: 13, width: 120 }}
                    value={deptScheduleForm.start_time} onChange={e => setDeptScheduleForm(p => ({ ...p, start_time: e.target.value }))}/>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>End</label>
                  <input type="time" className="form-input" style={{ fontSize: 13, width: 120 }}
                    value={deptScheduleForm.end_time} onChange={e => setDeptScheduleForm(p => ({ ...p, end_time: e.target.value }))}/>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Grace (min)</label>
                  <input type="number" className="form-input" style={{ fontSize: 13, width: 90 }}
                    value={deptScheduleForm.grace_minutes} onChange={e => setDeptScheduleForm(p => ({ ...p, grace_minutes: e.target.value }))}/>
                </div>
                <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={saveDeptSchedule}>Save</button>
              </div>

              {deptSchedules.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No department-specific schedules configured yet - all departments use the default timing above.</div>
              ) : (
                deptSchedules.map(ds => (
                  <div key={ds.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{ds.department_name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{ds.start_time} - {ds.end_time} (grace: {ds.grace_minutes} min)</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                        onClick={() => setDeptScheduleForm({ department_id: String(ds.department_id), start_time: ds.start_time, end_time: ds.end_time, grace_minutes: ds.grace_minutes })}>
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "#dc2626" }} onClick={() => removeDeptSchedule(ds.department_id)}>Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {selectedStaff && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setSelectedStaff(null)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 700, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedStaff.name} - Attendance Sessions</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStaff(null)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {!isRestrictedMode && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{editingSessionId ? "Edit Session" : "Add Manual Session"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Clock In *</label>
                    <input type="datetime-local" className="form-input" style={{ width: "100%", fontSize: 12 }}
                      value={sessionForm.clock_in_at} onChange={e => setSessionForm(p => ({ ...p, clock_in_at: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Clock Out</label>
                    <input type="datetime-local" className="form-input" style={{ width: "100%", fontSize: 12 }}
                      value={sessionForm.clock_out_at} onChange={e => setSessionForm(p => ({ ...p, clock_out_at: e.target.value }))} />
                  </div>
                </div>
                <input className="form-input" style={{ width: "100%", fontSize: 12, marginBottom: 10 }} placeholder="Notes (reason for manual entry/correction)"
                  value={sessionForm.notes} onChange={e => setSessionForm(p => ({ ...p, notes: e.target.value }))} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {editingSessionId && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingSessionId(null); setSessionForm({ clock_in_at: "", clock_out_at: "", notes: "" }); }}>
                      Cancel Edit
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={saveSession}>
                    {editingSessionId ? "Update Session" : "Add Session"}
                  </button>
                </div>
              </div>
              )}

              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
                <div onClick={() => setDayDetailExpanded(!dayDetailExpanded)}
                  style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{new Date(targetDateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                      {daySessions.length === 0 ? "No sessions recorded" : (
                        <>First in: <strong>{fmtTime(dayFirstIn.clock_in_at)}</strong> &middot; Last out: <strong>{dayLastOut ? fmtTime(dayLastOut.clock_out_at) : (dayOpenOnes.length ? "Still in" : "-")}</strong> &middot; Total: <strong>{formatDuration(dayTotalMs)}</strong></>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{dayDetailExpanded ? "\u25b2 Hide" : "\u25bc " + daySessions.length + " session(s)"}</span>
                </div>
              </div>

              {dayDetailExpanded && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {(isRestrictedMode ? ["Clock In", "Clock Out", "Duration", "Source"] : ["Clock In", "Clock Out", "Duration", "Source", ""]).map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daySessions.map(s => (
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
                      {!isRestrictedMode && (
                      <td style={{ padding: "8px 10px", display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => editSession(s)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: "#dc2626" }} onClick={() => deleteSession(s.id)}>Delete</button>
                      </td>
                      )}
                    </tr>
                  ))}
                  {daySessions.length === 0 && (
                    <tr><td colSpan={isRestrictedMode ? 4 : 5} style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No sessions recorded.</td></tr>
                  )}
                </tbody>
              </table>
              )}
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
