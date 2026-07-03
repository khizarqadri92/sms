import client from "./client";

const attendanceApi = {
  mark:          (data)                => client.post("/attendance/mark", data),
  getByClass:    (classId, date, subjectId) => client.get(`/attendance/class/${classId}`, { params: { date, subject_id: subjectId } }),
  getByStudent:  (studentId, params)   => client.get(`/attendance/student/${studentId}`, { params }),
  getSummary:    (studentId, params)   => client.get(`/attendance/student/${studentId}/summary`, { params }),
  getMy:         (params)              => client.get("/attendance/my", { params }),
  getReport:     (params)              => client.get("/attendance/report", { params }),
  getBreakdown:  (params)              => client.get("/attendance/report", { params: {...params, breakdown:"true"} }),
  getConfig:     ()                    => client.get("/attendance/config"),
};

export default attendanceApi;