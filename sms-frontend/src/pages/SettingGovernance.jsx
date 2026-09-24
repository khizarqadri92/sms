import { useState, useEffect } from "react";
import campusesApi from "../api/campusesApi";

function GovernanceToggle({ row, saving, onToggle }) {
  const isGlobal = row.mode === "global";
  const disabled = saving || row.locked;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => !row.locked && onToggle(row)}
        disabled={disabled}
        aria-pressed={isGlobal}
        aria-label={row.display_name + " scope"}
        title={row.locked ? "This setup is fixed to Global" : undefined}
        style={{
          position: "relative",
          width: 44,
          height: 24,
          borderRadius: 999,
          border: "none",
          padding: 0,
          cursor: disabled ? "default" : "pointer",
          background: isGlobal ? "var(--theme-primary)" : "#cbd5e1",
          transition: "background 0.15s ease",
          opacity: saving ? 0.6 : row.locked ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: isGlobal ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
            transition: "left 0.15s ease",
          }}
        />
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, color: isGlobal ? "var(--theme-primary)" : "#475569" }}>
        {isGlobal ? "Global" : "Campus Based"}
      </span>
      {row.locked && (
        <span style={{ fontSize: 11, color: "#94a3b8" }}>(fixed)</span>
      )}
    </div>
  );
}

export default function SettingGovernance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true);
    campusesApi.listGovernance()
      .then(r => setRows(r.data.data || []))
      .catch(() => setError("Failed to load settings."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (row) => {
    if (row.locked) return;
    const newMode = row.mode === "global" ? "per_campus" : "global";
    setSavingKey(row.entity_key);
    setError(""); setSuccess("");
    try {
      await campusesApi.updateGovernance(row.entity_key, newMode);
      setRows(prev => prev.map(r => r.entity_key === row.entity_key ? { ...r, mode: newMode } : r));
      setSuccess(row.display_name + " set to " + (newMode === "global" ? "Global" : "Campus Based") + ".");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update setting.");
    } finally {
      setSavingKey(null);
    }
  };

  const grouped = rows.reduce((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Setting Governance</h1>
      </div>
      <p style={{ color: "#64748b", marginBottom: 16, maxWidth: 640 }}>
        Choose whether each setup is shared by every campus or left for each campus to configure on its own.
        A setup marked Global uses the same records everywhere, and campuses cannot add their own until it is switched back.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        Object.keys(grouped).sort().map(category => (
          <div key={category} className="section-card" style={{ marginBottom: 16 }}>
            <div className="section-card-header">
              <span className="section-card-title">{category}</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Setup</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {grouped[category].map(row => (
                  <tr key={row.entity_key}>
                    <td>{row.display_name}</td>
                    <td>
                      <GovernanceToggle row={row} saving={savingKey === row.entity_key} onToggle={toggle} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
