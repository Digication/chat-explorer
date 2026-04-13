import React, { useCallback } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useFacultyPanel } from "@/components/faculty-panel/FacultyPanelContext";
import MetricsCards from "@/components/insights/MetricsCards";
import HeatmapView from "@/components/insights/HeatmapView";
import ToriNetworkGraph from "@/components/insights/ToriNetworkGraph";
import DepthBands from "@/components/insights/DepthBands";
import CoOccurrenceList from "@/components/insights/CoOccurrenceList";
import ToriTagFrequencies from "@/components/insights/ToriTagFrequencies";
import StudentEngagementTable from "@/components/insights/StudentEngagementTable";
import GrowthVisualization from "@/components/insights/GrowthVisualization";

/** Consistent wrapper for each analytics section. */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper id={id} variant="outlined" sx={{ p: 4, mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export default function InsightsPage() {
  const { scope } = useInsightsScope();
  const panel = useFacultyPanel();

  // Student name clicks → open Student Profile in Faculty Panel
  const handleOpenStudent = useCallback(
    (studentId: string, studentName: string) => {
      panel.openStudentProfile(studentId, studentName);
    },
    [panel.openStudentProfile],
  );

  // Thread/evidence clicks → open Thread in Faculty Panel
  const handleOpenThread = useCallback(
    (threadId: string, studentName: string) => {
      panel.openThread(threadId, studentName);
    },
    [panel.openThread],
  );

  return (
    <Box sx={{ p: 4 }}>
      <Box
        sx={{
          maxWidth: 1200,
          mx: "auto",
          py: 4,
          px: 2,
        }}
      >
        {/* Overview metric cards */}
        <MetricsCards onOpenStudent={handleOpenStudent} />

        {/* Heatmap — with drill-down */}
        <Section id="heatmap" title="Reflection Heatmap">
          <HeatmapView onViewThread={handleOpenThread} onStudentClick={handleOpenStudent} />
        </Section>

        {/* TORI tag frequency bars */}
        <Section id="tori-frequencies" title="TORI Tag Frequencies">
          <ToriTagFrequencies onViewThread={handleOpenThread} onStudentClick={handleOpenStudent} />
        </Section>

        {/* Network graph */}
        <Section id="network" title="TORI Network">
          <ToriNetworkGraph onViewThread={handleOpenThread} />
        </Section>

        {/* Reflection depth bands */}
        <Section id="depth" title="Reflection Depth">
          <DepthBands onOpenStudent={handleOpenStudent} />
        </Section>

        {/* Student engagement table */}
        <Section id="engagement-table" title="Student Engagement">
          <StudentEngagementTable
            onOpenStudent={handleOpenStudent}
            onViewThread={handleOpenThread}
          />
        </Section>

        {/* Student growth over time */}
        <Section id="growth" title="Student Growth Over Time">
          <GrowthVisualization onOpenStudent={handleOpenStudent} />
        </Section>

        {/* Co-occurrence patterns */}
        <Section id="cooccurrence" title="Co-Occurrence Patterns">
          <CoOccurrenceList />
        </Section>
      </Box>
    </Box>
  );
}
