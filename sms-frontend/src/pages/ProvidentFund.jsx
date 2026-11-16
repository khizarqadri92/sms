import { useState, useEffect, useCallback } from "react";
import providentFundApi from "../api/providentFundApi";
import hrApi from "../api/hrApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./ProvidentFund.css";

export default function ProvidentFund() {
  const { formatCurrency, formatDate } = useRegionalSettings();

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
      const res = await providentFundApi.search({ q: query || undefined, department_id: departmentId || undefined });
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
      const res = await providentFundApi.getTransactions(row.staff_id);
      setDetail(res.data.data);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="pf-page">
      <div className="pf-header">
        <div className="pf-title">Provident Fund</div>
        <div className="pf-subtitle">Look up an employee to see their PF rate and contribution history</div>
      </div>

      <div className="pf-filter-row">
        <select className="form-input pf-dept-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <input type="text" className="form-input pf-search-input" placeholder="Search by name or employee code..."
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {searching && <div className="pf-searching-text">Searching...</div>}
      </div>

      {!selected && (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr className="pf-th-row">
                {["Employee", "Code", "Department", "Designation", "Employee Deduction", "Employer Contribution", "Total Balance", ""].map((h) => (
                  <th key={h} className="pf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.staff_id} className="pf-tr" onClick={() => selectEmployee(r)}>
                  <td className="pf-td-name">{r.staff_name}</td>
                  <td className="pf-td-code">{r.employee_code || "-"}</td>
                  <td className="pf-td">{r.department_name || "-"}</td>
                  <td className="pf-td">{r.designation_name || "-"}</td>
                  <td className="pf-td">{formatCurrency(r.employee_total_deduction)}</td>
                  <td className="pf-td">{formatCurrency(r.employer_total_contribution)}</td>
                  <td className="pf-td-bold">{formatCurrency(r.total_balance)}</td>
                  <td className="pf-td">
                    <button className="btn btn-ghost btn-sm pf-view-btn" onClick={(e) => { e.stopPropagation(); selectEmployee(r); }}>View</button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && !searching && (
                <tr><td colSpan={8} className="pf-empty-td">No employees found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="pf-detail-card">
          <div className="pf-detail-header">
            <div>
              <div className="pf-detail-name">{selected.staff_name}</div>
              <div className="pf-detail-subtext">{selected.department_name || "-"} &middot; {selected.designation_name || "-"} &middot; {selected.employee_code || "-"}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDetail(null); }}>Back to results</button>
          </div>

          <div className="pf-detail-body">
            {loadingDetail ? (
              <div className="pf-loading-text">Loading deduction history...</div>
            ) : detail ? (
              <>
                <div className="pf-rate-grid">
                  <div className="pf-rate-box">
                    <div className="pf-rate-value-green">{detail.rate?.employee_contribution_pct}%</div>
                    <div className="pf-rate-label">Employee Rate ({labelForSource(detail.rate?.rate_source)})</div>
                  </div>
                  <div className="pf-rate-box">
                    <div className="pf-rate-value-blue">{detail.rate?.employer_contribution_pct}%</div>
                    <div className="pf-rate-label">Employer Rate</div>
                  </div>
                </div>

                <div className="pf-section-title">Monthly Provident Fund Summary</div>
                <div className="pf-summary-table-wrap">
                  <table className="pf-table">
                    <thead>
                      <tr className="pf-th-row">
                        {["Month", "Employee PF", "Employer PF", "Total"].map((h) => (
                          <th key={h} className="pf-th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupByMonth(detail.transactions).map((m) => (
                        <tr key={m.month} className="pf-tr-static">
                          <td className="pf-td-name">{formatMonthLabel(m.month)}</td>
                          <td className="pf-td">{formatCurrency(m.employeeAmount)}</td>
                          <td className="pf-td">{formatCurrency(m.employerAmount)}</td>
                          <td className="pf-td-bolder">{formatCurrency(m.employeeAmount + m.employerAmount)}</td>
                        </tr>
                      ))}
                      {detail.transactions.length === 0 && (
                        <tr><td colSpan={4} className="pf-empty-td">No PF deductions recorded yet.</td></tr>
                      )}
                    </tbody>
                    {detail.transactions.length > 0 && (
                      <tfoot>
                        <tr className="pf-tfoot-row">
                          <td className="pf-tfoot-td">Total</td>
                          <td className="pf-tfoot-td">{formatCurrency(pfTotals(detail.transactions).employeeTotal)}</td>
                          <td className="pf-tfoot-td">{formatCurrency(pfTotals(detail.transactions).employerTotal)}</td>
                          <td className="pf-tfoot-td">{formatCurrency(pfTotals(detail.transactions).grandTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function groupByMonth(transactions) {
  const map = {};
  transactions.forEach((t) => {
    const month = t.transaction_date.slice(0, 7);
    if (!map[month]) map[month] = { month, employeeAmount: 0, employerAmount: 0 };
    map[month].employeeAmount += Number(t.employee_amount || 0);
    map[month].employerAmount += Number(t.employer_amount || 0);
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

function pfTotals(transactions) {
  const employeeTotal = transactions.reduce((sum, t) => sum + Number(t.employee_amount || 0), 0);
  const employerTotal = transactions.reduce((sum, t) => sum + Number(t.employer_amount || 0), 0);
  return { employeeTotal, employerTotal, grandTotal: employeeTotal + employerTotal };
}

function formatMonthLabel(ym) {
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function labelForSource(source) {
  return { employee_override: "Custom Rate", grade_default: "Grade Default", none: "Not Set" }[source] || source;
}
