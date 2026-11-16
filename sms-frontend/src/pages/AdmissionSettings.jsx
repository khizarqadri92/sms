import { useState, useEffect, useCallback } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useAuth } from "../auth/AuthContext";
import admissionsApi from "../api/admissionsApi";
import DatePicker from "../components/DatePicker";
import "./Admissions.css";

const errMsg = (e, fb = "Something went wrong.") => e?.response?.data?.message || fb;

/** Preview of the application number format with sample values. */
function previewNo(fmt, campusCode, campusId) {
  return (fmt || "").replace(/\{YYYY\}/g, new Date().getFullYear()).replace(/\{YY\}/g, String(new Date().getFullYear()).slice(2))
    .replace(/\{CAMPUS_ID\}/g, campusId || "1").replace(/\{CAMPUS\}/g, campusCode || "MC").replace(/\{SEQ(\d)\}/g, (_, n) => "1".padStart(Number(n), "0"));
}

export default function AdmissionSettings() {
  const { can } = useAuth();
  const canEdit = can("admission.settings");
  const [meta, setMeta] = useState(null);          // years + campuses
  const [campus, setCampus] = useState("");
  const [yearId, setYearId] = useState("");
  const [d, setD] = useState(null);                // settings payload
  const [form, setForm] = useState(null);
  const [classes, setClasses] = useState([]);
  const [newDoc, setNewDoc] = useState("");
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sched, setSched] = useState(null);
  const [banner, setBanner] = useState(null);          // object URL of the preview
  const [bannerKey, setBannerKey] = useState(0);
  const loadBanner = useCallback(() => {
    if (!campus || !yearId) return;
    admissionsApi.bannerPreview({ campus, academic_year_id: yearId })
      .then(r => setBanner(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(r.data); }))
      .catch(() => setBanner(old => { if (old) URL.revokeObjectURL(old); return null; }));
  }, [campus, yearId]);
  useEffect(() => { loadBanner(); }, [loadBanner]);
  const uploadBanner = async f => {
    if (!f) return;
    if (!/\.(jpe?g|png)$/i.test(f.name)) { notify("error", "Upload the banner as a JPG or PNG image."); return; }
    if (f.size > 3 * 1024 * 1024) { notify("error", "The banner is larger than 3 MB."); return; }
    try { const r = await admissionsApi.uploadBanner(yearId, meta.campus_id ? null : campus, f); notify("success", r.data.message); loadBanner(); }
    catch (e) { notify("error", errMsg(e)); } finally { setBannerKey(k => k + 1); }
  };
  const removeBanner = async () => {
    if (!window.confirm("Remove the admission banner?")) return;
    try { const r = await admissionsApi.removeBanner({ campus, academic_year_id: yearId }); notify("success", r.data.message); loadBanner(); }
    catch (e) { notify("error", errMsg(e)); }
  };
  const loadSched = useCallback(() => {
    if (!campus || !yearId) return;
    admissionsApi.schedule({ campus, academic_year_id: yearId }).then(r => setSched(r.data.data)).catch(() => setSched(null));
  }, [campus, yearId]);
  useEffect(() => { loadSched(); }, [loadSched]);
  const publish = async (on) => {
    if (on && !window.confirm("Publish the admission schedule? Parents will see these dates.")) return;
    try { const r = await admissionsApi.publish({ campus_id: Number(campus), academic_year_id: Number(yearId), publish: on }); notify("success", r.data.message); loadSched(); }
    catch (e) { notify("error", errMsg(e)); }
  };
  const { formatDate } = useRegionalSettings();
  const fmtD = v => v ? formatDate(String(v).slice(0, 10)) : "-";
  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), type === "success" ? 4000 : 8000); };

  useEffect(() => {
    admissionsApi.years().then(r => {
      const m = r.data.data; setMeta(m);
      setCampus(m.campus_id || (m.campuses[0] && m.campuses[0].id) || "");
    }).catch(e => notify("error", errMsg(e)));
  }, []);

  const load = useCallback(async () => {
    if (!campus) return;
    try {
      const r = await admissionsApi.getSettings({ campus, ...(yearId ? { academic_year_id: yearId } : {}) });
      const data = r.data.data; setD(data);
      if (!yearId) setYearId(data.academic_year.id);
      const s = data.settings || {};
      setForm({
        opens_on: s.opens_on || "", closes_on: s.closes_on || "", tests_start_on: s.tests_start_on || "",
        interview_start_on: s.interview_start_on || "", classes_commence_on: s.classes_commence_on || "",
        admission_fee: s.admission_fee ?? 0, fee_due_days: s.fee_due_days ?? 7,
        allow_partial_payment: !!s.allow_partial_payment, test_required: s.test_required ?? true, interview_required: s.interview_required ?? true,
        application_no_format: s.application_no_format || "ADM-{YYYY}-{SEQ5}", notify_staff: s.notify_staff ?? true, is_active: s.is_active ?? true,
        required_documents: s.required_documents || ["B-Form / Birth Certificate", "Student Photograph", "Father CNIC"],
      });
      setClasses(data.classes.map(c => ({ ...c, capacity: c.capacity ?? "", min_age_years: c.min_age_years ?? "", max_age_years: c.max_age_years ?? "" })));
    } catch (e) { notify("error", errMsg(e)); setD(null); }
  }, [campus, yearId]);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setC = (i, k, v) => setClasses(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c));
  const addDoc = () => {
    const v = newDoc.trim(); if (!v) return;
    if (form.required_documents.some(x => x.toLowerCase() === v.toLowerCase())) { notify("error", "That document is already listed."); return; }
    setF("required_documents", [...form.required_documents, v]); setNewDoc("");
  };
  const num = v => v === "" || v === null ? null : Number(v);

  const save = async () => {
    setSaving(true);
    try {
      await admissionsApi.saveSettings({
        ...form, campus_id: Number(campus), academic_year_id: Number(yearId),
        opens_on: form.opens_on || null, closes_on: form.closes_on || null,
        tests_start_on: form.tests_start_on || null,
        interview_start_on: form.interview_start_on || null, classes_commence_on: form.classes_commence_on || null,
        admission_fee: Number(form.admission_fee || 0), fee_due_days: Number(form.fee_due_days || 0),
        classes: classes.map(c => ({ class_name: c.class_name, is_open: c.is_open, capacity: num(c.capacity),
                                     min_age_years: num(c.min_age_years), max_age_years: num(c.max_age_years) })),
      });
      notify("success", "Admission settings saved.");
      load(); loadSched();
    } catch (e) { notify("error", errMsg(e)); }
    finally { setSaving(false); }
  };

  if (!meta) return <div className="am-page"><div className="am-card am-muted">Loading...</div></div>;
  const campusObj = meta.campuses.find(c => String(c.id) === String(campus));

  return (
    <div className="am-page">
      <div className="am-head">
        <div>
          <div className="am-title">Admission Settings</div>
          <div className="am-sub">Dates, classes, seats, age limits, documents and fee for each session and campus</div>
        </div>
        <div className="am-filters">
          {!meta.campus_id && (
            <label className="am-field">Campus
              <select className="am-input" value={campus} onChange={e => { setCampus(e.target.value); setYearId(""); }}>
                {meta.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="am-field">Session
            <select className="am-input" value={yearId} onChange={e => setYearId(e.target.value)}>
              {meta.years.map(y => <option key={y.id} value={y.id}>{y.name}{y.active ? " (current)" : ""}</option>)}
            </select>
          </label>
        </div>
      </div>

      {flash && <div className={"am-flash am-flash--" + flash.type}>{flash.msg}</div>}
      {d && !d.configured && <div className="am-notice">Admissions are not set up for {d.academic_year.name} yet. Fill in the settings below and save to open them.</div>}

      {form && (
        <>
          <div className="am-card">
            <div className="am-card-title">Admission window &amp; fee</div>
            <div className="am-grid">
              <div className="am-field">Opens on
                <DatePicker value={form.opens_on} disabled={!canEdit} placeholder="Choose the opening date"
                  max={form.closes_on || undefined}
                  onChange={v => setForm(f => ({ ...f, opens_on: v, closes_on: f.closes_on && v && f.closes_on < v ? "" : f.closes_on }))} />
              </div>
              <div className="am-field">Closes on
                <DatePicker value={form.closes_on} disabled={!canEdit} placeholder="Choose the closing date"
                  min={form.opens_on || undefined}
                  onChange={v => setF("closes_on", v)} />
              </div>
              <label className="am-field">Admission fee (Rs.)<input type="number" min="0" className="am-input" value={form.admission_fee} disabled={!canEdit} onChange={e => setF("admission_fee", e.target.value)} /></label>
              <label className="am-field">Fee due within (days)<input type="number" min="0" max="120" className="am-input" value={form.fee_due_days} disabled={!canEdit} onChange={e => setF("fee_due_days", e.target.value)} /></label>
            </div>
            <div className="am-grid" style={{ marginTop: 12 }}>
              <label className="am-check"><input type="checkbox" checked={form.is_active} disabled={!canEdit} onChange={e => setF("is_active", e.target.checked)} /> Admissions open for this session</label>
              <label className="am-check"><input type="checkbox" checked={form.test_required} disabled={!canEdit} onChange={e => setF("test_required", e.target.checked)} /> Admission test required</label>
              <label className="am-check"><input type="checkbox" checked={form.interview_required} disabled={!canEdit} onChange={e => setF("interview_required", e.target.checked)} /> Interview required</label>
              <label className="am-check"><input type="checkbox" checked={form.allow_partial_payment} disabled={!canEdit} onChange={e => setF("allow_partial_payment", e.target.checked)} /> Allow partial fee payment</label>
              <label className="am-check"><input type="checkbox" checked={form.notify_staff} disabled={!canEdit} onChange={e => setF("notify_staff", e.target.checked)} /> Notify admission staff of new applications</label>
            </div>
          </div>

          <div className="am-card">
            <div className="am-card-title">Admission schedule
              {sched?.published ? <span className="am-status am-status--good">Published {fmtD((sched.published_at || "").slice(0, 10))}</span>
                                : <span className="am-status">Not published</span>}
            </div>
            <div className="am-grid">
              <div className="am-field">Admission tests start from
                <DatePicker value={form.tests_start_on} disabled={!canEdit || !form.test_required} placeholder={form.test_required ? "Choose a date" : "No admission test"}
                  min={form.opens_on || undefined} max={form.classes_commence_on || undefined} onChange={v => setF("tests_start_on", v)} />
              </div>
              <div className="am-field">Interview start from
                <DatePicker value={form.interview_start_on} disabled={!canEdit || !form.interview_required} placeholder={form.interview_required ? "Choose a date" : "No interview"}
                  min={form.opens_on || undefined} max={form.classes_commence_on || undefined} onChange={v => setF("interview_start_on", v)} />
              </div>
              <div className="am-field">Commencement of classes
                <DatePicker value={form.classes_commence_on} disabled={!canEdit} placeholder="Choose a date"
                  min={form.closes_on || form.opens_on || undefined} onChange={v => setF("classes_commence_on", v)} />
              </div>
            </div>
            <div className="am-hint" style={{ marginTop: 8 }}>Application start and end are set above. Each class's exact test date is set later in <b>Admission Tests</b>, once applications are in - on or after this start date.</div>
            {sched?.configured && (
              <div className="am-sched">
                <table className="am-table am-table--compact">
                  <tbody>
                    <tr><td>Applications open</td><td><b>{fmtD(sched.application_start)}</b></td></tr>
                    <tr><td>Applications close</td><td><b>{fmtD(sched.application_end)}</b></td></tr>
                    {sched.test_required && <tr><td>Admission tests start from</td><td><b>{fmtD(sched.tests_start)}</b></td></tr>}
                    {sched.test_required && sched.tests.map(t => (
                      <tr key={t.class_name}><td className="am-sched-sub">{t.class_name} test</td><td>{fmtD(t.test_date)}, {t.start_time}{t.venue ? " · " + t.venue : ""}</td></tr>
                    ))}
                    {sched.interview_required && <tr><td>Interviews start from</td><td><b>{fmtD(sched.interview_start)}</b></td></tr>}
                    <tr><td>Classes commence</td><td><b>{fmtD(sched.classes_commence)}</b></td></tr>
                  </tbody>
                </table>
                {sched.missing.length > 0 && <div className="am-notice">Still needed before publishing: {sched.missing.join(", ")}.</div>}
                {canEdit && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="am-btn am-btn--primary" disabled={sched.missing.length > 0} onClick={() => publish(true)}>{sched.published ? "Publish again (updated)" : "Publish schedule"}</button>
                    {sched.published && <button className="am-btn" onClick={() => publish(false)}>Unpublish</button>}
                  </div>
                )}
                <div className="am-hint">Save any date changes first - the preview shows the saved schedule.</div>
              </div>
            )}
          </div>

          <div className="am-card">
            <div className="am-card-title">Admission banner <span className="am-muted">· shown as a popup on everyone's dashboard while the schedule is published, until applications close</span></div>
            {!d?.configured ? <div className="am-hint">Save the settings first, then upload the banner.</div> : (
              <>
                {banner ? <img src={banner} alt="Admission banner" className="am-banner-preview" />
                        : <div className="am-hint" style={{ marginBottom: 10 }}>No banner yet. A wide image works best (for example 1200 x 630 pixels).</div>}
                {canEdit && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                    <label className="am-btn am-btn--sm" style={{ cursor: "pointer" }}>{banner ? "Replace banner" : "Upload banner"}
                      <input key={bannerKey} type="file" accept=".jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => uploadBanner(e.target.files?.[0])} />
                    </label>
                    {banner && <button className="am-btn am-btn--sm am-btn--bad" onClick={removeBanner}>Remove</button>}
                    <span className="am-hint">JPG or PNG, up to 3 MB. A new banner is shown again to everyone, even those who chose "Don't show again".</span>
                  </div>
                )}
                {!sched?.published && banner && <div className="am-notice" style={{ marginTop: 10 }}>The popup starts once the schedule is published.</div>}
              </>
            )}
          </div>

          <div className="am-card">
            <div className="am-card-title">Application number</div>
            <div className="am-grid">
              <label className="am-field">Format
                <input className="am-input" value={form.application_no_format} disabled={!canEdit} onChange={e => setF("application_no_format", e.target.value)} />
                <span className="am-hint">Tokens: {"{YYYY}"} year, {"{YY}"} short year, {"{CAMPUS}"} campus code, {"{CAMPUS_ID}"} campus number, {"{SEQ5}"} running number (digits 3-9)</span>
              </label>
              <div className="am-field">Example<span className="am-preview">{previewNo(form.application_no_format, campusObj && campusObj.code, campusObj && campusObj.id)}</span></div>
            </div>
          </div>

          <div className="am-card">
            <div className="am-card-title">Required documents <span className="am-muted">· applicants must upload each of these</span></div>
            <div className="am-chips">
              {form.required_documents.map(doc => (
                <span key={doc} className="am-chip">{doc}
                  {canEdit && <button title="Remove" onClick={() => setF("required_documents", form.required_documents.filter(x => x !== doc))}>&times;</button>}
                </span>
              ))}
              {!form.required_documents.length && <span className="am-muted">No documents required.</span>}
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input className="am-input" placeholder="e.g. Previous school leaving certificate" value={newDoc}
                  onChange={e => setNewDoc(e.target.value)} onKeyDown={e => e.key === "Enter" && addDoc()} style={{ flex: 1 }} />
                <button className="am-btn" onClick={addDoc}>Add</button>
              </div>
            )}
          </div>

          <div className="am-card">
            <div className="am-card-title">Classes <span className="am-muted">· seats for new admissions and age on the session start date</span></div>
            <div className="am-table-wrap">
              <table className="am-table">
                <thead><tr><th>Class</th><th>Open</th><th>New-admission seats</th><th>Admitted</th><th>Min age</th><th>Max age</th></tr></thead>
                <tbody>
                  {classes.map((c, i) => {
                    const full = c.capacity !== "" && c.admitted >= Number(c.capacity);
                    return (
                      <tr key={c.class_name} className={c.is_open ? "" : "am-row-off"}>
                        <td><b>{c.class_name}</b><div className="am-seats">{c.sections} section{c.sections > 1 ? "s" : ""} · <b>{c.total_seats}</b> seats in total</div></td>
                        <td><input type="checkbox" checked={c.is_open} disabled={!canEdit} onChange={e => setC(i, "is_open", e.target.checked)} /></td>
                        <td><input type="number" min="0" className="am-input am-input--sm" placeholder="No limit" value={c.capacity} disabled={!canEdit} onChange={e => setC(i, "capacity", e.target.value)} /></td>
                        <td className={full ? "am-full" : ""}>{c.admitted}{c.capacity !== "" ? " / " + c.capacity : ""}{full ? " · full" : ""}</td>
                        <td><input type="number" min="0" step="0.5" className="am-input am-input--sm" placeholder="-" value={c.min_age_years} disabled={!canEdit} onChange={e => setC(i, "min_age_years", e.target.value)} /></td>
                        <td><input type="number" min="0" step="0.5" className="am-input am-input--sm" placeholder="-" value={c.max_age_years} disabled={!canEdit} onChange={e => setC(i, "max_age_years", e.target.value)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {canEdit && (
            <div className="am-save-bar">
              <button className="am-btn am-btn--primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Settings"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
