import React, { useState } from "react";
import LibraryCategories from "./LibraryCategories";
import LibraryAuthors from "./LibraryAuthors";
import LibraryPublishers from "./LibraryPublishers";
import LibrarySettings from "./LibrarySettings";
import "./LibrarySetupHub.css";

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
      <div className="lib-setup-hub-container">
        <h1 className="lib-setup-hub-title">Library Setup</h1>
        <div className="lib-setup-hub-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={"lib-setup-hub-tab-btn" + (tab === t.key ? " active" : "")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Active />
    </div>
  );
}
