import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import WQActionModal from "../components/WQActionModal";
import WithdrawalDetailModal from "../components/WithdrawalDetailModal";
import DisciplineDetailModal from "../components/DisciplineDetailModal";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import workQueueApi from "../api/workQueueApi";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../auth/ThemeContext";
import "./WorkQueue.css";

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
  payroll_run: "Payroll Run",
  resignation: "Resignation Request",
  resignation_clearance: "Clearance Request",
  resignation_experience_letter: "Experience Letter Request",
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function formatDate(dateStr, fmt) {
  if (!dateStr) return "—";
  return fmt ? fmt(dateStr) : new Date(dateStr).toLocaleDateString("en-PK", { day:"2-digit", month:"short", year:"numeric" });
}

const DEFAULT_COLOR = { bg_color:"#ffffff", border_color:"#e2e8f0", badge_color:"#64748b", text_color:"#374151", label:"Unknown" };

export default function WorkQueue() {
  const { formatDate: fmtDate } = useRegionalSettings();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { colorMode } = useTheme();
  const isDark = colorMode === "dark";
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

  const openItem = (item) => {
    if (item.module === "withdrawal") { setWithdrawalReqId(item.entity_id); setWithdrawalWqItem(item); }
    else if (item.module === "discipline") { setDisciplineCaseId(item.entity_id); }
    else { setActionItem(item); }
  };

  // Deep-link support: notifications link to /work-queue?id={entity_id},
  // so once items load, find and auto-open the matching one.
  useEffect(() => {
    if (loading || items.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("id");
    if (!targetId) return;
    const match = items.find(i => String(i.entity_id) === targetId);
    if (match) {
      openItem(match);
      params.delete("id");
      const newSearch = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (newSearch ? "?" + newSearch : ""));
    }
  }, [loading, items]);

  const pending = items.filter(i => i.status === "pending").length;
  const urgent  = items.filter(i => i.priority === "urgent" && i.status === "pending").length;
  const overdue = items.filter(i => i.is_overdue).length;

  return (
    <div>
      <div className="page-header wq-page-header">
        <div>
          <h1 className="page-heading">Work Queue</h1>
          <div className="wq-subtitle">All pending actions across the system</div>
        </div>
        <div className="wq-header-actions">
          {can("users.manage_roles") && (
            <button className="btn btn-ghost btn-sm" onClick={()=>setColorCfg(!showColorCfg)}>🎨 Color Config</button>
          )}
          <label className="wq-autorefresh-label">
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRef(e.target.checked)} />Auto-refresh
          </label>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {flash && <div className={`alert alert-${flash.type} wq-mb16`}>{flash.msg}</div>}

      {/* Color Config Panel */}
      {showColorCfg && can("users.manage_roles") && (
        <div className="section-card wq-mb20">
          <div className="section-card-header"><span className="section-card-title">Status Color Configuration</span></div>
          <div className="wq-cfg-list">
            {Object.entries(editColors).map(([key, cfg]) => (
              <div key={key} className="wq-cfg-row">
                <div className="wq-cfg-key">{key}</div>
                <input className="form-input wq-cfg-label-input" value={cfg.label||key}
                  onChange={e=>setEditColors(prev=>({...prev,[key]:{...prev[key],label:e.target.value}}))} />
                {["bg_color","border_color","badge_color","text_color"].map(field => (
                  <input key={field} type="color" className="wq-cfg-color-swatch"
                    value={cfg[field]||"#cccccc"}
                    onChange={e=>setEditColors(prev=>({...prev,[key]:{...prev[key],[field]:e.target.value}}))} />
                ))}
                <button className="btn btn-primary btn-sm wq-cfg-save-btn"
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
        <div className="wq-legend">
          {Object.entries(colorMap).slice(0,8).map(([key, c]) => (
            <div key={key} className="wq-legend-item" style={{ "--legend-bg": c.bg_color, "--legend-border": c.border_color }}>
              <div className="wq-legend-dot" style={{ "--legend-dot": c.badge_color }}/>
              <span className="wq-legend-text" style={{ "--legend-text": c.text_color }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {!loading && (
        <div className="wq-summary-grid">
          {[
            { label:"Pending",  value:pending,      color:"#2563eb" },
            { label:"Urgent",   value:urgent,        color:"#ef4444" },
            { label:"Overdue",  value:overdue,       color:"#dc2626" },
            { label:"Total",    value:items.length,  color:"#64748b" },
          ].map(s => (
            <div key={s.label} className="wq-stat-card" style={{ "--stat-color": s.color }}>
              <div className="wq-stat-value" style={{ "--stat-color": s.color }}>{s.value}</div>
              <div className="wq-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="section-card wq-filter-bar">
        <div className="wq-filter-row">
          {[{label:"Pending",value:"pending"},{label:"Completed",value:"completed"},{label:"All",value:""}].map(f => (
            <button key={f.value} className={`btn btn-sm ${activeStatus===f.value?"btn-primary":"btn-ghost"}`}
              onClick={()=>setStatus(f.value)}>{f.label}</button>
          ))}
          <div className="wq-divider"/>
          <select className="form-input wq-module-select"
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
        <div className="section-card wq-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="section-card wq-empty">
          <div className="wq-empty-icon">✅</div>
          <div className="wq-empty-title">
            {activeStatus==="pending" ? "You're all caught up!" : "No items found"}
          </div>
          <div className="wq-empty-subtext">
            {activeStatus==="pending" ? "No pending actions require your attention." : "No items match the current filters."}
          </div>
        </div>
      ) : (
        <div className="section-card wq-table-container">
          <div className="wq-table-header">
            {["Request","Submitter","Module","Status","Action Required","Assignee","Submitted","Priority"].map(h => (
              <div key={h} className="wq-table-header-cell">{h}</div>
            ))}
          </div>

          {items.map(item => {
            const c = getColor(item);
            const statusKey = item.entity_status || "submitted";
            return (
              <div key={item.id}
                onClick={() => openItem(item)}
                className="wq-table-row"
                style={{
                  "--row-bg": isDark ? "var(--bg-card)" : c.bg_color,
                  "--row-border": isDark ? "1px solid var(--border-color)" : `1px solid ${c.border_color}`,
                  "--row-accent": c.badge_color,
                }}
                onMouseEnter={e => e.currentTarget.style.filter="brightness(0.96)"}
                onMouseLeave={e => e.currentTarget.style.filter="none"}
              >
                <div>
                  {ENTITY_TYPE_LABELS[item.entity_type] && (
                    <div className="wq-entity-type-label">
                      {ENTITY_TYPE_LABELS[item.entity_type]}
                    </div>
                  )}
                  <div className="wq-item-title">
                    {item.title}
                    {item.is_overdue && <span className="wq-overdue-badge">OVERDUE</span>}
                  </div>
                  {item.description && <div className="wq-item-desc">{item.description}</div>}
                </div>
                <div className="wq-submitter-cell">{item.submitter_name || item.created_by_name || "—"}</div>
                <div className="wq-module-cell">
                  <span className="wq-module-icon">{MODULE_ICONS[item.module] || "📋"}</span>
                  <span className="wq-module-name">{item.module}</span>
                </div>
                <div className="wq-cell-center">
                  <span className="wq-status-badge" style={{ "--status-color": c.badge_color }}>
                    {c.label || statusKey}
                  </span>
                </div>
                <div className="wq-cell-center">
                  <span className="wq-action-badge">
                    {item.action_required}
                  </span>
                </div>
                <div className="wq-assignee-cell">
                  {item.action_required==="view" ? "🔔 Notification" : (item.assignee_display || (item.assigned_role ? item.assigned_role.replace(/_/g," ") : "—"))}
                </div>
                <div className="wq-date-cell">
                  <div>{formatDate(item.created_at, fmtDate)}</div>
                  <div className="wq-time-ago">{timeAgo(item.created_at)}</div>
                </div>
                <div className="wq-cell-center">
                  <span className={"wq-priority-badge " + (item.priority==="urgent"?"wq-priority-urgent":item.priority==="high"?"wq-priority-high":"wq-priority-normal")}>{item.priority}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Popup */}
      {selectedItem && (
        <div className="wq-modal-overlay"
          onClick={() => setSelected(null)}>
          <div className="wq-modal-box"
            onClick={e => e.stopPropagation()}>
            {(() => {
              const c = getColor(selectedItem);
              return (
                <>
                  <div className="wq-modal-header" style={{ "--modal-header-bg": isDark ? "var(--bg-card)" : c.bg_color, "--modal-header-border": isDark ? "2px solid var(--border-color)" : `2px solid ${c.border_color}` }}>
                    <div className="wq-modal-header-top">
                      <div>
                        <div className="wq-modal-icon">{MODULE_ICONS[selectedItem.module] || "📋"}</div>
                        <div className="wq-modal-title">{selectedItem.title}</div>
                        {selectedItem.description && selectedItem.status === "pending" && <div className="wq-modal-desc">{selectedItem.description}</div>}
                      </div>
                      <button className="wq-modal-close" onClick={()=>setSelected(null)}>×</button>
                    </div>
                    <div className="wq-modal-badge-row">
                      <span className="wq-modal-badge" style={{ "--status-color": c.badge_color }}>
                        {c.label || selectedItem.entity_status}
                      </span>
                    </div>
                  </div>
                  <div className="wq-modal-body">
                    <div className="wq-modal-info-grid">
                      {[
                        { label:"Module", value: selectedItem.module },
                        { label:"Action Required", value: selectedItem.action_required },
                        { label:"Submitted By", value: selectedItem.submitter_name || selectedItem.created_by_name || "—" },
                        { label:"Assignee", value: selectedItem.assignee_display || selectedItem.assigned_role?.replace(/_/g," ") || "—" },
                        { label:"Date Submitted", value: formatDate(selectedItem.created_at, fmtDate) },
                        { label:"Priority", value: selectedItem.priority },
                      ].map(({label, value}) => (
                        <div key={label} className="wq-modal-info-box">
                          <div className="wq-modal-info-label">{label}</div>
                          <div className="wq-modal-info-value">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="wq-modal-footer">
                      <button className="btn btn-ghost" onClick={()=>setSelected(null)}>Close</button>
                      {selectedItem.status === "pending" && (
                        <button className="btn btn-primary"
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
