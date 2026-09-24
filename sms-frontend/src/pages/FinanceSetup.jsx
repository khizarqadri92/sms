import React, { useState, useEffect, useCallback } from "react";
import financeApi from "../api/financeApi";
import discountsApi from "../api/discountsApi";
import academicsApi from "../api/academicsApi";
import { setForceGlobalScope } from "../api/client";

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

const th = { textAlign: "left", padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#475569", borderBottom: "1px solid #e2e8f0" };
const td = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid #f1f5f9" };
const btnPrimary = { background: "var(--theme-primary, #2563eb)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondary = { background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnDanger = { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const inputStyle = { fontSize: 13, padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%" };
const label = { fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 };
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 };
const sectionTitle = { fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#0f172a" };

function Field({ children }) {
  return <div style={{ marginBottom: 10 }}>{children}</div>;
}

function Banner() {
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400e", marginBottom: 16 }}>
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
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 4 }}>Finance Setup</h2>
      <Banner />
      {flash && (
        <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
          background: flash.type === "error" ? "#fef2f2" : "#f0fdf4", color: flash.type === "error" ? "#dc2626" : "#15803d" }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "7px 14px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer",
              background: tab === t.key ? "var(--theme-primary, #2563eb)" : "#f1f5f9",
              color: tab === t.key ? "#fff" : "#475569",
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
      <div style={card}>
        <div style={sectionTitle}>Add Fee Category</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <div style={label}>Name *</div>
            <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ flex: "2 1 300px" }}>
            <div style={label}>Description</div>
            <input style={inputStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>Fee Categories</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Description</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}><td style={td}>{r.name}</td><td style={td}>{r.description || "—"}</td></tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={2}>No fee categories yet.</td></tr>}
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
      <div style={card}>
        <div style={sectionTitle}>{editingId ? "Edit Fee Type" : "Add Fee Type"}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <div style={label}>Name *</div>
            <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ flex: "2 1 300px" }}>
            <div style={label}>Description</div>
            <input style={inputStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : editingId ? "Save" : "Add"}</button>
          {editingId && <button style={btnSecondary} onClick={() => { setEditingId(null); setForm({ name: "", description: "" }); }}>Cancel</button>}
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>Fee Types</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Description</th><th style={th}>Active</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.description || "—"}</td>
                  <td style={td}>{r.is_active ? "Yes" : "No"}</td>
                  <td style={td}>
                    <button style={btnSecondary} onClick={() => { setEditingId(r.id); setForm({ name: r.name, description: r.description || "" }); }}>Edit</button>{" "}
                    <button style={btnDanger} onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={4}>No fee types yet.</td></tr>}
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
      <div style={card}>
        <div style={sectionTitle}>{editingId ? "Edit Fee Structure" : "Add Fee Structure"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <Field><div style={label}>Name *</div><input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
          <Field><div style={label}>Amount *</div><input type="number" style={inputStyle} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field><div style={label}>Frequency</div>
            <select style={inputStyle} value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="one_time">One-Time</option>
            </select>
          </Field>
          <Field><div style={label}>Fee Category</div>
            <select style={inputStyle} value={form.fee_category_id} onChange={e => setForm(p => ({ ...p, fee_category_id: e.target.value }))}>
              <option value="">— None —</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Class (optional)</div>
            <select style={inputStyle} value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
              <option value="">— Whole School —</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Academic Year</div>
            <select style={inputStyle} value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— None —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Late Fee Type</div>
            <select style={inputStyle} value={form.late_fee_type} onChange={e => setForm(p => ({ ...p, late_fee_type: e.target.value }))}>
              <option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option>
            </select>
          </Field>
          <Field><div style={label}>Late Fee Amount</div><input type="number" style={inputStyle} value={form.late_fee_amount} onChange={e => setForm(p => ({ ...p, late_fee_amount: e.target.value }))} /></Field>
          <Field><div style={label}>Due Day</div><input type="number" style={inputStyle} value={form.due_day} onChange={e => setForm(p => ({ ...p, due_day: e.target.value }))} /></Field>
          <Field><div style={label}>Description</div><input style={inputStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : editingId ? "Save" : "Add"}</button>{" "}
          {editingId && <button style={btnSecondary} onClick={() => { setEditingId(null); setForm(emptyStructure); }}>Cancel</button>}
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>Fee Structures</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Amount</th><th style={th}>Frequency</th><th style={th}>Category</th><th style={th}>Class</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.amount}</td>
                  <td style={td}>{r.frequency}</td>
                  <td style={td}>{r.category_name || "—"}</td>
                  <td style={td}>{r.class_name || "Whole School"}</td>
                  <td style={td}>
                    <button style={btnSecondary} onClick={() => openEdit(r)}>Edit</button>{" "}
                    <button style={btnDanger} onClick={() => remove(r.id)}>Deactivate</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={6}>No fee structures yet.</td></tr>}
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
      <div style={card}>
        <div style={sectionTitle}>Add Class Fee</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}><div style={label}>Class *</div>
            <select style={inputStyle} value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
              <option value="">— Select —</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}><div style={label}>Fee Type *</div>
            <select style={inputStyle} value={form.fee_type_id} onChange={e => setForm(p => ({ ...p, fee_type_id: e.target.value }))}>
              <option value="">— Select —</option>{feeTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}><div style={label}>Academic Year *</div>
            <select style={inputStyle} value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— Select —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}><div style={label}>Amount</div>
            <input type="number" style={inputStyle} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>Class Fees</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Class</th><th style={th}>Fee Type</th><th style={th}>Year</th><th style={th}>Amount</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.class_name}{r.class_section ? ` (${r.class_section})` : ""}</td>
                  <td style={td}>{r.fee_type_name}</td>
                  <td style={td}>{r.year_name}</td>
                  <td style={td}>{r.amount}</td>
                  <td style={td}><button style={btnDanger} onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={5}>No class fees yet.</td></tr>}
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
      <div style={card}>
        <div style={sectionTitle}>Add / Update Class Fee Config</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <Field><div style={label}>Class *</div>
            <select style={inputStyle} value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
              <option value="">— Select —</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Academic Year *</div>
            <select style={inputStyle} value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— Select —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Tuition Fee</div><input type="number" style={inputStyle} value={form.tuition_fee} onChange={e => setForm(p => ({ ...p, tuition_fee: e.target.value }))} /></Field>
          <Field><div style={label}>Due Day</div><input type="number" style={inputStyle} value={form.due_day} onChange={e => setForm(p => ({ ...p, due_day: e.target.value }))} /></Field>
          <Field><div style={label}>Late Fee Type</div>
            <select style={inputStyle} value={form.late_fee_type} onChange={e => setForm(p => ({ ...p, late_fee_type: e.target.value }))}>
              <option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option><option value="per_day">Per Day</option>
            </select>
          </Field>
          <Field><div style={label}>Late Fee Amount</div><input type="number" style={inputStyle} value={form.late_fee_amount} onChange={e => setForm(p => ({ ...p, late_fee_amount: e.target.value }))} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>Class Fee Configs</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Class</th><th style={th}>Year</th><th style={th}>Tuition Fee</th><th style={th}>Due Day</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.class_name}</td>
                  <td style={td}>{r.year_name}</td>
                  <td style={td}>{r.tuition_fee}</td>
                  <td style={td}>{r.due_day ?? "—"}</td>
                  <td style={td}><button style={btnDanger} onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={5}>No class fee configs yet.</td></tr>}
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
      <div style={card}>
        <div style={sectionTitle}>{editingId ? "Edit Discount Type" : "Add Discount Type"}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}><div style={label}>Name *</div><input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div style={{ flex: "1 1 140px" }}><div style={label}>Type</div>
            <select style={inputStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="percentage">Percentage</option><option value="fixed">Fixed</option>
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}><div style={label}>Value</div><input type="number" style={inputStyle} value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} /></div>
          <div style={{ flex: "2 1 240px" }}><div style={label}>Description</div><input style={inputStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : editingId ? "Save" : "Add"}</button>
          {editingId && <button style={btnSecondary} onClick={() => { setEditingId(null); setForm({ name: "", description: "", type: "percentage", value: "" }); }}>Cancel</button>}
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>Discount Types</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Type</th><th style={th}>Value</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.type}</td>
                  <td style={td}>{r.value}</td>
                  <td style={td}>
                    <button style={btnSecondary} onClick={() => { setEditingId(r.id); setForm({ name: r.name, description: r.description || "", type: r.type, value: r.value }); }}>Edit</button>{" "}
                    <button style={btnDanger} onClick={() => remove(r.id)}>Deactivate</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={4}>No discount types yet.</td></tr>}
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

  if (loading) return <div style={card}>Loading...</div>;

  return (
    <div style={card}>
      <div style={sectionTitle}>Discount Apply Rules</div>
      <Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={onAll} onChange={e => setOnAll(e.target.checked)} />
          Apply discounts to all fee types
        </label>
      </Field>
      {!onAll && (
        <Field>
          <div style={label}>Fee types eligible for discounts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {feeTypes.map(ft => (
              <label key={ft.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                <input type="checkbox" checked={selectedFeeTypeIds.includes(String(ft.id))} onChange={() => toggleFeeType(String(ft.id))} />
                {ft.name}
              </label>
            ))}
          </div>
        </Field>
      )}
      <Field>
        <div style={label}>Sibling Rank Method</div>
        <select style={{ ...inputStyle, maxWidth: 260 }} value={siblingRankMethod} onChange={e => setSiblingRankMethod(e.target.value)}>
          <option value="class">By Class (oldest first)</option>
          <option value="registration_no">By Registration Number</option>
          <option value="dob">By Date of Birth</option>
        </select>
      </Field>
      <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : "Save"}</button>
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
      <div style={card}>
        <div style={sectionTitle}>Add One-Time Charge</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <Field><div style={label}>Name *</div><input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
          <Field><div style={label}>Amount *</div><input type="number" style={inputStyle} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field><div style={label}>Charge Type *</div>
            <select style={inputStyle} value={form.charge_type_id} onChange={e => setForm(p => ({ ...p, charge_type_id: e.target.value }))}>
              <option value="">— Select —</option>{chargeTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Apply Month</div><input type="number" min="1" max="12" style={inputStyle} value={form.apply_month} onChange={e => setForm(p => ({ ...p, apply_month: e.target.value }))} /></Field>
          <Field><div style={label}>Apply Year</div><input type="number" style={inputStyle} value={form.apply_year} onChange={e => setForm(p => ({ ...p, apply_year: e.target.value }))} /></Field>
          <Field><div style={label}>Academic Year</div>
            <select style={inputStyle} value={form.academic_year_id} onChange={e => setForm(p => ({ ...p, academic_year_id: e.target.value }))}>
              <option value="">— None —</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <Field><div style={label}>Applies To</div>
            <select style={inputStyle} value={form.target_type} onChange={e => setForm(p => ({ ...p, target_type: e.target.value, class_ids: [] }))}>
              <option value="whole_school">Whole School</option><option value="classes">Specific Classes</option>
            </select>
          </Field>
          <Field><div style={label}>Description</div><input style={inputStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></Field>
        </div>
        {form.target_type === "classes" && (
          <div style={{ marginTop: 10 }}>
            <div style={label}>Classes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {classes.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.class_ids.includes(c.id)} onChange={() => toggleClass(c.id)} />
                  {c.name}{c.section ? ` (${c.section})` : ""}
                </label>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button style={btnPrimary} disabled={saving} onClick={submit}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
      <div style={card}>
        <div style={sectionTitle}>One-Time Charges</div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Amount</th><th style={th}>Applies To</th><th style={th}>Active</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.amount}</td>
                  <td style={td}>{r.target_type === "whole_school" ? "Whole School" : (r.class_labels || []).join(", ") || r.target_type}</td>
                  <td style={td}>{r.is_active ? "Yes" : "No"}</td>
                  <td style={td}><button style={btnDanger} onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={5}>No one-time charges yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
