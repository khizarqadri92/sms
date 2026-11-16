import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import portalApi from "../api/portalApi";
import { ScheduleCard } from "./AdmissionApplyFlow";
import "./Admissions.css";

/** Admission announcement (opened from the notification, the news or the popup): banner + schedule + apply. */
export default function AdmissionAnnouncement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [img, setImg] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    portalApi.announcement(id).then(r => setD(r.data.data)).catch(e => setError(e?.response?.data?.message || "This announcement is not available."));
  }, [id]);
  useEffect(() => {
    if (!d?.has_banner) return;
    let url = null;
    portalApi.bannerImage(id).then(r => { url = URL.createObjectURL(r.data); setImg(url); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [d, id]);

  if (error) return <div className="am-page"><div className="am-card am-hint">{error}</div></div>;
  if (!d) return <div className="am-page"><div className="am-card am-hint">Loading...</div></div>;
  return (
    <div className="am-page">
      <div className="am-head">
        <div><div className="am-title">Admissions open · {d.campus}</div><div className="am-sub">Session {d.session}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {d.is_parent && d.open_now && <button className="am-btn am-btn--primary" onClick={() => navigate("/my-admissions?apply=1")}>Apply for my child</button>}
          {d.open_now && <a className={"am-btn" + (d.is_parent ? "" : " am-btn--primary")} href="/admissions/apply" target="_blank" rel="noreferrer">Online application form</a>}
        </div>
      </div>
      {img && <img src={img} alt={`Admissions open - ${d.campus} ${d.session}`} className="am-announce-banner" />}
      {!d.open_now && <div className="am-notice">{d.closed_reason || "Applications are not open today - see the dates below."}</div>}
      <ScheduleCard s={d} />
      {d.classes?.length > 0 && (
        <div className="am-card">
          <div className="am-card-title">Classes open for admission</div>
          <div className="am-chips">{d.classes.map(c => (
            <span key={c.class_name} className="am-chip">{c.class_name}
              {c.min_age_years != null && <span className="am-hint"> · age {c.min_age_years}{c.max_age_years != null ? "-" + c.max_age_years : "+"}</span>}
              {c.seats_left === 0 && <span className="am-hint"> · full</span>}
            </span>
          ))}</div>
        </div>
      )}
    </div>
  );
}
