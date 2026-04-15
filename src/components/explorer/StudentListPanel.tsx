import { useState, useMemo } from "react";
import {
  Drawer,
  Box,
  Typography,
  TextField,
  List,
  ListItemButton,
  InputAdornment,
  Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import UserAvatar from "@/components/shared/UserAvatar";
import ToriChip from "@/components/shared/ToriChip";
import { useUserSettings } from "@/lib/UserSettingsContext";
import { CATEGORY_CONFIG, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/reflection-categories";

/** Width of the student list panel. */
const PANEL_WIDTH = 360;

interface CategoryDistribution {
  DESCRIPTIVE_WRITING: number;
  DESCRIPTIVE_REFLECTION: number;
  DIALOGIC_REFLECTION: number;
  CRITICAL_REFLECTION: number;
}

interface StudentProfile {
  studentId: string;
  name: string;
  topToriTags: string[];
  commentCount: number;
  modalCategory: string;
  categoryDistribution?: CategoryDistribution;
}

interface StudentListPanelProps {
  /** Whether the drawer is open. */
  open: boolean;
  /** Called to close the drawer. */
  onClose: () => void;
  /** Full list of students. */
  students: StudentProfile[];
  /** Currently selected student IDs. */
  selectedIds: string[];
  /** Called when a student is toggled (selected or deselected). */
  onToggle: (id: string) => void;
}


/**
 * Slide-out panel from the left showing a searchable list of students.
 * Each row shows avatar, name, comment count, top TORI tags, and depth band.
 */
export default function StudentListPanel({
  open,
  onClose,
  students,
  selectedIds,
  onToggle,
}: StudentListPanelProps) {
  const [search, setSearch] = useState("");
  const { getDisplayName } = useUserSettings();

  // Filter students by the search term (case-insensitive).
  // Search always matches on the real name so faculty can find a student
  // even when PII (display names) is hidden.
  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, search]);

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: PANEL_WIDTH } }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
          Students
        </Typography>

        {/* Search bar */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1 }}
        />
      </Box>

      {/* Student list */}
      <List sx={{ px: 1, overflowY: "auto" }}>
        {filtered.map((s) => (
          <ListItemButton
            key={s.studentId}
            selected={selectedIds.includes(s.studentId)}
            onClick={() => onToggle(s.studentId)}
            sx={{ borderRadius: 1, mb: 0.5, py: 1 }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
              <UserAvatar
                name={s.name}
                size="medium"
                selected={selectedIds.includes(s.studentId)}
              />

              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* Name + comment count */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    noWrap
                    sx={{ flex: 1 }}
                  >
                    {getDisplayName(s.name)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.commentCount} comments
                  </Typography>
                </Box>

                {/* Top 2 TORI tags + reflection category */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mt: 0.5,
                    flexWrap: "wrap",
                  }}
                >
                  {s.topToriTags.slice(0, 2).map((tag) => (
                    <ToriChip key={tag} tag={tag} size="small" />
                  ))}
                  {/* Show a chip for each reflection level the student demonstrated,
                      ordered from highest (Critical) to lowest so the strongest
                      evidence stands out first. */}
                  {s.categoryDistribution
                    ? [...CATEGORY_CONFIG]
                        .reverse() // highest level first
                        .filter((cat) => (s.categoryDistribution as CategoryDistribution)[cat.key] > 0)
                        .map((cat) => (
                          <Chip
                            key={cat.key}
                            label={`${cat.shortLabel} (${(s.categoryDistribution as CategoryDistribution)[cat.key]})`}
                            size="small"
                            sx={{
                              fontSize: "0.65rem",
                              height: 18,
                              color: cat.color,
                              borderColor: cat.color,
                            }}
                            variant="outlined"
                          />
                        ))
                    : s.modalCategory && (
                        <Chip
                          label={CATEGORY_LABELS[s.modalCategory] ?? s.modalCategory}
                          size="small"
                          sx={{
                            fontSize: "0.65rem",
                            height: 18,
                            color: CATEGORY_COLORS[s.modalCategory] ?? "#757575",
                            borderColor: CATEGORY_COLORS[s.modalCategory] ?? "#757575",
                          }}
                          variant="outlined"
                        />
                      )}
                </Box>
              </Box>
            </Box>
          </ListItemButton>
        ))}

        {filtered.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center", py: 4 }}
          >
            No students found.
          </Typography>
        )}
      </List>
    </Drawer>
  );
}
