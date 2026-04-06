import { Box } from "@mui/material";
import { Outlet } from "react-router";
import Sidebar, { COLLAPSED_WIDTH } from "./Sidebar";
import GlobalHeader, { HEADER_HEIGHT } from "./GlobalHeader";

export default function AppShell() {
  return (
    <>
      <GlobalHeader />

      <Box sx={{ display: "flex", height: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
        <Sidebar />

        {/* Main content area — scrolls independently within the viewport */}
        <Box
          component="main"
          sx={{
            flex: 1,
            ml: { xs: 0, md: `${COLLAPSED_WIDTH}px` },
            overflow: "auto",
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </>
  );
}
