import { useState, useEffect, useRef } from "react";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import "./StudentAttendanceReport.css";

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => new Date().toISOString().slice(0,7) + "-01";

export default function StudentAttendanceReport() {
  const processingToday = useProcessingToday();
  const [classes,  setClasses]  = useState([]);
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [hasRun,   setHasRun]   = useState(false);

  // Filters
  const [from,       setFrom]       = useState(monthStart());
  const [to,         setTo]         = useState(today());
  useEffect(() => { setFrom(processingToday.slice(0,7)+"-01"); setTo(processingToday); }, [processingToday]);
  const [classId,    setClassId]    = useState("");
  const [search,     setSearch]     = useState("");
  const [sortBy,     setSortBy]     = useState("name");
  const [sortDir,    setSortDir]    = useState("asc");
  const [minPct,     setMinPct]     = useState("");
  const [maxPct,     setMaxPct]     = useState("");
  const [minAbsent,  setMinAbsent]  = useState("");
  const [minLate,    setMinLate]    = useState("");
  const [minLeave,   setMinLeave]   = useState("");
  const [maxLeave,   setMaxLeave]   = useState("");
  const [statusType, setStatusType] = useState(""); // high_leave, low_att, late_prone

  useEffect(()=>{
    academicsApi.getClasses().then(r=>setClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
  },[]);

  const loadReport = async (searchVal) => {
    const q = searchVal !== undefined ? searchVal : search;
    setLoading(true);
    try {
      const params = {from, to};
      if(classId) params.class_id = classId;
      if(q) params.search = q;
      const r = await client.get("/attendance/student-report", {params});
      setStudents(r.data.data||[]);
      setHasRun(true);
    } catch(e){}
    finally { setLoading(false); }
  };

  const reset = () => {
    setFrom(processingToday.slice(0,7)+"-01"); setTo(processingToday); setClassId(""); setSearch("");
    setSortBy("name"); setSortDir("asc"); setMinPct(""); setMaxPct("");
    setMinAbsent(""); setMinLate(""); setMinLeave(""); setMaxLeave(""); setStatusType("");
    setStudents([]); setHasRun(false);
  };

  // Apply client-side filters
  const filtered = students.filter(s=>{
    if(minPct!==""    && (s.pct||0)<Number(minPct))     return false;
    if(maxPct!==""    && (s.pct||0)>Number(maxPct))     return false;
    if(minAbsent!=="" && (s.absent||0)<Number(minAbsent)) return false;
    if(minLate!==""   && (s.late||0)<Number(minLate))    return false;
    if(minLeave!==""  && (s.on_leave||0)<Number(minLeave)) return false;
    if(maxLeave!==""  && (s.on_leave||0)>Number(maxLeave)) return false;
    if(statusType==="low_att"   && (s.pct||0)>=75)      return false;
    if(statusType==="high_leave"&& (s.on_leave||0)<3)   return false;
    if(statusType==="late_prone"&& (s.late||0)<3)       return false;
    if(statusType==="perfect"   && (s.absent||0)>0)     return false;
    return true;
  }).sort((a,b)=>{
    let va, vb;
    if(sortBy==="name")    { va=a.first_name+" "+a.last_name; vb=b.first_name+" "+b.last_name; }
    else if(sortBy==="pct")    { va=a.pct||0;      vb=b.pct||0; }
    else if(sortBy==="absent") { va=a.absent||0;   vb=b.absent||0; }
    else if(sortBy==="late")   { va=a.late||0;     vb=b.late||0; }
    else if(sortBy==="leave")  { va=a.on_leave||0; vb=b.on_leave||0; }
    else if(sortBy==="class")  { va=a.class_name+(a.section||""); vb=b.class_name+(b.section||""); }
    else { va=a.first_name; vb=b.first_name; }
    if(typeof va==="string") return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);
    return sortDir==="asc"?va-vb:vb-va;
  });

  const columns = [
    { label: "Student", value: s => `${s.first_name} ${s.last_name}` },
    { label: "Enrollment", value: s => s.enrollment_no },
    { label: "Class", value: s => `${s.class_name}${s.section?" ("+s.section+")":""}` },
    { label: "Present", value: s => s.present||0 },
    { label: "Absent", value: s => s.absent||0 },
    { label: "Late", value: s => s.late||0 },
    { label: "On Leave", value: s => s.on_leave||0 },
    { label: "Total Days", value: s => s.total_days||0 },
    { label: "Attendance %", value: s => (s.pct||0)+"%" },
  ];

  const avgPct  = filtered.length>0?(filtered.reduce((a,s)=>a+(s.pct||0),0)/filtered.length).toFixed(1):0;
  const lowAtt  = filtered.filter(s=>(s.pct||0)<75).length;
  const perfect = filtered.filter(s=>(s.absent||0)===0&&(s.on_leave||0)===0).length;

  return (
    <div className="sar-page">
      <div className="sar-header-row">
        <div>
          <div className="sar-title">Attendance Report — By Student</div>
          <div className="sar-subtitle">Filter students by attendance conditions</div>
        </div>
        {hasRun&&<button onClick={reset} className="sar-reset-btn">Reset</button>}
      </div>

      {hasRun && filtered.length>0 && (
        <div className="no-print sar-export-row">
          <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(columns, filtered, "Student_Attendance")}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Student Attendance", columns, filtered, "Student_Attendance")}>Export PDF</button>
        </div>
      )}

      {/* Filter Builder */}
      <div className="no-print sar-filter-card">
        <div className="sar-filter-card-title">Report Conditions</div>

        {/* Quick presets */}
        <div className="sar-preset-row">
          <div className="sar-preset-label">Quick Filter:</div>
          {[
            {k:"",     l:"All Students"},
            {k:"low_att",    l:"Below 75% Attendance"},
            {k:"high_leave", l:"3+ On Leave Days"},
            {k:"late_prone", l:"3+ Late Arrivals"},
            {k:"perfect",    l:"Perfect Attendance"},
          ].map(p=>(
            <button key={p.k} onClick={()=>setStatusType(p.k)} className="sar-preset-btn"
              style={{ "--preset-border": statusType===p.k?"#0f4c35":"var(--border-color)", "--preset-bg": statusType===p.k?"var(--bg-success-soft)":"var(--bg-card)", "--preset-color": statusType===p.k?"#0f4c35":"var(--text-secondary)", "--preset-weight": statusType===p.k?700:400 }}>
              {p.l}
            </button>
          ))}
        </div>

        <div className="sar-filter-grid">
          <div>
            <label className="sar-field-label">From Date</label>
            <DatePicker value={from} onChange={val=>setFrom(val)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label className="sar-field-label">To Date</label>
            <DatePicker value={to} onChange={val=>setTo(val)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label className="sar-field-label">Class</label>
            <select value={classId} onChange={e=>setClassId(e.target.value)} className="sar-filter-input">
              <option value="">All Classes</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
            </select>
          </div>
          <div>
            <label className="sar-field-label">Search Student</label>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or enrollment..." className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Min Attendance %</label>
            <input type="number" min={0} max={100} value={minPct} onChange={e=>setMinPct(e.target.value)} placeholder="e.g. 0" className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Max Attendance %</label>
            <input type="number" min={0} max={100} value={maxPct} onChange={e=>setMaxPct(e.target.value)} placeholder="e.g. 75" className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Min Absent Days</label>
            <input type="number" min={0} value={minAbsent} onChange={e=>setMinAbsent(e.target.value)} placeholder="e.g. 3" className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Min Late Days</label>
            <input type="number" min={0} value={minLate} onChange={e=>setMinLate(e.target.value)} placeholder="e.g. 2" className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Min On Leave Days</label>
            <input type="number" min={0} value={minLeave} onChange={e=>setMinLeave(e.target.value)} placeholder="e.g. 1" className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Max On Leave Days</label>
            <input type="number" min={0} value={maxLeave} onChange={e=>setMaxLeave(e.target.value)} placeholder="e.g. 5" className="sar-filter-input" />
          </div>
          <div>
            <label className="sar-field-label">Sort By</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="sar-filter-input">
              <option value="name">Student Name</option>
              <option value="class">Class</option>
              <option value="pct">Attendance %</option>
              <option value="absent">Absent Days</option>
              <option value="late">Late Days</option>
              <option value="leave">On Leave Days</option>
            </select>
          </div>
          <div>
            <label className="sar-field-label">Sort Direction</label>
            <select value={sortDir} onChange={e=>setSortDir(e.target.value)} className="sar-filter-input">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>

        <div className="sar-generate-row">
          <button disabled={loading} onClick={()=>loadReport()} className="sar-generate-btn">
            {loading?"Generating...":"Generate Report"}
          </button>
          {hasRun&&<span className="sar-generate-status">{filtered.length} of {students.length} students match</span>}
        </div>
      </div>

      {/* Summary */}
      {hasRun&&filtered.length>0&&(
        <div className="sar-summary-grid">
          {[
            {l:"Total Students",  v:filtered.length,  c:"#2563eb"},
            {l:"Avg Attendance",  v:avgPct+"%",        c:Number(avgPct)>=75?"#166534":"#991b1b"},
            {l:"Below 75%",       v:lowAtt,            c:"#991b1b"},
            {l:"Perfect Attend.", v:perfect,           c:"#166534"},
            {l:"Filtered From",   v:students.length,   c:"var(--text-secondary)"},
          ].map((s,i)=>(
            <div key={i} className="sar-summary-card">
              <div className="sar-summary-value" style={{ "--val-color": s.c }}>{s.v}</div>
              <div className="sar-summary-label">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Empty States */}
      {!loading&&!hasRun&&<div className="sar-state-card" style={{padding:"60px"}}><div className="sar-state-icon">👨‍🎓</div><div className="sar-state-text">Set conditions and click Generate Report</div></div>}
      {loading&&<div className="sar-state-card" style={{padding:"40px"}}>Generating report...</div>}
      {!loading&&hasRun&&filtered.length===0&&<div className="sar-state-card" style={{padding:"40px"}}>No students match your conditions.</div>}

      {/* Table */}
      {!loading&&hasRun&&filtered.length>0&&(
        <div className="sar-table-wrap">
          <div className="sar-table-header-row">
            <div className="sar-table-header-title">{filtered.length} Students — {from} to {to}</div>
          </div>
          <table className="sar-table">
            <thead>
              <tr className="sar-th-row">
                {["#","Student","Enrollment","Class","Present","Absent","Late","On Leave","Total Days","Attendance %"].map(h=>(
                  <th key={h} className="sar-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s,i)=>{
                const pct=s.pct||0;
                return (
                  <tr key={s.id} className="sar-tr" style={{ "--row-bg": pct<75?"var(--bg-danger-soft)":i%2===0?"var(--bg-card)":"var(--bg-hover)" }}>
                    <td className="sar-td-index">{i+1}</td>
                    <td className="sar-td-bold">{s.first_name} {s.last_name}</td>
                    <td className="sar-td-enrollment">{s.enrollment_no}</td>
                    <td className="sar-td">{s.class_name}{s.section?" ("+s.section+")":""}</td>
                    <td className="sar-td-present">{s.present||0}</td>
                    <td className="sar-td-absent">{s.absent||0}</td>
                    <td className="sar-td-late">{s.late||0}</td>
                    <td className="sar-td-leave">{s.on_leave||0}</td>
                    <td className="sar-td-muted">{s.total_days||0}</td>
                    <td className="sar-pct-cell">
                      <div className="sar-pct-bar-track">
                        <div className="sar-pct-bar-fill" style={{ "--fill-color": pct>=75?"#22c55e":pct>=50?"#f59e0b":"#ef4444", "--fill-width": Math.min(pct,100)+"%" }} />
                      </div>
                      <span className="sar-pct-text" style={{ "--pct-color": pct>=75?"#166534":pct>=50?"#854d0e":"#991b1b" }}>{pct}%</span>
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