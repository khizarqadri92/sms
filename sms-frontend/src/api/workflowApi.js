import client from "./client";

const workflowApi = {
  // Definitions
  getWorkflows:      (params)       => client.get("/workflow/", { params }),
  getWorkflow:       (id)           => client.get(`/workflow/${id}`),
  createWorkflow:    (data)         => client.post("/workflow/", data),
  updateWorkflow:    (id, data)     => client.put(`/workflow/${id}`, data),
  deleteWorkflow:    (id)           => client.delete(`/workflow/${id}`),

  // Steps
  addStep:           (wfId, data)   => client.post(`/workflow/${wfId}/steps`, data),
  updateStep:        (stepId, data) => client.put(`/workflow/steps/${stepId}`, data),
  deleteStep:        (stepId)       => client.delete(`/workflow/steps/${stepId}`),

  // Conditions
  addCondition:      (stepId, data) => client.post(`/workflow/steps/${stepId}/conditions`, data),
  deleteCondition:   (condId)       => client.delete(`/workflow/conditions/${condId}`),

  // Assignments
  getAssignments:    (params)       => client.get("/workflow/assignments/list", { params }),
  createAssignment:  (data)         => client.post("/workflow/assignments", data),
  updateAssignment:  (id, data)     => client.put(`/workflow/assignments/${id}`, data),
  deleteAssignment:  (id)           => client.delete(`/workflow/assignments/${id}`),

  // Instances
  getInstances:      (params)       => client.get("/workflow/instances/list", { params }),
  getInstance:       (module, entityType, entityId) =>
                       client.get(`/workflow/instances/${module}/${entityType}/${entityId}`),

  // Meta
  getModules:        ()             => client.get("/workflow/modules/list"),
  getRoles:          ()             => client.get("/workflow/roles/list"),
  getModuleLinks:    ()             => client.get("/workflow/module-links"),
  getModuleLink:     (mod, entity)  => client.get(`/workflow/module-links/${mod}/${entity}`),
  getConditionFields:(mod, entity)  => client.get("/workflow/condition-fields", { params: { module: mod, entity_type: entity } }),
  addAssignmentCondition: (aId, data) => client.post(`/workflow/assignments/${aId}/conditions`, data),
  deleteAssignmentCondition: (cId)    => client.delete(`/workflow/assignments/conditions/${cId}`),
  getFieldOptions:   (fieldKey)    => client.get(`/workflow/condition-fields/${fieldKey}/options`),
};

export default workflowApi;
