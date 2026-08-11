import client from "./client";

const resignationApi = {
  getNoticePeriodDays: ()            => client.get("/resignation/notice-period-days"),
  submit:              (data)        => client.post("/resignation/submit", data),
  getMy:               ()            => client.get("/resignation/my"),
  withdraw:            (id)          => client.post(`/resignation/${id}/withdraw`),
  getList:             ()            => client.get("/resignation/list"),
  getOne:              (id)          => client.get(`/resignation/${id}`),
  advance:             (id, data)    => client.post(`/resignation/${id}/advance`, data),
  initClearance:       (id, items)   => client.post(`/resignation/${id}/clearance/init`, { items }),
  clearItem:           (itemId, data) => client.post(`/resignation/clearance/${itemId}/clear`, data),
  reassignClearance:   (itemId, data) => client.post(`/resignation/clearance/${itemId}/reassign`, data),
  notifyClearance:     (itemId, data) => client.post(`/resignation/clearance/${itemId}/notify`, data),
  getDepartmentStaff:  (itemId)      => client.get(`/resignation/clearance/${itemId}/department-staff`),
  submitExperienceLetter: (id, notes)  => client.post(`/resignation/${id}/experience-letter`, { notes }),
  getExperienceLetter: (id)              => client.get(`/resignation/${id}/experience-letter`),
  advanceExperienceLetter: (id, data)    => client.post(`/resignation/${id}/experience-letter/advance`, data),
  completeClearance:   (id)          => client.post(`/resignation/${id}/clearance/complete`),
  skipClearance:       (id)          => client.post(`/resignation/${id}/clearance/skip`),
  calculateSettlement: (id)          => client.post(`/resignation/${id}/settlement/calculate`),
  reviewSettlement:    (id, data)    => client.post(`/resignation/${id}/settlement/review`, data),
  finalizeSettlement:  (id)          => client.post(`/resignation/${id}/settlement/finalize`),
  financeCalculateSettlement: (id)   => client.post(`/resignation/${id}/settlement/finance-calculate`),
  calculateSettlementTax: (id, data) => client.post(`/resignation/${id}/settlement/calculate-tax`, data),
  completeResignation: (id)          => client.post(`/resignation/${id}/complete`),
};

export default resignationApi;
