import React, { useState } from "react";
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
import StudentDrillDown, { type StudentItem } from "@/components/insights/StudentDrillDown";

// Color mapping for each depth band.
const BAND_CONFIG = [
  { key: "SURFACE", label: "Surface", color: "#ef5350" },
  { key: "DEVELOPING", label: "Developing", color: "#ffa726" },
  { key: "DEEP", label: "Deep", color: "#66bb6a" },
] as const;

interface DepthBandsProps {
  /** Called when a student is selected from the drill-down popover. */
  onViewThread?: (threadId: string, studentName: string) => void;
}

/** State for the drill-down popover. */
interface DrillDownState {
  anchorEl: HTMLElement;
  band: string;
  students: StudentItem[];
}

export default function DepthBands({ onViewThread }: DepthBandsProps) {
  const { scope } = useInsightsScope();
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  // Fetch depth distribution + per-student engagement data.
  const { data, loading, error, refetch } = useQuery<any>(GET_ENGAGEMENT, {
    variables: { scope },
    skip: !scope,
  });

  // Fetch student profiles (for names) from instructionalInsights.
  const { data: profilesData } = useQuery<any>(GET_STUDENT_ENGAGEMENT, {
    variables: { scope },
    skip: !scope,
  });

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
        Failed to load engagement data.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !data?.engagement?.data) {
    return <Skeleton variant="rectangular" height={120} />;
  }

  const dist = data.engagement.data.depthDistribution;
  const perStudent: Array<{
    studentId: string;
    averageScore: number;
    depthBand: string;
    commentCount: number;
  }> = data.engagement.data.perStudent ?? [];

  // Build a lookup from studentId → name using the profiles query.
  const studentProfiles: Array<{ studentId: string; name: string; engagementScore?: number; commentCount?: number; depthBand?: string }> =
    profilesData?.instructionalInsights?.data?.studentProfiles ?? [];
  const nameMap = new Map(studentProfiles.map((p) => [p.studentId, p]));

  const total =
    (dist.SURFACE ?? 0) + (dist.DEVELOPING ?? 0) + (dist.DEEP ?? 0);

  // Compute percentages.
  const bands = BAND_CONFIG.map((b) => {
    const count = (dist[b.key] as number) ?? 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { ...b, count, pct };
  });

  /** Open drill-down popover for a specific band. */
  const handleBandClick = (event: React.MouseEvent<HTMLElement>, bandKey: string) => {
    // Filter perStudent to this band and resolve names from profiles.
    const matching: StudentItem[] = perStudent
      .filter((s) => s.depthBand === bandKey)
      .map((s) => {
        const profile = nameMap.get(s.studentId);
        return {
          studentId: s.studentId,
          name: profile?.name ?? s.studentId,
          depthBand: s.depthBand,
          commentCount: s.commentCount,
          engagementScore: profile?.engagementScore,
        };
      });

    setDrillDown({
      anchorEl: event.currentTarget,
      band: bandKey,
      students: matching,
    });
  };

  /** Called when a student is selected in the drill-down. */
  const handleSelectStudent = (studentId: string, studentName: string) => {
    // Pass through to parent — the parent (InsightsPage) can handle
    // loading the student's threads in the ThreadPanel.
    if (onViewThread) {
      onViewThread(studentId, studentName);
    }
  };

  // Find the label for the currently selected band.
  const activeBandLabel =
    BAND_CONFIG.find((b) => b.key === drillDown?.band)?.label ?? "";

  return (
    <Box>
      {/* Stacked horizontal bar — each segment is clickable */}
      <Box
        sx={{
          display: "flex",
          height: 36,
          borderRadius: 1,
          overflow: "hidden",
          mb: 2,
        }}
      >
        {bands.map((b) =>
          b.pct > 0 ? (
            <Box
              key={b.key}
              onClick={(e) => handleBandClick(e, b.key)}
              sx={{
                width: `${b.pct}%`,
                bgcolor: b.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width 0.3s ease",
                cursor: "pointer",
                "&:hover": { opacity: 0.85 },
              }}
            >
              {b.pct >= 8 && (
                <Typography variant="caption" sx={{ color: "#fff", fontWeight: 600 }}>
                  {Math.round(b.pct)}%
                </Typography>
              )}
            </Box>
          ) : null,
        )}
      </Box>

      {/* Summary table — count cells are clickable */}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Band</TableCell>
            <TableCell align="right">Count</TableCell>
            <TableCell align="right">Percentage</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bands.map((b) => (
            <TableRow key={b.key}>
              <TableCell>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: b.color,
                      flexShrink: 0,
                    }}
                  />
                  {b.label}
                </Box>
              </TableCell>
              <TableCell align="right">
                <Typography
                  component="span"
                  variant="body2"
                  onClick={(e) => handleBandClick(e as any, b.key)}
                  sx={{
                    cursor: "pointer",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {b.count}
                </Typography>
              </TableCell>
              <TableCell align="right">{b.pct.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Student drill-down popover */}
      <StudentDrillDown
        anchorEl={drillDown?.anchorEl ?? null}
        title={`${activeBandLabel} — ${drillDown?.students.length ?? 0} student${(drillDown?.students.length ?? 0) !== 1 ? "s" : ""}`}
        subtitle="Click a student to view their conversations"
        students={drillDown?.students ?? []}
        onClose={() => setDrillDown(null)}
        onSelectStudent={handleSelectStudent}
      />
    </Box>
  );
}
