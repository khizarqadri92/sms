import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ProcurementDashboard.css";

export default function ProcurementDashboard() {
  const navigate = useNavigate();

  const stats = [
    { label: "Purchase Requests", value: "--", color: "#2563eb", icon: "📋" },
    { label: "Pending Approval",  value: "--", color: "#f59e0b", icon: "⏳" },
    { label: "Total Vendors",     value: "--", color: "#059669", icon: "🏢" },
    { label: "Assets Tracked",    value: "--", color: "#7c3aed", icon: "📦" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-heading">Procurement Dashboard</h1>
          <div className="pd-subtitle">
            Procurement & Asset Management
          </div>
        </div>
      </div>

      <div className="pd-stats-grid">
        {stats.map(s => (
          <div key={s.label} className="pd-stat-card" style={{ "--stat-color": s.color }}>
            <div className="pd-stat-icon">{s.icon}</div>
            <div className="pd-stat-value" style={{ "--stat-color": s.color }}>{s.value}</div>
            <div className="pd-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Actions</span>
        </div>
        <div className="pd-quick-actions-row">
          {[
            { label: "Settings", path: "/settings", icon: "⚙️" },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)} className="pd-action-btn">
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-card pd-coming-soon">
        <div className="pd-coming-soon-icon">🚧</div>
        <div className="pd-coming-soon-title">
          Procurement Module Coming Soon
        </div>
        <div className="pd-coming-soon-desc">
          Purchase requests, vendor management, asset tracking, and budget management will be available in the Procurement module.
        </div>
      </div>
    </div>
  );
}