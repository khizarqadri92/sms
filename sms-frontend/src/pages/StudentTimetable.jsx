import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import academicsApi from "../api/academicsApi";
import studentsApi  from "../api/studentsApi";

const DAYS = { "1":"Monday","2":"Tuesday","3":"Wednesday","4":"Thursday","5":"Friday" };
const COLOR_PALETTE = [
  {bg:"#eff6ff",border:"#2563eb",text:"#1e40af"},
  {bg:"#f0fdf4",border:"#16a34a",text:"#166534"},
  {bg:"#fef9c3",border:"#ca8a04",text:"#854d0e"},
  {bg:"#fef2f2",border:"#dc2626",text:"#991b1b"},
  {bg:"#f5f3ff",border:"#7c3aed",text:"#5b21b6"},
  {bg:"#fff7ed",border:"#ea580c",text:"#9a3412"},
  {bg:"#ecfeff",border:"#0891b2",text:"#0e7490"},
  {bg:"#fdf4ff",border:"#a21caf",text:"#86198f"},
];

export default function StudentTimetable() {
  const { user } = useAuth();
  const [slots,     setSlots]     = useState([]);
  const [classInfo, setClassInfo] = useState(null);
  const [activeDay, setActiveDay] = useState("all");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    // Get student's class_id from their profile
    studentsApi.getMyProfile().then(r => {
      const s = r.data.data;
      if (!s?.class_id) { setLoading(false); return; }
      setClassInfo(s);
      return academicsApi.getTimetable({ class_id: s.class_id });
    }).then(r => {
      if (r) setSlots(r.data.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Build subject color map
  const subjIds = [...new Set(slots.map(s => s.subject_id))];
  const subjColorMap = {};
  subjIds.forEach((id, i) => { subjColorMap[id] = COLOR_PALETTE[i % COLOR_PALETTE.length]; });

  const days = activeDay === "all" ? ["1","2","3","4","5"] : [activeDay];
  const timeSlotsAll = [...new Set(slots.map(s => (s.start_time||"").slice(0,5)))].sort();

  if (loading) return <div className="loading-state">Loading timetable...</div>;

  if (!classInfo?.class_id) return (
    <div className="section-card">
      <div className="empty-state">You are not assigned to any class yet.</div>
    </div>
  );

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <div>
          <h1 className="page-heading">My Timetable</h1>
          {classInfo && <span style={{ fontSize:13, color:"#64748b" }}>Class: {classInfo.class_name || "—"}{classInfo.section ? " (" + classInfo.section + ")" : ""}</span>}
        </div>
      </div>

      {/* Day tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", marginBottom:16 }}>
        {["All Days","Monday","Tuesday","Wednesday","Thursday","Friday"].map((day, i) => (
          <button key={day}
            onClick={() => setActiveDay(i === 0 ? "all" : String(i))}
            style={{
              flex:1, padding:"8px 4px", fontSize:12, fontWeight:500, border:"none", cursor:"pointer",
              background: activeDay === (i === 0 ? "all" : String(i)) ? "#1e3a5f" : "var(--color-background-secondary)",
              color: activeDay === (i === 0 ? "all" : String(i)) ? "#fff" : "var(--color-text-secondary)",
            }}
          >{day}</button>
        ))}
      </div>

      {slots.length === 0 ? (
        <div className="empty-state">No timetable available for your class yet.</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr>
                <th style={{ background:"#1e3a5f", color:"#fff", padding:"8px 10px", width:80, textAlign:"left" }}>Time</th>
                {days.map(d => (
                  <th key={d} style={{ background:"#1e3a5f", color:"#fff", padding:"8px 6px", textAlign:"center" }}>{DAYS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlotsAll.map(time => (
                <tr key={time} style={{ borderBottom:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"8px 10px", fontWeight:600, fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>
                    {time}
                  </td>
                  {days.map(d => {
                    const s = slots.find(sl => String(sl.day_of_week)===d && (sl.start_time||"").slice(0,5)===time);
                    const c = s ? (subjColorMap[s.subject_id]||COLOR_PALETTE[0]) : null;
                    return (
                      <td key={d} style={{ padding:"4px 6px", verticalAlign:"top", border:"0.5px solid #f1f5f9" }}>
                        {s ? (
                          <div style={{ background:c.bg, borderLeft:"3px solid "+c.border, borderRadius:6, padding:"6px 8px" }}>
                            <div style={{ fontWeight:700, fontSize:12, color:c.text }}>{s.subject_name}</div>
                            <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{s.teacher_name}</div>
                            <div style={{ fontSize:10, color:"#94a3b8", marginTop:1 }}>
                              {(s.start_time||"").slice(0,5)} – {(s.end_time||"").slice(0,5)}
                            </div>
                          </div>
                        ) : <div style={{ color:"#e2e8f0", textAlign:"center", fontSize:10 }}>—</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}