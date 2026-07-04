import client from "./client";

const authApi = {
  login:   (credentials) => client.post("/auth/login", credentials),
  logout:  ()            => client.post("/auth/logout"),
  refresh: ()            => client.post("/auth/refresh"),
  me:      ()            => client.get("/auth/me"),
  verifyPassword: (password) => client.post("/auth/verify-password", { password }),
};

export default authApi;
