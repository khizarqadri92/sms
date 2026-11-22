import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { examsApi } from "../api/examsApi";
import academicsApi from "../api/academicsApi";
import DatePicker from "../components/DatePicker";
import "./Exams.css";

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
  return <span className="ex-badge" style={{ "--badge-bg": s.bg, "--badge-color": s.color }}>{s.label}</span>;
};

export default function Exams() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const role = effectiveRole(user) || "";
  const canManage  = can("exams_results.exam_management", "exams_results.datesheet_edit");
  const canApprove = can("exams_results.result_approval");
  const canMarks   = can("exams_results.marks_entry");
  const isViewOnly = !canManage && !canApprove;        // no exam management / approval permission

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
    <div className="ex-page">
      {/* Header */}
      <div className="ex-header-row">
        <div>
          <div className="ex-title">Exams</div>
          <div className="ex-subtitle">{list.length} exam{list.length!==1?"s":""} in current academic year</div>
        </div>
        {canManage&&<button onClick={()=>setShowCreate(true)} className="ex-create-btn">+ Create Exam</button>}
      </div>

      {flash.msg&&<div className="ex-flash" style={{ "--flash-bg": flash.type==="error"?"#fef2f2":"#f0fdf4", "--flash-border": flash.type==="error"?"#fecaca":"#bbf7d0", "--flash-color": flash.type==="error"?"#991b1b":"#166534" }}>{flash.msg}</div>}

      {/* Status Filter */}
      <div className="ex-filter-row">
        {[{k:"",l:"All"},{k:"draft",l:"Draft"},{k:"scheduled",l:"Scheduled"},{k:"marks_open",l:"Marks Open"},{k:"compiled",l:"Compiled"},{k:"approved",l:"Approved"},{k:"published",l:"Published"}].map(f=>(
          <button key={f.k} onClick={()=>setStatusFilter(f.k)} className="ex-filter-btn"
            style={{ "--filter-border": statusFilter===f.k?"#0f4c35":"var(--border-color)", "--filter-bg": statusFilter===f.k?"#0f4c35":"var(--bg-card)", "--filter-color": statusFilter===f.k?"#fff":"var(--text-secondary)", "--filter-weight": statusFilter===f.k?700:400 }}>
            {f.l}{f.k&&statusCounts[f.k]?` (${statusCounts[f.k]})`:(!f.k?` (${list.length})`:"")}
          </button>
        ))}
      </div>

      {/* Exams Table */}
      <div className="ex-table-wrap">
        {loading?<div className="ex-loading-text">Loading...</div>:
        filteredList.length===0?<div className="ex-empty-wrap"><div className="ex-empty-icon">📋</div><div className="ex-empty-title">No exams found</div></div>:(
          <table className="ex-table">
            <thead>
              <tr className="ex-th-row">
                {["Exam","Type","Classes","Dates","Datesheet","Result","Actions"].map(h=>(
                  <th key={h} className="ex-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredList.map((e,i)=>(
                <tr key={e.id} className="ex-tr">
                  <td className="ex-td">
                    <div className="ex-exam-name" onClick={()=>goToExam(e.id)}>{e.name}</div>
                    <div className="ex-exam-year">{e.academic_year}</div>
                  </td>
                  <td className="ex-td-med">{e.exam_type_name}</td>
                  <td className="ex-td">
                    <span className="ex-class-count-badge">{e.class_count} class{e.class_count!==1?"es":""}</span>
                  </td>
                  <td className="ex-td-dates">
                    {e.start_date&&e.end_date?e.start_date+" — "+e.end_date:e.start_date||"-"}
                  </td>
                  <td className="ex-td"><Badge styles={DS_STYLES} value={e.datesheet_status||"draft"} /></td>
                  <td className="ex-td"><Badge styles={STATUS_STYLES} value={e.status} /></td>
                  <td className="ex-td">
                    <div className="ex-actions-row">
                      <button onClick={()=>goToExam(e.id,"overview")} className="ex-action-btn-view">View</button>
                      {!isViewOnly&&e.datesheet_status!=="published"&&<button onClick={()=>goToExam(e.id,"datesheet")} className="ex-action-btn-datesheet">Datesheet</button>}
                      {canMarks&&e.status==="marks_open"&&<button onClick={()=>navigate("/exam-marks?exam="+e.id)} className="ex-action-btn-marks">Marks</button>}
                      {!isViewOnly&&(e.status==="compiled"||e.status==="approved")&&<button onClick={()=>goToExam(e.id,"results")} className="ex-action-btn-results">Results</button>}
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
        <div className="ex-modal-overlay">
          <div className="ex-modal-box">
            <div className="ex-modal-header">
              <div className="ex-modal-title">Create New Exam</div>
              <button onClick={()=>setShowCreate(false)} className="ex-modal-close-btn">&#215;</button>
            </div>
            <div className="ex-modal-body">
              <div className="ex-field-group">
                <label className="ex-field-label">Exam Name *</label>
                <input className="form-control" value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Monthly Test - July 2026" />
              </div>
              <div className="ex-grid-2col">
                <div>
                  <label className="ex-field-label">Exam Type *</label>
                  <select className="form-control" value={createForm.exam_type_id} onChange={e=>setCreateForm(f=>({...f,exam_type_id:e.target.value}))}>
                    <option value="">Select type</option>
                    {examTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="ex-grid-2col-tight">
                  <div>
                    <label className="ex-field-label">Start Date</label>
                    <DatePicker value={createForm.start_date} onChange={val=>setCreateForm(f=>({...f,start_date:val}))} />
                  </div>
                  <div>
                    <label className="ex-field-label">End Date</label>
                    <DatePicker value={createForm.end_date} onChange={val=>setCreateForm(f=>({...f,end_date:val}))} />
                  </div>
                </div>
              </div>
              <div className="ex-field-group">
                <div className="ex-classes-row-header">
                  <label className="ex-field-label" style={{marginBottom:0}}>Classes *</label>
                  <label className="ex-select-all-label" style={{ "--select-all-color": createForm.all_classes?"#0f4c35":"var(--text-secondary)" }}>
                    <input type="checkbox" checked={createForm.all_classes} onChange={e=>setCreateForm(f=>({...f,all_classes:e.target.checked,class_ids:[]}))} />
                    Select All ({classes.length} classes)
                  </label>
                </div>
                {!createForm.all_classes&&(
                  <div className="ex-classes-grid">
                    {classes.map(c=>{
                      const checked = createForm.class_ids.includes(c.id);
                      return (
                        <div key={c.id} onClick={()=>setCreateForm(f=>{const isChecked=f.class_ids.includes(c.id);return{...f,class_ids:isChecked?f.class_ids.filter(x=>x!==c.id):[...f.class_ids,c.id]};})} className="ex-class-chip"
                          style={{ "--chip-border": checked?"#0f4c35":"var(--border-color)", "--chip-bg": checked?"var(--bg-success-soft)":"var(--bg-card)", "--chip-weight": checked?600:400, "--chip-color": checked?"#0f4c35":"var(--text-primary)" }}>
                          <div className="ex-chip-checkbox" style={{ "--checkbox-border": checked?"#0f4c35":"var(--border-color)", "--checkbox-bg": checked?"#0f4c35":"var(--bg-card)" }}>
                            {checked&&<span className="ex-chip-check">&#10003;</span>}
                          </div>
                          {c.name}{c.section?" ("+c.section+")":""}
                        </div>
                      );
                    })}
                  </div>
                )}
                {createForm.all_classes&&<div className="ex-all-selected-note">All {classes.length} classes selected</div>}
                {!createForm.all_classes&&createForm.class_ids.length>0&&<div className="ex-selected-count-note">{createForm.class_ids.length} class(es) selected</div>}
              </div>
            </div>
            <div className="ex-modal-footer">
              <button onClick={()=>setShowCreate(false)} className="ex-cancel-btn">Cancel</button>
              <button disabled={creating} onClick={submitCreate} className="ex-submit-btn">{creating?"Creating...":"Create Exam"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}