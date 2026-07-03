import client from "./client";

const notificationsApi = {
  getAll:       ()    => client.get("/notifications/"),
  getUnreadCount:()   => client.get("/notifications/unread-count"),
  markRead:     (id)  => client.put(`/notifications/${id}/read`),
  markAllRead:  ()    => client.put("/notifications/read-all"),
  remove:       (id)  => client.delete(`/notifications/${id}`),
};

export default notificationsApi;