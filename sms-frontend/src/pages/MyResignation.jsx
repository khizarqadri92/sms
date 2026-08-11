import { useState, useEffect } from "react";
import resignationApi from "../api/resignationApi";
import hrApi from "../api/hrApi";
import DatePicker from "../components/DatePicker";
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

export default function MyResignation() {
  const { formatDate, formatCurrency, formatDateTime, loading: settingsLoading } = useRegionalSettings();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [defaultLastDay, setDefaultLastDay] = useState("");
  const [dateChangeReason, setDateChangeReason] = useState("");
  const [suggestedDate, setSuggestedDate] = useState("");
  const [expLetterNotes, setExpLetterNotes] = useState("");
  const [expLetterSaving, setExpLetterSaving] = useState(false);
  const [expLetterMsg, setExpLetterMsg] = useState(null);
  const [expLetter, setExpLetter] = useState(null);
  const loadExperienceLetter = (resignationId) => {
    resignationApi.getExperienceLetter(resignationId).then(r => setExpLetter(r.data.data)).catch(() => setExpLetter(null));
  };
  const saveExperienceLetter = async () => {
    setExpLetterMsg(null);
    setExpLetterSaving(true);
    try {
      await resignationApi.submitExperienceLetter(active.id, expLetterNotes);
      setExpLetterMsg({ type: "success", text: "Experience letter details submitted for review." });
      loadExperienceLetter(active.id);
    } catch (e) {
      setExpLetterMsg({ type: "error", text: e.response?.data?.message || "Failed to save." });
    } finally {
      setExpLetterSaving(false);
    }
  };
  const EXP_LETTER_STATUS_LABELS = {
    pending_hod: "Pending Department Head Review", pending_hr: "Pending HR Final Approval",
    approved: "Approved", rejected_by_hod: "Changes Requested by Department Head", rejected_by_hr: "Changes Requested by HR",
  };
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    resignationApi.getNoticePeriodDays().then(r => {
      const iso = r.data.data?.preview_last_working_day;
      if (iso) {
        setDefaultLastDay(iso);
        setLastDay(iso);
      }
    }).catch(() => {});
  }, []);
  const [msg, setMsg] = useState(null);
  const [viewing, setViewing] = useState(null);
  const openDetail = (id) => {
    resignationApi.getOne(id).then(r => setViewing(r.data.data)).catch(() => {});
  };

  const load = () => {
    setLoading(true);
    resignationApi.getMy().then(r => setList(r.data.data || [])).catch(() => setList([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const active = list.find(r => !["rejected", "withdrawn", "completed"].includes(r.status));

  useEffect(() => {
    if (active) loadExperienceLetter(active.id);
  }, [active?.id]);
  useEffect(() => {
    if (expLetter) setExpLetterNotes(expLetter.notes || "");
  }, [expLetter?.id]);

  const submit = async () => {
    if (suggestedDate && !dateChangeReason.trim()) {
      setMsg({ type: "error", text: "Please provide a reason for requesting a different last working day." });
      return;
    }
    setMsg(null);
    setSubmitting(true);
    try {
      await resignationApi.submit({
        reason, requested_last_working_day: suggestedDate || null,
        date_change_reason: suggestedDate ? dateChangeReason : null,
      });
      setMsg({ type: "success", text: "Resignation submitted." });
      setReason(""); setSuggestedDate(""); setDateChangeReason("");
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || "Failed to submit." });
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this resignation request?")) return;
    try {
      await resignationApi.withdraw(id);
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || "Failed to withdraw." });
    }
  };

  return (
    <div style={{padding:24,background:"#f1f5f9",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>My Resignation</div>
        <div style={{fontSize:13,color:"#64748b"}}>Submit and track your resignation request</div>
      </div>

      {(loading || settingsLoading) && <div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}>Loading...</div>}

      {msg && (
        <div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13,
          background:msg.type==="success"?"#f0fdf4":"#fef2f2",color:msg.type==="success"?"#166534":"#991b1b"}}>
          {msg.text}
        </div>
      )}

      {!loading && !settingsLoading && active && (
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:20,marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div style={{cursor:"pointer"}} onClick={()=>openDetail(active.id)}>
              <div style={{fontWeight:700,fontSize:15,color:"#2563eb"}}>Active Resignation Request</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Submitted {formatDate(active.resignation_date)} &middot; Click for details</div>
            </div>
            <span style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:12,
              background:(STATUS_COLORS[active.status]||{}).bg,color:(STATUS_COLORS[active.status]||{}).color}}>
              {STATUS_LABELS[active.status] || active.status}
            </span>
          </div>
          <div style={{fontSize:13,color:"#374151",marginBottom:4}}>
            Last Working Day: <strong>{formatDate(active.final_last_working_day || active.system_calculated_last_working_day)}</strong>
          </div>
          {active.requested_last_working_day && (
            <div style={{fontSize:12,color:"#c2410c",marginBottom:12}}>
              You requested: {formatDate(active.requested_last_working_day)} (pending review)
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{color:"#dc2626"}} onClick={()=>withdraw(active.id)}>
            Withdraw Resignation
          </button>

          {!["submitted","manager_approved","rejected","withdrawn"].includes(active.status) && (
            <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #f1f5f9"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:14}}>Experience Letter Details</div>
                {expLetter && (
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:12,
                    background:expLetter.status==="approved"?"#f0fdf4":expLetter.status.startsWith("rejected")?"#fff1f2":"#fefce8",
                    color:expLetter.status==="approved"?"#166534":expLetter.status.startsWith("rejected")?"#881337":"#854d0e"}}>
                    {EXP_LETTER_STATUS_LABELS[expLetter.status] || expLetter.status}
                  </span>
                )}
              </div>

              {expLetter && expLetter.status.startsWith("rejected") && (
                <div style={{padding:"10px 12px",borderRadius:6,marginBottom:10,fontSize:13,background:"#fff7ed",border:"1px solid #fed7aa",color:"#92400e"}}>
                  <strong>Changes requested:</strong> {expLetter.status==="rejected_by_hod" ? expLetter.hod_comments : expLetter.hr_comments}
                </div>
              )}

              {expLetter && ["pending_hod","pending_hr","approved"].includes(expLetter.status) ? (
                <div style={{fontSize:13,color:"#374151",whiteSpace:"pre-wrap",padding:"10px 12px",background:"#f8fafc",borderRadius:8}}>
                  {expLetter.notes}
                </div>
              ) : (
                <>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>
                    Share any details (projects, achievements, role summary) you'd like HR to consider for your experience letter.
                  </div>
                  {expLetterMsg && (
                    <div style={{padding:"8px 12px",borderRadius:6,marginBottom:8,fontSize:13,
                      background:expLetterMsg.type==="success"?"#f0fdf4":"#fef2f2",color:expLetterMsg.type==="success"?"#166534":"#991b1b"}}>
                      {expLetterMsg.text}
                    </div>
                  )}
                  <textarea className="form-input" rows={8} style={{width:"100%",resize:"vertical",marginBottom:8}}
                    value={expLetterNotes} onChange={e=>setExpLetterNotes(e.target.value)} placeholder="Enter details for your experience letter..." />
                  <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={expLetterSaving} onClick={saveExperienceLetter}>
                    {expLetterSaving?"Saving...":(expLetter ? "Resubmit" : "Submit for Review")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !settingsLoading && !active && (
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:20,marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>Submit Resignation</div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Reason</label>
            <textarea className="form-input" rows={3} style={{width:"100%",resize:"vertical"}}
              value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for resignation..." />
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Last Working Day (as per notice period policy)</label>
            <div className="form-input" style={{width:220,background:"#f1f5f9",color:"#64748b",display:"flex",alignItems:"center"}}>
              {formatDate(lastDay)}
            </div>
          </div>
          <div style={{marginBottom:14,padding:12,background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
            <label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:4}}>Request a different last working day (optional)</label>
            <DatePicker value={suggestedDate} onChange={setSuggestedDate} style={{width:220,marginBottom:8}} />
            {suggestedDate && (
              <textarea className="form-input" rows={2} style={{width:"100%",resize:"vertical"}}
                value={dateChangeReason} onChange={e=>setDateChangeReason(e.target.value)} placeholder="Explain why you're requesting this date instead of the standard notice period..." />
            )}
          </div>
          <button className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={submitting} onClick={submit}>
            {submitting ? "Submitting..." : "Submit Resignation"}
          </button>
        </div>
      )}

      {!loading && !settingsLoading && list.length > 0 && (
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",fontWeight:700,fontSize:14}}>History</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["Submitted", "Last Working Day", "Status"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r=>(
                <tr key={r.id} style={{borderBottom:"1px solid #f8fafc",cursor:"pointer"}} onClick={()=>openDetail(r.id)}>
                  <td style={{padding:"10px 14px",color:"#2563eb"}}>{formatDate(r.resignation_date)}</td>
                  <td style={{padding:"10px 14px"}}>{formatDate(r.final_last_working_day || r.system_calculated_last_working_day) || "-"}</td>
                  <td style={{padding:"10px 14px"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                      background:(STATUS_COLORS[r.status]||{}).bg,color:(STATUS_COLORS[r.status]||{}).color}}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}
          onClick={()=>setViewing(null)}>
          <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:16}}>Resignation Request</div>
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
              {viewing.requested_last_working_day && (
            <div style={{marginBottom:16,padding:12,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,fontSize:13}}>
              <strong>You requested a different date: </strong>{formatDate(viewing.requested_last_working_day)}
              {viewing.date_change_reason && <div style={{marginTop:4,color:"#64748b"}}>Reason: {viewing.date_change_reason}</div>}
            </div>
          )}
          {viewing.reason && (
                <div style={{marginBottom:16,padding:12,background:"#f8fafc",borderRadius:8,fontSize:13}}>
                  <strong>Reason: </strong>{viewing.reason}
                </div>
              )}
              {viewing.clearance_items && viewing.clearance_items.length > 0 && (
                <div style={{marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Clearance Checklist</div>
                  {viewing.clearance_items.map(item=>(
                    <div key={item.id} style={{padding:"8px 0",borderBottom:"1px solid #f8fafc",fontSize:13}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{color:item.is_cleared?"#166534":"#94a3b8",fontWeight:700}}>{item.is_cleared?"✓":"○"}</span>
                        <div><strong>{item.department_name}</strong> - {item.item_label}</div>
                        {item.remarks && (
                          <div style={{fontSize:11,color:"#374151",marginTop:2,fontStyle:"italic"}}>"{item.remarks}"</div>
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
                </div>
              )}
              {viewing.settlement && (
                <div>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Settlement</div>
                  <div style={{fontSize:13,color:"#374151"}}>
                    Final Amount: <strong>{formatCurrency(viewing.settlement.final_amount)}</strong>
                    {" "}({viewing.settlement.status})
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
