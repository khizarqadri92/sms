import { useState, useMemo } from "react";
import { examsApi } from "../api/examsApi";
import DatePicker from "../components/DatePicker";

const WEEKDAYS = [["Mon",0],["Tue",1],["Wed",2],["Thu",3],["Fri",4],["Sat",5],["Sun",6]];
const PATTERNS = [
  ["daily",     "Daily Paper",            "Every class sits one paper on each exam day."],
  ["alternate", "One Paper, One Leave Day","Every class gets a preparation day after each paper."],
  ["classwise", "Class-wise",             "You set each class's start date, leave days and subject order."],
];
const toMin = (t) => { if(!t) return null; const [h,m]=String(t).slice(0,5).split(":").map(Number); return isNaN(h)?null:h*60+(m||0); };
const fromMin = (n) => String(Math.floor(n/60)%24).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
const endOf = (s,d) => { const m=toMin(s); return m==null?"":fromMin(m+(Number(d)||0)); };
const errMsg = (e, fb="Failed.") => e?.response?.data?.detail?.message || e?.response?.data?.message || fb;
const label = (n, s) => n + (s ? " (" + s + ")" : "");
const fmtDay = (d) => { const x=new Date(d+"T00:00:00"); return { wd:x.toLocaleDateString("en-PK",{weekday:"short"}), day:x.getDate(), mon:x.toLocaleDateString("en-PK",{month:"short"}) }; };

/**
 * Auto Generate Date Sheet.
 * Configure -> Generate (preview, nothing saved) -> edit any entry, add, delete,
 * regenerate -> Save Draft (asks before replacing existing entries).
 * The existing manual datesheet is untouched until Save Draft.
 */
export default function DatesheetAutoGen({ exam, examClasses, classSubjects, shiftCfg, onClose, onSaved }) {
  const multi = shiftCfg?.mode==="multiple" && (shiftCfg?.shifts||[]).length>1;

  // ---------------- configuration
  const [pattern, setPattern]   = useState("daily");
  const [classIds, setClassIds] = useState(examClasses.map(c=>c.class_id));
  const [start, setStart]       = useState(exam?.start_date ? String(exam.start_date).slice(0,10) : "");
  const [end, setEnd]           = useState(exam?.end_date ? String(exam.end_date).slice(0,10) : "");
  const [weekdays, setWeekdays] = useState([0,1,2,3,4]);
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(120);
  const [replace, setReplace]   = useState("auto");
  const [classCfg, setClassCfg] = useState({});        // {class_id: {start_date, gap_days, order:[]}}
  const [orderOpen, setOrderOpen] = useState(null);    // class_id whose subject order is open

  // ---------------- preview
  const [step, setStep]         = useState("config");
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState(null);       // {type, text}
  const [result, setResult]     = useState(null);       // generate response (lookups, problems, stats)
  const [entries, setEntries]   = useState([]);
  const [checks, setChecks]     = useState({});
  const [edit, setEdit]         = useState(null);       // entry being edited/added
  const [editErr, setEditErr]   = useState(null);

  const cfgFor = (cid) => classCfg[cid] || { start_date:start, gap_days:0, order:[] };
  const setCfg = (cid, patch) => setClassCfg(m=>({ ...m, [cid]: { ...cfgFor(cid), ...patch } }));

  const subjectsOf = (cid) => (classSubjects[cid]||[]).map(s=>({ id:Number(s.subject_id||s.id), name:s.name||s.subject_name||s.code }));
  const orderedSubjects = (cid) => {
    const all = subjectsOf(cid); const ord = cfgFor(cid).order||[];
    return [...ord.map(id=>all.find(s=>s.id===id)).filter(Boolean), ...all.filter(s=>!ord.includes(s.id))];
  };
  const moveSubject = (cid, idx, dir) => {
    const list = orderedSubjects(cid).map(s=>s.id); const j = idx+dir;
    if(j<0||j>=list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    setCfg(cid, { order:list });
  };

  const scopeBody = () => ({ class_ids:classIds, start_date:start, end_date:end, replace });

  // ---------------- generate
  const generate = async (seed) => {
    if(!classIds.length) return setMsg({type:"error", text:"Select at least one class."});
    if(!start || !end) return setMsg({type:"error", text:"Choose the start and end date."});
    if(!weekdays.length) return setMsg({type:"error", text:"Choose at least one exam day of the week."});
    setBusy(true); setMsg(null);
    try {
      const r = await examsApi.generateDatesheet(exam.id, {
        ...scopeBody(), pattern, weekdays, start_time:startTime, duration_mins:Number(duration)||120,
        class_config: Object.fromEntries(classIds.map(cid=>[cid, cfgFor(cid)])), seed,
      });
      const d = r.data.data;
      setResult(d); setEntries(d.entries||[]); setChecks(d.checks||{}); setStep("preview");
    } catch(e){ setMsg({type:"error", text:errMsg(e)}); }
    finally{ setBusy(false); }
  };

  const recheck = async (list) => {
    try {
      const r = await examsApi.checkGeneratedSet(exam.id, { ...scopeBody(), entries:list.map(strip) });
      setChecks(r.data.data.checks||{}); setEntries(r.data.data.entries||list);
    } catch(e){ setMsg({type:"error", text:errMsg(e)}); }
  };
  const strip = (e) => ({ key:e.key, class_id:Number(e.class_id), subject_id:Number(e.subject_id), exam_date:e.exam_date||null,
    start_time:e.start_time?String(e.start_time).slice(0,5):null, duration_mins:Number(e.duration_mins)||120,
    shift_id:e.shift_id?Number(e.shift_id):null, room_id:e.room_id?Number(e.room_id):null, teacher_id:e.teacher_id?Number(e.teacher_id):null });

  // ---------------- edit / add / delete (in the preview only)
  const openEdit = (e) => { setEditErr(null); setEdit({ ...e, start_time:e.start_time?String(e.start_time).slice(0,5):"", end_time:e.start_time?endOf(e.start_time,e.duration_mins):"" }); };
  const openAdd = () => {
    const cid = classIds[0];
    setEditErr(null);
    setEdit({ key:"new-"+Date.now(), _new:true, class_id:cid, subject_id:"", exam_date:start, shift_id:"",
              start_time:startTime, end_time:endOf(startTime, duration), duration_mins:Number(duration)||120, room_id:"", teacher_id:"" });
  };
  const applyEdit = async () => {
    if(!edit.subject_id) return setEditErr("Select a subject.");
    const sh = multi && edit.shift_id ? (result?.shifts||[]).find(s=>String(s.id)===String(edit.shift_id)) : null;
    const dur = sh ? sh.duration_mins : (toMin(edit.end_time)??0)-(toMin(edit.start_time)??0);
    if(!sh && !(dur>0)) return setEditErr("End time must be after the start time.");
    const e = { ...edit, start_time: sh?sh.start_time:edit.start_time, duration_mins: sh?sh.duration_mins:dur, shift_id: sh?sh.id:null };
    const list = edit._new ? [...entries, e] : entries.map(x=>x.key===e.key?e:x);
    const r = await examsApi.checkGeneratedSet(exam.id, { ...scopeBody(), entries:list.map(strip) }).catch(err=>{ setEditErr(errMsg(err)); return null; });
    if(!r) return;
    const c = r.data.data.checks||{};
    if((c[e.key]?.errors||[]).length){ setEditErr(c[e.key].errors.map(x=>x.message).join(" ")); return; }
    setChecks(c); setEntries(r.data.data.entries||list); setEdit(null);
  };
  const removeEntry = (key) => { const list = entries.filter(x=>x.key!==key); setEntries(list); recheck(list); };

  // ---------------- save draft
  const save = async (confirm=false) => {
    setBusy(true); setMsg(null);
    try {
      const r = await examsApi.saveGenerated(exam.id, { ...scopeBody(), entries:entries.map(strip), confirm });
      onSaved(r.data.message || "Datesheet saved as a draft.");
    } catch(e){
      const det = e?.response?.data?.detail;
      if(e?.response?.status===409 && det?.status==="confirm"){
        setBusy(false);
        if(window.confirm(det.message + "\n\nReplace them and save this datesheet as a draft?")) return save(true);
        return;
      }
      if(det?.checks) setChecks(det.checks);
      setMsg({type:"error", text:errMsg(e)});
    } finally{ setBusy(false); }
  };

  // ---------------- preview grid data
  const dates = useMemo(()=>[...new Set(entries.map(e=>e.exam_date).filter(Boolean))].sort(), [entries]);
  const rowClasses = examClasses.filter(c=>classIds.includes(c.class_id));
  const cell = (cid, d) => entries.find(e=>Number(e.class_id)===Number(cid) && e.exam_date===d);
  const issues = entries.map(e=>({ e, c:checks[e.key]||{errors:[],warnings:[]} })).filter(x=>x.c.errors.length||x.c.warnings.length);
  const errorCount = issues.filter(x=>x.c.errors.length).length;

  const teachers = result?.teachers||[];
  const rooms = result?.rooms||[];
  const editSubjects = edit ? ((result?.class_subjects||{})[edit.class_id]||[]) : [];

  return (
    <div className="ds-modal-overlay ag-overlay">
      <div className="ag-panel">
        <div className="ds-modal-header">
          <div>
            <div className="ds-modal-title">Auto Generate Date Sheet</div>
            <div className="ds-modal-subtitle">{exam.name} &middot; {step==="config" ? "Configure, then generate a preview. Nothing is saved until Save Draft." : "Preview — edit anything, then Save Draft."}</div>
          </div>
          <button onClick={onClose} className="ds-modal-close-btn">&#215;</button>
        </div>

        {msg&&<div className={"ag-msg ds-row-msg ds-row-msg--"+(msg.type==="error"?"error":"done")}>{msg.text}</div>}

        {/* ============================ CONFIGURE ============================ */}
        {step==="config"&&(
          <div className="ag-body">
            <div className="ag-section">
              <div className="ds-common-day-label">Scheduling pattern</div>
              <div className="ag-patterns">
                {PATTERNS.map(([v,t,d])=>(
                  <label key={v} className={"ag-pattern"+(pattern===v?" ag-pattern--on":"")}>
                    <input type="radio" name="agpattern" checked={pattern===v} onChange={()=>setPattern(v)} />
                    <div><div className="ag-pattern-title">{t}</div><div className="ag-pattern-desc">{d}</div></div>
                  </label>
                ))}
              </div>
            </div>

            <div className="ag-section ag-row">
              <div><div className="ds-common-field-label">Start date</div><DatePicker value={start} onChange={setStart} style={{width:160}} /></div>
              <div><div className="ds-common-field-label">End date</div><DatePicker value={end} onChange={setEnd} min={start||undefined} style={{width:160}} /></div>
              <div>
                <div className="ds-common-field-label">Exam days</div>
                <div className="ag-days">{WEEKDAYS.map(([n,v])=>(
                  <button key={v} type="button" className={"ag-day"+(weekdays.includes(v)?" ag-day--on":"")}
                    onClick={()=>setWeekdays(w=>w.includes(v)?w.filter(x=>x!==v):[...w,v].sort())}>{n}</button>
                ))}</div>
              </div>
            </div>

            <div className="ag-section ag-row">
              {multi ? (
                <div className="ds-shift-note">Times come from Exam Shifts: {(shiftCfg.shifts||[]).map(s=>s.name+" "+s.start_time+"–"+endOf(s.start_time,s.duration_mins)).join(" · ")}. Each class sits in its own shift.</div>
              ) : (<>
                <div><div className="ds-common-field-label">Paper start time</div><input type="time" className="ds-time-input" value={startTime} onChange={e=>setStartTime(e.target.value)} /></div>
                <div><div className="ds-common-field-label">Duration (min)</div><input type="number" className="ds-duration-input" value={duration} onChange={e=>setDuration(e.target.value)} /></div>
              </>)}
              <div>
                <div className="ds-common-field-label">Existing entries for these classes</div>
                <select className="ds-field-input" style={{width:330}} value={replace} onChange={e=>setReplace(e.target.value)}>
                  <option value="auto">Keep manual entries, replace earlier generated ones</option>
                  <option value="all">Replace all entries (manual too)</option>
                </select>
              </div>
            </div>

            <div className="ag-section">
              <div className="ag-classes-head">
                <div className="ds-common-day-label">Classes ({classIds.length} of {examClasses.length})</div>
                <button className="ds-select-all-btn" onClick={()=>setClassIds(classIds.length===examClasses.length?[]:examClasses.map(c=>c.class_id))}>
                  {classIds.length===examClasses.length?"Clear all":"Select all"}
                </button>
              </div>
              <div className="ag-class-table">
                {pattern==="classwise"&&<div className="ag-class-hdr"><span>Class</span><span>Starts on</span><span>Leave days between papers</span><span>Subject order</span></div>}
                {examClasses.map(c=>{
                  const on = classIds.includes(c.class_id); const cfg = cfgFor(c.class_id);
                  return (
                    <div key={c.class_id} className={"ag-class"+(on?"":" ag-class--off")}>
                      <label className="ag-class-name">
                        <input type="checkbox" checked={on} onChange={()=>setClassIds(ids=>on?ids.filter(x=>x!==c.class_id):[...ids,c.class_id])} />
                        {label(c.class_name, c.section)}
                        <span className="ag-class-count">{subjectsOf(c.class_id).length} subjects</span>
                      </label>
                      {pattern==="classwise"&&on&&(<>
                        <DatePicker value={cfg.start_date} onChange={v=>setCfg(c.class_id,{start_date:v})} min={start||undefined} max={end||undefined} style={{width:150}} />
                        <select className="ds-row-select" style={{"--row-opacity":1}} value={cfg.gap_days||0} onChange={e=>setCfg(c.class_id,{gap_days:Number(e.target.value)})}>
                          {[0,1,2,3].map(n=><option key={n} value={n}>{n===0?"None (every exam day)":n+" day"+(n>1?"s":"")}</option>)}
                        </select>
                        <button className="ds-select-all-btn" onClick={()=>setOrderOpen(orderOpen===c.class_id?null:c.class_id)}>
                          {(cfg.order||[]).length?"Custom order":"A–Z"} {orderOpen===c.class_id?"\u25B4":"\u25BE"}
                        </button>
                      </>)}
                      {pattern==="classwise"&&on&&orderOpen===c.class_id&&(
                        <div className="ag-order">
                          {orderedSubjects(c.class_id).map((s,i,arr)=>(
                            <div key={s.id} className="ag-order-item">
                              <span className="ag-order-no">{i+1}</span>{s.name}
                              <span className="ag-order-btns">
                                <button disabled={i===0} onClick={()=>moveSubject(c.class_id,i,-1)}>&#9650;</button>
                                <button disabled={i===arr.length-1} onClick={()=>moveSubject(c.class_id,i,1)}>&#9660;</button>
                              </span>
                            </div>
                          ))}
                          <button className="ag-link" onClick={()=>setCfg(c.class_id,{order:[]})}>Reset to A–Z</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================ PREVIEW ============================ */}
        {step==="preview"&&result&&(
          <div className="ag-body">
            <div className="ag-stats">
              <span><b>{entries.length}</b> papers</span>
              <span><b>{dates.length}</b> exam days</span>
              <span><b>{result.stats?.invigilators||0}</b> invigilators, {result.stats?.duty_min}–{result.stats?.duty_max} duties each</span>
              {result.replacing?.auto>0&&<span className="ag-stat-warn">Will replace {result.replacing.auto} earlier entr{result.replacing.auto===1?"y":"ies"}</span>}
              {result.replacing?.kept_manual>0&&<span>{result.replacing.kept_manual} manual entr{result.replacing.kept_manual===1?"y":"ies"} kept</span>}
            </div>

            {(result.problems||[]).length>0&&(
              <div className="ds-row-msgs">
                {result.problems.map((p,i)=><div key={i} className={"ds-row-msg ds-row-msg--"+(p.type==="error"?"error":"warn")}><span className="ds-row-msg-icon">{p.type==="error"?"\u26D4":"\u26A0"}</span>{p.message}</div>)}
              </div>
            )}

            <div className="ag-grid-wrap">
              <table className="ds-datesheet-table ag-grid">
                <thead><tr>
                  <th className="ds-th-class">Class</th>
                  {dates.map(d=>{ const f=fmtDay(d); return (
                    <th key={d} className="ds-th-date"><div className="ds-th-day-label">{f.wd}</div><div className="ds-th-day-num">{f.day}</div><div className="ds-th-day-month">{f.mon}</div></th>
                  ); })}
                </tr></thead>
                <tbody>{rowClasses.map(c=>(
                  <tr key={c.class_id}>
                    <td className="ds-td-class"><div className="ds-td-class-name">{c.class_name}</div>{c.section&&<div className="ds-td-class-section">{c.section}</div>}</td>
                    {dates.map(d=>{ const e=cell(c.class_id,d); const k=e&&checks[e.key];
                      const tone = !e?"":(k?.errors?.length?" ag-cell--error":(k?.warnings?.length?" ag-cell--warn":""));
                      return (
                        <td key={d} className="ds-td-cell" style={{"--cell-bg":"transparent"}}>
                          {e ? (
                            <div className={"ds-cell-entry ag-cell"+tone} onClick={()=>openEdit(e)} title="Click to edit">
                              <div className="ds-cell-subject">{e.subject_name}</div>
                              <div className="ds-cell-venue">{String(e.start_time||"").slice(0,5)}–{endOf(e.start_time,e.duration_mins)}{e.shift_name?" · "+e.shift_name:""}</div>
                              <div className="ds-cell-venue">&#127968; {e.room_name||"No room"}</div>
                              <div className={e.invigilator_name?"ds-cell-teacher-assigned":"ds-cell-teacher-unassigned"}>{e.invigilator_name||"No invigilator"}</div>
                            </div>
                          ) : <span className="ds-cell-empty">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {issues.length>0&&(
              <div className="ag-issues">
                <div className="ds-common-day-label">Issues ({errorCount} must be fixed before saving)</div>
                {issues.map(({e,c})=>(
                  <div key={e.key} className="ag-issue" onClick={()=>openEdit(e)}>
                    <b>{label(e.class_name, e.class_section)} · {e.subject_name} · {e.exam_date}</b>
                    {c.errors.map((x,i)=><div key={"e"+i} className="ds-row-msg ds-row-msg--error"><span className="ds-row-msg-icon">{"\u26D4"}</span>{x.message}</div>)}
                    {c.warnings.map((x,i)=><div key={"w"+i} className="ds-row-msg ds-row-msg--warn"><span className="ds-row-msg-icon">{"\u26A0"}</span>{x.message}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================ FOOTER ============================ */}
        <div className="ds-modal-footer">
          {step==="config" ? (<>
            <button className="ds-cancel-btn" onClick={onClose}>Cancel</button>
            <span className="ds-footer-spacer" />
            <button className="ds-save-btn" disabled={busy} onClick={()=>generate(undefined)}>{busy?"Generating...":"Generate"}</button>
          </>) : (<>
            <button className="ds-cancel-btn" onClick={()=>setStep("config")}>&larr; Settings</button>
            <button className="ds-cancel-btn" disabled={busy} onClick={()=>{ if(window.confirm("Regenerate the whole datesheet? Your edits to this preview will be lost.")) generate(Math.floor(Math.random()*1e9)); }}>Regenerate</button>
            <button className="ds-cancel-btn" onClick={openAdd}>+ Add Entry</button>
            <span className="ds-footer-spacer" />
            <button className="ds-save-btn" disabled={busy||!entries.length||errorCount>0} title={errorCount?"Fix the issues first":""} onClick={()=>save(false)}>{busy?"Saving...":"Save Draft"}</button>
          </>)}
        </div>
      </div>

      {/* ---------------- edit / add popup (preview only) ---------------- */}
      {edit&&(
        <div className="ds-modal-overlay ag-edit-overlay">
          <div className="ds-modal-box" style={{"--modal-max-width":"540px"}}>
            <div className="ds-modal-header">
              <div className="ds-modal-title">{edit._new?"Add Entry":"Edit Entry"}</div>
              <button onClick={()=>setEdit(null)} className="ds-modal-close-btn">&#215;</button>
            </div>
            <div className="ds-modal-body">
              <div className="ds-field-grid-2col">
                <div><label className="ds-field-label">Class</label>
                  <select className="ds-field-input" value={edit.class_id} onChange={e=>setEdit(x=>({...x,class_id:Number(e.target.value),subject_id:""}))}>
                    {rowClasses.map(c=><option key={c.class_id} value={c.class_id}>{label(c.class_name,c.section)}</option>)}
                  </select></div>
                <div><label className="ds-field-label">Subject</label>
                  <select className="ds-field-input" value={edit.subject_id} onChange={e=>setEdit(x=>({...x,subject_id:Number(e.target.value)}))}>
                    <option value="">Select subject</option>
                    {editSubjects.map(s=><option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
                  </select></div>
                <div><label className="ds-field-label">Exam date</label>
                  <DatePicker value={edit.exam_date} onChange={v=>setEdit(x=>({...x,exam_date:v}))} style={{width:"100%"}} /></div>
                {multi ? (
                  <div><label className="ds-field-label">Shift</label>
                    <select className="ds-field-input" value={edit.shift_id||""} onChange={e=>setEdit(x=>({...x,shift_id:e.target.value}))}>
                      <option value="">No shift (own time)</option>
                      {(result?.shifts||[]).map(s=><option key={s.id} value={s.id}>{s.name} ({s.start_time}–{endOf(s.start_time,s.duration_mins)})</option>)}
                    </select></div>
                ) : <div />}
                {!(multi&&edit.shift_id)&&(<>
                  <div><label className="ds-field-label">Start time</label><input type="time" className="ds-field-input" value={edit.start_time||""} onChange={e=>setEdit(x=>({...x,start_time:e.target.value}))} /></div>
                  <div><label className="ds-field-label">End time</label><input type="time" className="ds-field-input" value={edit.end_time||""} onChange={e=>setEdit(x=>({...x,end_time:e.target.value}))} /></div>
                </>)}
                <div><label className="ds-field-label">Room</label>
                  <select className="ds-field-input" value={edit.room_id||""} onChange={e=>setEdit(x=>({...x,room_id:e.target.value}))}>
                    <option value="">No room</option>
                    {rooms.map(r=><option key={r.id} value={r.id}>{r.name} (seats {r.capacity})</option>)}
                  </select></div>
                <div><label className="ds-field-label">Invigilator</label>
                  <select className="ds-field-input" value={edit.teacher_id||""} onChange={e=>setEdit(x=>({...x,teacher_id:e.target.value}))}>
                    <option value="">No invigilator</option>
                    {teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></div>
              </div>
              {editErr&&<div className="ds-check-box ds-check-box--error">&#9888; {editErr}</div>}
              {!edit._new&&(checks[edit.key]?.warnings||[]).length>0&&<div className="ds-check-box ds-check-box--warn">{checks[edit.key].warnings.map((x,i)=><div key={i}>{x.message}</div>)}</div>}
            </div>
            <div className="ds-modal-footer">
              {!edit._new&&<button className="ds-delete-btn" onClick={()=>{ removeEntry(edit.key); setEdit(null); }}>Delete</button>}
              <span className="ds-footer-spacer" />
              <button className="ds-cancel-btn" onClick={()=>setEdit(null)}>Cancel</button>
              <button className="ds-save-btn" onClick={applyEdit}>{edit._new?"Add":"Apply"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
