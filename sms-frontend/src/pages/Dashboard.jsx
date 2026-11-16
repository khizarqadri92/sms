import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useNavigate } from "react-router-dom";
import AnnouncementPanel from "../components/AnnouncementPanel";
import PrincipalDashboard from "./dashboards/PrincipalDashboard";
import CoordinatorDashboard from "./dashboards/CoordinatorDashboard";
import TeacherDashboard from "./dashboards/TeacherDashboard";
import StudentInsights from "./dashboards/StudentInsights";
import AdminOverview from "./dashboards/AdminOverview";
import FinanceDashboard from "./dashboards/FinanceDashboard";
import HRInsights from "./dashboards/HRInsights";
import LibraryInsights from "./dashboards/LibraryInsights";
import ProcurementInsights from "./dashboards/ProcurementInsights";
import AdmissionDashboard from "./AdmissionDashboard";
import AdmissionBannerPopup from "./AdmissionBannerPopup";
import "./StudentViews.css";

export default function Dashboard() {
  const { user }      = useAuth();
  const role          = user?.roles?.[0] || "student";
  const canManage = user?.permissions?.includes("announcement.manage") ||
                    user?.permissions?.includes("announcement.create") ||
                    ["superadmin","admin","principal","academic_coordinator"].includes(role);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, alignItems:"start" }}>
      <AdmissionBannerPopup />
      <div><OverviewTab user={user} role={role} /></div>
      <div style={{ position:"sticky", top:8, height:"calc(100vh - 180px)" }}>
        <AnnouncementPanel canManage={canManage} />
      </div>
    </div>
  );
}

function OverviewTab({ user, role }) {
  if (role === "hr")          return <HRInsights />;
  if (role === "librarian")   return <LibraryInsights />;
  if (role === "procurement") return <ProcurementInsights />;
  if (role === "admission_staff") return <AdmissionDashboard embedded />;
  if (role === "principal")            return <PrincipalDashboard />;
  if (role === "academic_coordinator") return <CoordinatorDashboard />;
  if (role === "teacher")              return <TeacherDashboard />;
  if (role === "admin" || role === "superadmin") return <AdminOverview />;
  if (role === "finance_officer")      return <FinanceDashboard />;
  if (role === "student") return <StudentDashboard user={user} />;
  if (role === "parent")  return <ParentDashboard  user={user} />;
  return <AdminDashboard user={user} role={role} />;
}

function StatCard({ label, value, color="#2563eb", icon }) {
  return (
    <div style={{ background:"var(--color-background-primary)", border:"1px solid var(--color-border-tertiary)", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:44, height:44, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color:"var(--color-text-primary)" }}>{value}</div>
        <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginTop:2 }}>{label}</div>
      </div>
    </div>
  );
}

function StudentDashboard({ user }) {
  const [profile,   setProfile]   = useState(null);
  const [timetable, setTimetable] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyProfile().then(r => {
        const p = r.data.data;
        setProfile(p);
        if (p?.class_id) {
          import("../api/academicsApi").then(a => {
            a.default.getTimetable({ class_id: p.class_id })
              .then(r2 => setTimetable(r2.data.data || []));
          });
        }
      }).catch(() => {});
    });
  }, []);

  const processingToday = useProcessingToday();
  const today = new Date(processingToday).getDay();
  const dayMap = {1:"1",2:"2",3:"3",4:"4",5:"5"};
  const todaySlots = timetable.filter(s => String(s.day_of_week)===dayMap[today]).sort((a,b)=>a.start_time>b.start_time?1:-1);
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return (
    <StudentInsights>
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Today&apos;s Schedule — {dayNames[today]}</span>
          <button className="btn btn-ghost sv-link-btn" onClick={() => navigate("/timetable")}>View Full →</button>
        </div>
        {todaySlots.length === 0 ? (
          <div className="empty-state">{today===0||today===6 ? "No school today — enjoy your weekend! 🎉" : "No periods scheduled for today."}</div>
        ) : (
          <div className="sv-today-list">
            {todaySlots.map((s,i) => (
              <div key={i} className="sv-today-slot">
                <div className="sv-today-start">{(s.start_time||"").slice(0,5)}</div>
                <div className="sv-today-main">
                  <div className="sv-today-subj">{s.subject_name}</div>
                  <div className="sv-today-teach">{s.teacher_name}</div>
                </div>
                <div className="sv-today-end">{(s.end_time||"").slice(0,5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentInsights>
  );
}

function ParentDashboard({ user }) {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState(null);   // child whose dashboard is shown
  const navigate = useNavigate();

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyChildren().then(r => {
        const kids = (r.data.data || []).filter(c => c.status !== "withdrawn");
        setChildren(kids);
        if (kids.length) setSelectedId(kids[0].id);
      }).catch(() => {});
    });
  }, []);

  const cards = (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
        {children.map(c => (
          <div key={c.id} className={"dk-child-card"+(selectedId===c.id?" dk-child-card--on":"")} title="Show this child's dashboard" style={{ background:"var(--color-background-primary)", border:"1px solid var(--color-border-tertiary)", borderRadius:12, padding:16, cursor:"pointer" }} onClick={() => setSelectedId(c.id)}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color:"#2563eb" }}>
                {(c.first_name||"?")[0]}{(c.last_name||"")[0]}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:11, color:"#64748b" }}>{c.class_name}{c.class_section?" ("+c.class_section+")":""}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <span className="badge badge-primary" style={{ fontSize:10 }}>{c.enrollment_no}</span>
              <span className={"badge "+(c.status==="active"?"badge-success":"badge-warning")} style={{ fontSize:10 }}>{c.status}</span>
            </div>
          </div>
        ))}
      </div>
  );
  if (children.length === 0) return <div className="empty-state">No children enrolled yet.</div>;
  // banner first, then the children cards (click to switch child), then the selected child's charts
  return selectedId ? <StudentInsights parent childId={selectedId}>{cards}</StudentInsights> : cards;
}

function AdminDashboard({ user, role }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Account Info</span>
          <span className="badge badge-primary">{role.replace("_"," ")}</span>
        </div>
        {[["Full Name",user?.name||"N/A"],["Email",user?.email||"N/A"],["Role",role.replace("_"," ")],["Permissions",(user?.permissions?.length||0)+" granted"]].map(([label,value]) => (
          <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
            <span style={{ color:"#94a3b8", fontWeight:500 }}>{label}</span>
            <span style={{ color:"#0f172a", fontWeight:600 }}>{value}</span>
          </div>
        ))}
      </div>
      <div className="section-card">
        <div className="section-card-header"><span className="section-card-title">System Info</span></div>
        {[["System","School Management System"],["Version","1.0.0"],["Academic Year","2025-2026"],["Status","Active"]].map(([label,value]) => (
          <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
            <span style={{ color:"#94a3b8", fontWeight:500 }}>{label}</span>
            <span style={{ color:"#0f172a", fontWeight:600 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

