import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { ApolloProvider } from "@apollo/client/react";
import { lightTheme } from "@/lib/theme";
import { apolloClient } from "@/lib/apollo-client";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";
import { UserSettingsProvider } from "@/lib/UserSettingsContext";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import { Box, Typography, CircularProgress } from "@mui/material";

import CsvUploadCard from "@/components/upload/CsvUploadCard";
import InsightsPage from "@/pages/InsightsPage";
import ChatExplorerPage from "@/pages/ChatExplorerPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import AdminPage from "@/pages/AdminPage";
import StudentProfilePage from "@/pages/StudentProfilePage";
import CrossCourseComparisonPage from "@/pages/CrossCourseComparisonPage";
import ArtifactsListPage from "@/pages/ArtifactsListPage";
import ArtifactDetailPage from "@/pages/ArtifactDetailPage";
import { InsightsScopeProvider } from "@/components/insights/ScopeSelector";
import { InsightsAnalyticsProvider } from "@/components/insights/InsightsAnalyticsContext";
import { FacultyPanelProvider } from "@/components/faculty-panel/FacultyPanelContext";
import PageViewTracker from "@/components/tracking/PageViewTracker";
import RoleBasedRedirect from "@/components/layout/RoleBasedRedirect";
import StudentDashboardPage from "@/pages/student/StudentDashboardPage";
import StudentTreePage from "@/pages/student/StudentTreePage";
import StudentGrowthPage from "@/pages/student/StudentGrowthPage";
import StudentOutcomesPage from "@/pages/student/StudentOutcomesPage";

function DashboardPage() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        Upload
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Upload a CSV to get started.
      </Typography>
      <CsvUploadCard />
    </Box>
  );
}


function NotFoundPage() {
  return (
    <Box sx={{ textAlign: "center", mt: 10 }}>
      <Typography variant="h4" gutterBottom>
        404
      </Typography>
      <Typography color="text.secondary">Page not found</Typography>
    </Box>
  );
}

/**
 * Redirects to /login if the user is not authenticated.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    // Preserve query params (e.g. ?error=EXPIRED_TOKEN from magic links)
    const target = `/login${location.search}`;
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

/**
 * Redirects to / if the user's role is not in the allowed list.
 */
function RoleProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user?.role || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <PageViewTracker />
                    <UserSettingsProvider>
                      <InsightsScopeProvider>
                        <InsightsAnalyticsProvider>
                          <FacultyPanelProvider>
                            <AppShell />
                          </FacultyPanelProvider>
                        </InsightsAnalyticsProvider>
                      </InsightsScopeProvider>
                    </UserSettingsProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<RoleBasedRedirect />} />
                <Route path="upload" element={<DashboardPage />} />
                <Route path="insights" element={<InsightsPage />} />
                <Route path="insights/compare" element={<CrossCourseComparisonPage />} />
                <Route path="insights/student/:studentId" element={<StudentProfilePage />} />
                <Route path="chat" element={<ChatExplorerPage />} />
                {/* AI Chat is now embedded in Chat Explorer — redirect old URL */}
                <Route path="ai-chat" element={<Navigate to="/chat" replace />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="artifacts" element={<ArtifactsListPage />} />
                <Route path="artifacts/:id" element={<ArtifactDetailPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route
                  path="admin"
                  element={
                    <RoleProtectedRoute allowedRoles={["institution_admin", "digication_admin"]}>
                      <AdminPage />
                    </RoleProtectedRoute>
                  }
                />
                {/* Student routes */}
                <Route
                  path="student"
                  element={
                    <RoleProtectedRoute allowedRoles={["student"]}>
                      <StudentDashboardPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="student/tree"
                  element={
                    <RoleProtectedRoute allowedRoles={["student"]}>
                      <StudentTreePage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="student/growth"
                  element={
                    <RoleProtectedRoute allowedRoles={["student"]}>
                      <StudentGrowthPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="student/outcomes"
                  element={
                    <RoleProtectedRoute allowedRoles={["student"]}>
                      <StudentOutcomesPage />
                    </RoleProtectedRoute>
                  }
                />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ApolloProvider>
  );
}
