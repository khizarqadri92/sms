import client from "./client";

const settingsApi = {
  getAll:           ()       => client.get("/settings/"),
  update:           (data)   => client.put("/settings/", data),
  previewId:        (role)   => client.get("/settings/preview-id", { params: { role } }),
  getByCategory:    (cat)       => client.get(`/settings/category/${cat}`),
  saveByCategory:   (cat, data) => client.post(`/settings/category/${cat}`, data),
  getFeeSettings:   ()       => client.get("/settings/fee"),
  updateFeeSettings:(data)   => client.put("/settings/fee", data),
};

export default settingsApi;