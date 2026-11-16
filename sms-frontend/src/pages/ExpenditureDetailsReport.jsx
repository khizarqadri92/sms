import { useState, useEffect } from "react";
import reportsApi from "../api/reportsApi";
import payrollApi from "../api/payrollApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";
import "./ExpenditureDetailsReport.css";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function ExpenditureDetailsReport() {
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ department_id: "", expenditure_type: "", month: "", year: "" });

  useEffect(() => {
    Promise.all([payrollApi.getDepartmentsList(), reportsApi.getExpenditureTypes()]).then(([d, t]) => {
      setDepartments(d.data.data || []);
      setTypes(t.data.data || []);
    }).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    reportsApi.getExpenditureDetails(params).then(r => setRows(r.data.data || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  const columns = [
    { label: "Invoice No", value: r => r.vendor_invoice_no },
    { label: "Vendor", value: r => r.vendor_name || "-" },
    { label: "Department", value: r => r.department_name || "-" },
    { label: "Type", value: r => r.expenditure_type || "-" },
    { label: "Date", value: r => r.invoice_date },
    { label: "Amount", value: r => Number(r.total_amount) },
    { label: "Paid", value: r => Number(r.paid_amount) },
    { label: "Status", value: r => r.status },
  ];
  const statusColors = {
    paid: { bg: "#f0fdf4", color: "#166534" },
    approved: { bg: "#eff6ff", color: "#1d4ed8" },
    verified: { bg: "#eff6ff", color: "#1d4ed8" },
    pending: { bg: "#fefce8", color: "#854d0e" },
    disputed: { bg: "#fff1f2", color: "#881337" },
    cancelled: { bg: "#f8fafc", color: "#64748b" },
  };

  return (
    <div className="edr-page">
      <div className="edr-header">
        <div className="edr-title">Expenditure Details</div>
        <div className="edr-subtitle">Vendor invoice expenditures across departments</div>
      </div>

      <div className="no-print edr-actions-row">
        <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(columns, rows, "Expenditure_Details")}>Export CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Expenditure Details", columns, rows, "Expenditure_Details")}>Export PDF</button>
      </div>

      <div className="no-print edr-filter-card">
        <div>
          <label className="edr-field-label">Department</label>
          <select className="form-input edr-dept-select" value={filters.department_id} onChange={e=>setFilters(f=>({...f,department_id:e.target.value}))}>
            <option value="">All Departments</option>
            {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="edr-field-label">Expenditure Type</label>
          <select className="form-input edr-type-select" value={filters.expenditure_type} onChange={e=>setFilters(f=>({...f,expenditure_type:e.target.value}))}>
            <option value="">All Types</option>
            {types.map((t,i)=><option key={i} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="edr-field-label">Month</label>
          <select className="form-input edr-month-select" value={filters.month} onChange={e=>setFilters(f=>({...f,month:e.target.value}))}>
            <option value="">All Months</option>
            {MONTH_NAMES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="edr-field-label">Year</label>
          <input type="number" className="form-input edr-year-input" value={filters.year} onChange={e=>setFilters(f=>({...f,year:e.target.value}))} placeholder="Year" />
        </div>
        <button className="btn btn-primary btn-sm edr-apply-btn" onClick={load}>Apply Filters</button>
      </div>

      <div className="edr-table-card">
        <div className="edr-table-header-row">
          <div className="edr-record-count">{rows.length} record(s)</div>
          <div className="edr-total-text">Total Amount: {totalAmount.toLocaleString()}</div>
        </div>
        {loading && <div className="edr-loading-text">Loading...</div>}
        {!loading && rows.length===0 && <div className="edr-loading-text">No records found.</div>}
        {!loading && rows.length>0 && (
          <div className="edr-table-scroll">
            <table className="edr-table">
              <thead>
                <tr className="edr-th-row">
                  {["Invoice No","Vendor","Department","Type","Date","Amount","Paid","Status"].map(h=>(
                    <th key={h} className="edr-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r)=>{
                  const sc = statusColors[r.status] || statusColors.pending;
                  return (
                  <tr key={r.invoice_id} className="edr-tr">
                    <td className="edr-td-name">{r.vendor_invoice_no}</td>
                    <td className="edr-td">{r.vendor_name || "-"}</td>
                    <td className="edr-td">{r.department_name || "-"}</td>
                    <td className="edr-td">{r.expenditure_type || "-"}</td>
                    <td className="edr-td-muted">{r.invoice_date}</td>
                    <td className="edr-td-bold">{Number(r.total_amount).toLocaleString()}</td>
                    <td className="edr-td">{Number(r.paid_amount).toLocaleString()}</td>
                    <td className="edr-td">
                      <span className="edr-status-badge" style={{"--badge-bg": sc.bg, "--badge-color": sc.color}}>{r.status}</span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
