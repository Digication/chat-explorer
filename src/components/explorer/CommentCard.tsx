import { Card, CardContent, Typography, Box, Chip } from "@mui/material";
import ToriChip from "@/components/shared/ToriChip";
import { decodeEntities } from "@/lib/decode-entities";
import { useUserSettings } from "@/lib/UserSettingsContext";

/** Background colors per comment role — aligned with Digication palette. */
const ROLE_BG: Record<string, string> = {
  USER: "#e3f2fd",      // light blue tint (near Digication primary)
  ASSISTANT: "#f5f5f5",  // neutral light gray
  SYSTEM: "#fafafa",     // very light gray
};

/** Friendly labels per role. */
const ROLE_LABEL: Record<string, string> = {
  USER: "Student",
  ASSISTANT: "AI Assistant",
  SYSTEM: "System",
};

interface ToriTag {
  id: string;
  name: string;
  domain: string;
}

interface CommentData {
  id: string;
  role: string;
  text: string;
  timestamp?: string;
  student?: { displayName: string } | null;
  toriTags: ToriTag[];
}

interface CommentCardProps {
  /** The comment data to display. */
  comment: CommentData;
  /** Whether this comment matches the active TORI filters. */
  highlighted?: boolean;
  /** Whether this comment should appear faded. */
  dimmed?: boolean;
  /** Called when a TORI tag chip is clicked (passes tag name to AI chat context). */
  onToriTagClick?: (tagName: string) => void;
}

/**
 * Displays a single chat comment with role-based styling,
 * student name, timestamp, and TORI tag chips.
 */
export default function CommentCard({
  comment,
  highlighted = false,
  dimmed = false,
  onToriTagClick,
}: CommentCardProps) {
  const { getDisplayName } = useUserSettings();
  const bg = ROLE_BG[comment.role] ?? "#fafafa";
  const roleLabel = ROLE_LABEL[comment.role] ?? comment.role;

  // Format the timestamp if available
  const formattedTime = comment.timestamp
    ? new Date(comment.timestamp).toLocaleString()
    : null;

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        opacity: dimmed ? 0.4 : 1,
        borderLeft: highlighted ? "3px solid" : "3px solid transparent",
        borderLeftColor: highlighted ? "primary.main" : "transparent",
        backgroundColor: bg,
        transition: "opacity 0.2s",
      }}
    >
      <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
        {/* Header row: role label, student name, timestamp */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 0.5,
          }}
        >
          <Chip
            label={roleLabel}
            size="small"
            sx={{ fontWeight: 600, fontSize: "0.7rem", height: 20 }}
          />
          {comment.role === "USER" && comment.student?.displayName && (
            <Typography variant="caption" fontWeight={500}>
              {getDisplayName(comment.student.displayName)}
            </Typography>
          )}
          {formattedTime && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: "auto" }}
            >
              {formattedTime}
            </Typography>
          )}
        </Box>

        {/* Comment text */}
        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
        >
          {decodeEntities(comment.text)}
        </Typography>

        {/* TORI tags (only shown on USER role comments) */}
        {comment.role === "USER" && comment.toriTags.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
            {comment.toriTags.map((tag) => (
              <ToriChip
                key={tag.id}
                tag={tag.name}
                domain={tag.domain}
                onClick={onToriTagClick ? () => onToriTagClick(tag.name) : undefined}
              />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
