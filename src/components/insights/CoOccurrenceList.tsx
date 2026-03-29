import React, { useState } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_TORI_ANALYSIS } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

const DEFAULT_LIMIT = 15;

export default function CoOccurrenceList() {
  const { scope } = useInsightsScope();
  const [showAll, setShowAll] = useState(false);

  const { data, loading, error, refetch } = useQuery<any>(GET_TORI_ANALYSIS, {
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
        Failed to load co-occurrence data.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !data?.toriAnalysis?.data) {
    return (
      <Box>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="text" height={40} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  // Sort pairs by count descending.
  const pairs = [...(data.toriAnalysis.data.coOccurrencePairs ?? [])].sort(
    (a: { count: number }, b: { count: number }) => b.count - a.count,
  );

  if (pairs.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No co-occurrence data available for this scope.
      </Typography>
    );
  }

  const visible = showAll ? pairs : pairs.slice(0, DEFAULT_LIMIT);

  return (
    <Box>
      <List dense disablePadding>
        {visible.map((pair: { tags: string[]; count: number }, i: number) => (
          <ListItem key={i} divider sx={{ py: 1 }}>
            <ListItemText
              primary={
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
                >
                  <Chip label={pair.tags[0]} size="small" color="primary" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    &amp;
                  </Typography>
                  <Chip label={pair.tags[1]} size="small" color="primary" variant="outlined" />
                </Box>
              }
            />
            <Typography variant="body2" fontWeight={600} sx={{ ml: 2, whiteSpace: "nowrap" }}>
              {pair.count}
            </Typography>
          </ListItem>
        ))}
      </List>

      {pairs.length > DEFAULT_LIMIT && (
        <Button
          size="small"
          onClick={() => setShowAll((prev) => !prev)}
          sx={{ mt: 1 }}
        >
          {showAll ? "Show less" : `Show more (${pairs.length - DEFAULT_LIMIT} remaining)`}
        </Button>
      )}
    </Box>
  );
}
