import React from "react";
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
import { GET_ENGAGEMENT } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

// Color mapping for each depth band.
const BAND_CONFIG = [
  { key: "SURFACE", label: "Surface", color: "#ef5350" },
  { key: "DEVELOPING", label: "Developing", color: "#ffa726" },
  { key: "DEEP", label: "Deep", color: "#66bb6a" },
] as const;

export default function DepthBands() {
  const { scope } = useInsightsScope();

  const { data, loading, error, refetch } = useQuery<any>(GET_ENGAGEMENT, {
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
  const total =
    (dist.SURFACE ?? 0) + (dist.DEVELOPING ?? 0) + (dist.DEEP ?? 0);

  // Compute percentages.
  const bands = BAND_CONFIG.map((b) => {
    const count = (dist[b.key] as number) ?? 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { ...b, count, pct };
  });

  return (
    <Box>
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
        {bands.map((b) =>
          b.pct > 0 ? (
            <Box
              key={b.key}
              sx={{
                width: `${b.pct}%`,
                bgcolor: b.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width 0.3s ease",
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

      {/* Summary table */}
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
              <TableCell align="right">{b.count}</TableCell>
              <TableCell align="right">{b.pct.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
