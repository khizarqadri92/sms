import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import MultiSelectDropdown from "./MultiSelectDropdown";
import "./Admissions.css";

const errMsg = e => e?.response?.data?.message || "Something went wrong.";
const NEW = { name: "", member_user_ids: [], location: "", class_names: [], is_active: true };

/** Interview panels for the session - set up by the academic coordinator, picked when an interview is scheduled. */
export default function AdmissionPanels() {
  const { can } = useAuth();
  const canEdit = can("admissions.interview_panel_setup");
  const [meta, setMeta] = useState(null);
  const [campus, setCampus] = useState("");
  const [yearId, setYearId] = useState("");
  const [d, setD] = useState(null);
  const [people, setPeople] = useState({ teachers: [], other: [] });
  const [edit, setEdit] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 5000 : 9000); };

  useEffect(() => {
    admissionsApi.years().then(r => { const m = r.data.data; setMeta(m); setCampus(m.campus_id || (m.campuses[0] && m.campuses[0].id) || ""); setYearId(m.default_year || ""); })
      .catch(e => notify("error", errMsg(e)));
  }, []);
  const load = useCallback(() => {
    if (!campus) return;
    admissionsApi.panels({ campus, ...(yearId ? { academic_year_id: yearId } : {}) }).then(r => setD(r.data.data)).catch(e => notify("error", errMsg(e)));
    admissionsApi.examiners({ campus }).then(r => setPeople(r.data.data)).catch(() => {});
  }, [campus, yearId]);
  useEffect(() => { load(); }, [load]);

  const toggle = (k, v) => setEdit(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));
  const save = async () => {
    setBusy(true);
    const body = { ...edit, campus_id: Number(campus), academic_year_id: Number(yearId) };
    try { const r = edit.id ? await admissionsApi.updatePanel(edit.id, body) : await admissionsApi.createPanel(body);
          notify("success", r.data.message); setEdit(null); load(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async p => {
    if (!window.confirm(`Delete the panel "${p.name}"?`)) return;
    try { const r = await admissionsApi.deletePanel(p.id); notify("success", r.data.message); load(); } catch (e) { notify("error", errMsg(e)); }
  };

  return (
    <div className="am-page">
      <div className="am-head">
        <div><div className="am-title">Interview Panels</div><div className="am-sub">Set up once for the session · chosen when an applicant's interview is scheduled</div></div>
        <div className="am-filters">
          {meta && !meta.campus_id && (
            <label className="am-field">Campus
              <select className="am-input" value={campus} onChange={e => { setCampus(e.target.value); setYearId(""); }}>
                {meta.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="am-field">Session
            <select className="am-input" value={yearId} onChange={e => setYearId(e.target.value)}>
              {(meta?.years || []).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}
      {d && !d.configured && <div className="am-notice">Save the Admission Settings for this session first.</div>}
      {d && d.configured && !d.interview_required && <div className="am-notice">Interviews aren't required this session (Admission Settings).</div>}

      {d && d.configured && (
        <div className="am-sessions">
          {d.panels.map(p => (
            <div key={p.id} className={"am-card am-session" + (p.is_active ? "" : " am-row-off")}>
              <div className="am-assess-head">
                <div className="am-card-title" style={{ margin: 0 }}>{p.name1}</div>
                <span className={"am-status am-status--" + (p.is_active ? "good" : "")}>{p.is_active ? "Active" : "Inactive"}</span>
              </div>
              <div className="am-chips">{p.members.map(m => <span key={m.id} className="am-chip">{m.name}</span>)}</div>
              <div className="am-kv">
                <div><span>Location</span>{p.location || "-"}</div>
                <div><span>Classes</span>{p.class_names.length ? p.class_names.join(", ") : "Any class"}</div>
                <div><span>Interviews</span>{p.interviews}</div>
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="am-btn am-btn--sm" onClick={() => setEdit({ id: p.id, name: p.name, member_user_ids: p.member_user_ids, location: p.location || "", class_names: p.class_names, is_active: p.is_active })}>Edit</button>
                  {!p.interviews && <button className="am-btn am-btn--sm am-btn--bad" onClick={() => remove(p)}>Delete</button>}
                </div>
              )}
            </div>
          ))}
          {canEdit && !edit && <button className="am-card am-session am-session--add" onClick={() => setEdit({ ...NEW })}>+ New interview panel</button>}
          {!d.panels.length && !canEdit && <div className="am-card am-hint">No interview panels yet - the academic coordinator sets them up.</div>}
        </div>
      )}

      {edit && (
        <div className="am-card">
          <div className="am-card-title">{edit.id ? "Edit panel" : "New interview panel"}</div>
          <div className="am-grid">
            <label className="am-field">Panel name<input className="am-input" value={edit.name} onChange={e => setEdit(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Primary panel A" /></label>
            <label className="am-field">Location<input className="am-input" value={edit.location} onChange={e => setEdit(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 4" /></label>
            <label className="am-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={edit.is_active} onChange={e => setEdit(f => ({ ...f, is_active: e.target.checked }))} /> Active</label>
          </div>
          <div className="am-field" style={{ marginTop: 12 }}>Members
            <MultiSelectDropdown placeholder="Select teachers and academic staff" noun="member(s) selected"
              value={edit.member_user_ids} onChange={ids => setEdit(f => ({ ...f, member_user_ids: ids }))}
              groups={[{ label: "Teachers", items: people.teachers },
                       { label: "Other academic staff", items: people.other.map(s => ({ ...s, hint: s.role })) }]} />
          </div>
          <div className="am-field" style={{ marginTop: 12 }}>Interviews these classes <span className="am-hint">(none ticked = any class)</span>
            <div className="am-chips">{(d?.classes || []).map(cl => (
              <label key={cl} className="am-chip"><input type="checkbox" checked={edit.class_names.includes(cl)} onChange={() => toggle("class_names", cl)} /> {cl}</label>
            ))}</div>
          </div>
          <div className="am-hint" style={{ marginTop: 8 }}>Changing members later doesn't affect interviews already scheduled.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="am-btn am-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save panel"}</button>
            <button className="am-btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
