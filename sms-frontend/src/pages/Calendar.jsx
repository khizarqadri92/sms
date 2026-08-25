import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import calendarApi from "../api/calendarApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Event types loaded dynamically from DB
function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function makeTypeStyle(color) {
  return { color, bg:`rgba(${hexToRgb(color)},0.08)`, border:`rgba(${hexToRgb(color)},0.3)` };
}

export default function Calendar() {
  const { formatDate } = useRegionalSettings();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("calendar.manage");
  const processingToday = useProcessingToday();
  const today = new Date(processingToday);
  const [year,   setYear]   = useState(today.getFullYear());
  const [month,  setMonth]  = useState(today.getMonth()+1);
  useEffect(() => {
    const d = new Date(processingToday);
    setYear(d.getFullYear());
    setMonth(d.getMonth()+1);
  }, [processingToday]);
  const [events, setEvents] = useState([]);
  const [view,       setView]       = useState("calendar");
  const [eventTypes,  setEventTypes]  = useState([]);
  const [showModal,   setShowModal]   = useState(false);
  const [showTypesMgr,setShowTypesMgr]= useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [selDate,   setSelDate]   = useState(null);
  const [selEvents, setSelEvents] = useState([]);

  useEffect(() => { loadEvents(); }, [year, month]);
  useEffect(() => { calendarApi.getEventTypes().then(r=>setEventTypes(r.data.data||[])).catch(()=>{}); }, []);
  const getTypeStyle = (typeName) => { const t=eventTypes.find(x=>x.name.toLowerCase()===typeName?.toLowerCase()); return t?makeTypeStyle(t.color):makeTypeStyle("#64748b"); };
  const getTypeName  = (typeName) => eventTypes.find(x=>x.name.toLowerCase()===typeName?.toLowerCase())?.name || typeName;

  const loadEvents = () => {
    calendarApi.list({ year, month }).then(r => setEvents(r.data.data||[])).catch(()=>{});
  };

  const prevMonth = () => { if(month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const nextMonth = () => { if(month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); };

  // Build calendar grid
  const firstDay = new Date(year, month-1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);

  const getDateEvents = (day) => {
    if(!day) return [];
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return events.filter(e => {
      if(e.end_date) return dateStr>=e.event_date && dateStr<=e.end_date;
      return e.event_date===dateStr;
    });
  };

  const handleDayClick = (day) => {
    if(!day) return;
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    setSelDate(dateStr);
    setSelEvents(getDateEvents(day));
  };

  const isToday = (day) => {
    return day===today.getDate() && month===today.getMonth()+1 && year===today.getFullYear();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Academic Calendar</h1>
        <div style={{ display:"flex", gap:10 }}>
          <div style={{ display:"flex", border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
            <button onClick={()=>setView("calendar")} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer",
              background:view==="calendar"?"#2563eb":"#fff", color:view==="calendar"?"#fff":"#64748b" }}>Calendar</button>
            <button onClick={()=>setView("list")} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer",
              background:view==="list"?"#2563eb":"#fff", color:view==="list"?"#fff":"#64748b" }}>List</button>
          </div>
          {canManage && (
            <>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={()=>setShowTypesMgr(true)}>⚙ Event Types</button>
              <button className="btn btn-primary" onClick={()=>{setEditEvent(null);setShowModal(true);}}>+ Add Event</button>
            </>
          )}
        </div>
      </div>

      {/* Event type legend */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
        {eventTypes.map(t=>{ const s=makeTypeStyle(t.color); return (
          <span key={t.id} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:s.bg, color:s.color, border:"1px solid "+s.border, fontWeight:600 }}>
            {t.name}{t.is_holiday?" 🏖":""}
          </span>
        );})}
      </div>

      {view==="calendar" ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16 }}>
          {/* Calendar */}
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
            {/* Nav */}
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <button onClick={prevMonth} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16 }}>‹</button>
              <div style={{ fontWeight:700, fontSize:16, color:"#1e3a5f" }}>{MONTHS[month-1]} {year}</div>
              <button onClick={nextMonth} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16 }}>›</button>
            </div>
            {/* Day headers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:"1px solid #f1f5f9" }}>
              {DAYS.map(d=>(
                <div key={d} style={{ padding:"10px", textAlign:"center", fontSize:12, fontWeight:700, color:"#64748b" }}>{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
              {cells.map((day,i)=>{
                const dayEvents = getDateEvents(day);
                const isHoliday = dayEvents.some(e=>e.is_holiday);
                const isSel = selDate===`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                return (
                  <div key={i} onClick={()=>handleDayClick(day)}
                    style={{ minHeight:80, padding:"6px", borderRight:"1px solid #f8fafc", borderBottom:"1px solid #f8fafc",
                      cursor:day?"pointer":"default",
                      background:isSel?"#eff6ff":isHoliday?"#fef2f2":day?"#fff":"#fafafa" }}>
                    {day && (
                      <>
                        <div style={{ width:26, height:26, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                          background:isToday(day)?"#2563eb":"transparent",
                          color:isToday(day)?"#fff":isHoliday?"#ef4444":"#1e3a5f",
                          fontWeight:isToday(day)||dayEvents.length>0?700:400, fontSize:13, marginBottom:4 }}>
                          {day}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                          {dayEvents.slice(0,2).map(e=>{
                            const t=getTypeStyle(e.event_type);
                            return (
                              <div key={e.id} style={{ fontSize:10, padding:"1px 5px", borderRadius:4, background:t.color, color:"#fff",
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {e.title}
                              </div>
                            );
                          })}
                          {dayEvents.length>2 && <div style={{ fontSize:10, color:"#94a3b8" }}>+{dayEvents.length-2} more</div>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panel */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {selDate ? (
              <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px" }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f", marginBottom:12 }}>
                  {(() => { const d = new Date(selDate+"T00:00:00"); return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]}, ${formatDate(d)}`; })()}
                </div>
                {selEvents.length===0 ? (
                  <div style={{ fontSize:13, color:"#94a3b8" }}>No events on this date.</div>
                ) : selEvents.map(e=>{
                  const t=getTypeStyle(e.event_type);
                  return (
                    <div key={e.id} style={{ padding:"10px 12px", border:"1px solid "+t.border, borderRadius:8, background:t.bg, marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:t.color }}>{e.title}</div>
                          {e.description && <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{e.description}</div>}
                          <div style={{ fontSize:11, marginTop:4, display:"flex", gap:6 }}>
                            <span style={{ padding:"1px 8px", borderRadius:20, background:t.color, color:"#fff", fontSize:10 }}>{t.label}</span>
                            {e.is_holiday && <span style={{ padding:"1px 8px", borderRadius:20, background:"#fee2e2", color:"#dc2626", fontSize:10 }}>Holiday</span>}
                          </div>
                        </div>
                        {canManage && (
                          <div style={{ display:"flex", gap:4 }}>
                            <button onClick={()=>{setEditEvent(e);setShowModal(true);}} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer" }}>Edit</button>
                            <button onClick={async()=>{ if(window.confirm("Delete?")){ await calendarApi.remove(e.id); loadEvents(); setSelEvents(p=>p.filter(x=>x.id!==e.id)); }}}
                              style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer", color:"#dc2626" }}>Del</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {canManage && (
                  <button onClick={()=>{setEditEvent({event_date:selDate});setShowModal(true);}}
                    style={{ width:"100%", padding:"8px", fontSize:12, fontWeight:600, background:"#f8fafc", border:"1px dashed #e2e8f0", borderRadius:8, cursor:"pointer", color:"#64748b", marginTop:8 }}>
                    + Add event on this date
                  </button>
                )}
              </div>
            ) : (
              <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"24px", textAlign:"center", color:"#94a3b8" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
                <div style={{ fontSize:13 }}>Click a date to see events</div>
              </div>
            )}

            {/* Upcoming events */}
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px" }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#1e3a5f", marginBottom:10 }}>This Month</div>
              {events.length===0 ? <div style={{ fontSize:12, color:"#94a3b8" }}>No events this month.</div> : (
                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:300, overflowY:"auto" }}>
                  {events.map(e=>{
                    const t=getTypeStyle(e.event_type);
                    return (
                      <div key={e.id} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderBottom:"1px solid #f8fafc" }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:t.color, marginTop:5, flexShrink:0 }} />
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:"#1e3a5f" }}>{e.title}</div>
                          <div style={{ fontSize:11, color:"#94a3b8" }}>{formatDate(e.event_date)}{e.end_date&&e.end_date!==e.event_date?" — "+formatDate(e.end_date):""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* List view */
        <div className="section-card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f" }}>{MONTHS[month-1]} {year}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={prevMonth} className="btn btn-ghost" style={{ fontSize:12 }}>‹ Prev</button>
              <button onClick={nextMonth} className="btn btn-ghost" style={{ fontSize:12 }}>Next ›</button>
            </div>
          </div>
          {events.length===0 ? <div className="empty-state">No events this month.</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {events.map(e=>{
                const t=getTypeStyle(e.event_type);
                return (
                  <div key={e.id} style={{ display:"flex", gap:14, alignItems:"flex-start", padding:"12px 14px",
                    border:"1px solid "+t.border, borderRadius:10, background:t.bg, borderLeft:"4px solid "+t.color }}>
                    <div style={{ minWidth:60, textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:t.color }}>{new Date(e.event_date+"T00:00:00").getDate()}</div>
                      <div style={{ fontSize:11, color:"#64748b" }}>{MONTHS[new Date(e.event_date+"T00:00:00").getMonth()].slice(0,3)}</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f" }}>{e.title}</div>
                      {e.description && <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{e.description}</div>}
                      <div style={{ display:"flex", gap:6, marginTop:6 }}>
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:t.color, color:"#fff" }}>{t.label}</span>
                        {e.is_holiday && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#fee2e2", color:"#dc2626", border:"1px solid #fecaca" }}>Holiday</span>}
                        {e.end_date && e.end_date!==e.event_date && <span style={{ fontSize:11, color:"#64748b" }}>Until {formatDate(e.end_date)}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>{setEditEvent(e);setShowModal(true);}} className="btn btn-ghost" style={{ fontSize:11 }}>Edit</button>
                        <button onClick={async()=>{ if(window.confirm("Delete?")){ await calendarApi.remove(e.id); loadEvents(); }}}
                          style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, padding:"3px 10px", fontSize:11, cursor:"pointer", color:"#dc2626" }}>Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showModal && <EventModal event={editEvent} eventTypes={eventTypes} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);loadEvents();}} />}
      {showTypesMgr && <EventTypeManager onClose={()=>{setShowTypesMgr(false);calendarApi.getEventTypes().then(r=>setEventTypes(r.data.data||[]));}} />}
    </div>
  );
}

/* ── Event Modal ──────────────────────────────────────────────── */
function EventModal({ event, eventTypes, onClose, onSaved }) {
  const [form,   setForm]   = useState({
    title: event?.title||"", description: event?.description||"",
    event_date: event?.event_date||"", end_date: event?.end_date||"",
    event_type: event?.event_type||"event", is_holiday: event?.is_holiday||false
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const handleSave = async () => {
    if(!form.title||!form.event_date){ setErr("Title and date required."); return; }
    setSaving(true); setErr("");
    try {
      if(event?.id) await calendarApi.update(event.id, form);
      else await calendarApi.create(form);
      onSaved();
    } catch(e){ setErr(e.response?.data?.message||"Failed to save."); }
    finally{ setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:480 }}>
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, fontSize:15 }}>{event?.id?"Edit Event":"Add Event"}</div>
          <button onClick={onClose} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:18, color:"#64748b" }}>×</button>
        </div>
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
          {err && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px", fontSize:13, color:"#dc2626" }}>{err}</div>}
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Title *</label>
            <input className="form-control" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Event title..." />
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{ resize:"vertical" }} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Start Date *</label>
              <DatePicker value={form.event_date} onChange={val=>setForm({...form,event_date:val})} />
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>End Date <span style={{ fontWeight:400, color:"#94a3b8" }}>(optional)</span></label>
              <DatePicker value={form.end_date||""} onChange={val=>setForm({...form,end_date:val})} />
            </div>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6 }}>Event Type</label>
            <select className="form-control" value={form.event_type} onChange={e=>{
              const t=eventTypes.find(x=>x.name.toLowerCase()===e.target.value.toLowerCase());
              setForm({...form, event_type:e.target.value, is_holiday:t?.is_holiday||false});
            }}>
              {eventTypes.map(t=><option key={t.id} value={t.name.toLowerCase()}>{t.name}{t.is_holiday?" (Holiday)":""}</option>)}
            </select>
          </div>
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"10px 12px",
            background:form.is_holiday?"#fef2f2":"#f8fafc", border:"1px solid "+(form.is_holiday?"#fecaca":"#e2e8f0"), borderRadius:8 }}>
            <input type="checkbox" checked={form.is_holiday} onChange={e=>setForm({...form,is_holiday:e.target.checked})} />
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:form.is_holiday?"#dc2626":"#1e3a5f" }}>Mark as Holiday</div>
              <div style={{ fontSize:11, color:"#64748b" }}>Blocks attendance marking and notifies all users</div>
            </div>
          </label>
        </div>
        <div style={{ padding:"16px 24px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding:"8px 20px", fontSize:13, fontWeight:600, background:"#2563eb", color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
            {saving?"Saving...":event?.id?"Update Event":"Add Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
/* ── Event Type Manager ───────────────────────────────────────── */
function EventTypeManager({ onClose }) {
  const [types,   setTypes]   = useState([]);
  const [form,    setForm]    = useState({ name:"", color:"#2563eb", is_holiday:false });
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);

  const load = () => calendarApi.getEventTypes().then(r=>setTypes(r.data.data||[])).catch(()=>{});
  useEffect(()=>{ load(); },[]);

  const handleSave = async () => {
    if(!form.name) return;
    setSaving(true);
    try {
      if(editing) await calendarApi.updateType(editing, form);
      else await calendarApi.createType(form);
      setForm({ name:"", color:"#2563eb", is_holiday:false });
      setEditing(null);
      load();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Delete this event type?")) return;
    await calendarApi.deleteType(id);
    load();
  };

  const handleEdit = (t) => {
    setEditing(t.id);
    setForm({ name:t.name, color:t.color, is_holiday:t.is_holiday });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:500 }}>
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Manage Event Types</div>
          <button onClick={onClose} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:18, color:"#64748b" }}>×</button>
        </div>
        <div style={{ padding:"20px 24px" }}>
          {/* Add/Edit Form */}
          <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"14px", marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:13, color:"#1e3a5f", marginBottom:12 }}>{editing?"Edit Type":"Add New Type"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:10, alignItems:"flex-end" }}>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#64748b", marginBottom:4 }}>Type Name *</label>
                <input className="form-control" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Sports Day" />
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#64748b", marginBottom:4 }}>Color</label>
                <input type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}
                  style={{ width:42, height:36, border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", padding:2 }} />
              </div>
              <button onClick={handleSave} disabled={saving||!form.name}
                style={{ padding:"0 16px", height:36, fontSize:13, fontWeight:600, background:"#2563eb", color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
                {saving?"...":(editing?"Update":"Add")}
              </button>
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, cursor:"pointer", fontSize:12 }}>
              <input type="checkbox" checked={form.is_holiday} onChange={e=>setForm({...form,is_holiday:e.target.checked})} />
              <span style={{ color:"#64748b" }}>Mark as holiday (blocks attendance)</span>
            </label>
            {editing && (
              <button onClick={()=>{setEditing(null);setForm({name:"",color:"#2563eb",is_holiday:false});}}
                style={{ marginTop:8, fontSize:11, color:"#64748b", background:"none", border:"none", cursor:"pointer" }}>✕ Cancel edit</button>
            )}
          </div>

          {/* Types list */}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {types.map(t=>{
              const s=makeTypeStyle(t.color);
              return (
                <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px",
                  border:"1px solid "+s.border, borderRadius:8, background:s.bg }}>
                  <div style={{ width:16, height:16, borderRadius:"50%", background:t.color, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:600, fontSize:13, color:t.color }}>{t.name}</span>
                    {t.is_holiday && <span style={{ fontSize:10, marginLeft:8, padding:"1px 6px", borderRadius:10, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca" }}>Holiday</span>}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>handleEdit(t)} style={{ fontSize:11, padding:"3px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:6, cursor:"pointer" }}>Edit</button>
                    <button onClick={()=>handleDelete(t.id)} style={{ fontSize:11, padding:"3px 10px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, cursor:"pointer", color:"#dc2626" }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
