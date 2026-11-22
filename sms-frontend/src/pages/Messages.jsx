import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import messagesApi from "../api/messagesApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./Messages.css";

const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const initials = n => (n || "?").split(" ").map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
const TOPIC_LABEL = { academic: "Academic", behaviour: "Behaviour", attendance: "Attendance", health: "Health", fees: "Fees", other: "Other" };
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];

/* ------------------------------------------------------------------ asks for a reason or note */
function ReasonDialog({ title, label, required, confirm, onSubmit, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="msg-modal" onClick={onClose}>
      <div className="msg-modal-box" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="msg-modal-head"><b>{title}</b><button type="button" className="msg-x" onClick={onClose} aria-label="Close">&#10005;</button></div>
        <label className="msg-field">{label}{!required && " (optional)"}
          <textarea className="msg-input msg-textarea" rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="msg-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="msg-btn primary" disabled={busy || (required && !text.trim())}
                  onClick={async () => { setBusy(true); await onSubmit(text.trim()); setBusy(false); }}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}

const STATUS_TAG = { escalated: ["Escalated", "msg-tag--esc"], closed: ["Closed", "msg-tag--closed"] };
const StatusTag = ({ status }) => STATUS_TAG[status] ? <span className={"msg-tag " + STATUS_TAG[status][1]}>{STATUS_TAG[status][0]}</span> : null;

/* ------------------------------------------------------------------ conversation list */
function ConversationList({ rows, current, onOpen, view, formatDateTime, search, setSearch, waitingOnly, setWaitingOnly, status, setStatus }) {
  return (
    <div className="msg-list">
      <div className="msg-list-tools">
        <input className="msg-input" placeholder={view === "all" ? "Search student, parent or teacher" : "Search"} value={search}
               onChange={e => setSearch(e.target.value)} aria-label="Search conversations" />
        {view === "all" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select className="msg-input" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option><option value="open">Open</option><option value="escalated">Escalated</option><option value="closed">Closed</option>
            </select>
            <label className="msg-check"><input type="checkbox" checked={waitingOnly} onChange={e => setWaitingOnly(e.target.checked)} /> Waiting for reply</label>
          </div>
        )}
      </div>
      {rows === null && <div className="msg-empty">Loading...</div>}
      {rows && rows.length === 0 && <div className="msg-empty">No conversations yet.</div>}
      {rows && rows.map(r => {
        const title = view === "all" ? `${r.parent_name} \u2194 ${r.teacher_name}` : r.with_name;
        return (
          <button key={r.id} type="button" className={"msg-row" + (current === r.id ? " active" : "")} onClick={() => onOpen(r.id)}>
            <span className="msg-avatar">{initials(view === "all" ? r.student_name : r.with_name)}</span>
            <span className="msg-row-main">
              <span className="msg-row-top">
                <span className="msg-row-name">{title}</span>
                <StatusTag status={r.status} />
                {r.last_message_at && <span className="msg-row-time">{formatDateTime(r.last_message_at)}</span>}
              </span>
              <span className="msg-row-sub">{r.student_name}{r.class_label ? ` \u00b7 ${r.class_label}` : ""}</span>
              <span className="msg-row-preview">
                {r.last_preview || <em>No messages yet</em>}
                {r.unread > 0 && view !== "all" && <span className="msg-badge">{r.unread}</span>}
                {r.waiting && <span className="msg-waiting">Waiting for reply</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ one conversation */
function Thread({ convId, onSent, formatDateTime, topics }) {
  const [dialog, setDialog] = useState(null);           // {title, label, required, confirm, run}
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const load = useCallback(() => messagesApi.get(convId).then(r => setD(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [convId]);
  useEffect(() => { setD(null); setNote(null); load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [d?.messages?.length]);
  const download = async a => {
    try {
      const r = await messagesApi.attachment(a.id);
      const url = URL.createObjectURL(r.data); const link = document.createElement("a");
      link.href = url; link.download = a.file_name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  const send = async () => {
    if (!text.trim() && !files.length) return;
    setBusy(true); setNote(null);
    const fd = new FormData(); fd.append("body", text); if (topic) fd.append("topic", topic); files.forEach(f => fd.append("files", f));
    try {
      const r = await messagesApi.send(convId, fd);
      setText(""); setFiles([]); setTopic(""); if (fileRef.current) fileRef.current.value = "";
      if (r.data.message && r.data.message !== "Sent.") setNote({ type: "info", msg: r.data.message });
      await load(); onSent && onSent();
    } catch (e) { setNote({ type: "err", msg: errMsg(e) }); } finally { setBusy(false); }
  };
  const act = async (fn, ...args) => {
    try { const r = await fn(...args); setNote({ type: "ok", msg: r.data.message }); setDialog(null); await load(); onSent && onSent(); }
    catch (e) { setNote({ type: "err", msg: errMsg(e) }); setDialog(null); }
  };
  if (!d) return <div className="msg-thread"><div className="msg-empty">{note ? note.msg : "Loading..."}</div></div>;
  const c = d.conversation;
  const can = c.can || {};
  // header: the OTHER person (or both, for oversight)
  const head = c.i_am === "parent"
    ? { name: c.teacher_name, sub: [d.teacher_roles.join(", "), `about ${c.student_name}`].filter(Boolean).join(" \u00b7 ") }
    : c.i_am === "teacher"
      ? { name: c.parent_name, sub: `Parent of ${c.student_name}${c.class_label ? " \u00b7 " + c.class_label : ""}` }
      : { name: `${c.parent_name} \u2194 ${c.teacher_name}`, sub: `${c.student_name}${c.class_label ? " \u00b7 " + c.class_label : ""}` };
  return (
    <div className="msg-thread">
      <div className="msg-thread-head">
        <span className="msg-avatar msg-avatar--lg">{initials(c.i_am === "oversight" ? c.student_name : head.name)}</span>
        <div className="msg-thread-title">
          <div className="msg-thread-name">{head.name} <StatusTag status={c.status} /></div>
          <div className="msg-thread-sub">{head.sub}</div>
          {c.status === "escalated" && c.member_names?.length > 0 && <div className="msg-thread-sub">With the school's leadership: {c.member_names.join(", ")}</div>}
        </div>
        <div className="msg-actions">
          {can.escalate && <button type="button" className="msg-btn msg-btn--sm" onClick={() => setDialog({ title: "Escalate to the school's leadership",
              label: "Why are you escalating?", required: true, confirm: "Escalate", run: t => act(messagesApi.escalate, convId, t) })}>Escalate</button>}
          {can.resolve && <button type="button" className="msg-btn msg-btn--sm" onClick={() => setDialog({ title: "Resolve the escalation",
              label: "Outcome", required: false, confirm: "Resolve", run: t => act(messagesApi.resolve, convId, t) })}>Resolve</button>}
          {can.close && <button type="button" className="msg-btn msg-btn--sm" onClick={() => setDialog({ title: "Close this conversation",
              label: "Note", required: false, confirm: "Close", run: t => act(messagesApi.close, convId, t) })}>Close</button>}
          {can.reopen && <button type="button" className="msg-btn msg-btn--sm" onClick={() => act(messagesApi.reopen, convId)}>Reopen</button>}
        </div>
      </div>
      <div className="msg-messages" role="log" aria-live="polite">
        {d.messages.length === 0 && <div className="msg-empty">No messages yet. Say hello!</div>}
        {d.messages.map(m => m.kind === "event" ? (
          <div key={m.id} className="msg-event"><span>{m.body}</span><span className="msg-event-time">{formatDateTime(m.created_at)}</span></div>
        ) : (
          <div key={m.id} className={"msg-bubble-row" + (m.mine ? " mine" : "")}>
            <div className={"msg-bubble" + (m.mine ? " mine" : "")}>
              {!m.mine && <div className="msg-sender">{m.sender_name}</div>}
              {m.topic && <span className="msg-topic">{TOPIC_LABEL[m.topic] || m.topic}</span>}
              {m.body && <div className="msg-body">{m.body}</div>}
              {m.attachments.map(a => (
                <button key={a.id} type="button" className="msg-file" onClick={() => download(a)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>
                  {a.file_name}
                </button>
              ))}
              <div className="msg-meta">
                {formatDateTime(m.created_at)}{m.edited_at ? " \u00b7 edited" : ""}{m.sent_outside_hours ? " \u00b7 after hours" : ""}
                {m.mine && <span className={"msg-seen" + (m.seen ? " on" : "")}>{m.seen ? " \u00b7 Seen" : " \u00b7 Sent"}</span>}
                {!m.mine && can.report && (m.reported_by_me
                  ? <span className="msg-reported"> \u00b7 Reported</span>
                  : <button type="button" className="msg-report" onClick={() => setDialog({ title: "Report this message",
                      label: "What is wrong with this message?", required: true, confirm: "Report", run: t => act(messagesApi.report, m.id, t) })}>Report</button>)}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {note && <div className={"msg-note " + note.type}>{note.msg}</div>}
      {dialog && <ReasonDialog {...dialog} onSubmit={dialog.run} onClose={() => setDialog(null)} />}
      {c.read_only ? (
        <div className="msg-readonly">
          {!c.participant ? "Read-only: you are viewing this conversation for oversight."
            : c.status === "closed" ? (can.reopen ? "This conversation is closed. Reopen it to write again." : "This conversation is closed.")
            : "This conversation is from a past session and is kept as read-only history."}
        </div>
      ) : (
        <div className="msg-compose">
          <textarea className="msg-input msg-textarea" rows={2} placeholder="Write a message..." value={text} maxLength={4000}
                    onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} aria-label="Message" />
          <div className="msg-compose-bar">
            <select className="msg-input msg-topic-select" value={topic} onChange={e => setTopic(e.target.value)} aria-label="Topic">
              <option value="">Topic (optional)</option>
              {topics.map(t => <option key={t} value={t}>{TOPIC_LABEL[t] || t}</option>)}
            </select>
            <label className="msg-attach">
              <input ref={fileRef} type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 5))} />
              {files.length ? `${files.length} file(s)` : "Attach"}
            </label>
            <span className="msg-hint">Max {d.settings.max_attachment_mb} MB · {d.settings.allowed_file_types}</span>
            <button type="button" className="msg-btn primary" disabled={busy || (!text.trim() && !files.length)} onClick={send}>{busy ? "Sending..." : "Send"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ new conversation */
function NewConversation({ cfg, preChild, onClose, onStarted }) {
  const [contacts, setContacts] = useState(null);
  const [childId, setChildId] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { messagesApi.contacts().then(r => { setContacts(r.data.data); const ch = r.data.data.children || [];
                        if (ch.length) setChildId(preChild && ch.some(x => String(x.id) === String(preChild)) ? String(preChild) : String(ch[0].id)); })
                      .catch(e => setErr(errMsg(e))); }, []);
  const start = async (studentId, withUser) => {
    try { const r = await messagesApi.start(studentId, withUser); onStarted(r.data.data.id); } catch (e) { setErr(errMsg(e)); }
  };
  const child = (contacts?.children || []).find(c => String(c.id) === childId);
  const students = (contacts?.students || []).filter(s => (!preChild || cfg.as_parent || String(s.student_id) === String(preChild))
    && (!q || (s.student_name + " " + s.parent_name + " " + s.class_label).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="msg-modal" onClick={onClose}>
      <div className="msg-modal-box" role="dialog" aria-label="New message" onClick={e => e.stopPropagation()}>
        <div className="msg-modal-head"><b>New message</b><button type="button" className="msg-x" onClick={onClose} aria-label="Close">&#10005;</button></div>
        {err && <div className="msg-note err">{err}</div>}
        {!contacts && !err && <div className="msg-empty">Loading...</div>}
        {cfg.as_parent && contacts && (
          <div className="msg-pick">
            {(contacts.children || []).length > 1 && (
              <label className="msg-field">Child
                <select className="msg-input" value={childId} onChange={e => setChildId(e.target.value)}>
                  {contacts.children.map(c => <option key={c.id} value={c.id}>{c.name}{c.class_label ? ` - ${c.class_label}` : ""}</option>)}
                </select>
              </label>
            )}
            {child && child.teachers.length === 0 && <div className="msg-empty">No teachers are assigned to {child.name}'s class yet.</div>}
            {child && child.teachers.map(t => (
              <button key={t.user_id} type="button" className="msg-row" onClick={() => start(child.id, t.user_id)}>
                <span className="msg-avatar">{initials(t.name)}</span>
                <span className="msg-row-main"><span className="msg-row-name">{t.name}</span><span className="msg-row-sub">{t.roles.join(", ")}</span></span>
              </button>
            ))}
          </div>
        )}
        {cfg.as_teacher && contacts && (
          <div className="msg-pick">
            {contacts.teachers_can_start === false ? <div className="msg-empty">Starting conversations is turned off - you can reply when a parent writes.</div> : (
              <>
                <input className="msg-input" placeholder="Search student, parent or class" value={q} onChange={e => setQ(e.target.value)} aria-label="Search students" />
                {students.length === 0 && <div className="msg-empty">No students found.</div>}
                {students.slice(0, 80).map(s => (
                  <button key={s.student_id} type="button" className="msg-row" onClick={() => start(s.student_id, s.parent_user_id)}>
                    <span className="msg-avatar">{initials(s.student_name)}</span>
                    <span className="msg-row-main"><span className="msg-row-name">{s.parent_name}</span><span className="msg-row-sub">Parent of {s.student_name} · {s.class_label}</span></span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ reported messages (oversight) */
function ReportsTab({ formatDateTime, onOpenConversation }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState(null);
  const load = useCallback(() => messagesApi.reports(status).then(r => setRows(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })), [status]);
  useEffect(() => { setRows(null); load(); }, [load]);
  return (
    <div className="msg-card msg-reports">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <select className="msg-input" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status" style={{ maxWidth: 200 }}>
          <option value="open">Waiting for review</option><option value="reviewed">Reviewed</option><option value="all">All</option>
        </select>
      </div>
      {note && <div className={"msg-note " + note.type}>{note.msg}</div>}
      {rows === null && <div className="msg-empty">Loading...</div>}
      {rows && rows.length === 0 && <div className="msg-empty">No reported messages.</div>}
      {rows && rows.map(r => (
        <div key={r.id} className="msg-report-card">
          <div className="msg-report-quote">{r.body || <em>(attachment only)</em>}</div>
          <div className="msg-hint">Sent by <b>{r.sender_name}</b> · {formatDateTime(r.sent_at)} · about {r.student_name}</div>
          <div className="msg-hint">Reported by <b>{r.reported_by_name}</b> · {formatDateTime(r.created_at)}: {r.reason}</div>
          {r.status === "reviewed" && <div className="msg-hint">Reviewed by {r.reviewed_by_name} · {formatDateTime(r.reviewed_at)}{r.review_note ? ": " + r.review_note : ""}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="msg-btn msg-btn--sm" onClick={() => onOpenConversation(r.conversation_id)}>Open conversation</button>
            {r.status === "open" && <button type="button" className="msg-btn msg-btn--sm primary" onClick={() => setDialog({ id: r.id })}>Mark reviewed</button>}
          </div>
        </div>
      ))}
      {dialog && <ReasonDialog title="Mark as reviewed" label="What was done" required={false} confirm="Mark reviewed" onClose={() => setDialog(null)}
        onSubmit={async t => { try { const r = await messagesApi.reviewReport(dialog.id, t); setNote({ type: "ok", msg: r.data.message }); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); } setDialog(null); load(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ settings */
function SettingsTab() {
  const [s, setS] = useState(null);
  const [note, setNote] = useState(null);
  useEffect(() => { messagesApi.getSettings().then(r => setS(r.data.data)).catch(e => setNote({ type: "err", msg: errMsg(e) })); }, []);
  if (!s) return <div className="msg-card">{note ? note.msg : "Loading..."}</div>;
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));
  const save = async () => {
    setNote(null);
    try { const r = await messagesApi.saveSettings(s); setNote({ type: "ok", msg: r.data.message }); } catch (e) { setNote({ type: "err", msg: errMsg(e) }); }
  };
  return (
    <div className="msg-card msg-settings">
      <div className="msg-hint">These settings apply to: <b>{s.scope}</b></div>
      <label className="msg-check"><input type="checkbox" checked={!!s.enabled} onChange={e => set("enabled", e.target.checked)} /> Messaging is turned on</label>
      <label className="msg-check"><input type="checkbox" checked={!!s.teachers_can_start} onChange={e => set("teachers_can_start", e.target.checked)} /> Teachers can start conversations</label>
      <div className="msg-field">Contact days
        <div className="msg-days">{DAYS.map(([n, l]) => (
          <label key={n} className="msg-check"><input type="checkbox" checked={s.contact_days.includes(n)}
            onChange={e => set("contact_days", e.target.checked ? [...s.contact_days, n].sort() : s.contact_days.filter(x => x !== n))} /> {l}</label>
        ))}</div>
      </div>
      <div className="msg-grid">
        <label className="msg-field">Contact hours from<input className="msg-input" type="time" value={s.contact_start} onChange={e => set("contact_start", e.target.value)} /></label>
        <label className="msg-field">to<input className="msg-input" type="time" value={s.contact_end} onChange={e => set("contact_end", e.target.value)} /></label>
        <label className="msg-field">Reply target (hours)<input className="msg-input" type="number" min={1} max={720} value={s.reply_target_hours} onChange={e => set("reply_target_hours", Number(e.target.value))} /></label>
        <label className="msg-field">Edit window (minutes)<input className="msg-input" type="number" min={0} max={1440} value={s.edit_window_minutes} onChange={e => set("edit_window_minutes", Number(e.target.value))} /></label>
        <label className="msg-field">Max attachment (MB)<input className="msg-input" type="number" min={1} max={50} value={s.max_attachment_mb} onChange={e => set("max_attachment_mb", Number(e.target.value))} /></label>
        <label className="msg-field">Allowed file types<input className="msg-input" value={s.allowed_file_types} onChange={e => set("allowed_file_types", e.target.value)} /></label>
      </div>
      <label className="msg-check"><input type="checkbox" checked={!!s.allow_outside_hours} onChange={e => set("allow_outside_hours", e.target.checked)} /> Parents may send messages outside contact hours (teachers reply during school hours)</label>
      {note && <div className={"msg-note " + note.type}>{note.msg}</div>}
      <div><button type="button" className="msg-btn primary" onClick={save}>Save settings</button></div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export default function Messages() {
  const { formatDateTime } = useRegionalSettings();
  const [params, setParams] = useSearchParams();
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("mine");
  const [rows, setRows] = useState(null);
  const [current, setCurrent] = useState(params.get("c") ? Number(params.get("c")) : null);
  const [search, setSearch] = useState("");
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [status, setStatus] = useState("");
  const [preChild, setPreChild] = useState(null);                 // ?student=… : New message for that child
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { messagesApi.config().then(async r => {
      const c = r.data.data; setCfg(c);
      if (params.get("tab") === "reports" && c.oversight) setTab("reports");
      else if (!c.as_parent && !c.as_teacher && c.oversight) setTab("all");
      // deep links from other pages: ?student=ID&with=USER opens (or starts) that conversation; ?student=ID picks the child
      const sid = params.get("student"), wid = params.get("with");
      if (sid && wid) {
        try { const s = await messagesApi.start(Number(sid), Number(wid)); setCurrent(s.data.data.id); setParams({ c: String(s.data.data.id) }); }
        catch (e) { setErr(errMsg(e)); }
      } else if (sid && (c.as_parent || c.as_teacher)) { setPreChild(sid); setShowNew(true); }
    }).catch(e => setErr(errMsg(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const loadList = useCallback(() => {
    if (tab === "settings" || tab === "reports") return;
    messagesApi.list({ view: tab === "all" ? "all" : "mine", waiting: waitingOnly || undefined, q: search || undefined, status: (tab === "all" && status) || undefined })
      .then(r => setRows(r.data.data)).catch(e => setErr(errMsg(e)));
  }, [tab, waitingOnly, search, status]);
  useEffect(() => { setRows(null); const t = setTimeout(loadList, search ? 300 : 0); const i = setInterval(loadList, 30000); return () => { clearTimeout(t); clearInterval(i); }; }, [loadList, search]);
  const open = id => { setCurrent(id); setParams(id ? { c: String(id) } : {}); };
  if (err && !cfg) return <div className="msg-page"><div className="msg-note err">{err}</div></div>;
  if (!cfg) return <div className="msg-page"><div className="msg-empty">Loading...</div></div>;
  const tabs = [(cfg.as_parent || cfg.as_teacher) && ["mine", "My conversations"], cfg.oversight && ["all", "All conversations"],
                cfg.oversight && ["reports", "Reports"], cfg.can_configure && ["settings", "Settings"]].filter(Boolean);
  return (
    <div className="msg-page">
      <div className="msg-head">
        <div>
          <h1 className="msg-title">Messages</h1>
          <div className="msg-hint">
            {cfg.as_parent ? "Talk to your child's class teacher and subject teachers." : cfg.as_teacher ? "Talk to the parents of the students you teach." : "Parent-teacher conversations."}
            {" "}Teachers reply during school hours ({cfg.settings.contact_start}-{cfg.settings.contact_end}).
          </div>
        </div>
        {tab === "mine" && (cfg.as_parent || cfg.as_teacher) && <button type="button" className="msg-btn primary" onClick={() => setShowNew(true)}>New message</button>}
      </div>
      {tabs.length > 1 && (
        <div className="msg-tabs" role="tablist">
          {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={"msg-tab" + (tab === k ? " on" : "")} onClick={() => { setTab(k); setCurrent(null); setParams({}); }}>{l}</button>)}
        </div>
      )}
      {tab === "settings" ? <SettingsTab /> : tab === "reports" ? (
        <ReportsTab formatDateTime={formatDateTime} onOpenConversation={id => { setTab("all"); open(id); }} />
      ) : (
        <div className={"msg-layout" + (current ? " has-thread" : "")}>
          <ConversationList rows={rows} current={current} onOpen={open} view={tab} formatDateTime={formatDateTime}
                            search={search} setSearch={setSearch} waitingOnly={waitingOnly} setWaitingOnly={setWaitingOnly} status={status} setStatus={setStatus} />
          {current ? (
            <div className="msg-thread-wrap">
              <button type="button" className="msg-back" onClick={() => open(null)}>&larr; All conversations</button>
              <Thread key={current} convId={current} onSent={loadList} formatDateTime={formatDateTime} topics={cfg.topics} />
            </div>
          ) : <div className="msg-thread msg-placeholder"><div className="msg-empty">Choose a conversation{tab === "mine" ? ", or start a new message." : "."}</div></div>}
        </div>
      )}
      {showNew && <NewConversation cfg={cfg} preChild={preChild} onClose={() => setShowNew(false)} onStarted={id => { setShowNew(false); loadList(); open(id); }} />}
    </div>
  );
}
