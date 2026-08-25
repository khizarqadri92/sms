import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import studentsApi from "../api/studentsApi";
import CreateStudentModal from "../components/students/CreateStudentModal";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

export default function Students() {
  const { formatDate } = useRegionalSettings();
  const { can } = useAuth();
  const navigate                    = useNavigate();
  const [students, setStudents]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("active");
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchStudents(); }, [page, search, statusFilter]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.sub === "enroll") setShowCreate(true);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 20 };
      if (search)       params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await studentsApi.getAll(params);
      setStudents(res.data.data           || []);
      setTotal(res.data.pagination?.total || 0);
    } catch { setError("Failed to load students."); }
    finally  { setLoading(false); }
  };

  const handleCreated = () => {
    setShowCreate(false);
    setSuccess("Student enrolled successfully.");
    fetchStudents();
    setTimeout(() => setSuccess(""), 3000);
  };

  return (
    <div>
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-heading">Students</h1>
          <span className="badge badge-primary">{total} total</span>
        </div>
        {can("students.create") && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Enroll Student
          </button>
        )}
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by name or enrollment no..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading-state">Loading students...</div>
      ) : students.length === 0 ? (
        <div className="empty-state">No students found.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Enrollment No</th>
                <th>Name</th>
                <th>Class</th>
                <th>Gender</th>
                <th>Status</th>
                <th>Admission Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td><code style={{ background:"#f1f5f9", padding:"2px 7px", borderRadius:5, fontSize:12, color:"#475569" }}>{s.enrollment_no}</code></td>
                  <td>
                    <div style={{ fontWeight:600, color:"#0f172a" }}>{s.first_name} {s.last_name}</div>
                    <div style={{ fontSize:12, color:"#94a3b8" }}>{s.email}</div>
                  </td>
                  <td>{s.class_name ? (s.class_name + (s.class_section ? " (" + s.class_section + ")" : "")) : <span style={{ color:"#94a3b8" }}>-</span>}</td>
                  <td style={{ textTransform:"capitalize" }}>{s.gender || <span style={{ color:"#94a3b8" }}>â€”</span>}</td>
                  <td><span className={`badge ${s.status === "active" ? "badge-success" : "badge-danger"}`}>{s.status}</span></td>
                  <td style={{ fontSize:12, color:"#64748b" }}>
                    {s.admission_date ? formatDate(s.admission_date) : "â€”"}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/students/${s.id}`)}>
                      View Profile â†’
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>â† Prev</button>
        <span className="pg-info">Page {page}</span>
        <button className="pg-btn" onClick={() => setPage(p => p+1)} disabled={students.length < 20}>Next â†’</button>
      </div>

      {showCreate && <CreateStudentModal onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
    </div>
  );
}