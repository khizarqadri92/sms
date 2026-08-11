import { useState, useEffect, useCallback } from "react";
import incomeTaxApi from "../api/incomeTaxApi";
import hrApi from "../api/hrApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

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
    <div style={{ padding: 24, background: "#f1f5f9", minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Income Tax</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Look up an employee's income tax deduction history, month by month</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select className="form-input" style={{ width: 200, fontSize: 13 }} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <input type="text" className="form-input" style={{ fontSize: 13, width: 240 }} placeholder="Search by name or employee code..."
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {searching && <div style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>Searching...</div>}
      </div>

      {!selected && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Employee", "Code", "Department", "Designation", "Total Tax Deducted", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.staff_id} style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => selectEmployee(r)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{r.staff_name}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b" }}>{r.employee_code || "-"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.department_name || "-"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.designation_name || "-"}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatCurrency(r.total_tax_deducted)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); selectEmployee(r); }}>View</button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && !searching && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>No employees found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.staff_name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{selected.department_name || "-"} &middot; {selected.designation_name || "-"} &middot; {selected.employee_code || "-"}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDetail(null); }}>Back to results</button>
          </div>

          <div style={{ padding: 20 }}>
            {loadingDetail ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading deduction history...</div>
            ) : detail ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Month", "Gross Earnings", "Income Tax"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.transactions.map((t) => (
                      <tr key={t.payroll_run_id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatMonthLabel(t.transaction_date)}</td>
                        <td style={{ padding: "10px 14px" }}>{formatCurrency(t.gross_earnings)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>{formatCurrency(t.tax_amount)}</td>
                      </tr>
                    ))}
                    {detail.transactions.length === 0 && (
                      <tr><td colSpan={3} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>No income tax deductions recorded yet.</td></tr>
                    )}
                  </tbody>
                  {detail.transactions.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>Total</td>
                        <td></td>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>
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
