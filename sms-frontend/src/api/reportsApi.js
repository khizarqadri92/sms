import client from "./client";
const reportsApi = {
  getAttendanceDirectory: (params) => client.get("/reports/attendance/directory", { params }),
  getAttendanceDaily:     (params) => client.get("/reports/attendance/daily", { params }),
  getAttendanceMonthly:   (staffId, params) => client.get(`/reports/attendance/monthly/${staffId}`, { params }),
  getEmployeeSalaries:    (params) => client.get("/reports/employee-salaries", { params }),
  getExpenditureDetails:  (params) => client.get("/reports/expenditure-details", { params }),
  getExpenditureTypes:    ()       => client.get("/reports/expenditure-types-list"),
};
export default reportsApi;
