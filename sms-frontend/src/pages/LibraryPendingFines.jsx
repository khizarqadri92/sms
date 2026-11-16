import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./LibraryPendingFines.css";

function PayModal({ fine, onClose, onSaved }) {
  const [amount, setAmount] = useState(fine.fine_amount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handlePay = async () => {
    setSaving(true); setError("");
    try {
      await libraryApi.payFine(fine.transaction_id, { amount, method: "cash" });
      onSaved("Payment recorded.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  };

  const handleWaive = async () => {
    if (!window.confirm("Waive this fine of Rs. " + fine.fine_amount + "?")) return;
    setSaving(true); setError("");
    try {
      await libraryApi.waiveFine(fine.transaction_id);
      onSaved("Fine waived.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to waive fine.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lib-pf-modal-overlay" onClick={onClose}>
      <div className="lib-pf-modal" onClick={e => e.stopPropagation()}>
        <div className="lib-pf-modal-title">Settle Fine</div>
        <div className="lib-pf-modal-subtitle">
          {fine.first_name} {fine.last_name} — {fine.book_title}
        </div>

        {error && <div className="alert alert-error lib-pf-mb12">{error}</div>}

        <div className="form-group">
          <label className="form-label">Amount to Collect</label>
          <input className="form-control" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>

        <div className="lib-pf-modal-footer">
          <button className="btn btn-secondary" disabled={saving} onClick={handleWaive}>Waive</button>
          <button className="btn btn-primary" disabled={saving} onClick={handlePay}>{saving ? "Processing..." : "Collect Payment"}</button>
        </div>
      </div>
    </div>
  );
}

export default function LibraryPendingFines() {
  const { formatDate } = useRegionalSettings();
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [payFine, setPayFine] = useState(null);

  const fetchFines = (activeSearch) => {
    setLoading(true); setError("");
    const params = {};
    const s = activeSearch !== undefined ? activeSearch : search;
    if (s) params.search = s;
    libraryApi.getPendingFines(params)
      .then(r => setFines(r.data.data || []))
      .catch(() => setError("Failed to load pending fines."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchFines(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const totalPending = fines.reduce((sum, f) => sum + Number(f.fine_amount), 0);

  return (
    <div>
      <div className="page-header lib-pf-mb16">
        <h1 className="page-heading">Pending Fines</h1>
      </div>

      {success && <div className="alert alert-success lib-pf-mb16">{success}</div>}
      {error && <div className="alert alert-error lib-pf-mb16">{error}</div>}

      <div className="section-card lib-pf-search-card">
        <div className="lib-pf-search-row">
          <div className="form-group lib-pf-search-group">
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Member name, card no., or book title" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchFines()} />
          </div>
          <button className="btn btn-primary" onClick={() => fetchFines()}>Search</button>
          {fines.length > 0 && (
            <div className="lib-pf-total">
              Total pending: <strong className="lib-pf-amount">Rs. {totalPending.toLocaleString()}</strong> across {fines.length} fine(s)
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : fines.length === 0 ? (
        <div className="empty-state">No pending fines.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Book</th>
                <th>Reason</th>
                <th>Returned</th>
                <th>Fine</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fines.map(f => (
                <tr key={f.transaction_id}>
                  <td>
                    <div>{f.first_name} {f.last_name}</div>
                    <div className="lib-pf-muted lib-pf-card-info">{f.library_card_no} · {f.member_type}</div>
                  </td>
                  <td>{f.book_title}</td>
                  <td>
                    <span className={"badge lib-pf-capitalize " + (f.return_condition === "damaged" ? "badge-warning" : f.return_condition === "lost" ? "badge-danger" : "badge-gray")}>
                      {f.return_condition === "damaged" ? "Damage" : f.return_condition === "lost" ? "Lost" : "Overdue"}
                    </span>
                  </td>
                  <td className="lib-pf-date">{f.returned_at ? formatDate(f.returned_at) : "Not returned yet"}</td>
                  <td><strong className="lib-pf-amount">Rs. {Number(f.fine_amount).toLocaleString()}</strong></td>
                  <td>
                    <button className="btn btn-primary btn-xs" onClick={() => setPayFine(f)}>Settle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payFine && (
        <PayModal
          fine={payFine}
          onClose={() => setPayFine(null)}
          onSaved={(msg) => { setPayFine(null); showToast(msg); fetchFines(); }}
        />
      )}
    </div>
  );
}
