import { useNavigate } from "react-router-dom";
import "./Students.css";

export default function Forbidden() {
  const navigate = useNavigate();
  return (
    <div className="forbidden-page">
      <div className="forbidden-box">
        <div className="forbidden-icon">🚫</div>
        <h1 className="forbidden-title">Access Denied</h1>
        <p className="forbidden-text">You do not have permission to view this page.</p>
        <button className="btn-primary" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}