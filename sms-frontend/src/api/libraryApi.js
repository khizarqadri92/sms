import client from "./client";

const libraryApi = {
  getDashboard:      ()           => client.get("/library/dashboard"),

  getInventorySummary: ()         => client.get("/library/inventory/summary"),
  getActiveAudit:      ()         => client.get("/library/inventory/active-audit"),
  startAudit:          (data)     => client.post("/library/inventory/audits", data),
  verifyAuditCopy:     (auditId, data) => client.post(`/library/inventory/audits/${auditId}/verify`, data),
  getAuditItems:       (auditId)  => client.get(`/library/inventory/audits/${auditId}/items`),
  completeAudit:       (auditId)  => client.post(`/library/inventory/audits/${auditId}/complete`),
  getMissingCopies:    ()         => client.get("/library/copies/missing"),
  resolveMissingCopy:  (id, data) => client.post(`/library/copies/${id}/resolve-missing`, data),

  getMembershipRules:   ()          => client.get("/library/settings/membership-rules"),
  updateMembershipRule: (type, data) => client.put(`/library/settings/membership-rules/${type}`, data),

  getCategories:     ()           => client.get("/library/categories"),
  getAllCategories:  ()           => client.get("/library/categories/all"),
  createCategory:    (data)       => client.post("/library/categories", data),
  updateCategory:    (id, data)   => client.put(`/library/categories/${id}`, data),
  deactivateCategory: (id)        => client.delete(`/library/categories/${id}`),
  reactivateCategory: (id)        => client.post(`/library/categories/${id}/reactivate`),

  getAuthors:        ()           => client.get("/library/authors"),
  getAllAuthors:     ()           => client.get("/library/authors/all"),
  createAuthor:      (data)       => client.post("/library/authors", data),
  updateAuthor:      (id, data)   => client.put(`/library/authors/${id}`, data),
  deactivateAuthor:  (id)         => client.delete(`/library/authors/${id}`),
  reactivateAuthor:  (id)         => client.post(`/library/authors/${id}/reactivate`),

  getPublishers:     ()           => client.get("/library/publishers"),
  getAllPublishers:  ()           => client.get("/library/publishers/all"),
  createPublisher:   (data)       => client.post("/library/publishers", data),
  updatePublisher:   (id, data)   => client.put(`/library/publishers/${id}`, data),
  deactivatePublisher: (id)       => client.delete(`/library/publishers/${id}`),
  reactivatePublisher: (id)       => client.post(`/library/publishers/${id}/reactivate`),

  getBooks:          (params)     => client.get("/library/books", { params }),
  getBook:           (id)         => client.get(`/library/books/${id}`),
  createBook:        (data)       => client.post("/library/books", data),
  updateBook:        (id, data)   => client.put(`/library/books/${id}`, data),
  addCopies:         (id, data)   => client.post(`/library/books/${id}/copies`, data),
  deactivateBook:    (id)         => client.delete(`/library/books/${id}`),

  getDamagedCopies:  ()           => client.get("/library/copies/damaged"),
  resolveDamagedCopy: (id, data)  => client.post(`/library/copies/${id}/resolve-damage`, data),

  reportBookLost:    (txId)       => client.post(`/library/issues/${txId}/report-lost`),
  getLostCopies:     ()           => client.get("/library/copies/lost"),
  resolveLostCopy:   (id, data)   => client.post(`/library/copies/${id}/resolve-lost`, data),

  searchEnrollableUsers: (params) => client.get("/library/search-users", { params }),
  getMembers:        (params)     => client.get("/library/members", { params }),
  enrollMember:      (data)       => client.post("/library/members", data),
  getMyMembership:   ()           => client.get("/library/members/me"),

  getIssues:         (params)     => client.get("/library/issues", { params }),
  getMyHistory:      ()           => client.get("/library/issues/my-history"),
  issueBook:         (data)       => client.post("/library/issue", data),
  returnBook:        (txId, data) => client.post(`/library/return/${txId}`, data),
  renewBook:         (txId)       => client.post(`/library/issues/${txId}/renew`),
  getPendingFines:   (params)     => client.get("/library/fines/pending", { params }),
  getFineHistory:    (params)     => client.get("/library/fines/history", { params }),
  payFine:           (txId, data) => client.post(`/library/fines/${txId}/pay`, data),
  waiveFine:         (txId)       => client.post(`/library/fines/${txId}/waive`),

  getReservations:   (params)     => client.get("/library/reservations", { params }),
  placeReservation:  (data)       => client.post("/library/reservations", data),
  cancelReservation: (id)         => client.delete(`/library/reservations/${id}`),
};

export default libraryApi;
