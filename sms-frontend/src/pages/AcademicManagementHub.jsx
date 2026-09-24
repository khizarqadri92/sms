import React, { useState } from "react";
import Academics from "./Academics";
import Syllabus from "./Syllabus";
import Exams from "./Exams";
import AcademicSetup from "./AcademicSetup";
import TeacherAssignment from "./TeacherAssignment";

// Consolidates the Academic operational pages into a single tabbed hub
// under the new "Management" nav category, matching the Setup hub pattern.
// Each tab renders the existing page component unchanged - this is a
// navigation consolidation, not a rewrite of those pages' own logic.

const TABS = (academicsVisibleTabs) => [
  { key: "academics", label: "Academics", Component: Academics, extraProps: { visibleTabs: academicsVisibleTabs || ["timetable", "overview"] } },
  { key: "syllabus", label: "Syllabus", Component: Syllabus },
  { key: "exams", label: "Exams", Component: Exams },
  { key: "schedule-setup", label: "Subject Schedule Setup", Component: AcademicSetup },
  { key: "teacher-assignment", label: "Teacher Assignment", Component: TeacherAssignment },
];

export default function AcademicManagementHub({ academicsVisibleTabs } = {}) {
  const [tab, setTab] = useState("academics");
  const ALL_TABS = TABS(academicsVisibleTabs);
  const activeTab = ALL_TABS.find(t => t.key === tab) || ALL_TABS[0];
  const Active = activeTab.Component;
  const activeProps = activeTab.extraProps || {};

  return (
    <div>
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>Academic Management</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
          {ALL_TABS.map(t => (
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
