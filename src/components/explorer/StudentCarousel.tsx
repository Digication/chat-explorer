import { useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import UserAvatar from "@/components/shared/UserAvatar";

/** How many students are visible at once in the carousel. */
const VISIBLE_COUNT = 5;
/** Width of each student slot in px. */
const SLOT_WIDTH = 80;
/** Avatar size for the selected student (px). */
const SELECTED_SIZE = 44;
/** Avatar size for unselected students (px). */
const UNSELECTED_SIZE = 32;

interface Student {
  studentId: string;
  name: string;
  commentCount: number;
}

interface StudentCarouselProps {
  /** List of students to display. */
  students: Student[];
  /** Currently selected student ID, or null. */
  selectedId: string | null;
  /** Called when a student is clicked. */
  onSelect: (id: string) => void;
}

/**
 * Horizontal sliding carousel of student avatars for the bottom bar.
 * Shows ~5 students at a time with left/right arrows to scroll by 1.
 * Selected avatar is 40px, unselected is 24px.
 */
export default function StudentCarousel({
  students,
  selectedId,
  onSelect,
}: StudentCarouselProps) {
  // The index of the first visible student
  const [startIndex, setStartIndex] = useState(0);

  const maxStart = Math.max(0, students.length - VISIBLE_COUNT);

  const scrollLeft = () => setStartIndex((i) => Math.max(0, i - 1));
  const scrollRight = () => setStartIndex((i) => Math.min(maxStart, i + 1));

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {/* Left arrow */}
      <IconButton
        size="small"
        onClick={scrollLeft}
        disabled={startIndex === 0}
        sx={{ color: "grey.400" }}
      >
        <ChevronLeftIcon />
      </IconButton>

      {/* Visible window */}
      <Box
        sx={{
          width: VISIBLE_COUNT * SLOT_WIDTH,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            transform: `translateX(-${startIndex * SLOT_WIDTH}px)`,
            transition: "transform 0.2s ease",
          }}
        >
          {students.map((s) => {
            const isSelected = s.studentId === selectedId;
            return (
              <Box
                key={s.studentId}
                onClick={() => onSelect(s.studentId)}
                sx={{
                  width: SLOT_WIDTH,
                  minWidth: SLOT_WIDTH,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  py: 0.5,
                }}
              >
                <UserAvatar
                  name={s.name}
                  size={isSelected ? SELECTED_SIZE : UNSELECTED_SIZE}
                  selected={isSelected}
                />
                {/* Show name only when selected */}
                {isSelected && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#fff",
                      mt: 0.25,
                      fontSize: "0.6rem",
                      lineHeight: 1.2,
                      maxWidth: SLOT_WIDTH - 8,
                      textAlign: "center",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Right arrow */}
      <IconButton
        size="small"
        onClick={scrollRight}
        disabled={startIndex >= maxStart}
        sx={{ color: "grey.400" }}
      >
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}
