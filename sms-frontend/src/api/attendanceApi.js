import client from "./client";

const attendanceApi = {
  // Student attendance (separate module from staff-attendance below)
  getConfig:  ()                            => client.get("/attendance/config"),
  mark:       (data)                        => client.post("/attendance/mark", data),
  getByClass: (classId, date, subjectId)    => client.get(`/attendance/class/${classId}`, { params: { date, subject_id: subjectId || undefined } }),
  getByStudent: (studentId, params)         => client.get(`/attendance/student/${studentId}`, { params }),
  getMy:      (params)                      => client.get("/attendance/my", { params }),
  getTeacherReport: (params)                => client.get("/attendance/teacher-report", { params }),
  // Self-service
  getMyToday:      ()          => client.get("/staff-attendance/my/today"),
  getMyHistory:    (params)    => client.get("/staff-attendance/my/history", { params }),
  getMyDailyStatus: (params)  => client.get("/staff-attendance/my/daily-status", { params }),
  submitCorrectionRequest: (data) => client.post("/staff-attendance/my/correction-request", data),
  getMyCorrectionRequests: ()     => client.get("/staff-attendance/my/correction-requests"),
  getCorrectionRequests:   (params) => client.get("/staff-attendance/correction-requests", { params }),
  advanceCorrectionRequest: (id, data) => client.post(`/staff-attendance/correction-requests/${id}/advance`, data),
  getMyHodStatus:  ()          => client.get("/staff-attendance/my-hod-status"),
  getStatusThresholds:    ()      => client.get("/staff-attendance/status-thresholds"),
  updateStatusThresholds: (data)  => client.put("/staff-attendance/status-thresholds", data),
  getMyHodStatus:  ()          => client.get("/staff-attendance/my-hod-status"),
  getStatusThresholds:    ()      => client.get("/staff-attendance/status-thresholds"),
  updateStatusThresholds: (data)  => client.put("/staff-attendance/status-thresholds", data),
  toggle:          ()          => client.post("/staff-attendance/my/toggle"),

  // HR: dashboard + sessions
  getDashboard:    (params)    => client.get("/staff-attendance/dashboard", { params }),
  getDashboardByDate: (params) => client.get("/staff-attendance/dashboard-by-date", { params }),
  getStaffSessions:(staffId, params) => client.get(`/staff-attendance/staff/${staffId}/sessions`, { params }),
  getStaffDailyStatus: (staffId, params) => client.get(`/staff-attendance/staff/${staffId}/daily-status`, { params }),
  createSession:   (data)      => client.post("/staff-attendance/sessions", data),
  updateSession:   (id, data)  => client.put(`/staff-attendance/sessions/${id}`, data),
  deleteSession:   (id)        => client.delete(`/staff-attendance/sessions/${id}`),

  // HR: RFID cards
  getSettings:     ()          => client.get("/staff-attendance/settings"),
  getScheduleSettings: ()      => client.get("/staff-attendance/schedule-settings"),
  updateScheduleSettings: (data) => client.put("/staff-attendance/schedule-settings", data),
  upsertDeptSchedule: (data)   => client.post("/staff-attendance/schedule-settings/departments", data),
  deleteDeptSchedule: (deptId) => client.delete(`/staff-attendance/schedule-settings/departments/${deptId}`),
  updateSettings:  (data)      => client.put("/staff-attendance/settings", data),
  getRfidCards:    ()          => client.get("/staff-attendance/rfid-cards"),
  assignRfidCard:  (data)      => client.post("/staff-attendance/rfid-cards", data),
  deactivateRfidCard: (id)     => client.delete(`/staff-attendance/rfid-cards/${id}`),
};

export default attendanceApi;
