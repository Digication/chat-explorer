import { Box, Typography, keyframes } from "@mui/material";
import ReactMarkdown from "react-markdown";

/** Shape of a chat message used by this component. */
interface ChatMessageData {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ChatMessageBubbleProps {
  /** The message to display. */
  message: ChatMessageData;
  /** When true, shows an animated typing indicator instead of content. */
  isTyping?: boolean;
}

/** Simple bounce animation for the typing dots. */
const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
`;

/** Formats a date string into a short, readable timestamp. */
function formatTimestamp(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Displays a single chat message bubble.
 *
 * - User messages appear on the right with a blue background.
 * - Assistant messages appear on the left with a grey background
 *   and render content as markdown.
 */
export default function ChatMessageBubble({ message, isTyping }: ChatMessageBubbleProps) {
  const isUser = message.role === "USER";
  const isSystem = message.role === "SYSTEM";

  // SYSTEM messages render as centered dividers
  if (isSystem) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 1.5, px: 2 }}>
        <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {message.content}
        </Typography>
        <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 2,
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: "min(85%, 520px)", minWidth: isUser ? "40%" : undefined }}>
        {/* The bubble — user gets a gray rounded bubble, assistant is plain */}
        <Box
          sx={{
            p: 2,
            borderRadius: isUser ? 6 : 2,
            bgcolor: isUser ? "grey.200" : "transparent",
            color: "text.primary",
            // Markdown content styling
            "& p": { m: 0 },
            "& p + p": { mt: 1 },
            "& code": {
              fontSize: "0.85em",
              bgcolor: "grey.100",
              px: 0.5,
              borderRadius: "4px",
            },
            "& pre": {
              bgcolor: "grey.100",
              p: 1,
              borderRadius: "4px",
              overflowX: "auto",
              "& code": { bgcolor: "transparent", px: 0 },
            },
          }}
        >
          {isTyping ? (
            /* Animated typing dots */
            <Box sx={{ display: "flex", gap: 0.5, py: 0.5 }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "text.secondary",
                    animation: `${bounce} 1.2s ease-in-out infinite`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </Box>
          ) : isUser ? (
            /* User messages are plain text */
            <Typography variant="body2">{message.content}</Typography>
          ) : (
            /* Assistant messages render markdown */
            <Typography variant="body2" component="div">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </Typography>
          )}
        </Box>

        {/* Timestamp below the bubble */}
        {!isTyping && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{
              display: "block",
              mt: 0.25,
              textAlign: isUser ? "right" : "left",
              px: 0.5,
            }}
          >
            {formatTimestamp(message.createdAt)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
