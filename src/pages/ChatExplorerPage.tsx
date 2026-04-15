import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { useTrackEvent } from "@/lib/hooks/useTrackEvent";
import { Box, Typography, Skeleton } from "@mui/material";
import {
  GET_STUDENT_PROFILES,
  GET_ASSIGNMENT_THREADS,
} from "@/lib/queries/explorer";
import { GET_COURSES } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useFacultyPanel } from "@/components/faculty-panel/FacultyPanelContext";
import ThreadView from "@/components/explorer/ThreadView";
import BottomBar from "@/components/explorer/BottomBar";
import ToriFilters from "@/components/explorer/ToriFilters";
import StudentListPanel from "@/components/explorer/StudentListPanel";

/**
 * Chat Explorer page — thread viewer with bottom bar.
 *
 * The AI Chat panel has moved to the global Faculty Panel (AppShell).
 * The "Analyze" button in the bottom bar opens the Faculty Panel's Chat tab.
 */
export default function ChatExplorerPage() {
  // ── Shared scope (persists across page navigation) ──���──────────────
  const { scope, setScope } = useInsightsScope();
  const trackEvent = useTrackEvent();
  const courseId = scope?.courseId;
  const assignmentId = scope?.assignmentId;
  const panel = useFacultyPanel();

  // ── Local state (specific to this page) ────────────────────────────
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [toriFilters, setToriFilters] = useState<string[]>([]);
  const [studentListOpen, setStudentListOpen] = useState(false);
  // TORI tags clicked in chat comments — passed as context to AI chat
  const [aiContextTags, setAiContextTags] = useState<string[]>([]);

  // Reset student selection and TORI filters whenever the course changes
  const prevCourseIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (courseId !== prevCourseIdRef.current) {
      prevCourseIdRef.current = courseId;
      setSelectedStudentIds([]);
      setToriFilters([]);
      setAiContextTags([]);
    }
  }, [courseId]);

  // Clear TORI filters when the selected students change
  const prevStudentIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const key = selectedStudentIds.join(",");
    if (key !== prevStudentIdsRef.current.join(",")) {
      prevStudentIdsRef.current = selectedStudentIds;
      setToriFilters([]);
    }
  }, [selectedStudentIds]);

  /** Select a single student (replaces current selection). */
  const handleSelectStudent = useCallback((id: string) => {
    trackEvent("CHAT_EXPLORER", "select_student", { studentId: id });
    setSelectedStudentIds((prev) =>
      prev.length === 1 && prev[0] === id ? [] : [id]
    );
  }, [trackEvent]);

  // ── Queries ────────────────────────────────────────────────────────

  // Fetch available courses so we can auto-select the first one when no course is chosen
  const { data: coursesData } = useQuery<any>(GET_COURSES, {
    variables: { institutionId: scope?.institutionId },
    skip: !scope?.institutionId || !!courseId,
  });

  // Auto-select the first course when none is selected (so threads can load)
  useEffect(() => {
    if (!courseId && scope?.institutionId && coursesData?.courses?.length > 0) {
      setScope({ ...scope, courseId: coursesData.courses[0].id });
    }
  }, [courseId, scope, coursesData, setScope]);

  // Student profiles for the selected scope (works at institution or course level)
  const { data: studentsData, loading: studentsLoading } = useQuery<any>(
    GET_STUDENT_PROFILES,
    {
      variables: { scope },
      skip: !scope?.institutionId,
    }
  );
  const studentProfiles =
    studentsData?.instructionalInsights?.data?.studentProfiles ?? [];

  // Auto-select the first student when profiles load and none are selected
  useEffect(() => {
    if (studentProfiles.length > 0 && selectedStudentIds.length === 0) {
      setSelectedStudentIds([studentProfiles[0].studentId]);
    }
  }, [studentProfiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify panel of current page context for context-change detection
  useEffect(() => {
    if (scope) {
      const scopeKey = [scope.institutionId, scope.courseId, scope.assignmentId]
        .filter(Boolean)
        .join("/");
      const selectedStudent = studentProfiles.find(
        (s: { studentId: string }) => s.studentId === selectedStudentIds[0]
      );
      panel.setPageContext({
        page: "chat-explorer",
        scopeKey,
        studentId: selectedStudentIds[0],
        studentName: selectedStudent?.name,
      });
    }
  }, [scope, selectedStudentIds, panel.setPageContext]);

  // Sync selected student with Faculty Panel's Student tab
  useEffect(() => {
    if (panel.isOpen && panel.activeTab === "student" && selectedStudentIds.length === 1) {
      const student = studentProfiles.find(
        (s: { studentId: string; name: string }) => s.studentId === selectedStudentIds[0]
      );
      if (student) {
        panel.openStudentProfile(student.studentId, student.name);
      }
    }
  }, [selectedStudentIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Thread data (for extracting available TORI tags and rendering threads)
  const { data: threadsData } = useQuery<any>(GET_ASSIGNMENT_THREADS, {
    variables: { courseId },
    skip: !courseId,
  });

  // ── Derived: available TORI tags (filtered to selected student) ─────
  const availableTags = useMemo(() => {
    if (!threadsData?.assignments) return [];

    const tagMap = new Map<string, { name: string; domain: string; count: number }>();

    for (const assignment of threadsData.assignments) {
      for (const thread of assignment.threads ?? []) {
        for (const comment of thread.comments ?? []) {
          // If students are selected, only count their comments' tags
          if (selectedStudentIds.length > 0) {
            const cid = comment.student?.id ?? comment.studentId;
            if (!selectedStudentIds.includes(cid)) continue;
          }

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
  }, [threadsData, selectedStudentIds]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleToggleToriFilter = useCallback((tagName: string) => {
    trackEvent("CHAT_EXPLORER", "filter_tori", { tagName });
    setToriFilters((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  }, [trackEvent]);

  const handleClearToriFilters = useCallback(() => {
    setToriFilters([]);
  }, []);

  /** When a TORI tag is clicked in a chat comment, add it as AI context. */
  const handleToriTagClick = useCallback((tagName: string) => {
    setAiContextTags((prev) =>
      prev.includes(tagName) ? prev : [...prev, tagName]
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* ── MAIN CONTENT: full-width thread viewer ──────────────── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          pb: "60px", // space for the fixed bottom bar
        }}
      >
        {/* Header + TORI filters */}
        <Box sx={{ px: 3, pt: 3, pb: 1 }}>
          <Typography variant="h5" fontWeight={500} sx={{ mb: 2 }}>
            Chat Explorer
          </Typography>

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

        {/* Thread view — takes full available width */}
        <Box sx={{ flex: 1, overflowY: "auto", pb: "80px", px: 3 }}>
          {studentsLoading ? (
            <Box>
              <Skeleton variant="rounded" height={60} sx={{ mb: 1 }} />
              <Skeleton variant="rounded" height={60} sx={{ mb: 1 }} />
              <Skeleton variant="rounded" height={60} />
            </Box>
          ) : (
            <ThreadView
              studentIds={selectedStudentIds}
              courseId={courseId ?? null}
              assignmentId={assignmentId ?? null}
              activeToriFilters={toriFilters}
              onToriTagClick={handleToriTagClick}
            />
          )}
        </Box>

        {/* Student list slide-out panel */}
        <StudentListPanel
          open={studentListOpen}
          onClose={() => setStudentListOpen(false)}
          students={studentProfiles}
          selectedIds={selectedStudentIds}
          onToggle={handleSelectStudent}
        />
      </Box>

      {/* ── BOTTOM BAR: spans full width ───────────────────────── */}
      <BottomBar
        students={studentProfiles}
        selectedStudentIds={selectedStudentIds}
        onSelectStudent={handleSelectStudent}
        onOpenStudentList={() => setStudentListOpen(true)}
        studentListOpen={studentListOpen}
        onToggleAnalyze={() => panel.openChat()}
        analyzeOpen={panel.isOpen && panel.activeTab === "chat"}
      />
    </Box>
  );
}
