/** Zustand store for auth state — alternative to Context if app grows. */
import { create } from "zustand";

export const useAuthStore = create((set) => ({
  user: null,
  permissions: [],
  setUser: (user) => set({ user }),
  setPermissions: (permissions) => set({ permissions }),
  clear: () => set({ user: null, permissions: [] }),
}));
