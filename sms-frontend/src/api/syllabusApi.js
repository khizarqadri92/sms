import client from "./client";

export const syllabusApi = {
  getAll:       (params) => client.get("/syllabus/", { params }),
  getOne:       (id)     => client.get("/syllabus/" + id),
  create:       (data)   => client.post("/syllabus/", data),
  update:       (id, d)  => client.put("/syllabus/" + id, d),
  remove:       (id)     => client.delete("/syllabus/" + id),

  addTopic:     (sid, d)      => client.post("/syllabus/" + sid + "/topics", d),
  updateTopic:  (sid, tid, d) => client.put("/syllabus/" + sid + "/topics/" + tid, d),
  deleteTopic:  (sid, tid)    => client.delete("/syllabus/" + sid + "/topics/" + tid),
  markTopic:    (sid, tid, d) => client.post("/syllabus/" + sid + "/topics/" + tid + "/mark", d),

  attachFile:       (sid, tid, form) => client.post("/syllabus/" + sid + "/topics/" + tid + "/attach", form),
  deleteAttachment: (sid, tid, aid)  => client.delete("/syllabus/" + sid + "/topics/" + tid + "/attach/" + aid),
  getAttachUrl:     (sid, tid, aid)  => (process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1") + "/syllabus/" + sid + "/topics/" + tid + "/attach/" + aid,
};