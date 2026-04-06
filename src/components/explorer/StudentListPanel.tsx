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

/** Width of the student list panel. */
const PANEL_WIDTH = 360;

interface StudentProfile {
  studentId: string;
  name: string;
  topToriTags: string[];
  commentCount: number;
  depthBand: string;
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

/** Color mapping for depth bands. */
const DEPTH_COLORS: Record<string, string> = {
  DEEP: "#2e7d32",
  DEVELOPING: "#f57c00",
  SURFACE: "#757575",
};

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

  // Filter students by the search term (case-insensitive)
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
                    {s.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.commentCount} comments
                  </Typography>
                </Box>

                {/* Top 2 TORI tags + depth band */}
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
                  {s.depthBand && (
                    <Chip
                      label={s.depthBand}
                      size="small"
                      sx={{
                        fontSize: "0.65rem",
                        height: 18,
                        color: DEPTH_COLORS[s.depthBand] ?? "#757575",
                        borderColor: DEPTH_COLORS[s.depthBand] ?? "#757575",
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
