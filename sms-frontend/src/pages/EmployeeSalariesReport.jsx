import { useState, useEffect } from "react";
import reportsApi from "../api/reportsApi";
import payrollApi from "../api/payrollApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";
import "./EmployeeSalariesReport.css";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function EmployeeSalariesReport() {
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ department_id: "", staff_id: "", month: "", year: "" });

  useEffect(() => {
    Promise.all([payrollApi.getDepartmentsList(), payrollApi.getStaffList()]).then(([d, s]) => {
      setDepartments(d.data.data || []);
      setStaff(s.data.data || []);
    }).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    reportsApi.getEmployeeSalaries(params).then(r => setRows(r.data.data || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalNet = rows.reduce((s, r) => s + Number(r.net_pay || 0), 0);

  const columns = [
    { label: "Employee", value: r => `${r.first_name} ${r.last_name}` },
    { label: "Code", value: r => r.employee_code || "-" },
    { label: "Department", value: r => r.department_name || "-" },
    { label: "Period", value: r => `${MONTH_NAMES[r.month-1]} ${r.year}` },
    { label: "Salary Type", value: r => (r.salary_type||"").replace("_"," ") },
    { label: "Gross", value: r => Number(r.gross_earnings) },
    { label: "Deductions", value: r => Number(r.total_deductions) },
    { label: "Net Pay", value: r => Number(r.net_pay) },
  ];

  return (
    <div className="esr-page">
      <div className="esr-header">
        <div className="esr-title">Employee Salaries</div>
        <div className="esr-subtitle">Salary report across payroll periods</div>
      </div>

      <div className="no-print esr-actions-row">
        <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(columns, rows, "Employee_Salaries")}>Export CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Employee Salaries", columns, rows, "Employee_Salaries")}>Export PDF</button>
      </div>

      <div className="no-print esr-filter-card">
        <div>
          <label className="esr-field-label">Department</label>
          <select className="form-input esr-dept-select" value={filters.department_id} onChange={e=>setFilters(f=>({...f,department_id:e.target.value}))}>
            <option value="">All Departments</option>
            {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="esr-field-label">Employee</label>
          <select className="form-input esr-emp-select" value={filters.staff_id} onChange={e=>setFilters(f=>({...f,staff_id:e.target.value}))}>
            <option value="">All Employees</option>
            {staff.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        </div>
        <div>
          <label className="esr-field-label">Month</label>
          <select className="form-input esr-month-select" value={filters.month} onChange={e=>setFilters(f=>({...f,month:e.target.value}))}>
            <option value="">All Months</option>
            {MONTH_NAMES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="esr-field-label">Year</label>
          <input type="number" className="form-input esr-year-input" value={filters.year} onChange={e=>setFilters(f=>({...f,year:e.target.value}))} placeholder="Year" />
        </div>
        <button className="btn btn-primary btn-sm esr-apply-btn" onClick={load}>Apply Filters</button>
      </div>

      <div className="esr-table-card">
        <div className="esr-table-header-row">
          <div className="esr-record-count">{rows.length} record(s)</div>
          <div className="esr-total-text">Total Net Pay: {totalNet.toLocaleString()}</div>
        </div>
        {loading && <div className="esr-loading-text">Loading...</div>}
        {!loading && rows.length===0 && <div className="esr-loading-text">No records found.</div>}
        {!loading && rows.length>0 && (
          <div className="esr-table-scroll">
            <table className="esr-table">
              <thead>
                <tr className="esr-th-row">
                  {["Employee","Code","Department","Period","Salary Type","Gross","Deductions","Net Pay"].map(h=>(
                    <th key={h} className="esr-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} className="esr-tr" style={{"--row-bg": i%2===0?"var(--bg-card)":"var(--bg-hover)"}}>
                    <td className="esr-td-name">{r.first_name} {r.last_name}</td>
                    <td className="esr-td-code">{r.employee_code || "-"}</td>
                    <td className="esr-td">{r.department_name || "-"}</td>
                    <td className="esr-td">{MONTH_NAMES[r.month-1]} {r.year}</td>
                    <td className="esr-td-capitalize">{(r.salary_type||"").replace("_"," ")}</td>
                    <td className="esr-td">{Number(r.gross_earnings).toLocaleString()}</td>
                    <td className="esr-td-red">{Number(r.total_deductions).toLocaleString()}</td>
                    <td className="esr-td-bold">{Number(r.net_pay).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
