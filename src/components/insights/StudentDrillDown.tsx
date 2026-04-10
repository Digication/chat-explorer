import React from "react";
import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import { useUserSettings } from "@/lib/UserSettingsContext";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/reflection-categories";

export interface StudentItem {
  studentId: string;
  name: string;
  modalCategory?: string;
  commentCount?: number;
}

interface StudentDrillDownProps {
  /** The element to anchor the popover to (null = closed). */
  anchorEl: HTMLElement | null;
  /** Bold header text (e.g. "Deep — 12 students"). */
  title: string;
  /** Optional smaller text below the title. */
  subtitle?: string;
  /** List of students to display. */
  students: StudentItem[];
  /** Called when the popover should close. */
  onClose: () => void;
  /** Called when a student row is clicked. */
  onSelectStudent: (studentId: string, studentName: string) => void;
}

/**
 * Reusable popover that shows a list of students matching a filter.
 * Used by DepthBands and MetricsCards for drill-down interactivity.
 */
export default function StudentDrillDown({
  anchorEl,
  title,
  subtitle,
  students,
  onClose,
  onSelectStudent,
}: StudentDrillDownProps) {
  const { getDisplayName } = useUserSettings();
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{
        paper: {
          sx: { maxWidth: 360, maxHeight: 400, p: 2 },
        },
      }}
    >
      {/* Header */}
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {subtitle}
        </Typography>
      )}

      {/* Empty state */}
      {students.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          No students found.
        </Typography>
      )}

      {/* Scrollable student list */}
      {students.length > 0 && (
        <List
          dense
          sx={{
            maxHeight: 300,
            overflowY: "auto",
            mx: -1, // align with popover padding
          }}
        >
          {students.map((s) => (
            <ListItemButton
              key={s.studentId}
              onClick={() => {
                onSelectStudent(s.studentId, s.name);
                onClose();
              }}
            >
              <ListItemText
                primary={getDisplayName(s.name)}
                secondary={
                  <Box
                    component="span"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}
                  >
                    {s.commentCount != null && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {s.commentCount} comment{s.commentCount !== 1 ? "s" : ""}
                      </Typography>
                    )}
                    {s.modalCategory && (
                      <Chip
                        label={CATEGORY_LABELS[s.modalCategory] ?? s.modalCategory}
                        size="small"
                        sx={{
                          ml: 0.5,
                          height: 20,
                          fontSize: "0.7rem",
                          bgcolor: CATEGORY_COLORS[s.modalCategory] ?? "grey.400",
                          color: "#fff",
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Box>
                }
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Popover>
  );
}
