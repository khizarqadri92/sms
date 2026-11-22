import client from "./client";

const accessApi = {
  me:              ()             => client.get("/access/me"),
  catalogue:       ()             => client.get("/access/catalogue"),
  roles:           ()             => client.get("/access/roles"),
  createRole:      (data)         => client.post("/access/roles", data),
  updateRole:      (id, data)     => client.put("/access/roles/" + id, data),
  deleteRole:      (id)           => client.delete("/access/roles/" + id),
  rolePermissions: (id)           => client.get("/access/roles/" + id + "/permissions"),
  saveRolePermissions: (id, codes) => client.put("/access/roles/" + id + "/permissions", { codes }),
  findUsers:       (q)            => client.get("/access/users", { params: { q } }),
  userAccess:      (id)           => client.get("/access/users/" + id),
  addActingRole:   (id, data)     => client.post("/access/users/" + id + "/acting-roles", data),
  endActingRole:   (aid)          => client.delete("/access/acting-roles/" + aid),
  addExtra:        (id, data)     => client.post("/access/users/" + id + "/extra-permissions", data),
  endExtra:        (gid)          => client.delete("/access/extra-permissions/" + gid),
  history:         ()             => client.get("/access/history"),
  refusals:        ()             => client.get("/access/refusals"),
};
export default accessApi;
