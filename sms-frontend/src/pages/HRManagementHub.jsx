import React, { useState } from "react";
import HRStaff from "./HRStaff";
import AttendanceDashboard from "./AttendanceDashboard";
import Resignations from "./Resignations";
import PayrollRuns from "./PayrollRuns";
import ProvidentFund from "./ProvidentFund";
import IncomeTax from "./IncomeTax";

// Consolidates the HR operational pages into a single tabbed hub under the
// new "Management" nav category, matching the Setup hub pattern. Each tab
// renders the existing page component unchanged - this is a navigation
// consolidation, not a rewrite of those pages' own logic.

const TABS = [
  { key: "staff", label: "Staff Management", Component: HRStaff },
  { key: "attendance", label: "Employee Attendance", Component: AttendanceDashboard, extraProps: { visibleTabs: ["live", "rfid", "schedule"] } },
  { key: "resignations", label: "Resignations", Component: Resignations },
  { key: "payroll-runs", label: "Payroll Runs", Component: PayrollRuns },
  { key: "provident-fund", label: "Provident Fund", Component: ProvidentFund },
  { key: "income-tax", label: "Income Tax", Component: IncomeTax },
];

export default function HRManagementHub() {
  const [tab, setTab] = useState("staff");
  const activeTab = TABS.find(t => t.key === tab) || TABS[0];
  const Active = activeTab.Component;
  const activeProps = activeTab.extraProps || {};

  return (
    <div>
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>HR Management</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
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
      </div>
      <Active key={tab} {...activeProps} />
    </div>
  );
}
