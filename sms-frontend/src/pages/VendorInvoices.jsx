import React, { useState, useEffect, useCallback } from "react";
import procurementApi from "../api/procurementApi";
import workflowApi from "../api/workflowApi";
import { useAutoOpenById } from "../hooks/useAutoOpenById";
import { useAuth } from "../auth/AuthContext";

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
    setForm({ vendor_invoice_no:"", invoice_date:new Date().toISOString().slice(0,10), grn_id:"", notes:"" });
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
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h1 className="page-heading">Vendor Invoices</h1>
          <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginTop:4 }}>
            Track and process vendor invoices against purchase orders
          </div>
        </div>
        <button className="btn btn-primary" style={{ color:"#fff" }} onClick={openCreate}>+ Record Invoice</button>
      </div>

      {flash && <div className={`alert alert-${flash.type}`} style={{ marginBottom:16 }}>{flash.msg}</div>}

      {/* Filters */}
      <div className="section-card" style={{ marginBottom:16, padding:"12px 16px" }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[{label:"All",value:""},{label:"Pending",value:"pending"},{label:"Verified",value:"verified"},{label:"Approved",value:"approved"},{label:"Paid",value:"paid"},{label:"Disputed",value:"disputed"}].map(f => (
            <button key={f.value} className={`btn btn-sm ${statusFilter===f.value?"btn-primary":"btn-ghost"}`}
              style={statusFilter===f.value?{color:"#fff"}:{}} onClick={()=>setStatus(f.value)}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Invoices List */}
      {loading ? (
        <div className="section-card" style={{ textAlign:"center",padding:40,color:"var(--color-text-secondary)" }}>Loading...</div>
      ) : invoices.length===0 ? (
        <div className="section-card" style={{ textAlign:"center",padding:48 }}>
          <div style={{ fontSize:36,marginBottom:12 }}>🧾</div>
          <div style={{ fontWeight:600,marginBottom:6 }}>No vendor invoices yet</div>
          <div style={{ color:"var(--color-text-secondary)",fontSize:13 }}>Record a vendor invoice against an issued Purchase Order.</div>
        </div>
      ) : (
        <div className="section-card" style={{ padding:0,overflow:"hidden" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"var(--color-background-secondary)",borderBottom:"1px solid var(--color-border-primary)" }}>
                {["Invoice #","PO #","Vendor","Date","Total","Paid","Balance","Status",""].map(h => (
                  <th key={h} style={{ padding:"10px 14px",textAlign:"left",fontSize:12,fontWeight:600,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv,i) => {
                const {cls,label} = statusBadge(inv.status);
                const balance = parseFloat(inv.balance||0);
                return (
                  <tr key={inv.id} style={{ borderBottom:"1px solid var(--color-border-primary)",background:i%2===0?"transparent":"var(--color-background-secondary)" }}>
                    <td style={{ padding:"10px 14px",fontWeight:600,fontSize:13 }}>{inv.vendor_invoice_no}</td>
                    <td style={{ padding:"10px 14px",fontSize:13 }}>{inv.po_number}</td>
                    <td style={{ padding:"10px 14px",fontSize:13 }}>{inv.vendor_name}</td>
                    <td style={{ padding:"10px 14px",fontSize:13 }}>{inv.invoice_date}</td>
                    <td style={{ padding:"10px 14px",fontSize:13,fontWeight:600 }}>Rs. {parseFloat(inv.total_amount).toLocaleString()}</td>
                    <td style={{ padding:"10px 14px",fontSize:13,color:"#059669" }}>Rs. {parseFloat(inv.paid_amount).toLocaleString()}</td>
                    <td style={{ padding:"10px 14px",fontSize:13,color:balance>0?"#ef4444":"#94a3b8",fontWeight:balance>0?600:400 }}>Rs. {balance.toLocaleString()}</td>
                    <td style={{ padding:"10px 14px" }}><span className={`badge ${cls}`}>{label}</span></td>
                    <td style={{ padding:"10px 14px" }}><button className="btn btn-ghost btn-sm" onClick={()=>openDetail(inv.id)}>View</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreate && (
        <div style={{ position:"fixed",inset:0,zIndex:1010,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
          <div style={{ background:"#fff",borderRadius:12,width:"100%",maxWidth:780,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding:"18px 24px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ fontWeight:700,fontSize:16 }}>Record Vendor Invoice</div>
              <button style={{ background:"none",border:"none",fontSize:20,cursor:"pointer" }} onClick={()=>setShowCreate(false)}>×</button>
            </div>
            <div style={{ padding:"20px 24px" }}>
              {/* PO Selection */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Purchase Order *</label>
                <select className="form-input" value={selectedPO?.id||""} onChange={e=>{const po=pos.find(p=>p.id===parseInt(e.target.value));selectPO(po||null);}}>
                  <option value="">— Select PO —</option>
                  {pos.map(p=><option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name} ({p.status})</option>)}
                </select>
              </div>

              {selectedPO && (
                <>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16 }}>
                    <div>
                      <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Vendor Invoice # *</label>
                      <input className="form-input" placeholder="e.g. INV-2024-001" value={form.vendor_invoice_no} onChange={e=>setForm(f=>({...f,vendor_invoice_no:e.target.value}))} />
                    </div>
                    <div>
                      <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Invoice Date *</label>
                      <input type="date" className="form-input" value={form.invoice_date} onChange={e=>setForm(f=>({...f,invoice_date:e.target.value}))} />
                    </div>
                    <div>
                      <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Linked GRN</label>
                      <select className="form-input" value={form.grn_id} onChange={e=>setForm(f=>({...f,grn_id:e.target.value}))}>
                        <option value="">— None —</option>
                        {grns.map(g=><option key={g.id} value={g.id}>{g.grn_number} ({g.received_date})</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                      <div style={{ fontSize:13,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em" }}>Line Items</div>
                      <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Row</button>
                    </div>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#f8fafc" }}>
                          {["Description","Qty","Unit Price","Tax %","Amount",""].map(h=><th key={h} style={{ padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:600,color:"var(--color-text-secondary)",textTransform:"uppercase" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item,idx)=>{
                          const amt = (parseFloat(item.quantity||0)*parseFloat(item.unit_price||0)*(1+parseFloat(item.tax_percent||0)/100)).toFixed(2);
                          return (
                            <tr key={idx} style={{ borderBottom:"1px solid #f1f5f9" }}>
                              <td style={{ padding:"6px 4px" }}><input className="form-input" style={{ margin:0 }} value={item.description} onChange={e=>updateItem(idx,"description",e.target.value)} /></td>
                              <td style={{ padding:"6px 4px",width:70 }}><input type="number" className="form-input" style={{ margin:0 }} value={item.quantity} onChange={e=>updateItem(idx,"quantity",e.target.value)} /></td>
                              <td style={{ padding:"6px 4px",width:100 }}><input type="number" className="form-input" style={{ margin:0 }} value={item.unit_price} onChange={e=>updateItem(idx,"unit_price",e.target.value)} /></td>
                              <td style={{ padding:"6px 4px",width:70 }}><input type="number" className="form-input" style={{ margin:0 }} value={item.tax_percent} onChange={e=>updateItem(idx,"tax_percent",e.target.value)} /></td>
                              <td style={{ padding:"6px 10px",fontWeight:600,color:"#2563eb" }}>Rs. {amt}</td>
                              <td style={{ padding:"6px 4px" }}>{items.length>1&&<button className="btn btn-ghost btn-sm" style={{ color:"#ef4444" }} onClick={()=>removeItem(idx)}>×</button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ display:"flex",justifyContent:"flex-end",marginTop:12,gap:16 }}>
                      <div style={{ fontSize:13,color:"var(--color-text-secondary)" }}>Subtotal: <strong>Rs. {tots.subtotal}</strong></div>
                      <div style={{ fontSize:13,color:"var(--color-text-secondary)" }}>Tax: <strong>Rs. {tots.tax}</strong></div>
                      <div style={{ fontSize:15,fontWeight:800,color:"#2563eb" }}>Total: Rs. {tots.total}</div>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Notes</label>
                    <textarea className="form-input" rows={2} placeholder="Optional" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                  </div>
                </>
              )}
            </div>
            <div style={{ padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"flex-end",gap:10,background:"#f8fafc" }}>
              <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ color:"#fff" }} disabled={saving||!selectedPO} onClick={submitInvoice}>
                {saving?"Saving...":"Record Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div style={{ position:"fixed",inset:0,zIndex:1010,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
          <div style={{ background:"#fff",borderRadius:12,width:"100%",maxWidth:720,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            {/* Header */}
            <div style={{ padding:"16px 24px",borderBottom:"1px solid #e2e8f0" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontWeight:700,fontSize:16 }}>{detail.vendor_invoice_no}</div>
                  <div style={{ fontSize:12,color:"var(--color-text-secondary)",marginTop:2 }}>
                    {detail.vendor_name} · PO: {detail.po_number}{detail.grn_number?` · GRN: ${detail.grn_number}`:""}
                  </div>
                </div>
                <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end" }}>
                  <span className={`badge ${statusBadge(detail.status).cls}`}>{statusBadge(detail.status).label}</span>
                  {wfStep ? (
                    <>
                      {wfStep.step_type === "payment" ? (
                        <button className="btn btn-primary btn-sm" style={{ color:"#fff",background:"#2563eb" }} onClick={()=>setPayModal(true)}>
                          {wfStep.action_label || "Record Payment"}
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" style={{ color:"#fff" }} disabled={acting}
                          onClick={()=>act(wfStep.step_type)}>
                          {wfStep.action_label || wfStep.step_name || wfStep.step_type}
                        </button>
                      )}
                      {wfStep.can_reject !== false && (
                        <button className="btn btn-sm" style={{ color:"#dc2626",marginLeft:4 }} disabled={acting}
                          onClick={()=>act("dispute")}>
                          {wfStep.reject_label || "Dispute"}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {detail.status==="pending"&&<button className="btn btn-primary btn-sm" style={{ color:"#fff" }} disabled={acting} onClick={()=>act("verify")}>Verify</button>}
                      {detail.status==="verified"&&can("finance.manage")&&<button className="btn btn-primary btn-sm" style={{ color:"#fff",background:"#059669" }} disabled={acting} onClick={()=>act("approve")}>Approve</button>}
                    </>
                  )}
                  {detail.status==="approved"&&(!wfExists||wfDone)&&can("finance.manage")&&parseFloat(detail.paid_amount||0)<parseFloat(detail.total_amount||0)&&<button className="btn btn-primary btn-sm" style={{ color:"#fff",background:"#2563eb" }} onClick={()=>setPayModal(true)}>Record Payment</button>}
                  {["pending","verified"].includes(detail.status)&&<button className="btn btn-ghost btn-sm" style={{ color:"#ef4444" }} onClick={()=>setDispute(true)}>Dispute</button>}
                  {["pending","disputed"].includes(detail.status)&&<button className="btn btn-ghost btn-sm" style={{ color:"#94a3b8" }} disabled={acting} onClick={()=>act("cancel")}>Cancel</button>}
                  <button style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",marginLeft:4 }} onClick={()=>setDetail(null)}>×</button>
                </div>
              </div>
            </div>

            <div style={{ padding:"20px 24px" }}>
              {/* Info Grid */}
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20 }}>
                {[
                  { label:"Invoice Date", value:detail.invoice_date },
                  { label:"Received Date", value:detail.received_date },
                  { label:"PO Total", value:`Rs. ${parseFloat(detail.po_total_amount||0).toLocaleString()}` },
                  { label:"Subtotal", value:`Rs. ${parseFloat(detail.subtotal||0).toLocaleString()}` },
                  { label:"Tax", value:`Rs. ${parseFloat(detail.tax_amount||0).toLocaleString()}` },
                  { label:"Total", value:<span style={{ fontWeight:800,fontSize:15,color:"#2563eb" }}>Rs. {parseFloat(detail.total_amount||0).toLocaleString()}</span> },
                  { label:"Paid", value:<span style={{ color:"#059669",fontWeight:700 }}>Rs. {parseFloat(detail.paid_amount||0).toLocaleString()}</span> },
                  { label:"Balance", value:<span style={{ color:parseFloat(detail.balance||0)>0?"#ef4444":"#059669",fontWeight:700 }}>Rs. {parseFloat(detail.balance||0).toLocaleString()}</span> },
                  { label:"Created By", value:detail.created_by_name },
                ].map(({label,value})=>(
                  <div key={label} style={{ background:"#f8fafc",borderRadius:8,padding:"8px 12px" }}>
                    <div style={{ fontSize:11,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:13 }}>{value}</div>
                  </div>
                ))}
              </div>

              {detail.dispute_reason && (
                <div style={{ background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:"#991b1b",marginBottom:4 }}>DISPUTE REASON</div>
                  <div style={{ fontSize:13,color:"#7f1d1d" }}>{detail.dispute_reason}</div>
                </div>
              )}

              {/* Line Items */}
              {detail.items?.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",marginBottom:8 }}>Line Items</div>
                  <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#f8fafc" }}>
                        {["Description","Qty","Unit Price","Tax","Amount"].map(h=><th key={h} style={{ padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:"var(--color-text-secondary)",textTransform:"uppercase" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map(item=>(
                        <tr key={item.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                          <td style={{ padding:"8px 12px" }}>{item.description}</td>
                          <td style={{ padding:"8px 12px" }}>{item.quantity}</td>
                          <td style={{ padding:"8px 12px" }}>Rs. {parseFloat(item.unit_price).toLocaleString()}</td>
                          <td style={{ padding:"8px 12px" }}>{item.tax_percent}%</td>
                          <td style={{ padding:"8px 12px",fontWeight:600,color:"#2563eb" }}>Rs. {parseFloat(item.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment History */}
              {detail.payments?.length > 0 && (
                <div>
                  <div style={{ fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",marginBottom:8 }}>Payment History</div>
                  {detail.payments.map(p=>(
                    <div key={p.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",marginBottom:8,background:"#f0fdf4" }}>
                      <div>
                        <div style={{ fontWeight:600,fontSize:13 }}>Rs. {parseFloat(p.amount).toLocaleString()}</div>
                        <div style={{ fontSize:12,color:"var(--color-text-secondary)" }}>{METHOD_LABELS[p.payment_method]||p.payment_method} · {p.payment_date}{p.reference?` · Ref: ${p.reference}`:""}</div>
                      </div>
                      <div style={{ fontSize:12,color:"var(--color-text-secondary)" }}>{p.paid_by_name}</div>
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
        <div style={{ position:"fixed",inset:0,zIndex:1020,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
          <div style={{ background:"#fff",borderRadius:12,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding:"16px 24px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ fontWeight:700,fontSize:15 }}>Record Payment</div>
              <button style={{ background:"none",border:"none",fontSize:20,cursor:"pointer" }} onClick={()=>setPayModal(false)}>×</button>
            </div>
            <div style={{ padding:"20px 24px" }}>
              <div style={{ background:"#eff6ff",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13 }}>
                Balance due: <strong style={{ color:"#2563eb" }}>Rs. {parseFloat(detail.balance||0).toLocaleString()}</strong>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Amount *</label>
                  <input type="number" className="form-input" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} />
                </div>
                <div>
                  <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Payment Date</label>
                  <input type="date" className="form-input" value={payForm.payment_date||new Date().toISOString().slice(0,10)} onChange={e=>setPayForm(f=>({...f,payment_date:e.target.value}))} />
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Method</label>
                  <select className="form-input" value={payForm.payment_method} onChange={e=>setPayForm(f=>({...f,payment_method:e.target.value}))}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online Transfer</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Reference #</label>
                  <input className="form-input" placeholder="Transaction ref" value={payForm.reference} onChange={e=>setPayForm(f=>({...f,reference:e.target.value}))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:6 }}>Notes</label>
                <input className="form-input" value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} />
              </div>
            </div>
            <div style={{ padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"flex-end",gap:10,background:"#f8fafc" }}>
              <button className="btn btn-ghost" onClick={()=>setPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ color:"#fff" }} disabled={saving} onClick={recordPayment}>{saving?"Saving...":"Record Payment"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModal && (
        <div style={{ position:"fixed",inset:0,zIndex:1020,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
          <div style={{ background:"#fff",borderRadius:12,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding:"16px 24px",borderBottom:"1px solid #e2e8f0",fontWeight:700,fontSize:15 }}>Dispute Invoice</div>
            <div style={{ padding:"20px 24px" }}>
              <label style={{ fontSize:13,fontWeight:600,display:"block",marginBottom:8 }}>Reason for dispute *</label>
              <textarea className="form-input" rows={4} placeholder="Describe the discrepancy or issue..." value={disputeReason} onChange={e=>setDR(e.target.value)} />
            </div>
            <div style={{ padding:"14px 24px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"flex-end",gap:10,background:"#f8fafc" }}>
              <button className="btn btn-ghost" onClick={()=>setDispute(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ color:"#fff",background:"#ef4444" }} disabled={acting||!disputeReason.trim()} onClick={()=>act("dispute",{reason:disputeReason})}>
                {acting?"Submitting...":"Submit Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
