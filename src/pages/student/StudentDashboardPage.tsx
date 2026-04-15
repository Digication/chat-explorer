import { Box, Typography, Paper } from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";

export default function StudentDashboardPage() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        My Dashboard
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
        <DashboardOutlinedIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="h6" gutterBottom>
          Welcome!
        </Typography>
        <Typography>
          Your student dashboard is coming soon. You'll be able to see your
          learning progress, reflections, and outcomes here.
        </Typography>
      </Paper>
    </Box>
  );
}
