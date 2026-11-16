import React, { useState } from "react";
import HRStaff from "./HRStaff";
import AttendanceDashboard from "./AttendanceDashboard";
import Resignations from "./Resignations";
import PayrollRuns from "./PayrollRuns";
import ProvidentFund from "./ProvidentFund";
import IncomeTax from "./IncomeTax";
import "./HubNav.css";

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
      <div className="hub-wrap">
        <h1 className="hub-title">HR Management</h1>
        <div className="hub-tab-row">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="hub-tab-btn"
              style={{
                "--tab-bg": tab === t.key ? "var(--theme-primary, #2563eb)" : "var(--bg-hover)",
                "--tab-color": tab === t.key ? "#fff" : "var(--text-secondary)",
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
