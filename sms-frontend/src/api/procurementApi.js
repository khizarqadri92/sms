import client from "./client";

const procurementApi = {
  getDepartments:      ()           => client.get("/procurement/departments"),
  createDepartment:    (data)       => client.post("/procurement/departments", data),
  updateDepartment:    (id, data)   => client.put(`/procurement/departments/${id}`, data),
  deactivateDepartment: (id)        => client.delete(`/procurement/departments/${id}`),
  reactivateDepartment: (id)        => client.post(`/procurement/departments/${id}/reactivate`),

  getVendorCategories: ()           => client.get("/procurement/vendor-categories"),
  createVendorCategory: (data)      => client.post("/procurement/vendor-categories", data),
  deactivateVendorCategory: (id)    => client.delete(`/procurement/vendor-categories/${id}`),

  getVendors:          (params)     => client.get("/procurement/vendors", { params }),
  createVendor:        (data)       => client.post("/procurement/vendors", data),
  updateVendor:        (id, data)   => client.put(`/procurement/vendors/${id}`, data),
  deactivateVendor:    (id)         => client.delete(`/procurement/vendors/${id}`),
  reactivateVendor:    (id)         => client.post(`/procurement/vendors/${id}/reactivate`),
  blacklistVendor:     (id, data)   => client.post(`/procurement/vendors/${id}/blacklist`, data),
  unblacklistVendor:   (id)         => client.post(`/procurement/vendors/${id}/unblacklist`),

  getItemCategories:   ()           => client.get("/procurement/item-categories"),
  createItemCategory:  (data)       => client.post("/procurement/item-categories", data),
  updateItemCategory:  (id, data)   => client.put(`/procurement/item-categories/${id}`, data),
  deactivateItemCategory: (id)      => client.delete(`/procurement/item-categories/${id}`),

  getItems:            (params)     => client.get("/procurement/items", { params }),
  createItem:          (data)       => client.post("/procurement/items", data),
  updateItem:          (id, data)   => client.put(`/procurement/items/${id}`, data),
  deactivateItem:      (id)         => client.delete(`/procurement/items/${id}`),
  reactivateItem:      (id)         => client.post(`/procurement/items/${id}/reactivate`),

  getApprovalRules:    ()           => client.get("/procurement/approval-rules"),
  createApprovalRule:  (data)       => client.post("/procurement/approval-rules", data),
  updateApprovalRule:  (id, data)   => client.put(`/procurement/approval-rules/${id}`, data),
  deactivateApprovalRule: (id)      => client.delete(`/procurement/approval-rules/${id}`),
  reactivateApprovalRule: (id)      => client.post(`/procurement/approval-rules/${id}/reactivate`),

  getMyRequisitions:      ()           => client.get("/procurement/requisitions/my"),
  getPendingMyApproval:   ()           => client.get("/procurement/requisitions/pending-my-approval"),
  getAllRequisitions:     (params)     => client.get("/procurement/requisitions", { params }),
  getRequisition:         (id)         => client.get(`/procurement/requisitions/${id}`),
  createRequisition:      (data)       => client.post("/procurement/requisitions", data),
  addRequisitionItem:     (id, data)   => client.post(`/procurement/requisitions/${id}/items`, data),
  removeRequisitionItem:  (itemRowId)  => client.delete(`/procurement/requisitions/items/${itemRowId}`),
  submitRequisition:      (id)         => client.post(`/procurement/requisitions/${id}/submit`),
  actOnRequisition:       (id, data)   => client.post(`/procurement/requisitions/${id}/act`, data),

  getPurchaseOrders:    (params)     => client.get("/procurement/purchase-orders", { params }),
  getPurchaseOrder:     (id)         => client.get(`/procurement/purchase-orders/${id}`),
  createPurchaseOrder:  (data)       => client.post("/procurement/purchase-orders", data),
  updatePOItem:         (itemId, data) => client.put(`/procurement/purchase-orders/items/${itemId}`, data),
  issuePurchaseOrder:   (id)         => client.post(`/procurement/purchase-orders/${id}/issue`),
  cancelPurchaseOrder:  (id)         => client.post(`/procurement/purchase-orders/${id}/cancel`),
};

export default procurementApi;
