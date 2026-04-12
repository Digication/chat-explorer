import { useParams } from "react-router";
import { Box } from "@mui/material";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

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
  const { scope } = useInsightsScope();

  return (
    <Box sx={{ height: "100%" }}>
      <AiChatPanel
        open={true}
        onClose={() => {
          /* no-op in full-page mode */
        }}
        institutionId={scope?.institutionId}
        courseId={courseId}
        anchor="full"
      />
    </Box>
  );
}
