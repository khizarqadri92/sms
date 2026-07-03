import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LibrarianDashboard() {
  const navigate = useNavigate();

  const stats = [
    { label: "Total Books",      value: "--", color: "#2563eb", icon: "📚" },
    { label: "Issued Today",     value: "--", color: "#22c55e", icon: "📤" },
    { label: "Returned Today",   value: "--", color: "#059669", icon: "📥" },
    { label: "Overdue Books",    value: "--", color: "#ef4444", icon: "⚠️" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-heading">Library Dashboard</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Library Management System
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            borderTop: "3px solid " + s.color, padding: "18px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Actions</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
          {[
            { label: "Student List",  path: "/students", icon: "👥" },
            { label: "Settings",      path: "/settings", icon: "⚙️" },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 8,
              border: "1px solid var(--color-border-secondary)",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)", fontSize: 14,
              fontWeight: 500, cursor: "pointer",
            }}>
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-card" style={{ marginTop: 16, textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--color-text-primary)", marginBottom: 8 }}>
          Library Module Coming Soon
        </div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", maxWidth: 400, margin: "0 auto" }}>
          Book catalog, issue/return management, fine collection, and student book history will be available in the Library module.
        </div>
      </div>
    </div>
  );
}