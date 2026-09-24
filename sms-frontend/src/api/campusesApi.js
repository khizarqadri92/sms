import client from "./client";

const campusesApi = {
  list:   ()       => client.get("/campuses/"),
  getMyCampus: () => client.get("/campuses/me"),
  upsert: (data)   => client.put("/campuses/", data),
  listGovernance: ()             => client.get("/campuses/governance"),
  updateGovernance: (key, mode)  => client.put("/campuses/governance/" + key, { mode }),
};

export default campusesApi;