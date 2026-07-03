import client from "./client";
export default {
  create:      (data)  => client.post("/quizzes/", data),
  list:        (params)=> client.get("/quizzes/", { params }),
  myQuizzes:   ()      => client.get("/quizzes/my-quizzes"),
  get:         (id)    => client.get(`/quizzes/${id}`),
  submit:      (id, data) => client.post(`/quizzes/${id}/submit`, data),
  results:     (id)    => client.get(`/quizzes/${id}/results`),
  remove:      (id)    => client.delete(`/quizzes/${id}`),
};