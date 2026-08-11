import client from "./client";
const incomeTaxApi = {
  search:          (params)         => client.get("/payroll/income-tax/search", { params }),
  getTransactions: (staffId, params) => client.get(`/payroll/income-tax/staff/${staffId}/transactions`, { params }),
};
export default incomeTaxApi;
