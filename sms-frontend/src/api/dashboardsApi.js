import client from "./client";

export const dashboardsApi = {
  me:          () => client.get("/dashboards/me"),
  principal:   () => client.get("/dashboards/principal"),
  coordinator: () => client.get("/dashboards/coordinator"),
  teacher:     () => client.get("/dashboards/teacher"),
  admin:       () => client.get("/dashboards/admin"),
  finance:     () => client.get("/dashboards/finance"),
  hr:          () => client.get("/dashboards/hr"),
  library:     () => client.get("/dashboards/library"),
  procurement: () => client.get("/dashboards/procurement"),
  student:     (studentId) => client.get("/dashboards/student", { params: studentId ? { student_id: studentId } : {} }),
};
