import { Box, ButtonBase, Divider, Paper } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import RecentActorsIcon from "@mui/icons-material/RecentActors";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
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
      <Paper
        elevation={0}
        square
        sx={{
          position: "fixed",
          bottom: 0,
          // Offset by the 60px sidebar on the left
          left: 60,
          width: "calc(100% - 60px)",
          height: 60,
          bgcolor: "grey.900",
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {/* Left zone: Students button — height fills the bar */}
        <ButtonBase
          focusRipple
          onClick={onOpenStudentList}
          sx={{
            px: 3,
            alignItems: "center",
            fontSize: 12,
            fontWeight: 500,
            textTransform: "uppercase",
            color: studentListOpen ? "text.primary" : "text.secondary",
            "&:hover": { bgcolor: "grey.800" },
            ...(studentListOpen && {
              background: "linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.15) 100%), #121212",
            }),
          }}
        >
          <Box mr={1} sx={{ display: "flex", alignItems: "center" }}>
            <RecentActorsIcon />
          </Box>
          <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
            Students ({students.length})
          </Box>
        </ButtonBase>

        <Divider orientation="vertical" flexItem />

        {/* Center zone: Student carousel — absolutely centered */}
        <Box sx={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <StudentCarousel
            students={students}
            selectedIds={selectedStudentIds}
            onSelect={onSelectStudent}
          />
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Right zone: Analyze button — same style as Students button */}
        {onToggleAnalyze && (
          <ButtonBase
            focusRipple
            onClick={onToggleAnalyze}
            sx={{
              px: 3,
              alignItems: "center",
              fontSize: 12,
              fontWeight: 500,
              textTransform: "uppercase",
              color: analyzeOpen ? "text.primary" : "text.secondary",
              "&:hover": { bgcolor: "grey.800" },
              ...(analyzeOpen && {
                background: "linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.15) 100%), #121212",
              }),
            }}
          >
            <Box mr={1} sx={{ display: "flex", alignItems: "center" }}>
              <AutoAwesomeIcon />
            </Box>
            <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
              Analyze
            </Box>
          </ButtonBase>
        )}
      </Paper>
    </ThemeProvider>
  );
}
