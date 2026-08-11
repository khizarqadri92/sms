import client from "./client";
export const examsApi = {
  // Result Components
  getComponents:   ()           => client.get("/exams/components"),
  createComponent: (data)       => client.post("/exams/components", data),
  updateComponent: (id, data)   => client.put("/exams/components/"+id, data),
  // Result Formula
  getFormula:      ()           => client.get("/exams/formula"),
  updateFormula:   (data)       => client.put("/exams/formula", data),
  // Exam Types
  getTypes:        ()           => client.get("/exams/types"),
  createType:      (data)       => client.post("/exams/types", data),
  updateType:      (id, data)   => client.put("/exams/types/"+id, data),
  // Grading
  getGrading:      ()           => client.get("/exams/grading"),
  updateGrading:   (data)       => client.put("/exams/grading", data),
  // Exam Config
  getExamConfig:   ()           => client.get("/exams/exam-config"),
  updateExamConfig:(data)       => client.put("/exams/exam-config", data),
  // Exams
  getAll:          (params)     => client.get("/exams/", { params }),
  getOne:          (id)         => client.get("/exams/"+id),
  create:          (data)       => client.post("/exams/", data),
  update:          (id, data)   => client.put("/exams/"+id, data),
  updateStatus:    (id, data)   => client.put("/exams/"+id+"/status", data),
  openMarks:       (id)         => client.post("/exams/"+id+"/open"),
  compile:         (id)         => client.post("/exams/"+id+"/compile"),
  approve:         (id)         => client.post("/exams/"+id+"/approve"),
  publish:         (id)         => client.post("/exams/"+id+"/publish"),
  // Subjects
  getAvailableSubjects: (id) => client.get("/exams/"+id+"/available-subjects"),
  addSubject:      (id, data)   => client.post("/exams/"+id+"/subjects", data),
  // Marks
  getMarks:        (examId, subjectId) => client.get("/exams/"+examId+"/subjects/"+subjectId+"/marks"),
  enterMarks:      (examId, subjectId, data) => client.post("/exams/"+examId+"/subjects/"+subjectId+"/marks", data),
  submitMarks:     (examId, subjectId) => client.post("/exams/"+examId+"/subjects/"+subjectId+"/submit"),
  // Delete
  deleteExam:      (id)         => client.delete("/exams/"+id),
  deleteSubject:   (examId, subjectId) => client.delete("/exams/"+examId+"/subjects/"+subjectId),
  // Datesheet
  getSubjects:       (id)       => client.get("/exams/"+id+"/subjects"),
  getDatesheet:      (id)       => client.get("/exams/"+id+"/datesheet"),
  submitDatesheet:   (id)       => client.post("/exams/"+id+"/datesheet/submit"),
  approveDatesheet:  (id)       => client.post("/exams/"+id+"/datesheet/approve"),
  publishDatesheet:  (id)       => client.post("/exams/"+id+"/datesheet/publish"),
  // Marks Entry
  getMarksEntry:       (examId, classId, subjectId) => client.get("/exams/"+examId+"/marks-entry", {params:{class_id:classId,subject_id:subjectId}}),
  saveMarks:           (examId, data)  => client.post("/exams/"+examId+"/marks-entry", data),
  submitSubjectMarks:  (examId, data)  => client.post("/exams/"+examId+"/submit-subject-marks", data),
  getClassMarksSummary:(examId, classId) => client.get("/exams/"+examId+"/class-marks-summary", {params:{class_id:classId}}),
  compileResults:      (examId, data)  => client.post("/exams/"+examId+"/compile-results", data),
  getCompilationStatus:(examId)        => client.get("/exams/"+examId+"/compilation-status"),
  getClassResults:     (examId,classId) => client.get("/exams/"+examId+"/class-results/"+classId),
  sendReminder:        (examId,data)    => client.post("/exams/"+examId+"/send-reminder", data),
  // Results
  getResults:      (id)         => client.get("/exams/"+id+"/results"),
  downloadResultCard: (examId, studentId) => client.get("/exams/"+examId+"/result-card/"+studentId, {responseType:"blob"}),
};