import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { Box, Typography, Skeleton } from "@mui/material";
import {
  GET_STUDENT_PROFILES,
  GET_ASSIGNMENT_THREADS,
} from "@/lib/queries/explorer";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import ScopeSelector from "@/components/insights/ScopeSelector";
import ThreadView from "@/components/explorer/ThreadView";
import BottomBar from "@/components/explorer/BottomBar";
import ToriFilters from "@/components/explorer/ToriFilters";
import StudentListPanel from "@/components/explorer/StudentListPanel";
import AiChatPanel from "@/components/ai/AiChatPanel";

/**
 * Chat Explorer page — split-screen layout.
 *
 * Left panel: scope breadcrumb (shared with Insights), TORI filters,
 *             student conversation threads, bottom bar with student carousel.
 * Right panel: embedded AI Chat for discussing what you see on the left.
 *
 * Institution / course / assignment selection is shared with the Insights page
 * via the global InsightsScopeProvider in App.tsx — navigating between pages
 * preserves the selected context.
 */
export default function ChatExplorerPage() {
  // ── Shared scope (persists across page navigation) ─────────────────
  const { scope } = useInsightsScope();
  const courseId = scope?.courseId;
  const assignmentId = scope?.assignmentId;

  // ── Local state (specific to this page) ────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [toriFilters, setToriFilters] = useState<string[]>([]);
  const [studentListOpen, setStudentListOpen] = useState(false);

  // Reset student selection and TORI filters whenever the course changes
  const prevCourseIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (courseId !== prevCourseIdRef.current) {
      prevCourseIdRef.current = courseId;
      setSelectedStudentId(null);
      setToriFilters([]);
    }
  }, [courseId]);

  // ── Queries ────────────────────────────────────────────────────────

  // Student profiles for the selected scope
  const { data: studentsData, loading: studentsLoading } = useQuery<any>(
    GET_STUDENT_PROFILES,
    {
      variables: { scope },
      skip: !courseId,
    }
  );
  const studentProfiles =
    studentsData?.instructionalInsights?.data?.studentProfiles ?? [];

  // Thread data (for extracting available TORI tags and rendering threads)
  const { data: threadsData } = useQuery<any>(GET_ASSIGNMENT_THREADS, {
    variables: { courseId },
    skip: !courseId,
  });

  // ── Derived: available TORI tags ───────────────────────────────────
  const availableTags = useMemo(() => {
    if (!threadsData?.assignments) return [];

    const tagMap = new Map<string, { name: string; domain: string; count: number }>();

    for (const assignment of threadsData.assignments) {
      for (const thread of assignment.threads ?? []) {
        for (const comment of thread.comments ?? []) {
          for (const tag of comment.toriTags ?? []) {
            const existing = tagMap.get(tag.name);
            if (existing) {
              existing.count += 1;
            } else {
              tagMap.set(tag.name, {
                name: tag.name,
                domain: tag.domain,
                count: 1,
              });
            }
          }
        }
      }
    }

    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  }, [threadsData]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleToggleToriFilter = useCallback((tagName: string) => {
    setToriFilters((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  }, []);

  const handleClearToriFilters = useCallback(() => {
    setToriFilters([]);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    // Outer wrapper: break out of AppShell's maxWidth/padding to use full viewport.
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        mx: -4,
        mt: -4,
        width: "calc(100% + 64px)",
      }}
    >
      {/* ── TOP AREA: split-screen (left threads + right AI chat) ── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          pb: "60px",
        }}
      >
        {/* ── LEFT PANEL: Student conversation viewer ────────────── */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header + scope breadcrumb */}
          <Box sx={{ px: 3, pt: 3, pb: 1 }}>
            <Typography variant="h5" fontWeight={500} sx={{ mb: 2 }}>
              Chat Explorer
            </Typography>

            {/* Shared breadcrumb: Institution > Course > Assignment */}
            <ScopeSelector />

            {/* TORI tag filter bar (appears once a course is selected) */}
            {availableTags.length > 0 && (
              <ToriFilters
                availableTags={availableTags}
                activeFilters={toriFilters}
                onToggle={handleToggleToriFilter}
                onClear={handleClearToriFilters}
              />
            )}
          </Box>

          {/* Main content: thread view */}
          <Box sx={{ flex: 1, overflowY: "auto", pb: "80px", px: 3 }}>
            {!courseId ? (
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
                <Typography>Select a course to get started.</Typography>
              </Box>
            ) : studentsLoading ? (
              <Box>
                <Skeleton variant="rounded" height={60} sx={{ mb: 1 }} />
                <Skeleton variant="rounded" height={60} sx={{ mb: 1 }} />
                <Skeleton variant="rounded" height={60} />
              </Box>
            ) : (
              <ThreadView
                studentId={selectedStudentId}
                courseId={courseId}
                assignmentId={assignmentId ?? null}
                activeToriFilters={toriFilters}
              />
            )}
          </Box>

          {/* Student list slide-out panel */}
          <StudentListPanel
            open={studentListOpen}
            onClose={() => setStudentListOpen(false)}
            students={studentProfiles}
            selectedId={selectedStudentId}
            onSelect={setSelectedStudentId}
          />
        </Box>

        {/* ── RIGHT PANEL: AI Chat ─────────────────────────────────── */}
        <Box
          sx={{
            width: 420,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <AiChatPanel
            open={true}
            onClose={() => {}}
            courseId={courseId}
            assignmentId={assignmentId}
            anchor="embedded"
          />
        </Box>
      </Box>

      {/* ── BOTTOM BAR: spans full width ───────────────────────────── */}
      <BottomBar
        students={studentProfiles}
        selectedStudentId={selectedStudentId}
        onSelectStudent={setSelectedStudentId}
        onOpenStudentList={() => setStudentListOpen(true)}
        studentListOpen={studentListOpen}
      />
    </Box>
  );
}
