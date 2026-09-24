import { useState } from "react";
import teachersApi from "../../api/teachersApi";
import DatePicker from "../DatePicker";

export default function CreateTeacherModal({ onCreated, onClose }) {
  const [form, setForm]       = useState({
    first_name:"", last_name:"", email:"", phone:"",
    password:"", employee_no:"", qualification:"",
    specialization:"", gender:"", date_of_birth:"", join_date:""
  });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await teachersApi.create(form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create teacher.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Add New Teacher</h2>
        {error && <div className="alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">First Name *</label>
              <input className="form-input" name="first_name" value={form.first_name} onChange={handleChange} required />
            </div>
            <div className="form-field">
              <label className="form-label">Last Name *</label>
              <input className="form-input" name="last_name" value={form.last_name} onChange={handleChange} required />
            </div>
            <div className="form-field">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
            <div className="form-field">
              <label className="form-label">Employee No *</label>
              <input className="form-input" name="employee_no" value={form.employee_no} onChange={handleChange} required />
            </div>
            <div className="form-field">
              <label className="form-label">Password *</label>
              <input className="form-input" type="password" name="password" value={form.password} onChange={handleChange} required />
            </div>
            <div className="form-field">
              <label className="form-label">Phone</label>
              <input className="form-input" name="phone" value={form.phone} onChange={handleChange} />
            </div>
            <div className="form-field">
              <label className="form-label">Gender</label>
              <select className="form-select" name="gender" value={form.gender} onChange={handleChange}>
                <option value="">— Select —</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Date of Birth</label>
              <DatePicker style={{ width: "100%" }} value={form.date_of_birth} onChange={val => setForm(p => ({ ...p, date_of_birth: val }))} />
            </div>
            <div className="form-field">
              <label className="form-label">Join Date</label>
              <DatePicker style={{ width: "100%" }} value={form.join_date} onChange={val => setForm(p => ({ ...p, join_date: val }))} />
            </div>
            <div className="form-field">
              <label className="form-label">Qualification</label>
              <input className="form-input" name="qualification" value={form.qualification} onChange={handleChange} placeholder="e.g. MSc Mathematics" />
            </div>
            <div className="form-field form-field-full">
              <label className="form-label">Specialization</label>
              <input className="form-input" name="specialization" value={form.specialization} onChange={handleChange} placeholder="e.g. Mathematics, Physics" />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creating..." : "Add Teacher"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}