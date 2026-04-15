import { Box, Typography, Paper } from "@mui/material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";

export default function StudentTreePage() {
  return (
    <Box sx={{ maxWidth: 800, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        My Learning Map
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
        <AccountTreeOutlinedIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography>
          Your conceptual learning map is coming soon. It will visualize how
          your ideas and skills connect across your coursework.
        </Typography>
      </Paper>
    </Box>
  );
}
