import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";



function DetailModal({ record, onClose }) {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fmtDate = (d) => d ? formatDate(d) : "-";
  const fmtDateTime = (d) => d ? formatDateTime(d) : "-";
  const isWaived = record.resolution === "waived";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Fine Details</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 10, fontSize: 13 }}>
          <div style={{ color: "#64748b" }}>Member</div>
          <div><strong>{record.first_name} {record.last_name}</strong> ({record.library_card_no}, {record.member_type})</div>

          <div style={{ color: "#64748b" }}>Book</div>
          <div>{record.book_title} — {record.accession_no}</div>

          <div style={{ color: "#64748b" }}>Issued</div>
          <div>{fmtDate(record.issued_at)}</div>

          <div style={{ color: "#64748b" }}>Due Date</div>
          <div>{fmtDate(record.due_date)}</div>

          <div style={{ color: "#64748b" }}>Returned</div>
          <div>{fmtDate(record.returned_at)}</div>

          <div style={{ color: "#64748b" }}>Condition</div>
          <div style={{ textTransform: "capitalize" }}>{record.return_condition || "-"}</div>

          <div style={{ color: "#64748b" }}>Original Fine</div>
          <div>Rs. {Number(record.original_fine_amount).toLocaleString()}</div>

          <div style={{ color: "#64748b" }}>Resolution</div>
          <div>
            <span className={"badge " + (isWaived ? "badge-warning" : "badge-success")} style={{ textTransform: "capitalize" }}>{record.resolution}</span>
          </div>

          {isWaived ? (
            <>
              <div style={{ color: "#64748b" }}>Waived By</div>
              <div>{record.waived_by_first_name ? `${record.waived_by_first_name} ${record.waived_by_last_name}` : "-"}</div>

              <div style={{ color: "#64748b" }}>Waived At</div>
              <div>{fmtDateTime(record.waived_at)}</div>
            </>
          ) : (
            <>
              <div style={{ color: "#64748b" }}>Amount Paid</div>
              <div><strong style={{ color: "#16a34a" }}>Rs. {Number(record.amount_paid).toLocaleString()}</strong></div>

              <div style={{ color: "#64748b" }}>Method</div>
              <div style={{ textTransform: "capitalize" }}>{record.method || "-"}</div>

              <div style={{ color: "#64748b" }}>Received By</div>
              <div>{record.received_by_first_name ? `${record.received_by_first_name} ${record.received_by_last_name}` : "-"}</div>

              <div style={{ color: "#64748b" }}>Paid At</div>
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
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Fine History</h1>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
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
                <tr key={r.payment_id} onClick={() => setDetailRecord(r)} style={{ cursor: "pointer" }}>
                  <td>
                    <div>{r.first_name} {r.last_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.library_card_no}</div>
                  </td>
                  <td>{r.book_title}</td>
                  <td>Rs. {Number(r.amount_paid).toLocaleString()}</td>
                  <td>
                    <span className={"badge " + (r.resolution === "waived" ? "badge-warning" : "badge-success")} style={{ textTransform: "capitalize" }}>{r.resolution}</span>
                  </td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{fmtDate(r.paid_at || r.waived_at)}</td>
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
