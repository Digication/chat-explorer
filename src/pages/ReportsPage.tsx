import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  CircularProgress,
  Alert,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import SummarizeIcon from "@mui/icons-material/Summarize";
import { GET_ME, GET_INSTITUTIONS } from "@/lib/queries/analytics";
import ExportDialog from "@/components/export/ExportDialog";

/** Describes one type of report available on this page. */
interface ReportType {
  title: string;
  description: string;
  icon: React.ReactNode;
  format: "PDF" | "CSV";
}

const REPORT_TYPES: ReportType[] = [
  {
    title: "Course Analytics Report",
    description:
      "Overview of TORI patterns, depth bands, and engagement metrics for a course.",
    icon: <PictureAsPdfIcon sx={{ fontSize: 40, color: "error.main" }} />,
    format: "PDF",
  },
  {
    title: "Raw Data Export",
    description:
      "Download all comments and TORI tags as a spreadsheet-ready CSV file.",
    icon: <TableChartIcon sx={{ fontSize: 40, color: "success.main" }} />,
    format: "CSV",
  },
  {
    title: "TORI Summary",
    description:
      "Tag frequency breakdown showing how often each TORI category appears.",
    icon: <SummarizeIcon sx={{ fontSize: 40, color: "info.main" }} />,
    format: "CSV",
  },
];

export default function ReportsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<"PDF" | "CSV">("CSV");

  // Fetch the current user to get their role and institutionId
  const { data: meData, loading: meLoading, error: meError } = useQuery<any>(GET_ME);
  const role = meData?.me?.role;
  const userInstitutionId: string | undefined = meData?.me?.institutionId;
  const isDigicationAdmin = role === "digication_admin";

  // For digication_admin: fetch all institutions and use the first as default
  const { data: instData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: !isDigicationAdmin,
  });

  // Determine which institutionId to use for the export dialog
  const institutionId = isDigicationAdmin
    ? instData?.institutions?.[0]?.id
    : userInstitutionId;

  const handleGenerate = (format: "PDF" | "CSV") => {
    setSelectedFormat(format);
    setDialogOpen(true);
  };

  if (meLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (meError) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load user data: {meError.message}
      </Alert>
    );
  }

  if (!institutionId) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        No institution found. Upload a CSV file first to create an institution, or contact an administrator.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        Reports
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Generate PDF reports or download raw data as CSV.
      </Typography>

      <Grid container spacing={3}>
        {REPORT_TYPES.map((report) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={report.title}>
            <Card
              variant="outlined"
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <CardContent sx={{ flex: 1 }}>
                <Box sx={{ mb: 2 }}>{report.icon}</Box>
                <Typography variant="h6" gutterBottom>
                  {report.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {report.description}
                </Typography>
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => handleGenerate(report.format)}
                >
                  Generate
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Export dialog — shared by all report types */}
      <ExportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        institutionId={institutionId}
        defaultFormat={selectedFormat}
      />
    </Box>
  );
}
