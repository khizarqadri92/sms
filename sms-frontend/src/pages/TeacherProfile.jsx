import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import teachersApi from "../api/teachersApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

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

      {toast && <div className="alert alert-success" style={{ marginBottom:16 }}>{toast}</div>}

      <div className="profile-layout">
        <div className="profile-card">
          <div className="profile-avatar" style={{ background:"linear-gradient(135deg, #059669, #34d399)" }}>
            {initials.toUpperCase()}
          </div>
          <div className="profile-name">{teacher.first_name} {teacher.last_name}</div>
          <div className="profile-sub">{teacher.employee_no}</div>
          <span className={"badge " + (teacher.status === "active" ? "badge-success" : "badge-danger")}>
            {teacher.status}
          </span>
          <div style={{ marginTop:20 }}>
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
      <div className="section-card" style={{ marginBottom:16 }}>
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
            <span className="profile-detail-value" style={{ textTransform:"capitalize" }}>{value}</span>
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
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
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
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
            {assigned.map(s => (
              <div
                key={s.id}
                style={{ display:"flex", alignItems:"center", gap:6, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"6px 12px" }}
              >
                <span style={{ fontSize:13, fontWeight:600, color:"#166534" }}>{s.name}</span>
                <span style={{ fontSize:11, color:"#94a3b8" }}>({s.code})</span>
                <button
                  onClick={() => { setSelected(String(s.id)); }}
                  style={{ background:"none", border:"none", color:"#dc2626", cursor:"pointer", fontSize:14, lineHeight:1, marginLeft:4 }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="section-card-header" style={{ marginTop:16 }}>
          <span className="section-card-title">Assign or Remove Subject</span>
        </div>

        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <select
            className="form-control"
            style={{ flex:1, minWidth:200 }}
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
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {DAYS.map(day => (
          <div
            key={day}
            style={{ background:"#f8fafc", borderRadius:8, padding:12, border:"1px solid #e2e8f0" }}
          >
            <div style={{ fontSize:11, fontWeight:700, color:"#2563eb", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>
              {day}
            </div>
            {byDay[day].length === 0 ? (
              <div style={{ fontSize:11, color:"#cbd5e1", textAlign:"center", padding:"8px 0" }}>Free</div>
            ) : (
              byDay[day].map((slot, i) => (
                <div
                  key={i}
                  style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:6, padding:"8px 10px", marginBottom:6 }}
                >
                  <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{slot.subject_name}</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>{slot.class_name}{slot.section ? " ("+slot.section+")" : ""}</div>
                  <div style={{ fontSize:11, color:"#2563eb", fontWeight:600, marginTop:2 }}>
                    {slot.start_time ? slot.start_time.slice(0,5) : ""} - {slot.end_time ? slot.end_time.slice(0,5) : ""}
                  </div>
                  {slot.room_number && (
                    <div style={{ fontSize:10, color:"#94a3b8" }}>Room: {slot.room_number}</div>
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
              style={{ borderTop: c.is_primary ? "3px solid #2563eb" : "3px solid #e2e8f0", padding:"16px" }}
            >
              <div className="stat-card-value" style={{ fontSize:20 }}>{c.name}{c.section ? " (" + c.section + ")" : ""}</div>
              <div className="stat-card-label">{c.student_count} students</div>
              {c.subject_names && (
                <div style={{ fontSize:11, color:"#16a34a", fontWeight:500, marginTop:4 }}>{c.subject_names}</div>
              )}
              {c.is_primary && (
                <div style={{ marginTop:6 }}>
                  <span className="badge badge-primary" style={{ fontSize:10 }}>Class Teacher</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}