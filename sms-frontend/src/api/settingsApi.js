import client from "./client";

const settingsApi = {
  getAll:           ()       => client.get("/settings/"),
  update:           (data)   => client.put("/settings/", data),
  previewId:        (role)   => client.get("/settings/preview-id", { params: { role } }),
  getByCategory:    (cat)       => client.get(`/settings/category/${cat}`),
  getSecurityPublic: ()          => client.get("/settings/security-public"),
  getRegionalFormatPublic: () => client.get("/settings/regional-format-public"),
  saveByCategory:   (cat, data) => client.post(`/settings/category/${cat}`, data),
  getFeeSettings:   ()       => client.get("/settings/fee"),
  updateFeeSettings:(data)   => client.put("/settings/fee", data),
};

export default settingsApi;