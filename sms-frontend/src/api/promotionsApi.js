import client from "./client";

export const promotionsApi = {
  overview:    ()                        => client.get("/promotions/overview"),
  setLevels:   (levels)                  => client.put("/promotions/levels", { levels }),
  prepare:     (classId)                 => client.post("/promotions/batches", { class_id: classId }),
  getBatch:    (batchId)                 => client.get("/promotions/batches/" + batchId),
  updateItem:  (batchId, itemId, data)   => client.put("/promotions/batches/" + batchId + "/items/" + itemId, data),
  submit:      (batchId)                 => client.post("/promotions/batches/" + batchId + "/submit"),
  decideItem:  (batchId, itemId, data)   => client.post("/promotions/batches/" + batchId + "/items/" + itemId + "/decide", data),
  approve:     (batchId, comment)        => client.post("/promotions/batches/" + batchId + "/approve", { comment }),
  returnBatch: (batchId, comment)        => client.post("/promotions/batches/" + batchId + "/return", { comment }),
  rollback:    (batchId)                 => client.post("/promotions/batches/" + batchId + "/rollback"),
  session:      ()                       => client.get("/promotions/session"),
  startSession: (data)                   => client.post("/promotions/session/start", data),
  historyMe:      ()                     => client.get("/promotions/history/me"),
  historyYears:   ()                     => client.get("/promotions/history/years"),
  history:        (yearId, classId)      => client.get("/promotions/history", { params: { year_id: yearId, ...(classId ? { class_id: classId } : {}) } }),
  historyStudent: (studentId, yearId)    => client.get("/promotions/history/student/" + studentId, { params: { year_id: yearId } }),
  report:      (academicYearId)          => client.get("/promotions/report", { params: academicYearId ? { academic_year_id: academicYearId } : {} }),
};
