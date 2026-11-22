import client from "./client";
const B = "/attendance-capture";
const attendanceCaptureApi = {
  config:        ()               => client.get(B + "/config"),
  getSettings:   ()               => client.get(B + "/settings"),
  saveSettings:  (d)              => client.put(B + "/settings", d),
  devices:       ()               => client.get(B + "/devices"),
  addDevice:     (d)              => client.post(B + "/devices", d),
  editDevice:    (id, d)          => client.put(B + "/devices/" + id, d),
  newKey:        (id)             => client.post(B + "/devices/" + id + "/new-key"),
  students:      (params)         => client.get(B + "/students", { params }),
  assign:        (id, kind, identifier, reason) => client.post(B + "/students/" + id + "/identifier", { kind, identifier, reason }),
  remove:        (id, kind, reason) => client.delete(B + "/students/" + id + "/identifier", { params: { kind, reason } }),
  gateScan:      (identifier, device_id) => client.post(B + "/gate-scan", { identifier, device_id }),
  today:         ()               => client.get(B + "/today"),
  runAbsentees:  ()               => client.post(B + "/run-absentees"),
  resolve:       (scanId, student_id) => client.post(B + "/scans/" + scanId + "/resolve", { student_id }),
};
export default attendanceCaptureApi;
