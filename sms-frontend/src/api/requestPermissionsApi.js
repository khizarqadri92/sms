import client from "./client";
const requestPermissionsApi = {
  get:    ()     => client.get("/admin/request-permissions"),
  upsert: (data) => client.post("/admin/request-permissions", data),
  getMyScopes: () => client.get("/admin/my-request-scopes"),
};
export default requestPermissionsApi;
