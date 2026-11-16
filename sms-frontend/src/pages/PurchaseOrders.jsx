import React, { useState, useEffect } from "react";
import procurementApi from "../api/procurementApi";
import { useAutoOpenById } from "../hooks/useAutoOpenById";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./PurchaseOrders.css";

const statusBadge = (status) => ({
  draft: "badge-gray",
  issued: "badge-success",
  partially_delivered: "badge-warning",
  completed: "badge-primary",
  cancelled: "badge-danger",
}[status] || "badge-gray");

function CreatePOModal({ approvedPRs, vendors, onClose, onCreated }) {
  const [form, setForm] = useState({ pr_id: "", vendor_id: "", delivery_address: "", expected_delivery_date: "", terms: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedPR = approvedPRs.find(pr => String(pr.id) === String(form.pr_id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.pr_id || !form.vendor_id) { setError("Please select a requisition and a vendor."); return; }
    setSaving(true); setError("");
    try {
      const r = await procurementApi.createPurchaseOrder(form);
      onCreated(r.data.data.id);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create Purchase Order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="po-modal-overlay" onClick={onClose}>
      <div className="po-modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="po-modal-title">Create Purchase Order</div>
        {error && <div className="alert alert-error po-mb12">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Approved Requisition *</label>
            <select className="form-control" value={form.pr_id} onChange={e => setForm({ ...form, pr_id: e.target.value })}>
              <option value="">Select a requisition</option>
              {approvedPRs.map(pr => <option key={pr.id} value={pr.id}>{pr.pr_number} - {pr.requested_by_name} (Rs. {Number(pr.total_estimated_amount).toLocaleString()})</option>)}
            </select>
            {selectedPR && <div className="po-pr-subtext">{selectedPR.item_count} item(s) - {selectedPR.department_name || "No department"}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Vendor *</label>
            <select className="form-control" value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })}>
              <option value="">Select a vendor</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Delivery Address</label>
            <input className="form-control" value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Expected Delivery Date</label>
            <DatePicker value={form.expected_delivery_date} onChange={val => setForm({ ...form, expected_delivery_date: val })} />
          </div>
          <div className="form-group">
            <label className="form-label">Terms</label>
            <textarea className="form-control" rows={2} value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} placeholder="Payment terms, warranty, etc." />
          </div>
          <div className="po-btn-row">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create Draft"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function POItemRow({ item, editable, onSaved }) {
  const [unitPrice, setUnitPrice] = useState(item.unit_price);
  const [taxPercent, setTaxPercent] = useState(item.tax_percent);
  const [saving, setSaving] = useState(false);

  const dirty = String(unitPrice) !== String(item.unit_price) || String(taxPercent) !== String(item.tax_percent);

  const handleSave = async () => {
    setSaving(true);
    try {
      await procurementApi.updatePOItem(item.id, { unit_price: unitPrice, tax_percent: taxPercent });
      onSaved();
    } catch {
      alert("Failed to update item.");
    } finally {
      setSaving(false);
    }
  };

  const lineTotal = Number(unitPrice || 0) * Number(item.quantity) * (1 + Number(taxPercent || 0) / 100);

  return (
    <tr>
      <td>{item.item_description}</td>
      <td>{Number(item.quantity).toLocaleString()}</td>
      <td>{item.unit}</td>
      <td>
        {editable ? (
          <input className="form-control po-unit-price-input" type="number" min="0" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
        ) : "Rs. " + Number(item.unit_price).toLocaleString()}
      </td>
      <td>
        {editable ? (
          <input className="form-control po-tax-input" type="number" min="0" step="0.01" value={taxPercent} onChange={e => setTaxPercent(e.target.value)} />
        ) : item.tax_percent + "%"}
      </td>
      <td>Rs. {lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
      {editable && (
        <td>
          <button className="btn btn-primary btn-xs" disabled={!dirty || saving} onClick={handleSave}>{saving ? "Saving..." : "Save"}</button>
        </td>
      )}
    </tr>
  );
}

function PODetailModal({ poId, onClose, onChanged }) {
  const { formatDate } = useRegionalSettings();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  const fetchDetail = () => {
    setLoading(true);
    procurementApi.getPurchaseOrder(poId).then(r => setPo(r.data.data)).catch(() => setError("Failed to load Purchase Order.")).finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(); }, [poId]);

  const handleIssue = async () => {
    if (!window.confirm("Issue this Purchase Order to the vendor? Items must all have a price before issuing.")) return;
    setActing(true); setError("");
    try {
      await procurementApi.issuePurchaseOrder(poId);
      fetchDetail();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to issue.");
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Cancel this Purchase Order? The requisition will revert to Approved so a new PO can be created.")) return;
    setActing(true); setError("");
    try {
      await procurementApi.cancelPurchaseOrder(poId);
      fetchDetail();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to cancel.");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="po-modal-overlay" onClick={onClose}>
      <div className="po-modal-box-lg" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : !po ? (
          <div className="alert alert-error">Failed to load.</div>
        ) : (
          <>
            <div className="po-header-row">
              <div>
                <div className="po-number">{po.po_number}</div>
                <div className="po-meta">From {po.pr_number} - {po.requested_by_name} - {po.vendor_name}</div>
              </div>
              <div className="po-status-row">
                <span className={"badge po-capitalize " + statusBadge(po.status)}>{po.status.replace("_", " ")}</span>
                <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
              </div>
            </div>

            {error && <div className="alert alert-error po-mt12">{error}</div>}

            <div className="po-info-grid">
              <div className="po-info-box">
                <div className="po-info-label">Delivery Address</div>
                <div className="po-info-value">{po.delivery_address || "-"}</div>
              </div>
              <div className="po-info-box">
                <div className="po-info-label">Expected Delivery</div>
                <div className="po-info-value">{po.expected_delivery_date ? formatDate(po.expected_delivery_date) : "-"}</div>
              </div>
            </div>
            {po.terms && <div className="po-terms-text"><strong>Terms:</strong> {po.terms}</div>}

            <div className="po-items-label">
              Items {po.status === "draft" && <span className="po-items-hint">(prices editable while draft)</span>}
            </div>
            <div className="table-container po-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit Price</th>
                    <th>Tax %</th>
                    <th>Line Total</th>
                    {po.status === "draft" && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {po.items.map(it => (
                    <POItemRow key={it.id} item={it} editable={po.status === "draft"} onSaved={fetchDetail} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="po-total-row">
              Total: <strong>Rs. {Number(po.total_amount).toLocaleString()}</strong>
            </div>

            {(po.status === "draft" || po.status === "issued") && (
              <div className="po-actions-row">
                <button className="btn btn-danger" disabled={acting} onClick={handleCancel}>Cancel PO</button>
                {po.status === "draft" && (
                  <button className="btn btn-primary" disabled={acting} onClick={handleIssue}>{acting ? "Issuing..." : "Issue to Vendor"}</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [approvedPRs, setApprovedPRs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState(null);

  const fetchOrders = (status) => {
    setLoading(true);
    const params = {};
    const s = status !== undefined ? status : statusFilter;
    if (s) params.status = s;
    procurementApi.getPurchaseOrders(params)
      .then(r => setOrders(r.data.data || []))
      .catch(() => setError("Failed to load purchase orders."))
      .finally(() => setLoading(false));
  };

  const fetchApprovedPRs = () => {
    procurementApi.getAllRequisitions({ status: "approved" }).then(r => setApprovedPRs(r.data.data || [])).catch(() => {});
  };

  useEffect(() => {
    fetchOrders();
    fetchApprovedPRs();
    procurementApi.getVendors().then(r => setVendors((r.data.data || []).filter(v => v.is_active && !v.is_blacklisted))).catch(() => {});
  }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const filters = [
    { label: "All", value: "" },
    { label: "Draft", value: "draft" },
    { label: "Issued", value: "issued" },
    { label: "Completed", value: "completed" },
    { label: "Cancelled", value: "cancelled" },
  ];

  useAutoOpenById(orders, (po) => setViewId(po.id));
  return (
    <div>
      <div className="page-header po-page-header">
        <h1 className="page-heading">Purchase Orders</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} disabled={approvedPRs.length === 0}>+ Create Purchase Order</button>
      </div>

      {approvedPRs.length === 0 && (
        <div className="po-no-prs-text">No fully-approved requisitions are waiting to become a Purchase Order right now.</div>
      )}

      {success && <div className="alert alert-success po-mb16">{success}</div>}
      {error && <div className="alert alert-error po-mb16">{error}</div>}

      <div className="section-card po-mb16">
        <div className="po-filter-row">
          {filters.map(f => (
            <button key={f.value} className={"btn " + (statusFilter === f.value ? "btn-primary" : "btn-secondary")} onClick={() => { setStatusFilter(f.value); fetchOrders(f.value); }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No purchase orders found.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>From Requisition</th>
                <th>Vendor</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(po => (
                <tr key={po.id}>
                  <td><strong>{po.po_number}</strong></td>
                  <td>{po.pr_number} <span className="po-pr-name-subtext">({po.requested_by_name})</span></td>
                  <td>{po.vendor_name}</td>
                  <td>{po.item_count}</td>
                  <td>Rs. {Number(po.total_amount).toLocaleString()}</td>
                  <td><span className={"badge po-capitalize " + statusBadge(po.status)}>{po.status.replace("_", " ")}</span></td>
                  <td><button className="btn btn-ghost btn-xs" onClick={() => setViewId(po.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreatePOModal
          approvedPRs={approvedPRs}
          vendors={vendors}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); showToast("Purchase Order created as draft."); fetchOrders(); fetchApprovedPRs(); setViewId(id); }}
        />
      )}

      {viewId && (
        <PODetailModal poId={viewId} onClose={() => setViewId(null)} onChanged={() => { fetchOrders(); fetchApprovedPRs(); }} />
      )}
    </div>
  );
}
