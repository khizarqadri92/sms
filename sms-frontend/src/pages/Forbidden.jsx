import { useNavigate } from "react-router-dom";

export default function Forbidden() {
  const navigate = useNavigate();
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px 0",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
        padding: "48px 40px", maxWidth: 440, width: "100%", textAlign: "center",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", background: "#fef2f2", display: "flex",
          alignItems: "center", justifyContent: "center", margin: "0 auto 24px",
        }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3z" stroke="#dc2626" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M9.5 12l1.8 1.8L14.8 10" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
          Access Denied
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 28 }}>
          You don't have access to this page. Please contact your administrator if you believe this is a mistake.
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/dashboard")}
          style={{
            padding: "11px 28px", fontSize: 14, fontWeight: 700, borderRadius: 10, border: "none",
            color: "#fff", cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
