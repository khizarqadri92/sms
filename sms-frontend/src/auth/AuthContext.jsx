import { createContext, useContext, useState, useEffect } from "react";
import authApi from "../api/authApi";
import requestPermissionsApi from "../api/requestPermissionsApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [requestScopes, setRequestScopes] = useState([]);
  const [requestScopesLoading, setRequestScopesLoading] = useState(true);
  const [loading, setLoading]         = useState(true);

  const loadRequestScopes = () => {
    setRequestScopesLoading(true);
    requestPermissionsApi.getMyScopes()
      .then(r => setRequestScopes(r.data.data?.accessible_request_types || []))
      .catch(() => {})
      .finally(() => setRequestScopesLoading(false));
  };

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    const token  = sessionStorage.getItem("access_token");
    if (stored && token) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setPermissions(parsed.permissions || []);
      loadRequestScopes();
    } else {
      setRequestScopesLoading(false);
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
    loadRequestScopes();
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
  const hasRequestAccess = (requestType) => requestScopes.includes(requestType);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, can, hasRequestAccess, requestScopesLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
