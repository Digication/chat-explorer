import React, { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import SmartRecommendations from "@/components/insights/SmartRecommendations";
import MetricsCards from "@/components/insights/MetricsCards";
import HeatmapView from "@/components/insights/HeatmapView";
import ToriNetworkGraph from "@/components/insights/ToriNetworkGraph";
import DepthBands from "@/components/insights/DepthBands";
import CoOccurrenceList from "@/components/insights/CoOccurrenceList";
import TextSignals from "@/components/insights/TextSignals";
import ToriTagFrequencies from "@/components/insights/ToriTagFrequencies";
import StudentEngagementTable from "@/components/insights/StudentEngagementTable";
import ThreadPanel from "@/components/insights/ThreadPanel";

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
  const [openThread, setOpenThread] = useState<{
    threadId: string;
    studentName: string;
  } | null>(null);

  const handleViewThread = useCallback((threadId: string, studentName: string) => {
    setOpenThread({ threadId, studentName });
  }, []);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", p: 4 }}>
      {/* Main insights content — shifts left when panel is open */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          maxWidth: openThread
            ? { xs: "100%", md: "calc(100% - 420px)" }
            : 1200,
          mx: openThread ? 0 : "auto",
          py: 4,
          px: 2,
          transition: "max-width 0.3s ease, margin 0.3s ease",
        }}
      >
        {/* Smart recommendations (top of page) */}
        <SmartRecommendations />

        {/* Overview metric cards */}
        <MetricsCards onViewThread={handleViewThread} />

        {/* Text signal aggregates */}
        <Section id="text-signals" title="Text Signals">
          <TextSignals />
        </Section>

        {/* Heatmap — with drill-down */}
        <Section id="heatmap" title="Reflection Heatmap">
          <HeatmapView onViewThread={handleViewThread} />
        </Section>

        {/* TORI tag frequency bars */}
        <Section id="tori-frequencies" title="TORI Tag Frequencies">
          <ToriTagFrequencies />
        </Section>

        {/* Network graph */}
        <Section id="network" title="TORI Network">
          <ToriNetworkGraph />
        </Section>

        {/* Student engagement table */}
        <Section id="engagement-table" title="Student Engagement">
          <StudentEngagementTable />
        </Section>

        {/* Depth bands */}
        <Section id="depth" title="Reflection Depth">
          <DepthBands onViewThread={handleViewThread} />
        </Section>

        {/* Co-occurrence patterns */}
        <Section id="cooccurrence" title="Co-Occurrence Patterns">
          <CoOccurrenceList />
        </Section>
      </Box>

      {/* Slide-in thread panel */}
      {openThread && (
        <ThreadPanel
          threadId={openThread.threadId}
          studentName={openThread.studentName}
          onClose={() => setOpenThread(null)}
        />
      )}
    </Box>
  );
}
