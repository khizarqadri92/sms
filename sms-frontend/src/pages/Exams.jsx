import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import academicsApi from "../api/academicsApi";

const STATUS_STYLES = {
  draft:      { bg:"#f1f5f9", color:"#475569", label:"Draft" },
  scheduled:  { bg:"#dbeafe", color:"#1e40af", label:"Scheduled" },
  marks_open: { bg:"#fef9c3", color:"#854d0e", label:"Marks Open" },
  submitted:  { bg:"#e0f2fe", color:"#0369a1", label:"Submitted" },
  compiled:   { bg:"#ede9fe", color:"#5b21b6", label:"Compiled" },
  reviewed:   { bg:"#fce7f3", color:"#9d174d", label:"Reviewed" },
  approved:   { bg:"#dcfce7", color:"#166534", label:"Approved" },
  published:  { bg:"#dcfce7", color:"#166534", label:"Published" },
};

const DS_STYLES = {
  draft:     { bg:"#f1f5f9", color:"#475569", label:"Draft" },
  submitted: { bg:"#dbeafe", color:"#1e40af", label:"Awaiting Approval" },
  approved:  { bg:"#fef9c3", color:"#854d0e", label:"Approved" },
  published: { bg:"#dcfce7", color:"#166534", label:"Published" },
};

const Badge = ({styles, value}) => {
  const s = styles[value] || styles.draft;
  return <span style={{fontSize:11,fontWeight:600,background:s.bg,color:s.color,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap"}}>{s.label}</span>;
};

export default function Exams() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const role = user?.roles?.[0] || "";
  const canManage  = can("exam.manage");
  const canApprove = can("exam.approve");
  const canMarks   = can("exam.marks");
  const isViewOnly = ["teacher","parent","student"].includes(role);

  const [list,         setList]         = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate,   setShowCreate]   = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [flash,        setFlash]        = useState({});
  const [classes,      setClasses]      = useState([]);
  const [examTypes,    setExamTypes]    = useState([]);
  const [createForm,   setCreateForm]   = useState({
    name:"", exam_type_id:"", class_ids:[], all_classes:false, start_date:"", end_date:""
  });

  const notify = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash({}),4000); };

  const load = () => {
    setLoading(true);
    examsApi.getAll().then(r=>setList(r.data.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  };

  useEffect(()=>{
    load();
    if(canManage){
      academicsApi.getClasses().then(r=>setClasses(r.data.data?.items||r.data.data||[])).catch(()=>{});
      examsApi.getTypes().then(r=>setExamTypes(r.data.data||[])).catch(()=>{});
    }
  },[]);

  const submitCreate = async () => {
    if(!createForm.name||!createForm.exam_type_id) return notify("error","Name and type required.");
    if(!createForm.all_classes&&createForm.class_ids.length===0) return notify("error","Select at least one class.");
    setCreating(true);
    try {
      await examsApi.create(createForm);
      notify("success","Exam created.");
      setShowCreate(false);
      setCreateForm({name:"",exam_type_id:"",class_ids:[],all_classes:false,start_date:"",end_date:""});
      load();
    } catch(e){ notify("error",e.response?.data?.message||"Failed."); }
    finally { setCreating(false); }
  };

  const filteredList = statusFilter ? list.filter(e=>e.status===statusFilter) : list;
  const statusCounts = list.reduce((acc,e)=>{ acc[e.status]=(acc[e.status]||0)+1; return acc; },{});

  const goToExam = (examId, tab="overview") => {
    if(isViewOnly){ navigate("/datesheet-view"); return; }
    navigate(`/exams/${examId}?tab=${tab}`);
  };

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Exams</div>
          <div style={{fontSize:13,color:"#64748b"}}>{list.length} exam{list.length!==1?"s":""} in current academic year</div>
        </div>
        {canManage&&<button onClick={()=>setShowCreate(true)} style={{padding:"10px 20px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:9,fontSize:14,fontWeight:700,cursor:"pointer"}}>+ Create Exam</button>}
      </div>

      {flash.msg&&<div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,background:flash.type==="error"?"#fef2f2":"#f0fdf4",border:"1px solid "+(flash.type==="error"?"#fecaca":"#bbf7d0"),color:flash.type==="error"?"#991b1b":"#166534",fontSize:13}}>{flash.msg}</div>}

      {/* Status Filter */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
        {[{k:"",l:"All"},{k:"draft",l:"Draft"},{k:"scheduled",l:"Scheduled"},{k:"marks_open",l:"Marks Open"},{k:"compiled",l:"Compiled"},{k:"approved",l:"Approved"},{k:"published",l:"Published"}].map(f=>(
          <button key={f.k} onClick={()=>setStatusFilter(f.k)} style={{padding:"5px 14px",borderRadius:20,border:"1.5px solid",borderColor:statusFilter===f.k?"#0f4c35":"#e2e8f0",background:statusFilter===f.k?"#0f4c35":"#fff",color:statusFilter===f.k?"#fff":"#64748b",fontSize:12,fontWeight:statusFilter===f.k?700:400,cursor:"pointer"}}>
            {f.l}{f.k&&statusCounts[f.k]?` (${statusCounts[f.k]})`:(!f.k?` (${list.length})`:"")}
          </button>
        ))}
      </div>

      {/* Exams Table */}
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
        {loading?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>:
        filteredList.length===0?<div style={{padding:60,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:12}}>📋</div><div style={{fontWeight:600}}>No exams found</div></div>:(
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
                {["Exam","Type","Classes","Dates","Datesheet","Result","Actions"].map(h=>(
                  <th key={h} style={{padding:"10px 16px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".06em",textAlign:"left"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredList.map((e,i)=>(
                <tr key={e.id} style={{borderBottom:"1px solid #f1f5f9",transition:"background .1s"}}
                  onMouseEnter={ev=>ev.currentTarget.style.background="#fafafa"}
                  onMouseLeave={ev=>ev.currentTarget.style.background="#fff"}>
                  <td style={{padding:"12px 16px"}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a",cursor:"pointer"}} onClick={()=>goToExam(e.id)}>{e.name}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{e.academic_year}</div>
                  </td>
                  <td style={{padding:"12px 16px",fontSize:13,color:"#475569"}}>{e.exam_type_name}</td>
                  <td style={{padding:"12px 16px"}}>
                    <span style={{fontSize:12,fontWeight:600,background:"#eff6ff",color:"#2563eb",padding:"2px 8px",borderRadius:10}}>{e.class_count} class{e.class_count!==1?"es":""}</span>
                  </td>
                  <td style={{padding:"12px 16px",fontSize:12,color:"#64748b",whiteSpace:"nowrap"}}>
                    {e.start_date&&e.end_date?e.start_date+" — "+e.end_date:e.start_date||"-"}
                  </td>
                  <td style={{padding:"12px 16px"}}><Badge styles={DS_STYLES} value={e.datesheet_status||"draft"} /></td>
                  <td style={{padding:"12px 16px"}}><Badge styles={STATUS_STYLES} value={e.status} /></td>
                  <td style={{padding:"12px 16px"}}>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>goToExam(e.id,"overview")} style={{padding:"5px 12px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",color:"#374151"}}>View</button>
                      {!isViewOnly&&e.datesheet_status!=="published"&&<button onClick={()=>goToExam(e.id,"datesheet")} style={{padding:"5px 12px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",color:"#2563eb"}}>Datesheet</button>}
                      {canMarks&&e.status==="marks_open"&&<button onClick={()=>navigate("/exam-marks?exam="+e.id)} style={{padding:"5px 12px",background:"#fef9c3",border:"1px solid #fde68a",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",color:"#854d0e"}}>Marks</button>}
                      {!isViewOnly&&(e.status==="compiled"||e.status==="approved")&&<button onClick={()=>goToExam(e.id,"results")} style={{padding:"5px 12px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",color:"#166534"}}>Results</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Exam Modal */}
      {showCreate&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:600,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"18px 24px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:17}}>Create New Exam</div>
              <button onClick={()=>setShowCreate(false)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>&#215;</button>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>Exam Name *</label>
                <input className="form-control" value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Monthly Test - July 2026" />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                <div>
                  <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>Exam Type *</label>
                  <select className="form-control" value={createForm.exam_type_id} onChange={e=>setCreateForm(f=>({...f,exam_type_id:e.target.value}))}>
                    <option value="">Select type</option>
                    {examTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>Start Date</label>
                    <input type="date" className="form-control" value={createForm.start_date} onChange={e=>setCreateForm(f=>({...f,start_date:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>End Date</label>
                    <input type="date" className="form-control" value={createForm.end_date} onChange={e=>setCreateForm(f=>({...f,end_date:e.target.value}))} />
                  </div>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <label style={{fontSize:12,fontWeight:600,color:"#374151"}}>Classes *</label>
                  <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",color:createForm.all_classes?"#0f4c35":"#64748b",fontWeight:600}}>
                    <input type="checkbox" checked={createForm.all_classes} onChange={e=>setCreateForm(f=>({...f,all_classes:e.target.checked,class_ids:[]}))} />
                    Select All ({classes.length} classes)
                  </label>
                </div>
                {!createForm.all_classes&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,maxHeight:180,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8,padding:10,background:"#fafafa"}}>
                    {classes.map(c=>{
                      const checked = createForm.class_ids.includes(c.id);
                      return (
                        <div key={c.id} onClick={()=>setCreateForm(f=>{const isChecked=f.class_ids.includes(c.id);return{...f,class_ids:isChecked?f.class_ids.filter(x=>x!==c.id):[...f.class_ids,c.id]};})} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:7,cursor:"pointer",border:"1.5px solid",borderColor:checked?"#0f4c35":"#e2e8f0",background:checked?"#f0fdf4":"#fff",fontSize:12,fontWeight:checked?600:400,color:checked?"#0f4c35":"#374151",userSelect:"none"}}>
                          <div style={{width:14,height:14,borderRadius:3,border:"1.5px solid",borderColor:checked?"#0f4c35":"#cbd5e1",background:checked?"#0f4c35":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {checked&&<span style={{color:"#fff",fontSize:9,fontWeight:800}}>&#10003;</span>}
                          </div>
                          {c.name}{c.section?" ("+c.section+")":""}
                        </div>
                      );
                    })}
                  </div>
                )}
                {createForm.all_classes&&<div style={{padding:"8px 12px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,fontSize:12,color:"#166534",fontWeight:600}}>All {classes.length} classes selected</div>}
                {!createForm.all_classes&&createForm.class_ids.length>0&&<div style={{fontSize:12,color:"#0f4c35",marginTop:6,fontWeight:600}}>{createForm.class_ids.length} class(es) selected</div>}
              </div>
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",gap:10,justifyContent:"flex-end",background:"#f8fafc"}}>
              <button onClick={()=>setShowCreate(false)} style={{padding:"9px 20px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button disabled={creating} onClick={submitCreate} style={{padding:"9px 24px",background:"#0f4c35",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>{creating?"Creating...":"Create Exam"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}