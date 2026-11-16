import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./LibraryInventory.css";

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
    <div className="lib-inv-modal-overlay" onClick={onClose}>
      <div className="lib-inv-modal" onClick={e => e.stopPropagation()}>
        <div className="lib-inv-modal-title">Resolve Missing Copy</div>
        <div className="lib-inv-modal-subtitle">{copy.book_title} &mdash; {copy.accession_no}</div>
        {error && <div className="alert alert-error lib-inv-mb12">{error}</div>}
        <div className="lib-inv-modal-footer">
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
    <div className="section-card lib-inv-audit-card">
      <div className="section-card-header">
        <span className="section-card-title">Audit in Progress</span>
      </div>
      <div className="lib-inv-audit-meta">
        Started by {progress.started_by_name} on {formatDate(progress.started_at)}
      </div>

      <div className="lib-inv-progress-wrap">
        <div className="lib-inv-progress-header">
          <span>{progress.verified_count} of {progress.total_to_verify} verified</span>
          <span>{pct}%</span>
        </div>
        <div className="lib-inv-progress-track">
          <div className="lib-inv-progress-fill" style={{ width: pct + "%" }} />
        </div>
      </div>

      {error && <div className="alert alert-error lib-inv-mb12">{error}</div>}
      {message && <div className="alert alert-success lib-inv-mb12">{message}</div>}

      <form onSubmit={handleScan} className="lib-inv-scan-form">
        <input className="form-control" placeholder="Scan or type barcode / accession no." value={identifier} onChange={e => setIdentifier(e.target.value)} autoFocus />
        <button type="submit" className="btn btn-primary" disabled={scanning}>{scanning ? "Checking..." : "Verify"}</button>
      </form>

      <div className="lib-inv-items-list">
        {items.length === 0 ? (
          <div className="lib-inv-empty-hint">No copies verified yet.</div>
        ) : (
          items.map(it => (
            <div key={it.copy_id} className="lib-inv-item-row">
              <span>{it.book_title} ({it.accession_no})</span>
              <span className="lib-inv-item-time">{formatTime(it.verified_at)}</span>
            </div>
          ))
        )}
      </div>

      <div className="lib-inv-audit-actions">
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
      <div className="page-header lib-inv-mb16">
        <h1 className="page-heading">Inventory Management</h1>
        {!activeAudit && (
          <button className="btn btn-primary" disabled={starting} onClick={handleStartAudit}>
            {starting ? "Starting..." : "+ Start Stock Audit"}
          </button>
        )}
      </div>

      {success && <div className="alert alert-success lib-inv-mb16">{success}</div>}
      {error && <div className="alert alert-error lib-inv-mb16">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : (
        <>
          <div className="lib-inv-summary-grid">
            {cards.map(c => (
              <div key={c.label} className="lib-inv-summary-card" style={{ "--stat-color": c.color }}>
                <div className="lib-inv-summary-value">{c.value}</div>
                <div className="lib-inv-summary-label">{c.label}</div>
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
                        <td className="lib-inv-shelf">{c.shelf || "-"} / {c.rack || "-"}</td>
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
