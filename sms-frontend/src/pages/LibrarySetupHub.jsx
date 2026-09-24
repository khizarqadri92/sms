import React, { useState } from "react";
import LibraryCategories from "./LibraryCategories";
import LibraryAuthors from "./LibraryAuthors";
import LibraryPublishers from "./LibraryPublishers";
import LibrarySettings from "./LibrarySettings";

// Consolidates the Library setup pages into a single tabbed hub under
// Setup -> Library Setup, matching the Finance Setup / HR Setup pattern.
// Each tab renders the existing page component unchanged - this is a
// navigation consolidation, not a rewrite of those pages' own logic
// (which already handles campus scoping and Setting Governance's
// Global-lock).

const TABS = [
  { key: "categories", label: "Categories", Component: LibraryCategories },
  { key: "authors", label: "Authors", Component: LibraryAuthors },
  { key: "publishers", label: "Publishers", Component: LibraryPublishers },
  { key: "membership-rules", label: "Membership Rules", Component: LibrarySettings },
];

export default function LibrarySetupHub() {
  const [tab, setTab] = useState("categories");
  const Active = TABS.find(t => t.key === tab)?.Component || LibraryCategories;

  return (
    <div>
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>Library Setup</h1>
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
