import React from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_OVERVIEW } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

interface MetricDef {
  label: string;
  value: (data: Record<string, any>) => string;
}

/** The six summary cards shown at the top of the Insights page. */
const METRICS: MetricDef[] = [
  {
    label: "Thread Count",
    value: (d) => String(d.threadCount ?? 0),
  },
  {
    label: "Participants",
    value: (d) => String(d.participantCount ?? 0),
  },
  {
    label: "Comment Count",
    value: (d) => String(d.totalComments ?? 0),
  },
  {
    label: "Word Count (mean)",
    value: (d) => String(Math.round(d.wordCountStats?.mean ?? 0)),
  },
  {
    label: "TORI Tags",
    value: (d) => String(d.toriTagCount ?? 0),
  },
  {
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

export default function MetricsCards() {
  const { scope } = useInsightsScope();

  const { data, loading, error, refetch } = useQuery<any>(GET_OVERVIEW, {
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

  return (
    <Box sx={{ mb: 4 }}>
      <Grid container spacing={2}>
        {METRICS.map((m) => (
          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={m.label}>
            <Card variant="outlined" sx={{ height: "100%" }}>
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
    </Box>
  );
}
