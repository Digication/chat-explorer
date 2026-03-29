import { useQuery } from "@apollo/client/react";
import { Box, Typography, Skeleton, Alert } from "@mui/material";
import { GET_OVERVIEW, GET_MY_INSTITUTION } from "@/lib/queries/analytics";

interface ReportPreviewProps {
  courseId: string | null;
  format: string;
}

/**
 * Compact preview showing what data will be included in the export.
 * Queries the overview stats for the selected course so the user
 * can see student count, comment count, and date range at a glance.
 */
export default function ReportPreview({ courseId, format }: ReportPreviewProps) {
  // We need the institution ID to build the analytics scope
  const { data: instData } = useQuery<any>(GET_MY_INSTITUTION);
  const institutionId = instData?.myInstitution?.id;

  const { data, loading, error } = useQuery<any>(GET_OVERVIEW, {
    variables: {
      scope: { institutionId, courseId },
    },
    // Only run when we have both IDs
    skip: !courseId || !institutionId,
  });

  if (!courseId) {
    return (
      <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
        Select a course to see a preview of what will be exported.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box sx={{ mt: 1 }}>
        <Skeleton width="60%" />
        <Skeleton width="40%" />
        <Skeleton width="50%" />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
        Unable to load preview: {error.message}
      </Alert>
    );
  }

  const overview = data?.overview?.data;
  if (!overview) return null;

  const earliest = overview.dateRange?.earliest
    ? new Date(overview.dateRange.earliest).toLocaleDateString()
    : "N/A";
  const latest = overview.dateRange?.latest
    ? new Date(overview.dateRange.latest).toLocaleDateString()
    : "N/A";

  return (
    <Box
      sx={{
        mt: 1,
        p: 2,
        borderRadius: 1,
        bgcolor: "action.hover",
      }}
    >
      <Typography variant="subtitle2" gutterBottom>
        Export preview
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {overview.participantCount} students &middot;{" "}
        {overview.totalComments} comments &middot;{" "}
        {overview.threadCount} threads
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Date range: {earliest} &ndash; {latest}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {format === "CSV"
          ? "All comment rows with TORI tags, word counts, and timestamps."
          : "TORI patterns, depth bands, and co-occurrence analysis."}
      </Typography>
    </Box>
  );
}
