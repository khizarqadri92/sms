import client from "./client";

const processingDateApi = {
  get:     ()     => client.get("/system/processing-date"),
  getDatetime: () => client.get("/system/processing-datetime"),
  advance: ()     => client.post("/system/processing-date/advance"),
  set:     (data) => client.put("/system/processing-date", data),
  getTime:       ()     => client.get("/system/processing-time"),
  setAutomatic:  ()     => client.post("/system/processing-time/set-automatic"),
  setManualTime: (data) => client.post("/system/processing-time/set-manual", data),
};

export default processingDateApi;
