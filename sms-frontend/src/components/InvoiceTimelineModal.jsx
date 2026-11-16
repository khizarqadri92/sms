import { useState, useEffect } from "react";
import studentsApi from "../api/studentsApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "../pages/StudentViews.css";

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
      tone: "issued",
    });
    events.push({
      label: "Due Date",
      date: data.due_date,
      detail: "Payment due",
      tone: "due",
    });
    (data.payments || []).forEach(p => {
      events.push({
        label: "Payment Submitted",
        date: p.paid_at,
        detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " via " + (p.method || "").replace("_", " ") + (p.reference ? " (Ref: " + p.reference + ")" : ""),
        tone: "paid",
      });
      const review = p.review_status || (p.is_verified ? "verified" : "pending");
      if (review === "rejected") {
        events.push({
          label: "Payment Not Verified",
          date: p.rejected_at || null,
          detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " - " + (p.rejected_reason || "the school could not verify this payment") + ". Please submit it again.",
          tone: "due",
        });
      } else if (review === "verified") {
        events.push({
          label: "Payment Verified",
          date: p.verified_at,
          detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " confirmed by school",
          tone: "verified",
        });
      } else {
        events.push({
          label: "Pending Verification",
          date: null,
          detail: "Rs. " + Number(p.amount_paid).toLocaleString() + " awaiting school confirmation",
          tone: "pending",
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
      <div className="modal sv-modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-title">Fee Timeline</span>
            {data && <div className="sv-tl-sub">{data.invoice_no} - {data.structure_name}</div>}
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
              <div className="sv-tl-boxes">
                <div className="sv-tl-box">
                  <div className="sv-tl-label">Gross Amount</div>
                  <div className="sv-tl-value">Rs. {Number(data.net_amount).toLocaleString()}</div>
                </div>
                <div className={"sv-tl-box " + (data.status === "paid" ? "sv-tl-box--paid" : "sv-tl-box--unpaid")}>
                  <div className="sv-tl-label">Status</div>
                  <div className="sv-tl-value sv-tl-status">{data.status}</div>
                </div>
              </div>

              <div className="sv-tl">
                <div className="sv-tl-line" />
                {events.map((ev, i) => (
                  <div key={i} className={"sv-tl-event sv-ev--" + ev.tone}>
                    <div className="sv-tl-dot" />
                    <div className="sv-tl-title">{ev.label}</div>
                    <div className="sv-tl-detail">{ev.detail}</div>
                    <div className={"sv-tl-when" + (ev.pending ? " sv-tl-when--pending" : "")}>
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
