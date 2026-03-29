import { Avatar } from "@mui/material";

/** Eight-color palette for deterministic avatar coloring. */
const PALETTE = [
  "#1976d2", // blue
  "#388e3c", // green
  "#d32f2f", // red
  "#7b1fa2", // purple
  "#f57c00", // orange
  "#0097a7", // teal
  "#5d4037", // brown
  "#455a64", // blue-grey
];

/** Simple string hash to pick a palette index. */
function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/** Extract initials from a name (first letter of first and last word). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (
    (parts[0][0] ?? "").toUpperCase() +
    (parts[parts.length - 1][0] ?? "").toUpperCase()
  );
}

/** Size presets in pixels. */
const SIZE_MAP = { small: 28, medium: 36, large: 48 } as const;

interface UserAvatarProps {
  /** Full name of the user. */
  name: string;
  /** Avatar size preset. */
  size?: "small" | "medium" | "large";
  /** Whether this avatar is selected (shows a primary-colored ring). */
  selected?: boolean;
}

/**
 * Initial-based avatar with a deterministic background color
 * derived from the user's name. Shows a ring when selected.
 */
export default function UserAvatar({
  name,
  size = "medium",
  selected = false,
}: UserAvatarProps) {
  const px = SIZE_MAP[size];
  const bgColor = PALETTE[hashName(name) % PALETTE.length];
  const initials = getInitials(name);

  return (
    <Avatar
      sx={{
        width: px,
        height: px,
        fontSize: px * 0.4,
        backgroundColor: bgColor,
        fontWeight: 600,
        // Primary-colored ring when selected
        border: selected ? "2px solid #1976d2" : "2px solid transparent",
        boxSizing: "border-box",
      }}
    >
      {initials}
    </Avatar>
  );
}
