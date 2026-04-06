import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  IconButton,
  Drawer,
  useMediaQuery,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import { sidebarTheme } from "@/lib/theme";
import { HEADER_HEIGHT } from "./GlobalHeader";

const COLLAPSED_WIDTH = 60;
const EXPANDED_WIDTH = 280;

const NAV_ITEMS = [
  { label: "Insights", icon: <InsightsOutlinedIcon />, path: "/insights" },
  { label: "Chat Explorer", icon: <ChatOutlinedIcon />, path: "/chat" },
  { label: "Upload", icon: <CloudUploadOutlinedIcon />, path: "/upload" },
  { label: "Reports", icon: <DescriptionOutlinedIcon />, path: "/reports" },
  { label: "Settings", icon: <SettingsOutlinedIcon />, path: "/settings" },
];

function SidebarContent({
  expanded,
  onClose,
}: {
  expanded: boolean;
  onClose?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    navigate(path);
    onClose?.();
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      {/* Navigation items */}
      <List sx={{ flex: 1, pt: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Tooltip
              key={item.path}
              title={expanded ? "" : item.label}
              placement="right"
              arrow
            >
              <ListItemButton
                onClick={() => handleNav(item.path)}
                sx={{
                  minHeight: 44,
                  px: 2,
                  mx: 1,
                  borderRadius: 1,
                  borderLeft: active
                    ? "3px solid #1976d2"
                    : "3px solid transparent",
                  bgcolor: active
                    ? "rgba(255, 255, 255, 0.12)"
                    : "transparent",
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: expanded ? 2 : 0,
                    justifyContent: "center",
                    color: active ? "#fff" : "text.secondary",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {expanded && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: active ? 500 : 400,
                      color: active ? "#fff" : "text.primary",
                    }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Box>
  );
}

export default function Sidebar() {
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width:768px)");

  if (isMobile) {
    return (
      <ThemeProvider theme={sidebarTheme}>
        {/* Hamburger button — sits inside the global header area */}
        <IconButton
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          sx={{
            position: "fixed",
            top: 10,
            left: 10,
            zIndex: 1400,
            color: "#fff",
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
          }}
        >
          <MenuIcon />
        </IconButton>

        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          PaperProps={{
            sx: {
              width: EXPANDED_WIDTH,
              bgcolor: "background.paper",
              top: `${HEADER_HEIGHT}px`,
              height: `calc(100vh - ${HEADER_HEIGHT}px)`,
            },
          }}
        >
          <SidebarContent expanded onClose={() => setMobileOpen(false)} />
        </Drawer>
      </ThemeProvider>
    );
  }

  // Desktop: hover-expand sidebar, positioned below the global header
  const width = hovered ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <ThemeProvider theme={sidebarTheme}>
      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          position: "fixed",
          top: `${HEADER_HEIGHT}px`,
          left: 0,
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          width,
          transition: "width 200ms ease",
          zIndex: 1200,
          bgcolor: "background.paper",
        }}
      >
        <SidebarContent expanded={hovered} />
      </Box>
    </ThemeProvider>
  );
}

export { COLLAPSED_WIDTH };
