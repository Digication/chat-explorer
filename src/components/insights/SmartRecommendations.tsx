import React from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { GET_RECOMMENDATIONS } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

// Map priority to chip color.
function priorityColor(
  priority: string,
): "error" | "warning" | "success" | "default" {
  switch (priority?.toLowerCase()) {
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "success";
    default:
      return "default";
  }
}

export default function SmartRecommendations() {
  const { scope } = useInsightsScope();

  const { data, loading, error, refetch } = useQuery<any>(GET_RECOMMENDATIONS, {
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
        Failed to load recommendations.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ mb: 4 }}>
        <Grid container spacing={2}>
          {[0, 1, 2].map((i) => (
            <Grid size={{ xs: 12, md: 4 }} key={i}>
              <Skeleton variant="rectangular" height={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const recs = data?.recommendations?.data ?? [];

  // ── Empty state ────────────────────────────────────────────────────────────

  if (recs.length === 0) {
    return (
      <Box sx={{ mb: 4 }}>
        <Alert severity="info" icon={<LightbulbIcon />}>
          Upload more data to unlock smart recommendations.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 4 }}>
      <Grid container spacing={2}>
        {recs.map(
          (
            rec: { visualization: string; reason: string; priority: string },
            i: number,
          ) => (
            <Grid size={{ xs: 12, md: 4 }} key={i}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={600}>
                      {rec.visualization}
                    </Typography>
                    <Chip
                      label={rec.priority}
                      size="small"
                      color={priorityColor(rec.priority)}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {rec.reason}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ),
        )}
      </Grid>
    </Box>
  );
}
