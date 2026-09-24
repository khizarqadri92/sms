import React, { useState } from "react";
import Vendors from "./Vendors";
import Departments from "./Departments";
import Items from "./Items";
import ItemCategories from "./ItemCategories";
import ApprovalRules from "./ApprovalRules";

// Consolidates the Procurement setup pages into a single tabbed hub under
// Setup -> Procurement Setup, matching the Finance Setup / HR Setup /
// Library Setup pattern. Each tab renders the existing page component
// unchanged - this is a navigation consolidation, not a rewrite of those
// pages' own logic (which already handles campus scoping and Setting
// Governance's Global-lock).

const TABS = [
  { key: "departments", label: "Departments", Component: Departments },
  { key: "vendors", label: "Vendors", Component: Vendors },
  { key: "items", label: "Item Master", Component: Items },
  { key: "item-categories", label: "Item Categories", Component: ItemCategories },
  { key: "approval-rules", label: "Approval Rules", Component: ApprovalRules },
];

export default function ProcurementSetupHub() {
  const [tab, setTab] = useState("departments");
  const Active = TABS.find(t => t.key === tab)?.Component || Departments;

  return (
    <div>
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>Procurement Setup</h1>
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
      <Active />
    </div>
  );
}
