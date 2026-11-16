import client from "./client";

const authApi = {
  login:   (credentials) => client.post("/auth/login", credentials),
  logout:  ()            => client.post("/auth/logout"),
  refresh: ()            => client.post("/auth/refresh"),
  me:      ()            => client.get("/auth/me"),
  verifyPassword: (password) => client.post("/auth/verify-password", { password }),
  verify2FALogin: (code, pendingToken) => client.post("/auth/2fa/verify-login", { code }, { headers: { Authorization: `Bearer ${pendingToken}` } }),
  get2FAStatus:   ()       => client.get("/auth/2fa/status"),
  setup2FA:       ()       => client.post("/auth/2fa/setup"),
  confirm2FASetup:(code)   => client.post("/auth/2fa/confirm-setup", { code }),
  disable2FA:     (password) => client.post("/auth/2fa/disable", { password }),
};

export default authApi;
