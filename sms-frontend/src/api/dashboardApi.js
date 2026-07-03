import client from "./client";

const dashboardApi = {
  getStats: () => client.get("/dashboard/stats"),
};

export default dashboardApi;