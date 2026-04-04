import React from "react";
import { useLazyQuery } from "@apollo/client/react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Popover from "@mui/material/Popover";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_HEATMAP_CELL_EVIDENCE } from "@/lib/queries/analytics";

interface EvidencePopoverProps {
  anchorEl: HTMLElement | null;
  studentId: string;
  studentName: string;
  toriTagId: string;
  toriTagName: string;
  count: number;
  scope: { institutionId: string; courseId?: string; assignmentId?: string };
  onClose: () => void;
  onViewThread: (threadId: string, studentName: string) => void;
}

interface EvidenceItem {
  commentId: string;
  text: string;
  threadId: string;
  threadName: string;
  timestamp: string | null;
}

export default function EvidencePopover({
  anchorEl,
  studentId,
  studentName,
  toriTagId,
  toriTagName,
  count,
  scope,
  onClose,
  onViewThread,
}: EvidencePopoverProps) {
  const [fetchEvidence, { data, loading, called }] =
    useLazyQuery<{ heatmapCellEvidence: EvidenceItem[] }>(GET_HEATMAP_CELL_EVIDENCE);

  // Fetch evidence on mount
  React.useEffect(() => {
    if (anchorEl && !called) {
      fetchEvidence({
        variables: {
          input: { scope, studentId, toriTagId },
        },
      });
    }
  }, [anchorEl, called, fetchEvidence, scope, studentId, toriTagId]);

  const evidence = data?.heatmapCellEvidence ?? [];

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{
        paper: {
          sx: { maxWidth: 400, maxHeight: 400, p: 2 },
        },
      }}
    >
      {/* Header */}
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {toriTagName}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        {studentName} — {count} mention{count !== 1 ? "s" : ""}
      </Typography>

      {/* Loading state */}
      {loading && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </Box>
      )}

      {/* Evidence list */}
      {!loading && evidence.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          No evidence found.
        </Typography>
      )}

      {!loading && evidence.length > 0 && (
        <Box
          sx={{
            maxHeight: 280,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          {evidence.map((item) => (
            <Box
              key={item.commentId}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: "grey.50",
                borderLeft: "3px solid",
                borderColor: "primary.main",
              }}
            >
              {/* Truncated quote */}
              <Typography variant="body2" sx={{ mb: 0.5, lineHeight: 1.5 }}>
                "{item.text.length > 200
                  ? item.text.slice(0, 200) + "…"
                  : item.text}"
              </Typography>

              {/* Thread name + timestamp */}
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">
                  {item.threadName}
                </Typography>
                {item.timestamp && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {new Date(item.timestamp).toLocaleDateString()}
                  </Typography>
                )}
              </Box>

              {/* View full conversation link */}
              <Link
                component="button"
                variant="caption"
                sx={{ mt: 0.5, display: "inline-block" }}
                onClick={() => {
                  onViewThread(item.threadId, studentName);
                  onClose();
                }}
              >
                View full conversation →
              </Link>
            </Box>
          ))}
        </Box>
      )}
    </Popover>
  );
}
