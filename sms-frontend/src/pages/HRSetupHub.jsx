import React, { useState } from "react";
import HRSetup from "./HRSetup";
import HRLeave from "./HRLeave";
import AttendanceDashboard from "./AttendanceDashboard";
import PayrollSetup from "./PayrollSetup";
import PayrollGrades from "./PayrollGrades";
import PayrollAdjustments from "./PayrollAdjustments";
import PayrollDesignationGrades from "./PayrollDesignationGrades";
import PayrollTaxSlabs from "./PayrollTaxSlabs";

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
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>HR Setup</h1>
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
      <Active {...activeProps} />
    </div>
  );
}
