/**
 * Evidence tab for the Faculty Panel — shows outcome alignment summary
 * cards with strength distribution bars. Each outcome shows how many
 * evidence moments align to it and at what strength level.
 */

import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";

import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ScienceIcon from "@mui/icons-material/Science";
import { useQuery } from "@apollo/client/react";
import { GET_EVIDENCE_SUMMARY } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

// Colors for each strength level
const STRENGTH_COLORS: Record<string, string> = {
  EMERGING: "#90caf9",     // light blue
  DEVELOPING: "#66bb6a",   // green
  DEMONSTRATING: "#ffa726", // orange
  EXEMPLARY: "#ab47bc",    // purple
};

const STRENGTH_LABELS: Record<string, string> = {
  EMERGING: "Emerging",
  DEVELOPING: "Developing",
  DEMONSTRATING: "Demonstrating",
  EXEMPLARY: "Exemplary",
};

interface OutcomeSummary {
  outcomeId: string;
  outcomeCode: string;
  outcomeName: string;
  totalAlignments: number;
  strengthDistribution: Record<string, number>;
  studentCount: number;
}

export default function EvidenceTabPanel() {
  const { scope } = useInsightsScope();

  const { data, loading, error } = useQuery<any>(GET_EVIDENCE_SUMMARY, {
    variables: { scope },
    skip: !scope,
  });

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">
          Failed to load evidence data: {error.message}
        </Typography>
      </Box>
    );
  }

  const summary = data?.evidenceSummary?.data;
  const meta = data?.evidenceSummary?.meta;

  if (!summary || summary.totalMoments === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <ScienceIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
        <Typography color="text.secondary" gutterBottom>
          No evidence data yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Evidence narratives are generated automatically when student comments
          are uploaded. Upload data to see outcome alignments here.
        </Typography>
      </Box>
    );
  }

  // Sort outcomes: those with alignments first, then by code
  const outcomes: OutcomeSummary[] = [...(summary.outcomes ?? [])].sort(
    (a: OutcomeSummary, b: OutcomeSummary) => {
      if (a.totalAlignments > 0 && b.totalAlignments === 0) return -1;
      if (a.totalAlignments === 0 && b.totalAlignments > 0) return 1;
      return a.outcomeCode.localeCompare(b.outcomeCode);
    }
  );

  return (
    <Box sx={{ p: 2 }}>
      {/* Summary header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {summary.frameworkName ?? "Evidence Summary"}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${summary.totalMoments} evidence moments`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${meta?.consentedStudentCount ?? 0} students`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </Box>

      {/* Outcome cards */}
      <Stack spacing={1.5}>
        {outcomes.map((outcome: OutcomeSummary) => (
          <OutcomeCard key={outcome.outcomeId} outcome={outcome} />
        ))}
      </Stack>

      {/* Legend */}
      <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: "divider" }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          Strength levels
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {Object.entries(STRENGTH_LABELS).map(([key, label]) => (
            <Stack key={key} direction="row" spacing={0.5} alignItems="center">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "2px",
                  bgcolor: STRENGTH_COLORS[key],
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function OutcomeCard({ outcome }: { outcome: OutcomeSummary }) {
  const total = outcome.totalAlignments;
  const dist = outcome.strengthDistribution;

  return (
    <Card variant="outlined" sx={{ opacity: total === 0 ? 0.5 : 1 }}>
      <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
            {outcome.outcomeCode}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Chip
              label={`${total}`}
              size="small"
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
            <Chip
              label={`${outcome.studentCount} students`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          </Stack>
        </Stack>

        <Typography variant="caption" color="text.secondary" noWrap>
          {outcome.outcomeName}
        </Typography>

        {total > 0 && (
          <Box sx={{ mt: 1 }}>
            <StrengthBar distribution={dist} total={total} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function StrengthBar({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  const levels = ["EMERGING", "DEVELOPING", "DEMONSTRATING", "EXEMPLARY"];

  return (
    <Tooltip
      title={
        <Box>
          {levels.map((level) => (
            <Typography key={level} variant="caption" display="block">
              {STRENGTH_LABELS[level]}: {distribution[level] ?? 0} (
              {total > 0 ? Math.round(((distribution[level] ?? 0) / total) * 100) : 0}%)
            </Typography>
          ))}
        </Box>
      }
    >
      <Box sx={{ display: "flex", height: 8, borderRadius: 1, overflow: "hidden" }}>
        {levels.map((level) => {
          const count = distribution[level] ?? 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <Box
              key={level}
              sx={{
                width: `${pct}%`,
                bgcolor: STRENGTH_COLORS[level],
                minWidth: 2,
              }}
            />
          );
        })}
      </Box>
    </Tooltip>
  );
}
