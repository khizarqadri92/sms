import client from "./client";

const activityApi = {
  list:        (params)  => client.get("/activities/", { params }),
  get:         (id)      => client.get("/activities/" + id),
  summary:     (params)  => client.get("/activities/summary", { params }),
  departments: ()        => client.get("/activities/departments"),
  employees:   (params)  => client.get("/activities/employees", { params }),
  status:      ()        => client.get("/activities/recorder-status"),
};
export default activityApi;
