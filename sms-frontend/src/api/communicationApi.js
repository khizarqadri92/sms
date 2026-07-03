import client from "./client";

const communicationApi = {
  getAll:   (params) => client.get("/communication", { params }),
  getById:  (id)     => client.get(`/communication/${id}`),
  create:   (data)   => client.post("/communication", data),
  update:   (id, data) => client.put(`/communication/${id}`, data),
  remove:   (id)     => client.delete(`/communication/${id}`),
};

export default communicationApi;
