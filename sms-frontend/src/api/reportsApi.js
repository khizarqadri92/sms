import client from "./client";
const reportsApi = {
  getAttendanceDirectory: (params) => client.get("/reports/attendance/directory", { params }),
  getAttendanceDaily:     (params) => client.get("/reports/attendance/daily", { params }),
  getAttendanceMonthly:   (staffId, params) => client.get(`/reports/attendance/monthly/${staffId}`, { params }),
};
export default reportsApi;
