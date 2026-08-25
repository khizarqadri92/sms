import React, { useState, useEffect, useCallback } from "react";
import procurementApi from "../api/procurementApi";
import { useAutoOpenById } from "../hooks/useAutoOpenById";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";

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
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-heading">Goods Receipt Notes</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Record delivery of goods against Purchase Orders
          </div>
        </div>
        <button className="btn btn-primary" style={{ color: "#fff" }} onClick={openCreate}>
          + New GRN
        </button>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`alert alert-${flash.type}`} style={{ marginBottom: 16 }}>
          {flash.msg}
        </div>
      )}

      {/* Filters */}
      <div className="section-card" style={{ marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: "All", value: "" },
            { label: "Draft", value: "draft" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Cancelled", value: "cancelled" },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : "btn-ghost"}`}
              style={statusFilter === f.value ? { color: "#fff" } : {}}
              onClick={() => setStatus(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* GRN List */}
      {loading ? (
        <div className="section-card" style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>Loading...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : grns.length === 0 ? (
        <div className="section-card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No GRNs yet</div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
            Create a GRN when goods arrive against an issued Purchase Order.
          </div>
        </div>
      ) : (
        <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-background-secondary)", borderBottom: "1px solid var(--color-border-primary)" }}>
                {["GRN #", "PO #", "Vendor", "Received Date", "Items", "Status", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grns.map((g, i) => {
                const { cls, label } = statusBadge(g.status);
                return (
                  <tr key={g.id} style={{ borderBottom: "1px solid var(--color-border-primary)", background: i % 2 === 0 ? "transparent" : "var(--color-background-secondary)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{g.grn_number}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{g.po_number}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{g.vendor_name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{g.received_date}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{g.item_count} item{g.item_count !== 1 ? "s" : ""}</td>
                    <td style={{ padding: "10px 14px" }}><span className={`badge ${cls}`}>{label}</span></td>
                    <td style={{ padding: "10px 14px" }}>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 1010, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Create Goods Receipt Note</div>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {/* Select PO */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Purchase Order *</label>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Received Date *</label>
                  <DatePicker value={receivedDate} onChange={val => setRecDate(val)} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Notes</label>
                  <input className="form-input" placeholder="Delivery notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              {/* PO Items */}
              {selectedPO && poItems.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                    Items to Receive
                  </div>
                  {poItems.map(item => {
                    const ordered = parseFloat(item.quantity);
                    const alreadyReceived = parseFloat(item.received_quantity || 0);
                    const remaining = ordered - alreadyReceived;
                    return (
                      <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 10, background: remaining <= 0 ? "#f8fafc" : "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.item_description}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                            Ordered: {ordered} {item.unit} | Received: {alreadyReceived} | Remaining: <strong style={{ color: remaining > 0 ? "#059669" : "#94a3b8" }}>{remaining}</strong>
                          </div>
                        </div>
                        {remaining > 0 ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 8 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--color-text-secondary)" }}>Qty Received</label>
                              <input type="number" className="form-input" min={0} max={remaining} step="0.01"
                                value={itemQtys[item.id] ?? ""}
                                onChange={e => setItemQtys(prev => ({ ...prev, [item.id]: e.target.value }))} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--color-text-secondary)" }}>Condition</label>
                              <select className="form-input" value={itemConds[item.id] || "good"} onChange={e => setItemConds(prev => ({ ...prev, [item.id]: e.target.value }))}>
                                <option value="good">Good</option>
                                <option value="partial">Partially Damaged</option>
                                <option value="damaged">Damaged</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--color-text-secondary)" }}>Notes</label>
                              <input className="form-input" placeholder="Optional"
                                value={itemNotes[item.id] || ""}
                                onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Fully received</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedPO && poItems.length === 0 && (
                <div style={{ textAlign: "center", padding: 24, color: "var(--color-text-secondary)", fontSize: 13 }}>
                  Loading PO items...
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ color: "#fff" }} disabled={saving || !selectedPO} onClick={submitGRN}>
                {saving ? "Creating..." : "Create GRN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRN Detail Modal */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1010, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detail.grn_number}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                  PO: {detail.po_number} | Vendor: {detail.vendor_name}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {detail.status === "draft" && (
                  <>
                    <button className="btn btn-primary btn-sm" style={{ color: "#fff", background: "#059669" }} onClick={() => confirmGRN(detail.id)}>
                      Confirm GRN
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: "#ef4444" }} onClick={() => cancelGRN(detail.id)}>
                      Cancel
                    </button>
                  </>
                )}
                {detail.status==="confirmed"&&(<button className="btn btn-ghost btn-sm" style={{border:"1px solid #2563eb",color:"#2563eb",marginRight:8}} onClick={async()=>{try{const r=await procurementApi.notifyCollection(detail.id);showFlash("success",r.data.message);}catch(e){showFlash("error",e.response?.data?.message||"Failed.");}}}>🔔 Notify for Collection</button>)}<button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={() => setDetail(null)}>×</button>
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Info row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Status", value: <span className={`badge ${statusBadge(detail.status).cls}`}>{statusBadge(detail.status).label}</span> },
                  { label: "Received Date", value: detail.received_date },
                  { label: "Received By", value: detail.received_by_name },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>

              {detail.notes && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
                  <strong>Notes:</strong> {detail.notes}
                </div>
              )}

              {/* Items */}
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: 10 }}>Items Received</div>
              {detail.items?.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--color-text-secondary)", fontSize: 13 }}>No items recorded.</div>
              ) : (
                <div>
                  {detail.items?.map(item => {
                    const { cls, label } = conditionBadge(item.condition);
                    return (
                      <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{item.item_description}</div>
                            {item.notes && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{item.notes}</div>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.quantity_received} <span style={{ fontSize: 12, fontWeight: 400 }}>{item.unit}</span></div>
                            <span className={`badge ${cls}`} style={{ marginTop: 4 }}>{label}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 6 }}>
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
