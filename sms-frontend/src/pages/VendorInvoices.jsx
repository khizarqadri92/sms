import React, { useState, useEffect, useCallback } from "react";
import procurementApi from "../api/procurementApi";
import workflowApi from "../api/workflowApi";
import { useAutoOpenById } from "../hooks/useAutoOpenById";
import { useAuth } from "../auth/AuthContext";
import DatePicker from "../components/DatePicker";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./VendorInvoices.css";

const statusBadge = (s) => ({
  pending:  { cls: "badge-warning", label: "Pending Verification" },
  verified: { cls: "badge-primary", label: "Verified" },
  approved: { cls: "badge-success", label: "Approved" },
  paid:     { cls: "badge-success", label: "Paid" },
  disputed: { cls: "badge-danger",  label: "Disputed" },
  cancelled:{ cls: "badge-gray",    label: "Cancelled" },
}[s] || { cls: "badge-gray", label: s });

const METHOD_LABELS = { bank_transfer:"Bank Transfer", cash:"Cash", cheque:"Cheque", online:"Online Transfer" };

export default function VendorInvoices() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const { can } = useAuth();
  const [invoices, setInvoices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [flash, setFlash]           = useState(null);
  const [statusFilter, setStatus]   = useState("");
  const [detail, setDetail]         = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pos, setPOs]               = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [grns, setGRNs]             = useState([]);
  const [form, setForm]             = useState({ vendor_invoice_no:"", invoice_date:"", grn_id:"", notes:"" });
  const [items, setItems]           = useState([{ description:"", quantity:1, unit_price:0, tax_percent:0, po_item_id:"" }]);
  const [saving, setSaving]         = useState(false);
  const [showPayModal, setPayModal] = useState(false);
  const [payForm, setPayForm]       = useState({ amount:"", payment_date:"", payment_method:"bank_transfer", reference:"", notes:"" });
  const [disputeModal, setDispute]  = useState(false);
  const [disputeReason, setDR]      = useState("");
  const [acting, setActing]         = useState(false);
  const [wfStep, setWfStep] = useState(null);
  const [wfDone, setWfDone] = useState(false);
  const [wfExists, setWfExists] = useState(false);
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const loadWfStep = async (invId) => {
    try {
      const r = await workflowApi.getInstance("finance", "vendor_invoice", invId);
      const inst = r.data.data;
      setWfExists(!!inst);
      setWfDone(inst?.status === "completed");
      const steps = inst?.steps || [];
      const pending = steps.find(s => s.status === "pending" && (
        s.assigned_to_id === user?.id ||
        (s.assigned_role && userRoles.includes(s.assigned_role))
      ));
      setWfStep(pending || null);
    } catch { setWfStep(null); setWfDone(false); setWfExists(false); }
  };

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4500); };

  const load = useCallback(() => {
    setLoading(true);
    procurementApi.getVendorInvoices(statusFilter ? { status: statusFilter } : {})
      .then(r => setInvoices(r.data.data || []))
      .catch(() => showFlash("error", "Failed to load invoices."))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setShowCreate(true);
    setSelectedPO(null); setGRNs([]);
    setForm({ vendor_invoice_no:"", invoice_date:processingToday, grn_id:"", notes:"" });
    setItems([{ description:"", quantity:1, unit_price:0, tax_percent:0, po_item_id:"" }]);
    procurementApi.getPurchaseOrders({ status:"issued" })
      .then(r => setPOs(r.data.data || [])).catch(()=>{});
    procurementApi.getPurchaseOrders({ status:"partially_delivered" })
      .then(r => setPOs(prev => [...prev, ...(r.data.data||[])])).catch(()=>{});
    procurementApi.getPurchaseOrders({ status:"completed" })
      .then(r => setPOs(prev => [...prev, ...(r.data.data||[])])).catch(()=>{});
  };

  const selectPO = (po) => {
    setSelectedPO(po);
    setItems(po ? (po.items||[]).map(i => ({ description:i.item_description, quantity:parseFloat(i.received_quantity||i.quantity), unit_price:parseFloat(i.unit_price||0), tax_percent:parseFloat(i.tax_percent||0), po_item_id:i.id })) : [{ description:"", quantity:1, unit_price:0, tax_percent:0, po_item_id:"" }]);
    if (po) {
      procurementApi.getPOGRNs(po.id).then(r => setGRNs(r.data.data||[])).catch(()=>{});
      procurementApi.getPurchaseOrder(po.id).then(r => {
        const poData = r.data.data;
        setSelectedPO(poData);
        setItems((poData?.items||[]).map(i => ({ description:i.item_description, quantity:parseFloat(i.received_quantity||i.quantity), unit_price:parseFloat(i.unit_price||0), tax_percent:parseFloat(i.tax_percent||0), po_item_id:i.id })));
      }).catch(()=>{});
    }
  };

  const addItem = () => setItems(prev => [...prev, { description:"", quantity:1, unit_price:0, tax_percent:0, po_item_id:"" }]);
  const removeItem = (i) => setItems(prev => prev.filter((_,j) => j!==i));
  const updateItem = (i, field, val) => setItems(prev => prev.map((it,j) => j===i ? {...it, [field]:val} : it));

  const calcTotals = () => {
    let sub=0, tax=0;
    items.forEach(i => { const base=parseFloat(i.quantity||0)*parseFloat(i.unit_price||0); sub+=base; tax+=base*(parseFloat(i.tax_percent||0)/100); });
    return { subtotal:sub.toFixed(2), tax:tax.toFixed(2), total:(sub+tax).toFixed(2) };
  };

  const submitInvoice = async () => {
    if (!selectedPO) { showFlash("error","Select a Purchase Order."); return; }
    if (!form.vendor_invoice_no) { showFlash("error","Enter the vendor's invoice number."); return; }
    if (!form.invoice_date) { showFlash("error","Enter invoice date."); return; }
    setSaving(true);
    try {
      const r = await procurementApi.createVendorInvoice({ ...form, po_id:selectedPO.id, grn_id:form.grn_id||null, items });
      showFlash("success", r.data.message||"Invoice created.");
      setShowCreate(false); load();
    } catch(e) { showFlash("error", e.response?.data?.message||e.response?.data?.detail?.message||e.response?.data?.msg||"Failed."); }
    finally { setSaving(false); }
  };

  const openDetail = (id) => {
    procurementApi.getVendorInvoice(id).then(r => setDetail(r.data.data)).catch(() => showFlash("error","Failed to load."));
    loadWfStep(id);
  };

  const act = async (action, payload={}) => {
    setActing(true);
    try {
      let r;
      if (wfStep && !["dispute","cancel"].includes(action)) {
        r = await procurementApi.actOnVendorInvoice(detail.id, { action, notes: payload.reason || "" });
      } else if (action==="verify")   r = await procurementApi.verifyVendorInvoice(detail.id);
      else if (action==="approve")  r = await procurementApi.approveVendorInvoice(detail.id);
      else if (action==="dispute")  r = await procurementApi.disputeVendorInvoice(detail.id, payload);
      else if (action==="cancel")   r = await procurementApi.cancelVendorInvoice(detail.id);
      showFlash("success", r.data.message||"Done.");
      setDispute(false); setDR("");
      openDetail(detail.id); load();
    } catch(e) { showFlash("error", e.response?.data?.message||e.response?.data?.detail?.message||e.response?.data?.msg||"Action failed."); }
    finally { setActing(false); }
  };

  const recordPayment = async () => {
    if (!payForm.amount || parseFloat(payForm.amount)<=0) { showFlash("error","Enter a valid amount."); return; }
    setSaving(true);
    try {
      const r = await procurementApi.recordInvoicePayment(detail.id, payForm);
      if (wfStep && wfStep.step_type === "payment") {
        await procurementApi.actOnVendorInvoice(detail.id, { action: "payment", notes: "" });
      }
      showFlash("success", r.data.message||"Payment recorded.");
      setPayModal(false); setPayForm({ amount:"", payment_date:"", payment_method:"bank_transfer", reference:"", notes:"" });
      openDetail(detail.id); load();
    } catch(e) { showFlash("error", e.response?.data?.message||"Failed."); }
    finally { setSaving(false); }
  };

  const tots = calcTotals();

  useAutoOpenById(invoices, (inv) => openDetail(inv.id));
  return (
    <div>
      <div className="page-header vi-page-header">
        <div>
          <h1 className="page-heading">Vendor Invoices</h1>
          <div className="vi-subtitle">
            Track and process vendor invoices against purchase orders
          </div>
        </div>
        <button className="btn btn-primary vi-btn-white" onClick={openCreate}>+ Record Invoice</button>
      </div>

      {flash && <div className={`alert alert-${flash.type} vi-mb16`}>{flash.msg}</div>}

      {/* Filters */}
      <div className="section-card vi-filter-bar">
        <div className="vi-filter-row">
          {[{label:"All",value:""},{label:"Pending",value:"pending"},{label:"Verified",value:"verified"},{label:"Approved",value:"approved"},{label:"Paid",value:"paid"},{label:"Disputed",value:"disputed"}].map(f => (
            <button key={f.value} className={`btn btn-sm ${statusFilter===f.value?"btn-primary":"btn-ghost"}`}
              onClick={()=>setStatus(f.value)}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Invoices List */}
      {loading ? (
        <div className="section-card vi-loading">Loading...</div>
      ) : invoices.length===0 ? (
        <div className="section-card vi-empty">
          <div className="vi-empty-icon">🧾</div>
          <div className="vi-empty-title">No vendor invoices yet</div>
          <div className="vi-empty-subtext">Record a vendor invoice against an issued Purchase Order.</div>
        </div>
      ) : (
        <div className="section-card vi-table-wrap">
          <table className="vi-table">
            <thead>
              <tr className="vi-th-row">
                {["Invoice #","PO #","Vendor","Date","Total","Paid","Balance","Status",""].map(h => (
                  <th key={h} className="vi-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv,i) => {
                const {cls,label} = statusBadge(inv.status);
                const balance = parseFloat(inv.balance||0);
                return (
                  <tr key={inv.id} className="vi-tr" style={{ "--row-bg": i%2===0?"transparent":"var(--color-background-secondary)" }}>
                    <td className="vi-td-bold">{inv.vendor_invoice_no}</td>
                    <td className="vi-td">{inv.po_number}</td>
                    <td className="vi-td">{inv.vendor_name}</td>
                    <td className="vi-td">{inv.invoice_date ? formatDate(inv.invoice_date) : "-"}</td>
                    <td className="vi-td-total-bold">Rs. {parseFloat(inv.total_amount).toLocaleString()}</td>
                    <td className="vi-td-paid">Rs. {parseFloat(inv.paid_amount).toLocaleString()}</td>
                    <td className="vi-td-balance" style={{ "--balance-color": balance>0?"#ef4444":"var(--text-muted)", "--balance-weight": balance>0?600:400 }}>Rs. {balance.toLocaleString()}</td>
                    <td className="vi-td-badge"><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="vi-td-badge"><button className="btn btn-ghost btn-sm" onClick={()=>openDetail(inv.id)}>View</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreate && (
        <div className="vi-modal-overlay">
          <div className="vi-modal-box">
            <div className="vi-modal-header">
              <div className="vi-modal-title">Record Vendor Invoice</div>
              <button className="vi-close-btn" onClick={()=>setShowCreate(false)}>×</button>
            </div>
            <div className="vi-modal-body">
              {/* PO Selection */}
              <div className="vi-field-wrap">
                <label className="vi-field-label">Purchase Order *</label>
                <select className="form-input" value={selectedPO?.id||""} onChange={e=>{const po=pos.find(p=>p.id===parseInt(e.target.value));selectPO(po||null);}}>
                  <option value="">— Select PO —</option>
                  {pos.map(p=><option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name} ({p.status})</option>)}
                </select>
              </div>

              {selectedPO && (
                <>
                  <div className="vi-po-grid">
                    <div>
                      <label className="vi-field-label">Vendor Invoice # *</label>
                      <input className="form-input" placeholder="e.g. INV-2024-001" value={form.vendor_invoice_no} onChange={e=>setForm(f=>({...f,vendor_invoice_no:e.target.value}))} />
                    </div>
                    <div>
                      <label className="vi-field-label">Invoice Date *</label>
                      <DatePicker value={form.invoice_date} onChange={val=>setForm(f=>({...f,invoice_date:val}))} />
                    </div>
                    <div>
                      <label className="vi-field-label">Linked GRN</label>
                      <select className="form-input" value={form.grn_id} onChange={e=>setForm(f=>({...f,grn_id:e.target.value}))}>
                        <option value="">— None —</option>
                        {grns.map(g=><option key={g.id} value={g.id}>{g.grn_number} ({g.received_date ? formatDate(g.received_date) : "-"})</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="vi-line-items-wrap">
                    <div className="vi-line-items-header">
                      <div className="vi-line-items-label">Line Items</div>
                      <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Row</button>
                    </div>
                    <table className="vi-items-table">
                      <thead>
                        <tr className="vi-items-th-row">
                          {["Description","Qty","Unit Price","Tax %","Amount",""].map(h=><th key={h} className="vi-items-th">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item,idx)=>{
                          const amt = (parseFloat(item.quantity||0)*parseFloat(item.unit_price||0)*(1+parseFloat(item.tax_percent||0)/100)).toFixed(2);
                          return (
                            <tr key={idx} className="vi-items-tr">
                              <td className="vi-item-cell"><input className="form-input vi-item-input" value={item.description} onChange={e=>updateItem(idx,"description",e.target.value)} /></td>
                              <td className="vi-item-cell-w70"><input type="number" className="form-input vi-item-input" value={item.quantity} onChange={e=>updateItem(idx,"quantity",e.target.value)} /></td>
                              <td className="vi-item-cell-w100"><input type="number" className="form-input vi-item-input" value={item.unit_price} onChange={e=>updateItem(idx,"unit_price",e.target.value)} /></td>
                              <td className="vi-item-cell-w70"><input type="number" className="form-input vi-item-input" value={item.tax_percent} onChange={e=>updateItem(idx,"tax_percent",e.target.value)} /></td>
                              <td className="vi-item-amount-cell">Rs. {amt}</td>
                              <td className="vi-item-cell">{items.length>1&&<button className="btn btn-ghost btn-sm vi-remove-btn" onClick={()=>removeItem(idx)}>×</button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="vi-totals-row">
                      <div className="vi-totals-subtext">Subtotal: <strong>Rs. {tots.subtotal}</strong></div>
                      <div className="vi-totals-subtext">Tax: <strong>Rs. {tots.tax}</strong></div>
                      <div className="vi-totals-grand">Total: Rs. {tots.total}</div>
                    </div>
                  </div>

                  <div>
                    <label className="vi-field-label">Notes</label>
                    <textarea className="form-input" rows={2} placeholder="Optional" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                  </div>
                </>
              )}
            </div>
            <div className="vi-modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary vi-btn-white" disabled={saving||!selectedPO} onClick={submitInvoice}>
                {saving?"Saving...":"Record Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="vi-modal-overlay">
          <div className="vi-detail-modal-box">
            {/* Header */}
            <div className="vi-detail-header-wrap">
              <div className="vi-detail-header-top">
                <div>
                  <div className="vi-detail-number">{detail.vendor_invoice_no}</div>
                  <div className="vi-detail-meta">
                    {detail.vendor_name} · PO: {detail.po_number}{detail.grn_number?` · GRN: ${detail.grn_number}`:""}
                  </div>
                </div>
                <div className="vi-detail-actions">
                  <span className={`badge ${statusBadge(detail.status).cls}`}>{statusBadge(detail.status).label}</span>
                  {wfStep ? (
                    <>
                      {wfStep.step_type === "payment" ? (
                        <button className="btn btn-primary btn-sm vi-payment-btn" onClick={()=>setPayModal(true)}>
                          {wfStep.action_label || "Record Payment"}
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm vi-btn-white" disabled={acting}
                          onClick={()=>act(wfStep.step_type)}>
                          {wfStep.action_label || wfStep.step_name || wfStep.step_type}
                        </button>
                      )}
                      {wfStep.can_reject !== false && (
                        <button className="btn btn-sm vi-dispute-btn-small" disabled={acting}
                          onClick={()=>act("dispute")}>
                          {wfStep.reject_label || "Dispute"}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {detail.status==="pending"&&<button className="btn btn-primary btn-sm vi-btn-white" disabled={acting} onClick={()=>act("verify")}>Verify</button>}
                      {detail.status==="verified"&&can("finance.manage")&&<button className="btn btn-primary btn-sm vi-approve-btn" disabled={acting} onClick={()=>act("approve")}>Approve</button>}
                    </>
                  )}
                  {detail.status==="approved"&&(!wfExists||wfDone)&&can("finance.manage")&&parseFloat(detail.paid_amount||0)<parseFloat(detail.total_amount||0)&&<button className="btn btn-primary btn-sm vi-payment-btn" onClick={()=>setPayModal(true)}>Record Payment</button>}
                  {["pending","verified"].includes(detail.status)&&<button className="btn btn-ghost btn-sm vi-dispute-btn" onClick={()=>setDispute(true)}>Dispute</button>}
                  {["pending","disputed"].includes(detail.status)&&<button className="btn btn-ghost btn-sm vi-cancel-btn" disabled={acting} onClick={()=>act("cancel")}>Cancel</button>}
                  <button className="vi-small-close-btn" onClick={()=>setDetail(null)}>×</button>
                </div>
              </div>
            </div>

            <div className="vi-detail-body">
              {/* Info Grid */}
              <div className="vi-info-grid">
                {[
                  { label:"Invoice Date", value:detail.invoice_date ? formatDate(detail.invoice_date) : "-" },
                  { label:"Received Date", value:detail.received_date ? formatDate(detail.received_date) : "-" },
                  { label:"PO Total", value:`Rs. ${parseFloat(detail.po_total_amount||0).toLocaleString()}` },
                  { label:"Subtotal", value:`Rs. ${parseFloat(detail.subtotal||0).toLocaleString()}` },
                  { label:"Tax", value:`Rs. ${parseFloat(detail.tax_amount||0).toLocaleString()}` },
                  { label:"Total", value:<span className="vi-total-value">Rs. {parseFloat(detail.total_amount||0).toLocaleString()}</span> },
                  { label:"Paid", value:<span className="vi-paid-value">Rs. {parseFloat(detail.paid_amount||0).toLocaleString()}</span> },
                  { label:"Balance", value:<span className="vi-balance-value" style={{ "--balance-color": parseFloat(detail.balance||0)>0?"#ef4444":"#059669" }}>Rs. {parseFloat(detail.balance||0).toLocaleString()}</span> },
                  { label:"Created By", value:detail.created_by_name },
                ].map(({label,value})=>(
                  <div key={label} className="vi-info-box">
                    <div className="vi-info-label">{label}</div>
                    <div className="vi-info-value">{value}</div>
                  </div>
                ))}
              </div>

              {detail.dispute_reason && (
                <div className="vi-dispute-reason-box">
                  <div className="vi-dispute-reason-label">DISPUTE REASON</div>
                  <div className="vi-dispute-reason-text">{detail.dispute_reason}</div>
                </div>
              )}

              {/* Line Items */}
              {detail.items?.length > 0 && (
                <div className="vi-section-mb20">
                  <div className="vi-items-section-label">Line Items</div>
                  <table className="vi-items-table">
                    <thead>
                      <tr className="vi-items-th-row">
                        {["Description","Qty","Unit Price","Tax","Amount"].map(h=><th key={h} className="vi-items-th-pad">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map(item=>(
                        <tr key={item.id} className="vi-items-tr">
                          <td className="vi-item-td-pad">{item.description}</td>
                          <td className="vi-item-td-pad">{item.quantity}</td>
                          <td className="vi-item-td-pad">Rs. {parseFloat(item.unit_price).toLocaleString()}</td>
                          <td className="vi-item-td-pad">{item.tax_percent}%</td>
                          <td className="vi-item-amount-blue">Rs. {parseFloat(item.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment History */}
              {detail.payments?.length > 0 && (
                <div>
                  <div className="vi-payment-history-label">Payment History</div>
                  {detail.payments.map(p=>(
                    <div key={p.id} className="vi-payment-row">
                      <div>
                        <div className="vi-payment-amount">Rs. {parseFloat(p.amount).toLocaleString()}</div>
                        <div className="vi-payment-meta">{METHOD_LABELS[p.payment_method]||p.payment_method} · {p.payment_date ? formatDate(p.payment_date) : "-"}{p.reference?` · Ref: ${p.reference}`:""}</div>
                      </div>
                      <div className="vi-payment-by">{p.paid_by_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayModal && detail && (
        <div className="vi-modal-overlay-top">
          <div className="vi-pay-modal-box">
            <div className="vi-modal-header-sm">
              <div className="vi-modal-title-sm">Record Payment</div>
              <button className="vi-close-btn" onClick={()=>setPayModal(false)}>×</button>
            </div>
            <div className="vi-modal-body">
              <div className="vi-balance-due-box">
                Balance due: <strong className="vi-balance-due-value">Rs. {parseFloat(detail.balance||0).toLocaleString()}</strong>
              </div>
              <div className="vi-form-grid">
                <div>
                  <label className="vi-field-label">Amount *</label>
                  <input type="number" className="form-input" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} />
                </div>
                <div>
                  <label className="vi-field-label">Payment Date</label>
                  <DatePicker value={payForm.payment_date||processingToday} onChange={val=>setPayForm(f=>({...f,payment_date:val}))} />
                </div>
              </div>
              <div className="vi-form-grid">
                <div>
                  <label className="vi-field-label">Method</label>
                  <select className="form-input" value={payForm.payment_method} onChange={e=>setPayForm(f=>({...f,payment_method:e.target.value}))}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="vi-field-label">Reference #</label>
                  <input className="form-input" placeholder="Transaction ref" value={payForm.reference} onChange={e=>setPayForm(f=>({...f,reference:e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="vi-field-label">Notes</label>
                <input className="form-input" value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} />
              </div>
            </div>
            <div className="vi-modal-footer">
              <button className="btn btn-ghost" onClick={()=>setPayModal(false)}>Cancel</button>
              <button className="btn btn-primary vi-btn-white" disabled={saving} onClick={recordPayment}>{saving?"Saving...":"Record Payment"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModal && (
        <div className="vi-modal-overlay-top">
          <div className="vi-dispute-modal-box">
            <div className="vi-dispute-modal-header">Dispute Invoice</div>
            <div className="vi-modal-body">
              <label className="vi-field-label-mb8">Reason for dispute *</label>
              <textarea className="form-input" rows={4} placeholder="Describe the discrepancy or issue..." value={disputeReason} onChange={e=>setDR(e.target.value)} />
            </div>
            <div className="vi-modal-footer">
              <button className="btn btn-ghost" onClick={()=>setDispute(false)}>Cancel</button>
              <button className="btn btn-primary vi-dispute-submit-btn" disabled={acting||!disputeReason.trim()} onClick={()=>act("dispute",{reason:disputeReason})}>
                {acting?"Submitting...":"Submit Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
