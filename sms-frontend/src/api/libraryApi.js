import client from "./client";

const libraryApi = {
  getDashboard:      ()           => client.get("/library/dashboard"),

  getCategories:     ()           => client.get("/library/categories"),
  createCategory:    (data)       => client.post("/library/categories", data),

  getAuthors:        ()           => client.get("/library/authors"),
  createAuthor:      (data)       => client.post("/library/authors", data),

  getPublishers:     ()           => client.get("/library/publishers"),
  createPublisher:   (data)       => client.post("/library/publishers", data),

  getBooks:          (params)     => client.get("/library/books", { params }),
  getBook:           (id)         => client.get(`/library/books/${id}`),
  createBook:        (data)       => client.post("/library/books", data),
  updateBook:        (id, data)   => client.put(`/library/books/${id}`, data),
  addCopies:         (id, data)   => client.post(`/library/books/${id}/copies`, data),
  deactivateBook:    (id)         => client.delete(`/library/books/${id}`),

  searchEnrollableUsers: (params) => client.get("/library/search-users", { params }),
  getMembers:        (params)     => client.get("/library/members", { params }),
  enrollMember:      (data)       => client.post("/library/members", data),
  getMyMembership:   ()           => client.get("/library/members/me"),

  getIssues:         (params)     => client.get("/library/issues", { params }),
  getMyHistory:      ()           => client.get("/library/issues/my-history"),
  issueBook:         (data)       => client.post("/library/issue", data),
  returnBook:        (txId, data) => client.post(`/library/return/${txId}`, data),
  payFine:           (txId, data) => client.post(`/library/fines/${txId}/pay`, data),
  waiveFine:         (txId)       => client.post(`/library/fines/${txId}/waive`),
};

export default libraryApi;
