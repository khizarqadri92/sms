import client from "./client";

const teachersApi = {
  getAll:          (params)     => client.get("/teachers/", { params }),
  getById:         (id)         => client.get(`/teachers/${id}`),
  getMe:           ()           => client.get("/teachers/me"),
  create:          (data)       => client.post("/teachers/", data),
  update:          (id, data)   => client.put(`/teachers/${id}`, data),
  remove:          (id)         => client.delete(`/teachers/${id}`),
  getSubjects:     (id)         => client.get(`/teachers/${id}/subjects`),
  assignSubject:   (id, data)   => client.post(`/teachers/${id}/subjects`, data),
  getTimetable:    (id)         => client.get(`/teachers/${id}/timetable`),
  getClasses:      (id)         => client.get(`/teachers/${id}/classes`),
  getAllSubjects:   ()           => client.get("/teachers/meta/subjects"),
};

export default teachersApi;