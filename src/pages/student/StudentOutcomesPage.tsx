import { Box, Typography, Paper } from "@mui/material";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";

export default function StudentOutcomesPage() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        My Outcomes
      </Typography>
      <Paper
        sx={{
          p: 4,
          textAlign: "center",
          color: "text.secondary",
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <EmojiEventsOutlinedIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography>
          Your outcomes view is coming soon. It will map your work to
          institutional learning outcomes and show your progress.
        </Typography>
      </Paper>
    </Box>
  );
}
