import client from "./client";
export default {
  list:      (params) => client.get("/calendar/", { params }),
  create:    (data)   => client.post("/calendar/", data),
  update:    (id, data) => client.put(`/calendar/${id}`, data),
  remove:    (id)     => client.delete(`/calendar/${id}`),
  holidays:      ()        => client.get("/calendar/holidays"),
  getEventTypes: ()        => client.get("/calendar/event-types"),
  createType:    (data)    => client.post("/calendar/event-types", data),
  updateType:    (id,data) => client.put(`/calendar/event-types/${id}`, data),
  deleteType:    (id)      => client.delete(`/calendar/event-types/${id}`),
};