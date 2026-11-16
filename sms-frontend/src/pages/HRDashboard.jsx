import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./HRDashboard.css";

export default function HRDashboard() {
  const navigate = useNavigate();

  const stats = [
    { label: "Total Staff",       value: "--", color: "#2563eb", icon: "👥", path: "/teachers" },
    { label: "Present Today",     value: "--", color: "#22c55e", icon: "✅", path: "/attendance" },
    { label: "On Leave Today",    value: "--", color: "#f59e0b", icon: "🏖️", path: "/leave-approval" },
    { label: "Pending Leaves",    value: "--", color: "#ef4444", icon: "📋", path: "/leave-approval" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-heading">HR Dashboard</h1>
          <div className="hrd-subtitle">
            Human Resources Management
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="hrd-stats-grid">
        {stats.map(s => (
          <div key={s.label} onClick={() => navigate(s.path)} className="hrd-stat-card" style={{ "--stat-color": s.color }}>
            <div className="hrd-stat-icon">{s.icon}</div>
            <div className="hrd-stat-value" style={{ "--stat-color": s.color }}>{s.value}</div>
            <div className="hrd-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Quick Actions</span>
        </div>
        <div className="hrd-quick-actions-row">
          {[
            { label: "View Staff",         path: "/teachers",       icon: "??" },
            { label: "Mark Attendance",    path: "/attendance",     icon: "??" },
            { label: "Leave Requests",     path: "/leave-approval", icon: "??" },
            { label: "Settings",           path: "/settings",       icon: "??" },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)} className="hrd-action-btn">
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Coming Soon */}
      <div className="section-card hrd-coming-soon-card">
        <div className="hrd-coming-soon-icon">??</div>
        <div className="hrd-coming-soon-title">
          HR Module Coming Soon
        </div>
        <div className="hrd-coming-soon-text">
          Payroll management, staff contracts, recruitment tracking, and performance reviews will be available in the HR module.
        </div>
      </div>
    </div>
  );
}