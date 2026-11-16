import React, { useState, useEffect, useCallback } from "react";
import financeApi from "../api/financeApi";
import discountsApi from "../api/discountsApi";
import academicsApi from "../api/academicsApi";
import { setForceGlobalScope } from "../api/client";
import "./FinanceSetup.css";

// This page is superadmin-only and always operates on the shared/global
// (campus_id = NULL) rows, regardless of whatever campus is currently
// selected in the campus switcher - see setForceGlobalScope in api/client.js.
// It reuses the exact same finance/discounts APIs as the campus-scoped
// Finance.jsx page; the only difference is the X-Campus-Id header is
// suppressed here, so creates/edits land in the global rows that
// per-campus Governance "Global" mode falls back to.

const TABS = [
  { key: "categories", label: "Fee Categories" },
  { key: "fee-types", label: "Fee Types" },
  { key: "structures", label: "Fee Structures" },
  { key: "class-fees", label: "Class Fees" },
  { key: "class-fee-config", label: "Class Fee Config" },
  { key: "discount-types", label: "Discount Types" },
  { key: "discount-config", label: "Discount Config" },
  { key: "charges", label: "One-Time Charges" },
];



function Field({ children }) {
  return <div className="fs-field-wrap">{children}</div>;
}

function Banner() {
  return (
    <div className="fs-banner">
      Superadmin Global Setup — everything on this page is saved without a campus assignment. It is used by any campus whose Setting Governance mode is "Global" for that item, and as the fallback default for campuses in "Per-Campus" mode that haven't set their own override.
    </div>
  );
}

export default function FinanceSetup() {
  const [tab, setTab] = useState("categories");
  const [flash, setFlash] = useState(null);
  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  useEffect(() => {
    setForceGlobalScope(true);
    return () => setForceGlobalScope(false);
  }, []);

  return (
    <div className="fs-page">
      <h2 className="fs-page-title">Finance Setup</h2>
      <Banner />
      {flash && (
        <div className="fs-flash" style={{
          "--flash-bg": flash.type === "error" ? "var(--bg-danger-soft)" : "var(--bg-success-soft)", "--flash-color": flash.type === "error" ? "var(--text-danger-soft)" : "var(--text-success-soft)"
        }}>
          {flash.msg}
        </div>
      )}
      <div className="fs-tab-row">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="fs-tab-btn"
            style={{
              "--tab-bg": tab === t.key ? "var(--theme-primary, #2563eb)" : "var(--bg-hover)",
              "--tab-color": tab === t.key ? "#fff" : "var(--text-secondary)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" && <CategoriesTab showFlash={showFlash} />}
      {tab === "fee-types" && <FeeTypesTab showFlash={showFlash} />}
      {tab === "structures" && <StructuresTab showFlash={showFlash} />}
      {tab === "class-fees" && <ClassFeesTab showFlash={showFlash} />}
      {tab === "class-fee-config" && <ClassFeeConfigTab showFlash={showFlash} />}
      {tab === "discount-types" && <DiscountTypesTab showFlash={showFlash} />}
      {tab === "discount-config" && <DiscountConfigTab showFlash={showFlash} />}
      {tab === "charges" && <ChargesTab showFlash={showFlash} />}
    </div>
  );
}

// ─── Fee Categories ──────────────────────────────────────────────────────

function CategoriesTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financeApi.getCategories().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim()) { showFlash("error", "Name is required."); return; }
    setSaving(true);
    try {
      await financeApi.createCategory(form);
      showFlash("success", "Fee category created.");
      setForm({ name: "", description: "" });
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">Add Fee Category</div>
        <div className="fs-form-row">
          <div className="fs-flex-200">
            <div className="fs-label">Name *</div>
            <input className="fs-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="fs-flex-300">
            <div className="fs-label">Description</div>
            <input className="fs-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">Fee Categories</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Name</th><th className="fs-th">Description</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}><td className="fs-td">{r.name}</td><td className="fs-td">{r.description || "—"}</td></tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={2}>No fee categories yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Fee Types ──────────────────────────────────────────────────────────────

function FeeTypesTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financeApi.getFeeTypes().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim()) { showFlash("error", "Name is required."); return; }
    setSaving(true);
    try {
      if (editingId) await financeApi.updateFeeType(editingId, { ...form, is_active: true });
      else await financeApi.createFeeType(form);
      showFlash("success", "Fee type saved.");
      setForm({ name: "", description: "" });
      setEditingId(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this fee type?")) return;
    try { await financeApi.deleteFeeType(id); showFlash("success", "Deleted."); load(); }
    catch (e) { showFlash("error", e.response?.data?.detail?.message || "Failed to delete."); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">{editingId ? "Edit Fee Type" : "Add Fee Type"}</div>
        <div className="fs-form-row">
          <div className="fs-flex-200">
            <div className="fs-label">Name *</div>
            <input className="fs-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="fs-flex-300">
            <div className="fs-label">Description</div>
            <input className="fs-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : editingId ? "Save" : "Add"}</button>
          {editingId && <button className="fs-btn-secondary" onClick={() => { setEditingId(null); setForm({ name: "", description: "" }); }}>Cancel</button>}
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">Fee Types</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Name</th><th className="fs-th">Description</th><th className="fs-th">Active</th><th className="fs-th"></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="fs-td">{r.name}</td>
                  <td className="fs-td">{r.description || "—"}</td>
                  <td className="fs-td">{r.is_active ? "Yes" : "No"}</td>
                  <td className="fs-td">
                    <button className="fs-btn-secondary" onClick={() => { setEditingId(r.id); setForm({ name: r.name, description: r.description || "" }); }}>Edit</button>{" "}
                    <button className="fs-btn-danger" onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={4}>No fee types yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Fee Structures ─────────────────────────────────────────────────────────

const emptyStructure = { name: "", amount: "", frequency: "monthly", fee_category_id: "", academic_year_id: "", class_id: "", description: "", late_fee_type: "none", late_fee_amount: "", due_day: "" };

function StructuresTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [classes, setClasses] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyStructure);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financeApi.getStructures().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    financeApi.getCategories().then(r => setCategories(r.data.data || [])).catch(() => {});
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    academicsApi.getYears().then(r => setYears(r.data.data || [])).catch(() => {});
  }, [load]);

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      name: r.name || "", amount: r.amount ?? "", frequency: r.frequency || "monthly",
      fee_category_id: r.fee_category_id ?? "", academic_year_id: r.academic_year_id ?? "",
      class_id: r.class_id ?? "", description: r.description || "",
      late_fee_type: r.late_fee_type || "none", late_fee_amount: r.late_fee_amount ?? "", due_day: r.due_day ?? "",
    });
  };

  const submit = async () => {
    if (!form.name.trim() || !form.amount) { showFlash("error", "Name and amount are required."); return; }
    setSaving(true);
    const body = {
      ...form,
      amount: Number(form.amount),
      fee_category_id: form.fee_category_id || null,
      academic_year_id: form.academic_year_id || null,
      class_id: form.class_id || null,
      late_fee_amount: form.late_fee_amount ? Number(form.late_fee_amount) : 0,
      due_day: form.due_day ? Number(form.due_day) : null,
    };
    try {
      if (editingId) await financeApi.updateStructure(editingId, body);
      else await financeApi.createStructure(body);
      showFlash("success", "Fee structure saved.");
      setForm(emptyStructure);
      setEditingId(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Deactivate this fee structure?")) return;
    try { await financeApi.deleteStructure(id); showFlash("success", "Deactivated."); load(); }
    catch (e) { showFlash("error", e.response?.data?.detail?.message || "Failed to deactivate."); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">{editingId ? "Edit Fee Structure" : "Add Fee Structure"}</div>
        <div className="fs-grid-180">
          <Field><div className="fs-label">Name *</div><input className="fs-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
          <Field><div className="fs-label">Amount *</div><input type="number" className="fs-input" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field><div className="fs-label">Frequency</div>
            <select className="fs-input" value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="one_time">One-Time</option>
            </select>
          </Field>
          <Field><div className="fs-label">Fee Category</div>
            <select className="fs-input" value={form.fee_category_id} onChange={e => setForm(p => ({ ...p, fee_category_id: e.target.value }))}>
              <option value="">— None —</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Class (optional)</div>
            <select className="fs-input" value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
              <option value="">— Whole School —</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Academic Year</div>
            <select className="fs-input" value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— None —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Late Fee Type</div>
            <select className="fs-input" value={form.late_fee_type} onChange={e => setForm(p => ({ ...p, late_fee_type: e.target.value }))}>
              <option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option>
            </select>
          </Field>
          <Field><div className="fs-label">Late Fee Amount</div><input type="number" className="fs-input" value={form.late_fee_amount} onChange={e => setForm(p => ({ ...p, late_fee_amount: e.target.value }))} /></Field>
          <Field><div className="fs-label">Due Day</div><input type="number" className="fs-input" value={form.due_day} onChange={e => setForm(p => ({ ...p, due_day: e.target.value }))} /></Field>
          <Field><div className="fs-label">Description</div><input className="fs-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></Field>
        </div>
        <div className="fs-mt12">
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : editingId ? "Save" : "Add"}</button>{" "}
          {editingId && <button className="fs-btn-secondary" onClick={() => { setEditingId(null); setForm(emptyStructure); }}>Cancel</button>}
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">Fee Structures</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Name</th><th className="fs-th">Amount</th><th className="fs-th">Frequency</th><th className="fs-th">Category</th><th className="fs-th">Class</th><th className="fs-th"></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="fs-td">{r.name}</td>
                  <td className="fs-td">{r.amount}</td>
                  <td className="fs-td">{r.frequency}</td>
                  <td className="fs-td">{r.category_name || "—"}</td>
                  <td className="fs-td">{r.class_name || "Whole School"}</td>
                  <td className="fs-td">
                    <button className="fs-btn-secondary" onClick={() => openEdit(r)}>Edit</button>{" "}
                    <button className="fs-btn-danger" onClick={() => remove(r.id)}>Deactivate</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={6}>No fee structures yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Class Fees ─────────────────────────────────────────────────────────────

function ClassFeesTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ class_id: "", fee_type_id: "", amount: "", academic_year_id: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financeApi.getClassFees().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    financeApi.getFeeTypes().then(r => setFeeTypes(r.data.data || [])).catch(() => {});
    academicsApi.getYears().then(r => setYears(r.data.data || [])).catch(() => {});
  }, [load]);

  const submit = async () => {
    if (!form.class_id || !form.fee_type_id || !form.academic_year_id) { showFlash("error", "Class, fee type and academic year are required."); return; }
    setSaving(true);
    try {
      await financeApi.createClassFee({ ...form, class_id: Number(form.class_id), fee_type_id: Number(form.fee_type_id), academic_year_id: Number(form.academic_year_id), amount: Number(form.amount) || 0 });
      showFlash("success", "Class fee saved.");
      setForm({ class_id: "", fee_type_id: "", amount: "", academic_year_id: "" });
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this class fee?")) return;
    try { await financeApi.deleteClassFee(id); showFlash("success", "Deleted."); load(); }
    catch (e) { showFlash("error", e.response?.data?.detail?.message || "Failed to delete."); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">Add Class Fee</div>
        <div className="fs-form-row">
          <div className="fs-flex-160"><div className="fs-label">Class *</div>
            <select className="fs-input" value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
              <option value="">— Select —</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>)}
            </select>
          </div>
          <div className="fs-flex-160"><div className="fs-label">Fee Type *</div>
            <select className="fs-input" value={form.fee_type_id} onChange={e => setForm(p => ({ ...p, fee_type_id: e.target.value }))}>
              <option value="">— Select —</option>{feeTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="fs-flex-160"><div className="fs-label">Academic Year *</div>
            <select className="fs-input" value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— Select —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div className="fs-flex-120"><div className="fs-label">Amount</div>
            <input type="number" className="fs-input" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">Class Fees</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Class</th><th className="fs-th">Fee Type</th><th className="fs-th">Year</th><th className="fs-th">Amount</th><th className="fs-th"></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="fs-td">{r.class_name}{r.class_section ? ` (${r.class_section})` : ""}</td>
                  <td className="fs-td">{r.fee_type_name}</td>
                  <td className="fs-td">{r.year_name}</td>
                  <td className="fs-td">{r.amount}</td>
                  <td className="fs-td"><button className="fs-btn-danger" onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={5}>No class fees yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Class Fee Config ───────────────────────────────────────────────────────

function ClassFeeConfigTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ class_id: "", academic_year_id: "", tuition_fee: "", due_day: "", late_fee_type: "none", late_fee_amount: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financeApi.getClassFeeConfigs().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    academicsApi.getYears().then(r => setYears(r.data.data || [])).catch(() => {});
  }, [load]);

  const submit = async () => {
    if (!form.class_id || !form.academic_year_id) { showFlash("error", "Class and academic year are required."); return; }
    setSaving(true);
    try {
      await financeApi.saveClassFeeConfig({
        ...form, class_id: Number(form.class_id), academic_year_id: Number(form.academic_year_id),
        tuition_fee: Number(form.tuition_fee) || 0, due_day: form.due_day ? Number(form.due_day) : null,
        late_fee_amount: Number(form.late_fee_amount) || 0,
      });
      showFlash("success", "Class fee config saved.");
      setForm({ class_id: "", academic_year_id: "", tuition_fee: "", due_day: "", late_fee_type: "none", late_fee_amount: "" });
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this class fee config?")) return;
    try { await financeApi.deleteClassFeeConfig(id); showFlash("success", "Deleted."); load(); }
    catch (e) { showFlash("error", e.response?.data?.detail?.message || "Failed to delete."); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">Add / Update Class Fee Config</div>
        <div className="fs-grid-160">
          <Field><div className="fs-label">Class *</div>
            <select className="fs-input" value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
              <option value="">— Select —</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Academic Year *</div>
            <select className="fs-input" value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— Select —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Tuition Fee</div><input type="number" className="fs-input" value={form.tuition_fee} onChange={e => setForm(p => ({ ...p, tuition_fee: e.target.value }))} /></Field>
          <Field><div className="fs-label">Due Day</div><input type="number" className="fs-input" value={form.due_day} onChange={e => setForm(p => ({ ...p, due_day: e.target.value }))} /></Field>
          <Field><div className="fs-label">Late Fee Type</div>
            <select className="fs-input" value={form.late_fee_type} onChange={e => setForm(p => ({ ...p, late_fee_type: e.target.value }))}>
              <option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option><option value="per_day">Per Day</option>
            </select>
          </Field>
          <Field><div className="fs-label">Late Fee Amount</div><input type="number" className="fs-input" value={form.late_fee_amount} onChange={e => setForm(p => ({ ...p, late_fee_amount: e.target.value }))} /></Field>
        </div>
        <div className="fs-mt12">
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">Class Fee Configs</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Class</th><th className="fs-th">Year</th><th className="fs-th">Tuition Fee</th><th className="fs-th">Due Day</th><th className="fs-th"></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="fs-td">{r.class_name}</td>
                  <td className="fs-td">{r.year_name}</td>
                  <td className="fs-td">{r.tuition_fee}</td>
                  <td className="fs-td">{r.due_day ?? "—"}</td>
                  <td className="fs-td"><button className="fs-btn-danger" onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={5}>No class fee configs yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Discount Types ─────────────────────────────────────────────────────────

function DiscountTypesTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", description: "", type: "percentage", value: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    discountsApi.getTypes().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim()) { showFlash("error", "Name is required."); return; }
    setSaving(true);
    const body = { ...form, value: Number(form.value) || 0 };
    try {
      if (editingId) await discountsApi.updateType(editingId, { ...body, is_active: true });
      else await discountsApi.createType(body);
      showFlash("success", "Discount type saved.");
      setForm({ name: "", description: "", type: "percentage", value: "" });
      setEditingId(null);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Deactivate this discount type?")) return;
    try { await discountsApi.deleteType(id); showFlash("success", "Deactivated."); load(); }
    catch (e) { showFlash("error", e.response?.data?.detail?.message || "Failed to deactivate."); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">{editingId ? "Edit Discount Type" : "Add Discount Type"}</div>
        <div className="fs-form-row">
          <div className="fs-flex-160"><div className="fs-label">Name *</div><input className="fs-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="fs-flex-140"><div className="fs-label">Type</div>
            <select className="fs-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="percentage">Percentage</option><option value="fixed">Fixed</option>
            </select>
          </div>
          <div className="fs-flex-120"><div className="fs-label">Value</div><input type="number" className="fs-input" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} /></div>
          <div className="fs-flex-240"><div className="fs-label">Description</div><input className="fs-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : editingId ? "Save" : "Add"}</button>
          {editingId && <button className="fs-btn-secondary" onClick={() => { setEditingId(null); setForm({ name: "", description: "", type: "percentage", value: "" }); }}>Cancel</button>}
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">Discount Types</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Name</th><th className="fs-th">Type</th><th className="fs-th">Value</th><th className="fs-th"></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="fs-td">{r.name}</td>
                  <td className="fs-td">{r.type}</td>
                  <td className="fs-td">{r.value}</td>
                  <td className="fs-td">
                    <button className="fs-btn-secondary" onClick={() => { setEditingId(r.id); setForm({ name: r.name, description: r.description || "", type: r.type, value: r.value }); }}>Edit</button>{" "}
                    <button className="fs-btn-danger" onClick={() => remove(r.id)}>Deactivate</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={4}>No discount types yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Discount Config (singleton) ───────────────────────────────────────────

function DiscountConfigTab({ showFlash }) {
  const [feeTypes, setFeeTypes] = useState([]);
  const [onAll, setOnAll] = useState(false);
  const [selectedFeeTypeIds, setSelectedFeeTypeIds] = useState([]);
  const [siblingRankMethod, setSiblingRankMethod] = useState("class");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    financeApi.getFeeTypes().then(r => setFeeTypes(r.data.data || [])).catch(() => {});
    financeApi.getDiscountConfig().then(r => {
      const d = r.data.data || {};
      setOnAll(!!d.on_all);
      setSiblingRankMethod(d.sibling_rank_method || "class");
      setSelectedFeeTypeIds((d.fee_type_ids || []).map(String));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleFeeType = (id) => {
    setSelectedFeeTypeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const submit = async () => {
    setSaving(true);
    try {
      await financeApi.saveDiscountConfig({
        on_all: onAll,
        fee_type_ids: selectedFeeTypeIds.map(Number),
        sibling_rank_method: siblingRankMethod,
      });
      showFlash("success", "Discount config saved.");
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="fs-card">Loading...</div>;

  return (
    <div className="fs-card">
      <div className="fs-section-title">Discount Apply Rules</div>
      <Field>
        <label className="fs-checkbox-label">
          <input type="checkbox" checked={onAll} onChange={e => setOnAll(e.target.checked)} />
          Apply discounts to all fee types
        </label>
      </Field>
      {!onAll && (
        <Field>
          <div className="fs-label">Fee types eligible for discounts</div>
          <div className="fs-chip-row">
            {feeTypes.map(ft => (
              <label key={ft.id} className="fs-chip-label">
                <input type="checkbox" checked={selectedFeeTypeIds.includes(String(ft.id))} onChange={() => toggleFeeType(String(ft.id))} />
                {ft.name}
              </label>
            ))}
          </div>
        </Field>
      )}
      <Field>
        <div className="fs-label">Sibling Rank Method</div>
        <select className="fs-input fs-select-wide" value={siblingRankMethod} onChange={e => setSiblingRankMethod(e.target.value)}>
          <option value="class">By Class (oldest first)</option>
          <option value="registration_no">By Registration Number</option>
          <option value="dob">By Date of Birth</option>
        </select>
      </Field>
      <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Save"}</button>
    </div>
  );
}

// ─── One-Time Charges ───────────────────────────────────────────────────────

const emptyCharge = { name: "", amount: "", charge_type_id: "", apply_month: "", apply_year: "", target_type: "whole_school", class_ids: [], academic_year_id: "", description: "" };

function ChargesTab({ showFlash }) {
  const [rows, setRows] = useState([]);
  const [chargeTypes, setChargeTypes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyCharge);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financeApi.getFeeCharges().then(r => setRows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    financeApi.getChargeTypes().then(r => setChargeTypes(r.data.data || [])).catch(() => {});
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    academicsApi.getYears().then(r => setYears(r.data.data || [])).catch(() => {});
  }, [load]);

  const toggleClass = (id) => {
    setForm(p => ({ ...p, class_ids: p.class_ids.includes(id) ? p.class_ids.filter(x => x !== id) : [...p.class_ids, id] }));
  };

  const submit = async () => {
    if (!form.name.trim() || !form.amount || !form.charge_type_id) { showFlash("error", "Name, amount and charge type are required."); return; }
    if (form.target_type === "classes" && form.class_ids.length === 0) { showFlash("error", "Select at least one class."); return; }
    setSaving(true);
    const body = {
      name: form.name, amount: Number(form.amount), charge_type_id: Number(form.charge_type_id),
      apply_month: form.apply_month ? Number(form.apply_month) : null,
      apply_year: form.apply_year ? Number(form.apply_year) : null,
      target_type: form.target_type,
      class_ids: form.target_type === "classes" ? form.class_ids.map(Number) : [],
      student_ids: [],
      academic_year_id: form.academic_year_id ? Number(form.academic_year_id) : null,
      description: form.description || null,
    };
    try {
      await financeApi.createFeeCharge(body);
      showFlash("success", "Charge created.");
      setForm(emptyCharge);
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.detail?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this charge?")) return;
    try { await financeApi.deleteFeeCharge(id); showFlash("success", "Deleted."); load(); }
    catch (e) { showFlash("error", e.response?.data?.detail?.message || "Failed to delete."); }
  };

  return (
    <div>
      <div className="fs-card">
        <div className="fs-section-title">Add One-Time Charge</div>
        <div className="fs-grid-180">
          <Field><div className="fs-label">Name *</div><input className="fs-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
          <Field><div className="fs-label">Amount *</div><input type="number" className="fs-input" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field><div className="fs-label">Charge Type *</div>
            <select className="fs-input" value={form.charge_type_id} onChange={e => setForm(p => ({ ...p, charge_type_id: e.target.value }))}>
              <option value="">— Select —</option>{chargeTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Apply Month</div><input type="number" min="1" max="12" className="fs-input" value={form.apply_month} onChange={e => setForm(p => ({ ...p, apply_month: e.target.value }))} /></Field>
          <Field><div className="fs-label">Apply Year</div><input type="number" className="fs-input" value={form.apply_year} onChange={e => setForm(p => ({ ...p, apply_year: e.target.value }))} /></Field>
          <Field><div className="fs-label">Academic Year</div>
            <select className="fs-input" value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— None —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <Field><div className="fs-label">Applies To</div>
            <select className="fs-input" value={form.target_type} onChange={e => setForm(p => ({ ...p, target_type: e.target.value, class_ids: [] }))}>
              <option value="whole_school">Whole School</option><option value="classes">Specific Classes</option>
            </select>
          </Field>
          <Field><div className="fs-label">Description</div><input className="fs-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></Field>
        </div>
        {form.target_type === "classes" && (
          <div className="fs-mt10">
            <div className="fs-label">Classes</div>
            <div className="fs-chip-row">
              {classes.map(c => (
                <label key={c.id} className="fs-chip-label">
                  <input type="checkbox" checked={form.class_ids.includes(c.id)} onChange={() => toggleClass(c.id)} />
                  {c.name}{c.section ? ` (${c.section})` : ""}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="fs-mt12">
          <button className="fs-btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
      <div className="fs-card">
        <div className="fs-section-title">One-Time Charges</div>
        {loading ? <div>Loading...</div> : (
          <table className="fs-full-table">
            <thead><tr><th className="fs-th">Name</th><th className="fs-th">Amount</th><th className="fs-th">Applies To</th><th className="fs-th">Active</th><th className="fs-th"></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="fs-td">{r.name}</td>
                  <td className="fs-td">{r.amount}</td>
                  <td className="fs-td">{r.target_type === "whole_school" ? "Whole School" : (r.class_labels || []).join(", ") || r.target_type}</td>
                  <td className="fs-td">{r.is_active ? "Yes" : "No"}</td>
                  <td className="fs-td"><button className="fs-btn-danger" onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="fs-td" colSpan={5}>No one-time charges yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
