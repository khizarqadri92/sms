import { createContext, useContext, useState, useEffect } from "react";
import authApi from "../api/authApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    const token  = sessionStorage.getItem("access_token");
    if (stored && token) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setPermissions(parsed.permissions || []);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const { access_token, refresh_token, user: userData } = res.data.data;
    sessionStorage.setItem("access_token",  access_token);
    sessionStorage.setItem("refresh_token", refresh_token);
    sessionStorage.setItem("user",          JSON.stringify(userData));
    setUser(userData);
    setPermissions(userData.permissions || []);
    // Load per-user theme from backend after login
    fetch("/api/v1/users/profile/theme", {
      headers: { "Authorization": "Bearer " + access_token }
    }).then(r => r.json()).then(data => {
      const t = data?.data?.theme;
      if (t) {
        localStorage.setItem("sms_theme", t);
        window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme: t } }));
      }
    }).catch(() => {});
    return userData;
  };

  const logout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("user");
    setUser(null);
    setPermissions([]);
    window.location.href = "/login";
  };

  const can = (permission) => permissions.includes(permission);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
