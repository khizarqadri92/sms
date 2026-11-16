import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import libraryApi from "../api/libraryApi";
import "./LibrarianDashboard.css";

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
          <div className="lib-dash-subtitle">
            Library Management System
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error lib-dash-error-alert">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading library stats...</div>
      ) : (
        <div className="lib-dash-stats-grid">
          {cards.map(s => (
            <div key={s.label} className="lib-dash-stat-card" style={{ "--stat-color": s.color }}>
              <div className="lib-dash-stat-icon">{s.icon}</div>
              <div className="lib-dash-stat-value">{s.value}</div>
              <div className="lib-dash-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Actions</span>
        </div>
        <div className="lib-dash-actions">
          {[
            { label: "Book Catalog",  path: "/library/catalog", icon: "📚" },
            { label: "Issue / Return", path: "/library/issue-return", icon: "🔄" },
            { label: "Members",       path: "/library/members", icon: "🪪" },
            { label: "Student List",  path: "/students", icon: "👥" },
            { label: "Settings",      path: "/settings", icon: "⚙️" },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)} className="lib-dash-action-btn">
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
