import React, { useState, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { GET_STUDENT_ENGAGEMENT } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import EvidencePopover from "@/components/insights/EvidencePopover";
import { useUserSettings } from "@/lib/UserSettingsContext";
import { CATEGORY_CONFIG, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/reflection-categories";

/** Map category key → ordinal for sorting (higher = deeper reflection). */
const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  CATEGORY_CONFIG.map((c, i) => [c.key, i])
);

interface StudentProfile {
  studentId: string;
  name: string;
  modalCategory: string;
  commentCount: number;
  topToriTags: string[];
}

type SortKey = "name" | "modalCategory" | "commentCount";
type SortDir = "asc" | "desc";

/** Sort comparator for any column. */
function compare(a: StudentProfile, b: StudentProfile, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "modalCategory")
    return (CATEGORY_ORDER[a.modalCategory] ?? 0) - (CATEGORY_ORDER[b.modalCategory] ?? 0);
  if (key === "commentCount") return a.commentCount - b.commentCount;
  return 0;
}

interface Props {
  /** Optional callback for future thread drill-down. */
  onViewThread?: (threadId: string, studentName: string) => void;
}

interface StudentPopoverState {
  anchorEl: HTMLElement;
  studentId: string;
  studentName: string;
  commentCount: number;
}

export default function StudentEngagementTable({ onViewThread }: Props) {
  const { scope } = useInsightsScope();
  const { getDisplayName } = useUserSettings();
  const navigate = useNavigate();

  const [sortKey, setSortKey] = useState<SortKey>("modalCategory");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [popover, setPopover] = useState<StudentPopoverState | null>(null);

  const { data, loading, error, refetch } = useQuery<any>(
    GET_STUDENT_ENGAGEMENT,
    {
      variables: { scope },
      skip: !scope,
    },
  );

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load student engagement data.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !data?.instructionalInsights?.data) {
    return (
      <Box>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="text" height={40} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  const students: StudentProfile[] =
    data.instructionalInsights.data.studentProfiles ?? [];

  // ── Empty state ────────────────────────────────────────────────────────────

  if (students.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No student engagement data available for this scope.
      </Typography>
    );
  }

  /** Toggle sort when a header is clicked. */
  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Sort the student list.
  const sorted = [...students].sort((a, b) => {
    const result = compare(a, b, sortKey);
    return sortDir === "asc" ? result : -result;
  });

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>
            <TableSortLabel
              active={sortKey === "name"}
              direction={sortKey === "name" ? sortDir : "asc"}
              onClick={() => handleSort("name")}
            >
              Student Name
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortKey === "modalCategory"}
              direction={sortKey === "modalCategory" ? sortDir : "asc"}
              onClick={() => handleSort("modalCategory")}
            >
              Reflection Category
            </TableSortLabel>
          </TableCell>
          <TableCell align="right">
            <TableSortLabel
              active={sortKey === "commentCount"}
              direction={sortKey === "commentCount" ? sortDir : "asc"}
              onClick={() => handleSort("commentCount")}
            >
              Comments
            </TableSortLabel>
          </TableCell>
          <TableCell>Top Tags</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.map((student) => {
          const catColor = CATEGORY_COLORS[student.modalCategory] ?? "#757575";

          return (
            <TableRow key={student.studentId} hover>
              {/* Student name — clickable to view profile */}
              <TableCell
                onClick={() =>
                  navigate(`/insights/student/${student.studentId}`)
                }
                sx={{ cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}
              >
                {getDisplayName(student.name)}
              </TableCell>

              {/* Reflection category chip */}
              <TableCell>
                <Chip
                  label={CATEGORY_LABELS[student.modalCategory] ?? student.modalCategory}
                  size="small"
                  sx={{
                    bgcolor: catColor,
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                  }}
                />
              </TableCell>

              {/* Comment count */}
              <TableCell align="right">{student.commentCount}</TableCell>

              {/* Top TORI tags (max 3) */}
              <TableCell>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {(student.topToriTags ?? []).slice(0, 3).map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "0.7rem" }}
                    />
                  ))}
                </Box>
              </TableCell>

              {/* Evidence popover trigger */}
              <TableCell padding="none" sx={{ width: 36 }}>
                <IconButton
                  size="small"
                  onClick={(e) =>
                    setPopover({
                      anchorEl: e.currentTarget as HTMLElement,
                      studentId: student.studentId,
                      studentName: student.name,
                      commentCount: student.commentCount,
                    })
                  }
                  aria-label="View evidence"
                >
                  <InfoOutlinedIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>

      {/* Evidence popover — shown when a student name is clicked */}
      {popover && scope && (
        <EvidencePopover
          anchorEl={popover.anchorEl}
          studentId={popover.studentId}
          studentName={popover.studentName}
          count={popover.commentCount}
          scope={scope}
          onClose={() => setPopover(null)}
          onViewThread={(threadId, studentName) => {
            setPopover(null);
            onViewThread?.(threadId, studentName);
          }}
        />
      )}
    </Table>
  );
}
