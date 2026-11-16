import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./LibraryLostBooks.css";

function ResolveModal({ copy, onClose, onSaved }) {
  const [resolution, setResolution] = useState("replace");
  const [chargeAmount, setChargeAmount] = useState(copy.purchase_price || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const r = await libraryApi.resolveLostCopy(copy.copy_id, {
        resolution,
        charge_amount: chargeAmount ? Number(chargeAmount) : 0,
      });
      onSaved(r.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to resolve.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lib-lost-modal-overlay" onClick={onClose}>
      <div className="lib-lost-modal" onClick={e => e.stopPropagation()}>
        <div className="lib-lost-modal-title">Resolve Lost Copy</div>
        <div className="lib-lost-modal-subtitle">{copy.book_title} — {copy.accession_no}</div>

        {error && <div className="alert alert-error lib-lost-mb12">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Resolution</label>
            <select className="form-control" value={resolution} onChange={e => setResolution(e.target.value)}>
              <option value="found">Found (return to circulation)</option>
              <option value="replace">Replace (buy a new copy)</option>
              <option value="remove">Remove from Inventory (write off)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Replacement Cost to Charge</label>
            <input className="form-control" type="number" min="0" step="0.01" placeholder="0.00" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} />
            <div className="lib-lost-hint">
              {copy.purchase_price ? `Suggested from purchase price: Rs. ${Number(copy.purchase_price).toLocaleString()}. ` : ""}
              {copy.first_name ? `Will be charged to ${copy.first_name} ${copy.last_name}.` : "No member is on file for this loss report."}
            </div>
          </div>
          <div className="lib-lost-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Resolve"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LibraryLostBooks() {
  const { formatDate } = useRegionalSettings();
  const [copies, setCopies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resolveCopy, setResolveCopy] = useState(null);

  const fetchCopies = () => {
    setLoading(true);
    libraryApi.getLostCopies()
      .then(r => setCopies(r.data.data || []))
      .catch(() => setError("Failed to load lost copies."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCopies(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 4000);
  };

  return (
    <div>
      <div className="page-header lib-lost-mb16">
        <h1 className="page-heading">Lost Books</h1>
      </div>

      {success && <div className="alert alert-success lib-lost-mb16">{success}</div>}
      {error && <div className="alert alert-error lib-lost-mb16">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : copies.length === 0 ? (
        <div className="empty-state">No lost copies right now.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Accession No.</th>
                <th>Reported By</th>
                <th>Reported On</th>
                <th>Fine</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {copies.map(c => (
                <tr key={c.copy_id}>
                  <td><strong>{c.book_title}</strong></td>
                  <td>{c.accession_no}</td>
                  <td>{c.first_name ? `${c.first_name} ${c.last_name}` : <span className="lib-lost-muted">Unknown</span>}</td>
                  <td className="lib-lost-date">{c.last_returned_at ? formatDate(c.last_returned_at) : "-"}</td>
                  <td>
                    {Number(c.fine_amount) > 0 ? (
                      <span className={c.fine_status === "pending" ? "lib-lost-fine-pending" : "lib-lost-fine-paid"}>
                        Rs. {Number(c.fine_amount).toLocaleString()} ({c.fine_status})
                      </span>
                    ) : "-"}
                  </td>
                  <td>
                    <button className="btn btn-primary btn-xs" onClick={() => setResolveCopy(c)}>Resolve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolveCopy && (
        <ResolveModal
          copy={resolveCopy}
          onClose={() => setResolveCopy(null)}
          onSaved={(msg) => { setResolveCopy(null); showToast(msg); fetchCopies(); }}
        />
      )}
    </div>
  );
}
