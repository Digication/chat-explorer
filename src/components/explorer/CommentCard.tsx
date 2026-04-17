import { Typography, Box } from "@mui/material";
import ToriChip from "@/components/shared/ToriChip";
import { decodeEntities } from "@/lib/decode-entities";
import { useUserSettings } from "@/lib/UserSettingsContext";

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
  const isUser = comment.role === "USER";

  // Format the timestamp if available
  const formattedTime = comment.timestamp
    ? new Date(comment.timestamp).toLocaleString()
    : null;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 2,
        opacity: dimmed ? 0.4 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <Box sx={{ maxWidth: "85%", minWidth: isUser ? "40%" : undefined }}>
        {/* Student name + timestamp above the bubble */}
        {(isUser && comment.student?.displayName || formattedTime) && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 0.5,
              px: 0.5,
              justifyContent: isUser ? "flex-end" : "flex-start",
            }}
          >
            {isUser && comment.student?.displayName && (
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                {getDisplayName(comment.student.displayName)}
              </Typography>
            )}
            {formattedTime && (
              <Typography variant="caption" color="text.disabled">
                {formattedTime}
              </Typography>
            )}
          </Box>
        )}

        {/* Message bubble: students get a gray bubble, AI is plain */}
        <Box
          sx={{
            p: 2,
            borderRadius: isUser ? 6 : 2,
            bgcolor: isUser ? "grey.200" : "transparent",
            borderLeft: highlighted ? "3px solid" : "3px solid transparent",
            borderLeftColor: highlighted ? "primary.main" : "transparent",
          }}
        >
          {/* Comment text */}
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
          >
            {decodeEntities(comment.text)}
          </Typography>

          {/* TORI tags (only shown on USER role comments) */}
          {isUser && comment.toriTags.length > 0 && (
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
        </Box>
      </Box>
    </Box>
  );
}
