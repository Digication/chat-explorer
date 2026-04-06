import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { Box, Typography, Skeleton, Fab, Slide } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  GET_STUDENT_PROFILES,
  GET_ASSIGNMENT_THREADS,
} from "@/lib/queries/explorer";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import ThreadView from "@/components/explorer/ThreadView";
import BottomBar from "@/components/explorer/BottomBar";
import ToriFilters from "@/components/explorer/ToriFilters";
import StudentListPanel from "@/components/explorer/StudentListPanel";
import AiChatPanel from "@/components/ai/AiChatPanel";

/** Width of the collapsible AI panel. Capped at 50vw via CSS min(). */
const AI_PANEL_WIDTH = "min(600px, 50vw)";

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
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [toriFilters, setToriFilters] = useState<string[]>([]);
  const [studentListOpen, setStudentListOpen] = useState(false);
  // TORI tags clicked in chat comments — passed as context to AI chat
  const [aiContextTags, setAiContextTags] = useState<string[]>([]);
  // AI panel is hidden by default, slides in from the right when toggled
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

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

  /** Toggle a student in the selection (add or remove). */
  const handleToggleStudent = useCallback((id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }, []);

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
    setToriFilters((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  }, []);

  const handleClearToriFilters = useCallback(() => {
    setToriFilters([]);
  }, []);

  /** When a TORI tag is clicked in a chat comment, add it as AI context. */
  const handleToriTagClick = useCallback((tagName: string) => {
    setAiContextTags((prev) =>
      prev.includes(tagName) ? prev : [...prev, tagName]
    );
  }, []);

  // Find the selected student(s) display name for AI context indicator
  const selectedStudentName = useMemo(() => {
    if (selectedStudentIds.length === 0) return undefined;
    if (selectedStudentIds.length === 1) {
      const student = studentProfiles.find(
        (s: any) => s.studentId === selectedStudentIds[0]
      );
      return student?.name;
    }
    return `${selectedStudentIds.length} students`;
  }, [selectedStudentIds, studentProfiles]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        // Smooth transition when AI panel opens/closes
        transition: "padding-right 0.3s ease",
        pr: aiPanelOpen ? AI_PANEL_WIDTH : 0,
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
              studentIds={selectedStudentIds}
              courseId={courseId}
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
          onToggle={handleToggleStudent}
        />
      </Box>

      {/* ── AI PANEL: slides in from the right, overlays content ── */}
      <Slide direction="left" in={aiPanelOpen} mountOnEnter unmountOnExit>
        <Box
          sx={{
            position: "fixed",
            top: 52, // below GlobalHeader (HEADER_HEIGHT)
            right: 0,
            bottom: 60, // above the bottom bar
            width: AI_PANEL_WIDTH,
            zIndex: 1200,
            bgcolor: "background.paper",
            borderLeft: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            boxShadow: 6,
          }}
        >
          {/* Close button in the top-right corner of the panel */}
          <Box
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1,
            }}
          >
            <Fab
              size="small"
              onClick={() => setAiPanelOpen(false)}
              aria-label="Close AI chat"
              sx={{
                width: 32,
                height: 32,
                minHeight: 32,
                boxShadow: 1,
              }}
            >
              <CloseIcon fontSize="small" />
            </Fab>
          </Box>
          <AiChatPanel
            open={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
            courseId={courseId}
            assignmentId={assignmentId}
            studentId={selectedStudentIds.length === 1 ? selectedStudentIds[0] : undefined}
            studentName={selectedStudentName}
            selectedToriTags={
              aiContextTags.length > 0
                ? aiContextTags
                : toriFilters.length > 0
                  ? toriFilters
                  : undefined
            }
            anchor="embedded"
          />
        </Box>
      </Slide>

      {/* ── BOTTOM BAR: spans full width ───────────────────────── */}
      <BottomBar
        students={studentProfiles}
        selectedStudentIds={selectedStudentIds}
        onToggleStudent={handleToggleStudent}
        onOpenStudentList={() => setStudentListOpen(true)}
        studentListOpen={studentListOpen}
        onToggleAnalyze={() => setAiPanelOpen((p) => !p)}
        analyzeOpen={aiPanelOpen}
      />
    </Box>
  );
}
