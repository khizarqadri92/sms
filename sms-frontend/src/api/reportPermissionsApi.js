import client from "./client";

const reportPermissionsApi = {
  getReportPermissions: () => client.get("/admin/report-permissions"),
  toggle: (data) => client.post("/admin/report-permissions/toggle", data),
};

export default reportPermissionsApi;
