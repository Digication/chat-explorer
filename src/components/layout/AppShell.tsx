import { Box } from "@mui/material";
import { Outlet } from "react-router";
import Sidebar, { COLLAPSED_WIDTH } from "./Sidebar";
import GlobalHeader, { HEADER_HEIGHT } from "./GlobalHeader";
import { useFacultyPanel } from "@/components/faculty-panel/FacultyPanelContext";
import FacultyPanel from "@/components/faculty-panel/FacultyPanel";

export default function AppShell() {
  const { isOpen: panelOpen } = useFacultyPanel();

  return (
    <>
      <GlobalHeader />

      <Box sx={{ display: "flex", height: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
        <Sidebar />

        {/* Main content area + optional Faculty Panel */}
        <Box
          component="main"
          sx={{
            display: "flex",
            flex: 1,
            ml: { xs: 0, md: `${COLLAPSED_WIDTH}px` },
            overflow: "hidden",
          }}
        >
          {/* Page content — scrolls independently */}
          <Box sx={{ flex: 1, overflow: "auto", minWidth: 0 }}>
            <Outlet />
          </Box>

          {/* Faculty Panel — slides in from the right */}
          {panelOpen && (
            <Box
              sx={{
                width: { xs: "100%", md: "33%" },
                minWidth: { md: 360 },
                maxWidth: { md: 500 },
                overflow: "auto",
                flexShrink: 0,
              }}
            >
              <FacultyPanel />
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
