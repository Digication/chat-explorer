import { Box } from "@mui/material";
import { Outlet } from "react-router";
import Sidebar, { COLLAPSED_WIDTH } from "./Sidebar";
import GlobalHeader from "./GlobalHeader";

export default function AppShell() {
  return (
    <>
      <GlobalHeader />

      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />

        {/* Main content area — no padding so pages can go full-width */}
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
