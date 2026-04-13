import React, { useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Skeleton from "@mui/material/Skeleton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { GET_TORI_ANALYSIS } from "@/lib/queries/analytics";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import MultiTagEvidencePopover from "./MultiTagEvidencePopover";

const DEFAULT_LIMIT = 15;

interface CoOccurrenceListProps {
  onViewThread?: (threadId: string, studentName: string, studentId?: string, initialToriTag?: string) => void;
  onStudentClick?: (studentId: string, studentName: string) => void;
}

export default function CoOccurrenceList({ onViewThread, onStudentClick }: CoOccurrenceListProps) {
  const { scope } = useInsightsScope();
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<"pairs" | "triples">("pairs");
  const [popover, setPopover] = useState<{
    anchorEl: HTMLElement;
    tagNames: string[];
    tagIds: string[];
  } | null>(null);

  const handleRowClick = useCallback(
    (e: React.MouseEvent<HTMLElement>, tagNames: string[], tagIds: string[]) => {
      setPopover({ anchorEl: e.currentTarget, tagNames, tagIds });
    },
    []
  );
  const handleClosePopover = useCallback(() => setPopover(null), []);

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

  // Select data source based on mode.
  const rawItems =
    mode === "triples"
      ? data.toriAnalysis.data.coOccurrenceTriples ?? []
      : data.toriAnalysis.data.coOccurrencePairs ?? [];

  // Sort by count descending.
  const items = [...rawItems].sort(
    (a: { count: number }, b: { count: number }) => b.count - a.count,
  );

  if (items.length === 0) {
    return (
      <Box>
        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup
            size="small"
            value={mode}
            exclusive
            onChange={(_, v) => { if (v) { setMode(v); setShowAll(false); } }}
          >
            <ToggleButton value="pairs">Pairs</ToggleButton>
            <ToggleButton value="triples">Triples</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No co-occurrence data available for this scope.
        </Typography>
      </Box>
    );
  }

  const visible = showAll ? items : items.slice(0, DEFAULT_LIMIT);

  return (
    <Box>
      {/* Mode toggle */}
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          size="small"
          value={mode}
          exclusive
          onChange={(_, v) => { if (v) { setMode(v); setShowAll(false); } }}
        >
          <ToggleButton value="pairs">Pairs</ToggleButton>
          <ToggleButton value="triples">Triples</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <List dense disablePadding>
        {visible.map((item: { tags: string[]; tagIds: string[]; count: number }, i: number) => (
          <ListItem
            key={i}
            divider
            sx={{ py: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
            onClick={(e) => handleRowClick(e, item.tags, item.tagIds)}
          >
            <ListItemText
              primary={
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
                >
                  {item.tags.map((tag: string, j: number) => (
                    <React.Fragment key={j}>
                      {j > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          &amp;
                        </Typography>
                      )}
                      <Chip label={tag} size="small" color="primary" variant="outlined" />
                    </React.Fragment>
                  ))}
                </Box>
              }
            />
            <Typography variant="body2" fontWeight={600} sx={{ ml: 2, whiteSpace: "nowrap" }}>
              {item.count}
            </Typography>
          </ListItem>
        ))}
      </List>

      {items.length > DEFAULT_LIMIT && (
        <Button
          size="small"
          onClick={() => setShowAll((prev) => !prev)}
          sx={{ mt: 1 }}
        >
          {showAll ? "Show less" : `Show more (${items.length - DEFAULT_LIMIT} remaining)`}
        </Button>
      )}

      {/* Multi-tag evidence popover */}
      {scope && popover && (
        <MultiTagEvidencePopover
          anchorEl={popover.anchorEl}
          tagNames={popover.tagNames}
          tagIds={popover.tagIds}
          scope={scope}
          onClose={handleClosePopover}
          onViewThread={onViewThread}
          onStudentClick={onStudentClick}
        />
      )}
    </Box>
  );
}
