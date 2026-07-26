import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const STATUS_COLORS = {
  draft: { bg: "#f8fafc", color: "#64748b" },
  hr_submitted: { bg: "#eff6ff", color: "#1d4ed8" },
  pending_approval: { bg: "#fefce8", color: "#854d0e" },
  approved: { bg: "#f0fdf4", color: "#166534" },
  released: { bg: "#ecfdf5", color: "#047857" },
};
const STATUS_LABELS = {
  draft: "Draft (HR Configuring)", hr_submitted: "With Finance", pending_approval: "Pending Approval",
  approved: "Approved", released: "Released",
};

export default function PayrollRuns() {
  const now = new Date();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [creating, setCreating] = useState(false);

  const defaultRange = (month, year) => {
    const pad = n => String(n).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(lastDay)}`];
  };
  const [defFrom, defTo] = defaultRange(now.getMonth() + 1, now.getFullYear());
  const [newFromDate, setNewFromDate] = useState(defFrom);
  const [newToDate, setNewToDate] = useState(defTo);

  useEffect(() => {
    const [f, t] = defaultRange(Number(newMonth), Number(newYear));
    setNewFromDate(f);
    setNewToDate(t);
  }, [newMonth, newYear]);

  const [viewingRun, setViewingRun] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [expandedStaffId, setExpandedStaffId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hrSummary, setHrSummary] = useState([]);
  const [selectedSummaryStaffId, setSelectedSummaryStaffId] = useState(null);

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 5000); };

  const load = useCallback((isBackground = false) => {
    if (!isBackground) setLoading(true);
    payrollApi.getPayrollRuns().then(r => setRuns(r.data.data || [])).catch(() => {}).finally(() => { if (!isBackground) setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const createRun = async () => {
    setCreating(true);
    try {
      const r = await payrollApi.createPayrollRun({ month: Number(newMonth), year: Number(newYear), from_date: newFromDate, to_date: newToDate });
      showFlash("success", "Payroll run created.");
      load(true);
      openRun({ id: r.data.data.id, month: Number(newMonth), year: Number(newYear), status: "draft", from_date: newFromDate, to_date: newToDate });
    } catch (e) {
      showFlash("error", e.response?.data?.message || e.response?.data?.detail?.message || "Failed to create.");
    } finally {
      setCreating(false);
    }
  };

  const openRun = (run) => {
    setViewingRun(run);
    setExpandedStaffId(null);
    setSelectedSummaryStaffId(null);
    if (run.status === "draft") {
      payrollApi.hrSummaryPayrollRun(run.id).then(r => setHrSummary(r.data.data || [])).catch(() => setHrSummary([]));
    } else {
      payrollApi.getPayslips(run.id).then(r => setPayslips(r.data.data || [])).catch(() => setPayslips([]));
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await payrollApi.generatePayrollRun(viewingRun.id);
      showFlash("success", r.data.message);
      openRun(viewingRun);
      load(true);
    } catch (e) {
      showFlash("error", e.response?.data?.message || e.response?.data?.detail?.message || "Failed to generate.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!window.confirm("Submit this payroll run for approval? You won't be able to regenerate it until it's rejected.")) return;
    setBusy(true);
    try {
      await payrollApi.submitPayrollRun(viewingRun.id);
      showFlash("success", "Submitted for approval.");
      setViewingRun(null);
      load(true);
    } catch (e) {
      showFlash("error", e.response?.data?.message || e.response?.data?.detail?.message || "Failed to submit.");
    } finally {
      setBusy(false);
    }
  };

  const hrSubmit = async () => {
    if (!window.confirm("Submit this period to Finance? You won't be able to add more adjustments for this month afterward.")) return;
    setBusy(true);
    try {
      await payrollApi.hrSubmitPayrollRun(viewingRun.id);
      showFlash("success", "Submitted to Finance.");
      setViewingRun(null);
      load(true);
    } catch (e) {
      showFlash("error", e.response?.data?.message || e.response?.data?.detail?.message || "Failed to submit.");
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!window.confirm("Release this payroll for salary transfer? This is final.")) return;
    setBusy(true);
    try {
      await payrollApi.releasePayrollRun(viewingRun.id);
      showFlash("success", "Payroll released for salary transfer.");
      setViewingRun(null);
      load(true);
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to release.");
    } finally {
      setBusy(false);
    }
  };

  const totalNet = payslips.reduce((s, p) => s + Number(p.net_pay), 0);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 950, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Payroll Runs</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Generate, review, and approve monthly payroll</div>
      </div>

      {flash && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: flash.type === "success" ? "#dcfce7" : "#fee2e2",
          color: flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Month</label>
          <select className="form-input" style={{ fontSize: 13, width: 160 }} value={newMonth} onChange={e => setNewMonth(e.target.value)}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Year</label>
          <input type="number" className="form-input" style={{ fontSize: 13, width: 100 }} value={newYear} onChange={e => setNewYear(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>From</label>
          <input type="date" className="form-input" style={{ fontSize: 13, width: 150 }} value={newFromDate} onChange={e => setNewFromDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>To</label>
          <input type="date" className="form-input" style={{ fontSize: 13, width: 150 }} value={newToDate} onChange={e => setNewToDate(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={creating} onClick={createRun}>
          {creating ? "Creating..." : "+ New Payroll Run"}
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Period", "Status", "Employees Ready", "Adjustments Entered", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const sc = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
              const allReady = r.total_active_staff > 0 && r.employees_ready >= r.total_active_staff;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{MONTH_NAMES[r.month - 1]} {r.year}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.color }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13, color: allReady ? "#166534" : "#dc2626", fontWeight: 600 }}>
                    {r.employees_ready} / {r.total_active_staff}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{r.adjustments_count}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openRun(r)}>View</button>
                  </td>
                </tr>
              );
            })}
            {runs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No payroll runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewingRun && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 820, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{MONTH_NAMES[viewingRun.month - 1]} {viewingRun.year} Payroll</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  <span style={{
                    fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                    background: (STATUS_COLORS[viewingRun.status] || STATUS_COLORS.draft).bg,
                    color: (STATUS_COLORS[viewingRun.status] || STATUS_COLORS.draft).color
                  }}>{STATUS_LABELS[viewingRun.status] || viewingRun.status}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewingRun(null)}>Close</button>
            </div>
            <div style={{ padding: 20 }}>
              {viewingRun.status === "draft" && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#475569" }}>
                    HR: configure incentives/arrears for this period in Payroll Adjustments, then submit to Finance when done.
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={busy} onClick={hrSubmit}>
                    Submit to Finance
                  </button>
                </div>
              )}
              {viewingRun.status === "hr_submitted" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} disabled={busy} onClick={generate}>
                    {busy ? "Working..." : (payslips.length ? "Regenerate Payslips" : "Generate Payslips")}
                  </button>
                  {payslips.length > 0 && (
                    <button className="btn btn-primary btn-sm" style={{ color: "#fff", background: "#166534" }} disabled={busy} onClick={submit}>
                      Submit for Approval
                    </button>
                  )}
                </div>
              )}
              {viewingRun.status === "pending_approval" && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fefce8", borderRadius: 8, fontSize: 13, color: "#854d0e" }}>
                  Awaiting Finance Manager approval - check the Work Queue. If rejected, this run returns to HR for reconfiguration.
                </div>
              )}
              {viewingRun.status === "approved" && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 10, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: 13, color: "#166534" }}>
                    Approved by Finance Manager. Release when ready to process salary transfer.
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff", background: "#047857" }} disabled={busy} onClick={release}>
                    Release for Salary Transfer
                  </button>
                </div>
              )}
              {viewingRun.status === "released" && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "#ecfdf5", borderRadius: 8, fontSize: 13, color: "#047857", fontWeight: 600 }}>
                  Released for salary transfer. This run is now permanently frozen.
                </div>
              )}

              {viewingRun.status === "draft" ? (
                <div style={{ display: "grid", gridTemplateColumns: selectedSummaryStaffId ? "240px 1fr" : "1fr", gap: 16 }}>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", maxHeight: 440, overflowY: "auto" }}>
                    {hrSummary.map(s => (
                      <div key={s.staff_id} onClick={() => setSelectedSummaryStaffId(s.staff_id)}
                        style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                          background: selectedSummaryStaffId === s.staff_id ? "#eff6ff" : "#fff" }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.staff_name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize" }}>{s.salary_type.replace("_", " ")}</div>
                      </div>
                    ))}
                    {hrSummary.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No employees with a salary profile yet.</div>}
                  </div>
                  {selectedSummaryStaffId && (() => {
                    const s = hrSummary.find(x => x.staff_id === selectedSummaryStaffId);
                    if (!s) return null;
                    return (
                      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{s.staff_name}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 11, color: "#166534", marginBottom: 6 }}>INCLUDED IN SALARY</div>
                            {s.earning_items.map((name, i) => <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>{name}</div>)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 11, color: "#dc2626", marginBottom: 6 }}>DEDUCTIONS</div>
                            {s.deduction_items.map((name, i) => <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>{name}</div>)}
                          </div>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 11, color: "#1d4ed8", marginBottom: 6 }}>THIS MONTH'S ADJUSTMENTS</div>
                          {s.adjustments.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>None configured</div>}
                          {s.adjustments.map((a, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                              <span>{a.name} <span style={{ color: a.type === "earning" ? "#166534" : "#dc2626", fontSize: 10 }}>({a.type})</span></span>
                              <span>{a.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 11, color: "#64748b" }}>
                          <span>Present: {s.days_present}</span>
                          <span>Absent: {s.days_absent}</span>
                          <span>Half Day: {s.days_half_day}</span>
                          <span>On Leave: {s.days_on_leave}</span>
                          {s.hours_worked > 0 && <span>Hours: {s.hours_worked}</span>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 10, fontSize: 13, color: "#64748b" }}>
                    {payslips.length} employee(s) &middot; Total Net Pay: <strong style={{ color: "#0f172a" }}>{totalNet.toLocaleString()}</strong>
                  </div>

                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Employee", "Type", "Gross", "Deductions", "Net Pay", ""].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payslips.map(p => (
                          <React.Fragment key={p.id}>
                            <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "8px 10px", fontWeight: 600, fontSize: 13 }}>{p.staff_name}</td>
                              <td style={{ padding: "8px 10px", fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{p.salary_type.replace("_", " ")}</td>
                              <td style={{ padding: "8px 10px", fontSize: 13 }}>{Number(p.gross_earnings).toLocaleString()}</td>
                              <td style={{ padding: "8px 10px", fontSize: 13, color: "#dc2626" }}>{Number(p.total_deductions).toLocaleString()}</td>
                              <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700 }}>{Number(p.net_pay).toLocaleString()}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                                  onClick={() => setExpandedStaffId(expandedStaffId === p.id ? null : p.id)}>
                                  {expandedStaffId === p.id ? "Hide" : "Details"}
                                </button>
                              </td>
                            </tr>
                            {expandedStaffId === p.id && (
                              <tr>
                                <td colSpan={6} style={{ padding: "10px 16px", background: "#f8fafc" }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: 11, color: "#166534", marginBottom: 6 }}>EARNINGS</div>
                                      {(p.earnings_breakdown || []).map((e, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                          <span>{e.name}</span><span>{Number(e.amount).toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: 11, color: "#dc2626", marginBottom: 6 }}>DEDUCTIONS</div>
                                      {(p.deductions_breakdown || []).map((d, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                          <span>{d.name}</span><span>{Number(d.amount).toLocaleString()}</span>
                                        </div>
                                      ))}
                                      {(p.deductions_breakdown || []).length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>None</div>}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 11, color: "#64748b" }}>
                                    <span>Present: {p.days_present}</span>
                                    <span>Absent: {p.days_absent}</span>
                                    <span>Half Day: {p.days_half_day}</span>
                                    <span>On Leave: {p.days_on_leave}</span>
                                    {Number(p.hours_worked) > 0 && <span>Hours: {p.hours_worked}</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {payslips.length === 0 && (
                          <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No payslips generated yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
