import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import accessApi from "../api/accessApi";
import DatePicker from "../components/DatePicker";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./AccessControl.css";

// superadmin always keeps these (it can't be locked out of this page)
const SUPER_KEEP = new Set(["users_access.role_management", "users_access.permission_management", "users_access.role_assignment", "users_access.permission_history"]);
const errMsg = e => e?.response?.data?.message || e?.response?.data?.detail?.message || "Something went wrong.";
const label = n => (n || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/* ------------------------------------------------------------------ tri-state checkbox */
function Tri({ checked, some, onChange, disabled }) {
  return <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange}
    ref={el => { if (el) el.indeterminate = !checked && some; }} onClick={e => e.stopPropagation()} />;
}

/* ================================================================== ROLES & PERMISSIONS */
function RolesTab({ catalogue, notify }) {
  const { can } = useAuth();
  const canEdit = can("users_access.permission_management");
  const [roles, setRoles] = useState([]);
  const [sel, setSel] = useState(null);
  const [saved, setSaved] = useState(new Set());       // as stored
  const [cur, setCur] = useState(new Set());           // as ticked now
  const [q, setQ] = useState("");
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);            // {mode:'new'|'edit', name, description, copy}
  const loadRoles = useCallback(() => accessApi.roles().then(r => setRoles(r.data.data)).catch(e => notify("err", errMsg(e))), [notify]);
  useEffect(() => { loadRoles(); }, [loadRoles]);
  const pick = async role => {
    if (dirty && !window.confirm("Discard the unsaved changes?")) return;
    setSel(role);
    const r = await accessApi.rolePermissions(role.id);
    const s = new Set(r.data.data); setSaved(s); setCur(new Set(s));
  };
  const added = [...cur].filter(c => !saved.has(c)), removed = [...saved].filter(c => !cur.has(c));
  const dirty = added.length + removed.length > 0;
  const isSuper = sel?.name === "superadmin";
  const toggle = (codes, on) => setCur(s => { const n = new Set(s); codes.forEach(c => on ? n.add(c) : (isSuper && SUPER_KEEP.has(c) ? null : n.delete(c))); return n; });
  const match = p => !q || (p.label + " " + p.description + " " + (p.note || "")).toLowerCase().includes(q.toLowerCase());
  const save = async () => {
    setBusy(true);
    try { const r = await accessApi.saveRolePermissions(sel.id, [...cur]); notify("ok", r.data.message); setSaved(new Set(cur)); loadRoles(); }
    catch (e) { notify("err", errMsg(e)); } finally { setBusy(false); }
  };
  const submitRole = async () => {
    try {
      if (modal.mode === "new") {
        const r = await accessApi.createRole({ name: modal.name, description: modal.description, copy_from_role_id: modal.copy ? Number(modal.copy) : null });
        notify("ok", r.data.message); await loadRoles(); setModal(null);
      } else {
        const r = await accessApi.updateRole(sel.id, { name: modal.name, description: modal.description });
        notify("ok", r.data.message); await loadRoles(); setSel(s => ({ ...s, name: modal.name, description: modal.description })); setModal(null);
      }
    } catch (e) { notify("err", errMsg(e)); }
  };
  const removeRole = async () => {
    if (!window.confirm(`Delete the role "${label(sel.name)}"?`)) return;
    try { const r = await accessApi.deleteRole(sel.id); notify("ok", r.data.message); setSel(null); loadRoles(); } catch (e) { notify("err", errMsg(e)); }
  };
  const names = useMemo(() => Object.fromEntries(catalogue.flatMap(m => m.areas.flatMap(a => a.permissions.map(p => [p.code, p.label])))), [catalogue]);

  return (
    <div className="ac-roles">
      <div className="ac-card ac-rolelist">
        {roles.map(r => (
          <div key={r.id} className={"ac-role" + (sel?.id === r.id ? " on" : "")} onClick={() => pick(r)}>
            <span>{label(r.name)}</span><small>{r.permissions}</small>
          </div>
        ))}
        {can("users_access.role_management") && <button className="ac-btn sm" style={{ marginTop: 8 }} onClick={() => setModal({ mode: "new", name: "", description: "", copy: "" })}>+ New role</button>}
      </div>

      <div>
        {!sel && <div className="ac-card" style={{ padding: 30, textAlign: "center", color: "var(--dm-soft)" }}>Choose a role on the left to see and change what it can do.</div>}
        {sel && (
          <>
            <div className="ac-card" style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{label(sel.name)}</div>
                <div className="ac-sub">{sel.description || "No description"} · {sel.users} user(s)</div>
              </div>
              <input className="ac-input" placeholder="Search permissions..." value={q} onChange={e => setQ(e.target.value)} style={{ width: 220 }} />
              {can("users_access.role_management") && !isSuper && <>
                <button className="ac-btn sm" onClick={() => setModal({ mode: "edit", name: sel.name, description: sel.description || "" })}>Rename</button>
                <button className="ac-btn sm" onClick={() => setModal({ mode: "new", name: sel.name + "_copy", description: sel.description || "", copy: String(sel.id) })}>Copy</button>
                <button className="ac-btn sm danger" onClick={removeRole}>Delete</button>
              </>}
            </div>
            {isSuper && <div className="ac-flash ok" style={{ marginBottom: 12 }}>Tick or untick what superadmin can do. It always keeps Roles &amp; Permissions access, so it can't be locked out.</div>}

            {catalogue.map(m => {
              const visAreas = m.areas.map(a => ({ ...a, permissions: a.permissions.filter(p => !p.is_public && match(p)) })).filter(a => a.permissions.length);
              if (!visAreas.length) return null;
              const codes = visAreas.flatMap(a => a.permissions.map(p => p.code));
              const n = codes.filter(c => cur.has(c)).length;
              const isOpen = open[m.key] ?? !!q;
              return (
                <div key={m.key} className="ac-card ac-mod">
                  <div className="ac-mod-head" onClick={() => setOpen(o => ({ ...o, [m.key]: !isOpen }))}>
                    <Tri checked={n === codes.length} some={n > 0} disabled={!canEdit} onChange={e => toggle(codes, e.target.checked)} />
                    <b>{m.label}</b><span className="ac-count">{n} / {codes.length}</span><span>{isOpen ? "\u25B4" : "\u25BE"}</span>
                  </div>
                  {isOpen && visAreas.map(a => {
                    const ac = a.permissions.map(p => p.code), an = ac.filter(c => cur.has(c)).length;
                    return (
                      <div key={a.label} className="ac-area">
                        <div className="ac-area-head">
                          <Tri checked={an === ac.length} some={an > 0} disabled={!canEdit} onChange={e => toggle(ac, e.target.checked)} />
                          {a.label} <span style={{ fontWeight: 500 }}>· {an}/{ac.length}</span>
                        </div>
                        <div className="ac-perms">
                          {a.permissions.map(p => (
                            <label key={p.code} className={"ac-perm" + (cur.has(p.code) !== saved.has(p.code) ? " changed" : "")}>
                              <input type="checkbox" disabled={!canEdit || (isSuper && SUPER_KEEP.has(p.code))} checked={cur.has(p.code) || (isSuper && SUPER_KEEP.has(p.code))} onChange={e => toggle([p.code], e.target.checked)} />
                              <span><div className="ac-perm-name">{p.label}</div><div className="ac-perm-desc">{p.description}</div>
                                {p.note && <div className="ac-perm-note">{p.note}</div>}
                                {isSuper && SUPER_KEEP.has(p.code) && <div className="ac-perm-note">Always kept for superadmin</div>}
                                {p.includes?.length > 0 && <div className="ac-perm-note">Also opens: {p.includes.join(", ")}</div>}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {dirty && (
              <div className="ac-savebar">
                <div style={{ fontSize: 13 }}>
                  <b>{added.length} to add, {removed.length} to remove</b>
                  <div className="ac-sub">{[...added.map(c => "+ " + names[c]), ...removed.map(c => "\u2212 " + names[c])].slice(0, 6).join(" · ")}{added.length + removed.length > 6 ? " ..." : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ac-btn" disabled={busy} onClick={() => setCur(new Set(saved))}>Discard</button>
                  <button className="ac-btn primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save changes"}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <div className="ac-modal" onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()}>
            <b>{modal.mode === "new" ? "New role" : "Rename role"}</b>
            <label className="ac-field">Role name<input className="ac-input" value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} placeholder="e.g. Vice Principal" /></label>
            <label className="ac-field">Description<input className="ac-input" value={modal.description} onChange={e => setModal(m => ({ ...m, description: e.target.value }))} /></label>
            {modal.mode === "new" && (
              <label className="ac-field">Start with the permissions of
                <select className="ac-input" value={modal.copy} onChange={e => setModal(m => ({ ...m, copy: e.target.value }))}>
                  <option value="">Nothing (empty role)</option>{roles.map(r => <option key={r.id} value={r.id}>{label(r.name)}</option>)}
                </select>
              </label>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ac-btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="ac-btn primary" onClick={submitRole}>{modal.mode === "new" ? "Create role" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== PEOPLE */
function PeopleTab({ catalogue, notify }) {
  const { formatDate } = useRegionalSettings();
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [who, setWho] = useState(null);
  const [d, setD] = useState(null);
  const [roles, setRoles] = useState([]);
  const [act, setAct] = useState({ role_id: "", valid_from: "", valid_until: "", reason: "" });
  const [ext, setExt] = useState({ codes: [], valid_from: "", valid_until: "", reason: "", pick: "" });
  useEffect(() => { accessApi.roles().then(r => setRoles(r.data.data.filter(x => x.name !== "superadmin"))).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) accessApi.findUsers(q).then(r => setFound(r.data.data)).catch(() => {}); else setFound([]); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const load = useCallback(id => accessApi.userAccess(id).then(r => setD(r.data.data)).catch(e => notify("err", errMsg(e))), [notify]);
  useEffect(() => { if (who) load(who); }, [who, load]);
  const run = async (fn, after) => { try { const r = await fn(); notify("ok", r.data.message); after && after(); load(who); } catch (e) { notify("err", errMsg(e)); } };
  const allPerms = useMemo(() => catalogue.flatMap(m => m.areas.flatMap(a => a.permissions.filter(p => !p.is_public).map(p => ({ ...p, module: m.label })))), [catalogue]);
  const period = x => `${x.valid_from ? formatDate(x.valid_from) : "now"} \u2192 ${x.valid_until ? formatDate(x.valid_until) : "until ended"}`;
  const byModule = useMemo(() => {
    const g = {}; (d?.effective || []).forEach(e => { (g[e.module] = g[e.module] || []).push(e); }); return g;
  }, [d]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ac-card ac-sec">
        <h3>Find a person</h3>
        <input className="ac-input" placeholder="Type a name or email..." value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 420 }} />
        {found.length > 0 && (
          <table className="ac-table"><tbody>{found.map(u => (
            <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => { setWho(u.id); setFound([]); setQ(""); }}>
              <td><b>{u.name}</b></td><td>{u.email}</td><td>{(u.roles || "").split(", ").map(label).join(", ")}</td>
            </tr>
          ))}</tbody></table>
        )}
      </div>

      {d && (
        <>
          <div className="ac-card ac-sec">
            <h3>{d.user.name} <span className="ac-sub">· {d.user.email}</span></h3>
            <div>{d.roles.map(r => <span key={r.id} className="ac-chip">{label(r.name)}</span>)}
              {d.acting_roles.map(r => <span key={r.id} className="ac-chip acting">Acting {label(r.role)} · {period(r)}</span>)}</div>
          </div>

          <div className="ac-grid2">
            <div className="ac-card ac-sec">
              <h3>Acting role</h3>
              <div className="ac-sub">Gives everything a role can do, for a period - e.g. a teacher acting as principal.</div>
              {d.acting_roles.length > 0 && (
                <table className="ac-table"><thead><tr><th>Role</th><th>Period</th><th>Reason</th><th></th></tr></thead><tbody>
                  {d.acting_roles.map(r => (
                    <tr key={r.id}><td><b>{label(r.role)}</b></td><td>{period(r)}</td><td>{r.reason}<div className="ac-sub">by {r.granted_by}</div></td>
                      <td><button className="ac-btn sm danger" onClick={() => window.confirm("End this acting role now?") && run(() => accessApi.endActingRole(r.id))}>End</button></td></tr>
                  ))}
                </tbody></table>
              )}
              <div className="ac-row">
                <label className="ac-field">Role
                  <select className="ac-input" value={act.role_id} onChange={e => setAct(a => ({ ...a, role_id: e.target.value }))}>
                    <option value="">Choose...</option>{roles.map(r => <option key={r.id} value={r.id}>{label(r.name)}</option>)}
                  </select>
                </label>
                <label className="ac-field">From<DatePicker value={act.valid_from} onChange={v => setAct(a => ({ ...a, valid_from: v }))} /></label>
                <label className="ac-field">Until<DatePicker value={act.valid_until} min={act.valid_from || undefined} onChange={v => setAct(a => ({ ...a, valid_until: v }))} /></label>
              </div>
              <label className="ac-field">Reason<input className="ac-input" value={act.reason} placeholder="e.g. Principal on leave" onChange={e => setAct(a => ({ ...a, reason: e.target.value }))} /></label>
              <button className="ac-btn primary" style={{ alignSelf: "flex-start" }} disabled={!act.role_id}
                onClick={() => run(() => accessApi.addActingRole(who, { ...act, role_id: Number(act.role_id), valid_from: act.valid_from || null, valid_until: act.valid_until || null }),
                                   () => setAct({ role_id: "", valid_from: "", valid_until: "", reason: "" }))}>Give acting role</button>
            </div>

            <div className="ac-card ac-sec">
              <h3>Extra permissions</h3>
              <div className="ac-sub">Gives only specific tasks, on top of this person's role(s).</div>
              {d.extra_permissions.length > 0 && (
                <table className="ac-table"><thead><tr><th>Permission</th><th>Period</th><th></th></tr></thead><tbody>
                  {d.extra_permissions.map(x => (
                    <tr key={x.id}><td><b>{x.label}</b><div className="ac-sub">{x.module_label} · {x.reason}</div></td><td>{period(x)}</td>
                      <td><button className="ac-btn sm danger" onClick={() => run(() => accessApi.endExtra(x.id))}>Remove</button></td></tr>
                  ))}
                </tbody></table>
              )}
              <label className="ac-field">Add a permission
                <select className="ac-input" value={ext.pick} onChange={e => { const v = e.target.value; if (v && !ext.codes.includes(v)) setExt(x => ({ ...x, codes: [...x.codes, v], pick: "" })); }}>
                  <option value="">Choose...</option>
                  {catalogue.map(m => (
                    <optgroup key={m.key} label={m.label}>
                      {m.areas.flatMap(a => a.permissions).filter(p => !p.is_public).map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              {ext.codes.length > 0 && <div>{ext.codes.map(c => (
                <span key={c} className="ac-chip extra">{allPerms.find(p => p.code === c)?.label}
                  <span style={{ cursor: "pointer", marginLeft: 6 }} onClick={() => setExt(x => ({ ...x, codes: x.codes.filter(y => y !== c) }))}>&times;</span></span>
              ))}</div>}
              <div className="ac-row">
                <label className="ac-field">From<DatePicker value={ext.valid_from} onChange={v => setExt(x => ({ ...x, valid_from: v }))} /></label>
                <label className="ac-field">Until<DatePicker value={ext.valid_until} min={ext.valid_from || undefined} onChange={v => setExt(x => ({ ...x, valid_until: v }))} /></label>
              </div>
              <label className="ac-field">Reason<input className="ac-input" value={ext.reason} placeholder="e.g. Covering leave approvals" onChange={e => setExt(x => ({ ...x, reason: e.target.value }))} /></label>
              <button className="ac-btn primary" style={{ alignSelf: "flex-start" }} disabled={!ext.codes.length}
                onClick={() => run(() => accessApi.addExtra(who, { codes: ext.codes, valid_from: ext.valid_from || null, valid_until: ext.valid_until || null, reason: ext.reason }),
                                   () => setExt({ codes: [], valid_from: "", valid_until: "", reason: "", pick: "" }))}>Give extra permission(s)</button>
            </div>
          </div>

          <div className="ac-card ac-sec">
            <h3>What {d.user.name.split(" ")[0]} can do today <span className="ac-sub">· {d.effective.length} permissions</span></h3>
            {Object.entries(byModule).map(([mod, list]) => (
              <div key={mod}>
                <div className="ac-area-head" style={{ marginTop: 6 }}>{mod}</div>
                <div>{list.map(e => (
                  <span key={e.code} className={"ac-chip" + (e.source.some(s => s.includes("acting")) ? " acting" : e.source.includes("extra permission") ? " extra" : "")}
                    title={"From: " + e.source.join(", ")}>{e.label}</span>
                ))}</div>
              </div>
            ))}
            <div className="ac-sub"><span className="ac-chip">from own role</span><span className="ac-chip acting">from an acting role</span><span className="ac-chip extra">extra permission</span></div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== HISTORY */
const ACTIONS = { role_created: "Role created", role_updated: "Role renamed", role_deleted: "Role deleted", role_permissions_changed: "Role permissions changed",
  acting_role_given: "Acting role given", acting_role_revoked: "Acting role ended", extra_permissions_given: "Extra permissions given",
  extra_permission_revoked: "Extra permission removed", defaults_applied: "Default permissions applied" };
function HistoryTab({ notify }) {
  const { formatDateTime } = useRegionalSettings();
  const [rows, setRows] = useState(null);
  useEffect(() => { accessApi.history().then(r => setRows(r.data.data)).catch(e => notify("err", errMsg(e))); }, [notify]);
  return (
    <div className="ac-card" style={{ overflowX: "auto" }}>
      <table className="ac-table">
        <thead><tr><th>When</th><th>By</th><th>What</th><th>Role / person</th><th>Details</th></tr></thead>
        <tbody>{(rows || []).map(h => (
          <tr key={h.id}><td style={{ whiteSpace: "nowrap" }}>{formatDateTime(h.at)}</td><td>{h.by_name || "System"}</td><td><b>{ACTIONS[h.action] || h.action}</b></td>
            <td>{h.role ? label(h.role) : ""}{h.for_user ? (h.role ? " · " : "") + h.for_user : ""}</td><td>{h.details}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ================================================================== REFUSALS */
function RefusalsTab({ notify }) {
  const { formatDateTime } = useRegionalSettings();
  const [rows, setRows] = useState(null);
  useEffect(() => { accessApi.refusals().then(r => setRows(r.data.data)).catch(e => notify("err", errMsg(e))); }, [notify]);
  return (
    <div className="ac-card" style={{ overflowX: "auto" }}>
      <div className="ac-sub" style={{ padding: "12px 14px 0" }}>Things people tried but weren't allowed to do (last 14 days). If a role should be allowed, tick that permission for the role.</div>
      <table className="ac-table">
        <thead><tr><th>Missing permission</th><th>Role(s)</th><th>People</th><th>Times</th><th>Last</th><th>Page / action</th></tr></thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i}><td><b>{r.label || r.code}</b><div className="ac-sub">{r.code}</div></td>
              <td>{(r.roles || "").split(", ").map(label).join(", ")}</td><td>{r.who}</td><td>{r.times}</td>
              <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.last_at)}</td><td className="ac-sub">{r.method} {r.path}</td></tr>
          ))}
          {rows && !rows.length && <tr><td colSpan={6} className="ac-sub" style={{ textAlign: "center", padding: 24 }}>No refusals - everyone could do what they tried.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== PAGE */
export default function AccessControl() {
  const { can } = useAuth();
  const [tab, setTab] = useState("roles");
  const [catalogue, setCatalogue] = useState([]);
  const [flash, setFlash] = useState(null);
  const notify = useCallback((type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "ok" ? 4500 : 9000); }, []);
  useEffect(() => { accessApi.catalogue().then(r => setCatalogue(r.data.data)).catch(e => notify("err", errMsg(e))); }, [notify]);
  const tabs = [["roles", "Roles & permissions", "users_access.role_management"], ["people", "People: acting roles & extra permissions", "users_access.role_assignment"],
                ["refusals", "Refusals", "users_access.permission_history"], ["history", "History", "users_access.permission_history"]].filter(t => can(t[2]));
  return (
    <div className="ac">
      <div>
        <div className="ac-title">Roles &amp; Permissions</div>
        <div className="ac-sub">What each role can do, and extra access for individual people (e.g. an acting principal).</div>
      </div>
      <div className="ac-tabs">{tabs.map(([k, l]) => <button key={k} className={"ac-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}</div>
      {flash && <div className={"ac-flash " + flash.type}>{flash.msg}</div>}
      {tab === "roles" && <RolesTab catalogue={catalogue} notify={notify} />}
      {tab === "people" && <PeopleTab catalogue={catalogue} notify={notify} />}
      {tab === "refusals" && <RefusalsTab notify={notify} />}
      {tab === "history" && <HistoryTab notify={notify} />}
    </div>
  );
}
