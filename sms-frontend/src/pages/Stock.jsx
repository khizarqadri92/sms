import React, { useState, useEffect, useCallback } from "react";
import procurementApi from "../api/procurementApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const stockStatusBadge = (s) => ({
  in_stock:    { cls: "badge-success", label: "In Stock" },
  low_stock:   { cls: "badge-warning", label: "Low Stock" },
  out_of_stock:{ cls: "badge-danger",  label: "Out of Stock" },
  overstocked: { cls: "badge-primary", label: "Overstocked" },
}[s] || { cls: "badge-gray", label: s });

export default function Stock() {
  const { formatDate } = useRegionalSettings();
  const [stock, setStock]         = useState([]);
  const [pendingGRNs, setPending] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [flash, setFlash]         = useState(null);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("");
  const [previewGRN, setPreview]  = useState(null);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewLoading, setPL]   = useState(false);
  const [updatingId, setUpdating] = useState(null);
  const [adjustModal, setAdjust]  = useState(null);
  const [adjValue, setAdjValue]   = useState("");
  const [adjReason, setAdjReason] = useState("");

  const showFlash = (type, msg) => {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 4000);
  };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      procurementApi.getStock(),
      procurementApi.getPendingStockGRNs(),
    ]).then(([s, g]) => {
      setStock(s.data.data || []);
      setPending(g.data.data || []);
    }).catch(() => showFlash("error", "Failed to load stock data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPreview = (grn) => {
    setPreview(grn);
    setPL(true);
    procurementApi.getGRNStockItems(grn.id)
      .then(r => setPreviewItems(r.data.data || []))
      .catch(() => setPreviewItems([]))
      .finally(() => setPL(false));
  };

  const updateStock = async (grnId) => {
    setUpdating(grnId);
    try {
      const r = await procurementApi.updateStockFromGRN(grnId);
      showFlash("success", r.data.message || "Stock updated.");
      setPreview(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to update stock.");
    } finally { setUpdating(null); }
  };

  const skipStock = async (grnId) => {
    if (!window.confirm("Mark this GRN as processed WITHOUT updating stock?")) return;
    setUpdating(grnId);
    try {
      const r = await procurementApi.skipStockFromGRN(grnId);
      showFlash("success", r.data.message || "GRN processed. Stock not updated.");
      setPreview(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
    } finally { setUpdating(null); }
  };

  const adjustStock = async () => {
    const val = parseInt(adjValue);
    if (isNaN(val) || val === 0) { showFlash("error", "Enter a non-zero adjustment."); return; }
    try {
      const r = await procurementApi.adjustStock(adjustModal.id, { adjustment: val, reason: adjReason });
      showFlash("success", `Stock adjusted. New quantity: ${r.data.data.current_stock}`);
      setAdjust(null); setAdjValue(""); setAdjReason("");
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to adjust stock.");
    }
  };

  const filtered = stock.filter(i => {
    const matchSearch = !search || i.item_name?.toLowerCase().includes(search.toLowerCase()) || i.item_code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || i.stock_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-heading">Stock Management</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Current inventory levels and GRN stock updates
          </div>
        </div>
      </div>

      {flash && <div className={`alert alert-${flash.type}`} style={{ marginBottom: 16 }}>{flash.msg}</div>}

      {/* Pending GRNs Panel */}
      {pendingGRNs.length > 0 && (
        <div className="section-card" style={{ marginBottom: 20, borderLeft: "4px solid #f59e0b" }}>
          <div className="section-card-header">
            <span className="section-card-title">⚠️ GRNs Pending Stock Update ({pendingGRNs.length})</span>
          </div>
          <div style={{ padding: "4px 0" }}>
            {pendingGRNs.map(g => (
              <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{g.grn_number}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {g.po_number} · {g.vendor_name} · {g.received_date ? formatDate(g.received_date) : "-"} · {g.item_count} item{g.item_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openPreview(g)}>Preview</button>
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff", background: "#059669" }}
                    disabled={updatingId === g.id}
                    onClick={() => updateStock(g.id)}>
                    {updatingId === g.id ? "Updating..." : "Update Stock"}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "#64748b", border: "1px solid #e2e8f0" }}
                    disabled={updatingId === g.id}
                    onClick={() => skipStock(g.id)}>
                    Skip Stock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock Summary Cards */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Items", value: stock.length, color: "#2563eb" },
            { label: "In Stock",    value: stock.filter(i => i.stock_status === "in_stock").length, color: "#059669" },
            { label: "Low Stock",   value: stock.filter(i => i.stock_status === "low_stock").length, color: "#f59e0b" },
            { label: "Out of Stock",value: stock.filter(i => i.stock_status === "out_of_stock").length, color: "#ef4444" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderTop: `3px solid ${s.color}`, padding: "14px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="section-card" style={{ marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="form-input" placeholder="Search items..." style={{ width: 220, margin: 0 }}
            value={search} onChange={e => setSearch(e.target.value)} />
          {[
            { label: "All", value: "" },
            { label: "In Stock", value: "in_stock" },
            { label: "Low Stock", value: "low_stock" },
            { label: "Out of Stock", value: "out_of_stock" },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : "btn-ghost"}`}
              style={statusFilter === f.value ? { color: "#fff" } : {}}
              onClick={() => setStatus(f.value)}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Stock Table */}
      {loading ? (
        <div className="section-card" style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="section-card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No items found</div>
        </div>
      ) : (
        <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-background-secondary)", borderBottom: "1px solid var(--color-border-primary)" }}>
                {["Item Code", "Item Name", "Category", "Current Stock", "Min", "Max", "Status", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const { cls, label } = stockStatusBadge(item.stock_status);
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border-primary)", background: i % 2 === 0 ? "transparent" : "var(--color-background-secondary)" }}>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{item.item_code}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{item.item_name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{item.category_name || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: item.stock_status === "out_of_stock" ? "#ef4444" : item.stock_status === "low_stock" ? "#f59e0b" : "#059669" }}>
                        {item.current_stock}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 4 }}>{item.unit}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{item.min_stock ?? "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{item.max_stock ?? "—"}</td>
                    <td style={{ padding: "10px 14px" }}><span className={`badge ${cls}`}>{label}</span></td>
                    <td style={{ padding: "10px 14px" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setAdjust(item); setAdjValue(""); setAdjReason(""); }}>Adjust</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview GRN Stock Modal */}
      {previewGRN && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1010, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Stock Preview — {previewGRN.grn_number}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>These quantities will be added to current stock</div>
              </div>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }} onClick={() => setPreview(null)}>×</button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              {previewLoading ? (
                <div style={{ textAlign: "center", padding: 32, color: "var(--color-text-secondary)" }}>Loading...</div>
              ) : previewItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--color-text-secondary)", fontSize: 13 }}>
                  No stock-linked items found. Items may not be linked to procurement items.
                </div>
              ) : (
                previewItems.map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.item_name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{item.item_code} · {item.item_description}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {item.is_new_item ? (
                        <div style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 10, fontWeight: 700, marginBottom: 4, display: "inline-block" }}>
                          NEW ITEM
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                          Current: <strong>{item.current_stock}</strong> {item.unit}
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: "#059669", fontWeight: 700 }}>
                        {item.is_new_item ? `+${item.quantity_received} (will be added)` : `+${item.quantity_received} → ${parseInt(item.current_stock) + parseFloat(item.quantity_received)}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ color: "#fff", background: "#059669" }}
                disabled={updatingId === previewGRN.id || previewItems.length === 0}
                onClick={() => updateStock(previewGRN.id)}>
                {updatingId === previewGRN.id ? "Updating..." : "Confirm & Update Stock"}
              </button>
              <button className="btn btn-ghost" style={{ color: "#64748b", border: "1px solid #e2e8f0" }}
                disabled={updatingId === previewGRN.id}
                onClick={() => skipStock(previewGRN.id)}>
                Confirm but not add to Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Adjust Modal */}
      {adjustModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1010, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Adjust Stock — {adjustModal.item_name}</div>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }} onClick={() => setAdjust(null)}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
                Current stock: <strong>{adjustModal.current_stock} {adjustModal.unit}</strong>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Adjustment (+ to add, - to remove)</label>
                <input type="number" className="form-input" placeholder="e.g. +10 or -5"
                  value={adjValue} onChange={e => setAdjValue(e.target.value)} />
                {adjValue && !isNaN(parseInt(adjValue)) && (
                  <div style={{ fontSize: 12, color: "#059669", marginTop: 4 }}>
                    New stock: {Math.max(0, parseInt(adjustModal.current_stock || 0) + parseInt(adjValue))} {adjustModal.unit}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason</label>
                <input className="form-input" placeholder="e.g. Damaged goods, correction" value={adjReason} onChange={e => setAdjReason(e.target.value)} />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
              <button className="btn btn-ghost" onClick={() => setAdjust(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ color: "#fff" }} onClick={adjustStock}>Save Adjustment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
