import { useState, useEffect, useRef } from "react";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import { printReport, exportToCSV, exportToPDF } from "../utils/reportExport";

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => new Date().toISOString().slice(0,7) + "-01";

export default function StudentAttendanceReport() {
  const [classes,  setClasses]  = useState([]);
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [hasRun,   setHasRun]   = useState(false);

  // Filters
  const [from,       setFrom]       = useState(monthStart());
  const [to,         setTo]         = useState(today());
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
    setFrom(monthStart()); setTo(today()); setClassId(""); setSearch("");
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
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Attendance Report — By Student</div>
          <div style={{fontSize:13,color:"#64748b"}}>Filter students by attendance conditions</div>
        </div>
        {hasRun&&<button onClick={reset} style={{padding:"7px 16px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",color:"#64748b"}}>Reset</button>}
      </div>

      {hasRun && filtered.length>0 && (
        <div className="no-print" style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:12}}>
          <button className="btn btn-ghost btn-sm" onClick={printReport}>Print</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>exportToCSV(columns, filtered, "Student_Attendance")}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>exportToPDF("Student Attendance", columns, filtered, "Student_Attendance")}>Export PDF</button>
        </div>
      )}

      {/* Filter Builder */}
      <div className="no-print" style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"20px",marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:14,color:"#0f172a",marginBottom:16}}>Report Conditions</div>

        {/* Quick presets */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:600,color:"#374151",alignSelf:"center",marginRight:4}}>Quick Filter:</div>
          {[
            {k:"",     l:"All Students"},
            {k:"low_att",    l:"Below 75% Attendance"},
            {k:"high_leave", l:"3+ On Leave Days"},
            {k:"late_prone", l:"3+ Late Arrivals"},
            {k:"perfect",    l:"Perfect Attendance"},
          ].map(p=>(
            <button key={p.k} onClick={()=>setStatusType(p.k)} style={{padding:"5px 12px",borderRadius:20,border:"1.5px solid",borderColor:statusType===p.k?"#0f4c35":"#e2e8f0",background:statusType===p.k?"#f0fdf4":"#fff",color:statusType===p.k?"#0f4c35":"#64748b",fontSize:12,fontWeight:statusType===p.k?700:400,cursor:"pointer"}}>
              {p.l}
            </button>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:16}}>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>From Date</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>To Date</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Class</label>
            <select value={classId} onChange={e=>setClassId(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
              <option value="">All Classes</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Search Student</label>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or enrollment..." style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Min Attendance %</label>
            <input type="number" min={0} max={100} value={minPct} onChange={e=>setMinPct(e.target.value)} placeholder="e.g. 0" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Max Attendance %</label>
            <input type="number" min={0} max={100} value={maxPct} onChange={e=>setMaxPct(e.target.value)} placeholder="e.g. 75" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Min Absent Days</label>
            <input type="number" min={0} value={minAbsent} onChange={e=>setMinAbsent(e.target.value)} placeholder="e.g. 3" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Min Late Days</label>
            <input type="number" min={0} value={minLate} onChange={e=>setMinLate(e.target.value)} placeholder="e.g. 2" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Min On Leave Days</label>
            <input type="number" min={0} value={minLeave} onChange={e=>setMinLeave(e.target.value)} placeholder="e.g. 1" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Max On Leave Days</label>
            <input type="number" min={0} value={maxLeave} onChange={e=>setMaxLeave(e.target.value)} placeholder="e.g. 5" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Sort By</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
              <option value="name">Student Name</option>
              <option value="class">Class</option>
              <option value="pct">Attendance %</option>
              <option value="absent">Absent Days</option>
              <option value="late">Late Days</option>
              <option value="leave">On Leave Days</option>
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Sort Direction</label>
            <select value={sortDir} onChange={e=>setSortDir(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>

        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button disabled={loading} onClick={()=>loadReport()} style={{padding:"10px 28px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            {loading?"Generating...":"Generate Report"}
          </button>
          {hasRun&&<span style={{fontSize:12,color:"#64748b"}}>{filtered.length} of {students.length} students match</span>}
        </div>
      </div>

      {/* Summary */}
      {hasRun&&filtered.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
          {[
            {l:"Total Students",  v:filtered.length,  c:"#2563eb"},
            {l:"Avg Attendance",  v:avgPct+"%",        c:Number(avgPct)>=75?"#166534":"#991b1b"},
            {l:"Below 75%",       v:lowAtt,            c:"#991b1b"},
            {l:"Perfect Attend.", v:perfect,           c:"#166534"},
            {l:"Filtered From",   v:students.length,   c:"#64748b"},
          ].map((s,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:10,padding:"14px",border:"1px solid #e2e8f0",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Empty States */}
      {!loading&&!hasRun&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>👨‍🎓</div><div style={{fontWeight:600,fontSize:15}}>Set conditions and click Generate Report</div></div>}
      {loading&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Generating report...</div>}
      {!loading&&hasRun&&filtered.length===0&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>No students match your conditions.</div>}

      {/* Table */}
      {!loading&&hasRun&&filtered.length>0&&(
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:15}}>{filtered.length} Students — {from} to {to}</div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["#","Student","Enrollment","Class","Present","Absent","Late","On Leave","Total Days","Attendance %"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s,i)=>{
                const pct=s.pct||0;
                return (
                  <tr key={s.id} style={{borderBottom:"1px solid #f8fafc",background:pct<75?"#fff8f8":i%2===0?"#fff":"#fafafa"}}>
                    <td style={{padding:"9px 14px",color:"#94a3b8"}}>{i+1}</td>
                    <td style={{padding:"9px 14px",fontWeight:600,color:"#0f172a"}}>{s.first_name} {s.last_name}</td>
                    <td style={{padding:"9px 14px",color:"#64748b",fontSize:12}}>{s.enrollment_no}</td>
                    <td style={{padding:"9px 14px"}}>{s.class_name}{s.section?" ("+s.section+")":""}</td>
                    <td style={{padding:"9px 14px",color:"#166534",fontWeight:600}}>{s.present||0}</td>
                    <td style={{padding:"9px 14px",color:"#991b1b",fontWeight:600}}>{s.absent||0}</td>
                    <td style={{padding:"9px 14px",color:"#854d0e",fontWeight:600}}>{s.late||0}</td>
                    <td style={{padding:"9px 14px",color:"#1e40af",fontWeight:600}}>{s.on_leave||0}</td>
                    <td style={{padding:"9px 14px",color:"#64748b"}}>{s.total_days||0}</td>
                    <td style={{padding:"9px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:60,height:6,borderRadius:6,background:"#f1f5f9",overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:6,background:pct>=75?"#22c55e":pct>=50?"#f59e0b":"#ef4444",width:Math.min(pct,100)+"%"}} />
                        </div>
                        <span style={{fontWeight:700,color:pct>=75?"#166534":pct>=50?"#854d0e":"#991b1b"}}>{pct}%</span>
                      </div>
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