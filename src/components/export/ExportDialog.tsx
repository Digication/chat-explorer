import { useState } from "react";
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

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  defaultCourseId?: string;
  institutionId: string;
  /** Pre-select a format when the dialog opens */
  defaultFormat?: "CSV" | "PDF";
}

/**
 * Trigger a browser download from a data URL by creating a temporary link
 * and clicking it programmatically.
 */
function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
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

  // Fetch the list of courses for the dropdown
  const { data: coursesData, loading: coursesLoading } = useQuery<any>(GET_COURSES, {
    variables: { institutionId },
    skip: !institutionId,
  });

  const courses: Array<{ id: string; name: string }> =
    coursesData?.courses ?? [];

  // The export mutation
  const [requestExport, { loading: exporting, error }] = useMutation<any>(
    REQUEST_EXPORT,
    {
      onCompleted(data: any) {
        const result = data.requestExport;
        if (result.status === "COMPLETE" && result.downloadUrl) {
          setDownloadUrl(result.downloadUrl);

          // For CSV, trigger an automatic browser download
          if (result.format === "CSV") {
            const courseName =
              courses.find((c) => c.id === courseId)?.name ?? "export";
            downloadDataUrl(result.downloadUrl, `${courseName}-export.csv`);
          }
        }
      },
    }
  );

  const handleGenerate = () => {
    setDownloadUrl(null);
    requestExport({
      variables: {
        scope: { institutionId, courseId: courseId || undefined },
        format,
      },
    });
  };

  const handleClose = () => {
    // Reset state when closing
    setDownloadUrl(null);
    onClose();
  };

  const courseName =
    courses.find((c) => c.id === courseId)?.name ?? "report";

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
            }}
          >
            <FormControlLabel value="PDF" control={<Radio />} label="PDF Report" />
            <FormControlLabel value="CSV" control={<Radio />} label="CSV Data" />
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

        {/* Error message */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error.message}
          </Alert>
        )}

        {/* Success + download link */}
        {downloadUrl && (
          <Alert
            severity="success"
            sx={{ mt: 2 }}
            action={
              <Button
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() =>
                  downloadDataUrl(
                    downloadUrl,
                    `${courseName}.${format === "CSV" ? "csv" : "json"}`
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
          disabled={!courseId || exporting}
          startIcon={
            exporting ? <CircularProgress size={18} color="inherit" /> : undefined
          }
        >
          {exporting ? "Generating..." : "Generate"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
