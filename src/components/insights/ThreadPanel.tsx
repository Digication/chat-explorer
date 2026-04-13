import React, { useMemo, useState, useCallback, useEffect } from "react";
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
import ToriFilters from "@/components/explorer/ToriFilters";
import { useUserSettings } from "@/lib/UserSettingsContext";

interface ThreadPanelProps {
  threadId: string;
  studentName: string;
  onClose: () => void;
  /** When true, renders as normal-flow component instead of fixed overlay. */
  embedded?: boolean;
  /** When provided, student name in the header becomes clickable. */
  onStudentClick?: (studentId: string, studentName: string) => void;
  /** Student ID — needed for onStudentClick to work. */
  studentId?: string;
  /** Pre-select this TORI tag on mount for highlighting. */
  initialToriTag?: string;
}

export default function ThreadPanel({ threadId, studentName, onClose, embedded, onStudentClick, studentId, initialToriTag }: ThreadPanelProps) {
  const { getDisplayName } = useUserSettings();
  const [activeFilters, setActiveFilters] = useState<string[]>(
    initialToriTag ? [initialToriTag] : []
  );
  const { data, loading, error, refetch } = useQuery<any>(GET_THREAD_BY_ID, {
    variables: { id: threadId },
  });

  const thread = data?.thread;

  // Reset filters when thread changes
  useEffect(() => {
    setActiveFilters(initialToriTag ? [initialToriTag] : []);
  }, [threadId, initialToriTag]);

  // Derive available TORI tags from thread comments
  const availableTags = useMemo(() => {
    if (!thread?.comments) return [];
    const tagCounts = new Map<string, { name: string; domain: string; count: number }>();
    for (const comment of thread.comments) {
      if (comment.role !== "USER") continue;
      for (const tag of comment.toriTags ?? []) {
        const existing = tagCounts.get(tag.name);
        if (existing) {
          existing.count++;
        } else {
          tagCounts.set(tag.name, { name: tag.name, domain: tag.domain, count: 1 });
        }
      }
    }
    return [...tagCounts.values()].sort((a, b) => b.count - a.count);
  }, [thread]);

  const handleToggleFilter = useCallback((tagName: string) => {
    setActiveFilters((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  }, []);

  const handleClearFilters = useCallback(() => setActiveFilters([]), []);

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <Box
      sx={
        embedded
          ? {
              display: "flex",
              flexDirection: "column",
              height: "100%",
              bgcolor: "background.paper",
            }
          : {
              position: "fixed",
              top: 52,
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
            }
      }
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
          <Typography
            variant="subtitle1"
            fontWeight={700}
            noWrap
            sx={{
              ...(onStudentClick && studentId
                ? { cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }
                : {}),
            }}
            onClick={() => {
              if (onStudentClick && studentId) onStudentClick(studentId, studentName);
            }}
          >
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

      {/* TORI tag filter bar */}
      {availableTags.length > 0 && (
        <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}>
          <ToriFilters
            availableTags={availableTags}
            activeFilters={activeFilters}
            onToggle={handleToggleFilter}
            onClear={handleClearFilters}
          />
        </Box>
      )}

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

        {/* Comments — highlight/dim based on active TORI filters */}
        {thread?.comments?.map((comment: any) => {
          const commentTags = (comment.toriTags ?? []).map((t: any) => t.name);
          const matches = hasActiveFilters && commentTags.some((t: string) => activeFilters.includes(t));
          return (
            <Box
              key={comment.id}
              sx={{
                opacity: hasActiveFilters && !matches ? 0.3 : 1,
                transition: "opacity 0.2s",
                ...(matches ? { borderLeft: "3px solid", borderColor: "primary.main", pl: 1, ml: -1 } : {}),
              }}
            >
              <CommentCard comment={comment} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
