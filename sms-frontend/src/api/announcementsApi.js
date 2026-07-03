import client from "./client";
export default {
  list:        ()       => client.get("/announcements/"),
  unreadCount: ()       => client.get("/announcements/unread-count"),
  create:      (data)   => client.post("/announcements/", data),
  update:      (id,data)=> client.put(`/announcements/${id}`, data),
  remove:      (id)     => client.delete(`/announcements/${id}`),
  markRead:    (id)     => client.post(`/announcements/${id}/read`),
};