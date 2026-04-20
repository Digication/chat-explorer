import React, { useEffect } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import { useFacultyPanel, PanelTab } from "./FacultyPanelContext";
import StudentProfilePage from "@/pages/StudentProfilePage";
import StudentSearchAutocomplete from "./StudentSearchAutocomplete";
import ThreadPanel from "@/components/insights/ThreadPanel";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useInsightsAnalytics } from "@/components/insights/InsightsAnalyticsContext";
import { useUserSettings } from "@/lib/UserSettingsContext";

const TAB_ORDER: PanelTab[] = ["student", "thread", "chat"];
const TAB_LABELS: Record<PanelTab, string> = {
  student: "Student",
  thread: "Thread",
  chat: "AI Chat",
};

export default function FacultyPanel() {
  const panel = useFacultyPanel();
  const { scope } = useInsightsScope();
  const { getAnalyticsContext } = useInsightsAnalytics();
  const { getDisplayName } = useUserSettings();

  // Auto-update Student tab when context changes — load the new student if available
  useEffect(() => {
    if (panel.contextChanged && panel.activeTab === "student") {
      const ctx = panel.pageContext;
      if (ctx?.studentId && ctx?.studentName) {
        panel.openStudentProfile(ctx.studentId, ctx.studentName);
      }
      panel.acknowledgeContextChange();
    }
  }, [panel.contextChanged, panel.activeTab, panel.acknowledgeContextChange, panel.pageContext, panel.openStudentProfile]);

  const tabIndex = TAB_ORDER.indexOf(panel.activeTab);

  const handleTabChange = (_: React.SyntheticEvent, newIndex: number) => {
    const tab = TAB_ORDER[newIndex];
    if (tab === "student" && panel.studentId) {
      panel.openStudentProfile(panel.studentId, panel.studentName ?? "");
    } else if (tab === "student") {
      // No student loaded — just switch to the tab (shows search)
      panel.switchTab("student");
    } else if (tab === "thread" && panel.threadId) {
      panel.openThread(panel.threadId, panel.threadStudentName ?? "");
    } else if (tab === "chat") {
      panel.openChat();
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
      }}
    >
      {/* ── Header bar with back/close buttons ─────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <IconButton
          size="small"
          onClick={panel.goBack}
          disabled={panel.history.length === 0}
          aria-label="Go back"
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>

        <Typography
          variant="subtitle2"
          noWrap
          sx={{ flex: 1, ml: 1 }}
        >
          {panel.activeTab === "student" && panel.studentName && getDisplayName(panel.studentName)}
          {panel.activeTab === "thread" && panel.threadStudentName && getDisplayName(panel.threadStudentName)}
          {panel.activeTab === "chat" && "AI Chat"}
        </Typography>

        <IconButton size="small" onClick={panel.close} aria-label="Close panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Tabs
        value={tabIndex}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
      >
        {TAB_ORDER.map((tab) => (
          <Tab
            key={tab}
            label={TAB_LABELS[tab]}
            disabled={tab === "thread" && !panel.threadId}
          />
        ))}
      </Tabs>

      {/* ── Tab content ────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: panel.activeTab === "chat" ? "hidden" : "auto", minHeight: 0 }}>
        {panel.activeTab === "student" && (
          <>
            <StudentSearchAutocomplete
              onSelect={(id, name) => panel.openStudentProfile(id, name)}
              currentStudentName={panel.studentName ?? undefined}
            />
            {panel.studentId ? (
              <StudentProfilePage
                studentId={panel.studentId}
                embedded
                onViewThread={(threadId, studentName) => panel.openThread(threadId, studentName)}
              />
            ) : (
              <Box sx={{ p: 3, textAlign: "center" }}>
                <Typography color="text.secondary">
                  Search for a student above, or click a student name on the page.
                </Typography>
              </Box>
            )}
          </>
        )}

        {panel.activeTab === "thread" && panel.threadId && (
          <>
            {panel.contextChanged && (
              <Alert
                severity="info"
                sx={{ mx: 1, mt: 1 }}
                action={
                  <>
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => {
                        panel.acknowledgeContextChange();
                        panel.switchTab("student");
                      }}
                    >
                      Update
                    </Button>
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => panel.acknowledgeContextChange()}
                    >
                      Keep
                    </Button>
                  </>
                }
              >
                Context changed. This thread is from a different context.
              </Alert>
            )}
            <ThreadPanel
              threadId={panel.threadId}
              studentName={panel.threadStudentName ?? ""}
              studentId={panel.threadStudentId ?? undefined}
              onClose={panel.close}
              embedded
              onStudentClick={(id, name) => panel.openStudentProfile(id, name)}
              initialToriTag={panel.threadInitialToriTag ?? undefined}
            />
          </>
        )}

        {panel.activeTab === "chat" && (
          <>
            {panel.contextChanged && (
              <Alert
                severity="info"
                sx={{ mx: 1, mt: 1 }}
                action={
                  <>
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => {
                        panel.acknowledgeContextChange();
                        panel.setActiveChatSession(null);
                      }}
                    >
                      New Chat
                    </Button>
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => panel.acknowledgeContextChange()}
                    >
                      Continue
                    </Button>
                  </>
                }
              >
                Context changed. Start a new chat?
              </Alert>
            )}
            <AiChatPanel
              open={true}
              onClose={panel.close}
              anchor="embedded"
              institutionId={scope?.institutionId}
              courseId={scope?.courseId}
              assignmentId={scope?.assignmentId}
              studentId={panel.studentId ?? panel.pageContext?.studentId ?? undefined}
              studentName={panel.studentName ?? panel.pageContext?.studentName ?? undefined}
              analyticsContext={getAnalyticsContext()}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
