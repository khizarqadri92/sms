import client from "./client";

const providentFundApi = {
  search:            (params)          => client.get("/payroll/pf/search", { params }),
  getTransactions:   (staffId, params)  => client.get(`/payroll/pf/staff/${staffId}/transactions`, { params }),
  upsertGradeConfig: (data)             => client.post("/payroll/pf/grade-config", data),
  upsertStaffConfig: (data)             => client.post("/payroll/pf/staff-config", data),
  postAdjustment:    (data)             => client.post("/payroll/pf/adjustment", data),
};

export default providentFundApi;
