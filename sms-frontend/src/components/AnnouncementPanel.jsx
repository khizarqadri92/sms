import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../auth/ThemeContext";
import announcementsApi from "../api/announcementsApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "./DatePicker";

function darkenColor(hex, amount=40) {
  try {
    const h=hex.replace("#","");
    const r=Math.max(0,parseInt(h.slice(0,2),16)-amount);
    const g=Math.max(0,parseInt(h.slice(2,4),16)-amount);
    const b=Math.max(0,parseInt(h.slice(4,6),16)-amount);
    return "#"+[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join("");
  } catch { return "#1e3a5f"; }
}

const PCFG = {
  urgent:    { color:"#dc2626", light:"#fef2f2", label:"Urgent"    },
  important: { color:"#d97706", light:"#fffbeb", label:"Important" },
  normal:    { color:"#2563eb", light:"#eff6ff", label:"Normal"    },
  system:    { color:"#7c3aed", light:"#f5f3ff", label:"System"    },
};
const getCfg = (a) => a.ann_type==="system" ? PCFG.system : (PCFG[a.priority]||PCFG.normal);

export default function AnnouncementPanel({ canManage }) {
  const { formatDate } = useRegionalSettings();
  const { theme }                   = useTheme();
  const [anns,       setAnns]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("all");
  const [selAnn,     setSelAnn]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const listRef                     = useRef(null);
  const rafRef                      = useRef(null);
  const posRef                      = useRef(0);
  const pausedRef                   = useRef(false);
  const navBg = theme?.primary ? darkenColor(theme.primary, 50) : "#1e3a5f";

  const load = () => {
    announcementsApi.list().then(r=>{setAnns(r.data.data||[]);setLoading(false);}).catch(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  // Auto-scroll
  useEffect(()=>{
    const el = listRef.current;
    if(!el) return;
    const scroll = () => {
      if(!pausedRef.current){
        posRef.current += 0.4;
        const max = el.scrollHeight - el.clientHeight;
        if(max <= 0){ posRef.current = 0; }
        else if(posRef.current >= max){ posRef.current = 0; }
        el.scrollTop = posRef.current;
      }
      rafRef.current = requestAnimationFrame(scroll);
    };
    rafRef.current = requestAnimationFrame(scroll);
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[anns, tab]);

  const handleClick = async (a) => {
    setSelAnn(a);
    if(!a.is_read){
      await announcementsApi.markRead(a.id);
      setAnns(prev=>prev.map(x=>x.id===a.id?{...x,is_read:true}:x));
    }
  };

  const filtered = anns.filter(a=>{
    if(tab==="unread") return !a.is_read;
    if(tab==="system") return a.ann_type==="system";
    return true;
  });
  const unread = anns.filter(a=>!a.is_read).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#fff",
      border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>

      {/* Header */}
      <div style={{ background:navBg, padding:"10px 14px 0", flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span style={{ fontSize:12, fontWeight:600, color:"#fff" }}>News & Announcements</span>
            {unread>0 && (
              <span style={{ fontSize:10, background:"#ef4444", color:"#fff", borderRadius:20,
                padding:"1px 7px", fontWeight:600 }}>{unread}</span>
            )}
          </div>
          {canManage && (
            <button onClick={()=>setShowCreate(true)}
              style={{ fontSize:11, background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)",
                borderRadius:6, padding:"3px 10px", cursor:"pointer", color:"#fff", fontWeight:500 }}>
              + Add
            </button>
          )}
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", gap:0 }}>
          {[["all","All"],["unread","Unread"],["system","System"]].map(([val,label])=>(
            <button key={val} onClick={()=>setTab(val)}
              style={{ fontSize:10, fontWeight:500, padding:"5px 12px", border:"none", cursor:"pointer",
                background:"transparent", color: tab===val?"#fff":"rgba(255,255,255,0.5)",
                borderBottom: tab===val?"2px solid #60a5fa":"2px solid transparent",
                marginBottom:-1 }}>
              {label}
              {val==="unread" && unread>0 && (
                <span style={{ marginLeft:4, fontSize:9, background:"rgba(255,255,255,0.25)",
                  borderRadius:10, padding:"0 5px" }}>{unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div ref={listRef}
        onMouseEnter={()=>{ pausedRef.current=true; }}
        onMouseLeave={()=>{ pausedRef.current=false; }}
        style={{ flex:1, overflowY:"hidden" }}>
        {loading ? (
          <div style={{ padding:"24px", textAlign:"center", color:"#94a3b8", fontSize:12 }}>Loading...</div>
        ) : filtered.length===0 ? (
          <div style={{ padding:"24px", textAlign:"center", color:"#94a3b8", fontSize:12 }}>
            {tab==="unread"?"All caught up! No unread announcements.":"No announcements yet."}
          </div>
        ) : (
          /* Triplicate for seamless loop with spacer between sets */
          [0,1,2].flatMap(si => [
            ...filtered.map((a,i) => {
              const cfg = getCfg(a);
              return (
                <div key={si+"-"+i} onClick={()=>handleClick(a)}
                  style={{ display:"flex", gap:10, padding:"10px 14px",
                    borderBottom:"1px solid #f1f5f9", cursor:"pointer",
                    background: !a.is_read ? cfg.light+"80" : "#fff" }}
                  onMouseEnter={e=>e.currentTarget.style.background=cfg.light}
                  onMouseLeave={e=>e.currentTarget.style.background=!a.is_read?cfg.light+"80":"#fff"}>
                  {/* Colored dot */}
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", paddingTop:4, flexShrink:0 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.color, flexShrink:0 }} />
                    <div style={{ width:1, flex:1, background:"#e2e8f0", marginTop:4 }} />
                  </div>
                  {/* Content */}
                  <div style={{ flex:1, minWidth:0, paddingBottom:2 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                      <div style={{ fontSize:12, fontWeight: a.is_read?400:600, color:"#1e3a5f",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                        {a.title}
                      </div>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20, flexShrink:0,
                        background:cfg.light, color:cfg.color, fontWeight:500, border:"1px solid "+cfg.color+"30" }}>
                        {a.ann_type==="system"?"System":cfg.label}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {a.body}
                    </div>
                    <div style={{ fontSize:10, color:"#94a3b8", marginTop:4, display:"flex", gap:6, alignItems:"center" }}>
                      <span>{formatDate(a.created_at)}</span>
                      {a.creator_name && a.ann_type!=="system" && <><span>·</span><span>{a.creator_name}</span></>}
                      {!a.is_read && (
                        <span style={{ marginLeft:"auto", fontSize:9, color:"#2563eb", fontWeight:600 }}>● NEW</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            }),
            /* Spacer between sets - one item height gap */
            <div key={"spacer-"+si} style={{ height:60, display:"flex", alignItems:"center",
              justifyContent:"center", borderBottom:"1px solid #f1f5f9" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:40, height:1, background:"#e2e8f0" }} />
                <span style={{ fontSize:10, color:"#cbd5e1", fontWeight:500, letterSpacing:"0.08em" }}>
                  latest news
                </span>
                <div style={{ width:40, height:1, background:"#e2e8f0" }} />
              </div>
            </div>
          ])
        )}
      </div>

      {selAnn && <AnnDetailModal ann={selAnn} canManage={canManage}
        onClose={()=>setSelAnn(null)} onDeleted={()=>{setSelAnn(null);load();}} />}
      {showCreate && <CreateAnnModal onClose={()=>setShowCreate(false)}
        onCreated={()=>{setShowCreate(false);load();}} />}
    </div>
  );
}

/* ── Detail Modal ─────────────────────────────────────────────── */
function AnnDetailModal({ ann, canManage, onClose, onDeleted }) {
  const { formatDate } = useRegionalSettings();
  const cfg = getCfg(ann);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:520, overflow:"hidden" }}>
        <div style={{ height:4, background:cfg.color }} />
        <div style={{ padding:"18px 22px", borderBottom:"1px solid #f1f5f9",
          display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20,
                background:cfg.light, color:cfg.color, fontWeight:600, border:"1px solid "+cfg.color+"30" }}>
                {ann.ann_type==="system"?"⚙ System":cfg.label}
              </span>
              {ann.target_role!=="all" && (
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20,
                  background:"#f1f5f9", color:"#475569" }}>→ {ann.target_role}</span>
              )}
            </div>
            <div style={{ fontWeight:700, fontSize:16, color:"#1e3a5f" }}>{ann.title}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
              {formatDate(ann.created_at)}
              {ann.creator_name && ann.ann_type!=="system" && " · "+ann.creator_name}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"#f8fafc", border:"1px solid #e2e8f0",
            borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:18, color:"#64748b", flexShrink:0 }}>×</button>
        </div>
        <div style={{ padding:"16px 22px", maxHeight:300, overflowY:"auto" }}>
          <div style={{ fontSize:14, color:"#374151", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{ann.body}</div>
          {ann.attachment && (
            <div style={{ marginTop:14, padding:"10px 14px", background:"#f8fafc",
              border:"1px solid #e2e8f0", borderRadius:8 }}>
              <a href={ann.attachment} target="_blank" rel="noreferrer"
                style={{ fontSize:13, color:"#2563eb", fontWeight:600, textDecoration:"none" }}>
                📎 View Attachment
              </a>
            </div>
          )}
        </div>
        {canManage && ann.ann_type!=="system" && (
          <div style={{ padding:"12px 22px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"flex-end" }}>
            <button onClick={async()=>{ if(window.confirm("Delete?")){ await announcementsApi.remove(ann.id); onDeleted(); }}}
              style={{ padding:"7px 16px", fontSize:12, fontWeight:600, background:"#fef2f2",
                border:"1px solid #fecaca", borderRadius:8, cursor:"pointer", color:"#dc2626" }}>
              🗑 Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Create Modal ─────────────────────────────────────────────── */
function CreateAnnModal({ onClose, onCreated }) {
  const processingToday = useProcessingToday();
  const [form,    setForm]    = useState({
    title:"", body:"", priority:"normal", target_role:"all",
    target_class:"", start_date:new Date().toISOString().split("T")[0], end_date:""
  });
  useEffect(() => { setForm(f => ({ ...f, start_date: processingToday })); }, [processingToday]);
  const [classes, setClasses] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  useEffect(()=>{
    import("../api/academicsApi").then(({default:aApi})=>{
      aApi.getClasses().then(r=>setClasses(r.data.data||[])).catch(()=>{});
    });
  },[]);

  const handleSave = async () => {
    if(!form.title.trim()||!form.body.trim()){ setErr("Title and message required."); return; }
    if(saving) return;
    setSaving(true); setErr("");
    try {
      await announcementsApi.create({ ...form, target_class:form.target_class||null, end_date:form.end_date||null });
      onCreated();
    } catch(e){ setErr(e.response?.data?.message||"Failed."); setSaving(false); }
  };

  const inputStyle = { width:"100%", padding:"8px 12px", fontSize:13, border:"1px solid #e2e8f0",
    borderRadius:8, outline:"none", fontFamily:"inherit", color:"#1e3a5f", boxSizing:"border-box",
    background:"#fff" };
  const labelStyle = { display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:1001, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:520 }}>
        <div style={{ padding:"18px 22px", borderBottom:"1px solid #f1f5f9",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f" }}>New Announcement</div>
          <button onClick={onClose} style={{ background:"#f8fafc", border:"1px solid #e2e8f0",
            borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:18, color:"#64748b" }}>×</button>
        </div>
        <div style={{ padding:"18px 22px", display:"flex", flexDirection:"column", gap:14 }}>
          {err && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8,
            padding:"10px 12px", fontSize:13, color:"#dc2626" }}>{err}</div>}
          <div>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
              placeholder="Announcement title..." />
          </div>
          <div>
            <label style={labelStyle}>Message *</label>
            <textarea style={{...inputStyle, resize:"vertical", minHeight:90, lineHeight:1.6}}
              value={form.body} onChange={e=>setForm({...form,body:e.target.value})}
              placeholder="Write your announcement..." />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={labelStyle}>Priority</label>
              <select style={inputStyle} value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>
                <option value="normal">🔵 Normal</option>
                <option value="important">🟡 Important</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Audience</label>
              <select style={inputStyle} value={form.target_role} onChange={e=>setForm({...form,target_role:e.target.value})}>
                <option value="all">All Users</option>
                <option value="teacher">Teachers</option>
                <option value="student">Students</option>
                <option value="parent">Parents</option>
                <option value="finance_officer">Finance</option>
              </select>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={labelStyle}>Class <span style={{ fontWeight:400, color:"#94a3b8" }}>(optional)</span></label>
              <select style={inputStyle} value={form.target_class} onChange={e=>setForm({...form,target_class:e.target.value})}>
                <option value="">All Classes</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expires <span style={{ fontWeight:400, color:"#94a3b8" }}>(optional)</span></label>
              <DatePicker style={inputStyle} value={form.end_date}
                onChange={val=>setForm({...form,end_date:val})} />
            </div>
          </div>
        </div>
        <div style={{ padding:"14px 22px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"8px 18px", fontSize:13, background:"#f8fafc",
            border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", color:"#64748b", fontWeight:500 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:"8px 20px", fontSize:13, fontWeight:600, background:"#1e3a5f",
              color:"#fff", border:"none", borderRadius:8, cursor:saving?"not-allowed":"pointer",
              opacity:saving?0.7:1 }}>
            {saving ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}