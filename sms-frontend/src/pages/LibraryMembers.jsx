import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./LibraryMembers.css";

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
    <div className="lib-mem-modal-overlay" onClick={onClose}>
      <div className="lib-mem-modal" onClick={e => e.stopPropagation()}>
        <div className="lib-mem-modal-header">
          <span className="lib-mem-modal-title">Enroll New Member</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="lib-mem-search-row">
          <select className="form-control lib-mem-type-select" value={memberType} onChange={e => { setMemberType(e.target.value); setQuery(""); }}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Staff</option>
          </select>
          <input className="form-control" placeholder="Search by name or enrollment no." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} />
          <button className="btn btn-primary" onClick={runSearch}>Search</button>
        </div>

        {error && <div className="alert alert-error lib-mem-mb12">{error}</div>}

        <div className="lib-mem-results">
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
                    <td className="lib-mem-date">{u.identifier}</td>
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
  const { formatDate } = useRegionalSettings();
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
      <div className="page-header lib-mem-mb16">
        <h1 className="page-heading">Library Members</h1>
        <button className="btn btn-primary" onClick={() => setShowEnroll(true)}>+ Enroll Member</button>
      </div>

      {success && <div className="alert alert-success lib-mem-mb16">{success}</div>}
      {error && <div className="alert alert-error lib-mem-mb16">{error}</div>}

      <div className="section-card lib-mem-filters-card">
        <div className="lib-mem-filter-row">
          <div className="form-group lib-mem-filter-search-group">
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Name or library card no." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group lib-mem-filter-type-group">
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
                    <div className="lib-mem-muted lib-mem-card-info">{m.email}</div>
                  </td>
                  <td>{m.library_card_no}</td>
                  <td><span className="badge badge-primary lib-mem-capitalize">{(m.display_role || m.member_type).replace(/_/g, " ")}</span></td>
                  <td><span className={"badge lib-mem-capitalize " + (m.status === "active" ? "badge-success" : "badge-gray")}>{m.status}</span></td>
                  <td>{m.books_currently_issued}</td>
                  <td>{m.max_books}</td>
                  <td>
                    {Number(m.pending_fine) > 0 ? (
                      <span className="lib-mem-fine-due">Rs. {Number(m.pending_fine).toLocaleString()}</span>
                    ) : (
                      <span className="lib-mem-fine-clear">Rs. 0</span>
                    )}
                  </td>
                  <td className="lib-mem-date">{formatDate(m.joined_date)}</td>
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
