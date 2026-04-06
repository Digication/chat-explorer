import { AppBar, Toolbar, Box, IconButton, Badge, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import PeopleIcon from "@mui/icons-material/People";
import StudentCarousel from "@/components/explorer/StudentCarousel";
import { sidebarTheme } from "@/lib/theme";

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
 * Fixed 60px bar at the bottom of the screen.
 * Students button is pinned to the left, carousel is centered.
 * Dark background matching the sidebar theme.
 */
export default function BottomBar({
  students,
  selectedStudentId,
  onSelectStudent,
  onOpenStudentList,
  studentListOpen,
}: BottomBarProps) {
  return (
    <ThemeProvider theme={sidebarTheme}>
    <AppBar
      position="fixed"
      sx={{
        top: "auto",
        bottom: 0,
        backgroundColor: "grey.900",
        // Spans the full width, offset by the 60px sidebar on the left
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
          // Use relative positioning so children can be absolutely placed
          position: "relative",
          justifyContent: "center",
          px: 2,
        }}
      >
        {/* Left zone: Students button pinned to left edge */}
        <Box
          sx={{
            position: "absolute",
            left: 16,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <IconButton
            onClick={onOpenStudentList}
            sx={{
              color: studentListOpen ? "primary.main" : "text.secondary",
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
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Students
          </Typography>
        </Box>

        {/* Center zone: Student carousel */}
        <StudentCarousel
          students={students}
          selectedId={selectedStudentId}
          onSelect={onSelectStudent}
        />
      </Toolbar>
    </AppBar>
    </ThemeProvider>
  );
}
