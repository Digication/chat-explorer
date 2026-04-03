import React, { useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
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

// ── Sparkline renderer ─────────────────────────────────────────────────────────

/**
 * Full-width SVG sparkline for one student row.
 * Each row is normalized by its own max so every student's shape is visible
 * regardless of their absolute tag counts.
 */
function Sparkline({
  values,
  labels,
  globalMax,
}: {
  values: number[];
  labels: string[];
  globalMax: number;
}) {
  // viewBox coordinates — SVG scales to fill whatever width the td gives it
  const VW = 1000;
  const H = 40;
  const pad = 6;

  if (values.length === 0) return null;

  // Normalize by each row's own max so no row looks flat
  const rowMax = Math.max(...values, 1);

  const getX = (i: number) =>
    values.length === 1
      ? VW / 2
      : (i / (values.length - 1)) * (VW - pad * 2) + pad;

  const getY = (v: number) =>
    H - pad - (v / rowMax) * (H - pad * 2);

  const points = values.map((v, i) => `${getX(i)},${getY(v)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${VW} ${H}`}
      width="100%"
      height={H}
      style={{ display: "block", minWidth: 200 }}
      preserveAspectRatio="none"
    >
      {/* Baseline */}
      <line
        x1={pad}
        y1={H - pad}
        x2={VW - pad}
        y2={H - pad}
        stroke="#e0e0e0"
        strokeWidth={1}
      />
      <polyline
        points={points}
        fill="none"
        stroke="#1565c0"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots with native SVG tooltip */}
      {values.map((v, i) => {
        const cx = getX(i);
        const cy = getY(v);
        // Color dot relative to global max so intensity is comparable across students
        const t = globalMax > 0 ? v / globalMax : 0;
        return (
          <g key={i} style={{ cursor: "default" }}>
            <title>{`${labels[i]}: ${v}`}</title>
            {/* Invisible wider hit area */}
            <circle cx={cx} cy={cy} r={10} fill="transparent" />
            <circle
              cx={cx}
              cy={cy}
              r={v > 0 ? 4 : 2}
              fill={v > 0 ? cellColor(t) : "#ddd"}
              stroke={v > 0 ? "#1565c0" : "#bbb"}
              strokeWidth={0.8}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Small-multiples card ───────────────────────────────────────────────────────

/** Tag list card for one student (used in small-multiples mode). */
function StudentTagCard({
  name,
  values,
  labels,
}: {
  name: string;
  values: number[];
  labels: string[];
}) {
  const tags = labels
    .map((label, i) => ({ label, count: values[i] }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, width: 180, flexShrink: 0 }}>
      <Tooltip title={name} arrow>
        <Typography
          variant="caption"
          fontWeight={700}
          display="block"
          noWrap
          sx={{ mb: 0.75, fontSize: 11 }}
        >
          {name}
        </Typography>
      </Tooltip>
      {tags.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
          No tags
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {tags.slice(0, 7).map(({ label, count }) => (
            <Box
              component="li"
              key={label}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                py: "1px",
              }}
            >
              <Typography
                variant="caption"
                noWrap
                sx={{ flex: 1, fontSize: 10, color: "text.primary" }}
              >
                {label}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontSize: 10,
                  color: "text.secondary",
                  ml: 0.5,
                  flexShrink: 0,
                }}
              >
                {count}
              </Typography>
            </Box>
          ))}
          {tags.length > 7 && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontSize: 10 }}
            >
              +{tags.length - 7} more
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

type DisplayMode = "CLASSIC" | "SPARKLINE" | "SMALL_MULTIPLES";

export default function HeatmapView() {
  const { scope } = useInsightsScope();

  const [mode, setMode] = useState<DisplayMode>("CLASSIC");
  const [scaling, setScaling] = useState<"RAW" | "ROW" | "GLOBAL">("RAW");

  const { data, loading, error, refetch } = useQuery<any>(GET_HEATMAP, {
    variables: {
      input: { scope, mode: "CLASSIC", scaling },
    },
    skip: !scope,
  });

  const handleMode = useCallback(
    (_: React.MouseEvent<HTMLElement>, val: string | null) => {
      if (val) setMode(val as DisplayMode);
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
          <ToggleButton value="SPARKLINE">Sparkline</ToggleButton>
          <ToggleButton value="SMALL_MULTIPLES">Small Multiples</ToggleButton>
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

      {/* ── Sparkline rows ── */}
      {mode === "SPARKLINE" && (
        <Box>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <tbody>
              {rowOrder.map((ri) => {
                const values = colOrder.map((ci) => matrix[ri]?.[ci] ?? 0);
                return (
                  <tr key={ri}>
                    <td
                      style={{
                        padding: "3px 12px 3px 0",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        width: 140,
                        verticalAlign: "middle",
                      }}
                    >
                      {rowLabels[ri]}
                    </td>
                    <td style={{ padding: "2px 0", verticalAlign: "middle", width: "100%" }}>
                      <Sparkline
                        values={values}
                        labels={colOrder.map((ci) => colLabels[ci])}
                        globalMax={maxVal}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      )}

      {/* ── Small multiples ── */}
      {mode === "SMALL_MULTIPLES" && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
          {rowOrder.map((ri) => (
            <StudentTagCard
              key={ri}
              name={rowLabels[ri]}
              values={colOrder.map((ci) => matrix[ri]?.[ci] ?? 0)}
              labels={colOrder.map((ci) => colLabels[ci])}
            />
          ))}
        </Box>
      )}

      {/* ── Classic table ── */}
      {mode === "CLASSIC" && (
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
                            background: cellColor(t),
                            color: textColor(t),
                          }}
                        >
                          {raw > 0 ? raw : null}
                        </td>
                      </Tooltip>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </Box>
  );
}
