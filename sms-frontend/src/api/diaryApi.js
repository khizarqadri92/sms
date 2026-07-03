import client from "./client";

export default {
  getEntries:   (params)  => client.get("/diary/", { params }),
  saveEntry:    (data)    => client.post("/diary/entry", data),
  publish:      (data)    => client.post("/diary/publish", data),
  getMyClasses:  ()        => client.get("/diary/my-classes"),
  getMySubjects: (params)  => client.get("/diary/my-subjects", { params }),
  getStudent:   (params)  => client.get("/diary/student", { params }),
  getStatus:     (params)  => client.get("/diary/status", { params }),
  sendReminder:    (data)  => client.post("/diary/remind", data),
  getAllStatus:     (params) => client.get("/diary/all-status", { params }),
  remindPublish:   (data)   => client.post("/diary/remind-publish", data),
};