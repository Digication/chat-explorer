import React, { useState } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_OVERVIEW, GET_STUDENT_ENGAGEMENT } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import StudentDrillDown, { type StudentItem } from "@/components/insights/StudentDrillDown";

interface MetricDef {
  label: string;
  /** Unique key used to identify clickable cards. */
  key: string;
  value: (data: Record<string, any>) => string;
  /** Whether this card supports drill-down. */
  clickable?: boolean;
}

/** The six summary cards shown at the top of the Insights page. */
const METRICS: MetricDef[] = [
  {
    key: "threadCount",
    label: "Thread Count",
    value: (d) => String(d.threadCount ?? 0),
  },
  {
    key: "participants",
    label: "Participants",
    value: (d) => String(d.participantCount ?? 0),
    clickable: true, // Opens student drill-down
  },
  {
    key: "commentCount",
    label: "Comment Count",
    value: (d) => String(d.totalComments ?? 0),
  },
  {
    key: "wordCountMean",
    label: "Word Count (mean)",
    value: (d) => String(Math.round(d.wordCountStats?.mean ?? 0)),
  },
  {
    key: "toriTags",
    label: "TORI Tags",
    value: (d) => String(d.toriTagCount ?? 0),
  },
  {
    key: "dateRange",
    label: "Date Range",
    value: (d) => {
      const dr = d.dateRange;
      if (!dr?.earliest || !dr?.latest) return "N/A";
      // Show short dates like "Jan 3 – Mar 12"
      const fmt = (iso: string) =>
        new Date(iso).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      return `${fmt(dr.earliest)} – ${fmt(dr.latest)}`;
    },
  },
];

interface MetricsCardsProps {
  /** Called when a student is selected from the drill-down popover. */
  onViewThread?: (threadId: string, studentName: string) => void;
}

export default function MetricsCards({ onViewThread }: MetricsCardsProps) {
  const { scope } = useInsightsScope();
  const [drillDown, setDrillDown] = useState<{
    anchorEl: HTMLElement;
    students: StudentItem[];
  } | null>(null);

  const { data, loading, error, refetch } = useQuery<any>(GET_OVERVIEW, {
    variables: { scope },
    skip: !scope,
  });

  // Fetch student profiles for the Participants drill-down.
  const { data: profilesData } = useQuery<any>(GET_STUDENT_ENGAGEMENT, {
    variables: { scope },
    skip: !scope,
  });

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
        Failed to load overview metrics.
      </Alert>
    );
  }

  const overview = data?.overview?.data;

  /** Handle click on a clickable metric card. */
  const handleCardClick = (event: React.MouseEvent<HTMLElement>, metricKey: string) => {
    if (metricKey === "participants") {
      const profiles: Array<{
        studentId: string;
        name: string;
        modalCategory: string;
        commentCount: number;
      }> = profilesData?.instructionalInsights?.data?.studentProfiles ?? [];

      const students: StudentItem[] = profiles.map((p) => ({
        studentId: p.studentId,
        name: p.name,
        modalCategory: p.modalCategory,
        commentCount: p.commentCount,
      }));

      setDrillDown({ anchorEl: event.currentTarget, students });
    }
  };

  /** Called when a student is selected in the drill-down. */
  const handleSelectStudent = (studentId: string, studentName: string) => {
    if (onViewThread) {
      onViewThread(studentId, studentName);
    }
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Grid container spacing={2}>
        {METRICS.map((m) => (
          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={m.label}>
            <Card
              variant="outlined"
              onClick={m.clickable && overview ? (e) => handleCardClick(e, m.key) : undefined}
              sx={{
                height: "100%",
                ...(m.clickable && overview
                  ? {
                      cursor: "pointer",
                      transition: "box-shadow 0.2s ease",
                      "&:hover": {
                        boxShadow: 2,
                      },
                    }
                  : {}),
              }}
            >
              <CardContent>
                {loading || !overview ? (
                  <>
                    <Skeleton variant="text" width="60%" height={40} />
                    <Skeleton variant="text" width="80%" />
                  </>
                ) : (
                  <>
                    <Typography variant="h5" fontWeight={600}>
                      {m.value(overview)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {m.label}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Student drill-down popover for the Participants card */}
      <StudentDrillDown
        anchorEl={drillDown?.anchorEl ?? null}
        title={`All Participants — ${drillDown?.students.length ?? 0} student${(drillDown?.students.length ?? 0) !== 1 ? "s" : ""}`}
        subtitle="Click a student to view their conversations"
        students={drillDown?.students ?? []}
        onClose={() => setDrillDown(null)}
        onSelectStudent={handleSelectStudent}
      />
    </Box>
  );
}
