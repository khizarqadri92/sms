import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function PrivateRoute({ children, permission, requestType }) {
  const { user, loading, can, hasRequestAccess, requestScopesLoading } = useAuth();
  if (loading) return <div style={{padding:40}}>Loading...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    // Fall back to a scoped request-permission grant (e.g. HOD of own
    // department) if one was specified for this route. On a fresh page
    // load (e.g. a full <a href> navigation, not client-side routing),
    // requestScopes are still fetching asynchronously - wait for that
    // before denying, so this doesn't race and wrongly redirect to 403.
    if (requestType && requestScopesLoading) return <div style={{padding:40}}>Loading...</div>;
    if (!requestType || !hasRequestAccess(requestType)) return <Navigate to="/403" replace />;
  }
  return children;
}