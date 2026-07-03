import { createContext, useContext, useState, useEffect } from "react";
import authApi from "../api/authApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token  = localStorage.getItem("access_token");
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
    localStorage.setItem("access_token",  access_token);
    localStorage.setItem("refresh_token", refresh_token);
    localStorage.setItem("user",          JSON.stringify(userData));
    setUser(userData);
    setPermissions(userData.permissions || []);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
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