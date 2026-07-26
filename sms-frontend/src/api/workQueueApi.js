import client from "./client";

const workQueueApi = {
  getMyQueue:    (params)  => client.get("/work-queue/", { params }),
  getCount:      ()        => client.get("/work-queue/count"),
  getModules:    ()        => client.get("/work-queue/modules"),
  completeItem:  (id)      => client.post(`/work-queue/${id}/complete`),
  cancelItem:    (id)      => client.post(`/work-queue/${id}/cancel`),
  getHistory:    (params)  => client.get("/work-queue/history", { params }),
  getAdminAll:      (params)       => client.get("/work-queue/admin", { params }),
  getColorConfig:   ()              => client.get("/work-queue/color-config"),
  updateColorConfig:(statusKey, data) => client.put(`/work-queue/color-config/${statusKey}`, data),
};

export default workQueueApi;
