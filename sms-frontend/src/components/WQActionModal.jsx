import React, { useState, useEffect } from "react";
import workflowApi from "../api/workflowApi";
import { leavesApi } from "../api/leavesApi";
import procurementApi from "../api/procurementApi";
import { withdrawalApi } from "../api/withdrawalApi";
import { useAuth } from "../auth/AuthContext";
import hrApi from "../api/hrApi";
import attendanceApi from "../api/attendanceApi";

const MODULE_ACT = {
  "leaves/leave_application":          (id, action, note) => leavesApi.actionLeave(id, { action, note }),
  "procurement/purchase_requisition":  (id, action, note) => procurementApi.actOnRequisition(id, { action, notes: note }),
  "finance/vendor_invoice":            (id, action, note) => procurementApi.actOnVendorInvoice(id, { action, notes: note }),
  "withdrawal/withdrawal_request":     (id, action, note) => withdrawalApi.clear(id, { action, note }),
  "hr/staff_leave":                     (id, action, note) => hrApi.advanceLeaveWorkflow(id, { action, note }),
  "hr/attendance_correction":           (id, action, note) => attendanceApi.advanceCorrectionRequest(id, { action, note }),
};

const ENTITY_TYPE_LABELS = {
  leave_application: "Leave Request",
  purchase_requisition: "Purchase Requisition",
  vendor_invoice: "Vendor Invoice",
  withdrawal_request: "Withdrawal Request",
  staff_leave: "Staff Leave Request",
  attendance_correction: "Attendance Correction",
};

export default function WQActionModal({ item, onClose, onActed }) {
  const { user, roles: userRoles = [] } = useAuth();
  const [wfStep, setWfStep]       = useState(null);
  const [allSteps, setAllSteps]   = useState([]);
  const [leaveDetail, setLeaveDetail] = useState(null);
  const [correctionDetail, setCorrectionDetail] = useState(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    workflowApi.getInstance(item.module, item.entity_type, item.entity_id)
      .then(r => {
        const steps = r.data.data?.steps || [];
        setAllSteps(steps);
        const pending = steps.find(s => s.status === "pending" && (
          s.assigned_to_id === user?.id ||
          (s.assigned_role && userRoles.some(r => r === s.assigned_role || r?.name === s.assigned_role))
        ));
        setWfStep(pending || null);
      })
      .catch(() => setWfStep(null))
      .finally(() => setLoading(false));
    if(item.module==="hr" && item.entity_type==="staff_leave") {
      hrApi.getLeaveRequests({}).then(r=>{
        const req = (r.data.data||[]).find(x=>x.id===item.entity_id);
        setLeaveDetail(req||null);
      }).catch(()=>{});
    }
    if(item.module==="hr" && item.entity_type==="attendance_correction") {
      attendanceApi.getCorrectionRequests({}).then(r=>{
        const req = (r.data.data||[]).find(x=>x.id===item.entity_id);
        setCorrectionDetail(req||null);
      }).catch(()=>{});
    }
  }, [item?.id]);

  const act = async (action) => {
    if (action === "reject" && !note.trim()) { setError("Please provide a reason."); return; }
    setActing(true); setError("");
    const key = `${item.module}/${item.entity_type}`;
    const fn = MODULE_ACT[key];
    if (!fn) { setError("Action not supported for this module."); setActing(false); return; }
    try {
      await fn(item.entity_id, action, note);
      if (onActed) onActed();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Action failed.");
    } finally { setActing(false); }
  };

  if (!item) return null;

  return (
    <div style={{ position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:"#fff",borderRadius:12,padding:24,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:700,fontSize:16 }}>{item.title}</div>
            <div style={{ fontSize:13,color:"#64748b",marginTop:4 }}>{item.description}</div>
          {leaveDetail && (
            <div style={{marginTop:10,padding:"10px 12px",background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1d4ed8",marginBottom:6}}>Leave Request Details</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12}}>
                <div><span style={{color:"#64748b"}}>Staff: </span><strong>{leaveDetail.staff_name}</strong></div>
                <div><span style={{color:"#64748b"}}>Leave Type: </span><strong>{leaveDetail.leave_type_name}</strong></div>
                <div><span style={{color:"#64748b"}}>From: </span><strong>{leaveDetail.from_date}</strong></div>
                <div><span style={{color:"#64748b"}}>To: </span><strong>{leaveDetail.to_date}</strong></div>
                <div><span style={{color:"#64748b"}}>Days: </span><strong>{leaveDetail.total_days}</strong></div>
                <div><span style={{color:"#64748b"}}>Applied: </span><strong>{leaveDetail.applied_at?.slice(0,10)}</strong></div>
                <div style={{gridColumn:"1/-1"}}><span style={{color:"#64748b"}}>Reason: </span>{leaveDetail.reason}</div>
              </div>
            </div>
          )}
          {correctionDetail && (() => {
            const hasIn = !!correctionDetail.requested_clock_in;
            const hasOut = !!correctionDetail.requested_clock_out;
            const updatingLabel = hasIn && hasOut ? "Clock In & Clock Out" : hasIn ? "Clock In only" : "Clock Out only";
            return (
            <div style={{marginTop:10,padding:"10px 12px",background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1d4ed8",marginBottom:6}}>Correction Request Details</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12}}>
                <div><span style={{color:"#64748b"}}>Staff: </span><strong>{correctionDetail.first_name} {correctionDetail.last_name}</strong></div>
                <div><span style={{color:"#64748b"}}>Date: </span><strong>{correctionDetail.request_date}</strong></div>
                <div style={{gridColumn:"1/-1"}}>
                  <span style={{color:"#64748b"}}>Requesting to update: </span>
                  <strong style={{color:"#1d4ed8"}}>{updatingLabel}</strong>
                </div>
                <div style={{
                  padding:"6px 10px", borderRadius:6,
                  background: hasIn ? "#fff" : "#f1f5f9",
                  border: hasIn ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                  opacity: hasIn ? 1 : 0.5
                }}>
                  <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",fontWeight:700}}>Clock In</div>
                  <div style={{fontSize:15,fontWeight:700,color: hasIn ? "#0f172a" : "#94a3b8"}}>{hasIn ? correctionDetail.requested_clock_in.slice(0,5) : "Not requested"}</div>
                </div>
                <div style={{
                  padding:"6px 10px", borderRadius:6,
                  background: hasOut ? "#fff" : "#f1f5f9",
                  border: hasOut ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                  opacity: hasOut ? 1 : 0.5
                }}>
                  <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",fontWeight:700}}>Clock Out</div>
                  <div style={{fontSize:15,fontWeight:700,color: hasOut ? "#0f172a" : "#94a3b8"}}>{hasOut ? correctionDetail.requested_clock_out.slice(0,5) : "Not requested"}</div>
                </div>
                <div style={{gridColumn:"1/-1"}}><span style={{color:"#64748b"}}>Reason: </span>{correctionDetail.reason}</div>
              </div>
            </div>
            );
          })()}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16,padding:12,background:"#f8fafc",borderRadius:8 }}>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>REQUEST TYPE</div><div style={{fontSize:13}}>{ENTITY_TYPE_LABELS[item.entity_type] || item.entity_type}</div></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>STATUS</div><div style={{fontSize:13,textTransform:"capitalize"}}>{item.entity_status||item.status}</div></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>ACTION REQUIRED</div><div style={{fontSize:13}}>{wfStep?.step_name || item.action_required}</div></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>PRIORITY</div><div style={{fontSize:13,textTransform:"capitalize"}}>{item.priority}</div></div>
        </div>

        {loading && <div style={{textAlign:"center",color:"#64748b",padding:16}}>Loading workflow step...</div>}

        {!loading && allSteps.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:"#374151"}}>Approval Timeline</div>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {allSteps.map((s, i) => {
                const stColors = {
                  approved: {bg:"#f0fdf4",color:"#166534",icon:"\u2713"},
                  rejected: {bg:"#fff1f2",color:"#881337",icon:"\u2715"},
                  pending:  {bg:"#fefce8",color:"#854d0e",icon:"\u25CF"},
                  skipped:  {bg:"#f8fafc",color:"#94a3b8",icon:"\u2013"},
                };
                const sc = stColors[s.status] || stColors.pending;
                return (
                  <div key={s.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 10px",background:i===allSteps.length-1?"transparent":"#fafafa",borderRadius:6}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:sc.bg,color:sc.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>
                      {sc.icon}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#0f172a"}}>
                        {s.step_name}
                        <span style={{marginLeft:8,fontSize:10,fontWeight:700,padding:"1px 8px",borderRadius:8,background:sc.bg,color:sc.color,textTransform:"capitalize"}}>{s.status}</span>
                      </div>
                      {s.assigned_role && <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Assigned to: {s.assigned_role.replace(/_/g," ")}</div>}
                      {s.actioned_at && <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{new Date(s.actioned_at).toLocaleString()}</div>}
                      {s.note && <div style={{fontSize:11,color:"#475569",marginTop:2,fontStyle:"italic"}}>"{s.note}"</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && wfStep && (
          <div style={{marginBottom:16}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8,color:"#0369a1"}}>
              Current Step: {wfStep.step_name}
            </div>
            {wfStep.can_reject !== false && (
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>
                  Notes {wfStep.reject_label ? `(required for ${wfStep.reject_label})` : "(optional)"}
                </label>
                <textarea className="form-input" rows={3} value={note}
                  onChange={e=>setNote(e.target.value)}
                  placeholder="Add a note..." style={{width:"100%",resize:"vertical"}} />
              </div>
            )}
            {error && <div style={{color:"#dc2626",fontSize:13,marginBottom:8}}>{error}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              {wfStep.can_reject !== false && (
                <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting}
                  onClick={() => act("reject")}>
                  {wfStep.reject_label || "Reject"}
                </button>
              )}
              <button className="btn btn-primary btn-sm" disabled={acting}
                onClick={() => act(wfStep.step_type)}>
                {wfStep.action_label || wfStep.step_name || "Approve"}
              </button>
            </div>
          </div>
        )}

        {!loading && !wfStep && item.status === "pending" && (
          <div style={{textAlign:"center",color:"#64748b",padding:16,fontSize:13}}>
            No pending action for your role on this request.
            <br/>
            <a href={item.link} style={{color:"#2563eb",marginTop:8,display:"inline-block"}}>Open full request →</a>
          </div>
        )}

        {item.status !== "pending" && (
          <div style={{textAlign:"center",color:"#64748b",padding:8,fontSize:13}}>
            This request is <strong>{item.status}</strong>.
          </div>
        )}

        <div style={{display:"flex",justifyContent:"flex-end",marginTop:16,borderTop:"1px solid #e2e8f0",paddingTop:12}}>
          <a href={item.link} style={{fontSize:13,color:"#2563eb"}}>Open full page →</a>
        </div>
      </div>
    </div>
  );
}
