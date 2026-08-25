import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import financeApi  from "../api/financeApi";
import studentsApi from "../api/studentsApi";
import academicsApi from "../api/academicsApi";
import DatePicker from "../components/DatePicker";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import discountsApi from "../api/discountsApi";

// eslint-disable-next-line
const downloadInvoicePdf = async (invoiceId) => {
  try {
    const res = await financeApi.downloadInvoicePdf(invoiceId);
    const url = window.URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
    const a   = document.createElement("a");
    a.href    = url;
    a.download = "invoice_" + invoiceId + ".pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch { alert("Failed to download invoice."); }
};

const TABS = ["dashboard","fee-automation","fee-types","class-fees","charge-types","discount-config","charges","invoices","payments","discounts","locked-accounts","charge-settlement"];
const TAB_LABELS = { dashboard:"Dashboard", "fee-automation":"Auto-Generation", "charge-types":"Charge Types", structures:"Fee Structures", invoices:"Invoices", payments:"Payments" };

export default function Finance() {
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    const handler = e => {
      const s = e.detail?.sub;
      if (TABS.includes(s)) setTab(s);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Finance Management</h1>
      </div>
      {tab === "dashboard"   && <DashboardTab />}
      {tab === "structures"  && <StructuresTab />}
      {tab === "invoices"    && <InvoicesTab />}
      {tab === "payments"    && <PaymentsTab />}
      {tab === "discounts"   && <DiscountsTab />}
      {tab === "locked-accounts" && <LockedAccountsTab />}
      {tab === "charge-settlement" && <ChargeSettlementTab />}
          {tab === "fee-types"      && <FeeTypesTab />}
          {tab === "class-fees"     && <ClassFeesTab />}
          {tab === "fee-automation" && <FeeAutomationTab />}
          {tab === "charge-types" && <ChargeTypesTab />}
          {tab === "discount-config"&& <DiscountConfigTab />}
          {tab === "charges"      && <ChargesTab />}
    </div>
  );
}

/* â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function FeeAutomationTab() {
  const processingToday = useProcessingToday();
  const [settings, setSettings] = useState(null);
  const [enabled,  setEnabled]  = useState(false);
  const [day,      setDay]      = useState(1);
  const [time,     setTime]     = useState("01:00");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState("");

  const [manualMonth, setManualMonth] = useState(() => new Date().toISOString().slice(0,7));
  useEffect(() => { setManualMonth(processingToday.slice(0,7)); }, [processingToday]);
  const [generating,  setGenerating]  = useState(false);
  const [genMsg,      setGenMsg]      = useState("");

  const load = () => {
    setLoading(true);
    financeApi.getAutoGenerateSettings()
      .then(r => {
        const d = r.data.data;
        setSettings(d);
        setEnabled(d.enabled);
        setDay(d.day);
        setTime(d.time || "01:00");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await financeApi.updateAutoGenerateSettings({ enabled, day, time });
      setMsg(res.data.message);
      load();
    } catch (err) {
      setMsg(err.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  const handleTestNow = async () => {
    if (!window.confirm("Run the auto-generation check right now, ignoring the configured day/time (the same-month duplicate guard still applies)?")) return;
    setTesting(true);
    try {
      const res = await financeApi.runAutoGenerateNow();
      setTestMsg(res.data.message);
      load();
    } catch (err) {
      setTestMsg(err.response?.data?.message || "Test run failed.");
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(""), 6000);
    }
  };

  const handleManualGenerate = async () => {
    const [y, m] = manualMonth.split("-");
    const yearNum = Number(y);
    const monthNum = Number(m);
    const monthName = new Date(yearNum, monthNum-1, 1).toLocaleString("en-US", { month:"long", year:"numeric" });
    if (!window.confirm("Generate invoices for " + monthName + "? Students who already have an invoice for this month will be skipped.")) return;
    setGenerating(true);
    try {
      const res = await financeApi.generateSmartMonthly({ year: yearNum, month: monthNum });
      setGenMsg(res.data.message);
      load();
    } catch (err) {
      setGenMsg(err.response?.data?.message || "Failed.");
    } finally {
      setGenerating(false);
      setTimeout(() => setGenMsg(""), 5000);
    }
  };

  if (loading) return <div className="loading-state">Loading settings...</div>;

  const lastRunLabel = settings?.last_run
    ? new Date(settings.last_run + "-01").toLocaleString("en-US", { month:"long", year:"numeric" })
    : "Never run yet";

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="section-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Automatic Monthly Invoice Generation</h3>
        <p style={{ color: "#666", fontSize: 14 }}>
          When enabled, the system automatically generates this month's fee invoices for every active student
          (using the same logic as the manual button below) on the day you choose, once per month.
          Students who already have an invoice for that month are skipped.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
          <input
            type="checkbox"
            id="auto-gen-toggle"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor="auto-gen-toggle" style={{ fontWeight: 600 }}>
            Enable automatic monthly fee generation
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <label style={{ fontWeight: 600 }}>Generate on day</label>
          <select value={day} onChange={e => setDay(Number(e.target.value))} disabled={!enabled} style={{ padding: "6px 10px" }}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span style={{ color: "#666", fontSize: 13 }}>of each month (31 = last day of any month, including short months)</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <label style={{ fontWeight: 600 }}>At time</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            disabled={!enabled}
            style={{ padding: "6px 10px" }}
          />
          <span style={{ color: "#666", fontSize: 13 }}>(checked every 15 minutes, so may run up to ~15 min after this time)</span>
        </div>

        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          Last auto-run: <strong>{lastRunLabel}</strong>
        </div>

        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {msg && <span style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
        {testMsg && <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>{testMsg}</div>}
      </div>

      <div className="section-card">
        <h3 style={{ marginTop: 0 }}>Generate For a Specific Month</h3>
        <p style={{ color: "#666", fontSize: 14 }}>
          Use this to catch up on past months or generate ahead for a future month. Duplicates are skipped automatically.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="month"
            value={manualMonth}
            onChange={e => setManualMonth(e.target.value)}
            style={{ padding: "6px 10px" }}
          />
          <button className="btn btn-secondary" disabled={generating} onClick={handleManualGenerate}>
            {generating ? "Generating..." : "Generate Invoices"}
          </button>
        </div>
        {genMsg && <div style={{ marginTop: 10, fontSize: 13 }}>{genMsg}</div>}
      </div>
    </div>
  );
}

function DashboardTab() {
  const processingToday = useProcessingToday();
  const [generating, setGenerating] = React.useState(false);
  const [genMsg,     setGenMsg]     = React.useState("");

  const handleGenerateMonthly = async () => {
    const month = new Date(processingToday).toLocaleString("en-US", { month:"long", year:"numeric" });
    if (!window.confirm("Generate monthly invoices for " + month + "? Duplicates will be skipped.")) return;
    setGenerating(true);
    try {
      const res = await financeApi.generateMonthly();
      setGenMsg(res.data.message);
      setTimeout(() => setGenMsg(""), 5000);
    } catch (err) {
      setGenMsg(err.response?.data?.message || "Failed.");
      setTimeout(() => setGenMsg(""), 5000);
    } finally { setGenerating(false); }
  };
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    financeApi.getDashboard()
      .then(r => setStats(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Loading finance dashboard...</div>;
  if (!stats)  return <div className="empty-state">No data available.</div>;

  const monthName = new Date(processingToday).toLocaleString("en-US", { month:"long", year:"numeric" });
  const collected_pct = stats.total_billed > 0
    ? Math.round((stats.total_collected / stats.total_billed) * 100)
    : 0;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Finance Dashboard</h2>
          <div style={{ fontSize:12, color:"#64748b" }}>{monthName}</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {genMsg && <span className="badge badge-success">{genMsg}</span>}
          <button className="btn btn-primary" onClick={handleGenerateMonthly} disabled={generating}>
            {generating ? "Generating..." : "Generate Monthly Invoices"}
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom:20 }}>
        {[
          { label:"Total Billed",      value:"Rs. " + Number(stats.total_billed).toLocaleString(),    color:"#2563eb" },
          { label:"Total Collected",   value:"Rs. " + Number(stats.total_collected).toLocaleString(), color:"#16a34a" },
          { label:"Collected Today",   value:"Rs. " + Number(stats.collected_today).toLocaleString(), color:"#0891b2" },
          { label:"Collected (Month)", value:"Rs. " + Number(stats.collected_month).toLocaleString(), color:"#7c3aed" },
          { label:"Pending Verification", value:"Rs. " + Number(stats.pending_verification_amount).toLocaleString() + " (" + stats.pending_verification_count + ")", color:"#d97706" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderTop:"3px solid " + s.color }}>
            <div className="stat-card-value" style={{ color:s.color, fontSize:18 }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Invoice Status</span>
          </div>
          {[
            { label:"Paid",      value: stats.paid_invoices,    color:"#16a34a", bg:"#f0fdf4" },
            { label:"Unpaid",    value: stats.unpaid_invoices,  color:"#dc2626", bg:"#fef2f2" },
            { label:"Partial",   value: stats.partial_invoices, color:"#d97706", bg:"#fffbeb" },
            { label:"Overdue",   value: stats.overdue_invoices, color:"#7c3aed", bg:"#f5f3ff" },
            { label:"Pending Verification", value: stats.pending_verification_invoices, color:"#0891b2", bg:"#ecfeff" },
          ].map(s => (
            <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid #f1f5f9" }}>
              <span style={{ fontSize:13, color:"#64748b" }}>{s.label}</span>
              <span style={{ fontSize:13, fontWeight:700, background:s.bg, color:s.color, padding:"2px 10px", borderRadius:20 }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Collection Rate</span>
          </div>
          <div style={{ textAlign:"center", padding:"16px 0" }}>
            <div style={{ fontSize:48, fontWeight:800, color: collected_pct >= 80 ? "#16a34a" : collected_pct >= 50 ? "#d97706" : "#dc2626" }}>
              {collected_pct}%
            </div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>of total billed amount collected</div>
            <div style={{ height:10, background:"#f1f5f9", borderRadius:5, marginTop:16, overflow:"hidden" }}>
              <div style={{ height:"100%", width:collected_pct + "%", background: collected_pct >= 80 ? "#16a34a" : collected_pct >= 50 ? "#d97706" : "#dc2626", borderRadius:5, transition:"width 0.5s" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:11, color:"#94a3b8" }}>
              <span>Rs. 0</span>
              <span>Rs. {Number(stats.total_billed).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* â”€â”€ Fee Structures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function StructuresTab() {
  const { can } = useAuth();
  const [structures,  setStructures]  = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [years,       setYears]       = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editItem,    setEditItem]    = useState(null);
  const [form,        setForm]        = useState({ name:"", amount:"", frequency:"monthly", fee_category_id:"", academic_year_id:"", class_id:"", description:"" });
  const [saving,      setSaving]      = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [st, cat, yr, cls] = await Promise.all([
        financeApi.getStructures(),
        financeApi.getCategories(),
        academicsApi.getYears(),
        academicsApi.getClasses(),
      ]);
      setStructures(st.data.data   || []);
      setCategories(cat.data.data  || []);
      setYears(yr.data.data        || []);
      setClasses(cls.data.data     || []);
    } catch {} finally { setLoading(false); }
  };

  const openCreate = () => { setEditItem(null); setForm({ name:"", amount:"", frequency:"monthly", fee_category_id:"", academic_year_id:"", class_id:"", description:"" }); setShowForm(true); };
  const openEdit   = s  => { setEditItem(s); setForm({ name:s.name, amount:s.amount, frequency:s.frequency||"monthly", fee_category_id:s.fee_category_id||"", academic_year_id:s.academic_year_id||"", class_id:s.class_id||"", description:s.description||"" }); setShowForm(true); };

  const handleSubmit = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editItem) { await financeApi.updateStructure(editItem.id, form); setSuccess("Updated."); }
      else          { await financeApi.createStructure(form);              setSuccess("Created."); }
      setShowForm(false); fetchData(); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!window.confirm("Deactivate this fee structure?")) return;
    try { await financeApi.deleteStructure(id); setSuccess("Deactivated."); fetchData(); setTimeout(() => setSuccess(""), 3000); }
    catch { setError("Failed to deactivate."); }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Fee Structures</h2>
        {can("finance.manage") && <button className="btn btn-primary" onClick={openCreate}>+ New Structure</button>}
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">{editItem ? "Edit" : "Create"} Fee Structure</span>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required placeholder="e.g. Monthly Tuition Grade 5" />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (Rs.) *</label>
                <input className="form-control" type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label className="form-label">Frequency</label>
                <select className="form-control" value={form.frequency} onChange={e => setForm({...form, frequency:e.target.value})}>
                  <option value="monthly">Monthly</option>
                  <option value="termly">Termly</option>
                  <option value="annually">Annually</option>
                  <option value="once">One-time</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={form.fee_category_id} onChange={e => setForm({...form, fee_category_id:e.target.value})}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Academic Year</label>
                <select className="form-control" value={form.academic_year_id} onChange={e => setForm({...form, academic_year_id:e.target.value})}>
                  <option value="">Select year</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class (optional)</label>
                <select className="form-control" value={form.class_id} onChange={e => setForm({...form, class_id:e.target.value})}>
                  <option value="">All classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " ("+c.section+")" : ""}</option>)}
                </select>
              </div>
              <div className="form-group form-grid-full">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Optional description" />
              </div>
              
              <div className="form-group">
                <label className="form-label">Late Fee Type</label>
                <select className="form-control" value={form.late_fee_type} onChange={e => setForm({...form, late_fee_type:e.target.value})}>
                  <option value="none">No late fee</option>
                  <option value="fixed">Fixed amount (Rs.)</option>
                  <option value="percentage">Percentage of amount (%)</option>
                </select>
              </div>
              {form.late_fee_type !== "none" && (
                <div className="form-group">
                  <label className="form-label">{form.late_fee_type === "fixed" ? "Late Fee Amount (Rs.)" : "Percentage (%)"}</label>
                  <input className="form-control" type="number" min="0" value={form.late_fee_amount} onChange={e => setForm({...form, late_fee_amount:e.target.value})} placeholder={form.late_fee_type === "fixed" ? "e.g. 100" : "e.g. 5"} />
                </div>
              )}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editItem ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-state">Loading...</div>
      : structures.length === 0 ? <div className="empty-state">No fee structures. Create one above.</div>
      : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Class</th>
                <th>Year</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.description && <div style={{ fontSize:11, color:"#94a3b8" }}>{s.description}</div>}</td>
                  <td>{s.category_name || <span style={{ color:"#94a3b8" }}>N/A</span>}</td>
                  <td><strong style={{ color:"#16a34a" }}>Rs. {Number(s.amount).toLocaleString()}</strong></td>
                  <td><span className="badge badge-primary" style={{ textTransform:"capitalize" }}>{s.frequency}</span></td>
                  <td>{s.class_name || <span style={{ color:"#94a3b8" }}>All classes</span>}</td>
                  <td>{s.year_name  || <span style={{ color:"#94a3b8" }}>N/A</span>}</td>
                  <td style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDelete(s.id)}>Deactivate</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* â”€â”€ Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function InvoicesTab() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const { can } = useAuth();
  const [invoices,    setInvoices]    = useState([]);
  const [structures,  setStructures]  = useState([]);
  const [students,    setStudents]    = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statusFilter,setStatus]      = useState("");
  const [years,       setYears]       = useState([]);
  const [filters,     setFilters]     = useState({ registration_no:"", class_id:"", invoice_no:"", month:"", academic_year_id:"" });
  const [invAdvancedOpen, setInvAdvancedOpen] = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [showBulk,    setShowBulk]    = useState(false);
  const [showPayment, setShowPayment] = useState(null);
  const [form,        setForm]        = useState({ student_id:"", fee_structure_id:"", amount:"", due_date:"", discount:0, fine:0, notes:"" });
  const [bulkForm,    setBulkForm]    = useState({ fee_structure_id:"", class_id:"", due_date:"" });
  const [saving,      setSaving]      = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");
  const [showSmartGen, setShowSmartGen] = useState(false);
  const [smartResult,  setSmartResult]  = useState("");

  useEffect(() => { fetchData(); }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      if (statusFilter) params.status = statusFilter;
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const [inv, st, stu, cls, yrs] = await Promise.all([
        financeApi.getInvoices(params),
        financeApi.getStructures(),
        studentsApi.getAll({ per_page:200 }),
        academicsApi.getClasses(),
        academicsApi.getYears(),
      ]);
      setInvoices(inv.data.data   || []);
      setStructures(st.data.data  || []);
      setStudents(stu.data.data   || []);
      setClasses(cls.data.data    || []);
      setYears(yrs.data.data      || []);
    } catch {} finally { setLoading(false); }
  };
  const fetchInvoices = fetchData;
  const applyFilters = () => fetchData();
  const clearFilters = () => {
    setFilters({ registration_no:"", class_id:"", invoice_no:"", month:"", academic_year_id:"" });
    setInvAdvancedOpen(false);
    setTimeout(fetchData, 0);
  };

  const handleCreate = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await financeApi.createInvoice(form);
      setSuccess("Invoice created."); setShowForm(false); fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const handleBulk = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const res = await financeApi.bulkGenerate(bulkForm);
      setSuccess(res.data.message); setShowBulk(false); fetchData();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const statusBadge = status => {
    const map = { paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple", pending_verification:"badge-warning" };
    return "badge " + (map[status] || "badge-gray");
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <div className="header-left">
          <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Invoices</h2>
          <select className="filter-select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {can("finance.bulk") && <button className="btn btn-secondary" onClick={() => { setShowBulk(!showBulk); setShowForm(false); setShowSmartGen(false); }}>Bulk Generate</button>}
          {can("finance.bulk") && <button className="btn btn-primary" style={{ background:"#16a34a", borderColor:"#16a34a" }} onClick={() => { setShowSmartGen(!showSmartGen); setShowBulk(false); setShowForm(false); }}>Smart Monthly</button>}
          {can("finance.invoice") && <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowBulk(false); }}>+ New Invoice</button>}
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:180, marginBottom:0 }}>
            <label className="form-label">Student / Registration No.</label>
            <input className="form-control" placeholder="Name or enrollment no." value={filters.registration_no} onChange={e => setFilters({...filters, registration_no:e.target.value})} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group" style={{ flex:1, minWidth:150, marginBottom:0 }}>
            <label className="form-label">Invoice No.</label>
            <input className="form-control" placeholder="INV-2026-0001" value={filters.invoice_no} onChange={e => setFilters({...filters, invoice_no:e.target.value})} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
          <button className="btn btn-ghost" onClick={() => setInvAdvancedOpen(!invAdvancedOpen)} style={{ color:"#2563eb", fontSize:13 }}>
            {invAdvancedOpen ? "Hide Advanced Search \u25b4" : "Advanced Search \u25be"}
          </button>
        </div>

        {invAdvancedOpen && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #e2e8f0" }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Session (Academic Year)</label>
                <select className="form-control" value={filters.academic_year_id} onChange={e => setFilters({...filters, academic_year_id:e.target.value})}>
                  <option value="">All Sessions</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class</label>
                <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id:e.target.value})}>
                  <option value="">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? " (" + c.section + ")" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Month</label>
                <input className="form-control" type="month" value={filters.month} onChange={e => setFilters({...filters, month:e.target.value})} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
              <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        )}
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {showBulk && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">Bulk Generate Invoices</span>
          </div>
          <p style={{ fontSize:13, color:"#64748b", marginBottom:14 }}>
            Generate invoices for all active students in a class at once.
          </p>
          <form onSubmit={handleBulk}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fee Structure *</label>
                <select className="form-control" value={bulkForm.fee_structure_id} onChange={e => setBulkForm({...bulkForm, fee_structure_id:e.target.value})} required>
                  <option value="">Select structure</option>
                  {structures.map(s => <option key={s.id} value={s.id}>{s.name} â€” Rs. {Number(s.amount).toLocaleString()}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class *</label>
                <select className="form-control" value={bulkForm.class_id} onChange={e => setBulkForm({...bulkForm, class_id:e.target.value})} required>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " ("+c.section+")" : ""}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date *</label>
                <DatePicker value={bulkForm.due_date} onChange={val => setBulkForm({...bulkForm, due_date:val})} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowBulk(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Generating..." : "Generate Invoices"}</button>
            </div>
          </form>
        </div>
      )}

      {showSmartGen && (
        <SmartMonthlyForm
          onGenerated={(msg) => { setSmartResult(msg); setShowSmartGen(false); fetchInvoices(); }}
          onClose={() => setShowSmartGen(false)}
        />
      )}
      {smartResult && <div className="alert alert-success" style={{ marginBottom:12 }}>{smartResult}</div>}
      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">Create Invoice</span>
          </div>
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Student *</label>
                <select className="form-control" value={form.student_id} onChange={e => setForm({...form, student_id:e.target.value})} required>
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.enrollment_no})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fee Structure</label>
                <select className="form-control" value={form.fee_structure_id} onChange={e => { const s = structures.find(x => String(x.id) === e.target.value); setForm({...form, fee_structure_id:e.target.value, amount:s ? s.amount : form.amount}); }}>
                  <option value="">Select structure</option>
                  {structures.map(s => <option key={s.id} value={s.id}>{s.name} â€” Rs. {Number(s.amount).toLocaleString()}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Amount (Rs.) *</label>
                <input className="form-control" type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <DatePicker value={form.due_date} onChange={val => setForm({...form, due_date:val})} />
              </div>
              <div className="form-group">
                <label className="form-label">Discount (Rs.)</label>
                <input className="form-control" type="number" value={form.discount} onChange={e => setForm({...form, discount:e.target.value})} min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Fine (Rs.)</label>
                <input className="form-control" type="number" value={form.fine} onChange={e => setForm({...form, fine:e.target.value})} min="0" />
              </div>
              <div className="form-group form-grid-full">
                <label className="form-label">Notes</label>
                <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Optional notes" />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create Invoice"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="loading-state">Loading invoices...</div>
      : invoices.length === 0 ? <div className="empty-state">No invoices found.</div>
      : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Structure</th>
                <th>Amount</th>
                <th>Net Amount</th>
                <th>Paid</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>
                    <div style={{ fontWeight:600, color:"#0f172a" }}>{inv.student_name}</div>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>{inv.enrollment_no}</div>
                  </td>
                  <td style={{ fontSize:12, color:"#64748b" }}>{inv.structure_name || "Manual"}</td>
                  <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                  <td><strong style={{ color:"#0f172a" }}>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                  <td style={{ color:"#16a34a", fontWeight:600 }}>Rs. {Number(inv.paid_amount || 0).toLocaleString()}</td>
                  <td style={{ fontSize:12, color: inv.due_date && new Date(inv.due_date) < new Date(processingToday) && inv.status !== "paid" ? "#dc2626" : "#64748b" }}>
                    {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                  </td>
                  <td><span className={statusBadge(inv.status)} style={{ textTransform:"capitalize" }}>{inv.status}</span></td>
                  <td>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {inv.status !== "paid" && can("finance.collect") && (
                        <button className="btn btn-primary btn-xs" onClick={() => setShowPayment(inv)}>
                          Record Payment
                        </button>
                      )}
                      {inv.status === "paid" && (
                        <span style={{ fontSize:11, color:"#16a34a", fontWeight:600 }}>Paid</span>
                      )}
                      <button className="btn btn-ghost btn-xs" onClick={() => downloadInvoicePdf(inv.id)}>
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPayment && (
        <PaymentModal
          invoice={showPayment}
          onPaid={() => { setShowPayment(null); fetchData(); setSuccess("Payment recorded."); setTimeout(() => setSuccess(""), 3000); }}
          onClose={() => setShowPayment(null)}
        />
      )}
    </div>
  );
}

/* â”€â”€ Payment Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function PaymentModal({ invoice, onPaid, onClose }) {
  const [form,   setForm]   = useState({ amount_paid: invoice.net_amount - (invoice.paid_amount || 0), method:"cash", reference:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleSubmit = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await financeApi.recordPayment({ ...form, invoice_id: invoice.id });
      onPaid();
    } catch (err) { setError(err.response?.data?.message || "Failed to record payment."); }
    finally { setSaving(false); }
  };

  const balance = Number(invoice.net_amount) - Number(invoice.paid_amount || 0);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <span className="modal-title">Record Payment</span>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
              {invoice.student_name} â€” {invoice.enrollment_no}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Total Amount</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Rs. {Number(invoice.net_amount).toLocaleString()}</div>
            </div>
            <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 14px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Already Paid</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#16a34a" }}>Rs. {Number(invoice.paid_amount || 0).toLocaleString()}</div>
            </div>
            <div style={{ background:"#fef2f2", borderRadius:8, padding:"10px 14px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Balance Due</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#dc2626" }}>Rs. {Number(balance).toLocaleString()}</div>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Amount Paying (Rs.) *</label>
              <input className="form-control" type="number" value={form.amount_paid} onChange={e => setForm({...form, amount_paid:e.target.value})} required min="1" max={balance} step="0.01" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select className="form-control" value={form.method} onChange={e => setForm({...form, method:e.target.value})}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online Payment</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference / Receipt No.</label>
              <input className="form-control" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Optional reference number" />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Optional notes" />
            </div>
            <div className="modal-footer" style={{ padding:0, marginTop:16, border:"none" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Recording..." : "Record Payment"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ReceiptModal({ receiptSrc, onClose }) {
  const isPdf = typeof receiptSrc === "string" && receiptSrc.toLowerCase().includes("pdf");

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, maxWidth:"90vw", maxHeight:"90vh", overflow:"auto", padding:16, position:"relative" }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ position:"absolute", top:10, right:10, zIndex:1 }}>Close</button>
        {isPdf ? (
          <iframe src={receiptSrc} title="receipt" style={{ width:"70vw", height:"80vh", border:"none", marginTop:30 }} />
        ) : (
          <img src={receiptSrc} alt="receipt" style={{ maxWidth:"100%", maxHeight:"80vh", display:"block", marginTop:30 }} />
        )}
      </div>
    </div>
  );
}

function InvoiceSettlementModal({ invoiceId, onClose }) {
  const { formatDate } = useRegionalSettings();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    financeApi.getInvoicePayments(invoiceId)
      .then(r => setData(r.data.data))
      .catch(() => setError("Failed to load invoice details."))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:560, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ padding:"16px 24px", borderBottom:"1px solid #e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#f8fafc", borderRadius:"12px 12px 0 0" }}>
          <span style={{ fontWeight:700, fontSize:16, color:"#0f172a" }}>Invoice Settlement</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding:"20px 24px" }}>
          {loading && <div className="loading-state">Loading...</div>}
          {error && <div className="alert alert-error">{error}</div>}
          {data && (
            <>
              <div style={{ marginBottom:18 }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#0f172a" }}>{data.invoice.invoice_no}</div>
                <div style={{ fontSize:13, color:"#64748b" }}>{data.invoice.student_name} ({data.invoice.enrollment_no}) &middot; {data.invoice.month_year}</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18, fontSize:13 }}>
                <div>Amount: <strong>Rs. {Number(data.invoice.amount).toLocaleString()}</strong></div>
                <div>Discount: <strong>Rs. {Number(data.invoice.discount || 0).toLocaleString()}</strong></div>
                <div>Fine: <strong>Rs. {Number(data.invoice.fine || 0).toLocaleString()}</strong></div>
                <div>Net Amount: <strong>Rs. {Number(data.invoice.net_amount).toLocaleString()}</strong></div>
                <div>Total Paid: <strong style={{ color:"#16a34a" }}>Rs. {Number(data.invoice.total_paid).toLocaleString()}</strong></div>
                <div>Balance: <strong style={{ color: data.invoice.balance > 0 ? "#dc2626" : "#16a34a" }}>Rs. {Number(data.invoice.balance).toLocaleString()}</strong></div>
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>
                Invoice Breakdown
              </div>
              {(!data.items || data.items.length === 0) ? (
                <div className="empty-state" style={{ marginBottom:18 }}>No line items recorded for this invoice.</div>
              ) : (
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, marginBottom:18 }}>
                  <thead>
                    <tr style={{ background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                      <th style={{ padding:"8px", textAlign:"left" }}>Type</th>
                      <th style={{ padding:"8px", textAlign:"left" }}>Label</th>
                      <th style={{ padding:"8px", textAlign:"right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(it => {
                      const typeBadge = {
                        tuition:  { text:"Fee Type", cls:"badge-gray" },
                        charge:   { text:"Charge",   cls:"badge-primary" },
                        discount: { text:"Discount", cls:"badge-success" },
                        late_fee: { text:"Late Fee", cls:"badge-danger" },
                      }[it.item_type] || { text:it.item_type, cls:"badge-gray" };
                      const isDiscount = it.item_type === "discount";
                      return (
                        <tr key={it.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                          <td style={{ padding:"8px" }}><span className={`badge ${typeBadge.cls}`}>{typeBadge.text}</span></td>
                          <td style={{ padding:"8px" }}>{it.label}</td>
                          <td style={{ padding:"8px", textAlign:"right", fontWeight:600, color: isDiscount ? "#16a34a" : "#0f172a" }}>
                            {isDiscount ? "\u2212" : ""}Rs. {Number(it.amount).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>
                Payments Settled Against This Invoice
              </div>
              {data.payments.length === 0 ? (
                <div className="empty-state">No payments recorded yet.</div>
              ) : (
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                      <th style={{ padding:"8px", textAlign:"left" }}>Amount</th>
                      <th style={{ padding:"8px", textAlign:"left" }}>Method</th>
                      <th style={{ padding:"8px", textAlign:"left" }}>Reference</th>
                      <th style={{ padding:"8px", textAlign:"left" }}>Date</th>
                      <th style={{ padding:"8px", textAlign:"left" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map(p => (
                      <tr key={p.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                        <td style={{ padding:"8px", fontWeight:600 }}>Rs. {Number(p.amount_paid).toLocaleString()}</td>
                        <td style={{ padding:"8px", textTransform:"capitalize" }}>{p.method?.replace("_"," ")}</td>
                        <td style={{ padding:"8px" }}>{p.reference || "N/A"}</td>
                        <td style={{ padding:"8px" }}>{formatDate(p.paid_at)}</td>
                        <td style={{ padding:"8px" }}>{p.is_verified ? <span className="badge badge-success">Verified</span> : <span className="badge badge-warning">Pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentsTab() {
  const { formatDateTime } = useRegionalSettings();
  const [payments, setPayments] = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [success,  setSuccess]  = useState("");
  const [filters,  setFilters]  = useState({ student:"", reference:"", class_id:"", month:"", from_date:"", to_date:"" });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const [viewReceiptSrc, setViewReceiptSrc] = useState(null);

  const fetchPayments = (activeFilters) => {
    setLoading(true);
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    financeApi.getPayments(params)
      .then(r => setPayments(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayments();
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  const applyFilters = () => fetchPayments();
  const clearFilters = () => {
    const empty = { student:"", reference:"", class_id:"", month:"", from_date:"", to_date:"" };
    setFilters(empty);
    setAdvancedOpen(false);
    fetchPayments(empty);
  };

  const handleVerify = async (id) => {
    try {
      await financeApi.verifyPayment(id);
      setSuccess("Payment verified successfully.");
      fetchPayments();
      setTimeout(() => setSuccess(""), 3000);
    } catch { alert("Failed to verify payment."); }
  };

  const pendingCount = payments.filter(p => !p.is_verified && p.receipt_image).length;

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Payment History</h2>
        <span className="badge badge-primary">{payments.length} records</span>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:180, marginBottom:0 }}>
            <label className="form-label">Student</label>
            <input className="form-control" placeholder="Name or enrollment no." value={filters.student} onChange={e => setFilters({...filters, student:e.target.value})} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group" style={{ flex:1, minWidth:180, marginBottom:0 }}>
            <label className="form-label">Receipt No.</label>
            <input className="form-control" placeholder="Reference" value={filters.reference} onChange={e => setFilters({...filters, reference:e.target.value})} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
          <button className="btn btn-ghost" onClick={() => setAdvancedOpen(!advancedOpen)} style={{ color:"#2563eb", fontSize:13 }}>
            {advancedOpen ? "Hide Advanced Search \u25b4" : "Advanced Search \u25be"}
          </button>
        </div>

        {advancedOpen && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #e2e8f0" }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Class</label>
                <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id:e.target.value})}>
                  <option value="">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? " (" + c.section + ")" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Month</label>
                <input className="form-control" type="month" value={filters.month} onChange={e => setFilters({...filters, month:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">From Date</label>
                <DatePicker value={filters.from_date} onChange={val => setFilters({...filters, from_date:val})} />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <DatePicker value={filters.to_date} onChange={val => setFilters({...filters, to_date:val})} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
              <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">Loading payments...</div>
      ) : payments.length === 0 ? (
        <div className="empty-state">No payments found for the selected filters.</div>
      ) : (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Month</th>
              <th>Invoice No.</th>
              <th>Amount Paid</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Receipt</th>
              <th>Invoice Status</th>
              <th>Date & Time</th>
              <th>Verify</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight:600, color:"#0f172a" }}>{p.student_name}</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{p.enrollment_no}</div>
                </td>
                <td style={{ fontSize:12, color:"#64748b" }}>{p.class_name ? p.class_name + (p.class_section ? " (" + p.class_section + ")" : "") : "-"}</td>
                <td style={{ fontSize:12, color:"#64748b" }}>{p.month_year || "-"}</td>
                <td>
                  <button onClick={() => setViewInvoiceId(p.invoice_id)} style={{ background:"none", border:"none", color:"#2563eb", textDecoration:"underline", cursor:"pointer", fontSize:13, padding:0 }}>
                    {p.invoice_no || "-"}
                  </button>
                </td>
                <td><strong style={{ color:"#16a34a" }}>Rs. {Number(p.amount_paid).toLocaleString()}</strong></td>
                <td><span className="badge badge-gray" style={{ textTransform:"capitalize" }}>{p.method?.replace("_"," ")}</span></td>
                <td style={{ fontSize:12, color:"#64748b" }}>{p.reference || "N/A"}</td>
                <td>
                  {p.receipt_image ? (
                    <button onClick={() => setViewReceiptSrc(p.receipt_image)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                      <img src={p.receipt_image} alt="receipt" style={{ width:36, height:36, objectFit:"cover", borderRadius:4, border:"1px solid #e2e8f0" }} onError={e => { e.target.style.opacity = 0.3; }} />
                    </button>
                  ) : <span style={{ fontSize:11, color:"#94a3b8" }}>None</span>}
                </td>
                <td><span className={`badge ${p.invoice_status === "paid" ? "badge-success" : "badge-warning"}`} style={{ textTransform:"capitalize" }}>{p.invoice_status}</span></td>
                <td style={{ fontSize:12, color:"#64748b" }}>{formatDateTime(p.paid_at)}</td>
                <td>
                  {p.receipt_image && !p.is_verified && (
                    <button className="btn btn-primary btn-xs" onClick={() => handleVerify(p.id)}>Verify</button>
                  )}
                  {p.is_verified && <span className="badge badge-success">Verified</span>}
                  {!p.receipt_image && <span style={{ fontSize:11, color:"#94a3b8" }}>-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {viewInvoiceId && (
        <InvoiceSettlementModal invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
      )}
      {viewReceiptSrc && (
        <ReceiptModal receiptSrc={viewReceiptSrc} onClose={() => setViewReceiptSrc(null)} />
      )}
    </div>
  );
}


function LockedAccountsTab() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const { can } = useAuth();
  const [rows,    setRows]    = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [unlockingId, setUnlockingId] = useState(null);
  const [filters, setFilters] = useState({ student:"", class_id:"", from_date:"", to_date:"" });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fetchRows = (activeFilters) => {
    setLoading(true); setError("");
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    financeApi.getLockedAccounts(params)
      .then(res => setRows(res.data.data || []))
      .catch(() => setError("Failed to load locked accounts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows();
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  const applyFilters = () => fetchRows();
  const clearFilters = () => {
    const empty = { student:"", class_id:"", from_date:"", to_date:"" };
    setFilters(empty);
    setAdvancedOpen(false);
    fetchRows(empty);
  };

  const fmtLockedDate = d => d ? formatDate(d) : "-";

  const handleUnlock = async (studentId) => {
    if (!window.confirm("Unlock this student's account?")) return;
    setUnlockingId(studentId);
    try {
      await financeApi.unlockAccount(studentId);
      fetchRows();
    } catch {
      alert("Failed to unlock account.");
    } finally {
      setUnlockingId(null);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Locked Accounts (Unpaid Fees)</h2>
        <span className="badge badge-danger">{rows.length} locked</span>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:200, marginBottom:0 }}>
            <label className="form-label">Student</label>
            <input className="form-control" placeholder="Name or enrollment no." value={filters.student} onChange={e => setFilters({...filters, student:e.target.value})} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
          <button className="btn btn-ghost" onClick={() => setAdvancedOpen(!advancedOpen)} style={{ color:"#2563eb", fontSize:13 }}>
            {advancedOpen ? "Hide Advanced Search \u25b4" : "Advanced Search \u25be"}
          </button>
        </div>

        {advancedOpen && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #e2e8f0" }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Class</label>
                <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id:e.target.value})}>
                  <option value="">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? " (" + c.section + ")" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date From</label>
                <DatePicker value={filters.from_date} onChange={val => setFilters({...filters, from_date:val})} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date To</label>
                <DatePicker value={filters.to_date} onChange={val => setFilters({...filters, to_date:val})} />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
              <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="loading-state">Loading locked accounts...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">No accounts found for the selected filters.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Enrollment No.</th>
                <th>Class</th>
                <th>Invoice No.</th>
                <th>Due Date</th>
                <th>Days Overdue</th>
                <th>Fine</th>
                <th>Net Amount</th>
                {can("finance.manage") && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id}>
                  <td style={{ fontWeight:600 }}>{r.first_name} {r.last_name}</td>
                  <td>{r.enrollment_no}</td>
                  <td>{r.class_name ? r.class_name + (r.class_section ? " (" + r.class_section + ")" : "") : "-"}</td>
                  <td>{r.invoice_no || "-"}</td>
                  <td>{fmtLockedDate(r.due_date)}</td>
                  <td><span className="badge badge-danger">{r.days_overdue != null ? r.days_overdue + " days" : "-"}</span></td>
                  <td>{r.fine != null ? "Rs. " + Number(r.fine).toLocaleString() : "-"}</td>
                  <td><strong>{r.net_amount != null ? "Rs. " + Number(r.net_amount).toLocaleString() : "-"}</strong></td>
                  {can("finance.manage") && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleUnlock(r.student_id)} disabled={unlockingId === r.student_id}>
                        {unlockingId === r.student_id ? "Unlocking..." : "Unlock"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SiblingTiersConfig() {
  const [tiers,   setTiers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    discountsApi.getSiblingTiers()
      .then(r => setTiers(r.data.data && r.data.data.length ? r.data.data : [{ child_no:2, percentage:10 }, { child_no:3, percentage:15 }]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateTier = (idx, field, value) => {
    setTiers(tiers.map((t,i) => i===idx ? {...t, [field]:value} : t));
  };

  const addTier = () => {
    const nextChildNo = tiers.length ? Math.max(...tiers.map(t=>t.child_no)) + 1 : 2;
    setTiers([...tiers, { child_no: nextChildNo, percentage: 0 }]);
  };

  const removeTier = (idx) => setTiers(tiers.filter((_,i) => i!==idx));

  const handleSave = async () => {
    setSaving(true); setSuccess("");
    try {
      await discountsApi.updateSiblingTiers({ tiers });
      setSuccess("Sibling discount tiers saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      alert("Failed to save sibling tiers.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading sibling tiers...</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Sibling Discount Tiers</span>
      </div>
      {success && <div className="alert alert-success">{success}</div>}
      <p style={{ fontSize:13, color:"#64748b", marginBottom:12 }}>
        Configure the discount percentage for the 2nd child, 3rd child, etc. The 1st child (by ranking method) never gets a sibling discount.
      </p>
      {tiers.map((t, i) => (
        <div key={i} style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}>
          <span style={{ fontSize:13, minWidth:90 }}>Child #</span>
          <input className="form-control" type="number" min="2" value={t.child_no} onChange={e => updateTier(i, "child_no", parseInt(e.target.value)||2)} style={{ maxWidth:90 }} />
          <input className="form-control" type="number" min="0" max="100" value={t.percentage} onChange={e => updateTier(i, "percentage", parseFloat(e.target.value)||0)} style={{ maxWidth:100 }} />
          <span style={{ fontSize:13, color:"#64748b" }}>%</span>
          <button className="btn btn-ghost btn-sm" onClick={() => removeTier(i)} style={{ color:"#dc2626" }}>Remove</button>
        </div>
      ))}
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:12 }}>
        <button className="btn btn-secondary btn-sm" onClick={addTier}>+ Add Tier</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Tiers"}</button>
      </div>
    </div>
  );
}

function DiscountsTab() {
  const { can } = useAuth();
  const [allTypes, setAllTypes] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId,setEditingId]= useState(null);
  const [form,     setForm]     = useState({ name:"", description:"", type:"percentage", value:"" });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const fetchTypes = () => {
    discountsApi.getTypes()
      .then(r => setAllTypes(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTypes(); }, []);

  const openCreate = () => {
    setForm({ name:"", description:"", type:"percentage", value:"" });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (t) => {
    setForm({ name:t.name, description:t.description || "", type:t.type, value:t.value });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (editingId) {
        await discountsApi.updateType(editingId, { ...form, is_active:true });
      } else {
        await discountsApi.createType(form);
      }
      setShowForm(false);
      fetchTypes();
    } catch {
      setError("Failed to save discount type.");
    } finally { setSaving(false); }
  };

  const handleToggle = async (t) => {
    try {
      await discountsApi.updateType(t.id, { ...t, is_active: !t.is_active });
      fetchTypes();
    } catch { alert("Failed to update discount type."); }
  };

  if (loading) return <div className="loading-state">Loading discount types...</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Discount Types</h2>
        {can("finance.manage") && (
          <button className="btn btn-primary" onClick={openCreate}>+ Add Discount Type</button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="section-card" style={{ marginBottom:16 }}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={e => setForm({...form, description:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type} onChange={e => setForm({...form, type:e.target.value})}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Value {form.type === "percentage" ? "(%)" : "(Rs.)"}</label>
              <input className="form-control" type="number" min="0" value={form.value} onChange={e => setForm({...form, value:e.target.value})} />
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </form>
      )}

      {allTypes.length === 0 ? (
        <div className="empty-state">No discount types defined yet.</div>
      ) : (
        <div className="table-container" style={{ marginBottom:24 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Type</th>
                <th>Value</th>
                <th>Status</th>
                {can("finance.manage") && <th></th>}
              </tr>
            </thead>
            <tbody>
              {allTypes.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight:600 }}>{t.name}{t.is_sibling && <span className="badge badge-gray" style={{ marginLeft:6 }}>Auto</span>}</td>
                  <td style={{ fontSize:12, color:"#64748b" }}>{t.description || "-"}</td>
                  <td style={{ textTransform:"capitalize" }}>{t.type}</td>
                  <td>{t.is_sibling ? "Auto-calculated" : (t.type === "percentage" ? t.value + "%" : "Rs. " + t.value)}</td>
                  <td>{t.is_active ? <span className="badge badge-success">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                  {can("finance.manage") && (
                    <td style={{ display:"flex", gap:6 }}>
                      <button className="btn btn-secondary btn-xs" onClick={() => openEdit(t)}>Edit</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(t)}>{t.is_active ? "Deactivate" : "Activate"}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SiblingTiersConfig />
    </div>
  );
}

function ChargeTypesTab() {
  const { can } = useAuth();
  const [types,   setTypes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm,setShowForm]= useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form,    setForm]    = useState({ name:"", recurrence:"interval", interval_months:"1" });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const fetchTypes = () => {
    financeApi.getChargeTypes()
      .then(r => setTypes(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTypes(); }, []);

  const openCreate = () => {
    setForm({ name:"", recurrence:"interval", interval_months:"1" });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (t) => {
    setForm({ name:t.name, recurrence:t.recurrence, interval_months: t.interval_months || "1" });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    const payload = {
      name: form.name,
      recurrence: form.recurrence,
      interval_months: form.recurrence === "interval" ? parseInt(form.interval_months || "1") : null,
    };
    try {
      if (editingId) {
        await financeApi.updateChargeType(editingId, payload);
      } else {
        await financeApi.createChargeType(payload);
      }
      setShowForm(false);
      fetchTypes();
    } catch {
      setError("Failed to save charge type.");
    } finally { setSaving(false); }
  };

  const handleToggle = async (id) => {
    try {
      await financeApi.toggleChargeType(id);
      fetchTypes();
    } catch { alert("Failed to toggle charge type."); }
  };

  if (loading) return <div className="loading-state">Loading charge types...</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Charge Types</h2>
        {can("finance.manage") && (
          <button className="btn btn-primary" onClick={openCreate}>+ Add Charge Type</button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="section-card" style={{ marginBottom:16 }}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Recurrence</label>
            <div style={{ display:"flex", gap:16 }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
                <input type="radio" name="recurrence" value="interval" checked={form.recurrence==="interval"} onChange={e => setForm({...form, recurrence:e.target.value})} />
                Interval (repeats every N months)
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
                <input type="radio" name="recurrence" value="fixed" checked={form.recurrence==="fixed"} onChange={e => setForm({...form, recurrence:e.target.value})} />
                Fixed (applies to a single chosen month, set per-charge)
              </label>
            </div>
          </div>
          {form.recurrence === "interval" && (
            <div className="form-group">
              <label className="form-label">Interval (months)</label>
              <input className="form-control" type="number" min="1" value={form.interval_months} onChange={e => setForm({...form, interval_months:e.target.value})} style={{ maxWidth:120 }} />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>1 = monthly, 3 = termly, 12 = yearly, etc. Counted from the active academic year's start date.</div>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </form>
      )}

      {types.length === 0 ? (
        <div className="empty-state">No charge types defined.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Recurrence</th>
                <th>Interval</th>
                <th>Status</th>
                {can("finance.manage") && <th></th>}
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight:600 }}>{t.name}</td>
                  <td style={{ textTransform:"capitalize" }}>{t.recurrence}</td>
                  <td>{t.recurrence === "interval" ? (t.interval_months + " month" + (t.interval_months !== 1 ? "s" : "")) : "-"}</td>
                  <td>{t.is_active ? <span className="badge badge-success">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                  {can("finance.manage") && (
                    <td style={{ display:"flex", gap:6 }}>
                      <button className="btn btn-secondary btn-xs" onClick={() => openEdit(t)}>Edit</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(t.id)}>{t.is_active ? "Deactivate" : "Activate"}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChargeSettlementTab() {
  const { formatDate } = useRegionalSettings();
  const [regNo,   setRegNo]   = useState("");
  const [receipt, setReceipt] = useState("");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched,setSearched]= useState(false);
  const [error,   setError]   = useState("");
  const [waivingId, setWaivingId] = useState(null);

  const fmtDate = d => d ? formatDate(d) : "-";

  const handleSearch = () => {
    if (!regNo && !receipt) { setError("Enter a registration number or receipt number."); return; }
    setLoading(true); setError(""); setSearched(true);
    const params = {};
    if (regNo) params.registration_no = regNo;
    if (receipt) params.receipt_no = receipt;
    financeApi.searchCharges(params)
      .then(r => setRows(r.data.data || []))
      .catch(() => setError("Search failed."))
      .finally(() => setLoading(false));
  };

  const handleWaive = async (row) => {
    if (!window.confirm("Waive \"" + row.label + "\" (Rs. " + Number(row.amount).toLocaleString() + ")? This will cancel invoice " + row.invoice_no + " and generate a new invoice without this charge. The student and parent will be notified.")) return;
    setWaivingId(row.item_id);
    try {
      const res = await financeApi.waiveCharge(row.item_id);
      alert(res.data.message);
      handleSearch();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to waive charge.");
    } finally {
      setWaivingId(null);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Charge Settlement</h2>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:200, marginBottom:0 }}>
            <label className="form-label">Registration No.</label>
            <input className="form-control" placeholder="e.g. SMS/2026/0101" value={regNo} onChange={e => setRegNo(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
          </div>
          <div className="form-group" style={{ flex:1, minWidth:200, marginBottom:0 }}>
            <label className="form-label">Receipt No.</label>
            <input className="form-control" placeholder="Receipt / reference no." value={receipt} onChange={e => setReceipt(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
          </div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>{loading ? "Searching..." : "Search"}</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop:12 }}>{error}</div>}
      </div>

      {!searched ? (
        <div className="empty-state">Search by registration number or receipt number to see charges.</div>
      ) : loading ? (
        <div className="loading-state">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">No charges found.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Charge Type</th>
                <th>Student</th>
                <th>Invoice No.</th>
                <th>Invoice Status</th>
                <th>Amount</th>
                <th>Charge Creation Date</th>
                <th>Charge Settled Date</th>
                <th>Settled</th>
                <th>Waive</th>
                <th>Waive Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isPaid = row.invoice_status === "paid";
                const isLocked = isPaid || row.invoice_status === "cancelled" || row.is_waived;
                return (
                  <tr key={row.item_id}>
                    <td style={{ fontWeight:600 }}>{row.label}</td>
                    <td>
                      <div>{row.first_name} {row.last_name}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{row.enrollment_no}</div>
                    </td>
                    <td>{row.invoice_no}</td>
                    <td><span className={"badge " + (isPaid ? "badge-success" : row.invoice_status === "cancelled" ? "badge-gray" : "badge-warning")} style={{ textTransform:"capitalize" }}>{row.invoice_status}</span></td>
                    <td>Rs. {Number(row.amount).toLocaleString()}</td>
                    <td>{fmtDate(row.issued_at)}</td>
                    <td>{fmtDate(row.paid_at)}</td>
                    <td><input type="checkbox" checked={isPaid} disabled readOnly /></td>
                    <td>
                      {waivingId === row.item_id ? (
                        <span style={{ fontSize:12, color:"#64748b" }}>Processing...</span>
                      ) : (
                        <input type="checkbox" checked={row.is_waived} disabled={isLocked} onChange={() => !isLocked && handleWaive(row)} />
                      )}
                    </td>
                    <td>{fmtDate(row.waived_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChargesTab() {
  const { can } = useAuth();
  const [charges,  setCharges]  = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [years,    setYears]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");
  const [form,     setForm]     = useState({
    name:"", amount:"", charge_type_id:"", apply_month:"",
    apply_year:"", target_type:"whole_school", class_ids:[], student_ids:[], academic_year_id:"", description:""
  });
  const [chargeTypes, setChargeTypes] = useState([]);
  const [studentSearch,    setStudentSearch]    = useState("");
  const [studentResults,   setStudentResults]   = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);

  useEffect(() => {
    if (!studentSearch || studentSearch.trim().length < 2) { setStudentResults([]); return; }
    const t = setTimeout(() => {
      studentsApi.getAll({ search: studentSearch, status: "active", per_page: 15 })
        .then(r => setStudentResults(r.data.data?.items || r.data.data || []))
        .catch(() => setStudentResults([]));
    }, 350);
    return () => clearTimeout(t);
  }, [studentSearch]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  useEffect(() => {
    Promise.all([
      financeApi.getFeeCharges(),
      academicsApi.getClasses(),
      academicsApi.getYears(),
      financeApi.getChargeTypes(),
    ]).then(([r1, r2, r3, r4]) => {
      setCharges(r1.data.data || []);
      setClasses(r2.data.data || []);
      setYears(r3.data.data  || []);
      setChargeTypes((r4.data.data || []).filter(t => t.is_active));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const fetchCharges = () => {
    financeApi.getFeeCharges().then(r => setCharges(r.data.data || [])).catch(() => {});
  };

  const openCreate = () => { setEditItem(null); setForm({ name:"", amount:"", charge_type_id:"", apply_month:"", apply_year:"", target_type:"whole_school", class_ids:[], student_ids:[], academic_year_id:"", description:"" }); setStudentSearch(""); setStudentResults([]); setSelectedStudents([]); setShowForm(true); };
  const openEdit   = (c) => {
    setEditItem(c);
    setForm({ name:c.name, amount:c.amount, charge_type_id:c.charge_type_id||"", apply_month:c.apply_month||"", apply_year:c.apply_year||"", target_type:c.target_type||"whole_school", class_ids:c.class_ids||[], student_ids:c.student_ids||[], academic_year_id:c.academic_year_id||"", description:c.description||"" });
    setStudentSearch(""); setStudentResults([]);
    if (c.target_type === "students" && c.student_ids && c.student_labels) {
      setSelectedStudents(c.student_ids.map((id, i) => {
        const parts = (c.student_labels[i] || "").match(/^(.*) \((.*)\)$/);
        const name = parts ? parts[1] : c.student_labels[i] || "";
        const nameParts = name.split(" ");
        return { id, first_name: nameParts[0] || "", last_name: nameParts.slice(1).join(" ") || "", enrollment_no: parts ? parts[2] : "" };
      }));
    } else {
      setSelectedStudents([]);
    }
    setShowForm(true);
  };

  const handleSave = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editItem) await financeApi.updateFeeCharge(editItem.id, form);
      else          await financeApi.createFeeCharge(form);
      setSuccess(editItem ? "Charge updated." : "Charge created.");
      setShowForm(false);
      const r = await financeApi.getFeeCharges();
      setCharges(r.data.data || []);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to save."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this charge?")) return;
    try {
      await financeApi.deleteFeeCharge(id);
      fetchCharges();
      setSuccess("Charge deleted (or deactivated, if already used on an invoice).");
      setTimeout(() => setSuccess(""), 4000);
    } catch { setError("Failed to delete."); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700 }}>Extra Charges</h2>
        {can("finance.manage") && <button className="btn btn-primary" onClick={openCreate}>+ Add Charge</button>}
      </div>

      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header"><span className="section-card-title">{editItem ? "Edit Charge" : "New Charge"}</span></div>
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Charge Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required placeholder="e.g. Sports Fee, Library Fee" />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (Rs.) *</label>
                <input className="form-control" type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label className="form-label">Charge Type *</label>
                <select className="form-control" value={form.charge_type_id} onChange={e => setForm({...form, charge_type_id:e.target.value})} required>
                  <option value="">Select charge type...</option>
                  {chargeTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.recurrence==="interval" ? " (every " + t.interval_months + " month" + (t.interval_months===1?"":"s") + ")" : " (specific month)"}
                    </option>
                  ))}
                </select>
              </div>
              {chargeTypes.find(t => String(t.id) === String(form.charge_type_id))?.recurrence === "fixed" && (
                <>
                  <div className="form-group">
                    <label className="form-label">Apply Month</label>
                    <select className="form-control" value={form.apply_month} onChange={e => setForm({...form, apply_month:e.target.value})}>
                      <option value="">Select month</option>
                      {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apply Year</label>
                    <input className="form-control" type="number" value={form.apply_year} onChange={e => setForm({...form, apply_year:e.target.value})} placeholder="e.g. 2026" />
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Applies To *</label>
                <div style={{ display:"flex", gap:16, marginBottom:10 }}>
                  {[
                    { v:"whole_school", l:"Whole School" },
                    { v:"classes",      l:"Specific Class" },
                    { v:"students",     l:"Specific Student" },
                  ].map(opt => (
                    <label key={opt.v} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                      <input type="radio" name="target_type" value={opt.v} checked={form.target_type===opt.v}
                        onChange={e => setForm({...form, target_type:e.target.value, class_ids: e.target.value==="classes" ? form.class_ids : [], student_ids: e.target.value==="students" ? form.student_ids : []})} />
                      {opt.l}
                    </label>
                  ))}
                </div>
                {form.target_type === "classes" && (
                  <div style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 12px", maxHeight:160, overflowY:"auto" }}>
                    {classes.map(c => {
                      const checked = form.class_ids.map(String).includes(String(c.id));
                      return (
                        <label key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0", cursor:"pointer", fontSize:13 }}>
                          <input type="checkbox" checked={checked} onChange={e => {
                            if (e.target.checked) setForm({...form, class_ids:[...form.class_ids, c.id]});
                            else setForm({...form, class_ids:form.class_ids.filter(id => String(id)!==String(c.id))});
                          }} />
                          {c.name}{c.section ? " (" + c.section + ")" : ""}
                        </label>
                      );
                    })}
                  </div>
                )}
                {form.target_type === "students" && (
                  <div>
                    <input className="form-control" placeholder="Search student by name or enrollment no..." value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)} style={{ marginBottom:8 }} />
                    {form.student_ids.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                        {selectedStudents.map(s => (
                          <span key={s.id} style={{ display:"flex", alignItems:"center", gap:4, background:"#eff6ff", color:"#1d4ed8", padding:"3px 8px", borderRadius:14, fontSize:12 }}>
                            {s.first_name} {s.last_name}
                            <button type="button" onClick={() => {
                              setForm({...form, student_ids: form.student_ids.filter(id => String(id)!==String(s.id))});
                              setSelectedStudents(selectedStudents.filter(x => String(x.id)!==String(s.id)));
                            }} style={{ border:"none", background:"none", cursor:"pointer", color:"#1d4ed8", fontWeight:700, padding:0 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {studentResults.length > 0 && (
                      <div style={{ border:"1px solid #e2e8f0", borderRadius:8, maxHeight:180, overflowY:"auto" }}>
                        {studentResults.map(s => {
                          const already = form.student_ids.map(String).includes(String(s.id));
                          return (
                            <div key={s.id} onClick={() => {
                              if (already) return;
                              setForm({...form, student_ids:[...form.student_ids, s.id]});
                              setSelectedStudents([...selectedStudents, s]);
                            }} style={{ padding:"8px 12px", cursor: already ? "default" : "pointer", fontSize:13, borderBottom:"1px solid #f1f5f9", opacity: already ? 0.5 : 1, background: already ? "#f8fafc" : "#fff" }}>
                              {s.first_name} {s.last_name} ({s.enrollment_no}){s.class_name ? " - " + s.class_name + (s.section ? " (" + s.section + ")" : "") : ""}{already ? " ✓" : ""}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group form-grid-full">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Optional description" />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editItem ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}

      {charges.length === 0 ? <div className="empty-state">No extra charges configured.</div> : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Name</th><th>Amount</th><th>Type</th><th>Applies To</th><th>Status</th>{can("finance.manage") && <th>Actions</th>}</tr></thead>
            <tbody>
              {charges.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {!c.is_active && <span className="badge badge-gray" style={{ marginLeft:6 }}>Inactive</span>}
                    {c.description && <div style={{ fontSize:11, color:"#94a3b8" }}>{c.description}</div>}
                  </td>
                  <td>Rs. {Number(c.amount).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${c.recurrence === "interval" && c.interval_months === 1 ? "badge-primary" : c.recurrence === "fixed" ? "badge-warning" : "badge-gray"}`} style={{ textTransform:"capitalize" }}>
                      {c.recurrence === "fixed" ? `${c.charge_type_name} - ${MONTHS[(c.apply_month||1)-1]} ${c.apply_year||""}` : c.charge_type_name}
                    </span>
                  </td>
                  <td style={{ fontSize:12 }}>{c.target_type==="classes" ? (c.class_labels||[]).join(", ") : c.target_type==="students" ? (c.student_labels||[]).join(", ") || "Specific Students" : "All Classes"}</td>
                  <td><span className={`badge ${c.is_active ? "badge-success" : "badge-gray"}`}>{c.is_active ? "Active" : "Inactive"}</span></td>
                  {can("finance.manage") && (
                    <td style={{ display:"flex", gap:5 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(c.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SmartMonthlyForm({ onGenerated, onClose }) {
  const processingToday = useProcessingToday();
  const now     = new Date(processingToday);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [dueDay,setDueDay]= useState(10);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const handleGenerate = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const res = await financeApi.generateSmartMonthly({ month, year, due_day: dueDay });
      onGenerated(res.data.message);
    } catch (err) { setError(err.response?.data?.message || "Failed to generate."); }
    finally { setSaving(false); }
  };

  return (
    <div className="section-card" style={{ marginBottom:16 }}>
      <div className="section-card-header">
        <span className="section-card-title">Smart Monthly Invoice Generation</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      </div>
      <p style={{ fontSize:13, color:"#64748b", marginBottom:14 }}>
        Generates invoices for all active students based on their class tuition fee + applicable extra charges + discounts.
        Skips students who already have an invoice for the selected month.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleGenerate}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Month *</label>
            <select className="form-control" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Year *</label>
            <input className="form-control" type="number" value={year} onChange={e => setYear(Number(e.target.value))} min="2020" max="2035" />
          </div>
          <div className="form-group">
            <label className="form-label">Due Day</label>
            <input className="form-control" type="number" value={dueDay} onChange={e => setDueDay(Number(e.target.value))} min="1" max="28" />
          </div>
        </div>
        <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#1d4ed8" }}>
          Will generate invoices for <strong>{MONTHS[month-1]} {year}</strong> with due date on <strong>{dueDay}th {MONTHS[month-1]}</strong>.
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ background:"#16a34a", borderColor:"#16a34a" }}>
            {saving ? "Generating..." : `Generate ${MONTHS[month-1]} ${year} Invoices`}
          </button>
        </div>
      </form>
    </div>
  );
}

function FeeTypesTab() {
  const { can } = useAuth();
  const [types,    setTypes]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form,     setForm]     = useState({ name:"", description:"" });
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => { fetchTypes(); }, []);

  const fetchTypes = async () => {
    try { const r = await financeApi.getFeeTypes(); setTypes(r.data.data || []); }
    catch {} finally { setLoading(false); }
  };

  const openCreate = () => { setEditItem(null); setForm({ name:"", description:"" }); setShowForm(true); };
  const openEdit   = t  => { setEditItem(t); setForm({ name:t.name, description:t.description||"" }); setShowForm(true); };

  const handleSave = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editItem) await financeApi.updateFeeType(editItem.id, form);
      else          await financeApi.createFeeType(form);
      setSuccess(editItem ? "Updated." : "Created."); setShowForm(false);
      await fetchTypes(); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!window.confirm("Delete this fee type?")) return;
    try { await financeApi.deleteFeeType(id); setTypes(types.filter(t => t.id !== id)); }
    catch { setError("Cannot delete — it may be in use."); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}
      <div className="page-header" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700 }}>Fee Types</h2>
        {can("finance.manage") && <button className="btn btn-primary" onClick={openCreate}>+ New Fee Type</button>}
      </div>

      {showForm && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header"><span className="section-card-title">{editItem ? "Edit Fee Type" : "New Fee Type"}</span></div>
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required placeholder="e.g. Tuition Fee, Sports Fee" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Optional" />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editItem ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead><tr><th>Fee Type</th><th>Description</th><th>Status</th>{can("finance.manage") && <th>Actions</th>}</tr></thead>
          <tbody>
            {types.map(t => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong></td>
                <td style={{ fontSize:12, color:"#64748b" }}>{t.description || "—"}</td>
                <td><span className={`badge ${t.is_active ? "badge-success" : "badge-gray"}`}>{t.is_active ? "Active" : "Inactive"}</span></td>
                {can("finance.manage") && (
                  <td style={{ display:"flex", gap:5 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>Edit</button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDelete(t.id)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function LateFeeConfigCard({ classId, academicYearId, canManage }) {
  const [form,    setForm]    = useState({ late_fee_type:"none", late_fee_amount:"0" });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");

  useEffect(() => {
    setLoading(true);
    financeApi.getClassFeeConfigs()
      .then(r => {
        const rows = r.data.data || [];
        const match = rows.find(c => String(c.class_id) === String(classId) && String(c.academic_year_id) === String(academicYearId));
        setForm(match ? { late_fee_type: match.late_fee_type, late_fee_amount: String(match.late_fee_amount) } : { late_fee_type:"none", late_fee_amount:"0" });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId, academicYearId]);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await financeApi.saveClassFeeConfig({
        class_id: classId,
        academic_year_id: academicYearId,
        late_fee_type: form.late_fee_type,
        late_fee_amount: form.late_fee_amount,
      });
      setSuccess("Late fee configuration saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  if (loading) return null;

  return (
    <div className="section-card" style={{ marginBottom:16 }}>
      <div className="section-card-header">
        <span className="section-card-title">Late Fee Configuration</span>
      </div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Late Fee Type</label>
          <select className="form-control" value={form.late_fee_type} onChange={e => setForm({...form, late_fee_type:e.target.value})} disabled={!canManage}>
            <option value="none">No Late Fee</option>
            <option value="fixed">Fixed Amount</option>
            <option value="percentage">Percentage</option>
            <option value="per_day">Per Day Amount (after due date)</option>
          </select>
        </div>
        {form.late_fee_type !== "none" && (
          <div className="form-group">
            <label className="form-label">
              Late Fee {form.late_fee_type === "percentage" ? "%" : form.late_fee_type === "per_day" ? "Rs. per day" : "Rs."}
            </label>
            <input className="form-control" type="number" value={form.late_fee_amount} onChange={e => setForm({...form, late_fee_amount:e.target.value})} min="0" step="0.01" disabled={!canManage} />
            {form.late_fee_type === "per_day" && (
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Charged for each day overdue, starting after the grace period configured in Fee Settings.</div>
            )}
          </div>
        )}
      </div>
      {canManage && (
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Late Fee Config"}
          </button>
        </div>
      )}
    </div>
  );
}

function ClassFeesTab() {
  const { can } = useAuth();
  const [classes,   setClasses]   = useState([]);
  const [years,     setYears]     = useState([]);
  const [feeTypes,  setFeeTypes]  = useState([]);
  const [classFees, setClassFees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selClass,  setSelClass]  = useState("");
  const [selYear,   setSelYear]   = useState("");
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ fee_type_id:"", amount:"" });
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState("");
  const [error,     setError]     = useState("");

  useEffect(() => {
    Promise.all([
      academicsApi.getClasses(),
      academicsApi.getYears(),
      financeApi.getFeeTypes(),
    ]).then(([r1, r2, r3]) => {
      setClasses(r1.data.data || []);
      const ys = r2.data.data || [];
      setYears(ys);
      const active = ys.find(y => y.is_active);
      if (active) setSelYear(String(active.id));
      setFeeTypes(r3.data.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selClass || !selYear) { setClassFees([]); return; }
    financeApi.getClassFees({ class_id: selClass, academic_year_id: selYear })
      .then(r => setClassFees(r.data.data || []))
      .catch(() => {});
  }, [selClass, selYear]);

  const handleSave = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await financeApi.createClassFee({ class_id:selClass, academic_year_id:selYear, ...form });
      setSuccess("Fee added."); setShowForm(false);
      const r = await financeApi.getClassFees({ class_id:selClass, academic_year_id:selYear });
      setClassFees(r.data.data || []);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    try {
      await financeApi.deleteClassFee(id);
      setClassFees(classFees.filter(f => f.id !== id));
    } catch { setError("Failed to delete."); }
  };

  const assignedTypeIds = classFees.map(f => f.fee_type_id);
  const availableTypes  = feeTypes.filter(ft => !assignedTypeIds.includes(ft.id));
  const totalFees = classFees.reduce((s, f) => s + Number(f.amount), 0);

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header"><span className="section-card-title">Select Class & Year</span></div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Class</label>
            <select className="form-control" value={selClass} onChange={e => setSelClass(e.target.value)}>
              <option value="">Select class...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? " ("+c.section+")" : ""}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <select className="form-control" value={selYear} onChange={e => setSelYear(e.target.value)}>
              <option value="">Select year...</option>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selClass && selYear && (
        <LateFeeConfigCard classId={selClass} academicYearId={selYear} canManage={can("finance.manage")} />
      )}

      {selClass && selYear && (
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              Fees for {(() => { const sc = classes.find(c => String(c.id) === String(selClass)); return sc ? sc.name + (sc.section ? " (" + sc.section + ")" : "") : ""; })()}
              {classFees.length > 0 && <span className="badge badge-primary" style={{ marginLeft:8 }}>Total: Rs. {totalFees.toLocaleString()}</span>}
            </span>
            {can("finance.manage") && availableTypes.length > 0 && (
              <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={() => { setForm({ fee_type_id:"", amount:"" }); setShowForm(!showForm); }}>
                + Add Fee
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={handleSave} style={{ padding:"12px 0", borderBottom:"1px solid #f1f5f9" }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Fee Type *</label>
                  <select className="form-control" value={form.fee_type_id} onChange={e => setForm({...form, fee_type_id:e.target.value})} required>
                    <option value="">Select fee type</option>
                    {availableTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (Rs.) *</label>
                  <input className="form-control" type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required min="0" />
                </div>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" style={{color:"#fff"}} disabled={saving}>{saving ? "Saving..." : "Add Fee"}</button>
              </div>
            </form>
          )}

          {classFees.length === 0 ? (
            <div className="empty-state">No fees configured for this class yet.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Fee Type</th><th>Amount</th>{can("finance.manage") && <th>Actions</th>}</tr></thead>
              <tbody>
                {classFees.map(f => (
                  <tr key={f.id}>
                    <td><strong>{f.fee_type_name}</strong></td>
                    <td><strong style={{ color:"#2563eb" }}>Rs. {Number(f.amount).toLocaleString()}</strong></td>
                    {can("finance.manage") && (
                      <td><button className="btn btn-danger btn-xs" onClick={() => handleDelete(f.id)}>Remove</button></td>
                    )}
                  </tr>
                ))}
                <tr style={{ background:"#f8fafc" }}>
                  <td><strong>Total Monthly Fee</strong></td>
                  <td><strong style={{ color:"#16a34a", fontSize:14 }}>Rs. {totalFees.toLocaleString()}</strong></td>
                  {can("finance.manage") && <td></td>}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}


function DiscountConfigTab() {
  const { can }     = useAuth();
  const [feeTypes,  setFeeTypes]  = useState([]);
  const [config,    setConfig]    = useState({ on_all: false, fee_type_ids: [], sibling_rank_method: "class" });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState("");
  const [error,     setError]     = useState("");

  useEffect(() => {
    Promise.all([financeApi.getFeeTypes(), financeApi.getDiscountConfig()])
      .then(([r1, r2]) => {
        setFeeTypes(r1.data.data || []);
        setConfig(r2.data.data || { on_all:false, fee_type_ids:[], sibling_rank_method:"class" });
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleFeeType = id => {
    const ids = config.fee_type_ids.includes(id)
      ? config.fee_type_ids.filter(x => x !== id)
      : [...config.fee_type_ids, id];
    setConfig({ ...config, fee_type_ids: ids });
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await financeApi.saveDiscountConfig(config);
      setSuccess("Discount configuration saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Discount Application Configuration</span>
      </div>
      <p style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
        Configure which fee types the discount applies to. Charges are never discounted.
        When a student qualifies for multiple discounts, the highest value discount is applied.
      </p>

      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom:20 }}>
        <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"12px 16px", background: config.on_all ? "#eff6ff" : "#f8fafc", border:"1px solid", borderColor: config.on_all ? "#2563eb" : "#e2e8f0", borderRadius:8, marginBottom:8 }}>
          <input
            type="checkbox"
            checked={config.on_all}
            onChange={e => setConfig({ ...config, on_all: e.target.checked, fee_type_ids: e.target.checked ? [] : config.fee_type_ids })}
            style={{ width:18, height:18 }}
          />
          <div>
            <div style={{ fontWeight:700, fontSize:14, color: config.on_all ? "#2563eb" : "#0f172a" }}>Apply on All Fee Types</div>
            <div style={{ fontSize:12, color:"#64748b" }}>Discount will apply on the total of all configured fee types</div>
          </div>
        </label>

        {!config.on_all && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", marginBottom:10 }}>Or select specific fee types:</div>
            {feeTypes.filter(ft => ft.is_active).map(ft => (
              <label key={ft.id} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"10px 16px", background: config.fee_type_ids.includes(ft.id) ? "#eff6ff" : "#fff", border:"1px solid", borderColor: config.fee_type_ids.includes(ft.id) ? "#2563eb" : "#e2e8f0", borderRadius:8, marginBottom:6 }}>
                <input
                  type="checkbox"
                  checked={config.fee_type_ids.includes(ft.id)}
                  onChange={() => toggleFeeType(ft.id)}
                  style={{ width:16, height:16 }}
                />
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{ft.name}</div>
                  {ft.description && <div style={{ fontSize:11, color:"#94a3b8" }}>{ft.description}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#92400e" }}>
        <strong>Note:</strong> Discount applies to fee types only. Extra charges (Sports Day, Trip fees, etc.) are never discounted.
      </div>

      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", marginBottom:10 }}>Sibling Ranking Method</div>
        <p style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>
          Determines which child in a family is treated as 1st, 2nd, 3rd, etc. when applying sibling discount tiers.
        </p>
        {[
          { value:"class",           label:"Class-wise",        hint:"Highest class = 1st child. Ties broken by earlier registration number." },
          { value:"registration_no", label:"Registration-wise", hint:"Earliest registration number = 1st child." },
          { value:"dob",             label:"Date of Birth-wise",hint:"Oldest date of birth = 1st child." },
        ].map(opt => (
          <label key={opt.value} style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer", padding:"10px 16px", background: config.sibling_rank_method === opt.value ? "#eff6ff" : "#fff", border:"1px solid", borderColor: config.sibling_rank_method === opt.value ? "#2563eb" : "#e2e8f0", borderRadius:8, marginBottom:6 }}>
            <input
              type="radio"
              name="sibling_rank_method"
              checked={config.sibling_rank_method === opt.value}
              onChange={() => setConfig({ ...config, sibling_rank_method: opt.value })}
              style={{ width:16, height:16, marginTop:2 }}
            />
            <div>
              <div style={{ fontWeight:600, fontSize:13 }}>{opt.label}</div>
              <div style={{ fontSize:11, color:"#94a3b8" }}>{opt.hint}</div>
            </div>
          </label>
        ))}
      </div>

      {can("finance.manage") && (
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Discount Configuration"}
        </button>
      )}
    </div>
  );
}