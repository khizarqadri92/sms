import React, { useState, useEffect } from "react";
import hrApi from "../api/hrApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const STATUS_COLORS = {
  pending:   {bg:"#fefce8",color:"#854d0e",border:"#fef08a"},
  approved:  {bg:"#f0fdf4",color:"#166534",border:"#bbf7d0"},
  rejected:  {bg:"#fff1f2",color:"#881337",border:"#fecdd3"},
  cancelled: {bg:"#f8fafc",color:"#475569",border:"#e2e8f0"},
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

  if(loading) return <div style={{padding:60,textAlign:"center",color:"#64748b"}}>Loading...</div>;

  return (
    <div style={{margin:"0 auto",padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:700}}>My Leave</h2>
        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={()=>{setFormError(null);setShowForm(true);}}>
          + Apply for Leave
        </button>
      </div>

      {employmentStatus&&(employmentStatus.is_probation||employmentStatus.is_notice_period)&&(
        <div style={{padding:"12px 16px",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:13,color:"#c2410c",marginBottom:employmentStatus.restrictions?.length?8:0}}>
            {employmentStatus.is_notice_period
              ? `You are currently in your notice period (ends ${employmentStatus.notice_period_end_date}).`
              : `You are currently in your probation period (ends ${employmentStatus.probation_end_date}).`}
          </div>
          {employmentStatus.restrictions?.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {employmentStatus.restrictions.map((r,i)=>(
                <div key={i} style={{fontSize:12,color:"#9a3412"}}>
                  • {r.leave_type_name}: {r.remaining>0?`${r.remaining} day(s) remaining`:"not available"} (limit {r.max_days_allowed} day(s))
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leave Balance Table */}
      <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:24}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:700,fontSize:15}}>Leave Balances — {new Date().getFullYear()}</div>
        </div>
        {balances.length===0 ?
          <div style={{padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>
            No leave policies assigned. Contact HR to configure your leave entitlements.
          </div>:
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Leave Type","Type","Total Entitled","Carried Fwd","Submitted","Approved","Remaining"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:h==="Leave Type"?"left":"center",fontSize:11,fontWeight:700,color:"#64748b",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
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
                  <tr key={b.leave_type_id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"12px 14px",fontWeight:600,fontSize:14,color:"#0f172a"}}>
                      {b.leave_type_name}
                      {restr&&<span style={{marginLeft:6,fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:6,background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa"}}>
                        {employmentStatus.is_notice_period?"Notice Limit":"Probation Limit"}
                      </span>}
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"center"}}>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,fontWeight:600,
                        background:b.is_paid?"#f0fdf4":"#f8fafc",color:b.is_paid?"#166534":"#64748b"}}>
                        {b.is_paid?"Paid":"Unpaid"}
                      </span>
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"center",fontSize:14,fontWeight:600,color:"#334155"}}>
                      {displayEntitled}
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"center",fontSize:14,color:"#7c3aed",fontWeight:600}}>
                      {restr?"—":(b.carried_days||0)}
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"center",fontSize:14,color:"#c2410c",fontWeight:600}}>
                      {b.pending_days||0}
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"center",fontSize:14,color:"#dc2626",fontWeight:600}}>
                      {b.approved_days||b.used_days||0}
                    </td>
                    <td style={{padding:"12px 14px",textAlign:"center"}}>
                      <span style={{fontSize:15,fontWeight:800,color:displayRemaining>0?"#2563eb":"#dc2626"}}>
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
      <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",fontWeight:700,fontSize:15}}>
          My Leave Requests
        </div>
        {requests.length===0 ?
          <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No leave requests yet.</div>:
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Leave Type","From","To","Days","Reason","Applied On","Status",""].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"#64748b",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r=>(
                <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={{padding:"10px 12px",fontWeight:600,fontSize:13}}>
                    {r.leave_type_name}
                    {r.duration_type==="half"&&<div style={{fontSize:10,color:"#c2410c",fontWeight:700,marginTop:2}}>Half Leave ({r.half_day_from_time?.slice(0,5)} - {r.half_day_to_time?.slice(0,5)})</div>}
                  </td>
                  <td style={{padding:"10px 12px",fontSize:13,color:"#475569"}}>{formatDate(r.from_date)}</td>
                  <td style={{padding:"10px 12px",fontSize:13,color:"#475569"}}>{formatDate(r.to_date)}</td>
                  <td style={{padding:"10px 12px",fontSize:13,textAlign:"center",fontWeight:700}}>{r.total_days}</td>
                  <td style={{padding:"10px 12px",fontSize:12,color:"#64748b",maxWidth:200}}>
                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.reason}>{r.reason}</div>
                    {r.review_note&&<div style={{fontSize:11,color:"#7c3aed",marginTop:2}}>Note: {r.review_note}</div>}
                  </td>
                  <td style={{padding:"10px 12px",fontSize:12,color:"#94a3b8",whiteSpace:"nowrap"}}>{r.applied_at ? formatDateTime(r.applied_at) : "-"}</td>
                  <td style={{padding:"10px 12px"}}>
                    <span style={{padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:700,whiteSpace:"nowrap",
                      background:ss(r.status).bg,color:ss(r.status).color,border:"1px solid "+ss(r.status).border}}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{padding:"10px 12px"}}>
                    {r.status==="pending"&&(
                      <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11,whiteSpace:"nowrap"}}
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
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:16}}>Apply for Leave</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Close</button>
            </div>
            <div style={{padding:20}}>
              {formError&&(
                <div style={{marginBottom:14,padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,fontSize:13,color:"#b91c1c",fontWeight:600}}>
                  ⚠ {formError}
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Leave Type *</label>
                  <select className="form-input" style={{width:"100%",fontSize:13}} value={form.leave_type_id}
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
                    <div style={{marginTop:6,fontSize:12,color:"#2563eb",fontWeight:600}}>
                      Available: {effectiveRemaining} day{effectiveRemaining!==1?"s":""}
                      {selRestriction&&<span style={{color:"#c2410c",marginLeft:6,fontWeight:700}}>({employmentStatus.is_notice_period?"Notice":"Probation"} Limit)</span>}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Duration *</label>
                  <select className="form-input" style={{width:"100%",fontSize:13}} value={form.duration_type}
                    onChange={e=>setForm(p=>({...p,duration_type:e.target.value,to_date:e.target.value==="half"?p.from_date:p.to_date}))}>
                    <option value="full">Full Leave</option>
                    <option value="half">Half Leave</option>
                  </select>
                </div>

                {form.duration_type==="half" ? (
                  <div>
                    <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Date *</label>
                    <DatePicker style={{width:"100%",fontSize:13}}
                      value={form.from_date} onChange={val=>setForm(p=>({...p,from_date:val,to_date:val}))}/>
                  </div>
                ) : (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>From Date *</label>
                      <DatePicker style={{width:"100%",fontSize:13}}
                        value={form.from_date} onChange={val=>setForm(p=>({...p,from_date:val}))}/>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>To Date *</label>
                      <DatePicker style={{width:"100%",fontSize:13}}
                        value={form.to_date} onChange={val=>setForm(p=>({...p,to_date:val}))}/>
                    </div>
                  </div>
                )}

                {form.duration_type==="half" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>From Time *</label>
                      <input type="time" className="form-input" style={{width:"100%",fontSize:13}}
                        value={form.half_day_from_time} onChange={e=>setForm(p=>({...p,half_day_from_time:e.target.value}))}/>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>To Time *</label>
                      <input type="time" className="form-input" style={{width:"100%",fontSize:13}}
                        value={form.half_day_to_time} onChange={e=>setForm(p=>({...p,half_day_to_time:e.target.value}))}/>
                    </div>
                  </div>
                )}

                {calcDays>0&&(
                  <div style={{padding:"8px 12px",background:"#eff6ff",borderRadius:8,fontSize:13,fontWeight:600,color:"#2563eb",textAlign:"center"}}>
                    Duration: {calcDays} day{calcDays!==1?"s":""}
                    {selBalance&&calcDays>effectiveRemaining&&
                      <span style={{color:"#dc2626",marginLeft:8}}>⚠ Exceeds {selRestriction?(employmentStatus.is_notice_period?"notice":"probation")+" limit":"balance"}!</span>}
                  </div>
                )}
                <div>
                  <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Reason *</label>
                  <textarea className="form-input" rows={3} style={{width:"100%",fontSize:13}}
                    placeholder="Briefly describe the reason for your leave..."
                    value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={saving} onClick={submit}>
                  {saving?"Submitting...":"Submit Leave Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flash&&<div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"10px 18px",borderRadius:8,
        background:flash.type==="success"?"#dcfce7":"#fee2e2",color:flash.type==="success"?"#166534":"#dc2626",
        boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:14,fontWeight:600}}>{flash.msg}</div>}
    </div>
  );
}
