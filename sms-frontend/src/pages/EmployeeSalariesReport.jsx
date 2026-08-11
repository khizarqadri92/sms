import { useState, useEffect } from "react";
import reportsApi from "../api/reportsApi";
import payrollApi from "../api/payrollApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";

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
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Employee Salaries</div>
        <div style={{fontSize:13,color:"#64748b"}}>Salary report across payroll periods</div>
      </div>

      <div className="no-print" style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:12}}>
        <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(columns, rows, "Employee_Salaries")}>Export CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Employee Salaries", columns, rows, "Employee_Salaries")}>Export PDF</button>
      </div>

      <div className="no-print" style={{background:"#fff",borderRadius:12,padding:16,border:"1px solid #e2e8f0",marginBottom:16,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div>
          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>Department</label>
          <select className="form-input" style={{fontSize:13,width:180}} value={filters.department_id} onChange={e=>setFilters(f=>({...f,department_id:e.target.value}))}>
            <option value="">All Departments</option>
            {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>Employee</label>
          <select className="form-input" style={{fontSize:13,width:200}} value={filters.staff_id} onChange={e=>setFilters(f=>({...f,staff_id:e.target.value}))}>
            <option value="">All Employees</option>
            {staff.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>Month</label>
          <select className="form-input" style={{fontSize:13,width:140}} value={filters.month} onChange={e=>setFilters(f=>({...f,month:e.target.value}))}>
            <option value="">All Months</option>
            {MONTH_NAMES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>Year</label>
          <input type="number" className="form-input" style={{fontSize:13,width:100}} value={filters.year} onChange={e=>setFilters(f=>({...f,year:e.target.value}))} placeholder="Year" />
        </div>
        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={load}>Apply Filters</button>
      </div>

      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:13,color:"#64748b"}}>{rows.length} record(s)</div>
          <div style={{fontSize:13,fontWeight:700}}>Total Net Pay: {totalNet.toLocaleString()}</div>
        </div>
        {loading && <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>}
        {!loading && rows.length===0 && <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No records found.</div>}
        {!loading && rows.length>0 && (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Employee","Code","Department","Period","Salary Type","Gross","Deductions","Net Pay"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                    <td style={{padding:"10px 14px",fontWeight:600}}>{r.first_name} {r.last_name}</td>
                    <td style={{padding:"10px 14px",color:"#64748b"}}>{r.employee_code || "-"}</td>
                    <td style={{padding:"10px 14px"}}>{r.department_name || "-"}</td>
                    <td style={{padding:"10px 14px"}}>{MONTH_NAMES[r.month-1]} {r.year}</td>
                    <td style={{padding:"10px 14px",textTransform:"capitalize",color:"#64748b"}}>{(r.salary_type||"").replace("_"," ")}</td>
                    <td style={{padding:"10px 14px"}}>{Number(r.gross_earnings).toLocaleString()}</td>
                    <td style={{padding:"10px 14px",color:"#dc2626"}}>{Number(r.total_deductions).toLocaleString()}</td>
                    <td style={{padding:"10px 14px",fontWeight:700}}>{Number(r.net_pay).toLocaleString()}</td>
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
