import { useState, useEffect } from "react";
import reportsApi from "../api/reportsApi";
import payrollApi from "../api/payrollApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";

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
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Expenditure Details</div>
        <div style={{fontSize:13,color:"#64748b"}}>Vendor invoice expenditures across departments</div>
      </div>

      <div className="no-print" style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:12}}>
        <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(columns, rows, "Expenditure_Details")}>Export CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Expenditure Details", columns, rows, "Expenditure_Details")}>Export PDF</button>
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
          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>Expenditure Type</label>
          <select className="form-input" style={{fontSize:13,width:180}} value={filters.expenditure_type} onChange={e=>setFilters(f=>({...f,expenditure_type:e.target.value}))}>
            <option value="">All Types</option>
            {types.map((t,i)=><option key={i} value={t}>{t}</option>)}
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
          <div style={{fontSize:13,fontWeight:700}}>Total Amount: {totalAmount.toLocaleString()}</div>
        </div>
        {loading && <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>}
        {!loading && rows.length===0 && <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No records found.</div>}
        {!loading && rows.length>0 && (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Invoice No","Vendor","Department","Type","Date","Amount","Paid","Status"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r)=>{
                  const sc = statusColors[r.status] || statusColors.pending;
                  return (
                  <tr key={r.invoice_id} style={{borderBottom:"1px solid #f8fafc"}}>
                    <td style={{padding:"10px 14px",fontWeight:600}}>{r.vendor_invoice_no}</td>
                    <td style={{padding:"10px 14px"}}>{r.vendor_name || "-"}</td>
                    <td style={{padding:"10px 14px"}}>{r.department_name || "-"}</td>
                    <td style={{padding:"10px 14px"}}>{r.expenditure_type || "-"}</td>
                    <td style={{padding:"10px 14px",color:"#64748b"}}>{r.invoice_date}</td>
                    <td style={{padding:"10px 14px",fontWeight:700}}>{Number(r.total_amount).toLocaleString()}</td>
                    <td style={{padding:"10px 14px"}}>{Number(r.paid_amount).toLocaleString()}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{fontSize:11,fontWeight:600,background:sc.bg,color:sc.color,padding:"2px 8px",borderRadius:10,textTransform:"capitalize"}}>{r.status}</span>
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
