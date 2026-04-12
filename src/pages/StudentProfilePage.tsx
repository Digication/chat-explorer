import React, { useState, useCallback } from "react";
import { useParams, Link as RouterLink } from "react-router";
import { useQuery } from "@apollo/client/react";
import {
  Box,
  Typography,
  Breadcrumbs,
  Link,
  Paper,
  Grid,
  Chip,
  Skeleton,
  Alert,
  Button,
  Tooltip,
} from "@mui/material";
import { GET_STUDENT_PROFILE } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useUserSettings } from "@/lib/UserSettingsContext";
import ThreadPanel from "@/components/insights/ThreadPanel";
import EvidencePopover from "@/components/insights/EvidencePopover";
import {
  CATEGORY_CONFIG,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/reflection-categories";

/** Map category key → ordinal (0–3) for sparkline Y axis. */
const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  CATEGORY_CONFIG.map((c, i) => [c.key, i])
);
const MAX_ORDINAL = CATEGORY_CONFIG.length - 1;

/** Colors for TORI domains (same as ToriTagFrequencies). */
const DOMAIN_COLORS: Record<string, string> = {
  "Cognitive-Analytical": "#0288D1",
  "Emotional-Affective": "#c62828",
  "Social-Interpersonal": "#2e7d32",
  "Personal Growth": "#7b1fa2",
  "Cultural-Ethical-Contextual": "#e65100",
  "Life Transitions": "#00695c",
};

/** Consistent section wrapper matching InsightsPage. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 4, mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

interface StudentProfilePageProps {
  /** When provided, uses this instead of route params. */
  studentId?: string;
  /** When true, hides breadcrumb and reduces padding for panel embedding. */
  embedded?: boolean;
}

export default function StudentProfilePage({
  studentId: propStudentId,
  embedded,
}: StudentProfilePageProps = {}) {
  const { studentId: routeStudentId } = useParams<{ studentId: string }>();
  const studentId = propStudentId ?? routeStudentId;
  const { scope } = useInsightsScope();
  const { getDisplayName } = useUserSettings();

  const [openThread, setOpenThread] = useState<{
    threadId: string;
    studentName: string;
  } | null>(null);

  const [toriPopover, setToriPopover] = useState<{
    anchorEl: HTMLElement;
    toriTagId: string;
    toriTagName: string;
    count: number;
  } | null>(null);

  const handleViewThread = useCallback(
    (threadId: string, studentName: string) => {
      setOpenThread({ threadId, studentName });
    },
    []
  );

  const { data, loading, error, refetch } = useQuery<any>(
    GET_STUDENT_PROFILE,
    {
      variables: { scope, studentId },
      skip: !scope || !studentId,
    }
  );

  const wrapperSx = embedded
    ? { py: 2, px: 1 }
    : { maxWidth: 1000, mx: "auto", py: 4, px: 3 };

  // ── Loading state ──────────────────────────────────────────────
  if (loading || (!data && !error)) {
    return (
      <Box sx={wrapperSx}>
        <Skeleton variant="text" width={300} height={32} sx={{ mb: 2 }} />
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <Grid key={i} size={{ xs: 6, md: 3 }}>
              <Skeleton variant="rounded" height={80} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={200} sx={{ mb: 4 }} />
        <Skeleton variant="rounded" height={200} sx={{ mb: 4 }} />
      </Box>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <Box sx={wrapperSx}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          Failed to load student profile: {error.message}
        </Alert>
      </Box>
    );
  }

  const profile = data?.studentProfile?.data;
  if (!profile) return null;

  const displayName = getDisplayName(profile.name);

  // ── Empty state ────────────────────────────────────────────────
  if (profile.totalComments === 0) {
    return (
      <Box sx={wrapperSx}>
        {!embedded && (
          <Breadcrumbs sx={{ mb: 3 }}>
            <Link component={RouterLink} to="/insights" underline="hover">
              Insights
            </Link>
            <Typography color="text.primary">Student Profile</Typography>
          </Breadcrumbs>
        )}
        <Paper
          variant="outlined"
          sx={{ p: 6, textAlign: "center" }}
        >
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No reflection data found for this student in the current scope.
          </Typography>
          {!embedded && (
            <Button component={RouterLink} to="/insights" variant="outlined">
              Back to Insights
            </Button>
          )}
        </Paper>
      </Box>
    );
  }

  // Find modal category for display
  const distEntries = Object.entries(
    profile.overallCategoryDistribution
  ) as [string, number][];
  const modalCategory = distEntries.reduce(
    (best, [key, count]) =>
      count > best.count ||
      (count === best.count &&
        (CATEGORY_ORDER[key] ?? 0) > (CATEGORY_ORDER[best.key] ?? 0))
        ? { key, count }
        : best,
    { key: "DESCRIPTIVE_WRITING", count: -1 }
  ).key;

  return (
    <Box sx={embedded ? { p: 1 } : { display: "flex", p: 4 }}>
      <Box sx={embedded ? {} : { flex: 1, minWidth: 0, maxWidth: 1000, mx: "auto", py: 4, px: 2 }}>
        {/* ── Breadcrumb (hidden when embedded in panel) ──────── */}
        {!embedded && (
          <Breadcrumbs sx={{ mb: 3 }}>
            <Link component={RouterLink} to="/insights" underline="hover">
              Insights
            </Link>
            <Typography color="text.primary">
              Student Profile: {displayName}
            </Typography>
          </Breadcrumbs>
        )}

        {/* ── Summary Cards ───────────────────────────────────── */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h4" fontWeight={700}>
                {profile.totalComments}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Comments
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h4" fontWeight={700}>
                {profile.assignmentCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Assignments
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
              <Chip
                label={CATEGORY_LABELS[modalCategory] ?? modalCategory}
                size="small"
                sx={{
                  bgcolor: CATEGORY_COLORS[modalCategory],
                  color: "#fff",
                  fontWeight: 600,
                  mb: 0.5,
                }}
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Modal Category
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h4" fontWeight={700}>
                {profile.avgWordCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Avg Words/Comment
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* ── Reflection Trajectory ───────────────────────────── */}
        <Section title="Reflection Growth">
          <ReflectionTrajectory
            perAssignment={profile.perAssignment}
            onClickAssignment={(threadId) =>
              handleViewThread(threadId, profile.name)
            }
          />
        </Section>

        {/* ── Category Distribution (Donut) ───────────────────── */}
        <Section title="Reflection Category Breakdown">
          <CategoryDonut distribution={profile.overallCategoryDistribution} />
        </Section>

        {/* ── TORI Tag Distribution ───────────────────────────── */}
        <Section title="TORI Tag Profile">
          <ToriTagBars
            tags={profile.toriTagDistribution}
            onClickTag={(e, tag) =>
              setToriPopover({
                anchorEl: e.currentTarget as HTMLElement,
                toriTagId: tag.tagId,
                toriTagName: tag.tagName,
                count: tag.count,
              })
            }
          />
          {toriPopover && scope && (
            <EvidencePopover
              anchorEl={toriPopover.anchorEl}
              studentId={studentId}
              studentName={profile.name}
              toriTagId={toriPopover.toriTagId}
              toriTagName={toriPopover.toriTagName}
              count={toriPopover.count}
              scope={scope}
              onClose={() => setToriPopover(null)}
              onViewThread={(threadId, name) => {
                setToriPopover(null);
                handleViewThread(threadId, name);
              }}
            />
          )}
        </Section>

        {/* ── Evidence Highlights ──────────────────────────────── */}
        <Section title="Notable Reflections">
          {profile.evidenceHighlights.length === 0 ? (
            <Typography color="text.secondary">
              No classified reflections available.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {profile.evidenceHighlights.map((ev: any) => (
                <Paper
                  key={ev.commentId}
                  variant="outlined"
                  sx={{ p: 2, borderLeft: "4px solid", borderLeftColor: CATEGORY_COLORS[ev.category] ?? "#999" }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Chip
                      label={CATEGORY_LABELS[ev.category] ?? ev.category}
                      size="small"
                      sx={{
                        bgcolor: CATEGORY_COLORS[ev.category],
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {ev.assignmentName}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontStyle: "italic", mb: 1, lineHeight: 1.6 }}>
                    &ldquo;{ev.evidenceQuote || (ev.text.length > 200 ? ev.text.slice(0, 200) + "…" : ev.text)}&rdquo;
                  </Typography>
                  {ev.rationale && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                      {ev.rationale}
                    </Typography>
                  )}
                  <Link
                    component="button"
                    variant="caption"
                    onClick={() => handleViewThread(ev.threadId, profile.name)}
                  >
                    View full conversation →
                  </Link>
                </Paper>
              ))}
            </Box>
          )}
        </Section>
      </Box>

      {/* ── Thread Panel (slide-in) — only when not embedded ──── */}
      {!embedded && openThread && (
        <>
          <Box
            onClick={() => setOpenThread(null)}
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: 1099,
              bgcolor: "rgba(0,0,0,0.15)",
            }}
          />
          <ThreadPanel
            threadId={openThread.threadId}
            studentName={openThread.studentName}
            onClose={() => setOpenThread(null)}
          />
        </>
      )}
    </Box>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

/** Sparkline trajectory for a single student across assignments. */
function ReflectionTrajectory({
  perAssignment,
  onClickAssignment,
}: {
  perAssignment: any[];
  onClickAssignment?: (threadId: string) => void;
}) {
  if (perAssignment.length === 0) {
    return (
      <Typography color="text.secondary">No assignment data available.</Typography>
    );
  }

  const W = 600;
  const H = 120;
  const padding = 24;
  const points = perAssignment;
  const xStep =
    points.length > 1 ? (W - padding * 2) / (points.length - 1) : 0;

  const pathD = points
    .map((p: any, i: number) => {
      const ord = CATEGORY_ORDER[p.modalCategory] ?? 0;
      const x = padding + i * xStep;
      const y = H - padding - (ord / MAX_ORDINAL) * (H - padding * 2);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <Box>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W }}
      >
        {/* Y-axis category labels */}
        {CATEGORY_CONFIG.map((c, i) => {
          const y = H - padding - (i / MAX_ORDINAL) * (H - padding * 2);
          return (
            <text
              key={c.key}
              x={2}
              y={y + 3}
              fontSize={9}
              fill="#999"
            >
              {c.shortLabel}
            </text>
          );
        })}
        {/* Grid lines */}
        {CATEGORY_CONFIG.map((_, i) => {
          const y = H - padding - (i / MAX_ORDINAL) * (H - padding * 2);
          return (
            <line
              key={i}
              x1={padding}
              y1={y}
              x2={W - padding}
              y2={y}
              stroke="#eee"
              strokeWidth={1}
            />
          );
        })}
        {/* Path */}
        <path d={pathD} fill="none" stroke="#1976d2" strokeWidth={2} />
        {/* Dots */}
        {points.map((p: any, i: number) => {
          const ord = CATEGORY_ORDER[p.modalCategory] ?? 0;
          const x = padding + i * xStep;
          const y = H - padding - (ord / MAX_ORDINAL) * (H - padding * 2);
          return (
            <Tooltip
              key={i}
              title={`${p.assignmentName}: ${CATEGORY_LABELS[p.modalCategory] ?? p.modalCategory}`}
            >
              <circle
                cx={x}
                cy={y}
                r={5}
                fill={CATEGORY_COLORS[p.modalCategory] ?? "#999"}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ cursor: "pointer" }}
              />
            </Tooltip>
          );
        })}
      </svg>

      {/* Assignment list below sparkline */}
      <Box
        component="table"
        sx={{ width: "100%", borderCollapse: "collapse", mt: 2, fontSize: "0.8rem" }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Assignment</th>
            <th style={{ textAlign: "center", padding: "4px 8px" }}>Category</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Comments</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p: any) => (
            <tr key={p.assignmentId} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "6px 8px" }}>{p.assignmentName}</td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                <Chip
                  label={
                    CATEGORY_CONFIG.find((c) => c.key === p.modalCategory)
                      ?.shortLabel ?? p.modalCategory
                  }
                  size="small"
                  sx={{
                    bgcolor: CATEGORY_COLORS[p.modalCategory],
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    height: 22,
                  }}
                />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                {p.commentCount}
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/** SVG donut chart for category distribution. */
function CategoryDonut({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  const entries = CATEGORY_CONFIG.map((c) => ({
    key: c.key,
    label: c.label,
    color: c.color,
    count: (distribution as any)[c.key] ?? 0,
  }));
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total === 0) {
    return <Typography color="text.secondary">No data.</Typography>;
  }

  const cx = 90;
  const cy = 90;
  const outerR = 80;
  const innerR = 50;
  let startAngle = -Math.PI / 2;

  const arcs = entries
    .filter((e) => e.count > 0)
    .map((e) => {
      const fraction = e.count / total;
      const angle = fraction * 2 * Math.PI;
      const endAngle = startAngle + angle;

      const x1Outer = cx + outerR * Math.cos(startAngle);
      const y1Outer = cy + outerR * Math.sin(startAngle);
      const x2Outer = cx + outerR * Math.cos(endAngle);
      const y2Outer = cy + outerR * Math.sin(endAngle);
      const x1Inner = cx + innerR * Math.cos(endAngle);
      const y1Inner = cy + innerR * Math.sin(endAngle);
      const x2Inner = cx + innerR * Math.cos(startAngle);
      const y2Inner = cy + innerR * Math.sin(startAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      const d = [
        `M ${x1Outer} ${y1Outer}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
        `L ${x1Inner} ${y1Inner}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
        "Z",
      ].join(" ");

      const result = { ...e, d, fraction };
      startAngle = endAngle;
      return result;
    });

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <svg width={180} height={180} viewBox="0 0 180 180">
        {arcs.map((arc) => (
          <Tooltip
            key={arc.key}
            title={`${arc.label}: ${arc.count} (${(arc.fraction * 100).toFixed(1)}%)`}
          >
            <path d={arc.d} fill={arc.color} />
          </Tooltip>
        ))}
        {/* Center text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={20}
          fontWeight={700}
          fill="#333"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize={10}
          fill="#999"
        >
          comments
        </text>
      </svg>

      {/* Legend */}
      <Box>
        {entries.map((e) => (
          <Box key={e.key} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: e.color, flexShrink: 0 }} />
            <Typography variant="body2">
              {e.label}: {e.count} ({total > 0 ? ((e.count / total) * 100).toFixed(1) : 0}%)
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Horizontal bar chart for TORI tags. */
function ToriTagBars({
  tags,
  onClickTag,
}: {
  tags: any[];
  onClickTag: (e: React.MouseEvent, tag: any) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const MAX_SHOWN = 10;

  if (tags.length === 0) {
    return (
      <Typography color="text.secondary">
        No TORI tags found for this student.
      </Typography>
    );
  }

  const maxCount = Math.max(...tags.map((t: any) => t.count));
  const visible = showAll ? tags : tags.slice(0, MAX_SHOWN);

  return (
    <Box>
      {visible.map((tag: any) => {
        const barPct = maxCount > 0 ? (tag.count / maxCount) * 100 : 0;
        const barColor = DOMAIN_COLORS[tag.domain] ?? "#757575";
        return (
          <Box
            key={tag.tagId}
            onClick={(e) => onClickTag(e, tag)}
            sx={{
              display: "flex",
              alignItems: "center",
              mb: 0.75,
              cursor: "pointer",
              borderRadius: 0.5,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Typography
              variant="body2"
              sx={{
                width: 200,
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                pr: 1,
              }}
            >
              {tag.tagName}
            </Typography>
            <Box sx={{ flex: 1, mr: 1 }}>
              <Box
                sx={{
                  height: 20,
                  width: `${barPct}%`,
                  minWidth: barPct > 0 ? 4 : 0,
                  bgcolor: barColor,
                  borderRadius: 0.5,
                  opacity: 0.8,
                }}
              />
            </Box>
            <Typography
              variant="body2"
              sx={{ flexShrink: 0, width: 90, textAlign: "right", fontWeight: 500 }}
            >
              {tag.count} ({tag.percent.toFixed(1)}%)
            </Typography>
          </Box>
        );
      })}
      {tags.length > MAX_SHOWN && (
        <Box sx={{ mt: 1, textAlign: "center" }}>
          <Button size="small" onClick={() => setShowAll((p) => !p)}>
            {showAll ? "Show less" : `Show all ${tags.length} tags`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
