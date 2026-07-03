import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function PrivateRoute({ children, permission }) {
  const { user, loading, can } = useAuth();
  if (loading) return <div style={{padding:40}}>Loading...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/403" replace />;
  return children;
}