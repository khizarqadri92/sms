import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import calendarApi from "../api/calendarApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";
import "./Calendar.css";

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
        <div className="cal-header-actions">
          <div className="cal-view-toggle">
            <button onClick={()=>setView("calendar")} className="cal-view-btn"
              style={{ "--btn-bg": view==="calendar"?"#2563eb":"var(--bg-card)", "--btn-color": view==="calendar"?"#fff":"var(--text-secondary)" }}>Calendar</button>
            <button onClick={()=>setView("list")} className="cal-view-btn"
              style={{ "--btn-bg": view==="list"?"#2563eb":"var(--bg-card)", "--btn-color": view==="list"?"#fff":"var(--text-secondary)" }}>List</button>
          </div>
          {canManage && (
            <>
              <button className="btn btn-ghost cal-event-types-btn" onClick={()=>setShowTypesMgr(true)}>⚙ Event Types</button>
              <button className="btn btn-primary" onClick={()=>{setEditEvent(null);setShowModal(true);}}>+ Add Event</button>
            </>
          )}
        </div>
      </div>

      {/* Event type legend */}
      <div className="cal-legend">
        {eventTypes.map(t=>{ const s=makeTypeStyle(t.color); return (
          <span key={t.id} className="cal-legend-item" style={{ "--item-bg": s.bg, "--item-color": s.color, "--item-border": s.border }}>
            {t.name}{t.is_holiday?" 🏖":""}
          </span>
        );})}
      </div>

      {view==="calendar" ? (
        <div className="cal-grid-layout">
          {/* Calendar */}
          <div className="cal-calendar-box">
            {/* Nav */}
            <div className="cal-nav">
              <button onClick={prevMonth} className="cal-nav-btn">‹</button>
              <div className="cal-nav-title">{MONTHS[month-1]} {year}</div>
              <button onClick={nextMonth} className="cal-nav-btn">›</button>
            </div>
            {/* Day headers */}
            <div className="cal-day-headers">
              {DAYS.map(d=>(
                <div key={d} className="cal-day-header">{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div className="cal-cells-grid">
              {cells.map((day,i)=>{
                const dayEvents = getDateEvents(day);
                const isHoliday = dayEvents.some(e=>e.is_holiday);
                const isSel = selDate===`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                return (
                  <div key={i} onClick={()=>handleDayClick(day)}
                    className="cal-cell" style={{
                      "--cell-cursor": day?"pointer":"default",
                      "--cell-bg": isSel?"var(--bg-info-soft)":isHoliday?"var(--bg-danger-soft)":day?"var(--bg-card)":"var(--bg-hover)"
                    }}>
                    {day && (
                      <>
                        <div className="cal-day-number" style={{
                          "--num-bg": isToday(day)?"#2563eb":"transparent",
                          "--num-color": isToday(day)?"#fff":isHoliday?"#ef4444":"var(--text-heading)",
                          "--num-weight": isToday(day)||dayEvents.length>0?700:400
                        }}>
                          {day}
                        </div>
                        <div className="cal-day-events-wrap">
                          {dayEvents.slice(0,2).map(e=>{
                            const t=getTypeStyle(e.event_type);
                            return (
                              <div key={e.id} className="cal-day-event-tag" style={{ "--tag-bg": t.color }}>
                                {e.title}
                              </div>
                            );
                          })}
                          {dayEvents.length>2 && <div className="cal-more-text">+{dayEvents.length-2} more</div>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panel */}
          <div className="cal-side-panel">
            {selDate ? (
              <div className="cal-sel-date-card">
                <div className="cal-sel-date-title">
                  {(() => { const d = new Date(selDate+"T00:00:00"); return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]}, ${formatDate(d)}`; })()}
                </div>
                {selEvents.length===0 ? (
                  <div className="cal-no-events-text">No events on this date.</div>
                ) : selEvents.map(e=>{
                  const t=getTypeStyle(e.event_type);
                  return (
                    <div key={e.id} className="cal-event-item" style={{ "--item-border": t.border, "--item-bg": t.bg }}>
                      <div className="cal-event-item-top">
                        <div>
                          <div className="cal-event-title" style={{ "--title-color": t.color }}>{e.title}</div>
                          {e.description && <div className="cal-event-desc">{e.description}</div>}
                          <div className="cal-event-tags-row">
                            <span className="cal-event-type-tag" style={{ "--tag-bg": t.color }}>{t.label}</span>
                            {e.is_holiday && <span className="cal-holiday-tag">Holiday</span>}
                          </div>
                        </div>
                        {canManage && (
                          <div className="cal-event-actions">
                            <button onClick={()=>{setEditEvent(e);setShowModal(true);}} className="cal-edit-btn">Edit</button>
                            <button onClick={async()=>{ if(window.confirm("Delete?")){ await calendarApi.remove(e.id); loadEvents(); setSelEvents(p=>p.filter(x=>x.id!==e.id)); }}}
                              className="cal-del-btn">Del</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {canManage && (
                  <button onClick={()=>{setEditEvent({event_date:selDate});setShowModal(true);}}
                    className="cal-add-on-date-btn">
                    + Add event on this date
                  </button>
                )}
              </div>
            ) : (
              <div className="cal-empty-sel-card">
                <div className="cal-empty-sel-icon">📅</div>
                <div className="cal-empty-sel-text">Click a date to see events</div>
              </div>
            )}

            {/* Upcoming events */}
            <div className="cal-month-card">
              <div className="cal-month-card-title">This Month</div>
              {events.length===0 ? <div className="cal-no-events-month">No events this month.</div> : (
                <div className="cal-month-list">
                  {events.map(e=>{
                    const t=getTypeStyle(e.event_type);
                    return (
                      <div key={e.id} className="cal-month-list-item">
                        <div className="cal-month-list-dot" style={{ "--dot-color": t.color }} />
                        <div>
                          <div className="cal-month-list-title">{e.title}</div>
                          <div className="cal-month-list-date">{formatDate(e.event_date)}{e.end_date&&e.end_date!==e.event_date?" — "+formatDate(e.end_date):""}</div>
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
          <div className="cal-list-header">
            <div className="cal-list-title">{MONTHS[month-1]} {year}</div>
            <div className="cal-list-nav">
              <button onClick={prevMonth} className="btn btn-ghost cal-list-nav-btn">‹ Prev</button>
              <button onClick={nextMonth} className="btn btn-ghost cal-list-nav-btn">Next ›</button>
            </div>
          </div>
          {events.length===0 ? <div className="empty-state">No events this month.</div> : (
            <div className="cal-list-items-wrap">
              {events.map(e=>{
                const t=getTypeStyle(e.event_type);
                return (
                  <div key={e.id} className="cal-list-item" style={{ "--item-border": t.border, "--item-bg": t.bg, "--item-left-color": t.color }}>
                    <div className="cal-list-item-date-box">
                      <div className="cal-list-item-day" style={{ "--day-color": t.color }}>{new Date(e.event_date+"T00:00:00").getDate()}</div>
                      <div className="cal-list-item-month">{MONTHS[new Date(e.event_date+"T00:00:00").getMonth()].slice(0,3)}</div>
                    </div>
                    <div className="cal-list-item-content">
                      <div className="cal-list-item-title">{e.title}</div>
                      {e.description && <div className="cal-list-item-desc">{e.description}</div>}
                      <div className="cal-list-item-tags">
                        <span className="cal-list-type-tag" style={{ "--tag-bg": t.color }}>{t.label}</span>
                        {e.is_holiday && <span className="cal-list-holiday-tag">Holiday</span>}
                        {e.end_date && e.end_date!==e.event_date && <span className="cal-list-until-text">Until {formatDate(e.end_date)}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="cal-list-actions">
                        <button onClick={()=>{setEditEvent(e);setShowModal(true);}} className="btn btn-ghost cal-list-edit-btn">Edit</button>
                        <button onClick={async()=>{ if(window.confirm("Delete?")){ await calendarApi.remove(e.id); loadEvents(); }}}
                          className="cal-list-delete-btn">Delete</button>
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
    <div className="cal-modal-overlay">
      <div className="cal-modal-box">
        <div className="cal-modal-header">
          <div className="cal-modal-title">{event?.id?"Edit Event":"Add Event"}</div>
          <button onClick={onClose} className="cal-close-btn">×</button>
        </div>
        <div className="cal-modal-body">
          {err && <div className="cal-error-box">{err}</div>}
          <div>
            <label className="cal-field-label">Title *</label>
            <input className="form-control" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Event title..." />
          </div>
          <div>
            <label className="cal-field-label">Description</label>
            <textarea className="form-control cal-textarea-resize" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
          </div>
          <div className="cal-date-grid">
            <div>
              <label className="cal-field-label">Start Date *</label>
              <DatePicker value={form.event_date} onChange={val=>setForm({...form,event_date:val})} />
            </div>
            <div>
              <label className="cal-field-label">End Date <span className="cal-optional-tag">(optional)</span></label>
              <DatePicker value={form.end_date||""} onChange={val=>setForm({...form,end_date:val})} />
            </div>
          </div>
          <div>
            <label className="cal-field-label">Event Type</label>
            <select className="form-control" value={form.event_type} onChange={e=>{
              const t=eventTypes.find(x=>x.name.toLowerCase()===e.target.value.toLowerCase());
              setForm({...form, event_type:e.target.value, is_holiday:t?.is_holiday||false});
            }}>
              {eventTypes.map(t=><option key={t.id} value={t.name.toLowerCase()}>{t.name}{t.is_holiday?" (Holiday)":""}</option>)}
            </select>
          </div>
          <label className="cal-holiday-check-label" style={{
            "--label-bg": form.is_holiday?"var(--bg-danger-soft)":"var(--bg-hover)",
            "--label-border": form.is_holiday?"var(--border-danger-soft)":"var(--border-color)"
          }}>
            <input type="checkbox" checked={form.is_holiday} onChange={e=>setForm({...form,is_holiday:e.target.checked})} />
            <div>
              <div className="cal-holiday-check-title" style={{ "--title-color": form.is_holiday?"#dc2626":"var(--text-heading)" }}>Mark as Holiday</div>
              <div className="cal-holiday-check-subtext">Blocks attendance marking and notifies all users</div>
            </div>
          </label>
        </div>
        <div className="cal-modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="cal-save-btn">
            {saving?"Saving...":event?.id?"Update Event":"Add Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
/* ── Event Type Manager ───────────────────────────────────────── */
function EventTypeManager({ onClose }) {
  const { isGlobalLocked } = useGovernanceMode("event_types");
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
    <div className="cal-modal-overlay">
      <div className="cal-modal-box-wide">
        <div className="cal-modal-header">
          <div className="cal-modal-title">Manage Event Types</div>
          <button onClick={onClose} className="cal-close-btn">×</button>
        </div>
        <div className="cal-modal-body-block">
          {isGlobalLocked && (
            <div className="cal-type-mgr-readonly">
              Event Types are managed centrally by the superadmin. This list is read-only here.
            </div>
          )}
          {/* Add/Edit Form */}
          {!isGlobalLocked && (
          <div className="cal-add-form-box">
            <div className="cal-add-form-title">{editing?"Edit Type":"Add New Type"}</div>
            <div className="cal-add-form-grid">
              <div>
                <label className="cal-field-label-sm">Type Name *</label>
                <input className="form-control" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Sports Day" />
              </div>
              <div>
                <label className="cal-field-label-sm">Color</label>
                <input type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}
                  className="cal-color-input" />
              </div>
              <button onClick={handleSave} disabled={saving||!form.name}
                className="cal-add-btn">
                {saving?"...":(editing?"Update":"Add")}
              </button>
            </div>
            <label className="cal-holiday-checkbox-row">
              <input type="checkbox" checked={form.is_holiday} onChange={e=>setForm({...form,is_holiday:e.target.checked})} />
              <span className="cal-holiday-checkbox-label">Mark as holiday (blocks attendance)</span>
            </label>
            {editing && (
              <button onClick={()=>{setEditing(null);setForm({name:"",color:"#2563eb",is_holiday:false});}}
                className="cal-cancel-edit-btn">✕ Cancel edit</button>
            )}
          </div>
          )}

          {/* Types list */}
          <div className="cal-types-list">
            {types.map(t=>{
              const s=makeTypeStyle(t.color);
              return (
                <div key={t.id} className="cal-type-row" style={{ "--row-border": s.border, "--row-bg": s.bg }}>
                  <div className="cal-type-dot" style={{ "--dot-bg": t.color }} />
                  <div className="cal-type-name-content">
                    <span className="cal-type-name" style={{ "--name-color": t.color }}>{t.name}</span>
                    {t.is_holiday && <span className="cal-type-holiday-tag">Holiday</span>}
                  </div>
                  {!isGlobalLocked && (
                    <div className="cal-type-actions">
                      <button onClick={()=>handleEdit(t)} className="cal-type-edit-btn">Edit</button>
                      <button onClick={()=>handleDelete(t.id)} className="cal-type-delete-btn">Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
