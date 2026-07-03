import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import client from "../api/client";
import academicsApi from "../api/academicsApi";

const today = () => new Date().toISOString().split("T")[0];
const futureDate = (days=30) => { const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().split("T")[0]; };

export default function Announcements() {
  const { user } = useAuth();
  const role = user?.roles?.[0]||"";
  const [announcements, setAnnouncements] = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [form, setForm] = useState({
    title:"", body:"", type:"info", priority:"normal",
    target_role:"all", target_class:"", link:"", link_label:"View",
    start_date:today(), end_date:futureDate(30)
  });
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    load();
    academicsApi.getClasses().then(r=>setClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
  },[]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await client.get("/announcements/");
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
      });
      setShowForm(false);
      setForm({title:"",body:"",type:"info",priority:"normal",target_role:"all",target_class:"",link:"",link_label:"View",start_date:today(),end_date:futureDate(30)});
      load();
    } catch(e){}
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if(!window.confirm("Delete this announcement?")) return;
    try { await client.delete(`/announcements/${id}`); load(); } catch(e){}
  };

  const typeColors = {
    info:   "#2563eb", exam:"#7c3aed", result:"#166534",
    urgent: "#ef4444", event:"#854d0e", general:"#374151"
  };
  const priorityBg = {normal:"#f1f5f9",important:"#fef9c3",urgent:"#fee2e2"};

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Announcements</div>
          <div style={{fontSize:13,color:"#64748b"}}>Manage news and announcements shown to users</div>
        </div>
        <button onClick={()=>setShowForm(true)} style={{padding:"9px 20px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          + New Announcement
        </button>
      </div>

      {/* Create Form */}
      {showForm&&(
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #0f4c35",padding:24,marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>New Announcement</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Title *</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Announcement title..." style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Message</label>
              <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Announcement details..." rows={3} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,resize:"vertical"}} />
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
                <option value="info">Info</option>
                <option value="exam">Exam</option>
                <option value="result">Result</option>
                <option value="event">Event</option>
                <option value="urgent">Urgent</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Priority</label>
              <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Target Audience</label>
              <select value={form.target_role} onChange={e=>setForm(f=>({...f,target_role:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
                <option value="all">Everyone</option>
                <option value="student">Students</option>
                <option value="parent">Parents</option>
                <option value="teacher">Teachers</option>
                <option value="principal">Principal</option>
                <option value="academic_coordinator">Coordinators</option>
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Target Class (optional)</label>
              <select value={form.target_class} onChange={e=>setForm(f=>({...f,target_class:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
                <option value="">All Classes</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Link (optional)</label>
              <input value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))} placeholder="/exam-results" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Link Label</label>
              <input value={form.link_label} onChange={e=>setForm(f=>({...f,link_label:e.target.value}))} placeholder="View" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>End Date</label>
              <input type="date" value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} />
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button disabled={saving||!form.title.trim()} onClick={save} style={{padding:"9px 24px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              {saving?"Saving...":"Publish Announcement"}
            </button>
            <button onClick={()=>setShowForm(false)} style={{padding:"9px 18px",background:"#fff",color:"#374151",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {loading&&<div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}
      {!loading&&announcements.length===0&&<div style={{background:"#fff",borderRadius:12,padding:"60px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:12}}>📢</div><div style={{fontWeight:600}}>No announcements yet</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {announcements.map(a=>(
          <div key={a.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 20px",borderLeft:"4px solid "+(typeColors[a.ann_type]||"#e2e8f0"),background:priorityBg[a.priority]||"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,fontWeight:700,background:typeColors[a.ann_type]||"#e2e8f0",color:"#fff",padding:"2px 8px",borderRadius:10,textTransform:"uppercase"}}>{a.ann_type}</span>
                  <span style={{fontSize:11,fontWeight:600,background:a.priority==="urgent"?"#fee2e2":a.priority==="important"?"#fef9c3":"#f1f5f9",color:a.priority==="urgent"?"#991b1b":a.priority==="important"?"#854d0e":"#64748b",padding:"2px 8px",borderRadius:10}}>{a.priority}</span>
                  <span style={{fontSize:11,color:"#94a3b8"}}>→ {a.target_role==="all"?"Everyone":a.target_role}</span>
                  {a.auto&&<span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Auto</span>}
                </div>
                <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:4}}>{a.title}</div>
                {a.body&&<div style={{fontSize:13,color:"#64748b",marginBottom:6}}>{a.body}</div>}
                {a.link&&<div style={{fontSize:12,color:"#2563eb"}}>{a.link_label||"View"}: {a.link}</div>}
                <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{a.start_date} → {a.end_date||"No expiry"}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                {a.is_active
                  ? <span style={{fontSize:11,fontWeight:600,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10}}>Active</span>
                  : <span style={{fontSize:11,fontWeight:600,background:"#f1f5f9",color:"#94a3b8",padding:"2px 8px",borderRadius:10}}>Inactive</span>
                }
                <button onClick={()=>remove(a.id)} style={{padding:"4px 12px",background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}