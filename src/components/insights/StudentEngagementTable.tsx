import React, { useState, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
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
import { GET_STUDENT_ENGAGEMENT } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

/** Colors for each depth band. */
const BAND_COLORS: Record<string, string> = {
  SURFACE: "#ef5350",
  DEVELOPING: "#ffa726",
  DEEP: "#66bb6a",
};

interface StudentProfile {
  studentId: string;
  name: string;
  engagementScore: number;
  depthBand: string;
  commentCount: number;
  topToriTags: string[];
}

type SortKey = "name" | "engagementScore" | "depthBand" | "commentCount";
type SortDir = "asc" | "desc";

/** Sort comparator for any column. */
function compare(a: StudentProfile, b: StudentProfile, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "engagementScore") return a.engagementScore - b.engagementScore;
  if (key === "depthBand") return a.depthBand.localeCompare(b.depthBand);
  if (key === "commentCount") return a.commentCount - b.commentCount;
  return 0;
}

interface Props {
  /** Optional callback for future thread drill-down. */
  onViewThread?: (threadId: string, studentName: string) => void;
}

export default function StudentEngagementTable({ onViewThread }: Props) {
  const { scope } = useInsightsScope();

  const [sortKey, setSortKey] = useState<SortKey>("engagementScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  // Find max score for the visual bar.
  const maxScore = Math.max(...students.map((s) => s.engagementScore), 1);

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
              active={sortKey === "engagementScore"}
              direction={sortKey === "engagementScore" ? sortDir : "asc"}
              onClick={() => handleSort("engagementScore")}
            >
              Score
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortKey === "depthBand"}
              direction={sortKey === "depthBand" ? sortDir : "asc"}
              onClick={() => handleSort("depthBand")}
            >
              Depth Band
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
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.map((student) => {
          const barPct =
            maxScore > 0
              ? (student.engagementScore / maxScore) * 100
              : 0;
          const bandColor = BAND_COLORS[student.depthBand] ?? "#757575";

          return (
            <TableRow key={student.studentId} hover>
              {/* Student name */}
              <TableCell>{student.name}</TableCell>

              {/* Score with visual bar */}
              <TableCell sx={{ minWidth: 160 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 36 }}>
                    {student.engagementScore.toFixed(2)}
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <Box
                      sx={{
                        height: 8,
                        width: `${barPct}%`,
                        minWidth: barPct > 0 ? 2 : 0,
                        bgcolor: bandColor,
                        borderRadius: 0.5,
                        opacity: 0.7,
                      }}
                    />
                  </Box>
                </Box>
              </TableCell>

              {/* Depth band chip */}
              <TableCell>
                <Chip
                  label={student.depthBand}
                  size="small"
                  sx={{
                    bgcolor: bandColor,
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
