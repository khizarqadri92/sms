import { useState, useEffect } from "react";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";

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
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Attendance Report — By Class</div>
          <div style={{fontSize:13,color:"#64748b"}}>Set conditions and generate a custom attendance report</div>
        </div>
        {hasRun&&<button onClick={reset} style={{padding:"7px 16px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",color:"#64748b"}}>Reset</button>}
      </div>

      {/* Filter Builder */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"20px",marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:14,color:"#0f172a",marginBottom:16}}>Report Conditions</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14,marginBottom:16}}>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>From Date</label>
            <DatePicker value={from} onChange={val=>setFrom(val)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>To Date</label>
            <DatePicker value={to} onChange={val=>setTo(val)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Class</label>
            <select value={classId} onChange={e=>setClassId(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
              <option value="">All Classes</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Marking Status</label>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
              <option value="">All</option>
              <option value="marked">Marked Today</option>
              <option value="unmarked">Not Marked Today</option>
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Min Attendance %</label>
            <input type="number" min={0} max={100} value={minPct} onChange={e=>setMinPct(e.target.value)} placeholder="e.g. 50" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Max Attendance %</label>
            <input type="number" min={0} max={100} value={maxPct} onChange={e=>setMaxPct(e.target.value)} placeholder="e.g. 100" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Sort By</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
              <option value="name">Class Name</option>
              <option value="pct">Attendance %</option>
              <option value="present">Present Count</option>
              <option value="absent">Absent Count</option>
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
          <button disabled={loading} onClick={loadReport} style={{padding:"10px 28px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            {loading?"Generating...":"Generate Report"}
          </button>
          {hasRun&&<span style={{fontSize:12,color:"#64748b"}}>{filtered.length} of {report.length} classes shown</span>}
        </div>
      </div>

      {/* Summary Cards */}
      {hasRun&&filtered.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12,marginBottom:20}}>
          {[
            {l:"Classes",      v:filtered.length, c:"#2563eb"},
            {l:"Students",     v:totalS,           c:"#374151"},
            {l:"Present",      v:totalP,           c:"#166534"},
            {l:"Absent",       v:totalA,           c:"#991b1b"},
            {l:"Late",         v:totalL,           c:"#854d0e"},
            {l:"On Leave",     v:totalOL,          c:"#1e40af"},
          ].map((s,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:10,padding:"14px",border:"1px solid #e2e8f0",textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Generating report...</div>}
      {!loading&&!hasRun&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div><div style={{fontWeight:600,fontSize:15}}>Set your conditions above and click Generate Report</div></div>}
      {!loading&&hasRun&&filtered.length===0&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>No classes match your conditions.</div>}
      {!loading&&hasRun&&filtered.length>0&&(
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:15}}>Results — {from} to {to}</div>
            <div style={{fontSize:12,color:"#64748b"}}>{filtered.length} classes</div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Class","Incharge","Total","Present","Absent","Late","On Leave","% Present","Today"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((cls,i)=>(
                <tr key={cls.class_id} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"10px 14px",fontWeight:700}}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</td>
                  <td style={{padding:"10px 14px",color:"#2563eb",fontSize:12}}>{cls.incharge_name||"-"}</td>
                  <td style={{padding:"10px 14px",color:"#64748b"}}>{cls.total_students}</td>
                  <td style={{padding:"10px 14px",color:"#166534",fontWeight:600}}>{cls.present}</td>
                  <td style={{padding:"10px 14px",color:"#991b1b",fontWeight:600}}>{cls.absent}</td>
                  <td style={{padding:"10px 14px",color:"#854d0e",fontWeight:600}}>{cls.late}</td>
                  <td style={{padding:"10px 14px",color:"#1e40af",fontWeight:600}}>{cls.on_leave}</td>
                  <td style={{padding:"10px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:70,height:6,borderRadius:6,background:"#f1f5f9",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:6,background:cls.attendance_pct>=75?"#22c55e":cls.attendance_pct>=50?"#f59e0b":"#ef4444",width:Math.min(cls.attendance_pct,100)+"%"}} />
                      </div>
                      <span style={{fontWeight:600,color:cls.attendance_pct>=75?"#166534":cls.attendance_pct>=50?"#854d0e":"#991b1b"}}>{cls.attendance_pct}%</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    {cls.is_marked
                      ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Marked</span>
                      : <span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10}}>Not Marked</span>
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