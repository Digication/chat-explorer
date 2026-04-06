import { Chip } from "@mui/material";

/** Maps a TORI domain name to a color. */
const DOMAIN_COLORS: Record<string, string> = {
  "Cognitive-Analytical": "#0288D1",
  "Emotional-Affective": "#c62828",
  "Social-Interpersonal": "#2e7d32",
  "Personal Growth": "#7b1fa2",
  "Cultural-Ethical-Contextual": "#e65100",
  "Life Transitions": "#00695c",
};

/** Returns the color for a given TORI domain, or grey if unknown. */
function getColor(domain?: string): string {
  if (!domain) return "#757575";
  return DOMAIN_COLORS[domain] ?? "#757575";
}

interface ToriChipProps {
  /** The tag label to display. */
  tag: string;
  /** The TORI domain, used for color coding. */
  domain?: string;
  /** Whether the chip is highlighted (filled vs outlined). */
  highlighted?: boolean;
  /** Click handler. */
  onClick?: () => void;
  /** Chip size. */
  size?: "small" | "medium";
}

/**
 * A styled MUI Chip for displaying a single TORI tag.
 * Color is determined by the tag's domain.
 */
export default function ToriChip({
  tag,
  domain,
  highlighted = false,
  onClick,
  size = "small",
}: ToriChipProps) {
  const color = getColor(domain);

  return (
    <Chip
      label={tag}
      size={size}
      variant={highlighted ? "filled" : "outlined"}
      onClick={onClick}
      sx={{
        borderColor: color,
        color: highlighted ? "#fff" : color,
        backgroundColor: highlighted ? color : "transparent",
        fontWeight: 500,
        fontSize: size === "small" ? "0.75rem" : "0.8125rem",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick
          ? { backgroundColor: highlighted ? color : `${color}14` }
          : {},
      }}
    />
  );
}
