import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../auth/ThemeContext";
import announcementsApi from "../api/announcementsApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "./DatePicker";
import "./AnnouncementPanel.css";

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
  const { theme, colorMode }        = useTheme();
  const [anns,       setAnns]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("all");
  const [selAnn,     setSelAnn]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const listRef                     = useRef(null);
  const rafRef                      = useRef(null);
  const posRef                      = useRef(0);
  const pausedRef                   = useRef(false);
  const navBg = theme?.primary ? darkenColor(theme.primary, colorMode === "dark" ? 195 : 50) : "#1e3a5f";
  const navigate = useNavigate();

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
    if(!a.is_read){
      announcementsApi.markRead(a.id).catch(()=>{});
      setAnns(prev=>prev.map(x=>x.id===a.id?{...x,is_read:true}:x));
    }
    // a post that links somewhere (e.g. the admission announcement) opens that page
    if(a.link){ navigate(a.link); return; }
    setSelAnn(a);
  };

  const filtered = anns.filter(a=>{
    if(tab==="unread") return !a.is_read;
    if(tab==="system") return a.ann_type==="system";
    return true;
  });
  const unread = anns.filter(a=>!a.is_read).length;

  return (
    <div className="ann-panel-container">

      {/* Header */}
      <div className="ann-panel-header" style={{ background: navBg }}>
        <div className="ann-panel-header-row">
          <div className="ann-panel-header-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span className="ann-panel-title">News & Announcements</span>
            {unread>0 && (
              <span className="ann-panel-unread-badge">{unread}</span>
            )}
          </div>
          {canManage && (
            <button onClick={()=>setShowCreate(true)} className="ann-panel-add-btn">
              + Add
            </button>
          )}
        </div>
        {/* Tabs */}
        <div className="ann-panel-tabs">
          {[["all","All"],["unread","Unread"],["system","System"]].map(([val,label])=>(
            <button key={val} onClick={()=>setTab(val)} className="ann-panel-tab"
              style={{
                color: tab===val?"#fff":"rgba(255,255,255,0.5)",
                borderBottom: tab===val?"2px solid #60a5fa":"2px solid transparent",
              }}>
              {label}
              {val==="unread" && unread>0 && (
                <span className="ann-panel-tab-badge">{unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div ref={listRef}
        onMouseEnter={()=>{ pausedRef.current=true; }}
        onMouseLeave={()=>{ pausedRef.current=false; }}
        className="ann-panel-list">
        {loading ? (
          <div className="ann-panel-empty">Loading...</div>
        ) : filtered.length===0 ? (
          <div className="ann-panel-empty">
            {tab==="unread"?"All caught up! No unread announcements.":"No announcements yet."}
          </div>
        ) : (
          /* Triplicate for seamless loop with spacer between sets */
          [0,1,2].flatMap(si => [
            ...filtered.map((a,i) => {
              const cfg = getCfg(a);
              return (
                <div key={si+"-"+i} onClick={()=>handleClick(a)} className="ann-item"
                  style={{ background: !a.is_read ? (colorMode === "dark" ? cfg.color+"26" : cfg.light+"80") : "var(--bg-card)" }}
                  onMouseEnter={e=>e.currentTarget.style.background = colorMode === "dark" ? cfg.color+"40" : cfg.light}
                  onMouseLeave={e=>e.currentTarget.style.background = !a.is_read ? (colorMode === "dark" ? cfg.color+"26" : cfg.light+"80") : "var(--bg-card)"}>
                  {/* Colored dot */}
                  <div className="ann-item-dot-col">
                    <div className="ann-item-dot" style={{ background: cfg.color }} />
                    <div className="ann-item-dot-line" />
                  </div>
                  {/* Content */}
                  <div className="ann-item-content">
                    <div className="ann-item-title-row">
                      <div className="ann-item-title" style={{ fontWeight: a.is_read?400:600 }}>
                        {a.title}
                      </div>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:20, flexShrink:0,
                        background:cfg.light, color:cfg.color, fontWeight:500, border:"1px solid "+cfg.color+"30" }}>
                        {a.ann_type==="system"?"System":cfg.label}
                      </span>
                    </div>
                    <div className="ann-item-body">
                      {a.body}
                    </div>
                    <div className="ann-item-meta">
                      <span>{formatDate(a.created_at)}</span>
                      {a.creator_name && a.ann_type!=="system" && <><span>·</span><span>{a.creator_name}</span></>}
                      {!a.is_read && (
                        <span className="ann-item-new-badge">● NEW</span>
                      )}
                      {a.link && <span style={{ color:"var(--theme-primary, #2563eb)", fontWeight:600 }}>{a.link_label || "Open"} →</span>}
                    </div>
                  </div>
                </div>
              );
            }),
            /* Spacer between sets - one item height gap */
            <div key={"spacer-"+si} className="ann-spacer">
              <div className="ann-spacer-inner">
                <div className="ann-spacer-line" />
                <span className="ann-spacer-label">
                  latest news
                </span>
                <div className="ann-spacer-line" />
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
    <div className="ann-modal-overlay">
      <div className="ann-modal">
        <div className="ann-modal-stripe" style={{ background: cfg.color }} />
        <div className="ann-modal-header">
          <div className="ann-modal-header-info">
            <div className="ann-modal-badges-row">
              <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20,
                background:cfg.light, color:cfg.color, fontWeight:600, border:"1px solid "+cfg.color+"30" }}>
                {ann.ann_type==="system"?"⚙ System":cfg.label}
              </span>
              {ann.target_role!=="all" && (
                <span className="ann-modal-audience-badge">→ {ann.target_role}</span>
              )}
            </div>
            <div className="ann-modal-title">{ann.title}</div>
            <div className="ann-modal-meta">
              {formatDate(ann.created_at)}
              {ann.creator_name && ann.ann_type!=="system" && " · "+ann.creator_name}
            </div>
          </div>
          <button onClick={onClose} className="ann-modal-close-btn">×</button>
        </div>
        <div className="ann-modal-body">
          <div className="ann-modal-body-text">{ann.body}</div>
          {ann.attachment && (
            <div className="ann-modal-attachment">
              <a href={ann.attachment} target="_blank" rel="noreferrer" className="ann-modal-attachment-link">
                📎 View Attachment
              </a>
            </div>
          )}
        </div>
        {canManage && ann.ann_type!=="system" && (
          <div className="ann-modal-footer">
            <button onClick={async()=>{ if(window.confirm("Delete?")){ await announcementsApi.remove(ann.id); onDeleted(); }}}
              className="ann-modal-delete-btn">
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

  return (
    <div className="ann-modal-overlay ann-modal-overlay-create">
      <div className="ann-modal">
        <div className="ann-modal-header ann-modal-header-center">
          <div className="ann-modal-title-sm">New Announcement</div>
          <button onClick={onClose} className="ann-modal-close-btn">×</button>
        </div>
        <div className="ann-create-body">
          {err && <div className="ann-create-error">{err}</div>}
          <div>
            <label className="ann-create-label">Title *</label>
            <input className="ann-create-input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
              placeholder="Announcement title..." />
          </div>
          <div>
            <label className="ann-create-label">Message *</label>
            <textarea className="ann-create-input ann-create-textarea"
              value={form.body} onChange={e=>setForm({...form,body:e.target.value})}
              placeholder="Write your announcement..." />
          </div>
          <div className="ann-create-grid-2">
            <div>
              <label className="ann-create-label">Priority</label>
              <select className="ann-create-input" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>
                <option value="normal">🔵 Normal</option>
                <option value="important">🟡 Important</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            <div>
              <label className="ann-create-label">Audience</label>
              <select className="ann-create-input" value={form.target_role} onChange={e=>setForm({...form,target_role:e.target.value})}>
                <option value="all">All Users</option>
                <option value="teacher">Teachers</option>
                <option value="student">Students</option>
                <option value="parent">Parents</option>
                <option value="finance_officer">Finance</option>
              </select>
            </div>
          </div>
          <div className="ann-create-grid-2">
            <div>
              <label className="ann-create-label">Class <span className="ann-create-label-optional">(optional)</span></label>
              <select className="ann-create-input" value={form.target_class} onChange={e=>setForm({...form,target_class:e.target.value})}>
                <option value="">All Classes</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            </div>
            <div>
              <label className="ann-create-label">Expires <span className="ann-create-label-optional">(optional)</span></label>
              <DatePicker value={form.end_date}
                onChange={val=>setForm({...form,end_date:val})} />
            </div>
          </div>
        </div>
        <div className="ann-modal-footer ann-modal-footer-gap">
          <button onClick={onClose} className="ann-create-cancel-btn">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="ann-create-publish-btn"
            style={{ cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}>
            {saving ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}