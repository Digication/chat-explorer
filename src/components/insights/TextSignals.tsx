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
import { GET_TEXT_SIGNALS } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

/** Maps each aggregate key to a friendly label and whether it's a ratio (2 decimals) vs integer. */
const SIGNAL_DEFS = [
  { key: "questionCount", label: "Questions Asked", isRatio: false },
  { key: "avgSentenceLength", label: "Avg Sentence Length", isRatio: true },
  { key: "lexicalDiversity", label: "Lexical Diversity", isRatio: true },
  { key: "hedgingCount", label: "Hedging Phrases", isRatio: false },
  { key: "specificityCount", label: "Specificity", isRatio: false },
  { key: "evidenceCount", label: "Evidence Citations", isRatio: false },
  { key: "logicalConnectorCount", label: "Logical Connectors", isRatio: false },
] as const;

/** Format a number — 2 decimal places for ratios, rounded integer otherwise. */
function fmt(value: number | null | undefined, isRatio: boolean): string {
  if (value == null) return "N/A";
  return isRatio ? value.toFixed(2) : String(Math.round(value));
}

export default function TextSignals() {
  const { scope } = useInsightsScope();

  const { data, loading, error, refetch } = useQuery<any>(GET_TEXT_SIGNALS, {
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
        Failed to load text signals.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !data?.textSignals?.data) {
    return (
      <Grid container spacing={2}>
        {SIGNAL_DEFS.map((s) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={s.key}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Skeleton variant="text" width="50%" height={48} />
                <Skeleton variant="text" width="70%" />
                <Skeleton variant="text" width="60%" />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  const aggregates = data.textSignals.data.aggregates;

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!aggregates) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No text signal data available for this scope.
      </Typography>
    );
  }

  // ── Data cards ─────────────────────────────────────────────────────────────

  return (
    <Grid container spacing={2}>
      {SIGNAL_DEFS.map((s) => {
        const stat = aggregates[s.key];
        return (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={s.key}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                {/* Large mean value */}
                <Typography variant="h4" fontWeight={600}>
                  {fmt(stat?.mean, s.isRatio)}
                </Typography>

                {/* Signal label */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {s.label}
                </Typography>

                {/* Median and standard deviation */}
                <Typography variant="caption" color="text.secondary">
                  Median: {fmt(stat?.median, s.isRatio)} · Std Dev:{" "}
                  {fmt(stat?.stddev, s.isRatio)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}
