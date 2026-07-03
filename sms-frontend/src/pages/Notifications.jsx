import { useState, useEffect } from "react";
import notificationsApi from "../api/notificationsApi";

const TYPE_STYLES = {
  reminder: { bg:"#fffbeb", dot:"#f59e0b", border:"#fde68a" },
  success:  { bg:"#f0fdf4", dot:"#22c55e", border:"#bbf7d0" },
  info:     { bg:"#eff6ff", dot:"#2563eb", border:"#bfdbfe" },
  warning:  { bg:"#fffbeb", dot:"#f59e0b", border:"#fde68a" },
  danger:   { bg:"#fef2f2", dot:"#ef4444", border:"#fecaca" },
  default:  { bg:"#f8fafc", dot:"#94a3b8", border:"#e2e8f0" },
};

export default function Notifications() {
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all"); // all | unread | read

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = () => {
    setLoading(true);
    notificationsApi.getAll()
      .then(r => setNotifs(r.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  const handleRead = async (id) => {
    await notificationsApi.markRead(id);
    setNotifs(prev => prev.map(n => n.id===id ? {...n, is_read:true} : n));
  };

  const handleReadAll = async () => {
    await notificationsApi.markAllRead();
    setNotifs(prev => prev.map(n => ({...n, is_read:true})));
  };

  const handleDelete = async (id) => {
    await notificationsApi.remove(id);
    setNotifs(prev => prev.filter(n => n.id!==id));
  };

  const filtered = notifs.filter(n => {
    if (filter==="unread") return !n.is_read;
    if (filter==="read")   return n.is_read;
    return true;
  });

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <div>
      <div className="page-header">
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <h1 className="page-heading">Notifications</h1>
          {unreadCount > 0 && <span className="badge badge-danger">{unreadCount} unread</span>}
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-ghost" onClick={handleReadAll} style={{ fontSize:13 }}>
            ✓ Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:16, borderBottom:"1px solid #e2e8f0" }}>
        {["all","unread","read"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:"8px 18px", fontSize:13, fontWeight:500, border:"none", cursor:"pointer",
              background:"transparent", textTransform:"capitalize",
              color: filter===f ? "#2563eb" : "#64748b",
              borderBottom: filter===f ? "2px solid #2563eb" : "2px solid transparent",
              marginBottom:-1 }}>
            {f} {f==="unread" && unreadCount>0 ? `(${unreadCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-state">Loading...</div> : filtered.length===0 ? (
        <div className="section-card"><div className="empty-state">No {filter==="all"?"":filter} notifications.</div></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(n => {
            const sty = TYPE_STYLES[n.type] || TYPE_STYLES.default;
            return (
              <div key={n.id} style={{ background: n.is_read ? "#fff" : sty.bg, border:"1px solid "+(n.is_read?"#e2e8f0":sty.border), borderRadius:10, padding:"14px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background: n.is_read?"#e2e8f0":sty.dot, flexShrink:0, marginTop:4 }} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                    <div style={{ fontWeight: n.is_read?500:700, fontSize:14, color:"#0f172a" }}>{n.title}</div>
                    <div style={{ fontSize:11, color:"#94a3b8", whiteSpace:"nowrap", marginLeft:12 }}>
                      {new Date(n.created_at).toLocaleString("en-PK",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                  {n.message && <div style={{ fontSize:13, color:"#64748b", lineHeight:1.5 }}>{n.message}</div>}
                  <div style={{ display:"flex", gap:10, marginTop:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, padding:"2px 8px", background:sty.bg, color:sty.dot, borderRadius:20, border:"1px solid "+sty.border, textTransform:"capitalize" }}>{n.type||"info"}</span>
                    {!n.is_read && (
                      <button onClick={() => handleRead(n.id)} style={{ fontSize:11, color:"#2563eb", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>Mark read</button>
                    )}
                    <button onClick={() => handleDelete(n.id)} style={{ fontSize:11, color:"#ef4444", background:"none", border:"none", cursor:"pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}