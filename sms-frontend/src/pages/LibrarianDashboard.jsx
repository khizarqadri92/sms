import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import libraryApi from "../api/libraryApi";

export default function LibrarianDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    libraryApi.getDashboard()
      .then(r => setStats(r.data.data))
      .catch(() => setError("Failed to load library stats."))
      .finally(() => setLoading(false));
  }, []);

  const cards = stats ? [
    { label: "Total Books",       value: stats.total_books,       color: "#2563eb", icon: "📚" },
    { label: "Available Copies",  value: stats.available_copies,  color: "#16a34a", icon: "✅" },
    { label: "Issued Copies",     value: stats.issued_copies,     color: "#0891b2", icon: "📤" },
    { label: "Overdue Books",     value: stats.overdue_count,     color: "#dc2626", icon: "⚠️" },
    { label: "Issued Today",      value: stats.issued_today,      color: "#7c3aed", icon: "📆" },
    { label: "Returned Today",    value: stats.returned_today,    color: "#059669", icon: "📥" },
    { label: "Lost / Damaged",    value: (stats.lost_copies + stats.damaged_copies), color: "#b45309", icon: "🚫" },
    { label: "Fine Collected Today", value: "Rs. " + Number(stats.fine_collected_today).toLocaleString(), color: "#0d9488", icon: "💰" },
    { label: "Fine Pending",      value: "Rs. " + Number(stats.fine_pending_total).toLocaleString(), color: "#e11d48", icon: "🧾" },
  ] : [];

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

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading library stats...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 16, marginBottom: 24 }}>
          {cards.map(s => (
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
      )}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Actions</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
          {[
            { label: "Book Catalog",  path: "/library/catalog", icon: "📚" },
            { label: "Issue / Return", path: "/library/issue-return", icon: "🔄" },
            { label: "Members",       path: "/library/members", icon: "🪪" },
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
    </div>
  );
}
