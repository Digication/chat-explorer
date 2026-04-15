import { Box, Typography, Paper } from "@mui/material";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";

export default function StudentGrowthPage() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        My Growth
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
        <TrendingUpOutlinedIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography>
          Your growth timeline is coming soon. It will show how your
          reflective thinking has developed over time.
        </Typography>
      </Paper>
    </Box>
  );
}
