import client from "./client";

export const leavesApi = {
  // Leave types (setup)
  getLeaveTypes:      ()       => client.get("/leave-setup/types"),
  getActiveLeaveTypes: ()      => client.get("/leave-setup/active-types"),
  getMyChildren:       ()      => client.get("/leaves/my-children"),
  createLeaveType:    (data)   => client.post("/leave-setup/types", data),
  updateLeaveType:    (id, d)  => client.put(`/leave-setup/types/${id}`, d),
  deleteLeaveType:    (id)     => client.delete(`/leave-setup/types/${id}`),

  // Leave requests
  getLeaves:    (params) => client.get("/leaves/", { params }),
  getBalance:   (params) => client.get("/leaves/my-balance", { params }),
  applyLeave:   (form)   => client.post("/leaves/apply", form),
  recommend:    (id, data) => client.post(`/leaves/${id}/recommend`, data),
  actionLeave:  (id, data) => client.post(`/leaves/${id}/action`, data),
  getCertUrl:   (id)     => `${process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1"}/leaves/${id}/certificate`,
};
