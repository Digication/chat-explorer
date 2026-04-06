import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { ApolloProvider } from "@apollo/client/react";
import { lightTheme } from "@/lib/theme";
import { apolloClient } from "@/lib/apollo-client";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import { Box, Typography, CircularProgress } from "@mui/material";

import CsvUploadCard from "@/components/upload/CsvUploadCard";
import InsightsPage from "@/pages/InsightsPage";
import ChatExplorerPage from "@/pages/ChatExplorerPage";
// AiChatPage is no longer used — AI Chat is embedded in ChatExplorerPage
import ReportsPage from "@/pages/ReportsPage";
import { InsightsScopeProvider } from "@/components/insights/ScopeSelector";

function DashboardPage() {
  return (
    <Box>
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

function SettingsPage() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        Settings
      </Typography>
      <Typography color="text.secondary">
        Account and preference settings coming soon.
      </Typography>
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
    return <Navigate to="/login" replace />;
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
                    <InsightsScopeProvider>
                      <AppShell />
                    </InsightsScopeProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/insights" replace />} />
                <Route path="upload" element={<DashboardPage />} />
                <Route path="insights" element={<InsightsPage />} />
                <Route path="chat" element={<ChatExplorerPage />} />
                {/* AI Chat is now embedded in Chat Explorer — redirect old URL */}
                <Route path="ai-chat" element={<Navigate to="/chat" replace />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ApolloProvider>
  );
}
