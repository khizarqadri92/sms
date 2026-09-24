import React, { useState } from "react";
import Academics from "./Academics";
import ConfigPage from "./ConfigPage";
import Settings from "./Settings";
import LeaveSetup from "./LeaveSetup";

// Consolidates the Academic setup pages into a single tabbed hub under
// Setup -> Academic Setup, matching the Finance/HR/Library/Procurement
// Setup pattern. Each tab renders the existing page component unchanged
// (via a visibleTabs prop that restricts it to just the relevant
// sub-section) - this is a navigation consolidation, not a rewrite of
// those pages' own logic (which already handles campus scoping and
// Setting Governance's Global-lock).

const TABS = [
  { key: "years", label: "Academic Years", Component: Academics, extraProps: { visibleTabs: ["years"] } },
  { key: "classes", label: "Classes", Component: Academics, extraProps: { visibleTabs: ["classes"] } },
  { key: "subjects", label: "Subjects", Component: Academics, extraProps: { visibleTabs: ["subjects"] } },
  { key: "exam-types", label: "Exam Types & Grading", Component: ConfigPage, extraProps: { visibleTabs: ["exam"] } },
  { key: "school-timing", label: "School Timing", Component: Settings, extraProps: { visibleTabs: ["school_timing"] } },
  { key: "attendance-config", label: "Attendance Config", Component: Settings, extraProps: { visibleTabs: ["attendance_config"] } },
  { key: "leave-config", label: "Leave Configuration", Component: LeaveSetup },
];

export default function AcademicSetupHub() {
  const [tab, setTab] = useState("subjects");
  const activeTab = TABS.find(t => t.key === tab) || TABS[0];
  const Active = activeTab.Component;
  const activeProps = activeTab.extraProps || {};

  return (
    <div>
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>Academic Setup</h1>
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
