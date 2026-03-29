import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Avatar,
  Typography,
  IconButton,
  Divider,
  Drawer,
  useMediaQuery,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
// SmartToyOutlinedIcon removed — AI Chat is now embedded in Chat Explorer
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import { sidebarTheme } from "@/lib/theme";
import { useAuth } from "@/lib/AuthProvider";
import { signOut } from "@/lib/auth-client";

const COLLAPSED_WIDTH = 60;
const EXPANDED_WIDTH = 280;

const NAV_ITEMS = [
  { label: "Dashboard", icon: <HomeOutlinedIcon />, path: "/" },
  { label: "Insights", icon: <InsightsOutlinedIcon />, path: "/insights" },
  { label: "Chat Explorer", icon: <ChatOutlinedIcon />, path: "/chat" },
  { label: "Reports", icon: <DescriptionOutlinedIcon />, path: "/reports" },
  { label: "Settings", icon: <SettingsOutlinedIcon />, path: "/settings" },
];

interface SidebarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

function SidebarContent({
  expanded,
  darkMode,
  onToggleDarkMode,
  onClose,
}: {
  expanded: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onClose?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleNav = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
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
                  bgcolor: active ? "rgba(25, 118, 210, 0.12)" : "transparent",
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: expanded ? 2 : 0,
                    justifyContent: "center",
                    color: active ? "primary.main" : "text.secondary",
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
                      color: active ? "primary.main" : "text.primary",
                    }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>

      {/* Bottom section: user info + controls */}
      <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
      <Box sx={{ p: 1.5 }}>
        {/* Dark mode toggle */}
        <Tooltip title={expanded ? "" : darkMode ? "Light mode" : "Dark mode"} placement="right">
          <IconButton onClick={onToggleDarkMode} size="small" sx={{ mb: 1, ml: 0.5 }}>
            {darkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
        </Tooltip>

        {/* User info */}
        {user && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 0.5,
              mb: 1,
            }}
          >
            <Avatar
              src={user.image ?? undefined}
              sx={{ width: 32, height: 32, fontSize: 14 }}
            >
              {user.name?.[0]?.toUpperCase()}
            </Avatar>
            {expanded && (
              <Box sx={{ overflow: "hidden", flex: 1 }}>
                <Typography variant="body2" noWrap fontWeight={500}>
                  {user.name}
                </Typography>
                <Typography variant="caption" noWrap color="text.secondary">
                  {user.email}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Sign out */}
        <Tooltip title={expanded ? "" : "Sign out"} placement="right">
          <ListItemButton
            onClick={handleSignOut}
            sx={{
              minHeight: 36,
              px: 1.5,
              borderRadius: 1,
              "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
            }}
          >
            <ListItemIcon sx={{ minWidth: 0, mr: expanded ? 2 : 0, justifyContent: "center" }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            {expanded && (
              <ListItemText
                primary="Sign out"
                primaryTypographyProps={{ fontSize: 13 }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default function Sidebar({ darkMode, onToggleDarkMode }: SidebarProps) {
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width:768px)");

  if (isMobile) {
    return (
      <ThemeProvider theme={sidebarTheme}>
        {/* Hamburger button */}
        <IconButton
          onClick={() => setMobileOpen(true)}
          sx={{
            position: "fixed",
            top: 10,
            left: 10,
            zIndex: 1300,
            bgcolor: "#1a1a1a",
            color: "#e0e0e0",
            "&:hover": { bgcolor: "#333" },
          }}
        >
          <MenuIcon />
        </IconButton>

        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          PaperProps={{
            sx: { width: EXPANDED_WIDTH, bgcolor: "#1a1a1a" },
          }}
        >
          <SidebarContent
            expanded
            darkMode={darkMode}
            onToggleDarkMode={onToggleDarkMode}
            onClose={() => setMobileOpen(false)}
          />
        </Drawer>
      </ThemeProvider>
    );
  }

  // Desktop: hover-expand sidebar
  const width = hovered ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <ThemeProvider theme={sidebarTheme}>
      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width,
          transition: "width 200ms ease",
          zIndex: 1200,
          bgcolor: "#1a1a1a",
        }}
      >
        <SidebarContent
          expanded={hovered}
          darkMode={darkMode}
          onToggleDarkMode={onToggleDarkMode}
        />
      </Box>
    </ThemeProvider>
  );
}

export { COLLAPSED_WIDTH };
