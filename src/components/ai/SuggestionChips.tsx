import { Box, Chip } from "@mui/material";

/** Predefined suggestion prompts shown before the first message. */
const SUGGESTIONS = [
  "What TORI patterns do you see?",
  "Which students show the deepest reflection?",
  "What teaching interventions would you suggest?",
  "Summarize the key findings",
];

interface SuggestionChipsProps {
  /** Called with the suggestion text when a chip is clicked. */
  onSend: (text: string) => void;
  /** Whether to display the chips. Hidden when false. */
  visible: boolean;
}

/**
 * A horizontally scrollable row of suggestion chips.
 * Intended to help users start a conversation with a single click.
 */
export default function SuggestionChips({ onSend, visible }: SuggestionChipsProps) {
  if (!visible) return null;

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        px: 2,
        py: 1,
        overflowX: "auto",
        // Hide the scrollbar while still allowing scroll
        "&::-webkit-scrollbar": { display: "none" },
        scrollbarWidth: "none",
      }}
    >
      {SUGGESTIONS.map((text) => (
        <Chip
          key={text}
          label={text}
          variant="outlined"
          size="small"
          onClick={() => onSend(text)}
          sx={{
            flexShrink: 0,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
        />
      ))}
    </Box>
  );
}
