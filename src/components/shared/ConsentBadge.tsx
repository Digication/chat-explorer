import { Chip } from "@mui/material";

/** Color map for each consent status. */
const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  included: { label: "Included", bg: "#e8f5e9", color: "#2e7d32" },
  excluded: { label: "Excluded", bg: "#ffebee", color: "#c62828" },
  partial: { label: "Partial", bg: "#fff8e1", color: "#f57f17" },
};

interface ConsentBadgeProps {
  /** The consent status to display. */
  status: "included" | "excluded" | "partial";
}

/**
 * Small colored chip showing consent status.
 * Green for included, red for excluded, yellow for partial.
 */
export default function ConsentBadge({ status }: ConsentBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        backgroundColor: config.bg,
        color: config.color,
        fontWeight: 500,
        fontSize: "0.75rem",
      }}
    />
  );
}
