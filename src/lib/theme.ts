import { createTheme, type SxProps, type Theme } from "@mui/material/styles";

// Digication design tokens
const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SPACING = 5; // 5px spacing unit
const BORDER_RADIUS = 2;
const PRIMARY = "#1976d2"; // Digication primary (from Campus Web)
const MAX_CONTENT_WIDTH = 1063;

// Shared component overrides
const sharedComponents = {
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: "none" as const,
        letterSpacing: 0.45,
      },
    },
  },
  MuiTextField: {
    defaultProps: {
      variant: "standard" as const,
    },
  },
  MuiSvgIcon: {
    styleOverrides: {
      fontSizeMedium: { fontSize: 20 },
      fontSizeSmall: { fontSize: 16 },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: { borderRadius: BORDER_RADIUS },
    },
  },
};

export const lightTheme = createTheme({
  spacing: SPACING,
  shape: { borderRadius: BORDER_RADIUS },
  typography: {
    fontFamily: FONT_FAMILY,
    fontWeightBold: 500,
    button: { textTransform: "none" },
  },
  palette: {
    mode: "light",
    primary: { main: PRIMARY },
    background: {
      default: "#f5f7fa",
      paper: "#ffffff",
    },
    text: { primary: "#333333" },
  },
  components: {
    ...sharedComponents,
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: BORDER_RADIUS },
        elevation1: { boxShadow: "none" },
      },
    },
  },
});

// Sidebar always uses dark theme (matches Campus Web sidebar bg #191a1b)
export const sidebarTheme = createTheme({
  spacing: SPACING,
  shape: { borderRadius: BORDER_RADIUS },
  typography: {
    fontFamily: FONT_FAMILY,
    fontWeightBold: 500,
    button: { textTransform: "none" },
  },
  palette: {
    mode: "dark",
    primary: { main: PRIMARY },
    background: {
      default: "#191a1b", // Campus Web sidebar bg
      paper: "#191a1b",
    },
    text: { primary: "#e0e0e0" },
  },
  components: sharedComponents,
});

// Reusable panel style for content cards
export const panelSx: SxProps<Theme> = {
  backgroundColor: "background.paper",
  borderRadius: `${BORDER_RADIUS}px`,
  p: 4, // 20px (4 * 5px spacing)
  mb: 4,
};

export { MAX_CONTENT_WIDTH };
