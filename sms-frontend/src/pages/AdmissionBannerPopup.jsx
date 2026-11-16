import { useState, useEffect } from "react";
import client from "../api/client";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./Admissions.css";

/**
 * Admission announcement popup on the dashboard (every role).
 * Shown while the schedule is published and applications are open (the server decides).
 * x = closed for THIS login (shows again next login).  "Don't show again" = never again
 * for this banner (a newly uploaded banner shows again).
 */
const loginKey = () => (sessionStorage.getItem("refresh_token") || "").slice(-16);   // changes with every login
const seenKey = b => `adm_banner_${b.id}_${b.version}_${loginKey()}`;

export default function AdmissionBannerPopup() {
  const { formatDate } = useRegionalSettings();
  const [queue, setQueue] = useState([]);
  const [img, setImg] = useState(null);
  const [never, setNever] = useState(false);
  const current = queue[0];

  useEffect(() => {
    client.get("/admission-portal/banner")
      .then(r => setQueue((r.data.data || []).filter(b => !sessionStorage.getItem(seenKey(b)))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!current) { setImg(null); return; }
    let url = null;
    client.get(`/admission-portal/banner/${current.id}/image`, { responseType: "blob" })
      .then(r => { url = URL.createObjectURL(r.data); setImg(url); })
      .catch(() => setQueue(q => q.slice(1)));                 // image missing: skip this one
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [current]);
  useEffect(() => {
    if (!current) return;
    const esc = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  });

  const close = () => {
    if (!current) return;
    sessionStorage.setItem(seenKey(current), "1");
    if (never) client.post(`/admission-portal/banner/${current.id}/dismiss`, { version: current.version }).catch(() => {});
    setNever(false); setImg(null); setQueue(q => q.slice(1));
  };

  if (!current || !img) return null;
  return (
    <div className="am-banner-overlay" onClick={close} role="dialog" aria-modal="true" aria-label="Admissions announcement">
      <div className="am-banner" onClick={e => e.stopPropagation()}>
        <button className="am-banner-x" onClick={close} aria-label="Close">&times;</button>
        <img src={img} alt={`Admissions open - ${current.campus} ${current.session}`} />
        <div className="am-banner-foot">
          <label className="am-banner-never"><input type="checkbox" checked={never} onChange={e => setNever(e.target.checked)} /> Don't show again</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {current.closes_on && <span className="am-banner-until">Applications open until {formatDate(current.closes_on)}</span>}
            <a className="am-banner-more" href={`/admission-news/${current.id}`} onClick={close}>View details</a>
            <a className="am-btn am-btn--primary am-btn--sm" href="/admissions/apply" target="_blank" rel="noreferrer" onClick={close}>Apply now</a>
          </div>
        </div>
      </div>
    </div>
  );
}
