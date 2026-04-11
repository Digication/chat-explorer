import React, { useState } from "react";
import { Link as RouterLink } from "react-router";
import { useQuery, useLazyQuery } from "@apollo/client/react";
import {
  Box,
  Typography,
  Breadcrumbs,
  Link,
  Paper,
  Button,
  Chip,
  Skeleton,
  Alert,
  Autocomplete,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import {
  GET_COURSES,
  GET_CROSS_COURSE_COMPARISON,
} from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import {
  CATEGORY_CONFIG,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/reflection-categories";

interface CourseOption {
  id: string;
  name: string;
}

export default function CrossCourseComparisonPage() {
  const { scope } = useInsightsScope();
  const [selectedCourses, setSelectedCourses] = useState<CourseOption[]>([]);

  // Fetch available courses for the institution
  const { data: coursesData, loading: coursesLoading } = useQuery<any>(
    GET_COURSES,
    {
      variables: { institutionId: scope?.institutionId },
      skip: !scope?.institutionId,
    }
  );

  const courses: CourseOption[] = coursesData?.courses ?? [];

  // Lazy query for comparison — only fires when user clicks Compare
  const [fetchComparison, { data: compData, loading: compLoading, error: compError }] =
    useLazyQuery<any>(GET_CROSS_COURSE_COMPARISON, {
      fetchPolicy: "network-only",
    });

  const handleCompare = () => {
    if (selectedCourses.length < 2 || !scope?.institutionId) return;
    fetchComparison({
      variables: {
        input: {
          institutionId: scope.institutionId,
          courseIds: selectedCourses.map((c) => c.id),
        },
      },
    });
  };

  const comparison = compData?.crossCourseComparison?.data;

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", py: 4, px: 3 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link component={RouterLink} to="/insights" underline="hover">
          Insights
        </Link>
        <Typography color="text.primary">Compare Courses</Typography>
      </Breadcrumbs>

      {/* Course picker */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Select Courses to Compare
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
          <Autocomplete
            multiple
            options={courses}
            getOptionLabel={(option) => option.name}
            value={selectedCourses}
            onChange={(_, value) => setSelectedCourses(value)}
            loading={coursesLoading}
            sx={{ flex: 1 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Courses"
                placeholder="Select at least 2 courses"
                size="small"
              />
            )}
            isOptionEqualToValue={(option, value) => option.id === value.id}
          />
          <Button
            variant="contained"
            onClick={handleCompare}
            disabled={selectedCourses.length < 2 || compLoading}
          >
            {compLoading ? "Comparing…" : "Compare"}
          </Button>
        </Box>
      </Paper>

      {/* Error state */}
      {compError && (
        <Alert severity="error" sx={{ mb: 4 }}>
          Failed to load comparison: {compError.message}
        </Alert>
      )}

      {/* Loading state */}
      {compLoading && (
        <Box>
          <Skeleton variant="rounded" height={300} sx={{ mb: 4 }} />
          <Skeleton variant="rounded" height={200} />
        </Box>
      )}

      {/* Empty state — before any comparison */}
      {!comparison && !compLoading && !compError && (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
          <Typography color="text.secondary">
            Select at least 2 courses to compare.
          </Typography>
        </Paper>
      )}

      {/* Results */}
      {comparison && !compLoading && (
        <>
          {/* Comparison table */}
          <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Course Metrics
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Metric</TableCell>
                    {comparison.courses.map((c: any) => (
                      <TableCell key={c.courseId} align="center" sx={{ fontWeight: 600 }}>
                        {c.courseName}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <MetricRow
                    label="Students"
                    values={comparison.courses.map((c: any) => String(c.studentCount))}
                  />
                  <MetricRow
                    label="Comments"
                    values={comparison.courses.map((c: any) => String(c.commentCount))}
                  />
                  <MetricRow
                    label="Assignments"
                    values={comparison.courses.map((c: any) => String(c.assignmentCount))}
                  />
                  <MetricRow
                    label="Avg Words/Comment"
                    values={comparison.courses.map((c: any) => String(c.avgWordCount))}
                  />
                  <MetricRow
                    label="Growth Rate"
                    values={comparison.courses.map((c: any) => `${c.growthRate}%`)}
                  />
                  <TableRow>
                    <TableCell>Top Reflection</TableCell>
                    {comparison.courses.map((c: any) => {
                      // Find the modal category from distribution
                      const dist = c.categoryDistribution;
                      const modal = CATEGORY_CONFIG.reduce(
                        (best, cfg) =>
                          (dist[cfg.key] ?? 0) > best.count
                            ? { key: cfg.key, count: dist[cfg.key] ?? 0 }
                            : best,
                        { key: "DESCRIPTIVE_WRITING", count: -1 }
                      ).key;
                      return (
                        <TableCell key={c.courseId} align="center">
                          <Chip
                            label={CATEGORY_LABELS[modal] ?? modal}
                            size="small"
                            sx={{
                              bgcolor: CATEGORY_COLORS[modal],
                              color: "#fff",
                              fontWeight: 600,
                              fontSize: "0.7rem",
                            }}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  <TableRow>
                    <TableCell>Top Tags</TableCell>
                    {comparison.courses.map((c: any) => (
                      <TableCell key={c.courseId} align="center">
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
                          {(c.topToriTags ?? []).slice(0, 3).map((tag: string) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: "0.65rem" }}
                            />
                          ))}
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Paper>

          {/* Stacked bar comparison */}
          <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Reflection Category Distribution
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {comparison.courses.map((course: any) => {
                const dist = course.categoryDistribution;
                const total = CATEGORY_CONFIG.reduce(
                  (s, c) => s + ((dist[c.key] as number) ?? 0),
                  0
                );
                return (
                  <Box key={course.courseId}>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                      {course.courseName}
                    </Typography>
                    <Box sx={{ display: "flex", height: 28, borderRadius: 1, overflow: "hidden" }}>
                      {CATEGORY_CONFIG.map((cfg) => {
                        const count = (dist[cfg.key] as number) ?? 0;
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <Tooltip
                            key={cfg.key}
                            title={`${cfg.label}: ${count} students (${pct.toFixed(1)}%)`}
                          >
                            <Box
                              sx={{
                                width: `${pct}%`,
                                bgcolor: cfg.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {pct > 10 && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: "#fff", fontWeight: 600, fontSize: "0.65rem" }}
                                >
                                  {pct.toFixed(0)}%
                                </Typography>
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                  </Box>
                );
              })}
            </Box>

            {/* Legend */}
            <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
              {CATEGORY_CONFIG.map((c) => (
                <Box key={c.key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c.color }} />
                  <Typography variant="caption">{c.label}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}

/** Simple table row for a metric across courses. */
function MetricRow({ label, values }: { label: string; values: string[] }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      {values.map((v, i) => (
        <TableCell key={i} align="center">
          {v}
        </TableCell>
      ))}
    </TableRow>
  );
}
