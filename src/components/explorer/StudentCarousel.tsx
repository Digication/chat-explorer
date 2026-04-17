import { useState } from "react";
import { Box, ButtonBase, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import UserAvatar from "@/components/shared/UserAvatar";
import { useUserSettings } from "@/lib/UserSettingsContext";

/** How many students are visible at once in the carousel. */
const VISIBLE_COUNT = 5;
/** Avatar size for the selected student (px) — matches Campus Web. */
const SELECTED_SIZE = 40;
/** Avatar size for unselected students (px) — matches Campus Web. */
const UNSELECTED_SIZE = 24;

interface Student {
  studentId: string;
  name: string;
  commentCount: number;
}

interface StudentCarouselProps {
  /** List of students to display. */
  students: Student[];
  /** Currently selected student IDs. */
  selectedIds: string[];
  /** Called when a student is clicked (replaces selection). */
  onSelect: (id: string) => void;
}

/**
 * Horizontal sliding carousel of student avatars for the bottom bar.
 * Shows ~5 students at a time with left/right arrows to scroll by 1.
 * Selected avatar is 44px, unselected is 32px.
 */
export default function StudentCarousel({
  students,
  selectedIds,
  onSelect,
}: StudentCarouselProps) {
  const { getDisplayName } = useUserSettings();
  // The index of the first visible student
  const [startIndex, setStartIndex] = useState(0);

  const maxStart = Math.max(0, students.length - VISIBLE_COUNT);

  const scrollLeft = () => setStartIndex((i) => Math.max(0, i - 1));
  const scrollRight = () => setStartIndex((i) => Math.min(maxStart, i + 1));

  // Compute the visible window centered on the selection
  const visibleStudents = students.slice(startIndex, startIndex + VISIBLE_COUNT);

  return (
    <Box component="nav" sx={{ display: "flex", alignItems: "center" }}>
      {/* Left arrow */}
      <IconButton
        size="small"
        onClick={scrollLeft}
        disabled={startIndex === 0}
        aria-label="Previous student"
      >
        <ArrowBackIcon />
      </IconButton>

      {/* Visible carousel items */}
      {visibleStudents.map((s) => {
        const isSelected = selectedIds.includes(s.studentId);
        return (
          <ButtonBase
            key={s.studentId}
            focusRipple
            centerRipple
            onClick={() => onSelect(s.studentId)}
            sx={{ p: "2px", height: 60 }}
          >
            <Box position="relative">
              <UserAvatar
                name={getDisplayName(s.name)}
                size={isSelected ? SELECTED_SIZE : UNSELECTED_SIZE}
                selected={isSelected}
              />
            </Box>
          </ButtonBase>
        );
      })}

      {/* Right arrow */}
      <IconButton
        size="small"
        onClick={scrollRight}
        disabled={startIndex >= maxStart}
        aria-label="Next student"
      >
        <ArrowForwardIcon />
      </IconButton>
    </Box>
  );
}
