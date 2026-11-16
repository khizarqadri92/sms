import { createContext, useContext, useState, useEffect } from "react";
import authApi from "../api/authApi";
import client from "../api/client";
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

  const completeLogin = (access_token, refresh_token, userData) => {
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

  // A temporary password (new parent / student account) must be replaced first: nothing is
  // stored; the login page asks for a new password and calls setFirstPassword with this token.
  const finishOrAskNewPassword = ({ access_token, refresh_token, user: userData }) => {
    if (userData?.must_change_password) {
      return { must_change_password: true, pending_token: access_token, name: userData.name };
    }
    return completeLogin(access_token, refresh_token, userData);
  };

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const data = res.data.data;
    if (data.requires_2fa) {
      return { requires_2fa: true, pending_token: data.pending_token };
    }
    return finishOrAskNewPassword(data);
  };

  const verify2FA = async (code, pendingToken) => {
    const res = await authApi.verify2FALogin(code, pendingToken);
    return finishOrAskNewPassword(res.data.data);
  };

  const setFirstPassword = async (newPassword, pendingToken) => {
    const res = await client.post("/auth/first-password", { new_password: newPassword },
                                  { headers: { Authorization: "Bearer " + pendingToken } });
    const { access_token, refresh_token, user: userData } = res.data.data;
    return completeLogin(access_token, refresh_token, userData);
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
    <AuthContext.Provider value={{ user, permissions, loading, login, verify2FA, setFirstPassword, logout, can, hasRequestAccess, requestScopesLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
