import client from "./client";

const messagesApi = {
  config:        ()                 => client.get("/messages/config"),
  contacts:      ()                 => client.get("/messages/contacts"),
  list:          (params)           => client.get("/messages/conversations", { params }),
  start:         (student_id, with_user_id) => client.post("/messages/conversations", { student_id, with_user_id }),
  get:           (id)               => client.get("/messages/conversations/" + id),
  send:          (id, formData)     => client.post("/messages/conversations/" + id + "/messages", formData),
  edit:          (msgId, body)      => client.put("/messages/messages/" + msgId, { body }),
  attachment:    (attId)            => client.get("/messages/attachments/" + attId, { responseType: "blob" }),
  unreadCount:   ()                 => client.get("/messages/unread-count"),
  escalate:      (id, reason)       => client.post("/messages/conversations/" + id + "/escalate", { reason }),
  resolve:       (id, reason)       => client.post("/messages/conversations/" + id + "/resolve", { reason }),
  close:         (id, reason)       => client.post("/messages/conversations/" + id + "/close", { reason }),
  reopen:        (id)               => client.post("/messages/conversations/" + id + "/reopen"),
  report:        (msgId, reason)    => client.post("/messages/messages/" + msgId + "/report", { reason }),
  reports:       (status)           => client.get("/messages/reports", { params: { status } }),
  reviewReport:  (id, reason)       => client.post("/messages/reports/" + id + "/review", { reason }),
  getSettings:   ()                 => client.get("/messages/settings"),
  saveSettings:  (data)             => client.put("/messages/settings", data),
};
export default messagesApi;
