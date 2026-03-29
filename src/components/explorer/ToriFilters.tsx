import { Box, Button } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import ToriChip from "@/components/shared/ToriChip";

interface TagInfo {
  name: string;
  domain: string;
  count: number;
}

interface ToriFiltersProps {
  /** All available tags to filter by. */
  availableTags: TagInfo[];
  /** Names of currently active filters. */
  activeFilters: string[];
  /** Called when a tag is toggled on or off. */
  onToggle: (tagName: string) => void;
  /** Called to clear all filters. */
  onClear: () => void;
}

/**
 * Horizontally scrollable row of TORI tag chips that act as toggleable filters.
 * Active filters appear highlighted (filled). A "Clear all" button appears
 * when any filters are active.
 */
export default function ToriFilters({
  availableTags,
  activeFilters,
  onToggle,
  onClear,
}: ToriFiltersProps) {
  if (availableTags.length === 0) return null;

  const hasActive = activeFilters.length > 0;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        overflowX: "auto",
        py: 1,
        px: 2,
        // Hide scrollbar but allow scrolling
        "&::-webkit-scrollbar": { display: "none" },
        scrollbarWidth: "none",
      }}
    >
      {availableTags.map((tag) => (
        <ToriChip
          key={tag.name}
          tag={`${tag.name} (${tag.count})`}
          domain={tag.domain}
          highlighted={activeFilters.includes(tag.name)}
          onClick={() => onToggle(tag.name)}
          size="small"
        />
      ))}

      {hasActive && (
        <Button
          size="small"
          startIcon={<ClearIcon />}
          onClick={onClear}
          sx={{
            whiteSpace: "nowrap",
            minWidth: "auto",
            ml: 1,
            fontSize: "0.75rem",
          }}
        >
          Clear all
        </Button>
      )}
    </Box>
  );
}
