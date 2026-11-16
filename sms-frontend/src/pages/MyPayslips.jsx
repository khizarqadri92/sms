import { useState, useEffect } from "react";
import payrollApi from "../api/payrollApi";
import "./MyPayslips.css";

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
    <div className="mps-page">
      <div className="mps-header">
        <div className="mps-title">My Payslips</div>
        <div className="mps-subtitle">View and download your salary slips</div>
      </div>

      {loading && <div className="mps-loading">Loading...</div>}

      {!loading && payslips.length===0 && (
        <div className="mps-empty">
          <div className="mps-empty-icon">&#128179;</div>
          <div className="mps-empty-title">No salary slips available yet</div>
        </div>
      )}

      {!loading && payslips.length>0 && (
        <div className="mps-table-wrap">
          <table className="mps-table">
            <thead>
              <tr className="mps-th-row">
                {["Period","Net Pay",""].map(h=>(
                  <th key={h} className="mps-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payslips.map((p,i)=>{
                const label = MONTH_NAMES[p.month-1] + " " + p.year;
                return (
                  <tr key={p.run_id} className="mps-tr" style={{ "--row-bg": i%2===0?"var(--bg-card)":"var(--bg-hover)" }}>
                    <td className="mps-td-label">{label}</td>
                    <td className="mps-td-net">{Number(p.net_pay).toLocaleString()}</td>
                    <td className="mps-td-action">
                      <button className="btn btn-primary btn-sm mps-download-btn" disabled={downloadingId===p.run_id}
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
