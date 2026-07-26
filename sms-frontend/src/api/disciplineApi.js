import client from "./client";
export const disciplineApi = {
  getAll:        (status)     => client.get("/discipline/", {params: status ? {status} : {}}),
  getOne:        (id)         => client.get("/discipline/"+id),
  report:        (data)       => client.post("/discipline/report", data),
  review:        (id, data)   => client.post("/discipline/"+id+"/review", data),
  hearing:       (id, data)   => client.post("/discipline/"+id+"/hearing", data),
  decide:        (id, data)   => client.post("/discipline/"+id+"/decide", data),
  uploadEvidence:(id, form)   => client.post("/discipline/"+id+"/evidence", form),
  appeal:           (id, data)      => client.post("/discipline/"+id+"/appeal", data),
  assignCommittee:  (id, data)      => client.post("/discipline/"+id+"/committee", data),
  getCommittee:     (id)            => client.get("/discipline/"+id+"/committee"),
  getAppearanceCandidates: (id)  => client.get("/discipline/"+id+"/appearance-candidates"),
  submitRemarks:    (id, data)      => client.post("/discipline/"+id+"/remarks", data),
  submitFinalHearing:(id, data)     => client.post("/discipline/"+id+"/final-hearing", data),
  forwardAppeal:    (id, data)      => client.post("/discipline/"+id+"/appeal/forward", data),
  respondAppeal:    (id, data)      => client.post("/discipline/"+id+"/appeal/respond", data),
  downloadEvidence: async (caseId, evId) => { const r = await client.get("/discipline/"+caseId+"/evidence/"+evId+"/download",{responseType:"blob"}); const url=URL.createObjectURL(r.data); const a=document.createElement("a"); a.href=url; a.download="evidence"; a.click(); URL.revokeObjectURL(url); },
};