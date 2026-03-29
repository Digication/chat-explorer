import React, { useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { GET_HEATMAP } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

// ── Color helpers ──────────────────────────────────────────────────────────────

/** Interpolate between light yellow and deep blue based on 0-1 value. */
function cellColor(t: number): string {
  // light yellow #fff9c4 → deep blue #1565c0
  const r = Math.round(255 + (21 - 255) * t);
  const g = Math.round(249 + (101 - 249) * t);
  const b = Math.round(196 + (192 - 196) * t);
  return `rgb(${r},${g},${b})`;
}

/** Pick a readable text color (dark or light) depending on background. */
function textColor(t: number): string {
  return t > 0.5 ? "#fff" : "#333";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function HeatmapView() {
  const { scope } = useInsightsScope();

  const [mode, setMode] = useState<"CLASSIC" | "CLUSTERED" | "DOT">("CLASSIC");
  const [scaling, setScaling] = useState<"RAW" | "ROW" | "GLOBAL">("RAW");

  const { data, loading, error, refetch } = useQuery<any>(GET_HEATMAP, {
    variables: {
      input: { scope, mode, scaling },
    },
    skip: !scope,
  });

  const handleMode = useCallback(
    (_: React.MouseEvent<HTMLElement>, val: string | null) => {
      if (val) setMode(val as typeof mode);
    },
    [],
  );

  const handleScaling = useCallback(
    (_: React.MouseEvent<HTMLElement>, val: string | null) => {
      if (val) setScaling(val as typeof scaling);
    },
    [],
  );

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
        Failed to load heatmap data.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !data?.heatmap?.data) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={300} />
      </Box>
    );
  }

  const hm = data.heatmap.data;
  const matrix: number[][] = hm.matrix;
  const rowLabels: string[] = hm.rowLabels;
  const colLabels: string[] = hm.colLabels;
  const rowOrder: number[] = hm.rowOrder ?? rowLabels.map((_: string, i: number) => i);
  const colOrder: number[] = hm.colOrder ?? colLabels.map((_: string, i: number) => i);

  // Find max value for normalization.
  const allValues = matrix.flat();
  const maxVal = Math.max(...allValues, 1);

  return (
    <Box>
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 2,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Mode:
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={handleMode}
        >
          <ToggleButton value="CLASSIC">Classic</ToggleButton>
          <ToggleButton value="CLUSTERED">Clustered</ToggleButton>
          <ToggleButton value="DOT">Dot</ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
          Scaling:
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scaling}
          onChange={handleScaling}
        >
          <ToggleButton value="RAW">Raw</ToggleButton>
          <ToggleButton value="ROW">Row</ToggleButton>
          <ToggleButton value="GLOBAL">Global</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Scrollable table */}
      <Box sx={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 12,
            minWidth: colLabels.length * 60 + 140,
          }}
        >
          <thead>
            <tr>
              {/* Empty corner cell */}
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  background: "var(--mui-palette-background-paper, #fff)",
                  zIndex: 2,
                  minWidth: 120,
                }}
              />
              {colOrder.map((ci) => (
                <th
                  key={ci}
                  style={{
                    padding: "4px 6px",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  {colLabels[ci]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowOrder.map((ri) => (
              <tr key={ri}>
                {/* Row label — sticky on the left */}
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "var(--mui-palette-background-paper, #fff)",
                    zIndex: 1,
                    padding: "4px 8px",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {rowLabels[ri]}
                </td>
                {colOrder.map((ci) => {
                  const raw = matrix[ri]?.[ci] ?? 0;
                  const t = maxVal > 0 ? raw / maxVal : 0;

                  return (
                    <Tooltip
                      key={ci}
                      title={`${rowLabels[ri]} × ${colLabels[ci]}: ${raw}`}
                      arrow
                    >
                      <td
                        style={{
                          width: 48,
                          height: 32,
                          textAlign: "center",
                          padding: 2,
                          border: "1px solid rgba(0,0,0,0.06)",
                          background:
                            mode === "DOT" ? "transparent" : cellColor(t),
                          color: textColor(t),
                        }}
                      >
                        {mode === "DOT" ? (
                          /* Render a small SVG circle scaled by value */
                          <svg width={28} height={28} viewBox="0 0 28 28">
                            <circle
                              cx={14}
                              cy={14}
                              r={Math.max(2, t * 12)}
                              fill={cellColor(t)}
                            />
                          </svg>
                        ) : raw > 0 ? (
                          raw
                        ) : null}
                      </td>
                    </Tooltip>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
