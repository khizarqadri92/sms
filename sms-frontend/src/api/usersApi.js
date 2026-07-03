import client from "./client";

const usersApi = {
  getAll:             (params)   => client.get("/users/", { params }),
  getById:            (id)       => client.get(`/users/${id}`),
  create:             (data)     => client.post("/users/", data),
  update:             (id, data) => client.put(`/users/${id}`, data),
  remove:             (id)       => client.delete(`/users/${id}`),
  assignRole:         (id, data) => client.post(`/users/${id}/assign-role`, data),
  getAllRoles:         ()         => client.get("/users/roles/all"),
  getRolePermissions: (roleId)   => client.get(`/users/roles/${roleId}/permissions`),
  getAllPermissions:   ()         => client.get("/users/permissions/all"),
  assignPermission:   (data)     => client.post("/users/permissions/assign", data),
  getMyProfile:       ()         => client.get("/users/profile/me"),
  updateMyProfile:    (data)     => client.put("/users/profile/me", data),
  getSignature:    ()       => client.get("/users/signature"),
  saveSignature:   (data)   => client.put("/users/signature", data),
  deleteSignature: ()       => client.delete("/users/signature"),
  changePassword:     (data)     => client.put("/users/profile/password", data),
};

export default usersApi;