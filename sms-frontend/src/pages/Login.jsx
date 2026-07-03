import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import client from "../api/client";

export default function Login() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [school, setSchool]   = useState({
    name:"Darul Madina International Islamic School System",
    address:"123 Main Street, Gulberg, Lahore",
    logo:null
  });

  useEffect(()=>{
    client.get("/settings/public").then(r=>{
      const s = r.data.data||{};
      setSchool({
        name:    s.school_name    || "Darul Madina International Islamic School System",
        address: s.school_address || "123 Main Street, Gulberg, Lahore",
        logo:    s.school_logo    || null,
      });
    }).catch(()=>{});
  },[]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(email, password); navigate("/dashboard"); }
    catch (err) {
      const msg = err.response?.data?.message || "Invalid email or password.";
      setError(msg); setTimeout(()=>setError(""), 10000);
    } finally { setLoading(false); }
  };

  const S = {
    page:{ minHeight:"100vh", display:"grid", gridTemplateColumns:"1fr 1fr", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },

    /* Left panel */
    left:{ background:"#0a2e1c", padding:"40px 36px", display:"flex", flexDirection:"column", justifyContent:"space-between", position:"relative", overflow:"hidden" },
    geo1:{ position:"absolute", width:300, height:300, border:"1.5px solid rgba(255,255,255,0.05)", borderRadius:"50%", top:-80, right:-80 },
    geo2:{ position:"absolute", width:180, height:180, border:"1.5px solid rgba(255,255,255,0.05)", borderRadius:"50%", bottom:30, right:30 },
    geo3:{ position:"absolute", width:100, height:100, background:"rgba(22,101,52,0.35)", borderRadius:"50%", bottom:100, left:30 },

    brandRow:{ position:"relative", zIndex:1, display:"flex", alignItems:"center", gap:14 },
    logoBox:{ width:54, height:54, borderRadius:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" },
    brandName:{ color:"#fff", fontWeight:800, fontSize:14, lineHeight:1.3 },
    brandAddr:{ color:"rgba(255,255,255,0.45)", fontSize:11, marginTop:2 },

    mid:{ position:"relative", zIndex:1 },
    eyebrow:{ color:"rgba(255,255,255,0.45)", fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 },
    bigTitle:{ color:"#fff", fontSize:30, fontWeight:900, lineHeight:1.15, marginBottom:12 },
    bigTitleSpan:{ color:"#4ade80" },
    bigDesc:{ color:"rgba(255,255,255,0.55)", fontSize:13, lineHeight:1.7 },

    features:{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:10 },
    feat:{ display:"flex", alignItems:"center", gap:10 },
    featIcon:{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
    featText:{ color:"rgba(255,255,255,0.75)", fontSize:12, fontWeight:600 },

    /* Right panel */
    right:{ background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", padding:36 },
    card:{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", padding:"36px 32px", width:"100%", maxWidth:380, boxShadow:"0 4px 24px rgba(0,0,0,0.07)" },

    cardLogoWrap:{ display:"flex", justifyContent:"center", marginBottom:6 },
    cardLogoRing:{ width:72, height:72, borderRadius:18, border:"2px solid #e2e8f0", background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" },
    cardLogoInner:{ width:52, height:52, borderRadius:14, background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" },
    verifiedBadge:{ position:"absolute", bottom:-4, right:-4, width:22, height:22, borderRadius:"50%", background:"#22c55e", border:"2px solid #fff", display:"flex", alignItems:"center", justifyContent:"center" },

    cardSchoolName:{ textAlign:"center", fontSize:14, fontWeight:800, color:"#0f172a", margin:"12px 0 2px", lineHeight:1.4 },
    cardTagline:{ textAlign:"center", fontSize:11, color:"#94a3b8", marginBottom:24 },
    divider:{ height:1, background:"#f1f5f9", marginBottom:24 },
    formLabel:{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:16 },

    field:{ marginBottom:16 },
    fieldLabel:{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:6 },
    fieldWrap:{ position:"relative" },
    fieldIcon:{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#cbd5e1", display:"flex" },
    inp:{ width:"100%", padding:"11px 14px 11px 38px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:13, color:"#0f172a", background:"#fafafa", outline:"none", boxSizing:"border-box" },
    showBtn:{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", fontSize:11, fontWeight:700, color:"#94a3b8", cursor:"pointer" },

    signBtn:{ width:"100%", padding:13, background:"#0a2e1c", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:6 },
    signBtnDisabled:{ width:"100%", padding:13, background:"#94a3b8", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:6 },

    errorBox:{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", gap:8, alignItems:"flex-start" },
    errorTxt:{ fontSize:12, color:"#991b1b", lineHeight:1.5 },

    helpText:{ textAlign:"center", fontSize:11, color:"#94a3b8", marginTop:16 },
  };

  const IconMail = ()=>(
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
  const IconLock = ()=>(
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
  const IconArrow = ()=>(
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
  const IconSchool = ({color="#fff"})=>(
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  );
  const IconCheck = ()=>(
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );

  return (
    <div style={S.page}>
      {/* ── LEFT PANEL ── */}
      <div style={S.left}>
        <div style={S.geo1}/><div style={S.geo2}/><div style={S.geo3}/>

        {/* Brand */}
        <div style={S.brandRow}>
          <div style={S.logoBox}>
            {school.logo
              ? <img src={school.logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <IconSchool color="#fff"/>
            }
          </div>
          <div>
            <div style={S.brandName}>{school.name}</div>
            <div style={S.brandAddr}>{school.address}</div>
          </div>
        </div>

        {/* Heading */}
        <div style={S.mid}>
          <div style={S.eyebrow}>Welcome to</div>
          <div style={S.bigTitle}>
            Your School<br/>
            <span style={S.bigTitleSpan}>Management</span><br/>
            Portal
          </div>
          <div style={S.bigDesc}>A complete platform for managing students, teachers, academics, finance and more — all in one place.</div>
        </div>

        {/* Features */}
        <div style={S.features}>
          {[
            {icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, text:"Student & Parent Portals"},
            {icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, text:"Attendance & Academic Tracking"},
            {icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, text:"Fee Management & Finance"},
            {icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, text:"Exam Results & Report Cards"},
          ].map((f,i)=>(
            <div key={i} style={S.feat}>
              <div style={S.featIcon}>{f.icon}</div>
              <div style={S.featText}>{f.text}</div>
            </div>
          ))}
          <div style={{marginTop:8,borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:14,color:"rgba(255,255,255,0.3)",fontSize:11}}>
            Secure &bull; Reliable &bull; Easy to Use
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={S.right}>
        <div style={S.card}>

          {/* School logo on card */}
          <div style={S.cardLogoWrap}>
            <div style={S.cardLogoRing}>
              <div style={S.cardLogoInner}>
                {school.logo
                  ? <img src={school.logo} alt="logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : <IconSchool color="#fff"/>
                }
              </div>
              <div style={S.verifiedBadge}><IconCheck/></div>
            </div>
          </div>

          <div style={S.cardSchoolName}>{school.name}</div>
          <div style={S.cardTagline}>Secure School Management Portal</div>
          <div style={S.divider}/>
          <div style={S.formLabel}>Sign in to your account</div>

          {error&&(
            <div style={S.errorBox}>
              <span style={{fontSize:14,flexShrink:0}}>&#9888;</span>
              <span style={S.errorTxt}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={S.field}>
              <label style={S.fieldLabel}>Email address</label>
              <div style={S.fieldWrap}>
                <div style={S.fieldIcon}><IconMail/></div>
                <input style={S.inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@school.com" required autoFocus
                  onFocus={e=>e.target.style.borderColor="#0a2e1c"}
                  onBlur={e=>e.target.style.borderColor="#e2e8f0"}
                />
              </div>
            </div>

            <div style={S.field}>
              <label style={S.fieldLabel}>Password</label>
              <div style={S.fieldWrap}>
                <div style={S.fieldIcon}><IconLock/></div>
                <input style={S.inp} type={showPass?"text":"password"} value={password} onChange={e=>setPass(e.target.value)} placeholder="Enter your password" required
                  onFocus={e=>e.target.style.borderColor="#0a2e1c"}
                  onBlur={e=>e.target.style.borderColor="#e2e8f0"}
                />
                <button type="button" style={S.showBtn} onClick={()=>setShowPass(!showPass)}>{showPass?"Hide":"Show"}</button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={loading?S.signBtnDisabled:S.signBtn}>
              {loading ? (
                <>
                  <span style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid #fff",borderRadius:"50%",display:"inline-block",animation:"spin 0.8s linear infinite"}}/>
                  Signing in...
                </>
              ) : <>Sign In <IconArrow/></>}
            </button>
          </form>

          <div style={S.helpText}>Having trouble? Contact your administrator.</div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:768px){}`}</style>
    </div>
  );
}