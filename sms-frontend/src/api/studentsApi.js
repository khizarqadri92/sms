import client from "./client";

const studentsApi = {
  getMyProfile:   ()           => client.get("/students/me"),
  getAll:          (params)     => client.get("/students/", { params }),
  getById:         (id)         => client.get(`/students/${id}`),
  getMe:           ()           => client.get("/students/me"),
  create:          (data)       => client.post("/students/", data),
  update:          (id, data)   => client.put(`/students/${id}`, data),
  delete:          (id)         => client.delete(`/students/${id}`),
  getAttendance:        (id, params) => client.get(`/students/${id}/attendance`, { params }),
  getAttendanceSummary: (id, params) => client.get(`/students/${id}/attendance/summary`, { params }),
  getGrades:       (id)         => client.get(`/students/${id}/grades`),
  getFees:         (id)         => client.get(`/students/${id}/fees`),
  getSiblings:     (id)         => client.get(`/students/${id}/siblings`),
  getMyChildren:    ()           => client.get("/students/my-children"),
  linkParent:      (id, data)   => client.put(`/students/${id}/link-parent`, data),
  searchParents:   (q)          => client.get("/students/parents/search", { params: { q } }),
};

export default studentsApi;