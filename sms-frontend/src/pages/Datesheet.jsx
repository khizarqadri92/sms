import { useState, useEffect } from "react";
import { examsApi } from "../api/examsApi";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import DatePicker from "../components/DatePicker";
import "./Datesheet.css";
import { useNavigate } from "react-router-dom";
import DatesheetAutoGen from "./DatesheetAutoGen";

// ---- time helpers ("08:30" <-> minutes) ----
const toMin = (t) => { if(!t) return null; const [h,m]=String(t).slice(0,5).split(":").map(Number); return isNaN(h)?null:h*60+(m||0); };
const fromMin = (n) => { const h=Math.floor(n/60)%24, m=n%60; return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"); };
const endOf = (start, dur) => { const s=toMin(start); return s==null?"":fromMin(s+(Number(dur)||0)); };
// backend errors arrive as {detail:{message, errors, warnings}}
const errMsg = (e, fb="Failed.") => e?.response?.data?.detail?.message || e?.response?.data?.message || fb;
const errList = (e) => e?.response?.data?.detail?.errors || [];

export default function Datesheet() {
  const [exams,       setExams]       = useState([]);
  const [selectedExam,setSelectedExam]= useState(null);
  const [datesheet,   setDatesheet]   = useState([]);
  const { user: authUser } = useAuth();
  const role = effectiveRole(authUser)||"";
  const isLocked = selectedExam?.status==="published" && role!=="superadmin";  // always array
  const [examClasses, setExamClasses] = useState([]);
  const [classSubjects,setClassSubjects]=useState({});
  const [teachers,    setTeachers]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [flash,       setFlash]       = useState({});
  const [form,        setForm]        = useState({exam_date:"",start_time:"09:00",duration_mins:120,rows:{}});
  const [showInvig,      setShowInvig]      = useState(false);
  const [invigilatorMode,  setInvigilatorMode]  = useState("incharge");
  const [showEdit,         setShowEdit]         = useState(false);
  const [editEntry,        setEditEntry]        = useState(null);
  const [editForm,         setEditForm]        = useState({});
  const [classIncharges,   setClassIncharges]   = useState({}); // {class_id: teacher_user_id}
  const [requireApproval,   setRequireApproval]   = useState(true);
  const [publishMode,       setPublishMode]       = useState("per_class");
  const [submitRole,       setSubmitRole]       = useState("academic_coordinator");
  const [approveRole,      setApproveRole]      = useState("principal");
  const [publishRole,      setPublishRole]      = useState("academic_coordinator");
  const { user } = useAuth();
  const [invigilatorSubject, setInvigilatorSubject] = useState(null);
  const [invigilatorId,      setInvigilatorId]      = useState("");
  const [invigilatorTab,     setInvigilatorTab]     = useState("class");
  const [rooms,      setRooms]      = useState([]);
  const [shiftCfg,   setShiftCfg]   = useState({ mode:"single", shifts:[], class_shifts:{} });
  const [rowChecks,  setRowChecks]  = useState({});      // {class_id: {errors, warnings}}
  const [editCheck,  setEditCheck]  = useState(null);    // {errors, warnings} for the Edit popup
  const navigate = useNavigate();
  const [showAuto,   setShowAuto]   = useState(false);
  const multi = shiftCfg.mode==="multiple" && (shiftCfg.shifts||[]).length>1;
  const shiftById = Object.fromEntries((shiftCfg.shifts||[]).map(s=>[String(s.id), s]));

  const notify = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash({}), type==="success"?4000:7000); };
  const warnText = (w) => (w||[]).map(x=>x.message).join(" ");

  useEffect(()=>{
    examsApi.getAll().then(r=>setExams(r.data.data||[])).catch(()=>{});
    examsApi.getRooms().then(r=>setRooms(r.data.data||[])).catch(()=>{});
    import("../api/teachersApi").then(({default:t})=>{
      t.getAll({per_page:200}).then(r=>{ const arr=r.data.data?.items||r.data.data||[]; console.log("teachers sample:", arr[0]); setTeachers(arr); }).catch(()=>{});
    });
  },[]);

  const selectExam = async (exam) => {
    setSelectedExam(exam);
    setDatesheet([]);
    setForm({exam_date:"",start_time:"09:00",duration_mins:120,rows:{}});
    setRowChecks({});
    try {
      const sr = await examsApi.getShifts(exam.id);
      setShiftCfg(sr.data.data || { mode:"single", shifts:[], class_shifts:{} });
    } catch { setShiftCfg({ mode:"single", shifts:[], class_shifts:{} }); }
    try {
      const r = await examsApi.getOne(exam.id);
      const detail = r.data.data;
      setExamClasses(detail.exam_classes||[]);
      // Load exam type config for approval setting
      const types = await examsApi.getTypes();
      const et = (types.data.data||[]).find(t=>t.id===exam.exam_type_id);
      setRequireApproval(et?.require_datesheet_approval!==false);
      setSubmitRole(et?.datesheet_submit_role||"academic_coordinator");
      setApproveRole(et?.datesheet_approve_role||"principal");
      setPublishRole(et?.datesheet_publish_role||"academic_coordinator");
      setPublishMode(et?.publish_mode||"per_class");
      const ds = await examsApi.getSubjects(exam.id);
      console.log("subjects response:", ds.data);
      const dsData = ds.data.data||ds.data||[];
      setDatesheet(Array.isArray(dsData)?dsData:[]);
      // Load subjects per class
      const cls = detail.exam_classes||[];
      const {default: academicsApi} = await import("../api/academicsApi");
      const subMap = {};
      const inchargeMap = {};
      for(const c of cls){
        try{
          const rs = await academicsApi.getClassSubjects(c.class_id);
          const list = rs.data?.data ?? rs.data ?? [];
          subMap[c.class_id] = Array.isArray(list) ? list : [];
          console.log("[Datesheet] subjects for class", c.class_id, "->", subMap[c.class_id].length, "found", subMap[c.class_id][0] || "(none)");
        }catch(e){
          console.error("[Datesheet] failed to load subjects for class", c.class_id, e?.response?.status, e?.response?.data || e?.message);
        }
        try{
          const rt = await academicsApi.getClassTeachers(c.class_id);
          const incharge = (rt.data.data||[]).find(t=>t.is_primary);
          if(incharge) inchargeMap[c.class_id] = incharge.teacher_id;
        }catch(e){}
      }
      setClassSubjects(subMap);
      setClassIncharges(inchargeMap);
      console.log("inchargeMap:", inchargeMap);
    } catch(e){ notify("error","Failed to load exam details."); }
  };

  // One add-row -> the entry the backend expects (shift supplies the time when used)
  const entryPayload = (classId, r) => {
    const sh = multi && r.shift_id ? shiftById[String(r.shift_id)] : null;
    return {
      class_id: classId, subject_id: Number(r.subject_id),
      teacher_id: r.teacher_id ? Number(r.teacher_id) : (classIncharges[classId]||null),
      exam_date: form.exam_date,
      start_time: sh ? sh.start_time : form.start_time,
      duration_mins: sh ? sh.duration_mins : (Number(form.duration_mins)||120),
      room_id: r.room_id ? Number(r.room_id) : null,
      shift_id: sh ? sh.id : null,
      venue: r.room_id ? "" : (r.venue||""),
    };
  };

  // After a successful add, untick and clear those rows so the class shows as
  // "scheduled" instead of warning about the paper that was just added.
  const clearRows = (classIds) => setForm(f=>{
    const rows = {...(f.rows||{})};
    classIds.forEach(id=>{ rows[id] = { checked:false }; });
    return {...f, rows};
  });

  const reloadDS = async () => {
    const ds = await examsApi.getSubjects(selectedExam.id);
    setDatesheet(Array.isArray(ds.data.data)?ds.data.data:[]);
  };

  const addEntry = async (classId, rowData) => {
    if(!form.exam_date) return notify("error","Select exam date.");
    if(!rowData.subject_id) return notify("error","Select a subject.");
    if(multi && !rowData.shift_id) return notify("error","Select a shift.");
    setLoading(true);
    try {
      const res = await examsApi.addSubject(selectedExam.id, entryPayload(classId, rowData));
      await reloadDS();
      clearRows([classId]);
      const w = res.data?.data?.warnings||[];
      w.length ? notify("warning","Added. Note: "+warnText(w)) : notify("success","Added.");
    } catch(e){ notify("error",errMsg(e)); }
    finally{ setLoading(false); }
  };

  const addAll = async () => {
    if(!form.exam_date) return notify("error","Select exam date.");
    const rows = form.rows||{};
    const toAdd = examClasses.filter(c=>{
        const r=rows[c.class_id];
        if(!r?.checked||!r?.subject_id) return false;
        const duplicate = safeDS.find(s=>s.class_id===c.class_id&&s.exam_date===form.exam_date);
        return !duplicate;
      });
    if(!toAdd.length) return notify("error","Check classes and select subjects.");
    if(multi && toAdd.some(c=>!rows[c.class_id].shift_id)) return notify("error","Select a shift for every checked class.");
    setLoading(true);
    let added = 0; const failed = []; const done = [];
    try {
      for(const cls of toAdd){
        try {
          await examsApi.addSubject(selectedExam.id, entryPayload(cls.class_id, rows[cls.class_id]));
          added++; done.push(cls.class_id);
        } catch(e){ failed.push((cls.class_name+(cls.section?" ("+cls.section+")":""))+": "+errMsg(e)); }
      }
      await reloadDS();
      clearRows(done);
      if(failed.length) notify(added?"warning":"error", (added?added+" added. ":"")+"Not added - "+failed.join(" | "));
      else notify("success",added+" entries added.");
    } finally{ setLoading(false); }
  };

  const removeEntry = async (id) => {
    try {
      await examsApi.deleteSubject(selectedExam.id, id);
      setDatesheet(prev=>prev.filter(s=>s.id!==id));
      notify("success","Removed.");
    } catch(e){ notify("error",errMsg(e)); }
  };

  const assignInvigilator = async () => {
    if(!invigilatorId) return;
    try {
      const s = invigilatorSubject;
      console.log("Assigning invigilator:", invigilatorId, "to subject:", s);
      const res = await examsApi.addSubject(selectedExam.id,{
        class_id:s.class_id, subject_id:s.subject_id,
        teacher_id:Number(invigilatorId),
        exam_date:s.exam_date, start_time:s.start_time?String(s.start_time).slice(0,8):null,
        duration_mins:s.duration_mins||120, venue:s.venue||"",
        room_id:s.room_id||null, shift_id:s.shift_id||null,
        total_marks:s.total_marks, passing_marks:s.passing_marks, source:s.source
      });
      await reloadDS();
      setShowInvig(false);
      const w = res.data?.data?.warnings||[];
      w.length ? notify("warning","Invigilator assigned. Note: "+warnText(w)) : notify("success","Invigilator assigned.");
    } catch(e){ notify("error",errMsg(e)); }
  };

  const submitDatesheet = async () => {
    try { await examsApi.submitDatesheet(selectedExam.id); notify("success","Submitted for approval."); const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data); } catch(e){ notify("error","Failed."); }
  };

  // Live conflict check for each checked add-row (saved entries via backend,
  // plus clashes between the unsaved rows themselves, checked here)
  useEffect(()=>{
    if(!selectedExam || !form.exam_date){ setRowChecks({}); return; }
    const rows = form.rows||{};
    const targets = examClasses.filter(c=>rows[c.class_id]?.checked && rows[c.class_id]?.subject_id);
    if(!targets.length){ setRowChecks({}); return; }
    const h = setTimeout(async()=>{
      const out = {};
      await Promise.all(targets.map(async c=>{
        try { const r = await examsApi.checkEntry(selectedExam.id, entryPayload(c.class_id, rows[c.class_id])); out[c.class_id] = r.data.data; }
        catch { out[c.class_id] = { errors:[], warnings:[] }; }
      }));
      // same room / same invigilator picked for two unsaved rows in the same slot
      const slotKey = (cid) => { const p = entryPayload(cid, rows[cid]); return p.start_time+"|"+p.duration_mins; };
      const seen = { room:{}, teacher:{} };
      targets.forEach(c=>{
        const p = entryPayload(c.class_id, rows[c.class_id]); const k = slotKey(c.class_id);
        const mark = (kind, id, label) => {
          const key = kind+id+"|"+k;
          if(seen[kind][key]!==undefined){
            [c.class_id, seen[kind][key]].forEach(cid=>{ (out[cid]=out[cid]||{errors:[],warnings:[]}).errors.push({code:"row_"+kind, message:label}); });
          } else seen[kind][key] = c.class_id;
        };
        if(p.room_id) mark("room", p.room_id, "Same room picked for another class at this time.");
        if(p.teacher_id && !p.room_id) mark("teacher", p.teacher_id, "Same invigilator picked for another class at this time.");
      });
      setRowChecks(out);
    }, 500);
    return ()=>clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[form, selectedExam?.id, shiftCfg, examClasses]);

  // Edit popup: entry as the backend expects it
  const editPayload = () => {
    const sh = multi && editForm.shift_id ? shiftById[String(editForm.shift_id)] : null;
    const start = sh ? sh.start_time : editForm.start_time;
    const dur = sh ? sh.duration_mins : Math.max((toMin(editForm.end_time)??0)-(toMin(editForm.start_time)??0), 0);
    return {
      class_id:Number(editForm.class_id), subject_id:Number(editForm.subject_id),
      teacher_id:editForm.teacher_id?Number(editForm.teacher_id):null,
      exam_date:editForm.exam_date||null, start_time:start||null, duration_mins:dur||120,
      room_id:editForm.room_id?Number(editForm.room_id):null, shift_id:sh?sh.id:null,
      venue:editForm.room_id?"":(editForm.venue||""),
      total_marks:editEntry?.total_marks, passing_marks:editEntry?.passing_marks,
    };
  };
  useEffect(()=>{
    if(!showEdit || !editEntry || !editForm.class_id || !editForm.subject_id){ setEditCheck(null); return; }
    const h = setTimeout(async()=>{
      try { const r = await examsApi.checkEntry(selectedExam.id, {...editPayload(), exclude_id:editEntry.id}); setEditCheck(r.data.data); }
      catch { setEditCheck(null); }
    }, 400);
    return ()=>clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editForm, showEdit]);

  const openEdit = (cell) => {
    const start = cell.start_time?String(cell.start_time).slice(0,5):"";
    setEditEntry(cell);
    setEditForm({
      class_id:cell.class_id, subject_id:cell.subject_id, exam_date:cell.exam_date||"",
      shift_id:cell.shift_id?String(cell.shift_id):"", start_time:start,
      end_time:start?endOf(start, cell.duration_mins||120):"",
      room_id:cell.room_id?String(cell.room_id):"", venue:cell.room_id?"":(cell.venue||""),
      teacher_id:cell.teacher_id||"",
    });
    setEditCheck(null);
    setShowEdit(true);
  };

  // Build grid data
  const safeDS = Array.isArray(datesheet)?datesheet:[];
  const userRole = effectiveRole(user)||"";
  const canSubmit  = userRole===submitRole||userRole==="superadmin"||userRole==="admin";
  const canApprove = userRole===approveRole||userRole==="superadmin";
  const canPublish = userRole===publishRole||userRole==="superadmin"||userRole==="admin";
  const dates = [...new Set(safeDS.map(s=>s.exam_date||""))].filter(Boolean).sort();
  const cellMap = {};
  safeDS.forEach(s=>{ cellMap[(s.class_id||"")+"__"+(s.exam_date||"")] = s; });
  const pendingInvig = safeDS.filter(s=>!(s.invigilator_name||s.teacher_name)).length;

  return (
    <div className="ds-page">
      <div className="ds-header">
        <div className="ds-h1">Datesheet</div>
        <div className="ds-header-row">
          <div className="ds-sub">Build and manage exam datesheets for all classes</div>
          <div className="ds-header-btns">
            {selectedExam&&!isLocked&&examClasses.length>0&&(
              <button className="ds-auto-btn" onClick={()=>setShowAuto(true)}>&#9889; Auto Generate Date Sheet</button>
            )}
            <button className="ds-cancel-btn" onClick={()=>navigate("/exam-rooms")}>Manage Rooms</button>
          </div>
        </div>
      </div>

      {flash.msg&&<div className={"ds-flash ds-flash--"+(flash.type||"success")}>{flash.msg}</div>}

      {/* Exam Selector */}
      <div className="ds-card">
        <div className="ds-card-hdr"><div className="ds-card-title">Select Exam</div></div>
        <div className="ds-exam-selector-body">
          <div className="ds-exam-grid">
            {exams.map(e=>(
              <div key={e.id} onClick={()=>selectExam(e)} className="ds-exam-chip"
                style={{ "--chip-border": selectedExam?.id===e.id?"#0f4c35":"var(--border-color)", "--chip-bg": selectedExam?.id===e.id?"var(--bg-success-soft)":"var(--color-background-secondary)" }}>
                <div className="ds-exam-chip-name">{e.name}</div>
                <div className="ds-exam-chip-meta">{e.exam_type_name} &middot; {e.academic_year}</div>
                <div className="ds-exam-chip-meta2">{e.class_count} class{e.class_count!==1?"es":""} &middot; {e.total_subjects} subjects</div>
                <div className="ds-exam-status-wrap">
                  {(()=>{
                    const ds = e.datesheet_status||"draft";
                    const colors={draft:["var(--bg-hover)","var(--text-secondary)"],submitted:["var(--bg-info-soft)","#1e40af"],approved:["var(--bg-warning-soft)","#854d0e"],published:["var(--bg-success-soft)","#166534"]};
                    const [bg,col]=(colors[ds]||colors.draft);
                    return <span style={{fontSize:10,fontWeight:600,background:bg,color:col,padding:"2px 8px",borderRadius:10}}>{ds.charAt(0).toUpperCase()+ds.slice(1)}</span>;
                  })()}
                </div>
              </div>
            ))}
            {exams.length===0&&<div className="ds-no-exams-text">No exams found. Create an exam first.</div>}
          </div>
        </div>
      </div>

      {selectedExam&&(
        <>
          {!isLocked&&(
          <div style={{marginBottom:0}}>
          <ShiftSettings exam={selectedExam} examClasses={examClasses} cfg={shiftCfg}
            onSaved={async()=>{ const sr=await examsApi.getShifts(selectedExam.id); setShiftCfg(sr.data.data); await reloadDS(); }}
            notify={notify} />
          {/* Add Entry */}
          <div className="ds-card">
            <div className="ds-card-hdr">
              <div className="ds-card-title">Add to Datesheet — {selectedExam.name}</div>
              <button onClick={()=>setForm(f=>({...f,rows:Object.fromEntries(examClasses.map(c=>[c.class_id,{...(f.rows||{})[c.class_id],checked:true}]))}))} className="ds-select-all-btn">Select All</button>
            </div>

            {/* Common date/time */}
            <div className="ds-common-day-section">
              <div className="ds-common-day-label">Common for this day</div>
              <div className="ds-common-day-row">
                <div><div className="ds-common-field-label">Exam Date *</div><DatePicker style={{padding:"8px 12px",border:"1.5px solid var(--border-color)",borderRadius:8,fontSize:13,color:"var(--text-heading)",background:"var(--bg-input)"}} value={form.exam_date} onChange={val=>setForm(f=>({...f,exam_date:val,rows:Object.fromEntries(Object.entries(f.rows||{}).map(([k,v])=>([k,{...v,checked:false}]))),all_classes:false}))} /></div>
                {multi ? (
                  <div className="ds-shift-note">Times come from each class&apos;s shift: {(shiftCfg.shifts||[]).map(s=>s.name+" "+s.start_time+"–"+endOf(s.start_time,s.duration_mins)).join(" · ")}</div>
                ) : (<>
                <div><div className="ds-common-field-label">Start Time</div><input type="time" className="ds-time-input" value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))} /></div>
                <div><div className="ds-common-field-label">Duration (min)</div><input type="number" className="ds-duration-input" value={form.duration_mins} onChange={e=>setForm(f=>({...f,duration_mins:e.target.value}))} /></div>
                </>)}
              </div>
            </div>

            {/* Per-class grid */}
            <div className={"ds-grid-header-row"+(multi?" ds-cols-shift":"")}>
              {(multi?["Class","Subject","Shift","Room","Invigilator",""]:["Class","Subject","Room","Invigilator",""]).map((h,i)=><div key={i} className="ds-grid-header-cell">{h}</div>)}
            </div>

            {examClasses.map(cls=>{
              // Check if this class already has a subject on this date
              const alreadyOnDate = safeDS.find(s=>s.class_id===cls.class_id&&s.exam_date===form.exam_date);
              // Check if selected subject already exists on another date for this class
              const rowData2=(form.rows||{})[cls.class_id]||{};
              const subjectOnOtherDate = rowData2.subject_id ? safeDS.find(s=>s.class_id===cls.class_id&&s.subject_id===Number(rowData2.subject_id)&&s.exam_date!==form.exam_date) : null;
              const rowData=(form.rows||{})[cls.class_id]||{};
              const checked=!!rowData.checked;
              const hasDuplicate = alreadyOnDate && checked;
              const hasSubjectWarning = subjectOnOtherDate && checked;
              const chk = checked ? rowChecks[cls.class_id] : null;
              const rowErrors = chk?.errors||[]; const rowWarns = chk?.warnings||[];
              return (
                <div key={cls.class_id} className={"ds-class-row"+(multi?" ds-cols-shift":"")}
                  style={{ "--row-bg": hasDuplicate?"var(--bg-warning-soft)":checked?"var(--bg-card)":"var(--color-background-secondary)", "--row-border-left": hasDuplicate?"3px solid #f59e0b":hasSubjectWarning?"3px solid #3b82f6":"3px solid transparent" }}>
                  <div className="ds-class-check-wrap" onClick={()=>setForm(f=>{const wasChecked=(f.rows||{})[cls.class_id]?.checked;const inchargeId=classIncharges[cls.class_id];const prev=(f.rows||{})[cls.class_id]||{};const defShift=shiftCfg.class_shifts?.[cls.class_id];return{...f,rows:{...(f.rows||{}),[cls.class_id]:{...prev,checked:!wasChecked,teacher_id:!wasChecked?(inchargeId?String(inchargeId):""):prev.teacher_id,shift_id:!wasChecked&&!prev.shift_id&&defShift?String(defShift):prev.shift_id}}};})}>
                    <div className="ds-checkbox-box" style={{ "--checkbox-border": checked?"#0f4c35":"#cbd5e1", "--checkbox-bg": checked?"#0f4c35":"var(--bg-card)" }}>
                      {checked&&<span className="ds-checkbox-check">&#10003;</span>}
                    </div>
                    <div>
                      <span className="ds-class-name-text" style={{ "--name-color": checked?"var(--text-heading)":"var(--text-muted)" }}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</span>

                    </div>
                  </div>
                  <select disabled={!checked} value={rowData.subject_id||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],subject_id:e.target.value}}}))} className="ds-row-select" style={{ "--row-opacity": checked?1:.4 }}>
                    <option value="">Select subject</option>
                    {(classSubjects[cls.class_id]||[]).map(s=><option key={s.subject_id||s.id} value={s.subject_id||s.id}>{s.name||s.subject_name||s.code||("Subject #"+(s.subject_id||s.id))}</option>)}
                  </select>
                  {multi&&(
                    <select disabled={!checked} value={rowData.shift_id||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],shift_id:e.target.value}}}))} className="ds-row-select" style={{ "--row-opacity": checked?1:.4 }}>
                      <option value="">Select shift</option>
                      {(shiftCfg.shifts||[]).map(s=><option key={s.id} value={s.id}>{s.name} ({s.start_time})</option>)}
                    </select>
                  )}
                  {rooms.length>0 ? (
                    <select disabled={!checked} value={rowData.room_id||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],room_id:e.target.value}}}))} className="ds-row-select" style={{ "--row-opacity": checked?1:.4 }}>
                      <option value="">No room</option>
                      {rooms.map(r=><option key={r.id} value={r.id}>{r.name} (seats {r.capacity})</option>)}
                    </select>
                  ) : (
                    <input disabled={!checked} placeholder="Room / Hall" value={rowData.venue||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],venue:e.target.value}}}))} className="ds-row-input" style={{ "--row-opacity": checked?1:.4 }} />
                  )}
                  <select disabled={!checked} value={rowData.teacher_id||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],teacher_id:e.target.value}}}))} className="ds-row-teacher-select" style={{ "--row-opacity": checked?1:.4 }}>
                    {(()=>{
                      const inchargeId = classIncharges[cls.class_id];
                      const incharge = inchargeId ? teachers.find(t=>Number(t.id)===Number(inchargeId)) : null;
                      const others = teachers.filter(t=>!incharge||Number(t.id)!==Number(inchargeId));
                      return (<>
                        <option value="">No invigilator</option>
                        {incharge&&<optgroup label="Class Incharge">
                          <option value={String(incharge.id)}>{incharge.first_name} {incharge.last_name} (Incharge)</option>
                        </optgroup>}
                        {others.length>0&&<optgroup label="Other Teachers">
                          {others.map(t=><option key={t.id} value={String(t.id)}>{t.first_name} {t.last_name}</option>)}
                        </optgroup>}
                      </>);
                    })()}
                  </select>
                  <button disabled={isLocked||!checked||!rowData.subject_id||loading||hasDuplicate||rowErrors.length>0} title={rowErrors.length?rowErrors.map(x=>x.message).join(" "):""} onClick={()=>!hasDuplicate&&!rowErrors.length&&addEntry(cls.class_id,rowData)} className="ds-add-btn" style={{ "--add-bg": checked&&rowData.subject_id?"#0f4c35":"var(--border-color)", "--add-color": checked&&rowData.subject_id?"#fff":"var(--text-muted)", "--add-cursor": checked&&rowData.subject_id?"pointer":"not-allowed" }}>Add</button>
                  {(()=>{
                    const items = [];
                    if(hasDuplicate) items.push({t:"error", m:"Already has "+alreadyOnDate.subject_name+" on this date. Pick another date or remove that paper first."});
                    rowErrors.filter(x=>x.code!=="class_two_papers").forEach(x=>items.push({t:"error", m:x.message}));
                    if(hasSubjectWarning&&!hasDuplicate&&!rowErrors.some(x=>x.code==="subject_repeated")) items.push({t:"info", m:"This subject is already scheduled on "+subjectOnOtherDate.exam_date+". Adding it here moves it to this date."});
                    rowWarns.forEach(x=>items.push({t:"warn", m:x.message}));
                    if(alreadyOnDate&&!checked) items.push({t:"done", m:"Scheduled: "+alreadyOnDate.subject_name+(alreadyOnDate.room_name||alreadyOnDate.venue?" · "+(alreadyOnDate.room_name||alreadyOnDate.venue):"")});
                    if(!items.length) return null;
                    const icon = {error:"\u26D4", warn:"\u26A0", info:"\u2139", done:"\u2713"};
                    return (
                      <div className="ds-row-msgs">
                        {items.map((x,k)=><div key={k} className={"ds-row-msg ds-row-msg--"+x.t}><span className="ds-row-msg-icon">{icon[x.t]}</span>{x.m}</div>)}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            <div className="ds-add-all-row">
              <button disabled={loading} onClick={addAll} disabled={isLocked} className="ds-add-all-btn">Add All Selected &rarr;</button>
            </div>
          </div>


          {/* Action Buttons - always visible when exam selected */}
          <div className="ds-action-bar">
            <div className="ds-action-status-text">
              Datesheet status: <strong style={{color:"var(--text-heading)"}}>{selectedExam.datesheet_status||"Draft"}</strong>
              {safeDS.length>0&&<span className="ds-action-entries-count">{safeDS.length} entries</span>}
              {publishMode==="all_classes"&&<span className="ds-action-allclasses-note">All Classes mode — publish only when all classes ready</span>}
            </div>
            <div className="ds-action-btns-row">
              {!requireApproval&&canPublish&&(!selectedExam.datesheet_status||selectedExam.datesheet_status==="draft")&&safeDS.length>0&&(
                <button onClick={async()=>{try{await examsApi.publishDatesheet(selectedExam.id);notify("success","Datesheet published!");const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data);}catch(e){notify("error","Failed.");}}} className="ds-action-btn" style={{background:"#166534"}}>Publish Datesheet</button>
              )}
              {requireApproval&&canSubmit&&(!selectedExam.datesheet_status||selectedExam.datesheet_status==="draft")&&safeDS.length>0&&(
                <button onClick={submitDatesheet} className="ds-action-btn" style={{background:"#0f4c35"}}>Submit for Approval</button>
              )}
              {requireApproval&&canApprove&&selectedExam.datesheet_status==="submitted"&&(
                <button onClick={async()=>{try{await examsApi.approveDatesheet(selectedExam.id);notify("success","Datesheet approved.");const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data);}catch(e){notify("error","Failed.");}}} className="ds-action-btn" style={{background:"#166534"}}>Approve Datesheet</button>
              )}
              {requireApproval&&canPublish&&selectedExam.datesheet_status==="approved"&&(
                <button onClick={async()=>{try{await examsApi.publishDatesheet(selectedExam.id);notify("success","Datesheet published!");const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data);}catch(e){notify("error","Failed.");}}} className="ds-action-btn" style={{background:"#166534"}}>Publish Datesheet</button>
              )}
              {selectedExam.datesheet_status==="published"&&(
                <span className="ds-published-badge">Datesheet Published</span>
              )}
            </div>
          </div>
          {/* Grid Preview */}
          {safeDS.length>0&&(
            <div className="ds-card">
              <div className="ds-card-hdr">
                <div>
                  <div className="ds-card-title">Datesheet Grid</div>
                  <div className="ds-grid-meta-text">{datesheet.length} entries &middot; {dates.length} days &middot; {examClasses.length} classes{pendingInvig>0?" · ":""}{pendingInvig>0&&<span className="ds-pending-invig-text">{pendingInvig} invigilator{pendingInvig!==1?"s":""} pending</span>}</div>
                </div>

              </div>
              <div>
                <table className="ds-datesheet-table">
                  <thead>
                    <tr>
                      <th className="ds-th-class">Class</th>
                      {dates.map(d=>{
                        const dt=new Date(d+"T00:00:00");
                        const sample=datesheet.find(s=>s.exam_date===d);
                        return (
                          <th key={d} className="ds-th-date">
                            <div className="ds-th-day-label">{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                            <div className="ds-th-day-num">{dt.getDate()}</div>
                            <div className="ds-th-day-month">{dt.toLocaleDateString("en-PK",{month:"long",year:"numeric"})}</div>
                            {sample&&<div className="ds-th-time-badge">{sample.start_time?sample.start_time.slice(0,5):"--:--"} &middot; {sample.duration_mins||120} min</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {examClasses.map(cls=>(
                      <tr key={cls.class_id}>
                        <td className="ds-td-class">
                          <div className="ds-td-class-name">{cls.class_name}</div>
                          {cls.section&&<div className="ds-td-class-section">Section {cls.section}</div>}
                        </td>
                        {dates.map(d=>{
                          const cell=cellMap[cls.class_id+"__"+d];
                          return (
                            <td key={d} className="ds-td-cell" style={{ "--cell-bg": cell?"var(--bg-card)":"var(--color-background-secondary)" }}>
                              {cell?(
                                <div className="ds-cell-entry">
                                  <div className="ds-cell-subject">{cell.subject_name}{cell.source==="auto"&&<span className="ds-auto-badge">Auto</span>}</div>
                                  <div className="ds-cell-venue">&#127968; {cell.room_name||cell.venue||"—"}{cell.shift_name?" · "+cell.shift_name:""}</div>
                                  {(cell.invigilator_name||cell.teacher_name)
                                    ?<div className="ds-cell-teacher-assigned"><span className="ds-cell-teacher-dot-assigned"></span>{cell.invigilator_name||cell.teacher_name}</div>
                                    :<div onClick={()=>{setInvigilatorSubject(cell);const inc=classIncharges[cell.class_id];setInvigilatorId(inc?String(inc):"");setInvigilatorTab("class");setShowInvig(true);}} className="ds-cell-teacher-unassigned"><span className="ds-cell-teacher-dot-unassigned"></span>Assign invigilator</div>
                                  }
                                  <div className="ds-cell-actions">
                                    <button onClick={e=>{e.stopPropagation();openEdit(cell);}} className="ds-cell-edit-btn" style={{display:isLocked?"none":"inline"}}>Edit</button>
                                    <button onClick={()=>removeEntry(cell.id)} className="ds-cell-remove-btn">&#215;</button>
                                  </div>
                                </div>
                              ):(
                                <span className="ds-cell-empty">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>)}
        </>
      )}

      {showAuto&&selectedExam&&(
        <DatesheetAutoGen exam={selectedExam} examClasses={examClasses} classSubjects={classSubjects} shiftCfg={shiftCfg}
          onClose={()=>setShowAuto(false)}
          onSaved={async(m)=>{ setShowAuto(false); await reloadDS(); notify("success", m+" Review it below, then submit or publish as usual."); }} />
      )}

      {/* Edit Entry Modal - every field editable, checked live */}
      {showEdit&&editEntry&&(()=>{
        const errs = editCheck?.errors||[]; const warns = editCheck?.warnings||[];
        const editSubjects = classSubjects[editForm.class_id]||[];
        const setF = (k)=>(e)=>{ const v = e&&e.target?e.target.value:e; setEditForm(f=>({...f,[k]:v})); };
        const inchargeId = classIncharges[editForm.class_id];
        const incharge = inchargeId ? teachers.find(t=>Number(t.id)===Number(inchargeId)) : null;
        return (
        <div className="ds-modal-overlay">
          <div className="ds-modal-box" style={{"--modal-max-width":"560px"}}>
            <div className="ds-modal-header">
              <div>
                <div className="ds-modal-title">Edit Datesheet Entry</div>
                <div className="ds-modal-subtitle">{editEntry.class_name}{editEntry.class_section?" ("+editEntry.class_section+")":""} &middot; {editEntry.subject_name}{editEntry.source==="auto"?" · generated":""}</div>
              </div>
              <button onClick={()=>setShowEdit(false)} className="ds-modal-close-btn">&#215;</button>
            </div>
            <div className="ds-modal-body">
              <div className="ds-field-grid-2col">
                <div><label className="ds-field-label">Class</label>
                  <select value={editForm.class_id||""} onChange={e=>setEditForm(f=>({...f,class_id:e.target.value,subject_id:""}))} className="ds-field-input">
                    {examClasses.map(c2=><option key={c2.class_id} value={c2.class_id}>{c2.class_name}{c2.section?" ("+c2.section+")":""}</option>)}
                  </select></div>
                <div><label className="ds-field-label">Subject</label>
                  <select value={editForm.subject_id||""} onChange={setF("subject_id")} className="ds-field-input">
                    <option value="">Select subject</option>
                    {editSubjects.map(s=><option key={s.subject_id||s.id} value={s.subject_id||s.id}>{s.name||s.subject_name||s.code}</option>)}
                  </select></div>
                <div><label className="ds-field-label">Exam Date</label>
                  <DatePicker value={editForm.exam_date} onChange={val=>setEditForm(f=>({...f,exam_date:val}))} style={{width:"100%"}} /></div>
                {multi ? (
                  <div><label className="ds-field-label">Shift</label>
                    <select value={editForm.shift_id||""} onChange={setF("shift_id")} className="ds-field-input">
                      <option value="">No shift (own time)</option>
                      {(shiftCfg.shifts||[]).map(s=><option key={s.id} value={s.id}>{s.name} ({s.start_time}–{endOf(s.start_time,s.duration_mins)})</option>)}
                    </select></div>
                ) : <div />}
                {!(multi&&editForm.shift_id)&&(<>
                  <div><label className="ds-field-label">Start Time</label>
                    <input type="time" value={editForm.start_time||""} onChange={setF("start_time")} className="ds-field-input" /></div>
                  <div><label className="ds-field-label">End Time</label>
                    <input type="time" value={editForm.end_time||""} onChange={setF("end_time")} className="ds-field-input" /></div>
                </>)}
                <div><label className="ds-field-label">Room</label>
                  {rooms.length>0 ? (
                    <select value={editForm.room_id||""} onChange={setF("room_id")} className="ds-field-input">
                      <option value="">No room</option>
                      {rooms.map(r=><option key={r.id} value={r.id}>{r.name} (seats {r.capacity})</option>)}
                    </select>
                  ) : (
                    <input value={editForm.venue||""} onChange={setF("venue")} placeholder="Room / Hall" className="ds-field-input" />
                  )}</div>
                <div><label className="ds-field-label">Invigilator</label>
                  <select value={editForm.teacher_id||""} onChange={setF("teacher_id")} className="ds-field-input">
                    <option value="">No invigilator</option>
                    {incharge&&<optgroup label="Class Incharge"><option value={incharge.id}>{incharge.first_name} {incharge.last_name} (Incharge)</option></optgroup>}
                    <optgroup label="Other Teachers">{teachers.filter(t=>Number(t.id)!==Number(inchargeId)).map(t=><option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}</optgroup>
                  </select></div>
              </div>
              {errs.length>0&&<div className="ds-check-box ds-check-box--error">{errs.map((x,i)=><div key={i}>&#9888; {x.message}</div>)}</div>}
              {warns.length>0&&<div className="ds-check-box ds-check-box--warn">{warns.map((x,i)=><div key={i}>{x.message}</div>)}</div>}
            </div>
            <div className="ds-modal-footer">
              <button onClick={()=>{ if(window.confirm("Delete this entry?")){ removeEntry(editEntry.id); setShowEdit(false); } }} className="ds-delete-btn">Delete</button>
              <span className="ds-footer-spacer" />
              <button onClick={()=>setShowEdit(false)} className="ds-cancel-btn">Cancel</button>
              <button disabled={loading||errs.length>0||!editForm.subject_id} onClick={async()=>{
                setLoading(true);
                try{
                  const res = await examsApi.updateEntry(selectedExam.id, editEntry.id, editPayload());
                  await reloadDS();
                  setShowEdit(false);
                  const w = res.data?.data?.warnings||[];
                  w.length ? notify("warning","Entry updated. Note: "+warnText(w)) : notify("success","Entry updated.");
                }catch(e){ const l=errList(e); l.length?setEditCheck({errors:l,warnings:[]}):notify("error",errMsg(e)); }
                finally{setLoading(false);}
              }} className="ds-save-btn">Save Changes</button>
            </div>
          </div>
        </div>);
      })()}

      {/* Invigilator Modal */}
      {showInvig&&invigilatorSubject&&(
        <div className="ds-modal-overlay">
          <div className="ds-modal-box" style={{"--modal-max-width":"440px"}}>
            <div className="ds-modal-header">
              <div>
                <div className="ds-modal-title">Assign Invigilator</div>
                <div className="ds-modal-subtitle">Subject: <strong>{invigilatorSubject.subject_name}</strong> &middot; {invigilatorSubject.class_name}{invigilatorSubject.section?" ("+invigilatorSubject.section+")":""}</div>
              </div>
            </div>
            <div className="ds-modal-body">
              <div className="ds-invig-tabs">
                {[{v:"class",l:"Class Teachers"},{v:"other",l:"Other Teachers"}].map(t=>(
                  <button key={t.v} onClick={()=>{setInvigilatorTab(t.v);setInvigilatorId("");}} className="ds-invig-tab-btn"
                    style={{ "--tab-bg": invigilatorTab===t.v?"var(--bg-card)":"transparent", "--tab-color": invigilatorTab===t.v?"var(--text-heading)":"var(--text-secondary)", "--tab-weight": invigilatorTab===t.v?600:400, "--tab-shadow": invigilatorTab===t.v?"0 1px 3px rgba(0,0,0,0.08)":"none" }}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="ds-invig-list">
                {(()=>{
                  const classId = invigilatorSubject?.class_id;
                  const inchargeId = classIncharges[classId];
                  const displayTeachers = invigilatorTab==="class"
                    ? (inchargeId ? teachers.filter(t=>t.id===inchargeId) : [])
                    : teachers.filter(t=>t.id!==inchargeId);
                  if(displayTeachers.length===0) return (
                    <div className="ds-invig-empty-text">
                      {invigilatorTab==="class" ? "No class incharge assigned for this class." : "No other teachers found."}
                    </div>
                  );
                  return displayTeachers.map(t=>(
                    <div key={t.id} onClick={()=>setInvigilatorId(String(t.id))} className="ds-invig-item"
                      style={{ "--item-border": invigilatorId===String(t.id)?"#0f4c35":"var(--border-color)", "--item-bg": invigilatorId===String(t.id)?"var(--bg-success-soft)":"var(--color-background-secondary)" }}>
                      <div className="ds-invig-avatar" style={{ "--avatar-bg": invigilatorTab==="class"?"#166534":"#2563eb" }}>{(t.first_name||"")[0]}{(t.last_name||"")[0]}</div>
                      <div style={{flex:1}}>
                        <div className="ds-invig-name">{t.first_name} {t.last_name}</div>
                        {invigilatorTab==="class"&&<div className="ds-invig-incharge-label">Class Incharge</div>}
                      </div>
                      {invigilatorId===String(t.id)&&<span className="ds-invig-selected-badge">Selected</span>}
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={()=>setShowInvig(false)} className="ds-cancel-btn">Cancel</button>
              <button disabled={!invigilatorId} onClick={assignInvigilator} className="ds-save-btn">Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ===========================================================================
// Shift settings for the selected exam (shared by manual and auto datesheets)
// ===========================================================================
function ShiftSettings({ exam, examClasses, cfg, onSaved, notify }) {
  const [open, setOpen]   = useState(false);
  const [mode, setMode]   = useState("single");
  const [count, setCount] = useState(2);
  const [first, setFirst] = useState("08:30");
  const [dur, setDur]     = useState(120);
  const [gap, setGap]     = useState(30);
  const [rows, setRows]   = useState([]);          // [{shift_no,name,start_time,duration_mins}]
  const [classMap, setClassMap] = useState({});    // {class_id: shift_no}
  const [saving, setSaving] = useState(false);

  const isMulti = cfg.mode==="multiple" && (cfg.shifts||[]).length>1;

  const startEdit = () => {
    const shifts = cfg.shifts||[];
    setMode(isMulti?"multiple":"single");
    if(shifts.length>1){
      setRows(shifts.map(s=>({shift_no:s.shift_no,name:s.name,start_time:s.start_time,duration_mins:s.duration_mins})));
      setCount(shifts.length);
      const noById = Object.fromEntries(shifts.map(s=>[String(s.id), s.shift_no]));
      setClassMap(Object.fromEntries(Object.entries(cfg.class_shifts||{}).filter(([,v])=>v).map(([k,v])=>[k, noById[String(v)]])));
    } else { setRows([]); setClassMap({}); }
    setOpen(true);
  };

  const suggest = () => {
    const n = Math.max(2, Math.min(4, Number(count)||2));
    const s0 = toMin(first) ?? 510, d = Math.max(Number(dur)||0, 15), g = Math.max(Number(gap)||0, 0);
    setRows([...Array(n)].map((_,i)=>({ shift_no:i+1, name:"Shift "+(i+1), start_time:fromMin(s0+i*(d+g)), duration_mins:d })));
  };

  const spreadClasses = () => {
    const n = rows.length; if(!n) return;
    const sorted = [...examClasses].sort((a,b)=>(a.class_name+(a.section||"")).localeCompare(b.class_name+(b.section||""), undefined, {numeric:true}));
    const per = Math.ceil(sorted.length / n);
    setClassMap(Object.fromEntries(sorted.map((c,i)=>[c.class_id, Math.min(n, Math.floor(i/per)+1)])));
  };

  // warnings shown before saving
  const problems = [];
  rows.forEach((r,i)=>{
    const s = toMin(r.start_time), e = s==null?null:s+(Number(r.duration_mins)||0);
    if(s==null) problems.push(r.name+": start time missing.");
    if(e!=null && e>17*60) problems.push(r.name+" ends after 5:00 pm.");
    rows.forEach((o,j)=>{ if(j<=i) return; const os=toMin(o.start_time), oe=os==null?null:os+(Number(o.duration_mins)||0);
      if(s!=null&&os!=null&&s<oe&&os<e) problems.push(r.name+" and "+o.name+" overlap."); });
  });
  const blocking = problems.some(p=>p.includes("overlap")||p.includes("missing"));

  const save = async () => {
    setSaving(true);
    try {
      if(mode==="single") await examsApi.saveShifts(exam.id, { mode:"single" });
      else await examsApi.saveShifts(exam.id, {
        mode:"multiple",
        shifts: rows.map(r=>({ shift_no:r.shift_no, name:r.name, start_time:r.start_time, duration_mins:Number(r.duration_mins) })),
        class_shifts: classMap,
      });
      await onSaved(); setOpen(false); notify("success","Shift settings saved.");
    } catch(e){ notify("error", errMsg(e)); }
    finally{ setSaving(false); }
  };

  return (
    <div className="ds-card">
      <div className="ds-card-hdr">
        <div>
          <div className="ds-card-title">Exam Shifts</div>
          <div className="ds-grid-meta-text">
            {isMulti ? (cfg.shifts.map(s=>s.name+" "+s.start_time+"–"+endOf(s.start_time,s.duration_mins)).join(" · ")) : "Single shift — each paper uses the time set below."}
          </div>
        </div>
        {!open&&<button className="ds-select-all-btn" onClick={startEdit}>Change</button>}
      </div>
      {open&&(
        <div className="ds-shift-body">
          <div className="ds-shift-modes">
            {[["single","Single shift"],["multiple","Multiple shifts"]].map(([v,l])=>(
              <label key={v} className={"ds-shift-mode"+(mode===v?" ds-shift-mode--on":"")}>
                <input type="radio" name="shiftmode" checked={mode===v} onChange={()=>setMode(v)} /> {l}
              </label>
            ))}
          </div>

          {mode==="multiple"&&(<>
            <div className="ds-common-day-row">
              <div><div className="ds-common-field-label">Number of shifts</div><input type="number" min="2" max="4" className="ds-duration-input" value={count} onChange={e=>setCount(e.target.value)} /></div>
              <div><div className="ds-common-field-label">First shift starts</div><input type="time" className="ds-time-input" value={first} onChange={e=>setFirst(e.target.value)} /></div>
              <div><div className="ds-common-field-label">Paper duration (min)</div><input type="number" className="ds-duration-input" value={dur} onChange={e=>setDur(e.target.value)} /></div>
              <div><div className="ds-common-field-label">Gap between (min)</div><input type="number" className="ds-duration-input" value={gap} onChange={e=>setGap(e.target.value)} /></div>
              <div className="ds-shift-suggest"><button className="ds-select-all-btn" onClick={suggest}>Suggest timings</button></div>
            </div>

            {rows.length>0&&(
              <table className="ds-shift-table">
                <thead><tr><th>Shift</th><th>Name</th><th>Start</th><th>Duration (min)</th><th>End</th></tr></thead>
                <tbody>{rows.map((r,i)=>(
                  <tr key={r.shift_no}>
                    <td>{r.shift_no}</td>
                    <td><input className="ds-field-input" value={r.name} onChange={e=>setRows(rs=>rs.map((x,j)=>j===i?{...x,name:e.target.value}:x))} /></td>
                    <td><input type="time" className="ds-field-input" value={r.start_time} onChange={e=>setRows(rs=>rs.map((x,j)=>j===i?{...x,start_time:e.target.value}:x))} /></td>
                    <td><input type="number" className="ds-field-input" value={r.duration_mins} onChange={e=>setRows(rs=>rs.map((x,j)=>j===i?{...x,duration_mins:e.target.value}:x))} /></td>
                    <td className="ds-shift-end">{endOf(r.start_time, r.duration_mins)}</td>
                  </tr>))}
                </tbody>
              </table>
            )}

            {rows.length>0&&(
              <div className="ds-shift-classes">
                <div className="ds-shift-classes-head">
                  <div className="ds-common-day-label">Each class&apos;s shift (fixed for the whole exam; one paper can still be moved)</div>
                  <button className="ds-select-all-btn" onClick={spreadClasses}>Spread classes evenly</button>
                </div>
                <div className="ds-shift-class-grid">
                  {examClasses.map(c2=>(
                    <label key={c2.class_id} className="ds-shift-class">
                      <span>{c2.class_name}{c2.section?" ("+c2.section+")":""}</span>
                      <select className="ds-row-select" style={{"--row-opacity":1}} value={classMap[c2.class_id]||""} onChange={e=>setClassMap(m=>({...m,[c2.class_id]:e.target.value?Number(e.target.value):""}))}>
                        <option value="">—</option>
                        {rows.map(r=><option key={r.shift_no} value={r.shift_no}>{r.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {problems.length>0&&<div className={"ds-check-box "+(blocking?"ds-check-box--error":"ds-check-box--warn")}>{problems.map((p,i)=><div key={i}>{p}</div>)}</div>}
          </>)}

          {mode==="single"&&isMulti&&<div className="ds-check-box ds-check-box--warn">Switching to a single shift removes the shifts. Papers keep their current times.</div>}

          <div className="ds-shift-actions">
            <button className="ds-cancel-btn" onClick={()=>setOpen(false)}>Cancel</button>
            <button className="ds-save-btn" disabled={saving||(mode==="multiple"&&(rows.length<2||blocking))} onClick={save}>{saving?"Saving...":"Save Shifts"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
