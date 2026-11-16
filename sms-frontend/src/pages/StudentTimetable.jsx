import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import academicsApi from "../api/academicsApi";
import studentsApi  from "../api/studentsApi";
import "./StudentViews.css";

const DAYS = { "1":"Monday","2":"Tuesday","3":"Wednesday","4":"Thursday","5":"Friday" };
// Subject colours: sv-c0 ... sv-c7 in StudentViews.css (light + dark)
const PALETTE_SIZE = 8;

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
  subjIds.forEach((id, i) => { subjColorMap[id] = "sv-c" + (i % PALETTE_SIZE); });

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
      <div className="page-header sv-gap16">
        <div>
          <h1 className="page-heading">My Timetable</h1>
          {classInfo && <span className="sv-tt-class">Class: {classInfo.class_name || "—"}{classInfo.section ? " (" + classInfo.section + ")" : ""}</span>}
        </div>
      </div>

      {/* Day tabs */}
      <div className="sv-days">
        {["All Days","Monday","Tuesday","Wednesday","Thursday","Friday"].map((day, i) => (
          <button key={day}
            onClick={() => setActiveDay(i === 0 ? "all" : String(i))}
            className={"sv-day" + (activeDay === (i === 0 ? "all" : String(i)) ? " sv-day--on" : "")}
          >{day}</button>
        ))}
      </div>

      {slots.length === 0 ? (
        <div className="empty-state">No timetable available for your class yet.</div>
      ) : (
        <div className="sv-scroll">
          <table className="sv-tt">
            <thead>
              <tr>
                <th className="sv-tt-timehead">Time</th>
                {days.map(d => (
                  <th key={d}>{DAYS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlotsAll.map(time => (
                <tr key={time}>
                  <td className="sv-tt-time">
                    {time}
                  </td>
                  {days.map(d => {
                    const s = slots.find(sl => String(sl.day_of_week)===d && (sl.start_time||"").slice(0,5)===time);
                    const c = s ? (subjColorMap[s.subject_id] || "sv-c0") : null;
                    return (
                      <td key={d} className="sv-tt-cell">
                        {s ? (
                          <div className={"sv-period " + c}>
                            <div className="sv-period-subj">{s.subject_name}</div>
                            <div className="sv-period-teach">{s.teacher_name}</div>
                            <div className="sv-period-time">
                              {(s.start_time||"").slice(0,5)} – {(s.end_time||"").slice(0,5)}
                            </div>
                          </div>
                        ) : <div className="sv-tt-none">—</div>}
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