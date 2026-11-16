import client from "./client";

// Processing date + date/time format for pages used BEFORE login (e.g. the online admission form).
// Fetched once and shared; the normal (logged-in) endpoints are used everywhere else.
let cached = null;
export function getPublicRegional() {
  if (!cached) {
    cached = client.get("/admission-portal/public/regional")
      .then(r => r.data.data || {})
      .catch(() => { cached = null; return {}; });
  }
  return cached;
}
export const isLoggedIn = () => !!sessionStorage.getItem("access_token");
