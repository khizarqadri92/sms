import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import teachersApi from "../api/teachersApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./TeacherProfile.css";

const ALL_TABS = [
  { label:"Profile",   perm:null },
  { label:"Edit Info", perm:"teachers.edit" },
  { label:"Subjects",  perm:"teachers.edit" },
  { label:"Timetable", perm:"timetable.view" },
  { label:"Classes",   perm:"classes.view" },
];
const DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function formatDate(dateStr, fmt) {
  if (!dateStr) return "N/A";
  try { return fmt ? fmt(dateStr) : new Date(dateStr).toLocaleDateString("en-US"); }
  catch { return dateStr; }
}

function formatDateInput(dateStr) {
  if (!dateStr) return "";
  try { return new Date(dateStr).toISOString().split("T")[0]; }
  catch { return ""; }
}

export default function TeacherProfile() {
  const { formatDate: fmtDate, formatDateTime } = useRegionalSettings();
  const { can } = useAuth();
  const { id }                  = useParams();
  const navigate                = useNavigate();
  const [teacher,  setTeacher]  = useState(null);
  const [tab,      setTab]      = useState("Profile");
  const [loading,  setLoading]  = useState(true);
  const [pageError,setPageError]= useState("");
  const [toast,    setToast]    = useState("");

  useEffect(() => { fetchTeacher(); }, [id]);

  const fetchTeacher = async () => {
    setLoading(true);
    try {
      const res = await teachersApi.getById(id);
      setTeacher(res.data.data);
    } catch { setPageError("Teacher not found."); }
    finally  { setLoading(false); }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  if (loading)    return <div className="loading-state">Loading teacher profile...</div>;
  if (pageError)  return <div className="alert alert-error">{pageError}</div>;
  if (!teacher)   return null;

  const initials = (teacher.first_name?.[0] || "") + (teacher.last_name?.[0] || "");

  const profileRows = [
    ["Employee No",    teacher.employee_no     || "N/A"],
    ["Email",          teacher.email           || "N/A"],
    ["Phone",          teacher.phone           || "N/A"],
    ["Gender",         teacher.gender          || "N/A"],
    ["Specialization", teacher.specialization  || "N/A"],
    ["Qualification",  teacher.qualification   || "N/A"],
    ["Join Date",      formatDate(teacher.join_date, fmtDate)],
    ["Date of Birth",  formatDate(teacher.date_of_birth, fmtDate)],
    ["Subjects",       (teacher.subjects?.length || 0) + " assigned"],
    ["Classes",        (teacher.classes?.length  || 0) + " assigned"],
  ];

  return (
    <div>
      <button className="btn-back" onClick={() => navigate("/teachers")}>
        Back to Teachers
      </button>

      {toast && <div className="alert alert-success tp-toast">{toast}</div>}

      <div className="profile-layout">
        <div className="profile-card">
          <div className="profile-avatar tp-avatar-gradient">
            {initials.toUpperCase()}
          </div>
          <div className="profile-name">{teacher.first_name} {teacher.last_name}</div>
          <div className="profile-sub">{teacher.employee_no}</div>
          <span className={"badge " + (teacher.status === "active" ? "badge-success" : "badge-danger")}>
            {teacher.status}
          </span>
          <div className="tp-detail-rows-wrap">
            {profileRows.map(([label, value]) => (
              <div key={label} className="profile-detail">
                <span className="profile-detail-label">{label}</span>
                <span className="profile-detail-value">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="tabs">
            {ALL_TABS.filter(t => !t.perm || can(t.perm)).map(t => (
              <button
key={t.label}
className={"tab-btn " + (tab === t.label ? "active" : "")}
onClick={() => setTab(t.label)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "Profile"   && <ProfileTab   teacher={teacher} />}
          {tab === "Edit Info" && <EditTab      teacher={teacher} onSaved={async () => { await fetchTeacher(); showToast("Teacher updated successfully."); }} />}
          {tab === "Subjects"  && <SubjectsTab  teacherId={id} onRefresh={fetchTeacher} />}
          {tab === "Timetable" && <TimetableTab teacherId={id} />}
          {tab === "Classes"   && <ClassesTab   teacher={teacher} />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ teacher }) {
  const { formatDate: fmtDate, formatDateTime } = useRegionalSettings();
  const { can } = useAuth();
  return (
    <div>
      <div className="section-card tp-section-card-spaced">
        <div className="section-card-header">
          <span className="section-card-title">Teacher Information</span>
        </div>
        {[
          ["Employee No",    teacher.employee_no   || "N/A"],
          ["Full Name",      (teacher.first_name   || "") + " " + (teacher.last_name || "")],
          ["Email",          teacher.email          || "N/A"],
          ["Phone",          teacher.phone          || "N/A"],
          ["Gender",         teacher.gender         || "N/A"],
          ["Qualification",  teacher.qualification  || "N/A"],
          ["Specialization", teacher.specialization || "N/A"],
          ["Join Date",      formatDate(teacher.join_date, fmtDate)],
          ["Status",         teacher.status         || "N/A"],
        ].map(([label, value]) => (
          <div key={label} className="profile-detail">
            <span className="profile-detail-label">{label}</span>
            <span className="profile-detail-value tp-detail-value-cap">{value}</span>
          </div>
        ))}
      </div>
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Account Details</span>
        </div>
        {[
          ["User ID",    String(teacher.user_id || "N/A")],
          ["Active",     teacher.is_active   ? "Yes" : "No"],
          ["Last Login", teacher.last_login_at ? formatDateTime(teacher.last_login_at) : "Never"],
          ["Created",    formatDate(teacher.created_at, fmtDate)],
        ].map(([label, value]) => (
          <div key={label} className="profile-detail">
            <span className="profile-detail-label">{label}</span>
            <span className="profile-detail-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditTab({ teacher, onSaved }) {
  const [form, setForm] = useState({
    first_name:     teacher.first_name     || "",
    last_name:      teacher.last_name      || "",
    gender:         teacher.gender         || "",
    date_of_birth:  formatDateInput(teacher.date_of_birth),
    join_date:      formatDateInput(teacher.join_date),
    qualification:  teacher.qualification  || "",
    specialization: teacher.specialization || "",
    status:         teacher.status         || "active",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await teachersApi.update(teacher.id, form);
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update teacher.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Edit Teacher Information</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">First Name *</label>
            <input className="form-control" name="first_name" value={form.first_name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name *</label>
            <input className="form-control" name="last_name" value={form.last_name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select className="form-control" name="gender" value={form.gender} onChange={handleChange}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-control" name="status" value={form.status} onChange={handleChange}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <DatePicker value={form.date_of_birth} onChange={val => setForm(f => ({ ...f, date_of_birth: val }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Join Date</label>
            <DatePicker value={form.join_date} onChange={val => setForm(f => ({ ...f, join_date: val }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Qualification</label>
            <input className="form-control" name="qualification" value={form.qualification} onChange={handleChange} placeholder="e.g. MSc Mathematics" />
          </div>
          <div className="form-group">
            <label className="form-label">Specialization</label>
            <input className="form-control" name="specialization" value={form.specialization} onChange={handleChange} placeholder="e.g. Mathematics, Physics" />
          </div>
        </div>
        <div className="tp-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SubjectsTab({ teacherId, onRefresh }) {
  const { can } = useAuth();
  const [assigned,    setAssigned]    = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [selected,    setSelected]    = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");

  useEffect(() => { fetchData(); }, [teacherId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sub, all] = await Promise.all([
        teachersApi.getSubjects(teacherId),
        teachersApi.getAllSubjects(),
      ]);
      setAssigned(sub.data.data    || []);
      setAllSubjects(all.data.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const handleAction = async (action) => {
    if (!selected) { setError("Please select a subject."); return; }
    setSaving(true);
    setError("");
    try {
      await teachersApi.assignSubject(teacherId, { subject_id: parseInt(selected), action });
      setSuccess(action === "assign" ? "Subject assigned." : "Subject removed.");
      setSelected("");
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update subject.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading subjects...</div>;

  const unassignedSubjects = allSubjects.filter(
    s => !assigned.find(a => a.id === s.id)
  );

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Assigned Subjects</span>
          <span className="badge badge-primary">{assigned.length} subjects</span>
        </div>

        {assigned.length === 0 ? (
          <div className="empty-state">No subjects assigned yet.</div>
        ) : (
          <div className="tp-chip-row">
            {assigned.map(s => (
              <div
                key={s.id}
                className="tp-subject-chip"
              >
                <span className="tp-chip-name">{s.name}</span>
                <span className="tp-chip-code">({s.code})</span>
                <button
                  onClick={() => { setSelected(String(s.id)); }}
                  className="tp-chip-remove-btn"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="section-card-header tp-section-header-spaced">
          <span className="section-card-title">Assign or Remove Subject</span>
        </div>

        <div className="tp-assign-row">
          <select
            className="form-control tp-assign-select"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">Select a subject</option>
            <optgroup label="Unassigned">
              {unassignedSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </optgroup>
            <optgroup label="Already assigned">
              {assigned.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </optgroup>
          </select>
          <button
            className="btn btn-primary"
            onClick={() => handleAction("assign")}
            disabled={saving || !selected}
          >
            Assign
          </button>
          {can("teachers.edit") && <button
            className="btn btn-danger"
            onClick={() => handleAction("remove")}
            disabled={saving || !selected}
          >
            Remove
          </button>}
        </div>
      </div>
    </div>
  );
}

function TimetableTab({ teacherId }) {
  const [timetable, setTimetable] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    teachersApi.getTimetable(teacherId)
      .then(res => setTimetable(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teacherId]);

  if (loading) return <div className="loading-state">Loading timetable...</div>;
  if (timetable.length === 0) return (
    <div className="section-card">
      <div className="empty-state">No timetable assigned yet. Contact academic coordinator to set up timetable.</div>
    </div>
  );

  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = timetable.filter(t => t.day_name === day);
    return acc;
  }, {});

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Weekly Timetable</span>
        <span className="badge badge-gray">{timetable.length} periods</span>
      </div>
      <div className="tp-timetable-grid">
        {DAYS.map(day => (
          <div
            key={day}
            className="tp-day-card"
          >
            <div className="tp-day-label">
              {day}
            </div>
            {byDay[day].length === 0 ? (
              <div className="tp-free-slot">Free</div>
            ) : (
              byDay[day].map((slot, i) => (
                <div
                  key={i}
                  className="tp-slot-card"
                >
                  <div className="tp-slot-subject">{slot.subject_name}</div>
                  <div className="tp-slot-class">{slot.class_name}{slot.section ? " ("+slot.section+")" : ""}</div>
                  <div className="tp-slot-time">
                    {slot.start_time ? slot.start_time.slice(0,5) : ""} - {slot.end_time ? slot.end_time.slice(0,5) : ""}
                  </div>
                  {slot.room_number && (
                    <div className="tp-slot-room">Room: {slot.room_number}</div>
                  )}
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassesTab({ teacher }) {
  const classes = teacher.classes || [];
  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Assigned Classes</span>
        <span className="badge badge-primary">{classes.length} classes</span>
      </div>
      {classes.length === 0 ? (
        <div className="empty-state">No classes assigned yet.</div>
      ) : (
        <div className="stats-grid">
          {classes.map(c => (
            <div
              key={c.id}
              className="stat-card"
              className="tp-class-card" style={{ "--card-accent": c.is_primary ? "#2563eb" : "var(--border-color)" }}
            >
              <div className="stat-card-value tp-class-name">{c.name}{c.section ? " (" + c.section + ")" : ""}</div>
              <div className="stat-card-label">{c.student_count} students</div>
              {c.subject_names && (
                <div className="tp-class-subjects">{c.subject_names}</div>
              )}
              {c.is_primary && (
                <div className="tp-class-teacher-badge-wrap">
                  <span className="badge badge-primary tp-class-teacher-badge">Class Teacher</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}