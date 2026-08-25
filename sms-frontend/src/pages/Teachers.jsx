import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import teachersApi from "../api/teachersApi";
import DatePicker from "../components/DatePicker";

export default function Teachers() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [teachers,      setTeachers]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [page,          setPage]          = useState(1);
  const [total,         setTotal]         = useState(0);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [showCreate,    setShowCreate]    = useState(false);
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState("");
  const [form,          setForm]          = useState({
    first_name:"", last_name:"", email:"", phone:"",
    gender:"", qualification:"", specialization:"",
    date_of_birth:"", join_date:"", password:"Teacher@123"
  });

  useEffect(() => { fetchTeachers(); }, [page, search, statusFilter]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.sub === "add") setShowCreate(true);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const params = { page, per_page:20 };
      if (search)       params.search    = search;
      if (statusFilter) params.status    = statusFilter;
      const res = await teachersApi.getAll(params);
      setTeachers(res.data.data            || []);
      setTotal(res.data.pagination?.total  || 0);
    } catch { setError("Failed to load teachers."); }
    finally  { setLoading(false); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("Deactivate this teacher? They will no longer be able to log in.")) return;
    try {
      await teachersApi.remove(id);
      fetchTeachers();
    } catch { setError("Failed to deactivate."); }
  };

  const handleReactivate = async (id) => {
    if (!window.confirm("Reactivate this teacher? They will be able to log in again.")) return;
    try {
      await teachersApi.reactivate(id);
      fetchTeachers();
    } catch { setError("Failed to reactivate."); }
  };

  const handleCreate = async (e) => {
    e.preventDefault(); setCreating(true); setCreateError("");
    try {
      await teachersApi.create(form);
      setShowCreate(false);
      setForm({ first_name:"", last_name:"", email:"", phone:"", gender:"",
                qualification:"", specialization:"", date_of_birth:"", join_date:"", password:"Teacher@123" });
      fetchTeachers();
    } catch (err) { setCreateError(err.response?.data?.message || "Failed to create teacher."); }
    finally { setCreating(false); }
  };

  const PER_PAGE = 20;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-heading">Teachers</h1>
          {total > 0 && <span className="badge badge-primary">{total} total</span>}
        </div>
        {can("teachers.create") && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Teacher</button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <input
          className="search-input"
          placeholder="Search by name or employee no..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex:1, minWidth:200 }}
        />
        <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {showCreate && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">Add New Teacher</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
          {createError && <div className="alert alert-error">{createError}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input className="form-control" value={form.first_name} onChange={e => setForm({...form, first_name:e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input className="form-control" value={form.last_name} onChange={e => setForm({...form, last_name:e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-control" type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-control" value={form.gender} onChange={e => setForm({...form, gender:e.target.value})}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Qualification</label>
                <input className="form-control" value={form.qualification} onChange={e => setForm({...form, qualification:e.target.value})} placeholder="e.g. M.Ed, B.Ed" />
              </div>
              <div className="form-group">
                <label className="form-label">Specialization</label>
                <input className="form-control" value={form.specialization} onChange={e => setForm({...form, specialization:e.target.value})} placeholder="e.g. Mathematics" />
              </div>
              <div className="form-group">
                <label className="form-label">Join Date</label>
                <DatePicker value={form.join_date} onChange={val => setForm({...form, join_date:val})} />
              </div>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input className="form-control" value={form.password} onChange={e => setForm({...form, password:e.target.value})} required />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? "Creating..." : "Create Teacher"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading teachers...</div>
      ) : teachers.length === 0 ? (
        <div className="empty-state">No teachers found.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Employee No</th>
                <th>Name</th>
                <th>Specialization</th>
                <th>Qualification</th>
                <th>Subjects</th>
                <th>Classes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id}>
                  <td><span className="badge badge-gray">{t.employee_no || "N/A"}</span></td>
                  <td>
                    <strong>{t.first_name} {t.last_name}</strong>
                    <div style={{ fontSize:12, color:"#64748b" }}>{t.email}</div>
                  </td>
                  <td style={{ fontSize:12, color:"#64748b" }}>{t.specialization || <span style={{ color:"#94a3b8" }}>—</span>}</td>
                  <td style={{ fontSize:12 }}>{t.qualification || <span style={{ color:"#94a3b8" }}>—</span>}</td>
                  <td><span className="badge badge-gray">{t.subject_count || 0} subjects</span></td>
                  <td><span className="badge badge-gray">{t.class_count  || 0} classes</span></td>
                  <td>
                    <span className={`badge ${t.status === "active" ? "badge-success" : "badge-danger"}`}>{t.status}</span>
                  </td>
                  <td style={{ display:"flex", gap:5 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/teachers/${t.id}`)}>View →</button>
                    {can("teachers.delete") && (
                      t.status === "active" ? (
                        <button className="btn btn-danger btn-xs" onClick={() => handleDeactivate(t.id)}>Deactivate</button>
                      ) : (
                        <button className="btn btn-secondary btn-xs" onClick={() => handleReactivate(t.id)}>Activate</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(page-1)}>← Prev</button>
          <span style={{ fontSize:13, color:"#64748b" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(page+1)}>Next →</button>
        </div>
      )}
    </div>
  );
}