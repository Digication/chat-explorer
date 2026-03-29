import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Skeleton,
  Alert,
} from "@mui/material";
import {
  GET_EXPLORER_ME,
  GET_EXPLORER_INSTITUTION,
  GET_EXPLORER_COURSES,
  GET_EXPLORER_ASSIGNMENTS,
  GET_STUDENT_PROFILES,
  GET_ASSIGNMENT_THREADS,
} from "@/lib/queries/explorer";
import ThreadView from "@/components/explorer/ThreadView";
import BottomBar from "@/components/explorer/BottomBar";
import ToriFilters from "@/components/explorer/ToriFilters";
import StudentListPanel from "@/components/explorer/StudentListPanel";
import AiChatPanel from "@/components/ai/AiChatPanel";

/**
 * Chat Explorer page — split-screen layout.
 *
 * Left panel: scope selectors, TORI filters, student conversation threads,
 *             bottom bar with student carousel.
 * Right panel: embedded AI Chat for discussing what you see on the left.
 */
export default function ChatExplorerPage() {
  // ── State ──────────────────────────────────────────────────────────
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );
  const [toriFilters, setToriFilters] = useState<string[]>([]);
  const [studentListOpen, setStudentListOpen] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────

  // Current user → used to determine role and institutionId
  const { data: meData } = useQuery<any>(GET_EXPLORER_ME);
  const institutionId = meData?.me?.institutionId ?? null;

  // Institution name (for display, non-admin users only)
  const { data: instData } = useQuery<any>(GET_EXPLORER_INSTITUTION);

  // Courses — the server resolver handles role-based filtering
  const {
    data: coursesData,
    loading: coursesLoading,
    error: coursesError,
  } = useQuery<any>(GET_EXPLORER_COURSES, {
    variables: { institutionId: institutionId || undefined },
    skip: !meData?.me,
  });
  const courses = coursesData?.courses ?? [];

  // Assignments for the selected course
  const {
    data: assignmentsData,
    loading: assignmentsLoading,
  } = useQuery<any>(GET_EXPLORER_ASSIGNMENTS, {
    variables: { courseId: selectedCourseId },
    skip: !selectedCourseId,
  });
  const assignments = assignmentsData?.assignments ?? [];

  // Build the scope object for analytics queries
  const scope = useMemo(() => {
    if (!selectedCourseId) return null;
    const selectedCourse = courses.find((c: any) => c.id === selectedCourseId);
    const scopeInstitutionId = selectedCourse?.institutionId ?? institutionId;
    if (!scopeInstitutionId) return null;
    return {
      institutionId: scopeInstitutionId,
      courseId: selectedCourseId,
      ...(selectedAssignmentId ? { assignmentId: selectedAssignmentId } : {}),
    };
  }, [selectedCourseId, selectedAssignmentId, courses, institutionId]);

  // Student profiles
  const {
    data: studentsData,
    loading: studentsLoading,
  } = useQuery<any>(GET_STUDENT_PROFILES, {
    variables: { scope },
    skip: !scope,
  });
  const studentProfiles =
    studentsData?.instructionalInsights?.data?.studentProfiles ?? [];

  // Thread data (for extracting available TORI tags)
  const { data: threadsData } = useQuery<any>(GET_ASSIGNMENT_THREADS, {
    variables: {
      courseId: selectedCourseId,
    },
    skip: !selectedCourseId,
  });

  // ── Derived: available TORI tags from thread data ──────────────────
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

  const handleCourseChange = useCallback((courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedAssignmentId("");
    setSelectedStudentId(null);
    setToriFilters([]);
  }, []);

  const handleAssignmentChange = useCallback((assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setSelectedStudentId(null);
    setToriFilters([]);
  }, []);

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
    // The bottom bar spans the full width at the bottom; above it, the left and
    // right panels sit side by side.
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        // Break out of AppShell's padding and maxWidth constraint
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
          // Leave room for the 60px bottom bar
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
        {/* Header + scope selectors */}
        <Box sx={{ px: 3, pt: 3, pb: 1 }}>
          <Typography variant="h5" fontWeight={500} sx={{ mb: 2 }}>
            Chat Explorer
            {instData?.myInstitution?.name && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                — {instData.myInstitution.name}
              </Typography>
            )}
          </Typography>

          {/* Course and Assignment dropdowns */}
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Course</InputLabel>
              <Select
                value={selectedCourseId}
                label="Course"
                onChange={(e) => handleCourseChange(e.target.value as string)}
              >
                {coursesLoading && (
                  <MenuItem disabled>
                    <Skeleton width={120} />
                  </MenuItem>
                )}
                {courses.map((c: any) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 200 }} disabled={!selectedCourseId}>
              <InputLabel>Assignment</InputLabel>
              <Select
                value={selectedAssignmentId}
                label="Assignment"
                onChange={(e) => handleAssignmentChange(e.target.value as string)}
              >
                <MenuItem value="">All assignments</MenuItem>
                {assignmentsLoading && (
                  <MenuItem disabled>
                    <Skeleton width={120} />
                  </MenuItem>
                )}
                {assignments.map((a: any) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Error display */}
          {coursesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load courses: {coursesError.message}
            </Alert>
          )}

          {/* TORI tag filter bar */}
          {availableTags.length > 0 && (
            <ToriFilters
              availableTags={availableTags}
              activeFilters={toriFilters}
              onToggle={handleToggleToriFilter}
              onClear={handleClearToriFilters}
            />
          )}
        </Box>

        {/* Main content: thread view (with bottom padding for the fixed bar) */}
        <Box sx={{ flex: 1, overflowY: "auto", pb: "80px", px: 3 }}>
          {!selectedCourseId ? (
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
              courseId={selectedCourseId}
              assignmentId={selectedAssignmentId || null}
              activeToriFilters={toriFilters}
            />
          )}
        </Box>

        {/* Student list slide-out panel (left) */}
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
            courseId={selectedCourseId || undefined}
            assignmentId={selectedAssignmentId || undefined}
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
