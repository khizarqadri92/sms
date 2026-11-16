import React, { useState, useEffect, useCallback } from "react";
import procurementApi from "../api/procurementApi";
import { useAutoOpenById } from "../hooks/useAutoOpenById";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./GRN.css";

const statusBadge = (s) => ({
  draft:     { cls: "badge-warning",  label: "Draft" },
  confirmed: { cls: "badge-success",  label: "Confirmed" },
  cancelled: { cls: "badge-danger",   label: "Cancelled" },
}[s] || { cls: "badge-gray", label: s });

const conditionBadge = (c) => ({
  good:    { cls: "badge-success", label: "Good" },
  damaged: { cls: "badge-danger",  label: "Damaged" },
  partial: { cls: "badge-warning", label: "Partial" },
}[c] || { cls: "badge-gray", label: c });

export default function GRN() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const [grns, setGrns]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [flash, setFlash]           = useState(null);
  const [statusFilter, setStatus]   = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDL]      = useState(false);

  // Create GRN form state
  const [pos, setPOs]               = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [poItems, setPOItems]       = useState([]);
  const [receivedDate, setRecDate]  = useState(new Date().toISOString().slice(0,10));
  useEffect(() => { setRecDate(processingToday); }, [processingToday]);
  const [notes, setNotes]           = useState("");
  const [itemQtys, setItemQtys]     = useState({});
  const [itemConds, setItemConds]   = useState({});
  const [itemNotes, setItemNotes]   = useState({});
  const [saving, setSaving]         = useState(false);

  const showFlash = (type, msg) => {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 4000);
  };

  const load = useCallback(() => {
    setLoading(true);
    procurementApi.getGRNs(statusFilter ? { status: statusFilter } : {})
      .then(r => setGrns(r.data.data || []))
      .catch(() => setError("Failed to load GRNs."))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setShowCreate(true);
    setSelectedPO(null); setPOItems([]); setNotes(""); setItemQtys({}); setItemConds({}); setItemNotes({});
    setRecDate(processingToday);
    procurementApi.getPurchaseOrders({ status: "issued" })
      .then(r => setPOs(r.data.data || []))
      .catch(() => {});
    procurementApi.getPurchaseOrders({ status: "partially_delivered" })
      .then(r => setPOs(prev => [...prev, ...(r.data.data || [])]))
      .catch(() => {});
  };

  const selectPO = (po) => {
    setSelectedPO(po);
    // Get PO items via GRN detail endpoint hack — use PO grns to get items
    procurementApi.getPOGRNs(po.id)
      .then(() => {})
      .catch(() => {});
    // Fetch PO detail for items
    procurementApi.getPurchaseOrder(po.id)
      .then(r => {
        const items = r.data.data?.items || [];
        setPOItems(items);
        const qtys = {}, conds = {}, notes2 = {};
        items.forEach(i => {
          const remaining = parseFloat(i.quantity) - parseFloat(i.received_quantity || 0);
          qtys[i.id] = remaining > 0 ? remaining : 0;
          conds[i.id] = "good";
          notes2[i.id] = "";
        });
        setItemQtys(qtys); setItemConds(conds); setItemNotes(notes2);
      })
      .catch(() => {});
  };

  const submitGRN = async () => {
    if (!selectedPO) { showFlash("error", "Select a Purchase Order."); return; }
    const items = poItems
      .filter(i => parseFloat(itemQtys[i.id] || 0) > 0)
      .map(i => ({
        po_item_id: i.id,
        quantity_received: parseFloat(itemQtys[i.id] || 0),
        condition: itemConds[i.id] || "good",
        notes: itemNotes[i.id] || "",
      }));
    if (!items.length) { showFlash("error", "Enter at least one received quantity."); return; }
    setSaving(true);
    try {
      const r = await procurementApi.createGRN({ po_id: selectedPO.id, received_date: receivedDate, notes, items });
      showFlash("success", r.data.message || "GRN created.");
      setShowCreate(false);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to create GRN.");
    } finally { setSaving(false); }
  };

  const openDetail = (id) => {
    setDL(true);
    procurementApi.getGRN(id)
      .then(r => setDetail(r.data.data))
      .catch(() => showFlash("error", "Failed to load GRN."))
      .finally(() => setDL(false));
  };

  const confirmGRN = async (id) => {
    try {
      await procurementApi.confirmGRN(id);
      showFlash("success", "GRN confirmed. Stock updated.");
      setDetail(prev => prev ? { ...prev, status: "confirmed" } : null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to confirm GRN.");
    }
  };

  const cancelGRN = async (id) => {
    if (!window.confirm("Cancel this GRN?")) return;
    try {
      await procurementApi.cancelGRN(id);
      showFlash("success", "GRN cancelled.");
      setDetail(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to cancel GRN.");
    }
  };

  useAutoOpenById(grns, openDetail);
  return (
    <div>
      {/* Header */}
      <div className="page-header grn-page-header">
        <div>
          <h1 className="page-heading">Goods Receipt Notes</h1>
          <div className="grn-subtitle">
            Record delivery of goods against Purchase Orders
          </div>
        </div>
        <button className="btn btn-primary grn-new-btn" onClick={openCreate}>
          + New GRN
        </button>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`alert alert-${flash.type} grn-mb16`}>
          {flash.msg}
        </div>
      )}

      {/* Filters */}
      <div className="section-card grn-filter-bar">
        <div className="grn-filter-row">
          {[
            { label: "All", value: "" },
            { label: "Draft", value: "draft" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Cancelled", value: "cancelled" },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatus(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* GRN List */}
      {loading ? (
        <div className="section-card grn-loading">Loading...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : grns.length === 0 ? (
        <div className="section-card grn-empty">
          <div className="grn-empty-icon">📦</div>
          <div className="grn-empty-title">No GRNs yet</div>
          <div className="grn-empty-subtext">
            Create a GRN when goods arrive against an issued Purchase Order.
          </div>
        </div>
      ) : (
        <div className="section-card grn-table-wrap">
          <table className="grn-table">
            <thead>
              <tr className="grn-th-row">
                {["GRN #", "PO #", "Vendor", "Received Date", "Items", "Status", "Actions"].map(h => (
                  <th key={h} className="grn-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grns.map((g, i) => {
                const { cls, label } = statusBadge(g.status);
                return (
                  <tr key={g.id} className="grn-tr" style={{ "--row-bg": i % 2 === 0 ? "transparent" : "var(--color-background-secondary)" }}>
                    <td className="grn-td-bold">{g.grn_number}</td>
                    <td className="grn-td">{g.po_number}</td>
                    <td className="grn-td">{g.vendor_name}</td>
                    <td className="grn-td">{g.received_date ? formatDate(g.received_date) : "-"}</td>
                    <td className="grn-td">{g.item_count} item{g.item_count !== 1 ? "s" : ""}</td>
                    <td className="grn-td-badge"><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="grn-td-badge">
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(g.id)}>View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create GRN Modal */}
      {showCreate && (
        <div className="grn-modal-overlay">
          <div className="grn-modal-box">
            <div className="grn-modal-header">
              <div className="grn-modal-title">Create Goods Receipt Note</div>
              <button className="grn-close-btn" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="grn-modal-body">
              {/* Select PO */}
              <div className="grn-field-wrap">
                <label className="grn-field-label">Purchase Order *</label>
                <select className="form-input" value={selectedPO?.id || ""} onChange={e => {
                  const po = pos.find(p => p.id === parseInt(e.target.value));
                  if (po) selectPO(po);
                }}>
                  <option value="">— Select a PO —</option>
                  {pos.map(p => (
                    <option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name} ({p.status})</option>
                  ))}
                </select>
              </div>

              {/* Date & Notes */}
              <div className="grn-date-notes-grid">
                <div>
                  <label className="grn-field-label">Received Date *</label>
                  <DatePicker value={receivedDate} onChange={val => setRecDate(val)} />
                </div>
                <div>
                  <label className="grn-field-label">Notes</label>
                  <input className="form-input" placeholder="Delivery notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              {/* PO Items */}
              {selectedPO && poItems.length > 0 && (
                <div>
                  <div className="grn-items-label">
                    Items to Receive
                  </div>
                  {poItems.map(item => {
                    const ordered = parseFloat(item.quantity);
                    const alreadyReceived = parseFloat(item.received_quantity || 0);
                    const remaining = ordered - alreadyReceived;
                    return (
                      <div key={item.id} className="grn-item-card" style={{ "--card-bg": remaining <= 0 ? "var(--bg-hover)" : "var(--bg-card)" }}>
                        <div className="grn-item-top">
                          <div className="grn-item-name">{item.item_description}</div>
                          <div className="grn-item-meta">
                            Ordered: {ordered} {item.unit} | Received: {alreadyReceived} | Remaining: <strong className="grn-remaining-value" style={{ "--remaining-color": remaining > 0 ? "#059669" : "var(--text-muted)" }}>{remaining}</strong>
                          </div>
                        </div>
                        {remaining > 0 ? (
                          <div className="grn-item-fields-grid">
                            <div>
                              <label className="grn-item-field-label">Qty Received</label>
                              <input type="number" className="form-input" min={0} max={remaining} step="0.01"
                                value={itemQtys[item.id] ?? ""}
                                onChange={e => setItemQtys(prev => ({ ...prev, [item.id]: e.target.value }))} />
                            </div>
                            <div>
                              <label className="grn-item-field-label">Condition</label>
                              <select className="form-input" value={itemConds[item.id] || "good"} onChange={e => setItemConds(prev => ({ ...prev, [item.id]: e.target.value }))}>
                                <option value="good">Good</option>
                                <option value="partial">Partially Damaged</option>
                                <option value="damaged">Damaged</option>
                              </select>
                            </div>
                            <div>
                              <label className="grn-item-field-label">Notes</label>
                              <input className="form-input" placeholder="Optional"
                                value={itemNotes[item.id] || ""}
                                onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))} />
                            </div>
                          </div>
                        ) : (
                          <div className="grn-fully-received">Fully received</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedPO && poItems.length === 0 && (
                <div className="grn-loading-items">
                  Loading PO items...
                </div>
              )}
            </div>

            <div className="grn-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !selectedPO} onClick={submitGRN}>
                {saving ? "Creating..." : "Create GRN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRN Detail Modal */}
      {detail && (
        <div className="grn-modal-overlay">
          <div className="grn-modal-box-detail">
            <div className="grn-detail-header">
              <div>
                <div className="grn-detail-number">{detail.grn_number}</div>
                <div className="grn-detail-meta">
                  PO: {detail.po_number} | Vendor: {detail.vendor_name}
                </div>
              </div>
              <div className="grn-detail-actions">
                {detail.status === "draft" && (
                  <>
                    <button className="btn btn-primary btn-sm grn-confirm-btn" onClick={() => confirmGRN(detail.id)}>
                      Confirm GRN
                    </button>
                    <button className="btn btn-ghost btn-sm grn-cancel-btn" onClick={() => cancelGRN(detail.id)}>
                      Cancel
                    </button>
                  </>
                )}
                {detail.status==="confirmed"&&(<button className="btn btn-ghost btn-sm grn-notify-btn" onClick={async()=>{try{const r=await procurementApi.notifyCollection(detail.id);showFlash("success",r.data.message);}catch(e){showFlash("error",e.response?.data?.message||"Failed.");}}}>🔔 Notify for Collection</button>)}<button className="grn-close-btn" onClick={() => setDetail(null)}>×</button>
              </div>
            </div>

            <div className="grn-detail-body">
              {/* Info row */}
              <div className="grn-info-grid">
                {[
                  { label: "Status", value: <span className={`badge ${statusBadge(detail.status).cls}`}>{statusBadge(detail.status).label}</span> },
                  { label: "Received Date", value: detail.received_date ? formatDate(detail.received_date) : "-" },
                  { label: "Received By", value: detail.received_by_name },
                ].map(({ label, value }) => (
                  <div key={label} className="grn-info-box">
                    <div className="grn-info-label">{label}</div>
                    <div className="grn-info-value">{value}</div>
                  </div>
                ))}
              </div>

              {detail.notes && (
                <div className="grn-notes-box">
                  <strong>Notes:</strong> {detail.notes}
                </div>
              )}

              {/* Items */}
              <div className="grn-items-received-label">Items Received</div>
              {detail.items?.length === 0 ? (
                <div className="grn-detail-empty">No items recorded.</div>
              ) : (
                <div>
                  {detail.items?.map(item => {
                    const { cls, label } = conditionBadge(item.condition);
                    return (
                      <div key={item.id} className="grn-detail-item-card">
                        <div className="grn-detail-item-top">
                          <div>
                            <div className="grn-detail-item-name">{item.item_description}</div>
                            {item.notes && <div className="grn-detail-item-note">{item.notes}</div>}
                          </div>
                          <div className="grn-detail-item-right">
                            <div className="grn-detail-item-qty">{item.quantity_received} <span className="grn-detail-item-unit">{item.unit}</span></div>
                            <span className={`badge ${cls} grn-detail-item-badge`}>{label}</span>
                          </div>
                        </div>
                        <div className="grn-detail-item-meta">
                          Ordered: {item.ordered_quantity} | Total Received: {item.total_received}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
