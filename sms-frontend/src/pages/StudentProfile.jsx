import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import studentsApi  from "../api/studentsApi";
import academicsApi from "../api/academicsApi";
import usersApi      from "../api/usersApi";

const ALL_TABS = [
  { label:"Profile",    perm:null },
  { label:"Edit Info",  perm:"students.edit" },
  { label:"Attendance", perm:"attendance.view" },
  { label:"Grades",     perm:"grades.view" },
  { label:"Fees",       perm:"finance.view" },
  { label:"Discounts",  perm:"discounts.view" },
  { label:"Parent",     perm:"students.edit" },
  { label:"Siblings",   perm:null },
];

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US");
  } catch {
    return dateStr;
  }
}

function formatDateLong(dateStr) {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric" });
  } catch {
    return dateStr;
  }
}

function formatDateInput(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export default function StudentProfile() {
  const { can } = useAuth();
  const { id }                    = useParams();
  const navigate                  = useNavigate();
  const [student,  setStudent]    = useState(null);
  const [tab,      setTab]        = useState("Profile");

  useEffect(() => {
    const handler = (e) => {
      const s = e.detail?.sub;
      const map = {
        profile:"Profile", edit:"Edit Info", attendance:"Attendance",
        grades:"Grades", fees:"Fees", discounts:"Discounts", parent:"Parent", siblings:"Siblings"
      };
      if (map[s]) setTab(map[s]);
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);
  const [loading,  setLoading]    = useState(true);
  const [pageError, setPageError] = useState("");
  const [toast,    setToast]      = useState("");

  useEffect(() => { fetchStudent(); }, [id]);

  const fetchStudent = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getById(id);
      setStudent(res.data.data);
    } catch {
      setPageError("Student not found.");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  if (loading)   return <div className="loading-state">Loading student profile...</div>;
  if (pageError) return <div className="alert alert-error">{pageError}</div>;
  if (!student)  return null;

  const initials = (student.first_name?.[0] || "") + (student.last_name?.[0] || "");

  const profileRows = [
    ["Class",         (student.class_name ? student.class_name + (student.section ? " ("+student.section+")" : "") : "Not assigned")],
    ["Gender",        student.gender       || "N/A"],
    ["Blood Group",   student.blood_group  || "N/A"],
    ["Date of Birth", formatDate(student.date_of_birth)],
    ["Admission",     formatDate(student.admission_date)],
    ["Email",         student.email        || "N/A"],
    ["Phone",         student.phone        || "N/A"],
    ["Parent",        student.parent_name  || "Not linked"],
    ["Address",       student.address      || "N/A"],
    ["Father Name",   student.father_name   || "N/A"],
    ["Mother Name",   student.mother_name   || "N/A"],
    ["Father CNIC",   student.father_cnic   || "N/A"],
    ["Father Phone",  student.father_phone  || "N/A"],
    ["Mother Phone",  student.mother_phone  || "N/A"],
  ];

  return (
    <div>
      <button className="btn-back" onClick={() => navigate("/students")}>
        Back to Students
      </button>

      {toast && (
        <div className="alert alert-success" style={{ marginBottom:16 }}>
          {toast}
        </div>
      )}

      <div className="profile-layout">
        <div className="profile-card">
          <div className="profile-avatar">{initials.toUpperCase()}</div>
          <div className="profile-name">{student.first_name} {student.last_name}</div>
          <div className="profile-sub">{student.enrollment_no}</div>
          <span className={`badge ${student.status === "active" ? "badge-success" : "badge-danger"}`}>
            {student.status}
          </span>
          <div style={{ marginTop:20 }}>
            {profileRows.map(([label, value]) => (
              <div key={label} className="profile-detail">
                <span className="profile-detail-label">{label}</span>
                <span className="profile-detail-value">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="tabs">
            {ALL_TABS.filter(t => !t.perm || can(t.perm)).map(t => (
              <button
                key={t.label}
                className={`tab-btn ${tab === t.label ? "active" : ""}`}
                onClick={() => setTab(t.label)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "Profile"    && <ProfileTab    student={student} />}
          {tab === "Edit Info"  && <EditTab       student={student} can={can} onSaved={async () => { await fetchStudent(); showToast("Student updated successfully."); }} />}
          {tab === "Attendance" && <AttendanceTab studentId={id} />}
          {tab === "Grades"     && <GradesTab     studentId={id} />}
          {tab === "Fees"       && <FeesTab       studentId={id} />}
          {tab === "Discounts"  && <DiscountsTab   studentId={id} can={can} />}
          {tab === "Parent"     && <ParentTab      student={student} can={can} onUpdated={fetchStudent} />}
          {tab === "Siblings"   && <SiblingsTab   studentId={id} />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ student }) {
  const { can } = useAuth();
  const rows = [
    ["User ID",    String(student.user_id || "N/A")],
    ["Verified",   student.is_verified ? "Yes" : "No"],
    ["Active",     student.is_active   ? "Yes" : "No"],
    ["Last Login", student.last_login_at ? new Date(student.last_login_at).toLocaleString() : "Never"],
    ["Created",    formatDate(student.created_at)],
  ];
  return (<>
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Account Details</span>
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="profile-detail">
          <span className="profile-detail-label">{label}</span>
          <span className="profile-detail-value">{value}</span>
        </div>
      ))}

      <div className="section-card" style={{ marginTop:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Parent / Guardian</span>
          <button className="btn btn-ghost btn-sm"
            onClick={() => window.dispatchEvent(new CustomEvent("subnav-change", { detail:{ sub:"parent" } }))}>
            {student.parent_name ? "Change" : "Link Parent"}
          </button>
        </div>
        {student.parent_name ? (
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"8px 0" }}>
            <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#a78bfa)", color:"#fff", fontWeight:700, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {student.parent_name[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{student.parent_name}</div>
              {student.parent_email && <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{student.parent_email}</div>}
              {student.parent_phone && <div style={{ fontSize:12, color:"#64748b" }}>{student.parent_phone}</div>}
              <span className="badge badge-success" style={{ marginTop:6, display:"inline-block" }}>Linked</span>
            </div>
          </div>
        ) : (
          <div style={{ padding:"12px 0", textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#94a3b8", marginBottom:10 }}>No parent linked to this student.</div>
            {can && can("students.edit") && <button className="btn btn-primary btn-sm"
              onClick={() => window.dispatchEvent(new CustomEvent("subnav-change", { detail:{ sub:"parent" } }))}>
              Link Parent Now
            </button>}}
          </div>
        )}
      </div>
    </div>
  </>);

}

function EditTab({ student, can, onSaved }) {
  const [classes,  setClasses]  = useState([]);
  const [parents,  setParents]  = useState([]);
  const [form,     setForm]     = useState({
    first_name:    student.first_name    || "",
    last_name:     student.last_name     || "",
    gender:        student.gender        || "",
    date_of_birth: formatDateInput(student.date_of_birth),
    password:      "",
    blood_group:   student.blood_group   || "",
    address:       student.address       || "",
    class_id:      student.class_id      || "",
    parent_id:     student.parent_id     || "",
    status:        student.status        || "active",
    father_name:   student.father_name   || "",
    mother_name:   student.mother_name   || "",
    father_cnic:   student.father_cnic   || "",
    father_phone:  student.father_phone  || "",
    mother_phone:  student.mother_phone  || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    usersApi.getAll({ role:'parent', per_page:100 }).then(r => setParents(r.data.data || [])).catch(() => {});
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await studentsApi.update(student.id, { ...form, ...(form.password ? { password: form.password } : {}) });
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update student.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Edit Student Information</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">First Name *</label>
            <input className="form-control" name="first_name" value={form.first_name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name *</label>
            <input className="form-control" name="last_name" value={form.last_name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select className="form-control" name="gender" value={form.gender} onChange={handleChange}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input className="form-control" type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label className="form-label">Blood Group</label>
            <select className="form-control" name="blood_group" value={form.blood_group} onChange={handleChange}>
              <option value="">Select blood group</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-control" name="status" value={form.status} onChange={handleChange}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
              <option value="transferred">Transferred</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Father Name</label>
            <input className="form-control" name="father_name" value={form.father_name} onChange={handleChange} placeholder="Father's full name" />
          </div>
          <div className="form-group">
            <label className="form-label">Mother Name</label>
            <input className="form-control" name="mother_name" value={form.mother_name} onChange={handleChange} placeholder="Mother's full name" />
          </div>
          <div className="form-group">
            <label className="form-label">Father CNIC</label>
            <input className="form-control" name="father_cnic" value={form.father_cnic} onChange={handleChange} placeholder="e.g. 35202-1234567-1" />
          </div>
          <div className="form-group">
            <label className="form-label">Father Phone</label>
            <input className="form-control" name="father_phone" value={form.father_phone} onChange={handleChange} placeholder="Father contact number" />
          </div>
          <div className="form-group">
            <label className="form-label">Mother Phone</label>
            <input className="form-control" name="mother_phone" value={form.mother_phone} onChange={handleChange} placeholder="Mother contact number" />
          </div>
          <div className="form-group">
            <label className="form-label">Assign Class</label>
            <select className="form-control" name="class_id" value={form.class_id} onChange={handleChange}>
              <option value="">No class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.section ? " (" + c.section + ")" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Link Parent</label>
            <select className="form-control" name="parent_id" value={form.parent_id} onChange={handleChange}>
              <option value="">No parent</option>
              {parents.map(p => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group form-grid-full">
            <label className="form-label">Address</label>
            <input className="form-control" name="address" value={form.address} onChange={handleChange} placeholder="Full address" />
          </div>
        </div>
        <div className="form-group" style={{ marginTop:8 }}>
          <label className="form-label">New Password <span style={{ fontSize:11, color:"#94a3b8" }}>(leave blank to keep current)</span></label>
          <input className="form-control" type="password" value={form.password}
            onChange={e => setForm({...form, password:e.target.value})}
            placeholder="Enter new password..." />
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AttendanceTab({ studentId }) {
  const [records,  setRecords]  = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [fromDate, setFrom]     = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => { fetchData(); }, [studentId, fromDate, toDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rec, sum] = await Promise.all([
        studentsApi.getAttendance(studentId, { from: fromDate, to: toDate }),
        studentsApi.getAttendanceSummary(studentId, { month: fromDate }),
      ]);
      setRecords(rec.data.data  || []);
      setSummary(sum.data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const statusClass = {
    present: "badge-success",
    absent:  "badge-danger",
    late:    "badge-warning",
    excused: "badge-purple",
  };

  const borderColor = {
    present: "#22c55e",
    absent:  "#ef4444",
    late:    "#f59e0b",
    excused: "#8b5cf6",
  };

  return (
    <div>
      {summary && (
        <div className="stats-grid" style={{ marginBottom:16 }}>
          {[
            ["Total Days",   summary.total_days    || 0],
            ["Present",      summary.present_days  || 0],
            ["Absent",       summary.absent_days   || 0],
            ["Attendance %", (summary.attendance_pct || 0) + "%"],
          ].map(([label, value]) => (
            <div key={label} className="stat-card" style={{ padding:"14px 16px" }}>
              <div className="stat-card-value" style={{ fontSize:20 }}>{value}</div>
              <div className="stat-card-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">Attendance Records</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="date" className="form-control" style={{ width:150 }} value={fromDate} onChange={e => setFrom(e.target.value)} />
            <span style={{ color:"#94a3b8", fontSize:13 }}>to</span>
            <input type="date" className="form-control" style={{ width:150 }} value={toDate} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : records.length === 0 ? (
          <div className="empty-state">No records found for this period.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {records.map((r, i) => (
              <div
                key={i}
                style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"9px 14px", borderRadius:8, background:"#f8fafc",
                  borderLeft:"3px solid " + (borderColor[r.status] || "#e2e8f0")
                }}
              >
                <span style={{ fontSize:13, color:"#374151" }}>
                  {formatDateLong(r.date)}
                </span>
                <span className={"badge " + (statusClass[r.status] || "badge-gray")} style={{ textTransform:"capitalize" }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GradesTab({ studentId }) {
  const [grades,  setGrades]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentsApi.getGrades(studentId)
      .then(res => setGrades(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div className="loading-state">Loading grades...</div>;
  if (grades.length === 0) return <div className="empty-state">No published grades yet.</div>;

  const exams = [...new Set(grades.map(g => g.exam_name))];

  return (
    <div>
      {exams.map(examName => {
        const examGrades = grades.filter(g => g.exam_name === examName);
        const avg = (examGrades.reduce((s, g) => s + parseFloat(g.percentage || 0), 0) / examGrades.length).toFixed(1);
        return (
          <div key={examName} className="section-card">
            <div className="section-card-header">
              <span className="section-card-title">{examName}</span>
              <span className="badge badge-primary">Avg: {avg}%</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Marks</th>
                  <th>Total</th>
                  <th>Percentage</th>
                  <th>Grade</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {examGrades.map((g, i) => (
                  <tr key={i}>
                    <td><strong>{g.subject_name}</strong></td>
                    <td><strong>{g.marks}</strong></td>
                    <td>{g.total_marks}</td>
                    <td>{g.percentage}%</td>
                    <td><span className="badge badge-primary">{g.grade_letter}</span></td>
                    <td>
                      <span className={"badge " + (g.result === "pass" ? "badge-success" : "badge-danger")}>
                        {g.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function FeesTab({ studentId }) {
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showPayment, setShowPayment] = useState(null);
 const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");
  useEffect(() => { fetchFees(); }, [studentId]);

  const fetchFees = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getFees(studentId);
      setSummary(res.data.data);
    } catch (err) {
      console.log("Fees error:", err?.response?.status, err?.response?.data);
      setError(err?.response?.data?.message || "Failed to load fees.");
    } finally { setLoading(false); }
  };

  const handlePaymentDone = () => {
    setShowPayment(null);
    setSuccess("Payment recorded successfully.");
    fetchFees();
    setTimeout(() => setSuccess(""), 4000);
  };

  if (loading) return <div className="loading-state">Loading fees...</div>;
  if (!summary || !summary.student_id) return <div className="empty-state">No fee records found.</div>;

  const invoices = summary.invoices || [];

  const statusBadge = status => {
    const map = { paid:"badge-success", unpaid:"badge-danger", partial:"badge-warning", overdue:"badge-purple" };
    return "badge " + (map[status] || "badge-gray");
  };

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid" style={{ marginBottom:16 }}>
        {[
          { label:"Total Billed",     value:"Rs. " + Number(summary.total_billed || 0).toLocaleString(),  color:"#2563eb" },
          { label:"Total Paid",       value:"Rs. " + Number(summary.total_paid   || 0).toLocaleString(),  color:"#16a34a" },
          { label:"Balance Due",      value:"Rs. " + Number(summary.total_due    || 0).toLocaleString(),  color: summary.total_due > 0 ? "#dc2626" : "#16a34a" },
          { label:"Overdue Invoices", value: summary.overdue_count || 0, color: summary.overdue_count > 0 ? "#dc2626" : "#16a34a" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding:"14px 16px" }}>
            <div className="stat-card-value" style={{ fontSize:18, color:s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state">No invoices found for this student.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Fee Structure</th>
                <th>Amount</th>
                <th>Discount</th>
                <th>Fine</th>
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
                    <td>
                      <div style={{ fontWeight:600, fontSize:13 }}>{inv.structure_name || "Manual Invoice"}</div>
                      {inv.notes && <div style={{ fontSize:11, color:"#94a3b8" }}>{inv.notes}</div>}
                    </td>
                    <td>Rs. {Number(inv.amount).toLocaleString()}</td>
                    <td style={{ color:"#16a34a" }}>{inv.discount > 0 ? "- Rs. " + Number(inv.discount).toLocaleString() : "—"}</td>
                    <td style={{ color:"#dc2626" }}>{inv.fine > 0 ? "+ Rs. " + Number(inv.fine).toLocaleString() : "—"}</td>
                    <td><strong>Rs. {Number(inv.net_amount).toLocaleString()}</strong></td>
                    <td style={{ color:"#16a34a" }}>Rs. {Number(inv.paid_amount || 0).toLocaleString()}</td>
                    <td style={{ fontSize:12, color: inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== "paid" ? "#dc2626" : "#64748b" }}>
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-US") : "N/A"}
                    </td>
                    <td>
                      <span className={statusBadge(inv.status)} style={{ textTransform:"capitalize" }}>{inv.status}</span>
                    </td>
                    <td>
                      {inv.status !== "paid" && balance > 0 && (
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => setShowPayment({ ...inv, paid_amount: inv.paid_amount || 0 })}
                        >
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showPayment && (
        <StudentPaymentModal
          invoice={showPayment}
          onPaid={handlePaymentDone}
          onClose={() => setShowPayment(null)}
        />
      )}
    </div>
  );
}

function StudentPaymentModal({ invoice, onPaid, onClose }) {
  const balance = Number(invoice.net_amount) - Number(invoice.paid_amount || 0);
  const [form,   setForm]   = useState({ amount_paid: balance, method:"cash", reference:"", notes:"" });
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
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <span className="modal-title">Record Payment</span>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{invoice.structure_name || "Manual Invoice"}</div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Total</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>Rs. {Number(invoice.net_amount).toLocaleString()}</div>
            </div>
            <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Paid</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#16a34a" }}>Rs. {Number(invoice.paid_amount || 0).toLocaleString()}</div>
            </div>
            <div style={{ background:"#fef2f2", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>Balance</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#dc2626" }}>Rs. {Number(balance).toLocaleString()}</div>
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Amount Paying (Rs.) *</label>
              <input className="form-control" type="number" value={form.amount_paid} onChange={e => setForm({...form, amount_paid:e.target.value})} required min="1" step="0.01" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select className="form-control" value={form.method} onChange={e => setForm({...form, method:e.target.value})}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online Payment</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference No.</label>
              <input className="form-control" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Optional" />
            </div>
            <div className="modal-footer" style={{ padding:0, marginTop:16, border:"none" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Recording..." : "Record Payment"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function DiscountsTab({ studentId, can }) {
  const [discounts,  setDiscounts]  = useState([]);
  const [allTypes,   setAllTypes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({ discount_type_id:"", override_value:"", valid_from:"", valid_until:"", notes:"" });
  const [siblingHint, setSiblingHint] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");

  useEffect(() => { fetchData(); }, [studentId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { default: discountsApi } = await import("../api/discountsApi");
      const [disc, types] = await Promise.all([
        discountsApi.getStudentDiscounts(studentId),
        discountsApi.getTypes(),
      ]);
      setDiscounts(disc.data.data  || []);
      setAllTypes(types.data.data  || []);
    } catch {}
    finally { setLoading(false); }
  };

  const handleTypeChange = async (typeId) => {
    setForm(f => ({ ...f, discount_type_id: typeId, override_value: "" }));
    setSiblingHint(null);
    const selected = allTypes.find(t => String(t.id) === String(typeId));
    if (selected && selected.is_sibling) {
      try {
        const { default: discountsApi } = await import("../api/discountsApi");
        const res = await discountsApi.getSiblingRank(studentId);
        const { rank, percentage } = res.data.data;
        if (percentage != null) {
          setForm(f => ({ ...f, discount_type_id: typeId, override_value: percentage }));
          setSiblingHint(`This student is child #${rank} in the family \u2014 auto-set to ${percentage}%. You can adjust before saving.`);
        } else {
          setSiblingHint(`This student is child #${rank} in the family \u2014 no tier configured for this position, so no discount applies by default.`);
        }
      } catch {}
    }
  };

  const handleAssign = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const { default: discountsApi } = await import("../api/discountsApi");
      await discountsApi.assignDiscount(studentId, { ...form, override_value: form.override_value === "" ? null : form.override_value });
      setSuccess("Discount assigned."); setShowForm(false);
      setForm({ discount_type_id:"", override_value:"", valid_from:"", valid_until:"", notes:"" });
      setSiblingHint(null);
      fetchData(); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.response?.data?.message || "Failed to assign discount."); }
    finally { setSaving(false); }
  };

  const handleRemove = async (discId) => {
    if (!window.confirm("Remove this discount?")) return;
    try {
      const { default: discountsApi } = await import("../api/discountsApi");
      await discountsApi.removeDiscount(studentId, discId);
      setSuccess("Discount removed."); fetchData(); setTimeout(() => setSuccess(""), 3000);
    } catch { setError("Failed to remove discount."); }
  };

  const activeDiscounts   = discounts.filter(d => d.is_active);
  const inactiveDiscounts = discounts.filter(d => !d.is_active);
  const totalPct   = Math.min(100, activeDiscounts.filter(d => d.discount_type === "percentage").reduce((s, d) => s + parseFloat(d.discount_value), 0));
  const totalFixed = activeDiscounts.filter(d => d.discount_type === "fixed").reduce((s, d) => s + parseFloat(d.discount_value), 0);

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Active Discounts</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {totalPct > 0   && <span className="badge badge-success">{totalPct}% off</span>}
            {totalFixed > 0 && <span className="badge badge-primary">Rs. {totalFixed} off</span>}
            {(can ? can("discounts.manage") : true) && <button className="btn btn-primary btn-sm" style={{color:"#fff"}} onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "+ Assign Discount"}
            </button>}
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleAssign} style={{ marginBottom:16, padding:"14px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0" }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Discount Type *</label>
                <select className="form-control" value={form.discount_type_id} onChange={e => handleTypeChange(e.target.value)} required>
                  <option value="">Select discount type</option>
                  {allTypes.filter(t => t.is_active).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.is_sibling ? "auto-calculated" : (t.type === "percentage" ? t.value + "%" : "Rs. " + t.value)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Value {allTypes.find(t => String(t.id) === String(form.discount_type_id))?.is_sibling ? "(auto-calculated, editable)" : "(optional override)"}</label>
                <input className="form-control" type="number" min="0" value={form.override_value} onChange={e => setForm({...form, override_value:e.target.value})} placeholder="Leave blank to use catalog value" />
                {siblingHint && <div style={{ fontSize:11, color:"#2563eb", marginTop:4 }}>{siblingHint}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Valid From</label>
                <input className="form-control" type="date" value={form.valid_from} onChange={e => setForm({...form, valid_from:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Valid Until</label>
                <input className="form-control" type="date" value={form.valid_until} onChange={e => setForm({...form, valid_until:e.target.value})} />
              </div>
              <div className="form-group form-grid-full">
                <label className="form-label">Notes</label>
                <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Optional reason or notes" />
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{color:"#fff"}} disabled={saving}>{saving ? "Assigning..." : "Assign Discount"}</button>
            </div>
          </form>
        )}

        {loading ? <div className="loading-state">Loading...</div>
        : activeDiscounts.length === 0 ? <div className="empty-state">No discounts assigned to this student.</div>
        : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {activeDiscounts.map(d => (
              <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:"#f0fdf4", borderRadius:8, border:"1px solid #bbf7d0" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{d.discount_name}</div>
                  <div style={{ display:"flex", gap:10, marginTop:4, flexWrap:"wrap" }}>
                    <span className="badge badge-success">
                      {d.discount_type === "percentage" ? d.discount_value + "% off" : "Rs. " + d.discount_value + " off"}
                    </span>
                    {d.valid_from  && <span style={{ fontSize:11, color:"#64748b" }}>From: {new Date(d.valid_from).toLocaleDateString("en-US")}</span>}
                    {d.valid_until && <span style={{ fontSize:11, color:"#64748b" }}>Until: {new Date(d.valid_until).toLocaleDateString("en-US")}</span>}
                    {d.notes && <span style={{ fontSize:11, color:"#64748b", fontStyle:"italic" }}>{d.notes}</span>}
                  </div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Assigned by: {d.assigned_by_name || "N/A"}</div>
                </div>
                {(can ? can("discounts.manage") : true) && <button className="btn btn-danger btn-xs" onClick={() => handleRemove(d.id)}>Remove</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {inactiveDiscounts.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title" style={{ color:"#94a3b8" }}>Removed Discounts</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {inactiveDiscounts.map(d => (
              <div key={d.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 14px", background:"#f8fafc", borderRadius:6, opacity:0.6 }}>
                <span style={{ fontSize:13, color:"#64748b" }}>{d.discount_name}</span>
                <span className="badge badge-gray">{d.discount_type === "percentage" ? d.discount_value + "%" : "Rs. " + d.discount_value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParentTab({ student, can, onUpdated }) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState("");
  const [error,     setError]     = useState("");

  const handleSearch = async (val) => {
    setQuery(val);
    if (val.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await studentsApi.searchParents(val);
      setResults(res.data.data || []);
    } catch {}
    finally { setSearching(false); }
  };

  const handleLink = async (parentId) => {
    setSaving(true); setError("");
    try {
      await studentsApi.linkParent(student.id, { parent_id: parentId });
      setSuccess("Parent linked successfully.");
      setQuery(""); setResults([]);
      await onUpdated();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to link parent.");
    } finally { setSaving(false); }
  };

  const handleUnlink = async () => {
    if (!window.confirm("Remove parent link from this student?")) return;
    setSaving(true); setError("");
    try {
      await studentsApi.linkParent(student.id, { parent_id: null });
      setSuccess("Parent unlinked.");
      await onUpdated();
      setTimeout(() => setSuccess(""), 3000);
    } catch { setError("Failed to unlink parent."); }
    finally { setSaving(false); }
  };

  const hasParent = student.parent_id || student.parent_name;

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {hasParent && (
        <div className="section-card" style={{ marginBottom:16 }}>
          <div className="section-card-header">
            <span className="section-card-title">Current Parent / Guardian</span>
            {can && can("students.edit") && <button className="btn btn-danger btn-sm" onClick={handleUnlink} disabled={saving}>
              Remove Link
            </button>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, padding:"8px 0" }}>
            <div style={{ width:48, height:48, borderRadius:"50%", background:"linear-gradient(135deg, #2563eb, #60a5fa)", color:"#fff", fontWeight:700, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {(student.parent_name || "P")[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{student.parent_name || "N/A"}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>{student.parent_email || ""}</div>
              {student.parent_phone && <div style={{ fontSize:12, color:"#64748b" }}>{student.parent_phone}</div>}
            </div>
          </div>
        </div>
      )}

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">{hasParent ? "Change Parent" : "Link Parent"}</span>
        </div>
        <p style={{ fontSize:13, color:"#64748b", marginBottom:14 }}>
          Search for a user with the <strong>Parent</strong> role to link to this student.
          If the parent doesn't have an account yet, create one from the <strong>Users</strong> page first.
        </p>
        <div className="form-group">
          <label className="form-label">Search Parent by Name, Email or Phone</label>
          <input
            className="form-control"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Type at least 2 characters..."
          />
        </div>

        {searching && <div style={{ fontSize:12, color:"#64748b", padding:"8px 0" }}>Searching...</div>}

        {results.length > 0 && (
          <div style={{ border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden", marginTop:8 }}>
            {results.map((p, i) => (
              <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderBottom: i < results.length - 1 ? "1px solid #f1f5f9" : "none", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:"#0f172a" }}>
                    {p.first_name} {p.last_name}
                  </div>
                  <div style={{ fontSize:12, color:"#64748b" }}>{p.email}</div>
                  {p.phone && <div style={{ fontSize:12, color:"#64748b" }}>{p.phone}</div>}
                  {p.children_count > 0 && (
                    <span style={{ fontSize:11, color:"#2563eb" }}>{p.children_count} child(ren) linked</span>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleLink(p.id)}
                  disabled={saving}
                >
                  {saving ? "Linking..." : "Link"}
                </button>
              </div>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && !searching && (
          <div style={{ padding:"12px 14px", fontSize:13, color:"#94a3b8", background:"#f8fafc", borderRadius:8, marginTop:8 }}>
            No parents found matching "{query}".
            <a href="/users" style={{ color:"#2563eb", marginLeft:6, fontWeight:600 }}>Create a parent account</a>
          </div>
        )}
      </div>
    </div>
  );
}
function SiblingsTab({ studentId }) {
  const [siblings, setSiblings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => { fetchSiblings(); }, [studentId]);

  const fetchSiblings = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await studentsApi.getSiblings(studentId);
      setSiblings(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load siblings.");
    } finally { setLoading(false); }
  };

  if (loading) return <div className="loading-state">Loading siblings...</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Siblings</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {siblings.length === 0 ? (
        <div className="empty-state">No siblings found for this student.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Registration No.</th>
                <th>Class</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {siblings.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight:600 }}>{s.first_name} {s.last_name}</td>
                  <td>{s.enrollment_no}</td>
                  <td>{s.class_name ? s.class_name + (s.class_section ? " (" + s.class_section + ")" : "") : "Not assigned"}</td>
                  <td>
                    <span className={`badge ${s.status === "active" ? "badge-success" : "badge-danger"}`}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
