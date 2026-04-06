import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  GlobalStyles,
} from "@mui/material";
import ScopeSelector from "@/components/insights/ScopeSelector";
import { useAuth } from "@/lib/AuthProvider";
import { signOut } from "@/lib/auth-client";

/** Height of the global header in pixels. */
export const HEADER_HEIGHT = 52;

/**
 * Sticky global header fixed to the top of the viewport.
 *
 * Contains the app name, scope selector (breadcrumb picker),
 * and user avatar with a sign-out menu.
 */
export default function GlobalHeader() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Menu anchor for the user avatar dropdown
  const [avatarAnchor, setAvatarAnchor] = useState<null | HTMLElement>(null);

  const handleSignOut = async () => {
    setAvatarAnchor(null);
    await signOut();
    navigate("/login");
  };

  return (
    <>
      {/* Push body content below the fixed header */}
      <GlobalStyles styles={{ body: { paddingTop: `${HEADER_HEIGHT}px` } }} />

      <Box
        component="header"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: `${HEADER_HEIGHT}px`,
          zIndex: 1300,
          bgcolor: "#26282b", // Campus Web header bg
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
        }}
      >
        {/* ── Left section: App name + Scope selector ────────────── */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flex: 1,
            minWidth: 0,
            // Make breadcrumb text white so it's readable on dark bg
            "& .MuiBreadcrumbs-root": { color: "#fff" },
            "& .MuiButton-root": { color: "#fff" },
            "& .MuiTypography-root": { color: "#fff" },
            "& .MuiSvgIcon-root": { color: "#fff" },
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{ color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            Chat Explorer
          </Typography>
          <ScopeSelector compact />
        </Box>

        {/* ── Right section: User avatar ──────────────────────────── */}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {/* User avatar (opens sign-out menu) */}
          {user && (
            <>
              <IconButton
                onClick={(e) => setAvatarAnchor(e.currentTarget)}
                size="small"
                aria-label="User menu"
                sx={{ p: 0.5 }}
              >
                <Avatar
                  src={user.image ?? undefined}
                  sx={{ width: 30, height: 30, fontSize: 13 }}
                >
                  {user.name?.[0]?.toUpperCase()}
                </Avatar>
              </IconButton>

              <Menu
                anchorEl={avatarAnchor}
                open={Boolean(avatarAnchor)}
                onClose={() => setAvatarAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {/* Show user name / email as a disabled label */}
                <MenuItem disabled>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {user.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {user.email}
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem onClick={handleSignOut}>Sign out</MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Box>
    </>
  );
}
