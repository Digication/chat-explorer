import React from "react";
import { useLazyQuery } from "@apollo/client/react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Popover from "@mui/material/Popover";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_CATEGORY_EVIDENCE } from "@/lib/queries/analytics";
import { decodeEntities } from "@/lib/decode-entities";
import { CATEGORY_LABELS } from "@/lib/reflection-categories";

const PAGE_SIZE = 20;

interface CategoryEvidencePopoverProps {
  anchorEl: HTMLElement | null;
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentName: string;
  category: string;
  scope: { institutionId: string; courseId?: string; assignmentId?: string };
  onClose: () => void;
  onViewThread: (threadId: string, studentName: string) => void;
}

interface CategoryEvidenceItem {
  commentId: string;
  text: string;
  threadId: string;
  threadName: string;
  category: string;
  evidenceQuote: string | null;
  timestamp: string | null;
}

export default function CategoryEvidencePopover({
  anchorEl,
  studentId,
  studentName,
  assignmentId,
  assignmentName,
  category,
  scope,
  onClose,
  onViewThread,
}: CategoryEvidencePopoverProps) {
  const [accumulated, setAccumulated] = React.useState<CategoryEvidenceItem[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);

  const [fetchEvidence, { loading }] = useLazyQuery<{
    categoryEvidence: { items: CategoryEvidenceItem[]; totalCount: number };
  }>(GET_CATEGORY_EVIDENCE, { fetchPolicy: "network-only" });

  const fetchPage = React.useCallback(
    async (offset: number, append: boolean) => {
      const resp = await fetchEvidence({
        variables: {
          input: { scope, studentId, assignmentId, category, limit: PAGE_SIZE, offset },
        },
      });
      const result = resp?.data?.categoryEvidence;
      if (!result) return;
      setTotalCount(result.totalCount);
      if (append) {
        setAccumulated((prev) => {
          const seen = new Set(prev.map((p) => p.commentId));
          return [...prev, ...result.items.filter((item) => !seen.has(item.commentId))];
        });
      } else {
        setAccumulated(result.items);
      }
    },
    [fetchEvidence, scope, studentId, assignmentId, category]
  );

  React.useEffect(() => {
    if (anchorEl) {
      setAccumulated([]);
      setTotalCount(0);
      void fetchPage(0, false);
    }
  }, [anchorEl, fetchPage]);

  const evidence = accumulated;
  const hasMore = evidence.length < totalCount;
  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{ paper: { sx: { maxWidth: 400, maxHeight: 400, p: 2 } } }}
    >
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {categoryLabel}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        {[studentName, assignmentName, totalCount > 0 ? `${totalCount} comment${totalCount !== 1 ? "s" : ""}` : null]
          .filter(Boolean)
          .join(" — ")}
      </Typography>

      {loading && evidence.length === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </Box>
      )}

      {!loading && evidence.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          No evidence found.
        </Typography>
      )}

      {evidence.length > 0 && (
        <Box sx={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
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
              {item.evidenceQuote && (
                <Typography variant="caption" color="primary.main" fontStyle="italic" display="block" sx={{ mb: 0.5 }}>
                  "{item.evidenceQuote}"
                </Typography>
              )}
              <Typography variant="body2" sx={{ mb: 0.5, lineHeight: 1.5 }}>
                "{(() => { const t = decodeEntities(item.text); return t.length > 200 ? t.slice(0, 200) + "…" : t; })()}"
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">{item.threadName}</Typography>
                {item.timestamp && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {new Date(item.timestamp).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
              <Link
                component="button"
                variant="caption"
                sx={{ mt: 0.5, display: "inline-block" }}
                onClick={() => { onViewThread(item.threadId, studentName); onClose(); }}
              >
                View full conversation →
              </Link>
            </Box>
          ))}
        </Box>
      )}

      {evidence.length > 0 && totalCount > 0 && (
        <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Showing {evidence.length} of {totalCount}
          </Typography>
          {hasMore && (
            <Button size="small" onClick={() => fetchPage(evidence.length, true)} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
        </Box>
      )}
    </Popover>
  );
}
