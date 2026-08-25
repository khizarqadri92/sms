import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";

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
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Teacher-wise Attendance Report</div>
        <div style={{fontSize:13,color:"#64748b"}}>Track which class incharges have marked attendance</div>
      </div>

      {/* Filters */}
      <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0",marginBottom:20,display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Date</label>
          <DatePicker value={from} onChange={val=>{setFrom(val);setTo(val);}} style={{padding:"8px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
        </div>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Status</label>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
            <option value="">All</option>
            <option value="marked">Marked</option>
            <option value="unmarked">Not Marked</option>
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Sort</label>
          <select value={sortDir} onChange={e=>setSortDir(e.target.value)} style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
            <option value="asc">A-Z</option>
            <option value="desc">Z-A</option>
          </select>
        </div>
        <button disabled={loading} onClick={loadReport} style={{padding:"9px 24px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {loading?"Loading...":"Generate"}
        </button>
      </div>

      {/* Summary */}
      {report.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:20}}>
          {[
            {l:"Total Classes",  v:report.length,  c:"#2563eb"},
            {l:"Marked Today",   v:marked,          c:"#166534"},
            {l:"Not Marked",     v:unmarked,        c:"#991b1b"},
          ].map((s,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:12,padding:"20px",border:"1px solid #e2e8f0",textAlign:"center"}}>
              <div style={{fontSize:30,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}
      {!loading&&report.length>0&&(
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",fontWeight:700,fontSize:15}}>
            Class Incharge Marking Status — {from}
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Class","Class Incharge","Students","Marked","Present","Absent","Late","On Leave","Status"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.sort((a,b)=>a.is_marked===b.is_marked?0:a.is_marked?1:-1).map((cls,i)=>(
                <tr key={cls.class_id} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"10px 14px",fontWeight:700}}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</td>
                  <td style={{padding:"10px 14px",color:"#2563eb",fontWeight:500}}>{cls.incharge_name||"-"}</td>
                  <td style={{padding:"10px 14px",color:"#64748b"}}>{cls.total_students}</td>
                  <td style={{padding:"10px 14px",color:"#64748b"}}>{cls.present+cls.absent+cls.late+cls.on_leave}</td>
                  <td style={{padding:"10px 14px",color:"#166534",fontWeight:600}}>{cls.present}</td>
                  <td style={{padding:"10px 14px",color:"#991b1b",fontWeight:600}}>{cls.absent}</td>
                  <td style={{padding:"10px 14px",color:"#854d0e",fontWeight:600}}>{cls.late}</td>
                  <td style={{padding:"10px 14px",color:"#1e40af",fontWeight:600}}>{cls.on_leave}</td>
                  <td style={{padding:"10px 14px"}}>
                    {cls.is_marked
                      ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"3px 10px",borderRadius:10}}>Marked</span>
                      : <span style={{fontSize:11,fontWeight:600,background:"#fee2e2",color:"#991b1b",padding:"3px 10px",borderRadius:10}}>Not Marked</span>
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