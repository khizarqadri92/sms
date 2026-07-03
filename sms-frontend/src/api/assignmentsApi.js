import client from "./client";
export default {
  create:          (data)     => client.post("/assignments/", data),
  list:            (params)   => client.get("/assignments/", { params }),
  myAssignments:   ()         => client.get("/assignments/my-assignments"),
  studentList:     ()         => client.get("/assignments/student"),
  submit:          (id, form) => client.post(`/assignments/${id}/submit`, form, { headers:{"Content-Type":"multipart/form-data"} }),
  getSubmissions:  (id)       => client.get(`/assignments/${id}/submissions`),
  grade:           (subId, data) => client.put(`/assignments/submissions/${subId}/grade`, data),
  download:        (subId)    => client.get(`/assignments/submissions/${subId}/download`, { responseType:"blob" }),
  remove:          (id)       => client.delete(`/assignments/${id}`),
};