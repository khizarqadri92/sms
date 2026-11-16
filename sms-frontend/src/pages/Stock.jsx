import React, { useState, useEffect, useCallback } from "react";
import procurementApi from "../api/procurementApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./Stock.css";

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
      <div className="page-header stk-page-header">
        <div>
          <h1 className="page-heading">Stock Management</h1>
          <div className="stk-subtitle">
            Current inventory levels and GRN stock updates
          </div>
        </div>
      </div>

      {flash && <div className={`alert alert-${flash.type} stk-mb16`}>{flash.msg}</div>}

      {/* Pending GRNs Panel */}
      {pendingGRNs.length > 0 && (
        <div className="section-card stk-pending-panel">
          <div className="section-card-header">
            <span className="section-card-title">⚠️ GRNs Pending Stock Update ({pendingGRNs.length})</span>
          </div>
          <div className="stk-panel-list">
            {pendingGRNs.map(g => (
              <div key={g.id} className="stk-grn-row">
                <div>
                  <div className="stk-grn-number">{g.grn_number}</div>
                  <div className="stk-grn-meta">
                    {g.po_number} · {g.vendor_name} · {g.received_date ? formatDate(g.received_date) : "-"} · {g.item_count} item{g.item_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="stk-grn-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => openPreview(g)}>Preview</button>
                  <button className="btn btn-primary btn-sm stk-update-btn"
                    disabled={updatingId === g.id}
                    onClick={() => updateStock(g.id)}>
                    {updatingId === g.id ? "Updating..." : "Update Stock"}
                  </button>
                  <button className="btn btn-ghost btn-sm stk-skip-btn"
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
        <div className="stk-summary-grid">
          {[
            { label: "Total Items", value: stock.length, color: "#2563eb" },
            { label: "In Stock",    value: stock.filter(i => i.stock_status === "in_stock").length, color: "#059669" },
            { label: "Low Stock",   value: stock.filter(i => i.stock_status === "low_stock").length, color: "#f59e0b" },
            { label: "Out of Stock",value: stock.filter(i => i.stock_status === "out_of_stock").length, color: "#ef4444" },
          ].map(s => (
            <div key={s.label} className="stk-summary-card" style={{ "--card-color": s.color }}>
              <div className="stk-summary-value" style={{ "--card-color": s.color }}>{s.value}</div>
              <div className="stk-summary-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="section-card stk-filter-bar">
        <div className="stk-filter-row">
          <input className="form-input stk-search-input" placeholder="Search items..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {[
            { label: "All", value: "" },
            { label: "In Stock", value: "in_stock" },
            { label: "Low Stock", value: "low_stock" },
            { label: "Out of Stock", value: "out_of_stock" },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatus(f.value)}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Stock Table */}
      {loading ? (
        <div className="section-card stk-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="section-card stk-empty">
          <div className="stk-empty-icon">📦</div>
          <div className="stk-no-items-title">No items found</div>
        </div>
      ) : (
        <div className="section-card stk-table-wrap">
          <table className="stk-table">
            <thead>
              <tr className="stk-th-row">
                {["Item Code", "Item Name", "Category", "Current Stock", "Min", "Max", "Status", "Actions"].map(h => (
                  <th key={h} className="stk-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const { cls, label } = stockStatusBadge(item.stock_status);
                return (
                  <tr key={item.id} className="stk-tr" style={{ "--row-bg": i % 2 === 0 ? "transparent" : "var(--color-background-secondary)" }}>
                    <td className="stk-td-code">{item.item_code}</td>
                    <td className="stk-td-name">{item.item_name}</td>
                    <td className="stk-td-category">{item.category_name || "—"}</td>
                    <td className="stk-td-stock">
                      <span className="stk-stock-value" style={{ "--stock-color": item.stock_status === "out_of_stock" ? "#ef4444" : item.stock_status === "low_stock" ? "#f59e0b" : "#059669" }}>
                        {item.current_stock}
                      </span>
                      <span className="stk-stock-unit">{item.unit}</span>
                    </td>
                    <td className="stk-td-simple">{item.min_stock ?? "—"}</td>
                    <td className="stk-td-simple">{item.max_stock ?? "—"}</td>
                    <td className="stk-td-badge"><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="stk-td-action">
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
        <div className="stk-modal-overlay">
          <div className="stk-modal-box">
            <div className="stk-modal-header">
              <div>
                <div className="stk-modal-title">Stock Preview — {previewGRN.grn_number}</div>
                <div className="stk-modal-subtitle">These quantities will be added to current stock</div>
              </div>
              <button className="stk-close-btn" onClick={() => setPreview(null)}>×</button>
            </div>
            <div className="stk-modal-body">
              {previewLoading ? (
                <div className="stk-modal-loading">Loading...</div>
              ) : previewItems.length === 0 ? (
                <div className="stk-modal-empty">
                  No stock-linked items found. Items may not be linked to procurement items.
                </div>
              ) : (
                previewItems.map(item => (
                  <div key={item.id} className="stk-preview-item">
                    <div>
                      <div className="stk-preview-name">{item.item_name}</div>
                      <div className="stk-preview-meta">{item.item_code} · {item.item_description}</div>
                    </div>
                    <div className="stk-preview-right">
                      {item.is_new_item ? (
                        <div className="stk-new-item-tag">
                          NEW ITEM
                        </div>
                      ) : (
                        <div className="stk-current-text">
                          Current: <strong>{item.current_stock}</strong> {item.unit}
                        </div>
                      )}
                      <div className="stk-change-text">
                        {item.is_new_item ? `+${item.quantity_received} (will be added)` : `+${item.quantity_received} → ${parseInt(item.current_stock) + parseFloat(item.quantity_received)}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="stk-modal-footer">
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
              <button className="btn btn-primary stk-update-btn"
                disabled={updatingId === previewGRN.id || previewItems.length === 0}
                onClick={() => updateStock(previewGRN.id)}>
                {updatingId === previewGRN.id ? "Updating..." : "Confirm & Update Stock"}
              </button>
              <button className="btn btn-ghost stk-skip-btn"
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
        <div className="stk-modal-overlay">
          <div className="stk-small-modal-box">
            <div className="stk-modal-header">
              <div className="stk-modal-title">Adjust Stock — {adjustModal.item_name}</div>
              <button className="stk-close-btn" onClick={() => setAdjust(null)}>×</button>
            </div>
            <div className="stk-adjust-body">
              <div className="stk-current-stock-box">
                Current stock: <strong>{adjustModal.current_stock} {adjustModal.unit}</strong>
              </div>
              <div className="stk-field-wrap">
                <label className="stk-field-label">Adjustment (+ to add, - to remove)</label>
                <input type="number" className="form-input" placeholder="e.g. +10 or -5"
                  value={adjValue} onChange={e => setAdjValue(e.target.value)} />
                {adjValue && !isNaN(parseInt(adjValue)) && (
                  <div className="stk-new-stock-preview">
                    New stock: {Math.max(0, parseInt(adjustModal.current_stock || 0) + parseInt(adjValue))} {adjustModal.unit}
                  </div>
                )}
              </div>
              <div>
                <label className="stk-field-label">Reason</label>
                <input className="form-input" placeholder="e.g. Damaged goods, correction" value={adjReason} onChange={e => setAdjReason(e.target.value)} />
              </div>
            </div>
            <div className="stk-modal-footer">
              <button className="btn btn-ghost" onClick={() => setAdjust(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={adjustStock}>Save Adjustment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
