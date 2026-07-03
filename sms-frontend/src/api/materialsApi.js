import client from "./client";

export default {
  upload:     (formData)  => client.post("/materials/upload", formData),
  list:       (params)    => client.get("/materials/", { params }),
  download:   (id)        => client.get(`/materials/${id}/download`, { responseType:"blob" }),
  remove:     (id)        => client.delete(`/materials/${id}`),
  getMyClasses: ()        => client.get("/materials/my-classes"),
};