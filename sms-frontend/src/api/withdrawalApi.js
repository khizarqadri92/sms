import client from "./client";

export const withdrawalApi = {
  getAll:    ()           => client.get("/withdrawal/"),
  getOne:    (id)         => client.get("/withdrawal/" + id),
  apply:     (form)       => client.post("/withdrawal/apply", form),
  review:    (id, data)   => client.post("/withdrawal/" + id + "/review", data),
  clear:     (id, data)   => client.post("/withdrawal/" + id + "/clear", data),
  approve:    (id, data)  => client.post("/withdrawal/" + id + "/approve", data),
  requireAction:(id, data)  => client.post("/withdrawal/" + id + "/require", data),
  finalize:     (id, data)  => client.post("/withdrawal/" + id + "/finalize", data),
  getTC:          (id)       => client.get("/withdrawal/" + id + "/tc"),
  getConductForm: (id)       => client.get("/withdrawal/" + id + "/conduct"),
  submitConduct:  (id, data) => client.post("/withdrawal/" + id + "/conduct", data),
};