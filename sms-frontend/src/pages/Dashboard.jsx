import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import HRDashboard          from "./HRDashboard";
import LibrarianDashboard    from "./LibrarianDashboard";
import ProcurementDashboard  from "./ProcurementDashboard";
import { useNavigate } from "react-router-dom";
import AnnouncementPanel from "../components/AnnouncementPanel";

export default function Dashboard() {
  const { user }      = useAuth();
  const role          = user?.roles?.[0] || "student";
  const [sub, setSub] = useState("overview");

  useEffect(() => {
    const handler = (e) => {
      const s = e.detail?.sub;
      if (s === "overview" || s === "actions" || s === "perms") setSub(s);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  const canManage = user?.permissions?.includes("announcement.manage") ||
                    user?.permissions?.includes("announcement.create") ||
                    ["superadmin","admin","principal","academic_coordinator"].includes(role);

  return (
    <div>
      {sub === "overview" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, alignItems:"start" }}>
          <div><OverviewTab user={user} role={role} /></div>
          <div style={{ position:"sticky", top:8, height:"calc(100vh - 180px)" }}>
            <AnnouncementPanel canManage={canManage} />
          </div>
        </div>
      )}
      {sub === "actions"  && <ActionsTab  role={role} />}
      {sub === "perms"    && <PermsTab    user={user} />}
    </div>
  );
}

function OverviewTab({ user, role }) {
  if (role === "hr")          return <HRDashboard />;
  if (role === "librarian")   return <LibrarianDashboard />;
  if (role === "procurement") return <ProcurementDashboard />;
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

  const today = new Date().getDay();
  const dayMap = {1:"1",2:"2",3:"3",4:"4",5:"5"};
  const todaySlots = timetable.filter(s => String(s.day_of_week)===dayMap[today]).sort((a,b)=>a.start_time>b.start_time?1:-1);
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Today&apos;s Schedule — {dayNames[today]}</span>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => navigate("/timetable")}>View Full →</button>
        </div>
        {todaySlots.length === 0 ? (
          <div className="empty-state">{today===0||today===6 ? "No school today — enjoy your weekend! 🎉" : "No periods scheduled for today."}</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {todaySlots.map((s,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 12px", background:"#f8fafc", borderRadius:8, borderLeft:"3px solid #2563eb" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#2563eb", minWidth:50 }}>{(s.start_time||"").slice(0,5)}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{s.subject_name}</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>{s.teacher_name}</div>
                </div>
                <div style={{ fontSize:11, color:"#94a3b8" }}>{(s.end_time||"").slice(0,5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ParentDashboard({ user }) {
  const [children, setChildren] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyChildren().then(r => setChildren(r.data.data || [])).catch(() => {});
    });
  }, []);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
        {children.map(c => (
          <div key={c.id} style={{ background:"var(--color-background-primary)", border:"1px solid var(--color-border-tertiary)", borderRadius:12, padding:16, cursor:"pointer" }} onClick={() => navigate("/children")}>
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
      {children.length === 0 && <div className="empty-state">No children enrolled yet.</div>}
    </div>
  );
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

function ActionsTab({ role }) {
  const navigate = useNavigate();
  const { can }  = useAuth();

  const ALL_ACTIONS = [
    { label:"Enroll New Student",  path:"/students",  desc:"Add a student to the system",       perm:"students.create" },
    { label:"Add New Teacher",     path:"/teachers",  desc:"Register a new teacher",             perm:"teachers.create" },
    { label:"Manage Users",        path:"/users",     desc:"Create and manage user accounts",    perm:"users.create" },
    { label:"Manage Roles",        path:"/roles",     desc:"Configure role permissions",         perm:"roles.manage" },
    { label:"Academic Settings",   path:"/academics", desc:"Manage classes and subjects",        perm:"academics.manage" },
    { label:"System Settings",     path:"/settings",  desc:"Configure ID formats and school info",perm:"settings.manage" },
    { label:"Mark Attendance",     path:"/attendance",desc:"Record today attendance",            perm:"attendance.create", role:"teacher" },
    { label:"View My Classes",     path:"/classes",   desc:"See your assigned classes",          perm:"classes.view",   role:"teacher" },
    { label:"Enter Grades",        path:"/grades",    desc:"Enter student grades",               perm:"grades.enter",   role:"teacher" },
    { label:"Finance Dashboard",   path:"/finance",   desc:"Manage fees and payments",           perm:"finance.view" },
    { label:"Generate Invoices",   path:"/finance",   desc:"Bulk generate monthly invoices",     perm:"finance.bulk" },
  ];

  const items = ALL_ACTIONS.filter(a => can(a.perm) && (!a.role || a.role === role));

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:12 }}>
      {items.map(a => (
        <div
          key={a.label}
          className="section-card"
          style={{ cursor:"pointer" }}
          onClick={() => navigate(a.path)}
        >
          <div style={{ fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:4 }}>{a.label}</div>
          <div style={{ fontSize:12, color:"#94a3b8" }}>{a.desc}</div>
          <div style={{ fontSize:12, color:"#2563eb", marginTop:8, fontWeight:600 }}>Go now</div>
        </div>
      ))}
    </div>
  );
}

function PermsTab({ user }) {
  const perms = user?.permissions || [];

  const grouped = perms.reduce((acc, p) => {
    const module = p.split(".")[0] || "other";
    if (!acc[module]) acc[module] = [];
    acc[module].push(p);
    return acc;
  }, {});

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Your Permissions</span>
        <span className="badge badge-gray">{perms.length} total</span>
      </div>
      {perms.length === 0 ? (
        <div className="empty-state">No permissions assigned.</div>
      ) : (
        Object.entries(grouped).map(([module, items]) => (
          <div key={module} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#2563eb", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>
              {module}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {items.map(p => (
                <span key={p} className="badge badge-gray">{p}</span>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}