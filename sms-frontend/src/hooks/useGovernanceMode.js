import { useState, useEffect } from "react";
import campusesApi from "../api/campusesApi";
import { useAuth } from "../auth/AuthContext";

// Module-level cache so every tab/component asking about governance in the
// same page load shares one network call instead of each firing its own.
let cachedGovernance = null;
let cachedGovernancePromise = null;

function loadGovernance() {
  if (cachedGovernance) return Promise.resolve(cachedGovernance);
  if (!cachedGovernancePromise) {
    cachedGovernancePromise = campusesApi.listGovernance()
      .then(r => {
        const rows = r.data.data || [];
        const map = {};
        rows.forEach(row => { map[row.entity_key] = row.mode; });
        cachedGovernance = map;
        return map;
      })
      .catch(() => ({}));
  }
  return cachedGovernancePromise;
}

// Returns { isGlobalLocked, loading } for the given governed entity_key.
// isGlobalLocked is true only when the entity's Governance mode is "global"
// AND the current user is a regular campus-scoped user (not superadmin) -
// meaning they should see this data read-only, with add/edit/delete hidden,
// because it's centrally managed from the superadmin's own Setup page.
export function useGovernanceMode(entityKey) {
  const { user } = useAuth();
  const isSuperAdmin = (user?.roles?.[0] || "") === "superadmin";
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadGovernance().then(map => {
      if (!cancelled) {
        setMode(map[entityKey] || "per_campus");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [entityKey]);

  const isGlobalLocked = !isSuperAdmin && mode === "global";
  return { isGlobalLocked, loading };
}
