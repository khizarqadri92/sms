import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import authApi from "../api/authApi";
import settingsApi from "../api/settingsApi";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
const CHECK_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MINUTES = 15;
const LOCKOUT_KEY = "lockout_until";
const IDLE_LOCKED_KEY = "idle_locked";

export default function IdleLock() {
  const { user } = useAuth();
  const [timeoutMinutes, setTimeoutMinutes] = useState(DEFAULT_TIMEOUT_MINUTES);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const lastActivityRef = useRef(Date.now());

  // On mount, restore lock state from sessionStorage so a page refresh
  // cannot be used to bypass an active idle-lock or lockout countdown.
  useEffect(() => {
    if (!user) return;
    const storedLockoutUntil = sessionStorage.getItem(LOCKOUT_KEY);
    if (storedLockoutUntil) {
      const d = new Date(storedLockoutUntil);
      if (d.getTime() > Date.now()) {
        setLockedUntil(d);
        setLocked(true);
        setError("Account locked due to too many failed attempts. Please wait before trying again.");
      } else {
        sessionStorage.removeItem(LOCKOUT_KEY);
      }
    }
    if (sessionStorage.getItem(IDLE_LOCKED_KEY) === "true") {
      setLocked(true);
    }
  }, [user]);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((lockedUntil.getTime() - Date.now()) / 1000));
      setRemainingSec(secs);
      if (secs <= 0) {
        setLockedUntil(null);
        setError("");
        sessionStorage.removeItem(LOCKOUT_KEY);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  useEffect(() => {
    if (!user) return;
    const fetchTimeout = () => {
      settingsApi.getSecurityPublic()
        .then(r => {
          const val = parseInt(r.data.data?.idle_timeout_minutes, 10);
          if (val > 0) setTimeoutMinutes(val);
        })
        .catch(() => {});
    };
    fetchTimeout();
    // Re-fetch periodically so an admin changing this setting takes effect
    // for already-open sessions without requiring a page refresh.
    const settingsInterval = setInterval(fetchTimeout, 60000);
    return () => clearInterval(settingsInterval);
  }, [user]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!user) return;
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetActivity));
    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetActivity));
    };
  }, [user, resetActivity]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMinutes * 60 * 1000) {
        setLocked(true);
        sessionStorage.setItem(IDLE_LOCKED_KEY, "true");
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, timeoutMinutes]);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await authApi.verifyPassword(password);
      setLocked(false);
      setPassword("");
      resetActivity();
      sessionStorage.removeItem(IDLE_LOCKED_KEY);
      sessionStorage.removeItem(LOCKOUT_KEY);
    } catch (err) {
      setError(err.response?.data?.message || "Incorrect password.");
      const lu = err.response?.data?.data?.locked_until;
      if (lu) {
        setLockedUntil(new Date(lu));
        sessionStorage.setItem(LOCKOUT_KEY, lu);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fmtCountdown = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return m + ":" + s;
  };

  if (!user || !locked) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 5000,
      background: "rgba(15, 23, 42, 0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <form onSubmit={handleUnlock} style={{
        background: "#ffffff", borderRadius: 16, padding: "36px 32px",
        width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: "#eff6ff",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", fontSize: 24,
        }}>
          🔒
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a", marginBottom: 4 }}>
          Session Locked
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
          {user.name ? "Welcome back, " + user.name.split(" ")[0] + ". Enter your password to continue." : "Enter your password to continue."}
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12, textAlign: "left" }}>{error}</div>}
        {lockedUntil && (
          <div style={{ fontSize: 28, fontWeight: 700, color: "#dc2626", marginBottom: 16, fontVariantNumeric: "tabular-nums" }}>
            {fmtCountdown(remainingSec)}
          </div>
        )}
        <input
          type="password"
          className="form-control"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          disabled={!!lockedUntil}
          style={{ marginBottom: 16, textAlign: "center" }}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting || !password || !!lockedUntil} style={{ width: "100%" }}>
          {lockedUntil ? "Locked" : submitting ? "Verifying..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
