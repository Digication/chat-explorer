import { Button, Tooltip } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";

/**
 * Compact model selector that shows the current AI model.
 * Currently displays "Gemini 2.0 Flash" as a disabled button
 * with a tooltip explaining that more models are coming.
 */
export default function ModelPicker() {
  return (
    <Tooltip title="Additional models coming soon" arrow>
      {/* Wrapping in a span so the tooltip works on a disabled button */}
      <span>
        <Button
          size="small"
          variant="text"
          disabled
          startIcon={<SmartToyOutlinedIcon />}
          sx={{
            textTransform: "none",
            fontSize: "0.75rem",
            // Override disabled styling so the text is still readable
            "&.Mui-disabled": {
              color: "text.secondary",
            },
          }}
        >
          Gemini 3.1 Pro
        </Button>
      </span>
    </Tooltip>
  );
}
