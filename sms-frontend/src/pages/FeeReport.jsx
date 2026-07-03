import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import financeApi from "../api/financeApi";
import academicsApi from "../api/academicsApi";

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-";
const fmtMoney = n => "Rs. " + Number(n || 0).toLocaleString();

const STATUS_BADGE = {
  paid: "badge-success",
  unpaid: "badge-danger",
  partial: "badge-warning",
  overdue: "badge-purple",
  pending_verification: "badge-warning",
};

function ReportTable({ rows, showStudent }) {
  if (rows.length === 0) return <div className="empty-state">No invoices found.</div>;
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {showStudent && <th>Student</th>}
            {showStudent && <th>Class</th>}
            <th>Invoice No.</th>
            <th>Month</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Discount</th>
            <th>Fine</th>
            <th>Net Amount</th>
            <th>Paid</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.invoice_id}>
              {showStudent && (
                <td>
                  <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.enrollment_no}</div>
                </td>
              )}
              {showStudent && (
                <td style={{ fontSize: 12, color: "#64748b" }}>
                  {r.class_name ? r.class_name + (r.class_section ? " (" + r.class_section + ")" : "") : "-"}
                </td>
              )}
              <td>{r.invoice_no}</td>
              <td style={{ fontSize: 12, color: "#64748b" }}>{r.month_year || "-"}</td>
              <td>{fmtDate(r.due_date)}</td>
              <td><span className={"badge " + (STATUS_BADGE[r.status] || "badge-gray")} style={{ textTransform: "capitalize" }}>{r.status}</span></td>
              <td>{fmtMoney(r.amount)}</td>
              <td>{fmtMoney(r.discount)}</td>
              <td>{fmtMoney(r.fine)}</td>
              <td><strong>{fmtMoney(r.net_amount)}</strong></td>
              <td style={{ color: "#16a34a" }}>{fmtMoney(r.paid_amount)}</td>
              <td style={{ color: Number(r.balance) > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchoolWideReport() {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ registration_no: "", class_id: "", academic_year_id: "", month: "", status: "" });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fetchRows = (activeFilters) => {
    setLoading(true);
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    financeApi.getFeeReportSchool(params)
      .then(r => setRows(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows();
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    academicsApi.getYears().then(r => setYears(r.data.data || [])).catch(() => {});
  }, []);

  const applyFilters = () => fetchRows();
  const clearFilters = () => {
    const empty = { registration_no: "", class_id: "", academic_year_id: "", month: "", status: "" };
    setFilters(empty);
    setAdvancedOpen(false);
    fetchRows(empty);
  };

  return (
    <div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label">Student / Registration No.</label>
            <input className="form-control" placeholder="Name or enrollment no." value={filters.registration_no} onChange={e => setFilters({ ...filters, registration_no: e.target.value })} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
              <option value="pending_verification">Pending Verification</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
          <button className="btn btn-ghost" onClick={() => setAdvancedOpen(!advancedOpen)} style={{ color: "#2563eb", fontSize: 13 }}>
            {advancedOpen ? "Hide Advanced Search \u25b4" : "Advanced Search \u25be"}
          </button>
        </div>

        {advancedOpen && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Session (Academic Year)</label>
                <select className="form-control" value={filters.academic_year_id} onChange={e => setFilters({ ...filters, academic_year_id: e.target.value })}>
                  <option value="">All Sessions</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class</label>
                <select className="form-control" value={filters.class_id} onChange={e => setFilters({ ...filters, class_id: e.target.value })}>
                  <option value="">All Classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " (" + c.section + ")" : ""}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Month</label>
                <input className="form-control" type="month" value={filters.month} onChange={e => setFilters({ ...filters, month: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
              <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        )}
      </div>

      {loading ? <div className="loading-state">Loading...</div> : <ReportTable rows={rows} showStudent />}
    </div>
  );
}

function ClassInchargeReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ registration_no: "", month: "", status: "" });

  const fetchRows = (activeFilters) => {
    setLoading(true); setError("");
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    financeApi.getFeeReportMyClass(params)
      .then(r => setRows(r.data.data || []))
      .catch(err => setError(err.response?.data?.message || "Failed to load report."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRows(); }, []);

  const applyFilters = () => fetchRows();
  const clearFilters = () => {
    const empty = { registration_no: "", month: "", status: "" };
    setFilters(empty);
    fetchRows(empty);
  };

  return (
    <div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label">Student / Registration No.</label>
            <input className="form-control" placeholder="Name or enrollment no." value={filters.registration_no} onChange={e => setFilters({ ...filters, registration_no: e.target.value })} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label className="form-label">Month</label>
            <input className="form-control" type="month" value={filters.month} onChange={e => setFilters({ ...filters, month: e.target.value })} />
          </div>
          <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="loading-state">Loading...</div> : !error && <ReportTable rows={rows} showStudent />}
    </div>
  );
}

function ParentReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    financeApi.getFeeReportMyChild()
      .then(r => setRows(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Loading...</div>;
  return <ReportTable rows={rows} showStudent />;
}

function StudentReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    financeApi.getFeeReportMe()
      .then(r => setRows(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Loading...</div>;
  return <ReportTable rows={rows} showStudent={false} />;
}

export default function FeeReport() {
  const { user } = useAuth();
  const roles = user?.roles || [];

  let content;
  if (roles.includes("teacher")) {
    content = <ClassInchargeReport />;
  } else if (roles.includes("parent")) {
    content = <ParentReport />;
  } else if (roles.includes("student")) {
    content = <StudentReport />;
  } else {
    content = <SchoolWideReport />;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Fee Report</h1>
      </div>
      {content}
    </div>
  );
}
