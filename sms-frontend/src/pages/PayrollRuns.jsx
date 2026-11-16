import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";
import { useAuth } from "../auth/AuthContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import DatePicker from "../components/DatePicker";
import "./PayrollRuns.css";

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
  approved: "Approved", released: "Completed",
};

export default function PayrollRuns() {
  const { can } = useAuth();
  const processingToday = useProcessingToday();
  const now = new Date(processingToday);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);
  const [newYear, setNewYear] = useState(now.getFullYear());
  useEffect(() => {
    const d = new Date(processingToday);
    setNewMonth(d.getMonth() + 1);
    setNewYear(d.getFullYear());
  }, [processingToday]);
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

  const downloadSlip = async (runId, staffId, staffName) => {
    try {
      const r = await payrollApi.downloadSalarySlip(runId, staffId);
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `SalarySlip_${staffName}.pdf`.replace(/\s+/g,"_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showFlash("error", "Failed to download salary slip.");
    }
  };

  const sendAllSlips = async (runId) => {
    if (!window.confirm("Send salary slip notification to all employees in this run?")) return;
    try {
      const r = await payrollApi.sendPayslips(runId);
      showFlash("success", r.data.message || "Salary slips sent.");
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to send salary slips.");
    }
  };

  const downloadPayroll = async (runId) => {
    try {
      const r = await payrollApi.downloadPayrollRun(runId);
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payroll_${runId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showFlash("error", "Failed to download payroll.");
    }
  };

  const markDone = async (runId) => {
    if (!window.confirm("Mark adjustments as done for this period? Make sure all incentives/arrears have been entered.")) return;
    try {
      await payrollApi.markAdjustmentsDone(runId);
      showFlash("success", "Adjustments marked done.");
      load(true);
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed.");
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

  if (loading) return <div className="pr-loading">Loading...</div>;

  return (
    <div className="pr-page">
      <div className="pr-header">
        <div className="pr-title">Payroll Runs</div>
        <div className="pr-subtitle">Generate, review, and approve monthly payroll</div>
      </div>

      {flash && (
        <div className="pr-flash" style={{
          "--flash-bg": flash.type === "success" ? "#dcfce7" : "#fee2e2",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      {can("payroll.create_run") && (
        <div className="pr-create-row">
          <div>
            <label className="pr-field-label">Month</label>
            <select className="form-input pr-month-select" value={newMonth} onChange={e => setNewMonth(e.target.value)}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="pr-field-label">Year</label>
            <input type="number" className="form-input pr-year-input" value={newYear} onChange={e => setNewYear(e.target.value)} />
          </div>
          <div>
            <label className="pr-field-label">From</label>
            <DatePicker style={{ fontSize: 13, width: 150 }} value={newFromDate} onChange={val => setNewFromDate(val)} />
          </div>
          <div>
            <label className="pr-field-label">To</label>
            <DatePicker style={{ fontSize: 13, width: 150 }} value={newToDate} onChange={val => setNewToDate(val)} />
          </div>
          <button className="btn btn-primary btn-sm pr-start-btn" disabled={creating} onClick={createRun}>
            {creating ? "Starting..." : "Start Payroll Process"}
          </button>
        </div>
      )}

      <div className="pr-table-wrap">
        <table className="pr-table">
          <thead>
            <tr className="pr-th-row">
              {["Period", "Status", "Employees Ready", "Adjustments Entered", ""].map(h => (
                <th key={h} className="pr-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const sc = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
              const allReady = r.total_active_staff > 0 && r.employees_ready >= r.total_active_staff;
              return (
                <tr key={r.id} className="pr-tr">
                  <td className="pr-td-period">{MONTH_NAMES[r.month - 1]} {r.year}</td>
                  <td className="pr-td-status">
                    <span className="pr-status-badge" style={{ "--badge-bg": sc.bg, "--badge-color": sc.color }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className="pr-td-ready" style={{ "--ready-color": allReady ? "#166534" : "#dc2626" }}>
                    {r.employees_ready} / {r.total_active_staff}
                  </td>
                  <td className="pr-td-adj-count">{r.adjustments_count}</td>
                  <td className="pr-td-action">
                    {r.status === "draft" && !r.adjustments_done ? (
                      <button className="btn btn-primary btn-sm pr-action-btn" onClick={() => markDone(r.id)}>Adjustment Done</button>
                    ) : (
                      <button className="btn btn-ghost btn-sm pr-view-btn" onClick={() => openRun(r)}>View</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {runs.length === 0 && (
              <tr><td colSpan={5} className="pr-empty-td">No payroll runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewingRun && (
        <div className="pr-modal-overlay">
          <div className="pr-modal-box">
            <div className="pr-modal-header">
              <div>
                <div className="pr-modal-title">{MONTH_NAMES[viewingRun.month - 1]} {viewingRun.year} Payroll</div>
                <div className="pr-modal-subtext">
                  <span className="pr-modal-status-badge" style={{
                    "--badge-bg": (STATUS_COLORS[viewingRun.status] || STATUS_COLORS.draft).bg,
                    "--badge-color": (STATUS_COLORS[viewingRun.status] || STATUS_COLORS.draft).color
                  }}>{STATUS_LABELS[viewingRun.status] || viewingRun.status}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewingRun(null)}>Close</button>
            </div>
            <div className="pr-modal-body">
              {viewingRun.status === "draft" && (
                <div className="pr-hr-submit-section">
                  <div className="pr-hr-submit-note">
                    HR: configure incentives/arrears for this period in Payroll Adjustments, then submit to Finance when done.
                  </div>
                  <button className="btn btn-primary btn-sm pr-download-btn" disabled={busy} onClick={hrSubmit}>
                    Submit to Finance
                  </button>
                </div>
              )}
              {viewingRun.status === "hr_submitted" && (
                <div className="pr-action-row-gap8">
                  <button className="btn btn-primary btn-sm pr-download-btn" disabled={busy} onClick={generate}>
                    {busy ? "Working..." : (payslips.length ? "Regenerate Payslips" : "Generate Payslips")}
                  </button>
                  {payslips.length > 0 && (
                    <button className="btn btn-primary btn-sm pr-submit-btn-green" disabled={busy} onClick={submit}>
                      Submit for Approval
                    </button>
                  )}
                </div>
              )}
              {viewingRun.status === "pending_approval" && (
                <div className="pr-pending-note">
                  Awaiting Finance Manager approval - check the Work Queue. If rejected, this run returns to HR for reconfiguration.
                </div>
              )}
              {viewingRun.status === "approved" && (
                <div className="pr-approved-section">
                  <div className="pr-approved-note">
                    Approved by Finance Manager. Release when ready to process salary transfer.
                  </div>
                  <button className="btn btn-primary btn-sm pr-release-btn" disabled={busy} onClick={release}>
                    Release for Salary Transfer
                  </button>
                </div>
              )}
              {viewingRun.status === "released" && (
                <div className="pr-released-note">
                  <span>Released for salary transfer. This run is now permanently frozen.</span>
                  <div className="pr-released-actions">
                    {can("payroll.send_slips") && (
                      <button className="btn btn-ghost btn-sm pr-send-slips-btn" onClick={() => sendAllSlips(viewingRun.id)}>
                        Send Salary Slip to All Employees
                      </button>
                    )}
                    {can("payroll.manage") && (
                      <button className="btn btn-primary btn-sm pr-download-btn" onClick={() => downloadPayroll(viewingRun.id)}>
                        Download Payroll
                      </button>
                    )}
                  </div>
                </div>
              )}

              {viewingRun.status === "draft" ? (
                <div className="pr-hr-summary-grid" style={{ "--grid-cols": selectedSummaryStaffId ? "240px 1fr" : "1fr" }}>
                  <div className="pr-staff-list-box">
                    {hrSummary.map(s => (
                      <div key={s.staff_id} onClick={() => setSelectedSummaryStaffId(s.staff_id)}
                        className="pr-staff-list-item"
                        style={{ "--item-bg": selectedSummaryStaffId === s.staff_id ? "var(--bg-info-soft)" : "var(--bg-card)" }}>
                        <div className="pr-staff-name">{s.staff_name}</div>
                        <div className="pr-staff-type">{s.salary_type.replace("_", " ")}</div>
                      </div>
                    ))}
                    {hrSummary.length === 0 && <div className="pr-empty-list-text">No employees with a salary profile yet.</div>}
                  </div>
                  {selectedSummaryStaffId && (() => {
                    const s = hrSummary.find(x => x.staff_id === selectedSummaryStaffId);
                    if (!s) return null;
                    return (
                      <div className="pr-detail-card">
                        <div className="pr-detail-name">{s.staff_name}</div>
                        <div className="pr-detail-grid-2col">
                          <div>
                            <div className="pr-detail-label-green">INCLUDED IN SALARY</div>
                            {s.earning_items.map((name, i) => <div key={i} className="pr-detail-line">{name}</div>)}
                          </div>
                          <div>
                            <div className="pr-detail-label-red">DEDUCTIONS</div>
                            {s.deduction_items.map((name, i) => <div key={i} className="pr-detail-line">{name}</div>)}
                          </div>
                        </div>
                        <div className="pr-adj-section">
                          <div className="pr-adj-label-blue">THIS MONTH'S ADJUSTMENTS</div>
                          {s.adjustments.length === 0 && <div className="pr-adj-none-text">None configured</div>}
                          {s.adjustments.map((a, i) => (
                            <div key={i} className="pr-adj-row">
                              <span>{a.name} <span className="pr-adj-type" style={{ "--type-color": a.type === "earning" ? "#166534" : "#dc2626" }}>({a.type})</span></span>
                              <span>{a.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pr-stats-row">
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
                    {payslips.length} employee(s) &middot; Total Net Pay: <strong className="pr-total-net-value">{totalNet.toLocaleString()}</strong>
                  </div>

                  <div className="pr-payslip-table-wrap">
                    <table className="pr-payslip-table">
                      <thead>
                        <tr className="pr-payslip-th-row">
                          {["Employee", "Type", "Gross", "Deductions", "Net Pay", ""].map(h => (
                            <th key={h} className="pr-payslip-th">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payslips.map(p => (
                          <React.Fragment key={p.id}>
                            <tr className="pr-payslip-tr">
                              <td className="pr-payslip-td-name">{p.staff_name}</td>
                              <td className="pr-payslip-td-type">{p.salary_type.replace("_", " ")}</td>
                              <td className="pr-payslip-td-gross">{Number(p.gross_earnings).toLocaleString()}</td>
                              <td className="pr-payslip-td-deduct">{Number(p.total_deductions).toLocaleString()}</td>
                              <td className="pr-payslip-td-net">{Number(p.net_pay).toLocaleString()}</td>
                              <td className="pr-payslip-td-actions">
                                <button className="btn btn-ghost btn-sm pr-details-btn"
                                  onClick={() => setExpandedStaffId(expandedStaffId === p.id ? null : p.id)}>
                                  {expandedStaffId === p.id ? "Hide" : "Details"}
                                </button>
                                <button className="btn btn-ghost btn-sm pr-slip-btn"
                                  onClick={() => downloadSlip(viewingRun.id, p.staff_id, p.staff_name)}>
                                  Salary Slip
                                </button>
                              </td>
                            </tr>
                            {expandedStaffId === p.id && (
                              <tr>
                                <td colSpan={6} className="pr-expand-td">
                                  <div className="pr-expand-grid">
                                    <div>
                                      <div className="pr-detail-label-green">EARNINGS</div>
                                      {(p.earnings_breakdown || []).map((e, i) => (
                                        <div key={i} className="pr-expand-line">
                                          <span>{e.name}</span><span>{Number(e.amount).toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div>
                                      <div className="pr-detail-label-red">DEDUCTIONS</div>
                                      {(p.deductions_breakdown || []).map((d, i) => (
                                        <div key={i} className="pr-expand-line">
                                          <span>{d.name}</span><span>{Number(d.amount).toLocaleString()}</span>
                                        </div>
                                      ))}
                                      {(p.deductions_breakdown || []).length === 0 && <div className="pr-expand-none-text">None</div>}
                                    </div>
                                  </div>
                                  <div className="pr-expand-stats-row">
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
                          <tr><td colSpan={6} className="pr-payslip-empty-td">No payslips generated yet.</td></tr>
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
