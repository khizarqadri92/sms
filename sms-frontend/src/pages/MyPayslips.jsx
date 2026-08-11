import { useState, useEffect } from "react";
import payrollApi from "../api/payrollApi";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function MyPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    payrollApi.getMyPayslips().then(r => setPayslips(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const download = async (run_id, staff_id, label) => {
    setDownloadingId(run_id);
    try {
      const r = await payrollApi.downloadSalarySlip(run_id, staff_id);
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `SalarySlip_${label}.pdf`.replace(/\s+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      // ignore
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>My Payslips</div>
        <div style={{fontSize:13,color:"#64748b"}}>View and download your salary slips</div>
      </div>

      {loading && <div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}

      {!loading && payslips.length===0 && (
        <div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>
          <div style={{fontSize:32,marginBottom:12}}>&#128179;</div>
          <div style={{fontWeight:600}}>No salary slips available yet</div>
        </div>
      )}

      {!loading && payslips.length>0 && (
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Period","Net Pay",""].map(h=>(
                  <th key={h} style={{padding:"10px 16px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payslips.map((p,i)=>{
                const label = MONTH_NAMES[p.month-1] + " " + p.year;
                return (
                  <tr key={p.run_id} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                    <td style={{padding:"12px 16px",fontWeight:600,fontSize:14}}>{label}</td>
                    <td style={{padding:"12px 16px",fontSize:14,fontWeight:700,color:"#166534"}}>{Number(p.net_pay).toLocaleString()}</td>
                    <td style={{padding:"12px 16px"}}>
                      <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={downloadingId===p.run_id}
                        onClick={()=>download(p.run_id, p.staff_id, label)}>
                        {downloadingId===p.run_id ? "Downloading..." : "Download"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
