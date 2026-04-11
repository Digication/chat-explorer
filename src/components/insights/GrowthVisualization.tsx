import { useState, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  Chip,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { GET_GROWTH } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useUserSettings } from "@/lib/UserSettingsContext";
import { CATEGORY_CONFIG, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/reflection-categories";

type ViewMode = "sparklines" | "matrix" | "delta";

/** Map category key → ordinal (0–3) for positioning on sparkline Y axis. */
const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  CATEGORY_CONFIG.map((c, i) => [c.key, i])
);
const MAX_ORDINAL = CATEGORY_CONFIG.length - 1;

interface GrowthVisualizationProps {
  onViewThread?: (threadId: string, studentName: string) => void;
}

export default function GrowthVisualization({ onViewThread }: GrowthVisualizationProps) {
  const { scope } = useInsightsScope();
  const { getDisplayName } = useUserSettings();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("sparklines");
  const [deltaA1, setDeltaA1] = useState<string>("");
  const [deltaA2, setDeltaA2] = useState<string>("");

  const { data, loading, error } = useQuery<any>(GET_GROWTH, {
    variables: { scope },
    skip: !scope?.institutionId,
  });

  const students = data?.growth?.data ?? [];

  // Collect all unique assignments in date order
  const assignments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; date: string }>();
    for (const s of students) {
      for (const dp of s.dataPoints) {
        if (!map.has(dp.assignmentId)) {
          map.set(dp.assignmentId, {
            id: dp.assignmentId,
            name: dp.assignmentName,
            date: dp.date,
          });
        }
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [students]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load growth data: {error.message}</Alert>;
  }

  if (students.length === 0 || assignments.length < 2) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        Growth visualization requires at least 2 assignments with student data.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Tab selector */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
        >
          <ToggleButton value="sparklines">Sparklines</ToggleButton>
          <ToggleButton value="matrix">Matrix</ToggleButton>
          <ToggleButton value="delta">Before / After</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === "sparklines" && (
        <SparklineView students={students} assignments={assignments} getDisplayName={getDisplayName} onNavigate={(id) => navigate(`/insights/student/${id}`)} />
      )}
      {viewMode === "matrix" && (
        <MatrixView students={students} assignments={assignments} getDisplayName={getDisplayName} onNavigate={(id) => navigate(`/insights/student/${id}`)} />
      )}
      {viewMode === "delta" && (
        <DeltaView
          students={students}
          assignments={assignments}
          getDisplayName={getDisplayName}
          a1={deltaA1}
          a2={deltaA2}
          onA1Change={setDeltaA1}
          onA2Change={setDeltaA2}
        />
      )}
    </Box>
  );
}

// ── Sparkline View ──────────────────────────────────────────────────

interface ViewProps {
  students: any[];
  assignments: { id: string; name: string; date: string }[];
  getDisplayName: (name: string) => string;
  onNavigate?: (studentId: string) => void;
}

function SparklineView({ students, assignments, getDisplayName, onNavigate }: ViewProps) {
  const W = 200;
  const H = 48;
  const padding = 6;

  return (
    <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500, fontSize: "0.8rem" }}>
            Student
          </th>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500, fontSize: "0.8rem" }}>
            Trajectory
          </th>
          <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 500, fontSize: "0.8rem" }}>
            Latest
          </th>
          <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 500, fontSize: "0.8rem" }}>
            Trend
          </th>
        </tr>
      </thead>
      <tbody>
        {students.map((s: any) => {
          const points = s.dataPoints;
          if (points.length === 0) return null;

          const latest = points[points.length - 1];
          const first = points[0];
          const latestOrd = CATEGORY_ORDER[latest.category] ?? 0;
          const firstOrd = CATEGORY_ORDER[first.category] ?? 0;
          const trend = latestOrd - firstOrd;

          // Build SVG sparkline path using category ordinal as Y
          const xStep = points.length > 1 ? (W - padding * 2) / (points.length - 1) : 0;
          const pathD = points
            .map((p: any, i: number) => {
              const ord = CATEGORY_ORDER[p.category] ?? 0;
              const x = padding + i * xStep;
              const y = H - padding - (ord / MAX_ORDINAL) * (H - padding * 2);
              return `${i === 0 ? "M" : "L"}${x},${y}`;
            })
            .join(" ");

          return (
            <tr key={s.studentId} style={{ borderBottom: "1px solid #eee" }}>
              <td
                style={{ padding: "6px 8px", fontSize: "0.8rem", whiteSpace: "nowrap", cursor: "pointer", color: "#1976d2" }}
                onClick={() => onNavigate?.(s.studentId)}
              >
                {getDisplayName(s.name)}
              </td>
              <td style={{ padding: "4px 8px" }}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                  <path d={pathD} fill="none" stroke="#1976d2" strokeWidth={1.5} />
                  {points.map((p: any, i: number) => {
                    const ord = CATEGORY_ORDER[p.category] ?? 0;
                    return (
                      <Tooltip key={i} title={`${p.assignmentName}: ${CATEGORY_LABELS[p.category] ?? p.category}`}>
                        <circle
                          cx={padding + i * xStep}
                          cy={H - padding - (ord / MAX_ORDINAL) * (H - padding * 2)}
                          r={3}
                          fill={CATEGORY_COLORS[p.category] ?? "#999"}
                        />
                      </Tooltip>
                    );
                  })}
                </svg>
              </td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                <Chip
                  label={CATEGORY_CONFIG.find((c) => c.key === latest.category)?.shortLabel ?? latest.category}
                  size="small"
                  sx={{
                    bgcolor: CATEGORY_COLORS[latest.category],
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    height: 22,
                  }}
                />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                {trend > 0 ? (
                  <ArrowUpwardIcon sx={{ fontSize: 16, color: "success.main" }} />
                ) : trend < 0 ? (
                  <ArrowDownwardIcon sx={{ fontSize: 16, color: "error.main" }} />
                ) : (
                  <Typography variant="caption" color="text.disabled">—</Typography>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}

// ── Matrix View ──────────────────────────────────────────────────────

function MatrixView({ students, assignments, getDisplayName, onNavigate }: ViewProps) {
  // Build lookup: studentId → assignmentId → category
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const s of students) {
      const sMap = new Map<string, string>();
      for (const dp of s.dataPoints) {
        sMap.set(dp.assignmentId, dp.category);
      }
      map.set(s.studentId, sMap);
    }
    return map;
  }, [students]);

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ borderCollapse: "collapse", fontSize: "0.75rem" }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 8px", textAlign: "left", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
              Student
            </th>
            {assignments.map((a) => (
              <th
                key={a.id}
                style={{
                  padding: "4px 6px",
                  textAlign: "center",
                  maxWidth: 80,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 500,
                }}
              >
                <Tooltip title={a.name}>
                  <span>{a.name.length > 12 ? a.name.slice(0, 12) + "\u2026" : a.name}</span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s: any) => (
            <tr key={s.studentId}>
              <td
                style={{ padding: "4px 8px", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fff", zIndex: 1, cursor: "pointer", color: "#1976d2" }}
                onClick={() => onNavigate?.(s.studentId)}
              >
                {getDisplayName(s.name)}
              </td>
              {assignments.map((a) => {
                const category = lookup.get(s.studentId)?.get(a.id);
                const color = category ? CATEGORY_COLORS[category] : undefined;
                const shortLabel = category
                  ? CATEGORY_CONFIG.find((c) => c.key === category)?.shortLabel ?? category
                  : undefined;
                return (
                  <td
                    key={a.id}
                    style={{
                      padding: "4px 6px",
                      textAlign: "center",
                      background: color ? `${color}22` : "#fafafa",
                      border: "1px solid #e0e0e0",
                    }}
                  >
                    {shortLabel ? (
                      <Tooltip title={`${a.name}: ${CATEGORY_LABELS[category!]}`}>
                        <span style={{ color: color, fontWeight: 600 }}>{shortLabel}</span>
                      </Tooltip>
                    ) : (
                      <span style={{ color: "#ccc" }}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

// ── Delta View ──────────────────────────────────────────────────────

interface DeltaViewProps extends ViewProps {
  a1: string;
  a2: string;
  onA1Change: (id: string) => void;
  onA2Change: (id: string) => void;
}

function DeltaView({ students, assignments, getDisplayName, a1, a2, onA1Change, onA2Change }: DeltaViewProps) {
  // Default to first and last assignment
  const effectiveA1 = a1 || (assignments.length > 0 ? assignments[0].id : "");
  const effectiveA2 = a2 || (assignments.length > 1 ? assignments[assignments.length - 1].id : "");

  // Build deltas
  const deltas = useMemo(() => {
    if (!effectiveA1 || !effectiveA2) return [];
    return students
      .map((s: any) => {
        const dp1 = s.dataPoints.find((dp: any) => dp.assignmentId === effectiveA1);
        const dp2 = s.dataPoints.find((dp: any) => dp.assignmentId === effectiveA2);
        if (!dp1 || !dp2) return null;
        const ordBefore = CATEGORY_ORDER[dp1.category] ?? 0;
        const ordAfter = CATEGORY_ORDER[dp2.category] ?? 0;
        return {
          studentId: s.studentId,
          name: s.name,
          categoryBefore: dp1.category as string,
          categoryAfter: dp2.category as string,
          delta: ordAfter - ordBefore,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.delta - a.delta); // Biggest improvers first
  }, [students, effectiveA1, effectiveA2]);

  return (
    <Box>
      {/* Assignment selectors */}
      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Before (Assignment)</InputLabel>
          <Select
            value={effectiveA1}
            label="Before (Assignment)"
            onChange={(e) => onA1Change(e.target.value)}
          >
            {assignments.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>After (Assignment)</InputLabel>
          <Select
            value={effectiveA2}
            label="After (Assignment)"
            onChange={(e) => onA2Change(e.target.value)}
          >
            {assignments.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {deltas.length === 0 ? (
        <Typography color="text.secondary">
          Select two assignments to compare student growth.
        </Typography>
      ) : (
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Student</th>
              <th style={{ textAlign: "center", padding: "6px 8px" }}>Before</th>
              <th style={{ textAlign: "center", padding: "6px 8px" }}>After</th>
              <th style={{ textAlign: "center", padding: "6px 8px" }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {deltas.map((d: any) => (
              <tr key={d.studentId} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px 8px" }}>{getDisplayName(d.name)}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <Chip
                    label={CATEGORY_CONFIG.find((c) => c.key === d.categoryBefore)?.shortLabel ?? d.categoryBefore}
                    size="small"
                    sx={{
                      bgcolor: CATEGORY_COLORS[d.categoryBefore],
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.7rem",
                      height: 22,
                    }}
                  />
                </td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <Chip
                    label={CATEGORY_CONFIG.find((c) => c.key === d.categoryAfter)?.shortLabel ?? d.categoryAfter}
                    size="small"
                    sx={{
                      bgcolor: CATEGORY_COLORS[d.categoryAfter],
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.7rem",
                      height: 22,
                    }}
                  />
                </td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      fontWeight: 600,
                      color: d.delta > 0 ? "success.main" : d.delta < 0 ? "error.main" : "text.secondary",
                    }}
                  >
                    {d.delta > 0 && <ArrowUpwardIcon sx={{ fontSize: 14 }} />}
                    {d.delta < 0 && <ArrowDownwardIcon sx={{ fontSize: 14 }} />}
                    {d.delta > 0 ? `+${d.delta}` : d.delta === 0 ? "—" : String(d.delta)}
                  </Box>
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </Box>
  );
}
