import { useState, useEffect } from "react";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import client from "../api/client";
import academicsApi from "../api/academicsApi";
import campusesApi from "../api/campusesApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import "./Announcements.css";

const today = () => new Date().toISOString().split("T")[0];
const futureDate = (days=30) => { const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().split("T")[0]; };

export default function Announcements() {
  const processingToday = useProcessingToday();
  const { user } = useAuth();
  const role = effectiveRole(user)||"";
  const isSuperAdmin = (user?.roles||[]).includes("superadmin");
  const [announcements, setAnnouncements] = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [campuses,      setCampuses]      = useState([]);
  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [form, setForm] = useState({
    title:"", body:"", type:"info", priority:"normal",
    target_role:"all", target_class:"", link:"", link_label:"View",
    start_date:today(), end_date:futureDate(30), target_campus_ids:[]
  });
  useEffect(() => {
    const d = new Date(processingToday); d.setDate(d.getDate()+30);
    setForm(f => ({ ...f, start_date: processingToday, end_date: d.toISOString().split("T")[0] }));
  }, [processingToday]);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    load();
    if (isSuperAdmin) campusesApi.list().then(r=>setCampuses(r.data.data||[])).catch(()=>{});
  },[]);

  useEffect(()=>{
    const singleCampusId = form.target_campus_ids.length===1 ? form.target_campus_ids[0] : null;
    academicsApi.getClasses(isSuperAdmin ? singleCampusId : null).then(r=>setClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
    if (isSuperAdmin && form.target_campus_ids.length!==1 && form.target_class) {
      setForm(f=>({...f, target_class:""}));
    }
  },[form.target_campus_ids.join(","), isSuperAdmin]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await client.get("/announcements/manage");
      setAnnouncements(r.data.data||[]);
    } catch(e){}
    finally { setLoading(false); }
  };

  const save = async () => {
    if(!form.title.trim()) return;
    setSaving(true);
    try {
      await client.post("/announcements/", {
        ...form,
        target_class: form.target_class ? Number(form.target_class) : null,
        target_campus_ids: form.target_campus_ids.length > 0 ? form.target_campus_ids : null,
      });
      setShowForm(false);
      const fd = new Date(processingToday); fd.setDate(fd.getDate()+30);
      setForm({title:"",body:"",type:"info",priority:"normal",target_role:"all",target_class:"",link:"",link_label:"View",start_date:processingToday,end_date:fd.toISOString().split("T")[0],target_campus_ids:[]});
      load();
    } catch(e){}
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if(!window.confirm("Delete this announcement?")) return;
    try { await client.delete(`/announcements/${id}`); load(); } catch(e){}
  };

  const toggleActive = async (a) => {
    try {
      await client.put(`/announcements/${a.id}`, {
        title: a.title, body: a.body, priority: a.priority, target_role: a.target_role,
        target_class: a.target_class, end_date: a.end_date, is_active: !a.is_active,
        target_campus_ids: a.target_campus_ids,
      });
      load();
    } catch(e){}
  };

  const typeColors = {
    info:   "#2563eb", exam:"#7c3aed", result:"#166534",
    urgent: "#ef4444", event:"#854d0e", general:"#374151"
  };
  const priorityBg = {normal:"var(--bg-card)",important:"var(--bg-warning-soft)",urgent:"var(--bg-danger-soft)"};

  return (
    <div className="ann-page">
      <div className="ann-header-row">
        <div>
          <div className="ann-title">Announcements</div>
          <div className="ann-subtitle">Manage news and announcements shown to users</div>
        </div>
        <button onClick={()=>setShowForm(true)} className="ann-new-btn">
          + New Announcement
        </button>
      </div>

      {/* Create Form */}
      {showForm&&(
        <div className="ann-form-card">
          <div className="ann-form-title">New Announcement</div>
          <div className="ann-form-grid">
            <div className="ann-field-full">
              <label className="ann-field-label">Title *</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Announcement title..." className="ann-full-input" />
            </div>
            <div className="ann-field-full">
              <label className="ann-field-label">Message</label>
              <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Announcement details..." rows={3} className="ann-full-input" style={{resize:"vertical"}} />
            </div>
            <div>
              <label className="ann-field-label">Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="ann-full-input">
                <option value="info">Info</option>
                <option value="exam">Exam</option>
                <option value="result">Result</option>
                <option value="event">Event</option>
                <option value="urgent">Urgent</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <label className="ann-field-label">Priority</label>
              <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className="ann-full-input">
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="ann-field-label">Target Audience</label>
              <select value={form.target_role} onChange={e=>setForm(f=>({...f,target_role:e.target.value}))} className="ann-full-input">
                <option value="all">Everyone</option>
                <option value="student">Students</option>
                <option value="parent">Parents</option>
                <option value="teacher">Teachers</option>
                <option value="principal">Principal</option>
                <option value="academic_coordinator">Coordinators</option>
              </select>
            </div>
            <div>
              <label className="ann-field-label">Target Class (optional)</label>
              <select value={form.target_class} onChange={e=>setForm(f=>({...f,target_class:e.target.value}))}
                disabled={isSuperAdmin && form.target_campus_ids.length!==1}
                className="ann-disabled-select"
                style={{ "--select-bg": (isSuperAdmin && form.target_campus_ids.length!==1)?"var(--bg-disabled)":"var(--bg-input)" }}>
                <option value="">All Classes</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
              {isSuperAdmin && form.target_campus_ids.length!==1 && (
                <div className="ann-help-text">Select exactly one campus above to target a specific class.</div>
              )}
            </div>
            {isSuperAdmin && (
              <div className="ann-campus-dropdown-wrap">
                <label className="ann-field-label">Target Campuses</label>
                <button type="button" onClick={()=>setCampusDropdownOpen(o=>!o)}
                  className="ann-campus-dropdown-btn">
                  <span>{form.target_campus_ids.length===0 ? "All Campuses" : form.target_campus_ids.length+" campus"+(form.target_campus_ids.length>1?"es":"")+" selected"}</span>
                  <span className="ann-campus-dropdown-arrow">{campusDropdownOpen?"?":"?"}</span>
                </button>
                {campusDropdownOpen && (
                  <div className="ann-campus-dropdown-panel">
                    <label className="ann-campus-all-label">
                      <input type="checkbox" checked={form.target_campus_ids.length===0}
                        onChange={()=>setForm(f=>({...f,target_campus_ids:[]}))} />
                      All Campuses
                    </label>
                    {campuses.map(c=>{
                      const isChecked = form.target_campus_ids.length===0 || form.target_campus_ids.includes(c.id);
                      return (
                        <label key={c.id} className="ann-campus-item-label">
                          <input type="checkbox" checked={isChecked}
                            onChange={()=>{
                              if (form.target_campus_ids.length===0) {
                                // Was "All"; unchecking one campus switches to explicit mode with every other campus still selected.
                                setForm(f=>({...f,target_campus_ids:campuses.filter(cc=>cc.id!==c.id).map(cc=>cc.id)}));
                              } else if (isChecked) {
                                setForm(f=>({...f,target_campus_ids:f.target_campus_ids.filter(id=>id!==c.id)}));
                              } else {
                                setForm(f=>({...f,target_campus_ids:[...f.target_campus_ids, c.id]}));
                              }
                            }} />
                          {c.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="ann-field-label">Link (optional)</label>
              <input value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))} placeholder="/exam-results" className="ann-full-input" />
            </div>
            <div>
              <label className="ann-field-label">Link Label</label>
              <input value={form.link_label} onChange={e=>setForm(f=>({...f,link_label:e.target.value}))} placeholder="View" className="ann-full-input" />
            </div>
            <div>
              <label className="ann-field-label">Start Date</label>
              <DatePicker value={form.start_date} onChange={val=>setForm(f=>({...f,start_date:val}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
            </div>
            <div>
              <label className="ann-field-label">End Date</label>
              <DatePicker value={form.end_date} onChange={val=>setForm(f=>({...f,end_date:val}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13}} />
            </div>
          </div>
          <div className="ann-form-actions">
            <button disabled={saving||!form.title.trim()} onClick={save} className="ann-publish-btn">
              {saving?"Saving...":"Publish Announcement"}
            </button>
            <button onClick={()=>setShowForm(false)} className="ann-cancel-btn">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {loading&&<div className="ann-state-card" style={{padding:"40px"}}>Loading...</div>}
      {!loading&&announcements.length===0&&<div className="ann-state-card" style={{padding:"60px"}}><div className="ann-state-icon">📢</div><div className="ann-state-text">No announcements yet</div></div>}
      <div className="ann-list-stack">
        {announcements.map(a=>(
          <div key={a.id} className="ann-card" style={{ "--card-border-color": typeColors[a.ann_type]||"var(--border-color)", "--card-bg": priorityBg[a.priority]||"var(--bg-card)" }}>
            <div className="ann-card-body-row">
              <div className="ann-card-main">
                <div className="ann-tag-row">
                  <span className="ann-type-tag" style={{ "--type-bg": typeColors[a.ann_type]||"var(--border-color)" }}>{a.ann_type}</span>
                  <span className="ann-priority-tag" style={{ "--prio-bg": a.priority==="urgent"?"var(--bg-danger-soft)":a.priority==="important"?"#fef9c3":"var(--bg-hover)", "--prio-color": a.priority==="urgent"?"#991b1b":a.priority==="important"?"#854d0e":"var(--text-secondary)" }}>{a.priority}</span>
                  <span className="ann-target-text">→ {a.target_role==="all"?"Everyone":a.target_role}</span>
                  {a.target_campus_ids && a.target_campus_ids.length>0 && (
                    <span className="ann-campus-tag">
                      {a.target_campus_ids.length===1 ? "1 campus" : a.target_campus_ids.length+" campuses"}
                    </span>
                  )}
                  {a.auto&&<span className="ann-auto-tag">Auto</span>}
                </div>
                <div className="ann-card-title">{a.title}</div>
                {a.body&&<div className="ann-card-body-text">{a.body}</div>}
                {a.link&&<div className="ann-card-link">{a.link_label||"View"}: {a.link}</div>}
                <div className="ann-card-dates">{a.start_date} → {a.end_date||"No expiry"}</div>
              </div>
              <div className="ann-card-actions">
                {(isSuperAdmin || !a.created_by_is_superadmin) ? (
                  <>
                    <button type="button" onClick={()=>toggleActive(a)} aria-pressed={a.is_active} aria-label="Toggle active"
                      className="ann-toggle-btn" style={{ "--toggle-bg": a.is_active?"var(--theme-primary)":"#cbd5e1" }}>
                      <span className="ann-toggle-knob" style={{ "--knob-left": a.is_active?"23px":"3px" }} />
                    </button>
                    <span className="ann-status-text" style={{ "--status-color": a.is_active?"var(--theme-primary)":"var(--text-muted)" }}>
                      {a.is_active?"Active":"Inactive"}
                    </span>
                    <button onClick={()=>remove(a.id)} className="ann-delete-btn">Delete</button>
                  </>
                ) : (
                  <>
                    <span className="ann-status-text" style={{ "--status-color": a.is_active?"var(--theme-primary)":"var(--text-muted)" }}>
                      {a.is_active?"Active":"Inactive"}
                    </span>
                    <span className="ann-managed-text">Managed by superadmin</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}