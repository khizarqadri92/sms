import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";

function EnrollModal({ onClose, onSaved }) {
  const [memberType, setMemberType] = useState("student");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [enrollingId, setEnrollingId] = useState(null);
  const [error, setError] = useState("");

  const runSearch = () => {
    setSearching(true); setError("");
    libraryApi.searchEnrollableUsers({ type: memberType, q: query })
      .then(r => setResults(r.data.data || []))
      .catch(() => setError("Search failed."))
      .finally(() => setSearching(false));
  };

  useEffect(() => { runSearch(); }, [memberType]);

  const handleEnroll = async (user) => {
    setEnrollingId(user.user_id);
    setError("");
    try {
      await libraryApi.enrollMember({ user_id: user.user_id, member_type: memberType });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to enroll member.");
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Enroll New Member</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <select className="form-control" style={{ maxWidth: 150 }} value={memberType} onChange={e => { setMemberType(e.target.value); setQuery(""); }}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Staff</option>
          </select>
          <input className="form-control" placeholder="Search by name or enrollment no." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} />
          <button className="btn btn-primary" onClick={runSearch}>Search</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ overflow: "auto", flex: 1 }}>
          {searching ? (
            <div className="loading-state">Searching...</div>
          ) : results.length === 0 ? (
            <div className="empty-state">No matching {memberType}s found.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>{memberType === "student" ? "Enrollment No." : "Email"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(u => (
                  <tr key={u.user_id}>
                    <td>{u.display_name}</td>
                    <td style={{ fontSize: 12, color: "#64748b" }}>{u.identifier}</td>
                    <td>
                      {u.already_member ? (
                        <span className="badge badge-gray">Already a member</span>
                      ) : (
                        <button className="btn btn-primary btn-xs" disabled={enrollingId === u.user_id} onClick={() => handleEnroll(u)}>
                          {enrollingId === u.user_id ? "Enrolling..." : "Enroll"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LibraryMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filters, setFilters] = useState({ search: "", member_type: "" });
  const [showEnroll, setShowEnroll] = useState(false);

  const fetchMembers = (activeFilters) => {
    setLoading(true); setError("");
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    libraryApi.getMembers(params)
      .then(r => setMembers(r.data.data || []))
      .catch(() => setError("Failed to load members."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMembers(); }, []);

  const applyFilters = () => fetchMembers();
  const clearFilters = () => {
    const empty = { search: "", member_type: "" };
    setFilters(empty);
    fetchMembers(empty);
  };

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Library Members</h1>
        <button className="btn btn-primary" onClick={() => setShowEnroll(true)}>+ Enroll Member</button>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Name or library card no." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label className="form-label">Member Type</label>
            <select className="form-control" value={filters.member_type} onChange={e => setFilters({ ...filters, member_type: e.target.value })}>
              <option value="">All Types</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading members...</div>
      ) : members.length === 0 ? (
        <div className="empty-state">No members found. Enroll one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Card No.</th>
                <th>Type</th>
                <th>Status</th>
                <th>Books Issued</th>
                <th>Max Books</th>
                <th>Pending Fine</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.member_id}>
                  <td>
                    <strong>{m.first_name} {m.last_name}</strong>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.email}</div>
                  </td>
                  <td>{m.library_card_no}</td>
                  <td><span className="badge badge-primary" style={{ textTransform: "capitalize" }}>{(m.display_role || m.member_type).replace(/_/g, " ")}</span></td>
                  <td><span className={"badge " + (m.status === "active" ? "badge-success" : "badge-gray")} style={{ textTransform: "capitalize" }}>{m.status}</span></td>
                  <td>{m.books_currently_issued}</td>
                  <td>{m.max_books}</td>
                  <td>
                    {Number(m.pending_fine) > 0 ? (
                      <span style={{ color: "#dc2626", fontWeight: 600 }}>Rs. {Number(m.pending_fine).toLocaleString()}</span>
                    ) : (
                      <span style={{ color: "#16a34a" }}>Rs. 0</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{new Date(m.joined_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showEnroll && (
        <EnrollModal
          onClose={() => setShowEnroll(false)}
          onSaved={() => { setShowEnroll(false); showToast("Member enrolled."); fetchMembers(); }}
        />
      )}
    </div>
  );
}
