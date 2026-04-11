import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
  CircularProgress,
  Alert,
  Box,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { REQUEST_EXPORT } from "@/lib/queries/export";
import { GET_COURSES } from "@/lib/queries/analytics";
import ReportPreview from "./ReportPreview";
import { renderCourseReportPdf } from "./renderPdfBlob";
import type { CourseReport } from "./types";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  defaultCourseId?: string;
  institutionId: string;
  /** Pre-select a format when the dialog opens */
  defaultFormat?: "CSV" | "PDF";
}

/**
 * Trigger a browser download from a URL (data URL or object URL)
 * by creating a temporary link and clicking it programmatically.
 */
function downloadFromUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function ExportDialog({
  open,
  onClose,
  defaultCourseId,
  institutionId,
  defaultFormat = "CSV",
}: ExportDialogProps) {
  const [format, setFormat] = useState<"CSV" | "PDF">(defaultFormat);
  const [courseId, setCourseId] = useState<string>(defaultCourseId ?? "");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // PDF-specific state: holds the decoded report data while we render
  const [pdfReportData, setPdfReportData] = useState<CourseReport | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Track the course name for download filenames
  const courseNameRef = useRef("report");

  // Sync format when the dialog opens with a different defaultFormat
  useEffect(() => {
    if (open) {
      setFormat(defaultFormat);
      setDownloadUrl(null);
      setPdfError(null);
      setPdfReportData(null);
    }
  }, [open, defaultFormat]);

  // Fetch the list of courses for the dropdown
  const { data: coursesData, loading: coursesLoading } = useQuery<any>(
    GET_COURSES,
    {
      variables: { institutionId },
      skip: !institutionId,
    }
  );

  const courses: Array<{ id: string; name: string }> =
    coursesData?.courses ?? [];

  // Keep courseNameRef in sync with the selected course
  useEffect(() => {
    const match = courses.find((c) => c.id === courseId);
    courseNameRef.current = match?.name ?? "report";
  }, [courseId, courses]);

  // The export mutation
  const [requestExport, { loading: exporting, error }] = useMutation<any>(
    REQUEST_EXPORT,
    {
      onCompleted(data: any) {
        const result = data.requestExport;
        if (result.status !== "COMPLETE" || !result.downloadUrl) return;

        if (result.format === "CSV") {
          // CSV — trigger an immediate browser download
          setDownloadUrl(result.downloadUrl);
          downloadFromUrl(
            result.downloadUrl,
            `${courseNameRef.current}-export.csv`
          );
        } else {
          // PDF — decode the JSON payload and kick off client-side rendering
          try {
            const base64 = result.downloadUrl.split(",")[1];
            const json = atob(base64);
            const reportData: CourseReport = JSON.parse(json);
            setPdfReportData(reportData);
          } catch {
            setPdfError("Failed to decode report data from server.");
          }
        }
      },
    }
  );

  // When pdfReportData is set, render the PDF blob and trigger download
  useEffect(() => {
    if (!pdfReportData) return;

    let cancelled = false;
    setPdfGenerating(true);
    setPdfError(null);

    renderCourseReportPdf(pdfReportData)
      .then((blob) => {
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        downloadFromUrl(url, `${courseNameRef.current}-report.pdf`);

        // Store the URL so the user can re-download
        setDownloadUrl(url);
        setPdfGenerating(false);
        setPdfReportData(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPdfError(
          err instanceof Error ? err.message : "PDF rendering failed."
        );
        setPdfGenerating(false);
        setPdfReportData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfReportData]);

  const handleGenerate = () => {
    setDownloadUrl(null);
    setPdfError(null);
    setPdfReportData(null);
    requestExport({
      variables: {
        scope: { institutionId, courseId: courseId || undefined },
        format,
      },
    });
  };

  const handleClose = () => {
    // Clean up object URLs to prevent memory leaks
    if (downloadUrl && downloadUrl.startsWith("blob:")) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setPdfError(null);
    setPdfReportData(null);
    onClose();
  };

  // Are we waiting for something? Server call OR client-side PDF rendering
  const isWorking = exporting || pdfGenerating;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Generate Export</DialogTitle>
      <DialogContent>
        {/* Format picker */}
        <FormControl sx={{ mt: 1, mb: 2 }}>
          <FormLabel>Format</FormLabel>
          <RadioGroup
            row
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as "CSV" | "PDF");
              setDownloadUrl(null);
              setPdfError(null);
            }}
          >
            <FormControlLabel
              value="PDF"
              control={<Radio />}
              label="PDF Report"
            />
            <FormControlLabel
              value="CSV"
              control={<Radio />}
              label="CSV Data"
            />
          </RadioGroup>
        </FormControl>

        {/* Course selector */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="export-course-label">Course</InputLabel>
          <Select
            labelId="export-course-label"
            label="Course"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setDownloadUrl(null);
              setPdfError(null);
            }}
            disabled={coursesLoading}
          >
            {coursesLoading && (
              <MenuItem value="">
                <em>Loading courses...</em>
              </MenuItem>
            )}
            {courses.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Preview of what will be exported */}
        <ReportPreview courseId={courseId || null} format={format} />

        {/* Error messages */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error.message}
          </Alert>
        )}
        {pdfError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {pdfError}
          </Alert>
        )}

        {/* PDF rendering progress */}
        {pdfGenerating && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Rendering PDF...
            </Typography>
          </Box>
        )}

        {/* Success + download link */}
        {downloadUrl && !pdfGenerating && (
          <Alert
            severity="success"
            sx={{ mt: 2 }}
            action={
              <Button
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() =>
                  downloadFromUrl(
                    downloadUrl,
                    `${courseNameRef.current}.${format === "CSV" ? "csv" : "pdf"}`
                  )
                }
              >
                Download
              </Button>
            }
          >
            Export ready!
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={!courseId || isWorking}
          startIcon={
            isWorking ? (
              <CircularProgress size={18} color="inherit" />
            ) : undefined
          }
        >
          {exporting
            ? "Fetching data..."
            : pdfGenerating
              ? "Rendering PDF..."
              : "Generate"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
