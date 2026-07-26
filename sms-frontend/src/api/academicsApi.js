import client from "./client";

const academicsApi = {
  getYears:          ()           => client.get("/academics/years"),
  createYear:        (data)       => client.post("/academics/years", data),
  activateYear:      (id)         => client.put(`/academics/years/${id}/activate`),
  getClasses:        ()           => client.get("/academics/classes"),
  createClass:       (data)       => client.post("/academics/classes", data),
  updateClass:       (id, data)   => client.put(`/academics/classes/${id}`, data),
  deleteClass:       (id)         => client.delete(`/academics/classes/${id}`),
  getSubjects:       ()           => client.get("/academics/subjects"),
  createSubject:     (data)       => client.post("/academics/subjects", data),
  updateSubject:     (id, data)   => client.put(`/academics/subjects/${id}`, data),
  deleteSubject:     (id)         => client.delete(`/academics/subjects/${id}`),
  reactivateSubject: (id)         => client.post(`/academics/subjects/${id}/reactivate`),
  getTimetable:      (params)     => client.get("/academics/timetable", { params }),
  createTimetable:   (data)       => client.post("/academics/timetable", data),
  deleteTimetable:   (id)         => client.delete(`/academics/timetable/${id}`),
  getClassTeachers:  (id)         => client.get(`/academics/classes/${id}/teachers`),
  aiGenerateTimetable: (prompt) => client.post('/academics/timetable/ai-generate', { prompt }),
  getTimetableAIContext: () => client.get('/academics/timetable/ai-context'),
  getClassSubjects:     (id)       => client.get(`/academics/classes/${id}/subjects`),
  assignClassSubject:   (id, data) => client.post(`/academics/classes/${id}/subjects`, data),
  removeClassSubject:   (id, sid)  => client.delete(`/academics/classes/${id}/subjects/${sid}`),
  assignClassTeacher:(id, data)   => client.post(`/academics/classes/${id}/teachers`, data),
};

export default academicsApi;