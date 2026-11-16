import React, { useState } from "react";
import HRSetup from "./HRSetup";
import HRLeave from "./HRLeave";
import AttendanceDashboard from "./AttendanceDashboard";
import PayrollSetup from "./PayrollSetup";
import PayrollGrades from "./PayrollGrades";
import PayrollAdjustments from "./PayrollAdjustments";
import PayrollDesignationGrades from "./PayrollDesignationGrades";
import PayrollTaxSlabs from "./PayrollTaxSlabs";
import "./HubNav.css";

// Consolidates the HR/Payroll setup pages (previously scattered under the
// HR nav category) into a single tabbed hub under Setup -> HR Setup,
// matching the Finance Setup pattern. Each tab renders the existing page
// component unchanged - this is a navigation consolidation, not a rewrite
// of those pages' own logic (which already handles campus scoping and,
// where wired, Setting Governance's Global-lock).

const TABS = [
  { key: "hr", label: "Departments & Designations", Component: HRSetup },
  { key: "leave", label: "Staff Leave Management", Component: HRLeave, extraProps: { visibleTabs: ["types","policies","validation_rules","balances"] } },
  { key: "attendance-settings", label: "Attendance Settings", Component: AttendanceDashboard, extraProps: { visibleTabs: ["settings"] } },
  { key: "payroll-components", label: "Payroll Components", Component: PayrollSetup },
  { key: "payroll-grades", label: "Payroll Grades", Component: PayrollGrades },
  { key: "payroll-adjustments", label: "Payroll Adjustments", Component: PayrollAdjustments },
  { key: "designation-grades", label: "Designation Grades", Component: PayrollDesignationGrades },
  { key: "tax-slabs", label: "Income Tax Slabs", Component: PayrollTaxSlabs },
];

export default function HRSetupHub() {
  const [tab, setTab] = useState("hr");
  const activeTab = TABS.find(t => t.key === tab) || TABS[0];
  const Active = activeTab.Component;
  const activeProps = activeTab.extraProps || {};

  return (
    <div>
      <div className="hub-wrap">
        <h1 className="hub-title">HR Setup</h1>
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
      <Active {...activeProps} />
    </div>
  );
}
