import { Box } from "@mui/material";
import { Outlet } from "react-router";
import Sidebar, { COLLAPSED_WIDTH } from "./Sidebar";
import { MAX_CONTENT_WIDTH } from "@/lib/theme";

interface AppShellProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function AppShell({ darkMode, onToggleDarkMode }: AppShellProps) {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flex: 1,
          ml: { xs: 0, md: `${COLLAPSED_WIDTH}px` },
          p: 4, // 20px padding
          overflow: "auto",
        }}
      >
        <Box sx={{ maxWidth: MAX_CONTENT_WIDTH, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
