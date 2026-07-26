import React, { useState, useEffect, useCallback } from "react";
import { disciplineApi } from "../api/disciplineApi";
import { useAuth } from "../auth/AuthContext";
import teachersApi from "../api/teachersApi";
import DisciplineDetailModal from "../components/DisciplineDetailModal";

const SEVERITY_LABELS = {1:"Minor",2:"Moderate",3:"Serious",4:"Severe",5:"Critical"};
const SEVERITY_COLORS = {1:"#22c55e",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#7c3aed"};
const STATUS_COLORS = {
  reported:     {bg:"#fefce8",color:"#854d0e",border:"#fef08a"},
  under_review: {bg:"#eff6ff",color:"#1e40af",border:"#bfdbfe"},
  hearing_scheduled:{bg:"#f0fdf4",color:"#166534",border:"#bbf7d0"},
  hearing_done: {bg:"#f0fdf4",color:"#166534",border:"#bbf7d0"},
  decision_pending:{bg:"#fff7ed",color:"#9a3412",border:"#fed7aa"},
  warning:      {bg:"#fefce8",color:"#854d0e",border:"#fef08a"},
  suspension:   {bg:"#fff1f2",color:"#881337",border:"#fecdd3"},
  expulsion:    {bg:"#fff1f2",color:"#881337",border:"#fecdd3"},
  dismissed:    {bg:"#f8fafc",color:"#334155",border:"#e2e8f0"},
  appealed:     {bg:"#faf5ff",color:"#581c87",border:"#e9d5ff"},
};

export default function Discipline() {
  const { user, permissions = [] } = useAuth();
  const hasPermission = (p) => permissions.includes(p);
  const [list, setList]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [students, setStudents]     = useState([]);
  const [myClasses, setMyClasses]   = useState([]);
  const [flash, setFlash]           = useState(null);
  const [reportForm, setReportForm] = useState({
    student_id:"", violation_type:"", severity:1, description:"", incident_date:"", evidence:null
  });
  const [submitting, setSubmitting] = useState(false);

  const canReport = hasPermission("discipline.report");
  const canReview = hasPermission("discipline.review");
  const canDecide = hasPermission("discipline.decide");
  const isParent  = hasPermission("discipline.appeal");

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),4000); };

  const load = useCallback(() => {
    setLoading(true);
    disciplineApi.getAll(filterStatus||undefined)
      .then(r => setList(r.data.data || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (showReport && user?.id) {
      teachersApi.getMyClasses().then(r => setMyClasses(r.data.data || [])).catch(()=>{});
    }
  }, [showReport, user]);

  const loadStudentsForClass = (classId) => {
    if (!classId) return;
    import("../api/studentsApi").then(({default: sApi}) => {
      sApi.getAll({class_id: classId, status: "active"}).then(r => setStudents(r.data.data?.items || r.data.data || [])).catch(() => {});
    });
  };

  const submitReport = async () => {
    if (!reportForm.student_id || !reportForm.violation_type || !reportForm.description || !reportForm.incident_date) {
      showFlash("error", "Please fill all required fields."); return;
    }
    setSubmitting(true);
    try {
      const {evidence, ...formData} = reportForm;
      const res = await disciplineApi.report(formData);
      if(evidence && res.data.data?.id) {
        const fd = new FormData(); fd.append("file", evidence);
        await disciplineApi.uploadEvidence(res.data.data.id, fd);
      }
      showFlash("success", "Case reported successfully.");
      setShowReport(false);
      setReportForm({student_id:"",violation_type:"",severity:1,description:"",incident_date:"",evidence:null});
      load();
    } catch(e) {
      showFlash("error", e.response?.data?.message || "Failed to report case.");
    } finally { setSubmitting(false); }
  };

  const statusStyle = (s) => STATUS_COLORS[s] || {bg:"#f8fafc",color:"#334155",border:"#e2e8f0"};

  return (
    <div>
      {/* Flash */}
      {flash && (
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,padding:"10px 18px",borderRadius:8,
          background:flash.type==="success"?"#dcfce7":"#fee2e2",
          color:flash.type==="success"?"#166534":"#dc2626",
          boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:14,fontWeight:600}}>
          {flash.msg}
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Discipline</h1>
        {canReport && (
          <button className="btn btn-primary" onClick={() => setShowReport(true)}>
            + Report Case
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {["","reported","under_review","hearing_scheduled","hearing_done","decision_pending","warning","suspension","expulsion","dismissed","appealed"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",
              background:filterStatus===s?"#2563eb":"#f1f5f9",
              color:filterStatus===s?"#fff":"#475569",border:"none"}}>
            {s ? s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) : "All"}
          </button>
        ))}
      </div>

      {/* Report Case Modal */}
      {showReport && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:540,maxHeight:"90vh",overflow:"auto",
            boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"14px 20px",background:"#fef9f0",borderBottom:"1px solid #fed7aa",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:15}}>Report Discipline Case</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowReport(false)}>Close</button>
            </div>
            <div style={{padding:20}}>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Class *</label>
                <select className="form-input" style={{width:"100%"}}
                  onChange={e => { loadStudentsForClass(e.target.value); }}>
                  <option value="">Select class...</option>
                  {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " - "+c.section : ""}{c.is_primary ? " (Incharge)" : ""}</option>)}
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Student *</label>
                <select className="form-input" style={{width:"100%"}} value={reportForm.student_id}
                  onChange={e => setReportForm(p=>({...p,student_id:e.target.value}))}>
                  <option value="">Select student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Violation Type *</label>
                <select className="form-input" style={{width:"100%"}} value={reportForm.violation_type}
                  onChange={e => setReportForm(p=>({...p,violation_type:e.target.value}))}>
                  <option value="">Select type...</option>
                  {["Bullying","Cheating","Exam Fraud","Fighting","Vandalism","Disrespect","Misconduct","Attendance","Other"].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Severity *</label>
                <select className="form-input" style={{width:"100%"}} value={reportForm.severity}
                  onChange={e => setReportForm(p=>({...p,severity:Number(e.target.value)}))}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {SEVERITY_LABELS[n]}</option>)}
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Incident Date *</label>
                <input type="date" className="form-input" style={{width:"100%"}} value={reportForm.incident_date}
                  onChange={e => setReportForm(p=>({...p,incident_date:e.target.value}))} max={new Date().toISOString().split("T")[0]}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Description *</label>
                <textarea className="form-input" rows={3} style={{width:"100%"}} value={reportForm.description}
                  onChange={e => setReportForm(p=>({...p,description:e.target.value}))}
                  placeholder="Describe the incident in detail..."/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Evidence (optional)</label>
                <input type="file" onChange={e => setReportForm(p=>({...p,evidence:e.target.files[0]}))}/>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowReport(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={submitting}
                  onClick={submitReport}>{submitting?"Submitting...":"Submit Report"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cases Table */}
      {loading ? (
        <div style={{textAlign:"center",padding:60,color:"#64748b"}}>Loading...</div>
      ) : list.length === 0 ? (
        <div style={{textAlign:"center",padding:60,color:"#94a3b8"}}>No discipline cases found.</div>
      ) : (
        <div style={{background:"#fff",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                {["Student","Class","Violation","Severity","Incident Date","Status","Reported By","Action"].map(h => (
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,
                    color:"#64748b",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const ss = statusStyle(c.status);
                return (
                  <tr key={c.id} style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                    <td style={{padding:"10px 14px",fontSize:13,fontWeight:600,color:"#0f172a"}}>{c.student_name}</td>
                    <td style={{padding:"10px 14px",fontSize:13,color:"#475569"}}>{c.class_name}{c.section?" "+c.section:""}</td>
                    <td style={{padding:"10px 14px",fontSize:13,color:"#475569"}}>{c.violation_type}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,
                        background:SEVERITY_COLORS[c.severity]+"22",color:SEVERITY_COLORS[c.severity]}}>
                        {SEVERITY_LABELS[c.severity]||c.severity}
                      </span>
                    </td>
                    <td style={{padding:"10px 14px",fontSize:12,color:"#64748b"}}>{c.incident_date}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:600,
                        background:ss.bg,color:ss.color,border:"1px solid "+ss.border}}>
                        {c.status?.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase())}
                      </span>
                    </td>
                    <td style={{padding:"10px 14px",fontSize:12,color:"#64748b"}}>{c.reporter_name||c.reported_by_name||"—"}</td>
                    <td style={{padding:"10px 14px"}}>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:12}}
                        onClick={e=>{e.stopPropagation();setSelectedCaseId(c.id);}}>View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedCaseId && (
        <DisciplineDetailModal
          caseId={selectedCaseId}
          onClose={() => setSelectedCaseId(null)}
          onActed={() => { setSelectedCaseId(null); load(); }}
        />
      )}
    </div>
  );
}
