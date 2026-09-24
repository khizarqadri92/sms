import axios from "axios";
const client = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

// Superadmin-only override for pages (e.g. FinanceSetup) that must always
// operate on the shared/global (campus_id NULL) rows regardless of whatever
// campus is currently selected in the campus switcher - because for
// superadmin, whose own users.campus_id is NULL, the backend resolves
// campus_id purely from the X-Campus-Id header, so omitting it here is what
// makes those endpoints treat the request as "no specific campus" (global).
// Call setForceGlobalScope(true) on mount and setForceGlobalScope(false) on
// unmount so it never leaks into other pages/tabs.
let forceGlobalScope = false;
export function setForceGlobalScope(value) {
  forceGlobalScope = value;
}

client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Only superadmin (whose own campus_id is NULL) ever sets this - it's
  // how the campus switcher tells the backend which campus's data to
  // operate on. Every other role is scoped to their own fixed campus_id
  // server-side regardless of this header, so it's harmless to always
  // attach it.
  if (!forceGlobalScope) {
    const campusId = sessionStorage.getItem("active_campus_id");
    if (campusId) config.headers["X-Campus-Id"] = campusId;
  }
  // Only set JSON content-type if not FormData
  if (!(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isLoginPage = window.location.pathname === "/login";
      if (!isLoginPage) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("refresh_token");
        sessionStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
export default client;
