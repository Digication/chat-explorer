import { useParams } from "react-router";
import { Box } from "@mui/material";
import AiChatPanel from "@/components/ai/AiChatPanel";

/**
 * Dedicated full-page AI chat view.
 *
 * Renders AiChatPanel in "full" mode with a session sidebar on the left
 * and the chat area on the right. If a courseId is present in the URL,
 * it scopes the sessions to that course.
 */
export default function AiChatPage() {
  // Pick up an optional courseId from the URL (e.g. /chat/:courseId)
  const { courseId } = useParams<{ courseId?: string }>();

  return (
    <Box sx={{ height: "100%" }}>
      <AiChatPanel
        open={true}
        onClose={() => {
          /* no-op in full-page mode */
        }}
        courseId={courseId}
        anchor="full"
      />
    </Box>
  );
}
