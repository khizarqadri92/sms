import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";

function IssueBookModal({ onClose, onSaved }) {
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);

  const [bookQuery, setBookQuery] = useState("");
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [availableCopy, setAvailableCopy] = useState(null);

  const [searchingMembers, setSearchingMembers] = useState(false);
  const [searchingBooks, setSearchingBooks] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");

  const searchMembers = () => {
    setSearchingMembers(true);
    libraryApi.getMembers({ search: memberQuery })
      .then(r => setMembers(r.data.data || []))
      .catch(() => {})
      .finally(() => setSearchingMembers(false));
  };

  const searchBooks = () => {
    setSearchingBooks(true);
    libraryApi.getBooks({ search: bookQuery })
      .then(r => setBooks(r.data.data || []))
      .catch(() => {})
      .finally(() => setSearchingBooks(false));
  };

  const selectBook = async (book) => {
    setSelectedBook(book);
    setAvailableCopy(null);
    try {
      const r = await libraryApi.getBook(book.id);
      const copy = (r.data.data.copies || []).find(c => c.status === "available");
      setAvailableCopy(copy || null);
    } catch {
      (() => { setError("Failed to load book copies."); setTimeout(() => setError(""), 10000); })();
    }
  };

  const handleIssue = async () => {
    if (!selectedMember || !availableCopy) return;
    setIssuing(true); setError("");
    try {
      await libraryApi.issueBook({ copy_id: availableCopy.id, member_id: selectedMember.member_id });
      onSaved();
    } catch (err) {
      (() => { setError(err.response?.data?.message || "Failed to issue book."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 700, maxHeight: "88vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Issue a Book</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>1. Select Member</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input className="form-control" placeholder="Name or card no." value={memberQuery} onChange={e => setMemberQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchMembers()} />
              <button className="btn btn-secondary btn-sm" onClick={searchMembers}>Go</button>
            </div>
            {selectedMember ? (
              <div style={{ padding: 10, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <strong>{selectedMember.first_name} {selectedMember.last_name}</strong>
                <div style={{ fontSize: 12, color: "#64748b" }}>{selectedMember.library_card_no} · {selectedMember.books_currently_issued}/{selectedMember.max_books} books issued</div>
                {Number(selectedMember.pending_fine) > 0 && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>Pending fine: Rs. {Number(selectedMember.pending_fine).toLocaleString()}</div>
                )}
                <button className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setSelectedMember(null)}>Change</button>
              </div>
            ) : searchingMembers ? (
              <div className="loading-state">Searching...</div>
            ) : (
              <div style={{ maxHeight: 200, overflow: "auto" }}>
                {members.map(m => (
                  <div key={m.member_id} onClick={() => setSelectedMember(m)} style={{ padding: 8, borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}>
                    <div style={{ fontSize: 13 }}>{m.first_name} {m.last_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.library_card_no} · {m.member_type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>2. Select Book</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input className="form-control" placeholder="Title, ISBN, or author" value={bookQuery} onChange={e => setBookQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchBooks()} />
              <button className="btn btn-secondary btn-sm" onClick={searchBooks}>Go</button>
            </div>
            {selectedBook ? (
              <div style={{ padding: 10, borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                <strong>{selectedBook.title}</strong>
                <div style={{ fontSize: 12, color: "#64748b" }}>{selectedBook.author_name || "Unknown author"}</div>
                {availableCopy ? (
                  <div style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>Copy: {availableCopy.accession_no}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>No available copy found.</div>
                )}
                <button className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => { setSelectedBook(null); setAvailableCopy(null); }}>Change</button>
              </div>
            ) : searchingBooks ? (
              <div className="loading-state">Searching...</div>
            ) : (
              <div style={{ maxHeight: 200, overflow: "auto" }}>
                {books.map(b => {
                  const isAvailable = b.available_copies > 0;
                  return (
                    <div
                      key={b.id}
                      onClick={() => isAvailable && selectBook(b)}
                      style={{ padding: 8, borderBottom: "1px solid #f1f5f9", cursor: isAvailable ? "pointer" : "not-allowed", opacity: isAvailable ? 1 : 0.6 }}
                    >
                      <div style={{ fontSize: 13 }}>{b.title}</div>
                      <div style={{ fontSize: 11, color: isAvailable ? "#94a3b8" : "#dc2626" }}>
                        {b.author_name || "Unknown"} · {isAvailable ? b.available_copies + " available" : "Not available right now"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn btn-primary" disabled={!selectedMember || !availableCopy || issuing} onClick={handleIssue}>
            {issuing ? "Issuing..." : "Issue Book"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ issue, onClose, onSaved }) {
  const [condition, setCondition] = useState("good");
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleReturn = async () => {
    setReturning(true); setError("");
    try {
      const r = await libraryApi.returnBook(issue.transaction_id, { return_condition: condition });
      setResult(r.data.data);
    } catch (err) {
      (() => { setError(err.response?.data?.message || "Failed to return book."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setReturning(false);
    }
  };

  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    try {
      await libraryApi.payFine(issue.transaction_id, { amount: payAmount || result.fine_amount, method: "cash" });
      onSaved();
    } catch {
      (() => { setError("Failed to record payment."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setPaying(false);
    }
  };

  const handleWaive = async () => {
    setPaying(true);
    try {
      await libraryApi.waiveFine(issue.transaction_id);
      onSaved();
    } catch {
      (() => { setError("Failed to waive fine."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Return Book</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{issue.book_title} · {issue.first_name} {issue.last_name}</div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {!result ? (
          <>
            <div className="form-group">
              <label className="form-label">Return Condition</label>
              <select className="form-control" value={condition} onChange={e => setCondition(e.target.value)}>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="damaged">Damaged</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={returning} onClick={handleReturn}>{returning ? "Processing..." : "Confirm Return"}</button>
            </div>
          </>
        ) : (
          <>
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              Book returned{result.days_overdue > 0 ? ` (${result.days_overdue} day(s) overdue)` : ""}.
            </div>
            {result.fine_amount > 0 ? (
              <>
                <div style={{ marginBottom: 12, fontSize: 14 }}>
                  Fine due: <strong style={{ color: "#dc2626" }}>Rs. {Number(result.fine_amount).toLocaleString()}</strong>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount to Collect</label>
                  <input className="form-control" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={String(result.fine_amount)} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button className="btn btn-secondary" disabled={paying} onClick={handleWaive}>Waive Fine</button>
                  <button className="btn btn-primary" disabled={paying} onClick={handlePay}>{paying ? "Recording..." : "Collect Payment"}</button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" onClick={onSaved}>Done</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function LibraryIssueReturn() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [returnIssue, setReturnIssue] = useState(null);
  const [viewMode, setViewMode] = useState("issues");
  const [reservations, setReservations] = useState([]);
  const [loadingRes, setLoadingRes] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [issuingResId, setIssuingResId] = useState(null);
  const [renewingId, setRenewingId] = useState(null);
  const [reportingLostId, setReportingLostId] = useState(null);

  const fetchIssues = (status) => {
    setLoading(true); setError("");
    const params = {};
    const s = status !== undefined ? status : statusFilter;
    if (s) params.status = s;
    libraryApi.getIssues(params)
      .then(r => setIssues(r.data.data || []))
      .catch(() => (() => { setError("Failed to load issues."); setTimeout(() => setError(""), 10000); })())
      .finally(() => setLoading(false));
  };

  const fetchReservations = () => {
    setLoadingRes(true);
    libraryApi.getReservations({ status: "waiting,available" })
      .then(r => setReservations(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoadingRes(false));
  };

  useEffect(() => { fetchIssues(); fetchReservations(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleReportLost = async (issue) => {
    if (!window.confirm('Report "' + issue.book_title + '" as lost by ' + issue.first_name + " " + issue.last_name + "? This will close the issue — you can charge a replacement cost afterward on the Lost Books page.")) return;
    setReportingLostId(issue.transaction_id);
    setError("");
    try {
      await libraryApi.reportBookLost(issue.transaction_id);
      showToast("Book reported lost. Go to Lost Books to charge and resolve it.");
      fetchIssues();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to report book lost.");
    } finally {
      setReportingLostId(null);
    }
  };

  const handleRenew = async (issue) => {
    setRenewingId(issue.transaction_id);
    setError("");
    try {
      const r = await libraryApi.renewBook(issue.transaction_id);
      showToast(r.data.message);
      fetchIssues();
    } catch (err) {
      (() => { setError(err.response?.data?.message || "Failed to renew book."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setRenewingId(null);
    }
  };

  const handleIssueToMember = async (res) => {
    if (!res.held_copy_id) { (() => { setError("No copy is currently being held for this reservation."); setTimeout(() => setError(""), 10000); })(); return; }
    setIssuingResId(res.id);
    setError("");
    try {
      await libraryApi.issueBook({ copy_id: res.held_copy_id, member_id: res.member_id });
      showToast("Book issued to " + res.first_name + " " + res.last_name + ".");
      fetchReservations();
      fetchIssues();
    } catch (err) {
      (() => { setError(err.response?.data?.message || "Failed to issue book."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setIssuingResId(null);
    }
  };

  const handleCancelReservation = async (res) => {
    if (!window.confirm("Cancel the reservation for \"" + res.book_title + "\"?")) return;
    setCancellingId(res.id);
    try {
      await libraryApi.cancelReservation(res.id);
      showToast("Reservation cancelled.");
      fetchReservations();
    } catch {
      (() => { setError("Failed to cancel reservation."); setTimeout(() => setError(""), 10000); })();
    } finally {
      setCancellingId(null);
    }
  };

  const statusBadge = { issued: "badge-primary", overdue: "badge-danger", returned: "badge-success" };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Issue / Return</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={"btn " + (viewMode === "issues" ? "btn-primary" : "btn-secondary")} onClick={() => setViewMode("issues")}>Issued Books</button>
          <button className={"btn " + (viewMode === "reservations" ? "btn-primary" : "btn-secondary")} onClick={() => setViewMode("reservations")}>
            Reservations {reservations.length > 0 && <span className="badge badge-warning" style={{ marginLeft: 4 }}>{reservations.length}</span>}
          </button>
          <button className="btn btn-primary" onClick={() => setShowIssueModal(true)}>+ Issue Book</button>
        </div>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {viewMode === "issues" ? (
        <>
          <div className="section-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "All", value: "" },
                { label: "Issued", value: "issued" },
                { label: "Overdue", value: "overdue" },
                { label: "Returned", value: "returned" },
              ].map(f => (
                <button
                  key={f.value}
                  className={"btn " + (statusFilter === f.value ? "btn-primary" : "btn-secondary")}
                  onClick={() => { setStatusFilter(f.value); fetchIssues(f.value); }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="loading-state">Loading issues...</div>
          ) : issues.length === 0 ? (
            <div className="empty-state">No records found.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Member</th>
                    <th>Accession No.</th>
                    <th>Issued</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Fine</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(i => (
                    <tr key={i.transaction_id}>
                      <td><strong>{i.book_title}</strong></td>
                      <td>
                        <div>{i.first_name} {i.last_name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{i.library_card_no}</div>
                      </td>
                      <td>{i.accession_no}</td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>{new Date(i.issued_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
                      <td>{new Date(i.due_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
                      <td><span className={"badge " + (statusBadge[i.current_status] || "badge-gray")} style={{ textTransform: "capitalize" }}>{i.current_status}</span></td>
                      <td>
                        {Number(i.fine_amount) > 0 ? (
                          <span style={{ color: i.fine_status === "pending" ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                            Rs. {Number(i.fine_amount).toLocaleString()} ({i.fine_status})
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                        {i.current_status !== "returned" && (
                          <>
                            <button className="btn btn-primary btn-xs" onClick={() => setReturnIssue(i)}>Return</button>
                            <button className="btn btn-danger btn-xs" disabled={reportingLostId === i.transaction_id} onClick={() => handleReportLost(i)}>
                              {reportingLostId === i.transaction_id ? "Reporting..." : "Report Lost"}
                            </button>
                            {i.current_status !== "overdue" && (
                              <button className="btn btn-secondary btn-xs" disabled={renewingId === i.transaction_id} onClick={() => handleRenew(i)}>
                                {renewingId === i.transaction_id ? "Renewing..." : "Renew"}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {loadingRes ? (
            <div className="loading-state">Loading reservations...</div>
          ) : reservations.length === 0 ? (
            <div className="empty-state">No active reservations.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Member</th>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.book_title}</strong></td>
                      <td>
                        <div>{r.first_name} {r.last_name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.library_card_no} \u00b7 {r.member_type}</div>
                      </td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>{new Date(r.requested_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
                      <td>
                        {r.status === "available" ? (
                          <span className="badge badge-success">Ready for Pickup</span>
                        ) : (
                          <span className="badge badge-warning">Waiting</span>
                        )}
                      </td>
                      <td style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                        {r.status === "available" && (
                          <button className="btn btn-primary btn-xs" disabled={issuingResId === r.id} onClick={() => handleIssueToMember(r)}>
                            {issuingResId === r.id ? "Issuing..." : "Issue to Member"}
                          </button>
                        )}
                        <button className="btn btn-danger btn-xs" disabled={cancellingId === r.id} onClick={() => handleCancelReservation(r)}>
                          {cancellingId === r.id ? "Cancelling..." : "Cancel"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showIssueModal && (
        <IssueBookModal
          onClose={() => setShowIssueModal(false)}
          onSaved={() => { setShowIssueModal(false); showToast("Book issued."); fetchIssues(); }}
        />
      )}

      {returnIssue && (
        <ReturnModal
          issue={returnIssue}
          onClose={() => setReturnIssue(null)}
          onSaved={() => { setReturnIssue(null); showToast("Return processed."); fetchIssues(); }}
        />
      )}
    </div>
  );
}
