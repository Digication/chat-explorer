import React from "react";
import { useLazyQuery } from "@apollo/client/react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Popover from "@mui/material/Popover";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_MULTI_TAG_EVIDENCE } from "@/lib/queries/analytics";
import { decodeEntities } from "@/lib/decode-entities";
import { useUserSettings } from "@/lib/UserSettingsContext";

const PAGE_SIZE = 20;

interface MultiTagEvidencePopoverProps {
  anchorEl: HTMLElement | null;
  tagNames: string[];
  tagIds: string[];
  scope: { institutionId: string; courseId?: string; assignmentId?: string };
  onClose: () => void;
  onViewThread?: (threadId: string, studentName: string, studentId?: string, initialToriTag?: string) => void;
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

export default function MultiTagEvidencePopover({
  anchorEl,
  tagNames,
  tagIds,
  scope,
  onClose,
  onViewThread,
  onStudentClick,
}: MultiTagEvidencePopoverProps) {
  const { getDisplayName } = useUserSettings();
  const [accumulated, setAccumulated] = React.useState<EvidenceItem[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);

  const [fetchEvidence, { loading }] = useLazyQuery<{
    multiTagEvidence: { items: EvidenceItem[]; totalCount: number };
  }>(GET_MULTI_TAG_EVIDENCE, { fetchPolicy: "network-only" });

  const fetchPage = React.useCallback(
    async (offset: number, append: boolean) => {
      const resp = await fetchEvidence({
        variables: {
          input: { scope, toriTagIds: tagIds, limit: PAGE_SIZE, offset },
        },
      });
      const result = resp?.data?.multiTagEvidence;
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
    [fetchEvidence, scope, tagIds]
  );

  React.useEffect(() => {
    if (anchorEl && tagIds.length > 0) {
      setAccumulated([]);
      setTotalCount(0);
      void fetchPage(0, false);
    }
  }, [anchorEl, fetchPage]);

  const evidence = accumulated;
  const hasMore = evidence.length < totalCount;

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{ paper: { sx: { maxWidth: 420, maxHeight: 420, p: 2 } } }}
    >
      {/* Header: show tag chips */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", mb: 0.5 }}>
        {tagNames.map((name, i) => (
          <React.Fragment key={name}>
            {i > 0 && <Typography variant="caption" color="text.secondary">&amp;</Typography>}
            <Chip label={name} size="small" color="primary" variant="outlined" />
          </React.Fragment>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        {totalCount > 0 ? `${totalCount} comment${totalCount !== 1 ? "s" : ""} with all tags` : "Matching comments"}
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
              sx={{ p: 1.5, borderRadius: 1, bgcolor: "action.hover", borderLeft: "3px solid", borderColor: "primary.main" }}
            >
              {item.studentName && (
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{
                    mb: 0.5, display: "block",
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
              {onViewThread && (
                <Link
                  component="button"
                  variant="caption"
                  sx={{ mt: 0.5, display: "inline-block" }}
                  onClick={() => { onViewThread(item.threadId, item.studentName || "Student", item.studentId ?? undefined, tagNames[0]); onClose(); }}
                >
                  View full conversation →
                </Link>
              )}
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
