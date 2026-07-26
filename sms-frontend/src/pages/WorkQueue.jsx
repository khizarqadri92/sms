import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import WQActionModal from "../components/WQActionModal";
import WithdrawalDetailModal from "../components/WithdrawalDetailModal";
import DisciplineDetailModal from "../components/DisciplineDetailModal";
import workQueueApi from "../api/workQueueApi";
import { useAuth } from "../auth/AuthContext";

const MODULE_ICONS = {
  leaves: "📅", procurement: "📦", finance: "💰",
  withdrawal: "🚪", discipline: "⚠️", exams: "📝", default: "📋",
};

const ENTITY_TYPE_LABELS = {
  leave_application: "Leave Request",
  purchase_requisition: "Purchase Requisition",
  vendor_invoice: "Vendor Invoice",
  withdrawal_request: "Withdrawal Request",
  staff_leave: "Staff Leave Request",
  attendance_correction: "Attendance Correction",
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-PK", { day:"2-digit", month:"short", year:"numeric" });
}

const DEFAULT_COLOR = { bg_color:"#ffffff", border_color:"#e2e8f0", badge_color:"#64748b", text_color:"#374151", label:"Unknown" };

export default function WorkQueue() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [items, setItems]             = useState([]);
  const [modules, setModules]         = useState([]);
  const [colorMap, setColorMap]       = useState({});
  const [loading, setLoading]         = useState(true);
  const [flash, setFlash]             = useState(null);
  const [activeModule, setModule]     = useState("");
  const [activeStatus, setStatus]     = useState("pending");
  const [autoRefresh, setAutoRef]     = useState(true);
  const [showColorCfg, setColorCfg]   = useState(false);
  const [editColors, setEditColors]   = useState({});
  const [savingColor, setSavingColor] = useState(null);
  const [selectedItem, setSelected]   = useState(null);
  const [actionItem, setActionItem] = useState(null);
  const [withdrawalReqId, setWithdrawalReqId] = useState(null);
  const [disciplineCaseId, setDisciplineCaseId] = useState(null);
  const [withdrawalWqItem, setWithdrawalWqItem] = useState(null);

  const showFlash = (type, msg) => { setFlash({type,msg}); setTimeout(()=>setFlash(null),4000); };

  const loadColors = useCallback(() => {
    workQueueApi.getColorConfig()
      .then(r => {
        const map = {};
        (r.data.data || []).forEach(c => { map[c.status_key] = c; });
        setColorMap(map);
        setEditColors(map);
      }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    const params = { status: activeStatus || undefined };
    if (activeModule) params.module = activeModule;
    setLoading(true);
    Promise.all([
      workQueueApi.getMyQueue(params),
      workQueueApi.getModules(),
    ]).then(([q, m]) => {
      setItems(q.data.data || []);
      setModules(m.data.data || []);
    }).catch(() => showFlash("error", "Failed to load work queue."))
      .finally(() => setLoading(false));
  }, [activeModule, activeStatus]);

  useEffect(() => { load(); loadColors(); }, [load, loadColors]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, autoRefresh]);

  const saveColor = async (statusKey) => {
    setSavingColor(statusKey);
    try {
      await workQueueApi.updateColorConfig(statusKey, editColors[statusKey]);
      showFlash("success", `Color updated.`);
      loadColors();
    } catch { showFlash("error", "Failed to save color."); }
    finally { setSavingColor(null); }
  };

  const getColor = (item) => colorMap[item.entity_status] || colorMap[item.action_required] || DEFAULT_COLOR;

  const pending = items.filter(i => i.status === "pending").length;
  const urgent  = items.filter(i => i.priority === "urgent" && i.status === "pending").length;
  const overdue = items.filter(i => i.is_overdue).length;

  return (
    <div>
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h1 className="page-heading">Work Queue</h1>
          <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginTop:4 }}>All pending actions across the system</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {can("users.manage_roles") && (
            <button className="btn btn-ghost btn-sm" onClick={()=>setColorCfg(!showColorCfg)}>🎨 Color Config</button>
          )}
          <label style={{ fontSize:12, color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRef(e.target.checked)} />Auto-refresh
          </label>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {flash && <div className={`alert alert-${flash.type}`} style={{ marginBottom:16 }}>{flash.msg}</div>}

      {/* Color Config Panel */}
      {showColorCfg && can("users.manage_roles") && (
        <div className="section-card" style={{ marginBottom:20 }}>
          <div className="section-card-header"><span className="section-card-title">Status Color Configuration</span></div>
          <div style={{ padding:"4px 0" }}>
            {Object.entries(editColors).map(([key, cfg]) => (
              <div key={key} style={{ display:"grid", gridTemplateColumns:"120px 1fr 40px 40px 40px 40px 80px", gap:8, alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f1f5f9" }}>
                <div style={{ fontSize:12, fontWeight:700 }}>{key}</div>
                <input className="form-input" style={{ margin:0, fontSize:12 }} value={cfg.label||key}
                  onChange={e=>setEditColors(prev=>({...prev,[key]:{...prev[key],label:e.target.value}}))} />
                {["bg_color","border_color","badge_color","text_color"].map(field => (
                  <input key={field} type="color" style={{ width:32, height:28, border:"none", borderRadius:4, cursor:"pointer", padding:1 }}
                    value={cfg[field]||"#cccccc"}
                    onChange={e=>setEditColors(prev=>({...prev,[key]:{...prev[key],[field]:e.target.value}}))} />
                ))}
                <button className="btn btn-primary btn-sm" style={{ color:"#fff", fontSize:11 }}
                  disabled={savingColor===key} onClick={()=>saveColor(key)}>
                  {savingColor===key?"...":"Save"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Color Legend */}
      {Object.keys(colorMap).length > 0 && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
          {Object.entries(colorMap).slice(0,8).map(([key, c]) => (
            <div key={key} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 10px", borderRadius:20, background:c.bg_color, border:`1px solid ${c.border_color}`, fontSize:11 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:c.badge_color }}/>
              <span style={{ color:c.text_color, fontWeight:600 }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {!loading && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:12, marginBottom:20 }}>
          {[
            { label:"Pending",  value:pending,      color:"#2563eb" },
            { label:"Urgent",   value:urgent,        color:"#ef4444" },
            { label:"Overdue",  value:overdue,       color:"#dc2626" },
            { label:"Total",    value:items.length,  color:"#64748b" },
          ].map(s => (
            <div key={s.label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", borderTop:`3px solid ${s.color}`, padding:"12px 14px" }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="section-card" style={{ marginBottom:16, padding:"12px 16px" }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {[{label:"Pending",value:"pending"},{label:"Completed",value:"completed"},{label:"All",value:""}].map(f => (
            <button key={f.value} className={`btn btn-sm ${activeStatus===f.value?"btn-primary":"btn-ghost"}`}
              style={activeStatus===f.value?{color:"#fff"}:{}} onClick={()=>setStatus(f.value)}>{f.label}</button>
          ))}
          <div style={{ width:1, height:20, background:"#e2e8f0", margin:"0 4px" }}/>
          <select className="form-input" style={{ width:160, margin:0, padding:"5px 10px", fontSize:13 }}
            value={activeModule} onChange={e=>setModule(e.target.value)}>
            <option value="">All Modules</option>
            {["leaves","procurement","finance","withdrawal","discipline","exams"].map(m => {
              const found = modules.find(x => x.module === m);
              return (
                <option key={m} value={m}>
                  {MODULE_ICONS[m]} {m.charAt(0).toUpperCase()+m.slice(1)}{found ? ` (${found.count})` : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="section-card" style={{ textAlign:"center", padding:40, color:"var(--color-text-secondary)" }}>Loading...</div>
      ) : items.length === 0 ? (
        <div className="section-card" style={{ textAlign:"center", padding:56 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>
            {activeStatus==="pending" ? "You're all caught up!" : "No items found"}
          </div>
          <div style={{ color:"var(--color-text-secondary)", fontSize:14 }}>
            {activeStatus==="pending" ? "No pending actions require your attention." : "No items match the current filters."}
          </div>
        </div>
      ) : (
        <div className="section-card" style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1.2fr 0.8fr 1fr 1fr 1fr 1fr 70px", padding:"10px 16px", background:"var(--color-background-secondary)", borderBottom:"2px solid var(--color-border-primary)" }}>
            {["Request","Submitter","Module","Status","Action Required","Assignee","Submitted","Priority"].map(h => (
              <div key={h} style={{ fontSize:11, fontWeight:700, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:".04em" }}>{h}</div>
            ))}
          </div>

          {items.map(item => {
            const c = getColor(item);
            const statusKey = item.entity_status || "submitted";
            return (
              <div key={item.id}
                onClick={() => { if(item.module==="withdrawal"){setWithdrawalReqId(item.entity_id);setWithdrawalWqItem(item);}else if(item.module==="discipline"){setDisciplineCaseId(item.entity_id);}else if(item.module==="discipline"&&item.action_required==="submit_remarks"){setDisciplineCaseId(item.entity_id);}else{setActionItem(item);} }}
                style={{
                  display:"grid", gridTemplateColumns:"2fr 1.2fr 0.8fr 1fr 1fr 1fr 1fr 70px",
                  padding:"11px 16px", cursor:"pointer",
                  background: c.bg_color,
                  borderBottom:`1px solid ${c.border_color}`,
                  borderLeft:`4px solid ${c.badge_color}`,
                  transition:"filter .12s",
                }}
                onMouseEnter={e => e.currentTarget.style.filter="brightness(0.96)"}
                onMouseLeave={e => e.currentTarget.style.filter="none"}
              >
                <div>
                  {ENTITY_TYPE_LABELS[item.entity_type] && (
                    <div style={{ fontSize:10, fontWeight:700, color:"#2563eb", textTransform:"uppercase", letterSpacing:".03em", marginBottom:2 }}>
                      {ENTITY_TYPE_LABELS[item.entity_type]}
                    </div>
                  )}
                  <div style={{ fontWeight:600, fontSize:13, color:"var(--color-text-primary)", marginBottom:2 }}>
                    {item.title}
                    {item.is_overdue && <span style={{ marginLeft:6, fontSize:10, background:"#fef2f2", color:"#991b1b", padding:"1px 6px", borderRadius:8, fontWeight:700 }}>OVERDUE</span>}
                  </div>
                  {item.description && <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>{item.description}</div>}
                </div>
                <div style={{ fontSize:12, display:"flex", alignItems:"center", color:"var(--color-text-primary)" }}>{item.submitter_name || item.created_by_name || "—"}</div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ fontSize:15 }}>{MODULE_ICONS[item.module] || "📋"}</span>
                  <span style={{ fontSize:11, color:"var(--color-text-secondary)", textTransform:"capitalize" }}>{item.module}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center" }}>
                  <span style={{ padding:"3px 10px", borderRadius:12, fontSize:11, fontWeight:700, background:c.badge_color, color:"#fff", textTransform:"capitalize" }}>
                    {c.label || statusKey}
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"center" }}>
                  <span style={{ padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:600, background:"rgba(0,0,0,0.06)", color:"var(--color-text-primary)", textTransform:"capitalize" }}>
                    {item.action_required}
                  </span>
                </div>
                <div style={{ fontSize:12, color:"var(--color-text-secondary)", display:"flex", alignItems:"center" }}>
                  {item.action_required==="view" ? "🔔 Notification" : (item.assignee_display || (item.assigned_role ? item.assigned_role.replace(/_/g," ") : "—"))}
                </div>
                <div style={{ fontSize:11, color:"var(--color-text-secondary)", display:"flex", flexDirection:"column", justifyContent:"center" }}>
                  <div>{formatDate(item.created_at)}</div>
                  <div style={{ marginTop:2, color:"#94a3b8" }}>{timeAgo(item.created_at)}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center" }}>
                  <span style={{
                    padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, textTransform:"uppercase",
                    background: item.priority==="urgent"?"#fef2f2":item.priority==="high"?"#fffbeb":"#f1f5f9",
                    color: item.priority==="urgent"?"#991b1b":item.priority==="high"?"#92400e":"#64748b",
                  }}>{item.priority}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Popup */}
      {selectedItem && (
        <div style={{ position:"fixed", inset:0, zIndex:1010, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
          onClick={() => setSelected(null)}>
          <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:520, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            {(() => {
              const c = getColor(selectedItem);
              return (
                <>
                  <div style={{ background:c.bg_color, borderRadius:"12px 12px 0 0", padding:"20px 24px", borderBottom:`2px solid ${c.border_color}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontSize:24, marginBottom:6 }}>{MODULE_ICONS[selectedItem.module] || "📋"}</div>
                        <div style={{ fontWeight:700, fontSize:17, color:"var(--color-text-primary)" }}>{selectedItem.title}</div>
                        {selectedItem.description && selectedItem.status === "pending" && <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginTop:4 }}>{selectedItem.description}</div>}
                      </div>
                      <button style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"var(--color-text-secondary)" }} onClick={()=>setSelected(null)}>×</button>
                    </div>
                    <div style={{ marginTop:12 }}>
                      <span style={{ padding:"4px 14px", borderRadius:20, fontSize:12, fontWeight:700, background:c.badge_color, color:"#fff" }}>
                        {c.label || selectedItem.entity_status}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding:"20px 24px" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
                      {[
                        { label:"Module", value: selectedItem.module },
                        { label:"Action Required", value: selectedItem.action_required },
                        { label:"Submitted By", value: selectedItem.submitter_name || selectedItem.created_by_name || "—" },
                        { label:"Assignee", value: selectedItem.assignee_display || selectedItem.assigned_role?.replace(/_/g," ") || "—" },
                        { label:"Date Submitted", value: formatDate(selectedItem.created_at) },
                        { label:"Priority", value: selectedItem.priority },
                      ].map(({label, value}) => (
                        <div key={label} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"var(--color-text-secondary)", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                          <div style={{ fontSize:13, fontWeight:500, textTransform:"capitalize" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                      <button className="btn btn-ghost" onClick={()=>setSelected(null)}>Close</button>
                      {selectedItem.status === "pending" && (
                        <button className="btn btn-primary" style={{ color:"#fff" }}
                          onClick={() => { setSelected(null); navigate(selectedItem.link); }}>
                          Open Request →
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {disciplineCaseId && <DisciplineDetailModal caseId={disciplineCaseId} wqItem={items.find(i=>i.entity_id===disciplineCaseId&&i.module==="discipline")} onClose={()=>setDisciplineCaseId(null)} onActed={()=>{setDisciplineCaseId(null);load();}} />}
      {withdrawalReqId && <WithdrawalDetailModal requestId={withdrawalReqId} wqItem={withdrawalWqItem} onClose={()=>setWithdrawalReqId(null)} onActed={()=>{setWithdrawalReqId(null);setWithdrawalWqItem(null);load();}} />}
      {actionItem && <WQActionModal item={actionItem} onClose={()=>setActionItem(null)} onActed={()=>{setActionItem(null);load();}} />}
    </div>
  );
}
