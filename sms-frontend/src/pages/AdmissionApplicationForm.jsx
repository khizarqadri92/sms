import { useState, useEffect, useRef } from "react";
import DatePicker from "../components/DatePicker";
import "./Admissions.css";

/**
 * The admission application form - shared by staff entry and (Phase 5) the public portal.
 * The backend validates everything again; this gives instant feedback.
 */
export const RELATIONSHIPS = [["grandfather","Grandfather"],["grandmother","Grandmother"],["paternal_uncle","Paternal Uncle"],
  ["maternal_uncle","Maternal Uncle"],["paternal_aunt","Paternal Aunt"],["maternal_aunt","Maternal Aunt"],["brother","Brother"],["sister","Sister"],["other","Other"]];
const NOTIFY = [["primary","Primary guardian"],["father","Father"],["mother","Mother"],["guardian","Other guardian"],["both_parents","Both parents"],["all","All contacts"]];
export const EMPTY_APPLICATION = {
  class_name: "", student_first_name: "", student_last_name: "", date_of_birth: "", gender: "", b_form_no: "", previous_school: "",
  previous_class: "", address: "", father_name: "", father_cnic: "", father_occupation: "", father_phone: "", father_email: "",
  mother_name: "", mother_cnic: "", mother_occupation: "", mother_phone: "", mother_email: "", primary_guardian: "father",
  guardian_name: "", guardian_cnic: "", guardian_occupation: "", guardian_phone: "", guardian_email: "", guardian_relationship: "",
  guardian_relationship_other: "", notify_contact: "primary",
  has_disability: false, disability_types: [], disability_details: "", transport_mode: "self", pickup_address: "",
  religion: "", sect: "", nationality: "Pakistani", leaving_reason: "", living_with: "",
};
export const RELIGIONS = ["Islam", "Christianity", "Hinduism", "Sikhism"];
const SECTS = { Islam: ["Sunni", "Shia", "Ahl-e-Hadith"], Christianity: ["Catholic", "Protestant"] };
const NATIONALITIES = ["Pakistani", "Afghan", "American", "Bangladeshi", "British", "Canadian", "Chinese", "Indian", "Iranian", "Saudi", "Emirati", "Other"];
export const LIVING_WITH = [["both", "Both parents"], ["father", "Father"], ["mother", "Mother"], ["guardian", "Guardian"]];
export const DISABILITY_TYPES = [["physical","Physical"],["visual","Visual"],["hearing","Hearing"],["speech","Speech"],["learning","Learning"],
  ["intellectual","Intellectual"],["autism","Autism spectrum"],["other","Other"]];
const mobileOk = v => /^03\d{9}$/.test((v || "").replace(/\D/g, "").replace(/^0092/, "0").replace(/^92/, "0").replace(/^3/, "03"));
const digits = v => (v || "").replace(/\D/g, "");
const cnicOk = v => !digits(v) || digits(v).length === 13;
/** 13 digits shown as 35303-2054815-3; any typed or pasted separators are cleaned. */
export const formatCnic = v => {
  const d = digits(v).slice(0, 13);
  return d.slice(0, 5) + (d.length > 5 ? "-" + d.slice(5, 12) : "") + (d.length > 12 ? "-" + d.slice(12) : "");
};
const CNIC_FIELDS = ["b_form_no", "father_cnic", "mother_cnic", "guardian_cnic"];

/** Section header: lettered badge, title and a one-line explanation (anchor for the Review step's Edit buttons). */
export function SectionHead({ letter, title, sub, extra }) {
  return (
    <div className="am-sec-head">
      <span className="am-sec-badge">{letter}</span>
      <div style={{ minWidth: 0 }}>
        <div className="am-sec-title">{title} {extra}</div>
        {sub && <div className="am-sec-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Field({ label, required, children, hint }) {
  return <label className="am-field"><span>{label}{required && <span className="am-req"> *</span>}</span>{children}{hint && <span className="am-hint">{hint}</span>}</label>;
}

export default function AdmissionApplicationForm({ initial, classes = [], onSave, saving, allowDraft = true, submitLabel = "Submit Application",
                                                  lookupCnic, lookupCnicPublic, lookupStudent, focusSection }) {
  // saved applications have null for empty fields - the form works with ""
  const [f, setF] = useState(() => {
    const start = { ...EMPTY_APPLICATION };
    for (const k of Object.keys(EMPTY_APPLICATION)) {
      if (!initial || initial[k] == null) continue;
      const empty = EMPTY_APPLICATION[k];
      start[k] = Array.isArray(empty) ? [...initial[k]] : typeof empty === "boolean" ? !!initial[k] : String(initial[k]);
    }
    for (const k of CNIC_FIELDS) start[k] = formatCnic(start[k]);
    return start;
  });
  const [problem, setProblem] = useState("");
  const [found, setFound] = useState("");                       // "details filled in" note
  useEffect(() => {
    if (!focusSection) return;
    const t = setTimeout(() => document.getElementById("sec-" + focusSection)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [focusSection]);
  const [relOther, setRelOther] = useState(() => !!(initial && initial.religion && !RELIGIONS.includes(initial.religion)));
  const [sectOther, setSectOther] = useState(() => {
    const r = initial && initial.religion, s = initial && initial.sect;
    return !!(s && SECTS[r] && !SECTS[r].includes(s));
  });
  const [sibs, setSibs] = useState(() => (initial && initial.siblings) ? initial.siblings
    : ((initial && initial.sibling_enrollment_nos) || []).map(n => ({ enrollment_no: n })));
  const [sibNo, setSibNo] = useState("");
  const [sibBusy, setSibBusy] = useState(false);
  const [sibMsg, setSibMsg] = useState("");
  // a full CNIC typed: fill that person's EMPTY fields from earlier records (never overwrite what's typed)
  const tried = useRef(new Set());                         // each CNIC (+ mobile) is looked up once
  const cnicTyped = async (who, value, phone) => {
    const digits = (value || "").replace(/\D/g, "");
    if (digits.length !== 13) return;
    const usePublic = !lookupCnic && lookupCnicPublic;
    if (!lookupCnic && !usePublic) return;
    const key = who + ":" + digits;
    if (tried.current.has(key)) return;
    tried.current.add(key);
    try {
      const d = usePublic ? await lookupCnicPublic(digits) : await lookupCnic(digits);
      if (!d) return;
      let filled = 0;
      setF(x => {
        const y = { ...x };
        for (const [field, val] of [["name", d.name], ["phone", d.phone], ["occupation", d.occupation], ["email", d.email]]) {
          const k = who + "_" + field;
          if (val && !String(y[k] || "").trim()) { y[k] = val; filled++; }
        }
        return y;
      });
      if (!d) return;
      setFound(`Details for this CNIC were found and filled in for the ${who === "guardian" ? "guardian" : who} - please check them.`);
      setTimeout(() => setFound(""), 8000);
    } catch { /* no record */ }
  };
  useEffect(() => {
    const no = sibNo.trim();
    if (no.length < 5 || !lookupStudent) return;
    const t = setTimeout(() => addSibling(true), 700);        // fetch automatically once typing pauses
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sibNo]);
  useEffect(() => { cnicTyped("father", f.father_cnic); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.father_cnic]);
  useEffect(() => { cnicTyped("mother", f.mother_cnic); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.mother_cnic]);
  useEffect(() => { cnicTyped("guardian", f.guardian_cnic); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.guardian_cnic]);
  const sibBusyRef = useRef(new Set());                     // registration numbers being looked up right now
  const addSibling = async (auto = false) => {
    const no = sibNo.trim();
    if (!no) return;
    if (auto && sibs.some(s => s.enrollment_no.toLowerCase() === no.toLowerCase())) return;
    const keyNo = no.toLowerCase();
    if (sibs.some(s => s.enrollment_no.toLowerCase() === keyNo)) { if (!auto) setSibMsg("Already added."); setSibNo(""); return; }
    if (sibBusyRef.current.has(keyNo)) return;              // the same number is already being looked up
    sibBusyRef.current.add(keyNo);
    if (!lookupStudent) { setSibs(s => [...s, { enrollment_no: no }]); setSibNo(""); return; }
    setSibBusy(true); setSibMsg("");
    try {
      const s = await lookupStudent(no, f.father_cnic || f.mother_cnic || f.guardian_cnic);
      setSibs(x => x.some(y => y.enrollment_no.toLowerCase() === String(s.enrollment_no).toLowerCase()) ? x : [...x, s]);
      setSibNo("");
    } catch (e) { setSibMsg(auto ? "" : (e?.response?.data?.message || "No match for that registration number."));
                  if (auto) setSibMsg(e?.response?.data?.message || "No match yet - check the registration number."); }
    finally { setSibBusy(false); sibBusyRef.current.delete(keyNo); }
  };
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  // contact details are masked by the server for people without "Application contact details": read-only, not re-checked
  const contactLocked = !!(initial && initial.contact_masked);
  const LOCKED = ["father_cnic", "father_phone", "father_email", "mother_cnic", "mother_phone", "mother_email", "guardian_cnic",
                  "guardian_phone", "guardian_email", "b_form_no", "address", "pickup_address"];
  const inp = (k, props = {}) => (contactLocked && LOCKED.includes(k))
    ? <input className="am-input" value={f[k] || ""} disabled title="Hidden - you don't have permission to see contact details" />
    : CNIC_FIELDS.includes(k)
    ? <input className="am-input" value={f[k] || ""} inputMode="numeric" maxLength={15} placeholder="35303-2054815-3"
        onChange={e => set(k, formatCnic(e.target.value))}
        onBlur={e => { if (k !== "b_form_no") cnicTyped(k.split("_")[0], e.target.value); }} {...props} />
    : <input className="am-input" value={f[k] || ""} onChange={e => set(k, e.target.value)} {...props} />;
  const pg = f.primary_guardian;
  const cls = classes.find(c => c.class_name === f.class_name);

  const check = () => {
    if (!f.student_first_name.trim() || !f.student_last_name.trim()) return "Enter the student's first and last name.";
    if (!f.date_of_birth) return "Enter the date of birth.";
    if (!f.gender) return "Choose the student's gender.";
    if (!f.class_name) return "Choose the class.";
    if (pg !== "other") {
      if (!f[pg + "_name"].trim()) return `Enter the ${pg}'s name - the ${pg} is the primary guardian.`;
      if (!contactLocked && !mobileOk(f[pg + "_phone"])) return `Enter the ${pg}'s mobile number like 0300 1234567 - it becomes the parent login.`;
    } else {
      if (!f.guardian_name.trim()) return "Enter the guardian's name.";
      if (!contactLocked && !mobileOk(f.guardian_phone)) return "Enter the guardian's mobile number like 0300 1234567 - it becomes the parent login.";
      if (!f.guardian_relationship) return "Choose the guardian's relationship with the student.";
      if (f.guardian_relationship === "other" && !f.guardian_relationship_other.trim()) return "Describe the guardian's relationship.";
    }
    const cnicNames = { b_form_no: "The B-Form / birth certificate number", father_cnic: "The father's CNIC",
                        mother_cnic: "The mother's CNIC", guardian_cnic: "The guardian's CNIC" };
    for (const k of CNIC_FIELDS) if (!contactLocked && (k !== "guardian_cnic" || pg === "other") && !cnicOk(f[k]))
      return `${cnicNames[k]} should have 13 digits (it has ${digits(f[k]).length}).`;
    if (f.notify_contact === "guardian" && pg !== "other") return "'Other guardian' is only available when the primary guardian is Other.";
    if (!f.religion.trim()) return "Choose the student's religion.";
    if (!f.nationality.trim()) return "Enter the student's nationality.";
    if (!contactLocked && !f.address.trim()) return "Enter the residential address.";
    if (f.previous_school.trim() && !f.leaving_reason.trim()) return "Give the reason for leaving the previous school.";
    if (!f.living_with) return "Choose who the student lives with.";
    if (f.has_disability && !f.disability_types.length && !f.disability_details.trim()) return "Tell us about the child's disability or special need.";
    if (f.transport_mode === "school_van" && !f.pickup_address.trim()) return "Enter the pick-up address or area for the school van.";
    return "";
  };
  const save = submit => {
    const p = check(); setProblem(p);
    if (p) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    onSave({ ...f, sibling_enrollment_nos: sibs.map(s => s.enrollment_no), siblings: sibs }, submit);   // siblings: names for the Review step
  };

  return (
    <div className="am-form">
      {problem && <div className="am-flash am-flash--error">{problem}</div>}
      {found && <div className="am-flash am-flash--success">{found}</div>}

      <div className="am-card am-sec" id="sec-A">
        <SectionHead letter="A" title="Student" sub="The child's personal details and previous schooling" />
        <div className="am-grid">
          <Field label="First name" required>{inp("student_first_name")}</Field>
          <Field label="Last name" required>{inp("student_last_name")}</Field>
          <div className="am-field"><span>Date of birth<span className="am-req"> *</span></span>
            <DatePicker value={f.date_of_birth} onChange={v => set("date_of_birth", v)} placeholder="Choose the date of birth" />
          </div>
          <Field label="Gender" required>
            <select className="am-input" value={f.gender} onChange={e => set("gender", e.target.value)}>
              <option value="">Choose...</option><option value="male">Male</option><option value="female">Female</option>
            </select>
          </Field>
          <Field label="B-Form / birth certificate no." hint="13 digits">{inp("b_form_no")}</Field>
          <Field label="Applying for class" required hint={cls ? [cls.seats_left != null ? cls.seats_left + " seats left" : "", cls.min_age_years != null ? "age " + cls.min_age_years + (cls.max_age_years != null ? "-" + cls.max_age_years : "+") : ""].filter(Boolean).join(" · ") : ""}>
            <select className="am-input" value={f.class_name} onChange={e => set("class_name", e.target.value)}>
              <option value="">Choose...</option>
              {classes.map(c => <option key={c.class_name} value={c.class_name} disabled={c.seats_left === 0}>{c.class_name}{c.seats_left === 0 ? " (full)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Previous school">{inp("previous_school")}</Field>
          <Field label="Previous class">{inp("previous_class")}</Field>
          {f.previous_school.trim() && <Field label="Reason for leaving the previous school" required>{inp("leaving_reason", { placeholder: "e.g. family moved to Lahore" })}</Field>}
          <Field label="Religion" required>
            <select className="am-input" value={relOther ? "__other" : f.religion}
              onChange={e => { const v = e.target.value; setSectOther(false);
                               if (v === "__other") { setRelOther(true); setF(x => ({ ...x, religion: "", sect: "" })); }
                               else { setRelOther(false); setF(x => ({ ...x, religion: v, sect: "" })); } }}>
              <option value="">Choose...</option>{RELIGIONS.map(r => <option key={r} value={r}>{r}</option>)}<option value="__other">Other</option>
            </select>
          </Field>
          {relOther && <Field label="Specify religion" required>{inp("religion")}</Field>}
          <Field label="Sect (optional)">
            {SECTS[f.religion] && !relOther ? (
              <select className="am-input" value={sectOther ? "__other" : f.sect}
                onChange={e => { const v = e.target.value; if (v === "__other") { setSectOther(true); set("sect", ""); } else { setSectOther(false); set("sect", v); } }}>
                <option value="">-</option>{SECTS[f.religion].map(s => <option key={s} value={s}>{s}</option>)}<option value="__other">Other</option>
              </select>
            ) : inp("sect")}
          </Field>
          {sectOther && SECTS[f.religion] && <Field label="Specify sect">{inp("sect")}</Field>}
          <Field label="Nationality" required>
            <input className="am-input" list="am-nationalities" value={f.nationality} onChange={e => set("nationality", e.target.value === "Other" ? "" : e.target.value)} />
            <datalist id="am-nationalities">{NATIONALITIES.map(n => <option key={n} value={n} />)}</datalist>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}><Field label="Residential address" required><textarea className="am-input" rows={2} value={f.address || ""} disabled={contactLocked} onChange={e => set("address", e.target.value)} /></Field></div>
      </div>

      {["father", "mother"].map((who, i) => (
        <div className="am-card am-sec" key={who} id={"sec-" + (i === 0 ? "B" : "C")}>
          <SectionHead letter={i === 0 ? "B" : "C"} title={i === 0 ? "Father" : "Mother"} sub={i === 0 ? "Father's details" : "Mother's details"}
            extra={pg === who && <span className="am-pill">Primary guardian</span>} />
          <div className="am-grid">
            <Field label="Name" required={pg === who}>{inp(who + "_name")}</Field>
            <Field label="CNIC" hint="13 digits">{inp(who + "_cnic")}</Field>
            <Field label="Occupation">{inp(who + "_occupation")}</Field>
            <Field label="Mobile number" required={pg === who} hint={pg === who ? "Becomes the parent login" : ""}>{inp(who + "_phone", { placeholder: "0300 1234567", inputMode: "tel" })}</Field>
            <Field label="Email (optional)">{inp(who + "_email", { type: "email" })}</Field>
          </div>
        </div>
      ))}

      <div className="am-card am-sec" id="sec-D">
        <SectionHead letter="D" title="Guardian" sub="Who is responsible for the child, and who the child lives with" />
        <div className="am-grid">
          <Field label="Primary guardian" required>
            <select className="am-input" value={pg} onChange={e => setF(x => ({ ...x, primary_guardian: e.target.value,
                notify_contact: e.target.value !== "other" && x.notify_contact === "guardian" ? "primary" : x.notify_contact,
                living_with: e.target.value !== "other" && x.living_with === "guardian" ? "" : x.living_with }))}>
              <option value="father">Father</option><option value="mother">Mother</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Student lives with" required>
            <select className="am-input" value={f.living_with} onChange={e => set("living_with", e.target.value)}>
              <option value="">Choose...</option>
              {LIVING_WITH.filter(([v]) => v !== "guardian" || pg === "other").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        {pg === "other" && (
          <div className="am-grid" style={{ marginTop: 12 }}>
            <Field label="Guardian name" required>{inp("guardian_name")}</Field>
            <Field label="Relationship with student" required>
              <select className="am-input" value={f.guardian_relationship} onChange={e => set("guardian_relationship", e.target.value)}>
                <option value="">Choose...</option>{RELATIONSHIPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            {f.guardian_relationship === "other" && <Field label="Specify relationship" required>{inp("guardian_relationship_other")}</Field>}
            <Field label="CNIC" hint="13 digits">{inp("guardian_cnic")}</Field>
            <Field label="Occupation">{inp("guardian_occupation")}</Field>
            <Field label="Mobile number" required hint="Becomes the parent login">{inp("guardian_phone", { placeholder: "0300 1234567", inputMode: "tel" })}</Field>
            <Field label="Email (optional)">{inp("guardian_email", { type: "email" })}</Field>
          </div>
        )}
      </div>

      <div className="am-card am-sec" id="sec-E">
        <SectionHead letter="E" title="Admission messages" sub="Who should receive updates about this application" />
        <div className="am-grid">
          <Field label="Send admission updates to" hint="This doesn't change the primary guardian or the login.">
            <select className="am-input" value={f.notify_contact} onChange={e => set("notify_contact", e.target.value)}>
              {NOTIFY.filter(([v]) => v !== "guardian" || pg === "other").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="am-card am-sec" id="sec-F">
        <SectionHead letter="F" title="Brothers / sisters at this school" sub="Optional - add any of the child's siblings already studying here" />
        {sibs.length > 0 && (
          <div className="am-table-wrap">
            <table className="am-table am-sib-table">
              <thead><tr><th>Registration no.</th><th>Name</th><th>Class</th><th>Campus</th><th>Father</th><th></th></tr></thead>
              <tbody>{sibs.map(s => (
                <tr key={s.enrollment_no}>
                  <td><b>{s.enrollment_no}</b></td><td>{s.name || "-"}</td><td>{s.class_name || "-"}</td><td>{s.campus || "-"}</td><td>{s.father_name || "-"}</td>
                  <td style={{ textAlign: "right" }}><button type="button" className="am-btn am-btn--sm" onClick={() => setSibs(x => x.filter(y => y.enrollment_no !== s.enrollment_no))}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="am-filters" style={{ marginTop: 8 }}>
          <label className="am-field">Registration number
            <input className="am-input" value={sibNo} placeholder="Type the registration number, e.g. STU-2026-0007" onChange={e => { setSibNo(e.target.value); setSibMsg(""); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSibling(); } }} />
          </label>
          {sibBusy && <span className="am-hint" style={{ alignSelf: "center" }}>Finding the student...</span>}
        </div>
        {sibMsg && <div className="am-hint" style={{ color: "var(--am-bad)" }}>{sibMsg}</div>}
        <div className="am-hint">The father's or mother's CNIC above must match the student's record.</div>
      </div>

      <div className="am-card am-sec" id="sec-G">
        <SectionHead letter="G" title="Disability / special needs" sub="Helps us prepare the right support for the child" />
        <div className="am-chips">
          <label className="am-check"><input type="radio" checked={!f.has_disability} onChange={() => set("has_disability", false)} /> No</label>
          <label className="am-check"><input type="radio" checked={f.has_disability} onChange={() => set("has_disability", true)} /> Yes - the child has a disability or special need</label>
        </div>
        {f.has_disability && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="am-chips">{DISABILITY_TYPES.map(([v, l]) => (
              <label key={v} className="am-chip"><input type="checkbox" checked={f.disability_types.includes(v)}
                onChange={e => set("disability_types", e.target.checked ? [...f.disability_types, v] : f.disability_types.filter(x => x !== v))} /> {l}</label>
            ))}</div>
            <Field label="Details and any support the child needs">
              <textarea className="am-input" rows={2} value={f.disability_details} onChange={e => set("disability_details", e.target.value)}
                placeholder="e.g. uses a hearing aid; needs a front seat" />
            </Field>
          </div>
        )}
      </div>

      <div className="am-card am-sec" id="sec-H">
        <SectionHead letter="H" title="Transport" sub="How the child will come to and leave school" />
        <div className="am-chips">
          <label className="am-check"><input type="radio" checked={f.transport_mode === "self"} onChange={() => set("transport_mode", "self")} /> Self (we pick and drop)</label>
          <label className="am-check"><input type="radio" checked={f.transport_mode === "school_van"} onChange={() => set("transport_mode", "school_van")} /> School van</label>
        </div>
        {f.transport_mode === "school_van" && (
          <div style={{ marginTop: 10 }}>
            <Field label="Pick-up address / area" required>
              <textarea className="am-input" rows={2} value={f.pickup_address} onChange={e => set("pickup_address", e.target.value)} placeholder="House, street, area" />
            </Field>
          </div>
        )}
      </div>

      <div className="am-save-bar">
        {allowDraft && <button className="am-btn" disabled={saving} onClick={() => save(false)}>{saving ? "Saving..." : "Save as Draft"}</button>}
        <button className="am-btn am-btn--primary" disabled={saving} onClick={() => save(true)}>{saving ? "Saving..." : submitLabel}</button>
      </div>
    </div>
  );
}
