import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import admissionsApi from "../api/admissionsApi";
import AdmissionApplicationForm from "./AdmissionApplicationForm";
import "./Admissions.css";

/** New application (staff entry) or editing an existing one. */
export default function AdmissionApplicationEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [campus, setCampus] = useState("");
  const [yearId, setYearId] = useState("");
  const [opts, setOpts] = useState(null);
  const [initial, setInitial] = useState(id ? null : {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      admissionsApi.get(id).then(r => {
        const a = r.data.data.application;
        if (!a.editable) { setError("This application can't be edited at its current stage."); return; }
        setCampus(a.campus_id); setYearId(a.academic_year_id); setInitial(a);
      }).catch(e => setError(e?.response?.data?.message || "Could not load the application."));
    }
    admissionsApi.years().then(r => {
      const m = r.data.data; setMeta(m);
      if (!id) { setCampus(m.campus_id || (m.campuses[0] && m.campuses[0].id) || ""); setYearId(m.default_year || ""); }
    }).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!campus) return;
    admissionsApi.classOptions({ campus, ...(yearId ? { academic_year_id: yearId } : {}) })
      .then(r => { setOpts(r.data.data); if (!yearId) setYearId(r.data.data.academic_year.id); })
      .catch(e => setError(e?.response?.data?.message || "Could not load classes."));
  }, [campus, yearId]);

  const save = async (form, submit) => {
    setSaving(true); setError("");
    try {
      if (id) {
        await admissionsApi.update(id, { ...form, academic_year_id: Number(yearId) });
        navigate("/admissions/applications/" + id);
      } else {
        const r = await admissionsApi.create({ ...form, campus_id: Number(campus), academic_year_id: Number(yearId) }, submit);
        navigate("/admissions/applications/" + r.data.data.id, { state: { flash: r.data.message } });
      }
    } catch (e) { setError(e?.response?.data?.message || "Could not save."); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="am-page">
      <div className="am-head">
        <div>
          <div className="am-title">{id ? "Edit Application" : "New Admission Application"}</div>
          <div className="am-sub">{id ? initial?.application_no : "Entered by staff for a parent. Documents are uploaded after saving."}</div>
        </div>
        {!id && meta && (
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
                {meta.years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
      {error && <div className="am-flash am-flash--error">{error}</div>}
      {opts && !opts.configured && <div className="am-notice">Admissions aren't set up for {opts.academic_year.name} yet - open Admission Settings first.</div>}
      {opts && initial && opts.configured && (
        <AdmissionApplicationForm key={id || "new"} initial={initial} classes={opts.classes} onSave={save} saving={saving}
          lookupCnic={cnic => admissionsApi.lookupCnic(cnic).then(r => r.data.data)}
          lookupStudent={no => admissionsApi.lookupStudent(no).then(r => r.data.data)}
          allowDraft={!id} submitLabel={id ? "Save Changes" : "Save & Submit"} />
      )}
    </div>
  );
}
