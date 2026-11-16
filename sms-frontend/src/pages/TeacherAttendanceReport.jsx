import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import "./TeacherAttendanceReport.css";

const monthStart = () => new Date().toISOString().slice(0,7) + "-01";
const today = () => new Date().toISOString().split("T")[0];

export default function TeacherAttendanceReport() {
  const processingToday = useProcessingToday();
  const [from,    setFrom]    = useState(today());
  const [to,      setTo]      = useState(today());
  useEffect(() => { setFrom(processingToday); setTo(processingToday); }, [processingToday]);
  const [report,   setReport]   = useState([]);
  const [hasRun,   setHasRun]   = useState(false);
  const [sortDir,  setSortDir]  = useState("asc");
  const [statusF,  setStatusF]  = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(()=>{},[]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const r = await client.get("/attendance/admin-report", {params:{from,to}});
      setReport(r.data.data?.report||[]);
      setHasRun(true);
    } catch(e){}
    finally { setLoading(false); }
  };

  const filtered = report.filter(c=>{
    if(statusF==="marked"  &&!c.is_marked) return false;
    if(statusF==="unmarked"&& c.is_marked) return false;
    return true;
  }).sort((a,b)=>sortDir==="asc"?(a.class_name+(a.section||"")).localeCompare(b.class_name+(b.section||"")):(b.class_name+(b.section||"")).localeCompare(a.class_name+(a.section||"")));
  const marked   = report.filter(c=>c.is_marked).length;
  const unmarked = report.length - marked;

  return (
    <div className="tar-page">
      <div className="tar-header">
        <div className="tar-title">Teacher-wise Attendance Report</div>
        <div className="tar-subtitle">Track which class incharges have marked attendance</div>
      </div>

      {/* Filters */}
      <div className="tar-filters-card">
        <div>
          <label className="tar-field-label">Date</label>
          <DatePicker value={from} onChange={val=>{setFrom(val);setTo(val);}} style={{padding:"8px 12px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
        </div>
        <div>
          <label className="tar-field-label">Status</label>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} className="tar-select">
            <option value="">All</option>
            <option value="marked">Marked</option>
            <option value="unmarked">Not Marked</option>
          </select>
        </div>
        <div>
          <label className="tar-field-label">Sort</label>
          <select value={sortDir} onChange={e=>setSortDir(e.target.value)} className="tar-select">
            <option value="asc">A-Z</option>
            <option value="desc">Z-A</option>
          </select>
        </div>
        <button disabled={loading} onClick={loadReport} className="tar-generate-btn">
          {loading?"Loading...":"Generate"}
        </button>
      </div>

      {/* Summary */}
      {report.length>0&&(
        <div className="tar-summary-grid">
          {[
            {l:"Total Classes",  v:report.length,  c:"#2563eb"},
            {l:"Marked Today",   v:marked,          c:"#166534"},
            {l:"Not Marked",     v:unmarked,        c:"#991b1b"},
          ].map((s,i)=>(
            <div key={i} className="tar-summary-card">
              <div className="tar-summary-value" style={{ "--val-color": s.c }}>{s.v}</div>
              <div className="tar-summary-label">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading&&<div className="tar-loading-card">Loading...</div>}
      {!loading&&report.length>0&&(
        <div className="tar-table-wrap">
          <div className="tar-table-header-title">
            Class Incharge Marking Status — {from}
          </div>
          <table className="tar-table">
            <thead>
              <tr className="tar-th-row">
                {["Class","Class Incharge","Students","Marked","Present","Absent","Late","On Leave","Status"].map(h=>(
                  <th key={h} className="tar-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.sort((a,b)=>a.is_marked===b.is_marked?0:a.is_marked?1:-1).map((cls,i)=>(
                <tr key={cls.class_id} className="tar-tr" style={{ "--row-bg": i%2===0?"var(--bg-card)":"var(--bg-hover)" }}>
                  <td className="tar-td-bold">{cls.class_name}{cls.section?" ("+cls.section+")":""}</td>
                  <td className="tar-td-incharge">{cls.incharge_name||"-"}</td>
                  <td className="tar-td-muted">{cls.total_students}</td>
                  <td className="tar-td-muted">{cls.present+cls.absent+cls.late+cls.on_leave}</td>
                  <td className="tar-td-present">{cls.present}</td>
                  <td className="tar-td-absent">{cls.absent}</td>
                  <td className="tar-td-late">{cls.late}</td>
                  <td className="tar-td-leave">{cls.on_leave}</td>
                  <td className="tar-td">
                    {cls.is_marked
                      ? <span className="tar-status-marked">Marked</span>
                      : <span className="tar-status-unmarked">Not Marked</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}