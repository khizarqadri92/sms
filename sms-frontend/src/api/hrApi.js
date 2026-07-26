import client from "./client";

const hrApi = {
  // Departments
  getDepartments:         ()              => client.get("/hr/departments"),
  createDepartment:       (data)          => client.post("/hr/departments", data),
  updateDepartment:       (id, data)      => client.put(`/hr/departments/${id}`, data),
  deleteDepartment:       (id)            => client.delete(`/hr/departments/${id}`),
  getAllowedRoles:         (deptId)        => client.get(`/hr/departments/${deptId}/allowed-roles`),
  createDepartment:       (data)          => client.post("/hr/departments", data),
  getDeptRoles:           (deptId)        => client.get(`/hr/departments/${deptId}/roles`),
  getDeptDesignations:    (deptId)        => client.get(`/hr/departments/${deptId}/designations`),

  // Designations
  getDesignations:        ()              => client.get("/hr/designations"),
  createDesignation:      (data)          => client.post("/hr/designations", data),
  updateDesignation:      (id, data)      => client.put(`/hr/designations/${id}`, data),
  deleteDesignation:      (id)            => client.delete(`/hr/designations/${id}`),

  // All Staff (unified)
  getAllStaff:             (params)        => client.get("/hr/all-staff", { params }),
  createStaffFull:        (data)          => client.post("/hr/all-staff", data),
  generateEmployeeCode:   (roleId)        => client.get("/hr/generate-employee-code", { params: { role_id: roleId } }),

  // Individual Staff record
  getStaffById:           (id)            => client.get(`/hr/staff/${id}`),
  updateStaff:            (id, data)      => client.put(`/hr/staff/${id}`, data),
  updateStatus:           (id, status)    => client.patch(`/hr/staff/${id}/status`, null, { params: { status } }),
  deleteStaff:            (id)            => client.delete(`/hr/staff/${id}`),

  // Full profile (HR/admin view)
  getProfileByUser:       (userId)        => client.get(`/hr/profile/by-user/${userId}`),
  uploadStaffPhoto:       (sId, form)     => client.post(`/hr/staff/${sId}/photo`, form),
  addStaffEducation:      (sId, data)     => client.post(`/hr/staff/${sId}/education`, data),
  updateStaffEducation:   (sId, eId, d)   => client.put(`/hr/staff/${sId}/education/${eId}`, d),
  deleteStaffEducation:   (sId, eId)      => client.delete(`/hr/staff/${sId}/education/${eId}`),
  addStaffExperience:     (sId, data)     => client.post(`/hr/staff/${sId}/experience`, data),
  updateStaffExperience:  (sId, eId, d)   => client.put(`/hr/staff/${sId}/experience/${eId}`, d),
  deleteStaffExperience:  (sId, eId)      => client.delete(`/hr/staff/${sId}/experience/${eId}`),
  getProfile:             (staffId)       => client.get(`/hr/profile/${staffId}`),

  // Profile photo
  uploadMyPhoto:          (form)          => client.post("/hr/my-profile/photo", form),
  getMyPhoto:             ()              => client.get("/hr/my-profile/photo"),

  // My Profile (self)
  getMyProfile:           ()              => client.get("/hr/my-profile"),
  updateMyPersonal:       (data)          => client.put("/hr/my-profile/personal", data),

  // Education
  addEducation:           (data)          => client.post("/hr/my-profile/education", data),
  updateEducation:        (id, data)      => client.put(`/hr/my-profile/education/${id}`, data),
  deleteEducation:        (id)            => client.delete(`/hr/my-profile/education/${id}`),

  // Experience
  addExperience:          (data)          => client.post("/hr/my-profile/experience", data),
  updateExperience:       (id, data)      => client.put(`/hr/my-profile/experience/${id}`, data),
  deleteExperience:       (id)            => client.delete(`/hr/my-profile/experience/${id}`),

  // Employment History
  addEmploymentHistory:   (data)          => client.post("/hr/my-profile/employment-history", data),
  deleteEmploymentHistory:(id)            => client.delete(`/hr/my-profile/employment-history/${id}`),

  // Documents (self)
  uploadMyDocument:       (form)          => client.post("/hr/my-profile/documents", form),
  deleteMyDocument:       (id)            => client.delete(`/hr/my-profile/documents/${id}`),

  // Emergency contacts (self)
  addMyEmergencyContact:  (data)          => client.post("/hr/my-profile/emergency-contacts", data),
  deleteMyEmergencyContact:(id)           => client.delete(`/hr/my-profile/emergency-contacts/${id}`),

  // Documents (HR manages)
  uploadDocument:         (id, form)      => client.post(`/hr/staff/${id}/documents`, form),
  deleteDocument:         (sId, dId)      => client.delete(`/hr/staff/${sId}/documents/${dId}`),

  // Emergency Contacts
  addEmergencyContact:    (id, data)      => client.post(`/hr/staff/${id}/emergency-contacts`, data),
  deleteEmergencyContact: (sId, cId)      => client.delete(`/hr/staff/${sId}/emergency-contacts/${cId}`),

  // HR Setup
  getSetupDeptRoles:      ()              => client.get("/hr/setup/department-roles"),
  addDeptRole:            (dId, rId)      => client.post("/hr/setup/department-roles", null, { params: { department_id: dId, role_id: rId } }),
  removeDeptRole:         (id)            => client.delete(`/hr/setup/department-roles/${id}`),
  getAllRoles:             ()              => client.get("/hr/setup/all-roles"),

  // Staff Leave
  getLeaveTypes:          ()              => client.get("/hr/leave/types"),
  createLeaveType:        (data)          => client.post("/hr/leave/types", data),
  updateLeaveType:        (id, data)      => client.put(`/hr/leave/types/${id}`, data),
  deleteLeaveType:        (id)            => client.delete(`/hr/leave/types/${id}`),
  getLeavePolicies:       (ltId)          => client.get("/hr/leave/policies", { params: ltId?{leave_type_id:ltId}:{} }),
  createLeavePolicy:      (data)          => client.post("/hr/leave/policies", data),
  deleteLeavePolicy:      (id)            => client.delete(`/hr/leave/policies/${id}`),
  getLeaveBalances:       (year)          => client.get("/hr/leave/balances", { params: year?{year}:{} }),
  initLeaveBalances:      (year)          => client.post("/hr/leave/balances/init", null, { params: { year } }),
  adjustLeaveBalance:     (id, days)      => client.patch(`/hr/leave/balances/${id}`, null, { params: { total_days: days } }),
  getLeaveRequests:       (params)        => client.get("/hr/leave/requests", { params }),
  reviewLeaveRequest:     (id, data)      => client.patch(`/hr/leave/requests/${id}/review`, data),
  advanceLeaveWorkflow:   (id, data)      => client.post(`/hr/leave/requests/${id}/advance`, data),
  // Leave Certificate Types
  getCertificateTypes:    ()              => client.get("/hr/leave/certificate-types"),
  createCertificateType:  (data)          => client.post("/hr/leave/certificate-types", data),
  deleteCertificateType:  (id)            => client.delete(`/hr/leave/certificate-types/${id}`),

  // Leave Rules (validation engine)
  getValidationRules:     ()              => client.get("/hr/leave/validation-rules"),
  createValidationRule:   (data)          => client.post("/hr/leave/validation-rules", data),
  deleteValidationRule:   (id)            => client.delete(`/hr/leave/validation-rules/${id}`),

  // HR Policy Settings (probation / notice period durations)
  getPolicySettings:      ()              => client.get("/hr/policy-settings"),
  updatePolicySettings:   (data)          => client.put("/hr/policy-settings", data),

  generateStaffCode:      (staffId)       => client.post(`/hr/staff/${staffId}/generate-code`),
  checkIsHead:            (staffId)       => client.get(`/hr/staff/${staffId}/is-head`),
  updateStaffRole:        (staffId, rId)  => client.patch(`/hr/staff/${staffId}/role`, null, { params: { role_id: rId } }),

  // Department Head
  setDepartmentHead:      (staffId)       => client.post(`/hr/staff/${staffId}/set-head`),
  removeDepartmentHead:   (staffId)       => client.delete(`/hr/staff/${staffId}/remove-head`),
  getDepartmentHead:      (deptId)        => client.get(`/hr/departments/${deptId}/head`),

  // My Leave (self-service)
  getMyEmploymentStatus:  ()              => client.get("/hr/my-leave/employment-status"),
  getMyLeaveTypes:        ()              => client.get("/hr/my-leave/types"),
  getMyLeaveBalances:     ()              => client.get("/hr/my-leave/balances"),
  getMyLeaveRequests:     ()              => client.get("/hr/my-leave/requests"),
  applyLeave:             (data)          => client.post("/hr/my-leave/apply", data),
  cancelLeaveRequest:     (id)            => client.delete(`/hr/my-leave/requests/${id}`),
};

export default hrApi;
