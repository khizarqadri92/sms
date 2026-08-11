import { useState, useEffect } from "react";
import resignationApi from "../api/resignationApi";
import DatePicker from "../components/DatePicker";
import hrApi from "../api/hrApi";
import { useAuth } from "../auth/AuthContext";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const STATUS_LABELS = {
  submitted: "Submitted", manager_approved: "Manager Approved", accepted: "Accepted",
  cleared: "Clearance Complete", settlement_reviewed: "Settlement Reviewed",
  settled: "Settlement Finalized", completed: "Completed", rejected: "Rejected", withdrawn: "Withdrawn",
};
const STATUS_COLORS = {
  submitted: { bg: "#eff6ff", color: "#1d4ed8" },
  manager_approved: { bg: "#eff6ff", color: "#1d4ed8" },
  accepted: { bg: "#f0fdf4", color: "#166534" },
  cleared: { bg: "#f0fdf4", color: "#166534" },
  settlement_reviewed: { bg: "#fefce8", color: "#854d0e" },
  settled: { bg: "#fefce8", color: "#854d0e" },
  completed: { bg: "#ecfdf5", color: "#047857" },
  rejected: { bg: "#fff1f2", color: "#881337" },
  withdrawn: { bg: "#f8fafc", color: "#64748b" },
};


export default function Resignations() {
  const { can } = useAuth();
  const { formatDate, formatCurrency, formatDateTime, loading: settingsLoading } = useRegionalSettings();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [deptLabels, setDeptLabels] = useState({});

  useEffect(() => {
    hrApi.getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
  }, []);
  const [note, setNote] = useState("");
  const [finalDateChoice, setFinalDateChoice] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [acting, setActing] = useState(false);
  const [settlementForm, setSettlementForm] = useState(null);
  const [taxableFlags, setTaxableFlags] = useState({ pending_salary: false, leave_encashment: false, pf_balance: false, adjustments: [] });
  const [flash, setFlash] = useState(null);
  const [clearanceError, setClearanceError] = useState(null);

  const showFlash = (type, text) => { setFlash({ type, text }); setTimeout(() => setFlash(null), 4000); };

  const load = () => {
    setLoading(true);
    resignationApi.getList().then(r => setList(r.data.data || [])).catch(() => setList([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const [expLetter, setExpLetter] = useState(null);
  const [expLetterReviewComments, setExpLetterReviewComments] = useState("");
  const loadExpLetter = (id) => {
    resignationApi.getExperienceLetter(id).then(r => setExpLetter(r.data.data)).catch(() => setExpLetter(null));
  };
  const advanceExpLetter = async (approved) => {
    if (!approved && !expLetterReviewComments.trim()) { showFlash("error", "Please add a comment explaining the requested changes."); return; }
    setActing(true);
    try {
      await resignationApi.advanceExperienceLetter(viewing.id, { action: approved ? "approve" : "reject", note: expLetterReviewComments || null });
      showFlash("success", approved ? "Experience letter approved." : "Changes requested - the employee has been notified.");
      setExpLetterReviewComments("");
      loadExpLetter(viewing.id);
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const openDetail = (id) => {
    resignationApi.getOne(id).then(r => {
      setViewing(r.data.data);
      loadExpLetter(id);
      setSettlementForm(r.data.data.settlement || { pending_salary_amount: 0, leave_encashment_days: 0, leave_encashment_amount: 0, other_dues: 0, other_deductions: 0, adjustments_note: "", adjustments: [] });
      const existingFlags = r.data.data.settlement?.taxable_flags;
      setTaxableFlags(existingFlags && Object.keys(existingFlags).length
        ? { pending_salary: false, leave_encashment: false, pf_balance: false, adjustments: [], ...existingFlags }
        : { pending_salary: false, leave_encashment: false, pf_balance: false, adjustments: [] });
      setNote("");
    }).catch(() => showFlash("error", "Failed to load."));
  };

  const refreshDetail = () => { if (viewing) openDetail(viewing.id); load(); };

  const doAdvance = async (action) => {
    setActing(true);
    try {
      const payload = { action, note };
      if (action === "approve" && viewing.status === "manager_approved") {
        if (finalDateChoice) payload.final_last_working_day = finalDateChoice;
        if (chequeDate) payload.cheque_collection_date = chequeDate;
      }
      await resignationApi.advance(viewing.id, payload);
      showFlash("success", "Action recorded.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const toggleDept = (id) => {
    setDeptLabels(prev => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = "No outstanding dues";
      return next;
    });
  };

  const initClearance = async () => {
    setClearanceError(null);
    const items = Object.entries(deptLabels).map(([deptId, label]) => ({ department_id: Number(deptId), item_label: label }));
    if (items.length === 0) { setClearanceError("Select at least one department."); return; }
    if (items.some(i => !i.item_label.trim())) { setClearanceError("Enter clearance text for every selected department."); return; }
    setActing(true);
    try {
      await resignationApi.initClearance(viewing.id, items);
      showFlash("success", "Clearance checklist created and sent to department heads.");
      setDeptLabels({});
      refreshDetail();
    } catch (e) {
      setClearanceError(e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const clearItem = async (itemId) => {
    try {
      await resignationApi.clearItem(itemId, { remarks: "" });
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    }
  };

  const skipClearance = async () => {
    if (!window.confirm("Skip clearance entirely? No department sign-off will be required for this resignation.")) return;
    setActing(true);
    try {
      await resignationApi.skipClearance(viewing.id);
      showFlash("success", "Clearance skipped.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const completeClearance = async () => {
    setActing(true);
    try {
      await resignationApi.completeClearance(viewing.id);
      showFlash("success", "Clearance marked complete.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const calcSettlement = async () => {
    setActing(true);
    try {
      await resignationApi.calculateSettlement(viewing.id);
      showFlash("success", "Settlement auto-calculated.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const addAdjustmentRow = () => {
    setSettlementForm(f => ({ ...f, adjustments: [...(f.adjustments || []), { name: "", item_type: "earning", calc_type: "fixed", value: 0 }] }));
  };
  const updateAdjustmentRow = (idx, field, value) => {
    setSettlementForm(f => {
      const next = [...(f.adjustments || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...f, adjustments: next };
    });
  };
  const removeAdjustmentRow = (idx) => {
    setSettlementForm(f => ({ ...f, adjustments: (f.adjustments || []).filter((_, i) => i !== idx) }));
  };

  const submitReview = async () => {
    setActing(true);
    try {
      await resignationApi.reviewSettlement(viewing.id, settlementForm);
      showFlash("success", "Settlement reviewed.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const financeCalculateSettlement = async () => {
    setActing(true);
    try {
      await resignationApi.financeCalculateSettlement(viewing.id);
      // No flash message here - the popup itself refreshes to show the
      // calculated breakdown, which is already clear confirmation. A flash
      // banner on the parent page would render behind this open modal and
      // likely go unseen.
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const calculateTax = async () => {
    setActing(true);
    try {
      await resignationApi.calculateSettlementTax(viewing.id, taxableFlags);
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const finalizeSettlement = async () => {
    setActing(true);
    try {
      await resignationApi.finalizeSettlement(viewing.id);
      showFlash("success", "Settlement finalized.");
      refreshDetail();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const completeExit = async () => {
    if (!window.confirm("Finalize this employee's exit? Their status will be set to Resigned.")) return;
    setActing(true);
    try {
      await resignationApi.completeResignation(viewing.id);
      showFlash("success", "Exit finalized.");
      setViewing(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setActing(false); }
  };

  const allCleared = viewing?.clearance_items?.length > 0 && viewing.clearance_items.every(i => i.is_cleared);

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Employee Resignations</div>
        <div style={{fontSize:13,color:"#64748b"}}>Manage resignation requests through approval, clearance, and settlement</div>
      </div>

      {flash && (
        <div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13,
          background:flash.type==="success"?"#f0fdf4":"#fef2f2",color:flash.type==="success"?"#166534":"#991b1b"}}>
          {flash.text}
        </div>
      )}

      {(loading || settingsLoading) && <div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}

      {!loading && !settingsLoading && (
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Employee", "Code", "Department", "Submitted", "Last Working Day", "Status", ""].map(h=>(
                  <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r=>(
                <tr key={r.id} style={{borderBottom:"1px solid #f8fafc"}}>
                  <td style={{padding:"10px 14px",fontWeight:600}}>{r.first_name} {r.last_name}</td>
                  <td style={{padding:"10px 14px",color:"#64748b"}}>{r.employee_code||"-"}</td>
                  <td style={{padding:"10px 14px"}}>{r.department_name||"-"}</td>
                  <td style={{padding:"10px 14px"}}>{formatDate(r.resignation_date)}</td>
                  <td style={{padding:"10px 14px"}}>{formatDate(r.final_last_working_day||r.system_calculated_last_working_day)||"-"}</td>
                  <td style={{padding:"10px 14px"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                      background:(STATUS_COLORS[r.status]||{}).bg,color:(STATUS_COLORS[r.status]||{}).color}}>
                      {STATUS_LABELS[r.status]||r.status}
                    </span>
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>openDetail(r.id)}>View</button>
                  </td>
                </tr>
              ))}
              {list.length===0 && (
                <tr><td colSpan={7} style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No resignation requests.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}
          onClick={()=>setViewing(null)}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:640,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{viewing.first_name} {viewing.last_name}</div>
                <div style={{fontSize:12,color:"#64748b"}}>{viewing.department_name} &middot; {viewing.designation_name}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setViewing(null)}>Close</button>
            </div>
            <div style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
                <span style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:12,
                  background:(STATUS_COLORS[viewing.status]||{}).bg,color:(STATUS_COLORS[viewing.status]||{}).color}}>
                  {STATUS_LABELS[viewing.status]||viewing.status}
                </span>
                <div style={{fontSize:12,color:"#64748b"}}>
                  Last Working Day: {formatDate(viewing.final_last_working_day||viewing.system_calculated_last_working_day)||"-"}
                  {viewing.cheque_collection_date && <><br/>Cheque Collection Date: {formatDate(viewing.cheque_collection_date)}</>}
                </div>
              </div>
              {viewing.reason && (
                <div style={{marginBottom:16,padding:12,background:"#f8fafc",borderRadius:8,fontSize:13}}>
                  <strong>Reason: </strong>{viewing.reason}
                </div>
              )}
              {viewing.requested_last_working_day && (
                <div style={{marginBottom:16,padding:12,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,fontSize:13}}>
                  <strong>Employee requested a different date: </strong>{formatDate(viewing.requested_last_working_day)}
                </div>
              )}
              {viewing.date_change_reason && (
                <div style={{marginBottom:16,padding:12,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,fontSize:13}}>
                  <strong>Suggested a different last working day: </strong>{viewing.date_change_reason}
                </div>
              )}

              {["submitted","manager_approved"].includes(viewing.status) && (
                <div style={{marginBottom:20,padding:16,border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Approval</div>
                  {viewing.status === "manager_approved" && (
                    <div style={{marginBottom:14,padding:12,background:"#f8fafc",borderRadius:8}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>Choose the final last working day</div>
                      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:6,cursor:"pointer"}}>
                        <input type="radio" name="finalDate" checked={finalDateChoice===viewing.system_calculated_last_working_day || !finalDateChoice}
                          onChange={()=>setFinalDateChoice(viewing.system_calculated_last_working_day)} />
                        System Calculated: {formatDate(viewing.system_calculated_last_working_day)}
                      </label>
                      {viewing.requested_last_working_day && (
                        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
                          <input type="radio" name="finalDate" checked={finalDateChoice===viewing.requested_last_working_day}
                            onChange={()=>setFinalDateChoice(viewing.requested_last_working_day)} />
                          Employee Requested: {formatDate(viewing.requested_last_working_day)}
                        </label>
                      )}
                      <div style={{marginTop:10}}>
                        <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Cheque Collection Date</label>
                        <DatePicker value={chequeDate} onChange={setChequeDate} style={{width:200}} />
                      </div>
                    </div>
                  )}
                  <textarea className="form-input" rows={2} style={{width:"100%",marginBottom:10}} placeholder="Note (required for reject)"
                    value={note} onChange={e=>setNote(e.target.value)} />
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={()=>doAdvance("approve")}>{viewing.status==="manager_approved"?"Accept":"Approve"}</button>
                    <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting} onClick={()=>doAdvance("reject")}>Reject</button>
                  </div>
                </div>
              )}

              {viewing.status === "accepted" && can("hr.edit") && (
                <div style={{marginBottom:20,padding:16,border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Clearance Checklist</div>
                  {(!viewing.clearance_items || viewing.clearance_items.length===0) ? (
                    <div>
                      <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Select departments and specify what needs to be cleared:</div>
                      {departments.map(d=>(
                        <div key={d.id} style={{marginBottom:8}}>
                          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:4}}>
                            <input type="checkbox" checked={d.id in deptLabels} onChange={()=>toggleDept(d.id)} />
                            {d.name}
                          </label>
                          {d.id in deptLabels && (
                            <input className="form-input" style={{width:"100%",fontSize:13,marginLeft:24,marginTop:2}}
                              placeholder="What needs to be cleared for this department?"
                              value={deptLabels[d.id]}
                              onChange={e=>setDeptLabels(prev=>({...prev,[d.id]:e.target.value}))} />
                          )}
                        </div>
                      ))}
                      {clearanceError && (
                        <div style={{padding:"8px 12px",borderRadius:6,marginTop:10,fontSize:12,background:"#fef2f2",color:"#991b1b",fontWeight:600}}>
                          {clearanceError}
                        </div>
                      )}
                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={initClearance}>
                          Initialize Clearance
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={acting} onClick={skipClearance}>
                          Skip Clearance (No Sign-Off Required)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {viewing.clearance_items.map(item=>(
                        <div key={item.id} style={{padding:"8px 0",borderBottom:"1px solid #f8fafc"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:14,color:item.is_cleared?"#166534":"#94a3b8"}}>{item.is_cleared?"\u2713":"\u25cb"}</span>
                            <div style={{flex:1,fontSize:13}}>
                              <strong>{item.department_name}</strong> - {item.item_label}
                              <div style={{fontSize:11,color:"#94a3b8"}}>
                                Assigned to: {item.assigned_first_name} {item.assigned_last_name}
                                {item.is_cleared && item.cleared_at && <> &middot; Cleared on {formatDate(item.cleared_at)}</>}
                              </div>
                              {item.remarks && (
                                <div style={{fontSize:11,color:"#374151",marginTop:2,fontStyle:"italic"}}>"{item.remarks}"</div>
                              )}
                            </div>
                            <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                              background:item.is_cleared?"#f0fdf4":"#fefce8",color:item.is_cleared?"#166534":"#854d0e"}}>
                              {item.is_cleared?"Cleared":"Pending"}
                            </span>
                            {!item.is_cleared && (
                              <button className="btn btn-ghost btn-sm" style={{fontSize:11}} disabled={acting}
                                onClick={() => clearItem(item.id)}>
                                Mark Cleared
                              </button>
                            )}
                          </div>
                          {item.messages && item.messages.length > 0 && (
                            <div style={{marginLeft:24,marginTop:6,display:"flex",flexDirection:"column",gap:6}}>
                              {item.messages.map((m,i)=>(
                                <div key={i} style={{padding:"6px 10px",background:"#fff7ed",borderRadius:6,border:"1px solid #fed7aa"}}>
                                  <div style={{fontSize:12,color:"#374151"}}>{m.message}</div>
                                  <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>
                                    {m.first_name} {m.last_name} &middot; {formatDateTime(m.sent_at)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{marginTop:12}}>
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting || !allCleared} onClick={completeClearance}>
                          Mark Clearance Complete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {expLetter && (
                <div style={{marginBottom:20,padding:16,border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:14}}>Experience Letter Details</div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:12,
                      background:expLetter.status==="approved"?"#f0fdf4":expLetter.status.startsWith("rejected")?"#fff1f2":"#fefce8",
                      color:expLetter.status==="approved"?"#166534":expLetter.status.startsWith("rejected")?"#881337":"#854d0e"}}>
                      {({pending_hod:"Pending Department Head Review",pending_hr:"Pending HR Final Approval",approved:"Approved",
                         rejected_by_hod:"Changes Requested by Department Head",rejected_by_hr:"Changes Requested by HR"})[expLetter.status] || expLetter.status}
                    </span>
                  </div>

                  <div style={{fontSize:13,color:"#374151",whiteSpace:"pre-wrap",padding:"10px 12px",background:"#f8fafc",borderRadius:8,marginBottom:12}}>
                    {expLetter.notes}
                  </div>

                  {expLetter.status.startsWith("rejected") && (
                    <div style={{padding:"10px 12px",borderRadius:6,marginBottom:12,fontSize:13,background:"#fff7ed",border:"1px solid #fed7aa",color:"#92400e"}}>
                      <strong>Changes requested:</strong> {expLetter.status==="rejected_by_hod" ? expLetter.hod_comments : expLetter.hr_comments}
                    </div>
                  )}

                  {(expLetter.status === "pending_hod" || expLetter.status === "pending_hr") && (
                    <>
                      <textarea className="form-input" rows={2} style={{width:"100%",marginBottom:8}}
                        placeholder="Comments (required if requesting changes)"
                        value={expLetterReviewComments} onChange={e=>setExpLetterReviewComments(e.target.value)} />
                      <div style={{display:"flex",gap:10}}>
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting}
                          onClick={() => advanceExpLetter(true)}>
                          {expLetter.status==="pending_hod" ? "Approve" : "Approve (Final)"}
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} disabled={acting}
                          onClick={() => advanceExpLetter(false)}>
                          Request Changes
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewing.status === "cleared" && can("hr.edit") && (
                <div style={{marginBottom:20,padding:16,border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Settlement</div>
                  {!viewing.settlement ? (
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={calcSettlement}>
                      Auto-Calculate Settlement
                    </button>
                  ) : (
                    <>
                      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11}} disabled={acting}
                          onClick={() => { if (window.confirm("Recalculate attendance-derived figures (present/absent/leave days, pending salary)? Manually entered dues, deductions, and adjustments will be kept.")) calcSettlement(); }}>
                          Recalculate from Attendance
                        </button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14,padding:10,background:"#f8fafc",borderRadius:8}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:700,color:"#166534"}}>{viewing.settlement.present_days}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>Present Days</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:700,color:"#dc2626"}}>{viewing.settlement.absent_days}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>Absent Days</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:700,color:"#0369a1"}}>{viewing.settlement.leave_days_taken}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>Leaves Taken</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:700,color:"#c2410c"}}>{viewing.settlement.excess_leave_days}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>Excess Leave (treated as absent)</div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div>
                          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:3}}>Leave Encashment Days</label>
                          <input type="number" className="form-input" style={{width:"100%",fontSize:13}}
                            value={settlementForm.leave_encashment_days} onChange={e=>setSettlementForm(f=>({...f,leave_encashment_days:e.target.value}))} />
                        </div>
                        <div>
                          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:3}}>Additional Dues / Adjustments (e.g. bonus, reimbursements)</label>
                          <input type="number" className="form-input" style={{width:"100%",fontSize:13}}
                            value={settlementForm.other_dues} onChange={e=>setSettlementForm(f=>({...f,other_dues:e.target.value}))} />
                        </div>
                        <div>
                          <label style={{fontSize:11,fontWeight:600,display:"block",marginBottom:3}}>Deductions (e.g. unreturned assets, damages)</label>
                          <input type="number" className="form-input" style={{width:"100%",fontSize:13}}
                            value={settlementForm.other_deductions} onChange={e=>setSettlementForm(f=>({...f,other_deductions:e.target.value}))} />
                        </div>
                      </div>
                      <textarea className="form-input" rows={2} style={{width:"100%",marginBottom:10}} placeholder="Adjustment notes"
                        value={settlementForm.adjustments_note||""} onChange={e=>setSettlementForm(f=>({...f,adjustments_note:e.target.value}))} />

                      <div style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <label style={{fontSize:12,fontWeight:700}}>Adjustments</label>
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={addAdjustmentRow}>+ Add Adjustment</button>
                        </div>
                        {(settlementForm.adjustments || []).map((adj, idx) => (
                          <div key={idx} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:10,marginBottom:8}}>
                            <input placeholder="Description" className="form-input" style={{fontSize:12,width:"100%",marginBottom:8}}
                              value={adj.name} onChange={e=>updateAdjustmentRow(idx,"name",e.target.value)} />
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                              <select className="form-input" style={{fontSize:12,width:"100%"}}
                                value={adj.item_type} onChange={e=>updateAdjustmentRow(idx,"item_type",e.target.value)}>
                                <option value="earning">Earning</option>
                                <option value="deduction">Deduction</option>
                              </select>
                              <select className="form-input" style={{fontSize:12,width:"100%"}}
                                value={adj.calc_type} onChange={e=>updateAdjustmentRow(idx,"calc_type",e.target.value)}>
                                <option value="fixed">Fixed Amount</option>
                                <option value="pct_basic">%age of Basic Salary</option>
                                <option value="pct_pending">%age of Pending Settlement Salary</option>
                              </select>
                            </div>
                            <div style={{display:"flex",gap:8,alignItems:"center"}}>
                              <input type="number" placeholder={adj.calc_type==="fixed"?"Amount":"%"} className="form-input" style={{fontSize:12,flex:1}}
                                value={adj.value} onChange={e=>updateAdjustmentRow(idx,"value",e.target.value)} />
                              <button className="btn btn-ghost btn-sm" style={{color:"#dc2626",fontSize:11,whiteSpace:"nowrap"}} onClick={()=>removeAdjustmentRow(idx)}>Remove</button>
                            </div>
                          </div>
                        ))}
                        {(settlementForm.adjustments || []).length === 0 && (
                          <div style={{fontSize:12,color:"#94a3b8"}}>No additional adjustments.</div>
                        )}
                      </div>

                      <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={submitReview}>
                        Submit Settlement Review
                      </button>
                    </>
                  )}
                </div>
              )}

              {viewing.status === "settlement_reviewed" && viewing.settlement && (
                <div style={{marginBottom:20,padding:16,border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Finalize Settlement</div>
                  {!can("payroll.manage") ? (
                    <div style={{padding:16,textAlign:"center",color:"#64748b",fontSize:13,background:"#f8fafc",borderRadius:8}}>
                      This settlement is now with Finance for calculation and finalization.
                    </div>
                  ) : !viewing.settlement.finance_calculated_at ? (
                    <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={financeCalculateSettlement}>
                      Calculate
                    </button>
                  ) : (
                    <>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:14}}>
                        <thead>
                          <tr style={{borderBottom:"1px solid #e2e8f0"}}>
                            <th style={{padding:"4px 0",textAlign:"left",fontSize:11,color:"#94a3b8",fontWeight:600}}>Component</th>
                            <th style={{padding:"4px 0",textAlign:"right",fontSize:11,color:"#94a3b8",fontWeight:600}}>Amount</th>
                            <th style={{padding:"4px 0 4px 12px",textAlign:"center",fontSize:11,color:"#94a3b8",fontWeight:600}}>Taxable</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                            <td style={{padding:"6px 0",color:"#64748b"}}>Salary ({viewing.settlement.total_calendar_days} day(s))</td>
                            <td style={{padding:"6px 0",textAlign:"right",fontWeight:600}}>{formatCurrency(viewing.settlement.gross_salary_amount)}</td>
                            <td></td>
                          </tr>
                          {Number(viewing.settlement.absence_deduction_amount) > 0 && (
                            <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"6px 0",color:"#64748b"}}>Absent ({viewing.settlement.absent_days} day(s)) Deduction</td>
                              <td style={{padding:"6px 0",textAlign:"right",fontWeight:600,color:"#dc2626"}}>-{formatCurrency(viewing.settlement.absence_deduction_amount)}</td>
                              <td></td>
                            </tr>
                          )}
                          <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                            <td style={{padding:"6px 0",color:"#64748b",fontWeight:600}}>Net Pending Salary</td>
                            <td style={{padding:"6px 0",textAlign:"right",fontWeight:700}}>{formatCurrency(viewing.settlement.pending_salary_amount)}</td>
                            <td style={{padding:"6px 0 6px 12px",textAlign:"center"}}>
                              <input type="checkbox" checked={taxableFlags.pending_salary} onChange={e=>setTaxableFlags(f=>({...f,pending_salary:e.target.checked}))} />
                            </td>
                          </tr>
                          <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                            <td style={{padding:"6px 0",color:"#64748b"}}>Leave Encashment ({viewing.settlement.leave_encashment_days} day(s))</td>
                            <td style={{padding:"6px 0",textAlign:"right",fontWeight:600}}>{formatCurrency(viewing.settlement.leave_encashment_amount)}</td>
                            <td style={{padding:"6px 0 6px 12px",textAlign:"center"}}>
                              <input type="checkbox" checked={taxableFlags.leave_encashment} onChange={e=>setTaxableFlags(f=>({...f,leave_encashment:e.target.checked}))} />
                            </td>
                          </tr>
                          <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                            <td style={{padding:"6px 0",color:"#64748b"}}>Provident Fund Balance</td>
                            <td style={{padding:"6px 0",textAlign:"right",fontWeight:600}}>{formatCurrency(viewing.settlement.pf_balance_amount)}</td>
                            <td style={{padding:"6px 0 6px 12px",textAlign:"center"}}>
                              <input type="checkbox" checked={taxableFlags.pf_balance} onChange={e=>setTaxableFlags(f=>({...f,pf_balance:e.target.checked}))} />
                            </td>
                          </tr>
                          {Number(viewing.settlement.other_dues) > 0 && (
                            <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"6px 0",color:"#64748b"}}>Additional Dues</td>
                              <td style={{padding:"6px 0",textAlign:"right",fontWeight:600}}>{formatCurrency(viewing.settlement.other_dues)}</td>
                              <td></td>
                            </tr>
                          )}
                          {Number(viewing.settlement.other_deductions) > 0 && (
                            <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"6px 0",color:"#64748b"}}>Deductions</td>
                              <td style={{padding:"6px 0",textAlign:"right",fontWeight:600,color:"#dc2626"}}>-{formatCurrency(viewing.settlement.other_deductions)}</td>
                              <td></td>
                            </tr>
                          )}
                          {(viewing.settlement.adjustments || []).map((adj, idx) => (
                            <tr key={idx} style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"6px 0",color:"#64748b"}}>{adj.name} ({adj.item_type})</td>
                              <td style={{padding:"6px 0",textAlign:"right",fontWeight:600,color:adj.item_type==="deduction"?"#dc2626":"inherit"}}>
                                {adj.item_type==="deduction"?"-":""}{formatCurrency(adj.resolved_amount)}
                              </td>
                              <td style={{padding:"6px 0 6px 12px",textAlign:"center"}}>
                                <input type="checkbox" checked={!!taxableFlags.adjustments[idx]}
                                  onChange={e=>setTaxableFlags(f=>{ const next=[...(f.adjustments||[])]; next[idx]=e.target.checked; return {...f,adjustments:next}; })} />
                              </td>
                            </tr>
                          ))}
                          {Number(viewing.settlement.income_tax_amount) > 0 && (
                            <tr style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"6px 0",color:"#64748b"}}>Income Tax</td>
                              <td style={{padding:"6px 0",textAlign:"right",fontWeight:600,color:"#dc2626"}}>-{formatCurrency(viewing.settlement.income_tax_amount)}</td>
                              <td></td>
                            </tr>
                          )}
                          <tr>
                            <td style={{padding:"10px 0 0",fontWeight:700}}>Final Amount</td>
                            <td style={{padding:"10px 0 0",textAlign:"right",fontWeight:700,fontSize:15}}>{formatCurrency(viewing.settlement.final_amount)}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                      <div style={{display:"flex",gap:10}}>
                        <button className="btn btn-ghost btn-sm" disabled={acting} onClick={calculateTax}>
                          Calculate Tax
                        </button>
                        <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={finalizeSettlement}>
                          Finalize Settlement
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewing.status === "settled" && (
                <div style={{marginBottom:20,padding:16,border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Finalize Exit</div>
                  <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={acting} onClick={completeExit}>
                    Finalize Employee Exit
                  </button>
                </div>
              )}

              {["completed","rejected","withdrawn"].includes(viewing.status) && (
                <div style={{padding:16,textAlign:"center",color:"#64748b",fontSize:13}}>
                  This resignation is <strong>{STATUS_LABELS[viewing.status]}</strong>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
