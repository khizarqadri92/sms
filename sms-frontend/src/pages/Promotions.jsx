import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { promotionsApi } from "../api/promotionsApi";
import "./Promotions.css";
import { StaffHistory } from "./AcademicHistory";

const errMsg = (e, fb = "Something went wrong.") => e?.response?.data?.message || e?.response?.data?.detail?.message || fb;
const STATUS = {
  none: ["Not started", "pm-st--none"], draft: ["Draft", "pm-st--draft"], submitted: ["Awaiting principal", "pm-st--sub"],
  returned: ["Returned", "pm-st--ret"], executed: ["Promoted", "pm-st--done"],
};
const REASON = {
  compartment: "Compartment", fee_due: "Fee due", override: "Changed by coordinator", no_result: "No final result",
};
const RESULT = { pass: "Pass", compartment: "Compartment", fail: "Fail", none: "No result" };

/**
 * End-of-year promotion.
 * Coordinator (exam.manage): prepare each class's list, adjust, submit.
 * Principal (exam.approve): decide flagged students, approve (moves students) or return.
 */
export default function Promotions() {
  const { can } = useAuth();
  const canApprove = can("exams_results.promotion_approval");
  const canManage = can("exams_results.promotion_preparation") && !canApprove;     // coordinator side
  const [tab, setTab] = useState("classes");
  const [ov, setOv] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 4000 : 8000); };
  const loadOverview = useCallback(async () => {
    try { const r = await promotionsApi.overview(); setOv(r.data.data); }
    catch (e) { notify("error", errMsg(e, "Failed to load classes.")); }
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const run = async (fn, okMsg, after) => {
    setBusy(true);
    try { const r = await fn(); notify("success", r?.data?.message || okMsg); if (after) await after(r); }
    catch (e) { notify("error", errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="pm-page">
      <div className="pm-head">
        <div>
          <div className="pm-title">Student Promotion</div>
          <div className="pm-sub">
            {ov?.academic_year ? "Academic year " + ov.academic_year.name + " · " : ""}
            {canApprove ? "Review and approve class promotion lists" : "Prepare each class's promotion list and send it to the principal"}
          </div>
        </div>
        <div className="pm-tabs">
          <button className={"pm-tab" + (tab === "classes" ? " pm-tab--on" : "")} onClick={() => { setTab("classes"); setBatchId(null); }}>Classes</button>
          <button className={"pm-tab" + (tab === "report" ? " pm-tab--on" : "")} onClick={() => { setTab("report"); setBatchId(null); }}>Promotion Report</button>
          <button className={"pm-tab" + (tab === "history" ? " pm-tab--on" : "")} onClick={() => { setTab("history"); setBatchId(null); }}>Session History</button>
        </div>
      </div>

      {flash && <div className={"pm-flash pm-flash--" + flash.type}>{flash.msg}</div>}

      {tab === "classes" && !batchId && ov && (
        <SessionCard canManage={canManage} canApprove={canApprove} busy={busy} run={run} reload={loadOverview} />
      )}
      {tab === "classes" && !batchId && ov && (
        <ClassList ov={ov} canManage={canManage} canApprove={canApprove} busy={busy} run={run}
          reload={loadOverview} open={setBatchId} />
      )}
      {tab === "classes" && batchId && (
        <BatchView batchId={batchId} canManage={canManage} canApprove={canApprove} busy={busy} run={run}
          back={() => { setBatchId(null); loadOverview(); }} />
      )}
      {tab === "report" && <Report notify={notify} />}
      {tab === "history" && <StaffHistory />}
    </div>
  );
}

// ---------------------------------------------------------------- class list
function ClassList({ ov, canManage, canApprove, busy, run, reload, open }) {
  const missing = ov.classes.filter(c => c.level_missing);
  const [levels, setLevels] = useState({});
  const ordered = [...ov.classes].sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.label.localeCompare(b.label));

  return (
    <>
      {missing.length > 0 && (
        <div className="pm-card pm-warn-card">
          <div className="pm-card-title">Set the class order first</div>
          <div className="pm-muted">These classes have no level, so the system can't tell which class comes next. Number them in order (Play Group 1, Nursery 2, Grade 1 3, ...).</div>
          {canManage ? (
            <>
              <div className="pm-level-grid">
                {missing.map(c => (
                  <label key={c.id} className="pm-level-item">
                    <span>{c.label}</span>
                    <input type="number" min="1" className="pm-input pm-input--sm" value={levels[c.id] ?? ""}
                      onChange={e => setLevels(l => ({ ...l, [c.id]: e.target.value }))} />
                  </label>
                ))}
              </div>
              <button className="pm-btn pm-btn--primary" disabled={busy || !Object.keys(levels).length}
                onClick={() => run(() => promotionsApi.setLevels(levels), "Class order saved.", () => { setLevels({}); reload(); })}>Save Class Order</button>
            </>
          ) : <div className="pm-muted">The academic coordinator can set this.</div>}
        </div>
      )}

      {!ov.classes.some(c => c.results_ready || c.batch) ? (
        <div className="pm-card pm-closed">
          <div className="pm-closed-icon">&#128274;</div>
          <div className="pm-card-title">Promotion isn't open yet for {ov.academic_year?.name || "this session"}</div>
          <div className="pm-muted">Classes and students appear here once this session's final exam results are published.</div>
        </div>
      ) : (
      <div className="pm-card">
        <div className="pm-card-title">Classes <span className="pm-muted">(promote from the top: highest class first)</span></div>
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr><th>Class</th><th>Students</th><th>Moves to</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {ordered.map(c => {
                const st = STATUS[c.batch?.status || "none"];
                const canPrepare = canManage && c.students > 0 && !c.level_missing && c.results_ready && (!c.batch || ["draft", "returned"].includes(c.batch.status));
                const waiting = c.students > 0 && !c.level_missing && !c.results_ready && !c.batch;
                return (
                  <tr key={c.id}>
                    <td className="pm-strong">{c.label}</td>
                    <td>{c.students}</td>
                    <td>{c.level_missing ? <span className="pm-muted">Set level</span>
                      : c.next === "graduate" ? <span className="pm-grad-tag">Graduate</span> : c.next}</td>
                    <td>
                      <span className={"pm-st " + st[1]}>{st[0]}</span>
                      {c.waiting_for?.length > 0 && c.batch?.status !== "executed" && (
                        <div className="pm-wait">Waits for: {c.waiting_for.join(", ")}</div>
                      )}
                    </td>
                    <td className="pm-actions">
                      {c.batch && <button className="pm-btn" onClick={() => open(c.batch.id)}>Open</button>}
                      {waiting && <span className="pm-wait-note">{c.results_note}</span>}
                      {canPrepare && !c.batch && (
                        <button className="pm-btn pm-btn--primary" disabled={busy}
                          onClick={() => run(() => promotionsApi.prepare(c.id), "List prepared.", r => open(r.data.data.batch_id))}>Prepare List</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- one class's list
function BatchView({ batchId, canManage, canApprove, busy, run, back }) {
  const [d, setD] = useState(null);
  const [edits, setEdits] = useState({});         // item_id -> {decision, to_class_id, reason}
  const [comment, setComment] = useState("");
  const load = useCallback(async () => {
    try { const r = await promotionsApi.getBatch(batchId); setD(r.data.data); setEdits({}); } catch { setD(null); }
  }, [batchId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="pm-card pm-muted">Loading...</div>;

  const b = d.batch;
  const editable = canManage && ["draft", "returned"].includes(b.status);
  const reviewing = canApprove && b.status === "submitted";
  const items = d.items;
  const flagged = items.filter(i => i.needs_approval);
  const undecided = flagged.filter(i => !i.principal_decision).length;
  const outcome = (i) => {
    if (b.status === "executed") return i.applied_decision;
    if (i.needs_approval && i.principal_decision === "reject") return "detain";
    return i.decision;
  };
  const group = (k) => items.filter(i => outcome(i) === k && !(i.needs_approval && !i.principal_decision && b.status !== "executed"));
  const pending = items.filter(i => i.needs_approval && !i.principal_decision && b.status !== "executed");

  const saveItem = (i) => {
    const e = edits[i.id];
    run(() => promotionsApi.updateItem(batchId, i.id, {
      decision: e.decision, to_class_id: e.decision === "promote" ? Number(e.to_class_id) || null : null, reason: e.reason || null,
    }), "Saved.", load);
  };

  // plain render functions (not components) so inputs keep focus while typing
  const renderRow = (i) => {
    const e = edits[i.id];
    const changed = e && (e.decision !== i.decision || String(e.to_class_id || "") !== String(i.to_class_id || "") || (e.reason || "") !== (i.reason || ""));
    const needsReason = e && e.decision !== i.suggested_decision;
    return (
      <tr key={i.id} className={i.needs_approval && !i.principal_decision && b.status !== "executed" ? "pm-row-flag" : ""}>
        <td><div className="pm-strong">{i.student_name}</div><div className="pm-muted pm-xs">{i.enrollment_no}</div></td>
        <td>{i.final_pct != null ? i.final_pct.toFixed(2) + "%" : "-"}<div className={"pm-res pm-res--" + i.final_result}>{RESULT[i.final_result] || i.final_result}</div></td>
        <td>{i.fee_due_months ? <span className="pm-fee">{i.fee_due_months} mo due</span> : <span className="pm-muted">-</span>}</td>
        <td>
          {editable ? (
            <div className="pm-edit">
              <select className="pm-input" value={(e || i).decision}
                onChange={ev => setEdits(m => ({ ...m, [i.id]: { decision: ev.target.value, to_class_id: (e || i).to_class_id || d.targets[0]?.id || "", reason: (e || i).reason || "" } }))}>
                {d.is_final_class ? <option value="graduate">Graduate</option> : <option value="promote">Promote</option>}
                <option value="detain">Detain</option>
              </select>
              {(e || i).decision === "promote" && (
                <select className="pm-input" value={(e || i).to_class_id || ""}
                  onChange={ev => setEdits(m => ({ ...m, [i.id]: { ...(e || { decision: i.decision, reason: i.reason || "" }), to_class_id: ev.target.value } }))}>
                  <option value="">Section...</option>
                  {d.targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              )}
              {needsReason && (
                <input className="pm-input pm-input--wide" placeholder="Reason for the change (required)" value={e.reason || ""}
                  onChange={ev => setEdits(m => ({ ...m, [i.id]: { ...e, reason: ev.target.value } }))} />
              )}
              {changed && <button className="pm-btn pm-btn--primary pm-btn--sm" disabled={busy} onClick={() => saveItem(i)}>Save</button>}
            </div>
          ) : (
            <span className="pm-strong">
              {outcome(i) === "promote" ? "Promote → " + (i.to_class_label || "?") : outcome(i) === "graduate" ? "Graduate" : "Detain"}
            </span>
          )}
          {i.reason && <div className="pm-muted pm-xs">Reason: {i.reason}</div>}
        </td>
        <td>
          {(i.approval_reasons || []).filter(r => r !== "no_result" || i.decision !== "detain").map(r => <span key={r} className="pm-flag">{REASON[r] || r}</span>)}
          {i.principal_decision && <div className={"pm-pd pm-pd--" + i.principal_decision}>{i.principal_decision === "approve" ? "Principal approved" : "Principal: detain"}</div>}
          {reviewing && i.needs_approval && (
            <div className="pm-decide">
              <button className={"pm-btn pm-btn--sm" + (i.principal_decision === "approve" ? " pm-btn--ok" : "")} disabled={busy}
                onClick={() => run(() => promotionsApi.decideItem(batchId, i.id, { approve: true }), "Saved.", load)}>
                Approve {i.decision === "graduate" ? "graduation" : i.decision === "detain" ? "detention" : "promotion"}
              </button>
              <button className={"pm-btn pm-btn--sm" + (i.principal_decision === "reject" ? " pm-btn--no" : "")} disabled={busy}
                onClick={() => run(() => promotionsApi.decideItem(batchId, i.id, { approve: false }), "Saved.", load)}>Detain</button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  const renderSection = ({ title, list, tone, empty }) => (
    <div className={"pm-card pm-sec pm-sec--" + tone}>
      <div className="pm-card-title">{title} <span className="pm-count">{list.length}</span></div>
      {list.length === 0 ? <div className="pm-muted">{empty}</div> : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr><th>Student</th><th>Final result</th><th>Fee</th><th>Decision</th><th>Flags</th></tr></thead>
            <tbody>{list.map(i => renderRow(i))}</tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="pm-card pm-batch-head">
        <div>
          <button className="pm-link" onClick={back}>&larr; All classes</button>
          <div className="pm-batch-title">{d.class.label} → {d.is_final_class ? "Graduate" : d.targets.map(t => t.label).join(" / ")}</div>
          <span className={"pm-st " + STATUS[b.status][1]}>{STATUS[b.status][0]}</span>
          {d.targets.length > 0 && (
            <span className="pm-muted pm-seats">Seats: {d.targets.map(t => t.label + " " + t.students + "/" + (t.capacity || "∞")).join(" · ")}</span>
          )}
        </div>
        <div className="pm-head-actions">
          {editable && <button className="pm-btn" disabled={busy}
            onClick={() => window.confirm("Rebuild the suggestions? Your changes to this list will be lost.") && run(() => promotionsApi.prepare(b.class_id), "Suggestions rebuilt.", load)}>Rebuild Suggestions</button>}
          {editable && <button className="pm-btn pm-btn--primary" disabled={busy}
            onClick={() => run(() => promotionsApi.submit(batchId), "Sent to the principal.", load)}>Send to Principal</button>}
          {canApprove && b.status === "executed" && <button className="pm-btn pm-btn--danger" disabled={busy}
            onClick={() => window.confirm("Undo this promotion? Students go back to " + d.class.label + ".") && run(() => promotionsApi.rollback(batchId), "Undone.", back)}>Undo Promotion</button>}
        </div>
      </div>

      {b.status === "returned" && b.principal_comment && (
        <div className="pm-note pm-note--warn"><b>Returned by the principal:</b> {b.principal_comment}</div>
      )}
      {d.waiting_for?.length > 0 && b.status !== "executed" && (
        <div className="pm-note">This class can be approved only after {d.waiting_for.join(", ")} {d.waiting_for.length > 1 ? "are" : "is"} promoted (its students must move up first).</div>
      )}

      {pending.length > 0 && renderSection({ title: reviewing ? "Needs your decision" : "Needs principal approval", list: pending, tone: "flag", empty: "" })}
      {!d.is_final_class && renderSection({ title: "Promoted", list: group("promote"), tone: "ok", empty: "No students promoted." })}
      {d.is_final_class && renderSection({ title: "Graduated", list: group("graduate"), tone: "grad", empty: "No graduates." })}
      {renderSection({ title: "Detained", list: group("detain"), tone: "no", empty: "No students detained." })}

      {reviewing && (
        <div className="pm-card pm-approve">
          <textarea className="pm-input pm-textarea" placeholder="Comment (required to return; optional to approve)"
            value={comment} onChange={e => setComment(e.target.value)} />
          <div className="pm-head-actions">
            <button className="pm-btn" disabled={busy || !comment.trim()}
              onClick={() => run(() => promotionsApi.returnBatch(batchId, comment), "Returned.", back)}>Return to Coordinator</button>
            <button className="pm-btn pm-btn--primary" disabled={busy || undecided > 0} title={undecided ? "Decide the flagged students first" : ""}
              onClick={() => window.confirm("Approve and promote this class now?") && run(() => promotionsApi.approve(batchId, comment), "Approved.", load)}>
              {undecided ? `Decide ${undecided} flagged first` : "Approve & Promote"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- report
function Report({ notify }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    promotionsApi.report().then(x => setR(x.data.data)).catch(e => notify("error", errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!r) return <div className="pm-card pm-muted">Loading...</div>;
  const List = ({ title, rows, tone, showTo }) => (
    <div className={"pm-card pm-sec pm-sec--" + tone}>
      <div className="pm-card-title">{title} <span className="pm-count">{rows.length}</span></div>
      {rows.length === 0 ? <div className="pm-muted">None.</div> : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr><th>#</th><th>Student</th><th>Enrollment</th><th>Class</th>{showTo && <th>Promoted to</th>}<th>Final %</th><th>Result</th></tr></thead>
            <tbody>{rows.map((x, k) => (
              <tr key={k}><td>{k + 1}</td><td className="pm-strong">{x.student}</td><td>{x.enrollment_no}</td><td>{x.from}</td>
                {showTo && <td>{x.to}</td>}<td>{x.final_pct != null ? x.final_pct.toFixed(2) + "%" : "-"}</td><td>{RESULT[x.final_result] || x.final_result || "-"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
  return (
    <div className="pm-report">
      <div className="pm-head-actions pm-print-hide"><button className="pm-btn" onClick={() => window.print()}>Print Report</button></div>
      <List title="Promoted" rows={r.promoted} tone="ok" showTo />
      <List title="Detained" rows={r.detained} tone="no" />
      <List title="Graduated" rows={r.graduated} tone="grad" />
    </div>
  );
}


// ---------------------------------------------------------------- new session
const STEP = { not_started: "Not started", draft: "Draft", submitted: "Waiting for principal", returned: "Returned", executed: "Promoted" };

function SessionCard({ canManage, canApprove, busy, run, reload }) {
  const [s, setS] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("new");          // "new" | "existing"
  const [existingId, setExistingId] = useState("");
  const [ny, setNy] = useState({ name: "", start_date: "", end_date: "" });
  const [confirmText, setConfirmText] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await promotionsApi.session(); const d = r.data.data; setS(d);
      if (d.suggested) setNy(d.suggested);
      if (d.upcoming_years?.length) { setMode("existing"); setExistingId(String(d.upcoming_years[0].id)); }
    } catch { setS(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!s || !s.visible) return null;            // hidden until the session's final results are published

  const pending = s.classes.filter(c => !c.done);
  const pct = s.total ? Math.round(100 * s.done / s.total) : 0;
  const target = mode === "existing" ? (s.upcoming_years.find(y => String(y.id) === existingId) || {}).name : ny.name;
  const start = () => run(
    () => promotionsApi.startSession(mode === "existing" ? { to_year_id: Number(existingId) } : { new_year: ny }),
    "New session started.",
    async () => { setOpen(false); setConfirmText(""); await load(); await reload(); });

  return (
    <div className={"pm-card pm-session" + (s.ready ? " pm-session--ready" : "")}>
      <div className="pm-session-head">
        <div>
          <div className="pm-card-title">Session {s.academic_year.name}</div>
          <div className="pm-muted">
            {s.total === 0 ? "No classes have students to promote yet."
              : s.ready ? "Every class is promoted and approved. The new session can start."
              : `${s.done} of ${s.total} classes promoted · the new session can start once the principal has approved every class.`}
          </div>
        </div>
        {canManage && (
          <button className="pm-btn pm-btn--primary" disabled={!s.ready || busy} onClick={() => setOpen(true)}
            title={s.ready ? "" : "Waiting for every class to be promoted and approved"}>
            Start New Session
          </button>
        )}
        {!canManage && canApprove && s.ready && <span className="pm-st pm-st--done">Ready - the academic coordinator can start the new session</span>}
      </div>
      {s.total > 0 && <div className="pm-session-bar"><span style={{ width: pct + "%" }} /></div>}
      {pending.length > 0 && (
        <div className="pm-session-pending">
          {pending.map(c => <span key={c.class_id} className="pm-flag">{c.label}: {STEP[c.status] || c.status}</span>)}
        </div>
      )}

      {open && (
        <div className="pm-modal-overlay" onClick={() => setOpen(false)}>
          <div className="pm-modal" onClick={e => e.stopPropagation()}>
            <div className="pm-card-title">Start the new session</div>
            <div className="pm-muted pm-modal-sub">
              This closes <b>{s.academic_year.name}</b> and starts the next session for this campus. All classes move into the new session with their promoted students.
              Exam settings and the result formula are copied forward. Everything from {s.academic_year.name} - results, attendance, fees and promotion records - stays as history.
              <b> This can't be undone.</b>
            </div>

            {s.upcoming_years.length > 0 && (
              <div className="pm-modes">
                <label><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Use an existing academic year</label>
                <label><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> Create a new academic year</label>
              </div>
            )}
            {mode === "existing" ? (
              <select className="pm-input pm-full" value={existingId} onChange={e => setExistingId(e.target.value)}>
                {s.upcoming_years.map(y => <option key={y.id} value={y.id}>{y.name} ({y.start_date} to {y.end_date})</option>)}
              </select>
            ) : (
              <div className="pm-newyear">
                <label>Name<input className="pm-input" value={ny.name} onChange={e => setNy({ ...ny, name: e.target.value })} /></label>
                <label>Starts<input type="date" className="pm-input" value={ny.start_date} onChange={e => setNy({ ...ny, start_date: e.target.value })} /></label>
                <label>Ends<input type="date" className="pm-input" value={ny.end_date} onChange={e => setNy({ ...ny, end_date: e.target.value })} /></label>
              </div>
            )}

            <div className="pm-muted pm-confirm-label">Type <b>{target || "the new session name"}</b> to confirm</div>
            <input className="pm-input pm-full" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={target || ""} />
            <div className="pm-head-actions pm-modal-actions">
              <button className="pm-btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="pm-btn pm-btn--primary" disabled={busy || !target || confirmText.trim() !== target.trim()} onClick={start}>
                {busy ? "Starting..." : "Close " + s.academic_year.name + " & start " + (target || "new session")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


