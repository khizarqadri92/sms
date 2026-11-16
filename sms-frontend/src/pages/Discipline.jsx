import React, { useState, useEffect, useCallback } from "react";
import { disciplineApi } from "../api/disciplineApi";
import { useAuth } from "../auth/AuthContext";
import teachersApi from "../api/teachersApi";
import DisciplineDetailModal from "../components/DisciplineDetailModal";
import DatePicker from "../components/DatePicker";
import { useProcessingToday } from "../hooks/useProcessingToday";
import "./Discipline.css";

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
  const processingToday = useProcessingToday();
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
        <div className="disc-flash-toast" style={{ "--flash-bg": flash.type==="success"?"#dcfce7":"#fee2e2", "--flash-color": flash.type==="success"?"#166534":"#dc2626" }}>
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
      <div className="disc-filter-row">
        {["","reported","under_review","hearing_scheduled","hearing_done","decision_pending","warning","suspension","expulsion","dismissed","appealed"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="disc-filter-btn"
            style={{ "--btn-bg": filterStatus===s?"#2563eb":"var(--bg-hover)", "--btn-color": filterStatus===s?"#fff":"var(--text-secondary)" }}>
            {s ? s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) : "All"}
          </button>
        ))}
      </div>

      {/* Report Case Modal */}
      {showReport && (
        <div className="disc-modal-overlay">
          <div className="disc-modal-box">
            <div className="disc-modal-header">
              <div className="disc-modal-title">Report Discipline Case</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowReport(false)}>Close</button>
            </div>
            <div className="disc-modal-body">
              <div className="disc-field-group">
                <label className="disc-field-label">Class *</label>
                <select className="form-input disc-full-input"
                  onChange={e => { loadStudentsForClass(e.target.value); }}>
                  <option value="">Select class...</option>
                  {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " - "+c.section : ""}{c.is_primary ? " (Incharge)" : ""}</option>)}
                </select>
              </div>
              <div className="disc-field-group">
                <label className="disc-field-label">Student *</label>
                <select className="form-input disc-full-input" value={reportForm.student_id}
                  onChange={e => setReportForm(p=>({...p,student_id:e.target.value}))}>
                  <option value="">Select student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
              </div>
              <div className="disc-field-group">
                <label className="disc-field-label">Violation Type *</label>
                <select className="form-input disc-full-input" value={reportForm.violation_type}
                  onChange={e => setReportForm(p=>({...p,violation_type:e.target.value}))}>
                  <option value="">Select type...</option>
                  {["Bullying","Cheating","Exam Fraud","Fighting","Vandalism","Disrespect","Misconduct","Attendance","Other"].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="disc-field-group">
                <label className="disc-field-label">Severity *</label>
                <select className="form-input disc-full-input" value={reportForm.severity}
                  onChange={e => setReportForm(p=>({...p,severity:Number(e.target.value)}))}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {SEVERITY_LABELS[n]}</option>)}
                </select>
              </div>
              <div className="disc-field-group">
                <label className="disc-field-label">Incident Date *</label>
                <DatePicker style={{width:"100%"}} value={reportForm.incident_date}
                  onChange={val => setReportForm(p=>({...p,incident_date:val}))} max={processingToday}/>
              </div>
              <div className="disc-field-group">
                <label className="disc-field-label">Description *</label>
                <textarea className="form-input disc-full-input" rows={3} value={reportForm.description}
                  onChange={e => setReportForm(p=>({...p,description:e.target.value}))}
                  placeholder="Describe the incident in detail..."/>
              </div>
              <div className="disc-field-group-last">
                <label className="disc-field-label">Evidence (optional)</label>
                <input type="file" onChange={e => setReportForm(p=>({...p,evidence:e.target.files[0]}))}/>
              </div>
              <div className="disc-modal-footer">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowReport(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm disc-save-btn" disabled={submitting}
                  onClick={submitReport}>{submitting?"Submitting...":"Submit Report"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cases Table */}
      {loading ? (
        <div className="disc-loading-text">Loading...</div>
      ) : list.length === 0 ? (
        <div className="disc-empty-text">No discipline cases found.</div>
      ) : (
        <div className="disc-table-wrap">
          <table className="disc-table">
            <thead>
              <tr className="disc-th-row">
                {["Student","Class","Violation","Severity","Incident Date","Status","Reported By","Action"].map(h => (
                  <th key={h} className="disc-th">{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const ss = statusStyle(c.status);
                return (
                  <tr key={c.id} className="disc-tr">
                    <td className="disc-td-bold">{c.student_name}</td>
                    <td className="disc-td">{c.class_name}{c.section?" "+c.section:""}</td>
                    <td className="disc-td">{c.violation_type}</td>
                    <td className="disc-td">
                      <span className="disc-severity-badge" style={{ "--sev-bg": SEVERITY_COLORS[c.severity]+"22", "--sev-color": SEVERITY_COLORS[c.severity] }}>
                        {SEVERITY_LABELS[c.severity]||c.severity}
                      </span>
                    </td>
                    <td className="disc-td-muted">{c.incident_date}</td>
                    <td className="disc-td">
                      <span className="disc-status-badge" style={{ "--status-bg": ss.bg, "--status-color": ss.color, "--status-border": ss.border }}>
                        {c.status?.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase())}
                      </span>
                    </td>
                    <td className="disc-td-muted">{c.reporter_name||c.reported_by_name||"—"}</td>
                    <td className="disc-td">
                      <button className="btn btn-ghost btn-sm disc-view-btn"
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
