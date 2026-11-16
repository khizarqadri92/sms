import { useState, useEffect, useCallback } from "react";
import incomeTaxApi from "../api/incomeTaxApi";
import hrApi from "../api/hrApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./IncomeTax.css";

export default function IncomeTax() {
  const { formatCurrency } = useRegionalSettings();

  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    hrApi.getDepartments().then((res) => setDepartments(res.data.data || [])).catch(() => {});
  }, []);

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const res = await incomeTaxApi.search({ q: query || undefined, department_id: departmentId || undefined });
      setResults(res.data.data || []);
    } finally {
      setSearching(false);
    }
  }, [query, departmentId]);

  useEffect(() => { runSearch(); }, [departmentId]);
  useEffect(() => {
    const t = setTimeout(() => { runSearch(); }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const selectEmployee = async (row) => {
    setSelected(row);
    setLoadingDetail(true);
    try {
      const res = await incomeTaxApi.getTransactions(row.staff_id);
      setDetail(res.data.data);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="it-page">
      <div className="it-header">
        <div className="it-title">Income Tax</div>
        <div className="it-subtitle">Look up an employee's income tax deduction history, month by month</div>
      </div>

      <div className="it-filter-row">
        <select className="form-input it-dept-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <input type="text" className="form-input it-search-input" placeholder="Search by name or employee code..."
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {searching && <div className="it-searching-text">Searching...</div>}
      </div>

      {!selected && (
        <div className="it-table-wrap">
          <table className="it-table">
            <thead>
              <tr className="it-th-row">
                {["Employee", "Code", "Department", "Designation", "Total Tax Deducted", ""].map((h) => (
                  <th key={h} className="it-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.staff_id} className="it-tr" onClick={() => selectEmployee(r)}>
                  <td className="it-td-name">{r.staff_name}</td>
                  <td className="it-td-code">{r.employee_code || "-"}</td>
                  <td className="it-td">{r.department_name || "-"}</td>
                  <td className="it-td">{r.designation_name || "-"}</td>
                  <td className="it-td-bold">{formatCurrency(r.total_tax_deducted)}</td>
                  <td className="it-td">
                    <button className="btn btn-ghost btn-sm it-view-btn" onClick={(e) => { e.stopPropagation(); selectEmployee(r); }}>View</button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && !searching && (
                <tr><td colSpan={6} className="it-empty-td">No employees found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="it-detail-card">
          <div className="it-detail-header">
            <div>
              <div className="it-detail-name">{selected.staff_name}</div>
              <div className="it-detail-subtext">{selected.department_name || "-"} &middot; {selected.designation_name || "-"} &middot; {selected.employee_code || "-"}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDetail(null); }}>Back to results</button>
          </div>

          <div className="it-detail-body">
            {loadingDetail ? (
              <div className="it-loading-text">Loading deduction history...</div>
            ) : detail ? (
              <div className="it-summary-table-wrap">
                <table className="it-table">
                  <thead>
                    <tr className="it-th-row">
                      {["Month", "Gross Earnings", "Income Tax"].map((h) => (
                        <th key={h} className="it-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.transactions.map((t) => (
                      <tr key={t.payroll_run_id} className="it-tr-static">
                        <td className="it-td-name">{formatMonthLabel(t.transaction_date)}</td>
                        <td className="it-td">{formatCurrency(t.gross_earnings)}</td>
                        <td className="it-td-bolder">{formatCurrency(t.tax_amount)}</td>
                      </tr>
                    ))}
                    {detail.transactions.length === 0 && (
                      <tr><td colSpan={3} className="it-empty-td">No income tax deductions recorded yet.</td></tr>
                    )}
                  </tbody>
                  {detail.transactions.length > 0 && (
                    <tfoot>
                      <tr className="it-tfoot-row">
                        <td className="it-tfoot-td">Total</td>
                        <td></td>
                        <td className="it-tfoot-td">
                          {formatCurrency(detail.transactions.reduce((sum, t) => sum + Number(t.tax_amount || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMonthLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
