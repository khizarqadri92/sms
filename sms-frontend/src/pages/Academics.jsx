import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import academicsApi from "../api/academicsApi";
import teachersApi  from "../api/teachersApi";
import settingsApi from "../api/settingsApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";

const TABS = ["Academic Years", "Classes", "Subjects", "Timetable", "Class Overview"];
const DAYS = [
  { value:1, label:"Monday" },
  { value:2, label:"Tuesday" },
  { value:3, label:"Wednesday" },
  { value:4, label:"Thursday" },
  { value:5, label:"Friday" },
  { value:6, label:"Saturday" },
];

export default function Academics({ visibleTabs } = {}) {
  const [tab, setTab] = useState(visibleTabs ? visibleTabs[0] : "years");

  useEffect(() => {
    const handler = (e) => {
      const sub = e.detail?.sub;
    if (["years","classes","subjects","timetable","overview"].includes(sub)) {
        setTab(sub);
      }
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Academic Management</h1>
      </div>
      {tab === "years"     && (!visibleTabs || visibleTabs.includes("years")) && <YearsTab />}
      {tab === "classes"   && (!visibleTabs || visibleTabs.includes("classes")) && <ClassesTab />}
      {tab === "subjects"  && (!visibleTabs || visibleTabs.includes("subjects")) && <SubjectsTab />}
      {tab === "timetable" && (!visibleTabs || visibleTabs.includes("timetable")) && <TimetableTab />}
      {tab === "overview"   && (!visibleTabs || visibleTabs.includes("overview")) && <ClassOverviewTab />}
    </div>
  );
}

/* ── Academic Years ──────────────────────────────────────────── */
function YearsTab() {
  const { formatDate } = useRegionalSettings();
  const { can } = useAuth();
  const { isGlobalLocked } = useGovernanceMode("academic_years");
  const canManage = can("academics.manage") && !isGlobalLocked;
  const [years,    setYears]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ name:"", start_date:"", end_date:"" });
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => { fetchYears(); }, []);

  const fetchYears = async () => {
    setLoading(true);
    try {
      const res = await academicsApi.getYears();
      setYears(res.data.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const handleCreate = async e => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await academicsApi.createYear(form);
      setSuccess("Academic year created.");
      setShowForm(false);
      setForm({ name:"", start_date:"", end_date:"" });
      fetchYears();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create academic year.");
    } finally { setSaving(false); }
  };

  const handleActivate = async (id) => {
    try {
      await academicsApi.activateYear(id);
      setSuccess("Academic year activated.");
      fetchYears();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to activate.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Academic Years</h2>
        {canManage && <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Academic Year"}
        </button>}
      </div>

      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Academic Years are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}
      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">Create Academic Year</span>
          </div>
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Name (e.g. 2025-2026) *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required placeholder="2025-2026" />
              </div>
              <div className="form-group" />
              <div className="form-group">
                <label className="form-label">Start Date *</label>
                <DatePicker value={form.start_date} onChange={val => setForm({...form, start_date:val})} />
              </div>
              <div className="form-group">
                <label className="form-label">End Date *</label>
                <DatePicker value={form.end_date} onChange={val => setForm({...form, end_date:val})} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create Year"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-state">Loading...</div>
      : years.length === 0 ? <div className="empty-state">No academic years found. Create one above.</div>
      : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.id}>
                  <td><strong>{y.name}</strong></td>
                  <td>{y.start_date ? formatDate(y.start_date) : "N/A"}</td>
                  <td>{y.end_date   ? formatDate(y.end_date)   : "N/A"}</td>
                  <td>
                    {y.is_active
                      ? <span className="badge badge-success">Active</span>
                      : <span className="badge badge-gray">Inactive</span>}
                  </td>
                  <td>
                      {!y.is_active && canManage && (
                        <button className="btn btn-ghost btn-xs" onClick={() => handleActivate(y.id)}>
                          Set Active
                        </button>
                      )} 
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Classes ─────────────────────────────────────────────────── */
function ClassesTab() {
  const { can } = useAuth();
  const { isGlobalLocked } = useGovernanceMode("classes");
  const canManage = can("classes.manage") && !isGlobalLocked;
  const [classes,  setClasses]  = useState([]);
  const [years,    setYears]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form,     setForm]     = useState({ name:"", section:"", academic_year_id:"", capacity:40, room_number:"", class_type:"regular" });
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedClassSubj, setSelectedClassSubj] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cls, yr] = await Promise.all([academicsApi.getClasses(), academicsApi.getYears()]);
      setClasses(cls.data.data || []);
      setYears(yr.data.data   || []);
    } catch {}
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditItem(null); setForm({ name:"", section:"", academic_year_id:"", capacity:40, room_number:"", class_type:"regular" }); setShowForm(true); };
  const openEdit   = (c)  => { setEditItem(c); setForm({ name:c.name, section:c.section||"", academic_year_id:c.academic_year_id||"", capacity:c.capacity||40, room_number:c.room_number||"", class_type:c.class_type||"regular" }); setShowForm(true); };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (editItem) {
        await academicsApi.updateClass(editItem.id, form);
        setSuccess("Class updated.");
      } else {
        await academicsApi.createClass(form);
        setSuccess("Class created.");
      }
      setShowForm(false);
      fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save class.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this class? Students in this class will be unassigned.")) return;
    try {
      await academicsApi.deleteClass(id);
      setSuccess("Class deleted.");
      fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete. Class may have students.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Classes</h2>
        {canManage && <button className="btn btn-primary" onClick={openCreate}>+ New Class</button>}
      </div>

      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Classes are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">{editItem ? "Edit Class" : "Create Class"}</span>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Class Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required placeholder="e.g. Grade 5" />
              </div>
              <div className="form-group">
                <label className="form-label">Section</label>
                <input className="form-control" value={form.section} onChange={e => setForm({...form, section:e.target.value})} placeholder="e.g. A, B, C" />
              </div>
              <div className="form-group">
                <label className="form-label">Academic Year</label>
                <select className="form-control" value={form.academic_year_id} onChange={e => setForm({...form, academic_year_id:e.target.value})}>
                  <option value="">Select year</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_active ? " (Active)" : ""}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input className="form-control" type="number" value={form.capacity} onChange={e => setForm({...form, capacity:e.target.value})} min="1" max="100" />
              </div>
              <div className="form-group">
                <label className="form-label">Room Number</label>
                <input className="form-control" value={form.room_number} onChange={e => setForm({...form, room_number:e.target.value})} placeholder="e.g. 101" />
              </div>
              <div className="form-group">
                <label className="form-label">Class Type *</label>
                <select className="form-control" value={form.class_type} onChange={e => setForm({...form, class_type:e.target.value})} required>
                  <option value="regular">Regular</option>
                  <option value="montessori">Montessori</option>
                </select>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editItem ? "Update Class" : "Create Class"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-state">Loading...</div>
      : classes.length === 0 ? <div className="empty-state">No classes found. Create one above.</div>
      : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Section</th>
                <th>Class Type</th>
                <th>Academic Year</th>
                <th>Capacity</th>
                <th>Students</th>
                <th>Teachers</th>
                <th>Subjects</th>
                <th>Room</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.section || "N/A"}</td>
                  <td>
                    <span className={"badge " + (c.class_type === "montessori" ? "badge-warning" : "badge-primary")}>
                      {c.class_type || "regular"}
                    </span>
                  </td>
                  <td>{c.year_name || "N/A"}</td>
                  <td>{c.capacity}</td>
                  <td><span className="badge badge-primary">{c.student_count || 0}</span></td>
                  <td><span className="badge badge-gray">{c.teacher_count || 0}</span></td>
                  <td><span className="badge badge-gray">{c.subject_count || 0}</span></td>
                  <td>{c.room_number || "N/A"}</td>
                  <td style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-primary btn-xs" onClick={() => setSelectedClass(c)}>Teachers</button>
                    <button className="btn btn-secondary btn-xs" onClick={() => setSelectedClassSubj(c)}>Subjects</button>
                    {canManage && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(c)}>Edit</button>}
                    {canManage && <button className="btn btn-danger btn-xs" onClick={() => handleDelete(c.id)}>Delete</button>}
                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedClass && <ClassDetail classItem={selectedClass} onClose={() => setSelectedClass(null)} isGlobalLocked={isGlobalLocked} />}
      {selectedClassSubj && <ClassSubjectsModal classItem={selectedClassSubj} onClose={() => { setSelectedClassSubj(null); fetchData(); }} isGlobalLocked={isGlobalLocked} />}
    </div>
  );
}

/* ── Subjects ────────────────────────────────────────────────── */
function SubjectsTab() {
  const { can } = useAuth();
  const { isGlobalLocked } = useGovernanceMode("subjects");
  const canManage = can("subjects.manage") && !isGlobalLocked;
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form,     setForm]     = useState({ name:"", code:"", description:"", credit_hours:1 });
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => { fetchSubjects(); }, []);

  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const res = await academicsApi.getSubjects();
      setSubjects(res.data.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditItem(null); setForm({ name:"", code:"", description:"", credit_hours:1 }); setShowForm(true); };
  const openEdit   = (s)  => { setEditItem(s); setForm({ name:s.name, code:s.code, description:s.description||"", credit_hours:s.credit_hours||1 }); setShowForm(true); };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (editItem) {
        await academicsApi.updateSubject(editItem.id, form);
        setSuccess("Subject updated.");
      } else {
        await academicsApi.createSubject(form);
        setSuccess("Subject created.");
      }
      setShowForm(false);
      fetchSubjects();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save subject.");
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("Deactivate this subject?")) return;
    try {
      await academicsApi.deleteSubject(id);
      setSuccess("Subject deactivated.");
      fetchSubjects();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to deactivate subject.");
    }
  };

  const handleReactivate = async (id) => {
    if (!window.confirm("Reactivate this subject?")) return;
    try {
      await academicsApi.reactivateSubject(id);
      setSuccess("Subject reactivated.");
      fetchSubjects();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to reactivate subject.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Subjects</h2>
        {canManage && <button className="btn btn-primary" onClick={openCreate}>+ New Subject</button>}
      </div>

      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Subjects are managed centrally by the superadmin. This list is read-only here.
        </div>
      )}
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">{editItem ? "Edit Subject" : "Create Subject"}</span>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Subject Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required placeholder="e.g. Mathematics" />
              </div>
              <div className="form-group">
                <label className="form-label">Subject Code *</label>
                <input className="form-control" value={form.code} onChange={e => setForm({...form, code:e.target.value})} required placeholder="e.g. MATH-101" />
              </div>
              <div className="form-group">
                <label className="form-label">Credit Hours</label>
                <input className="form-control" type="number" value={form.credit_hours} onChange={e => setForm({...form, credit_hours:e.target.value})} min="1" max="6" />
              </div>
              <div className="form-group" />
              <div className="form-group form-grid-full">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Brief description" />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editItem ? "Update Subject" : "Create Subject"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-state">Loading...</div>
      : subjects.length === 0 ? <div className="empty-state">No subjects found.</div>
      : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Credit Hours</th>
                <th>Description</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {subjects.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td><code style={{ background:"#f1f5f9", padding:"2px 7px", borderRadius:5, fontSize:12 }}>{s.code}</code></td>
                  <td>{s.credit_hours}</td>
                  <td style={{ color:"#64748b", fontSize:13 }}>{s.description || "N/A"}</td>
                  <td>
                    {s.is_active
                      ? <span className="badge badge-success">Active</span>
                      : <span className="badge badge-danger">Inactive</span>}
                  </td>
                  {canManage && (
                    <td style={{ display:"flex", gap:6 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(s)}>Edit</button>
                      {s.is_active
                        ? <button className="btn btn-danger btn-xs" onClick={() => handleDeactivate(s.id)}>Deactivate</button>
                        : <button className="btn btn-secondary btn-xs" onClick={() => handleReactivate(s.id)}>Activate</button>
                      }
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Timetable ───────────────────────────────────────────────── */
function TimetableTab() {
  const { can } = useAuth();
  const [slots,     setSlots]     = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [subjects,  setSubjects]  = useState([]);
  const [teachers,  setTeachers]  = useState([]);
  const [classId,   setClassId]   = useState("");
  const [activeDay,  setActiveDay]  = useState("all");
  const [showAI,     setShowAI]     = useState(false);
  const [aiLoading,  setAILoading]  = useState(false);
  const [aiResult,   setAIResult]   = useState(null);
  const [aiError,    setAIError]    = useState("");
  const [applying,   setApplying]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ class_id:"", subject_id:"", teacher_id:"", day_of_week:"1", start_time:"08:00", end_time:"09:00", room_number:"" });
  const [filteredSubjects, setFilteredSubjects] = useState([]);
  const [filteredTeachers, setFilteredTeachers] = useState([]);
  const [allDays,   setAllDays]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState("");
  const [error,     setError]     = useState("");

  useEffect(() => { fetchMeta(); }, []);
  useEffect(() => { fetchSlots(); }, [classId]);

  const fetchMeta = async () => {
    try {
      const [cls, sub, tch] = await Promise.all([
        academicsApi.getClasses(),
        academicsApi.getSubjects(),
        teachersApi.getAll({ per_page:100 }),
      ]);
      setClasses(cls.data.data  || []);
      setSubjects(sub.data.data || []);
      setTeachers(tch.data.data || []);
    } catch {}
  };

  useEffect(() => {
    if (!form.class_id) {
      setFilteredSubjects([]);
      setFilteredTeachers([]);
      setForm(f => ({ ...f, subject_id:"", teacher_id:"" }));
      return;
    }
    Promise.all([
      academicsApi.getClassSubjects(form.class_id),
      academicsApi.getClassTeachers(form.class_id),
    ]).then(([cs, ct]) => {
      setFilteredSubjects(cs.data.data || []);
      setFilteredTeachers(ct.data.data || []);
      setForm(f => ({ ...f, subject_id:"", teacher_id:"" }));
    }).catch(() => {});
  }, [form.class_id]);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const res = await academicsApi.getTimetable(classId ? { class_id: classId } : {});
      setSlots(res.data.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const handleCreate = async e => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const base = { ...form, class_id: classId || form.class_id };
      if (allDays) {
        // Create entry for all 5 weekdays
        const days = ["1","2","3","4","5"];
        await Promise.all(days.map(d => academicsApi.createTimetable({ ...base, day_of_week: d })));
        setSuccess("Timetable entry added for all weekdays.");
      } else {
        await academicsApi.createTimetable(base);
        setSuccess("Timetable entry added.");
      }
      setShowForm(false);
      setAllDays(false);
      if (classId) fetchSlots();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add entry. Teacher may already have a class at this time.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await academicsApi.deleteTimetable(id);
      setSuccess("Entry deleted.");
      fetchSlots();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to delete entry.");
    }
  };

  const byDay = DAYS.reduce((acc, d) => {
    acc[d.value] = slots.filter(s => s.day_of_week === d.value);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Timetable</h2>
        {can("timetable.manage") && (
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-secondary" onClick={() => { setShowAI(!showAI); setAIResult(null); setAIError(""); }}>
              {showAI ? "Close AI" : "Generate with AI"}
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "+ Add Period"}
            </button>
          </div>
        )}
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {showAI && (
        <AITimetableGenerator
          onApply={async (slots) => {
            setApplying(true);
            try {
              // Clear each affected class\'s existing timetable first, so
              // applying a regenerated schedule replaces the previous one
              // instead of appending duplicate entries alongside it.
              const affectedClassIds = [...new Set(slots.map(s => s.class_id))];
              for (const classId of affectedClassIds) {
                try { await academicsApi.deleteTimetableForClass(classId); } catch {}
              }
              let saved = 0, skipped = 0;
              for (const s of slots) {
                try {
                  await academicsApi.createTimetable(s);
                  saved++;
                } catch {
                  skipped++;
                }
              }
              setShowAI(false);
              await fetchSlots();
              const msg = skipped > 0
                ? `Applied ${saved} slots. ${skipped} skipped (teacher conflicts).`
                : `AI timetable applied — ${saved} slots added.`;
              setSuccess(msg);
              setTimeout(() => setSuccess(""), 5000);
            } catch (err) {
              setAIError("Failed: " + (err.response?.data?.message || err.message));
            } finally { setApplying(false); }
          }}
          applying={applying}
          aiError={aiError}
          setAIError={setAIError}
        />
      )}

      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">Add Timetable Entry</span>
          </div>
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Class *</label>
                <select className="form-control" value={form.class_id} onChange={e => setForm({...form, class_id:e.target.value})} required>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " ("+c.section+")" : ""}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Subject *</label>
                <select className="form-control" value={form.subject_id} onChange={e => setForm({...form, subject_id:e.target.value})} required>
                  <option value="">{form.class_id ? "Select subject" : "Select class first"}</option>
                  {filteredSubjects.map(s => <option key={s.subject_id || s.id} value={s.subject_id || s.id}>{s.subject_name || s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Teacher *</label>
                <select className="form-control" value={form.teacher_id} onChange={e => setForm({...form, teacher_id:e.target.value})} required>
                  <option value="">{form.class_id ? "Select teacher" : "Select class first"}</option>
                  {filteredTeachers.map(t => <option key={t.teacher_id} value={t.teacher_id}>{t.teacher_name} ({t.employee_no})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Day *</label>
                <select className="form-control" value={form.day_of_week} onChange={e => setForm({...form, day_of_week:e.target.value})} required disabled={allDays}>
                  {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, cursor:"pointer", fontSize:13 }}>
                  <input type="checkbox" checked={allDays} onChange={e => setAllDays(e.target.checked)} style={{ width:16, height:16 }} />
                  <span>Apply to all weekdays (Mon-Fri)</span>
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Start Time *</label>
                <input className="form-control" type="time" value={form.start_time} onChange={e => setForm({...form, start_time:e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">End Time *</label>
                <input className="form-control" type="time" value={form.end_time} onChange={e => setForm({...form, end_time:e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Room Number</label>
                <input className="form-control" value={form.room_number} onChange={e => setForm({...form, room_number:e.target.value})} placeholder="e.g. 101" />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Adding..." : "Add to Timetable"}</button>
            </div>
          </form>
        </div>
      )}


      <div className="section-card">
        {/* Day tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", marginBottom:0 }}>
          {["All Classes","Monday","Tuesday","Wednesday","Thursday","Friday"].map((day, i) => (
            <button key={day}
              onClick={() => setActiveDay(i === 0 ? "all" : String(i))}
              style={{
                flex:1, padding:"8px 4px", fontSize:12, fontWeight:500, border:"none", cursor:"pointer",
                background: activeDay === (i === 0 ? "all" : String(i)) ? "#1e3a5f" : "var(--color-background-secondary)",
                color: activeDay === (i === 0 ? "all" : String(i)) ? "#fff" : "var(--color-text-secondary)",
                borderBottom: activeDay === (i === 0 ? "all" : String(i)) ? "2px solid #1e3a5f" : "none",
              }}
            >{day}</button>
          ))}
        </div>

        {/* Class filter */}
        <div style={{ padding:"12px 16px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", gap:10 }}>
          <label style={{ fontSize:13, color:"var(--color-text-secondary)", whiteSpace:"nowrap" }}>Filter class:</label>
          <select className="form-control" style={{ maxWidth:220 }} value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " ("+c.section+")" : ""}</option>)}
          </select>
        </div>

        {/* Timetable grid */}
        {loading ? <div className="loading-state">Loading...</div> : (() => {
          const dayNames = { "1":"Monday","2":"Tuesday","3":"Wednesday","4":"Thursday","5":"Friday" };
          const days     = activeDay === "all" ? ["1","2","3","4","5"] : [activeDay];
          const filtCls  = classId ? classes.filter(c => String(c.id) === String(classId)) : classes;
          const filtSlots= slots.filter(s =>
            (activeDay === "all" || String(s.day_of_week) === activeDay) &&
            (!classId || String(s.class_id) === String(classId))
          );

          if (filtCls.length === 0) return <div className="empty-state">No classes found.</div>;

          return (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, tableLayout:"fixed" }}>
                <thead>
                  <tr>
                    <th style={{ background:"#1e3a5f", color:"#fff", padding:"8px 10px", width:100, textAlign:"left", fontSize:11 }}>Class</th>
                    {activeDay === "all" ? days.map(d => (
                      <th key={d} style={{ background:"#1e3a5f", color:"#fff", padding:"8px 6px", textAlign:"center", fontSize:11 }}>{dayNames[d]}</th>
                    )) : (
                      // When specific day: show time-sorted periods as columns
                      [...new Set(filtSlots.map(s => s.start_time))].sort().map(t => (
                        <th key={t} style={{ background:"#1e3a5f", color:"#fff", padding:"8px 6px", textAlign:"center", fontSize:11 }}>
                          {t ? t.slice(0,5) : "—"}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtCls.map(cls => {
                    const clsSlots = filtSlots.filter(s => String(s.class_id) === String(cls.id));
                    const colorPalette = [
                    {bg:"#eff6ff",border:"#2563eb",text:"#1e40af"},
                    {bg:"#f0fdf4",border:"#16a34a",text:"#166534"},
                    {bg:"#fef9c3",border:"#ca8a04",text:"#854d0e"},
                    {bg:"#fef2f2",border:"#dc2626",text:"#991b1b"},
                    {bg:"#f5f3ff",border:"#7c3aed",text:"#5b21b6"},
                    {bg:"#fff7ed",border:"#ea580c",text:"#9a3412"},
                    {bg:"#ecfeff",border:"#0891b2",text:"#0e7490"},
                    {bg:"#fdf4ff",border:"#a21caf",text:"#86198f"},
                  ];
                  const subjIds = [...new Set(clsSlots.map(s => s.subject_id))];
                  const subjColorMap = {};
                  subjIds.forEach((id, i) => { subjColorMap[id] = colorPalette[i % colorPalette.length]; });
                    return (
                      <tr key={cls.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                        <td style={{ padding:"8px 10px", background:"var(--color-background-secondary)", fontWeight:500, fontSize:11, color:"var(--color-text-secondary)", verticalAlign:"top" }}>
                          {cls.name}{cls.section ? <span style={{ fontSize:10, color:"#94a3b8" }}> ({cls.section})</span> : ""}
                        </td>
                        {activeDay === "all" ? days.map(d => {
                          const daySlots = clsSlots.filter(s => String(s.day_of_week) === d);
                          return (
                            <td key={d} style={{ padding:"4px 5px", verticalAlign:"top", border:"0.5px solid #f1f5f9" }}>
                              {daySlots.length === 0
                                ? <div style={{ color:"#e2e8f0", textAlign:"center", fontSize:10 }}>—</div>
                                : daySlots.map((s, si) => (
                                  <div key={s.id} style={{ background:subjColorMap[s.subject_id]?.bg||"#f8fafc", borderLeft:"2px solid "+(subjColorMap[s.subject_id]?.border||"#94a3b8"), borderRadius:4, padding:"3px 5px", marginBottom:2 }}>
                                    <div style={{ fontWeight:600, fontSize:10, color:subjColorMap[s.subject_id]?.text||"#334155" }}>{s.subject_name}</div>
                                    <div style={{ fontSize:9, color:"var(--color-text-secondary)" }}>{s.teacher_name}</div>
                                    <div style={{ fontSize:9, color:"#94a3b8" }}>{s.start_time ? s.start_time.slice(0,5) : ""}–{s.end_time ? s.end_time.slice(0,5) : ""}</div>
                                    {can("timetable.manage") && <button onClick={() => handleDelete(s.id)} style={{ background:"none", border:"none", color:"#dc2626", cursor:"pointer", fontSize:10, padding:0 }}>×</button>}
                                  </div>
                                ))
                              }
                            </td>
                          );
                        }) : (
                          [...new Set(filtSlots.map(s => s.start_time))].sort().map(t => {
                            const s = clsSlots.find(sl => sl.start_time === t);
                            return (
                              <td key={t} style={{ padding:"4px 5px", verticalAlign:"top", border:"0.5px solid #f1f5f9" }}>
                                {s ? (
                                  <div style={{ background:subjColorMap[s.subject_id]?.bg||"#eff6ff", borderLeft:"2px solid "+(subjColorMap[s.subject_id]?.border||"#2563eb"), borderRadius:4, padding:"3px 5px" }}>
                                    <div style={{ fontWeight:600, fontSize:10, color:subjColorMap[s.subject_id]?.text||"#1e40af" }}>{s.subject_name}</div>
                                    <div style={{ fontSize:9, color:"var(--color-text-secondary)" }}>{s.teacher_name}</div>
                                    {can("timetable.manage") && <button onClick={() => handleDelete(s.id)} style={{ background:"none", border:"none", color:"#dc2626", cursor:"pointer", fontSize:10, padding:0 }}>×</button>}
                                  </div>
                                ) : <div style={{ color:"#e2e8f0", textAlign:"center", fontSize:10 }}>—</div>}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}


export function ClassDetail({ classItem, onClose, isGlobalLocked }) {
  const { can } = useAuth();
  const canManage = can("classes.manage") && !isGlobalLocked;
  const [classTeachers,  setClassTeachers]  = useState([]);
  const [allTeachers,    setAllTeachers]    = useState([]);
  const [classSubjects,  setClassSubjects]  = useState([]);
  const [allSubjects2,   setAllSubjects2]   = useState([]);
  const [selSubject,     setSelSubject]     = useState("");
  const [selectedTeacher, setSelected]     = useState("");
  const [isPrimary,      setIsPrimary]      = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [success,        setSuccess]        = useState("");
  const [error,          setError]          = useState("");

  useEffect(() => { fetchData(true); }, [classItem.id]);

  const fetchData = async (showLoad=false) => {
    if (showLoad) setLoading(true);
    try {
      const [ct, at, cs, subj] = await Promise.all([
        academicsApi.getClassTeachers(classItem.id),
        teachersApi.getAll({ per_page:100 }),
        academicsApi.getClassSubjects(classItem.id),
        academicsApi.getSubjects(),
      ]);
      setClassTeachers(ct.data.data   || []);
      setAllTeachers(at.data.data     || []);
      setClassSubjects(cs.data.data   || []);
      setAllSubjects2(subj.data.data  || []);
    } catch {} finally { setLoading(false); }
  };

  const isMontessori = classItem.class_type === "montessori";
  const incharge     = classTeachers.find(t => t.is_primary);
  const subjects     = classTeachers.filter(t => !t.is_primary);

  const handleAssign = async () => {
    if (!selectedTeacher) return;
    setSaving(true); setError("");
    try {
      await academicsApi.assignClassTeacher(classItem.id, {
        teacher_id: parseInt(selectedTeacher),
        is_primary: isMontessori ? true : isPrimary,
        action: "assign",
      });
      setSelected(""); setIsPrimary(false);
      await fetchData();
      setSuccess("Teacher assigned.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to assign teacher.");
    } finally { setSaving(false); }
  };

  const handleRemove = async (teacherId) => {
    try {
      await academicsApi.assignClassTeacher(classItem.id, { teacher_id: teacherId, action: "remove" });
      await fetchData();
    } catch (err) { setError(err.response?.data?.message || "Failed to remove."); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth:600 }}>
        <div className="modal-header">
          <div>
            <span className="modal-title">{classItem.name} {classItem.section ? "("+classItem.section+")" : ""}</span>
            <div style={{ marginTop:4 }}>
              <span className={"badge " + (isMontessori ? "badge-warning" : "badge-primary")}>{classItem.class_type}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          {success && <div className="alert alert-success">{success}</div>}
          {error   && <div className="alert alert-error">{error}</div>}

          {loading ? <div className="loading-state">Loading...</div> : (
            <>
              <div className="section-card-header" style={{ marginBottom:12 }}>
                <span className="section-card-title">Class Incharge</span>
              </div>
              {incharge ? (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"#f0fdf4", borderRadius:8, border:"1px solid #bbf7d0", marginBottom:16 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{incharge.teacher_name}</div>
                    <div style={{ fontSize:11, color:"#64748b" }}>{incharge.employee_no}</div>
                    {incharge.subject_names && <div style={{ fontSize:11, color:"#2563eb", marginTop:2 }}>{incharge.subject_names}</div>}
                    {isMontessori && <div style={{ fontSize:11, color:"#16a34a", fontWeight:600 }}>Teaches all subjects</div>}
                  </div>
                  {canManage && <button className="btn btn-danger btn-xs" onClick={() => handleRemove(incharge.teacher_id)}>Remove</button>}
                </div>
              ) : (
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:16 }}>No class incharge assigned.</div>
              )}

              {!isMontessori && subjects.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#64748b", marginBottom:8 }}>Subject Teachers</div>
                  {subjects.map(t => (
                    <div key={t.teacher_id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#f8fafc", borderRadius:6, marginBottom:4 }}>
                      <div>
                        <span style={{ fontWeight:600, fontSize:12 }}>{t.teacher_name}</span>
                        <span style={{ fontSize:11, color:"#64748b", marginLeft:8 }}>{t.employee_no}</span>
                        {t.subject_names && <span style={{ fontSize:11, color:"#2563eb", marginLeft:8 }}>{t.subject_names}</span>}
                      </div>
                      {canManage && <button className="btn btn-danger btn-xs" onClick={() => handleRemove(t.teacher_id)}>Remove</button>}
                    </div>
                  ))}
                </div>
              )}

              <div className="section-card-header" style={{ marginBottom:10 }}>
                <span className="section-card-title">{isMontessori ? "Assign Incharge" : "Assign Teacher"}</span>
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <select className="form-control" value={selectedTeacher} onChange={e => setSelected(e.target.value)} style={{ flex:1 }}>
                  <option value="">Select teacher...</option>
                  {allTeachers.filter(t => t.status === "active").map(t => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.employee_no}){t.subject_names ? " — " + t.subject_names : ""}
                    </option>
                  ))}
                </select>
                {!isMontessori && (
                  <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, whiteSpace:"nowrap" }}>
                    <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
                    Incharge
                  </label>
                )}
                {canManage && (
                  <button className="btn btn-primary" onClick={handleAssign} disabled={saving || !selectedTeacher}>
                    {saving ? "Assigning..." : isMontessori ? "Assign Incharge" : "Assign"}
                  </button>
                )}
              </div>


            </>
          )}
        </div>
      </div>
    </div>
  );
}


function ClassSubjectsModal({ classItem, onClose, isGlobalLocked }) {
  const { can } = useAuth();
  const canManage = can("classes.manage") && !isGlobalLocked;
  const [classSubjects, setClassSubjects] = useState([]);
  const [allSubjects,   setAllSubjects]   = useState([]);
  const [selSubject,    setSelSubject]     = useState("");
  const [loading,       setLoading]        = useState(true);
  const [saving,        setSaving]         = useState(false);
  const [success,       setSuccess]        = useState("");
  const [error,         setError]          = useState("");

  useEffect(() => { fetchData(true); }, [classItem.id]);

  const fetchData = async (showLoad=false) => {
    if (showLoad) setLoading(true);
    try {
      const [cs, subj] = await Promise.all([
        academicsApi.getClassSubjects(classItem.id),
        academicsApi.getSubjects(),
      ]);
      setClassSubjects(cs.data.data   || []);
      setAllSubjects(subj.data.data   || []);
    } catch {} finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!selSubject) return;
    setSaving(true); setError("");
    try {
      await academicsApi.assignClassSubject(classItem.id, { subject_id: parseInt(selSubject) });
      setSelSubject(""); await fetchData();
      setSuccess("Subject added."); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const availableSubjects = allSubjects.filter(s => !classSubjects.find(cs => cs.subject_id === s.id));

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth:500 }}>
        <div className="modal-header">
          <span className="modal-title">{classItem.name}{classItem.section ? ` (${classItem.section})` : ""} — Subjects</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          {success && <div className="alert alert-success">{success}</div>}
          {error   && <div className="alert alert-error">{error}</div>}
          {loading ? <div className="loading-state">Loading...</div> : (
            <>
              {classSubjects.length === 0 ? (
                <div className="empty-state">No subjects assigned yet.</div>
              ) : (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                  {classSubjects.map(s => (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6, background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:20, padding:"5px 12px" }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#1d4ed8" }}>{s.subject_name}</span>
                      <span style={{ fontSize:11, color:"#64748b" }}>({s.code})</span>
                      {canManage && (
                        <button style={{ border:"none", background:"none", color:"#dc2626", cursor:"pointer", fontSize:16, lineHeight:1 }}
                          onClick={async () => { await academicsApi.removeClassSubject(classItem.id, s.subject_id); await fetchData(); }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canManage && availableSubjects.length > 0 && (
                <div style={{ display:"flex", gap:8 }}>
                  <select className="form-control" value={selSubject} onChange={e => setSelSubject(e.target.value)} style={{ flex:1 }}>
                    <option value="">Select subject...</option>
                    {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                  <button className="btn btn-primary" onClick={handleAdd} disabled={!selSubject || saving}>
                    {saving ? "Adding..." : "Add"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AITimetableGenerator({ onApply, applying, aiError, setAIError }) {
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [missedAssignments, setMissedAssignments] = useState([]);
  const [context,   setContext]   = useState(null);
  const [feedback,  setFeedback]  = useState("");
  const [classes,   setClasses]   = useState([]);

  const [dayOverrides, setDayOverrides] = useState({});
  useEffect(() => {
    academicsApi.getTimetableAIContext().then(r => {
      setContext(r.data.data);
      setClasses((r.data.data.classes || []).map(c => c.id));
    }).catch(() => {});
    settingsApi.getTimingOverrides().then(r => {
      // Only recurring-weekday overrides apply to a weekly generated
      // timetable - a specific-date override is a one-off exception and
      // doesn't fit a recurring weekly schedule, so it's ignored here.
      const map = {};
      for (const o of (r.data.data || [])) {
        if (o.is_active && o.day_of_week) map[String(o.day_of_week)] = o;
      }
      setDayOverrides(map);
    }).catch(() => {});
  }, []);

  const DAYS = { "1":"Monday","2":"Tuesday","3":"Wednesday","4":"Thursday","5":"Friday" };

  const buildPrompt = (ctx, fb, existingSlots=[]) => {
    const s = ctx.settings || {};
    const startTime  = s.school_start_time || "08:00";
    const endTime    = s.school_end_time   || "14:00";
    const periodMins = parseInt(s.period_duration  || "45");
    const breakStart = s.break_start_time  || "10:30";
    const breakMins  = parseInt(s.break_duration   || "20");
    const workDays   = (s.working_days || "1,2,3,4,5").split(",");

    // Calculate available period slots
    const toMins = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
    const toTime = m => String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
    const breakStartM = toMins(breakStart);
    const breakEndM   = breakStartM + breakMins;
    const dayStartM   = toMins(startTime);
    const dayEndM     = toMins(endTime);

    const slots = [];
    let t = dayStartM + 15; // 15 min assembly/registration
    while (t + periodMins <= dayEndM) {
      if (t < breakStartM || t >= breakEndM) {
        if (t < breakStartM && t + periodMins > breakStartM) { t = breakEndM; continue; }
        slots.push({ start: toTime(t), end: toTime(t + periodMins) });
      }
      t += periodMins;
    }
    const numPeriods = slots.length;
    const slotsStr = slots.map((sl,i) => "Period"+(i+1)+":"+sl.start+"-"+sl.end).join(", ");

    const cls = (ctx.classes || [])[0];
    if (!cls) return "";

    const teachers = cls.teachers || [];
    const incharge = teachers.find(t2 => t2.is_primary);
    const subjects = (cls.subjects || []).filter(s2 => s2.available_teachers && s2.available_teachers.length > 0);

    // Build busy teacher slots
    const busyMap = {};
    for (const es of existingSlots) {
      const key = es.teacher_id + "-" + es.day_of_week;
      if (!busyMap[key]) busyMap[key] = [];
      busyMap[key].push(es.start_time.slice(0,5));
    }
    const busyStr = Object.keys(busyMap).length > 0
      ? "BUSY TEACHERS: " + Object.entries(busyMap).map(([k,v]) => "t"+k+"="+v.join(",")).join("; ")
      : "";

    const subjStr = subjects.map(s2 =>
      s2.id + ":" + s2.name + "[t=" + s2.available_teachers.map(t2 => t2.teacher_id||t2.id).join(",") + "]"
    ).join("; ");

    const isMont = cls.class_type === "montessori";
    const inchargeId = incharge ? (incharge.id) : "";

    return [
      "Generate a COMPLETE weekly timetable for class " + cls.name + (cls.section?" "+cls.section:"") + " (id:" + cls.id + ").",
      "Return ONLY valid JSON array, no text.",
      "School: " + startTime + "-" + endTime + ", periods: " + numPeriods + " per day (" + slotsStr + ")",
      "Working days: " + workDays.join(",") + " (1=Mon,2=Tue,3=Wed,4=Thu,5=Fri)",
      "Subjects: " + subjStr,
      isMont ? "Montessori: use teacher " + inchargeId + " for ALL subjects." : "",
      busyStr,
      "RULES:",
      "1. Schedule ALL " + numPeriods + " periods for EACH of the " + workDays.length + " working days.",
      "2. Each subject teacher must NOT appear in BUSY TEACHERS at same day+start_time.",
      "3. Each subject appears MAXIMUM ONCE per day. No repeats on same day ever.",
      "4. Use EXACT period times: " + slotsStr,
      "5. Every period slot every day must be filled.",
      fb ? "Extra: " + fb : "",
      "JSON: [{class_id:N,subject_id:N,teacher_id:N,day_of_week:'1',start_time:'HH:MM',end_time:'HH:MM'}]"
    ].filter(Boolean).join("\n");
  };

  const generate = async () => {
    if (!context) return;
    setLoading(true); setAIError(""); setResult(null); setMissedAssignments([]);
    try {
      const selectedClasses2 = (context.classes || []).filter(c =>
        classes.includes(c.id) &&
        (c.subjects||[]).length > 0 &&
        (c.teachers||[]).length > 0
      );
      if (selectedClasses2.length === 0) {
        setAIError("Selected classes have no subjects or teachers assigned.");
        setLoading(false); return;
      }

      // Calculate period slots
      const s2f = context?.settings || {};
      const toMf = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
      const toTf = m => String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
      // Computes this day's period slots - uses the day-specific timing
      // override if one is configured for this weekday (e.g. a Friday
      // short day with an earlier end time and no break), otherwise falls
      // back to the school's default timing settings.
      const getPeriodSlotsForDay = (day) => {
        const ov = dayOverrides[day];
        const pmf  = parseInt((ov ? ov.period_duration : s2f.period_duration) || "45");
        const hasBreak = ov ? !!ov.break_start_time : true;
        const bsMf = hasBreak ? toMf((ov ? ov.break_start_time : s2f.break_start_time) || "11:15") : null;
        const beMf = hasBreak ? bsMf + parseInt((ov ? ov.break_duration : s2f.break_duration) || "30") : null;
        const dsMf = toMf((ov ? ov.start_time : s2f.school_start_time) || "08:00") + 15;
        const deMf = toMf((ov ? ov.end_time : s2f.school_end_time) || "14:00");
        const slots = [];
        let hasLeftover = false;
        let ttf = dsMf;
        while (ttf < deMf) {
          if (hasBreak && ttf >= bsMf && ttf < beMf) { ttf = beMf; continue; }
          if (hasBreak && ttf < bsMf && ttf + pmf > bsMf) { slots.push([toTf(ttf), toTf(bsMf)]); ttf = beMf; continue; }
          if (ttf + pmf > deMf) {
            if (deMf - ttf >= 15) { slots.push([toTf(ttf), toTf(deMf)]); hasLeftover = true; }
            break;
          }
          slots.push([toTf(ttf), toTf(ttf+pmf)]);
          ttf += pmf;
        }
        return { slots, hasLeftover };
      };
      // If a subject has a fixed teacher from the Teacher Assignment
      // screen, use only that one teacher rather than every qualified
      // option - the admin already balanced load across classes when
      // making that assignment, so trying alternates here would undo that
      // balancing and is also why "still overloaded" showed up before this
      // was wired in.
      const teachersToTry = (subj) => subj.fixed_teacher_id
        ? [{ teacher_id: subj.fixed_teacher_id }]
        : (subj.available_teachers || []);
      const wDays = (s2f.working_days||"1,2,3,4,5").split(",");
      const allSlots = [];
      // Subjects that could not be placed today because every teacher who
      // could teach them was already booked elsewhere at every remaining
      // period - surfaced to the admin afterward as a capacity warning
      // rather than silently dropped.
      const missed = [];
      // Track teacher usage: teacher_id -> Set of "day-time"
      const teacherBusy = {};
      const isBusy = (tid, day, time) => (teacherBusy[tid]||new Set()).has(day+"-"+time);
      const markBusy = (tid, day, time) => {
        if (!teacherBusy[tid]) teacherBusy[tid] = new Set();
        teacherBusy[tid].add(day+"-"+time);
      };
      const unmarkBusy = (tid, day, time) => {
        if (teacherBusy[tid]) teacherBusy[tid].delete(day+"-"+time);
      };

      // Day is the outer loop (not class) so that classes sharing a
      // teacher are considered together, day by day, rather than one class
      // completing its entire week (and claiming every slot a shared
      // teacher has) before the next class gets any turn at all.
            const generateForDay = (day, di) => {
        // hasLeftover marks whether the final entry in allSlots is that
        // shortened "leftover" period. fullSlots excludes it - a class is
        // only ever offered the leftover period if it genuinely has more
        // subjects than full-length periods to place them in; otherwise
        // the day just ends after the last full period for that class,
        // rather than a subject getting pushed into an awkward 15-minute
        // slot while a full period sits empty elsewhere.
        const { slots: allPSlots, hasLeftover } = getPeriodSlotsForDay(day);
        const fullPSlots = hasLeftover ? allPSlots.slice(0, -1) : allPSlots;
        const toMins = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
        const orderOf = (slots) => Array.from({length: slots.length}, (_, i) => i).sort((a, b) => {
          const durA = toMins(slots[a][1]) - toMins(slots[a][0]);
          const durB = toMins(slots[b][1]) - toMins(slots[b][0]);
          return durB - durA || a - b;
        });

        // Build each class's rotated subject list for today first, without
        // assigning anything yet, so every class enters the round-robin
        // on equal footing.
        const classDayState = [];
        for (const cls of selectedClasses2) {
          const incharge = (cls.teachers||[]).find(t => t.is_primary);
          const inchargeId = incharge ? incharge.id : null;
          const subjects = (cls.subjects||[]).filter(s => teachersToTry(s).length > 0);
          if (!subjects.length) continue;
          // Only subjects configured for this specific weekday are eligible
          // today (via Subject Schedule Setup). A subject with no days
          // configured at all hasn't been set up yet - treat that as
          // available every day, so classes that haven't used the new
          // setup still generate a full timetable as before.
          const daySubjectPool = subjects.filter(s => {
            const cfg = s.configured_days || [];
            return cfg.length === 0 || cfg.map(String).includes(day);
          });
          if (!daySubjectPool.length) continue;
          const inchargeSubjs = inchargeId
            ? daySubjectPool.filter(s => teachersToTry(s).some(t => (t.teacher_id||t.id)===inchargeId))
            : [];
          const inchargeSubjIds = new Set(inchargeSubjs.map(s => s.id));
          const otherSubjs = daySubjectPool.filter(s => !inchargeSubjIds.has(s.id));
          const rotated = [];
          if (inchargeSubjs.length > 0) {
            rotated.push(inchargeSubjs[di % inchargeSubjs.length]);
          }
          const remaining = [...inchargeSubjs.filter(s=>!rotated.includes(s)), ...otherSubjs];
          const startIdx = di % Math.max(remaining.length, 1);
          for (let i = 0; i < remaining.length; i++) {
            rotated.push(remaining[(startIdx + i) % remaining.length]);
          }
          const seen = new Set();
          const daySubjects = [];
          for (const s of rotated) {
            if (!seen.has(s.id)) { seen.add(s.id); daySubjects.push(s); }
          }
          const pSlots = (hasLeftover && daySubjectPool.length > fullPSlots.length) ? allPSlots : fullPSlots;
          classDayState.push({ cls, daySubjects, usedPeriods: new Set(), periodAssignments: new Map(), pSlots, numPeriods: pSlots.length, periodOrder: orderOf(pSlots) });
        }

        // Places a subject into a specific already-tracked period for a
        // class, recording it in both allSlots (for the final result) and
        // this class's own periodAssignments map (so a later swap attempt
        // can find and move it if needed).
        const placeInPeriod = (state, subj, tid, pi) => {
          const [pStart, pEnd] = state.pSlots[pi];
          const slot = {
            class_id: state.cls.id,
            subject_id: subj.id,
            teacher_id: tid,
            day_of_week: day,
            start_time: pStart,
            end_time: pEnd
          };
          allSlots.push(slot);
          markBusy(tid, day, pStart);
          state.usedPeriods.add(pi);
          state.periodAssignments.set(pi, { subj, tid, slot });
        };

        // Recursively searches this class's own schedule for a period
        // where `tid` is free, allowing a chain of displacements: if every
        // period tid could use is occupied, try moving that occupant to
        // some other period their own teacher is free for - which may
        // itself require displacing whoever is there, and so on. This is
        // an augmenting-path style search (as used in bipartite matching)
        // rather than a single-level swap, so it can resolve conflicts a
        // one-step swap can't: e.g. period A needs teacher X, occupied by
        // a subject whose teacher Y is free at period B, which is occupied
        // by a subject whose teacher Z is free at period C (genuinely
        // empty) - three moves resolving one placement. Mutates state only
        // once a full chain to a genuinely free period is confirmed; a
        // failed branch leaves nothing changed, so trying the next teacher
        // option or next candidate period is always safe.
        const findFreeSlotForTeacher = (state, tid, visited) => {
          for (const pi of state.periodOrder) {
            if (visited.has(pi)) continue;
            const [pStart] = state.pSlots[pi];
            if (isBusy(tid, day, pStart)) continue;
            if (!state.usedPeriods.has(pi)) return pi;
            visited.add(pi);
            const occupant = state.periodAssignments.get(pi);
            if (!occupant) continue;
            for (const otchr of teachersToTry(occupant.subj)) {
              const otid = otchr.teacher_id || otchr.id;
              const newPi = findFreeSlotForTeacher(state, otid, visited);
              if (newPi === null) continue;
              const [oldStart] = state.pSlots[pi];
              const [newStart, newEnd] = state.pSlots[newPi];
              unmarkBusy(otid, day, oldStart);
              markBusy(otid, day, newStart);
              occupant.slot.start_time = newStart;
              occupant.slot.end_time = newEnd;
              state.usedPeriods.delete(pi);
              state.usedPeriods.add(newPi);
              state.periodAssignments.delete(pi);
              state.periodAssignments.set(newPi, occupant);
              return pi;
            }
          }
          return null;
        };

        const tryAssignSubject = (state, subj) => {
          const teachers = teachersToTry(subj);
          for (const tchr of teachers) {
            const tid = tchr.teacher_id || tchr.id;
            const pi = findFreeSlotForTeacher(state, tid, new Set());
            if (pi !== null) {
              placeInPeriod(state, subj, tid, pi);
              return true;
            }
          }
          return false;
        };

        // Build one task per (class, subject) still needing a slot today,
        // then schedule the most constrained tasks first - the ones whose
        // teacher is needed by the most classes today - while the most
        // periods are still free. Scheduling those greedily up front is
        // what actually avoids missed subjects: leaving a heavily-shared
        // teacher's assignments for later (as the old per-class round-robin
        // did) meant they often ran out of free periods by the time their
        // turn came, even though an earlier, less-contested subject could
        // easily have shifted to a different period instead.
        const tasks = [];
        for (const state of classDayState) {
          for (const subj of state.daySubjects) {
            tasks.push({ state, subj });
          }
        }
        const teacherDemand = {};
        for (const task of tasks) {
          for (const tchr of teachersToTry(task.subj)) {
            const tid = tchr.teacher_id || tchr.id;
            teacherDemand[tid] = (teacherDemand[tid] || 0) + 1;
          }
        }
        const taskDemand = (task) => {
          const teachers = teachersToTry(task.subj);
          if (!teachers.length) return 0;
          return Math.max(...teachers.map(t => teacherDemand[t.teacher_id || t.id] || 0));
        };
        tasks.sort((a, b) => taskDemand(b) - taskDemand(a));
        for (const task of tasks) {
          const ok = tryAssignSubject(task.state, task.subj);
          if (!ok) {
            missed.push({ class_name: task.state.cls.name + (task.state.cls.section?" ("+task.state.cls.section+")":""), subject_name: task.subj.name, day });
          }
        }
      };

      // The timetable should look the same every day Mon-Thu, with only
      // Friday potentially different (e.g. a short day). So the actual
      // constraint-solving only runs twice - once for a "template" day
      // (the first non-Friday working day) and once for Friday - and the
      // template day's result is simply copied onto the other non-Friday
      // days rather than independently re-solved for each one. This also
      // means any subject that could only be placed via a swap chain on
      // the template day doesn't need to get re-resolved by chance on
      // every other day too.
      const FRIDAY = "5";
      const templateDay = wDays.find(d => d !== FRIDAY) || wDays[0];
      const templateIdx = wDays.indexOf(templateDay);
      generateForDay(templateDay, templateIdx);
      const templateSlotsByClass = {};
      for (const slot of allSlots) {
        if (slot.day_of_week !== templateDay) continue;
        if (!templateSlotsByClass[slot.class_id]) templateSlotsByClass[slot.class_id] = [];
        templateSlotsByClass[slot.class_id].push(slot);
      }
      for (const day of wDays) {
        if (day === templateDay) continue;
        if (day === FRIDAY) {
          generateForDay(day, wDays.indexOf(day));
          continue;
        }
        for (const classId of Object.keys(templateSlotsByClass)) {
          for (const tSlot of templateSlotsByClass[classId]) {
            allSlots.push({
              class_id: tSlot.class_id,
              subject_id: tSlot.subject_id,
              teacher_id: tSlot.teacher_id,
              day_of_week: day,
              start_time: tSlot.start_time,
              end_time: tSlot.end_time,
            });
          }
        }
      }
      setResult(allSlots);
      setMissedAssignments(missed);
    } catch (err) {
      setAIError("Generation failed: " + err.message);
    } finally { setLoading(false); }
  };

  const ctx = context;
  const allClasses = ctx?.classes || [];
  const dayNames = { "1":"Mon","2":"Tue","3":"Wed","4":"Thu","5":"Fri" };

  // Group result by class for preview
  const grouped = result ? allClasses.filter(c => classes.includes(c.id)).map(c => ({
    ...c,
    slots: result.filter(s => String(s.class_id) === String(c.id))
  })) : [];

  return (
    <div className="section-card" style={{ marginBottom:16, border:"2px solid #7c3aed" }}>
      <div className="section-card-header" style={{ background:"#f5f3ff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>✨</span>
          <span className="section-card-title" style={{ color:"#5b21b6" }}>AI Timetable Generator</span>
        </div>
        <span style={{ fontSize:12, color:"#7c3aed" }}>Powered by Claude</span>
      </div>

      {aiError && <div className="alert alert-error">{aiError}</div>}
      {missedAssignments.length > 0 && (
        <div className="alert alert-error" style={{ fontSize: 12 }}>
          <strong>{missedAssignments.length} subject-period(s) could not be scheduled</strong> - every
          available teacher for these was already booked elsewhere at every remaining period that day.
          This usually means a teacher is shared across more classes than there are periods to cover them.
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {missedAssignments.slice(0, 10).map((m, i) => (
              <li key={i}>{m.class_name} - {m.subject_name} ({dayNames[m.day] || m.day})</li>
            ))}
            {missedAssignments.length > 10 && <li>...and {missedAssignments.length - 10} more.</li>}
          </ul>
        </div>
      )}

      <div style={{ padding:"12px 0" }}>
        <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:12 }}>
          Claude will analyze your school timing, classes, subjects and teachers to generate a conflict-free weekly timetable.
        </div>

        {/* Class selection */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Generate for classes:</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {allClasses.map(c => (
              <label key={c.id} style={{
                display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                padding:"5px 12px", borderRadius:20, border:"1px solid",
                borderColor: classes.includes(c.id) ? "#7c3aed" : "#e2e8f0",
                background: classes.includes(c.id) ? "#f5f3ff" : "var(--color-background-primary)",
                fontSize:12, fontWeight: classes.includes(c.id) ? 600 : 400,
                color: classes.includes(c.id) ? "#5b21b6" : "var(--color-text-primary)",
              }}>
                <input type="checkbox" checked={classes.includes(c.id)}
                  onChange={() => setClasses(prev => prev.includes(c.id) ? prev.filter(x=>x!==c.id) : [...prev, c.id])}
                  style={{ width:13, height:13 }} />
                {c.name}{c.section ? ` (${c.section})` : ""}
              </label>
            ))}
          </div>
        </div>

        {/* Feedback for regeneration */}
        {result && (
          <div style={{ marginBottom:12 }}>
            <input className="form-control" placeholder="Optional: give feedback to regenerate (e.g. 'spread Math more evenly')"
              value={feedback} onChange={e => setFeedback(e.target.value)} />
          </div>
        )}

        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-primary" onClick={generate} disabled={loading || classes.length === 0}
            style={{ background:"#7c3aed", borderColor:"#7c3aed" }}>
            {loading ? "Generating..." : result ? "Regenerate" : "Generate Timetable"}
          </button>
          {result && (
            <button className="btn btn-primary" onClick={() => onApply(result)} disabled={applying}
              style={{ background:"#16a34a", borderColor:"#16a34a" }}>
              {applying ? "Applying..." : `Apply (${result.length} slots)`}
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {result && (
        <div style={{ marginTop:16, borderTop:"1px solid #e2e8f0", paddingTop:12 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:10, color:"#5b21b6" }}>
            Preview — {result.length} timetable slots generated
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, tableLayout:"fixed" }}>
              <thead>
                <tr>
                  <th style={{ background:"#5b21b6", color:"#fff", padding:"6px 8px", width:90, textAlign:"left" }}>Class</th>
                  {["1","2","3","4","5"].map(d => (
                    <th key={d} style={{ background:"#5b21b6", color:"#fff", padding:"6px 4px", textAlign:"center" }}>{dayNames[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(cls => (
                  <tr key={cls.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                    <td style={{ padding:"6px 8px", background:"#f5f3ff", fontWeight:500, fontSize:11, color:"#5b21b6", verticalAlign:"top" }}>
                      {cls.name}{cls.section ? ` (${cls.section})` : ""}
                    </td>
                    {["1","2","3","4","5"].map(d => {
                      const daySlots = cls.slots.filter(s => String(s.day_of_week) === d).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
                      return (
                        <td key={d} style={{ padding:"3px 4px", verticalAlign:"top", border:"0.5px solid #f1f5f9" }}>
                          {daySlots.map((s, i) => {
                            const subj = (cls.subjects||[]).find(sub => sub.id === s.subject_id);
                            const tchr = (cls.teachers||[]).find(t => t.id === s.teacher_id);
                            return (
                              <div key={i} style={{ background:"#ede9fe", borderLeft:"2px solid #7c3aed", borderRadius:3, padding:"2px 4px", marginBottom:2 }}>
                                <div style={{ fontWeight:600, fontSize:10, color:"#5b21b6" }}>{subj?.name || "?"}</div>
                                <div style={{ fontSize:9, color:"#7c3aed" }}>{s.start_time?.slice(0,5)}-{s.end_time?.slice(0,5)}</div>
                                <div style={{ fontSize:9, color:"#64748b" }}>{tchr?.name || "?"}</div>
                              </div>
                            );
                          })}
                          {daySlots.length === 0 && <div style={{ color:"#e2e8f0", textAlign:"center" }}>—</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassOverviewTab() {
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    Promise.all([
      academicsApi.getClasses(),
    ]).then(([r]) => {
      const cls = r.data.data || [];
      // Fetch teachers and subjects for each class
      Promise.all(
        cls.map(c => Promise.all([
          academicsApi.getClassTeachers(c.id),
          academicsApi.getClassSubjects(c.id),
        ]).then(([t, s]) => ({
          ...c,
          teachers: t.data.data || [],
          subjects: s.data.data || [],
        })))
      ).then(full => {
        setClasses(full);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, []);

  const filtered = classes.filter(c =>
    (c.name + " " + (c.section||"")).toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700 }}>Class Overview</h2>
        <input
          className="search-input"
          placeholder="Search class..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth:240 }}
        />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16 }}>
        {filtered.map(cls => {
          const incharge = cls.teachers.find(t => t.is_primary);
          const subjectTeachers = cls.teachers.filter(t => !t.is_primary);
          const isMont = cls.class_type === "montessori";
          return (
            <div key={cls.id} style={{ background:"var(--color-background-primary)", border:"1px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden" }}>
              {/* Header */}
              <div style={{ background: isMont ? "#fef9c3" : "#eff6ff", padding:"12px 16px", borderBottom:"1px solid var(--color-border-tertiary)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color: isMont ? "#854d0e" : "#1d4ed8" }}>
                    {cls.name}{cls.section ? ` (${cls.section})` : ""}
                  </div>
                  <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginTop:2 }}>
                    {cls.year_name} · {cls.class_type} · {cls.student_count||0} students
                  </div>
                </div>
                <span className={`badge ${isMont ? "badge-warning" : "badge-primary"}`} style={{ fontSize:10 }}>
                  {isMont ? "Montessori" : "Regular"}
                </span>
              </div>

              <div style={{ padding:"12px 16px" }}>
                {/* Class Incharge */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>Class Incharge</div>
                  {incharge ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:"#f0fdf4", borderRadius:8, border:"1px solid #bbf7d0" }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"#16a34a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>
                        {incharge.teacher_name ? incharge.teacher_name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase() : "?"}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:12 }}>{incharge.teacher_name}</div>
                        <div style={{ fontSize:10, color:"#64748b" }}>{incharge.employee_no}</div>
                        {incharge.subject_names && <div style={{ fontSize:10, color:"#16a34a", fontWeight:500 }}>{incharge.subject_names}</div>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>No incharge assigned</div>
                  )}
                </div>

                {/* Subject Teachers (regular only) */}
                {!isMont && subjectTeachers.length > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>Subject Teachers</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      {subjectTeachers.map(t => (
                        <div key={t.teacher_id} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                          <div style={{ width:24, height:24, borderRadius:"50%", background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#2563eb", flexShrink:0 }}>
                            {t.teacher_name ? t.teacher_name[0] : "?"}
                          </div>
                          <span style={{ fontWeight:500 }}>{t.teacher_name}</span>
                          {t.subject_names && <span style={{ fontSize:10, color:"#64748b" }}>— {t.subject_names}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subjects */}
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>
                    Subjects ({cls.subjects.length})
                  </div>
                  {cls.subjects.length === 0 ? (
                    <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>No subjects assigned</div>
                  ) : (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {cls.subjects.map(s => (
                        <span key={s.id} style={{ fontSize:11, padding:"3px 8px", background:"#f1f5f9", borderRadius:20, color:"#475569", border:"1px solid #e2e8f0" }}>
                          {s.subject_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}