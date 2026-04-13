import { AppBar, Toolbar, Box, ButtonBase, Badge, Typography } from "@mui/material";
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
  /** Currently selected student IDs. */
  selectedStudentIds: string[];
  /** Called when a single student is clicked (replaces selection). */
  onSelectStudent: (id: string) => void;
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
  onSelectStudent,
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
        {/* Left zone: Students button pinned to left edge — entire area clickable */}
        <ButtonBase
          onClick={onOpenStudentList}
          sx={{
            position: "absolute",
            left: 16,
            display: "flex",
            alignItems: "center",
            gap: 1,
            borderRadius: 1,
            px: 1.5,
            py: 1,
            minHeight: 44,
            color: studentListOpen ? "primary.main" : "text.secondary",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Badge
            badgeContent={students.length}
            color="primary"
            max={999}
          >
            <PeopleIcon />
          </Badge>
          <Typography variant="caption" sx={{ color: "inherit" }}>
            Students
          </Typography>
        </ButtonBase>

        {/* Center zone: Student carousel */}
        <StudentCarousel
          students={students}
          selectedIds={selectedStudentIds}
          onSelect={onSelectStudent}
        />

        {/* Right zone: Analyze button — entire area clickable */}
        {onToggleAnalyze && (
          <ButtonBase
            onClick={onToggleAnalyze}
            sx={{
              position: "absolute",
              right: 16,
              display: "flex",
              alignItems: "center",
              borderRadius: 1,
              px: 1.5,
              py: 1,
              minHeight: 44,
              borderLeft: analyzeOpen ? "3px solid #1976d2" : "3px solid transparent",
              bgcolor: analyzeOpen ? "rgba(255, 255, 255, 0.12)" : "transparent",
              color: analyzeOpen ? "#fff" : "text.secondary",
              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
            }}
          >
            <Typography variant="caption" sx={{ color: "inherit", fontWeight: analyzeOpen ? 500 : 400 }}>
              Analyze
            </Typography>
          </ButtonBase>
        )}
      </Toolbar>
    </AppBar>
    </ThemeProvider>
  );
}
