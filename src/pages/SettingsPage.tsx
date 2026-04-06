import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useUserSettings } from "@/lib/UserSettingsContext";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import StudentExclusionDialog from "@/components/shared/StudentExclusionDialog";

export default function SettingsPage() {
  const { showFullNames, setShowFullNames } = useUserSettings();
  const { scope } = useInsightsScope();
  const [exclusionOpen, setExclusionOpen] = useState(false);

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        Settings
      </Typography>

      {/* Privacy section */}
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

      {/* Student participation section */}
      <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
        <Typography variant="subtitle1" fontWeight={500} gutterBottom>
          Student Participation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Exclude students from analytics. Excluded students will not appear in
          insights, heatmaps, or any aggregate calculations.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => setExclusionOpen(true)}
          disabled={!scope?.institutionId}
        >
          Manage Student Exclusions
        </Button>
      </Paper>

      {/* Exclusion dialog */}
      {scope?.institutionId && (
        <StudentExclusionDialog
          open={exclusionOpen}
          onClose={() => setExclusionOpen(false)}
          institutionId={scope.institutionId}
          courseId={scope.courseId}
        />
      )}
    </Box>
  );
}
