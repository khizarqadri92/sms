import React, { useState, useEffect } from "react";
import libraryApi from "../api/libraryApi";

const ROLE_LABELS = {
  student: "Student",
  teacher: "Teacher",
  superadmin: "Super Admin",
  admin: "Admin",
  principal: "Principal",
  librarian: "Librarian",
  hr: "HR",
  finance_officer: "Finance Officer",
  procurement: "Procurement",
  academic_coordinator: "Academic Coordinator",
};

function RuleRow({ rule, onSaved }) {
  const [form, setForm] = useState({
    max_books: rule.max_books,
    borrow_days: rule.borrow_days,
    renewal_limit: rule.renewal_limit,
    fine_per_day: rule.fine_per_day,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (field, value) => {
    setForm({ ...form, [field]: value });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await libraryApi.updateMembershipRule(rule.member_type, form);
      setDirty(false);
      onSaved();
    } catch {
      alert("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td><strong>{ROLE_LABELS[rule.member_type] || rule.member_type}</strong></td>
      <td>
        <input className="form-control" type="number" min="1" style={{ width: 90 }}
          value={form.max_books} onChange={e => update("max_books", e.target.value)} />
      </td>
      <td>
        <input className="form-control" type="number" min="1" style={{ width: 90 }}
          value={form.borrow_days} onChange={e => update("borrow_days", e.target.value)} />
      </td>
      <td>
        <input className="form-control" type="number" min="0" style={{ width: 90 }}
          value={form.renewal_limit} onChange={e => update("renewal_limit", e.target.value)} />
      </td>
      <td>
        <input className="form-control" type="number" min="0" step="0.01" style={{ width: 100 }}
          value={form.fine_per_day} onChange={e => update("fine_per_day", e.target.value)} />
      </td>
      <td>
        <button className="btn btn-primary btn-xs" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save"}
        </button>
      </td>
    </tr>
  );
}

export default function LibrarySettings() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");

  const fetchRules = () => {
    setLoading(true);
    libraryApi.getMembershipRules()
      .then(r => setRules(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRules(); }, []);

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Library Settings</h1>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Borrowing Rules by Role</span>
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Configure how many books each type of member can hold at once, how many days they get before a book is due, how many times they can renew, and the daily fine for overdue books.
        </div>

        {loading ? (
          <div className="loading-state">Loading rules...</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Max Books</th>
                  <th>Due Days</th>
                  <th>Max Renewals</th>
                  <th>Fine / Day (Rs.)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <RuleRow key={r.member_type} rule={r} onSaved={() => { showToast("Rule for " + (ROLE_LABELS[r.member_type] || r.member_type) + " updated."); fetchRules(); }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
