import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { RELATIONSHIPS, DISABILITY_TYPES, LIVING_WITH, formatCnic } from "./AdmissionApplicationForm";
import "./Admissions.css";

const REL = Object.fromEntries(RELATIONSHIPS);
const DIS = Object.fromEntries(DISABILITY_TYPES);
const LIVES = Object.fromEntries(LIVING_WITH);
const NOTIFY = { primary: "Primary guardian", father: "Father", mother: "Mother", guardian: "Other guardian", both_parents: "Both parents", all: "All contacts" };
const Row = ({ label, value }) => <div><span>{label}</span>{value || "-"}</div>;

/** Read-only summary before submitting; every section has an Edit button that goes back to it. */
export default function AdmissionReview({ f, docs, campus, session, onEdit, onEditDocs }) {
  const { formatDate } = useRegionalSettings();
  const pg = f.primary_guardian;
  const cnic = v => v ? formatCnic(v) : "-";
  const Sec = ({ letter, title, children }) => (
    <div className="am-card am-sec am-review-sec">
      <div className="am-review-head">
        <div className="am-sec-head" style={{ margin: 0 }}><span className="am-sec-badge">{letter}</span><div className="am-sec-title">{title}</div></div>
        <button type="button" className="am-btn am-btn--sm" onClick={() => onEdit(letter)}>Edit</button>
      </div>
      <div className="am-kv">{children}</div>
    </div>
  );
  return (
    <div className="am-form">
      <div className="am-review-intro">
        <b>Please check everything before you submit.</b> Use <b>Edit</b> to change a section - your other answers are kept.
        {campus && <div className="am-hint" style={{ marginTop: 4 }}>{campus}{session ? " · Session " + session : ""} · Class applied for: <b>{f.class_name}</b></div>}
      </div>
      <Sec letter="A" title="Student">
        <Row label="Name" value={`${f.student_first_name} ${f.student_last_name}`} />
        <Row label="Date of birth" value={f.date_of_birth ? formatDate(f.date_of_birth) : ""} />
        <Row label="Gender" value={f.gender === "female" ? "Female" : f.gender === "male" ? "Male" : ""} />
        <Row label="B-Form" value={cnic(f.b_form_no)} />
        <Row label="Class applied for" value={f.class_name} />
        <Row label="Religion" value={f.religion + (f.sect ? " · " + f.sect : "")} />
        <Row label="Nationality" value={f.nationality} />
        <Row label="Previous school" value={f.previous_school ? f.previous_school + (f.previous_class ? " · " + f.previous_class : "") : "None"} />
        {f.previous_school && <Row label="Reason for leaving" value={f.leaving_reason} />}
        <Row label="Residential address" value={f.address} />
      </Sec>
      {[["B", "father", "Father"], ["C", "mother", "Mother"]].map(([L, who, title]) => (
        <Sec key={L} letter={L} title={title + (pg === who ? " (primary guardian)" : "")}>
          <Row label="Name" value={f[who + "_name"]} /><Row label="CNIC" value={cnic(f[who + "_cnic"])} />
          <Row label="Occupation" value={f[who + "_occupation"]} /><Row label="Mobile" value={f[who + "_phone"]} />
          <Row label="Email" value={f[who + "_email"]} />
        </Sec>
      ))}
      <Sec letter="D" title="Guardian">
        <Row label="Primary guardian" value={pg === "other" ? "Other" : pg === "mother" ? "Mother" : "Father"} />
        <Row label="Student lives with" value={LIVES[f.living_with]} />
        {pg === "other" && <>
          <Row label="Guardian name" value={f.guardian_name} />
          <Row label="Relationship" value={f.guardian_relationship === "other" ? f.guardian_relationship_other : REL[f.guardian_relationship]} />
          <Row label="Guardian mobile" value={f.guardian_phone} /><Row label="Guardian CNIC" value={cnic(f.guardian_cnic)} />
        </>}
      </Sec>
      <Sec letter="E" title="Admission messages"><Row label="Send updates to" value={NOTIFY[f.notify_contact]} /></Sec>
      <Sec letter="F" title="Brothers / sisters at this school">
        <Row label="Siblings" value={(f.siblings || []).length ? f.siblings.map(s => (s.name || s.enrollment_no) + (s.class_name ? " · " + s.class_name : "")).join(", ") : "None"} />
      </Sec>
      <Sec letter="G" title="Disability / special needs">
        <Row label="Disability / special need" value={f.has_disability ? "Yes" : "None"} />
        {f.has_disability && <><Row label="Type" value={(f.disability_types || []).map(t => DIS[t] || t).join(", ")} /><Row label="Details" value={f.disability_details} /></>}
      </Sec>
      <Sec letter="H" title="Transport">
        <Row label="Transport" value={f.transport_mode === "school_van" ? "School van" : "Self (we pick and drop)"} />
        {f.transport_mode === "school_van" && <Row label="Pick-up address" value={f.pickup_address} />}
      </Sec>
      <div className="am-card am-sec am-review-sec">
        <div className="am-review-head">
          <div className="am-sec-head" style={{ margin: 0 }}><span className="am-sec-badge">&#128206;</span><div className="am-sec-title">Documents</div></div>
          <button type="button" className="am-btn am-btn--sm" onClick={onEditDocs}>Edit</button>
        </div>
        {docs.map(d => <div className="am-doc" key={d.name}><b>{d.name}</b><span className="am-hint">{d.file ? d.file.name : "missing"}</span></div>)}
      </div>
    </div>
  );
}
