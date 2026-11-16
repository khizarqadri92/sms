import client from "./client";

// Admission portal: public (no login) and the parent's own admissions.
const form = (data, docs) => {
  const f = new FormData();
  f.append("data", JSON.stringify(data));
  f.append("document_names", JSON.stringify(docs.map(d => d.name)));
  docs.forEach((d, i) => f.append("doc_" + i, d.file));
  return f;
};
const portalApi = {
  campuses:   ()             => client.get("/admission-portal/public/campuses"),
  schedule:   (campusId)     => client.get("/admission-portal/public/schedule", { params: { campus_id: campusId } }),
  apply:      (data, docs)   => client.post("/admission-portal/public/apply", form(data, docs)),
  myApply:    (data, docs)   => client.post("/admission-portal/my/apply", form(data, docs)),
  mine:       ()             => client.get("/admission-portal/my/applications"),
  edit:       (id, data)     => client.put("/admission-portal/my/applications/" + id, data),
  upload:     (id, name, file) => { const f = new FormData(); f.append("document_name", name); f.append("file", file);
                                    return client.post("/admission-portal/my/applications/" + id + "/documents", f); },
  action:     (id, action, remarks) => client.post("/admission-portal/my/applications/" + id + "/action", { action, remarks }),
  voucher:    (id)           => client.get("/admission-portal/my/applications/" + id + "/voucher", { responseType: "blob" }),
  pay:        (id, data)     => client.post("/admission-portal/my/applications/" + id + "/pay", data),
  formPdf:    (id)           => client.get("/admission-portal/my/applications/" + id + "/pdf", { responseType: "blob" }),
  myLookupCnic:    (cnic)        => client.get("/admission-portal/my/lookup/cnic", { params: { cnic } }),
  myLookupStudent: (no, cnic)    => client.get("/admission-portal/my/lookup/student", { params: { enrollment_no: no, cnic } }),
  publicLookupStudent: (no, cnic) => client.get("/admission-portal/public/lookup/student", { params: { enrollment_no: no, cnic } }),
  publicLookupCnic: (cnic)     => client.get("/admission-portal/public/lookup/cnic", { params: { cnic } }),
  announcement: (id)         => client.get("/admission-portal/announcement/" + id),
  bannerImage:  (id)         => client.get("/admission-portal/banner/" + id + "/image", { responseType: "blob" }),
};
export default portalApi;
