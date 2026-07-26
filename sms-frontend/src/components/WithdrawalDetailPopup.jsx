import React, { useState, useEffect } from "react";
import { withdrawalApi } from "../api/withdrawalApi";
import workflowApi from "../api/workflowApi";
import { useAuth } from "../auth/AuthContext";

export default function WithdrawalDetailPopup({ item, onClose, onActed }) {
  const { user, roles: userRoles = [] } = useAuth();
  const [detail, setDetail] = useState(null);
  const [wfStep, setWfStep] = useState(null);
  const [wfSteps, setWfSteps] = useState([]);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item?.entity_id) return;
    setLoading(true);
    Promise.all([
      withdrawalApi.getOne(item.entity_id),
      workflowApi.getInstance("withdrawal", "withdrawal_request", item.entity_id)
    ]).then(([detailRes, wfRes]) => {
      setDetail(detailRes.data.data);
      const inst = wfRes.data.data;
      const steps = inst?.steps || [];
      setWfSteps(steps);
      const pending = steps.find(s => s.status === "pending" && (
        s.assigned_to_id === user?.id ||
        (s.assigned_role && userRoles.some(r => r === s.assigned_role || r?.name === s.assigned_role))
      ));
      setWfStep(pending || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [item?.entity_id]);

  const act = async (action) => {
    if (action === "reject" && !note.trim()) { setError("Please provide a reason."); return; }
    setActing(true); setError("");
    try {
      const fn = action === "approve" ? withdrawalApi.approve
               : action === "reject"  ? withdrawalApi.reject
               : withdrawalApi.clear;
      await fn(item.entity_id, { action, note });
      if (onActed) onActed();
      onClose();
    } catch(e) {
      setError(e.response?.data?.message || "Action failed.");
    } finally { setActing(false); }
  };

  const STATUS_COLOR = {
    pending:"#f59e0b", under_review:"#3b82f6", clearance:"#8b5cf6",
    approved:"#22c55e", rejected:"#ef4444", withdrawn:"#6b7280"
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",
      display:"flex",alignItems:"flex-start",justifyContent:"center",
      padding:20,overflowY:"auto"}}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:700,
        marginTop:40,marginBottom:40}}>

        {/* Action Bar */}
        {wfStep && (
          <div style={{padding:"12px 20px",background:"#eff6ff",borderBottom:"1px solid #bfdbfe",
            borderRadius:"12px 12px 0 0",display:"flex",alignItems:"center",
            justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div>
              <span style={{fontWeight:700,fontSize:13}}>Current Step: </span>
              <span style={{fontSize:13,color:"#0369a1"}}>{wfStep.step_name}</span>
              {wfStep.assigned_role && <span style={{fontSize:12,color:"#64748b",marginLeft:8}}>
                ({wfStep.assigned_role.replace(/_/g," ")})
              </span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {wfStep.can_reject !== false && (
                <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}}
                  disabled={acting} onClick={()=>act("reject")}>
                  {wfStep.reject_label||"Reject"}
                </button>
              )}
              <button className="btn btn-primary btn-sm" disabled={acting}
                onClick={()=>act(wfStep.step_type||"approve")}>
                {wfStep.action_label||wfStep.step_name||"Approve"}
              </button>
            </div>
          </div>
        )}

        <div style={{padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div>
              {loading ? <div style={{color:"#94a3b8"}}>Loading...</div> : detail && <>
                <div style={{fontWeight:700,fontSize:18}}>{detail.student_name}</div>
                <div style={{fontSize:13,color:"#64748b"}}>{detail.student_number} · {detail.class_name}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
                  <span style={{padding:"3px 10px",borderRadius:12,fontSize:12,fontWeight:600,
                    background:`${STATUS_COLOR[detail.status]||"#6b7280"}22`,
                    color:STATUS_COLOR[detail.status]||"#6b7280",textTransform:"capitalize"}}>
                    {detail.status?.replace(/_/g," ")||"Pending"}
                  </span>
                  <span style={{fontSize:12,color:"#94a3b8"}}>Effective: {
                    detail.effective_date ? new Date(detail.effective_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "—"
                  }</span>
                </div>
              </>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
          </div>

          {error && <div style={{color:"#dc2626",fontSize:13,marginBottom:8}}>{error}</div>}

          {wfStep && (
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>
                Notes (optional)
              </label>
              <textarea className="form-input" rows={2} value={note}
                onChange={e=>setNote(e.target.value)}
                placeholder="Add a note..." style={{width:"100%",resize:"vertical"}} />
            </div>
          )}

          {detail && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>REASON</div>
              <div style={{fontSize:14,color:"#334155"}}>{detail.reason}</div>
            </div>
          )}

          {/* Pipeline / Progress */}
          {wfSteps.length > 0 && (
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:12}}>PIPELINE</div>
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                {wfSteps.map((s, idx) => (
                  <div key={idx} style={{display:"flex",gap:12,marginBottom:10,
                    opacity:s.status==="pending"&&s.step_order>=(wfSteps.find(x=>x.status==="pending")?.step_order||0)?
                      (s.status==="pending"&&s===wfSteps.find(x=>x.status==="pending")?1:0.45):1}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                        background:s.status==="approved"?"#22c55e":s.status==="pending"&&s===wfSteps.find(x=>x.status==="pending")?"#2563eb":"var(--color-background-tertiary)",
                        border:s.status==="pending"&&s===wfSteps.find(x=>x.status==="pending")?"2px solid #2563eb":"2px solid transparent",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:11,fontWeight:700,
                        color:s.status==="approved"||s.status==="pending"?"#fff":"#94a3b8"}}>
                        {s.status==="approved"?"✓":s.status==="pending"&&s===wfSteps.find(x=>x.status==="pending")?"●":idx+1}
                      </div>
                      {idx<wfSteps.length-1&&<div style={{width:2,flex:1,minHeight:14,
                        background:s.status==="approved"?"#22c55e":"var(--color-border-tertiary)",marginTop:2}}/>}
                    </div>
                    <div style={{paddingBottom:10}}>
                      <div style={{fontWeight:600,fontSize:13}}>{s.step_name}
                        {s===wfSteps.find(x=>x.status==="pending")&&
                          <span style={{marginLeft:8,fontSize:11,color:"#2563eb",fontWeight:700}}>Current</span>}
                      </div>
                      <div style={{fontSize:12,color:"#64748b"}}>{s.assigned_role?.replace(/_/g," ")}</div>
                      {s.actioned_at&&<div style={{fontSize:11,color:"#94a3b8"}}>
                        {new Date(s.actioned_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",marginTop:16,borderTop:"1px solid #e2e8f0",paddingTop:12}}>
            <a href={item.link} style={{fontSize:13,color:"#2563eb"}}>Open full page →</a>
          </div>
        </div>
      </div>
    </div>
  );
}
