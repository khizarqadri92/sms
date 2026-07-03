import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

export default function AnnouncementTicker() {
  const [announcements, setAnnouncements] = useState([]);
  const [current, setCurrent]             = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.roles?.[0]||"";
  const intervalRef = useRef(null);

  useEffect(()=>{
    client.get("/announcements/").then(r=>{
      setAnnouncements(r.data.data||[]);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(announcements.length<=1) return;
    intervalRef.current = setInterval(()=>{
      setCurrent(p=>(p+1)%announcements.length);
    }, 5000);
    return ()=>clearInterval(intervalRef.current);
  },[announcements]);

  if(announcements.length===0) return null;

  const ann = announcements[current];
  const typeColors = {
    exam:   {bg:"#eff6ff",color:"#1d4ed8",dot:"#2563eb",label:"Exam"},
    result: {bg:"#f0fdf4",color:"#166534",dot:"#22c55e",label:"Result"},
    info:   {bg:"#fefce8",color:"#854d0e",dot:"#f59e0b",label:"Info"},
    urgent: {bg:"#fff1f2",color:"#9f1239",dot:"#ef4444",label:"Urgent"},
  };
  const tc = typeColors[ann.ann_type]||typeColors.info;

  return (
    <div style={{background:tc.bg,borderBottom:"1px solid rgba(0,0,0,0.06)",padding:"6px 20px",display:"flex",alignItems:"center",gap:12,minHeight:34}}>
      {/* Label badge */}
      <span style={{fontSize:10,fontWeight:700,background:tc.dot,color:"#fff",padding:"2px 8px",borderRadius:10,flexShrink:0,textTransform:"uppercase",letterSpacing:".06em"}}>{tc.label}</span>

      {/* Ticker dot */}
      <div style={{width:6,height:6,borderRadius:"50%",background:tc.dot,flexShrink:0,animation:"pulse 2s infinite"}} />

      {/* Message */}
      <div style={{flex:1,fontSize:12,color:tc.color,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
        <strong>{ann.title}</strong>
        {ann.body&&<span style={{marginLeft:8,fontWeight:400,opacity:.8}}>{ann.body}</span>}
      </div>

      {/* Link */}
      {ann.link&&(
        <button onClick={()=>{
          let dest = ann.link;
          console.log("ticker click:", dest, "role:", role);
          if(dest==="/exam-results"&&!["student","parent"].includes(role)) dest="/exams";
          if(dest==="/datesheet-view"&&["academic_coordinator","admin","superadmin","principal"].includes(role)) dest="/datesheet";
          navigate(dest);
        }} style={{padding:"3px 12px",background:tc.dot,color:"#fff",border:"none",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>
          {ann.link_label||"View"} →
        </button>
      )}

      {/* Navigation dots */}
      {announcements.length>1&&(
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {announcements.map((_,i)=>(
            <div key={i} onClick={()=>setCurrent(i)} style={{width:6,height:6,borderRadius:"50%",background:i===current?tc.dot:"#cbd5e1",cursor:"pointer",transition:"background .2s"}} />
          ))}
        </div>
      )}
    </div>
  );
}