import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

function ResolveMissingModal({ copy, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleResolve = async (resolution) => {
    setSaving(true); setError("");
    try {
      await libraryApi.resolveMissingCopy(copy.copy_id, { resolution });
      onSaved(resolution === "found" ? "Copy marked as found." : "Copy removed from inventory.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to resolve.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Resolve Missing Copy</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{copy.book_title} &mdash; {copy.accession_no}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={() => handleResolve("remove")}>Remove from Inventory</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => handleResolve("found")}>Mark as Found</button>
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ audit, onCompleted }) {
  const { formatDate, formatTime } = useRegionalSettings();
  const [identifier, setIdentifier] = useState("");
  const [items, setItems] = useState([]);
  const [progress, setProgress] = useState(audit);
  const [scanning, setScanning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchItems = () => {
    libraryApi.getAuditItems(audit.audit_id).then(r => setItems(r.data.data || [])).catch(() => {});
  };

  const refreshProgress = () => {
    libraryApi.getActiveAudit().then(r => { if (r.data.data) setProgress(r.data.data); }).catch(() => {});
  };

  useEffect(() => { fetchItems(); }, []);

  const handleScan = async (e) => {
    e.preventDefault();
    if (!identifier) return;
    setScanning(true); setError(""); setMessage("");
    try {
      const r = await libraryApi.verifyAuditCopy(audit.audit_id, { identifier });
      setMessage(r.data.message);
      setIdentifier("");
      fetchItems();
      refreshProgress();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to verify copy.");
    } finally {
      setScanning(false);
    }
  };

  const handleComplete = async () => {
    if (!window.confirm("Complete this audit? Any available copy not verified will be flagged as Missing.")) return;
    setCompleting(true); setError("");
    try {
      const r = await libraryApi.completeAudit(audit.audit_id);
      onCompleted(r.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to complete audit.");
    } finally {
      setCompleting(false);
    }
  };

  const pct = progress.total_to_verify > 0 ? Math.round((progress.verified_count / progress.total_to_verify) * 100) : 0;

  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="section-card-header">
        <span className="section-card-title">Audit in Progress</span>
      </div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
        Started by {progress.started_by_name} on {formatDate(progress.started_at)}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span>{progress.verified_count} of {progress.total_to_verify} verified</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: pct + "%", background: "#16a34a", transition: "width .3s" }} />
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {message && <div className="alert alert-success" style={{ marginBottom: 12 }}>{message}</div>}

      <form onSubmit={handleScan} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="form-control" placeholder="Scan or type barcode / accession no." value={identifier} onChange={e => setIdentifier(e.target.value)} autoFocus />
        <button type="submit" className="btn btn-primary" disabled={scanning}>{scanning ? "Checking..." : "Verify"}</button>
      </form>

      <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 16 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No copies verified yet.</div>
        ) : (
          items.map(it => (
            <div key={it.copy_id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
              <span>{it.book_title} ({it.accession_no})</span>
              <span style={{ color: "#94a3b8", fontSize: 11 }}>{formatTime(it.verified_at)}</span>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-danger" disabled={completing} onClick={handleComplete}>
          {completing ? "Completing..." : "Complete Audit"}
        </button>
      </div>
    </div>
  );
}

export default function LibraryInventory() {
  const [summary, setSummary] = useState(null);
  const [activeAudit, setActiveAudit] = useState(null);
  const [missingCopies, setMissingCopies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [resolveCopy, setResolveCopy] = useState(null);
  const [starting, setStarting] = useState(false);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      libraryApi.getInventorySummary(),
      libraryApi.getActiveAudit(),
      libraryApi.getMissingCopies(),
    ]).then(([s, a, m]) => {
      setSummary(s.data.data);
      setActiveAudit(a.data.data);
      setMissingCopies(m.data.data || []);
    }).catch(() => setError("Failed to load inventory data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 4000);
  };

  const handleStartAudit = async () => {
    setStarting(true); setError("");
    try {
      await libraryApi.startAudit({ notes: "" });
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to start audit.");
    } finally {
      setStarting(false);
    }
  };

  const cards = summary ? [
    { label: "Available", value: summary.available_count, color: "#16a34a" },
    { label: "Issued", value: summary.issued_count, color: "#0891b2" },
    { label: "Reserved", value: summary.reserved_count, color: "#7c3aed" },
    { label: "Damaged", value: summary.damaged_count, color: "#d97706" },
    { label: "Lost", value: summary.lost_count, color: "#dc2626" },
    { label: "Missing", value: summary.missing_count, color: "#b91c1c" },
    { label: "Removed", value: summary.removed_count, color: "#64748b" },
    { label: "Total Copies", value: summary.total_count, color: "#1e293b" },
  ] : [];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Inventory Management</h1>
        {!activeAudit && (
          <button className="btn btn-primary" disabled={starting} onClick={handleStartAudit}>
            {starting ? "Starting..." : "+ Start Stock Audit"}
          </button>
        )}
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
            {cards.map(c => (
              <div key={c.label} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderTop: "3px solid " + c.color, padding: "14px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {activeAudit && (
            <AuditPanel
              audit={activeAudit}
              onCompleted={(msg) => { showToast(msg); fetchAll(); }}
            />
          )}

          <div className="section-card">
            <div className="section-card-header">
              <span className="section-card-title">Missing Books</span>
            </div>
            {missingCopies.length === 0 ? (
              <div className="empty-state">No missing copies right now.</div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Accession No.</th>
                      <th>Shelf / Rack</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingCopies.map(c => (
                      <tr key={c.copy_id}>
                        <td><strong>{c.book_title}</strong></td>
                        <td>{c.accession_no}</td>
                        <td style={{ fontSize: 12, color: "#64748b" }}>{c.shelf || "-"} / {c.rack || "-"}</td>
                        <td>
                          <button className="btn btn-primary btn-xs" onClick={() => setResolveCopy(c)}>Resolve</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {resolveCopy && (
        <ResolveMissingModal
          copy={resolveCopy}
          onClose={() => setResolveCopy(null)}
          onSaved={(msg) => { setResolveCopy(null); showToast(msg); fetchAll(); }}
        />
      )}
    </div>
  );
}
