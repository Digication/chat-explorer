import { Navigate } from "react-router";
import { useAuth } from "@/lib/AuthProvider";

/**
 * Redirects users to their role-appropriate landing page.
 * Students go to /student, everyone else goes to /insights.
 */
export default function RoleBasedRedirect() {
  const { user } = useAuth();

  if (user?.role === "student") {
    return <Navigate to="/student" replace />;
  }

  return <Navigate to="/insights" replace />;
}
