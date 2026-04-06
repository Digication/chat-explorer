import React from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { GET_THREAD_BY_ID } from "@/lib/queries/explorer";
import CommentCard from "@/components/explorer/CommentCard";
import { useUserSettings } from "@/lib/UserSettingsContext";

interface ThreadPanelProps {
  threadId: string;
  studentName: string;
  onClose: () => void;
}

export default function ThreadPanel({ threadId, studentName, onClose }: ThreadPanelProps) {
  const { getDisplayName } = useUserSettings();
  const { data, loading, error, refetch } = useQuery<any>(GET_THREAD_BY_ID, {
    variables: { id: threadId },
  });

  const thread = data?.thread;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 52, // below GlobalHeader (HEADER_HEIGHT)
        right: 0,
        bottom: 0,
        width: 420,
        zIndex: 1100,
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        boxShadow: 6,
      }}
    >
      {/* Sticky header */}
      <Box
        sx={{
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {getDisplayName(studentName)}
          </Typography>
          {thread && (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {thread.name}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close thread panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body — scrollable */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        {/* Loading state */}
        {loading && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={80} />
            ))}
          </Box>
        )}

        {/* Error state */}
        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            Failed to load conversation.
          </Alert>
        )}

        {/* Thread not found */}
        {!loading && !error && !thread && (
          <Typography variant="body2" color="text.secondary">
            Thread not found.
          </Typography>
        )}

        {/* Comments */}
        {thread?.comments?.map((comment: any) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </Box>
    </Box>
  );
}
