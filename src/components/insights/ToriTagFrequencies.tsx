import React from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { GET_TORI_ANALYSIS } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";

/** Colors for each TORI domain — matches ToriChip. */
const DOMAIN_COLORS: Record<string, string> = {
  "Cognitive-Analytical": "#0288D1",
  "Emotional-Affective": "#c62828",
  "Social-Interpersonal": "#2e7d32",
  "Personal Growth": "#7b1fa2",
  "Cultural-Ethical-Contextual": "#e65100",
  "Life Transitions": "#00695c",
};

interface TagFrequency {
  tagName: string;
  domain: string;
  count: number;
  percent: number;
}

/** Groups tags by domain. Each group is sorted by count descending. */
function groupByDomain(tags: TagFrequency[]): Map<string, TagFrequency[]> {
  // Sort all tags by count descending first.
  const sorted = [...tags].sort((a, b) => b.count - a.count);

  const groups = new Map<string, TagFrequency[]>();
  for (const tag of sorted) {
    const domain = tag.domain || "Unknown";
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(tag);
  }

  // Sort groups by their highest-count tag so the most active domain appears first.
  return new Map(
    [...groups.entries()].sort(
      (a, b) => b[1][0].count - a[1][0].count,
    ),
  );
}

export default function ToriTagFrequencies() {
  const { scope } = useInsightsScope();

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
        Failed to load TORI tag frequencies.
      </Alert>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading || !data?.toriAnalysis?.data) {
    return (
      <Box>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} variant="text" height={32} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  const tags: TagFrequency[] = data.toriAnalysis.data.tagFrequencies ?? [];

  // ── Empty state ────────────────────────────────────────────────────────────

  if (tags.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No TORI tag data available for this scope.
      </Typography>
    );
  }

  // Find the maximum count to scale bars proportionally.
  const maxCount = Math.max(...tags.map((t) => t.count));
  const grouped = groupByDomain(tags);

  return (
    <Box>
      {[...grouped.entries()].map(([domain, domainTags]) => (
        <Box key={domain} sx={{ mb: 3 }}>
          {/* Domain header */}
          <Typography
            variant="overline"
            sx={{
              color: DOMAIN_COLORS[domain] ?? "#757575",
              fontWeight: 700,
              letterSpacing: 1,
              mb: 1,
              display: "block",
            }}
          >
            {domain}
          </Typography>

          {/* Tag rows */}
          {domainTags.map((tag) => {
            const barPct = maxCount > 0 ? (tag.count / maxCount) * 100 : 0;
            const barColor = DOMAIN_COLORS[domain] ?? "#757575";

            return (
              <Box
                key={tag.tagName}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  mb: 0.75,
                }}
              >
                {/* Tag name — fixed width */}
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

                {/* Horizontal bar */}
                <Box sx={{ flex: 1, mr: 1 }}>
                  <Box
                    sx={{
                      height: 20,
                      width: `${barPct}%`,
                      minWidth: barPct > 0 ? 4 : 0,
                      bgcolor: barColor,
                      borderRadius: 0.5,
                      opacity: 0.8,
                      transition: "width 0.3s ease",
                    }}
                  />
                </Box>

                {/* Count and percent */}
                <Typography
                  variant="body2"
                  sx={{
                    flexShrink: 0,
                    width: 90,
                    textAlign: "right",
                    fontWeight: 500,
                  }}
                >
                  {tag.count} ({tag.percent.toFixed(1)}%)
                </Typography>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
