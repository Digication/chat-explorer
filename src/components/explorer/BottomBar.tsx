import { AppBar, Toolbar, Box, IconButton, Badge, Typography } from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import StudentCarousel from "@/components/explorer/StudentCarousel";

interface Student {
  studentId: string;
  name: string;
  commentCount: number;
}

interface BottomBarProps {
  /** List of students for the carousel. */
  students: Student[];
  /** Currently selected student ID, or null. */
  selectedStudentId: string | null;
  /** Called when a student is selected. */
  onSelectStudent: (id: string) => void;
  /** Called to open the student list panel. */
  onOpenStudentList: () => void;
  /** Whether the student list panel is open. */
  studentListOpen: boolean;
}

/**
 * Fixed 60px bar at the bottom of the left (explorer) panel.
 * Two zones: left (Students button), center/right (carousel).
 * Dark background matching the sidebar theme.
 *
 * Note: The AI Chat button was removed because the chat panel is now
 * always visible on the right side of the split-screen layout.
 */
export default function BottomBar({
  students,
  selectedStudentId,
  onSelectStudent,
  onOpenStudentList,
  studentListOpen,
}: BottomBarProps) {
  return (
    <AppBar
      position="fixed"
      sx={{
        top: "auto",
        bottom: 0,
        backgroundColor: "#1a1a1a",
        // Spans the full width, only offset by the 60px sidebar on the left
        left: 60,
        width: "calc(100% - 60px)",
        height: 60,
      }}
    >
      <Toolbar
        sx={{
          minHeight: 60,
          height: 60,
          display: "flex",
          justifyContent: "space-between",
          px: 2,
        }}
      >
        {/* Left zone: Students button with count badge */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            onClick={onOpenStudentList}
            sx={{
              color: studentListOpen ? "#1976d2" : "#e0e0e0",
            }}
          >
            <Badge
              badgeContent={students.length}
              color="primary"
              max={999}
            >
              <PeopleIcon />
            </Badge>
          </IconButton>
          <Typography variant="caption" sx={{ color: "#e0e0e0" }}>
            Students
          </Typography>
        </Box>

        {/* Center/right zone: Student carousel */}
        <StudentCarousel
          students={students}
          selectedId={selectedStudentId}
          onSelect={onSelectStudent}
        />
      </Toolbar>
    </AppBar>
  );
}
