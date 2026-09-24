import React, { useState } from "react";
import ProcurementRequisitions from "./ProcurementRequisitions";
import PurchaseOrders from "./PurchaseOrders";
import GRN from "./GRN";
import Stock from "./Stock";
import VendorInvoices from "./VendorInvoices";

// Consolidates the Procurement operational pages into a single tabbed hub
// under the new "Management" nav category, matching the Setup hub pattern.
// Each tab renders the existing page component unchanged - this is a
// navigation consolidation, not a rewrite of those pages' own logic.

const TABS = [
  { key: "pipeline", label: "Requisitions Pipeline", Component: ProcurementRequisitions },
  { key: "purchase-orders", label: "Purchase Orders", Component: PurchaseOrders },
  { key: "grn", label: "Goods Receipt (GRN)", Component: GRN },
  { key: "stock", label: "Stock", Component: Stock },
  { key: "vendor-invoices", label: "Vendor Invoices", Component: VendorInvoices },
];

export default function ProcurementManagementHub() {
  const [tab, setTab] = useState("pipeline");
  const activeTab = TABS.find(t => t.key === tab) || TABS[0];
  const Active = activeTab.Component;

  return (
    <div>
      <div style={{ padding: "20px 24px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0f172a" }}>Procurement Management</h1>
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
      <Active key={tab} />
    </div>
  );
}
