import client from "./client";
export const configApi = {
  getWithdrawal:    ()     => client.get("/config/withdrawal"),
  updateWithdrawal: (data) => client.put("/config/withdrawal", data),
  getDiscipline:    ()     => client.get("/config/discipline"),
  updateDiscipline: (data) => client.put("/config/discipline", data),
};