import client from "./client";

const notificationTemplatesApi = {
  list:   ()               => client.get("/notification-templates/"),
  update: (eventKey, data) => client.put(`/notification-templates/${eventKey}`, data),
};

export default notificationTemplatesApi;
