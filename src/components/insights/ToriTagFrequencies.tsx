import React, { useState, useEffect } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { GET_TORI_ANALYSIS } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import EvidencePopover from "@/components/insights/EvidencePopover";
import { useInsightsAnalytics } from "@/components/insights/InsightsAnalyticsContext";

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
  tagId: string;
  tagName: string;
  domain: string;
  count: number;
  percent: number;
}

interface PopoverState {
  anchorEl: HTMLElement;
  toriTagId: string;
  toriTagName: string;
  count: number;
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

interface ToriTagFrequenciesProps {
  onViewThread?: (threadId: string, studentName: string, studentId?: string, initialToriTag?: string) => void;
  onStudentClick?: (studentId: string, studentName: string) => void;
}

/** Max tags shown before "Show all" toggle in flat mode. */
const FLAT_LIMIT = 10;
/** Max tags shown per domain before "Show all" toggle in grouped mode. */
const DOMAIN_LIMIT = 3;

export default function ToriTagFrequencies({ onViewThread, onStudentClick }: ToriTagFrequenciesProps) {
  const { scope } = useInsightsScope();
  const { registerSummary } = useInsightsAnalytics();
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [showAll, setShowAll] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const { data, loading, error, refetch } = useQuery<any>(GET_TORI_ANALYSIS, {
    variables: { scope },
    skip: !scope,
  });

  // Register TORI tag summary for AI Chat context
  useEffect(() => {
    const freqs: TagFrequency[] = data?.toriAnalysis?.data?.tagFrequencies ?? [];
    if (freqs.length > 0) {
      const top5 = [...freqs].sort((a, b) => b.count - a.count).slice(0, 5);
      const summary = `Top tags: ${top5.map((t) => `${t.tagName} (${t.count})`).join(", ")}`;
      registerSummary("TORI Tags", summary);
    }
  }, [data, registerSummary]);

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
  const flatSorted = [...tags].sort((a, b) => b.count - a.count);

  /** Renders a single tag bar row — clickable for evidence drill-down. */
  const renderTagRow = (tag: TagFrequency, barColor: string) => {
    const barPct = maxCount > 0 ? (tag.count / maxCount) * 100 : 0;
    return (
      <Box
        key={tag.tagName}
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          setPopover({
            anchorEl: e.currentTarget,
            toriTagId: tag.tagId,
            toriTagName: tag.tagName,
            count: tag.count,
          });
        }}
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
              transition: "width 0.3s ease",
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
  };

  return (
    <Box>
      {/* View mode toggle */}
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
        >
          <ToggleButton value="grouped">By Domain</ToggleButton>
          <ToggleButton value="flat">All Tags</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === "grouped"
        ? /* Grouped by domain */
          [...grouped.entries()].map(([domain, domainTags]) => {
            const visible = showAll ? domainTags : domainTags.slice(0, DOMAIN_LIMIT);
            const hasMore = domainTags.length > DOMAIN_LIMIT;
            return (
              <Box key={domain} sx={{ mb: 3 }}>
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
                {visible.map((tag) =>
                  renderTagRow(tag, DOMAIN_COLORS[domain] ?? "#757575"),
                )}
                {hasMore && !showAll && (
                  <Typography
                    variant="caption"
                    color="primary"
                    sx={{ cursor: "pointer", ml: 0.5, "&:hover": { textDecoration: "underline" } }}
                    onClick={() => setShowAll(true)}
                  >
                    + {domainTags.length - DOMAIN_LIMIT} more
                  </Typography>
                )}
              </Box>
            );
          })
        : /* Flat list sorted by count */
          (showAll ? flatSorted : flatSorted.slice(0, FLAT_LIMIT)).map((tag) =>
            renderTagRow(tag, DOMAIN_COLORS[tag.domain] ?? "#757575"),
          )}

      {/* Show all / Show less toggle */}
      {((viewMode === "flat" && flatSorted.length > FLAT_LIMIT) ||
        (viewMode === "grouped" && [...grouped.values()].some((g) => g.length > DOMAIN_LIMIT))) && (
        <Box sx={{ mt: 1, textAlign: "center" }}>
          <Button size="small" onClick={() => setShowAll((p) => !p)}>
            {showAll ? "Show less" : `Show all ${tags.length} tags`}
          </Button>
        </Box>
      )}

      {/* Evidence popover — shown when a tag row is clicked */}
      {popover && scope && (
        <EvidencePopover
          anchorEl={popover.anchorEl}
          toriTagId={popover.toriTagId}
          toriTagName={popover.toriTagName}
          count={popover.count}
          scope={scope}
          onClose={() => setPopover(null)}
          onViewThread={(threadId, studentName, studentId, initialToriTag) => {
            setPopover(null);
            onViewThread?.(threadId, studentName, studentId, initialToriTag);
          }}
          onStudentClick={onStudentClick ? (id, name) => {
            setPopover(null);
            onStudentClick(id, name);
          } : undefined}
        />
      )}
    </Box>
  );
}
