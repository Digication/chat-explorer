import { AppBar, Toolbar, Box, IconButton, Badge, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import PeopleIcon from "@mui/icons-material/People";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
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
  /** Currently selected student IDs. */
  selectedStudentIds: string[];
  /** Called when a student is toggled (selected or deselected). */
  onToggleStudent: (id: string) => void;
  /** Called to open the student list panel. */
  onOpenStudentList: () => void;
  /** Whether the student list panel is open. */
  studentListOpen: boolean;
  /** Called to toggle the AI analyze panel. */
  onToggleAnalyze?: () => void;
  /** Whether the AI analyze panel is open. */
  analyzeOpen?: boolean;
}

/**
 * Fixed 60px bar at the bottom of the screen.
 * Students button is pinned to the left, carousel is centered.
 * Dark background matching the sidebar theme.
 */
export default function BottomBar({
  students,
  selectedStudentIds,
  onToggleStudent,
  onOpenStudentList,
  studentListOpen,
  onToggleAnalyze,
  analyzeOpen = false,
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
          selectedIds={selectedStudentIds}
          onToggle={onToggleStudent}
        />

        {/* Right zone: Analyze button */}
        {onToggleAnalyze && (
          <Box
            sx={{
              position: "absolute",
              right: 16,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Analyze
            </Typography>
            <IconButton
              onClick={onToggleAnalyze}
              sx={{
                color: analyzeOpen ? "primary.main" : "text.secondary",
              }}
            >
              <SmartToyOutlinedIcon />
            </IconButton>
          </Box>
        )}
      </Toolbar>
    </AppBar>
    </ThemeProvider>
  );
}
