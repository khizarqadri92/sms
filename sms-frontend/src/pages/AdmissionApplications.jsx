import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import "./Admissions.css";

export const statusTone = s => ({ admission_completed: "good", approved: "good", payment_verified: "good", fee_voucher_generated: "info",
  payment_partially_paid: "info", rejected: "bad", withdrawn: "bad", documents_rejected: "bad", correction_required: "warn",
  awaiting_approval: "warn", further_evaluation: "warn", on_hold: "warn", waiting_list: "warn", submitted: "info" })[s] || "";
const GROUPS = [["", "All statuses"], ["new", "New"], ["under_review", "Under review"], ["pending_documents", "Pending documents"],
  ["test_scheduled", "Test scheduled"], ["interview_scheduled", "Interview scheduled"], ["awaiting_approval", "Awaiting approval"],
  ["approved", "Approved"], ["rejected", "Rejected"], ["waiting_list", "Waiting list"], ["pending_fee", "Pending fee"],
  ["completed", "Completed"], ["draft", "Drafts"]];

/** Admission applications: search, filter, open, create. */
export default function AdmissionApplications() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const navigate = useNavigate();
  // links from the Work Queue / Workflow Builder arrive as ?id=123 - open that application
  useEffect(() => {
    const qid = new URLSearchParams(window.location.search).get("id");
    if (qid) navigate("/admissions/applications/" + qid, { replace: true });
  }, [navigate]);
  const { can } = useAuth();
  const [meta, setMeta] = useState(null);
  const [classes, setClasses] = useState([]);
  const [f, setF] = useState({ academic_year_id: "", campus: "", class_name: "", status: "", q: "" });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    admissionsApi.years().then(r => { const m = r.data.data; setMeta(m); setF(x => ({ ...x, campus: m.campus_id || "", academic_year_id: m.default_year || "" })); })
      .catch(e => setError(e?.response?.data?.message || "Could not load."));
  }, []);
  useEffect(() => {
    if (!f.campus) { setClasses([]); return; }
    admissionsApi.getSettings({ campus: f.campus, ...(f.academic_year_id ? { academic_year_id: f.academic_year_id } : {}) })
      .then(r => setClasses(r.data.data.classes.map(c => c.class_name))).catch(() => setClasses([]));
  }, [f.campus, f.academic_year_id]);
  const load = useCallback(async () => {
    if (!meta) return;
    const params = { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")), page, per_page: 20 };
    try { const r = await admissionsApi.list(params); setD(r.data.data); setError(""); }
    catch (e) { setError(e?.response?.data?.message || "Could not load applications."); }
  }, [f, page, meta]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setPage(1); };
  const pages = d ? Math.max(1, Math.ceil(d.total / d.per_page)) : 1;

  return (
    <div className="am-page">
      <div className="am-head">
        <div><div className="am-title">Admission Applications</div><div className="am-sub">Search, review and process applications</div></div>
        {can("admissions.application_create") && <button className="am-btn am-btn--primary" onClick={() => navigate("/admissions/applications/new")}>+ New Application</button>}
      </div>
      <div className="am-card">
        <div className="am-filters">
          <label className="am-field" style={{ flex: 1, minWidth: 220 }}>Search
            <input className="am-input" placeholder="Application no., student, father or phone" value={f.q} onChange={e => set("q", e.target.value)} />
          </label>
          {meta && !meta.campus_id && (
            <label className="am-field">Campus
              <select className="am-input" value={f.campus} onChange={e => set("campus", e.target.value)}>
                <option value="">All campuses</option>{meta.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="am-field">Session
            <select className="am-input" value={f.academic_year_id} onChange={e => set("academic_year_id", e.target.value)}>
              <option value="">All sessions</option>{(meta?.years || []).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
          <label className="am-field">Class
            <select className="am-input" value={f.class_name} onChange={e => set("class_name", e.target.value)} disabled={!classes.length}>
              <option value="">All classes</option>{classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="am-field">Status
            <select className="am-input" value={f.status} onChange={e => set("status", e.target.value)}>
              {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error && <div className="am-flash am-flash--error">{error}</div>}
      <div className="am-card">
        <div className="am-table-wrap">
          <table className="am-table">
            <thead><tr><th>Application</th><th>Student</th><th>Class</th><th>Parent / phone</th><th>Status</th><th>Docs</th><th>Updated</th></tr></thead>
            <tbody>
              {d && d.items.map(a => (
                <tr key={a.id} className="am-click" onClick={() => navigate("/admissions/applications/" + a.id)}>
                  <td><b>{a.application_no}</b><div className="am-hint">{a.session}{meta && !meta.campus_id ? " · " + a.campus : ""}{a.source === "staff" ? " · staff entry" : ""}</div></td>
                  <td>{a.student}<div className="am-hint">{a.gender === "female" ? "Girl" : "Boy"} · born {fD(a.date_of_birth)}</div></td>
                  <td>{a.class_name}</td>
                  <td>{a.parent_name || "-"}<div className="am-hint">{a.phone || ""}</div></td>
                  <td><span className={"am-status am-status--" + statusTone(a.status)}>{a.status_label}{a.waiting_list_position ? " #" + a.waiting_list_position : ""}</span></td>
                  <td>{a.docs_open ? <span className="am-status am-status--warn">{a.docs_open} to check</span> : <span className="am-hint">-</span>}</td>
                  <td className="am-hint">{fD(a.updated_at)}</td>
                </tr>
              ))}
              {d && !d.items.length && <tr><td colSpan={7} className="am-hint" style={{ textAlign: "center", padding: 30 }}>No applications match.</td></tr>}
            </tbody>
          </table>
        </div>
        {d && d.total > d.per_page && (
          <div className="am-pager">
            <span>{d.total} applications</span>
            <span>
              <button className="am-btn am-btn--sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>{" "}
              Page {page} of {pages}{" "}
              <button className="am-btn am-btn--sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
