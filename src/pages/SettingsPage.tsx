import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useUserSettings } from "@/lib/UserSettingsContext";

export default function SettingsPage() {
  const { showFullNames, setShowFullNames } = useUserSettings();

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        Settings
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
        <Typography variant="subtitle1" fontWeight={500} gutterBottom>
          Privacy
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={!showFullNames}
              onChange={(_, checked) => setShowFullNames(!checked)}
            />
          }
          label="Show student initials only (hide full names)"
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          When enabled, student names are replaced with initials throughout the
          app. This setting is stored locally in your browser.
        </Typography>
      </Paper>
    </Box>
  );
}
