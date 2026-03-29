import { Card, CardContent, Typography, Box, Chip } from "@mui/material";
import ToriChip from "@/components/shared/ToriChip";

/** Background colors per comment role. */
const ROLE_BG: Record<string, string> = {
  USER: "#e3f2fd",
  ASSISTANT: "#f3e5f5",
  SYSTEM: "#e8f5e9",
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
}

/**
 * Displays a single chat comment with role-based styling,
 * student name, timestamp, and TORI tag chips.
 */
export default function CommentCard({
  comment,
  highlighted = false,
  dimmed = false,
}: CommentCardProps) {
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
        borderLeft: highlighted ? "3px solid #1976d2" : "3px solid transparent",
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
              {comment.student.displayName}
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
          {comment.text}
        </Typography>

        {/* TORI tags (only shown on USER role comments) */}
        {comment.role === "USER" && comment.toriTags.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
            {comment.toriTags.map((tag) => (
              <ToriChip key={tag.id} tag={tag.name} domain={tag.domain} />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
