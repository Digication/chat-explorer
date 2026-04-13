import React, { useState, useEffect } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { GET_ENGAGEMENT, GET_STUDENT_ENGAGEMENT } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useInsightsAnalytics } from "@/components/insights/InsightsAnalyticsContext";
import StudentDrillDown, { type StudentItem } from "@/components/insights/StudentDrillDown";
import { CATEGORY_CONFIG } from "@/lib/reflection-categories";

interface DepthBandsProps {
  onOpenStudent?: (studentId: string, studentName: string) => void;
}

interface DrillDownState {
  anchorEl: HTMLElement;
  categoryKey: string;
  students: StudentItem[];
}

export default function DepthBands({ onOpenStudent }: DepthBandsProps) {
  const { scope } = useInsightsScope();
  const { registerSummary } = useInsightsAnalytics();
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  const { data, loading, error, refetch } = useQuery<any>(GET_ENGAGEMENT, {
    variables: { scope },
    skip: !scope,
  });

  const { data: profilesData } = useQuery<any>(GET_STUDENT_ENGAGEMENT, {
    variables: { scope },
    skip: !scope,
  });

  // Register depth distribution summary for AI Chat context
  useEffect(() => {
    const dist = data?.engagement?.data?.categoryDistribution;
    if (dist) {
      const total = CATEGORY_CONFIG.reduce(
        (sum, c) => sum + ((dist[c.key] as number) ?? 0),
        0
      );
      if (total > 0) {
        const parts = CATEGORY_CONFIG.map((c) => {
          const count = (dist[c.key] as number) ?? 0;
          const pct = ((count / total) * 100).toFixed(0);
          return `${c.label}: ${count} (${pct}%)`;
        });
        registerSummary("Reflection Depth", parts.join(", "));
      }
    }
  }, [data, registerSummary]);

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
        Failed to load reflection data.
      </Alert>
    );
  }

  if (loading || !data?.engagement?.data) {
    return <Skeleton variant="rectangular" height={120} />;
  }

  const dist = data.engagement.data.categoryDistribution;
  const perStudent: Array<{
    studentId: string;
    modalCategory: string;
    commentCount: number;
  }> = data.engagement.data.perStudent ?? [];

  const studentProfiles: Array<{
    studentId: string;
    name: string;
    commentCount?: number;
    modalCategory?: string;
  }> = profilesData?.instructionalInsights?.data?.studentProfiles ?? [];
  const nameMap = new Map(studentProfiles.map((p) => [p.studentId, p]));

  const total = CATEGORY_CONFIG.reduce(
    (sum, c) => sum + ((dist[c.key] as number) ?? 0),
    0
  );

  const categories = CATEGORY_CONFIG.map((c) => {
    const count = (dist[c.key] as number) ?? 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { ...c, count, pct };
  });

  const handleCategoryClick = (
    event: React.MouseEvent<HTMLElement>,
    categoryKey: string
  ) => {
    const matching: StudentItem[] = perStudent
      .filter((s) => s.modalCategory === categoryKey)
      .map((s) => {
        const profile = nameMap.get(s.studentId);
        return {
          studentId: s.studentId,
          name: profile?.name ?? s.studentId,
          modalCategory: s.modalCategory,
          commentCount: s.commentCount,
        };
      });

    setDrillDown({
      anchorEl: event.currentTarget,
      categoryKey,
      students: matching,
    });
  };

  const handleSelectStudent = (studentId: string, studentName: string) => {
    if (onOpenStudent) {
      onOpenStudent(studentId, studentName);
    }
  };

  const activeLabel =
    CATEGORY_CONFIG.find((c) => c.key === drillDown?.categoryKey)?.label ?? "";

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Comments are classified into one of four Hatton &amp; Smith (1995)
        reflection categories by an AI classifier. Each student&apos;s most
        common category is shown below.
      </Typography>

      {/* Stacked horizontal bar */}
      <Box
        sx={{
          display: "flex",
          height: 36,
          borderRadius: 1,
          overflow: "hidden",
          mb: 2,
        }}
      >
        {categories.map((c) =>
          c.pct > 0 ? (
            <Box
              key={c.key}
              onClick={(e) => handleCategoryClick(e, c.key)}
              sx={{
                width: `${c.pct}%`,
                bgcolor: c.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width 0.3s ease",
                cursor: "pointer",
                "&:hover": { opacity: 0.85 },
              }}
            >
              {c.pct >= 8 && (
                <Typography
                  variant="caption"
                  sx={{ color: "#fff", fontWeight: 600 }}
                >
                  {Math.round(c.pct)}%
                </Typography>
              )}
            </Box>
          ) : null
        )}
      </Box>

      {/* Summary table */}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Category</TableCell>
            <TableCell align="right">Count</TableCell>
            <TableCell align="right">Percentage</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {categories.map((c) => (
            <TableRow
              key={c.key}
              onClick={(e) => handleCategoryClick(e as any, c.key)}
              sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
            >
              <TableCell>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: c.color,
                      flexShrink: 0,
                    }}
                  />
                  {c.label}
                </Box>
              </TableCell>
              <TableCell align="right">
                <Typography
                  component="span"
                  variant="body2"
                  onClick={(e) => handleCategoryClick(e as any, c.key)}
                  sx={{
                    cursor: "pointer",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {c.count}
                </Typography>
              </TableCell>
              <TableCell align="right">{c.pct.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Student drill-down popover */}
      <StudentDrillDown
        anchorEl={drillDown?.anchorEl ?? null}
        title={`${activeLabel} — ${drillDown?.students.length ?? 0} student${(drillDown?.students.length ?? 0) !== 1 ? "s" : ""}`}
        subtitle="Click a student to view their conversations"
        students={drillDown?.students ?? []}
        onClose={() => setDrillDown(null)}
        onSelectStudent={handleSelectStudent}
      />
    </Box>
  );
}
