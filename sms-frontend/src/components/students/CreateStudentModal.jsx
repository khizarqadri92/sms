import { useState, useEffect } from "react";
import studentsApi from "../../api/studentsApi";

export default function CreateStudentModal({ onCreated, onClose }) {
  const [nextEnrollmentNo, setNextEnrollmentNo] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", password: "", date_of_birth: "", gender: "", blood_group: "", address: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    studentsApi.getNextEnrollmentNo()
      .then(r => setNextEnrollmentNo(r.data.data.next_enrollment_no))
      .catch(() => setNextEnrollmentNo("Will be assigned automatically"))
      .finally(() => setLoadingPreview(false));
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      // enrollment_no is never sent - the backend always generates the real
      // number fresh at creation time, since this preview could go stale if
      // another enrollment happens in between.
      await studentsApi.create(form);
      onCreated();
    }
    catch (err) { setError(err.response?.data?.message || "Failed to enroll student."); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Enroll New Student</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Enrollment No.</label>
            <input
              className="form-control"
              value={loadingPreview ? "Loading..." : nextEnrollmentNo}
              readOnly
              disabled
              style={{ background: "#f1f5f9", color: "#64748b", fontWeight: 600, cursor: "not-allowed" }}
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              Assigned automatically when the student is enrolled.
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">First Name *</label><input className="form-control" name="first_name" value={form.first_name} onChange={handleChange} required /></div>
              <div className="form-group"><label className="form-label">Last Name *</label><input className="form-control" name="last_name" value={form.last_name} onChange={handleChange} required /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" name="email" value={form.email} onChange={handleChange} placeholder="Optional" /></div>
              <div className="form-group"><label className="form-label">Password *</label><input className="form-control" type="password" name="password" value={form.password} onChange={handleChange} required /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" name="phone" value={form.phone} onChange={handleChange} /></div>
              <div className="form-group"><label className="form-label">Date of Birth</label><input className="form-control" type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} /></div>
              <div className="form-group"><label className="form-label">Gender</label><select className="form-control" name="gender" value={form.gender} onChange={handleChange}><option value="">— Select —</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
              <div className="form-group"><label className="form-label">Blood Group</label><select className="form-control" name="blood_group" value={form.blood_group} onChange={handleChange}><option value="">— Select —</option>{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(b => <option key={b} value={b}>{b}</option>)}</select></div>
              <div className="form-group form-grid-full"><label className="form-label">Address</label><input className="form-control" name="address" value={form.address} onChange={handleChange} /></div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? "Enrolling..." : "Enroll Student"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
