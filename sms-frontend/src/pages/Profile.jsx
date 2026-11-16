import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import usersApi from "../api/usersApi";
import { useTheme, THEMES } from "../auth/ThemeContext";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./Profile.css";

const ROLE_COLORS = {
  superadmin:           { bg:"#fef2f2", color:"#dc2626", border:"#fecaca" },
  admin:                { bg:"#fffbeb", color:"#d97706", border:"#fde68a" },
  principal:            { bg:"#f5f3ff", color:"#7c3aed", border:"#ddd6fe" },
  academic_coordinator: { bg:"#eff6ff", color:"#2563eb", border:"#bfdbfe" },
  teacher:              { bg:"#f0fdf4", color:"#16a34a", border:"#bbf7d0" },
  finance_officer:      { bg:"#fffbeb", color:"#d97706", border:"#fde68a" },
  parent:               { bg:"#f8fafc", color:"#475569", border:"#e2e8f0" },
  student:              { bg:"#eff6ff", color:"#2563eb", border:"#bfdbfe" },
};

export default function Profile() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const { user, logout }      = useAuth();
  const { themeKey, theme, setTheme } = useTheme();
  const [studentProfile, setStudentProfile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState({ msg:"", type:"success" });
  const [sub,     setSub]     = useState("info");

  useEffect(() => {
    const handler = (e) => {
      const s = e.detail?.sub;
      if (["info","password","activity","theme","fees","signature"].includes(s)) setSub(s);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  useEffect(() => {
    fetchProfile();
    if (user?.roles?.includes("student")) {
      import("../api/studentsApi").then(({ default: studentsApi }) => {
        studentsApi.getMe().then(res => setStudentProfile(res.data.data)).catch(() => {});
      });
    }
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await usersApi.getMyProfile();
      setProfile(res.data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const showToast = (msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:"", type:"success" }), 4000);
  };

  if (loading) return <div className="loading-state">Loading profile...</div>;
  if (!profile) return <div className="empty-state">Profile not found.</div>;

  const initials = ((profile.first_name?.[0] || "") + (profile.last_name?.[0] || "")).toUpperCase();
  const role     = profile.roles?.[0] || "user";
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.student;

  return (
    <div>
      <h1 className="page-heading prof-page-heading">My Profile</h1>

      {toast.msg && (
        <div className={"alert alert-" + toast.type + " prof-toast"}>
          {toast.msg}
        </div>
      )}

      <div className="profile-layout">
        <div className="profile-card">
          <div className="prof-avatar-circle">
            <div className="prof-avatar" style={{ "--avatar-gradient": "linear-gradient(135deg, " + (theme?.primary || "#2563eb") + ", " + (theme?.primaryDark || "#1d4ed8") + ")" }}>
              {initials}
            </div>
            <div className="prof-name">
              {profile.first_name} {profile.last_name}
            </div>
            <div className="prof-email-text">{profile.email}</div>
            <div className="prof-role-wrap">
              <span className="prof-role-badge" style={{ "--role-bg": roleStyle.bg, "--role-color": roleStyle.color, "--role-border": roleStyle.border }}>
                {role.replace("_"," ")}
              </span>
            </div>
          </div>

          <div className="prof-details-section">
            {[
              ["Email",      profile.email          || "N/A"],
              ["Phone",      profile.phone          || "N/A"],
              ["Verified",   profile.is_verified    ? "Yes" : "No"],
              ["Status",     profile.is_active      ? "Active" : "Inactive"],
              ["Last Login", profile.last_login_at  ? formatDateTime(profile.last_login_at) : "Never"],
              ["Member Since",profile.created_at    ? formatDate(profile.created_at) : "N/A"],
            ].map(([label, value]) => (
              <div key={label} className="profile-detail">
                <span className="profile-detail-label">{label}</span>
                <span className="profile-detail-value">{value}</span>
              </div>
            ))}

            {role === "student" && (
              <div className="prof-parent-section">
                <div className="prof-parent-label">Parent / Guardian</div>
                {studentProfile?.parent_name ? (
                  <div className="prof-parent-row">
                    <div className="prof-parent-avatar">
                      {studentProfile.parent_name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="prof-parent-name">{studentProfile.parent_name}</div>
                      {studentProfile.parent_email && <div className="prof-parent-contact">{studentProfile.parent_email}</div>}
                      {studentProfile.parent_phone && <div className="prof-parent-contact">{studentProfile.parent_phone}</div>}
                    </div>
                  </div>
                ) : (
                  <div className="prof-no-parent">No parent linked to your account.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          {sub === "info"     && <EditInfoTab     profile={profile} onSaved={() => { fetchProfile(); showToast("Profile updated successfully."); }} />}
          {sub === "password" && <ChangePassTab   onSaved={() => showToast("Password changed. Please login again.")} onLogout={logout} />}
          {sub === "activity" && <ActivityTab     profile={profile} />}
          {sub === "theme"     && <ThemeTab     themeKey={themeKey} setTheme={setTheme} />}
      {sub === "signature" && <SignatureTab />}
      {sub === "fees"     && <MyFeesTab userId={profile?.id} roles={profile?.roles} />}
        </div>
      </div>
    </div>
  );
}

function EditInfoTab({ profile, onSaved }) {
  const [form,   setForm]   = useState({
    first_name: profile.first_name || "",
    last_name:  profile.last_name  || "",
    phone:      profile.phone      || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await usersApi.updateMyProfile(form);
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update profile.");
    } finally { setSaving(false); }
  };

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Edit Profile Information</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">First Name *</label>
            <input
              className="form-control"
              value={form.first_name}
              onChange={e => setForm({...form, first_name:e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name *</label>
            <input
              className="form-control"
              value={form.last_name}
              onChange={e => setForm({...form, last_name:e.target.value})}
              required
            />
          </div>
          <div className="form-group form-grid-full">
            <label className="form-label">Phone</label>
            <input
              className="form-control"
              value={form.phone}
              onChange={e => setForm({...form, phone:e.target.value})}
              placeholder="e.g. 0300-1234567"
            />
          </div>
        </div>
        <div className="prof-btn-row">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function getPasswordStrength(password) {
  if (!password) return { score:0, label:"", color:"" };
  let score = 0;
  if (password.length >= 6)  score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score, label:"Weak",   color:"#ef4444", bg:"#fef2f2", pct:20  };
  if (score === 2) return { score, label:"Fair",   color:"#f59e0b", bg:"#fffbeb", pct:40  };
  if (score === 3) return { score, label:"Good",   color:"#3b82f6", bg:"#eff6ff", pct:60  };
  if (score === 4) return { score, label:"Strong", color:"#22c55e", bg:"#f0fdf4", pct:80  };
  return              { score, label:"Very Strong", color:"#16a34a", bg:"#dcfce7", pct:100 };
}

function generatePassword() {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const digits  = "23456789";
  const special = "@#$%^&*!";
  const all     = upper + lower + digits + special;
  let pwd = "";
  pwd += upper[Math.floor(Math.random()  * upper.length)];
  pwd += lower[Math.floor(Math.random()  * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random()* special.length)];
  for (let i = 4; i < 12; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

function ChangePassTab({ onSaved, onLogout }) {
  const [form,    setForm]    = useState({ current_password:"", new_password:"", confirm_password:"" });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showCon, setShowCon] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const strength = getPasswordStrength(form.new_password);
  const matches  = form.new_password && form.confirm_password && form.new_password === form.confirm_password;
  const mismatch = form.confirm_password && form.new_password !== form.confirm_password;

  const handleGenerate = () => {
    const pwd = generatePassword();
    setForm({ ...form, new_password: pwd, confirm_password: pwd });
    setShowNew(true);
    setShowCon(true);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(form.new_password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match.");
      return;
    }
    if (form.new_password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    try {
      await usersApi.changePassword({
        current_password: form.current_password,
        new_password:     form.new_password,
      });
      await onSaved();
      setTimeout(() => onLogout(), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password.");
    } finally { setSaving(false); }
  };

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Change Password</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleGenerate}
          title="Generate a strong random password"
        >
          Generate Password
        </button>
      </div>

      <div className="prof-warning-box">
        After changing your password you will be logged out and need to sign in again.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Current Password *</label>
          <div className="prof-input-wrap">
            <input
              className="form-control prof-pwd-input"
              type={showCur ? "text" : "password"}
              value={form.current_password}
              onChange={e => setForm({...form, current_password:e.target.value})}
              required
              placeholder="Enter your current password"
            />
            <button
              type="button"
              onClick={() => setShowCur(!showCur)}
              className="prof-show-hide-btn"
            >
              {showCur ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">New Password *</label>
          <div className="prof-input-wrap">
            <input
              className="form-control prof-pwd-input"
              type={showNew ? "text" : "password"}
              value={form.new_password}
              onChange={e => setForm({...form, new_password:e.target.value})}
              required
              placeholder="Minimum 6 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="prof-show-hide-btn"
            >
              {showNew ? "Hide" : "Show"}
            </button>
          </div>

          {form.new_password && (
            <div className="prof-strength-wrap">
              <div className="prof-strength-header">
                <span className="prof-strength-text">Password strength</span>
                <span className="prof-strength-value" style={{ "--strength-color": strength.color }}>{strength.label}</span>
              </div>
              <div className="prof-strength-track">
                <div className="prof-strength-fill" style={{ "--fill-pct": strength.pct + "%", "--fill-color": strength.color }} />
              </div>
              <div className="prof-reqs-wrap">
                {[
                  ["6+ characters",   form.new_password.length >= 6],
                  ["10+ characters",  form.new_password.length >= 10],
                  ["Uppercase letter",/[A-Z]/.test(form.new_password)],
                  ["Number",          /[0-9]/.test(form.new_password)],
                  ["Symbol",          /[^A-Za-z0-9]/.test(form.new_password)],
                ].map(([label, met]) => (
                  <span key={label} className="prof-req-chip" style={{ "--chip-bg": met ? "var(--bg-success-soft)" : "var(--bg-hover)", "--chip-color": met ? "#16a34a" : "var(--text-muted)", "--chip-border": met ? "var(--border-success-soft)" : "var(--border-color)" }}>
                    {met ? "✓ " : ""}{label}
                  </span>
                ))}
              </div>

              {form.new_password && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="prof-copy-btn"
                >
                  {copied ? "Copied!" : "Copy password"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Confirm New Password *</label>
          <div className="prof-input-wrap">
            <input
              className="form-control prof-confirm-input"
              type={showCon ? "text" : "password"}
              value={form.confirm_password}
              onChange={e => setForm({...form, confirm_password:e.target.value})}
              required
              placeholder="Repeat new password"
              style={{ "--confirm-border": matches ? "#22c55e" : mismatch ? "#ef4444" : undefined }}
            />
            <button
              type="button"
              onClick={() => setShowCon(!showCon)}
              className="prof-show-hide-btn"
            >
              {showCon ? "Hide" : "Show"}
            </button>
          </div>
          {matches  && <div className="prof-match-text">Passwords match</div>}
          {mismatch && <div className="prof-mismatch-text">Passwords do not match</div>}
        </div>

        <div className="prof-btn-row">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || mismatch || !form.new_password || strength.score < 2}
          >
            {saving ? "Changing..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ActivityTab({ profile }) {
  const { formatDateTime } = useRegionalSettings();
  return (
    <div>
      <div className="section-card prof-section-mb16">
        <div className="section-card-header">
          <span className="section-card-title">Account Activity</span>
        </div>
        {[
          ["Account Created",  profile.created_at   ? formatDateTime(profile.created_at)   : "N/A"],
          ["Last Login",       profile.last_login_at ? formatDateTime(profile.last_login_at): "Never"],
          ["Account Status",   profile.is_active    ? "Active"   : "Inactive"],
          ["Email Verified",   profile.is_verified  ? "Verified" : "Not verified"],
          ["Assigned Roles",   (profile.roles || []).join(", ") || "None"],
        ].map(([label, value]) => (
          <div key={label} className="profile-detail">
            <span className="profile-detail-label">{label}</span>
            <span className="profile-detail-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Security Tips</span>
        </div>
        {[
          "Use a strong password with letters, numbers and symbols.",
          "Never share your password with anyone.",
          "Log out when using a shared computer.",
          "Contact admin if you suspect unauthorized access.",
        ].map((tip, i) => (
          <div key={i} className="prof-tip-row">
            <span className="prof-tip-num">{i+1}.</span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeTab({ themeKey, setTheme }) {
  const [saved, setSaved] = useState(false);

  const handleSelect = (key) => {
    setTheme(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Color Theme</span>
        {saved && <span className="badge badge-success">Theme applied</span>}
      </div>
      <p className="prof-theme-desc">
        Choose your preferred accent color. It applies instantly across the entire app and is saved in your browser.
      </p>
      <div className="prof-theme-grid">
        {Object.entries(THEMES).map(([key, theme]) => (
          <div
            key={key}
            onClick={() => handleSelect(key)}
            style={{
              border: themeKey === key ? "2.5px solid " + theme.primary : "1.5px solid var(--border-color)",
              borderRadius:10, overflow:"hidden", cursor:"pointer",
              boxShadow: themeKey === key ? "0 0 0 3px " + theme.primaryLight : "none",
              transition:"all 0.15s"
            }}
          >
            <div style={{ background:theme.navBg, height:36, display:"flex", alignItems:"center", padding:"0 12px", gap:6 }}>
              <span style={{ color:"#fff", fontWeight:700, fontSize:11 }}>SchoolMS</span>
              <span style={{ background:"rgba(255,255,255,0.15)", color:"#fff", fontSize:10, padding:"2px 7px", borderRadius:4 }}>Dashboard</span>
              <span style={{ color:"rgba(255,255,255,0.4)", fontSize:10, padding:"2px 7px" }}>Students</span>
            </div>
            <div style={{ padding:10, background:"#f8fafc" }}>
              <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                <div style={{ background:"#fff", borderRadius:6, padding:"6px 8px", borderTop:"2px solid " + theme.primary, flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:theme.primary }}>247</div>
                  <div style={{ fontSize:9, color:"#64748b" }}>Students</div>
                </div>
                <div style={{ background:"#fff", borderRadius:6, padding:"6px 8px", borderTop:"2px solid " + theme.primary, flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:theme.primary }}>94%</div>
                  <div style={{ fontSize:9, color:"#64748b" }}>Attendance</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ background:theme.primary, color:"#fff", fontSize:10, fontWeight:600, padding:"4px 10px", borderRadius:5 }}>Save</span>
                <span style={{ background:theme.primaryLight, color:theme.primary, border:"1px solid " + theme.primaryBorder, fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:20 }}>Active</span>
              </div>
            </div>
            <div style={{ padding:"6px 10px 8px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, fontWeight:700, color:theme.primary }}>{theme.name}</span>
              {themeKey === key && (
                <span style={{ fontSize:10, background:theme.primaryLight, color:theme.primary, padding:"2px 8px", borderRadius:20, fontWeight:700, border:"1px solid " + theme.primaryBorder }}>Active</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyFeesTab({ userId, roles }) {
  const { formatDate } = useRegionalSettings();
  const processingToday = useProcessingToday();
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [showPayment, setShowPayment] = useState(null);
  const [success,     setSuccess]     = useState("");

  useEffect(() => { fetchMyFees(); }, [userId]);

  const fetchMyFees = async () => {
    setLoading(true);
    try {
      const { default: studentsApi } = await import("../api/studentsApi");
      const { default: financeApi }  = await import("../api/financeApi");

      if (roles && roles.includes("student")) {
        const meRes = await studentsApi.getMe();
        const studentId = meRes.data.data?.id;
        if (studentId) {
          const res = await studentsApi.getFees(studentId);
          setSummary({ ...res.data.data, studentId });
        }
      } else {
        setError("Fee information is only available for students.");
      }
    } catch (err) {
      setError("Failed to load fee information.");
    } finally { setLoading(false); }
  };

  const handlePaymentDone = () => {
    setShowPayment(null);
    setSuccess("Payment recorded.");
    fetchMyFees();
    setTimeout(() => setSuccess(""), 4000);
  };

  if (loading) return <div className="loading-state">Loading fees...</div>;

  if (error) return (
    <div className="section-card">
      <div className="empty-state">{error}</div>
    </div>
  );

  if (!summary || !summary.student_id) return (
    <div className="section-card">
      <div className="empty-state">No fee records found.</div>
    </div>
  );

  const invoices = summary.invoices || [];

  const statusBadge = status => {
    const map = { paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple" };
    return "badge " + (map[status] || "badge-gray");
  };

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid prof-section-mb16">
        {[
          { label:"Total Billed",  value:"Rs. " + Number(summary.total_billed || 0).toLocaleString(), color:"#2563eb" },
          { label:"Total Paid",    value:"Rs. " + Number(summary.total_paid   || 0).toLocaleString(), color:"#16a34a" },
          { label:"Balance Due",   value:"Rs. " + Number(summary.total_due    || 0).toLocaleString(), color: summary.total_due > 0 ? "#dc2626" : "#16a34a" },
          { label:"Invoices",      value: summary.total_invoices || 0, color:"#0891b2" },
        ].map(s => (
          <div key={s.label} className="stat-card prof-stat-card">
            <div className="stat-card-value prof-stat-value" style={{ "--stat-color": s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state">No invoices found.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Fee</th>
                <th>Amount</th>
                <th>Net Amount</th>
                <th>Paid</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const balance = Number(inv.net_amount) - Number(inv.paid_amount || 0);
                return (
                  <tr key={inv.id}>
                    <td><strong>{inv.structure_name || "Invoice"}</strong></td>
                    <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                    <td><strong>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                    <td className="prof-paid-cell">Rs. {Number(inv.paid_amount || 0).toLocaleString()}</td>
                    <td style={{ fontSize:12, color: inv.due_date && new Date(inv.due_date) < new Date(processingToday) && inv.status !== "paid" ? "#dc2626" : "var(--text-secondary)" }}>
                      {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                    </td>
                    <td><span className={statusBadge(inv.status) + " prof-status-capitalize"}>{inv.status}</span></td>
                    <td>
                      {inv.status !== "paid" && balance > 0 && (
                        <button className="btn btn-primary btn-xs" onClick={() => setShowPayment({ ...inv, paid_amount: inv.paid_amount || 0 })}>
                          Pay
                        </button>
                      )}
                      {inv.status === "paid" && <span className="prof-paid-text">Paid</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showPayment && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Pay Fee</span>
              <button className="modal-close" onClick={() => setShowPayment(null)}>x</button>
            </div>
            <div className="modal-body">
              <PayFeeForm invoice={showPayment} onPaid={handlePaymentDone} onClose={() => setShowPayment(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayFeeForm({ invoice, onPaid, onClose }) {
  const balance = Number(invoice.net_amount) - Number(invoice.paid_amount || 0);
  const [form,   setForm]   = useState({ amount_paid: balance, method:"cash", reference:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleSubmit = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const { default: financeApi } = await import("../api/financeApi");
      await financeApi.recordPayment({ ...form, invoice_id: invoice.id });
      onPaid();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to record payment.");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="prof-fee-summary-grid">
        <div className="prof-fee-total-box">
          <div className="prof-fee-summary-label">Total</div>
          <div className="prof-fee-summary-value">Rs. {Number(invoice.net_amount).toLocaleString()}</div>
        </div>
        <div className="prof-fee-balance-box">
          <div className="prof-fee-summary-label">Balance</div>
          <div className="prof-fee-balance-value">Rs. {Number(balance).toLocaleString()}</div>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="form-label">Amount (Rs.) *</label>
        <input className="form-control" type="number" value={form.amount_paid} onChange={e => setForm({...form, amount_paid:e.target.value})} required min="1" step="0.01" />
      </div>
      <div className="form-group">
        <label className="form-label">Payment Method</label>
        <select className="form-control" value={form.method} onChange={e => setForm({...form, method:e.target.value})}>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cheque">Cheque</option>
          <option value="online">Online</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Reference No.</label>
        <input className="form-control" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Optional" />
      </div>
      <div className="prof-btn-row-gap">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Processing..." : "Pay Now"}</button>
      </div>
    </form>
  );
}

function SignatureTab() {
  const canvasRef                   = React.useRef(null);
  const [isDrawing, setIsDrawing]   = React.useState(false);
  const [lastPos,   setLastPos]     = React.useState(null);
  const [saved,     setSaved]       = React.useState(false);
  const [existing,  setExisting]    = React.useState(null);
  const [loading,   setLoading]     = React.useState(true);
  const [saving,    setSaving]      = React.useState(false);
  const [error,     setError]       = React.useState("");

  React.useEffect(() => {
    usersApi.getSignature()
      .then(res => {
        if (res.data.data?.signature) setExisting(res.data.data.signature);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const pos    = getPos(e, canvas);
    setIsDrawing(true);
    setLastPos(pos);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas  = canvasRef.current;
    const ctx     = canvas.getContext("2d");
    const pos     = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.stroke();
    setLastPos(pos);
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSaved(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    const sig    = canvas.toDataURL("image/png");
    setSaving(true); setError("");
    try {
      await usersApi.saveSignature({ signature: sig });
      setExisting(sig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to save signature."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete your saved signature?")) return;
    try {
      await usersApi.deleteSignature();
      setExisting(null);
      clearCanvas();
    } catch { setError("Failed to delete."); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">My Signature</span>
        {saved && <span className="badge badge-success">Saved</span>}
      </div>

      <p className="prof-sig-desc">
        Draw your signature below. It will appear on payment receipts you verify.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {existing && (
        <div className="prof-sig-existing-wrap">
          <div className="prof-sig-label">Current Saved Signature:</div>
          <div className="prof-sig-box">
            <img src={existing} alt="Signature" className="prof-sig-img" />
          </div>
          <button className="btn btn-danger btn-sm prof-sig-delete-btn" onClick={handleDelete}>
            Delete Signature
          </button>
        </div>
      )}

      <div className="prof-canvas-wrap">
        <div className="prof-sig-label">
          {existing ? "Draw New Signature:" : "Draw Your Signature:"}
        </div>
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="prof-sig-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        <div className="prof-canvas-hint">Draw using mouse or touchscreen</div>
      </div>

      <div className="prof-sig-btn-row">
        <button className="btn btn-secondary" onClick={clearCanvas}>Clear</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Signature"}
        </button>
      </div>
    </div>
  );
}