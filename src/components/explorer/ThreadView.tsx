import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Divider,
} from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { GET_ASSIGNMENT_THREADS } from "@/lib/queries/explorer";
import CommentCard from "@/components/explorer/CommentCard";

interface ThreadViewProps {
  /** The selected student IDs (empty = none selected). */
  studentIds: string[];
  /** The selected course ID. */
  courseId: string | null;
  /** The selected assignment ID (optional filter). */
  assignmentId: string | null;
  /** Currently active TORI tag filter names. */
  activeToriFilters: string[];
  /** Called when a TORI tag chip is clicked in a comment. */
  onToriTagClick?: (tagName: string) => void;
}

/**
 * Main content area showing conversation threads for a selected student.
 * Fetches thread data, filters to the student's threads, and highlights
 * comments that match active TORI filters.
 */
export default function ThreadView({
  studentIds,
  courseId,
  assignmentId,
  activeToriFilters,
  onToriTagClick,
}: ThreadViewProps) {
  // Fetch threads when we have a courseId
  const { data, loading, error } = useQuery<any>(GET_ASSIGNMENT_THREADS, {
    variables: { courseId },
    skip: !courseId,
  });

  // Filter assignments and threads to only those containing selected students
  const filteredAssignments = useMemo(() => {
    if (!data?.assignments || studentIds.length === 0) return [];

    const idSet = new Set(studentIds);

    return data.assignments
      .map((assignment: any) => {
        // If an assignmentId filter is set, skip non-matching assignments
        if (assignmentId && assignment.id !== assignmentId) return null;

        // Keep only threads that contain at least one comment from a selected student
        const threads = (assignment.threads ?? []).filter((thread: any) =>
          thread.comments?.some(
            (c: any) => idSet.has(c.studentId) || idSet.has(c.student?.id)
          )
        );

        if (threads.length === 0) return null;
        return { ...assignment, threads };
      })
      .filter(Boolean);
  }, [data, studentIds, assignmentId]);

  // Empty state: no student selected
  if (studentIds.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          minHeight: 300,
          color: "text.secondary",
        }}
      >
        <ChatBubbleOutlineIcon sx={{ fontSize: 48, mb: 2, opacity: 0.4 }} />
        <Typography>
          Select a student from the bottom bar to view their conversations
        </Typography>
      </Box>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={80}
            sx={{ mb: 1.5 }}
          />
        ))}
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load threads: {error.message}
      </Alert>
    );
  }

  // No threads found
  if (filteredAssignments.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          minHeight: 300,
          color: "text.secondary",
        }}
      >
        <Typography>No conversations found for this student.</Typography>
      </Box>
    );
  }

  // Check if a comment matches the active TORI filters
  const hasActiveFilters = activeToriFilters.length > 0;
  const commentMatchesFilter = (comment: any): boolean => {
    if (!hasActiveFilters) return false;
    return comment.toriTags?.some((t: any) =>
      activeToriFilters.includes(t.name)
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      {filteredAssignments.map((assignment: any) => (
        <Box key={assignment.id} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            {assignment.name}
          </Typography>

          {assignment.threads.map((thread: any) => (
            <Box key={thread.id} sx={{ mb: 2 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                Thread: {thread.name || thread.externalId || thread.id}
              </Typography>

              {/* Sort comments by orderIndex, then render */}
              {[...(thread.comments ?? [])]
                .sort(
                  (a: any, b: any) =>
                    (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
                )
                .map((comment: any) => {
                  const matches = commentMatchesFilter(comment);
                  return (
                    <CommentCard
                      key={comment.id}
                      comment={comment}
                      highlighted={matches}
                      dimmed={hasActiveFilters && !matches}
                      onToriTagClick={onToriTagClick}
                    />
                  );
                })}

              <Divider sx={{ mt: 1 }} />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
