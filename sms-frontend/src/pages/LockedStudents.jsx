import React, { useState, useEffect } from "react";
import financeApi from "../api/financeApi";
import academicsApi from "../api/academicsApi";
import { useAuth } from "../auth/AuthContext";

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-";

export default function LockedStudents() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unlockingId, setUnlockingId] = useState(null);
  const [filters, setFilters] = useState({ student:"", class_id:"", from_date:"", to_date:"" });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fetchRows = (activeFilters) => {
    setLoading(true); setError("");
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    financeApi.getLockedAccounts(params)
      .then(res => setRows(res.data.data || []))
      .catch(() => setError("Failed to load locked accounts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows();
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  const applyFilters = () => fetchRows();
  const clearFilters = () => {
    const empty = { student:"", class_id:"", from_date:"", to_date:"" };
    setFilters(empty);
    setAdvancedOpen(false);
    fetchRows(empty);
  };

  const handleUnlock = async (studentId) => {
    if (!window.confirm("Unlock this student's account?")) return;
    setUnlockingId(studentId);
    try {
      await financeApi.unlockAccount(studentId);
      fetchRows();
    } catch {
      alert("Failed to unlock account.");
    } finally {
      setUnlockingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Locked Students (Unpaid Fees)</h1>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:200, marginBottom:0 }}>
            <label className="form-label">Student</label>
            <input className="form-control" placeholder="Name or enrollment no." value={filters.student} onChange={e => setFilters({...filters, student:e.target.value})} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
          <button className="btn btn-ghost" onClick={() => setAdvancedOpen(!advancedOpen)} style={{ color:"#2563eb", fontSize:13 }}>
            {advancedOpen ? "Hide Advanced Search \u25b4" : "Advanced Search \u25be"}
          </button>
        </div>

        {advancedOpen && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #e2e8f0" }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Class</label>
                <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id:e.target.value})}>
                  <option value="">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? " (" + c.section + ")" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date From</label>
                <input className="form-control" type="date" value={filters.from_date} onChange={e => setFilters({...filters, from_date:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date To</label>
                <input className="form-control" type="date" value={filters.to_date} onChange={e => setFilters({...filters, to_date:e.target.value})} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
              <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">Loading locked accounts...</div>
      ) : (
        <div>
          {error && <div className="alert alert-error">{error}</div>}
          {rows.length === 0 ? (
            <div className="empty-state">No accounts found for the selected filters.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Enrollment No.</th>
                    <th>Class</th>
                    <th>Invoice No.</th>
                    <th>Due Date</th>
                    <th>Days Overdue</th>
                    <th>Fine</th>
                    <th>Net Amount</th>
                    {can("finance.manage") && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.user_id}>
                      <td style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</td>
                      <td>{r.enrollment_no}</td>
                      <td>{r.class_name ? r.class_name + (r.class_section ? " (" + r.class_section + ")" : "") : "-"}</td>
                      <td>{r.invoice_no || "-"}</td>
                      <td>{fmtDate(r.due_date)}</td>
                      <td><span className="badge badge-danger">{r.days_overdue != null ? r.days_overdue + " days" : "-"}</span></td>
                      <td>{r.fine != null ? "Rs. " + Number(r.fine).toLocaleString() : "-"}</td>
                      <td><strong>{r.net_amount != null ? "Rs. " + Number(r.net_amount).toLocaleString() : "-"}</strong></td>
                      {can("finance.manage") && (
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleUnlock(r.student_id)} disabled={unlockingId === r.student_id}>
                            {unlockingId === r.student_id ? "Unlocking..." : "Unlock"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
