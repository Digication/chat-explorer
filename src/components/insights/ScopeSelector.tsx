import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@apollo/client/react";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  GET_ME,
  GET_MY_INSTITUTION,
  GET_INSTITUTIONS,
  GET_COURSES,
  GET_ASSIGNMENTS,
} from "@/lib/queries/analytics";

// ── Types ──────────────────────────────────────────────────────────────────────

/** The scope object sent to every analytics query. */
export interface InsightsScope {
  institutionId: string;
  courseId?: string;
  assignmentId?: string;
}

interface ScopeContextValue {
  scope: InsightsScope | null;
  setScope: (scope: InsightsScope) => void;
}

// ── Context + hook ─────────────────────────────────────────────────────────────

const InsightsScopeContext = createContext<ScopeContextValue>({
  scope: null,
  setScope: () => {},
});

/** Read the current analytics scope from context. */
export function useInsightsScope(): ScopeContextValue {
  return useContext(InsightsScopeContext);
}

export { InsightsScopeContext };

// ── Provider ───────────────────────────────────────────────────────────────────

/** Wraps children with the shared analytics scope state. */
export function InsightsScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<InsightsScope | null>(null);

  const { data: meData } = useQuery<any>(GET_ME);
  const role = meData?.me?.role;
  const userInstitutionId = meData?.me?.institutionId;

  // For digication_admin: fetch all institutions and auto-select the first one
  const { data: allInstData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: role !== "digication_admin",
  });

  React.useEffect(() => {
    if (scope) return; // already initialized

    if (role === "digication_admin") {
      // Auto-select the first institution if available
      const firstInst = allInstData?.institutions?.[0];
      if (firstInst) {
        setScope({ institutionId: firstInst.id });
      }
    } else if (userInstitutionId) {
      // instructor or institution_admin — use their institution
      setScope({ institutionId: userInstitutionId });
    }
  }, [role, userInstitutionId, allInstData, scope]);

  const value = useMemo(() => ({ scope, setScope }), [scope]);

  return (
    <InsightsScopeContext.Provider value={value}>
      {children}
    </InsightsScopeContext.Provider>
  );
}

// ── ScopeSelector component ────────────────────────────────────────────────────

interface ScopeSelectorProps {
  /** When true, removes bottom margin and uses smaller controls. */
  compact?: boolean;
}

/** Breadcrumb-style picker for Institution > Course > Assignment. */
export default function ScopeSelector({ compact = false }: ScopeSelectorProps) {
  const { scope, setScope } = useInsightsScope();

  // Current user role
  const { data: meData } = useQuery<any>(GET_ME);
  const role = meData?.me?.role;
  const isDigicationAdmin = role === "digication_admin";

  // All institutions (digication_admin only)
  const { data: allInstData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: !isDigicationAdmin,
  });

  // Single institution name (for non-admin users)
  const { data: instData, loading: instLoading } = useQuery<any>(
    GET_MY_INSTITUTION,
    { skip: isDigicationAdmin },
  );

  // Courses for the current institution
  const { data: courseData, loading: coursesLoading } = useQuery<any>(GET_COURSES, {
    variables: { institutionId: scope?.institutionId },
    skip: !scope?.institutionId,
  });

  // Assignments for the selected course
  const { data: assignData, loading: assignLoading } = useQuery<any>(
    GET_ASSIGNMENTS,
    {
      variables: { courseId: scope?.courseId },
      skip: !scope?.courseId,
    },
  );

  // ── Menu anchors ───────────────────────────────────────────────────────────

  const [instAnchor, setInstAnchor] = useState<null | HTMLElement>(null);
  const [courseAnchor, setCourseAnchor] = useState<null | HTMLElement>(null);
  const [assignAnchor, setAssignAnchor] = useState<null | HTMLElement>(null);

  const handleInstSelect = useCallback(
    (institutionId: string) => {
      setScope({ institutionId });
      setInstAnchor(null);
    },
    [setScope],
  );

  const handleCourseSelect = useCallback(
    (courseId: string) => {
      if (!scope) return;
      setScope({ institutionId: scope.institutionId, courseId });
      setCourseAnchor(null);
    },
    [scope, setScope],
  );

  const handleAssignSelect = useCallback(
    (assignmentId: string) => {
      if (!scope) return;
      setScope({ ...scope, assignmentId });
      setAssignAnchor(null);
    },
    [scope, setScope],
  );

  const handleClearCourse = useCallback(() => {
    if (!scope) return;
    setScope({ institutionId: scope.institutionId });
    setCourseAnchor(null);
  }, [scope, setScope]);

  const handleClearAssignment = useCallback(() => {
    if (!scope) return;
    setScope({
      institutionId: scope.institutionId,
      courseId: scope.courseId,
    });
    setAssignAnchor(null);
  }, [scope, setScope]);

  // Derive display labels
  const institutions: { id: string; name: string }[] =
    allInstData?.institutions ?? [];
  const selectedInstitution = institutions.find(
    (i) => i.id === scope?.institutionId,
  );

  const institutionName = isDigicationAdmin
    ? selectedInstitution?.name ?? "Select Institution"
    : instLoading
      ? "..."
      : instData?.myInstitution?.name ?? "Institution";

  const courses: { id: string; name: string }[] = courseData?.courses ?? [];
  const assignments: { id: string; name: string }[] =
    assignData?.assignments ?? [];

  const selectedCourse = courses.find((c) => c.id === scope?.courseId);
  const selectedAssignment = assignments.find(
    (a) => a.id === scope?.assignmentId,
  );

  if (!scope) {
    return <Skeleton variant="text" width={300} height={32} />;
  }

  return (
    <Box sx={{ mb: compact ? 0 : 3 }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        {/*
          IMPORTANT: each direct child of <Breadcrumbs> gets a separator before it.
          MUI uses React.Children.toArray() which flattens fragments, so a
          <Button> + <Menu> pair inside a <> fragment counts as TWO children and
          produces a phantom separator next to the (invisible) Menu portal.
          Wrap each Button+Menu pair in a single <Box> so it counts as one child.
        */}

        {/* Institution — clickable dropdown for digication_admin, static for others */}
        {isDigicationAdmin ? (
          <Box component="span">
            <Button
              size="small"
              endIcon={<ExpandMoreIcon sx={{ opacity: 0, transition: "opacity 0.15s" }} />}
              onClick={(e) => setInstAnchor(e.currentTarget)}
              sx={{ textTransform: "none", fontWeight: 500, "&:hover .MuiButton-endIcon": { opacity: 1 } }}
            >
              {institutionName}
            </Button>
            <Menu
              anchorEl={instAnchor}
              open={Boolean(instAnchor)}
              onClose={() => setInstAnchor(null)}
            >
              {institutions.map((inst) => (
                <MenuItem
                  key={inst.id}
                  selected={inst.id === scope.institutionId}
                  onClick={() => handleInstSelect(inst.id)}
                >
                  {inst.name}
                </MenuItem>
              ))}
            </Menu>
          </Box>
        ) : (
          <Typography color="text.primary" fontWeight={500}>
            {institutionName}
          </Typography>
        )}

        {/* Course selector — static text when only 1 course, dropdown otherwise */}
        {courses.length <= 1 && scope.courseId ? (
          <Typography color="text.primary">
            {selectedCourse?.name ?? "All Courses"}
          </Typography>
        ) : (
          <Box component="span">
            <Button
              size="small"
              endIcon={<ExpandMoreIcon sx={{ opacity: 0, transition: "opacity 0.15s" }} />}
              onClick={(e) => setCourseAnchor(e.currentTarget)}
              sx={{ textTransform: "none", "&:hover .MuiButton-endIcon": { opacity: 1 } }}
            >
              {coursesLoading
                ? "Loading..."
                : selectedCourse?.name ?? "All Courses"}
            </Button>
            <Menu
              anchorEl={courseAnchor}
              open={Boolean(courseAnchor)}
              onClose={() => setCourseAnchor(null)}
            >
              <MenuItem onClick={handleClearCourse}>
                <em>All Courses</em>
              </MenuItem>
              {courses.map((c) => (
                <MenuItem
                  key={c.id}
                  selected={c.id === scope.courseId}
                  onClick={() => handleCourseSelect(c.id)}
                >
                  {c.name}
                </MenuItem>
              ))}
            </Menu>
          </Box>
        )}

        {/* Assignment selector (only when a course is selected) */}
        {scope.courseId ? (
          assignments.length <= 1 && scope.assignmentId ? (
            <Typography color="text.primary">
              {selectedAssignment?.name ?? "All Assignments"}
            </Typography>
          ) : (
            <Box component="span">
              <Button
                size="small"
                endIcon={<ExpandMoreIcon sx={{ opacity: 0, transition: "opacity 0.15s" }} />}
                onClick={(e) => setAssignAnchor(e.currentTarget)}
                sx={{ textTransform: "none", "&:hover .MuiButton-endIcon": { opacity: 1 } }}
              >
                {assignLoading
                  ? "Loading..."
                  : selectedAssignment?.name ?? "All Assignments"}
              </Button>
              <Menu
                anchorEl={assignAnchor}
                open={Boolean(assignAnchor)}
                onClose={() => setAssignAnchor(null)}
              >
                <MenuItem onClick={handleClearAssignment}>
                  <em>All Assignments</em>
                </MenuItem>
                {assignments.map((a) => (
                  <MenuItem
                    key={a.id}
                    selected={a.id === scope.assignmentId}
                    onClick={() => handleAssignSelect(a.id)}
                  >
                    {a.name}
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          )
        ) : null}
      </Breadcrumbs>
    </Box>
  );
}
