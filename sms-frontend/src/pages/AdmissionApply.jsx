import { useState, useEffect } from "react";
import client from "../api/client";
import portalApi from "../api/portalApi";
import AdmissionApplyFlow from "./AdmissionApplyFlow";
import "./Admissions.css";

/** Public admission portal (no login): /admissions/apply */
export default function AdmissionApply() {
  const [school, setSchool] = useState(null);
  const [logo, setLogo] = useState(null);
  const [session, setSession] = useState("");
  useEffect(() => {
    portalApi.campuses().then(r => { setSchool(r.data.data.school); const c = r.data.data.campuses; if (c.length === 1) setSession(c[0].session); }).catch(() => {});
    let url = null;
    client.get("/admission-portal/public/logo", { responseType: "blob" }).then(r => { url = URL.createObjectURL(r.data); setLogo(url); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);
  return (
    <div className="am-portal">
      <header className="am-portal-head">
        <div className="am-portal-brand">
          {logo && <span className="am-portal-logo"><img src={logo} alt="" /></span>}
          <div style={{ minWidth: 0 }}>
            <div className="am-portal-school">{school?.name || "Admissions"}</div>
            <div className="am-portal-sub">Online Admission Form{session ? " · Session " + session : ""}{school?.phone ? " · Help: " + school.phone : ""}</div>
          </div>
        </div>
        <a className="am-portal-login" href="/login">Parent sign in</a>
      </header>
      <main className="am-portal-inner am-page" style={{ padding: "20px 16px 40px" }}>
        <AdmissionApplyFlow mode="public" />
      </main>
    </div>
  );
}
