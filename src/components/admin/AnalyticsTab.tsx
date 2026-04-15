import { useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Skeleton,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Select,
  MenuItem,
} from "@mui/material";
import { useQuery, useMutation } from "@apollo/client/react";
import { useAuth } from "@/lib/AuthProvider";
import {
  GET_TELEMETRY_SUMMARY,
  PURGE_OLD_TELEMETRY,
} from "@/lib/queries/telemetry";
import { GET_INSTITUTIONS } from "@/lib/queries/admin";

// Default date range: last 30 days
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a category + action pair into a readable label. */
function featureLabel(category: string, action: string) {
  const cat = category.replace(/_/g, " ");
  const act = action.replace(/_/g, " ");
  return `${cat} / ${act}`;
}

export default function AnalyticsTab() {
  const { user } = useAuth();
  const isDigicationAdmin = user?.role === "digication_admin";

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [institutionId, setInstitutionId] = useState<string>("");
  const [purgeOpen, setPurgeOpen] = useState(false);

  // Fetch institutions for the filter dropdown (digication_admin only)
  const { data: instData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: !isDigicationAdmin,
  });

  const { data, loading, error } = useQuery<any>(GET_TELEMETRY_SUMMARY, {
    variables: {
      institutionId: institutionId || undefined,
      startDate,
      endDate,
    },
  });

  const [purgeEvents, { loading: purging }] = useMutation(PURGE_OLD_TELEMETRY, {
    refetchQueries: [{ query: GET_TELEMETRY_SUMMARY, variables: { institutionId: institutionId || undefined, startDate, endDate } }],
  });

  const summary = data?.telemetrySummary;

  // Simple bar chart data for daily events
  const maxCount = useMemo(
    () =>
      summary?.dailyEvents?.reduce(
        (max: number, d: { count: number }) => Math.max(max, d.count),
        0
      ) ?? 0,
    [summary]
  );

  const handlePurge = async () => {
    await purgeEvents({ variables: { olderThanDays: 90 } });
    setPurgeOpen(false);
  };

  return (
    <Box>
      {/* ── Filters ──────────────────────────────────────────── */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="Start date"
          type="date"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="End date"
          type="date"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {isDigicationAdmin && instData?.institutions && (
          <Select
            displayEmpty
            size="small"
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All institutions</MenuItem>
            {instData.institutions.map((inst: { id: string; name: string }) => (
              <MenuItem key={inst.id} value={inst.id}>
                {inst.name}
              </MenuItem>
            ))}
          </Select>
        )}
      </Box>

      {loading && <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />}
      {error && <Alert severity="error">Failed to load analytics: {error.message}</Alert>}

      {summary && (
        <>
          {/* ── Active Users ────────────────────────────────── */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Active Users
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            {[
              { label: "Today", value: summary.activeUsers.daily },
              { label: "Last 7 days", value: summary.activeUsers.weekly },
              { label: "Last 30 days", value: summary.activeUsers.monthly },
            ].map((item) => (
              <Card key={item.label} variant="outlined" sx={{ minWidth: 140, flex: 1 }}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Typography variant="body2" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography variant="h4" fontWeight={500}>
                    {item.value}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* ── AI Chat Adoption ────────────────────────────── */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            AI Chat Adoption
          </Typography>
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="body2" color="text.secondary">
                {summary.aiChatAdoption.usersWhoUsedFeature} of{" "}
                {summary.aiChatAdoption.totalUsers} users (
                {(summary.aiChatAdoption.rate * 100).toFixed(0)}%)
              </Typography>
            </CardContent>
          </Card>

          {/* ── Top Features ────────────────────────────────── */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Top Features
          </Typography>
          <Table size="small" sx={{ mb: 3 }}>
            <TableHead>
              <TableRow>
                <TableCell>Feature</TableCell>
                <TableCell align="right">Events</TableCell>
                <TableCell align="right">Unique Users</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.topFeatures.map(
                (f: { category: string; action: string; count: number; uniqueUsers: number }) => (
                  <TableRow key={`${f.category}-${f.action}`}>
                    <TableCell sx={{ textTransform: "capitalize" }}>
                      {featureLabel(f.category, f.action)}
                    </TableCell>
                    <TableCell align="right">{f.count}</TableCell>
                    <TableCell align="right">{f.uniqueUsers}</TableCell>
                  </TableRow>
                )
              )}
              {summary.topFeatures.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No events recorded yet
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* ── Daily Activity (simple SVG bar chart) ──────── */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Daily Activity
          </Typography>
          {summary.dailyEvents.length > 0 ? (
            <Box
              sx={{
                overflowX: "auto",
                mb: 3,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 2,
              }}
            >
              <svg
                width={Math.max(summary.dailyEvents.length * 28, 300)}
                height={140}
                role="img"
                aria-label="Daily event counts bar chart"
              >
                {summary.dailyEvents.map(
                  (d: { date: string; count: number }, i: number) => {
                    const barHeight =
                      maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                    return (
                      <g key={d.date}>
                        <title>
                          {d.date}: {d.count} events
                        </title>
                        <rect
                          x={i * 28 + 4}
                          y={110 - barHeight}
                          width={20}
                          height={barHeight}
                          fill="#1976d2"
                          rx={2}
                        />
                        {/* Date label (show every 7th) */}
                        {i % 7 === 0 && (
                          <text
                            x={i * 28 + 14}
                            y={130}
                            textAnchor="middle"
                            fontSize={9}
                            fill="#666"
                          >
                            {d.date.slice(5)}
                          </text>
                        )}
                      </g>
                    );
                  }
                )}
              </svg>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              No daily data for this period
            </Typography>
          )}

          {/* ── Purge (digication_admin only) ─────────────── */}
          {isDigicationAdmin && (
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={() => setPurgeOpen(true)}
              >
                Purge events older than 90 days
              </Button>
              <Dialog open={purgeOpen} onClose={() => setPurgeOpen(false)}>
                <DialogTitle>Purge Old Telemetry</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    This will permanently delete all telemetry events older than
                    90 days. This cannot be undone.
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setPurgeOpen(false)}>Cancel</Button>
                  <Button
                    color="warning"
                    onClick={handlePurge}
                    disabled={purging}
                  >
                    {purging ? "Purging..." : "Purge"}
                  </Button>
                </DialogActions>
              </Dialog>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
