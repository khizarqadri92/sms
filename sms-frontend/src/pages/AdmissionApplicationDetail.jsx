import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import { statusTone } from "./AdmissionApplications";
import { RELATIONSHIPS, formatCnic, DISABILITY_TYPES, LIVING_WITH } from "./AdmissionApplicationForm";
import { TestCard, InterviewCard } from "./AdmissionAssessment";
import { openVoucher } from "./AdmissionFees";
import RegisterCard from "./AdmissionRegister";
import "./Admissions.css";

const REL = Object.fromEntries(RELATIONSHIPS);
const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const KV = ({ label, value }) => <div><span>{label}</span>{value || "-"}</div>;
const REVIEW_STAGES = ["submitted", "initial_verification", "document_verification", "documents_rejected", "correction_required"];
const CARD_ACTIONS = ["schedule_test", "record_test", "schedule_interview", "record_interview", "register"];   // handled by their own cards

/** One application: details, documents, timeline, and the actions this user can take. */
export default function AdmissionApplicationDetail() {
  const { formatDate, formatDateTime } = useRegionalSettings();
  const fD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const fDT = v => v ? formatDateTime(String(v).replace(" ", "T")) : "-";
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [d, setD] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash ? { type: "success", msg: location.state.flash } : null);
  const [busy, setBusy] = useState(false);
  const [upName, setUpName] = useState("");
  const [upFile, setUpFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);          // bump to clear the browser's file box
  const [staff, setStaff] = useState([]);
  const [parentLogin, setParentLogin] = useState(null);     // shown once after creating a parent login
  const createParentLogin = async () => {
    if (!window.confirm("Create (or link) the parent login using the primary guardian's mobile number?")) return;
    setBusy(true);
    try { const r = await admissionsApi.parentAccount(id); notify("success", r.data.message); if (r.data.data.temporary_password) setParentLogin(r.data.data); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  useEffect(() => { admissionsApi.staff().then(r => setStaff(r.data.data || [])).catch(() => {}); }, []);
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 4000 : 9000); };
  const load = useCallback(() => admissionsApi.get(id).then(r => setD(r.data.data)).catch(e => notify("error", errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (x) => {
    let remarks = null, override = false;
    if (x.blocked) {
      if (!can("admissions.admission_rule_override")) { notify("error", x.blocked); return; }
      if (!window.confirm(x.blocked + "\n\nOverride and continue anyway? This is recorded.")) return;
      override = true;
    }
    if (x.needs_remarks || override) {
      remarks = window.prompt(override ? "Reason for the override:" : `Reason for "${x.to_label}" (the parent may see this):`);
      if (remarks === null) return;
      if (!remarks.trim()) { notify("error", "Please give a reason."); return; }
    }
    setBusy(true);
    try { const r = await admissionsApi.action(id, { action: x.action, remarks, override }); notify("success", r.data.message); load(); }
    catch (e) { notify("error", errMsg(e)); }
    finally { setBusy(false); }
  };
  const upload = async () => {
    if (!upName.trim() || !upFile) { notify("error", "Choose the document and a file."); return; }
    setBusy(true);
    try { const r = await admissionsApi.uploadDoc(id, upName.trim(), upFile); notify("success", r.data.message);
          setUpName(""); setUpFile(null); setFileKey(k => k + 1); load(); }
    catch (e) { notify("error", errMsg(e)); }
    finally { setBusy(false); }
  };
  const review = async (doc, status) => {
    let remarks = null;
    if (status !== "verified") {
      remarks = window.prompt(status === "rejected" ? `Why is "${doc.document_name}" rejected? (the parent will see this)`
                                                    : `What should the parent fix in "${doc.document_name}"?`);
      if (remarks === null) return;
      if (!remarks.trim()) { notify("error", "Please give a reason."); return; }
    }
    setBusy(true);
    try { const r = await admissionsApi.reviewDoc(id, doc.id, { status, remarks }); notify("success", r.data.message); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const verifyAll = async () => {
    setBusy(true);
    try { const r = await admissionsApi.verifyAllDocs(id); notify("success", r.data.message); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const approvalStep = async (decision) => {
    const cur = d.approval.current;
    let note = "";
    if (decision === "reject") {
      note = window.prompt(`Reason for "${cur.reject_label || "Reject"}" (recorded on the application):`);
      if (note === null) return;
      if (!note.trim()) { notify("error", "Please give a reason."); return; }
    } else {
      note = window.prompt(`${cur.action_label || "Approve"} - any note? (optional)`, "");
      if (note === null) return;
    }
    setBusy(true);
    try { const r = await admissionsApi.approvalStep(id, { decision, note }); notify("success", r.data.message); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const openPdf = async (load, failMsg) => {
    try {
      const r = await load();
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { notify("error", failMsg); }
  };
  const download = async (doc) => {
    try {
      const r = await admissionsApi.downloadDoc(id, doc.id);
      const url = URL.createObjectURL(new Blob([r.data], { type: doc.mime_type || "application/octet-stream" }));
      window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { notify("error", "Could not open the document."); }
  };

  // opened from the work queue (…#am-approval): go straight to the approval card (before any early return: hook rules)
  useEffect(() => {
    if (window.location.hash === "#am-approval" && d?.approval)
      setTimeout(() => document.getElementById("am-approval")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [d?.approval]);

  if (!d) return <div className="am-page">{flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}<div className="am-card am-hint">Loading...</div></div>;
  const a = d.application;
  const pg = a.primary_guardian;
  const docOptions = [...new Set([...d.missing_documents, ...d.documents.map(x => x.document_name)])];
  const canReview = can("admissions.document_verification") && REVIEW_STAGES.includes(a.status);
  const actionOf = name => d.actions.find(x => x.action === name);
  const ready = x => x && (!x.blocked || /schedule first/i.test(x.blocked));   // usable now (the card creates the schedule)
  const nextUp = ready(actionOf("record_test"))        ? { text: "The admission test is scheduled. Next: enter the test marks.", target: "am-test", label: "Enter marks" }
               : ready(actionOf("record_interview"))   ? { text: "The interview is scheduled. Next: record the interview result.", target: "am-interview", label: "Record interview" }
               : ready(actionOf("schedule_test"))      ? { text: `Documents are verified. Waiting for the ${a.class_name} admission test to be scheduled - the applicant joins it automatically.`, go: "/admissions/tests", label: "Admission Tests" }
               : ready(actionOf("schedule_interview")) ? { text: "Next: schedule the interview.", target: "am-interview", label: "Schedule interview" }
               : null;
  const waitingOnAssessment = x => /admission test must be completed|interview must be completed/i.test(x.blocked || "");
  const stepActions = d.actions.filter(x => !CARD_ACTIONS.includes(x.action) && !(nextUp && waitingOnAssessment(x)));
  const jump = target => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="am-page">
      <div className="am-head">
        <div>
          {can("admissions.application_list_view") ? <button className="am-btn am-btn--sm" onClick={() => navigate("/admissions/applications")}>&larr; Applications</button>
            : <span className="am-status am-status--info">{a.my_assignment?.panel ? "You are on the interview panel" : "You are the examiner"}</span>}
          <div className="am-title" style={{ marginTop: 8 }}>{a.student_first_name} {a.student_last_name}</div>
          <div className="am-sub">{a.application_no} · {a.class_name} · {a.session} · {a.campus}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={"am-status am-status--" + statusTone(a.status)}>{a.status_label}{a.waiting_list_position ? " #" + a.waiting_list_position : ""}</span>
          {can("admissions.application_pdf") && <button className="am-btn" onClick={() => openPdf(() => admissionsApi.formPdf(id), "Could not open the application PDF.")}>Application (PDF)</button>}
          {a.editable && can("admissions.application_edit") && <button className="am-btn" onClick={() => navigate("/admissions/applications/" + id + "/edit")}>Edit details</button>}
        </div>
      </div>
      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}

      <div className="am-detail">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="am-card">
            <div className="am-card-title">Student</div>
            <div className="am-kv">
              <KV label="Date of birth" value={fD(a.date_of_birth)} /><KV label="Gender" value={a.gender === "female" ? "Female" : "Male"} />
              <KV label="B-Form" value={a.b_form_no ? formatCnic(a.b_form_no) : null} /><KV label="Previous school" value={a.previous_school} />
              <KV label="Previous class" value={a.previous_class} />
              {a.previous_school && <KV label="Reason for leaving" value={a.leaving_reason} />}
              <KV label="Religion" value={a.religion} /><KV label="Sect" value={a.sect} /><KV label="Nationality" value={a.nationality} />
              <KV label="Lives with" value={(LIVING_WITH.find(x => x[0] === a.living_with) || [null, null])[1]} />
              <KV label="Residential address" value={a.address} />
            </div>
          </div>
          <div className="am-card">
            <div className="am-card-title">Parents &amp; guardian</div>
            <div className="am-kv">
              <KV label={"Father" + (pg === "father" ? " (primary)" : "")} value={a.father_name} /><KV label="Father mobile" value={a.father_phone} />
              <KV label="Father CNIC" value={a.father_cnic ? formatCnic(a.father_cnic) : null} /><KV label="Father occupation" value={a.father_occupation} />
              <KV label={"Mother" + (pg === "mother" ? " (primary)" : "")} value={a.mother_name} /><KV label="Mother mobile" value={a.mother_phone} />
              <KV label="Mother CNIC" value={a.mother_cnic ? formatCnic(a.mother_cnic) : null} /><KV label="Mother occupation" value={a.mother_occupation} />
              {pg === "other" && <>
                <KV label="Guardian (primary)" value={a.guardian_name} /><KV label="Guardian mobile" value={a.guardian_phone} />
                <KV label="Relationship" value={a.guardian_relationship === "other" ? a.guardian_relationship_other : REL[a.guardian_relationship]} />
                <KV label="Guardian CNIC" value={a.guardian_cnic ? formatCnic(a.guardian_cnic) : null} />
              </>}
              <KV label="Admission messages to" value={a.notify_contact.replace("_", " ")} />
              <KV label="Parent account" value={a.parent_account ? a.parent_account.name + (a.parent_account.login_phone ? " · " + a.parent_account.login_phone : "") : "Not linked yet"} />
            </div>
            {!a.parent_user_id && can("admissions.parent_login_creation") && !["rejected", "withdrawn"].includes(a.status) && (
              <button className="am-btn am-btn--sm" style={{ marginTop: 10 }} disabled={busy} onClick={createParentLogin}>Create parent login</button>
            )}
            {parentLogin && (
              <div className="am-reg-done am-card" style={{ marginTop: 10 }}>
                <div className="am-kv">
                  <div><span>Parent login (mobile)</span><b>{parentLogin.login}</b></div>
                  <div><span>Temporary password</span><b className="am-mono">{parentLogin.temporary_password}</b></div>
                </div>
                <div className="am-notice">Give these to the parent now - the password is shown only once and must be changed at first login (valid 14 days).</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="am-btn am-btn--sm" onClick={() => navigator.clipboard?.writeText(`Login: ${parentLogin.login}\nTemporary password: ${parentLogin.temporary_password}`)}>Copy</button>
                  <button className="am-btn am-btn--sm am-btn--primary" onClick={() => setParentLogin(null)}>Done</button>
                </div>
              </div>
            )}
          </div>

          <div className="am-card">
            <div className="am-card-title">Siblings, special needs &amp; transport</div>
            <div className="am-kv">
              <div><span>Brothers / sisters at the school</span>{(a.siblings || []).length
                ? a.siblings.map(s => <div key={s.enrollment_no}><b>{s.name}</b> · {s.enrollment_no}{s.class_name ? " · " + s.class_name : ""}</div>) : "None"}</div>
              <div><span>Disability / special need</span>{a.has_disability
                ? <><b>Yes</b> · {(a.disability_types || []).map(t => (DISABILITY_TYPES.find(x => x[0] === t) || [t, t])[1]).join(", ") || "-"}
                    {a.disability_details && <div className="am-hint">{a.disability_details}</div>}</> : "None declared"}</div>
              <div><span>Transport</span>{a.transport_mode === "school_van" ? <><b>School van</b><div className="am-hint">{a.pickup_address}</div></> : "Self pick and drop"}</div>
            </div>
          </div>

          <div className="am-card">
            <div className="am-card-title">Documents {d.missing_documents.length > 0 && <span className="am-status am-status--warn">{d.missing_documents.length} missing</span>}
              {canReview && d.documents.some(x => x.status === "pending") && <button className="am-btn am-btn--sm am-btn--ok" style={{ marginLeft: "auto" }} disabled={busy} onClick={verifyAll}>Verify all pending</button>}
            </div>
            {d.documents.map(doc => (
              <div className="am-doc" key={doc.id}>
                <div><b>{doc.document_name}</b><div className="am-hint">{doc.original_name} · {Math.round((doc.file_size || 0) / 1024)} KB{doc.remarks ? " · " + doc.remarks : ""}</div></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={"am-status am-status--" + ({ verified: "good", rejected: "bad", resubmission_required: "warn" }[doc.status] || "")}>{doc.status.replace("_", " ")}</span>
                  <button className="am-btn am-btn--sm" onClick={() => download(doc)}>Open</button>
                  {a.status === "draft" && can("admissions.document_verification") && <span className="am-hint">Submit the application to review documents</span>}
                  {canReview && (
                    <span className="am-doc-actions">
                      {doc.status !== "verified" && <button className="am-btn am-btn--sm am-btn--ok" disabled={busy} onClick={() => review(doc, "verified")}>Verify</button>}
                      {doc.status !== "resubmission_required" && <button className="am-btn am-btn--sm am-btn--warn" disabled={busy} onClick={() => review(doc, "resubmission_required")}>Ask to re-upload</button>}
                      {doc.status !== "rejected" && <button className="am-btn am-btn--sm am-btn--bad" disabled={busy} onClick={() => review(doc, "rejected")}>Reject</button>}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {d.missing_documents.map(m => <div className="am-doc" key={m}><div><b>{m}</b><div className="am-hint">Not uploaded yet</div></div><span className="am-status am-status--warn">missing</span></div>)}
            {can("admissions.document_upload") && !["admission_completed", "rejected", "withdrawn"].includes(a.status) && (
              <div className="am-filters" style={{ marginTop: 12 }}>
                <label className="am-field">Document
                  <input className="am-input" list="am-doc-names" value={upName} onChange={e => setUpName(e.target.value)} placeholder="Choose or type" />
                  <datalist id="am-doc-names">{docOptions.map(o => <option key={o} value={o} />)}</datalist>
                </label>
                <label className="am-field">File (PDF, JPG, PNG · max 5 MB)
                  <input key={fileKey} className="am-input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setUpFile(e.target.files?.[0] || null)} />
                </label>
                <button className="am-btn am-btn--primary" disabled={busy} onClick={upload}>Upload</button>
              </div>
            )}
          </div>
          <RegisterCard app={a} canRegister={can("admissions.student_registration")} notify={notify} reload={load} />
          {a.fee_invoice_id && (
            <div className="am-card">
              <div className="am-card-title">Admission fee</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="am-hint">Voucher issued on approval{a.fee_waived ? " · fee waived" : ""}.</span>
                <button className="am-btn am-btn--sm" onClick={() => openVoucher(a.fee_invoice_id, notify)}>Voucher (PDF)</button>
                <button className="am-btn am-btn--sm" onClick={() => navigate("/admissions/fees")}>Admission Fees &rarr;</button>
              </div>
            </div>
          )}
          {!a.fee_invoice_id && a.fee_waived && <div className="am-card am-hint">No admission fee for this applicant (waived).</div>}
          <div id="am-test" />
          <TestCard appId={id} className={a.class_name} tests={d.tests} action={actionOf("schedule_test")} recordAction={actionOf("record_test")} staff={staff} notify={notify} reload={load} />
          <div id="am-interview" />
          <InterviewCard appId={id} className={a.class_name} campusId={a.campus_id} yearId={a.academic_year_id} interviews={d.interviews} action={actionOf("schedule_interview")} recordAction={actionOf("record_interview") || (a.my_assignment?.can_record_interview ? { action: "record_interview" } : null)} staff={staff} notify={notify} reload={load} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {d.approval && (
            <div className="am-card" id="am-approval">
              <div className="am-card-title">Approval <span className="am-muted">· {d.approval.workflow}</span>
                {d.approval.status !== "active" && <span className={"am-status am-status--" + ({ completed: "good", rejected: "bad" }[d.approval.status] || "")}>{d.approval.status}</span>}
              </div>
              <div className="am-timeline">
                {d.approval.steps.map(s => (
                  <div key={s.step_order} className={"am-tl am-step am-step--" + s.status}>
                    <b>{s.step_name}</b> <span className={"am-status am-status--" + ({ approved: "good", rejected: "bad", pending: "info", skipped: "" }[s.status] || "")}>{s.status === "pending" && d.approval.current?.step_order === s.step_order ? "waiting" : s.status}</span>
                    <div className="am-tl-when">
                      {s.actioned_at ? (s.actioned_by_name || "") + " · " + fDT(s.actioned_at)
                        : "Assigned to " + (s.assigned_role ? "any " + s.assigned_role.replace(/_/g, " ") : (s.assignee_name || "-"))}
                    </div>
                    {s.note && <div className="am-tl-note">{s.note}</div>}
                  </div>
                ))}
              </div>
              {d.approval.can_act && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="am-btn am-btn--primary" disabled={busy} onClick={() => approvalStep("approve")}>{d.approval.current.action_label || "Approve"}</button>
                  {d.approval.current.can_reject && <button className="am-btn am-btn--bad" disabled={busy} onClick={() => approvalStep("reject")}>{d.approval.current.reject_label || "Reject"}</button>}
                </div>
              )}
              {d.approval.status === "active" && !d.approval.can_act && d.approval.current && (
                <div className="am-hint">Waiting for: {d.approval.current.step_name}</div>
              )}
            </div>
          )}
          <div className="am-card">
            <div className="am-card-title">Next steps</div>
            {nextUp && (
              <div className="am-next">
                <div>{nextUp.text}</div>
                <button className="am-btn am-btn--primary am-btn--sm" onClick={() => nextUp.go ? navigate(nextUp.go) : jump(nextUp.target)}>{nextUp.label} {nextUp.go ? "\u2192" : "\u2193"}</button>
              </div>
            )}
            {stepActions.length ? (
              <div className="am-actions">
                {stepActions.map(x => (
                  <button key={x.action} disabled={busy} className={"am-btn am-action" + (x.blocked ? "" : " am-btn--primary")}
                    title={x.blocked || ""} onClick={() => act(x)}>
                    {x.action.replace(/_/g, " ").replace(/^./, s => s.toUpperCase())} → {x.to_label}
                    {x.blocked && <small>{x.blocked}</small>}
                  </button>
                ))}
              </div>
            ) : !nextUp && <div className="am-hint">Nothing for you to do at this stage.</div>}
          </div>
          <div className="am-card">
            <div className="am-card-title">Timeline</div>
            <div className="am-timeline">
              {d.history.map(h => (
                <div key={h.id} className={"am-tl" + (h.is_internal ? " am-tl--internal" : "")}>
                  <b>{h.title || h.to_label}</b>{h.is_override && <span className="am-status am-status--warn" style={{ marginLeft: 6 }}>override</span>}
                  <div className="am-tl-when">{fDT(h.acted_at)} · {h.acted_by_name || "System"}{h.is_internal ? " · internal" : ""}</div>
                  {h.remarks && <div className="am-tl-note">{h.remarks}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
