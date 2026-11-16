import { useState, useEffect } from "react";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import "./AdminAttendanceReport.css";

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => new Date().toISOString().slice(0,7) + "-01";

export default function AdminAttendanceReport() {
  const processingToday = useProcessingToday();
  const [classes,  setClasses]  = useState([]);
  const [report,   setReport]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [hasRun,   setHasRun]   = useState(false);

  // Filters
  const [from,      setFrom]      = useState(monthStart());
  const [to,        setTo]        = useState(today());
  useEffect(() => { setFrom(processingToday.slice(0,7)+"-01"); setTo(processingToday); }, [processingToday]);
  const [classId,   setClassId]   = useState("");
  const [sortBy,    setSortBy]    = useState("name");
  const [sortDir,   setSortDir]   = useState("asc");
  const [minPct,    setMinPct]    = useState("");
  const [maxPct,    setMaxPct]    = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // marked/unmarked/all

  useEffect(()=>{
    academicsApi.getClasses().then(r=>setClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
  },[]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = {from, to};
      if(classId) params.class_id = classId;
      const r = await client.get("/attendance/admin-report", {params});
      setReport(r.data.data?.report||[]);
      setHasRun(true);
    } catch(e){}
    finally { setLoading(false); }
  };

  const reset = () => {
    setFrom(processingToday.slice(0,7)+"-01"); setTo(processingToday); setClassId("");
    setSortBy("name"); setSortDir("asc"); setMinPct(""); setMaxPct(""); setStatusFilter("");
    setReport([]); setHasRun(false);
  };

  // Apply all filters and sort
  const filtered = report.filter(cls=>{
    if(statusFilter==="marked"  &&!cls.is_marked) return false;
    if(statusFilter==="unmarked"&& cls.is_marked) return false;
    if(minPct!==""&&cls.attendance_pct<Number(minPct)) return false;
    if(maxPct!==""&&cls.attendance_pct>Number(maxPct)) return false;
    return true;
  }).sort((a,b)=>{
    let va, vb;
    if(sortBy==="name")    { va=a.class_name+(a.section||""); vb=b.class_name+(b.section||""); }
    else if(sortBy==="pct"){ va=a.attendance_pct; vb=b.attendance_pct; }
    else if(sortBy==="present"){ va=a.present; vb=b.present; }
    else if(sortBy==="absent") { va=a.absent;  vb=b.absent;  }
    else { va=a.class_name; vb=b.class_name; }
    if(typeof va==="string") return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);
    return sortDir==="asc"?va-vb:vb-va;
  });

  const totalS = filtered.reduce((a,c)=>a+c.total_students,0);
  const totalP = filtered.reduce((a,c)=>a+c.present,0);
  const totalA = filtered.reduce((a,c)=>a+c.absent,0);
  const totalL = filtered.reduce((a,c)=>a+c.late,0);
  const totalOL= filtered.reduce((a,c)=>a+c.on_leave,0);

  return (
    <div className="aar-page">
      <div className="aar-header-row">
        <div>
          <div className="aar-title">Attendance Report — By Class</div>
          <div className="aar-subtitle">Set conditions and generate a custom attendance report</div>
        </div>
        {hasRun&&<button onClick={reset} className="aar-reset-btn">Reset</button>}
      </div>

      {/* Filter Builder */}
      <div className="aar-filter-card">
        <div className="aar-filter-card-title">Report Conditions</div>
        <div className="aar-filter-grid">
          <div>
            <label className="aar-field-label">From Date</label>
            <DatePicker value={from} onChange={val=>setFrom(val)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label className="aar-field-label">To Date</label>
            <DatePicker value={to} onChange={val=>setTo(val)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label className="aar-field-label">Class</label>
            <select value={classId} onChange={e=>setClassId(e.target.value)} className="aar-filter-input">
              <option value="">All Classes</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
            </select>
          </div>
          <div>
            <label className="aar-field-label">Marking Status</label>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="aar-filter-input">
              <option value="">All</option>
              <option value="marked">Marked Today</option>
              <option value="unmarked">Not Marked Today</option>
            </select>
          </div>
          <div>
            <label className="aar-field-label">Min Attendance %</label>
            <input type="number" min={0} max={100} value={minPct} onChange={e=>setMinPct(e.target.value)} placeholder="e.g. 50" className="aar-filter-input" />
          </div>
          <div>
            <label className="aar-field-label">Max Attendance %</label>
            <input type="number" min={0} max={100} value={maxPct} onChange={e=>setMaxPct(e.target.value)} placeholder="e.g. 100" className="aar-filter-input" />
          </div>
          <div>
            <label className="aar-field-label">Sort By</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="aar-filter-input">
              <option value="name">Class Name</option>
              <option value="pct">Attendance %</option>
              <option value="present">Present Count</option>
              <option value="absent">Absent Count</option>
            </select>
          </div>
          <div>
            <label className="aar-field-label">Sort Direction</label>
            <select value={sortDir} onChange={e=>setSortDir(e.target.value)} className="aar-filter-input">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
        <div className="aar-generate-row">
          <button disabled={loading} onClick={loadReport} className="aar-generate-btn">
            {loading?"Generating...":"Generate Report"}
          </button>
          {hasRun&&<span className="aar-generate-status-text">{filtered.length} of {report.length} classes shown</span>}
        </div>
      </div>

      {/* Summary Cards */}
      {hasRun&&filtered.length>0&&(
        <div className="aar-summary-grid">
          {[
            {l:"Classes",      v:filtered.length, c:"#2563eb"},
            {l:"Students",     v:totalS,           c:"var(--text-primary)"},
            {l:"Present",      v:totalP,           c:"#166534"},
            {l:"Absent",       v:totalA,           c:"#991b1b"},
            {l:"Late",         v:totalL,           c:"#854d0e"},
            {l:"On Leave",     v:totalOL,          c:"#1e40af"},
          ].map((s,i)=>(
            <div key={i} className="aar-summary-card">
              <div className="aar-summary-value" style={{ "--val-color": s.c }}>{s.v}</div>
              <div className="aar-summary-label">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading&&<div className="aar-state-card" style={{padding:"40px"}}>Generating report...</div>}
      {!loading&&!hasRun&&<div className="aar-state-card" style={{padding:"60px"}}><div className="aar-state-icon">📊</div><div className="aar-state-text">Set your conditions above and click Generate Report</div></div>}
      {!loading&&hasRun&&filtered.length===0&&<div className="aar-state-card" style={{padding:"40px"}}>No classes match your conditions.</div>}
      {!loading&&hasRun&&filtered.length>0&&(
        <div className="aar-table-wrap">
          <div className="aar-table-header-row">
            <div className="aar-table-header-title">Results — {from} to {to}</div>
            <div className="aar-table-header-count">{filtered.length} classes</div>
          </div>
          <table className="aar-table">
            <thead>
              <tr className="aar-th-row">
                {["Class","Incharge","Total","Present","Absent","Late","On Leave","% Present","Today"].map(h=>(
                  <th key={h} className="aar-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((cls,i)=>(
                <tr key={cls.class_id} className="aar-tr" style={{ "--row-bg": i%2===0?"var(--bg-card)":"var(--bg-hover)" }}>
                  <td className="aar-td-bold">{cls.class_name}{cls.section?" ("+cls.section+")":""}</td>
                  <td className="aar-td-incharge">{cls.incharge_name||"-"}</td>
                  <td className="aar-td-muted">{cls.total_students}</td>
                  <td className="aar-td-present">{cls.present}</td>
                  <td className="aar-td-absent">{cls.absent}</td>
                  <td className="aar-td-late">{cls.late}</td>
                  <td className="aar-td-leave">{cls.on_leave}</td>
                  <td className="aar-pct-cell">
                    <div className="aar-pct-bar-track">
                      <div className="aar-pct-bar-fill" style={{ "--fill-color": cls.attendance_pct>=75?"#22c55e":cls.attendance_pct>=50?"#f59e0b":"#ef4444", "--fill-width": Math.min(cls.attendance_pct,100)+"%" }} />
                    </div>
                    <span className="aar-pct-text" style={{ "--pct-color": cls.attendance_pct>=75?"#166534":cls.attendance_pct>=50?"#854d0e":"#991b1b" }}>{cls.attendance_pct}%</span>
                  </td>
                  <td className="aar-td-muted">
                    {cls.is_marked
                      ? <span className="aar-status-marked">Marked</span>
                      : <span className="aar-status-unmarked">Not Marked</span>
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