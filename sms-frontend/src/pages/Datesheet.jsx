import { useState, useEffect } from "react";
import { examsApi } from "../api/examsApi";
import { useAuth } from "../auth/AuthContext";
import DatePicker from "../components/DatePicker";

export default function Datesheet() {
  const [exams,       setExams]       = useState([]);
  const [selectedExam,setSelectedExam]= useState(null);
  const [datesheet,   setDatesheet]   = useState([]);
  const { user: authUser } = useAuth();
  const role = authUser?.roles?.[0]||"";
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

  const notify = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash({}),4000); };

  useEffect(()=>{
    examsApi.getAll().then(r=>setExams(r.data.data||[])).catch(()=>{});
    import("../api/teachersApi").then(({default:t})=>{
      t.getAll({per_page:200}).then(r=>{ const arr=r.data.data?.items||r.data.data||[]; console.log("teachers sample:", arr[0]); setTeachers(arr); }).catch(()=>{});
    });
  },[]);

  const selectExam = async (exam) => {
    setSelectedExam(exam);
    setDatesheet([]);
    setForm({exam_date:"",start_time:"09:00",duration_mins:120,rows:{}});
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
          subMap[c.class_id] = rs.data.data||[];
        }catch(e){}
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

  const addEntry = async (classId, rowData) => {
    if(!form.exam_date) return notify("error","Select exam date.");
    if(!rowData.subject_id) return notify("error","Select a subject.");
    setLoading(true);
    const teacherId = rowData.teacher_id ? Number(rowData.teacher_id) : (classIncharges[classId]||null);
    try {
      await examsApi.addSubject(selectedExam.id,{
        class_id:classId, subject_id:rowData.subject_id,
        teacher_id:teacherId,
        exam_date:form.exam_date, start_time:form.start_time,
        duration_mins:form.duration_mins, venue:rowData.venue||""
      });
      const ds = await examsApi.getSubjects(selectedExam.id);
      setDatesheet(Array.isArray(ds.data.data)?ds.data.data:[]);
      notify("success","Added.");
    } catch(e){ notify("error",e.response?.data?.message||"Failed."); }
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
    setLoading(true);
    try {
      for(const cls of toAdd){
        const r = rows[cls.class_id];
        const tid = r.teacher_id ? Number(r.teacher_id) : (classIncharges[cls.class_id]||null);
        await examsApi.addSubject(selectedExam.id,{
          class_id:cls.class_id, subject_id:r.subject_id,
          teacher_id:tid,
          exam_date:form.exam_date, start_time:form.start_time,
          duration_mins:form.duration_mins, venue:r.venue||""
        });
      }
      const ds = await examsApi.getSubjects(selectedExam.id);
      setDatesheet(Array.isArray(ds.data.data)?ds.data.data:[]);
      notify("success",toAdd.length+" entries added.");
    } catch(e){ notify("error","Failed."); }
    finally{ setLoading(false); }
  };

  const removeEntry = async (id) => {
    try {
      await examsApi.deleteSubject(selectedExam.id, id);
      setDatesheet(prev=>prev.filter(s=>s.id!==id));
      notify("success","Removed.");
    } catch(e){ notify("error","Failed."); }
  };

  const assignInvigilator = async () => {
    if(!invigilatorId) return;
    try {
      const s = invigilatorSubject;
      console.log("Assigning invigilator:", invigilatorId, "to subject:", s);
      await examsApi.addSubject(selectedExam.id,{
        class_id:s.class_id, subject_id:s.subject_id,
        teacher_id:Number(invigilatorId),
        exam_date:s.exam_date, start_time:s.start_time?String(s.start_time).slice(0,8):null,
        duration_mins:s.duration_mins||120, venue:s.venue||""
      });
      const ds = await examsApi.getSubjects(selectedExam.id);
      setDatesheet(Array.isArray(ds.data.data)?ds.data.data:[]);
      setShowInvig(false);
      notify("success","Invigilator assigned.");
    } catch(e){ notify("error","Failed."); }
  };

  const submitDatesheet = async () => {
    try { await examsApi.submitDatesheet(selectedExam.id); notify("success","Submitted for approval."); const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data); } catch(e){ notify("error","Failed."); }
  };

  // Build grid data
  const safeDS = Array.isArray(datesheet)?datesheet:[];
  const userRole = user?.roles?.[0]||"";
  const canSubmit  = userRole===submitRole||userRole==="superadmin"||userRole==="admin";
  const canApprove = userRole===approveRole||userRole==="superadmin";
  const canPublish = userRole===publishRole||userRole==="superadmin"||userRole==="admin";
  const dates = [...new Set(safeDS.map(s=>s.exam_date||""))].filter(Boolean).sort();
  const cellMap = {};
  safeDS.forEach(s=>{ cellMap[(s.class_id||"")+"__"+(s.exam_date||"")] = s; });
  const pendingInvig = safeDS.filter(s=>!s.teacher_name).length;

  const S = {
    page:{padding:"24px",minHeight:"100vh",background:"#f1f5f9"},
    header:{marginBottom:20},
    h1:{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4},
    sub:{fontSize:13,color:"#64748b"},
    card:{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden",marginBottom:20},
    cardHdr:{padding:"12px 20px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"space-between"},
    cardTitle:{fontWeight:700,fontSize:14,color:"#0f172a"},
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.h1}>Datesheet</div>
        <div style={S.sub}>Build and manage exam datesheets for all classes</div>
      </div>

      {flash.msg&&<div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,background:flash.type==="error"?"#fef2f2":"#f0fdf4",border:"1px solid "+(flash.type==="error"?"#fecaca":"#bbf7d0"),color:flash.type==="error"?"#991b1b":"#166534",fontSize:13}}>{flash.msg}</div>}

      {/* Exam Selector */}
      <div style={S.card}>
        <div style={S.cardHdr}><div style={S.cardTitle}>Select Exam</div></div>
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
            {exams.map(e=>(
              <div key={e.id} onClick={()=>selectExam(e)} style={{padding:"12px 16px",borderRadius:10,border:"1.5px solid",borderColor:selectedExam?.id===e.id?"#0f4c35":"#e2e8f0",background:selectedExam?.id===e.id?"#f0fdf4":"#fafafa",cursor:"pointer",transition:"all .15s"}}>
                <div style={{fontWeight:700,fontSize:14,color:"#0f172a",marginBottom:3}}>{e.name}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{e.exam_type_name} &middot; {e.academic_year}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{e.class_count} class{e.class_count!==1?"es":""} &middot; {e.total_subjects} subjects</div>
                <div style={{marginTop:6}}>
                  {(()=>{
                    const ds = e.datesheet_status||"draft";
                    const colors={draft:["#f1f5f9","#475569"],submitted:["#dbeafe","#1e40af"],approved:["#fef9c3","#854d0e"],published:["#dcfce7","#166534"]};
                    const [bg,col]=(colors[ds]||colors.draft);
                    return <span style={{fontSize:10,fontWeight:600,background:bg,color:col,padding:"2px 8px",borderRadius:10}}>{ds.charAt(0).toUpperCase()+ds.slice(1)}</span>;
                  })()}
                </div>
              </div>
            ))}
            {exams.length===0&&<div style={{fontSize:13,color:"#94a3b8",gridColumn:"1/-1"}}>No exams found. Create an exam first.</div>}
          </div>
        </div>
      </div>

      {selectedExam&&(
        <>
          {!isLocked&&(
          <div style={{marginBottom:0}}>
          {/* Add Entry */}
          <div style={S.card}>
            <div style={S.cardHdr}>
              <div style={S.cardTitle}>Add to Datesheet — {selectedExam.name}</div>
              <button onClick={()=>setForm(f=>({...f,rows:Object.fromEntries(examClasses.map(c=>[c.class_id,{...(f.rows||{})[c.class_id],checked:true}]))}))} style={{padding:"5px 14px",background:"#eff6ff",color:"#2563eb",border:"1.5px solid #bfdbfe",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer"}}>Select All</button>
            </div>

            {/* Common date/time */}
            <div style={{padding:"14px 20px",background:"#fafafa",borderBottom:"1px solid #f1f5f9"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>Common for this day</div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                <div><div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Exam Date *</div><DatePicker style={{padding:"8px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,color:"#0f172a",background:"#fff"}} value={form.exam_date} onChange={val=>setForm(f=>({...f,exam_date:val,rows:Object.fromEntries(Object.entries(f.rows||{}).map(([k,v])=>([k,{...v,checked:false}]))),all_classes:false}))} /></div>
                <div><div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Start Time</div><input type="time" style={{padding:"8px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,color:"#0f172a",background:"#fff",width:130}} value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))} /></div>
                <div><div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Duration (min)</div><input type="number" style={{padding:"8px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,color:"#0f172a",background:"#fff",width:100}} value={form.duration_mins} onChange={e=>setForm(f=>({...f,duration_mins:e.target.value}))} /></div>
              </div>
            </div>

            {/* Per-class grid */}
            <div style={{display:"grid",gridTemplateColumns:"160px 1fr 140px 140px 70px",padding:"7px 20px",background:"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
              {["Class","Subject","Venue / Room","Invigilator",""].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".06em"}}>{h}</div>)}
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
              return (
                <div key={cls.class_id} style={{display:"grid",gridTemplateColumns:"160px 1fr 140px 140px 70px",padding:"9px 20px",borderBottom:"1px solid #f8fafc",alignItems:"center",background:hasDuplicate?"#fef9c3":checked?"#fff":"#fafafa",borderLeft:hasDuplicate?"3px solid #f59e0b":hasSubjectWarning?"3px solid #3b82f6":"3px solid transparent"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setForm(f=>{const wasChecked=(f.rows||{})[cls.class_id]?.checked;const inchargeId=classIncharges[cls.class_id];return{...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],checked:!wasChecked,teacher_id:!wasChecked?(inchargeId?String(inchargeId):""):(f.rows||{})[cls.class_id]?.teacher_id}}};})}>
                    <div style={{width:16,height:16,borderRadius:4,border:"1.5px solid",borderColor:checked?"#0f4c35":"#cbd5e1",background:checked?"#0f4c35":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {checked&&<span style={{color:"#fff",fontSize:9,fontWeight:800}}>&#10003;</span>}
                    </div>
                    <div>
                      <span style={{fontSize:13,fontWeight:600,color:checked?"#0f172a":"#94a3b8"}}>{cls.class_name}{cls.section?" ("+cls.section+")":""}</span>
                      {hasDuplicate&&<div style={{fontSize:10,color:"#92400e",background:"#fef3c7",padding:"1px 6px",borderRadius:8,marginTop:2,fontWeight:600}}>Already has exam on this date</div>}
                      {hasSubjectWarning&&!hasDuplicate&&<div style={{fontSize:10,color:"#1e40af",background:"#dbeafe",padding:"1px 6px",borderRadius:8,marginTop:2,fontWeight:600}}>Subject already scheduled on {subjectOnOtherDate.exam_date}</div>}
                    </div>
                  </div>
                  <select disabled={!checked} value={rowData.subject_id||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],subject_id:e.target.value}}}))} style={{padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:7,fontSize:12,background:"#fff",opacity:checked?1:.4,width:"100%"}}>
                    <option value="">Select subject</option>
                    {(classSubjects[cls.class_id]||[]).map(s=><option key={s.subject_id||s.id} value={s.subject_id||s.id}>{s.name}</option>)}
                  </select>
                  <input disabled={!checked} placeholder="Room / Hall" value={rowData.venue||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],venue:e.target.value}}}))} style={{padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:7,fontSize:12,background:"#fff",opacity:checked?1:.4,width:"100%"}} />
                  <select disabled={!checked} value={rowData.teacher_id||""} onChange={e=>setForm(f=>({...f,rows:{...(f.rows||{}),[cls.class_id]:{...(f.rows||{})[cls.class_id],teacher_id:e.target.value}}}))} style={{padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:7,fontSize:11,background:"#fff",opacity:checked?1:.4,width:"100%"}}>
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
                  <button disabled={isLocked||!checked||!rowData.subject_id||loading||hasDuplicate} onClick={()=>!hasDuplicate&&addEntry(cls.class_id,rowData)} style={{padding:"7px 0",background:checked&&rowData.subject_id?"#0f4c35":"#e2e8f0",color:checked&&rowData.subject_id?"#fff":"#94a3b8",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:checked&&rowData.subject_id?"pointer":"not-allowed",width:"100%"}}>Add</button>
                </div>
              );
            })}

            <div style={{padding:"10px 20px",display:"flex",justifyContent:"flex-end"}}>
              <button disabled={loading} onClick={addAll} disabled={isLocked} style={{padding:"9px 22px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Add All Selected &rarr;</button>
            </div>
          </div>


          {/* Action Buttons - always visible when exam selected */}
          <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div style={{fontSize:13,color:"#64748b"}}>
              Datesheet status: <strong style={{color:"#0f172a"}}>{selectedExam.datesheet_status||"Draft"}</strong>
              {safeDS.length>0&&<span style={{marginLeft:12,color:"#166534"}}>{safeDS.length} entries</span>}
              {publishMode==="all_classes"&&<span style={{marginLeft:12,fontSize:11,color:"#854d0e",background:"#fffbeb",padding:"2px 8px",borderRadius:10,fontWeight:600}}>All Classes mode ? publish only when all classes ready</span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {!requireApproval&&canPublish&&(!selectedExam.datesheet_status||selectedExam.datesheet_status==="draft")&&safeDS.length>0&&(
                <button onClick={async()=>{try{await examsApi.publishDatesheet(selectedExam.id);notify("success","Datesheet published!");const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data);}catch(e){notify("error","Failed.");}}} style={{padding:"8px 20px",background:"#166534",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Publish Datesheet</button>
              )}
              {requireApproval&&canSubmit&&(!selectedExam.datesheet_status||selectedExam.datesheet_status==="draft")&&safeDS.length>0&&(
                <button onClick={submitDatesheet} style={{padding:"8px 20px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Submit for Approval</button>
              )}
              {requireApproval&&canApprove&&selectedExam.datesheet_status==="submitted"&&(
                <button onClick={async()=>{try{await examsApi.approveDatesheet(selectedExam.id);notify("success","Datesheet approved.");const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data);}catch(e){notify("error","Failed.");}}} style={{padding:"8px 20px",background:"#166534",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Approve Datesheet</button>
              )}
              {requireApproval&&canPublish&&selectedExam.datesheet_status==="approved"&&(
                <button onClick={async()=>{try{await examsApi.publishDatesheet(selectedExam.id);notify("success","Datesheet published!");const r=await examsApi.getOne(selectedExam.id);setSelectedExam(r.data.data);}catch(e){notify("error","Failed.");}}} style={{padding:"8px 20px",background:"#166534",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Publish Datesheet</button>
              )}
              {selectedExam.datesheet_status==="published"&&(
                <span style={{fontSize:13,fontWeight:600,color:"#166534",background:"#dcfce7",padding:"8px 16px",borderRadius:8}}>Datesheet Published</span>
              )}
            </div>
          </div>
          {/* Grid Preview */}
          {safeDS.length>0&&(
            <div style={S.card}>
              <div style={S.cardHdr}>
                <div>
                  <div style={S.cardTitle}>Datesheet Grid</div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{datesheet.length} entries &middot; {dates.length} days &middot; {examClasses.length} classes{pendingInvig>0?" · ":""}{pendingInvig>0&&<span style={{color:"#f59e0b",fontWeight:600}}>{pendingInvig} invigilator{pendingInvig!==1?"s":""} pending</span>}</div>
                </div>

              </div>
              <div>
                <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
                  <thead>
                    <tr>
                      <th style={{padding:"12px 16px",background:"#f8fafc",borderRight:"1px solid #e2e8f0",borderBottom:"2px solid #e2e8f0",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".07em",textAlign:"left",width:"130px"}}>Class</th>
                      {dates.map(d=>{
                        const dt=new Date(d+"T00:00:00");
                        const sample=datesheet.find(s=>s.exam_date===d);
                        return (
                          <th key={d} style={{padding:"8px 10px",background:"#f8fafc",borderRight:"1px solid #e2e8f0",borderBottom:"2px solid #e2e8f0",textAlign:"center",verticalAlign:"middle"}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{dt.toLocaleDateString("en-PK",{weekday:"short"})}</div>
                            <div style={{fontSize:22,fontWeight:900,color:"#0f172a",lineHeight:1.1}}>{dt.getDate()}</div>
                            <div style={{fontSize:11,color:"#64748b"}}>{dt.toLocaleDateString("en-PK",{month:"long",year:"numeric"})}</div>
                            {sample&&<div style={{fontSize:10,color:"#94a3b8",marginTop:4,background:"#f1f5f9",borderRadius:10,padding:"2px 8px",display:"inline-block"}}>{sample.start_time?sample.start_time.slice(0,5):"--:--"} &middot; {sample.duration_mins||120} min</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {examClasses.map(cls=>(
                      <tr key={cls.class_id}>
                        <td style={{padding:"8px 12px",background:"#fafafa",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:"120px"}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{cls.class_name}</div>
                          {cls.section&&<div style={{fontSize:11,color:"#94a3b8"}}>Section {cls.section}</div>}
                        </td>
                        {dates.map(d=>{
                          const cell=cellMap[cls.class_id+"__"+d];
                          return (
                            <td key={d} style={{padding:"6px 8px",borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",textAlign:"center",background:cell?"#fff":"#fafafa"}}>
                              {cell?(
                                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:6,padding:"5px 8px",textAlign:"left",position:"relative"}}>
                                  <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:2}}>{cell.subject_name}</div>
                                  <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>&#127968; {cell.venue||"—"}</div>
                                  {cell.teacher_name
                                    ?<div style={{fontSize:10,color:"#166534",fontWeight:600,display:"flex",alignItems:"center",gap:3}}><span style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",display:"inline-block"}}></span>{cell.teacher_name}</div>
                                    :<div onClick={()=>{setInvigilatorSubject(cell);const inc=classIncharges[cell.class_id];setInvigilatorId(inc?String(inc):"");setInvigilatorTab("class");setShowInvig(true);}} style={{fontSize:10,color:"#f59e0b",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}><span style={{width:6,height:6,borderRadius:"50%",background:"#f59e0b",display:"inline-block"}}></span>Assign invigilator</div>
                                  }
                                  <div style={{position:"absolute",top:4,right:4,display:"flex",gap:3}}>
                                    <button onClick={e=>{e.stopPropagation();setEditEntry(cell);setEditForm({exam_date:cell.exam_date||"",start_time:cell.start_time?String(cell.start_time).slice(0,5):"",duration_mins:cell.duration_mins||120,venue:cell.venue||"",teacher_id:cell.teacher_id||""});setShowEdit(true);}} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:4,color:"#2563eb",cursor:"pointer",fontSize:10,padding:"1px 5px",fontWeight:600}} style={{display:isLocked?"none":"inline"}}>Edit</button>
                                    <button onClick={()=>removeEntry(cell.id)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>&#215;</button>
                                  </div>
                                </div>
                              ):(
                                <span style={{color:"#e2e8f0",fontSize:18}}>—</span>
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

      {/* Edit Entry Modal */}
      {showEdit&&editEntry&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>Edit Datesheet Entry</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{editEntry.class_name}{editEntry.section?" ("+editEntry.section+")":""} &middot; {editEntry.subject_name}</div>
              </div>
              <button onClick={()=>setShowEdit(false)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>&#215;</button>
            </div>
            <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div><label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>Exam Date</label>
                  <DatePicker value={editForm.exam_date} onChange={val=>setEditForm(f=>({...f,exam_date:val}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} /></div>
                <div><label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>Start Time</label>
                  <input type="time" value={editForm.start_time} onChange={e=>setEditForm(f=>({...f,start_time:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} /></div>
                <div><label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>Duration (min)</label>
                  <input type="number" value={editForm.duration_mins} onChange={e=>setEditForm(f=>({...f,duration_mins:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} /></div>
                <div><label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>Venue / Room</label>
                  <input value={editForm.venue} onChange={e=>setEditForm(f=>({...f,venue:e.target.value}))} placeholder="Room / Hall" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}} /></div>
              </div>
              <div><label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>Invigilator</label>
                <select value={editForm.teacher_id||""} onChange={e=>setEditForm(f=>({...f,teacher_id:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}>
                  <option value="">No invigilator</option>
                  {(()=>{
                    const inchargeId = classIncharges[editEntry.class_id];
                    const incharge = inchargeId ? teachers.find(t=>t.id===inchargeId) : null;
                    return (<>
                      {incharge&&<optgroup label="Class Incharge"><option value={incharge.id}>{incharge.first_name} {incharge.last_name} (Incharge)</option></optgroup>}
                      <optgroup label="Other Teachers">{teachers.filter(t=>t.id!==inchargeId).map(t=><option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}</optgroup>
                    </>);
                  })()}
                </select>
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button onClick={()=>setShowEdit(false)} style={{padding:"8px 18px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button disabled={loading} onClick={async()=>{
                setLoading(true);
                try{
                  await examsApi.addSubject(selectedExam.id,{
                    class_id:editEntry.class_id, subject_id:editEntry.subject_id,
                    teacher_id:editForm.teacher_id?Number(editForm.teacher_id):null,
                    exam_date:editForm.exam_date, start_time:editForm.start_time,
                    duration_mins:editForm.duration_mins, venue:editForm.venue
                  });
                  const ds = await examsApi.getSubjects(selectedExam.id);
                  setDatesheet(Array.isArray(ds.data.data)?ds.data.data:[]);
                  setShowEdit(false);
                  notify("success","Entry updated.");
                }catch(e){notify("error","Failed.");}
                finally{setLoading(false);}
              }} style={{padding:"8px 20px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Invigilator Modal */}
      {showInvig&&invigilatorSubject&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:440,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"16px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc"}}>
              <div style={{fontWeight:700,fontSize:16}}>Assign Invigilator</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Subject: <strong>{invigilatorSubject.subject_name}</strong> &middot; {invigilatorSubject.class_name}{invigilatorSubject.section?" ("+invigilatorSubject.section+")":""}</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"flex",background:"#f8fafc",borderRadius:10,padding:4,marginBottom:16,border:"1px solid #e2e8f0"}}>
                {[{v:"class",l:"Class Teachers"},{v:"other",l:"Other Teachers"}].map(t=>(
                  <button key={t.v} onClick={()=>{setInvigilatorTab(t.v);setInvigilatorId("");}} style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",fontSize:13,cursor:"pointer",background:invigilatorTab===t.v?"#fff":"transparent",color:invigilatorTab===t.v?"#0f172a":"#64748b",fontWeight:invigilatorTab===t.v?600:400,boxShadow:invigilatorTab===t.v?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:260,overflowY:"auto"}}>
                {(()=>{
                  const classId = invigilatorSubject?.class_id;
                  const inchargeId = classIncharges[classId];
                  const displayTeachers = invigilatorTab==="class"
                    ? (inchargeId ? teachers.filter(t=>t.id===inchargeId) : [])
                    : teachers.filter(t=>t.id!==inchargeId);
                  if(displayTeachers.length===0) return (
                    <div style={{textAlign:"center",padding:"20px",color:"#94a3b8",fontSize:13}}>
                      {invigilatorTab==="class" ? "No class incharge assigned for this class." : "No other teachers found."}
                    </div>
                  );
                  return displayTeachers.map(t=>(
                    <div key={t.id} onClick={()=>setInvigilatorId(String(t.id))} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,border:"2px solid",borderColor:invigilatorId===String(t.id)?"#0f4c35":"#e2e8f0",background:invigilatorId===String(t.id)?"#f0fdf4":"#fafafa",cursor:"pointer"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:invigilatorTab==="class"?"#166534":"#2563eb",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,flexShrink:0}}>{(t.first_name||"")[0]}{(t.last_name||"")[0]}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13}}>{t.first_name} {t.last_name}</div>
                        {invigilatorTab==="class"&&<div style={{fontSize:11,color:"#166534",fontWeight:600}}>Class Incharge</div>}
                      </div>
                      {invigilatorId===String(t.id)&&<span style={{fontSize:12,fontWeight:700,color:"#0f4c35",background:"#dcfce7",padding:"2px 8px",borderRadius:10}}>Selected</span>}
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button onClick={()=>setShowInvig(false)} style={{padding:"8px 18px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button disabled={!invigilatorId} onClick={assignInvigilator} style={{padding:"8px 20px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}