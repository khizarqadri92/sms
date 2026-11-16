import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./LibraryFineHistory.css";



function DetailModal({ record, onClose }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";
  const fmtDateTime = (d) => d ? formatDateTime(d) : "-";
  const isWaived = record.resolution === "waived";
  return (
    <div className="lib-fine-modal-overlay" onClick={onClose}>
      <div className="lib-fine-modal" onClick={e => e.stopPropagation()}>
        <div className="lib-fine-modal-header">
          <span className="lib-fine-modal-title">Fine Details</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="lib-fine-detail-grid">
          <div className="lib-fine-label">Member</div>
          <div><strong>{record.first_name} {record.last_name}</strong> ({record.library_card_no}, {record.member_type})</div>

          <div className="lib-fine-label">Book</div>
          <div>{record.book_title} — {record.accession_no}</div>

          <div className="lib-fine-label">Issued</div>
          <div>{fmtDate(record.issued_at)}</div>

          <div className="lib-fine-label">Due Date</div>
          <div>{fmtDate(record.due_date)}</div>

          <div className="lib-fine-label">Returned</div>
          <div>{fmtDate(record.returned_at)}</div>

          <div className="lib-fine-label">Condition</div>
          <div className="lib-fine-capitalize">{record.return_condition || "-"}</div>

          <div className="lib-fine-label">Original Fine</div>
          <div>Rs. {Number(record.original_fine_amount).toLocaleString()}</div>

          <div className="lib-fine-label">Resolution</div>
          <div>
            <span className={"badge lib-fine-capitalize " + (isWaived ? "badge-warning" : "badge-success")}>{record.resolution}</span>
          </div>

          {isWaived ? (
            <>
              <div className="lib-fine-label">Waived By</div>
              <div>{record.waived_by_first_name ? `${record.waived_by_first_name} ${record.waived_by_last_name}` : "-"}</div>

              <div className="lib-fine-label">Waived At</div>
              <div>{fmtDateTime(record.waived_at)}</div>
            </>
          ) : (
            <>
              <div className="lib-fine-label">Amount Paid</div>
              <div><strong className="lib-fine-amount-success">Rs. {Number(record.amount_paid).toLocaleString()}</strong></div>

              <div className="lib-fine-label">Method</div>
              <div className="lib-fine-capitalize">{record.method || "-"}</div>

              <div className="lib-fine-label">Received By</div>
              <div>{record.received_by_first_name ? `${record.received_by_first_name} ${record.received_by_last_name}` : "-"}</div>

              <div className="lib-fine-label">Paid At</div>
              <div>{fmtDateTime(record.paid_at)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LibraryFineHistory() {
  const { formatDate } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [detailRecord, setDetailRecord] = useState(null);

  const fetchHistory = (activeSearch) => {
    setLoading(true); setError("");
    const params = {};
    const s = activeSearch !== undefined ? activeSearch : search;
    if (s) params.search = s;
    libraryApi.getFineHistory(params)
      .then(r => setRecords(r.data.data || []))
      .catch(() => setError("Failed to load fine history."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHistory(); }, []);

  return (
    <div>
      <div className="page-header lib-fine-mb16">
        <h1 className="page-heading">Fine History</h1>
      </div>

      {error && <div className="alert alert-error lib-fine-mb16">{error}</div>}

      <div className="section-card lib-fine-search-card">
        <div className="lib-fine-search-row">
          <div className="form-group lib-fine-search-group">
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Member name, card no., or book title" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchHistory()} />
          </div>
          <button className="btn btn-primary" onClick={() => fetchHistory()}>Search</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : records.length === 0 ? (
        <div className="empty-state">No fine history yet.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Book</th>
                <th>Amount</th>
                <th>Resolution</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.payment_id} onClick={() => setDetailRecord(r)} className="lib-fine-row">
                  <td>
                    <div>{r.first_name} {r.last_name}</div>
                    <div className="lib-fine-muted lib-fine-card-info">{r.library_card_no}</div>
                  </td>
                  <td>{r.book_title}</td>
                  <td>Rs. {Number(r.amount_paid).toLocaleString()}</td>
                  <td>
                    <span className={"badge lib-fine-capitalize " + (r.resolution === "waived" ? "badge-warning" : "badge-success")}>{r.resolution}</span>
                  </td>
                  <td className="lib-fine-date">{fmtDate(r.paid_at || r.waived_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailRecord && (
        <DetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />
      )}
    </div>
  );
}
