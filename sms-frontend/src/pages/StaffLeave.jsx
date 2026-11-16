import React, { useState, useEffect } from "react";
import hrApi from "../api/hrApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./StaffLeave.css";

const STATUS_COLORS = {
  pending:   {bg:"#fefce8",color:"#854d0e",border:"#fef08a"},
  approved:  {bg:"#f0fdf4",color:"#166534",border:"#bbf7d0"},
  rejected:  {bg:"#fff1f2",color:"#881337",border:"#fecdd3"},
  cancelled: {bg:"var(--bg-hover)",color:"var(--text-secondary)",border:"var(--border-color)"},
};

export default function StaffLeave() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const [leaveTypes, setLeaveTypes]   = useState([]);
  const [balances, setBalances]       = useState([]);
  const [requests, setRequests]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [flash, setFlash]             = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [form, setForm]               = useState({leave_type_id:"", from_date:"", to_date:"", reason:"", duration_type:"full", half_day_from_time:"", half_day_to_time:""});
  const [calcDays, setCalcDays]       = useState(0);
  const [employmentStatus, setEmploymentStatus] = useState(null);
  const [formError, setFormError]     = useState(null);

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),5000); };

  const load = () => {
    setLoading(true);
    Promise.all([
      hrApi.getMyLeaveTypes(),
      hrApi.getMyLeaveBalances(),
      hrApi.getMyLeaveRequests(),
      hrApi.getMyEmploymentStatus(),
    ]).then(([t,b,r,es])=>{
      setLeaveTypes(t.data.data||[]);
      setBalances(b.data.data||[]);
      setRequests(r.data.data||[]);
      setEmploymentStatus(es.data.data||null);
    }).catch(()=>{}).finally(()=>setLoading(false));
  };

  useEffect(()=>{ load(); },[]);

  useEffect(()=>{
    if(form.duration_type==="half"){
      setCalcDays(0.5);
      return;
    }
    if(form.from_date && form.to_date){
      const d1 = new Date(form.from_date);
      const d2 = new Date(form.to_date);
      const days = d2>=d1 ? Math.round((d2-d1)/(1000*60*60*24))+1 : 0;
      setCalcDays(days);
    } else setCalcDays(0);
  },[form.from_date, form.to_date, form.duration_type]);

  const resetForm = () => setForm({leave_type_id:"",from_date:"",to_date:"",reason:"",duration_type:"full",half_day_from_time:"",half_day_to_time:""});

  const submit = async () => {
    setFormError(null);
    if(!form.leave_type_id||!form.from_date||!form.reason.trim()){
      setFormError("All fields are required."); return;
    }
    if(form.duration_type==="half"){
      if(!form.half_day_from_time||!form.half_day_to_time){
        setFormError("From Time and To Time are required for Half Leave."); return;
      }
    } else {
      if(!form.to_date){ setFormError("All fields are required."); return; }
      if(calcDays<=0){ setFormError("Invalid date range."); return; }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        to_date: form.duration_type==="half" ? form.from_date : form.to_date,
      };
      const r = await hrApi.applyLeave(payload);
      showFlash("success", r.data.message);
      setShowForm(false);
      resetForm();
      setFormError(null);
      load();
    } catch(e){
      setFormError(
        e.response?.data?.message ||
        e.response?.data?.detail?.message ||
        (typeof e.response?.data?.detail === "string" ? e.response.data.detail : null) ||
        "Failed to submit."
      );
    }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if(!window.confirm("Cancel this leave request?")) return;
    try {
      await hrApi.cancelLeaveRequest(id);
      showFlash("success","Request cancelled."); load();
    } catch(e){ showFlash("error", e.response?.data?.detail?.message||"Failed."); }
  };

  const ss = (s) => STATUS_COLORS[s]||STATUS_COLORS.cancelled;
  const selBalance = balances.find(b=>b.leave_type_id===Number(form.leave_type_id));
  const selRestriction = employmentStatus?.restrictions?.find(r=>r.leave_type_id===Number(form.leave_type_id));
  const effectiveRemaining = selRestriction ? selRestriction.remaining : selBalance?.remaining_days;

  if(loading) return <div className="sl-loading">Loading...</div>;

  return (
    <div className="sl-page">
      <div className="sl-header">
        <h2 className="sl-title">My Leave</h2>
        <button className="btn btn-primary btn-sm sl-apply-btn" onClick={()=>{setFormError(null);setShowForm(true);}}>
          + Apply for Leave
        </button>
      </div>

      {employmentStatus&&(employmentStatus.is_probation||employmentStatus.is_notice_period)&&(
        <div className="sl-restriction-box">
          <div className="sl-restriction-title" style={{ "--rt-mb": employmentStatus.restrictions?.length?"8px":"0" }}>
            {employmentStatus.is_notice_period
              ? `You are currently in your notice period (ends ${employmentStatus.notice_period_end_date}).`
              : `You are currently in your probation period (ends ${employmentStatus.probation_end_date}).`}
          </div>
          {employmentStatus.restrictions?.length>0&&(
            <div className="sl-restriction-list">
              {employmentStatus.restrictions.map((r,i)=>(
                <div key={i} className="sl-restriction-item">
                  • {r.leave_type_name}: {r.remaining>0?`${r.remaining} day(s) remaining`:"not available"} (limit {r.max_days_allowed} day(s))
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leave Balance Table */}
      <div className="sl-card">
        <div className="sl-card-header">
          <div className="sl-card-title">Leave Balances — {new Date().getFullYear()}</div>
        </div>
        {balances.length===0 ?
          <div className="sl-empty-text">
            No leave policies assigned. Contact HR to configure your leave entitlements.
          </div>:
          <table className="sl-table">
            <thead>
              <tr className="sl-th-row">
                {["Leave Type","Type","Total Entitled","Carried Fwd","Submitted","Approved","Remaining"].map(h=>(
                  <th key={h} className="sl-th" style={{ "--align": h==="Leave Type"?"left":"center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {balances
                .filter(b=>{
                  const restrictionActive = employmentStatus && (employmentStatus.is_probation || employmentStatus.is_notice_period);
                  if(!restrictionActive) return true;
                  return employmentStatus.restrictions?.some(r=>r.leave_type_id===b.leave_type_id);
                })
                .map(b=>{
                  const restr = employmentStatus?.restrictions?.find(r=>r.leave_type_id===b.leave_type_id);
                  const displayEntitled = restr ? restr.max_days_allowed : (b.entitled_days||b.total_days||0);
                  const displayRemaining = restr ? restr.remaining : b.remaining_days;
                  return (
                  <tr key={b.leave_type_id} className="sl-tr">
                    <td className="sl-td-name">
                      {b.leave_type_name}
                      {restr&&<span className="sl-restriction-tag">
                        {employmentStatus.is_notice_period?"Notice Limit":"Probation Limit"}
                      </span>}
                    </td>
                    <td className="sl-td-center">
                      <span className="sl-paid-badge" style={{ "--badge-bg": b.is_paid?"var(--bg-success-soft)":"var(--bg-hover)", "--badge-color": b.is_paid?"#166534":"var(--text-secondary)" }}>
                        {b.is_paid?"Paid":"Unpaid"}
                      </span>
                    </td>
                    <td className="sl-td-entitled">
                      {displayEntitled}
                    </td>
                    <td className="sl-td-carried">
                      {restr?"—":(b.carried_days||0)}
                    </td>
                    <td className="sl-td-pending">
                      {b.pending_days||0}
                    </td>
                    <td className="sl-td-approved">
                      {b.approved_days||b.used_days||0}
                    </td>
                    <td className="sl-td-center">
                      <span className="sl-remaining-value" style={{ "--rem-color": displayRemaining>0?"#2563eb":"#dc2626" }}>
                        {displayRemaining}
                      </span>
                    </td>
                  </tr>
                  );
                })}
            </tbody>
          </table>}
      </div>

      {/* Leave Requests */}
      <div className="sl-card-flat">
        <div className="sl-card-header-plain">
          My Leave Requests
        </div>
        {requests.length===0 ?
          <div className="sl-empty-text-lg">No leave requests yet.</div>:
          <table className="sl-table">
            <thead>
              <tr className="sl-th-row">
                {["Leave Type","From","To","Days","Reason","Applied On","Status",""].map(h=>(
                  <th key={h} className="sl-req-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r=>(
                <tr key={r.id} className="sl-req-tr">
                  <td className="sl-req-td-type">
                    {r.leave_type_name}
                    {r.duration_type==="half"&&<div className="sl-half-leave-tag">Half Leave ({r.half_day_from_time?.slice(0,5)} - {r.half_day_to_time?.slice(0,5)})</div>}
                  </td>
                  <td className="sl-req-td">{formatDate(r.from_date)}</td>
                  <td className="sl-req-td">{formatDate(r.to_date)}</td>
                  <td className="sl-req-td-days">{r.total_days}</td>
                  <td className="sl-reason-cell">
                    <div className="sl-reason-text" title={r.reason}>{r.reason}</div>
                    {r.review_note&&<div className="sl-review-note">Note: {r.review_note}</div>}
                  </td>
                  <td className="sl-applied-cell">{r.applied_at ? formatDateTime(r.applied_at) : "-"}</td>
                  <td className="sl-req-td-plain">
                    <span className="sl-status-badge" style={{ "--badge-bg": ss(r.status).bg, "--badge-color": ss(r.status).color, "--badge-border": ss(r.status).border }}>
                      {r.status}
                    </span>
                  </td>
                  <td className="sl-req-td-plain">
                    {r.status==="pending"&&(
                      <button className="btn btn-ghost btn-sm sl-cancel-btn"
                        onClick={()=>cancel(r.id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      {/* Apply Leave Modal */}
      {showForm && (
        <div className="sl-modal-overlay">
          <div className="sl-modal-box">
            <div className="sl-modal-header">
              <div className="sl-modal-title">Apply for Leave</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Close</button>
            </div>
            <div className="sl-modal-body">
              {formError&&(
                <div className="sl-error-banner">
                  ⚠ {formError}
                </div>
              )}
              <div className="sl-form-column">
                <div>
                  <label className="sl-field-label">Leave Type *</label>
                  <select className="form-input sl-select-full" value={form.leave_type_id}
                    onChange={e=>setForm(p=>({...p,leave_type_id:e.target.value}))}>
                    <option value="">Select leave type...</option>
                    {leaveTypes
                      .filter(lt=>balances.some(b=>b.leave_type_id===lt.id&&(b.entitled_days||b.total_days||0)>0))
                      .filter(lt=>{
                        const restrictionActive = employmentStatus && (employmentStatus.is_probation || employmentStatus.is_notice_period);
                        const restr = employmentStatus?.restrictions?.find(r=>r.leave_type_id===lt.id);
                        if(restrictionActive) return !!restr && restr.remaining>0;
                        return true;
                      })
                      .map(lt=>{
                        const restr = employmentStatus?.restrictions?.find(r=>r.leave_type_id===lt.id);
                        const periodLabel = employmentStatus?.is_notice_period?"notice period":"probation";
                        return (
                          <option key={lt.id} value={lt.id}>
                            {lt.name}{restr?` — ${restr.remaining} day(s) left (${periodLabel})`:""}
                          </option>
                        );
                      })}
                  </select>
                  {selBalance&&(
                    <div className="sl-available-text">
                      Available: {effectiveRemaining} day{effectiveRemaining!==1?"s":""}
                      {selRestriction&&<span className="sl-limit-tag">({employmentStatus.is_notice_period?"Notice":"Probation"} Limit)</span>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="sl-field-label">Duration *</label>
                  <select className="form-input sl-select-full" value={form.duration_type}
                    onChange={e=>setForm(p=>({...p,duration_type:e.target.value,to_date:e.target.value==="half"?p.from_date:p.to_date}))}>
                    <option value="full">Full Leave</option>
                    <option value="half">Half Leave</option>
                  </select>
                </div>

                {form.duration_type==="half" ? (
                  <div>
                    <label className="sl-field-label">Date *</label>
                    <DatePicker style={{width:"100%",fontSize:13}}
                      value={form.from_date} onChange={val=>setForm(p=>({...p,from_date:val,to_date:val}))}/>
                  </div>
                ) : (
                  <div className="sl-date-grid">
                    <div>
                      <label className="sl-field-label">From Date *</label>
                      <DatePicker style={{width:"100%",fontSize:13}}
                        value={form.from_date} onChange={val=>setForm(p=>({...p,from_date:val}))}/>
                    </div>
                    <div>
                      <label className="sl-field-label">To Date *</label>
                      <DatePicker style={{width:"100%",fontSize:13}}
                        value={form.to_date} onChange={val=>setForm(p=>({...p,to_date:val}))}/>
                    </div>
                  </div>
                )}

                {form.duration_type==="half" && (
                  <div className="sl-date-grid">
                    <div>
                      <label className="sl-field-label">From Time *</label>
                      <input type="time" className="form-input sl-input-full"
                        value={form.half_day_from_time} onChange={e=>setForm(p=>({...p,half_day_from_time:e.target.value}))}/>
                    </div>
                    <div>
                      <label className="sl-field-label">To Time *</label>
                      <input type="time" className="form-input sl-input-full"
                        value={form.half_day_to_time} onChange={e=>setForm(p=>({...p,half_day_to_time:e.target.value}))}/>
                    </div>
                  </div>
                )}

                {calcDays>0&&(
                  <div className="sl-duration-box">
                    Duration: {calcDays} day{calcDays!==1?"s":""}
                    {selBalance&&calcDays>effectiveRemaining&&
                      <span className="sl-exceeds-text">⚠ Exceeds {selRestriction?(employmentStatus.is_notice_period?"notice":"probation")+" limit":"balance"}!</span>}
                  </div>
                )}
                <div>
                  <label className="sl-field-label">Reason *</label>
                  <textarea className="form-input sl-input-full" rows={3}
                    placeholder="Briefly describe the reason for your leave..."
                    value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}/>
                </div>
              </div>
              <div className="sl-btn-row">
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm sl-submit-btn" disabled={saving} onClick={submit}>
                  {saving?"Submitting...":"Submit Leave Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flash&&<div className="sl-flash-toast" style={{ "--flash-bg": flash.type==="success"?"#dcfce7":"#fee2e2", "--flash-color": flash.type==="success"?"#166534":"#dc2626" }}>{flash.msg}</div>}
    </div>
  );
}
