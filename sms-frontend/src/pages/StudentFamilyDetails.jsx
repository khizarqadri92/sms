import { useState, useEffect, Fragment } from "react";
import client from "../api/client";
import { RELATIONSHIPS, DISABILITY_TYPES, LIVING_WITH, RELIGIONS, formatCnic } from "./AdmissionApplicationForm";

const NATIONALITIES = ["Pakistani", "Afghan", "American", "Bangladeshi", "British", "Canadian", "Chinese", "Indian", "Iranian", "Saudi", "Emirati"];

// the student profile's own building blocks (defined once - not inside the component)
const Card = ({ title, children }) => (
  <div className="section-card" style={{ marginTop: 16 }}>
    <div className="section-card-header"><span className="section-card-title">{title}</span></div>
    {children}
  </div>
);
const Group = ({ label, children, full }) => (
  <div className="form-group" style={full ? { gridColumn: "1 / -1" } : undefined}>
    <label className="form-label">{label}</label>{children}
  </div>
);

/** Student profile -> Edit Info: family & other details, in the profile's own style. */
export default function StudentFamilyDetails({ studentId, canEdit, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEffect(() => {
    client.get(`/students/${studentId}/details`).then(r => {
      const d = r.data.data, clean = {};
      for (const [k, v] of Object.entries(d)) clean[k] = Array.isArray(v) || typeof v === "boolean" ? v : (v == null ? "" : String(v));
      for (const k of ["b_form_no", "father_cnic", "mother_cnic", "guardian_cnic"]) clean[k] = clean[k] ? formatCnic(clean[k]) : "";
      clean.primary_guardian = clean.primary_guardian || "father"; clean.transport_mode = clean.transport_mode || "self";
      setF(clean);
    }).catch(e => setError(e?.response?.data?.message || "Could not load the family details."));
  }, [studentId]);

  // a full CNIC typed: fill that person's EMPTY fields from earlier records
  const cnicTyped = async (who, value) => {
    if (value.replace(/\D/g, "").length !== 13) return;
    try {
      const d = (await client.get("/admissions/lookup/cnic", { params: { cnic: value.replace(/\D/g, "") } })).data.data;
      if (!d) return;
      setF(x => { const y = { ...x };
        for (const [k, v] of [["name", d.name], ["phone", d.phone], ["occupation", d.occupation], ["email", d.email]])
          if (v && !String(y[`${who}_${k}`] || "").trim()) y[`${who}_${k}`] = v;
        return y; });
      setSuccess(`Details for this CNIC were found and filled in for the ${who} - please check them.`); setTimeout(() => setSuccess(""), 6000);
    } catch { /* no record, or no admissions access */ }
  };
  const save = async () => {
    setBusy(true); setError(""); setSuccess("");
    try { const r = await client.put(`/students/${studentId}/details`, f); setSuccess(r.data.message); onSaved && onSaved(); }
    catch (e) { setError(e?.response?.data?.message || "Could not save."); }
    finally { setBusy(false); }
  };
  if (!f) return error ? <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div> : null;

  const ro = !canEdit;
  const inp = (k, props = {}) => <input className="form-control" value={f[k] || ""} disabled={ro} onChange={e => set(k, e.target.value)} {...props} />;
  const cnicInp = (k, who) => <input className="form-control" value={f[k] || ""} disabled={ro} inputMode="numeric" maxLength={15} placeholder="e.g. 35202-1234567-1"
    onChange={e => { const v = formatCnic(e.target.value); set(k, v); if (who) cnicTyped(who, v); }} />;
  const pg = f.primary_guardian;
  const radio = (k, v, label) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 18, cursor: ro ? "default" : "pointer" }}>
      <input type="radio" disabled={ro} checked={f[k] === v} onChange={() => set(k, v)} /> {label}
    </label>
  );

  return (
    <Fragment>
      <Card title="Background">
        <div className="form-grid">
          <Group label="B-Form / Birth Certificate No.">{cnicInp("b_form_no")}</Group>
          <Group label="Religion">
            <input className="form-control" list="sfd-religions" value={f.religion} disabled={ro} onChange={e => set("religion", e.target.value)} />
            <datalist id="sfd-religions">{RELIGIONS.map(r => <option key={r} value={r} />)}</datalist>
          </Group>
          <Group label="Sect">{inp("sect")}</Group>
          <Group label="Nationality">
            <input className="form-control" list="sfd-nat" value={f.nationality} disabled={ro} onChange={e => set("nationality", e.target.value)} />
            <datalist id="sfd-nat">{NATIONALITIES.map(n => <option key={n} value={n} />)}</datalist>
          </Group>
          <Group label="Previous School">{inp("previous_school")}</Group>
          <Group label="Previous Class">{inp("previous_class")}</Group>
        </div>
      </Card>

      {[["father", "Father"], ["mother", "Mother"]].map(([who, title]) => (
        <Card key={who} title={title + (pg === who ? " (Primary Guardian)" : "")}>
          <div className="form-grid">
            <Group label={title + " Name"}>{inp(`${who}_name`)}</Group>
            <Group label={title + " CNIC"}>{cnicInp(`${who}_cnic`, who)}</Group>
            <Group label="Occupation">{inp(`${who}_occupation`)}</Group>
            <Group label="Mobile Number">{inp(`${who}_phone`, { placeholder: "e.g. 0300 1234567", inputMode: "tel" })}</Group>
            <Group label="Email">{inp(`${who}_email`, { type: "email" })}</Group>
          </div>
        </Card>
      ))}

      <Card title="Guardian">
        <div className="form-grid">
          <Group label="Primary Guardian">
            <select className="form-control" value={pg} disabled={ro} onChange={e => setF(x => ({ ...x, primary_guardian: e.target.value,
              living_with: e.target.value !== "other" && x.living_with === "guardian" ? "" : x.living_with }))}>
              <option value="father">Father</option><option value="mother">Mother</option><option value="other">Other</option>
            </select>
          </Group>
          <Group label="Student Lives With">
            <select className="form-control" value={f.living_with} disabled={ro} onChange={e => set("living_with", e.target.value)}>
              <option value="">Select</option>
              {LIVING_WITH.filter(([v]) => v !== "guardian" || pg === "other").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Group>
          {pg === "other" && <>
            <Group label="Guardian Name *">{inp("guardian_name")}</Group>
            <Group label="Relationship *">
              <select className="form-control" value={f.guardian_relationship} disabled={ro} onChange={e => set("guardian_relationship", e.target.value)}>
                <option value="">Select relationship</option>{RELATIONSHIPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Group>
            {f.guardian_relationship === "other" && <Group label="Describe the Relationship *">{inp("guardian_relationship_other")}</Group>}
            <Group label="Guardian CNIC">{cnicInp("guardian_cnic", "guardian")}</Group>
            <Group label="Occupation">{inp("guardian_occupation")}</Group>
            <Group label="Mobile Number *">{inp("guardian_phone", { placeholder: "e.g. 0300 1234567", inputMode: "tel" })}</Group>
            <Group label="Email">{inp("guardian_email", { type: "email" })}</Group>
          </>}
        </div>
      </Card>

      <Card title="Disability / Special Needs">
        <div className="form-grid">
          <Group label="Does the student have a disability or special need?" full>
            <div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 18 }}>
                <input type="radio" disabled={ro} checked={!f.has_disability} onChange={() => set("has_disability", false)} /> No</label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input type="radio" disabled={ro} checked={!!f.has_disability} onChange={() => set("has_disability", true)} /> Yes</label>
            </div>
          </Group>
          {f.has_disability && <>
            <Group label="Type" full>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                {DISABILITY_TYPES.map(([v, l]) => (
                  <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" disabled={ro} checked={(f.disability_types || []).includes(v)}
                      onChange={e => set("disability_types", e.target.checked ? [...(f.disability_types || []), v] : f.disability_types.filter(x => x !== v))} /> {l}
                  </label>
                ))}
              </div>
            </Group>
            <Group label="Details and Support Needed" full>
              <textarea className="form-control" rows={2} disabled={ro} value={f.disability_details || ""} onChange={e => set("disability_details", e.target.value)} />
            </Group>
          </>}
        </div>
      </Card>

      <Card title="Transport">
        <div className="form-grid">
          <Group label="How does the student come to school?" full>
            <div>{radio("transport_mode", "self", "Self (pick and drop)")}{radio("transport_mode", "school_van", "School van")}</div>
          </Group>
          {f.transport_mode === "school_van" && <Group label="Pick-up Address / Area *" full>
            <textarea className="form-control" rows={2} disabled={ro} value={f.pickup_address || ""} onChange={e => set("pickup_address", e.target.value)} />
          </Group>}
        </div>
      </Card>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginTop: 16 }}>{success}</div>}
      {canEdit && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save Family Details"}</button>
        </div>
      )}
    </Fragment>
  );
}
