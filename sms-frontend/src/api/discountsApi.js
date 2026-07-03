import client from "./client";

const discountsApi = {
  getTypes:            ()                  => client.get("/discounts/types"),
  createType:          (data)              => client.post("/discounts/types", data),
  updateType:          (id, data)          => client.put(`/discounts/types/${id}`, data),
  deleteType:          (id)                => client.delete(`/discounts/types/${id}`),
  getStudentDiscounts: (studentId)         => client.get(`/discounts/student/${studentId}`),
  assignDiscount:      (studentId, data)   => client.post(`/discounts/student/${studentId}`, data),
  removeDiscount:      (studentId, discId) => client.delete(`/discounts/student/${studentId}/${discId}`),
  getStudentSummary:   (studentId)         => client.get(`/discounts/student/${studentId}/summary`),
  getSiblingRank:      (studentId)         => client.get(`/discounts/student/${studentId}/sibling-rank`),
  getSiblingTiers:     ()                  => client.get("/discounts/sibling-tiers"),
  updateSiblingTiers:  (data)              => client.put("/discounts/sibling-tiers", data),
};

export default discountsApi;