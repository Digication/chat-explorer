import React from "react";
import { useLazyQuery } from "@apollo/client/react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Popover from "@mui/material/Popover";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_HEATMAP_CELL_EVIDENCE } from "@/lib/queries/analytics";
import { decodeEntities } from "@/lib/decode-entities";
import { useUserSettings } from "@/lib/UserSettingsContext";

const PAGE_SIZE = 20;

interface EvidencePopoverProps {
  anchorEl: HTMLElement | null;
  studentId?: string;
  studentName?: string;
  toriTagId?: string;
  toriTagName?: string;
  count?: number;
  scope: { institutionId: string; courseId?: string; assignmentId?: string };
  onClose: () => void;
  onViewThread: (threadId: string, studentName: string, studentId?: string, initialToriTag?: string) => void;
  onStudentClick?: (studentId: string, studentName: string) => void;
}

interface EvidenceItem {
  commentId: string;
  text: string;
  threadId: string;
  threadName: string;
  studentId: string | null;
  studentName: string | null;
  timestamp: string | null;
}

interface EvidenceResult {
  items: EvidenceItem[];
  totalCount: number;
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
  onStudentClick,
}: EvidencePopoverProps) {
  const { getDisplayName } = useUserSettings();
  const [accumulated, setAccumulated] = React.useState<EvidenceItem[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);

  const [fetchEvidence, { loading }] = useLazyQuery<{
    heatmapCellEvidence: EvidenceResult;
  }>(GET_HEATMAP_CELL_EVIDENCE, {
    fetchPolicy: "network-only", // Always fetch fresh data for each cell
  });

  /** Fetches a page; if `append` is true, adds to accumulated, otherwise replaces. */
  const fetchPage = React.useCallback(
    async (offset: number, append: boolean) => {
      const resp = await fetchEvidence({
        variables: {
          input: { scope, studentId, toriTagId, toriTagName: toriTagId ? undefined : toriTagName, limit: PAGE_SIZE, offset },
        },
      });
      const result = resp?.data?.heatmapCellEvidence;
      if (!result) return;
      setTotalCount(result.totalCount);
      if (append) {
        setAccumulated((prev) => {
          const seen = new Set(prev.map((p) => p.commentId));
          const fresh = result.items.filter(
            (item: EvidenceItem) => !seen.has(item.commentId)
          );
          return [...prev, ...fresh];
        });
      } else {
        setAccumulated(result.items);
      }
    },
    [fetchEvidence, scope, studentId, toriTagId, toriTagName]
  );

  // Reset and fetch a fresh first page whenever the target cell changes.
  React.useEffect(() => {
    if (anchorEl) {
      setAccumulated([]);
      setTotalCount(0);
      void fetchPage(0, false);
    }
  }, [anchorEl, fetchPage]);

  const evidence = accumulated;
  const hasMore = evidence.length < totalCount;

  const loadMore = () => {
    void fetchPage(evidence.length, true);
  };

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
      <Typography
        variant="subtitle2"
        fontWeight={700}
        gutterBottom
        {...(!toriTagName && studentName && onStudentClick && studentId ? {
          component: "div",
          sx: { cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } },
          onClick: () => { onStudentClick(studentId, studentName); onClose(); },
        } : {})}
      >
        {toriTagName || (studentName ? getDisplayName(studentName) : null) || "Evidence"}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" component="div" sx={{ mb: 1.5 }}>
        {studentName && toriTagName && (
          <>
            {onStudentClick && studentId ? (
              <Typography
                component="span"
                variant="caption"
                sx={{ cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}
                onClick={() => { onStudentClick(studentId, studentName); onClose(); }}
              >
                {getDisplayName(studentName)}
              </Typography>
            ) : (
              getDisplayName(studentName)
            )}
            {" — "}
          </>
        )}
        {totalCount > 0
          ? `${totalCount} mention${totalCount !== 1 ? "s" : ""}`
          : count != null
          ? `${count} mention${count !== 1 ? "s" : ""}`
          : !studentName || !toriTagName ? "Matching comments" : null}
      </Typography>

      {/* Initial loading state — only when nothing is loaded yet. */}
      {loading && evidence.length === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </Box>
      )}

      {/* Empty state */}
      {!loading && evidence.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          No evidence found.
        </Typography>
      )}

      {/* Evidence list */}
      {evidence.length > 0 && (
        <Box
          sx={{
            maxHeight: 320,
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
                bgcolor: "action.hover",
                borderLeft: "3px solid",
                borderColor: "primary.main",
              }}
            >
              {/* Student name (shown when evidence spans multiple students) */}
              {!studentId && item.studentName && (
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{
                    mb: 0.5,
                    display: "block",
                    ...(onStudentClick && item.studentId
                      ? { cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }
                      : { color: "text.secondary" }),
                  }}
                  onClick={() => {
                    if (onStudentClick && item.studentId) {
                      onStudentClick(item.studentId, item.studentName!);
                      onClose();
                    }
                  }}
                >
                  {getDisplayName(item.studentName)}
                </Typography>
              )}

              {/* Truncated quote */}
              <Typography variant="body2" sx={{ mb: 0.5, lineHeight: 1.5 }}>
                "{(() => { const t = decodeEntities(item.text); return t.length > 200 ? t.slice(0, 200) + "…" : t; })()}"
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
                  onViewThread(item.threadId, item.studentName || studentName || "Student", item.studentId ?? undefined, toriTagName);
                  onClose();
                }}
              >
                View full conversation →
              </Link>
            </Box>
          ))}
        </Box>
      )}

      {/* Pagination footer: "Showing N of M" + Load more */}
      {evidence.length > 0 && totalCount > 0 && (
        <Box
          sx={{
            mt: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Showing {evidence.length} of {totalCount}
          </Typography>
          {hasMore && (
            <Button
              size="small"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
        </Box>
      )}
    </Popover>
  );
}
