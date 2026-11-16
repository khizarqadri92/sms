import { useState, useEffect } from "react";
import studentsApi from "../api/studentsApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

export default function InvoiceTimelineModal({ studentId, invoiceId, onClose }) {
  const { formatDateTime } = useRegionalSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    studentsApi.getInvoiceTimeline(studentId, invoiceId)
      .then(r => setData(r.data.data))
      .catch(() => setError("Failed to load timeline."))
      .finally(() => setLoading(false));
  }, [studentId, invoiceId]);

  const fmtDateTime = d => d ? formatDateTime(d) : "-";

  let events = [];
  if (data) {
    events.push({
      label: "Invoice Issued",
      date: data.issued_at,
      detail: data.structure_name + (data.class_name ? " - " + data.class_name + (data.class_section ? " (" + data.class_section + ")" : "") : ""),
      color: "#2563eb",
    });
    events.push({
      label: "Due Date",
      date: data.due_date,
      detail: "Payment due",
      color: "#f59e0b",
    });
    (data.payments || []).forEach(p => {
      events.push({
        label: "Payment Submitted",
        date: p.paid_at,
        detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " via " + (p.method || "").replace("_", " ") + (p.reference ? " (Ref: " + p.reference + ")" : ""),
        color: "#7c3aed",
      });
      if (p.is_verified) {
        events.push({
          label: "Payment Verified",
          date: p.verified_at,
          detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " confirmed by school",
          color: "#16a34a",
        });
      } else {
        events.push({
          label: "Pending Verification",
          date: null,
          detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " awaiting school confirmation",
          color: "#d97706",
          pending: true,
        });
      }
    });
    events.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-title">Fee Timeline</span>
            {data && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{data.invoice_no} - {data.structure_name}</div>}
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Loading timeline...</div>
          ) : error ? (
            <div className="alert alert-error">{error}</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Gross Amount</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Rs. {Number(data.net_amount).toLocaleString()}</div>
                </div>
                <div style={{ background: data.status === "paid" ? "#f0fdf4" : "#fef2f2", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Status</div>
                  <div style={{ fontSize: 16, fontWeight: 700, textTransform: "capitalize", color: data.status === "paid" ? "#16a34a" : "#dc2626" }}>{data.status}</div>
                </div>
              </div>

              <div style={{ position: "relative", paddingLeft: 24 }}>
                <div style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: "#e2e8f0" }} />
                {events.map((ev, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                    <div style={{ position: "absolute", left: -24, top: 2, width: 14, height: 14, borderRadius: "50%", background: ev.color, border: "3px solid #fff", boxShadow: "0 0 0 1px " + ev.color }} />
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{ev.label}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{ev.detail}</div>
                    <div style={{ fontSize: 11, color: ev.pending ? "#d97706" : "#94a3b8", marginTop: 2, fontStyle: ev.pending ? "italic" : "normal" }}>
                      {ev.pending ? "Awaiting verification" : fmtDateTime(ev.date)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
